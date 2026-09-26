#!/usr/bin/env node
/* Regenerates the files in samples/ using the same engine code as the app.
 *   node tools/make-sample.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const V = (f) => path.join(root, 'vendor', f);
global.window = global.window || undefined;
global.ExcelJS = require(V('exceljs.min.js'));
global.XLSX = require(V('xlsx.full.min.js'));
global.jspdf = require(V('jspdf.umd.min.js'));
require(V('jspdf.plugin.autotable.min.js')).applyPlugin(global.jspdf.jsPDF);
try { global.PptxGenJS = require('pptxgenjs'); } catch (e) { global.PptxGenJS = null; console.log('  (install pptxgenjs to also regenerate the .pptx sample)'); }
['base', 'model', 'cpm', 'xer', 'analysis', 'views', 'importers', 'exporters', 'demo', 'qty', 'qtyexport'].forEach((f) => require(path.join(root, 'src', 'core', f + '.js')));
const SE = global.SE;
const D = SE.D;
const out = path.join(root, 'samples');
fs.mkdirSync(out, { recursive: true });
const w = (name, data) => { fs.writeFileSync(path.join(out, name), Buffer.isBuffer(data) || typeof data === 'string' ? data : Buffer.from(data)); console.log('  samples/' + name); };

(async () => {
  // 1. last month's schedule as P6 XER (start here: open it, set Data Date 01-Oct-26)
  const last = SE.demo.build();
  w('Demo_Plant_LastMonth_DD_2026-09-01.xer', Buffer.from(SE.xer.encode(SE.xer.toXer(last), 'windows-1252')));
  // 2. this month's update reports (a few updates applied + F9)
  const P = SE.demo.build();
  P.meta.dataDate = D.dayOf(2026, 9, 1);
  const fl = SE.analysis.flagAll(P);
  const patches = [];
  for (const a of P.acts) {
    const f = fl.map.get(a.uid);
    if (f.includes('lateStart') && patches.length < 5) patches.push({ uid: a.uid, changes: P.isMilestone(a) ? { aFinish: P.refStart(a) } : { aStart: P.refStart(a), pct: 15 } });
    else if (f.includes('inProgress') && patches.length < 12) patches.push({ uid: a.uid, changes: { pct: Math.min(99, (a.pct || 0) + 20) } });
  }
  P.apply(patches, 'sample update');
  SE.schedule(P);
  w('Demo_Update_Workbook.xlsx', Buffer.from(await SE.exporters.toExcel(P)));
  w('Demo_Update_Report.pdf', Buffer.from(SE.exporters.toPDF(P)));
  w('Demo_Update_Report.html', SE.exporters.toHTML(P));
  // 3. quantity one-pagers in the style of the building-structures deck
  SE.qty.sample(P);
  w('Building_Structures_OnePagers.pdf', Buffer.from(SE.qtyExport.toPDF(P, 'building')));
  if (global.PptxGenJS) { try { w('Building_Structures_OnePagers.pptx', Buffer.from(await SE.qtyExport.toPPTX(P, 'building'))); } catch (e) { console.log('  (pptx skipped: ' + e.message + ')'); } }
  w('Qty_Liquidation_Filled.xlsx', Buffer.from(await SE.qtyExport.toExcel(P, false)));
  w('Qty_Liquidation_Template_Blank.xlsx', Buffer.from(await SE.qtyExport.toExcel(P, true)));
})().catch((e) => { console.error(e); process.exit(1); });
