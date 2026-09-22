// Turning what was typed into what it meant.
//
// Site data is typed by people in a hurry: "15/01/26", "1,23,456.00",
// "2.5 Cr", "45%", "(1200)", "Y". Every one of those has a single correct
// reading, and the analytics can only be trusted if the reading happens once,
// here, rather than in each report.
import { fieldsOf } from './schema.js';
import { serialToDate } from './ingest/xlsx-read.js';

const MONTHS = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
  may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8,
  september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
};

const BLANKS = new Set(['', '-', '--', 'na', 'n/a', 'nil', 'none', 'null', 'nan', '#n/a', '#value!', '#ref!', '.', 'tbd', 'to be decided']);

export function isBlank(value) {
  if (value === null || value === undefined) return true;
  if (value instanceof Date) return Number.isNaN(value.getTime());
  if (typeof value === 'number') return !Number.isFinite(value);
  return BLANKS.has(String(value).trim().toLowerCase());
}

function utc(year, month, day) {
  if (year < 100) year += year < 70 ? 2000 : 1900;
  const date = new Date(Date.UTC(year, month, day));
  return date.getUTCMonth() === month && date.getUTCDate() === day ? date : null;
}

/**
 * Read a date from anything a site engineer might have typed.
 *
 * Day-first is the default — that is how dates are written in India, and a
 * misread `05/03` silently moves two months of progress.
 */
