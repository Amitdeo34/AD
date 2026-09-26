/* Schedule Engine - ui/grid.js
 * Virtualised P6-style activity table with inline editing and validation.
 */
(function () {
  'use strict';
  const D = SE.D;
  const { S, h, $, esc } = UI;
  const RH = 26;

  const fmtD = (d, actual) => (d == null ? '' : D.fmt(d) + (actual ? '<span class="A">A</span>' : ''));
  const COLS = [
    { id: 'flag', label: '', w: 34, title: 'Update flags' },
    { id: 'code', label: 'Activity ID', w: 116, sort: 'code' },
    { id: 'name', label: 'Activity Name', w: 290, sort: 'name', edit: 'text' },
    { id: 'building', label: 'Building', w: 130 },
    { id: 'epc', label: 'EPC', w: 96 },
    { id: 'status', label: 'Status', w: 88, sort: 'status' },
    { id: 'origDur', label: 'Orig Dur', w: 54, r: true, sort: 'origDur', edit: 'num' },
    { id: 'remDur', label: 'Rem Dur', w: 54, r: true, sort: 'remDur', edit: 'num' },
    { id: 'prevPct', label: 'Last %', w: 50, r: true, title: '% complete at the last update' },
    { id: 'pct', label: '% Complete', w: 84, sort: 'pct', edit: 'num' },
    { id: 'start', label: 'Start', w: 84, sort: 'start' },
    { id: 'finish', label: 'Finish', w: 84, sort: 'finish' },
    { id: 'aStart', label: 'Actual Start', w: 88, edit: 'date' },
    { id: 'aFinish', label: 'Actual Finish', w: 88, edit: 'date' },
    { id: 'expFinish', label: 'Expected Finish', w: 92, edit: 'date', title: 'Type the date you expect it to finish; remaining duration is calculated' },
    { id: 'blStart', label: 'BL Start', w: 80 },
    { id: 'blFinish', label: 'BL Finish', w: 80 },
    { id: 'var', label: 'Finish Var', w: 60, r: true, title: 'Working days between baseline finish and current finish (+ = late)' },
    { id: 'tf', label: 'Total Float', w: 58, r: true, sort: 'tf' },
    { id: 'ff', label: 'Free Float', w: 56, r: true },
    { id: 'qty', label: 'Qty done / scope', w: 110, title: 'Quantity calculator (click)' },
    { id: 'notes', label: 'Remarks', w: 200, edit: 'text' }
  ];
  const COL = {};
  COLS.forEach((c) => { COL[c.id] = c; });
  const DEFAULT = ['flag', 'code', 'name', 'status', 'origDur', 'remDur', 'prevPct', 'pct', 'start', 'finish', 'aStart', 'aFinish', 'tf', 'notes'];
  let visible = DEFAULT.slice();
  const widths = {};
  try {
    const v = JSON.parse(localStorage.getItem('se.cols') || 'null'); if (Array.isArray(v) && v.length) visible = v.filter((x) => COL[x]);
    Object.assign(widths, JSON.parse(localStorage.getItem('se.colw') || '{}'));
  } catch (e) { /* ignore */ }
  const W = (c) => widths[c.id] || c.w;
  const persist = () => { try { localStorage.setItem('se.cols', JSON.stringify(visible)); localStorage.setItem('se.colw', JSON.stringify(widths)); } catch (e) { /* ignore */ } };
  const cols = () => visible.map((id) => COL[id]);
  const totalW = () => cols().reduce((s, c) => s + W(c), 0);

  let cur = { row: -1, col: 'pct' };
  let editor = null;
  let lastDown = null;

  function renderHead() {
    const hd = $('#ghead');
    const row = h('div', { class: 'hrow', style: { width: totalW() + 'px' } });
    for (const c of cols()) {
      const cell = h('div', { class: 'hcell' + (c.edit ? ' edit' : ''), style: { width: W(c) + 'px', justifyContent: c.r ? 'flex-end' : 'flex-start' }, title: c.title || (c.edit ? c.label + ' - editable' : c.label) });
      cell.append(document.createTextNode(c.label));
      if (c.sort && S.sort.key === c.sort) cell.append(h('span', { class: 'sort', text: S.sort.dir === 'asc' ? '▲' : '▼' }));
      if (c.sort) cell.addEventListener('click', (e) => {
        if (e.target.classList.contains('rs')) return;
        S.sort = { key: c.sort, dir: S.sort.key === c.sort && S.sort.dir === 'asc' ? 'desc' : 'asc' };
        const ss = $('#sortSel'); if (ss) ss.value = c.sort;
        UI.refresh({ noSave: true });
      });
      const rs = h('span', { class: 'rs' });
      rs.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const x0 = e.clientX, w0 = W(c);
        const mv = (ev) => { widths[c.id] = Math.max(30, w0 + ev.clientX - x0); render(); };
        const up = () => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); persist(); };
        document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
      });
      cell.append(rs);
      row.append(cell);
    }
    hd.innerHTML = '';
    hd.append(row);
  }

  function flagClass(f) {
    if (!S.colorRows || !f) return '';
    if (f.includes('invalid')) return ' t-invalid';
    if (f.includes('overdue')) return ' t-over';
    if (f.includes('lateStart')) return ' t-late';
    if (f.includes('future')) return ' t-future';
    return '';
  }
  function cellHTML(c, row) {
    const P = S.P;
    if (row.kind === 'group') {
      const s = row.sum;
      switch (c.id) {
        case 'code': return esc(row.code && row.code !== row.label ? row.code : '');
        case 'name': return '<span style="padding-left:' + (row.level * 14) + 'px;display:flex;align-items:center;min-width:0"><button class="tg' + (row.collapsed ? ' shut' : '') + '" data-tg="' + esc(row.id) + '" aria-label="Expand or collapse">▼</button><span class="txt">' + esc(row.label) + '</span><span class="cnt">' + row.count + '</span></span>';
        case 'status': return esc(SE.STATUS[s.status]);
        case 'origDur': return s.origDur || '';
        case 'pct': return pbar(s.pct);
        case 'start': return fmtD(s.start, s.aStart != null && s.aStart === s.start);
        case 'finish': return fmtD(s.finish, s.aFinish != null);
        case 'aStart': return fmtD(s.aStart);
        case 'aFinish': return fmtD(s.aFinish);
        case 'blStart': return fmtD(s.blStart);
        case 'blFinish': return fmtD(s.blFinish);
        case 'var': return s.blFinish != null && s.finish != null ? varTxt(P.cal(null).between(s.blFinish, s.finish)) : '';
        case 'tf': return s.tf != null ? Math.round(s.tf) : '';
        default: return '';
      }
    }
    const a = row.a;
    switch (c.id) {
      case 'flag': {
        const f = (S.fl.map.get(a.uid) || []).filter((k) => !['lookahead', 'openEnd', 'updated', 'due', 'inProgress'].includes(k));
        return '<span class="dots" title="' + esc(f.map((k) => SE.LENS_BY_KEY[k].label).join('\n')) + '">' + f.slice(0, 3).map((k) => '<i style="background:' + SE.LENS_BY_KEY[k].color + '"></i>').join('') + '</span>' + (a.touched ? '<span style="color:var(--good);margin-left:2px;font-size:11px" title="Updated this session">✔</span>' : '');
      }
      case 'code': return esc(a.code);
      case 'name': return '<span class="txt' + (a.crit && a.status !== 'CO' ? ' crit-t' : '') + '" style="padding-left:' + (Math.max(0, row.level - (S.groupBy.length ? 1 : 0)) * 14 + (S.groupBy.length ? 16 : 0)) + 'px">' + (P.isMilestone(a) ? '◆ ' : '') + esc(a.name) + '</span>';
      case 'building': return esc(P.dim(a, 'building'));
      case 'epc': return esc(P.dim(a, 'epc'));
      case 'status': return '<span class="pill ' + a.status + '">' + SE.STATUS[a.status] + '</span>';
      case 'origDur': return P.isMilestone(a) ? '0' : fmtN(a.origDur);
      case 'remDur': return a.status === 'CO' ? '0' : fmtN(a.remDur);
      case 'prevPct': return a.prev ? Math.round(a.prev.status === 'CO' ? 100 : a.prev.pct || 0) + '%' : '';
      case 'pct': return P.isMilestone(a) ? (a.status === 'CO' ? '100%' : '0%') : pbar(a.pct || 0);
      case 'start': return fmtD(P.startOf(a), a.aStart != null) + (a.cstr && /MSO|MANDSTART/.test(a.cstr.type) ? '*' : '');
      case 'finish': return fmtD(P.finishOf(a), a.aFinish != null) + (a.cstr && /MEO|MANDFIN/.test(a.cstr.type) ? '*' : '');
      case 'aStart': return fmtD(a.aStart);
      case 'aFinish': return fmtD(a.aFinish);
      case 'expFinish': return a.status === 'CO' ? '' : '<span style="color:var(--ink-3)">' + fmtD(a.eFinish) + '</span>';
      case 'blStart': return fmtD(a.bl && a.bl.start);
      case 'blFinish': return fmtD(a.bl && a.bl.finish);
      case 'var': { const f = P.finishOf(a); return a.bl && a.bl.finish != null && f != null ? varTxt(P.cal(a).between(a.bl.finish, f)) : ''; }
      case 'tf': return a.status === 'CO' || a.tf == null ? '' : '<span class="' + (a.tf < 0 ? 'crit-t' : '') + '">' + fmtN(a.tf) + '</span>';
      case 'ff': return a.status === 'CO' || a.ff == null ? '' : fmtN(a.ff);
      case 'qty': return a.qty && a.qty.scope ? fmtN(a.qty.done || 0) + ' / ' + fmtN(a.qty.scope) + ' ' + esc(a.qty.unit || '') : '<span style="color:var(--ink-3)">+ add</span>';
      case 'notes': return esc(a.notes || '');
      default: return '';
    }
  }
  const fmtN = (n) => (n == null ? '' : Math.round(n * 10) / 10);
  const varTxt = (v) => (v > 0 ? '<span class="crit-t">+' + v + '</span>' : v < 0 ? '<span style="color:var(--good)">' + v + '</span>' : '0');
  const pbar = (p) => '<span class="pbar"><i><b style="width:' + Math.max(0, Math.min(100, p)).toFixed(1) + '%"></b></i><span>' + Math.round(p) + '%</span></span>';

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
    let html = '';
    for (let i = first; i < last; i++) {
      const r = rows[i];
      let cls = 'grow';
      if (r.kind === 'group') cls += ' grp l' + Math.min(r.level, 4);
      else {
        const f = S.fl.map.get(r.a.uid);
        cls += flagClass(f);
        if (r.a.touched) cls += ' t-upd';
        if (S.sel === r.a.uid) cls += ' sel';
        else if (S.multi.has(r.a.uid)) cls += ' multi';
      }
      html += '<div class="' + cls + '" data-i="' + i + '" style="top:' + (i * RH) + 'px;width:' + tw + 'px">';
      for (const c of cs) {
        const ed = r.kind === 'act' && isEditable(c, r.a);
        html += '<div class="gcell c-' + c.id + (c.r ? ' r' : '') + (ed ? ' ed' : '') + (cur.row === i && cur.col === c.id && r.kind === 'act' ? ' cur' : '') + '" data-c="' + c.id + '" style="width:' + W(c) + 'px">' + cellHTML(c, r) + '</div>';
      }
      html += '</div>';
    }
    $('#grows').innerHTML = html;
    const cc = $('#grows .gcell.cur');
    if (cc) cc.style.boxShadow = 'inset 0 0 0 2px var(--accent)';
    $('#ghead').scrollLeft = body.scrollLeft;
  }
  function isEditable(c, a) {
    if (!c.edit) return false;
    const P = S.P;
    if (P.isSummaryType(a) && c.id !== 'name' && c.id !== 'notes') return false;
    if (c.id === 'origDur') return a.status === 'NS' && !P.isMilestone(a);
    if (c.id === 'remDur' || c.id === 'expFinish') return a.status !== 'CO' && !P.isMilestone(a);
    if (c.id === 'pct') return !P.isMilestone(a) && a.status !== 'CO';
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
  function startEdit(i, colId, initial) {
    const r = S.rows[i];
    if (!r || r.kind !== 'act') return;
    const c = COL[colId];
    if (c.id === 'qty') { UI.panels.qtyDialog(r.a.uid); return; }
    if (!isEditable(c, r.a)) {
      if (c.edit) UI.toast(whyLocked(c, r.a), 'w', r.a.code);
      return;
    }
    closeEditor();
    cur = { row: i, col: colId };
    const a = r.a;
    let val = '';
    if (c.edit === 'date') val = colId === 'expFinish' ? (a.eFinish != null ? D.fmt(a.eFinish) : '') : D.fmt(a[colId]);
    else if (colId === 'pct') val = String(a.pct || 0);
    else if (colId === 'remDur') val = String(a.remDur);
    else if (colId === 'origDur') val = String(a.origDur);
    else val = a[colId] || '';
    if (initial != null) val = initial;
    const inp = h('input', { class: 'editor', value: val, 'aria-label': c.label + ' for ' + a.code, autocomplete: 'off' });
    editor = { inp, i, colId, uid: a.uid, hint: null };
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
      if (e.key === 'Enter') { e.preventDefault(); commit(e.shiftKey ? -1 : 1, 'down'); }
      else if (e.key === 'Tab') { e.preventDefault(); commit(e.shiftKey ? -1 : 1, 'right'); }
      else if (e.key === 'Escape') { e.preventDefault(); closeEditor(); $('#gbody').focus(); }
      e.stopPropagation();
    });
    inp.addEventListener('blur', () => { setTimeout(() => { if (editor && editor.inp === inp && document.activeElement !== inp) commit(0); }, 120); });
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
    const w = W(COL[editor.colId]);
    Object.assign(editor.inp.style, { left: x + 'px', top: (i * RH) + 'px', width: Math.max(w, 90) + 'px', height: RH + 'px' });
    if (editor.hint) Object.assign(editor.hint.style, { left: x + 'px', top: ((i + 1) * RH + 2) + 'px' });
  }
  function closeEditor() {
    if (!editor) return;
    const e = editor; editor = null;
    e.inp.remove(); if (e.hint) e.hint.remove();
  }
  function commit(step, dir) {
    if (!editor) return;
    const e = editor;
    const a = S.P.act(e.uid);
    const v = e.inp.value;
    let changes = null;
    const c = COL[e.colId];
    if (c.edit === 'date') {
      const old = e.colId === 'expFinish' ? (a.eFinish != null ? D.fmt(a.eFinish) : '') : D.fmt(a[e.colId]);
      if (v.trim() !== old) changes = { [e.colId]: v.trim() === '' && e.colId === 'expFinish' ? null : v };
      if (e.colId === 'expFinish' && v.trim() === '') changes = null;
    } else if (e.colId === 'pct' || e.colId === 'remDur') {
      if (String(v).trim() !== String(e.colId === 'pct' ? a.pct || 0 : a.remDur)) changes = { [e.colId]: v };
    } else if (e.colId === 'origDur') {
      const n = parseFloat(v);
      if (!isFinite(n) || n < 0) { UI.toast('Original duration must be a number of days (0 or more).', 'e'); e.inp.classList.add('bad'); e.inp.focus(); return; }
      if (n !== a.origDur) changes = { origDur: n, remDur: n };
    } else if (e.colId === 'name') { if (v.trim() && v !== a.name) changes = { name: v.trim() }; }
    else if (e.colId === 'notes') { if (v !== (a.notes || '')) changes = { notes: v }; }
    if (changes) {
      const r = UI.applyPatches([{ uid: a.uid, changes }], c.label + ' ' + a.code);
      if (r.errors.length) { e.inp.classList.add('bad'); e.inp.focus(); return; }
    }
    closeEditor();
    if (step) move(step, dir);
    $('#gbody').focus({ preventScroll: true });
  }
  function editableCols(a) { return cols().filter((c) => isEditable(c, a)).map((c) => c.id); }
  function move(step, dir) {
    if (dir === 'right') {
      const r = S.rows[cur.row];
      if (!r || r.kind !== 'act') return;
      const ec = editableCols(r.a);
      let k = ec.indexOf(cur.col) + step;
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
    while (i >= 0 && i < S.rows.length && S.rows[i].kind !== 'act') i += step;
    if (i < 0 || i >= S.rows.length) return;
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
    const sb = $('#statusbar b:nth-of-type(1)'); void sb;
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
    // make sure it is not filtered/collapsed
    if (rowIndexOf(uid) < 0) {
      if (!UI.passes(a)) UI.clearFilters();
      S.collapsed.clear();
      UI.refresh({ noSave: true });
    }
    const i = rowIndexOf(uid);
    select(uid, i);
    const b = $('#gbody');
    b.scrollTop = Math.max(0, i * RH - b.clientHeight / 3);
    UI.gantt.scrollToDay(S.P.startOf(a) - 10);
  }

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
          const id = r.id;
          if (S.collapsed.has(id)) S.collapsed.delete(id); else S.collapsed.add(id);
          UI.refresh({ noSave: true });
        }
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
      if (S.rows[i] && S.rows[i].kind === 'group' && !e.target.closest('[data-tg]')) { const id = S.rows[i].id; if (S.collapsed.has(id)) S.collapsed.delete(id); else S.collapsed.add(id); UI.refresh({ noSave: true }); }
    });
    body.addEventListener('click', (e) => {
      const cell = e.target.closest('.gcell.c-qty');
      if (cell) { const i = +cell.parentElement.dataset.i; if (S.rows[i].kind === 'act') UI.panels.qtyDialog(S.rows[i].a.uid); }
    });
    body.addEventListener('contextmenu', (e) => {
      const rowEl = e.target.closest('.grow');
      if (!rowEl) return;
      const r = S.rows[+rowEl.dataset.i];
      if (r.kind !== 'act') return;
      e.preventDefault();
      if (!S.multi.has(r.a.uid) && S.sel !== r.a.uid) select(r.a.uid, +rowEl.dataset.i);
      UI.panels.contextMenu(e.clientX, e.clientY, r.a);
    });
    body.addEventListener('keydown', (e) => {
      if (editor) return;
      if (!S.P) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); move(e.key === 'ArrowDown' ? 1 : -1); }
      else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const ids = cols().map((c) => c.id);
        const k = Math.max(0, Math.min(ids.length - 1, ids.indexOf(cur.col) + (e.key === 'ArrowRight' ? 1 : -1)));
        cur.col = ids[k]; renderBody();
      } else if ((e.key === 'Enter' || e.key === 'F2') && cur.row >= 0) { e.preventDefault(); startEdit(cur.row, COL[cur.col].edit ? cur.col : 'pct'); }
      else if (e.key === 'Escape') { S.multi.clear(); renderBody(); }
      else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && cur.row >= 0 && COL[cur.col] && COL[cur.col].edit) { e.preventDefault(); startEdit(cur.row, cur.col, e.key); }
    });
    // splitter
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

  function columnsDialog() {
    const body = h('div', { class: 'form' });
    COLS.forEach((c) => {
      if (c.id === 'flag' || c.id === 'code') return;
      const cb = h('input', { type: 'checkbox', id: 'col_' + c.id });
      cb.checked = visible.includes(c.id);
      body.append(h('label', { style: { display: 'flex', gap: '8px', alignItems: 'center' } }, cb, c.label + (c.edit ? ' ✎' : '')));
    });
    UI.modal('Columns', h('div', null, h('p', { style: { marginTop: 0 }, text: 'Choose the columns to show. ✎ = you can type into it.' }), body), [
      { label: 'Reset to default', action: () => { visible = DEFAULT.slice(); persist(); render(); return null; } },
      { spacer: true },
      { label: 'Apply', cls: 'pri', action: () => {
        visible = ['flag', 'code'].concat(COLS.filter((c) => c.id !== 'flag' && c.id !== 'code' && $('#col_' + c.id).checked).map((c) => c.id));
        persist(); render(); return true;
      } }
    ]);
  }

  UI.grid = { render, renderBody, bind, select, reveal, columnsDialog, RH, startEdit, closeEditor, rowIndexOf, COLS };
})();
