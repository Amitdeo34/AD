// Minimal modal dialog. buttons: [label, onClick, 'primary'?]
import { h } from '../util.js';

export function modal(title, content, buttons = [], opts = {}) {
  const close = () => { back.remove(); document.removeEventListener('keydown', onKey); opts.onClose && opts.onClose(); };
  const onKey = e => { if (e.key === 'Escape' && !opts.locked) close(); };
  const box = h('div.modal' + (opts.wide ? '.wide' : ''),
    h('div.modal-head', h('h3', title), opts.locked ? null : h('button.icon', { onclick: close, title: 'Close' }, '✕')),
    h('div.modal-body', content),
    buttons.length ? h('div.modal-foot', buttons.map(([label, fn, cls]) => h('button' + (cls ? '.' + cls : ''), { onclick: fn }, label))) : null);
  const back = h('div.modal-back', { onclick: e => { if (e.target === back && !opts.locked) close(); } }, box);
  document.body.appendChild(back);
  document.addEventListener('keydown', onKey);
  return { close, box, body: box.querySelector('.modal-body'), foot: box.querySelector('.modal-foot') };
}
