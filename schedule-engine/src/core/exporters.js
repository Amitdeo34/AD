/* Schedule Engine - core/exporters.js
 * Outputs: Excel workbook (dashboard, P6-style schedule, cell Gantt, update
 * sheet for offline updating, look-ahead, attention list, health check,
 * change log, relationships, building x EPC matrix), PDF report (summary +
 * P6-style Gantt layout + tables), interactive HTML report, CSV, MS Project XML
 * and the engine's own project file.
 */
(function (SE) {
  'use strict';
  const D = SE.D;
  const A = () => SE.analysis;

  const PAL = {
    blue: '#00338D', med: '#005EB8', light: '#0091DA', violet: '#483698', purple: '#470A68', teal: '#00A3A1',
    green: '#009A44', lgreen: '#43B02A', yellow: '#EAAA00', orange: '#F68D2E', red: '#BC204B', pink: '#C6007E',
    ink: '#1D1D1B', grey: '#7F7F7F', line: '#D9DEE8', band1: '#00338D', band2: '#005EB8', band3: '#DCE6F4', band4: '#EEF3FA',
    actual: '#00338D', remain: '#0091DA', crit: '#BC204B', base: '#EAAA00', done: '#6C8EBF'
  };
  const argb = (hex) => 'FF' + hex.replace('#', '').toUpperCase();
  const rgb = (hex) => { const h = hex.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; };
  const serial = (d) => (d == null ? null : D.dayToExcelSerial(d));
  const pct1 = (v) => Math.round((v || 0) * 10) / 10;

  function flagText(fl) { return (fl || []).filter((k) => !['updated', 'lookahead', 'openEnd'].includes(k)).map((k) => SE.LENS_BY_KEY[k].short).join(', '); }
  function lensColor(fl) {
    if (!fl) return null;
    if (fl.includes('invalid')) return '#FFD6D6';
    if (fl.includes('overdue')) return '#FBE3E8';
    if (fl.includes('lateStart')) return '#FFF1CC';
    if (fl.includes('future')) return '#EFE3F7';
    return null;
  }

  /* ================================================================== *
   * EXCEL
   * ================================================================== */
  async function toExcel(P, opts) {
    opts = opts || {};
    if (typeof ExcelJS === 'undefined') throw new Error('Excel writer not loaded.');
    const fl = A().flagAll(P);
    const rows = opts.rows || SE.views.buildRows(P, { groupBy: ['wbs'], flags: fl.map });
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Schedule Engine';
    wb.created = new Date();
    wb.title = P.meta.name;
    const dd = P.meta.dataDate;
    const title = (ws, text, cols, sub) => {
      ws.mergeCells(1, 1, 1, cols);
      const c = ws.getCell(1, 1);
      c.value = text;
      c.font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(PAL.blue) } };
      c.alignment = { vertical: 'middle', indent: 1 };
      ws.getRow(1).height = 30;
      ws.mergeCells(2, 1, 2, cols);
      const s = ws.getCell(2, 1);
      s.value = sub || (P.meta.name + '   |   Data Date: ' + D.fmtLong(dd) + '   |   Generated ' + new Date().toLocaleString('en-IN') + ' by Schedule Engine');
      s.font = { name: 'Arial', size: 9, italic: true, color: { argb: 'FFFFFFFF' } };
      s.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(PAL.med) } };
      s.alignment = { indent: 1 };
    };
    const headerRow = (ws, r, labels, color) => {
      const row = ws.getRow(r);
      labels.forEach((l, i) => {
        const c = row.getCell(i + 1);
        c.value = l;
        c.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(color || PAL.blue) } };
        c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        c.border = { right: { style: 'thin', color: { argb: 'FFFFFFFF' } } };
      });
      row.height = 30;
    };
    const thin = { style: 'thin', color: { argb: 'FFD9DEE8' } };
    const box = { top: thin, left: thin, bottom: thin, right: thin };

    /* ---- Dashboard ---- */
    {
      const ws = wb.addWorksheet('Dashboard', { properties: { tabColor: { argb: argb(PAL.blue) } }, views: [{ showGridLines: false }] });
      [26, 12, 10, 10, 10, 12, 12, 12, 13, 11, 11, 11, 14].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
      title(ws, 'Schedule Engine  |  Monthly Progress Dashboard', 13);
      const all = P.acts.filter((a) => !P.isSummaryType(a));
      const pr = A().progressOf(P, all);
      const cnt = { NS: 0, IP: 0, CO: 0 };
      all.forEach((a) => { cnt[a.status]++; });
      const kpis = [
        ['Total activities', all.length], ['Completed', cnt.CO], ['In progress', cnt.IP], ['Not started', cnt.NS],
        ['Planned %', pct1(pr.planned) / 100], ['Actual %', pct1(pr.actual) / 100], ['Variance', (pr.actual - pr.planned) / 100],
        ['Forecast finish', serial(P.meta.scheduledFinish)], ['Critical', fl.counts.critical], ['Late start', fl.counts.lateStart],
        ['Overdue', fl.counts.overdue], ['Pending update', fl.counts.pending]
      ];
      let r = 4;
      ws.getCell(r, 1).value = 'KEY FIGURES';
      ws.getCell(r, 1).font = { bold: true, color: { argb: argb(PAL.blue) }, size: 11 };
      r++;
      kpis.forEach((k, i) => {
        const col = (i % 6) * 2 + 1;
        const rr = r + Math.floor(i / 6) * 2;
        const l = ws.getCell(rr, col), v = ws.getCell(rr + 1, col);
        l.value = k[0]; l.font = { size: 8, color: { argb: 'FF595959' } };
        v.value = k[1]; v.font = { size: 16, bold: true, color: { argb: argb(i === 6 && k[1] < 0 ? PAL.red : PAL.blue) } };
        if (i >= 4 && i <= 6) v.numFmt = '0.0%';
        if (i === 7) v.numFmt = 'dd-mmm-yy';
        [l, v].forEach((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F5FB' } }; });
      });
      r += 5;
      const table = (label, key) => {
        ws.getCell(r, 1).value = label;
        ws.getCell(r, 1).font = { bold: true, color: { argb: argb(PAL.blue) }, size: 11 };
        r++;
        headerRow(ws, r, [label.replace(/ progress$/i, ''), 'Activities', 'Not started', 'In progress', 'Completed', 'Planned %', 'Actual %', 'Variance', 'Gained this period', 'Late start', 'Overdue', 'Critical', 'Forecast finish']);
        const first = ++r;
        for (const b of A().breakdown(P, key, fl)) {
          const row = ws.getRow(r++);
          row.values = [b.name, b.count, b.NS, b.IP, b.CO, b.planned / 100, b.actual / 100, b.variance / 100, b.periodGain / 100, b.lateStart, b.overdue, b.critical, serial(b.finish)];
          [6, 7, 8, 9].forEach((c) => { row.getCell(c).numFmt = '0.0%'; });
          row.getCell(13).numFmt = 'dd-mmm-yy';
          row.getCell(8).font = { color: { argb: b.variance < -0.5 ? argb(PAL.red) : argb(PAL.green) }, bold: true };
          row.eachCell({ includeEmpty: true }, (c) => { c.border = box; });
        }
        if (r > first) {
          try {
            ws.addConditionalFormatting({ ref: 'G' + first + ':G' + (r - 1), rules: [{ type: 'dataBar', minLength: 0, maxLength: 100, cfvo: [{ type: 'num', value: 0 }, { type: 'num', value: 1 }], color: { argb: argb(PAL.light) }, gradient: false }] });
          } catch (e) { /* older viewers */ }
        }
        r += 2;
      };
      table('Building-wise progress', 'building');
      table('EPC-wise progress', 'epc');
      ws.getCell(r, 1).value = 'ENGINE INSIGHTS';
      ws.getCell(r, 1).font = { bold: true, color: { argb: argb(PAL.blue) }, size: 11 };
      r++;
      for (const ins of A().insights(P, fl)) {
        ws.mergeCells(r, 1, r, 13);
        const c = ws.getCell(r, 1);
        c.value = '•  ' + ins.text;
        c.font = { size: 10, color: { argb: ins.tone === 'bad' ? argb(PAL.red) : ins.tone === 'good' ? argb(PAL.green) : 'FF262626' } };
        r++;
      }
    }

    /* ---- Building x EPC matrix ---- */
    {
      const ws = wb.addWorksheet('Building x EPC', { properties: { tabColor: { argb: argb(PAL.teal) } }, views: [{ showGridLines: false }] });
      const bld = A().breakdown(P, 'building', fl).map((b) => b.name);
      const epcs = SE.EPC.filter((e) => P.acts.some((a) => P.dim(a, 'epc') === e));
      title(ws, 'Progress matrix - Building x EPC (Actual % / Planned %)', 2 + epcs.length * 2);
      ws.getColumn(1).width = 30;
      const hdr = ['Building'];
      epcs.forEach((e) => { hdr.push(e + ' Actual', e + ' Planned'); });
      hdr.push('Overall Actual', 'Overall Planned');
      headerRow(ws, 4, hdr, PAL.teal);
      for (let i = 2; i <= hdr.length; i++) ws.getColumn(i).width = 13;
      let r = 5;
      for (const b of bld) {
        const vals = [b];
        const inB = P.acts.filter((a) => !P.isSummaryType(a) && P.dim(a, 'building') === b);
        for (const e of epcs) {
          const g = inB.filter((a) => P.dim(a, 'epc') === e);
          const pr = A().progressOf(P, g);
          vals.push(g.length ? pr.actual / 100 : null, g.length ? pr.planned / 100 : null);
        }
        const pr = A().progressOf(P, inB);
        vals.push(pr.actual / 100, pr.planned / 100);
        const row = ws.getRow(r++);
        row.values = vals;
        for (let c = 2; c <= vals.length; c++) { row.getCell(c).numFmt = '0%'; row.getCell(c).border = box; row.getCell(c).alignment = { horizontal: 'center' }; }
        row.getCell(1).border = box;
      }
      try {
        ws.addConditionalFormatting({ ref: 'B5:' + colName(hdr.length) + (r - 1), rules: [{ type: 'colorScale', cfvo: [{ type: 'num', value: 0 }, { type: 'num', value: 0.5 }, { type: 'num', value: 1 }], color: [{ argb: 'FFF8D7DD' }, { argb: 'FFFFF2CC' }, { argb: 'FFD5EFDF' }] }] });
      } catch (e) { /* ignore */ }
    }

    /* ---- Schedule (P6 layout) ---- */
    const schedCols = [
      ['Activity ID', 16], ['Activity Name', 48], ['Building', 18], ['EPC', 14], ['Status', 12], ['Orig Dur', 8], ['Rem Dur', 8], ['% Complete', 9],
      ['Start', 11], ['Finish', 11], ['Actual Start', 11], ['Actual Finish', 11], ['BL Start', 11], ['BL Finish', 11], ['Finish Var (d)', 9], ['Total Float', 8], ['Critical', 7], ['Flags', 30], ['Remarks', 30]
    ];
    {
      const ws = wb.addWorksheet('Schedule', { properties: { tabColor: { argb: argb(PAL.med) }, outlineLevelRow: 1 }, views: [{ state: 'frozen', xSplit: 2, ySplit: 4 }] });
      ws.properties.outlineProperties = { summaryBelow: false, summaryRight: false };
      schedCols.forEach((c, i) => { ws.getColumn(i + 1).width = c[1]; });
      title(ws, 'Schedule - ' + P.meta.name, schedCols.length);
      headerRow(ws, 4, schedCols.map((c) => c[0]));
      let r = 5;
      for (const row of rows) {
        const x = ws.getRow(r);
        if (row.kind === 'group') {
          const s = row.sum;
          x.values = [row.code && row.code !== row.label ? row.code : '', row.label, '', '', SE.STATUS[s.status], s.origDur, null, s.pct / 100, serial(s.start), serial(s.finish), serial(s.aStart), serial(s.aFinish), serial(s.blStart), serial(s.blFinish),
            s.blFinish != null && s.finish != null ? P.cal(null).between(s.blFinish, s.finish) : null, s.tf, '', row.count + ' activities', ''];
          const lv = Math.min(row.level, 3);
          const bg = [PAL.band1, PAL.band2, PAL.band3, PAL.band4][lv];
          const fg = lv < 2 ? 'FFFFFFFF' : argb(PAL.ink);
          x.eachCell({ includeEmpty: true }, (c, n) => { if (n <= schedCols.length) { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(bg) } }; c.font = { bold: true, size: 9, color: { argb: fg } }; } });
          x.getCell(2).alignment = { indent: Math.min(row.level, 6) };
        } else {
          const a = row.a;
          const f = fl.map.get(a.uid);
          const fv = a.bl && a.bl.finish != null && P.finishOf(a) != null ? P.cal(a).between(a.bl.finish, P.finishOf(a)) : null;
          x.values = [a.code, a.name, P.dim(a, 'building'), P.dim(a, 'epc'), SE.STATUS[a.status], a.origDur, a.status === 'CO' ? 0 : a.remDur, (a.pct || 0) / 100,
            serial(P.startOf(a)), serial(P.finishOf(a)), serial(a.aStart), serial(a.aFinish), serial(a.bl && a.bl.start), serial(a.bl && a.bl.finish), fv, a.status === 'CO' ? null : a.tf,
            a.crit && a.status !== 'CO' ? 'Yes' : '', flagText(f), a.notes || ''];
          x.getCell(2).alignment = { indent: Math.min(row.level, 6) };
          x.font = { size: 9 };
          const lc = lensColor(f);
          if (lc) x.eachCell({ includeEmpty: true }, (c, n) => { if (n <= schedCols.length) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(lc) } }; });
          if (a.crit && a.status !== 'CO') x.getCell(17).font = { size: 9, bold: true, color: { argb: argb(PAL.red) } };
          if (fv > 0) x.getCell(15).font = { size: 9, color: { argb: argb(PAL.red) } };
          x.outlineLevel = 1;
        }
        [9, 10, 11, 12, 13, 14].forEach((c) => { x.getCell(c).numFmt = 'dd-mmm-yy'; });
        x.getCell(8).numFmt = '0%';
        x.eachCell({ includeEmpty: true }, (c, n) => { if (n <= schedCols.length) c.border = box; });
        r++;
      }
      ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: schedCols.length } };
    }

    /* ---- Gantt (cell based) ---- */
    {
      const rg = A().range(P);
      const spanDays = rg.finish - rg.start;
      const weekly = spanDays <= 7 * 110;
      const buckets = [];
      if (weekly) {
        let d = rg.start - D.weekday(rg.start) + 1; // Monday
        while (d <= rg.finish + 7) { buckets.push([d, d + 7]); d += 7; }
      } else {
        let d = D.monthStart(rg.start);
        while (d <= rg.finish) { const n = D.addMonths(d, 1); buckets.push([d, n]); d = n; }
      }
      const fixed = [['Activity ID', 14], ['Activity Name', 40], ['Start', 10], ['Finish', 10], ['%', 6]];
      const ws = wb.addWorksheet('Gantt', { properties: { tabColor: { argb: argb(PAL.green) } }, views: [{ state: 'frozen', xSplit: 5, ySplit: 5, showGridLines: false }] });
      fixed.forEach((c, i) => { ws.getColumn(i + 1).width = c[1]; });
      buckets.forEach((b, i) => { ws.getColumn(fixed.length + 1 + i).width = weekly ? 2.6 : 4.2; });
      title(ws, 'Gantt chart - ' + (weekly ? 'weekly' : 'monthly') + ' timescale  (dark = actual, blue = remaining, red = critical, ◆ = milestone, red line = Data Date)', Math.min(fixed.length + buckets.length, 60));
      // timescale header rows 4 (month/year) and 5 (week start day)
      headerRow(ws, 5, fixed.map((c) => c[0]));
      let grpStart = null, grpLabel = null;
      const flushGroup = (endCol) => {
        if (grpStart == null) return;
        if (endCol > grpStart) ws.mergeCells(4, grpStart, 4, endCol);
        const c = ws.getCell(4, grpStart);
        c.value = grpLabel;
        c.font = { bold: true, size: 8, color: { argb: 'FFFFFFFF' } };
        c.alignment = { horizontal: 'center' };
        for (let k = grpStart; k <= endCol; k++) ws.getCell(4, k).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(PAL.blue) } };
      };
      buckets.forEach((b, i) => {
        const col = fixed.length + 1 + i;
        const lbl = weekly ? D.monthLabel(b[0]) : String(D.parts(b[0]).y);
        if (lbl !== grpLabel) { flushGroup(col - 1); grpStart = col; grpLabel = lbl; }
        const c = ws.getCell(5, col);
        c.value = weekly ? D.parts(b[0]).d : SE.MONTHS[D.parts(b[0]).m].charAt(0);
        c.font = { size: 7, bold: true, color: { argb: 'FFFFFFFF' } };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(dd >= b[0] && dd < b[1] ? PAL.red : PAL.med) } };
        c.alignment = { horizontal: 'center' };
      });
      flushGroup(fixed.length + buckets.length);
      let r = 6;
      const ddCol = buckets.findIndex((b) => dd >= b[0] && dd < b[1]);
      for (const row of rows) {
        const x = ws.getRow(r);
        x.height = 14;
        let s, f, a = null, grp = row.kind === 'group';
        if (grp) {
          s = row.sum.start; f = row.sum.finish;
          x.values = ['', '  '.repeat(row.level) + row.label, serial(s), serial(f), row.sum.pct / 100];
          for (let c = 1; c <= fixed.length; c++) { const cc = x.getCell(c); cc.font = { bold: true, size: 8, color: { argb: row.level < 2 ? argb(PAL.blue) : argb(PAL.ink) } }; cc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF3FA' } }; }
        } else {
          a = row.a; s = P.startOf(a); f = P.finishOf(a);
          x.values = [a.code, '  '.repeat(row.level) + a.name, serial(s), serial(f), (a.pct || 0) / 100];
          x.font = { size: 8 };
          x.outlineLevel = 1;
        }
        x.getCell(3).numFmt = 'dd-mmm-yy'; x.getCell(4).numFmt = 'dd-mmm-yy'; x.getCell(5).numFmt = '0%';
        buckets.forEach((b, i) => {
          const c = x.getCell(fixed.length + 1 + i);
          if (i === ddCol) c.border = { left: { style: 'medium', color: { argb: argb(PAL.red) } } };
          if (s == null || f == null || f < b[0] || s >= b[1]) return;
          let color;
          if (grp) color = '#404040';
          else if (P.isMilestone(a)) {
            c.value = '◆';
            c.font = { size: 9, bold: true, color: { argb: argb(a.status === 'CO' ? PAL.actual : a.crit ? PAL.crit : PAL.purple) } };
            c.alignment = { horizontal: 'center' };
            return;
          } else if (a.status === 'CO' || (a.status === 'IP' && b[1] <= dd)) color = PAL.actual;
          else color = a.crit ? PAL.crit : PAL.remain;
          c.fill = { type: 'pattern', pattern: grp ? 'darkHorizontal' : 'solid', fgColor: { argb: argb(color) }, bgColor: { argb: 'FFFFFFFF' } };
        });
        r++;
      }
    }

    /* ---- Update Sheet (fill offline, re-import into the engine) ---- */
    {
      const ws = wb.addWorksheet('Update Sheet', { properties: { tabColor: { argb: argb(PAL.orange) } }, views: [{ state: 'frozen', xSplit: 2, ySplit: 4 }] });
      const cols = [
        ['Activity ID', 15], ['Activity Name', 44], ['Building', 18], ['EPC', 14], ['Status', 12], ['Flags', 22], ['Planned Start', 11], ['Planned Finish', 11], ['Current Actual Start', 11], ['Current Actual Finish', 11],
        ['Current %', 8], ['Current Rem Dur', 8], ['New Actual Start', 12], ['New Actual Finish', 12], ['New % Complete', 10], ['New Remaining Dur', 10], ['Expected Finish', 12],
        ['Unit', 7], ['Scope Qty', 9], ['Done Qty', 9], ['Qty %', 8], ['Remarks', 36], ['Check', 34]
      ];
      cols.forEach((c, i) => { ws.getColumn(i + 1).width = c[1]; });
      title(ws, 'UPDATE SHEET  -  fill the orange columns, then File > Import Update Sheet in Schedule Engine', cols.length,
        'Data Date ' + D.fmtLong(dd) + ': actual dates must be BEFORE ' + D.fmtLong(dd) + '.  % is 0-100.  Leave a cell blank to keep the current value.  Qty % = Done ÷ Scope (use it to decide the % complete).');
      headerRow(ws, 4, cols.map((c) => c[0]));
      [13, 14, 15, 16, 17, 20, 22].forEach((c) => { ws.getCell(4, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(PAL.orange) } }; });
      const list = P.acts.filter((a) => !P.isSummaryType(a) && (a.status !== 'CO' || (a.prev && a.prev.status !== 'CO')))
        .sort(SE.views.sorter(P, { key: 'start' }));
      // keep building grouping order
      const bOrder = A().breakdown(P, 'building', fl).map((b) => b.name);
      list.sort((x, y) => bOrder.indexOf(P.dim(x, 'building')) - bOrder.indexOf(P.dim(y, 'building')) || (P.startOf(x) - P.startOf(y)));
      let r = 5;
      const ddSerial = serial(dd);
      for (const a of list) {
        const x = ws.getRow(r);
        const f = fl.map.get(a.uid);
        x.values = [a.code, a.name, P.dim(a, 'building'), P.dim(a, 'epc'), SE.STATUS[a.status], flagText(f), serial(P.refStart(a)), serial(P.refFinish(a)), serial(a.aStart), serial(a.aFinish),
          (a.pct || 0) / 100, a.status === 'CO' ? 0 : a.remDur, null, null, null, null, null,
          a.qty ? a.qty.unit : '', a.qty ? a.qty.scope : null, a.qty ? a.qty.done : null, null, a.notes || '', null];
        x.font = { size: 9 };
        [7, 8, 9, 10, 13, 14, 17].forEach((c) => { x.getCell(c).numFmt = 'dd-mmm-yy'; });
        x.getCell(11).numFmt = '0%';
        x.getCell(21).value = { formula: 'IF(AND(ISNUMBER(S' + r + '),S' + r + '>0,ISNUMBER(T' + r + ')),MIN(1,T' + r + '/S' + r + '),"")' };
        x.getCell(21).numFmt = '0.0%';
        x.getCell(23).value = { formula: 'IF(AND(M' + r + '<>"",M' + r + '>=' + ddSerial + '),"Actual Start must be before Data Date",IF(AND(N' + r + '<>"",N' + r + '>=' + ddSerial + '),"Actual Finish must be before Data Date",IF(AND(N' + r + '<>"",M' + r + '<>"",N' + r + '<M' + r + '),"Finish before Start",IF(AND(O' + r + '<>"",O' + r + '>=100,N' + r + '=""),"100% needs Actual Finish",IF(AND(O' + r + '<>"",O' + r + '>0,M' + r + '="",I' + r + '=""),"Enter Actual Start",IF(AND(Q' + r + '<>"",Q' + r + '<' + ddSerial + '),"Expected Finish must be after Data Date","OK"))))))' };
        [13, 14, 15, 16, 17, 20, 22].forEach((c) => {
          const cc = x.getCell(c);
          cc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF4E5' } };
          cc.border = box;
        });
        x.getCell(13).dataValidation = { type: 'date', operator: 'lessThan', allowBlank: true, formulae: [new Date(Date.UTC(1970, 0, 1) + dd * 864e5)], showErrorMessage: true, errorTitle: 'Actual Start', error: 'Actual dates must be before the Data Date ' + D.fmtLong(dd) };
        x.getCell(14).dataValidation = { type: 'date', operator: 'lessThan', allowBlank: true, formulae: [new Date(Date.UTC(1970, 0, 1) + dd * 864e5)], showErrorMessage: true, errorTitle: 'Actual Finish', error: 'Actual dates must be before the Data Date ' + D.fmtLong(dd) };
        x.getCell(15).dataValidation = { type: 'decimal', operator: 'between', allowBlank: true, formulae: [0, 100], showErrorMessage: true, errorTitle: '% Complete', error: 'Enter a number from 0 to 100' };
        x.getCell(16).dataValidation = { type: 'decimal', operator: 'greaterThanOrEqual', allowBlank: true, formulae: [0], showErrorMessage: true, errorTitle: 'Remaining duration', error: 'Remaining duration must be 0 or more days' };
        const lc = lensColor(f);
        if (lc) [1, 2, 6].forEach((c) => { x.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(lc) } }; });
        r++;
      }
      if (r > 5) {
        ws.addConditionalFormatting({ ref: 'W5:W' + (r - 1), rules: [
          { type: 'containsText', operator: 'containsText', text: 'OK', style: { font: { color: { argb: argb(PAL.green) }, bold: true } } },
          { type: 'notContainsText', operator: 'notContains', text: 'OK', style: { font: { color: { argb: argb(PAL.red) }, bold: true } } }
        ] });
      }
      ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: cols.length } };
    }

    /* ---- simple list sheets ---- */
    const listSheet = (name, tab, cols, data, heading) => {
      const ws = wb.addWorksheet(name, { properties: { tabColor: { argb: argb(tab) } }, views: [{ state: 'frozen', ySplit: 4 }] });
      cols.forEach((c, i) => { ws.getColumn(i + 1).width = c[1]; });
      title(ws, heading || name, cols.length);
      headerRow(ws, 4, cols.map((c) => c[0]), tab);
      let r = 5;
      for (const vals of data) {
        const x = ws.getRow(r++);
        x.values = vals.map((v) => (v && v.__date != null ? serial(v.__date) : v));
        vals.forEach((v, i) => { if (v && v.__date !== undefined) x.getCell(i + 1).numFmt = 'dd-mmm-yy'; if (v && v.__pct) { x.getCell(i + 1).value = v.v; x.getCell(i + 1).numFmt = '0%'; } });
        x.font = { size: 9 };
        x.eachCell({ includeEmpty: true }, (c, n) => { if (n <= cols.length) c.border = box; });
      }
      if (data.length) ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: cols.length } };
      return ws;
    };
    const dt = (d) => ({ __date: d == null ? null : d });
    const pc = (v) => ({ __pct: true, v: (v || 0) / 100 });
    const la = P.acts.filter((a) => !P.isSummaryType(a) && a.status !== 'CO' && P.startOf(a) != null && P.startOf(a) < dd + 56)
      .sort(SE.views.sorter(P, { key: 'start' }));
    listSheet('Look-ahead', PAL.light, [['Activity ID', 15], ['Activity Name', 46], ['Building', 18], ['EPC', 14], ['Status', 12], ['Start', 11], ['Finish', 11], ['Rem Dur', 8], ['% Complete', 9], ['Total Float', 8], ['Window', 16]],
      la.map((a) => [a.code, a.name, P.dim(a, 'building'), P.dim(a, 'epc'), SE.STATUS[a.status], dt(P.startOf(a)), dt(P.finishOf(a)), a.remDur, pc(a.pct), a.tf,
        a.status === 'IP' ? 'Ongoing' : P.startOf(a) < dd + 14 ? '0-2 weeks' : P.startOf(a) < dd + 28 ? '2-4 weeks' : '4-8 weeks']),
      '8-week look-ahead from ' + D.fmtLong(dd));
    const att = [];
    for (const a of P.acts) {
      const f = fl.map.get(a.uid) || [];
      for (const k of ['invalid', 'overdue', 'lateStart', 'future', 'outSeq', 'negFloat']) if (f.includes(k)) att.push([SE.LENS_BY_KEY[k].short, a.code, a.name, P.dim(a, 'building'), P.dim(a, 'epc'), SE.STATUS[a.status], dt(P.refStart(a)), dt(P.refFinish(a)), dt(P.startOf(a)), dt(P.finishOf(a)), pc(a.pct), a.tf, SE.LENS_BY_KEY[k].desc]);
    }
    listSheet('Attention', PAL.red, [['Flag', 16], ['Activity ID', 15], ['Activity Name', 44], ['Building', 18], ['EPC', 14], ['Status', 12], ['Ref Start', 11], ['Ref Finish', 11], ['Start', 11], ['Finish', 11], ['%', 7], ['TF', 7], ['Why flagged', 60]], att, 'Activities needing attention');
    const hc = A().healthCheck(P);
    listSheet('Health Check', PAL.violet, [['Check', 40], ['Result', 10], ['Count', 9], ['Of', 9], ['%', 9], ['Guideline', 80]],
      hc.checks.map((c) => [c.name, c.pass ? 'PASS' : 'FAIL', c.count, c.total, Math.round(c.pct * 10) / 10, c.what]), 'Schedule health check - score ' + hc.score + '%');
    const cmp = A().compare(P);
    listSheet('Change Log', PAL.grey, [['Activity ID', 15], ['Activity Name', 44], ['Building', 18], ['Changes this period', 70], ['Finish movement (d)', 12]],
      cmp.map((c) => [c.a.code, c.a.name, P.dim(c.a, 'building'), c.changes.join('; '), c.finishVar]), 'Changes vs previous update (' + D.fmtLong(P.meta.prevDataDate) + ' → ' + D.fmtLong(dd) + ')');
    listSheet('Relationships', PAL.purple, [['Predecessor', 15], ['Predecessor Name', 40], ['Type', 6], ['Lag (d)', 7], ['Successor', 15], ['Successor Name', 40]],
      P.rels.map((r) => { const p = P.act(r.pred), s = P.act(r.succ); return [p ? p.code : r.pred, p ? p.name : '', r.type, r.lag, s ? s.code : r.succ, s ? s.name : '']; }), 'Relationships');
    return wb.xlsx.writeBuffer();
  }
  function colName(n) { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }

  /* ================================================================== *
   * PDF
   * ================================================================== */
  function toPDF(P, opts) {
    opts = Object.assign({ format: 'a3', gantt: true, summary: true, tables: true }, opts || {});
    const JS = (typeof window !== 'undefined' && window.jspdf) ? window.jspdf.jsPDF : (typeof jspdf !== 'undefined' ? jspdf.jsPDF : null);
    if (!JS) throw new Error('PDF writer not loaded.');
    const doc = new JS({ orientation: 'landscape', unit: 'mm', format: opts.format });
    const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
    const fl = A().flagAll(P);
    const rows = opts.rows || SE.views.buildRows(P, { groupBy: ['wbs'], flags: fl.map });
    const dd = P.meta.dataDate;
    const M = 10;
    const fill = (hex) => doc.setFillColor.apply(doc, rgb(hex));
    const draw = (hex) => doc.setDrawColor.apply(doc, rgb(hex));
    const color = (hex) => doc.setTextColor.apply(doc, rgb(hex));
    const fit = (t, w) => { t = String(t == null ? '' : t); if (doc.getTextWidth(t) <= w) return t; while (t.length > 1 && doc.getTextWidth(t + '...') > w) t = t.slice(0, -1); return t + '...'; };
    const ascii = (s) => String(s == null ? '' : s).replace(/[–—]/g, '-').replace(/[→]/g, '->').replace(/[≤]/g, '<=').replace(/[≥]/g, '>=').replace(/[÷]/g, '/').replace(/[^\x20-\x7E]/g, '');
    const header = (sub) => {
      fill(PAL.blue); doc.rect(0, 0, W, 16, 'F');
      color('#FFFFFF'); doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
      doc.text('Schedule Engine', M, 10.5);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
      doc.text(ascii(fit(P.meta.name, W / 2)), M + 44, 10.5);
      doc.text('Data Date: ' + D.fmtLong(dd), W - M, 10.5, { align: 'right' });
      fill(PAL.light); doc.rect(0, 16, W, 1.2, 'F');
      if (sub) { color(PAL.blue); doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.text(ascii(sub), M, 25); }
    };
    let pageNo = 0;
    const footers = [];
    const newPage = (sub) => { if (pageNo++) doc.addPage(); header(sub); footers.push(pageNo); };

    /* ---- summary page ---- */
    if (opts.summary) {
      newPage('Monthly Progress Summary');
      const all = P.acts.filter((a) => !P.isSummaryType(a));
      const pr = A().progressOf(P, all);
      const cnt = { NS: 0, IP: 0, CO: 0 }; all.forEach((a) => { cnt[a.status]++; });
      const tiles = [['Planned %', pr.planned.toFixed(1) + '%'], ['Actual %', pr.actual.toFixed(1) + '%'], ['Variance', (pr.actual - pr.planned >= 0 ? '+' : '') + (pr.actual - pr.planned).toFixed(1) + '%'],
        ['Forecast finish', D.fmt(P.meta.scheduledFinish)], ['Completed', cnt.CO + ' / ' + all.length], ['In progress', String(cnt.IP)], ['Late start', String(fl.counts.lateStart)], ['Overdue', String(fl.counts.overdue)], ['Critical', String(fl.counts.critical)]];
      const tw = (W - 2 * M - 8 * 4) / 9;
      tiles.forEach((t, i) => {
        const x = M + i * (tw + 4), y = 30;
        fill('#F2F5FB'); doc.roundedRect(x, y, tw, 20, 2, 2, 'F');
        fill(i === 2 && pr.actual < pr.planned ? PAL.red : PAL.blue); doc.rect(x, y, 1.4, 20, 'F');
        color('#595959'); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.text(t[0], x + 4, y + 6);
        color(i === 2 && pr.actual < pr.planned ? PAL.red : PAL.blue); doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.text(t[1], x + 4, y + 15);
      });
      // S-curve
      const sc = A().sCurve(P);
      const cx = M, cy = 60, cw = (W - 2 * M) * 0.55, ch = 95;
      color(PAL.blue); doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.text('S-curve - cumulative progress (duration weighted)', cx, cy - 2);
      draw('#D9DEE8'); doc.setLineWidth(0.2);
      for (let k = 0; k <= 4; k++) { const y = cy + ch - ch * k / 4 + 4; doc.line(cx + 10, y, cx + cw, y); color('#7F7F7F'); doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.text(k * 25 + '%', cx + 8, y + 1, { align: 'right' }); }
      const n = sc.points.length;
      const px = (i) => cx + 12 + (cw - 14) * (n > 1 ? i / (n - 1) : 0);
      const py = (v) => cy + 4 + ch - ch * v / 100;
      const step = Math.max(1, Math.ceil(n / 14));
      sc.points.forEach((p, i) => { if (i % step === 0) { color('#7F7F7F'); doc.setFontSize(6.5); doc.text(p.label, px(i), cy + ch + 9, { align: 'center' }); } });
      const polyline = (vals, hex, width, dash) => {
        draw(hex); doc.setLineWidth(width);
        if (dash) doc.setLineDashPattern(dash, 0);
        for (let i = 1; i < vals.length; i++) if (vals[i] != null && vals[i - 1] != null) doc.line(px(i - 1), py(vals[i - 1]), px(i), py(vals[i]));
        doc.setLineDashPattern([], 0);
      };
      polyline(sc.points.map((p) => p.planned), PAL.grey, 0.6, [1.5, 1]);
      polyline(sc.points.map((p, i) => { const k = sc.points.findIndex((q) => q.end > dd); return k < 0 || i < k ? null : i === k ? sc.actualNow : p.forecast; }), PAL.light, 0.8);
      const ddi = sc.points.findIndex((p) => p.end > dd);
      if (ddi >= 0) {
        polyline(sc.points.map((p, i) => (i < ddi ? p.actual : i === ddi ? sc.actualNow : null)), PAL.blue, 1.2);
        draw(PAL.red); doc.setLineWidth(0.4); doc.setLineDashPattern([1, 1], 0); doc.line(px(ddi), cy + 2, px(ddi), cy + ch + 4); doc.setLineDashPattern([], 0);
        color(PAL.red); doc.setFontSize(7); doc.text('Data Date', px(ddi) + 1, cy + 5);
      }
      const lg = [[PAL.grey, 'Planned (baseline)'], [PAL.blue, 'Actual'], [PAL.light, 'Forecast']];
      lg.forEach((l, i) => { fill(l[0]); doc.rect(cx + 14 + i * 38, cy + ch + 13, 6, 1.6, 'F'); color('#404040'); doc.setFontSize(7.5); doc.text(l[1], cx + 22 + i * 38, cy + ch + 14.4); });
      // Building bars
      const bx = cx + cw + 12, bw = W - M - bx;
      color(PAL.blue); doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.text('Building-wise progress (planned vs actual)', bx, cy - 2);
      const bl = A().breakdown(P, 'building', fl).filter((b) => b.count);
      const rowH = Math.min(9, (ch - 4) / Math.max(1, bl.length));
      bl.forEach((b, i) => {
        const y = cy + 3 + i * rowH;
        color('#262626'); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.text(ascii(fit(b.name, 42)), bx, y + rowH * 0.55);
        const x0 = bx + 44, w0 = bw - 60;
        fill('#EEF1F6'); doc.rect(x0, y + 1, w0, rowH - 2.4, 'F');
        fill('#B8C4D9'); doc.rect(x0, y + 1, w0 * b.planned / 100, (rowH - 2.4) / 2, 'F');
        fill(b.variance < -5 ? PAL.red : PAL.blue); doc.rect(x0, y + 1 + (rowH - 2.4) / 2, w0 * b.actual / 100, (rowH - 2.4) / 2, 'F');
        color(b.variance < -5 ? PAL.red : PAL.blue); doc.setFont('helvetica', 'bold');
        doc.text(b.actual.toFixed(0) + '% / ' + b.planned.toFixed(0) + '%', bx + bw, y + rowH * 0.55, { align: 'right' });
      });
      // EPC table + insights
      const ey = cy + ch + 22;
      color(PAL.blue); doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.text('EPC-wise progress', M, ey);
      const epc = A().breakdown(P, 'epc', fl);
      doc.autoTable({
        startY: ey + 2, margin: { left: M }, tableWidth: (W - 2 * M) * 0.45, theme: 'grid',
        head: [['EPC', 'Activities', 'Planned %', 'Actual %', 'Variance', 'Late start', 'Overdue']],
        body: epc.map((b) => [b.name, b.count, b.planned.toFixed(1), b.actual.toFixed(1), (b.variance >= 0 ? '+' : '') + b.variance.toFixed(1), b.lateStart, b.overdue]),
        styles: { fontSize: 8, cellPadding: 1.2 }, headStyles: { fillColor: rgb(PAL.blue) }
      });
      const ix = M + (W - 2 * M) * 0.48;
      color(PAL.blue); doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.text('Engine insights', ix, ey);
      let iy = ey + 6;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
      for (const ins of A().insights(P, fl)) {
        const lines = doc.splitTextToSize(ascii(ins.text), W - M - ix - 6);
        if (iy + lines.length * 4 > H - 14) break;
        fill(ins.tone === 'bad' ? PAL.red : ins.tone === 'warn' ? PAL.yellow : ins.tone === 'good' ? PAL.green : PAL.light);
        doc.circle(ix + 1.2, iy - 1.1, 1.1, 'F');
        color('#262626'); doc.text(lines, ix + 4, iy);
        iy += lines.length * 4 + 1.5;
      }
    }

    /* ---- Gantt layout pages ---- */
    if (opts.gantt) {
      const cols = [['Activity ID', 26], ['Activity Name', 78], ['OD', 10], ['RD', 10], ['%', 10], ['Start', 19], ['Finish', 19], ['TF', 10]];
      const tableW = cols.reduce((s, c) => s + c[1], 0);
      const gx = M + tableW, gw = W - M - gx;
      const top = 22, hdrH = 11, rowH = 4.4, bottom = H - 16;
      const perPage = Math.floor((bottom - top - hdrH) / rowH);
      const rg = A().range(P);
      const t0 = D.monthStart(rg.start), t1 = D.addMonths(rg.finish, 3);
      const scale = gw / (t1 - t0);
      const X = (d) => gx + (d - t0) * scale;
      const drawHeader = () => {
        fill(PAL.blue); doc.rect(M, top, tableW, hdrH, 'F');
        color('#FFFFFF'); doc.setFont('helvetica', 'bold'); doc.setFontSize(7);
        let x = M;
        cols.forEach((c) => { doc.text(c[0], x + 1.2, top + 7); x += c[1]; });
        fill(PAL.med); doc.rect(gx, top, gw, hdrH / 2, 'F');
        fill(PAL.blue); doc.rect(gx, top + hdrH / 2, gw, hdrH / 2, 'F');
        doc.setFontSize(6.5);
        let m = t0;
        const monthsW = (D.addMonths(t0, 1) - t0) * scale;
        while (m < t1) {
          const n = D.addMonths(m, 1);
          const p = D.parts(m);
          draw('#FFFFFF'); doc.setLineWidth(0.1); doc.line(X(m), top + hdrH / 2, X(m), top + hdrH);
          if (monthsW > 7) doc.text(monthsW > 12 ? SE.MONTHS[p.m] : SE.MONTHS[p.m].charAt(0), X(m) + (X(n) - X(m)) / 2, top + hdrH - 1.6, { align: 'center' });
          if (p.m === 0 || m === t0) { doc.line(X(m), top, X(m), top + hdrH / 2); doc.text(String(p.y), X(m) + 1.5, top + 3.9); }
          m = n;
        }
      };
      const chunks = [];
      for (let i = 0; i < rows.length; i += perPage) chunks.push(rows.slice(i, i + perPage));
      chunks.forEach((chunk, ci) => {
        newPage(null);
        color(PAL.blue); doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
        doc.text('Gantt layout' + (chunks.length > 1 ? ' (' + (ci + 1) + '/' + chunks.length + ')' : ''), M, 20.5);
        drawHeader();
        // month grid lines
        let m = t0;
        draw('#E6EAF1'); doc.setLineWidth(0.1);
        while (m < t1) { doc.line(X(m), top + hdrH, X(m), top + hdrH + chunk.length * rowH); m = D.addMonths(m, 1); }
        chunk.forEach((row, i) => {
          const y = top + hdrH + i * rowH;
          if (row.kind === 'group') {
            const lv = Math.min(row.level, 3);
            const bg = [PAL.band1, PAL.band2, '#C9D7EE', '#E3EAF6'][lv];
            fill(bg); doc.rect(M, y, W - 2 * M, rowH, 'F');
            color(lv < 2 ? '#FFFFFF' : PAL.ink); doc.setFont('helvetica', 'bold'); doc.setFontSize(6.8);
            doc.text(ascii(fit('  '.repeat(row.level) + row.label, cols[0][1] + cols[1][1] - 2)), M + 1.2, y + 3.1);
            const s = row.sum;
            let x = M + cols[0][1] + cols[1][1];
            [String(s.origDur || ''), '', s.pct.toFixed(0) + '%', D.fmt(s.start), D.fmt(s.finish), s.tf != null ? String(Math.round(s.tf)) : ''].forEach((v, k) => { doc.text(v, x + 1.2, y + 3.1); x += cols[k + 2][1]; });
            if (s.start != null && s.finish != null) {
              fill(lv < 2 ? '#FFFFFF' : '#404040');
              doc.rect(X(s.start), y + 1.3, Math.max(0.6, X(s.finish + 1) - X(s.start)), 1.4, 'F');
            }
            return;
          }
          const a = row.a;
          const f = fl.map.get(a.uid) || [];
          const lc = lensColor(f);
          if (lc) { fill(lc); doc.rect(M, y, tableW, rowH, 'F'); } else if (i % 2) { fill('#F7F9FC'); doc.rect(M, y, W - 2 * M, rowH, 'F'); }
          color(a.crit && a.status !== 'CO' ? PAL.red : '#262626'); doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5);
          const vals = [a.code, '  '.repeat(Math.max(0, row.level - 1)) + a.name, String(a.origDur), a.status === 'CO' ? '0' : String(a.remDur), (a.pct || 0).toFixed(0) + '%',
            D.fmt(P.startOf(a)) + (a.aStart != null ? ' A' : ''), D.fmt(P.finishOf(a)) + (a.aFinish != null ? ' A' : ''), a.status === 'CO' || a.tf == null ? '' : String(Math.round(a.tf))];
          let x = M;
          vals.forEach((v, k) => { doc.text(ascii(fit(v, cols[k][1] - 2)), x + 1.2, y + 3.1); x += cols[k][1]; });
          // bars
          const s = P.startOf(a), e = P.finishOf(a);
          if (a.bl && a.bl.start != null && a.bl.finish != null && !P.isMilestone(a)) { fill(PAL.base); doc.rect(X(a.bl.start), y + 3.1, Math.max(0.5, X(a.bl.finish + 1) - X(a.bl.start)), 0.8, 'F'); }
          if (s == null || e == null) return;
          if (P.isMilestone(a)) {
            const cxm = X(a.type === 'start' ? s : e + 1), cym = y + rowH / 2 - 0.2, r = 1.5;
            fill(a.status === 'CO' ? PAL.actual : a.crit ? PAL.crit : PAL.purple);
            doc.triangle(cxm - r, cym, cxm, cym - r, cxm + r, cym, 'F');
            doc.triangle(cxm - r, cym, cxm, cym + r, cxm + r, cym, 'F');
            color('#404040'); doc.setFontSize(5.8); if (W - M - cxm - 4 > 8) doc.text(ascii(fit(a.name, Math.min(60, W - M - cxm - 4))), cxm + 2.5, cym + 0.9);
            return;
          }
          const by = y + 0.9, bh = 2.2;
          if (a.status === 'CO') { fill(PAL.actual); doc.rect(X(s), by, Math.max(0.5, X(e + 1) - X(s)), bh, 'F'); }
          else {
            const split = a.status === 'IP' ? Math.max(s, dd) : s;
            if (a.status === 'IP' && split > s) { fill(PAL.actual); doc.rect(X(s), by, Math.max(0.3, X(split) - X(s)), bh, 'F'); }
            const rs = a.status === 'IP' ? Math.max(dd, a.rStart != null ? a.rStart : dd) : s;
            fill(a.crit ? PAL.crit : PAL.remain); doc.rect(X(rs), by, Math.max(0.5, X(e + 1) - X(rs)), bh, 'F');
          }
        });
        // data date line
        if (dd >= t0 && dd <= t1) { draw(PAL.red); doc.setLineWidth(0.35); doc.setLineDashPattern([1.2, 0.8], 0); doc.line(X(dd), top, X(dd), top + hdrH + chunk.length * rowH); doc.setLineDashPattern([], 0); }
        draw('#BFC7D5'); doc.setLineWidth(0.2); doc.rect(M, top, W - 2 * M, hdrH + chunk.length * rowH);
        doc.line(gx, top, gx, top + hdrH + chunk.length * rowH);
        // legend
        const ly = H - 11;
        const leg = [[PAL.actual, 'Actual work'], [PAL.remain, 'Remaining work'], [PAL.crit, 'Critical remaining'], [PAL.base, 'Baseline'], [PAL.purple, 'Milestone'], [PAL.red, 'Data Date']];
        leg.forEach((l, k) => { fill(l[0]); doc.rect(M + k * 34, ly - 2, 5, 2.2, 'F'); color('#404040'); doc.setFontSize(7); doc.text(l[1], M + 6.5 + k * 34, ly - 0.3); });
        const lens = [['#FFF1CC', 'Late start'], ['#FBE3E8', 'Overdue'], ['#EFE3F7', 'Future progress'], ['#FFD6D6', 'Invalid']];
        lens.forEach((l, k) => { fill(l[0]); draw('#BFC7D5'); doc.rect(M + 210 + k * 30, ly - 2, 5, 2.2, 'FD'); color('#404040'); doc.text(l[1], M + 216.5 + k * 30, ly - 0.3); });
      });
    }

    /* ---- tables ---- */
    if (opts.tables) {
      const tbl = (title, head, body, colColors) => {
        if (!body.length) return;
        newPage(title);
        doc.autoTable({
          startY: 29, margin: { left: M, right: M, top: 22 }, head: [head], body, theme: 'striped',
          styles: { fontSize: 7.5, cellPadding: 1.1, overflow: 'ellipsize' }, headStyles: { fillColor: rgb(PAL.blue), textColor: 255 },
          alternateRowStyles: { fillColor: [244, 247, 252] },
          didParseCell: colColors || undefined,
          didDrawPage: () => { header(title); }
        });
      };
      const att = [];
      for (const a of P.acts) {
        const f = fl.map.get(a.uid) || [];
        for (const k of ['invalid', 'overdue', 'lateStart', 'future', 'outSeq']) if (f.includes(k)) att.push([SE.LENS_BY_KEY[k].short, a.code, ascii(a.name), ascii(P.dim(a, 'building')), P.dim(a, 'epc'), SE.STATUS[a.status], D.fmt(P.refStart(a)), D.fmt(P.refFinish(a)), D.fmt(P.startOf(a)), D.fmt(P.finishOf(a)), (a.pct || 0) + '%', a.tf == null ? '' : a.tf]);
      }
      tbl('Activities needing attention', ['Flag', 'Activity ID', 'Activity Name', 'Building', 'EPC', 'Status', 'Ref Start', 'Ref Finish', 'Start', 'Finish', '%', 'TF'], att, (d) => {
        if (d.section === 'body' && d.column.index === 0) { const t = d.cell.raw; d.cell.styles.textColor = rgb(t === 'Overdue' || t === 'Invalid' ? PAL.red : t === 'Late start' ? '#B07800' : PAL.purple); d.cell.styles.fontStyle = 'bold'; }
      });
      const la = P.acts.filter((a) => !P.isSummaryType(a) && a.status !== 'CO' && P.startOf(a) != null && P.startOf(a) < dd + 28).sort(SE.views.sorter(P, { key: 'start' }));
      tbl('4-week look-ahead from ' + D.fmtLong(dd), ['Activity ID', 'Activity Name', 'Building', 'EPC', 'Status', 'Start', 'Finish', 'Rem Dur', '%', 'TF'],
        la.map((a) => [a.code, ascii(a.name), ascii(P.dim(a, 'building')), P.dim(a, 'epc'), SE.STATUS[a.status], D.fmt(P.startOf(a)), D.fmt(P.finishOf(a)), a.remDur, (a.pct || 0) + '%', a.tf == null ? '' : a.tf]));
      const hc = A().healthCheck(P);
      tbl('Schedule health check - score ' + hc.score + '%', ['Check', 'Result', 'Count', 'Of', '%', 'Guideline'],
        hc.checks.map((c) => [ascii(c.name), c.pass ? 'PASS' : 'FAIL', c.count, c.total, c.pct.toFixed(1), ascii(c.what)]), (d) => {
          if (d.section === 'body' && d.column.index === 1) { d.cell.styles.textColor = rgb(d.cell.raw === 'PASS' ? PAL.green : PAL.red); d.cell.styles.fontStyle = 'bold'; }
        });
    }
    // footers
    const total = doc.internal.getNumberOfPages();
    for (let i = 1; i <= total; i++) {
      doc.setPage(i);
      color('#7F7F7F'); doc.setFont('helvetica', 'normal'); doc.setFontSize(7);
      doc.text('Schedule Engine  |  ' + ascii(P.meta.name) + '  |  printed ' + D.fmtLong(D.todayDay()), M, H - 4);
      doc.text('Page ' + i + ' of ' + total, W - M, H - 4, { align: 'right' });
    }
    return doc.output('arraybuffer');
  }

  /* ================================================================== *
   * HTML report (single file, opens anywhere, collapsible + searchable)
   * ================================================================== */
  function toHTML(P, opts) {
    opts = opts || {};
    const E = SE.util.esc;
    const fl = A().flagAll(P);
    const rows = opts.rows || SE.views.buildRows(P, { groupBy: ['wbs'], flags: fl.map });
    const dd = P.meta.dataDate;
    const all = P.acts.filter((a) => !P.isSummaryType(a));
    const pr = A().progressOf(P, all);
    const rg = A().range(P);
    const t0 = D.monthStart(rg.start), t1 = D.addMonths(rg.finish, 3);
    const GW = Math.max(700, Math.min(2400, (t1 - t0) * 2.2));
    const X = (d) => ((d - t0) / (t1 - t0) * GW).toFixed(1);
    const sc = A().sCurve(P);
    // S-curve svg
    const sw = 640, sh = 240, n = sc.points.length;
    const spx = (i) => (40 + (sw - 50) * (n > 1 ? i / (n - 1) : 0)).toFixed(1);
    const spy = (v) => (10 + (sh - 40) * (1 - v / 100)).toFixed(1);
    const ddi = sc.points.findIndex((p) => p.end > dd);
    const path = (vals) => vals.map((v, i) => (v == null ? '' : (i && vals[i - 1] != null ? 'L' : 'M') + spx(i) + ',' + spy(v))).join('');
    let svgS = '<svg viewBox="0 0 ' + sw + ' ' + sh + '" class="sc" role="img" aria-label="S-curve">';
    for (let k = 0; k <= 4; k++) svgS += '<line x1="40" x2="' + (sw - 10) + '" y1="' + spy(k * 25) + '" y2="' + spy(k * 25) + '" class="g"/><text x="34" y="' + (+spy(k * 25) + 3) + '" text-anchor="end">' + k * 25 + '%</text>';
    const stp = Math.max(1, Math.ceil(n / 12));
    sc.points.forEach((p, i) => { if (i % stp === 0) svgS += '<text x="' + spx(i) + '" y="' + (sh - 12) + '" text-anchor="middle">' + p.label + '</text>'; });
    svgS += '<path d="' + path(sc.points.map((p) => p.planned)) + '" class="pl"/><path d="' + path(sc.points.map((p, i) => (ddi < 0 || i < ddi ? null : i === ddi ? sc.actualNow : p.forecast))) + '" class="fc"/>';
    if (ddi >= 0) {
      svgS += '<path d="' + path(sc.points.map((p, i) => (i < ddi ? p.actual : i === ddi ? sc.actualNow : null))) + '" class="ac"/>';
      svgS += '<line x1="' + spx(ddi) + '" x2="' + spx(ddi) + '" y1="6" y2="' + (sh - 28) + '" class="dd"/><text x="' + (+spx(ddi) + 4) + '" y="16" class="ddt">Data Date</text>';
    }
    svgS += '</svg>';
    // gantt rows
    let body = '';
    const RH = 22;
    rows.forEach((row) => {
      if (row.kind === 'group') {
        const s = row.sum;
        body += '<tr class="grp l' + Math.min(row.level, 3) + '" data-id="' + E(row.id) + '" data-lv="' + row.level + '"><td colspan="2" style="padding-left:' + (6 + row.level * 14) + 'px"><button class="tg" aria-label="Collapse">▾</button> ' + E(row.label) + ' <span class="ct">' + row.count + '</span></td><td>' + s.pct.toFixed(0) + '%</td><td>' + D.fmt(s.start) + '</td><td>' + D.fmt(s.finish) + '</td><td>' + (s.tf != null ? Math.round(s.tf) : '') + '</td><td class="gc"><svg width="' + GW + '" height="' + RH + '">' +
          (s.start != null ? '<rect x="' + X(s.start) + '" y="8" width="' + Math.max(2, X(s.finish + 1) - X(s.start)) + '" height="5" class="sb"/>' : '') + '</svg></td></tr>';
        return;
      }
      const a = row.a;
      const f = fl.map.get(a.uid) || [];
      const s = P.startOf(a), e = P.finishOf(a);
      let bars = '';
      if (a.bl && a.bl.start != null && !P.isMilestone(a)) bars += '<rect x="' + X(a.bl.start) + '" y="16" width="' + Math.max(2, X(a.bl.finish + 1) - X(a.bl.start)) + '" height="3" class="bl"/>';
      if (s != null && e != null) {
        if (P.isMilestone(a)) {
          const cx = +X(a.type === 'start' ? s : e + 1);
          bars += '<path d="M' + (cx - 6) + ',11 L' + cx + ',5 L' + (cx + 6) + ',11 L' + cx + ',17Z" class="' + (a.status === 'CO' ? 'ba' : a.crit ? 'bc' : 'bm') + '"/>';
        } else if (a.status === 'CO') bars += '<rect x="' + X(s) + '" y="5" width="' + Math.max(2, X(e + 1) - X(s)) + '" height="10" rx="2" class="ba"/>';
        else {
          const rs = a.status === 'IP' ? Math.max(dd, a.rStart != null ? a.rStart : dd) : s;
          if (a.status === 'IP') bars += '<rect x="' + X(s) + '" y="5" width="' + Math.max(1, X(dd) - X(s)) + '" height="10" rx="2" class="ba"/>';
          bars += '<rect x="' + X(rs) + '" y="5" width="' + Math.max(2, X(e + 1) - X(rs)) + '" height="10" rx="2" class="' + (a.crit ? 'bc' : 'br') + '"/>';
        }
      }
      const cls = f.includes('invalid') ? 'inv' : f.includes('overdue') ? 'ovd' : f.includes('lateStart') ? 'lst' : f.includes('future') ? 'fut' : '';
      body += '<tr class="act ' + cls + '" data-lv="' + row.level + '" data-s="' + E((a.code + ' ' + a.name + ' ' + P.dim(a, 'building') + ' ' + P.dim(a, 'epc')).toLowerCase()) + '"><td class="id">' + E(a.code) + '</td><td style="padding-left:' + (6 + row.level * 14) + 'px" title="' + E(flagText(f)) + '">' + E(a.name) + (a.crit && a.status !== 'CO' ? ' <b class="cr">CP</b>' : '') + '</td><td>' + (a.pct || 0) + '%</td><td>' + D.fmt(s) + (a.aStart != null ? ' A' : '') + '</td><td>' + D.fmt(e) + (a.aFinish != null ? ' A' : '') + '</td><td>' + (a.status === 'CO' || a.tf == null ? '' : Math.round(a.tf)) + '</td><td class="gc"><svg width="' + GW + '" height="' + RH + '">' + bars + '</svg></td></tr>';
    });
    // timescale header
    let ts = '<svg width="' + GW + '" height="34">';
    let m = t0;
    while (m < t1) {
      const nx = D.addMonths(m, 1), p = D.parts(m);
      ts += '<line x1="' + X(m) + '" x2="' + X(m) + '" y1="' + (p.m === 0 ? 0 : 17) + '" y2="34" class="tl"/>';
      if ((X(nx) - X(m)) > 18) ts += '<text x="' + ((+X(m) + +X(nx)) / 2).toFixed(1) + '" y="29" text-anchor="middle">' + SE.MONTHS[p.m] + '</text>';
      if (p.m === 0 || m === t0) ts += '<text x="' + (+X(m) + 4) + '" y="12">' + p.y + '</text>';
      m = nx;
    }
    ts += '<line x1="' + X(dd) + '" x2="' + X(dd) + '" y1="0" y2="34" class="dd"/></svg>';
    const bld = A().breakdown(P, 'building', fl);
    const epc = A().breakdown(P, 'epc', fl);
    const btab = (list, label) => '<table class="bt"><thead><tr><th>' + label + '</th><th>Acts</th><th>Planned</th><th>Actual</th><th>Var</th><th>Late start</th><th>Overdue</th><th>Finish</th></tr></thead><tbody>' +
      list.map((b) => '<tr><td>' + E(b.name) + '</td><td>' + b.count + '</td><td>' + b.planned.toFixed(1) + '%</td><td><div class="pb"><i style="width:' + b.actual.toFixed(1) + '%"></i><em style="left:' + b.planned.toFixed(1) + '%"></em></div>' + b.actual.toFixed(1) + '%</td><td class="' + (b.variance < -0.5 ? 'neg' : 'pos') + '">' + (b.variance >= 0 ? '+' : '') + b.variance.toFixed(1) + '%</td><td>' + b.lateStart + '</td><td>' + b.overdue + '</td><td>' + D.fmt(b.finish) + '</td></tr>').join('') + '</tbody></table>';
    const ins = A().insights(P, fl).map((i) => '<li class="' + i.tone + '">' + E(i.text) + '</li>').join('');
    const kp = (l, v, c) => '<div class="kpi' + (c ? ' ' + c : '') + '"><span>' + l + '</span><b>' + v + '</b></div>';
    const ddX = X(dd);
    return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + E(P.meta.name) + ' - Schedule Report</title><style>' +
      ':root{--b:#00338D;--m:#005EB8;--l:#0091DA;--ink:#1d1d1b;--mut:#5b6475;--bg:#f4f6fb;--card:#fff;--line:#dde3ee}' +
      '@media (prefers-color-scheme:dark){:root{--ink:#e8ecf4;--mut:#9aa6bd;--bg:#0c1426;--card:#131e36;--line:#243150}}' +
      '*{box-sizing:border-box}body{margin:0;font:13px/1.45 Arial,Helvetica,sans-serif;color:var(--ink);background:var(--bg)}' +
      'header{background:var(--b);color:#fff;padding:18px 24px;border-bottom:4px solid var(--l)}header h1{margin:0;font-size:22px}header p{margin:4px 0 0;opacity:.85}' +
      'main{padding:16px 24px;max-width:100%}section{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:14px 16px;margin-bottom:16px}h2{margin:0 0 10px;font-size:15px;color:var(--l)}' +
      '.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px}.kpi{border-left:4px solid var(--b);background:rgba(0,51,141,.06);padding:8px 10px;border-radius:4px}.kpi span{display:block;font-size:11px;color:var(--mut)}.kpi b{font-size:20px}.kpi.bad{border-color:#BC204B}.kpi.bad b{color:#BC204B}' +
      '.two{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px}@media(max-width:900px){.two{grid-template-columns:1fr}}' +
      '.sc{width:100%;height:auto}.sc text{font-size:10px;fill:var(--mut)}.sc .g{stroke:var(--line)}.sc .pl{fill:none;stroke:#8a93a6;stroke-width:2;stroke-dasharray:5 4}.sc .fc{fill:none;stroke:var(--l);stroke-width:2}.sc .ac{fill:none;stroke:var(--b);stroke-width:3}.dd{stroke:#BC204B;stroke-width:1.5;stroke-dasharray:4 3}.ddt{fill:#BC204B!important;font-size:10px}' +
      '@media (prefers-color-scheme:dark){.sc .ac{stroke:#7FA7FF}}' +
      'table{border-collapse:collapse;width:100%}.bt th,.bt td{padding:5px 8px;border-bottom:1px solid var(--line);text-align:left;white-space:nowrap}.bt th{font-size:11px;color:var(--mut)}.neg{color:#BC204B;font-weight:bold}.pos{color:#009A44;font-weight:bold}' +
      '.pb{display:inline-block;position:relative;width:80px;height:8px;background:var(--line);border-radius:4px;margin-right:6px;vertical-align:middle}.pb i{position:absolute;left:0;top:0;bottom:0;background:var(--l);border-radius:4px}.pb em{position:absolute;top:-3px;bottom:-3px;width:2px;background:var(--ink)}' +
      'ul.ins{margin:0;padding-left:18px}ul.ins li{margin:4px 0}ul.ins li.bad{color:#BC204B}ul.ins li.good{color:#009A44}' +
      '.tools{display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap}.tools input{flex:1;min-width:180px;padding:7px 10px;border:1px solid var(--line);border-radius:6px;background:var(--card);color:var(--ink)}.tools button{padding:7px 12px;border:1px solid var(--line);border-radius:6px;background:var(--card);color:var(--ink);cursor:pointer}' +
      '.gw{overflow:auto;max-height:78vh;border:1px solid var(--line);border-radius:6px}.gt{font-size:11.5px;min-width:' + (GW + 620) + 'px}.gt th{position:sticky;top:0;background:var(--b);color:#fff;z-index:2;text-align:left;padding:0 6px;height:34px;font-weight:bold}.gt td{padding:0 6px;height:22px;border-bottom:1px solid var(--line);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:360px}' +
      '.gt td.gc,.gt th.gc{padding:0;max-width:none;position:relative}.gt th.gc svg text{fill:#fff;font-size:10px}.gt .tl{stroke:rgba(255,255,255,.35)}.gt td.gc{background-image:linear-gradient(90deg,transparent calc(' + ddX + 'px - 1px),#BC204B calc(' + ddX + 'px - 1px),#BC204B ' + (+ddX + 1) + 'px,transparent ' + (+ddX + 1) + 'px)}' +
      'tr.grp td{font-weight:bold}tr.l0 td{background:#00338D;color:#fff}tr.l1 td{background:#005EB8;color:#fff}tr.l2 td{background:#d6e2f5;color:#10224a}tr.l3 td{background:#e9eff9;color:#10224a}tr.grp td.gc{background-color:transparent;background-blend-mode:normal}' +
      '.ct{font-weight:normal;opacity:.8;font-size:10px;margin-left:4px}.tg{border:0;background:none;color:inherit;cursor:pointer;font-size:11px;padding:0 2px}tr.shut .tg{transform:rotate(-90deg)}' +
      '.ba{fill:#00338D}.br{fill:#0091DA}.bc{fill:#BC204B}.bm{fill:#470A68}.bl{fill:#EAAA00}.sb{fill:#404040}tr.l0 .sb,tr.l1 .sb{fill:#fff}@media (prefers-color-scheme:dark){.ba{fill:#6d95ff}.sb{fill:#c9d3e6}}' +
      'tr.lst td:not(.gc){background:#FFF1CC;color:#1d1d1b}tr.ovd td:not(.gc){background:#FBE3E8;color:#1d1d1b}tr.fut td:not(.gc){background:#EFE3F7;color:#1d1d1b}tr.inv td:not(.gc){background:#FFD6D6;color:#1d1d1b}.id{font-family:Consolas,monospace}.cr{color:#BC204B;font-size:9px}' +
      '.leg{display:flex;flex-wrap:wrap;gap:12px;font-size:11px;color:var(--mut);margin-top:8px}.leg i{display:inline-block;width:14px;height:8px;margin-right:4px;vertical-align:middle;border-radius:2px}' +
      'footer{padding:10px 24px 24px;color:var(--mut);font-size:11px}' +
      '@media print{.tools{display:none}.gw{max-height:none;overflow:visible}section{break-inside:avoid}}' +
      '</style></head><body><header><h1>' + E(P.meta.name) + '</h1><p>Monthly schedule update &middot; Data Date ' + D.fmtLong(dd) + ' &middot; Forecast finish ' + D.fmtLong(P.meta.scheduledFinish) + ' &middot; generated by Schedule Engine</p></header><main>' +
      '<section><div class="kpis">' + kp('Planned', pr.planned.toFixed(1) + '%') + kp('Actual', pr.actual.toFixed(1) + '%') + kp('Variance', (pr.actual - pr.planned >= 0 ? '+' : '') + (pr.actual - pr.planned).toFixed(1) + '%', pr.actual < pr.planned - 0.5 ? 'bad' : '') +
      kp('Activities', all.length) + kp('Completed', all.filter((a) => a.status === 'CO').length) + kp('In progress', all.filter((a) => a.status === 'IP').length) + kp('Late start', fl.counts.lateStart, fl.counts.lateStart ? 'bad' : '') + kp('Overdue', fl.counts.overdue, fl.counts.overdue ? 'bad' : '') + kp('Critical', fl.counts.critical) + '</div></section>' +
      '<div class="two"><section><h2>S-curve</h2>' + svgS + '<div class="leg"><span><i style="background:#8a93a6"></i>Planned</span><span><i style="background:#00338D"></i>Actual</span><span><i style="background:#0091DA"></i>Forecast</span></div></section><section><h2>Engine insights</h2><ul class="ins">' + ins + '</ul></section></div>' +
      '<div class="two"><section><h2>Building-wise</h2><div style="overflow:auto">' + btab(bld, 'Building') + '</div></section><section><h2>EPC-wise</h2><div style="overflow:auto">' + btab(epc, 'EPC') + '</div></section></div>' +
      '<section><h2>Gantt chart</h2><div class="tools"><input id="q" placeholder="Search activity, building, EPC..." aria-label="Search"><button id="ca">Collapse all</button><button id="ea">Expand all</button></div>' +
      '<div class="gw"><table class="gt"><thead><tr><th style="width:110px">Activity ID</th><th style="width:320px">Activity Name</th><th>%</th><th>Start</th><th>Finish</th><th>TF</th><th class="gc">' + ts + '</th></tr></thead><tbody>' + body + '</tbody></table></div>' +
      '<div class="leg"><span><i style="background:#00338D"></i>Actual</span><span><i style="background:#0091DA"></i>Remaining</span><span><i style="background:#BC204B"></i>Critical</span><span><i style="background:#EAAA00"></i>Baseline</span><span><i style="background:#FFF1CC"></i>Late start</span><span><i style="background:#FBE3E8"></i>Overdue</span><span><i style="background:#EFE3F7"></i>Future progress</span></div></section>' +
      '</main><footer>Schedule Engine report &middot; ' + E(P.meta.fileName || '') + ' &middot; ' + new Date().toLocaleString('en-IN') + '</footer>' +
      '<script>(function(){var rows=[].slice.call(document.querySelectorAll(".gt tbody tr"));function apply(){var q=document.getElementById("q").value.toLowerCase().trim();var hideBelow=null;rows.forEach(function(r){var lv=+r.dataset.lv;if(hideBelow!==null&&lv<=hideBelow)hideBelow=null;var hid=hideBelow!==null;if(r.classList.contains("grp")){r.style.display=hid?"none":"";if(!hid&&r.classList.contains("shut"))hideBelow=lv;}else{r.style.display=(hid||(q&&r.dataset.s.indexOf(q)<0))?"none":"";}});}' +
      'rows.forEach(function(r){if(r.classList.contains("grp")){r.querySelector(".tg").onclick=function(){r.classList.toggle("shut");apply();};}});document.getElementById("q").oninput=apply;' +
      'document.getElementById("ca").onclick=function(){rows.forEach(function(r){if(r.classList.contains("grp")&&+r.dataset.lv>0)r.classList.add("shut");});apply();};document.getElementById("ea").onclick=function(){rows.forEach(function(r){r.classList.remove("shut");});apply();};})();</script></body></html>';
  }

  /* ================================================================== *
   * CSV / MS Project XML / JSON
   * ================================================================== */
  function toCSV(P, rows) {
    rows = rows || SE.views.buildRows(P, { groupBy: [] });
    const fl = A().flagAll(P);
    const q = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const head = ['Activity ID', 'Activity Name', 'WBS', 'Building', 'EPC', 'Status', 'Activity Type', 'Original Duration', 'Remaining Duration', '% Complete', 'Start', 'Finish', 'Actual Start', 'Actual Finish', 'BL Start', 'BL Finish', 'Total Float', 'Critical', 'Predecessors', 'Flags', 'Remarks'];
    const out = [head.join(',')];
    for (const r of rows) {
      if (r.kind !== 'act') continue;
      const a = r.a;
      const preds = P.predsOf(a.uid).map((x) => { const p = P.act(x.pred); return (p ? p.code : x.pred) + (x.type !== 'FS' || x.lag ? x.type : '') + (x.lag ? (x.lag > 0 ? '+' : '') + x.lag + 'd' : ''); }).join('; ');
      out.push([a.code, a.name, P.wbsPathText(a.wbsId), P.dim(a, 'building'), P.dim(a, 'epc'), SE.STATUS[a.status], SE.TYPE_LABEL[a.type], a.origDur, a.status === 'CO' ? 0 : a.remDur, a.pct || 0,
        D.fmt(P.startOf(a)), D.fmt(P.finishOf(a)), D.fmt(a.aStart), D.fmt(a.aFinish), D.fmt(a.bl && a.bl.start), D.fmt(a.bl && a.bl.finish), a.tf == null ? '' : a.tf, a.crit ? 'Yes' : '', preds, flagText(fl.map.get(a.uid)), a.notes || ''].map(q).join(','));
    }
    return '﻿' + out.join('\r\n');
  }

  function toMSP(P) {
    const E = (s) => SE.util.esc(s);
    const dcal = P.cal(null);
    const dt = (d, end) => (d == null ? '' : D.fmtISO(d) + 'T' + D.pad(Math.floor((end ? dcal.endMin : dcal.startMin) / 60)) + ':' + D.pad((end ? dcal.endMin : dcal.startMin) % 60) + ':00');
    const dur = (days) => 'PT' + Math.round((days || 0) * 8) + 'H0M0S';
    const uidOf = new Map();
    let uid = 0, id = 0;
    const tasks = [];
    const rows = SE.views.buildRows(P, { groupBy: ['wbs'] });
    for (const r of rows) {
      const u = ++uid;
      if (r.kind === 'group') {
        tasks.push('<Task><UID>' + u + '</UID><ID>' + (++id) + '</ID><Name>' + E(r.label) + '</Name><OutlineLevel>' + (r.level + 1) + '</OutlineLevel><Summary>1</Summary><Start>' + dt(r.sum.start) + '</Start><Finish>' + dt(r.sum.finish, true) + '</Finish></Task>');
      } else {
        const a = r.a;
        uidOf.set(a.uid, u);
        tasks.push({ a, u, lvl: r.level + 1, id: ++id });
      }
    }
    const typeNum = { FF: 0, FS: 1, SF: 2, SS: 3 };
    const xmlTasks = tasks.map((t) => {
      if (typeof t === 'string') return t;
      const a = t.a;
      const preds = P.predsOf(a.uid).filter((r) => uidOf.has(r.pred)).map((r) => '<PredecessorLink><PredecessorUID>' + uidOf.get(r.pred) + '</PredecessorUID><Type>' + typeNum[r.type] + '</Type><LinkLag>' + Math.round((r.lag || 0) * 8 * 600) + '</LinkLag><LagFormat>7</LagFormat></PredecessorLink>').join('');
      return '<Task><UID>' + t.u + '</UID><ID>' + t.id + '</ID><Name>' + E(a.code + ' - ' + a.name) + '</Name><OutlineLevel>' + t.lvl + '</OutlineLevel><Start>' + dt(P.startOf(a)) + '</Start><Finish>' + dt(P.finishOf(a), true) + '</Finish>' +
        '<Duration>' + dur(P.isMilestone(a) ? 0 : a.origDur) + '</Duration><DurationFormat>7</DurationFormat><RemainingDuration>' + dur(a.status === 'CO' ? 0 : a.remDur) + '</RemainingDuration><Milestone>' + (P.isMilestone(a) ? 1 : 0) + '</Milestone><Summary>0</Summary>' +
        '<PercentComplete>' + Math.round(a.pct || 0) + '</PercentComplete>' + (a.aStart != null ? '<ActualStart>' + dt(a.aStart) + '</ActualStart>' : '') + (a.aFinish != null ? '<ActualFinish>' + dt(a.aFinish, true) + '</ActualFinish>' : '') +
        (a.bl && a.bl.start != null ? '<Baseline><Number>0</Number><Start>' + dt(a.bl.start) + '</Start><Finish>' + dt(a.bl.finish, true) + '</Finish></Baseline>' : '') +
        (a.status === 'NS' && a.eStart != null ? '<ConstraintType>4</ConstraintType><ConstraintDate>' + dt(a.eStart) + '</ConstraintDate>' : '') + preds + '</Task>';
    });
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Project xmlns="http://schemas.microsoft.com/project"><Name>' + E(P.meta.name) + '</Name><Title>' + E(P.meta.name) + '</Title><ScheduleFromStart>1</ScheduleFromStart>' +
      '<StartDate>' + dt(P.meta.planStart) + '</StartDate><StatusDate>' + dt(P.meta.dataDate - 1, true) + '</StatusDate><CurrentDate>' + dt(P.meta.dataDate) + '</CurrentDate><MinutesPerDay>480</MinutesPerDay><MinutesPerWeek>' + 480 * dcal.workWeek.filter(Boolean).length + '</MinutesPerWeek><DaysPerMonth>' + Math.round(dcal.workWeek.filter(Boolean).length * 52 / 12) + '</DaysPerMonth>' +
      '<Tasks>' + xmlTasks.join('\n') + '</Tasks></Project>';
  }

  function toJSON(P) { return JSON.stringify(P.toJSON()); }

  SE.PAL = PAL;
  SE.exporters = { toExcel, toPDF, toHTML, toCSV, toMSP, toJSON, flagText };
})(typeof module === 'object' && module.exports ? (global.SE = global.SE || {}) : (window.SE = window.SE || {}));
