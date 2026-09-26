#!/usr/bin/env node
/* Builds dist/ScheduleEngine.html - one self-contained offline file
 * (all CSS, engine code and third-party libraries inlined) and copies it to
 * ../public/schedule-engine/index.html so the web app serves it at /schedule-engine. */
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = path.join(root, 'src');
let html = fs.readFileSync(path.join(src, 'index.html'), 'utf8');

const safe = (js) => js.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
const block = (name) => new RegExp('<!--@' + name + '-->[\\s\\S]*?<!--@/' + name + '-->');
const refs = (name, attr) => {
  const m = block(name).exec(html);
  if (!m) throw new Error('Marker ' + name + ' not found');
  const re = new RegExp(attr + '="([^"]+)"', 'g');
  const out = [];
  let x;
  while ((x = re.exec(m[0]))) out.push(path.join(src, x[1]));
  return out;
};

const css = refs('CSS', 'href').map((f) => fs.readFileSync(f, 'utf8')).join('\n');
const vendor = refs('VENDOR', 'src');
const own = refs('JS', 'src');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const stamp = new Date().toISOString().slice(0, 10);

html = html.replace(block('CSS'), () => '<style>\n' + css + '\n</style>');
html = html.replace(block('VENDOR'), () => vendor.map((f) => {
  const code = fs.readFileSync(f, 'utf8');
  if (/<!--/.test(code) && /<script/i.test(code)) throw new Error(path.basename(f) + ' cannot be inlined safely');
  return '<script data-lib="' + path.basename(f) + '">\n' + code.replace(/<\/script/gi, '<\\/script') + '\n</script>';
}).join('\n'));
html = html.replace(block('JS'), () => '<script>\n/* Schedule Engine v' + version + ' (' + stamp + ') */\n' + own.map((f) => '/* ---- ' + path.relative(src, f) + ' ---- */\n' + safe(fs.readFileSync(f, 'utf8'))).join('\n') + '\n</script>');
html = html.replace('<meta name="description"', '<meta name="generator" content="Schedule Engine v' + version + ' build ' + stamp + '">\n<meta name="description"');

const dist = path.join(root, 'dist');
fs.mkdirSync(dist, { recursive: true });
const out = path.join(dist, 'ScheduleEngine.html');
fs.writeFileSync(out, html);
const pub = path.join(root, '..', 'public', 'schedule-engine');
if (fs.existsSync(path.join(root, '..', 'public'))) {
  fs.mkdirSync(pub, { recursive: true });
  fs.writeFileSync(path.join(pub, 'index.html'), html);
}
console.log('Built ' + path.relative(process.cwd(), out) + ' (' + (html.length / 1048576).toFixed(2) + ' MB)');
