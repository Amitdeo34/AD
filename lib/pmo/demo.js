// A worked example project.
//
// Generated deterministically so the engine can be exercised end to end —
// including the things that go wrong on a real job: a week of monsoon, a
// drawing that lands late, an activity nobody put in the programme, and a
// stretch of missing DPRs. Seeded with `npm run pmo:seed`.
import { addDays, eachDay, isoDay, startOfDay } from './dates.js';

// A tiny deterministic generator: the same demo on every machine and deploy.
function random(seed) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

const AREAS = ['Zone A — Viaduct', 'Zone B — Station', 'Zone C — Depot'];

const ACTIVITIES = [
  ['A1010', 'Site mobilisation and enabling works', 0, '2026-01-05', 30, 1, 'LS', 1, 2200000, null],
  ['A1020', 'Survey, setting out and utility diversion', 0, '2026-01-20', 45, 1, 'LS', 1, 3400000, 'A1010'],
  ['A1030', 'Pile foundation — viaduct P1 to P18', 0, '2026-02-15', 120, 1, 'm', 5400, 96000000, 'A1020'],
  ['A1040', 'Pile cap casting — P1 to P18', 0, '2026-05-20', 90, 1, 'cum', 3240, 48600000, 'A1030'],
  ['A1050', 'Pier shaft and pier cap — P1 to P18', 0, '2026-07-15', 120, 1, 'cum', 2880, 60480000, 'A1040'],
  ['A1060', 'Pre-cast segment casting', 0, '2026-06-01', 180, 1, 'nos', 486, 121500000, 'A1020'],
  ['A1070', 'Segment erection and stressing', 0, '2026-11-01', 150, 1, 'nos', 486, 97200000, 'A1050, A1060SS+153'],
  ['A1080', 'Deck slab, parapet and bearings', 0, '2027-01-20', 90, 1, 'sqm', 14580, 43740000, 'A1070SS+80'],
  ['A2010', 'Station excavation and shoring', 1, '2026-03-01', 75, 1, 'cum', 28400, 34080000, 'A1020'],
  ['A2020', 'Station raft and base slab', 1, '2026-05-20', 60, 1, 'cum', 4260, 53250000, 'A2010'],
  ['A2030', 'Station substructure — walls and columns', 1, '2026-07-20', 110, 1, 'cum', 5680, 79520000, 'A2020'],
  ['A2040', 'Concourse and roof slab', 1, '2026-11-10', 90, 1, 'cum', 3550, 46150000, 'A2030'],
  ['A2050', 'Station finishes and MEP first fix', 1, '2027-01-10', 110, 1, 'sqm', 9800, 58800000, 'A2040SS+61'],
  ['A2060', 'Lifts, escalators and E&M commissioning', 1, '2027-03-20', 75, 1, 'LS', 1, 42000000, 'A2050SS+69'],
  ['A3010', 'Depot land development and boundary', 2, '2026-02-01', 60, 1, 'sqm', 62000, 18600000, 'A1010'],
  ['A3020', 'Depot stabling lines — earthwork and blanket', 2, '2026-04-15', 90, 1, 'cum', 41000, 28700000, 'A3010'],
  ['A3030', 'Workshop building — structure', 2, '2026-07-10', 120, 1, 'sqm', 7400, 51800000, 'A3020'],
  ['A3040', 'Track laying — depot and mainline', 2, '2026-12-01', 120, 1, 'm', 8600, 60200000, 'A3030'],
  ['A3050', 'Signalling and telecom installation', 2, '2027-02-15', 90, 1, 'LS', 1, 68000000, 'A3040SS+76'],
  ['A3060', 'Testing, trial runs and handover', 2, '2027-05-20', 42, 1, 'LS', 1, 12000000, 'A3050SS+94, A2060, A1080'],
];

const MILESTONE_ROWS = [
  ['MS-01', 'Completion of all viaduct pile foundations', 0, '2026-06-14', 12, 5000000],
  ['MS-02', 'Station base slab complete', 1, '2026-07-19', 10, 4000000],
  ['MS-03', 'First segment erected', 0, '2026-11-30', 15, 7500000],
  ['MS-04', 'Depot workshop structure complete', 2, '2026-11-07', 10, 3000000],
  ['MS-05', 'Viaduct deck complete', 0, '2027-05-15', 25, 12500000],
  ['MS-06', 'System integration and trial run', 2, '2027-06-30', 28, 20000000],
];

