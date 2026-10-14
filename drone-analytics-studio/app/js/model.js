// Project data model: defaults, factories, migration and lookups.
import { uid } from './util.js';

export const DEFAULT_STAGES = [
  { id: 'ns', name: 'Not Started', color: '#94A3B8' },
  { id: 'exc', name: 'Excavation', color: '#EAB308' },
  { id: 'fdn', name: 'Foundation', color: '#F97316' },
  { id: 'str', name: 'Superstructure', color: '#3B82F6' },
  { id: 'fin', name: 'Finishing', color: '#A855F7' },
  { id: 'done', name: 'Completed', color: '#22C55E' },
  { id: 'hold', name: 'On Hold', color: '#78716C' },
];

export const CRITICAL = '#FF3B30';
export const SEVERITY = {
  high: { label: 'High', color: '#EF4444' },
  medium: { label: 'Medium', color: '#F59E0B' },
  low: { label: 'Low', color: '#3B82F6' },
};
export const MILESTONE_STATUS = {
  done: { label: 'Achieved', color: '#22C55E' },
  ontrack: { label: 'On Track', color: '#3B82F6' },
  risk: { label: 'At Risk', color: '#F59E0B' },
  delayed: { label: 'Delayed', color: '#EF4444' },
};

export const SCENE_TYPES = {
  title: { label: 'Title card', icon: '🎬', dur: 6 },
  clip: { label: 'Drone clip', icon: '🎥' },
  photo: { label: 'Photo analysis', icon: '🖼️', dur: 9 },
  compare: { label: 'Before / After', icon: '◧', dur: 8 },
  summary: { label: 'Status summary', icon: '📊', dur: 10 },
  concerns: { label: 'Concerns', icon: '⚠️', dur: 10 },
  milestones: { label: 'Milestones', icon: '🏁', dur: 9 },
  end: { label: 'End card', icon: '✨', dur: 5 },
};

export function newProject({ name = 'New Project', site = '', surveyDate = '', surveyLabel = '', mediaDir = '' } = {}) {
  return normalize({
    version: 1,
    mediaDir,
    info: { name, site, surveyDate: surveyDate || new Date().toISOString().slice(0, 10), surveyLabel },
    scenes: [newScene('title'), newScene('summary'), newScene('concerns'), newScene('milestones'), newScene('end')],
  });
}

export function newScene(type, extra = {}) {
  const base = { id: uid('s'), type };
  if (type === 'clip') return Object.assign(base, { path: '', in: 0, out: 10, caption: '', sub: '', freezes: [] }, extra);
  if (type === 'photo') return Object.assign(base, { path: '', dur: 9, caption: '', sub: '', zoom: 1.04, title: '', highlights: [], panel: true, anns: [] }, extra);
  if (type === 'compare') return Object.assign(base, { a: { path: '', t: 0, label: 'Before' }, b: { path: '', t: 0, label: 'After' }, dur: 8, caption: 'Progress comparison', sub: '' }, extra);
  return Object.assign(base, { dur: SCENE_TYPES[type]?.dur || 6, title: '', sub: '' }, extra);
}

export function newFreeze(t) {
  return { id: uid('f'), t, hold: 7, zoom: 1.04, title: '', highlights: [], panel: true, anns: [] };
}

export function newBuilding(name = 'New building') {
  return { id: uid('b'), name, stage: 'ns', progress: 0, floors: '', critical: false, remarks: '' };
}
export function newConcern(title = 'New concern') {
  return { id: uid('c'), title, detail: '', severity: 'high', building: null, action: '', owner: '', due: '' };
}
export function newMilestone(title = 'New milestone') {
  return { id: uid('m'), title, date: '', status: 'ontrack', building: null, note: '' };
}

