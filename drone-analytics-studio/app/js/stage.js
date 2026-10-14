// The centre stage: media viewer, clip trimmer, analysis (annotation) editor, card preview and the
// full storyboard player. One canvas, drawn by the same renderer used for export.
import { app, on, touch, scene, analysis, annotation, mediaItem, select } from './state.js';
import { api } from './api.js';
import { h, clamp, fmtTime, uid, toast, deepClone } from './util.js';
import { drawSegment, drawAnalysis, drawChrome, camera, drawCover, centroid, placeholder, zoneAnchorN } from './render.js';
import { buildTimeline, segmentAt, holdOf } from './timeline.js';
import { frameKey, logoKey, resolveAssets, segmentKeys } from './assets.js';
import { newFreeze, newScene, SCENE_TYPES } from './model.js';

const TOOLS = [
  ['select', '↖', 'Select / move', 'V'],
  ['zone', '⬠', 'Area / building outline (click points, double-click to finish)', 'P'],
  ['rect', '▭', 'Rectangle area', 'R'],
  ['arrow', '➚', 'Arrow', 'A'],
  ['pin', '◉', 'Concern marker', 'C'],
  ['text', 'T', 'Text label', 'T'],
];

function pointInPoly(pt, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function distSeg(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1));
  return [Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy), t];
}
const clampN = q => [clamp(q[0], -0.05, 1.05), clamp(q[1], -0.05, 1.05)];
const add = (q, d) => [q[0] + d[0], q[1] + d[1]];

export class Stage {
  constructor() {
    this.canvas = document.getElementById('stage');
    this.ctx = this.canvas.getContext('2d');
    this.wrap = document.getElementById('stage-wrap');
    this.toolbarEl = document.getElementById('stage-toolbar');
    this.transportEl = document.getElementById('transport');
    this.videos = new Map();
    this.videoBox = h('div.hidden-videos');
    document.body.appendChild(this.videoBox);
    this.mode = 'empty';
    this.dirty = true;
    this.anim = { playing: false, active: false, t: 0, dur: 1, loop: true };
    this.last = 0;
    this.hits = [];
    this.cam = null;
    this.draft = null;
    this.drag = null;
    this.player = new Player(this);
    new ResizeObserver(() => this.resize()).observe(this.wrap);
    this.resize();
    this.bindPointer();
    on('assets', () => { this.dirty = true; });
    requestAnimationFrame(t => this.loop(t));
  }

  // ------------------------------------------------------------------ layout & loop
  resize() {
    const r = this.wrap.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const w = Math.min(r.width - 16, (r.height - 16) * 16 / 9), hh = w * 9 / 16;
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = hh + 'px';
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const pw = Math.min(1920, Math.round(w * dpr));
    this.canvas.width = pw;
    this.canvas.height = Math.round(pw * 9 / 16);
    this.dirty = true;
  }

  get W() { return this.canvas.width; }
  get H() { return this.canvas.height; }

  loop(now) {
    requestAnimationFrame(t => this.loop(t));
    const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 0;
    this.last = now;
    if (this.mode === 'preview') { this.player.tick(dt); return; }
    if (this.anim.playing) {
      this.anim.t += dt;
      if (this.anim.t >= this.anim.dur) {
        if (this.anim.loop) this.anim.t = 0;
        else if (this.mode === 'analysis') {
          // back to the editable final state once the preview has played
          this.anim.playing = false; this.anim.active = false; this.anim.t = this.anim.dur;
          this.buildToolbar(); this.buildTransport();
        } else { this.anim.t = this.anim.dur; this.anim.playing = false; }
      }
      this.dirty = true;
      this.updateTransport();
    }
    if (this.video && !this.video.paused) {
      this.dirty = true;
      this.updateTransport();
      if (this.mode === 'clip') {
        const s = scene();
        if (s && this.video.currentTime >= s.out) { this.video.pause(); this.video.currentTime = s.out; }
      }
    }
    if (this.dirty) { this.dirty = false; this.draw(); }
  }

  // ------------------------------------------------------------------ media elements
  videoFor(path) {
    const it = mediaItem(path);
    const v = it?.proxy?.state === 'ready' ? 'p' : 'o';
    const key = path + '|' + v;
    let el = this.videos.get(key);
    if (!el) {
      el = h('video', { muted: true, playsInline: true, preload: 'auto' });
      el.muted = true;
      el.src = api.fileUrl(app.pid, path, true, v);
      for (const ev of ['loadeddata', 'seeked', 'canplay']) el.addEventListener(ev, () => { this.dirty = true; this.updateTransport(); });
      el.addEventListener('error', () => {
        if (!el._warned) { el._warned = true; toast(`Browser cannot play ${path} directly — creating a preview proxy…`, 'warn', 5000); api.proxy(app.pid, path).catch(() => {}); }
      });
      this.videoBox.appendChild(el);
      this.videos.set(key, el);
    }
    return el;
  }

  fps(path) { return mediaItem(path)?.fps || 30; }
  snap(path, t) { const f = this.fps(path); return Math.max(0, Math.floor(t * f + 1e-3) / f); }
  seek(t, path = this.videoPath) {
    if (!this.video) return;
    const f = this.fps(path);
    this.video.currentTime = Math.max(0, this.snap(path, t) + 0.3 / f);
    this.dirty = true;
  }
  current() { return this.video ? this.snap(this.videoPath, this.video.currentTime) : 0; }

  pauseAll() { for (const v of this.videos.values()) if (!v.paused) v.pause(); }

