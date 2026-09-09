import { searchProperties, PROPERTY_KINDS } from '@/lib/search';
import { handle, json, searchParams } from '@/lib/http';
import { parseStay } from '@/lib/bookings';
import { int, oneOf } from '@/lib/validate';

export const GET = handle(async (request) => {
  const p = searchParams(request);
  const list = (key) => (p.get(key) ?? '').split(',').map((v) => v.trim()).filter(Boolean);

  const result = searchProperties({
    q: p.get('q') ?? undefined,
    placeId: p.get('placeId') ? int(p.get('placeId'), 'placeId', { min: 1 }) : undefined,
    districtId: p.get('districtId') ? int(p.get('districtId'), 'districtId', { min: 1 }) : undefined,
    stateSlug: p.get('stateSlug') ?? undefined,
    placeKind: p.get('placeKind') ? oneOf(p.get('placeKind'), 'placeKind', ['CITY', 'TOWN', 'VILLAGE']) : undefined,
    kinds: list('kind').filter((k) => PROPERTY_KINDS.includes(k)),
    minStars: p.get('minStars') ? int(p.get('minStars'), 'minStars', { min: 1, max: 5 }) : undefined,
    minPrice: p.get('minPrice') ? int(p.get('minPrice'), 'minPrice', { min: 0 }) : undefined,
    maxPrice: p.get('maxPrice') ? int(p.get('maxPrice'), 'maxPrice', { min: 1 }) : undefined,
    rooms: int(p.get('rooms'), 'rooms', { min: 1, max: 10, fallback: 1 }),
    guests: int(p.get('guests'), 'guests', { min: 1, max: 40, fallback: 2 }),
    sort: oneOf(p.get('sort'), 'sort', ['recommended', 'price_low', 'price_high', 'rating', 'stars'], { fallback: 'recommended' }),
    page: int(p.get('page'), 'page', { min: 1, max: 500, fallback: 1 }),
    limit: int(p.get('limit'), 'limit', { min: 1, max: 48, fallback: 12 }),
    ...parseStay({ checkIn: p.get('checkIn'), checkOut: p.get('checkOut') }),
  });
  return json(result);
});
