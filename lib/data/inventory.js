// Deterministic generator for the sample property inventory.
// Everything here is derived from a seeded PRNG, so re-running the seeder
// reproduces exactly the same catalogue on every machine.

/** xmur3 string hash -> 32-bit seed. */
function hashSeed(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

/** mulberry32 PRNG. */
export function rngFor(key) {
  let a = hashSeed(key)();
  const next = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    float: next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    /** n distinct items from arr, order preserved. */
    sample: (arr, n) => {
      const copy = [...arr];
      const out = [];
      while (out.length < n && copy.length) out.push(copy.splice(Math.floor(next() * copy.length), 1)[0]);
      return out;
    },
    chance: (p) => next() < p,
  };
}

const CITY_PREFIX = ['Hotel', 'The', 'Hotel', 'The'];
const CITY_CORE = ['Grand', 'Royal', 'Imperial', 'Regency', 'Residency', 'Crown', 'Landmark', 'Meridian', 'Sapphire', 'Emerald', 'Pearl', 'Orchid', 'Lotus', 'Marigold', 'Banyan', 'Peepal', 'Ashoka', 'Chandra', 'Surya', 'Ganga', 'Yamuna', 'Kaveri', 'Vindhya', 'Aravalli', 'Deccan', 'Konark', 'Sarovar', 'Chinar', 'Neelkanth', 'Rajwada'];
const CITY_SUFFIX = ['Palace', 'Residency', 'Inn', 'Suites', 'Plaza', 'Continental', 'Grand', 'Regency', 'International', 'Court', 'House', 'Tower'];
const RURAL_CORE = ['Riverside', 'Hillview', 'Valley', 'Orchard', 'Sunrise', 'Sunset', 'Green Leaf', 'Mud House', 'Old Banyan', 'Wildflower', 'Cloud', 'Pine', 'Bamboo', 'Mango Grove', 'Millet', 'Terrace', 'Sparrow', 'Kingfisher', 'Hornbill', 'Barn Owl', 'Firefly', 'Monsoon', 'Harvest', 'Stone Bridge', 'Village Well', 'Courtyard', 'Neem Tree', 'Tamarind', 'Lantern', 'Charpai'];
const RURAL_SUFFIX = ['Homestay', 'Farmstay', 'Cottages', 'Retreat', 'Guest House', 'Camp', 'Nest', 'Homes', 'Lodge', 'Haveli'];
const FAMILY_NAMES = ['Sharma', 'Verma', 'Patel', 'Nair', 'Reddy', 'Iyer', 'Rao', 'Deshpande', 'Chatterjee', 'Das', 'Bora', 'Thakur', 'Rathore', 'Singh', 'Gowda', 'Menon', 'Pillai', 'Joshi', 'Kulkarni', 'Bhatt', 'Chauhan', 'Negi', 'Rawat', 'Bisht', 'Lepcha', 'Tamang', 'Kharkongor', 'Sangma', 'Konyak', 'Zeliang'];

const CORE_AMENITIES = ['Free Wi-Fi', 'Power backup', 'Daily housekeeping', '24-hour front desk', 'Hot water', 'Parking'];
const CITY_AMENITIES = ['Air conditioning', 'Restaurant', 'Room service', 'Lift', 'Laundry', 'Conference room', 'Gym', 'Airport transfer', 'Bar', 'Swimming pool', 'Spa', 'Doctor on call', 'Travel desk'];
const RURAL_AMENITIES = ['Home-cooked meals', 'Bonfire', 'Garden', 'Mountain view', 'Guided village walk', 'Organic farm', 'Pet friendly', 'Bicycles', 'Kitchen access', 'Star gazing deck', 'Local guide', 'Bullock cart ride', 'Cooking lessons'];
const BEACH_AMENITIES = ['Sea view', 'Beach access', 'Seafood kitchen', 'Sun deck', 'Water sports desk'];

