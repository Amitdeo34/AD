import Link from 'next/link';
import { notFound } from 'next/navigation';
import PhotoGallery from '@/components/PhotoGallery';
import RoomList from '@/components/RoomList';
import Reviews from '@/components/Reviews';
import { RatingBadge, Stars } from '@/components/Stars';
import { catalogue, locationOf, roomsOf } from '@/lib/catalogue';
import { roomsAvailable } from '@/lib/availability';
import { ratingFor, reviewsFor } from '@/lib/reviews';
import { quote } from '@/lib/pricing';
import { parseStay } from '@/lib/bookings';
import { inr, nightsLabel, prettyDate, PLACE_LABEL, PROPERTY_LABEL } from '@/lib/format';

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const property = catalogue().propertyBySlug.get(slug);
  if (!property) return { title: 'Property not found' };
  const { place, state } = locationOf(property);
  return {
    title: `${property.name}, ${place.name}`,
    description: `${property.description} Book from ${inr(property.basePrice)} a night in ${place.name}, ${state.name}.`,
  };
}

export default async function HotelPage({ params, searchParams }) {
  const { slug } = await params;
  const search = await searchParams;

  const property = catalogue().propertyBySlug.get(slug);
  if (!property) notFound();

  const { place, district, state } = locationOf(property);
  const { rating, reviewCount, breakdown } = ratingFor(property, place);

  // An invalid or stale date in the URL should not break the page; the room
  // list simply falls back to showing tariffs without a priced stay.
  let stay = { checkIn: null, checkOut: null };
  try {
    stay = parseStay({ checkIn: search?.checkIn, checkOut: search?.checkOut });
  } catch {
    stay = { checkIn: null, checkOut: null };
  }
  const rooms = Math.min(10, Math.max(1, Number(search?.rooms ?? 1) || 1));
  const guests = Math.min(40, Math.max(1, Number(search?.guests ?? 2) || 2));

  const roomTypes = roomsOf(property)
    .slice()
    .sort((a, b) => a.price - b.price)
    .map((room) => {
      const available = roomsAvailable(room, stay.checkIn, stay.checkOut);
      return {
        id: room.id,
        name: room.name,
        description: room.description,
        price: room.price,
        maxGuests: room.maxGuests,
        bed: room.bed,
        amenities: room.amenities,
        available,
        soldOut: Boolean(stay.checkIn) && available < rooms,
        quote: stay.checkIn ? quote({ pricePerNight: room.price, checkIn: stay.checkIn, checkOut: stay.checkOut, rooms }) : null,
      };
    });

  const nearby = district.placeIds
    .map((id) => catalogue().placeById.get(id))
    .filter((other) => other.id !== place.id && other.propertyIds.length)
    .sort((a, b) => b.propertyIds.length - a.propertyIds.length)
    .slice(0, 6);

  const nights = stay.checkIn
    ? Math.round((Date.parse(`${stay.checkOut}T00:00:00Z`) - Date.parse(`${stay.checkIn}T00:00:00Z`)) / 86400000)
    : 0;
  const stayQuery = stay.checkIn ? `?checkIn=${stay.checkIn}&checkOut=${stay.checkOut}&guests=${guests}&rooms=${rooms}` : '';

  return (
    <div className="mx-auto max-w-5xl px-4 py-5">
      <nav aria-label="Breadcrumb" className="mb-3 text-sm text-ink-400">
        <Link href="/" className="hover:underline">Home</Link> <span aria-hidden="true">›</span>{' '}
        <Link href={`/states/${state.slug}`} className="hover:underline">{state.name}</Link>{' '}
        <span aria-hidden="true">›</span>{' '}
        <Link href={`/states/${state.slug}/${district.slug}`} className="hover:underline">{district.name}</Link>{' '}
        <span aria-hidden="true">›</span>{' '}
        <span className="font-semibold text-ink-700">{property.name}</span>
      </nav>

      <PhotoGallery photos={property.photos} accent={property.accent} kind={property.kind} name={property.name} />

      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <span className="rounded-md bg-forest-100 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wider text-forest-800">
            {PROPERTY_LABEL[property.kind]}
          </span>
          <h1 className="mt-2 text-2xl font-bold tracking-tight md:text-3xl">{property.name}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-3">
            <Stars count={property.starRating} />
            <a href="#reviews" className="hover:underline">
              <RatingBadge rating={rating} reviewCount={reviewCount} size="lg" />
            </a>
          </div>
          <p className="mt-2 text-ink-500">{property.address}</p>
          <p className="text-sm text-ink-400">
            {place.name} · {PLACE_LABEL[place.kind]} in {district.name}, {state.name} · {property.phone}
          </p>
        </div>
        <div className="text-right">
          <span className="block text-2xl font-bold tracking-tight">{inr(property.basePrice)}</span>
          <span className="text-sm text-ink-400">from, per night</span>
        </div>
      </div>

      <p className="mt-4 leading-relaxed text-ink-700">{property.description}</p>

      <h2 className="mb-2 mt-6 text-lg font-bold tracking-tight">Amenities</h2>
      <ul className="flex flex-wrap gap-1.5">
        {property.amenities.map((amenity) => (
          <li key={amenity} className="rounded-full bg-white px-3 py-1 text-sm text-ink-600 ring-1 ring-sand-200">
            {amenity}
          </li>
        ))}
      </ul>

      <div className="mb-3 mt-8 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-xl font-bold tracking-tight">Rooms</h2>
        <p className="text-sm text-ink-500">
          {stay.checkIn
            ? `${prettyDate(stay.checkIn)} – ${prettyDate(stay.checkOut)} · ${nightsLabel(nights)} · ${rooms} room${rooms === 1 ? '' : 's'}, ${guests} guests`
            : 'Search with dates to see live availability and totals'}
        </p>
      </div>
      <RoomList
        slug={property.slug}
        roomTypes={roomTypes}
        checkIn={stay.checkIn}
        checkOut={stay.checkOut}
        rooms={rooms}
        guests={guests}
      />

      <div className="mt-10">
        <Reviews
          slug={property.slug}
          initialReviews={reviewsFor(property, place).slice(0, 12)}
          rating={rating}
          reviewCount={reviewCount}
          breakdown={breakdown}
        />
      </div>

      {nearby.length ? (
        <section className="mt-10">
          <h2 className="mb-3 text-lg font-bold tracking-tight">Elsewhere in {district.name}</h2>
          <div className="flex flex-wrap gap-2">
            {nearby.map((other) => (
              <Link
                key={other.id}
                href={`/search?placeId=${other.id}&label=${encodeURIComponent(other.name)}${stayQuery.replace('?', '&')}`}
                className="rounded-full border border-sand-300 bg-white px-3.5 py-1.5 text-sm hover:border-forest-600"
              >
                {other.name} · {other.propertyIds.length} stays
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
