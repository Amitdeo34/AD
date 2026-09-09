// Photography for the listings.
//
// Real inventory would carry photographs uploaded by each property; this build
// has no such library, so every listing is given a stable set of placeholder
// photographs instead. The seed is derived from the property slug, so a given
// hotel always shows the same pictures, and every image has a colour fallback
// baked into the UI for when the network is unavailable.
const SOURCE = process.env.NEXT_PUBLIC_PHOTO_SOURCE ?? 'https://picsum.photos/seed';

const SHOT_LABELS = [
  'the building from outside',
  'a guest room',
  'the bathroom',
  'the view from the property',
  'where breakfast is served',
];

const KIND_NOUN = {
  HOTEL: 'hotel', RESORT: 'resort', HOMESTAY: 'homestay', GUEST_HOUSE: 'guest house',
  LODGE: 'lodge', HERITAGE: 'heritage stay', HOSTEL: 'hostel',
};

/** Five stable photographs for one property. */
export function photosFor(slug, kind) {
  return SHOT_LABELS.map((label, index) => ({
    url: `${SOURCE}/${slug}-${index}/900/600`,
    thumb: `${SOURCE}/${slug}-${index}/400/300`,
    alt: `Photograph of ${label} at this ${KIND_NOUN[kind] ?? 'property'}`,
  }));
}
