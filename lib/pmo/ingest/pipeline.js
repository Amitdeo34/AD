// From an uploaded file to confirmed, normalised records.
//
// Two passes on purpose. `inspectUpload` reads the file and proposes what it
// thinks everything is; the manager looks at it once and corrects anything
// wrong; `commitUpload` then applies that decision and remembers it, so the
// same workbook next week needs no decision at all.
import { tabulate } from './tabulate.js';
import { inspectSheet, normalizeHeader } from '../mapping/automap.js';
import { applyMapping } from '../normalize.js';
import { DOC_TYPES } from '../schema.js';
import { findTemplate, saveDataset, saveTemplate } from '../store.js';
import { shortHash } from '../hash.js';

/**
 * A stable identity for "this shape of sheet", from the headers alone.
 *
 * Deliberately blind to column order and to the data — a client sending the
 * same template with a different week of rows should match, and one who moved
 * a column should still match.
 */
export function fingerprint(headers) {
  const normalized = headers
    .map((header) => normalizeHeader(header))
    .filter(Boolean)
    .sort();
  return shortHash(normalized.join('|'));
}

function previewOf(rows, inspection, limit = 8) {
  const preview = applyMapping(rows, { ...inspection, dayFirst: true });
  return {
    rows: preview.records.slice(0, limit),
    totalRows: preview.records.length,
    skipped: preview.skipped,
    issues: preview.issues.slice(0, 20),
    issueCount: preview.issues.length,
  };
}

/**
 * Read a file and propose, for every sheet in it, what it is and what its
 * columns mean.
 *
 * @returns an inspection the UI renders as the mapping wizard
 */
export function inspectUpload({ fileName, buffer, projectId, docTypeHint }) {
  const { format, sheets, notes } = tabulate(fileName, buffer);

  const inspected = sheets.map((sheet) => {
    const rows = sheet.rows ?? [];
    if (rows.length < 2) {
      return { name: sheet.name, rowCount: rows.length, empty: true, notes: ['Sheet has no tabular data.'] };
    }

    const first = inspectSheet(rows, docTypeHint ? { docType: docTypeHint } : undefined);
    const print = fingerprint(first.headers);
    const template = projectId ? findTemplate(projectId, print) : null;

    // A template the manager confirmed before beats anything guessed now.
    const inspection = template
      ? {
        ...first,
        docType: template.docType,
        headerRow: template.headerRow,
        headerSpans: template.headerSpans,
        dataStartRow: template.headerRow + template.headerSpans,
        columns: first.columns.map((column) => {
          const saved = template.columns.find((item) => item.column === column.column);
          return saved ? { ...column, field: saved.field, confidence: 1, fromTemplate: true } : column;
        }),
      }
      : first;

    return {
      name: sheet.name,
      rowCount: rows.length,
      columnCount: Math.max(...rows.slice(0, 50).map((row) => (row ?? []).length), 0),
      fingerprint: print,
      template: template ? { id: template.id, name: template.name, usedCount: template.usedCount } : null,
      ...inspection,
      docTypeLabel: DOC_TYPES[inspection.docType]?.label ?? inspection.docType,
      preview: previewOf(rows, inspection),
      sample: rows.slice(0, Math.min(rows.length, inspection.dataStartRow + 5)).map((row) => (row ?? []).map((cell) => (cell instanceof Date ? cell.toISOString().slice(0, 10) : cell))),
    };
  });

  // The sheet the manager most likely came to import is the one the engine is
  // surest about and that carries the most rows.
  const best = inspected
    .filter((sheet) => !sheet.empty)
    .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0) || (b.preview?.totalRows ?? 0) - (a.preview?.totalRows ?? 0))[0];

  return {
    fileName,
    format,
    notes,
    sheets: inspected,
    suggestedSheet: best?.name ?? inspected[0]?.name ?? null,
    bytes: buffer.length,
  };
}

/**
 * Apply confirmed mappings and store the result.
 *
 * @param selections  one entry per sheet the manager chose to import
 * @returns the datasets created
 */
export function commitUpload({ projectId, fileName, buffer, selections, rememberMapping = true, replaces = null }) {
  const { sheets } = tabulate(fileName, buffer);
  const created = [];

  for (const selection of selections) {
    const sheet = sheets.find((item) => item.name === selection.sheet);
    if (!sheet) throw new Error(`Sheet "${selection.sheet}" is not in this file`);

    const mapping = {
      docType: selection.docType,
      headerRow: selection.headerRow,
      headerSpans: selection.headerSpans ?? 1,
      dataStartRow: selection.dataStartRow ?? selection.headerRow + (selection.headerSpans ?? 1),
      columns: selection.columns.filter((column) => column.field || column.header),
      dayFirst: selection.dayFirst ?? true,
    };
    const { records, skipped, issues } = applyMapping(sheet.rows, mapping);

    const dataset = saveDataset({
      projectId,
      docType: selection.docType,
      fileName,
      sheet: selection.sheet,
      rowCount: records.length,
      skipped,
      issues: issues.slice(0, 200),
      issueCount: issues.length,
      mapping: {
        headerRow: mapping.headerRow,
        headerSpans: mapping.headerSpans,
        columns: mapping.columns.map(({ column, header, field }) => ({ column, header, field })),
      },
      fingerprint: fingerprint(selection.columns.map((column) => column.header)),
      records,
      replaces,
    });
    created.push(dataset);

    if (rememberMapping) {
      saveTemplate({
        projectId,
        docType: selection.docType,
        name: selection.templateName ?? `${DOC_TYPES[selection.docType]?.short ?? selection.docType} — ${fileName}`,
        fingerprint: dataset.fingerprint,
        headerRow: mapping.headerRow,
        headerSpans: mapping.headerSpans,
        columns: mapping.columns.map(({ column, header, field }) => ({ column, header, field })),
      });
    }
  }

  return created;
}
