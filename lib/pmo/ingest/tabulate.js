// One door for every file a project throws at the engine.
//
// Whatever arrives — the site team's Excel DPR, a CSV from the billing
// engineer, a Primavera .xer, an MS Project XML, a printed PDF — comes out of
// here as the same thing: named sheets of rows. Everything downstream works on
// that one shape, so adding a new source format never touches the analytics.
import { readXlsx } from './xlsx-read.js';
import { parseCsv } from './csv.js';
import { linesToRows, readPdfText } from './pdf-text.js';
import { elements, textOf } from './xml.js';

const ZIP_MAGIC = Buffer.from([0x50, 0x4b]);
const PDF_MAGIC = Buffer.from('%PDF');

export function detectFormat(fileName = '', buffer) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer ?? []);
  const extension = (fileName.split('.').pop() ?? '').toLowerCase();

  if (buf.length >= 2 && buf.subarray(0, 2).equals(ZIP_MAGIC)) return 'xlsx';
  if (buf.length >= 4 && buf.subarray(0, 4).equals(PDF_MAGIC)) return 'pdf';
  if (buf.length >= 8 && buf.subarray(0, 8).toString('hex') === 'd0cf11e0a1b11ae1') return 'xls-legacy';

  const head = buf.subarray(0, 2048).toString('utf8').trimStart();
  if (head.startsWith('ERMHDR')) return 'xer';
  if (head.startsWith('<?xml') || head.startsWith('<')) {
    if (/<Project[\s>]/.test(head) || /mspdi/i.test(head)) return 'msp-xml';
    if (/<APIBusinessObjects|<Project\b/i.test(head)) return 'p6-xml';
    return 'xml';
  }
  if (head.startsWith('{') || head.startsWith('[')) return 'json';
  if (extension === 'xer') return 'xer';
  if (['csv', 'tsv', 'txt'].includes(extension)) return 'csv';
  return extension || 'csv';
}

function rowsFromObjects(records) {
  const headers = [];
  for (const record of records) {
    for (const key of Object.keys(record)) if (!headers.includes(key)) headers.push(key);
  }
  return [headers, ...records.map((record) => headers.map((key) => {
    const value = record[key];
    return value !== null && typeof value === 'object' && !(value instanceof Date) ? JSON.stringify(value) : value ?? null;
  }))];
}

function fromJson(text) {
  const parsed = JSON.parse(text);
  if (Array.isArray(parsed)) return [{ name: 'Data', rows: rowsFromObjects(parsed) }];
  const sheets = [];
  for (const [key, value] of Object.entries(parsed)) {
    if (Array.isArray(value) && value.every((item) => item && typeof item === 'object')) {
      sheets.push({ name: key, rows: rowsFromObjects(value) });
    }
  }
  if (!sheets.length) sheets.push({ name: 'Data', rows: rowsFromObjects([parsed]) });
  return sheets;
}

/**
 * Primavera P6 .xer — a run of tab-delimited tables, each introduced by %T
 * (table name), %F (field names) and any number of %R (rows).
 */
function fromXer(text) {
  const sheets = [];
  let current = null;
  for (const line of text.split(/\r?\n/)) {
    const [marker, ...cells] = line.split('\t');
    if (marker === '%T') {
      current = { name: cells[0] ?? 'TABLE', rows: [] };
      sheets.push(current);
    } else if (marker === '%F' && current) {
      current.rows.push(cells);
    } else if (marker === '%R' && current) {
      current.rows.push(cells);
    }
  }
  // The activity table is what a schedule update needs; put it first.
  sheets.sort((a, b) => (b.name === 'TASK') - (a.name === 'TASK'));
  return sheets.filter((sheet) => sheet.rows.length > 1);
}

const MSP_FIELDS = [
  ['UID', 'ID'], ['ID', 'Sr'], ['Name', 'Activity'], ['WBS', 'WBS'],
  ['OutlineLevel', 'Level'], ['Start', 'Start'], ['Finish', 'Finish'],
  ['Duration', 'Duration'], ['PercentComplete', 'Percent Complete'],
  ['ActualStart', 'Actual Start'], ['ActualFinish', 'Actual Finish'],
  ['BaselineStart', 'Baseline Start'], ['BaselineFinish', 'Baseline Finish'],
  ['Milestone', 'Milestone'], ['Critical', 'Critical'], ['TotalSlack', 'Total Float'],
];

function mspDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date;
}

