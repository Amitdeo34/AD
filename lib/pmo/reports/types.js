// The seven deliverables.
//
// Each builder decides what its audience needs to see; none of them computes
// anything. A weekly exception report is read in five minutes by someone who
// will act; a monthly is read by a steering committee; a quarterly is read by
// a board. The difference is selection and emphasis, and that is all these
// functions do.
import {
  activityTable, areaChart, areaTable, callout, chart, exceptionTable, exceptions as exceptionBlock,
  kpis, list, lookAheadTable, manpowerChart, milestoneTable, narrative, registerTable,
  riskTable, scurveChart, section, severityChart, table, col,
} from './blocks.js';
import {
  basisOfReport, commercialCommentary, executiveSummary, formatMoney, formatNumber, formatPercent,
  overallStatus, progressCommentary, qualitySafetyCommentary, recommendations, riskCommentary,
  scheduleCommentary,
} from './narrative.js';
import { formatDate, formatMonth, isoDay, rangeLabel, startOfDay, withinRange } from '../dates.js';

const kpi = (label, value, sub, tone) => ({ label, value, sub, tone });

function headlineKpis(context) {
  const { model, evm, exceptions, project } = context;
  const status = overallStatus(context);
  return [
    kpi('Overall status', status.rag, status.label.split('—')[1]?.trim(), status.rag.toLowerCase()),
    kpi('Physical progress', formatPercent(model.actualPercent), `Planned ${formatPercent(model.plannedPercent)}`,
      model.variancePercent < -0.05 ? 'red' : model.variancePercent < -0.02 ? 'amber' : 'green'),
    kpi('Variance', formatPercent(model.variancePercent), `Weighted by ${model.weightBasis}`,
      model.variancePercent < -0.05 ? 'red' : model.variancePercent < 0 ? 'amber' : 'green'),
    kpi('Forecast completion', formatDate(model.forecastFinish),
      model.baselineFinish ? `Contract ${formatDate(model.baselineFinish)}` : 'No contract date set',
      (model.delayDays ?? 0) > 30 ? 'red' : (model.delayDays ?? 0) > 0 ? 'amber' : 'green'),
    Number.isFinite(model.delayDays)
      ? kpi('Slippage', `${model.delayDays} d`, model.delayDays > 0 ? 'Behind contract date' : 'Within contract date',
        model.delayDays > 30 ? 'red' : model.delayDays > 0 ? 'amber' : 'green')
      : null,
    Number.isFinite(evm.spi)
      ? kpi('SPI', evm.spi.toFixed(2), 'Schedule performance', evm.spi < 0.85 ? 'red' : evm.spi < 0.95 ? 'amber' : 'green')
      : null,
    Number.isFinite(evm.cpi)
      ? kpi('CPI', evm.cpi.toFixed(2), 'Cost performance', evm.cpi < 0.85 ? 'red' : evm.cpi < 0.95 ? 'amber' : 'green')
      : null,
    evm.bac ? kpi('Certified to date', formatMoney(evm.certified, { currency: project?.currency }),
      `${formatPercent(evm.financialPercent ?? 0)} of ${formatMoney(evm.bac, { currency: project?.currency })}`) : null,
    kpi('Open exceptions', String(exceptions.length),
      `${exceptions.filter((item) => item.severity === 'Critical').length} critical, ${exceptions.filter((item) => item.severity === 'High').length} high`,
      exceptions.some((item) => item.severity === 'Critical') ? 'red' : exceptions.some((item) => item.severity === 'High') ? 'amber' : 'green'),
  ].filter(Boolean);
}

function dataAssuranceSection(context) {
  const { readiness } = context;
  return section('data-assurance', 'Data assurance', [
    callout(
      readiness.score >= 85 ? 'good' : readiness.score >= 60 ? 'warn' : 'bad',
      `Data readiness: ${readiness.score}/100 — ${readiness.grade}`,
      `${readiness.counts.high} material, ${readiness.counts.medium} moderate and ${readiness.counts.low} minor observations on the underlying data.`,
    ),
    readiness.findings.length
      ? table([
        col('severity', 'Severity'),
        col('area', 'Source'),
        col('message', 'Observation', 'text', { width: 48 }),
        col('detail', 'Why it matters', 'text', { width: 44 }),
        col('fix', 'To resolve', 'text', { width: 40 }),
      ], readiness.findings.map((item) => ({
        ...item,
        severity: item.severity === 'high' ? 'Material' : item.severity === 'medium' ? 'Moderate' : 'Minor',
        _tone: item.severity === 'high' ? 'bad' : item.severity === 'medium' ? 'warn' : null,
      })), { emptyText: 'No data issues identified.' })
      : callout('good', 'No data issues identified', 'The uploaded data is internally consistent and complete for the reporting period.'),
    narrative(basisOfReport(context), { title: 'Basis of this report' }),
  ], { pageBreak: true });
}

