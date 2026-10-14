// Left panel: media browser + project data (details/brand, buildings, concerns, milestones).
import { app, touch, select, emit } from '../state.js';
import { api } from '../api.js';
import { h, fmtTime, fmtBytes, toast, parseTable } from '../util.js';
import { field, row, text, num, select as sel, check, color, range, button, section } from './forms.js';
import { newBuilding, newConcern, newMilestone, SEVERITY, MILESTONE_STATUS, stageOf } from '../model.js';
import { modal } from './modal.js';

const TABS = [['media', 'Media'], ['project', 'Project'], ['buildings', 'Buildings'], ['concerns', 'Concerns'], ['milestones', 'Milestones']];
let mediaFilter = 'all';

export function renderLeft() {
  const root = document.getElementById('left');
  root.innerHTML = '';
  root.appendChild(h('nav.tabs', TABS.map(([id, label]) => h('button' + (app.leftTab === id ? '.on' : ''), {
    onclick: () => { app.leftTab = id; renderLeft(); },
  }, label, id === 'buildings' ? h('span.count', app.P.buildings.length) : id === 'concerns' ? h('span.count', app.P.concerns.length) : id === 'milestones' ? h('span.count', app.P.milestones.length) : null))));
  const body = h('div.panel-body');
  root.appendChild(body);
  ({ media: mediaTab, project: projectTab, buildings: buildingsTab, concerns: concernsTab, milestones: milestonesTab })[app.leftTab](body);
}

// ------------------------------------------------------------------ media
function mediaTab(body) {
  const md = app.mediaDir;
  body.appendChild(h('div.folder',
    h('div.folder-path', { title: md.dir || '' }, md.dir ? md.dir : 'No media folder selected'),
    h('div.row',
      button('📁 Change folder', changeFolder, 'small'),
      button('⟳ Rescan', () => emit('rescan'), 'small'),
      md.dir ? button('Open', () => api.open(app.pid, 'media').catch(e => toast(e.message, 'err')), 'small') : null)));
  if (md.dir && !md.exists) body.appendChild(h('div.warn', 'Folder not found. Is the drive connected?'));
  if (!md.dir) {
    body.appendChild(h('div.empty-hint',
      h('p', 'Point the studio at the folder where the drone operator copied the raw videos & photos (pen drive, SSD or a PC folder).'),
      h('p', 'Nothing is uploaded anywhere — files are read directly from that folder.')));
    return;
  }
  const counts = { all: app.media.length, video: 0, image: 0, audio: 0 };
  app.media.forEach(m => { counts[m.kind] = (counts[m.kind] || 0) + 1; });
  body.appendChild(h('div.chips', [['all', 'All'], ['video', 'Videos'], ['image', 'Photos'], ['audio', 'Audio']].map(([k, l]) =>
    h('button.chip' + (mediaFilter === k ? '.on' : ''), { onclick: () => { mediaFilter = k; renderLeft(); } }, `${l} ${counts[k] || 0}`))));
  const list = app.media.filter(m => mediaFilter === 'all' || m.kind === mediaFilter);
  if (!list.length) body.appendChild(h('div.empty-hint', 'No media files found in this folder.'));
  const used = new Set(app.P.scenes.flatMap(s => [s.path, s.a?.path, s.b?.path]).filter(Boolean));
  const grid = h('div.media-grid');
  for (const m of list) {
    const isSel = app.view?.media === m.path;
    const px = m.proxy;
    let badge = null;
    if (m.kind === 'video' && px && px.state !== 'ready' && px.state !== 'none') {
      badge = h('span.badge.proxy', px.state === 'error' ? 'proxy failed' : px.state === 'queued' ? 'proxy queued' : `proxy ${Math.round(px.progress * 100)}%`);
    }
    grid.appendChild(h('div.media-card' + (isSel ? '.on' : '') + (used.has(m.path) ? '.used' : ''), {
      title: `${m.path}\n${fmtBytes(m.size)}${m.width ? `  ·  ${m.width}×${m.height}` : ''}${m.codec ? '  ·  ' + m.codec : ''}${m.fps ? '  ·  ' + m.fps + ' fps' : ''}`,
      onclick: () => {
        if (m.kind === 'audio') { app.P.info.music = m.path; touch('all'); toast('Background music set: ' + m.name, 'ok'); return; }
        app.sel = { scene: null, freeze: null, ann: null };
        app.view = { media: m.path };
        emit('select');
      },
    },
    h('div.thumb', m.kind === 'audio' ? h('div.audio-ico', '♪') : m.probed || m.kind === 'image' ? h('img', { src: api.thumbUrl(app.pid, m.path, Math.min(1, (m.duration || 2) / 2), 320), loading: 'lazy', draggable: false }) : h('div.spinner'),
      m.kind === 'video' ? h('span.badge.dur', fmtTime(m.duration || 0, false)) : null,
      m.kind === 'image' ? h('span.badge.dur', 'PHOTO') : null,
      badge,
      used.has(m.path) ? h('span.badge.used', '✓ used') : null,
      m.kind !== 'audio' ? h('button.add', {
        title: m.kind === 'video' ? 'Add clip to storyboard' : 'Add photo analysis',
        onclick: e => { e.stopPropagation(); app.view = { media: m.path }; emit('select'); app.stage[m.kind === 'video' ? 'addClipFromMedia' : 'addPhotoFromMedia'](m.path); },
      }, '＋') : null),
    h('div.media-name', m.name),
    h('div.media-meta', m.kind === 'video' ? `${m.width || '?'}×${m.height || '?'} · ${m.codec || ''}` : m.kind === 'image' ? `${m.width || '?'}×${m.height || '?'}` : fmtBytes(m.size))));
  }
  body.appendChild(grid);
}

