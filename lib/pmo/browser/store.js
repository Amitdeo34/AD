// Where a project's data lives in a browser tab.
//
// Same document, same rules — `store-core.js` holds both — kept in
// localStorage so a manager can close the laptop and come back to the project
// on Monday. Nothing leaves the machine.
import { createStore, slugify, DEFAULT_THRESHOLDS } from '../store-core.js';

const KEY = 'pmo.engine.v1';

const store = createStore({
  read: () => {
    const raw = globalThis.localStorage?.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  },
  write: (state) => {
    // A large DPR history can exceed the quota; the store reports that once
    // and carries on in memory rather than losing the session.
    globalThis.localStorage?.setItem(KEY, JSON.stringify(state));
  },
});

export const {
  resetPmoStore,
  createProject, listProjects, getProject, updateProject, deleteProject,
  saveDataset, listDatasets, getDataset, deleteDataset, recordsOf,
  saveTemplate, findTemplate, listTemplates,
  saveReport, listReports, getReport,
} = store;

export { slugify, DEFAULT_THRESHOLDS };

/** How much of the browser's storage this project data is using. */
export function storageUsed() {
  try {
    return (globalThis.localStorage?.getItem(KEY)?.length ?? 0) * 2;
  } catch {
    return 0;
  }
}