  // ------------------------------------------------------------------ mode switching
  show() {
    this.pauseAll();
    this.anim = { playing: false, active: false, t: 0, dur: 1, loop: true };
    this.draft = null;
    this.drag = null;
    this.video = null;
    this.videoPath = null;
    const P = app.P;
    if (!P) { this.mode = 'empty'; this.render(); return; }
    if (this.mode === 'preview') this.player.stop(false);
    const s = scene();
    if (app.view?.media) {
      this.mode = 'media';
      const it = mediaItem(app.view.media);
      if (it?.kind === 'video') { this.videoPath = it.path; this.video = this.videoFor(it.path); }
      else if (it) app.assets.load(frameKey(it.path, 0));
    } else if (!s) this.mode = 'empty';
    else if (s.type === 'clip' && !app.sel.freeze) {
      this.mode = 'clip';
      if (s.path) {
        this.videoPath = s.path;
        this.video = this.videoFor(s.path);
        const ct = this.video.currentTime;
        if (!(ct >= s.in && ct <= s.out)) this.seek(s.in);
      }
    } else if (s.type === 'clip' || s.type === 'photo') {
      this.mode = 'analysis';
      const A = analysis();
      if (A) app.assets.ensure([frameKey(A.path, A.t), logoKey(P.info.logo)]);
      this.anim.dur = A ? holdOf(A.an, A.kind) : 1;
    } else {
      this.mode = 'card';
      const seg = this.sceneSeg(s);
      if (seg) {
        app.assets.ensure(segmentKeys(P, seg));
        this.anim.dur = seg.dur;
        this.anim.t = Math.min(seg.dur * 0.6, 4);
        this.anim.active = true;
      }
    }
    this.render();
  }

  render() {
    this.buildToolbar();
    this.buildTransport();
    this.dirty = true;
  }

  sceneSeg(s) {
    const tl = buildTimeline(app.P, app.P.settings.fps);
    return tl.segs.find(g => g.scene.id === s.id) || null;
  }

  analysisNo(an) {
    const tl = buildTimeline(app.P, app.P.settings.fps);
    const g = tl.segs.find(x => (x.kind === 'freeze' && x.freeze.id === an.id) || (x.kind === 'photo' && x.scene.id === an.id));
    return g ? g.no : 0;
  }

  // ------------------------------------------------------------------ drawing
  draw() {
    const { ctx } = this;
    const W = this.W, H = this.H, P = app.P;
    const S = H / 1080;
    ctx.clearRect(0, 0, W, H);
    this.hits = [];
    if (!P) return;
    if (this.mode === 'empty') {
      placeholder(ctx, W, H, S, P.scenes.some(s => s.type === 'clip' || s.type === 'photo')
        ? 'Select a scene in the storyboard below' : 'Add drone clips or photos from the Media panel (left)');
      return;
    }
    const logo = app.assets.get(logoKey(P.info.logo));
    if (this.mode === 'media') {
      ctx.fillStyle = '#05070c'; ctx.fillRect(0, 0, W, H);
      const it = mediaItem(app.view.media);
      const src = this.video && this.video.readyState >= 2 ? this.video : (it && app.assets.get(frameKey(it.path, 0)));
      if (src) {
        const iw = src.videoWidth || src.width, ih = src.videoHeight || src.height;
        const s = Math.min(W / iw, H / ih);
        ctx.drawImage(src, (W - iw * s) / 2, (H - ih * s) / 2, iw * s, ih * s);
      } else placeholder(ctx, W, H, S, 'Loading…');
      return;
    }
    if (this.mode === 'clip') {
      const s = scene();
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
      if (!s.path) { placeholder(ctx, W, H, S, 'Pick a video for this clip in the inspector →'); return; }
      const v = this.video;
      if (v && v.readyState >= 2) drawCover(ctx, v, camera(v.videoWidth, v.videoHeight, W, H));
      else placeholder(ctx, W, H, S, 'Loading video…');
      drawChrome(ctx, W, H, s, P, { alpha: 1, logo });
      return;
    }
    if (this.mode === 'card') {
      const seg = this.sceneSeg(scene());
      if (!seg) return;
      drawSegment(ctx, W, H, seg, this.anim.t, resolveAssets(P, seg, app.assets, W, H));
      return;
    }
    if (this.mode === 'analysis') {
      const A = analysis();
      if (!A) return;
      if (!A.path) { placeholder(ctx, W, H, S, 'Pick a photo for this scene in the inspector →'); return; }
      const img = app.assets.get(frameKey(A.path, A.t));
      const o = {
        an: A.an, P, kind: A.kind, img, hold: holdOf(A.an, A.kind), no: this.analysisNo(A.an), scene: A.scene,
        chromeA: 1, logo,
      };
      if (this.anim.active) {
        drawAnalysis(ctx, W, H, Object.assign(o, { tau: this.anim.t, still: false }));
        return;
      }
      this.cam = drawAnalysis(ctx, W, H, Object.assign(o, { tau: 0, still: 'full', hits: this.hits })) || null;
      if (this.cam) this.drawOverlay();
    }
  }

