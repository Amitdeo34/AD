// CSV and TSV, both directions. Delimiters are sniffed rather than assumed,
// because a DPR exported from a European-locale Excel arrives semicolon
// separated and nobody mentions it.

const DELIMITERS = [',', ';', '\t', '|'];

export function sniffDelimiter(text) {
  const sample = text.split(/\r?\n/).slice(0, 20).join('\n');
  let best = ',';
  let bestScore = -1;
  for (const delimiter of DELIMITERS) {
    // Count only separators outside quotes, then reward consistency across rows.
    const counts = [];
    for (const line of sample.split('\n')) {
      let inQuotes = false;
      let count = 0;
      for (let i = 0; i < line.length; i += 1) {
        if (line[i] === '"') inQuotes = !inQuotes;
        else if (!inQuotes && line[i] === delimiter) count += 1;
      }
      if (line.trim()) counts.push(count);
    }
    if (!counts.length) continue;
    const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
    if (mean < 1) continue;
    const variance = counts.reduce((a, b) => a + (b - mean) ** 2, 0) / counts.length;
    const score = mean - variance;
    if (score > bestScore) {
      bestScore = score;
      best = delimiter;
    }
  }
  return best;
}

/** Parse delimited text into rows of strings. */
export function parseCsv(text, { delimiter } = {}) {
  const clean = text.replace(/^﻿/, '');
  const sep = delimiter ?? sniffDelimiter(clean);
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < clean.length; i += 1) {
    const ch = clean[i];
    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i += 1;
        } else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"' && field === '') inQuotes = true;
    else if (ch === sep) {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (ch !== '\r') field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.map((cells) => cells.map((cell) => cell.trim()));
}

function csvCell(value) {
  if (value === null || value === undefined) return '';
  const text = value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Serialise rows to CSV, with a BOM so Excel opens Hindi/₹ text correctly. */
export function writeCsv(rows, { bom = true } = {}) {
  const body = rows.map((row) => (row ?? []).map(csvCell).join(',')).join('\r\n');
  return `${bom ? '﻿' : ''}${body}\r\n`;
}
