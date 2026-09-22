// The one picture the whole engine reports from.
//
// A DPR knows what was done yesterday. A schedule knows when it was meant to
// be done. A BOQ knows what it is worth. Individually none of them can answer
// "are we late, and by how much" — so this module reconciles all three into a
// single set of activities with a weight, a planned position, an actual
// position and a forecast, and everything downstream reads only that.
//
// Where the three disagree, the rule is always the same: measured quantity
// beats a typed percentage, and a stated percentage beats an assumption.
import {
  addDays, asDate, daysBetween, eachDay, isoDay, maxDate, minDate, startOfDay,
} from '../dates.js';
import { criticalPath, parsePredecessors } from './cpm.js';

const key = (value) => String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');

function clamp(value, low = 0, high = 1) {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return Math.min(high, Math.max(low, value));
}

function sum(values) {
  return values.reduce((total, value) => total + (Number.isFinite(value) ? value : 0), 0);
}

/** An activity is identified by its WBS id when it has one, by name otherwise. */
function activityKey(record) {
  const id = key(record.wbsId);
  if (id) return `w:${id}`;
  return `n:${key(record.activity ?? record.description ?? record.name)}|${key(record.area)}`;
}

/** The same, but tolerant: used to attach a DPR row to a scheduled activity. */
function matchKeys(record) {
  const keys = [];
  if (key(record.wbsId)) keys.push(`w:${key(record.wbsId)}`);
  const name = key(record.activity ?? record.description ?? record.name);
  if (name) {
    keys.push(`n:${name}|${key(record.area)}`);
    keys.push(`n:${name}|`);
  }
  return keys;
}

// ------------------------------------------------------------ BOQ weighting

function boqValues(boq = []) {
  const byWbs = new Map();
  const byName = new Map();
  for (const item of boq) {
    const amount = Number.isFinite(item.amount)
      ? item.amount
      : (Number.isFinite(item.qty) && Number.isFinite(item.rate) ? item.qty * item.rate : null);
    if (!Number.isFinite(amount)) continue;
    const wbs = key(item.wbsId) || key(item.itemCode);
    if (wbs) byWbs.set(`w:${wbs}`, (byWbs.get(`w:${wbs}`) ?? 0) + amount);
    const name = key(item.description);
    if (name) byName.set(name, (byName.get(name) ?? 0) + amount);
  }
  return { byWbs, byName };
}

function boqQuantities(boq = []) {
  const byWbs = new Map();
  const byName = new Map();
  for (const item of boq) {
    if (!Number.isFinite(item.qty)) continue;
    const wbs = key(item.wbsId) || key(item.itemCode);
    if (wbs) byWbs.set(`w:${wbs}`, (byWbs.get(`w:${wbs}`) ?? 0) + item.qty);
    const name = key(item.description);
    if (name) byName.set(name, (byName.get(name) ?? 0) + item.qty);
  }
  return { byWbs, byName };
}

// ------------------------------------------------------------ DPR roll-up

/**
 * Collapse the daily record into, per activity, a cumulative quantity by day.
 *
 * Both conventions are handled: sites that report a "cumulative to date"
 * column, and sites that only report the day's quantity. Where both exist the
 * cumulative column wins, because it is the one the client's own engineer
 * reconciles against the bill.
 */
