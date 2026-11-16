import { test } from 'node:test';
import assert from 'node:assert/strict';
import packsHandler from '../api/packs.js';
import plansHandler from '../api/plans.js';
import { signPass } from '../api/_lib/token.js';
import { PREMIUM_PACKS } from '../api/_lib/premium-packs.js';
import { TEST_SECRET, call, configured, forbidFetch, now, useEnv } from './helpers.js';

const pass = (over = {}) => signPass({ plan: 'monthly', pid: 'pay_P1234567890', oid: 'order_O1234567890', iat: now(), exp: now() + 86400, ...over }, TEST_SECRET);
const get = (token) => call(packsHandler, { method: 'GET', headers: token === undefined ? {} : { authorization: `Bearer ${token}` } });

test('GET /api/packs with a valid pass returns every premium pack', async (t) => {
  useEnv(t, configured());
  forbidFetch(t);
  const res = await get(pass());
  assert.equal(res.statusCode, 200);
  assert.equal(res.data.plan, 'monthly');
  assert.deepEqual(res.data.packs.map((p) => p.id), ['party', 'couples', 'desi', 'office', 'deep', 'challenge']);
  assert.equal(res.data.packs.length, PREMIUM_PACKS.length);
  assert.equal(res.headers['cache-control'], 'private, no-store');
});

test('401 without a token, with junk, or with a forged token', async (t) => {
  useEnv(t, configured());
  forbidFetch(t);
  for (const token of [undefined, '', 'nope', pass().replace(/.$/, (c) => (c === 'A' ? 'B' : 'A'))]) {
    const res = await get(token);
    assert.equal(res.statusCode, 401);
    assert.equal(res.data.error, 'unauthorized');
    assert.equal(res.data.packs, undefined);
  }
});

test('401 "expired" for an expired pass', async (t) => {
  useEnv(t, configured());
  const res = await get(pass({ iat: now() - 100, exp: now() - 10 }));
  assert.equal(res.statusCode, 401);
  assert.equal(res.data.error, 'expired');
});

test('demo passes work only while DEMO_MODE is on', async (t) => {
  const token = pass({ demo: true });
  await t.test('demo on', async (tt) => {
    useEnv(tt, { PASS_SECRET: TEST_SECRET, DEMO_MODE: '1' });
    assert.equal((await get(token)).statusCode, 200);
  });
  await t.test('demo off', async (tt) => {
    useEnv(tt, configured());
    const res = await get(token);
    assert.equal(res.statusCode, 401);
    assert.equal(res.data.reason, 'demo_disabled');
  });
});

test('503 when PASS_SECRET is not set', async (t) => {
  useEnv(t, {});
  const res = await get('whatever');
  assert.equal(res.statusCode, 503);
});

test('only GET is allowed on /api/packs', async (t) => {
  useEnv(t, configured());
  assert.equal((await call(packsHandler, { method: 'POST', body: {} })).statusCode, 405);
});

test('GET /api/plans lists the three passes in INR', async (t) => {
  useEnv(t, configured());
  forbidFetch(t);
  const res = await call(plansHandler, { method: 'GET' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.data.currency, 'INR');
  assert.equal(res.data.paymentsReady, true);
  assert.equal(res.data.demo, false);
  assert.deepEqual(res.data.plans.map((p) => [p.id, p.price, p.amount, p.days]), [
    ['monthly', 49, 4900, 30],
    ['yearly', 199, 19900, 365],
    ['lifetime', 499, 49900, null],
  ]);
});

test('/api/plans reports paymentsReady=false when unconfigured, and demo when on', async (t) => {
  await t.test('unconfigured', async (tt) => {
    useEnv(tt, {});
    assert.equal((await call(plansHandler, { method: 'GET' })).data.paymentsReady, false);
  });
  await t.test('demo', async (tt) => {
    useEnv(tt, { PASS_SECRET: TEST_SECRET, DEMO_MODE: 'true' });
    const d = (await call(plansHandler, { method: 'GET' })).data;
    assert.equal(d.demo, true);
    assert.equal(d.paymentsReady, true);
  });
});
