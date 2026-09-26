/* Schedule Engine - ui/panels.js
 * Detail pane, Easy Update, Dashboard, Health check, Changes, and the
 * dialogs (quantity calculator, bulk update, progress assistant, add /
 * delete activity, relationships, setup, insights, context menu).
 */
(function () {
  'use strict';
  const D = SE.D;
  const { S, h, $, esc, toast, modal } = UI;
  const A = () => SE.analysis;
  const selAct = () => (S.sel ? S.P.act(S.sel) : null);
  const selected = () => { const ids = S.multi.size ? Array.from(S.multi) : S.sel ? [S.sel] : []; return ids.map((u) => S.P.act(u)).filter(Boolean); };
  const tagFor = (k) => { const l = SE.LENS_BY_KEY[k]; return '<span class="tag" style="background:' + l.color + '" title="' + esc(l.desc) + '">' + esc(l.short) + '</span>'; };
  const mainFlags = (f) => (f || []).filter((k) => ['invalid', 'overdue', 'lateStart', 'future', 'outSeq', 'critical', 'pending'].includes(k));

  /* ================================================================== *
   * detail pane
   * ================================================================== */
  const TABS = [['status', 'Progress'], ['qty', 'Quantity'], ['rels', 'Relationships'], ['general', 'General'], ['why', 'Why flagged'], ['history', 'History']];
  function details() {
    const el = $('#details');
    if (!S.P) return;
    const a = selAct();
    el.innerHTML = '';
    const head = h('div', { class: 'dhead' });
    head.append(h('span', { class: 'ttl', html: a ? '<span class="mono">' + esc(a.code) + '</span>' + esc(a.name) : 'Select an activity' }));
    TABS.forEach(([k, l]) => head.append(h('button', { class: 'dt', 'aria-selected': S.detTab === k ? 'true' : 'false', text: l, onclick: () => { S.detTab = k; el.classList.remove('min'); details(); } })));
    head.append(h('span', { class: 'sp' }));
    head.append(h('button', { class: 'btn sm', text: el.classList.contains('min') ? 'Show' : 'Hide', onclick: () => { el.classList.toggle('min'); details(); UI.gantt.render(true); UI.grid.renderBody(); } }));
    head.addEventListener('mousedown', (e) => {
      if (e.target.closest('button')) return;
      e.preventDefault();
      const y0 = e.clientY, h0 = el.getBoundingClientRect().height;
      const mv = (ev) => { el.classList.remove('min'); el.style.setProperty('--det-h', Math.max(80, Math.min(innerHeight * 0.7, h0 - (ev.clientY - y0))) + 'px'); };
      const up = () => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); UI.gantt.render(true); UI.grid.renderBody(); };
      document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
    });
    el.append(head);
    const body = h('div', { class: 'dbody' });
    el.append(body);
    if (el.classList.contains('min')) return;
    if (!a) {
      body.append(h('div', { class: 'dempty', html: 'Click an activity to update it here. Tip: use the <b>Update spotlight</b> on the left to see what needs attention, or switch to <b>Easy Update</b>.' }));
      return;
    }
    ({ status: statusTab, qty: qtyTab, rels: relsTab, general: generalTab, why: whyTab, history: historyTab }[S.detTab] || statusTab)(body, a);
  }

  function field(label, input, sub) { return h('div', { class: 'fld' }, h('label', { text: label }), input, sub ? h('div', { class: 'sub', html: sub }) : null); }
  function statusTab(body, a) {
    const P = S.P;
    const ms = P.isMilestone(a);
    const msgs = h('div', { class: 'msgs' });
    const apply = (changes, label) => {
      const r = P.apply([{ uid: a.uid, changes }], label + ' ' + a.code);
      msgs.innerHTML = '';
      r.errors.forEach((m) => msgs.append(h('div', { class: 'msg e', text: m.msg })));
      r.warnings.forEach((m) => msgs.append(h('div', { class: 'msg w', text: m.msg })));
      r.infos.forEach((m) => msgs.append(h('div', { class: 'msg i', text: m.msg })));
      if (r.applied) { UI.refresh(); const m2 = $('#details .msgs'); if (m2) m2.replaceWith(msgs); }
      return r;
    };
    const dateIn = (key) => {
      const i = h('input', { id: 'det_' + key, value: D.fmt(a[key]), placeholder: 'dd-mmm-yy', autocomplete: 'off' });
      i.addEventListener('change', () => { const r = apply({ [key]: i.value }, (key === 'aStart' ? 'Actual Start' : 'Actual Finish')); if (r.errors.length) i.focus(); });
      i.addEventListener('keydown', (e) => { if (e.key === 'Enter') i.blur(); });
      return i;
    };
    const asIn = dateIn('aStart'), afIn = dateIn('aFinish');
    const pctNum = h('input', { id: 'det_pct', type: 'number', min: 0, max: 100, step: 1, value: Math.round(a.pct || 0), disabled: ms || a.status === 'CO', style: { width: '70px' } });
    const pctRange = h('input', { type: 'range', min: 0, max: 100, step: 1, value: Math.round(a.pct || 0), disabled: ms || a.status === 'CO', 'aria-label': '% complete slider', style: { flex: 1, accentColor: 'var(--brand-2)' } });
    pctRange.oninput = () => { pctNum.value = pctRange.value; };
    pctRange.onchange = () => apply({ pct: pctRange.value }, '% Complete');
    pctNum.onchange = () => apply({ pct: pctNum.value }, '% Complete');
    const rdIn = h('input', { id: 'det_rd', type: 'number', min: 0, step: 1, value: a.status === 'CO' ? 0 : a.remDur, disabled: ms || a.status === 'CO' });
    rdIn.onchange = () => apply({ remDur: rdIn.value }, 'Remaining Duration');
    const efIn = h('input', { id: 'det_ef', value: a.status === 'CO' ? '' : D.fmt(a.eFinish), placeholder: 'dd-mmm-yy', disabled: ms || a.status === 'CO' });
    efIn.onchange = () => { if (efIn.value.trim()) apply({ expFinish: efIn.value }, 'Expected Finish'); };
    const rs = P.refStart(a), rf = P.refFinish(a), dd = P.meta.dataDate;
    const quick = h('div', { class: 'quick', style: { gridColumn: '1 / -1' } });
    const q = (label, changes, title) => quick.append(h('button', { type: 'button', text: label, title: title || label, onclick: () => apply(changes, label) }));
    if (a.status === 'NS' && rs != null && rs < dd) q('Started on plan (' + D.fmt(rs) + ')', ms && a.type === 'finish' ? { aFinish: rs } : { aStart: rs });
    if (a.status !== 'CO' && rf != null && rf < dd) q('Finished on plan (' + D.fmt(rf) + ')', { aFinish: rf, aStart: a.aStart != null ? a.aStart : rs != null && rs <= rf ? rs : rf });
    if (a.status !== 'CO') q('Finished by ' + D.fmt(dd - 1), { aFinish: D.fmt(dd - 1) }, 'Actual Finish = day before the Data Date');
    if (a.status === 'IP' && !ms) [10, 25].forEach((n) => q('+' + n + '%', { pct: Math.min(99, (a.pct || 0) + n) }));
    if (a.status !== 'NS') q('Reset to not started', { aFinish: null, aStart: null }, 'Clears actual dates and progress');
    if (!ms && a.status !== 'CO') quick.append(h('button', { type: 'button', text: 'Qty calculator…', onclick: () => qtyDialog(a.uid) }));
    const form = h('div', { class: 'form' },
      field('Status', h('div', { class: 'ro', html: '<span class="pill ' + a.status + '">' + SE.STATUS[a.status] + '</span>' + (a.crit && a.status !== 'CO' ? ' <b class="crit-t">Critical</b>' : '') })),
      field('Actual Start', asIn, 'Plan ' + D.fmt(rs) + ' · shortcuts: <b>p</b> plan, <b>dd</b> day before DD'),
      field('Actual Finish', afIn, a.status === 'CO' ? 'Clear it to re-open the activity' : 'Plan ' + D.fmt(rf)),
      ms ? null : field('% Complete', h('div', { class: 'inrow', style: { alignItems: 'center' } }, pctRange, pctNum), a.prev ? 'Last update: ' + Math.round(a.prev.status === 'CO' ? 100 : a.prev.pct || 0) + '%' + (a.pctType === 'dur' ? ' · duration % type' : '') : ''),
      ms ? null : field('Remaining Duration (d)', rdIn, 'Original ' + a.origDur + 'd'),
      ms ? null : field('Expected Finish', efIn, 'Sets remaining duration from the Data Date'),
      quick);
    const cmp = h('div', { class: 'cmp' });
    const row = (l, x, y) => { cmp.append(h('span', { text: l, style: { color: 'var(--ink-3)' } }), h('span', { html: x }), h('span', { html: y })); };
    cmp.append(h('span', { class: 'h', text: '' }), h('span', { class: 'h', text: 'Last update' }), h('span', { class: 'h', text: 'Now' }));
    const pv = a.prev || {};
    row('Status', SE.STATUS[pv.status] || '—', SE.STATUS[a.status]);
    row('% complete', (pv.status === 'CO' ? 100 : Math.round(pv.pct || 0)) + '%', Math.round(a.pct || 0) + '%');
    row('Actual start', D.fmt(pv.aStart) || '—', D.fmt(a.aStart) || '—');
    row('Actual finish', D.fmt(pv.aFinish) || '—', D.fmt(a.aFinish) || '—');
    row('Start', D.fmt(pv.start), D.fmt(P.startOf(a)));
    row('Finish', D.fmt(pv.finish), D.fmt(P.finishOf(a)) + (pv.finish != null && P.finishOf(a) != null && P.finishOf(a) !== pv.finish ? ' <b class="' + (P.finishOf(a) > pv.finish ? 'crit-t' : '') + '">(' + (P.finishOf(a) > pv.finish ? '+' : '') + P.cal(a).between(pv.finish, P.finishOf(a)) + 'd)</b>' : ''));
    row('Remaining', pv.remDur != null ? pv.remDur + 'd' : '—', (a.status === 'CO' ? 0 : a.remDur) + 'd');
    row('Total float', pv.tf != null ? Math.round(pv.tf) + 'd' : '—', a.tf != null && a.status !== 'CO' ? Math.round(a.tf) + 'd' : '—');
    if (a.bl) row('Baseline', D.fmt(a.bl.start) + ' → ' + D.fmt(a.bl.finish), '');
    const f = S.fl.map.get(a.uid) || [];
    const flagsBox = h('div', { html: mainFlags(f).map(tagFor).join(' ') || '<span style="color:var(--ink-3)">No flags</span>', style: { marginTop: '10px', display: 'flex', gap: '4px', flexWrap: 'wrap' } });
    body.append(h('div', { class: 'cols2' }, h('div', null, form, msgs), h('div', null, cmp, flagsBox)));
  }

  function qtyTab(body, a) {
    body.append(qtyCalc(a, false));
  }
  /* quantity calculator (used in tab and dialog) */
  function qtyCalc(a, inDialog, done) {
    const P = S.P;
    const q = JSON.parse(JSON.stringify(a.qty || { unit: '', scope: null, done: 0, items: [] }));
    if (q.base == null) q.base = a.qty ? a.qty.done || 0 : 0;
    const wrap = h('div');
    const unit = h('input', { id: 'q_unit', value: q.unit || '', placeholder: 'Cum / MT / Nos / Rmt', style: { width: '120px' } });
    const scope = h('input', { id: 'q_scope', type: 'number', min: 0, step: 'any', value: q.scope != null ? q.scope : '' });
    const prevDone = h('div', { class: 'ro', text: String(q.base || 0) });
    const month = h('input', { id: 'q_month', type: 'number', step: 'any', placeholder: 'this month' });
    const cum = h('input', { id: 'q_cum', type: 'number', min: 0, step: 'any', value: q.done != null ? q.done : '' });
    const res = h('div', { class: 'qres' });
    const note = h('div', { class: 'sub' });
    const steps = h('table', { class: 't' });
    q.items = q.items || [];
    const pctOut = () => {
      const sc = parseFloat(scope.value), dn = parseFloat(cum.value);
      let p = null;
      if (q.items.length) {
        let w = 0, s = 0;
        q.items.forEach((it) => { const wt = +it.weight || 0; w += wt; s += wt * Math.min(100, Math.max(0, +it.pct || 0)); });
        p = w ? s / w : null;
      } else if (sc > 0 && isFinite(dn)) p = Math.min(100, dn / sc * 100);
      return p;
    };
    const upd = () => {
      const p = pctOut();
      res.textContent = p == null ? '—' : (Math.round(p * 10) / 10) + ' %';
      const sc = parseFloat(scope.value), dn = parseFloat(cum.value);
      note.innerHTML = q.items.length ? 'Weighted % of ' + q.items.length + ' steps' : sc > 0 && isFinite(dn) ? esc(dn + ' of ' + sc + ' ' + (unit.value || '')) + ' · balance ' + Math.max(0, Math.round((sc - dn) * 100) / 100) + ' ' + esc(unit.value || '') + (dn > sc ? ' <b class="crit-t">Completed quantity exceeds scope</b>' : '') : 'Enter scope and completed quantity';
      applyBtn.disabled = p == null;
      applyBtn.textContent = p == null ? 'Apply % complete' : p >= 100 ? 'Mark complete…' : 'Apply ' + (Math.round(p * 10) / 10) + '% to ' + a.code;
    };
    month.addEventListener('input', () => { const m = parseFloat(month.value); cum.value = isFinite(m) ? Math.round(((+q.base || 0) + m) * 1000) / 1000 : q.done; upd(); });
    [scope, cum, unit].forEach((i) => i.addEventListener('input', upd));
    const drawSteps = () => {
      steps.innerHTML = '<thead><tr><th>Step / sub-item</th><th>Weight %</th><th>% done</th><th></th></tr></thead>';
      const tb = h('tbody');
      q.items.forEach((it, k) => {
        const d = h('input', { class: 'inp', value: it.desc || '', placeholder: 'e.g. Shuttering' });
        const w = h('input', { class: 'inp', type: 'number', value: it.weight || 0, style: { width: '70px' } });
        const p = h('input', { class: 'inp', type: 'number', value: it.pct || 0, min: 0, max: 100, style: { width: '70px' } });
        d.oninput = () => { it.desc = d.value; }; w.oninput = () => { it.weight = +w.value; upd(); }; p.oninput = () => { it.pct = +p.value; upd(); };
        tb.append(h('tr', null, h('td', null, d), h('td', null, w), h('td', null, p), h('td', null, h('button', { class: 'btn sm', text: '✕', 'aria-label': 'Remove step', onclick: () => { q.items.splice(k, 1); drawSteps(); upd(); } }))));
      });
      steps.append(tb);
    };
    const addStep = h('button', { class: 'btn sm', text: '+ Add weighted step', onclick: () => { if (!q.items.length) q.items.push({ desc: 'Step 1', weight: 50, pct: 0 }, { desc: 'Step 2', weight: 50, pct: 0 }); else q.items.push({ desc: 'Step ' + (q.items.length + 1), weight: 10, pct: 0 }); drawSteps(); upd(); } });
    const templ = h('select', { class: 'inp', style: { width: 'auto' }, 'aria-label': 'Step templates' },
      h('option', { value: '', text: 'Step template…' }),
      h('option', { value: 'rcc', text: 'RCC: shutter 30 / rebar 30 / concrete 30 / deshutter 10' }),
      h('option', { value: 'steel', text: 'Steel: fabrication 40 / erection 45 / alignment 15' }),
      h('option', { value: 'mep', text: 'MEP: supports 20 / install 50 / termination 15 / test 15' }),
      h('option', { value: 'eng', text: 'Engineering: draft 40 / review 30 / approval 30' }));
    templ.onchange = () => {
      const T = { rcc: [['Shuttering', 30], ['Reinforcement', 30], ['Concreting', 30], ['De-shuttering & curing', 10]], steel: [['Fabrication', 40], ['Erection', 45], ['Alignment & bolting', 15]], mep: [['Supports', 20], ['Installation', 50], ['Termination', 15], ['Testing', 15]], eng: [['Draft', 40], ['Internal review', 30], ['Client approval', 30]] }[templ.value];
      if (T) { q.items = T.map((x) => ({ desc: x[0], weight: x[1], pct: 0 })); drawSteps(); upd(); }
      templ.value = '';
    };
    const save = (withPct) => {
      const nq = { unit: unit.value.trim(), scope: scope.value === '' ? null : +scope.value, done: cum.value === '' ? 0 : +cum.value, items: q.items, base: q.base };
      const p = pctOut();
      if (withPct && p != null && p >= 100) {
        const afIn = h('input', { class: 'inp', value: D.fmt(P.meta.dataDate - 1), id: 'q_af' });
        return modal('Quantity is 100% - enter the Actual Finish', h('div', null, h('p', { text: 'An activity reaches 100% only with an Actual Finish date (before ' + D.fmtLong(P.meta.dataDate) + ').' }), afIn), [
          { label: 'Cancel', value: null },
          { label: 'Complete activity', cls: 'pri', action: () => { const r = UI.applyPatches([{ uid: a.uid, changes: { qty: nq, aFinish: afIn.value } }], 'Qty complete ' + a.code); return r.errors.length ? false : true; } }
        ], 'narrow').then((v) => { if (v && done) done(); });
      }
      const ch = { qty: nq };
      if (withPct && p != null) ch.pct = Math.round(p * 10) / 10;
      const r = UI.applyPatches([{ uid: a.uid, changes: ch }], (withPct ? 'Qty % ' : 'Qty ') + a.code);
      if (!r.errors.length && done) done();
      return r;
    };
    const applyBtn = h('button', { class: 'btn pri', onclick: () => save(true) });
    const saveBtn = h('button', { class: 'btn', text: 'Save quantities only', onclick: () => save(false) });
    wrap.append(
      h('div', { class: 'cols2' },
        h('div', null,
          h('div', { class: 'form' },
            field('Unit', unit), field('Scope quantity', scope),
            field('Done at last update', prevDone), field('Done this month (+)', month, 'Adds to the last-update quantity'),
            field('Cumulative done till date', cum)),
          h('div', { style: { marginTop: '12px', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' } }, addStep, templ),
          steps),
        h('div', null, h('div', { class: 'fld' }, h('label', { text: 'Physical % complete' }), res, note),
          h('div', { style: { display: 'flex', gap: '8px', marginTop: '14px', flexWrap: 'wrap' } }, applyBtn, saveBtn),
          h('div', { class: 'msg i', style: { marginTop: '12px' }, html: 'Current % in schedule: <b>' + Math.round(a.pct || 0) + '%</b>' + (a.prev ? ' · last update ' + Math.round(a.prev.pct || 0) + '%' : '') + '. Use steps when the work has stages of different weight (rules of credit).' }))));
    drawSteps(); upd();
    void inDialog;
    return wrap;
  }
  function qtyDialog(uid) {
    const a = uid ? S.P.act(uid) : selAct();
    if (!a) { toast('Select an activity first.', 'w'); return; }
    if (S.P.isMilestone(a)) { toast('Milestones have no quantity - enter the actual date instead.', 'w'); return; }
    let close;
    const p = modal('Quantity calculator - ' + a.code + ' ' + a.name, qtyCalc(a, true, () => close && close()), [{ label: 'Close', value: null }], 'wide');
    close = () => { const bgs = document.querySelectorAll('.modal-bg'); const bg = bgs[bgs.length - 1]; if (bg) bg.querySelector('.mh button').click(); };
    return p;
  }

  function relsTab(body, a) {
    const P = S.P;
    const mk = (list, isPred) => {
      const t = h('table', { class: 't' });
      t.innerHTML = '<thead><tr><th>' + (isPred ? 'Predecessor' : 'Successor') + '</th><th>Name</th><th>Type</th><th>Lag</th><th>Status</th><th>Finish</th><th></th></tr></thead>';
      const tb = h('tbody');
      if (!list.length) tb.append(h('tr', null, h('td', { colspan: 7, style: { color: 'var(--ink-3)' }, text: 'None - ' + (isPred ? 'open start' : 'open end') + (P.rels.length ? ' (missing logic)' : '') })));
      list.forEach((r) => {
        const o = P.act(isPred ? r.pred : r.succ);
        if (!o) return;
        const tr = h('tr', { class: 'click' },
          h('td', { class: 'mono', text: o.code }), h('td', { text: o.name }), h('td', { text: r.type }), h('td', { text: r.lag ? r.lag + 'd' : '0' }),
          h('td', { html: '<span class="pill ' + o.status + '">' + SE.STATUS[o.status] + '</span>' }), h('td', { text: D.fmt(P.finishOf(o)) }),
          h('td', null, h('button', { class: 'btn sm danger', text: 'Remove', onclick: (e) => { e.stopPropagation(); P.removeRel(r.id); UI.refresh(); toast('Relationship removed. Press F9 to reschedule.', 'i'); } })));
        tr.onclick = () => UI.grid.reveal(o.uid);
        tb.append(tr);
      });
      t.append(tb);
      return t;
    };
    body.append(h('div', { class: 'cols2' }, h('div', null, mk(P.predsOf(a.uid), true), h('button', { class: 'btn sm', style: { marginTop: '8px' }, text: '+ Add predecessor', onclick: () => relDialog(null, a.uid) })),
      h('div', null, mk(P.succsOf(a.uid), false), h('button', { class: 'btn sm', style: { marginTop: '8px' }, text: '+ Add successor', onclick: () => relDialog(a.uid, null) }))));
  }

  function generalTab(body, a) {
    const P = S.P;
    const name = h('input', { value: a.name, id: 'g_name' });
    name.onchange = () => UI.applyPatches([{ uid: a.uid, changes: { name: name.value } }], 'Rename ' + a.code);
    const bIn = h('input', { value: a.dimOverride && a.dimOverride.building || '', placeholder: P.dim(a, 'building'), id: 'g_b', list: 'dl_b' });
    const eSel = h('select', { id: 'g_e' }, h('option', { value: '', text: 'Automatic (' + P.dim(Object.assign({}, a, { dimOverride: {} }), 'epc') + ')' }), SE.EPC.map((e) => h('option', { value: e, text: e })));
    eSel.value = a.dimOverride && a.dimOverride.epc || '';
    const dl = h('datalist', { id: 'dl_b' }, Array.from(new Set(P.acts.map((x) => P.dim(x, 'building')))).map((v) => h('option', { value: v })));
    const setDim = () => UI.applyPatches([{ uid: a.uid, changes: { dimOverride: { building: bIn.value.trim() || undefined, epc: eSel.value || undefined } } }], 'Building/EPC ' + a.code);
    bIn.onchange = setDim; eSel.onchange = setDim;
    const notes = h('textarea', { id: 'g_notes', rows: 3, text: a.notes || '' });
    notes.value = a.notes || '';
    notes.onchange = () => UI.applyPatches([{ uid: a.uid, changes: { notes: notes.value } }], 'Remarks ' + a.code);
    const cal = P.cal(a);
    const codes = Object.keys(a.codes).map((k) => esc(k) + ': <b>' + esc(P.codeLabel(k, a.codes[k])) + '</b>').join('<br>') || '—';
    const udf = Object.keys(a.udf || {}).map((k) => esc(k) + ': <b>' + esc(a.udf[k]) + '</b>').join('<br>');
    body.append(h('div', { class: 'form' },
      field('Activity name', name), field('Activity ID', h('div', { class: 'ro mono', text: a.code })),
      field('WBS', h('div', { class: 'ro', text: P.wbsPathText(a.wbsId) || '—' })),
      field('Type', h('div', { class: 'ro', text: SE.TYPE_LABEL[a.type] + ' · % type ' + ({ phys: 'Physical', dur: 'Duration', units: 'Units' }[a.pctType]) })),
      field('Calendar', h('div', { class: 'ro', text: cal.name + ' · ' + cal.hoursPerDay + 'h/day' })),
      field('Constraint', h('div', { class: 'ro', text: a.cstr ? (SE.CSTR_LABEL[a.cstr.type] || a.cstr.type) + ' ' + D.fmt(a.cstr.date) : 'None' })),
      field('Building (override)', h('div', null, bIn, dl), 'Leave empty to use ' + esc(P.settings.dims.building.mode === 'code' ? 'the activity code' : P.settings.dims.building.mode === 'wbs' ? 'WBS level ' + P.settings.dims.building.wbsLevel : 'auto detection')),
      field('EPC phase (override)', eSel),
      field('Activity codes', h('div', { class: 'ro', html: codes })),
      udf ? field('User fields', h('div', { class: 'ro', html: udf })) : null,
      field('Remarks / reason for delay', notes)));
  }

  function whyTab(body, a) {
    const P = S.P;
    const f = S.fl.map.get(a.uid) || [];
    if (!f.length) { body.append(h('div', { class: 'dempty', text: 'No flags on this activity.' })); return; }
    const ul = h('ul', { class: 'ins' });
    const rs = P.refStart(a), rf = P.refFinish(a);
    const dd = P.meta.dataDate;
    const fixes = {
      lateStart: 'Planned/last-forecast start ' + D.fmt(rs) + ' is before the Data Date ' + D.fmt(dd) + ' and there is no Actual Start. If it started, enter the Actual Start; if not, add a remark with the reason - the F9 schedule will push it to the Data Date.',
      overdue: 'It was due to finish on ' + D.fmt(rf) + '. If it finished, enter the Actual Finish. If not, update % complete and remaining duration (or type an Expected Finish).',
      future: 'It was planned to start on ' + D.fmt(rs) + ' (after the Data Date) yet shows progress. Confirm the Actual Start ' + D.fmt(a.aStart) + ' is real.',
      outSeq: 'A predecessor has not finished/started yet. Check the Relationships tab - either the logic is wrong or the progress is.',
      invalid: 'Actual dates must be before the Data Date and the status must match the dates.',
      pending: 'This activity is due this period or in progress and has not been touched in this update.',
      critical: 'Zero or negative float - any delay moves the project finish.',
      negFloat: 'Finish is later than a constraint or the must-finish date allows.',
      openEnd: 'Missing predecessor or successor. Add logic so the schedule can calculate float correctly.',
      due: 'Planned to start or finish between the last Data Date and this one.',
      inProgress: 'Update % complete and remaining duration every month.',
      lookahead: 'Starts in the next 4 weeks - make sure fronts, drawings, material and manpower are ready.',
      updated: 'Changed in this session.'
    };
    f.forEach((k) => ul.append(h('li', { class: ['invalid', 'overdue', 'negFloat'].includes(k) ? 'bad' : ['lateStart', 'future', 'outSeq', 'pending'].includes(k) ? 'warn' : k === 'updated' ? 'good' : '', html: '<b>' + esc(SE.LENS_BY_KEY[k].label) + '.</b> ' + esc(fixes[k] || SE.LENS_BY_KEY[k].desc) })));
    body.append(ul);
  }
  function historyTab(body, a) {
    const P = S.P;
    const log = P.log.filter((l) => l.uid === a.uid).slice(-80).reverse();
    if (!log.length) { body.append(h('div', { class: 'dempty', text: 'No changes to this activity in this session.' })); return; }
    const t = h('table', { class: 't' });
    t.innerHTML = '<thead><tr><th>When</th><th>Field</th><th>From</th><th>To</th></tr></thead>';
    const tb = h('tbody');
    const fv = (k, v) => (v == null ? '—' : ['aStart', 'aFinish', 'eFinish'].includes(k) && typeof v === 'number' ? D.fmt(v) : typeof v === 'object' ? JSON.stringify(v).slice(0, 60) : String(v));
    log.forEach((l) => tb.append(h('tr', null, h('td', { text: new Date(l.t).toLocaleString('en-IN') }), h('td', { text: l.field }), h('td', { text: fv(l.field, l.from) }), h('td', { text: fv(l.field, l.to) }))));
    t.append(tb);
    body.append(t);
  }

  /* ================================================================== *
   * context menu
   * ================================================================== */
  function contextMenu(x, y, a) {
    const P = S.P;
    const sel = selected();
    const many = sel.length > 1;
    const rs = P.refStart(a), rf = P.refFinish(a), dd = P.meta.dataDate;
    UI.menu(x, y, [
      many ? { label: 'Bulk update ' + sel.length + ' activities…', run: () => bulkDialog() } : null,
      many ? '-' : null,
      !many && a.status === 'NS' && rs != null && rs < dd ? { label: 'Started on plan (' + D.fmt(rs) + ')', run: () => UI.applyPatches([{ uid: a.uid, changes: P.isMilestone(a) && a.type === 'finish' ? { aFinish: rs } : { aStart: rs } }], 'Started on plan') } : null,
      !many && a.status !== 'CO' && rf != null && rf < dd ? { label: 'Finished on plan (' + D.fmt(rf) + ')', run: () => UI.applyPatches([{ uid: a.uid, changes: { aFinish: rf, aStart: a.aStart != null ? a.aStart : rs } }], 'Finished on plan') } : null,
      many ? { label: 'Mark all started on their planned start', run: () => UI.applyPatches(sel.filter((b) => b.status === 'NS' && P.refStart(b) < dd).map((b) => ({ uid: b.uid, changes: P.isMilestone(b) && b.type === 'finish' ? { aFinish: P.refStart(b) } : { aStart: P.refStart(b) } })), 'Bulk started on plan') } : null,
      many ? { label: 'Mark all finished on their planned finish', run: () => UI.applyPatches(sel.filter((b) => b.status !== 'CO' && P.refFinish(b) < dd).map((b) => ({ uid: b.uid, changes: { aFinish: P.refFinish(b), aStart: b.aStart != null ? b.aStart : P.refStart(b) } })), 'Bulk finished on plan') } : null,
      !many && !P.isMilestone(a) ? { label: 'Quantity calculator…', run: () => qtyDialog(a.uid) } : null,
      '-',
      { label: 'Add successor…', run: () => relDialog(a.uid, null) },
      { label: 'Add predecessor…', run: () => relDialog(null, a.uid) },
      { label: 'Add activity in same WBS…', run: () => addActivityDialog(a) },
      '-',
      { label: 'Show predecessors & successors', run: () => { S.detTab = 'rels'; details(); } },
      { label: 'Why is it flagged?', run: () => { S.detTab = 'why'; details(); } },
      { label: 'Copy Activity ID', run: () => { try { navigator.clipboard.writeText(a.code).then(() => toast('Copied ' + a.code, 'g'), () => toast(a.code, 'i', 'Activity ID')); } catch (e) { toast(a.code, 'i', 'Activity ID'); } } },
      '-',
      { label: many ? 'Delete ' + sel.length + ' activities…' : 'Delete activity…', run: () => deleteSelected() }
    ]);
  }

  /* ================================================================== *
   * dialogs
   * ================================================================== */
  function bulkDialog() {
    const P = S.P;
    let list = selected();
    const useView = h('input', { type: 'checkbox', id: 'bk_view' });
    const viewActs = S.rows.filter((r) => r.kind === 'act').map((r) => r.a);
    if (list.length < 2) useView.checked = true;
    const act = h('select', { class: 'inp', id: 'bk_act' },
      [['started', 'Mark started on planned start'], ['finished', 'Mark finished on planned finish'], ['aStart', 'Set Actual Start to…'], ['aFinish', 'Set Actual Finish to…'], ['pct', 'Set % complete to…'], ['addpct', 'Add % complete (+)…'], ['plannedPct', 'Set % = planned % at Data Date'], ['remDur', 'Set remaining duration (days) to…'], ['notes', 'Set remark to…']].map((o) => h('option', { value: o[0], text: o[1] })));
    const val = h('input', { class: 'inp', id: 'bk_val', placeholder: 'value' });
    const info = h('div', { class: 'msg i' });
    const count = () => {
      const l = useView.checked ? viewActs : list;
      const needs = ['aStart', 'aFinish', 'pct', 'addpct', 'remDur', 'notes'].includes(act.value);
      val.disabled = !needs;
      val.placeholder = act.value === 'aStart' || act.value === 'aFinish' ? 'e.g. ' + D.fmt(P.meta.dataDate - 1) : act.value === 'notes' ? 'remark text' : 'number';
      info.innerHTML = 'Applies to <b>' + l.length + '</b> activities ' + (useView.checked ? '(everything currently shown in the grid)' : '(selected rows)') + '. Each activity is validated separately - invalid ones are skipped and reported.';
    };
    useView.onchange = count; act.onchange = count; count();
    return modal('Bulk update', h('div', null,
      h('div', { class: 'form' }, field('Action', act), field('Value', val)),
      h('label', { style: { display: 'flex', gap: '8px', alignItems: 'center', margin: '12px 0' } }, useView, 'Apply to all activities shown in the grid (current filters)'),
      info), [
      { label: 'Cancel', value: null },
      { label: 'Apply', cls: 'pri', action: () => {
        list = useView.checked ? viewActs : list;
        const dd = P.meta.dataDate;
        const patches = [];
        for (const a of list) {
          if (P.isSummaryType(a)) continue;
          let ch = null;
          switch (act.value) {
            case 'started': if (a.status === 'NS' && P.refStart(a) != null && P.refStart(a) < dd) ch = P.isMilestone(a) && a.type === 'finish' ? { aFinish: P.refStart(a) } : { aStart: P.refStart(a) }; break;
            case 'finished': if (a.status !== 'CO' && P.refFinish(a) != null && P.refFinish(a) < dd) ch = { aFinish: P.refFinish(a), aStart: a.aStart != null ? a.aStart : P.refStart(a) }; break;
            case 'aStart': if (a.status === 'NS') ch = { aStart: val.value }; break;
            case 'aFinish': if (a.status !== 'CO') ch = { aFinish: val.value }; break;
            case 'pct': if (a.status !== 'CO' && !P.isMilestone(a)) ch = { pct: val.value }; break;
            case 'addpct': if (a.status !== 'CO' && !P.isMilestone(a)) ch = { pct: Math.min(99, (a.pct || 0) + (+val.value || 0)) }; break;
            case 'plannedPct': if (a.status !== 'CO' && !P.isMilestone(a)) { const p = Math.round(SE.analysis.plannedFrac(P, a, dd) * 100); if (p > 0) ch = { pct: Math.min(99, p) }; } break;
            case 'remDur': if (a.status !== 'CO' && !P.isMilestone(a)) ch = { remDur: val.value }; break;
            case 'notes': ch = { notes: val.value }; break;
          }
          if (ch) patches.push({ uid: a.uid, changes: ch });
        }
        if (!patches.length) { toast('Nothing to change for this action on these activities.', 'w'); return false; }
        const r = UI.applyPatches(patches, 'Bulk: ' + act.options[act.selectedIndex].text, { quiet: true });
        toast(r.applied + ' updated' + (r.errors.length ? ', ' + r.errors.length + ' rejected (see messages)' : '') + '.', r.errors.length ? 'w' : 'g', 'Bulk update');
        return true;
      } }
    ]);
  }

  function progressAssistant() {
    const P = S.P;
    const dd = P.meta.dataDate;
    const scope = S.rows.filter((r) => r.kind === 'act').map((r) => r.a);
    const sugg = [];
    for (const a of scope) {
      if (P.isSummaryType(a) || a.touched) continue;
      const rs = P.refStart(a), rf = P.refFinish(a);
      if (a.status !== 'CO' && rf != null && rf < dd) sugg.push({ a, what: 'Finish', changes: { aFinish: rf, aStart: a.aStart != null ? a.aStart : rs != null && rs <= rf ? rs : rf }, text: (a.aStart == null ? 'AS ' + D.fmt(rs) + ', ' : '') + 'AF ' + D.fmt(rf) });
      else if (a.status === 'NS' && rs != null && rs < dd) {
        if (P.isMilestone(a)) sugg.push({ a, what: 'Milestone', changes: a.type === 'finish' ? { aFinish: rs } : { aStart: rs }, text: 'Achieved ' + D.fmt(rs) });
        else { const p = Math.round(SE.analysis.plannedFrac(P, a, dd) * 100); sugg.push({ a, what: 'Start', changes: { aStart: rs, pct: Math.max(1, Math.min(99, p)) }, text: 'AS ' + D.fmt(rs) + ', ' + Math.max(1, Math.min(99, p)) + '%' }); }
      } else if (a.status === 'IP' && !P.isMilestone(a)) {
        const p = Math.round(SE.analysis.plannedFrac(P, a, dd) * 100);
        if (p > (a.pct || 0)) sugg.push({ a, what: 'Progress', changes: { pct: Math.min(99, p) }, text: (a.pct || 0) + '% → ' + Math.min(99, p) + '%' });
      }
    }
    if (!sugg.length) { toast('No planned progress to suggest for the activities shown (untouched ones only).', 'i'); return; }
    const t = h('table', { class: 't' });
    t.innerHTML = '<thead><tr><th><input type="checkbox" id="pa_all" aria-label="Select all"></th><th>Activity</th><th>Building</th><th>Suggestion</th><th>Plan</th></tr></thead>';
    const tb = h('tbody');
    sugg.forEach((s, k) => tb.append(h('tr', null, h('td', null, h('input', { type: 'checkbox', 'data-k': k, 'aria-label': 'Accept ' + s.a.code })), h('td', { html: '<span class="mono">' + esc(s.a.code) + '</span> ' + esc(s.a.name) }), h('td', { text: P.dim(s.a, 'building') }), h('td', { html: '<b>' + esc(s.what) + '</b> ' + esc(s.text) }), h('td', { text: D.fmt(P.refStart(s.a)) + ' → ' + D.fmt(P.refFinish(s.a)) }))));
    t.append(tb);
    const body = h('div', null, h('div', { class: 'msg w', html: 'These are what the <b>plan</b> says should have happened by ' + D.fmtLong(dd) + '. Tick only what actually happened on site - the engine will not guess for you.' }), h('div', { class: 'preview', style: { maxHeight: '55vh', marginTop: '10px' } }, t));
    setTimeout(() => { const all = $('#pa_all'); if (all) all.onchange = () => tb.querySelectorAll('input').forEach((i) => { i.checked = all.checked; }); }, 50);
    modal('Apply planned progress (' + sugg.length + ' suggestions)', body, [
      { label: 'Cancel', value: null },
      { label: 'Apply ticked', cls: 'pri', action: () => {
        const ks = Array.from(tb.querySelectorAll('input:checked')).map((i) => +i.dataset.k);
        if (!ks.length) { toast('Tick at least one row.', 'w'); return false; }
        const r = UI.applyPatches(ks.map((k) => ({ uid: sugg[k].a.uid, changes: sugg[k].changes })), 'Planned progress (' + ks.length + ')', { quiet: true });
        toast(r.applied + ' activities updated from plan' + (r.errors.length ? ', ' + r.errors.length + ' rejected' : '') + '. Press F9 to reschedule.', 'g');
        return true;
      } }
    ], 'wide');
  }

  function wbsOptions(P) {
    const out = [];
    const walk = (w, lv) => { out.push([w.id, '  '.repeat(lv) + (w.id === P.rootWbsId ? P.meta.name : w.name)]); for (const k of P.idx.kids.get(w.id) || []) walk(k, lv + 1); };
    if (P.rootWbsId && P.wbs[P.rootWbsId]) walk(P.wbs[P.rootWbsId], 0);
    for (const r of P.idx.roots) if (r.id !== P.rootWbsId) walk(r, 0);
    return out;
  }
  function addActivityDialog(near) {
    const P = S.P;
    near = near || selAct();
    const name = h('input', { class: 'inp', id: 'aa_name', placeholder: 'e.g. Cable tray installation' });
    const wbs = h('select', { class: 'inp', id: 'aa_wbs' }, wbsOptions(P).map(([id, l]) => h('option', { value: id, text: l })));
    if (near) wbs.value = near.wbsId;
    const code = h('input', { class: 'inp', id: 'aa_code', value: P.nextActCode(wbs.value) });
    wbs.onchange = () => { code.value = P.nextActCode(wbs.value); };
    const type = h('select', { class: 'inp', id: 'aa_type' }, [['task', 'Task'], ['start', 'Start milestone'], ['finish', 'Finish milestone']].map((o) => h('option', { value: o[0], text: o[1] })));
    const dur = h('input', { class: 'inp', id: 'aa_dur', type: 'number', min: 0, value: 10 });
    const pred = h('input', { class: 'inp', id: 'aa_pred', placeholder: 'Activity ID', list: 'dl_codes', value: near ? near.code : '' });
    const succ = h('input', { class: 'inp', id: 'aa_succ', placeholder: 'Activity ID (optional)', list: 'dl_codes' });
    const dl = h('datalist', { id: 'dl_codes' }, P.acts.slice(0, 5000).map((a) => h('option', { value: a.code, label: a.name })));
    return modal('Add activity', h('div', null, dl, h('div', { class: 'form' }, field('Activity name', name), field('Activity ID', code), field('WBS', wbs), field('Type', type), field('Original duration (days)', dur), field('Predecessor (FS)', pred), field('Successor (FS)', succ))), [
      { label: 'Cancel', value: null },
      { label: 'Add', cls: 'pri', action: () => {
        if (!name.value.trim()) { toast('Enter an activity name.', 'e'); return false; }
        if (P.acts.some((a) => a.code === code.value.trim())) { toast('Activity ID ' + code.value + ' already exists.', 'e'); return false; }
        const byCode = (c) => P.acts.find((a) => a.code === c.trim());
        if (pred.value.trim() && !byCode(pred.value)) { toast('Predecessor ' + pred.value + ' not found.', 'e'); return false; }
        if (succ.value.trim() && !byCode(succ.value)) { toast('Successor ' + succ.value + ' not found.', 'e'); return false; }
        const ms = type.value !== 'task';
        const d = ms ? 0 : Math.max(0, +dur.value || 0);
        const c = P.cal(null);
        const start = c.next(P.meta.dataDate);
        const a = P.addActivity({ name: name.value.trim(), code: code.value.trim(), wbsId: wbs.value, type: type.value, origDur: d, remDur: d, tStart: start, tFinish: ms ? start : c.finishFrom(start, d), eStart: start, eFinish: ms ? start : c.finishFrom(start, d) });
        if (pred.value.trim()) P.addRel(byCode(pred.value).uid, a.uid, 'FS', 0);
        if (succ.value.trim()) P.addRel(a.uid, byCode(succ.value).uid, 'FS', 0);
        UI.runSchedule(true);
        S.sel = a.uid;
        UI.grid.reveal(a.uid);
        toast(a.code + ' added and the schedule recalculated.', 'g');
        return true;
      } }
    ]);
  }
  function deleteSelected() {
    const P = S.P;
    const list = selected();
    if (!list.length) { toast('Select activities to delete.', 'w'); return; }
    const withProgress = list.filter((a) => a.status !== 'NS');
    modal('Delete ' + list.length + ' activit' + (list.length === 1 ? 'y' : 'ies') + '?', h('div', null,
      h('p', { html: list.slice(0, 12).map((a) => '<span class="mono">' + esc(a.code) + '</span> ' + esc(a.name)).join('<br>') + (list.length > 12 ? '<br>… and ' + (list.length - 12) + ' more' : '') }),
      withProgress.length ? h('div', { class: 'msg w', text: withProgress.length + ' of them already have progress. Deleting progressed work is unusual - consider leaving it and adding a remark.' }) : null,
      h('div', { class: 'msg i', text: 'Their relationships are removed too. The export XER will not contain them. This cannot be undone with Undo (reload the saved project to recover).' })), [
      { label: 'Cancel', value: null },
      { label: 'Delete', cls: 'danger', action: () => { list.forEach((a) => P.deleteActivity(a.uid)); S.sel = null; S.multi.clear(); UI.refresh(); toast(list.length + ' deleted. Press F9 to reschedule.', 'w'); return true; } }
    ], 'narrow');
  }
  function relDialog(predUid, succUid) {
    const P = S.P;
    const a = selAct();
    const dl = h('datalist', { id: 'dl_codes2' }, P.acts.slice(0, 5000).map((x) => h('option', { value: x.code, label: x.name })));
    const pred = h('input', { class: 'inp', id: 'rl_pred', list: 'dl_codes2', value: predUid ? P.act(predUid).code : (!succUid && a ? a.code : '') });
    const succ = h('input', { class: 'inp', id: 'rl_succ', list: 'dl_codes2', value: succUid ? P.act(succUid).code : '' });
    const type = h('select', { class: 'inp', id: 'rl_type' }, ['FS', 'SS', 'FF', 'SF'].map((t) => h('option', { value: t, text: t })));
    const lag = h('input', { class: 'inp', id: 'rl_lag', type: 'number', value: 0 });
    return modal('Add relationship', h('div', null, dl, h('div', { class: 'form' }, field('Predecessor', pred), field('Successor', succ), field('Type', type), field('Lag (working days)', lag, 'Negative = lead (avoid)'))), [
      { label: 'Cancel', value: null },
      { label: 'Add', cls: 'pri', action: () => {
        const p = P.acts.find((x) => x.code === pred.value.trim()), s = P.acts.find((x) => x.code === succ.value.trim());
        if (!p || !s) { toast('Both Activity IDs must exist.', 'e'); return false; }
        const r = P.addRel(p.uid, s.uid, type.value, +lag.value || 0);
        if (r.error) { toast(r.error, 'e'); return false; }
        UI.refresh();
        toast(p.code + ' → ' + s.code + ' ' + type.value + ' added. Press F9 to reschedule.', 'g');
        return true;
      } }
    ], 'narrow');
  }

  function settingsDialog() {
    const P = S.P;
    const d = P.settings.dims;
    const srcSel = (key) => {
      const s = h('select', { class: 'inp', id: 'set_' + key });
      s.append(h('option', { value: 'auto', text: 'Automatic (engine detects)' }));
      P.codeTypes.forEach((c) => s.append(h('option', { value: 'code:' + c.name, text: 'Activity code: ' + c.name })));
      for (let i = 1; i <= Math.min(P.maxWbsLevel(), 6); i++) s.append(h('option', { value: 'wbs:' + i, text: 'WBS level ' + i }));
      if (key === 'building') s.append(h('option', { value: 'none', text: 'Not used (single area)' }));
      const cur = d[key];
      s.value = cur.mode === 'code' ? 'code:' + cur.codeType : cur.mode === 'wbs' ? 'wbs:' + cur.wbsLevel : cur.mode;
      return s;
    };
    const bS = srcSel('building'), eS = srcSel('epc');
    const prev = h('div', { class: 'cols2', style: { marginTop: '12px' } });
    const readSel = (s) => { const v = s.value; if (v.startsWith('code:')) return { mode: 'code', codeType: v.slice(5), wbsLevel: null }; if (v.startsWith('wbs:')) return { mode: 'wbs', codeType: null, wbsLevel: +v.slice(4) }; return { mode: v, codeType: null, wbsLevel: null }; };
    const showPrev = () => {
      const save = JSON.stringify(d);
      d.building = readSel(bS); d.epc = readSel(eS); P.invalidate();
      const list = (key) => { const m = new Map(); P.acts.forEach((a) => { const v = P.dim(a, key); m.set(v, (m.get(v) || 0) + 1); }); return Array.from(m).slice(0, 30).map(([k, n]) => esc(k) + ' <span style="color:var(--ink-3)">(' + n + ')</span>').join('<br>'); };
      prev.innerHTML = '<div><b>Buildings found</b><div class="sub" style="margin-top:4px">' + list('building') + '</div></div><div><b>EPC split</b><div class="sub" style="margin-top:4px">' + list('epc') + '</div></div>';
      const o = JSON.parse(save); d.building = o.building; d.epc = o.epc; P.invalidate();
    };
    bS.onchange = showPrev; eS.onchange = showPrev; showPrev();
    const cb = (id, label, val, sub) => { const i = h('input', { type: 'checkbox', id }); i.checked = !!val; return h('label', { style: { display: 'flex', gap: '8px', alignItems: 'flex-start' } }, i, h('span', null, label, sub ? h('div', { class: 'sub', text: sub }) : null)); };
    const wSel = h('select', { class: 'inp', id: 'set_w' }, h('option', { value: 'duration', text: 'Original duration (default)' }), h('option', { value: 'equal', text: 'Equal weight per activity' }));
    wSel.value = P.settings.weight;
    const mf = h('input', { class: 'inp', id: 'set_mf', value: D.fmt(P.meta.mustFinish), placeholder: 'none' });
    const cals = Object.values(P.calendars).map((c) => '<tr><td>' + esc(c.name) + (c.id === P.defaultCalId ? ' <b>(default)</b>' : '') + '</td><td>' + ['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((x, i) => c.workWeek[i] ? '<b>' + x + '</b>' : '<span style="opacity:.35">' + x + '</span>').join(' ') + '</td><td>' + c.hoursPerDay + 'h</td><td>' + c.holidays.size + '</td><td>' + P.acts.filter((a) => a.calId === c.id).length + '</td></tr>').join('');
    const body = h('div', null,
      h('h3', { style: { marginTop: 0 }, text: 'Building & EPC grouping' }),
      h('div', { class: 'form' }, field('Building comes from', bS), field('EPC phase comes from', eS)), prev,
      h('h3', { text: 'Scheduling' }),
      h('div', { class: 'form' },
        cb('set_rl', 'Retained logic', P.settings.retainedLogic, 'Remaining work of out-of-sequence activities waits for predecessors (P6 default). Off = progress override.'),
        cb('set_ul', 'Use relationships', P.settings.useLogic, 'Off = date-driven: keep planned dates, push only what is late to the Data Date (for Excel/PDF schedules without logic).'),
        cb('set_lr', 'Link remaining duration to %', P.settings.linkRemaining, 'Typing % re-calculates remaining duration = original × (1 − %).'),
        cb('set_af', 'Smart auto-fill of actual start', P.settings.smartAutofill, 'Progress without an Actual Start fills it from the plan (shown as a note).'),
        field('Must finish by', mf, 'Drives late dates & negative float'),
        field('Progress weighting', wSel)),
      h('h3', { text: 'Calendars' }),
      h('table', { class: 't', html: '<thead><tr><th>Calendar</th><th>Work week</th><th>Hours/day</th><th>Holidays</th><th>Activities</th></tr></thead><tbody>' + cals + '</tbody>' }));
    modal('Setup', body, [
      { label: 'Cancel', value: null },
      { label: 'Save', cls: 'pri', action: () => {
        d.building = readSel(bS); d.epc = readSel(eS);
        P.settings.retainedLogic = $('#set_rl').checked; P.settings.useLogic = $('#set_ul').checked;
        P.settings.linkRemaining = $('#set_lr').checked; P.settings.smartAutofill = $('#set_af').checked;
        P.settings.weight = wSel.value;
        if (mf.value.trim()) { const p = D.parseDate(mf.value); if (!p) { toast('Must-finish date not understood.', 'e'); return false; } P.meta.mustFinish = p.day; } else P.meta.mustFinish = null;
        P.settings.scheduled = false;
        P.invalidate();
        UI.refresh();
        toast('Setup saved. Press F9 if scheduling options changed.', 'g');
        return true;
      } }
    ], 'wide');
  }

  function insightsDialog() {
    const ul = h('ul', { class: 'ins' });
    A().insights(S.P, S.fl).forEach((i) => {
      const li = h('li', { class: i.tone + (i.lens || i.dim ? ' click' : ''), html: esc(i.text) + (i.lens || i.dim ? '<span class="go">show →</span>' : '') });
      if (i.lens || i.dim) li.onclick = () => { document.querySelector('.modal-bg').remove(); goInsight(i); };
      ul.append(li);
    });
    modal('Engine insights', ul, null, 'wide');
  }
  function goInsight(i) {
    UI.clearFilters();
    if (i.lens) S.lensSel.add(i.lens);
    if (i.dim) S.dimSel[i.dim[0]].add(i.dim[1]);
    UI.setView('gantt');
  }

  /* ================================================================== *
   * Easy Update view
   * ================================================================== */
  S.easy = { group: 'building', show: 'need', q: '' };
  function renderEasy() {
    const P = S.P;
    const v = $('#view-easy');
    v.innerHTML = '';
    const wrap = h('div', { class: 'easy' });
    v.append(wrap);
    const seg = (key, opts) => {
      const s = h('div', { class: 'seg', role: 'group' });
      opts.forEach(([val, label]) => s.append(h('button', { 'aria-pressed': S.easy[key] === val ? 'true' : 'false', text: label, onclick: () => { S.easy[key] = val; renderEasy(); } })));
      return s;
    };
    const search = h('input', { class: 'inp', id: 'easy_q', placeholder: 'Filter by ID or name…', value: S.easy.q, style: { maxWidth: '240px' } });
    search.oninput = () => { S.easy.q = search.value.toLowerCase(); clearTimeout(search._t); search._t = setTimeout(() => { renderEasy(); const s2 = $('#easy_q'); s2.focus(); s2.setSelectionRange(s2.value.length, s2.value.length); }, 250); };
    wrap.append(h('div', { class: 'easybar' },
      h('b', { text: 'Update by' }), seg('group', [['building', 'Building'], ['epc', 'EPC'], ['building,epc', 'Building → EPC'], ['epc,building', 'EPC → Building'], ['wbs:1', 'WBS level 1']]),
      h('b', { text: 'Show' }), seg('show', [['need', 'Needs update'], ['due', 'Due / late'], ['open', 'All open'], ['all', 'All']]), search,
      h('span', { class: 'sub', style: { color: 'var(--ink-3)' }, text: 'Sidebar filters also apply. Changes save instantly and are validated.' })));
    const dd = P.meta.dataDate;
    const pick = (a) => {
      if (P.isSummaryType(a)) return false;
      if (!UI.passes(a)) return false;
      const f = S.fl.map.get(a.uid) || [];
      if (S.easy.q && (a.code + ' ' + a.name).toLowerCase().indexOf(S.easy.q) < 0) return false;
      if (S.easy.show === 'need') return f.includes('pending') || a.touched && a.prev && a.prev.status !== 'CO' && (f.includes('inProgress') || f.includes('due') || f.includes('lateStart') || f.includes('overdue') || a.status === 'CO');
      if (S.easy.show === 'due') return f.includes('lateStart') || f.includes('overdue') || f.includes('due') || f.includes('future');
      if (S.easy.show === 'open') return a.status !== 'CO' || a.touched;
      return true;
    };
    const keys = S.easy.group.split(',');
    const list = P.acts.filter(pick);
    if (!list.length) {
      wrap.append(h('div', { class: 'egroup' }, h('div', { class: 'dempty', html: S.easy.show === 'need' ? '<b>Nothing left to update</b> in this selection. Press <b>F9</b> to schedule, then export.' : 'No activities match.' })));
      return;
    }
    const groups = new Map();
    for (const a of list) { const g = P.dim(a, keys[0]); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(a); }
    const order = keys[0] === 'epc' ? Array.from(groups.keys()).sort((x, y) => SE.EPC.indexOf(x) - SE.EPC.indexOf(y)) : Array.from(groups.keys());
    let shown = 0;
    for (const g of order) {
      const acts = groups.get(g).sort((x, y) => (P.startOf(x) - P.startOf(y)));
      const allInG = P.acts.filter((a) => !P.isSummaryType(a) && P.dim(a, keys[0]) === g);
      const pr = A().progressOf(P, allInG);
      const pend = acts.filter((a) => (S.fl.map.get(a.uid) || []).includes('pending')).length;
      const gid = 'easy:' + S.easy.group + ':' + g;
      const shut = S.collapsed.has(gid);
      const box = h('div', { class: 'egroup' });
      const hd = h('div', { class: 'egh', onclick: () => { if (S.collapsed.has(gid)) S.collapsed.delete(gid); else S.collapsed.add(gid); renderEasy(); } },
        h('span', { text: shut ? '▶' : '▼', style: { color: 'var(--ink-3)' } }),
        h('div', null, h('h3', { text: g }), h('div', { class: 'sub', text: acts.length + ' shown · ' + pend + ' pending · ' + allInG.length + ' activities in total' })),
        h('div', { class: 'prog', title: 'Actual vs planned (marker)' }, h('div', { class: 'bullet', html: '<i style="width:' + pr.actual.toFixed(1) + '%;background:' + (pr.actual < pr.planned - 5 ? 'var(--bad)' : 'var(--accent)') + '"></i><b style="left:' + pr.planned.toFixed(1) + '%"></b>' }), h('span', { html: '<b>' + pr.actual.toFixed(1) + '%</b> / ' + pr.planned.toFixed(1) + '% plan' })));
      box.append(hd);
      if (!shut) {
        if (keys[1]) {
          const sub = new Map();
          acts.forEach((a) => { const s = P.dim(a, keys[1]); if (!sub.has(s)) sub.set(s, []); sub.get(s).push(a); });
          const so = keys[1] === 'epc' ? Array.from(sub.keys()).sort((x, y) => SE.EPC.indexOf(x) - SE.EPC.indexOf(y)) : Array.from(sub.keys());
          so.forEach((s) => { box.append(h('div', { class: 'egsub', text: s + ' (' + sub.get(s).length + ')' })); sub.get(s).forEach((a) => { if (shown++ < 1500) box.append(easyRow(a)); }); });
        } else acts.forEach((a) => { if (shown++ < 1500) box.append(easyRow(a)); });
      }
      wrap.append(box);
    }
    if (shown > 1500) wrap.append(h('div', { class: 'msg w', text: 'Showing the first 1,500 activities - narrow down with the filters.' }));
    void dd;
  }
  function easyRow(a) {
    const P = S.P;
    const dd = P.meta.dataDate;
    const ms = P.isMilestone(a);
    const row = h('div', { class: 'erow' + (a.touched ? ' done' : ''), 'data-uid': a.uid });
    const who = h('div', { class: 'who' });
    const plan = h('div', { class: 'plan' });
    const ins = h('div', { class: 'einputs' });
    const msg = h('div', { class: 'emsg' });
    const inp = (id, ph, w) => h('input', { id: 'e_' + id + '_' + a.uid, placeholder: ph, autocomplete: 'off', style: w ? { width: w } : null });
    const as = inp('as', 'dd-mmm-yy'), af = inp('af', 'dd-mmm-yy');
    const pn = h('input', { id: 'e_pct_' + a.uid, type: 'number', min: 0, max: 100, step: 1 });
    const pr = h('input', { type: 'range', min: 0, max: 100, step: 1, 'aria-label': '% complete' });
    const rd = h('input', { id: 'e_rd_' + a.uid, type: 'number', min: 0, step: 1 });
    const quick = h('div', { class: 'quick' });
    const sync = () => {
      const f = S.fl.map.get(a.uid) || [];
      who.innerHTML = '<div><b>' + esc(a.code) + '</b><span class="nm' + (a.crit && a.status !== 'CO' ? ' crit-t' : '') + '">' + (ms ? '◆ ' : '') + esc(a.name) + '</span></div><div class="fl"><span class="pill ' + a.status + '">' + SE.STATUS[a.status] + '</span>' + mainFlags(f).filter((k) => k !== 'pending').map(tagFor).join('') + (a.touched ? '<span class="tag" style="background:var(--good)">✔ updated</span>' : '') + '</div>';
      const rs = P.refStart(a), rf = P.refFinish(a);
      plan.innerHTML = 'Plan <b>' + D.fmt(rs) + '</b> → <b>' + D.fmt(rf) + '</b><br>Last: ' + (a.prev ? (a.prev.status === 'CO' ? '100%' : Math.round(a.prev.pct || 0) + '%') : '—') + ' · Planned now ' + Math.round(A().plannedFrac(P, a, dd) * 100) + '%' + (a.status !== 'CO' ? '<br>Forecast finish <b>' + D.fmt(P.finishOf(a)) + '</b>' : '');
      if (document.activeElement !== as) as.value = D.fmt(a.aStart);
      if (document.activeElement !== af) af.value = D.fmt(a.aFinish);
      if (document.activeElement !== pn) pn.value = Math.round(a.pct || 0);
      pr.value = Math.round(a.pct || 0);
      if (document.activeElement !== rd) rd.value = a.status === 'CO' ? 0 : a.remDur;
      const lockPct = ms || a.status === 'CO';
      pn.disabled = pr.disabled = rd.disabled = lockPct;
      row.classList.toggle('done', !!a.touched);
      quick.innerHTML = '';
      const q = (label, ch, title) => quick.append(h('button', { type: 'button', text: label, title: title || label, onclick: () => apply(ch, label) }));
      if (a.status === 'NS' && rs != null && rs < dd) q('Started on plan', ms && a.type === 'finish' ? { aFinish: rs } : { aStart: rs }, 'Actual Start = ' + D.fmt(rs));
      if (a.status !== 'CO' && rf != null && rf < dd) q('Finished on plan', { aFinish: rf, aStart: a.aStart != null ? a.aStart : rs }, 'Actual Finish = ' + D.fmt(rf));
      if (a.status === 'IP' && !ms) q('+10%', { pct: Math.min(99, (a.pct || 0) + 10) });
      if (a.status !== 'CO') q('Done ' + D.fmt(dd - 1), { aFinish: D.fmt(dd - 1) }, 'Actual Finish = day before Data Date');
      if (!ms && a.status !== 'CO') quick.append(h('button', { type: 'button', text: 'Qty…', title: 'Quantity calculator', onclick: () => qtyDialog(a.uid).then(() => sync()) }));
      quick.append(h('button', { type: 'button', text: 'Open', title: 'Open in schedule', onclick: () => { UI.setView('gantt'); UI.grid.reveal(a.uid); } }));
    };
    const apply = (changes, label, input) => {
      const r = UI.applyPatches([{ uid: a.uid, changes }], label + ' ' + a.code, { quiet: true, soft: () => {} });
      msg.className = 'emsg';
      [as, af, pn, rd].forEach((i) => i.classList.remove('bad'));
      if (r.errors.length) { msg.className = 'emsg e'; msg.textContent = r.errors[0].msg; if (input) input.classList.add('bad'); }
      else if (r.warnings.length) { msg.className = 'emsg w'; msg.textContent = r.warnings.map((x) => x.msg).join(' '); }
      else if (r.infos.length) { msg.className = 'emsg i'; msg.textContent = r.infos.map((x) => x.msg).join(' '); }
      else msg.textContent = '';
      sync();
      return r;
    };
    as.onchange = () => apply({ aStart: as.value }, 'Actual Start', as);
    af.onchange = () => apply({ aFinish: af.value }, 'Actual Finish', af);
    pn.onchange = () => apply({ pct: pn.value }, '% Complete', pn);
    pr.oninput = () => { pn.value = pr.value; };
    pr.onchange = () => apply({ pct: pr.value }, '% Complete', pn);
    rd.onchange = () => apply({ remDur: rd.value }, 'Remaining', rd);
    [as, af, pn, rd].forEach((i) => i.addEventListener('keydown', (e) => { if (e.key === 'Enter') i.blur(); }));
    const lab = (t, el) => h('div', null, h('label', { text: t }), el);
    ins.append(lab('Actual start', as), lab('Actual finish', af), lab('% complete', h('div', { class: 'pctin' }, pr, pn)), lab('Rem. days', rd), quick);
    row.append(who, plan, ins, msg);
    sync();
    return row;
  }

  /* ================================================================== *
   * Dashboard
   * ================================================================== */
  function renderDash() {
    const P = S.P;
    const v = $('#view-dash');
    v.innerHTML = '';
    const pane = h('div', { class: 'pane' });
    v.append(pane);
    const all = P.acts.filter((a) => !P.isSummaryType(a));
    const pr = A().progressOf(P, all);
    const prevA = A().prevActual(P, all);
    const cnt = { NS: 0, IP: 0, CO: 0 }; all.forEach((a) => { cnt[a.status]++; });
    const c = S.fl.counts;
    const blF = Math.max.apply(null, all.map((a) => (a.bl && a.bl.finish != null ? a.bl.finish : -Infinity)));
    const slip = isFinite(blF) && P.meta.scheduledFinish != null ? P.cal(null).between(blF, P.meta.scheduledFinish) : null;
    const kpi = (l, v2, sub, cls) => '<div class="kpi ' + (cls || '') + '"><span>' + l + '</span><b>' + v2 + '</b>' + (sub ? '<small>' + sub + '</small>' : '') + '</div>';
    pane.append(h('div', { class: 'kpis', html:
      kpi('Actual progress', pr.actual.toFixed(1) + '%', '+' + (pr.actual - prevA).toFixed(1) + '% this period') +
      kpi('Planned progress', pr.planned.toFixed(1) + '%', 'duration-weighted baseline') +
      kpi('Variance', (pr.actual - pr.planned >= 0 ? '+' : '') + (pr.actual - pr.planned).toFixed(1) + '%', pr.actual >= pr.planned ? 'ahead of plan' : 'behind plan', pr.actual < pr.planned - 1 ? 'bad' : 'good') +
      kpi('Forecast finish', D.fmt(P.meta.scheduledFinish), slip != null ? (slip > 0 ? slip + ' working days late' : slip < 0 ? -slip + ' days early' : 'on baseline') : '', slip > 0 ? 'bad' : '') +
      kpi('Activities', all.length, cnt.CO + ' done · ' + cnt.IP + ' running · ' + cnt.NS + ' not started') +
      kpi('Late start', c.lateStart || 0, 'should have started', c.lateStart ? 'bad' : '') +
      kpi('Overdue', c.overdue || 0, 'should have finished', c.overdue ? 'bad' : '') +
      kpi('Critical', c.critical || 0, (c.negFloat || 0) + ' with negative float')
    }));
    const cards = h('div', { class: 'cards' });
    pane.append(cards);
    cards.append(h('div', { class: 'card span2' }, h('h3', { html: 'S-curve <small>cumulative, duration weighted · hover for values</small>' }), sCurveSVG(P)));
    const insC = h('div', { class: 'card' }, h('h3', { text: 'Engine insights' }));
    const ul = h('ul', { class: 'ins' });
    A().insights(P, S.fl).forEach((i) => { const li = h('li', { class: i.tone + (i.lens || i.dim ? ' click' : ''), html: esc(i.text) + (i.lens || i.dim ? '<span class="go">show →</span>' : '') }); if (i.lens || i.dim) li.onclick = () => goInsight(i); ul.append(li); });
    insC.append(ul);
    cards.append(insC);
    const bars = (key, title) => {
      const card = h('div', { class: 'card' }, h('h3', { html: title + ' <small>bar = actual · top line = planned · click to filter</small>' }));
      const box = h('div', { class: 'hbars' });
      A().breakdown(P, key, S.fl).filter((b) => b.count).forEach((b) => {
        const row = h('div', { class: 'hb', title: b.name + ': ' + b.actual.toFixed(1) + '% vs ' + b.planned.toFixed(1) + '% planned; ' + b.lateStart + ' late start, ' + b.overdue + ' overdue', html:
          '<span class="nm">' + esc(b.name) + '</span><span class="tr"><span class="pl" style="width:' + b.planned.toFixed(1) + '%"></span><span class="ac' + (b.variance < -5 ? ' behind' : '') + '" style="width:' + b.actual.toFixed(1) + '%"></span></span><span class="v"><b>' + b.actual.toFixed(0) + '%</b> / ' + b.planned.toFixed(0) + '%</span>' });
        row.onclick = () => { UI.clearFilters(); S.dimSel[key].add(b.name); UI.setView('gantt'); };
        box.append(row);
      });
      card.append(box);
      return card;
    };
    cards.append(bars('building', 'Building-wise progress'));
    cards.append(bars('epc', 'EPC-wise progress'));
    // matrix
    const bl = A().breakdown(P, 'building', S.fl).filter((b) => b.count).map((b) => b.name);
    const ep = SE.EPC.filter((e) => all.some((a) => P.dim(a, 'epc') === e));
    let mt = '<table class="matrix"><thead><tr><th>Building</th>' + ep.map((e) => '<th>' + e + '</th>').join('') + '</tr></thead><tbody>';
    bl.forEach((b) => {
      mt += '<tr><td>' + esc(b) + '</td>';
      ep.forEach((e) => {
        const g = all.filter((a) => P.dim(a, 'building') === b && P.dim(a, 'epc') === e);
        if (!g.length) { mt += '<td style="background:var(--surface-2)"></td>'; return; }
        const p = A().progressOf(P, g);
        const v2 = p.actual - p.planned;
        const bg = v2 >= -2 ? '#CFEBDA' : v2 >= -10 ? '#FCEBC0' : '#F7CDD6';
        mt += '<td style="background:' + bg + '" title="' + esc(b + ' · ' + e) + ': ' + p.actual.toFixed(1) + '% vs ' + p.planned.toFixed(1) + '%">' + p.actual.toFixed(0) + '%<small>plan ' + p.planned.toFixed(0) + '%</small></td>';
      });
      mt += '</tr>';
    });
    mt += '</tbody></table>';
    cards.append(h('div', { class: 'card' }, h('h3', { html: 'Building × EPC <small>green on plan · amber up to 10% behind · red more</small>' }), h('div', { style: { overflowX: 'auto' }, html: mt })));
    // slipping & milestones
    const slipList = all.filter((a) => a.status !== 'CO' && a.bl && a.bl.finish != null && P.finishOf(a) != null).map((a) => ({ a, v: P.cal(a).between(a.bl.finish, P.finishOf(a)) })).filter((x) => x.v > 0).sort((x, y) => y.v - x.v).slice(0, 10);
    const t1 = h('table', { class: 't' });
    t1.innerHTML = '<thead><tr><th>Activity</th><th>Building</th><th>BL finish</th><th>Forecast</th><th>Slip (wd)</th></tr></thead>';
    const tb1 = h('tbody');
    slipList.forEach((x) => { const tr = h('tr', { class: 'click', html: '<td><span class="mono">' + esc(x.a.code) + '</span> ' + esc(x.a.name) + '</td><td>' + esc(P.dim(x.a, 'building')) + '</td><td>' + D.fmt(x.a.bl.finish) + '</td><td>' + D.fmt(P.finishOf(x.a)) + '</td><td class="crit-t"><b>+' + x.v + '</b></td>' }); tr.onclick = () => { UI.setView('gantt'); UI.grid.reveal(x.a.uid); }; tb1.append(tr); });
    t1.append(tb1);
    cards.append(h('div', { class: 'card' }, h('h3', { text: 'Top 10 slipping activities' }), slipList.length ? t1 : h('div', { class: 'dempty', text: 'Nothing is later than baseline.' })));
    const ms = all.filter((a) => P.isMilestone(a)).sort((x, y) => (P.finishOf(x) - P.finishOf(y)));
    const t2 = h('table', { class: 't' });
    t2.innerHTML = '<thead><tr><th>Milestone</th><th>Baseline</th><th>Forecast / actual</th><th>Var</th><th>Status</th></tr></thead>';
    const tb2 = h('tbody');
    ms.forEach((a) => { const f = P.finishOf(a); const b = a.bl ? (a.type === 'start' ? a.bl.start : a.bl.finish) : null; const v2 = b != null && f != null ? P.cal(a).between(b, f) : null; const tr = h('tr', { class: 'click', html: '<td>' + esc(a.name) + ' <span class="mono" style="color:var(--ink-3)">' + esc(a.code) + '</span></td><td>' + D.fmt(b) + '</td><td>' + D.fmt(f) + (a.status === 'CO' ? ' A' : '') + '</td><td class="' + (v2 > 0 ? 'crit-t' : '') + '">' + (v2 == null ? '' : v2 > 0 ? '+' + v2 : v2) + '</td><td><span class="pill ' + a.status + '">' + SE.STATUS[a.status] + '</span></td>' }); tr.onclick = () => { UI.setView('gantt'); UI.grid.reveal(a.uid); }; tb2.append(tr); });
    t2.append(tb2);
    cards.append(h('div', { class: 'card' }, h('h3', { text: 'Milestones' }), h('div', { style: { overflowX: 'auto', maxHeight: '360px', overflowY: 'auto' } }, t2)));
  }
  function sCurveSVG(P) {
    const sc = A().sCurve(P);
    const W = 640, H = 260, L = 42, R = 12, T = 12, B = 30;
    const n = sc.points.length;
    const x = (i) => L + (W - L - R) * (n > 1 ? i / (n - 1) : 0);
    const y = (v) => T + (H - T - B) * (1 - v / 100);
    const ddi = sc.points.findIndex((p) => p.end > sc.dd);
    const path = (vals) => vals.map((v, i) => (v == null ? '' : (i && vals[i - 1] != null ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(v).toFixed(1))).join('');
    let s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="S-curve of planned, actual and forecast progress">';
    for (let k = 0; k <= 4; k++) s += '<line class="gl" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(k * 25) + '" y2="' + y(k * 25) + '"/><text x="' + (L - 6) + '" y="' + (y(k * 25) + 3) + '" text-anchor="end">' + k * 25 + '%</text>';
    const stp = Math.max(1, Math.ceil(n / 10));
    sc.points.forEach((p, i) => { if (i % stp === 0) s += '<text x="' + x(i) + '" y="' + (H - 10) + '" text-anchor="middle">' + p.label + '</text>'; });
    s += '<path d="' + path(sc.points.map((p) => p.planned)) + '" fill="none" stroke="var(--ink-3)" stroke-width="2" stroke-dasharray="5 4"/>';
    if (ddi >= 0) {
      s += '<path d="' + path(sc.points.map((p, i) => (i < ddi ? null : i === ddi ? sc.actualNow : p.forecast))) + '" fill="none" stroke="var(--accent)" stroke-width="2"/>';
      s += '<path d="' + path(sc.points.map((p, i) => (i < ddi ? p.actual : i === ddi ? sc.actualNow : null))) + '" fill="none" stroke="var(--bar-actual)" stroke-width="3"/>';
      s += '<line x1="' + x(ddi) + '" x2="' + x(ddi) + '" y1="' + T + '" y2="' + (H - B) + '" stroke="var(--dd)" stroke-dasharray="4 3" stroke-width="1.5"/>';
      s += '<circle cx="' + x(ddi) + '" cy="' + y(sc.actualNow) + '" r="5" fill="var(--bar-actual)" stroke="var(--surface)" stroke-width="2"/>';
      s += '<text x="' + (x(ddi) + 8) + '" y="' + (y(sc.actualNow) + 14) + '" style="fill:var(--ink);font-weight:600">' + sc.actualNow.toFixed(1) + '% actual</text>';
    }
    s += '<g class="hov"></g><rect x="' + L + '" y="' + T + '" width="' + (W - L - R) + '" height="' + (H - T - B) + '" fill="transparent" class="hit"/></svg>';
    const wrap = h('div', { style: { position: 'relative' } });
    wrap.innerHTML = s + '<div class="legend"><span><i style="background:var(--ink-3)"></i>Planned (baseline)</span><span><i style="background:var(--bar-actual)"></i>Actual</span><span><i style="background:var(--accent)"></i>Forecast</span><span><i style="background:var(--dd)"></i>Data Date</span></div>';
    const svg = wrap.querySelector('svg');
    const hov = wrap.querySelector('.hov');
    svg.querySelector('.hit').addEventListener('mousemove', (e) => {
      const r = svg.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width * W;
      const i = Math.max(0, Math.min(n - 1, Math.round((px - L) / (W - L - R) * (n - 1))));
      const p = sc.points[i];
      const act = i < ddi ? p.actual : i === ddi ? sc.actualNow : null;
      hov.innerHTML = '<line x1="' + x(i) + '" x2="' + x(i) + '" y1="' + T + '" y2="' + (H - B) + '" stroke="var(--ink-3)" stroke-width="1"/>' +
        '<rect x="' + Math.min(x(i) + 8, W - 150) + '" y="' + (T + 4) + '" width="140" height="' + (act != null ? 58 : 44) + '" rx="5" fill="var(--surface)" stroke="var(--line-2)"/>' +
        '<text x="' + (Math.min(x(i) + 8, W - 150) + 8) + '" y="' + (T + 20) + '" style="fill:var(--ink);font-weight:700">' + p.label + '</text>' +
        '<text x="' + (Math.min(x(i) + 8, W - 150) + 8) + '" y="' + (T + 35) + '">Planned ' + p.planned.toFixed(1) + '%</text>' +
        (act != null ? '<text x="' + (Math.min(x(i) + 8, W - 150) + 8) + '" y="' + (T + 50) + '">Actual ' + act.toFixed(1) + '%</text>' : '<text x="' + (Math.min(x(i) + 8, W - 150) + 8) + '" y="' + (T + 50) + '"></text>') +
        (i > ddi ? '<text x="' + (Math.min(x(i) + 8, W - 150) + 8) + '" y="' + (T + 50) + '">Forecast ' + p.forecast.toFixed(1) + '%</text>' : '');
    });
    svg.querySelector('.hit').addEventListener('mouseleave', () => { hov.innerHTML = ''; });
    return wrap;
  }

  /* ================================================================== *
   * Health & Changes
   * ================================================================== */
  function renderHealth() {
    const P = S.P;
    const v = $('#view-health');
    v.innerHTML = '';
    const pane = h('div', { class: 'pane' });
    v.append(pane);
    const hc = A().healthCheck(P);
    S.lastHealth = hc.score;
    const r = 44, c = 2 * Math.PI * r;
    const col = hc.score >= 80 ? 'var(--good)' : hc.score >= 60 ? 'var(--warn)' : 'var(--bad)';
    pane.append(h('div', { class: 'card', style: { marginBottom: '14px' } }, h('div', { class: 'score', html:
      '<svg viewBox="0 0 110 110" role="img" aria-label="Health score ' + hc.score + '%"><circle cx="55" cy="55" r="' + r + '" fill="none" stroke="var(--surface-3)" stroke-width="12"/><circle cx="55" cy="55" r="' + r + '" fill="none" stroke="' + col + '" stroke-width="12" stroke-linecap="round" stroke-dasharray="' + (c * hc.score / 100).toFixed(1) + ' ' + c.toFixed(1) + '" transform="rotate(-90 55 55)"/><text x="55" y="61" text-anchor="middle" font-size="22" font-weight="700" fill="var(--ink)">' + hc.score + '%</text></svg>' +
      '<div><h3 style="margin:0 0 4px;color:var(--brand)">Schedule health: ' + hc.passed + ' of ' + hc.total + ' checks pass</h3><div class="sub" style="color:var(--ink-2)">DCMA-14 style checks on the open (not complete) activities. Click a row to see the activities behind it.' + (P.settings.scheduled ? '' : ' <b style="color:var(--bad)">Schedule (F9) first - float values are from the last calculation.</b>') + '</div></div>' })));
    const t = h('table', { class: 't hc' });
    t.innerHTML = '<thead><tr><th>Check</th><th>Result</th><th>Count</th><th>Of</th><th>%</th><th>Guideline</th></tr></thead>';
    const tb = h('tbody');
    hc.checks.forEach((ch) => {
      const tr = h('tr', { class: ch.uids.length ? 'click' : '', html: '<td><b>' + esc(ch.name) + '</b></td><td class="res"><b class="' + (ch.pass ? 'pass' : 'fail') + '">' + (ch.pass ? 'PASS' : 'FAIL') + '</b></td><td>' + ch.count + '</td><td>' + ch.total + '</td><td>' + ch.pct.toFixed(1) + '</td><td>' + esc(ch.what) + '</td>' });
      if (ch.uids.length) tr.onclick = () => { UI.clearFilters(); S.uidFilter = { label: ch.name, uids: new Set(ch.uids) }; UI.setView('gantt'); };
      tb.append(tr);
    });
    t.append(tb);
    pane.append(h('div', { class: 'card' }, h('div', { style: { overflowX: 'auto' } }, t)));
  }
  function renderChanges() {
    const P = S.P;
    const v = $('#view-changes');
    v.innerHTML = '';
    const pane = h('div', { class: 'pane' });
    v.append(pane);
    const cmp = A().compare(P);
    const t = h('table', { class: 't' });
    t.innerHTML = '<thead><tr><th>Activity</th><th>Building</th><th>EPC</th><th>Changes this period</th><th>Finish movement</th></tr></thead>';
    const tb = h('tbody');
    cmp.sort((x, y) => (y.finishVar - x.finishVar)).forEach((c) => {
      const tr = h('tr', { class: 'click', html: '<td><span class="mono">' + esc(c.a.code) + '</span> ' + esc(c.a.name) + '</td><td>' + esc(P.dim(c.a, 'building')) + '</td><td>' + esc(P.dim(c.a, 'epc')) + '</td><td>' + esc(c.changes.join(' · ')) + '</td><td class="' + (c.finishVar > 0 ? 'crit-t' : '') + '"><b>' + (c.finishVar > 0 ? '+' : '') + c.finishVar + ' d</b></td>' });
      tr.onclick = () => { UI.setView('gantt'); UI.grid.reveal(c.a.uid); };
      tb.append(tr);
    });
    t.append(tb);
    pane.append(h('div', { class: 'card', style: { marginBottom: '14px' } }, h('h3', { html: 'Changes vs last update <small>' + D.fmtLong(P.meta.prevDataDate) + ' → ' + D.fmtLong(P.meta.dataDate) + ' · ' + cmp.length + ' activities</small>' }), cmp.length ? h('div', { style: { overflowX: 'auto' } }, t) : h('div', { class: 'dempty', text: 'No differences yet.' })));
    const log = P.log.slice(-400).reverse();
    const t2 = h('table', { class: 't' });
    t2.innerHTML = '<thead><tr><th>Time</th><th>Activity</th><th>Field</th><th>From</th><th>To</th></tr></thead>';
    const tb2 = h('tbody');
    const fv = (k, v2) => (v2 == null ? '—' : ['aStart', 'aFinish'].includes(k) && typeof v2 === 'number' ? D.fmt(v2) : typeof v2 === 'object' ? JSON.stringify(v2).slice(0, 60) : String(v2));
    log.forEach((l) => tb2.append(h('tr', { html: '<td>' + new Date(l.t).toLocaleString('en-IN') + '</td><td class="mono">' + esc(l.code || '') + '</td><td>' + esc(l.field) + '</td><td>' + esc(fv(l.field, l.from)) + '</td><td>' + esc(fv(l.field, l.to)) + '</td>' })));
    t2.append(tb2);
    pane.append(h('div', { class: 'card' }, h('h3', { html: 'Session log <small>every edit, newest first</small>' }), log.length ? h('div', { style: { overflowX: 'auto', maxHeight: '50vh', overflowY: 'auto' } }, t2) : h('div', { class: 'dempty', text: 'No edits yet.' })));
  }

  function renderView(v) {
    if (v === 'easy') renderEasy();
    else if (v === 'dash') renderDash();
    else if (v === 'health') renderHealth();
    else if (v === 'changes') renderChanges();
    else if (v === 'qty' && UI.qty) UI.qty.render();
  }

  UI.panels = {
    details, renderView, contextMenu, qtyDialog, bulkDialog, progressAssistant, addActivityDialog, deleteSelected, relDialog, settingsDialog, insightsDialog, field
  };
})();
