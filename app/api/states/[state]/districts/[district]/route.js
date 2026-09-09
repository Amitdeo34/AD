import { catalogue, stateBySlugOrCode, districtIn } from '@/lib/catalogue';
import { handle, json } from '@/lib/http';
import { notFound } from '@/lib/errors';

export const GET = handle(async (_request, { params }) => {
  const { state: stateSlug, district: districtSlug } = await params;
  const state = stateBySlugOrCode(stateSlug);
  if (!state) throw notFound('No such state or union territory');
  const district = districtIn(state, districtSlug);
  if (!district) throw notFound('No such district in this state');

  const c = catalogue();
  const places = district.placeIds
    .map((id) => c.placeById.get(id))
    .map((place) => ({
      id: place.id,
      name: place.name,
      slug: place.slug,
      kind: place.kind,
      isHq: place.isHq,
      knownFor: place.knownFor,
      properties: place.propertyIds.length,
      fromPrice: place.propertyIds.length
        ? Math.min(...place.propertyIds.map((id) => c.propertyById.get(id).basePrice))
        : null,
    }))
    .sort((a, b) => Number(b.isHq) - Number(a.isHq) || a.name.localeCompare(b.name));

  return json({
    state: { name: state.name, slug: state.slug, code: state.code },
    district: { id: district.id, name: district.name, slug: district.slug },
    places,
  });
});
