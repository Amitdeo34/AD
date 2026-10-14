// Image cache for frames, photos and the logo, plus the per-segment asset resolver used by every renderer.
import { api } from './api.js';
import { coverRef } from './model.js';
import { camera, drawCover } from './render.js';

export const frameKey = (path, t = 0) => (path ? `F|${path}|${(+t || 0).toFixed(3)}` : null);
export const logoKey = path => (path ? `L|${path}` : null);

export class Assets {
  constructor(pid, width = 1920) {
    this.pid = pid;
    this.width = width;
    this.map = new Map();
    this.listeners = new Set();
    this.bgCache = new Map();
  }

  url(key) {
    const rest = key.slice(2);
    if (key[0] === 'L') return api.fileUrl(this.pid, rest);
    const i = rest.lastIndexOf('|');
    return api.frameUrl(this.pid, rest.slice(0, i), +rest.slice(i + 1), this.width);
  }

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  get(key) {
    if (!key) return null;
    const e = this.map.get(key);
    if (e) return e.img;
    this.load(key);
    return null;
  }

  load(key) {
    if (!key) return Promise.resolve(null);
    const have = this.map.get(key);
    if (have) return have.p;
    const e = { img: null, err: null };
    e.p = fetch(this.url(key))
      .then(r => { if (!r.ok) throw new Error(`${r.status} for ${key}`); return r.blob(); })
      .then(b => createImageBitmap(b, { colorSpaceConversion: 'none' }))
      .then(img => { e.img = img; this.listeners.forEach(f => f(key)); return img; })
      .catch(err => { e.err = err; console.warn('asset failed', key, err); return null; });
    this.map.set(key, e);
    return e.p;
  }

  ensure(keys) { return Promise.all([...new Set(keys.filter(Boolean))].map(k => this.load(k))); }

  forget(prefix) { for (const k of [...this.map.keys()]) if (k.includes(prefix)) this.map.delete(k); }

  // Small, blurred copy of the cover image used behind dashboards (cheap to draw every frame).
  cardBg(key, W, H) {
    const img = this.get(key);
    if (!img) return null;
    const ck = `${key}|${W}x${H}`;
    if (this.bgCache.has(ck)) return this.bgCache.get(ck);
    const w = Math.max(32, Math.round(W / 6)), h = Math.max(18, Math.round(H / 6));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.filter = 'blur(3px)';
    drawCover(ctx, img, camera(img.width, img.height, w, h, 1.08));
    this.bgCache.set(ck, c);
    return c;
  }
}

export function segmentKeys(P, seg) {
  const sc = seg.scene;
  const keys = [logoKey(P.info.logo)];
  const cov = coverRef(P);
  if (seg.kind === 'freeze') keys.push(frameKey(sc.path, seg.freeze.t));
  else if (seg.kind === 'photo') keys.push(frameKey(sc.path, 0));
  else if (seg.kind === 'compare') keys.push(frameKey(sc.a?.path, sc.a?.t), frameKey(sc.b?.path, sc.b?.t));
  else if (seg.kind !== 'clip' && cov) keys.push(frameKey(cov.path, cov.t));
  return keys.filter(Boolean);
}

// Everything drawSegment() needs besides the timing.
export function resolveAssets(P, seg, assets, W, H) {
  const sc = seg.scene;
  const cov = coverRef(P);
  const covKey = cov ? frameKey(cov.path, cov.t) : null;
  const R = { P, logo: assets.get(logoKey(P.info.logo)) };
  if (seg.kind === 'freeze') R.bg = assets.get(frameKey(sc.path, seg.freeze.t));
  else if (seg.kind === 'photo') R.bg = assets.get(frameKey(sc.path, 0));
  else if (seg.kind === 'compare') { R.imgA = assets.get(frameKey(sc.a?.path, sc.a?.t)); R.imgB = assets.get(frameKey(sc.b?.path, sc.b?.t)); }
  else if (seg.kind !== 'clip' && covKey) { R.cover = assets.get(covKey); R.cardBg = assets.cardBg(covKey, W, H); }
  return R;
}
