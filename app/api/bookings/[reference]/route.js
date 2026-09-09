import { handle, json, currentUser, searchParams } from '@/lib/http';
import { bookingOrThrow, assertCanView, shapeBooking } from '@/lib/bookings';

export const GET = handle(async (request, { params }) => {
  const { reference } = await params;
  const booking = bookingOrThrow(reference);
  assertCanView(booking, { user: currentUser(request), email: searchParams(request).get('email') });
  return json({ booking: shapeBooking(booking) });
});
