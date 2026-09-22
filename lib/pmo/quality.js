// Is this data good enough to report from?
//
// A consulting deliverable stands or falls on whether the numbers survive
// scrutiny. This runs before anything is published: what is missing, what
// contradicts itself, and what the reader should be told the report could not
// see. Findings are graded so the cockpit can show readiness at a glance and
// every report can carry the same qualification.
import { DOC_TYPES, ESSENTIAL_DOC_TYPES } from './schema.js';
import { daysBetween, formatDate, isoDay, startOfDay } from './dates.js';

const finding = (severity, area, message, detail, fix) => ({ severity, area, message, detail, fix });

/**
 * Check the raw records of one document type.
 */
export function checkRecords(docType, records, { asOf } = {}) {
  const findings = [];
  const spec = DOC_TYPES[docType];
  if (!spec || !records.length) return findings;
  const label = spec.short;

  const required = spec.fields.filter((field) => field.required);
  for (const field of required) {
    const missing = records.filter((record) => record[field.key] === null || record[field.key] === undefined).length;
    if (missing) {
      findings.push(finding(
        missing > records.length * 0.2 ? 'high' : 'medium',
        label,
        `${missing} of ${records.length} ${label} rows have no ${field.label.toLowerCase()}`,
        'Rows without this field cannot be attributed and are excluded from the analysis.',
        `Check the ${field.label} column in the source file — it may be blank, merged, or mapped to the wrong column.`,
      ));
    }
  }

  const dateField = spec.fields.find((field) => field.type === 'date' && field.required)?.key;
  if (dateField) {
    const dates = records.map((record) => record[dateField]).filter(Boolean).map((value) => startOfDay(value));
    // Only a record of something that already happened can be "in the future".
    // A baseline programme, a milestone list and a cash flow plan are all
    // supposed to run past the data date.
    const future = asOf && spec.retrospective ? dates.filter((date) => date > startOfDay(asOf)) : [];
    if (future.length) {
      findings.push(finding('medium', label, `${future.length} ${label} row(s) are dated after the data date`,
        `The latest is ${formatDate(future.sort((a, b) => b - a)[0])}. These are usually a typed year, such as 2025 for 2026.`,
        'Correct the dates at source, or set the data date forward if the rows are genuine.'));
    }
    const ancient = dates.filter((date) => date.getUTCFullYear() < 2000);
    if (ancient.length) {
      findings.push(finding('medium', label, `${ancient.length} ${label} row(s) have an implausible date`,
        'Dates before 2000 almost always mean a two-digit year was read the wrong way.',
        'Re-check the date format on upload — the mapping step lets you switch between day-first and month-first.'));
    }
  }

  if (docType === 'dpr') {
    const negative = records.filter((record) => Number.isFinite(record.actualQty) && record.actualQty < 0);
    if (negative.length) {
      findings.push(finding('medium', label, `${negative.length} DPR row(s) carry a negative quantity`,
        'Negative daily progress usually means a correction was entered as a reversal.',
        'Confirm whether these are corrections; the engine adds them as written.'));
    }

    // The same activity reported twice on the same day double-counts progress.
    const seen = new Map();
    let duplicates = 0;
    for (const record of records) {
      const stamp = `${isoDay(record.date)}|${String(record.wbsId ?? '').toLowerCase()}|${String(record.activity ?? '').toLowerCase()}|${String(record.area ?? '').toLowerCase()}`;
      if (seen.has(stamp)) duplicates += 1;
      else seen.set(stamp, true);
    }
    if (duplicates) {
      findings.push(finding(duplicates > records.length * 0.1 ? 'high' : 'medium', label,
        `${duplicates} duplicate DPR row(s) — same activity, same area, same day`,
        'Daily quantities on duplicated rows are added together, which overstates progress.',
        'Either de-duplicate the source file, or confirm the rows are separate fronts and give them distinct area names.'));
    }

    const regressions = [];
    const byActivity = new Map();
    for (const record of [...records].sort((a, b) => startOfDay(a.date) - startOfDay(b.date))) {
      if (!Number.isFinite(record.cumulativeQty)) continue;
      const id = `${record.wbsId ?? ''}|${record.activity ?? ''}`;
      const last = byActivity.get(id);
      if (Number.isFinite(last) && record.cumulativeQty < last) regressions.push(record);
      byActivity.set(id, Math.max(last ?? 0, record.cumulativeQty));
    }
    if (regressions.length) {
      findings.push(finding('medium', label, `${regressions.length} row(s) where the cumulative quantity goes backwards`,
        'A cumulative column can only rise. Where it falls, the engine holds the higher figure.',
        'Reconcile the cumulative column with the daily quantities at source.'));
    }
  }

  if (docType === 'schedule') {
    const inverted = records.filter((record) => record.baselineStart && record.baselineFinish
      && startOfDay(record.baselineFinish) < startOfDay(record.baselineStart));
    if (inverted.length) {
      findings.push(finding('high', label, `${inverted.length} activit${inverted.length === 1 ? 'y finishes' : 'ies finish'} before they start`,
        'Baseline finish is earlier than baseline start, which makes the planned curve meaningless for those lines.',
        'Most often the two columns are mapped the wrong way round — re-check the mapping.'));
    }
    const noDates = records.filter((record) => !record.baselineStart && !record.baselineFinish).length;
    if (noDates > records.length * 0.3) {
      findings.push(finding('high', label, `${noDates} activities carry no baseline dates`,
        'Planned progress is derived from baseline dates; without them the S-curve and all slippage figures are unavailable for those lines.',
        'Upload the approved baseline programme, or map the planned start and finish columns.'));
    }
  }

  if (docType === 'boq') {
    const noValue = records.filter((record) => !Number.isFinite(record.amount)
      && !(Number.isFinite(record.qty) && Number.isFinite(record.rate))).length;
    if (noValue > records.length * 0.2) {
      findings.push(finding('medium', label, `${noValue} BOQ line(s) have neither an amount nor a quantity × rate`,
        'Value-weighted progress falls back to a cruder basis for the work these lines cover.',
        'Map either the Amount column, or both Quantity and Rate.'));
    }
  }

  return findings;
}

