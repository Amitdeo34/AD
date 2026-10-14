// Shared application state and a tiny event bus.

export const app = {
  info: null,          // engine info (/api/info)
  pid: null,           // open project id
  P: null,             // open project data
  media: [],           // media folder listing
  mediaDir: { dir: '', exists: false },
  sel: { scene: null, freeze: null, ann: null },  // ids
  view: null,          // { media: path } when browsing a media file
  tool: 'select',
  leftTab: 'media',
  assets: null,        // preview image cache
  stage: null,
};

const hooks = {};
export function on(name, fn) { (hooks[name] ||= []).push(fn); }
export function emit(name, ...args) { return (hooks[name] || []).map(f => f(...args)); }

// Data changed. `what` lists the areas to refresh: stage | story | insp | left | all
export function touch(what = 'stage') { emit('touch', what); }

export const scene = () => app.P?.scenes.find(s => s.id === app.sel.scene) || null;
export const freeze = () => {
  const s = scene();
  return s && s.type === 'clip' ? s.freezes.find(f => f.id === app.sel.freeze) || null : null;
};
// The analysis being edited: a freeze, or a photo scene itself.
export function analysis() {
  const s = scene();
  if (!s) return null;
  if (s.type === 'photo') return { an: s, kind: 'photo', scene: s, path: s.path, t: 0 };
  const f = freeze();
  return f ? { an: f, kind: 'freeze', scene: s, path: s.path, t: f.t } : null;
}
export const annotation = () => analysis()?.an.anns.find(a => a.id === app.sel.ann) || null;
export const mediaItem = path => app.media.find(m => m.path === path) || null;

export function select(sceneId, freezeId = null, annId = null) {
  app.sel = { scene: sceneId, freeze: freezeId, ann: annId };
  app.view = null;
  emit('select');
}
