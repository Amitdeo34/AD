// Renders the PWA PNG icons from the SVG sources with Playwright's Chromium.
//   npm run icons
// Playwright is not a dependency of this project: it must already be installed
// globally (NODE_PATH) or in a parent folder.

import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'icons');

const jobs = [
  { svg: 'icon.svg', out: 'icon-192.png', size: 192, transparent: true },
  { svg: 'icon.svg', out: 'icon-512.png', size: 512, transparent: true },
  { svg: 'icon-maskable.svg', out: 'icon-maskable-512.png', size: 512, transparent: false },
];

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  console.error('Playwright is not installed. Install it (npm i -g playwright) or render the SVGs another way.');
  process.exit(1);
}

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const job of jobs) {
    const svg = await readFile(path.join(OUT, job.svg), 'utf8');
    await page.setViewportSize({ width: job.size, height: job.size });
    await page.setContent(
      `<!doctype html><html><body style="margin:0;background:transparent">` +
      `<img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}" width="${job.size}" height="${job.size}" style="display:block">` +
      `</body></html>`,
    );
    await page.waitForFunction(() => document.images[0]?.complete);
    await page.screenshot({ path: path.join(OUT, job.out), omitBackground: job.transparent, clip: { x: 0, y: 0, width: job.size, height: job.size } });
    console.log('wrote', path.relative(ROOT, path.join(OUT, job.out)));
  }
} finally {
  await browser.close();
}
