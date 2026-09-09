import crypto from 'node:crypto';
import { catalogue, locationOf } from './catalogue.js';
import { roomsAvailable } from './availability.js';
import { quote, MAX_ROOMS_PER_BOOKING, MAX_STAY_NIGHTS, nightsIn } from './pricing.js';
import { badRequest, conflict, notFound, forbidden } from './errors.js';
import { date, today } from './validate.js';
import * as store from './store.js';

const REF_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function newReference() {
  let out = '';
  for (const byte of crypto.randomBytes(6)) out += REF_ALPHABET[byte % REF_ALPHABET.length];
  return `EHB-${out}`;
}

/** Validate a stay window. Both dates or neither. */
export function parseStay(input, { required = false } = {}) {
  const checkIn = input.checkIn ? date(input.checkIn, 'Check-in date') : null;
  const checkOut = input.checkOut ? date(input.checkOut, 'Check-out date') : null;
  if (!checkIn && !checkOut) {
    if (required) throw badRequest('Give both a check-in and a check-out date');
    return { checkIn: null, checkOut: null };
  }
  if (!checkIn || !checkOut) throw badRequest('Give both a check-in and a check-out date');
  if (checkOut <= checkIn) throw badRequest('Check-out must be after check-in');
  if (checkIn < today()) throw badRequest('Check-in cannot be in the past');
  if (nightsIn(checkIn, checkOut).length > MAX_STAY_NIGHTS) {
    throw badRequest(`A single booking can run for at most ${MAX_STAY_NIGHTS} nights`);
  }
  return { checkIn, checkOut };
}

export function roomOrThrow(roomTypeId) {
  const room = catalogue().roomById.get(Number(roomTypeId));
  if (!room) throw notFound('No such room type');
  return room;
}

export function assertParty(room, rooms, guests) {
  if (rooms > MAX_ROOMS_PER_BOOKING) {
    throw badRequest(`A single booking can cover at most ${MAX_ROOMS_PER_BOOKING} rooms`);
  }
  if (guests > room.maxGuests * rooms) {
    throw badRequest(`${room.name} sleeps ${room.maxGuests} per room — book more rooms for ${guests} guests`);
  }
}

/** Price a stay without holding it. */
export function quoteStay({ roomTypeId, rooms, guests, checkIn, checkOut }) {
  const room = roomOrThrow(roomTypeId);
  assertParty(room, rooms, guests);
  const property = catalogue().propertyById.get(room.propertyId);
  const available = roomsAvailable(room, checkIn, checkOut);
  return {
    room: { id: room.id, name: room.name, price: room.price, maxGuests: room.maxGuests, bed: room.bed },
    property: { name: property.name, slug: property.slug },
    available,
    canBook: available >= rooms,
    checkIn,
    checkOut,
    guests,
    ...quote({ pricePerNight: room.price, checkIn, checkOut, rooms }),
  };
}

/**
 * Hold rooms. The booking starts as PENDING_PAYMENT and holds inventory from
 * that moment; paying (or choosing to pay at the property) confirms it.
 */
export function holdBooking(input) {
  const { roomTypeId, rooms, guests, checkIn, checkOut, guestName, email, phone, specialRequests, userId } = input;
  const room = roomOrThrow(roomTypeId);
  assertParty(room, rooms, guests);

  const available = roomsAvailable(room, checkIn, checkOut);
  if (available < rooms) {
    throw conflict(
      available === 0
        ? 'That room is fully booked for those dates'
        : `Only ${available} room${available === 1 ? '' : 's'} left for those dates`,
      { available },
    );
  }

  const priced = quote({ pricePerNight: room.price, checkIn, checkOut, rooms });
  const property = catalogue().propertyById.get(room.propertyId);

  return store.createBooking({
    reference: newReference(),
    userId: userId ?? null,
    propertySlug: property.slug,
    roomTypeId: room.id,
    guestName,
    email: email.toLowerCase(),
    phone,
    checkIn,
    checkOut,
    rooms,
    guests,
    nights: priced.nights,
    roomTotal: priced.roomTotal,
    taxTotal: priced.taxTotal,
    grandTotal: priced.grandTotal,
    status: 'PENDING_PAYMENT',
    paymentStatus: 'UNPAID',
    specialRequests: specialRequests ?? null,
    cancelledAt: null,
  });
}

/** Full view of a booking, with the property and location joined in. */
export function shapeBooking(booking) {
  const c = catalogue();
  const property = c.propertyBySlug.get(booking.propertySlug);
  const room = c.roomById.get(booking.roomTypeId);
  const { place, district, state } = property ? locationOf(property) : {};
  return {
    reference: booking.reference,
    status: booking.status,
    paymentStatus: booking.paymentStatus,
    guestName: booking.guestName,
    email: booking.email,
    phone: booking.phone,
    checkIn: booking.checkIn,
    checkOut: booking.checkOut,
    nights: booking.nights,
    rooms: booking.rooms,
    guests: booking.guests,
    roomTotal: booking.roomTotal,
    taxTotal: booking.taxTotal,
    grandTotal: booking.grandTotal,
    specialRequests: booking.specialRequests,
    createdAt: booking.createdAt,
    cancelledAt: booking.cancelledAt,
    room: room ? { id: room.id, name: room.name, bed: room.bed } : null,
    property: property
      ? {
          name: property.name,
          slug: property.slug,
          kind: property.kind,
          starRating: property.starRating,
          address: property.address,
          phone: property.phone,
          accent: property.accent,
          photo: property.photos[0],
        }
      : null,
    location: place
      ? { place: place.name, placeKind: place.kind, district: district.name, state: state.name, stateSlug: state.slug }
      : null,
    payments: store.paymentsForBooking(booking.reference).map((p) => ({
      id: p.id, method: p.method, status: p.status, amount: p.amount,
      utr: p.utr ?? null, createdAt: p.createdAt, verifiedAt: p.verifiedAt ?? null,
    })),
  };
}

/** A guest may see a booking if they own it, or can name the email on it. */
export function assertCanView(booking, { user, email }) {
  if (user && (booking.userId === user.id || user.role === 'ADMIN')) return;
  if (email && String(email).trim().toLowerCase() === booking.email) return;
  throw forbidden('Sign in, or give the email address the booking was made with');
}

export function bookingOrThrow(reference) {
  const booking = store.findBookingByReference(reference);
  if (!booking) throw notFound('No booking with that reference');
  return booking;
}
