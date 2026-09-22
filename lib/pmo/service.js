// The join between storage and the engine.
//
// Records go to disk as JSON, which turns every Date into a string. Reviving
// them here — using the schema's own field types — means no analytic ever has
// to wonder what kind of thing it is holding.
import { DOC_TYPE_KEYS, fieldsOf } from './schema.js';
import { getProject, listDatasets, listReports, recordsOf, saveReport } from './store.js';
import { readiness } from './quality.js';
import { buildModel } from './analytics/model.js';
import { generateReport, REPORT_TYPES } from './reports/index.js';
import { notFound } from '../errors.js';

const DATE_FIELDS = new Map(DOC_TYPE_KEYS.map((docType) => [
  docType,
  fieldsOf(docType).filter((field) => field.type === 'date').map((field) => field.key),
]));

function reviveDates(docType, records) {
  const keys = DATE_FIELDS.get(docType) ?? [];
  if (!keys.length) return records;
  return records.map((record) => {
    const revived = { ...record };
    for (const key of keys) {
      if (typeof revived[key] === 'string') {
        const date = new Date(revived[key]);
        revived[key] = Number.isNaN(date.getTime()) ? null : date;
      }
    }
    return revived;
  });
}

/** Every stored record for a project, by document type, ready for the engine. */
export function projectData(projectId) {
  const data = {};
  for (const docType of DOC_TYPE_KEYS) {
    const records = recordsOf(projectId, docType);
    if (records.length) data[docType] = reviveDates(docType, records);
  }
  return data;
}

export function projectOrThrow(slug) {
  const project = getProject(slug);
  if (!project) throw notFound('No such project');
  return project;
}

/** What the project cockpit shows: position, readiness and what is missing. */
export function projectOverview(project) {
  const data = projectData(project.id);
  const datasets = listDatasets(project.id).map(({ records, ...rest }) => ({ ...rest, rowCount: records?.length ?? rest.rowCount }));
  const hasData = Object.keys(data).length > 0;
  const model = hasData ? buildModel(project, data) : null;

  return {
    project,
    datasets,
    counts: Object.fromEntries(Object.entries(data).map(([docType, records]) => [docType, records.length])),
    readiness: readiness(data, model),
    reports: listReports(project.id).slice(0, 12),
    position: model && {
      asOf: model.asOf,
      start: model.start,
      baselineFinish: model.baselineFinish,
      forecastFinish: model.forecastFinish,
      delayDays: model.delayDays,
      plannedPercent: model.plannedPercent,
      actualPercent: model.actualPercent,
      variancePercent: model.variancePercent,
      weightBasis: model.weightBasis,
      activityCount: model.activities.length,
      areas: model.areas.map(({ activities, ...area }) => area),
      coverage: model.coverage,
      criticalCount: model.criticalPath.activities.length,
      hasLogic: model.criticalPath.hasLogic,
    },
    // A report type is only offered once the documents it cannot work without
    // are present — an empty report is worse than a blocked button.
    available: Object.entries(REPORT_TYPES).map(([key, spec]) => ({
      key,
      label: spec.label,
      short: spec.short,
      description: spec.description,
      period: spec.period,
      ready: spec.needs.every((docType) => (data[docType]?.length ?? 0) > 0),
      missing: spec.needs.filter((docType) => !(data[docType]?.length ?? 0)),
      enriches: spec.uses.filter((docType) => !(data[docType]?.length ?? 0)),
    })),
  };
}

/**
 * Produce a report, carrying forward the exceptions of the last one of the
 * same type so the pack can say what is new, what is worsening and what has
 * been closed.
 */
export function produceReport(project, request, { store = false } = {}) {
  const data = projectData(project.id);
  const previous = listReports(project.id).find((report) => report.type === request.type);

  const { pack, context } = generateReport(project, data, {
    ...request,
    previousExceptions: previous?.exceptions ?? [],
  });

  if (store) {
    saveReport({
      projectId: project.id,
      type: request.type,
      title: pack.title,
      subtitle: pack.subtitle,
      from: request.from ?? null,
      to: request.to ?? null,
      asOf: context.asOf,
      exceptionCount: context.exceptions.length,
      readiness: context.readiness.score,
      // Only the exception list is kept: it is what the next period needs.
      exceptions: context.exceptions.map(({ id, code, severity, subject, metric, raisedOn, firstSeen, periodsOpen }) => ({
        id, code, severity, subject, metric, raisedOn, firstSeen, periodsOpen,
      })),
    });
  }

  return { pack, context };
}