const PROPERTY_KINDS_BY_PLACE = {
  CITY: [['HOTEL', 5], ['HOTEL', 4], ['GUEST_HOUSE', 2], ['HOSTEL', 1], ['HERITAGE', 1], ['RESORT', 1]],
  TOWN: [['HOTEL', 4], ['LODGE', 2], ['GUEST_HOUSE', 2], ['RESORT', 2], ['HOMESTAY', 2], ['HERITAGE', 1]],
  VILLAGE: [['HOMESTAY', 5], ['GUEST_HOUSE', 2], ['RESORT', 1], ['LODGE', 2], ['HERITAGE', 1]],
};

const KIND_LABEL = {
  HOTEL: 'hotel', RESORT: 'resort', HOMESTAY: 'homestay', GUEST_HOUSE: 'guest house',
  LODGE: 'lodge', HERITAGE: 'heritage stay', HOSTEL: 'hostel',
};

const ACCENTS = ['saffron', 'indigo', 'teal', 'maroon', 'olive', 'plum', 'clay', 'sea'];

// Price floor per settlement type, before the star-rating and demand multipliers.
const BASE_BY_PLACE = { CITY: 1600, TOWN: 1100, VILLAGE: 700 };

const ROOM_TIERS = [
  { name: 'Standard Room', mult: 1.0, guests: 2, bed: 'One double bed', desc: 'Compact room with the essentials, kept clean and quiet.' },
  { name: 'Deluxe Room', mult: 1.35, guests: 3, bed: 'One king bed', desc: 'More space, a sitting corner and the better view of the two.' },
  { name: 'Family Suite', mult: 1.9, guests: 5, bed: 'One king and two singles', desc: 'Two connected rooms with a shared living area — built for families.' },
  { name: 'Executive Room', mult: 1.6, guests: 2, bed: 'One king bed', desc: 'Work desk, fast Wi-Fi and complimentary breakfast.' },
  { name: 'Cottage', mult: 1.5, guests: 4, bed: 'One double and one bunk', desc: 'Standalone cottage with its own verandah.' },
  { name: 'Dormitory Bed', mult: 0.4, guests: 1, bed: 'Single bunk in a shared dorm', desc: 'A bed, a locker and a reading light in a shared room.' },
];

const ROOM_AMENITIES = ['Attached bathroom', 'Television', 'Wardrobe', 'Desk', 'Balcony', 'Geyser', 'Tea and coffee maker', 'Mini fridge', 'Blackout curtains', 'Extra blanket'];

/** Weighted pick from [[value, weight], ...]. */
function weighted(rng, pairs) {
  const total = pairs.reduce((n, [, w]) => n + w, 0);
  let r = rng.float() * total;
  for (const [value, w] of pairs) {
    r -= w;
    if (r <= 0) return value;
  }
  return pairs[pairs.length - 1][0];
}

