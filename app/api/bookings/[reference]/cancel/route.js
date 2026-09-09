import { handle, json, body, currentUser } from '@/lib/http';
import { conflict } from '@/lib/errors';
import { bookingOrThrow, assertCanView, shapeBooking } from '@/lib/bookings';
import { updateBooking, paymentsForBooking, updatePayment } from '@/lib/store';

export const POST = handle(async (request, { params }) => {
  const { reference } = await params;
  const input = await body(request);
  const booking = bookingOrThrow(reference);
  assertCanView(booking, { user: currentUser(request), email: input.email });

  if (booking.status === 'CANCELLED') throw conflict('That booking is already cancelled');

  // Money taken over UPI went straight to the property's own account, so a
  // refund is theirs to send. The booking records that one is owed.
  const paid = paymentsForBooking(booking.reference).filter((p) => p.status === 'VERIFIED');
  for (const payment of paid) {
    updatePayment(payment.id, { status: 'REFUND_DUE', updatedAt: new Date().toISOString() });
  }

  const updated = updateBooking(booking.reference, {
    status: 'CANCELLED',
    paymentStatus: paid.length ? 'REFUND_DUE' : booking.paymentStatus,
    cancelledAt: new Date().toISOString(),
  });

  return json({
    booking: shapeBooking(updated),
    refundDue: paid.length ? { amount: booking.grandTotal, payments: paid.map((p) => p.utr) } : null,
  });
});
