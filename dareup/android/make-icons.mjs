// Renders the Android launcher icons and the Play Store icon from icon/*.svg.
// Run: node make-icons.mjs   (uses the preinstalled Playwright + Chromium)
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const here = dirname(fileURLToPath(import.meta.url));
const svg = (n) => readFileSync(join(here, 'icon', n), 'utf8');
const inner = (s) => s.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
const bg = svg('background.svg'), fg = svg('foreground.svg'), mono = svg('monochrome.svg');

// Legacy square icon: the central 72dp of the 108dp adaptive canvas, rounded.
const legacy = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="18 18 72 72">
  <defs><clipPath id="c"><rect x="18" y="18" width="72" height="72" rx="16"/></clipPath></defs>
  <g clip-path="url(#c)">${inner(bg)}${inner(fg)}</g></svg>`;
// Play Store icon: full square, Google Play applies its own mask.
const play = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="12 12 84 84">${inner(bg)}${inner(fg)}</svg>`;

const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
const jobs = [];
for (const [d, k] of Object.entries(densities)) {
  jobs.push([`res/mipmap-${d}/ic_launcher.png`, legacy, 48 * k]);
  jobs.push([`res/mipmap-${d}/ic_launcher_foreground.png`, fg, 108 * k]);
  jobs.push([`res/mipmap-${d}/ic_launcher_monochrome.png`, mono, 108 * k]);
}
jobs.push(['store/play-icon-512.png', play, 512]);

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const [out, src, size] of jobs) {
  const file = join(here, out);
  mkdirSync(dirname(file), { recursive: true });
  const sized = src.replace('<svg ', `<svg width="${size}" height="${size}" `);
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${sized}</body></html>`);
  await page.locator('svg').screenshot({ path: file, omitBackground: true });
  console.log(out, `${size}px`);
}
await browser.close();
