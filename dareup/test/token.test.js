import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signPass, verifyPass, PassConfigError } from '../api/_lib/token.js';
import { TEST_SECRET, now } from './helpers.js';

const base = () => ({ plan: 'monthly', pid: 'pay_ABC123def456', oid: 'order_XYZ987abc654', iat: now(), exp: now() + 30 * 86400 });

test('sign then verify returns the payload', () => {
  const token = signPass(base(), TEST_SECRET);
  const r = verifyPass(token, TEST_SECRET);
  assert.equal(r.ok, true);
  assert.equal(r.payload.v, 1);
  assert.equal(r.payload.plan, 'monthly');
  assert.equal(r.payload.pid, 'pay_ABC123def456');
  assert.equal(r.payload.oid, 'order_XYZ987abc654');
  assert.deepEqual(Object.keys(r.payload).sort(), ['exp', 'iat', 'oid', 'pid', 'plan', 'v']);
});

test('token format is base64url(payload).base64url(hmac)', () => {
  const token = signPass(base(), TEST_SECRET);
  const [part, sig] = token.split('.');
  assert.match(part, /^[A-Za-z0-9_-]+$/);
  assert.match(sig, /^[A-Za-z0-9_-]{43}$/);
  const payload = JSON.parse(Buffer.from(part, 'base64url').toString());
  assert.equal(payload.plan, 'monthly'); // the client can read it
});

test('lifetime passes have exp null and never expire', () => {
  const token = signPass({ ...base(), plan: 'lifetime', exp: null }, TEST_SECRET);
  const r = verifyPass(token, TEST_SECRET, { now: now() + 50 * 365 * 86400 });
  assert.equal(r.ok, true);
  assert.equal(r.payload.exp, null);
});

test('expired passes are rejected with reason "expired"', () => {
  const token = signPass({ ...base(), iat: now() - 40 * 86400, exp: now() - 10 * 86400 }, TEST_SECRET);
  const r = verifyPass(token, TEST_SECRET);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'expired');
});

test('a pass is valid until its expiry second, not after', () => {
  const exp = now() + 100;
  const token = signPass({ ...base(), exp }, TEST_SECRET);
  assert.equal(verifyPass(token, TEST_SECRET, { now: exp - 1 }).ok, true);
  assert.equal(verifyPass(token, TEST_SECRET, { now: exp }).reason, 'expired');
});

test('tampered payload (upgraded plan) fails the signature check', () => {
  const token = signPass(base(), TEST_SECRET);
  const [part, sig] = token.split('.');
  const payload = JSON.parse(Buffer.from(part, 'base64url').toString());
  payload.plan = 'lifetime';
  payload.exp = null;
  const forged = `${Buffer.from(JSON.stringify(payload)).toString('base64url')}.${sig}`;
  assert.equal(verifyPass(forged, TEST_SECRET).reason, 'bad_signature');
});

test('tampered or foreign signatures fail', () => {
  const token = signPass(base(), TEST_SECRET);
  const [part, sig] = token.split('.');
  const flipped = sig[0] === 'A' ? `B${sig.slice(1)}` : `A${sig.slice(1)}`;
  assert.equal(verifyPass(`${part}.${flipped}`, TEST_SECRET).reason, 'bad_signature');
  const other = signPass(base(), 'another-secret-that-is-long-enough-123');
  assert.equal(verifyPass(other, TEST_SECRET).reason, 'bad_signature');
});

test('malformed tokens are rejected without throwing', () => {
  for (const bad of [undefined, null, '', 'abc', 'a.b', 'a.b.c', `${'x'.repeat(20)}.${'y'.repeat(10)}`, '💥.💥', 42]) {
    const r = verifyPass(bad, TEST_SECRET);
    assert.equal(r.ok, false, `accepted ${String(bad)}`);
  }
});

test('demo passes only verify while DEMO_MODE allows them', () => {
  const token = signPass({ ...base(), demo: true }, TEST_SECRET);
  assert.equal(verifyPass(token, TEST_SECRET).reason, 'demo_disabled');
  assert.equal(verifyPass(token, TEST_SECRET, { allowDemo: true }).ok, true);
});

test('refuses to sign or verify with a missing or short PASS_SECRET', () => {
  assert.throws(() => signPass(base(), ''), PassConfigError);
  assert.throws(() => signPass(base(), 'short-secret'), PassConfigError);
  assert.throws(() => verifyPass('a.b', undefined), PassConfigError);
});

test('refuses unknown plans', () => {
  assert.throws(() => signPass({ ...base(), plan: 'forever-free' }, TEST_SECRET));
});
