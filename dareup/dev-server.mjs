#!/usr/bin/env node
// DareUp local dev server. Zero dependencies.
//   npm run dev                 -> http://localhost:3000
//   PORT=0 npm run dev          -> random free port (printed on start)
//   DEMO_MODE=1 PASS_SECRET=... -> try the whole premium flow without Razorpay
//
// Serves static files from this folder (clean URLs: /privacy -> privacy.html) and routes
// /api/<name> to api/<name>.js with a Vercel-like shim (req.query, req.body,
// res.status().json()). Applies the "headers" from vercel.json so CSP problems show up
// locally too. Reads .env.local / .env if present (never overrides real env vars;
// set NO_DOTENV=1 to skip). Restart after changing API code.

import http from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const MAX_DEV_BODY = 1024 * 1024; // Vercel allows ~4.5 MB; handlers enforce their own small limit
const BLOCKED_TOP = new Set(['api', 'android', 'test', 'scripts', 'node_modules', 'store-listing']);
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
};

loadDotEnv();
const headerRules = loadHeaderRules();

function loadDotEnv() {
  if (process.env.NO_DOTENV === '1') return;
  for (const name of ['.env.local', '.env']) {
    const file = path.join(ROOT, name);
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      if (!line.trim() || line.trim().startsWith('#')) continue;
      const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
      if (!m) continue;
      let value = m[2];
      if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1);
      if (process.env[m[1]] === undefined) process.env[m[1]] = value;
    }
  }
}

// Turns Vercel "source" patterns ("/(.*)", "/api/(.*)", "/:path*") into RegExps.
function loadHeaderRules() {
  try {
    const cfg = JSON.parse(readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
    return (cfg.headers || []).map((rule) => ({
      re: new RegExp(`^${rule.source.replace(/:(\w+)\*/g, '(.*)').replace(/:(\w+)/g, '([^/]+)')}$`),
      headers: rule.headers || [],
    }));
  } catch {
    return [];
  }
}

function applyHeaderRules(pathname, res) {
  for (const rule of headerRules) {
    if (rule.re.test(pathname)) for (const { key, value } of rule.headers) res.setHeader(key, value);
  }
}

function sendText(res, status, text) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.end(text);
}

function readRaw(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(Object.assign(new Error('Body too large'), { statusCode: 413 }));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// Mimics the parts of Vercel's Node runtime helpers that the handlers rely on.
function vercelShim(req, res, url, raw) {
  req.query = Object.fromEntries(url.searchParams);
  Object.defineProperty(req, 'body', {
    configurable: true,
    get() {
      if (!raw.length) return undefined;
      const type = String(req.headers['content-type'] || '').toLowerCase();
      if (type.includes('application/json')) {
        try {
          return JSON.parse(raw.toString('utf8'));
        } catch {
          throw Object.assign(new Error('Invalid JSON'), { statusCode: 400 });
        }
      }
      if (type.startsWith('text/')) return raw.toString('utf8');
      return raw;
    },
  });
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (obj) => {
    if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(obj));
    return res;
  };
  res.send = (body) => {
    if (body !== null && typeof body === 'object' && !Buffer.isBuffer(body)) return res.json(body);
    res.end(body);
    return res;
  };
}

async function handleApi(req, res, url, pathname) {
  const name = pathname.slice('/api/'.length).replace(/\/+$/, '');
  // Only top-level, non-underscore files are routes (same rule as Vercel).
  const file = path.join(ROOT, 'api', `${name}.js`);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name) || !existsSync(file)) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'not_found', message: 'No such API route.' }));
    return;
  }
  let raw;
  try {
    raw = await readRaw(req, MAX_DEV_BODY);
  } catch (err) {
    return sendText(res, err.statusCode || 400, 'Bad request body');
  }
  vercelShim(req, res, url, raw);
  const mod = await import(pathToFileURL(file).href);
  await mod.default(req, res);
}

async function serveStatic(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return sendText(res, 405, 'Method not allowed');
  }
  const segments = pathname.split('/').filter(Boolean);
  if (segments.some((s) => s.startsWith('.') || s.includes('\\')) || BLOCKED_TOP.has(segments[0]) ||
      segments[0] === 'dev-server.mjs') {
    return sendText(res, 404, 'Not found');
  }
  let file = path.join(ROOT, ...segments);
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) return sendText(res, 404, 'Not found');

  const candidates = pathname.endsWith('/') || segments.length === 0
    ? [path.join(file, 'index.html')]
    : [file, `${file}.html`, path.join(file, 'index.html')];
  for (const candidate of candidates) {
    try {
      const info = await stat(candidate);
      if (!info.isFile()) continue;
      const body = await readFile(candidate);
      res.statusCode = 200;
      res.setHeader('Content-Type', MIME[path.extname(candidate).toLowerCase()] || 'application/octet-stream');
      if (!res.getHeader('Cache-Control')) res.setHeader('Cache-Control', 'no-cache');
      res.end(req.method === 'HEAD' ? undefined : body);
      return;
    } catch {
      // try the next candidate
    }
  }
  sendText(res, 404, 'Not found');
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://localhost');
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return sendText(res, 400, 'Bad request');
  }
  try {
    applyHeaderRules(pathname, res);
    if (pathname === '/api' || pathname.startsWith('/api/')) await handleApi(req, res, url, pathname);
    else await serveStatic(req, res, pathname);
  } catch (err) {
    console.error('[dev-server]', err?.message || err);
    if (!res.headersSent) sendText(res, 500, 'Internal error');
    else res.end();
  }
});

server.listen(Number(process.env.PORT ?? 3000), () => {
  const { port } = server.address();
  const demo = ['1', 'true'].includes(String(process.env.DEMO_MODE || '').toLowerCase());
  const key = String(process.env.RAZORPAY_KEY_ID || '');
  const payments = demo
    ? 'DEMO_MODE (no real money)'
    : key && process.env.RAZORPAY_KEY_SECRET
      ? `Razorpay ${key.startsWith('rzp_live_') ? 'LIVE' : 'test'} keys`
      : 'not configured (premium purchase returns 503)';
  console.log(`DareUp dev server running at http://localhost:${port}`);
  console.log(`  payments: ${payments}`);
  if (String(process.env.PASS_SECRET || '').length < 32) console.log('  warning: PASS_SECRET missing or under 32 chars, passes cannot be issued');
});