  drawOverlay() {
    const { ctx, cam } = this;
    const k = this.W / this.canvas.clientWidth;
    const a = annotation();
    ctx.save();
    if (a) {
      ctx.strokeStyle = '#fff';
      ctx.setLineDash([5 * k, 4 * k]);
      ctx.lineWidth = 1.5 * k;
      if (a.type === 'zone') {
        const pts = a.pts.map(cam.pt);
        ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(...p) : ctx.moveTo(...p))); ctx.closePath(); ctx.stroke();
        ctx.setLineDash([]);
        pts.forEach(p => this.handle(p, k));
      } else if (a.type === 'arrow') {
        ctx.setLineDash([]);
        this.handle(cam.pt(a.a), k); this.handle(cam.pt(a.b), k);
      } else if (a.at) {
        const p = cam.pt(a.at);
        ctx.beginPath(); ctx.arc(p[0], p[1], 24 * k, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.setLineDash([3 * k, 3 * k]);
      for (const ht of this.hits) if (ht.id === a.id && ht.rect) ctx.strokeRect(ht.rect[0] - 3 * k, ht.rect[1] - 3 * k, ht.rect[2] + 6 * k, ht.rect[3] + 6 * k);
    }
    const d = this.draft;
    if (d) {
      ctx.setLineDash([]);
      ctx.strokeStyle = '#FFD24D'; ctx.fillStyle = 'rgba(255,210,77,0.15)'; ctx.lineWidth = 2 * k;
      if (d.type === 'zone' && d.pts.length) {
        const pts = d.pts.map(cam.pt);
        ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(...p) : ctx.moveTo(...p)));
        if (d.hover) ctx.lineTo(...cam.pt(d.hover));
        ctx.stroke();
        pts.forEach((p, i) => {
          ctx.beginPath(); ctx.arc(p[0], p[1], (i === 0 && pts.length > 2 ? 7 : 4) * k, 0, Math.PI * 2);
          ctx.fillStyle = i === 0 ? '#FFD24D' : '#fff'; ctx.fill();
        });
      } else if (d.type === 'rect' && d.b) {
        const p = cam.pt(d.a), q = cam.pt(d.b);
        ctx.fillRect(p[0], p[1], q[0] - p[0], q[1] - p[1]); ctx.strokeRect(p[0], p[1], q[0] - p[0], q[1] - p[1]);
      } else if (d.type === 'arrow' && d.b) {
        const p = cam.pt(d.a), q = cam.pt(d.b);
        ctx.beginPath(); ctx.moveTo(...p); ctx.lineTo(...q); ctx.stroke();
      }
    }
    ctx.restore();
  }

  handle(p, k) {
    const { ctx } = this;
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#111'; ctx.lineWidth = 1.5 * k;
    ctx.fillRect(p[0] - 5 * k, p[1] - 5 * k, 10 * k, 10 * k);
    ctx.strokeRect(p[0] - 5 * k, p[1] - 5 * k, 10 * k, 10 * k);
  }

  // ------------------------------------------------------------------ toolbar & transport
  buildToolbar() {
    const T = this.toolbarEl;
    T.innerHTML = '';
    const s = scene();
    if (this.mode === 'analysis') {
      for (const [id, icon, tip, key] of TOOLS) {
        T.appendChild(h('button.tool' + (app.tool === id ? '.on' : ''), { title: `${tip}  (${key})`, onclick: () => this.setTool(id) },
          h('span.ico', icon), h('span.lbl', { 'data-tool': id }, tip.split(' (')[0].split(' /')[0])));
      }
      T.appendChild(h('div.sep'));
      T.appendChild(h('button.tool' + (this.anim.active ? '.on' : ''), { onclick: () => this.toggleAnim(), title: 'Play the analysis animation (Space)' }, h('span.ico', this.anim.active ? '■' : '▶'), h('span.lbl', this.anim.active ? 'Stop' : 'Play animation')));
      if (s?.type === 'clip') T.appendChild(h('button.tool', { onclick: () => select(s.id), title: 'Back to the clip timeline' }, h('span.ico', '⤺'), h('span.lbl', 'Back to clip')));
      T.appendChild(h('div.tool-hint', this.hint()));
    } else if (this.mode === 'clip') {
      T.appendChild(h('div.tool-hint', 'Scrub to the moment you want to analyse, then press ◆ Add analysis (F). Space = play, ←/→ = frame step, I / O = set in / out.'));
    } else if (this.mode === 'media') {
      T.appendChild(h('div.tool-hint', `Viewing ${app.view.media}`));
    } else if (this.mode === 'card') {
      T.appendChild(h('div.tool-hint', `${SCENE_TYPES[s.type]?.label || s.type} — edit the content in the inspector and in the left panels; this preview updates live.`));
    } else if (this.mode === 'preview') {
      T.appendChild(h('div.tool-hint', 'Preview of the full video (uses light proxies; the export uses the original footage). Esc to exit.'));
    }
  }

  hint() {
    const t = app.tool;
    if (this.draft?.type === 'zone') return 'Click to add corners · click the first point / double-click / Enter to finish · Backspace removes last · Esc cancels';
    return {
      select: 'Click to select · drag shapes, corners, labels or red markers · double-click an outline to add a corner · Del to delete',
      zone: 'Click around the building / area to outline it',
      rect: 'Drag to draw a rectangular area',
      arrow: 'Drag from the label position to the point of interest',
      pin: 'Click on the exact spot of the concern',
      text: 'Click where the text should go',
    }[t] || '';
  }

  setTool(t) {
    app.tool = t;
    this.draft = null;
    this.anim.active = false; this.anim.playing = false;
    this.buildToolbar();
    this.canvas.style.cursor = t === 'select' ? 'default' : 'crosshair';
    this.dirty = true;
  }

  toggleAnim() {
    if (this.anim.active) { this.anim.active = false; this.anim.playing = false; }
    else { this.anim.active = true; this.anim.playing = true; this.anim.t = 0; this.anim.loop = false; }
    this.buildToolbar(); this.buildTransport(); this.dirty = true;
  }

  buildTransport() {
    const T = this.transportEl;
    T.innerHTML = '';
    this.tp = {};
    const mk = (cls, label, title, fn) => h('button.' + cls, { title, onclick: fn }, label);
    if ((this.mode === 'clip' || this.mode === 'media') && this.video) {
      const s = scene();
      const path = this.videoPath;
      const dur = mediaItem(path)?.duration || this.video.duration || 0;
      this.tp.play = mk('tp-btn', '▶', 'Play / pause (Space)', () => this.togglePlay());
      this.tp.time = h('span.tp-time', '00:00.00');
      const row = h('div.tp-row', this.tp.play,
        mk('tp-btn', '⏮', 'Previous frame (←)', () => this.step(-1)),
        mk('tp-btn', '⏭', 'Next frame (→)', () => this.step(1)),
        this.tp.time, h('span.tp-dur', ' / ' + fmtTime(dur)), h('div.grow'));
      if (this.mode === 'clip') {
        row.append(
          mk('btn', '⟦ Set IN', 'Clip starts here (I)', () => this.setIn()),
          mk('btn', 'Set OUT ⟧', 'Clip ends here (O)', () => this.setOut()),
          mk('btn.primary', '◆ Add analysis here', 'Freeze this frame and annotate it (F)', () => this.addFreeze()),
          mk('btn', '📷 Save frame', 'Save this frame at full original resolution to the exports folder (S)', () => this.snapshot()));
      } else {
        row.append(
          mk('btn.primary', '＋ Add clip to storyboard', 'Add this video as a clip scene', () => this.addClipFromMedia(path)),
          mk('btn', '🖼 Use frame as cover', 'Background of title & dashboard cards', () => { app.P.info.cover = { path, t: this.current() }; touch('all'); toast('Cover image set'); }),
          mk('btn', '📷 Save frame', 'Save this frame at full original resolution (S)', () => this.snapshot()));
      }
      T.appendChild(row);
      T.appendChild(this.scrubber(dur, path, s));
      this.updateTransport();
    } else if (this.mode === 'media') {
      const it = mediaItem(app.view.media);
      if (!it) return;
      const row = h('div.tp-row', h('span.tp-time', `${it.width || '?'}×${it.height || '?'}`), h('div.grow'));
      if (it.kind === 'image') {
        row.append(
          mk('btn.primary', '＋ Add photo analysis', 'Annotate this photo', () => this.addPhotoFromMedia(it.path)),
          mk('btn', '🖼 Use as cover', 'Background of title & dashboard cards', () => { app.P.info.cover = { path: it.path, t: 0 }; touch('all'); toast('Cover image set'); }),
          mk('btn', '🏷 Use as logo', 'Shown in the corner of every frame', () => { app.P.info.logo = it.path; touch('all'); toast('Logo set'); }));
      }
      T.appendChild(row);
    } else if (this.mode === 'analysis' || this.mode === 'card') {
      this.tp.play = mk('tp-btn', this.anim.playing ? '❚❚' : '▶', 'Play / pause animation (Space)', () => {
        if (!this.anim.active) { this.toggleAnim(); return; }
        this.anim.playing = !this.anim.playing; this.anim.loop = this.mode === 'card';
        if (this.anim.playing && this.anim.t >= this.anim.dur - 0.01) this.anim.t = 0;
        this.updateTransport();
      });
      this.tp.time = h('span.tp-time', '');
      const row = h('div.tp-row', this.tp.play, this.tp.time, h('span.tp-dur', ' / ' + fmtTime(this.anim.dur)), h('div.grow'));
      if (this.mode === 'analysis') row.append(h('span.tp-note', this.anim.active ? 'Animation preview' : 'Editing (final state shown) — press ▶ to watch the animation'));
      T.appendChild(row);
      const bar = h('div.scrub.simple');
      this.tp.head = h('div.playhead');
      bar.appendChild(this.tp.head);
      const seekTo = e => {
        const r = bar.getBoundingClientRect();
        this.anim.active = true; this.anim.playing = false;
        this.anim.t = clamp((e.clientX - r.left) / r.width) * this.anim.dur;
        this.dirty = true; this.updateTransport();
      };
      bar.addEventListener('pointerdown', e => { bar.setPointerCapture(e.pointerId); seekTo(e); bar.onpointermove = seekTo; });
      bar.addEventListener('pointerup', () => { bar.onpointermove = null; this.buildToolbar(); });
      T.appendChild(bar);
      this.updateTransport();
    } else if (this.mode === 'preview') {
      this.player.buildTransport(T);
    }
  }

  scrubber(dur, path, s) {
    const bar = h('div.scrub');
    const strip = h('div.filmstrip');
    const n = 12;
    for (let i = 0; i < n; i++) {
      strip.appendChild(h('img', { src: api.thumbUrl(app.pid, path, ((i + 0.5) * dur) / n, 160), loading: 'lazy', draggable: false }));
    }
    bar.appendChild(strip);
    if (s && this.mode === 'clip' && dur) {
      bar.appendChild(h('div.shade', { style: { left: 0, width: (s.in / dur) * 100 + '%' } }));
      bar.appendChild(h('div.shade', { style: { left: (s.out / dur) * 100 + '%', right: 0 } }));
      bar.appendChild(h('div.inout', { style: { left: (s.in / dur) * 100 + '%', width: ((s.out - s.in) / dur) * 100 + '%' } }));
      for (const f of s.freezes) {
        bar.appendChild(h('div.fmark', {
          style: { left: (f.t / dur) * 100 + '%' }, title: `${f.title || 'Analysis'} @ ${fmtTime(f.t)} — click to edit`,
          onpointerdown: e => { e.stopPropagation(); select(s.id, f.id); },
        }, '◆'));
      }
    }
    this.tp.head = h('div.playhead');
    bar.appendChild(this.tp.head);
    this.tp.dur = dur;
    const seekTo = e => {
      const r = bar.getBoundingClientRect();
      this.seek(clamp((e.clientX - r.left) / r.width) * dur);
      this.updateTransport();
    };
    bar.addEventListener('pointerdown', e => { this.video?.pause(); bar.setPointerCapture(e.pointerId); seekTo(e); bar.onpointermove = seekTo; });
    bar.addEventListener('pointerup', () => { bar.onpointermove = null; });
    return bar;
  }

  updateTransport() {
    const tp = this.tp || {};
    if (this.mode === 'preview') { this.player.updateTransport(); return; }
    if (this.video && (this.mode === 'clip' || this.mode === 'media')) {
      const t = this.video.currentTime;
      if (tp.time) tp.time.textContent = fmtTime(this.current());
      if (tp.play) tp.play.textContent = this.video.paused ? '▶' : '❚❚';
      if (tp.head && tp.dur) tp.head.style.left = clamp(t / tp.dur) * 100 + '%';
    } else if (tp.head) {
      tp.head.style.left = clamp(this.anim.t / this.anim.dur) * 100 + '%';
      if (tp.time) tp.time.textContent = fmtTime(this.anim.active ? this.anim.t : this.anim.dur);
      if (tp.play) tp.play.textContent = this.anim.playing ? '❚❚' : '▶';
    }
  }

  // ------------------------------------------------------------------ clip actions
  togglePlay() {
    const v = this.video;
    if (!v) return;
    if (v.paused) {
      const s = scene();
      if (this.mode === 'clip' && s && (v.currentTime >= s.out - 0.05 || v.currentTime < s.in)) this.seek(s.in);
      v.play().catch(() => {});
    } else v.pause();
    this.updateTransport();
  }
  step(n) {
    if (!this.video) return;
    this.video.pause();
    this.seek(this.current() + n / this.fps(this.videoPath));
    this.updateTransport();
  }
  setIn() {
    const s = scene();
    s.in = Math.min(this.current(), s.out - 0.2);
    touch('all');
  }
  setOut() {
    const s = scene();
    s.out = Math.max(this.current(), s.in + 0.2);
    touch('all');
  }
  addFreeze() {
    const s = scene();
    if (!s || !s.path) return;
    this.video?.pause();
    const t = this.current();
    if (t < s.in || t > s.out) { toast('Move inside the clip range (between IN and OUT) first', 'warn'); return; }
    if (s.freezes.some(f => Math.abs(f.t - t) < 0.05)) { toast('There is already an analysis at this frame', 'warn'); return; }
    const f = newFreeze(t);
    f.title = s.caption || '';
    s.freezes.push(f);
    s.freezes.sort((a, b) => a.t - b.t);
    app.tool = 'zone';
    select(s.id, f.id);
    touch('all');
    toast('Frame frozen. Outline buildings/areas with the Area tool, then add highlights in the inspector.', 'ok', 5000);
  }
  async snapshot() {
    if (!this.videoPath) return;
    try {
      const r = await api.snapshot(app.pid, this.videoPath, this.current());
      toast('Saved full-resolution frame: ' + r.file.split(/[\\/]/).pop(), 'ok');
    } catch (e) { toast('Could not save frame: ' + e.message, 'err'); }
  }
  addClipFromMedia(path) {
    const it = mediaItem(path);
    const sc = newScene('clip', { path, in: 0, out: +(it?.duration || 10).toFixed(3), caption: '' });
    insertBeforeCards(sc);
    select(sc.id);
    touch('all');
  }
  addPhotoFromMedia(path) {
    const sc = newScene('photo', { path });
    insertBeforeCards(sc);
    app.tool = 'zone';
    select(sc.id);
    touch('all');
  }

  // ------------------------------------------------------------------ pointer editing
  toCanvas(e) {
    const r = this.canvas.getBoundingClientRect();
    return [(e.clientX - r.left) * this.W / r.width, (e.clientY - r.top) * this.H / r.height];
  }

  bindPointer() {
    const c = this.canvas;
    c.addEventListener('pointerdown', e => this.onDown(e));
    c.addEventListener('pointermove', e => this.onMove(e));
    c.addEventListener('pointerup', e => this.onUp(e));
    c.addEventListener('dblclick', e => this.onDbl(e));
  }

  editable() { return this.mode === 'analysis' && !this.anim.active && this.cam; }

  hitTest(p) {
    const A = analysis();
    const cam = this.cam;
    const k = this.W / this.canvas.clientWidth;
    const tol = 9 * k;
    const sel = annotation();
    if (sel) {
      if (sel.type === 'zone') {
        for (let i = 0; i < sel.pts.length; i++) {
          const q = cam.pt(sel.pts[i]);
          if (Math.hypot(q[0] - p[0], q[1] - p[1]) < tol) return { ann: sel, part: 'vertex', i };
        }
      }
      if (sel.type === 'arrow') {
        for (const end of ['a', 'b']) {
          const q = cam.pt(sel[end]);
          if (Math.hypot(q[0] - p[0], q[1] - p[1]) < tol) return { ann: sel, part: 'end', end };
        }
      }
    }
    for (let i = this.hits.length - 1; i >= 0; i--) {
      const ht = this.hits[i];
      const ann = A.an.anns.find(a => a.id === ht.id);
      if (!ann) continue;
      if (ht.circle && Math.hypot(ht.circle[0] - p[0], ht.circle[1] - p[1]) < Math.max(ht.circle[2], tol)) return { ann, part: 'marker', at: [ht.circle[0], ht.circle[1]] };
      if (ht.rect && p[0] >= ht.rect[0] && p[0] <= ht.rect[0] + ht.rect[2] && p[1] >= ht.rect[1] && p[1] <= ht.rect[1] + ht.rect[3]) {
        return { ann, part: ht.part, rect: ht.rect };
      }
    }
    const anns = A.an.anns;
    for (let i = anns.length - 1; i >= 0; i--) {
      const a = anns[i];
      if (a.type === 'pin' && Math.hypot(...[0, 1].map(j => cam.pt(a.at)[j] - p[j])) < 22 * k) return { ann: a, part: 'body' };
      if (a.type === 'arrow' && distSeg(p, cam.pt(a.a), cam.pt(a.b))[0] < tol) return { ann: a, part: 'body' };
    }
    for (let i = anns.length - 1; i >= 0; i--) {
      const a = anns[i];
      if (a.type === 'zone' && a.pts.length > 2 && pointInPoly(p, a.pts.map(cam.pt))) return { ann: a, part: 'body' };
    }
    return null;
  }

  onDown(e) {
    if (!this.editable()) return;
    const p = this.toCanvas(e);
    const n = this.cam.inv(...p);
    const A = analysis();
    const tool = app.tool;
    this.canvas.setPointerCapture(e.pointerId);
    if (tool === 'zone') {
      if (!this.draft) this.draft = { type: 'zone', pts: [n], hover: n };
      else {
        const first = this.cam.pt(this.draft.pts[0]);
        const k = this.W / this.canvas.clientWidth;
        if (this.draft.pts.length > 2 && Math.hypot(first[0] - p[0], first[1] - p[1]) < 12 * k) { this.finishZone(); return; }
        this.draft.pts.push(n);
      }
      this.buildToolbar();
      this.dirty = true;
      return;
    }
    if (tool === 'rect' || tool === 'arrow') { this.draft = { type: tool, a: n, b: null }; return; }
    if (tool === 'pin') {
      this.addAnn({ id: uid('a'), type: 'pin', at: n, concern: null, text: 'Concern', severity: 'high', labelPos: null });
      return;
    }
    if (tool === 'text') {
      this.addAnn({ id: uid('a'), type: 'text', at: n, text: 'Label', size: 1, style: 'box', color: null });
      return;
    }
    // select tool
    const hit = this.hitTest(p);
    if (!hit) { if (app.sel.ann) { app.sel.ann = null; touch('insp'); } this.dirty = true; return; }
    if (app.sel.ann !== hit.ann.id) { app.sel.ann = hit.ann.id; touch('insp'); }
    const a = hit.ann;
    const start = { p, n, orig: deepClone(a) };
    if (hit.part === 'label' && hit.rect) start.centerN = this.cam.inv(hit.rect[0] + hit.rect[2] / 2, hit.rect[1] + hit.rect[3] / 2);
    if (hit.part === 'marker') start.anchorN = a.type === 'zone' ? zoneAnchorN(a, this.cam) : a.at;
    this.drag = Object.assign(hit, start, { moved: false });
    this.dirty = true;
  }

  onMove(e) {
    if (!this.editable()) return;
    const p = this.toCanvas(e);
    const n = this.cam.inv(...p);
    if (this.draft) {
      if (this.draft.type === 'zone') this.draft.hover = n;
      else if (e.buttons) this.draft.b = n;
      this.dirty = true;
      return;
    }
    const d = this.drag;
    if (!d) {
      if (app.tool === 'select') {
        const hit = this.hitTest(p);
        this.canvas.style.cursor = !hit ? 'default' : hit.part === 'vertex' || hit.part === 'end' ? 'crosshair' : 'move';
      }
      return;
    }
    const k = this.W / this.canvas.clientWidth;
    if (!d.moved && Math.hypot(p[0] - d.p[0], p[1] - d.p[1]) < 3 * k) return;
    d.moved = true;
    const dn = [n[0] - d.n[0], n[1] - d.n[1]];
    const a = d.ann, o = d.orig;
    if (d.part === 'vertex') a.pts[d.i] = clampN(add(o.pts[d.i], dn));
    else if (d.part === 'end') a[d.end] = clampN(add(o[d.end], dn));
    else if (d.part === 'label' && d.centerN) a.labelPos = add(d.centerN, dn);
    else if (d.part === 'marker') {
      if (a.type === 'zone') a.markerPos = clampN(add(d.anchorN, dn));
      else a.at = clampN(add(o.at, dn));
    } else {
      if (a.pts) a.pts = o.pts.map(q => add(q, dn));
      if (a.at) a.at = clampN(add(o.at, dn));
      if (a.a) { a.a = add(o.a, dn); a.b = add(o.b, dn); }
      if (o.labelPos) a.labelPos = add(o.labelPos, dn);
      if (o.markerPos) a.markerPos = add(o.markerPos, dn);
    }
    touch('stage');
  }

  onUp(e) {
    if (!this.editable()) return;
    const p = this.toCanvas(e);
    const n = this.cam.inv(...p);
    const d = this.draft;
    if (d && (d.type === 'rect' || d.type === 'arrow')) {
      this.draft = null;
      const b = d.b || n;
      const pa = this.cam.pt(d.a), pb = this.cam.pt(b);
      const k = this.W / this.canvas.clientWidth;
      if (Math.hypot(pa[0] - pb[0], pa[1] - pb[1]) < 8 * k) { this.dirty = true; return; }
      if (d.type === 'rect') {
        const [x0, x1] = [Math.min(d.a[0], b[0]), Math.max(d.a[0], b[0])], [y0, y1] = [Math.min(d.a[1], b[1]), Math.max(d.a[1], b[1])];
        this.addAnn(zoneAnn([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]));
      } else {
        this.addAnn({ id: uid('a'), type: 'arrow', a: d.a, b, text: '', color: null, labelPos: null });
      }
      return;
    }
    if (this.drag) {
      const moved = this.drag.moved;
      this.drag = null;
      if (moved) touch('insp');
    }
  }

  onDbl(e) {
    if (!this.editable()) return;
    if (this.draft?.type === 'zone') { this.finishZone(); return; }
    if (app.tool !== 'select') return;
    const p = this.toCanvas(e);
    const a = annotation();
    if (a?.type !== 'zone') return;
    const pts = a.pts.map(this.cam.pt);
    let best = null;
    for (let i = 0; i < pts.length; i++) {
      const [dd] = distSeg(p, pts[i], pts[(i + 1) % pts.length]);
      if (!best || dd < best.d) best = { d: dd, i };
    }
    const k = this.W / this.canvas.clientWidth;
    if (best && best.d < 12 * k) {
      a.pts.splice(best.i + 1, 0, this.cam.inv(...p));
      touch('insp');
    }
  }

  finishZone() {
    const d = this.draft;
    if (!d || d.type !== 'zone') return;
    const k = this.W / this.canvas.clientWidth;
    const pts = [];
    for (const q of d.pts) {
      const last = pts[pts.length - 1];
      if (!last || Math.hypot(...[0, 1].map(j => (this.cam.pt(q)[j] - this.cam.pt(last)[j]))) > 4 * k) pts.push(q);
    }
    this.draft = null;
    if (pts.length < 3) { toast('An area needs at least 3 corners', 'warn'); this.dirty = true; this.buildToolbar(); return; }
    this.addAnn(zoneAnn(pts));
  }

  addAnn(a) {
    const A = analysis();
    if (!A) return;
    A.an.anns.push(a);
    app.sel.ann = a.id;
    app.tool = 'select';
    this.canvas.style.cursor = 'default';
    this.buildToolbar();
    touch('all');
  }

  deleteSelected() {
    const A = analysis();
    const a = annotation();
    if (!A || !a) return false;
    A.an.anns = A.an.anns.filter(x => x.id !== a.id);
    app.sel.ann = null;
    touch('all');
    return true;
  }

  nudge(dx, dy) {
    const a = annotation();
    if (!a || !this.cam) return;
    const d = [dx / (this.cam.iw * this.cam.s) * (this.W / this.canvas.clientWidth), dy / (this.cam.ih * this.cam.s) * (this.W / this.canvas.clientWidth)];
    if (a.pts) a.pts = a.pts.map(q => add(q, d));
    if (a.at) a.at = add(a.at, d);
    if (a.a) { a.a = add(a.a, d); a.b = add(a.b, d); }
    if (a.labelPos) a.labelPos = add(a.labelPos, d);
    if (a.markerPos) a.markerPos = add(a.markerPos, d);
    touch('stage');
  }

  // keyboard shortcuts that belong to the stage; returns true when handled
  onKey(e) {
    const k = e.key;
    if (this.mode === 'preview') {
      if (k === 'Escape') { this.player.stop(); return true; }
      if (k === ' ') { this.player.toggle(); return true; }
      return false;
    }
    if (this.mode === 'clip' || (this.mode === 'media' && this.video)) {
      if (k === ' ') { this.togglePlay(); return true; }
      if (k === 'ArrowLeft') { this.step(e.shiftKey ? -this.fps(this.videoPath) : -1); return true; }
      if (k === 'ArrowRight') { this.step(e.shiftKey ? this.fps(this.videoPath) : 1); return true; }
      if (this.mode === 'clip') {
        if (k === 'i' || k === 'I') { this.setIn(); return true; }
        if (k === 'o' || k === 'O') { this.setOut(); return true; }
        if (k === 'f' || k === 'F') { this.addFreeze(); return true; }
      }
      if (k === 's' || k === 'S') { this.snapshot(); return true; }
    }
    if (this.mode === 'analysis') {
      if (this.draft) {
        if (k === 'Escape') { this.draft = null; this.dirty = true; this.buildToolbar(); return true; }
        if (k === 'Enter') { this.finishZone(); return true; }
        if (k === 'Backspace' && this.draft.pts) { this.draft.pts.pop(); if (!this.draft.pts.length) this.draft = null; this.dirty = true; return true; }
      }
      if (k === ' ') { this.toggleAnim(); return true; }
      if (k === 'Delete' || k === 'Backspace') return this.deleteSelected();
      if (k === 'Escape') { app.sel.ann = null; this.anim.active = false; touch('insp'); this.buildToolbar(); return true; }
      const map = { v: 'select', p: 'zone', r: 'rect', a: 'arrow', c: 'pin', t: 'text' };
      if (!e.ctrlKey && !e.metaKey && map[k.toLowerCase()]) { this.setTool(map[k.toLowerCase()]); return true; }
      const step = e.shiftKey ? 10 : 1;
      const arrows = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      if (arrows[k] && annotation()) { this.nudge(...arrows[k]); return true; }
    }
    if (this.mode === 'card' && k === ' ') { this.tp.play?.click(); return true; }
    return false;
  }

  startPreview(fromSceneId) {
    this.pauseAll();
    this.mode = 'preview';
    this.player.start(fromSceneId);
    this.buildToolbar();
    this.buildTransport();
  }
}

