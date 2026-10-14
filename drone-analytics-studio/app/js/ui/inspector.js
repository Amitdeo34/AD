// Right panel: properties of whatever is selected (scene, analysis frame, annotation).
import { app, touch, select, scene, freeze, analysis, annotation, mediaItem, emit } from '../state.js';
import { h, fmtTime, toast, uid, deepClone } from '../util.js';
import { field, row, text, num, select as sel, check, color, range, button, section } from './forms.js';
import {
  SCENE_TYPES, SEVERITY, newBuilding, newConcern, buildingOf, concernOf, stageOf, zoneInfo, pinInfo,
} from '../model.js';
import { holdOf, minHold, buildTimeline } from '../timeline.js';

export function renderInspector() {
  const root = document.getElementById('inspector');
  root.innerHTML = '';
  const P = app.P;
  if (!P) return;
  const s = scene();
  if (!s) { root.appendChild(overview()); return; }
  if (s.type === 'clip' && app.sel.freeze && freeze()) { root.appendChild(analysisInspector()); return; }
  if (s.type === 'photo') { root.appendChild(photoHeader(s)); root.appendChild(analysisInspector()); return; }
  if (s.type === 'clip') { root.appendChild(clipInspector(s)); return; }
  root.appendChild(cardInspector(s));
}

function head(icon, title, sub) {
  return h('div.insp-head', h('span.insp-ico', icon), h('div', h('div.insp-title', title), sub ? h('div.insp-sub', sub) : null));
}

function sceneActions(s) {
  const P = app.P;
  return section(null, h('div.row',
    button('⧉ Duplicate scene', () => {
      const c = deepClone(s);
      c.id = uid('s');
      (c.freezes || []).forEach(f => { f.id = uid('f'); f.anns.forEach(a => { a.id = uid('a'); }); });
      (c.anns || []).forEach(a => { a.id = uid('a'); });
      P.scenes.splice(P.scenes.indexOf(s) + 1, 0, c);
      select(c.id); touch('all');
    }, 'small'),
    button('🗑 Delete scene', () => {
      if (!confirm('Delete this scene' + ((s.freezes || []).length ? ' and its analysis frames' : '') + '?')) return;
      P.scenes.splice(P.scenes.indexOf(s), 1);
      select(null); touch('all');
    }, 'small danger')));
}

const videos = () => app.media.filter(m => m.kind === 'video');
const images = () => app.media.filter(m => m.kind === 'image');
const pickable = () => app.media.filter(m => m.kind === 'image' || m.kind === 'video');

// ------------------------------------------------------------------ overview (nothing selected)
function overview() {
  const P = app.P;
  const tl = buildTimeline(P, P.settings.fps);
  const nAn = tl.segs.filter(g => g.no).length;
  return h('div',
    head('◆', P.info.name || 'Project', [P.info.site, P.info.surveyLabel].filter(Boolean).join(' · ')),
    section('This report',
      h('div.stats',
        h('div.stat', h('b', P.scenes.length), h('span', 'scenes')),
        h('div.stat', h('b', nAn), h('span', 'analysis frames')),
        h('div.stat', h('b', fmtTime(tl.total, false)), h('span', 'video length')),
        h('div.stat', h('b', P.buildings.length), h('span', 'buildings')),
        h('div.stat', h('b', P.concerns.length), h('span', 'concerns')),
        h('div.stat', h('b', P.milestones.length), h('span', 'milestones')))),
    section('How it works',
      h('ol.steps',
        h('li', h('b', 'Media'), ' — point to the drone folder; click a clip, press ＋ to add it.'),
        h('li', h('b', 'Freeze'), ' — scrub the clip, press ◆ Add analysis (F) on the frame you want.'),
        h('li', h('b', 'Mark'), ' — outline buildings / areas, link them to a building, drop concern markers, add key highlights.'),
        h('li', h('b', 'Data'), ' — fill Buildings, Concerns & Milestones (or paste from Excel). Dashboards build themselves.'),
        h('li', h('b', 'Export'), ' — one click: MP4 video, PowerPoint and PNG stills. No DaVinci needed.'))),
    section('Shortcuts',
      h('div.keys',
        ...[['Space', 'play / pause'], ['← →', 'frame step (Shift = 1 s)'], ['I / O', 'clip in / out'], ['F', 'freeze & analyse'],
          ['S', 'save full-res frame'], ['V P R A C T', 'tools'], ['Del', 'delete shape'], ['Ctrl+Z / Ctrl+Y', 'undo / redo']]
          .map(([k, d]) => h('div', h('kbd', k), h('span', d))))));
}