// ------------------------------------------------------- 1. weekly exception

export function weeklyExceptionReport(context) {
  const { model, exceptions, period, lookAhead } = context;
  const criticalAndHigh = exceptions.filter((item) => item.severity === 'Critical' || item.severity === 'High');

  return {
    type: 'weekly-exception',
    title: 'Weekly Exception Report',
    subtitle: `${period.label} · data date ${formatDate(model.asOf)}`,
    kpis: headlineKpis(context),
    sections: [
      section('summary', 'Executive summary', [
        narrative(executiveSummary(context)),
        kpis(headlineKpis(context)),
      ]),

      section('exceptions', 'Exceptions requiring attention', [
        severityChart(context.exceptionsBySeverity),
        criticalAndHigh.length
          ? exceptionBlock(criticalAndHigh, { title: 'Critical and high severity' })
          : callout('good', 'No critical or high severity exceptions', 'Nothing this period breaches the critical or high thresholds agreed for this project.'),
        exceptions.filter((item) => item.severity === 'Medium' || item.severity === 'Low').length
          ? exceptionTable(exceptions.filter((item) => item.severity === 'Medium' || item.severity === 'Low'))
          : null,
      ]),

      context.exceptionsClosed.length
        ? section('closed', 'Closed since last report', [
          narrative(`${context.exceptionsClosed.length} exception(s) raised previously are no longer triggered. They are listed here so the client can see movement, not only problems.`),
          table([
            col('severity', 'Severity', 'severity'),
            col('category', 'Category'),
            col('subject', 'Subject', 'text', { width: 40 }),
            col('detail', 'Previously reported', 'text', { width: 56 }),
          ], context.exceptionsClosed, { emptyText: 'None.' }),
        ])
        : null,

      section('schedule', 'Schedule position', [
        narrative(scheduleCommentary(context)),
        scurveChart(model),
        activityTable(
          [...model.activities]
            .filter((activity) => !activity.complete)
            .sort((a, b) => (b.slippageDays ?? 0) - (a.slippageDays ?? 0) || b.weight - a.weight),
          { limit: 20 },
        ),
      ], { pageBreak: true }),

      context.milestones.length
        ? section('milestones', 'Milestone watch', [milestoneTable(context.milestones.filter((milestone) => !milestone.achieved || milestone.slippageDays > 0))])
        : null,

      section('lookahead', `Three-week look-ahead (${rangeLabel(lookAhead.from, lookAhead.to)})`, [
        lookAheadTable(lookAhead),
        lookAhead.procurement.length
          ? table([
            col('itemCode', 'Ref'), col('description', 'Material', 'text', { width: 40 }),
            col('requiredBy', 'Required by', 'date'), col('status', 'Status'), col('owner', 'Owner'),
          ], lookAhead.procurement, { note: 'Materials required on site within the look-ahead window.' })
          : null,
        lookAhead.drawings.length
          ? table([
            col('drawingNo', 'Drawing'), col('title', 'Title', 'text', { width: 40 }),
            col('requiredBy', 'Required by', 'date'), col('status', 'Status'), col('owner', 'Owner'),
          ], lookAhead.drawings, { note: 'Design releases required within the look-ahead window.' })
          : null,
      ], { pageBreak: true }),

      section('actions', 'Recommended actions', [
        table([
          col('priority', 'Priority', 'severity'),
          col('subject', 'Subject', 'text', { width: 30 }),
          col('action', 'Action', 'text', { width: 60 }),
          col('owner', 'Owner'),
          col('by', 'By', 'date'),
        ], recommendations(context), { emptyText: 'No actions arising.' }),
      ]),

      dataAssuranceSection(context),
    ].filter(Boolean),
  };
}

// ----------------------------------------------------- 2. area weekly tracking

