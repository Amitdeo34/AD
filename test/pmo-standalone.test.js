// The pieces that let the engine run with no Node underneath it: its own
// deflate, its own Buffer, a store over any backing, and the single-file build.
import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { deflateRaw, inflateRaw, inflateZlib } from '@/lib/pmo/ingest/codec.browser.js';
import { PortableBuffer } from '@/lib/pmo/browser/buffer.js';
import { createStore, slugify } from '@/lib/pmo/store-core.js';
import { renderBundleHtml } from '@/lib/pmo/render/html.js';
import { generateAllReports } from '@/lib/pmo/reports/index.js';
import { demoProject } from '@/lib/pmo/demo.js';

const SAMPLES = [
  Buffer.alloc(0),
  Buffer.from('a'),
  Buffer.from('hello world '.repeat(400)),
  Buffer.from('<?xml version="1.0"?><root>' + '<cell r="A1"><v>1</v></cell>'.repeat(300) + '</root>'),
  Buffer.from(Array.from({ length: 40000 }, (_, i) => (i * 7919) % 256)),
];

test('what the browser codec writes, zlib reads back exactly', () => {
  for (const [index, input] of SAMPLES.entries()) {
    const compressed = Buffer.from(deflateRaw(input));
    assert.ok(zlib.inflateRawSync(compressed).equals(input), `sample ${index}`);
  }
});

test('what zlib writes, the browser codec reads back exactly', () => {
  for (const [index, input] of SAMPLES.entries()) {
    // Dynamic Huffman, stored blocks and the zlib wrapper are all in play in
    // real workbooks, so all three are covered.
    assert.ok(Buffer.from(inflateRaw(zlib.deflateRawSync(input, { level: 9 }))).equals(input), `dynamic ${index}`);
    assert.ok(Buffer.from(inflateRaw(zlib.deflateRawSync(input, { level: 0 }))).equals(input), `stored ${index}`);
    assert.ok(Buffer.from(inflateZlib(zlib.deflateSync(input))).equals(input), `wrapped ${index}`);
  }
});

test('the browser codec actually compresses', () => {
  const xml = SAMPLES[3];
  assert.ok(deflateRaw(xml).length < xml.length * 0.2, 'repetitive XML compresses hard');
});

test('corrupt input is rejected rather than returning nonsense', () => {
  assert.throws(() => inflateRaw(Buffer.from([0xff, 0xff, 0xff, 0xff])));
  assert.throws(() => inflateRaw(Buffer.from([])));
});

test('the portable Buffer does what the binary code asks of it', () => {
  const buffer = PortableBuffer.alloc(30);
  buffer.writeUInt32LE(0x04034b50, 0);
  buffer.writeUInt16LE(20, 4);
  assert.equal(buffer.readUInt32LE(0), 0x04034b50);
  assert.equal(buffer.readUInt16LE(4), 20);

  assert.equal(PortableBuffer.from('Hello ₹ दुनिया').toString('utf8'), 'Hello ₹ दुनिया');
  assert.equal(PortableBuffer.from([0xd0, 0xcf, 0x11, 0xe0]).toString('hex'), 'd0cf11e0');
  assert.equal(PortableBuffer.from('abc', 'latin1').toString('latin1'), 'abc');
  assert.equal(PortableBuffer.concat([PortableBuffer.from('ab'), PortableBuffer.from('cd')]).toString(), 'abcd');
  assert.ok(PortableBuffer.from([80, 75]).equals(PortableBuffer.from([80, 75])));
  assert.ok(!PortableBuffer.from([80, 75]).equals(PortableBuffer.from([80, 76])));
  assert.ok(PortableBuffer.isBuffer(PortableBuffer.alloc(1)));
  assert.ok(!PortableBuffer.isBuffer(new Uint8Array(1)));

  // subarray must keep the subclass, or the ZIP reader loses its accessors.
  const slice = PortableBuffer.from('abcdef').subarray(1, 3);
  assert.ok(slice instanceof PortableBuffer);
  assert.equal(slice.toString(), 'bc');
});