function dprByActivity(dpr = []) {
  const groups = new Map();
  for (const row of dpr) {
    const date = startOfDay(row.date);
    if (!date) continue;
    const id = activityKey(row);
    if (!groups.has(id)) {
      groups.set(id, {
        id,
        keys: new Set(matchKeys(row)),
        name: row.activity ?? null,
        area: row.area ?? null,
        unit: row.unit ?? null,
        wbsId: row.wbsId ?? null,
        scopeQty: null,
        days: new Map(),
      });
    }
    const group = groups.get(id);
    for (const candidate of matchKeys(row)) group.keys.add(candidate);
    if (!group.name && row.activity) group.name = row.activity;
    if (!group.area && row.area) group.area = row.area;
    if (!group.unit && row.unit) group.unit = row.unit;
    if (Number.isFinite(row.scopeQty)) group.scopeQty = Math.max(group.scopeQty ?? 0, row.scopeQty);

    const stamp = isoDay(date);
    const day = group.days.get(stamp) ?? {
      date, actual: 0, planned: 0, cumulative: null, manpower: 0, manpowerPlanned: 0, equipment: 0, equipmentPlanned: 0, rows: 0,
    };
    day.actual += Number.isFinite(row.actualQty) ? row.actualQty : 0;
    day.planned += Number.isFinite(row.plannedQty) ? row.plannedQty : 0;
    if (Number.isFinite(row.cumulativeQty)) day.cumulative = Math.max(day.cumulative ?? 0, row.cumulativeQty);
    day.manpower += Number.isFinite(row.manpowerActual) ? row.manpowerActual : 0;
    day.manpowerPlanned += Number.isFinite(row.manpowerPlanned) ? row.manpowerPlanned : 0;
    day.equipment += Number.isFinite(row.equipmentActual) ? row.equipmentActual : 0;
    day.equipmentPlanned += Number.isFinite(row.equipmentPlanned) ? row.equipmentPlanned : 0;
    day.rows += 1;
    group.days.set(stamp, day);
  }

  for (const group of groups.values()) {
    const ordered = [...group.days.values()].sort((a, b) => a.date - b.date);
    let running = 0;
    for (const day of ordered) {
      running += day.actual;
      // A cumulative column that goes backwards is a typo, not a reversal.
      day.cumulativeResolved = Number.isFinite(day.cumulative) ? Math.max(day.cumulative, 0) : running;
      if (Number.isFinite(day.cumulative)) running = Math.max(running, day.cumulative);
    }
    group.ordered = ordered;
    // The cumulative column wins where the site reports one — including for
    // the total. Summing the daily column as well would double-count, and on
    // a lump-sum line it pushes the activity past 100% of its own scope.
    group.totalActual = ordered.length ? ordered[ordered.length - 1].cumulativeResolved : 0;
    group.firstProgress = ordered.find((day) => day.actual > 0)?.date ?? null;
    group.lastProgress = [...ordered].reverse().find((day) => day.actual > 0)?.date ?? null;
  }
  return groups;
}

// ---------------------------------------------------------------- activities

function baselinePercentAt(activity, date) {
  const start = activity.baselineStart;
  const finish = activity.baselineFinish;
  if (!finish) return null;
  const on = startOfDay(date);
  if (!start) return on >= finish ? 1 : 0;
  if (on < start) return 0;
  if (on >= finish) return 1;
  const span = Math.max(daysBetween(start, finish) + 1, 1);
  // A milestone has no duration to spread across: it is done or it is not.
  if (span <= 1) return on >= finish ? 1 : 0;
  return clamp((daysBetween(start, on) + 1) / span);
}

function actualPercentAt(activity, date) {
  const progress = activity._progress;
  if (!progress) {
    // No daily record — fall back to the stated percentage, but only once the
    // activity was due to have started, so history is not back-filled.
    if (!Number.isFinite(activity.percentComplete)) return 0;
    const on = startOfDay(date);
    if (activity.actualFinish && on >= activity.actualFinish) return activity.percentComplete;
    if (activity.asOf && on >= activity.asOf) return activity.percentComplete;
    return null; // unknown: the series layer holds the last known value
  }
  const on = startOfDay(date);
  let latest = 0;
  for (const day of progress.ordered) {
    if (day.date > on) break;
    latest = day.cumulativeResolved;
  }
  if (!Number.isFinite(activity.scopeQty) || activity.scopeQty <= 0) {
    return activity.actualFinish && on >= activity.actualFinish ? 1 : null;
  }
  return clamp(latest / activity.scopeQty);
}

/** Quantity per day over the trailing window, used to forecast the finish. */
function productivity(progress, asOf, window = 28) {
  if (!progress?.ordered?.length) return null;
  const from = addDays(asOf, -window);
  const recent = progress.ordered.filter((day) => day.date > from && day.date <= asOf && day.actual > 0);
  if (recent.length >= 2) return sum(recent.map((day) => day.actual)) / recent.length;
  const all = progress.ordered.filter((day) => day.actual > 0);
  if (!all.length) return null;
  return sum(all.map((day) => day.actual)) / all.length;
}

