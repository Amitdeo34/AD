/* Schedule Engine - ui/calendar.js
 * Click-and-select date picker used wherever a date is updated: grid cells,
 * Easy Update cards, the activity details panel and dialogs. Shows the Data
 * Date, the planned date, non-working days of the activity calendar and blocks
 * dates that are not allowed (actuals must be before the Data Date).
 */
(function () {
  'use strict';
  const D = SE.D;
  const h = (...a) => UI.h(...a);
  const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  let pop = null, state = null;

  function close() {
    if (!pop) return;
    pop.remove(); pop = null;
    document.removeEventListener('mousedown', outside, true);
    window.removeEventListener('resize', close);
    const s = state; state = null;
    if (s && s.onClose) s.onClose();
  }
  function outside(e) {
    if (!pop || pop.contains(e.target)) return;
    if (state && state.anchor && (state.anchor === e.target || state.anchor.contains(e.target))) return;
    if (state && state.keep && state.keep.contains(e.target)) return;
    close();
  }
  const isOpen = () => !!pop;

  /**
   * open(anchor, o): o = { value, min, max, dataDate, ref, refLabel, cal, title,
   *   quick:[[label, day|null]], onPick(day|null), onClose(), keep }
   */
  function open(anchor, o) {
    close();
    state = Object.assign({ anchor }, o);
    const dd = o.dataDate;
    let base = o.value != null ? o.value : o.ref != null ? o.ref : dd != null ? dd - 1 : D.todayDay();
    // open on a month that has selectable days
    if (o.max != null && base > o.max) base = o.max;
    if (o.min != null && base < o.min) base = o.min;
    const p0 = D.parts(base);
    state.y = p0.y; state.m = p0.m; state.focus = base;
    pop = h('div', { class: 'calpop', role: 'dialog', 'aria-label': o.title || 'Pick a date' });
    // clicks inside must not steal focus from the input being edited
    pop.addEventListener('mousedown', (e) => { if (e.target.tagName !== 'SELECT') e.preventDefault(); });
    document.body.append(pop);
    draw();
    place();
    setTimeout(() => { document.addEventListener('mousedown', outside, true); window.addEventListener('resize', close); }, 0);
  }
  function place() {
    if (!pop || !state) return;
    const r = state.anchor.getBoundingClientRect();
    const pw = pop.offsetWidth, ph = pop.offsetHeight;
    let left = Math.min(Math.max(8, r.left), innerWidth - pw - 8);
    let top = r.bottom + 4;
    if (top + ph > innerHeight - 8) top = Math.max(8, r.top - ph - 4);
    pop.style.left = left + 'px'; pop.style.top = top + 'px';
  }
  function allowed(d) {
    if (state.min != null && d < state.min) return false;
    if (state.max != null && d > state.max) return false;
    return true;
  }
  function pick(d) {
    if (d != null && !allowed(d)) return;
    const s = state;
    close();
    if (s.onPick) s.onPick(d);
  }
  function refocus() { if (state && state.keep && state.keep.focus) state.keep.focus({ preventScroll: true }); }
  function draw() {
    const s = state;
    pop.innerHTML = '';
    const first = D.dayOf(s.y, s.m, 1);
    const nextM = s.m === 11 ? D.dayOf(s.y + 1, 0, 1) : D.dayOf(s.y, s.m + 1, 1);
    const shift = (n) => { let m = s.m + n, y = s.y; while (m < 0) { m += 12; y--; } while (m > 11) { m -= 12; y++; } s.y = y; s.m = m; draw(); };
    const mSel = h('select', { 'aria-label': 'Month' }, MON.map((n, i) => h('option', { value: i, text: n })));
    mSel.value = s.m; mSel.onchange = () => { s.m = +mSel.value; draw(); refocus(); };
    const yNow = D.parts(s.dataDate != null ? s.dataDate : D.todayDay()).y;
    const ySel = h('select', { 'aria-label': 'Year' });
    for (let y = Math.min(s.y, yNow - 6); y <= Math.max(s.y, yNow + 6); y++) ySel.append(h('option', { value: y, text: y }));
    ySel.value = s.y; ySel.onchange = () => { s.y = +ySel.value; draw(); refocus(); };
    pop.append(h('div', { class: 'calhd' },
      h('button', { type: 'button', class: 'calnav', 'aria-label': 'Previous month', text: '‹', onclick: () => shift(-1) }),
      mSel, ySel,
      h('button', { type: 'button', class: 'calnav', 'aria-label': 'Next month', text: '›', onclick: () => shift(1) })));
    if (s.title) pop.append(h('div', { class: 'caltitle', text: s.title }));
    const grid = h('div', { class: 'calgrid', role: 'grid' });
    ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].forEach((w) => grid.append(h('span', { class: 'calw', text: w })));
    const lead = (D.parts(first).w + 6) % 7;
    const today = D.todayDay();
    for (let i = 0; i < lead; i++) grid.append(h('span'));
    for (let d = first; d < nextM; d++) {
      const ok = allowed(d);
      const cls = ['cald'];
      if (s.value === d) cls.push('sel');
      if (s.dataDate === d) cls.push('dd');
      if (s.ref === d) cls.push('ref');
      if (d === today) cls.push('today');
      if (s.cal && !s.cal.isWork(d)) cls.push('off');
      if (!ok) cls.push('no');
      const tip = D.fmtLong(d) + (s.dataDate === d ? ' · Data Date' : '') + (s.ref === d ? ' · ' + (s.refLabel || 'Plan') : '') + (s.cal && !s.cal.isWork(d) ? ' · non-working day' : '') + (!ok ? (s.max != null && d > s.max ? ' · actuals must be before the Data Date' : ' · not allowed') : '');
      grid.append(h('button', { type: 'button', class: cls.join(' '), text: String(D.parts(d).d), title: tip, disabled: !ok, 'aria-label': tip, onclick: () => pick(d) }));
    }
    pop.append(grid);
    const foot = h('div', { class: 'calft' });
    (s.quick || []).forEach(([label, d]) => { if (d == null || allowed(d)) foot.append(h('button', { type: 'button', class: 'btn sm', text: label, onclick: () => pick(d) })); });
    pop.append(foot);
    pop.append(h('div', { class: 'callg', html: '<i class="lg-dd"></i>Data Date' + (s.ref != null ? ' <i class="lg-ref"></i>' + UI.esc(s.refLabel || 'Plan') : '') + (s.cal ? ' <i class="lg-off"></i>Holiday / off' : '') }));
  }
  /** move the visible month to follow a date typed in the input */
  function follow(d) {
    if (!pop || d == null) return;
    const p = D.parts(d);
    state.value = d;
    state.y = p.y; state.m = p.m;
    draw();
  }

  /**
   * attach(input, opts|fn): adds a calendar button to a text date input. Picking a
   * date writes it as dd-Mmm-yy and fires 'change' so existing handlers apply it.
   */
  function attach(input, opts) {
    const get = () => Object.assign({}, typeof opts === 'function' ? opts() : opts || {});
    const btn = h('button', { type: 'button', class: 'calbtn', title: 'Pick from calendar', 'aria-label': 'Open calendar', html: '&#128197;' });
    const wrap = h('span', { class: 'datewrap' });
    const show = () => {
      if (input.disabled) return;
      if (isOpen() && state && state.anchor === wrap) { close(); return; }
      const o = get();
      const cur = D.parseDate(input.value);
      const S = UI.S, P = S && S.P;
      const dd = P ? P.meta.dataDate : null;
      open(wrap, Object.assign({
        value: cur ? cur.day : null, dataDate: dd, keep: input,
        quick: [['Clear', null]],
        onPick: (d) => { input.value = d == null ? '' : D.fmt(d); input.dispatchEvent(new Event('change', { bubbles: true })); input.dispatchEvent(new Event('input', { bubbles: true })); }
      }, o));
    };
    btn.addEventListener('mousedown', (e) => e.preventDefault());
    btn.addEventListener('click', (e) => { e.stopPropagation(); show(); });
    input.addEventListener('click', () => { if (!isOpen() || !state || state.anchor !== wrap) show(); });
    input.addEventListener('keydown', (e) => { if ((e.key === 'ArrowDown' && e.altKey) || e.key === 'F4') { e.preventDefault(); show(); } else if (e.key === 'Escape' || e.key === 'Tab') close(); });
    input.addEventListener('input', () => { if (isOpen() && state && state.anchor === wrap) { const p = D.parseDate(input.value); if (p) follow(p.day); } });
    input.addEventListener('blur', () => setTimeout(() => { if (isOpen() && state && state.anchor === wrap && document.activeElement !== input && !pop.contains(document.activeElement)) close(); }, 150));
    input.classList.add('has-cal');
    btn.disabled = !!input.disabled;
    // wrap after the input is in the DOM (or immediately if it already is)
    const doWrap = () => { if (input.parentNode && input.parentNode !== wrap) { input.parentNode.insertBefore(wrap, input); wrap.append(input, btn); } };
    if (input.parentNode) doWrap(); else { wrap.append(input, btn); }
    input._calWrap = wrap;
    return wrap;
  }

  /** options for an activity date field (aStart / aFinish / expFinish) */
  function actOpts(P, a, key) {
    const dd = P.meta.dataDate;
    const ref = key === 'aStart' ? P.refStart(a) : P.refFinish(a);
    const quick = [];
    if (key === 'expFinish') {
      const c = P.cal(a);
      [7, 14, 30].forEach((n) => quick.push(['+' + n + 'd', c.add(c.next(dd), n)]));
    } else {
      if (ref != null && ref < dd) quick.push(['Plan ' + D.fmt(ref), ref]);
      if (key === 'aFinish' && a.aStart != null && a.origDur) { const f = P.cal(a).finishFrom(P.cal(a).next(a.aStart), a.origDur); if (f < dd) quick.push(['As per duration ' + D.fmt(f), f]); }
      quick.push(['DD-1 ' + D.fmt(dd - 1), dd - 1]);
      quick.push(['Clear', null]);
    }
    return {
      title: (key === 'aStart' ? 'Actual Start' : key === 'aFinish' ? 'Actual Finish' : 'Expected Finish') + ' · ' + a.code,
      ref, refLabel: 'Plan', cal: P.cal(a), dataDate: dd,
      max: key === 'expFinish' ? null : dd - 1, min: key === 'expFinish' ? dd : (key === 'aFinish' && a.aStart != null ? a.aStart : null),
      quick
    };
  }

  UI.cal = { open, close, attach, follow, isOpen, actOpts };
})();
