import { handle, json, requireAdmin } from '@/lib/http';
import { paymentsAwaitingVerification, findBookingByReference } from '@/lib/store';
import { shapeBooking } from '@/lib/bookings';

/** The queue of UPI transfers a staff account needs to match to the bank statement. */
export const GET = handle(async (request) => {
  requireAdmin(request);
  const payments = paymentsAwaitingVerification().map((payment) => {
    const booking = findBookingByReference(payment.bookingReference);
    return {
      id: payment.id,
      utr: payment.utr,
      amount: payment.amount,
      reportedAt: payment.reportedAt ?? payment.createdAt,
      booking: booking ? shapeBooking(booking) : null,
    };
  });
  return json({ payments });
});
