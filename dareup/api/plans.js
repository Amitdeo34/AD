// GET /api/plans -> { currency, plans, paymentsReady, demo }
// Public, for display only. Amounts are in paise; price is in rupees.

import { runRoute, sendJson } from './_lib/http.js';
import { CURRENCY, publicPlans } from './_lib/plans.js';
import { isDemoMode, passSecret, razorpayKeys } from './_lib/config.js';

export default async function handler(req, res) {
  await runRoute(req, res, ['GET'], plans);
}

async function plans(req, res) {
  const demo = isDemoMode();
  const paymentsReady = Boolean(passSecret()) && (demo || Boolean(razorpayKeys()));
  return sendJson(res, 200, { currency: CURRENCY, plans: publicPlans(), paymentsReady, demo }, {
    'Cache-Control': 'public, max-age=60',
  });
}
