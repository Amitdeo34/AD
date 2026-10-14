// Exports: MP4 video (browser draws designed frames, ffmpeg cuts the original footage),
// PowerPoint (analysis stills + native editable slides) and PNG stills for WhatsApp / email.
import { app, mediaItem } from './state.js';
import { api } from './api.js';
import { h, fmtTime, fmtBytes, fmtDate, toast, chunk } from './util.js';
import { buildTimeline } from './timeline.js';
import { Assets, segmentKeys, resolveAssets, frameKey, logoKey } from './assets.js';
import { drawSegment, drawChrome, camera, drawCover } from './render.js';
import { buildingOf, stageOf, pinInfo, zoneInfo, SEVERITY, MILESTONE_STATUS, CRITICAL, overallProgress, coverRef, concernNo } from './model.js';
import { modal } from './ui/modal.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));

function baseName(P) {
  return [P.info.name, P.info.surveyLabel, P.info.surveyDate].filter(Boolean).join(' ').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_') || 'drone_report';
}

async function fontsReady() {
  try {
    await Promise.all(['400', '500', '600', '700', '800'].map(w => document.fonts.load(`${w} 24px Inter`)));
    await document.fonts.ready;
  } catch { /* system fonts are fine too */ }
}

function canvas(W, H) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(W, H);
  const c = document.createElement('canvas'); c.width = W; c.height = H; return c;
}
function toBlob(c, type = 'image/jpeg', quality = 0.92) {
  if (c.convertToBlob) return c.convertToBlob({ type, quality });
  return new Promise(r => c.toBlob(r, type, quality));
}

function validate(P) {
  const problems = [];
  P.scenes.forEach((s, i) => {
    const paths = s.type === 'compare' ? [s.a?.path, s.b?.path] : (s.type === 'clip' || s.type === 'photo') ? [s.path] : [];
    for (const p of paths) {
      if (!p) problems.push(`Scene ${i + 1} (${s.type}) has no media selected`);
      else if (app.media.length && !mediaItem(p)) problems.push(`Scene ${i + 1}: ${p} is not in the media folder`);
    }
  });
  return problems;
}

// ------------------------------------------------------------------ video
async function exportVideo(ui) {
  const P = app.P, St = P.settings;
  const W = St.width, H = St.height, fps = St.fps;
  const tl = buildTimeline(P, fps);
  await fontsReady();
  ui.step('Loading frames at full resolution…');
  const assets = new Assets(app.pid, Math.round(W * 1.25));
  await assets.ensure(tl.segs.flatMap(g => segmentKeys(P, g)));
  const logo = assets.get(logoKey(P.info.logo));
  const { job, encoder } = await api.renderStart(app.pid, { width: W, height: H, fps, quality: St.quality, encoder: St.encoder });
  ui.job = job;
  ui.log(`Rendering ${W}×${H} @ ${fps} fps with ${encoder}`);
  const total = tl.total;
  let done = 0;
  const t0 = performance.now();
  const pool = [0, 1, 2].map(() => { const c = canvas(W, H); return { c, ctx: c.getContext('2d') }; });
  for (const g of tl.segs) {
    if (ui.cancelled) throw new Error('cancelled');
    const label = `${g.idx + 1}/${tl.segs.length} · ${g.kind === 'clip' ? 'footage ' + g.scene.path : g.kind}`;
    if (g.type === 'video') {
      ui.step(`Encoding ${label} (${fmtTime(g.dur)})`);
      if (St.chrome !== false) {
        const oc = canvas(W, H);
        drawChrome(oc.getContext('2d'), W, H, g.scene, P, { alpha: 1, logo });
        await api.renderOverlay(job, g.idx, await toBlob(oc, 'image/png'));
      }
      await api.renderVideo(job, g.idx, {
        path: g.scene.path, in: g.srcIn, dur: g.dur, fadeIn: g.first, fadeOut: g.last,
        chromeIn: g.first, chromeOut: g.last, transitions: St.transitions !== false,
      });
      done += g.dur;
    } else {
      const n = Math.max(1, Math.round(g.dur * fps));
      ui.step(`Drawing ${label} (${n} frames)`);
      await api.framesBegin(job, g.idx, n);
      const R = resolveAssets(P, g, assets, W, H);
      R.logo = logo;
      let batch = [], pending = [];
      const flush = async () => { if (batch.length) { const b = new Blob(batch, { type: 'image/jpeg' }); batch = []; await api.framesData(job, g.idx, b); } };
      for (let f = 0; f < n; f++) {
        if (ui.cancelled) throw new Error('cancelled');
        const slot = pool[f % pool.length];
        if (pending.length >= pool.length) batch.push(await pending.shift());
        drawSegment(slot.ctx, W, H, g, f / fps, R);
        pending.push(toBlob(slot.c, 'image/jpeg', 0.93));
        if (batch.length >= 12) await flush();
        done += 1 / fps;
        if (f % 10 === 0) ui.progress(done / total, t0);
      }
      for (const p of pending) batch.push(await p);
      await flush();
      await api.framesEnd(job, g.idx);
    }
    ui.progress(done / total, t0);
  }
  ui.step('Joining everything into one MP4' + (P.info.music ? ' with music…' : '…'));
  const r = await api.renderFinish(job, { name: baseName(P), music: P.info.music, volume: P.info.musicVolume, total });
  ui.job = null;
  return r;
}

