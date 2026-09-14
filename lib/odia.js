/**
 * Odia (ଓଡ଼ିଆ) script toolkit.
 *
 * Two things live here, both pure so the tests can import them directly:
 *   - the character tables the on-screen keyboard is drawn from, and
 *   - a phonetic engine that turns Roman letters into Odia script
 *     ("ORishaa" → "ଓଡ଼ିଶା"), used by the compose bar and the bulk converter.
 *
 * The scheme is ITRANS-flavoured and deliberately predictable:
 *   - a capital letter is the retroflex or long counterpart (T ଟ, D ଡ, N ଣ,
 *     S ଷ, L ଳ, R ଡ଼, A ଆ, I ଈ, U ଊ);
 *   - a doubled consonant is a real geminate, never a retroflex, so "uttara"
 *     gives ଉତ୍ତର and not ଉଟର;
 *   - a consonant followed by another consonant takes the halanta by itself,
 *     so conjuncts fall out of ordinary typing ("swara" → ସ୍ୱର);
 *   - a consonant with no vowel after it keeps its inherent "a", the way the
 *     word is actually written; "_" forces a bare halanta when you need one.
 */

export const VIRAMA = '୍';
export const NUKTA = '଼';
export const ANUSVARA = 'ଂ';
export const CANDRABINDU = 'ଁ';
export const VISARGA = 'ଃ';
export const DANDA = '।';
export const DOUBLE_DANDA = '॥';
export const DOTTED_CIRCLE = '◌';

/** Independent vowel, the matra that replaces it after a consonant, and its aliases. */
const VOWELS = [
  { keys: ['a'], letter: 'ଅ', matra: '', roman: 'a' },
  { keys: ['aa', 'A'], letter: 'ଆ', matra: 'ା', roman: 'aa' },
  { keys: ['i'], letter: 'ଇ', matra: 'ି', roman: 'i' },
  { keys: ['ii', 'I', 'ee'], letter: 'ଈ', matra: 'ୀ', roman: 'ii' },
  { keys: ['u'], letter: 'ଉ', matra: 'ୁ', roman: 'u' },
  { keys: ['uu', 'U', 'oo'], letter: 'ଊ', matra: 'ୂ', roman: 'uu' },
  { keys: ['RRi', 'R^i'], letter: 'ଋ', matra: 'ୃ', roman: 'RRi' },
  { keys: ['e', 'E'], letter: 'ଏ', matra: 'େ', roman: 'e' },
  { keys: ['ai'], letter: 'ଐ', matra: 'ୈ', roman: 'ai' },
  { keys: ['o', 'O'], letter: 'ଓ', matra: 'ୋ', roman: 'o' },
  { keys: ['au', 'ou'], letter: 'ଔ', matra: 'ୌ', roman: 'au' },
];

/**
 * Consonants. Aspirates are the plain letter plus "h"; capitals are retroflex.
 * Doubled letters are left out on purpose so that "tt", "nn", "ll" and friends
 * stay geminates.
 */
const CONSONANTS = [
  { keys: ['k'], ch: 'କ', roman: 'ka' },
  { keys: ['kh'], ch: 'ଖ', roman: 'kha' },
  { keys: ['g'], ch: 'ଗ', roman: 'ga' },
  { keys: ['gh'], ch: 'ଘ', roman: 'gha' },
  { keys: ['~N', 'NG'], ch: 'ଙ', roman: '~Na' },
  { keys: ['ch', 'c'], ch: 'ଚ', roman: 'cha' },
  { keys: ['chh', 'Ch'], ch: 'ଛ', roman: 'chha' },
  { keys: ['j'], ch: 'ଜ', roman: 'ja' },
  { keys: ['jh'], ch: 'ଝ', roman: 'jha' },
  { keys: ['~n', 'NY'], ch: 'ଞ', roman: '~na' },
  { keys: ['T'], ch: 'ଟ', roman: 'Ta' },
  { keys: ['Th'], ch: 'ଠ', roman: 'Tha' },
  { keys: ['D'], ch: 'ଡ', roman: 'Da' },
  { keys: ['Dh'], ch: 'ଢ', roman: 'Dha' },
  { keys: ['N'], ch: 'ଣ', roman: 'Na' },
  { keys: ['t'], ch: 'ତ', roman: 'ta' },
  { keys: ['th'], ch: 'ଥ', roman: 'tha' },
  { keys: ['d'], ch: 'ଦ', roman: 'da' },
  { keys: ['dh'], ch: 'ଧ', roman: 'dha' },
  { keys: ['n'], ch: 'ନ', roman: 'na' },
  { keys: ['p'], ch: 'ପ', roman: 'pa' },
  { keys: ['ph', 'f'], ch: 'ଫ', roman: 'pha' },
  { keys: ['b'], ch: 'ବ', roman: 'ba' },
  { keys: ['bh'], ch: 'ଭ', roman: 'bha' },
  { keys: ['m'], ch: 'ମ', roman: 'ma' },
  { keys: ['y'], ch: 'ଯ', roman: 'ya' },
  { keys: ['Y'], ch: 'ୟ', roman: 'Ya' },
  { keys: ['r'], ch: 'ର', roman: 'ra' },
  { keys: ['l'], ch: 'ଲ', roman: 'la' },
  { keys: ['L'], ch: 'ଳ', roman: 'La' },
  { keys: ['w', 'v'], ch: 'ୱ', roman: 'wa' },
  { keys: ['sh'], ch: 'ଶ', roman: 'sha' },
  { keys: ['S', 'Sh'], ch: 'ଷ', roman: 'Sha' },
  { keys: ['s'], ch: 'ସ', roman: 'sa' },
  { keys: ['h'], ch: 'ହ', roman: 'ha' },
  { keys: ['R'], ch: 'ଡ଼', roman: 'Ra' },
  { keys: ['Rh'], ch: 'ଢ଼', roman: 'Rha' },
  { keys: ['z'], ch: 'ଜ', roman: 'ja' },
  { keys: ['q'], ch: 'କ', roman: 'ka' },
  { keys: ['x', 'ksh'], ch: 'କ୍ଷ', roman: 'kSha' },
  { keys: ['jny', 'GY'], ch: 'ଜ୍ଞ', roman: 'jna' },
];

