import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/verify-payment.js';
import { verifyPass } from '../api/_lib/token.js';
import { TEST_SECRET, call, checkoutSignature, configured, forbidFetch, mockFetch, now, useEnv } from './helpers.js';

const OID = 'order_Verify1234567';
const PID = 'pay_Verify76543210';
const goodBody = (extra = {}) => ({ razorpay_order_id: OID, razorpay_payment_id: PID, razorpay_signature: checkoutSignature(OID, PID), ...extra });

function razorpay(t, { order = {}, payment = {} } = {}) {
  return mockFetch(t, {
    [`GET /orders/${OID}`]: { body: { id: OID, status: 'paid', amount: 4900, currency: 'INR', notes: { plan: 'monthly', app: 'dareup' }, ...order } },
    [`GET /payments/${PID}`]: { body: { id: PID, order_id: OID, status: 'captured', created_at: now() - 60, email: 'player@example.com', ...payment } },
  });
}

test('happy path: valid signature + paid order issues a pass token', async (t) => {
  useEnv(t, configured());
  const calls = razorpay(t);
  const res = await call(handler, { body: goodBody() });
  assert.equal(res.statusCode, 200);
  assert.equal(res.data.plan, 'monthly');
  assert.equal(res.data.paymentId, PID);
  const v = verifyPass(res.data.token, TEST_SECRET);
  assert.equal(v.ok, true);
  assert.equal(v.payload.pid, PID);
  assert.equal(v.payload.oid, OID);
  assert.equal(v.payload.exp, res.data.exp);
  assert.deepEqual(calls.map((c) => c.key), [`GET /orders/${OID}`, `GET /payments/${PID}`]);
});

test('the plan comes from order notes, never from the client', async (t) => {
  useEnv(t, configured());
  razorpay(t, { order: { notes: { plan: 'monthly', app: 'dareup' } } });
  const res = await call(handler, { body: goodBody({ plan: 'lifetime' }) });
  assert.equal(res.statusCode, 200);
  assert.equal(res.data.plan, 'monthly');
  assert.notEqual(res.data.exp, null);
});

test('expiry runs from the payment time, so replaying verify never extends a pass', async (t) => {
  useEnv(t, configured());
  const paidAt = now() - 10 * 86400;
  razorpay(t, { payment: { created_at: paidAt } });
  const res = await call(handler, { body: goodBody() });
  assert.equal(res.data.exp, paidAt + 30 * 86400);
});

test('a monthly pass paid more than 30 days ago gets 410 expired', async (t) => {
  useEnv(t, configured());
  razorpay(t, { payment: { created_at: now() - 31 * 86400 } });
  const res = await call(handler, { body: goodBody() });
  assert.equal(res.statusCode, 410);
  assert.equal(res.data.error, 'expired');
});

test('lifetime orders produce exp null', async (t) => {
  useEnv(t, configured());
  razorpay(t, { order: { notes: { plan: 'lifetime', app: 'dareup' } } });
  const res = await call(handler, { body: goodBody() });
  assert.equal(res.statusCode, 200);
  assert.equal(res.data.plan, 'lifetime');
  assert.equal(res.data.exp, null);
});

test('bad signature is rejected before Razorpay is called', async (t) => {
  useEnv(t, configured());
  forbidFetch(t);
  const res = await call(handler, { body: goodBody({ razorpay_signature: checkoutSignature(OID, PID, 'someone_elses_secret') }) });
  assert.equal(res.statusCode, 400);
  assert.equal(res.data.error, 'invalid_signature');
});

test('malformed ids are rejected', async (t) => {
  useEnv(t, configured());
  forbidFetch(t);
  for (const body of [{}, goodBody({ razorpay_order_id: 'order_../../x' }), goodBody({ razorpay_payment_id: 42 }), goodBody({ razorpay_signature: undefined })]) {
    const res = await call(handler, { body });
    assert.equal(res.statusCode, 400);
  }
});