function fromMspXml(xml) {
  const tasks = elements(xml, 'Task');
  const header = MSP_FIELDS.map(([, label]) => label).concat('Predecessors');
  const rows = [header];
  const nameByUid = new Map();
  for (const { inner } of tasks) nameByUid.set(textOf(inner, 'UID'), textOf(inner, 'Name'));

  for (const { inner } of tasks) {
    const baseline = /<Baseline>[\s\S]*?<\/Baseline>/.exec(inner)?.[0] ?? '';
    const row = MSP_FIELDS.map(([field]) => {
      if (field === 'BaselineStart') return mspDate(textOf(baseline, 'Start'));
      if (field === 'BaselineFinish') return mspDate(textOf(baseline, 'Finish'));
      const raw = textOf(inner, field);
      if (/Start$|Finish$/.test(field)) return mspDate(raw);
      if (field === 'TotalSlack') return raw ? Number(raw) / 4800 : null; // tenths of a minute → days
      if (field === 'Duration') return raw.replace(/^PT?/, '');
      if (field === 'Milestone' || field === 'Critical') return raw === '1';
      return raw;
    });
    const predecessors = elements(inner, 'PredecessorLink')
      .map(({ inner: link }) => nameByUid.get(textOf(link, 'PredecessorUID')) ?? textOf(link, 'PredecessorUID'))
      .filter(Boolean)
      .join(', ');
    rows.push([...row, predecessors]);
  }
  return [{ name: 'Tasks', rows }];
}

function fromP6Xml(xml) {
  const activities = elements(xml, 'Activity');
  if (!activities.length) return fromMspXml(xml);
  const fields = [
    ['Id', 'Activity ID'], ['Name', 'Activity'], ['WBSObjectId', 'WBS'],
    ['PlannedStartDate', 'Baseline Start'], ['PlannedFinishDate', 'Baseline Finish'],
    ['ActualStartDate', 'Actual Start'], ['ActualFinishDate', 'Actual Finish'],
    ['StartDate', 'Start'], ['FinishDate', 'Finish'],
    ['PercentComplete', 'Percent Complete'], ['PlannedDuration', 'Duration'],
    ['TotalFloat', 'Total Float'], ['Status', 'Status'],
  ];
  const rows = [fields.map(([, label]) => label)];
  for (const { inner } of activities) {
    rows.push(fields.map(([field]) => {
      const raw = textOf(inner, field);
      return /Date$/.test(field) ? mspDate(raw) : raw;
    }));
  }
  return [{ name: 'Activities', rows }];
}

/**
 * Read any supported file into sheets of rows.
 *
 * @returns {{format: string, sheets: {name: string, rows: any[][]}[], notes: string[]}}
 */
export function tabulate(fileName, buffer) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  const format = detectFormat(fileName, buf);
  const notes = [];

  switch (format) {
    case 'xlsx': {
      const workbook = readXlsx(buf);
      const visible = workbook.sheets.filter((sheet) => !sheet.hidden);
      if (visible.length < workbook.sheets.length) {
        notes.push(`${workbook.sheets.length - visible.length} hidden sheet(s) were skipped.`);
      }
      return { format, sheets: (visible.length ? visible : workbook.sheets).map(({ name, rows }) => ({ name, rows })), notes };
    }
    case 'csv':
      return { format, sheets: [{ name: fileName || 'Data', rows: parseCsv(buf.toString('utf8')) }], notes };
    case 'json':
      return { format, sheets: fromJson(buf.toString('utf8')), notes };
    case 'xer': {
      const sheets = fromXer(buf.toString('utf8'));
      notes.push('Primavera P6 export read directly — the TASK table holds the activities.');
      return { format, sheets, notes };
    }
    case 'msp-xml':
    case 'xml':
      return { format, sheets: fromMspXml(buf.toString('utf8')), notes };
    case 'p6-xml':
      return { format, sheets: fromP6Xml(buf.toString('utf8')), notes };
    case 'pdf': {
      const { lines, scanned, pages } = readPdfText(buf);
      if (scanned) {
        notes.push(`No text layer found across ${pages} page(s) — this PDF is a scan. Upload the source spreadsheet, or run OCR first.`);
        return { format, sheets: [{ name: 'PDF', rows: [] }], notes };
      }
      notes.push('Text recovered from a PDF: check the column split before you confirm the mapping.');
      return { format, sheets: [{ name: 'PDF', rows: linesToRows(lines) }], notes };
    }
    case 'xls-legacy':
      throw new Error('This is a legacy .xls file. Open it in Excel and re-save as .xlsx or CSV, then upload again.');
    default:
      return { format: 'csv', sheets: [{ name: fileName || 'Data', rows: parseCsv(buf.toString('utf8')) }], notes };
  }
}
