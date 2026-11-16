import { test } from 'node:test';
import assert from 'node:assert/strict';
import createOrder from '../api/create-order.js';
import verifyPayment from '../api/verify-payment.js';
import restore from '../api/restore.js';
import packs from '../api/packs.js';
import plans from '../api/plans.js';
import { call, configured, forbidFetch, mockReq, mockRes, useEnv } from './helpers.js';

const ROUTES = [
  ['create-order', createOrder, 'POST'],
  ['verify-payment', verifyPayment, 'POST'],
  ['restore', restore, 'POST'],
  ['packs', packs, 'GET'],
  ['plans', plans, 'GET'],
];

for (const [name, handler, method] of ROUTES) {
  test(`${name}: OPTIONS preflight answers 204 with CORS headers`, async (t) => {
    useEnv(t, configured());
    forbidFetch(t);
    const res = await call(handler, { method: 'OPTIONS', headers: { origin: 'https://appassets.androidplatform.net', 'access-control-request-method': method } });
    assert.equal(res.statusCode, 204);
    assert.equal(res.headers['access-control-allow-origin'], '*');
    assert.equal(res.headers['access-control-allow-methods'], `${method}, OPTIONS`);
    assert.equal(res.headers['access-control-allow-headers'], 'Content-Type, Authorization');
    assert.equal(res.body, '');
  });

  test(`${name}: wrong method gives 405 JSON`, async (t) => {
    useEnv(t, configured());
    forbidFetch(t);
    const res = await call(handler, { method: method === 'GET' ? 'DELETE' : 'GET' });
    assert.equal(res.statusCode, 405);
    assert.equal(res.data.error, 'method_not_allowed');
    assert.match(res.headers['content-type'], /application\/json/);
  });
}

test('ALLOWED_ORIGINS: listed origins are echoed with Vary: Origin', async (t) => {
  useEnv(t, { ...configured(), ALLOWED_ORIGINS: 'https://dareup.example, https://appassets.androidplatform.net' });
  const res = await call(plans, { method: 'GET', headers: { origin: 'https://appassets.androidplatform.net' } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['access-control-allow-origin'], 'https://appassets.androidplatform.net');
  assert.equal(res.headers.vary, 'Origin');
});

test('ALLOWED_ORIGINS: other origins are refused (preflight 403, request 403)', async (t) => {
  useEnv(t, { ...configured(), ALLOWED_ORIGINS: 'https://dareup.example' });
  forbidFetch(t);
  const pre = await call(createOrder, { method: 'OPTIONS', headers: { origin: 'https://evil.example' } });
  assert.equal(pre.statusCode, 403);
  assert.equal(pre.headers['access-control-allow-origin'], undefined);
  const res = await call(createOrder, { body: { plan: 'monthly' }, headers: { origin: 'https://evil.example' } });
  assert.equal(res.statusCode, 403);
  assert.equal(res.data.error, 'origin_not_allowed');
});

test('ALLOWED_ORIGINS: the site\'s own origin is always allowed; "null" only when listed', async (t) => {
  useEnv(t, { ...configured(), ALLOWED_ORIGINS: 'https://appassets.androidplatform.net' });
  const same = await call(plans, { method: 'GET', headers: { origin: 'https://dareup.example', host: 'dareup.example' } });
  assert.equal(same.statusCode, 200);
  const fileOrigin = await call(plans, { method: 'GET', headers: { origin: 'null' } });
  assert.equal(fileOrigin.statusCode, 403);

  await t.test('null listed', async (tt) => {
    useEnv(tt, { ...configured(), ALLOWED_ORIGINS: 'null' });
    const ok = await call(plans, { method: 'GET', headers: { origin: 'null' } });
    assert.equal(ok.statusCode, 200);
    assert.equal(ok.headers['access-control-allow-origin'], 'null');
  });
});

test('ALLOWED_ORIGINS="*" behaves like unset', async (t) => {
  useEnv(t, { ...configured(), ALLOWED_ORIGINS: '*' });
  const res = await call(plans, { method: 'GET', headers: { origin: 'https://anything.example' } });
  assert.equal(res.headers['access-control-allow-origin'], '*');
});

test('bodies over 2 KB are refused with 413', async (t) => {
  useEnv(t, configured());
  forbidFetch(t);
  const big = await call(createOrder, { body: { plan: 'monthly', pad: 'x'.repeat(5000) } });
  assert.equal(big.statusCode, 413);
  const declared = await call(createOrder, { body: { plan: 'monthly' }, headers: { 'content-length': '999999' } });
  assert.equal(declared.statusCode, 413);
});

test('invalid JSON is a 400 (string body and throwing Vercel getter)', async (t) => {
  useEnv(t, configured());
  forbidFetch(t);
  assert.equal((await call(createOrder, { body: '{not json' })).statusCode, 400);
  const req = mockReq({});
  Object.defineProperty(req, 'body', { get() { throw new Error('Invalid JSON'); } });
  const res = mockRes();
  await createOrder(req, res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.data.error, 'invalid_json');
  assert.equal((await call(createOrder, { body: '["monthly"]' })).statusCode, 400);
});

test('string JSON bodies (text/plain) are parsed', async (t) => {
  useEnv(t, { PASS_SECRET: 'x'.repeat(40), DEMO_MODE: '1' });
  forbidFetch(t);
  const res = await call(createOrder, { body: JSON.stringify({ plan: 'monthly' }), headers: { 'content-type': 'text/plain' } });
  assert.equal(res.statusCode, 200);
});

test('every response is JSON with no-store caching and nosniff', async (t) => {
  useEnv(t, configured());
  forbidFetch(t);
  const res = await call(createOrder, { body: { plan: 'nope' } });
  assert.equal(res.headers['cache-control'], 'no-store');
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
});
