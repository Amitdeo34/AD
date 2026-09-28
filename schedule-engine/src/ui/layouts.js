/* Schedule Engine - ui/layouts.js
 * P6-style Layouts (built-in + saved), Filters dialog & rule editor,
 * Group & Sort dialog, collapse / expand to level, and Go To activity.
 */
(function () {
  'use strict';
  const { S, h, $, esc, toast, modal } = UI;

  const LS = {
    get(k, d) { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } }
  };
  S.filtersOn = S.filtersOn || [];
  S.filterMatch = S.filterMatch || 'all';
  S.noActs = false;
  S.floatBars = LS.get('se.floatBars', false);
  S.barLabel = LS.get('se.barLabel', 'name');

  /* ================================================================== *
   * Filters
   * ================================================================== */
  const userFilters = () => LS.get('se.filters', []);
  const saveUserFilters = (list) => LS.set('se.filters', list);
  const allFilters = () => SE.filters.BUILTIN.map((f) => Object.assign({ builtin: true }, f)).concat(userFilters());
  function activeFilterPass(a) {
    if (!S.filtersOn.length) return true;
    const ctx = { flags: S.fl.map };
    const res = S.filtersOn.map((f) => SE.filters.matches(S.P, f, a, ctx));
    return S.filterMatch === 'any' ? res.some(Boolean) : res.every(Boolean);
  }
  function filtersDialog() {
    const list = allFilters();
    const on = new Set(S.filtersOn.map((f) => f.id));
    const box = h('div', { class: 'cdlist', style: { height: '46vh' } });
    const draw = () => {
      box.innerHTML = '';
      [['Built-in filters', list.filter((f) => f.builtin)], ['Your filters', list.filter((f) => !f.builtin)]].forEach(([title, items]) => {
        box.append(h('div', { class: 'cdcat', text: title }));
        if (!items.length) box.append(h('div', { class: 'sub', style: { padding: '4px 8px', color: 'var(--ink-3)' }, text: 'None yet - click New.' }));
        items.forEach((f) => {
          const cb = h('input', { type: 'checkbox', id: 'flt_' + f.id });
          cb.checked = on.has(f.id);
          cb.onchange = () => { if (cb.checked) on.add(f.id); else on.delete(f.id); };
          const row = h('div', { class: 'cditem fltrow' }, h('label', { style: { display: 'flex', gap: '8px', alignItems: 'center', flex: 1 } }, cb, h('span', null, h('b', { text: f.name }), h('div', { class: 'sub', style: { color: 'var(--ink-3)' }, text: (f.match === 'any' ? 'Any of: ' : '') + f.rules.map((r) => SE.filters.describe(S.P, r)).join(f.match === 'any' ? ' OR ' : ' AND ') }))));
          if (!f.builtin) {
            row.append(h('button', { class: 'btn sm', type: 'button', text: 'Edit', onclick: () => { close(); editor(f); } }), h('button', { class: 'btn sm danger', type: 'button', text: '✕', 'aria-label': 'Delete filter', onclick: () => { saveUserFilters(userFilters().filter((x) => x.id !== f.id)); list.splice(list.indexOf(f), 1); on.delete(f.id); draw(); } }));
          } else row.append(h('button', { class: 'btn sm', type: 'button', text: 'Copy', onclick: () => { close(); editor(Object.assign({}, JSON.parse(JSON.stringify(f)), { id: null, builtin: false, name: f.name + ' (copy)' })); } }));
          box.append(row);
        });
      });
    };
    draw();
    const match = h('select', { class: 'inp', id: 'flt_match', style: { width: 'auto' } }, h('option', { value: 'all', text: 'All selected filters (AND)' }), h('option', { value: 'any', text: 'Any selected filter (OR)' }));
    match.value = S.filterMatch;
    let close;
    const p = modal('Filters', h('div', null, h('div', { class: 'opts' }, h('label', null, 'Show activities that match ', match)), box), [
      { label: 'New filter…', action: () => { close(); editor(null); return null; } },
      { spacer: true },
      { label: 'Clear filters', action: () => { S.filtersOn = []; UI.refresh({ noSave: true }); return true; } },
      { label: 'Apply', cls: 'pri', action: () => { S.filtersOn = list.filter((f) => on.has(f.id)); S.filterMatch = match.value; S.collapsed.clear(); UI.refresh({ noSave: true }); toast(S.rows.filter((r) => r.kind === 'act').length + ' activities match.', 'i', 'Filters'); return true; } }
    ], 'wide');
    close = () => { const bgs = document.querySelectorAll('.modal-bg'); const bg = bgs[bgs.length - 1]; if (bg) bg.querySelector('.mh button').click(); };
    return p;
  }
  function editor(f) {
    f = f ? JSON.parse(JSON.stringify(f)) : { id: null, name: 'My filter', match: 'all', rules: [{ col: 'status', op: 'neq', value: 'Completed' }] };
    const all = SE.columns.list(S.P);
    const name = h('input', { class: 'inp', id: 'fe_name', value: f.name || '' });
    const match = h('select', { class: 'inp', id: 'fe_match', style: { width: 'auto' } }, h('option', { value: 'all', text: 'All of the following (AND)' }), h('option', { value: 'any', text: 'Any of the following (OR)' }));
    match.value = f.match || 'all';
    const tb = h('tbody');
    const count = h('div', { class: 'msg i', style: { marginTop: '10px' } });
    const recount = () => {
      const tmp = { match: match.value, rules: f.rules };
      const n = S.P.acts.filter((a) => !S.P.isSummaryType(a) && SE.filters.matches(S.P, tmp, a, { flags: S.fl.map })).length;
      count.textContent = n + ' of ' + S.P.acts.length + ' activities match.';
    };
    const draw = () => {
      tb.innerHTML = '';
      f.rules.forEach((r, i) => {
        const colSel = h('select', { class: 'inp' });
        SE.columns.CATS.forEach((cat) => { const g = h('optgroup', { label: cat }); all.filter((c) => c.cat === cat).forEach((c) => g.append(h('option', { value: c.id, text: c.label }))); if (g.children.length) colSel.append(g); });
        colSel.value = r.col;
        const col = SE.columns.get(S.P, r.col) || all[0];
        const opSel = h('select', { class: 'inp' }, SE.filters.opsFor(col).map((o) => h('option', { value: o[0], text: o[1] })));
        if (!SE.filters.opsFor(col).some((o) => o[0] === r.op)) r.op = SE.filters.opsFor(col)[0][0];
        opSel.value = r.op;
        const needs = !['empty', 'nempty', 'true', 'false', 'beforeDD', 'afterDD'].includes(r.op);
        let v1;
        if (col.t === 'code' || col.id === 'status' || col.id === 'type' || col.id === 'epc' || col.id === 'building' || col.id === 'area') {
          const opts = col.t === 'code' ? (S.P.codeType(col.codeType) || { values: [] }).values.map((x) => x.name || x.code) : Array.from(new Set(S.P.acts.map((a) => String(SE.columns.value(S.P, col, a) || ''))));
          const dl = 'fe_dl_' + i;
          v1 = h('span', null, h('input', { class: 'inp', value: r.value || '', list: dl, placeholder: col.t === 'date' ? 'dd-mmm-yy' : 'value' }), h('datalist', { id: dl }, opts.filter(Boolean).slice(0, 300).map((o) => h('option', { value: o }))));
        } else v1 = h('input', { class: 'inp', value: r.value || '', placeholder: /N$/.test(r.op) ? 'days' : col.t === 'date' ? 'dd-mmm-yy' : 'value' });
        const v1i = v1.tagName === 'INPUT' ? v1 : v1.querySelector('input');
        const v2 = h('input', { class: 'inp', value: r.value2 || '', placeholder: 'and', style: { display: r.op === 'between' ? '' : 'none' } });
        colSel.onchange = () => { r.col = colSel.value; r.op = SE.filters.opsFor(SE.columns.get(S.P, r.col))[0][0]; draw(); };
        opSel.onchange = () => { r.op = opSel.value; draw(); };
        v1i.oninput = () => { r.value = v1i.value; recount(); };
        v2.oninput = () => { r.value2 = v2.value; recount(); };
        tb.append(h('tr', null, h('td', { text: i ? (match.value === 'any' ? 'OR' : 'AND') : 'Where' }), h('td', null, colSel), h('td', null, opSel), h('td', null, needs ? v1 : ''), h('td', null, needs ? v2 : ''),
          h('td', null, h('button', { class: 'btn sm', type: 'button', text: '✕', 'aria-label': 'Remove rule', onclick: () => { f.rules.splice(i, 1); draw(); } }))));
      });
      recount();
    };
    match.onchange = draw;
    draw();
    const t = h('table', { class: 't' }, h('thead', { html: '<tr><th></th><th>Parameter</th><th>Is</th><th>Value</th><th>High value</th><th></th></tr>' }), tb);
    modal(f.id ? 'Edit filter' : 'New filter', h('div', null,
      h('div', { class: 'form' }, UI.panels.field('Filter name', name), UI.panels.field('Match', match)),
      h('div', { style: { overflowX: 'auto', marginTop: '10px' } }, t),
      h('button', { class: 'btn sm', type: 'button', style: { marginTop: '8px' }, text: '+ Add rule', onclick: () => { f.rules.push({ col: 'start', op: 'nextN', value: '30' }); draw(); } }),
      count), [
      { label: 'Cancel', value: null },
      { label: 'Apply only', action: () => { f.name = name.value || 'Filter'; f.match = match.value; f.id = f.id || 'u:' + Date.now().toString(36); S.filtersOn = [f]; S.collapsed.clear(); UI.refresh({ noSave: true }); return true; } },
      { label: 'Save & apply', cls: 'pri', action: () => {
        f.name = name.value.trim() || 'My filter'; f.match = match.value;
        const list = userFilters();
        if (!f.id || String(f.id).startsWith('b:')) f.id = 'u:' + Date.now().toString(36);
        const k = list.findIndex((x) => x.id === f.id);
        if (k >= 0) list[k] = f; else list.push(f);
        saveUserFilters(list);
        S.filtersOn = [f]; S.collapsed.clear();
        UI.refresh({ noSave: true });
        toast('Filter "' + f.name + '" saved and applied.', 'g');
        return true;
      } }
    ], 'wide');
  }

  /* ================================================================== *
   * Group & Sort
   * ================================================================== */
  function groupOptions() {
    const out = [['wbs', 'WBS (hierarchy)'], ['area', 'Area / plant'], ['building', 'Building'], ['epc', 'EPC phase'], ['status', 'Activity status'], ['lens', 'Update flag']];
    for (const ct of S.P.codeTypes) out.push(['code:' + ct.name, 'Code: ' + ct.name]);
    for (let i = 1; i <= Math.min(S.P.maxWbsLevel(), 6); i++) out.push(['wbs:' + i, 'WBS level ' + i]);
    ['type', 'calendar', 'crit', 'longest', 'tf', 'pct', 'start', 'finish', 'cstrType', 'pctType', 'touched'].forEach((id) => { const c = SE.columns.get(S.P, id); if (c) out.push([id, c.label + (c.t === 'date' ? ' (month)' : c.id === 'tf' ? ' (bands)' : '')]); });
    for (const u of S.P.udfTypes) out.push(['udf:' + u.name, 'UDF: ' + u.name]);
    return out;
  }
  function groupSortDialog() {
    const opts = groupOptions();
    const levels = S.groupBy.length ? S.groupBy.slice() : [];
    const sorts = (Array.isArray(S.sort) ? S.sort : [S.sort]).filter(Boolean).map((x) => Object.assign({}, x));
    const gt = h('tbody'), st = h('tbody');
    const cols = SE.columns.list(S.P);
    const summary = h('input', { type: 'checkbox', id: 'gs_sum' });
    summary.checked = !!S.noActs;
    const drawG = () => {
      gt.innerHTML = '';
      levels.forEach((k, i) => {
        const sel = h('select', { class: 'inp' }, opts.map((o) => h('option', { value: o[0], text: o[1] })));
        sel.value = k;
        sel.onchange = () => { levels[i] = sel.value; if (sel.value === 'wbs') { levels.length = 0; levels.push('wbs'); } drawG(); };
        gt.append(h('tr', null, h('td', { text: i === 0 ? 'Group by' : 'then by' }), h('td', null, sel), h('td', null, h('button', { class: 'btn sm', type: 'button', text: '✕', 'aria-label': 'Remove level', onclick: () => { levels.splice(i, 1); drawG(); } }))));
      });
      if (!levels.length) gt.append(h('tr', null, h('td', { colspan: 3, class: 'sub', style: { color: 'var(--ink-3)' }, text: 'No grouping - a flat list of activities.' })));
      addG.disabled = levels.includes('wbs') || levels.length >= 4;
    };
    const drawS = () => {
      st.innerHTML = '';
      sorts.forEach((s, i) => {
        const sel = h('select', { class: 'inp' });
        SE.columns.CATS.forEach((cat) => { const g = h('optgroup', { label: cat }); cols.filter((c) => c.cat === cat).forEach((c) => g.append(h('option', { value: c.id, text: c.label }))); if (g.children.length) sel.append(g); });
        sel.value = s.key;
        sel.onchange = () => { s.key = sel.value; };
        const dir = h('select', { class: 'inp', style: { width: 'auto' } }, h('option', { value: 'asc', text: 'Ascending' }), h('option', { value: 'desc', text: 'Descending' }));
        dir.value = s.dir || 'asc';
        dir.onchange = () => { s.dir = dir.value; };
        st.append(h('tr', null, h('td', { text: i === 0 ? 'Sort by' : 'then by' }), h('td', null, sel), h('td', null, dir), h('td', null, h('button', { class: 'btn sm', type: 'button', text: '✕', 'aria-label': 'Remove sort', onclick: () => { sorts.splice(i, 1); drawS(); } }))));
      });
    };
    const addG = h('button', { class: 'btn sm', type: 'button', text: '+ Add group level', onclick: () => { levels.push(levels.length ? 'epc' : 'building'); drawG(); } });
    drawG(); drawS();
    modal('Group & Sort', h('div', { class: 'cols2' },
      h('div', null, h('h3', { style: { marginTop: 0 }, text: 'Group by' }), h('table', { class: 't' }, gt), h('div', { style: { marginTop: '8px' } }, addG),
        h('label', { style: { display: 'flex', gap: '8px', alignItems: 'center', marginTop: '14px' } }, summary, 'Show group bands only (hide activities)'),
        h('p', { class: 'sub', style: { color: 'var(--ink-3)' }, text: 'WBS groups by the full hierarchy. Codes, buildings, EPC and any column can be nested up to 4 levels.' })),
      h('div', null, h('h3', { style: { marginTop: 0 }, text: 'Sort activities within groups' }), h('table', { class: 't' }, st), h('div', { style: { marginTop: '8px' } }, h('button', { class: 'btn sm', type: 'button', text: '+ Add sort', onclick: () => { sorts.push({ key: 'finish', dir: 'asc' }); drawS(); } })))), [
      { label: 'Default (WBS, by start)', action: () => { levels.length = 0; levels.push('wbs'); sorts.length = 0; sorts.push({ key: 'start', dir: 'asc' }); drawG(); drawS(); return false; } },
      { spacer: true },
      { label: 'Cancel', value: null },
      { label: 'Apply', cls: 'pri', action: () => {
        S.noActs = summary.checked;
        S.sort = sorts.length ? sorts : [{ key: 'start', dir: 'asc' }];
        UI.setGroup(levels.length ? levels.join(',') : 'none');
        return true;
      } }
    ], 'wide');
  }

  /* ================================================================== *
   * Levels
   * ================================================================== */
  const levels = {
    info() { return SE.views.groupLevels(S.P, UI.rowOpts()); },
    to(n) {
      const inf = this.info();
      S.noActs = false;
      S.collapsed = new Set();
      for (const [lv, ids] of inf.byLevel) if (lv >= n - 1) ids.forEach((id) => S.collapsed.add(id));
      UI.refresh({ noSave: true });
      UI.toast('Collapsed to level ' + n + ' of ' + (inf.max + 1) + '.', 'i');
    },
    all() { S.collapsed.clear(); S.noActs = false; UI.refresh({ noSave: true }); },
    none() { const inf = this.info(); S.collapsed = new Set(); for (const [, ids] of inf.byLevel) ids.forEach((id) => S.collapsed.add(id)); UI.refresh({ noSave: true }); },
    bands(on) { S.noActs = on == null ? !S.noActs : on; S.collapsed.clear(); UI.refresh({ noSave: true }); },
    max() { return S.P ? this.info().max + 1 : 1; }
  };

  /* ================================================================== *
   * Layouts
   * ================================================================== */
  const BUILTIN = [
    { name: 'Classic Schedule', cols: ['flag', 'code', 'name', 'origDur', 'remDur', 'pct', 'start', 'finish', 'tf'], group: 'wbs', sort: [{ key: 'start', dir: 'asc' }], zoom: 'month', baseline: true },
    { name: 'Monthly Update (status)', cols: ['flag', 'code', 'name', 'status', 'origDur', 'remDur', 'prevPct', 'pct', 'plannedPct', 'start', 'finish', 'aStart', 'aFinish', 'expFinish', 'tf', 'notes'], group: 'wbs', sort: [{ key: 'start', dir: 'asc' }], zoom: 'month', baseline: true },
    { name: 'Building → EPC update', cols: ['flag', 'code', 'name', 'status', 'remDur', 'prevPct', 'pct', 'aStart', 'aFinish', 'finish', 'tf', 'notes'], group: 'building,epc', sort: [{ key: 'start', dir: 'asc' }], zoom: 'month', baseline: true },
    { name: 'Baseline Comparison', cols: ['flag', 'code', 'name', 'blStart', 'blFinish', 'start', 'finish', 'varStart', 'varFinishBL', 'blDur', 'atCompDur', 'varDur'], group: 'wbs', sort: [{ key: 'start', dir: 'asc' }], zoom: 'month', baseline: true },
    { name: 'Last Update Comparison', cols: ['flag', 'code', 'name', 'prevStart', 'prevFinish', 'start', 'finish', 'movFinish', 'prevPct', 'pct', 'periodPct'], group: 'wbs', sort: [{ key: 'movFinish', dir: 'desc' }], zoom: 'month', baseline: false },
    { name: 'Float & Critical Path', cols: ['flag', 'code', 'name', 'remDur', 'start', 'finish', 'lStart', 'lFinish', 'tf', 'ff', 'crit', 'longest'], group: 'tf', sort: [{ key: 'tf', dir: 'asc' }], zoom: 'month', floatBars: true, rels: true },
    { name: '4-week Look-ahead', cols: ['flag', 'code', 'name', 'building', 'epc', 'status', 'remDur', 'pct', 'start', 'finish', 'tf', 'notes'], group: 'building', sort: [{ key: 'start', dir: 'asc' }], zoom: 'week', filters: ['b:la30'] },
    { name: 'Logic Review', cols: ['flag', 'code', 'name', 'nPreds', 'preds', 'nSuccs', 'succs', 'cstrType', 'cstrDate', 'tf'], group: 'wbs', sort: [{ key: 'start', dir: 'asc' }], zoom: 'month', rels: true },
    { name: 'Quantities', cols: ['flag', 'code', 'name', 'building', 'qtyUnit', 'qtyScope', 'qtyDone', 'qtyBal', 'qtyPct', 'pct', 'remDur', 'finish'], group: 'building', sort: [{ key: 'start', dir: 'asc' }], zoom: 'month', filters: ['b:qty'] },
    { name: 'Summary (WBS bands only)', cols: ['code', 'name', 'origDur', 'pct', 'plannedPct', 'pctVar', 'start', 'finish', 'blFinish', 'var', 'tf'], group: 'wbs', sort: [{ key: 'start', dir: 'asc' }], zoom: 'quarter', bandsOnly: true }
  ];
  const userLayouts = () => LS.get('se.layouts', []);
  function capture(name) {
    return {
      name, cols: S.layout.cols.slice(), widths: Object.assign({}, S.layout.widths), freeze: S.layout.freeze, group: S.groupKey, sort: JSON.parse(JSON.stringify(Array.isArray(S.sort) ? S.sort : [S.sort])),
      zoom: S.zoom, baseline: S.showBaseline, rels: S.showRels, colors: S.colorRows, labels: S.showLabels, barLabel: S.barLabel, floatBars: S.floatBars, bandsOnly: S.noActs,
      filters: S.filtersOn.map((f) => f.id), filterMatch: S.filterMatch, level: S.levelSel || null
    };
  }
  function apply(L) {
    const cols = (L.cols || UI.grid.DEFAULT).filter((id) => id === 'flag' || SE.columns.get(S.P, id));
    S.layout.cols = cols.length ? cols : UI.grid.DEFAULT.slice();
    if (L.widths) S.layout.widths = Object.assign({}, L.widths);
    S.layout.freeze = L.freeze != null ? L.freeze : Math.min(3, S.layout.cols.indexOf('name') + 1 || 2);
    UI.grid.persist();
    S.sort = L.sort || [{ key: 'start', dir: 'asc' }];
    if (L.zoom) { S.zoom = L.zoom; const z = $('#zoomSel'); if (z) z.value = S.zoom; }
    if (L.baseline != null) S.showBaseline = L.baseline;
    S.showRels = !!L.rels;
    if (L.colors != null) S.colorRows = L.colors;
    if (L.labels != null) S.showLabels = L.labels;
    if (L.barLabel) S.barLabel = L.barLabel;
    S.floatBars = !!L.floatBars;
    const all = allFilters();
    S.filtersOn = (L.filters || []).map((id) => all.find((f) => f.id === id)).filter(Boolean);
    S.filterMatch = L.filterMatch || 'all';
    S.noActs = !!L.bandsOnly;
    S.layoutName = L.name;
    UI.syncToggles && UI.syncToggles();
    UI.setGroup(L.group || 'wbs');
    if (L.level) levels.to(L.level);
    const ls = $('#layoutSel'); if (ls) ls.value = L.name;
    LS.set('se.layout.last', L.name);
  }
  function layoutSelect() {
    const sel = h('select', { id: 'layoutSel', 'aria-label': 'Layout' });
    const fill = () => {
      sel.innerHTML = '';
      const g1 = h('optgroup', { label: 'Built-in layouts' }); BUILTIN.forEach((l) => g1.append(h('option', { value: l.name, text: l.name })));
      sel.append(g1);
      const u = userLayouts();
      if (u.length) { const g2 = h('optgroup', { label: 'Your layouts' }); u.forEach((l) => g2.append(h('option', { value: l.name, text: l.name }))); sel.append(g2); }
      if (S.layoutName) sel.value = S.layoutName;
    };
    fill();
    sel.onchange = () => { const L = BUILTIN.concat(userLayouts()).find((l) => l.name === sel.value); if (L && S.P) { apply(L); toast('Layout "' + L.name + '" applied.', 'i'); } };
    sel._fill = fill;
    return sel;
  }
  function saveDialog() {
    const name = h('input', { class: 'inp', id: 'lay_name', value: S.layoutName && !BUILTIN.some((b) => b.name === S.layoutName) ? S.layoutName : 'My layout' });
    const u = userLayouts();
    const list = h('ul', { class: 'ins' });
    const draw = () => {
      list.innerHTML = '';
      userLayouts().forEach((l) => list.append(h('li', null, h('b', { text: l.name }), ' · ' + l.cols.length + ' columns · group ' + (l.group || 'none') + ' ',
        h('button', { class: 'btn sm danger', type: 'button', text: 'Delete', onclick: () => { LS.set('se.layouts', userLayouts().filter((x) => x.name !== l.name)); draw(); const s = $('#layoutSel'); if (s) s._fill(); } }))));
      if (!userLayouts().length) list.append(h('li', { text: 'No saved layouts yet.' }));
    };
    draw(); void u;
    modal('Save layout', h('div', null,
      h('p', { style: { marginTop: 0 }, text: 'A layout saves the columns and widths, frozen columns, grouping, sort, filters, timescale, bar options and bands-only view - like a P6 layout.' }),
      UI.panels.field('Layout name', name), h('h3', { text: 'Saved layouts' }), list,
      h('div', { class: 'inrow', style: { marginTop: '10px' } },
        h('button', { class: 'btn sm', type: 'button', text: 'Export layouts (.json)', onclick: () => UI.io.download(JSON.stringify({ layouts: userLayouts(), filters: userFilters() }, null, 1), 'ScheduleEngine_layouts.json', 'application/json') }),
        h('label', { class: 'btn sm', style: { cursor: 'pointer' } }, 'Import layouts…', h('input', { type: 'file', accept: '.json', hidden: true, onchange: (e) => { const f = e.target.files[0]; if (!f) return; f.text().then((t) => { try { const o = JSON.parse(t); const L = userLayouts(); (o.layouts || []).forEach((l) => { const k = L.findIndex((x) => x.name === l.name); if (k >= 0) L[k] = l; else L.push(l); }); LS.set('se.layouts', L); const F = userFilters(); (o.filters || []).forEach((x) => { if (!F.some((y) => y.id === x.id)) F.push(x); }); saveUserFilters(F); draw(); const s = $('#layoutSel'); if (s) s._fill(); toast('Layouts imported.', 'g'); } catch (er) { toast('Not a layouts file.', 'e'); } }); } })))), [
      { label: 'Close', value: null },
      { label: 'Save current layout', cls: 'pri', action: () => {
        const n = name.value.trim();
        if (!n) { toast('Enter a name.', 'e'); return false; }
        if (BUILTIN.some((b) => b.name === n)) { toast('That name is a built-in layout - choose another.', 'e'); return false; }
        const L = userLayouts().filter((x) => x.name !== n);
        L.push(capture(n));
        LS.set('se.layouts', L);
        S.layoutName = n;
        const s = $('#layoutSel'); if (s) { s._fill(); s.value = n; }
        toast('Layout "' + n + '" saved.', 'g');
        return true;
      } }
    ]);
  }

  /* ================================================================== *
   * Go to activity
   * ================================================================== */
  function goTo() {
    if (!S.P) return;
    const dl = h('datalist', { id: 'dl_goto' }, S.P.acts.slice(0, 8000).map((a) => h('option', { value: a.code, label: a.name })));
    const inp = h('input', { class: 'inp', id: 'goto_in', list: 'dl_goto', placeholder: 'Activity ID or part of the name', style: { fontSize: '15px' } });
    modal('Go to activity', h('div', null, dl, inp), [
      { label: 'Cancel', value: null },
      { label: 'Go', cls: 'pri', action: () => {
        const q = inp.value.trim().toLowerCase();
        const a = S.P.acts.find((x) => x.code.toLowerCase() === q) || S.P.acts.find((x) => (x.code + ' ' + x.name).toLowerCase().includes(q));
        if (!a) { toast('No activity matches "' + inp.value + '".', 'e'); return false; }
        UI.setView('gantt');
        UI.grid.reveal(a.uid);
        return true;
      } }
    ], 'narrow');
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); inp.closest('.modal').querySelector('.btn.pri').click(); } });
  }

  UI.filtersUI = { dialog: filtersDialog, editor, pass: activeFilterPass, all: allFilters };
  UI.groupSortDialog = groupSortDialog;
  UI.levels = levels;
  UI.layouts = { BUILTIN, apply, capture, select: layoutSelect, saveDialog, user: userLayouts };
  UI.goTo = goTo;
  UI.LS = LS;
})();
