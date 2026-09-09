import crypto from 'node:crypto';
import { unauthorized } from './errors.js';

// HS256 JWTs, signed in-process. Set ATITHI_JWT_SECRET in every environment
// that is not a throwaway dev box — the fallback below is regenerated on each
// boot, which invalidates existing sessions on restart by design.
const SECRET = process.env.ATITHI_JWT_SECRET || crypto.randomBytes(32).toString('hex');
const TTL_SECONDS = Number(process.env.ATITHI_JWT_TTL ?? 60 * 60 * 24 * 30);

if (!process.env.ATITHI_JWT_SECRET && process.env.NODE_ENV === 'production') {
  console.warn('[atithi] ATITHI_JWT_SECRET is not set — sessions will not survive a restart.');
}

const b64url = (buf) => Buffer.from(buf).toString('base64url');

export function signToken(payload, ttlSeconds = TTL_SECONDS) {
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + ttlSeconds };
  const head = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const data = `${head}.${b64url(JSON.stringify(body))}`;
  const sig = crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}

export function verifyToken(token) {
  const parts = String(token ?? '').split('.');
  if (parts.length !== 3) throw unauthorized('Malformed session token');
  const data = `${parts[0]}.${parts[1]}`;
  const expected = crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
  const a = Buffer.from(parts[2]);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw unauthorized('Invalid session token');
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) throw unauthorized('Session expired, sign in again');
  return payload;
}
