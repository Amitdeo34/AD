import { catalogue, locationOf } from '@/lib/catalogue';
import { handle, json, body, requireUser, searchParams } from '@/lib/http';
import { notFound, conflict, forbidden } from '@/lib/errors';
import { reviewsFor, ratingFor, reviewByUserForProperty, createReview } from '@/lib/reviews';
import { bookingsForUser } from '@/lib/store';
import { str, int, oneOf } from '@/lib/validate';
import { today } from '@/lib/validate';

const TRIP_TYPES = ['Family holiday', 'Solo trip', 'Work travel', 'Couple’s getaway', 'Trip with friends', 'Pilgrimage'];

function propertyOrThrow(slug) {
  const property = catalogue().propertyBySlug.get(slug);
  if (!property) throw notFound('No such property');
  return property;
}

export const GET = handle(async (request, { params }) => {
  const { slug } = await params;
  const property = propertyOrThrow(slug);
  const { place } = locationOf(property);
  const limit = int(searchParams(request).get('limit'), 'limit', { min: 1, max: 50, fallback: 20 });
  return json({
    reviews: reviewsFor(property, place).slice(0, limit),
    ...ratingFor(property, place),
  });
});

/**
 * Only guests who actually stayed may review, which is the whole point of
 * tying reviews to bookings: one review per guest per property, and only after
 * a confirmed stay has started.
 */
export const POST = handle(async (request, { params }) => {
  const { slug } = await params;
  const property = propertyOrThrow(slug);
  const { place } = locationOf(property);
  const user = requireUser(request);
  const input = await body(request);

  const stayed = bookingsForUser(user.id).some(
    (b) => b.propertySlug === slug && b.status === 'CONFIRMED' && b.checkIn <= today(),
  );
  if (!stayed) {
    throw forbidden('You can review a property once you have stayed there on a confirmed booking');
  }
  if (reviewByUserForProperty(user.id, slug)) {
    throw conflict('You have already reviewed this property');
  }

  const review = createReview({
    propertySlug: slug,
    userId: user.id,
    name: user.name,
    rating: int(input.rating, 'Rating', { min: 1, max: 5 }),
    title: str(input.title, 'Title', { min: 3, max: 90 }),
    body: str(input.body, 'Review', { min: 10, max: 1500 }),
    tripType: input.tripType ? oneOf(input.tripType, 'Trip type', TRIP_TYPES) : null,
    stayedOn: today(),
  });

  return json({ review: { ...review, sample: false }, ...ratingFor(property, place) }, { status: 201 });
});
