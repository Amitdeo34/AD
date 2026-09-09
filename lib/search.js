import { catalogue, propertiesUnder, locationOf, roomsOf, stateBySlugOrCode } from './catalogue.js';
import { ratingFor } from './reviews.js';
import { roomsAvailable } from './availability.js';
import { quote } from './pricing.js';
import { badRequest } from './errors.js';

export const PROPERTY_KINDS = ['HOTEL', 'RESORT', 'HOMESTAY', 'GUEST_HOUSE', 'LODGE', 'HERITAGE', 'HOSTEL'];

const SORTERS = {
  recommended: (a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount,
  price_low: (a, b) => a.fromPrice - b.fromPrice,
  price_high: (a, b) => b.fromPrice - a.fromPrice,
  rating: (a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount,
  stars: (a, b) => b.starRating - a.starRating || b.rating - a.rating,
};

/**
 * Search the catalogue.
 * Scope it with placeId, districtId, stateSlug or free text; filters and the
 * stay dates are applied on top.
 */
export function searchProperties(input) {
  const {
    q, placeId, districtId, stateSlug, placeKind, kinds = [], minStars,
    minPrice, maxPrice, checkIn, checkOut, rooms = 1, guests = 2,
    sort = 'recommended', page = 1, limit = 12,
  } = input;

  if (!q && !placeId && !districtId && !stateSlug) {
    throw badRequest('Narrow the search with a place, district, state or search text');
  }

  const c = catalogue();
  const state = stateSlug ? stateBySlugOrCode(stateSlug) : null;
  if (stateSlug && !state) throw badRequest('No such state or union territory');

  let candidates = propertiesUnder({ placeId, districtId, stateId: state?.id });

  const needle = q?.trim().toLowerCase();
  if (needle) {
    candidates = candidates.filter((property) => {
      const { place, district } = locationOf(property);
      return (
        property.name.toLowerCase().includes(needle) ||
        place.name.toLowerCase().includes(needle) ||
        district.name.toLowerCase().includes(needle)
      );
    });
  }
  if (placeKind) candidates = candidates.filter((p) => c.placeById.get(p.placeId).kind === placeKind);
  if (kinds.length) candidates = candidates.filter((p) => kinds.includes(p.kind));
  if (minStars) candidates = candidates.filter((p) => p.starRating >= minStars);
  if (minPrice != null) candidates = candidates.filter((p) => p.basePrice >= minPrice);
  if (maxPrice != null) candidates = candidates.filter((p) => p.basePrice <= maxPrice);

  const perRoomGuests = Math.ceil(guests / rooms);
  const results = [];

  for (const property of candidates) {
    // The cheapest room that seats the party and has stock every night.
    let best = null;
    for (const room of roomsOf(property)) {
      if (room.maxGuests < perRoomGuests) continue;
      const available = roomsAvailable(room, checkIn, checkOut);
      if (available < rooms) continue;
      const priced = checkIn
        ? quote({ pricePerNight: room.price, checkIn, checkOut, rooms })
        : { pricePerNight: room.price, rooms, nights: 0, roomTotal: 0, taxTotal: 0, grandTotal: 0, gstRate: 0 };
      if (!best || priced.pricePerNight < best.pricePerNight) {
        best = { roomTypeId: room.id, roomName: room.name, available, ...priced };
      }
    }
    if (!best) continue;
    results.push({ ...summarise(property), stay: best, fromPrice: best.pricePerNight });
  }

  results.sort(SORTERS[sort] ?? SORTERS.recommended);

  const total = results.length;
  const pages = Math.max(1, Math.ceil(total / limit));
  return {
    total,
    page,
    pages,
    limit,
    checkIn: checkIn ?? null,
    checkOut: checkOut ?? null,
    rooms,
    guests,
    properties: results.slice((page - 1) * limit, page * limit),
  };
}

/** Card-sized view of a property. */
export function summarise(property) {
  const { place, district, state } = locationOf(property);
  const { rating, reviewCount } = ratingFor(property, place);
  return {
    id: property.id,
    slug: property.slug,
    name: property.name,
    kind: property.kind,
    starRating: property.starRating,
    basePrice: property.basePrice,
    accent: property.accent,
    rating,
    reviewCount,
    amenities: property.amenities.slice(0, 6),
    photo: property.photos[0],
    place: { id: place.id, name: place.name, kind: place.kind, knownFor: place.knownFor },
    district: { id: district.id, name: district.name, slug: district.slug },
    state: { name: state.name, slug: state.slug, code: state.code },
  };
}

/** Type-ahead across settlements, districts and states. */
export function suggest(query, limit = 12) {
  const needle = String(query ?? '').trim().toLowerCase();
  if (needle.length < 2) return [];
  const c = catalogue();

  const places = c.places
    .filter((p) => p.name.toLowerCase().includes(needle))
    .map((place) => ({
      type: 'place',
      id: place.id,
      name: place.name,
      kind: place.kind,
      knownFor: place.knownFor,
      district: c.districtById.get(place.districtId).name,
      state: c.stateById.get(place.stateId).name,
      properties: place.propertyIds.length,
      exact: place.name.toLowerCase().startsWith(needle) ? 0 : 1,
    }))
    .sort((a, b) => a.exact - b.exact || b.properties - a.properties || a.name.localeCompare(b.name))
    .slice(0, limit);

  const districts = c.districts
    .filter((d) => d.name.toLowerCase().includes(needle))
    .slice(0, 4)
    .map((d) => ({
      type: 'district', id: d.id, name: d.name, slug: d.slug,
      state: c.stateById.get(d.stateId).name,
      stateSlug: c.stateById.get(d.stateId).slug,
    }));

  const states = c.states
    .filter((s) => s.name.toLowerCase().includes(needle) || s.code.toLowerCase() === needle)
    .slice(0, 4)
    .map((s) => ({ type: 'state', id: s.id, name: s.name, slug: s.slug, kind: s.kind }));

  return [...places, ...districts, ...states];
}
