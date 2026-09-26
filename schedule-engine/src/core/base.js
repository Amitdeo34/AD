/* Schedule Engine - core/base.js
 * Namespace, date handling and working-day calendars.
 *
 * Dates are held as integer DAY NUMBERS (days since 1970-01-01, UTC, no
 * time-of-day) so that scheduling never suffers from time zones or DST.
 * Times of day only matter when reading/writing XER and are carried by the
 * calendar (work start / work end).
 */
(function (SE) {
  'use strict';

  const DAY = 86400000;
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MON_IDX = {};
  MON.forEach((m, i) => { MON_IDX[m.toLowerCase()] = i; });
  ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
    .forEach((m, i) => { MON_IDX[m] = i; MON_IDX[m.slice(0, 4)] = i; });
  MON_IDX.sept = 8;

  function dayOf(y, m, d) { return Math.floor(Date.UTC(y, m, d) / DAY); }
  function parts(day) {
    const dt = new Date(day * DAY);
    return { y: dt.getUTCFullYear(), m: dt.getUTCMonth(), d: dt.getUTCDate(), w: dt.getUTCDay() };
  }
  function weekday(day) { return ((day % 7) + 7 + 4) % 7; } // 1970-01-01 was a Thursday (4)
  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  /** P6 style: 30-Sep-26 */
  function fmt(day) {
    if (day == null || !isFinite(day)) return '';
    const p = parts(day);
    return pad(p.d) + '-' + MON[p.m] + '-' + pad(p.y % 100);
  }
  /** Long form: 30-Sep-2026 */
  function fmtLong(day) {
    if (day == null || !isFinite(day)) return '';
    const p = parts(day);
    return pad(p.d) + '-' + MON[p.m] + '-' + p.y;
  }
  function fmtISO(day) {
    if (day == null || !isFinite(day)) return '';
    const p = parts(day);
    return p.y + '-' + pad(p.m + 1) + '-' + pad(p.d);
  }
  function monthLabel(day) { const p = parts(day); return MON[p.m] + '-' + pad(p.y % 100); }

  /** XER datetime "2026-09-30 17:00" -> {day, min} */
  function parseXerDT(s) {
    if (!s) return null;
    const m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/.exec(String(s).trim());
    if (!m) return null;
    return { day: dayOf(+m[1], +m[2] - 1, +m[3]), min: m[4] ? (+m[4]) * 60 + (+m[5]) : 0 };
  }
  function fmtXerDT(day, min) {
    if (day == null) return '';
    min = min || 0;
    return fmtISO(day) + ' ' + pad(Math.floor(min / 60)) + ':' + pad(min % 60);
  }

  function excelSerialToDay(n) { return Math.floor(n) - 25569; } // 1899-12-30 based
  function dayToExcelSerial(day) { return day + 25569; }

  function twoDigitYear(y) { return y < 100 ? (y < 70 ? 2000 + y : 1900 + y) : y; }

  /**
   * Parse almost any human / P6 / Excel date representation into a day number.
   * Returns {day, actual:boolean, constraint:boolean} or null.
   * Accepts: 30-Sep-26, 30-Sep-2026, 30 Sep 26, 2026-09-30, 30/09/2026 (Indian dd/mm),
   * 30.09.26, Sep 30 2026, Excel serials, JS Date objects, "30-Sep-26 A", "30-Sep-26*".
   */
  function parseDate(v, opts) {
    opts = opts || {};
    if (v == null || v === '') return null;
    if (v instanceof Date) {
      if (isNaN(v)) return null;
      return { day: dayOf(v.getFullYear(), v.getMonth(), v.getDate()), actual: false, constraint: false };
    }
    if (typeof v === 'number') {
      if (v > 20000 && v < 80000) return { day: excelSerialToDay(v), actual: false, constraint: false };
      return null;
    }
    let s = String(v).trim();
    if (!s) return null;
    let actual = false, constraint = false;
    if (/\s*\*\s*$/.test(s)) { constraint = true; s = s.replace(/\s*\*\s*$/, ''); }
    if (/\s+A$/i.test(s) || /[^A-Za-z]A$/.test(s)) { actual = true; s = s.replace(/\s*A$/i, ''); }
    if (/\s*\*\s*$/.test(s)) { constraint = true; s = s.replace(/\s*\*\s*$/, ''); }
    s = s.trim();
    let m;
    // ISO / XER
    if ((m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?/.exec(s))) {
      return { day: dayOf(+m[1], +m[2] - 1, +m[3]), actual, constraint };
    }
    // 30-Sep-26, 30 Sep 2026, 30-Sept-2026, 30Sep26
    if ((m = /^(\d{1,2})[\s\-/.]*([A-Za-z]{3,9})[\s\-/.,]*(\d{2,4})(?:\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)?$/i.exec(s))) {
      const mi = MON_IDX[m[2].toLowerCase()];
      if (mi == null) return null;
      return { day: dayOf(twoDigitYear(+m[3]), mi, +m[1]), actual, constraint };
    }
    // Sep 30, 2026
    if ((m = /^([A-Za-z]{3,9})[\s\-/.]+(\d{1,2}),?[\s\-/.]+(\d{2,4})/.exec(s))) {
      const mi = MON_IDX[m[1].toLowerCase()];
      if (mi == null) return null;
      return { day: dayOf(twoDigitYear(+m[3]), mi, +m[2]), actual, constraint };
    }
    // Numeric d/m/y (Indian default) or m/d/y when opts.mdy
    if ((m = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})(?:\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)?$/i.exec(s))) {
      let a = +m[1], b = +m[2];
      let d = a, mo = b;
      if (opts.mdy) { d = b; mo = a; }
      if (mo > 12 && d <= 12) { const t = d; d = mo; mo = t; }
      if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
      return { day: dayOf(twoDigitYear(+m[3]), mo - 1, d), actual, constraint };
    }
    // Bare Excel serial in text
    if (/^\d{5}(\.\d+)?$/.test(s)) {
      const n = parseFloat(s);
      if (n > 20000 && n < 80000) return { day: excelSerialToDay(n), actual, constraint };
    }
    return null;
  }
  function parseDay(v, opts) { const r = parseDate(v, opts); return r ? r.day : null; }

  function todayDay() { const n = new Date(); return dayOf(n.getFullYear(), n.getMonth(), n.getDate()); }
  function monthStart(day) { const p = parts(day); return dayOf(p.y, p.m, 1); }
  function addMonths(day, n) { const p = parts(day); return dayOf(p.y, p.m + n, 1); }
  function monthEnd(day) { return addMonths(day, 1) - 1; }

  /* ------------------------------------------------------------------ *
   * Working-day calendar
   * ------------------------------------------------------------------ */
  const CAL_BASE = dayOf(1985, 0, 1);
  const CAL_END = dayOf(2105, 0, 1);

  class Calendar {
    /**
     * @param {object} o {id, name, workWeek:[7 bools, 0=Sun], hoursPerDay,
     *   startMin, endMin, holidays:[day], workExceptions:[day], raw}
     */
    constructor(o) {
      this.id = String(o.id != null ? o.id : 'CAL1');
      this.name = o.name || 'Standard 6 Day';
      this.workWeek = (o.workWeek || [false, true, true, true, true, true, true]).slice(0, 7);
      if (!this.workWeek.some(Boolean)) this.workWeek = [false, true, true, true, true, true, true];
      this.hoursPerDay = o.hoursPerDay > 0 ? +o.hoursPerDay : 8;
      this.startMin = o.startMin != null ? o.startMin : 8 * 60;
      this.endMin = o.endMin != null ? o.endMin : Math.min(24 * 60, this.startMin + this.hoursPerDay * 60 + (this.hoursPerDay >= 8 ? 60 : 0));
      this.holidays = new Set(o.holidays || []);
      this.workExceptions = new Set(o.workExceptions || []);
      this.raw = o.raw || null;
      this._build();
    }
    _build() {
      const n = CAL_END - CAL_BASE;
      this._isW = new Uint8Array(n);
      this._idx = new Int32Array(n + 1); // working days strictly before day
      const list = [];
      let c = 0;
      for (let i = 0; i < n; i++) {
        const day = CAL_BASE + i;
        let w = this.workWeek[weekday(day)];
        if (this.holidays.has(day)) w = false;
        if (this.workExceptions.has(day)) w = true;
        this._isW[i] = w ? 1 : 0;
        this._idx[i] = c;
        if (w) { list.push(day); c++; }
      }
      this._idx[n] = c;
      this._list = Int32Array.from(list);
    }
    _clamp(d) { return d < CAL_BASE ? CAL_BASE : d >= CAL_END ? CAL_END - 1 : d; }
    isWork(d) { d = this._clamp(d); return this._isW[d - CAL_BASE] === 1; }
    /** first working day >= d */
    next(d) { d = this._clamp(d); const k = this._idx[d - CAL_BASE]; return k < this._list.length ? this._list[k] : d; }
    /** last working day <= d */
    prev(d) { d = this._clamp(d); const k = this._idx[d - CAL_BASE + 1] - 1; return k >= 0 ? this._list[k] : d; }
    /** move n working days from working day d (d is snapped forward to a working day first) */
    add(d, n) {
      const s = this.next(d);
      let k = this._idx[s - CAL_BASE] + Math.round(n || 0);
      if (k < 0) k = 0;
      if (k >= this._list.length) k = this._list.length - 1;
      return this._list[k];
    }
    /** number of working days in [a, b)  (negative if b < a) */
    between(a, b) {
      a = this._clamp(a); b = this._clamp(b);
      return this._idx[b - CAL_BASE] - this._idx[a - CAL_BASE];
    }
    /** working days in [a, b] inclusive */
    span(a, b) { return b < a ? 0 : this.between(a, b + 1); }
    /** finish day for a task of `dur` days that starts on `start` */
    finishFrom(start, dur) { const d = Math.max(1, Math.ceil(dur - 1e-6)); return this.add(start, d - 1); }
    /** start day for a task of `dur` days that finishes on `finish` */
    startFrom(finish, dur) { const d = Math.max(1, Math.ceil(dur - 1e-6)); return this.add(this.prev(finish), -(d - 1)); }

    toJSON() {
      return {
        id: this.id, name: this.name, workWeek: this.workWeek, hoursPerDay: this.hoursPerDay,
        startMin: this.startMin, endMin: this.endMin, holidays: Array.from(this.holidays),
        workExceptions: Array.from(this.workExceptions), raw: this.raw
      };
    }

    /** Build clndr_data text for XER export */
    toClndrData() {
      const iv = (sm, em) => {
        const hh = (m) => pad(Math.floor(m / 60)) + ':' + pad(m % 60);
        const h = this.hoursPerDay;
        if (h >= 8 && em - sm > h * 60) { // assume 1h lunch at mid-day
          const lunch = sm + 4 * 60;
          return '(0||0(s|' + hh(sm) + '|f|' + hh(lunch) + ')())(0||1(s|' + hh(lunch + 60) + '|f|' + hh(em) + ')())';
        }
        return '(0||0(s|' + hh(sm) + '|f|' + hh(em) + ')())';
      };
      let s = '(0||CalendarData()((0||DaysOfWeek()(';
      for (let i = 0; i < 7; i++) {
        s += '(0||' + (i + 1) + '()(' + (this.workWeek[i] ? iv(this.startMin, this.endMin) : '') + '))';
      }
      s += '))(0||VIEW(ShowTotal|Y)())(0||Exceptions()(';
      let k = 0;
      Array.from(this.holidays).sort((a, b) => a - b).forEach((d) => { s += '(0||' + (k++) + '(d|' + dayToExcelSerial(d) + ')())'; });
      Array.from(this.workExceptions).sort((a, b) => a - b).forEach((d) => { s += '(0||' + (k++) + '(d|' + dayToExcelSerial(d) + ')(' + iv(this.startMin, this.endMin) + '))'; });
      s += '))))';
      return s;
    }

    static fromJSON(o) { return new Calendar(o); }

    /** Parse a P6 CALENDAR row (XER) */
    static fromXer(row) {
      const data = row.clndr_data || '';
      const workWeek = [false, true, true, true, true, true, false];
      let startMin = null, endMin = null, hoursByDay = [];
      const holidays = [], workExceptions = [];
      const toMin = (t) => { const p = t.split(':'); return (+p[0]) * 60 + (+p[1] || 0); };
      const intervals = (txt) => {
        const out = [];
        const re = /s\|(\d{1,2}:\d{2})\|f\|(\d{1,2}:\d{2})/g;
        let m;
        while ((m = re.exec(txt))) out.push([toMin(m[1]), toMin(m[2]) || 1440]);
        // some exports write f before s
        const re2 = /f\|(\d{1,2}:\d{2})\|s\|(\d{1,2}:\d{2})/g;
        while ((m = re2.exec(txt))) out.push([toMin(m[2]), toMin(m[1]) || 1440]);
        return out;
      };
      const dowStart = data.indexOf('DaysOfWeek');
      if (dowStart >= 0) {
        let dowEnd = data.indexOf('Exceptions', dowStart);
        const viewIdx = data.indexOf('VIEW', dowStart);
        if (viewIdx > 0 && (dowEnd < 0 || viewIdx < dowEnd)) dowEnd = viewIdx;
        const dow = data.slice(dowStart, dowEnd > 0 ? dowEnd : undefined);
        const pieces = dow.split(/\(0\|\|([1-7])\(\)/);
        // pieces: [pre, dayNo, text, dayNo, text, ...]
        for (let i = 1; i < pieces.length; i += 2) {
          const dn = +pieces[i];
          const iv = intervals(pieces[i + 1] || '');
          const w = iv.length > 0;
          workWeek[dn - 1] = w;
          if (w) {
            const s = Math.min.apply(null, iv.map((x) => x[0]));
            const e = Math.max.apply(null, iv.map((x) => x[1]));
            hoursByDay.push(iv.reduce((a, x) => a + (x[1] - x[0]), 0) / 60);
            if (startMin == null || dn === 2) { startMin = s; endMin = e; }
          }
        }
      }
      const exStart = data.indexOf('Exceptions');
      if (exStart >= 0) {
        const ex = data.slice(exStart);
        const pieces = ex.split(/\(0\|\|\d+\(d\|(\d+)\)/);
        for (let i = 1; i < pieces.length; i += 2) {
          const d = excelSerialToDay(+pieces[i]);
          const iv = intervals((pieces[i + 1] || '').split(/\(0\|\|\d+\(d\|/)[0]);
          if (iv.length) workExceptions.push(d); else holidays.push(d);
        }
      }
      let hpd = parseFloat(row.day_hr_cnt);
      if (!(hpd > 0)) hpd = hoursByDay.length ? hoursByDay[0] : 8;
      return new Calendar({
        id: row.clndr_id, name: row.clndr_name, workWeek, hoursPerDay: hpd,
        startMin: startMin != null ? startMin : 8 * 60, endMin: endMin != null ? endMin : 17 * 60,
        holidays, workExceptions, raw: row
      });
    }
  }

  function uid(prefix) { return (prefix || '') + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4); }
  function round(n, dp) { const f = Math.pow(10, dp == null ? 1 : dp); return Math.round(n * f) / f; }
  function clamp(n, a, b) { return n < a ? a : n > b ? b : n; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  SE.DAY = DAY;
  SE.MONTHS = MON;
  SE.D = {
    dayOf, parts, weekday, fmt, fmtLong, fmtISO, monthLabel, parseXerDT, fmtXerDT, parseDate, parseDay,
    excelSerialToDay, dayToExcelSerial, todayDay, monthStart, monthEnd, addMonths, pad
  };
  SE.Calendar = Calendar;
  SE.util = { uid, round, clamp, esc };
})(typeof module === 'object' && module.exports ? (global.SE = global.SE || {}) : (window.SE = window.SE || {}));
