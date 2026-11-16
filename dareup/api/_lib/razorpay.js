// Minimal Razorpay REST client using global fetch (no SDK, no dependencies).
// Never log or return key secrets; errors carry only status and Razorpay's error code.

import { createHmac, timingSafeEqual } from 'node:crypto';

const API = 'https://api.razorpay.com/v1';
const TIMEOUT_MS = 10_000;

export const ORDER_ID_RE = /^order_[A-Za-z0-9]{6,40}$/;
export const PAYMENT_ID_RE = /^pay_[A-Za-z0-9]{6,40}$/;
const SIGNATURE_RE = /^[a-f0-9]{64}$/i;

export class RazorpayError extends Error {
  constructor(status, code) {
    super(`Razorpay request failed with status ${status}`);
    this.name = 'RazorpayError';
    this.status = status; // 0 = network error or timeout
    this.code = code || null;
  }
}

export async function razorpayRequest(keys, method, path, body) {
  const auth = Buffer.from(`${keys.keyId}:${keys.keySecret}`).toString('base64');
  let res;
  try {
    res = await fetch(API + path, {
      method,
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new RazorpayError(0, 'network_error');
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) throw new RazorpayError(res.status, data?.error?.code);
  return data ?? {};
}

export function createRazorpayOrder(keys, { amount, currency, receipt, notes }) {
  return razorpayRequest(keys, 'POST', '/orders', { amount, currency, receipt, notes });
}

export function fetchOrder(keys, orderId) {
  return razorpayRequest(keys, 'GET', `/orders/${encodeURIComponent(orderId)}`);
}

export function fetchPayment(keys, paymentId) {
  return razorpayRequest(keys, 'GET', `/payments/${encodeURIComponent(paymentId)}`);
}

// Checkout signature: hex HMAC-SHA256(order_id + "|" + payment_id, key_secret).
export function verifyPaymentSignature(orderId, paymentId, signature, keySecret) {
  if (typeof signature !== 'string' || !SIGNATURE_RE.test(signature)) return false;
  if (typeof orderId !== 'string' || typeof paymentId !== 'string' || !keySecret) return false;
  const expected = createHmac('sha256', keySecret).update(`${orderId}|${paymentId}`).digest();
  const given = Buffer.from(signature, 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}

// A payment that was fully refunded no longer earns a pass.
export function isRefunded(payment) {
  return payment?.status === 'refunded' || payment?.refund_status === 'full';
}
