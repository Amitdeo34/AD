import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/create-order.js';
import { appName } from '../api/_lib/config.js';
import { KEY_ID, KEY_SECRET, TEST_SECRET, call, configured, forbidFetch, mockFetch, useEnv } from './helpers.js';

test('creates a Razorpay order with the server-side amount and notes', async (t) => {
  useEnv(t, configured());
  const calls = mockFetch(t, {
    'POST /orders': ({ init }) => {
      const body = JSON.parse(init.body);
      return { body: { id: 'order_TEST123456789', amount: body.amount, currency: body.currency, status: 'created', notes: body.notes } };
    },
  });
  // The client tries to sneak in its own amount: it must be ignored.
  const res = await call(handler, { body: { plan: 'yearly', amount: 100, currency: 'USD' } });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.data, { orderId: 'order_TEST123456789', amount: 19900, currency: 'INR', keyId: KEY_ID, plan: 'yearly', name: appName() });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.razorpay.com/v1/orders');
  assert.equal(calls[0].init.headers.Authorization, `Basic ${Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString('base64')}`);
  assert.equal(calls[0].body.amount, 19900);
  assert.equal(calls[0].body.currency, 'INR');
  assert.deepEqual(calls[0].body.notes, { plan: 'yearly', app: 'dareup' });
  assert.ok(calls[0].body.receipt.length <= 40);
});

test('prices: monthly 4900, yearly 19900, lifetime 49900 paise', async (t) => {
  useEnv(t, configured());
  const seen = {};
  mockFetch(t, { 'POST /orders': ({ init }) => { const b = JSON.parse(init.body); seen[b.notes.plan] = b.amount; return { body: { id: 'order_X1234567', amount: b.amount, currency: 'INR' } }; } });
  for (const plan of ['monthly', 'yearly', 'lifetime']) assert.equal((await call(handler, { body: { plan } })).statusCode, 200);
  assert.deepEqual(seen, { monthly: 4900, yearly: 19900, lifetime: 49900 });
});

test('response never contains the key secret or PASS_SECRET', async (t) => {
  useEnv(t, configured());
  mockFetch(t, { 'POST /orders': { body: { id: 'order_TEST123456789', amount: 4900, currency: 'INR' } } });
  const res = await call(handler, { body: { plan: 'monthly' } });
  assert.ok(!res.body.includes(KEY_SECRET));
  assert.ok(!res.body.includes(TEST_SECRET));
});

test('rejects unknown plans, including prototype keys', async (t) => {
  useEnv(t, configured());
  forbidFetch(t);
  for (const plan of [undefined, '', 'free', '__proto__', 'constructor', 'toString', 49]) {
    const res = await call(handler, { body: { plan } });
    assert.equal(res.statusCode, 400, `plan ${String(plan)}`);
    assert.equal(res.data.error, 'invalid_plan');
  }
});

test('503 payments_not_configured when Razorpay keys are missing (never a free pass)', async (t) => {
  useEnv(t, { PASS_SECRET: TEST_SECRET });
  forbidFetch(t);
  const res = await call(handler, { body: { plan: 'monthly' } });
  assert.equal(res.statusCode, 503);
  assert.equal(res.data.error, 'payments_not_configured');
  assert.equal(res.data.orderId, undefined);
});

test('503 when PASS_SECRET is missing or shorter than 32 chars, before any order is made', async (t) => {
  useEnv(t, { RAZORPAY_KEY_ID: KEY_ID, RAZORPAY_KEY_SECRET: KEY_SECRET, PASS_SECRET: 'too-short' });
  forbidFetch(t);
  const res = await call(handler, { body: { plan: 'monthly' } });
  assert.equal(res.statusCode, 503);
  assert.equal(res.data.error, 'payments_not_configured');
});

test('DEMO_MODE=1 returns a demo order without calling Razorpay', async (t) => {
  useEnv(t, { PASS_SECRET: TEST_SECRET, DEMO_MODE: '1' });
  forbidFetch(t);
  const res = await call(handler, { body: { plan: 'lifetime' } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.data.demo, true);
  assert.equal(res.data.keyId, null);
  assert.equal(res.data.amount, 49900);
  assert.match(res.data.orderId, /^demo_order_lifetime_[A-Za-z0-9]+$/);
});

test('DEMO_MODE values other than 1/true do not enable demo mode', async (t) => {
  for (const value of ['0', 'false', 'yes', ' ']) {
    await t.test(`DEMO_MODE=${JSON.stringify(value)}`, async (tt) => {
      useEnv(tt, { PASS_SECRET: TEST_SECRET, DEMO_MODE: value });
      forbidFetch(tt);
      const res = await call(handler, { body: { plan: 'monthly' } });
      assert.equal(res.statusCode, 503);
    });
  }
});

test('Razorpay failure becomes a 502 with a friendly message', async (t) => {
  useEnv(t, configured());
  mockFetch(t, { 'POST /orders': { status: 500, body: { error: { code: 'SERVER_ERROR' } } } });
  const res = await call(handler, { body: { plan: 'monthly' } });
  assert.equal(res.statusCode, 502);
  assert.equal(res.data.error, 'payment_provider_error');
});

test('only POST is allowed', async (t) => {
  useEnv(t, configured());
  forbidFetch(t);
  const res = await call(handler, { method: 'GET' });
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.allow, 'POST, OPTIONS');
});