// ------------------------------------------------------------------ clip
function clipInspector(s) {
  const it = mediaItem(s.path);
  const dur = it?.duration || s.out;
  return h('div',
    head('🎥', s.caption || 'Drone clip', s.path || 'no video selected'),
    section('Footage',
      field('Video file', sel(s, 'path', [['', '— choose —'], ...videos().map(m => [m.path, m.name])], {
        onChange: () => { const m = mediaItem(s.path); if (m?.duration) { s.in = 0; s.out = m.duration; } emit('select'); },
      })),
      row(field('In (s)', num(s, 'in', { min: 0, max: dur, step: 0.1, after: 'all' })), field('Out (s)', num(s, 'out', { min: 0, max: dur, step: 0.1, after: 'all' }))),
      h('div.muted', `Clip length ${fmtTime(Math.max(0, s.out - s.in))} of ${fmtTime(dur)}${it ? ` · ${it.width}×${it.height} ${it.codec || ''} ${it.fps ? it.fps + 'fps' : ''}` : ''}`)),
    section('On-screen text',
      field(app.P.settings.theme === 'cinematic' ? 'Caption (lower third)' : 'Area name (top-right box)', text(s, 'caption', { placeholder: 'e.g. Main Entrance Gate' })),
      app.P.settings.theme === 'cinematic' ? field('Sub caption', text(s, 'sub')) : null),
    section(`Analysis frames (${s.freezes.length})`,
      s.freezes.length ? h('div.an-list', [...s.freezes].sort((a, b) => a.t - b.t).map(f => h('div.an-row', { onclick: () => select(s.id, f.id) },
        h('span.diamond', '◆'), h('span.an-time', fmtTime(f.t)), h('span.an-title', f.title || 'Untitled'), h('span.an-count', `${f.anns.length} marks`),
        button('✕', e => { e.stopPropagation(); if (confirm('Delete this analysis frame?')) { s.freezes.splice(s.freezes.indexOf(f), 1); touch('all'); } }, 'icon danger'))))
        : h('div.muted', 'Scrub the video and press ◆ Add analysis here (F) to freeze a frame and mark it up.')),
    sceneActions(s));
}

// ------------------------------------------------------------------ photo scene header
function photoHeader(s) {
  return h('div',
    head('🖼️', s.caption || 'Photo analysis', s.path || 'no photo selected'),
    section('Photo',
      field('Image file', sel(s, 'path', [['', '— choose —'], ...images().map(m => [m.path, m.name])], { onChange: () => emit('select') })),
      field(app.P.settings.theme === 'cinematic' ? 'Caption' : 'Area name before analysis (optional)', text(s, 'caption'))));
}

// ------------------------------------------------------------------ analysis (freeze or photo)
function analysisInspector() {
  const A = analysis();
  const P = app.P;
  const an = A.an;
  const kind = A.kind;
  const wrap = h('div');
  if (kind === 'freeze') wrap.appendChild(head('◆', an.title || 'Analysis frame', `${A.scene.path} @ ${fmtTime(an.t)}`));
  const holdKey = kind === 'photo' ? 'dur' : 'hold';
  const eff = holdOf(an, kind);
  wrap.appendChild(section('Analysis',
    field(P.settings.theme === 'cinematic' ? 'Title' : 'Area name (top-right box)', text(an, 'title', { placeholder: 'e.g. Pellet Plant-1' })),
    row(field(kind === 'photo' ? 'Duration (s)' : 'Hold on frame (s)', num(an, holdKey, { min: 2, max: 60, step: 0.5, after: 'all' })),
      field('Slow zoom', range(an, 'zoom', { min: 1, max: 1.3, step: 0.01, fmt: v => v <= 1.001 ? 'off' : '+' + Math.round((v - 1) * 100) + '%' }))),
    eff > (+an[holdKey] || 0) + 0.01 ? h('div.muted', `Auto-extended to ${eff.toFixed(1)} s so every mark has time to animate in.`) : null,
    check(an, 'panel', P.settings.theme === 'cinematic' ? 'Show analysis side panel' : 'Show KEY HIGHLIGHTS panel')));

  // key highlights
  an.highlights = an.highlights || [];
  const hl = section('Key highlights',
    h('div.hl-list', an.highlights.map((it, i) => h('div.hl-row',
      h('span.hl-no', String(i + 1).padStart(2, '0')),
      h('div.grow', text(it, 'title', { placeholder: 'Headline, e.g. Equipment erection for pellet car' }), text(it, 'detail', { placeholder: 'Detail, e.g. Pellet car erection started at IMB building' })),
      button('✕', () => { an.highlights.splice(i, 1); touch('all'); }, 'icon danger')))),
    button('＋ Add highlight', () => { an.highlights.push({ title: '', detail: '' }); touch('all'); setTimeout(() => document.querySelector('.hl-row:last-child input')?.focus(), 30); }, 'small'));
  wrap.appendChild(hl);

  // annotations
  const marks = section(`Marks on this frame (${an.anns.length})`,
    an.anns.length ? h('div.ann-list', an.anns.map(a => {
      const label = annLabel(a);
      return h('div.ann-row' + (a.id === app.sel.ann ? '.on' : ''), { onclick: () => { app.sel.ann = a.id; touch('insp'); } },
        h('span.ann-ico', { style: { color: annColor(a) } }, { zone: '⬠', arrow: '➚', pin: '◉', text: 'T' }[a.type]),
        h('span.grow', label),
        button('✕', e => { e.stopPropagation(); an.anns.splice(an.anns.indexOf(a), 1); if (app.sel.ann === a.id) app.sel.ann = null; touch('all'); }, 'icon danger'));
    })) : h('div.muted', 'Use the toolbar above the frame: ⬠ Area to outline a building, ◉ for a concern marker, ➚ arrow, T text.'));
  wrap.appendChild(marks);

  const a = annotation();
  if (a) wrap.appendChild(annInspector(a));

  if (kind === 'freeze') {
    wrap.appendChild(section(null, h('div.row',
      button('⤺ Back to clip', () => select(A.scene.id), 'small'),
      button('🗑 Delete analysis', () => {
        if (!confirm('Delete this analysis frame?')) return;
        A.scene.freezes.splice(A.scene.freezes.indexOf(an), 1);
        select(A.scene.id); touch('all');
      }, 'small danger'))));
  } else wrap.appendChild(sceneActions(A.scene));
  return wrap;
}

