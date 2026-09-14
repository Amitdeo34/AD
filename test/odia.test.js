import test from 'node:test';
import assert from 'node:assert/strict';
import {
  KEY_GROUPS,
  ODIA_DIGITS,
  PHRASES,
  SCHEME,
  VIRAMA,
  fromOdiaDigits,
  toOdiaDigits,
  transliterate,
} from '../lib/odia.js';

test('a lone consonant keeps its inherent vowel', () => {
  assert.equal(transliterate('ka'), 'କ');
  assert.equal(transliterate('k'), 'କ');
  assert.equal(transliterate('kha gha'), 'ଖ ଘ');
});

test('a vowel after a consonant becomes a matra, and stands alone otherwise', () => {
  assert.equal(transliterate('ki'), 'କି');
  assert.equal(transliterate('kii'), 'କୀ');
  assert.equal(transliterate('ko'), 'କୋ');
  assert.equal(transliterate('i'), 'ଇ');
  assert.equal(transliterate('ao'), 'ଅଓ');
});

test('two consonants in a row take the halanta between them', () => {
  assert.equal(transliterate('swara'), `ସ${VIRAMA}ୱର`);
  assert.equal(transliterate('bhaarata'), 'ଭାରତ');
  assert.equal(transliterate('namaskaara'), 'ନମସ୍କାର');
});

test('doubled letters stay geminates rather than turning retroflex', () => {
  assert.equal(transliterate('uttara'), 'ଉତ୍ତର');
  assert.equal(transliterate('anna'), 'ଅନ୍ନ');
  assert.equal(transliterate('Tika'), 'ଟିକ');
});

test('capitals are the retroflex and long letters', () => {
  assert.equal(transliterate('TaThaDaDhaNa'), 'ଟଠଡଢଣ');
  assert.equal(transliterate('Laa'), 'ଳା');
  assert.equal(transliterate('Raa'), 'ଡ଼ା');
  assert.equal(transliterate('Sa sa sha'), 'ଷ ସ ଶ');
});

test('place names come out the way they are written', () => {
  assert.equal(transliterate('ORishaa'), 'ଓଡ଼ିଶା');
  assert.equal(transliterate('bhubaneswara'), 'ଭୁବନେସ୍ୱର');
  assert.equal(transliterate('kaTaka'), 'କଟକ');
  assert.equal(transliterate('puri'), 'ପୁରି');
});

test('a Roman spelling with no exact match falls back to its lower case', () => {
  // "KH" is not in the scheme; "kh" is, so the aspirate still comes out.
  assert.equal(transliterate('KH'), 'ଖ');
  assert.equal(transliterate('BHa'), 'ଭ');
});

test('marks, conjunct shorthands and an explicit halanta', () => {
  assert.equal(transliterate('aM'), 'ଅଂ');
  assert.equal(transliterate('aH'), 'ଅଃ');
  assert.equal(transliterate('mu~'), 'ମୁଁ');
  assert.equal(transliterate('rum_'), 'ରୁମ୍');
  assert.equal(transliterate('x'), 'କ୍ଷ');
  assert.equal(transliterate('a|'), 'ଅ।');
  assert.equal(transliterate('a||'), 'ଅ॥');
});

test('digits follow the option, and everything unknown passes through', () => {
  assert.equal(transliterate('2026'), '୨୦୨୬');
  assert.equal(transliterate('2026', { digits: false }), '2026');
  assert.equal(transliterate('room 12, ok!'), 'ରୂମ ୧୨, ଓକ!');
  assert.equal(transliterate('ଓଡ଼ିଶା'), 'ଓଡ଼ିଶା');
  assert.equal(transliterate(''), '');
});

test('digit helpers round-trip', () => {
  assert.equal(toOdiaDigits('₹1,250'), '₹୧,୨୫୦');
  assert.equal(fromOdiaDigits('୧୨୫୦'), '1250');
  assert.equal(ODIA_DIGITS.length, 10);
});

test('every keyboard key carries Odia script or plain punctuation', () => {
  const odia = /^[଀-୿]+$/;
  const ascii = /^[।॥,.?!\-()"']+$/;
  for (const group of KEY_GROUPS) {
    assert.ok(group.keys.length > 0, `${group.id} has keys`);
    for (const key of group.keys) {
      assert.ok(key.ch, `${group.id} key has a character`);
      assert.ok(key.hint, `${group.id} key has a hint`);
      assert.ok(
        odia.test(key.ch) || ascii.test(key.ch),
        `${group.id} key ${JSON.stringify(key.ch)} is Odia or punctuation`,
      );
    }
  }
});

test('no letter is offered twice on the same key group', () => {
  for (const group of KEY_GROUPS) {
    const seen = new Set(group.keys.map((key) => key.ch));
    assert.equal(seen.size, group.keys.length, `${group.id} has no duplicate keys`);
  }
});

test('each conjunct key really is a cluster joined by a halanta', () => {
  const conjuncts = KEY_GROUPS.find((group) => group.id === 'conjuncts');
  for (const key of conjuncts.keys) {
    assert.ok(key.ch.includes(VIRAMA), `${key.hint} joins with a halanta`);
    assert.equal(key.ch, transliterate(key.hint), `${key.hint} matches the phonetic scheme`);
  }
});

test('the cheat sheet is generated from the same tables as the engine', () => {
  for (const row of SCHEME.vowels) assert.equal(transliterate(row.keys[0]), row.ch);
  for (const row of SCHEME.consonants) assert.equal(transliterate(row.keys[0]), row.ch);
  for (const row of SCHEME.signs) assert.equal(transliterate(row.keys[0]), row.ch);
});

test('the ready phrases are what their Roman spelling produces', () => {
  assert.ok(PHRASES.length >= 10);
  for (const phrase of PHRASES) {
    assert.equal(phrase.odia, transliterate(phrase.roman));
    assert.ok(phrase.english, `${phrase.roman} has a gloss`);
  }
  assert.equal(PHRASES[0].odia, 'ନମସ୍କାର');
});
