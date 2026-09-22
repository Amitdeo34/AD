// The ingest path: reading files, working out what they are, and reading the
// values the way the person who typed them meant them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { zip, unzip } from '@/lib/pmo/ingest/zip.js';
import { writeXlsx } from '@/lib/pmo/ingest/xlsx-write.js';
import { readXlsx } from '@/lib/pmo/ingest/xlsx-read.js';
import { parseCsv, sniffDelimiter, writeCsv } from '@/lib/pmo/ingest/csv.js';
import { tabulate, detectFormat } from '@/lib/pmo/ingest/tabulate.js';
import { inspectSheet, mapHeaders, normalizeHeader } from '@/lib/pmo/mapping/automap.js';
import { applyMapping, toDate, toNumber, toPercent, toBool } from '@/lib/pmo/normalize.js';

test('zip round-trips both stored and deflated entries', () => {
  const files = unzip(zip([['a.txt', 'x'.repeat(500)], ['b/c.bin', Buffer.from([0, 1, 2, 255])]]));
  assert.equal(files.get('a.txt').toString(), 'x'.repeat(500));
  assert.deepEqual([...files.get('b/c.bin')], [0, 1, 2, 255]);
});

test('xlsx round-trips values, types and escaped text', () => {
  const buffer = writeXlsx([{
    name: 'Progress',
    rows: [
      [{ v: 'Activity', s: 'header' }, { v: 'Date', s: 'header' }, { v: 'Qty', s: 'header' }],
      ['Raft & <steel>', new Date(Date.UTC(2026, 1, 2)), 128.5],
      ['Piling', new Date(Date.UTC(2026, 0, 15)), { v: 0.42, s: 'percent' }],
    ],
  }]);
  const [sheet] = readXlsx(buffer).sheets;
  assert.equal(sheet.name, 'Progress');
  assert.equal(sheet.rows[1][0], 'Raft & <steel>');
  assert.equal(sheet.rows[1][1].toISOString().slice(0, 10), '2026-02-02');
  assert.equal(sheet.rows[1][2], 128.5);
  assert.equal(sheet.rows[2][2], 0.42);
});

