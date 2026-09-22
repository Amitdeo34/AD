// The deliverables: that every report builds, every format is a real file,
// and the numbers on the cover agree with the numbers in the tables.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateReport, REPORT_TYPE_KEYS, defaultPeriod } from '@/lib/pmo/reports/index.js';
import { renderHtml } from '@/lib/pmo/render/html.js';
import { renderXlsx, renderScheduleXlsx } from '@/lib/pmo/render/xlsx.js';
import { renderDocx } from '@/lib/pmo/render/docx.js';
import { renderChart, chartTable } from '@/lib/pmo/render/charts.js';
import { readXlsx } from '@/lib/pmo/ingest/xlsx-read.js';
import { unzip } from '@/lib/pmo/ingest/zip.js';
import { demoProject } from '@/lib/pmo/demo.js';

const { project, data, asOf } = demoProject();

test('every report type builds, with sections and a cover', () => {
  for (const type of REPORT_TYPE_KEYS) {
    const { pack } = generateReport(project, data, { type, asOf });
    assert.ok(pack.title, `${type} has a title`);
    assert.ok(pack.sections.length >= 3, `${type} has sections`);
    assert.ok(pack.kpis.length >= 3, `${type} has headline measures`);
    assert.equal(pack.meta.reportType, type);
    for (const section of pack.sections) {
      assert.ok(section.id && section.title, `${type} sections are labelled`);
      assert.ok(Array.isArray(section.blocks), `${type} sections hold blocks`);
    }
  }
});

test('a period never runs past the data date', () => {
  // The demo's data date is mid-month; a monthly report must not claim the
  // whole month's plan fell due.
  const { context } = generateReport(project, data, { type: 'monthly', asOf });
  assert.ok(context.period.to <= context.asOf);
  assert.ok(context.period.plannedGain < 0.2, 'planned gain stays within the elapsed part of the month');
});

test('the executive summary agrees with the model it was written from', () => {
  const { pack, context } = generateReport(project, data, { type: 'weekly-exception', asOf });
  const summary = pack.sections[0].blocks[0].paragraphs.join(' ');
  const actual = `${(context.model.actualPercent * 100).toFixed(1)}%`;
  const planned = `${(context.model.plannedPercent * 100).toFixed(1)}%`;
  assert.ok(summary.includes(actual), 'the stated actual matches the model');
  assert.ok(summary.includes(planned), 'the stated plan matches the model');
  assert.ok(summary.includes(String(context.exceptions.length)), 'the exception count matches');
});

test('the weekly exception report leads with what is wrong', () => {
  const { pack, context } = generateReport(project, data, { type: 'weekly-exception', asOf });
  const exceptionsSection = pack.sections.find((section) => section.id === 'exceptions');
  assert.ok(exceptionsSection);
  const block = exceptionsSection.blocks.find((item) => item.kind === 'exceptions');
  assert.ok(block.items.length);
  assert.ok(block.items.every((item) => item.recommendation), 'every exception names an action');
  assert.ok(block.items.every((item) => item.severity), 'every exception is graded');
  assert.equal(block.items[0].severity, context.exceptions[0].severity);
});

test('the digital DPR reports the day asked for', () => {
  const { pack } = generateReport(project, data, { type: 'digital-dpr', asOf, options: { date: '2026-09-18' } });
  assert.ok(pack.subtitle.includes('18 Sep 2026'));
  const work = pack.sections.find((section) => section.id === 'work');
  assert.ok(work.blocks[0].rows.length > 0, 'the day has activities');
});

test('a day with no DPR says so rather than showing nothing', () => {
  // The demo has no DPRs for the week of 24 August.
  const { pack } = generateReport(project, data, { type: 'digital-dpr', asOf, options: { date: '2026-08-26' } });
  assert.ok(pack.sections.some((section) => section.id === 'empty'));
});

test('area tracking can be narrowed to chosen areas', () => {
  const { pack } = generateReport(project, data, {
    type: 'area-weekly', asOf, options: { areas: ['Zone B — Station'] },
  });
  assert.ok(pack.subtitle.includes('Zone B'));
  const areaSections = pack.sections.filter((section) => section.id.startsWith('area-'));
  assert.equal(areaSections.length, 1);
});

