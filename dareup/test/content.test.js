// Card content: counts per spec, client catalog matches the server, no duplicates,
// and a safety lint over every card (free and premium).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PREMIUM_PACKS } from '../api/_lib/premium-packs.js';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const block = (id) => JSON.parse(new RegExp(`<script type="application/json" id="${id}">([\\s\\S]*?)</script>`).exec(html)[1]);
const FREE = block('dareup-free-packs');
const CATALOG = block('dareup-premium-catalog');

const EXPECTED_FREE = { classic: [40, 40], friends: [30, 30], family: [25, 25] };
const EXPECTED_PREMIUM = { party: [40, 40], couples: [30, 30], desi: [40, 40], office: [25, 25], deep: [40, 10], challenge: [30, 30] };

test('free packs have the specified card counts', () => {
  assert.deepEqual(Object.fromEntries(FREE.map((p) => [p.id, [p.truths.length, p.dares.length]])), EXPECTED_FREE);
});

test('premium packs have the specified card counts', () => {
  assert.deepEqual(Object.fromEntries(PREMIUM_PACKS.map((p) => [p.id, [p.truths.length, p.dares.length]])), EXPECTED_PREMIUM);
});

test('the client premium catalog (names, counts, 18+ flag) matches the server packs', () => {
  assert.deepEqual(CATALOG.map((c) => c.id), PREMIUM_PACKS.map((p) => p.id));
  for (const c of CATALOG) {
    const p = PREMIUM_PACKS.find((x) => x.id === c.id);
    assert.equal(c.name, p.name);
    assert.equal(c.truths, p.truths.length, `${c.id} truths`);
    assert.equal(c.dares, p.dares.length, `${c.id} dares`);
    assert.equal(!!c.adult, !!p.adult, `${c.id} adult`);
  }
  assert.equal(PREMIUM_PACKS.filter((p) => p.adult).map((p) => p.id).join(), 'couples');
});

test('premium card text never ships in index.html', () => {
  for (const p of PREMIUM_PACKS) for (const card of [...p.truths, ...p.dares]) {
    assert.ok(!html.includes(card), `premium card leaked into index.html: ${card}`);
  }
});

const ALL = [...FREE.map((p) => ({ ...p, premium: false })), ...PREMIUM_PACKS.map((p) => ({ ...p, premium: true }))];

test('no duplicate cards inside a pack, no empty or overlong cards', () => {
  for (const p of ALL) {
    const cards = [...p.truths, ...p.dares];
    assert.equal(new Set(cards.map((c) => c.toLowerCase())).size, cards.length, `${p.id} has duplicates`);
    for (const c of cards) {
      assert.ok(c.trim().length >= 10 && c.length <= 200, `${p.id}: bad length: ${c}`);
      assert.ok(!/\{(?!other\})[^}]*\}/.test(c), `${p.id}: unknown placeholder: ${c}`);
    }
  }
});

// Safety lint. Words that should never appear in any card.
const BANNED = /\b(alcohol|beer|wine|vodka|whisk(e)?y|rum|tequila|drunk|tipsy|booze|daru|shara+b|peg|shots?|cigarettes?|smok(e|ing)|vap(e|ing)|weed|ganja|drugs?|sex|sexy|sexual|nude|naked|strip|porn|lick|underwear|prank|steal|shoplift|knife|lighter|fire|roof|balcony|self-harm|harm yourself|cut yourself|jump off|password|address)\b/i;
// Dares must not involve strangers or public posting.
const BANNED_DARES = /\b(stranger|strangers|post|posting|upload|tweet|status update|call your ex|text your ex)\b/i;
const ROMANCE = /\b(kiss|crush|flirt|flirty|date|dating|boyfriend|girlfriend|partner|romantic|love poem)\b/i;

test('no card mentions alcohol, drugs, sex, dangerous stunts, pranks or private info', () => {
  for (const p of ALL) for (const c of [...p.truths, ...p.dares]) {
    assert.ok(!BANNED.test(c), `${p.id}: "${c}" matches ${c.match(BANNED)?.[0]}`);
  }
});

test('no dare involves strangers or posting publicly', () => {
  for (const p of ALL) for (const c of p.dares) {
    assert.ok(!BANNED_DARES.test(c), `${p.id}: "${c}"`);
  }
});

test('kissing appears only in the 18+ pack', () => {
  for (const p of ALL.filter((x) => x.id !== 'couples')) for (const c of [...p.truths, ...p.dares]) {
    assert.ok(!/\bkiss(es|ed|ing)?\b/i.test(c), `${p.id}: "${c}"`); // not Hinglish "kisse"
  }
});

test('Family & Kids and Office Safe have no romance at all', () => {
  for (const id of ['family', 'office']) {
    const p = ALL.find((x) => x.id === id);
    for (const c of [...p.truths, ...p.dares]) assert.ok(!ROMANCE.test(c), `${id}: "${c}"`);
  }
});

test('couples dares are aimed at "your partner", never at a random other player', () => {
  const p = ALL.find((x) => x.id === 'couples');
  for (const c of [...p.truths, ...p.dares]) assert.ok(!c.includes('{other}'), c);
});

test('Desi Masti is Hinglish (Roman script, common Hindi words)', () => {
  const p = ALL.find((x) => x.id === 'desi');
  const hindi = /\b(kya|kaun|kaunsa|kis|ke|ki|ko|se|hai|karo|bolo|mein|tum|apni|apne)\b/i;
  const cards = [...p.truths, ...p.dares];
  assert.ok(cards.filter((c) => hindi.test(c)).length >= cards.length * 0.9);
  assert.ok(cards.every((c) => !/[ऀ-ॿ]/.test(c)), 'expected Roman script');
});