// ------------------------------------------------------------------ stills shared by PPT & PNG export
async function renderStill(P, g, assets, W, H, mode, type = 'image/jpeg') {
  const c = canvas(W, H);
  const R = resolveAssets(P, g, assets, W, H);
  if (g.kind === 'freeze' || g.kind === 'photo') {
    R.still = mode;
    drawSegment(c.getContext('2d'), W, H, g, 0, R);
  } else {
    drawSegment(c.getContext('2d'), W, H, g, Math.max(0.1, g.dur - 0.8), Object.assign(R, { still: false }));
  }
  return toBlob(c, type, 0.92);
}

function analysisSlide(P, g, image) {
  const an = g.kind === 'freeze' ? g.freeze : g.scene;
  const zones = [];
  const seen = new Set();
  for (const a of an.anns) {
    if (a.type !== 'zone') continue;
    const b = buildingOf(P, a.building);
    if (b) {
      if (seen.has(b.id)) continue;
      seen.add(b.id);
      const st = stageOf(P, b.stage);
      zones.push({ name: b.name, stage: st.name, color: b.critical ? CRITICAL : st.color, progress: Math.round(+b.progress || 0), floors: b.floors, critical: !!b.critical, remarks: b.remarks });
    } else if (a.label) zones.push({ name: a.label, color: zoneInfo(P, a).color });
  }
  const pins = an.anns.filter(a => a.type === 'pin').map(a => {
    const pi = pinInfo(P, a);
    return { label: pi.badge, title: pi.title, severity: pi.concern?.severity || a.severity, detail: pi.concern?.detail || '' };
  });
  const notes = (an.highlights || []).filter(x => x.title || x.detail).map(x => [x.title, x.detail].filter(Boolean).join(' — '));
  const src = g.kind === 'freeze' ? `Source: ${g.scene.path} @ ${fmtTime(g.freeze.t)}` : `Source: ${g.scene.path}`;
  return { type: 'analysis', image, no: g.no || null, title: an.title || g.scene.caption || 'Site view', caption: g.kind === 'freeze' && g.scene.caption && g.scene.caption !== an.title ? g.scene.caption : '', source: src, zones, pins, notes };
}

