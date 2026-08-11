/**
 * Phase 1: settled set-authority via shipped pure helpers.
 */
import { describe, expect, test } from '@rstest/core';
import {
  mergeCommentsHostFirst,
  detailHasViewerPending,
} from '../src/modal/lib/set-authority';
import { fromAppDetail, toAppDetail } from '../src/modal/lib/detail-store';

function c(id: number, opts: any = {}) {
  return {
    id,
    body: opts.body || `b${id}`,
    author: opts.author || 'a',
    pending: Boolean(opts.pending),
    pendingReviewId: opts.pendingReviewId,
  };
}

describe('set-authority pure', () => {
  test('mergeCommentsHostFirst drops cache-only ids when authoritative', () => {
    const host = [c(1), c(2)];
    const cache = [c(1), c(2), c(999, { body: 'ghost' })];
    const out = mergeCommentsHostFirst(host, cache, { hostAuthoritative: true });
    expect(out.map((x: any) => Number(x.id)).sort()).toEqual([1, 2]);
  });

  test('null VPR strips orphan pending rows without latch', () => {
    const store = fromAppDetail({
      owner: 'o',
      repo: 'r',
      number: 1,
      viewerPendingReview: null,
      reviewComments: [c(5, { pending: true, pendingReviewId: 9 }), c(6)],
    });
    const flat = toAppDetail(store);
    expect(store.dropPending).toBe(false);
    expect(flat?._dropPending).toBeFalsy();
    expect((flat?.reviewComments || []).map((x: any) => Number(x.id))).toEqual([
      6,
    ]);
  });

  test('live VPR keeps pending rows', () => {
    const store = fromAppDetail({
      owner: 'o',
      repo: 'r',
      number: 1,
      viewerPendingReview: { id: 9 },
      reviewComments: [c(5, { pending: true, pendingReviewId: 9 }), c(6)],
    });
    const flat = toAppDetail(store);
    expect(detailHasViewerPending(flat)).toBe(true);
    expect((flat?.reviewComments || []).some((x: any) => x.pending)).toBe(true);
  });
});
