// The numbers a steering committee asks for.
//
// Earned value, cost performance, the money actually certified, and the state
// of quality, safety, risk and the registers that hang off them. Everything
// here reads the model and the raw records; nothing here re-derives progress.
import { addDays, asDate, daysBetween, eachMonth, formatMonth, isoDay, maxDate, monthRange, startOfDay, withinRange } from '../dates.js';
import { sum } from './model.js';

const finite = (value) => (Number.isFinite(value) ? value : 0);

/**
 * Earned value.
 *
 * BAC comes from the contract if the project carries one, and from the BOQ
 * otherwise. AC is what has actually been certified — a PMO has no access to
 * the contractor's cost book, and certified value is the honest stand-in that
 * every client already agrees with.
 */
export function earnedValue(model, { project } = {}) {
  const contractValue = Number.isFinite(project?.contractValue) ? project.contractValue : null;
  const boqValue = sum(model.activities.map((activity) => activity.value ?? 0));
  const bac = contractValue ?? (boqValue > 0 ? boqValue : null);

  const billing = model.data.billing ?? [];
  const certified = sum(billing.map((bill) => finite(bill.certifiedAmount)));
  const claimed = sum(billing.map((bill) => finite(bill.claimedAmount)));
  const paid = sum(billing.map((bill) => finite(bill.paidAmount)));
  const ac = certified > 0 ? certified : null;

  const pv = bac === null ? null : bac * model.plannedPercent;
  const ev = bac === null ? null : bac * model.actualPercent;

  const spi = pv ? ev / pv : null;
  const cpi = ac ? ev / ac : null;
  const eac = cpi && bac ? bac / cpi : null;

  // Earned schedule: the date on which the plan said we would be where we are.
  let earnedSchedule = null;
  const points = model.series.filter((point) => point.date <= model.asOf);
  for (let i = points.length - 1; i >= 0; i -= 1) {
    if (points[i].planned <= model.actualPercent) {
      const next = points[i + 1];
      const fraction = next && next.planned > points[i].planned
        ? (model.actualPercent - points[i].planned) / (next.planned - points[i].planned)
        : 0;
      earnedSchedule = daysBetween(model.start, points[i].date) + fraction;
      break;
    }
  }
  const actualTime = daysBetween(model.start, model.asOf);
  const spiTime = earnedSchedule !== null && actualTime > 0 ? earnedSchedule / actualTime : null;

  return {
    bac,
    bacSource: contractValue ? 'contract value' : (boqValue > 0 ? 'BOQ' : null),
    pv,
    ev,
    ac,
    claimed,
    certified,
    paid,
    withheld: claimed - certified,
    sv: pv === null ? null : ev - pv,
    cv: ac === null || ev === null ? null : ev - ac,
    spi,
    cpi,
    spiTime,
    earnedScheduleDays: earnedSchedule,
    actualTimeDays: actualTime,
    // Time slippage read off the curve, which is the figure a client recognises
    // more readily than an index.
    scheduleSlipDays: earnedSchedule !== null ? Math.round(actualTime - earnedSchedule) : null,
    eac,
    etc: eac && ac ? eac - ac : null,
    vac: eac && bac ? bac - eac : null,
    tcpi: bac && ac && eac ? (bac - ev) / (bac - ac) : null,
    financialPercent: bac ? certified / bac : null,
  };
}

/** Certified value against the cash flow plan, month by month. */
export function cashPosition(model) {
  const plan = model.data.cashflow ?? [];
  const billing = model.data.billing ?? [];
  if (!plan.length && !billing.length) return { months: [], plannedToDate: 0, actualToDate: 0, variance: null };

  const months = new Map();
  const touch = (date) => {
    const month = monthRange(date);
    if (!month) return null;
    const stamp = isoDay(month.from);
    if (!months.has(stamp)) months.set(stamp, { month: month.from, label: month.label, planned: 0, actual: 0 });
    return months.get(stamp);
  };

  for (const row of plan) {
    const bucket = touch(row.period);
    if (!bucket) continue;
    bucket.planned += finite(row.plannedAmount);
    bucket.actual += finite(row.actualAmount);
  }
  for (const bill of billing) {
    const bucket = touch(bill.certifiedOn ?? bill.submittedOn ?? asDate(bill.period));
    if (!bucket) continue;
    bucket.actual += finite(bill.certifiedAmount);
  }

  const ordered = [...months.values()].sort((a, b) => a.month - b.month);
  let plannedRunning = 0;
  let actualRunning = 0;
  for (const bucket of ordered) {
    plannedRunning += bucket.planned;
    actualRunning += bucket.actual;
    bucket.plannedCumulative = plannedRunning;
    bucket.actualCumulative = actualRunning;
    bucket.variance = bucket.planned ? (bucket.actual - bucket.planned) / bucket.planned : null;
  }

  const toDate = ordered.filter((bucket) => bucket.month <= model.asOf);
  const plannedToDate = sum(toDate.map((bucket) => bucket.planned));
  const actualToDate = sum(toDate.map((bucket) => bucket.actual));
  return {
    months: ordered,
    plannedToDate,
    actualToDate,
    variance: plannedToDate ? (actualToDate - plannedToDate) / plannedToDate : null,
  };
}

