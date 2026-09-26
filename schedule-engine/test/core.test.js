'use strict';
/* Core engine tests: node --test test/  (run from schedule-engine/) */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const core = path.join(__dirname, '..', 'src', 'core');
['base', 'model', 'cpm', 'xer', 'analysis', 'views', 'importers', 'demo', 'qty'].forEach((f) => require(path.join(core, f + '.js')));
const SE = global.SE;
const D = SE.D;

function mini() {
  // A(5) -> B(3) -> D(2), A -> C(4) -> D ; Mon-Fri calendar, start Mon 5-Jan-2026
  const P = new SE.Project();
  P.calendars['1'] = new SE.Calendar({ id: '1', workWeek: [false, true, true, true, true, true, false], hoursPerDay: 8 });
  P.defaultCalId = '1';
  P.wbs.W = { id: 'W', parentId: null, code: 'P', name: 'Proj', seq: 0 };
  P.rootWbsId = 'W';
  const mk = (uid, dur) => { const a = SE.newAct({ uid, code: uid, name: 'Act ' + uid, wbsId: 'W', calId: '1', origDur: dur, remDur: dur }); P.acts.push(a); return a; };
  mk('A', 5); mk('B', 3); mk('C', 4); mk('D', 2);
  P.rels = [{ id: '1', pred: 'A', succ: 'B', type: 'FS', lag: 0 }, { id: '2', pred: 'A', succ: 'C', type: 'FS', lag: 0 }, { id: '3', pred: 'B', succ: 'D', type: 'FS', lag: 0 }, { id: '4', pred: 'C', succ: 'D', type: 'FS', lag: 0 }];
  P.meta.dataDate = D.dayOf(2026, 0, 5);
  P.index();
  return P;
}

test('date parsing accepts P6, Indian and ISO formats', () => {
  const d = D.dayOf(2026, 8, 30);
  for (const s of ['30-Sep-26', '30-Sep-2026', '30/09/2026', '2026-09-30', '30 Sep 2026', '30.09.26', 'Sep 30, 2026']) assert.equal(D.parseDay(s), d, s);
  assert.equal(D.parseDate('30-Sep-26 A').actual, true);
  assert.equal(D.parseDate('30-Sep-26*').constraint, true);
  assert.equal(D.parseDay('09/30/2026', { mdy: true }), d);
  assert.equal(D.parseDay('not a date'), null);
});

test('calendar skips weekends and holidays', () => {
  const c = new SE.Calendar({ workWeek: [false, true, true, true, true, true, false], holidays: [D.dayOf(2026, 0, 26)] });
  const fri = D.dayOf(2026, 0, 23);
  assert.equal(c.add(fri, 1), D.dayOf(2026, 0, 27)); // skips Sat, Sun and Republic Day
  assert.equal(c.span(D.dayOf(2026, 0, 19), D.dayOf(2026, 0, 30)), 9);
  assert.equal(c.finishFrom(D.dayOf(2026, 0, 5), 5), D.dayOf(2026, 0, 9));
});

test('CPM forward/backward pass, float and critical path', () => {
  const P = mini();
  const r = SE.schedule(P);
  const a = (u) => P.act(u);
  assert.equal(D.fmt(a('A').eStart), '05-Jan-26');
  assert.equal(D.fmt(a('A').eFinish), '09-Jan-26');
  assert.equal(D.fmt(a('C').eFinish), '15-Jan-26');
  assert.equal(D.fmt(a('D').eStart), '16-Jan-26');
  assert.equal(D.fmt(r.finish), '19-Jan-26');
  assert.equal(a('B').tf, 1);
  assert.equal(a('C').tf, 0);
  assert.ok(a('A').crit && a('C').crit && a('D').crit && !a('B').crit);
  assert.ok(a('C').longest && !a('B').longest);
});

test('CPM honours progress (actuals, remaining from data date) and SS lag', () => {
  const P = mini();
  P.rels.push({ id: '5', pred: 'B', succ: 'C', type: 'SS', lag: 2 });
  P.invalidate();
  P.meta.dataDate = D.dayOf(2026, 0, 12);
  P.act('A').status = 'CO'; P.act('A').aStart = D.dayOf(2026, 0, 5); P.act('A').aFinish = D.dayOf(2026, 0, 9);
  SE.schedule(P);
  assert.equal(D.fmt(P.act('B').eStart), '12-Jan-26');
  assert.equal(D.fmt(P.act('C').eStart), '14-Jan-26');
  assert.equal(P.act('A').tf, null);
});

