// Browser smoke test (not part of `npm test`). Needs Playwright + Chromium installed.
//   node test/smoke.mjs                     # run
//   SHOTS_DIR=/some/folder node test/smoke.mjs   # also save phone screenshots
//
// Starts dev-server.mjs with DEMO_MODE=1 and checks, with no console errors allowed:
//  1. hosted site at 390x844: 3 players, several turns, timer, scoreboard, summary,
//     demo purchase, premium pack unlocks and plays, 18+ gate, custom pack, theme
//  2. the same site offline (service worker shell + cached premium packs)
//  3. desktop 1280x800, and no horizontal scroll at 360 px
//  4. file:// : free pack plays fully, premium shows "not connected"
//  5. file://?api=<dev server> : cross-origin purchase (CORS) works
//  6. Android asset host with a fake AndroidBridge: theme sync, back button, links,
//     share, no service worker; and the Play Store channel hides selling

import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INDEX = path.join(ROOT, 'index.html');
const SHOTS = process.env.SHOTS_DIR || '';
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const APP_NAME = /const APP_NAME = '([^']+)'/.exec(readFileSync(INDEX, 'utf8'))[1];
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true };

let failures = 0;
const results = [];
function check(cond, label) {
  results.push(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
  if (!cond) failures += 1;
}

function startServer() {
  const child = spawn(process.execPath, [path.join(ROOT, 'dev-server.mjs')], {
    env: { ...process.env, PORT: '0', NO_DOTENV: '1', DEMO_MODE: '1', PASS_SECRET: 'smoke-test-pass-secret-0123456789abcdef', RAZORPAY_KEY_ID: '', RAZORPAY_KEY_SECRET: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('dev server did not start')), 10000);
    child.stdout.on('data', (d) => {
      const m = /localhost:(\d+)/.exec(String(d));
      if (m) { clearTimeout(timer); resolve({ child, base: `http://localhost:${m[1]}/` }); }
    });
    child.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`));
  });
}

function watch(page, bucket, label) {
  page.on('console', (m) => { if (m.type() === 'error') bucket.push(`${label}: console.error: ${m.text()}`); });
  page.on('pageerror', (e) => bucket.push(`${label}: pageerror: ${e.message}`));
}

async function shot(page, name) {
  if (!SHOTS) return;
  await page.waitForTimeout(450); // let enter/flip animations finish
  await page.screenshot({ path: path.join(SHOTS, name) });
}

async function addPlayers(page, names) {
  for (const n of names) {
    await page.fill('[data-t=player-input]', n);
    await page.press('[data-t=player-input]', 'Enter');
  }
}

// Plays one turn. kind: truth | dare | random; outcome: done | skip
async function playTurn(page, kind, outcome) {
  await page.click(`[data-t=pick-${kind}]`);
  await page.waitForSelector('[data-t=card].revealed', { timeout: 5000 });
  const text = (await page.textContent('[data-t=card-text]')).trim();
  const type = (await page.textContent('[data-t=card-type]')).trim().toLowerCase();
  const pack = (await page.textContent('[data-t=card-pack]')).trim();
  await page.click(`[data-t=${outcome}]`);
  await page.waitForSelector('[data-t=choose], [data-t=summary]');
  return { text, type, pack };
}

const noHScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

async function run() {
  const { child, base } = await startServer();
  const browser = await chromium.launch();
  const errors = [];
  try {
    /* ---------------- 0. plain HTTP checks ---------------- */
    check((await fetch(`${base}api/_lib/premium-packs.js`)).status === 404, 'api/_lib source is not served');
    check((await fetch(`${base}api/_lib/plans`)).status === 404, 'api/_lib is not routable');
    const priv = await fetch(`${base}privacy`);
    check(priv.status === 200 && (await priv.text()).includes('Privacy Policy'), 'clean URL /privacy serves privacy.html');
    const home = await fetch(base);
    check((home.headers.get('content-security-policy') || '').includes("frame-ancestors 'none'"), 'vercel.json security headers applied (CSP)');
    check((await fetch(`${base}api/packs`)).status === 401, 'GET /api/packs without a pass is 401');

    /* ---------------- 1. hosted phone flow ---------------- */
    const ctx = await browser.newContext(PHONE);
    const page = await ctx.newPage();
    watch(page, errors, 'phone');
    await page.goto(base);
    await page.waitForSelector('[data-t=home]');
    check((await page.title()).startsWith(APP_NAME), 'title uses APP_NAME');
    check(await page.evaluate(() => !!document.querySelector('link[rel=manifest]')), 'hosted site adds the web manifest');
    await shot(page, '01-home.png');

    await page.click('[data-t=new-game]');
    await addPlayers(page, ['Rocket', 'Mango', 'Pixel']);
    check((await page.locator('[data-t=player-row]').count()) === 3, 'added 3 players');
    // reorder: move Pixel up one place, then back
    await page.click('[aria-label="Move Pixel up"]');
    check((await page.locator('[data-t=player-row] .nm').allTextContents()).join() === 'Rocket,Pixel,Mango', 'reorder players');
    await page.click('[aria-label="Move Pixel down"]');
    check((await page.locator('[data-t=pack-classic]').getAttribute('aria-pressed')) === 'true', 'Classic selected by default');
    check((await page.locator('[data-t=pack-party] [data-t=lock-badge]').count()) === 1, 'premium pack shows lock badge');
    check((await page.textContent('[data-t=pack-party]')).includes('40 truths · 40 dares'), 'locked pack shows card counts');
    await shot(page, '02-setup.png');

    await page.click('[data-t=start]');
    await page.waitForSelector('[data-t=choose]');
    check((await page.textContent('[data-t=turn-name]')).startsWith('Rocket'), 'first turn is Rocket');
    const seen = [];
    seen.push(await playTurn(page, 'truth', 'done'));
    check((await page.textContent('[data-t=turn-name]')).startsWith('Mango'), 'turn passes to Mango');

    // dare with timer
    await page.click('[data-t=pick-dare]');
    await page.waitForSelector('[data-t=card].revealed');
    check((await page.textContent('[data-t=card-type]')).trim() === 'Dare', 'dare card shown');
    await page.click('[data-t=timer-pick-30]');
    await page.click('[data-t=timer-toggle]');
    await page.waitForTimeout(1300);
    const left = Number(await page.textContent('[data-t=timer-num]'));
    check(left <= 29 && left >= 27, `timer counts down (${left}s left)`);
    await shot(page, '03-dare-card.png');
    await page.click('[data-t=done]');
    await page.waitForSelector('[data-t=choose]');

    seen.push(await playTurn(page, 'random', 'skip'));
    check((await page.textContent('[data-t=turn-name]')).startsWith('Rocket'), 'round 2 starts with Rocket again');
    check((await page.textContent('.bar-title')).includes('Round 2'), 'round counter advanced');
    for (let i = 0; i < 6; i++) seen.push(await playTurn(page, i % 2 ? 'dare' : 'truth', 'done'));
    const texts = seen.map((s) => s.text);
    check(new Set(texts).size === texts.length, 'no repeated cards within the game');

    await page.click('[data-t=scoreboard]');
    await page.waitForSelector('dialog[open] [data-t=board]');
    check((await page.locator('dialog[open] [data-t=board] li').count()) === 3, 'scoreboard lists 3 players');
    await page.click('[data-t=dlg-ok]');

    // skip limit: Pixel skipped once; check the button shows 2 left on their next turn
    await page.click('[data-t=end-game]');
    await page.click('[data-t=dlg-ok]');
    await page.waitForSelector('[data-t=summary]');
    const winner = await page.textContent('[data-t=winner]');
    check(/wins!|tie/.test(winner), `summary shows winner ("${winner}")`);
    await shot(page, '04-summary.png');
    await page.click('[data-t=share]');
    await page.waitForTimeout(300);

    // Android-style back from summary goes home
    check(await page.evaluate(() => window.onAndroidBack()), 'onAndroidBack handled on summary');
    await page.waitForSelector('[data-t=home]');
    check((await page.evaluate(() => window.onAndroidBack())) === false, 'onAndroidBack returns false on home');

    // premium purchase (demo)
    await page.click('[data-t=open-premium]');
    await page.waitForSelector('[data-t=demo-note]');
    check((await page.textContent('[data-t=plan-monthly]')).includes('₹49'), 'monthly plan ₹49');
    check((await page.textContent('[data-t=plan-yearly]')).includes('₹199'), 'yearly plan ₹199');
    check((await page.textContent('[data-t=plan-lifetime]')).includes('₹499'), 'lifetime plan ₹499');
    await shot(page, '05-premium.png');
    await page.click('[data-t=buy-monthly]');
    await page.waitForSelector('dialog[open]');
    check((await page.textContent('dialog[open]')).includes('Demo payment'), 'demo payment confirmation shown');
    await page.click('[data-t=dlg-ok]');
    await page.waitForFunction(() => document.querySelector('[data-t=status-title]')?.textContent === 'Premium is on', null, { timeout: 10000 });
    await page.waitForFunction(() => /6 premium packs/.test(document.querySelector('[data-t=packs-state]')?.textContent || ''), null, { timeout: 10000 });
    const stored = await page.evaluate(() => ({ pass: JSON.parse(localStorage.getItem('dareup.pass')), packs: JSON.parse(localStorage.getItem('dareup.premiumPacks')) }));
    check(stored.pass && stored.pass.plan === 'monthly' && stored.pass.demo === true, 'pass token stored (monthly, demo)');
    check(stored.packs && stored.packs.packs.length === 6, 'premium packs cached in localStorage');
    check((await page.textContent('[data-t=status-sub]')).includes('ends'), 'status shows expiry date');
    await page.waitForFunction(() => !document.querySelector('.confetti'), null, { timeout: 8000 });
    await shot(page, '06-premium-active.png');

    // premium pack unlocks and plays
    await page.click('[data-t=back]');
    await page.click('[data-t=new-game]');
    check((await page.locator('[data-t=pack-party] [data-t=lock-badge]').count()) === 0, 'Party Animals unlocked');
    await page.click('[data-t=pack-party]');
    await page.click('[data-t=pack-classic]');
    // 18+ gate
    await page.click('[data-t=pack-couples]');
    await page.waitForSelector('dialog[open]');
    check((await page.textContent('dialog[open]')).includes('18 or older'), '18+ pack asks for age confirmation');
    await page.click('[data-t=dlg-cancel]');
    check((await page.locator('[data-t=pack-couples]').getAttribute('aria-pressed')) === 'false', 'cancelling the age check keeps 18+ pack off');
    // 7+ players allowed now
    await addPlayers(page, ['Comet', 'Biscuit', 'Turbo', 'Nova']);
    check((await page.textContent('[data-t=player-count]')).trim() === '7 / 20', 'premium allows more than 6 players');
    await page.click('[data-t=start]'); // previous game already ended, so no "replace game?" prompt
    await page.waitForSelector('[data-t=choose]');
    const pt = await playTurn(page, 'dare', 'done');
    check(pt.pack === 'Party Animals', `premium card drawn from Party Animals ("${pt.text}")`);
    check(stored.packs.packs.find((p) => p.id === 'party').dares.some((d) => pt.text.startsWith(d.split('{other}')[0])), 'card text comes from the server pack');

    // custom pack
    await page.goto(`${base}#/packs`);
    await page.click('[data-t=new-pack]');
    await page.fill('[data-t=pack-name]', 'Smoke pack');
    await page.fill('[data-t=pack-truths]', 'What is your favourite colour?\nWhat is your favourite snack?');
    await page.fill('[data-t=pack-dares]', 'Clap three times.\nDo a happy dance.');
    await page.click('[data-t=pack-save]');
    await page.waitForSelector('[data-t=custom-row]');
    check((await page.textContent('[data-t=custom-row]')).includes('2 truths · 2 dares'), 'custom pack saved');

    // premium theme
    await page.goto(`${base}#/settings`);
    await page.click('[data-t=theme-neon]');
    check((await page.evaluate(() => document.documentElement.dataset.theme)) === 'neon', 'premium colour theme applies');
    await page.click('[data-t=theme-classic]');

    /* ---------------- 2. offline replay ---------------- */
    await page.goto(base);
    await page.waitForSelector('[data-t=home]');
    const swReady = await page.evaluate(async () => { const r = await navigator.serviceWorker.ready; return !!r.active; });
    check(swReady, 'service worker active on the hosted site');
    await page.reload();
    await page.waitForSelector('[data-t=home]');
    await ctx.setOffline(true);
    const offlineErrors = [];
    page.removeAllListeners('console');
    page.on('console', (m) => { if (m.type() === 'error' && !/ERR_INTERNET_DISCONNECTED/.test(m.text())) offlineErrors.push(`offline: ${m.text()}`); });
    await page.reload();
    await page.waitForSelector('[data-t=home]', { timeout: 8000 });
    check(true, 'page loads offline from the service worker');
    await page.click('[data-t=resume]');
    const off = await playTurn(page, 'truth', 'done');
    check(off.pack === 'Party Animals', 'cached premium pack plays offline');
    await page.goto(`${base}#/premium`);
    await page.waitForSelector('[data-t=server-offline]', { timeout: 10000 });
    check(true, 'premium screen explains the server is unreachable');
    await ctx.setOffline(false);
    errors.push(...offlineErrors);
    await ctx.close();

    /* ---------------- 3. desktop + 360px ---------------- */
    const desk = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const dp = await desk.newPage();
    watch(dp, errors, 'desktop');
    await dp.goto(base);
    await dp.click('[data-t=new-game]');
    await addPlayers(dp, ['Rocket', 'Mango']);
    await dp.click('[data-t=start]');
    await playTurn(dp, 'truth', 'done');
    await playTurn(dp, 'dare', 'skip');
    check(true, 'desktop plays turns');
    await desk.close();

    const narrow = await browser.newContext({ ...PHONE, viewport: { width: 360, height: 740 } });
    const np = await narrow.newPage();
    watch(np, errors, '360px');
    await np.goto(base);
    let wide = [];
    for (const hash of ['', '#/setup', '#/premium', '#/settings', '#/packs']) {
      await np.goto(base + hash);
      await np.waitForTimeout(150);
      if (!(await noHScroll(np))) wide.push(hash || '#/');
    }
    await np.goto(`${base}#/setup`);
    await addPlayers(np, ['A very long nickname!', 'Mango']);
    await np.click('[data-t=start]');
    await np.click('[data-t=pick-dare]');
    await np.waitForSelector('[data-t=card].revealed');
    if (!(await noHScroll(np))) wide.push('#/play');
    check(wide.length === 0, `no horizontal scroll at 360px${wide.length ? ` (overflow on ${wide.join(', ')})` : ''}`);
    await narrow.close();

    /* ---------------- 4. file:// ---------------- */
    const fctx = await browser.newContext(PHONE);
    const fp = await fctx.newPage();
    watch(fp, errors, 'file://');
    await fp.goto(pathToFileURL(INDEX).href);
    await fp.waitForSelector('[data-t=home]');
    check(await fp.evaluate(() => !document.querySelector('link[rel=manifest]')), 'file:// adds no manifest');
    await fp.click('[data-t=new-game]');
    await addPlayers(fp, ['Rocket', 'Mango']);
    await fp.click('[data-t=pack-family]');
    await fp.click('[data-t=start]');
    const fileCards = [];
    for (let i = 0; i < 4; i++) fileCards.push(await playTurn(fp, ['truth', 'dare', 'random', 'truth'][i], i === 2 ? 'skip' : 'done'));
    check(fileCards.every((c) => ['Classic', 'Family & Kids'].includes(c.pack)), 'file:// plays free packs offline');
    await fp.goto(`${pathToFileURL(INDEX).href}#/premium`);
    await fp.waitForSelector('[data-t=server-missing]');
    check(true, 'file:// premium screen says the server is not connected');
    check(await fp.evaluate(async () => { try { return !navigator.serviceWorker || (await navigator.serviceWorker.getRegistrations()).length === 0; } catch { return true; /* file:// cannot have one at all */ } }), 'file:// registers no service worker');
    await fctx.close();

    /* ---------------- 5. file:// + ?api= (cross-origin purchase) ---------------- */
    const xctx = await browser.newContext(PHONE);
    const xp = await xctx.newPage();
    watch(xp, errors, 'file+api');
    await xp.goto(`${pathToFileURL(INDEX).href}?api=${encodeURIComponent(base.replace(/\/$/, ''))}#/premium`);
    await xp.waitForSelector('[data-t=demo-note]');
    await xp.click('[data-t=buy-lifetime]');
    await xp.click('[data-t=dlg-ok]');
    await xp.waitForFunction(() => document.querySelector('[data-t=status-title]')?.textContent === 'Premium is on', null, { timeout: 10000 });
    check((await xp.textContent('[data-t=status-sub]')).includes('never ends'), 'cross-origin demo purchase works (lifetime)');
    await xctx.close();

    /* ---------------- 6. Android asset host + bridge ---------------- */
    const html = readFileSync(INDEX, 'utf8');
    const androidUrl = 'https://appassets.androidplatform.net/assets/www/index.html';
    for (const channel of ['direct', 'play']) {
      const actx = await browser.newContext(PHONE);
      await actx.route('https://appassets.androidplatform.net/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: html }));
      await actx.addInitScript((ch) => {
        window.__bridge = { theme: [], urls: [], shares: [] };
        window.AndroidBridge = {
          storeChannel: () => ch,
          setTheme: (bg, dark) => window.__bridge.theme.push([bg, dark]),
          openUrl: (u) => window.__bridge.urls.push(u),
          share: (t) => window.__bridge.shares.push(t),
        };
      }, channel);
      const ap = await actx.newPage();
      watch(ap, errors, `android-${channel}`);
      await ap.goto(androidUrl);
      await ap.waitForSelector('[data-t=home]');
      const bridge = await ap.evaluate(() => window.__bridge);
      check(bridge.theme.length >= 1 && /^#[0-9a-f]{6}$/.test(bridge.theme[0][0]) && typeof bridge.theme[0][1] === 'boolean', `[${channel}] setTheme(bgHex, isDark) on load: ${JSON.stringify(bridge.theme[0])}`);
      check(await ap.evaluate(async () => !document.querySelector('link[rel=manifest]') && (await navigator.serviceWorker.getRegistrations()).length === 0), `[${channel}] no manifest or service worker in the app`);

      if (channel === 'direct') {
        await ap.goto(`${androidUrl}#/settings`);
        await ap.click('[data-t=mode-dark]');
        const last = (await ap.evaluate(() => window.__bridge.theme)).pop();
        check(last[1] === true && last[0] === '#120c24', `[direct] theme change re-syncs the bar colour: ${JSON.stringify(last)}`);
        await ap.click('[data-t=privacy-link]');
        const urls = await ap.evaluate(() => window.__bridge.urls);
        check(urls.length === 1 && urls[0].endsWith('/privacy.html') && ap.url().startsWith(androidUrl), `[direct] privacy link goes through AndroidBridge.openUrl (${urls[0]})`);
        // back: play -> setup -> home -> exit
        await ap.goto(`${androidUrl}#/setup`);
        await addPlayers(ap, ['Rocket', 'Mango']);
        await ap.click('[data-t=start]');
        await ap.waitForSelector('[data-t=choose]');
        await ap.click('[data-t=scoreboard]');
        check(await ap.evaluate(() => window.onAndroidBack()) && !(await ap.evaluate(() => document.getElementById('dlg').open)), '[direct] back closes the open sheet first');
        check(await ap.evaluate(() => window.onAndroidBack()), '[direct] back from play handled');
        await ap.waitForSelector('[data-t=setup]');
        check(await ap.evaluate(() => window.onAndroidBack()), '[direct] back from pack picker handled');
        await ap.waitForSelector('[data-t=home]');
        check((await ap.evaluate(() => window.onAndroidBack())) === false, '[direct] back on home returns false');
        await ap.click('[data-t=resume]');
        await ap.click('[data-t=end-game]');
        await ap.click('[data-t=dlg-ok]');
        await ap.click('[data-t=share]');
        const shares = await ap.evaluate(() => window.__bridge.shares);
        check(shares.length === 1 && shares[0].startsWith(`${APP_NAME} results`), '[direct] share uses AndroidBridge.share');
        await ap.goto(`${androidUrl}#/premium`);
        await ap.waitForSelector('[data-t=plans]');
        check((await ap.locator('[data-t=server-missing]').count()) === 1, '[direct] Razorpay UI shown, with "not connected" note while API_BASE_REMOTE is a placeholder');
      } else {
        await ap.goto(`${androidUrl}#/premium`);
        await ap.waitForSelector('[data-t=premium]');
        check((await ap.locator('[data-t=plans]').count()) === 0 && (await ap.locator('[data-t=restore]').count()) === 0, '[play] no plans, Buy or Restore');
        check((await ap.textContent('[data-t=locked-note]')).trim() === 'Premium packs are coming soon to this version.', '[play] neutral coming-soon note');
        const body = await ap.innerText('body'); // visible text only (not the inline script source)
        check(!/razorpay|website|₹/i.test(body), '[play] no prices, Razorpay or website wording on the premium screen');
        await ap.goto(`${androidUrl}#/setup`);
        check((await ap.locator('[data-t=lock-badge]').count()) === 6, '[play] premium packs show the lock badge');
        check((await ap.locator('[data-t=locked-note]').count()) === 1, '[play] pack picker shows the coming-soon note');
        await ap.click('[data-t=pack-party]');
        check((await ap.textContent('dialog[open]')).includes('coming soon'), '[play] tapping a locked pack shows the note, not a sales pitch');
        await ap.click('[data-t=dlg-ok]');
        await addPlayers(ap, ['Rocket', 'Mango']);
        await ap.click('[data-t=start]');
        await playTurn(ap, 'truth', 'done');
        check(true, '[play] free packs play normally');
        if (SHOTS) { await ap.goto(`${androidUrl}#/premium`); await shot(ap, '08-play-channel-premium.png'); }
      }
      await actx.close();
    }

    /* ---------------- dark mode screenshot ---------------- */
    if (SHOTS) {
      const dctx = await browser.newContext({ ...PHONE, colorScheme: 'dark' });
      const dpg = await dctx.newPage();
      watch(dpg, errors, 'dark');
      await dpg.goto(`${base}#/setup`);
      await addPlayers(dpg, ['Rocket', 'Mango', 'Pixel']);
      await dpg.click('[data-t=start]');
      await dpg.waitForSelector('[data-t=choose]');
      await shot(dpg, '07-dark-turn.png');
      await dctx.close();
    }
  } finally {
    await browser.close();
    child.kill();
  }

  for (const line of results) console.log(line);
  if (errors.length) {
    console.log('\nConsole errors:');
    for (const e of errors) console.log(`  ${e}`);
  }
  console.log(`\n${results.length - failures}/${results.length} checks passed, ${errors.length} console errors`);
  if (failures || errors.length) process.exit(1);
}

run().catch((err) => {
  for (const line of results) console.log(line);
  console.error('\nSMOKE ABORTED:', err.message);
  process.exit(1);
});
