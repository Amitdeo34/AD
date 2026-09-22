// The building blocks a report is assembled from.
//
// A report pack is data, not markup: sections of typed blocks. The HTML, Excel
// and Word renderers all read the same pack, which is why a table added here
// appears in every output format without touching any of them.
import { formatDate } from '../dates.js';

export const narrative = (paragraphs, { title } = {}) => ({
  kind: 'narrative',
  title,
  paragraphs: (Array.isArray(paragraphs) ? paragraphs : [paragraphs]).filter(Boolean),
});

export const kpis = (items) => ({ kind: 'kpis', items: items.filter(Boolean) });

export const table = (columns, rows, { note, emptyText = 'No entries.', totals } = {}) => ({
  kind: 'table', columns, rows, note, emptyText, totals,
});

export const chart = (spec) => ({ kind: 'chart', ...spec });

export const callout = (tone, title, text) => ({ kind: 'callout', tone, title, text });

export const list = (items, { ordered = false, title } = {}) => ({
  kind: 'list', ordered, title, items: items.filter(Boolean),
});

export const exceptions = (items, { title, emptyText } = {}) => ({
  kind: 'exceptions', title, items, emptyText,
});

export const section = (id, title, blocks, { pageBreak = false, subtitle } = {}) => ({
  id, title, subtitle, pageBreak, blocks: blocks.filter(Boolean),
});

// ------------------------------------------------------------ shared tables

const col = (key, label, format = 'text', extra = {}) => ({ key, label, format, ...extra });

/** Activity-level progress, the table every report needs some cut of. */
export function activityTable(activities, { showArea = true, limit = null } = {}) {
  const rows = (limit ? activities.slice(0, limit) : activities).map((activity) => ({
    wbsId: activity.wbsId ?? '—',
    activity: activity.name,
    area: activity.area,
    unit: activity.unit ?? '—',
    scopeQty: activity.scopeQty,
    doneQty: activity.doneQty,
    weight: activity.weight,
    plannedPercent: activity.plannedPercent,
    percentComplete: activity.percentComplete,
    variancePercent: activity.variancePercent,
    baselineFinish: activity.baselineFinish,
    forecastFinish: activity.forecastFinish,
    slippageDays: activity.slippageDays,
    status: activity.status,
    _tone: activity.complete ? 'good' : activity.status === 'Behind' ? 'bad' : activity.status.startsWith('Not started (') ? 'warn' : null,
  }));

  return table([
    col('wbsId', 'WBS'),
    col('activity', 'Activity', 'text', { width: 34 }),
    showArea ? col('area', 'Area') : null,
    col('unit', 'Unit'),
    col('scopeQty', 'Scope qty', 'number'),
    col('doneQty', 'Done qty', 'number'),
    col('weight', 'Weight', 'percent'),
    col('plannedPercent', 'Planned %', 'percent'),
    col('percentComplete', 'Actual %', 'percent'),
    col('variancePercent', 'Var %', 'percent'),
    col('baselineFinish', 'Baseline finish', 'date'),
    col('forecastFinish', 'Forecast finish', 'date'),
    col('slippageDays', 'Slip (d)', 'integer'),
    col('status', 'Status'),
  ].filter(Boolean), rows, { emptyText: 'No activities in scope.' });
}

export function areaTable(areas) {
  return table([
    col('name', 'Area / Package', 'text', { width: 28 }),
    col('activityCount', 'Activities', 'integer'),
    col('weight', 'Weight', 'percent'),
    col('plannedPercent', 'Planned %', 'percent'),
    col('actualPercent', 'Actual %', 'percent'),
    col('variancePercent', 'Variance', 'percent'),
    col('complete', 'Complete', 'integer'),
    col('behind', 'Behind', 'integer'),
    col('worstSlippageDays', 'Worst slip (d)', 'integer'),
    col('forecastFinish', 'Forecast finish', 'date'),
  ], areas.map((area) => ({
    ...area,
    _tone: area.variancePercent < -0.1 ? 'bad' : area.variancePercent < -0.02 ? 'warn' : 'good',
  })), { emptyText: 'No areas defined. Add an Area or Package column to the DPR or schedule.' });
}

export function milestoneTable(milestones) {
  return table([
    col('milestoneId', 'Ref'),
    col('name', 'Milestone', 'text', { width: 34 }),
    col('area', 'Area'),
    col('baselineDate', 'Contract date', 'date'),
    col('forecastDate', 'Forecast', 'date'),
    col('actualDate', 'Achieved', 'date'),
    col('slippageDays', 'Slip (d)', 'integer'),
    col('status', 'Status'),
    col('penaltyExposure', 'LD exposure', 'money'),
  ], milestones.map((milestone) => ({
    ...milestone,
    _tone: milestone.achieved ? 'good' : milestone.atRisk ? 'bad' : milestone.status === 'Due shortly' ? 'warn' : null,
  })), { emptyText: 'No contract milestones have been uploaded.' });
}

