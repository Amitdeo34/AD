// Exception reporting: what a client needs to act on, and nothing else.
//
// A weekly pack that lists everything is read by nobody. Each rule below
// answers one question a project director would actually ask, states the
// number that triggered it, and names the action and the owner — because an
// exception without an owner is a complaint.
//
// Thresholds all come from the project record, so a metro viaduct and a
// hospital fit-out can be held to different standards without a code change.
import { addDays, daysBetween, formatDate, startOfDay, withinRange } from '../dates.js';
import { sum } from './model.js';
import { isOpen, milestoneStatus, registerSummary, riskSummary } from './metrics.js';
import { resolveThresholds } from '../thresholds.js';

export const SEVERITIES = ['Critical', 'High', 'Medium', 'Low'];
const RANK = new Map(SEVERITIES.map((severity, index) => [severity, index]));

const pct = (value) => `${(value * 100).toFixed(1)}%`;
const days = (value) => `${value} day${Math.abs(value) === 1 ? '' : 's'}`;

function exception(fields) {
  return {
    severity: 'Medium',
    category: 'Schedule',
    owner: null,
    dueDate: null,
    ...fields,
  };
}

// Each rule is (model, context) → exception[]. Adding a rule is adding one
// function to this list; nothing else in the engine changes.
const RULES = [];
const rule = (code, fn) => RULES.push({ code, fn });

rule('SCHEDULE_SLIP', (model, { thresholds }) => {
  const overall = model.delayDays;
  if (!Number.isFinite(overall) || overall <= 0) return [];
  return [exception({
    code: 'SCHEDULE_SLIP',
    title: 'Forecast completion is later than the contract date',
    severity: overall >= thresholds.slippageDaysCritical ? 'Critical' : overall >= thresholds.slippageDaysHigh ? 'High' : 'Medium',
    category: 'Schedule',
    subject: 'Project completion',
    detail: `Contract completion is ${formatDate(model.baselineFinish)}; the current forecast, built from measured productivity and the schedule logic, is ${formatDate(model.forecastFinish)} — a slippage of ${days(overall)}.`,
    metric: overall,
    metricLabel: 'Slippage',
    metricDisplay: days(overall),
    recommendation: 'Agree a recovery programme with the contractor covering the driving activities below, or initiate the time-extension process if the cause is not attributable to them.',
  })];
});

rule('PROGRESS_VARIANCE', (model, { thresholds }) => {
  const variance = model.variancePercent;
  if (variance >= -0.02) return [];
  return [exception({
    code: 'PROGRESS_VARIANCE',
    title: 'Physical progress is behind plan',
    severity: variance <= -0.15 ? 'Critical' : variance <= -0.05 ? 'High' : 'Medium',
    category: 'Progress',
    subject: 'Overall physical progress',
    detail: `Cumulative physical progress is ${pct(model.actualPercent)} against a planned ${pct(model.plannedPercent)}, a shortfall of ${pct(Math.abs(variance))} (weighted by ${model.weightBasis}).`,
    metric: variance,
    metricLabel: 'Variance',
    metricDisplay: pct(variance),
    recommendation: 'Contractor to submit a catch-up plan quantifying the additional resources and the sequence change needed to close the gap.',
  })];
});

rule('ACTIVITY_SLIP', (model, { thresholds }) => {
  const at = thresholds.slippageDaysHigh;
  return model.activities
    .filter((activity) => !activity.complete && (activity.slippageDays ?? 0) >= at)
    .sort((a, b) => b.slippageDays - a.slippageDays || b.weight - a.weight)
    .slice(0, 15)
    .map((activity) => exception({
      code: 'ACTIVITY_SLIP',
      title: 'Activity forecast to finish late',
      severity: activity.slippageDays >= thresholds.slippageDaysCritical
        ? (activity.isCritical ? 'Critical' : 'High')
        : (activity.isCritical ? 'High' : 'Medium'),
      category: 'Schedule',
      area: activity.area,
      subject: activity.name,
      reference: activity.wbsId,
      detail: `Baseline finish ${formatDate(activity.baselineFinish)}, forecast ${formatDate(activity.forecastFinish)} (${activity.forecastBasis}) — ${days(activity.slippageDays)} late at ${pct(activity.percentComplete)} complete.${activity.isCritical ? ' This activity is on the critical path.' : ''}`,
      metric: activity.slippageDays,
      metricLabel: 'Slippage',
      metricDisplay: days(activity.slippageDays),
      owner: activity.owner,
      recommendation: activity.productivity
        ? `Achieved rate is ${activity.productivity.toFixed(1)} ${activity.unit ?? 'unit'}/day; ${Math.ceil((activity.remainingQty ?? 0) / Math.max(activity.productivity, 0.01))} days of work remain. Raise deployment or add a second front to recover.`
        : 'Confirm the remaining quantity and the resources committed against it.',
    }));
});

