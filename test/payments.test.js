import { req, call, isoDate } from './helpers.js';
import test from 'node:test';
import assert from 'node:assert/strict';

import { GET as searchProperties } from '../app/api/properties/route.js';
import { GET as getProperty } from '../app/api/properties/[slug]/route.js';
import { POST as createBooking } from '../app/api/bookings/route.js';
import { GET as getBooking } from '../app/api/bookings/[reference]/route.js';
import { POST as cancelBooking } from '../app/api/bookings/[reference]/cancel/route.js';
import { GET as paymentConfig } from '../app/api/payments/config/route.js';
import { POST as startUpi } from '../app/api/payments/upi/route.js';
import { POST as submitUtr } from '../app/api/payments/upi/submit/route.js';
import { POST as payAtHotel } from '../app/api/payments/pay-at-hotel/route.js';
import { GET as adminQueue } from '../app/api/admin/payments/route.js';
import { POST as verifyPayment } from '../app/api/admin/payments/[id]/verify/route.js';
import { POST as register } from '../app/api/auth/register/route.js';
import { updateUser } from '../lib/store.js';
import { upiUri, normaliseUtr } from '../lib/upi.js';

const stay = { checkIn: isoDate(14), checkOut: isoDate(16) };
const email = 'payer@example.com';

async function bookSomething(place = 'Gokarna', over = {}) {
  const search = await call(searchProperties, req('GET', `/api/properties?q=${place}&sort=price_low`));
  const property = search.body.properties[0];
  const detail = await call(getProperty, req('GET', `/api/properties/${property.slug}`), { slug: property.slug });
  const created = await call(createBooking, req('POST', '/api/bookings', {
    body: {
      roomTypeId: detail.body.roomTypes[0].id, rooms: 1, guests: 2, ...stay,
      guestName: 'Paying Guest', email, phone: '+91 9876512345', ...over,
    },
  }));
  return created.body.booking;
}

/** A staff account, since only ADMIN may work the verification queue. */
async function adminToken() {
  const created = await call(register, req('POST', '/api/auth/register', {
    body: { name: 'Desk Staff', email: `staff-${Date.now()}@example.com`, phone: '+91 9800000000', password: 'Staff@2026' },
  }));
  updateUser(created.body.user.id, { role: 'ADMIN' });
  return created.body.token;
}

test('the UPI intent carries payee, amount and booking reference', () => {
  const uri = upiUri({ amount: 2100, reference: 'EHB-ABC123' });
  const params = new URLSearchParams(uri.slice('upi://pay?'.length));
  assert.equal(params.get('pa'), process.env.EHB_UPI_VPA);
  assert.equal(params.get('am'), '2100.00');
  assert.equal(params.get('cu'), 'INR');
  assert.equal(params.get('tr'), 'EHB-ABC123');
});

test('a UTR must look like a bank reference', () => {
  assert.equal(normaliseUtr(' 123456789012 '), '123456789012');
  for (const bad of ['', '123', 'not a utr!', '1234567890123456789012345']) {
    assert.throws(() => normaliseUtr(bad), /UPI reference/);
  }
});

test('payment config advertises UPI and pay-at-property', async () => {
  const { body } = await call(paymentConfig, req('GET', '/api/payments/config'));
  assert.equal(body.method, 'UPI');
  assert.equal(body.configured, true);
  assert.equal(body.payAtHotel, true);
});

test('starting a UPI payment returns a QR for the exact amount', async () => {
  const booking = await bookSomething();
  const { status, body } = await call(startUpi, req('POST', '/api/payments/upi', {
    body: { reference: booking.reference, email },
  }));
  assert.equal(status, 200);
  assert.equal(body.amount, booking.grandTotal);
  assert.equal(body.reference, booking.reference);
  assert.ok(body.qrSvg.startsWith('<svg'), 'a scannable QR comes back');
  assert.ok(body.uri.startsWith('upi://pay?'));
  assert.ok(body.apps.some((a) => a.app === 'Google Pay'));
  assert.equal(body.payment.status, 'AWAITING_PAYMENT');
});

test('a reported UTR holds the booking until staff verify it', async () => {
  const booking = await bookSomething();
  await call(startUpi, req('POST', '/api/payments/upi', { body: { reference: booking.reference, email } }));

  const submitted = await call(submitUtr, req('POST', '/api/payments/upi/submit', {
    body: { reference: booking.reference, email, utr: '432198765432' },
  }));
  assert.equal(submitted.status, 200);
  assert.equal(submitted.body.booking.paymentStatus, 'VERIFYING');
  assert.equal(submitted.body.booking.status, 'PENDING_PAYMENT', 'reporting a payment does not confirm it');

  const token = await adminToken();
  const queue = await call(adminQueue, req('GET', '/api/admin/payments', { token }));
  const entry = queue.body.payments.find((p) => p.booking.reference === booking.reference);
  assert.ok(entry, 'the payment reaches the verification queue');
  assert.equal(entry.utr, '432198765432');

  const verified = await call(verifyPayment, req('POST', `/api/admin/payments/${entry.id}/verify`, {
    body: { accept: true }, token,
  }), { id: String(entry.id) });
  assert.equal(verified.status, 200);
  assert.equal(verified.body.booking.status, 'CONFIRMED');
  assert.equal(verified.body.booking.paymentStatus, 'PAID');
});

