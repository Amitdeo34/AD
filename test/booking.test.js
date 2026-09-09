import { req, call, isoDate } from './helpers.js';
import test from 'node:test';
import assert from 'node:assert/strict';

import { GET as searchProperties } from '../app/api/properties/route.js';
import { GET as getProperty } from '../app/api/properties/[slug]/route.js';
import { POST as createBooking, GET as listBookings } from '../app/api/bookings/route.js';
import { GET as getBooking } from '../app/api/bookings/[reference]/route.js';
import { POST as cancelBooking } from '../app/api/bookings/[reference]/cancel/route.js';
import { POST as quoteStay } from '../app/api/bookings/quote/route.js';

const stay = { checkIn: isoDate(10), checkOut: isoDate(12) };
const query = `checkIn=${stay.checkIn}&checkOut=${stay.checkOut}`;

/** The cheapest room at the first result for a place name. */
async function cheapestRoomIn(place) {
  const search = await call(searchProperties, req('GET', `/api/properties?q=${encodeURIComponent(place)}&${query}&sort=price_low`));
  const property = search.body.properties[0];
  const detail = await call(getProperty, req('GET', `/api/properties/${property.slug}?${query}`), { slug: property.slug });
  return { property, room: detail.body.roomTypes[0], detail: detail.body };
}

const guest = (over = {}) => ({
  rooms: 1, guests: 2, ...stay,
  guestName: 'Ramesh Iyer', email: 'ramesh@example.com', phone: '+91 9876512345',
  ...over,
});

test('search is scoped to a village and prices the stay', async () => {
  const { status, body } = await call(searchProperties, req('GET', `/api/properties?q=Chitkul&${query}`));
  assert.equal(status, 200);
  assert.ok(body.total > 0);
  const first = body.properties[0];
  assert.equal(first.place.name, 'Chitkul');
  assert.equal(first.stay.nights, 2);
  assert.ok(first.stay.grandTotal > first.stay.roomTotal, 'GST is added on top');
  assert.ok(first.photo?.url, 'results carry a photograph');
  assert.ok(first.rating > 0 && first.reviewCount > 0, 'results carry a guest rating');
});

test('search will not run without a scope', async () => {
  const { status, body } = await call(searchProperties, req('GET', '/api/properties'));
  assert.equal(status, 400);
  assert.match(body.error, /Narrow the search/);
});

test('filters narrow the result set', async () => {
  const all = await call(searchProperties, req('GET', '/api/properties?stateSlug=goa&limit=48'));
  const homestays = await call(searchProperties, req('GET', '/api/properties?stateSlug=goa&kind=HOMESTAY&limit=48'));
  assert.ok(homestays.body.total < all.body.total);
  assert.ok(homestays.body.properties.every((p) => p.kind === 'HOMESTAY'));

  const cheap = await call(searchProperties, req('GET', '/api/properties?stateSlug=goa&maxPrice=1500&limit=48'));
  assert.ok(cheap.body.properties.every((p) => p.basePrice <= 1500));

  const villages = await call(searchProperties, req('GET', '/api/properties?stateSlug=sikkim&placeKind=VILLAGE&limit=48'));
  assert.ok(villages.body.total > 0);
  assert.ok(villages.body.properties.every((p) => p.place.kind === 'VILLAGE'));
});

test('sorting by price actually sorts by price', async () => {
  const { body } = await call(searchProperties, req('GET', `/api/properties?stateSlug=kerala&${query}&sort=price_low&limit=20`));
  const prices = body.properties.map((p) => p.stay.pricePerNight);
  assert.deepEqual(prices, [...prices].sort((a, b) => a - b));
});

test('a party too large for one room is not offered that room', async () => {
  const solo = await call(searchProperties, req('GET', '/api/properties?q=Chitkul&guests=1&rooms=1'));
  const crowd = await call(searchProperties, req('GET', '/api/properties?q=Chitkul&guests=20&rooms=1'));
  assert.ok(crowd.body.total < solo.body.total);
});

test('a quote matches what the booking is then charged', async () => {
  const { room } = await cheapestRoomIn('Hampi');
  const quoted = await call(quoteStay, req('POST', '/api/bookings/quote', {
    body: { roomTypeId: room.id, rooms: 2, guests: 2, ...stay },
  }));
  assert.equal(quoted.status, 200);
  assert.equal(quoted.body.roomTotal, room.price * 2 * 2);

  const created = await call(createBooking, req('POST', '/api/bookings', {
    body: guest({ roomTypeId: room.id, rooms: 2, email: 'quote@example.com' }),
  }));
  assert.equal(created.body.booking.grandTotal, quoted.body.grandTotal);
});

