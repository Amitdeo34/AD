import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/restore.js';
import { verifyPass } from '../api/_lib/token.js';
import { TEST_SECRET, call, configured, forbidFetch, mockFetch, now, useEnv } from './helpers.js';

const PID = 'pay_Restore1234567';
const OID = 'order_Restore76543';
const EMAIL = 'buyer@example.com';

function razorpay(t, { payment = {}, order = {}, paymentRoute, orderRoute } = {}) {
  return mockFetch(t, {
    [`GET /payments/${PID}`]: paymentRoute || { body: { id: PID, order_id: OID, status: 'captured', email: EMAIL, created_at: now() - 5 * 86400, ...payment } },
    [`GET /orders/${OID}`]: orderRoute || { body: { id: OID, status: 'paid', notes: { plan: 'monthly', app: 'dareup' }, ...order } },
  });
}

test('restores a captured payment with a matching email (case-insensitive)', async (t) => {
  useEnv(t, configured());
  const createdAt = now() - 5 * 86400;
  razorpay(t, { payment: { created_at: createdAt } });
  const res = await call(handler, { body: { paymentId: PID, email: '  Buyer@Example.COM ' } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.data.plan, 'monthly');
  assert.equal(res.data.exp, createdAt + 30 * 86400);
  const v = verifyPass(res.data.token, TEST_SECRET);
  assert.equal(v.ok, true);
  assert.equal(v.payload.pid, PID);
  assert.equal(v.payload.oid, OID);
});

test('lifetime restores never expire', async (t) => {
  useEnv(t, configured());
  razorpay(t, { payment: { created_at: now() - 900 * 86400 }, order: { notes: { plan: 'lifetime', app: 'dareup' } } });
  const res = await call(handler, { body: { paymentId: PID, email: EMAIL } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.data.exp, null);
});

test('expired passes return 410 with a clear message', async (t) => {
  useEnv(t, configured());
  razorpay(t, { payment: { created_at: now() - 40 * 86400 } });
  const res = await call(handler, { body: { paymentId: PID, email: EMAIL } });
  assert.equal(res.statusCode, 410);
  assert.equal(res.data.error, 'expired');
  assert.match(res.data.message, /monthly pass ended on/);
  assert.equal(res.data.token, undefined);
});

test('wrong email and unknown payment ID give the same 404 (no existence leak)', async (t) => {
  useEnv(t, configured());
  razorpay(t);
  const wrongEmail = await call(handler, { body: { paymentId: PID, email: 'someone@example.com' } });

  await t.test('unknown id', async (tt) => {
    mockFetch(tt, { 'GET /payments/pay_Unknown12345678': { status: 400, body: { error: { code: 'BAD_REQUEST_ERROR', description: 'The id provided does not exist' } } } });
    const unknown = await call(handler, { body: { paymentId: 'pay_Unknown12345678', email: 'someone@example.com' } });
    assert.equal(unknown.statusCode, 404);
    assert.equal(wrongEmail.statusCode, 404);
    assert.deepEqual(unknown.data, wrongEmail.data);
  });
});

test('wrong email does not even look up the order', async (t) => {
  useEnv(t, configured());
  const calls = razorpay(t);
  await call(handler, { body: { paymentId: PID, email: 'someone@example.com' } });
  assert.deepEqual(calls.map((c) => c.key), [`GET /payments/${PID}`]);
});

test('payments for another app look like "not found"', async (t) => {
  useEnv(t, configured());
  razorpay(t, { order: { notes: { plan: 'monthly', app: 'hotel' } } });
  const res = await call(handler, { body: { paymentId: PID, email: EMAIL } });
  assert.equal(res.statusCode, 404);
  assert.equal(res.data.error, 'not_found');
});

test('uncaptured and refunded payments are refused', async (t) => {
  await t.test('authorized only', async (tt) => {
    useEnv(tt, configured());
    razorpay(tt, { payment: { status: 'authorized' } });
    const res = await call(handler, { body: { paymentId: PID, email: EMAIL } });
    assert.equal(res.statusCode, 402);
    assert.equal(res.data.error, 'payment_pending');
  });
  await t.test('refunded', async (tt) => {
    useEnv(tt, configured());
    razorpay(tt, { payment: { status: 'refunded', refund_status: 'full' } });
    const res = await call(handler, { body: { paymentId: PID, email: EMAIL } });
    assert.equal(res.statusCode, 402);
    assert.equal(res.data.error, 'refunded');
  });
});

test('input validation happens before any Razorpay call', async (t) => {
  useEnv(t, configured());
  forbidFetch(t);
  for (const body of [{}, { paymentId: PID }, { paymentId: 'order_abc12345', email: EMAIL }, { paymentId: 'pay_../../x', email: EMAIL }, { paymentId: PID, email: 'not-an-email' }, { paymentId: PID, email: `${'a'.repeat(250)}@x.io` }]) {
    const res = await call(handler, { body });
    assert.equal(res.statusCode, 400, JSON.stringify(body).slice(0, 80));
  }
});

test('Razorpay outage is a 502, not a misleading "not found"', async (t) => {
  useEnv(t, configured());
  razorpay(t, { paymentRoute: { status: 503, body: {} } });
  const res = await call(handler, { body: { paymentId: PID, email: EMAIL } });
  assert.equal(res.statusCode, 502);
});

test('503 when payments are not configured', async (t) => {
  useEnv(t, { PASS_SECRET: TEST_SECRET });
  forbidFetch(t);
  const res = await call(handler, { body: { paymentId: PID, email: EMAIL } });
  assert.equal(res.statusCode, 503);
  assert.equal(res.data.error, 'payments_not_configured');
});

test('DEMO_MODE: demo payment ids are explained, not looked up', async (t) => {
  useEnv(t, { PASS_SECRET: TEST_SECRET, DEMO_MODE: '1' });
  forbidFetch(t);
  const res = await call(handler, { body: { paymentId: 'demo_pay_abc123456', email: EMAIL } });
  assert.equal(res.statusCode, 400);
  assert.equal(res.data.error, 'demo_not_restorable');
});