function annLabel(a) {
  const P = app.P;
  if (a.type === 'zone') return zoneInfo(P, a).title || 'Area (no label)';
  if (a.type === 'pin') return pinInfo(P, a).badge + ' · ' + pinInfo(P, a).title;
  if (a.type === 'arrow') return a.text || 'Arrow';
  return a.text || 'Text';
}
function annColor(a) {
  const P = app.P;
  if (a.type === 'zone') return zoneInfo(P, a).color;
  if (a.type === 'pin') return pinInfo(P, a).color;
  return a.color || P.info.labelColor;
}

function annInspector(a) {
  const P = app.P;
  const box = h('div.ann-edit');
  if (a.type === 'zone') {
    const b = buildingOf(P, a.building);
    box.append(section('Selected area',
      field('Building / zone', sel(a, 'building', [['', '— not linked (just a label) —'], ...P.buildings.map(x => [x.id, x.name]), ['__new', '＋ New building…']], {
        nullable: true,
        onChange: v => {
          if (v === '__new') {
            const name = prompt('Building / area name', a.label || `Building ${P.buildings.length + 1}`);
            if (!name) { a.building = null; touch('all'); return; }
            const nb = newBuilding(name);
            P.buildings.push(nb);
            a.building = nb.id;
            touch('all');
          }
        },
      })),
      b ? null : field('Label text', text(a, 'label', { placeholder: 'e.g. Main Gate', after: 'all' }))));
    if (b) {
      box.append(section(`Status of ${b.name}`,
        h('div.muted', 'Shared with the dashboard, PPT and every other frame showing this building.'),
        row(field('Stage', sel(b, 'stage', P.stages.map(s => [s.id, s.name]))), field('Floors / level', text(b, 'floors'))),
        field('Progress', range(b, 'progress', { min: 0, max: 100, step: 1, fmt: v => v + '%' })),
        check(b, 'critical', 'Critical — show in red'),
        field('Override label text (optional)', text(a, 'label', { placeholder: b.name })),
        field('Remarks', text(b, 'remarks'))));
    }
    box.append(section('Look',
      row(field('Colour', color(a, 'color', { fallback: zoneInfo(P, a).color })), field(' ', button('Reset colour', () => { a.color = null; touch('all'); }, 'small'))),
      check(a, 'fill', 'Tinted fill'),
      check(a, 'card', 'Show label'),
      P.settings.theme === 'cinematic' ? check(a, 'spotlight', 'Spotlight (darken everything else)') : null,
      h('div.row',
        button('Auto-place label', () => { a.labelPos = null; touch('all'); }, 'small'),
        P.settings.theme !== 'cinematic' ? button('Auto-place marker', () => { a.markerPos = null; touch('all'); }, 'small') : null)));
  } else if (a.type === 'pin') {
    const c = concernOf(P, a.concern);
    box.append(section('Selected concern marker',
      field('Concern', sel(a, 'concern', [['', '— not linked —'], ...P.concerns.map((x, i) => [x.id, `C${i + 1} · ${x.title}`]), ['__new', '＋ New concern from this marker…']], {
        nullable: true,
        onChange: v => {
          if (v === '__new') {
            const nc = newConcern(a.text && a.text !== 'Concern' ? a.text : 'New concern');
            nc.severity = a.severity || 'high';
            P.concerns.push(nc);
            a.concern = nc.id;
            touch('all');
          }
        },
      })),
      c ? h('div',
        field('Concern title', text(c, 'title', { after: 'all' })),
        row(field('Severity', sel(c, 'severity', Object.entries(SEVERITY).map(([k, v]) => [k, v.label]))), field('Building', sel(c, 'building', [['', 'General'], ...P.buildings.map(x => [x.id, x.name])], { nullable: true }))),
        field('Detail', text(c, 'detail', { multiline: true, rows: 2 })),
        field('Action required', text(c, 'action')))
        : h('div',
          field('Text', text(a, 'text', { after: 'all' })),
          field('Severity', sel(a, 'severity', Object.entries(SEVERITY).map(([k, v]) => [k, v.label])))),
      button('Auto-place label', () => { a.labelPos = null; touch('all'); }, 'small')));
  } else if (a.type === 'arrow') {
    box.append(section('Selected arrow',
      field('Label text', text(a, 'text', { placeholder: 'optional', after: 'all' })),
      row(field('Colour', color(a, 'color', { fallback: P.info.markerColor })), field(' ', button('Reset', () => { a.color = null; touch('all'); }, 'small')))));
  } else if (a.type === 'text') {
    box.append(section('Selected text',
      field('Text', text(a, 'text', { after: 'all' })),
      row(field('Style', sel(a, 'style', [['box', 'Box'], ['plain', 'Plain (shadow)']])), field('Size', range(a, 'size', { min: 0.6, max: 2.5, step: 0.1, fmt: v => Math.round(v * 100) + '%' }))),
      row(field('Box colour', color(a, 'color', { fallback: P.info.labelColor })), field(' ', button('Reset', () => { a.color = null; touch('all'); }, 'small')))));
  }
  box.append(section(null, button('🗑 Delete this mark', () => app.stage.deleteSelected(), 'small danger')));
  return box;
}

