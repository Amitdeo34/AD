import { handle, json, body, currentUser } from '@/lib/http';
import { conflict, badRequest } from '@/lib/errors';
import { bookingOrThrow, assertCanView } from '@/lib/bookings';
import { upiQrSvg, upiAppLinks, upiUri, upiConfigured, PAYEE_VPA, PAYEE_NAME } from '@/lib/upi';
import { createPayment, paymentsForBooking } from '@/lib/store';

/**
 * Start a UPI payment: returns the intent link, per-app links and a QR code
 * for the exact amount, all tagged with the booking reference.
 */
export const POST = handle(async (request) => {
  const input = await body(request);
  const booking = bookingOrThrow(input.reference);
  assertCanView(booking, { user: currentUser(request), email: input.email });

  if (!upiConfigured) throw badRequest('UPI collection is not configured for this deployment');
  if (booking.status === 'CANCELLED') throw conflict('That booking has been cancelled');
  if (booking.paymentStatus === 'PAID') throw conflict('That booking is already paid for');

  const payload = { amount: booking.grandTotal, reference: booking.reference };

  // One open attempt per booking is enough; reuse it rather than piling up rows.
  const existing = paymentsForBooking(booking.reference).find((p) => p.status === 'AWAITING_PAYMENT');
  const payment = existing ?? createPayment({
    bookingReference: booking.reference,
    method: 'UPI',
    amount: booking.grandTotal,
    vpa: PAYEE_VPA,
    status: 'AWAITING_PAYMENT',
    utr: null,
    verifiedAt: null,
  });

  return json({
    payment: { id: payment.id, status: payment.status, amount: payment.amount },
    payee: { vpa: PAYEE_VPA, name: PAYEE_NAME },
    amount: booking.grandTotal,
    reference: booking.reference,
    uri: upiUri(payload),
    apps: upiAppLinks(payload),
    qrSvg: await upiQrSvg(payload),
  });
});
