// Write .xlsx workbooks.
//
// Every report the engine produces can leave as a real Excel file, because a
// PMO deliverable that cannot be opened, filtered and re-cut by the client is
// only half a deliverable. Values keep their type — dates stay dates, numbers
// stay numbers — so the client's own pivot tables still work.
import { zip } from './zip.js';
import { escapeXml } from './xml.js';

// The named styles a report can ask for, in the order they are written into
// cellXfs; the index in this list is the `s` attribute on a cell.
export const STYLES = [
  'default', 'header', 'text', 'number', 'integer', 'percent', 'money', 'date',
  'title', 'subtitle', 'good', 'warn', 'bad', 'bold', 'section',
];
const STYLE_INDEX = new Map(STYLES.map((name, index) => [name, index]));

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
__SHEETS__
</Types>`;

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="5">
<numFmt numFmtId="164" formatCode="dd-mmm-yyyy"/>
<numFmt numFmtId="165" formatCode="#,##0.00"/>
<numFmt numFmtId="166" formatCode="#,##0"/>
<numFmt numFmtId="167" formatCode="0.0%"/>
<numFmt numFmtId="168" formatCode="&quot;₹&quot;\\ #,##0"/>
</numFmts>
<fonts count="6">
<font><sz val="10"/><name val="Calibri"/></font>
<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
<font><b/><sz val="14"/><color rgb="FF10284B"/><name val="Calibri"/></font>
<font><i/><sz val="9"/><color rgb="FF6B7280"/><name val="Calibri"/></font>
<font><b/><sz val="10"/><name val="Calibri"/></font>
<font><b/><sz val="10"/><color rgb="FF10284B"/><name val="Calibri"/></font>
</fonts>
<fills count="7">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF10284B"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFDCFCE7"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFEF3C7"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFEE2E2"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFEEF2F7"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="2">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left style="thin"><color rgb="FFD1D5DB"/></left><right style="thin"><color rgb="FFD1D5DB"/></right><top style="thin"><color rgb="FFD1D5DB"/></top><bottom style="thin"><color rgb="FFD1D5DB"/></bottom><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="15">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
<xf numFmtId="166" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
<xf numFmtId="167" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
<xf numFmtId="168" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="4" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="5" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="4" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"/>
<xf numFmtId="0" fontId="5" fillId="6" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
</cellXfs>
</styleSheet>`;

function columnName(index) {
  let name = '';
  let n = index + 1;
  while (n > 0) {
    const remainder = (n - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    n = Math.floor((n - remainder) / 26);
  }
  return name;
}

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

function dateToSerial(date) {
  return (date.getTime() - EXCEL_EPOCH) / 86400000;
}

function cellXml(value, rowNumber, colIndex, defaultStyle) {
  const cell = value && typeof value === 'object' && !(value instanceof Date) ? value : { v: value };
  const style = STYLE_INDEX.get(cell.s ?? defaultStyle) ?? 0;
  const ref = `${columnName(colIndex)}${rowNumber}`;
  let v = cell.v;

  if (v === null || v === undefined || v === '') {
    return style ? `<c r="${ref}" s="${style}"/>` : '';
  }
  if (v instanceof Date) {
    const serial = dateToSerial(v);
    const dateStyle = cell.s ? style : STYLE_INDEX.get('date');
    return `<c r="${ref}" s="${dateStyle}"><v>${serial}</v></c>`;
  }
  if (typeof v === 'number' && Number.isFinite(v)) {
    return `<c r="${ref}" s="${style}"><v>${v}</v></c>`;
  }
  if (typeof v === 'boolean') {
    return `<c r="${ref}" s="${style}" t="b"><v>${v ? 1 : 0}</v></c>`;
  }
  v = String(v);
  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(v)}</t></is></c>`;
}

function sheetXml(sheet) {
  const rows = sheet.rows ?? [];
  const body = rows.map((row, index) => {
    const cells = (row ?? []).map((cell, col) => cellXml(cell, index + 1, col, sheet.defaultStyle ?? 'default')).join('');
    return cells ? `<row r="${index + 1}">${cells}</row>` : '';
  }).join('');

  const width = Math.max(1, ...rows.map((row) => (row ?? []).length));
  const cols = (sheet.columns ?? []).length
    ? `<cols>${sheet.columns.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width ?? 14}" customWidth="1"/>`).join('')}</cols>`
    : '';
  const freeze = sheet.freeze
    ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${sheet.freeze}" topLeftCell="A${sheet.freeze + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
    : '';
  const filter = sheet.autoFilter
    ? `<autoFilter ref="A${sheet.autoFilter}:${columnName(width - 1)}${Math.max(rows.length, sheet.autoFilter)}"/>`
    : '';
  const merges = (sheet.merges ?? []).length
    ? `<mergeCells count="${sheet.merges.length}">${sheet.merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>`
    : '';

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${freeze}${cols}<sheetData>${body}</sheetData>${filter}${merges}<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/></worksheet>`;
}

const RESERVED = /[\\/*?:[\]]/g;

function safeSheetName(name, taken) {
  let base = String(name || 'Sheet').replace(RESERVED, '-').slice(0, 31).trim() || 'Sheet';
  let candidate = base;
  let n = 2;
  while (taken.has(candidate.toLowerCase())) {
    const suffix = ` (${n})`;
    candidate = base.slice(0, 31 - suffix.length) + suffix;
    n += 1;
  }
  taken.add(candidate.toLowerCase());
  return candidate;
}

/**
 * Build a workbook.
 *
 * @param {{name: string, rows: any[][], columns?: {width: number}[],
 *          freeze?: number, autoFilter?: number, merges?: string[]}[]} sheets
 * @returns {Buffer} the .xlsx file
 */
export function writeXlsx(sheets) {
  const taken = new Set();
  const named = (sheets.length ? sheets : [{ name: 'Sheet1', rows: [] }])
    .map((sheet) => ({ ...sheet, name: safeSheetName(sheet.name, taken) }));

  const entries = [
    ['[Content_Types].xml', CONTENT_TYPES.replace('__SHEETS__', named
      .map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
      .join('\n'))],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${named
      .map((sheet, i) => `<sheet name="${escapeXml(sheet.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
      .join('')}</sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${named
      .map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
      .join('')}<Relationship Id="rId${named.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml', STYLES_XML],
    ...named.map((sheet, i) => [`xl/worksheets/sheet${i + 1}.xml`, sheetXml(sheet)]),
  ];

  return zip(entries);
}