export function toDate(value, { dayFirst = true } = {}) {
  if (isBlank(value)) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'number') {
    // A bare number in a date column is an Excel serial; anything in the
    // plausible range of 1900-2100 is treated as one.
    if (value > 15000 && value < 80000) return serialToDate(value);
    if (value >= 1900 && value <= 2100) return utc(value, 0, 1);
    return null;
  }

  const text = String(value).trim().replace(/\s+/g, ' ');

  // ISO first: unambiguous.
  let match = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(text);
  if (match) return utc(Number(match[1]), Number(match[2]) - 1, Number(match[3]));

  // 15-Jan-2026 / 15 January 26
  match = /^(\d{1,2})[-\s/.]([A-Za-z]{3,9})[-\s/.,]*(\d{2,4})?$/.exec(text);
  if (match) {
    const month = MONTHS[match[2].toLowerCase()];
    if (month !== undefined) return utc(Number(match[3] ?? new Date().getUTCFullYear()), month, Number(match[1]));
  }

  // Jan-26 / January 2026 — a month bucket, taken as its first day.
  match = /^([A-Za-z]{3,9})[-\s/.,']*(\d{2,4})$/.exec(text);
  if (match) {
    const month = MONTHS[match[1].toLowerCase()];
    if (month !== undefined) return utc(Number(match[2]), month, 1);
  }

  // 15/01/2026, 15-01-26, 15.01.2026
  match = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/.exec(text);
  if (match) {
    let [, a, b, year] = match.map(Number);
    if (a > 12 && b <= 12) return utc(year, b - 1, a);
    if (b > 12 && a <= 12) return utc(year, a - 1, b);
    return dayFirst ? utc(year, b - 1, a) : utc(year, a - 1, b);
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

const SCALES = [
  [/\b(crores?|cr|crs)\b/i, 1e7],
  [/\b(lakhs?|lacs?|lak|lk)\b/i, 1e5],
  [/\b(millions?|mn|mio)\b/i, 1e6],
  [/\b(billions?|bn)\b/i, 1e9],
  [/\b(thousands?|k)\b/i, 1e3],
];

/** Read a number, honouring Indian digit grouping, currency marks and scales. */
export function toNumber(value) {
  if (isBlank(value)) return null;
  if (typeof value === 'number') return value;
  if (value instanceof Date) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;

  let text = String(value).trim();
  let sign = 1;
  if (/^\(.*\)$/.test(text)) {
    sign = -1;
    text = text.slice(1, -1);
  }
  let scale = 1;
  for (const [pattern, factor] of SCALES) {
    if (pattern.test(text)) {
      scale = factor;
      text = text.replace(pattern, ' ');
      break;
    }
  }
  const percent = /%/.test(text);
  const cleaned = text.replace(/[₹$€£,\s]/g, '').replace(/[^0-9.\-+eE]/g, '');
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return null;
  const number = Number(cleaned);
  if (!Number.isFinite(number)) return null;
  return sign * number * scale * (percent ? 0.01 : 1);
}

/**
 * Read a percentage as a fraction of one.
 *
 * "45%" and "45" both mean 0.45; "0.45" also means 0.45. The ambiguity at
 * exactly 1 is resolved as 100%, because a schedule line at 1% complete is
 * written "1%" far less often than a finished one is written "1".
 */
export function toPercent(value) {
  if (isBlank(value)) return null;
  const hadSign = typeof value === 'string' && value.includes('%');
  const number = toNumber(value);
  if (number === null) return null;
  if (hadSign) return number;           // toNumber already divided by 100
  return number > 1 ? number / 100 : number;
}

const TRUE = new Set(['y', 'yes', 'true', '1', 'x', 'yeah', 'haan', 'ha', 'done', 'complete', 'completed', 'closed', '✓', 'critical', 'milestone']);
const FALSE = new Set(['n', 'no', 'false', '0', 'nahi', 'open', 'pending', 'not started']);

export function toBool(value) {
  if (isBlank(value)) return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const text = String(value).trim().toLowerCase();
  if (TRUE.has(text)) return true;
  if (FALSE.has(text)) return false;
  return null;
}

export function toText(value) {
  if (isBlank(value)) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).replace(/\s+/g, ' ').trim();
}

// Written at the foot of a sheet by every site office in the country.
const SUMMARY_ROW = /^\s*(grand\s+total|sub\s*-?\s*total|total\s*:?\s*$|g\.?\s*total)/i;

export function coerce(value, type, options) {
  switch (type) {
    case 'date': return toDate(value, options);
    case 'number': return toNumber(value);
    case 'money': return toNumber(value);
    case 'percent': return toPercent(value);
    case 'bool': return toBool(value);
    default: return toText(value);
  }
}

/**
 * Apply a confirmed mapping to a sheet.
 *
 * @param rows     the sheet, exactly as read
 * @param mapping  {docType, headerRow, headerSpans, columns:[{column, field}]}
 * @returns {{records: object[], skipped: number, issues: object[]}}
 *   Unmapped columns are not thrown away — they ride along in `extra`, so a
 *   client's own column can still be shown in a report without the engine
 *   having to understand it.
 */
export function applyMapping(rows, mapping) {
  const { docType, dataStartRow, columns, dayFirst = true } = mapping;
  const spec = new Map(fieldsOf(docType).map((field) => [field.key, field]));
  const start = dataStartRow ?? (mapping.headerRow ?? 0) + (mapping.headerSpans ?? 1);
  const active = columns.filter((column) => column.field && spec.has(column.field));
  const passthrough = columns.filter((column) => !column.field && column.header);

  const requiredKeys = active.map((column) => column.field).filter((key) => spec.get(key)?.required);

  const records = [];
  const issues = [];
  let skipped = 0;

  for (let i = start; i < rows.length; i += 1) {
    const row = rows[i] ?? [];
    if (!row.some((cell) => !isBlank(cell))) continue;

    const record = { _row: i + 1 };
    let filled = 0;
    for (const column of active) {
      const field = spec.get(column.field);
      const raw = row[column.column];
      const value = coerce(raw, field.type, { dayFirst });
      if (value !== null) filled += 1;
      else if (!isBlank(raw)) {
        issues.push({
          row: i + 1,
          field: field.key,
          label: field.label,
          value: String(raw).slice(0, 60),
          message: `Could not read "${String(raw).slice(0, 40)}" as ${field.type}`,
        });
      }
      record[field.key] = value;
    }

    if (passthrough.length) {
      const extra = {};
      for (const column of passthrough) {
        const value = toText(row[column.column]);
        if (value !== null) extra[column.header] = value;
      }
      if (Object.keys(extra).length) record.extra = extra;
    }

    // A row that carried nothing usable is a spacer or a repeated header.
    if (filled === 0) {
      skipped += 1;
      continue;
    }
    // A row with numbers but no identity — no date, no activity — is the
    // "TOTAL" line at the foot of the sheet. Counting it would double every
    // quantity in the report, so identity decides, not emptiness.
    if (requiredKeys.length && requiredKeys.every((key) => record[key] === null)) {
      skipped += 1;
      continue;
    }
    if (SUMMARY_ROW.test(row.map((cell) => (typeof cell === 'string' ? cell : '')).join(' '))) {
      skipped += 1;
      continue;
    }
    records.push(record);
  }

  return { records, skipped, issues };
}
