/* Schedule Engine - core/qty.js
 * Quantity tracker & liquidation planner (scope → drawings → supply → erection)
 * with automatic concerns, milestones and status, aggregation building-wise /
 * WBS-wise / EPC-wise / combined, and a slide layout spec ("one-pager") that is
 * rendered identically to HTML preview, PowerPoint and PDF.
 */
(function (SE) {
  'use strict';
  const D = SE.D;

  /* ---------------- months ---------------- */
  const pad = (n) => (n < 10 ? '0' + n : '' + n);
  const keyOf = (day) => { const p = D.parts(day); return p.y + '-' + pad(p.m + 1); };
  const keyDay = (k) => D.dayOf(+k.slice(0, 4), +k.slice(5, 7) - 1, 1);
  const keyAdd = (k, n) => keyOf(D.addMonths(keyDay(k), n));
  const keyCmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  const MON = SE.MONTHS;
  const keyLabel = (k, force) => { const m = +k.slice(5, 7) - 1; return MON[m] + (force || m === 0 ? '-' + k.slice(2, 4) : ''); };
  const keyLong = (k) => MON[+k.slice(5, 7) - 1] + '-' + k.slice(2, 4);
  function monthsBetween(a, b) { const out = []; let k = a; let g = 0; while (keyCmp(k, b) <= 0 && g++ < 240) { out.push(k); k = keyAdd(k, 1); } return out; }
  const fmtQ = (n) => (n == null || !isFinite(n) ? '–' : Math.round(n).toLocaleString('en-IN'));
  const fmtP = (n) => (n == null || !isFinite(n) ? '–' : (n < 10 && n > 0 && n % 1 ? n.toFixed(1) : Math.round(n)) + '%');

  const DEFAULT_STAGES = [
    { key: 'dwg', name: 'Drawings released', short: 'Drawings', color: '#F5A623', plan: false },
    { key: 'sup', name: 'Supply', short: 'Supply', color: '#00B8F5', plan: true },
    { key: 'ere', name: 'Erection', short: 'Erection', color: '#1E49E2', plan: true }
  ];
  const FRONT_CATS = {
    front: { name: 'Front / drawings', color: '#FD349C' },
    supply: { name: 'Supply', color: '#00B8F5' },
    erection: { name: 'Erection', color: '#1E49E2' },
    ts: { name: 'TS / bins', color: '#7213EA' },
    handover: { name: 'Handover', color: '#1F9D55' }
  };

  function ensure(P) {
    if (!P.qty) {
      P.qty = { unit: 'MT', asOf: null, stages: JSON.parse(JSON.stringify(DEFAULT_STAGES)), items: [], groupBy: 'building', title: 'Building structures status' };
    }
    const Q = P.qty;
    if (!Q.stages || !Q.stages.length) Q.stages = JSON.parse(JSON.stringify(DEFAULT_STAGES));
    Q.items.forEach((it) => normItem(Q, it));
    return Q;
  }
  function asOf(P) { const Q = ensure(P); return Q.asOf != null ? Q.asOf : (P.meta.dataDate != null ? P.meta.dataDate - 1 : D.todayDay()); }
  function startKey(P) { return keyAdd(keyOf(asOf(P)), 1); }
  function normItem(Q, it) {
    it.done = it.done || {}; it.last = it.last || {}; it.plan = it.plan || {}; it.fronts = it.fronts || []; it.concerns = it.concerns || []; it.links = it.links || {}; it.target = it.target || {};
    Q.stages.forEach((s) => { if (s.plan && !it.plan[s.key]) it.plan[s.key] = {}; if (it.done[s.key] == null) it.done[s.key] = 0; });
    if (it.status == null) it.status = 'auto';
    return it;
  }
  function newItem(P, o) {
    const Q = ensure(P);
    const it = normItem(Q, Object.assign({ id: 'q' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name: 'New item', building: '', wbs: '', epc: 'Construction', vendor: '', scope: 0, scopeNote: '' }, o || {}));
    Q.items.push(it);
    return it;
  }

  /* ---------------- per item maths ---------------- */
  const planStages = (Q) => Q.stages.filter((s) => s.plan);
  function balance(it, st) { return Math.max(0, (+it.scope || 0) - (+it.done[st] || 0)); }
  function planTotal(it, st, from) { let t = 0; const pl = it.plan[st] || {}; for (const k in pl) if (!from || keyCmp(k, from) >= 0) t += +pl[k] || 0; return t; }
  function lastPlanKey(it, st) { const ks = Object.keys(it.plan[st] || {}).filter((k) => (+it.plan[st][k] || 0) > 0).sort(); return ks.length ? ks[ks.length - 1] : null; }
  function firstPlanKey(it, st, from) { const ks = Object.keys(it.plan[st] || {}).filter((k) => (+it.plan[st][k] || 0) > 0 && (!from || keyCmp(k, from) >= 0)).sort(); return ks.length ? ks[0] : null; }
  function horizon(P, items, min, max) {
    const Q = ensure(P);
    const s = startKey(P);
    let e = keyAdd(s, (min || 6) - 1);
    for (const it of items) for (const st of planStages(Q)) { const l = lastPlanKey(it, st.key); if (l && keyCmp(l, e) > 0) e = l; }
    let ms = monthsBetween(s, e);
    if (max && ms.length > max) ms = ms.slice(0, max);
    return ms;
  }
  function cum(it, st, months) { let c = +it.done[st] || 0; return months.map((k) => (c += +(it.plan[st] || {})[k] || 0)); }

  /**
   * Distribute the balance of a stage over months.
   * method: even | front | back | bell | rate | linked | follow
   */
  function liquidate(P, it, st, method, from, to, opt) {
    opt = opt || {};
    const Q = ensure(P);
    const bal = opt.total != null ? opt.total : balance(it, st);
    from = from || startKey(P);
    const pl = it.plan[st] = it.plan[st] || {};
    for (const k in pl) if (keyCmp(k, from) >= 0) delete pl[k];
    if (bal <= 0) return it;
    let months = monthsBetween(from, to || keyAdd(from, 5));
    let w;
    const n = months.length;
    if (method === 'rate') {
      const r = Math.max(1, +opt.rate || Math.ceil(bal / n));
      months = [];
      let left = bal, k = from;
      while (left > 0 && months.length < 120) { months.push(k); left -= r; k = keyAdd(k, 1); }
      w = months.map(() => r);
    } else if (method === 'front') w = months.map((_, i) => n - i);
    else if (method === 'back') w = months.map((_, i) => i + 1);
    else if (method === 'bell') w = months.map((_, i) => Math.sin(Math.PI * (i + 0.5) / n) + 0.15);
    else if (method === 'linked') {
      const a = P.act(it.links[st]);
      if (a) {
        const c = P.cal(a);
        const s = a.status === 'IP' ? Math.max(P.meta.dataDate, a.rStart || P.meta.dataDate) : P.startOf(a);
        const f = P.finishOf(a);
        months = monthsBetween(keyOf(Math.max(s, keyDay(from))), keyOf(Math.max(f, keyDay(from))));
        w = months.map((k) => { const a0 = Math.max(keyDay(k), s), b0 = Math.min(D.addMonths(keyDay(k), 1) - 1, f); return b0 >= a0 ? c.span(a0, b0) : 0; });
        if (!w.some((x) => x > 0)) w = months.map(() => 1);
      } else w = months.map(() => 1);
    } else if (method === 'follow') {
      // erection follows supply with a lag (months) and a monthly cap
      const lag = +opt.lag || 1, cap = +opt.cap || Infinity;
      const sup = opt.source || 'sup';
      const all = monthsBetween(from, keyAdd(from, 60));
      let avail = (+it.done[sup] || 0) - (+it.done[st] || 0), left = bal;
      months = []; w = [];
      for (let i = 0; i < all.length && left > 0.0001; i++) {
        const k = all[i];
        const arr = +(it.plan[sup] || {})[keyAdd(k, -lag)] || 0;
        avail += arr;
        const q = Math.min(left, Math.max(0, avail), cap);
        months.push(k); w.push(q);
        avail -= q; left -= q;
      }
      months.forEach((k, i) => { if (w[i] > 0) pl[k] = round(w[i]); });
      fixTotal(pl, from, bal);
      return it;
    } else w = months.map(() => 1);
    const sw = w.reduce((a, b) => a + b, 0) || 1;
    if (method === 'rate') {
      let left = bal;
      months.forEach((k) => { const q = Math.min(left, w[0]); pl[k] = round(q); left -= q; });
    } else months.forEach((k, i) => { if (w[i] > 0) pl[k] = round(bal * w[i] / sw); });
    fixTotal(pl, from, bal);
    void Q;
    return it;
  }
  function round(n) { return n >= 20 ? Math.round(n) : Math.round(n * 10) / 10; }
  function fixTotal(pl, from, bal) {
    const ks = Object.keys(pl).filter((k) => keyCmp(k, from) >= 0 && pl[k] > 0).sort();
    if (!ks.length) return;
    const tot = ks.reduce((s, k) => s + pl[k], 0);
    const d = Math.round((bal - tot) * 10) / 10;
    if (d) { const k = ks.reduce((m, x) => (pl[x] > pl[m] ? x : m), ks[0]); pl[k] = Math.round((pl[k] + d) * 10) / 10; }
  }

  /* ---------------- aggregation ---------------- */
  function groupKeyOf(it, by) {
    if (by === 'combined') return 'All items';
    if (by === 'item') return it.name;
    if (by === 'wbs') return it.wbs || '(No WBS)';
    if (by === 'epc') return it.epc || 'Others';
    return it.building || it.name;
  }
  function groups(P, by) {
    const Q = ensure(P);
    by = by || Q.groupBy || 'building';
    const m = new Map();
    for (const it of Q.items) { const g = groupKeyOf(it, by); if (!m.has(g)) m.set(g, []); m.get(g).push(it); }
    let keys = Array.from(m.keys());
    if (by === 'epc') keys.sort((a, b) => (SE.EPC.indexOf(a) < 0 ? 9 : SE.EPC.indexOf(a)) - (SE.EPC.indexOf(b) < 0 ? 9 : SE.EPC.indexOf(b)));
    return keys.map((k) => ({ key: k, by, items: m.get(k), agg: aggregate(P, k, m.get(k)) }));
  }
  function aggregate(P, name, items) {
    const Q = ensure(P);
    if (items.length === 1) return Object.assign({ single: true, members: items }, items[0], { name: items[0].name || name });
    const g = { id: 'g:' + name, name, single: false, members: items, scope: 0, done: {}, last: {}, plan: {}, fronts: [], concerns: [], target: {}, status: 'auto' };
    g.vendor = Array.from(new Set(items.map((i) => i.vendor).filter(Boolean))).join(', ');
    g.scopeNote = items.length + ' items: ' + items.map((i) => i.name).join(', ');
    Q.stages.forEach((s) => { g.done[s.key] = 0; g.last[s.key] = 0; if (s.plan) g.plan[s.key] = {}; });
    for (const it of items) {
      g.scope += +it.scope || 0;
      Q.stages.forEach((s) => {
        g.done[s.key] += +it.done[s.key] || 0;
        g.last[s.key] += +it.last[s.key] || 0;
        if (s.plan) for (const k in it.plan[s.key] || {}) g.plan[s.key][k] = (g.plan[s.key][k] || 0) + (+it.plan[s.key][k] || 0);
      });
      // one front row per member: overall span of its planned work
      const ks = [];
      planStages(Q).forEach((s) => { const a = firstPlanKey(it, s.key), b = lastPlanKey(it, s.key); if (a) ks.push(a); if (b) ks.push(b); });
      it.fronts.forEach((f) => { if (f.from) ks.push(f.from); if (f.to) ks.push(f.to); });
      if (ks.length) {
        ks.sort();
        const supA = firstPlanKey(it, 'sup'), ereA = firstPlanKey(it, 'ere');
        g.fronts.push({ name: it.name, cat: 'erection', from: ks[0], to: ks[ks.length - 1], sub: [supA && { cat: 'supply', from: supA, to: lastPlanKey(it, 'sup') }, ereA && { cat: 'erection', from: ereA, to: lastPlanKey(it, 'ere') }].filter(Boolean) });
      }
      for (const s of ['sup', 'ere']) if (it.target[s] && (!g.target[s] || keyCmp(it.target[s], g.target[s]) > 0)) g.target[s] = it.target[s];
    }
    return g;
  }

  /* ---------------- analysis: KPIs, concerns, milestones, status ---------------- */
  function analyze(P, it, months) {
    const Q = ensure(P);
    const U = Q.unit || '';
    const aoK = keyOf(asOf(P));
    const aoLbl = MON[+aoK.slice(5, 7) - 1];
    months = months || horizon(P, [it], 6, 12);
    const S0 = startKey(P);
    const scope = +it.scope || 0;
    const has = (k) => Q.stages.some((s) => s.key === k);
    const dwg = has('dwg') ? +it.done.dwg || 0 : scope;
    const supDone = +it.done.sup || 0, ereDone = +it.done.ere || 0;
    const supPl = (it.plan.sup || {}), erePl = (it.plan.ere || {});
    const next3 = monthsBetween(S0, keyAdd(S0, 2));
    const sum = (pl, ks) => ks.reduce((a, k) => a + (+pl[k] || 0), 0);
    const sup3 = sum(supPl, next3), ere3 = sum(erePl, next3);
    const peak = (pl) => { let m = 0, ks = []; for (const k in pl) { const v = +pl[k] || 0; if (keyCmp(k, S0) < 0) continue; if (v > m + 0.001) { m = v; ks = [k]; } else if (Math.abs(v - m) < 0.001 && v > 0) ks.push(k); } ks.sort(); return { v: m, ks }; };
    const pS = peak(supPl), pE = peak(erePl);
    const cumS = cum(it, 'sup', months), cumE = cum(it, 'ere', months);
    const waiting = months.map((k, i) => cumS[i] - cumE[i]);
    let wPeak = 0, wK = null;
    waiting.forEach((v, i) => { if (v > wPeak) { wPeak = v; wK = months[i]; } });
    const supTot = planTotal(it, 'sup', S0), ereTot = planTotal(it, 'ere', S0);
    const supBal = Math.max(0, scope - supDone), ereBal = Math.max(0, scope - ereDone);
    const supStart = firstPlanKey(it, 'sup', S0), supEnd = lastPlanKey(it, 'sup');
    const ereStart = firstPlanKey(it, 'ere', S0), ereEnd = lastPlanKey(it, 'ere');
    const rng = (ks) => (ks.length ? (ks.length > 1 ? keyLabel(ks[0]) + '–' + keyLabel(ks[ks.length - 1]) : keyLabel(ks[0])) : '');
    const tiles = [
      { label: 'SCOPE', value: fmtQ(scope) + ' ' + U, sub: it.scopeNote || (it.vendor ? 'Vendor: ' + it.vendor : ''), dark: true },
      { label: 'DRAWINGS RELEASED', value: fmtQ(dwg) + ' ' + U, sub: scope ? fmtP(dwg / scope * 100) + ' of scope  ·  ' + (scope - dwg > 0 ? fmtQ(scope - dwg) + ' ' + U + ' pending' : 'nil pending') : '' },
      { label: 'SUPPLIED TILL ' + aoLbl.toUpperCase(), value: supDone ? fmtQ(supDone) + ' ' + U : 'Nil', sub: (it.last.sup ? aoLbl + ' actual ' + fmtQ(it.last.sup) + ' ' + U : 'Nil in ' + aoLbl) + (Math.abs(supTot - supBal) > Math.max(1, scope * 0.005) ? (supTot > supBal ? '; plan exceeds balance by ' : '; plan short of balance by ') + fmtQ(Math.abs(supTot - supBal)) : '') },
      { label: keyLabel(next3[0]).slice(0, 3).toUpperCase() + '–' + keyLabel(next3[2]).slice(0, 3).toUpperCase() + ' SUPPLY PLAN', value: fmtQ(sup3) + ' ' + U, sub: (scope ? fmtP(sup3 / scope * 100) + ' of scope  ·  ' : '') + next3.map((k) => fmtQ(+supPl[k] || 0)).join(' / ') + ' ' + U },
      { label: keyLabel(next3[0]).slice(0, 3).toUpperCase() + '–' + keyLabel(next3[2]).slice(0, 3).toUpperCase() + ' ERECTION PLAN', value: fmtQ(ere3) + ' ' + U, sub: (scope ? fmtP(ere3 / scope * 100) + ' of scope  ·  ' : '') + (ereDone ? fmtQ(ereDone) + ' erected' : '0 erected') + (ereStart && keyCmp(ereStart, S0) >= 0 && !ereDone ? ', starts ' + keyLong(ereStart) : '') },
      { label: 'PEAK MONTHLY RATE (' + U + ')', value: fmtQ(pS.v) + ' | ' + fmtQ(pE.v), sub: 'supply (' + rng(pS.ks) + ')  |  erection (' + rng(pE.ks) + ')' }
    ];
    // ---- concerns (auto) ----
    const C = [];
    const add = (tag, sev, text, action) => C.push({ tag, sev, text, action, auto: true });
    if (has('dwg') && dwg < scope) {
      const k = months.find((m, i) => cumS[i] > dwg + 0.001);
      add('DRAWINGS', k ? 'high' : 'med', 'Only ' + fmtQ(dwg) + ' of ' + fmtQ(scope) + ' ' + U + ' drawings released; ' + fmtQ(scope - dwg) + ' ' + U + ' (' + fmtP((scope - dwg) / scope * 100) + ') pending.' + (k ? ' Cumulative supply crosses ' + fmtQ(dwg) + ' ' + U + ' in ' + keyLong(k) + '.' : ''),
        'Close balance drawings / PO by ' + keyLong(k ? keyAdd(k, -2) : keyAdd(S0, 1)) + (k ? ' to feed ' + keyLabel(k) + ' fabrication.' : '.'));
    }
    const recon = (stKey, nm, tot, bal, done) => {
      if (bal <= 0 && tot <= 0) return;
      if (tot <= 0) { add(nm.toUpperCase(), 'high', 'No ' + nm.toLowerCase() + ' plan for the balance ' + fmtQ(bal) + ' ' + U + '.', 'Prepare a month-wise ' + nm.toLowerCase() + ' plan for ' + fmtQ(bal) + ' ' + U + '.'); return; }
      if (Math.abs(tot - bal) > Math.max(1, scope * 0.005)) {
        const f = firstPlanKey(it, stKey, S0), l = lastPlanKey(it, stKey);
        add(nm.toUpperCase(), 'high', keyLabel(f, true) + '–' + keyLabel(l) + ' ' + nm.toLowerCase() + ' plan totals ' + fmtQ(tot) + ' ' + U + ' but the balance is ' + fmtQ(bal) + ' ' + U + (done ? ' (' + fmtQ(done) + ' ' + U + ' already done)' : '') + ' - quantities not reconciled against scope.',
          'Reconcile the ' + nm.toLowerCase() + ' plan against scope and the ' + keyLong(aoK) + ' actual.');
      }
    };
    recon('sup', 'Supply', supTot, supBal, supDone);
    recon('ere', 'Erection', ereTot, ereBal, ereDone);
    const lastS = +it.last.sup || 0;
    if (pS.v > 0 && pS.v > Math.max(3 * lastS, scope * 0.1) && pS.v >= 10) {
      const top2 = Object.keys(supPl).filter((k) => keyCmp(k, S0) >= 0).sort((a, b) => (+supPl[b] || 0) - (+supPl[a] || 0)).slice(0, 2).sort();
      add('SUPPLY', pS.v > 6 * Math.max(1, lastS) ? 'high' : 'med', 'Dispatch must jump from ' + fmtQ(lastS) + ' ' + U + ' in ' + keyLong(aoK) + ' to ' + fmtQ(pS.v) + ' ' + U + '/month' + (top2.length === 2 ? '; ' + keyLabel(top2[0]) + ' and ' + keyLabel(top2[1]) + ' alone need ' + fmtQ(sum(supPl, top2)) + ' ' + U + '.' : '.'),
        'Lock fabrication lot plan; weekly dispatch vs ' + months.filter((k) => +supPl[k] > 0).slice(0, 5).map((k) => fmtQ(+supPl[k])).join('/') + ' ' + U + '.');
    }
    const over = months.findIndex((k, i) => cumE[i] > cumS[i] + 0.5);
    if (over >= 0) add('ERECTION', 'high', 'Erection plan exceeds cumulative supply in ' + keyLong(months[over]) + ' by ' + fmtQ(cumE[over] - cumS[over]) + ' ' + U + '.', 'Pull supply forward or re-sequence erection from ' + keyLabel(months[over]) + '.');
    if (ereStart && ereBal > 0) {
      const ev = months.filter((k) => keyCmp(k, ereStart) >= 0 && +erePl[k] > 0).map((k) => +erePl[k]);
      if (ev.length) {
        const lo = Math.min.apply(null, ev), hi = Math.max.apply(null, ev);
        add('ERECTION', ereDone ? 'med' : 'med', 'Erection ' + (ereDone ? 'continues' : 'starts ' + keyLong(ereStart)) + ' and must hold ' + (lo === hi ? fmtQ(hi) : fmtQ(lo) + '–' + fmtQ(hi)) + ' ' + U + '/month for ' + ev.length + ' month' + (ev.length > 1 ? 's' : '') + '.',
          (ereDone ? 'Keep crane and erection gangs at full strength.' : 'Mobilise crane and erection crew before ' + keyLong(ereStart) + '.'));
      }
    }
    if (it.target.sup && supEnd && keyCmp(supEnd, it.target.sup) > 0) add('SUPPLY', 'high', 'Supply completes ' + keyLong(supEnd) + ', after the target ' + keyLong(it.target.sup) + '.', 'Add fabrication capacity / second vendor to recover.');
    if (it.target.ere && ereEnd && keyCmp(ereEnd, it.target.ere) > 0) add('ERECTION', 'high', 'Erection completes ' + keyLong(ereEnd) + ', after the target ' + keyLong(it.target.ere) + '.', 'Increase erection rate or add a second front.');
    for (const c of it.concerns || []) if (c && c.text) C.push({ tag: (c.tag || 'NOTE').toUpperCase(), sev: c.sev || 'med', text: c.text, action: c.action || '', auto: false });
    // members' manual concerns for groups
    if (it.members && !it.single) it.members.forEach((m) => (m.concerns || []).forEach((c) => { if (c && c.text) C.push({ tag: (c.tag || 'NOTE').toUpperCase(), sev: c.sev || 'med', text: m.name + ': ' + c.text, action: c.action || '', auto: false }); }));
    C.sort((a, b) => (a.sev === 'high' ? 0 : 1) - (b.sev === 'high' ? 0 : 1));
    // ---- status ----
    let status = it.status && it.status !== 'auto' ? it.status : 'ON TRACK';
    if (!it.status || it.status === 'auto') {
      if (C.some((c) => c.sev === 'high' && /target|No (supply|erection) plan/.test(c.text))) status = 'DELAYED';
      else if (C.some((c) => c.sev === 'high')) status = 'AT RISK';
      else if (C.length > 2) status = 'WATCH';
    }
    // ---- milestones ----
    const ms = [];
    if (supStart) ms.push({ when: keyLong(supStart), label: (it.single ? 'BS ' : '') + 'Supply start', color: '#00B8F5' });
    if (ereStart) ms.push({ when: keyLong(ereStart), label: (it.single ? 'BS ' : '') + 'Erection start', color: '#1E49E2' });
    if (supEnd && supBal > 0) ms.push({ when: keyLong(supEnd), label: 'Supply complete', color: '#00B8F5' });
    const ts = (it.fronts || []).find((f) => f.cat === 'ts');
    if (ts && ts.from) ms.push({ when: MON[+ts.from.slice(5, 7) - 1] + (ts.to && ts.to !== ts.from ? ' → ' + MON[+ts.to.slice(5, 7) - 1] : ''), label: ts.name, color: '#7213EA' });
    if (ereEnd && ereBal > 0) ms.push({ when: keyLong(ereEnd), label: 'Erection finish', color: '#0C233C' });
    (it.milestones || []).forEach((m) => ms.push({ when: m.when, label: m.label, color: '#1F9D55' }));
    // ---- notes ----
    const supplyView = wPeak > 0 ? 'Material waiting at site builds to ≈' + fmtQ(wPeak) + ' ' + U + ' by ' + keyLong(wK) + (supEnd && ereEnd && keyCmp(ereEnd, supEnd) > 0 ? ' (supply ends ' + monthsBetween(supEnd, ereEnd).length + ' months before erection)' : '') + ' - plan laydown and erection sequence.' : 'Supply and erection are balanced month to month.';
    const summary = [
      dwg < scope ? fmtQ(scope - dwg) + ' ' + U + ' drawings pending' : 'Drawings complete',
      supDone ? fmtP(supDone / Math.max(1, scope) * 100) + ' supplied' : 'supply ' + (supStart ? 'starts ' + keyLong(supStart) : 'not planned'),
      ereDone ? fmtP(ereDone / Math.max(1, scope) * 100) + ' erected' : 'erection ' + (ereStart ? 'starts ' + keyLong(ereStart) : 'not planned')
    ].join('; ') + '.';
    return { tiles, concerns: C, status, milestones: ms, months, cumS, cumE, waiting, wPeak, wK, supTot, ereTot, supBal, ereBal, dwg, supDone, ereDone, scope, summary, supplyView, aoK, S0 };
  }

  /* ---------------- link to schedule ---------------- */
  function fromSchedule(P) {
    const Q = ensure(P);
    const byB = new Map();
    const wantU = String(Q.unit || '').toLowerCase();
    const anyU = P.acts.some((a) => a.qty && a.qty.scope && String(a.qty.unit || '').toLowerCase() === wantU);
    for (const a of P.acts) {
      if (!a.qty || !a.qty.scope) continue;
      if (anyU && String(a.qty.unit || '').toLowerCase() !== wantU) continue;
      const b = P.dim(a, 'building'), e = P.dim(a, 'epc');
      const unit = (a.qty.unit || Q.unit || '').trim();
      const k = b + '|' + unit;
      if (!byB.has(k)) byB.set(k, { b, unit, acts: [] });
      byB.get(k).acts.push({ a, e });
    }
    let n = 0;
    for (const [, g] of byB) {
      if (Q.items.some((i) => i.building === g.b && i.fromSchedule === g.unit)) continue;
      const stageOf = (e, a) => (e === 'Procurement' || /supply|deliver|dispatch|fabricat/i.test(a.name) ? 'sup' : e === 'Engineering' ? 'dwg' : 'ere');
      const scope = Math.max.apply(null, g.acts.map((x) => x.a.qty.scope));
      const it = newItem(P, { name: g.b + (g.unit ? ' (' + g.unit + ')' : ''), building: g.b, wbs: P.wbsPathText(g.acts[0].a.wbsId).split(' / ')[0] || '', epc: 'Construction', scope, fromSchedule: g.unit, vendor: '' });
      for (const { a, e } of g.acts) {
        const st = stageOf(e, a);
        it.done[st] = +a.qty.done || 0;
        it.links[st] = a.uid;
        if (a.prev) it.last[st] = Math.max(0, (+a.qty.done || 0) - (+a.qty.base || 0));
      }
      if (!it.done.dwg && it.done.sup) it.done.dwg = Math.max(it.done.sup, scope * 0.8);
      for (const st of ['sup', 'ere']) if (it.links[st]) liquidate(P, it, st, 'linked');
      n++;
    }
    return n;
  }
  function pushToSchedule(P, it) {
    const patches = [];
    for (const st in it.links) {
      const a = P.act(it.links[st]);
      if (!a || !it.scope) continue;
      const pct = Math.min(100, (+it.done[st] || 0) / it.scope * 100);
      const q = Object.assign({}, a.qty || {}, { scope: it.scope, done: +it.done[st] || 0, unit: (P.qty && P.qty.unit) || (a.qty && a.qty.unit) || '' });
      if (pct >= 100) { if (a.status !== 'CO') patches.push({ uid: a.uid, changes: { qty: q, aFinish: P.meta.dataDate - 1 } }); }
      else if (pct > 0 && Math.abs(pct - (a.pct || 0)) > 0.4 && a.status !== 'CO') patches.push({ uid: a.uid, changes: { qty: q, pct: Math.round(pct * 10) / 10 } });
    }
    return patches;
  }

  /* ---------------- sample data (matches the reference deck style) ---------------- */
  function sample(P) {
    const Q = ensure(P);
    const s = startKey(P);
    const mk = (o, sup, ere, fronts, conc) => {
      const it = newItem(P, o);
      sup.forEach((v, i) => { if (v) it.plan.sup[keyAdd(s, i)] = v; });
      ere.forEach((v, i) => { if (v) it.plan.ere[keyAdd(s, i)] = v; });
      it.fronts = fronts.map((f) => ({ name: f[0], cat: f[1], from: keyAdd(s, f[2]), to: keyAdd(s, f[3]) }));
      it.concerns = conc || [];
      return it;
    };
    const blds = Array.from(new Set(P.acts.map((a) => P.dim(a, 'building')))).filter((b) => !/milestone|general/i.test(b));
    const b = (i, d) => d; void blds;
    mk({ name: 'Additive Grinding Building', building: b(1, 'Additive Grinding Building'), wbs: 'Building structures', epc: 'Construction', vendor: 'KBL', scope: 2000, scopeNote: '+ TS 160.9 MT (silos 132.3 + liner 28.6)', done: { dwg: 1399, sup: 12, ere: 0 }, last: { sup: 12, ere: 0 } },
      [250, 300, 500, 520, 430], [0, 150, 250, 250, 250, 250, 250, 300, 300],
      [['Drawing / PO closure', 'front', 0, 1], ['Fabrication & supply', 'supply', 0, 4], ['Ground assembly', 'erection', 0, 3], ['Main frame erection', 'erection', 1, 8], ['Silos / liners (TS)', 'ts', 6, 8], ['Alignment / handover', 'handover', 7, 8]]);
    mk({ name: 'Screen House / Building', building: b(2, 'Screen House / Building'), wbs: 'Building structures', epc: 'Construction', vendor: 'Samal Brothers', scope: 1019, scopeNote: '+ TS: equipment, crane & conveyor supports', done: { dwg: 1019, sup: 0, ere: 0 }, last: { sup: 0, ere: 0 } },
      [250, 250, 250, 269], [50, 180, 200, 166, 168, 160, 95],
      [['Foundation release', 'front', 0, 0], ['Material receipt', 'supply', 0, 3], ['Starter bay / bracing', 'erection', 0, 1], ['Lower tiers', 'erection', 1, 3], ['Screen / crane levels', 'erection', 2, 5], ['Upper tiers / roof', 'erection', 4, 6], ['Handover', 'handover', 6, 6]],
      [{ tag: 'FRONT', sev: 'high', text: 'Erection starts first and needs surveyed starter-bay foundations now.', action: 'Release surveyed starter-bay foundations / anchor bolts.' }]);
    mk({ name: 'Return Fines Building', building: b(3, 'Return Fines Building'), wbs: 'Building structures', epc: 'Construction', vendor: 'Vrinda Bhillai (site fabrication)', scope: 393, scopeNote: '+ TS 66.3 MT (bins, liner, weighing bins)', done: { dwg: 393, sup: 0, ere: 0 }, last: { sup: 0, ere: 0 } },
      [120, 120, 120, 33], [0, 50, 50, 110, 120, 63],
      [['Foundation release', 'front', 0, 1], ['Fabrication & supply', 'supply', 0, 3], ['Starter frame', 'erection', 1, 2], ['Bin support floors', 'erection', 2, 4], ['Bins / liner (TS)', 'ts', 2, 4], ['Handover', 'handover', 5, 5]],
      [{ tag: 'INTERFACE', sev: 'med', text: 'Bin-support and conveyor interface not yet frozen.', action: 'Freeze bin-support and conveyor interface.' }]);
    Q.groupBy = 'building';
    return Q;
  }

  /* ================================================================== *
   * Slide layout spec (inches on a 13.333 x 7.5 canvas)
   * ================================================================== */
  const K = { dark: '#0C233C', cobalt: '#1E49E2', pacific: '#00B8F5', purple: '#7213EA', pink: '#FD349C', green: '#1F9D55', amber: '#F5A623', red: '#E5383B', light: '#F3F6FA', grey: '#DDE2EA', ink: '#1B1B1B', mute: '#5B6475', white: '#FFFFFF', band: '#EDF1F6', soft: '#E6ECFC' };
  const STATUS_COLOR = { 'ON TRACK': K.green, WATCH: K.pacific, 'AT RISK': K.amber, DELAYED: K.red };

  function slideFor(P, g, pageNo) {
    const Q = ensure(P);
    const U = Q.unit || '';
    const it = g.agg;
    const months = horizon(P, g.items, 9, 12);
    const an = analyze(P, it, months);
    const el = [];
    const T = (x, y, w, h, text, o) => el.push(Object.assign({ type: 'text', x, y, w, h, text: String(text == null ? '' : text), size: 9, color: K.ink, bold: false, align: 'left', valign: 'middle' }, o || {}));
    const R = (x, y, w, h, fill, o) => el.push(Object.assign({ type: 'rect', x, y, w, h, fill }, o || {}));
    const L = (x1, y1, x2, y2, color, o) => el.push(Object.assign({ type: 'line', x1, y1, x2, y2, color, w: 0.75 }, o || {}));
    const title = it.name + (g.by !== 'item' && g.by !== 'building' && g.items.length > 1 ? '' : '');
    T(0.45, 0.34, 9.4, 0.52, title, { size: 26, bold: true, color: K.dark });
    const ereRange = firstPlanKey(it, 'ere', an.S0) ? keyLong(firstPlanKey(it, 'ere', an.S0)) + ' → ' + keyLong(lastPlanKey(it, 'ere')) : 'not planned';
    const supRange = firstPlanKey(it, 'sup', an.S0) ? keyLong(firstPlanKey(it, 'sup', an.S0)) + ' → ' + keyLong(lastPlanKey(it, 'sup')) : 'not planned';
    T(0.45, 0.88, 9.6, 0.26, (it.vendor ? (it.single ? 'Supply vendor: ' : 'Vendors: ') + it.vendor + '   |   ' : '') + fmtQ(it.scope) + ' ' + U + (it.single && it.scopeNote ? ' ' + it.scopeNote.replace(/^\+\s*/, '+ ') : '') + '   |   Supply ' + supRange + '   |   Erection ' + ereRange, { size: 10, color: K.mute });
    T(9.9, 0.34, 2.98, 0.2, 'Data as on:  ' + D.fmt(asOf(P)), { size: 9, color: K.mute, align: 'right' });
    R(11.18, 0.62, 1.7, 0.32, STATUS_COLOR[an.status] || K.amber, { radius: 0.05 });
    T(11.18, 0.62, 1.7, 0.32, an.status, { size: 11, bold: true, color: K.white, align: 'center' });
    // KPI tiles
    an.tiles.forEach((t, i) => {
      const x = 0.45 + i * 2.09;
      R(x, 1.3, 1.97, 0.8, t.dark ? K.dark : K.light);
      T(x + 0.12, 1.36, 1.77, 0.2, t.label, { size: 7.5, bold: true, color: t.dark ? K.pacific : K.mute });
      T(x + 0.12, 1.55, 1.77, 0.34, t.value, { size: 16, bold: true, color: t.dark ? K.white : K.dark });
      T(x + 0.12, 1.88, 1.81, 0.2, t.sub, { size: 6.8, color: t.dark ? '#C9D6EA' : K.mute });
    });
    // work-front table
    const tx = 0.45, tw = 7.55, nameW = 1.9, totW = 0.61;
    const mW = (tw - nameW - totW) / months.length;
    R(tx + 0.0, 2.38, 0.09, 0.09, K.cobalt);
    T(tx + 0.16, 2.3, 4.2, 0.24, 'WORK-FRONT SEQUENCE & MONTHLY PLAN (' + U + ')', { size: 9.5, bold: true, color: K.dark });
    const legend = [['Front / drawings', K.pink], ['Supply', K.pacific], ['Erection', K.cobalt], ['TS / bins', K.purple], ['Handover', K.green]];
    let lx = tx + 4.3;
    legend.forEach(([l, c]) => { R(lx, 2.385, 0.07, 0.07, c); T(lx + 0.1, 2.3, 0.95, 0.24, l, { size: 6.3, color: K.mute }); lx += l.length * 0.046 + 0.26; });
    R(tx, 2.58, tw, 0.26, K.dark);
    const next3i = [0, 1, 2];
    R(tx + nameW, 2.58, mW * 3, 0.26, K.cobalt);
    T(tx + 0.08, 2.58, nameW, 0.26, it.single ? 'Work front' : 'Item', { size: 8, bold: true, color: K.white });
    months.forEach((k, i) => T(tx + nameW + i * mW, 2.58, mW, 0.26, keyLabel(k, i === 0), { size: 7.5, bold: true, color: K.white, align: 'center' }));
    T(tx + nameW + months.length * mW, 2.58, totW, 0.26, 'Total', { size: 7.5, bold: true, color: K.white, align: 'center' });
    const fronts = (it.fronts || []).slice(0, 7);
    const rowH = 0.28;
    const fy = 2.84;
    const nF = Math.max(fronts.length, 1);
    fronts.forEach((f, i) => {
      const y = fy + i * rowH;
      R(tx, y, tw, rowH, i % 2 ? K.white : K.light);
      T(tx + 0.08, y, nameW - 0.1, rowH, f.name, { size: 7.5, color: K.ink });
      const drawSpan = (a, b, cat, dy, hh) => {
        if (!a) return;
        const i0 = months.indexOf(a) >= 0 ? months.indexOf(a) : (keyCmp(a, months[0]) < 0 ? 0 : -1);
        const i1 = months.indexOf(b || a) >= 0 ? months.indexOf(b || a) : (keyCmp(b || a, months[months.length - 1]) > 0 ? months.length - 1 : -1);
        if (i0 < 0 || i1 < 0 || i1 < i0) return;
        R(tx + nameW + i0 * mW + 0.04, y + dy, (i1 - i0 + 1) * mW - 0.08, hh, (FRONT_CATS[cat] || FRONT_CATS.erection).color, { radius: 0.03 });
      };
      if (f.sub && f.sub.length) f.sub.forEach((s2, j) => drawSpan(s2.from, s2.to, s2.cat, 0.06 + j * 0.09, 0.07));
      else drawSpan(f.from, f.to, f.cat, 0.08, 0.13);
    });
    const qy = fy + nF * rowH;
    R(tx, qy, tw, 0.69, K.band);
    // month grid lines
    for (let i = 0; i <= months.length; i++) L(tx + nameW + i * mW, 2.84, tx + nameW + i * mW, qy + 0.69, K.grey, { w: 0.5 });
    R(tx + nameW, 2.84, mW * 3, qy + 0.69 - 2.84, K.cobalt, { alpha: 0.07 });
    const qrow = (y, label, vals, tot, o) => {
      T(tx + 0.08, y, nameW, 0.23, label, Object.assign({ size: 7.5, bold: true, color: K.dark }, o || {}));
      vals.forEach((v, i) => T(tx + nameW + i * mW, y, mW, 0.23, v, { size: 7.5, color: K.ink, align: 'center' }));
      T(tx + nameW + months.length * mW, y, totW, 0.23, tot, { size: 7.5, bold: true, color: K.dark, align: 'center' });
    };
    const supPl = it.plan.sup || {}, erePl = it.plan.ere || {};
    qrow(qy, 'Supply (' + U + ')', months.map((k) => (+supPl[k] ? fmtQ(+supPl[k]) : '–')), fmtQ(an.supTot));
    qrow(qy + 0.23, 'Erection (' + U + ')', months.map((k) => (+erePl[k] ? fmtQ(+erePl[k]) : '–')), fmtQ(an.ereTot));
    qrow(qy + 0.46, 'Cum. erection (% of scope)', months.map((k, i) => (an.cumE[i] > 0 && it.scope ? Math.round(an.cumE[i] / it.scope * 100) + '%' : '–')), '', { bold: false, color: K.mute, size: 7 });
    L(tx, qy, tx + tw, qy, K.dark, { w: 0.75 });
    // milestones strip
    const my = Math.max(5.5, qy + 0.69 + 0.25);
    const msl = an.milestones.slice(0, 5);
    const mw = tw / Math.max(5, msl.length);
    msl.forEach((m, i) => {
      const x = tx + i * (mw - 0.03);
      R(x, my, mw - 0.2, 0.86, m.color, { chevron: true });
      T(x + 0.3, my + 0.08, mw - 0.62, 0.36, m.when, { size: 11, bold: true, color: K.white });
      T(x + 0.3, my + 0.42, mw - 0.62, 0.36, m.label, { size: 8, color: K.white });
    });
    T(tx, my + 0.98, tw, 0.32, 'Supply view:  ' + an.supplyView, { size: 7.8, color: K.mute, italicLead: 'Supply view:' });
    // concerns
    const cx = 8.25, cw = 4.63;
    R(cx, 2.38, 0.09, 0.09, K.cobalt);
    T(cx + 0.16, 2.3, cw, 0.24, 'KEY CONCERNS & ACTIONS', { size: 9.5, bold: true, color: K.dark });
    const conc = an.concerns.slice(0, 4);
    const cH = conc.length > 3 ? 0.66 : 0.72;
    conc.forEach((c, i) => {
      const y = 2.58 + i * (cH + 0.06);
      R(cx, y, cw, cH, i % 2 ? K.white : K.light, { border: K.grey });
      const tc = { SUPPLY: K.pacific, DRAWINGS: K.dark, ERECTION: K.cobalt, FRONT: K.pink, INTERFACE: K.purple, TS: K.purple }[c.tag] || (c.sev === 'high' ? K.red : K.amber);
      R(cx + 0.08, y + 0.09, 0.82, 0.19, tc, { radius: 0.03 });
      T(cx + 0.08, y + 0.09, 0.82, 0.19, c.tag, { size: 6.5, bold: true, color: K.white, align: 'center' });
      T(cx + 1.0, y + 0.04, cw - 1.08, cH * 0.58, c.text, { size: 7.4, color: K.ink, valign: 'top' });
      T(cx + 1.0, y + cH * 0.6, cw - 1.08, cH * 0.38, 'Action:  ' + c.action, { size: 7.2, color: K.cobalt, bold: false, valign: 'top', boldLead: 'Action:' });
    });
    if (!conc.length) T(cx, 2.62, cw, 0.4, 'No concerns - quantities reconciled and plan is achievable.', { size: 8, color: K.green });
    // scope vs drawings vs supply vs erection
    const by = 5.44;
    R(cx, by + 0.07, 0.09, 0.09, K.cobalt);
    T(cx + 0.16, by, cw, 0.24, 'SCOPE vs DRAWINGS vs SUPPLY vs ERECTION (' + U + ')', { size: 9.5, bold: true, color: K.dark });
    const bars = [['Scope', it.scope, K.dark, fmtQ(it.scope) + ' ' + U], ['Drawings released', an.dwg, K.amber, fmtQ(an.dwg) + ' ' + U + '  ·  ' + fmtP(an.dwg / Math.max(1, it.scope) * 100)],
      ['Supplied till ' + MON[+an.aoK.slice(5, 7) - 1], an.supDone, K.pacific, an.supDone ? fmtQ(an.supDone) + ' ' + U + '  ·  ' + fmtP(an.supDone / Math.max(1, it.scope) * 100) : 'Nil'],
      ['Erected till date', an.ereDone, K.cobalt, an.ereDone ? fmtQ(an.ereDone) + ' ' + U + '  ·  ' + fmtP(an.ereDone / Math.max(1, it.scope) * 100) : '0 ' + U + (firstPlanKey(it, 'ere', an.S0) ? '  ·  starts ' + keyLong(firstPlanKey(it, 'ere', an.S0)) : '')]];
    bars.forEach((b, i) => {
      const y = by + 0.26 + i * 0.26;
      R(cx, y, cw, 0.22, i % 2 ? K.white : K.light);
      T(cx + 0.08, y, 1.22, 0.22, b[0], { size: 7.8, color: K.ink });
      R(cx + 1.32, y + 0.04, 1.95, 0.14, K.grey);
      if (b[1] > 0) R(cx + 1.32, y + 0.04, Math.max(0.03, 1.95 * Math.min(1, b[1] / Math.max(1, it.scope))), 0.14, b[2]);
      T(cx + 3.35, y, 1.3, 0.22, b[3], { size: 7.8, color: K.ink });
    });
    T(cx, by + 1.34, cw, 0.18, an.summary, { size: 7.5, bold: true, color: K.dark });
    T(0.45, 7.06, 8, 0.2, (Q.footnote || 'BS = building structure   ·   TS = technological structure') + (it.single ? '' : '   ·   ' + it.members.length + ' items: ' + it.members.map((m) => m.name).join(', ')), { size: 7, color: K.mute });
    T(12.38, 7.06, 0.5, 0.2, String(pageNo || ''), { size: 7, color: K.mute, align: 'right' });
    const notes = 'TALKING POINTS - ' + it.name.toUpperCase() + '\n' + [
      fmtQ(it.scope) + ' ' + U + ' scope' + (it.vendor ? ', vendor ' + it.vendor : '') + '.',
      an.tiles[1].value + ' drawings released (' + an.tiles[1].sub + ').',
      'Next three months: supply ' + an.tiles[3].value + ', erection ' + an.tiles[4].value + '.'
    ].concat(an.concerns.slice(0, 4).map((c) => c.tag + ': ' + c.text + ' Action: ' + c.action)).map((x, i) => (i + 1) + '. ' + x).join('\n');
    return { title: it.name, el, notes, analysis: an };
  }

  function backupSlide(P, gs, pageNo) {
    const Q = ensure(P);
    const U = Q.unit || '';
    const all = aggregate(P, 'All', Q.items.length ? Q.items : []);
    const months = horizon(P, Q.items, 9, 12);
    const an = analyze(P, all, months);
    const el = [];
    const T = (x, y, w, h, text, o) => el.push(Object.assign({ type: 'text', x, y, w, h, text: String(text == null ? '' : text), size: 9, color: K.ink, align: 'left', valign: 'middle' }, o || {}));
    const R = (x, y, w, h, fill, o) => el.push(Object.assign({ type: 'rect', x, y, w, h, fill }, o || {}));
    const supPl = all.plan.sup || {}, erePl = all.plan.ere || {};
    let pk = null, pv = 0, epk = null, epv = 0;
    months.forEach((k) => { if ((+supPl[k] || 0) > pv) { pv = +supPl[k]; pk = k; } if ((+erePl[k] || 0) > epv) { epv = +erePl[k]; epk = k; } });
    T(0.45, 0.34, 9.4, 0.52, 'Backup: combined supply and erection plan - ' + (gs.length > 1 ? 'all ' + gs.length + ' ' + ({ building: 'buildings', wbs: 'WBS', epc: 'EPC phases', item: 'items', combined: 'items' }[gs[0].by] || 'groups') : gs[0] ? gs[0].key : ''), { size: 22, bold: true, color: K.dark });
    T(0.45, 0.88, 12, 0.26, (pk ? 'Supply peaks at ' + fmtQ(pv) + ' ' + U + '/month in ' + keyLong(pk) : 'No supply planned') + '; erection must climb from ' + fmtQ(+erePl[months[0]] || 0) + ' to ' + fmtQ(epv) + ' ' + U + '/month' + (epk ? ' by ' + keyLong(epk) : '') + '  -  ' + (Q.title || 'quantities') + ', ' + U, { size: 10, color: K.mute });
    T(9.9, 0.34, 2.98, 0.2, 'Data as on:  ' + D.fmt(asOf(P)), { size: 9, color: K.mute, align: 'right' });
    R(0.45, 1.44, 0.09, 0.09, K.cobalt);
    T(0.61, 1.36, 4, 0.24, 'MONTHLY SUPPLY vs ERECTION (' + U + ')', { size: 9.5, bold: true, color: K.dark });
    el.push({ type: 'chart', kind: 'bar', x: 0.45, y: 1.62, w: 6.05, h: 2.42, cats: months.map((k, i) => keyLabel(k, i === 0)), series: [{ name: 'Supply', values: months.map((k) => +supPl[k] || 0), color: K.pacific }, { name: 'Erection', values: months.map((k) => +erePl[k] || 0), color: K.cobalt }] });
    R(6.83, 1.44, 0.09, 0.09, K.cobalt);
    T(6.99, 1.36, 4, 0.24, 'CUMULATIVE SUPPLY vs ERECTION (' + U + ')', { size: 9.5, bold: true, color: K.dark });
    el.push({ type: 'chart', kind: 'line', x: 6.83, y: 1.62, w: 6.05, h: 2.42, cats: months.map((k, i) => keyLabel(k, i === 0)), series: [{ name: 'Cum. supply', values: an.cumS, color: K.pacific }, { name: 'Cum. erection', values: an.cumE, color: K.cobalt }, { name: 'Scope', values: months.map(() => all.scope), color: K.mute, dash: true }] });
    const ddi = Math.min(2, months.length - 1);
    T(10.35, 2.83, 2.36, 0.73, keyLong(months[ddi]) + ': ' + fmtQ(an.cumS[ddi]) + ' ' + U + ' supplied vs ' + fmtQ(an.cumE[ddi]) + ' erected\nPeak material waiting at site: ≈' + fmtQ(an.wPeak) + ' ' + U + (an.wK ? ' (' + keyLong(an.wK) + ')' : ''), { size: 7.2, color: K.dark, fill: K.white, border: K.grey, valign: 'middle', pad: 0.06 });
    // table by group
    R(0.45, 4.32, 0.09, 0.09, K.cobalt);
    T(0.61, 4.24, 4.4, 0.24, 'MONTHLY PLAN BY ' + ({ building: 'BUILDING', wbs: 'WBS', epc: 'EPC', item: 'ITEM', combined: 'ITEM' }[gs[0] ? gs[0].by : 'building']) + ' (' + U + ')', { size: 9.5, bold: true, color: K.dark });
    T(3.4, 4.24, 5, 0.24, keyLabel(months[0], true) + '–' + keyLabel(months[Math.min(2, months.length - 1)]) + ' shaded  ·  – = nil', { size: 7.5, color: K.mute });
    const rows = [];
    gs.forEach((g) => {
      rows.push([g.key + ' - supply'].concat(months.map((k) => +(g.agg.plan.sup || {})[k] || 0)));
      rows.push([g.key + ' - erection'].concat(months.map((k) => +(g.agg.plan.ere || {})[k] || 0)));
    });
    rows.push(['Total supply'].concat(months.map((k) => +supPl[k] || 0)));
    rows.push(['Total erection'].concat(months.map((k) => +erePl[k] || 0)));
    const tx = 0.45, tw = 7.95, nW = 2.4, cW = (tw - nW - 0.6) / months.length;
    const rh = Math.min(0.2, 2.3 / (rows.length + 1));
    R(tx, 4.5, tw, rh, K.dark);
    T(tx + 0.06, 4.5, nW, rh, 'Item', { size: 7, bold: true, color: K.white });
    months.forEach((k, i) => T(tx + nW + i * cW, 4.5, cW, rh, keyLabel(k, i === 0), { size: 7, bold: true, color: K.white, align: 'center' }));
    T(tx + nW + months.length * cW, 4.5, 0.6, rh, 'Total', { size: 7, bold: true, color: K.white, align: 'center' });
    rows.forEach((r, j) => {
      const y = 4.5 + (j + 1) * rh;
      const tot = /^Total/.test(r[0]);
      R(tx, y, tw, rh, tot ? K.band : j % 2 ? K.white : K.light);
      R(tx + nW, y, cW * 3, rh, K.cobalt, { alpha: 0.07 });
      T(tx + 0.06, y, nW, rh, r[0], { size: 6.8, bold: tot, color: K.ink });
      r.slice(1).forEach((v, i) => T(tx + nW + i * cW, y, cW, rh, v ? fmtQ(v) : '–', { size: 6.8, bold: tot, color: K.ink, align: 'center' }));
      T(tx + nW + months.length * cW, y, 0.6, rh, fmtQ(r.slice(1).reduce((a, b) => a + b, 0)), { size: 6.8, bold: true, color: K.dark, align: 'center' });
    });
    // gaps
    R(8.62, 4.32, 0.09, 0.09, K.cobalt);
    T(8.78, 4.24, 4.1, 0.24, 'GAPS TO CLOSE BEFORE PLAN SIGN-OFF', { size: 9.5, bold: true, color: K.dark });
    const gaps = [];
    gs.forEach((g) => analyze(P, g.agg, months).concerns.filter((c) => c.auto).forEach((c) => gaps.push({ sev: c.sev, text: g.key + ':  ' + c.text })));
    gaps.sort((a, b) => (a.sev === 'high' ? 0 : 1) - (b.sev === 'high' ? 0 : 1));
    gaps.slice(0, 4).forEach((c, i) => {
      const y = 4.52 + i * 0.44;
      R(8.64, y + 0.05, 0.13, 0.13, c.sev === 'high' ? K.red : K.amber, { round: true });
      T(8.87, y, 3.99, 0.4, c.text, { size: 7.2, color: K.ink, valign: 'top' });
    });
    T(8.62, 6.34, 4.26, 0.56, 'Material waiting at site = cumulative supply − cumulative erection. Plan laydown for the peak, and size erection crews to the monthly erection rate.', { size: 7.2, color: K.dark, fill: K.soft, pad: 0.08 });
    T(12.38, 7.06, 0.5, 0.2, String(pageNo || ''), { size: 7, color: K.mute, align: 'right' });
    return { title: 'Combined plan', el, notes: 'Combined supply and erection plan across ' + gs.length + ' groups.', analysis: an };
  }

  function deck(P, by) {
    const gs = groups(P, by);
    const slides = gs.map((g, i) => Object.assign(slideFor(P, g, i + 1), { key: g.key }));
    if (gs.length) slides.push(Object.assign(backupSlide(P, gs, gs.length + 1), { key: '__combined' }));
    return slides;
  }

  SE.qty = {
    DEFAULT_STAGES, FRONT_CATS, K, STATUS_COLOR, ensure, newItem, asOf, startKey, keyOf, keyDay, keyAdd, keyLabel, keyLong, monthsBetween, horizon,
    balance, planTotal, firstPlanKey, lastPlanKey, cum, liquidate, groups, aggregate, analyze, fromSchedule, pushToSchedule, sample, slideFor, backupSlide, deck, fmtQ, fmtP
  };
})(typeof module === 'object' && module.exports ? (global.SE = global.SE || {}) : (window.SE = window.SE || {}));
