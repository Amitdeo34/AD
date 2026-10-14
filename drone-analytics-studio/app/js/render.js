// The renderer. Every designed pixel of the video, the live preview, the PPT stills and the
// editor comes from these functions, so what you see while editing is exactly what you export.
import { clamp, lerp, easeOut, easeInOut, easeSine, easeBack, ramp, rgba, fmtDate } from './util.js';
import { FX, chromeAlpha, dipAlpha } from './timeline.js';
import {
  zoneInfo, pinInfo, stageOf, buildingOf, SEVERITY, MILESTONE_STATUS, CRITICAL, overallProgress, isCorporate,
} from './model.js';

export const FONT = "Inter, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
const F = (w, px) => `${w} ${px}px ${FONT}`;
const GLASS = 'rgba(9,13,22,0.80)';
const GLASS_LINE = 'rgba(255,255,255,0.14)';

// ------------------------------------------------------------------ geometry & camera
export function camera(iw, ih, W, H, zoom = 1, focus = null, p = 0) {
  const s = Math.max(W / iw, H / ih) * zoom;
  let cx = iw / 2, cy = ih / 2;
  if (focus) { cx = lerp(cx, focus[0] * iw, p); cy = lerp(cy, focus[1] * ih, p); }
  const hw = W / (2 * s), hh = H / (2 * s);
  cx = hw >= iw / 2 ? iw / 2 : clamp(cx, hw, iw - hw);
  cy = hh >= ih / 2 ? ih / 2 : clamp(cy, hh, ih - hh);
  const ox = W / 2 - cx * s, oy = H / 2 - cy * s;
  return {
    s, ox, oy, iw, ih, W, H,
    pt: q => [ox + q[0] * iw * s, oy + q[1] * ih * s],
    inv: (x, y) => [(x - ox) / (iw * s), (y - oy) / (ih * s)],
  };
}

export function drawCover(ctx, img, cam) {
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, cam.ox, cam.oy, cam.iw * cam.s, cam.ih * cam.s);
}

const imgSize = img => [img.videoWidth || img.naturalWidth || img.width, img.videoHeight || img.naturalHeight || img.height];

function polyPath(ctx, pts, close = true) {
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
  if (close) ctx.closePath();
}
const perimeter = (pts, close = true) => {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  if (close && pts.length > 2) L += Math.hypot(pts[0][0] - pts.at(-1)[0], pts[0][1] - pts.at(-1)[1]);
  return L;
};
// Path along the first `len` pixels of a polyline (used for the "drawing itself" reveal).
function partialPath(ctx, pts, len, close) {
  const P = close && pts.length > 2 ? [...pts, pts[0]] : pts;
  ctx.beginPath();
  ctx.moveTo(P[0][0], P[0][1]);
  let left = len;
  for (let i = 1; i < P.length && left > 0; i++) {
    const d = Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
    if (d <= left) { ctx.lineTo(P[i][0], P[i][1]); left -= d; }
    else { const k = left / d; ctx.lineTo(P[i - 1][0] + (P[i][0] - P[i - 1][0]) * k, P[i - 1][1] + (P[i][1] - P[i - 1][1]) * k); left = 0; }
  }
  if (close && pts.length > 2 && len >= perimeter(pts, true) - 0.5) ctx.closePath();
}

export function centroid(pts) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length];
    const f = x0 * y1 - x1 * y0;
    a += f; cx += (x0 + x1) * f; cy += (y0 + y1) * f;
  }
  if (Math.abs(a) < 1e-9) {
    return [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
  }
  return [cx / (3 * a), cy / (3 * a)];
}
function bbox(pts) {
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

export function annFocus(anns) {
  const pts = [];
  for (const a of anns || []) {
    if (a.type === 'zone') pts.push(...a.pts);
    else if (a.type === 'arrow') pts.push(a.a, a.b);
    else if (a.at) pts.push(a.at);
  }
  if (!pts.length) return [0.5, 0.5];
  const b = bbox(pts);
  return [clamp((b[0] + b[2]) / 2), clamp((b[1] + b[3]) / 2)];
}

function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

function wrap(ctx, text, maxW, maxLines = 2) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (let i = 0; i < words.length; i++) {
    const test = cur ? cur + ' ' + words[i] : words[i];
    if (ctx.measureText(test).width <= maxW || !cur) cur = test;
    else {
      lines.push(cur);
      cur = words[i];
      if (lines.length === maxLines) { cur = null; break; }
    }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) lines.length = maxLines;
  const usedWords = lines.join(' ').split(/\s+/).filter(Boolean).length;
  if (usedWords < words.length && lines.length) {
    let l = lines[lines.length - 1];
    while (l.length > 1 && ctx.measureText(l + '…').width > maxW) l = l.slice(0, -1);
    lines[lines.length - 1] = l.replace(/[\s,.;:-]+$/, '') + '…';
  }
  // single long words
  return lines.map(l => {
    if (ctx.measureText(l).width <= maxW) return l;
    while (l.length > 1 && ctx.measureText(l + '…').width > maxW) l = l.slice(0, -1);
    return l + '…';
  });
}

function fitText(ctx, text, maxW) {
  text = String(text || '');
  if (ctx.measureText(text).width <= maxW) return text;
  while (text.length > 1 && ctx.measureText(text + '…').width > maxW) text = text.slice(0, -1);
  return text + '…';
}

function spaced(ctx, px) {
  if ('letterSpacing' in ctx) ctx.letterSpacing = px + 'px';
}

function shadowText(ctx, S, blur = 12) {
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = blur * S;
  ctx.shadowOffsetY = 2 * S;
}
function noShadow(ctx) {
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
}

function hatch(ctx, pts, color, S, alpha) {
  ctx.save();
  polyPath(ctx, pts);
  ctx.clip();
  const b = bbox(pts);
  ctx.strokeStyle = rgba(color, 0.35 * alpha);
  ctx.lineWidth = 2 * S;
  ctx.beginPath();
  const step = 16 * S;
  for (let x = b[0] - (b[3] - b[1]); x < b[2]; x += step) {
    ctx.moveTo(x, b[3]); ctx.lineTo(x + (b[3] - b[1]), b[1]);
  }
  ctx.stroke();
  ctx.restore();
}

// ------------------------------------------------------------------ annotations
// lt: seconds since this annotation started appearing (large in editor/still mode)
// live: global multiplier used for the exit fade; tau: time since the analysis started (for pulses)
function zoneShape(ctx, a, cam, S, lt, live, tau, P) {
  if (!a.pts || a.pts.length < 2) return;
  const pts = a.pts.map(cam.pt);
  const zi = zoneInfo(P, a);
  const sp = clamp(lt / 0.75);
  if (sp <= 0 || live <= 0) return;
  const e = easeOut(sp);
  const fillP = ramp(lt, 0.3, 0.5);
  ctx.save();
  ctx.globalAlpha = live;
  const corp = isCorporate(P);
  polyPath(ctx, pts, pts.length > 2);
  if (pts.length > 2 && a.fill !== false) {
    const pulse = zi.critical ? 0.5 + 0.5 * Math.sin(tau * 4) : 0;
    const base = corp ? 0.17 : 0.20;
    ctx.fillStyle = rgba(zi.color, (zi.critical ? 0.20 + 0.10 * pulse : base) * fillP);
    ctx.fill();
    if (zi.critical) hatch(ctx, pts, zi.color, S, fillP * live);
  }
  const closed = pts.length > 2;
  const L = perimeter(pts, closed);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (corp) {
    // dashed demarcation, like the hand-made PPT boxes but crisp and gently animated
    partialPath(ctx, pts, L * e, closed);
    ctx.lineCap = 'butt';
    ctx.setLineDash([15 * S, 9 * S]);
    ctx.lineDashOffset = -tau * 18 * S;
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 6 * S;
    ctx.globalAlpha = live * 0.5;
    ctx.stroke();
    ctx.globalAlpha = live;
    ctx.strokeStyle = zi.color;
    ctx.lineWidth = 3.8 * S;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;
  } else {
    partialPath(ctx, pts, L * e, closed);
    ctx.shadowColor = zi.color;
    ctx.shadowBlur = (zi.critical ? 16 + 10 * (0.5 + 0.5 * Math.sin(tau * 4)) : 12) * S;
    ctx.strokeStyle = zi.color;
    ctx.lineWidth = 3.4 * S;
    ctx.stroke();
    noShadow(ctx);
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1 * S;
    ctx.stroke();
    if (sp >= 1) {
      const va = ramp(lt, 0.75, 0.3);
      for (const p of pts) {
        ctx.beginPath();
        ctx.arc(p[0], p[1], 3.6 * S, 0, Math.PI * 2);
        ctx.fillStyle = rgba('#ffffff', va);
        ctx.fill();
        ctx.lineWidth = 1.5 * S;
        ctx.strokeStyle = rgba(zi.color, va);
        ctx.stroke();
      }
    }
  }
  if (zi.critical && lt > 0.9 && pts.length > 2) {
    const c = centroid(pts);
    for (const off of [0, 0.5]) {
      const ph = ((tau * 0.7 + off) % 1);
      const k = 1 + 0.10 * easeOut(ph);
      ctx.beginPath();
      pts.forEach((p, i) => {
        const x = c[0] + (p[0] - c[0]) * k, y = c[1] + (p[1] - c[1]) * k;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      });
      ctx.closePath();
      ctx.strokeStyle = rgba(CRITICAL, 0.7 * (1 - ph) * live);
      ctx.lineWidth = 2.5 * S;
      ctx.stroke();
    }
  }
  ctx.restore();
}

// ------------------------------------------------------------------ label placement
// Labels are laid out once in the un-zoomed camera (cam0) so they never jump while the camera moves,
// avoid the branding / highlight panels and each other, and are then carried along with the zoom.
function overlap(a, b) {
  const w = Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]);
  const h = Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]);
  return w > 0 && h > 0 ? w * h : 0;
}

function place(L, size, cands, fixedCenter) {
  const [w, h] = size;
  const m = 16 * L.S;
  const list = fixedCenter ? [[fixedCenter[0] - w / 2, fixedCenter[1] - h / 2]] : cands;
  let best = null, bestScore = Infinity;
  for (const [x, y] of list) {
    const r = [clamp(x, m, L.W - w - m), clamp(y, m, L.H - h - m), w, h];
    let score = (Math.abs(r[0] - x) + Math.abs(r[1] - y)) * w * 0.02;
    for (const o of L.avoid) score += overlap(r, o);
    for (const o of L.placed) score += overlap(r, o) * 2;
    if (score < bestScore - 1e-6) { best = r; bestScore = score; }
    if (score === 0 && !fixedCenter) break;
  }
  L.placed.push(best);
  return best;
}

// map a rect laid out in cam0 onto the current (possibly zoomed) camera
function follow(L, cam, r) {
  const n = L.cam0.inv(r[0] + r[2] / 2, r[1] + r[3] / 2);
  const c = cam.pt(n);
  const m = 12 * L.S;
  return [clamp(c[0] - r[2] / 2, m, cam.W - r[2] - m), clamp(c[1] - r[3] / 2, m, cam.H - r[3] - m), r[2], r[3]];
}