function buildActivities(data, asOf, project) {
  const progressGroups = dprByActivity(data.dpr);
  const values = boqValues(data.boq);
  const quantities = boqQuantities(data.boq);
  const schedule = data.schedule ?? [];

  const progressByKey = new Map();
  for (const group of progressGroups.values()) {
    for (const candidate of group.keys) if (!progressByKey.has(candidate)) progressByKey.set(candidate, group);
  }

  const activities = [];
  const claimed = new Set();

  const fromSchedule = schedule.map((row) => {
    const id = activityKey(row);
    const candidates = matchKeys(row);
    const progress = candidates.map((candidate) => progressByKey.get(candidate)).find(Boolean) ?? null;
    if (progress) claimed.add(progress.id);
    return { id, row, progress, candidates };
  });

  const orphans = [...progressGroups.values()].filter((group) => !claimed.has(group.id));

  const seeds = [
    ...fromSchedule.map(({ id, row, progress, candidates }) => ({ id, row, progress, candidates, scheduled: true })),
    // Work that is being reported but is not in the programme is not noise —
    // it is a finding, and the report says so.
    ...orphans.map((group) => ({
      id: group.id,
      row: { wbsId: group.wbsId, activity: group.name, area: group.area, unit: group.unit },
      progress: group,
      candidates: [...group.keys],
      scheduled: false,
    })),
  ];

  for (const seed of seeds) {
    const { row, progress, candidates } = seed;
    const boqValue = candidates.map((candidate) => values.byWbs.get(candidate)).find(Number.isFinite)
      ?? values.byName.get(key(row.activity)) ?? null;
    const boqQty = candidates.map((candidate) => quantities.byWbs.get(candidate)).find(Number.isFinite)
      ?? quantities.byName.get(key(row.activity)) ?? null;

    const scopeQty = [row.scopeQty, boqQty, progress?.scopeQty].find(Number.isFinite)
      ?? (progress && Number.isFinite(progress.totalActual) && progress.totalActual > 0 && Number.isFinite(row.actualPct) && row.actualPct > 0
        ? progress.totalActual / row.actualPct
        : null);

    const baselineStart = startOfDay(asDate(row.baselineStart));
    const baselineFinish = startOfDay(asDate(row.baselineFinish));
    const duration = Number.isFinite(row.duration)
      ? row.duration
      : (baselineStart && baselineFinish ? daysBetween(baselineStart, baselineFinish) + 1 : null);

    const actualStart = startOfDay(asDate(row.actualStart)) ?? progress?.firstProgress ?? null;
    const statedPct = clamp(row.actualPct);
    const measuredPct = progress && Number.isFinite(scopeQty) && scopeQty > 0
      ? clamp(progress.totalActual / scopeQty)
      : null;
    const percentComplete = measuredPct ?? statedPct ?? (row.actualFinish ? 1 : 0);

    let actualFinish = startOfDay(asDate(row.actualFinish));
    if (!actualFinish && percentComplete >= 0.9995) actualFinish = progress?.lastProgress ?? startOfDay(asOf);

    const activity = {
      id: seed.id,
      wbsId: row.wbsId ?? null,
      name: row.activity ?? row.description ?? '(unnamed activity)',
      area: row.area ?? progress?.area ?? 'Unassigned',
      unit: row.unit ?? progress?.unit ?? null,
      scheduled: seed.scheduled,
      parentId: row.parentId ?? null,
      level: row.level ?? null,
      owner: row.owner ?? null,
      predecessors: row.predecessors ?? null,
      isMilestone: row.isMilestone === true || duration === 0,
      scopeQty: Number.isFinite(scopeQty) ? scopeQty : null,
      doneQty: progress?.totalActual ?? null,
      baselineStart,
      baselineFinish,
      duration,
      actualStart,
      actualFinish,
      percentComplete,
      percentSource: measuredPct !== null ? 'measured' : (statedPct !== null ? 'stated' : 'assumed'),
      value: Number.isFinite(boqValue) ? boqValue : (Number.isFinite(row.value) ? row.value : null),
      weightHint: Number.isFinite(row.weight) ? row.weight : null,
      statedFloat: Number.isFinite(row.totalFloat) ? row.totalFloat : null,
      lastProgressDate: progress?.lastProgress ?? null,
      daysSinceProgress: progress?.lastProgress ? daysBetween(progress.lastProgress, asOf) : null,
      hasDailyRecord: Boolean(progress),
      asOf: startOfDay(asOf),
      _progress: progress,
    };

    activity.complete = activity.percentComplete >= 0.9995;
    activity.started = Boolean(activity.actualStart) || activity.percentComplete > 0;
    activity.plannedPercent = baselinePercentAt(activity, asOf) ?? 0;
    activity.variancePercent = activity.percentComplete - activity.plannedPercent;

    // Forecast: measured productivity first, remaining duration second.
    const rate = productivity(progress, asOf);
    const remainingQty = Number.isFinite(activity.scopeQty) && Number.isFinite(activity.doneQty)
      ? Math.max(activity.scopeQty - activity.doneQty, 0)
      : null;
    let forecastFinish = activity.actualFinish;
    let forecastBasis = 'actual';

    if (!forecastFinish) {
      const from = maxDate(startOfDay(asOf), activity.lastProgressDate) ?? startOfDay(asOf);
      if (rate && rate > 0 && Number.isFinite(remainingQty)) {
        forecastFinish = addDays(from, Math.ceil(remainingQty / rate));
        forecastBasis = 'productivity';
      } else if (Number.isFinite(duration) && duration > 0) {
        const remainingDuration = Math.ceil(duration * (1 - activity.percentComplete));
        const start = activity.started ? from : maxDate(from, baselineStart) ?? from;
        forecastFinish = addDays(start, Math.max(remainingDuration - 1, 0));
        forecastBasis = 'remaining duration';
      } else {
        forecastFinish = maxDate(baselineFinish, startOfDay(asOf));
        forecastBasis = 'baseline';
      }
    }

    activity.forecastFinish = forecastFinish;
    activity.forecastBasis = forecastBasis;
    activity.productivity = rate;
    activity.remainingQty = remainingQty;
    activity.remainingDuration = activity.complete
      ? 0
      : (Number.isFinite(duration) ? Math.max(Math.ceil(duration * (1 - activity.percentComplete)), 1) : 1);
    activity.slippageDays = baselineFinish && forecastFinish ? daysBetween(baselineFinish, forecastFinish) : null;
    activity.startSlippageDays = baselineStart && activity.actualStart ? daysBetween(baselineStart, activity.actualStart) : null;

    activity.status = activity.complete
      ? 'Complete'
      : activity.started
        ? (activity.variancePercent < -0.1 ? 'Behind' : activity.variancePercent > 0.02 ? 'Ahead' : 'On track')
        : (baselineStart && startOfDay(asOf) > baselineStart ? 'Not started (overdue)' : 'Not started');

    activities.push(activity);
  }

  assignWeights(activities, project);
  return activities;
}

