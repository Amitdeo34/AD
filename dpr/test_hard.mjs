/* Reading test against deliberately nasty vendor files.
   Asserts what each file MUST yield, so a regression fails loudly. */
import { chromium } from 'playwright';
import path from 'path'; import fs from 'fs';

const pinned = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch(fs.existsSync(pinned) ? { executablePath: pinned } : {});
const ctx = await browser.newContext({ acceptDownloads: true });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

const url = 'file://' + path.join(process.cwd(), 'DPR_Consolidator_offline.html');
await page.goto(url);
await page.evaluate(() => localStorage.clear());
await page.reload(); await page.waitForTimeout(300);

let fails = 0, checks = 0;
const ok = (cond, what, got) => {
  checks++;
  if (cond) console.log('  ok   ' + what);
  else { fails++; console.log('  FAIL ' + what + (got !== undefined ? '   got: ' + JSON.stringify(got) : '')); }
};

/* reporting dates matter: column headings carry dates that are read relative
   to them ("Completed till 31.08.26" is last month only if we are in September) */
await page.click('[data-go="0"]');
await page.fill('#cData', '2026-09-11');
await page.fill('#cRep', '2026-09-12');
await page.waitForTimeout(200);

const files = fs.readdirSync('samples-hard').map(f => path.resolve('samples-hard', f));
await page.click('[data-go="1"]');
const fc = page.waitForEvent('filechooser');
await page.click('#drop .big');
(await fc).setFiles(files);
await page.waitForTimeout(3000);

const blocks = await page.evaluate(() => ST.files.flatMap(f => f.sheets.map(sh => {
  sh.fileName = f.name;
  const rows = extractRows(sh);
  return { file: f.name, name: sh.name, disc: sh.disc, agency: sh.agency,
           mapped: Object.keys(sh.map), n: rows.length,
           areas: [...new Set(rows.map(r => r.area))],
           first: rows[0], all: rows.map(r => r.structure) };
})));

const CRIT = ['structure','scope','drawing','front','last_month','plan_ftm','plan_ftd','ach_ftd','ach_ftm_prev'];
const byFile = s => blocks.find(b => b.file.toLowerCase().includes(s.toLowerCase()));

console.log('\n1. MEHER — merged area cells, merged group header, letter-code row, text numbers');
{
  const b = byFile('Meher');
  ok(!!b, 'sheet found');
  ok(b.n === 7, '7 data rows (sub totals, grand total and footer dropped)', b.n);
  ok(CRIT.every(f => b.mapped.includes(f)), 'every critical column mapped', b.mapped);
  ok(b.disc === 'Piling', 'discipline Piling', b.disc);
  ok(b.agency === 'Meher Foundation', 'agency read off the letterhead', b.agency);
  ok(b.areas.length === 2 && b.areas.includes('Filtration Unit') &&
     b.areas.includes('Material Handling Facilities'), 'areas from the merged cells', b.areas);
  ok(b.first.scope === 893 && b.first.last_month === 880 && b.first.ach_ftd === 3 &&
     b.first.ach_ftm_prev === 10 && b.first.plan_ftd === 2 && b.first.plan_ftm === 15,
     'row 1 numbers land in the right fields',
     { sc: b.first.scope, lm: b.first.last_month, ftd: b.first.ach_ftd,
       prev: b.first.ach_ftm_prev, pd: b.first.plan_ftd, pm: b.first.plan_ftm });
  const conv = b.all.find(s => /Conveyor/i.test(s));
  ok(!!conv, 'the 1,188-as-text row survived', b.all);
}

console.log('\n2. VENSAR — two independent tables stacked in one sheet');
{
  const civ = blocks.find(b => /CIVIL/i.test(b.name));
  const str = blocks.find(b => /STRUCTURAL/i.test(b.name));
  ok(!!civ && !!str, 'both tables detected as separate blocks',
     blocks.filter(b => b.file.includes('Vensar')).map(b => b.name));
  ok(civ && civ.n === 4, 'civil block: 4 rows, its Total dropped', civ && civ.n);
  ok(str && str.n === 3, 'structural block: 3 rows', str && str.n);
  ok(civ && civ.disc === 'Civil', 'civil block routed to Civil', civ && civ.disc);
  ok(str && str.disc === 'Structural', 'structural block routed to Structural', str && str.disc);
  ok(str && CRIT.every(f => str.mapped.includes(f)), 'FTD / FTM abbreviations mapped', str && str.mapped);
  ok(civ && civ.agency === 'Vensar Constructions', 'agency from the title row', civ && civ.agency);
}

console.log('\n3. GOEL — 12 rows of preamble, UOM and % columns, junk footer');
{
  const b = byFile('Goel');
  ok(b.n === 6, '6 rows, notes and signature block ignored', b.n);
  ok(b.mapped.includes('uom') && b.mapped.includes('pct_given'), 'UOM and % columns recognised', b.mapped);
  ok(b.agency === 'Goel Constructions', 'agency from the letterhead', b.agency);
  ok(b.areas.every(a => a !== 'Plant General'), 'areas read from the Location column', b.areas);
}

