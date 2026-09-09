// Tariff maths. GST on hotel accommodation in India is charged per room, per
// night, on the published tariff: the slab below 7,500 rupees is taxed lightly,
// everything above it at the standard rate. Both slabs live here so a rate
// change is a one-line edit.
export const GST_SLABS = [
  { upTo: 7500, rate: 0.05 },
  { upTo: Infinity, rate: 0.18 },
];

export const MAX_STAY_NIGHTS = 30;
export const MAX_ROOMS_PER_BOOKING = 10;

/** GST rate that applies to one room-night at this tariff. */
export function gstRateFor(pricePerNight) {
  return GST_SLABS.find((slab) => pricePerNight <= slab.upTo).rate;
}

export function nightsBetween(checkIn, checkOut) {
  const start = Date.parse(`${checkIn}T00:00:00Z`);
  const end = Date.parse(`${checkOut}T00:00:00Z`);
  return Math.round((end - start) / 86400000);
}

/** Every date in [checkIn, checkOut) as YYYY-MM-DD. */
export function nightsIn(checkIn, checkOut) {
  const out = [];
  const cursor = new Date(`${checkIn}T00:00:00Z`);
  const end = new Date(`${checkOut}T00:00:00Z`);
  while (cursor < end) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

/**
 * Price a stay.
 * @returns {{nights:number, roomTotal:number, taxTotal:number, grandTotal:number,
 *            gstRate:number, pricePerNight:number, rooms:number}}
 */
export function quote({ pricePerNight, checkIn, checkOut, rooms = 1 }) {
  const nights = nightsBetween(checkIn, checkOut);
  const roomTotal = pricePerNight * nights * rooms;
  const gstRate = gstRateFor(pricePerNight);
  const taxTotal = Math.round(roomTotal * gstRate);
  return {
    pricePerNight,
    rooms,
    nights,
    roomTotal,
    gstRate,
    taxTotal,
    grandTotal: roomTotal + taxTotal,
  };
}

export const formatInr = (amount) =>
  `₹${Number(amount).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
