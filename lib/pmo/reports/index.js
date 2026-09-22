// The report registry: what the engine can produce, and how to produce it.
import { buildContext } from './context.js';
import {
  areaWeeklyReport, digitalDprReport, interimReport, monthlyReport,
  quarterlyReport, scheduleUpdateReport, weeklyExceptionReport,
} from './types.js';
import { monthRange, quarterRange, rangeLabel, startOfDay, weekRange } from '../dates.js';

export const REPORT_TYPES = {
  'weekly-exception': {
    label: 'Weekly Exception Report',
    short: 'Weekly exception',
    period: 'week',
    description: 'What is off-track this week, why, who owns it and what should happen — with everything on-track left out.',
    needs: ['dpr'],
    uses: ['schedule', 'boq', 'milestones', 'risks', 'issues', 'ncr', 'safety', 'hindrance', 'procurement', 'drawings'],
    build: weeklyExceptionReport,
  },
  'area-weekly': {
    label: 'Area Weekly Tracking',
    short: 'Area weekly',
    period: 'week',
    description: 'The same week, cut by area or package — one section per area, with its own activities, exceptions and look-ahead.',
    needs: ['dpr'],
    uses: ['schedule', 'boq'],
    build: areaWeeklyReport,
    options: ['areas'],
  },
  interim: {
    label: 'Interim Report',
    short: 'Interim',
    period: 'custom',
    description: 'A full position over any period you choose — for a client review, a board paper or a contractual position.',
    needs: ['dpr'],
    uses: ['schedule', 'boq', 'milestones', 'billing', 'risks', 'issues', 'ncr', 'safety'],
    build: interimReport,
    options: ['purpose'],
  },
  monthly: {
    label: 'Monthly Progress Report',
    short: 'Monthly',
    period: 'month',
    description: 'The standard MPR: snapshot, progress, S-curve, earned value, milestones, resources, quality, safety, risk and look-ahead.',
    needs: ['dpr'],
    uses: ['schedule', 'boq', 'milestones', 'billing', 'cashflow', 'risks', 'issues', 'ncr', 'safety', 'hindrance'],
    build: monthlyReport,
  },
  quarterly: {
    label: 'Quarterly Progress Report',
    short: 'Quarterly',
    period: 'quarter',
    description: 'Board-level: month-on-month trend, position against contract, matters for decision and the outlook.',
    needs: ['dpr'],
    uses: ['schedule', 'boq', 'milestones', 'billing', 'cashflow', 'risks'],
    build: quarterlyReport,
  },
  'digital-dpr': {
    label: 'Digital DPR',
    short: 'Digital DPR',
    period: 'day',
    description: 'One day, digitised and checked: work executed, resources, hindrances, safety, quality and the cumulative position.',
    needs: ['dpr'],
    uses: ['schedule', 'boq', 'safety', 'ncr'],
    build: digitalDprReport,
    options: ['date'],
  },
  'schedule-update': {
    label: 'Schedule Update',
    short: 'Schedule update',
    period: 'to-date',
    description: 'The programme carried forward to the data date — actual dates, remaining durations, float, critical path and slippage, ready to paste back into P6 or MSP.',
    needs: ['schedule'],
    uses: ['dpr', 'boq', 'milestones'],
    build: scheduleUpdateReport,
  },
};

export const REPORT_TYPE_KEYS = Object.keys(REPORT_TYPES);

/** The period a report type defaults to, given a data date. */
export function defaultPeriod(type, asOf, { weekStartsOn = 1 } = {}) {
  const date = startOfDay(asOf) ?? startOfDay(new Date());
  switch (REPORT_TYPES[type]?.period) {
    case 'week': return weekRange(date, weekStartsOn);
    case 'month': return monthRange(date);
    case 'quarter': return quarterRange(date);
    case 'day': return { from: date, to: date, label: 'Single day' };
    default: return { from: null, to: date, label: 'Project to date' };
  }
}

/**
 * Generate a report.
 *
 * @param project  the project record
 * @param data     records keyed by document type
 * @param request  {type, from, to, asOf, options, previousExceptions}
 * @returns {{pack, context}} the pack is what every renderer consumes
 */
export function generateReport(project, data, request = {}) {
  const type = request.type ?? 'weekly-exception';
  const spec = REPORT_TYPES[type];
  if (!spec) throw new Error(`Unknown report type "${type}"`);

  const asOf = startOfDay(request.asOf) ?? null;
  const fallback = defaultPeriod(type, asOf ?? request.to, { weekStartsOn: project?.weekStartsOn ?? 1 });
  const from = startOfDay(request.from) ?? fallback.from;
  const to = startOfDay(request.to) ?? fallback.to;

  const context = buildContext(project, data, {
    from,
    to,
    asOf: asOf ?? to,
    previousExceptions: request.previousExceptions ?? [],
    areas: request.options?.areas ?? null,
  });

  const pack = spec.build(context, request.options ?? {});

  return {
    context,
    pack: {
      ...pack,
      meta: {
        project: project ? {
          name: project.name, code: project.code, client: project.client,
          contractor: project.contractor, consultant: project.consultant,
          location: project.location, currency: project.currency,
        } : null,
        period: { from, to, label: fallback.label ?? rangeLabel(from, to) },
        asOf: context.asOf,
        generatedAt: new Date(),
        reportType: type,
        reportTypeLabel: spec.label,
        dataReadiness: context.readiness.score,
      },
      // Carried into the stored report so the next period can tell what is new,
      // what is worsening and what has closed.
      exceptions: context.exceptions,
    },
  };
}

/**
 * Every report the project's data can support, in reading order.
 *
 * Used for the combined pack: one document a client can be given instead of
 * seven attachments.
 */
export function generateAllReports(project, data, request = {}) {
  const available = REPORT_TYPE_KEYS.filter((type) => (request.types ? request.types.includes(type) : true));
  return available.map((type) => generateReport(project, data, { ...request, type }));
}

export { buildContext };
