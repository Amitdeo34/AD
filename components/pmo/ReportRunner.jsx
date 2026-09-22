'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { pmo } from '@/lib/pmo/client';
import { Alert, Badge, Button, Card, Field, Stat, inputClass, isoToday, percent, shortDate } from './ui';

const PERIOD_HELP = {
  week: 'Defaults to the week containing the data date.',
  month: 'Defaults to the calendar month containing the data date.',
  quarter: 'Defaults to the Indian financial quarter containing the data date.',
  day: 'A single day — the DPR for that date.',
  'to-date': 'The whole project, up to the data date.',
};

/** Choose a report, a period and a format, then take the file away. */
export default function ReportRunner({ slug }) {
  const search = useSearchParams();
  const [meta, setMeta] = useState(null);
  const [overview, setOverview] = useState(null);
  const [type, setType] = useState(search.get('type') ?? 'weekly-exception');
  const [form, setForm] = useState({ asOf: '', from: '', to: '', purpose: '', date: '', areas: [] });
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([pmo.meta(), pmo.project(slug)])
      .then(([metaData, overviewData]) => {
        setMeta(metaData);
        setOverview(overviewData);
        if (overviewData.position?.asOf) {
          setForm((state) => ({ ...state, asOf: String(overviewData.position.asOf).slice(0, 10) }));
        }
      })
      .catch((err) => setError(err.message));
  }, [slug]);

  const spec = meta?.reportTypes.find((entry) => entry.key === type);
  const readiness = overview?.available.find((entry) => entry.key === type);

  const params = useMemo(() => ({
    type,
    asOf: form.asOf || undefined,
    from: form.from || undefined,
    to: form.to || undefined,
    purpose: spec?.options?.includes('purpose') ? form.purpose || undefined : undefined,
    date: spec?.options?.includes('date') ? form.date || undefined : undefined,
    areas: spec?.options?.includes('areas') && form.areas.length ? form.areas : undefined,
  }), [type, form, spec]);

  async function runPreview() {
    setBusy(true);
    setError(null);
    try {
      setPreview(await pmo.report(slug, params));
    } catch (err) {
      setError(err.message);
      setPreview(null);
    } finally {
      setBusy(false);
    }
  }

  const link = (format, extra = {}) => pmo.reportUrl(slug, { ...params, format, ...extra });

  return (
    <div className="grid gap-4 lg:grid-cols-[22rem_minmax(0,1fr)]">
      <div className="grid content-start gap-4">
        <Card title="Report">
          <div className="grid gap-3">
            <Field label="Type">
              <select className={inputClass} value={type} onChange={(event) => { setType(event.target.value); setPreview(null); }}>
                {meta?.reportTypes.map((entry) => (
                  <option key={entry.key} value={entry.key}>{entry.label}</option>
                ))}
              </select>
            </Field>
            {spec ? <p className="text-xs leading-relaxed text-ink-500">{spec.description}</p> : null}

            {readiness && !readiness.ready ? (
              <Alert tone="warn">Upload {readiness.missing.join(' and ')} before generating this report.</Alert>
            ) : null}
            {readiness?.enriches?.length ? (
              <p className="text-[0.7rem] text-ink-400">
                Also uses, if you upload it: {readiness.enriches.join(', ')}.
              </p>
            ) : null}

            <Field label="Data date" hint="Everything is reported “as at” this date. Defaults to the latest DPR.">
              <input type="date" className={inputClass} value={form.asOf} max={isoToday()}
                onChange={(event) => setForm((state) => ({ ...state, asOf: event.target.value }))} />
            </Field>

            {spec?.period === 'day' ? (
              <Field label="DPR date">
                <input type="date" className={inputClass} value={form.date}
                  onChange={(event) => setForm((state) => ({ ...state, date: event.target.value }))} />
              </Field>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Period from">
                  <input type="date" className={inputClass} value={form.from}
                    onChange={(event) => setForm((state) => ({ ...state, from: event.target.value }))} />
                </Field>
                <Field label="Period to">
                  <input type="date" className={inputClass} value={form.to}
                    onChange={(event) => setForm((state) => ({ ...state, to: event.target.value }))} />
                </Field>
              </div>
            )}
            {spec ? <p className="-mt-1 text-[0.7rem] text-ink-400">{PERIOD_HELP[spec.period]} Leave blank to use it.</p> : null}

            {spec?.options?.includes('purpose') ? (
              <Field label="Purpose" hint="Printed at the top, so the reader knows why they have it.">
                <input className={inputClass} value={form.purpose} placeholder="For the monthly client review"
                  onChange={(event) => setForm((state) => ({ ...state, purpose: event.target.value }))} />
              </Field>
            ) : null}

            {spec?.options?.includes('areas') && overview?.position?.areas?.length ? (
              <fieldset>
                <legend className="text-xs font-semibold text-ink-700">Areas</legend>
                <p className="mb-1 text-[0.7rem] text-ink-400">None ticked means every area.</p>
                <div className="grid gap-1">
                  {overview.position.areas.map((area) => (
                    <label key={area.name} className="flex items-center gap-2 text-xs text-ink-700">
                      <input
                        type="checkbox"
                        className="size-3.5 accent-[#10284b]"
                        checked={form.areas.includes(area.name)}
                        onChange={(event) => setForm((state) => ({
                          ...state,
                          areas: event.target.checked
                            ? [...state.areas, area.name]
                            : state.areas.filter((name) => name !== area.name),
                        }))}
                      />
                      {area.name}
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : null}

            <Button onClick={runPreview} disabled={busy || (readiness && !readiness.ready)}>
              {busy ? 'Generating…' : 'Generate'}
            </Button>
          </div>
        </Card>

        <Card title="Take it away">
          <div className="grid gap-2">
            <Button as="a" href={link('html', { inline: 'true', store: 'true' })} target="_blank" rel="noreferrer" variant="secondary">
              Open the report (print to PDF)
            </Button>
            <Button as="a" href={link('xlsx')} variant="secondary">Excel workbook</Button>
            <Button as="a" href={link('docx')} variant="secondary">Word document</Button>
            <Button as="a" href={link('csv')} variant="secondary">Exceptions as CSV</Button>
            {type === 'schedule-update' ? (
              <Button as="a" href={link('p6')} variant="secondary">Schedule for P6 / MS Project</Button>
            ) : null}
          </div>
          <p className="mt-2 text-[0.7rem] text-ink-400">
            Every format is generated from the same numbers, at the moment you click.
          </p>
        </Card>
      </div>

      <div className="grid content-start gap-4">
        {error ? <Alert>{error}</Alert> : null}
        {!preview ? (
          <Card title="Preview">
            <p className="text-sm text-ink-400">
              Choose a period and press Generate. The preview shows the headline measures, the
              exceptions and the contents; the full report opens in a new tab.
            </p>
          </Card>
        ) : (
          <Preview preview={preview} />
        )}
      </div>
    </div>
  );
}

function Preview({ preview }) {
  const { pack, readiness } = preview;
  const exceptions = pack.exceptions ?? [];

  return (
    <>
      <Card title={pack.title} subtitle={pack.subtitle}>
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          {pack.kpis.map((kpi) => (
            <Stat key={kpi.label} label={kpi.label} value={kpi.value} sub={kpi.sub}
              tone={{ red: 'bad', amber: 'warn', green: 'good' }[kpi.tone] ?? 'none'} />
          ))}
        </div>
        <p className="mt-3 text-[0.7rem] text-ink-400">
          {pack.sections.length} sections · data readiness {readiness.score}/100 ({readiness.grade})
        </p>
      </Card>

      <Card title={`Exceptions (${exceptions.length})`} subtitle="Most severe first. Each one names its measure, its owner and the action.">
        {exceptions.length ? (
          <ul className="grid gap-2.5">
            {exceptions.slice(0, 25).map((item) => (
              <li key={item.id} className="rounded-lg border border-pmo-100 px-3 py-2.5">
                <div className="flex flex-wrap items-baseline gap-2">
                  <Badge tone={item.severity}>{item.severity}</Badge>
                  <span className="text-sm font-semibold text-pmo-700">{item.title}</span>
                  <span className="text-[0.7rem] text-ink-400">
                    {item.category}{item.area ? ` · ${item.area}` : ''}{item.isNew ? ' · new' : ` · ${item.trend}`}
                  </span>
                  {item.metricDisplay ? <span className="ml-auto text-xs font-bold tabular-nums text-ink-700">{item.metricDisplay}</span> : null}
                </div>
                <p className="mt-1 text-xs font-medium text-ink-700">{item.subject}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-ink-500">{item.detail}</p>
                <p className="mt-1.5 rounded bg-pmo-50 px-2 py-1.5 text-xs text-pmo-700">
                  <b>Action:</b> {item.recommendation}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-400">Nothing breached the agreed thresholds this period.</p>
        )}
      </Card>

      <Card title="Contents">
        <ol className="grid gap-1 text-sm text-ink-700">
          {pack.sections.map((section, index) => (
            <li key={section.id}>
              <span className="mr-2 text-ink-400">{index + 1}</span>{section.title}
              <span className="ml-2 text-[0.7rem] text-ink-400">
                {section.blocks.length} block{section.blocks.length === 1 ? '' : 's'}
              </span>
            </li>
          ))}
        </ol>
      </Card>
    </>
  );
}
