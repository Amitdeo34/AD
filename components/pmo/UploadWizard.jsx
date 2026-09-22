'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { pmo } from '@/lib/pmo/client';
import { Alert, Badge, Button, Card, Field, inputClass } from './ui';

/**
 * Upload in two steps: the engine proposes, the manager confirms.
 *
 * Nothing is stored until the mapping is accepted, and once it is accepted it
 * is remembered — the same workbook next week arrives pre-mapped.
 */
export default function UploadWizard({ slug }) {
  const [meta, setMeta] = useState(null);
  const [inspection, setInspection] = useState(null);
  const [selections, setSelections] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef(null);

  useEffect(() => {
    pmo.meta().then(setMeta).catch((err) => setError(err.message));
  }, []);

  const upload = useCallback(async (file) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const data = await pmo.inspect(slug, file);
      setInspection(data);
      // Sheets the engine is confident about start ticked; the rest do not.
      setSelections(Object.fromEntries(
        data.sheets.filter((sheet) => !sheet.empty).map((sheet) => [
          sheet.name,
          {
            include: sheet.name === data.suggestedSheet || (sheet.confidence ?? 0) >= 0.7,
            docType: sheet.docType,
            headerRow: sheet.headerRow,
            headerSpans: sheet.headerSpans,
            columns: sheet.columns,
          },
        ]),
      ));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }, [slug]);

  async function commit() {
    setBusy(true);
    setError(null);
    try {
      const chosen = Object.entries(selections)
        .filter(([, selection]) => selection.include)
        .map(([sheet, selection]) => ({
          sheet,
          docType: selection.docType,
          headerRow: selection.headerRow,
          headerSpans: selection.headerSpans,
          dataStartRow: selection.headerRow + selection.headerSpans,
          columns: selection.columns.map(({ column, header, field }) => ({ column, header, field })),
        }));
      const data = await pmo.commit(slug, { token: inspection.token, selections: chosen });
      setResult(data);
      setInspection(null);
      setSelections({});
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const chosenCount = Object.values(selections).filter((selection) => selection.include).length;

  return (
    // Bottom padding keeps the last mapping rows clear of the sticky action bar.
    <div className="grid gap-4 pb-24">
      <Card
        title="Upload data"
        subtitle="Excel, CSV, Primavera .xer, MS Project XML, JSON, or a PDF print-out. The engine works out what it is."
      >
        <div
          onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            upload(event.dataTransfer.files?.[0]);
          }}
          className={`rounded-xl border-2 border-dashed px-6 py-10 text-center transition ${
            dragging ? 'border-pmo-500 bg-pmo-50' : 'border-pmo-200 bg-pmo-50/40'
          }`}
        >
          <p className="text-sm font-semibold text-pmo-700">Drop a file here</p>
          <p className="mt-1 text-xs text-ink-400">or</p>
          <Button variant="secondary" className="mt-2" onClick={() => fileInput.current?.click()} disabled={busy}>
            {busy ? 'Reading…' : 'Choose a file'}
          </Button>
          <input
            ref={fileInput}
            type="file"
            className="sr-only"
            accept=".xlsx,.xlsm,.csv,.tsv,.txt,.json,.xer,.xml,.pdf"
            onChange={(event) => upload(event.target.files?.[0])}
          />
          <p className="mt-3 text-[0.7rem] text-ink-400">
            Up to 25 MB. Nothing is stored until you confirm the mapping.
          </p>
        </div>
      </Card>

      {error ? <Alert>{error}</Alert> : null}

      {result ? (
        <Alert tone="good">
          <b>{result.imported} rows imported</b> across {result.datasets.length} sheet
          {result.datasets.length === 1 ? '' : 's'}. The mapping has been saved, so the next file in
          this format will come through pre-mapped.{' '}
          <Link href={`/pmo/${slug}`} className="font-semibold underline">Back to the project</Link>.
        </Alert>
      ) : null}

      {inspection ? (
        <>
          {inspection.notes?.length ? (
            <Alert tone="warn">{inspection.notes.join(' ')}</Alert>
          ) : null}

          <div className="grid gap-4">
            {inspection.sheets.map((sheet) => (
              <SheetMapping
                key={sheet.name}
                sheet={sheet}
                meta={meta}
                selection={selections[sheet.name]}
                onChange={(patch) => setSelections((state) => ({
                  ...state,
                  [sheet.name]: { ...state[sheet.name], ...patch },
                }))}
              />
            ))}
          </div>

          <div className="sticky bottom-3 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-pmo-200 bg-white/95 px-4 py-3 shadow-lg backdrop-blur">
            <p className="text-sm text-ink-500">
              {chosenCount} sheet{chosenCount === 1 ? '' : 's'} selected from <b>{inspection.fileName}</b>
            </p>
            <div className="ml-auto flex gap-2">
              <Button variant="secondary" onClick={() => { setInspection(null); setSelections({}); }}>Discard</Button>
              <Button onClick={commit} disabled={busy || !chosenCount}>
                {busy ? 'Importing…' : `Import ${chosenCount || ''} sheet${chosenCount === 1 ? '' : 's'}`}
              </Button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function SheetMapping({ sheet, meta, selection, onChange }) {
  const docTypes = meta?.docTypes ?? [];
  const fields = useMemo(
    () => docTypes.find((docType) => docType.key === selection?.docType)?.fields ?? [],
    [docTypes, selection?.docType],
  );

  if (sheet.empty) {
    return (
      <Card title={sheet.name} subtitle="No tabular data on this sheet — it will be skipped.">
        <p className="text-sm text-ink-400">{sheet.notes?.join(' ')}</p>
      </Card>
    );
  }

  const mapped = selection?.columns?.filter((column) => column.field).length ?? 0;
  const confidence = Math.round((sheet.confidence ?? 0) * 100);
  const missing = fields.filter((field) => field.required && !selection?.columns?.some((column) => column.field === field.key));

  return (
    <Card
      title={sheet.name}
      subtitle={`${sheet.rowCount} rows · header on row ${(selection?.headerRow ?? 0) + 1}${
        (selection?.headerSpans ?? 1) > 1 ? ` and ${(selection?.headerRow ?? 0) + 2}` : ''
      } · ${mapped} of ${selection?.columns?.length ?? 0} columns mapped`}
      action={
        <label className="flex items-center gap-2 text-sm font-semibold text-pmo-700">
          <input
            type="checkbox"
            className="size-4 accent-[#10284b]"
            checked={Boolean(selection?.include)}
            onChange={(event) => onChange({ include: event.target.checked })}
          />
          Import
        </label>
      }
    >
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {sheet.template ? (
          <Badge tone="Green">Saved mapping reused — {sheet.template.usedCount}× before</Badge>
        ) : (
          <Badge tone={confidence >= 80 ? 'Green' : confidence >= 55 ? 'Amber' : 'Red'}>
            Detected with {confidence}% confidence
          </Badge>
        )}
        {sheet.detected?.slice(1, 3).map((guess) => (
          <span key={guess.docType} className="text-ink-400">
            also looks like {docTypes.find((docType) => docType.key === guess.docType)?.short ?? guess.docType} ({Math.round(guess.score * 100)}%)
          </span>
        ))}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
        <Field label="This sheet is">
          <select
            className={inputClass}
            value={selection?.docType ?? ''}
            onChange={(event) => onChange({ docType: event.target.value })}
          >
            {docTypes.map((docType) => (
              <option key={docType.key} value={docType.key}>{docType.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Header row" hint="1-based, as Excel shows it.">
          <input
            type="number"
            min={1}
            className={`${inputClass} w-24`}
            value={(selection?.headerRow ?? 0) + 1}
            onChange={(event) => onChange({ headerRow: Math.max(0, Number(event.target.value) - 1) })}
          />
        </Field>
        <Field label="Header rows" hint="2 for a merged header.">
          <select
            className={`${inputClass} w-20`}
            value={selection?.headerSpans ?? 1}
            onChange={(event) => onChange({ headerSpans: Number(event.target.value) })}
          >
            <option value={1}>1</option>
            <option value={2}>2</option>
          </select>
        </Field>
      </div>

      {missing.length ? (
        <div className="mt-3">
          <Alert tone="warn">
            Not mapped yet: <b>{missing.map((field) => field.label).join(', ')}</b>. Rows without these
            cannot be used, so map them below or they will be skipped.
          </Alert>
        </div>
      ) : null}

      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-pmo-100 text-[0.65rem] uppercase tracking-wide text-ink-400">
              <th className="py-1.5 pr-3">Column in your file</th>
              <th className="py-1.5 pr-3">Means</th>
              <th className="py-1.5 pr-3">Confidence</th>
              <th className="py-1.5">First value</th>
            </tr>
          </thead>
          <tbody>
            {selection?.columns?.map((column, index) => {
              const sample = sheet.sample?.[(selection.headerRow ?? 0) + (selection.headerSpans ?? 1)]?.[column.column];
              return (
                <tr key={`${column.column}-${index}`} className="border-b border-pmo-50 last:border-0">
                  <td className="py-1.5 pr-3 font-medium text-ink-700">{column.header || <span className="text-ink-400">(blank)</span>}</td>
                  <td className="py-1.5 pr-3">
                    <select
                      className="w-full max-w-[16rem] rounded border border-pmo-200 bg-white px-2 py-1 text-xs"
                      value={column.field ?? ''}
                      onChange={(event) => {
                        const field = event.target.value || null;
                        onChange({
                          columns: selection.columns.map((item, at) => {
                            if (at === index) return { ...item, field, confidence: field ? 1 : 0 };
                            // A field can only mean one column; taking it frees the other.
                            return field && item.field === field ? { ...item, field: null, confidence: 0 } : item;
                          }),
                        });
                      }}
                    >
                      <option value="">— not imported —</option>
                      {fields.map((field) => (
                        <option key={field.key} value={field.key}>
                          {field.label}{field.required ? ' *' : ''}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-1.5 pr-3 text-ink-400">
                    {column.field ? `${Math.round((column.confidence ?? 0) * 100)}%` : '—'}
                  </td>
                  <td className="py-1.5 text-ink-500">{sample === null || sample === undefined ? '—' : String(sample).slice(0, 40)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {sheet.preview?.issueCount ? (
        <p className="mt-2 text-[0.7rem] text-amber-700">
          {sheet.preview.issueCount} value{sheet.preview.issueCount === 1 ? '' : 's'} could not be read in this
          sheet — for example row {sheet.preview.issues[0].row}: {sheet.preview.issues[0].message}.
        </p>
      ) : null}
      <p className="mt-1 text-[0.7rem] text-ink-400">
        {sheet.preview?.totalRows ?? 0} data rows will be imported
        {sheet.preview?.skipped ? `, ${sheet.preview.skipped} skipped as blank, total or heading rows` : ''}.
      </p>
    </Card>
  );
}
