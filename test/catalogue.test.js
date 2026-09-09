import './helpers.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogue, stateBySlugOrCode, districtIn } from '../lib/catalogue.js';
import { suggest } from '../lib/search.js';

test('the catalogue covers every state and union territory', () => {
  const c = catalogue();
  assert.equal(c.stats.states, 36);
  assert.equal(c.states.filter((s) => s.kind === 'UT').length, 8);
  assert.ok(c.stats.districts > 700, `expected 700+ districts, got ${c.stats.districts}`);
});

test('the hierarchy runs state → district → village', () => {
  const state = stateBySlugOrCode('himachal-pradesh');
  assert.equal(state.code, 'HP');
  assert.equal(state.districtIds.length, 12);

  const kinnaur = districtIn(state, 'kinnaur');
  const c = catalogue();
  const places = kinnaur.placeIds.map((id) => c.placeById.get(id));
  const chitkul = places.find((p) => p.name === 'Chitkul');
  assert.equal(chitkul.kind, 'VILLAGE');
  assert.ok(places.some((p) => p.isHq && p.name === 'Reckong Peo'), 'district HQ is present');
  assert.ok(places.every((p) => p.propertyIds.length > 0), 'every settlement has stays');
});

test('villages, towns and cities are all represented', () => {
  const { stats } = catalogue();
  assert.ok(stats.villages > 300, `expected 300+ villages, got ${stats.villages}`);
  assert.ok(stats.towns > 800);
  assert.ok(stats.cities > 100);
  assert.ok(stats.properties > 5000);
  assert.ok(stats.rooms > 15000);
});

test('a state can be found by slug or by code', () => {
  assert.equal(stateBySlugOrCode('KL').name, 'Kerala');
  assert.equal(stateBySlugOrCode('kerala').code, 'KL');
  assert.equal(stateBySlugOrCode('atlantis'), null);
});

test('every property has photographs and rooms', () => {
  const c = catalogue();
  for (const property of [c.properties[0], c.properties[3000], c.properties.at(-1)]) {
    assert.ok(property.photos.length >= 4, 'at least four photographs');
    assert.ok(property.photos.every((p) => p.url && p.alt), 'each photo has a source and alt text');
    assert.ok(property.roomIds.length >= 2, 'at least two room types');
  }
});

test('type-ahead finds a village with its district and state', () => {
  const [hit] = suggest('Mawlynnong');
  assert.equal(hit.name, 'Mawlynnong');
  assert.equal(hit.state, 'Meghalaya');
  assert.equal(hit.district, 'East Khasi Hills');
});

test('type-ahead ranks exact prefixes above partial matches', () => {
  const results = suggest('Man').filter((r) => r.type === 'place');
  assert.ok(results.length > 1);
  assert.ok(results[0].name.toLowerCase().startsWith('man'));
});

test('the catalogue is identical on every build', () => {
  const first = catalogue().properties[42];
  assert.equal(first.slug, catalogue().properties[42].slug);
  assert.equal(first.basePrice, catalogue().properties[42].basePrice);
});
