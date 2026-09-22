// Read .xlsx workbooks into plain rows.
//
// Clients send their DPR as a spreadsheet, in whatever shape their site team
// settled on years ago. This reader makes no assumptions about that shape: it
// hands back every sheet as an array of rows, dates already resolved, and lets
// the mapping layer work out what the columns mean.
import { unzip } from './zip.js';
import { allText, attributes, decodeXml, elements, textOf } from './xml.js';

// Number formats Excel ships with that mean "this is a date or a time".
const BUILTIN_DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 30, 36, 45, 46, 47, 50, 57]);

function looksLikeDateFormat(code) {
  if (!code) return false;
  // Strip quoted literals, escaped characters and colour/condition blocks
  // before deciding — "\d" in a currency format is not a day.
  const stripped = code
    .replace(/"[^"]*"/g, '')
    .replace(/\\./g, '')
    .replace(/\[[^\]]*\]/g, '');
  return /[ymdhs]/i.test(stripped) && !/^[^ymdhs]*$/i.test(stripped);
}

function columnIndex(ref) {
  let n = 0;
  for (let i = 0; i < ref.length; i += 1) {
    const code = ref.charCodeAt(i);
    if (code < 65 || code > 90) break;
    n = n * 26 + (code - 64);
  }
  return n - 1;
}

/** Excel's serial number → a real Date, in UTC so the day never shifts. */
export function serialToDate(serial, { date1904 = false } = {}) {
  const epoch = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
  const whole = Math.floor(serial);
  const fraction = serial - whole;
  const ms = Math.round(fraction * 86400 * 1000);
  return new Date(epoch + whole * 86400000 + ms);
}

function sharedStrings(files) {
  const xml = files.get('xl/sharedStrings.xml')?.toString('utf8');
  if (!xml) return [];
  return elements(xml, 'si').map(({ inner }) => (
    inner.includes('<r>') || inner.includes('<r ') ? allText(inner, 't') : textOf(inner, 't')
  ));
}

function dateStyles(files) {
  const xml = files.get('xl/styles.xml')?.toString('utf8');
  const styles = new Set();
  if (!xml) return styles;

  const custom = new Map();
  for (const { attrs } of elements(xml, 'numFmt')) {
    custom.set(Number(attrs.numFmtId), attrs.formatCode);
  }
  // Only the cellXfs block maps a cell's `s` index to a format.
  const cellXfs = /<cellXfs[\s\S]*?<\/cellXfs>/.exec(xml)?.[0] ?? '';
  elements(cellXfs, 'xf').forEach(({ attrs }, index) => {
    const id = Number(attrs.numFmtId ?? 0);
    if (BUILTIN_DATE_FORMATS.has(id) || looksLikeDateFormat(custom.get(id))) styles.add(index);
  });
  return styles;
}

function sheetOrder(files) {
  const workbook = files.get('xl/workbook.xml')?.toString('utf8') ?? '';
  const rels = files.get('xl/_rels/workbook.xml.rels')?.toString('utf8') ?? '';
  const targets = new Map();
  for (const { attrs } of elements(rels, 'Relationship')) {
    const target = attrs.Target.startsWith('/')
      ? attrs.Target.slice(1)
      : `xl/${attrs.Target.replace(/^\.\//, '')}`;
    targets.set(attrs.Id, target);
  }
  const date1904 = /date1904="(1|true)"/.test(workbook);
  const sheets = elements(workbook, 'sheet').map(({ attrs }) => ({
    name: attrs.name,
    hidden: attrs.state === 'hidden' || attrs.state === 'veryHidden',
    path: targets.get(attrs['r:id']),
  }));
  return { sheets, date1904 };
}

function parseSheet(xml, { strings, styles, date1904 }) {
  const rows = [];
  for (const row of elements(xml, 'row')) {
    const index = row.attrs.r ? Number(row.attrs.r) - 1 : rows.length;
    const cells = [];
    let cursor = 0;
    for (const cell of elements(row.inner, 'c')) {
      const at = cell.attrs.r ? columnIndex(cell.attrs.r) : cursor;
      cursor = at + 1;
      const type = cell.attrs.t;
      let value = null;
      if (type === 's') {
        value = strings[Number(textOf(cell.inner, 'v'))] ?? '';
      } else if (type === 'inlineStr') {
        value = cell.inner.includes('<r>') ? allText(cell.inner, 't') : textOf(cell.inner, 't');
      } else if (type === 'str') {
        value = textOf(cell.inner, 'v');
      } else if (type === 'e') {
        value = null; // #N/A, #REF! and friends read as empty
      } else {
        const raw = textOf(cell.inner, 'v');
        if (raw === '') value = null;
        else if (type === 'b') value = raw === '1';
        else {
          const num = Number(raw);
          value = Number.isFinite(num) ? num : decodeXml(raw);
          if (typeof value === 'number' && styles.has(Number(cell.attrs.s ?? -1)) && value > 0) {
            value = serialToDate(value, { date1904 });
          }
        }
      }
      cells[at] = value;
    }
    for (let i = 0; i < cells.length; i += 1) if (cells[i] === undefined) cells[i] = null;
    rows[index] = cells;
  }
  for (let i = 0; i < rows.length; i += 1) if (!rows[i]) rows[i] = [];
  return rows;
}

/**
 * Read a workbook.
 *
 * @returns {{sheets: {name: string, hidden: boolean, rows: any[][]}[]}}
 */
export function readXlsx(buffer) {
  const files = unzip(buffer);
  if (!files.has('xl/workbook.xml')) {
    throw new Error('Not an .xlsx workbook. If this is an older .xls file, re-save it as .xlsx or CSV.');
  }
  const strings = sharedStrings(files);
  const styles = dateStyles(files);
  const { sheets, date1904 } = sheetOrder(files);

  return {
    sheets: sheets.map(({ name, hidden, path }) => {
      const xml = path && files.get(path)?.toString('utf8');
      return {
        name,
        hidden,
        rows: xml ? parseSheet(xml, { strings, styles, date1904 }) : [],
      };
    }),
  };
}

export { attributes };
