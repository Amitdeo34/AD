// Form controls bound directly to project objects. Every edit calls touch() so the stage redraws live.
import { h } from '../util.js';
import { touch } from '../state.js';

const changed = (o, live) => { touch(live ? (o.what || 'stage') : (o.after || 'story')); o.onChange && o.onChange(); };

export function field(label, control, hint) {
  return h('label.field', h('span.field-label', label), control, hint ? h('span.field-hint', hint) : null);
}

export function row(...kids) { return h('div.row', kids); }

export function text(obj, key, o = {}) {
  const el = h(o.multiline ? 'textarea' : 'input', {
    value: obj[key] ?? '', placeholder: o.placeholder || '', type: o.multiline ? null : (o.type || 'text'),
    rows: o.rows || 3, spellcheck: false,
  });
  el.addEventListener('input', () => { obj[key] = el.value; changed(o, true); });
  el.addEventListener('change', () => changed(o, false));
  return el;
}

export function num(obj, key, o = {}) {
  const el = h('input', { type: 'number', value: obj[key] ?? '', min: o.min, max: o.max, step: o.step ?? 'any' });
  const read = () => {
    let v = parseFloat(el.value);
    if (isNaN(v)) return;
    if (o.min != null) v = Math.max(o.min, v);
    if (o.max != null) v = Math.min(o.max, v);
    obj[key] = o.int ? Math.round(v) : v;
  };
  el.addEventListener('input', () => { read(); changed(o, true); });
  el.addEventListener('change', () => { read(); el.value = obj[key]; changed(o, false); });
  return el;
}

export function select(obj, key, options, o = {}) {
  const el = h('select', options.map(([v, label]) => h('option', { value: v ?? '' }, label)));
  el.value = obj[key] ?? '';
  el.addEventListener('change', () => {
    const v = el.value;
    obj[key] = v === '' && o.nullable ? null : (o.number ? +v : v);
    touch(o.what || 'all');
    o.onChange && o.onChange(v);
  });
  return el;
}

export function check(obj, key, label, o = {}) {
  const el = h('input', { type: 'checkbox', checked: !!obj[key] });
  el.addEventListener('change', () => { obj[key] = el.checked; touch(o.what || 'all'); o.onChange && o.onChange(); });
  return h('label.check', el, h('span', label));
}

export function color(obj, key, o = {}) {
  const el = h('input', { type: 'color', value: obj[key] || o.fallback || '#3B82F6' });
  el.addEventListener('input', () => { obj[key] = el.value; changed(o, true); });
  el.addEventListener('change', () => changed(o, false));
  return el;
}

export function range(obj, key, o = {}) {
  const out = h('span.range-val', (o.fmt || (v => v))(obj[key] ?? o.min));
  const el = h('input', { type: 'range', min: o.min, max: o.max, step: o.step || 1, value: obj[key] ?? o.min });
  el.addEventListener('input', () => { obj[key] = parseFloat(el.value); out.textContent = (o.fmt || (v => v))(obj[key]); changed(o, true); });
  el.addEventListener('change', () => changed(o, false));
  return h('div.range', el, out);
}

export function button(label, onclick, cls = '') {
  return h('button' + (cls ? '.' + cls.split(' ').join('.') : ''), { type: 'button', onclick }, label);
}

export function section(title, ...kids) {
  return h('section.insp-section', title ? h('h4', title) : null, kids);
}
