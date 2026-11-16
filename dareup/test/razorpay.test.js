import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyPaymentSignature, razorpayRequest, RazorpayError, isRefunded } from '../api/_lib/razorpay.js';
import { KEY_ID, KEY_SECRET, checkoutSignature, mockFetch } from './helpers.js';

const OID = 'order_Abc123Def456Gh';
const PID = 'pay_Zyx987Wvu654Ts';

test('accepts the correct Checkout signature', () => {
  assert.equal(verifyPaymentSignature(OID, PID, checkoutSignature(OID, PID), KEY_SECRET), true);
});

test('rejects a signature made with another secret', () => {
  assert.equal(verifyPaymentSignature(OID, PID, checkoutSignature(OID, PID, 'wrong_secret'), KEY_SECRET), false);
});

test('rejects a signature for a different order or payment', () => {
  const sig = checkoutSignature(OID, PID);
  assert.equal(verifyPaymentSignature('order_Other000000000', PID, sig, KEY_SECRET), false);
  assert.equal(verifyPaymentSignature(OID, 'pay_Other00000000000', sig, KEY_SECRET), false);
});

test('rejects malformed signatures without throwing', () => {
  for (const bad of ['', 'demo', 'zz'.repeat(32), checkoutSignature(OID, PID).slice(0, 62), null, undefined, 123]) {
    assert.equal(verifyPaymentSignature(OID, PID, bad, KEY_SECRET), false);
  }
});

test('uses Basic auth with key_id:key_secret and returns JSON', async (t) => {
  const calls = mockFetch(t, { 'GET /orders/order_1': { body: { id: 'order_1' } } });
  const data = await razorpayRequest({ keyId: KEY_ID, keySecret: KEY_SECRET }, 'GET', '/orders/order_1');
  assert.equal(data.id, 'order_1');
  assert.equal(calls[0].url, 'https://api.razorpay.com/v1/orders/order_1');
  assert.equal(calls[0].init.headers.Authorization, `Basic ${Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString('base64')}`);
});

test('turns HTTP and network failures into RazorpayError without leaking secrets', async (t) => {
  mockFetch(t, {
    'GET /orders/bad': { status: 401, body: { error: { code: 'BAD_REQUEST_ERROR', description: 'Authentication failed' } } },
    'GET /orders/down': { throw: new TypeError('fetch failed') },
  });
  const keys = { keyId: KEY_ID, keySecret: KEY_SECRET };
  await assert.rejects(razorpayRequest(keys, 'GET', '/orders/bad'), (err) => {
    assert.ok(err instanceof RazorpayError);
    assert.equal(err.status, 401);
    assert.equal(err.code, 'BAD_REQUEST_ERROR');
    assert.ok(!err.message.includes(KEY_SECRET));
    return true;
  });
  await assert.rejects(razorpayRequest(keys, 'GET', '/orders/down'), (err) => err instanceof RazorpayError && err.status === 0);
});

test('isRefunded spots full refunds only', () => {
  assert.equal(isRefunded({ status: 'refunded' }), true);
  assert.equal(isRefunded({ status: 'captured', refund_status: 'full' }), true);
  assert.equal(isRefunded({ status: 'captured', refund_status: 'partial' }), false);
  assert.equal(isRefunded({ status: 'captured', refund_status: null }), false);
});