/** Marks that stand on their own: they end a cluster rather than start one. */
const SIGNS = [
  { keys: ['M'], ch: ANUSVARA, roman: 'M' },
  { keys: ['H'], ch: VISARGA, roman: 'H' },
  { keys: ['~'], ch: CANDRABINDU, roman: '~' },
  { keys: ['_'], ch: VIRAMA, roman: '_' },
  { keys: ['||'], ch: DOUBLE_DANDA, roman: '||' },
  { keys: ['|'], ch: DANDA, roman: '|' },
];

export const ODIA_DIGITS = ['୦', '୧', '୨', '୩', '୪', '୫', '୬', '୭', '୮', '୯'];

/** roman token → { type, ... }, plus the longest token length for greedy matching. */
const TOKENS = new Map();
for (const vowel of VOWELS) {
  for (const key of vowel.keys) TOKENS.set(key, { type: 'vowel', ...vowel });
}
for (const consonant of CONSONANTS) {
  for (const key of consonant.keys) TOKENS.set(key, { type: 'consonant', ...consonant });
}
for (const sign of SIGNS) {
  for (const key of sign.keys) TOKENS.set(key, { type: 'sign', ...sign });
}
const LONGEST_TOKEN = Math.max(...[...TOKENS.keys()].map((key) => key.length));

/**
 * Longest match at `index`: exact first, so "Dh" beats "D", then the same
 * search over the lower-cased text so SHOUTED words still transliterate.
 */
function matchAt(text, index) {
  const limit = Math.min(LONGEST_TOKEN, text.length - index);
  for (const lower of [false, true]) {
    for (let length = limit; length > 0; length -= 1) {
      const slice = text.slice(index, index + length);
      const entry = TOKENS.get(lower ? slice.toLowerCase() : slice);
      if (entry) return { length, entry };
    }
  }
  return null;
}

/**
 * Roman → Odia script. Anything the scheme does not know — spaces, Latin
 * punctuation, text already in Odia — is passed through untouched.
 *
 * @param {string} text
 * @param {{digits?: boolean}} [options] digits: also map 0-9 to ୦-୯ (default true).
 */
export function transliterate(text, { digits = true } = {}) {
  let out = '';
  let afterConsonant = false;
  let i = 0;

  while (i < text.length) {
    const char = text[i];

    if (char >= '0' && char <= '9') {
      out += digits ? ODIA_DIGITS[Number(char)] : char;
      afterConsonant = false;
      i += 1;
      continue;
    }

    const match = matchAt(text, i);
    if (!match) {
      out += char;
      afterConsonant = false;
      i += 1;
      continue;
    }

    const { entry } = match;
    if (entry.type === 'consonant') {
      // Two consonants in a row form a conjunct: the first one loses its "a".
      if (afterConsonant) out += VIRAMA;
      out += entry.ch;
      afterConsonant = true;
    } else if (entry.type === 'vowel') {
      out += afterConsonant ? entry.matra : entry.letter;
      afterConsonant = false;
    } else {
      out += entry.ch;
      afterConsonant = false;
    }
    i += match.length;
  }

  return out;
}

/** 2026 → ୨୦୨୬. Useful for dates and tariffs shown beside Odia text. */
export const toOdiaDigits = (value) =>
  String(value).replace(/[0-9]/g, (digit) => ODIA_DIGITS[Number(digit)]);

/** ୨୦୨୬ → 2026. */
export const fromOdiaDigits = (value) =>
  String(value).replace(/[୦-୯]/g, (digit) => String(ODIA_DIGITS.indexOf(digit)));

/* ------------------------------------------------------------- key layout */

const lookup = (key) => {
  const entry = TOKENS.get(key);
  if (!entry) throw new Error(`unknown Odia token: ${key}`);
  return entry;
};

const letterKey = (key) => {
  const entry = lookup(key);
  return { ch: entry.ch ?? entry.letter, hint: key, roman: entry.roman };
};

const matraKey = (key) => {
  const entry = lookup(key);
  return { ch: entry.matra, hint: key, roman: entry.roman, combining: true };
};

