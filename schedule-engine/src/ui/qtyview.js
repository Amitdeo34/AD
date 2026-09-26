/* Schedule Engine - ui/qtyview.js
 * "Qty & Liquidation" view: quantity items, month-wise liquidation plan,
 * automatic concerns, and a live preview of the one-pager slides
 * (building-wise / WBS-wise / EPC-wise / combined) with PPTX / PDF / Excel output.
 */
(function () {
  'use strict';
  const D = SE.D;
  const { S, h, $, esc, toast, modal } = UI;
  const Qy = () => SE.qty;
  let selId = null;
  let previewKey = null;

  /* ---------------- slide → HTML ---------------- */
  function slideHTML(sl, widthPx) {
    const sc = widthPx / 13.333;
    const box = h('div', { class: 'qslide', style: { width: widthPx + 'px', height: (widthPx * 7.5 / 13.333) + 'px' } });
    let svg = '';
    const draw = (e) => {
      if (e.type === 'rect') {
        const d = h('div', { style: { position: 'absolute', left: e.x * sc + 'px', top: e.y * sc + 'px', width: Math.max(1, e.w * sc) + 'px', height: Math.max(1, e.h * sc) + 'px', background: e.fill, opacity: e.alpha != null ? e.alpha : 1, borderRadius: e.round ? '50%' : e.radius ? e.radius * sc + 'px' : '0', border: e.border ? '1px solid ' + e.border : 'none', clipPath: e.chevron ? 'polygon(0 0, calc(100% - ' + Math.min(0.2, e.h / 2) * sc + 'px) 0, 100% 50%, calc(100% - ' + Math.min(0.2, e.h / 2) * sc + 'px) 100%, 0 100%, ' + Math.min(0.2, e.h / 2) * sc + 'px 50%)' : 'none' } });
        box.append(d);
      } else if (e.type === 'text') {
        const d = h('div', { style: { position: 'absolute', left: e.x * sc + 'px', top: e.y * sc + 'px', width: e.w * sc + 'px', height: e.h * sc + 'px', fontSize: (e.size * sc / 72) + 'px', color: e.color, fontWeight: e.bold ? '700' : '400', textAlign: e.align || 'left', display: 'flex', flexDirection: 'column', justifyContent: e.valign === 'top' ? 'flex-start' : 'center', lineHeight: '1.18', whiteSpace: 'pre-wrap', overflow: 'hidden', background: e.fill || 'transparent', border: e.border ? '1px solid ' + e.border : 'none', padding: (e.pad || 0) * sc + 'px', fontFamily: 'Arial, Helvetica, sans-serif', boxSizing: 'border-box' } });
        const lead = e.boldLead || e.italicLead;
        if (lead && e.text.startsWith(lead)) d.innerHTML = '<span><b>' + esc(lead) + '</b>' + esc(e.text.slice(lead.length)) + '</span>';
        else d.innerHTML = '<span>' + esc(e.text) + '</span>';
        box.append(d);
      } else if (e.type === 'line') {
        svg += '<line x1="' + e.x1 * sc + '" y1="' + e.y1 * sc + '" x2="' + e.x2 * sc + '" y2="' + e.y2 * sc + '" stroke="' + e.color + '" stroke-width="' + Math.max(0.6, (e.w || 0.75) * sc / 72) + '"/>';
      } else if (e.type === 'chart') {
        SE.qtyExport.chartPrims(e).forEach(draw);
      }
    };
    sl.el.forEach(draw);
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('width', widthPx); s.setAttribute('height', widthPx * 7.5 / 13.333);
    s.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none';
    s.innerHTML = svg;
    box.append(s);
    return box;
  }

  /* ---------------- render view ---------------- */
  function render() {
    const P = S.P;
    const Q = Qy().ensure(P);
    const v = $('#view-qty');
    v.innerHTML = '';
    const pane = h('div', { class: 'pane qpane' });
    v.append(pane);
    const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'One-pager grouping' });
    [['building', 'Building-wise'], ['wbs', 'WBS-wise'], ['epc', 'EPC-wise'], ['combined', 'Combined'], ['item', 'Item-wise']].forEach(([k, l]) => seg.append(h('button', { 'aria-pressed': Q.groupBy === k ? 'true' : 'false', text: l, onclick: () => { Q.groupBy = k; previewKey = null; save(); render(); } })));
    const unit = h('input', { class: 'inp', id: 'q_unit_all', value: Q.unit, style: { width: '70px' }, title: 'Unit for all items' });
    unit.onchange = () => { Q.unit = unit.value.trim() || 'MT'; save(); render(); };
    const asOf = h('input', { class: 'inp', id: 'q_asof', value: D.fmt(Qy().asOf(P)), style: { width: '100px' }, title: 'Data as on (plan starts the month after)' });
    asOf.onchange = () => { const p = D.parseDate(asOf.value); if (!p) { toast('Date not understood.', 'e'); return; } Q.asOf = p.day; save(); render(); };
    const ttl = h('input', { class: 'inp', id: 'q_title', value: Q.title || '', style: { width: '200px' }, placeholder: 'Deck title' });
    ttl.onchange = () => { Q.title = ttl.value; save(); };
    const btn = (label, fn, cls, title) => h('button', { class: 'btn ' + (cls || ''), type: 'button', text: label, onclick: fn, title: title || label });
    pane.append(h('div', { class: 'easybar' },
      h('b', { text: 'One-pager' }), seg,
      h('label', { class: 'sub', style: { display: 'flex', gap: '6px', alignItems: 'center' } }, 'Unit', unit),
      h('label', { class: 'sub', style: { display: 'flex', gap: '6px', alignItems: 'center' } }, 'Data as on', asOf),
      h('label', { class: 'sub', style: { display: 'flex', gap: '6px', alignItems: 'center' } }, 'Title', ttl)));
    pane.append(h('div', { class: 'easybar' },
      btn('+ Add item', () => { const it = Qy().newItem(P, { name: 'New building', building: 'New building', done: { dwg: 0, sup: 0, ere: 0 } }); selId = it.id; save(); render(); }, 'pri'),
      btn('Create from schedule quantities', () => { const n = Qy().fromSchedule(P); toast(n ? n + ' items created from activities that have quantities (Qty calculator). Supply/erection plans follow the linked activities\' dates.' : 'No activities with quantities found. Add quantities with the Qty calculator first, or add items by hand.', n ? 'g' : 'w'); save(); render(); }, '', 'Makes one item per building & unit from activity quantities'),
      btn('Load sample', () => { Qy().sample(P); selId = null; save(); render(); toast('Sample items loaded (3 buildings, MT). Edit or delete them.', 'i'); }),
      btn('Liquidate all…', () => liquidateDialog(null)),
      btn('Push % to schedule', () => pushAll(), '', 'Set % complete of linked activities from done ÷ scope'),
      h('span', { style: { flex: '1' } }),
      btn('PowerPoint', () => exp('pptx'), 'pri'), btn('PDF', () => exp('pdf')), btn('Excel', () => exp('xlsx'), '', 'Filled quantity workbook with formulas'),
      btn('Blank template', () => exp('blank'), '', 'Empty Excel template to fill offline'), btn('Import Excel', () => UI.io.pickFile('qty'))));
    const cols = h('div', { class: 'qcols' });
    pane.append(cols);
    const left = h('div', { class: 'qleft' });
    const right = h('div', { class: 'qright' });
    cols.append(left, right);
    // items table
    const t = h('table', { class: 't' });
    t.innerHTML = '<thead><tr><th>Item</th><th>' + ({ building: 'Building', wbs: 'WBS', epc: 'EPC', combined: 'Building', item: 'Building' }[Q.groupBy]) + '</th><th>Scope</th><th>Dwg</th><th>Supplied</th><th>Erected</th><th>Plan check</th><th>Status</th></tr></thead>';
    const tb = h('tbody');
    if (!Q.items.length) tb.append(h('tr', null, h('td', { colspan: 8, class: 'dempty', html: 'No quantity items yet. <b>Add item</b>, <b>Create from schedule quantities</b>, <b>Import Excel</b> or <b>Load sample</b> to see a one-pager like your building status deck.' })));
    Q.items.forEach((it) => {
      const an = Qy().analyze(P, it);
      const okS = Math.abs(an.supTot - an.supBal) <= Math.max(1, it.scope * 0.005), okE = Math.abs(an.ereTot - an.ereBal) <= Math.max(1, it.scope * 0.005);
      const pc = (x) => (it.scope ? Math.round(x / it.scope * 100) + '%' : '–');
      const tr = h('tr', { class: 'click' + (selId === it.id ? ' qsel' : ''), html: '<td><b>' + esc(it.name) + '</b><div class="sub" style="color:var(--ink-3)">' + esc(it.vendor || '') + '</div></td><td>' + esc(Q.groupBy === 'wbs' ? it.wbs : Q.groupBy === 'epc' ? it.epc : it.building) + '</td><td>' + Qy().fmtQ(it.scope) + ' ' + esc(Q.unit) + '</td><td>' + pc(an.dwg) + '</td><td>' + pc(an.supDone) + '</td><td>' + pc(an.ereDone) + '</td><td>' + (okS && okE ? '<span style="color:var(--good);font-weight:700">✔ reconciled</span>' : '<span style="color:var(--bad);font-weight:700">✖ plan ≠ balance</span>') + '</td><td><span class="tag" style="background:' + (Qy().STATUS_COLOR[an.status] || '#F5A623') + '">' + an.status + '</span></td>' });
      tr.onclick = () => { selId = selId === it.id ? null : it.id; previewKey = Qy().groups(P).find((g) => g.items.includes(it)).key; render(); };
      tb.append(tr);
    });
    t.append(tb);
    left.append(h('div', { class: 'card' }, h('h3', { html: 'Quantity items <small>click to edit · one row per building / package</small>' }), h('div', { style: { overflowX: 'auto' } }, t)));
    const it = Q.items.find((x) => x.id === selId);
    if (it) left.append(editor(it));
    // preview
    const deck = Q.items.length ? Qy().deck(P) : [];
    if (deck.length) {
      if (!previewKey || !deck.some((d) => d.key === previewKey)) previewKey = deck[0].key;
      const tabs = h('div', { class: 'seg qtabs', role: 'tablist' });
      deck.forEach((d, i) => tabs.append(h('button', { 'aria-pressed': d.key === previewKey ? 'true' : 'false', text: (i + 1) + '. ' + (d.key === '__combined' ? 'Combined backup' : d.title), onclick: () => { previewKey = d.key; render(); } })));
      const sl = deck.find((d) => d.key === previewKey);
      const holder = h('div', { class: 'qprev' });
      right.append(h('div', { class: 'card' }, h('h3', { html: 'One-pager preview <small>exactly what PowerPoint / PDF will contain</small>' }), tabs, holder));
      requestAnimationFrame(() => { const w = Math.max(320, holder.clientWidth); holder.innerHTML = ''; holder.append(slideHTML(sl, w)); });
      const an = sl.analysis;
      const ul = h('ul', { class: 'ins' });
      an.concerns.forEach((c) => ul.append(h('li', { class: c.sev === 'high' ? 'bad' : 'warn', html: '<b>' + esc(c.tag) + ':</b> ' + esc(c.text) + '<br><span style="color:var(--accent)">Action: ' + esc(c.action) + '</span>' + (c.auto ? '' : ' <i style="color:var(--ink-3)">(your note)</i>') })));
      right.append(h('div', { class: 'card', style: { marginTop: '14px' } }, h('h3', { html: 'Engine concerns for ' + esc(sl.title) + ' <small>' + an.concerns.length + ' found · status ' + an.status + '</small>' }), an.concerns.length ? ul : h('div', { class: 'dempty', text: 'No concerns.' })));
    } else right.append(h('div', { class: 'card' }, h('h3', { text: 'One-pager preview' }), h('div', { class: 'dempty', text: 'Add quantity items to see the building / WBS / EPC one-pagers here.' })));
  }

  function editor(it) {
    const P = S.P;
    const Q = Qy().ensure(P);
    const U = Q.unit;
    const card = h('div', { class: 'card', style: { marginTop: '14px' } });
    card.append(h('h3', { html: 'Edit: ' + esc(it.name) + ' <small>changes update the preview instantly</small>' }));
    const f = UI.panels.field;
    const inp = (key, o) => { const i = h('input', Object.assign({ class: 'inp', id: 'qe_' + key, value: it[key] == null ? '' : it[key] }, o || {})); i.onchange = () => { it[key] = o && o.type === 'number' ? +i.value || 0 : i.value; save(); render(); }; return i; };
    const blds = Array.from(new Set(P.acts.map((a) => P.dim(a, 'building')))).concat(Q.items.map((x) => x.building)).filter(Boolean);
    const wbss = Array.from(new Set(Object.values(P.wbs).filter((w) => P.wbsLevel(w.id) === 1).map((w) => w.name))).concat(Q.items.map((x) => x.wbs)).filter(Boolean);
    const epcSel = h('select', { class: 'inp', id: 'qe_epc' }, SE.EPC.map((e) => h('option', { value: e, text: e })));
    epcSel.value = it.epc || 'Construction';
    epcSel.onchange = () => { it.epc = epcSel.value; save(); render(); };
    const stSel = h('select', { class: 'inp', id: 'qe_status' }, ['auto', 'ON TRACK', 'WATCH', 'AT RISK', 'DELAYED'].map((x) => h('option', { value: x, text: x === 'auto' ? 'Automatic (engine decides)' : x })));
    stSel.value = it.status || 'auto';
    stSel.onchange = () => { it.status = stSel.value; save(); render(); };
    const tIn = (st) => { const i = h('input', { class: 'inp', id: 'qe_t_' + st, value: it.target[st] ? Qy().keyLong(it.target[st]) : '', placeholder: 'mmm-yy' }); i.onchange = () => { const p = D.parseDate('01-' + i.value.trim()) || D.parseDate(i.value); it.target[st] = i.value.trim() && p ? Qy().keyOf(p.day) : null; save(); render(); }; return i; };
    card.append(h('datalist', { id: 'dl_qb' }, blds.map((b) => h('option', { value: b }))), h('datalist', { id: 'dl_qw' }, wbss.map((b) => h('option', { value: b }))));
    card.append(h('div', { class: 'form' },
      f('Item / building name', inp('name')), f('Building', inp('building', { list: 'dl_qb' })), f('WBS', inp('wbs', { list: 'dl_qw' })), f('EPC', epcSel),
      f('Vendor', inp('vendor')), f('Scope (' + U + ')', inp('scope', { type: 'number', min: 0 })), f('Scope note', inp('scopeNote', { placeholder: '+ TS 160.9 MT (silos…)' })), f('Status', stSel),
      f('Target supply finish', tIn('sup')), f('Target erection finish', tIn('ere'))));
    // stages
    const months = Qy().horizon(P, [it], 9, 18);
    const t = h('table', { class: 't qplan' });
    let hd = '<thead><tr><th>Stage</th><th>Done till date</th><th>Last month</th><th>Balance</th><th>Plan total</th><th>Check</th>';
    months.forEach((k, i) => { hd += '<th>' + Qy().keyLabel(k, i === 0) + '</th>'; });
    hd += '</tr></thead>';
    t.innerHTML = hd;
    const tb = h('tbody');
    Q.stages.forEach((st) => {
      const tr = h('tr');
      const done = h('input', { class: 'inp', type: 'number', min: 0, value: it.done[st.key] || 0, style: { width: '84px' }, 'aria-label': st.name + ' done' });
      done.onchange = () => { const v = +done.value || 0; if (v > it.scope) { toast(st.name + ' done cannot exceed the scope (' + it.scope + ').', 'e'); done.value = it.done[st.key]; return; } if (st.key === 'ere' && v > (+it.done.sup || 0) && Q.stages.some((s) => s.key === 'sup')) toast('Erected quantity is more than supplied - please check.', 'w'); it.done[st.key] = v; save(); render(); };
      const last = st.plan ? h('input', { class: 'inp', type: 'number', min: 0, value: it.last[st.key] || 0, style: { width: '70px' }, 'aria-label': st.name + ' last month' }) : h('span', { text: '' });
      if (st.plan) last.onchange = () => { it.last[st.key] = +last.value || 0; save(); render(); };
      const bal = st.plan ? Qy().balance(it, st.key) : Math.max(0, it.scope - (it.done[st.key] || 0));
      const tot = st.plan ? Qy().planTotal(it, st.key, Qy().startKey(P)) : null;
      const ok = !st.plan || Math.abs(tot - bal) <= Math.max(1, it.scope * 0.005);
      tr.append(h('td', { html: '<b style="color:' + st.color + '">■</b> ' + esc(st.name) }), h('td', null, done), h('td', null, last), h('td', { text: Qy().fmtQ(bal) }), h('td', { text: st.plan ? Qy().fmtQ(tot) : '' }),
        h('td', { html: st.plan ? (ok ? '<span style="color:var(--good)">✔</span>' : '<span style="color:var(--bad);font-weight:700" title="Plan total must equal the balance">' + (tot > bal ? '+' : '−') + Qy().fmtQ(Math.abs(tot - bal)) + '</span>') : '' }));
      months.forEach((k) => {
        if (!st.plan) { tr.append(h('td')); return; }
        const i = h('input', { class: 'inp', type: 'number', min: 0, value: it.plan[st.key][k] || '', style: { width: '64px' }, 'aria-label': st.name + ' ' + k });
        i.onchange = () => { const v = +i.value || 0; if (v) it.plan[st.key][k] = v; else delete it.plan[st.key][k]; save(); render(); };
        tr.append(h('td', null, i));
      });
      tb.append(tr);
    });
    // cumulative / waiting row
    const an = Qy().analyze(P, it, months);
    const trW = h('tr', { html: '<td colspan="6" style="color:var(--ink-3)">Material waiting at site (cum. supply − cum. erection)</td>' + months.map((k, i) => '<td style="color:' + (an.waiting[i] < 0 ? 'var(--bad)' : 'var(--ink-3)') + '">' + Qy().fmtQ(an.waiting[i]) + '</td>').join('') });
    tb.append(trW);
    t.append(tb);
    card.append(h('h3', { style: { marginTop: '16px' }, html: 'Quantities & month-wise liquidation plan <small>' + esc(U) + ' · months after ' + D.fmt(Qy().asOf(P)) + '</small>' }), h('div', { style: { overflowX: 'auto' } }, t));
    // liquidation tools
    const acts = P.acts.filter((a) => !P.isSummaryType(a) && !P.isMilestone(a));
    const linkSel = (st) => {
      const s = h('select', { class: 'inp', id: 'qe_link_' + st, style: { maxWidth: '260px' } }, h('option', { value: '', text: '— not linked —' }));
      const b = it.building;
      acts.filter((a) => !b || P.dim(a, 'building') === b || it.links[st] === a.uid).slice(0, 600).forEach((a) => s.append(h('option', { value: a.uid, text: a.code + ' · ' + a.name })));
      s.value = it.links[st] || '';
      s.onchange = () => { if (s.value) it.links[st] = s.value; else delete it.links[st]; save(); render(); };
      return s;
    };
    card.append(h('div', { class: 'form', style: { marginTop: '12px' } },
      f('Supply activity (schedule link)', linkSel('sup'), 'Used by "follow schedule" liquidation and Push % to schedule'),
      f('Erection activity (schedule link)', linkSel('ere')),
      f('Liquidate balance', h('div', { class: 'inrow' }, h('button', { class: 'btn pri', type: 'button', text: 'Liquidate…', onclick: () => liquidateDialog(it) })), 'Spread the balance month-wise: even, front-loaded, S-curve, fixed rate, follow the schedule, or erection following supply')));
    // fronts
    const ft = h('table', { class: 't' });
    ft.innerHTML = '<thead><tr><th>Work front</th><th>Category</th><th>From</th><th>To</th><th></th></tr></thead>';
    const ftb = h('tbody');
    it.fronts.forEach((fr, idx) => {
      const n = h('input', { class: 'inp', value: fr.name }); n.onchange = () => { fr.name = n.value; save(); render(); };
      const c = h('select', { class: 'inp' }, Object.keys(Qy().FRONT_CATS).map((k) => h('option', { value: k, text: Qy().FRONT_CATS[k].name }))); c.value = fr.cat; c.onchange = () => { fr.cat = c.value; save(); render(); };
      const mk = (key) => { const i = h('input', { class: 'inp', value: fr[key] ? Qy().keyLong(fr[key]) : '', placeholder: 'mmm-yy', style: { width: '90px' } }); i.onchange = () => { const p = D.parseDate('01-' + i.value.trim()) || D.parseDate(i.value); if (!p) { toast('Month not understood - type like Oct-26.', 'e'); return; } fr[key] = Qy().keyOf(p.day); save(); render(); }; return i; };
      ftb.append(h('tr', null, h('td', null, n), h('td', null, c), h('td', null, mk('from')), h('td', null, mk('to')), h('td', null, h('button', { class: 'btn sm', type: 'button', text: '✕', 'aria-label': 'Remove front', onclick: () => { it.fronts.splice(idx, 1); save(); render(); } }))));
    });
    ft.append(ftb);
    const addF = h('button', { class: 'btn sm', type: 'button', text: '+ Add work front', onclick: () => { const s0 = Qy().startKey(P); it.fronts.push({ name: 'New front', cat: 'erection', from: s0, to: Qy().keyAdd(s0, 2) }); save(); render(); } });
    const autoF = h('button', { class: 'btn sm', type: 'button', text: 'Build fronts from plan', onclick: () => { it.fronts = autoFronts(P, it); save(); render(); } });
    card.append(h('h3', { style: { marginTop: '16px' }, text: 'Work-front sequence' }), ft, h('div', { class: 'inrow', style: { marginTop: '6px' } }, addF, autoF));
    // concerns
    const ct = h('table', { class: 't' });
    ct.innerHTML = '<thead><tr><th>Tag</th><th>Severity</th><th>Your concern</th><th>Action</th><th></th></tr></thead>';
    const ctb = h('tbody');
    it.concerns.forEach((c, idx) => {
      const tg = h('input', { class: 'inp', value: c.tag || '', style: { width: '90px' } }); tg.onchange = () => { c.tag = tg.value.toUpperCase(); save(); render(); };
      const sv = h('select', { class: 'inp' }, h('option', { value: 'high', text: 'High' }), h('option', { value: 'med', text: 'Medium' })); sv.value = c.sev || 'med'; sv.onchange = () => { c.sev = sv.value; save(); render(); };
      const tx = h('input', { class: 'inp', value: c.text || '' }); tx.onchange = () => { c.text = tx.value; save(); render(); };
      const ac = h('input', { class: 'inp', value: c.action || '' }); ac.onchange = () => { c.action = ac.value; save(); render(); };
      ctb.append(h('tr', null, h('td', null, tg), h('td', null, sv), h('td', null, tx), h('td', null, ac), h('td', null, h('button', { class: 'btn sm', type: 'button', text: '✕', 'aria-label': 'Remove concern', onclick: () => { it.concerns.splice(idx, 1); save(); render(); } }))));
    });
    ct.append(ctb);
    card.append(h('h3', { style: { marginTop: '16px' }, html: 'Your concerns <small>added to the engine\'s automatic ones</small>' }), ct,
      h('div', { class: 'inrow', style: { marginTop: '6px' } }, h('button', { class: 'btn sm', type: 'button', text: '+ Add concern', onclick: () => { it.concerns.push({ tag: 'FRONT', sev: 'high', text: '', action: '' }); save(); render(); } })));
    card.append(h('div', { class: 'inrow', style: { marginTop: '16px', justifyContent: 'space-between' } },
      h('button', { class: 'btn', type: 'button', text: 'Duplicate item', onclick: () => { const c = JSON.parse(JSON.stringify(it)); c.id = 'q' + Date.now().toString(36); c.name += ' (copy)'; Q.items.push(c); selId = c.id; save(); render(); } }),
      h('button', { class: 'btn danger', type: 'button', text: 'Delete item', onclick: () => { Q.items = Q.items.filter((x) => x !== it); selId = null; save(); render(); } })));
    return card;
  }

  function autoFronts(P, it) {
    const out = [];
    const Q = Qy();
    if ((+it.done.dwg || 0) < it.scope) out.push({ name: 'Drawing / PO closure', cat: 'front', from: Q.startKey(P), to: Q.keyAdd(Q.startKey(P), 1) });
    const sa = Q.firstPlanKey(it, 'sup', Q.startKey(P)), sb = Q.lastPlanKey(it, 'sup');
    if (sa) out.push({ name: 'Fabrication & supply', cat: 'supply', from: sa, to: sb });
    const ea = Q.firstPlanKey(it, 'ere', Q.startKey(P)), eb = Q.lastPlanKey(it, 'ere');
    if (ea) {
      const ms = Q.monthsBetween(ea, eb);
      const cut = Math.max(0, Math.floor(ms.length / 3));
      out.push({ name: 'Starter / lower tiers', cat: 'erection', from: ea, to: ms[Math.max(0, cut)] });
      out.push({ name: 'Main erection', cat: 'erection', from: ms[Math.min(ms.length - 1, cut)], to: ms[Math.max(0, ms.length - 2)] || eb });
      out.push({ name: 'Alignment / handover', cat: 'handover', from: ms[Math.max(0, ms.length - 1)], to: eb });
    }
    return out;
  }

  function liquidateDialog(only) {
    const P = S.P;
    const Q = Qy().ensure(P);
    const items = only ? [only] : Q.items;
    if (!items.length) { toast('No items.', 'w'); return; }
    const s0 = Qy().startKey(P);
    const mSel = (id, def) => { const s = h('select', { class: 'inp', id }); Qy().monthsBetween(s0, Qy().keyAdd(s0, 23)).forEach((k) => s.append(h('option', { value: k, text: Qy().keyLong(k) }))); s.value = def; return s; };
    const stSel = h('select', { class: 'inp', id: 'lq_st' }, h('option', { value: 'sup', text: 'Supply' }), h('option', { value: 'ere', text: 'Erection' }), h('option', { value: 'both', text: 'Supply, then erection following supply' }));
    const meth = h('select', { class: 'inp', id: 'lq_m' },
      [['even', 'Even - same quantity every month'], ['bell', 'S-curve - ramp up, peak, ramp down'], ['front', 'Front-loaded - more early'], ['back', 'Back-loaded - more late'], ['rate', 'Fixed monthly rate until done'], ['linked', 'Follow the linked schedule activity (working days per month)'], ['follow', 'Erection follows supply (lag + monthly cap)']].map((o) => h('option', { value: o[0], text: o[1] })));
    const from = mSel('lq_from', s0), to = mSel('lq_to', Qy().keyAdd(s0, 5));
    const rate = h('input', { class: 'inp', id: 'lq_rate', type: 'number', placeholder: 'e.g. 250' });
    const lag = h('input', { class: 'inp', id: 'lq_lag', type: 'number', value: 1 });
    const cap = h('input', { class: 'inp', id: 'lq_cap', type: 'number', placeholder: 'max per month' });
    const f = UI.panels.field;
    return modal('Liquidate balance' + (only ? ' - ' + only.name : ' - all ' + items.length + ' items'), h('div', null,
      h('p', { style: { marginTop: 0 }, text: 'The balance (scope − done) is spread over the months you choose. Totals always equal the balance, so the plan reconciles with scope. Existing plan values from the start month onwards are replaced.' }),
      h('div', { class: 'form' }, f('Stage', stSel), f('Method', meth), f('From', from), f('To', to), f('Fixed rate (' + Q.unit + '/month)', rate), f('Erection lag after supply (months)', lag), f('Erection cap (' + Q.unit + '/month)', cap))), [
      { label: 'Cancel', value: null },
      { label: 'Liquidate', cls: 'pri', action: () => {
        if (from.value > to.value && meth.value !== 'rate' && meth.value !== 'follow' && meth.value !== 'linked') { toast('"To" must be after "From".', 'e'); return false; }
        for (const it of items) {
          if (stSel.value === 'both') {
            Qy().liquidate(P, it, 'sup', meth.value === 'follow' ? 'even' : meth.value, from.value, to.value, { rate: +rate.value });
            Qy().liquidate(P, it, 'ere', 'follow', from.value, null, { lag: +lag.value || 0, cap: +cap.value || Infinity });
          } else if (meth.value === 'follow') Qy().liquidate(P, it, 'ere', 'follow', from.value, null, { lag: +lag.value || 0, cap: +cap.value || Infinity });
          else Qy().liquidate(P, it, stSel.value, meth.value, from.value, to.value, { rate: +rate.value });
        }
        save(); render();
        toast('Balance liquidated for ' + items.length + ' item' + (items.length > 1 ? 's' : '') + '. Check the concerns - the engine re-checked supply vs erection and drawings.', 'g');
        return true;
      } }
    ]);
  }

  function pushAll() {
    const P = S.P;
    const patches = [];
    Qy().ensure(P).items.forEach((it) => patches.push.apply(patches, Qy().pushToSchedule(P, it)));
    if (!patches.length) { toast('Nothing to push: link items to schedule activities (Supply / Erection activity) first, or % already match.', 'w'); return; }
    const r = UI.applyPatches(patches, 'Qty → schedule (' + patches.length + ')', { quiet: true, soft: () => {} });
    toast(r.applied + ' linked activities updated from quantities' + (r.errors.length ? ', ' + r.errors.length + ' rejected: ' + r.errors[0].msg : '') + '.', r.errors.length ? 'w' : 'g');
    render();
  }

  async function exp(kind) {
    const P = S.P;
    const Q = Qy().ensure(P);
    if (!Q.items.length && kind !== 'blank') { toast('Add quantity items first (or Load sample).', 'w'); return; }
    const base = String(Q.title || P.meta.code || 'Qty').replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 40) + '_' + ({ building: 'Building', wbs: 'WBS', epc: 'EPC', combined: 'Combined', item: 'Item' }[Q.groupBy] || '') + 'wise_' + D.fmtISO(Qy().asOf(P));
    try {
      UI.busy(true, 'Building ' + kind.toUpperCase() + '…');
      await UI.tick();
      if (kind === 'pptx') { UI.io.download(new Blob([await SE.qtyExport.toPPTX(P)], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }), base + '.pptx'); toast('PowerPoint one-pagers exported, with speaker notes and native charts.', 'g'); }
      else if (kind === 'pdf') { UI.io.download(new Blob([SE.qtyExport.toPDF(P)], { type: 'application/pdf' }), base + '.pdf'); toast('PDF one-pagers exported.', 'g'); }
      else if (kind === 'xlsx') UI.io.download(new Blob([await SE.qtyExport.toExcel(P, false)]), base + '.xlsx');
      else if (kind === 'blank') UI.io.download(new Blob([await SE.qtyExport.toExcel(P, true)]), 'Qty_Liquidation_Template.xlsx');
    } catch (e) { console.error(e); toast(e.message, 'e', 'Export failed'); }
    UI.busy(false);
  }

  async function importExcel(buf, name) {
    const P = S.P;
    if (!P) { toast('Open a schedule (or the demo) first, then import the quantity workbook.', 'w'); return; }
    try {
      const n = SE.qtyExport.fromExcel(P, new Uint8Array(buf));
      save();
      UI.setView('qty');
      toast(n + ' quantity items imported from ' + name + '.', 'g');
    } catch (e) { console.error(e); toast(e.message, 'e', 'Import failed'); }
  }

  function save() { UI.io.autosave(); }

  UI.qty = { render, importExcel, slideHTML };
})();