/**
 * Check the reconciled model: the problems that only appear once the DPR, the
 * schedule and the BOQ are put side by side.
 */
export function checkModel(model) {
  const findings = [];

  if (model.weightBasis === 'equal') {
    findings.push(finding('high', 'Weighting', 'Progress is weighted equally across activities',
      'Without a BOQ or a weightage column, a day of survey counts the same as a month of piling. Every percentage in the report inherits that.',
      'Upload the BOQ, or add a weightage column to the schedule.'));
  } else if (model.weightBasis === 'duration') {
    findings.push(finding('medium', 'Weighting', 'Progress is weighted by activity duration',
      'Duration is a reasonable proxy but it is not value; a long, cheap activity is over-weighted.',
      'Upload the BOQ to weight by value.'));
  }

  if (!model.baselineFinish) {
    findings.push(finding('high', 'Schedule', 'No contract completion date is available',
      'Slippage, milestone risk and the forecast position cannot be stated without it.',
      'Set the contract completion date on the project, or upload a baseline programme.'));
  }

  const unmatched = model.activities.filter((activity) => !activity.scheduled);
  if (unmatched.length) {
    findings.push(finding('medium', 'Reconciliation', `${unmatched.length} reported activit${unmatched.length === 1 ? 'y does' : 'ies do'} not appear in the programme`,
      `Progress on these is tracked but cannot be compared to a plan. First few: ${unmatched.slice(0, 4).map((activity) => activity.name).join('; ')}.`,
      'Align the activity naming between the DPR and the schedule, or add the WBS code to the DPR — matching is by WBS code first, then by name.'));
  }

  const noRecord = model.activities.filter((activity) => activity.scheduled && !activity.hasDailyRecord && activity.started);
  if (noRecord.length) {
    findings.push(finding('low', 'Reconciliation', `${noRecord.length} scheduled activit${noRecord.length === 1 ? 'y has' : 'ies have'} a stated percentage but no daily record`,
      'Their progress is taken from the schedule as typed, and cannot be evidenced from the DPR.',
      'Ask for these to be reported in the DPR so progress is measured rather than asserted.'));
  }

  // Not-yet-started work sitting at 0% is correct, not a defect. What matters
  // is work that IS being reported but has no scope quantity to measure it
  // against — those quantities cannot become a percentage of anything.
  const unmeasurable = model.activities.filter((activity) => activity.hasDailyRecord
    && !Number.isFinite(activity.scopeQty)
    && activity.percentSource !== 'stated');
  if (unmeasurable.length) {
    findings.push(finding('medium', 'Measurement', `${unmeasurable.length} activit${unmeasurable.length === 1 ? 'y has' : 'ies have'} reported quantities but no total scope`,
      `Daily quantities cannot be turned into a percentage without a scope quantity, so these carry no progress: ${unmeasurable.slice(0, 3).map((activity) => activity.name).join('; ')}.`,
      'Add the BOQ quantity for these items, or a total quantity column in the DPR.'));
  }

  if (Number.isFinite(model.coverage.coverage) && model.coverage.coverage < 0.8) {
    findings.push(finding(model.coverage.coverage < 0.5 ? 'high' : 'medium', 'Coverage',
      `DPRs cover ${(model.coverage.coverage * 100).toFixed(0)}% of days since reporting began`,
      `${model.coverage.reportedDays} days reported out of ${model.coverage.expectedDays}.`,
      'Obtain the missing DPRs before this period is signed off.'));
  }

  if (model.criticalPath.cycles?.length) {
    findings.push(finding('medium', 'Schedule', `Circular logic in the programme (${model.criticalPath.cycles.length} activities)`,
      'A loop in the predecessor logic makes float and the critical path unreliable for the affected chain.',
      'Fix the loop in the source programme and re-upload.'));
  } else if (!model.criticalPath.hasLogic) {
    findings.push(finding('low', 'Schedule', 'The programme carries no predecessor logic',
      'The critical path shown is the set of activities driving the completion date by slippage and weight, not a network calculation.',
      'Upload the programme with its Predecessors column, or as a Primavera .xer or MS Project XML, for a true critical path.'));
  }

  return findings;
}

