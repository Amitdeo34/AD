// App bootstrap: home screen (projects) and the studio workspace wiring.
import { app, on, emit, touch, select, scene } from './state.js';
import { api } from './api.js';
import { h, debounce, toast, fmtDate } from './util.js';
import { normalize, newProject, newScene } from './model.js';
import { Assets } from './assets.js';
import { Stage } from './stage.js';
import { renderLeft, changeFolder } from './ui/left.js';
import { renderInspector } from './ui/inspector.js';
import { renderStoryboard } from './ui/storyboard.js';
import { openExport } from './exporter.js';
import { modal } from './ui/modal.js';

const $ = id => document.getElementById(id);
let history = [], future = [], lastSnap = '';
let saveState = 'saved';

// ------------------------------------------------------------------ boot
async function boot() {
  try { app.info = await api.info(); } catch (e) { app.info = { ffmpegError: 'Engine not reachable: ' + e.message }; }
  app.stage = new Stage();
  wire();
  const m = location.hash.match(/^#p=([\w-]+)/);
  if (m) openProject(m[1]).catch(() => showHome());
  else showHome();
}

// ------------------------------------------------------------------ home
async function showHome() {
  await flushSave();
  app.P = null; app.pid = null;
  history = []; future = [];
  location.hash = '';
  $('studio').hidden = true;
  const home = $('home');
  home.hidden = false;
  home.innerHTML = '';
  let projects = [];
  try { projects = await api.projects(); } catch (e) { toast(e.message, 'err'); }
  const info = app.info || {};

  const name = h('input', { placeholder: 'e.g. Steel Plant Expansion — Phase 2', spellcheck: false });
  const site = h('input', { placeholder: 'Site / location', spellcheck: false });
  const date = h('input', { type: 'date', value: new Date().toISOString().slice(0, 10) });
  const label = h('input', { placeholder: 'Survey 1', spellcheck: false });
  const folder = h('input', { placeholder: 'Folder with the raw drone videos & photos', spellcheck: false });
  const browse = h('button', { onclick: async () => { try { const r = await api.pickFolder(folder.value); if (r.path) folder.value = r.path; } catch (e) { toast(e.message, 'warn'); } } }, 'Browse…');
  const create = async () => {
    if (!name.value.trim()) { name.focus(); toast('Give the project a name', 'warn'); return; }
    let dir = '';
    if (folder.value.trim()) {
      const r = await api.checkFolder(folder.value);
      if (!r.exists) { toast('Media folder not found: ' + r.path, 'err'); return; }
      dir = r.path;
    }
    const p = newProject({ name: name.value.trim(), site: site.value.trim(), surveyDate: date.value, surveyLabel: label.value.trim(), mediaDir: dir });
    const saved = await api.create(p);
    openProject(saved.id);
  };

  home.appendChild(h('div.home-inner',
    h('header.home-hero',
      h('div.brand-mark', '◆'),
      h('div',
        h('h1', 'Drone Analytics Studio'),
        h('p', 'Raw drone footage → annotated progress video, PowerPoint and stills in one place. Runs on this computer — your footage never gets uploaded.'))),
    info.ffmpegError ? h('div.warn', '⚠ ' + info.ffmpegError, h('br'), 'Install it with:  pip install imageio-ffmpeg   then restart the studio.') : null,
    h('div.home-grid',
      h('section.card',
        h('h2', 'New survey report'),
        h('label.field', h('span.field-label', 'Project name'), name),
        h('label.field', h('span.field-label', 'Site / location'), site),
        h('div.row', h('label.field', h('span.field-label', 'Survey date'), date), h('label.field', h('span.field-label', 'Survey label'), label)),
        h('label.field', h('span.field-label', 'Drone media folder'), h('div.row', folder, browse)),
        h('button.primary.big', { onclick: create }, 'Create project →'),
        h('div.or', 'or'),
        h('button.big', { onclick: () => runDemo() }, '✨ Open the demo project'),
        h('p.muted.small', 'The demo paints a small construction site, renders two “drone” clips and fills in buildings, concerns and milestones so you can try everything in a minute.')),
      h('section.card',
        h('h2', 'Projects'),
        projects.length ? h('div.proj-list', projects.map(p => h('div.proj',
          h('div.grow', { onclick: () => openProject(p.id) },
            h('div.proj-name', p.name),
            h('div.muted.small', [p.site, p.surveyLabel, p.surveyDate ? fmtDate(p.surveyDate) : '', `${p.scenes} scenes`].filter(Boolean).join(' · '))),
          h('button.small', { onclick: () => openProject(p.id) }, 'Open'),
          h('button.small', { onclick: () => nextSurvey(p.id), title: 'Start next month\'s report with the same buildings, concerns, milestones and branding' }, '↻ Next survey'),
          h('button.small.icon.danger', {
            onclick: async () => {
              if (!confirm(`Delete project “${p.name}”?\nYour media files are NOT touched — only the studio project and its exports.`)) return;
              await api.remove(p.id); showHome();
            }, title: 'Delete project',
          }, '✕'))))
          : h('p.muted', 'No projects yet.'))),
    h('footer.home-foot',
      h('span', info.ffmpeg ? `✓ ${info.ffmpegVersion || 'FFmpeg ready'}` : '✕ FFmpeg missing'),
      info.encoders?.length ? h('span', 'Encoders: ' + info.encoders.join(', ')) : null,
      info.dataDir ? h('span', 'Data: ' + info.dataDir) : null,
      h('span', 'v' + (info.version || '?')))));
  name.focus();
}

async function runDemo() {
  const m = modal('Creating demo project', h('div', h('p', 'Painting a construction site and rendering two short drone clips…'), h('div.progress.indeterminate', h('div.bar')), h('div.log.demo-log')), [], { locked: true });
  try {
    await api.demo();
    for (;;) {
      await new Promise(r => setTimeout(r, 1200));
      const st = await fetch('/api/demo').then(r => r.json());
      m.box.querySelector('.demo-log').textContent = (st.log || []).join('\n');
      if (st.state === 'done') { m.close(); openProject(st.project); return; }
      if (st.state === 'error') throw new Error(st.error);
    }
  } catch (e) { m.close(); toast('Demo failed: ' + e.message, 'err', 8000); }
}

async function nextSurvey(pid) {
  const old = normalize(await api.load(pid));
  const folder = h('input', { value: '', placeholder: 'Folder with THIS survey\'s drone media', spellcheck: false });
  const label = h('input', { value: (old.info.surveyLabel || '').replace(/(\d+)\s*$/, (_, n) => String(+n + 1)) });
  const date = h('input', { type: 'date', value: new Date().toISOString().slice(0, 10) });
  const m = modal('Next survey from “' + old.info.name + '”', h('div',
    h('p.muted', 'Copies branding, buildings (with current progress), concerns, milestones and dashboard cards. Clips and analysis frames start fresh.'),
    h('div.row', h('label.field', h('span.field-label', 'Survey label'), label), h('label.field', h('span.field-label', 'Survey date'), date)),
    h('label.field', h('span.field-label', 'Media folder'), h('div.row', folder, h('button', { onclick: async () => { try { const r = await api.pickFolder(folder.value); if (r.path) folder.value = r.path; } catch (e) { toast(e.message, 'warn'); } } }, 'Browse…')))), [
    ['Cancel', () => m.close()],
    ['Create', async () => {
      let dir = '';
      if (folder.value.trim()) {
        const r = await api.checkFolder(folder.value);
        if (!r.exists) { toast('Folder not found', 'err'); return; }
        dir = r.path;
      }
      const p = JSON.parse(JSON.stringify(old));
      delete p.id; delete p.created;
      p.mediaDir = dir;
      p.info.surveyLabel = label.value;
      p.info.surveyDate = date.value;
      p.info.cover = null;
      if (p.info.logo && dir !== old.mediaDir) p.info.logo = null;
      p.info.music = null;
      p.scenes = p.scenes.filter(s => !['clip', 'photo', 'compare'].includes(s.type));
      const saved = await api.create(p);
      m.close();
      openProject(saved.id);
      if (old.info.logo && dir !== old.mediaDir) toast('Copy your logo file into the new media folder and pick it again in Project → Logo.', 'info', 7000);
    }, 'primary'],
  ]);
}

// ------------------------------------------------------------------ studio
async function openProject(pid) {
  const P = normalize(await api.load(pid));
  app.pid = pid;
  app.P = P;
  app.sel = { scene: null, freeze: null, ann: null };
  app.view = null;
  app.media = [];
  app.mediaDir = { dir: P.mediaDir, exists: true };
  app.leftTab = 'media';
  app.assets = new Assets(pid, 1920);
  app.assets.onChange(() => emit('assets'));
  history = [JSON.stringify(P)]; future = []; lastSnap = history[0];
  location.hash = 'p=' + pid;
  $('home').hidden = true;
  $('studio').hidden = false;
  document.title = P.info.name + ' — Drone Analytics Studio';
  setSave('saved');
  renderAll();
  app.stage.resize();
  app.stage.show();
  await loadMedia();
  if (!P.mediaDir) changeFolder();
}

function renderHeader() {
  $('proj-name').textContent = app.P.info.name;
  $('proj-sub').textContent = [app.P.info.surveyLabel, fmtDate(app.P.info.surveyDate)].filter(Boolean).join(' · ');
  $('btn-undo').disabled = history.length < 2;
  $('btn-redo').disabled = !future.length;
}

function keepScroll(id, fn) {
  const el = document.querySelector(id);
  const y = el ? el.scrollTop : 0;
  fn();
  const el2 = document.querySelector(id);
  if (el2) el2.scrollTop = y;
}

function renderAll() {
  renderHeader();
  keepScroll('#left .panel-body', renderLeft);
  keepScroll('#inspector', renderInspector);
  renderStoryboard();
}

let mediaTimer = null;
async function loadMedia() {
  clearTimeout(mediaTimer);
  if (!app.pid) return;
  const pid = app.pid;
  try {
    const r = await api.media(pid);
    if (pid !== app.pid) return;
    const sig = JSON.stringify(r.items.map(i => [i.path, i.probed, i.proxy?.state, Math.round((i.proxy?.progress || 0) * 20)]));
    const changed = sig !== app._mediaSig || r.dir !== app.mediaDir.dir;
    app._mediaSig = sig;
    app.media = r.items;
    app.mediaDir = { dir: r.dir, exists: r.exists };
    if (changed) {
      if (app.leftTab === 'media' || app.leftTab === 'project') keepScroll('#left .panel-body', renderLeft);
      renderStoryboard();
    }
    const busy = r.items.some(i => !i.probed || ['queued', 'running'].includes(i.proxy?.state));
    if (busy) mediaTimer = setTimeout(loadMedia, 2000);
  } catch (e) { toast('Media folder: ' + e.message, 'err'); }
}

// ------------------------------------------------------------------ saving & history
function setSave(s, msg) {
  saveState = s;
  const el = $('save-state');
  el.className = 'save ' + s;
  el.textContent = { saved: 'All changes saved', saving: 'Saving…', dirty: 'Unsaved changes', error: 'Save failed — ' + (msg || '') }[s];
}

const save = async () => {
  if (!app.pid || !app.P) return;
  const pid = app.pid, data = JSON.stringify(app.P);
  setSave('saving');
  try {
    await fetch(`/api/p/${pid}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: data }).then(r => { if (!r.ok) throw new Error(r.status); });
    if (pid === app.pid && JSON.stringify(app.P) === data) setSave('saved'); else scheduleSave();
  } catch (e) { setSave('error', e.message); }
};
const scheduleSave = debounce(save, 700);
async function flushSave() { if (saveState === 'dirty' || saveState === 'saving') { scheduleSave.cancel(); await save(); } }

const snapshot = debounce(() => {
  if (!app.P) return;
  const s = JSON.stringify(app.P);
  if (s === lastSnap) return;
  history.push(s);
  if (history.length > 150) history.shift();
  lastSnap = s;
  future = [];
  renderHeader();
}, 450);

function restore(json) {
  const sel = app.sel;
  app.P = normalize(JSON.parse(json));
  lastSnap = json;
  const sc = app.P.scenes.find(s => s.id === sel.scene);
  app.sel = { scene: sc ? sc.id : null, freeze: sc?.freezes?.some(f => f.id === sel.freeze) ? sel.freeze : null, ann: sel.ann };
  renderAll();
  app.stage.show();
  setSave('dirty');
  scheduleSave();
}
function undo() {
  snapshot.flush();
  if (history.length < 2) return;
  future.push(history.pop());
  restore(history[history.length - 1]);
}
function redo() {
  if (!future.length) return;
  const s = future.pop();
  history.push(s);
  restore(s);
}

const storyLater = debounce(() => app.P && renderStoryboard(), 300);
const headerLater = debounce(() => app.P && renderHeader(), 300);

// ------------------------------------------------------------------ events
function wire() {
  on('touch', what => {
    if (!app.P) return;
    setSave('dirty');
    scheduleSave();
    snapshot();
    app.stage.dirty = true;
    headerLater();
    if (what === 'all') { renderAll(); if (app.stage.mode !== 'preview') app.stage.render(); }
    else if (what === 'insp') keepScroll('#inspector', renderInspector);
    else if (what === 'left') keepScroll('#left .panel-body', renderLeft);
    else if (what === 'story') storyLater();
  });
  on('select', () => {
    if (!app.P) return;
    if (app.stage.mode === 'preview') app.stage.player.stop(false);
    app.stage.show();
    keepScroll('#inspector', renderInspector);
    renderStoryboard();
    if (app.leftTab === 'media') keepScroll('#left .panel-body', renderLeft);
  });
  on('left', () => renderLeft());
  on('rescan', () => loadMedia());
  on('save-now', () => { scheduleSave.cancel(); return save(); });
  on('preview', sceneId => app.stage.startPreview(sceneId));

  $('btn-home').onclick = () => showHome();
  $('btn-undo').onclick = undo;
  $('btn-redo').onclick = redo;
  $('btn-preview').onclick = () => app.stage.mode === 'preview' ? app.stage.player.stop() : app.stage.startPreview(scene()?.id);
  $('btn-export').onclick = async () => { await flushSave(); openExport(); };
  $('btn-help').onclick = showHelp;

  document.addEventListener('keydown', e => {
    if (!app.P || $('studio').hidden || document.querySelector('.modal-back')) return;
    const tag = (e.target.tagName || '').toLowerCase();
    const typing = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (mod && e.key.toLowerCase() === 'y' && !typing) { e.preventDefault(); redo(); return; }
    if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); scheduleSave.cancel(); save(); return; }
    if (typing) return;
    if (app.stage.onKey(e)) e.preventDefault();
  });
  window.addEventListener('beforeunload', e => {
    if (saveState === 'dirty' || saveState === 'saving') { save(); e.preventDefault(); e.returnValue = ''; }
  });
}

function showHelp() {
  modal('Quick guide', h('div.help',
    h('h4', '1 · Bring in the footage'),
    h('p', 'Media tab → Change folder → pick the folder the drone operator gave you. 4K / H.265 clips get a light preview copy automatically (originals are used for the export).'),
    h('h4', '2 · Build the storyboard'),
    h('p', 'Click ＋ on a clip (or ⚡ Add all clips). Title, status summary, concerns, milestones and end cards are already there. Drag cards to reorder.'),
    h('h4', '3 · Freeze & mark up'),
    h('p', 'Select a clip, scrub to a good frame and press ◆ Add analysis (F). Outline each building with ⬠ Area, link it to a building (its stage & progress appear automatically), drop ◉ concern markers, add KEY HIGHLIGHTS in the inspector. Press ▶ Play animation to watch it.'),
    h('h4', '4 · Data'),
    h('p', 'Buildings, Concerns and Milestones tabs (or 📋 paste rows from Excel). The dashboards, the PPT tables and every label update together.'),
    h('h4', '5 · Export'),
    h('p', 'Export → MP4 (footage + freeze frames + dashboards, with fades and music), PPTX (editable) and PNG stills. Files land in the project exports folder.'),
    h('h4', 'Next month'),
    h('p', 'Home → ↻ Next survey copies the buildings, concerns, milestones and branding into a fresh report.')), [], { wide: true });
}

boot();

export { touch, select, newScene };
