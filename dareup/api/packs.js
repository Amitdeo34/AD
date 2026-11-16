// GET /api/packs  (Authorization: Bearer <pass token>)  -> { version, plan, exp, packs }
// Premium card content is only ever sent from here, after the pass is verified.

import { runRoute, bearerToken, sendJson, sendError } from './_lib/http.js';
import { isDemoMode, passSecret } from './_lib/config.js';
import { verifyPass } from './_lib/token.js';
import { PACKS_VERSION, PREMIUM_PACKS } from './_lib/premium-packs.js';

const MESSAGES = {
  missing: 'Premium pass required.',
  expired: 'Your premium pass has ended.',
  demo_disabled: 'Demo passes no longer work on this server.',
};

export default async function handler(req, res) {
  await runRoute(req, res, ['GET'], packs);
}

async function packs(req, res) {
  const secret = passSecret();
  if (!secret) {
    console.warn('[dareup] packs: PASS_SECRET missing or shorter than 32 characters');
    return sendError(res, 503, 'payments_not_configured', 'Premium is not set up on this server yet.');
  }

  const result = verifyPass(bearerToken(req), secret, { allowDemo: isDemoMode() });
  if (!result.ok) {
    const code = result.reason === 'expired' ? 'expired' : 'unauthorized';
    return sendError(res, 401, code, MESSAGES[result.reason] || 'Your premium pass could not be verified.', {
      reason: result.reason,
    });
  }

  return sendJson(res, 200, {
    version: PACKS_VERSION,
    plan: result.payload.plan,
    exp: result.payload.exp,
    packs: PREMIUM_PACKS,
  }, { 'Cache-Control': 'private, no-store' });
}
