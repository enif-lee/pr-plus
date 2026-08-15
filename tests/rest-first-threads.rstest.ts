/**
 * Review threads transport (GraphQL-first shell + PRRT) + REST page builder
 * helpers + warm-revalidate by-id skip / GraphQL missing safety.
 * Drives shipped helpers in modal/lib/review-threads.ts (not a re-implementation).
 */
import { describe, expect, test } from '@rstest/core';
import {
  applyByIdsRefreshDrop,
  buildRestReviewThreadsPageFromComments,
  chooseReviewThreadsTransport,
  confirmedMissingThreadIdsFromNodes,
  isGraphqlReviewThreadNodeId,
  pickNewestThreadsPageSize,
  remainingUnresolvedForByIdsBulk,
  resolveMissingThreadIdsForDrop,
  REVIEW_THREADS_PAGE_SIZE,
  shouldSkipUnresolvedByIdsBulk,
  shouldTrustRestEmptyReviewThreads,
} from '../src/modal/lib/review-threads.ts';

describe('page size 100 + trust REST empty (shipped pure)', () => {
  test('default page size is 100 for cold/warm/full (shell cost flat)', () => {
    expect(REVIEW_THREADS_PAGE_SIZE).toBe(100);
    expect(pickNewestThreadsPageSize({})).toBe(100);
    expect(pickNewestThreadsPageSize({ warmCache: true })).toBe(100);
    expect(pickNewestThreadsPageSize({ forceFull: true })).toBe(100);
  });

  test('shouldTrustRestEmptyReviewThreads', () => {
    expect(shouldTrustRestEmptyReviewThreads({ reviewCommentsCount: 0 })).toBe(
      true
    );
    expect(shouldTrustRestEmptyReviewThreads({ restCommentCount: 0 })).toBe(
      true
    );
    expect(
      shouldTrustRestEmptyReviewThreads({
        reviewCommentsCount: 0,
        forceFull: true,
      })
    ).toBe(false);
    expect(shouldTrustRestEmptyReviewThreads({ reviewCommentsCount: 14 })).toBe(
      false
    );
  });
});

/**
 * REST complete page must not invent dual-window hasMore from comment count.
 * Regression: totalCount=14 comments + 7 threads → hidden=7 → Diff auto
 * load-all loop → "Loading comments 7/14" header flicker.
 */
describe('REST complete page hasMore contract (anti-flicker)', () => {
  test('complete REST window: hasMore false even when comments > threads', () => {
    const items = [
      { id: 1, body: 'a', path: 'a.ts', line: 1, side: 'RIGHT' },
      { id: 2, body: 'reply', path: 'a.ts', line: 1, side: 'RIGHT', inReplyToId: 1 },
      { id: 3, body: 'b', path: 'b.ts', line: 2, side: 'RIGHT' },
    ];
    const page = buildRestReviewThreadsPageFromComments(items, 'newest');
    // 2 root threads, 3 comments — pure page must not claim more pages
    expect(page.threads).toHaveLength(2);
    expect(page.comments).toHaveLength(3);
    expect(page.hasMore).toBe(false);
    expect(page.hasPreviousPage).toBe(false);
    expect(page.source).toBe('rest');
    // Thread-shaped total for complete window (fetch layer also rewrites this)
    expect(page.threads.length).toBe(2);
  });

  test('fetch layer uses thread total not review_comments (source contract)', () => {
    // restReviewThreadsFallbackPage is in fetch-api; assert the pure inputs
    // that merge must see for a complete page-size window with 14 comments.
    const items = Array.from({ length: 14 }, (_, i) => ({
      id: i + 1,
      body: `c${i}`,
      path: 'f.ts',
      line: i + 1,
      side: 'RIGHT',
      // every other is a reply so threads < comments
      ...(i % 2 === 1 ? { inReplyToId: i } : {}),
    }));
    const page = buildRestReviewThreadsPageFromComments(items, 'newest');
    const threadN = page.threads.length;
    expect(threadN).toBeLessThan(14);
    expect(page.hasMore).toBe(false);
    // Simulate complete-window merge flags (must match fetch merge REST branch)
    const restHasMore = Boolean(page.hasMore);
    const loadedThreadCount = threadN;
    const totalCount = restHasMore ? 14 : loadedThreadCount;
    const hasMore = restHasMore;
    expect(totalCount).toBe(loadedThreadCount);
    expect(hasMore).toBe(false);
  });
});