// Marker anchor of a zone, in normalised image coordinates: on the top edge, kept inside the frame.
export function zoneAnchorN(a, cam0) {
  if (a.markerPos) return a.markerPos;
  if (!a.pts || a.pts.length < 3) return a.pts?.[0] || [0.5, 0.5];
  const pts = a.pts.map(cam0.pt);
  const S = cam0.H / 1080, top = 135 * S, bot = cam0.H - 40 * S;
  const c = centroid(pts);
  const x = clamp(c[0], 40 * S, cam0.W - 40 * S);
  const ys = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    if ((p[0] - x) * (q[0] - x) > 0 || p[0] === q[0]) continue;
    ys.push(p[1] + (q[1] - p[1]) * (x - p[0]) / (q[0] - p[0]));
  }
  ys.sort((u, v) => u - v);
  for (let i = 0; i + 1 < ys.length; i += 2) {
    if (ys[i + 1] < top || ys[i] > bot) continue;
    return cam0.inv(x, Math.max(ys[i], top));
  }
  return cam0.inv(x, clamp(c[1], top, bot));
}

function aroundAnchor(a0, w, h, S, gap = 58) {
  const g = gap * S;
  return [
    [a0[0] - w / 2, a0[1] - g - h], [a0[0] - w / 2, a0[1] + g],
    [a0[0] + 40 * S, a0[1] - h / 2], [a0[0] - 40 * S - w, a0[1] - h / 2],
    [a0[0] + 30 * S, a0[1] - g - h], [a0[0] - 30 * S - w, a0[1] - g - h],
    [a0[0] + 30 * S, a0[1] + g], [a0[0] - 30 * S - w, a0[1] + g],
  ];
}

function leader(ctx, from, rect, color, S, alpha) {
  const [x, y, w, h] = rect;
  if (from[0] > x - 4 * S && from[0] < x + w + 4 * S && from[1] > y - 4 * S && from[1] < y + h + 4 * S) return;
  const tx = clamp(from[0], x + 12 * S, x + w - 12 * S);
  const ty = from[1] < y ? y : from[1] > y + h ? y + h : clamp(from[1], y, y + h);
  const toX = from[1] >= y && from[1] <= y + h ? (from[0] < x ? x : x + w) : tx;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 1.6 * S;
  ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 4 * S;
  ctx.beginPath(); ctx.moveTo(from[0], from[1]); ctx.lineTo(toX, ty); ctx.stroke();
  noShadow(ctx);
  ctx.beginPath(); ctx.arc(from[0], from[1], 5 * S, 0, Math.PI * 2);
  ctx.fillStyle = '#fff'; ctx.fill();
  ctx.lineWidth = 2.5 * S; ctx.strokeStyle = color; ctx.stroke();
  ctx.restore();
}

function popIn(ctx, rect, p) {
  const k = lerp(0.92, 1, easeBack(p));
  const cx = rect[0] + rect[2] / 2, cy = rect[1] + rect[3] / 2;
  ctx.translate(cx, cy); ctx.scale(k, k); ctx.translate(-cx, -cy);
}

function glassCard(ctx, x, y, w, h, S, bar) {
  ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 22 * S; ctx.shadowOffsetY = 8 * S;
  rrect(ctx, x, y, w, h, 10 * S);
  ctx.fillStyle = GLASS; ctx.fill();
  noShadow(ctx);
  ctx.lineWidth = 1 * S; ctx.strokeStyle = GLASS_LINE; ctx.stroke();
  if (bar) {
    ctx.save();
    rrect(ctx, x, y, w, h, 10 * S); ctx.clip();
    ctx.fillStyle = bar; ctx.fillRect(x, y, 5 * S, h);
    ctx.restore();
  }
}

// ------------------------------------------------------------------ cinematic labels
function zoneLabel(ctx, a, cam, S, lt, live, tau, P, hits, L) {
  if (a.card === false || !a.pts || a.pts.length < 2) return;
  const zi = zoneInfo(P, a);
  if (!zi.title) return;
  const padX = 16 * S;
  let w, h, draw;
  if (zi.building) {
    const b = zi.building;
    ctx.font = F(700, 21 * S);
    const tw = ctx.measureText(zi.title).width;
    const tagW = zi.critical ? 92 * S : 0;
    ctx.font = F(600, 15 * S);
    const line2 = [zi.stage.name, b.floors].filter(Boolean).join('  ·  ');
    const l2w = ctx.measureText(line2).width + 18 * S;
    w = clamp(Math.max(tw + tagW, l2w, 210 * S) + padX * 2 + 6 * S, 0, 400 * S);
    h = 96 * S;
    draw = (x, y) => {
      glassCard(ctx, x, y, w, h, S, zi.color);
      const ix = x + padX + 6 * S;
      ctx.fillStyle = '#fff'; ctx.font = F(700, 21 * S); ctx.textBaseline = 'alphabetic';
      ctx.fillText(fitText(ctx, zi.title, w - padX * 2 - tagW - 6 * S), ix, y + 33 * S);
      if (zi.critical) {
        const cw = 84 * S, cx = x + w - padX - cw;
        rrect(ctx, cx, y + 15 * S, cw, 22 * S, 11 * S);
        ctx.fillStyle = CRITICAL; ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = F(800, 11 * S); spaced(ctx, 1.2 * S);
        ctx.textAlign = 'center'; ctx.fillText('CRITICAL', cx + cw / 2, y + 30 * S); ctx.textAlign = 'left'; spaced(ctx, 0);
      }
      ctx.beginPath(); ctx.arc(ix + 5 * S, y + 52 * S, 5 * S, 0, Math.PI * 2); ctx.fillStyle = zi.stage.color; ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = F(600, 15 * S);
      ctx.fillText(fitText(ctx, line2, w - padX * 2 - 24 * S), ix + 16 * S, y + 57.5 * S);
      const prog = clamp((+b.progress || 0) / 100);
      const bx = ix, by = y + 72 * S, bw = w - padX * 2 - 62 * S;
      rrect(ctx, bx, by, bw, 7 * S, 3.5 * S); ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fill();
      const pv = prog * easeOut(ramp(lt, 0.6, 0.9));
      if (pv > 0) { rrect(ctx, bx, by, Math.max(7 * S, bw * pv), 7 * S, 3.5 * S); ctx.fillStyle = zi.color; ctx.fill(); }
      ctx.fillStyle = '#fff'; ctx.font = F(800, 16 * S); ctx.textAlign = 'right';
      ctx.fillText(Math.round((+b.progress || 0) * easeOut(ramp(lt, 0.6, 0.9))) + '%', x + w - padX, by + 8 * S);
      ctx.textAlign = 'left';
    };
  } else {
    ctx.font = F(700, 19 * S);
    w = Math.min(ctx.measureText(zi.title).width + padX * 2 + 8 * S, 420 * S);
    h = 42 * S;
    draw = (x, y) => {
      glassCard(ctx, x, y, w, h, S, zi.color);
      ctx.fillStyle = '#fff'; ctx.font = F(700, 19 * S); ctx.textBaseline = 'alphabetic';
      ctx.fillText(fitText(ctx, zi.title, w - padX * 2), x + padX + 6 * S, y + 28 * S);
    };
  }
  const p0 = a.pts.map(L.cam0.pt);
  const bb = bbox(p0);
  const anN = zoneAnchorN(a, L.cam0);
  const an0 = L.cam0.pt(anN);
  const r0 = place(L, [w, h], [
    [an0[0] - w / 2, bb[1] - 30 * S - h], ...aroundAnchor(an0, w, h, S, 40),
    [bb[2] + 30 * S, an0[1] - h / 2], [bb[0] - 30 * S - w, an0[1] - h / 2],
  ], a.labelPos ? L.cam0.pt(a.labelPos) : null);
  const rect = follow(L, cam, r0);
  if (hits) hits.push({ id: a.id, part: 'label', rect });
  const cp = ramp(lt, 0.45, 0.45);
  if (cp <= 0 || live <= 0) return;
  const anchor = cam.pt(anN);
  const al = easeOut(cp) * live;
  leader(ctx, anchor, rect, zi.color, S, al);
  ctx.save();
  ctx.globalAlpha = al;
  popIn(ctx, rect, cp);
  draw(rect[0], rect[1]);
  ctx.restore();
}

