// The report as a workbook.
//
// Every table in the pack becomes a sheet with real types, frozen headers and
// a filter row — because the first thing a client does with a PMO report is
// re-cut it. Charts are written as the data behind them, which is what a
// spreadsheet is for.
import { writeXlsx } from '../ingest/xlsx-write.js';
import { chartTable } from './charts.js';
import { spreadsheetCell, STYLE_FOR_FORMAT } from './format.js';
import { formatDate } from '../dates.js';

function sheetNameFor(section, block, index, used) {
  const base = block.title ?? section.title;
  let name = base.replace(/[\\/*?:[\]]/g, '-').slice(0, 28);
  if (used.has(name.toLowerCase())) name = `${name.slice(0, 24)} ${index}`;
  used.add(name.toLowerCase());
  return name;
}

function tableSheet(name, block, { currency }) {
  const header = block.columns.map((column) => ({ v: column.label, s: 'header' }));
  const rows = block.rows.map((row) => block.columns.map((column) => {
    const value = spreadsheetCell(row[column.key], column.format);
    const tone = row._tone;
    const style = tone && ['good', 'warn', 'bad'].includes(tone)
      ? tone
      : (STYLE_FOR_FORMAT[column.format] ?? 'text');
    return { v: value, s: style };
  }));

  return {
    name,
    rows: [header, ...rows],
    columns: block.columns.map((column) => ({ width: column.width ?? (column.format === 'date' ? 13 : 15) })),
    freeze: 1,
    autoFilter: 1,
  };
}

/**
 * Render a report pack to an .xlsx workbook.
 *
 * @returns {Buffer}
 */
export function renderXlsx(pack) {
  const meta = pack.meta ?? {};
  const project = meta.project ?? {};
  const currency = project.currency ?? 'INR';
  const used = new Set();
  const sheets = [];

  // A cover sheet, so a workbook mailed on its own still says what it is.
  const cover = [
    [{ v: pack.title, s: 'title' }],
    [{ v: pack.subtitle ?? '', s: 'subtitle' }],
    [],
    ...[
      ['Project', project.name],
      ['Client', project.client],
      ['Contractor', project.contractor],
      ['Prepared by', project.consultant],
      ['Report type', meta.reportTypeLabel],
      ['Reporting period', meta.period?.label],
      ['Data date', meta.asOf ? formatDate(meta.asOf) : null],
      ['Generated', formatDate(meta.generatedAt ?? new Date())],
      ['Data readiness', Number.isFinite(meta.dataReadiness) ? `${meta.dataReadiness}/100` : null],
    ].filter(([, value]) => value).map(([label, value]) => [{ v: label, s: 'bold' }, { v: value, s: 'text' }]),
    [],
    [{ v: 'Headline measures', s: 'section' }, { v: '', s: 'section' }, { v: '', s: 'section' }],
    ...(pack.kpis ?? []).map((kpi) => [
      { v: kpi.label, s: 'text' }, { v: kpi.value, s: 'text' }, { v: kpi.sub ?? '', s: 'text' },
    ]),
    [],
    [{ v: 'Contents', s: 'section' }, { v: '', s: 'section' }, { v: '', s: 'section' }],
    ...pack.sections.map((section, index) => [{ v: `${index + 1}. ${section.title}`, s: 'text' }]),
  ];
  sheets.push({ name: 'Report', rows: cover, columns: [{ width: 30 }, { width: 30 }, { width: 40 }] });
  used.add('report');

  // Narrative lives on one sheet: a reader wants the prose together, not
  // scattered across twenty tabs.
  const narrativeRows = [[{ v: 'Section', s: 'header' }, { v: 'Narrative', s: 'header' }]];
  for (const section of pack.sections) {
    for (const block of section.blocks) {
      if (block.kind === 'narrative') {
        for (const paragraph of block.paragraphs) {
          narrativeRows.push([{ v: section.title, s: 'text' }, { v: paragraph, s: 'text' }]);
        }
      } else if (block.kind === 'callout') {
        narrativeRows.push([{ v: section.title, s: 'text' }, { v: `${block.title}: ${block.text}`, s: block.tone === 'bad' ? 'bad' : block.tone === 'warn' ? 'warn' : 'text' }]);
      }
    }
  }
  if (narrativeRows.length > 1) {
    sheets.push({ name: 'Narrative', rows: narrativeRows, columns: [{ width: 26 }, { width: 120 }], freeze: 1 });
    used.add('narrative');
  }

  // Exceptions get one consolidated sheet; it is the sheet that gets worked.
  const exceptions = pack.exceptions ?? [];
  if (exceptions.length) {
    sheets.push({
      name: 'Exceptions',
      rows: [
        ['Severity', 'Category', 'Area', 'Subject', 'Observation', 'Measure', 'Recommended action', 'Owner', 'Due', 'Trend', 'Periods open', 'New?']
          .map((label) => ({ v: label, s: 'header' })),
        ...exceptions.map((item) => [
          { v: item.severity, s: item.severity === 'Critical' ? 'bad' : item.severity === 'High' ? 'warn' : 'text' },
          { v: item.category, s: 'text' }, { v: item.area ?? '', s: 'text' }, { v: item.subject, s: 'text' },
          { v: item.detail, s: 'text' }, { v: item.metricDisplay ?? '', s: 'text' },
          { v: item.recommendation, s: 'text' }, { v: item.owner ?? '', s: 'text' },
          { v: item.dueDate ? new Date(item.dueDate) : null, s: 'date' },
          { v: item.trend, s: 'text' }, { v: item.periodsOpen, s: 'integer' }, { v: item.isNew ? 'Yes' : 'No', s: 'text' },
        ]),
      ],
      columns: [{ width: 11 }, { width: 13 }, { width: 14 }, { width: 30 }, { width: 62 }, { width: 13 },
        { width: 54 }, { width: 16 }, { width: 12 }, { width: 11 }, { width: 11 }, { width: 7 }],
      freeze: 1,
      autoFilter: 1,
    });
    used.add('exceptions');
  }

  let index = 1;
  for (const section of pack.sections) {
    for (const block of section.blocks) {
      if (block.kind === 'table' && block.rows?.length) {
        sheets.push(tableSheet(sheetNameFor(section, block, index, used), block, { currency }));
        index += 1;
      } else if (block.kind === 'chart') {
        const data = chartTable(block);
        if (!data.rows.length) continue;
        sheets.push({
          name: sheetNameFor(section, { title: block.title }, index, used),
          rows: [
            data.columns.map((column) => ({ v: column, s: 'header' })),
            ...data.rows.map((row) => row.map((cell) => ({ v: cell, s: 'text' }))),
          ],
          columns: data.columns.map(() => ({ width: 16 })),
          freeze: 1,
        });
        index += 1;
      }
    }
  }

  return writeXlsx(sheets);
}

/**
 * The schedule update, written in a column order that pastes straight back
 * into Primavera or MS Project.
 */
export function renderScheduleXlsx(model) {
  const header = ['Activity ID', 'Activity Name', 'Area', 'Original Duration', 'Remaining Duration',
    'Baseline Start', 'Baseline Finish', 'Actual Start', 'Actual Finish', 'Percent Complete',
    'Forecast Finish', 'Slippage (days)', 'Total Float', 'Critical', 'Predecessors', 'Forecast basis'];

  const rows = model.activities.map((activity) => [
    { v: activity.wbsId ?? activity.id, s: 'text' },
    { v: activity.name, s: 'text' },
    { v: activity.area, s: 'text' },
    { v: activity.duration, s: 'integer' },
    { v: activity.remainingDuration, s: 'integer' },
    { v: activity.baselineStart, s: 'date' },
    { v: activity.baselineFinish, s: 'date' },
    { v: activity.actualStart, s: 'date' },
    { v: activity.actualFinish, s: 'date' },
    { v: activity.percentComplete, s: 'percent' },
    { v: activity.forecastFinish, s: 'date' },
    { v: activity.slippageDays, s: 'integer' },
    { v: activity.totalFloat, s: 'integer' },
    { v: activity.isCritical ? 'Yes' : 'No', s: activity.isCritical ? 'bad' : 'text' },
    { v: activity.predecessors ?? '', s: 'text' },
    { v: activity.forecastBasis, s: 'text' },
  ]);

  return writeXlsx([{
    name: 'Schedule update',
    rows: [header.map((label) => ({ v: label, s: 'header' })), ...rows],
    columns: [{ width: 14 }, { width: 42 }, { width: 16 }, { width: 10 }, { width: 11 }, { width: 13 },
      { width: 13 }, { width: 13 }, { width: 13 }, { width: 11 }, { width: 13 }, { width: 10 },
      { width: 10 }, { width: 9 }, { width: 22 }, { width: 18 }],
    freeze: 1,
    autoFilter: 1,
  }]);
}
