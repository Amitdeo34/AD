/* Schedule Engine - core/columns.js
 * P6-style column catalogue shared by the grid, filters, group & sort and the
 * Excel / PDF / CSV exports. Every column knows how to get its raw value, how to
 * print it, how to sort / group on it, whether and how it can be edited, and
 * what to show on a group (WBS band) row.
 */
(function (SE) {
  'use strict';
  const D = SE.D;
  const r1 = (n) => (n == null || !isFinite(n) ? null : Math.round(n * 10) / 10);
  const isCO = (a) => a.status === 'CO';

  const CATS = ['General', 'Durations', 'Dates', 'Variance', 'Float', 'Progress', 'Logic', 'Building & EPC', 'Quantities', 'Activity Codes', 'User Defined Fields'];

  function actualDur(P, a) {
    if (a.aStart == null) return 0;
    const end = a.aFinish != null ? a.aFinish : P.meta.dataDate - 1;
    return end < a.aStart ? 0 : P.cal(a).span(a.aStart, end);
  }
  function relText(P, list, isPred) {
    return list.map((r) => { const o = P.act(isPred ? r.pred : r.succ); return (o ? o.code : '?') + (r.type !== 'FS' || r.lag ? ' ' + r.type : '') + (r.lag ? (r.lag > 0 ? '+' : '') + r.lag + 'd' : ''); }).join(', ');
  }
  const wd = (P, a, x, y) => (x == null || y == null ? null : P.cal(a).between(x, y));

  /* base definitions -------------------------------------------------- */
  // t: text | num | date | pct | bool | code ; sum: value on group rows from views.summarize()
  const BASE = [
    // General
    { id: 'code', label: 'Activity ID', cat: 'General', w: 116, t: 'text', v: (P, a) => a.code, frozen: true },
    { id: 'name', label: 'Activity Name', cat: 'General', w: 290, t: 'text', v: (P, a) => a.name, edit: 'text', frozen: true },
    { id: 'status', label: 'Activity Status', short: 'Status', cat: 'General', w: 88, t: 'text', v: (P, a) => SE.STATUS[a.status], sum: (s) => SE.STATUS[s.status], sortV: (P, a) => ({ IP: 0, NS: 1, CO: 2 }[a.status]) },
    { id: 'type', label: 'Activity Type', cat: 'General', w: 110, t: 'text', v: (P, a) => SE.TYPE_LABEL[a.type] },
    { id: 'wbsCode', label: 'WBS Code', cat: 'General', w: 100, t: 'text', v: (P, a) => { const w = P.wbs[a.wbsId]; return w ? P.wbsPath(a.wbsId).map((x) => x.code).join('.') || w.code : ''; } },
    { id: 'wbsName', label: 'WBS Name', cat: 'General', w: 150, t: 'text', v: (P, a) => (P.wbs[a.wbsId] ? P.wbs[a.wbsId].name : '') },
    { id: 'wbsPath', label: 'WBS Path', cat: 'General', w: 220, t: 'text', v: (P, a) => P.wbsPathText(a.wbsId) },
    { id: 'calendar', label: 'Calendar', cat: 'General', w: 140, t: 'text', v: (P, a) => P.cal(a).name },
    { id: 'pctType', label: '% Complete Type', cat: 'General', w: 90, t: 'text', v: (P, a) => ({ phys: 'Physical', dur: 'Duration', units: 'Units' }[a.pctType]) },
    { id: 'cstrType', label: 'Primary Constraint', cat: 'General', w: 130, t: 'text', v: (P, a) => (a.cstr && a.cstr.type ? SE.CSTR_LABEL[a.cstr.type] || a.cstr.type : '') },
    { id: 'cstrDate', label: 'Primary Constraint Date', cat: 'General', w: 90, t: 'date', v: (P, a) => (a.cstr ? a.cstr.date : null) },
    { id: 'crit', label: 'Critical', cat: 'General', w: 60, t: 'bool', v: (P, a) => !isCO(a) && !!a.crit },
    { id: 'longest', label: 'Longest Path', cat: 'General', w: 70, t: 'bool', v: (P, a) => !isCO(a) && !!a.longest },
    { id: 'flags', label: 'Update Flags', cat: 'General', w: 170, t: 'text', v: (P, a, c) => SE.exporters && SE.exporters.flagText ? SE.exporters.flagText(c && c.flags ? c.flags.get(a.uid) : []) : '' },
    { id: 'touched', label: 'Updated This Session', cat: 'General', w: 70, t: 'bool', v: (P, a) => !!a.touched },
    { id: 'notes', label: 'Remarks', cat: 'General', w: 200, t: 'text', v: (P, a) => a.notes || '', edit: 'text' },
    // Durations
    { id: 'origDur', label: 'Original Duration', short: 'Orig Dur', cat: 'Durations', w: 58, t: 'num', v: (P, a) => (P.isMilestone(a) ? 0 : r1(a.origDur)), sum: (s) => s.origDur, edit: 'num' },
    { id: 'remDur', label: 'Remaining Duration', short: 'Rem Dur', cat: 'Durations', w: 58, t: 'num', v: (P, a) => (isCO(a) ? 0 : r1(a.remDur)), edit: 'num' },
    { id: 'actDur', label: 'Actual Duration', short: 'Act Dur', cat: 'Durations', w: 58, t: 'num', v: (P, a) => actualDur(P, a) },
    { id: 'atCompDur', label: 'At Completion Duration', short: 'At Comp Dur', cat: 'Durations', w: 66, t: 'num', v: (P, a) => r1(actualDur(P, a) + (isCO(a) ? 0 : a.remDur || 0)) },
    { id: 'durPct', label: 'Duration % Complete', short: 'Dur %', cat: 'Durations', w: 58, t: 'pct', v: (P, a) => (isCO(a) ? 100 : a.origDur > 0 && a.status === 'IP' ? Math.max(0, Math.min(100, Math.round((1 - a.remDur / a.origDur) * 100))) : 0) },
    { id: 'blDur', label: 'BL Duration', cat: 'Durations', w: 58, t: 'num', v: (P, a) => (a.bl && a.bl.start != null && a.bl.finish != null && !P.isMilestone(a) ? P.cal(a).span(a.bl.start, a.bl.finish) : null) },
    { id: 'varDur', label: 'Variance - BL Duration', cat: 'Variance', w: 66, t: 'num', v: (P, a) => { if (!a.bl || a.bl.start == null || P.isMilestone(a)) return null; return P.cal(a).span(a.bl.start, a.bl.finish) - (actualDur(P, a) + (isCO(a) ? 0 : a.remDur || 0)); } },
    // Dates
    { id: 'start', label: 'Start', cat: 'Dates', w: 86, t: 'date', v: (P, a) => P.startOf(a), actual: (a) => a.aStart != null, sum: (s) => s.start },
    { id: 'finish', label: 'Finish', cat: 'Dates', w: 86, t: 'date', v: (P, a) => P.finishOf(a), actual: (a) => a.aFinish != null, sum: (s) => s.finish },
    { id: 'aStart', label: 'Actual Start', cat: 'Dates', w: 90, t: 'date', v: (P, a) => a.aStart, edit: 'date', sum: (s) => s.aStart },
    { id: 'aFinish', label: 'Actual Finish', cat: 'Dates', w: 90, t: 'date', v: (P, a) => a.aFinish, edit: 'date', sum: (s) => s.aFinish },
    { id: 'expFinish', label: 'Expected Finish', cat: 'Dates', w: 92, t: 'date', v: (P, a) => (isCO(a) ? null : a.eFinish), edit: 'date', muted: true },
    { id: 'tStart', label: 'Planned Start', cat: 'Dates', w: 86, t: 'date', v: (P, a) => a.tStart },
    { id: 'tFinish', label: 'Planned Finish', cat: 'Dates', w: 86, t: 'date', v: (P, a) => a.tFinish },
    { id: 'eStart', label: 'Early Start', cat: 'Dates', w: 86, t: 'date', v: (P, a) => (isCO(a) ? null : a.eStart) },
    { id: 'eFinish', label: 'Early Finish', cat: 'Dates', w: 86, t: 'date', v: (P, a) => (isCO(a) ? null : a.eFinish) },
    { id: 'lStart', label: 'Late Start', cat: 'Dates', w: 86, t: 'date', v: (P, a) => (isCO(a) ? null : a.lStart) },
    { id: 'lFinish', label: 'Late Finish', cat: 'Dates', w: 86, t: 'date', v: (P, a) => (isCO(a) ? null : a.lFinish) },
    { id: 'rStart', label: 'Remaining Early Start', cat: 'Dates', w: 90, t: 'date', v: (P, a) => (isCO(a) ? null : a.rStart) },
    { id: 'blStart', label: 'BL Project Start', short: 'BL Start', cat: 'Dates', w: 86, t: 'date', v: (P, a) => (a.bl ? a.bl.start : null), sum: (s) => s.blStart },
    { id: 'blFinish', label: 'BL Project Finish', short: 'BL Finish', cat: 'Dates', w: 86, t: 'date', v: (P, a) => (a.bl ? a.bl.finish : null), sum: (s) => s.blFinish },
    { id: 'prevStart', label: 'Last Update Start', cat: 'Dates', w: 90, t: 'date', v: (P, a) => (a.prev ? a.prev.start : null) },
    { id: 'prevFinish', label: 'Last Update Finish', cat: 'Dates', w: 90, t: 'date', v: (P, a) => (a.prev ? a.prev.finish : null) },
    // Variance (P6 convention: baseline − current, negative = late)
    { id: 'varStart', label: 'Variance - BL Start Date', short: 'Var BL Start', cat: 'Variance', w: 70, t: 'num', v: (P, a) => (a.bl ? wd(P, a, P.startOf(a), a.bl.start) : null), bad: (v) => v < 0 },
    { id: 'varFinishBL', label: 'Variance - BL Finish Date', short: 'Var BL Finish', cat: 'Variance', w: 70, t: 'num', v: (P, a) => (a.bl ? wd(P, a, P.finishOf(a), a.bl.finish) : null), bad: (v) => v < 0, sum: (s, P) => (s.blFinish != null && s.finish != null ? P.cal(null).between(s.finish, s.blFinish) : null) },
    { id: 'var', label: 'Finish Slip vs BL (+ late)', short: 'Finish Var', cat: 'Variance', w: 62, t: 'num', v: (P, a) => (a.bl && a.bl.finish != null && P.finishOf(a) != null ? P.cal(a).between(a.bl.finish, P.finishOf(a)) : null), bad: (v) => v > 0, sum: (s, P) => (s.blFinish != null && s.finish != null ? P.cal(null).between(s.blFinish, s.finish) : null) },
    { id: 'movFinish', label: 'Finish Movement vs Last Update (+ later)', short: 'Fin Move', cat: 'Variance', w: 62, t: 'num', v: (P, a) => (a.prev && a.prev.finish != null && P.finishOf(a) != null ? P.cal(a).between(a.prev.finish, P.finishOf(a)) : null), bad: (v) => v > 0 },
    // Float
    { id: 'tf', label: 'Total Float', cat: 'Float', w: 58, t: 'num', v: (P, a) => (isCO(a) || a.tf == null ? null : r1(a.tf)), bad: (v) => v < 0, sum: (s) => (s.tf == null ? null : Math.round(s.tf)) },
    { id: 'ff', label: 'Free Float', cat: 'Float', w: 56, t: 'num', v: (P, a) => (isCO(a) || a.ff == null ? null : r1(a.ff)) },
    // Progress
    { id: 'pct', label: 'Activity % Complete', short: '% Complete', cat: 'Progress', w: 84, t: 'pct', v: (P, a) => (P.isMilestone(a) ? (isCO(a) ? 100 : 0) : r1(a.pct || 0)), sum: (s) => s.pct, edit: 'num' },
    { id: 'prevPct', label: 'Last Update %', short: 'Last %', cat: 'Progress', w: 52, t: 'pct', v: (P, a) => (a.prev ? Math.round(a.prev.status === 'CO' ? 100 : a.prev.pct || 0) : null) },
    { id: 'periodPct', label: '% Gained This Period', short: '+% Period', cat: 'Progress', w: 60, t: 'pct', v: (P, a) => (a.prev ? r1((isCO(a) ? 100 : a.pct || 0) - (a.prev.status === 'CO' ? 100 : a.prev.pct || 0)) : null) },
    { id: 'plannedPct', label: 'Planned % at Data Date', short: 'Plan %', cat: 'Progress', w: 56, t: 'pct', v: (P, a) => (P.isSummaryType(a) ? null : Math.round(SE.analysis.plannedFrac(P, a, P.meta.dataDate) * 100)), sum: (s) => s.planned },
    { id: 'pctVar', label: '% Variance (actual − planned)', short: '% Var', cat: 'Progress', w: 56, t: 'pct', v: (P, a) => (P.isSummaryType(a) ? null : r1((isCO(a) ? 100 : a.pct || 0) - SE.analysis.plannedFrac(P, a, P.meta.dataDate) * 100)), bad: (v) => v < -5, sum: (s) => r1(s.pct - s.planned) },
    // Logic
    { id: 'preds', label: 'Predecessors', cat: 'Logic', w: 180, t: 'text', v: (P, a) => relText(P, P.predsOf(a.uid), true) },
    { id: 'succs', label: 'Successors', cat: 'Logic', w: 180, t: 'text', v: (P, a) => relText(P, P.succsOf(a.uid), false) },
    { id: 'nPreds', label: 'Number of Predecessors', short: '# Preds', cat: 'Logic', w: 52, t: 'num', v: (P, a) => P.predsOf(a.uid).length },
    { id: 'nSuccs', label: 'Number of Successors', short: '# Succs', cat: 'Logic', w: 52, t: 'num', v: (P, a) => P.succsOf(a.uid).length },
    // Building & EPC
    { id: 'area', label: 'Area / Plant', short: 'Area', cat: 'Building & EPC', w: 120, t: 'text', v: (P, a) => P.dim(a, 'area') },
    { id: 'building', label: 'Building', cat: 'Building & EPC', w: 130, t: 'text', v: (P, a) => P.dim(a, 'building'), edit: 'building' },
    { id: 'epc', label: 'EPC Phase', short: 'EPC', cat: 'Building & EPC', w: 100, t: 'text', v: (P, a) => P.dim(a, 'epc'), edit: 'epc' },
    // Quantities
    { id: 'qty', label: 'Qty Done / Scope', cat: 'Quantities', w: 110, t: 'text', v: (P, a) => (a.qty && a.qty.scope ? r1(a.qty.done || 0) + ' / ' + r1(a.qty.scope) + ' ' + (a.qty.unit || '') : ''), edit: 'qty' },
    { id: 'qtyUnit', label: 'Qty Unit', cat: 'Quantities', w: 56, t: 'text', v: (P, a) => (a.qty ? a.qty.unit || '' : '') },
    { id: 'qtyScope', label: 'Qty Scope', cat: 'Quantities', w: 70, t: 'num', v: (P, a) => (a.qty && a.qty.scope ? a.qty.scope : null) },
    { id: 'qtyDone', label: 'Qty Done', cat: 'Quantities', w: 70, t: 'num', v: (P, a) => (a.qty && a.qty.scope ? a.qty.done || 0 : null) },
    { id: 'qtyBal', label: 'Qty Balance', cat: 'Quantities', w: 70, t: 'num', v: (P, a) => (a.qty && a.qty.scope ? Math.max(0, a.qty.scope - (a.qty.done || 0)) : null) },
    { id: 'qtyPct', label: 'Qty % (done ÷ scope)', short: 'Qty %', cat: 'Quantities', w: 56, t: 'pct', v: (P, a) => (a.qty && a.qty.scope ? r1(Math.min(100, (a.qty.done || 0) / a.qty.scope * 100)) : null) }
  ];

  const byIdCache = new WeakMap();
  /** full list incl. one column per activity code type and UDF */
  function list(P) {
    const out = BASE.slice();
    if (P) {
      for (const ct of P.codeTypes || []) out.push({ id: 'code:' + ct.name, label: ct.name, cat: 'Activity Codes', w: 120, t: 'code', v: (P2, a) => (a.codes[ct.name] ? P2.codeLabel(ct.name, a.codes[ct.name]) : ''), raw: (a) => a.codes[ct.name] || '', edit: 'code', codeType: ct.name });
      for (const u of P.udfTypes || []) out.push({ id: 'udf:' + u.name, label: u.name, cat: 'User Defined Fields', w: 110, t: /Date/i.test(u.dataType || '') ? 'text' : 'text', v: (P2, a) => (a.udf && a.udf[u.name] != null ? a.udf[u.name] : '') });
      for (let i = 1; i <= Math.min(P.maxWbsLevel ? P.maxWbsLevel() : 0, 6); i++) out.push({ id: 'wbs:' + i, label: 'WBS Level ' + i, cat: 'General', w: 140, t: 'text', v: (P2, a) => { const w = P2.wbsAtLevel(a, i); return w ? w.name : ''; } });
    }
    return out;
  }
  function map(P) {
    let m = P ? byIdCache.get(P) : null;
    const sig = P ? (P.codeTypes || []).length + '|' + (P.udfTypes || []).length : '';
    if (!m || m.sig !== sig) {
      m = new Map(list(P).map((c) => [c.id, c]));
      m.sig = sig;
      if (P) byIdCache.set(P, m);
    }
    return m;
  }
  function get(P, id) { return map(P).get(id) || null; }

  function value(P, col, a, ctx) { try { return col.v(P, a, ctx); } catch (e) { return null; } }
  function text(P, col, a, ctx) {
    const v = value(P, col, a, ctx);
    return fmt(col, v, col.actual ? col.actual(a) : false);
  }
  function fmt(col, v, actual) {
    if (v == null || v === '') return '';
    if (col.t === 'date') return D.fmt(v) + (actual ? ' A' : '');
    if (col.t === 'pct') return (Math.round(v * 10) / 10) + '%';
    if (col.t === 'bool') return v ? 'Yes' : '';
    if (col.t === 'num') return String(Math.round(v * 10) / 10);
    return String(v);
  }
  function sortValue(P, col, a, ctx) {
    if (col.sortV) return col.sortV(P, a);
    const v = value(P, col, a, ctx);
    if (col.t === 'bool') return v ? 0 : 1;
    return v;
  }
  /** group label for "group by this column" */
  function groupValue(P, col, a, ctx) {
    const v = value(P, col, a, ctx);
    if (v == null || v === '') return '(Blank)';
    if (col.t === 'date') return SE.MONTHS[D.parts(v).m] + ' ' + D.parts(v).y;
    if (col.t === 'bool') return v ? col.label + ': Yes' : col.label + ': No';
    if (col.id === 'tf' || col.id === 'ff') return v < 0 ? 'Negative float' : v === 0 ? 'Zero float' : v <= 10 ? '1 - 10 days' : v <= 30 ? '11 - 30 days' : v <= 60 ? '31 - 60 days' : 'More than 60 days';
    if (col.t === 'pct') return v >= 100 ? '100%' : v <= 0 ? '0%' : v < 25 ? '1 - 24%' : v < 50 ? '25 - 49%' : v < 75 ? '50 - 74%' : '75 - 99%';
    if (col.t === 'num') return String(Math.round(v));
    return String(v);
  }

  SE.columns = { CATS, BASE, list, map, get, value, text, fmt, sortValue, groupValue, actualDur };
})(typeof module === 'object' && module.exports ? (global.SE = global.SE || {}) : (window.SE = window.SE || {}));