export async function changeFolder() {
  const P = app.P;
  const input = h('input', { value: P.mediaDir || '', placeholder: 'e.g. D:\\Drone\\2026-10 Survey', spellcheck: false });
  const m = modal('Media folder', h('div',
    h('p.muted', 'The folder with the drone operator\'s raw videos and photos. Sub-folders are scanned too (e.g. DCIM/100MEDIA).'),
    h('div.row', input, button('Browse…', async () => {
      try { const r = await api.pickFolder(input.value); if (r.path) input.value = r.path; }
      catch (e) { toast(e.message, 'warn'); }
    }))), [
    ['Cancel', () => m.close()],
    ['Use this folder', async () => {
      const r = await api.checkFolder(input.value);
      if (!r.exists) { toast('Folder not found: ' + r.path, 'err'); return; }
      P.mediaDir = r.path;
      touch('all');
      await Promise.all(emit('save-now'));
      m.close();
      emit('rescan');
    }, 'primary'],
  ]);
  input.focus();
}

// ------------------------------------------------------------------ project
function projectTab(body) {
  const P = app.P, I = P.info, St = P.settings;
  const images = app.media.filter(m => m.kind === 'image');
  const audio = app.media.filter(m => m.kind === 'audio');
  body.append(
    section('Report details',
      field('Project name', text(I, 'name', { after: 'all' })),
      field('Site / location', text(I, 'site')),
      field('Client', text(I, 'client')),
      row(field('Survey date', text(I, 'surveyDate', { type: 'date' })), field('Survey label', text(I, 'surveyLabel', { placeholder: 'Survey 14' }))),
      field('Prepared by', text(I, 'preparedBy')),
      field('Company', text(I, 'company')),
      field('Next survey (end card)', text(I, 'nextSurvey', { placeholder: '12 Nov 2026' }))),
    section('Look & branding',
      field('Style', sel(St, 'theme', [['corporate', 'Corporate — brand boxes, dashed areas, red markers'], ['cinematic', 'Cinematic — dark glass cards, glow outlines']], {
        onChange: v => { St.zoneColors = v === 'corporate' ? 'brand' : 'stage'; renderLeft(); },
      })),
      field('Area outline colour', sel(St, 'zoneColors', [['brand', 'One brand colour'], ['stage', 'By construction stage']])),
      row(field('Brand', color(I, 'accent')), field('Labels', color(I, 'labelColor')), field('Outlines', color(I, 'zoneColor')), field('Markers', color(I, 'markerColor'))),
      field('Logo', sel(I, 'logo', [['', '— none —'], ...images.map(m => [m.path, m.name])], { nullable: true }), 'Transparent PNG works best'),
      field('Cover image (title & dashboards)', sel({ v: I.cover?.path || '' }, 'v', [['', 'Automatic (first clip / photo)'], ...images.map(m => [m.path, m.name]),
        ...(I.cover?.path && !images.some(m => m.path === I.cover.path) ? [[I.cover.path, `Frame of ${I.cover.path.split('/').pop()} @ ${fmtTime(I.cover.t || 0)}`]] : [])], {
        onChange: v => { I.cover = v ? { path: v, t: v === I.cover?.path ? I.cover.t : 0 } : null; touch('all'); },
      }), 'Tip: open a video in Media and click “Use frame as cover”.'),
      field('Highlights panel heading', text(I, 'highlightsLabel')),
      field('Report heading', text(I, 'overline')),
      check(St, 'chrome', 'Show logo / date / area boxes on footage'),
      check(St, 'transitions', 'Smooth fade between scenes')),
    section('Background music',
      field('Music file (from media folder)', sel(I, 'music', [['', '— none —'], ...audio.map(m => [m.path, m.name])], { nullable: true }), audio.length ? null : 'Put an .mp3 in the media folder to use it'),
      field('Volume', range(I, 'musicVolume', { min: 0, max: 1, step: 0.05, fmt: v => Math.round(v * 100) + '%' }))),
    section('Construction stages',
      h('div.stage-list', P.stages.map((s, i) => h('div.stage-row',
        color(s, 'color'), text(s, 'name', { after: 'all' }),
        button('✕', () => {
          if (P.buildings.some(b => b.stage === s.id)) { toast('Stage is used by a building', 'warn'); return; }
          P.stages.splice(i, 1); touch('all'); renderLeft();
        }, 'icon')))),
      button('＋ Add stage', () => { P.stages.push({ id: 'st' + Date.now().toString(36), name: 'New stage', color: '#64748B' }); touch('all'); renderLeft(); }, 'small')),
    section('Video output',
      row(field('Resolution', sel(St, 'height', [[720, '720p (fast)'], [1080, '1080p Full HD'], [2160, '4K UHD']], { number: true, onChange: () => { St.width = Math.round(St.height * 16 / 9); } })),
        field('Frame rate', sel(St, 'fps', [[25, '25 fps'], [30, '30 fps'], [60, '60 fps']], { number: true }))),
      row(field('Quality', sel(St, 'quality', [['draft', 'Draft (fast)'], ['high', 'High'], ['max', 'Maximum']])),
        field('Encoder', sel(St, 'encoder', [['auto', 'CPU (x264)'], ...(app.info?.encoders || []).filter(e => e !== 'libx264').map(e => [e, e.includes('nvenc') ? 'NVIDIA GPU (NVENC)' : e.includes('qsv') ? 'Intel GPU (QSV)' : e.includes('amf') ? 'AMD GPU (AMF)' : e])]))),
      check(St, 'autoProxy', 'Auto-create light preview copies of 4K / H.265 clips'),
      field('Export folder (optional)', text(P, 'exportDir', { placeholder: 'default: inside the project folder' }))),
  );
}