/**
 * Weighting decides what "70% complete" means.
 *
 * Value is the only defensible basis, so the BOQ is used wherever it reaches.
 * Where it does not, the schedule's own weightage is honoured, then duration,
 * and only as a last resort is every activity treated as equal — and the model
 * records which basis was used so the report can say so.
 */
function assignWeights(activities, project) {
  const live = activities.filter((activity) => !activity.isMilestone || activity.value);
  const totalValue = sum(live.map((activity) => activity.value ?? 0));
  const totalHint = sum(live.map((activity) => activity.weightHint ?? 0));
  const contractValue = Number.isFinite(project?.contractValue) ? project.contractValue : null;

  let basis;
  if (totalValue > 0 && live.filter((activity) => Number.isFinite(activity.value)).length >= live.length * 0.6) basis = 'value';
  else if (totalHint > 0) basis = 'weightage';
  else if (live.some((activity) => Number.isFinite(activity.duration) && activity.duration > 0)) basis = 'duration';
  else basis = 'equal';

  const denominator = {
    value: totalValue,
    weightage: totalHint,
    duration: sum(live.map((activity) => activity.duration ?? 0)),
    equal: live.length,
  }[basis] || 1;

  for (const activity of activities) {
    const raw = {
      value: activity.value ?? 0,
      weightage: activity.weightHint ?? 0,
      duration: activity.duration ?? 0,
      equal: 1,
    }[basis];
    activity.weight = live.includes(activity) ? raw / denominator : 0;
    activity.weightBasis = basis;
    activity.plannedValue = contractValue && basis === 'value' && totalValue
      ? (activity.value ?? 0)
      : (contractValue ?? totalValue) * activity.weight;
  }
  return basis;
}

