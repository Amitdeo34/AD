/* Schedule Engine - core/model.js
 * The in-memory project: activities, WBS, relationships, activity codes,
 * progress rules (validation), undo/redo and change log.
 */
(function (SE) {
  'use strict';
  const D = SE.D;

  const STATUS = { NS: 'Not Started', IP: 'In Progress', CO: 'Completed' };
  const TYPE_LABEL = {
    task: 'Task Dependent', start: 'Start Milestone', finish: 'Finish Milestone',
    loe: 'Level of Effort', wbs: 'WBS Summary', rsrc: 'Resource Dependent'
  };
  const EPC = ['Engineering', 'Procurement', 'Construction', 'Others'];

  /* ------------------------------------------------------------------ *
   * EPC keyword intelligence
   * ------------------------------------------------------------------ */
  const EPC_WORDS = {
    Engineering: [
      'engineering', 'design', 'designs', 'drawing', 'drawings', 'dwg', 'dwgs', 'ifc', 'gfc', 'ga ', 'layout', 'calculation', 'calc',
      'datasheet', 'data sheet', 'specification', 'spec', 'basic eng', 'detail eng', 'detailed eng', 'fe study', 'feed',
      'model', '3d', 'review', 'approval', 'approve', 'submission', 'submittal', 'boq', 'bom', 'mto', 'survey', 'soil investigation',
      'geotech', 'topograph', 'study', 'concept', 'schematic', 'shop drawing', 'vendor drawing', 'p&id', 'sld', 'hazop', 'consultant', 'architect'
    ],
    Procurement: [
      'procurement', 'procure', 'purchase', 'po ', ' po', 'p.o', 'order', 'rfq', 'enquiry', 'inquiry', 'tender', 'bid', 'award', 'loi',
      'vendor', 'supplier', 'supply', 'delivery', 'deliver', 'dispatch', 'shipment', 'shipping', 'logistics', 'manufactur',
      'fabrication at', 'shop fabrication', 'fat', 'inspection at', 'material receipt', 'receipt at site', 'material', 'import',
      'expedit', 'long lead', 'mobilisation of material', 'transport'
    ],
    Construction: [
      'construction', 'construct', 'erection', 'erect', 'install', 'installation', 'civil', 'excavation', 'excavate', 'pcc', 'rcc',
      'concrete', 'concreting', 'foundation', 'footing', 'pile', 'piling', 'raft', 'plinth', 'column', 'beam', 'slab', 'shuttering',
      'formwork', 'reinforcement', 'rebar', 'masonry', 'brick', 'block work', 'blockwork', 'plaster', 'painting', 'paint', 'flooring',
      'tiling', 'roofing', 'roof', 'cladding', 'backfill', 'grading', 'road', 'drain', 'cabling', 'cable laying', 'laying', 'termination',
      'wiring', 'piping', 'welding', 'hydrotest', 'hydro test', 'testing', 'test', 'commissioning', 'pre-commissioning', 'energisation',
      'energization', 'trial run', 'handover', 'hand over', 'snag', 'punch', 'finishing', 'waterproof', 'mep', 'hvac', 'plumbing', 'fire fighting',
      'firefighting', 'glazing', 'false ceiling', 'door', 'window', 'site', 'mobilization', 'mobilisation', 'structural steel', 'grouting',
      'alignment', 'precast', 'superstructure', 'substructure', 'earthwork', 'earth work', 'fencing', 'landscap'
    ]
  };
  function classifyEPC(text) {
    const t = ' ' + String(text || '').toLowerCase().replace(/[_\-/]+/g, ' ') + ' ';
    const score = { Engineering: 0, Procurement: 0, Construction: 0 };
    for (const k in EPC_WORDS) {
      for (const w of EPC_WORDS[k]) if (t.indexOf(w) >= 0) score[k] += w.length > 4 ? 2 : 1;
    }
    // strong phrases override
    if (/\b(approv\w*|submi\w*|review\w*)\b.*\b(drawing|dwg|design|datasheet|document|doc)\b/.test(t)) score.Engineering += 4;
    if (/\b(supply|delivery|dispatch|po|purchase order|procure\w*)\b/.test(t)) score.Procurement += 3;
    if (/\b(install\w*|erect\w*|laying|casting|concret\w*|excavat\w*)\b/.test(t)) score.Construction += 3;
    if (/^\s*[ep]\s*[-.:]|\b(eng)\b/.test(t)) score.Engineering += 1;
    let best = 'Others', bs = 0;
    for (const k in score) if (score[k] > bs) { bs = score[k]; best = k; }
    return best;
  }
  function epcFromCodeValue(v) {
    const t = String(v || '').trim().toLowerCase();
    if (!t) return null;
    if (/^e(ng\w*)?$|engineer|design/.test(t)) return 'Engineering';
    if (/^p(roc\w*)?$|procure|supply|purchas/.test(t)) return 'Procurement';
    if (/^c(on\w*)?$|construct|erect|install|civil|commission/.test(t)) return 'Construction';
    return null;
  }
  const BUILDING_RE = /\b(building|bldg|blg|block|blk|tower|twr|wing|shed|hall|plant|station|substation|sub-station|warehouse|annex|annexe|house|facility|unit|area|zone|pavilion|structure|villa|hostel|school|hospital|canteen|office|podium|basement|parking|stp|wtp|etp|pump ?house|dg|utility|gatehouse|gate house|security|mall|complex|terminal|depot|yard)\b|^\s*(b|t|blk|bldg)[\s\-_.]?\d+/i;

  /* ------------------------------------------------------------------ */
  function newAct(o) {
    return Object.assign({
      uid: null, code: '', name: '', wbsId: null, type: 'task', calId: null,
      status: 'NS', pctType: 'phys', pct: 0, origDur: 0, remDur: 0,
      tStart: null, tFinish: null, eStart: null, eFinish: null, lStart: null, lFinish: null,
      aStart: null, aFinish: null, rStart: null, tf: null, ff: null, crit: false,
      cstr: null, cstr2: null, codes: {}, udf: {}, qty: null, notes: '', dimOverride: {},
      prev: null, bl: null, touched: false, isNew: false, expFinish: null
    }, o || {});
  }

  class Project {
    constructor() {
      this.meta = {
        name: 'Untitled Project', code: 'PROJ', source: 'new', fileName: '', dataDate: null, prevDataDate: null,
        planStart: null, mustFinish: null, dataDateMin: 0, currency: 'INR', importedAt: Date.now()
      };
      this.calendars = {};
      this.defaultCalId = null;
      this.wbs = {};           // id -> {id, parentId, code, name, seq}
      this.rootWbsId = null;
      this.acts = [];
      this.rels = [];          // {id, pred, succ, type, lag}
      this.codeTypes = [];     // {id, name, values:[{id, code, name, color}]}
      this.udfTypes = [];
      this.raw = null;         // raw XER tables for faithful round trip
      this.log = [];
      this.undoStack = [];
      this.redoStack = [];
      this.settings = {
        dims: {
          building: { mode: 'auto', codeType: null, wbsLevel: null },
          epc: { mode: 'auto', codeType: null, wbsLevel: null }
        },
        linkRemaining: true,
        smartAutofill: true,
        retainedLogic: true,
        useLogic: true,
        weight: 'duration',
        nearCritical: 10,
        scheduled: false
      };
      this._idx = null;
    }

    /* ---------- indexing ---------- */
    index() {
      const byId = new Map();
      for (const a of this.acts) byId.set(a.uid, a);
      const preds = new Map(), succs = new Map();
      for (const a of this.acts) { preds.set(a.uid, []); succs.set(a.uid, []); }
      for (const r of this.rels) {
        if (!byId.has(r.pred) || !byId.has(r.succ)) continue;
        succs.get(r.pred).push(r);
        preds.get(r.succ).push(r);
      }
      // WBS tree
      const kids = new Map();
      const wbsList = Object.values(this.wbs);
      for (const w of wbsList) kids.set(w.id, []);
      for (const w of wbsList) {
        if (w.parentId != null && this.wbs[w.parentId] && w.parentId !== w.id) kids.get(w.parentId).push(w);
      }
      for (const [, arr] of kids) arr.sort((a, b) => (a.seq - b.seq) || String(a.code).localeCompare(String(b.code)));
      // levels (root = 0)
      const level = new Map();
      const path = new Map();
      const walk = (w, lv, p) => {
        level.set(w.id, lv);
        const np = lv === 0 ? [] : p.concat([w]);
        path.set(w.id, np);
        for (const k of kids.get(w.id) || []) walk(k, lv + 1, np);
      };
      const roots = wbsList.filter((w) => w.parentId == null || !this.wbs[w.parentId] || w.parentId === w.id);
      if (this.rootWbsId && this.wbs[this.rootWbsId]) walk(this.wbs[this.rootWbsId], 0, []);
      for (const r of roots) if (!level.has(r.id)) walk(r, r.id === this.rootWbsId ? 0 : 1, []);
      const actsByWbs = new Map();
      for (const a of this.acts) {
        if (!actsByWbs.has(a.wbsId)) actsByWbs.set(a.wbsId, []);
        actsByWbs.get(a.wbsId).push(a);
      }
      this._idx = { byId, preds, succs, kids, level, path, roots, actsByWbs, dimCache: new Map() };
      return this._idx;
    }
    get idx() { return this._idx || this.index(); }
    invalidate() { this._idx = null; }
    act(uid) { return this.idx.byId.get(uid); }
    predsOf(uid) { return this.idx.preds.get(uid) || []; }
    succsOf(uid) { return this.idx.succs.get(uid) || []; }
    cal(a) {
      return (a && a.calId && this.calendars[a.calId]) || this.calendars[this.defaultCalId] || this.ensureDefaultCal();
    }
    ensureDefaultCal() {
      if (!this.defaultCalId || !this.calendars[this.defaultCalId]) {
        const c = new SE.Calendar({ id: 'CAL1', name: 'Standard 6 Day (Mon-Sat)', workWeek: [false, true, true, true, true, true, true], hoursPerDay: 8 });
        this.calendars[c.id] = c; this.defaultCalId = c.id;
      }
      return this.calendars[this.defaultCalId];
    }
    wbsPath(wbsId) { return this.idx.path.get(wbsId) || []; }
    wbsPathText(wbsId) { return this.wbsPath(wbsId).map((w) => w.name).join(' / '); }
    wbsLevel(wbsId) { return this.idx.level.get(wbsId) || 0; }
    maxWbsLevel() { let m = 0; for (const [, l] of this.idx.level) if (l > m) m = l; return m; }

    get ddDay() { return this.meta.dataDate; }

    /* ---------- dimensions (Building / EPC / any code) ---------- */
    codeType(name) { return this.codeTypes.find((c) => c.name === name); }
    codeLabel(typeName, code) {
      const ct = this.codeType(typeName);
      const v = ct && ct.values.find((x) => x.code === code);
      return v && v.name ? v.name : code;
    }
    dimensionKeys() {
      const keys = [{ key: 'building', label: 'Building' }, { key: 'epc', label: 'EPC Phase' }];
      for (const c of this.codeTypes) keys.push({ key: 'code:' + c.name, label: c.name });
      const ml = this.maxWbsLevel();
      for (let i = 1; i <= Math.min(ml, 6); i++) keys.push({ key: 'wbs:' + i, label: 'WBS Level ' + i });
      keys.push({ key: 'status', label: 'Status' });
      keys.push({ key: 'lens', label: 'Update Flag' });
      return keys;
    }
    wbsAtLevel(a, lv) {
      const p = this.wbsPath(a.wbsId);
      if (!p.length) return null;
      return p[Math.min(lv, p.length) - 1];
    }
    dim(a, key) {
      if (key === 'building' || key === 'epc') {
        if (a.dimOverride && a.dimOverride[key]) return a.dimOverride[key];
        const cache = this.idx.dimCache;
        const ck = key + '|' + a.uid;
        if (cache.has(ck)) return cache.get(ck);
        const v = key === 'building' ? this._building(a) : this._epc(a);
        cache.set(ck, v);
        return v;
      }
      if (key.startsWith('code:')) { const n = key.slice(5); return a.codes[n] ? this.codeLabel(n, a.codes[n]) : '(Unassigned)'; }
      if (key.startsWith('wbs:')) { const w = this.wbsAtLevel(a, +key.slice(4)); return w ? w.name : '(No WBS)'; }
      if (key === 'status') return STATUS[a.status];
      return '';
    }
    _building(a) {
      const s = this.settings.dims.building;
      if (s.mode === 'code' && s.codeType) return a.codes[s.codeType] ? this.codeLabel(s.codeType, a.codes[s.codeType]) : '(Unassigned)';
      if (s.mode === 'wbs' && s.wbsLevel) { const w = this.wbsAtLevel(a, s.wbsLevel); return w ? w.name : '(No WBS)'; }
      if (s.mode === 'none') return 'All';
      // auto
      const p = this.wbsPath(a.wbsId);
      for (let i = p.length - 1; i >= 0; i--) if (BUILDING_RE.test(p[i].name) && !this._isEpcName(p[i].name)) return p[i].name;
      const m = BUILDING_RE.exec(a.name);
      if (m) {
        const mm = /\b(building|bldg|block|blk|tower|wing)[\s\-_.]*([A-Z0-9]{1,4})\b/i.exec(a.name);
        if (mm) return mm[1].charAt(0).toUpperCase() + mm[1].slice(1).toLowerCase() + ' ' + mm[2].toUpperCase();
      }
      return p.length ? p[0].name : 'General';
    }
    _isEpcName(n) { return /^\s*(engineering|design|procurement|supply|construction|execution|civil works?|commissioning)\s*$/i.test(n); }
    _epc(a) {
      const s = this.settings.dims.epc;
      if (s.mode === 'code' && s.codeType) {
        const v = a.codes[s.codeType];
        const lbl = v ? this.codeLabel(s.codeType, v) : null;
        return epcFromCodeValue(v) || epcFromCodeValue(lbl) || lbl || 'Others';
      }
      if (s.mode === 'wbs' && s.wbsLevel) {
        const w = this.wbsAtLevel(a, s.wbsLevel);
        return w ? (epcFromCodeValue(w.name) || classifyEPC(w.name) || w.name) : 'Others';
      }
      // auto: any WBS ancestor that is clearly an EPC bucket wins, else keyword classify
      const p = this.wbsPath(a.wbsId);
      for (let i = p.length - 1; i >= 0; i--) {
        const v = epcFromCodeValue(p[i].name);
        if (v && (this._isEpcName(p[i].name) || /^(e|p|c)$/i.test(p[i].name.trim()))) return v;
      }
      for (const ct of this.codeTypes) {
        if (/epc|phase|stage|discipline/i.test(ct.name) && a.codes[ct.name]) {
          const v = epcFromCodeValue(a.codes[ct.name]);
          if (v) return v;
        }
      }
      const c = classifyEPC(a.name);
      if (c !== 'Others') return c;
      const c2 = classifyEPC(p.map((w) => w.name).join(' '));
      if (c2 !== 'Others') return c2;
      return a.type === 'start' || a.type === 'finish' ? 'Others' : 'Construction';
    }
    /** pick sensible defaults for Building / EPC sources after import */
    autoConfigureDims() {
      const d = this.settings.dims;
      const bType = this.codeTypes.find((c) => /build|bldg|block|tower|area|zone|facility|structure|location/i.test(c.name));
      if (bType) d.building = { mode: 'code', codeType: bType.name, wbsLevel: null };
      else {
        // WBS level whose names look most like buildings
        const idx = this.index();
        const counts = {};
        for (const w of Object.values(this.wbs)) {
          const lv = idx.level.get(w.id);
          if (!lv) continue;
          counts[lv] = counts[lv] || { hit: 0, all: 0 };
          counts[lv].all++;
          if (BUILDING_RE.test(w.name) && !this._isEpcName(w.name)) counts[lv].hit++;
        }
        let best = null, bestRatio = 0;
        for (const lv in counts) {
          const r = counts[lv].hit / counts[lv].all;
          if (counts[lv].hit >= 2 && r > bestRatio) { bestRatio = r; best = +lv; }
        }
        if (best && bestRatio >= 0.4) d.building = { mode: 'wbs', codeType: null, wbsLevel: best };
        else d.building = { mode: 'auto', codeType: null, wbsLevel: null };
      }
      const eType = this.codeTypes.find((c) => {
        if (!/epc|phase|stage|discipline/i.test(c.name) || !c.values.length) return false;
        const m = c.values.map((v) => epcFromCodeValue(v.code) || epcFromCodeValue(v.name)).filter(Boolean);
        return new Set(m).size >= 2 && m.length / c.values.length >= 0.6;
      });
      if (eType) d.epc = { mode: 'code', codeType: eType.name, wbsLevel: null };
      else d.epc = { mode: 'auto', codeType: null, wbsLevel: null };
      this.invalidate();
    }

    /* ---------- derived dates ---------- */
    startOf(a) { return a.aStart != null ? a.aStart : a.eStart != null ? a.eStart : a.tStart; }
    finishOf(a) { return a.aFinish != null ? a.aFinish : a.eFinish != null ? a.eFinish : a.tFinish; }
    /** reference (previous update / baseline) start & finish used by the smart lenses */
    refStart(a) { return a.prev && a.prev.start != null ? a.prev.start : (a.bl && a.bl.start != null ? a.bl.start : a.tStart); }
    refFinish(a) { return a.prev && a.prev.finish != null ? a.prev.finish : (a.bl && a.bl.finish != null ? a.bl.finish : a.tFinish); }
    isMilestone(a) { return a.type === 'start' || a.type === 'finish'; }
    isSummaryType(a) { return a.type === 'loe' || a.type === 'wbs'; }

    /** capture current values as "last update" (previous period) */
    snapshotPrev() {
      for (const a of this.acts) {
        a.prev = {
          status: a.status, pct: a.pct, remDur: a.remDur, aStart: a.aStart, aFinish: a.aFinish,
          start: this.startOf(a), finish: this.finishOf(a), tf: a.tf
        };
        if (!a.bl) a.bl = { start: a.tStart != null ? a.tStart : this.startOf(a), finish: a.tFinish != null ? a.tFinish : this.finishOf(a) };
        a.touched = false;
      }
      this.meta.prevDataDate = this.meta.dataDate;
    }

    /* ---------- progress rules ---------- */
    /**
     * Validate & normalise a change to one activity. Returns
     * {changes, errors:[], warnings:[], infos:[]}. `changes` may contain derived
     * fields (status, pct, remDur ...). Nothing is applied here.
     */
    normalize(a, input) {
      const res = { changes: {}, errors: [], warnings: [], infos: [] };
      const dd = this.meta.dataDate;
      const cal = this.cal(a);
      const ms = this.isMilestone(a);
      const c = Object.assign({}, input);
      const has = (k) => Object.prototype.hasOwnProperty.call(c, k);
      const cur = {
        aStart: a.aStart, aFinish: a.aFinish, pct: a.pct, remDur: a.remDur, status: a.status
      };
      // parse date text
      for (const k of ['aStart', 'aFinish', 'expFinish']) {
        if (has(k) && c[k] != null && typeof c[k] !== 'number') {
          const t = String(c[k]).trim().toLowerCase();
          if (t === '') c[k] = null;
          else if (t === 'dd') c[k] = dd - 1;
          else if (t === 'p' || t === 'plan') c[k] = k === 'aStart' ? this.refStart(a) : this.refFinish(a);
          else if (t === 't' || t === 'today') c[k] = D.todayDay();
          else {
            const p = D.parseDate(c[k]);
            if (!p) { res.errors.push('"' + input[k] + '" is not a date I understand. Try 30-Sep-26 or 30/09/2026.'); return res; }
            c[k] = p.day;
          }
        }
      }
      if (has('pct')) {
        let p = typeof c.pct === 'string' ? parseFloat(c.pct.replace('%', '')) : +c.pct;
        if (c.pct === '' || c.pct == null) p = 0;
        if (!isFinite(p)) { res.errors.push('% Complete must be a number between 0 and 100.'); return res; }
        if (p < 0 || p > 100) { res.errors.push('% Complete must be between 0 and 100 (you entered ' + p + ').'); return res; }
        c.pct = Math.round(p * 10) / 10;
      }
      if (has('remDur')) {
        let r = typeof c.remDur === 'string' ? parseFloat(c.remDur) : +c.remDur;
        if (!isFinite(r) || r < 0) { res.errors.push('Remaining Duration must be zero or more days.'); return res; }
        c.remDur = r;
      }
      if (ms && has('pct') && c.pct > 0 && c.pct < 100) {
        res.errors.push('Milestones have no % - enter the Actual ' + (a.type === 'start' ? 'Start' : 'Finish') + ' date when it is achieved.');
        return res;
      }
      const n = Object.assign({}, cur);
      for (const k of ['aStart', 'aFinish', 'pct', 'remDur']) if (has(k)) n[k] = c[k];

      if (dd != null) {
        if (n.aStart != null && n.aStart >= dd) {
          res.errors.push('Actual Start ' + D.fmt(n.aStart) + ' is on/after the Data Date ' + D.fmt(dd) + '. Actuals must be in the past.');
          return res;
        }
        if (n.aFinish != null && n.aFinish >= dd) {
          res.errors.push('Actual Finish ' + D.fmt(n.aFinish) + ' is on/after the Data Date ' + D.fmt(dd) + '. Use Remaining Duration / Expected Finish for future dates.');
          return res;
        }
      }
      // Expected finish -> remaining duration
      if (has('expFinish') && c.expFinish != null) {
        const from = cal.next(dd != null ? dd : D.todayDay());
        if (c.expFinish < from) { res.errors.push('Expected Finish must be on/after the Data Date (' + D.fmt(from) + ').'); return res; }
        n.remDur = Math.max(1, cal.span(from, c.expFinish));
        res.infos.push('Remaining Duration set to ' + n.remDur + 'd to finish on ' + D.fmt(c.expFinish) + '.');
      }
      // Completion
      if (has('aFinish') && n.aFinish != null) {
        if (n.aStart == null) {
          if (ms && a.type === 'finish') n.aStart = n.aFinish;
          else if (this.settings.smartAutofill) {
            const guess = this.refStart(a);
            n.aStart = guess != null && guess <= n.aFinish ? guess : cal.startFrom(n.aFinish, a.origDur || 1);
            res.infos.push('Actual Start auto-filled as ' + D.fmt(n.aStart) + ' (edit if different).');
          } else { res.errors.push('Enter Actual Start before Actual Finish.'); return res; }
        }
        if (n.aFinish < n.aStart) { res.errors.push('Actual Finish ' + D.fmt(n.aFinish) + ' is before Actual Start ' + D.fmt(n.aStart) + '.'); return res; }
        n.pct = 100; n.remDur = 0; n.status = 'CO';
      } else if (has('aFinish') && n.aFinish == null && cur.aFinish != null) {
        // re-opening a completed activity
        if (!has('pct') || n.pct >= 100) n.pct = ms ? 0 : 90;
        if (!has('remDur') || !n.remDur) n.remDur = Math.max(1, Math.ceil((a.origDur || 1) * (1 - n.pct / 100)));
        n.status = n.aStart != null ? 'IP' : 'NS';
        res.warnings.push('Activity re-opened: status set to ' + STATUS[n.status] + '.');
      }
      if (n.aFinish != null && !has('aFinish') && ((has('pct') && n.pct < 100) || (has('remDur') && n.remDur > 0))) {
        res.errors.push('This activity is complete (Actual Finish ' + D.fmt(n.aFinish) + '). Clear the Actual Finish first to re-open it.');
        return res;
      }
      if (has('aStart') && n.aStart == null) {
        if (n.aFinish != null) { res.errors.push('Cannot clear Actual Start while an Actual Finish exists. Clear Actual Finish first.'); return res; }
        n.pct = 0; n.status = 'NS';
        n.remDur = a.origDur;
      }
      if (n.status !== 'CO' || has('pct')) {
        if (n.pct >= 100 && n.aFinish == null) {
          if (ms) { res.errors.push('A milestone is completed by entering its Actual ' + (a.type === 'start' ? 'Start' : 'Finish') + ' date.'); return res; }
          res.errors.push('100% needs an Actual Finish date. Enter the Actual Finish (the engine will set 100% automatically).');
          return res;
        }
        if (n.pct > 0 && n.aStart == null) {
          if (this.settings.smartAutofill && dd != null) {
            const g = this.refStart(a);
            n.aStart = g != null && g < dd ? g : cal.prev(dd - 1);
            res.infos.push('Progress entered, so Actual Start auto-filled as ' + D.fmt(n.aStart) + '.');
          } else { res.errors.push('Progress > 0% needs an Actual Start.'); return res; }
        }
        if (n.aFinish == null) n.status = n.aStart != null ? 'IP' : 'NS';
      }
      if (ms && n.status === 'IP') {
        // milestones have no in-progress state
        if (a.type === 'start') { n.status = 'CO'; n.aFinish = n.aStart; n.pct = 100; n.remDur = 0; }
        else if (n.aFinish == null) { n.status = 'NS'; n.aStart = null; n.pct = 0; }
      }
      // Remaining duration logic
      if (n.status === 'IP') {
        if (has('pct') && !has('remDur') && !has('expFinish')) {
          if (a.pctType === 'dur' || this.settings.linkRemaining) {
            n.remDur = Math.max(1, Math.round((a.origDur || 1) * (1 - n.pct / 100)));
          }
        }
        if (has('remDur') && a.pctType === 'dur' && !has('pct') && a.origDur > 0) {
          n.pct = Math.max(0, Math.min(99, Math.round((1 - n.remDur / a.origDur) * 100)));
        }
        if (n.remDur <= 0) {
          res.warnings.push('In-progress activity has 0 remaining days. Set Actual Finish if it is complete, otherwise enter remaining days.');
          n.remDur = 1;
        }
        if (n.pct === 0) res.warnings.push('Started but 0% complete - is that right?');
      }
      if (n.status === 'NS') { n.pct = 0; if (!has('remDur')) n.remDur = a.origDur; }
      // Logic sanity (warnings only)
      if (n.aStart != null && n.status !== 'NS') {
        for (const r of this.predsOf(a.uid)) {
          const p = this.act(r.pred);
          if (!p) continue;
          if (r.type === 'FS' && p.status !== 'CO' && (p.aFinish == null)) {
            res.warnings.push('Out of sequence: predecessor ' + p.code + ' (FS) is not complete yet.');
          }
          if (r.type === 'SS' && p.status === 'NS') {
            res.warnings.push('Out of sequence: predecessor ' + p.code + ' (SS) has not started.');
          }
          if (r.type === 'FS' && p.aFinish != null && n.aStart < p.aFinish) {
            res.warnings.push('Actual Start is before predecessor ' + p.code + ' finished (' + D.fmt(p.aFinish) + ').');
          }
        }
      }
      if (n.aStart != null && a.origDur > 0 && n.aFinish != null) {
        const took = cal.span(n.aStart, n.aFinish);
        if (took > a.origDur * 3 && took - a.origDur > 20) res.warnings.push('Actual duration ' + took + 'd is much longer than planned ' + a.origDur + 'd.');
      }
      for (const k of ['aStart', 'aFinish', 'pct', 'remDur', 'status']) if (n[k] !== cur[k]) res.changes[k] = n[k];
      return res;
    }

    /**
     * Apply a batch of changes with validation. patches: [{uid, changes}]
     * Returns {applied, errors:[{uid, code, msg}], warnings, infos}
     */
    apply(patches, label) {
      const out = { applied: 0, errors: [], warnings: [], infos: [] };
      const undo = [];
      for (const p of patches) {
        const a = this.act(p.uid);
        if (!a) continue;
        const direct = {};
        const prog = {};
        for (const k in p.changes) {
          if (['aStart', 'aFinish', 'pct', 'remDur', 'expFinish'].includes(k)) prog[k] = p.changes[k];
          else direct[k] = p.changes[k];
        }
        let changes = {};
        if (Object.keys(prog).length) {
          const r = this.normalize(a, prog);
          r.errors.forEach((m) => out.errors.push({ uid: a.uid, code: a.code, msg: m }));
          r.warnings.forEach((m) => out.warnings.push({ uid: a.uid, code: a.code, msg: m }));
          r.infos.forEach((m) => out.infos.push({ uid: a.uid, code: a.code, msg: m }));
          if (r.errors.length) continue;
          changes = r.changes;
        }
        Object.assign(changes, direct);
        const before = {};
        let any = false;
        for (const k in changes) {
          const oldV = a[k];
          const newV = changes[k];
          if (JSON.stringify(oldV) === JSON.stringify(newV)) continue;
          before[k] = oldV == null ? null : JSON.parse(JSON.stringify(oldV));
          a[k] = newV;
          any = true;
          this.log.push({ t: Date.now(), uid: a.uid, code: a.code, field: k, from: before[k], to: newV });
        }
        if (any) {
          undo.push({ uid: a.uid, before, after: JSON.parse(JSON.stringify(changes)), touchedBefore: a.touched });
          a.touched = true;
          out.applied++;
        }
      }
      if (undo.length) {
        this.undoStack.push({ label: label || 'Update', items: undo, at: Date.now() });
        if (this.undoStack.length > 200) this.undoStack.shift();
        this.redoStack = [];
        this.settings.scheduled = false;
        if (this._idx) this._idx.dimCache.clear();
      }
      return out;
    }
    undo() {
      const u = this.undoStack.pop();
      if (!u) return null;
      for (const it of u.items.slice().reverse()) {
        const a = this.act(it.uid);
        if (!a) continue;
        for (const k in it.before) a[k] = it.before[k];
        a.touched = it.touchedBefore;
      }
      this.redoStack.push(u);
      this.log.push({ t: Date.now(), uid: null, code: '', field: 'undo', from: u.label, to: null });
      if (this._idx) this._idx.dimCache.clear();
      return u;
    }
    redo() {
      const u = this.redoStack.pop();
      if (!u) return null;
      for (const it of u.items) {
        const a = this.act(it.uid);
        if (!a) continue;
        for (const k in it.after) a[k] = JSON.parse(JSON.stringify(it.after[k]));
        a.touched = true;
      }
      this.undoStack.push(u);
      if (this._idx) this._idx.dimCache.clear();
      return u;
    }

    /* ---------- structure editing ---------- */
    nextActCode(wbsId) {
      const sib = (this.idx.actsByWbs.get(wbsId) || this.acts).map((a) => a.code);
      const m = sib.map((c) => /^(.*?)(\d+)$/.exec(c)).filter(Boolean);
      if (m.length) {
        const last = m[m.length - 1];
        let n = Math.max.apply(null, m.filter((x) => x[1] === last[1]).map((x) => +x[2])) + 10;
        let code;
        do { code = last[1] + String(n).padStart(last[2].length, '0'); n += 10; } while (this.acts.some((a) => a.code === code));
        return code;
      }
      return 'A' + (1000 + this.acts.length * 10);
    }
    addActivity(o) {
      const maxId = this.acts.reduce((m, a) => Math.max(m, +a.uid || 0), 0);
      const a = newAct(Object.assign({ uid: String(maxId + 1), isNew: true, calId: this.defaultCalId }, o));
      if (!a.code) a.code = this.nextActCode(a.wbsId);
      if (!a.remDur) a.remDur = a.origDur;
      a.prev = { status: 'NS', pct: 0, remDur: a.origDur, aStart: null, aFinish: null, start: a.tStart, finish: a.tFinish };
      a.bl = { start: a.tStart, finish: a.tFinish };
      a.touched = true;
      this.acts.push(a);
      this.log.push({ t: Date.now(), uid: a.uid, code: a.code, field: 'added', from: null, to: a.name });
      this.invalidate();
      this.undoStack = []; this.redoStack = [];
      this.settings.scheduled = false;
      return a;
    }
    deleteActivity(uid) {
      const a = this.act(uid);
      if (!a) return;
      this.acts = this.acts.filter((x) => x.uid !== uid);
      this.rels = this.rels.filter((r) => r.pred !== uid && r.succ !== uid);
      this.log.push({ t: Date.now(), uid, code: a.code, field: 'deleted', from: a.name, to: null });
      this.invalidate();
      this.undoStack = []; this.redoStack = [];
      this.settings.scheduled = false;
    }
    addRel(pred, succ, type, lag) {
      if (pred === succ) return { error: 'An activity cannot depend on itself.' };
      if (this.rels.some((r) => r.pred === pred && r.succ === succ)) return { error: 'This relationship already exists.' };
      // loop check: is pred reachable from succ?
      const seen = new Set([succ]);
      const stack = [succ];
      while (stack.length) {
        const x = stack.pop();
        if (x === pred) return { error: 'That link would create a loop in the logic.' };
        for (const r of this.succsOf(x)) if (!seen.has(r.succ)) { seen.add(r.succ); stack.push(r.succ); }
      }
      const r = { id: 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), pred, succ, type: type || 'FS', lag: +lag || 0, isNew: true };
      this.rels.push(r);
      const pa = this.act(pred), sa = this.act(succ);
      this.log.push({ t: Date.now(), uid: succ, code: sa ? sa.code : '', field: 'relationship', from: null, to: (pa ? pa.code : pred) + ' ' + r.type + (r.lag ? (r.lag > 0 ? '+' : '') + r.lag + 'd' : '') });
      this.invalidate();
      this.settings.scheduled = false;
      return { rel: r };
    }
    removeRel(id) {
      const r = this.rels.find((x) => x.id === id);
      if (!r) return;
      this.rels = this.rels.filter((x) => x.id !== id);
      const pa = this.act(r.pred), sa = this.act(r.succ);
      this.log.push({ t: Date.now(), uid: r.succ, code: sa ? sa.code : '', field: 'relationship removed', from: (pa ? pa.code : r.pred) + ' ' + r.type, to: null });
      this.invalidate();
      this.settings.scheduled = false;
    }

    /* ---------- persistence ---------- */
    toJSON() {
      const cals = {};
      for (const k in this.calendars) cals[k] = this.calendars[k].toJSON();
      return {
        format: 'schedule-engine-project', version: 1,
        meta: this.meta, calendars: cals, defaultCalId: this.defaultCalId, wbs: this.wbs, rootWbsId: this.rootWbsId,
        acts: this.acts, rels: this.rels, codeTypes: this.codeTypes, udfTypes: this.udfTypes, raw: this.raw,
        log: this.log.slice(-5000), settings: this.settings, qty: this.qty || null
      };
    }
    static fromJSON(o) {
      if (!o || o.format !== 'schedule-engine-project') throw new Error('This is not a Schedule Engine project file.');
      const p = new Project();
      p.meta = Object.assign(p.meta, o.meta);
      for (const k in o.calendars) p.calendars[k] = SE.Calendar.fromJSON(o.calendars[k]);
      p.defaultCalId = o.defaultCalId;
      p.wbs = o.wbs || {};
      p.rootWbsId = o.rootWbsId;
      p.acts = (o.acts || []).map((a) => newAct(a));
      p.rels = o.rels || [];
      p.codeTypes = o.codeTypes || [];
      p.udfTypes = o.udfTypes || [];
      p.raw = o.raw || null;
      p.log = o.log || [];
      p.settings = Object.assign(p.settings, o.settings || {});
      p.qty = o.qty || null;
      p.ensureDefaultCal();
      p.index();
      return p;
    }
  }

  SE.STATUS = STATUS;
  SE.TYPE_LABEL = TYPE_LABEL;
  SE.EPC = EPC;
  SE.classifyEPC = classifyEPC;
  SE.epcFromCodeValue = epcFromCodeValue;
  SE.BUILDING_RE = BUILDING_RE;
  SE.newAct = newAct;
  SE.Project = Project;
})(typeof module === 'object' && module.exports ? (global.SE = global.SE || {}) : (window.SE = window.SE || {}));