test('sheet names that clash or use reserved characters are made safe', () => {
  const { sheets } = readXlsx(writeXlsx([
    { name: 'Schedule/Update', rows: [['a']] },
    { name: 'Schedule/Update', rows: [['b']] },
  ]));
  assert.equal(sheets.length, 2);
  assert.notEqual(sheets[0].name, sheets[1].name);
  for (const sheet of sheets) assert.ok(!/[\\/*?:[\]]/.test(sheet.name));
});

test('CSV sniffs its delimiter and honours quoting', () => {
  assert.equal(sniffDelimiter('a;b;c\n1;2;3'), ';');
  const rows = parseCsv('Date,Activity,Remarks\n2026-01-01,"Piling, phase 1","He said ""ok"""');
  assert.deepEqual(rows[1], ['2026-01-01', 'Piling, phase 1', 'He said "ok"']);
});

test('writeCsv escapes separators and newlines', () => {
  assert.match(writeCsv([['a,b', 'c"d']]), /"a,b","c""d"/);
});

test('formats are detected from content, not the file extension', () => {
  assert.equal(detectFormat('anything.dat', writeXlsx([{ name: 'S', rows: [['a']] }])), 'xlsx');
  assert.equal(detectFormat('sched.txt', Buffer.from('ERMHDR\t19.12\n')), 'xer');
  assert.equal(detectFormat('x.csv', Buffer.from('a,b\n1,2')), 'csv');
});

test('a Primavera .xer export is read into its tables', () => {
  const xer = ['ERMHDR\t19.12', '%T\tTASK', '%F\ttask_id\ttask_name', '%R\t1\tExcavation', '%R\t2\tPCC', '%E'].join('\n');
  const { sheets } = tabulate('p.xer', Buffer.from(xer));
  assert.equal(sheets[0].name, 'TASK');
  assert.deepEqual(sheets[0].rows[1], ['1', 'Excavation']);
});

test('dates are read day-first, as they are written on site', () => {
  assert.equal(toDate('15/01/2026').toISOString().slice(0, 10), '2026-01-15');
  assert.equal(toDate('05/03/26').toISOString().slice(0, 10), '2026-03-05');
  assert.equal(toDate('15-Jan-2026').toISOString().slice(0, 10), '2026-01-15');
  assert.equal(toDate('2026-03-05').toISOString().slice(0, 10), '2026-03-05');
  assert.equal(toDate('Jan-26').toISOString().slice(0, 10), '2026-01-01');
  // Unambiguous the other way round is still read correctly.
  assert.equal(toDate('03/15/2026').toISOString().slice(0, 10), '2026-03-15');
  assert.equal(toDate(''), null);
  assert.equal(toDate('N/A'), null);
});

test('numbers survive Indian grouping, currency marks, scales and brackets', () => {
  assert.equal(toNumber('1,23,456.50'), 123456.5);
  assert.equal(toNumber('₹ 2,000'), 2000);
  assert.equal(toNumber('2.5 Cr'), 25000000);
  assert.equal(toNumber('1.2 Lakh'), 120000);
  assert.equal(toNumber('(1200)'), -1200);
  assert.equal(toNumber('-'), null);
});

test('percentages read the same whether written as 45, 45% or 0.45', () => {
  assert.equal(toPercent('45%'), 0.45);
  assert.equal(toPercent(45), 0.45);
  assert.equal(toPercent(0.45), 0.45);
  assert.equal(toBool('Yes'), true);
  assert.equal(toBool('nahi'), false);
});

test('headers fold to a comparable form', () => {
  assert.equal(normalizeHeader('Cum. Qty (upto date)'), 'cum qty upto date');
  assert.equal(normalizeHeader('Manpower — Actual'), 'manpower actual');
});

test('a messy real-world DPR is understood without help', () => {
  const rows = [
    ['M/s Sharma Constructions Pvt Ltd'],
    ['DAILY PROGRESS REPORT - Package P-2'],
    [],
    ['Sl. No.', 'Date', 'Zone', 'Item of Work', 'UOM', 'Qty (Plan)', 'Qty Achieved',
      'Cum. Qty upto date', 'Manpower', '', 'Equip. Deployed', 'Reason for delay', 'Remarks'],
    ['', '', '', '', '', '', '', '', 'Plan', 'Actual', '', '', ''],
    [1, '15/01/2026', 'Zone-A', 'Excavation for pier foundation', 'cum', '250', '180', '1,240', 20, 17, 3, 'Rain', 'ok'],
    [2, '15/01/2026', 'Zone-B', 'PCC 1:4:8', 'cum', '60', '60', '410', 12, 12, 1, '', ''],
    [3, '16-01-2026', 'Zone-A', 'Excavation for pier foundation', 'cum', '250', '0', '1,240', 20, 4, 0, 'Drawing awaited', ''],
    [],
    ['TOTAL', '', '', '', '', '560', '240', ''],
  ];

  const inspection = inspectSheet(rows);
  assert.equal(inspection.docType, 'dpr');
  assert.equal(inspection.headerRow, 3);
  assert.equal(inspection.headerSpans, 2, 'the merged two-row header is read as one');
  assert.deepEqual(inspection.missingRequired, []);

  const field = (header) => inspection.columns.find((column) => column.header === header)?.field;
  // The pair most often transposed by a naive matcher.
  assert.equal(field('Qty (Plan)'), 'plannedQty');
  assert.equal(field('Qty Achieved'), 'actualQty');
  assert.equal(field('Cum. Qty upto date'), 'cumulativeQty');
  assert.equal(field('Manpower Plan'), 'manpowerPlanned');
  assert.equal(field('Manpower Actual'), 'manpowerActual');
  assert.equal(field('Equip. Deployed'), 'equipmentActual');
  assert.equal(field('Reason for delay'), 'hindrance');

  const { records, skipped } = applyMapping(rows, inspection);
  assert.equal(records.length, 3, 'the TOTAL row is not data');
  assert.equal(skipped, 1);
  assert.equal(records[0].plannedQty, 250);
  assert.equal(records[0].actualQty, 180);
  assert.equal(records[0].cumulativeQty, 1240);
  assert.equal(records[0].date.toISOString().slice(0, 10), '2026-01-15');
});

test('a field is claimed by one column only', () => {
  const mapped = mapHeaders(['Planned Qty', 'Plan Qty', 'Activity'], 'dpr');
  const fields = mapped.map((column) => column.field).filter(Boolean);
  assert.equal(new Set(fields).size, fields.length);
});

test('a schedule sheet is told apart from a DPR', () => {
  const rows = [
    ['Activity ID', 'Activity Name', 'Baseline Start', 'Baseline Finish', 'Predecessors', '% Complete'],
    ['A1010', 'Mobilisation', '05-01-2026', '03-02-2026', '', '100%'],
    ['A1020', 'Piling', '04-02-2026', '03-06-2026', 'A1010', '45%'],
  ];
  const inspection = inspectSheet(rows);
  assert.equal(inspection.docType, 'schedule');
  const { records } = applyMapping(rows, inspection);
  assert.equal(records[1].wbsId, 'A1020');
  assert.equal(records[1].actualPct, 0.45);
  assert.equal(records[1].predecessors, 'A1010');
});
