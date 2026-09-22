// The words a report needs, written from the numbers.
//
// Every sentence here is derived — no adjective appears unless a threshold
// produced it. That is deliberate: a PMO narrative that drifts from the table
// underneath it is worse than no narrative, and a manager should be able to
// edit these paragraphs rather than write them.
import { formatDate, formatMonth } from '../dates.js';

export function formatPercent(value, digits = 1) {
  if (!Number.isFinite(value)) return '—';
  return `${(value * 100).toFixed(digits)}%`;
}

/** Indian money, at the scale a project report actually quotes. */
export function formatMoney(value, { currency = 'INR', compact = true } = {}) {
  if (!Number.isFinite(value)) return '—';
  const symbol = currency === 'INR' ? '₹' : '';
  const abs = Math.abs(value);
  if (compact && abs >= 1e7) return `${symbol}${(value / 1e7).toFixed(2)} Cr`;
  if (compact && abs >= 1e5) return `${symbol}${(value / 1e5).toFixed(2)} L`;
  return `${symbol}${Math.round(value).toLocaleString('en-IN')}`;
}

export function formatNumber(value, digits = 0) {
  if (!Number.isFinite(value)) return '—';
  return value.toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

const plural = (count, one, many) => `${count} ${count === 1 ? one : many ?? `${one}s`}`;

function healthWord(variance) {
  if (variance >= 0.02) return 'ahead of programme';
  if (variance >= -0.02) return 'broadly in line with programme';
  if (variance >= -0.05) return 'marginally behind programme';
  if (variance >= -0.15) return 'behind programme';
  return 'significantly behind programme';
}

/** RAG status for the project, from schedule position and open criticals. */
export function overallStatus(context) {
  const { model, exceptions } = context;
  const critical = exceptions.filter((item) => item.severity === 'Critical').length;
  const variance = model.variancePercent;
  if (critical > 0 || variance <= -0.15) return { rag: 'Red', label: 'Red — intervention required' };
  if (variance <= -0.05 || exceptions.filter((item) => item.severity === 'High').length >= 3) {
    return { rag: 'Amber', label: 'Amber — recovery action needed' };
  }
  return { rag: 'Green', label: 'Green — on track' };
}

/** The opening paragraphs of any report. */
export function executiveSummary(context) {
  const { model, period, evm, exceptions, project } = context;
  const status = overallStatus(context);
  const paragraphs = [];

  paragraphs.push(
    `As at ${formatDate(model.asOf)}, cumulative physical progress on ${project?.name ?? 'the project'} stands at `
    + `${formatPercent(model.actualPercent)} against a planned ${formatPercent(model.plannedPercent)}, `
    + `a variance of ${formatPercent(model.variancePercent)}. The project is ${healthWord(model.variancePercent)} `
    + `and is assessed overall as ${status.rag}.`,
  );

  if (period.plannedGain > 0 || period.actualGain > 0) {
    const achievement = period.achievement;
    paragraphs.push(
      `During the reporting period (${formatDate(period.from)} to ${formatDate(period.to)}), `
      + `${formatPercent(period.actualGain)} of physical progress was earned against a planned `
      + `${formatPercent(period.plannedGain)}`
      + (Number.isFinite(achievement)
        ? `, an achievement of ${formatPercent(achievement, 0)} of the period's target.`
        : '.')
      + (period.daysReported ? ` ${plural(period.daysReported, 'day')} of site progress were reported in the period.` : ''),
    );
  }

  if (model.baselineFinish) {
    const delay = model.delayDays;
    paragraphs.push(
      delay > 0
        ? `Against a contract completion date of ${formatDate(model.baselineFinish)}, the current forecast completion is `
          + `${formatDate(model.forecastFinish)} — a slippage of ${plural(delay, 'day')}. `
          + `The forecast is built from measured productivity on the reported activities`
          + (model.criticalPath.hasLogic ? ' and the predecessor logic in the programme.' : ', as the programme carries no predecessor logic.')
        : `The current forecast completion of ${formatDate(model.forecastFinish)} is within the contract date of `
          + `${formatDate(model.baselineFinish)}.`,
    );
  }

  if (Number.isFinite(evm.spi) || Number.isFinite(evm.cpi)) {
    const bits = [];
    if (Number.isFinite(evm.spi)) bits.push(`a schedule performance index of ${evm.spi.toFixed(2)}`);
    if (Number.isFinite(evm.cpi)) bits.push(`a cost performance index of ${evm.cpi.toFixed(2)}`);
    paragraphs.push(
      `Earned value analysis returns ${bits.join(' and ')}`
      + (Number.isFinite(evm.eac) ? `, giving a forecast cost at completion of ${formatMoney(evm.eac, { currency: project?.currency })} against a budget of ${formatMoney(evm.bac, { currency: project?.currency })}.` : '.'),
    );
  }

  const critical = exceptions.filter((item) => item.severity === 'Critical');
  const high = exceptions.filter((item) => item.severity === 'High');
  const fresh = exceptions.filter((item) => item.isNew).length;
  if (exceptions.length) {
    const severityParts = [];
    if (critical.length) severityParts.push(`${critical.length} critical`);
    if (high.length) severityParts.push(`${high.length} high severity`);
    paragraphs.push(
      `${plural(exceptions.length, 'exception')} ${exceptions.length === 1 ? 'is' : 'are'} reported this period`
      + (severityParts.length ? `, including ${severityParts.join(' and ')}` : '')
      + `. ${fresh} ${fresh === 1 ? 'is' : 'are'} new this period`
      + (context.exceptionsClosed.length
        ? ` and ${plural(context.exceptionsClosed.length, 'item')} raised previously ${context.exceptionsClosed.length === 1 ? 'has' : 'have'} been closed.`
        : '.'),
    );
  } else {
    paragraphs.push('No exceptions were triggered against the agreed thresholds this period.');
  }

  return paragraphs;
}

/** What the numbers mean for the schedule, in two or three sentences. */
export function scheduleCommentary(context) {
  const { model } = context;
  const paragraphs = [];
  const driving = model.criticalPath.activities.slice(0, 5);

  if (model.criticalPath.hasLogic) {
    paragraphs.push(
      driving.length
        ? `The critical path runs through ${plural(driving.length, 'activity', 'activities')}: ${driving.map((activity) => activity.name).join('; ')}. `
          + `Any further delay on these translates day for day into the completion date.`
        : 'No activity currently carries zero or negative float; the programme has float throughout.',
    );
  } else {
    paragraphs.push(
      driving.length
        ? `The programme carries no predecessor logic, so a network critical path cannot be calculated. The activities driving the completion date by slippage and weight are: ${driving.slice(0, 5).map((activity) => activity.name).join('; ')}.`
        : 'The programme carries no predecessor logic, and no activity is currently forecast to finish late.',
    );
  }

  const behind = model.activities.filter((activity) => !activity.complete && (activity.slippageDays ?? 0) > 0);
  const notStarted = model.activities.filter((activity) => !activity.started && activity.baselineStart && activity.baselineStart < model.asOf);
  if (behind.length || notStarted.length) {
    paragraphs.push(
      `${plural(behind.length, 'activity', 'activities')} ${behind.length === 1 ? 'is' : 'are'} forecast to finish later than baseline`
      + (notStarted.length ? `, and ${plural(notStarted.length, 'activity', 'activities')} ${notStarted.length === 1 ? 'has' : 'have'} passed a baseline start date without any reported progress.` : '.'),
    );
  }

  return paragraphs;
}

export function progressCommentary(context) {
  const { model, period } = context;
  const paragraphs = [];
  const leaders = [...model.areas].sort((a, b) => b.variancePercent - a.variancePercent);
  const best = leaders[0];
  const worst = leaders[leaders.length - 1];

  if (best && worst && best !== worst) {
    paragraphs.push(
      `Area performance is uneven. ${best.name} is the strongest at ${formatPercent(best.actualPercent)} complete `
      + `against a plan of ${formatPercent(best.plannedPercent)}, while ${worst.name} stands at `
      + `${formatPercent(worst.actualPercent)} against ${formatPercent(worst.plannedPercent)} — a shortfall of `
      + `${formatPercent(Math.abs(worst.variancePercent))}.`,
    );
  }

  const top = period.quantityByActivity.slice(0, 3);
  if (top.length) {
    paragraphs.push(
      `The main quantities booked in the period were ${top.map((item) => `${item.activity} (${formatNumber(item.actual, 2)} ${item.unit ?? ''})`.trim()).join(', ')}.`,
    );
  }

  const resources = context.resources.manpower;
  if (resources && Number.isFinite(resources.averageActual)) {
    paragraphs.push(
      `Average deployment over the period was ${formatNumber(resources.averageActual)} personnel`
      + (Number.isFinite(resources.averagePlanned) && resources.averagePlanned > 0
        ? ` against a plan of ${formatNumber(resources.averagePlanned)} — ${formatPercent(resources.fulfilment, 0)} of requirement`
        : '')
      + `, peaking at ${formatNumber(resources.peak)}.`,
    );
  }

  return paragraphs;
}

export function commercialCommentary(context) {
  const { evm, project, cash } = context;
  const currency = project?.currency;
  const paragraphs = [];

  if (evm.claimed || evm.certified) {
    paragraphs.push(
      `${formatMoney(evm.claimed, { currency })} has been claimed to date, of which `
      + `${formatMoney(evm.certified, { currency })} is certified and ${formatMoney(evm.paid, { currency })} paid`
      + (evm.withheld > 0 ? `, leaving ${formatMoney(evm.withheld, { currency })} under assessment.` : '.'),
    );
  }
  if (Number.isFinite(evm.financialPercent)) {
    paragraphs.push(
      `Financial progress is ${formatPercent(evm.financialPercent)} of contract value against physical progress of `
      + `${formatPercent(context.model.actualPercent)}`
      + (Math.abs(context.model.actualPercent - evm.financialPercent) > 0.05
        ? ` — a gap of ${formatPercent(Math.abs(context.model.actualPercent - evm.financialPercent))}, which should be reconciled against measurement.`
        : ', which is broadly consistent.'),
    );
  }
  if (cash.months.length && Number.isFinite(cash.variance)) {
    paragraphs.push(
      `Against the cash flow plan, ${formatMoney(cash.actualToDate, { currency })} has been drawn to date versus a plan of `
      + `${formatMoney(cash.plannedToDate, { currency })} (${formatPercent(cash.variance)} variance).`,
    );
  }
  return paragraphs;
}

export function qualitySafetyCommentary(context) {
  const { ncr, safety, safetyToDate } = context;
  const paragraphs = [];

  paragraphs.push(
    ncr.total
      ? `${plural(ncr.openCount, 'non-conformance')} remain open out of ${ncr.total} raised`
        + (Number.isFinite(ncr.oldest) ? `, the oldest open for ${plural(ncr.oldest, 'day')}` : '')
        + (Number.isFinite(ncr.averageClosureDays) ? `, with an average closure time of ${Math.round(ncr.averageClosureDays)} days.` : '.')
      : 'No non-conformance register has been provided for this period.',
  );

  paragraphs.push(
    safetyToDate.records.length
      ? `On safety, ${plural(safety.incidents, 'incident')} and ${plural(safety.lti, 'lost-time injury', 'lost-time injuries')} were recorded in the period`
        + (safety.nearMiss ? `, alongside ${plural(safety.nearMiss, 'near miss', 'near misses')}` : '')
        + (Number.isFinite(safetyToDate.manHours) && safetyToDate.manHours > 0
          ? `. ${formatNumber(safetyToDate.manHours)} man-hours have been worked to date`
            + (Number.isFinite(safetyToDate.ltiFrequencyRate) ? `, an LTI frequency rate of ${safetyToDate.ltiFrequencyRate.toFixed(2)} per million man-hours.` : '.')
          : '.')
      : 'No safety register has been provided for this period.',
  );

  return paragraphs;
}

export function riskCommentary(context) {
  const { risks, issues, hindrances } = context;
  const paragraphs = [];

  paragraphs.push(
    risks.all.length
      ? `${plural(risks.open.length, 'risk')} are open, of which ${risks.byBand.filter((band) => band.severity === 'Critical' || band.severity === 'High').reduce((total, band) => total + band.count, 0)} score high or above`
        + (risks.exposure ? `, carrying a combined exposure of ${formatMoney(risks.exposure)}` : '')
        + (risks.overdue.length ? `. ${plural(risks.overdue.length, 'mitigation')} ${risks.overdue.length === 1 ? 'is' : 'are'} past target date.` : '.')
      : 'No risk register has been provided for this period.',
  );

  if (issues.total || hindrances.total) {
    paragraphs.push(
      `${plural(issues.openCount, 'action')} and ${plural(hindrances.openCount, 'hindrance')} remain open`
      + (issues.overdue.length ? `, including ${plural(issues.overdue.length, 'action')} past due date` : '')
      + (Number.isFinite(hindrances.oldest) ? `. The oldest hindrance has been open for ${plural(hindrances.oldest, 'day')}.` : '.'),
    );
  }

  return paragraphs;
}

/** The recommendations block every report closes on. */
export function recommendations(context) {
  const { exceptions, model } = context;
  const out = [];

  const bySeverity = ['Critical', 'High'];
  for (const severity of bySeverity) {
    for (const item of exceptions.filter((exception) => exception.severity === severity).slice(0, 6)) {
      out.push({
        priority: severity,
        subject: item.subject,
        action: item.recommendation,
        owner: item.owner ?? 'Contractor',
        by: item.dueDate ?? null,
      });
    }
  }

  if (model.delayDays > 0 && !out.some((item) => /recovery programme/i.test(item.action))) {
    out.push({
      priority: 'High',
      subject: 'Recovery programme',
      action: `Contractor to submit a recovery programme addressing the ${plural(model.delayDays, 'day')} of forecast slippage, with resource histograms supporting it.`,
      owner: 'Contractor',
      by: null,
    });
  }
  if (context.readiness.counts.high > 0) {
    out.push({
      priority: 'Medium',
      subject: 'Reporting data',
      action: `Close the ${plural(context.readiness.counts.high, 'data gap')} identified in the data assurance section so subsequent reports can be issued without qualification.`,
      owner: 'PMO',
      by: null,
    });
  }

  return out.slice(0, 12);
}

/** The standing qualification a consulting report carries. */
export function basisOfReport(context) {
  const { model, readiness } = context;
  const lines = [
    `This report is prepared from the data uploaded to the reporting engine as at ${formatDate(model.asOf)}. `
    + `Physical progress is weighted by ${model.weightBasis === 'value' ? 'BOQ value' : model.weightBasis === 'weightage' ? 'the weightage stated in the programme' : model.weightBasis === 'duration' ? 'activity duration, in the absence of a BOQ' : 'equal activity weighting, in the absence of a BOQ or stated weightage'}.`,
  ];
  if (Number.isFinite(model.coverage.coverage)) {
    lines.push(`Daily progress reports cover ${formatPercent(model.coverage.coverage, 0)} of days since site reporting began (${model.coverage.reportedDays} of ${model.coverage.expectedDays} days).`);
  }
  if (readiness.counts.high) {
    lines.push(`${plural(readiness.counts.high, 'material data issue')} ${readiness.counts.high === 1 ? 'was' : 'were'} identified and ${readiness.counts.high === 1 ? 'is' : 'are'} set out in the data assurance section; conclusions should be read in that light.`);
  }
  lines.push('Figures are derived from contractor-submitted records and have not been independently verified on site unless stated otherwise.');
  return lines;
}

export { plural };
