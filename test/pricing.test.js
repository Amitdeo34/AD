import './helpers.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { quote, gstRateFor, nightsBetween, nightsIn } from '../lib/pricing.js';

test('nights are counted between check-in and check-out', () => {
  assert.equal(nightsBetween('2026-01-01', '2026-01-04'), 3);
  assert.deepEqual(nightsIn('2026-01-01', '2026-01-03'), ['2026-01-01', '2026-01-02']);
});

test('nights count correctly across a month boundary and a leap day', () => {
  assert.equal(nightsBetween('2026-01-30', '2026-02-02'), 3);
  assert.equal(nightsBetween('2028-02-28', '2028-03-01'), 2);
});

test('GST follows the tariff slab', () => {
  assert.equal(gstRateFor(1200), 0.05);
  assert.equal(gstRateFor(7500), 0.05);
  assert.equal(gstRateFor(7501), 0.18);
});

test('a quote multiplies rooms by nights and adds the right GST', () => {
  const q = quote({ pricePerNight: 2000, checkIn: '2026-03-01', checkOut: '2026-03-04', rooms: 2 });
  assert.equal(q.nights, 3);
  assert.equal(q.roomTotal, 12000);
  assert.equal(q.taxTotal, 600);
  assert.equal(q.grandTotal, 12600);
});

test('a luxury tariff is taxed at the higher slab', () => {
  const q = quote({ pricePerNight: 10000, checkIn: '2026-03-01', checkOut: '2026-03-02', rooms: 1 });
  assert.equal(q.taxTotal, 1800);
  assert.equal(q.grandTotal, 11800);
});