function slugify(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

const COASTAL_HINTS = /beach|sea|island|dweep|coast|bay|port|harbour|shore/i;

function isCoastal(place, district, state) {
  const hay = `${place.name} ${place.known_for ?? ''} ${district} ${state}`;
  return COASTAL_HINTS.test(hay) || ['Goa', 'Lakshadweep', 'Andaman and Nicobar Islands'].includes(state);
}

/**
 * Build the property catalogue for one settlement.
 * @returns {{property: object, rooms: object[]}[]}
 */
export function generateProperties({ place, district, state }) {
  const rng = rngFor(`${state}|${district}|${place.name}`);
  const kind = place.kind;
  const count = kind === 'CITY' ? rng.int(5, 9) : kind === 'TOWN' ? rng.int(3, 6) : rng.int(2, 4);
  const coastal = isCoastal(place, district, state);
  const out = [];
  const usedNames = new Set();

  for (let i = 0; i < count; i++) {
    const propKind = weighted(rng, PROPERTY_KINDS_BY_PLACE[kind]);
    let name;
    for (let attempt = 0; attempt < 12; attempt++) {
      name = buildName(rng, propKind, kind, place.name, coastal);
      if (!usedNames.has(name)) break;
    }
    usedNames.add(name);

    const star = starFor(rng, propKind, kind);
    const basePrice = priceFor(rng, kind, star, propKind, coastal);
    const amenities = amenitiesFor(rng, kind, propKind, coastal);
    const rooms = roomsFor(rng, propKind, basePrice, star);
    const rating = Number((3.2 + rng.float() * 1.7).toFixed(1));
    const reviewCount = kind === 'CITY' ? rng.int(60, 1800) : kind === 'TOWN' ? rng.int(20, 600) : rng.int(4, 180);

    out.push({
      property: {
        name,
        slug: `${slugify(name)}-${slugify(place.name)}-${slugify(state)}-${i + 1}`,
        kind: propKind,
        star_rating: star,
        address: addressFor(rng, place.name, district, state),
        description: descriptionFor(rng, propKind, place, district, state, coastal),
        amenities: JSON.stringify(amenities),
        phone: phoneFor(rng),
        rating,
        review_count: reviewCount,
        base_price: Math.min(...rooms.map((r) => r.price)),
        accent: rng.pick(ACCENTS),
      },
      rooms,
    });
  }
  return out;
}

function buildName(rng, propKind, placeKind, placeName, coastal) {
  if (propKind === 'HOMESTAY' || propKind === 'FARMSTAY') {
    return rng.chance(0.45)
      ? `${rng.pick(FAMILY_NAMES)} ${rng.pick(['Homestay', 'Family Homestay', 'House', 'Nivas'])}`
      : `${rng.pick(RURAL_CORE)} ${rng.pick(RURAL_SUFFIX)}`;
  }
  if (propKind === 'HERITAGE') {
    return `${rng.pick(['Rajmahal', 'Purani', 'Old', 'Raj', 'Zamindar', 'Wada', 'Nalukettu', 'Haveli'])} ${rng.pick(['Haveli', 'Bagh', 'Mahal', 'Kothi', 'Manor', 'Bungalow'])}`;
  }
  if (propKind === 'HOSTEL') {
    return `${rng.pick(['Wanderer', 'Backpacker', 'Nomad', 'Bunk', 'Roam', 'Trail'])} ${rng.pick(['Hostel', 'Bunkhouse', 'Beds', 'Stays'])}`;
  }
  if (propKind === 'RESORT') {
    const core = coastal ? rng.pick([...RURAL_CORE, 'Blue Lagoon', 'Coral', 'Palm', 'Sandbar']) : rng.pick(RURAL_CORE);
    return `${core} ${rng.pick(['Resort', 'Retreat', 'Resort & Spa', 'Eco Resort'])}`;
  }
  if (propKind === 'LODGE' || propKind === 'GUEST_HOUSE') {
    return rng.chance(0.4)
      ? `${placeName} ${rng.pick(['Lodge', 'Guest House', 'Rest House', 'Yatri Niwas'])}`
      : `${rng.pick(RURAL_CORE)} ${rng.pick(['Lodge', 'Guest House', 'Inn'])}`;
  }
  // HOTEL
  if (placeKind === 'VILLAGE' || placeKind === 'TOWN') {
    return `Hotel ${rng.pick(CITY_CORE)} ${rng.chance(0.5) ? rng.pick(CITY_SUFFIX) : ''}`.trim();
  }
  const prefix = rng.pick(CITY_PREFIX);
  return `${prefix} ${rng.pick(CITY_CORE)} ${rng.pick(CITY_SUFFIX)}`;
}

function starFor(rng, propKind, placeKind) {
  if (propKind === 'HOSTEL') return rng.int(1, 2);
  if (propKind === 'HOMESTAY') return rng.int(2, 4);
  if (propKind === 'LODGE' || propKind === 'GUEST_HOUSE') return rng.int(1, 3);
  if (propKind === 'RESORT' || propKind === 'HERITAGE') return rng.int(3, 5);
  return placeKind === 'CITY' ? rng.int(2, 5) : rng.int(1, 4);
}

function priceFor(rng, placeKind, star, propKind, coastal) {
  const base = BASE_BY_PLACE[placeKind];
  const starMult = [0, 0.7, 0.95, 1.35, 2.1, 3.6][star];
  const kindMult = { HOSTEL: 0.35, HOMESTAY: 0.85, GUEST_HOUSE: 0.8, LODGE: 0.75, HOTEL: 1, RESORT: 1.5, HERITAGE: 1.6 }[propKind];
  const jitter = 0.85 + rng.float() * 0.4;
  const coast = coastal ? 1.15 : 1;
  return Math.round((base * starMult * kindMult * jitter * coast) / 50) * 50;
}

function amenitiesFor(rng, placeKind, propKind, coastal) {
  const list = [...rng.sample(CORE_AMENITIES, rng.int(4, 6))];
  const pool = placeKind === 'CITY' || propKind === 'HOTEL' ? CITY_AMENITIES : RURAL_AMENITIES;
  list.push(...rng.sample(pool, rng.int(3, 7)));
  if (coastal) list.push(...rng.sample(BEACH_AMENITIES, rng.int(1, 3)));
  if (propKind === 'RESORT') list.push('Swimming pool');
  return [...new Set(list)];
}

function roomsFor(rng, propKind, basePrice, star) {
  let tiers;
  if (propKind === 'HOSTEL') tiers = [ROOM_TIERS[5], ROOM_TIERS[0]];
  else if (propKind === 'HOMESTAY') tiers = rng.sample([ROOM_TIERS[0], ROOM_TIERS[1], ROOM_TIERS[2], ROOM_TIERS[4]], rng.int(2, 3));
  else if (propKind === 'RESORT' || propKind === 'HERITAGE') tiers = rng.sample([ROOM_TIERS[1], ROOM_TIERS[2], ROOM_TIERS[3], ROOM_TIERS[4]], rng.int(2, 4));
  else tiers = rng.sample([ROOM_TIERS[0], ROOM_TIERS[1], ROOM_TIERS[2], ROOM_TIERS[3]], rng.int(2, 4));

  // Always keep the cheapest tier first so base_price stays meaningful.
  tiers = [...tiers].sort((a, b) => a.mult - b.mult);
  return tiers.map((tier) => ({
    name: tier.name,
    description: tier.desc,
    price: Math.max(400, Math.round((basePrice * tier.mult) / 50) * 50),
    max_guests: tier.guests,
    total_rooms: tier.name === 'Dormitory Bed' ? rng.int(8, 24) : rng.int(2, star >= 4 ? 30 : 12),
    bed: tier.bed,
    amenities: JSON.stringify(rng.sample(ROOM_AMENITIES, rng.int(3, 6))),
  }));
}

function addressFor(rng, placeName, district, state) {
  const line = rng.pick([
    `Near ${rng.pick(['the bus stand', 'the main market', 'the temple', 'the railway crossing', 'the panchayat office', 'the post office', 'the school ground'])}`,
    `${rng.pick(['Main Road', 'Station Road', 'Bazaar Road', 'Temple Street', 'Link Road', 'Ring Road', 'Hill Road', 'Beach Road'])}`,
    `Ward ${rng.int(1, 22)}, ${rng.pick(['Old Town', 'New Colony', 'Civil Lines', 'Gandhi Nagar', 'Nehru Nagar', 'Shanti Nagar'])}`,
  ]);
  return `${line}, ${placeName}, ${district} district, ${state}`;
}

function descriptionFor(rng, propKind, place, district, state, coastal) {
  const label = KIND_LABEL[propKind];
  const setting = place.known_for
    ? `${place.name} is known for ${place.known_for.charAt(0).toLowerCase()}${place.known_for.slice(1)}.`
    : `${place.name} sits in ${district} district of ${state}.`;
  const openers = [
    `A ${label} in the heart of ${place.name}`,
    `A quiet ${label} a short walk from the centre of ${place.name}`,
    `A family-run ${label} in ${place.name}`,
    `A well-kept ${label} on the edge of ${place.name}`,
  ];
  const closers = coastal
    ? ['The sea is a few minutes away on foot.', 'Fresh catch is cooked to order in the kitchen.', 'Mornings here start with a walk on the sand.']
    : ['Meals are cooked to order in the house kitchen.', 'The staff can arrange a car and a local guide.', 'Mornings are quiet, and the tea arrives early.'];
  return `${rng.pick(openers)}. ${setting} ${rng.pick(closers)}`;
}

function phoneFor(rng) {
  return `+91 ${rng.pick(['6', '7', '8', '9'])}${String(rng.int(100000000, 999999999)).slice(0, 9)}`;
}

export { slugify };
