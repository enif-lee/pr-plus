/**
 * Settled set-authority helpers (Phase 1).
 * Primary implementation lives in stale-local-review; re-exported here as the
 * stable pure entry for host open/refresh and unit tests.
 */
export {
  mergeCommentsHostFirst,
  filterCacheReviewCommentsForCore,
  detailHasViewerPending,
} from './stale-local-review';
