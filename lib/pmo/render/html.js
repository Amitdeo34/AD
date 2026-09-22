// The report as a page — and, through the browser's own print dialogue, as a PDF.
//
// The sheet is deliberately fixed to a light "paper" surface whatever the
// viewer's theme: this is a document that gets printed, signed and attached to
// an email, and a dark-mode PDF is not that. The surrounding application
// chrome does follow the theme.
import { escapeXml } from '../ingest/xml.js';
import { formatDate } from '../dates.js';
import { chartTable, renderChart, STATUS } from './charts.js';
import { formatCell, NUMERIC_FORMATS } from './format.js';

const esc = (value) => escapeXml(String(value ?? ''));

const TONE_CLASS = { good: 'tone-good', warn: 'tone-warn', bad: 'tone-bad', info: 'tone-info', green: 'tone-good', amber: 'tone-warn', red: 'tone-bad' };

function kpiCard(kpi) {
  return `<div class="kpi ${TONE_CLASS[kpi.tone] ?? ''}">
    <div class="kpi-label">${esc(kpi.label)}</div>
    <div class="kpi-value">${esc(kpi.value)}</div>
    ${kpi.sub ? `<div class="kpi-sub">${esc(kpi.sub)}</div>` : ''}
  </div>`;
}

function severityBadge(value) {
  const color = STATUS[value];
  return color
    ? `<span class="badge" style="--badge:${color}">${esc(value)}</span>`
    : esc(value);
}

function renderTable(block, { currency }) {
  if (!block.rows?.length) return `<p class="empty">${esc(block.emptyText ?? 'No entries.')}</p>`;
  const head = block.columns.map((column) => `<th${NUMERIC_FORMATS.has(column.format) ? ' class="num"' : ''}>${esc(column.label)}</th>`).join('');
  const body = block.rows.map((row) => {
    const cells = block.columns.map((column) => {
      const value = row[column.key];
      const text = column.format === 'severity' ? severityBadge(value) : esc(formatCell(value, column.format, { currency }));
      return `<td${NUMERIC_FORMATS.has(column.format) ? ' class="num"' : ''}>${text}</td>`;
    }).join('');
    return `<tr class="${TONE_CLASS[row._tone] ?? ''}">${cells}</tr>`;
  }).join('');
  return `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`
    + (block.note ? `<p class="note">${esc(block.note)}</p>` : '');
}

function renderExceptions(block) {
  if (!block.items?.length) return `<p class="empty">${esc(block.emptyText ?? 'No exceptions.')}</p>`;
  return block.items.map((item) => `<article class="exception sev-${item.severity.toLowerCase()}">
    <header>
      <span class="badge" style="--badge:${STATUS[item.severity] ?? '#52514e'}">${esc(item.severity)}</span>
      <h4>${esc(item.title)}</h4>
      <span class="meta">${esc(item.category)}${item.area ? ` · ${esc(item.area)}` : ''}${item.isNew ? ' · <b>New</b>' : ` · ${esc(item.trend)}, ${item.periodsOpen} period(s) open`}</span>
    </header>
    <p class="subject">${esc(item.subject)}</p>
    <p>${esc(item.detail)}</p>
    <p class="action"><b>Recommended action:</b> ${esc(item.recommendation)}</p>
    <footer>${item.metricDisplay ? `<span><b>${esc(item.metricLabel)}:</b> ${esc(item.metricDisplay)}</span>` : ''}<span><b>Owner:</b> ${esc(item.owner ?? 'To be assigned')}</span>${item.dueDate ? `<span><b>Due:</b> ${esc(formatDate(item.dueDate))}</span>` : ''}</footer>
  </article>`).join('');
}

