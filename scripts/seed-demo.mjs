#!/usr/bin/env node
// Creates the sample accounts, bookings and reviews used for demonstrations.
//
//   npm run seed
//
// Safe to re-run: existing accounts are left alone.
import { catalogue, locationOf, roomsOf } from '../lib/catalogue.js';
import { hashPassword } from '../lib/passwords.js';
import { quote } from '../lib/pricing.js';
import { newReference } from '../lib/bookings.js';
import * as store from '../lib/store.js';

const DEMO = { name: 'Aarti Deshmukh', email: 'demo@easyhotelbooking.in', phone: '+91 9876543210', password: 'Demo@1234' };
const ADMIN = { name: 'Front Desk', email: 'admin@easyhotelbooking.in', phone: '+91 9876500000', password: 'Admin@1234' };

const isoDate = (days) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

function ensureUser({ name, email, phone, password }, role) {
  return (
    store.findUserByEmail(email) ??
    store.createUser({ name, email, phone, passwordHash: hashPassword(password), role })
  );
}

const demo = ensureUser(DEMO, 'GUEST');
const admin = ensureUser(ADMIN, 'ADMIN');

const c = catalogue();
const samples = [
  { place: 'Chitkul', offsetIn: 21, nights: 2, status: 'CONFIRMED', paymentStatus: 'PAID' },
  { place: 'Mawlynnong', offsetIn: 48, nights: 3, status: 'CONFIRMED', paymentStatus: 'PAY_AT_HOTEL' },
  { place: 'Hampi', offsetIn: -30, nights: 2, status: 'CONFIRMED', paymentStatus: 'PAID' },
];

let created = 0;
for (const sample of samples) {
  const place = c.places.find((p) => p.name === sample.place);
  if (!place) continue;
  const property = c.propertyById.get(place.propertyIds[0]);
  const room = roomsOf(property).sort((a, b) => a.price - b.price)[0];

  const checkIn = isoDate(sample.offsetIn);
  const checkOut = isoDate(sample.offsetIn + sample.nights);
  const already = store
    .bookingsForUser(demo.id)
    .some((b) => b.propertySlug === property.slug && b.checkIn === checkIn);
  if (already) continue;

  const priced = quote({ pricePerNight: room.price, checkIn, checkOut, rooms: 1 });
  const booking = store.createBooking({
    reference: newReference(),
    userId: demo.id,
    propertySlug: property.slug,
    roomTypeId: room.id,
    guestName: DEMO.name,
    email: DEMO.email,
    phone: DEMO.phone,
    checkIn,
    checkOut,
    rooms: 1,
    guests: 2,
    nights: priced.nights,
    roomTotal: priced.roomTotal,
    taxTotal: priced.taxTotal,
    grandTotal: priced.grandTotal,
    status: sample.status,
    paymentStatus: sample.paymentStatus,
    specialRequests: sample.place === 'Chitkul' ? 'Early check-in if possible.' : null,
    cancelledAt: null,
  });
  created++;

  if (sample.paymentStatus === 'PAID') {
    store.createPayment({
      bookingReference: booking.reference,
      method: 'UPI',
      amount: booking.grandTotal,
      vpa: process.env.EHB_UPI_VPA ?? 'demo@upi',
      status: 'VERIFIED',
      utr: String(Math.floor(1e11 + Math.random() * 8e11)),
      verifiedAt: new Date().toISOString(),
    });
  }

  // A completed stay earns a review, which is what the review rules require.
  if (sample.offsetIn < 0 && !store.reviewByUserForProperty(demo.id, property.slug)) {
    const { place: where } = locationOf(property);
    store.createReview({
      propertySlug: property.slug,
      userId: demo.id,
      name: DEMO.name,
      rating: 5,
      title: 'Worth the trip',
      body: `Spotless rooms and genuinely warm hosts. ${where.name} is quiet at night and everything worth seeing is within walking distance.`,
      tripType: 'Trip with friends',
      stayedOn: checkOut,
    });
  }
}

console.log('Demo data ready.');
console.log(`  guest account  ${DEMO.email} / ${DEMO.password}`);
console.log(`  staff account  ${ADMIN.email} / ${ADMIN.password}`);
console.log(`  bookings added ${created}`);
console.log(`  catalogue      ${c.stats.properties.toLocaleString('en-IN')} properties across ${c.stats.places.toLocaleString('en-IN')} settlements`);