rule('NOT_STARTED', (model) => model.activities
  .filter((activity) => !activity.started && activity.baselineStart && daysBetween(activity.baselineStart, model.asOf) > 0)
  .sort((a, b) => daysBetween(a.baselineStart, model.asOf) - daysBetween(b.baselineStart, model.asOf))
  .reverse()
  .slice(0, 10)
  .map((activity) => {
    const late = daysBetween(activity.baselineStart, model.asOf);
    return exception({
      code: 'NOT_STARTED',
      title: 'Activity not started against a passed baseline start',
      severity: late >= 30 ? 'High' : 'Medium',
      category: 'Schedule',
      area: activity.area,
      subject: activity.name,
      reference: activity.wbsId,
      detail: `Baseline start was ${formatDate(activity.baselineStart)} — ${days(late)} ago — and no progress has been reported against it.`,
      metric: late,
      metricLabel: 'Days late to start',
      metricDisplay: days(late),
      owner: activity.owner,
      recommendation: 'Confirm the constraint holding this activity and the date it will be released; if none, mobilise this week.',
    });
  }));

rule('STALLED', (model, { thresholds }) => model.activities
  .filter((activity) => activity.started && !activity.complete && Number.isFinite(activity.daysSinceProgress) && activity.daysSinceProgress > thresholds.noProgressDays)
  .sort((a, b) => b.daysSinceProgress - a.daysSinceProgress)
  .slice(0, 12)
  .map((activity) => exception({
    code: 'STALLED',
    title: 'Started activity showing no progress',
    severity: activity.daysSinceProgress > thresholds.noProgressDays * 3 ? 'High' : 'Medium',
    category: 'Progress',
    area: activity.area,
    subject: activity.name,
    reference: activity.wbsId,
    detail: `Last quantity booked ${formatDate(activity.lastProgressDate)} — ${days(activity.daysSinceProgress)} with no reported progress, at ${pct(activity.percentComplete)} complete.`,
    metric: activity.daysSinceProgress,
    metricLabel: 'Idle',
    metricDisplay: days(activity.daysSinceProgress),
    owner: activity.owner,
    recommendation: 'Establish whether the work has genuinely stopped or the DPR is not capturing it; both need closing out this week.',
  })));

rule('PERIOD_SHORTFALL', (model, { thresholds, period }) => {
  if (!period || period.achievement === null || period.achievement >= thresholds.productivityShortfall) return [];
  return [exception({
    code: 'PERIOD_SHORTFALL',
    title: 'Progress in the period fell short of plan',
    severity: period.achievement < 0.5 ? 'High' : 'Medium',
    category: 'Progress',
    subject: 'Period achievement',
    detail: `The period earned ${pct(period.actualGain)} against a planned ${pct(period.plannedGain)} — ${pct(period.achievement)} of the planned output.`,
    metric: period.achievement,
    metricLabel: 'Achievement',
    metricDisplay: pct(period.achievement),
    recommendation: 'Re-baseline the coming look-ahead against demonstrated productivity rather than the original plan, and escalate the resourcing gap.',
  })];
});

rule('MANPOWER_DEFICIT', (model, { thresholds, resources }) => {
  const fulfilment = resources?.manpower?.fulfilment;
  if (!Number.isFinite(fulfilment) || fulfilment >= thresholds.manpowerShortfall) return [];
  return [exception({
    code: 'MANPOWER_DEFICIT',
    title: 'Manpower deployment below plan',
    severity: fulfilment < 0.6 ? 'High' : 'Medium',
    category: 'Resources',
    subject: 'Manpower deployment',
    detail: `Average deployment was ${Math.round(resources.manpower.averageActual)} against a planned ${Math.round(resources.manpower.averagePlanned)} — ${pct(fulfilment)} of requirement.`,
    metric: fulfilment,
    metricLabel: 'Fulfilment',
    metricDisplay: pct(fulfilment),
    recommendation: 'Contractor to close the gap within the week and confirm the mobilisation plan for the next look-ahead.',
  })];
});