const RISK_BANDS = [
  { min: 15, label: 'Very high', severity: 'Critical' },
  { min: 10, label: 'High', severity: 'High' },
  { min: 5, label: 'Medium', severity: 'Medium' },
  { min: 0, label: 'Low', severity: 'Low' },
];

const CLOSED = /^(closed|complete|completed|resolved|done|retired|mitigated|no longer|nil)/i;

export function isOpen(record) {
  if (record.closedOn) return false;
  if (record.status && CLOSED.test(String(record.status).trim())) return false;
  return true;
}

/** Score the risk register 5×5 and band it. */
export function riskSummary(model) {
  const risks = (model.data.risks ?? []).map((risk) => {
    const probability = Number.isFinite(risk.probability) ? Math.min(Math.max(risk.probability, 1), 5) : 3;
    const impact = Number.isFinite(risk.impact) ? Math.min(Math.max(risk.impact, 1), 5) : 3;
    const score = probability * impact;
    const band = RISK_BANDS.find((entry) => score >= entry.min);
    return {
      ...risk,
      probability,
      impact,
      score,
      band: band.label,
      severity: band.severity,
      open: isOpen(risk),
      ageDays: risk.raisedOn ? daysBetween(risk.raisedOn, model.asOf) : null,
      overdue: risk.dueDate ? startOfDay(risk.dueDate) < model.asOf && isOpen(risk) : false,
    };
  });

  const open = risks.filter((risk) => risk.open);
  return {
    all: risks,
    open,
    closed: risks.filter((risk) => !risk.open),
    byBand: RISK_BANDS.map((band) => ({
      label: band.label,
      severity: band.severity,
      count: open.filter((risk) => risk.band === band.label).length,
    })),
    top: [...open].sort((a, b) => b.score - a.score).slice(0, 10),
    exposure: sum(open.map((risk) => finite(risk.exposure))),
    scheduleExposureDays: sum(open.map((risk) => finite(risk.scheduleImpact))),
    overdue: open.filter((risk) => risk.overdue),
  };
}

/** Anything with an owner and a date: issues, NCRs, hindrances, actions. */
export function registerSummary(records = [], asOf, { dateField = 'raisedOn' } = {}) {
  const items = records.map((record) => ({
    ...record,
    open: isOpen(record),
    ageDays: record[dateField] ? daysBetween(record[dateField], asOf) : null,
    overdue: record.dueDate ? startOfDay(record.dueDate) < startOfDay(asOf) && isOpen(record) : false,
    closureDays: record[dateField] && record.closedOn ? daysBetween(record[dateField], record.closedOn) : null,
  }));
  const open = items.filter((item) => item.open);
  const ages = open.map((item) => item.ageDays).filter(Number.isFinite);
  const closures = items.map((item) => item.closureDays).filter(Number.isFinite);
  return {
    all: items,
    open,
    closed: items.filter((item) => !item.open),
    total: items.length,
    openCount: open.length,
    overdue: open.filter((item) => item.overdue),
    oldest: ages.length ? Math.max(...ages) : null,
    averageAge: ages.length ? sum(ages) / ages.length : null,
    averageClosureDays: closures.length ? sum(closures) / closures.length : null,
  };
}