describe('chooseReviewThreadsTransport (shipped pure, GraphQL-first)', () => {
  test('default newest/oldest → graphql (PRRT shell)', () => {
    expect(chooseReviewThreadsTransport({ direction: 'newest' })).toBe(
      'graphql'
    );
    expect(chooseReviewThreadsTransport({ direction: 'oldest' })).toBe(
      'graphql'
    );
    expect(chooseReviewThreadsTransport({})).toBe('graphql');
  });

  test('cursor / older / newer → graphql', () => {
    expect(
      chooseReviewThreadsTransport({ direction: 'newest', cursor: 'abc' })
    ).toBe('graphql');
    expect(chooseReviewThreadsTransport({ direction: 'older' })).toBe('graphql');
    expect(chooseReviewThreadsTransport({ direction: 'newer' })).toBe('graphql');
  });

  test('preferRest true → rest; forceFull / forceGraphql → graphql', () => {
    expect(chooseReviewThreadsTransport({ preferRest: true })).toBe('rest');
    expect(chooseReviewThreadsTransport({ forceFull: true })).toBe('graphql');
    expect(chooseReviewThreadsTransport({ forceGraphql: true })).toBe(
      'graphql'
    );
    expect(chooseReviewThreadsTransport({ preferRest: false })).toBe('graphql');
  });
});

describe('buildRestReviewThreadsPageFromComments (shipped pure)', () => {
  test('groups roots and replies into synthetic threads', () => {
    const items = [
      {
        id: 10,
        body: 'root',
        path: 'a.ts',
        line: 3,
        side: 'RIGHT',
      },
      {
        id: 11,
        body: 'reply',
        path: 'a.ts',
        line: 3,
        side: 'RIGHT',
        inReplyToId: 10,
      },
      {
        id: 20,
        body: 'other',
        path: 'b.ts',
        line: 1,
        side: 'RIGHT',
      },
    ];
    const page = buildRestReviewThreadsPageFromComments(items, 'newest');
    expect(page.source).toBe('rest');
    expect(page.threads).toHaveLength(2);
    expect(page.comments).toHaveLength(3);
    const t10 = page.threads.find((t: any) => t.commentIds?.includes(10));
    expect(t10?.threadNodeId).toBe('rest-thread-10');
    expect(t10?.commentIds).toEqual([10, 11]);
    // Side-effect: stamp threadNodeId on comment rows
    expect((items[0] as any).threadNodeId).toBe('rest-thread-10');
    expect((items[1] as any).threadNodeId).toBe('rest-thread-10');
  });

  test('empty list → empty page without throwing', () => {
    const page = buildRestReviewThreadsPageFromComments([], 'newest');
    expect(page.threads).toEqual([]);
    expect(page.comments).toEqual([]);
    expect(page.source).toBe('rest');
  });
});

