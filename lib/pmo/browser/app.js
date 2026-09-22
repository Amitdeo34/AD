// The engine as a page, with no server behind it.
//
// Everything here runs in the tab: the workbook is parsed, reconciled and
// rendered on the machine it was opened on, and the project data stays in that
// browser's own storage. Nothing is uploaded anywhere, which is the point —
// a PMO can open this file on a client site with no install and no network.
import { DOC_TYPES, DOC_TYPE_KEYS } from '../schema.js';
import { REPORT_TYPES, REPORT_TYPE_KEYS } from '../reports/index.js';
import { renderBundleHtml, renderHtml } from '../render/html.js';
import { renderXlsx, renderScheduleXlsx } from '../render/xlsx.js';
import { renderDocx } from '../render/docx.js';
import { writeCsv } from '../ingest/csv.js';
import { inspectUpload, commitUpload } from '../ingest/pipeline.js';
import { isoDay } from '../dates.js';
import { demoProject } from '../demo.js';
import {
  createProject, deleteProject, deleteDataset, getProject, listProjects, saveDataset, storageUsed,
} from './store.js';
import { produceReport, projectData, projectOverview } from '../service.js';

const $ = (selector, root = document) => root.querySelector(selector);
const esc = (value) => String(value ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const percent = (value, digits = 1) => (Number.isFinite(value) ? `${(value * 100).toFixed(digits)}%` : '—');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function shortDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return `${String(date.getUTCDate()).padStart(2, '0')} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

const state = { slug: null, inspection: null, selections: {}, file: null };

// ------------------------------------------------------------------ files

function deliver(bytes, fileName, type) {
  const blob = new Blob([bytes], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function openHtml(html, fallbackName) {
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const opened = window.open(url, '_blank');
  if (!opened) {
    // Pop-ups blocked: the report still has to reach the user.
    deliver(html, fallbackName, 'text/html');
    toast('Your browser blocked the new tab, so the report was downloaded instead.');
  }
  setTimeout(() => URL.revokeObjectURL(url), 120000);
}

let toastTimer = null;
function toast(message, tone = 'info') {
  const bar = $('#toast');
  bar.textContent = message;
  bar.className = `toast show ${tone}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { bar.className = 'toast'; }, 6000);
}

// --------------------------------------------------------------- projects

function currentProject() {
  return state.slug ? getProject(state.slug) : null;
}

function renderProjectBar() {
  const projects = listProjects();
  if (state.slug && !projects.some((project) => project.slug === state.slug)) state.slug = null;
  if (!state.slug && projects.length) state.slug = projects[0].slug;

  $('#projectBar').innerHTML = `
    <label class="inline">
      <span>Project</span>
      <select id="projectPick" ${projects.length ? '' : 'disabled'}>
        ${projects.length
          ? projects.map((project) => `<option value="${esc(project.slug)}" ${project.slug === state.slug ? 'selected' : ''}>${esc(project.name)}</option>`).join('')
          : '<option>No projects yet</option>'}
      </select>
    </label>
    <button class="btn secondary" id="newProject">New project</button>
    <button class="btn secondary" id="loadDemo">Load worked example</button>
    ${state.slug ? '<button class="btn danger" id="removeProject">Delete project</button>' : ''}
    <span class="spacer"></span>
    <span class="muted small">${(storageUsed() / 1024 / 1024).toFixed(1)} MB stored in this browser</span>`;
}

function newProjectForm() {
  $('#panels').innerHTML = `
    <section class="card">
      <h2>New project</h2>
      <p class="muted">Only the name is required. The rest sharpens the reports — contract value drives earned value, and the dates drive slippage.</p>
      <form id="createForm" class="grid two">
        <label><span>Project name *</span><input name="name" required placeholder="Metro Rail Package MR-04"></label>
        <label><span>Project code</span><input name="code" placeholder="MR-04"></label>
        <label><span>Client</span><input name="client"></label>
        <label><span>Contractor</span><input name="contractor"></label>
        <label><span>Prepared by</span><input name="consultant" placeholder="Project Management Consultant"></label>
        <label><span>Location</span><input name="location"></label>
        <label><span>Contract value (₹)</span><input name="contractValue" inputmode="decimal" placeholder="1026420000"></label>
        <label><span>Currency</span><input name="currency" value="INR"></label>
        <label><span>Commencement</span><input name="startDate" type="date"></label>
        <label><span>Contract completion</span><input name="contractCompletionDate" type="date"></label>
        <div class="full"><button class="btn" type="submit">Create project</button></div>
      </form>
    </section>`;

  $('#createForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.target).entries());
    if (!form.name?.trim()) return;
    const value = Number(String(form.contractValue).replace(/[₹,\s]/g, ''));
    const project = createProject({
      ...form,
      name: form.name.trim(),
      contractValue: Number.isFinite(value) && value > 0 ? value : null,
    });
    state.slug = project.slug;
    toast(`Created "${project.name}". Upload the DPR next.`, 'good');
    render();
  });
}