function arrowShape(ctx, a, cam, S, lt, live, P) {
  const p = clamp(lt / 0.6);
  if (p <= 0 || live <= 0) return;
  const A = cam.pt(a.a), B = cam.pt(a.b);
  const col = a.color || (isCorporate(P) ? P.info.markerColor : P.info.accent) || '#F5A524';
  const e = easeOut(p);
  const tip = [lerp(A[0], B[0], e), lerp(A[1], B[1], e)];
  const ang = Math.atan2(B[1] - A[1], B[0] - A[0]);
  const hl = 22 * S;
  ctx.save();
  ctx.globalAlpha = live;
  ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 8 * S;
  ctx.strokeStyle = col; ctx.lineWidth = 6 * S; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(A[0], A[1]);
  ctx.lineTo(tip[0] - Math.cos(ang) * hl * 0.6 * Math.min(1, p * 3), tip[1] - Math.sin(ang) * hl * 0.6 * Math.min(1, p * 3));
  ctx.stroke();
  if (p > 0.15) {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(tip[0], tip[1]);
    ctx.lineTo(tip[0] - Math.cos(ang - 0.45) * hl, tip[1] - Math.sin(ang - 0.45) * hl);
    ctx.lineTo(tip[0] - Math.cos(ang + 0.45) * hl, tip[1] - Math.sin(ang + 0.45) * hl);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

function arrowLabel(ctx, a, cam, S, lt, live, P, hits, L) {
  if (!a.text) return;
  const col = a.color || (isCorporate(P) ? P.info.labelColor : P.info.accent) || '#F5A524';
  ctx.font = F(700, 18 * S);
  const w = Math.min(ctx.measureText(a.text).width + 36 * S, 420 * S), h = 40 * S;
  const A0 = L.cam0.pt(a.a), B0 = L.cam0.pt(a.b);
  const dx = A0[0] - B0[0], dy = A0[1] - B0[1], d = Math.hypot(dx, dy) || 1;
  const ux = dx / d, uy = dy / d;
  const cx = A0[0] + ux * (w / 2 + 12 * S), cy = A0[1] + uy * (h / 2 + 12 * S);
  const r0 = place(L, [w, h], [[cx - w / 2, cy - h / 2], ...aroundAnchor(A0, w, h, S, 30)], a.labelPos ? L.cam0.pt(a.labelPos) : null);
  const rect = follow(L, cam, r0);
  if (hits) hits.push({ id: a.id, part: 'label', rect });
  const p = ramp(lt, 0.3, 0.4);
  if (p <= 0 || live <= 0) return;
  ctx.save();
  ctx.globalAlpha = easeOut(p) * live;
  popIn(ctx, rect, p);
  if (isCorporate(P)) corpBox(ctx, rect[0], rect[1], w, h, col, S);
  else glassCard(ctx, rect[0], rect[1], w, h, S, col);
  ctx.fillStyle = '#fff'; ctx.font = F(700, 18 * S);
  ctx.fillText(fitText(ctx, a.text, w - 30 * S), rect[0] + 18 * S, rect[1] + 26.5 * S);
  ctx.restore();
}

function pinShape(ctx, a, cam, S, lt, live, tau, P) {
  const p = clamp(lt / 0.5);
  if (p <= 0 || live <= 0) return;
  const pi = pinInfo(P, a);
  const [x, y] = cam.pt(a.at);
  const r = 17 * S * easeBack(p);
  ctx.save();
  ctx.globalAlpha = live;
  for (const off of [0, 0.5]) {
    const ph = (tau * 0.75 + off) % 1;
    ctx.beginPath(); ctx.arc(x, y, 17 * S + 26 * S * easeOut(ph), 0, Math.PI * 2);
    ctx.strokeStyle = rgba(pi.color, 0.75 * (1 - ph) * clamp(lt / 0.8));
    ctx.lineWidth = 2.5 * S; ctx.stroke();
  }
  ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 10 * S;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = pi.color; ctx.fill();
  noShadow(ctx);
  ctx.lineWidth = 3 * S; ctx.strokeStyle = '#fff'; ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.font = F(800, (pi.badge.length > 2 ? 12 : 14) * S); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(pi.badge, x, y + 0.5 * S);
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.restore();
}

function pinLabel(ctx, a, cam, S, lt, live, tau, P, hits, L) {
  const pi = pinInfo(P, a);
  const over = `${pi.badge !== '!' ? pi.badge + '  ·  ' : ''}${pi.sev.label.toUpperCase()} SEVERITY`;
  ctx.font = F(700, 18 * S);
  const lines = wrap(ctx, pi.title, 300 * S, 2);
  const tw = Math.max(...lines.map(l => ctx.measureText(l).width));
  ctx.font = F(800, 11.5 * S); spaced(ctx, 1.4 * S);
  const ow = ctx.measureText(over).width; spaced(ctx, 0);
  const w = Math.max(tw, ow, 150 * S) + 38 * S;
  const h = (44 + lines.length * 23) * S;
  const a0 = L.cam0.pt(a.at);
  const r0 = place(L, [w, h], [
    [a0[0] + 40 * S, a0[1] - h - 18 * S], [a0[0] - 40 * S - w, a0[1] - h - 18 * S],
    [a0[0] + 40 * S, a0[1] + 26 * S], [a0[0] - 40 * S - w, a0[1] + 26 * S],
  ], a.labelPos ? L.cam0.pt(a.labelPos) : null);
  const rect = follow(L, cam, r0);
  if (hits) hits.push({ id: a.id, part: 'label', rect });
  const cp = ramp(lt, 0.35, 0.45);
  if (cp <= 0 || live <= 0) return;
  const anchor = cam.pt(a.at);
  const al = easeOut(cp) * live;
  leader(ctx, anchor, rect, pi.color, S, al * 0.9);
  ctx.save();
  ctx.globalAlpha = al;
  popIn(ctx, rect, cp);
  glassCard(ctx, rect[0], rect[1], w, h, S, pi.color);
  ctx.fillStyle = pi.color; ctx.font = F(800, 11.5 * S); spaced(ctx, 1.4 * S);
  ctx.fillText(over, rect[0] + 20 * S, rect[1] + 24 * S); spaced(ctx, 0);
  ctx.fillStyle = '#fff'; ctx.font = F(700, 18 * S);
  lines.forEach((l, i) => ctx.fillText(l, rect[0] + 20 * S, rect[1] + (48 + i * 23) * S));
  ctx.restore();
}

function textAnn(ctx, a, cam, S, lt, live, P, hits, L) {
  if (!a.text) return;
  const k = +a.size || 1;
  const corp = isCorporate(P);
  const plain = a.style === 'plain';
  ctx.font = plain ? F(800, 34 * S * k) : F(700, (corp ? 21 : 20) * S * k);
  const w = ctx.measureText(a.text).width + (plain ? 0 : 36 * S * k), h = (plain ? 40 : 44) * S * k;
  const [x, y] = cam.pt(a.at);
  const rect = [x - w / 2, y - h / 2, w, h];
  const c0 = L.cam0.pt(a.at);
  L.placed.push([c0[0] - w / 2, c0[1] - h / 2, w, h]);
  if (hits) hits.push({ id: a.id, part: 'body', rect });
  const p = clamp(lt / 0.5);
  if (p <= 0 || live <= 0) return;
  ctx.save();
  ctx.globalAlpha = easeOut(p) * live;
  if (plain) {
    shadowText(ctx, S, 16);
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(a.text, x, y + (1 - easeOut(p)) * 10 * S);
  } else {
    popIn(ctx, rect, p);
    if (corp) corpBox(ctx, rect[0], rect[1], w, h, a.color || P.info.labelColor, S);
    else glassCard(ctx, rect[0], rect[1], w, h, S, a.color || P.info.accent);
    ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    ctx.fillText(a.text, x, y + 1 * S);
  }
  ctx.restore();
}

// ------------------------------------------------------------------ corporate theme annotations
// Flat brand-coloured label boxes joined to a red marker dot by a dashed leader (the classic client
// deliverable style), with clean staged animation.
function corpBox(ctx, x, y, w, h, fill, S) {
  ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 10 * S; ctx.shadowOffsetY = 3 * S;
  rrect(ctx, x, y, w, h, 3 * S);
  ctx.fillStyle = fill; ctx.fill();
  noShadow(ctx);
  ctx.lineWidth = 1 * S; ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.stroke();
}

function markerDot(ctx, x, y, color, S, p, tau, live, pulse = true) {
  if (p <= 0) return;
  ctx.save();
  ctx.globalAlpha = live;
  if (pulse) {
    const ph = (tau * 0.8) % 1;
    ctx.beginPath(); ctx.arc(x, y, 11 * S + 20 * S * easeOut(ph), 0, Math.PI * 2);
    ctx.strokeStyle = rgba(color, 0.7 * (1 - ph) * clamp(p * 2)); ctx.lineWidth = 2.5 * S; ctx.stroke();
  }
  const r = 11 * S * easeBack(p);
  ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 6 * S;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
  noShadow(ctx);
  ctx.beginPath(); ctx.arc(x, y, r * 0.68, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
  ctx.lineWidth = 1.2 * S; ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

function dashedLeader(ctx, from, to, S, p, alpha) {
  if (p <= 0) return;
  const e = easeOut(p);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.setLineDash([6 * S, 5 * S]);
  ctx.lineWidth = 2.2 * S; ctx.strokeStyle = '#fff';
  ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 4 * S;
  ctx.beginPath(); ctx.moveTo(from[0], from[1]); ctx.lineTo(lerp(from[0], to[0], e), lerp(from[1], to[1], e)); ctx.stroke();
  ctx.restore();
}

// lines: [{ text, size, weight, color }]
function corpLabel(ctx, o) {
  const { cam, S, lt, live, tau, anchorN, fill, lines, hits, id, markerColor, labelPos, L } = o;
  const padX = 18 * S, padY = 10 * S;
  const widths = lines.map(l => { ctx.font = F(l.weight, l.size * S); return ctx.measureText(l.text).width; });
  const w = Math.min(Math.max(...widths) + padX * 2, 520 * S);
  const lh = lines.map(l => l.size * 1.3 * S);
  const h = lh.reduce((a, b) => a + b, 0) + padY * 2 - 2 * S;
  const a0 = L.cam0.pt(anchorN);
  const r0 = place(L, [w, h], aroundAnchor(a0, w, h, S), labelPos ? L.cam0.pt(labelPos) : null);
  const rect = follow(L, cam, r0);
  const [x, y] = rect;
  const anchor = cam.pt(anchorN);
  if (hits) {
    hits.push({ id, part: 'label', rect });
    hits.push({ id, part: 'marker', circle: [anchor[0], anchor[1], 14 * S] });
  }
  if (live <= 0) return;
  const mp = ramp(lt, 0.45, 0.4), lp = ramp(lt, 0.65, 0.35), bp = ramp(lt, 0.85, 0.4);
  let from;
  if (anchor[1] > y + h) from = [clamp(anchor[0], x + 10 * S, x + w - 10 * S), y + h];
  else if (anchor[1] < y) from = [clamp(anchor[0], x + 10 * S, x + w - 10 * S), y];
  else from = [anchor[0] < x ? x : x + w, clamp(anchor[1], y, y + h)];
  if (!(anchor[0] >= x && anchor[0] <= x + w && anchor[1] >= y && anchor[1] <= y + h)) dashedLeader(ctx, anchor, from, S, lp, live);
  markerDot(ctx, anchor[0], anchor[1], markerColor, S, mp, tau, live, true);
  if (bp > 0) {
    ctx.save();
    ctx.globalAlpha = easeOut(bp) * live;
    popIn(ctx, rect, bp);
    corpBox(ctx, x, y, w, h, fill, S);
    let ty = y + padY;
    lines.forEach((l, i) => {
      ctx.font = F(l.weight, l.size * S);
      ctx.fillStyle = l.color || '#fff';
      ctx.textAlign = 'center';
      ctx.fillText(fitText(ctx, l.text, w - padX * 2), x + w / 2, ty + l.size * S * 1.02);
      ty += lh[i];
    });
    ctx.textAlign = 'left';
    ctx.restore();
  }
}

function zoneLabelCorp(ctx, a, cam, S, lt, live, tau, P, hits, L) {
  if (a.card === false || !a.pts || a.pts.length < 2) return;
  const zi = zoneInfo(P, a);
  if (!zi.title) return;
  const lines = [{ text: zi.title, size: 21, weight: 700 }];
  if (zi.building) {
    const b = zi.building;
    const bits = [zi.stage.name, `${Math.round(+b.progress || 0)}%`, b.floors].filter(Boolean);
    lines.push({ text: (zi.critical ? '⚠ CRITICAL  ·  ' : '') + bits.join('  ·  '), size: 15.5, weight: 600, color: 'rgba(255,255,255,0.92)' });
  }
  corpLabel(ctx, {
    cam, S, lt, live, tau, L, anchorN: zoneAnchorN(a, L.cam0), lines, hits, id: a.id, labelPos: a.labelPos,
    fill: zi.critical ? CRITICAL : (a.color || P.info.labelColor),
    markerColor: zi.critical ? CRITICAL : P.info.markerColor,
  });
}

function pinLabelCorp(ctx, a, cam, S, lt, live, tau, P, hits, L) {
  const pi = pinInfo(P, a);
  const over = `${pi.badge !== '!' ? pi.badge + '  ·  ' : ''}${pi.sev.label.toUpperCase()}`;
  corpLabel(ctx, {
    cam, S, lt: lt + 0.3, live, tau, L, anchorN: a.at, hits, id: a.id, labelPos: a.labelPos,
    lines: [{ text: over, size: 12.5, weight: 800, color: 'rgba(255,255,255,0.85)' }, { text: pi.title, size: 19, weight: 700 }],
    fill: pi.color, markerColor: pi.color,
  });
}

export function drawAnnotations(ctx, anns, cam, S, opts) {
  const { P, start = 0, stagger = FX.STAGGER, tau = 99, live = 1, still = false, hits = null } = opts;
  const L = opts.layout || { cam0: cam, W: cam.W, H: cam.H, S, placed: [], avoid: [] };
  L.placed = [];
  const lt = i => (still ? 99 : tau - (start + i * stagger));
  // spotlight: dim everything outside spotlighted zones
  const spots = anns.map((a, i) => [a, i]).filter(([a]) => a.type === 'zone' && a.spotlight && a.pts?.length > 2);
  if (spots.length) {
    const sp = Math.max(...spots.map(([, i]) => ramp(lt(i), 0.2, 0.6))) * live;
    if (sp > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, cam.W, cam.H);
      for (const [a] of spots) {
        const pts = a.pts.map(cam.pt);
        pts.forEach((p, k) => (k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
        ctx.closePath();
      }
      ctx.fillStyle = `rgba(2,6,14,${0.55 * sp})`;
      ctx.fill('evenodd');
      ctx.restore();
    }
  }
  const corp = isCorporate(P);
  const order = { zone: 0, arrow: 1, text: 2, pin: 3 };
  const idx = anns.map((a, i) => i).sort((x, y) => (order[anns[x].type] ?? 9) - (order[anns[y].type] ?? 9));
  for (const i of idx) {
    const a = anns[i];
    if (a.type === 'zone') zoneShape(ctx, a, cam, S, lt(i), live, tau, P);
    else if (a.type === 'arrow') arrowShape(ctx, a, cam, S, lt(i), live, P);
    else if (a.type === 'pin' && !corp) pinShape(ctx, a, cam, S, lt(i), live, tau, P);
  }
  // texts are fixed in place, so register them first; labels then flow around them
  const labelOrder = [...idx.filter(i => anns[i].type === 'text'), ...idx.filter(i => anns[i].type !== 'text')];
  for (const i of labelOrder) {
    const a = anns[i];
    if (a.type === 'text') textAnn(ctx, a, cam, S, lt(i), live, P, hits, L);
    else if (a.type === 'arrow') arrowLabel(ctx, a, cam, S, lt(i), live, P, hits, L);
    else if (a.type === 'zone') (corp ? zoneLabelCorp : zoneLabel)(ctx, a, cam, S, lt(i), live, tau, P, hits, L);
    else if (a.type === 'pin') (corp ? pinLabelCorp : pinLabel)(ctx, a, cam, S, lt(i), live, tau, P, hits, L);
  }
}

// ------------------------------------------------------------------ corporate chrome
// Accent that reads well on dark backgrounds (corporate brand blues are too dark for text).
export function hi(P) {
  return isCorporate(P) ? '#8CCBFF' : P.info.accent;
}

export function darken(hex, k) {
  const h = (hex || '#1F4E9E').replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h.slice(0, 6), 16);
  const f = c => Math.round(c * k);
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

function areaBox(ctx, W, S, P, text, alpha) {
  if (!text || alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.font = F(700, 27 * S);
  const lines = wrap(ctx, text, 340 * S, 2);
  const w = Math.max(...lines.map(l => ctx.measureText(l).width)) + 48 * S;
  const h = lines.length * 34 * S + 20 * S;
  const x = W - 30 * S - w, y = 14 * S;
  corpBox(ctx, x, y, w, h, P.info.accent, S);
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
  lines.forEach((l, i) => ctx.fillText(l, x + w / 2, y + 10 * S + 27 * S + i * 34 * S));
  ctx.restore();
}

function chromeCorp(ctx, W, H, scene, P, o) {
  const S = H / 1080;
  const alpha = o.alpha ?? 1;
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  let x = 34 * S;
  if (o.logo) {
    const [lw, lh] = imgSize(o.logo);
    const hh = 78 * S, ww = Math.min(300 * S, hh * lw / lh);
    ctx.shadowColor = 'rgba(0,0,0,0.25)'; ctx.shadowBlur = 8 * S;
    ctx.drawImage(o.logo, x, 24 * S + (hh - ww * lh / lw) / 2, ww, ww * lh / lw);
    noShadow(ctx);
    x += ww + 44 * S;
  }
  const date = P.info.surveyDate ? fmtDate(P.info.surveyDate, 'dmy') : P.info.surveyLabel;
  if (date) {
    ctx.font = F(700, 25 * S);
    const w = Math.max(230 * S, ctx.measureText(date).width + 64 * S), h = 50 * S;
    corpBox(ctx, x, 38 * S, w, h, P.info.accent, S);
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
    ctx.fillText(date, x + w / 2, 38 * S + 34 * S);
    ctx.textAlign = 'left';
  }
  const ca = o.captionAlpha ?? 1;
  if (scene) areaBox(ctx, W, S, P, scene.caption, ca);
  if (o.areaTitle) areaBox(ctx, W, S, P, o.areaTitle, o.areaTitleAlpha ?? 1);
  ctx.restore();
}

function highlightsLayout(ctx, W, H, S, P, an) {
  const items = (an.highlights || []).filter(h => h && (h.title || h.detail));
  if (!items.length || an.panel === false) return null;
  const pad = 26 * S, x0 = 20 * S, w = Math.min(W * 0.47, 900 * S), iw = w - pad * 2 - 62 * S;
  const rows = items.map(it => {
    ctx.font = F(700, 31 * S);
    const t = it.title ? wrap(ctx, it.title, iw, 2) : [];
    ctx.font = F(500, 23 * S);
    const d = it.detail ? wrap(ctx, it.detail, iw, 2) : [];
    return { t, d, h: t.length * 40 * S + d.length * 31 * S + 14 * S };
  });
  const h = pad + 34 * S + rows.reduce((a, r) => a + r.h, 0) + pad - 6 * S;
  return { pad, x0, w, h, y0: H - 20 * S - h, rows };
}

function highlightsCorp(ctx, W, H, S, P, an, tau, still, live, A0) {
  const G = highlightsLayout(ctx, W, H, S, P, an);
  if (!G) return;
  const { pad, x0, w, h, y0, rows } = G;
  const p = still ? 1 : ramp(tau, A0 - 0.3, 0.55);
  if (p <= 0 || live <= 0) return;
  ctx.save();
  ctx.globalAlpha = easeOut(p) * live;
  const x = x0 - (1 - easeOut(p)) * 50 * S;
  rrect(ctx, x, y0, w, h, 6 * S);
  ctx.fillStyle = rgba(P.info.labelColor, 0.62); ctx.fill();
  ctx.lineWidth = 1 * S; ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.font = F(800, 23 * S); spaced(ctx, 1.2 * S);
  ctx.fillText((P.info.highlightsLabel || 'KEY HIGHLIGHTS').toUpperCase(), x + pad, y0 + pad + 20 * S);
  spaced(ctx, 0);
  let y = y0 + pad + 34 * S;
  rows.forEach((r, i) => {
    const ip = still ? 1 : ramp(tau, A0 + 0.3 + i * 0.7, 0.5);
    if (ip > 0) {
      ctx.save();
      ctx.globalAlpha *= easeOut(ip);
      const dx = (1 - easeOut(ip)) * -24 * S;
      ctx.fillStyle = '#9BD8FF'; ctx.font = F(800, 31 * S);
      ctx.fillText(String(i + 1).padStart(2, '0'), x + pad + dx, y + 32 * S);
      let yy = y;
      ctx.fillStyle = '#fff'; ctx.font = F(700, 31 * S);
      r.t.forEach(l => { ctx.fillText(l, x + pad + 62 * S + dx, yy + 32 * S); yy += 40 * S; });
      ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.font = F(500, 23 * S);
      r.d.forEach(l => { ctx.fillText(l, x + pad + 62 * S + dx, yy + 26 * S); yy += 31 * S; });
      ctx.restore();
    }
    y += r.h;
  });
  ctx.restore();
}

// ------------------------------------------------------------------ chrome (branding overlay)
// Draws the persistent overlay: top/bottom gradients, logo + project name, survey chip and the caption.
// opts: { alpha, captionAlpha, logo }
export function drawChrome(ctx, W, H, scene, P, opts = {}) {
  if (P.settings.chrome === false) return;
  if (isCorporate(P)) return chromeCorp(ctx, W, H, scene, P, opts);
  const S = H / 1080, M = 56 * S;
  const alpha = opts.alpha ?? 1;
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  let g = ctx.createLinearGradient(0, 0, 0, 170 * S);
  g.addColorStop(0, 'rgba(0,0,0,0.50)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, 170 * S);
  g = ctx.createLinearGradient(0, H, 0, H - 300 * S);
  g.addColorStop(0, 'rgba(0,0,0,0.62)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, H - 300 * S, W, 300 * S);

  // top-left: logo + project
  let x = M;
  const logo = opts.logo;
  if (logo) {
    const [lw, lh] = imgSize(logo);
    const hh = 44 * S, ww = Math.min(200 * S, hh * lw / lh);
    ctx.drawImage(logo, x, 42 * S, ww, ww * lh / lw);
    x += ww + 18 * S;
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(x - 9 * S, 46 * S, 1.5 * S, 36 * S);
  }
  shadowText(ctx, S, 10);
  ctx.fillStyle = '#fff'; ctx.font = F(700, 21 * S); ctx.textBaseline = 'alphabetic';
  ctx.fillText(fitText(ctx, P.info.name || '', W * 0.45), x, 60 * S);
  ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.font = F(500, 15 * S);
  ctx.fillText(fitText(ctx, P.info.site || '', W * 0.45), x, 83 * S);
  noShadow(ctx);

  // top-right: survey chip
  const chip = [P.info.surveyLabel, fmtDate(P.info.surveyDate)].filter(Boolean).join('   ·   ').toUpperCase();
  if (chip) {
    ctx.font = F(700, 14 * S); spaced(ctx, 1.6 * S);
    const tw = ctx.measureText(chip).width;
    const cw = tw + 52 * S, ch = 38 * S, cx = W - M - cw, cy = 44 * S;
    rrect(ctx, cx, cy, cw, ch, ch / 2);
    ctx.fillStyle = 'rgba(9,13,22,0.55)'; ctx.fill();
    ctx.lineWidth = 1 * S; ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx + 20 * S, cy + ch / 2, 5 * S, 0, Math.PI * 2); ctx.fillStyle = P.info.accent; ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillText(chip, cx + 34 * S, cy + 24.5 * S);
    spaced(ctx, 0);
  }

  // bottom-left: caption lower third
  const ca = opts.captionAlpha ?? 1;
  if (scene && scene.caption && ca > 0) {
    ctx.globalAlpha = alpha * ca;
    lowerThird(ctx, W, H, S, P, null, scene.caption, scene.sub, 1);
  }
  ctx.restore();
}

function lowerThird(ctx, W, H, S, P, over, title, sub, p) {
  const M = 56 * S, base = H - 66 * S;
  const e = easeOut(p);
  const dx = (1 - e) * -28 * S;
  const lines = (over ? 1 : 0) + 1 + (sub ? 1 : 0);
  const top = base - (over ? 22 : 0) * S - 40 * S - (sub ? 30 : 0) * S;
  ctx.save();
  ctx.fillStyle = P.info.accent;
  const barH = (base - top + 8 * S) * easeOut(clamp(p * 1.6));
  ctx.fillRect(M, base + 8 * S - barH, 6 * S, barH);
  ctx.globalAlpha *= e;
  shadowText(ctx, S, 14);
  let y = top;
  if (over) {
    ctx.fillStyle = P.info.accent; ctx.font = F(800, 15 * S); spaced(ctx, 3 * S);
    ctx.fillText(over, M + 24 * S + dx, y + 14 * S); spaced(ctx, 0);
    y += 22 * S;
  }
  ctx.fillStyle = '#fff'; ctx.font = F(800, (over ? 36 : 40) * S);
  ctx.fillText(fitText(ctx, title, W * 0.6), M + 24 * S + dx, y + 36 * S);
  y += 40 * S;
  if (sub) {
    ctx.fillStyle = 'rgba(255,255,255,0.82)'; ctx.font = F(500, 21 * S);
    ctx.fillText(fitText(ctx, sub, W * 0.6), M + 24 * S + dx, y + 26 * S);
  }
  ctx.restore();
  return lines;
}

// ------------------------------------------------------------------ analysis (freeze frame / photo)
function analysisPanel(ctx, W, H, S, P, an, no, p, live) {
  const zones = an.anns.filter(a => a.type === 'zone' && buildingOf(P, a.building));
  const pins = an.anns.filter(a => a.type === 'pin');
  const notes = (an.highlights || []).filter(h => h && (h.title || h.detail)).map(h => [h.title, h.detail].filter(Boolean).join(' — '));
  if (!zones.length && !pins.length && !notes.length) return;
  const M = 56 * S, pw = 430 * S, px = W - M - pw + (1 - easeOut(p)) * 60 * S, py = 112 * S;
  const maxH = H - py - 140 * S;
  const pad = 26 * S, iw = pw - pad * 2;
  // measure
  const rows = [];
  ctx.font = F(800, 26 * S);
  const tl = wrap(ctx, an.title || 'Site analysis', iw, 2);
  let hgt = pad + 18 * S + tl.length * 32 * S + 18 * S;
  const seen = new Set();
  for (const z of zones) {
    if (seen.has(z.building)) continue;
    seen.add(z.building);
    rows.push({ t: 'zone', z }); hgt += 66 * S;
  }
  if (pins.length) { rows.push({ t: 'head', s: 'CONCERNS' }); hgt += 34 * S; }
  ctx.font = F(600, 16 * S);
  for (const pn of pins) {
    const pi = pinInfo(P, pn);
    const l = wrap(ctx, pi.title, iw - 44 * S, 2);
    rows.push({ t: 'pin', pi, l }); hgt += (12 + l.length * 21) * S;
  }
  if (notes.length) { rows.push({ t: 'head', s: 'OBSERVATIONS' }); hgt += 34 * S; }
  ctx.font = F(500, 16 * S);
  for (const n of notes) {
    const l = wrap(ctx, n, iw - 20 * S, 3);
    rows.push({ t: 'note', l }); hgt += (8 + l.length * 21) * S;
  }
  hgt = Math.min(maxH, hgt + pad);
  ctx.save();
  ctx.globalAlpha = easeOut(p) * live;
  ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 30 * S;
  rrect(ctx, px, py, pw, hgt, 16 * S);
  ctx.fillStyle = 'rgba(8,12,20,0.82)'; ctx.fill();
  noShadow(ctx);
  ctx.strokeStyle = GLASS_LINE; ctx.lineWidth = 1 * S; ctx.stroke();
  ctx.clip();
  let y = py + pad;
  ctx.fillStyle = P.info.accent; ctx.font = F(800, 13 * S); spaced(ctx, 3 * S);
  ctx.fillText(no ? `ANALYSIS ${String(no).padStart(2, '0')}` : 'ANALYSIS', px + pad, y + 12 * S); spaced(ctx, 0);
  y += 18 * S;
  ctx.fillStyle = '#fff'; ctx.font = F(800, 26 * S);
  tl.forEach(l => { y += 32 * S; ctx.fillText(l, px + pad, y - 6 * S); });
  y += 10 * S;
  ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(px + pad, y, iw, 1 * S);
  y += 8 * S;
  for (const r of rows) {
    if (r.t === 'zone') {
      const b = buildingOf(P, r.z.building), st = stageOf(P, b.stage);
      const col = b.critical ? CRITICAL : st.color;
      ctx.beginPath(); ctx.arc(px + pad + 6 * S, y + 22 * S, 6 * S, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = F(700, 18 * S);
      ctx.fillText(fitText(ctx, b.name + (b.critical ? '  ⚠' : ''), iw - 90 * S), px + pad + 22 * S, y + 28 * S);
      ctx.textAlign = 'right'; ctx.fillStyle = col; ctx.font = F(800, 18 * S);
      ctx.fillText(`${Math.round(+b.progress || 0)}%`, px + pad + iw, y + 28 * S);
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(255,255,255,0.65)'; ctx.font = F(500, 14 * S);
      ctx.fillText(fitText(ctx, [st.name, b.floors].filter(Boolean).join('  ·  '), iw - 22 * S), px + pad + 22 * S, y + 48 * S);
      rrect(ctx, px + pad + 22 * S, y + 56 * S, iw - 22 * S, 4 * S, 2 * S); ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fill();
      rrect(ctx, px + pad + 22 * S, y + 56 * S, Math.max(4 * S, (iw - 22 * S) * clamp((+b.progress || 0) / 100) * easeOut(p)), 4 * S, 2 * S);
      ctx.fillStyle = col; ctx.fill();
      y += 66 * S;
    } else if (r.t === 'head') {
      y += 12 * S;
      ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = F(800, 12 * S); spaced(ctx, 2.4 * S);
      ctx.fillText(r.s, px + pad, y + 12 * S); spaced(ctx, 0);
      y += 22 * S;
    } else if (r.t === 'pin') {
      ctx.beginPath(); ctx.arc(px + pad + 12 * S, y + 14 * S, 12 * S, 0, Math.PI * 2); ctx.fillStyle = r.pi.color; ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = F(800, 11 * S); ctx.textAlign = 'center';
      ctx.fillText(r.pi.badge, px + pad + 12 * S, y + 18 * S); ctx.textAlign = 'left';
      ctx.font = F(600, 16 * S); ctx.fillStyle = 'rgba(255,255,255,0.92)';
      r.l.forEach((l, i) => ctx.fillText(l, px + pad + 34 * S, y + (19 + i * 21) * S));
      y += (12 + r.l.length * 21) * S;
    } else if (r.t === 'note') {
      ctx.fillStyle = P.info.accent; ctx.fillRect(px + pad + 2 * S, y + 11 * S, 6 * S, 6 * S);
      ctx.fillStyle = 'rgba(255,255,255,0.88)'; ctx.font = F(500, 16 * S);
      r.l.forEach((l, i) => ctx.fillText(l, px + pad + 20 * S, y + (19 + i * 21) * S));
      y += (8 + r.l.length * 21) * S;
    }
  }
  ctx.restore();
}

function corners(ctx, W, H, S, p, live) {
  const inset = lerp(6, 34, easeOut(p)) * S, L = 44 * S;
  ctx.save();
  ctx.globalAlpha = live * lerp(1, 0.55, ramp(p, 1, 1));
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 3 * S; ctx.lineCap = 'square';
  ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 6 * S;
  for (const [x, y, sx, sy] of [[inset, inset, 1, 1], [W - inset, inset, -1, 1], [inset, H - inset, 1, -1], [W - inset, H - inset, -1, -1]]) {
    ctx.beginPath(); ctx.moveTo(x, y + sy * L); ctx.lineTo(x, y); ctx.lineTo(x + sx * L, y); ctx.stroke();
  }
  ctx.restore();
}

// an: freeze object or photo scene (both have anns/title/highlights/panel/zoom)
// opts: { img, tau, hold, kind, no, scene, P, still: false|'clean'|'full', chromeA, logo, hits }
export function drawAnalysis(ctx, W, H, o) {
  const S = H / 1080;
  const { an, P, kind } = o;
  const still = o.still;
  const tau = still ? 99 : o.tau;
  const hold = o.hold;
  const A0 = kind === 'photo' ? FX.ANN_START_PHOTO : FX.ANN_START_FREEZE;
  ctx.fillStyle = '#05070c'; ctx.fillRect(0, 0, W, H);
  if (!o.img) { placeholder(ctx, W, H, S, 'Loading frame…'); return; }
  const [iw, ih] = imgSize(o.img);
  let zp = 0;
  if (!still) {
    const back = kind === 'freeze' ? FX.ZOOM_BACK : 0;
    const zin = clamp(tau / Math.max(0.5, hold - back));
    const zout = back ? clamp((tau - (hold - back)) / back) : 0;
    zp = easeSine(zin) * (1 - easeInOut(zout));
  }
  const zoom = 1 + ((+an.zoom || 1) - 1) * zp;
  const cam = camera(iw, ih, W, H, zoom, annFocus(an.anns), zp);
  drawCover(ctx, o.img, cam);
  const exitK = still ? 0 : clamp((tau - (hold - FX.EXIT)) / FX.EXIT);
  const live = 1 - easeInOut(exitK);
  const dimIn = still ? 1 : ramp(tau, 0.1, 0.5);
  const corp = isCorporate(P);
  ctx.fillStyle = `rgba(4,8,16,${(corp ? 0.07 : 0.2) * dimIn * live})`;
  ctx.fillRect(0, 0, W, H);
  // keep-out areas for automatic label placement (branding, highlight panel, lower third)
  const L = { cam0: camera(iw, ih, W, H, 1), W, H, S, placed: [], avoid: [] };
  if (still !== 'clean') {
    L.avoid.push([0, 0, W, (corp ? 122 : 110) * S]);
    if (corp) {
      const G = highlightsLayout(ctx, W, H, S, P, an);
      if (G) L.avoid.push([G.x0, G.y0, G.w, G.h]);
    } else {
      L.avoid.push([0, H - 200 * S, W * 0.55, 200 * S]);
      if (an.panel) L.avoid.push([W - 500 * S, 100 * S, 500 * S, H - 230 * S]);
    }
  }
  drawAnnotations(ctx, an.anns, cam, S, { P, start: A0, tau, live, still: !!still, hits: o.hits, layout: L });
  if (still === 'clean') return cam;
  if (corp) {
    // area box cross-fades from the clip caption to this view's own title, then highlights slide in
    const title = an.title && an.title !== o.scene.caption ? an.title : '';
    const capA = !title ? 1 : still ? 0 : kind === 'freeze'
      ? Math.max(1 - ramp(tau, 0.1, 0.4), ramp(tau, hold - 0.55, 0.45)) : 1 - ramp(tau, A0 - 0.7, 0.4);
    const tA = !title ? 0 : still ? 1 : kind === 'freeze'
      ? Math.min(ramp(tau, 0.3, 0.4), 1 - ramp(tau, hold - 0.75, 0.45)) : Math.min(ramp(tau, A0 - 0.4, 0.4), live);
    drawChrome(ctx, W, H, o.scene, P, { alpha: o.chromeA ?? 1, captionAlpha: capA, areaTitle: title, areaTitleAlpha: tA, logo: o.logo });
    highlightsCorp(ctx, W, H, S, P, an, tau, !!still, live, A0);
    return cam;
  }
  if (kind === 'freeze' && !still) {
    corners(ctx, W, H, S, tau / 0.35, live);
    if (tau < 0.4) { ctx.fillStyle = `rgba(255,255,255,${0.55 * (1 - tau / 0.4)})`; ctx.fillRect(0, 0, W, H); }
  }
  // chrome with caption swapped for the analysis title
  const hasTitle = !!(an.title || o.no);
  const capA = !hasTitle ? 1 : still ? 0 : kind === 'freeze'
    ? Math.max(1 - ramp(tau, 0, 0.25), ramp(tau, hold - 0.55, 0.45))
    : Math.max(1 - ramp(tau, A0 - 0.5, 0.4), 0);
  drawChrome(ctx, W, H, o.scene, P, { alpha: o.chromeA ?? 1, captionAlpha: capA, logo: o.logo });
  if (hasTitle) {
    const tp = still ? 1 : ramp(tau, kind === 'freeze' ? 0.25 : A0 - 0.3, 0.6);
    const la = still ? 1 : (kind === 'freeze' ? 1 - ramp(tau, hold - 0.6, 0.45) : live);
    if (tp > 0 && la > 0) {
      ctx.save();
      ctx.globalAlpha = la * (o.chromeA ?? 1);
      lowerThird(ctx, W, H, S, P, o.no ? `ANALYSIS ${String(o.no).padStart(2, '0')}` : 'ANALYSIS', an.title || (o.scene.caption || 'Site analysis'), null, tp);
      ctx.restore();
    }
  }
  if (an.panel) analysisPanel(ctx, W, H, S, P, an, o.no, still ? 1 : ramp(tau, A0 - 0.2, 0.6), live);
  return cam;
}

export function placeholder(ctx, W, H, S, msg) {
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#0d1422'); g.addColorStop(1, '#070a12');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.font = F(600, 24 * S); ctx.textAlign = 'center';
  ctx.fillText(msg, W / 2, H / 2); ctx.textAlign = 'left';
}

// ------------------------------------------------------------------ cards
function cardBackground(ctx, W, H, t, dur, bg, P, sharp = false) {
  const S = H / 1080;
  ctx.fillStyle = '#060a12'; ctx.fillRect(0, 0, W, H);
  if (isCorporate(P) && !sharp) {
    const g0 = ctx.createLinearGradient(0, 0, W, H);
    g0.addColorStop(0, darken(P.info.accent, 0.62)); g0.addColorStop(1, darken(P.info.accent, 0.22));
    ctx.fillStyle = g0; ctx.fillRect(0, 0, W, H);
    if (bg) {
      ctx.save(); ctx.globalAlpha = 0.16;
      drawCover(ctx, bg, camera(...imgSize(bg), W, H, 1.04 + 0.06 * clamp(t / Math.max(1, dur))));
      ctx.restore();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.04)'; ctx.lineWidth = 1 * S;
    ctx.beginPath();
    for (let x = 0; x < W; x += 80 * S) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (let y = 0; y < H; y += 80 * S) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();
    return;
  }
  if (bg) {
    const z = 1.04 + 0.06 * clamp(t / Math.max(1, dur));
    const [iw, ih] = imgSize(bg);
    const cam = camera(iw, ih, W, H, z);
    drawCover(ctx, bg, cam);
  }
  let g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, sharp ? 'rgba(5,9,17,0.45)' : 'rgba(5,9,17,0.80)');
  g.addColorStop(1, sharp ? 'rgba(5,9,17,0.70)' : 'rgba(5,9,17,0.92)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  if (sharp) {
    g = ctx.createLinearGradient(0, 0, W * 0.8, 0);
    g.addColorStop(0, 'rgba(4,8,16,0.92)'); g.addColorStop(0.55, 'rgba(4,8,16,0.55)'); g.addColorStop(1, 'rgba(4,8,16,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  const rg = ctx.createRadialGradient(W * 0.08, H * 0.05, 0, W * 0.08, H * 0.05, W * 0.6);
  rg.addColorStop(0, rgba(P.info.accent, 0.16)); rg.addColorStop(1, rgba(P.info.accent, 0));
  ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
  if (!sharp) {
    ctx.strokeStyle = 'rgba(255,255,255,0.035)'; ctx.lineWidth = 1 * S;
    ctx.beginPath();
    for (let x = 0; x < W; x += 80 * S) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (let y = 0; y < H; y += 80 * S) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();
  }
}

function cardHeader(ctx, W, H, S, P, t, over, title, right) {
  const M = 96 * S;
  const p1 = ramp(t, 0.15, 0.6), p2 = ramp(t, 0.3, 0.7);
  ctx.save();
  ctx.globalAlpha = easeOut(p1);
  ctx.fillStyle = hi(P); ctx.font = F(800, 16 * S); spaced(ctx, 4 * S);
  ctx.fillText(over, M + (1 - easeOut(p1)) * -20 * S, 118 * S); spaced(ctx, 0);
  ctx.globalAlpha = easeOut(p2);
  ctx.fillStyle = '#fff'; ctx.font = F(800, 52 * S);
  ctx.fillText(fitText(ctx, title, W * 0.6), M + (1 - easeOut(p2)) * -20 * S, 176 * S);
  if (right) {
    ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.font = F(600, 18 * S);
    ctx.fillText(right, W - M, 118 * S);
    ctx.fillStyle = '#fff'; ctx.font = F(700, 20 * S);
    ctx.fillText(P.info.name || '', W - M, 176 * S);
    ctx.textAlign = 'left';
  }
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(M, 206 * S, (W - 2 * M) * easeInOut(ramp(t, 0.3, 0.9)), 1.5 * S);
  ctx.restore();
}

function titleCardCorp(ctx, W, H, t, dur, P, R) {
  const S = H / 1080, sc = R.scene;
  cardBackground(ctx, W, H, t, dur, R.cover, P);
  const p = k => easeOut(ramp(t, k, 0.7));
  ctx.save();
  ctx.textAlign = 'center';
  let y = H * 0.40;
  if (R.logo) {
    const [lw, lh] = imgSize(R.logo);
    const hh = 130 * S, ww = Math.min(520 * S, hh * lw / lh), h2 = ww * lh / lw;
    ctx.globalAlpha = p(0.2);
    const k = lerp(0.9, 1, easeBack(ramp(t, 0.2, 0.7)));
    ctx.drawImage(R.logo, W / 2 - ww * k / 2, y - h2 * k - 30 * S, ww * k, h2 * k);
  } else y -= 60 * S;
  ctx.globalAlpha = p(0.5);
  ctx.fillStyle = '#fff'; ctx.font = F(800, 66 * S);
  const lines = wrap(ctx, (sc.title || P.info.name || 'Project').toUpperCase(), W * 0.8, 2);
  lines.forEach((l, i) => ctx.fillText(l, W / 2, y + (70 + i * 76) * S + (1 - p(0.5)) * 20 * S));
  y += (70 + (lines.length - 1) * 76) * S;
  ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  const lw2 = 220 * S * easeInOut(ramp(t, 0.8, 0.7));
  ctx.fillRect(W / 2 - lw2 / 2, y + 34 * S, lw2, 3 * S);
  ctx.globalAlpha = p(1.0);
  ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.font = F(500, 32 * S);
  ctx.fillText(sc.sub || P.info.overline.replace(/\b\w+/g, w => w[0] + w.slice(1).toLowerCase()) || '', W / 2, y + 96 * S);
  ctx.globalAlpha = p(1.3);
  ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.font = F(600, 23 * S);
  ctx.fillText([P.info.site, P.info.surveyLabel, P.info.surveyDate ? fmtDate(P.info.surveyDate, 'dmy') : ''].filter(Boolean).join('   |   '), W / 2, y + 146 * S);
  ctx.globalAlpha = p(1.7);
  ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = F(500, 19 * S);
  ctx.fillText([P.info.client ? 'Client: ' + P.info.client : '', P.info.preparedBy ? 'Prepared by ' + P.info.preparedBy : '', P.info.company].filter(Boolean).join('   ·   '), W / 2, H - 70 * S);
  ctx.restore();
}

function titleCard(ctx, W, H, t, dur, P, R) {
  if (isCorporate(P)) return titleCardCorp(ctx, W, H, t, dur, P, R);
  const S = H / 1080, M = 120 * S;
  cardBackground(ctx, W, H, t, dur, R.cover, P, true);
  const sc = R.scene;
  if (R.logo) {
    const [lw, lh] = imgSize(R.logo);
    const hh = 64 * S, ww = Math.min(260 * S, hh * lw / lh);
    ctx.globalAlpha = easeOut(ramp(t, 0.2, 0.6));
    ctx.drawImage(R.logo, M, 84 * S, ww, ww * lh / lw);
    ctx.globalAlpha = 1;
  }
  const y0 = H * 0.36;
  const p = k => easeOut(ramp(t, k, 0.7));
  ctx.save();
  ctx.globalAlpha = p(0.3);
  ctx.fillStyle = hi(P); ctx.font = F(800, 20 * S); spaced(ctx, 6 * S);
  ctx.fillText((sc.title ? P.info.overline : P.info.overline || 'DRONE PROGRESS REPORT').toUpperCase(), M + (1 - p(0.3)) * -24 * S, y0);
  spaced(ctx, 0);
  ctx.globalAlpha = p(0.5);
  ctx.fillStyle = '#fff'; ctx.font = F(800, 92 * S);
  shadowText(ctx, S, 24);
  const lines = wrap(ctx, sc.title || P.info.name || 'Project', W * 0.7, 2);
  lines.forEach((l, i) => ctx.fillText(l, M, y0 + (96 + i * 100) * S + (1 - p(0.5)) * 30 * S));
  noShadow(ctx);
  let y = y0 + (96 + (lines.length - 1) * 100) * S;
  ctx.globalAlpha = 1;
  ctx.fillStyle = hi(P);
  ctx.fillRect(M, y + 34 * S, 140 * S * easeInOut(ramp(t, 0.9, 0.7)), 6 * S);
  ctx.globalAlpha = p(1.1);
  ctx.fillStyle = 'rgba(255,255,255,0.88)'; ctx.font = F(500, 32 * S);
  ctx.fillText(fitText(ctx, sc.sub || P.info.site || '', W * 0.7), M, y + 98 * S);
  // meta chips
  const chips = [P.info.surveyLabel, fmtDate(P.info.surveyDate), P.info.client ? 'Client: ' + P.info.client : ''].filter(Boolean);
  let cx = M;
  ctx.font = F(700, 19 * S);
  chips.forEach((c, i) => {
    const a = p(1.4 + i * 0.15);
    const w = ctx.measureText(c).width + 40 * S;
    ctx.globalAlpha = a;
    rrect(ctx, cx, y + 136 * S + (1 - a) * 16 * S, w, 46 * S, 23 * S);
    ctx.fillStyle = i === 0 ? hi(P) : 'rgba(255,255,255,0.10)'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 1 * S; if (i) ctx.stroke();
    ctx.fillStyle = i === 0 ? '#111' : '#fff';
    ctx.fillText(c, cx + 20 * S, y + 166 * S + (1 - a) * 16 * S);
    cx += w + 14 * S;
  });
  ctx.globalAlpha = p(1.9);
  ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.font = F(500, 19 * S);
  const by = [P.info.preparedBy ? 'Prepared by ' + P.info.preparedBy : '', P.info.company].filter(Boolean).join('   ·   ');
  ctx.fillText(by, M, H - 80 * S);
  ctx.restore();
}

function summaryCard(ctx, W, H, t, dur, P, R, seg) {
  const S = H / 1080, M = 96 * S;
  cardBackground(ctx, W, H, t, dur, R.cardBg, P);
  const pg = seg.pages > 1 ? `   ${seg.page}/${seg.pages}` : '';
  cardHeader(ctx, W, H, S, P, t, 'BUILDING STATUS' + pg, R.scene.title || 'Building Status Summary', fmtDate(P.info.surveyDate));
  const all = P.buildings;
  // donut
  const cx = M + 190 * S, cy = 470 * S, r = 150 * S;
  const avg = overallProgress(P);
  const pv = easeInOut(ramp(t, 0.6, 1.6));
  ctx.save();
  ctx.globalAlpha = easeOut(ramp(t, 0.4, 0.5));
  ctx.lineWidth = 26 * S; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.stroke();
  if (avg > 0) {
    const grad = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    grad.addColorStop(0, hi(P)); grad.addColorStop(1, '#22C55E');
    ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (avg / 100) * pv);
    ctx.strokeStyle = grad; ctx.stroke();
  }
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff'; ctx.font = F(800, 76 * S);
  ctx.fillText(Math.round(avg * pv) + '%', cx, cy + 18 * S);
  ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.font = F(700, 14 * S); spaced(ctx, 3 * S);
  ctx.fillText('OVERALL PROGRESS', cx, cy + 52 * S); spaced(ctx, 0);
  ctx.textAlign = 'left';
  // stage legend with counts
  let ly = cy + r + 70 * S;
  const counts = P.stages.map(s => [s, all.filter(b => b.stage === s.id).length]).filter(([, n]) => n);
  const crit = all.filter(b => b.critical).length;
  counts.forEach(([s, n], i) => {
    const a = easeOut(ramp(t, 0.9 + i * 0.08, 0.4));
    ctx.globalAlpha = a;
    ctx.beginPath(); ctx.arc(M + 10 * S, ly - 6 * S, 7 * S, 0, Math.PI * 2); ctx.fillStyle = s.color; ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = F(600, 19 * S);
    ctx.fillText(s.name, M + 30 * S, ly);
    ctx.fillStyle = '#fff'; ctx.font = F(800, 19 * S); ctx.textAlign = 'right';
    ctx.fillText(String(n), M + 380 * S, ly); ctx.textAlign = 'left';
    ly += 34 * S;
  });
  if (crit) {
    ctx.globalAlpha = easeOut(ramp(t, 1.4, 0.4));
    rrect(ctx, M, ly - 4 * S, 380 * S, 44 * S, 10 * S);
    ctx.fillStyle = rgba(CRITICAL, 0.18); ctx.fill();
    ctx.strokeStyle = rgba(CRITICAL, 0.6); ctx.lineWidth = 1.5 * S; ctx.stroke();
    ctx.fillStyle = '#FF6B61'; ctx.font = F(800, 18 * S);
    ctx.fillText(`⚠  ${crit} critical building${crit > 1 ? 's' : ''}`, M + 16 * S, ly + 25 * S);
  }
  ctx.restore();
  // rows
  const list = seg.items || [];
  const x0 = M + 500 * S, x1 = W - M, top = 262 * S;
  const rh = Math.min(96 * S, (H - top - 90 * S) / Math.max(1, list.length));
  if (!list.length) {
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = F(600, 24 * S);
    ctx.fillText('Add buildings in the Buildings tab to fill this dashboard.', x0, top + 60 * S);
  }
  list.forEach((b, i) => {
    const a = ramp(t, 0.5 + i * 0.12, 0.5);
    if (a <= 0) return;
    const st = stageOf(P, b.stage);
    const col = b.critical ? CRITICAL : st.color;
    const y = top + i * rh, hh = rh - 12 * S;
    ctx.save();
    ctx.globalAlpha = easeOut(a);
    ctx.translate((1 - easeOut(a)) * 40 * S, 0);
    rrect(ctx, x0, y, x1 - x0, hh, 12 * S);
    ctx.fillStyle = b.critical ? rgba(CRITICAL, 0.14) : 'rgba(255,255,255,0.05)'; ctx.fill();
    ctx.strokeStyle = b.critical ? rgba(CRITICAL, 0.55) : 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1 * S; ctx.stroke();
    ctx.fillStyle = col; ctx.fillRect(x0, y + 10 * S, 5 * S, hh - 20 * S);
    const mid = y + hh / 2;
    const big = hh > 60 * S;
    ctx.fillStyle = '#fff'; ctx.font = F(800, (big ? 24 : 20) * S);
    ctx.fillText(fitText(ctx, b.name, 300 * S), x0 + 28 * S, big ? mid - 4 * S : mid + 7 * S);
    if (big) {
      ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.font = F(500, 16 * S);
      ctx.fillText(fitText(ctx, b.floors || b.remarks || '', 300 * S), x0 + 28 * S, mid + 22 * S);
    }
    // stage pill
    ctx.font = F(800, 14 * S); spaced(ctx, 1 * S);
    const label = (b.critical ? '⚠ ' : '') + st.name.toUpperCase();
    const pw = ctx.measureText(label).width + 28 * S;
    const px = x0 + 360 * S;
    rrect(ctx, px, mid - 17 * S, pw, 34 * S, 17 * S);
    ctx.fillStyle = rgba(col, 0.22); ctx.fill();
    ctx.strokeStyle = rgba(col, 0.7); ctx.stroke();
    ctx.fillStyle = col; ctx.fillText(label, px + 14 * S, mid + 5.5 * S); spaced(ctx, 0);
    // progress
    const bx = x0 + 600 * S, bw = x1 - bx - 120 * S;
    const prog = clamp((+b.progress || 0) / 100) * easeInOut(ramp(t, 0.8 + i * 0.12, 1.0));
    rrect(ctx, bx, mid - 6 * S, bw, 12 * S, 6 * S); ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fill();
    if (prog > 0) { rrect(ctx, bx, mid - 6 * S, Math.max(12 * S, bw * prog), 12 * S, 6 * S); ctx.fillStyle = col; ctx.fill(); }
    ctx.fillStyle = '#fff'; ctx.font = F(800, 26 * S); ctx.textAlign = 'right';
    ctx.fillText(Math.round(prog * 100) + '%', x1 - 24 * S, mid + 9 * S);
    ctx.textAlign = 'left';
    ctx.restore();
  });
}

function concernsCard(ctx, W, H, t, dur, P, R, seg) {
  const S = H / 1080, M = 96 * S;
  cardBackground(ctx, W, H, t, dur, R.cardBg, P);
  const pg = seg.pages > 1 ? `   ${seg.page}/${seg.pages}` : '';
  const counts = ['high', 'medium', 'low'].map(k => [k, P.concerns.filter(c => c.severity === k).length]).filter(([, n]) => n);
  cardHeader(ctx, W, H, S, P, t, 'ATTENTION REQUIRED' + pg, R.scene.title || 'Key Concerns',
    counts.map(([k, n]) => `${n} ${SEVERITY[k].label}`).join('   ·   '));
  const list = seg.items || [];
  if (!list.length) {
    ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.font = F(600, 28 * S);
    ctx.fillText('No open concerns this survey. ✓', M, 320 * S);
    return;
  }
  const cols = list.length > 3 ? 2 : 1;
  const rows = Math.ceil(list.length / cols);
  const gap = 24 * S, top = 250 * S;
  const cw = (W - 2 * M - gap * (cols - 1)) / cols;
  const ch = Math.min(230 * S, (H - top - 80 * S - gap * (rows - 1)) / rows);
  list.forEach((c, i) => {
    const a = ramp(t, 0.5 + i * 0.15, 0.5);
    if (a <= 0) return;
    const sev = SEVERITY[c.severity] || SEVERITY.high;
    const col = i % cols, row = Math.floor(i / cols);
    const x = M + col * (cw + gap), y = top + row * (ch + gap);
    ctx.save();
    ctx.globalAlpha = easeOut(a);
    ctx.translate(0, (1 - easeOut(a)) * 30 * S);
    rrect(ctx, x, y, cw, ch, 16 * S);
    ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fill();
    ctx.strokeStyle = rgba(sev.color, 0.45); ctx.lineWidth = 1.2 * S; ctx.stroke();
    ctx.save(); rrect(ctx, x, y, cw, ch, 16 * S); ctx.clip();
    ctx.fillStyle = sev.color; ctx.fillRect(x, y, 6 * S, ch); ctx.restore();
    const no = P.concerns.indexOf(c) + 1;
    ctx.beginPath(); ctx.arc(x + 48 * S, y + 46 * S, 22 * S, 0, Math.PI * 2); ctx.fillStyle = sev.color; ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = F(800, 16 * S); ctx.textAlign = 'center';
    ctx.fillText('C' + no, x + 48 * S, y + 52 * S); ctx.textAlign = 'left';
    ctx.font = F(800, 13 * S); spaced(ctx, 1.6 * S);
    const sl = sev.label.toUpperCase();
    const sw = ctx.measureText(sl).width + 24 * S;
    rrect(ctx, x + cw - 24 * S - sw, y + 30 * S, sw, 30 * S, 15 * S);
    ctx.fillStyle = rgba(sev.color, 0.2); ctx.fill();
    ctx.fillStyle = sev.color; ctx.fillText(sl, x + cw - 12 * S - sw, y + 50 * S); spaced(ctx, 0);
    const tx = x + 88 * S, tw = cw - 88 * S - sw - 40 * S;
    ctx.fillStyle = '#fff'; ctx.font = F(800, 24 * S);
    const tl = wrap(ctx, c.title, tw, 1);
    ctx.fillText(tl[0] || '', tx, y + 46 * S);
    const b = buildingOf(P, c.building);
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.font = F(600, 15 * S);
    ctx.fillText(fitText(ctx, [b ? b.name : 'General', c.owner, c.due ? 'Target ' + fmtDate(c.due, 'dm') : ''].filter(Boolean).join('   ·   '), cw - 120 * S), tx, y + 72 * S);
    const room = ch - 100 * S;
    let yy = y + 106 * S;
    ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.font = F(500, 18 * S);
    const dl = wrap(ctx, c.detail, cw - 64 * S, Math.max(1, Math.floor((room - (c.action ? 34 * S : 0)) / (25 * S))));
    if (c.detail) dl.forEach(l => { ctx.fillText(l, x + 32 * S, yy); yy += 25 * S; });
    if (c.action && yy < y + ch - 16 * S) {
      ctx.fillStyle = hi(P); ctx.font = F(700, 17 * S);
      ctx.fillText(fitText(ctx, '→  ' + c.action, cw - 64 * S), x + 32 * S, Math.min(yy + 8 * S, y + ch - 20 * S));
    }
    ctx.restore();
  });
}

function milestonesCard(ctx, W, H, t, dur, P, R, seg) {
  const S = H / 1080, M = 96 * S;
  cardBackground(ctx, W, H, t, dur, R.cardBg, P);
  const pg = seg.pages > 1 ? `   ${seg.page}/${seg.pages}` : '';
  const done = P.milestones.filter(m => m.status === 'done').length;
  cardHeader(ctx, W, H, S, P, t, 'TIMELINE' + pg, R.scene.title || 'Milestones', `${done} of ${P.milestones.length} achieved`);
  const list = seg.items || [];
  if (!list.length) {
    ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.font = F(600, 28 * S);
    ctx.fillText('Add milestones in the Milestones tab.', M, 320 * S);
    return;
  }
  const n = list.length;
  const colW = Math.min(300 * S, n > 1 ? (W - 2 * M) / n - 24 * S : 500 * S);
  const y = 560 * S, x0 = M + colW / 2, x1 = W - M - colW / 2;
  const step = n > 1 ? (x1 - x0) / (n - 1) : 0;
  const xs = list.map((m, i) => (n > 1 ? x0 + i * step : W / 2));
  const lp = easeInOut(ramp(t, 0.4, 1.2));
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.lineWidth = 6 * S;
  ctx.beginPath(); ctx.moveTo(x0 - 40 * S, y); ctx.lineTo(lerp(x0 - 40 * S, x1 + 40 * S, lp), y); ctx.stroke();
  let lastDone = -1;
  list.forEach((m, i) => { if (m.status === 'done') lastDone = i; });
  if (lastDone >= 0) {
    ctx.strokeStyle = hi(P);
    ctx.beginPath(); ctx.moveTo(x0 - 40 * S, y); ctx.lineTo(lerp(x0 - 40 * S, xs[lastDone], easeInOut(ramp(t, 0.8, 1.0))), y); ctx.stroke();
  }
  list.forEach((m, i) => {
    const a = ramp(t, 0.7 + i * 0.18, 0.5);
    if (a <= 0) return;
    const st = MILESTONE_STATUS[m.status] || MILESTONE_STATUS.ontrack;
    const x = xs[i];
    ctx.save();
    ctx.globalAlpha = easeOut(a);
    ctx.beginPath(); ctx.arc(x, y, 24 * S * easeBack(a), 0, Math.PI * 2); ctx.fillStyle = rgba(st.color, 0.25); ctx.fill();
    ctx.beginPath(); ctx.arc(x, y, 14 * S * easeBack(a), 0, Math.PI * 2); ctx.fillStyle = st.color; ctx.fill();
    ctx.lineWidth = 3 * S; ctx.strokeStyle = '#fff'; ctx.stroke();
    if (m.status === 'done') {
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 3 * S;
      ctx.beginPath(); ctx.moveTo(x - 6 * S, y); ctx.lineTo(x - 1.5 * S, y + 5 * S); ctx.lineTo(x + 7 * S, y - 5 * S); ctx.stroke();
    }
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff'; ctx.font = F(800, 26 * S);
    ctx.fillText(m.date ? fmtDate(m.date, 'dm') : '—', x, y - 92 * S + (1 - easeOut(a)) * 14 * S);
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.font = F(600, 16 * S);
    ctx.fillText(m.date ? String(new Date(m.date).getFullYear() || '') : '', x, y - 64 * S);
    ctx.fillStyle = '#fff'; ctx.font = F(700, 21 * S);
    const tl = wrap(ctx, m.title, colW, 3);
    tl.forEach((l, k) => ctx.fillText(l, x, y + (70 + k * 27) * S + (1 - easeOut(a)) * 14 * S));
    let yy = y + (70 + tl.length * 27 + 8) * S;
    const b = buildingOf(P, m.building);
    if (b) { ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.font = F(500, 16 * S); ctx.fillText(fitText(ctx, b.name, colW), x, yy); yy += 30 * S; }
    ctx.font = F(800, 13 * S); spaced(ctx, 1.4 * S);
    const sl = st.label.toUpperCase();
    const sw = ctx.measureText(sl).width + 26 * S;
    rrect(ctx, x - sw / 2, yy - 4 * S, sw, 30 * S, 15 * S);
    ctx.fillStyle = rgba(st.color, 0.22); ctx.fill();
    ctx.fillStyle = st.color; ctx.fillText(sl, x, yy + 16 * S); spaced(ctx, 0);
    if (m.note) {
      ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.font = F(500, 15 * S);
      wrap(ctx, m.note, colW, 2).forEach((l, k) => ctx.fillText(l, x, yy + (52 + k * 20) * S));
    }
    ctx.textAlign = 'left';
    ctx.restore();
  });
  // legend
  let lx = M;
  ctx.font = F(600, 16 * S);
  ctx.globalAlpha = easeOut(ramp(t, 1.4, 0.5));
  for (const st of Object.values(MILESTONE_STATUS)) {
    ctx.beginPath(); ctx.arc(lx + 8 * S, H - 84 * S, 7 * S, 0, Math.PI * 2); ctx.fillStyle = st.color; ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillText(st.label, lx + 24 * S, H - 78 * S);
    lx += ctx.measureText(st.label).width + 64 * S;
  }
  ctx.globalAlpha = 1;
}

function endCard(ctx, W, H, t, dur, P, R) {
  const S = H / 1080;
  cardBackground(ctx, W, H, t, dur, R.cardBg, P);
  const sc = R.scene;
  const p = k => easeOut(ramp(t, k, 0.7));
  ctx.save();
  ctx.textAlign = 'center';
  let y = H * 0.42;
  if (R.logo) {
    const [lw, lh] = imgSize(R.logo);
    const hh = 80 * S, ww = Math.min(320 * S, hh * lw / lh);
    ctx.globalAlpha = p(0.2);
    ctx.drawImage(R.logo, W / 2 - ww / 2, y - 190 * S, ww, ww * lh / lw);
  }
  ctx.globalAlpha = p(0.35);
  ctx.fillStyle = '#fff'; ctx.font = F(800, 104 * S);
  ctx.fillText(sc.title || 'Thank You', W / 2, y + (1 - p(0.35)) * 24 * S);
  ctx.fillStyle = hi(P);
  const lw2 = 160 * S * easeInOut(ramp(t, 0.6, 0.6));
  ctx.fillRect(W / 2 - lw2 / 2, y + 40 * S, lw2, 6 * S);
  ctx.globalAlpha = p(0.8);
  ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = F(500, 30 * S);
  ctx.fillText(sc.sub || [P.info.name, P.info.company].filter(Boolean).join('   ·   '), W / 2, y + 110 * S);
  if (P.info.nextSurvey) {
    ctx.globalAlpha = p(1.1);
    ctx.font = F(700, 20 * S);
    const txt = 'NEXT SURVEY  ·  ' + P.info.nextSurvey.toUpperCase();
    spaced(ctx, 2 * S);
    const w = ctx.measureText(txt).width + 48 * S;
    rrect(ctx, W / 2 - w / 2, y + 160 * S, w, 50 * S, 25 * S);
    ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1 * S; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.fillText(txt, W / 2, y + 192 * S); spaced(ctx, 0);
  }
  if (P.info.preparedBy) {
    ctx.globalAlpha = p(1.3);
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.font = F(500, 19 * S);
    ctx.fillText('Prepared by ' + P.info.preparedBy, W / 2, H - 80 * S);
  }
  ctx.restore();
}

function compareScene(ctx, W, H, t, dur, P, R, seg, still) {
  const S = H / 1080, sc = R.scene;
  ctx.fillStyle = '#05070c'; ctx.fillRect(0, 0, W, H);
  const A = R.imgA, B = R.imgB;
  if (!A || !B) { placeholder(ctx, W, H, S, 'Pick “before” and “after” images in the inspector'); return; }
  const z = still ? 1 : 1 + 0.04 * clamp(t / dur);
  const camA = camera(...imgSize(A), W, H, z), camB = camera(...imgSize(B), W, H, z);
  let k;
  if (still) k = 0.5;
  else {
    const intro = easeInOut(ramp(t, 0.6, 1.8));
    k = lerp(0.97, 0.5, intro);
    const sway = ramp(t, 2.4, 0.6) * (1 - ramp(t, dur - 1.6, 0.8));
    k += Math.sin((t - 2.4) * Math.PI * 2 / 4.5) * 0.17 * sway;
  }
  const x = W * k;
  drawCover(ctx, B, camB);
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, x, H); ctx.clip(); drawCover(ctx, A, camA); ctx.restore();
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 12 * S;
  ctx.fillStyle = '#fff'; ctx.fillRect(x - 1.5 * S, 0, 3 * S, H);
  ctx.beginPath(); ctx.arc(x, H / 2, 30 * S, 0, Math.PI * 2); ctx.fill();
  noShadow(ctx);
  ctx.fillStyle = '#111'; ctx.beginPath();
  ctx.moveTo(x - 6 * S, H / 2 - 10 * S); ctx.lineTo(x - 16 * S, H / 2); ctx.lineTo(x - 6 * S, H / 2 + 10 * S);
  ctx.moveTo(x + 6 * S, H / 2 - 10 * S); ctx.lineTo(x + 16 * S, H / 2); ctx.lineTo(x + 6 * S, H / 2 + 10 * S);
  ctx.fill();
  ctx.restore();
  const chip = (txt, cx, right, fill) => {
    ctx.font = F(800, 18 * S); spaced(ctx, 2.4 * S);
    const w = ctx.measureText(txt).width + 40 * S, hh = 44 * S;
    const xx = right ? cx - w : cx;
    const cy = (isCorporate(P) ? 150 : 128) * S;
    rrect(ctx, xx, cy, w, hh, hh / 2);
    ctx.fillStyle = fill; ctx.fill();
    ctx.fillStyle = fill === hi(P) ? '#0B1220' : '#fff';
    ctx.fillText(txt, xx + 20 * S, cy + 29 * S); spaced(ctx, 0);
  };
  const la = still ? 1 : easeOut(ramp(t, 1.0, 0.5));
  ctx.save();
  ctx.globalAlpha = la;
  ctx.beginPath(); ctx.rect(0, 0, x, H); ctx.clip();
  chip((sc.a.label || 'Before').toUpperCase(), 56 * S, false, 'rgba(9,13,22,0.78)');
  ctx.restore();
  ctx.save();
  ctx.globalAlpha = la;
  ctx.beginPath(); ctx.rect(x, 0, W - x, H); ctx.clip();
  chip((sc.b.label || 'After').toUpperCase(), W - 56 * S, true, hi(P));
  ctx.restore();
}

// ------------------------------------------------------------------ segment dispatcher
// R: { P, img(seg) -> bitmap, cover, cardBg, logo, imgA, imgB, video, still, hits, transitions }
export function drawSegment(ctx, W, H, seg, lt, R) {
  const P = R.P, sc = seg.scene;
  const S = H / 1080;
  const chromeA = chromeAlpha(seg, lt);
  const RR = Object.assign({}, R, { scene: sc });
  ctx.save();
  switch (seg.kind) {
    case 'clip': {
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
      const v = R.video;
      if (v && v.readyState >= 2) drawCover(ctx, v, camera(v.videoWidth, v.videoHeight, W, H));
      else placeholder(ctx, W, H, S, 'Loading video…');
      drawChrome(ctx, W, H, sc, P, { alpha: chromeA, logo: R.logo });
      break;
    }
    case 'freeze':
      drawAnalysis(ctx, W, H, { an: seg.freeze, P, kind: 'freeze', img: R.bg, tau: lt, hold: seg.dur, no: seg.no, scene: sc, still: R.still, chromeA, logo: R.logo, hits: R.hits });
      break;
    case 'photo':
      drawAnalysis(ctx, W, H, { an: sc, P, kind: 'photo', img: R.bg, tau: lt, hold: seg.dur, no: seg.no, scene: sc, still: R.still, chromeA, logo: R.logo, hits: R.hits });
      break;
    case 'compare':
      compareScene(ctx, W, H, lt, seg.dur, P, RR, seg, R.still);
      drawChrome(ctx, W, H, sc, P, { alpha: chromeA, logo: R.logo });
      break;
    case 'title': titleCard(ctx, W, H, lt, seg.dur, P, RR); break;
    case 'summary': summaryCard(ctx, W, H, lt, seg.dur, P, RR, seg); break;
    case 'concerns': concernsCard(ctx, W, H, lt, seg.dur, P, RR, seg); break;
    case 'milestones': milestonesCard(ctx, W, H, lt, seg.dur, P, RR, seg); break;
    case 'end': endCard(ctx, W, H, lt, seg.dur, P, RR); break;
    default: placeholder(ctx, W, H, S, seg.kind);
  }
  ctx.restore();
  const d = R.still ? 0 : dipAlpha(seg, lt, P.settings.transitions !== false);
  if (d > 0) { ctx.fillStyle = `rgba(0,0,0,${d})`; ctx.fillRect(0, 0, W, H); }
}