// -------------------------------------------------------------------- series

/**
 * The S-curve: cumulative planned, actual and forecast as a percentage of the
 * whole project, one point per day.
 */
function buildSeries(activities, { from, to, asOf, forecastTo }) {
  const days = eachDay(from, to);
  const points = [];
  const lastKnown = new Map();

  for (const day of days) {
    let planned = 0;
    let actual = 0;
    for (const activity of activities) {
      if (!activity.weight) continue;
      planned += activity.weight * (baselinePercentAt(activity, day) ?? 0);
      const measured = actualPercentAt(activity, day);
      // An activity with no record for a given day has not gone backwards; it
      // holds its last known position, which is what a cumulative curve means.
      const value = measured === null ? (lastKnown.get(activity.id) ?? 0) : measured;
      lastKnown.set(activity.id, value);
      actual += activity.weight * value;
    }
    points.push({
      date: day,
      planned: Number(planned.toFixed(5)),
      actual: day <= startOfDay(asOf) ? Number(actual.toFixed(5)) : null,
    });
  }

  // Forecast continues past the data date: every activity finishes on its own
  // forecast date, spread linearly from where it stands today.
  if (forecastTo) {
    const horizon = eachDay(addDays(asOf, 1), forecastTo);
    const today = points.find((point) => +point.date === +startOfDay(asOf))?.actual ?? 0;
    for (const day of horizon) {
      let forecast = 0;
      let planned = 0;
      for (const activity of activities) {
        if (!activity.weight) continue;
        planned += activity.weight * (baselinePercentAt(activity, day) ?? 0);
        if (activity.complete) {
          forecast += activity.weight;
          continue;
        }
        const finish = activity.forecastFinish;
        if (!finish) {
          forecast += activity.weight * activity.percentComplete;
          continue;
        }
        const remaining = Math.max(daysBetween(asOf, finish), 1);
        const elapsed = clamp(daysBetween(asOf, day) / remaining) ?? 1;
        forecast += activity.weight * (activity.percentComplete + (1 - activity.percentComplete) * elapsed);
      }
      points.push({ date: day, planned: Number(planned.toFixed(5)), actual: null, forecast: Number(forecast.toFixed(5)) });
    }
    // Anchor the forecast line to today so the two curves meet on the chart.
    const anchor = points.find((point) => +point.date === +startOfDay(asOf));
    if (anchor) anchor.forecast = today;
  }

  return points;
}

// --------------------------------------------------------------------- areas

function rollUpAreas(activities, asOf) {
  const areas = new Map();
  for (const activity of activities) {
    const name = activity.area || 'Unassigned';
    if (!areas.has(name)) {
      areas.set(name, {
        name, weight: 0, planned: 0, actual: 0, value: 0, activities: [],
        complete: 0, behind: 0, notStarted: 0, slippageDays: null,
      });
    }
    const area = areas.get(name);
    area.weight += activity.weight;
    area.planned += activity.weight * activity.plannedPercent;
    area.actual += activity.weight * activity.percentComplete;
    area.value += activity.value ?? 0;
    area.activities.push(activity);
    if (activity.complete) area.complete += 1;
    else if (activity.status === 'Behind') area.behind += 1;
    if (!activity.started) area.notStarted += 1;
  }

  return [...areas.values()].map((area) => {
    const slips = area.activities.map((activity) => activity.slippageDays).filter(Number.isFinite);
    const finishes = area.activities.map((activity) => activity.forecastFinish).filter(Boolean);
    const baselines = area.activities.map((activity) => activity.baselineFinish).filter(Boolean);
    return {
      ...area,
      activityCount: area.activities.length,
      plannedPercent: area.weight ? area.planned / area.weight : 0,
      actualPercent: area.weight ? area.actual / area.weight : 0,
      variancePercent: area.weight ? (area.actual - area.planned) / area.weight : 0,
      worstSlippageDays: slips.length ? Math.max(...slips) : null,
      forecastFinish: finishes.length ? maxDate(...finishes) : null,
      baselineFinish: baselines.length ? maxDate(...baselines) : null,
      asOf: startOfDay(asOf),
    };
  }).sort((a, b) => b.weight - a.weight);
}

