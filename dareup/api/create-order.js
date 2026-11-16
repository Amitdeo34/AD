// POST /api/create-order  { plan }  ->  { orderId, amount, currency, keyId, plan, name }
// The amount always comes from api/_lib/plans.js; anything else in the body is ignored.

import { randomBytes } from 'node:crypto';
import { runRoute, readJsonBody, sendJson, sendError, notConfigured } from './_lib/http.js';
import { getPlan, CURRENCY } from './_lib/plans.js';
import { APP_ID, appName, isDemoMode, passSecret, razorpayKeys } from './_lib/config.js';
import { createRazorpayOrder } from './_lib/razorpay.js';

export default async function handler(req, res) {
  await runRoute(req, res, ['POST'], createOrder);
}

async function createOrder(req, res) {
  const body = await readJsonBody(req);
  const plan = getPlan(body.plan);
  if (!plan) return sendError(res, 400, 'invalid_plan', 'Choose a valid plan: monthly, yearly or lifetime.');

  // Refuse before any money moves if we could not issue the pass afterwards.
  if (!passSecret()) return notConfigured(res, 'PASS_SECRET missing or shorter than 32 characters');

  if (isDemoMode()) {
    const nonce = randomBytes(9).toString('base64url').replace(/[^A-Za-z0-9]/g, 'x');
    return sendJson(res, 200, {
      orderId: `demo_order_${plan.id}_${nonce}`,
      amount: plan.amount,
      currency: CURRENCY,
      keyId: null,
      plan: plan.id,
      name: appName(),
      demo: true,
    });
  }

  const keys = razorpayKeys();
  if (!keys) return notConfigured(res, 'RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET not set');

  const order = await createRazorpayOrder(keys, {
    amount: plan.amount,
    currency: CURRENCY,
    receipt: `du_${plan.id}_${Date.now().toString(36)}`,
    notes: { plan: plan.id, app: APP_ID },
  });

  return sendJson(res, 200, {
    orderId: order.id,
    amount: order.amount ?? plan.amount,
    currency: order.currency || CURRENCY,
    keyId: keys.keyId,
    plan: plan.id,
    name: appName(),
  });
}
