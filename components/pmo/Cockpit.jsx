'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { pmo } from '@/lib/pmo/client';
import { Alert, Badge, Button, Card, Empty, Readiness, Stat, percent, shortDate } from './ui';

/** The project's home: where it stands, what data is in, what is missing. */
export default function Cockpit({ slug }) {
  const [overview, setOverview] = useState(null);
  const [error, setError] = useState(null);

  const reload = () => pmo.project(slug).then(setOverview).catch((err) => setError(err.message));
  useEffect(() => { reload(); }, [slug]);

  if (error) return <Alert>{error}</Alert>;
  if (!overview) return <p className="text-sm text-ink-400">Loading…</p>;

  const { project, position, readiness, datasets, available, counts } = overview;
  const rag = !position ? null
    : position.variancePercent <= -0.15 ? 'Red'
      : position.variancePercent <= -0.05 ? 'Amber' : 'Green';

  return (
    <div className="grid gap-4">
      {!datasets.length ? (
        <Empty title="No data uploaded yet">
          Upload the client&apos;s DPR to start.{' '}
          <Link href={`/pmo/${slug}/upload`} className="font-semibold text-pmo-600 underline">Upload data</Link>
        </Empty>
      ) : null}

      {position ? (
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Status" value={rag} sub={`Variance ${percent(position.variancePercent)}`}
            tone={rag === 'Red' ? 'bad' : rag === 'Amber' ? 'warn' : 'good'} />
          <Stat label="Physical progress" value={percent(position.actualPercent)}
            sub={`Planned ${percent(position.plannedPercent)}`} />
          <Stat label="Forecast completion" value={shortDate(position.forecastFinish)}
            sub={position.baselineFinish ? `Contract ${shortDate(position.baselineFinish)}` : 'No contract date set'}
            tone={(position.delayDays ?? 0) > 30 ? 'bad' : (position.delayDays ?? 0) > 0 ? 'warn' : 'good'} />
          <Stat label="Slippage" value={Number.isFinite(position.delayDays) ? `${position.delayDays} days` : '—'}
            sub={`Data date ${shortDate(position.asOf)}`}
            tone={(position.delayDays ?? 0) > 30 ? 'bad' : (position.delayDays ?? 0) > 0 ? 'warn' : 'good'} />
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card title="Reports" subtitle="Generated from the current uploads every time — never a stale snapshot.">
          <div className="grid gap-2.5 sm:grid-cols-2">
            {available.map((report) => (
              <div key={report.key} className={`rounded-lg border px-3.5 py-3 ${report.ready ? 'border-pmo-100 bg-white' : 'border-dashed border-pmo-200 bg-pmo-50/50'}`}>
                <div className="flex items-start gap-2">
                  <h3 className="text-sm font-bold text-pmo-700">{report.label}</h3>
                  {!report.ready ? <Badge tone="Amber">Needs data</Badge> : null}
                </div>
                <p className="mt-1 text-xs leading-relaxed text-ink-500">{report.description}</p>
                {report.ready ? (
                  <Button as={Link} href={`/pmo/${slug}/reports?type=${report.key}`} variant="secondary" className="mt-2.5 !py-1.5 !text-xs">
                    Generate
                  </Button>
                ) : (
                  <p className="mt-2 text-[0.7rem] font-medium text-amber-700">
                    Upload {report.missing.join(' and ')} first.
                  </p>
                )}
              </div>
            ))}
          </div>
        </Card>

        <div className="grid gap-4 content-start">
          <Card title="Data readiness" subtitle="How far the uploads can be trusted to report from.">
            <Readiness score={readiness.score} grade={readiness.grade} counts={readiness.counts} />
            {readiness.findings.length ? (
              <ul className="mt-3 grid gap-2">
                {readiness.findings.slice(0, 5).map((finding, index) => (
                  <li key={index} className="border-l-2 border-pmo-200 pl-2.5">
                    <p className="text-xs font-semibold text-ink-700">{finding.message}</p>
                    <p className="text-[0.7rem] text-ink-400">{finding.fix}</p>
                  </li>
                ))}
              </ul>
            ) : null}
          </Card>

          <Card title="Project" action={<Button as={Link} href={`/pmo/${slug}/upload`} variant="secondary" className="!py-1.5 !text-xs">Upload</Button>}>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
              {[
                ['Client', project.client],
                ['Contractor', project.contractor],
                ['Contract value', project.contractValue ? `₹${(project.contractValue / 1e7).toFixed(2)} Cr` : null],
                ['Commencement', project.startDate ? shortDate(project.startDate) : null],
                ['Contract completion', project.contractCompletionDate ? shortDate(project.contractCompletionDate) : null],
                ['Weighting basis', position?.weightBasis],
                ['Activities', position?.activityCount],
                ['DPR coverage', position?.coverage?.coverage ? percent(position.coverage.coverage, 0) : null],
              ].filter(([, value]) => value !== null && value !== undefined).map(([label, value]) => (
                <div key={label}>
                  <dt className="text-[0.65rem] uppercase tracking-wide text-ink-400">{label}</dt>
                  <dd className="font-semibold text-ink-700">{value}</dd>
                </div>
              ))}
            </dl>
          </Card>
        </div>
      </div>

      {position?.areas?.length ? (
        <Card title="Areas and packages">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-[0.65rem] uppercase tracking-wide text-ink-400">
                <tr className="border-b border-pmo-100">
                  <th className="py-1.5 pr-3">Area</th>
                  <th className="py-1.5 pr-3 text-right">Weight</th>
                  <th className="py-1.5 pr-3 text-right">Planned</th>
                  <th className="py-1.5 pr-3 text-right">Actual</th>
                  <th className="py-1.5 pr-3 text-right">Variance</th>
                  <th className="py-1.5 pr-3 text-right">Worst slip</th>
                  <th className="py-1.5">Forecast finish</th>
                </tr>
              </thead>
              <tbody>
                {position.areas.map((area) => (
                  <tr key={area.name} className="border-b border-pmo-50 last:border-0">
                    <td className="py-1.5 pr-3 font-medium text-ink-700">{area.name}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{percent(area.weight)}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{percent(area.plannedPercent)}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{percent(area.actualPercent)}</td>
                    <td className={`py-1.5 pr-3 text-right tabular-nums font-semibold ${area.variancePercent < -0.05 ? 'text-rose-700' : area.variancePercent < 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                      {percent(area.variancePercent)}
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{Number.isFinite(area.worstSlippageDays) ? `${area.worstSlippageDays} d` : '—'}</td>
                    <td className="py-1.5">{shortDate(area.forecastFinish)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      <Card title="Uploaded data" subtitle={`${datasets.length} upload${datasets.length === 1 ? '' : 's'}`}>
        {datasets.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-[0.65rem] uppercase tracking-wide text-ink-400">
                <tr className="border-b border-pmo-100">
                  <th className="py-1.5 pr-3">Document</th>
                  <th className="py-1.5 pr-3">File</th>
                  <th className="py-1.5 pr-3 text-right">Rows</th>
                  <th className="py-1.5 pr-3">Uploaded</th>
                  <th className="py-1.5" />
                </tr>
              </thead>
              <tbody>
                {datasets.map((dataset) => (
                  <tr key={dataset.id} className="border-b border-pmo-50 last:border-0">
                    <td className="py-1.5 pr-3 font-medium text-ink-700">{dataset.docType}</td>
                    <td className="py-1.5 pr-3 text-ink-500">{dataset.fileName} <span className="text-ink-400">· {dataset.sheet}</span></td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{dataset.rowCount}</td>
                    <td className="py-1.5 pr-3 text-ink-400">{shortDate(dataset.uploadedAt)}</td>
                    <td className="py-1.5 text-right">
                      <button
                        type="button"
                        className="text-rose-700 hover:underline"
                        onClick={async () => {
                          await pmo.deleteDataset(slug, dataset.id);
                          reload();
                        }}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-ink-400">Nothing uploaded yet.</p>
        )}
      </Card>
    </div>
  );
}