/** EHS position: incidents, lost-time injuries and safe man-hours. */
export function safetySummary(model, { from, to } = {}) {
  const records = (model.data.safety ?? []).filter((record) => !from || withinRange(record.date, from, to));
  const lti = records.filter((record) => record.lti === true || /lost\s*time|lti|fatal/i.test(record.type ?? ''));
  const incidents = records.filter((record) => /incident|accident|injur|fatal|fire/i.test(`${record.type ?? ''} ${record.severity ?? ''}`));
  const nearMiss = records.filter((record) => /near\s*miss/i.test(record.type ?? ''));
  const manHours = sum(records.map((record) => finite(record.manHours)));
  const dprHours = sum((model.data.dpr ?? [])
    .filter((row) => !from || withinRange(row.date, from, to))
    .map((row) => finite(row.manpowerActual) * (finite(row.workingHours) || 8)));

  return {
    records,
    incidents: incidents.length,
    lti: lti.length,
    nearMiss: nearMiss.length,
    observations: records.length - incidents.length - nearMiss.length,
    manHours: manHours || dprHours,
    manHoursSource: manHours ? 'safety register' : 'derived from DPR manpower',
    ltiFrequencyRate: (manHours || dprHours) ? (lti.length * 1e6) / (manHours || dprHours) : null,
    open: records.filter(isOpen).length,
  };
}

/** Manpower and plant, planned against deployed, over a window. */
export function resourceSummary(model, { from, to } = {}) {
  const days = model.resources.filter((day) => !from || withinRange(day.date, from, to));
  if (!days.length) return { days: [], manpower: null, equipment: null };

  const manpowerActual = sum(days.map((day) => day.manpowerActual));
  const manpowerPlanned = sum(days.map((day) => day.manpowerPlanned));
  const equipmentActual = sum(days.map((day) => day.equipmentActual));
  const equipmentPlanned = sum(days.map((day) => day.equipmentPlanned));
  const active = days.filter((day) => day.manpowerActual > 0).length || days.length;

  return {
    days,
    manpower: {
      averageActual: manpowerActual / active,
      averagePlanned: manpowerPlanned ? manpowerPlanned / active : null,
      peak: Math.max(...days.map((day) => day.manpowerActual)),
      fulfilment: manpowerPlanned ? manpowerActual / manpowerPlanned : null,
      totalManDays: manpowerActual,
    },
    equipment: {
      averageActual: equipmentActual / active,
      averagePlanned: equipmentPlanned ? equipmentPlanned / active : null,
      peak: Math.max(...days.map((day) => day.equipmentActual)),
      fulfilment: equipmentPlanned ? equipmentActual / equipmentPlanned : null,
      idleDays: sum(days.map((day) => day.equipmentIdle)),
    },
  };
}

/** Progress booked inside a window — the "this week / this month" number. */
export function periodProgress(model, from, to) {
  const points = model.series.filter((point) => point.actual !== null);
  const before = [...points].reverse().find((point) => point.date < startOfDay(from));
  const atEnd = [...points].reverse().find((point) => point.date <= startOfDay(to));
  const plannedBefore = [...model.series].reverse().find((point) => point.date < startOfDay(from));
  const plannedEnd = [...model.series].reverse().find((point) => point.date <= startOfDay(to));

  const actualGain = (atEnd?.actual ?? 0) - (before?.actual ?? 0);
  const plannedGain = (plannedEnd?.planned ?? 0) - (plannedBefore?.planned ?? 0);

  const rows = (model.data.dpr ?? []).filter((row) => withinRange(row.date, from, to));
  return {
    from: startOfDay(from),
    to: startOfDay(to),
    actualGain,
    plannedGain,
    achievement: plannedGain > 0 ? actualGain / plannedGain : null,
    openingPercent: before?.actual ?? 0,
    closingPercent: atEnd?.actual ?? 0,
    plannedClosingPercent: plannedEnd?.planned ?? 0,
    dprRows: rows.length,
    daysReported: new Set(rows.map((row) => isoDay(row.date))).size,
    quantityByActivity: activityQuantities(rows),
  };
}

function activityQuantities(rows) {
  const groups = new Map();
  for (const row of rows) {
    const name = row.activity ?? row.wbsId ?? 'Unspecified';
    const id = `${name}|${row.area ?? ''}`;
    if (!groups.has(id)) groups.set(id, { activity: name, area: row.area ?? null, unit: row.unit ?? null, planned: 0, actual: 0, days: 0 });
    const group = groups.get(id);
    group.planned += finite(row.plannedQty);
    group.actual += finite(row.actualQty);
    group.days += 1;
  }
  return [...groups.values()]
    .map((group) => ({ ...group, achievement: group.planned ? group.actual / group.planned : null }))
    .sort((a, b) => b.actual - a.actual);
}

