/**
 * Host-data-first domain write helper (ack-aware).
 * Shared by PrModalApp progressive loads and command bags.
 */

export type PatchAck = {
  status: 'applied' | 'stale' | 'failed' | 'skipped';
  error?: string;
};

const DOMAIN_KEYS = [
  'comments',
  'commentsMeta',
  'timelineEvents',
  'reviewComments',
  'reviewThreads',
  'reviewCommentsMeta',
  'reviewThreadsMeta',
  'viewerPendingReview',
  'reviews',
  'files',
  'commits',
  'title',
  'body',
  'draft',
  'state',
  'merged',
  'assignees',
  'labels',
  'requestedReviewers',
  'milestone',
  'baseRef',
  'subscribed',
  'avatarUrls',
  'bodyReactions',
  '_resolveStamps',
  'headBranchDeleted',
  'headRefDeleted',
] as const;

export function createApplyDomainDetailToHost(opts: {
  detailRef: { current: any };
  getDetailProp: () => any;
  onPatchDetail?: ((patch: any, owner?: any, repo?: any, number?: any) => any) | null;
  onCacheFailMsg?: (msg: string) => void;
}): (nextOrUpdater: any) => PatchAck {
  const { detailRef, getDetailProp, onPatchDetail, onCacheFailMsg } = opts;
  return function applyDomainDetailToHost(nextOrUpdater: any): PatchAck {
    const base = detailRef.current || getDetailProp();
    const next =
      typeof nextOrUpdater === 'function' ? nextOrUpdater(base) : nextOrUpdater;
    if (!next) return { status: 'skipped' };
    if (typeof onPatchDetail !== 'function') {
      return { status: 'failed', error: 'onPatchDetail unavailable' };
    }
    const patch: Record<string, unknown> = {};
    for (const k of DOMAIN_KEYS) {
      if (Object.prototype.hasOwnProperty.call(next, k)) patch[k] = next[k];
    }
    // Session-only discard hints (never DOMAIN_KEYS / never IDB).
    if (Object.prototype.hasOwnProperty.call(next, '_deletedReviewCommentIds')) {
      patch._deletedReviewCommentIds = next._deletedReviewCommentIds;
    }
    if (Object.prototype.hasOwnProperty.call(next, '_deletedReviewBodies')) {
      patch._deletedReviewBodies = next._deletedReviewBodies;
    }
    if (!Object.keys(patch).length) return { status: 'skipped' };
    try {
      const detail = getDetailProp();
      const res = onPatchDetail(
        patch,
        detail?.owner,
        detail?.repo,
        detail?.number
      );
      if (res && typeof res === 'object' && typeof res.status === 'string') {
        if (res.status === 'applied') {
          detailRef.current = next;
        }
        if (res.status === 'failed') {
          const msg = res.error || 'host patch';
          try {
            onCacheFailMsg?.(
              `Saved on GitHub; cache sync failed (${msg})`
            );
          } catch {
            /* ignore */
          }
        }
        return res as PatchAck;
      }
      return {
        status: 'failed',
        error: 'onPatchDetail returned no status (void ≠ applied)',
      };
    } catch (err: any) {
      return {
        status: 'failed',
        error: err?.message || String(err),
      };
    }
  };
}