/** The full demo dataset: a project record plus records for every document type. */
export function demoProject() {
  const rand = random(20260921);
  const asOf = startOfDay('2026-09-20');

  const schedule = ACTIVITIES.map(([wbsId, activity, areaIndex, start, duration, , unit, qty, value, predecessors]) => {
    const baselineStart = startOfDay(start);
    const baselineFinish = addDays(baselineStart, duration - 1);
    return {
      wbsId, activity, area: AREAS[areaIndex], unit, scopeQty: qty, value,
      duration, baselineStart, baselineFinish, predecessors,
      owner: areaIndex === 2 ? 'M/s Ganga Infra (Depot)' : 'M/s Meridian Constructions',
    };
  });

  const boq = schedule.map((activity, index) => ({
    itemCode: `BQ-${String(index + 1).padStart(3, '0')}`,
    wbsId: activity.wbsId,
    description: activity.activity,
    area: activity.area,
    unit: activity.unit,
    qty: activity.scopeQty,
    rate: Number((activity.value / activity.scopeQty).toFixed(2)),
    amount: activity.value,
  }));

  // Progress: each activity runs at a performance factor, so some fronts pull
  // ahead and others fall behind exactly as they do on site.
  const performance = new Map(schedule.map((activity) => [
    activity.wbsId,
    activity.area === AREAS[1] ? 0.62 + rand() * 0.16 : 0.82 + rand() * 0.34,
  ]));

  const monsoon = { from: startOfDay('2026-07-08'), to: startOfDay('2026-07-22') };
  const missing = { from: startOfDay('2026-08-24'), to: startOfDay('2026-08-30') };

  const dpr = [];
  const cumulative = new Map();

  for (const day of eachDay('2026-01-05', asOf)) {
    if (day >= missing.from && day <= missing.to) continue;            // DPRs never submitted
    if (day.getUTCDay() === 0 && rand() > 0.35) continue;              // most Sundays are off
    const wet = day >= monsoon.from && day <= monsoon.to;

    for (const activity of schedule) {
      if (day < activity.baselineStart || cumulative.get(activity.wbsId) >= activity.scopeQty) continue;
      const factor = performance.get(activity.wbsId);
      // Work only starts once the front is genuinely open.
      if (day > addDays(activity.baselineFinish, 90)) continue;

      const perDay = activity.scopeQty / activity.duration;
      const planned = Number(perDay.toFixed(2));
      let actual = perDay * factor * (0.7 + rand() * 0.6);
      if (wet) actual *= 0.15;
      if (rand() < 0.07) actual = 0;

      const done = Math.min((cumulative.get(activity.wbsId) ?? 0) + Math.max(actual, 0), activity.scopeQty);
      cumulative.set(activity.wbsId, done);

      const manpowerPlanned = Math.round(18 + perDay / 12);
      dpr.push({
        date: day,
        wbsId: activity.wbsId,
        activity: activity.activity,
        area: activity.area,
        unit: activity.unit,
        plannedQty: planned,
        actualQty: Number(Math.max(actual, 0).toFixed(2)),
        cumulativeQty: Number(done.toFixed(2)),
        scopeQty: activity.scopeQty,
        manpowerPlanned,
        manpowerActual: Math.max(0, Math.round(manpowerPlanned * (wet ? 0.35 : 0.72 + rand() * 0.42))),
        equipmentPlanned: Math.max(1, Math.round(perDay / 40)),
        equipmentActual: Math.max(0, Math.round((perDay / 40) * (0.6 + rand() * 0.6))),
        workingHours: wet ? 4 : 9,
        weather: wet ? 'Heavy rain' : rand() > 0.85 ? 'Cloudy' : 'Clear',
        hindrance: wet ? 'Rain — fronts flooded' : (activity.wbsId === 'A2030' && rand() < 0.2 ? 'Reinforcement drawing revision awaited' : null),
        contractor: activity.owner,
      });
    }

    // Work being done that nobody put in the programme — a real and common finding.
    if (day > startOfDay('2026-06-01') && rand() < 0.35) {
      dpr.push({
        date: day,
        wbsId: null,
        activity: 'Additional utility diversion — 33kV cable',
        area: AREAS[1],
        unit: 'm',
        plannedQty: null,
        actualQty: Number((12 + rand() * 18).toFixed(2)),
        cumulativeQty: null,
        manpowerActual: Math.round(6 + rand() * 6),
        equipmentActual: 1,
        weather: 'Clear',
        contractor: 'M/s Meridian Constructions',
      });
    }
  }

  const milestones = MILESTONE_ROWS.map(([milestoneId, name, areaIndex, baselineDate, weight, penalty]) => ({
    milestoneId, name, area: AREAS[areaIndex], baselineDate: startOfDay(baselineDate),
    weight: weight / 100, penalty, owner: 'M/s Meridian Constructions',
    actualDate: baselineDate < '2026-08-01' && areaIndex === 0 ? startOfDay('2026-07-02') : null,
  }));

  const risks = [
    ['R-01', 'Monsoon suspension of viaduct erection beyond the planned window', 'Schedule', 0, 4, 5, 28, 'Pre-monsoon stock of segments; night-shift working in September', 'Project Manager', 'Open', '2026-10-15', 18000000],
    ['R-02', 'Delay in 33kV utility shifting approval from the discom', 'External', 1, 4, 4, 21, 'Weekly follow-up with discom; escalation to the client', 'Client / PMC', 'Open', '2026-10-01', 6500000],
    ['R-03', 'Shortage of skilled shuttering carpenters at the station', 'Resources', 1, 3, 4, 14, 'Second labour contractor being onboarded', 'Contractor', 'Open', '2026-10-20', 4200000],
    ['R-04', 'Signalling vendor mobilisation later than programme', 'Procurement', 2, 3, 5, 45, 'Advance purchase order placed; kick-off meeting held', 'Contractor', 'Open', '2026-11-30', 22000000],
    ['R-05', 'Land handover for depot boundary — two parcels pending', 'External', 2, 2, 4, 30, 'Revenue department follow-up through the client', 'Client', 'Open', '2026-12-15', 9000000],
    ['R-06', 'Cement price escalation beyond the contract ceiling', 'Commercial', 0, 3, 2, 0, 'Price variation clause invoked quarterly', 'Contractor', 'Open', null, 3500000],
    ['R-07', 'Third-party inspection backlog on pile integrity testing', 'Quality', 0, 2, 3, 7, 'Additional agency empanelled', 'PMC', 'Closed', '2026-08-01', 0],
  ].map(([riskId, description, category, areaIndex, probability, impact, scheduleImpact, mitigation, owner, status, dueDate, exposure]) => ({
    riskId, description, category, area: AREAS[areaIndex], probability, impact, scheduleImpact,
    mitigation, owner, status, dueDate: dueDate ? startOfDay(dueDate) : null, exposure,
    raisedOn: startOfDay('2026-03-15'),
  }));

  const issues = [
    ['I-001', 'Reinforcement drawing for station wall W-12 revision 3 not issued', 1, '2026-08-05', 'Design Consultant', '2026-08-20', 'Open', 'High', 14],
    ['I-002', 'Segment casting yard power connection load inadequate', 0, '2026-07-12', 'Contractor', '2026-08-01', 'Closed', 'Medium', 0],
    ['I-003', 'Approach road for depot not maintained — material movement affected', 2, '2026-08-28', 'Client', '2026-09-15', 'Open', 'Medium', 6],
    ['I-004', 'Third-party pile integrity test reports pending for P7 to P11', 0, '2026-09-01', 'PMC', '2026-09-18', 'Open', 'High', 0],
    ['I-005', 'Labour camp sanitation non-compliance flagged in audit', 2, '2026-09-08', 'Contractor', '2026-09-22', 'Open', 'Medium', 0],
  ].map(([issueId, description, areaIndex, raisedOn, owner, dueDate, status, priority, impactDays]) => ({
    issueId, description, area: AREAS[areaIndex], raisedOn: startOfDay(raisedOn), owner,
    dueDate: startOfDay(dueDate), status, priority, impactDays,
    closedOn: status === 'Closed' ? startOfDay('2026-07-30') : null,
  }));

  const ncr = [
    ['NCR-014', 'Honeycombing observed in pier P9 shaft below construction joint', 0, '2026-08-12', 'Major', 'Open'],
    ['NCR-015', 'Cover block spacing non-conforming in station raft pour 4', 1, '2026-08-25', 'Minor', 'Closed'],
    ['NCR-016', 'Cube test result below characteristic strength — batch 2026-08-30', 1, '2026-09-02', 'Major', 'Open'],
    ['NCR-017', 'Welding of stabling line rails without approved WPS', 2, '2026-09-10', 'Minor', 'Open'],
  ].map(([ncrId, description, areaIndex, raisedOn, severity, status]) => ({
    ncrId, description, area: AREAS[areaIndex], raisedOn: startOfDay(raisedOn), severity, status,
    closedOn: status === 'Closed' ? startOfDay('2026-09-06') : null,
    owner: 'M/s Meridian Constructions',
    correctiveAction: status === 'Closed' ? 'Rectified and re-inspected; closed with photographic record.' : 'Method statement under review.',
  }));

  const safety = [
    ['2026-04-18', 0, 'Near miss', 'Material fell from pile rig platform; no injury', 'Medium', false, 0],
    ['2026-06-02', 1, 'First aid', 'Minor hand laceration during bar bending', 'Low', false, 1],
    ['2026-07-29', 0, 'Lost time injury', 'Worker slipped on wet staging; fracture to left wrist', 'High', true, 1],
    ['2026-08-16', 2, 'Near miss', 'Reversing tipper without banksman', 'Medium', false, 0],
    ['2026-09-11', 1, 'Observation', 'Edge protection missing at concourse slab opening', 'Medium', false, 0],
  ].map(([date, areaIndex, type, description, severity, lti, personsAffected]) => ({
    date: startOfDay(date), area: AREAS[areaIndex], type, description, severity, lti, personsAffected,
    status: 'Closed', correctiveAction: 'Toolbox talk conducted; corrective action verified.',
  }));

  const billing = [
    ['RA-01', 'Feb 2026', '2026-03-05', 58500000, 55200000, 55200000, 'Paid'],
    ['RA-02', 'Apr 2026', '2026-05-06', 101200000, 96400000, 96400000, 'Paid'],
    ['RA-03', 'Jun 2026', '2026-07-04', 134600000, 126900000, 126900000, 'Paid'],
    ['RA-04', 'Aug 2026', '2026-09-03', 122400000, 103800000, 0, 'Certified, payment pending'],
  ].map(([invoiceId, period, submittedOn, claimedAmount, certifiedAmount, paidAmount, status]) => ({
    invoiceId, period, submittedOn: startOfDay(submittedOn),
    certifiedOn: addDays(startOfDay(submittedOn), 12),
    claimedAmount, certifiedAmount, paidAmount, status,
    contractor: 'M/s Meridian Constructions',
  }));

  const cashflow = [
    ['2026-01-01', 15000000], ['2026-02-01', 28000000], ['2026-03-01', 42000000],
    ['2026-04-01', 55000000], ['2026-05-01', 62000000], ['2026-06-01', 68000000],
    ['2026-07-01', 58000000], ['2026-08-01', 72000000], ['2026-09-01', 78000000],
    ['2026-10-01', 82000000], ['2026-11-01', 76000000], ['2026-12-01', 70000000],
  ].map(([period, plannedAmount]) => ({ period: startOfDay(period), plannedAmount }));

  const hindrance = [
    ['H-01', 'Land parcel 114/2 not handed over — depot boundary wall stopped', 2, '2026-06-20', null, 'Client', 42, 'Depot land development and boundary', 'Open'],
    ['H-02', 'Heavy rain — all viaduct fronts suspended', 0, '2026-07-08', '2026-07-22', 'Force majeure', 14, 'Pile cap casting — P1 to P18', 'Closed'],
    ['H-03', 'Reinforcement drawing revision awaited for station wall W-12', 1, '2026-08-05', null, 'Design Consultant', 20, 'Station substructure — walls and columns', 'Open'],
    ['H-04', 'Discom shutdown not granted for 33kV diversion', 1, '2026-08-18', null, 'Client', 16, 'Station excavation and shoring', 'Open'],
  ].map(([hindranceId, description, areaIndex, raisedOn, closedOn, responsibility, impactDays, affectedActivity, status]) => ({
    hindranceId, description, area: AREAS[areaIndex], raisedOn: startOfDay(raisedOn),
    closedOn: closedOn ? startOfDay(closedOn) : null, responsibility, impactDays, affectedActivity, status,
    type: responsibility === 'Force majeure' ? 'Weather' : 'Client / design',
  }));

  const procurement = [
    ['P-01', 'Pre-cast segment moulds (set of 6)', 0, '2026-05-01', '2026-03-10', '2026-04-28', 'Delivered'],
    ['P-02', 'Launching girder — 60m span', 0, '2026-10-01', '2026-06-15', null, 'Under manufacture'],
    ['P-03', 'Lifts and escalators — station', 1, '2027-01-15', null, null, 'PO not placed'],
    ['P-04', 'Signalling interlocking equipment', 2, '2026-12-01', '2026-08-20', null, 'Under manufacture'],
    ['P-05', 'Rail — 60 kg UIC, 8600 m', 2, '2026-11-15', null, null, 'Tender under evaluation'],
  ].map(([itemCode, description, areaIndex, requiredBy, orderedOn, deliveredOn, status]) => ({
    itemCode, description, area: AREAS[areaIndex], requiredBy: startOfDay(requiredBy),
    orderedOn: orderedOn ? startOfDay(orderedOn) : null,
    deliveredOn: deliveredOn ? startOfDay(deliveredOn) : null,
    status, owner: 'M/s Meridian Constructions',
  }));

  const drawings = [
    ['ST-W12-R3', 'Station wall W-12 — reinforcement detail rev 3', 1, '2026-08-10', '2026-08-02', null, 'Under review'],
    ['VD-PC-018', 'Pier cap P18 — reinforcement and bearing pedestal', 0, '2026-09-15', '2026-09-01', null, 'Under review'],
    ['DP-WS-004', 'Workshop building — roof truss fabrication drawings', 2, '2026-10-01', null, null, 'Not submitted'],
    ['ST-CN-021', 'Concourse slab — general arrangement', 1, '2026-11-01', '2026-09-12', null, 'Under review'],
    ['VD-SG-009', 'Segment geometry control sheets', 0, '2026-05-20', '2026-04-30', '2026-05-14', 'Approved for construction'],
  ].map(([drawingNo, title, areaIndex, requiredBy, submittedOn, approvedOn, status]) => ({
    drawingNo, title, area: AREAS[areaIndex], requiredBy: startOfDay(requiredBy),
    submittedOn: submittedOn ? startOfDay(submittedOn) : null,
    approvedOn: approvedOn ? startOfDay(approvedOn) : null,
    status, owner: 'Design Consultant',
  }));

  return {
    project: {
      name: 'Metro Rail Package MR-04 — Viaduct, Station and Depot',
      code: 'MR-04',
      client: 'State Metro Rail Corporation Ltd',
      contractor: 'M/s Meridian Constructions Pvt Ltd',
      consultant: 'Project Management Consultant',
      location: 'Bhopal, Madhya Pradesh',
      contractValue: 1026420000,
      currency: 'INR',
      startDate: '2026-01-05',
      contractCompletionDate: '2027-06-30',
      weekStartsOn: 1,
    },
    asOf,
    data: {
      schedule, boq, dpr, milestones, risks, issues, ncr, safety,
      billing, cashflow, hindrance, procurement, drawings,
    },
  };
}

/** The demo DPR as a sheet of rows, for exercising the upload path. */
export function demoDprSheet({ from = '2026-09-14', to = '2026-09-20' } = {}) {
  const { data } = demoProject();
  const rows = data.dpr.filter((row) => isoDay(row.date) >= from && isoDay(row.date) <= to);
  return [
    ['M/s Meridian Constructions Pvt Ltd'],
    ['DAILY PROGRESS REPORT — Package MR-04'],
    [],
    ['Sl. No.', 'Date', 'Zone', 'Item of Work', 'UOM', 'Qty (Plan)', 'Qty Achieved', 'Cum. Qty upto date',
      'Manpower', '', 'Equip. Deployed', 'Weather', 'Reason for delay', 'Remarks'],
    ['', '', '', '', '', '', '', '', 'Plan', 'Actual', '', '', '', ''],
    ...rows.map((row, index) => [
      index + 1, isoDay(row.date), row.area, row.activity, row.unit,
      row.plannedQty, row.actualQty, row.cumulativeQty,
      row.manpowerPlanned, row.manpowerActual, row.equipmentActual,
      row.weather, row.hindrance ?? '', '',
    ]),
  ];
}
