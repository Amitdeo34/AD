import { catalogue } from '@/lib/catalogue';
import { handle, json } from '@/lib/http';
import { photosFor } from '@/lib/photos';

const PICKS = ['Manali', 'Gokarna', 'Munnar', 'Jaisalmer', 'Mawlynnong', 'Hampi', 'Chitkul', 'Ziro', 'Khajuraho', 'Tarkarli', 'Spangmik', 'Swaraj Dweep'];

export const GET = handle(async () => {
  const c = catalogue();
  const places = PICKS.map((name) => c.places.find((p) => p.name === name))
    .filter(Boolean)
    .map((place) => ({
      id: place.id,
      name: place.name,
      kind: place.kind,
      knownFor: place.knownFor,
      district: c.districtById.get(place.districtId).name,
      state: c.stateById.get(place.stateId).name,
      stateSlug: c.stateById.get(place.stateId).slug,
      properties: place.propertyIds.length,
      fromPrice: Math.min(...place.propertyIds.map((id) => c.propertyById.get(id).basePrice)),
      photo: photosFor(`place-${place.slug}`, 'HOTEL')[0],
    }));
  return json({ places });
});
