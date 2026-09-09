import { handle, json, body, currentUser } from '@/lib/http';
import { conflict, notFound } from '@/lib/errors';
import { bookingOrThrow, assertCanView, shapeBooking } from '@/lib/bookings';
import { normaliseUtr } from '@/lib/upi';
import { paymentsForBooking, updatePayment, updateBooking } from '@/lib/store';

/**
 * The guest reports the UTR their bank gave them.
 *
 * Nothing here can prove the money arrived — a direct UPI transfer has no
 * gateway to ask. So the booking keeps holding its rooms and the payment moves
 * to VERIFYING, where a staff account confirms it against the bank statement.
 * The guest is told exactly that.
 */
export const POST = handle(async (request) => {
  const input = await body(request);
  const booking = bookingOrThrow(input.reference);
  assertCanView(booking, { user: currentUser(request), email: input.email });

  if (booking.status === 'CANCELLED') throw conflict('That booking has been cancelled');
  const payment = paymentsForBooking(booking.reference).find(
    (p) => p.status === 'AWAITING_PAYMENT' || p.status === 'VERIFYING',
  );
  if (!payment) throw notFound('Start a UPI payment for this booking first');

  const utr = normaliseUtr(input.utr);
  updatePayment(payment.id, { utr, status: 'VERIFYING', reportedAt: new Date().toISOString() });
  const updated = updateBooking(booking.reference, { paymentStatus: 'VERIFYING' });

  return json({
    booking: shapeBooking(updated),
    message: 'Payment reference received. Your rooms stay held while we match it against our bank statement.',
  });
});
