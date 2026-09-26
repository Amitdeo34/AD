/* Schedule Engine - core/analysis.js
 * The "intelligence": update lenses (what needs attention this month),
 * schedule health check (DCMA-14 style), progress & S-curve maths,
 * written insights and the natural-language "Ask Engine" query parser.
 */
(function (SE) {
  'use strict';
  const D = SE.D;

  /* ------------------------------------------------------------------ *
   * Lenses - every activity gets zero or more flags
   * ------------------------------------------------------------------ */
  const LENSES = [
    { key: 'lateStart', label: 'Should have started - not started', short: 'Late start', color: '#E8A200', icon: '⏱', desc: 'Start date (as per last update / plan) is before the Data Date but no Actual Start yet.' },
    { key: 'overdue', label: 'Should have finished - not finished', short: 'Overdue', color: '#D0021B', icon: '⚑', desc: 'Finish date (as per last update / plan) is before the Data Date but the activity is not complete.' },
    { key: 'future', label: 'Future activity showing progress', short: 'Future progress', color: '#7F35B2', icon: '⇢', desc: 'Planned to start after the Data Date but already has progress - verify it really started.' },
    { key: 'due', label: 'Due in this update period', short: 'Due this period', color: '#0091DA', icon: '◷', desc: 'Planned to start or finish between the last Data Date and the new Data Date.' },
    { key: 'inProgress', label: 'In progress - update % & remaining', short: 'In progress', color: '#00A3A1', icon: '▶', desc: 'Started activities that need % complete and remaining duration every month.' },
    { key: 'pending', label: 'Needs update (not touched yet)', short: 'Pending update', color: '#F68D2E', icon: '✎', desc: 'In progress or due this period and not yet updated in this session.' },
    { key: 'updated', label: 'Updated in this session', short: 'Updated', color: '#009A44', icon: '✔', desc: 'Activities you have changed in this update.' },
    { key: 'critical', label: 'Critical (float ≤ 0)', short: 'Critical', color: '#BC204B', icon: '◆', desc: 'On the critical path - any delay moves the project finish.' },
    { key: 'negFloat', label: 'Negative float', short: 'Neg. float', color: '#8B0000', icon: '−', desc: 'Late against a constraint or the must-finish date.' },
    { key: 'outSeq', label: 'Out of sequence', short: 'Out of sequence', color: '#6D2077', icon: '↯', desc: 'Started/finished before its predecessors allow.' },
    { key: 'lookahead', label: '4-week look-ahead', short: 'Look-ahead', color: '#005EB8', icon: '→', desc: 'Not complete and starting within 28 days after the Data Date.' },
    { key: 'invalid', label: 'Invalid progress data', short: 'Invalid', color: '#FF0000', icon: '✖', desc: 'Actual dates after the Data Date, completed without Actual Finish, etc.' },
    { key: 'openEnd', label: 'Missing logic (open ends)', short: 'Open end', color: '#7F7F7F', icon: '○', desc: 'No predecessor or no successor.' }
  ];
  const LENS_BY_KEY = {};
  LENSES.forEach((l) => { LENS_BY_KEY[l.key] = l; });

  function flags(P, a) {
    const f = [];
    const dd = P.meta.dataDate;
    const pdd = P.meta.prevDataDate != null ? P.meta.prevDataDate : null;
    if (P.isSummaryType(a)) return f;
    const rs = P.refStart(a), rf = P.refFinish(a);
    const status = a.status;
    if (dd != null) {
      if (status === 'NS' && rs != null && rs < dd) f.push('lateStart');
      if (status !== 'CO' && rf != null && rf < dd) f.push('overdue');
      if (status !== 'NS' && a.prev && a.prev.status === 'NS' && rs != null && rs >= dd) f.push('future');
      else if (status !== 'NS' && !a.prev && rs != null && rs >= dd) f.push('future');
      else if (status === 'IP' && a.bl && a.bl.start != null && a.bl.start >= dd) f.push('future');
      const lo = pdd != null && pdd < dd ? pdd : D.addMonths(dd, -1);
      if (status === 'NS' || (a.prev && a.prev.status !== 'CO') || a.touched) {
        if ((rs != null && rs >= lo && rs < dd) || (rf != null && rf >= lo && rf < dd)) f.push('due');
      }
      if (status === 'IP') f.push('inProgress');
      if (!a.touched && (status === 'IP' || f.includes('due') || f.includes('lateStart') || f.includes('overdue')) && !(a.prev && a.prev.status === 'CO')) f.push('pending');
      const s = P.startOf(a);
      if (status !== 'CO' && s != null && s >= dd && s < dd + 28) f.push('lookahead');
      if ((a.aStart != null && a.aStart >= dd) || (a.aFinish != null && a.aFinish >= dd) ||
        (status === 'CO' && a.aFinish == null) || (status !== 'NS' && a.aStart == null) ||
        (a.aStart != null && a.aFinish != null && a.aFinish < a.aStart)) f.push('invalid');
    }
    if (a.touched) f.push('updated');
    if (status !== 'CO' && a.tf != null && a.tf <= 0) f.push('critical');
    if (status !== 'CO' && a.tf != null && a.tf < 0) f.push('negFloat');
    if (status !== 'NS') {
      for (const r of P.predsOf(a.uid)) {
        const p = P.act(r.pred);
        if (!p || P.isSummaryType(p)) continue;
        if ((r.type === 'FS' && p.status !== 'CO') || (r.type === 'SS' && p.status === 'NS') ||
          (r.type === 'FS' && p.aFinish != null && a.aStart != null && a.aStart < p.aFinish)) { f.push('outSeq'); break; }
      }
    }
    if (P.rels.length && !P.isSummaryType(a) && (!P.predsOf(a.uid).length || !P.succsOf(a.uid).length)) f.push('openEnd');
    return f;
  }

  function flagAll(P) {
    const map = new Map();
    const counts = {};
    LENSES.forEach((l) => { counts[l.key] = 0; });
    for (const a of P.acts) {
      const f = flags(P, a);
      map.set(a.uid, f);
      f.forEach((k) => { counts[k]++; });
    }
    return { map, counts };
  }

  /* ------------------------------------------------------------------ *
   * Progress maths (planned vs actual, duration weighted)
   * ------------------------------------------------------------------ */
  function weightOf(P, a) {
    if (P.isSummaryType(a) || P.isMilestone(a)) return 0;
    if (P.settings.weight === 'equal') return 1;
    return Math.max(1, a.origDur || 1);
  }
  function plannedFrac(P, a, day, basis) {
    const s = basis === 'bl' && a.bl ? a.bl.start : (a.bl ? a.bl.start : a.tStart);
    const f = basis === 'bl' && a.bl ? a.bl.finish : (a.bl ? a.bl.finish : a.tFinish);
    if (s == null || f == null) return 0;
    if (day <= s) return 0;
    if (day > f) return 1;
    const c = P.cal(a);
    const tot = Math.max(1, c.span(s, f));
    return Math.min(1, c.between(s, day) / tot);
  }
  function forecastFrac(P, a, day) {
    // remaining progress spread linearly over the remaining forecast window
    const dd = P.meta.dataDate;
    const done = (a.pct || 0) / 100;
    if (a.status === 'CO') return 1;
    if (day <= dd) return done;
    const s = a.status === 'IP' ? (a.rStart != null ? a.rStart : dd) : P.startOf(a);
    const f = P.finishOf(a);
    if (s == null || f == null) return done;
    if (day <= s) return done;
    if (day > f) return 1;
    const c = P.cal(a);
    return done + (1 - done) * Math.min(1, c.between(s, day) / Math.max(1, c.span(s, f)));
  }
  /** reconstructed actual progress at a past date (from actual dates, linear) */
  function actualFrac(P, a, day) {
    const dd = P.meta.dataDate;
    if (a.status === 'NS' || a.aStart == null || day <= a.aStart) return 0;
    const c = P.cal(a);
    if (a.status === 'CO') {
      const f = a.aFinish != null ? a.aFinish : dd - 1;
      if (day > f) return 1;
      return Math.min(1, c.between(a.aStart, day) / Math.max(1, c.span(a.aStart, f)));
    }
    const done = (a.pct || 0) / 100;
    if (day >= dd) return done;
    return done * Math.min(1, c.between(a.aStart, day) / Math.max(1, c.between(a.aStart, dd)));
  }
  function progressOf(P, acts, day) {
    day = day != null ? day : P.meta.dataDate;
    let w = 0, pl = 0, ac = 0;
    for (const a of acts) {
      const wt = weightOf(P, a);
      if (!wt) continue;
      w += wt;
      pl += wt * plannedFrac(P, a, day);
      ac += wt * (a.status === 'CO' ? 1 : (a.pct || 0) / 100);
    }
    return { planned: w ? pl / w * 100 : 0, actual: w ? ac / w * 100 : 0, weight: w };
  }
  function prevActual(P, acts) {
    let w = 0, ac = 0;
    for (const a of acts) {
      const wt = weightOf(P, a); if (!wt) continue;
      w += wt;
      const p = a.prev ? (a.prev.status === 'CO' ? 100 : a.prev.pct || 0) : 0;
      ac += wt * p / 100;
    }
    return w ? ac / w * 100 : 0;
  }
  function range(P) {
    let s = Infinity, f = -Infinity;
    for (const a of P.acts) {
      const cands = [P.startOf(a), P.finishOf(a), a.bl && a.bl.start, a.bl && a.bl.finish];
      for (const x of cands) if (x != null && isFinite(x)) { if (x < s) s = x; if (x > f) f = x; }
    }
    if (!isFinite(s)) { s = P.meta.dataDate || D.todayDay(); f = s + 365; }
    return { start: s, finish: f };
  }
  function sCurve(P, acts) {
    acts = acts || P.acts;
    const r = range(P);
    const pts = [];
    let m = D.monthStart(r.start);
    const end = D.addMonths(r.finish, 1);
    const dd = P.meta.dataDate;
    while (m <= end) {
      const e = D.monthEnd(m) + 1;
      let w = 0, pl = 0, fc = 0, ac = 0;
      for (const a of acts) {
        const wt = weightOf(P, a); if (!wt) continue;
        w += wt; pl += wt * plannedFrac(P, a, e); fc += wt * forecastFrac(P, a, e);
        if (e <= dd) ac += wt * actualFrac(P, a, e);
      }
      pts.push({ day: m, end: e, label: D.monthLabel(m), planned: w ? pl / w * 100 : 0, forecast: w ? fc / w * 100 : 0, actual: e <= dd && w ? ac / w * 100 : null, isPast: e <= dd });
      m = D.addMonths(m, 1);
    }
    const now = progressOf(P, acts, dd);
    return { points: pts, actualNow: now.actual, plannedNow: now.planned, dd };
  }

  /** group summary rows for dashboards: [{name, count, planned, actual, variance, NS, IP, CO, late, overdue, crit}] */
  function breakdown(P, key, fl) {
    fl = fl || flagAll(P);
    const groups = new Map();
    for (const a of P.acts) {
      if (P.isSummaryType(a)) continue;
      const g = P.dim(a, key);
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(a);
    }
    const out = [];
    for (const [name, acts] of groups) {
      const pr = progressOf(P, acts);
      const row = { name, count: acts.length, planned: pr.planned, actual: pr.actual, variance: pr.actual - pr.planned, NS: 0, IP: 0, CO: 0, lateStart: 0, overdue: 0, critical: 0, prevActual: prevActual(P, acts) };
      let fin = null;
      for (const a of acts) {
        row[a.status]++;
        const f = fl.map.get(a.uid) || [];
        if (f.includes('lateStart')) row.lateStart++;
        if (f.includes('overdue')) row.overdue++;
        if (f.includes('critical')) row.critical++;
        const ff = P.finishOf(a); if (ff != null && (fin == null || ff > fin)) fin = ff;
      }
      row.finish = fin;
      row.periodGain = row.actual - row.prevActual;
      out.push(row);
    }
    if (key === 'epc') out.sort((a, b) => SE.EPC.indexOf(a.name) - SE.EPC.indexOf(b.name));
    return out;
  }

  /* ------------------------------------------------------------------ *
   * Health check (DCMA-14 inspired)
   * ------------------------------------------------------------------ */
  function healthCheck(P) {
    const dd = P.meta.dataDate;
    const acts = P.acts.filter((a) => !P.isSummaryType(a));
    const open = acts.filter((a) => a.status !== 'CO');
    const nTasks = Math.max(1, open.length);
    const res = [];
    const add = (key, name, list, total, limitPct, what, sev) => {
      const pct = total ? list.length / total * 100 : 0;
      res.push({ key, name, count: list.length, total, pct, limit: limitPct, pass: pct <= limitPct, what, severity: sev || 'warn', uids: list.map((a) => a.uid) });
    };
    const rels = P.rels;
    const noPred = open.filter((a) => !P.predsOf(a.uid).length);
    const noSucc = open.filter((a) => !P.succsOf(a.uid).length);
    const openEnds = Array.from(new Set(noPred.concat(noSucc)));
    add('logic', 'Missing logic (open ends)', openEnds.length > 2 ? openEnds : [], nTasks, 5, 'Activities without a predecessor or a successor (first/last milestones excepted). Target ≤ 5%.', 'high');
    const leads = rels.filter((r) => r.lag < 0);
    res.push({ key: 'leads', name: 'Leads (negative lags)', count: leads.length, total: rels.length, pct: rels.length ? leads.length / rels.length * 100 : 0, limit: 0, pass: leads.length === 0, what: 'Relationships with a negative lag hide logic. Target 0.', severity: 'high', uids: Array.from(new Set(leads.map((r) => r.succ))) });
    const lags = rels.filter((r) => r.lag > 0);
    res.push({ key: 'lags', name: 'Positive lags', count: lags.length, total: rels.length, pct: rels.length ? lags.length / rels.length * 100 : 0, limit: 5, pass: !rels.length || lags.length / rels.length * 100 <= 5, what: 'Lags should be replaced with activities where possible. Target ≤ 5%.', severity: 'warn', uids: Array.from(new Set(lags.map((r) => r.succ))) });
    const fsR = rels.filter((r) => r.type === 'FS');
    res.push({ key: 'fs', name: 'Relationship types (FS ≥ 90%)', count: rels.length - fsR.length, total: rels.length, pct: rels.length ? fsR.length / rels.length * 100 : 100, limit: 90, pass: !rels.length || fsR.length / rels.length * 100 >= 90, what: 'Finish-to-Start should dominate. Shows the share of FS links.', severity: 'info', uids: [] , invert: true });
    const hard = open.filter((a) => [a.cstr, a.cstr2].some((c) => c && /MSO$|MEO$|MANDSTART|MANDFIN|MSOB|MEOB/.test(c.type || '')));
    add('hard', 'Hard constraints', hard, nTasks, 5, 'Must/finish-on or before constraints block logic. Target ≤ 5%.', 'warn');
    const highFloat = open.filter((a) => a.tf != null && a.tf > 44);
    add('hifloat', 'High float (> 44 days)', highFloat, nTasks, 5, 'Usually means missing successors. Target ≤ 5%.', 'warn');
    const neg = open.filter((a) => a.tf != null && a.tf < 0);
    add('negfloat', 'Negative float', neg, nTasks, 0, 'Project is late against a constraint / must-finish date. Target 0.', 'high');
    const longDur = open.filter((a) => !P.isMilestone(a) && a.origDur > 44);
    add('hidur', 'High duration (> 44 days)', longDur, nTasks, 5, 'Break long activities down for better control. Target ≤ 5%.', 'warn');
    const invalid = acts.filter((a) => (a.aStart != null && a.aStart >= dd) || (a.aFinish != null && a.aFinish >= dd) ||
      (a.status !== 'CO' && a.eFinish != null && a.eFinish < dd && P.settings.scheduled));
    add('invalid', 'Invalid dates', invalid, acts.length, 0, 'Actuals after the Data Date or forecasts before it. Target 0.', 'high');
    const shouldBeDone = acts.filter((a) => a.bl && a.bl.finish != null && a.bl.finish < dd);
    const missed = shouldBeDone.filter((a) => !(a.status === 'CO' && a.aFinish != null && a.aFinish <= a.bl.finish));
    add('missed', 'Missed activities (finished late vs baseline)', missed, Math.max(1, shouldBeDone.length), 5, 'Planned to finish by the Data Date but finished late or not at all. Target ≤ 5%.', 'warn');
    const crit = open.filter((a) => a.crit);
    res.push({ key: 'cp', name: 'Critical path exists', count: crit.length, total: nTasks, pct: crit.length / nTasks * 100, limit: 0, pass: crit.length > 0, what: 'A continuous critical path should drive the finish.', severity: 'info', uids: crit.map((a) => a.uid) });
    // BEI
    const blDue = acts.filter((a) => a.bl && a.bl.finish != null && a.bl.finish < dd).length;
    const doneTot = acts.filter((a) => a.status === 'CO').length;
    const bei = blDue ? doneTot / blDue : 1;
    res.push({ key: 'bei', name: 'Baseline Execution Index (BEI ≥ 0.95)', count: doneTot, total: blDue, pct: bei * 100, limit: 95, pass: bei >= 0.95, what: 'Activities completed ÷ activities that should have been completed. ' + bei.toFixed(2), severity: 'info', uids: [], value: bei });
    const loops = P._lastLoops || [];
    res.push({ key: 'loops', name: 'Logic loops', count: loops.length, total: acts.length, pct: 0, limit: 0, pass: !loops.length, what: loops.length ? 'Circular logic: ' + loops.slice(0, 8).join(', ') : 'No circular logic.', severity: 'high', uids: [] });
    const passed = res.filter((r) => r.pass).length;
    return { checks: res, score: Math.round(passed / res.length * 100), passed, total: res.length };
  }

  /* ------------------------------------------------------------------ *
   * Written insights
   * ------------------------------------------------------------------ */
  function insights(P, fl) {
    fl = fl || flagAll(P);
    const out = [];
    const dd = P.meta.dataDate;
    const all = P.acts.filter((a) => !P.isSummaryType(a));
    const pr = progressOf(P, all);
    const prevA = prevActual(P, all);
    const v = pr.actual - pr.planned;
    out.push({ tone: v >= -2 ? 'good' : v >= -8 ? 'warn' : 'bad', text: 'Overall progress is ' + pr.actual.toFixed(1) + '% against a planned ' + pr.planned.toFixed(1) + '% as of ' + D.fmtLong(dd) + ' (' + (v >= 0 ? '+' : '') + v.toFixed(1) + '%). Progress gained this period: ' + (pr.actual - prevA).toFixed(1) + '%.' });
    const c = fl.counts;
    if (c.lateStart) out.push({ tone: 'warn', lens: 'lateStart', text: c.lateStart + ' activit' + (c.lateStart === 1 ? 'y was' : 'ies were') + ' due to start before the Data Date but ' + (c.lateStart === 1 ? 'has' : 'have') + ' not started.' });
    if (c.overdue) out.push({ tone: 'bad', lens: 'overdue', text: c.overdue + ' activit' + (c.overdue === 1 ? 'y is' : 'ies are') + ' past their finish date and still open.' });
    if (c.future) out.push({ tone: 'warn', lens: 'future', text: c.future + ' future activit' + (c.future === 1 ? 'y shows' : 'ies show') + ' progress - check these were really started early.' });
    if (c.pending) out.push({ tone: 'info', lens: 'pending', text: c.pending + ' activit' + (c.pending === 1 ? 'y still needs' : 'ies still need') + ' your update this month.' });
    if (c.invalid) out.push({ tone: 'bad', lens: 'invalid', text: c.invalid + ' activit' + (c.invalid === 1 ? 'y has' : 'ies have') + ' invalid progress data - fix before exporting.' });
    if (c.outSeq) out.push({ tone: 'warn', lens: 'outSeq', text: c.outSeq + ' activit' + (c.outSeq === 1 ? 'y is' : 'ies are') + ' progressing out of sequence.' });
    const b = breakdown(P, 'building', fl).filter((r) => r.count > 2);
    if (b.length > 1) {
      const worst = b.slice().sort((x, y) => x.variance - y.variance)[0];
      const best = b.slice().sort((x, y) => y.variance - x.variance)[0];
      if (worst.variance < -1) out.push({ tone: 'bad', dim: ['building', worst.name], text: worst.name + ' is the most behind: ' + worst.actual.toFixed(1) + '% vs ' + worst.planned.toFixed(1) + '% planned (' + worst.variance.toFixed(1) + '%).' });
      if (best !== worst && best.variance > -1) out.push({ tone: 'good', dim: ['building', best.name], text: best.name + ' is on/ahead of plan at ' + best.actual.toFixed(1) + '% (' + (best.variance >= 0 ? '+' : '') + best.variance.toFixed(1) + '%).' });
    }
    const e = breakdown(P, 'epc', fl);
    const eTxt = e.filter((r) => r.name !== 'Others').map((r) => r.name + ' ' + r.actual.toFixed(0) + '%').join(', ');
    if (eTxt) out.push({ tone: 'info', text: 'EPC progress: ' + eTxt + '.' });
    if (P.meta.scheduledFinish != null) {
      const ms = P.acts.filter((a) => a.type === 'finish' && a.status !== 'CO' && a.bl && a.bl.finish != null);
      let slip = null;
      const lastBl = Math.max.apply(null, P.acts.map((a) => a.bl && a.bl.finish != null ? a.bl.finish : -Infinity));
      if (isFinite(lastBl)) slip = P.cal(null).between(lastBl, P.meta.scheduledFinish);
      out.push({ tone: slip == null || slip <= 0 ? 'good' : slip < 15 ? 'warn' : 'bad', text: 'Forecast project finish: ' + D.fmtLong(P.meta.scheduledFinish) + (slip != null ? (slip > 0 ? ' - ' + slip + ' working days later than baseline.' : slip < 0 ? ' - ' + (-slip) + ' working days ahead of baseline.' : ' - on baseline.') : '.') });
      const late = ms.filter((a) => a.eFinish != null && a.eFinish > a.bl.finish).sort((x, y) => (y.eFinish - y.bl.finish) - (x.eFinish - x.bl.finish));
      if (late.length) out.push({ tone: 'warn', text: late.length + ' milestone' + (late.length > 1 ? 's are' : ' is') + ' forecast late; worst: ' + late[0].code + ' ' + late[0].name + ' (' + D.fmt(late[0].bl.finish) + ' → ' + D.fmt(late[0].eFinish) + ').' });
    }
    if (c.critical) out.push({ tone: 'info', lens: 'critical', text: c.critical + ' activities are critical. Watch them in the look-ahead.' });
    return out;
  }

  /* ------------------------------------------------------------------ *
   * Ask Engine - natural language to filter
   * ------------------------------------------------------------------ */
  const Q_LENS = [
    [/\b(late start|should (have )?start(ed)?|delayed start|didn'?t start|nahi (hua|shuru)|start nahi)\b/, 'lateStart'],
    [/\b(overdue|late finish|should (have )?finish(ed)?|not finished)\b/, 'overdue'],
    [/\b(delayed|delay|behind|slipp?ed|slipping|late|lagging|problem|issues?)\b/, 'delayed'],
    [/\b(future|early start|ahead|started early)\b/, 'future'],
    [/\b(due|this (month|period)|is mahine)\b/, 'due'],
    [/\b(in ?progress|ongoing|running|started|chal rah[ai]|wip)\b/, 'inProgress'],
    [/\b(pending|not updated|need(s)? update|remaining to update|baaki)\b/, 'pending'],
    [/\b(updated|changed|modified)\b/, 'updated'],
    [/\b(critical|cp|driving)\b/, 'critical'],
    [/\bnegative float|neg float\b/, 'negFloat'],
    [/\b(out of sequence|oos)\b/, 'outSeq'],
    [/\b(look ?ahead|next (4|four) weeks|upcoming|coming)\b/, 'lookahead'],
    [/\b(invalid|error|wrong)\b/, 'invalid'],
    [/\b(open end|missing logic|dangling|no pred|no succ)\b/, 'openEnd']
  ];
  function ask(P, question) {
    const q = ' ' + String(question || '').toLowerCase().replace(/[?!.,]/g, ' ') + ' ';
    const filter = { lenses: [], dims: {}, status: null, text: null, window: null, milestones: false };
    const said = [];
    const quoted = /["“']([^"”']+)["”']/.exec(question || '');
    if (quoted) { filter.text = quoted[1]; said.push('containing "' + quoted[1] + '"'); }
    let lensHit = false;
    for (const [re, key] of Q_LENS) {
      if (re.test(q)) {
        if (key === 'overdue' && filter.lenses.includes('lateStart')) continue;
        if (key === 'inProgress' && /not started|nahi/.test(q)) continue;
        if (key === 'delayed') { if (!filter.lenses.length) { filter.anyLenses = ['lateStart', 'overdue']; lensHit = true; } continue; }
        filter.lenses.push(key); lensHit = true;
      }
    }
    if (/\bcompleted?\b|\bfinished\b|\bdone\b|\bpoore?\b/.test(q) && !/not (completed|finished)|should/.test(q)) filter.status = 'CO';
    if (/\bnot started\b/.test(q) && !filter.lenses.includes('lateStart')) filter.status = 'NS';
    if (/\bmilestones?\b/.test(q)) filter.milestones = true;
    const dd = P.meta.dataDate;
    let m;
    if ((m = /next (\d+) (day|week|month)s?/.exec(q))) {
      const n = +m[1] * (m[2] === 'day' ? 1 : m[2] === 'week' ? 7 : 30);
      filter.window = [dd, dd + n]; said.push('in the next ' + m[1] + ' ' + m[2] + (+m[1] > 1 ? 's' : ''));
    } else if (/next month|agle mahine/.test(q)) {
      const nm = D.addMonths(dd, 1);
      filter.window = [D.monthStart(nm), D.monthEnd(nm)]; said.push('in ' + D.monthLabel(nm));
    } else if (/this month/.test(q) && !filter.lenses.includes('due')) {
      filter.window = [D.monthStart(dd), D.monthEnd(dd)]; said.push('in ' + D.monthLabel(dd));
    }
    // dimension values (building / epc / codes / wbs names)
    const dimKeys = ['building', 'epc'].concat(P.codeTypes.map((c) => 'code:' + c.name));
    for (const k of dimKeys) {
      const vals = new Set(P.acts.map((a) => P.dim(a, k)));
      for (const v of vals) {
        if (!v || v.length < 2 || /^(project milestones|general|others|all)$/i.test(v)) continue;
        const lv = v.toLowerCase();
        const words = lv.split(/\s+/).filter((w) => w.length > 2 && !/^(building|block|and|the|work|works|phase|project|milestones?|general|others?|house|area)$/.test(w));
        let hit = q.indexOf(' ' + lv + ' ') >= 0 || q.indexOf(lv) >= 0;
        if (!hit && k === 'epc') hit = (lv === 'engineering' && /\b(eng|engg|design|drawings?)\b/.test(q)) || (lv === 'procurement' && /\b(proc|procure|supply|purchase|po)\b/.test(q)) || (lv === 'construction' && /\b(const|constn|civil|site|erection|execution)\b/.test(q));
        if (!hit && words.length) hit = words.some((w) => new RegExp('\\b' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').test(q) && w.length > 3);
        if (hit) { (filter.dims[k] = filter.dims[k] || []).push(v); }
      }
    }
    for (const k in filter.dims) said.push((k === 'building' ? 'building ' : k === 'epc' ? '' : k.replace('code:', '') + ' ') + filter.dims[k].join(' / '));
    // question type
    const wantsCount = /how many|count|kitne|number of/.test(q);
    const wantsProgress = /progress|percent|%|kitna|status of|how much/.test(q) && !lensHit;
    const wantsFinish = /when|finish date|completion date|kab|end date/.test(q) && /project|plant|finish|complete|handover/.test(q) && !lensHit;
    const wantsCP = /critical path/.test(q);
    const list = applyFilter(P, filter);
    let answer;
    const scopeTxt = said.length ? ' ' + said.join(', ') : '';
    const lensTxt = filter.lenses.map((k) => LENS_BY_KEY[k].short.toLowerCase()).concat(filter.anyLenses ? ['delayed (late start or overdue)'] : []).join(' + ');
    if (wantsFinish) {
      answer = 'Forecast finish' + scopeTxt + ': ' + D.fmtLong(Math.max.apply(null, list.map((a) => P.finishOf(a) || 0))) + '.';
    } else if (wantsProgress) {
      const pr = progressOf(P, list);
      answer = 'Progress' + scopeTxt + ': ' + pr.actual.toFixed(1) + '% actual vs ' + pr.planned.toFixed(1) + '% planned (' + (pr.actual - pr.planned >= 0 ? '+' : '') + (pr.actual - pr.planned).toFixed(1) + '%) across ' + list.length + ' activities.';
    } else if (wantsCP) {
      const cp = list.filter((a) => a.longest || a.crit);
      answer = cp.length + ' activities on the critical / longest path' + scopeTxt + '.';
      filter.lenses = ['critical'];
    } else {
      answer = (wantsCount ? '' : 'Showing ') + list.length + (lensTxt ? ' ' + lensTxt : '') + (filter.status ? ' ' + SE.STATUS[filter.status].toLowerCase() : '') + (filter.milestones ? ' milestone' : '') + ' activit' + (list.length === 1 ? 'y' : 'ies') + scopeTxt + '.';
    }
    if (!lensHit && !filter.anyLenses && !filter.status && !filter.text && !Object.keys(filter.dims).length && !filter.window && !filter.milestones && !wantsCP && !wantsFinish && !wantsProgress) {
      // fall back to text search
      const t = String(question || '').trim();
      filter.text = t;
      const l2 = applyFilter(P, filter);
      answer = l2.length ? 'Found ' + l2.length + ' activities matching "' + t + '".' : 'I could not match that. Try: "delayed activities in Admin Building", "procurement progress", "what is critical in next 30 days", "how many not started in Warehouse".';
    }
    return { filter, answer, count: applyFilter(P, filter).length };
  }

  function applyFilter(P, f, flMap) {
    flMap = flMap || flagAll(P).map;
    const txt = f.text ? f.text.toLowerCase() : null;
    return P.acts.filter((a) => {
      if (P.isSummaryType(a)) return false;
      const fl = flMap.get(a.uid) || [];
      if (f.lenses && f.lenses.length && !f.lenses.every((k) => fl.includes(k))) return false;
      if (f.anyLenses && f.anyLenses.length && !f.anyLenses.some((k) => fl.includes(k))) return false;
      if (f.status && a.status !== f.status) return false;
      if (f.milestones && !P.isMilestone(a)) return false;
      if (f.dims) for (const k in f.dims) if (f.dims[k].length && !f.dims[k].includes(P.dim(a, k))) return false;
      if (f.window) {
        const s = P.startOf(a), e = P.finishOf(a);
        if (s == null || e == null || e < f.window[0] || s > f.window[1]) return false;
      }
      if (txt && (a.code + ' ' + a.name + ' ' + P.wbsPathText(a.wbsId)).toLowerCase().indexOf(txt) < 0) return false;
      return true;
    });
  }

  /* comparison between two versions (e.g. previous vs current) */
  function compare(P) {
    const rows = [];
    for (const a of P.acts) {
      if (!a.prev) continue;
      const ch = [];
      if (a.prev.status !== a.status) ch.push('Status ' + SE.STATUS[a.prev.status] + ' → ' + SE.STATUS[a.status]);
      if ((a.prev.pct || 0) !== (a.pct || 0)) ch.push('% ' + (a.prev.pct || 0) + ' → ' + (a.pct || 0));
      if (a.prev.aStart !== a.aStart) ch.push('AS ' + (D.fmt(a.prev.aStart) || '—') + ' → ' + (D.fmt(a.aStart) || '—'));
      if (a.prev.aFinish !== a.aFinish) ch.push('AF ' + (D.fmt(a.prev.aFinish) || '—') + ' → ' + (D.fmt(a.aFinish) || '—'));
      const sf = P.finishOf(a);
      const finVar = a.prev.finish != null && sf != null ? P.cal(a).between(a.prev.finish, sf) : 0;
      if (ch.length || finVar) rows.push({ a, changes: ch, finishVar: finVar });
    }
    return rows;
  }

  SE.LENSES = LENSES;
  SE.LENS_BY_KEY = LENS_BY_KEY;
  SE.analysis = { flags, flagAll, actualFrac, progressOf, prevActual, plannedFrac, sCurve, breakdown, healthCheck, insights, ask, applyFilter, compare, range, weightOf };
})(typeof module === 'object' && module.exports ? (global.SE = global.SE || {}) : (window.SE = window.SE || {}));
