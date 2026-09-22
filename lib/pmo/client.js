'use client';

// Browser-side client for the reporting engine.
import { ApiError } from '@/lib/api-client';

const BASE = (process.env.NEXT_PUBLIC_API_BASE ?? '').replace(/\/$/, '');

async function request(method, path, { body, form } = {}) {
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: form ?? (body ? JSON.stringify(body) : undefined),
    });
  } catch {
    throw new ApiError(0, 'Could not reach the server. Check your connection and try again.');
  }
  const contentType = res.headers.get('content-type') ?? '';
  const text = contentType.includes('json') ? await res.text() : null;
  const payload = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, payload?.error ?? `Request failed (${res.status})`, payload?.details);
  return payload;
}

const qs = (params = {}) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, Array.isArray(value) ? value.join('|') : String(value));
  }
  const out = search.toString();
  return out ? `?${out}` : '';
};

export const pmo = {
  meta: () => request('GET', '/api/pmo/meta'),
  projects: () => request('GET', '/api/pmo/projects'),
  createProject: (body) => request('POST', '/api/pmo/projects', { body }),
  project: (slug) => request('GET', `/api/pmo/projects/${slug}`),
  updateProject: (slug, body) => request('PATCH', `/api/pmo/projects/${slug}`, { body }),
  deleteProject: (slug) => request('DELETE', `/api/pmo/projects/${slug}`),

  inspect: (slug, file, docType) => {
    const form = new FormData();
    form.set('file', file);
    if (docType) form.set('docType', docType);
    return request('POST', `/api/pmo/projects/${slug}/upload`, { form });
  },
  commit: (slug, body) => request('POST', `/api/pmo/projects/${slug}/upload`, { body }),

  datasets: (slug, params) => request('GET', `/api/pmo/projects/${slug}/data${qs(params)}`),
  deleteDataset: (slug, id) => request('DELETE', `/api/pmo/projects/${slug}/data${qs({ id })}`),

  /** The URL a report is fetched or downloaded from — used directly as a link. */
  reportUrl: (slug, params) => `${BASE}/api/pmo/projects/${slug}/report${qs(params)}`,
  report: (slug, params) => request('GET', `/api/pmo/projects/${slug}/report${qs({ ...params, format: 'json' })}`),
};

export { ApiError };
