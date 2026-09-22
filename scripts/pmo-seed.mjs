// Load the worked example project, so the engine can be seen working before
// any real data exists.
//
//   npm run pmo:seed
import { demoProject } from '../lib/pmo/demo.js';
import { createProject, getProject, deleteProject, saveDataset } from '../lib/pmo/store.js';
import { DOC_TYPES } from '../lib/pmo/schema.js';

const SLUG = 'mr-04';

const { project, data } = demoProject();

if (getProject(SLUG)) {
  deleteProject(SLUG);
  console.log(`Replaced the existing "${SLUG}" demo project.`);
}

const created = createProject({ ...project, slug: SLUG });

for (const [docType, records] of Object.entries(data)) {
  if (!records?.length) continue;
  saveDataset({
    projectId: created.id,
    docType,
    fileName: 'demo-data.xlsx',
    sheet: DOC_TYPES[docType].short,
    rowCount: records.length,
    skipped: 0,
    issues: [],
    issueCount: 0,
    mapping: { headerRow: 0, headerSpans: 1, columns: [] },
    fingerprint: `demo-${docType}`,
    records,
  });
  console.log(`  ${DOC_TYPES[docType].short.padEnd(12)} ${String(records.length).padStart(5)} rows`);
}

console.log(`\nDemo project ready at /pmo/${created.slug}`);
console.log('It is a metro rail package, part-built, behind programme, with a monsoon');
console.log('suspension, a missing week of DPRs and work nobody put in the schedule.');