rule('EQUIPMENT_IDLE', (model, { resources }) => {
  const idle = resources?.equipment?.idleDays ?? 0;
  if (idle < 5) return [];
  return [exception({
    code: 'EQUIPMENT_IDLE',
    title: 'Plant standing idle',
    severity: idle > 20 ? 'High' : 'Medium',
    category: 'Resources',
    subject: 'Equipment utilisation',
    detail: `${idle} equipment-days were recorded idle or under breakdown in the period.`,
    metric: idle,
    metricLabel: 'Idle equipment-days',
    metricDisplay: `${idle} days`,
    recommendation: 'Review the deployment plan against the front availability; released plant should be demobilised rather than charged to the project.',
  })];
});

rule('MILESTONE_RISK', (model) => milestoneStatus(model)
  .filter((milestone) => milestone.atRisk)
  .map((milestone) => exception({
    code: 'MILESTONE_RISK',
    title: 'Contract milestone at risk',
    severity: (milestone.slippageDays ?? 0) > 30 ? 'Critical' : 'High',
    category: 'Schedule',
    area: milestone.area,
    subject: milestone.name,
    reference: milestone.milestoneId,
    detail: `Contract date ${formatDate(milestone.baselineDate)}, forecast ${formatDate(milestone.forecastDate)} — ${days(milestone.slippageDays)} late.${milestone.penaltyExposure ? ` Liquidated damages exposure of ${Math.round(milestone.penaltyExposure).toLocaleString('en-IN')} applies.` : ''}`,
    metric: milestone.slippageDays,
    metricLabel: 'Slippage',
    metricDisplay: days(milestone.slippageDays),
    owner: milestone.owner,
    recommendation: 'Escalate to the steering committee with a recovery plan or a formal position on the extension of time.',
  })));

rule('HINDRANCE_OPEN', (model, { thresholds }) => {
  const register = registerSummary(model.data.hindrance ?? [], model.asOf);
  return register.open
    .filter((item) => (item.ageDays ?? 0) >= thresholds.hindranceAgeingDays)
    .sort((a, b) => (b.ageDays ?? 0) - (a.ageDays ?? 0))
    .slice(0, 12)
    .map((item) => exception({
      code: 'HINDRANCE_OPEN',
      title: 'Hindrance open beyond threshold',
      severity: (item.ageDays ?? 0) >= thresholds.hindranceAgeingDays * 3 ? 'High' : 'Medium',
      category: 'Constraints',
      area: item.area,
      subject: item.description,
      reference: item.hindranceId,
      detail: `Open since ${formatDate(item.raisedOn)} — ${days(item.ageDays)}. ${item.affectedActivity ? `Affects: ${item.affectedActivity}. ` : ''}${item.responsibility ? `Attributable to ${item.responsibility}.` : ''}`,
      metric: item.ageDays,
      metricLabel: 'Open for',
      metricDisplay: days(item.ageDays),
      owner: item.responsibility,
      recommendation: 'Fix a clearance date this week; an open hindrance attributable to the client is the strongest ground the contractor has for a claim.',
    }));
});

rule('NCR_AGEING', (model, { thresholds }) => {
  const register = registerSummary(model.data.ncr ?? [], model.asOf);
  return register.open
    .filter((item) => (item.ageDays ?? 0) >= thresholds.ncrAgeingDays)
    .sort((a, b) => (b.ageDays ?? 0) - (a.ageDays ?? 0))
    .slice(0, 12)
    .map((item) => exception({
      code: 'NCR_AGEING',
      title: 'Non-conformance open beyond threshold',
      severity: /major|critical|high/i.test(item.severity ?? '') ? 'High' : 'Medium',
      category: 'Quality',
      area: item.area,
      subject: item.description,
      reference: item.ncrId,
      detail: `Raised ${formatDate(item.raisedOn)} — open ${days(item.ageDays)}${item.severity ? `, severity ${item.severity}` : ''}.`,
      metric: item.ageDays,
      metricLabel: 'Open for',
      metricDisplay: days(item.ageDays),
      owner: item.owner,
      recommendation: 'Close out with documented corrective action; work in the affected area should not proceed to the next stage until it is signed off.',
    }));
});

