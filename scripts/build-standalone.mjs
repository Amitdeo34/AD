// Build the engine into a single HTML file.
//
//   npm run pmo:standalone   →  dist/pmo-engine.html
//
// One file, opened from a desktop, does everything the served app does: reads
// the workbook, reconciles it, and writes the reports. No install, no network,
// no data leaving the machine — which is what makes it usable on a client site
// where nothing can be installed.
//
// The bundling is deliberately small and legible rather than a toolchain: the
// engine's modules are plain ESM with named exports and no cycles, so they can
// be wrapped in a registry and required in order.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const ENTRY = 'lib/pmo/browser/app.js';

// Two modules exist twice: once for Node, once for a browser with neither
// zlib nor a filesystem. The browser build takes the second of each.
const SWAPS = new Map([
  ['lib/pmo/ingest/codec.js', 'lib/pmo/ingest/codec.browser.js'],
  ['lib/pmo/store.js', 'lib/pmo/browser/store.js'],
]);

const read = (id) => fs.readFileSync(path.join(root, id), 'utf8');

function resolve(fromId, specifier) {
  if (!specifier.startsWith('.')) throw new Error(`The browser build cannot use "${specifier}" (imported by ${fromId})`);
  const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(fromId), specifier));
  return SWAPS.get(resolved) ?? resolved;
}

const IMPORT_PATTERN = /^import\s+(\{[\s\S]*?\}|[\w$]+)\s+from\s+'([^']+)';?$/gm;
const EXPORT_FROM_PATTERN = /^export\s+\{([^}]*)\}\s*;?$/gm;

/**
 * Rewrite one module into a registry function.
 *
 * Only the forms this codebase actually uses are handled, and anything else
 * throws rather than being silently mangled.
 */
function transform(id, source) {
  const dependencies = new Set();
  let code = source;

  code = code.replace(IMPORT_PATTERN, (whole, binding, specifier) => {
    const target = resolve(id, specifier);
    dependencies.add(target);
    const names = binding.startsWith('{')
      ? binding.replace(/\s+/g, ' ').replace(/(\w+) as (\w+)/g, '$1: $2')
      : `{ default: ${binding} }`;
    return `const ${names} = __require(${JSON.stringify(target)});`;
  });

  if (/^import\s/m.test(code)) {
    const offender = code.match(/^import\s.*$/m)[0];
    throw new Error(`Unhandled import in ${id}: ${offender}`);
  }

  const exported = new Set();

  code = code.replace(/^export\s+(async\s+)?function\s+([\w$]+)/gm, (whole, asyncWord, name) => {
    exported.add(name);
    return `${asyncWord ?? ''}function ${name}`;
  });
  code = code.replace(/^export\s+(const|let|var)\s+([\w$]+)/gm, (whole, keyword, name) => {
    exported.add(name);
    return `${keyword} ${name}`;
  });
  code = code.replace(/^export\s+class\s+([\w$]+)/gm, (whole, name) => {
    exported.add(name);
    return `class ${name}`;
  });
  // Destructured re-exports, e.g. `export const { a, b } = store;`
  code = code.replace(/^export\s+(const|let)\s+\{([\s\S]*?)\}\s*=/gm, (whole, keyword, names) => {
    for (const entry of names.split(',')) {
      const name = entry.split(':').pop().trim();
      if (name) exported.add(name);
    }
    return `${keyword} {${names}} =`;
  });
  code = code.replace(EXPORT_FROM_PATTERN, (whole, names) => {
    for (const entry of names.split(',')) {
      const [original, alias] = entry.split(/\s+as\s+/).map((part) => part.trim());
      if (original) exported.add(alias ?? original);
    }
    return '';
  });

  if (/^export\s/m.test(code)) {
    throw new Error(`Unhandled export in ${id}: ${code.match(/^export\s.*$/m)[0]}`);
  }

  // `export { STYLES as REPORT_STYLES }` needs the alias bound to the original.
  const aliases = [...source.matchAll(/^export\s+\{([^}]*)\}\s*;?$/gm)]
    .flatMap((match) => match[1].split(','))
    .map((entry) => entry.split(/\s+as\s+/).map((part) => part.trim()))
    .filter(([, alias]) => alias)
    .map(([original, alias]) => `const ${alias} = ${original};`)
    .join('\n');

  const assignments = [...exported].map((name) => `  __exports.${name} = ${name};`).join('\n');

  return {
    dependencies,
    code: `__modules[${JSON.stringify(id)}] = function (__exports, __require) {
${code}
${aliases}
${assignments}
};`,
  };
}

