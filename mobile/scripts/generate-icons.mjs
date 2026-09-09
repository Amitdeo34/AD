#!/usr/bin/env node
// Rasterises assets/icon.svg into every launcher density Android needs, the
// adaptive-icon foreground layer, and the PWA icons the web manifest points at.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = path.resolve(root, '..');
const res = path.join(root, 'android', 'app', 'src', 'main', 'res');

// Launcher icon sizes per density, and the adaptive foreground (108dp square).
const LAUNCHER = [
  ['mipmap-mdpi', 48, 108],
  ['mipmap-hdpi', 72, 162],
  ['mipmap-xhdpi', 96, 216],
  ['mipmap-xxhdpi', 144, 324],
  ['mipmap-xxxhdpi', 192, 432],
];

async function render(svgPath, size, outPath) {
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await sharp(await fs.readFile(svgPath), { density: 512 })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toFile(outPath);
}

async function main() {
  const icon = path.join(root, 'assets', 'icon.svg');
  const foreground = path.join(root, 'assets', 'icon-foreground.svg');

  const hasAndroid = await fs.access(res).then(() => true).catch(() => false);
  if (hasAndroid) {
    for (const [dir, square, adaptive] of LAUNCHER) {
      await render(icon, square, path.join(res, dir, 'ic_launcher.png'));
      // The round variant is the same art; Android masks it itself.
      await render(icon, square, path.join(res, dir, 'ic_launcher_round.png'));
      await render(foreground, adaptive, path.join(res, dir, 'ic_launcher_foreground.png'));
    }
    // Play Store listing icon.
    await render(icon, 512, path.join(root, 'assets', 'play-store-icon.png'));
    console.log(`Android launcher icons written to ${path.relative(repo, res)}`);
  } else {
    console.log('android/ not generated yet — skipping launcher icons (run `npx cap add android` first)');
  }

  const webIcons = path.join(repo, 'public', 'icons');
  await render(icon, 192, path.join(webIcons, 'icon-192.png'));
  await render(icon, 512, path.join(webIcons, 'icon-512.png'));
  await render(icon, 512, path.join(webIcons, 'icon-maskable-512.png'));
  console.log(`Web icons written to ${path.relative(repo, webIcons)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