// ----------------------------------------------------------------- resources

function resourceSeries(data, asOf) {
  const days = new Map();
  const touch = (date) => {
    const stamp = isoDay(date);
    if (!stamp) return null;
    if (!days.has(stamp)) {
      days.set(stamp, { date: startOfDay(date), manpowerPlanned: 0, manpowerActual: 0, equipmentPlanned: 0, equipmentActual: 0, equipmentIdle: 0 });
    }
    return days.get(stamp);
  };

  for (const row of data.dpr ?? []) {
    const day = touch(row.date);
    if (!day) continue;
    day.manpowerActual += Number.isFinite(row.manpowerActual) ? row.manpowerActual : 0;
    day.manpowerPlanned += Number.isFinite(row.manpowerPlanned) ? row.manpowerPlanned : 0;
    day.equipmentActual += Number.isFinite(row.equipmentActual) ? row.equipmentActual : 0;
    day.equipmentPlanned += Number.isFinite(row.equipmentPlanned) ? row.equipmentPlanned : 0;
  }
  for (const row of data.manpower ?? []) {
    const day = touch(row.date);
    if (!day) continue;
    day.manpowerActual += Number.isFinite(row.actual) ? row.actual : 0;
    day.manpowerPlanned += Number.isFinite(row.planned) ? row.planned : 0;
  }
  for (const row of data.equipment ?? []) {
    const day = touch(row.date);
    if (!day) continue;
    day.equipmentActual += Number.isFinite(row.actual) ? row.actual : 0;
    day.equipmentPlanned += Number.isFinite(row.planned) ? row.planned : 0;
    day.equipmentIdle += Number.isFinite(row.idle) ? row.idle : 0;
  }

  return [...days.values()].filter((day) => day.date <= startOfDay(asOf)).sort((a, b) => a.date - b.date);
}

/** Which days the site actually reported, and which it did not. */
function reportingCoverage(data, from, asOf) {
  const reported = new Set((data.dpr ?? []).map((row) => isoDay(row.date)).filter(Boolean));
  const first = minDate(...(data.dpr ?? []).map((row) => row.date).filter(Boolean));
  const start = maxDate(from, first) ?? first;
  if (!start) return { reportedDays: 0, expectedDays: 0, gaps: [], coverage: null, lastReported: null };

  const gaps = [];
  let run = null;
  for (const day of eachDay(start, asOf)) {
    if (reported.has(isoDay(day))) {
      if (run) {
        gaps.push(run);
        run = null;
      }
    } else if (run) run.to = day;
    else run = { from: day, to: day };
  }
  if (run) gaps.push(run);

  const expected = eachDay(start, asOf).length;
  return {
    reportedDays: reported.size,
    expectedDays: expected,
    coverage: expected ? reported.size / expected : null,
    gaps: gaps.map((gap) => ({ ...gap, days: daysBetween(gap.from, gap.to) + 1 })),
    lastReported: maxDate(...[...reported].map((stamp) => new Date(stamp))),
    firstReported: start,
  };
}

// ------------------------------------------------------------------- exports

/**
 * Build the project model.
 *
 * @param project  the project record (contract value, dates, thresholds)
 * @param data     records by document type, as stored
 * @param options  `asOf` is the data date — every "as at" number honours it
 */
