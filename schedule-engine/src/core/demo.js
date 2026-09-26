/* Schedule Engine - core/demo.js
 * A realistic demo EPC project (industrial plant expansion, 6 buildings) with
 * logic, calendars with Indian holidays, codes and last-month progress, so every
 * feature can be tried without a real XER.
 */
(function (SE) {
  'use strict';
  const D = SE.D;

  function rng(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6d2b79f5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  const BUILDINGS = [
    { code: 'ADM', name: 'Admin Building', k: 1.2, lag: 0 },
    { code: 'MPB', name: 'Main Process Building', k: 2.0, lag: 10 },
    { code: 'WHS', name: 'Warehouse Block', k: 1.4, lag: 40 },
    { code: 'SUB', name: '33kV Substation', k: 1.2, lag: 60 },
    { code: 'UTL', name: 'Utility Building', k: 1.4, lag: 90 },
    { code: 'STP', name: 'STP & Pump House', k: 1.0, lag: 120 }
  ];
  const TEMPLATE = [
    // [key, EPC, name, dur, discipline, preds [key, type, lag]]
    ['E1', 'E', 'Design basis & architectural layout', 15, 'Architecture', [['M0', 'FS', 0]]],
    ['E2', 'E', 'Structural design & IFC drawings', 25, 'Structural', [['E1', 'SS', 5]]],
    ['E3', 'E', 'MEP design & drawings', 30, 'MEP', [['E1', 'FS', 0]]],
    ['E4', 'E', 'Drawing approval by client', 10, 'Architecture', [['E2', 'FS', 0], ['E3', 'FF', 0]]],
    ['P1', 'P', 'Structural steel - PO placement', 10, 'Structural', [['E2', 'FS', 0]]],
    ['P2', 'P', 'Structural steel - fabrication & supply to site', 45, 'Structural', [['P1', 'FS', 0]]],
    ['P3', 'P', 'MEP equipment - PO placement', 12, 'MEP', [['E3', 'FS', 0]]],
    ['P4', 'P', 'MEP equipment - manufacturing & delivery', 60, 'MEP', [['P3', 'FS', 0]]],
    ['C1', 'C', 'Site mobilisation & survey', 5, 'Civil', [['M0', 'FS', 0]]],
    ['C2', 'C', 'Excavation', 15, 'Civil', [['C1', 'FS', 0], ['E2', 'SS', 10]]],
    ['C3', 'C', 'PCC & foundation concreting', 25, 'Civil', [['C2', 'SS', 7]]],
    ['C4', 'C', 'Plinth beam & backfilling', 15, 'Civil', [['C3', 'FS', 0]]],
    ['C5', 'C', 'Superstructure - RCC / steel erection', 45, 'Structural', [['C4', 'FS', 0], ['P2', 'SS', 15]]],
    ['C6', 'C', 'Roofing & cladding', 20, 'Structural', [['C5', 'FS', -5]]],
    ['C7', 'C', 'Masonry & plastering', 30, 'Civil', [['C5', 'SS', 20]]],
    ['C8', 'C', 'MEP installation', 40, 'MEP', [['C7', 'SS', 10], ['P4', 'FS', 0]]],
    ['C9', 'C', 'Finishes - flooring & painting', 30, 'Architecture', [['C7', 'FS', 0], ['C6', 'FS', 0]]],
    ['C10', 'C', 'Testing & commissioning', 12, 'MEP', [['C8', 'FS', 0], ['C9', 'FF', 0]]],
    ['M9', 'C', 'Building handover to client', 0, 'Milestone', [['C10', 'FS', 0]]]
  ];

  function build(opts) {
    opts = Object.assign({ progressTo: D.dayOf(2026, 8, 1) }, opts || {});
    const R = rng(20260901);
    const P = new SE.Project();
    P.meta.name = 'Industrial Plant Expansion - Phase 2 (Demo)';
    P.meta.code = 'IPX-P2';
    P.meta.source = 'demo';
    P.meta.fileName = 'Demo project';
    const hol = [D.dayOf(2026, 0, 26), D.dayOf(2026, 2, 4), D.dayOf(2026, 3, 3), D.dayOf(2026, 7, 15), D.dayOf(2026, 9, 2), D.dayOf(2026, 9, 20), D.dayOf(2026, 10, 9), D.dayOf(2026, 11, 25), D.dayOf(2027, 0, 26), D.dayOf(2027, 2, 22)];
    const cal = new SE.Calendar({ id: '1', name: 'Site 6-Day (Mon-Sat) with holidays', workWeek: [false, true, true, true, true, true, true], hoursPerDay: 8, startMin: 480, endMin: 1020, holidays: hol });
    const cal5 = new SE.Calendar({ id: '2', name: 'Office 5-Day (Mon-Fri)', workWeek: [false, true, true, true, true, true, false], hoursPerDay: 8, startMin: 540, endMin: 1080, holidays: hol });
    P.calendars['1'] = cal; P.calendars['2'] = cal5; P.defaultCalId = '1';
    P.meta.planStart = D.dayOf(2026, 0, 5);
    P.meta.dataDate = P.meta.planStart;
    let wid = 100;
    const root = String(++wid);
    P.wbs[root] = { id: root, parentId: null, code: P.meta.code, name: P.meta.name, seq: 0 };
    P.rootWbsId = root;
    const gen = String(++wid);
    P.wbs[gen] = { id: gen, parentId: root, code: 'GEN', name: 'Project Milestones', seq: 1 };
    const disc = { id: 'dt1', name: 'Discipline', values: [] };
    const discVals = {};
    P.codeTypes.push(disc);
    let tid = 1000;
    const mk = (o) => { const a = SE.newAct(Object.assign({ uid: String(++tid), calId: '1' }, o)); a.remDur = a.origDur; P.acts.push(a); return a; };
    const M0 = mk({ code: 'MS-1000', name: 'Notice to proceed / Project start', wbsId: gen, type: 'start', origDur: 0, cstr: { type: 'CS_MSOA', date: P.meta.planStart } });
    const MF = mk({ code: 'MS-9000', name: 'Plant mechanical completion', wbsId: gen, type: 'finish', origDur: 0 });
    const rels = [];
    let seq = 2;
    for (const b of BUILDINGS) {
      const bw = String(++wid);
      P.wbs[bw] = { id: bw, parentId: root, code: b.code, name: b.name, seq: seq++ };
      const ph = {};
      [['E', 'Engineering'], ['P', 'Procurement'], ['C', 'Construction']].forEach(([k, n], i) => {
        const id = String(++wid);
        P.wbs[id] = { id, parentId: bw, code: b.code + '.' + k, name: n, seq: i };
        ph[k] = id;
      });
      const map = { M0 };
      let n = 1000;
      for (const t of TEMPLATE) {
        const dur = t[3] === 0 ? 0 : Math.max(3, Math.round(t[3] * b.k * (0.85 + R() * 0.3)));
        if (!discVals[t[4]]) { discVals[t[4]] = { id: 'dv' + Object.keys(discVals).length, code: t[4], name: t[4] }; disc.values.push(discVals[t[4]]); }
        const a = mk({
          code: b.code + '-' + t[1] + (n += 10), name: t[2], wbsId: ph[t[1]], origDur: dur, type: t[3] === 0 ? 'finish' : 'task',
          calId: t[1] === 'E' ? '2' : '1', codes: { Discipline: t[4] }, pctType: t[1] === 'C' ? 'phys' : 'dur'
        });
        map[t[0]] = a;
        for (const [pk, type, lag] of t[5]) {
          const p = map[pk];
          if (p) rels.push({ pred: p.uid, succ: a.uid, type, lag: pk === 'M0' ? lag + b.lag : lag });
        }
        if (t[0] === 'M9') rels.push({ pred: a.uid, succ: MF.uid, type: 'FS', lag: 0 });
        if (t[0] === 'E2' || t[0] === 'P2' || t[0] === 'C5') a.qty = { unit: 'MT', scope: Math.round(b.k * 420 / 10) * 10, done: 0, items: [] };
        if (t[0] === 'C8') a.qty = { unit: 'Nos', scope: Math.round(dur * 6), done: 0, items: [] };
        if (t[0] === 'C3') a.qty = { unit: 'Cum', scope: Math.round(dur * 40), done: 0, items: [] };
      }
    }
    let rid = 0;
    P.rels = rels.map((r) => Object.assign({ id: String(++rid) }, r));
    P.index();
    SE.schedule(P);
    // capture original plan as baseline
    for (const a of P.acts) a.bl = { start: a.eStart, finish: a.eFinish };

    // simulate progress up to opts.progressTo (previous update), respecting logic
    const dd = opts.progressTo;
    P.meta.dataDate = dd;
    const order = P.acts.slice().sort((x, y) => (x.eStart - y.eStart) || (x.eFinish - y.eFinish));
    for (const a of order) {
      const c = P.cal(a);
      if (a === M0) { a.status = 'CO'; a.aStart = a.aFinish = P.meta.planStart; a.pct = 100; a.remDur = 0; continue; }
      // earliest possible actual start from predecessors' actuals
      let es = a.eStart, ok = true;
      for (const r of P.predsOf(a.uid)) {
        const p = P.act(r.pred);
        if (r.type === 'FS') {
          if (p.status !== 'CO') { ok = false; break; }
          es = Math.max(es, c.add(c.next(p.aFinish + (p.type === 'start' ? 0 : 1)), r.lag));
        } else if (r.type === 'SS') {
          if (p.status === 'NS') { ok = false; break; }
          es = Math.max(es, c.add(p.aStart, r.lag));
        }
      }
      if (!ok) continue;
      const slipBias = a.code.startsWith('SUB') ? 6 : a.code.startsWith('MPB') ? 3 : 0;
      const s = c.add(es, Math.max(0, Math.round(R() * 6 - 1 + slipBias)));
      if (s >= dd) continue;
      if (a.type === 'finish') {
        const doneFF = P.predsOf(a.uid).every((r) => P.act(r.pred).status === 'CO');
        if (doneFF && s < dd) { a.status = 'CO'; a.aStart = a.aFinish = s; a.pct = 100; a.remDur = 0; }
        continue;
      }
      let f = c.finishFrom(s, a.origDur * (0.9 + R() * 0.3));
      // FF predecessors must be finished first
      const ffBlock = P.predsOf(a.uid).some((r) => r.type === 'FF' && P.act(r.pred).status !== 'CO');
      if (!ffBlock) for (const r of P.predsOf(a.uid)) if (r.type === 'FF') f = Math.max(f, P.act(r.pred).aFinish);
      if (f < dd && !ffBlock) {
        a.status = 'CO'; a.aStart = s; a.aFinish = f; a.pct = 100; a.remDur = 0;
      } else {
        a.status = 'IP'; a.aStart = s;
        const done = c.span(s, dd - 1);
        a.pct = Math.max(5, Math.min(95, Math.round(done / Math.max(1, a.origDur) * 100 * (0.7 + R() * 0.35))));
        a.remDur = Math.max(1, Math.round(a.origDur * (1 - a.pct / 100) * (1 + R() * 0.3)));
      }
      if (a.qty) a.qty.done = Math.round(a.qty.scope * a.pct / 100);
    }
    // two activities started ahead of plan (shows the "future activity showing progress" lens)
    let early = 0;
    for (const a of order) {
      if (early >= 2) break;
      if (a.status !== 'NS' || a.type !== 'task' || a.bl.start < dd + 30 || !/C1150|C1160/.test(a.code)) continue;
      a.status = 'IP'; a.aStart = P.cal(a).prev(dd - 6); a.pct = 5; a.remDur = Math.max(1, a.origDur - 2);
      early++;
    }
    SE.schedule(P);
    P.log = [];
    P.undoStack = []; P.redoStack = [];
    P.autoConfigureDims();
    P.snapshotPrev();
    return P;
  }

  SE.demo = { build };
})(typeof module === 'object' && module.exports ? (global.SE = global.SE || {}) : (window.SE = window.SE || {}));