export function exceptionTable(items) {
  return table([
    col('severity', 'Severity', 'severity'),
    col('category', 'Category'),
    col('area', 'Area'),
    col('subject', 'Subject', 'text', { width: 30 }),
    col('detail', 'Observation', 'text', { width: 52 }),
    col('metricDisplay', 'Measure'),
    col('recommendation', 'Recommended action', 'text', { width: 46 }),
    col('owner', 'Owner'),
    col('trend', 'Trend'),
    col('periodsOpen', 'Periods open', 'integer'),
  ], items.map((item) => ({
    ...item,
    area: item.area ?? '—',
    owner: item.owner ?? '—',
    _tone: item.severity === 'Critical' ? 'bad' : item.severity === 'High' ? 'warn' : null,
  })), { emptyText: 'No exceptions were triggered against the agreed thresholds.' });
}

export function riskTable(risks) {
  return table([
    col('riskId', 'Ref'),
    col('description', 'Risk', 'text', { width: 44 }),
    col('area', 'Area'),
    col('category', 'Category'),
    col('probability', 'P', 'integer'),
    col('impact', 'I', 'integer'),
    col('score', 'Score', 'integer'),
    col('band', 'Band'),
    col('mitigation', 'Mitigation', 'text', { width: 40 }),
    col('owner', 'Owner'),
    col('dueDate', 'Target', 'date'),
  ], risks.map((risk) => ({
    ...risk,
    _tone: risk.score >= 15 ? 'bad' : risk.score >= 10 ? 'warn' : null,
  })), { emptyText: 'No risk register has been uploaded.' });
}

export function registerTable(items, { idKey, idLabel, descriptionKey = 'description', dateLabel = 'Raised' }) {
  return table([
    col(idKey, idLabel),
    col(descriptionKey, 'Description', 'text', { width: 48 }),
    col('area', 'Area'),
    col('raisedOn', dateLabel, 'date'),
    col('dueDate', 'Due', 'date'),
    col('owner', 'Owner'),
    col('status', 'Status'),
    col('ageDays', 'Age (d)', 'integer'),
  ], items.map((item) => ({
    ...item,
    _tone: item.overdue ? 'bad' : (item.ageDays ?? 0) > 30 ? 'warn' : null,
  })), { emptyText: 'No open entries.' });
}

export function lookAheadTable(lookAhead) {
  return table([
    col('wbsId', 'WBS'),
    col('name', 'Activity', 'text', { width: 36 }),
    col('area', 'Area'),
    col('action', 'Action'),
    col('percentComplete', 'Complete', 'percent'),
    col('baselineStart', 'Baseline start', 'date'),
    col('requiredBy', 'Required by', 'date'),
    col('remainingQty', 'Remaining qty', 'number'),
    col('productivity', 'Achieved rate/day', 'number'),
    col('owner', 'Owner'),
  ], lookAhead.activities.map((activity) => ({
    ...activity,
    owner: activity.owner ?? '—',
    _tone: (activity.slippageDays ?? 0) > 0 ? 'warn' : null,
  })), { emptyText: 'No activities fall due in the look-ahead window.' });
}

export function scurveChart(model, { title = 'S-curve — planned, actual and forecast' } = {}) {
  // Weekly sampling keeps the chart readable over a multi-year programme.
  const step = Math.max(1, Math.ceil(model.series.length / 160));
  const points = model.series.filter((_, index) => index % step === 0 || index === model.series.length - 1);
  return chart({
    chartType: 'scurve',
    title,
    series: points.map((point) => ({
      date: point.date,
      planned: point.planned,
      actual: point.actual,
      forecast: point.forecast ?? null,
    })),
    markers: [
      model.baselineFinish ? { date: model.baselineFinish, label: 'Contract completion' } : null,
      model.forecastFinish && model.delayDays > 0 ? { date: model.forecastFinish, label: 'Forecast completion' } : null,
    ].filter(Boolean),
    asOf: model.asOf,
  });
}

export function areaChart(areas) {
  return chart({
    chartType: 'bars',
    title: 'Progress by area — planned against actual',
    categories: areas.map((area) => area.name),
    series: [
      { label: 'Planned', values: areas.map((area) => area.plannedPercent) },
      { label: 'Actual', values: areas.map((area) => area.actualPercent) },
    ],
    format: 'percent',
  });
}

export function manpowerChart(resources) {
  const days = resources.days ?? [];
  const step = Math.max(1, Math.ceil(days.length / 120));
  const sampled = days.filter((_, index) => index % step === 0);
  return chart({
    chartType: 'histogram',
    title: 'Manpower deployment — planned against actual',
    categories: sampled.map((day) => formatDate(day.date)),
    series: [
      { label: 'Planned', values: sampled.map((day) => day.manpowerPlanned) },
      { label: 'Actual', values: sampled.map((day) => day.manpowerActual) },
    ],
    format: 'number',
  });
}

/**
 * Exception counts by severity.
 *
 * Deliberately bars rather than a pie: four ordered categories compared by
 * magnitude, and the status colours are close enough under colour-vision
 * deficiency that the slice labels would be doing all the work anyway.
 */
export function severityChart(counts) {
  return chart({
    chartType: 'statusbars',
    title: 'Exceptions by severity',
    rows: counts.map((entry) => ({ label: entry.severity, value: entry.count, status: entry.severity })),
  });
}

export { col };
