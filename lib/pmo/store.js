// Where a project's data lives on a server.
//
// One small JSON document, held in memory and flushed on change. The rules are
// in `store-core.js`; this file is only the disk. Moving a PMO with fifty live
// projects onto Postgres means rewriting the two functions below.
//
//   PMO_DATA_DIR   where the document is written. Defaults to .data/ locally.
import fs from 'node:fs';
import path from 'node:path';
import { createStore, slugify, DEFAULT_THRESHOLDS } from './store-core.js';

const DEFAULT_DIR = process.env.VERCEL ? '/tmp/pmo-engine' : '.data';
const DATA_DIR = process.env.PMO_DATA_DIR ?? process.env.EHB_DATA_DIR ?? DEFAULT_DIR;
const FILE = path.join(DATA_DIR, 'pmo.json');

const store = createStore({
  read: () => JSON.parse(fs.readFileSync(FILE, 'utf8')),
  write: (state) => {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(`${FILE}.tmp`, JSON.stringify(state));
    fs.renameSync(`${FILE}.tmp`, FILE);
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
