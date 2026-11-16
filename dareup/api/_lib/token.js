// Signed premium pass tokens. No database: the token itself is the proof of purchase.
//
//   token = base64url(JSON payload) + "." + base64url(HMAC-SHA256(PASS_SECRET, payloadPart))
//   payload = { v, plan, pid, oid, iat, exp }   (exp = null for lifetime)
//   demo passes also carry demo: true and stop working once DEMO_MODE is turned off.
//
// The client may decode the payload to show plan and expiry; only the server trusts it.

import { createHmac, timingSafeEqual } from 'node:crypto';
import { getPlan } from './plans.js';
import { MIN_PASS_SECRET_LENGTH, nowSec } from './config.js';

const TOKEN_RE = /^[A-Za-z0-9_-]{10,1200}\.[A-Za-z0-9_-]{43}$/;

export class PassConfigError extends Error {}

function assertSecret(secret) {
  if (typeof secret !== 'string' || secret.length < MIN_PASS_SECRET_LENGTH) {
    throw new PassConfigError('PASS_SECRET is missing or shorter than 32 characters');
  }
}

function mac(secret, data) {
  return createHmac('sha256', secret).update(data).digest();
}

export function signPass({ plan, pid, oid, iat, exp, demo = false }, secret) {
  assertSecret(secret);
  if (!getPlan(plan)) throw new Error('Unknown plan');
  const payload = { v: 1, plan, pid: String(pid), oid: String(oid), iat, exp: exp ?? null };
  if (demo) payload.demo = true;
  const part = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${part}.${mac(secret, part).toString('base64url')}`;
}

// Returns { ok: true, payload } or { ok: false, reason } where reason is one of
// missing | malformed | bad_signature | unknown_plan | expired | demo_disabled.
export function verifyPass(token, secret, { now = nowSec(), allowDemo = false } = {}) {
  assertSecret(secret);
  if (typeof token !== 'string' || token === '') return { ok: false, reason: 'missing' };
  if (!TOKEN_RE.test(token)) return { ok: false, reason: 'malformed' };

  const [part, sig] = token.split('.');
  const given = Buffer.from(sig, 'base64url');
  const expected = mac(secret, part);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return { ok: false, reason: 'bad_signature' };
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (!payload || payload.v !== 1) return { ok: false, reason: 'malformed' };

  const plan = getPlan(payload.plan);
  if (!plan) return { ok: false, reason: 'unknown_plan' };
  if (payload.exp !== null && !Number.isInteger(payload.exp)) return { ok: false, reason: 'malformed' };
  if (plan.days == null && payload.exp !== null) return { ok: false, reason: 'malformed' };
  if (plan.days != null && payload.exp === null) return { ok: false, reason: 'malformed' };
  if (payload.exp !== null && payload.exp <= now) return { ok: false, reason: 'expired', payload };
  if (payload.demo && !allowDemo) return { ok: false, reason: 'demo_disabled' };

  return { ok: true, payload };
}
