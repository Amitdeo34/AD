import { catalogue } from '@/lib/catalogue';
import { handle, json } from '@/lib/http';

export const GET = handle(async () => {
  const c = catalogue();
  const states = c.states.map((state) => {
    const districts = state.districtIds.map((id) => c.districtById.get(id));
    const places = districts.flatMap((d) => d.placeIds.map((id) => c.placeById.get(id)));
    return {
      id: state.id,
      name: state.name,
      slug: state.slug,
      code: state.code,
      kind: state.kind,
      region: state.region,
      capital: state.capital,
      districts: districts.length,
      places: places.length,
      villages: places.filter((p) => p.kind === 'VILLAGE').length,
      properties: places.reduce((n, p) => n + p.propertyIds.length, 0),
    };
  });
  return json({ states });
});