function collect(entry) {
  const modules = new Map();
  const queue = [entry];
  while (queue.length) {
    const id = queue.shift();
    if (modules.has(id)) continue;
    const transformed = transform(id, read(id));
    modules.set(id, transformed);
    for (const dependency of transformed.dependencies) queue.push(dependency);
  }
  return modules;
}

const modules = collect(ENTRY);
const bufferShim = read('lib/pmo/browser/buffer.js')
  .replace(/^export\s+/gm, '')
  .replace(/^import[\s\S]*?;$/gm, '');

const STYLE = `
*,*::before,*::after{box-sizing:border-box}
:root{color-scheme:light}
body{margin:0;background:#f4f6f9;color:#1c1a17;font:14px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",sans-serif}
header.top{background:#10284b;color:#fff;padding:0 20px;position:sticky;top:0;z-index:20}
header.top .inner{max-width:1140px;margin:0 auto;display:flex;align-items:center;gap:12px;height:58px}
header.top .mark{display:grid;place-items:center;width:34px;height:34px;border-radius:9px;background:rgba(255,255,255,.15);font-weight:800;font-size:12px}
header.top h1{font-size:17px;margin:0;letter-spacing:-.01em}
header.top .sub{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,.6)}
main{max-width:1140px;margin:0 auto;padding:18px 20px 60px}
#projectBar{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-bottom:16px}
.spacer{flex:1}
.card{background:#fff;border:1px solid #e4e9f0;border-radius:12px;padding:18px 20px;margin-bottom:16px;box-shadow:0 1px 2px rgba(16,40,75,.04)}
.card h2{font-size:16px;color:#10284b;margin:0 0 4px}
.card h3{font-size:13px;color:#10284b;margin:18px 0 6px}
.project-head h1{font-size:23px;color:#10284b;margin:0 0 2px;letter-spacing:-.015em}
.project-head p{margin:0 0 14px}
.muted{color:#6b7280}.small{font-size:12px}.warn-text{color:#92400e}
p{margin:0 0 10px}
.btn{display:inline-flex;align-items:center;gap:6px;border:1px solid transparent;border-radius:8px;background:#10284b;color:#fff;font:inherit;font-size:13px;font-weight:600;padding:8px 14px;cursor:pointer}
.btn:hover{background:#1c4e8f}
.btn.secondary{background:#fff;color:#10284b;border-color:#c6d0de}
.btn.secondary:hover{background:#f4f6f9}
.btn.danger{background:#fff;color:#b91c1c;border-color:#fecaca}
.btn.small{font-size:12px;padding:6px 10px}
.btn:disabled{opacity:.45;cursor:not-allowed}
.btn-row{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.link{background:none;border:0;font:inherit;font-size:12px;color:#1c4e8f;cursor:pointer;padding:0;text-decoration:underline}
.link.danger{color:#b91c1c}
label.inline{display:inline-flex;align-items:center;gap:7px;font-size:13px}
label span{display:block;font-size:12px;font-weight:600;color:#3d3931;margin-bottom:3px}
input,select{font:inherit;font-size:13px;padding:7px 9px;border:1px solid #c6d0de;border-radius:8px;background:#fff;color:#1c1a17;width:100%}
label.inline input,label.inline select{width:auto}
input:focus,select:focus{outline:none;border-color:#2a78d6;box-shadow:0 0 0 3px rgba(42,120,214,.15)}
.grid{display:grid;gap:12px}
.grid.two{grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}
.grid.three{grid-template-columns:repeat(auto-fit,minmax(180px,1fr))}
.grid .full{grid-column:1/-1}
.drop{border:2px dashed #c6d0de;border-radius:12px;background:#f8fafc;padding:28px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:7px}
.drop.over{border-color:#2a78d6;background:#eef5fd}
.drop strong{color:#10284b}
.sheet{border:1px solid #e4e9f0;border-radius:10px;padding:14px 16px;margin-top:14px}
.sheet-head{display:flex;align-items:center;gap:12px}
.sheet-head h3{margin:0;flex:1}
table.map{width:100%;border-collapse:collapse;font-size:12px;margin-top:10px}
table.map th{text-align:left;color:#6b7280;font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid #e4e9f0;padding:5px 8px 5px 0}
table.map td{border-bottom:1px solid #f1f4f8;padding:5px 8px 5px 0;vertical-align:middle}
table.map td select{max-width:250px}
.pill{display:inline-block;border-radius:20px;padding:2px 9px;font-size:11px;font-weight:700;margin-right:6px}
.pill.good{background:#dcfce7;color:#14532d}.pill.warn{background:#fef3c7;color:#78350f}.pill.bad{background:#fee2e2;color:#7f1d1d}
.note{border-radius:8px;padding:9px 12px;margin:10px 0;font-size:12.5px;border:1px solid}
.note.warn{background:#fffbeb;border-color:#fde68a;color:#78350f}
.actions{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-top:14px;padding-top:12px;border-top:1px solid #e4e9f0}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin:10px 0 4px}
.stat{border:1px solid #e4e9f0;border-left:3px solid #c6d0de;border-radius:9px;padding:9px 12px}
.stat.good{border-left-color:#0ca30c}.stat.warn{border-left-color:#fab219}.stat.bad{border-left-color:#d03b3b}
.stat-label{display:block;font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:#6b7280}
.stat-value{display:block;font-size:19px;font-weight:700;color:#10284b;line-height:1.2;margin-top:2px}
.stat-sub{display:block;font-size:11.5px;color:#5b5750;margin-top:1px}
.meter{height:6px;border-radius:99px;background:#e4e9f0;overflow:hidden;margin:6px 0}
.meter-fill{height:100%;border-radius:99px}
.meter-fill.good{background:#0ca30c}.meter-fill.warn{background:#fab219}.meter-fill.bad{background:#d03b3b}
.findings{list-style:none;padding:0;margin:8px 0 0;display:grid;gap:8px}
.findings li{border-left:2px solid #c6d0de;padding-left:10px;font-size:12.5px}
.report-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(255px,1fr));gap:12px;margin-top:14px}
.report{border:1px solid #e4e9f0;border-radius:10px;padding:12px 14px}
.report.blocked{border-style:dashed;background:#fafbfc}
.report h3{margin:0 0 4px;font-size:13.5px}
.pack{display:flex;flex-wrap:wrap;align-items:center;gap:14px;margin-top:16px;padding:14px 16px;border:1px solid #c6d0de;border-radius:10px;background:#f4f6f9}
.pack h3{margin:0 0 2px}
.pack div{flex:1;min-width:240px}
.empty{text-align:center;padding:40px 24px}
.empty .btn-row{justify-content:center}
.toast{position:fixed;left:50%;bottom:-80px;transform:translateX(-50%);background:#10284b;color:#fff;padding:11px 18px;border-radius:10px;font-size:13px;max-width:min(680px,92vw);box-shadow:0 8px 28px rgba(0,0,0,.25);transition:bottom .25s ease;z-index:50}
.toast.show{bottom:22px}
.toast.good{background:#14532d}.toast.bad{background:#7f1d1d}.toast.warn{background:#78350f}
@media(max-width:640px){main{padding:14px 12px 50px}.card{padding:14px}}
`;

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>PMO Reporting Engine</title>
<style>${STYLE}</style>
</head>
<body>
<header class="top">
  <div class="inner">
    <span class="mark">PMO</span>
    <span>
      <h1>Reporting Engine</h1>
      <span class="sub">one upload, every report</span>
    </span>
  </div>