rule('SAFETY_INCIDENT', (model, { safety, period }) => {
  if (!safety || (!safety.lti && !safety.incidents)) return [];
  return [exception({
    code: 'SAFETY_INCIDENT',
    title: safety.lti ? 'Lost-time injury recorded' : 'Safety incident recorded',
    severity: safety.lti ? 'Critical' : 'High',
    category: 'Safety',
    subject: 'EHS performance',
    detail: `${safety.incidents} incident(s) and ${safety.lti} lost-time injur${safety.lti === 1 ? 'y' : 'ies'} were recorded in the period${safety.nearMiss ? `, alongside ${safety.nearMiss} near miss(es)` : ''}.`,
    metric: safety.lti || safety.incidents,
    metricLabel: safety.lti ? 'LTIs' : 'Incidents',
    metricDisplay: String(safety.lti || safety.incidents),
    recommendation: 'Investigation report and corrective actions to be tabled at the next review; toolbox talks to cover the identified cause across all fronts.',
  })];
});

rule('RISK_HIGH', (model, { thresholds }) => {
  const risks = riskSummary(model);
  return risks.open
    .filter((risk) => risk.score >= thresholds.riskScoreHigh)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((risk) => exception({
      code: 'RISK_HIGH',
      title: 'High-scoring open risk',
      severity: risk.score >= 20 ? 'Critical' : 'High',
      category: 'Risk',
      area: risk.area,
      subject: risk.description,
      reference: risk.riskId,
      detail: `Probability ${risk.probability} × impact ${risk.impact} = ${risk.score} (${risk.band}).${risk.scheduleImpact ? ` Potential schedule impact ${days(risk.scheduleImpact)}.` : ''}${risk.overdue ? ' Mitigation is past its target date.' : ''}`,
      metric: risk.score,
      metricLabel: 'Risk score',
      metricDisplay: String(risk.score),
      owner: risk.owner,
      dueDate: risk.dueDate,
      recommendation: risk.mitigation ? `Agreed mitigation: ${risk.mitigation}. Confirm progress against it.` : 'No mitigation recorded — assign an owner and a response this week.',
    }));
});

rule('ISSUE_OVERDUE', (model, { thresholds }) => {
  const register = registerSummary(model.data.issues ?? [], model.asOf);
  return register.open
    .filter((item) => item.overdue || (item.ageDays ?? 0) >= thresholds.issueAgeingDays)
    .sort((a, b) => (b.ageDays ?? 0) - (a.ageDays ?? 0))
    .slice(0, 12)
    .map((item) => exception({
      code: 'ISSUE_OVERDUE',
      title: item.overdue ? 'Action past its due date' : 'Action open beyond threshold',
      severity: /high|critical|urgent/i.test(item.priority ?? '') ? 'High' : 'Medium',
      category: 'Actions',
      area: item.area,
      subject: item.description,
      reference: item.issueId,
      detail: `Raised ${formatDate(item.raisedOn)}${item.dueDate ? `, due ${formatDate(item.dueDate)}` : ''} — open ${days(item.ageDays)}.`,
      metric: item.ageDays,
      metricLabel: 'Open for',
      metricDisplay: days(item.ageDays),
      owner: item.owner,
      dueDate: item.dueDate,
      recommendation: 'Confirm a revised closure date with the owner, or escalate if it is blocked.',
    }));
});

rule('DRAWING_DELAY', (model, { thresholds }) => (model.data.drawings ?? [])
  .filter((drawing) => !drawing.approvedOn && drawing.requiredBy && daysBetween(drawing.requiredBy, addDays(model.asOf, thresholds.drawingLeadDays)) >= 0)
  .sort((a, b) => startOfDay(a.requiredBy) - startOfDay(b.requiredBy))
  .slice(0, 12)
  .map((drawing) => {
    const late = daysBetween(drawing.requiredBy, model.asOf);
    return exception({
      code: 'DRAWING_DELAY',
      title: late > 0 ? 'Drawing overdue for approval' : 'Drawing approval due shortly',
      severity: late > 0 ? 'High' : 'Medium',
      category: 'Design',
      area: drawing.area,
      subject: `${drawing.drawingNo ?? ''} ${drawing.title ?? ''}`.trim(),
      reference: drawing.drawingNo,
      detail: late > 0
        ? `Required by ${formatDate(drawing.requiredBy)} — ${days(late)} overdue. Current status: ${drawing.status ?? 'not recorded'}.`
        : `Required by ${formatDate(drawing.requiredBy)}, currently ${drawing.status ?? 'not recorded'}.`,
      metric: late,
      metricLabel: 'Overdue',
      metricDisplay: late > 0 ? days(late) : `${days(-late)} to go`,
      owner: drawing.owner,
      dueDate: drawing.requiredBy,
      recommendation: 'Design release to be confirmed with the consultant; site fronts dependent on this drawing should be re-sequenced if it will not land.',
    });
  }));