export function areaWeeklyReport(context, { areas } = {}) {
  const selected = areas?.length ? context.allAreas.filter((area) => areas.includes(area.name)) : context.allAreas;
  const names = selected.map((area) => area.name);
  const areaExceptions = context.exceptions.filter((item) => !item.area || names.includes(item.area));

  return {
    type: 'area-weekly',
    title: 'Area Weekly Tracking Report',
    subtitle: `${names.length === context.allAreas.length ? 'All areas' : names.join(', ')} · ${context.period.label}`,
    kpis: [
      kpi('Areas tracked', String(selected.length), `of ${context.allAreas.length} on the project`),
      ...headlineKpis(context).slice(1, 5),
    ],
    sections: [
      section('summary', 'Area summary', [
        narrative(progressCommentary(context)),
        areaTable(selected),
        areaChart(selected),
      ]),

      ...selected.map((area) => section(`area-${isoDay(context.asOf)}-${area.name.replace(/\W+/g, '-').toLowerCase()}`, `${area.name}`, [
        kpis([
          kpi('Weight of project', formatPercent(area.weight)),
          kpi('Actual', formatPercent(area.actualPercent), `Planned ${formatPercent(area.plannedPercent)}`,
            area.variancePercent < -0.05 ? 'red' : area.variancePercent < 0 ? 'amber' : 'green'),
          kpi('Variance', formatPercent(area.variancePercent)),
          kpi('Activities', `${area.complete}/${area.activityCount}`, 'complete'),
          area.worstSlippageDays !== null ? kpi('Worst slippage', `${area.worstSlippageDays} d`, null,
            area.worstSlippageDays > 14 ? 'red' : area.worstSlippageDays > 0 ? 'amber' : 'green') : null,
          kpi('Forecast finish', formatDate(area.forecastFinish), area.baselineFinish ? `Baseline ${formatDate(area.baselineFinish)}` : null),
        ].filter(Boolean)),
        activityTable([...area.activities].sort((a, b) => (b.slippageDays ?? 0) - (a.slippageDays ?? 0)), { showArea: false }),
        areaExceptions.filter((item) => item.area === area.name).length
          ? exceptionBlock(areaExceptions.filter((item) => item.area === area.name), { title: `Exceptions — ${area.name}` })
          : null,
      ], { pageBreak: true })),

      section('resources', 'Resources across the tracked areas', [
        manpowerChart(context.resources),
        narrative(progressCommentary(context).slice(-1)),
      ]),

      section('lookahead', 'Look-ahead', [lookAheadTable({
        ...context.lookAhead,
        activities: context.lookAhead.activities.filter((activity) => names.includes(activity.area)),
      })]),

      dataAssuranceSection(context),
    ].filter(Boolean),
  };
}

// ---------------------------------------------------------------- 3. interim

export function interimReport(context, { purpose } = {}) {
  const { model } = context;
  return {
    type: 'interim',
    title: 'Interim Progress Report',
    subtitle: `${context.period.label}${purpose ? ` · ${purpose}` : ''}`,
    kpis: headlineKpis(context),
    sections: [
      section('summary', 'Executive summary', [
        purpose ? callout('info', 'Purpose of this report', purpose) : null,
        narrative(executiveSummary(context)),
        kpis(headlineKpis(context)),
      ]),
      section('progress', 'Progress position', [
        narrative(progressCommentary(context)),
        scurveChart(model),
        areaTable(context.areas),
      ]),
      section('schedule', 'Schedule', [
        narrative(scheduleCommentary(context)),
        activityTable([...model.activities].sort((a, b) => (b.slippageDays ?? 0) - (a.slippageDays ?? 0)), { limit: 25 }),
        context.milestones.length ? milestoneTable(context.milestones) : null,
      ], { pageBreak: true }),
      section('commercial', 'Commercial position', [
        narrative(commercialCommentary(context)),
        evmTable(context),
      ]),
      section('quality-safety', 'Quality and safety', [
        narrative(qualitySafetyCommentary(context)),
        context.ncr.open.length ? registerTable(context.ncr.open, { idKey: 'ncrId', idLabel: 'NCR' }) : null,
      ]),
      section('risk', 'Risks and issues', [
        narrative(riskCommentary(context)),
        riskTable(context.risks.top),
        context.issues.open.length ? registerTable(context.issues.open, { idKey: 'issueId', idLabel: 'Ref' }) : null,
      ], { pageBreak: true }),
      section('exceptions', 'Exceptions', [exceptionTable(context.exceptions)]),
      section('actions', 'Recommendations', [
        table([
          col('priority', 'Priority', 'severity'), col('subject', 'Subject', 'text', { width: 30 }),
          col('action', 'Action', 'text', { width: 60 }), col('owner', 'Owner'), col('by', 'By', 'date'),
        ], recommendations(context)),
      ]),
      dataAssuranceSection(context),
    ].filter(Boolean),
  };
}

// ---------------------------------------------------------------- 4. monthly

