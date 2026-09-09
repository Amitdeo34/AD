import { catalogue, locationOf, roomsOf } from '@/lib/catalogue';
import { handle, json, searchParams } from '@/lib/http';
import { notFound } from '@/lib/errors';
import { roomsAvailable } from '@/lib/availability';
import { quote } from '@/lib/pricing';
import { ratingFor, reviewsFor } from '@/lib/reviews';
import { parseStay } from '@/lib/bookings';
import { int } from '@/lib/validate';

export const GET = handle(async (request, { params }) => {
  const { slug } = await params;
  const c = catalogue();
  const property = c.propertyBySlug.get(slug);
  if (!property) throw notFound('No such property');

  const p = searchParams(request);
  const { checkIn, checkOut } = parseStay({ checkIn: p.get('checkIn'), checkOut: p.get('checkOut') });
  const rooms = int(p.get('rooms'), 'rooms', { min: 1, max: 10, fallback: 1 });

  const { place, district, state } = locationOf(property);
  const { rating, reviewCount, breakdown } = ratingFor(property, place);

  const roomTypes = roomsOf(property)
    .slice()
    .sort((a, b) => a.price - b.price)
    .map((room) => {
      const available = roomsAvailable(room, checkIn, checkOut);
      return {
        id: room.id,
        name: room.name,
        description: room.description,
        price: room.price,
        maxGuests: room.maxGuests,
        bed: room.bed,
        amenities: room.amenities,
        available,
        soldOut: Boolean(checkIn) && available < rooms,
        quote: checkIn ? quote({ pricePerNight: room.price, checkIn, checkOut, rooms }) : null,
      };
    });

  const nearby = district.placeIds
    .map((id) => c.placeById.get(id))
    .filter((other) => other.id !== place.id)
    .sort((a, b) => b.propertyIds.length - a.propertyIds.length)
    .slice(0, 6)
    .map((other) => ({ id: other.id, name: other.name, kind: other.kind, properties: other.propertyIds.length }));

  return json({
    property: {
      id: property.id,
      slug: property.slug,
      name: property.name,
      kind: property.kind,
      starRating: property.starRating,
      address: property.address,
      description: property.description,
      amenities: property.amenities,
      phone: property.phone,
      basePrice: property.basePrice,
      accent: property.accent,
      photos: property.photos,
      rating,
      reviewCount,
      ratingBreakdown: breakdown,
      place: { id: place.id, name: place.name, kind: place.kind, knownFor: place.knownFor },
      district: { id: district.id, name: district.name, slug: district.slug },
      state: { name: state.name, slug: state.slug, code: state.code },
    },
    roomTypes,
    reviews: reviewsFor(property, place).slice(0, 12),
    nearby,
    checkIn,
    checkOut,
    rooms,
  });
});