test('HTML renders as one self-contained, printable document', () => {
  const { pack } = generateReport(project, data, { type: 'monthly', asOf });
  const html = renderHtml(pack);
  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(html.includes('@media print'));
  assert.ok(html.includes('<svg'), 'charts are inline');
  assert.ok(!/<script/i.test(html), 'no script: it must print and archive as-is');
  assert.ok(html.includes(project.name));
  // Every chart ships its data as a table too.
  const charts = (html.match(/class="chart"/g) ?? []).length;
  const tables = (html.match(/Show the data behind this chart/g) ?? []).length;
  assert.equal(charts, tables);
});

test('HTML escapes content rather than trusting it', () => {
  const injected = { ...project, name: 'Package <script>alert(1)</script> & Co' };
  const { pack } = generateReport(injected, data, { type: 'weekly-exception', asOf });
  const html = renderHtml(pack);
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(html.includes('&lt;script&gt;'));
});

test('the Excel workbook is a real workbook that reads back', () => {
  const { pack } = generateReport(project, data, { type: 'monthly', asOf });
  const workbook = readXlsx(renderXlsx(pack));
  assert.ok(workbook.sheets.length > 5);
  assert.equal(workbook.sheets[0].name, 'Report');
  assert.ok(workbook.sheets.some((sheet) => sheet.name === 'Exceptions'));
  const exceptions = workbook.sheets.find((sheet) => sheet.name === 'Exceptions');
  assert.equal(exceptions.rows[0][0], 'Severity');
  assert.ok(exceptions.rows.length > 1);
  // Sheet names must be unique and legal or Excel refuses the file.
  const names = workbook.sheets.map((sheet) => sheet.name);
  assert.equal(new Set(names).size, names.length);
});

test('the schedule export keeps dates and percentages as values', () => {
  const { context } = generateReport(project, data, { type: 'schedule-update', asOf });
  const [sheet] = readXlsx(renderScheduleXlsx(context.model)).sheets;
  assert.equal(sheet.rows[0][0], 'Activity ID');
  const row = sheet.rows[1];
  assert.ok(row[5] instanceof Date, 'baseline start is a date, not text');
  assert.equal(typeof row[9], 'number', 'percent complete is a number');
});

test('the Word document is a valid package', () => {
  const { pack } = generateReport(project, data, { type: 'weekly-exception', asOf });
  const parts = unzip(renderDocx(pack));
  for (const required of ['[Content_Types].xml', '_rels/.rels', 'word/document.xml', 'word/styles.xml']) {
    assert.ok(parts.has(required), `${required} is present`);
  }
  const document = parts.get('word/document.xml').toString('utf8');
  assert.ok(document.includes('<w:document'));
  assert.ok(document.includes('<w:tbl>'), 'tables come through');
  assert.ok(document.includes(pack.title));
});

test('charts draw inside their own box and carry a data table', () => {
  const spec = {
    chartType: 'bars',
    title: 'Test',
    categories: ['A', 'B'],
    series: [{ label: 'Planned', values: [0.55, 0.42] }],
    format: 'percent',
  };
  const svg = renderChart(spec);
  assert.ok(svg.includes('role="img"'));
  // The top gridline must reach the tallest bar, or the bar is drawn outside.
  const gridValues = [...svg.matchAll(/text-anchor="end" font-size="10"[^>]*>(\d+)%/g)].map((match) => Number(match[1]));
  assert.ok(Math.max(...gridValues) >= 55, 'the axis covers the data');
  assert.deepEqual(chartTable(spec).columns, ['Category', 'Planned']);
});

test('report types default to the right calendar period', () => {
  assert.equal(defaultPeriod('weekly-exception', '2026-09-22').from.toISOString().slice(0, 10), '2026-09-21');
  assert.equal(defaultPeriod('monthly', '2026-09-22').from.toISOString().slice(0, 10), '2026-09-01');
  assert.equal(defaultPeriod('quarterly', '2026-09-22').label, 'Q2 FY27');
  assert.equal(defaultPeriod('schedule-update', '2026-09-22').from, null);
});