test('progress rules block impossible updates', () => {
  const P = mini();
  P.meta.dataDate = D.dayOf(2026, 0, 12);
  const a = P.act('A');
  let r = P.apply([{ uid: 'A', changes: { aStart: '15-Jan-26' } }]);
  assert.equal(r.applied, 0);
  assert.match(r.errors[0].msg, /Data Date/);
  r = P.apply([{ uid: 'A', changes: { pct: 100 } }]);
  assert.match(r.errors[0].msg, /Actual Finish/);
  r = P.apply([{ uid: 'A', changes: { pct: 40 } }]);
  assert.equal(r.applied, 1);
  assert.equal(a.status, 'IP');
  assert.ok(a.aStart != null, 'actual start auto-filled');
  assert.equal(a.remDur, 3);
  r = P.apply([{ uid: 'A', changes: { aFinish: '09-Jan-26' } }]);
  assert.equal(a.status, 'CO'); assert.equal(a.pct, 100); assert.equal(a.remDur, 0);
  r = P.apply([{ uid: 'A', changes: { pct: 50 } }]);
  assert.match(r.errors[0].msg, /complete/);
  r = P.apply([{ uid: 'A', changes: { aFinish: '05-Jan-26', aStart: '08-Jan-26' } }]);
  assert.ok(r.errors.length);
  P.undo(); P.undo();
  assert.equal(a.status, 'NS');
});

test('XER round trip keeps activities, logic, codes and progress', () => {
  const P = SE.demo.build();
  const txt = SE.xer.toXer(P);
  const raw = SE.xer.parse(txt);
  const Q = SE.xer.toProject(raw);
  assert.equal(Q.acts.length, P.acts.length);
  assert.equal(Q.rels.length, P.rels.length);
  for (const a of Q.acts) {
    const b = P.acts.find((x) => x.code === a.code);
    assert.equal(a.status, b.status, a.code);
    assert.equal(a.aStart, b.aStart, a.code);
    assert.equal(a.aFinish, b.aFinish, a.code);
    assert.equal(a.eFinish, b.eFinish, a.code);
  }
  assert.equal(Q.meta.dataDate, P.meta.dataDate);
  assert.ok(Q.codeTypes.some((c) => c.name === 'Discipline'));
  // updating and writing back into the original raw tables
  Q.meta.dataDate = D.dayOf(2026, 9, 1);
  const x = Q.acts.find((a) => a.status === 'NS' && Q.refStart(a) < Q.meta.dataDate && !Q.isMilestone(a));
  const r = Q.apply([{ uid: x.uid, changes: { aStart: D.fmt(Q.refStart(x)), pct: 20 } }]);
  assert.equal(r.applied, 1);
  SE.schedule(Q);
  const Q2 = SE.xer.toProject(SE.xer.parse(SE.xer.toXer(Q)));
  const y = Q2.acts.find((a) => a.code === x.code);
  assert.equal(y.status, 'IP');
  assert.equal(y.aStart, x.aStart);
  assert.equal(Math.round(y.pct), 20);
  assert.equal(Q2.meta.dataDate, D.dayOf(2026, 9, 1));
});

test('XER encoding survives windows-1252 characters', () => {
  const bytes = SE.xer.encode('Café – test', 'windows-1252');
  assert.equal(bytes[3], 0xe9);
  assert.equal(bytes[5], 0x96);
  assert.equal(SE.xer.decode(bytes).text, 'Café – test');
});

test('lenses flag late starts, overdue and future progress', () => {
  const P = SE.demo.build();
  P.meta.dataDate = D.dayOf(2026, 9, 1);
  const fl = SE.analysis.flagAll(P);
  assert.ok(fl.counts.lateStart > 0);
  assert.ok(fl.counts.overdue > 0);
  assert.ok(fl.counts.future > 0);
  for (const a of P.acts) {
    const f = fl.map.get(a.uid);
    if (f.includes('lateStart')) assert.equal(a.status, 'NS');
    if (f.includes('overdue')) assert.notEqual(a.status, 'CO');
  }
});

test('Ask the engine understands buildings, EPC and states', () => {
  const P = SE.demo.build();
  P.meta.dataDate = D.dayOf(2026, 9, 1);
  let r = SE.analysis.ask(P, 'delayed activities in Main Process Building');
  assert.deepEqual(r.filter.dims.building, ['Main Process Building']);
  assert.deepEqual(r.filter.anyLenses, ['lateStart', 'overdue']);
  r = SE.analysis.ask(P, 'procurement progress');
  assert.match(r.answer, /Procurement: \d+(\.\d)?% actual/);
  r = SE.analysis.ask(P, 'how many not started in warehouse');
  assert.equal(r.filter.status, 'NS');
  r = SE.analysis.ask(P, 'when will project finish');
  assert.match(r.answer, /Forecast finish/);
});

