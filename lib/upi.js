// Direct UPI collection.
//
// Guests pay the property owner's UPI ID straight from their own banking app,
// so money lands in the merchant's account with no aggregator in between and
// nothing to settle later. There is no gateway to call: a UPI intent link and
// its QR encode the payee, the amount and the booking reference, and the guest
// returns with the 12-digit UTR from their bank.
//
// Because no PSP is involved, nothing here can *prove* a payment arrived. The
// booking therefore stays held — not confirmed — until the reference is checked
// against the merchant's own bank statement. That check is an explicit step in
// the admin queue; see verifyUpiPayment in app/api/admin.
import QRCode from 'qrcode';
import { badRequest } from './errors.js';

export const PAYEE_VPA = process.env.EHB_UPI_VPA ?? '';
export const PAYEE_NAME = process.env.EHB_UPI_PAYEE_NAME ?? 'Easy Hotel Booking';
export const MERCHANT_CODE = process.env.EHB_UPI_MERCHANT_CODE ?? '';

/** Whether a real UPI ID is configured. Without one the app can only take pay-at-hotel bookings. */
export const upiConfigured = Boolean(PAYEE_VPA);

const UTR_PATTERN = /^[A-Za-z0-9]{12,22}$/;

/**
 * A UPI intent URI, per NPCI's deep-linking spec.
 * `tr` carries the booking reference so the merchant can match the credit in
 * their statement, and `tn` is what the guest sees in their banking app.
 */
export function upiUri({ amount, reference, note }) {
  if (!upiConfigured) throw badRequest('This property is not set up to take UPI payments yet');
  const params = new URLSearchParams({
    pa: PAYEE_VPA,
    pn: PAYEE_NAME,
    am: Number(amount).toFixed(2),
    cu: 'INR',
    tr: reference,
    tn: note ?? `Booking ${reference}`,
  });
  if (MERCHANT_CODE) params.set('mc', MERCHANT_CODE);
  return `upi://pay?${params.toString()}`;
}

/** The same URI as a scannable QR code, inline as an SVG string. */
export async function upiQrSvg({ amount, reference, note }) {
  return QRCode.toString(upiUri({ amount, reference, note }), {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 320,
    color: { dark: '#0f172a', light: '#ffffff' },
  });
}

/** App-specific links, so the guest can jump straight into their usual app. */
export function upiAppLinks(input) {
  const uri = upiUri(input);
  const query = uri.slice('upi://pay?'.length);
  return [
    { app: 'Any UPI app', href: uri },
    { app: 'Google Pay', href: `tez://upi/pay?${query}` },
    { app: 'PhonePe', href: `phonepe://pay?${query}` },
    { app: 'Paytm', href: `paytmmp://pay?${query}` },
  ];
}

/** The reference a bank shows against a UPI transfer. */
export function normaliseUtr(value) {
  const utr = String(value ?? '').trim().toUpperCase();
  if (!UTR_PATTERN.test(utr)) {
    throw badRequest('Enter the 12-digit UPI reference (UTR) shown in your banking app');
  }
  return utr;
}

export function paymentConfig() {
  return {
    method: 'UPI',
    configured: upiConfigured,
    vpa: PAYEE_VPA,
    payeeName: PAYEE_NAME,
    // Pay-at-property is always available, and is the only option when no UPI
    // ID is configured.
    payAtHotel: true,
  };
}