rule('PROCUREMENT_DELAY', (model, { thresholds }) => (model.data.procurement ?? [])
  .filter((item) => !item.deliveredOn && item.requiredBy && daysBetween(item.requiredBy, addDays(model.asOf, thresholds.procurementLeadDays)) >= 0)
  .sort((a, b) => startOfDay(a.requiredBy) - startOfDay(b.requiredBy))
  .slice(0, 12)
  .map((item) => {
    const late = daysBetween(item.requiredBy, model.asOf);
    return exception({
      code: 'PROCUREMENT_DELAY',
      title: late > 0 ? 'Material not delivered by the date site needs it' : 'Material delivery due shortly',
      severity: late > 0 ? 'High' : 'Medium',
      category: 'Procurement',
      area: item.area,
      subject: item.description,
      reference: item.itemCode,
      detail: late > 0
        ? `Required on site by ${formatDate(item.requiredBy)} — ${days(late)} overdue.${item.orderedOn ? ` Ordered ${formatDate(item.orderedOn)}.` : ' No purchase order recorded.'}`
        : `Required on site by ${formatDate(item.requiredBy)}; status ${item.status ?? 'not recorded'}.`,
      metric: late,
      metricLabel: 'Overdue',
      metricDisplay: late > 0 ? days(late) : `${days(-late)} to go`,
      owner: item.owner,
      dueDate: item.requiredBy,
      recommendation: late > 0 ? 'Obtain a committed delivery date and assess the impact on the dependent activities.' : 'Confirm dispatch and inspection readiness.',
    });
  }));

rule('BILLING_LAG', (model, { evm }) => {
  const out = [];
  if (evm.claimed > 0 && evm.certified / evm.claimed < 0.85) {
    out.push(exception({
      code: 'BILLING_LAG',
      title: 'Certification lagging behind claims',
      severity: 'Medium',
      category: 'Commercial',
      subject: 'Interim payment certification',
      detail: `${Math.round(evm.certified).toLocaleString('en-IN')} certified against ${Math.round(evm.claimed).toLocaleString('en-IN')} claimed — ${pct(evm.certified / evm.claimed)} of the claim.`,
      metric: evm.certified / evm.claimed,
      metricLabel: 'Certified',
      metricDisplay: pct(evm.certified / evm.claimed),
      recommendation: 'Close out the measurement queries holding certification; an unresolved gap becomes a commercial dispute.',
    }));
  }
  if (Number.isFinite(evm.financialPercent) && Number.isFinite(model.actualPercent)
      && model.actualPercent - evm.financialPercent > 0.1) {
    out.push(exception({
      code: 'BILLING_LAG',
      title: 'Financial progress well behind physical progress',
      severity: 'Medium',
      category: 'Commercial',
      subject: 'Physical vs financial progress',
      detail: `Physical progress is ${pct(model.actualPercent)} while certified value stands at ${pct(evm.financialPercent)} of contract value — a gap of ${pct(model.actualPercent - evm.financialPercent)}.`,
      metric: model.actualPercent - evm.financialPercent,
      metricLabel: 'Gap',
      metricDisplay: pct(model.actualPercent - evm.financialPercent),
      recommendation: 'Reconcile measured quantities with the bills raised; either work is unbilled or progress is being over-reported.',
    }));
  }
  return out;
});

rule('CPI_LOW', (model, { evm, thresholds }) => {
  if (!Number.isFinite(evm.cpi) || evm.cpi >= thresholds.cpiAmber) return [];
  return [exception({
    code: 'CPI_LOW',
    title: 'Cost performance below par',
    severity: evm.cpi < thresholds.cpiRed ? 'High' : 'Medium',
    category: 'Commercial',
    subject: 'Cost performance index',
    detail: `CPI is ${evm.cpi.toFixed(2)} (earned ${Math.round(evm.ev).toLocaleString('en-IN')} against ${Math.round(evm.ac).toLocaleString('en-IN')} certified). At this rate the forecast at completion is ${Math.round(evm.eac).toLocaleString('en-IN')} against a budget of ${Math.round(evm.bac).toLocaleString('en-IN')}.`,
    metric: evm.cpi,
    metricLabel: 'CPI',
    metricDisplay: evm.cpi.toFixed(2),
    recommendation: 'Review the variance orders and rate claims driving the overrun before the next certification.',
  })];
});