test('Building / EPC detection from WBS and keywords', () => {
  assert.equal(SE.classifyEPC('Approval of GA drawings'), 'Engineering');
  assert.equal(SE.classifyEPC('Supply of HT cables'), 'Procurement');
  assert.equal(SE.classifyEPC('Cable laying & termination'), 'Construction');
  const P = SE.demo.build();
  const a = P.acts.find((x) => x.code === 'WHS-P1060');
  assert.equal(P.dim(a, 'building'), 'Warehouse Block');
  assert.equal(P.dim(a, 'epc'), 'Procurement');
});

test('importer maps predecessor text without eating hyphenated IDs', () => {
  const r = SE.importers.parsePreds('MS-1000, BLD-A-1010FS+5d; 3SS-2 days, X1 +3d');
  assert.deepEqual(r.map((x) => [x.ref, x.type, x.lag]), [['MS-1000', 'FS', 0], ['BLD-A-1010', 'FS', 5], ['3', 'SS', -2], ['X1', 'FS', 3]]);
  const grid = { rows: [['Activity ID', 'Activity Name', 'Original Duration', 'Start', 'Finish', '% Complete', 'Predecessors'], ['', 'Building A', '', '', '', '', ''], ['A100', 'Excavation', 10, '05-Jan-26 A', '16-Jan-26 A', 100, ''], ['A110', 'PCC', 5, '19-Jan-26 A', '23-Jan-26', 40, 'A100'], ['A120', 'Footing', 8, '26-Jan-26', '04-Feb-26', 0, 'A110FS+1d']], levels: [] };
  const map = SE.importers.guessMapping(grid.rows[0]);
  const P = SE.importers.gridToProject(grid, map, { headerRow: 0, dataStart: 1 });
  assert.equal(P.acts.length, 3);
  assert.equal(P.rels.length, 2);
  assert.equal(P.act(P.acts[0].uid).status, 'CO');
  assert.equal(P.acts[1].status, 'IP');
  assert.equal(P.acts[2].status, 'NS');
  assert.equal(P.dim(P.acts[0], 'building'), 'Building A');
  assert.equal(D.fmt(P.meta.dataDate), '20-Jan-26');
});

test('quantity liquidation reconciles to the balance and finds concerns', () => {
  const P = SE.demo.build();
  P.meta.dataDate = D.dayOf(2026, 9, 1);
  const it = SE.qty.newItem(P, { name: 'Test bldg', building: 'Test bldg', scope: 1000, done: { dwg: 600, sup: 100, ere: 0 }, last: { sup: 20 } });
  for (const m of ['even', 'front', 'back', 'bell']) {
    SE.qty.liquidate(P, it, 'sup', m, '2026-10', '2027-02');
    assert.equal(Math.round(SE.qty.planTotal(it, 'sup', '2026-10')), 900, m);
  }
  SE.qty.liquidate(P, it, 'ere', 'follow', '2026-10', null, { lag: 1, cap: 150 });
  assert.equal(Math.round(SE.qty.planTotal(it, 'ere', '2026-10')), 1000);
  const an = SE.qty.analyze(P, it);
  assert.ok(an.concerns.some((c) => c.tag === 'DRAWINGS' && /Cumulative supply crosses 600/.test(c.text)));
  assert.ok(!an.concerns.some((c) => /exceeds cumulative supply/.test(c.text)), 'erection follows supply');
  it.plan.sup['2027-03'] = 50;
  assert.ok(SE.qty.analyze(P, it).concerns.some((c) => /not reconciled/.test(c.text)));
  const deck = SE.qty.deck(P, 'building');
  assert.equal(deck.length, 2);
  assert.ok(deck[0].el.length > 100);
});

test('project save / load keeps progress, quantities and settings', () => {
  const P = SE.demo.build();
  SE.qty.sample(P);
  P.settings.dims.building = { mode: 'wbs', wbsLevel: 1 };
  const Q = SE.Project.fromJSON(JSON.parse(JSON.stringify(P.toJSON())));
  assert.equal(Q.acts.length, P.acts.length);
  assert.equal(Q.qty.items.length, 3);
  assert.equal(Q.settings.dims.building.mode, 'wbs');
  assert.equal(Q.cal(Q.acts[5]).isWork(D.dayOf(2026, 0, 26)), false);
});