function evmTable(context) {
  const { evm, project } = context;
  const currency = project?.currency;
  const rows = [
    { metric: 'Budget at completion (BAC)', value: formatMoney(evm.bac, { currency }), note: evm.bacSource ? `From ${evm.bacSource}` : '' },
    { metric: 'Planned value (PV)', value: formatMoney(evm.pv, { currency }), note: 'Budget × planned % complete' },
    { metric: 'Earned value (EV)', value: formatMoney(evm.ev, { currency }), note: 'Budget × actual % complete' },
    { metric: 'Actual cost (AC)', value: formatMoney(evm.ac, { currency }), note: 'Certified value to date' },
    { metric: 'Schedule variance (SV)', value: formatMoney(evm.sv, { currency }), note: 'EV − PV' },
    { metric: 'Cost variance (CV)', value: formatMoney(evm.cv, { currency }), note: 'EV − AC' },
    { metric: 'SPI', value: Number.isFinite(evm.spi) ? evm.spi.toFixed(3) : '—', note: 'EV ÷ PV' },
    { metric: 'CPI', value: Number.isFinite(evm.cpi) ? evm.cpi.toFixed(3) : '—', note: 'EV ÷ AC' },
    { metric: 'SPI (time)', value: Number.isFinite(evm.spiTime) ? evm.spiTime.toFixed(3) : '—', note: 'Earned schedule ÷ actual time' },
    { metric: 'Schedule slip (earned schedule)', value: Number.isFinite(evm.scheduleSlipDays) ? `${evm.scheduleSlipDays} days` : '—', note: 'Where the plan said we would be today' },
    { metric: 'Estimate at completion (EAC)', value: formatMoney(evm.eac, { currency }), note: 'BAC ÷ CPI' },
    { metric: 'Variance at completion (VAC)', value: formatMoney(evm.vac, { currency }), note: 'BAC − EAC' },
    { metric: 'To-complete performance index', value: Number.isFinite(evm.tcpi) ? evm.tcpi.toFixed(3) : '—', note: 'Efficiency needed on remaining work' },
  ];
  return table([col('metric', 'Measure', 'text', { width: 36 }), col('value', 'Value'), col('note', 'Basis', 'text', { width: 40 })],
    rows, { note: 'Actual cost is taken as certified value; a PMO has no visibility of the contractor’s internal cost book.' });
}