function zoneAnn(pts) {
  return { id: uid('a'), type: 'zone', pts, building: null, label: '', color: null, fill: true, card: true, spotlight: false, labelPos: null, markerPos: null };
}

export function insertBeforeCards(sc) {
  const P = app.P;
  const idx = P.scenes.findIndex(s => ['summary', 'concerns', 'milestones', 'end'].includes(s.type));
  if (idx < 0) P.scenes.push(sc); else P.scenes.splice(idx, 0, sc);
}

// ------------------------------------------------------------------ full storyboard preview
class Player {
  constructor(stage) { this.stage = stage; this.playing = false; this.T = 0; this.tl = null; }

  start(fromSceneId) {
    const P = app.P;
    this.tl = buildTimeline(P, P.settings.fps);
    this.T = fromSceneId ? (this.tl.sceneStart[fromSceneId] || 0) : 0;
    this.playing = true;
    this.activeSeg = null;
    const keys = this.tl.segs.flatMap(g => segmentKeys(P, g));
    app.assets.ensure(keys);
  }

  stop(rebuild = true) {
    this.playing = false;
    this.stage.pauseAll();
    if (rebuild) { this.stage.mode = 'empty'; this.stage.show(); }
  }

  toggle() {
    this.playing = !this.playing;
    if (!this.playing) this.stage.pauseAll();
    if (this.playing && this.T >= this.tl.total - 0.01) this.T = 0;
    this.activeSeg = null;
    this.updateTransport();
  }

