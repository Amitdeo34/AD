import { handle, json, body } from '@/lib/http';
import { badRequest } from '@/lib/errors';
import { createProject, listProjects, listDatasets } from '@/lib/pmo/store';

export const GET = handle(async () => json({
  projects: listProjects().map((project) => ({
    ...project,
    datasetCount: listDatasets(project.id).length,
  })),
}));

export const POST = handle(async (request) => {
  const input = await body(request);
  if (!input.name || String(input.name).trim().length < 2) {
    throw badRequest('Give the project a name');
  }
  const numeric = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(String(value).replace(/[₹,\s]/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  };
  return json({
    project: createProject({
      ...input,
      name: String(input.name).trim(),
      contractValue: numeric(input.contractValue),
    }),
  }, { status: 201 });
});