</header>
<main>
  <div id="projectBar"></div>
  <div id="panels"></div>
</main>
<div id="toast" class="toast"></div>
<noscript><p style="padding:24px">This page needs JavaScript: the whole engine runs inside it.</p></noscript>
<script>
(function () {
'use strict';

// ---- Buffer, for the binary formats -----------------------------------
${bufferShim}
if (!globalThis.Buffer) globalThis.Buffer = PortableBuffer;

// ---- module registry ---------------------------------------------------
var __modules = {};
var __cache = {};
function __require(id) {
  if (__cache[id]) return __cache[id];
  var exports = {};
  __cache[id] = exports;
  var factory = __modules[id];
  if (!factory) throw new Error('Module not bundled: ' + id);
  factory(exports, __require);
  return exports;
}

${[...modules.values()].map((module) => module.code).join('\n\n')}

try {
  __require(${JSON.stringify(ENTRY)});
} catch (err) {
  document.getElementById('panels').innerHTML =
    '<section class="card"><h2>The engine could not start</h2><p>' +
    String(err && err.message ? err.message : err).replace(/[&<>]/g, '') +
    '</p><p class="muted small">Please report this with the browser and version you are using.</p></section>';
  throw err;
}
}());
</script>
</body>
</html>
`;

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const out = path.join(root, 'dist/pmo-engine.html');
fs.writeFileSync(out, html);

console.log(`${modules.size} modules bundled`);
console.log(`dist/pmo-engine.html — ${(html.length / 1024).toFixed(0)} KB`);
