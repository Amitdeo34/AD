import { handle, json, searchParams } from '@/lib/http';
import { badRequest } from '@/lib/errors';
import { deleteDataset, getDataset, listDatasets } from '@/lib/pmo/store';
import { projectOrThrow } from '@/lib/pmo/service';

export const GET = handle(async (request, { params }) => {
  const { slug } = await params;
  const project = projectOrThrow(slug);
  const p = searchParams(request);
  const id = p.get('id');

  if (id) {
    const dataset = getDataset(id);
    if (!dataset || dataset.projectId !== project.id) throw badRequest('No such upload on this project');
    const limit = Math.min(Number(p.get('limit') ?? 200) || 200, 2000);
    return json({ dataset: { ...dataset, records: dataset.records.slice(0, limit), returned: Math.min(limit, dataset.records.length) } });
  }

  return json({
    datasets: listDatasets(project.id, { docType: p.get('docType') ?? undefined })
      .map(({ records, ...rest }) => ({ ...rest, rowCount: records?.length ?? rest.rowCount })),
  });
});

export const DELETE = handle(async (request, { params }) => {
  const { slug } = await params;
  const project = projectOrThrow(slug);
  const id = searchParams(request).get('id');
  const dataset = getDataset(id);
  if (!dataset || dataset.projectId !== project.id) throw badRequest('No such upload on this project');
  deleteDataset(id);
  return json({ deleted: true });
});
