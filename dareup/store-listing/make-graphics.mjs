// Renders store graphics: feature-graphic-1024x500.png (Google Play) and,
// with --shots, phone screenshots of ../index.html (1080x1920).
// Run: node make-graphics.mjs [--shots]
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const here = dirname(fileURLToPath(import.meta.url));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 500 }, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(join(here, 'feature-graphic.html')).href);
await page.locator('#fg').screenshot({ path: join(here, 'feature-graphic-1024x500.png') });
console.log('feature-graphic-1024x500.png');

if (process.argv.includes('--shots')) {
  const { takeShots } = await import('./screenshots.mjs');
  await takeShots(browser, here);
}
await browser.close();
