// The analytics: reconciling the DPR, the schedule and the BOQ, and the
// conclusions drawn from the result.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildModel } from '@/lib/pmo/analytics/model.js';
import { criticalPath, parsePredecessors } from '@/lib/pmo/analytics/cpm.js';
import { earnedValue, lookAhead, milestoneStatus, riskSummary } from '@/lib/pmo/analytics/metrics.js';
import { detectExceptions } from '@/lib/pmo/analytics/exceptions.js';
import { readiness } from '@/lib/pmo/quality.js';
import { quarterRange, weekRange } from '@/lib/pmo/dates.js';
import { demoProject } from '@/lib/pmo/demo.js';

const utc = (value) => new Date(`${value}T00:00:00.000Z`);

function tinyProject() {
  const schedule = [
    { wbsId: 'A1', activity: 'Excavation', area: 'Zone A', unit: 'cum', scopeQty: 100, value: 1000000, duration: 10, baselineStart: utc('2026-01-01'), baselineFinish: utc('2026-01-10'), predecessors: '' },
    { wbsId: 'A2', activity: 'PCC', area: 'Zone A', unit: 'cum', scopeQty: 50, value: 1000000, duration: 10, baselineStart: utc('2026-01-11'), baselineFinish: utc('2026-01-20'), predecessors: 'A1' },
  ];
  const boq = [
    { itemCode: 'B1', wbsId: 'A1', description: 'Excavation', qty: 100, rate: 10000, amount: 1000000 },
    { itemCode: 'B2', wbsId: 'A2', description: 'PCC', qty: 50, rate: 20000, amount: 1000000 },
  ];
  const dpr = [];
  for (let day = 1; day <= 10; day += 1) {
    dpr.push({
      date: utc(`2026-01-${String(day).padStart(2, '0')}`),
      wbsId: 'A1', activity: 'Excavation', area: 'Zone A', unit: 'cum',
      plannedQty: 10, actualQty: 5, cumulativeQty: day * 5,
      manpowerPlanned: 20, manpowerActual: 10,
    });
  }
  return { schedule, boq, dpr };
}

test('progress is weighted by BOQ value when the BOQ reaches', () => {
  const data = tinyProject();
  const model = buildModel({ contractValue: 2000000 }, data, { asOf: utc('2026-01-10') });
  assert.equal(model.weightBasis, 'value');
  // A1 is half the value and half done; A2 has not started.
  assert.equal(Math.round(model.actualPercent * 1000) / 1000, 0.25);
  assert.equal(Math.round(model.plannedPercent * 1000) / 1000, 0.5);
  assert.ok(model.variancePercent < 0);
});

test('without a BOQ the weighting falls back, and says so', () => {
  const { schedule, dpr } = tinyProject();
  const bare = schedule.map(({ value, ...rest }) => rest);
  const model = buildModel({}, { schedule: bare, dpr }, { asOf: utc('2026-01-10') });
  assert.equal(model.weightBasis, 'duration');
  const findings = readiness({ schedule: bare, dpr }, model).findings;
  assert.ok(findings.some((finding) => /weighted by activity duration/i.test(finding.message)));
});

test('the finish is forecast from achieved productivity, not from the plan', () => {
  const model = buildModel({}, tinyProject(), { asOf: utc('2026-01-10') });
  const excavation = model.activities.find((activity) => activity.wbsId === 'A1');
  // 5/day achieved against 10/day planned: 50 left means ten more days.
  assert.equal(excavation.productivity, 5);
  assert.equal(excavation.forecastBasis, 'productivity');
  assert.equal(excavation.forecastFinish.toISOString().slice(0, 10), '2026-01-20');
  assert.equal(excavation.slippageDays, 10);
});

test('predecessor logic drives the successor and the project finish', () => {
  const model = buildModel({}, tinyProject(), { asOf: utc('2026-01-10') });
  assert.equal(model.criticalPath.hasLogic, true, 'predecessors given by WBS id must resolve');
  const pcc = model.activities.find((activity) => activity.wbsId === 'A2');
  // A2 cannot start until A1 finishes on its forecast date.
  assert.ok(pcc.forecastFinish > utc('2026-01-20'));
  assert.ok(model.delayDays > 0);
});

test('predecessor strings parse into relations and lags', () => {
  assert.deepEqual(parsePredecessors('A10, A20FS+2, 45SS-1d'), [
    { id: 'A10', relation: 'FS', lag: 0 },
    { id: 'A20', relation: 'FS', lag: 2 },
    { id: '45', relation: 'SS', lag: -1 },
  ]);
});

test('circular logic is reported rather than hanging the calculation', () => {
  const result = criticalPath([
    { id: 'x', duration: 5, predecessors: 'y' },
    { id: 'y', duration: 5, predecessors: 'x' },
  ], utc('2026-01-01'));
  assert.equal(result.cycles.length, 2);
});