// Fill in anything missing so old / hand-written project files always open.
export function normalize(p) {
  p.version = 1;
  p.mediaDir = p.mediaDir || '';
  p.exportDir = p.exportDir || '';
  p.info = Object.assign({
    name: 'Project', site: '', client: '', surveyDate: '', surveyLabel: '', preparedBy: '', company: '',
    accent: '#1F4E9E', labelColor: '#0B78D6', zoneColor: '#1F5BC4', markerColor: '#E5202E',
    overline: 'DRONE PROGRESS REPORT', highlightsLabel: 'KEY HIGHLIGHTS', logo: null, cover: null, music: null,
    musicVolume: 0.6, nextSurvey: '',
  }, p.info || {});
  p.stages = p.stages && p.stages.length ? p.stages : DEFAULT_STAGES.map(s => ({ ...s }));
  p.buildings = p.buildings || [];
  p.concerns = p.concerns || [];
  p.milestones = p.milestones || [];
  p.scenes = p.scenes || [];
  for (const s of p.scenes) {
    if (!s.id) s.id = uid('s');
    if (s.type === 'clip') {
      s.freezes = s.freezes || [];
      for (const f of s.freezes) { f.id = f.id || uid('f'); fixAnalysis(f); }
    }
    if (s.type === 'photo') fixAnalysis(s);
  }
  p.settings = Object.assign({ width: 1920, height: 1080, fps: 30, quality: 'high', encoder: 'auto', transitions: true, autoProxy: true, chrome: true, theme: 'corporate' }, p.settings || {});
  if (!p.settings.zoneColors) p.settings.zoneColors = p.settings.theme === 'corporate' ? 'brand' : 'stage';
  return p;
}

function fixAnalysis(an) {
  an.anns = an.anns || [];
  an.anns.forEach(a => { a.id = a.id || uid('a'); });
  if (!Array.isArray(an.highlights)) {
    an.highlights = String(an.notes || '').split('\n').map(l => l.trim()).filter(Boolean).map(l => {
      const m = l.split(/\s+[|–—]\s+|:\s+/);
      return { title: m[0], detail: m.slice(1).join(' — ') };
    });
  }
  delete an.notes;
}

// ------------------------------------------------------------------ lookups
export const stageOf = (p, id) => p.stages.find(s => s.id === id) || { id, name: id || '—', color: '#94A3B8' };
export const buildingOf = (p, id) => (id ? p.buildings.find(b => b.id === id) : null) || null;
export const concernOf = (p, id) => (id ? p.concerns.find(c => c.id === id) : null) || null;
export const concernNo = (p, id) => p.concerns.findIndex(c => c.id === id) + 1;
export const sceneLabel = s => s.caption || s.title || SCENE_TYPES[s.type]?.label || s.type;
export const isCorporate = p => p.settings.theme !== 'cinematic';

export function zoneInfo(p, a) {
  const b = buildingOf(p, a.building);
  if (b) {
    const st = stageOf(p, b.stage);
    const base = p.settings.zoneColors === 'brand' ? p.info.zoneColor : st.color;
    return { title: a.label || b.name, building: b, stage: st, critical: !!b.critical, color: a.color || (b.critical ? CRITICAL : base) };
  }
  return { title: a.label || '', building: null, stage: null, critical: false, color: a.color || p.info.zoneColor || p.info.accent };
}

export function pinInfo(p, a) {
  const c = concernOf(p, a.concern);
  const sev = SEVERITY[(c && c.severity) || a.severity] || SEVERITY.high;
  return {
    badge: c ? 'C' + concernNo(p, c.id) : '!',
    title: c ? c.title : (a.text || 'Concern'),
    sev, concern: c, color: sev.color,
    building: c ? buildingOf(p, c.building) : null,
  };
}

// Iterate every analysis (freezes in clips + photo scenes) in storyboard order.
export function* analyses(p) {
  for (const s of p.scenes) {
    if (s.type === 'clip') for (const f of [...s.freezes].sort((a, b) => a.t - b.t)) yield { scene: s, an: f, kind: 'freeze', path: s.path, t: f.t };
    if (s.type === 'photo') yield { scene: s, an: s, kind: 'photo', path: s.path, t: 0 };
  }
}

export function overallProgress(p) {
  if (!p.buildings.length) return 0;
  return Math.round(p.buildings.reduce((a, b) => a + (+b.progress || 0), 0) / p.buildings.length);
}

// Cover image for title / dashboard backgrounds: explicit cover, else first photo or clip frame.
export function coverRef(p) {
  if (p.info.cover && p.info.cover.path) return p.info.cover;
  for (const s of p.scenes) {
    if (s.type === 'photo' && s.path) return { path: s.path, t: 0 };
    if (s.type === 'clip' && s.path) return { path: s.path, t: s.freezes[0]?.t ?? (s.in + Math.min(2, (s.out - s.in) / 2)) };
  }
  return null;
}
