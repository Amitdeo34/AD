import { catalogue, stateBySlugOrCode } from '@/lib/catalogue';
import { handle, json } from '@/lib/http';
import { notFound } from '@/lib/errors';

export const GET = handle(async (_request, { params }) => {
  const { state: slug } = await params;
  const state = stateBySlugOrCode(slug);
  if (!state) throw notFound('No such state or union territory');
  const c = catalogue();

  const districts = state.districtIds.map((id) => {
    const district = c.districtById.get(id);
    const places = district.placeIds.map((pid) => c.placeById.get(pid));
    return {
      id: district.id,
      name: district.name,
      slug: district.slug,
      places: places.length,
      villages: places.filter((p) => p.kind === 'VILLAGE').length,
      properties: places.reduce((n, p) => n + p.propertyIds.length, 0),
    };
  });

  return json({
    state: { id: state.id, name: state.name, slug: state.slug, code: state.code, kind: state.kind, region: state.region, capital: state.capital },
    districts,
  });
});
