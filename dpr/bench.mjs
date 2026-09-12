/* Diagnostic harness: what does the reader actually get out of each file? */
import { chromium } from 'playwright';
import path from 'path'; import fs from 'fs';

const pinned = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch(fs.existsSync(pinned) ? { executablePath: pinned } : {});
const page = await (await browser.newContext({ acceptDownloads: true })).newPage();
const errs = [];
page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto('file://' + path.join(process.cwd(), 'DPR_Consolidator_offline.html'));
await page.evaluate(() => localStorage.clear());
await page.reload(); await page.waitForTimeout(300);

const dir = process.argv[2] || 'samples-hard';
const files = fs.readdirSync(dir).map(f => path.resolve(dir, f));
await page.click('[data-go="1"]');
const fc = page.waitForEvent('filechooser');
await page.click('#drop .big');
(await fc).setFiles(files);
await page.waitForTimeout(3000);

const report = await page.evaluate(() => {
  const out = [];
  ST.files.forEach(f => f.sheets.forEach(sh => {
    sh.fileName = f.name;
    let rows = [];
    try { rows = extractRows(sh); } catch (e) { rows = [{ ERR: e.message }]; }
    out.push({
      file: f.name, sheet: sh.name, used: sh.use, disc: sh.disc,
      hdr: (sh.r0 + 1) + (sh.r1 > sh.r0 ? '-' + (sh.r1 + 1) : ''),
      labels: sh.labels.map((l, i) => l ? (i + ':' + l) : null).filter(Boolean),
      map: Object.fromEntries(Object.entries(sh.map).map(([k, v]) => [k, v.col + '(' + Math.round(v.conf * 100) + '%)'])),
      nrows: rows.length,
      sample: rows.slice(0, 3).map(r => ({ st: r.structure, ar: r.area, ag: r.agency,
        sc: r.scope, dr: r.drawing, fr: r.front, lm: r.last_month,
        pm: r.plan_ftm, pd: r.plan_ftd, ad: r.ach_ftd, mp: r.ach_ftm_prev })),
      last: rows.slice(-2).map(r => r.structure)
    });
  }));
  return { sheets: out, total: ST.rows.length };
});

for (const s of report.sheets) {
  console.log('\n' + '='.repeat(92));
  console.log(`FILE  ${s.file}\n  SHEET ${s.sheet}   used=${s.used}  ->${s.disc}  header lines ${s.hdr}`);
  console.log('labels :', s.labels.join(' | '));
  console.log('mapped :', JSON.stringify(s.map));
  console.log('rows   :', s.nrows, ' last two:', JSON.stringify(s.last));
  s.sample.forEach(r => console.log('   ', JSON.stringify(r)));
}
console.log('\nCONSOLIDATED ROWS:', report.total);
if (errs.length) console.log('ERRORS:\n' + errs.join('\n'));
await browser.close();
