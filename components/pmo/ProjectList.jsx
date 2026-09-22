'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { pmo } from '@/lib/pmo/client';
import { Alert, Button, Card, Empty, Field, inputClass, shortDate } from './ui';

export default function ProjectList() {
  const [projects, setProjects] = useState(null);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    pmo.projects().then((data) => setProjects(data.projects)).catch((err) => setError(err.message));
  }, []);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-pmo-700">Projects</h1>
          <p className="mt-1 text-sm text-ink-500">
            Every project keeps its own uploads, thresholds and report history.
          </p>
        </div>
        <Button className="ml-auto" onClick={() => setCreating((open) => !open)}>
          {creating ? 'Cancel' : 'New project'}
        </Button>
      </div>

      {error ? <div className="mt-4"><Alert>{error}</Alert></div> : null}

      {creating ? (
        <div className="mt-5">
          <NewProject onCreated={(project) => setProjects((list) => [...(list ?? []), project])} />
        </div>
      ) : null}

      <div className="mt-5 grid gap-3">
        {projects === null ? <p className="text-sm text-ink-400">Loading…</p> : null}
        {projects?.length === 0 && !creating ? (
          <Empty title="No projects yet">
            Create one, then upload the client&apos;s DPR. Everything else follows from that.
          </Empty>
        ) : null}
        {projects?.map((project) => (
          <Link
            key={project.id}
            href={`/pmo/${project.slug}`}
            className="block rounded-xl border border-pmo-100 bg-white px-4 py-3.5 shadow-sm transition hover:border-pmo-300 hover:shadow"
          >
            <div className="flex flex-wrap items-baseline gap-2">
              <h2 className="font-bold text-pmo-700">{project.name}</h2>
              {project.code ? <span className="rounded bg-pmo-50 px-1.5 py-0.5 text-[0.65rem] font-semibold text-pmo-600">{project.code}</span> : null}
            </div>
            <p className="mt-0.5 text-sm text-ink-500">
              {[project.client, project.contractor, project.location].filter(Boolean).join(' · ') || 'No client details yet'}
            </p>
            <p className="mt-1.5 text-xs text-ink-400">
              {project.datasetCount} upload{project.datasetCount === 1 ? '' : 's'}
              {project.contractCompletionDate ? ` · contract completion ${shortDate(project.contractCompletionDate)}` : ''}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}

function NewProject({ onCreated }) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: '', code: '', client: '', contractor: '', consultant: '', location: '',
    contractValue: '', startDate: '', contractCompletionDate: '',
  });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const set = (key) => (event) => setForm((state) => ({ ...state, [key]: event.target.value }));

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { project } = await pmo.createProject(form);
      onCreated(project);
      router.push(`/pmo/${project.slug}/upload`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <Card title="New project" subtitle="Only the name is required — the rest sharpens the reports.">
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <Field label="Project name">
          <input className={inputClass} value={form.name} onChange={set('name')} required placeholder="Metro Rail Package MR-04" />
        </Field>
        <Field label="Project code">
          <input className={inputClass} value={form.code} onChange={set('code')} placeholder="MR-04" />
        </Field>
        <Field label="Client">
          <input className={inputClass} value={form.client} onChange={set('client')} />
        </Field>
        <Field label="Contractor">
          <input className={inputClass} value={form.contractor} onChange={set('contractor')} />
        </Field>
        <Field label="Prepared by" hint="Appears on the cover of every report.">
          <input className={inputClass} value={form.consultant} onChange={set('consultant')} placeholder="Project Management Consultant" />
        </Field>
        <Field label="Location">
          <input className={inputClass} value={form.location} onChange={set('location')} />
        </Field>
        <Field label="Contract value (₹)" hint="Used as the budget at completion for earned value.">
          <input className={inputClass} value={form.contractValue} onChange={set('contractValue')} inputMode="decimal" placeholder="1026420000" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Commencement">
            <input type="date" className={inputClass} value={form.startDate} onChange={set('startDate')} />
          </Field>
          <Field label="Contract completion">
            <input type="date" className={inputClass} value={form.contractCompletionDate} onChange={set('contractCompletionDate')} />
          </Field>
        </div>
        {error ? <div className="sm:col-span-2"><Alert>{error}</Alert></div> : null}
        <div className="sm:col-span-2">
          <Button type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create and upload data'}</Button>
        </div>
      </form>
    </Card>
  );
}
