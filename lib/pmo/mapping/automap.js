// Working out what a spreadsheet actually contains.
//
// A DPR arrives with a title block, a merged two-row header, a stray logo row
// and columns called things like "Cum. Qty upto date". Nobody in a PMO should
// spend their Monday re-typing that. This module finds the header row, works
// out which canonical field each column is, guesses the document type, and
// reports how confident it is — so the manager confirms a mapping instead of
// building one.
import { DOC_TYPES, DOC_TYPE_KEYS, fieldsOf } from '../schema.js';

/** Fold a header into the form the dictionary is keyed by. */
export function normalizeHeader(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    // Brackets separate words, they do not hide them: "Qty (Plan)" is the
    // planned quantity, and dropping what is inside loses exactly that.
    .replace(/[()[\]{}]/g, ' ')
    .replace(/[_\-/\\]+/g, ' ')
    .replace(/&/g, ' and ')
    .replace(/%/g, ' percent ')
    .replace(/\bnos?\.?\b/gi, ' no ')
    .replace(/[^\p{L}\p{N}\s.]/gu, ' ')
    .replace(/\./g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// "cum" and "qty" are how sites actually write it; the dictionary holds the
// long forms, so both directions are folded to the same token.
const TOKEN_SYNONYMS = new Map(Object.entries({
  qty: 'quantity', qtys: 'quantity', quantities: 'quantity',
  cum: 'cumulative', cumm: 'cumulative', cumul: 'cumulative', tot: 'total',
  act: 'actual', actl: 'actual', ach: 'achieved', achv: 'achieved',
  plan: 'planned', plnd: 'planned', sched: 'scheduled', schd: 'scheduled',
  tgt: 'target', desc: 'description', descr: 'description',
  no: 'number', nos: 'number', sr: 'serial', sl: 'serial', srl: 'serial',
  dt: 'date', amt: 'amount', rs: 'amount', inr: 'amount',
  wrk: 'work', compl: 'complete', completed: 'complete', completion: 'complete',
  prog: 'progress', pct: 'percent', percentage: 'percent',
  mp: 'manpower', eqp: 'equipment', eqpt: 'equipment', equip: 'equipment',
  equipt: 'equipment', equipments: 'equipment', mach: 'machinery', machines: 'machinery',
  mc: 'machinery', labor: 'labour', labours: 'labour', deploy: 'deployed',
  resp: 'responsibility', respo: 'responsibility', rem: 'remarks',
  upto: 'till', uptil: 'till', 'till': 'till', todate: 'till',
  bl: 'baseline', base: 'baseline', fcst: 'forecast', rev: 'revised',
  ms: 'milestone', wbs: 'wbs', boq: 'boq', ipc: 'invoice', ra: 'invoice',
}));

function tokens(text) {
  return normalizeHeader(text)
    .split(' ')
    .filter(Boolean)
    .map((token) => TOKEN_SYNONYMS.get(token) ?? token);
}

function canonical(text) {
  return tokens(text).join(' ');
}

/** Dice coefficient over character bigrams — forgiving of typos and spacing. */
function similarity(a, b) {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
  const bigrams = new Map();
  for (let i = 0; i < a.length - 1; i += 1) {
    const gram = a.slice(i, i + 2);
    bigrams.set(gram, (bigrams.get(gram) ?? 0) + 1);
  }
  let hits = 0;
  for (let i = 0; i < b.length - 1; i += 1) {
    const gram = b.slice(i, i + 2);
    const count = bigrams.get(gram) ?? 0;
    if (count > 0) {
      bigrams.set(gram, count - 1);
      hits += 1;
    }
  }
  return (2 * hits) / (a.length + b.length - 2);
}

/** Same words, any order — heading word order carries no meaning. */
function sameTokens(a, b) {
  if (a.length !== b.length) return false;
  const left = [...a].sort().join(' ');
  const right = [...b].sort().join(' ');
  return left === right;
}

/** Every word of the alias appears in the header. */
function contains(headerTokens, formTokens) {
  const set = new Set(headerTokens);
  return formTokens.length > 0 && formTokens.every((token) => set.has(token));
}

function tokenOverlap(a, b) {
  const left = new Set(a);
  const right = new Set(b);
  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  return shared / Math.max(left.size, right.size, 1);
}

const INDEX_CACHE = new Map();

function indexOf(docType) {
  if (INDEX_CACHE.has(docType)) return INDEX_CACHE.get(docType);
  const entries = fieldsOf(docType).map((field) => ({
    key: field.key,
    type: field.type,
    required: Boolean(field.required),
    // The label is a legitimate spelling too, and the field key in camelCase
    // covers files the engine itself produced.
    forms: [...new Set([field.label, field.key.replace(/([A-Z])/g, ' $1'), ...field.aliases].map(canonical))]
      .filter(Boolean)
      .map((form) => ({ form, tokens: form.split(' ') })),
  }));
  INDEX_CACHE.set(docType, entries);
  return entries;
}

/**
 * Score one header against every field of a document type.
 *
 * @returns {{key: string, confidence: number}[]} best first
 */
export function scoreHeader(header, docType) {
  const text = canonical(header);
  if (!text) return [];
  const headerTokens = text.split(' ');
  const scores = [];

  for (const field of indexOf(docType)) {
    let best = 0;
    for (const { form, tokens: formTokens } of field.forms) {
      let score = 0;
      const coverage = formTokens.length / headerTokens.length;
      if (form === text) score = 1;
      else if (sameTokens(headerTokens, formTokens)) {
        // "Qty (Plan)" and "plan qty" are the same field written two ways;
        // word order carries no meaning in a column heading.
        score = 0.97;
      } else if (contains(headerTokens, formTokens)) {
        // A header that says more than the alias still matches it, but the
        // more of the header the alias accounts for, the stronger the claim —
        // which is what stops a bare "qty" from winning "cum qty till date".
        score = 0.72 + 0.22 * Math.min(coverage, 1);
      } else if (text.includes(form) && form.length >= 4) {
        score = 0.6 + 0.26 * Math.min(coverage, 1);
      } else if (form.includes(text) && text.length >= 4) {
        score = 0.62;
      } else {
        const overlap = tokenOverlap(headerTokens, formTokens);
        const fuzzy = similarity(text, form);
        score = Math.max(overlap * 0.8, fuzzy * 0.72);
      }
      if (score > best) best = score;
    }
    if (best > 0.35) scores.push({ key: field.key, confidence: Number(best.toFixed(3)) });
  }
  return scores.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Map a whole header row onto canonical fields.
 *
 * Assignment is greedy by confidence and one-to-one: if "Planned Qty" and
 * "Plan Qty" both look like `plannedQty`, the stronger one wins it and the
 * other falls to its next-best field rather than silently overwriting.
 */
export function mapHeaders(headers, docType) {
  const candidates = [];
  headers.forEach((header, column) => {
    for (const { key, confidence } of scoreHeader(header, docType)) {
      candidates.push({ column, key, confidence });
    }
  });
  candidates.sort((a, b) => b.confidence - a.confidence || a.column - b.column);

  const byColumn = new Map();
  const takenFields = new Set();
  for (const candidate of candidates) {
    if (byColumn.has(candidate.column) || takenFields.has(candidate.key)) continue;
    byColumn.set(candidate.column, candidate);
    takenFields.add(candidate.key);
  }

  return headers.map((header, column) => {
    const hit = byColumn.get(column);
    return {
      column,
      header: header === null || header === undefined ? '' : String(header).trim(),
      field: hit?.key ?? null,
      confidence: hit?.confidence ?? 0,
      alternatives: scoreHeader(header, docType).slice(0, 4).map(({ key, confidence }) => ({ key, confidence })),
    };
  });
}

function cellIsHeaderish(value) {
  if (typeof value !== 'string') return false;
  const text = value.trim();
  return text.length > 0 && text.length < 60 && /\p{L}/u.test(text);
}

function nonEmpty(row) {
  return (row ?? []).filter((cell) => cell !== null && cell !== undefined && String(cell).trim() !== '').length;
}

/**
 * Merge a two-row header, forward-filling the top row across the merged cells
 * it spans — which is how "Manpower" over "Plan | Actual" is meant to be read.
 */
function mergeHeaderRows(top, bottom) {
  const width = Math.max(top.length, bottom.length);
  const merged = [];
  let carried = '';
  for (let i = 0; i < width; i += 1) {
    const above = top[i] === null || top[i] === undefined ? '' : String(top[i]).trim();
    if (above) carried = above;
    const below = bottom[i] === null || bottom[i] === undefined ? '' : String(bottom[i]).trim();
    if (!below) merged.push(above || '');
    else if (!carried || canonical(carried) === canonical(below)) merged.push(below);
    else merged.push(`${carried} ${below}`);
  }
  return merged;
}

/**
 * Find the header row (or the two rows that together form one).
 *
 * @returns {{headerRow: number, headers: string[], spans: number, score: number}}
 */
export function findHeaderRow(rows, docType, { scan = 30 } = {}) {
  const limit = Math.min(rows.length, scan);
  let best = { headerRow: 0, headers: (rows[0] ?? []).map((cell) => (cell ?? '').toString()), spans: 1, score: -1 };

  for (let i = 0; i < limit; i += 1) {
    const row = rows[i] ?? [];
    if (nonEmpty(row) < 2) continue;

    for (const spans of [1, 2]) {
      if (spans === 2 && i + 1 >= rows.length) continue;
      const headers = spans === 1 ? row.map((cell) => (cell ?? '').toString()) : mergeHeaderRows(row, rows[i + 1] ?? []);
      const filled = headers.filter(cellIsHeaderish).length;
      if (filled < 2) continue;

      const mapped = mapHeaders(headers, docType);
      const matched = mapped.filter((entry) => entry.field && entry.confidence >= 0.6);
      const strength = matched.reduce((sum, entry) => sum + entry.confidence, 0);

      // A header row is followed by data, and data is not all text.
      const dataRows = rows.slice(i + spans, i + spans + 6).filter((candidate) => nonEmpty(candidate) > 1);
      const dataBonus = Math.min(dataRows.length, 3) * 0.5;
      const density = filled / Math.max(headers.length, 1);
      // Rows further down are usually a repeated header inside the data.
      const score = strength * 1.6 + matched.length * 0.6 + dataBonus + density - i * 0.06 - (spans === 2 ? 0.4 : 0);

      if (score > best.score) best = { headerRow: i, headers, spans, score: Number(score.toFixed(3)), matched: matched.length };
    }
  }
  return best;
}

/** How well a sheet fits a document type, 0–1. */
export function scoreDocType(rows, docType) {
  const { headers, matched = 0 } = findHeaderRow(rows, docType, { scan: 20 });
  const mapped = mapHeaders(headers, docType);
  const strong = mapped.filter((entry) => entry.field && entry.confidence >= 0.72);
  const spec = DOC_TYPES[docType];
  const required = spec.fields.filter((field) => field.required).map((field) => field.key);
  const requiredHit = required.filter((key) => strong.some((entry) => entry.field === key)).length;

  if (!required.length) return 0;
  const requiredScore = requiredHit / required.length;
  const coverage = strong.length / Math.max(spec.fields.length * 0.35, 3);
  const confidence = strong.reduce((sum, entry) => sum + entry.confidence, 0) / Math.max(strong.length, 1);
  // Precision is what separates the real answer from a plausible one: a cash
  // flow sheet has a date and an amount, but so does a DPR with eleven other
  // columns, and only one of them explains the whole sheet.
  const populated = headers.filter((header) => String(header ?? '').trim()).length;
  const precision = strong.length / Math.max(populated, 1);
  const score = requiredScore * 0.4 + precision * 0.35 + Math.min(coverage, 1) * 0.15 + confidence * 0.1;
  return Number((score * (matched ? 1 : 0.6)).toFixed(3));
}

/**
 * Guess what a sheet is, ranked.
 *
 * @returns {{docType: string, score: number}[]}
 */
export function detectDocType(rows, { only } = {}) {
  const keys = only ?? DOC_TYPE_KEYS;
  return keys
    .map((docType) => ({ docType, score: scoreDocType(rows, docType) }))
    .sort((a, b) => b.score - a.score);
}

/**
 * The full first pass over a sheet: what it is, where its header is, and what
 * each column means.
 */
export function inspectSheet(rows, { docType } = {}) {
  const ranking = detectDocType(rows);
  const chosen = docType ?? ranking[0]?.docType ?? 'dpr';
  const header = findHeaderRow(rows, chosen);
  const columns = mapHeaders(header.headers, chosen);
  const mappedCount = columns.filter((column) => column.field).length;

  return {
    docType: chosen,
    detected: ranking.slice(0, 4),
    confidence: docType ? scoreDocType(rows, chosen) : (ranking[0]?.score ?? 0),
    headerRow: header.headerRow,
    headerSpans: header.spans,
    dataStartRow: header.headerRow + header.spans,
    headers: header.headers,
    columns,
    mappedCount,
    unmapped: columns.filter((column) => !column.field && column.header).map((column) => column.header),
    missingRequired: fieldsOf(chosen)
      .filter((field) => field.required && !columns.some((column) => column.field === field.key))
      .map((field) => ({ key: field.key, label: field.label })),
  };
}
