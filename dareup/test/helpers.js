// Test helpers: fake Vercel req/res, a scripted fetch, and env isolation.

import { createHmac } from 'node:crypto';

export const TEST_SECRET = 'test-pass-secret-0123456789-abcdefghij';
export const KEY_ID = 'rzp_test_KEYID0000000';
export const KEY_SECRET = 'test_key_secret_value';

const ENV_KEYS = ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'PASS_SECRET', 'ALLOWED_ORIGINS', 'DEMO_MODE', 'APP_NAME'];

// Runs each test with a clean set of DareUp env vars and restores them afterwards.
export function useEnv(t, values = {}) {
  const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
  Object.assign(process.env, values);
  t.after(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });
}

export const configured = () => ({ RAZORPAY_KEY_ID: KEY_ID, RAZORPAY_KEY_SECRET: KEY_SECRET, PASS_SECRET: TEST_SECRET });

export function mockReq({ method = 'POST', body, headers = {} } = {}) {
  const h = { 'content-type': 'application/json' };
  for (const [k, v] of Object.entries(headers)) h[k.toLowerCase()] = v;
  return { method, headers: h, body, url: '/' };
}

export function mockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: '',
    ended: false,
    setHeader(k, v) { this.headers[k.toLowerCase()] = String(v); return this; },
    getHeader(k) { return this.headers[k.toLowerCase()]; },
    end(chunk) { if (chunk !== undefined) this.body = String(chunk); this.ended = true; return this; },
    get data() { return this.body ? JSON.parse(this.body) : null; },
  };
}

export async function call(handler, reqOpts) {
  const res = mockRes();
  await handler(mockReq(reqOpts), res);
  return res;
}

// Replaces global fetch with a router: routes = { 'GET /orders/order_x': {status, body} | fn }.
// Unknown routes fail the test loudly. Returns the list of calls made.
export function mockFetch(t, routes) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url);
    const key = `${init.method || 'GET'} ${u.pathname.replace(/^\/v1/, '')}`;
    calls.push({ key, url: String(url), init, body: init.body ? JSON.parse(init.body) : undefined });
    let route = routes[key];
    if (typeof route === 'function') route = await route({ url, init });
    if (!route) throw new Error(`Unexpected fetch: ${key}`);
    if (route.throw) throw route.throw;
    return new Response(JSON.stringify(route.body ?? {}), { status: route.status ?? 200, headers: { 'Content-Type': 'application/json' } });
  };
  t.after(() => { globalThis.fetch = original; });
  return calls;
}

// Fails if anything calls fetch.
export function forbidFetch(t) {
  return mockFetch(t, {});
}

export function checkoutSignature(orderId, paymentId, secret = KEY_SECRET) {
  return createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');
}

export const now = () => Math.floor(Date.now() / 1000);
