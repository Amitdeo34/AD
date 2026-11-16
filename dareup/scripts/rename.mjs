// Renames the game everywhere it is shown, in one go.
//   npm run rename -- "Party Pataka"
//
// The game itself reads one value, APP_NAME in index.html. This script changes that
// and the static copies of the name in: <title> and meta tags, manifest.webmanifest,
// privacy.html, terms.html, the server default in api/_lib/config.js and .env.example.
// It does NOT change storage keys or the Razorpay "app" note (both stay "dareup"
// so existing players and passes keep working). Update README.md and store listings by hand.

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILES = ['index.html', 'manifest.webmanifest', 'privacy.html', 'terms.html', 'api/_lib/config.js', '.env.example'];

const next = String(process.argv[2] || '').trim();
if (!next || next.length > 30 || !/^[\p{L}\p{N} &!.-]+$/u.test(next)) {
  console.error('Usage: npm run rename -- "New Name"   (1-30 letters, numbers, spaces, & ! . -)');
  process.exit(1);
}

const index = await readFile(path.join(ROOT, 'index.html'), 'utf8');
const current = /const APP_NAME = '([^']+)'/.exec(index)?.[1];
if (!current) {
  console.error('Could not find APP_NAME in index.html');
  process.exit(1);
}
if (current === next) {
  console.log(`Already called ${current}.`);
  process.exit(0);
}

for (const rel of FILES) {
  const file = path.join(ROOT, rel);
  let text;
  try {
    text = await readFile(file, 'utf8');
  } catch {
    continue;
  }
  const count = text.split(current).length - 1;
  if (!count) continue;
  let out = text.split(current).join(next);
  if (rel === 'manifest.webmanifest') {
    // short_name should stay short for home screens
    out = out.replace(/"short_name": "[^"]*"/, `"short_name": ${JSON.stringify(next.slice(0, 12))}`);
  }
  await writeFile(file, out);
  console.log(`${rel}: ${count} change${count === 1 ? '' : 's'}`);
}
console.log(`Renamed ${current} -> ${next}. Check README.md and any store listing text by hand.`);
