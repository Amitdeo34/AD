import { handle, json, body, searchParams } from '@/lib/http';
import { badRequest } from '@/lib/errors';
import { commitUpload, inspectUpload } from '@/lib/pmo/ingest/pipeline';
import { projectOrThrow } from '@/lib/pmo/service';
import { DOC_TYPE_KEYS } from '@/lib/pmo/schema';

// Big enough for a year of DPRs in one workbook, small enough that a mis-drag
// of a video file fails fast rather than filling the disk.
const MAX_BYTES = 25 * 1024 * 1024;

// The file is held for the round trip between inspecting and committing, so
// the manager confirms a mapping without having to upload twice. Entries are
// small, short-lived and dropped as soon as they are used or age out.
const pending = new Map();
const TTL_MS = 30 * 60 * 1000;

function remember(buffer, fileName) {
  const token = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  pending.set(token, { buffer, fileName, at: Date.now() });
  for (const [key, entry] of pending) if (Date.now() - entry.at > TTL_MS) pending.delete(key);
  return token;
}

/**
 * Two calls, one upload.
 *
 * `POST` with a file inspects it and proposes a mapping. `POST` with the
 * returned token and the confirmed selections stores the records.
 */
export const POST = handle(async (request, { params }) => {
  const { slug } = await params;
  const project = projectOrThrow(slug);
  const contentType = request.headers.get('content-type') ?? '';

  if (contentType.includes('multipart/form-data')) {
    const form = await request.formData();
    const file = form.get('file');
    if (!file || typeof file === 'string') throw badRequest('Attach a file to upload');
    if (file.size > MAX_BYTES) throw badRequest(`That file is ${(file.size / 1024 / 1024).toFixed(1)} MB; the limit is 25 MB. Split it by month, or upload the sheets separately.`);

    const buffer = Buffer.from(await file.arrayBuffer());
    const docTypeHint = form.get('docType');
    if (docTypeHint && !DOC_TYPE_KEYS.includes(String(docTypeHint))) throw badRequest('Unknown document type');

    let inspection;
    try {
      inspection = inspectUpload({
        fileName: file.name,
        buffer,
        projectId: project.id,
        docTypeHint: docTypeHint ? String(docTypeHint) : undefined,
      });
    } catch (err) {
      throw badRequest(err.message);
    }

    return json({ token: remember(buffer, file.name), ...inspection });
  }

  const input = await body(request);
  const held = pending.get(input.token);
  if (!held) throw badRequest('That upload has expired. Choose the file again.');
  if (!Array.isArray(input.selections) || !input.selections.length) throw badRequest('Choose at least one sheet to import');
  for (const selection of input.selections) {
    if (!DOC_TYPE_KEYS.includes(selection.docType)) throw badRequest(`Unknown document type "${selection.docType}"`);
    if (!Array.isArray(selection.columns)) throw badRequest('Each sheet needs its column mapping');
  }

  const datasets = commitUpload({
    projectId: project.id,
    fileName: held.fileName,
    buffer: held.buffer,
    selections: input.selections,
    rememberMapping: input.rememberMapping !== false,
    replaces: input.replaces ?? null,
  });
  pending.delete(input.token);

  return json({
    datasets: datasets.map(({ records, ...rest }) => rest),
    imported: datasets.reduce((total, dataset) => total + dataset.rowCount, 0),
  }, { status: 201 });
});

export const GET = handle(async (request) => json({ pending: pending.has(searchParams(request).get('token') ?? '') }));
