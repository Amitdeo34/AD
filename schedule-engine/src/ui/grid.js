/* Schedule Engine - ui/grid.js
 * Virtualised P6-style activity table on top of the column catalogue:
 * any column (incl. activity codes & UDFs), drag-to-reorder headers, frozen
 * columns, multi-level sort, group rows with expand / collapse keys, inline
 * editing with validation, fill-down and copy / paste with Excel.
 */
(function () {
  'use strict';
  const D = SE.D;
  const { S, h, $, esc } = UI;
  const RH = 26;

  const FLAG = { id: 'flag', label: '', short: '', cat: 'General', w: 34, t: 'flag', ui: true };
  const DEFAULT = ['flag', 'code', 'name', 'status', 'origDur', 'remDur', 'prevPct', 'pct', 'start', 'finish', 'aStart', 'aFinish', 'tf', 'notes'];
  S.layout = S.layout || { cols: DEFAULT.slice(), widths: {}, freeze: 3 };
  try {
    const v = JSON.parse(localStorage.getItem('se.layout.current') || 'null');
    if (v && Array.isArray(v.cols) && v.cols.length) S.layout = Object.assign(S.layout, v);
    else { const old = JSON.parse(localStorage.getItem('se.cols') || 'null'); if (Array.isArray(old) && old.length) S.layout.cols = old; }
  } catch (e) { /* ignore */ }
  const persist = () => { try { localStorage.setItem('se.layout.current', JSON.stringify({ cols: S.layout.cols, widths: S.layout.widths, freeze: S.layout.freeze })); } catch (e) { /* ignore */ } };

  const COL = (id) => (id === 'flag' ? FLAG : S.P ? SE.columns.get(S.P, id) : SE.columns.BASE.find((c) => c.id === id));
  const cols = () => S.layout.cols.map(COL).filter(Boolean);
  const W = (c) => S.layout.widths[c.id] || c.w;
  const totalW = () => cols().reduce((s, c) => s + W(c), 0);
  const isRight = (c) => c.t === 'num' || (c.t === 'pct' && c.id !== 'pct');
  const frozenLeft = () => { const out = {}; let x = 0; cols().forEach((c, i) => { if (i < S.layout.freeze) { out[c.id] = x; x += W(c); } }); return out; };

  let cur = { row: -1, col: 'pct' };
  let editor = null;
  let lastDown = null;
  let drag = null;

  /* ---------------- header ---------------- */
  function sortOf(id) { const s = Array.isArray(S.sort) ? S.sort : [S.sort]; const k = s.findIndex((x) => x && x.key === id); return k < 0 ? null : { i: k, dir: s[k].dir }; }
  function renderHead() {
    const hd = $('#ghead');
    const fz = frozenLeft();
    const row = h('div', { class: 'hrow', style: { width: totalW() + 'px' } });
    cols().forEach((c, idx) => {
      const lbl = c.short != null ? c.short : c.label;
      const cell = h('div', { class: 'hcell' + (c.edit ? ' edit' : '') + (fz[c.id] != null ? ' fz' : '') + (idx === S.layout.freeze - 1 ? ' fzl' : ''), 'data-c': c.id, style: { width: W(c) + 'px', justifyContent: isRight(c) ? 'flex-end' : 'flex-start', left: fz[c.id] != null ? fz[c.id] + 'px' : null }, title: (c.label || 'Update flags') + (c.edit ? ' - editable' : '') + '\nClick: sort · Shift+click: add sort · Drag: move · Right-click: options' });
      cell.append(h('span', { class: 'hl', text: lbl }));
      const so = sortOf(c.id);
      if (so) cell.append(h('span', { class: 'sort', text: (so.dir === 'desc' ? '▼' : '▲') + ((Array.isArray(S.sort) && S.sort.length > 1) ? so.i + 1 : '') }));
      const rs = h('span', { class: 'rs' });
      rs.addEventListener('mousedown', (e) => {
        e.preventDefault(); e.stopPropagation();
        const x0 = e.clientX, w0 = W(c);
        const mv = (ev) => { S.layout.widths[c.id] = Math.max(28, w0 + ev.clientX - x0); render(); };
        const up = () => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); persist(); };
        document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
      });
      rs.addEventListener('dblclick', (e) => { e.stopPropagation(); autoWidth(c); });
      cell.append(rs);
      cell.addEventListener('mousedown', (e) => {
        if (e.button !== 0 || e.target === rs) return;
        drag = { id: c.id, x0: e.clientX, moved: false };
        const mv = (ev) => {
          if (!drag) return;
          if (Math.abs(ev.clientX - drag.x0) > 6) drag.moved = true;
          if (!drag.moved) return;
          const hrow = $('#ghead .hrow');
          const r = hrow.getBoundingClientRect();
          const x = ev.clientX - r.left;
          let acc = 0, at = cols().length;
          cols().forEach((cc, i) => { if (at === cols().length && x < acc + W(cc) / 2) at = i; acc += W(cc); });
          drag.at = at;
          let ind = $('#dragInd');
          if (!ind) { ind = h('div', { id: 'dragInd', class: 'dragind' }); $('#ghead').append(ind); }
          let px = 0; cols().forEach((cc, i) => { if (i < at) px += W(cc); });
          ind.style.left = (px - $('#ghead').scrollLeft) + 'px';
        };
        const up = (ev) => {
          document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up);
          const d = drag; drag = null;
          const ind = $('#dragInd'); if (ind) ind.remove();
          if (!d) return;
          if (!d.moved) { clickSort(c, ev.shiftKey); return; }
          const ids = S.layout.cols.slice();
          const from = ids.indexOf(d.id);
          let to = d.at;
          if (from < 0 || to == null) return;
          ids.splice(from, 1);
          if (to > from) to--;
          ids.splice(to, 0, d.id);
          S.layout.cols = ids; persist(); render(); UI.gantt.render();
        };
        document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
      });
      cell.addEventListener('contextmenu', (e) => { e.preventDefault(); headerMenu(e.clientX, e.clientY, c); });
      row.append(cell);
    });
    hd.innerHTML = '';
    hd.append(row);
  }
  function clickSort(c, add) {
    if (c.id === 'flag') return;
    let s = (Array.isArray(S.sort) ? S.sort : [S.sort]).filter(Boolean);
    const k = s.findIndex((x) => x.key === c.id);
    if (add) { if (k >= 0) s[k] = { key: c.id, dir: s[k].dir === 'asc' ? 'desc' : 'asc' }; else s.push({ key: c.id, dir: 'asc' }); }
    else s = [{ key: c.id, dir: k === 0 && s.length === 1 && s[0].dir === 'asc' ? 'desc' : 'asc' }];
    S.sort = s;
    const ss = $('#sortSel'); if (ss && Array.from(ss.options).some((o) => o.value === c.id)) ss.value = c.id;
    UI.refresh({ noSave: true });
  }
  function headerMenu(x, y, c) {
    const idx = S.layout.cols.indexOf(c.id);
    UI.menu(x, y, [
      c.id !== 'flag' ? { label: 'Sort ascending', run: () => { S.sort = [{ key: c.id, dir: 'asc' }]; UI.refresh({ noSave: true }); } } : null,
      c.id !== 'flag' ? { label: 'Sort descending', run: () => { S.sort = [{ key: c.id, dir: 'desc' }]; UI.refresh({ noSave: true }); } } : null,
      c.id !== 'flag' ? { label: 'Group by ' + (c.label || 'flags'), run: () => UI.setGroup(c.id === 'building' || c.id === 'epc' ? c.id : c.id) } : null,
      c.id !== 'flag' ? { label: 'Filter on ' + c.label + '…', run: () => UI.filtersUI.editor({ rules: [{ col: c.id, op: SE.filters.opsFor(c)[0][0], value: '' }] }) } : null,
      '-',
      { label: 'Insert columns…', run: () => columnsDialog(idx) },
      c.id !== 'code' ? { label: 'Hide this column', run: () => { S.layout.cols = S.layout.cols.filter((x) => x !== c.id); persist(); render(); } } : null,
      { label: 'Best fit width', run: () => autoWidth(c) },
      '-',
      { label: 'Freeze columns up to here', run: () => { S.layout.freeze = idx + 1; persist(); render(); } },
      S.layout.freeze ? { label: 'Unfreeze columns', run: () => { S.layout.freeze = 0; persist(); render(); } } : null,
      '-',
      { label: 'Columns…', run: () => columnsDialog() },
      { label: 'Reset column widths', run: () => { S.layout.widths = {}; persist(); render(); } }
    ]);
  }
  function autoWidth(c) {
    const cv = autoWidth.cv || (autoWidth.cv = document.createElement('canvas'));
    const ctx = cv.getContext('2d');
    ctx.font = '12.5px ' + (getComputedStyle(document.documentElement).getPropertyValue('--font-cond') || 'Arial');
    let w = ctx.measureText(c.short || c.label || '').width + 24;
    S.rows.slice(0, 400).forEach((r) => { if (r.kind !== 'act') return; w = Math.max(w, ctx.measureText(SE.columns.text ? plain(c, r) : '').width + 18); });
    S.layout.widths[c.id] = Math.min(520, Math.ceil(w) + (c.id === 'name' ? 30 : 0));
    persist(); render();
  }
  const plain = (c, r) => (c.ui ? '' : SE.columns.text(S.P, c, r.a, { flags: S.fl.map }));

  /* ---------------- cells ---------------- */
  function flagClass(f) {
    if (!S.colorRows || !f) return '';
    if (f.includes('invalid')) return ' t-invalid';
    if (f.includes('overdue')) return ' t-over';
    if (f.includes('lateStart')) return ' t-late';
    if (f.includes('future')) return ' t-future';
    return '';
  }
  const fmtD = (d, actual) => (d == null ? '' : D.fmt(d) + (actual ? '<span class="A">A</span>' : ''));
  const pbar = (p) => '<span class="pbar"><i><b style="width:' + Math.max(0, Math.min(100, p || 0)).toFixed(1) + '%"></b></i><span>' + Math.round(p || 0) + '%</span></span>';
  function cellHTML(c, row) {
    const P = S.P;
    if (row.kind === 'group') {
      const s = row.sum;
      if (c.id === 'code') return esc(row.code && row.code !== row.label ? row.code : '');
      if (c.id === 'name') return '<span style="padding-left:' + (row.level * 14) + 'px;display:flex;align-items:center;min-width:0"><button class="tg' + (row.collapsed ? ' shut' : '') + '" data-tg="' + esc(row.id) + '" aria-label="Expand or collapse">▼</button><span class="txt">' + esc(row.label) + '</span><span class="cnt">' + row.count + '</span></span>';
      if (!c.sum) return '';
      const v = c.sum(s, P);
      if (v == null) return '';
      if (c.id === 'pct') return pbar(v);
      if (c.t === 'date') return fmtD(v, (c.id === 'finish' && s.aFinish != null) || (c.id === 'start' && s.aStart != null && s.aStart === s.start));
      if (c.t === 'pct') return Math.round(v) + '%';
      if (c.t === 'num') return varOrNum(c, v);
      return esc(v);
    }
    const a = row.a;
    switch (c.id) {
      case 'flag': {
        const f = (S.fl.map.get(a.uid) || []).filter((k) => !['lookahead', 'openEnd', 'updated', 'due', 'inProgress'].includes(k));
        return '<span class="dots" title="' + esc(f.map((k) => SE.LENS_BY_KEY[k].label).join('\n')) + '">' + f.slice(0, 3).map((k) => '<i style="background:' + SE.LENS_BY_KEY[k].color + '"></i>').join('') + '</span>' + (a.touched ? '<span style="color:var(--good);margin-left:2px;font-size:11px" title="Updated this session">✔</span>' : '');
      }
      case 'name': return '<span class="txt' + (a.crit && a.status !== 'CO' ? ' crit-t' : '') + '" style="padding-left:' + (Math.max(0, row.level - (S.groupBy.length ? 1 : 0)) * 14 + (S.groupBy.length ? 16 : 0)) + 'px">' + (P.isMilestone(a) ? '◆ ' : '') + esc(a.name) + '</span>';
      case 'status': return '<span class="pill ' + a.status + '">' + SE.STATUS[a.status] + '</span>';
      case 'pct': return P.isMilestone(a) ? (a.status === 'CO' ? '100%' : '0%') : pbar(a.pct || 0);
      case 'qty': return a.qty && a.qty.scope ? esc(SE.columns.text(P, c, a)) : '<span style="color:var(--ink-3)">+ add</span>';
      case 'code': return esc(a.code);
      default: break;
    }
    const v = SE.columns.value(P, c, a, { flags: S.fl.map });
    if (v == null || v === '') return '';
    if (c.t === 'date') return (c.muted ? '<span style="color:var(--ink-3)">' : '') + fmtD(v, c.actual && c.actual(a)) + (c.muted ? '</span>' : '') + (c.id === 'start' && a.cstr && /MSO|MANDSTART/.test(a.cstr.type) ? '*' : '') + (c.id === 'finish' && a.cstr && /MEO|MANDFIN/.test(a.cstr.type) ? '*' : '');
    if (c.t === 'bool') return v ? '<span style="color:var(--bad);font-weight:700">✓</span>' : '';
    if (c.t === 'pct') return '<span class="' + (c.bad && c.bad(v) ? 'crit-t' : '') + '">' + (Math.round(v * 10) / 10) + '%</span>';
    if (c.t === 'num') return varOrNum(c, v);
    return esc(v);
  }
  function varOrNum(c, v) {
    const n = Math.round(v * 10) / 10;
    if (c.bad && c.bad(n)) return '<span class="crit-t">' + (n > 0 && c.id !== 'tf' ? '+' : '') + n + '</span>';
    if ((c.id === 'var' || c.id === 'movFinish') && n < 0) return '<span style="color:var(--good)">' + n + '</span>';
    return String(n);
  }

  function renderBody() {
    const body = $('#gbody');
    const rows = S.rows;
    const tw = totalW();
    $('#gspacer').style.height = (rows.length * RH + 40) + 'px';
    $('#gspacer').style.width = tw + 'px';
    const top = body.scrollTop, hgt = body.clientHeight || 600;
    const first = Math.max(0, Math.floor(top / RH) - 6);
    const last = Math.min(rows.length, Math.ceil((top + hgt) / RH) + 6);
    const cs = cols();
    const fz = frozenLeft();
    let html = '';
    for (let i = first; i < last; i++) {
      const r = rows[i];
      let cls = 'grow';
      if (r.kind === 'group') { cls += ' grp l' + Math.min(r.level, 4); if (cur.row === i) cls += ' gsel'; }
      else {
        const f = S.fl.map.get(r.a.uid);
        cls += flagClass(f);
        if (r.a.touched) cls += ' t-upd';
        if (S.sel === r.a.uid) cls += ' sel';
        else if (S.multi.has(r.a.uid)) cls += ' multi';
      }
      html += '<div class="' + cls + '" data-i="' + i + '" style="top:' + (i * RH) + 'px;width:' + tw + 'px">';
      cs.forEach((c, k) => {
        const ed = r.kind === 'act' && isEditable(c, r.a);
        const fzc = fz[c.id] != null;
        html += '<div class="gcell c-' + c.id.replace(/[^a-z0-9_-]/gi, '_') + (isRight(c) ? ' r' : '') + (ed ? ' ed' : '') + (fzc ? ' fz' : '') + (k === S.layout.freeze - 1 ? ' fzl' : '') + (cur.row === i && cur.col === c.id && r.kind === 'act' ? ' cur' : '') + '" data-c="' + esc(c.id) + '" style="width:' + W(c) + 'px' + (fzc ? ';left:' + fz[c.id] + 'px' : '') + '">' + cellHTML(c, r) + '</div>';
      });
      html += '</div>';
    }
    if (!rows.length && S.P) html = '<div class="gempty"><b>No activities match the current filters.</b><br>' + (UI.filtered() ? 'Building / EPC / Concerns only / filters are active. <button type="button" class="btn sm" data-clearf="1">Clear filters</button>' : '') + '</div>';
    $('#grows').innerHTML = html;
    const cf = $('#grows [data-clearf]'); if (cf) cf.onclick = () => UI.clearFilters();
    const cc = $('#grows .gcell.cur');
    if (cc) cc.style.boxShadow = 'inset 0 0 0 2px var(--accent)';
    $('#ghead').scrollLeft = body.scrollLeft;
  }
  function isEditable(c, a) {
    if (!c.edit) return false;
    const P = S.P;
    if (P.isSummaryType(a) && !['name', 'notes', 'code', 'building', 'epc'].includes(c.edit === 'text' ? c.id : c.edit)) return false;
    if (c.id === 'origDur') return a.status === 'NS' && !P.isMilestone(a);
    if (c.id === 'remDur' || c.id === 'expFinish') return a.status !== 'CO' && !P.isMilestone(a);
    if (c.id === 'pct') return !P.isMilestone(a) && a.status !== 'CO';
    if (c.id === 'qty') return !P.isMilestone(a);
    return true;
  }

  function render() {
    if (!S.P) return;
    renderHead();
    renderBody();
    positionEditor();
  }

  /* ---------------- editing ---------------- */
  function rowIndexOf(uid) { return S.rows.findIndex((r) => r.kind === 'act' && r.a.uid === uid); }
  function colLeft(id) { let x = 0; for (const c of cols()) { if (c.id === id) return x; x += W(c); } return -1; }
  function editValue(c, a) {
    if (c.edit === 'date') return c.id === 'expFinish' ? (a.eFinish != null && a.status !== 'CO' ? D.fmt(a.eFinish) : '') : D.fmt(a[c.id]);
    if (c.id === 'pct') return String(a.pct || 0);
    if (c.id === 'remDur') return String(a.remDur);
    if (c.id === 'origDur') return String(a.origDur);
    if (c.edit === 'code') return a.codes[c.codeType] || '';
    if (c.edit === 'building') return (a.dimOverride && a.dimOverride.building) || '';
    if (c.edit === 'epc') return (a.dimOverride && a.dimOverride.epc) || '';
    return a[c.id] || '';
  }
  function changesFor(c, a, v) {
    const P = S.P;
    const t = String(v == null ? '' : v).trim();
    if (c.edit === 'date') {
      if (c.id === 'expFinish') return t ? { expFinish: v } : null;
      return t !== D.fmt(a[c.id]) ? { [c.id]: v } : null;
    }
    if (c.id === 'pct' || c.id === 'remDur') return t !== String(c.id === 'pct' ? a.pct || 0 : a.remDur) ? { [c.id]: t } : null;
    if (c.id === 'origDur') { const n = parseFloat(t); if (!isFinite(n) || n < 0) return { __error: 'Original duration must be a number of days (0 or more).' }; return n !== a.origDur ? { origDur: n, remDur: n } : null; }
    if (c.id === 'name') return t && t !== a.name ? { name: t } : null;
    if (c.id === 'notes') return v !== (a.notes || '') ? { notes: v } : null;
    if (c.edit === 'building') { const o = Object.assign({}, a.dimOverride || {}); if (t) o.building = t; else delete o.building; return { dimOverride: o }; }
    if (c.edit === 'epc') {
      const m = SE.EPC.find((e) => e.toLowerCase().startsWith(t.toLowerCase().slice(0, 3))) || '';
      if (t && !m) return { __error: 'EPC phase must be Engineering, Procurement, Construction or Others.' };
      const o = Object.assign({}, a.dimOverride || {}); if (m) o.epc = m; else delete o.epc; return { dimOverride: o };
    }
    if (c.edit === 'code') {
      const ct = P.codeType(c.codeType);
      let code = t;
      if (t && ct) {
        const hit = ct.values.find((x) => x.code.toLowerCase() === t.toLowerCase() || (x.name || '').toLowerCase() === t.toLowerCase());
        if (hit) code = hit.code;
        else ct.values.push({ id: 'n' + Date.now().toString(36), code: t, name: t });
      }
      if (code === (a.codes[c.codeType] || '')) return null;
      const codes = Object.assign({}, a.codes);
      if (code) codes[c.codeType] = code; else delete codes[c.codeType];
      return { codes };
    }
    return null;
  }
  function startEdit(i, colId, initial) {
    const r = S.rows[i];
    if (!r || r.kind !== 'act') return;
    const c = COL(colId);
    if (!c) return;
    if (c.id === 'qty') { UI.panels.qtyDialog(r.a.uid); return; }
    if (!isEditable(c, r.a)) {
      if (c.edit) UI.toast(whyLocked(c, r.a), 'w', r.a.code);
      return;
    }
    closeEditor();
    cur = { row: i, col: colId };
    const a = r.a;
    let val = editValue(c, a);
    if (initial != null) val = initial;
    let listId = null;
    if (c.edit === 'code' || c.edit === 'building' || c.edit === 'epc') {
      listId = 'dl_ed_' + Date.now();
      const opts = c.edit === 'code' ? ((S.P.codeType(c.codeType) || { values: [] }).values.map((x) => [x.code, x.name])) : c.edit === 'epc' ? SE.EPC.map((e) => [e, '']) : Array.from(new Set(S.P.acts.map((x) => S.P.dim(x, 'building')))).map((b) => [b, '']);
      const dl = h('datalist', { id: listId }, opts.map(([v, l]) => h('option', { value: v, label: l && l !== v ? l : '' })));
      $('#gspacer').append(dl);
    }
    const inp = h('input', { class: 'editor', value: val, 'aria-label': c.label + ' for ' + a.code, autocomplete: 'off', list: listId });
    editor = { inp, i, colId, uid: a.uid, hint: null, listId };
    $('#gspacer').append(inp);
    if (c.edit === 'date') {
      const hint = h('div', { class: 'edhint' });
      editor.hint = hint;
      $('#gspacer').append(hint);
      const upd = () => {
        const v = inp.value.trim().toLowerCase();
        let msg = '';
        if (!v) msg = '<span>Blank = clear the date</span>';
        else if (v === 'p' || v === 'plan') msg = '<span class="ok">→ planned ' + D.fmt(colId === 'aStart' ? S.P.refStart(a) : S.P.refFinish(a)) + '</span>';
        else if (v === 'dd') msg = '<span class="ok">→ ' + D.fmt(S.P.meta.dataDate - 1) + ' (day before Data Date)</span>';
        else if (v === 't') msg = '<span class="ok">→ today ' + D.fmt(D.todayDay()) + '</span>';
        else { const p = D.parseDate(inp.value); msg = p ? '<span class="ok">→ ' + D.fmtLong(p.day) + ' (' + ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][D.parts(p.day).w] + ')</span>' : '<span class="no">Not a date yet…</span>'; }
        hint.innerHTML = '<div>' + msg + '</div>';
        const q = h('div', { class: 'q' });
        const ref = colId === 'aStart' ? S.P.refStart(a) : S.P.refFinish(a);
        const opts = [];
        if (colId !== 'expFinish' && ref != null && ref < S.P.meta.dataDate) opts.push(['Plan ' + D.fmt(ref), D.fmt(ref)]);
        if (colId !== 'expFinish') opts.push(['DD-1 ' + D.fmt(S.P.meta.dataDate - 1), D.fmt(S.P.meta.dataDate - 1)]);
        if (colId === 'expFinish') { const c2 = S.P.cal(a); [7, 14, 30].forEach((n) => opts.push(['+' + n + 'd', D.fmt(c2.add(c2.next(S.P.meta.dataDate), n))])); }
        opts.push(['Clear', '']);
        opts.forEach(([l, v2]) => q.append(h('button', { type: 'button', text: l, onmousedown: (e) => { e.preventDefault(); inp.value = v2; commit(); } })));
        hint.append(q);
      };
      inp.addEventListener('input', upd);
      upd();
    }
    positionEditor();
    inp.focus({ preventScroll: true });
    if (initial == null) inp.select();
    inp.addEventListener('keydown', (e) => {
      const st = inp.selectionStart, en = inp.selectionEnd, len = inp.value.length;
      const allSel = st === 0 && en === len;
      if (e.key === 'Enter') { e.preventDefault(); commit(e.shiftKey ? -1 : 1, 'down'); }
      else if (e.key === 'Tab') { e.preventDefault(); commit(e.shiftKey ? -1 : 1, 'right'); }
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); commit(e.key === 'ArrowDown' ? 1 : -1, 'down'); }
      else if (e.key === 'ArrowRight' && !e.shiftKey && (allSel || (st === len && en === len))) { e.preventDefault(); commit(1, 'right'); }
      else if (e.key === 'ArrowLeft' && !e.shiftKey && (allSel || (st === 0 && en === 0))) { e.preventDefault(); commit(-1, 'right'); }
      else if (e.key === 'Escape') { e.preventDefault(); closeEditor(); $('#gbody').focus(); }
      e.stopPropagation();
    });
    inp.addEventListener('blur', () => { setTimeout(() => { if (editor && editor.inp === inp && document.activeElement !== inp) commit(0); }, 150); });
  }
  function whyLocked(c, a) {
    if (a.status === 'CO' && (c.id === 'pct' || c.id === 'remDur' || c.id === 'expFinish')) return 'Completed activity. Clear the Actual Finish to re-open it.';
    if (S.P.isMilestone(a)) return 'Milestones take Actual Start / Actual Finish dates only.';
    if (c.id === 'origDur') return 'Original duration can only be changed before the activity starts.';
    return 'Not editable here.';
  }
  function positionEditor() {
    if (!editor) return;
    const i = rowIndexOf(editor.uid);
    if (i < 0) { closeEditor(); return; }
    editor.i = i;
    const x = colLeft(editor.colId);
    const w = W(COL(editor.colId));
    Object.assign(editor.inp.style, { left: x + 'px', top: (i * RH) + 'px', width: Math.max(w, 110) + 'px', height: RH + 'px' });
    if (editor.hint) Object.assign(editor.hint.style, { left: x + 'px', top: ((i + 1) * RH + 2) + 'px' });
  }
  function closeEditor() {
    if (!editor) return;
    const e = editor; editor = null;
    e.inp.remove(); if (e.hint) e.hint.remove();
    if (e.listId) { const dl = document.getElementById(e.listId); if (dl) dl.remove(); }
  }
  function commit(step, dir) {
    if (!editor) return;
    const e = editor;
    const a = S.P.act(e.uid);
    const c = COL(e.colId);
    const changes = changesFor(c, a, e.inp.value);
    if (changes && changes.__error) { UI.toast(changes.__error, 'e'); e.inp.classList.add('bad'); e.inp.focus(); return; }
    if (changes) {
      const r = UI.applyPatches([{ uid: a.uid, changes }], c.label + ' ' + a.code);
      if (r.errors.length) { e.inp.classList.add('bad'); e.inp.focus(); return; }
    }
    closeEditor();
    if (step) move(step, dir);
    if (!editor) $('#gbody').focus({ preventScroll: true });
  }
  function editableCols(a) { return cols().filter((c) => isEditable(c, a) && c.id !== 'qty').map((c) => c.id); }
  function move(step, dir) {
    if (dir === 'right') {
      const r = S.rows[cur.row];
      if (!r || r.kind !== 'act') return;
      const ec = editableCols(r.a);
      const k = ec.indexOf(cur.col) + step;
      if (k >= 0 && k < ec.length) { cur.col = ec[k]; startEdit(cur.row, cur.col); return; }
      let i = cur.row + step;
      while (i >= 0 && i < S.rows.length && S.rows[i].kind !== 'act') i += step;
      if (i < 0 || i >= S.rows.length) return;
      const ec2 = editableCols(S.rows[i].a);
      if (!ec2.length) return;
      select(S.rows[i].a.uid, i);
      startEdit(i, step > 0 ? ec2[0] : ec2[ec2.length - 1]);
      return;
    }
    let i = cur.row + step;
    if (dir === 'down') while (i >= 0 && i < S.rows.length && S.rows[i].kind !== 'act') i += step;
    if (i < 0 || i >= S.rows.length) return;
    if (S.rows[i].kind === 'group') { cur.row = i; S.sel = null; S.multi.clear(); ensureVisible(i); renderBody(); UI.gantt.render(); UI.panels.details(); return; }
    select(S.rows[i].a.uid, i);
    if (dir === 'down') startEdit(i, cur.col);
  }
  function select(uid, i, mode) {
    if (mode === 'toggle') { if (S.multi.has(uid)) S.multi.delete(uid); else S.multi.add(uid); if (S.sel) S.multi.add(S.sel); S.sel = uid; }
    else if (mode === 'range' && S.sel) {
      const a = rowIndexOf(S.sel), b = i;
      for (let k = Math.min(a, b); k <= Math.max(a, b); k++) if (S.rows[k].kind === 'act') S.multi.add(S.rows[k].a.uid);
      S.sel = uid;
    } else { S.multi.clear(); S.sel = uid; }
    cur.row = i != null ? i : rowIndexOf(uid);
    ensureVisible(cur.row);
    renderBody();
    UI.gantt.render();
    UI.panels.details();
  }
  function ensureVisible(i) {
    const b = $('#gbody');
    if (i < 0) return;
    const y = i * RH;
    if (y < b.scrollTop) b.scrollTop = y - RH;
    else if (y + RH > b.scrollTop + b.clientHeight) b.scrollTop = y - b.clientHeight + RH * 2;
  }
  function reveal(uid) {
    const a = S.P.act(uid);
    if (!a) return;
    if (rowIndexOf(uid) < 0) {
      if (!UI.passes(a)) UI.clearFilters();
      S.collapsed.clear(); S.noActs = false;
      UI.refresh({ noSave: true });
    }
    const i = rowIndexOf(uid);
    select(uid, i);
    const b = $('#gbody');
    b.scrollTop = Math.max(0, i * RH - b.clientHeight / 3);
    UI.gantt.scrollToDay(S.P.startOf(a) - 10);
  }

  /* ---------------- group rows (expand / collapse) ---------------- */
  function toggleGroup(id, open) {
    if (open === true) S.collapsed.delete(id);
    else if (open === false) S.collapsed.add(id);
    else if (S.collapsed.has(id)) S.collapsed.delete(id); else S.collapsed.add(id);
    UI.refresh({ noSave: true });
  }
  function descendantsOf(i) {
    const r = S.rows[i];
    const all = SE.views.groupLevels(S.P, UI.rowOpts()).all;
    const k = all.findIndex((x) => x.kind === 'group' && x.id === r.id);
    const out = [];
    for (let j = k + 1; j < all.length && !(all[j].kind === 'group' && all[j].level <= r.level); j++) if (all[j].kind === 'group') out.push(all[j].id);
    return out;
  }
  function groupMenu(x, y, i) {
    const r = S.rows[i];
    UI.menu(x, y, [
      { label: r.collapsed ? 'Expand' : 'Collapse', k: r.collapsed ? '+' : '−', run: () => toggleGroup(r.id) },
      { label: 'Expand all below', k: '*', run: () => { S.collapsed.delete(r.id); descendantsOf(i).forEach((d) => S.collapsed.delete(d)); S.noActs = false; UI.refresh({ noSave: true }); } },
      { label: 'Collapse all below', run: () => { descendantsOf(i).forEach((d) => S.collapsed.add(d)); UI.refresh({ noSave: true }); } },
      { label: 'Collapse to this level (' + (r.level + 1) + ')', run: () => UI.levels.to(r.level + 1) },
      '-',
      { label: 'Select all activities in this band', run: () => { const ids = bandActs(i); S.multi = new Set(ids); S.sel = ids[0] || null; renderBody(); UI.gantt.render(); UI.panels.details(); UI.toast(ids.length + ' activities selected - use Bulk update or Ctrl+D fill down.', 'i'); } },
      { label: 'Show only this band', run: () => { S.uidFilter = { label: r.label, uids: new Set(bandActs(i)) }; UI.refresh({ noSave: true }); } }
    ]);
  }
  function bandActs(i) {
    const r = S.rows[i];
    const all = SE.views.buildRows(S.P, Object.assign(UI.rowOpts(), { collapsed: new Set(), noActs: false }));
    const k = all.findIndex((x) => x.kind === 'group' && x.id === r.id);
    const out = [];
    for (let j = k + 1; j < all.length && !(all[j].kind === 'group' && all[j].level <= r.level); j++) if (all[j].kind === 'act') out.push(all[j].a.uid);
    return out;
  }

  /* ---------------- fill down / copy / paste ---------------- */
  function orderedSelection() {
    const ids = new Set(S.multi.size ? S.multi : S.sel ? [S.sel] : []);
    return S.rows.filter((r) => r.kind === 'act' && ids.has(r.a.uid)).map((r) => r.a);
  }
  function fillDown() {
    const list = orderedSelection();
    const c = COL(cur.col);
    if (list.length < 2 || !c || !c.edit || c.id === 'qty') { UI.toast('Select two or more rows (Ctrl/Shift+click) and put the cursor in an editable column, then Ctrl+D copies the top value down.', 'i'); return; }
    const v = editValue(c, list[0]);
    const patches = [];
    let err = null;
    list.slice(1).forEach((a) => { if (!isEditable(c, a)) return; const ch = changesFor(c, a, v); if (ch && ch.__error) err = ch.__error; else if (ch) patches.push({ uid: a.uid, changes: ch }); });
    if (err) { UI.toast(err, 'e'); return; }
    if (!patches.length) { UI.toast('Nothing to fill.', 'i'); return; }
    const r = UI.applyPatches(patches, 'Fill down ' + c.label, { quiet: true });
    UI.toast(r.applied + ' filled with "' + v + '"' + (r.errors.length ? ', ' + r.errors.length + ' rejected' : '') + '.', r.errors.length ? 'w' : 'g', 'Fill down');
  }
  function copyRows() {
    const list = orderedSelection();
    const rows = list.length ? S.rows.filter((r) => r.kind === 'act' && list.includes(r.a)) : S.rows;
    const cs = cols().filter((c) => !c.ui);
    const lines = [cs.map((c) => c.label).join('\t')];
    rows.forEach((r) => {
      if (r.kind === 'group') lines.push([''].concat([('  '.repeat(r.level)) + r.label]).concat(cs.slice(2).map(() => '')).join('\t'));
      else lines.push(cs.map((c) => SE.columns.text(S.P, c, r.a, { flags: S.fl.map }).replace(/[\t\n]/g, ' ')).join('\t'));
    });
    const txt = lines.join('\n');
    const done = () => UI.toast((rows.filter((r) => r.kind === 'act').length) + ' rows copied with ' + cs.length + ' columns - paste into Excel.', 'g');
    try { navigator.clipboard.writeText(txt).then(done, () => fallbackCopy(txt, done)); } catch (e) { fallbackCopy(txt, done); }
  }
  function fallbackCopy(txt, done) {
    const ta = h('textarea', { style: { position: 'fixed', left: '-9999px' } });
    ta.value = txt; document.body.append(ta); ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { UI.toast('Copy is blocked by the browser.', 'e'); }
    ta.remove();
  }
  function paste(text) {
    const r0 = S.rows[cur.row];
    if (!r0 || r0.kind !== 'act') { UI.toast('Click the first cell to paste into, then press Ctrl+V.', 'i'); return; }
    const grid = text.replace(/\r/g, '').split('\n').filter((l, i, arr) => l.length || i < arr.length - 1).map((l) => l.split('\t'));
    if (!grid.length) return;
    const cs = cols();
    const c0 = cs.findIndex((c) => c.id === cur.col);
    const acts = [];
    for (let i = cur.row; i < S.rows.length && acts.length < grid.length; i++) if (S.rows[i].kind === 'act') acts.push(S.rows[i].a);
    const patches = [];
    let skipped = 0;
    grid.forEach((vals, i) => {
      const a = acts[i]; if (!a) return;
      const ch = {};
      vals.forEach((v, j) => {
        const c = cs[c0 + j];
        if (!c || !isEditable(c, a) || c.id === 'qty') { if (v !== '') skipped++; return; }
        const x = changesFor(c, a, v);
        if (x && !x.__error) Object.assign(ch, x); else if (x) skipped++;
      });
      if (Object.keys(ch).length) patches.push({ uid: a.uid, changes: ch });
    });
    if (!patches.length) { UI.toast('Nothing pasted: the target columns are not editable here.', 'w'); return; }
    const r = UI.applyPatches(patches, 'Paste ' + patches.length + ' rows', { quiet: true });
    UI.toast(r.applied + ' activities updated from the clipboard' + (r.errors.length ? ', ' + r.errors.length + ' rejected (' + r.errors[0].code + ': ' + r.errors[0].msg + ')' : '') + (skipped ? ', ' + skipped + ' cells skipped (not editable)' : '') + '.', r.errors.length || skipped ? 'w' : 'g', 'Paste');
  }

  /* ---------------- events ---------------- */
  function bind() {
    const body = $('#gbody');
    let syncing = false;
    body.addEventListener('scroll', () => {
      $('#ghead').scrollLeft = body.scrollLeft;
      if (!syncing) { syncing = true; $('#ganttBody').scrollTop = body.scrollTop; syncing = false; }
      renderBody(); positionEditor();
      UI.gantt.render();
    }, { passive: true });
    $('#ganttBody').addEventListener('scroll', () => {
      if (!syncing) { syncing = true; body.scrollTop = $('#ganttBody').scrollTop; syncing = false; }
    }, { passive: true });
    body.addEventListener('mousedown', (e) => {
      if (e.target.classList.contains('editor') || e.target.closest('.edhint')) return;
      const rowEl = e.target.closest('.grow');
      if (!rowEl) return;
      const i = +rowEl.dataset.i;
      const r = S.rows[i];
      if (r.kind === 'group') {
        if (e.target.dataset.tg || e.target.closest('[data-tg]')) {
          if (e.ctrlKey || e.metaKey) { const open = r.collapsed; S.collapsed[open ? 'delete' : 'add'](r.id); descendantsOf(i).forEach((d) => S.collapsed[open ? 'delete' : 'add'](d)); UI.refresh({ noSave: true }); }
          else toggleGroup(r.id);
          return;
        }
        cur.row = i; S.sel = null; S.multi.clear();
        renderBody(); UI.gantt.render(); UI.panels.details();
        return;
      }
      const cell = e.target.closest('.gcell');
      const col = cell ? cell.dataset.c : cur.col;
      const now = Date.now();
      const dbl = lastDown && now - lastDown.t < 450 && lastDown.uid === r.a.uid && lastDown.col === col;
      lastDown = { t: now, uid: r.a.uid, col };
      cur.col = col;
      if (dbl && !e.ctrlKey && !e.shiftKey && !e.metaKey) { e.preventDefault(); lastDown = null; startEdit(i, col); return; }
      if (S.sel === r.a.uid && !S.multi.size && !e.ctrlKey && !e.shiftKey && !e.metaKey) { cur.row = i; renderBody(); return; }
      select(r.a.uid, i, e.ctrlKey || e.metaKey ? 'toggle' : e.shiftKey ? 'range' : null);
    });
    body.addEventListener('dblclick', (e) => {
      const rowEl = e.target.closest('.grow');
      if (!rowEl) return;
      const i = +rowEl.dataset.i;
      if (S.rows[i] && S.rows[i].kind === 'group' && !e.target.closest('[data-tg]')) toggleGroup(S.rows[i].id);
    });
    body.addEventListener('click', (e) => {
      const cell = e.target.closest('.gcell.c-qty');
      if (cell) { const i = +cell.parentElement.dataset.i; if (S.rows[i].kind === 'act') UI.panels.qtyDialog(S.rows[i].a.uid); }
    });
    body.addEventListener('contextmenu', (e) => {
      const rowEl = e.target.closest('.grow');
      if (!rowEl) return;
      const i = +rowEl.dataset.i;
      const r = S.rows[i];
      e.preventDefault();
      if (r.kind === 'group') { cur.row = i; renderBody(); groupMenu(e.clientX, e.clientY, i); return; }
      if (!S.multi.has(r.a.uid) && S.sel !== r.a.uid) select(r.a.uid, i);
      UI.panels.contextMenu(e.clientX, e.clientY, r.a);
    });
    body.addEventListener('keydown', (e) => {
      if (editor || !S.P) return;
      const k = e.key;
      const r = S.rows[cur.row];
      if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'd') { e.preventDefault(); fillDown(); return; }
      if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'c') { e.preventDefault(); copyRows(); return; }
      if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'a') { e.preventDefault(); S.multi = new Set(S.rows.filter((x) => x.kind === 'act').map((x) => x.a.uid)); renderBody(); UI.gantt.render(); UI.toast(S.multi.size + ' activities selected.', 'i'); return; }
      if (r && r.kind === 'group') {
        if (k === '+' || k === 'ArrowRight' || (k === 'Enter' && r.collapsed)) { e.preventDefault(); toggleGroup(r.id, true); return; }
        if (k === '-' || k === 'ArrowLeft' || (k === 'Enter' && !r.collapsed)) { e.preventDefault(); toggleGroup(r.id, false); return; }
        if (k === '*') { e.preventDefault(); S.collapsed.delete(r.id); descendantsOf(cur.row).forEach((d) => S.collapsed.delete(d)); UI.refresh({ noSave: true }); return; }
      }
      if (k === 'ArrowDown' || k === 'ArrowUp') { e.preventDefault(); move(k === 'ArrowDown' ? 1 : -1); }
      else if (k === 'ArrowRight' || k === 'ArrowLeft') {
        e.preventDefault();
        const ids = cols().map((c) => c.id);
        const n = Math.max(0, Math.min(ids.length - 1, ids.indexOf(cur.col) + (k === 'ArrowRight' ? 1 : -1)));
        cur.col = ids[n]; renderBody();
      } else if ((k === 'Enter' || k === 'F2') && r && r.kind === 'act') { e.preventDefault(); const c = COL(cur.col); startEdit(cur.row, c && c.edit ? cur.col : 'pct'); }
      else if (k === 'Escape') { S.multi.clear(); renderBody(); }
      else if (k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && r && r.kind === 'act') { const c = COL(cur.col); if (c && c.edit && c.id !== 'qty') { e.preventDefault(); startEdit(cur.row, cur.col, k); } }
    });
    body.addEventListener('paste', (e) => {
      if (editor || !S.P) return;
      const t = e.clipboardData && e.clipboardData.getData('text/plain');
      if (!t) return;
      e.preventDefault();
      paste(t);
    });
    const sp = $('#splitter');
    sp.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const split = $('#split');
      const r = split.getBoundingClientRect();
      const mv = (ev) => { const p = Math.max(15, Math.min(85, (ev.clientX - r.left) / r.width * 100)); split.style.setProperty('--grid-w', p + '%'); UI.gantt.render(true); };
      const up = () => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); try { localStorage.setItem('se.split', split.style.getPropertyValue('--grid-w')); } catch (er) { /* ignore */ } };
      document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
    });
    try { const v = localStorage.getItem('se.split'); if (v) $('#split').style.setProperty('--grid-w', v); } catch (e) { /* ignore */ }
  }

  /* ---------------- P6 "Columns" dialog ---------------- */
  function columnsDialog(insertAt) {
    const all = SE.columns.list(S.P);
    let sel = S.layout.cols.slice();
    const search = h('input', { class: 'inp', id: 'cd_q', placeholder: 'Search columns…' });
    const avail = h('div', { class: 'cdlist', role: 'listbox', 'aria-label': 'Available columns' });
    const chosen = h('div', { class: 'cdlist', role: 'listbox', 'aria-label': 'Selected columns' });
    let pickA = new Set(), pickS = null;
    const drawA = () => {
      const q = search.value.toLowerCase();
      avail.innerHTML = '';
      SE.columns.CATS.forEach((cat) => {
        const items = all.filter((c) => c.cat === cat && !sel.includes(c.id) && (!q || (c.label + ' ' + c.cat).toLowerCase().includes(q)));
        if (!items.length) return;
        avail.append(h('div', { class: 'cdcat', text: cat + ' (' + items.length + ')' }));
        items.forEach((c) => {
          const it = h('div', { class: 'cditem' + (pickA.has(c.id) ? ' on' : ''), text: c.label + (c.edit ? '  ✎' : ''), title: c.cat, tabindex: 0 });
          it.onclick = (e) => { if (!(e.ctrlKey || e.metaKey)) pickA.clear(); if (pickA.has(c.id)) pickA.delete(c.id); else pickA.add(c.id); drawA(); };
          it.ondblclick = () => { add([c.id]); };
          avail.append(it);
        });
      });
    };
    const drawS = () => {
      chosen.innerHTML = '';
      sel.forEach((id, i) => {
        const c = id === 'flag' ? FLAG : SE.columns.get(S.P, id);
        if (!c) return;
        const it = h('div', { class: 'cditem' + (pickS === id ? ' on' : ''), tabindex: 0, html: esc(id === 'flag' ? 'Update flags (icons)' : c.label) + (i < S.layout.freeze ? ' <small>frozen</small>' : '') });
        it.onclick = () => { pickS = id; drawS(); };
        it.ondblclick = () => { if (id !== 'code') { sel = sel.filter((x) => x !== id); pickS = null; drawS(); drawA(); } };
        chosen.append(it);
      });
    };
    const add = (ids) => {
      let at = insertAt != null ? insertAt + 1 : pickS ? sel.indexOf(pickS) + 1 : sel.length;
      ids.forEach((id) => { if (!sel.includes(id)) sel.splice(at++, 0, id); });
      pickA.clear(); drawA(); drawS();
    };
    search.oninput = drawA;
    const mv = (d) => { const i = sel.indexOf(pickS); if (i < 0) return; const j = Math.max(0, Math.min(sel.length - 1, i + d)); sel.splice(i, 1); sel.splice(j, 0, pickS); drawS(); };
    const freeze = h('input', { class: 'inp', id: 'cd_fz', type: 'number', min: 0, max: 6, value: S.layout.freeze, style: { width: '70px' } });
    const mid = h('div', { class: 'cdmid' },
      h('button', { class: 'btn', type: 'button', text: 'Add ›', onclick: () => add(Array.from(pickA)) }),
      h('button', { class: 'btn', type: 'button', text: '‹ Remove', onclick: () => { if (pickS && pickS !== 'code') { sel = sel.filter((x) => x !== pickS); pickS = null; drawS(); drawA(); } } }),
      h('button', { class: 'btn', type: 'button', text: 'Move up ↑', onclick: () => mv(-1) }),
      h('button', { class: 'btn', type: 'button', text: 'Move down ↓', onclick: () => mv(1) }));
    drawA(); drawS();
    UI.modal('Columns', h('div', null,
      h('p', { style: { marginTop: 0 }, text: 'Double-click to add or remove. ✎ = you can type into it in the grid. Activity codes, UDFs and WBS levels from your schedule are listed too.' }),
      h('div', { class: 'cdgrid' }, h('div', null, search, avail), mid, h('div', null, h('div', { class: 'sub', style: { marginBottom: '6px' }, text: 'Shown, left to right' }), chosen)),
      h('label', { style: { display: 'flex', gap: '8px', alignItems: 'center', marginTop: '10px' } }, 'Freeze the first', freeze, 'columns (they stay visible while scrolling right)')), [
      { label: 'Default columns', action: () => { sel = DEFAULT.slice(); drawS(); drawA(); return false; } },
      { spacer: true },
      { label: 'Cancel', value: null },
      { label: 'OK', cls: 'pri', action: () => { if (!sel.includes('code')) sel.unshift('code'); S.layout.cols = sel; S.layout.freeze = Math.max(0, Math.min(sel.length, +freeze.value || 0)); persist(); render(); UI.gantt.render(); return true; } }
    ], 'wide');
  }

  UI.grid = {
    render, renderBody, bind, select, reveal, columnsDialog, RH, startEdit, closeEditor, rowIndexOf, fillDown, copyRows, persist, DEFAULT,
    visibleIds: () => S.layout.cols.filter((x) => x !== 'flag'), cur: () => cur
  };
})();