rule('CASHFLOW_VARIANCE', (model, { thresholds, cash }) => {
  if (!cash || !Number.isFinite(cash.variance) || Math.abs(cash.variance) < thresholds.cashflowVariance) return [];
  return [exception({
    code: 'CASHFLOW_VARIANCE',
    title: cash.variance < 0 ? 'Spend behind the cash flow plan' : 'Spend ahead of the cash flow plan',
    severity: 'Medium',
    category: 'Commercial',
    subject: 'Cash flow',
    detail: `${Math.round(cash.actualToDate).toLocaleString('en-IN')} certified to date against a plan of ${Math.round(cash.plannedToDate).toLocaleString('en-IN')} — ${pct(Math.abs(cash.variance))} ${cash.variance < 0 ? 'below' : 'above'} plan.`,
    metric: cash.variance,
    metricLabel: 'Variance',
    metricDisplay: pct(cash.variance),
    recommendation: 'Re-profile the remaining drawdown so the client’s funding release matches the revised programme.',
  })];
});

rule('QUANTITY_OVERRUN', (model, { thresholds }) => model.activities
  .filter((activity) => Number.isFinite(activity.scopeQty) && activity.scopeQty > 0
    && Number.isFinite(activity.doneQty) && activity.doneQty > activity.scopeQty * thresholds.quantityOverrun)
  .sort((a, b) => (b.doneQty / b.scopeQty) - (a.doneQty / a.scopeQty))
  .slice(0, 10)
  .map((activity) => exception({
    code: 'QUANTITY_OVERRUN',
    title: 'Executed quantity exceeds the BOQ',
    severity: activity.doneQty > activity.scopeQty * 1.15 ? 'High' : 'Medium',
    category: 'Commercial',
    area: activity.area,
    subject: activity.name,
    reference: activity.wbsId,
    detail: `${activity.doneQty.toFixed(2)} ${activity.unit ?? ''} booked against a BOQ quantity of ${activity.scopeQty.toFixed(2)} — ${pct(activity.doneQty / activity.scopeQty - 1)} over.`,
    metric: activity.doneQty / activity.scopeQty,
    metricLabel: 'Of BOQ',
    metricDisplay: pct(activity.doneQty / activity.scopeQty),
    recommendation: 'Establish whether this is a genuine scope variation requiring a variation order, or a measurement error in the DPR.',
  })));

rule('REPORTING_GAP', (model, { thresholds, period }) => {
  const out = [];
  const gaps = (model.coverage.gaps ?? []).filter((gap) => gap.days > thresholds.dprGapDays);
  const recent = gaps.filter((gap) => daysBetween(gap.to, model.asOf) <= 45);
  if (recent.length) {
    const lost = sum(recent.map((gap) => gap.days));
    out.push(exception({
      code: 'REPORTING_GAP',
      title: 'Days missing from the daily progress record',
      severity: lost > 10 ? 'High' : 'Medium',
      category: 'Governance',
      subject: 'DPR submission',
      detail: `${lost} day(s) have no DPR in the last six weeks (${recent.slice(0, 3).map((gap) => (gap.days === 1 ? formatDate(gap.from) : `${formatDate(gap.from)}–${formatDate(gap.to)}`)).join('; ')}${recent.length > 3 ? ' and others' : ''}). Progress in those periods cannot be evidenced.`,
      metric: lost,
      metricLabel: 'Missing days',
      metricDisplay: days(lost),
      recommendation: 'Contractor to submit the outstanding DPRs; unreported days weaken both the client’s and the contractor’s position in any later claim.',
    }));
  }
  const stale = model.coverage.lastReported ? daysBetween(model.coverage.lastReported, model.asOf) : null;
  if (Number.isFinite(stale) && stale > thresholds.dprGapDays) {
    out.push(exception({
      code: 'REPORTING_GAP',
      title: 'Daily progress reporting is not current',
      severity: stale > 7 ? 'High' : 'Medium',
      category: 'Governance',
      subject: 'DPR currency',
      detail: `The most recent DPR is dated ${formatDate(model.coverage.lastReported)}, ${days(stale)} before the data date of this report.`,
      metric: stale,
      metricLabel: 'Days behind',
      metricDisplay: days(stale),
      recommendation: 'Bring reporting current before the next review; all figures in this report carry that qualification.',
    }));
  }
  return out;
});