  seek(T) {
    this.T = clamp(T, 0, this.tl.total - 0.001);
    this.activeSeg = null;
    this.stage.pauseAll();
  }

  tick(dt) {
    const st = this.stage, P = app.P;
    if (!this.tl || !this.tl.segs.length) return;
    let seg = segmentAt(this.tl, this.T);
    let video = null;
    if (seg.type === 'video' && seg.scene.path) {
      video = st.videoFor(seg.scene.path);
      const want = seg.srcIn + (this.T - seg.start);
      if (this.activeSeg !== seg) {
        this.activeSeg = seg;
        st.pauseAll();
        if (Math.abs(video.currentTime - want) > 0.12) video.currentTime = want;
      }
      if (this.playing) {
        if (video.paused && !video.seeking) video.play().catch(() => {});
        if (!video.seeking && video.readyState >= 2 && !video.paused) this.T = seg.start + Math.max(0, video.currentTime - seg.srcIn);
        if (this.T >= seg.start + seg.dur - 0.02 || video.ended) { this.T = seg.start + seg.dur + 1e-4; video.pause(); }
      } else if (!video.paused) video.pause();
    } else {
      if (this.activeSeg !== seg) { this.activeSeg = seg; st.pauseAll(); }
      if (this.playing) this.T += dt;
      // pre-roll the next footage segment so it starts instantly
      const next = this.tl.segs[seg.idx + 1];
      if (next && next.type === 'video' && next.scene.path && seg.start + seg.dur - this.T < 1.5) {
        const v = st.videoFor(next.scene.path);
        if (v.paused && !v.seeking && Math.abs(v.currentTime - next.srcIn) > 0.12) v.currentTime = next.srcIn;
      }
    }
    if (this.T >= this.tl.total) { this.T = this.tl.total - 0.001; this.playing = false; st.pauseAll(); }
    seg = segmentAt(this.tl, this.T);
    const R = resolveAssets(P, seg, app.assets, st.W, st.H);
    if (seg.type === 'video') R.video = seg.scene.path ? st.videoFor(seg.scene.path) : null;
    drawSegment(st.ctx, st.W, st.H, seg, this.T - seg.start, R);
    this.updateTransport();
  }