// ------------------------------------------------------------------ buildings / concerns / milestones
function listTools(addLabel, onAdd, pasteTitle, pasteHelp, onPaste) {
  return h('div.list-tools',
    button(addLabel, onAdd, 'primary small'),
    button('📋 Paste from Excel', () => {
      const ta = h('textarea', { rows: 10, placeholder: pasteHelp, spellcheck: false });
      const m = modal(pasteTitle, h('div', h('p.muted', 'Copy rows from Excel / Google Sheets and paste here. Columns in this order:'), h('code.cols', pasteHelp), ta), [
        ['Cancel', () => m.close()],
        ['Import', () => {
          const rows = parseTable(ta.value).filter(r => r.some(Boolean));
          const looksLikeHeader = rows.length && /name|title|building|concern|milestone/i.test(rows[0][0] || '');
          const n = onPaste(looksLikeHeader ? rows.slice(1) : rows);
          m.close(); touch('all'); renderLeft();
          toast(`Imported ${n} row${n === 1 ? '' : 's'}`, 'ok');
        }, 'primary'],
      ]);
      ta.focus();
    }, 'small'));
}

const reorder = (arr, i, d) => { const j = i + d; if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; touch('all'); renderLeft(); };

function itemHead(arr, i, titleEl, extra) {
  return h('div.item-head', titleEl, extra,
    h('div.item-actions', button('↑', () => reorder(arr, i, -1), 'icon'), button('↓', () => reorder(arr, i, 1), 'icon'),
      button('✕', () => { if (confirm('Delete this item?')) { arr.splice(i, 1); touch('all'); renderLeft(); } }, 'icon danger')));
}

function stageOptions() { return app.P.stages.map(s => [s.id, s.name]); }
function buildingOptions(none = '— none —') { return [['', none], ...app.P.buildings.map(b => [b.id, b.name])]; }

