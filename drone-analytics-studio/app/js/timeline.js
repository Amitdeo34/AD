// Turns the storyboard into a flat list of render segments (shared by preview, export and PPTX).
import { chunk } from './util.js';

// Timing constants. CH_* and DIP must match engine/render.py.
export const FX = {
  DIP: 0.35,
  CH_IN_START: 0.2, CH_IN_DUR: 0.6, CH_OUT_DUR: 0.5, CH_OUT_END: 0.1,
  ANN_START_FREEZE: 0.8, ANN_START_PHOTO: 1.1, STAGGER: 0.5, EXIT: 0.7, ZOOM_BACK: 0.9, TAIL: 2.4,
};

export const PAGE = { summary: 8, concerns: 6, milestones: 6 };

export function minHold(an, kind) {
  const n = (an.anns || []).length;
  const hl = (an.highlights || []).filter(h => h && (h.title || h.detail)).length;
  const a0 = kind === 'photo' ? FX.ANN_START_PHOTO : FX.ANN_START_FREEZE;
  const annEnd = a0 + Math.max(0, n - 1) * FX.STAGGER + 1.3;
  const hlEnd = hl && an.panel !== false ? a0 + 0.3 + (hl - 1) * 0.7 + 0.5 : 0;
  return Math.max(annEnd, hlEnd) + FX.TAIL + FX.EXIT;
}

export function holdOf(an, kind) {
  const want = kind === 'photo' ? (+an.dur || 8) : (+an.hold || 7);
  const busy = (an.anns || []).length || (an.highlights || []).length;
  return Math.max(want, busy ? minHold(an, kind) : 2);
}

export function buildTimeline(p, fps = 30) {
  const q = d => Math.max(1, Math.round(d * fps)) / fps;
  const segs = [];
  const sceneStart = {};
  let t = 0, no = 0;
  p.scenes.forEach((sc, si) => {
    const parts = [];
    if (sc.type === 'clip') {
      const inT = +sc.in || 0, outT = Math.max(inT + 0.1, +sc.out || 0);
      const fr = (sc.freezes || []).filter(f => f.t >= inT - 1e-6 && f.t <= outT + 1e-6).sort((a, b) => a.t - b.t);
      let cur = inT;
      for (const f of fr) {
        if (f.t - cur >= 0.1) parts.push({ type: 'video', kind: 'clip', srcIn: cur, dur: q(f.t - cur) });
        parts.push({ type: 'frames', kind: 'freeze', freeze: f, dur: q(holdOf(f, 'freeze')), no: ++no });
        cur = f.t;
      }
      if (outT - cur >= 0.1 || !parts.length) parts.push({ type: 'video', kind: 'clip', srcIn: cur, dur: q(Math.max(0.1, outT - cur)) });
    } else if (sc.type === 'photo') {
      const has = (sc.anns || []).length || sc.title;
      parts.push({ type: 'frames', kind: 'photo', dur: q(holdOf(sc, 'photo')), no: has ? ++no : 0 });
    } else if (PAGE[sc.type]) {
      const list = sc.type === 'summary' ? p.buildings : sc.type === 'concerns' ? p.concerns
        : [...p.milestones].sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));
      const pages = chunk(list, PAGE[sc.type]);
      pages.forEach((items, i) => parts.push({ type: 'frames', kind: sc.type, items, page: i + 1, pages: pages.length, dur: q(+sc.dur || 8) }));
    } else {
      parts.push({ type: 'frames', kind: sc.type, dur: q(+sc.dur || 5) });
    }
    parts[0].first = true;
    parts[parts.length - 1].last = true;
    sceneStart[sc.id] = t;
    for (const pt of parts) {
      pt.scene = sc; pt.si = si; pt.start = t; pt.idx = segs.length;
      t += pt.dur;
      segs.push(pt);
    }
  });
  return { segs, total: t, sceneStart };
}

export function segmentAt(tl, T) {
  const { segs } = tl;
  if (!segs.length) return null;
  let lo = 0, hi = segs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (segs[mid].start <= T) lo = mid; else hi = mid - 1;
  }
  return segs[lo];
}

// Opacity of the on-screen branding ("chrome") inside a segment; mirrors the ffmpeg alpha fades.
export function chromeAlpha(seg, lt) {
  let a = 1;
  if (seg.first) a = Math.min(a, Math.max(0, Math.min(1, (lt - FX.CH_IN_START) / FX.CH_IN_DUR)));
  if (seg.last) a = Math.min(a, Math.max(0, Math.min(1, (seg.dur - FX.CH_OUT_END - lt) / FX.CH_OUT_DUR)));
  return a;
}

// Fade-to-black between scenes; mirrors ffmpeg's fade filter.
export function dipAlpha(seg, lt, on = true) {
  if (!on) return 0;
  let a = 0;
  if (seg.first) a = Math.max(a, 1 - Math.min(1, lt / FX.DIP));
  if (seg.last) a = Math.max(a, 1 - Math.min(1, (seg.dur - lt) / FX.DIP));
  return Math.max(0, a);
}
