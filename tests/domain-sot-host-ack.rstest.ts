/**
 * Host-projection domain: no durable tombs, no pre-ack detailRef, no REST lock-in.
 * Drives shipped sanitize / apply / load-more helpers (not a re-implementation).
 */
import { describe, expect, test } from '@rstest/core';
import { createApplyDomainDetailToHost } from '../src/modal/hooks/useDomainDetailHost';
import { sanitizeDetailForCache } from '../src/modal/lib/detail-idb';
import { shouldPreferRestForThreadLoadMore } from '../src/modal/lib/review-threads';
import { installPrModalMutations } from '../src/modal/commands/domain-mutations';

describe('sanitizeDetailForCache strips durable tombstones', () => {
  test('id and body tombs are omitted from cache snapshots', () => {
    const out = sanitizeDetailForCache({
      owner: 'o',
      repo: 'r',
      number: 1,
      title: 't',
      comments: [],
      reviews: [],
      reviewComments: [{ id: 2, body: 'keep', pending: false }],
      reviewThreads: [],
      commits: [],
      files: [],
      viewerPendingReview: null,
      _deletedReviewCommentIds: ['9001'],
      _deletedReviewBodies: ['ghost'],
    });
    expect(out._deletedReviewCommentIds).toBeUndefined();
    expect(out._deletedReviewBodies).toBeUndefined();
    expect((out.reviewComments || []).map((c: { id: number }) => c.id)).toEqual([
      2,
    ]);
  });
});

describe('createApplyDomainDetailToHost does not commit before ack', () => {
  test('failed / void patch leaves the prior detailRef', () => {
    const prior = { owner: 'o', repo: 'r', number: 1, title: 'old', comments: [] };
    const detailRef = { current: prior };
    const apply = createApplyDomainDetailToHost({
      detailRef,
      getDetailProp: () => detailRef.current,
      onPatchDetail: () => {
        /* void */
      },
    });
    const res = apply({ ...prior, title: 'next' });
    expect(res.status).toBe('failed');
    expect(detailRef.current).toBe(prior);
    expect(detailRef.current.title).toBe('old');
  });

  test('applied ack commits the next detail', () => {
    const prior = { owner: 'o', repo: 'r', number: 1, title: 'old', comments: [] };
    const detailRef = { current: prior };
    const apply = createApplyDomainDetailToHost({
      detailRef,
      getDetailProp: () => detailRef.current,
      onPatchDetail: () => ({ status: 'applied' }),
    });
    const next = { ...prior, title: 'ok' };
    expect(apply(next).status).toBe('applied');
    expect(detailRef.current).toBe(next);
  });

  test('stale ack does not become the committed detail', () => {
    const prior = { owner: 'o', repo: 'r', number: 1, title: 'old', comments: [] };
    const detailRef = { current: prior };
    const apply = createApplyDomainDetailToHost({
      detailRef,
      getDetailProp: () => detailRef.current,
      onPatchDetail: () => ({ status: 'stale' }),
    });
    apply({ ...prior, title: 'stale-write' });
    expect(detailRef.current).toBe(prior);
    expect(detailRef.current.title).toBe('old');
  });
});

describe('shouldPreferRestForThreadLoadMore (shipped)', () => {
  test('GraphQL cursor / non-rest source does not prefer REST', () => {
    expect(
      shouldPreferRestForThreadLoadMore({
        source: 'graphql',
        hasMore: true,
        newestStartCursor: 'cursor',
        restPage: 2,
      })
    ).toBe(false);
    expect(
      shouldPreferRestForThreadLoadMore({
        source: 'shell',
        hasMore: true,
        restPage: 1,
      })
    ).toBe(false);
    expect(
      shouldPreferRestForThreadLoadMore({
        restPage: 3,
        newestStartCursor: 'Y3Vyc29y',
      })
    ).toBe(false);
  });

  test('REST-only window without a GraphQL cursor may prefer REST', () => {
    expect(
      shouldPreferRestForThreadLoadMore({
        source: 'rest',
        hasMore: true,
        restPage: 2,
      })
    ).toBe(true);
  });
});

function mutationBag(detail: any, onPatchDetail: () => any) {
  return {
    detail,
    detailRef: { current: detail },
    prIdentity: 'o/r#1',
    setActionBusy: () => {},
    setActionMsg: () => {},
    setEditingBody: () => {},
    onPatchDetail,
    requestConfirm: async () => true,
    stripPendingReviewFromDetail: (d: any) => d,
    discardPendingReview: () => ({ comments: [], body: '' }),
    pendingReviewNodeIdRef: { current: null },
  };
}

describe('command helpers do not commit detailRef before host ack', () => {
  test('onSaveBody leaves the prior ref when the host patch is not applied', async () => {
    const prior = {
      owner: 'o',
      repo: 'r',
      number: 1,
      body: 'old-body',
      title: 't',
    };
    const prevFetch = (globalThis as any).PRTreeFetch;
    (globalThis as any).PRTreeFetch = {
      updatePullRequest: async () => ({ ok: true }),
    };
    try {
      const bag = mutationBag(prior, () => ({ status: 'stale' }));
      const mut = installPrModalMutations(bag);
      await mut.onSaveBody('new-body');
      expect(bag.detailRef.current).toBe(prior);
      expect(bag.detailRef.current.body).toBe('old-body');
    } finally {
      (globalThis as any).PRTreeFetch = prevFetch;
    }
  });

  test('onSaveBody commits the ref only after applied ack', async () => {
    const prior = {
      owner: 'o',
      repo: 'r',
      number: 1,
      body: 'old-body',
      title: 't',
    };
    const prevFetch = (globalThis as any).PRTreeFetch;
    (globalThis as any).PRTreeFetch = {
      updatePullRequest: async () => ({ ok: true }),
    };
    try {
      const bag = mutationBag(prior, () => ({ status: 'applied' }));
      const mut = installPrModalMutations(bag);
      await mut.onSaveBody('new-body');
      expect(bag.detailRef.current).not.toBe(prior);
      expect(bag.detailRef.current.body).toBe('new-body');
    } finally {
      (globalThis as any).PRTreeFetch = prevFetch;
    }
  });

  test('refreshTimelineEvents leaves the prior ref when the host patch fails', async () => {
    const prior = {
      owner: 'o',
      repo: 'r',
      number: 1,
      timelineEvents: [{ id: 1, event: 'labeled' }],
    };
    const prevFetch = (globalThis as any).PRTreeFetch;
    (globalThis as any).PRTreeFetch = {
      fetchPrTimelineEvents: async () => [{ id: 2, event: 'assigned' }],
    };
    try {
      const bag = mutationBag(prior, () => ({
        status: 'failed',
        error: 'host down',
      }));
      const mut = installPrModalMutations(bag);
      await mut.refreshTimelineEvents();
      expect(bag.detailRef.current).toBe(prior);
      expect(bag.detailRef.current.timelineEvents).toEqual(prior.timelineEvents);
    } finally {
      (globalThis as any).PRTreeFetch = prevFetch;
    }
  });
});