test('a booking holds rooms and starts unpaid', async () => {
  const { room } = await cheapestRoomIn('Chitkul');
  const { status, body } = await call(createBooking, req('POST', '/api/bookings', {
    body: guest({ roomTypeId: room.id }),
  }));
  assert.equal(status, 201);
  assert.match(body.booking.reference, /^EHB-[A-Z2-9]{6}$/);
  assert.equal(body.booking.status, 'PENDING_PAYMENT');
  assert.equal(body.booking.paymentStatus, 'UNPAID');
  assert.equal(body.booking.nights, 2);
  assert.equal(body.booking.grandTotal, body.booking.roomTotal + body.booking.taxTotal);
  assert.ok(body.booking.property.photo.url, 'the booking carries the property photograph');
});

test('the last room cannot be sold twice, but other dates still can', async () => {
  const { property } = await cheapestRoomIn('Mawlynnong');
  const detail = await call(getProperty, req('GET', `/api/properties/${property.slug}?${query}`), { slug: property.slug });
  const room = detail.body.roomTypes[0];

  const soakUp = await call(createBooking, req('POST', '/api/bookings', {
    body: guest({ roomTypeId: room.id, rooms: room.available, guests: 1, email: 'block@example.com' }),
  }));
  assert.equal(soakUp.status, 201);

  const overflow = await call(createBooking, req('POST', '/api/bookings', {
    body: guest({ roomTypeId: room.id, guests: 1, email: 'late@example.com' }),
  }));
  assert.equal(overflow.status, 409);
  assert.match(overflow.body.error, /fully booked|room/i);

  const later = await call(createBooking, req('POST', '/api/bookings', {
    body: guest({ roomTypeId: room.id, guests: 1, email: 'next@example.com', checkIn: isoDate(40), checkOut: isoDate(42) }),
  }));
  assert.equal(later.status, 201);
});

test('a sold-out room disappears from search for those dates', async () => {
  const before = await call(searchProperties, req('GET', `/api/properties?q=Mawlynnong&${query}&guests=1`));
  const after = await call(searchProperties, req('GET', `/api/properties?q=Mawlynnong&${query}&guests=1`));
  assert.equal(before.body.total, after.body.total, 'search is stable between identical calls');
  assert.ok(after.body.properties.every((p) => p.stay.available >= 1));
});

test('a booking is private to the email it was made with', async () => {
  const { room } = await cheapestRoomIn('Hampi');
  const created = await call(createBooking, req('POST', '/api/bookings', {
    body: guest({ roomTypeId: room.id, email: 'private@example.com' }),
  }));
  const reference = created.body.booking.reference;
  const params = { reference };

  assert.equal((await call(getBooking, req('GET', `/api/bookings/${reference}`), params)).status, 403);
  assert.equal((await call(getBooking, req('GET', `/api/bookings/${reference}?email=someone@else.com`), params)).status, 403);
  assert.equal((await call(getBooking, req('GET', `/api/bookings/${reference}?email=private@example.com`), params)).status, 200);
});

test('cancelling frees the rooms again', async () => {
  const { property } = await cheapestRoomIn('Ziro');
  const detail = await call(getProperty, req('GET', `/api/properties/${property.slug}?${query}`), { slug: property.slug });
  const room = detail.body.roomTypes[0];

  const created = await call(createBooking, req('POST', '/api/bookings', {
    body: guest({ roomTypeId: room.id, rooms: room.available, guests: 1, email: 'cancels@example.com' }),
  }));
  const reference = created.body.booking.reference;

  const full = await call(getProperty, req('GET', `/api/properties/${property.slug}?${query}`), { slug: property.slug });
  assert.equal(full.body.roomTypes.find((r) => r.id === room.id).available, 0);

  const cancelled = await call(cancelBooking, req('POST', `/api/bookings/${reference}/cancel`, {
    body: { email: 'cancels@example.com' },
  }), { reference });
  assert.equal(cancelled.body.booking.status, 'CANCELLED');

  const freed = await call(getProperty, req('GET', `/api/properties/${property.slug}?${query}`), { slug: property.slug });
  assert.equal(freed.body.roomTypes.find((r) => r.id === room.id).available, room.available);

  const again = await call(cancelBooking, req('POST', `/api/bookings/${reference}/cancel`, {
    body: { email: 'cancels@example.com' },
  }), { reference });
  assert.equal(again.status, 409);
});

test('impossible stay dates are refused', async () => {
  const { room } = await cheapestRoomIn('Hampi');
  const base = { roomTypeId: room.id, rooms: 1, guests: 1, guestName: 'Date Tester', email: 'dates@example.com', phone: '+91 9812345605' };
  for (const dates of [
    { checkIn: isoDate(-3), checkOut: isoDate(-1) },
    { checkIn: isoDate(9), checkOut: isoDate(8) },
    { checkIn: isoDate(9), checkOut: isoDate(9) },
    { checkIn: isoDate(9), checkOut: isoDate(60) },
  ]) {
    const res = await call(createBooking, req('POST', '/api/bookings', { body: { ...base, ...dates } }));
    assert.equal(res.status, 400, JSON.stringify(dates));
  }
});

test('signing in is required to list your own bookings', async () => {
  assert.equal((await call(listBookings, req('GET', '/api/bookings'))).status, 401);
});