function buildingsTab(body) {
  const P = app.P;
  body.appendChild(listTools('＋ Add building', () => { P.buildings.push(newBuilding(`Building ${P.buildings.length + 1}`)); touch('all'); renderLeft(); },
    'Paste buildings', 'Name | Stage | Progress % | Floors | Critical (Y/N) | Remarks', rows => {
      for (const r of rows) {
        const b = newBuilding(r[0] || 'Building');
        if (r[1]) {
          let st = P.stages.find(s => s.name.toLowerCase() === r[1].toLowerCase() || s.id === r[1].toLowerCase());
          if (!st) { st = { id: 'st' + Math.random().toString(36).slice(2, 7), name: r[1], color: '#64748B' }; P.stages.push(st); }
          b.stage = st.id;
        }
        b.progress = Math.max(0, Math.min(100, parseFloat(r[2]) || 0));
        b.floors = r[3] || '';
        b.critical = /^(y|yes|true|1|critical)$/i.test(r[4] || '');
        b.remarks = r[5] || '';
        const ex = P.buildings.find(x => x.name.toLowerCase() === b.name.toLowerCase());
        if (ex) Object.assign(ex, { ...b, id: ex.id }); else P.buildings.push(b);
      }
      return rows.length;
    }));
  if (!P.buildings.length) body.appendChild(h('div.empty-hint', 'Add every tower / block / area you report on. Link them to outlines in the analysis frames — their stage & progress then show up on the video, dashboard and PPT automatically.'));
  P.buildings.forEach((b, i) => {
    const st = stageOf(P, b.stage);
    body.appendChild(h('div.item' + (b.critical ? '.critical' : ''), { style: { borderLeftColor: b.critical ? '#FF3B30' : st.color } },
      itemHead(P.buildings, i, text(b, 'name', { after: 'all' })),
      row(field('Stage', sel(b, 'stage', stageOptions())), field('Floors / level', text(b, 'floors', { placeholder: '14 / 22 floors' }))),
      field('Progress', range(b, 'progress', { min: 0, max: 100, step: 1, fmt: v => v + '%' })),
      check(b, 'critical', 'Critical — highlight in red'),
      field('Remarks', text(b, 'remarks'))));
  });
}

function concernsTab(body) {
  const P = app.P;
  body.appendChild(listTools('＋ Add concern', () => { P.concerns.push(newConcern()); touch('all'); renderLeft(); },
    'Paste concerns', 'Concern | Detail | Severity (High/Medium/Low) | Building | Action | Responsibility | Target date', rows => {
      for (const r of rows) {
        const c = newConcern(r[0] || 'Concern');
        c.detail = r[1] || '';
        c.severity = /^m/i.test(r[2] || '') ? 'medium' : /^l/i.test(r[2] || '') ? 'low' : 'high';
        c.building = P.buildings.find(b => b.name.toLowerCase() === (r[3] || '').toLowerCase())?.id || null;
        c.action = r[4] || ''; c.owner = r[5] || ''; c.due = r[6] || '';
        P.concerns.push(c);
      }
      return rows.length;
    }));
  if (!P.concerns.length) body.appendChild(h('div.empty-hint', 'Safety, quality or schedule concerns seen in the footage. Drop a concern marker on the frame and link it — numbering (C1, C2…) stays consistent across video and PPT.'));
  P.concerns.forEach((c, i) => {
    body.appendChild(h('div.item', { style: { borderLeftColor: SEVERITY[c.severity]?.color } },
      itemHead(P.concerns, i, h('div.grow', h('span.cno', 'C' + (i + 1)), text(c, 'title', { after: 'all' }))),
      field('Detail', text(c, 'detail', { multiline: true, rows: 2 })),
      row(field('Severity', sel(c, 'severity', Object.entries(SEVERITY).map(([k, v]) => [k, v.label]))), field('Building', sel(c, 'building', buildingOptions('General'), { nullable: true }))),
      field('Action required', text(c, 'action')),
      row(field('Responsibility', text(c, 'owner')), field('Target date', text(c, 'due', { type: 'date' })))));
  });
}

function milestonesTab(body) {
  const P = app.P;
  body.appendChild(listTools('＋ Add milestone', () => { P.milestones.push(newMilestone()); touch('all'); renderLeft(); },
    'Paste milestones', 'Milestone | Date (YYYY-MM-DD) | Status (Achieved/On Track/At Risk/Delayed) | Building | Note', rows => {
      for (const r of rows) {
        const m = newMilestone(r[0] || 'Milestone');
        m.date = r[1] || '';
        const s = (r[2] || '').toLowerCase();
        m.status = /achiev|done|complete/.test(s) ? 'done' : /risk/.test(s) ? 'risk' : /delay/.test(s) ? 'delayed' : 'ontrack';
        m.building = P.buildings.find(b => b.name.toLowerCase() === (r[3] || '').toLowerCase())?.id || null;
        m.note = r[4] || '';
        P.milestones.push(m);
      }
      return rows.length;
    }));
  if (!P.milestones.length) body.appendChild(h('div.empty-hint', 'Key dates (planned / achieved). They appear on the animated milestone timeline and in the PPT.'));
  P.milestones.forEach((m, i) => {
    body.appendChild(h('div.item', { style: { borderLeftColor: MILESTONE_STATUS[m.status]?.color } },
      itemHead(P.milestones, i, text(m, 'title', { after: 'all' })),
      row(field('Date', text(m, 'date', { type: 'date' })), field('Status', sel(m, 'status', Object.entries(MILESTONE_STATUS).map(([k, v]) => [k, v.label])))),
      row(field('Building', sel(m, 'building', buildingOptions(), { nullable: true })), field('Note', text(m, 'note')))));
  });
}

export { select };