test('orders from another app on the same Razorpay account are refused', async (t) => {
  useEnv(t, configured());
  razorpay(t, { order: { notes: { plan: 'monthly', app: 'hotel' } } });
  const res = await call(handler, { body: goodBody() });
  assert.equal(res.statusCode, 400);
  assert.equal(res.data.error, 'unknown_order');
});

test('payment for a different order is refused', async (t) => {
  useEnv(t, configured());
  razorpay(t, { payment: { order_id: 'order_Someone000000' } });
  const res = await call(handler, { body: goodBody() });
  assert.equal(res.statusCode, 400);
  assert.equal(res.data.error, 'payment_mismatch');
});

test('authorized-but-not-captured payment returns 402 payment_pending', async (t) => {
  useEnv(t, configured());
  razorpay(t, { order: { status: 'attempted' }, payment: { status: 'authorized' } });
  const res = await call(handler, { body: goodBody() });
  assert.equal(res.statusCode, 402);
  assert.equal(res.data.error, 'payment_pending');
});

test('captured payment is enough even if the order status lags', async (t) => {
  useEnv(t, configured());
  razorpay(t, { order: { status: 'attempted' }, payment: { status: 'captured' } });
  assert.equal((await call(handler, { body: goodBody() })).statusCode, 200);
});

test('refunded payments do not unlock Premium', async (t) => {
  useEnv(t, configured());
  razorpay(t, { payment: { status: 'refunded', refund_status: 'full' } });
  const res = await call(handler, { body: goodBody() });
  assert.equal(res.statusCode, 402);
  assert.equal(res.data.error, 'refunded');
});

test('Razorpay outage returns 502', async (t) => {
  useEnv(t, configured());
  mockFetch(t, { [`GET /orders/${OID}`]: { throw: new TypeError('fetch failed') } });
  const res = await call(handler, { body: goodBody() });
  assert.equal(res.statusCode, 502);
});

test('503 when not configured, even with a valid-looking body', async (t) => {
  useEnv(t, { PASS_SECRET: TEST_SECRET });
  forbidFetch(t);
  const res = await call(handler, { body: goodBody() });
  assert.equal(res.statusCode, 503);
  assert.equal(res.data.error, 'payments_not_configured');
  assert.equal(res.data.token, undefined);
});

test('DEMO_MODE: demo orders get a demo pass without Razorpay', async (t) => {
  useEnv(t, { PASS_SECRET: TEST_SECRET, DEMO_MODE: '1' });
  forbidFetch(t);
  const res = await call(handler, { body: { razorpay_order_id: 'demo_order_yearly_AbCdEf123', razorpay_payment_id: 'demo_pay_Xyz123456', razorpay_signature: 'demo' } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.data.plan, 'yearly');
  assert.equal(res.data.demo, true);
  assert.ok(Math.abs(res.data.exp - (now() + 365 * 86400)) < 5);
  assert.equal(verifyPass(res.data.token, TEST_SECRET, { allowDemo: true }).payload.demo, true);
  assert.equal(verifyPass(res.data.token, TEST_SECRET).reason, 'demo_disabled');
});

test('demo orders are refused when DEMO_MODE is off', async (t) => {
  useEnv(t, configured());
  forbidFetch(t);
  const res = await call(handler, { body: { razorpay_order_id: 'demo_order_yearly_AbCdEf123', razorpay_payment_id: 'demo_pay_Xyz123456', razorpay_signature: 'demo' } });
  assert.equal(res.statusCode, 400);
  assert.equal(res.data.token, undefined);
});

test('DEMO_MODE rejects unknown demo plans', async (t) => {
  useEnv(t, { PASS_SECRET: TEST_SECRET, DEMO_MODE: '1' });
  forbidFetch(t);
  const res = await call(handler, { body: { razorpay_order_id: 'demo_order_forever_AbCdEf123', razorpay_payment_id: 'demo_pay_Xyz123456' } });
  assert.equal(res.statusCode, 400);
});
