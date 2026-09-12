/* End-to-end smoke test: load the three sample vendor DPRs, consolidate, export. */
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const here = process.cwd();
const page_url = 'file://' + path.join(here, 'DPR_Consolidator_offline.html');
const samples = [
  'samples/ITD Cementation - Piling DPR 11.09.2026.xlsx',
  'samples/Vensar Civil Daily Report 11-09-2026.csv',
  'samples/ARDEE Structural DPR 11Sep26.xlsx'
].map(p => path.join(here, p));

/* use the sandbox's pre-installed Chromium when it is there, else Playwright's own */
const pinned = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch(fs.existsSync(pinned) ? { executablePath: pinned } : {});
const ctx = await browser.newContext({ acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

await page.goto(page_url);
await page.waitForTimeout(500);
console.log('title:', await page.title());

// ---- step 2: vendor files
await page.click('[data-go="1"]');
const fc = page.waitForEvent('filechooser');
await page.click('#drop .big');
(await fc).setFiles(samples);
await page.waitForTimeout(1500);

const cards = await page.$$eval('.fcard', els => els.map(e => e.querySelector('.nm').textContent));
console.log('sheet cards:', JSON.stringify(cards));
const readiness = await page.$$eval('.fcard .fhead', els =>
  els.map(e => e.querySelector('.nm').textContent + ' -> ' + (e.querySelector('.pill')?.textContent || '') +
               ' | ' + e.querySelector('.muted').textContent));
readiness.forEach(r => console.log('  ', r));

// ---- step 3: review
await page.click('[data-go="2"]');
await page.waitForTimeout(800);
const kpis = await page.$$eval('.kpi', els => els.map(e =>
  e.querySelector('.lab').textContent + ': ' + e.querySelector('.val').textContent));
console.log('KPIs:', JSON.stringify(kpis));

const rowInfo = await page.evaluate(() => ({
  rows: ST.rows.length,
  bySheet: ST.rows.reduce((a, r) => (a[r.sheet] = (a[r.sheet] || 0) + 1, a), {}),
  areas: [...new Set(ST.rows.map(r => r.area))],
  sample: ST.rows.slice(0, 3).map(r => ({ s: r.structure, a: r.area, ag: r.agency,
      scope: r.scope, ftd: r.ach_ftd, wd: r.workdone, pct: r.pct }))
}));
console.log('rows:', JSON.stringify(rowInfo, null, 1));

// ---- step 4: preview
await page.click('[data-go="3"]');
await page.waitForTimeout(700);
const summaryRows = await page.$$eval('#p3 table tbody tr', els => els.length);
const grand = await page.$$eval('#p3 tr.grand td', els => els.map(e => e.textContent));
console.log('summary preview rows:', summaryRows);
console.log('grand total row:', JSON.stringify(grand));
await page.screenshot({ path: 'test-summary.png', fullPage: false });

// ---- step 5: export
await page.click('[data-go="4"]');
await page.waitForTimeout(400);
const dl = page.waitForEvent('download', { timeout: 20000 });
await page.click('#bXlsx');
const d = await dl;
const out = path.join(here, 'test-output.xlsx');
await d.saveAs(out);
console.log('downloaded:', d.suggestedFilename(), fs.statSync(out).size, 'bytes');

const dl2 = page.waitForEvent('download', { timeout: 20000 });
await page.click('#bCsv');
await (await dl2).saveAs(path.join(here, 'test-output.csv'));
console.log('csv ok');

// ---- round trip: yesterday's DPR becomes today's master scope
console.log('\n--- round trip: reload the exported DPR as the master ---');
const page2 = await ctx.newPage();
page2.on('pageerror', e => errors.push('PAGEERROR(2): ' + e.message));
page2.on('console', m => { if (m.type() === 'error') errors.push('(2) ' + m.text()); });
await page2.goto(page_url);
await page2.evaluate(() => { localStorage.clear(); });
await page2.reload();
await page2.waitForTimeout(400);
const fc2 = page2.waitForEvent('filechooser');
await page2.click('#bMaster');
(await fc2).setFiles([out]);
await page2.waitForTimeout(1200);
const masterInfo = await page2.evaluate(() => ({
  n: ST.master.length,
  sheets: [...new Set(ST.master.map(m => m.sheet))],
  areas: [...new Set(ST.master.map(m => m.area))],
  agencies: [...new Set(ST.master.map(m => m.agency))],
  first: ST.master[0]
}));
console.log('master loaded from the exported DPR:', JSON.stringify(masterInfo, null, 1));

await page2.click('[data-go="1"]');
const fc3 = page2.waitForEvent('filechooser');
await page2.click('#drop .big');
(await fc3).setFiles(samples);
await page2.waitForTimeout(1800);
await page2.click('[data-go="2"]');
await page2.waitForTimeout(900);
const matchInfo = await page2.evaluate(() => {
  const by = {};
  ST.rows.forEach(r => by[r._match] = (by[r._match] || 0) + 1);
  return { total: ST.rows.length, by,
           weak: ST.rows.filter(r => r._match === 'weak' || r._match === 'new')
                        .map(r => r.structure + ' (' + Math.round(r._score * 100) + '%)') };
});
console.log('match outcome against the master:', JSON.stringify(matchInfo, null, 1));

console.log('\n' + (errors.length ? 'CONSOLE ERRORS:\n' + errors.join('\n') : 'no console errors'));
await browser.close();
process.exit(errors.length ? 1 : 0);
