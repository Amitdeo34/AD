import { suggest } from '@/lib/search';
import { handle, json, searchParams } from '@/lib/http';

export const GET = handle(async (request) => {
  const params = searchParams(request);
  const q = params.get('q') ?? '';
  const limit = Math.min(25, Math.max(1, Number(params.get('limit') ?? 12)));
  return json({ query: q, results: suggest(q, limit) });
});
