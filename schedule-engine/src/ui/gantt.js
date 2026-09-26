/* Schedule Engine - ui/gantt.js
 * Canvas Gantt chart synced with the grid: timescale, WBS bands, actual /
 * remaining / critical / baseline bars, milestones, Data Date line,
 * relationship lines and hover tooltips.
 */
(function () {
  'use strict';
  const D = SE.D;
  const { S, $, esc } = UI;
  const RH = 26;
  const PPD = { day: 26, week: 7, month: 2.4, quarter: 0.9, year: 0.33 };
  let C = {};
  let t0 = 0, t1 = 0, ppd = 2.4;
  let hoverUid = null;

  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    const g = (n) => cs.getPropertyValue(n).trim();
    C = {
      surface: g('--surface'), surface2: g('--surface-2'), surface3: g('--surface-3'), line: g('--line'), line2: g('--line-2'), ink: g('--ink'), ink2: g('--ink-2'), ink3: g('--ink-3'),
      select: g('--select'), hover: g('--hover'), brand: g('--brand'), brand2: g('--brand-2'),
      actual: g('--bar-actual'), remain: g('--bar-remain'), crit: g('--bar-crit'), base: g('--bar-base'), mile: g('--bar-mile'), sum: g('--bar-sum'), dd: g('--dd'),
      band: [g('--band0'), g('--band1'), g('--band2'), g('--band3'), g('--band4')], bandInk: [g('--band0-ink'), g('--band1-ink'), g('--band2-ink'), g('--band3-ink'), g('--band4-ink')],
      late: g('--tint-late'), over: g('--tint-over'), future: g('--tint-future'), invalid: g('--tint-invalid'),
      font: g('--font-cond') || 'Arial'
    };
  }
  const X = (d) => (d - t0) * ppd;

  function setRange() {
    const rg = SE.analysis.range(S.P);
    ppd = PPD[S.zoom] || 2.4;
    t0 = D.monthStart(rg.start) - (S.zoom === 'day' ? 7 : 31);
    if (S.zoom === 'year') t0 = D.dayOf(D.parts(rg.start).y, 0, 1);
    t1 = D.addMonths(rg.finish, S.zoom === 'year' ? 12 : 3);
  }

  function sizeCanvas(cv, w, hgt) {
    const dpr = window.devicePixelRatio || 1;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(hgt * dpr)) {
      cv.width = Math.round(w * dpr); cv.height = Math.round(hgt * dpr);
      cv.style.width = w + 'px'; cv.style.height = hgt + 'px';
    }
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  }

  function render(full) {
    if (!S.P || S.view !== 'gantt') return;
    if (full || !C.surface) readColors();
    setRange();
    const body = $('#ganttBody');
    const W = Math.max(50, body.clientWidth), H = Math.max(50, body.clientHeight);
    const totalW = X(t1) + 40, totalH = S.rows.length * RH + 40;
    const sp = $('#gspace');
    sp.style.width = totalW + 'px'; sp.style.height = totalH + 'px';
    const sl = body.scrollLeft, st = body.scrollTop;
    drawHeader(sl, W);
    const ctx = sizeCanvas($('#ganttCanvas'), W, H);
    ctx.fillStyle = C.surface; ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.translate(-sl, 0);
    const dStart = t0 + Math.floor(sl / ppd) - 1, dEnd = t0 + Math.ceil((sl + W) / ppd) + 1;
    // non-working shading (day / week zoom)
    const cal = S.P.cal(null);
    if (S.zoom === 'day' || S.zoom === 'week') {
      ctx.fillStyle = C.surface2;
      for (let d = dStart; d <= dEnd; d++) if (!cal.isWork(d)) ctx.fillRect(X(d), 0, ppd, H);
    }
    // grid lines
    ctx.strokeStyle = C.line; ctx.lineWidth = 1;
    ctx.beginPath();
    for (const d of ticks(dStart, dEnd).minor) { const x = Math.round(X(d)) + 0.5; ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    ctx.stroke();
    const first = Math.max(0, Math.floor(st / RH)), last = Math.min(S.rows.length, Math.ceil((st + H) / RH) + 1);
    const rowY = (i) => i * RH - st;
    // bands & rows
    for (let i = first; i < last; i++) {
      const r = S.rows[i];
      const y = rowY(i);
      if (r.kind === 'group') {
        const lv = Math.min(r.level, 4);
        ctx.globalAlpha = lv < 2 ? 0.14 : 0.55;
        ctx.fillStyle = C.band[lv];
        ctx.fillRect(sl, y, W, RH);
        ctx.globalAlpha = 1;
      } else {
        const a = r.a;
        if (S.sel === a.uid || S.multi.has(a.uid)) { ctx.fillStyle = C.select; ctx.fillRect(sl, y, W, RH); }
        else if (S.colorRows) {
          const f = S.fl.map.get(a.uid) || [];
          const t = f.includes('invalid') ? C.invalid : f.includes('overdue') ? C.over : f.includes('lateStart') ? C.late : f.includes('future') ? C.future : null;
          if (t) { ctx.globalAlpha = 0.55; ctx.fillStyle = t; ctx.fillRect(sl, y, W, RH); ctx.globalAlpha = 1; }
        }
      }
      ctx.fillStyle = C.line; ctx.fillRect(sl, y + RH - 1, W, 1);
    }
    // relationship lines (under bars)
    if (S.showRels) drawRels(ctx, first, last, rowY);
    const dd = S.P.meta.dataDate;
    ctx.font = '11px ' + C.font;
    ctx.textBaseline = 'middle';
    for (let i = first; i < last; i++) {
      const r = S.rows[i];
      const y = rowY(i);
      if (r.kind === 'group') {
        const s = r.sum;
        if (s.start == null || s.finish == null) continue;
        const x1 = X(s.start), x2 = X(s.finish + 1);
        const lv = Math.min(r.level, 4);
        ctx.fillStyle = lv < 2 ? C.brand : C.sum;
        ctx.fillRect(x1, y + 8, Math.max(2, x2 - x1), 5);
        ctx.beginPath(); ctx.moveTo(x1, y + 8); ctx.lineTo(x1 + 5, y + 8); ctx.lineTo(x1, y + 17); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(x2, y + 8); ctx.lineTo(x2 - 5, y + 8); ctx.lineTo(x2, y + 17); ctx.closePath(); ctx.fill();
        if (s.pct > 0) { ctx.fillStyle = C.actual; ctx.globalAlpha = 0.9; ctx.fillRect(x1, y + 14, (x2 - x1) * s.pct / 100, 3); ctx.globalAlpha = 1; }
        if (S.showLabels && x2 - sl < W) { ctx.fillStyle = C.ink2; ctx.fillText(r.label + '  ' + Math.round(s.pct) + '%', x2 + 6, y + RH / 2); }
        continue;
      }
      drawAct(ctx, r.a, y, dd);
    }
    // data date line
    const xd = Math.round(X(dd)) + 0.5;
    ctx.strokeStyle = C.dd; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.moveTo(xd, 0); ctx.lineTo(xd, H); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  function drawAct(ctx, a, y, dd) {
    const P = S.P;
    const s = P.startOf(a), f = P.finishOf(a);
    const top = y + 6, bh = 11;
    if (S.showBaseline && a.bl && a.bl.start != null && a.bl.finish != null && !P.isMilestone(a)) {
      ctx.fillStyle = C.base;
      ctx.fillRect(X(a.bl.start), y + RH - 7, Math.max(2, X(a.bl.finish + 1) - X(a.bl.start)), 3);
    }
    if (s == null || f == null) return;
    let endX;
    if (P.isMilestone(a)) {
      const cx = X(a.type === 'start' ? s : f + 1), cy = y + RH / 2 - 1, r = 6;
      ctx.fillStyle = a.status === 'CO' ? C.actual : a.crit ? C.crit : C.mile;
      ctx.beginPath(); ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy); ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r, cy); ctx.closePath(); ctx.fill();
      if (a.bl && a.bl.finish != null && S.showBaseline) {
        const bx = X((a.type === 'start' ? a.bl.start : a.bl.finish + 1));
        ctx.strokeStyle = C.base; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(bx, cy - 4); ctx.lineTo(bx + 4, cy); ctx.lineTo(bx, cy + 4); ctx.lineTo(bx - 4, cy); ctx.closePath(); ctx.stroke();
      }
      endX = cx + r;
    } else if (a.status === 'CO') {
      ctx.fillStyle = C.actual;
      roundRect(ctx, X(s), top, Math.max(2, X(f + 1) - X(s)), bh);
      endX = X(f + 1);
    } else {
      const rs = a.status === 'IP' ? Math.max(dd, a.rStart != null ? a.rStart : dd) : s;
      if (a.status === 'IP') {
        ctx.fillStyle = C.actual;
        roundRect(ctx, X(s), top, Math.max(2, X(dd) - X(s)), bh);
        // progress ticks along actual part
      }
      ctx.fillStyle = a.crit ? C.crit : C.remain;
      roundRect(ctx, X(rs), top, Math.max(2, X(f + 1) - X(rs)), bh);
      endX = X(f + 1);
      if (a.status === 'IP' && (a.pct || 0) > 0) {
        // % marker
        ctx.fillStyle = '#fff'; ctx.globalAlpha = 0.9;
        const px = X(s) + (X(f + 1) - X(s)) * a.pct / 100;
        ctx.fillRect(px - 1, top + 2, 2, bh - 4);
        ctx.globalAlpha = 1;
      }
    }
    if (hoverUid === a.uid) { ctx.strokeStyle = C.ink; ctx.lineWidth = 1; ctx.strokeRect(X(s) - 2, top - 2, Math.max(4, X(f + 1) - X(s)) + 4, bh + 4); }
    if (S.showLabels) {
      ctx.fillStyle = a.crit && a.status !== 'CO' ? C.crit : C.ink2;
      ctx.fillText(a.name + (a.status === 'IP' ? '  ' + Math.round(a.pct || 0) + '%' : ''), endX + 6, y + RH / 2);
    }
  }
  function roundRect(ctx, x, y, w, hh) {
    const r = Math.min(3, w / 2, hh / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + hh - r); ctx.quadraticCurveTo(x + w, y + hh, x + w - r, y + hh);
    ctx.lineTo(x + r, y + hh); ctx.quadraticCurveTo(x, y + hh, x, y + hh - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.fill();
  }

  function drawRels(ctx, first, last, rowY) {
    const P = S.P;
    const idx = new Map();
    const lo = Math.max(0, first - 60), hi = Math.min(S.rows.length, last + 60);
    for (let i = lo; i < hi; i++) { const r = S.rows[i]; if (r.kind === 'act') idx.set(r.a.uid, i); }
    ctx.lineWidth = 1;
    for (const [uid, i] of idx) {
      for (const rel of P.succsOf(uid)) {
        const j = idx.get(rel.succ);
        if (j == null) continue;
        if ((i < first && j < first) || (i >= last && j >= last)) continue;
        const p = P.act(uid), s = P.act(rel.succ);
        const pf = rel.type === 'SS' || rel.type === 'SF' ? X(P.startOf(p)) : X(P.finishOf(p) + (P.isMilestone(p) && p.type === 'start' ? 0 : 1));
        const sx = rel.type === 'FF' || rel.type === 'SF' ? X(P.finishOf(s) + 1) : X(P.startOf(s));
        const y1 = rowY(i) + RH / 2, y2 = rowY(j) + RH / 2;
        const crit = p.crit && s.crit && p.status !== 'CO';
        ctx.strokeStyle = crit ? C.crit : C.ink3;
        ctx.globalAlpha = crit ? 0.9 : 0.55;
        ctx.beginPath();
        const mid = rel.type === 'FF' || rel.type === 'SF' ? Math.max(pf, sx) + 8 : Math.min(pf + 8, sx - 4) < pf ? pf + 6 : Math.min(pf + 8, sx - 4);
        ctx.moveTo(pf, y1); ctx.lineTo(mid, y1); ctx.lineTo(mid, y2); ctx.lineTo(sx, y2);
        ctx.stroke();
        ctx.fillStyle = ctx.strokeStyle;
        const dir = sx >= mid ? 1 : -1;
        ctx.beginPath(); ctx.moveTo(sx, y2); ctx.lineTo(sx - 5 * dir, y2 - 3); ctx.lineTo(sx - 5 * dir, y2 + 3); ctx.closePath(); ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
  }

  function ticks(dStart, dEnd) {
    const major = [], minor = [];
    const z = S.zoom;
    if (z === 'day') {
      for (let d = dStart; d <= dEnd; d++) { minor.push(d); if (D.parts(d).d === 1) major.push(d); }
    } else if (z === 'week') {
      for (let d = dStart; d <= dEnd; d++) { if (D.weekday(d) === 1) minor.push(d); if (D.parts(d).d === 1) major.push(d); }
    } else if (z === 'month') {
      let m = D.monthStart(dStart);
      while (m <= dEnd) { minor.push(m); if (D.parts(m).m === 0) major.push(m); m = D.addMonths(m, 1); }
    } else if (z === 'quarter') {
      let m = D.monthStart(dStart);
      while (m <= dEnd) { if (D.parts(m).m % 3 === 0) minor.push(m); if (D.parts(m).m === 0) major.push(m); m = D.addMonths(m, 1); }
    } else {
      let m = D.monthStart(dStart);
      while (m <= dEnd) { if (D.parts(m).m % 3 === 0) minor.push(m); if (D.parts(m).m === 0) major.push(m); m = D.addMonths(m, 1); }
    }
    return { major, minor };
  }

  function drawHeader(sl, W) {
    const ctx = sizeCanvas($('#ganttHeadCanvas'), W, 46);
    ctx.fillStyle = C.brand; ctx.fillRect(0, 0, W, 46);
    ctx.fillStyle = C.brand2; ctx.fillRect(0, 0, W, 22);
    ctx.save(); ctx.translate(-sl, 0);
    const dStart = t0 + Math.floor(sl / ppd) - 40, dEnd = t0 + Math.ceil((sl + W) / ppd) + 40;
    ctx.font = '600 11px ' + C.font; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff';
    ctx.strokeStyle = 'rgba(255,255,255,.3)'; ctx.lineWidth = 1;
    const z = S.zoom;
    // top tier
    const topTicks = [];
    if (z === 'day' || z === 'week') { let m = D.monthStart(dStart); while (m <= dEnd) { topTicks.push([m, D.addMonths(m, 1), SE.MONTHS[D.parts(m).m] + ' ' + D.parts(m).y]); m = D.addMonths(m, 1); } }
    else { let y = D.parts(dStart).y; while (D.dayOf(y, 0, 1) <= dEnd) { topTicks.push([D.dayOf(y, 0, 1), D.dayOf(y + 1, 0, 1), String(y)]); y++; } }
    for (const [a, b, l] of topTicks) {
      ctx.beginPath(); ctx.moveTo(Math.round(X(a)) + 0.5, 0); ctx.lineTo(Math.round(X(a)) + 0.5, 46); ctx.stroke();
      const xa = Math.max(X(a), sl), xb = Math.min(X(b), sl + W);
      if (xb - xa > 30) ctx.fillText(l, xa + 6, 11);
    }
    // bottom tier
    ctx.font = '11px ' + C.font;
    const bottom = [];
    if (z === 'day') for (let d = dStart; d <= dEnd; d++) bottom.push([d, d + 1, String(D.parts(d).d)]);
    else if (z === 'week') for (let d = dStart; d <= dEnd; d++) { if (D.weekday(d) === 1) bottom.push([d, d + 7, String(D.parts(d).d)]); }
    else if (z === 'month') { let m = D.monthStart(dStart); while (m <= dEnd) { bottom.push([m, D.addMonths(m, 1), SE.MONTHS[D.parts(m).m]]); m = D.addMonths(m, 1); } }
    else if (z === 'quarter') { let m = D.monthStart(dStart); while (m <= dEnd) { const p = D.parts(m); if (p.m % 3 === 0) bottom.push([m, D.addMonths(m, 3), 'Q' + (p.m / 3 + 1)]); m = D.addMonths(m, 1); } }
    else { let m = D.monthStart(dStart); while (m <= dEnd) { const p = D.parts(m); if (p.m % 6 === 0) bottom.push([m, D.addMonths(m, 6), p.m ? 'H2' : 'H1']); m = D.addMonths(m, 1); } }
    for (const [a, b, l] of bottom) {
      ctx.beginPath(); ctx.moveTo(Math.round(X(a)) + 0.5, 22); ctx.lineTo(Math.round(X(a)) + 0.5, 46); ctx.stroke();
      const w = X(b) - X(a);
      if (w > ctx.measureText(l).width + 4) { ctx.textAlign = 'center'; ctx.fillText(l, X(a) + w / 2, 34); ctx.textAlign = 'left'; }
    }
    const dd = S.P.meta.dataDate;
    ctx.fillStyle = C.dd;
    const xd = X(dd);
    ctx.beginPath(); ctx.moveTo(xd - 6, 46); ctx.lineTo(xd + 6, 46); ctx.lineTo(xd, 38); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function rowAt(ev) {
    const body = $('#ganttBody');
    const r = body.getBoundingClientRect();
    const y = ev.clientY - r.top + body.scrollTop;
    const x = ev.clientX - r.left + body.scrollLeft;
    const i = Math.floor(y / RH);
    return { i, x, row: S.rows[i] };
  }
  function bind() {
    const body = $('#ganttBody');
    body.addEventListener('scroll', () => render(), { passive: true });
    body.addEventListener('mousemove', (ev) => {
      const { row, x } = rowAt(ev);
      const tip = $('#tip');
      if (!row || row.kind !== 'act') { tip.hidden = true; if (hoverUid) { hoverUid = null; render(); } return; }
      const a = row.a, P = S.P;
      const s = P.startOf(a), f = P.finishOf(a);
      const inBar = s != null && x >= X(s) - 8 && x <= X(f + 1) + 8;
      if (!inBar) { tip.hidden = true; if (hoverUid) { hoverUid = null; render(); } return; }
      if (hoverUid !== a.uid) { hoverUid = a.uid; render(); }
      const fl = (S.fl.map.get(a.uid) || []).filter((k) => !['lookahead', 'openEnd', 'due'].includes(k)).map((k) => SE.LENS_BY_KEY[k].short);
      tip.innerHTML = '<b>' + esc(a.code) + ' · ' + esc(a.name) + '</b><table>' +
        '<tr><td>Status</td><td>' + SE.STATUS[a.status] + (a.status === 'IP' ? ' · ' + Math.round(a.pct || 0) + '%' : '') + '</td></tr>' +
        '<tr><td>Start</td><td>' + D.fmtLong(s) + (a.aStart != null ? ' (actual)' : '') + '</td></tr>' +
        '<tr><td>Finish</td><td>' + D.fmtLong(f) + (a.aFinish != null ? ' (actual)' : '') + '</td></tr>' +
        (a.bl && a.bl.finish != null ? '<tr><td>Baseline</td><td>' + D.fmt(a.bl.start) + ' → ' + D.fmt(a.bl.finish) + '</td></tr>' : '') +
        (a.status !== 'CO' ? '<tr><td>Remaining</td><td>' + a.remDur + ' d · float ' + (a.tf == null ? '—' : a.tf + ' d') + (a.crit ? ' · critical' : '') + '</td></tr>' : '') +
        '<tr><td>Building</td><td>' + esc(P.dim(a, 'building')) + ' · ' + esc(P.dim(a, 'epc')) + '</td></tr>' +
        (fl.length ? '<tr><td>Flags</td><td>' + esc(fl.join(', ')) + '</td></tr>' : '') + '</table>';
      tip.hidden = false;
      const tr = tip.getBoundingClientRect();
      tip.style.left = Math.min(ev.clientX + 16, innerWidth - tr.width - 10) + 'px';
      tip.style.top = Math.min(ev.clientY + 14, innerHeight - tr.height - 10) + 'px';
    });
    body.addEventListener('mouseleave', () => { $('#tip').hidden = true; if (hoverUid) { hoverUid = null; render(); } });
    body.addEventListener('mousedown', (ev) => {
      const { row, i } = rowAt(ev);
      if (!row) return;
      if (row.kind === 'group') return;
      UI.grid.select(row.a.uid, i, ev.ctrlKey || ev.metaKey ? 'toggle' : ev.shiftKey ? 'range' : null);
    });
    body.addEventListener('dblclick', (ev) => {
      const { row } = rowAt(ev);
      if (row && row.kind === 'group') { if (S.collapsed.has(row.id)) S.collapsed.delete(row.id); else S.collapsed.add(row.id); UI.refresh({ noSave: true }); }
      else if (row) { S.detTab = 'status'; UI.panels.details(); }
    });
    body.addEventListener('contextmenu', (ev) => {
      const { row, i } = rowAt(ev);
      if (!row || row.kind !== 'act') return;
      ev.preventDefault();
      if (!S.multi.has(row.a.uid) && S.sel !== row.a.uid) UI.grid.select(row.a.uid, i);
      UI.panels.contextMenu(ev.clientX, ev.clientY, row.a);
    });
    body.addEventListener('wheel', (ev) => {
      if (!ev.ctrlKey) return;
      ev.preventDefault();
      const z = ['day', 'week', 'month', 'quarter', 'year'];
      const k = z.indexOf(S.zoom) + (ev.deltaY > 0 ? 1 : -1);
      if (k < 0 || k >= z.length) return;
      const rect = body.getBoundingClientRect();
      const dayAtMouse = t0 + (ev.clientX - rect.left + body.scrollLeft) / ppd;
      S.zoom = z[k];
      const zs = $('#zoomSel'); if (zs) zs.value = S.zoom;
      render(true);
      body.scrollLeft = X(dayAtMouse) - (ev.clientX - rect.left);
    }, { passive: false });
    window.addEventListener('resize', () => { if (S.P) { render(true); UI.grid.render(); } });
  }
  function fit() {
    const body = $('#ganttBody');
    const rg = SE.analysis.range(S.P);
    const span = rg.finish - rg.start + 60;
    const z = ['day', 'week', 'month', 'quarter', 'year'];
    S.zoom = z.find((k) => span * PPD[k] <= body.clientWidth - 20) || 'year';
    const zs = $('#zoomSel'); if (zs) zs.value = S.zoom;
    render(true);
    body.scrollLeft = 0;
  }
  function scrollToDay(d) {
    if (d == null) return;
    const body = $('#ganttBody');
    setRange();
    body.scrollLeft = Math.max(0, X(d) - body.clientWidth * 0.25);
    render();
  }

  UI.gantt = { render, bind, fit, scrollToDay, readColors };
})();
