// POST /api/verify-payment { razorpay_order_id, razorpay_payment_id, razorpay_signature }
//   -> { token, plan, exp, paymentId }
//
// 1. Check the Checkout signature (HMAC-SHA256 of "order_id|payment_id" with the key secret).
// 2. Fetch the order from Razorpay: it must belong to this app; the plan comes from
//    order.notes.plan, never from the client.
// 3. Fetch the payment: it must be for this order, captured (or the order paid), not refunded.
// 4. The pass runs from the payment time, so replaying the same request later never
//    extends a pass.

import { randomBytes } from 'node:crypto';
import { runRoute, readJsonBody, sendJson, sendError, notConfigured } from './_lib/http.js';
import { getPlan, expiryFor } from './_lib/plans.js';
import { APP_ID, isDemoMode, nowSec, passSecret, razorpayKeys } from './_lib/config.js';
import { signPass } from './_lib/token.js';
import {
  ORDER_ID_RE,
  PAYMENT_ID_RE,
  fetchOrder,
  fetchPayment,
  isRefunded,
  verifyPaymentSignature,
} from './_lib/razorpay.js';

const DEMO_ORDER_RE = /^demo_order_([a-z]{1,20})_([A-Za-z0-9]{6,32})$/;
const DEMO_PAYMENT_RE = /^demo_pay_[A-Za-z0-9]{6,32}$/;

export default async function handler(req, res) {
  await runRoute(req, res, ['POST'], verifyPayment);
}

async function verifyPayment(req, res) {
  const body = await readJsonBody(req);
  const orderId = body.razorpay_order_id;
  const paymentId = body.razorpay_payment_id;
  const signature = body.razorpay_signature;

  const secret = passSecret();
  if (!secret) return notConfigured(res, 'PASS_SECRET missing or shorter than 32 characters');

  if (isDemoMode() && typeof orderId === 'string' && orderId.startsWith('demo_')) {
    return demoPass(res, secret, orderId, paymentId);
  }

  const keys = razorpayKeys();
  if (!keys) return notConfigured(res, 'RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET not set');

  if (typeof orderId !== 'string' || !ORDER_ID_RE.test(orderId) ||
      typeof paymentId !== 'string' || !PAYMENT_ID_RE.test(paymentId) ||
      typeof signature !== 'string') {
    return sendError(res, 400, 'invalid_request', 'Missing or malformed payment details.');
  }
  if (!verifyPaymentSignature(orderId, paymentId, signature, keys.keySecret)) {
    return sendError(res, 400, 'invalid_signature', 'Payment signature did not match.');
  }

  const order = await fetchOrder(keys, orderId);
  if (order?.notes?.app !== APP_ID) {
    return sendError(res, 400, 'unknown_order', 'This payment is not for this app.');
  }
  const plan = getPlan(order.notes.plan);
  if (!plan) return sendError(res, 400, 'unknown_order', 'This order has no valid plan.');

  const payment = await fetchPayment(keys, paymentId);
  if (payment?.order_id !== orderId) {
    return sendError(res, 400, 'payment_mismatch', 'This payment does not belong to that order.');
  }
  if (isRefunded(payment)) {
    return sendError(res, 402, 'refunded', 'This payment was refunded, so it does not unlock Premium.');
  }
  if (payment.status !== 'captured' && order.status !== 'paid') {
    return sendError(res, 402, 'payment_pending',
      'Your payment is not complete yet. If money was taken, wait a minute and use Restore purchase.');
  }

  const now = nowSec();
  const start = Number.isInteger(payment.created_at) ? payment.created_at : now;
  const exp = expiryFor(plan, start);
  if (exp !== null && exp <= now) {
    return sendError(res, 410, 'expired', `This ${plan.label.toLowerCase()} has already ended.`, { plan: plan.id, exp });
  }

  const token = signPass({ plan: plan.id, pid: paymentId, oid: orderId, iat: now, exp }, secret);
  return sendJson(res, 200, { token, plan: plan.id, exp, paymentId });
}

// DEMO_MODE only: no Razorpay call, no money. The plan is read from the demo order id
// that create-order generated. Demo passes stop working when DEMO_MODE is switched off.
function demoPass(res, secret, orderId, paymentId) {
  const m = DEMO_ORDER_RE.exec(orderId);
  const plan = m && getPlan(m[1]);
  if (!plan) return sendError(res, 400, 'invalid_request', 'Unknown demo order.');
  const pid = typeof paymentId === 'string' && DEMO_PAYMENT_RE.test(paymentId)
    ? paymentId
    : `demo_pay_${randomBytes(9).toString('hex')}`;
  const now = nowSec();
  const exp = expiryFor(plan, now);
  const token = signPass({ plan: plan.id, pid, oid: orderId, iat: now, exp, demo: true }, secret);
  return sendJson(res, 200, { token, plan: plan.id, exp, paymentId: pid, demo: true });
}
