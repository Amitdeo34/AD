import { handle, json, body, requireAdmin } from '@/lib/http';
import { notFound, conflict } from '@/lib/errors';
import { findPaymentById, updatePayment, updateBooking, findBookingByReference } from '@/lib/store';
import { shapeBooking } from '@/lib/bookings';

/**
 * Staff confirm (or reject) a reported UPI transfer after checking the bank
 * statement. Confirming is what finally turns the booking green.
 */
export const POST = handle(async (request, { params }) => {
  const { id } = await params;
  requireAdmin(request);
  const input = await body(request);

  const payment = findPaymentById(id);
  if (!payment) throw notFound('No such payment');
  if (payment.status !== 'VERIFYING') throw conflict(`That payment is ${payment.status.toLowerCase()}, not awaiting verification`);

  const accept = input.accept !== false;
  const now = new Date().toISOString();
  updatePayment(payment.id, {
    status: accept ? 'VERIFIED' : 'REJECTED',
    verifiedAt: now,
    note: input.note ?? null,
  });

  const booking = findBookingByReference(payment.bookingReference);
  const updated = updateBooking(payment.bookingReference, accept
    ? { status: 'CONFIRMED', paymentStatus: 'PAID' }
    : { status: 'PENDING_PAYMENT', paymentStatus: 'UNPAID' });

  return json({ payment: findPaymentById(payment.id), booking: shapeBooking(updated ?? booking) });
});