  buildTransport(T) {
    this.tp = {};
    this.tp.play = h('button.tp-btn', { onclick: () => this.toggle(), title: 'Play / pause (Space)' }, '❚❚');
    this.tp.time = h('span.tp-time', '00:00.00');
    T.appendChild(h('div.tp-row', this.tp.play, this.tp.time, h('span.tp-dur', ' / ' + fmtTime(this.tl.total)), h('div.grow'),
      h('button.btn', { onclick: () => this.stop() }, '✕ Exit preview (Esc)')));
    const bar = h('div.scrub.scenes');
    const total = this.tl.total || 1;
    let lastScene = null;
    for (const g of this.tl.segs) {
      if (g.scene === lastScene) continue;
      lastScene = g.scene;
      const dur = this.tl.segs.filter(x => x.scene === g.scene).reduce((a, x) => a + x.dur, 0);
      bar.appendChild(h('div.sblock.' + g.scene.type, { style: { left: (g.start / total) * 100 + '%', width: (dur / total) * 100 + '%' }, title: g.scene.caption || SCENE_TYPES[g.scene.type]?.label },
        h('span', SCENE_TYPES[g.scene.type]?.icon || '')));
    }
    for (const g of this.tl.segs) if (g.kind === 'freeze') bar.appendChild(h('div.fmark', { style: { left: (g.start / total) * 100 + '%' } }, '◆'));
    this.tp.head = h('div.playhead');
    bar.appendChild(this.tp.head);
    const seekTo = e => { const r = bar.getBoundingClientRect(); this.seek(clamp((e.clientX - r.left) / r.width) * total); };
    bar.addEventListener('pointerdown', e => { bar.setPointerCapture(e.pointerId); seekTo(e); bar.onpointermove = seekTo; });
    bar.addEventListener('pointerup', () => { bar.onpointermove = null; });
    T.appendChild(bar);
  }

  updateTransport() {
    if (!this.tp) return;
    this.tp.time.textContent = fmtTime(this.T);
    this.tp.play.textContent = this.playing ? '❚❚' : '▶';
    this.tp.head.style.left = clamp(this.T / (this.tl.total || 1)) * 100 + '%';
  }
}
