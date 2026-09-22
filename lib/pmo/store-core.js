// What a project's data *is*, independent of where it is kept.
//
// The server writes a JSON file; a browser tab writes localStorage. Both are
// the same document with the same rules, so the rules live here and each host
// supplies two functions: read it, write it.
import { DEFAULT_THRESHOLDS, resolveThresholds } from './thresholds.js';

export const EMPTY = { projects: [], datasets: [], templates: [], reports: [], counters: {} };

export function slugify(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'project';
}

/**
 * Build a store over a persistence pair.
 *
 * @param read   () => the stored document, or null
 * @param write  (document) => void; may throw, and a throw is not fatal
 */
export function createStore({ read, write }) {
  let state = null;
  let writable = true;

  function load() {
    if (state) return state;
    try {
      const stored = read();
      state = stored ? { ...structuredClone(EMPTY), ...stored } : structuredClone(EMPTY);
    } catch {
      state = structuredClone(EMPTY);
    }
    return state;
  }

  function persist() {
    if (!writable) return;
    try {
      write(state);
    } catch (err) {
      // A read-only filesystem or a full quota is not fatal: the session keeps
      // working from memory, and the operator is told once.
      writable = false;
      console.warn(`[pmo] cannot save data (${err.code ?? err.name ?? 'unknown'}); it is in memory only`);
    }
  }

  function nextId(collection) {
    const db = load();
    db.counters[collection] = (db.counters[collection] ?? 0) + 1;
    return db.counters[collection];
  }

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

  return {
    /** Test hook: drop everything and start again. */
    resetPmoStore() {
      state = structuredClone(EMPTY);
      writable = true;
      persist();
    },

    // ------------------------------------------------------------ projects

    createProject(input) {
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
    },

    listProjects: () => load().projects.map((project) => ({ ...project })),

    getProject(idOrSlug) {
      const key = String(idOrSlug);
      const found = load().projects.find((project) => project.slug === key || String(project.id) === key);
      return found ? { ...found } : null;
    },

    updateProject(idOrSlug, patch) {
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
    },

    deleteProject(idOrSlug) {
      const db = load();
      const key = String(idOrSlug);
      const project = db.projects.find((item) => item.slug === key || String(item.id) === key);
      if (!project) return false;
      db.projects = db.projects.filter((item) => item.id !== project.id);
      db.datasets = db.datasets.filter((item) => item.projectId !== project.id);
      db.templates = db.templates.filter((item) => item.projectId !== project.id);
      db.reports = db.reports.filter((item) => item.projectId !== project.id);
      persist();
      return true;
    },

    // ------------------------------------------------------------ datasets

    /**
     * One confirmed upload: the records it produced, plus everything needed to
     * explain where a number in a report came from.
     */
    saveDataset(dataset) {
      const db = load();
      const record = { id: nextId('datasets'), uploadedAt: new Date().toISOString(), ...dataset };
      // The same DPR sent twice is a Monday-morning certainty, so a re-upload
      // supersedes rather than doubles.
      if (record.replaces) db.datasets = db.datasets.filter((item) => item.id !== record.replaces);
      db.datasets.push(record);
      persist();
      return record;
    },

    listDatasets(projectId, { docType } = {}) {
      return load().datasets
        .filter((dataset) => dataset.projectId === projectId && (!docType || dataset.docType === docType))
        .map((dataset) => ({ ...dataset }));
    },

    getDataset(id) {
      const found = load().datasets.find((dataset) => dataset.id === Number(id));
      return found ? { ...found } : null;
    },

    deleteDataset(id) {
      const db = load();
      const before = db.datasets.length;
      db.datasets = db.datasets.filter((dataset) => dataset.id !== Number(id));
      persist();
      return db.datasets.length < before;
    },

    /** Every record of a document type across every upload. */
    recordsOf(projectId, docType) {
      return load().datasets
        .filter((dataset) => dataset.projectId === projectId && dataset.docType === docType)
        .flatMap((dataset) => dataset.records ?? []);
    },

    // ----------------------------------------------------------- templates

    /**
     * A saved mapping, keyed by the shape of the header row — so the second
     * time a client sends the same workbook, the upload is one click.
     */
    saveTemplate(template) {
      const db = load();
      const existing = db.templates.find(
        (item) => item.projectId === template.projectId
          && item.docType === template.docType
          && item.fingerprint === template.fingerprint,
      );
      if (existing) {
        Object.assign(existing, template, {
          id: existing.id,
          usedCount: (existing.usedCount ?? 0) + 1,
          updatedAt: new Date().toISOString(),
        });
        persist();
        return { ...existing };
      }
      const record = { id: nextId('templates'), usedCount: 1, updatedAt: new Date().toISOString(), ...template };
      db.templates.push(record);
      persist();
      return record;
    },

    findTemplate(projectId, fingerprint) {
      const found = load().templates.find((item) => item.projectId === projectId && item.fingerprint === fingerprint);
      return found ? { ...found } : null;
    },

    listTemplates: (projectId) => load().templates.filter((item) => item.projectId === projectId).map((item) => ({ ...item })),

    // ------------------------------------------------------------- reports

    /** Generated reports are kept so the next period can tell what changed. */
    saveReport(report) {
      const db = load();
      const record = { id: nextId('reports'), generatedAt: new Date().toISOString(), ...report };
      db.reports.push(record);
      if (db.reports.length > 200) db.reports = db.reports.slice(-200);
      persist();
      return record;
    },

    listReports: (projectId) => load().reports
      .filter((report) => report.projectId === projectId)
      .map(({ pack, ...rest }) => rest)
      .reverse(),

    getReport(id) {
      const found = load().reports.find((report) => report.id === Number(id));
      return found ? { ...found } : null;
    },
  };
}

export { DEFAULT_THRESHOLDS };
