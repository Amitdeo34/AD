/* Schedule Engine - ui/app.js
 * UI state, helpers (DOM, toasts, modals, menus), ribbon, lens sidebar,
 * guided update steps, status bar and the main refresh loop.
 */
(function () {
  'use strict';
  const D = SE.D;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = SE.util.esc;

  /* ------------------------------------------------------------------ */
  const S = {
    P: null,
    fl: { map: new Map(), counts: {} },
    rows: [],
    groupBy: ['wbs'],
    groupKey: 'wbs',
    sort: { key: 'start', dir: 'asc' },
    collapsed: new Set(),
    lensSel: new Set(),
    dimSel: { building: new Set(), epc: new Set() },
    statusSel: new Set(),
    text: '',
    ask: null,           // {question, answer, uids:Set}
    uidFilter: null,     // {label, uids:Set}
    sel: null,
    multi: new Set(),
    view: 'gantt',
    zoom: 'month',
    showRels: false,
    showBaseline: true,
    colorRows: true,
    showLabels: true,
    detTab: 'status',
    dirty: false,
    savedAt: null
  };
  window.S = S;

  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k === 'text') e.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (const k of kids.flat()) if (k != null && k !== false) e.append(k.nodeType ? k : document.createTextNode(String(k)));
    return e;
  }

  const ICONS = {
    open: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
    demo: 'M12 3l1.8 4.6L18 9l-4.2 1.4L12 15l-1.8-4.6L6 9l4.2-1.4zM18 15l.9 2.1L21 18l-2.1.9L18 21l-.9-2.1L15 18l2.1-.9z',
    save: 'M5 3h11l3 3v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM7 3v5h8V3M7 21v-7h10v7',
    export: 'M12 3v12M7 10l5 5 5-5M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2',
    xer: 'M6 2h9l5 5v15H6zM14 2v6h6M9 13l4 5M13 13l-4 5M15 13v5h3',
    excel: 'M4 4h16v16H4zM4 9h16M4 14h16M10 4v16',
    pdf: 'M6 2h9l5 5v15H6zM14 2v6h6M9 17v-4h1.5a1.5 1.5 0 0 1 0 3H9M14 13v4h1a2 2 0 0 0 0-4z',
    html: 'M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16',
    importSheet: 'M4 4h10v6M4 4v16h16v-6M4 10h8M4 15h6M15 13l3-3 3 3M18 10v9',
    dd: 'M4 6h16v14H4zM4 10h16M8 3v5M16 3v5M12 13v5',
    run: 'M13 2 4 14h7l-1 8 9-12h-7z',
    wand: 'M4 20 16 8M14 4l1 2 2 1-2 1-1 2-1-2-2-1 2-1zM19 11l.7 1.3L21 13l-1.3.7L19 15l-.7-1.3L17 13l1.3-.7z',
    bulk: 'M12 3 3 8l9 5 9-5zM3 13l9 5 9-5M3 17l9 5 9-5',
    undo: 'M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3',
    redo: 'M15 14l5-5-5-5M20 9H9a5 5 0 0 0 0 10h3',
    easy: 'M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2',
    add: 'M12 5v14M5 12h14',
    del: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
    link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
    bars: 'M4 6h10M8 11h12M6 16h8M4 20h16',
    cols: 'M4 4h16v16H4zM9 4v16M15 4v16',
    expand: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
    collapse: 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5',
    fit: 'M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4',
    dash: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
    health: 'M3 12h4l2-5 4 10 2-5h6',
    changes: 'M12 7v5l3 2M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5',
    gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 2.9-1.2V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
    bulb: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z',
    qty: 'M4 4h16v16H4zM8 8h2M14 8h2M8 12h2M14 12h2M8 16h2M14 16h2',
    filter: 'M3 5h18l-7 8v6l-4 2v-8z',
    side: 'M4 4h16v16H4zM9 4v16'
  };
  function icon(name, cls) {
    return '<svg class="' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + (ICONS[name] || ICONS.add) + '"/></svg>';
  }

  /* ---------------- toasts / modals / menus ---------------- */
  function toast(msg, type, title, ms) {
    const t = h('div', { class: 'toast ' + (type || ''), role: 'status' });
    if (title) t.append(h('b', { text: title }));
    t.append(document.createTextNode(msg));
    $('#toasts').append(t);
    const all = $('#toasts').children;
    while (all.length > 3) all[0].remove();
    setTimeout(() => t.remove(), ms || (type === 'e' ? 7000 : 4200));
  }
  function modal(title, body, buttons, cls) {
    return new Promise((resolve) => {
      const bg = h('div', { class: 'modal-bg' });
      const close = (v) => { bg.remove(); document.removeEventListener('keydown', onKey, true); resolve(v); };
      const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(null); } };
      document.addEventListener('keydown', onKey, true);
      const foot = h('div', { class: 'mf' });
      (buttons || [{ label: 'Close', value: null }]).forEach((b) => {
        if (b.spacer) { foot.append(h('span', { class: 'sp' })); return; }
        const btn = h('button', { class: 'btn ' + (b.cls || ''), type: 'button', text: b.label });
        btn.onclick = async () => {
          if (b.action) { const r = await b.action(); if (r === false) return; close(r === undefined ? b.value : r); } else close(b.value);
        };
        foot.append(btn);
      });
      const m = h('div', { class: 'modal ' + (cls || ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
        h('div', { class: 'mh' }, h('h2', { text: title }), h('button', { 'aria-label': 'Close', onclick: () => close(null), html: '&times;' })),
        h('div', { class: 'mb' }, body),
        foot);
      bg.append(m);
      bg.addEventListener('mousedown', (e) => { if (e.target === bg) close(null); });
      document.body.append(bg);
      const f = m.querySelector('input,select,textarea,button.pri');
      if (f) setTimeout(() => f.focus(), 30);
    });
  }
  let menuEl = null;
  function menu(x, y, items) {
    closeMenu();
    menuEl = h('div', { class: 'menu', role: 'menu' });
    for (const it of items) {
      if (it === '-') { menuEl.append(h('hr')); continue; }
      if (!it) continue;
      const b = h('button', { role: 'menuitem', disabled: it.disabled }, it.label, it.k ? h('span', { class: 'k', text: it.k }) : null);
      b.onclick = () => { closeMenu(); it.run(); };
      menuEl.append(b);
    }
    document.body.append(menuEl);
    const r = menuEl.getBoundingClientRect();
    menuEl.style.left = Math.min(x, innerWidth - r.width - 8) + 'px';
    menuEl.style.top = Math.min(y, innerHeight - r.height - 8) + 'px';
    setTimeout(() => document.addEventListener('mousedown', closeOnOut, true), 0);
  }
  function closeOnOut(e) { if (menuEl && !menuEl.contains(e.target)) closeMenu(); }
  function closeMenu() { if (menuEl) { menuEl.remove(); menuEl = null; } document.removeEventListener('mousedown', closeOnOut, true); }
  function busy(on, text) {
    let b = $('#busy');
    if (!on) { if (b) b.remove(); return; }
    if (!b) { b = h('div', { class: 'busy', id: 'busy' }, h('div', null, h('span', { class: 'spin' }), h('span', { id: 'busyText' }))); document.body.append(b); }
    $('#busyText').textContent = text || 'Working…';
  }
  const tick = () => new Promise((r) => setTimeout(r, 20));

  /* ---------------- filtering & row model ---------------- */
  function computeFlags() { if (S.P) S.fl = SE.analysis.flagAll(S.P); }
  function passes(a) {
    const P = S.P;
    if (S.lensSel.size) { const f = S.fl.map.get(a.uid) || []; let ok = false; for (const k of S.lensSel) if (f.includes(k)) { ok = true; break; } if (!ok) return false; }
    if (S.dimSel.building.size && !S.dimSel.building.has(P.dim(a, 'building'))) return false;
    if (S.dimSel.epc.size && !S.dimSel.epc.has(P.dim(a, 'epc'))) return false;
    if (S.statusSel.size && !S.statusSel.has(a.status)) return false;
    if (S.ask && !S.ask.uids.has(a.uid)) return false;
    if (S.uidFilter && !S.uidFilter.uids.has(a.uid)) return false;
    if (S.text) { const t = (a.code + ' ' + a.name).toLowerCase(); if (t.indexOf(S.text) < 0) return false; }
    return true;
  }
  function filtered() { return !!(S.lensSel.size || S.dimSel.building.size || S.dimSel.epc.size || S.statusSel.size || S.ask || S.uidFilter || S.text); }
  function buildRows() {
    if (!S.P) { S.rows = []; return; }
    S.rows = SE.views.buildRows(S.P, { groupBy: S.groupBy, filter: passes, sort: S.sort, collapsed: S.collapsed, flags: S.fl.map });
  }

  /* ---------------- refresh ---------------- */
  let rafPending = false;
  function refresh(opts) {
    opts = opts || {};
    if (!S.P) return;
    computeFlags();
    buildRows();
    renderTop();
    renderSide();
    renderWizard();
    renderFilterbar();
    renderStatus();
    if (S.view === 'gantt') { UI.grid.render(); UI.gantt.render(); UI.panels.details(); }
    else UI.panels.renderView(S.view);
    if (!opts.noSave) UI.io.autosave();
  }
  function redrawSoon() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => { rafPending = false; if (S.view === 'gantt') { UI.grid.render(); UI.gantt.render(); } });
  }

  function renderTop() {
    const P = S.P;
    $('#pname').textContent = P.meta.name;
    $('#pname').title = P.meta.name + (P.meta.fileName ? ' (' + P.meta.fileName + ')' : '');
    $('#ddChip').textContent = 'Data Date: ' + D.fmt(P.meta.dataDate);
    const sc = $('#schedChip');
    sc.hidden = false;
    if (P.settings.scheduled) { sc.className = 'chip ok'; sc.textContent = 'Scheduled · finish ' + D.fmt(P.meta.scheduledFinish); sc.title = 'Dates are up to date'; }
    else { sc.className = 'chip warn'; sc.textContent = 'Changes not scheduled - press F9'; sc.title = 'Run Schedule (F9) to recalculate dates and float'; }
    const u = $('#btnUndo'), r = $('#btnRedo');
    if (u) { u.disabled = !P.undoStack.length; u.title = P.undoStack.length ? 'Undo ' + P.undoStack[P.undoStack.length - 1].label + ' (Ctrl+Z)' : 'Nothing to undo'; }
    if (r) r.disabled = !P.redoStack.length;
  }

  function renderStatus() {
    const P = S.P;
    const acts = S.rows.filter((r) => r.kind === 'act').length;
    const all = P.acts.length;
    const sel = S.multi.size > 1 ? S.multi.size + ' selected' : S.sel ? (P.act(S.sel) || {}).code || '' : 'none';
    $('#statusbar').innerHTML = '<span>Showing <b>' + acts + '</b> of <b>' + all + '</b> activities</span><span>Relationships <b>' + P.rels.length + '</b></span>' +
      '<span>Selected <b>' + esc(sel) + '</b></span><span>Source <b>' + esc(P.meta.source.toUpperCase()) + '</b> ' + esc(P.meta.fileName || '') + '</span>' +
      '<span class="sp"></span><span>Last update DD <b>' + D.fmt(P.meta.prevDataDate) + '</b></span><span>Data Date <b>' + D.fmt(P.meta.dataDate) + '</b></span>' +
      '<span>Changes this session <b>' + P.acts.filter((a) => a.touched).length + '</b></span><span class="saved">' + (S.savedAt ? 'Autosaved ' + new Date(S.savedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '') + '</span>';
  }

  /* ---------------- side bar ---------------- */
  function ring(frac, color) {
    const r = 24, c = 2 * Math.PI * r;
    return '<svg viewBox="0 0 58 58" aria-hidden="true"><circle cx="29" cy="29" r="' + r + '" fill="none" stroke="var(--surface-3)" stroke-width="7"/><circle cx="29" cy="29" r="' + r + '" fill="none" stroke="' + color + '" stroke-width="7" stroke-linecap="round" stroke-dasharray="' + (c * Math.max(0, Math.min(1, frac))).toFixed(1) + ' ' + c.toFixed(1) + '" transform="rotate(-90 29 29)"/><text x="29" y="33" text-anchor="middle" font-size="12" font-weight="700" fill="var(--ink)">' + Math.round(frac * 100) + '%</text></svg>';
  }
  function renderSide() {
    const P = S.P;
    const side = $('#side');
    const c = S.fl.counts;
    const need = P.acts.filter((a) => { const f = S.fl.map.get(a.uid) || []; return f.includes('pending') || (a.touched && (f.includes('inProgress') || f.includes('due') || f.includes('lateStart') || f.includes('overdue') || a.status !== (a.prev && a.prev.status))); });
    const done = need.filter((a) => a.touched).length;
    const frac = need.length ? done / need.length : 1;
    const parts = [];
    parts.push('<div class="meter">' + ring(frac, frac >= 1 ? 'var(--good)' : 'var(--accent)') + '<div><b>' + done + ' of ' + need.length + ' updated</b><span>' + (c.pending ? c.pending + ' activities still need an update this month' : 'All due activities have been updated') + '</span></div></div>');
    const lensBtn = (k) => {
      const l = SE.LENS_BY_KEY[k];
      return '<button class="lens' + (S.lensSel.has(k) ? ' on' : '') + (c[k] ? '' : ' zero') + '" data-lens="' + k + '" title="' + esc(l.desc) + '"><i style="background:' + l.color + '"></i><span>' + esc(l.label) + '</span><em>' + (c[k] || 0) + '</em></button>';
    };
    parts.push('<div><h4>Update spotlight ' + (S.lensSel.size ? '<button data-clear="lens">clear</button>' : '') + '</h4>' + ['pending', 'lateStart', 'overdue', 'future', 'due', 'inProgress', 'updated'].map(lensBtn).join('') + '</div>');
    parts.push('<div><h4>Schedule quality</h4>' + ['critical', 'negFloat', 'outSeq', 'invalid', 'lookahead', 'openEnd'].map(lensBtn).join('') + '</div>');
    const dimBlock = (key, title) => {
      const rows = SE.analysis.breakdown(P, key, S.fl).filter((b) => b.count);
      return '<div><h4>' + title + ' ' + (S.dimSel[key].size ? '<button data-clear="' + key + '">clear</button>' : '<button data-group="' + key + '">group by</button>') + '</h4>' +
        rows.map((b) => '<button class="dimchip' + (S.dimSel[key].has(b.name) ? ' on' : '') + '" data-dim="' + key + '" data-val="' + esc(b.name) + '" title="' + esc(b.name) + ': actual ' + b.actual.toFixed(1) + '% vs planned ' + b.planned.toFixed(1) + '%"><span>' + esc(b.name) + '</span><small>' + b.actual.toFixed(0) + '%' + (b.lateStart + b.overdue ? ' · <span class="late">' + (b.lateStart + b.overdue) + ' late</span>' : '') + '</small><span class="bar"><i style="width:' + b.actual.toFixed(1) + '%"></i><b style="left:' + b.planned.toFixed(1) + '%"></b></span></button>').join('') + '</div>';
    };
    parts.push(dimBlock('building', 'Buildings'));
    parts.push(dimBlock('epc', 'EPC phase'));
    const st = { NS: 0, IP: 0, CO: 0 };
    P.acts.forEach((a) => { if (!P.isSummaryType(a)) st[a.status]++; });
    parts.push('<div><h4>Status ' + (S.statusSel.size ? '<button data-clear="status">clear</button>' : '') + '</h4>' + ['IP', 'NS', 'CO'].map((k) => '<button class="lens' + (S.statusSel.has(k) ? ' on' : '') + '" data-status="' + k + '"><i style="background:' + (k === 'IP' ? 'var(--accent)' : k === 'CO' ? 'var(--good)' : 'var(--ink-3)') + '"></i><span>' + SE.STATUS[k] + '</span><em>' + st[k] + '</em></button>').join('') + '</div>');
    side.innerHTML = parts.join('');
  }
  function bindSide() {
    $('#side').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.lens) { toggleSet(S.lensSel, b.dataset.lens, e); }
      else if (b.dataset.dim) { toggleSet(S.dimSel[b.dataset.dim], b.dataset.val, e); }
      else if (b.dataset.status) { toggleSet(S.statusSel, b.dataset.status, e); }
      else if (b.dataset.clear) {
        const k = b.dataset.clear;
        if (k === 'lens') S.lensSel.clear(); else if (k === 'status') S.statusSel.clear(); else S.dimSel[k].clear();
      } else if (b.dataset.group) { setGroup(b.dataset.group); return; }
      S.collapsed.clear();
      refresh({ noSave: true });
    });
  }
  function toggleSet(set, v, e) {
    if (e && (e.ctrlKey || e.metaKey || e.shiftKey)) { if (set.has(v)) set.delete(v); else set.add(v); return; }
    if (set.has(v) && set.size === 1) set.clear();
    else { set.clear(); set.add(v); }
  }

  function renderFilterbar() {
    const fb = $('#filterbar');
    const chips = [];
    const chip = (label, clear) => chips.push({ label, clear });
    S.lensSel.forEach((k) => chip(SE.LENS_BY_KEY[k].short, () => S.lensSel.delete(k)));
    S.dimSel.building.forEach((v) => chip(v, () => S.dimSel.building.delete(v)));
    S.dimSel.epc.forEach((v) => chip(v, () => S.dimSel.epc.delete(v)));
    S.statusSel.forEach((v) => chip(SE.STATUS[v], () => S.statusSel.delete(v)));
    if (S.ask) chip('Ask: ' + S.ask.question, () => { S.ask = null; $('#ask').value = ''; });
    if (S.uidFilter) chip(S.uidFilter.label, () => { S.uidFilter = null; });
    if (S.text) chip('"' + S.text + '"', () => { S.text = ''; });
    fb.innerHTML = '';
    chips.forEach((c) => {
      const x = h('span', { class: 'fchip' }, c.label, h('button', { 'aria-label': 'Remove filter ' + c.label, html: '&times;', onclick: () => { c.clear(); refresh({ noSave: true }); } }));
      fb.append(x);
    });
    if (chips.length > 1) fb.append(h('button', { class: 'btn sm', text: 'Clear all', onclick: clearFilters }));
  }
  function clearFilters() {
    S.lensSel.clear(); S.dimSel.building.clear(); S.dimSel.epc.clear(); S.statusSel.clear(); S.ask = null; S.uidFilter = null; S.text = '';
    $('#ask').value = '';
    refresh({ noSave: true });
  }

  /* ---------------- wizard (guided update) ---------------- */
  function renderWizard() {
    const P = S.P;
    const c = S.fl.counts;
    const ddSet = P.meta.prevDataDate != null && P.meta.dataDate > P.meta.prevDataDate;
    const pend = c.pending || 0;
    const inv = c.invalid || 0;
    const hs = S.lastHealth;
    const steps = [
      { n: 1, t: 'Set Data Date', s: ddSet ? D.fmt(P.meta.dataDate) + ' (was ' + D.fmt(P.meta.prevDataDate) + ')' : 'Not moved yet - click to set', st: ddSet ? 'done' : 'todo', run: () => UI.dataDateDialog() },
      { n: 2, t: 'Update progress', s: pend ? pend + ' pending · use Easy Update' : 'All due activities updated', st: pend ? (ddSet ? 'cur' : '') : 'done', run: () => { setView('easy'); } },
      { n: 3, t: 'Schedule (F9)', s: P.settings.scheduled ? 'Finish ' + D.fmt(P.meta.scheduledFinish) : 'Needs recalculation', st: P.settings.scheduled ? 'done' : 'todo', run: () => UI.runSchedule() },
      { n: 4, t: 'Check quality', s: inv ? inv + ' invalid - fix before export' : hs != null ? 'Health score ' + hs + '%' : 'Run health check', st: inv ? 'todo' : hs != null ? 'done' : '', run: () => setView('health') },
      { n: 5, t: 'Export', s: 'XER · Excel · PDF · HTML', st: '', run: () => UI.io.exportDialog() }
    ];
    const w = $('#wizard');
    w.innerHTML = '';
    for (const s of steps) {
      const b = h('button', { class: 'step ' + s.st, title: s.t }, h('span', { class: 'n', text: s.st === 'done' ? '✓' : s.n }), h('span', null, h('b', { text: s.t }), h('span', { text: s.s })));
      b.onclick = s.run;
      w.append(b);
    }
  }

  /* ---------------- ribbon ---------------- */
  function rbtn(id, ic, label, run, cls, title) {
    const b = h('button', { class: 'rbtn ' + (cls || ''), id, title: title || label, html: icon(ic) + '<span>' + label + '</span>' });
    b.onclick = run;
    return b;
  }
  function rgroup(label, ...kids) { return h('div', { class: 'rgroup' }, h('div', { class: 'rrow' }, kids), h('label', { text: label })); }
  const GROUPS = [
    ['wbs', 'WBS (P6 default)'], ['building', 'Building'], ['building,epc', 'Building → EPC'], ['epc', 'EPC phase'], ['epc,building', 'EPC → Building'],
    ['status', 'Activity status'], ['lens', 'Update flag'], ['none', 'No grouping']
  ];
  function buildRibbon() {
    const home = $('[data-rp="home"]'), upd = $('[data-rp="update"]'), view = $('[data-rp="view"]'), an = $('[data-rp="analyze"]');
    home.append(
      rgroup('Schedule file', rbtn('btnOpen', 'open', 'Open…', () => UI.io.pickFile(), '', 'Open XER, Excel, PDF, MS Project XML or a saved project (Ctrl+O)'), rbtn('btnDemo', 'demo', 'Demo project', () => UI.io.loadDemo()), rbtn('btnSave', 'save', 'Save project', () => UI.io.saveProject(), '', 'Save everything incl. quantities & notes (.sej) (Ctrl+S)')),
      rgroup('Outputs', rbtn('btnExport', 'export', 'Export…', () => UI.io.exportDialog(), 'primary'), rbtn('btnXer', 'xer', 'XER', () => UI.io.exportAs('xer'), '', 'Export Primavera P6 XER'), rbtn('btnXls', 'excel', 'Excel', () => UI.io.exportAs('xlsx')), rbtn('btnPdf', 'pdf', 'PDF', () => UI.io.exportAs('pdf')), rbtn('btnHtml', 'html', 'HTML', () => UI.io.exportAs('html')), rbtn('btnOnePager', 'qty', 'One-pagers', () => setView('qty'), '', 'Building / WBS / EPC quantity one-pagers (PPTX / PDF / Excel)')),
      rgroup('Offline update', rbtn('btnImpUpd', 'importSheet', 'Import Update Sheet', () => UI.io.pickFile('update'), '', 'Load the filled "Update Sheet" from the Excel export'))
    );
    upd.append(
      rgroup('Status date', rbtn('btnDD', 'dd', 'Data Date', () => UI.dataDateDialog())),
      rgroup('Calculate', rbtn('btnF9', 'run', 'Schedule F9', () => UI.runSchedule(), 'primary', 'Recalculate dates, float and critical path (F9)')),
      rgroup('Assist', rbtn('btnAssist', 'wand', 'Apply planned progress', () => UI.panels.progressAssistant(), '', 'P6-style "Update Progress": suggest actuals from the plan, you review'), rbtn('btnBulk', 'bulk', 'Bulk update', () => UI.panels.bulkDialog(), '', 'Update all selected activities at once'), rbtn('btnQty', 'qty', 'Qty calculator', () => UI.panels.qtyDialog(), '', 'Scope vs completed quantity → % complete')),
      rgroup('Edit', rbtn('btnUndo', 'undo', 'Undo', () => UI.undo()), rbtn('btnRedo', 'redo', 'Redo', () => UI.redo())),
      rgroup('Activities', rbtn('btnAdd', 'add', 'Add', () => UI.panels.addActivityDialog()), rbtn('btnDel', 'del', 'Delete', () => UI.panels.deleteSelected()), rbtn('btnRel', 'link', 'Link', () => UI.panels.relDialog(), '', 'Add a relationship')),
      rgroup('Mode', rbtn('btnEasy', 'easy', 'Easy Update', () => setView('easy'), '', 'Card view to update building-wise or EPC-wise'))
    );
    const gsel = h('select', { id: 'groupSel', 'aria-label': 'Group by' });
    GROUPS.forEach((g) => gsel.append(h('option', { value: g[0], text: g[1] })));
    gsel.onchange = () => setGroup(gsel.value);
    const ssel = h('select', { id: 'sortSel', 'aria-label': 'Sort by' });
    [['start', 'Start date'], ['finish', 'Finish date'], ['code', 'Activity ID'], ['name', 'Activity name'], ['tf', 'Total float'], ['pct', '% complete'], ['status', 'Status']].forEach((s) => ssel.append(h('option', { value: s[0], text: s[1] })));
    ssel.onchange = () => { S.sort = { key: ssel.value, dir: 'asc' }; refresh({ noSave: true }); };
    const zsel = h('select', { id: 'zoomSel', 'aria-label': 'Timescale' });
    [['day', 'Days'], ['week', 'Weeks'], ['month', 'Months'], ['quarter', 'Quarters'], ['year', 'Years']].forEach((z) => zsel.append(h('option', { value: z[0], text: z[1] })));
    zsel.value = S.zoom;
    zsel.onchange = () => { S.zoom = zsel.value; UI.gantt.render(true); };
    view.append(
      rgroup('Organize', h('div', { class: 'rsmall' }, h('span', { class: 'lab' }, 'Group by'), gsel, h('span', { class: 'lab' }, 'Sort by'), ssel)),
      rgroup('Timescale', h('div', { class: 'rsmall' }, h('span', { class: 'lab' }, 'Zoom'), zsel), rbtn('btnFit', 'fit', 'Fit', () => UI.gantt.fit()), rbtn('btnGoDD', 'dd', 'Go to DD', () => UI.gantt.scrollToDay(S.P.meta.dataDate))),
      rgroup('Show', rbtn('tgRel', 'link', 'Logic lines', () => { S.showRels = !S.showRels; syncToggles(); UI.gantt.render(); }), rbtn('tgBl', 'bars', 'Baseline', () => { S.showBaseline = !S.showBaseline; syncToggles(); UI.gantt.render(); }), rbtn('tgColor', 'filter', 'Flag colours', () => { S.colorRows = !S.colorRows; syncToggles(); UI.grid.render(); }), rbtn('tgLabels', 'bars', 'Bar labels', () => { S.showLabels = !S.showLabels; syncToggles(); UI.gantt.render(); })),
      rgroup('Rows', rbtn('btnExp', 'expand', 'Expand all', () => { S.collapsed.clear(); refresh({ noSave: true }); }), rbtn('btnCol', 'collapse', 'Collapse', () => collapseAll()), rbtn('btnCols', 'cols', 'Columns', () => UI.grid.columnsDialog()), rbtn('btnSide', 'side', 'Filters panel', () => { const m = $('#main'); if (innerWidth > 1100) m.classList.toggle('noside'); else m.classList.toggle('showside'); setTimeout(() => UI.gantt.render(true), 0); }))
    );
    an.append(
      rgroup('Views', rbtn('btnDash', 'dash', 'Dashboard', () => setView('dash')), rbtn('btnHealth', 'health', 'Health check', () => setView('health')), rbtn('btnChanges', 'changes', 'Changes', () => setView('changes'))),
      rgroup('Quantities', rbtn('btnQtyView', 'qty', 'Qty & Liquidation', () => setView('qty'), '', 'Quantity tracker, month-wise liquidation and building / WBS / EPC one-pagers')),
      rgroup('Engine', rbtn('btnInsights', 'bulb', 'Insights', () => UI.panels.insightsDialog()), rbtn('btnSetup', 'gear', 'Setup', () => UI.panels.settingsDialog(), '', 'Building / EPC source, scheduling options, calendars'))
    );
    $$('.rtabs button').forEach((b) => {
      b.onclick = () => {
        $$('.rtabs button').forEach((x) => x.setAttribute('aria-selected', x === b ? 'true' : 'false'));
        $$('.rpanel').forEach((p) => { p.hidden = p.dataset.rp !== b.dataset.rt; });
      };
    });
    syncToggles();
  }
  function syncToggles() {
    const set = (id, on) => { const e = $('#' + id); if (e) e.classList.toggle('on', on); };
    set('tgRel', S.showRels); set('tgBl', S.showBaseline); set('tgColor', S.colorRows); set('tgLabels', S.showLabels);
  }
  function setGroup(key) {
    S.groupKey = key;
    S.groupBy = key === 'none' ? [] : key.split(',');
    S.collapsed.clear();
    const g = $('#groupSel');
    if (g) { if (!Array.from(g.options).some((o) => o.value === key)) g.append(h('option', { value: key, text: key.replace('code:', 'Code: ').replace('wbs:', 'WBS level ') })); g.value = key; }
    if (S.view !== 'gantt') setView('gantt');
    refresh({ noSave: true });
  }
  function collapseAll() {
    const all = SE.views.buildRows(S.P, { groupBy: S.groupBy, filter: passes, sort: S.sort, collapsed: new Set() });
    S.collapsed = new Set(all.filter((r) => r.kind === 'group' && r.level >= (S.groupBy[0] === 'wbs' ? 1 : 0)).map((r) => r.id));
    refresh({ noSave: true });
  }
  function setView(v) {
    S.view = v;
    $$('#vtabs button[data-view]').forEach((b) => b.setAttribute('aria-selected', b.dataset.view === v ? 'true' : 'false'));
    $$('.view').forEach((e) => { e.hidden = e.id !== 'view-' + v; });
    try { localStorage.setItem('se.view', v); } catch (e) { /* ignore */ }
    refresh({ noSave: true });
  }

  /* ---------------- actions ---------------- */
  function applyPatches(patches, label, opts) {
    const P = S.P;
    const r = P.apply(patches, label);
    const shown = new Set();
    r.errors.forEach((e) => { const k = e.code + e.msg; if (!shown.has(k)) { shown.add(k); toast(e.msg, 'e', e.code + ' not updated'); } });
    if (!(opts && opts.quiet)) {
      r.infos.slice(0, 3).forEach((e) => toast(e.msg, 'i', e.code));
      r.warnings.slice(0, 3).forEach((e) => toast(e.msg, 'w', e.code));
      if (r.applied > 1) toast(r.applied + ' activities updated.', 'g');
    }
    if (r.applied) { S.dirty = true; if (opts && opts.soft) softRefresh(opts.soft); else refresh(); }
    return r;
  }
  /** refresh everything except the current big view (keeps focus in Easy Update) */
  function softRefresh(after) {
    computeFlags(); buildRows(); renderTop(); renderSide(); renderWizard(); renderStatus();
    if (typeof after === 'function') after();
    UI.io.autosave();
  }
  function undo() { const u = S.P.undo(); if (u) { toast('Undid: ' + u.label, 'i'); refresh(); } }
  function redo() { const u = S.P.redo(); if (u) { toast('Redid: ' + u.label, 'i'); refresh(); } }

  function runSchedule(silent) {
    const P = S.P;
    const before = P.meta.scheduledFinish;
    const t = performance.now();
    const r = SE.schedule(P);
    P._lastLoops = r.loops;
    const ms = Math.round(performance.now() - t);
    const dl = before != null ? P.cal(null).between(before, r.finish) : 0;
    refresh();
    if (!silent) {
      toast('Finish ' + D.fmtLong(r.finish) + (before != null && dl ? ' (' + (dl > 0 ? '+' : '') + dl + ' working days vs before)' : '') + ' · ' + r.critical + ' critical' + (r.negativeFloat ? ' · ' + r.negativeFloat + ' with negative float' : '') + ' · ' + ms + ' ms' + (r.mode === 'date-driven' ? ' · no logic in this schedule, dates kept from plan' : ''), r.loops.length ? 'w' : 'g', 'Scheduled (' + r.count + ' activities)');
      if (r.loops.length) toast('Circular logic found at: ' + r.loops.slice(0, 6).join(', ') + '. Fix these relationships.', 'e', 'Logic loop');
    }
    return r;
  }

  function dataDateDialog(first) {
    const P = S.P;
    const cur = P.meta.dataDate;
    const prev = P.meta.prevDataDate != null ? P.meta.prevDataDate : cur;
    const suggest = D.addMonths(prev, 1) > prev ? (D.parts(prev).d === 1 ? D.addMonths(prev, 1) : D.monthStart(D.addMonths(prev, 1))) : prev + 30;
    let maxAct = null;
    P.acts.forEach((a) => [a.aStart, a.aFinish].forEach((d) => { if (d != null && (maxAct == null || d > maxAct)) maxAct = d; }));
    const inp = h('input', { class: 'inp', id: 'ddInput', value: D.fmtLong(first ? suggest : cur), style: { fontSize: '16px', maxWidth: '220px' } });
    const hint = h('div', { class: 'sub', style: { marginTop: '6px' } });
    const check = () => {
      const p = D.parseDate(inp.value);
      if (!p) { hint.innerHTML = '<span style="color:var(--bad)">Not a date. Try 01-Oct-2026 or 01/10/2026.</span>'; return null; }
      const wd = D.parts(p.day).w;
      let m = '→ <b>' + D.fmtLong(p.day) + '</b> (' + ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][wd] + '). Status is recorded up to the end of ' + D.fmtLong(p.day - 1) + '.';
      if (maxAct != null && p.day <= maxAct) m += '<br><span style="color:var(--bad)">Some actual dates (latest ' + D.fmt(maxAct) + ') are on/after this date - the Data Date must be later than every actual.</span>';
      else if (p.day <= prev) m += '<br><span style="color:#B07800">This is not later than the last update (' + D.fmt(prev) + ').</span>';
      hint.innerHTML = m;
      return p.day;
    };
    inp.addEventListener('input', check);
    const quick = h('div', { class: 'quick', style: { margin: '10px 0' } });
    const qd = [[suggest, '1st of next month'], [D.monthEnd(prev) + 1 > prev ? D.monthEnd(D.addMonths(prev, 0)) + 1 : prev, 'Start of month after last DD'], [D.todayDay(), 'Today'], [prev + 7, '+1 week'], [prev + 14, '+2 weeks']];
    const seen = new Set();
    qd.forEach(([d, l]) => { if (seen.has(d)) return; seen.add(d); quick.append(h('button', { type: 'button', text: l + ' · ' + D.fmt(d), onclick: () => { inp.value = D.fmtLong(d); check(); } })); });
    check();
    const body = h('div', null,
      h('p', { style: { marginTop: 0 }, html: first ? 'Loaded <b>' + esc(P.meta.name) + '</b> with <b>' + P.acts.length + '</b> activities and <b>' + P.rels.length + '</b> relationships.<br>Last update Data Date in the file: <b>' + D.fmtLong(prev) + '</b>. Set the Data Date for <b>this</b> monthly update:' : 'The Data Date is the status date: everything before it is actual, everything on or after it is forecast.' }),
      inp, hint, quick,
      h('div', { class: 'msg i', html: 'The engine compares each activity with its last-update dates to highlight what should have started, what is overdue and what is progressing ahead of plan. Actual dates must be <b>before</b> the Data Date.' }));
    return modal(first ? 'Start this month\'s update' : 'Data Date', body, [
      { label: first ? 'Keep ' + D.fmt(cur) : 'Cancel', value: null },
      { label: 'Set Data Date', cls: 'pri', action: () => {
        const d = check();
        if (d == null) return false;
        if (maxAct != null && d <= maxAct) { toast('Data Date must be after ' + D.fmtLong(maxAct) + ' (latest actual date).', 'e'); return false; }
        P.meta.dataDate = d;
        if (P.meta.prevDataDate == null) P.meta.prevDataDate = prev;
        P.settings.scheduled = false;
        P.log.push({ t: Date.now(), uid: null, code: '', field: 'Data Date', from: D.fmt(cur), to: D.fmt(d) });
        refresh();
        toast('Data Date set to ' + D.fmtLong(d) + '. ' + (S.fl.counts.pending || 0) + ' activities need an update - start with the Update spotlight or Easy Update.', 'g');
        if (S.view === 'gantt') UI.gantt.scrollToDay(d);
        return d;
      } }
    ], 'narrow');
  }

  function help() {
    const body = h('div', { class: 'help', html:
      '<p>Schedule Engine updates a Primavera P6 schedule without P6. Load last month\'s file, move the Data Date, update progress, press F9 and export a new XER for P6, plus Excel and PDF reports.</p>' +
      '<h3>Monthly routine</h3><ol><li><b>Open</b> last month\'s .xer (or Excel / PDF / MS Project XML).</li><li>Set the new <b>Data Date</b> (normally the 1st of the month).</li><li>Work through the <b>Update spotlight</b>: <i>Should have started</i>, <i>Overdue</i>, <i>Future progress</i>, <i>In progress</i>. Use <b>Easy Update</b> to go building-wise or EPC-wise.</li><li>Use the <b>Qty calculator</b> (scope vs completed quantity) to get a defensible %.</li><li>Press <b>F9</b> to schedule, check the <b>Health check</b>, then <b>Export</b> XER / Excel / PDF / HTML.</li></ol>' +
      '<h3>Typing dates</h3><p>Any of: <span class="kbd">30-Sep-26</span> <span class="kbd">30/09/2026</span> <span class="kbd">2026-09-30</span> <span class="kbd">30 Sep</span>. Shortcuts: <span class="kbd">p</span> = planned date, <span class="kbd">dd</span> = day before Data Date, <span class="kbd">t</span> = today.</p>' +
      '<h3>Keyboard</h3><div class="helpgrid"><span class="kbd">F9</span><span>Schedule</span><span class="kbd">Ctrl+Z / Ctrl+Y</span><span>Undo / redo</span><span class="kbd">Ctrl+S</span><span>Save project (.sej)</span><span class="kbd">Ctrl+O</span><span>Open file</span><span class="kbd">Ctrl+E</span><span>Export</span><span class="kbd">Ctrl+F</span><span>Ask the engine / search</span><span class="kbd">↑ ↓</span><span>Move between activities</span><span class="kbd">Enter / F2</span><span>Edit the cell</span><span class="kbd">Tab</span><span>Next editable cell</span><span class="kbd">Esc</span><span>Cancel edit / clear selection</span></div>' +
      '<h3>Rules the engine enforces</h3><ul><li>Actual Start and Actual Finish must be before the Data Date; Finish cannot be before Start.</li><li>100% requires an Actual Finish; progress requires an Actual Start (auto-filled from plan, you can edit it).</li><li>Completed activities are locked until the Actual Finish is cleared.</li><li>Milestones take dates, not percentages.</li><li>Out-of-sequence progress, loops and invalid dates are flagged before export.</li></ul>' +
      '<h3>Ask the engine</h3><p>Examples: <i>delayed in Admin Building</i> · <i>procurement progress</i> · <i>critical next 30 days</i> · <i>how many not started in Warehouse</i> · <i>when will the project finish</i> · <i>"excavation"</i>.</p>' +
      '<h3>Your data</h3><p>Everything runs inside this browser page. Files are never uploaded; the session is autosaved in this browser so you can close and resume.</p>'
    });
    modal('Schedule Engine - help', body, null, 'wide');
  }

  function setTheme(v) {
    const r = document.documentElement;
    r.removeAttribute('data-skin');
    if (v === 'kpmg-dark') r.setAttribute('data-theme', 'dark');
    else r.setAttribute('data-theme', 'light');
    if (v === 'p6') r.setAttribute('data-skin', 'p6');
    try { localStorage.setItem('se.theme', v); } catch (e) { /* ignore */ }
    if (S.P) { UI.gantt.render(true); if (S.view !== 'gantt') UI.panels.renderView(S.view); }
  }

  /* ---------------- ask ---------------- */
  function doAsk(q) {
    q = String(q || '').trim();
    if (!q) { S.ask = null; refresh({ noSave: true }); return; }
    S.lensSel.clear(); S.dimSel.building.clear(); S.dimSel.epc.clear(); S.statusSel.clear(); S.uidFilter = null;
    const r = SE.analysis.ask(S.P, q);
    const list = SE.analysis.applyFilter(S.P, r.filter, S.fl.map);
    S.ask = { question: q, answer: r.answer, uids: new Set(list.map((a) => a.uid)) };
    S.collapsed.clear();
    if (S.view !== 'gantt' && S.view !== 'easy') setView('gantt'); else refresh({ noSave: true });
    toast(r.answer, list.length ? 'i' : 'w', 'Engine', 8000);
  }

  window.UI = {
    S, h, $, $$, esc, icon, toast, modal, menu, closeMenu, busy, tick, refresh, redrawSoon, buildRibbon, bindSide, setView, setGroup, setTheme,
    applyPatches, softRefresh, undo, redo, runSchedule, dataDateDialog, help, doAsk, clearFilters, passes, filtered, computeFlags, buildRows, syncToggles
  };
})();