// ----------------------------------------------------------------- upload

function renderUpload() {
  return `
    <section class="card">
      <h2>Upload data</h2>
      <p class="muted">Excel, CSV, Primavera .xer, MS Project XML, JSON or a text-layer PDF. The engine works out what it is; nothing is stored until you confirm.</p>
      <div id="drop" class="drop">
        <strong>Drop a file here</strong>
        <span class="muted small">or</span>
        <button class="btn secondary" id="pick">Choose a file</button>
        <input id="file" type="file" accept=".xlsx,.xlsm,.csv,.tsv,.txt,.json,.xer,.xml,.pdf" hidden>
      </div>
      <div id="mapping"></div>
    </section>`;
}

function renderMapping() {
  const host = $('#mapping');
  if (!host) return;
  if (!state.inspection) {
    host.innerHTML = '';
    return;
  }

  const { inspection } = state;
  const chosen = Object.values(state.selections).filter((selection) => selection.include).length;

  host.innerHTML = `
    ${inspection.notes?.length ? `<div class="note warn">${esc(inspection.notes.join(' '))}</div>` : ''}
    ${inspection.sheets.map((sheet, index) => renderSheet(sheet, index)).join('')}
    <div class="actions">
      <span class="muted small">${chosen} sheet${chosen === 1 ? '' : 's'} selected from <b>${esc(inspection.fileName)}</b></span>
      <span class="spacer"></span>
      <button class="btn secondary" id="discard">Discard</button>
      <button class="btn" id="commit" ${chosen ? '' : 'disabled'}>Import ${chosen || ''} sheet${chosen === 1 ? '' : 's'}</button>
    </div>`;
}