export function monthlyReport(context) {
  const { model, period } = context;
  return {
    type: 'monthly',
    title: 'Monthly Progress Report',
    subtitle: `${formatMonth(period.from)} · data date ${formatDate(model.asOf)}`,
    kpis: headlineKpis(context),
    sections: [
      section('summary', 'Executive summary', [
        narrative(executiveSummary(context)),
        kpis(headlineKpis(context)),
      ]),

      section('snapshot', 'Project snapshot', [
        table([col('field', 'Particulars', 'text', { width: 30 }), col('value', 'Detail', 'text', { width: 54 })], [
          { field: 'Project', value: context.project?.name ?? '—' },
          { field: 'Client', value: context.project?.client ?? '—' },
          { field: 'Contractor', value: context.project?.contractor ?? '—' },
          { field: 'Location', value: context.project?.location ?? '—' },
          { field: 'Contract value', value: formatMoney(context.project?.contractValue, { currency: context.project?.currency }) },
          { field: 'Commencement', value: formatDate(model.start) },
          { field: 'Contract completion', value: formatDate(model.baselineFinish) },
          { field: 'Forecast completion', value: formatDate(model.forecastFinish) },
          { field: 'Elapsed / remaining', value: `${model.elapsedDays} days elapsed, ${model.remainingDays ?? '—'} days remaining` },
          { field: 'Physical progress', value: `${formatPercent(model.actualPercent)} against ${formatPercent(model.plannedPercent)} planned` },
        ]),
      ]),

      section('progress', 'Physical progress', [
        narrative(progressCommentary(context)),
        scurveChart(model),
        areaTable(context.areas),
        areaChart(context.areas),
        table([
          col('activity', 'Activity', 'text', { width: 40 }), col('area', 'Area'), col('unit', 'Unit'),
          col('planned', 'Planned qty', 'number'), col('actual', 'Achieved qty', 'number'), col('achievement', 'Achievement', 'percent'),
        ], period.quantityByActivity.slice(0, 30), { note: 'Quantities booked during the month.' }),
      ], { pageBreak: true }),

      section('schedule', 'Schedule performance', [
        narrative(scheduleCommentary(context)),
        activityTable([...model.activities].sort((a, b) => (b.slippageDays ?? 0) - (a.slippageDays ?? 0)), { limit: 40 }),
        context.milestones.length ? milestoneTable(context.milestones) : null,
      ], { pageBreak: true }),

      section('evm', 'Earned value and commercial position', [
        narrative(commercialCommentary(context)),
        evmTable(context),
        context.cash.months.length
          ? chart({
            chartType: 'bars',
            title: 'Cash flow — planned against certified',
            categories: context.cash.months.map((month) => month.label),
            series: [
              { label: 'Planned', values: context.cash.months.map((month) => month.planned) },
              { label: 'Actual', values: context.cash.months.map((month) => month.actual) },
            ],
            format: 'money',
          })
          : null,
        context.model.data.billing?.length
          ? table([
            col('invoiceId', 'Bill / IPC'), col('period', 'Period'), col('submittedOn', 'Submitted', 'date'),
            col('claimedAmount', 'Claimed', 'money'), col('certifiedAmount', 'Certified', 'money'),
            col('paidAmount', 'Paid', 'money'), col('status', 'Status'),
          ], context.model.data.billing)
          : null,
      ], { pageBreak: true }),

      section('resources', 'Resources', [
        manpowerChart(context.resources),
        table([col('metric', 'Measure', 'text', { width: 30 }), col('value', 'Value')], [
          { metric: 'Average manpower deployed', value: formatNumber(context.resources.manpower?.averageActual) },
          { metric: 'Average manpower planned', value: formatNumber(context.resources.manpower?.averagePlanned) },
          { metric: 'Peak manpower', value: formatNumber(context.resources.manpower?.peak) },
          { metric: 'Deployment against plan', value: formatPercent(context.resources.manpower?.fulfilment ?? NaN) },
          { metric: 'Total man-days in period', value: formatNumber(context.resources.manpower?.totalManDays) },
          { metric: 'Average plant deployed', value: formatNumber(context.resources.equipment?.averageActual) },
          { metric: 'Idle / breakdown equipment-days', value: formatNumber(context.resources.equipment?.idleDays) },
        ]),
      ]),

      section('quality-safety', 'Quality and safety', [
        narrative(qualitySafetyCommentary(context)),
        context.ncr.all.length ? registerTable(context.ncr.open, { idKey: 'ncrId', idLabel: 'NCR' }) : null,
        context.safetyToDate.records.length
          ? table([col('metric', 'Measure', 'text', { width: 34 }), col('value', 'This period'), col('toDate', 'To date')], [
            { metric: 'Incidents', value: context.safety.incidents, toDate: context.safetyToDate.incidents },
            { metric: 'Lost-time injuries', value: context.safety.lti, toDate: context.safetyToDate.lti },
            { metric: 'Near misses', value: context.safety.nearMiss, toDate: context.safetyToDate.nearMiss },
            { metric: 'Observations', value: context.safety.observations, toDate: context.safetyToDate.observations },
            { metric: 'Man-hours', value: formatNumber(context.safety.manHours), toDate: formatNumber(context.safetyToDate.manHours) },
            { metric: 'LTI frequency rate (per million man-hours)', value: '—', toDate: Number.isFinite(context.safetyToDate.ltiFrequencyRate) ? context.safetyToDate.ltiFrequencyRate.toFixed(2) : '—' },
          ])
          : null,
      ], { pageBreak: true }),

      section('risk', 'Risks, issues and hindrances', [
        narrative(riskCommentary(context)),
        riskTable(context.risks.open),
        context.issues.open.length ? registerTable(context.issues.open, { idKey: 'issueId', idLabel: 'Ref' }) : null,
        context.hindrances.open.length ? registerTable(context.hindrances.open, { idKey: 'hindranceId', idLabel: 'Ref', dateLabel: 'From' }) : null,
      ], { pageBreak: true }),

      section('exceptions', 'Exceptions', [
        severityChart(context.exceptionsBySeverity),
        exceptionTable(context.exceptions),
      ]),

      section('lookahead', 'Look-ahead and recommendations', [
        lookAheadTable(context.lookAhead),
        table([
          col('priority', 'Priority', 'severity'), col('subject', 'Subject', 'text', { width: 30 }),
          col('action', 'Action', 'text', { width: 60 }), col('owner', 'Owner'), col('by', 'By', 'date'),
        ], recommendations(context)),
      ], { pageBreak: true }),

      dataAssuranceSection(context),
    ].filter(Boolean),
  };
}

// -------------------------------------------------------------- 5. quarterly