function renderChartBlock(block) {
  const data = chartTable(block);
  const rows = data.rows.map((row) => `<tr>${row.map((cell) => `<td>${esc(cell)}</td>`).join('')}</tr>`).join('');
  return `<figure class="chart">${renderChart(block)}
    <details class="chart-data"><summary>Show the data behind this chart</summary>
      <div class="table-wrap"><table><thead><tr>${data.columns.map((column) => `<th>${esc(column)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>
    </details>
  </figure>`;
}

function renderBlock(block, options) {
  switch (block.kind) {
    case 'narrative':
      return (block.title ? `<h4>${esc(block.title)}</h4>` : '')
        + block.paragraphs.map((paragraph) => `<p>${esc(paragraph)}</p>`).join('');
    case 'kpis':
      return `<div class="kpi-grid">${block.items.map(kpiCard).join('')}</div>`;
    case 'table':
      return renderTable(block, options);
    case 'exceptions':
      return (block.title ? `<h4>${esc(block.title)}</h4>` : '') + renderExceptions(block);
    case 'chart':
      return renderChartBlock(block);
    case 'callout':
      return `<div class="callout ${TONE_CLASS[block.tone] ?? 'tone-info'}"><b>${esc(block.title)}</b><p>${esc(block.text)}</p></div>`;
    case 'list':
      return (block.title ? `<h4>${esc(block.title)}</h4>` : '')
        + `<${block.ordered ? 'ol' : 'ul'}>${block.items.map((item) => `<li>${esc(item)}</li>`).join('')}</${block.ordered ? 'ol' : 'ul'}>`;
    default:
      return '';
  }
}

const STYLES = `
:root { color-scheme: light; }
* { box-sizing: border-box; }
body { margin: 0; background: #f3f4f6; color: #0b0b0b;
  font: 13px/1.55 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif; }
.sheet { background: #ffffff; max-width: 1040px; margin: 24px auto; padding: 40px 48px 56px;
  box-shadow: 0 1px 3px rgba(0,0,0,.09), 0 12px 36px rgba(0,0,0,.06); }
.cover { border-bottom: 3px solid #10284b; padding-bottom: 20px; margin-bottom: 28px; }
.cover .eyebrow { font-size: 11px; letter-spacing: .1em; text-transform: uppercase; color: #52514e; font-weight: 600; }
.cover h1 { font-size: 27px; margin: 8px 0 4px; color: #10284b; letter-spacing: -.01em; }
.cover .subtitle { font-size: 14px; color: #52514e; margin: 0 0 14px; }
.cover dl { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 10px 26px; margin: 0; }
.cover dt { font-size: 10px; letter-spacing: .06em; text-transform: uppercase; color: #8a8a85; }
.cover dd { margin: 1px 0 0; font-size: 13px; font-weight: 600; }
h2 { font-size: 17px; color: #10284b; margin: 34px 0 4px; padding-bottom: 7px; border-bottom: 1px solid #e6e6e1; }
h2 .sec-no { color: #8a8a85; font-weight: 500; margin-right: 8px; }
.sec-sub { color: #52514e; margin: 0 0 12px; font-size: 12px; }
h4 { font-size: 13px; margin: 20px 0 6px; color: #10284b; }
p { margin: 0 0 10px; }
.kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(148px, 1fr)); gap: 10px; margin: 14px 0 18px; }
.kpi { border: 1px solid #e6e6e1; border-left: 3px solid #c9c9c3; border-radius: 6px; padding: 10px 12px; background: #fcfcfb; }
.kpi-label { font-size: 10px; letter-spacing: .05em; text-transform: uppercase; color: #8a8a85; }
.kpi-value { font-size: 19px; font-weight: 700; color: #10284b; margin-top: 3px; letter-spacing: -.01em; }
.kpi-sub { font-size: 11px; color: #52514e; margin-top: 2px; }
.kpi.tone-good { border-left-color: #0ca30c; } .kpi.tone-warn { border-left-color: #fab219; }
.kpi.tone-bad { border-left-color: #d03b3b; }
.table-wrap { overflow-x: auto; margin: 10px 0; }
table { border-collapse: collapse; width: 100%; font-size: 11.5px; }
th { background: #10284b; color: #fff; text-align: left; padding: 7px 8px; font-weight: 600;
  font-size: 10.5px; letter-spacing: .02em; vertical-align: bottom; }
td { border: 1px solid #e6e6e1; padding: 6px 8px; vertical-align: top; }
th.num, td.num { text-align: right; font-variant-numeric: tabular-nums; }
tbody tr:nth-child(even) { background: #fbfbfa; }
tr.tone-good td { background: #f2fbf2; } tr.tone-warn td { background: #fffaed; }
tr.tone-bad td { background: #fdf2f2; }
.badge { display: inline-block; padding: 1px 7px; border-radius: 9px; font-size: 10px; font-weight: 700;
  color: #fff; background: var(--badge, #52514e); white-space: nowrap; }
.exception { border: 1px solid #e6e6e1; border-left: 4px solid #c9c9c3; border-radius: 6px;
  padding: 12px 14px; margin: 10px 0; background: #fcfcfb; break-inside: avoid; }
.exception.sev-critical { border-left-color: #d03b3b; } .exception.sev-high { border-left-color: #ec835a; }
.exception.sev-medium { border-left-color: #fab219; } .exception.sev-low { border-left-color: #0ca30c; }
.exception header { display: flex; align-items: baseline; gap: 9px; flex-wrap: wrap; margin-bottom: 5px; }
.exception h4 { margin: 0; font-size: 13px; } .exception .meta { font-size: 10.5px; color: #8a8a85; }
.exception .subject { font-weight: 600; margin: 0 0 4px; }
.exception .action { background: #f4f6f9; border-radius: 4px; padding: 7px 9px; margin: 8px 0 6px; }
.exception footer { display: flex; gap: 18px; flex-wrap: wrap; font-size: 11px; color: #52514e;
  border-top: 1px solid #ececE6; padding-top: 6px; }
.callout { border-radius: 6px; padding: 11px 14px; margin: 12px 0; border: 1px solid #e6e6e1; border-left: 4px solid #2a78d6; background: #f7f9fc; }
.callout.tone-good { border-left-color: #0ca30c; background: #f2fbf2; }
.callout.tone-warn { border-left-color: #fab219; background: #fffaed; }
.callout.tone-bad { border-left-color: #d03b3b; background: #fdf2f2; }
.callout p { margin: 3px 0 0; }
.chart { margin: 16px 0; border: 1px solid #e6e6e1; border-radius: 6px; padding: 12px; break-inside: avoid; }
.chart-data { margin-top: 8px; font-size: 11px; }
.chart-data summary { cursor: pointer; color: #52514e; }
.note, .empty { font-size: 11.5px; color: #8a8a85; font-style: italic; }
.toc ol { margin: 6px 0 0; padding-left: 20px; } .toc li { margin: 2px 0; }
footer.report-footer { margin-top: 36px; padding-top: 12px; border-top: 1px solid #e6e6e1;
  font-size: 10.5px; color: #8a8a85; }
.toolbar { max-width: 1040px; margin: 20px auto -8px; display: flex; gap: 8px; flex-wrap: wrap; }
.toolbar a, .toolbar button { font: inherit; font-size: 12px; padding: 7px 13px; border-radius: 6px;
  border: 1px solid #c9c9c3; background: #fff; color: #10284b; text-decoration: none; cursor: pointer; }
.toolbar a:hover, .toolbar button:hover { background: #f4f6f9; }
@media print {
  body { background: #fff; }
  .sheet { box-shadow: none; margin: 0; max-width: none; padding: 0; }
  .toolbar { display: none; }
  .page-break { break-before: page; }
  .chart-data { display: none; }
  table { font-size: 9.5px; } th { padding: 5px 6px; } td { padding: 4px 6px; }
  thead { display: table-header-group; }
  tr, .exception, .chart, .callout { break-inside: avoid; }
  @page { size: A4 landscape; margin: 14mm 12mm; }
}
@media (max-width: 760px) { .sheet { padding: 20px 16px 32px; margin: 8px; } .cover h1 { font-size: 21px; } }
`;

/**
 * Render a report pack to a self-contained HTML document.
 *
 * @param pack      the report pack
 * @param options   {downloads: [{label, href}]} adds a toolbar above the sheet
 */
export function renderHtml(pack, { downloads = [], standalone = true } = {}) {
  const meta = pack.meta ?? {};
  const project = meta.project ?? {};
  const currency = project.currency ?? 'INR';

  const facts = [
    ['Project', project.name],
    ['Client', project.client],
    ['Contractor', project.contractor],
    ['Reporting period', meta.period?.label],
    ['Data date', meta.asOf ? formatDate(meta.asOf) : null],
    ['Issued', formatDate(meta.generatedAt ?? new Date())],
    ['Prepared by', project.consultant],
    ['Data readiness', Number.isFinite(meta.dataReadiness) ? `${meta.dataReadiness}/100` : null],
  ].filter(([, value]) => value);

  const sections = pack.sections.map((section, index) => `
    <section id="${esc(section.id)}" class="${section.pageBreak ? 'page-break' : ''}">
      <h2><span class="sec-no">${index + 1}</span>${esc(section.title)}</h2>
      ${section.subtitle ? `<p class="sec-sub">${esc(section.subtitle)}</p>` : ''}
      ${section.blocks.map((block) => renderBlock(block, { currency })).join('\n')}
    </section>`).join('\n');

  const toolbar = downloads.length
    ? `<div class="toolbar">
        <button type="button" onclick="window.print()">Print / Save as PDF</button>
        ${downloads.map((item) => `<a href="${esc(item.href)}" download>${esc(item.label)}</a>`).join('')}
      </div>`
    : '';

  const body = `${toolbar}
  <div class="sheet">
    <header class="cover">
      <div class="eyebrow">${esc(meta.reportTypeLabel ?? pack.title)}</div>
      <h1>${esc(pack.title)}</h1>
      <p class="subtitle">${esc(pack.subtitle ?? '')}</p>
      <dl>${facts.map(([label, value]) => `<dt>${esc(label)}</dt><dd>${esc(value)}</dd>`).join('')}</dl>
    </header>
    <nav class="toc"><h4>Contents</h4><ol>${pack.sections.map((section) => `<li><a href="#${esc(section.id)}">${esc(section.title)}</a></li>`).join('')}</ol></nav>
    ${sections}
    <footer class="report-footer">
      Generated by the PMO Reporting Engine on ${esc(formatDate(meta.generatedAt ?? new Date()))} from data uploaded for this project.
      Figures derive from contractor-submitted records and are not independently verified on site unless stated.
    </footer>
  </div>`;

  if (!standalone) return `<style>${STYLES}</style>${body}`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(pack.title)}${project.name ? ` — ${esc(project.name)}` : ''}</title>
<style>${STYLES}</style>
</head>
<body>
${body}
</body>
</html>`;
}

/**
 * Several reports as one document.
 *
 * A client review usually wants the pack, not seven attachments: one cover,
 * one contents page, then each report as a part that still begins on its own
 * page when printed. The numbers are identical to the separate files, because
 * they come from the same packs.
 */
export function renderBundleHtml(packs, { title = 'Reporting Pack', downloads = [] } = {}) {
  const first = packs[0]?.meta ?? {};
  const project = first.project ?? {};
  const currency = project.currency ?? 'INR';

  const facts = [
    ['Project', project.name],
    ['Client', project.client],
    ['Contractor', project.contractor],
    ['Data date', first.asOf ? formatDate(first.asOf) : null],
    ['Issued', formatDate(first.generatedAt ?? new Date())],
    ['Prepared by', project.consultant],
    ['Reports in this pack', String(packs.length)],
    ['Data readiness', Number.isFinite(first.dataReadiness) ? `${first.dataReadiness}/100` : null],
  ].filter(([, value]) => value);

  let sectionNumber = 0;
  const parts = packs.map((pack, partIndex) => {
    const sections = pack.sections.map((section) => {
      sectionNumber += 1;
      return `
        <section id="${esc(`p${partIndex + 1}-${section.id}`)}" class="${section.pageBreak ? 'page-break' : ''}">
          <h2><span class="sec-no">${partIndex + 1}.${sectionNumber}</span>${esc(section.title)}</h2>
          ${section.subtitle ? `<p class="sec-sub">${esc(section.subtitle)}</p>` : ''}
          ${section.blocks.map((block) => renderBlock(block, { currency })).join('\n')}
        </section>`;
    }).join('\n');
    sectionNumber = 0;

    return `
      <div class="part page-break" id="part-${partIndex + 1}">
        <header class="part-head">
          <div class="eyebrow">Part ${partIndex + 1} of ${packs.length}</div>
          <h1>${esc(pack.title)}</h1>
          <p class="subtitle">${esc(pack.subtitle ?? '')}</p>
        </header>
        <div class="kpi-grid">${pack.kpis.map(kpiCard).join('')}</div>
        ${sections}
      </div>`;
  }).join('\n');

  const toolbar = downloads.length
    ? `<div class="toolbar">
        <button type="button" onclick="window.print()">Print / Save as PDF</button>
        ${downloads.map((item) => `<a href="${esc(item.href)}" download>${esc(item.label)}</a>`).join('')}
      </div>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}${project.name ? ` — ${esc(project.name)}` : ''}</title>
<style>${STYLES}
.part-head { border-bottom: 3px solid #10284b; padding-bottom: 14px; margin: 0 0 20px; }
.part-head h1 { font-size: 23px; margin: 6px 0 3px; color: #10284b; }
.part-head .subtitle { font-size: 13px; color: #52514e; margin: 0; }
.pack-contents { margin: 18px 0 8px; }
.pack-contents ol { padding-left: 20px; margin: 6px 0 0; }
.pack-contents > ol > li { margin: 6px 0; font-weight: 600; }
.pack-contents ol ol li { font-weight: 400; font-size: 12px; }
</style>
</head>
<body>
${toolbar}
  <div class="sheet">
    <header class="cover">
      <div class="eyebrow">${esc(project.name ? 'Project reporting pack' : 'Reporting pack')}</div>
      <h1>${esc(title)}</h1>
      <p class="subtitle">${esc(packs.map((pack) => pack.meta?.reportTypeLabel ?? pack.title).join(' · '))}</p>
      <dl>${facts.map(([label, value]) => `<dt>${esc(label)}</dt><dd>${esc(value)}</dd>`).join('')}</dl>
    </header>

    <nav class="pack-contents toc">
      <h4>Contents</h4>
      <ol>
        ${packs.map((pack, partIndex) => `
          <li><a href="#part-${partIndex + 1}">${esc(pack.title)}</a>
            <ol>${pack.sections.map((section) => `<li><a href="#p${partIndex + 1}-${esc(section.id)}">${esc(section.title)}</a></li>`).join('')}</ol>
          </li>`).join('')}
      </ol>
    </nav>

    ${parts}

    <footer class="report-footer">
      Generated by the PMO Reporting Engine on ${esc(formatDate(first.generatedAt ?? new Date()))} from data uploaded for this project.
      Every part of this pack is derived from the same reconciled figures.
      Figures derive from contractor-submitted records and are not independently verified on site unless stated.
    </footer>
  </div>
</body>
</html>`;
}

export { STYLES as REPORT_STYLES };
