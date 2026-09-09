export const inr = (amount) =>
  `₹${Number(amount ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

export const PLACE_LABEL = { CITY: 'City', TOWN: 'Town', VILLAGE: 'Village' };

export const PROPERTY_LABEL = {
  HOTEL: 'Hotel', RESORT: 'Resort', HOMESTAY: 'Homestay', GUEST_HOUSE: 'Guest house',
  LODGE: 'Lodge', HERITAGE: 'Heritage stay', HOSTEL: 'Hostel',
};

export const STATUS_LABEL = {
  CONFIRMED: 'Confirmed',
  PENDING_PAYMENT: 'Rooms held',
  CANCELLED: 'Cancelled',
};

export const PAYMENT_LABEL = {
  UNPAID: 'Not paid',
  VERIFYING: 'Payment being checked',
  PAID: 'Paid',
  PAY_AT_HOTEL: 'Pay at property',
  REFUND_DUE: 'Refund due',
};

export function prettyDate(iso) {
  if (!iso) return '';
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

export function addDays(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const todayIso = () => new Date().toISOString().slice(0, 10);

export function nightsBetween(checkIn, checkOut) {
  if (!checkIn || !checkOut) return 0;
  return Math.round((Date.parse(`${checkOut}T00:00:00Z`) - Date.parse(`${checkIn}T00:00:00Z`)) / 86400000);
}

/** Default stay used across the app: tomorrow, for two nights. */
export function defaultStay() {
  const checkIn = addDays(todayIso(), 1);
  return { checkIn, checkOut: addDays(checkIn, 2) };
}

/** "3 nights", "1 night" */
export const nightsLabel = (n) => `${n} night${n === 1 ? '' : 's'}`;

export function relativeDate(iso) {
  const days = Math.round((Date.now() - Date.parse(iso)) / 86400000);
  if (days < 1) return 'today';
  if (days < 2) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`;
  const years = Math.round(months / 12);
  return `${years} year${years === 1 ? '' : 's'} ago`;
}