export function quarterlyReport(context, { label } = {}) {
  const { model } = context;
  const trend = context.trend.filter((month) => withinRange(month.month, context.period.from, context.period.to));
  const fullTrend = context.trend;

  return {
    type: 'quarterly',
    title: 'Quarterly Progress Report',
    subtitle: `${label ?? context.period.label} · data date ${formatDate(model.asOf)}`,
    kpis: headlineKpis(context),
    sections: [
      section('summary', 'Executive summary', [
        narrative(executiveSummary(context)),
        kpis(headlineKpis(context)),
      ]),

      section('trend', 'Performance trend', [
        narrative([
          trend.length
            ? `Monthly achievement across the quarter ran at ${trend.map((month) => `${month.label}: ${formatPercent(month.achievement ?? 0, 0)}`).join(', ')}.`
            : 'Insufficient monthly data to trend performance across the quarter.',
          fullTrend.length > 1
            ? `Cumulative progress moved from ${formatPercent(fullTrend[Math.max(0, fullTrend.length - trend.length - 1)]?.closingPercent ?? 0)} at the start of the quarter to ${formatPercent(model.actualPercent)} at its close.`
            : null,
        ].filter(Boolean)),
        chart({
          chartType: 'bars',
          title: 'Monthly progress — planned against actual',
          categories: fullTrend.map((month) => month.label),
          series: [
            { label: 'Planned', values: fullTrend.map((month) => month.plannedGain) },
            { label: 'Actual', values: fullTrend.map((month) => month.actualGain) },
          ],
          format: 'percent',
        }),
        table([
          col('label', 'Month'), col('plannedGain', 'Planned', 'percent'), col('actualGain', 'Achieved', 'percent'),
          col('achievement', 'Achievement', 'percent'), col('closingPercent', 'Cumulative', 'percent'),
          col('plannedClosingPercent', 'Planned cumulative', 'percent'), col('manpower', 'Avg manpower', 'integer'),
          col('daysReported', 'Days reported', 'integer'),
        ], fullTrend.map((month) => ({ ...month, _tone: (month.achievement ?? 1) < 0.8 ? 'warn' : null }))),
        scurveChart(model),
      ], { pageBreak: true }),

      section('position', 'Position against contract', [
        narrative(scheduleCommentary(context)),
        areaTable(context.areas),
        context.milestones.length ? milestoneTable(context.milestones) : null,
      ], { pageBreak: true }),

      section('commercial', 'Commercial and earned value', [
        narrative(commercialCommentary(context)),
        evmTable(context),
      ]),

      section('governance', 'Governance — matters for decision', [
        narrative([
          'The following require a decision or a direction from the steering committee. They are the exceptions that cannot be closed at project level.',
        ]),
        table([
          col('severity', 'Severity', 'severity'), col('subject', 'Matter', 'text', { width: 34 }),
          col('detail', 'Position', 'text', { width: 54 }), col('recommendation', 'Decision sought', 'text', { width: 46 }),
          col('owner', 'Owner'), col('periodsOpen', 'Periods open', 'integer'),
        ], context.exceptions.filter((item) => item.severity === 'Critical' || item.severity === 'High' || item.periodsOpen > 2),
        { emptyText: 'No matters requiring a steering committee decision.' }),
      ], { pageBreak: true }),

      section('risk', 'Risk position', [
        narrative(riskCommentary(context)),
        riskTable(context.risks.open),
        chart({
          chartType: 'bars',
          title: 'Open risks by band',
          categories: context.risks.byBand.map((band) => band.label),
          series: [{ label: 'Open risks', values: context.risks.byBand.map((band) => band.count) }],
          format: 'number',
        }),
      ]),

      section('quality-safety', 'Quality, safety and compliance', [
        narrative(qualitySafetyCommentary(context)),
      ]),

      section('outlook', 'Outlook for the coming quarter', [
        narrative([
          model.forecastFinish
            ? `On current performance the project completes on ${formatDate(model.forecastFinish)}${model.delayDays > 0 ? `, ${model.delayDays} days beyond the contract date` : ', within the contract date'}.`
            : 'A completion forecast cannot be stated until a baseline programme is uploaded.',
          `The coming quarter is planned to take cumulative progress from ${formatPercent(model.actualPercent)} to ${formatPercent(plannedAt(model, 90))}.`,
        ]),
        lookAheadTable(context.lookAhead),
        table([
          col('priority', 'Priority', 'severity'), col('subject', 'Subject', 'text', { width: 30 }),
          col('action', 'Action', 'text', { width: 60 }), col('owner', 'Owner'), col('by', 'By', 'date'),
        ], recommendations(context)),
      ], { pageBreak: true }),

      dataAssuranceSection(context),
    ].filter(Boolean),
  };
}

function plannedAt(model, daysAhead) {
  const target = new Date(model.asOf.getTime() + daysAhead * 86400000);
  const point = [...model.series].reverse().find((entry) => entry.date <= target);
  return point?.planned ?? 1;
}

// ------------------------------------------------------------ 6. digital DPR

