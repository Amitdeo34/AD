// Everything guests create — accounts, bookings, payments and reviews — lives
// here. It is a small JSON document held in memory and flushed to disk after
// each change, which keeps the app dependency-free and portable.
//
//   EHB_DATA_DIR   where the document is written. Defaults to .data/ locally.
//
// On a serverless host the writable directory is per-instance and temporary, so
// point EHB_DATA_DIR at a mounted volume — or swap this module for a managed
// database — before taking real bookings. Every caller goes through the
// functions below, so that swap touches this file only.
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_DIR = process.env.VERCEL ? '/tmp/easy-hotel-booking' : '.data';
const DATA_DIR = process.env.EHB_DATA_DIR ?? DEFAULT_DIR;
const FILE = path.join(DATA_DIR, 'store.json');

const EMPTY = { users: [], bookings: [], payments: [], reviews: [], counters: {} };

let state = null;
let writable = true;

function load() {
  if (state) return state;
  try {
    state = { ...EMPTY, ...JSON.parse(fs.readFileSync(FILE, 'utf8')) };
  } catch {
    state = structuredClone(EMPTY);
  }
  return state;
}

function persist() {
  if (!writable) return;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(`${FILE}.tmp`, JSON.stringify(state));
    fs.renameSync(`${FILE}.tmp`, FILE);
  } catch (err) {
    // A read-only filesystem is not fatal: the process keeps serving from
    // memory, and the operator is told once that nothing is being kept.
    writable = false;
    console.warn(`[easy-hotel-booking] cannot write ${FILE} (${err.code}); data is in memory only`);
  }
}

function nextId(collection) {
  const db = load();
  db.counters[collection] = (db.counters[collection] ?? 0) + 1;
  return db.counters[collection];
}

/** Test hook: drop everything and start again. */
export function resetStore() {
  state = structuredClone(EMPTY);
  writable = true;
  persist();
}

// ---------------------------------------------------------------- users
export function createUser({ name, email, phone, passwordHash, role = 'GUEST' }) {
  const db = load();
  const user = {
    id: nextId('users'),
    name,
    email: email.toLowerCase(),
    phone,
    passwordHash,
    role,
    createdAt: new Date().toISOString(),
  };
  db.users.push(user);
  persist();
  return user;
}

export const findUserByEmail = (email) =>
  load().users.find((u) => u.email === String(email ?? '').toLowerCase()) ?? null;

export const findUserById = (id) => load().users.find((u) => u.id === Number(id)) ?? null;

export function updateUser(id, changes) {
  const user = findUserById(id);
  if (!user) return null;
  Object.assign(user, changes);
  persist();
  return user;
}

// ------------------------------------------------------------- bookings
export function createBooking(booking) {
  const db = load();
  const row = { id: nextId('bookings'), createdAt: new Date().toISOString(), ...booking };
  db.bookings.push(row);
  persist();
  return row;
}

export const findBookingByReference = (reference) =>
  load().bookings.find((b) => b.reference === String(reference ?? '').toUpperCase()) ?? null;

export const bookingsForUser = (userId) =>
  load().bookings.filter((b) => b.userId === Number(userId));

export const bookingsForEmail = (email) =>
  load().bookings.filter((b) => b.email === String(email ?? '').toLowerCase());

/** Bookings that hold inventory for a room type, for availability maths. */
export const holdingBookings = (roomTypeId) =>
  load().bookings.filter(
    (b) => b.roomTypeId === Number(roomTypeId) && (b.status === 'CONFIRMED' || b.status === 'PENDING_PAYMENT'),
  );

export function updateBooking(reference, changes) {
  const booking = findBookingByReference(reference);
  if (!booking) return null;
  Object.assign(booking, changes);
  persist();
  return booking;
}

export const allBookings = () => load().bookings;

// ------------------------------------------------------------- payments
export function createPayment(payment) {
  const db = load();
  const row = { id: nextId('payments'), createdAt: new Date().toISOString(), ...payment };
  db.payments.push(row);
  persist();
  return row;
}

export const paymentsForBooking = (reference) =>
  load().payments.filter((p) => p.bookingReference === reference);

export const findPaymentById = (id) => load().payments.find((p) => p.id === Number(id)) ?? null;

export const paymentsAwaitingVerification = () =>
  load().payments.filter((p) => p.status === 'VERIFYING');

export function updatePayment(id, changes) {
  const payment = findPaymentById(id);
  if (!payment) return null;
  Object.assign(payment, changes);
  persist();
  return payment;
}

// -------------------------------------------------------------- reviews
export function createReview(review) {
  const db = load();
  const row = { id: nextId('reviews'), createdAt: new Date().toISOString(), ...review };
  db.reviews.push(row);
  persist();
  return row;
}

export const reviewsForProperty = (slug) =>
  load().reviews.filter((r) => r.propertySlug === slug);

export const reviewByUserForProperty = (userId, slug) =>
  load().reviews.find((r) => r.userId === Number(userId) && r.propertySlug === slug) ?? null;
