/* Schedule Engine - core/xer.js
 * Primavera P6 XER reader / writer.
 *  - parse(): lossless table-level parse (every table and field is kept)
 *  - toProject(): builds the engine model for one project in the file
 *  - toXer(): writes the updated schedule back INTO the original tables, so
 *    everything the engine does not touch (resources, costs, UDFs, notebooks,
 *    baselines, codes ...) round-trips unchanged. Projects that did not come
 *    from an XER (Excel / PDF / MSP) get a clean, import-ready XER generated.
 */
(function (SE) {
  'use strict';
  const D = SE.D;

  /* ---------------- raw layer ---------------- */
  function parse(text) {
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    const lines = text.split(/\r\n|\n|\r/);
    const raw = { header: null, tables: [], eof: false };
    let cur = null;
    for (const line of lines) {
      if (!line) continue;
      const tab = line.indexOf('\t');
      const tag = tab < 0 ? line.trim() : line.slice(0, tab);
      if (tag === 'ERMHDR') raw.header = line.split('\t');
      else if (tag === '%T') { cur = { name: line.slice(tab + 1).trim(), fields: [], rows: [] }; raw.tables.push(cur); }
      else if (tag === '%F' && cur) cur.fields = line.slice(tab + 1).split('\t');
      else if (tag === '%R' && cur) cur.rows.push(line.slice(tab + 1).split('\t'));
      else if (tag === '%E') raw.eof = true;
    }
    if (!raw.header && !raw.tables.length) throw new Error('This does not look like a Primavera XER file (no ERMHDR / %T sections found).');
    if (!table(raw, 'TASK')) throw new Error('The XER file has no TASK table - export it from P6 with activities included.');
    return raw;
  }
  function write(raw) {
    const out = [];
    out.push((raw.header || ['ERMHDR', '19.12', D.fmtISO(D.todayDay()), 'Project', 'admin', 'Schedule Engine', 'dbxDatabaseNoName', 'Project Management', 'INR']).join('\t'));
    for (const t of raw.tables) {
      out.push('%T\t' + t.name);
      out.push('%F\t' + t.fields.join('\t'));
      for (const r of t.rows) {
        const row = t.fields.map((_, i) => clean(r[i]));
        out.push('%R\t' + row.join('\t'));
      }
    }
    out.push('%E');
    return out.join('\r\n') + '\r\n';
  }
  function clean(v) { return v == null ? '' : String(v).replace(/[\t\r\n]+/g, ' '); }
  function table(raw, name) { return raw.tables.find((t) => t.name === name); }
  function objects(t) {
    if (!t) return [];
    return t.rows.map((r) => { const o = {}; t.fields.forEach((f, i) => { o[f] = r[i] != null ? r[i] : ''; }); return o; });
  }
  function fi(t, f) { return t.fields.indexOf(f); }
  function setF(t, row, f, v) {
    let i = fi(t, f);
    if (i < 0) return false;
    while (row.length < t.fields.length) row.push('');
    row[i] = v == null ? '' : String(v);
    return true;
  }
  function getF(t, row, f) { const i = fi(t, f); return i < 0 ? '' : (row[i] || ''); }
  function ensureTable(raw, name, fields, afterName) {
    let t = table(raw, name);
    if (t) {
      for (const f of fields) if (t.fields.indexOf(f) < 0) { t.fields.push(f); }
      return t;
    }
    t = { name, fields: fields.slice(), rows: [] };
    let at = raw.tables.length;
    if (afterName) { const k = raw.tables.findIndex((x) => x.name === afterName); if (k >= 0) at = k + 1; }
    raw.tables.splice(at, 0, t);
    return t;
  }
  function maxId(t, f) {
    let m = 0;
    if (!t) return m;
    const i = fi(t, f);
    for (const r of t.rows) { const n = parseInt(r[i], 10); if (n > m) m = n; }
    return m;
  }

  /* ---------------- encoding ---------------- */
  const CP1252_HI = {
    0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88,
    0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93,
    0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b,
    0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f
  };
  function decode(buf) {
    const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    try { return { text: new TextDecoder('utf-8', { fatal: true }).decode(u8), encoding: 'utf-8' }; } catch (e) {
      return { text: new TextDecoder('windows-1252').decode(u8), encoding: 'windows-1252' };
    }
  }
  function encode(text, enc) {
    if (enc !== 'windows-1252') return new TextEncoder().encode(text);
    const out = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i);
      if (c < 0x80 || (c >= 0xa0 && c <= 0xff)) out[i] = c;
      else out[i] = CP1252_HI[c] || 0x3f;
    }
    return out;
  }

  /* ---------------- XER -> Project ---------------- */
  const TYPE_IN = { TT_Task: 'task', TT_Rsrc: 'rsrc', TT_Mile: 'start', TT_FinMile: 'finish', TT_LOE: 'loe', TT_WBS: 'wbs' };
  const TYPE_OUT = { task: 'TT_Task', rsrc: 'TT_Rsrc', start: 'TT_Mile', finish: 'TT_FinMile', loe: 'TT_LOE', wbs: 'TT_WBS' };
  const STATUS_IN = { TK_NotStart: 'NS', TK_Active: 'IP', TK_Complete: 'CO' };
  const STATUS_OUT = { NS: 'TK_NotStart', IP: 'TK_Active', CO: 'TK_Complete' };
  const PCT_IN = { CP_Phys: 'phys', CP_Drtn: 'dur', CP_Units: 'units' };
  const PCT_OUT = { phys: 'CP_Phys', dur: 'CP_Drtn', units: 'CP_Units' };
  const REL_IN = { PR_FS: 'FS', PR_SS: 'SS', PR_FF: 'FF', PR_SF: 'SF' };

  function listProjects(raw) {
    const projs = objects(table(raw, 'PROJECT'));
    const wbs = objects(table(raw, 'PROJWBS'));
    const tasks = table(raw, 'TASK');
    const pi = tasks ? fi(tasks, 'proj_id') : -1;
    return projs.map((p) => {
      const root = wbs.find((w) => w.proj_id === p.proj_id && w.proj_node_flag === 'Y');
      return {
        id: p.proj_id, code: p.proj_short_name, name: root ? root.wbs_name : p.proj_short_name,
        dataDate: p.last_recalc_date, tasks: tasks ? tasks.rows.filter((r) => r[pi] === p.proj_id).length : 0
      };
    });
  }

  function toProject(raw, projId, fileName) {
    const P = new SE.Project();
    const projs = objects(table(raw, 'PROJECT'));
    const proj = projs.find((p) => p.proj_id === projId) || projs[0];
    if (!proj) throw new Error('No PROJECT found in the XER.');
    const pid = proj.proj_id;
    P.raw = raw;
    P.meta.source = 'xer';
    P.meta.fileName = fileName || '';
    P.meta.projId = pid;
    P.meta.code = proj.proj_short_name || 'PROJ';

    // calendars
    for (const c of objects(table(raw, 'CALENDAR'))) {
      try { const cal = SE.Calendar.fromXer(c); P.calendars[cal.id] = cal; } catch (e) { /* ignore broken calendar */ }
    }
    let defCal = proj.clndr_id && P.calendars[proj.clndr_id] ? proj.clndr_id : null;
    if (!defCal) { const d = objects(table(raw, 'CALENDAR')).find((c) => c.default_flag === 'Y'); if (d) defCal = d.clndr_id; }
    if (!defCal) defCal = Object.keys(P.calendars)[0] || null;
    P.defaultCalId = defCal;
    P.ensureDefaultCal();
    const dcal = P.cal(null);

    // data date
    const dd = D.parseXerDT(proj.last_recalc_date || proj.next_data_date);
    if (dd) {
      P.meta.ddMin = dd.min;
      P.meta.dataDate = dd.min >= dcal.endMin ? dd.day + 1 : dd.day;
      P.meta.ddEod = dd.min >= dcal.endMin;
    }
    const ps = D.parseXerDT(proj.plan_start_date); if (ps) P.meta.planStart = ps.day;
    const pe = D.parseXerDT(proj.plan_end_date); if (pe) P.meta.mustFinish = pe.day;
    const sf = D.parseXerDT(proj.scd_end_date); if (sf) P.meta.scheduledFinish = sf.day;

    // WBS
    for (const w of objects(table(raw, 'PROJWBS'))) {
      if (w.proj_id !== pid) continue;
      P.wbs[w.wbs_id] = { id: w.wbs_id, parentId: w.parent_wbs_id || null, code: w.wbs_short_name, name: w.wbs_name || w.wbs_short_name, seq: +w.seq_num || 0 };
      if (w.proj_node_flag === 'Y') { P.rootWbsId = w.wbs_id; P.meta.name = w.wbs_name || P.meta.code; }
    }
    if (P.rootWbsId) P.wbs[P.rootWbsId].parentId = null;

    // activity codes
    const types = objects(table(raw, 'ACTVTYPE')).filter((t) => !t.proj_id || t.proj_id === pid);
    const typeById = {};
    for (const t of types) {
      const ct = { id: t.actv_code_type_id, name: t.actv_code_type, scope: t.actv_code_type_scope || (t.proj_id ? 'AS_Project' : 'AS_Global'), values: [] };
      typeById[ct.id] = ct;
      P.codeTypes.push(ct);
    }
    const valById = {};
    for (const v of objects(table(raw, 'ACTVCODE'))) {
      const ct = typeById[v.actv_code_type_id];
      if (!ct) continue;
      const val = { id: v.actv_code_id, code: v.short_name, name: v.actv_code_name || v.short_name, color: v.color, seq: +v.seq_num || 0 };
      ct.values.push(val);
      valById[v.actv_code_id] = { ct, val };
    }
    P.codeTypes.forEach((ct) => ct.values.sort((a, b) => a.seq - b.seq));

    // tasks
    const tByTask = {};
    for (const t of objects(table(raw, 'TASK'))) {
      if (t.proj_id !== pid) continue;
      const cal = P.calendars[t.clndr_id] || dcal;
      const hpd = cal.hoursPerDay || 8;
      const st = (s) => { const x = D.parseXerDT(s); if (!x) return null; return x.min >= cal.endMin ? cal.next(x.day + 1) : x.day; };
      const fn = (s) => { const x = D.parseXerDT(s); if (!x) return null; return x.min === 0 ? x.day - 1 : x.day; };
      const type = TYPE_IN[t.task_type] || 'task';
      const status = STATUS_IN[t.status_code] || 'NS';
      const pctType = PCT_IN[t.complete_pct_type] || 'phys';
      const orig = round2((+t.target_drtn_hr_cnt || 0) / hpd);
      const rem = round2((+t.remain_drtn_hr_cnt || 0) / hpd);
      let pct = +t.phys_complete_pct || 0;
      if (pctType === 'dur' && status === 'IP') pct = orig > 0 ? Math.max(0, Math.min(99, Math.round((1 - rem / orig) * 100))) : 0;
      if (pctType === 'units') {
        const aw = +t.act_work_qty || 0, rw = +t.remain_work_qty || 0;
        if (aw + rw > 0) pct = Math.round(aw / (aw + rw) * 100);
      }
      if (status === 'CO') pct = 100;
      if (status === 'NS') pct = pct || 0;
      const a = SE.newAct({
        uid: t.task_id, code: t.task_code, name: t.task_name, wbsId: t.wbs_id, type, calId: P.calendars[t.clndr_id] ? t.clndr_id : P.defaultCalId,
        status, pctType, pct, origDur: orig, remDur: status === 'CO' ? 0 : rem,
        tStart: st(t.target_start_date), tFinish: fn(t.target_end_date),
        eStart: st(t.restart_date || t.early_start_date), eFinish: fn(t.reend_date || t.early_end_date),
        lStart: st(t.rem_late_start_date || t.late_start_date), lFinish: fn(t.rem_late_end_date || t.late_end_date),
        aStart: st(t.act_start_date), aFinish: fn(t.act_end_date),
        tf: t.total_float_hr_cnt !== '' && t.total_float_hr_cnt != null ? round2(+t.total_float_hr_cnt / hpd) : null,
        ff: t.free_float_hr_cnt !== '' && t.free_float_hr_cnt != null ? round2(+t.free_float_hr_cnt / hpd) : null,
        cstr: t.cstr_type ? { type: t.cstr_type, date: D.parseXerDT(t.cstr_date) ? D.parseXerDT(t.cstr_date).day : null } : null,
        cstr2: t.cstr_type2 ? { type: t.cstr_type2, date: D.parseXerDT(t.cstr_date2) ? D.parseXerDT(t.cstr_date2).day : null } : null,
        longest: t.driving_path_flag === 'Y'
      });
      if (a.type === 'start' && a.aStart != null && a.aFinish == null && status === 'CO') a.aFinish = a.aStart;
      if (a.type === 'finish' && a.aFinish != null && a.aStart == null) a.aStart = a.aFinish;
      if (status === 'IP' && a.aStart == null) a.aStart = a.eStart;
      a.crit = a.tf != null && a.tf <= 0 && status !== 'CO';
      P.acts.push(a);
      tByTask[a.uid] = a;
    }
    // codes on tasks
    for (const ta of objects(table(raw, 'TASKACTV'))) {
      const a = tByTask[ta.task_id];
      const v = valById[ta.actv_code_id];
      if (a && v) a.codes[v.ct.name] = v.val.code;
    }
    // UDFs
    const udfTypes = objects(table(raw, 'UDFTYPE')).filter((u) => u.table_name === 'TASK');
    const udfById = {};
    for (const u of udfTypes) { udfById[u.udf_type_id] = u; P.udfTypes.push({ id: u.udf_type_id, name: u.udf_type_label || u.udf_type_name, dataType: u.logical_data_type }); }
    for (const v of objects(table(raw, 'UDFVALUE'))) {
      const u = udfById[v.udf_type_id];
      const a = u && tByTask[v.fk_id];
      if (!a) continue;
      a.udf[u.udf_type_label || u.udf_type_name] = v.udf_text || v.udf_number || v.udf_date || v.udf_code_id || '';
    }
    // relationships
    for (const r of objects(table(raw, 'TASKPRED'))) {
      if (!tByTask[r.task_id] || !tByTask[r.pred_task_id]) continue;
      const s = tByTask[r.task_id];
      const hpd = P.cal(s).hoursPerDay || 8;
      P.rels.push({ id: r.task_pred_id, pred: r.pred_task_id, succ: r.task_id, type: REL_IN[r.pred_type] || 'FS', lag: round2((+r.lag_hr_cnt || 0) / hpd) });
    }
    if (!P.meta.dataDate) {
      let mx = null;
      for (const a of P.acts) { if (a.aFinish != null && (mx == null || a.aFinish > mx)) mx = a.aFinish; if (a.aStart != null && (mx == null || a.aStart > mx)) mx = a.aStart; }
      P.meta.dataDate = mx != null ? mx + 1 : D.todayDay();
    }
    P.meta.planStart = P.meta.planStart || Math.min.apply(null, P.acts.map((a) => P.startOf(a)).filter((x) => x != null));
    P.index();
    P.autoConfigureDims();
    P.snapshotPrev();
    return P;
  }
  function round2(n) { return Math.round(n * 100) / 100; }

  /* ---------------- Project -> XER ---------------- */
  function toXer(P, opts) {
    opts = Object.assign({ addDimCodes: false }, opts || {});
    const raw = P.raw && P.meta.source === 'xer' ? JSON.parse(JSON.stringify(P.raw)) : generateRaw(P);
    const pid = P.meta.projId;
    const T = table(raw, 'TASK');
    const byTask = new Map();
    const tid = fi(T, 'task_id'), tpid = fi(T, 'proj_id');
    T.rows.forEach((r) => { if (r[tpid] === pid) byTask.set(r[tid], r); });
    const keep = new Set(P.acts.map((a) => a.uid));
    const removed = new Set();
    for (const [id] of byTask) if (!keep.has(id)) removed.add(id);
    if (removed.size) {
      T.rows = T.rows.filter((r) => !(r[tpid] === pid && removed.has(r[tid])));
      for (const tn of ['TASKRSRC', 'TASKACTV', 'TASKMEMO', 'TASKPROC', 'TASKNOTE', 'TASKFIN', 'TRSRCFIN']) {
        const t = table(raw, tn); if (!t) continue;
        const i = fi(t, 'task_id'); if (i < 0) continue;
        t.rows = t.rows.filter((r) => !removed.has(r[i]));
      }
      const tp = table(raw, 'TASKPRED');
      if (tp) { const a = fi(tp, 'task_id'), b = fi(tp, 'pred_task_id'); tp.rows = tp.rows.filter((r) => !removed.has(r[a]) && !removed.has(r[b])); }
      const uv = table(raw, 'UDFVALUE');
      if (uv) { const a = fi(uv, 'fk_id'), b = fi(uv, 'proj_id'); uv.rows = uv.rows.filter((r) => !(r[b] === pid && removed.has(r[a]))); }
    }
    const template = T.rows.find((r) => r[tpid] === pid);
    let nextTask = maxId(T, 'task_id');
    const idMap = {};
    const stamp = D.fmtXerDT(D.todayDay(), 0);

    for (const a of P.acts) {
      const cal = P.cal(a);
      const hpd = cal.hoursPerDay || 8;
      let row = byTask.get(a.uid);
      if (!row) {
        row = template ? template.slice() : T.fields.map(() => '');
        const newId = String(++nextTask);
        idMap[a.uid] = newId;
        setF(T, row, 'task_id', newId); setF(T, row, 'proj_id', pid); setF(T, row, 'guid', '');
        setF(T, row, 'cstr_type', ''); setF(T, row, 'cstr_date', ''); setF(T, row, 'cstr_type2', ''); setF(T, row, 'cstr_date2', '');
        setF(T, row, 'rsrc_id', ''); setF(T, row, 'act_work_qty', '0'); setF(T, row, 'remain_work_qty', '0'); setF(T, row, 'target_work_qty', '0');
        setF(T, row, 'create_date', stamp); setF(T, row, 'create_user', 'ScheduleEngine');
        setF(T, row, 'complete_pct_type', PCT_OUT[a.pctType] || 'CP_Drtn');
        setF(T, row, 'duration_type', 'DT_FixedDUR2');
        T.rows.push(row);
      }
      const S = (d) => (d == null ? '' : D.fmtXerDT(d, cal.startMin));
      const F = (d) => (d == null ? '' : D.fmtXerDT(d, cal.endMin));
      const H = (days) => (days == null ? '' : String(round2(days * hpd)));
      setF(T, row, 'task_code', a.code);
      setF(T, row, 'task_name', a.name);
      setF(T, row, 'wbs_id', a.wbsId);
      setF(T, row, 'clndr_id', a.calId || P.defaultCalId);
      setF(T, row, 'task_type', TYPE_OUT[a.type] || 'TT_Task');
      setF(T, row, 'status_code', STATUS_OUT[a.status]);
      setF(T, row, 'phys_complete_pct', String(a.status === 'CO' ? 100 : round2(a.pct || 0)));
      setF(T, row, 'target_drtn_hr_cnt', H(a.origDur));
      setF(T, row, 'remain_drtn_hr_cnt', H(a.status === 'CO' ? 0 : a.remDur));
      setF(T, row, 'act_start_date', a.status !== 'NS' ? S(a.aStart) : '');
      setF(T, row, 'act_end_date', a.status === 'CO' ? F(a.aFinish) : '');
      const es = a.status === 'CO' ? a.aStart : a.status === 'IP' ? a.aStart : a.eStart;
      const ef = a.status === 'CO' ? a.aFinish : a.eFinish;
      setF(T, row, 'early_start_date', S(es != null ? es : a.tStart));
      setF(T, row, 'early_end_date', F(ef != null ? ef : a.tFinish));
      setF(T, row, 'late_start_date', S(a.status === 'CO' ? a.aStart : (a.status === 'IP' ? a.aStart : (a.lStart != null ? a.lStart : es))));
      setF(T, row, 'late_end_date', F(a.status === 'CO' ? a.aFinish : (a.lFinish != null ? a.lFinish : ef)));
      setF(T, row, 'restart_date', S(a.status === 'CO' ? a.aFinish : (a.rStart != null ? a.rStart : (a.status === 'IP' ? P.meta.dataDate : es))));
      setF(T, row, 'reend_date', F(a.status === 'CO' ? a.aFinish : ef));
      setF(T, row, 'rem_late_start_date', a.status === 'CO' ? '' : S(a.lStart));
      setF(T, row, 'rem_late_end_date', a.status === 'CO' ? '' : F(a.lFinish));
      if (a.status === 'NS') {
        setF(T, row, 'target_start_date', S(a.tStart != null ? a.tStart : es));
        setF(T, row, 'target_end_date', F(a.tFinish != null ? a.tFinish : ef));
      } else {
        if (!getF(T, row, 'target_start_date')) setF(T, row, 'target_start_date', S(a.tStart != null ? a.tStart : a.aStart));
        if (!getF(T, row, 'target_end_date')) setF(T, row, 'target_end_date', F(a.tFinish != null ? a.tFinish : ef));
      }
      setF(T, row, 'total_float_hr_cnt', a.status === 'CO' || a.tf == null ? '' : H(a.tf));
      setF(T, row, 'free_float_hr_cnt', a.status === 'CO' || a.ff == null ? '' : H(a.ff));
      setF(T, row, 'driving_path_flag', a.longest ? 'Y' : 'N');
      setF(T, row, 'expect_end_date', '');
      if (a.cstr && a.cstr.type) { setF(T, row, 'cstr_type', a.cstr.type); setF(T, row, 'cstr_date', a.cstr.date != null ? (/MEO|FIN/.test(a.cstr.type) ? F(a.cstr.date) : S(a.cstr.date)) : ''); }
      if (a.touched) { setF(T, row, 'update_date', stamp); setF(T, row, 'update_user', 'ScheduleEngine'); }
    }
    const realId = (u) => idMap[u] || u;

    // relationships
    const tpFields = ['task_pred_id', 'task_id', 'pred_task_id', 'proj_id', 'pred_proj_id', 'pred_type', 'lag_hr_cnt', 'comments', 'float_path', 'aref', 'arls'];
    const TP = ensureTable(raw, 'TASKPRED', tpFields, 'TASK');
    const a1 = fi(TP, 'task_id'), a2 = fi(TP, 'pred_task_id'), a3 = fi(TP, 'task_pred_id');
    const ownTask = new Set(P.acts.map((a) => realId(a.uid)));
    const relIds = new Set(P.rels.map((r) => r.id));
    TP.rows = TP.rows.filter((r) => !(ownTask.has(r[a1]) && ownTask.has(r[a2])) || relIds.has(r[a3]));
    const rowByRel = new Map(TP.rows.map((r) => [r[a3], r]));
    let nextRel = maxId(TP, 'task_pred_id');
    for (const rel of P.rels) {
      const s = P.act(rel.succ);
      const hpd = (s ? P.cal(s).hoursPerDay : 8) || 8;
      let row = rowByRel.get(rel.id);
      if (!row) {
        row = TP.fields.map(() => '');
        setF(TP, row, 'task_pred_id', String(++nextRel));
        setF(TP, row, 'proj_id', pid); setF(TP, row, 'pred_proj_id', pid);
        TP.rows.push(row);
      }
      setF(TP, row, 'task_id', realId(rel.succ));
      setF(TP, row, 'pred_task_id', realId(rel.pred));
      setF(TP, row, 'pred_type', 'PR_' + (rel.type || 'FS'));
      setF(TP, row, 'lag_hr_cnt', String(round2((rel.lag || 0) * hpd)));
    }

    // activity code assignments (engine-side edits + optional Building/EPC codes)
    writeCodes(P, raw, pid, realId, opts);

    // project row
    const PR = table(raw, 'PROJECT');
    if (PR) {
      const pidI = fi(PR, 'proj_id');
      const prow = PR.rows.find((r) => r[pidI] === pid);
      if (prow) {
        const dcal = P.cal(null);
        const ddMin = P.meta.ddMin != null ? P.meta.ddMin : 0;
        if (P.meta.dataDate != null) {
          const ddTxt = P.meta.ddEod ? D.fmtXerDT(dcal.prev(P.meta.dataDate - 1), ddMin) : D.fmtXerDT(P.meta.dataDate, ddMin);
          setF(PR, prow, 'last_recalc_date', ddTxt);
          if (fi(PR, 'next_data_date') >= 0 && getF(PR, prow, 'next_data_date')) setF(PR, prow, 'next_data_date', ddTxt);
        }
        if (P.meta.scheduledFinish != null) setF(PR, prow, 'scd_end_date', D.fmtXerDT(P.meta.scheduledFinish, dcal.endMin));
      }
    }
    return write(raw);
  }

  function writeCodes(P, raw, pid, realId, opts) {
    const wanted = []; // [taskId, typeName, valueCode]
    for (const a of P.acts) {
      for (const k in a.codes) if (a.codes[k]) wanted.push([realId(a.uid), k, a.codes[k]]);
      if (opts.addDimCodes) {
        const b = P.dim(a, 'building'), e = P.dim(a, 'epc');
        const bs = P.settings.dims.building, es = P.settings.dims.epc;
        if (b && !(bs.mode === 'code')) wanted.push([realId(a.uid), 'SE Building', b]);
        if (e && !(es.mode === 'code')) wanted.push([realId(a.uid), 'SE EPC Phase', e]);
      }
    }
    const typeFields = ['actv_code_type_id', 'actv_short_len', 'seq_num', 'actv_code_type', 'proj_id', 'wbs_id', 'actv_code_type_scope', 'super_flag'];
    const codeFields = ['actv_code_id', 'parent_actv_code_id', 'actv_code_type_id', 'actv_code_name', 'short_name', 'seq_num', 'color', 'total_assignments'];
    const TA = table(raw, 'TASKACTV');
    if (!wanted.length && !TA) return;
    const AT = ensureTable(raw, 'ACTVTYPE', typeFields, 'PROJWBS');
    const AC = ensureTable(raw, 'ACTVCODE', codeFields, 'ACTVTYPE');
    const TAT = ensureTable(raw, 'TASKACTV', ['task_id', 'actv_code_type_id', 'actv_code_id', 'proj_id'], 'TASKPRED');
    const typeByName = {};
    for (const r of AT.rows) {
      const scope = getF(AT, r, 'proj_id');
      if (!scope || scope === pid) typeByName[getF(AT, r, 'actv_code_type')] = getF(AT, r, 'actv_code_type_id');
    }
    const codeKey = {};
    for (const r of AC.rows) codeKey[getF(AC, r, 'actv_code_type_id') + '|' + getF(AC, r, 'short_name')] = getF(AC, r, 'actv_code_id');
    let nType = maxId(AT, 'actv_code_type_id'), nCode = maxId(AC, 'actv_code_id');
    const ctOf = (name) => {
      if (typeByName[name]) return typeByName[name];
      const row = AT.fields.map(() => '');
      const id = String(++nType);
      setF(AT, row, 'actv_code_type_id', id); setF(AT, row, 'actv_short_len', '60'); setF(AT, row, 'seq_num', String(nType));
      setF(AT, row, 'actv_code_type', name.slice(0, 40)); setF(AT, row, 'proj_id', pid); setF(AT, row, 'actv_code_type_scope', 'AS_Project');
      setF(AT, row, 'super_flag', 'N');
      AT.rows.push(row);
      typeByName[name] = id;
      return id;
    };
    const cvOf = (typeId, value) => {
      const short = String(value).slice(0, 60);
      const k = typeId + '|' + short;
      if (codeKey[k]) return codeKey[k];
      const row = AC.fields.map(() => '');
      const id = String(++nCode);
      setF(AC, row, 'actv_code_id', id); setF(AC, row, 'actv_code_type_id', typeId); setF(AC, row, 'actv_code_name', String(value).slice(0, 120));
      setF(AC, row, 'short_name', short); setF(AC, row, 'seq_num', String(nCode)); setF(AC, row, 'total_assignments', '0');
      AC.rows.push(row);
      codeKey[k] = id;
      return id;
    };
    const own = new Set(P.acts.map((a) => realId(a.uid)));
    const ti = fi(TAT, 'task_id');
    TAT.rows = TAT.rows.filter((r) => !own.has(r[ti]));
    for (const [task, type, val] of wanted) {
      const typeId = ctOf(type);
      const row = TAT.fields.map(() => '');
      setF(TAT, row, 'task_id', task); setF(TAT, row, 'actv_code_type_id', typeId); setF(TAT, row, 'actv_code_id', cvOf(typeId, val)); setF(TAT, row, 'proj_id', pid);
      TAT.rows.push(row);
    }
  }

  /* generate a fresh XER skeleton for projects built from Excel / PDF / MSP */
  function generateRaw(P) {
    const pid = P.meta.projId && /^\d+$/.test(P.meta.projId) ? P.meta.projId : '1001';
    P.meta.projId = pid;
    const today = D.fmtXerDT(D.todayDay(), 0);
    const raw = {
      header: ['ERMHDR', '19.12', D.fmtISO(D.todayDay()), 'Project', 'admin', 'Schedule Engine', 'dbxDatabaseNoName', 'Project Management', 'INR'],
      tables: []
    };
    const add = (name, fields, rows) => { raw.tables.push({ name, fields, rows: rows.map((o) => fields.map((f) => (o[f] == null ? '' : String(o[f])))) }); };
    add('CURRTYPE', ['curr_id', 'decimal_digit_cnt', 'curr_symbol', 'decimal_symbol', 'digit_group_symbol', 'pos_curr_fmt_type', 'neg_curr_fmt_type', 'curr_type', 'curr_short_name', 'group_digit_cnt', 'base_exch_rate'],
      [{ curr_id: 1, decimal_digit_cnt: 2, curr_symbol: 'Rs', decimal_symbol: '.', digit_group_symbol: ',', pos_curr_fmt_type: '#1.1', neg_curr_fmt_type: '(#1.1)', curr_type: 'Indian Rupee', curr_short_name: 'INR', group_digit_cnt: 3, base_exch_rate: 1 }]);
    add('OBS', ['obs_id', 'parent_obs_id', 'guid', 'seq_num', 'obs_name', 'obs_descr'], [{ obs_id: 1, seq_num: 0, obs_name: 'Enterprise', obs_descr: '' }]);
    // calendars
    const calIds = {};
    let cid = 100;
    const calRows = [];
    for (const k in P.calendars) {
      const c = P.calendars[k];
      const id = /^\d+$/.test(c.id) ? c.id : String(++cid);
      calIds[k] = id;
      const workDays = c.workWeek.filter(Boolean).length;
      calRows.push({
        clndr_id: id, default_flag: k === P.defaultCalId ? 'Y' : 'N', clndr_name: c.name, proj_id: '', base_clndr_id: '', last_chng_date: today,
        clndr_type: 'CA_Base', day_hr_cnt: c.hoursPerDay, week_hr_cnt: c.hoursPerDay * workDays, month_hr_cnt: Math.round(c.hoursPerDay * workDays * 52 / 12),
        year_hr_cnt: c.hoursPerDay * workDays * 52, rsrc_private: 'N', clndr_data: c.toClndrData()
      });
    }
    add('CALENDAR', ['clndr_id', 'default_flag', 'clndr_name', 'proj_id', 'base_clndr_id', 'last_chng_date', 'clndr_type', 'day_hr_cnt', 'week_hr_cnt', 'month_hr_cnt', 'year_hr_cnt', 'rsrc_private', 'clndr_data'], calRows);
    for (const a of P.acts) if (a.calId && calIds[a.calId]) a.calId = calIds[a.calId];
    const newCals = {};
    for (const k in P.calendars) { const c = P.calendars[k]; c.id = calIds[k]; newCals[c.id] = c; }
    P.calendars = newCals;
    P.defaultCalId = calIds[P.defaultCalId] || Object.keys(newCals)[0];
    const dcal = P.cal(null);
    const minStart = Math.min.apply(null, P.acts.map((a) => P.startOf(a)).filter((x) => x != null).concat([P.meta.dataDate || D.todayDay()]));
    add('PROJECT', ['proj_id', 'fy_start_month_num', 'rsrc_self_add_flag', 'allow_complete_flag', 'rsrc_multi_assign_flag', 'checkout_flag', 'project_flag', 'step_complete_flag', 'cost_qty_recalc_flag',
      'batch_sum_flag', 'name_sep_char', 'def_complete_pct_type', 'proj_short_name', 'acct_id', 'orig_proj_id', 'source_proj_id', 'base_type_id', 'clndr_id', 'sum_base_proj_id', 'task_code_base',
      'task_code_step', 'priority_num', 'wbs_max_sum_level', 'strgy_priority_num', 'last_checksum', 'critical_drtn_hr_cnt', 'def_cost_per_qty', 'last_recalc_date', 'plan_start_date', 'plan_end_date',
      'scd_end_date', 'add_date', 'last_tasksum_date', 'fcst_start_date', 'def_duration_type', 'task_code_prefix', 'guid', 'def_qty_type', 'add_by_name', 'web_local_root_path', 'proj_url',
      'def_rate_type', 'add_act_remain_flag', 'act_this_per_link_flag', 'def_task_type', 'act_pct_link_flag', 'critical_path_type', 'task_code_prefix_flag', 'def_rollup_dates_flag',
      'use_project_baseline_flag', 'rem_target_link_flag', 'reset_planned_flag', 'allow_neg_act_flag', 'sum_assign_level', 'last_fin_dates_id', 'fintmpl_id', 'last_baseline_update_date',
      'cr_external_key', 'apply_actuals_date', 'location_id', 'loaded_scope_level', 'export_flag', 'new_fin_dates_id', 'baselines_to_export_flag', 'baseline_names_to_export', 'next_data_date',
      'close_period_flag', 'sum_refresh_date', 'trsrcsum_loaded', 'sumtask_loaded'],
    [{
      proj_id: pid, fy_start_month_num: 4, rsrc_self_add_flag: 'Y', allow_complete_flag: 'Y', rsrc_multi_assign_flag: 'Y', checkout_flag: 'N', project_flag: 'Y', step_complete_flag: 'N',
      cost_qty_recalc_flag: 'Y', batch_sum_flag: 'Y', name_sep_char: '.', def_complete_pct_type: 'CP_Phys', proj_short_name: String(P.meta.code || 'PROJ').slice(0, 40), clndr_id: P.defaultCalId,
      task_code_base: 1000, task_code_step: 10, priority_num: 10, wbs_max_sum_level: 0, strgy_priority_num: 100, critical_drtn_hr_cnt: 0, def_cost_per_qty: 0,
      last_recalc_date: P.meta.dataDate != null ? D.fmtXerDT(P.meta.dataDate, 0) : '', plan_start_date: D.fmtXerDT(P.meta.planStart != null ? P.meta.planStart : minStart, dcal.startMin),
      plan_end_date: P.meta.mustFinish != null ? D.fmtXerDT(P.meta.mustFinish, dcal.endMin) : '', scd_end_date: P.meta.scheduledFinish != null ? D.fmtXerDT(P.meta.scheduledFinish, dcal.endMin) : '',
      add_date: today, def_duration_type: 'DT_FixedDUR2', def_qty_type: 'QT_Hour', add_by_name: 'Schedule Engine', def_rate_type: 'COST_PER_QTY', add_act_remain_flag: 'N',
      act_this_per_link_flag: 'Y', def_task_type: 'TT_Task', act_pct_link_flag: 'N', critical_path_type: 'CT_TotFloat', task_code_prefix_flag: 'Y', def_rollup_dates_flag: 'Y',
      use_project_baseline_flag: 'Y', rem_target_link_flag: 'Y', reset_planned_flag: 'N', allow_neg_act_flag: 'N', sum_assign_level: 'SL_Taskrsrc', loaded_scope_level: 7, export_flag: 'Y',
      baselines_to_export_flag: 'N'
    }]);
    // WBS: numeric ids
    const wbsIds = {};
    let wid = 5000;
    const wlist = Object.values(P.wbs);
    for (const w of wlist) wbsIds[w.id] = /^\d+$/.test(w.id) ? w.id : String(++wid);
    const rootId = P.rootWbsId ? wbsIds[P.rootWbsId] : String(++wid);
    const wrows = [];
    if (!P.rootWbsId) wrows.push({ wbs_id: rootId, proj_id: pid, obs_id: 1, seq_num: 0, est_wt: 1, proj_node_flag: 'Y', sum_data_flag: 'Y', status_code: 'WS_Open', wbs_short_name: P.meta.code, wbs_name: P.meta.name, parent_wbs_id: '', ev_user_pct: 6, ev_etc_user_value: 0.88, ev_compute_type: 'EC_Cmp_pct', ev_etc_compute_type: 'EE_Rem_hr' });
    for (const w of wlist) {
      const isRoot = w.id === P.rootWbsId;
      wrows.push({
        wbs_id: wbsIds[w.id], proj_id: pid, obs_id: 1, seq_num: w.seq || 0, est_wt: 1, proj_node_flag: isRoot ? 'Y' : 'N', sum_data_flag: 'Y', status_code: 'WS_Open',
        wbs_short_name: isRoot ? P.meta.code : String(w.code || w.name).slice(0, 20), wbs_name: isRoot ? P.meta.name : w.name,
        parent_wbs_id: isRoot ? '' : (w.parentId && wbsIds[w.parentId] ? wbsIds[w.parentId] : rootId),
        ev_user_pct: 6, ev_etc_user_value: 0.88, ev_compute_type: 'EC_Cmp_pct', ev_etc_compute_type: 'EE_Rem_hr'
      });
    }
    add('PROJWBS', ['wbs_id', 'proj_id', 'obs_id', 'seq_num', 'est_wt', 'proj_node_flag', 'sum_data_flag', 'status_code', 'wbs_short_name', 'wbs_name', 'phase_id', 'parent_wbs_id', 'ev_user_pct',
      'ev_etc_user_value', 'orig_cost', 'indep_remain_total_cost', 'ann_dscnt_rate_pct', 'dscnt_period_type', 'indep_remain_work_qty', 'anticip_start_date', 'anticip_end_date', 'ev_compute_type',
      'ev_etc_compute_type', 'guid', 'tmpl_guid', 'plan_open_state'], wrows);
    // remap ids in the model so later writes match
    const newWbs = {};
    for (const w of wlist) { const nw = Object.assign({}, w, { id: wbsIds[w.id], parentId: w.parentId ? wbsIds[w.parentId] || rootId : null }); newWbs[nw.id] = nw; }
    if (!P.rootWbsId) newWbs[rootId] = { id: rootId, parentId: null, code: P.meta.code, name: P.meta.name, seq: 0 };
    for (const w of Object.values(newWbs)) if (w.id !== rootId && !w.parentId) w.parentId = rootId;
    P.wbs = newWbs; P.rootWbsId = rootId;
    // tasks: numeric ids
    let tid = 10000;
    const tmap = {};
    for (const a of P.acts) { tmap[a.uid] = /^\d+$/.test(a.uid) && +a.uid > 0 ? a.uid : String(++tid); }
    const used = new Set();
    for (const a of P.acts) { if (used.has(tmap[a.uid])) tmap[a.uid] = String(++tid); used.add(tmap[a.uid]); }
    for (const a of P.acts) { a.uid = tmap[a.uid]; a.wbsId = a.wbsId && wbsIds[a.wbsId] ? wbsIds[a.wbsId] : rootId; if (!a.calId || !P.calendars[a.calId]) a.calId = P.defaultCalId; }
    let rid = 0;
    for (const r of P.rels) { r.pred = tmap[r.pred] || r.pred; r.succ = tmap[r.succ] || r.succ; r.id = String(++rid); }
    P.invalidate();
    P.undoStack = []; P.redoStack = [];
    add('TASK', ['task_id', 'proj_id', 'wbs_id', 'clndr_id', 'phys_complete_pct', 'rev_fdbk_flag', 'est_wt', 'lock_plan_flag', 'auto_compute_act_flag', 'complete_pct_type', 'task_type',
      'duration_type', 'status_code', 'task_code', 'task_name', 'rsrc_id', 'total_float_hr_cnt', 'free_float_hr_cnt', 'remain_drtn_hr_cnt', 'act_work_qty', 'remain_work_qty', 'target_work_qty',
      'target_drtn_hr_cnt', 'target_equip_qty', 'act_equip_qty', 'remain_equip_qty', 'cstr_date', 'act_start_date', 'act_end_date', 'late_start_date', 'late_end_date', 'expect_end_date',
      'early_start_date', 'early_end_date', 'restart_date', 'reend_date', 'target_start_date', 'target_end_date', 'rem_late_start_date', 'rem_late_end_date', 'cstr_type', 'priority_type',
      'suspend_date', 'resume_date', 'float_path', 'float_path_order', 'guid', 'tmpl_guid', 'cstr_date2', 'cstr_type2', 'driving_path_flag', 'act_this_per_work_qty', 'act_this_per_equip_qty',
      'external_early_start_date', 'external_late_end_date', 'create_date', 'update_date', 'create_user', 'update_user', 'location_id'],
    P.acts.map((a) => ({
      task_id: a.uid, proj_id: pid, wbs_id: a.wbsId, clndr_id: a.calId, rev_fdbk_flag: 'N', est_wt: 1, lock_plan_flag: 'N', auto_compute_act_flag: 'N', complete_pct_type: PCT_OUT[a.pctType] || 'CP_Phys',
      duration_type: 'DT_FixedDUR2', act_work_qty: 0, remain_work_qty: 0, target_work_qty: 0, target_equip_qty: 0, act_equip_qty: 0, remain_equip_qty: 0, priority_type: 'PT_Normal',
      act_this_per_work_qty: 0, act_this_per_equip_qty: 0, create_date: today, create_user: 'ScheduleEngine'
    })));
    add('TASKPRED', ['task_pred_id', 'task_id', 'pred_task_id', 'proj_id', 'pred_proj_id', 'pred_type', 'lag_hr_cnt', 'comments', 'float_path', 'aref', 'arls'], []);
    P.meta.source = 'xer-generated';
    return raw;
  }

  SE.xer = { parse, write, table, objects, listProjects, toProject, toXer, decode, encode, generateRaw };
})(typeof module === 'object' && module.exports ? (global.SE = global.SE || {}) : (window.SE = window.SE || {}));
