import { req, call, isoDate } from './helpers.js';
import test from 'node:test';
import assert from 'node:assert/strict';

import { POST as register } from '../app/api/auth/register/route.js';
import { POST as login } from '../app/api/auth/login/route.js';
import { GET as me, PATCH as updateMe } from '../app/api/auth/me/route.js';
import { GET as searchProperties } from '../app/api/properties/route.js';
import { GET as getProperty } from '../app/api/properties/[slug]/route.js';
import { POST as createBooking, GET as listBookings } from '../app/api/bookings/route.js';

const account = { name: 'Meera Krishnan', email: 'meera@example.com', phone: '+91 9876543211', password: 'Kerala@2026' };

test('an account can be created and signed into', async () => {
  const created = await call(register, req('POST', '/api/auth/register', { body: account }));
  assert.equal(created.status, 201);
  assert.ok(created.body.token);
  assert.equal(created.body.user.email, account.email);
  assert.equal(created.body.user.role, 'GUEST');
  assert.equal(created.body.user.passwordHash, undefined, 'the hash never leaves the server');

  const session = await call(login, req('POST', '/api/auth/login', { body: { email: account.email, password: account.password } }));
  assert.equal(session.status, 200);
  const profile = await call(me, req('GET', '/api/auth/me', { token: session.body.token }));
  assert.equal(profile.body.user.name, account.name);
});

test('duplicate registrations and wrong passwords are refused', async () => {
  assert.equal((await call(register, req('POST', '/api/auth/register', { body: account }))).status, 409);
  assert.equal((await call(login, req('POST', '/api/auth/login', { body: { email: account.email, password: 'Wrong@1234' } }))).status, 401);
  assert.equal((await call(login, req('POST', '/api/auth/login', { body: { email: 'nobody@example.com', password: 'Guess@1234' } }))).status, 401);
});

test('malformed credentials are rejected on the way in', async () => {
  const cases = [
    [{ ...account, email: 'not-an-email' }, /email/i],
    [{ ...account, email: 'fresh1@example.com', password: 'short1' }, /at least 8/i],
    [{ ...account, email: 'fresh2@example.com', password: 'alllettersnodigits' }, /letter and one number/i],
    [{ ...account, email: 'fresh3@example.com', phone: '12345' }, /mobile number/i],
    [{ ...account, email: 'fresh4@example.com', name: 'A' }, /at least 2/i],
  ];
  for (const [body, pattern] of cases) {
    const res = await call(register, req('POST', '/api/auth/register', { body }));
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.match(res.body.error, pattern);
  }
});

test('a session is required, and a tampered token is not one', async () => {
  assert.equal((await call(me, req('GET', '/api/auth/me'))).status, 401);
  assert.equal((await call(me, req('GET', '/api/auth/me', { token: 'garbage' }))).status, 401);

  const session = await call(login, req('POST', '/api/auth/login', { body: { email: account.email, password: account.password } }));
  const [head, payload] = session.body.token.split('.');
  const forged = `${head}.${payload}.${'a'.repeat(43)}`;
  assert.equal((await call(me, req('GET', '/api/auth/me', { token: forged }))).status, 401);
});

test('the profile and password can be changed', async () => {
  const session = await call(login, req('POST', '/api/auth/login', { body: { email: account.email, password: account.password } }));
  const token = session.body.token;

  const updated = await call(updateMe, req('PATCH', '/api/auth/me', { body: { name: 'Meera K', phone: '+91 9876543212' }, token }));
  assert.equal(updated.body.user.name, 'Meera K');

  const wrong = await call(updateMe, req('PATCH', '/api/auth/me', {
    body: { currentPassword: 'Wrong@1234', newPassword: 'Newer@2026' }, token,
  }));
  assert.equal(wrong.status, 401);

  const changed = await call(updateMe, req('PATCH', '/api/auth/me', {
    body: { currentPassword: account.password, newPassword: 'Newer@2026' }, token,
  }));
  assert.equal(changed.status, 200);
  assert.equal((await call(login, req('POST', '/api/auth/login', { body: { email: account.email, password: 'Newer@2026' } }))).status, 200);
  assert.equal((await call(login, req('POST', '/api/auth/login', { body: { email: account.email, password: account.password } }))).status, 401);
});

test('a guest sees their own bookings and nobody else’s', async () => {
  const session = await call(login, req('POST', '/api/auth/login', { body: { email: account.email, password: 'Newer@2026' } }));
  const token = session.body.token;

  const search = await call(searchProperties, req('GET', '/api/properties?q=Ziro&sort=price_low'));
  const slug = search.body.properties[0].slug;
  const detail = await call(getProperty, req('GET', `/api/properties/${slug}`), { slug });

  const created = await call(createBooking, req('POST', '/api/bookings', {
    body: {
      roomTypeId: detail.body.roomTypes[0].id, rooms: 1, guests: 2,
      checkIn: isoDate(15), checkOut: isoDate(17),
      guestName: 'Meera K', email: account.email, phone: '+91 9876543212',
    },
    token,
  }));
  assert.equal(created.status, 201);

  const mine = await call(listBookings, req('GET', '/api/bookings', { token }));
  assert.equal(mine.body.bookings.length, 1);
  assert.equal(mine.body.bookings[0].reference, created.body.booking.reference);

  const other = await call(register, req('POST', '/api/auth/register', {
    body: { name: 'Someone Else', email: 'else@example.com', phone: '+91 9899999999', password: 'Else@2026' },
  }));
  const theirs = await call(listBookings, req('GET', '/api/bookings', { token: other.body.token }));
  assert.equal(theirs.body.bookings.length, 0);
});

test('registering claims bookings made earlier as a guest with the same email', async () => {
  const search = await call(searchProperties, req('GET', '/api/properties?q=Khonoma&sort=price_low'));
  const slug = search.body.properties[0].slug;
  const detail = await call(getProperty, req('GET', `/api/properties/${slug}`), { slug });

  const asGuest = await call(createBooking, req('POST', '/api/bookings', {
    body: {
      roomTypeId: detail.body.roomTypes[0].id, rooms: 1, guests: 1,
      checkIn: isoDate(20), checkOut: isoDate(21),
      guestName: 'Later Signup', email: 'later@example.com', phone: '+91 9812345699',
    },
  }));
  assert.equal(asGuest.status, 201);

  const registered = await call(register, req('POST', '/api/auth/register', {
    body: { name: 'Later Signup', email: 'later@example.com', phone: '+91 9812345699', password: 'Later@2026' },
  }));
  const mine = await call(listBookings, req('GET', '/api/bookings', { token: registered.body.token }));
  assert.equal(mine.body.bookings.length, 1);
  assert.equal(mine.body.bookings[0].reference, asGuest.body.booking.reference);
});
