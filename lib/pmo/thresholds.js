// The thresholds every exception rule is measured against.
//
// They live on their own so the rules engine can rely on them without
// reaching into storage, and so a project can override any single one without
// the rest silently becoming undefined — a threshold that reads `undefined`
// does not fail loudly, it fails by never firing, or by firing always.
export const DEFAULT_THRESHOLDS = {
  slippageDaysHigh: 14,
  slippageDaysCritical: 30,
  noProgressDays: 7,
  productivityShortfall: 0.8,
  manpowerShortfall: 0.85,
  ncrAgeingDays: 14,
  hindranceAgeingDays: 7,
  issueAgeingDays: 14,
  quantityOverrun: 1.02,
  cashflowVariance: 0.2,
  milestoneWarningDays: 30,
  riskScoreHigh: 15,
  drawingLeadDays: 30,
  procurementLeadDays: 14,
  dprGapDays: 2,
  spiAmber: 0.95,
  spiRed: 0.85,
  cpiAmber: 0.95,
  cpiRed: 0.85,
};

/** Project overrides on top of the defaults, with unknown keys ignored. */
export function resolveThresholds(overrides = {}) {
  const resolved = { ...DEFAULT_THRESHOLDS };
  for (const [key, value] of Object.entries(overrides)) {
    if (key in DEFAULT_THRESHOLDS && Number.isFinite(value)) resolved[key] = value;
  }
  return resolved;
}
