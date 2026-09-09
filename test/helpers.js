import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Every test file gets a private data directory, so stores never collide.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ehb-test-'));
process.env.EHB_DATA_DIR = dir;
process.env.EHB_JWT_SECRET = 'test-secret';
process.env.ATITHI_JWT_SECRET = 'test-secret';
process.env.EHB_UPI_VPA = process.env.EHB_UPI_VPA ?? 'easyhotels@okicici';

export const DATA_DIR = dir;

export function isoDate(daysFromNow) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

/** Build a Request the way a Next route handler receives one. */
export function req(method, url, { body, token } = {}) {
  return new Request(`http://localhost${url}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

/** Call a route handler and unwrap its JSON. */
export async function call(handler, request, params = {}) {
  const res = await handler(request, { params: Promise.resolve(params) });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}
