/* Schedule Engine - core/importers.js
 * Excel / CSV / PDF / MS Project XML -> "grid" -> column mapping -> Project.
 * Also re-imports the engine's own Excel "Update Sheet" as progress patches.
 */
(function (SE) {
  'use strict';
  const D = SE.D;

  const FIELDS = [
    { key: 'code', label: 'Activity ID', req: true, syn: ['activity id', 'act id', 'activityid', 'task_code', 'activity code', 'task code', 'id', 'code', 'activity no', 'act no', 'sl no activity', 'unique id'] },
    { key: 'name', label: 'Activity Name', req: true, syn: ['activity name', 'task_name', 'activity description', 'description', 'task name', 'name', 'activity', 'task', 'particulars', 'item'] },
    { key: 'wbs', label: 'WBS Code / Path', syn: ['wbs', 'wbs code', 'wbs_id', 'wbs path', 'wbs_short_name', 'outline number'] },
    { key: 'wbsName', label: 'WBS Name', syn: ['wbs name', 'wbs_name', 'wbs description'] },
    { key: 'level', label: 'Outline Level', syn: ['outline level', 'level', 'indent'] },
    { key: 'type', label: 'Activity Type', syn: ['activity type', 'task_type', 'type', 'milestone'] },
    { key: 'status', label: 'Activity Status', syn: ['activity status', 'status_code', 'status'] },
    { key: 'origDur', label: 'Original Duration', syn: ['original duration', 'orig dur', 'origdur', 'target_drtn_hr_cnt', 'od', 'duration', 'planned duration', 'baseline duration', 'dur', 'at completion duration'] },
    { key: 'remDur', label: 'Remaining Duration', syn: ['remaining duration', 'rem dur', 'remdur', 'remain_drtn_hr_cnt', 'rd', 'remaining'] },
    { key: 'start', label: 'Start (forecast / current)', syn: ['start', 'start date', 'early start', 'early_start_date', 'forecast start', 'current start', 'start_date', 'begin'] },
    { key: 'finish', label: 'Finish (forecast / current)', syn: ['finish', 'finish date', 'early finish', 'early_end_date', 'forecast finish', 'current finish', 'end', 'end date', 'end_date', 'finish_date', 'completion date'] },
    { key: 'plStart', label: 'Planned / Baseline Start', syn: ['planned start', 'target_start_date', 'baseline start', 'bl start', 'bl project start', 'plan start', 'baseline1 start', 'scheduled start'] },
    { key: 'plFinish', label: 'Planned / Baseline Finish', syn: ['planned finish', 'target_end_date', 'baseline finish', 'bl finish', 'bl project finish', 'plan finish', 'baseline1 finish', 'scheduled finish'] },
    { key: 'aStart', label: 'Actual Start', syn: ['actual start', 'act_start_date', 'act start', 'a start', 'as'] },
    { key: 'aFinish', label: 'Actual Finish', syn: ['actual finish', 'act_end_date', 'act finish', 'a finish', 'af', 'actual end'] },
    { key: 'pct', label: '% Complete', syn: ['% complete', 'percent complete', 'physical % complete', 'phys_complete_pct', 'activity % complete', 'complete_pct', 'progress', '% progress', 'pct', 'completion', '%', 'duration % complete', 'progress %'] },
    { key: 'tf', label: 'Total Float', syn: ['total float', 'total_float_hr_cnt', 'tf', 'float', 'slack', 'total slack'] },
    { key: 'preds', label: 'Predecessors', syn: ['predecessors', 'predecessor', 'preds', 'pred', 'depends on', 'predecessor details'] },
    { key: 'succs', label: 'Successors', syn: ['successors', 'successor', 'succs'] },
    { key: 'building', label: 'Building / Area', syn: ['building', 'bldg', 'block', 'area', 'zone', 'tower', 'location', 'structure', 'facility'] },
    { key: 'epc', label: 'EPC Phase', syn: ['epc', 'phase', 'epc phase', 'stage', 'discipline', 'category'] },
    { key: 'calendar', label: 'Calendar', syn: ['calendar', 'clndr_id', 'calendar name'] },
    { key: 'unit', label: 'Unit (UOM)', syn: ['unit', 'uom', 'units'] },
    { key: 'scopeQty', label: 'Scope Qty', syn: ['scope qty', 'scope', 'total qty', 'boq qty', 'planned qty', 'quantity', 'qty'] },
    { key: 'doneQty', label: 'Completed Qty', syn: ['completed qty', 'done qty', 'executed qty', 'cumulative qty', 'actual qty', 'progress qty'] },
    { key: 'remarks', label: 'Remarks', syn: ['remarks', 'comments', 'notes', 'remark', 'reason for delay', 'delay reason'] }
  ];
  const FIELD_BY_KEY = {};
  FIELDS.forEach((f) => { FIELD_BY_KEY[f.key] = f; });
  const norm = (s) => String(s == null ? '' : s).toLowerCase().replace(/\(.*?\)/g, ' ').replace(/[^a-z0-9%]+/g, ' ').trim();

  function guessMapping(header) {
    const map = {};
    const used = new Set();
    const H = header.map(norm);
    // exact synonym first, then startsWith, then contains
    for (const pass of [0, 1, 2]) {
      for (const f of FIELDS) {
        if (map[f.key] != null) continue;
        for (let i = 0; i < H.length; i++) {
          if (used.has(i) || !H[i]) continue;
          const h = H[i];
          const hit = f.syn.some((s) => {
            const ns = norm(s);
            if (pass === 0) return h === ns;
            if (pass === 1) return ns.length > 3 && (h.startsWith(ns + ' ') || h.endsWith(' ' + ns));
            return ns.length > 5 && h.indexOf(ns) >= 0;
          });
          if (hit) { map[f.key] = i; used.add(i); break; }
        }
      }
    }
    return map;
  }
  function headerScore(row) {
    const m = guessMapping(row);
    let s = Object.keys(m).length;
    if (m.code != null) s += 2;
    if (m.name != null) s += 2;
    return s;
  }
  function detectHeader(rows) {
    let best = 0, bestScore = -1;
    for (let i = 0; i < Math.min(rows.length, 40); i++) {
      const sc = headerScore(rows[i] || []);
      if (sc > bestScore) { bestScore = sc; best = i; }
    }
    // P6 spreadsheet export: row 1 = field names, row 2 = labels
    let dataStart = best + 1;
    if (rows[dataStart] && headerScore(rows[dataStart]) >= 4 && !(rows[dataStart] || []).some((c) => D.parseDate(c))) dataStart++;
    return { headerRow: best, dataStart, score: bestScore };
  }

  /* ---------------- Excel / CSV ---------------- */
  function readWorkbook(buf) {
    if (typeof XLSX === 'undefined') throw new Error('Excel reader not loaded.');
    const wb = XLSX.read(buf, { type: 'array', cellDates: true, cellStyles: true });
    return wb;
  }
  function sheetToGrid(wb, sheetName) {
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '', blankrows: false });
    const levels = [];
    const rinfo = ws['!rows'] || [];
    // Outline levels / indentation help reconstruct WBS in exported layouts
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
    let r0 = range.s.r;
    // sheet_to_json skipped blank rows - rebuild the actual row numbers
    const rowNums = [];
    for (let r = range.s.r; r <= range.e.r; r++) {
      let any = false;
      for (let c = range.s.c; c <= range.e.c; c++) { const cell = ws[XLSX.utils.encode_cell({ r, c })]; if (cell && cell.v !== '' && cell.v != null) { any = true; break; } }
      if (any) rowNums.push(r);
    }
    rowNums.forEach((r, i) => { levels[i] = rinfo[r] && rinfo[r].level ? rinfo[r].level : 0; });
    void r0;
    return { rows, levels, name: sheetName };
  }
  function bestSheet(wb) {
    let best = wb.SheetNames[0], bs = -1;
    for (const n of wb.SheetNames) {
      try {
        const g = sheetToGrid(wb, n);
        const h = detectHeader(g.rows);
        const sc = h.score * 10 + Math.min(g.rows.length, 5000) / 1000;
        if (sc > bs) { bs = sc; best = n; }
      } catch (e) { /* skip */ }
    }
    return best;
  }

  /* ---------------- PDF ---------------- */
  async function pdfToGrid(buf, onProgress) {
    if (typeof pdfjsLib === 'undefined') throw new Error('PDF reader not loaded.');
    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf), isEvalSupported: false }).promise;
    const lines = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const tc = await page.getTextContent();
      const items = tc.items.filter((it) => it.str && it.str.trim()).map((it) => ({ x: it.transform[4], y: it.transform[5], w: it.width, s: it.str.trim(), h: Math.abs(it.transform[3]) || 8 }));
      items.sort((a, b) => (b.y - a.y) || (a.x - b.x));
      let cur = null;
      for (const it of items) {
        if (!cur || Math.abs(cur.y - it.y) > Math.max(2, it.h * 0.45)) { cur = { y: it.y, page: p, items: [] }; lines.push(cur); }
        cur.items.push(it);
      }
      if (onProgress) onProgress(p / doc.numPages);
    }
    for (const l of lines) l.items.sort((a, b) => a.x - b.x);
    // find header line(s)
    const HDR = /activity\s*id|activity\s*name|original|remaining|duration|start|finish|total\s*float|%\s*complete|complete/i;
    // candidate header lines; choose the table with the most rows below its (repeated) header
    const cands = new Map();
    for (const l of lines) {
      const txt = l.items.map((i) => i.s).join(' ');
      const hits = (txt.match(/activity\s*id|activity\s*name|start|finish|duration|float|complete/gi) || []).length;
      if (hits < 3) continue;
      const key = l.items.map((i) => i.s).join('|');
      if (!cands.has(key)) cands.set(key, { line: l, hits, pages: new Map() });
      const c = cands.get(key);
      if (!c.pages.has(l.page)) c.pages.set(l.page, l.y);
    }
    let hdr = null;
    for (const [, c] of cands) {
      let rowsBelow = 0;
      for (const l of lines) { const y = c.pages.get(l.page); if (y != null && l.y < y - 1 && /\d/.test(l.items.map((i) => i.s).join(' '))) rowsBelow++; }
      c.score = rowsBelow + c.hits * 5;
      if (!hdr || c.score > hdr.score) hdr = c;
    }
    let cols = null;
    if (hdr) {
      // merge header with the line just below/above if it is part of a 2-line header
      const hl = hdr.line;
      const near = lines.filter((l) => l.page === hl.page && l !== hl && Math.abs(l.y - hl.y) < 14 && l.items.every((i) => HDR.test(i.s) || /^\(?[a-z%]+\)?$/i.test(i.s)));
      const hItems = hl.items.concat(...near.map((l) => l.items)).sort((a, b) => a.x - b.x);
      // collapse items that overlap in x into one column title
      cols = [];
      for (const it of hItems) {
        const last = cols[cols.length - 1];
        if (last && it.x < last.x2 + 4) { last.t += ' ' + it.s; last.x2 = Math.max(last.x2, it.x + it.w); }
        else cols.push({ t: it.s, x1: it.x, x2: it.x + it.w });
      }
      // stop at the gantt timescale (month names / years)
      const cut = cols.findIndex((c, i) => i > 2 && /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|q[1-4]|20\d\d|\d{4})\b/i.test(c.t));
      if (cut > 0) cols = cols.slice(0, cut);
    }
    const rows = [];
    const header = cols ? cols.map((c) => c.t) : ['Activity ID', 'Activity Name', 'Original Duration', 'Remaining Duration', 'Start', 'Finish', '% Complete'];
    rows.push(header);
    const hdrKey = hdr ? hdr.line.items.map((i) => i.s).join('|') : null;
    // only pages that repeat this table header (P6 prints it on every page), below the header
    const hdrY = {};
    if (hdr) for (const l of lines) if (l.items.map((i) => i.s).join('|') === hdrKey && hdrY[l.page] == null) hdrY[l.page] = l.y;
    for (const l of lines) {
      if (hdr && (l === hdr.line || l.items.map((i) => i.s).join('|') === hdrKey)) continue;
      if (hdr && (hdrY[l.page] == null || l.y >= hdrY[l.page] - 1)) continue;
      const txt = l.items.map((i) => i.s).join(' ');
      if (/^page \d+|^\d+ of \d+|data date|print date|layout:|filter:|©|primavera/i.test(txt)) continue;
      if (cols) {
        const row = cols.map(() => '');
        const bounds = cols.map((c, i) => ({ l: i === 0 ? -Infinity : (cols[i - 1].x2 + c.x1) / 2, r: i === cols.length - 1 ? c.x2 + 60 : (c.x2 + cols[i + 1].x1) / 2 }));
        let anyIn = false;
        for (const it of l.items) {
          const cx = it.x + Math.min(it.w, 30) / 2;
          let k = bounds.findIndex((b) => cx >= b.l && cx < b.r);
          if (k < 0) { if (cx < bounds[0].r) k = 0; else continue; }
          row[k] = row[k] ? row[k] + ' ' + it.s : it.s;
          anyIn = true;
        }
        if (anyIn) rows.push(row);
      } else {
        const r = parsePdfLine(txt);
        if (r) rows.push(r);
      }
    }
    return { rows, levels: [], name: 'PDF', pdf: true };
  }
  const DATE_TOK = /(\d{1,2}[-\s/.][A-Za-z]{3,9}[-\s/.]\d{2,4}(?:\s*A)?\*?|\d{1,2}\/\d{1,2}\/\d{2,4}(?:\s*A)?)/g;
  function parsePdfLine(txt) {
    const dates = txt.match(DATE_TOK) || [];
    const m = /^(\S+)\s+(.*)$/.exec(txt);
    if (!m) return null;
    const rest = m[2].replace(DATE_TOK, ' ').trim();
    const nums = rest.match(/(?:^|\s)(\d+(?:\.\d+)?)d?(?=\s|$|%)/g) || [];
    const name = rest.replace(/(?:^|\s)(\d+(?:\.\d+)?)(d|%)?(?=\s|$)/g, ' ').trim();
    return [m[1], name, (nums[0] || '').trim(), (nums[1] || '').trim(), dates[0] || '', dates[1] || '', (nums[2] || '').trim()];
  }

  /* ---------------- grid -> Project ---------------- */
  const ID_RE = /^[A-Za-z0-9][\w\-./]*\d[\w\-./]*$/;
  function isGroupRow(row, map) {
    const code = cell(row, map.code), name = cell(row, map.name);
    const hasDates = ['start', 'finish', 'aStart', 'aFinish', 'plStart', 'plFinish'].some((k) => map[k] != null && D.parseDate(row[map[k]]));
    const filled = row.filter((c) => c !== '' && c != null).length;
    if (!code && name) return true;
    if (code && !name && !hasDates) return true;
    if (code && !name && (!/\d/.test(code) || /\s\S+\s/.test(code))) return true; // WBS band printed across the ID column
    if (code && !ID_RE.test(code) && /\s/.test(code) && !name) return true;
    if (code && !ID_RE.test(code) && /\s/.test(code) && (!hasDates || filled <= 2)) return true;
    return false;
  }
  function cell(row, i) { if (i == null) return ''; const v = row[i]; return v == null ? '' : (v instanceof Date ? v : String(v).trim()); }
  function num(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return v;
    const m = /-?\d+(?:\.\d+)?/.exec(String(v).replace(/,/g, ''));
    return m ? parseFloat(m[0]) : null;
  }
  function parsePreds(txt) {
    // "A1010FS+2d, A1020; A1030 SS" or MS Project "3FS+2 days,4"; a bare "-123" is part of the ID, not a lag
    const out = [];
    if (!txt) return out;
    for (let part of String(txt).split(/[,;\n]+/)) {
      part = part.trim();
      if (!part) continue;
      let m, ref = part, type = 'FS', lag = 0, unit = '';
      if ((m = /^(.*?\S)\s*[:(]?\s*(FS|SS|FF|SF)\s*([+-]\s*\d+(?:\.\d+)?)?\s*(d|days?|w|wks?|weeks?|ed|edays?)?\)?$/i.exec(part))) {
        ref = m[1]; type = m[2].toUpperCase(); lag = m[3] ? parseFloat(m[3].replace(/\s/g, '')) : 0; unit = m[4] || '';
      } else if ((m = /^(.*\S)\s+([+-]\d+(?:\.\d+)?)\s*(d|days?|w|wks?|weeks?)?$/i.exec(part))) {
        ref = m[1]; lag = parseFloat(m[2]); unit = m[3] || '';
      }
      if (/^w/i.test(unit)) lag *= 6;
      out.push({ ref: ref.trim(), type, lag });
    }
    return out;
  }

  function gridToProject(grid, map, opts) {
    opts = Object.assign({ headerRow: 0, dataStart: 1, fileName: '', name: '', dataDate: null, mdy: false, extraCodes: [] }, opts || {});
    const P = new SE.Project();
    P.meta.source = opts.source || 'excel';
    P.meta.fileName = opts.fileName;
    P.meta.name = opts.name || (opts.fileName || 'Imported schedule').replace(/\.[^.]+$/, '');
    P.meta.code = (P.meta.name.replace(/[^A-Za-z0-9]+/g, '').slice(0, 10) || 'PROJ').toUpperCase();
    const cal = P.ensureDefaultCal();
    const header = grid.rows[opts.headerRow] || [];
    let wid = 0;
    const root = 'W' + (++wid);
    P.wbs[root] = { id: root, parentId: null, code: P.meta.code, name: P.meta.name, seq: 0 };
    P.rootWbsId = root;
    const wbsByPath = {};
    const ensureWbsPath = (parts) => {
      let parent = root, key = '';
      parts.forEach((p, i) => {
        key += '/' + p;
        if (!wbsByPath[key]) {
          const id = 'W' + (++wid);
          P.wbs[id] = { id, parentId: parent, code: p.length <= 20 ? p : p.slice(0, 20), name: p, seq: wid };
          wbsByPath[key] = id;
        }
        parent = wbsByPath[key];
        void i;
      });
      return parent;
    };
    // group-row driven hierarchy
    const stack = []; // [{id, level, name, repeating}]
    const headerNames = {};
    for (let r = opts.dataStart; r < grid.rows.length; r++) {
      const row = grid.rows[r];
      if (row && isGroupRow(row, map)) { const n = cell(row, map.name) || cell(row, map.code); headerNames[n] = (headerNames[n] || 0) + 1; }
    }
    // % column stored as fractions (0-1, Excel percent format) or as 0-100?
    let pctScale = 1;
    if (map.pct != null) {
      let mx = 0, n = 0;
      for (let r = opts.dataStart; r < grid.rows.length; r++) {
        const v = grid.rows[r] && grid.rows[r][map.pct];
        if (typeof v === 'number') { n++; if (v > mx) mx = v; } else if (typeof v === 'string' && /%/.test(v)) { mx = 100; }
      }
      if (n && mx <= 1) pctScale = 100;
    }
    let lastWasHeader = false;
    let curWbs = root;
    const byCode = {};
    let tid = 0;
    const dates = [];
    const warn = [];
    const codeTypes = {};
    const bType = map.building != null ? 'Building' : null;
    const eType = map.epc != null ? 'EPC Phase' : null;
    for (let r = opts.dataStart; r < grid.rows.length; r++) {
      const row = grid.rows[r];
      if (!row || !row.some((c) => c !== '' && c != null)) continue;
      const lvlCol = map.level != null ? num(row[map.level]) : null;
      const xLevel = grid.levels && grid.levels[r] ? grid.levels[r] : 0;
      if (isGroupRow(row, map)) {
        const raw = map.name != null && cell(row, map.name) ? row[map.name] : row[map.code];
        const name = String(raw).trim();
        const indent = /^\s+/.exec(String(raw)) ? /^\s+/.exec(String(raw))[0].length : 0;
        let level;
        if (lvlCol) level = lvlCol;
        else if (xLevel) level = xLevel;
        else if (indent) level = Math.floor(indent / 2) + 1;
        else {
          const rep = (headerNames[name] || 0) > 1;
          if (!stack.length) level = 1;
          else if (lastWasHeader) level = stack[stack.length - 1].level + 1;
          else {
            const top = stack[stack.length - 1];
            if (rep && top.repeating) level = top.level;
            else if (!rep) { const firstUnique = stack.findIndex((s) => !s.repeating); level = firstUnique >= 0 ? stack[firstUnique].level : top.level; }
            else level = top.level + (top.repeating ? 0 : 1);
          }
        }
        while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
        const parent = stack.length ? stack[stack.length - 1].id : root;
        const id = 'W' + (++wid);
        P.wbs[id] = { id, parentId: parent, code: name.slice(0, 20), name, seq: wid };
        stack.push({ id, level, name, repeating: (headerNames[name] || 0) > 1 });
        curWbs = id;
        lastWasHeader = true;
        continue;
      }
      lastWasHeader = false;
      let code = String(cell(row, map.code) || '').trim();
      const name = String(cell(row, map.name) || '').trim() || code;
      if (!code) code = 'A' + (1000 + (tid + 1) * 10);
      if (byCode[code]) { warn.push('Duplicate Activity ID ' + code + ' (row ' + (r + 1) + ') renamed.'); code = code + '_' + r; }
      let wbsId = curWbs;
      if (map.wbs != null && cell(row, map.wbs)) {
        const w = String(cell(row, map.wbs));
        const parts = w.split(/\s*[/>|\\]\s*|\.(?=\S)/).filter(Boolean);
        wbsId = ensureWbsPath(parts.length > 1 && /[/>|\\]/.test(w) ? parts : (map.wbsName != null && cell(row, map.wbsName) ? [w + ' ' + cell(row, map.wbsName)] : [w]));
      } else if (map.wbsName != null && cell(row, map.wbsName)) {
        wbsId = ensureWbsPath([String(cell(row, map.wbsName))]);
      }
      const pd = (k) => (map[k] != null ? D.parseDate(row[map[k]], { mdy: opts.mdy }) : null);
      const st = pd('start'), fn = pd('finish'), ps = pd('plStart'), pf = pd('plFinish'), as = pd('aStart'), af = pd('aFinish');
      let od = map.origDur != null ? num(row[map.origDur]) : null;
      let rd = map.remDur != null ? num(row[map.remDur]) : null;
      if (map.origDur != null && /h/i.test(String(row[map.origDur])) && !/d/i.test(String(row[map.origDur]))) od = od / 8;
      if (map.origDur != null && /target_drtn_hr_cnt/i.test(String(header[map.origDur])) && od > 200) od = od / 8;
      let pct = map.pct != null ? num(row[map.pct]) : null;
      if (pct != null && pctScale !== 1) pct = pct * pctScale;
      const statusTxt = map.status != null ? String(row[map.status]).toLowerCase() : '';
      const typeTxt = map.type != null ? String(row[map.type]).toLowerCase() : '';
      const a = SE.newAct({ uid: String(++tid), code, name, wbsId, calId: P.defaultCalId });
      // actual markers "A" on start/finish columns
      a.aStart = as ? as.day : (st && st.actual ? st.day : null);
      a.aFinish = af ? af.day : (fn && fn.actual ? fn.day : null);
      const startDay = st ? st.day : ps ? ps.day : a.aStart;
      const finDay = fn ? fn.day : pf ? pf.day : a.aFinish;
      if (od == null && startDay != null && finDay != null) od = cal.span(startDay, finDay);
      a.origDur = od != null ? Math.max(0, od) : 0;
      if (/mile|mst|ms\b/.test(typeTxt) || (a.origDur === 0 && (od != null || startDay === finDay))) {
        a.type = /start/.test(typeTxt) || /\b(start|ntp|kick.?off|commence)/i.test(name) ? 'start' : 'finish';
        a.origDur = 0;
      } else if (/loe|level of effort/.test(typeTxt)) a.type = 'loe';
      a.tStart = ps ? ps.day : startDay;
      a.tFinish = pf ? pf.day : finDay;
      a.eStart = st ? st.day : startDay;
      a.eFinish = fn ? fn.day : finDay;
      if (st && st.constraint) a.cstr = { type: 'CS_MSOA', date: st.day };
      if (fn && fn.constraint) a.cstr = { type: 'CS_MEOB', date: fn.day };
      // status
      if (/complete|done|closed|tk_complete|finished/.test(statusTxt) || a.aFinish != null || pct >= 100) {
        a.status = 'CO';
        if (a.aFinish == null) a.aFinish = finDay;
        if (a.aStart == null) a.aStart = startDay != null ? startDay : a.aFinish;
      } else if (/not ?started|tk_notstart|^\s*ns\s*$|yet to start|planned/.test(statusTxt) && a.aStart == null && !(pct > 0)) {
        a.status = 'NS';
      } else if (/progress|active|started|tk_active|ongoing|wip|running/.test(statusTxt) || a.aStart != null || pct > 0) {
        a.status = 'IP';
        if (a.aStart == null) a.aStart = startDay;
      } else a.status = 'NS';
      if (a.type === 'start' && a.status === 'IP') { a.status = 'CO'; a.aFinish = a.aStart; }
      if (a.type === 'finish' && a.status === 'IP') { a.status = 'NS'; a.aStart = null; }
      a.pct = a.status === 'CO' ? 100 : a.status === 'NS' ? 0 : Math.max(0, Math.min(99, pct != null ? pct : 50));
      if (a.status === 'IP' && pct == null && rd != null && a.origDur > 0) a.pct = Math.max(1, Math.min(99, Math.round((1 - rd / a.origDur) * 100)));
      a.remDur = a.status === 'CO' ? 0 : rd != null ? rd : a.status === 'IP' ? Math.max(1, Math.round(a.origDur * (1 - a.pct / 100))) : a.origDur;
      if (map.tf != null) a.tf = num(row[map.tf]);
      if (bType && cell(row, map.building)) { a.codes[bType] = String(cell(row, map.building)); (codeTypes[bType] = codeTypes[bType] || new Set()).add(a.codes[bType]); }
      if (eType && cell(row, map.epc)) { a.codes[eType] = String(cell(row, map.epc)); (codeTypes[eType] = codeTypes[eType] || new Set()).add(a.codes[eType]); }
      for (const ci of opts.extraCodes || []) {
        const h = String(header[ci] || 'Code ' + ci);
        const v = cell(row, ci);
        if (v !== '' && !(v instanceof Date)) { a.codes[h] = String(v); (codeTypes[h] = codeTypes[h] || new Set()).add(String(v)); }
      }
      if (map.scopeQty != null || map.doneQty != null) {
        const sc = num(row[map.scopeQty]), dn = num(row[map.doneQty]);
        if (sc) a.qty = { unit: map.unit != null ? String(cell(row, map.unit)) : '', scope: sc, done: dn || 0, items: [] };
      }
      if (map.remarks != null) a.notes = String(cell(row, map.remarks) || '');
      a._preds = map.preds != null ? parsePreds(cell(row, map.preds)) : [];
      a._succs = map.succs != null ? parsePreds(cell(row, map.succs)) : [];
      a._row = r;
      byCode[code] = a;
      P.acts.push(a);
      [a.tStart, a.tFinish, a.aStart, a.aFinish].forEach((d) => { if (d != null) dates.push(d); });
    }
    // relationships (by code, or by row number / MSP id)
    const byRowId = {};
    P.acts.forEach((a, i) => { byRowId[String(i + 1)] = a; });
    let rid = 0;
    const seen = new Set();
    const link = (p, s, type, lag) => {
      const k = p.uid + '>' + s.uid;
      if (!p || !s || p === s || seen.has(k)) return;
      seen.add(k);
      P.rels.push({ id: 'R' + (++rid), pred: p.uid, succ: s.uid, type, lag });
    };
    let unresolved = 0;
    for (const a of P.acts) {
      for (const x of a._preds) { const p = byCode[x.ref] || byRowId[x.ref]; if (p) link(p, a, x.type, x.lag); else { unresolved++; if (typeof process !== 'undefined' && process.env && process.env.SE_DEBUG) console.log('unresolved', a.code, x.ref); } }
      for (const x of a._succs) { const s = byCode[x.ref] || byRowId[x.ref]; if (s) link(a, s, x.type, x.lag); else unresolved++; }
      delete a._preds; delete a._succs; delete a._row;
    }
    if (unresolved) warn.push(unresolved + ' predecessor/successor references could not be matched to an Activity ID.');
    for (const n in codeTypes) P.codeTypes.push({ id: 'ct_' + n, name: n, values: Array.from(codeTypes[n]).sort().map((v, i) => ({ id: n + '_' + i, code: v, name: v })) });
    // data date: explicit, else day after latest actual
    let dd = opts.dataDate;
    if (dd == null) {
      let mx = null;
      for (const a of P.acts) [a.aStart, a.aFinish].forEach((d) => { if (d != null && (mx == null || d > mx)) mx = d; });
      dd = mx != null ? mx + 1 : D.todayDay();
    }
    P.meta.dataDate = dd;
    P.meta.planStart = dates.length ? Math.min.apply(null, dates) : dd;
    P.settings.useLogic = P.rels.length > 0;
    // drop empty WBS nodes (except root)
    P.index();
    P.autoConfigureDims();
    if (bType) P.settings.dims.building = { mode: 'code', codeType: bType, wbsLevel: null };
    if (eType) P.settings.dims.epc = { mode: 'code', codeType: eType, wbsLevel: null };
    P.invalidate();
    P.snapshotPrev();
    P.importWarnings = warn;
    return P;
  }

  /* ---------------- MS Project XML (MSPDI) ---------------- */
  function mspToProject(xmlText, fileName) {
    const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
    const q = (el, tag) => { const x = el.getElementsByTagName(tag)[0]; return x ? x.textContent : ''; };
    const P = new SE.Project();
    P.meta.source = 'msp';
    P.meta.fileName = fileName;
    P.meta.name = q(doc, 'Title') || q(doc, 'Name') || fileName;
    P.meta.code = (P.meta.name.replace(/[^A-Za-z0-9]+/g, '').slice(0, 10) || 'PROJ').toUpperCase();
    P.ensureDefaultCal();
    const sd = q(doc, 'StatusDate');
    const root = 'W0';
    P.wbs[root] = { id: root, parentId: null, code: P.meta.code, name: P.meta.name, seq: 0 };
    P.rootWbsId = root;
    const tasks = Array.from(doc.getElementsByTagName('Task'));
    const stack = [];
    const byUid = {};
    const dur = (s) => { const m = /PT(\d+)H(\d+)M/.exec(s || ''); return m ? (+m[1] + (+m[2]) / 60) / 8 : 0; };
    const pd = (s) => { const x = D.parseXerDT((s || '').replace('T', ' ')); return x ? x.day : null; };
    for (const t of tasks) {
      const uid = q(t, 'UID');
      if (uid === '0') continue;
      const lvl = +q(t, 'OutlineLevel') || 1;
      const name = q(t, 'Name');
      while (stack.length && stack[stack.length - 1].lvl >= lvl) stack.pop();
      const parent = stack.length ? stack[stack.length - 1].id : root;
      if (q(t, 'Summary') === '1') {
        const id = 'W' + uid;
        P.wbs[id] = { id, parentId: parent, code: q(t, 'WBS') || id, name, seq: +q(t, 'ID') || 0 };
        stack.push({ lvl, id });
        continue;
      }
      const ms = q(t, 'Milestone') === '1';
      const a = SE.newAct({ uid, code: 'A' + (q(t, 'ID') || uid), name, wbsId: parent, calId: P.defaultCalId, type: ms ? 'finish' : 'task' });
      a.origDur = ms ? 0 : Math.round(dur(q(t, 'Duration')) * 10) / 10;
      a.tStart = pd(q(t, 'Start')); a.tFinish = pd(q(t, 'Finish'));
      a.eStart = a.tStart; a.eFinish = a.tFinish;
      a.aStart = pd(q(t, 'ActualStart')); a.aFinish = pd(q(t, 'ActualFinish'));
      const pct = +q(t, 'PercentComplete') || 0;
      a.status = a.aFinish != null || pct >= 100 ? 'CO' : a.aStart != null || pct > 0 ? 'IP' : 'NS';
      if (a.status === 'CO') { a.aFinish = a.aFinish != null ? a.aFinish : a.tFinish; a.aStart = a.aStart != null ? a.aStart : a.tStart; }
      if (a.status === 'IP' && a.aStart == null) a.aStart = a.tStart;
      a.pct = a.status === 'CO' ? 100 : pct;
      a.remDur = a.status === 'CO' ? 0 : Math.round(dur(q(t, 'RemainingDuration')) * 10) / 10 || a.origDur;
      const bl = t.getElementsByTagName('Baseline')[0];
      if (bl) a.bl = { start: pd(q(bl, 'Start')), finish: pd(q(bl, 'Finish')) };
      a._links = Array.from(t.getElementsByTagName('PredecessorLink')).map((l) => ({ pred: q(l, 'PredecessorUID'), type: ['FF', 'FS', 'SF', 'SS'][+q(l, 'Type')] || 'FS', lag: (+q(l, 'LinkLag') || 0) / 4800 }));
      byUid[uid] = a;
      P.acts.push(a);
    }
    let rid = 0;
    for (const a of P.acts) {
      for (const l of a._links) if (byUid[l.pred]) P.rels.push({ id: 'R' + (++rid), pred: l.pred, succ: a.uid, type: l.type, lag: Math.round(l.lag) });
      delete a._links;
    }
    P.meta.dataDate = sd ? pd(sd) + 1 : (function () { let mx = null; P.acts.forEach((a) => [a.aStart, a.aFinish].forEach((d) => { if (d != null && (mx == null || d > mx)) mx = d; })); return mx != null ? mx + 1 : D.todayDay(); })();
    P.meta.planStart = Math.min.apply(null, P.acts.map((a) => a.tStart).filter((x) => x != null));
    P.index();
    P.autoConfigureDims();
    P.snapshotPrev();
    return P;
  }

  /* ---------------- Update Sheet re-import ---------------- */
  function readUpdateSheet(P, wb) {
    const name = wb.SheetNames.find((n) => /update/i.test(n)) || wb.SheetNames[0];
    const grid = sheetToGrid(wb, name);
    const h = detectHeader(grid.rows);
    const hdr = grid.rows[h.headerRow].map(norm);
    const col = (re) => hdr.findIndex((x) => re.test(x));
    const ci = { code: col(/^activity id$/), as: col(/^new actual start|^actual start/), af: col(/^new actual finish|^actual finish/), pct: col(/^new % complete|^% complete|complete$/), rd: col(/^new remaining|^remaining dur/), ef: col(/^expected finish/), dq: col(/^done qty|^completed qty|cumulative qty/), rm: col(/^remarks/) };
    if (ci.code < 0) throw new Error('Could not find an "Activity ID" column in sheet "' + name + '".');
    const byCode = new Map(P.acts.map((a) => [a.code, a]));
    const patches = [];
    const notFound = [];
    for (let r = h.dataStart; r < grid.rows.length; r++) {
      const row = grid.rows[r];
      const code = String(row[ci.code] || '').trim();
      if (!code) continue;
      const a = byCode.get(code);
      if (!a) { notFound.push(code); continue; }
      const ch = {};
      const dv = (i) => { if (i < 0) return undefined; const v = row[i]; if (v === '' || v == null) return undefined; const p = D.parseDate(v); return p ? p.day : String(v); };
      const as = dv(ci.as), af = dv(ci.af), ef = dv(ci.ef);
      if (as !== undefined && as !== a.aStart) ch.aStart = as;
      if (af !== undefined && af !== a.aFinish) ch.aFinish = af;
      if (ef !== undefined) ch.expFinish = ef;
      if (ci.pct >= 0 && row[ci.pct] !== '' && row[ci.pct] != null) {
        let p = num(row[ci.pct]);
        if (typeof row[ci.pct] === 'number' && p <= 1 && p > 0) p = p * 100;
        if (p != null && Math.abs(p - (a.pct || 0)) > 0.05 && !(a.status === 'CO' && p >= 100)) ch.pct = p;
      }
      if (ci.rd >= 0 && row[ci.rd] !== '' && row[ci.rd] != null && !('expFinish' in ch)) { const v = num(row[ci.rd]); if (v != null && v !== a.remDur && a.status !== 'CO') ch.remDur = v; }
      const extra = {};
      if (ci.dq >= 0 && row[ci.dq] !== '' && a.qty) { const v = num(row[ci.dq]); if (v != null && v !== a.qty.done) extra.qty = Object.assign({}, a.qty, { done: v }); }
      if (ci.rm >= 0 && row[ci.rm] !== '' && String(row[ci.rm]) !== (a.notes || '')) extra.notes = String(row[ci.rm]);
      if (Object.keys(ch).length || Object.keys(extra).length) patches.push({ uid: a.uid, changes: Object.assign(ch, extra) });
    }
    return { patches, notFound, sheet: name };
  }

  SE.importers = { FIELDS, FIELD_BY_KEY, guessMapping, detectHeader, readWorkbook, sheetToGrid, bestSheet, pdfToGrid, parsePdfLine, gridToProject, mspToProject, readUpdateSheet, parsePreds };
})(typeof module === 'object' && module.exports ? (global.SE = global.SE || {}) : (window.SE = window.SE || {}));
