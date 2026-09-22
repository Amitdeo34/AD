// Everything a report needs, computed once.
//
// The seven report types differ in what they show, not in how the numbers are
// arrived at. Building one context and rendering it seven ways is what stops
// the weekly and the monthly disagreeing with each other in front of a client.
import { buildModel } from '../analytics/model.js';
import {
  cashPosition, earnedValue, lookAhead, milestoneStatus, monthlyTrend,
  periodProgress, registerSummary, resourceSummary, riskSummary, safetySummary,
} from '../analytics/metrics.js';
import { closedExceptions, countBySeverity, detectExceptions, groupByCategory } from '../analytics/exceptions.js';
import { readiness } from '../quality.js';
import { formatDate, rangeLabel, startOfDay, withinRange } from '../dates.js';

/**
 * @param project   the project record
 * @param data      records keyed by document type
 * @param options   {from, to, asOf, previousExceptions, areas}
 */
export function buildContext(project, data, { from, to, asOf, previousExceptions = [], areas = null } = {}) {
  const model = buildModel(project, data, { asOf: asOf ?? to });
  const periodFrom = startOfDay(from) ?? model.start;
  // A month or quarter that has not finished yet still ends at the data date:
  // reporting progress "achieved" over days nobody has worked reads as a
  // collapse in performance that never happened.
  const requestedTo = startOfDay(to) ?? model.asOf;
  const periodTo = requestedTo > model.asOf ? model.asOf : requestedTo;

  const evm = earnedValue(model, { project });
  const cash = cashPosition(model);
  const safety = safetySummary(model, { from: periodFrom, to: periodTo });
  const safetyToDate = safetySummary(model);
  const resources = resourceSummary(model, { from: periodFrom, to: periodTo });
  const period = periodProgress(model, periodFrom, periodTo);
  const risks = riskSummary(model);
  const issues = registerSummary(data.issues ?? [], model.asOf);
  const ncr = registerSummary(data.ncr ?? [], model.asOf);
  const hindrances = registerSummary(data.hindrance ?? [], model.asOf);
  const milestones = milestoneStatus(model);

  const exceptions = detectExceptions(model, {
    from: periodFrom, to: periodTo, evm, cash, safety, resources, period, previous: previousExceptions,
  });

  const selectedAreas = areas?.length
    ? model.areas.filter((area) => areas.includes(area.name))
    : model.areas;

  return {
    project,
    model,
    period: {
      from: periodFrom,
      to: periodTo,
      label: rangeLabel(periodFrom, periodTo),
      ...period,
    },
    asOf: model.asOf,
    evm,
    cash,
    safety,
    safetyToDate,
    resources,
    risks,
    issues,
    ncr,
    hindrances,
    milestones,
    exceptions,
    exceptionsClosed: closedExceptions(exceptions, previousExceptions),
    exceptionsBySeverity: countBySeverity(exceptions),
    exceptionsByCategory: groupByCategory(exceptions),
    areas: selectedAreas,
    allAreas: model.areas,
    lookAhead: lookAhead(model, { weeks: 3 }),
    trend: monthlyTrend(model),
    readiness: readiness(data, model),
    // Records that fall inside the reporting period, for the "this period" cuts.
    inPeriod: {
      dpr: (data.dpr ?? []).filter((row) => withinRange(row.date, periodFrom, periodTo)),
      ncr: (data.ncr ?? []).filter((row) => withinRange(row.raisedOn, periodFrom, periodTo)),
      safety: (data.safety ?? []).filter((row) => withinRange(row.date, periodFrom, periodTo)),
      issues: (data.issues ?? []).filter((row) => withinRange(row.raisedOn, periodFrom, periodTo)),
      hindrance: (data.hindrance ?? []).filter((row) => withinRange(row.raisedOn, periodFrom, periodTo)),
      billing: (data.billing ?? []).filter((row) => withinRange(row.submittedOn ?? row.certifiedOn, periodFrom, periodTo)),
    },
    generatedAt: new Date(),
    dataDateLabel: formatDate(model.asOf),
  };
}