/** What the project has, what it is missing, and how ready it is to report. */
export function readiness(datasetsByType, model = null) {
  const present = Object.keys(datasetsByType).filter((docType) => (datasetsByType[docType]?.length ?? 0) > 0);
  const missingEssential = ESSENTIAL_DOC_TYPES.filter((docType) => !present.includes(docType));
  const optional = Object.keys(DOC_TYPES).filter((docType) => !ESSENTIAL_DOC_TYPES.includes(docType) && !present.includes(docType));

  const findings = [
    ...Object.entries(datasetsByType).flatMap(([docType, records]) => checkRecords(docType, records ?? [], { asOf: model?.asOf })),
    ...(model ? checkModel(model) : []),
    ...missingEssential.map((docType) => finding('high', DOC_TYPES[docType].short,
      `No ${DOC_TYPES[docType].label} has been uploaded`,
      DOC_TYPES[docType].description,
      `Upload it on the project's data page — the engine will map the columns for you.`)),
  ];

  const weights = { high: 12, medium: 5, low: 1 };
  const penalty = findings.reduce((total, item) => total + weights[item.severity], 0);
  const score = Math.max(0, Math.min(100, 100 - penalty));

  return {
    score,
    grade: score >= 85 ? 'Ready' : score >= 60 ? 'Usable with qualifications' : score >= 35 ? 'Weak' : 'Not reportable',
    present,
    missingEssential,
    missingOptional: optional,
    findings: findings.sort((a, b) => weights[b.severity] - weights[a.severity]),
    counts: {
      high: findings.filter((item) => item.severity === 'high').length,
      medium: findings.filter((item) => item.severity === 'medium').length,
      low: findings.filter((item) => item.severity === 'low').length,
    },
  };
}
