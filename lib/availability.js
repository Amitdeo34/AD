import { holdingBookings } from './store.js';
import { nightsIn } from './pricing.js';

/**
 * Rooms of one type still sellable across every night of a stay.
 * A stay only works if every night has stock, so the answer is the total minus
 * the busiest night in the range.
 */
export function roomsAvailable(room, checkIn, checkOut, { excludeReference = null } = {}) {
  if (!checkIn || !checkOut) return room.totalRooms;

  const perNight = new Map();
  for (const booking of holdingBookings(room.id)) {
    if (booking.reference === excludeReference) continue;
    if (!(booking.checkIn < checkOut && booking.checkOut > checkIn)) continue;
    for (const night of nightsIn(booking.checkIn, booking.checkOut)) {
      perNight.set(night, (perNight.get(night) ?? 0) + booking.rooms);
    }
  }

  let busiest = 0;
  for (const night of nightsIn(checkIn, checkOut)) {
    busiest = Math.max(busiest, perNight.get(night) ?? 0);
  }
  return Math.max(0, room.totalRooms - busiest);
}
