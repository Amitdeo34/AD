/* Schedule Engine - ui/workbar.js
 * Work bar under the view tabs: Building / EPC filter dropdowns, Concerns
 * only, raise concerns, table / Gantt pane toggles, Timeline strip toggle and
 * the quick Data Date picker. Also the Timeline strip + Timeline view and the
 * Concerns register view.
 */
(function () {
  'use strict';
  const D = SE.D;
  const { S, h, $, esc, toast, modal } = UI;
  const LS = UI.LS;
  S.pane = LS.get('se.pane', 'both');
  S.showTimeline = LS.get('se.timeline', true);
  S.concernsOnly = false;
  S.tl = LS.get('se.tlview', { by: 'building', ppm: 70 });

  /* ================================================================== *
   * dimension dropdown (multi-select popover)
   * ================================================================== */
  function dimDropdown(key, label) {
    const sel = S.dimSel[key];
    const txt = sel.size === 0 ? 'All' : sel.size === 1 ? Array.from(sel)[0] : sel.size + ' selected';
    const b = h('button', { class: 'ddbtn' + (sel.size ? ' on' : ''), type: 'button', title: 'Filter by ' + label.toLowerCase() + ' (applies to every view and to exports of the current view)', html: '<span>' + esc(label) + ':</span> <b>' + esc(txt) + '</b> ▾' });
    b.onclick = (e) => { e.stopPropagation(); openDim(b, key, label); };
    return b;
  }
  let pop = null;
  function closePop() { if (pop) { pop.remove(); pop = null; document.removeEventListener('mousedown', outPop, true); } }
  function outPop(e) { if (pop && !pop.contains(e.target)) closePop(); }
  function openDim(anchor, key, label) {
    closePop();
    const P = S.P;
    // buildings cascade from the chosen area(s)
    const scope = key === 'building' && S.dimSel.area.size ? P.acts.filter((a) => S.dimSel.area.has(P.dim(a, 'area'))) : undefined;
    const rows = SE.analysis.breakdown(P, key, S.fl, scope).filter((r) => r.count);
    const areaOf = new Map();
    if (key === 'building' && UI.hasAreas()) P.acts.forEach((a) => { const b = P.dim(a, 'building'); if (!areaOf.has(b)) areaOf.set(b, P.dim(a, 'area')); });
    const sel = new Set(S.dimSel[key]);
    pop = h('div', { class: 'ddpop', role: 'dialog', 'aria-label': label + ' filter' });
    const q = h('input', { class: 'inp', placeholder: 'Search ' + label.toLowerCase() + '…', 'aria-label': 'Search' });
    const list = h('div', { class: 'ddlist' });
    const draw = () => {
      list.innerHTML = '';
      let lastArea = null;
      rows.filter((r) => !q.value || (r.name + ' ' + (areaOf.get(r.name) || '')).toLowerCase().includes(q.value.toLowerCase()))
        .sort((x, y) => areaOf.size ? String(areaOf.get(x.name)).localeCompare(String(areaOf.get(y.name))) || rows.indexOf(x) - rows.indexOf(y) : 0).forEach((r) => {
        if (areaOf.size && areaOf.get(r.name) !== lastArea) { lastArea = areaOf.get(r.name); list.append(h('div', { class: 'ddhead', text: lastArea })); }
        const cb = h('input', { type: 'checkbox' });
        cb.checked = sel.has(r.name);
        cb.onchange = () => { if (cb.checked) sel.add(r.name); else sel.delete(r.name); };
        const only = h('button', { class: 'btn sm', type: 'button', text: 'Only', onclick: () => { sel.clear(); sel.add(r.name); apply(); } });
        list.append(h('label', { class: 'dditem' }, cb, h('span', { class: 'nm', text: areaOf.size ? r.name.replace(' (' + areaOf.get(r.name) + ')', '') : r.name, title: r.name }), h('small', { html: r.actual.toFixed(0) + '% · ' + r.count + (r.lateStart + r.overdue ? ' · <b class="crit-t">' + (r.lateStart + r.overdue) + ' late</b>' : '') }), only));
      });
    };
    const apply = () => { S.dimSel[key] = sel; S.collapsed.clear(); closePop(); UI.refresh({ noSave: true }); };
    q.oninput = draw;
    draw();
    pop.append(key === 'building' ? sourceBox(P) : '', q, list, h('div', { class: 'ddfoot' },
      h('button', { class: 'btn sm', type: 'button', text: 'All', onclick: () => { sel.clear(); apply(); } }),
      h('button', { class: 'btn sm', type: 'button', text: 'Invert', onclick: () => { rows.forEach((r) => { if (sel.has(r.name)) sel.delete(r.name); else sel.add(r.name); }); draw(); } }),
      h('span', { style: { flex: 1 } }),
      h('button', { class: 'btn sm pri', type: 'button', text: 'Apply', onclick: apply })));
    document.body.append(pop);
    const r = anchor.getBoundingClientRect();
    pop.style.left = Math.min(r.left, innerWidth - pop.offsetWidth - 8) + 'px';
    pop.style.top = (r.bottom + 4) + 'px';
    q.focus();
    setTimeout(() => document.addEventListener('mousedown', outPop, true), 0);
  }

  /** "Buildings from": pick the WBS level (or activity code) that holds the building names */
  function sourceBox(P) {
    const d = P.settings.dims;
    const idx = P.idx;
    const byLv = new Map();
    Object.values(P.wbs).forEach((w) => { const l = idx.level.get(w.id); if (!l) return; if (!byLv.has(l)) byLv.set(l, []); byLv.get(l).push(w.name); });
    const src = h('select', { class: 'inp', 'aria-label': 'Buildings from', title: 'Where building names come from' });
    src.append(h('option', { value: 'auto', text: 'Auto detect (building-like WBS names)' }));
    Array.from(byLv.keys()).sort((x, y) => x - y).forEach((l) => {
      const names = Array.from(new Set(byLv.get(l)));
      src.append(h('option', { value: 'wbs:' + l, text: 'WBS level ' + l + ' - ' + names.slice(0, 3).join(', ') + (names.length > 3 ? ' +' + (names.length - 3) : '') }));
    });
    P.codeTypes.forEach((c) => src.append(h('option', { value: 'code:' + c.name, text: 'Activity code: ' + c.name })));
    src.value = d.building.mode === 'wbs' ? 'wbs:' + d.building.wbsLevel : d.building.mode === 'code' ? 'code:' + d.building.codeType : 'auto';
    const qual = h('select', { class: 'inp', 'aria-label': 'Area name in building', title: 'Add the area (e.g. Pellet Plant-1) to the building name' });
    [['dup', 'Area name only when a building repeats'], ['all', 'Always add area name'], ['off', 'Never add area name']].forEach(([v, t]) => qual.append(h('option', { value: v, text: t })));
    qual.value = d.building.qualify === 'dup' ? 'dup' : d.building.qualify ? 'all' : 'off';
    const go = () => {
      const v = src.value, qv = qual.value === 'dup' ? 'dup' : qual.value === 'all';
      if (v === 'auto') d.building = { mode: 'auto', codeType: null, wbsLevel: null, qualify: qv };
      else if (v.startsWith('wbs:')) d.building = { mode: 'wbs', codeType: null, wbsLevel: +v.slice(4), qualify: qv };
      else d.building = { mode: 'code', codeType: v.slice(5), wbsLevel: null, qualify: qv };
      if (d.area && d.area.mode !== 'code') {
        const l = d.building.mode === 'wbs' ? d.building.wbsLevel - 1 : 0;
        d.area = l >= 1 ? { mode: 'wbs', codeType: null, wbsLevel: l } : { mode: 'auto', codeType: null, wbsLevel: null };
      }
      P.invalidate();
      S.dimSel.building.clear(); S.dimSel.area.clear(); S.collapsed.clear();
      closePop();
      UI.refresh();
      UI.toast('Buildings now from ' + src.options[src.selectedIndex].text.replace(/ - .*/, '') + '. ' + new Set(P.acts.map((a) => P.dim(a, 'building'))).size + ' buildings found.', 'g');
    };
    src.onchange = go; qual.onchange = go;
    return h('div', { class: 'ddsrc' }, h('label', null, h('span', { text: 'Buildings from' }), src), h('label', null, h('span', { text: 'Area name' }), qual));
  }

  /* ================================================================== *
   * work bar
   * ================================================================== */
  function render() {
    const P = S.P;
    const L = $('#wbLeft'), R = $('#wbRight');
    if (!P) { L.innerHTML = ''; R.innerHTML = ''; return; }
    L.innerHTML = ''; R.innerHTML = '';
    const nConcernFlag = S.fl.counts.needConcern || 0;
    const nConcern = S.fl.counts.concern || 0;
    const ddIn = h('input', { type: 'date', class: 'dd-in', id: 'wbDD', value: D.fmtISO(P.meta.dataDate), title: 'Data Date - status is recorded up to the day before', 'aria-label': 'Data Date' });
    ddIn.onchange = () => { const d = D.parseDay(ddIn.value); if (d != null) setDataDate(d, ddIn); };
    L.append(
      UI.hasAreas() ? dimDropdown('area', 'Area') : '', dimDropdown('building', 'Building'), dimDropdown('epc', 'EPC'),
      h('label', { class: 'ddbtn dd-date', title: 'Data Date' }, h('span', { text: 'Data Date:' }), ddIn),
      h('button', { class: 'ddbtn' + (S.concernsOnly ? ' on' : ''), type: 'button', title: 'Show only activities with a flag (late start, overdue, future progress, out of sequence, invalid) or a raised concern', html: '⚑ Concerns only' + (nConcernFlag ? ' <em class="cnt-badge">' + nConcernFlag + '</em>' : ''), onclick: () => { S.concernsOnly = !S.concernsOnly; S.collapsed.clear(); UI.refresh({ noSave: true }); } }),
      h('button', { class: 'ddbtn', type: 'button', title: 'Record a concern (reason, action, owner) for the selected activities', text: '+ Raise concern', onclick: () => raiseConcern() }));
    const seg = h('div', { class: 'seg mini', role: 'group', 'aria-label': 'Panes' });
    [['grid', 'Table'], ['both', 'Table + Gantt'], ['gantt', 'Gantt']].forEach(([k, l]) => seg.append(h('button', { type: 'button', 'aria-pressed': S.pane === k ? 'true' : 'false', text: l, title: k === 'grid' ? 'Hide the Gantt (Ctrl+Shift+G)' : k === 'gantt' ? 'Hide the table' : 'Show both', onclick: () => setPane(k) })));
    R.append(seg, h('button', { class: 'ddbtn' + (S.showTimeline ? ' on' : ''), type: 'button', title: 'Project timeline strip above the Gantt', text: '▭ Timeline', onclick: () => { S.showTimeline = !S.showTimeline; LS.set('se.timeline', S.showTimeline); applyPane(); } }),
      nConcern ? h('span', { class: 'sub wb-note', text: nConcern + ' concern' + (nConcern > 1 ? 's' : '') + ' raised' }) : '');
    applyPane();
  }
  function setPane(k) { S.pane = k; LS.set('se.pane', k); UI.syncToggles(); render(); }
  function applyPane() {
    const sp = $('#split');
    if (!sp) return;
    sp.classList.toggle('pm-grid', S.pane === 'grid');
    sp.classList.toggle('pm-gantt', S.pane === 'gantt');
    const tl = $('#tlstrip');
    tl.hidden = !(S.showTimeline && S.pane !== 'grid' && S.P);
    if (S.view === 'gantt') { requestAnimationFrame(() => { UI.gantt.render(true); UI.grid.renderBody(); strip(); }); }
  }
  function setDataDate(d, input) {
    const P = S.P;
    let maxAct = null;
    P.acts.forEach((a) => [a.aStart, a.aFinish].forEach((x) => { if (x != null && (maxAct == null || x > maxAct)) maxAct = x; }));
    if (maxAct != null && d <= maxAct) { toast('Data Date must be after ' + D.fmtLong(maxAct) + ' (latest actual date).', 'e'); if (input) input.value = D.fmtISO(P.meta.dataDate); return; }
    const old = P.meta.dataDate;
    if (d === old) return;
    P.meta.dataDate = d;
    if (P.meta.prevDataDate == null) P.meta.prevDataDate = old;
    P.settings.scheduled = false;
    P.log.push({ t: Date.now(), uid: null, code: '', field: 'Data Date', from: D.fmt(old), to: D.fmt(d) });
    UI.refresh();
    toast('Data Date set to ' + D.fmtLong(d) + '. Press F9 to reschedule.', 'g');
  }

  /* ================================================================== *
   * concerns
   * ================================================================== */
  function raiseConcern(uids) {
    const P = S.P;
    const list = (uids || (S.multi.size ? Array.from(S.multi) : S.sel ? [S.sel] : [])).map((u) => P.act(u)).filter(Boolean);
    if (!list.length) { toast('Select one or more activities first (the flagged ones are easiest with "Concerns only").', 'w'); return; }
    const a0 = list[0];
    const sug = a0.concern && a0.concern.text ? a0.concern : SE.analysis.suggestConcern(P, a0, S.fl.map.get(a0.uid));
    const cat = h('select', { class: 'inp', id: 'cn_cat' }, SE.CONCERN_CATS.map((c) => h('option', { value: c, text: c })));
    cat.value = sug.cat || 'Other';
    const text = h('textarea', { class: 'inp', id: 'cn_text', rows: 3 });
    text.value = list.length > 1 && !(a0.concern && a0.concern.text) ? '' : sug.text || '';
    const action = h('input', { class: 'inp', id: 'cn_action', value: sug.action || '', placeholder: 'e.g. Release balance drawings by 15-Oct' });
    const owner = h('input', { class: 'inp', id: 'cn_owner', value: sug.owner || '', placeholder: 'Who (vendor / team / person)' });
    const due = h('input', { class: 'inp', id: 'cn_due', type: 'date', value: sug.due != null ? D.fmtISO(sug.due) : '' });
    const flags = (S.fl.map.get(a0.uid) || []).filter((k) => SE.CONCERN_KEYS.includes(k));
    const body = h('div', null,
      h('div', { class: 'msg i', html: list.length > 1 ? 'The same concern is recorded on <b>' + list.length + '</b> activities. Each keeps its own flags.' : '<b class="mono">' + esc(a0.code) + '</b> ' + esc(a0.name) + (flags.length ? '<br>Flags: ' + flags.map((k) => SE.LENS_BY_KEY[k].short).join(', ') : '') }),
      h('p', { class: 'sub', style: { color: 'var(--ink-3)' }, text: 'A concern only records the reason and the recovery action - it does not change any dates or progress. It appears in the Concerns register, the Excel "Concerns" sheet and the PDF attention list.' }),
      h('div', { class: 'form' }, UI.panels.field('Category', cat), UI.panels.field('Owner', owner), UI.panels.field('Target date', due)),
      h('div', { class: 'fld', style: { marginTop: '10px' } }, h('label', { text: 'Concern / reason' }), text),
      h('div', { class: 'fld', style: { marginTop: '10px' } }, h('label', { text: 'Action to recover' }), action));
    const hasAny = list.some((a) => a.concern);
    return modal('Raise concern', body, [
      hasAny ? { label: 'Close concern', cls: 'danger', action: () => { UI.applyPatches(list.map((a) => ({ uid: a.uid, changes: { concern: null } })), 'Close concern', { quiet: true }); toast('Concern closed.', 'i'); return true; } } : null,
      { spacer: true },
      { label: 'Cancel', value: null },
      { label: 'Save concern', cls: 'pri', action: () => {
        if (!text.value.trim()) { toast('Write the concern / reason.', 'e'); text.focus(); return false; }
        const c = { cat: cat.value, text: text.value.trim(), action: action.value.trim(), owner: owner.value.trim(), due: due.value ? D.parseDay(due.value) : null, raised: P.meta.dataDate, auto: false };
        UI.applyPatches(list.map((a) => ({ uid: a.uid, changes: { concern: Object.assign({}, c) } })), 'Concern ' + (list.length > 1 ? '(' + list.length + ')' : a0.code), { quiet: true });
        toast('Concern saved on ' + list.length + ' activit' + (list.length > 1 ? 'ies' : 'y') + '.', 'g');
        return true;
      } }
    ].filter(Boolean));
  }
  function draftConcerns() {
    const P = S.P;
    const list = P.acts.filter((a) => !(a.concern && a.concern.text) && (S.fl.map.get(a.uid) || []).includes('needConcern') && UI.passes(a));
    if (!list.length) { toast('Every flagged activity in view already has a concern.', 'i'); return; }
    const patches = list.map((a) => ({ uid: a.uid, changes: { concern: Object.assign(SE.analysis.suggestConcern(P, a, S.fl.map.get(a.uid)), { raised: P.meta.dataDate }) } }));
    UI.applyPatches(patches, 'Draft concerns (' + list.length + ')', { quiet: true });
    toast(list.length + ' draft concerns written from the flags. Add the reason, action and owner in the Concerns register - drafts are marked "draft".', 'g', 'Concerns', 8000);
    UI.setView('concerns');
  }
  function renderConcerns() {
    const P = S.P;
    const v = $('#view-concerns');
    v.innerHTML = '';
    const pane = h('div', { class: 'pane' });
    v.append(pane);
    const show = S.concernView || 'all';
    const flagged = P.acts.filter((a) => UI.passes(a) && ((S.fl.map.get(a.uid) || []).some((k) => SE.CONCERN_KEYS.includes(k)) || (a.concern && a.concern.text)));
    const list = flagged.filter((a) => show === 'all' || (show === 'open' ? !(a.concern && a.concern.text) : a.concern && a.concern.text));
    const seg = h('div', { class: 'seg', role: 'group' });
    [['all', 'Flagged + concerns (' + flagged.length + ')'], ['open', 'Concern not raised (' + flagged.filter((a) => !(a.concern && a.concern.text)).length + ')'], ['raised', 'Raised (' + flagged.filter((a) => a.concern && a.concern.text).length + ')']].forEach(([k, l]) => seg.append(h('button', { type: 'button', 'aria-pressed': show === k ? 'true' : 'false', text: l, onclick: () => { S.concernView = k; renderConcerns(); } })));
    pane.append(h('div', { class: 'easybar' }, seg,
      h('button', { class: 'btn pri', type: 'button', text: 'Draft concerns for all flagged', title: 'Writes a suggested concern (from the flags) on every flagged activity without one', onclick: draftConcerns }),
      h('span', { class: 'sub', style: { color: 'var(--ink-3)' }, text: 'Concerns never change dates or progress. Building / EPC filters above apply.' })));
    const byB = new Map();
    list.forEach((a) => { const b = P.dim(a, 'building'); if (!byB.has(b)) byB.set(b, []); byB.get(b).push(a); });
    if (!list.length) pane.append(h('div', { class: 'card' }, h('div', { class: 'dempty', text: 'Nothing here - no flagged activities in this selection.' })));
    for (const [b, acts] of byB) {
      const t = h('table', { class: 't cnt' });
      t.innerHTML = '<thead><tr><th>Activity</th><th>EPC</th><th>Flags</th><th>Finish</th><th>Category</th><th>Concern / reason</th><th>Action</th><th>Owner</th><th>Target</th><th></th></tr></thead>';
      const tb = h('tbody');
      acts.sort((x, y) => (P.startOf(x) - P.startOf(y))).forEach((a) => {
        const c = a.concern || {};
        const f = (S.fl.map.get(a.uid) || []).filter((k) => SE.CONCERN_KEYS.includes(k));
        const save = (k, val) => { const nc = Object.assign({ raised: P.meta.dataDate }, a.concern || SE.analysis.suggestConcern(P, a, S.fl.map.get(a.uid)), { [k]: val, auto: false }); UI.applyPatches([{ uid: a.uid, changes: { concern: nc } }], 'Concern ' + a.code, { quiet: true, soft: () => {} }); tr.classList.remove('draft'); };
        const catSel = h('select', { class: 'inp' }, h('option', { value: '', text: '—' }), SE.CONCERN_CATS.map((x) => h('option', { value: x, text: x })));
        catSel.value = c.cat || '';
        catSel.onchange = () => save('cat', catSel.value);
        const tx = h('textarea', { class: 'inp', rows: 2, placeholder: 'Reason…' }); tx.value = c.text || '';
        tx.onchange = () => save('text', tx.value.trim());
        const ac = h('textarea', { class: 'inp', rows: 2, placeholder: 'Recovery action…' }); ac.value = c.action || '';
        ac.onchange = () => save('action', ac.value.trim());
        const ow = h('input', { class: 'inp', value: c.owner || '', placeholder: 'Owner' }); ow.onchange = () => save('owner', ow.value.trim());
        const du = h('input', { class: 'inp', type: 'date', value: c.due != null ? D.fmtISO(c.due) : '' }); du.onchange = () => save('due', du.value ? D.parseDay(du.value) : null);
        const tr = h('tr', { class: (c.auto ? 'draft' : '') + (!c.text ? ' noconcern' : '') },
          h('td', { html: '<a href="#" class="mono lnk">' + esc(a.code) + '</a><div>' + esc(a.name) + '</div>' + (c.auto ? '<span class="tag" style="background:var(--warn);color:#1b1b1b">draft</span>' : '') }),
          h('td', { text: P.dim(a, 'epc') }),
          h('td', { html: f.map((k) => '<span class="tag" style="background:' + SE.LENS_BY_KEY[k].color + '">' + esc(SE.LENS_BY_KEY[k].short) + '</span>').join(' ') || '—' }),
          h('td', { text: D.fmt(P.finishOf(a)) + (a.aFinish != null ? ' A' : '') }),
          h('td', null, catSel), h('td', null, tx), h('td', null, ac), h('td', null, ow), h('td', null, du),
          h('td', null, c.text ? h('button', { class: 'btn sm', type: 'button', text: 'Close', title: 'Remove the concern', onclick: () => { UI.applyPatches([{ uid: a.uid, changes: { concern: null } }], 'Close concern ' + a.code, { quiet: true, soft: () => {} }); renderConcerns(); } }) : ''));
        tr.querySelector('.lnk').onclick = (e) => { e.preventDefault(); UI.setView('gantt'); UI.grid.reveal(a.uid); };
        tb.append(tr);
      });
      t.append(tb);
      pane.append(h('div', { class: 'card', style: { marginBottom: '14px' } }, h('h3', { html: esc(b) + ' <small>' + acts.length + ' activities · ' + acts.filter((a) => a.concern && a.concern.text).length + ' concerns raised</small>' }), h('div', { style: { overflowX: 'auto' } }, t)));
    }
  }

  /* ================================================================== *
   * Timeline strip (above the Gantt)
   * ================================================================== */
  function strip() {
    const box = $('#tlstrip');
    if (!box || box.hidden || !S.P) return;
    const P = S.P;
    const cv = $('#tlCanvas');
    const W = box.clientWidth, H = 64;
    const dpr = window.devicePixelRatio || 1;
    cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px';
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cs = getComputedStyle(document.documentElement);
    const g = (n) => cs.getPropertyValue(n).trim();
    ctx.fillStyle = g('--surface-2'); ctx.fillRect(0, 0, W, H);
    const rg = SE.analysis.range(P);
    const t0 = D.monthStart(rg.start), t1 = D.addMonths(rg.finish, 1);
    const L = 12, Rr = 12;
    const X = (d) => L + (d - t0) / (t1 - t0) * (W - L - Rr);
    const dd = P.meta.dataDate;
    // months
    ctx.font = '10px ' + (g('--font-cond') || 'Arial');
    ctx.textBaseline = 'middle';
    let m = t0;
    const mw = X(D.addMonths(t0, 1)) - X(t0);
    while (m < t1) {
      const p = D.parts(m);
      ctx.fillStyle = g('--line'); ctx.fillRect(Math.round(X(m)), 38, 1, 22);
      if (mw > 22 || p.m % 3 === 0) { ctx.fillStyle = g('--ink-3'); ctx.fillText(SE.MONTHS[p.m] + (p.m === 0 || m === t0 ? ' ' + String(p.y).slice(2) : ''), X(m) + 3, 55); }
      m = D.addMonths(m, 1);
    }
    // project bar: actual (start→DD) and remaining (DD→finish)
    const ps = rg.start, pf = P.meta.scheduledFinish != null ? P.meta.scheduledFinish : rg.finish;
    ctx.fillStyle = g('--bar-actual'); ctx.fillRect(X(ps), 40, Math.max(1, X(Math.min(dd, pf)) - X(ps)), 8);
    ctx.fillStyle = g('--bar-remain'); ctx.fillRect(X(dd), 40, Math.max(1, X(pf + 1) - X(dd)), 8);
    const all = P.acts.filter((a) => !P.isSummaryType(a));
    const pr = SE.analysis.progressOf(P, all);
    // visible window of the Gantt
    const gb = $('#ganttBody');
    if (gb && S.pane !== 'grid') {
      const ppd = { day: 26, week: 7, month: 2.4, quarter: 0.9, year: 0.33 }[S.zoom] || 2.4;
      const gt0 = UI.gantt.t0 ? UI.gantt.t0() : null;
      if (gt0 != null) {
        const a = gt0 + gb.scrollLeft / ppd, b = a + gb.clientWidth / ppd;
        ctx.strokeStyle = g('--accent'); ctx.lineWidth = 1.5;
        ctx.strokeRect(X(Math.max(a, t0)), 34, Math.max(4, X(Math.min(b, t1)) - X(Math.max(a, t0))), 18);
        ctx.fillStyle = g('--accent'); ctx.globalAlpha = 0.08; ctx.fillRect(X(Math.max(a, t0)), 34, Math.max(4, X(Math.min(b, t1)) - X(Math.max(a, t0))), 18); ctx.globalAlpha = 1;
      }
    }
    // milestones
    const ms = all.filter((a) => P.isMilestone(a)).map((a) => ({ a, d: P.finishOf(a) })).filter((x) => x.d != null).sort((x, y) => x.d - y.d);
    let lastRight = [-1e9, -1e9];
    ms.forEach((x, i) => {
      const cx = X(x.d);
      ctx.fillStyle = x.a.status === 'CO' ? g('--bar-actual') : x.a.crit ? g('--bar-crit') : g('--bar-mile');
      ctx.beginPath(); ctx.moveTo(cx, 36); ctx.lineTo(cx + 5, 41); ctx.lineTo(cx, 46); ctx.lineTo(cx - 5, 41); ctx.closePath(); ctx.fill();
      const lbl = x.a.name.length > 26 ? x.a.name.slice(0, 25) + '…' : x.a.name;
      const tw = ctx.measureText(lbl + ' ' + D.fmt(x.d)).width;
      const tx = Math.max(2, Math.min(cx - 4, W - Rr - tw));
      const lane = lastRight[0] < tx - 8 ? 0 : lastRight[1] < tx - 8 ? 1 : -1;
      if (lane < 0) return;
      const y = lane ? 23 : 10;
      ctx.fillStyle = g('--ink-2');
      ctx.fillText(lbl, tx, y);
      ctx.fillStyle = g('--ink-3');
      ctx.fillText(D.fmt(x.d), tx + ctx.measureText(lbl + ' ').width, y);
      lastRight[lane] = tx + tw;
      ctx.strokeStyle = g('--line-2'); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cx, y + 5); ctx.lineTo(cx, 36); ctx.stroke();
      void i;
    });
    // data date
    ctx.strokeStyle = g('--dd'); ctx.lineWidth = 1.5; ctx.setLineDash([3, 2]);
    ctx.beginPath(); ctx.moveTo(X(dd), 30); ctx.lineTo(X(dd), 60); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = g('--dd'); ctx.font = '600 10px ' + (g('--font-cond') || 'Arial');
    ctx.fillText('DD ' + D.fmt(dd) + ' · ' + pr.actual.toFixed(0) + '% done', Math.min(X(dd) + 4, W - 130), 31);
    cv.onclick = (e) => {
      const r = cv.getBoundingClientRect();
      const d = t0 + (e.clientX - r.left - L) / (W - L - Rr) * (t1 - t0);
      UI.gantt.scrollToDay(Math.round(d));
    };
    cv.title = 'Project timeline - click to jump the Gantt to that date';
  }

  /* ================================================================== *
   * Timeline view (swimlanes)
   * ================================================================== */
  function renderTimeline() {
    const P = S.P;
    const v = $('#view-timeline');
    v.innerHTML = '';
    const pane = h('div', { class: 'pane' });
    v.append(pane);
    const seg = h('div', { class: 'seg', role: 'group' });
    [['area', 'Area lanes'], ['building', 'Building lanes'], ['epc', 'EPC lanes'], ['wbs:1', 'WBS level 1 lanes']].forEach(([k, l]) => seg.append(h('button', { type: 'button', 'aria-pressed': S.tl.by === k ? 'true' : 'false', text: l, onclick: () => { S.tl.by = k; LS.set('se.tlview', S.tl); renderTimeline(); } })));
    const zoom = h('input', { type: 'range', min: 25, max: 220, value: S.tl.ppm, 'aria-label': 'Zoom', style: { width: '140px' } });
    zoom.oninput = () => { S.tl.ppm = +zoom.value; LS.set('se.tlview', S.tl); drawTL(box); };
    pane.append(h('div', { class: 'easybar' }, h('b', { text: 'Timeline' }), seg, h('label', { class: 'sub', style: { display: 'flex', gap: '6px', alignItems: 'center' } }, 'Zoom', zoom),
      h('span', { class: 'sub', style: { color: 'var(--ink-3)' }, text: 'Bars: baseline (thin, yellow), actual (dark), remaining (blue), critical remaining (red). Click a bar to open it in the Gantt.' })));
    const box = h('div', { class: 'card tlcard' });
    pane.append(box);
    drawTL(box);
  }
  function drawTL(box) {
    const P = S.P;
    const key = S.tl.by;
    const sub = key === 'epc' || key === 'area' ? 'building' : 'epc';
    const acts = P.acts.filter((a) => !P.isSummaryType(a) && UI.passes(a));
    const lanes = new Map();
    acts.forEach((a) => { const l = P.dim(a, key); if (!lanes.has(l)) lanes.set(l, []); lanes.get(l).push(a); });
    let order = Array.from(lanes.keys());
    if (key === 'epc') order.sort((x, y) => SE.EPC.indexOf(x) - SE.EPC.indexOf(y));
    const rg = SE.analysis.range(P);
    const t0 = D.monthStart(rg.start), t1 = D.addMonths(rg.finish, 2);
    const ppm = S.tl.ppm;
    const ppd = ppm / 30.44;
    const LW = 190, W = LW + (t1 - t0) * ppd + 20;
    const X = (d) => LW + (d - t0) * ppd;
    const dd = P.meta.dataDate;
    const rowH = 18, laneHead = 26;
    let y = 34;
    const parts = [];
    const lanesOut = [];
    for (const ln of order) {
      const la = lanes.get(ln);
      const subs = new Map();
      la.forEach((a) => { const s = P.isMilestone(a) ? '◆ Milestones' : P.dim(a, sub); if (!subs.has(s)) subs.set(s, []); subs.get(s).push(a); });
      let so = Array.from(subs.keys());
      if (sub === 'epc') so.sort((x, y2) => (x === '◆ Milestones' ? 9 : SE.EPC.indexOf(x)) - (y2 === '◆ Milestones' ? 9 : SE.EPC.indexOf(y2)));
      const top = y;
      const pr = SE.analysis.progressOf(P, la);
      const sm = SE.views.summarize(P, la);
      lanesOut.push({ ln, top, pr, sm, n: la.length });
      y += laneHead;
      for (const s of so) {
        const g = subs.get(s);
        if (s === '◆ Milestones') {
          g.forEach((a) => { const d = P.finishOf(a); if (d == null) return; parts.push('<g class="tlms" data-uid="' + esc(a.uid) + '"><title>' + esc(a.code + ' ' + a.name + ' · ' + D.fmtLong(d) + (a.status === 'CO' ? ' (achieved)' : '')) + '</title><path d="M' + X(d) + ',' + (y + 3) + 'l6,6l-6,6l-6,-6z" class="' + (a.status === 'CO' ? 'm-done' : a.crit ? 'm-crit' : 'm-open') + '"/></g>'); });
          parts.push('<text x="' + (LW - 8) + '" y="' + (y + 13) + '" text-anchor="end" class="tl-sub">Milestones</text>');
          y += rowH; continue;
        }
        const sm2 = SE.views.summarize(P, g);
        if (sm2.start == null) continue;
        const crit = g.some((a) => a.crit && a.status !== 'CO');
        const bx = X(sm2.start), bw = Math.max(3, X(sm2.finish + 1) - X(sm2.start));
        if (sm2.blStart != null && sm2.blFinish != null) parts.push('<rect x="' + X(sm2.blStart) + '" y="' + (y + 13) + '" width="' + Math.max(2, X(sm2.blFinish + 1) - X(sm2.blStart)) + '" height="3" class="tl-bl"/>');
        const actEnd = Math.min(Math.max(dd, sm2.start), sm2.finish + 1);
        if (sm2.aStart != null) parts.push('<rect x="' + bx + '" y="' + (y + 3) + '" width="' + Math.max(0, X(actEnd) - bx) + '" height="9" rx="2" class="tl-act"/>');
        const rs = sm2.aStart != null ? actEnd : sm2.start;
        if (sm2.status !== 'CO' && sm2.finish + 1 > rs) parts.push('<rect x="' + X(rs) + '" y="' + (y + 3) + '" width="' + Math.max(2, X(sm2.finish + 1) - X(rs)) + '" height="9" rx="2" class="' + (crit ? 'tl-crit' : 'tl-rem') + '"/>');
        parts.push('<rect x="' + bx + '" y="' + (y + 1) + '" width="' + bw + '" height="14" class="tl-hit" data-lane="' + esc(ln) + '" data-sub="' + esc(s) + '"><title>' + esc(ln + ' · ' + s + '\n' + D.fmt(sm2.start) + ' → ' + D.fmt(sm2.finish) + '\n' + sm2.pct.toFixed(0) + '% done (' + sm2.planned.toFixed(0) + '% planned) · ' + g.length + ' activities') + '</title></rect>');
        parts.push('<text x="' + (LW - 8) + '" y="' + (y + 12) + '" text-anchor="end" class="tl-sub">' + esc(key === 'area' ? String(s).replace(' (' + ln + ')', '') : s) + ' · ' + sm2.pct.toFixed(0) + '%</text>');
        parts.push('<text x="' + (bx + bw + 5) + '" y="' + (y + 12) + '" class="tl-date">' + D.fmt(sm2.finish) + '</text>');
        y += rowH;
      }
      y += 10;
    }
    let svg = '<svg class="tlsvg" width="' + W + '" height="' + (y + 10) + '" role="img" aria-label="Timeline">';
    // month grid
    let m = t0;
    while (m < t1) {
      const p = D.parts(m);
      svg += '<line x1="' + X(m) + '" x2="' + X(m) + '" y1="20" y2="' + y + '" class="tl-grid' + (p.m === 0 ? ' yr' : '') + '"/>';
      if (ppm > 34 || p.m % 3 === 0) svg += '<text x="' + (X(m) + 3) + '" y="14" class="tl-mon">' + SE.MONTHS[p.m] + (p.m === 0 || m === t0 ? ' ' + p.y : '') + '</text>';
      m = D.addMonths(m, 1);
    }
    lanesOut.forEach((l, i) => {
      svg += '<rect x="0" y="' + l.top + '" width="' + W + '" height="' + (laneHead - 2) + '" class="tl-lane' + (i % 2 ? ' alt' : '') + '"/>';
      svg += '<text x="8" y="' + (l.top + 16) + '" class="tl-lanet">' + esc(l.ln.length > 26 ? l.ln.slice(0, 25) + '…' : l.ln) + '</text>';
      svg += '<text x="' + (LW - 8) + '" y="' + (l.top + 16) + '" text-anchor="end" class="tl-lanes">' + l.pr.actual.toFixed(0) + '% / ' + l.pr.planned.toFixed(0) + '%</text>';
      if (l.sm.start != null) svg += '<rect x="' + X(l.sm.start) + '" y="' + (l.top + 9) + '" width="' + Math.max(3, X(l.sm.finish + 1) - X(l.sm.start)) + '" height="6" class="tl-sum"/><text x="' + (X(l.sm.finish + 1) + 6) + '" y="' + (l.top + 16) + '" class="tl-date b">' + D.fmt(l.sm.finish) + '</text>';
    });
    svg += parts.join('');
    svg += '<line x1="' + X(dd) + '" x2="' + X(dd) + '" y1="18" y2="' + y + '" class="tl-dd"/><text x="' + (X(dd) + 4) + '" y="28" class="tl-ddt">Data Date ' + D.fmt(dd) + '</text>';
    svg += '</svg>';
    box.innerHTML = '<div class="tlscroll">' + svg + '</div>';
    const sc = box.querySelector('.tlscroll');
    sc.scrollLeft = Math.max(0, X(dd) - sc.clientWidth * 0.45);
    box.querySelectorAll('.tl-hit').forEach((r) => { r.addEventListener('click', () => { UI.clearFilters(); const k1 = key === 'wbs:1' ? null : key; if (k1) S.dimSel[k1] = new Set([r.dataset.lane]); const s2 = r.dataset.sub; if (SE.EPC.includes(s2)) S.dimSel.epc = new Set([s2]); else if (sub === 'building') S.dimSel.building = new Set([s2]); UI.setView('gantt'); }); });
    box.querySelectorAll('.tlms').forEach((g) => { g.addEventListener('click', () => { UI.setView('gantt'); UI.grid.reveal(g.dataset.uid); }); });
  }

  UI.workbar = { render, applyPane, setPane, strip, setDataDate, closePop };
  UI.concerns = { raise: raiseConcern, draft: draftConcerns, render: renderConcerns };
  UI.timeline = { render: renderTimeline, strip };
})();