rule('UNSCHEDULED_WORK', (model) => {
  // Deliberately not filtered by weight: work outside the programme has no
  // BOQ line and therefore no weight, which is precisely the finding.
  const orphans = model.activities.filter((activity) => !activity.scheduled);
  if (!orphans.length) return [];
  return [exception({
    code: 'UNSCHEDULED_WORK',
    title: 'Work being reported that is not in the programme',
    severity: orphans.length > 5 ? 'High' : 'Medium',
    category: 'Governance',
    subject: 'Schedule integrity',
    detail: `${orphans.length} activit${orphans.length === 1 ? 'y is' : 'ies are'} being reported in the DPR with no matching line in the baseline programme: ${orphans.slice(0, 5).map((activity) => activity.name).join('; ')}${orphans.length > 5 ? ' and others' : ''}.`,
    metric: orphans.length,
    metricLabel: 'Unmatched activities',
    metricDisplay: String(orphans.length),
    recommendation: 'Either map these to existing programme lines or issue a revised schedule; progress against unscheduled work cannot be measured or certified.',
  })];
});

/**
 * Run every rule.
 *
 * @param model    the project model
 * @param context  {from, to, evm, cash, safety, resources, period, previous}
 * @returns exceptions, most severe first, each stamped with an id so it can be
 *          carried forward and tracked week to week
 */
export function detectExceptions(model, context = {}) {
  // Never read a threshold straight off the project: a missing one would not
  // fail, it would quietly make a rule fire always or never.
  const thresholds = resolveThresholds(model.project?.thresholds ?? {});
  const ctx = { ...context, thresholds };
  const raised = [];

  for (const { code, fn } of RULES) {
    let produced = [];
    try {
      produced = fn(model, ctx) ?? [];
    } catch (err) {
      // A rule that cannot run must not take the report down with it.
      produced = [exception({
        code: 'RULE_ERROR',
        title: `Check "${code}" could not be evaluated`,
        severity: 'Low',
        category: 'Governance',
        subject: code,
        detail: `The engine could not evaluate this check: ${err.message}. The underlying data may be incomplete.`,
        recommendation: 'Review the source data for this area; the rest of the report is unaffected.',
      })];
    }
    raised.push(...produced);
  }

  const previous = new Map((context.previous ?? []).map((item) => [item.id, item]));

  const stamped = raised.map((item) => {
    const id = `${item.code}:${(item.reference ?? item.subject ?? '').toString().toLowerCase().replace(/\s+/g, '-').slice(0, 60)}`;
    const before = previous.get(id);
    return {
      ...item,
      id,
      raisedOn: before?.raisedOn ?? (context.to ? startOfDay(context.to) : model.asOf),
      firstSeen: before?.firstSeen ?? before?.raisedOn ?? null,
      periodsOpen: (before?.periodsOpen ?? 0) + 1,
      isNew: !before,
      trend: before
        ? (Number.isFinite(item.metric) && Number.isFinite(before.metric)
          ? (item.metric > before.metric ? 'Worsening' : item.metric < before.metric ? 'Improving' : 'Unchanged')
          : 'Unchanged')
        : 'New',
    };
  });

  stamped.sort((a, b) => RANK.get(a.severity) - RANK.get(b.severity)
    || (b.metric ?? 0) - (a.metric ?? 0));

  return stamped;
}

/** Exceptions raised last period that no rule raised this period. */
export function closedExceptions(current, previous = []) {
  const live = new Set(current.map((item) => item.id));
  return previous.filter((item) => !live.has(item.id));
}

export function countBySeverity(exceptions) {
  return SEVERITIES.map((severity) => ({
    severity,
    count: exceptions.filter((item) => item.severity === severity).length,
  }));
}

export function groupByCategory(exceptions) {
  const groups = new Map();
  for (const item of exceptions) {
    if (!groups.has(item.category)) groups.set(item.category, []);
    groups.get(item.category).push(item);
  }
  return [...groups.entries()]
    .map(([category, items]) => ({ category, items, count: items.length }))
    .sort((a, b) => b.count - a.count);
}
