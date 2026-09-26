/* Schedule Engine - ui/io.js
 * Opening files (XER / Excel / CSV / PDF / MSP XML / .sej), the column
 * mapping wizard, update-sheet import, exports, autosave and the welcome page.
 */
(function () {
  'use strict';
  const D = SE.D;
  const { S, h, $, esc, toast, modal, busy, tick } = UI;

  /* ---------------- download ---------------- */
  function download(data, name, type) {
    const blob = data instanceof Blob ? data : new Blob([data], { type: type || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: name });
    document.body.append(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
  }
  function baseName() {
    const P = S.P;
    return String(P.meta.code || P.meta.name || 'Schedule').replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 40) + '_DD_' + D.fmtISO(P.meta.dataDate);
  }

  /* ---------------- autosave (IndexedDB) ---------------- */
  let dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      try {
        const r = indexedDB.open('schedule-engine', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('kv');
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      } catch (e) { rej(e); }
    });
    return dbp;
  }
  async function kvSet(k, v) { const d = await db(); return new Promise((res, rej) => { const t = d.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = res; t.onerror = () => rej(t.error); }); }
  async function kvGet(k) { const d = await db(); return new Promise((res, rej) => { const t = d.transaction('kv', 'readonly'); const q = t.objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); }
  let saveT = null;
  function autosave() {
    if (!S.P) return;
    clearTimeout(saveT);
    saveT = setTimeout(async () => {
      try {
        await kvSet('session', { json: JSON.stringify(S.P.toJSON()), at: Date.now(), name: S.P.meta.name, acts: S.P.acts.length, dd: S.P.meta.dataDate });
        S.savedAt = Date.now();
        const sv = document.querySelector('#statusbar .saved');
        if (sv) sv.textContent = 'Autosaved ' + new Date(S.savedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
      } catch (e) { /* storage unavailable - silently skip */ }
    }, 1200);
  }

  /* ---------------- open ---------------- */
  function pickFile(mode) {
    const i = $('#fileIn');
    i.dataset.mode = mode || '';
    i.accept = mode === 'update' ? '.xlsx,.xls,.xlsm' : mode === 'qty' ? '.xlsx,.xls,.xlsm' : '.xer,.xlsx,.xls,.xlsm,.csv,.pdf,.xml,.sej,.json';
    i.value = '';
    i.click();
  }
  async function openFile(file, mode) {
    if (!file) return;
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    try {
      busy(true, 'Reading ' + file.name + '…');
      await tick();
      const buf = await file.arrayBuffer();
      if (mode === 'qty') { busy(false); UI.qty && UI.qty.importExcel(buf, file.name); return; }
      if (mode === 'update' || (S.P && ['xlsx', 'xls', 'xlsm'].includes(ext) && looksLikeUpdateSheet(buf))) {
        if (!S.P) throw new Error('Open the schedule first, then import its Update Sheet.');
        busy(false);
        return importUpdateSheet(buf, file.name);
      }
      if (ext === 'xer') {
        const dec = SE.xer.decode(buf);
        const raw = SE.xer.parse(dec.text);
        const projs = SE.xer.listProjects(raw);
        let pid = projs[0] && projs[0].id;
        busy(false);
        if (projs.length > 1) {
          pid = await pickProject(projs);
          if (!pid) return;
        }
        busy(true, 'Building schedule…'); await tick();
        const P = SE.xer.toProject(raw, pid, file.name);
        P.meta.xerEncoding = dec.encoding;
        busy(false);
        return afterLoad(P, true);
      }
      if (ext === 'sej' || ext === 'json') {
        const P = SE.Project.fromJSON(JSON.parse(new TextDecoder().decode(buf)));
        busy(false);
        return afterLoad(P, false);
      }
      if (ext === 'xml') {
        const P = SE.importers.mspToProject(new TextDecoder().decode(buf), file.name);
        busy(false);
        toast('MS Project file loaded: ' + P.acts.length + ' tasks, ' + P.rels.length + ' links.', 'g');
        return afterLoad(P, true);
      }
      if (['xlsx', 'xls', 'xlsm', 'csv'].includes(ext)) {
        const wb = SE.importers.readWorkbook(buf);
        busy(false);
        return mappingDialog({ wb, fileName: file.name, source: 'excel' });
      }
      if (ext === 'pdf') {
        busy(true, 'Reading PDF text…');
        const grid = await SE.importers.pdfToGrid(buf, (f) => busy(true, 'Reading PDF… ' + Math.round(f * 100) + '%'));
        busy(false);
        if (grid.rows.length < 3) throw new Error('No readable text rows found in this PDF. If it is a scanned image, export the layout from P6 as PDF with text, or as Excel.');
        return mappingDialog({ grid, fileName: file.name, source: 'pdf' });
      }
      throw new Error('Unsupported file type .' + ext + '. Use .xer, .xlsx, .xls, .csv, .pdf, .xml or .sej');
    } catch (e) {
      busy(false);
      console.error(e);
      toast(e.message || String(e), 'e', 'Could not open ' + file.name, 9000);
    }
  }
  function looksLikeUpdateSheet(buf) {
    try { const wb = XLSX.read(buf, { type: 'array', bookSheets: true }); return wb.SheetNames.includes('Update Sheet'); } catch (e) { return false; }
  }
  function pickProject(projs) {
    const sel = h('select', { class: 'inp', id: 'pickProj' }, projs.map((p) => h('option', { value: p.id, text: p.code + ' - ' + p.name + ' (' + p.tasks + ' activities)' })));
    return modal('This XER contains ' + projs.length + ' projects', h('div', null, h('p', { text: 'Choose the project to update:' }), sel), [{ label: 'Cancel', value: null }, { label: 'Open', cls: 'pri', action: () => sel.value }], 'narrow');
  }

  async function afterLoad(P, askDD) {
    S.P = P;
    S.sel = null; S.multi.clear(); S.collapsed.clear();
    S.lensSel.clear(); S.dimSel.building.clear(); S.dimSel.epc.clear(); S.statusSel.clear(); S.ask = null; S.uidFilter = null; S.text = '';
    S.lastHealth = null;
    $('#welcome').hidden = true;
    if (!P.settings.scheduled && P.meta.source !== 'xer') { /* keep file dates */ }
    UI.setGroup('wbs');
    UI.refresh();
    setTimeout(() => { UI.gantt.render(true); UI.gantt.scrollToDay((P.meta.dataDate || D.todayDay()) - 60); }, 30);
    if (P.importWarnings && P.importWarnings.length) P.importWarnings.slice(0, 4).forEach((w) => toast(w, 'w', 'Import'));
    const bs = P.settings.dims.building, es = P.settings.dims.epc;
    toast('Buildings from ' + (bs.mode === 'code' ? 'activity code "' + bs.codeType + '"' : bs.mode === 'wbs' ? 'WBS level ' + bs.wbsLevel : 'auto-detection') + ', EPC from ' + (es.mode === 'code' ? 'code "' + es.codeType + '"' : es.mode === 'wbs' ? 'WBS level ' + es.wbsLevel : 'keywords & WBS') + '. Change in Analyze → Setup.', 'i', 'Loaded ' + P.acts.length + ' activities');
    if (askDD) await UI.dataDateDialog(true);
  }

  async function loadDemo() {
    busy(true, 'Building demo project…');
    await tick();
    const P = SE.demo.build();
    busy(false);
    await afterLoad(P, true);
  }

  /* ---------------- mapping wizard (Excel / CSV / PDF) ---------------- */
  async function mappingDialog(ctx) {
    const F = SE.importers.FIELDS;
    let grid, sheetName;
    const setSheet = (n) => { sheetName = n; grid = SE.importers.sheetToGrid(ctx.wb, n); };
    if (ctx.wb) setSheet(SE.importers.bestSheet(ctx.wb)); else grid = ctx.grid;
    let hd = SE.importers.detectHeader(grid.rows);
    let map = SE.importers.guessMapping(grid.rows[hd.headerRow] || []);
    const body = h('div');
    const top = h('div', { class: 'form' });
    const sheetSel = ctx.wb ? h('select', { class: 'inp', id: 'mp_sheet' }, ctx.wb.SheetNames.map((n) => h('option', { value: n, text: n }))) : null;
    if (sheetSel) { sheetSel.value = sheetName; sheetSel.onchange = () => { setSheet(sheetSel.value); hd = SE.importers.detectHeader(grid.rows); map = SE.importers.guessMapping(grid.rows[hd.headerRow] || []); hdrIn.value = hd.headerRow + 1; dsIn.value = hd.dataStart + 1; draw(); }; }
    const hdrIn = h('input', { class: 'inp', id: 'mp_hdr', type: 'number', min: 1, value: hd.headerRow + 1 });
    const dsIn = h('input', { class: 'inp', id: 'mp_ds', type: 'number', min: 1, value: hd.dataStart + 1 });
    hdrIn.onchange = () => { hd.headerRow = Math.max(0, +hdrIn.value - 1); map = SE.importers.guessMapping(grid.rows[hd.headerRow] || []); if (hd.dataStart <= hd.headerRow) { hd.dataStart = hd.headerRow + 1; dsIn.value = hd.dataStart + 1; } draw(); };
    dsIn.onchange = () => { hd.dataStart = Math.max(hd.headerRow + 1, +dsIn.value - 1); draw(); };
    const nameIn = h('input', { class: 'inp', id: 'mp_name', value: ctx.fileName.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ') });
    const ddIn = h('input', { class: 'inp', id: 'mp_dd', placeholder: 'auto: day after latest actual' });
    const mdy = h('input', { type: 'checkbox', id: 'mp_mdy' });
    const extra = h('input', { type: 'checkbox', id: 'mp_extra' });
    extra.checked = true;
    if (sheetSel) top.append(UI.panels.field('Sheet', sheetSel));
    top.append(UI.panels.field('Header row', hdrIn), UI.panels.field('First data row', dsIn), UI.panels.field('Project name', nameIn), UI.panels.field('Last Data Date in this file', ddIn, 'Leave blank to detect'));
    const opts = h('div', { class: 'opts' },
      h('label', null, mdy, 'Dates are month/day/year (US). Default is day/month/year.'),
      h('label', null, extra, 'Import other text columns as activity codes (e.g. Area, Contractor)'));
    const prev = h('div', { class: 'preview' });
    const status = h('div', { class: 'msg i', style: { marginTop: '10px' } });
    body.append(h('p', { style: { marginTop: 0 }, html: (ctx.source === 'pdf' ? 'Text was read from the PDF layout. ' : '') + 'Check the column mapping: each column header has a drop-down. Green = mapped. Rows without an Activity ID (or with only a name) become <b>WBS / group rows</b>.' }), top, opts, prev, status);
    const draw = () => {
      const header = grid.rows[hd.headerRow] || [];
      const ncol = Math.max(header.length, ...(grid.rows.slice(hd.dataStart, hd.dataStart + 12).map((r) => r.length)));
      const byCol = {};
      for (const k in map) byCol[map[k]] = k;
      let html = '<table><thead><tr>';
      for (let c = 0; c < ncol; c++) {
        html += '<th class="' + (byCol[c] ? 'mapped' : '') + '"><div style="font-weight:400;color:var(--ink-3);max-width:150px;overflow:hidden;text-overflow:ellipsis">' + esc(header[c] instanceof Date ? D.fmt(D.parseDay(header[c])) : header[c] || 'Col ' + (c + 1)) + '</div><select data-c="' + c + '"><option value="">— ignore —</option>' + F.map((f) => '<option value="' + f.key + '"' + (byCol[c] === f.key ? ' selected' : '') + '>' + esc(f.label) + '</option>').join('') + '</select></th>';
      }
      html += '</tr></thead><tbody>';
      grid.rows.slice(hd.dataStart, hd.dataStart + 14).forEach((r) => {
        html += '<tr>' + Array.from({ length: ncol }, (_, c) => { const v = r[c]; return '<td>' + esc(v instanceof Date ? D.fmt(D.parseDay(v)) : v == null ? '' : v) + '</td>'; }).join('') + '</tr>';
      });
      html += '</tbody></table>';
      prev.innerHTML = html;
      prev.querySelectorAll('select').forEach((s) => s.onchange = () => {
        const c = +s.dataset.c;
        for (const k in map) if (map[k] === c) delete map[k];
        if (s.value) map[s.value] = c;
        draw();
      });
      const miss = F.filter((f) => f.req && map[f.key] == null).map((f) => f.label);
      const dataRows = grid.rows.length - hd.dataStart;
      status.className = 'msg ' + (miss.length ? 'e' : 'g');
      status.innerHTML = miss.length ? 'Map the required column(s): <b>' + miss.join(', ') + '</b>.' : 'Ready: ' + dataRows + ' rows. Mapped: ' + Object.keys(map).map((k) => SE.importers.FIELD_BY_KEY[k].label).join(', ') + '.' + (map.preds == null && map.succs == null ? ' <br>No predecessor column - the engine will schedule <b>date-driven</b> (keeps planned dates, pushes late work to the Data Date).' : '');
    };
    draw();
    const res = await modal('Import ' + ctx.fileName, body, [
      { label: 'Cancel', value: null },
      { label: 'Import schedule', cls: 'pri', action: () => {
        if (map.code == null && map.name == null) { toast('Map at least Activity ID or Activity Name.', 'e'); return false; }
        if (map.code == null) map.code = map.name;
        let dd = null;
        if (ddIn.value.trim()) { const p = D.parseDate(ddIn.value); if (!p) { toast('Data Date not understood.', 'e'); return false; } dd = p.day; }
        const header = grid.rows[hd.headerRow] || [];
        const used = new Set(Object.values(map));
        const extraCols = [];
        if (extra.checked) {
          for (let c = 0; c < header.length; c++) {
            if (used.has(c) || !header[c]) continue;
            const vals = grid.rows.slice(hd.dataStart, hd.dataStart + 200).map((r) => r[c]).filter((v) => v !== '' && v != null);
            if (!vals.length || vals.some((v) => v instanceof Date || typeof v === 'number')) continue;
            const uniq = new Set(vals.map(String));
            if (uniq.size <= Math.max(2, vals.length * 0.6) && uniq.size < 80) extraCols.push(c);
          }
        }
        try {
          const P = SE.importers.gridToProject(grid, map, { headerRow: hd.headerRow, dataStart: hd.dataStart, fileName: ctx.fileName, name: nameIn.value.trim(), dataDate: dd, mdy: mdy.checked, source: ctx.source, extraCodes: extraCols });
          if (!P.acts.length) { toast('No activities were found with this mapping.', 'e'); return false; }
          return P;
        } catch (e) { console.error(e); toast(e.message, 'e'); return false; }
      } }
    ], 'wide');
    if (res) {
      toast(res.acts.length + ' activities, ' + Object.keys(res.wbs).length + ' WBS nodes, ' + res.rels.length + ' relationships imported.', 'g', 'Imported');
      await afterLoad(res, true);
    }
  }

  /* ---------------- update sheet ---------------- */
  async function importUpdateSheet(buf, name) {
    const P = S.P;
    try {
      const wb = SE.importers.readWorkbook(buf);
      const r = SE.importers.readUpdateSheet(P, wb);
      if (!r.patches.length) { toast('No changes found in "' + r.sheet + '". Fill the orange "New …" columns and try again.', 'w'); return; }
      const t = h('table', { class: 't' });
      t.innerHTML = '<thead><tr><th>Activity</th><th>Changes from sheet</th></tr></thead>';
      const tb = h('tbody');
      r.patches.slice(0, 400).forEach((p) => {
        const a = P.act(p.uid);
        const txt = Object.keys(p.changes).map((k) => (k === 'qty' ? 'Done qty ' + p.changes.qty.done : k === 'notes' ? 'Remark' : k + ' ' + (typeof p.changes[k] === 'number' && /Start|Finish/.test(k) ? D.fmt(p.changes[k]) : p.changes[k]))).join(' · ');
        tb.append(h('tr', { html: '<td><span class="mono">' + esc(a.code) + '</span> ' + esc(a.name) + '</td><td>' + esc(txt) + '</td>' }));
      });
      t.append(tb);
      const ok = await modal('Import Update Sheet - ' + r.patches.length + ' activities', h('div', null,
        r.notFound.length ? h('div', { class: 'msg w', text: r.notFound.length + ' Activity IDs in the sheet are not in this schedule: ' + r.notFound.slice(0, 12).join(', ') }) : null,
        h('p', { text: 'Each change is validated with the same rules as typing in the grid. Rejected ones are listed afterwards.' }),
        h('div', { class: 'preview', style: { maxHeight: '50vh' } }, t)), [{ label: 'Cancel', value: null }, { label: 'Apply changes', cls: 'pri', value: true }], 'wide');
      if (!ok) return;
      const res = UI.applyPatches(r.patches, 'Update Sheet (' + name + ')', { quiet: true });
      if (res.errors.length) {
        const list = h('ul', null, res.errors.slice(0, 60).map((e) => h('li', { html: '<b class="mono">' + esc(e.code) + '</b> ' + esc(e.msg) })));
        modal(res.applied + ' applied, ' + res.errors.length + ' rejected', list);
      } else toast(res.applied + ' activities updated from the sheet. Press F9 to schedule.', 'g', 'Update Sheet imported');
    } catch (e) { console.error(e); toast(e.message, 'e', 'Update Sheet'); }
  }

  /* ---------------- save / export ---------------- */
  function saveProject() {
    if (!S.P) return;
    download(JSON.stringify(S.P.toJSON()), baseName() + '.sej', 'application/json');
    toast('Saved ' + baseName() + '.sej - open it any time with Open…', 'g');
  }

  async function preflight(kind) {
    const P = S.P;
    if (!P.settings.scheduled) {
      const r = await modal('Schedule before exporting?', h('p', { html: 'You changed progress since the last <b>Schedule (F9)</b>. Forecast dates, float and the critical path in the ' + kind.toUpperCase() + ' would be out of date.' }), [
        { label: 'Cancel', value: null }, { label: 'Export as is', value: 'asis' }, { label: 'Schedule and export', cls: 'pri', value: 'f9' }
      ], 'narrow');
      if (!r) return false;
      if (r === 'f9') UI.runSchedule(true);
    }
    const inv = S.fl.counts.invalid || 0;
    if (inv && kind === 'xer') {
      const r = await modal(inv + ' activities have invalid progress', h('div', null, h('p', { text: 'P6 may reject or silently change these on import (e.g. actual dates after the Data Date). Fix them first - click "Show them".' })), [
        { label: 'Show them', value: 'show' }, { label: 'Export anyway', cls: 'danger', value: 'go' }
      ], 'narrow');
      if (r !== 'go') { if (r === 'show') { UI.clearFilters(); S.lensSel.add('invalid'); UI.setView('gantt'); } return false; }
    }
    return true;
  }
  const exportRows = (scope) => (scope === 'view' ? S.rows : SE.views.buildRows(S.P, { groupBy: S.groupBy.length ? S.groupBy : ['wbs'], sort: S.sort, flags: S.fl.map }));
  async function exportAs(kind, opts) {
    const P = S.P;
    if (!P) { toast('Open a schedule first.', 'w'); return; }
    opts = opts || {};
    if (!(await preflight(kind))) return;
    try {
      busy(true, 'Preparing ' + kind.toUpperCase() + '…');
      await tick();
      const b = baseName();
      if (kind === 'xer') {
        const txt = SE.xer.toXer(P, { addDimCodes: !!opts.addDimCodes });
        download(SE.xer.encode(txt, P.meta.xerEncoding || 'windows-1252'), b + '.xer', 'text/plain');
        if (P.meta.source === 'xer-generated') toast('Generated a new XER (the source was not an XER). In P6 use File → Import → Primavera PM (XER) → Create new project.', 'i', 'XER', 9000);
        else toast('In P6: File → Import → XER → choose "Update Existing Project" to bring the update into your project.', 'g', 'XER exported', 9000);
        UI.refresh({ noSave: false });
      } else if (kind === 'xlsx') {
        const buf = await SE.exporters.toExcel(P, { rows: exportRows(opts.scope) });
        download(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), b + '.xlsx');
        toast('Excel with Dashboard, Building x EPC, Schedule, Gantt, Update Sheet, Look-ahead, Attention, Health Check, Change Log and Relationships.', 'g', 'Excel exported', 7000);
      } else if (kind === 'pdf') {
        const buf = SE.exporters.toPDF(P, { rows: exportRows(opts.scope), format: opts.format || 'a3', summary: opts.summary !== false, gantt: opts.gantt !== false, tables: opts.tables !== false });
        download(new Blob([buf], { type: 'application/pdf' }), b + '.pdf');
        toast('PDF report exported.', 'g');
      } else if (kind === 'html') {
        download(new Blob([SE.exporters.toHTML(P, { rows: exportRows(opts.scope) })], { type: 'text/html' }), b + '_report.html');
        toast('Interactive HTML report exported - opens in any browser, can be emailed.', 'g');
      } else if (kind === 'csv') {
        download(SE.exporters.toCSV(P, exportRows(opts.scope)), b + '.csv', 'text/csv');
      } else if (kind === 'msp') {
        download(SE.exporters.toMSP(P), b + '_MSProject.xml', 'application/xml');
        toast('MS Project XML exported (File → Open in MS Project).', 'g');
      } else if (kind === 'sej') saveProject();
    } catch (e) { console.error(e); toast(e.message || String(e), 'e', 'Export failed'); }
    busy(false);
  }

  function exportDialog() {
    if (!S.P) { toast('Open a schedule first.', 'w'); return; }
    const P = S.P;
    const card = (kind, ext, title, text) => h('button', { class: 'expcard', type: 'button', 'data-kind': kind, html: '<b><span class="ext">' + ext + '</span>' + title + '</b><span>' + text + '</span>' });
    const scope = h('select', { class: 'inp', id: 'ex_scope', style: { width: 'auto' } }, h('option', { value: 'all', text: 'All activities, current grouping' }), h('option', { value: 'view', text: 'Only what is shown now (filters & collapsed groups)' }));
    const fmt = h('select', { class: 'inp', id: 'ex_fmt', style: { width: 'auto' } }, h('option', { value: 'a3', text: 'A3 landscape' }), h('option', { value: 'a4', text: 'A4 landscape' }), h('option', { value: 'a2', text: 'A2 landscape' }));
    const dimCodes = h('input', { type: 'checkbox', id: 'ex_dim' });
    const grid = h('div', { class: 'expgrid' },
      card('xer', '.XER', 'Primavera P6', P.meta.source === 'xer' ? 'Your original XER with this month\'s progress written in. Everything else (resources, costs, UDFs, codes) is kept.' : 'A new P6-importable XER built from this schedule.'),
      card('xlsx', '.XLSX', 'Excel workbook', 'Dashboard, P6-style schedule, cell Gantt, offline Update Sheet, look-ahead, attention list, health check, change log.'),
      card('pdf', '.PDF', 'PDF report', 'Summary with S-curve, building & EPC progress, P6-style Gantt pages, attention, look-ahead and health tables.'),
      card('html', '.HTML', 'HTML report', 'One file that opens in any browser: KPIs, S-curve, searchable collapsible Gantt. Easy to email.'),
      card('csv', '.CSV', 'CSV', 'Flat activity list for any tool.'),
      card('msp', '.XML', 'MS Project', 'MS Project XML with WBS, logic, progress and baseline.'),
      card('sej', '.SEJ', 'Engine project', 'Everything incl. quantities, remarks, change log - reopen later to continue.'));
    const body = h('div', null,
      h('div', { class: 'opts' }, h('label', null, 'Rows: ', scope), h('label', null, 'PDF page: ', fmt), h('label', null, dimCodes, 'XER: add Building & EPC as activity codes')),
      grid,
      h('div', { class: 'msg i', style: { marginTop: '12px' }, html: 'Data Date <b>' + D.fmtLong(P.meta.dataDate) + '</b> · ' + (P.settings.scheduled ? 'scheduled, finish <b>' + D.fmtLong(P.meta.scheduledFinish) + '</b>' : '<b style="color:var(--bad)">not scheduled since the last change</b>') + ' · ' + (S.fl.counts.invalid ? '<b style="color:var(--bad)">' + S.fl.counts.invalid + ' invalid</b>' : 'no invalid progress') + '.' }));
    const p = modal('Export', body, [{ label: 'Close', value: null }], 'wide');
    grid.querySelectorAll('.expcard').forEach((b) => { b.onclick = () => { const bg = b.closest('.modal-bg'); bg.querySelector('.mh button').click(); exportAs(b.dataset.kind, { scope: scope.value, format: fmt.value, addDimCodes: dimCodes.checked }); }; });
    return p;
  }

  /* ---------------- welcome ---------------- */
  async function renderWelcome() {
    const w = $('#welcome');
    w.innerHTML = '';
    const drop = h('div', { class: 'drop', id: 'drop', html:
      '<svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/></svg>' +
      '<b>Drop last month\'s schedule here</b><span>or choose a file - nothing is uploaded, it all runs in this page</span>' +
      '<div class="fmts"><span>.xer</span><span>.xlsx</span><span>.xls</span><span>.csv</span><span>.pdf</span><span>.xml (MS Project)</span><span>.sej</span></div>' });
    const acts = h('div', { class: 'acts' },
      h('button', { class: 'wbtn', type: 'button', text: 'Open a file…', onclick: () => pickFile() }),
      h('button', { class: 'wbtn ghost', type: 'button', text: 'Try the demo project', onclick: () => loadDemo() }));
    drop.append(acts);
    const restore = h('div', { class: 'restore' });
    drop.append(restore);
    const top = h('div', { class: 'wtop' }, h('div', { class: 'in' },
      h('div', null,
        h('div', { class: 'eyebrow', html: '<span>Schedule Engine</span><span>·</span><span>P6-style monthly update, no P6 needed</span>' }),
        h('h1', { text: 'Update your area schedule in minutes, not days.' }),
        h('p', { text: 'Load last month\'s XER, Excel or PDF. The engine shows what should have started, what is overdue and what is running ahead of plan, building-wise and EPC-wise. Update with dates, % or quantities, recalculate with F9, then export XER for P6 and Excel / PDF / HTML reports.' })),
      drop));
    const flow = h('div', { class: 'flow', html:
      '<div><em>STEP 1</em><b>Open</b><span>Last month\'s .xer, Excel, PDF or MS Project file</span></div>' +
      '<div><em>STEP 2</em><b>Data Date</b><span>Move the status date - the engine suggests the 1st of next month</span></div>' +
      '<div><em>STEP 3</em><b>Update</b><span>Spotlight shows late starts, overdue and future progress; Easy Update by building / EPC</span></div>' +
      '<div><em>STEP 4</em><b>Schedule F9</b><span>CPM with calendars, lags, constraints, retained logic; health check</span></div>' +
      '<div><em>STEP 5</em><b>Export</b><span>XER back to P6, Excel with Update Sheet, PDF Gantt, HTML report</span></div>' });
    const feat = h('div', { class: 'feat', html:
      '<div><h4>Mistake-proof updating</h4><p>Actual dates after the Data Date, 100% without a finish, progress without a start, finish before start - blocked with a clear message and a fix.</p></div>' +
      '<div><h4>Quantity-based %</h4><p>Scope vs completed quantity, this-month quantities and weighted steps (rules of credit) turn site figures into a defensible % complete.</p></div>' +
      '<div><h4>Ask the engine</h4><p>Type "delayed in Admin Building", "procurement progress" or "critical next 30 days" and the schedule filters itself.</p></div>' +
      '<div><h4>Building-wise & EPC-wise</h4><p>Buildings and Engineering / Procurement / Construction are detected from codes, WBS or activity names - and you can override them.</p></div>' +
      '<div><h4>Faithful XER round trip</h4><p>Resources, costs, UDFs and codes in your XER are kept; only progress, dates and float are written back.</p></div>' +
      '<div><h4>Works offline</h4><p>One HTML file. No install, no P6 licence, no upload. Autosaves in your browser so you can resume.</p></div>' });
    const mid = h('div', { class: 'wmid' }, flow, feat);
    w.append(top, mid);
    w.hidden = false;
    // drag & drop
    ['dragenter', 'dragover'].forEach((ev) => w.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((ev) => w.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
    w.addEventListener('drop', (e) => { const f = e.dataTransfer.files[0]; if (f) openFile(f); });
    try {
      const s = await kvGet('session');
      if (s && s.json) {
        restore.innerHTML = 'Last session: <b>' + esc(s.name) + '</b> · ' + s.acts + ' activities · DD ' + D.fmt(s.dd) + ' · ' + new Date(s.at).toLocaleString('en-IN');
        restore.append(h('button', { class: 'wbtn', type: 'button', text: 'Resume', onclick: () => { try { afterLoad(SE.Project.fromJSON(JSON.parse(s.json)), false); } catch (e) { toast('Could not restore: ' + e.message, 'e'); } } }));
      }
    } catch (e) { /* no storage */ }
  }

  UI.io = { pickFile, openFile, loadDemo, saveProject, exportAs, exportDialog, autosave, download, renderWelcome, afterLoad, kvGet, kvSet, baseName };
})();