// ------------------------------------------------------------------ cards & compare
function cardInspector(s) {
  const P = app.P;
  const T = SCENE_TYPES[s.type] || { label: s.type, icon: '•' };
  const goto = tab => button(`Edit ${tab} →`, () => { app.leftTab = tab; emit('left'); }, 'small');
  const parts = [head(T.icon, T.label, s.title || '')];
  if (s.type === 'compare') {
    const side = (o, label) => section(label,
      field('Image or video', sel(o, 'path', [['', '— choose —'], ...pickable().map(m => [m.path, `${m.kind === 'video' ? '🎥' : '🖼'} ${m.name}`])], { onChange: () => emit('select') })),
      mediaItem(o.path)?.kind === 'video' ? row(field('Frame at (s)', num(o, 't', { min: 0, step: 0.1, after: 'all' })),
        field(' ', button('Use viewer time', () => { if (app.stage.video && app.stage.videoPath === o.path) { o.t = app.stage.current(); touch('all'); } else toast('Open this video in the Media viewer first, scrub to the frame, then come back.', 'warn'); }, 'small'))) : null,
      field('Label', text(o, 'label')));
    parts.push(
      side(s.a, 'Before (left)'), side(s.b, 'After (right)'),
      section('Text', field(P.settings.theme === 'cinematic' ? 'Caption' : 'Area name (top-right box)', text(s, 'caption')), P.settings.theme === 'cinematic' ? field('Sub caption', text(s, 'sub')) : null,
        field('Duration (s)', num(s, 'dur', { min: 3, max: 60, step: 0.5, after: 'all' }))),
      h('div.muted.pad', 'Tip: keep the same drone position each survey (DJI Waypoints / Mapping mission) — the wipe then lines up perfectly.'));
  } else {
    parts.push(section('Card',
      field('Duration (s)', num(s, 'dur', { min: 2, max: 60, step: 0.5, after: 'all' })),
      field(s.type === 'title' ? 'Title (default: project name)' : s.type === 'end' ? 'Title (default: Thank You)' : 'Heading', text(s, 'title', { after: 'all' })),
      s.type === 'title' || s.type === 'end' ? field('Subtitle', text(s, 'sub')) : null));
    if (s.type === 'summary') parts.push(section('Content', h('div.muted', 'Built from the Buildings list (8 per page).'), goto('buildings')));
    if (s.type === 'concerns') parts.push(section('Content', h('div.muted', 'Built from the Concerns list (6 per page).'), goto('concerns')));
    if (s.type === 'milestones') parts.push(section('Content', h('div.muted', 'Built from the Milestones list (6 per page).'), goto('milestones')));
    if (s.type === 'title' || s.type === 'end') parts.push(section('Content', h('div.muted', 'Project name, site, date, client and logo come from the Project tab.'), goto('project')));
  }
  parts.push(sceneActions(s));
  return h('div', parts);
}

export { minHold, stageOf };
