// Phone screenshots of the free game for store listings, 1080x1920 (360x640 @3x).
// Opens ../index.html straight from disk, so only free packs appear (fits every store,
// including the Google Play build that sells nothing). Called by make-graphics.mjs --shots.
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const PLAYERS = ['Rocket', 'Pixel', 'Mango', 'Comet'];

export async function takeShots(browser, here) {
  const dir = join(here, 'screenshots');
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const url = pathToFileURL(join(here, '..', 'index.html')).href;

  for (const scheme of ['light', 'dark']) {
    const ctx = await browser.newContext({
      viewport: { width: 360, height: 640 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
      colorScheme: scheme,
    });
    const page = await ctx.newPage();
    const shot = async (name) => {
      await page.waitForTimeout(500); // let enter/flip animations settle
      await page.screenshot({ path: join(dir, name) });
      console.log('screenshots/' + name);
    };
    await page.goto(url);
    await page.waitForSelector('[data-t=new-game]');

    if (scheme === 'light') {
      await shot('phone-1-home.png');
      await page.click('[data-t=new-game]');
      for (const n of PLAYERS) {
        await page.fill('[data-t=player-input]', n);
        await page.press('[data-t=player-input]', 'Enter');
      }
      await page.click('[data-t=pack-friends]').catch(() => {});
      await page.evaluate(() => { // show the player list, not the pack grid
        document.querySelectorAll('*').forEach((e) => { if (e.scrollTop) e.scrollTop = 0; });
        window.scrollTo(0, 0);
      });
      await shot('phone-2-players.png');
      await page.click('[data-t=start]');
      await page.waitForSelector('[data-t=choose]');
      await shot('phone-3-your-turn.png');
      await page.click('[data-t=pick-truth]');
      await page.waitForSelector('[data-t=card].revealed');
      await shot('phone-4-truth.png');
      await page.click('[data-t=done]');
      await page.waitForSelector('[data-t=choose]');
      await page.click('[data-t=pick-dare]');
      await page.waitForSelector('[data-t=card].revealed');
      await page.click('[data-t=timer-pick-60]').catch(() => {});
      await page.click('[data-t=timer-toggle]').catch(() => {});
      await page.waitForTimeout(2200);
      await shot('phone-5-dare-timer.png');
      await page.click('[data-t=done]');
      // A few quick turns so the summary has real scores.
      const outcomes = ['done', 'done', 'skip', 'done', 'done', 'skip'];
      for (const o of outcomes) {
        await page.waitForSelector('[data-t=choose], [data-t=summary]');
        if (await page.locator('[data-t=summary]').count()) break;
        await page.click('[data-t=pick-random]');
        await page.waitForSelector('[data-t=card].revealed');
        await page.click(`[data-t=${o}]`);
      }
      if (!(await page.locator('[data-t=summary]').count())) {
        await page.click('[data-t=end-game]');
        await page.click('[data-t=dlg-ok]');
      }
      await page.waitForSelector('[data-t=summary]');
      await shot('phone-6-winner.png');
    } else {
      await page.click('[data-t=new-game]');
      for (const n of PLAYERS.slice(0, 3)) {
        await page.fill('[data-t=player-input]', n);
        await page.press('[data-t=player-input]', 'Enter');
      }
      await page.click('[data-t=start]');
      await page.waitForSelector('[data-t=choose]');
      await page.click('[data-t=pick-dare]');
      await page.waitForSelector('[data-t=card].revealed');
      await shot('phone-7-dark-mode.png');
    }
    await ctx.close();
  }
}