test('a payment staff cannot find is rejected and the booking reverts to unpaid', async () => {
  const booking = await bookSomething();
  await call(startUpi, req('POST', '/api/payments/upi', { body: { reference: booking.reference, email } }));
  await call(submitUtr, req('POST', '/api/payments/upi/submit', {
    body: { reference: booking.reference, email, utr: '111122223333' },
  }));

  const token = await adminToken();
  const queue = await call(adminQueue, req('GET', '/api/admin/payments', { token }));
  const entry = queue.body.payments.find((p) => p.booking.reference === booking.reference);

  const rejected = await call(verifyPayment, req('POST', `/api/admin/payments/${entry.id}/verify`, {
    body: { accept: false }, token,
  }), { id: String(entry.id) });
  assert.equal(rejected.body.booking.status, 'PENDING_PAYMENT');
  assert.equal(rejected.body.booking.paymentStatus, 'UNPAID');
});

test('the verification queue is closed to guests', async () => {
  assert.equal((await call(adminQueue, req('GET', '/api/admin/payments'))).status, 401);
  const guest = await call(register, req('POST', '/api/auth/register', {
    body: { name: 'Ordinary Guest', email: `guest-${Date.now()}@example.com`, phone: '+91 9811111111', password: 'Guest@2026' },
  }));
  const asGuest = await call(adminQueue, req('GET', '/api/admin/payments', { token: guest.body.token }));
  assert.equal(asGuest.status, 403);
});

test('pay at the property confirms without any payment', async () => {
  const booking = await bookSomething('Tarkarli');
  const { body } = await call(payAtHotel, req('POST', '/api/payments/pay-at-hotel', {
    body: { reference: booking.reference, email },
  }));
  assert.equal(body.booking.status, 'CONFIRMED');
  assert.equal(body.booking.paymentStatus, 'PAY_AT_HOTEL');
});

test('a stranger cannot start or report a payment on someone else’s booking', async () => {
  const booking = await bookSomething('Hampi');
  const started = await call(startUpi, req('POST', '/api/payments/upi', {
    body: { reference: booking.reference, email: 'stranger@example.com' },
  }));
  assert.equal(started.status, 403);

  const submitted = await call(submitUtr, req('POST', '/api/payments/upi/submit', {
    body: { reference: booking.reference, email: 'stranger@example.com', utr: '999988887777' },
  }));
  assert.equal(submitted.status, 403);
});

test('cancelling a paid booking records the refund the property owes', async () => {
  const booking = await bookSomething('Kasol');
  await call(startUpi, req('POST', '/api/payments/upi', { body: { reference: booking.reference, email } }));
  await call(submitUtr, req('POST', '/api/payments/upi/submit', {
    body: { reference: booking.reference, email, utr: '555566667777' },
  }));
  const token = await adminToken();
  const queue = await call(adminQueue, req('GET', '/api/admin/payments', { token }));
  const entry = queue.body.payments.find((p) => p.booking.reference === booking.reference);
  await call(verifyPayment, req('POST', `/api/admin/payments/${entry.id}/verify`, { body: { accept: true }, token }), { id: String(entry.id) });

  const cancelled = await call(cancelBooking, req('POST', `/api/bookings/${booking.reference}/cancel`, {
    body: { email },
  }), { reference: booking.reference });
  assert.equal(cancelled.body.booking.status, 'CANCELLED');
  assert.equal(cancelled.body.booking.paymentStatus, 'REFUND_DUE');
  assert.equal(cancelled.body.refundDue.amount, booking.grandTotal);

  const after = await call(getBooking, req('GET', `/api/bookings/${booking.reference}?email=${email}`), { reference: booking.reference });
  assert.equal(after.body.booking.payments[0].status, 'REFUND_DUE');
});

test('a cancelled booking cannot take a new payment', async () => {
  const booking = await bookSomething('Kasol');
  await call(cancelBooking, req('POST', `/api/bookings/${booking.reference}/cancel`, { body: { email } }), { reference: booking.reference });
  const started = await call(startUpi, req('POST', '/api/payments/upi', { body: { reference: booking.reference, email } }));
  assert.equal(started.status, 409);
});
