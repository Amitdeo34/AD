// Bottom strip: the storyboard (scene order = video order = PPT order).
import { app, touch, select, emit, mediaItem } from '../state.js';
import { api } from '../api.js';
import { h, fmtTime } from '../util.js';
import { SCENE_TYPES, newScene, sceneLabel } from '../model.js';
import { buildTimeline } from '../timeline.js';
import { insertBeforeCards } from '../stage.js';

let dragFrom = -1;

export function renderStoryboard() {
  const root = document.getElementById('storyboard');
  root.innerHTML = '';
  const P = app.P;
  if (!P) return;
  const tl = buildTimeline(P, P.settings.fps);
  const durOf = {};
  for (const g of tl.segs) durOf[g.scene.id] = (durOf[g.scene.id] || 0) + g.dur;

  const addMenu = h('div.menu', Object.entries(SCENE_TYPES).filter(([k]) => !['clip', 'photo'].includes(k)).map(([k, v]) =>
    h('button', { onclick: () => { const sc = newScene(k); if (k === 'title') P.scenes.unshift(sc); else if (k === 'end') P.scenes.push(sc); else if (k === 'compare') insertBeforeCards(sc); else P.scenes.push(sc); select(sc.id); touch('all'); } }, `${v.icon}  ${v.label}`)));
  root.appendChild(h('div.sb-head',
    h('b', 'Storyboard'),
    h('span.muted', `${P.scenes.length} scenes · ${tl.segs.filter(g => g.no).length} analyses · ${fmtTime(tl.total, false)}`),
    h('div.grow'),
    h('button.small', { onclick: autoBuild, title: 'Add every video in the media folder that is not in the storyboard yet' }, '⚡ Add all clips'),
    h('div.dropdown', h('button.small', { onclick: e => e.currentTarget.parentElement.classList.toggle('open') }, '＋ Add card ▾'), addMenu)));

  const track = h('div.sb-track');
  P.scenes.forEach((s, i) => {
    const T = SCENE_TYPES[s.type] || { icon: '•', label: s.type };
    const on = app.sel.scene === s.id;
    let thumb;
    if (s.type === 'clip' && s.path) thumb = api.thumbUrl(app.pid, s.path, (s.in || 0) + 0.5, 320);
    else if (s.type === 'photo' && s.path) thumb = api.thumbUrl(app.pid, s.path, 0, 320);
    else if (s.type === 'compare' && s.b?.path) thumb = api.thumbUrl(app.pid, s.b.path, s.b.t || 0, 320);
    const missing = (s.type === 'clip' || s.type === 'photo') && s.path && app.media.length && !mediaItem(s.path);
    const card = h('div.sb-card.' + s.type + (on ? '.on' : '') + (missing ? '.missing' : ''), {
      draggable: true,
      onclick: () => select(s.id),
      ondragstart: e => { dragFrom = i; e.dataTransfer.effectAllowed = 'move'; card.classList.add('dragging'); },
      ondragend: () => card.classList.remove('dragging'),
      ondragover: e => { e.preventDefault(); card.classList.add('dropzone'); },
      ondragleave: () => card.classList.remove('dropzone'),
      ondrop: e => {
        e.preventDefault();
        card.classList.remove('dropzone');
        if (dragFrom < 0 || dragFrom === i) return;
        const [m] = P.scenes.splice(dragFrom, 1);
        P.scenes.splice(i, 0, m);
        dragFrom = -1;
        touch('all');
      },
      title: missing ? 'Media file not found in the current folder' : sceneLabel(s),
    },
    h('div.sb-thumb', thumb ? { style: { backgroundImage: `url("${thumb}")` } } : null,
      thumb ? null : h('div.sb-icon', T.icon),
      h('span.sb-type', T.label),
      h('span.sb-dur', fmtTime(durOf[s.id] || 0, false)),
      missing ? h('span.sb-missing', 'missing') : null),
    h('div.sb-label', `${i + 1}. ${sceneLabel(s)}`),
    s.type === 'clip' ? h('div.sb-freezes', s.freezes.length ? [...s.freezes].sort((a, b) => a.t - b.t).map(f =>
      h('button.fchip' + (app.sel.freeze === f.id ? '.on' : ''), {
        onclick: e => { e.stopPropagation(); select(s.id, f.id); }, title: f.title || 'Analysis',
      }, '◆ ' + fmtTime(f.t, false))) : h('span.muted.tiny', 'no analysis yet')) : null,
    h('div.sb-actions',
      h('button.icon', { title: 'Preview from here', onclick: e => { e.stopPropagation(); emit('preview', s.id); } }, '▶')));
    track.appendChild(card);
  });
  if (!P.scenes.length) track.appendChild(h('div.empty-hint', 'Empty storyboard — add clips from the Media panel.'));
  root.appendChild(track);
  const on = track.querySelector('.sb-card.on');
  if (on) on.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function autoBuild() {
  const P = app.P;
  const used = new Set(P.scenes.map(s => s.path).filter(Boolean));
  const vids = app.media.filter(m => m.kind === 'video' && !used.has(m.path) && !/\.lrf$/i.test(m.path));
  if (!vids.length) { alert('All videos are already in the storyboard (or the media folder has no videos).'); return; }
  for (const m of vids) insertBeforeCards(newScene('clip', { path: m.path, in: 0, out: +(m.duration || 10).toFixed(3) }));
  touch('all');
}

document.addEventListener('click', e => {
  document.querySelectorAll('.dropdown.open').forEach(d => { if (!d.contains(e.target)) d.classList.remove('open'); });
});