test('the store works over any backing, and survives one that refuses to write', () => {
  let saved = null;
  const store = createStore({ read: () => saved, write: (state) => { saved = structuredClone(state); } });

  const project = store.createProject({ name: 'Package P-2', code: 'P-2', contractValue: 100 });
  assert.equal(project.slug, 'p-2');
  assert.equal(project.thresholds.slippageDaysHigh, 14, 'defaults are filled in');

  store.saveDataset({ projectId: project.id, docType: 'dpr', records: [{ a: 1 }, { a: 2 }] });
  assert.equal(store.recordsOf(project.id, 'dpr').length, 2);
  assert.equal(store.listDatasets(project.id).length, 1);
  assert.ok(saved, 'it persisted through the adapter');

  // A second project that would take the same slug gets its own.
  assert.equal(store.createProject({ name: 'Package P-2 rebid', code: 'P-2' }).slug, 'p-2-2');
  // The slug otherwise comes from the code, then the name.
  assert.equal(store.createProject({ name: 'Package P-9' }).slug, 'package-p-9');

  store.deleteProject(project.slug);
  assert.equal(store.getProject(project.slug), null);
  assert.equal(store.recordsOf(project.id, 'dpr').length, 0, 'its data went with it');

  // A backing that throws must not take the session down.
  const readOnly = createStore({ read: () => null, write: () => { throw Object.assign(new Error('nope'), { code: 'QUOTA' }); } });
  const survived = readOnly.createProject({ name: 'In memory only' });
  assert.equal(readOnly.getProject(survived.slug).name, 'In memory only');
});

test('slugs are safe for a URL and never empty', () => {
  assert.equal(slugify('Metro Rail — Package MR/04'), 'metro-rail-package-mr-04');
  assert.equal(slugify('!!!'), 'project');
});

test('the complete pack is one document holding every report', () => {
  const { project, data, asOf } = demoProject();
  const packs = generateAllReports(project, data, { asOf }).map((result) => result.pack);
  const html = renderBundleHtml(packs, { title: 'Project Reporting Pack' });

  assert.equal(packs.length, 7);
  assert.ok(html.startsWith('<!doctype html>'));
  assert.equal((html.match(/class="part page-break"/g) ?? []).length, 7, 'each report is its own part');
  for (const pack of packs) assert.ok(html.includes(pack.title), `${pack.title} is in the pack`);
  // The contents must link to every section of every part.
  const sections = packs.reduce((total, pack) => total + pack.sections.length, 0);
  assert.equal((html.match(/<li><a href="#p\d+-/g) ?? []).length, sections);
});

test('the single-file build is self-contained and free of module syntax', () => {
  const root = path.resolve(import.meta.dirname, '..');
  execFileSync('node', ['scripts/build-standalone.mjs'], { cwd: root, stdio: 'pipe' });
  const file = path.join(root, 'dist/pmo-engine.html');
  const html = fs.readFileSync(file, 'utf8');

  assert.ok(html.startsWith('<!doctype html>'));
  // Nothing may be fetched: the file has to work from a desktop, offline.
  assert.ok(!/<script[^>]+src=/i.test(html), 'no external scripts');
  assert.ok(!/<link[^>]+href=/i.test(html), 'no external stylesheets');
  assert.ok(!/https?:\/\/(?!www\.w3\.org|schemas\.)/.test(html.replace(/https:\/\/claude\.ai[^\s"']*/g, '')), 'no network references');

  // The bundler must have rewritten every import and export.
  const script = html.slice(html.indexOf('<script>'));
  assert.ok(!/^\s*import\s+[\w{]/m.test(script), 'no import statements survive');
  assert.ok(!/^\s*export\s+(const|function|class|\{)/m.test(script), 'no export statements survive');
  assert.ok(script.includes('__modules["lib/pmo/browser/app.js"]'), 'the entry is bundled');
  assert.ok(script.includes('__modules["lib/pmo/ingest/codec.browser.js"]'), 'the browser codec is swapped in');
  assert.ok(!script.includes('__modules["lib/pmo/store.js"]'), 'the Node store is not bundled');
  assert.ok(script.includes('__modules["lib/pmo/browser/store.js"]'), 'the browser store is swapped in');
  assert.ok(!/node:(fs|path|zlib|crypto)/.test(script), 'no Node built-ins reach the browser');
});