export function digitalDprReport(context, { date } = {}) {
  const day = startOfDay(date) ?? context.model.asOf;
  const rows = (context.model.data.dpr ?? []).filter((row) => isoDay(row.date) === isoDay(day));
  const manpower = rows.reduce((total, row) => total + (row.manpowerActual ?? 0), 0);
  const manpowerPlanned = rows.reduce((total, row) => total + (row.manpowerPlanned ?? 0), 0);
  const equipment = rows.reduce((total, row) => total + (row.equipmentActual ?? 0), 0);
  const weather = [...new Set(rows.map((row) => row.weather).filter(Boolean))].join(', ');
  const hindrances = rows.filter((row) => row.hindrance);
  const safety = (context.model.data.safety ?? []).filter((row) => isoDay(row.date) === isoDay(day));
  const ncr = (context.model.data.ncr ?? []).filter((row) => isoDay(row.raisedOn) === isoDay(day));

  return {
    type: 'digital-dpr',
    title: 'Digital Daily Progress Report',
    subtitle: `${formatDate(day)} · ${context.project?.name ?? ''}`,
    kpis: [
      kpi('Activities reported', String(rows.length)),
      kpi('Manpower', formatNumber(manpower), manpowerPlanned ? `Planned ${formatNumber(manpowerPlanned)}` : null,
        manpowerPlanned && manpower < manpowerPlanned * 0.85 ? 'amber' : 'green'),
      kpi('Equipment', formatNumber(equipment)),
      kpi('Weather', weather || '—'),
      kpi('Hindrances', String(hindrances.length), null, hindrances.length ? 'amber' : 'green'),
      kpi('Cumulative progress', formatPercent(context.model.actualPercent), `Planned ${formatPercent(context.model.plannedPercent)}`),
    ],
    sections: [
      rows.length
        ? null
        : section('empty', 'No record for this date', [
          callout('warn', `No DPR was submitted for ${formatDate(day)}`, 'Either the site did not report, or the day falls outside the uploaded range. The cumulative figures below remain as at the data date.'),
        ]),

      section('work', 'Work executed', [
        table([
          col('wbsId', 'WBS'), col('activity', 'Activity', 'text', { width: 40 }), col('area', 'Area'),
          col('unit', 'Unit'), col('plannedQty', 'Planned', 'number'), col('actualQty', 'Achieved', 'number'),
          col('cumulativeQty', 'Cumulative', 'number'), col('contractor', 'Agency'), col('remarks', 'Remarks', 'text', { width: 34 }),
        ], rows.map((row) => ({
          ...row,
          _tone: Number.isFinite(row.plannedQty) && Number.isFinite(row.actualQty) && row.plannedQty > 0
            ? (row.actualQty >= row.plannedQty ? 'good' : row.actualQty === 0 ? 'bad' : 'warn')
            : null,
        })), { emptyText: 'No activities reported for this date.' }),
      ]),

      section('resources', 'Resources deployed', [
        table([
          col('area', 'Area'), col('manpowerPlanned', 'Manpower planned', 'integer'),
          col('manpowerActual', 'Manpower actual', 'integer'), col('equipmentPlanned', 'Equipment planned', 'integer'),
          col('equipmentActual', 'Equipment actual', 'integer'), col('workingHours', 'Hours', 'number'),
        ], rows, { emptyText: 'No resource record for this date.' }),
      ]),

      hindrances.length
        ? section('hindrances', 'Hindrances and constraints on the day', [
          table([
            col('area', 'Area'), col('activity', 'Activity', 'text', { width: 34 }),
            col('hindrance', 'Hindrance', 'text', { width: 48 }), col('remarks', 'Remarks', 'text', { width: 34 }),
          ], hindrances),
        ])
        : null,

      safety.length || ncr.length
        ? section('hse', 'Safety and quality on the day', [
          safety.length ? table([
            col('type', 'Type'), col('area', 'Area'), col('description', 'Description', 'text', { width: 48 }),
            col('severity', 'Severity'), col('correctiveAction', 'Action taken', 'text', { width: 36 }),
          ], safety) : null,
          ncr.length ? table([
            col('ncrId', 'NCR'), col('area', 'Area'), col('description', 'Observation', 'text', { width: 48 }),
            col('severity', 'Severity'), col('owner', 'Owner'),
          ], ncr) : null,
        ])
        : null,

      section('cumulative', 'Cumulative position as at the data date', [
        kpis(headlineKpis(context).slice(0, 5)),
        areaTable(context.allAreas),
      ]),
    ].filter(Boolean),
  };
}

// --------------------------------------------------------- 7. schedule update

