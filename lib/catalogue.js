// The catalogue — states, districts, settlements, properties and rooms — is
// generated once per process from the data files and held in memory. It is
// deterministic, so every instance of the app serves an identical catalogue,
// and it needs no database, which is what lets the app run unchanged on a
// server, in a container or on a serverless platform.
import { STATES, HQ_OVERRIDES, CITY_NAMES } from './data/states.js';
import { PLACE_ROWS } from './data/places.js';
import { generateProperties, slugify } from './data/inventory.js';
import { photosFor } from './photos.js';

const KIND_FROM_CODE = { C: 'CITY', T: 'TOWN', V: 'VILLAGE' };

let cache = null;

function build() {
  const states = [];
  const districts = [];
  const places = [];
  const properties = [];
  const rooms = [];

  const extras = new Map();
  for (const [state, district, name, code, knownFor = null] of PLACE_ROWS) {
    const key = `${state}|${district}`;
    if (!extras.has(key)) extras.set(key, []);
    extras.get(key).push({ name, kind: KIND_FROM_CODE[code], knownFor });
  }

  let stateId = 0;
  let districtId = 0;
  let placeId = 0;
  let propertyId = 0;
  let roomId = 0;

  for (const stateData of STATES) {
    const state = {
      id: ++stateId,
      name: stateData.name,
      slug: slugify(stateData.name),
      code: stateData.code,
      kind: stateData.kind,
      region: stateData.region,
      capital: stateData.capital ?? null,
      districtIds: [],
    };
    states.push(state);

    for (const districtName of stateData.districts) {
      const district = {
        id: ++districtId,
        stateId: state.id,
        name: districtName,
        slug: slugify(districtName),
        placeIds: [],
      };
      districts.push(district);
      state.districtIds.push(district.id);

      const hqName = HQ_OVERRIDES[stateData.name]?.[districtName] ?? districtName;
      const curated = extras.get(`${stateData.name}|${districtName}`) ?? [];
      const settlements = [
        { name: hqName, kind: CITY_NAMES.has(hqName) ? 'CITY' : 'TOWN', isHq: true, knownFor: null },
        ...curated.filter((p) => p.name !== hqName).map((p) => ({ ...p, isHq: false })),
      ];

      for (const settlement of settlements) {
        const place = {
          id: ++placeId,
          districtId: district.id,
          stateId: state.id,
          name: settlement.name,
          slug: slugify(settlement.name),
          kind: settlement.kind,
          isHq: settlement.isHq,
          knownFor: settlement.knownFor,
          propertyIds: [],
        };
        places.push(place);
        district.placeIds.push(place.id);

        const generated = generateProperties({
          place: { name: place.name, kind: place.kind, known_for: place.knownFor },
          district: districtName,
          state: stateData.name,
        });

        for (const { property: raw, rooms: rawRooms } of generated) {
          const property = {
            id: ++propertyId,
            placeId: place.id,
            districtId: district.id,
            stateId: state.id,
            name: raw.name,
            slug: raw.slug,
            kind: raw.kind,
            starRating: raw.star_rating,
            address: raw.address,
            description: raw.description,
            amenities: JSON.parse(raw.amenities),
            phone: raw.phone,
            baseRating: raw.rating,
            baseReviewCount: raw.review_count,
            basePrice: raw.base_price,
            accent: raw.accent,
            roomIds: [],
            photos: photosFor(raw.slug, raw.kind),
          };
          properties.push(property);
          place.propertyIds.push(property.id);

          for (const rawRoom of rawRooms) {
            const room = {
              id: ++roomId,
              propertyId: property.id,
              name: rawRoom.name,
              description: rawRoom.description,
              price: rawRoom.price,
              maxGuests: rawRoom.max_guests,
              totalRooms: rawRoom.total_rooms,
              bed: rawRoom.bed,
              amenities: JSON.parse(rawRoom.amenities),
            };
            rooms.push(room);
            property.roomIds.push(room.id);
          }
        }
      }
    }
  }

  const byId = (list) => new Map(list.map((item) => [item.id, item]));

  return {
    states,
    districts,
    places,
    properties,
    rooms,
    stateById: byId(states),
    districtById: byId(districts),
    placeById: byId(places),
    propertyById: byId(properties),
    roomById: byId(rooms),
    stateBySlug: new Map(states.map((s) => [s.slug, s])),
    stateByCode: new Map(states.map((s) => [s.code.toLowerCase(), s])),
    propertyBySlug: new Map(properties.map((p) => [p.slug, p])),
    stats: {
      states: states.length,
      districts: districts.length,
      places: places.length,
      villages: places.filter((p) => p.kind === 'VILLAGE').length,
      towns: places.filter((p) => p.kind === 'TOWN').length,
      cities: places.filter((p) => p.kind === 'CITY').length,
      properties: properties.length,
      rooms: rooms.length,
    },
  };
}

/** The catalogue, built on first use and cached for the life of the process. */
export function catalogue() {
  if (!cache) cache = build();
  return cache;
}

export function stateBySlugOrCode(slugOrCode) {
  const c = catalogue();
  const key = String(slugOrCode ?? '').toLowerCase();
  return c.stateBySlug.get(key) ?? c.stateByCode.get(key) ?? null;
}

export function districtIn(state, districtSlug) {
  const c = catalogue();
  return state.districtIds
    .map((id) => c.districtById.get(id))
    .find((d) => d.slug === districtSlug) ?? null;
}

/** Every property inside a state, district or place. */
export function propertiesUnder({ placeId, districtId, stateId }) {
  const c = catalogue();
  if (placeId) {
    const place = c.placeById.get(Number(placeId));
    return place ? place.propertyIds.map((id) => c.propertyById.get(id)) : [];
  }
  if (districtId) {
    const district = c.districtById.get(Number(districtId));
    if (!district) return [];
    return district.placeIds.flatMap((id) => c.placeById.get(id).propertyIds.map((pid) => c.propertyById.get(pid)));
  }
  if (stateId) return c.properties.filter((p) => p.stateId === Number(stateId));
  return c.properties;
}

/** The place, district and state a property sits in. */
export function locationOf(property) {
  const c = catalogue();
  const place = c.placeById.get(property.placeId);
  const district = c.districtById.get(property.districtId);
  const state = c.stateById.get(property.stateId);
  return { place, district, state };
}

export function roomsOf(property) {
  const c = catalogue();
  return property.roomIds.map((id) => c.roomById.get(id));
}

export { slugify };
