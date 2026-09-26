/* Schedule Engine - core/cpm.js
 * Critical Path Method scheduler (P6 "F9") working in whole working days.
 *   - FS / SS / FF / SF relationships with positive or negative lags
 *   - multiple calendars (lags on successor calendar)
 *   - progressed activities: Retained Logic or Progress Override
 *   - constraints: SNET, FNET, Start On, Finish On, SNLT, FNLT, Mandatory Start/Finish
 *   - LOE and WBS-summary activities span their drivers
 *   - total float, free float, critical & longest path, loop detection
 *   - "date driven" mode for schedules imported without logic (Excel / PDF)
 *
 * Points: a moment is encoded as 2*day for start-of-day and 2*day+1 for end-of-day.
 */
(function (SE) {
  'use strict';

  function kind(a) {
    if (a.type === 'start') return 'SM';
    if (a.type === 'finish') return 'FM';
    if (a.type === 'loe' || a.type === 'wbs') return 'SUM';
    return 'T';
  }
  const startBound = (c, pt) => c.next(pt % 2 ? (pt - 1) / 2 + 1 : pt / 2);
  const finishBound = (c, pt) => c.next(Math.floor(pt / 2));
  const NEG = -1e9, POS = 1e9;

  function durDays(a, remaining) {
    const v = remaining ? a.remDur : (a.remDur > 0 ? a.remDur : a.origDur);
    return Math.max(1, Math.ceil((v || 0) - 1e-6));
  }

  function schedule(P, opts) {
    opts = Object.assign({ retainedLogic: P.settings.retainedLogic !== false, useLogic: P.settings.useLogic !== false }, opts || {});
    const idx = P.index();
    const dd = P.meta.dataDate != null ? P.meta.dataDate : SE.D.todayDay();
    const acts = P.acts;
    const S = new Map(); // uid -> working record
    const hasLogic = opts.useLogic && P.rels.length > 0;
    const planStart = P.meta.planStart;

    for (const a of acts) {
      const c = P.cal(a);
      const s0 = P.startOf(a), f0 = P.finishOf(a);
      const k = kind(a);
      const r = { a, c, k, ES: s0, EF: f0, LS: null, LF: null, RS: null, sp: 0, fp: 0, drivers: [] };
      setPts(r);
      S.set(a.uid, r);
    }
    function setPts(r) {
      const es = r.ES != null ? r.ES : dd, ef = r.EF != null ? r.EF : es;
      if (r.k === 'SM') { r.sp = r.fp = 2 * es; } else if (r.k === 'FM') { r.sp = r.fp = 2 * ef + 1; } else { r.sp = 2 * es; r.fp = 2 * ef + 1; }
    }

    // ---- topological order (non-summary activities)
    const nodes = acts.filter((a) => kind(a) !== 'SUM');
    const indeg = new Map();
    for (const a of nodes) indeg.set(a.uid, 0);
    const edges = P.rels.filter((r) => indeg.has(r.pred) && indeg.has(r.succ));
    const out = new Map();
    for (const a of nodes) out.set(a.uid, []);
    for (const e of edges) { indeg.set(e.succ, indeg.get(e.succ) + 1); out.get(e.pred).push(e); }
    const order = [];
    const q = nodes.filter((a) => indeg.get(a.uid) === 0).map((a) => a.uid);
    while (q.length) {
      const u = q.shift();
      order.push(u);
      for (const e of out.get(u)) {
        indeg.set(e.succ, indeg.get(e.succ) - 1);
        if (indeg.get(e.succ) === 0) q.push(e.succ);
      }
    }
    const loops = [];
    if (order.length < nodes.length) {
      const inOrder = new Set(order);
      for (const a of nodes) if (!inOrder.has(a.uid)) { loops.push(a.code); order.push(a.uid); }
    }
    const pos = new Map(order.map((u, i) => [u, i]));

    // ---- forward pass
    for (const u of order) {
      const r = S.get(u), a = r.a, c = r.c;
      if (a.status === 'CO') {
        r.ES = a.aStart != null ? a.aStart : a.aFinish;
        r.EF = a.aFinish != null ? a.aFinish : r.ES;
        r.RS = null;
        setPts(r);
        continue;
      }
      let sLB = c.next(dd);
      if (planStart != null && planStart > dd) sLB = Math.max(sLB, c.next(planStart));
      let fLB = NEG;
      const drv = [];
      const bump = (isStart, v, rel) => {
        if (isStart) { if (v > sLB) { sLB = v; drv.length = 0; } if (v === sLB && rel) drv.push(rel); }
        else { if (v > fLB) { fLB = v; if (rel) { drv.length = 0; } } if (v === fLB && rel) drv.push(rel); }
      };
      if (!hasLogic) {
        // date driven: keep planned start when it is still in the future
        const base = a.status === 'NS' ? (a.tStart != null ? a.tStart : P.refStart(a)) : null;
        if (base != null && base > sLB) sLB = c.next(base);
      } else if (!(a.status === 'IP' && !opts.retainedLogic)) {
        for (const rel of P.predsOf(u)) {
          const p = S.get(rel.pred);
          if (!p || p.k === 'SUM') continue;
          if (pos.has(rel.pred) && pos.get(rel.pred) > pos.get(u) && loops.length) continue; // edge inside loop
          const lag = Math.round(rel.lag || 0);
          const fm = r.k === 'FM', sm = r.k === 'SM';
          switch (rel.type) {
            case 'SS':
              if (fm) bump(false, c.add(finishBound(c, p.sp), lag), rel); else bump(true, c.add(startBound(c, p.sp), lag), rel);
              break;
            case 'FF':
              if (sm) bump(true, c.add(startBound(c, p.fp), lag), rel); else bump(false, c.add(finishBound(c, p.fp), lag), rel);
              break;
            case 'SF':
              if (sm) bump(true, c.add(startBound(c, p.sp), lag), rel); else bump(false, c.add(finishBound(c, p.sp), lag), rel);
              break;
            default: // FS
              if (fm) bump(false, c.add(finishBound(c, p.fp), lag), rel); else bump(true, c.add(startBound(c, p.fp), lag), rel);
          }
        }
      }
      // constraints
      applyForwardConstraint(a.cstr, c, (isStart, v) => bump(isStart, v, null), (isStart, v) => { if (isStart) sLB = v; else fLB = v; });
      applyForwardConstraint(a.cstr2, c, (isStart, v) => bump(isStart, v, null), (isStart, v) => { if (isStart) sLB = v; else fLB = v; });

      if (r.k === 'SM') {
        r.ES = r.EF = Math.max(sLB, fLB > NEG ? c.next(fLB) : NEG);
      } else if (r.k === 'FM') {
        r.ES = r.EF = Math.max(fLB, sLB);
      } else if (a.status === 'IP') {
        const rd = durDays(a, true);
        let RS = sLB;
        let EF = c.finishFrom(RS, rd);
        if (fLB > EF) { EF = fLB; RS = Math.max(RS, c.startFrom(EF, rd)); }
        r.ES = a.aStart; r.RS = RS; r.EF = EF;
      } else {
        const d = durDays(a, false);
        let ES = sLB, EF = c.finishFrom(ES, d);
        if (fLB > EF) { EF = fLB; ES = c.startFrom(EF, d); }
        r.ES = ES; r.EF = EF;
      }
      r.drivers = drv.slice();
      setPts(r);
    }

    // ---- summaries (LOE / WBS summary)
    const sums = acts.filter((a) => kind(a) === 'SUM');
    const wbsDesc = (wid) => {
      const outIds = new Set([wid]);
      const st = [wid];
      while (st.length) { const w = st.pop(); for (const k of idx.kids.get(w) || []) { outIds.add(k.id); st.push(k.id); } }
      return outIds;
    };
    for (const a of sums) {
      const r = S.get(a.uid), c = r.c;
      let es = POS, ef = NEG;
      if (a.type === 'wbs') {
        const ids = wbsDesc(a.wbsId);
        for (const b of acts) if (b !== a && ids.has(b.wbsId) && kind(b) !== 'SUM') {
          const x = S.get(b.uid); es = Math.min(es, x.ES); ef = Math.max(ef, x.EF);
        }
      } else {
        for (const rel of P.predsOf(a.uid)) { const p = S.get(rel.pred); if (!p || p.k === 'SUM') continue; es = Math.min(es, rel.type === 'FS' ? startBound(c, p.fp) : startBound(c, p.sp)); }
        for (const rel of P.succsOf(a.uid)) { const s = S.get(rel.succ); if (!s || s.k === 'SUM') continue; ef = Math.max(ef, rel.type === 'FF' || rel.type === 'SF' ? finishBound(c, s.fp) : c.prev(Math.floor(s.sp / 2) - 1)); }
      }
      if (a.status !== 'NS' && a.aStart != null) es = a.aStart;
      if (a.status === 'CO') { es = a.aStart; ef = a.aFinish; }
      if (es === POS) es = r.ES != null ? r.ES : c.next(dd);
      if (ef === NEG || ef < es) ef = r.EF != null && r.EF >= es ? r.EF : es;
      r.ES = es; r.EF = ef; setPts(r);
    }

    // ---- project finish
    let projFinish = NEG;
    for (const [, r] of S) if (r.EF != null && r.EF > projFinish) projFinish = r.EF;
    if (projFinish === NEG) projFinish = dd;
    const projLF = P.meta.mustFinish != null ? P.meta.mustFinish : projFinish;

    // ---- backward pass
    for (let i = order.length - 1; i >= 0; i--) {
      const u = order[i];
      const r = S.get(u), a = r.a, c = r.c;
      if (a.status === 'CO') { r.LS = r.ES; r.LF = r.EF; continue; }
      let fUB = c.prev(projLF), sUB = POS;
      if (hasLogic) {
        for (const rel of P.succsOf(u)) {
          const s = S.get(rel.succ);
          if (!s || s.k === 'SUM' || s.a.status === 'CO' || s.LS == null) continue;
          if (pos.get(rel.succ) < i && loops.length) continue;
          const cs = s.c, lag = Math.round(rel.lag || 0);
          const sStartDay = s.k === 'FM' ? s.LF : s.LS; // for FM the "start" is its finish moment
          switch (rel.type) {
            case 'SS': {
              const X = cs.add(sStartDay, -lag);
              sUB = Math.min(sUB, c.prev(X));
              break;
            }
            case 'FF': {
              const X = cs.add(s.LF, -lag);
              if (r.k === 'SM') sUB = Math.min(sUB, c.prev(X)); else fUB = Math.min(fUB, c.prev(X));
              break;
            }
            case 'SF': {
              const X = cs.add(s.LF, -lag);
              sUB = Math.min(sUB, c.prev(X));
              break;
            }
            default: { // FS
              if (s.k === 'FM') {
                const X = cs.add(s.LF, -lag);
                if (r.k === 'SM') sUB = Math.min(sUB, c.prev(X)); else fUB = Math.min(fUB, c.prev(X));
              } else {
                const X = cs.add(s.LS, -lag);
                if (r.k === 'SM') sUB = Math.min(sUB, c.prev(X)); else fUB = Math.min(fUB, c.prev(X - 1));
              }
            }
          }
        }
      }
      applyBackwardConstraint(a.cstr, c, (isStart, v) => { if (isStart) sUB = Math.min(sUB, v); else fUB = Math.min(fUB, v); });
      applyBackwardConstraint(a.cstr2, c, (isStart, v) => { if (isStart) sUB = Math.min(sUB, v); else fUB = Math.min(fUB, v); });
      if (r.k === 'SM') { r.LS = r.LF = Math.min(sUB, fUB === POS ? POS : c.next(fUB)); if (r.LS === POS) r.LS = r.LF = r.ES; }
      else if (r.k === 'FM') { r.LS = r.LF = Math.min(fUB, sUB); }
      else {
        const d = a.status === 'IP' ? durDays(a, true) : durDays(a, false);
        let LF = fUB;
        if (sUB < POS) LF = Math.min(LF, c.finishFrom(sUB, d));
        r.LF = c.prev(LF);
        r.LS = c.startFrom(r.LF, d);
      }
    }
    for (const a of sums) { const r = S.get(a.uid); r.LS = r.ES; r.LF = r.EF; }

    // ---- floats
    let crit = 0, negFloat = 0;
    for (const u of order) {
      const r = S.get(u), a = r.a, c = r.c;
      if (a.status === 'CO') { r.TF = null; r.FF = null; continue; }
      if (r.k === 'SM') r.TF = c.between(r.ES, r.LS);
      else if (r.k === 'FM') r.TF = c.between(r.EF, r.LF);
      else r.TF = c.between(r.EF, r.LF);
      // free float from successors' early dates
      let ffUB = c.prev(projFinish);
      let any = false;
      for (const rel of hasLogic ? P.succsOf(u) : []) {
        const s = S.get(rel.succ);
        if (!s || s.k === 'SUM' || s.a.status === 'CO') continue;
        any = true;
        const cs = s.c, lag = Math.round(rel.lag || 0);
        const sEarlyStart = s.a.status === 'IP' ? s.RS : (s.k === 'FM' ? s.EF : s.ES);
        let lim;
        if (rel.type === 'FS') lim = s.k === 'FM' ? c.prev(cs.add(s.EF, -lag)) : c.prev(cs.add(sEarlyStart, -lag) - 1);
        else if (rel.type === 'FF') lim = c.prev(cs.add(s.EF, -lag));
        else continue; // SS/SF: do not bound the finish
        ffUB = Math.min(ffUB, lim);
      }
      const ref = r.k === 'SM' ? r.ES : r.EF;
      r.FF = Math.max(0, Math.min(any ? c.between(ref, ffUB) : r.TF, r.TF));
      if (r.TF <= 0) crit++;
      if (r.TF < 0) negFloat++;
    }

    // ---- longest path (driving chain back from the latest finish)
    const longest = new Set();
    const st = [];
    for (const u of order) { const r = S.get(u); if (r.a.status !== 'CO' && r.EF === projFinish) st.push(u); }
    while (st.length) {
      const u = st.pop();
      if (longest.has(u)) continue;
      longest.add(u);
      for (const rel of S.get(u).drivers) if (S.get(rel.pred) && S.get(rel.pred).a.status !== 'CO') st.push(rel.pred);
    }

    // ---- write back
    const dd0 = dd;
    for (const [, r] of S) {
      const a = r.a;
      if (a.status === 'CO') {
        a.eStart = a.aStart; a.eFinish = a.aFinish; a.lStart = a.aStart; a.lFinish = a.aFinish;
        a.tf = null; a.ff = null; a.crit = false; a.rStart = null; a.longest = false;
        continue;
      }
      a.eStart = a.status === 'IP' ? r.RS : r.ES;
      a.rStart = a.status === 'IP' ? r.RS : r.ES;
      a.eFinish = r.EF;
      a.lStart = r.LS; a.lFinish = r.LF;
      a.tf = r.TF != null ? r.TF : 0;
      a.ff = r.FF != null ? r.FF : 0;
      a.crit = r.k !== 'SUM' && a.tf <= 0;
      a.longest = longest.has(a.uid);
      if (a.status === 'NS') { a.tStart = r.ES; a.tFinish = r.EF; }
    }
    P.meta.scheduledFinish = projFinish;
    P.meta.lastScheduled = Date.now();
    P.settings.scheduled = true;
    const openStart = hasLogic ? nodes.filter((a) => a.status === 'NS' && !P.predsOf(a.uid).length && !a.cstr && P.refStart(a) != null && P.refStart(a) > dd0 + 7).length : 0;
    return {
      finish: projFinish, critical: crit, negativeFloat: negFloat, loops, mode: hasLogic ? 'logic' : 'date-driven',
      openStartPulled: openStart, count: acts.length
    };
  }

  function cstrDay(cs) { return cs && cs.date != null ? cs.date : null; }
  function applyForwardConstraint(cs, c, bump, force) {
    if (!cs || !cs.type) return;
    const d = cstrDay(cs);
    if (d == null) return;
    switch (cs.type) {
      case 'CS_MSOA': case 'SNET': bump(true, c.next(d)); break;
      case 'CS_MSO': case 'SO': bump(true, c.next(d)); break;
      case 'CS_MEOA': case 'FNET': bump(false, c.prev(d)); break;
      case 'CS_MEO': case 'FO': bump(false, c.prev(d)); break;
      case 'CS_MANDSTART': case 'MSO': force(true, c.next(d)); break;
      case 'CS_MANDFIN': case 'MFO': force(false, c.prev(d)); break;
      default: break;
    }
  }
  function applyBackwardConstraint(cs, c, bound) {
    if (!cs || !cs.type) return;
    const d = cstrDay(cs);
    if (d == null) return;
    switch (cs.type) {
      case 'CS_MSOB': case 'SNLT': case 'CS_MSO': case 'SO': case 'CS_MANDSTART': case 'MSO': bound(true, c.prev(d)); break;
      case 'CS_MEOB': case 'FNLT': case 'CS_MEO': case 'FO': case 'CS_MANDFIN': case 'MFO': bound(false, c.prev(d)); break;
      default: break;
    }
  }

  const CSTR_LABEL = {
    CS_MSOA: 'Start On or After', CS_MSO: 'Start On', CS_MEOA: 'Finish On or After', CS_MEO: 'Finish On',
    CS_MSOB: 'Start On or Before', CS_MEOB: 'Finish On or Before', CS_MANDSTART: 'Mandatory Start',
    CS_MANDFIN: 'Mandatory Finish', CS_ALAP: 'As Late As Possible'
  };

  SE.schedule = schedule;
  SE.CSTR_LABEL = CSTR_LABEL;
})(typeof module === 'object' && module.exports ? (global.SE = global.SE || {}) : (window.SE = window.SE || {}));
