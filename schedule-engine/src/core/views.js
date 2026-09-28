/* Schedule Engine - core/views.js
 * Builds the grouped row model (P6 "group & sort") shared by the grid, the
 * Gantt, and the Excel / PDF / HTML exports so every output matches the screen.
 */
(function (SE) {
  'use strict';

  const SORTS = {
    start: (P) => (a) => P.startOf(a),
    finish: (P) => (a) => P.finishOf(a),
    code: () => (a) => a.code,
    name: () => (a) => a.name,
    tf: () => (a) => (a.tf == null ? 1e9 : a.tf),
    pct: () => (a) => a.pct || 0,
    origDur: () => (a) => a.origDur || 0,
    remDur: () => (a) => a.remDur || 0,
    status: () => (a) => ({ IP: 0, NS: 1, CO: 2 }[a.status])
  };

  /** sort: {key, dir} or [{key, dir}, ...]; key = built-in sort or any column id */
  function sorter(P, sort) {
    const list = (Array.isArray(sort) ? sort : [sort || { key: 'start' }]).filter((x) => x && x.key);
    if (!list.length) list.push({ key: 'start', dir: 'asc' });
    const fns = list.map((sk) => {
      let f;
      if (SORTS[sk.key]) f = SORTS[sk.key](P);
      else {
        const col = SE.columns && SE.columns.get(P, sk.key);
        f = col ? (a) => SE.columns.sortValue(P, col, a) : SORTS.start(P);
      }
      return { f, dir: sk.dir === 'desc' ? -1 : 1 };
    });
    return (x, y) => {
      for (const { f, dir } of fns) {
        let a = f(x), b = f(y);
        if (a === b) continue;
        if (a == null || a === '') return 1;
        if (b == null || b === '') return -1;
        const c = typeof a === 'string' || typeof b === 'string' ? String(a).localeCompare(String(b), undefined, { numeric: true }) : a - b;
        if (c) return c * dir;
      }
      return String(x.code).localeCompare(String(y.code), undefined, { numeric: true });
    };
  }

  function summarize(P, acts) {
    let s = null, f = null, bs = null, bf = null, tf = null, w = 0, done = 0, aS = null, aF = null;
    let allDone = acts.length > 0, anyStarted = false;
    for (const a of acts) {
      const x = P.startOf(a), y = P.finishOf(a);
      if (x != null && (s == null || x < s)) s = x;
      if (y != null && (f == null || y > f)) f = y;
      if (a.bl) {
        if (a.bl.start != null && (bs == null || a.bl.start < bs)) bs = a.bl.start;
        if (a.bl.finish != null && (bf == null || a.bl.finish > bf)) bf = a.bl.finish;
      }
      if (a.status !== 'CO' && a.tf != null && (tf == null || a.tf < tf)) tf = a.tf;
      const wt = SE.analysis.weightOf(P, a);
      w += wt; done += wt * (a.status === 'CO' ? 1 : (a.pct || 0) / 100);
      if (a.status !== 'CO') allDone = false;
      if (a.status !== 'NS') { anyStarted = true; if (a.aStart != null && (aS == null || a.aStart < aS)) aS = a.aStart; }
      if (a.aFinish != null && (aF == null || a.aFinish > aF)) aF = a.aFinish;
    }
    const pr = SE.analysis.progressOf(P, acts);
    return {
      start: s, finish: f, blStart: bs, blFinish: bf, tf, pct: w ? done / w * 100 : 0, planned: pr.planned,
      status: allDone ? 'CO' : anyStarted ? 'IP' : 'NS', aStart: aS, aFinish: allDone ? aF : null,
      origDur: s != null && f != null ? P.cal(null).span(s, f) : 0
    };
  }

  /**
   * opts: { groupBy: ['wbs'] | ['building','epc'] | [], filter(a), sort:{key,dir}, collapsed:Set<string> }
   * returns flat array of rows: {kind:'group', id, label, level, count, sum, collapsed} | {kind:'act', a, level}
   */
  function buildRows(P, opts) {
    opts = opts || {};
    const groupBy = opts.groupBy || ['wbs'];
    const filter = opts.filter || (() => true);
    const collapsed = opts.collapsed || new Set();
    const cmp = sorter(P, opts.sort);
    const acts = P.acts.filter((a) => filter(a));
    const rows = [];

    if (groupBy.length === 1 && groupBy[0] === 'wbs') {
      const idx = P.idx;
      const byW = new Map();
      for (const a of acts) { if (!byW.has(a.wbsId)) byW.set(a.wbsId, []); byW.get(a.wbsId).push(a); }
      const subtreeActs = new Map();
      const collect = (w) => {
        let list = (byW.get(w.id) || []).slice();
        for (const k of idx.kids.get(w.id) || []) list = list.concat(collect(k));
        subtreeActs.set(w.id, list);
        return list;
      };
      const tops = [];
      if (P.rootWbsId && P.wbs[P.rootWbsId]) tops.push(P.wbs[P.rootWbsId]);
      for (const r of idx.roots) if (r.id !== P.rootWbsId) tops.push(r);
      tops.forEach(collect);
      // orphan activities (wbs not found)
      const orphans = acts.filter((a) => !P.wbs[a.wbsId]);
      const emit = (w, level) => {
        const list = subtreeActs.get(w.id) || [];
        if (!list.length) return;
        const id = 'wbs:' + w.id;
        const isRoot = w.id === P.rootWbsId;
        rows.push({ kind: 'group', id, label: isRoot ? P.meta.name : w.name, code: w.code, level, count: list.length, sum: summarize(P, list), collapsed: collapsed.has(id), wbsId: w.id });
        if (collapsed.has(id)) return;
        const own = opts.noActs ? [] : (byW.get(w.id) || []).slice().sort(cmp);
        for (const a of own) rows.push({ kind: 'act', a, level: level + 1 });
        for (const k of idx.kids.get(w.id) || []) emit(k, level + 1);
      };
      tops.forEach((t) => emit(t, 0));
      if (orphans.length) {
        rows.push({ kind: 'group', id: 'wbs:?', label: '(No WBS)', level: 0, count: orphans.length, sum: summarize(P, orphans), collapsed: collapsed.has('wbs:?') });
        if (!collapsed.has('wbs:?') && !opts.noActs) orphans.sort(cmp).forEach((a) => rows.push({ kind: 'act', a, level: 1 }));
      }
      return rows;
    }

    if (!groupBy.length) {
      if (!opts.noActs) acts.sort(cmp).forEach((a) => rows.push({ kind: 'act', a, level: 0 }));
      return rows;
    }

    // dimension grouping (Building, EPC, codes, status, lens ...)
    const flMap = opts.flags;
    const valueOf = (a, key) => {
      if (key === 'lens') {
        const f = flMap ? flMap.get(a.uid) || [] : [];
        const first = ['invalid', 'overdue', 'lateStart', 'future', 'pending', 'inProgress', 'due', 'updated'].find((k) => f.includes(k));
        return first ? SE.LENS_BY_KEY[first].label : 'No action needed';
      }
      if (key === 'building' || key === 'epc' || key === 'status' || key.startsWith('code:') || key.startsWith('wbs:')) return P.dim(a, key);
      const col = SE.columns && SE.columns.get(P, key);
      return col ? SE.columns.groupValue(P, col, a, { flags: flMap }) : P.dim(a, key);
    };
    const colKey = (key) => !(key === 'building' || key === 'epc' || key === 'status' || key === 'lens' || key.startsWith('code:') || key.startsWith('wbs:')) && SE.columns && SE.columns.get(P, key);
    const orderOf = (key, vals) => {
      if (key === 'epc') return vals.sort((a, b) => idxOr(SE.EPC, a) - idxOr(SE.EPC, b));
      if (key === 'status') return vals.sort((a, b) => ['In Progress', 'Not Started', 'Completed'].indexOf(a) - ['In Progress', 'Not Started', 'Completed'].indexOf(b));
      if (key === 'lens') { const L = SE.LENSES.map((l) => l.label).concat(['No action needed']); return vals.sort((a, b) => L.indexOf(a) - L.indexOf(b)); }
      return vals; // first appearance (follows WBS order)
    };
    // stable base order: WBS order, then start
    const wbsOrder = new Map();
    let i = 0;
    const walk = (w) => { wbsOrder.set(w.id, i++); for (const k of P.idx.kids.get(w.id) || []) walk(k); };
    if (P.rootWbsId && P.wbs[P.rootWbsId]) walk(P.wbs[P.rootWbsId]);
    for (const r of P.idx.roots) if (!wbsOrder.has(r.id)) walk(r);
    const base = acts.slice().sort((x, y) => ((wbsOrder.get(x.wbsId) || 0) - (wbsOrder.get(y.wbsId) || 0)) || cmp(x, y));
    const recurse = (list, depth, prefix) => {
      const key = groupBy[depth];
      const groups = new Map();
      for (const a of list) {
        const v = valueOf(a, key);
        if (!groups.has(v)) groups.set(v, []);
        groups.get(v).push(a);
      }
      let keys = orderOf(key, Array.from(groups.keys()));
      const col = colKey(key);
      if (col) {
        const minOf = (g) => { let m = null; for (const a of g) { const v = SE.columns.sortValue(P, col, a); if (v != null && v !== '' && (m == null || v < m)) m = v; } return m; };
        const mv = new Map(keys.map((k) => [k, minOf(groups.get(k))]));
        keys = keys.slice().sort((x, y) => { const a = mv.get(x), b = mv.get(y); if (a == null) return 1; if (b == null) return -1; return typeof a === 'string' ? a.localeCompare(b, undefined, { numeric: true }) : a - b; });
      }
      for (const v of keys) {
        const g = groups.get(v);
        const id = prefix + '|' + key + '=' + v;
        rows.push({ kind: 'group', id, label: v, dimKey: key, level: depth, count: g.length, sum: summarize(P, g), collapsed: collapsed.has(id) });
        if (collapsed.has(id)) continue;
        if (depth + 1 < groupBy.length) recurse(g, depth + 1, id);
        else if (!opts.noActs) g.slice().sort(cmp).forEach((a) => rows.push({ kind: 'act', a, level: depth + 1 }));
      }
    };
    recurse(base, 0, 'g');
    return rows;
  }
  function idxOr(arr, v) { const k = arr.indexOf(v); return k < 0 ? 99 : k; }

  /** ids of every group row at level >= n (for "collapse to level n") and the max level */
  function groupLevels(P, opts) {
    const all = buildRows(P, Object.assign({}, opts, { collapsed: new Set(), noActs: false }));
    let max = 0;
    const byLevel = new Map();
    for (const r of all) if (r.kind === 'group') { max = Math.max(max, r.level); if (!byLevel.has(r.level)) byLevel.set(r.level, []); byLevel.get(r.level).push(r.id); }
    return { max, byLevel, all };
  }

  SE.views = { buildRows, summarize, sorter, groupLevels };
})(typeof module === 'object' && module.exports ? (global.SE = global.SE || {}) : (window.SE = window.SE || {}));
