/* Schedule Engine - core/qtyexport.js
 * Renders the quantity one-pager layout spec to PowerPoint (native charts,
 * speaker notes), PDF, and builds / reads the Excel quantity template.
 */
(function (SE) {
  'use strict';
  const D = SE.D;
  const hex6 = (c) => String(c || '#000000').replace('#', '').toUpperCase().slice(0, 6);
  const ascii = (s) => String(s == null ? '' : s).replace(/→/g, '->').replace(/≈/g, '~').replace(/−/g, '-').replace(/■/g, '').replace(/[^\x09\x0A\x20-\x7E\xA0-\xFF–—‘’“”•]/g, '');

  /* ---------------- PowerPoint ---------------- */
  async function toPPTX(P, by) {
    if (typeof PptxGenJS === 'undefined') throw new Error('PowerPoint writer not loaded.');
    const slides = SE.qty.deck(P, by);
    if (!slides.length) throw new Error('Add at least one quantity item first.');
    const pres = new PptxGenJS();
    pres.layout = 'LAYOUT_WIDE';
    pres.author = 'Schedule Engine';
    pres.title = (P.qty && P.qty.title) || 'Quantity one-pagers';
    for (const sl of slides) {
      const s = pres.addSlide();
      s.background = { color: 'FFFFFF' };
      for (const e of sl.el) {
        if (e.type === 'rect') {
          const shape = e.chevron ? pres.shapes.CHEVRON : e.round ? pres.shapes.OVAL : e.radius ? pres.shapes.ROUNDED_RECTANGLE : pres.shapes.RECTANGLE;
          const o = { x: e.x, y: e.y, w: Math.max(0.01, e.w), h: Math.max(0.01, e.h), fill: { color: hex6(e.fill), transparency: e.alpha != null ? Math.round((1 - e.alpha) * 100) : 0 }, line: e.border ? { color: hex6(e.border), width: 0.5 } : { color: hex6(e.fill), width: 0, transparency: 100 } };
          if (e.radius) o.rectRadius = Math.min(0.5, e.radius / Math.max(0.05, Math.min(e.w, e.h)));
          s.addShape(shape, o);
        } else if (e.type === 'line') {
          s.addShape(pres.shapes.LINE, { x: Math.min(e.x1, e.x2), y: Math.min(e.y1, e.y2), w: Math.max(0.001, Math.abs(e.x2 - e.x1)), h: Math.max(0, Math.abs(e.y2 - e.y1)), line: { color: hex6(e.color), width: e.w || 0.75, dashType: e.dash ? 'dash' : 'solid' } });
        } else if (e.type === 'text') {
          const base = { fontFace: 'Arial', fontSize: e.size, color: hex6(e.color), bold: !!e.bold };
          let text = e.text;
          const lead = e.boldLead || e.italicLead;
          if (lead && text.startsWith(lead)) text = [{ text: lead, options: Object.assign({}, base, { bold: true, color: hex6(e.color) }) }, { text: text.slice(lead.length), options: base }];
          const o = Object.assign({ x: e.x, y: e.y, w: e.w, h: e.h, align: e.align || 'left', valign: e.valign || 'middle', margin: e.pad ? Math.round(e.pad * 72) : 0, isTextBox: true, fit: 'none', wrap: true }, base);
          if (e.fill) o.fill = { color: hex6(e.fill) };
          if (e.border) o.line = { color: hex6(e.border), width: 0.5 };
          s.addText(text, o);
        } else if (e.type === 'chart') {
          const data = e.series.map((sr) => ({ name: sr.name, labels: e.cats, values: sr.values.map((v) => Math.round(v * 10) / 10) }));
          const common = {
            x: e.x, y: e.y, w: e.w, h: e.h, chartColors: e.series.map((sr) => hex6(sr.color)), showLegend: true, legendPos: 't', legendFontSize: 8, legendColor: '5B6475',
            catAxisLabelColor: '5B6475', valAxisLabelColor: '5B6475', catAxisLabelFontSize: 8, valAxisLabelFontSize: 8, valGridLine: { color: 'E5E8EE', size: 0.5 }, catGridLine: { style: 'none' },
            catAxisLineShow: true, valAxisLineShow: false, valAxisLabelFormatCode: '#,##0'
          };
          if (e.kind === 'bar') s.addChart(pres.charts.BAR, data, Object.assign(common, { barDir: 'col', barGrouping: 'clustered', barGapWidthPct: 60, showValue: true, dataLabelPosition: 'outEnd', dataLabelFontSize: 6.5, dataLabelColor: '1B1B1B', dataLabelFormatCode: '#,##0;;;' }));
          else s.addChart(pres.charts.LINE, data, Object.assign(common, { lineSize: 2, lineDataSymbol: 'circle', lineDataSymbolSize: 4, lineDash: e.series.map((sr) => (sr.dash ? 'dash' : 'solid')) }));
        }
      }
      if (sl.notes) s.addNotes(sl.notes);
    }
    return pres.write({ outputType: 'arraybuffer' });
  }

  /* ---------------- PDF ---------------- */
  function toPDF(P, by) {
    const JS = (typeof window !== 'undefined' && window.jspdf) ? window.jspdf.jsPDF : (typeof jspdf !== 'undefined' ? jspdf.jsPDF : null);
    if (!JS) throw new Error('PDF writer not loaded.');
    const slides = SE.qty.deck(P, by);
    if (!slides.length) throw new Error('Add at least one quantity item first.');
    const doc = new JS({ orientation: 'landscape', unit: 'in', format: [13.333, 7.5] });
    const rgb = (h) => { h = hex6(h); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; };
    slides.forEach((sl, i) => {
      if (i) doc.addPage([13.333, 7.5], 'landscape');
      for (const e of sl.el) drawPdf(doc, e, rgb);
    });
    return doc.output('arraybuffer');
  }
  function drawPdf(doc, e, rgb) {
    if (e.type === 'rect') {
      if (e.alpha != null && doc.GState) { doc.saveGraphicsState(); doc.setGState(new doc.GState({ opacity: e.alpha })); }
      doc.setFillColor.apply(doc, rgb(e.fill));
      if (e.border) doc.setDrawColor.apply(doc, rgb(e.border));
      const mode = e.border ? 'FD' : 'F';
      if (e.chevron) {
        const tip = Math.min(0.2, e.h / 2);
        doc.lines([[e.w - tip, 0], [tip, e.h / 2], [-tip, e.h / 2], [-(e.w - tip), 0], [tip, -e.h / 2], [-tip, -e.h / 2]], e.x, e.y, [1, 1], 'F', true);
      } else if (e.round) doc.ellipse(e.x + e.w / 2, e.y + e.h / 2, e.w / 2, e.h / 2, 'F');
      else if (e.radius) doc.roundedRect(e.x, e.y, e.w, e.h, e.radius, e.radius, mode);
      else doc.rect(e.x, e.y, e.w, e.h, mode);
      if (e.alpha != null && doc.GState) doc.restoreGraphicsState();
    } else if (e.type === 'line') {
      doc.setDrawColor.apply(doc, rgb(e.color));
      doc.setLineWidth((e.w || 0.75) / 72);
      doc.line(e.x1, e.y1, e.x2, e.y2);
    } else if (e.type === 'text') {
      if (e.fill) { doc.setFillColor.apply(doc, rgb(e.fill)); doc.rect(e.x, e.y, e.w, e.h, 'F'); }
      if (e.border) { doc.setDrawColor.apply(doc, rgb(e.border)); doc.setLineWidth(0.5 / 72); doc.rect(e.x, e.y, e.w, e.h, 'S'); }
      const pad = e.pad || 0;
      doc.setFont('helvetica', e.bold ? 'bold' : 'normal');
      doc.setFontSize(e.size);
      doc.setTextColor.apply(doc, rgb(e.color));
      const lines = [];
      String(e.text).split('\n').forEach((para) => lines.push.apply(lines, doc.splitTextToSize(ascii(para), Math.max(0.1, e.w - 2 * pad))));
      const lh = e.size / 72 * 1.18;
      const th = lines.length * lh;
      let y = e.valign === 'top' ? e.y + pad + e.size / 72 * 0.9 : e.y + (e.h - th) / 2 + e.size / 72 * 0.88;
      const lead = e.boldLead || e.italicLead;
      lines.forEach((ln, k) => {
        const x = e.align === 'center' ? e.x + e.w / 2 : e.align === 'right' ? e.x + e.w - pad : e.x + pad;
        if (k === 0 && lead && ln.startsWith(lead) && e.align !== 'center') {
          doc.setFont('helvetica', 'bold'); doc.text(lead, x, y);
          const lw = doc.getTextWidth(lead);
          doc.setFont('helvetica', e.bold ? 'bold' : 'normal'); doc.text(ln.slice(lead.length), x + lw, y);
        } else doc.text(ln, x, y, { align: e.align || 'left' });
        y += lh;
      });
    } else if (e.type === 'chart') {
      chartPrims(e).forEach((p) => drawPdf(doc, p, rgb));
    }
  }
  /** turn a chart spec into rect/line/text primitives (for PDF & HTML) */
  function chartPrims(e) {
    const out = [];
    const L = 0.55, B = 0.3, T = 0.3;
    const x0 = e.x + L, y0 = e.y + T, w = e.w - L - 0.1, h = e.h - T - B;
    let mx = 0;
    e.series.forEach((s) => s.values.forEach((v) => { if (v > mx) mx = v; }));
    const step = niceStep(mx / 4);
    const top = Math.max(step * 4, step * Math.ceil(mx / step));
    const Y = (v) => y0 + h - h * (v / (top || 1));
    for (let v = 0; v <= top + 0.001; v += step) {
      out.push({ type: 'line', x1: x0, y1: Y(v), x2: x0 + w, y2: Y(v), color: '#E5E8EE', w: 0.5 });
      out.push({ type: 'text', x: e.x, y: Y(v) - 0.08, w: L - 0.06, h: 0.16, text: SE.qty.fmtQ(v), size: 6.5, color: '#5B6475', align: 'right' });
    }
    const n = e.cats.length;
    const cw = w / Math.max(1, n);
    e.cats.forEach((c, i) => out.push({ type: 'text', x: x0 + i * cw, y: y0 + h + 0.04, w: cw, h: 0.18, text: c, size: 6.5, color: '#5B6475', align: 'center' }));
    // legend
    let lx = x0;
    e.series.forEach((s) => { out.push({ type: 'rect', x: lx, y: e.y + 0.08, w: 0.14, h: 0.08, fill: s.color }); out.push({ type: 'text', x: lx + 0.18, y: e.y + 0.02, w: 1.2, h: 0.2, text: s.name, size: 7, color: '#5B6475' }); lx += 0.3 + s.name.length * 0.055; });
    if (e.kind === 'bar') {
      const k = e.series.length, bw = cw * 0.7 / k;
      e.series.forEach((s, j) => s.values.forEach((v, i) => {
        if (!v) return;
        const x = x0 + i * cw + cw * 0.15 + j * bw;
        out.push({ type: 'rect', x, y: Y(v), w: bw * 0.92, h: y0 + h - Y(v), fill: s.color });
        out.push({ type: 'text', x: x - 0.1, y: Y(v) - 0.16, w: bw + 0.2, h: 0.14, text: SE.qty.fmtQ(v), size: 5.8, color: '#1B1B1B', align: 'center' });
      }));
    } else {
      e.series.forEach((s) => {
        for (let i = 1; i < s.values.length; i++) {
          const xa = x0 + (i - 0.5) * cw, xb = x0 + (i + 0.5) * cw;
          if (s.dash) { for (let t = 0; t < 1; t += 0.2) out.push({ type: 'line', x1: xa + (xb - xa) * t, y1: Y(s.values[i - 1]) + (Y(s.values[i]) - Y(s.values[i - 1])) * t, x2: xa + (xb - xa) * (t + 0.1), y2: Y(s.values[i - 1]) + (Y(s.values[i]) - Y(s.values[i - 1])) * (t + 0.1), color: s.color, w: 1.2 }); }
          else out.push({ type: 'line', x1: xa, y1: Y(s.values[i - 1]), x2: xb, y2: Y(s.values[i]), color: s.color, w: 2 });
        }
      });
    }
    out.push({ type: 'line', x1: x0, y1: y0 + h, x2: x0 + w, y2: y0 + h, color: '#9AA3B5', w: 0.75 });
    return out;
  }
  function niceStep(v) { if (v <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))); const f = v / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p; }

  /* ---------------- Excel template ---------------- */
  async function toExcel(P, blank) {
    if (typeof ExcelJS === 'undefined') throw new Error('Excel writer not loaded.');
    const Q = SE.qty.ensure(P);
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Schedule Engine';
    const K = SE.qty.K;
    const arg = (c) => 'FF' + hex6(c);
    const S0 = SE.qty.startKey(P);
    const months = SE.qty.monthsBetween(S0, SE.qty.keyAdd(S0, 11));
    const head = (ws, r, labels, color) => {
      const row = ws.getRow(r);
      labels.forEach((l, i) => { const c = row.getCell(i + 1); c.value = l; c.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: arg(color || K.dark) } }; c.alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' }; });
      row.height = 32;
    };
    const title = (ws, text, n, sub) => {
      ws.mergeCells(1, 1, 1, n); const c = ws.getCell(1, 1); c.value = text; c.font = { bold: true, size: 15, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: arg(K.dark) } }; ws.getRow(1).height = 28; c.alignment = { vertical: 'middle', indent: 1 };
      ws.mergeCells(2, 1, 2, n); const s = ws.getCell(2, 1); s.value = sub; s.font = { italic: true, size: 9, color: { argb: 'FFFFFFFF' } }; s.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: arg(K.cobalt) } }; s.alignment = { indent: 1, wrapText: true }; ws.getRow(2).height = 30;
    };
    const input = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF4E5' } };
    const items = blank ? [] : Q.items;
    // Items
    const wsI = wb.addWorksheet('Items', { properties: { tabColor: { argb: arg(K.cobalt) } }, views: [{ state: 'frozen', xSplit: 2, ySplit: 3 }] });
    const icols = [['ID', 10], ['Item / building', 30], ['Building', 22], ['WBS', 20], ['EPC', 14], ['Vendor', 22], ['Unit', 7], ['Scope', 10], ['Scope note', 30], ['Drawings released', 11], ['Supplied till date', 11], ['Erected till date', 11], ['Supply last month', 10], ['Erection last month', 10], ['Target supply finish (mmm-yy)', 12], ['Target erection finish (mmm-yy)', 12], ['Status (auto / ON TRACK / AT RISK / DELAYED)', 16], ['Drawings %', 9], ['Supplied %', 9], ['Erected %', 9], ['Balance to erect', 10]];
    icols.forEach((c, i) => { wsI.getColumn(i + 1).width = c[1]; });
    title(wsI, 'Quantity tracker - items', icols.length, 'Unit ' + Q.unit + ' · data as on ' + D.fmtLong(SE.qty.asOf(P)) + ' · Fill orange cells. % columns are formulas. Import back with Qty & Liquidation → Import Excel.');
    head(wsI, 3, icols.map((c) => c[0]));
    const rowsI = items.length ? items : [{ id: 'Q1', name: 'Example building', building: 'Example building', wbs: '', epc: 'Construction', vendor: 'Vendor name', scope: 1000, scopeNote: '', done: { dwg: 800, sup: 100, ere: 0 }, last: { sup: 50, ere: 0 }, target: {}, status: 'auto' }];
    rowsI.forEach((it, i) => {
      const r = 4 + i;
      const row = wsI.getRow(r);
      row.values = [it.id, it.name, it.building, it.wbs, it.epc, it.vendor, Q.unit, +it.scope || 0, it.scopeNote || '', +it.done.dwg || 0, +it.done.sup || 0, +it.done.ere || 0, +it.last.sup || 0, +it.last.ere || 0, it.target && it.target.sup ? SE.qty.keyLong(it.target.sup) : '', it.target && it.target.ere ? SE.qty.keyLong(it.target.ere) : '', it.status || 'auto'];
      row.getCell(18).value = { formula: 'IF(H' + r + '>0,J' + r + '/H' + r + ',"")' };
      row.getCell(19).value = { formula: 'IF(H' + r + '>0,K' + r + '/H' + r + ',"")' };
      row.getCell(20).value = { formula: 'IF(H' + r + '>0,L' + r + '/H' + r + ',"")' };
      row.getCell(21).value = { formula: 'H' + r + '-L' + r };
      [18, 19, 20].forEach((c) => { row.getCell(c).numFmt = '0%'; });
      for (let c = 2; c <= 17; c++) row.getCell(c).fill = input;
      row.getCell(5).dataValidation = { type: 'list', allowBlank: true, formulae: ['"Engineering,Procurement,Construction,Others"'] };
      row.getCell(17).dataValidation = { type: 'list', allowBlank: true, formulae: ['"auto,ON TRACK,WATCH,AT RISK,DELAYED"'] };
      [10, 11, 12].forEach((c) => { row.getCell(c).dataValidation = { type: 'decimal', operator: 'between', allowBlank: true, formulae: [0, '$H$' + r], showErrorMessage: true, errorTitle: 'Quantity', error: 'Cannot exceed the scope in column H' }; });
    });
    // Plan
    const wsP = wb.addWorksheet('Plan', { properties: { tabColor: { argb: arg(K.pacific) } }, views: [{ state: 'frozen', xSplit: 4, ySplit: 3 }] });
    const pcols = ['ID', 'Item', 'Stage', 'Balance'].concat(months.map((k) => SE.qty.keyLong(k))).concat(['Plan total', 'Check']);
    title(wsP, 'Monthly liquidation plan (' + Q.unit + ')', pcols.length, 'One row per item and stage. Months start after the data-as-on month. Check turns red when the plan total does not equal the balance (scope − done).');
    head(wsP, 3, pcols, K.cobalt);
    [10, 30, 10, 11].concat(months.map(() => 9)).concat([11, 18]).forEach((w, i) => { wsP.getColumn(i + 1).width = w; });
    let pr = 4;
    rowsI.forEach((it, i) => {
      ['sup', 'ere'].forEach((st) => {
        const row = wsP.getRow(pr);
        const ir = 4 + i;
        row.values = [it.id, it.name, st === 'sup' ? 'Supply' : 'Erection'];
        row.getCell(4).value = { formula: 'Items!H' + ir + '-Items!' + (st === 'sup' ? 'K' : 'L') + ir };
        months.forEach((k, j) => { const v = it.plan && it.plan[st] ? +it.plan[st][k] || null : null; const c = row.getCell(5 + j); c.value = v; c.fill = input; c.numFmt = '#,##0'; });
        const fc = colName(5), lc = colName(4 + months.length);
        row.getCell(5 + months.length).value = { formula: 'SUM(' + fc + pr + ':' + lc + pr + ')' };
        row.getCell(6 + months.length).value = { formula: 'IF(ABS(' + colName(5 + months.length) + pr + '-D' + pr + ')<=1,"OK","Plan " & TEXT(' + colName(5 + months.length) + pr + ',"#,##0") & " vs balance " & TEXT(D' + pr + ',"#,##0"))' };
        pr++;
      });
    });
    if (pr > 4) wsP.addConditionalFormatting({ ref: colName(6 + months.length) + '4:' + colName(6 + months.length) + (pr - 1), rules: [{ type: 'containsText', operator: 'containsText', text: 'OK', style: { font: { color: { argb: 'FF1F9D55' }, bold: true } } }, { type: 'notContainsText', operator: 'notContains', text: 'OK', style: { font: { color: { argb: 'FFE5383B' }, bold: true } } }] });
    // Fronts
    const wsF = wb.addWorksheet('Fronts', { properties: { tabColor: { argb: arg(K.pink) } } });
    title(wsF, 'Work fronts (rows of the work-front table)', 5, 'Category: front, supply, erection, ts, handover. Months as mmm-yy (e.g. Oct-26).');
    head(wsF, 3, ['ID', 'Front', 'Category', 'From', 'To'], K.pink);
    [10, 34, 14, 10, 10].forEach((w, i) => { wsF.getColumn(i + 1).width = w; });
    let fr = 4;
    rowsI.forEach((it) => (it.fronts && it.fronts.length ? it.fronts : [{ name: 'Fabrication & supply', cat: 'supply', from: S0, to: SE.qty.keyAdd(S0, 3) }]).forEach((f) => { const row = wsF.getRow(fr++); row.values = [it.id, f.name, f.cat, f.from ? SE.qty.keyLong(f.from) : '', f.to ? SE.qty.keyLong(f.to) : '']; row.getCell(3).dataValidation = { type: 'list', allowBlank: true, formulae: ['"front,supply,erection,ts,handover"'] }; for (let c = 2; c <= 5; c++) row.getCell(c).fill = input; }));
    // Concerns
    const wsC = wb.addWorksheet('Concerns', { properties: { tabColor: { argb: arg(K.amber) } } });
    title(wsC, 'Your own concerns & actions (the engine adds its automatic ones)', 5, 'Tag e.g. SUPPLY / DRAWINGS / ERECTION / FRONT / INTERFACE. Severity high or med.');
    head(wsC, 3, ['ID', 'Tag', 'Severity', 'Concern', 'Action'], K.amber);
    [10, 12, 9, 60, 50].forEach((w, i) => { wsC.getColumn(i + 1).width = w; });
    let cr = 4;
    rowsI.forEach((it) => (it.concerns || []).forEach((c) => { wsC.getRow(cr++).values = [it.id, c.tag, c.sev || 'med', c.text, c.action]; }));
    // Summary (engine output)
    if (!blank && items.length) {
      const wsS = wb.addWorksheet('Engine summary', { properties: { tabColor: { argb: arg(K.green) } } });
      title(wsS, 'Engine summary by ' + (Q.groupBy || 'building'), 8, 'Calculated by Schedule Engine - not an input sheet.');
      head(wsS, 3, ['Group', 'Status', 'Scope', 'Drawings', 'Supplied', 'Erected', 'Tag', 'Concern / action'], K.green);
      [30, 12, 10, 10, 10, 10, 12, 110].forEach((w, i) => { wsS.getColumn(i + 1).width = w; });
      let sr = 4;
      SE.qty.groups(P).forEach((g) => {
        const an = SE.qty.analyze(P, g.agg);
        (an.concerns.length ? an.concerns : [{ tag: '', text: 'No concerns', action: '' }]).forEach((c, j) => {
          const row = wsS.getRow(sr++);
          row.values = j ? ['', '', '', '', '', '', c.tag, c.text + (c.action ? '  →  ' + c.action : '')] : [g.key, an.status, an.scope, an.dwg, an.supDone, an.ereDone, c.tag, c.text + (c.action ? '  →  ' + c.action : '')];
          if (!j) row.getCell(2).font = { bold: true, color: { argb: arg(SE.qty.STATUS_COLOR[an.status] || K.amber) } };
          row.getCell(8).alignment = { wrapText: true };
        });
      });
    }
    return wb.xlsx.writeBuffer();
  }
  function colName(n) { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }

  function fromExcel(P, buf) {
    const Q = SE.qty.ensure(P);
    const wb = XLSX.read(buf, { type: 'array', cellDates: true });
    const rows = (name) => { const ws = wb.Sheets[name]; return ws ? XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' }) : null; };
    const I = rows('Items');
    if (!I) throw new Error('No "Items" sheet - use the Qty template from Schedule Engine.');
    const hdrI = I.findIndex((r) => String(r[0]).trim() === 'ID');
    const mk = (v) => { if (v instanceof Date) return SE.qty.keyOf(D.parseDay(v)); const p = D.parseDate('01-' + String(v).trim()) || D.parseDate(v); return p ? SE.qty.keyOf(p.day) : null; };
    const items = [];
    for (let r = hdrI + 1; r < I.length; r++) {
      const x = I[r];
      if (!x[0] && !x[1]) continue;
      items.push({ id: String(x[0] || 'Q' + r), name: String(x[1] || x[2] || 'Item ' + r), building: String(x[2] || ''), wbs: String(x[3] || ''), epc: String(x[4] || 'Construction'), vendor: String(x[5] || ''), scope: +x[7] || 0, scopeNote: String(x[8] || ''),
        done: { dwg: +x[9] || 0, sup: +x[10] || 0, ere: +x[11] || 0 }, last: { sup: +x[12] || 0, ere: +x[13] || 0 }, target: { sup: x[14] ? mk(x[14]) : null, ere: x[15] ? mk(x[15]) : null }, status: String(x[16] || 'auto'), plan: { sup: {}, ere: {} }, fronts: [], concerns: [], links: {} });
      if (x[6]) Q.unit = String(x[6]);
    }
    const byId = new Map(items.map((i) => [i.id, i]));
    const Pl = rows('Plan');
    if (Pl) {
      const h = Pl.findIndex((r) => String(r[0]).trim() === 'ID');
      const mcols = [];
      Pl[h].forEach((c, i) => { if (i >= 4) { const k = mk(c); if (k) mcols.push([i, k]); } });
      for (let r = h + 1; r < Pl.length; r++) {
        const it = byId.get(String(Pl[r][0]));
        if (!it) continue;
        const st = /erect/i.test(Pl[r][2]) ? 'ere' : 'sup';
        mcols.forEach(([i, k]) => { const v = +Pl[r][i]; if (v) it.plan[st][k] = v; });
      }
    }
    const F = rows('Fronts');
    if (F) { const h = F.findIndex((r) => String(r[0]).trim() === 'ID'); for (let r = h + 1; r < F.length; r++) { const it = byId.get(String(F[r][0])); if (it && F[r][1]) it.fronts.push({ name: String(F[r][1]), cat: String(F[r][2] || 'erection').toLowerCase(), from: mk(F[r][3]), to: mk(F[r][4]) || mk(F[r][3]) }); } }
    const C = rows('Concerns');
    if (C) { const h = C.findIndex((r) => String(r[0]).trim() === 'ID'); for (let r = h + 1; r < C.length; r++) { const it = byId.get(String(C[r][0])); if (it && C[r][3]) it.concerns.push({ tag: String(C[r][1] || 'NOTE'), sev: String(C[r][2] || 'med'), text: String(C[r][3]), action: String(C[r][4] || '') }); } }
    // keep schedule links of existing items with same id
    for (const it of items) { const old = Q.items.find((o) => o.id === it.id); if (old) it.links = old.links || {}; }
    Q.items = items.map((i) => i);
    SE.qty.ensure(P);
    return items.length;
  }

  SE.qtyExport = { toPPTX, toPDF, toExcel, fromExcel, chartPrims };
})(typeof module === 'object' && module.exports ? (global.SE = global.SE || {}) : (window.SE = window.SE || {}));
