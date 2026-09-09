import { handle, json, body, currentUser } from '@/lib/http';
import { conflict } from '@/lib/errors';
import { bookingOrThrow, assertCanView, shapeBooking } from '@/lib/bookings';
import { updateBooking } from '@/lib/store';

/** Confirm now, settle at the property on arrival. */
export const POST = handle(async (request) => {
  const input = await body(request);
  const booking = bookingOrThrow(input.reference);
  assertCanView(booking, { user: currentUser(request), email: input.email });

  if (booking.status === 'CANCELLED') throw conflict('That booking has been cancelled');
  if (booking.paymentStatus === 'PAID') throw conflict('That booking is already paid for');

  const updated = updateBooking(booking.reference, { status: 'CONFIRMED', paymentStatus: 'PAY_AT_HOTEL' });
  return json({ booking: shapeBooking(updated) });
});
