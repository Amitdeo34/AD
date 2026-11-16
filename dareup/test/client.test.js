// Checks the game file's config rules by running the real functions from index.html
// in a sandbox: API_BASE resolution, the Play Store switch, and the single-file rules.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function extractFunction(name) {
  const start = html.indexOf(`function ${name}(`);
  assert.ok(start > 0, `function ${name} not found`);
  const end = html.indexOf('\n}\n', start);
  return html.slice(start, end + 2);
}
const constLine = (name) => new RegExp(`const ${name} = [^\\n]+`).exec(html)[0];

const SOURCE = [constLine('API_BASE_REMOTE'), constLine('ANDROID_ASSET_HOST'), extractFunction('resolveApiBase'), extractFunction('detectStoreChannel'), extractFunction('storeRules')].join('\n');

function run(href, { bridge, channelOverride } = {}) {
  const u = new URL(href);
  const window = { location: { protocol: u.protocol, hostname: u.hostname, search: u.search }, AndroidBridge: bridge };
  const ctx = vm.createContext({ window, URL, URLSearchParams, String });
  vm.runInContext(`${SOURCE}\nvar STORE_CHANNEL = ${channelOverride ? JSON.stringify(channelOverride) : 'detectStoreChannel()'};\nvar out = JSON.stringify({ base: resolveApiBase(), channel: STORE_CHANNEL, rules: storeRules() });`, ctx);
  return JSON.parse(ctx.out); // plain objects from this realm
}

const REMOTE = /const API_BASE_REMOTE = '([^']+)'/.exec(html)[1];

test('hosted website (https) uses the same origin', () => {
  assert.equal(run('https://dareup.example/').base, '');
  assert.equal(run('http://localhost:3000/index.html').base, '');
});

test('file:// and the Android asset host use API_BASE_REMOTE', () => {
  assert.equal(run('file:///home/someone/dareup/index.html').base, REMOTE);
  assert.equal(run('https://appassets.androidplatform.net/assets/www/index.html').base, REMOTE);
  assert.equal(REMOTE, 'https://[your-app].vercel.app');
});

test('?api= override works on file://, Android and localhost pages', () => {
  assert.equal(run('file:///x/index.html?api=http://localhost:3000').base, 'http://localhost:3000');
  assert.equal(run('file:///x/index.html?api=https://preview.vercel.app/').base, 'https://preview.vercel.app');
  assert.equal(run('https://appassets.androidplatform.net/assets/www/index.html?api=http://10.0.2.2:3000').base, 'http://10.0.2.2:3000');
  assert.equal(run('http://localhost:5000/?api=http://127.0.0.1:3000').base, 'http://127.0.0.1:3000');
});

test('?api= on a public website is ignored unless it points to localhost', () => {
  assert.equal(run('https://dareup.example/?api=https://evil.example').base, '');
  assert.equal(run('https://dareup.example/?api=http://localhost:3000').base, 'http://localhost:3000');
  assert.equal(run('https://dareup.example/?api=javascript:alert(1)').base, '');
  assert.equal(run('file:///x/index.html?api=ftp://x').base, REMOTE);
});

test('STORE_CHANNEL defaults to web and reads AndroidBridge.storeChannel()', () => {
  assert.equal(run('https://dareup.example/').channel, 'web');
  assert.equal(run('https://appassets.androidplatform.net/a/index.html', { bridge: { storeChannel: () => 'play' } }).channel, 'play');
  assert.equal(run('https://appassets.androidplatform.net/a/index.html', { bridge: { storeChannel: () => 'direct' } }).channel, 'direct');
  assert.equal(run('https://appassets.androidplatform.net/a/index.html', { bridge: { storeChannel: () => 'weird' } }).channel, 'web');
  assert.equal(run('https://appassets.androidplatform.net/a/index.html', { bridge: { storeChannel: () => { throw new Error('x'); } } }).channel, 'web');
});

test('play channel sells nothing and shows the neutral note; web/direct sell via Razorpay', () => {
  assert.deepEqual(run('https://x.example/', { channelOverride: 'play' }).rules, { canBuy: false, canRestore: false, lockedNote: 'Premium packs are coming soon to this version.' });
  for (const ch of ['web', 'direct']) assert.deepEqual(run('https://x.example/', { channelOverride: ch }).rules, { canBuy: true, canRestore: true, lockedNote: '' });
});

test('play-channel wording never steers to the website', () => {
  const note = run('https://x.example/', { channelOverride: 'play' }).rules.lockedNote;
  assert.ok(!/website|web site|browser|vercel|http|buy|razorpay/i.test(note));
});

test('index.html is self-contained: no external scripts, styles, fonts or root-relative paths', () => {
  assert.ok(!/<script[^>]+src=/i.test(html), 'no <script src>');
  assert.ok(!/<link[^>]+rel="stylesheet"/i.test(html), 'no external CSS');
  assert.ok(!/(src|href)="\//.test(html), 'no root-relative src/href');
  assert.ok(!/@import|@font-face/.test(html), 'no imported CSS or web fonts');
  // The only remote URL fetched is the Razorpay script, and only when buying.
  const urls = [...html.matchAll(/https:\/\/[a-z0-9.[\]-]+/gi)].map((m) => m[0]).filter((u) => !u.startsWith('https://[your-app]'));
  assert.deepEqual([...new Set(urls)], ['https://checkout.razorpay.com']);
  assert.ok(html.includes("'https://checkout.razorpay.com/v1/checkout.js'"));
});

test('Android contract hooks are present', () => {
  assert.match(html, /window\.onAndroidBack = function/);
  assert.match(html, /AndroidBridge\.setTheme\(bg, dark\)/);
  assert.match(html, /AndroidBridge\.openUrl\(/);
  assert.match(html, /AndroidBridge\.share\(text\)/);
  assert.match(html, /loc\.hostname !== ANDROID_ASSET_HOST/); // no service worker / manifest in the app
});