const clusterKey = (keys) => ({ ch: transliterate(keys), hint: keys, roman: keys });

const punctuationKey = (ch, hint) => ({ ch, hint });

/**
 * The on-screen keyboard, in the order Odia is taught: vowels, then the
 * matras that replace them, then the consonants by varga, then the conjuncts
 * that need a halanta, then numerals and marks.
 */
export const KEY_GROUPS = [
  {
    id: 'vowels',
    title: 'Vowels',
    odia: 'ସ୍ୱରବର୍ଣ୍ଣ',
    keys: ['a', 'aa', 'i', 'ii', 'u', 'uu', 'RRi', 'e', 'ai', 'o', 'au'].map(letterKey),
  },
  {
    id: 'matras',
    title: 'Vowel signs',
    odia: 'ମାତ୍ରା',
    keys: [
      ...['aa', 'i', 'ii', 'u', 'uu', 'RRi', 'e', 'ai', 'o', 'au'].map(matraKey),
      { ch: VIRAMA, hint: '_', roman: 'halanta', combining: true },
      { ch: ANUSVARA, hint: 'M', roman: 'anusvara', combining: true },
      { ch: CANDRABINDU, hint: '~', roman: 'candrabindu', combining: true },
      { ch: VISARGA, hint: 'H', roman: 'visarga', combining: true },
      { ch: NUKTA, hint: 'nukta', roman: 'nukta', combining: true },
    ],
  },
  {
    id: 'consonants',
    title: 'Consonants',
    odia: 'ବ୍ୟଞ୍ଜନବର୍ଣ୍ଣ',
    keys: [
      'k', 'kh', 'g', 'gh', '~N',
      'ch', 'chh', 'j', 'jh', '~n',
      'T', 'Th', 'D', 'Dh', 'N',
      't', 'th', 'd', 'dh', 'n',
      'p', 'ph', 'b', 'bh', 'm',
      'y', 'Y', 'r', 'l', 'L',
      'w', 'sh', 'S', 's', 'h',
      'R', 'Rh',
    ].map(letterKey),
  },
  {
    id: 'conjuncts',
    title: 'Conjuncts',
    odia: 'ଯୁକ୍ତାକ୍ଷର',
    keys: [
      'ksh', 'jny', 'tr', 'shr', 'pr', 'kt', 'dw', 'sw',
      'nt', 'nd', 'mp', '~Ng', '~nch', 'ND', 'ST', 'll', 'tt',
    ].map(clusterKey),
  },
  {
    id: 'digits',
    title: 'Numerals',
    odia: 'ଅଙ୍କ',
    keys: ODIA_DIGITS.map((ch, value) => ({ ch, hint: String(value) })),
  },
  {
    id: 'marks',
    title: 'Marks',
    odia: 'ଚିହ୍ନ',
    keys: [
      punctuationKey(DANDA, '|'),
      punctuationKey(DOUBLE_DANDA, '||'),
      punctuationKey('ଽ', 'avagraha'),
      punctuationKey('୰', 'isshar'),
      punctuationKey(',', 'comma'),
      punctuationKey('.', 'full stop'),
      punctuationKey('?', 'question'),
      punctuationKey('!', 'exclaim'),
      punctuationKey('-', 'hyphen'),
      punctuationKey('(', 'open'),
      punctuationKey(')', 'close'),
      punctuationKey('"', 'quote'),
    ],
  },
];

/* ------------------------------------------------------- phrases and help */

/**
 * Ready-made lines, written by the same engine the keyboard uses — so the
 * script here is exactly what typing the Roman column produces.
 */
export const PHRASES = [
  { roman: 'namaskaara', english: 'Hello' },
  { roman: 'dhanYabaada', english: 'Thank you' },
  { roman: 'swaagata', english: 'Welcome' },
  { roman: 'aapaNa kemiti achhanti?', english: 'How are you?' },
  { roman: 'mu~ bhala achhi', english: 'I am fine' },
  { roman: 'mo naama', english: 'My name is…' },
  { roman: 'kShamaa karibe', english: 'Excuse me' },
  { roman: 'ehaara daama kete?', english: 'How much is this?' },
  { roman: 'goTie rum_ darakaara', english: 'I need a room' },
  { roman: 'paaNi miLiba ki?', english: 'Is water available?' },
  { roman: 'daYaakari saahaayYa karantu', english: 'Please help' },
  { roman: 'shubha yaatraa', english: 'Have a good journey' },
].map((phrase) => ({ ...phrase, odia: transliterate(phrase.roman) }));

/** Rows for the cheat sheet: every letter with the Roman that produces it. */
export const SCHEME = {
  vowels: VOWELS.map((vowel) => ({
    ch: vowel.letter,
    matra: vowel.matra,
    keys: vowel.keys,
  })),
  consonants: CONSONANTS.filter((entry) => !['z', 'q'].includes(entry.keys[0])).map((entry) => ({
    ch: entry.ch,
    keys: entry.keys,
  })),
  signs: SIGNS.map((entry) => ({ ch: entry.ch, keys: entry.keys })),
};
