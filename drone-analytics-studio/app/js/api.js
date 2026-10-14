// Thin wrapper over the local engine's HTTP API.

async function req(method, url, body, raw = false) {
  const opt = { method, headers: {} };
  if (body !== undefined) {
    if (raw) opt.body = body;
    else { opt.body = JSON.stringify(body); opt.headers['Content-Type'] = 'application/json'; }
  }
  const r = await fetch(url, opt);
  let data = null;
  try { data = await r.json(); } catch { /* empty */ }
  if (!r.ok) throw new Error((data && data.error) || `${r.status} ${r.statusText}`);
  return data;
}

const enc = encodeURIComponent;

export const api = {
  info: () => req('GET', '/api/info'),
  projects: () => req('GET', '/api/projects'),
  create: project => req('POST', '/api/projects', project),
  load: pid => req('GET', `/api/p/${pid}`),
  save: (pid, project) => req('PUT', `/api/p/${pid}`, project),
  remove: pid => req('DELETE', `/api/p/${pid}`),
  demo: () => req('POST', '/api/demo', {}),
  pickFolder: initial => req('POST', '/api/pick-folder', { initial }),
  checkFolder: path => req('POST', '/api/check-folder', { path }),
  open: (pid, what) => req('POST', `/api/p/${pid}/open`, { what }),
  media: pid => req('GET', `/api/p/${pid}/media`),
  proxy: (pid, path) => req('POST', `/api/p/${pid}/proxy`, { path }),
  snapshot: (pid, path, t) => req('POST', `/api/p/${pid}/snapshot`, { path, t }),
  exports: pid => req('GET', `/api/p/${pid}/exports`),
  newJob: () => req('POST', '/api/job', {}),
  upload: (pid, q, blob) => req('POST', `/api/p/${pid}/upload?` + new URLSearchParams(q), blob, true),
  pptx: (pid, body) => req('POST', `/api/p/${pid}/pptx`, body),

  renderStart: (pid, settings) => req('POST', `/api/p/${pid}/render/start`, settings),
  renderOverlay: (job, i, blob) => req('POST', `/api/render/${job}/overlay/${i}`, blob, true),
  renderVideo: (job, i, spec) => req('POST', `/api/render/${job}/video/${i}`, spec),
  framesBegin: (job, i, count) => req('POST', `/api/render/${job}/frames/${i}/begin`, { count }),
  framesData: (job, i, blob) => req('POST', `/api/render/${job}/frames/${i}/data`, blob, true),
  framesEnd: (job, i) => req('POST', `/api/render/${job}/frames/${i}/end`, {}),
  renderFinish: (job, body) => req('POST', `/api/render/${job}/finish`, body),
  renderCancel: job => req('POST', `/api/render/${job}/cancel`, {}),

  fileUrl: (pid, path, proxy = false, v = '') => `/api/p/${pid}/file?path=${enc(path)}${proxy ? '&proxy=1' : ''}${v ? '&v=' + enc(v) : ''}`,
  thumbUrl: (pid, path, t = 1, w = 320) => `/api/p/${pid}/thumb?path=${enc(path)}&t=${(+t || 0).toFixed(2)}&w=${w}`,
  frameUrl: (pid, path, t = 0, w = 1920) => `/api/p/${pid}/frame?path=${enc(path)}&t=${(+t || 0).toFixed(4)}&w=${w}`,
  exportUrl: (pid, name, dl) => `/api/p/${pid}/exports/file?name=${enc(name)}${dl ? '&dl=1' : ''}`,
};