async function exportPptx(ui) {
  const P = app.P;
  const W = 1920, H = 1080;
  const tl = buildTimeline(P, 30);
  await fontsReady();
  ui.step('Preparing slides…');
  const { job } = await api.newJob();
  const assets = new Assets(app.pid, 1920);
  await assets.ensure(tl.segs.flatMap(g => segmentKeys(P, g)));
  const images = {};
  const cov = coverRef(P);
  if (cov) {
    const img = assets.get(frameKey(cov.path, cov.t));
    if (img) {
      const c = canvas(W, H);
      drawCover(c.getContext('2d'), img, camera(img.width, img.height, W, H));
      await api.upload(app.pid, { job, name: 'cover.jpg' }, await toBlob(c));
      images.cover = 'cover.jpg';
    }
  }
  if (P.info.logo) {
    const r = await fetch(api.fileUrl(app.pid, P.info.logo));
    if (r.ok) { const ext = P.info.logo.split('.').pop().toLowerCase(); images.logo = 'logo.' + ext; await api.upload(app.pid, { job, name: images.logo }, await r.blob()); }
  }
  const slides = [];
  const title = P.scenes.find(s => s.type === 'title');
  if (!title) slides.push({ type: 'title' });
  const done = new Set();
  let k = 0;
  for (const g of tl.segs) {
    if (ui.cancelled) throw new Error('cancelled');
    const s = g.scene;
    ui.progress(k++ / tl.segs.length);
    if (g.kind === 'title') slides.push({ type: 'title', title: s.title || '', overline: P.info.overline });
    else if (g.kind === 'freeze' || g.kind === 'photo') {
      const name = `an_${g.idx}.jpg`;
      await api.upload(app.pid, { job, name }, await renderStill(P, g, assets, W, H, 'clean'));
      slides.push(analysisSlide(P, g, name));
    } else if (g.kind === 'compare' && !done.has(s.id)) {
      for (const side of ['a', 'b']) {
        const img = assets.get(frameKey(s[side]?.path, s[side]?.t));
        if (!img) continue;
        const c = canvas(W, H);
        drawCover(c.getContext('2d'), img, camera(img.width, img.height, W, H));
        await api.upload(app.pid, { job, name: `cmp_${g.idx}_${side}.jpg` }, await toBlob(c));
      }
      slides.push({ type: 'compare', title: s.caption || 'Progress comparison', caption: s.sub || '', imageA: `cmp_${g.idx}_a.jpg`, imageB: `cmp_${g.idx}_b.jpg`, labelA: s.a.label, labelB: s.b.label });
    } else if (g.kind === 'summary' && !done.has(s.id)) {
      const pages = chunk(P.buildings, 10);
      const crit = P.buildings.filter(b => b.critical).length;
      const kpis = [
        { label: 'Overall progress', value: overallProgress(P) + '%', color: P.info.accent },
        { label: 'Buildings / zones', value: P.buildings.length, color: '#64748B' },
        { label: 'Completed', value: P.buildings.filter(b => +b.progress >= 100).length, color: '#22C55E' },
        { label: 'Critical', value: crit, color: CRITICAL, tint: crit > 0 },
      ];
      pages.forEach((items, i) => slides.push({
        type: 'summary', title: s.title || '', page: i + 1, pages: pages.length, kpis,
        buildings: items.map(b => { const st = stageOf(P, b.stage); return { name: b.name, stage: st.name, color: st.color, progress: +b.progress || 0, floors: b.floors, critical: !!b.critical, remarks: b.remarks }; }),
      }));
    } else if (g.kind === 'concerns' && !done.has(s.id)) {
      const pages = chunk(P.concerns, 7);
      pages.forEach((items, i) => slides.push({
        type: 'concerns', title: s.title || '', page: i + 1, pages: pages.length,
        items: items.map(c => ({ label: 'C' + concernNo(P, c.id), title: c.title, detail: c.detail, severity: c.severity, building: buildingOf(P, c.building)?.name || '', action: c.action, owner: c.owner, due: c.due ? fmtDate(c.due) : '' })),
      }));
    } else if (g.kind === 'milestones' && !done.has(s.id)) {
      const sorted = [...P.milestones].sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));
      const pages = chunk(sorted, 10);
      pages.forEach((items, i) => slides.push({
        type: 'milestones', title: s.title || '', page: i + 1, pages: pages.length,
        items: items.map(m => ({ title: m.title, date: m.date ? fmtDate(m.date) : '', statusLabel: (MILESTONE_STATUS[m.status] || MILESTONE_STATUS.ontrack).label, color: (MILESTONE_STATUS[m.status] || MILESTONE_STATUS.ontrack).color, building: buildingOf(P, m.building)?.name || '', note: m.note })),
      }));
    } else if (g.kind === 'end') slides.push({ type: 'end', title: s.title || '', subtitle: s.sub || '' });
    done.add(s.id);
  }
  ui.step(`Building PowerPoint (${slides.length} slides)…`);
  const info = Object.assign({}, P.info, { surveyDateText: fmtDate(P.info.surveyDate) });
  return api.pptx(app.pid, { job, name: baseName(P), spec: { info, images, slides } });
}

async function exportStills(ui) {
  const P = app.P;
  const W = P.settings.width, H = P.settings.height;
  const tl = buildTimeline(P, 30);
  await fontsReady();
  ui.step('Rendering stills…');
  const assets = new Assets(app.pid, W);
  await assets.ensure(tl.segs.flatMap(g => segmentKeys(P, g)));
  const folder = 'stills_' + baseName(P);
  let n = 0;
  const list = tl.segs.filter(g => g.type === 'frames');
  for (const g of list) {
    if (ui.cancelled) throw new Error('cancelled');
    const label = (g.kind === 'freeze' ? g.freeze.title || g.scene.caption : g.kind === 'photo' ? g.scene.title || g.scene.caption : g.scene.caption || g.scene.title) || g.kind;
    const name = `${String(++n).padStart(2, '0')}_${label.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 40) || g.kind}${g.pages > 1 ? '_' + g.page : ''}.png`;
    await api.upload(app.pid, { dest: 'exports', folder, name }, await renderStill(P, g, assets, W, H, 'full', 'image/png'));
    ui.progress(n / list.length);
  }
  return { name: folder, file: folder, count: n };
}

