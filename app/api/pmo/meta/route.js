import { handle, json } from '@/lib/http';
import { DOC_TYPES } from '@/lib/pmo/schema';
import { REPORT_TYPES } from '@/lib/pmo/reports/index.js';
import { DEFAULT_THRESHOLDS } from '@/lib/pmo/thresholds';

/** What the engine understands: document types, report types and thresholds. */
export const GET = handle(async () => json({
  docTypes: Object.entries(DOC_TYPES).map(([key, spec]) => ({
    key,
    label: spec.label,
    short: spec.short,
    description: spec.description,
    grain: spec.grain,
    essential: Boolean(spec.essential),
    fields: spec.fields.map(({ key: fieldKey, label, type, required }) => ({ key: fieldKey, label, type, required: Boolean(required) })),
  })),
  reportTypes: Object.entries(REPORT_TYPES).map(([key, spec]) => ({
    key, label: spec.label, short: spec.short, description: spec.description,
    period: spec.period, needs: spec.needs, uses: spec.uses, options: spec.options ?? [],
  })),
  thresholds: DEFAULT_THRESHOLDS,
}));