export function buildModel(project, data = {}, { asOf: asOfInput } = {}) {
  const dprDates = (data.dpr ?? []).map((row) => row.date).filter(Boolean);
  const asOf = startOfDay(asOfInput) ?? maxDate(...dprDates) ?? startOfDay(new Date());

  const activities = buildActivities(data, asOf, project);
  const weightBasis = activities[0]?.weightBasis ?? 'equal';

  const baselineStarts = activities.map((activity) => activity.baselineStart).filter(Boolean);
  const baselineFinishes = activities.map((activity) => activity.baselineFinish).filter(Boolean);
  const start = startOfDay(asDate(project?.startDate)) ?? minDate(...baselineStarts, ...dprDates) ?? asOf;
  const baselineFinish = startOfDay(asDate(project?.contractCompletionDate)) ?? (baselineFinishes.length ? maxDate(...baselineFinishes) : null);

  const forecastFinishes = activities.map((activity) => activity.forecastFinish).filter(Boolean);
  const modelledFinish = forecastFinishes.length ? maxDate(...forecastFinishes) : baselineFinish;

  // A schedule names its predecessors the way a scheduler does — "A1020",
  // "Pier cap P18" — not by the internal key the model built. Resolving them
  // here is the difference between a real critical path and silently none.
  const idByWbs = new Map(activities.filter((activity) => activity.wbsId).map((activity) => [key(activity.wbsId), activity.id]));
  const idByName = new Map(activities.map((activity) => [key(activity.name), activity.id]));
  const resolveLinks = (text) => parsePredecessors(text).map((link) => ({
    ...link,
    id: idByWbs.get(key(link.id)) ?? idByName.get(key(link.id)) ?? link.id,
  }));

  const cpm = criticalPath(
    activities.filter((activity) => activity.predecessors || activity.duration).map((activity) => ({
      id: activity.id,
      duration: activity.duration,
      remainingDuration: activity.remainingDuration,
      actualStart: activity.actualStart,
      actualFinish: activity.complete ? activity.forecastFinish : null,
      baselineStart: activity.baselineStart,
      baselineFinish: activity.baselineFinish,
      predecessors: resolveLinks(activity.predecessors),
    })),
    asOf,
  );
  for (const activity of activities) {
    const node = cpm.schedule.get(activity.id);
    activity.totalFloat = node?.totalFloat ?? activity.statedFloat ?? null;
    activity.isCritical = cpm.hasLogic
      ? Boolean(node?.critical)
      : (activity.slippageDays ?? 0) > 0 && activity.weight > 0.01;
    if (cpm.hasLogic && node?.earlyFinish && !activity.complete) {
      // Logic can push an activity later than its own productivity implies;
      // the network date governs when it exists.
      activity.networkFinish = node.earlyFinish;
      if (node.earlyFinish > activity.forecastFinish) {
        activity.forecastFinish = node.earlyFinish;
        activity.forecastBasis = 'network logic';
        activity.slippageDays = activity.baselineFinish ? daysBetween(activity.baselineFinish, node.earlyFinish) : null;
      }
    }
  }

  const forecastFinish = cpm.hasLogic && cpm.finish ? maxDate(cpm.finish, modelledFinish) : modelledFinish;
  const plannedPercent = sum(activities.map((activity) => activity.weight * activity.plannedPercent));
  const actualPercent = sum(activities.map((activity) => activity.weight * activity.percentComplete));

  const series = buildSeries(activities, {
    from: start,
    to: maxDate(asOf, baselineFinish) ?? asOf,
    asOf,
    forecastTo: forecastFinish && forecastFinish > asOf ? forecastFinish : null,
  });

  return {
    project: project ?? null,
    asOf,
    start,
    baselineFinish,
    forecastFinish,
    revisedFinish: startOfDay(asDate(project?.revisedCompletionDate)),
    delayDays: baselineFinish && forecastFinish ? daysBetween(baselineFinish, forecastFinish) : null,
    elapsedDays: daysBetween(start, asOf),
    remainingDays: forecastFinish ? daysBetween(asOf, forecastFinish) : null,
    plannedPercent,
    actualPercent,
    variancePercent: actualPercent - plannedPercent,
    weightBasis,
    activities,
    areas: rollUpAreas(activities, asOf),
    series,
    resources: resourceSeries(data, asOf),
    coverage: reportingCoverage(data, start, asOf),
    criticalPath: {
      hasLogic: cpm.hasLogic,
      cycles: cpm.cycles,
      ids: cpm.criticalPath,
      activities: activities.filter((activity) => activity.isCritical && !activity.complete),
    },
    data,
  };
}

export { activityKey, baselinePercentAt, clamp, key, sum };
