// Where a project's data lives.
//
// Same deal as the rest of this repo: one small JSON document, held in memory
// and flushed on change, and the only module that touches persistence. Moving
// a PMO with fifty live projects onto Postgres means rewriting this file and
// nothing else.
//
//   PMO_DATA_DIR   where the document is written. Defaults to .data/ locally.
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_THRESHOLDS, resolveThresholds } from './thresholds.js';

const DEFAULT_DIR = process.env.VERCEL ? '/tmp/pmo-engine' : '.data';
const DATA_DIR = process.env.PMO_DATA_DIR ?? process.env.EHB_DATA_DIR ?? DEFAULT_DIR;
const FILE = path.join(DATA_DIR, 'pmo.json');

const EMPTY = { projects: [], datasets: [], templates: [], reports: [], counters: {} };

let state = null;
let writable = true;

function load() {
  if (state) return state;
  try {
    state = { ...structuredClone(EMPTY), ...JSON.parse(fs.readFileSync(FILE, 'utf8')) };
  } catch {
    state = structuredClone(EMPTY);
  }
  return state;
}

function persist() {
  if (!writable) return;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(`${FILE}.tmp`, JSON.stringify(state));
    fs.renameSync(`${FILE}.tmp`, FILE);
  } catch (err) {
    writable = false;
    console.warn(`[pmo] cannot write ${FILE} (${err.code}); data is in memory only`);
  }
}

function nextId(collection) {
  const db = load();
  db.counters[collection] = (db.counters[collection] ?? 0) + 1;
  return db.counters[collection];
}

/** Test hook: drop everything and start again. */
export function resetPmoStore() {
  state = structuredClone(EMPTY);
  writable = true;
  persist();
}

export { DEFAULT_THRESHOLDS };

export function slugify(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'project';
}

// --------------------------------------------------------------- projects

function uniqueSlug(base) {
  const db = load();
  let slug = base;
  let n = 2;
  while (db.projects.some((project) => project.slug === slug)) {
    slug = `${base}-${n}`;
    n += 1;
  }
  return slug;
}

export function createProject(input) {
  const db = load();
  const now = new Date().toISOString();
  const project = {
    id: nextId('projects'),
    slug: uniqueSlug(slugify(input.slug || input.code || input.name)),
    name: input.name,
    code: input.code ?? null,
    client: input.client ?? null,
    contractor: input.contractor ?? null,
    consultant: input.consultant ?? null,
    location: input.location ?? null,
    contractValue: input.contractValue ?? null,
    currency: input.currency ?? 'INR',
    startDate: input.startDate ?? null,
    contractCompletionDate: input.contractCompletionDate ?? null,
    revisedCompletionDate: input.revisedCompletionDate ?? null,
    weekStartsOn: input.weekStartsOn ?? 1,
    reportingLeadName: input.reportingLeadName ?? null,
    thresholds: resolveThresholds(input.thresholds),
    createdAt: now,
    updatedAt: now,
  };
  db.projects.push(project);
  persist();
  return project;
}

export function listProjects() {
  return load().projects.map((project) => ({ ...project }));
}

export function getProject(idOrSlug) {
  const db = load();
  const key = String(idOrSlug);
  const found = db.projects.find((project) => project.slug === key || String(project.id) === key);
  return found ? { ...found } : null;
}

export function updateProject(idOrSlug, patch) {
  const db = load();
  const key = String(idOrSlug);
  const project = db.projects.find((item) => item.slug === key || String(item.id) === key);
  if (!project) return null;
  Object.assign(project, patch, {
    thresholds: resolveThresholds({ ...project.thresholds, ...(patch.thresholds ?? {}) }),
    id: project.id,
    slug: project.slug,
    updatedAt: new Date().toISOString(),
  });
  persist();
  return { ...project };
}

export function deleteProject(idOrSlug) {
  const db = load();
  const project = getProject(idOrSlug);
  if (!project) return false;
  db.projects = db.projects.filter((item) => item.id !== project.id);
  db.datasets = db.datasets.filter((item) => item.projectId !== project.id);
  db.templates = db.templates.filter((item) => item.projectId !== project.id);
  db.reports = db.reports.filter((item) => item.projectId !== project.id);
  persist();
  return true;
}

// --------------------------------------------------------------- datasets

/**
 * A dataset is one confirmed upload: the records it produced, plus everything
 * needed to explain where a number in a report came from.
 */
export function saveDataset(dataset) {
  const db = load();
  const record = {
    id: nextId('datasets'),
    uploadedAt: new Date().toISOString(),
    ...dataset,
  };
  // A re-upload of the same document supersedes the old one rather than
  // double-counting it — the same DPR sent twice is a Monday-morning certainty.
  if (record.replaces) {
    db.datasets = db.datasets.filter((item) => item.id !== record.replaces);
  }
  db.datasets.push(record);
  persist();
  return record;
}

export function listDatasets(projectId, { docType } = {}) {
  return load().datasets
    .filter((dataset) => dataset.projectId === projectId && (!docType || dataset.docType === docType))
    .map((dataset) => ({ ...dataset }));
}

export function getDataset(id) {
  const found = load().datasets.find((dataset) => dataset.id === Number(id));
  return found ? { ...found } : null;
}

export function deleteDataset(id) {
  const db = load();
  const before = db.datasets.length;
  db.datasets = db.datasets.filter((dataset) => dataset.id !== Number(id));
  persist();
  return db.datasets.length < before;
}

/** Every record of a document type across every upload, newest upload last. */
export function recordsOf(projectId, docType) {
  return listDatasets(projectId, { docType }).flatMap((dataset) => dataset.records ?? []);
}

// -------------------------------------------------------------- templates

/**
 * A saved mapping. Keyed by the shape of the header row, so the second time a
 * client sends the same workbook the engine recognises it and the upload is
 * one click.
 */
export function saveTemplate(template) {
  const db = load();
  const existing = db.templates.find(
    (item) => item.projectId === template.projectId
      && item.docType === template.docType
      && item.fingerprint === template.fingerprint,
  );
  if (existing) {
    Object.assign(existing, template, { id: existing.id, usedCount: (existing.usedCount ?? 0) + 1, updatedAt: new Date().toISOString() });
    persist();
    return { ...existing };
  }
  const record = { id: nextId('templates'), usedCount: 1, updatedAt: new Date().toISOString(), ...template };
  db.templates.push(record);
  persist();
  return record;
}

export function findTemplate(projectId, fingerprint) {
  const found = load().templates.find((item) => item.projectId === projectId && item.fingerprint === fingerprint);
  return found ? { ...found } : null;
}

export function listTemplates(projectId) {
  return load().templates.filter((item) => item.projectId === projectId).map((item) => ({ ...item }));
}

// ---------------------------------------------------------------- reports

/** Generated reports are kept so a period can be re-opened exactly as issued. */
export function saveReport(report) {
  const db = load();
  const record = { id: nextId('reports'), generatedAt: new Date().toISOString(), ...report };
  db.reports.push(record);
  // Only the last 200 are worth keeping in a JSON document.
  if (db.reports.length > 200) db.reports = db.reports.slice(-200);
  persist();
  return record;
}

export function listReports(projectId) {
  return load().reports
    .filter((report) => report.projectId === projectId)
    .map(({ pack, ...rest }) => rest)
    .reverse();
}

export function getReport(id) {
  const found = load().reports.find((report) => report.id === Number(id));
  return found ? { ...found } : null;
}