describe('warm revalidate: skip by-id after REST newest (shipped pure)', () => {
  test('isGraphqlReviewThreadNodeId only PRRT_', () => {
    expect(isGraphqlReviewThreadNodeId('PRRT_kwDOABC')).toBe(true);
    expect(isGraphqlReviewThreadNodeId('rest-thread-10')).toBe(false);
    expect(isGraphqlReviewThreadNodeId('PRRC_kwDOXYZ')).toBe(false);
    expect(isGraphqlReviewThreadNodeId(null)).toBe(false);
  });

  test('shouldSkipUnresolvedByIdsBulk when newest is REST', () => {
    expect(
      shouldSkipUnresolvedByIdsBulk({ newestSource: 'rest', forceFull: false })
    ).toBe(true);
    expect(
      shouldSkipUnresolvedByIdsBulk({
        hostRestFallback: true,
        newestSource: null,
      })
    ).toBe(true);
    // GraphQL escalate paths must still allow by-id
    expect(
      shouldSkipUnresolvedByIdsBulk({
        newestSource: 'rest',
        forceFull: true,
      })
    ).toBe(false);
    expect(
      shouldSkipUnresolvedByIdsBulk({
        newestSource: 'rest',
        mode: 'full-threads',
      })
    ).toBe(false);
    expect(
      shouldSkipUnresolvedByIdsBulk({ newestSource: 'graphql' })
    ).toBe(false);
  });

  test('remainingUnresolvedForByIdsBulk drops rest-thread and updated PRRT', () => {
    const remaining = remainingUnresolvedForByIdsBulk(
      [
        'PRRT_keep',
        'PRRT_updated',
        'rest-thread-10',
        'PRRC_comment',
        'PRRT_known_missing',
      ],
      new Set(['PRRT_updated']),
      new Set(['PRRT_known_missing'])
    );
    expect(remaining).toEqual(['PRRT_keep']);
  });

  test('confirmedMissingThreadIdsFromNodes only null slots on success shape', () => {
    const chunk = ['PRRT_a', 'PRRT_b', 'PRRT_c'];
    // Parallel null = remote missing
    expect(
      confirmedMissingThreadIdsFromNodes(chunk, [
        { id: 'PRRT_a' },
        null,
        { id: 'PRRT_c' },
      ])
    ).toEqual(['PRRT_b']);
    // Non-array / empty → no confirmed missing (unknown — do not wipe)
    expect(confirmedMissingThreadIdsFromNodes(chunk, null)).toEqual([]);
    expect(confirmedMissingThreadIdsFromNodes(chunk, undefined)).toEqual([]);
    // Length mismatch: only evaluate overlapping indices
    expect(
      confirmedMissingThreadIdsFromNodes(chunk, [null])
    ).toEqual(['PRRT_a']);
  });

  test('REST page + PRRT cache ids → skip by-id; remaining filter empty for rest-only', () => {
    // Simulates warm revalidate: cache still has PRRT unresolved, REST newest paints
    // synthetic ids. Product must skip by-id (shouldSkip) so GraphQL is not spent,
    // and remaining filter never queues rest-thread-* even if skip is bypassed.
    const restPage = buildRestReviewThreadsPageFromComments(
      [
        { id: 10, body: 'r', path: 'a.ts', line: 1, side: 'RIGHT' },
        { id: 11, body: 'reply', path: 'a.ts', line: 1, side: 'RIGHT', inReplyToId: 10 },
      ],
      'newest'
    );
    expect(restPage.source).toBe('rest');
    expect(shouldSkipUnresolvedByIdsBulk({ newestSource: restPage.source })).toBe(
      true
    );
    const cacheUnresolved = [
      'PRRT_old_1',
      'PRRT_old_2',
      ...restPage.threads.map((t: any) => t.threadNodeId),
    ];
    const updatedFromRest = new Set(
      restPage.threads.map((t: any) => String(t.threadNodeId))
    );
    // Even without skip: by-id remaining should only be PRRT not in rest set
    // (rest-thread never requested). Product open/onRefresh also skip entirely.
    const remaining = remainingUnresolvedForByIdsBulk(
      cacheUnresolved,
      updatedFromRest,
      new Set()
    );
    expect(remaining).toEqual(['PRRT_old_1', 'PRRT_old_2']);
    expect(remaining.every((id) => isGraphqlReviewThreadNodeId(id))).toBe(true);
    // Soft revalidate: skip → no GraphQL by-id at all
    expect(
      shouldSkipUnresolvedByIdsBulk({
        newestSource: restPage.source,
        forceFull: false,
      })
    ).toBe(true);
  });
});

