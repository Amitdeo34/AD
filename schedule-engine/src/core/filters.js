/* Schedule Engine - core/filters.js
 * P6-style filters: rules of the form <column> <operator> <value>, combined with
 * "all" / "any", plus a library of built-in filters.
 */
(function (SE) {
  'use strict';
  const D = SE.D;

  const OPS = {
    text: [['contains', 'contains'], ['ncontains', 'does not contain'], ['eq', 'equals'], ['neq', 'is not equal to'], ['starts', 'starts with'], ['empty', 'is empty'], ['nempty', 'is not empty']],
    code: [['eq', 'equals'], ['neq', 'is not equal to'], ['in', 'is any of (comma separated)'], ['contains', 'contains'], ['empty', 'is empty'], ['nempty', 'is not empty']],
    num: [['eq', '='], ['neq', '≠'], ['lt', '<'], ['le', '≤'], ['gt', '>'], ['ge', '≥'], ['between', 'is between'], ['empty', 'is empty'], ['nempty', 'is not empty']],
    pct: [['eq', '='], ['lt', '<'], ['le', '≤'], ['gt', '>'], ['ge', '≥'], ['between', 'is between']],
    date: [['on', 'is on'], ['before', 'is before'], ['after', 'is after'], ['between', 'is between'], ['nextN', 'is within the next N days of the Data Date'], ['lastN', 'is within the last N days before the Data Date'], ['beforeDD', 'is before the Data Date'], ['afterDD', 'is on/after the Data Date'], ['empty', 'is empty'], ['nempty', 'is not empty']],
    bool: [['true', 'is Yes'], ['false', 'is No']]
  };
  const opsFor = (col) => OPS[col.t === 'code' ? 'code' : col.t] || OPS.text;

  function test(P, rule, a, ctx) {
    const col = SE.columns.get(P, rule.col);
    if (!col) return true;
    let v = SE.columns.value(P, col, a, ctx);
    const op = rule.op;
    if (op === 'empty') return v == null || v === '';
    if (op === 'nempty') return !(v == null || v === '');
    if (col.t === 'bool') return op === 'true' ? !!v : !v;
    if (col.t === 'date') {
      const dd = P.meta.dataDate;
      const d1 = D.parseDay(rule.value), d2 = D.parseDay(rule.value2);
      if (v == null) return false;
      switch (op) {
        case 'on': return v === d1;
        case 'before': return d1 != null && v < d1;
        case 'after': return d1 != null && v > d1;
        case 'between': return d1 != null && d2 != null && v >= d1 && v <= d2;
        case 'nextN': return v >= dd && v < dd + (+rule.value || 0);
        case 'lastN': return v < dd && v >= dd - (+rule.value || 0);
        case 'beforeDD': return v < dd;
        case 'afterDD': return v >= dd;
        default: return true;
      }
    }
    if (col.t === 'num' || col.t === 'pct') {
      if (v == null || v === '') return false;
      const x = parseFloat(rule.value), y = parseFloat(rule.value2);
      switch (op) {
        case 'eq': return v === x; case 'neq': return v !== x; case 'lt': return v < x; case 'le': return v <= x;
        case 'gt': return v > x; case 'ge': return v >= x; case 'between': return v >= x && v <= y; default: return true;
      }
    }
    const t = String(v == null ? '' : v).toLowerCase();
    const q = String(rule.value == null ? '' : rule.value).toLowerCase().trim();
    switch (op) {
      case 'contains': return t.indexOf(q) >= 0;
      case 'ncontains': return t.indexOf(q) < 0;
      case 'eq': return t === q || (col.raw && String(col.raw(a)).toLowerCase() === q);
      case 'neq': return t !== q;
      case 'starts': return t.startsWith(q);
      case 'in': return q.split(',').map((s) => s.trim()).filter(Boolean).some((s) => s === t || (col.raw && String(col.raw(a)).toLowerCase() === s));
      default: return true;
    }
  }
  function matches(P, f, a, ctx) {
    if (!f || !f.rules || !f.rules.length) return true;
    return f.match === 'any' ? f.rules.some((r) => test(P, r, a, ctx)) : f.rules.every((r) => test(P, r, a, ctx));
  }
  function describe(P, rule) {
    const col = SE.columns.get(P, rule.col);
    if (!col) return rule.col;
    const op = (opsFor(col).find((o) => o[0] === rule.op) || [rule.op, rule.op])[1];
    const needs = !['empty', 'nempty', 'true', 'false', 'beforeDD', 'afterDD'].includes(rule.op);
    return col.label + ' ' + op + (needs ? ' ' + (rule.value || '') + (rule.op === 'between' ? ' and ' + (rule.value2 || '') : '') + (/N$/.test(rule.op) ? ' days' : '') : '');
  }

  const BUILTIN = [
    { id: 'b:crit', name: 'Critical', rules: [{ col: 'crit', op: 'true' }] },
    { id: 'b:longest', name: 'Longest Path', rules: [{ col: 'longest', op: 'true' }] },
    { id: 'b:ns', name: 'Not Started', rules: [{ col: 'status', op: 'eq', value: 'Not Started' }] },
    { id: 'b:ip', name: 'In Progress', rules: [{ col: 'status', op: 'eq', value: 'In Progress' }] },
    { id: 'b:co', name: 'Completed', rules: [{ col: 'status', op: 'eq', value: 'Completed' }] },
    { id: 'b:open', name: 'Not Complete', rules: [{ col: 'status', op: 'neq', value: 'Completed' }] },
    { id: 'b:ms', name: 'Milestones', match: 'any', rules: [{ col: 'type', op: 'eq', value: 'Start Milestone' }, { col: 'type', op: 'eq', value: 'Finish Milestone' }] },
    { id: 'b:neg', name: 'Negative Float', rules: [{ col: 'tf', op: 'lt', value: '0' }] },
    { id: 'b:near', name: 'Near Critical (float 1 - 10 days)', rules: [{ col: 'tf', op: 'between', value: '1', value2: '10' }] },
    { id: 'b:hifloat', name: 'High Float (> 44 days)', rules: [{ col: 'tf', op: 'gt', value: '44' }] },
    { id: 'b:la30', name: '30-day Look-ahead (not complete)', rules: [{ col: 'start', op: 'nextN', value: '30' }, { col: 'status', op: 'neq', value: 'Completed' }] },
    { id: 'b:la60', name: '60-day Look-ahead (not complete)', rules: [{ col: 'start', op: 'nextN', value: '60' }, { col: 'status', op: 'neq', value: 'Completed' }] },
    { id: 'b:la90', name: '90-day Look-ahead (not complete)', rules: [{ col: 'start', op: 'nextN', value: '90' }, { col: 'status', op: 'neq', value: 'Completed' }] },
    { id: 'b:fin30', name: 'Finishing in next 30 days', rules: [{ col: 'finish', op: 'nextN', value: '30' }, { col: 'status', op: 'neq', value: 'Completed' }] },
    { id: 'b:period', name: 'Completed in the last 31 days', rules: [{ col: 'aFinish', op: 'lastN', value: '31' }] },
    { id: 'b:late', name: 'Late vs Baseline (finish slip > 0)', rules: [{ col: 'var', op: 'gt', value: '0' }] },
    { id: 'b:slip', name: 'Finish moved later since last update', rules: [{ col: 'movFinish', op: 'gt', value: '0' }] },
    { id: 'b:nopred', name: 'Without Predecessors', rules: [{ col: 'nPreds', op: 'eq', value: '0' }] },
    { id: 'b:nosucc', name: 'Without Successors', rules: [{ col: 'nSuccs', op: 'eq', value: '0' }] },
    { id: 'b:cstr', name: 'With Constraints', rules: [{ col: 'cstrType', op: 'nempty' }] },
    { id: 'b:long', name: 'Long Duration (> 44 days)', rules: [{ col: 'origDur', op: 'gt', value: '44' }] },
    { id: 'b:behind', name: 'Behind planned % by more than 10', rules: [{ col: 'pctVar', op: 'lt', value: '-10' }] },
    { id: 'b:touched', name: 'Updated in this session', rules: [{ col: 'touched', op: 'true' }] },
    { id: 'b:remarks', name: 'With Remarks', rules: [{ col: 'notes', op: 'nempty' }] },
    { id: 'b:qty', name: 'With Quantities', rules: [{ col: 'qtyScope', op: 'nempty' }] }
  ];

  SE.filters = { OPS, opsFor, test, matches, describe, BUILTIN };
})(typeof module === 'object' && module.exports ? (global.SE = global.SE || {}) : (window.SE = window.SE || {}));
