import { handle, json, body } from '@/lib/http';
import { deleteProject, updateProject } from '@/lib/pmo/store';
import { projectOrThrow, projectOverview } from '@/lib/pmo/service';

export const GET = handle(async (_request, { params }) => {
  const { slug } = await params;
  return json(projectOverview(projectOrThrow(slug)));
});

export const PATCH = handle(async (request, { params }) => {
  const { slug } = await params;
  const project = projectOrThrow(slug);
  return json({ project: updateProject(project.slug, await body(request)) });
});

export const DELETE = handle(async (_request, { params }) => {
  const { slug } = await params;
  const project = projectOrThrow(slug);
  deleteProject(project.slug);
  return json({ deleted: true });
});