/** Milestones with their forecast position and any penalty exposure. */
export function milestoneStatus(model) {
  const thresholds = model.project?.thresholds ?? {};
  const warning = thresholds.milestoneWarningDays ?? 30;

  return (model.data.milestones ?? []).map((milestone) => {
    const baseline = startOfDay(milestone.baselineDate);
    const actual = startOfDay(milestone.actualDate);
    // A milestone's forecast is whatever the site says it is; failing that,
    // the forecast finish of the work that sits in the same area.
    const related = model.activities.filter((activity) => activity.area === milestone.area && !activity.complete);
    const derived = related.length ? maxDate(...related.map((activity) => activity.forecastFinish).filter(Boolean)) : null;
    const forecast = startOfDay(milestone.forecastDate) ?? actual ?? derived ?? baseline;
    const slip = baseline && forecast ? daysBetween(baseline, forecast) : null;
    const daysToGo = baseline ? daysBetween(model.asOf, baseline) : null;

    let status;
    if (actual) status = slip > 0 ? 'Achieved late' : 'Achieved';
    else if (slip > 0) status = 'Slipped';
    else if (daysToGo !== null && daysToGo <= warning) status = 'Due shortly';
    else status = 'On track';

    return {
      ...milestone,
      baselineDate: baseline,
      forecastDate: forecast,
      actualDate: actual,
      slippageDays: slip,
      daysToGo,
      achieved: Boolean(actual),
      atRisk: !actual && (slip ?? 0) > 0,
      status,
      penaltyExposure: !actual && (slip ?? 0) > 0 ? finite(milestone.penalty) : 0,
    };
  }).sort((a, b) => (a.baselineDate ?? 0) - (b.baselineDate ?? 0));
}

/**
 * Work due to start or finish in the coming weeks, with what it needs.
 *
 * The three-week look-ahead is the single most used page of a weekly pack,
 * because it is the only one that asks the contractor for something.
 */
export function lookAhead(model, { weeks = 3, from } = {}) {
  const start = startOfDay(from) ?? addDays(model.asOf, 1);
  const end = addDays(start, weeks * 7 - 1);

  const due = model.activities.filter((activity) => {
    if (activity.complete) return false;
    const starts = activity.baselineStart && withinRange(activity.baselineStart, start, end);
    const finishes = activity.baselineFinish && withinRange(activity.baselineFinish, start, end);
    const inProgress = activity.started && activity.baselineFinish && activity.baselineFinish <= end;
    return starts || finishes || inProgress;
  });

  return {
    from: start,
    to: end,
    weeks,
    activities: due
      .map((activity) => ({
        ...activity,
        action: activity.started ? 'Continue' : 'Mobilise and start',
        requiredBy: activity.baselineFinish,
      }))
      .sort((a, b) => (a.baselineFinish ?? 0) - (b.baselineFinish ?? 0)),
    procurement: (model.data.procurement ?? []).filter((item) => isOpen(item) && item.requiredBy && withinRange(item.requiredBy, start, end)),
    drawings: (model.data.drawings ?? []).filter((item) => !item.approvedOn && item.requiredBy && withinRange(item.requiredBy, start, end)),
    milestones: milestoneStatus(model).filter((milestone) => !milestone.achieved && milestone.baselineDate && withinRange(milestone.baselineDate, start, end)),
  };
}

/** Month-by-month progress, which is what a quarterly report trends. */
export function monthlyTrend(model, { from, to } = {}) {
  const start = startOfDay(from) ?? model.start;
  const end = startOfDay(to) ?? model.asOf;
  return eachMonth(start, end).map((month) => {
    const range = monthRange(month);
    const period = periodProgress(model, maxDate(range.from, start), range.to > end ? end : range.to);
    const resources = resourceSummary(model, { from: range.from, to: range.to });
    return {
      month: range.from,
      label: formatMonth(range.from),
      plannedGain: period.plannedGain,
      actualGain: period.actualGain,
      achievement: period.achievement,
      closingPercent: period.closingPercent,
      plannedClosingPercent: period.plannedClosingPercent,
      manpower: resources.manpower?.averageActual ?? null,
      daysReported: period.daysReported,
    };
  });
}
