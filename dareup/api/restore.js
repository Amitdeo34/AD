// POST /api/restore { paymentId, email } -> { token, plan, exp, paymentId }
//
// Looks the payment up on Razorpay, requires the email used at checkout to match
// (case-insensitive) and re-issues a pass that ends at payment time + plan length.
// A wrong email and an unknown payment ID get the same 404, so the endpoint never
// reveals whether a payment ID exists.

import { runRoute, readJsonBody, sendJson, sendError, notConfigured } from './_lib/http.js';
import { getPlan, expiryFor } from './_lib/plans.js';
import { APP_ID, isDemoMode, nowSec, passSecret, razorpayKeys } from './_lib/config.js';
import { signPass } from './_lib/token.js';
import { PAYMENT_ID_RE, RazorpayError, fetchOrder, fetchPayment, isRefunded } from './_lib/razorpay.js';

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,63}$/;
const NOT_FOUND = "We couldn't find a purchase with that payment ID and email. Check both and try again.";

export default async function handler(req, res) {
  await runRoute(req, res, ['POST'], restore);
}

async function restore(req, res) {
  const body = await readJsonBody(req);
  const paymentId = typeof body.paymentId === 'string' ? body.paymentId.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';

  if (isDemoMode() && paymentId.startsWith('demo_')) {
    return sendError(res, 400, 'demo_not_restorable', 'Demo passes cannot be restored. Get a new demo pass instead.');
  }
  if (!PAYMENT_ID_RE.test(paymentId)) {
    return sendError(res, 400, 'invalid_request', 'Enter the payment ID from your receipt. It starts with "pay_".');
  }
  if (email.length > 254 || !EMAIL_RE.test(email)) {
    return sendError(res, 400, 'invalid_request', 'Enter the email address you used when paying.');
  }

  const secret = passSecret();
  if (!secret) return notConfigured(res, 'PASS_SECRET missing or shorter than 32 characters');
  const keys = razorpayKeys();
  if (!keys) return notConfigured(res, 'RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET not set');

  const notFound = () => sendError(res, 404, 'not_found', NOT_FOUND);

  const payment = await lookup(() => fetchPayment(keys, paymentId));
  if (!payment) return notFound();
  if (String(payment.email || '').trim().toLowerCase() !== email) return notFound();
  if (typeof payment.order_id !== 'string' || !payment.order_id) return notFound();

  const order = await lookup(() => fetchOrder(keys, payment.order_id));
  if (!order || order?.notes?.app !== APP_ID) return notFound();
  const plan = getPlan(order.notes.plan);
  if (!plan) return notFound();

  if (isRefunded(payment)) {
    return sendError(res, 402, 'refunded', 'This payment was refunded, so there is no pass to restore.');
  }
  if (payment.status !== 'captured') {
    return sendError(res, 402, 'payment_pending', 'This payment is not complete. If money was taken, it is usually refunded automatically by Razorpay.');
  }

  const now = nowSec();
  const start = Number.isInteger(payment.created_at) ? payment.created_at : now;
  const exp = expiryFor(plan, start);
  if (exp !== null && exp <= now) {
    const ended = new Date(exp * 1000).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    return sendError(res, 410, 'expired', `This ${plan.label.toLowerCase()} ended on ${ended}.`, { plan: plan.id, exp });
  }

  const token = signPass({ plan: plan.id, pid: paymentId, oid: payment.order_id, iat: now, exp }, secret);
  return sendJson(res, 200, { token, plan: plan.id, exp, paymentId });
}

// Razorpay answers 400 ("The id provided does not exist") or 404 for unknown ids.
async function lookup(fn) {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof RazorpayError && (err.status === 400 || err.status === 404)) return null;
    throw err;
  }
}