// ------------------------------------------------------------------ dialog
export function openExport() {
  const P = app.P;
  const St = P.settings;
  const tl = buildTimeline(P, St.fps);
  const nAn = tl.segs.filter(g => g.kind === 'freeze' || g.kind === 'photo').length;
  const problems = validate(P);
  const prog = h('div.progress', h('div.bar'));
  const stepEl = h('div.step', '');
  const logEl = h('div.log');
  const results = h('div.results');
  const status = h('div.export-status', { hidden: true }, stepEl, prog, h('div.eta'), logEl);
  let busy = false;
  const ui = {
    cancelled: false, job: null,
    step(msg) { stepEl.textContent = msg; ui.log(msg); },
    log(msg) { logEl.prepend(h('div', `${new Date().toLocaleTimeString()}  ${msg}`)); },
    progress(p, t0) {
      prog.firstChild.style.width = Math.round(Math.min(1, p) * 100) + '%';
      const eta = status.querySelector('.eta');
      if (t0 && p > 0.02) { const el = (performance.now() - t0) / 1000; eta.textContent = `${Math.round(p * 100)}% · about ${fmtTime(el / p - el, false)} left`; }
      else eta.textContent = Math.round(p * 100) + '%';
    },
  };
  const run = async (fn, what) => {
    if (busy) return;
    busy = true; ui.cancelled = false;
    status.hidden = false;
    m.box.classList.add('busy');
    ui.progress(0);
    const t = performance.now();
    try {
      const r = await fn(ui);
      ui.progress(1);
      ui.step(`✓ ${what} ready in ${fmtTime((performance.now() - t) / 1000, false)}`);
      results.prepend(h('div.result', h('span', '✓ ' + (r.name || r.file)), r.count ? h('span.muted', ` (${r.count} images)`) : null,
        r.name && /\.(mp4|pptx)$/i.test(r.name) ? h('a.btn.small', { href: api.exportUrl(app.pid, r.name, true), download: r.name }, 'Download') : null,
        h('button.small', { onclick: () => api.open(app.pid, 'exports').catch(e => toast(e.message, 'err')) }, 'Open folder')));
      toast(`${what} exported`, 'ok');
    } catch (e) {
      if (ui.job) api.renderCancel(ui.job).catch(() => {});
      ui.step(e.message === 'cancelled' ? 'Cancelled.' : '✕ ' + e.message);
      if (e.message !== 'cancelled') console.error(e);
    } finally {
      busy = false; ui.job = null;
      m.box.classList.remove('busy');
    }
  };
  const card = (icon, title, desc, label, fn, what) => h('div.export-card',
    h('div.ec-ico', icon), h('div.grow', h('div.ec-title', title), h('div.muted', desc)),
    h('button.primary', { onclick: () => run(fn, what) }, label));
  const enc = St.encoder === 'auto' || !St.encoder ? 'CPU' : St.encoder;
  const m = modal('Export', h('div',
    problems.length ? h('div.warn', h('b', 'Fix these first:'), h('ul', problems.map(p => h('li', p)))) : null,
    card('🎬', 'Video (MP4)', `${St.height}p · ${St.fps} fps · ${St.quality} · ${enc} · ${fmtTime(tl.total, false)} long${P.info.music ? ' · with music' : ''}. Uses the original full-quality footage.`, 'Export video', exportVideo, 'Video'),
    card('📊', 'PowerPoint (PPTX)', `${nAn} analysis slides + title, building status, concerns, milestones. Text and tables stay editable.`, 'Export PPTX', exportPptx, 'PowerPoint'),
    card('🖼', 'Stills (PNG)', `Every analysis frame and dashboard as a ${St.width}×${St.height} image — ready for WhatsApp / email.`, 'Export stills', exportStills, 'Stills'),
    h('div.muted.small', 'Change resolution, frame rate, quality and GPU encoder in Project → Video output.'),
    status, results), [
    ['Cancel export', () => { ui.cancelled = true; if (ui.job) api.renderCancel(ui.job).catch(() => {}); }],
    ['Close', () => { if (busy && !confirm('An export is running. Close anyway? It will be cancelled.')) return; ui.cancelled = true; m.close(); }],
  ], { wide: true });
  if (problems.length) m.box.querySelectorAll('.export-card button').forEach(b => { b.disabled = true; });
}

export { sleep, fmtBytes, SEVERITY };
