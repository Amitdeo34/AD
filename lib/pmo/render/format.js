// How a value is written, once, for every output format.
import { formatDate } from '../dates.js';
import { formatMoney, formatNumber, formatPercent } from '../reports/narrative.js';

/** A cell as text. */
export function formatCell(value, format, { currency = 'INR' } = {}) {
  if (value === null || value === undefined || value === '') return '—';
  switch (format) {
    case 'date': return formatDate(value);
    case 'percent': return Number.isFinite(value) ? formatPercent(value) : String(value);
    case 'money': return Number.isFinite(value) ? formatMoney(value, { currency }) : String(value);
    case 'number': return Number.isFinite(value) ? formatNumber(value, Math.abs(value) < 100 && !Number.isInteger(value) ? 2 : 0) : String(value);
    case 'integer': return Number.isFinite(value) ? formatNumber(Math.round(value)) : String(value);
    case 'bool': return value === true ? 'Yes' : value === false ? 'No' : '—';
    default: return String(value);
  }
}

/** The native value a spreadsheet should hold, so filters and pivots work. */
export function spreadsheetCell(value, format) {
  if (value === null || value === undefined || value === '') return null;
  if (format === 'date') return value instanceof Date ? value : new Date(value);
  if (format === 'bool') return value === true ? 'Yes' : value === false ? 'No' : null;
  if (['percent', 'money', 'number', 'integer'].includes(format)) {
    return Number.isFinite(value) ? value : null;
  }
  return String(value);
}

export const STYLE_FOR_FORMAT = {
  date: 'date',
  percent: 'percent',
  money: 'money',
  number: 'number',
  integer: 'integer',
};

export const NUMERIC_FORMATS = new Set(['percent', 'money', 'number', 'integer']);