test('work reported against no scheduled activity is surfaced, not absorbed', () => {
  const data = tinyProject();
  data.dpr.push({ date: utc('2026-01-09'), activity: 'Extra utility diversion', area: 'Zone A', unit: 'm', actualQty: 20 });
  const model = buildModel({}, data, { asOf: utc('2026-01-10') });
  const orphan = model.activities.find((activity) => !activity.scheduled);
  assert.ok(orphan, 'the unscheduled activity is kept');
  const exceptions = detectExceptions(model, { evm: earnedValue(model, {}), period: null });
  assert.ok(exceptions.some((item) => item.code === 'UNSCHEDULED_WORK'));
});

test('missing days of DPR are found and reported', () => {
  const data = tinyProject();
  data.dpr = data.dpr.filter((row) => !['2026-01-05', '2026-01-06', '2026-01-07'].includes(row.date.toISOString().slice(0, 10)));
  const model = buildModel({}, data, { asOf: utc('2026-01-10') });
  const gap = model.coverage.gaps.find((entry) => entry.days === 3);
  assert.ok(gap, 'the three-day gap is identified');
  const exceptions = detectExceptions(model, { evm: earnedValue(model, {}), to: utc('2026-01-10') });
  assert.ok(exceptions.some((item) => item.code === 'REPORTING_GAP'));
});

test('every exception rule runs against the default thresholds', () => {
  // A project record with no thresholds must not make rules fire always or never.
  const { project, data, asOf } = demoProject();
  const model = buildModel(project, data, { asOf });
  const evm = earnedValue(model, { project });
  const exceptions = detectExceptions(model, { evm, from: asOf, to: asOf });
  assert.ok(exceptions.length > 5);
  assert.ok(!exceptions.some((item) => item.code === 'RULE_ERROR'), 'no rule may throw');
  // CPI is above par on the demo, so the cost rule must stay silent.
  assert.ok(evm.cpi > 0.95);
  assert.ok(!exceptions.some((item) => item.code === 'CPI_LOW'));
});

test('exceptions carry forward: new, worsening and closed are distinguished', () => {
  const data = tinyProject();
  const model = buildModel({}, data, { asOf: utc('2026-01-10') });
  const first = detectExceptions(model, { evm: earnedValue(model, {}), to: utc('2026-01-10') });
  assert.ok(first.every((item) => item.isNew));

  const again = detectExceptions(model, { evm: earnedValue(model, {}), to: utc('2026-01-17'), previous: first });
  assert.ok(again.every((item) => !item.isNew));
  assert.ok(again.every((item) => item.periodsOpen === 2));
});

test('earned value uses certified value as actual cost and says so', () => {
  const data = tinyProject();
  data.billing = [{ invoiceId: 'RA-01', claimedAmount: 600000, certifiedAmount: 500000, paidAmount: 500000, submittedOn: utc('2026-01-08') }];
  const model = buildModel({ contractValue: 2000000 }, data, { asOf: utc('2026-01-10') });
  const evm = earnedValue(model, { project: { contractValue: 2000000 } });
  assert.equal(evm.bac, 2000000);
  assert.equal(evm.ac, 500000);
  assert.equal(evm.ev, 500000);
  assert.equal(evm.cpi, 1);
  assert.equal(Math.round(evm.spi * 100) / 100, 0.5);
  assert.equal(evm.withheld, 100000);
});

test('risks are scored 5x5 and banded', () => {
  const model = buildModel({}, { ...tinyProject(), risks: [
    { riskId: 'R1', description: 'Monsoon', probability: 5, impact: 4, status: 'Open' },
    { riskId: 'R2', description: 'Minor', probability: 1, impact: 2, status: 'Closed' },
  ] }, { asOf: utc('2026-01-10') });
  const risks = riskSummary(model);
  assert.equal(risks.open.length, 1);
  assert.equal(risks.open[0].score, 20);
  assert.equal(risks.open[0].band, 'Very high');
});

test('a milestone with no forecast takes it from the work behind it', () => {
  const data = { ...tinyProject(), milestones: [
    { milestoneId: 'MS1', name: 'Excavation complete', area: 'Zone A', baselineDate: utc('2026-01-10'), penalty: 100000 },
  ] };
  const model = buildModel({}, data, { asOf: utc('2026-01-10') });
  const [milestone] = milestoneStatus(model);
  assert.equal(milestone.atRisk, true);
  assert.ok(milestone.slippageDays > 0);
  assert.equal(milestone.penaltyExposure, 100000);
});

test('the look-ahead covers three weeks from the day after the data date', () => {
  const model = buildModel({}, tinyProject(), { asOf: utc('2026-01-10') });
  const ahead = lookAhead(model, { weeks: 3 });
  assert.equal(ahead.from.toISOString().slice(0, 10), '2026-01-11');
  assert.equal(ahead.to.toISOString().slice(0, 10), '2026-01-31');
  assert.ok(ahead.activities.some((activity) => activity.wbsId === 'A2'));
});

test('reporting calendars follow the Indian financial year', () => {
  assert.equal(quarterRange('2026-04-02').label, 'Q1 FY27');
  assert.equal(quarterRange('2026-03-31').label, 'Q4 FY26');
  assert.equal(weekRange('2026-09-22', 1).from.toISOString().slice(0, 10), '2026-09-21');
});
