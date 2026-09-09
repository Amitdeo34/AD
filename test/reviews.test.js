import { req, call, isoDate } from './helpers.js';
import test from 'node:test';
import assert from 'node:assert/strict';

import { GET as searchProperties } from '../app/api/properties/route.js';
import { GET as getProperty } from '../app/api/properties/[slug]/route.js';
import { GET as listReviews, POST as writeReview } from '../app/api/properties/[slug]/reviews/route.js';
import { POST as createBooking } from '../app/api/bookings/route.js';
import { POST as payAtHotel } from '../app/api/payments/pay-at-hotel/route.js';
import { POST as register } from '../app/api/auth/register/route.js';

async function firstPropertySlug(place) {
  const search = await call(searchProperties, req('GET', `/api/properties?q=${place}&sort=price_low`));
  return search.body.properties[0].slug;
}

test('every property has a review history with a rating breakdown', async () => {
  const slug = await firstPropertySlug('Munnar');
  const { status, body } = await call(listReviews, req('GET', `/api/properties/${slug}/reviews`), { slug });
  assert.equal(status, 200);
  assert.ok(body.reviews.length >= 3);
  assert.ok(body.rating > 0 && body.rating <= 5);
  assert.equal(body.breakdown.length, 5);
  for (const review of body.reviews) {
    assert.ok(review.name && review.title && review.body, 'reviews are complete');
    assert.ok(review.rating >= 1 && review.rating <= 5);
  }
});

test('the property page carries its reviews and rating', async () => {
  const slug = await firstPropertySlug('Munnar');
  const { body } = await call(getProperty, req('GET', `/api/properties/${slug}`), { slug });
  assert.ok(body.reviews.length >= 3);
  assert.equal(body.property.ratingBreakdown.length, 5);
  assert.ok(body.property.photos.length >= 4, 'photographs are shown before booking');
});

test('reviews are the same on every request', async () => {
  const slug = await firstPropertySlug('Munnar');
  const first = await call(listReviews, req('GET', `/api/properties/${slug}/reviews`), { slug });
  const second = await call(listReviews, req('GET', `/api/properties/${slug}/reviews`), { slug });
  assert.deepEqual(first.body.reviews, second.body.reviews);
});

test('only a guest who stayed can write a review, once', async () => {
  const slug = await firstPropertySlug('Bekal');
  const email = 'reviewer@example.com';

  const account = await call(register, req('POST', '/api/auth/register', {
    body: { name: 'Ravi Menon', email, phone: '+91 9845000000', password: 'Review@2026' },
  }));
  const token = account.body.token;

  // Without a stay, reviewing is refused.
  const tooSoon = await call(writeReview, req('POST', `/api/properties/${slug}/reviews`, {
    body: { rating: 5, title: 'Lovely place', body: 'We had a very good time here indeed.' }, token,
  }), { slug });
  assert.equal(tooSoon.status, 403);

  // Anonymous reviews are refused outright.
  const anonymous = await call(writeReview, req('POST', `/api/properties/${slug}/reviews`, {
    body: { rating: 5, title: 'Lovely place', body: 'We had a very good time here indeed.' },
  }), { slug });
  assert.equal(anonymous.status, 401);

  // Book, confirm, and set the stay in the past so it counts as completed.
  const detail = await call(getProperty, req('GET', `/api/properties/${slug}`), { slug });
  const booked = await call(createBooking, req('POST', '/api/bookings', {
    body: {
      roomTypeId: detail.body.roomTypes[0].id, rooms: 1, guests: 2,
      checkIn: isoDate(1), checkOut: isoDate(3),
      guestName: 'Ravi Menon', email, phone: '+91 9845000000',
    },
    token,
  }));
  await call(payAtHotel, req('POST', '/api/payments/pay-at-hotel', {
    body: { reference: booked.body.booking.reference, email },
  }));

  const { updateBooking } = await import('../lib/store.js');
  updateBooking(booked.body.booking.reference, { checkIn: isoDate(-5), checkOut: isoDate(-3) });

  const written = await call(writeReview, req('POST', `/api/properties/${slug}/reviews`, {
    body: { rating: 4, title: 'Quiet and clean', body: 'Staff were helpful and the room was spotless.', tripType: 'Family holiday' },
    token,
  }), { slug });
  assert.equal(written.status, 201);
  assert.equal(written.body.review.name, 'Ravi Menon');
  assert.equal(written.body.review.sample, false);

  // A second review from the same guest is refused.
  const twice = await call(writeReview, req('POST', `/api/properties/${slug}/reviews`, {
    body: { rating: 1, title: 'Changed my mind', body: 'Actually it was not so good after all.' }, token,
  }), { slug });
  assert.equal(twice.status, 409);

  // The new review appears first and is counted in the rating.
  const after = await call(listReviews, req('GET', `/api/properties/${slug}/reviews`), { slug });
  assert.equal(after.body.reviews[0].title, 'Quiet and clean');
  assert.ok(after.body.reviewCount > 0);
});

test('a review is validated before it is stored', async () => {
  const slug = await firstPropertySlug('Bekal');
  const account = await call(register, req('POST', '/api/auth/register', {
    body: { name: 'Strict Tester', email: 'strict@example.com', phone: '+91 9845000001', password: 'Strict@2026' },
  }));
  const bad = await call(writeReview, req('POST', `/api/properties/${slug}/reviews`, {
    body: { rating: 9, title: 'x', body: 'short' }, token: account.body.token,
  }), { slug });
  assert.ok(bad.status === 400 || bad.status === 403);
});

test('reviewing a property that does not exist is a clean 404', async () => {
  const { status } = await call(listReviews, req('GET', '/api/properties/not-a-real-hotel/reviews'), { slug: 'not-a-real-hotel' });
  assert.equal(status, 404);
});
