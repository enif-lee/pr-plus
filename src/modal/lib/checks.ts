/**
 * Re-export pure check-run / commit-status helpers for the modal bundle.
 * Source of truth: `src/modal/pure/checks.js` (also loaded in the SW).
 */
// @ts-expect-error pure CJS module without types
export {
  distinctStatuses,
  distinctCheckRuns,
  deriveChecksState,
  normalizeChecks,
  statusKey,
  checkRunKey,
  classifyCheckOutcome,
  formatDurationMs,
  formatRelativeAgo,
  formatCheckSummary,
  buildMergeBoxCheckGroups,
  mergeBoxChecksHeadline,
  summarizeCheckCounts,
  formatChecksCountLabel,
} from '../pure/checks.js';
