// HTTP helpers shared by every API route: CORS, method checks, JSON bodies and
// JSON errors. Works with Vercel's Node runtime and with dev-server.mjs, because
// it only uses plain Node response methods (statusCode, setHeader, end).

import { RazorpayError } from './razorpay.js';

export const MAX_BODY_BYTES = 2048;

export class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function sendJson(res, status, body, extraHeaders = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');
  for (const [k, v] of Object.entries(extraHeaders)) res.setHeader(k, v);
  res.end(JSON.stringify(body));
}

export function sendError(res, status, code, message, extra = {}) {
  sendJson(res, status, { error: code, message, ...extra });
}

// ---- CORS -------------------------------------------------------------------
// ALLOWED_ORIGINS: comma-separated list (e.g. "https://appassets.androidplatform.net,null").
// Unset, empty or containing "*" means any origin. Tokens are bearer tokens, not cookies.

function allowedOrigins() {
  const raw = String(process.env.ALLOWED_ORIGINS || '').trim();
  if (!raw) return null;
  const list = raw
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  return list.length === 0 || list.includes('*') ? null : list;
}

function requestHost(req) {
  const h = req.headers['x-forwarded-host'] || req.headers.host || '';
  return String(h).split(',')[0].trim().toLowerCase();
}

// Sets CORS headers. Returns false when ALLOWED_ORIGINS is set and the request's
// Origin is neither listed nor the API's own host.
export function applyCors(req, res, methods) {
  res.setHeader('Access-Control-Allow-Methods', [...methods, 'OPTIONS'].join(', '));
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '600');

  const list = allowedOrigins();
  if (!list) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    return true;
  }
  res.setHeader('Vary', 'Origin');
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin.trim() : '';
  if (!origin) return true; // not a cross-origin browser request

  let sameOrigin = false;
  try {
    sameOrigin = new URL(origin).host.toLowerCase() === requestHost(req);
  } catch {
    sameOrigin = false; // "null" (file://) is only allowed when listed
  }
  if (sameOrigin || list.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    return true;
  }
  return false;
}

// ---- Request helpers --------------------------------------------------------

export function bearerToken(req) {
  const h = req.headers.authorization;
  if (typeof h !== 'string') return '';
  const m = /^Bearer\s+(\S+)$/i.exec(h.trim());
  return m ? m[1] : '';
}

// Returns the JSON body as a plain object. Vercel has usually parsed it already
// (req.body getter, which throws on invalid JSON); strings and Buffers are parsed here.
export async function readJsonBody(req, limit = MAX_BODY_BYTES) {
  const declared = Number(req.headers['content-length'] || 0);
  if (declared > limit) throw new HttpError(413, 'body_too_large', 'Request body is too large.');

  let raw;
  try {
    raw = req.body;
  } catch {
    throw new HttpError(400, 'invalid_json', 'Send a valid JSON body.');
  }
  if (raw === undefined || raw === null || raw === '') return {};
  if (Buffer.isBuffer(raw)) raw = raw.toString('utf8');
  if (typeof raw === 'string') {
    if (Buffer.byteLength(raw) > limit) throw new HttpError(413, 'body_too_large', 'Request body is too large.');
    if (!raw.trim()) return {};
    try {
      raw = JSON.parse(raw);
    } catch {
      throw new HttpError(400, 'invalid_json', 'Send a valid JSON body.');
    }
  } else if (JSON.stringify(raw).length > limit) {
    throw new HttpError(413, 'body_too_large', 'Request body is too large.');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new HttpError(400, 'invalid_json', 'Send a JSON object.');
  }
  return raw;
}

// ---- Route wrapper ----------------------------------------------------------

export async function runRoute(req, res, methods, fn) {
  try {
    const originOk = applyCors(req, res, methods);
    if (req.method === 'OPTIONS') {
      res.statusCode = originOk ? 204 : 403;
      res.end();
      return;
    }
    if (!originOk) {
      return sendError(res, 403, 'origin_not_allowed', 'This website is not allowed to use the API.');
    }
    if (!methods.includes(req.method)) {
      res.setHeader('Allow', [...methods, 'OPTIONS'].join(', '));
      return sendError(res, 405, 'method_not_allowed', `Use ${methods.join(' or ')} for this endpoint.`);
    }
    await fn(req, res);
  } catch (err) {
    if (err instanceof HttpError) return sendError(res, err.status, err.code, err.message);
    if (err instanceof RazorpayError) {
      console.error(`[dareup] Razorpay request failed (status ${err.status}${err.code ? `, ${err.code}` : ''})`);
      return sendError(res, 502, 'payment_provider_error', 'Could not reach the payment provider. Please try again in a minute.');
    }
    console.error('[dareup] unexpected error:', err?.name || 'Error', String(err?.message || '').slice(0, 200));
    if (!res.headersSent) sendError(res, 500, 'server_error', 'Something went wrong. Please try again.');
  }
}

// One wording for every "not set up yet" case. The specific reason goes to the log only.
export function notConfigured(res, reason) {
  console.warn(`[dareup] payments not configured: ${reason}`);
  return sendError(res, 503, 'payments_not_configured', 'Payments are not set up on this server yet. Please try again later.');
}