export function scheduleUpdateReport(context) {
  const { model } = context;
  const activities = [...model.activities].sort((a, b) => (a.baselineStart ?? 0) - (b.baselineStart ?? 0));
  const slipping = activities.filter((activity) => !activity.complete && (activity.slippageDays ?? 0) > 0);

  return {
    type: 'schedule-update',
    title: 'Schedule Update',
    subtitle: `Data date ${formatDate(model.asOf)} · ${model.criticalPath.hasLogic ? 'network calculated' : 'no programme logic — driving activities shown'}`,
    kpis: [
      kpi('Data date', formatDate(model.asOf)),
      kpi('Activities', String(activities.length), `${activities.filter((activity) => activity.complete).length} complete`),
      kpi('Forecast completion', formatDate(model.forecastFinish),
        model.baselineFinish ? `Contract ${formatDate(model.baselineFinish)}` : null,
        (model.delayDays ?? 0) > 0 ? 'red' : 'green'),
      Number.isFinite(model.delayDays) ? kpi('Slippage', `${model.delayDays} d`, null, model.delayDays > 0 ? 'red' : 'green') : null,
      kpi('Critical activities', String(model.criticalPath.activities.length)),
      kpi('Slipping activities', String(slipping.length), null, slipping.length ? 'amber' : 'green'),
    ].filter(Boolean),
    sections: [
      section('summary', 'Basis of the update', [
        narrative([
          `This update carries the programme forward to a data date of ${formatDate(model.asOf)}. Actual start and finish dates are taken from the daily progress record where reported, and percentage complete is ${model.weightBasis === 'value' ? 'measured against BOQ quantities' : 'measured against the scope quantities available'}.`,
          model.criticalPath.hasLogic
            ? 'Remaining durations have been re-calculated from achieved productivity and driven through the programme logic, giving the early dates and float shown below.'
            : 'The uploaded programme carries no predecessor logic, so remaining durations are calculated from achieved productivity per activity and the completion date is the latest activity finish. Upload the programme as a Primavera .xer or MS Project XML for a true network calculation.',
          ...scheduleCommentary(context),
        ]),
        scurveChart(model),
      ]),

      section('update', 'Updated activity schedule', [
        table([
          col('wbsId', 'Activity ID'), col('name', 'Activity', 'text', { width: 40 }), col('area', 'Area'),
          col('duration', 'Orig. dur (d)', 'integer'), col('remainingDuration', 'Rem. dur (d)', 'integer'),
          col('baselineStart', 'Baseline start', 'date'), col('baselineFinish', 'Baseline finish', 'date'),
          col('actualStart', 'Actual start', 'date'), col('actualFinish', 'Actual finish', 'date'),
          col('percentComplete', '% complete', 'percent'), col('forecastFinish', 'Forecast finish', 'date'),
          col('slippageDays', 'Slip (d)', 'integer'), col('totalFloat', 'Float (d)', 'integer'),
          col('isCritical', 'Critical', 'bool'), col('forecastBasis', 'Forecast basis'),
        ], activities.map((activity) => ({
          ...activity,
          _tone: activity.complete ? 'good' : activity.isCritical ? 'bad' : (activity.slippageDays ?? 0) > 0 ? 'warn' : null,
        })), { note: 'This table is written to Excel in a column order that can be pasted back into Primavera or MS Project.' }),
      ], { pageBreak: true }),

      section('critical', model.criticalPath.hasLogic ? 'Critical path' : 'Activities driving the completion date', [
        table([
          col('wbsId', 'Activity ID'), col('name', 'Activity', 'text', { width: 40 }), col('area', 'Area'),
          col('percentComplete', '% complete', 'percent'), col('forecastFinish', 'Forecast finish', 'date'),
          col('slippageDays', 'Slip (d)', 'integer'), col('totalFloat', 'Float (d)', 'integer'),
          col('productivity', 'Rate/day', 'number'), col('remainingQty', 'Remaining qty', 'number'),
        ], model.criticalPath.activities, { emptyText: 'No activity is currently driving a delay.' }),
      ]),

      section('slippage', 'Slippage analysis', [
        table([
          col('wbsId', 'Activity ID'), col('name', 'Activity', 'text', { width: 36 }),
          col('startSlippageDays', 'Late start (d)', 'integer'), col('slippageDays', 'Finish slip (d)', 'integer'),
          col('percentComplete', '% complete', 'percent'), col('productivity', 'Achieved rate/day', 'number'),
          col('remainingQty', 'Remaining qty', 'number'), col('forecastBasis', 'Forecast basis'),
        ], slipping, { emptyText: 'No activity is forecast to finish later than baseline.' }),
      ], { pageBreak: true }),

      context.milestones.length ? section('milestones', 'Milestone dates', [milestoneTable(context.milestones)]) : null,

      section('lookahead', 'Three-week look-ahead', [lookAheadTable(context.lookAhead)]),

      dataAssuranceSection(context),
    ].filter(Boolean),
  };
}