function renderSheet(sheet, index) {
  if (sheet.empty) {
    return `<div class="sheet"><h3>${esc(sheet.name)}</h3><p class="muted small">No tabular data on this sheet — it will be skipped.</p></div>`;
  }
  const selection = state.selections[sheet.name];
  const fields = DOC_TYPES[selection.docType].fields;
  const mapped = selection.columns.filter((column) => column.field).length;
  const confidence = Math.round((sheet.confidence ?? 0) * 100);
  const missing = fields.filter((field) => field.required && !selection.columns.some((column) => column.field === field.key));

  return `
    <div class="sheet" data-sheet="${esc(sheet.name)}">
      <div class="sheet-head">
        <h3>${esc(sheet.name)}</h3>
        <label class="inline"><input type="checkbox" data-role="include" ${selection.include ? 'checked' : ''}> Import</label>
      </div>
      <p class="muted small">${sheet.rowCount} rows · header on row ${selection.headerRow + 1}${selection.headerSpans > 1 ? ` and ${selection.headerRow + 2}` : ''} · ${mapped} of ${selection.columns.length} columns mapped</p>
      <p class="small">
        ${sheet.template
          ? `<span class="pill good">Saved mapping reused — used ${sheet.template.usedCount}× before</span>`
          : `<span class="pill ${confidence >= 80 ? 'good' : confidence >= 55 ? 'warn' : 'bad'}">Detected with ${confidence}% confidence</span>`}
        ${(sheet.detected ?? []).slice(1, 3).map((guess) => `<span class="muted">also looks like ${esc(DOC_TYPES[guess.docType]?.short ?? guess.docType)} (${Math.round(guess.score * 100)}%)</span>`).join(' ')}
      </p>
      <div class="grid three">
        <label><span>This sheet is</span>
          <select data-role="docType">
            ${DOC_TYPE_KEYS.map((key) => `<option value="${key}" ${key === selection.docType ? 'selected' : ''}>${esc(DOC_TYPES[key].label)}</option>`).join('')}
          </select>
        </label>
        <label><span>Header row</span><input type="number" min="1" data-role="headerRow" value="${selection.headerRow + 1}"></label>
        <label><span>Header rows</span>
          <select data-role="headerSpans">
            <option value="1" ${selection.headerSpans === 1 ? 'selected' : ''}>1</option>
            <option value="2" ${selection.headerSpans === 2 ? 'selected' : ''}>2 (merged)</option>
          </select>
        </label>
      </div>
      ${missing.length ? `<div class="note warn">Not mapped yet: <b>${esc(missing.map((field) => field.label).join(', '))}</b>. Rows without these cannot be used.</div>` : ''}
      <table class="map">
        <thead><tr><th>Column in your file</th><th>Means</th><th>Confidence</th><th>First value</th></tr></thead>
        <tbody>
          ${selection.columns.map((column, at) => {
            const sample = sheet.sample?.[selection.headerRow + selection.headerSpans]?.[column.column];
            return `<tr>
              <td>${column.header ? esc(column.header) : '<span class="muted">(blank)</span>'}</td>
              <td><select data-role="field" data-at="${at}">
                <option value="">— not imported —</option>
                ${fields.map((field) => `<option value="${field.key}" ${column.field === field.key ? 'selected' : ''}>${esc(field.label)}${field.required ? ' *' : ''}</option>`).join('')}
              </select></td>
              <td class="muted">${column.field ? `${Math.round((column.confidence ?? 0) * 100)}%` : '—'}</td>
              <td class="muted">${sample === null || sample === undefined ? '—' : esc(String(sample).slice(0, 40))}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
      <p class="muted small">${sheet.preview?.totalRows ?? 0} data rows will be imported${sheet.preview?.skipped ? `, ${sheet.preview.skipped} skipped as blank, total or heading rows` : ''}.${
        sheet.preview?.issueCount ? ` ${sheet.preview.issueCount} value(s) could not be read — for example row ${sheet.preview.issues[0].row}: ${esc(sheet.preview.issues[0].message)}.` : ''}</p>
    </div>`;
}

async function handleFile(file) {
  if (!file) return;
  const project = currentProject();
  if (!project) return;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    state.file = { name: file.name, buffer };
    const inspection = inspectUpload({ fileName: file.name, buffer, projectId: project.id });
    state.inspection = inspection;
    state.selections = Object.fromEntries(
      inspection.sheets.filter((sheet) => !sheet.empty).map((sheet) => [
        sheet.name,
        {
          include: sheet.name === inspection.suggestedSheet || (sheet.confidence ?? 0) >= 0.7,
          docType: sheet.docType,
          headerRow: sheet.headerRow,
          headerSpans: sheet.headerSpans,
          columns: sheet.columns.map((column) => ({ ...column })),
        },
      ]),
    );
    renderMapping();
  } catch (err) {
    toast(err.message, 'bad');
  }
}

function reinspectSheet(sheetName) {
  // Changing the document type or the header row re-reads that sheet, so the
  // column list and the proposed mapping follow the new choice.
  const selection = state.selections[sheetName];
  const sheet = state.inspection.sheets.find((item) => item.name === sheetName);
  const fresh = inspectUpload({
    fileName: state.file.name,
    buffer: state.file.buffer,
    projectId: currentProject().id,
    docTypeHint: selection.docType,
  }).sheets.find((item) => item.name === sheetName);
  if (!fresh || fresh.empty) return;
  Object.assign(sheet, fresh);
  selection.columns = fresh.columns.map((column) => ({ ...column }));
  if (selection.headerRow !== fresh.headerRow) {
    selection.headerRow = fresh.headerRow;
    selection.headerSpans = fresh.headerSpans;
  }
}

function commit() {
  const project = currentProject();
  const selections = Object.entries(state.selections)
    .filter(([, selection]) => selection.include)
    .map(([sheet, selection]) => ({
      sheet,
      docType: selection.docType,
      headerRow: selection.headerRow,
      headerSpans: selection.headerSpans,
      dataStartRow: selection.headerRow + selection.headerSpans,
      columns: selection.columns.map(({ column, header, field }) => ({ column, header, field })),
    }));

  try {
    const datasets = commitUpload({
      projectId: project.id,
      fileName: state.file.name,
      buffer: state.file.buffer,
      selections,
    });
    const rows = datasets.reduce((total, dataset) => total + dataset.rowCount, 0);
    state.inspection = null;
    state.selections = {};
    state.file = null;
    toast(`${rows} rows imported. The mapping is saved, so this format comes through pre-mapped next time.`, 'good');
    render();
  } catch (err) {
    toast(err.message, 'bad');
  }
}

// ---------------------------------------------------------------- reports

function renderStatus(overview) {
  const { position, readiness, datasets } = overview;
  const rag = !position ? null
    : position.variancePercent <= -0.15 ? 'bad'
      : position.variancePercent <= -0.05 ? 'warn' : 'good';

  return `
    <section class="card">
      <h2>Position</h2>
      ${position ? `
        <div class="stats">
          ${stat('Status', rag === 'bad' ? 'Red' : rag === 'warn' ? 'Amber' : 'Green', `Variance ${percent(position.variancePercent)}`, rag)}
          ${stat('Physical progress', percent(position.actualPercent), `Planned ${percent(position.plannedPercent)}`)}
          ${stat('Forecast completion', shortDate(position.forecastFinish), position.baselineFinish ? `Contract ${shortDate(position.baselineFinish)}` : 'No contract date set', (position.delayDays ?? 0) > 30 ? 'bad' : (position.delayDays ?? 0) > 0 ? 'warn' : 'good')}
          ${stat('Slippage', Number.isFinite(position.delayDays) ? `${position.delayDays} days` : '—', `Data date ${shortDate(position.asOf)}`, (position.delayDays ?? 0) > 30 ? 'bad' : (position.delayDays ?? 0) > 0 ? 'warn' : 'good')}
        </div>` : '<p class="muted">Upload a DPR to see the position.</p>'}

      <h3>Data readiness</h3>
      <div class="meter"><div class="meter-fill ${readiness.score >= 85 ? 'good' : readiness.score >= 60 ? 'warn' : 'bad'}" style="width:${readiness.score}%"></div></div>
      <p class="small"><b>${readiness.score}/100 — ${esc(readiness.grade)}</b> · ${readiness.counts.high} material, ${readiness.counts.medium} moderate, ${readiness.counts.low} minor observations</p>
      ${readiness.findings.length ? `<ul class="findings">${readiness.findings.slice(0, 6).map((finding) => `<li><b>${esc(finding.message)}</b><br><span class="muted small">${esc(finding.fix)}</span></li>`).join('')}</ul>` : ''}

      <h3>Uploaded data</h3>
      ${datasets.length ? `<table class="map"><thead><tr><th>Document</th><th>File</th><th>Rows</th><th></th></tr></thead><tbody>
        ${datasets.map((dataset) => `<tr>
          <td>${esc(DOC_TYPES[dataset.docType]?.short ?? dataset.docType)}</td>
          <td class="muted">${esc(dataset.fileName)} · ${esc(dataset.sheet)}</td>
          <td>${dataset.rowCount}</td>
          <td><button class="link danger" data-remove="${dataset.id}">Remove</button></td>
        </tr>`).join('')}
      </tbody></table>` : '<p class="muted small">Nothing uploaded yet.</p>'}
    </section>`;
}

function stat(label, value, sub, tone) {
  return `<div class="stat ${tone ?? ''}"><span class="stat-label">${esc(label)}</span><span class="stat-value">${esc(value)}</span><span class="stat-sub">${esc(sub ?? '')}</span></div>`;
}

function renderReports(overview) {
  const asOf = overview.position?.asOf ? isoDay(overview.position.asOf) : '';
  return `
    <section class="card">
      <h2>Reports</h2>
      <p class="muted">Generated from the current uploads every time — never a stale snapshot. All formats carry the same numbers.</p>
      <div class="grid three">
        <label><span>Data date</span><input type="date" id="asOf" value="${esc(asOf)}"></label>
        <label><span>Period from (optional)</span><input type="date" id="from"></label>
        <label><span>Period to (optional)</span><input type="date" id="to"></label>
      </div>
      <div class="report-grid">
        ${REPORT_TYPE_KEYS.map((key) => {
          const spec = REPORT_TYPES[key];
          const ready = overview.available.find((item) => item.key === key);
          return `<div class="report ${ready.ready ? '' : 'blocked'}">
            <h3>${esc(spec.label)}</h3>
            <p class="muted small">${esc(spec.description)}</p>
            ${ready.ready ? `<div class="btn-row">
              <button class="btn small" data-report="${key}" data-format="html">Open</button>
              <button class="btn secondary small" data-report="${key}" data-format="xlsx">Excel</button>
              <button class="btn secondary small" data-report="${key}" data-format="docx">Word</button>
              <button class="btn secondary small" data-report="${key}" data-format="csv">CSV</button>
              ${key === 'schedule-update' ? `<button class="btn secondary small" data-report="${key}" data-format="p6">For P6/MSP</button>` : ''}
            </div>` : `<p class="small warn-text">Upload ${esc(ready.missing.map((docType) => DOC_TYPES[docType].short).join(' and '))} first.</p>`}
          </div>`;
        }).join('')}
      </div>
      <div class="pack">
        <div>
          <h3>Complete reporting pack</h3>
          <p class="muted small">All seven reports merged into one document — one cover, one contents page, each report on its own page when printed.</p>
        </div>
        <button class="btn" id="bundle">Open the complete pack</button>
      </div>
    </section>`;
}

function generate(type, format) {
  const project = currentProject();
  const asOf = $('#asOf')?.value || null;
  const from = $('#from')?.value || null;
  const to = $('#to')?.value || null;
  const stem = `${project.code ?? project.slug}-${type}-${asOf ?? isoDay(new Date())}`;

  try {
    const { pack, context } = produceReport(project, { type, asOf, from, to, options: {} }, { store: true });

    if (format === 'html') return openHtml(renderHtml(pack), `${stem}.html`);
    if (format === 'xlsx') {
      return deliver(renderXlsx(pack), `${stem}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    }
    if (format === 'docx') {
      return deliver(renderDocx(pack), `${stem}.docx`, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    }
    if (format === 'p6') {
      return deliver(renderScheduleXlsx(context.model), `${stem}-p6.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    }
    const csv = writeCsv([
      ['Severity', 'Category', 'Area', 'Subject', 'Observation', 'Measure', 'Recommended action', 'Owner', 'Due', 'Trend', 'Periods open', 'New'],
      ...context.exceptions.map((item) => [
        item.severity, item.category, item.area ?? '', item.subject, item.detail, item.metricDisplay ?? '',
        item.recommendation, item.owner ?? '', item.dueDate ? isoDay(item.dueDate) : '', item.trend, item.periodsOpen, item.isNew ? 'Yes' : 'No',
      ]),
    ]);
    return deliver(csv, `${stem}-exceptions.csv`, 'text/csv;charset=utf-8');
  } catch (err) {
    console.error(err);
    return toast(err.message, 'bad');
  }
}

function generateBundle() {
  const project = currentProject();
  const asOf = $('#asOf')?.value || null;
  try {
    const packs = REPORT_TYPE_KEYS
      .filter((type) => {
        const data = projectData(project.id);
        return REPORT_TYPES[type].needs.every((docType) => (data[docType]?.length ?? 0) > 0);
      })
      .map((type) => produceReport(project, { type, asOf, options: {} }).pack);
    if (!packs.length) return toast('Upload a DPR first.', 'warn');
    openHtml(renderBundleHtml(packs, { title: 'Project Reporting Pack' }), `${project.code ?? project.slug}-reporting-pack.html`);
  } catch (err) {
    console.error(err);
    toast(err.message, 'bad');
  }
}

// ------------------------------------------------------------------ demo

function loadDemo() {
  const { project, data } = demoProject();
  const existing = getProject('mr-04');
  if (existing) deleteProject('mr-04');
  const created = createProject({ ...project, slug: 'mr-04' });
  for (const [docType, records] of Object.entries(data)) {
    if (!records?.length) continue;
    saveDataset({
      projectId: created.id,
      docType,
      fileName: 'worked-example.xlsx',
      sheet: DOC_TYPES[docType].short,
      rowCount: records.length,
      skipped: 0,
      issues: [],
      issueCount: 0,
      mapping: { headerRow: 0, headerSpans: 1, columns: [] },
      fingerprint: `demo-${docType}`,
      records,
    });
  }
  state.slug = created.slug;
  toast('Worked example loaded — a part-built metro package, behind programme, with a monsoon suspension and a missing week of DPRs.', 'good');
  render();
}

// ---------------------------------------------------------------- render

function render() {
  renderProjectBar();
  const project = currentProject();

  if (!project) {
    $('#panels').innerHTML = `
      <section class="card empty">
        <h2>Start here</h2>
        <p>Create a project, then upload the client's DPR. Everything else follows from that — and if you want to see what the engine does before uploading anything, load the worked example.</p>
        <div class="btn-row"><button class="btn" id="startNew">New project</button><button class="btn secondary" id="startDemo">Load worked example</button></div>
      </section>`;
    $('#startNew').addEventListener('click', newProjectForm);
    $('#startDemo').addEventListener('click', loadDemo);
    return;
  }

  const overview = projectOverview(project);
  $('#panels').innerHTML = `
    <div class="project-head">
      <h1>${esc(project.name)}</h1>
      <p class="muted">${esc([project.code, project.client, project.contractor, project.location].filter(Boolean).join(' · ') || 'No client details yet')}</p>
    </div>
    ${renderUpload()}
    ${renderStatus(overview)}
    ${renderReports(overview)}`;
  renderMapping();
}

// Event delegation: one listener for a page that re-renders constantly.
document.addEventListener('click', (event) => {
  const target = event.target;
  if (target.id === 'newProject') return newProjectForm();
  if (target.id === 'loadDemo') return loadDemo();
  if (target.id === 'pick') return $('#file').click();
  if (target.id === 'discard') {
    state.inspection = null;
    state.selections = {};
    state.file = null;
    return renderMapping();
  }
  if (target.id === 'commit') return commit();
  if (target.id === 'bundle') return generateBundle();
  if (target.id === 'removeProject') {
    const project = currentProject();
    if (project && window.confirm(`Delete "${project.name}" and everything uploaded to it? This cannot be undone.`)) {
      deleteProject(project.slug);
      state.slug = null;
      toast('Project deleted.');
      render();
    }
    return undefined;
  }
  if (target.dataset?.report) return generate(target.dataset.report, target.dataset.format);
  if (target.dataset?.remove) {
    deleteDataset(Number(target.dataset.remove));
    toast('Upload removed.');
    return render();
  }
  return undefined;
});

document.addEventListener('change', (event) => {
  const target = event.target;
  if (target.id === 'projectPick') {
    state.slug = target.value;
    state.inspection = null;
    return render();
  }
  if (target.id === 'file') return handleFile(target.files?.[0]);

  const sheetEl = target.closest?.('[data-sheet]');
  if (!sheetEl) return undefined;
  const selection = state.selections[sheetEl.dataset.sheet];
  const role = target.dataset.role;

  if (role === 'include') selection.include = target.checked;
  else if (role === 'docType') {
    selection.docType = target.value;
    reinspectSheet(sheetEl.dataset.sheet);
  } else if (role === 'headerRow') {
    selection.headerRow = Math.max(0, Number(target.value) - 1);
  } else if (role === 'headerSpans') {
    selection.headerSpans = Number(target.value);
  } else if (role === 'field') {
    const at = Number(target.dataset.at);
    const field = target.value || null;
    selection.columns = selection.columns.map((column, index) => {
      if (index === at) return { ...column, field, confidence: field ? 1 : 0 };
      // A field can only mean one column; taking it frees the other.
      return field && column.field === field ? { ...column, field: null, confidence: 0 } : column;
    });
  }
  return renderMapping();
});

const drop = () => $('#drop');
document.addEventListener('dragover', (event) => {
  if (!drop()) return;
  event.preventDefault();
  drop().classList.add('over');
});
document.addEventListener('dragleave', () => drop()?.classList.remove('over'));
document.addEventListener('drop', (event) => {
  if (!drop()) return;
  event.preventDefault();
  drop().classList.remove('over');
  handleFile(event.dataTransfer?.files?.[0]);
});

render();
