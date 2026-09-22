import { handle, json, searchParams } from '@/lib/http';
import { badRequest } from '@/lib/errors';
import { REPORT_TYPES } from '@/lib/pmo/reports/index.js';
import { renderHtml } from '@/lib/pmo/render/html';
import { renderXlsx, renderScheduleXlsx } from '@/lib/pmo/render/xlsx';
import { renderDocx } from '@/lib/pmo/render/docx';
import { writeCsv } from '@/lib/pmo/ingest/csv';
import { isoDay } from '@/lib/pmo/dates';
import { produceReport, projectOrThrow } from '@/lib/pmo/service';

const FORMATS = {
  html: { extension: 'html', type: 'text/html; charset=utf-8' },
  xlsx: { extension: 'xlsx', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  docx: { extension: 'docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  csv: { extension: 'csv', type: 'text/csv; charset=utf-8' },
  p6: { extension: 'xlsx', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  json: { extension: 'json', type: 'application/json' },
};

function exceptionsCsv(context) {
  return writeCsv([
    ['Severity', 'Category', 'Area', 'Subject', 'Observation', 'Measure', 'Recommended action', 'Owner', 'Due', 'Trend', 'Periods open', 'New'],
    ...context.exceptions.map((item) => [
      item.severity, item.category, item.area ?? '', item.subject, item.detail,
      item.metricDisplay ?? '', item.recommendation, item.owner ?? '',
      item.dueDate ? isoDay(item.dueDate) : '', item.trend, item.periodsOpen, item.isNew ? 'Yes' : 'No',
    ]),
  ]);
}

/**
 * Generate and return a report in the requested format.
 *
 * Generation is always from the current data — a report is a view of the
 * uploads, not a snapshot taken once and drifting from them.
 */
export const GET = handle(async (request, { params }) => {
  const { slug } = await params;
  const project = projectOrThrow(slug);
  const p = searchParams(request);

  const type = p.get('type') ?? 'weekly-exception';
  if (!REPORT_TYPES[type]) throw badRequest(`Unknown report type "${type}"`);
  const format = p.get('format') ?? 'html';
  const spec = FORMATS[format];
  if (!spec) throw badRequest(`Unknown format "${format}". Use html, xlsx, docx, csv, p6 or json.`);

  const options = {};
  if (p.get('areas')) options.areas = p.get('areas').split('|').map((area) => area.trim()).filter(Boolean);
  if (p.get('purpose')) options.purpose = p.get('purpose');
  if (p.get('date')) options.date = p.get('date');

  const { pack, context } = produceReport(project, {
    type,
    from: p.get('from') || null,
    to: p.get('to') || null,
    asOf: p.get('asOf') || null,
    options,
  }, { store: p.get('store') === 'true' });

  const stem = `${project.code ?? project.slug}-${type}-${isoDay(context.asOf)}`;
  const disposition = (name) => `${p.get('inline') === 'true' ? 'inline' : 'attachment'}; filename="${name}"`;

  if (format === 'json') return json({ pack, readiness: context.readiness });

  if (format === 'html') {
    const downloads = [
      { label: 'Excel workbook', href: `?type=${type}&format=xlsx${p.get('asOf') ? `&asOf=${p.get('asOf')}` : ''}` },
      { label: 'Word document', href: `?type=${type}&format=docx${p.get('asOf') ? `&asOf=${p.get('asOf')}` : ''}` },
      { label: 'Exceptions (CSV)', href: `?type=${type}&format=csv${p.get('asOf') ? `&asOf=${p.get('asOf')}` : ''}` },
    ];
    return new Response(renderHtml(pack, { downloads }), {
      headers: { 'Content-Type': spec.type, 'Cache-Control': 'no-store' },
    });
  }

  const payload = format === 'xlsx' ? renderXlsx(pack)
    : format === 'docx' ? renderDocx(pack)
      : format === 'p6' ? renderScheduleXlsx(context.model)
        : exceptionsCsv(context);

  return new Response(payload, {
    headers: {
      'Content-Type': spec.type,
      'Content-Disposition': disposition(`${stem}${format === 'p6' ? '-p6' : ''}.${spec.extension}`),
      'Cache-Control': 'no-store',
    },
  });
});