console.log('\n4. ITD — csv with a BOM, blank spacer rows, dates inside the headings');
{
  const b = byFile('ITD');
  ok(b.n === 4, '4 rows across the blank spacer, Total dropped', b.n);
  ok(CRIT.every(f => b.mapped.includes(f)), 'all critical columns mapped', b.mapped);
  ok(b.first.last_month === 400, '"Completed till 31.08.26" read as last month', b.first.last_month);
  ok(b.first.ach_ftm_prev === 4, '"Completed in Sep till 10.09" read as month-till-previous', b.first.ach_ftm_prev);
  ok(b.first.plan_ftm === 10 && b.first.plan_ftd === 2 && b.first.ach_ftd === 3,
     'plan month / plan day / done today kept apart',
     { pm: b.first.plan_ftm, pd: b.first.plan_ftd, ad: b.first.ach_ftd });
}

console.log('\n5. SITE ENGINEER SHEET — abbreviated headings, no letterhead');
{
  const b = byFile('site engineer');
  ok(b.n === 5, '5 rows', b.n);
  ok(CRIT.filter(f => f !== 'scope').every(f => b.mapped.includes(f)),
     '"Plan mnth" / "Done mnth till prev" understood', b.mapped);
}

console.log('\n6. MATCHER — a site engineer\'s wording against the approved master');
{
  const r = await page.evaluate(() => {
    const save = ST.master;
    ST.master = [
      { structure: 'Filtration Main Building (Part-1)', area: 'Filtration Unit',
        activity: 'Piling Works (Nos)', agency: 'Meher Foundation', sheet: 'Piling', scope: 893 },
      { structure: 'Filtration Main Building (Part-2)', area: 'Filtration Unit',
        activity: 'Piling Works (Nos)', agency: 'Meher Foundation', sheet: 'Piling', scope: 659 },
      { structure: 'Conveyor gallery J1C1 & J1C2', area: 'Material Handling Facilities',
        activity: 'Piling Works (Nos)', agency: 'Meher Foundation', sheet: 'Piling', scope: 1188 },
      { structure: 'JH02', area: 'Material Handling Facilities',
        activity: 'Piling Works (Nos)', agency: 'Meher Foundation', sheet: 'Piling', scope: 151 },
      { structure: 'Electrical Substation RMHS', area: 'Filtration Unit',
        activity: 'Piling Works (Nos)', agency: 'Meher Foundation', sheet: 'Piling', scope: 6 },
      { structure: 'Pump House with sump & pump', area: 'Water Treatment Plant',
        activity: 'Civil Works (Cum)', agency: 'Vensar Constructions', sheet: 'Civil', scope: 4400 }
    ];
    const probe = [
      ['Fltration Main Bldg (P-1)', 'M/s Meher Foundations Pvt. Ltd.', 'Filtration', 'Civil'],
      ['Conv. Gallery J1C1-J1C2',   'Meher Foundation', 'MHS', 'Civil'],
      ['JH-02',                     'Meher Foundation', 'MHS', 'Civil'],
      ['Elect. Sub-stn RMHS',       'Meher Foundation', 'Filtration', 'Civil'],
      ['Pump house with sump and pump', 'Vensar', 'WTP', 'Civil'],
      ['Completely Unrelated Shed',  'Someone Else', 'Nowhere', 'Civil']
    ].map(p => {
      const m = matchMaster({ structure: p[0], agency: p[1], area: p[2],
                              activity: '', sheet: p[3] });
      return { written: p[0], state: m.state, score: Math.round(m.score * 100),
               to: m.m ? m.m.structure : null };
    });
    ST.master = save;
    return probe;
  });
  r.forEach(x => console.log('     ' + x.written.padEnd(34) + x.state.padEnd(8) +
                             String(x.score).padStart(3) + '%  -> ' + x.to));
  ok(r.slice(0, 5).every(x => x.state === 'auto'), 'all five abbreviated names matched automatically',
     r.map(x => x.state));
  ok(r[0].to === 'Filtration Main Building (Part-1)', 'Part-1 did not match Part-2', r[0].to);
  ok(r[3].to === 'Electrical Substation RMHS', 'Elect. Sub-stn RMHS resolved', r[3].to);
  ok(r[5].state === 'new', 'an unrelated line is reported as new, not force-matched', r[5].state);
}

console.log('\n7. CONSOLIDATION AND EXPORT');
{
  await page.click('[data-go="2"]'); await page.waitForTimeout(900);
  const tot = await page.evaluate(() => ({
    rows: ST.rows.length,
    bySheet: ST.rows.reduce((a, r) => (a[r.sheet] = (a[r.sheet] || 0) + 1, a), {}),
    areas: [...new Set(ST.rows.map(r => r.area))].sort(),
    issues: ST.rows.filter(r => r._issues && r._issues.length).length
  }));
  console.log('     ' + JSON.stringify(tot));
  ok(tot.rows === 29, '29 consolidated lines (7+4+3+6+4+5)', tot.rows);
  ok(!tot.areas.includes('MHS') && !tot.areas.includes('Filtration'),
     'area spellings unified', tot.areas);

  await page.click('[data-go="4"]'); await page.waitForTimeout(400);
  const dl = page.waitForEvent('download', { timeout: 20000 });
  await page.click('#bXlsx');
  await (await dl).saveAs(path.join(process.cwd(), 'test-hard-output.xlsx'));
  ok(fs.statSync('test-hard-output.xlsx').size > 8000, 'workbook exported');
}

console.log('\n' + (errs.length ? 'CONSOLE ERRORS:\n' + errs.join('\n') : 'no console errors'));
console.log(`\n${checks - fails}/${checks} checks passed`);
await browser.close();
process.exit(fails || errs.length ? 1 : 0);
