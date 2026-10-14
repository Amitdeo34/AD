// Small shared helpers (no dependencies, works offline).

export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const easeOut = t => 1 - Math.pow(1 - clamp(t), 3);
export const easeIn = t => Math.pow(clamp(t), 3);
export const easeInOut = t => { t = clamp(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
export const easeSine = t => 0.5 - 0.5 * Math.cos(Math.PI * clamp(t));
export const easeBack = t => { t = clamp(t); const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
export const ramp = (t, a, d) => clamp((t - a) / d);

export const uid = (p = '') => p + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);

export function fmtTime(s, frac = true) {
  if (!isFinite(s)) s = 0;
  const neg = s < 0; s = Math.abs(s);
  const m = Math.floor(s / 60), sec = s - m * 60;
  const t = `${String(m).padStart(2, '0')}:${frac ? sec.toFixed(2).padStart(5, '0') : String(Math.floor(sec)).padStart(2, '0')}`;
  return neg ? '-' + t : t;
}

export function fmtBytes(n) {
  if (n > 1e9) return (n / 1e9).toFixed(1) + ' GB';
  if (n > 1e6) return (n / 1e6).toFixed(0) + ' MB';
  return Math.max(1, Math.round(n / 1e3)) + ' KB';
}

export function fmtDate(iso, style = 'short') {
  if (!iso) return '';
  const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''));
  if (isNaN(d)) return iso;
  const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()];
  if (style === 'month') return `${m} ${d.getFullYear()}`;
  if (style === 'dm') return `${d.getDate()} ${m}`;
  if (style === 'dmy') return `${String(d.getDate()).padStart(2, '0')}-${m}-${String(d.getFullYear()).slice(-2)}`;
  return `${d.getDate()} ${m} ${d.getFullYear()}`;
}

export function debounce(fn, ms) {
  let t;
  const f = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  f.flush = (...a) => { clearTimeout(t); fn(...a); };
  f.cancel = () => clearTimeout(t);
  return f;
}

export function hexToRgb(hex) {
  let h = (hex || '#888888').replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export const rgba = (hex, a) => { const [r, g, b] = hexToRgb(hex); return `rgba(${r},${g},${b},${a})`; };

export function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out.length ? out : [[]];
}

export const deepClone = o => JSON.parse(JSON.stringify(o));

// Tiny DOM builder: h('div.cls#id', {onclick, style, ...attrs}, children...)
export function h(sel, props, ...kids) {
  const m = sel.match(/^([a-z0-9-]+)?((?:[.#][\w-]+)*)$/i);
  const el = document.createElement(m && m[1] ? m[1] : 'div');
  if (m && m[2]) for (const part of m[2].match(/[.#][\w-]+/g) || []) {
    if (part[0] === '.') el.classList.add(part.slice(1)); else el.id = part.slice(1);
  }
  if (props && (typeof props !== 'object' || props instanceof Node || Array.isArray(props))) { kids.unshift(props); props = null; }
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'class') el.className += ' ' + v;
    else if (k === 'html') el.innerHTML = v;
    else if (k in el && k !== 'list' && k !== 'type') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  const add = c => {
    if (c == null || c === false) return;
    if (Array.isArray(c)) c.forEach(add);
    else el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  };
  kids.forEach(add);
  return el;
}

export function toast(msg, kind = 'info', ms = 3200) {
  let box = document.getElementById('toasts');
  if (!box) { box = h('div#toasts'); document.body.appendChild(box); }
  const t = h('div.toast.' + kind, msg);
  box.appendChild(t);
  setTimeout(() => t.classList.add('out'), ms);
  setTimeout(() => t.remove(), ms + 400);
}

// Parse text pasted from Excel / Google Sheets (TSV) or CSV into rows of cells.
export function parseTable(text) {
  const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim());
  const sep = lines.some(l => l.includes('\t')) ? '\t' : ',';
  return lines.map(l => {
    if (sep === '\t') return l.split('\t').map(c => c.trim());
    const out = []; let cur = '', q = false;
    for (const ch of l) {
      if (ch === '"') q = !q;
      else if (ch === ',' && !q) { out.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    out.push(cur.trim());
    return out;
  });
}