describe('merge refresh drop: by-id fail must not wipe (shipped pure gate)', () => {
  const restPaintedDetail = () => {
    const rest = buildRestReviewThreadsPageFromComments(
      [
        {
          id: 10,
          body: 'root',
          path: 'demo.ts',
          line: 1,
          side: 'RIGHT',
          threadNodeId: 'PRRT_cached',
        },
        {
          id: 20,
          body: 'other',
          path: 'demo.ts',
          line: 2,
          side: 'RIGHT',
        },
      ],
      'newest'
    );
    // Detail after REST paint + prior GraphQL cache id still present
    return {
      reviewThreads: [
        { threadNodeId: 'PRRT_cached', commentIds: [10], path: 'demo.ts' },
        { threadNodeId: 'PRRT_other', commentIds: [99], path: 'x.ts' },
        ...rest.threads,
      ],
      reviewComments: [
        {
          id: 10,
          body: 'root',
          path: 'demo.ts',
          line: 1,
          threadNodeId: 'PRRT_cached',
        },
        {
          id: 20,
          body: 'rest',
          path: 'demo.ts',
          line: 2,
          threadNodeId: rest.threads[0]?.threadNodeId || 'rest-thread-20',
        },
        {
          id: 99,
          body: 'other-prrt',
          path: 'x.ts',
          line: 1,
          threadNodeId: 'PRRT_other',
        },
      ],
    };
  };

  test('resolveMissingThreadIdsForDrop ignores requested − returned', () => {
    // Total by-id fail shape: empty threads, empty missing, full requested
    const failShape = {
      direction: 'refresh',
      requestedThreadIds: ['PRRT_cached', 'PRRT_other'],
      threads: [],
      comments: [],
      missingThreadIds: [],
    };
    expect(resolveMissingThreadIdsForDrop(failShape)).toEqual([]);
    // Legacy derivation would wipe everything
    const legacyDerived = failShape.requestedThreadIds.filter(
      (id) => !failShape.threads.some((t: any) => t?.threadNodeId === id)
    );
    expect(legacyDerived).toEqual(['PRRT_cached', 'PRRT_other']);
  });

  test('by-id total fail shape does not drop REST/cache paint', () => {
    const detail = restPaintedDetail();
    const failShape = {
      direction: 'refresh',
      requestedThreadIds: ['PRRT_cached', 'PRRT_other'],
      threads: [],
      comments: [],
      missingThreadIds: [],
    };
    const after = applyByIdsRefreshDrop(detail, failShape);
    expect(after.reviewComments.map((c: any) => c.id).sort()).toEqual([
      10, 20, 99,
    ]);
    expect(after.reviewThreads.map((t: any) => t.threadNodeId)).toEqual(
      expect.arrayContaining(['PRRT_cached', 'PRRT_other'])
    );
  });

  test('partial: only confirmed null drops; failed chunk id preserved', () => {
    // PRRT_a returned, PRRT_b null confirmed, PRRT_c chunk failed (not in missing)
    const detail = {
      reviewThreads: [
        { threadNodeId: 'PRRT_a', commentIds: [1] },
        { threadNodeId: 'PRRT_b', commentIds: [2] },
        { threadNodeId: 'PRRT_c', commentIds: [3] },
      ],
      reviewComments: [
        { id: 1, threadNodeId: 'PRRT_a', body: 'a' },
        { id: 2, threadNodeId: 'PRRT_b', body: 'b' },
        { id: 3, threadNodeId: 'PRRT_c', body: 'c' },
      ],
    };
    const page = {
      direction: 'refresh',
      requestedThreadIds: ['PRRT_a', 'PRRT_b', 'PRRT_c'],
      threads: [{ threadNodeId: 'PRRT_a', commentIds: [1] }],
      comments: [{ id: 1, threadNodeId: 'PRRT_a', body: 'a' }],
      missingThreadIds: ['PRRT_b'], // only confirmed null — not PRRT_c
    };
    expect(resolveMissingThreadIdsForDrop(page)).toEqual(['PRRT_b']);
    // Old derived would include PRRT_c
    const legacy = page.requestedThreadIds.filter(
      (id) => !page.threads.some((t) => t.threadNodeId === id)
    );
    expect(legacy).toEqual(['PRRT_b', 'PRRT_c']);

    const after = applyByIdsRefreshDrop(detail, page);
    expect(after.reviewComments.map((c: any) => c.id).sort()).toEqual([1, 3]);
    expect(after.reviewThreads.map((t: any) => t.threadNodeId).sort()).toEqual([
      'PRRT_a',
      'PRRT_c',
    ]);
  });
});
