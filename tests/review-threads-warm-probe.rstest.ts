/**
 * Warm-cache newest reviewThreads probe: pageSize pick, match, escalate.
 */
import { describe, expect, test } from '@rstest/core';
import {
  REVIEW_THREADS_API_MAX,
  REVIEW_THREADS_WARM_PROBE_SIZE,
  hasUsableReviewThreadsCache,
  newestThreadsPageMatchesCache,
  pickNewestThreadsPageSize,
  shouldEscalateNewestThreadsProbe,
} from '../src/modal/lib/review-threads';

function thread(
  id: string,
  opts: { resolved?: boolean; commentIds?: number[] } = {}
) {
  return {
    threadNodeId: id,
    resolved: Boolean(opts.resolved),
    commentIds: opts.commentIds || [1],
    path: 'a.ts',
    line: 1,
  };
}

function comment(
  id: number,
  threadNodeId: string,
  opts: { resolved?: boolean } = {}
) {
  return {
    id,
    threadNodeId,
    body: `c${id}`,
    resolved: Boolean(opts.resolved),
    path: 'a.ts',
  };
}

function cacheDetail(threads: any[], extra: any = {}) {
  const comments = threads.flatMap((t, i) =>
    (t.commentIds || [i + 1]).map((cid: number) =>
      comment(cid, t.threadNodeId, { resolved: t.resolved })
    )
  );
  return {
    reviewThreads: threads,
    reviewComments: comments,
    reviewThreadsMeta: {
      totalCount: threads.length,
      loadedThreadCount: threads.length,
      newestThreadIds: threads.map((t) => t.threadNodeId),
      ...(extra.meta || {}),
    },
    ...extra,
  };
}

describe('pickNewestThreadsPageSize', () => {
  test('cold defaults to API max', () => {
    expect(pickNewestThreadsPageSize()).toBe(REVIEW_THREADS_API_MAX);
    expect(pickNewestThreadsPageSize({ warmCache: false })).toBe(
      REVIEW_THREADS_API_MAX
    );
  });

  test('warm uses probe size', () => {
    expect(pickNewestThreadsPageSize({ warmCache: true })).toBe(
      REVIEW_THREADS_WARM_PROBE_SIZE
    );
  });

  test('forceFull always max even when warm', () => {
    expect(
      pickNewestThreadsPageSize({ warmCache: true, forceFull: true })
    ).toBe(REVIEW_THREADS_API_MAX);
  });
});

describe('hasUsableReviewThreadsCache', () => {
  test('rejects empty / sketch', () => {
    expect(hasUsableReviewThreadsCache(null)).toBe(false);
    expect(hasUsableReviewThreadsCache({})).toBe(false);
    expect(
      hasUsableReviewThreadsCache({
        _sketch: true,
        reviewThreads: [thread('PRRT_1')],
      })
    ).toBe(false);
  });

  test('accepts detail with PRRT ids', () => {
    expect(hasUsableReviewThreadsCache(cacheDetail([thread('PRRT_1')]))).toBe(
      true
    );
    expect(
      hasUsableReviewThreadsCache({
        reviewComments: [comment(1, 'PRRT_x')],
        reviewThreads: [],
      })
    ).toBe(true);
  });
});

describe('newestThreadsPageMatchesCache', () => {
  const many = Array.from({ length: 15 }, (_, i) =>
    thread(`PRRT_${i}`, { commentIds: [100 + i] })
  );
  const detail = cacheDetail(many, {
    meta: { totalCount: 15, newestThreadIds: many.map((t) => t.threadNodeId) },
  });

  test('matches probe that is ordered prefix with same resolve + counts', () => {
    const probeThreads = many.slice(0, 10);
    const page = {
      threads: probeThreads,
      comments: probeThreads.flatMap((t) =>
        t.commentIds.map((cid: number) => comment(cid, t.threadNodeId))
      ),
      totalCount: 15,
    };
    const r = newestThreadsPageMatchesCache(page, detail);
    expect(r.match).toBe(true);
    expect(r.reason).toBe('ok');
    expect(
      shouldEscalateNewestThreadsProbe(
        page,
        detail,
        REVIEW_THREADS_WARM_PROBE_SIZE
      )
    ).toBe(false);
  });

  test('mismatches on totalCount change', () => {
    const probeThreads = many.slice(0, 10);
    const page = {
      threads: probeThreads,
      comments: [],
      totalCount: 16,
    };
    const r = newestThreadsPageMatchesCache(page, detail);
    expect(r.match).toBe(false);
    expect(r.reason).toBe('totalCount');
    // Sub-max probe size → escalate; at WARM_PROBE(=API max) there is nowhere larger.
    expect(shouldEscalateNewestThreadsProbe(page, detail, 10)).toBe(true);
    expect(
      shouldEscalateNewestThreadsProbe(
        page,
        detail,
        REVIEW_THREADS_WARM_PROBE_SIZE
      )
    ).toBe(false);
  });

  test('mismatches when newest head has unknown thread', () => {
    const page = {
      threads: [thread('PRRT_NEW'), ...many.slice(0, 9)],
      comments: [],
      totalCount: 16,
    };
    // totalCount alone fails first
    expect(newestThreadsPageMatchesCache(page, detail).reason).toBe(
      'totalCount'
    );
    const pageSameTotal = {
      threads: [thread('PRRT_NEW'), ...many.slice(0, 9)],
      comments: [],
      totalCount: 15,
    };
    const r = newestThreadsPageMatchesCache(pageSameTotal, detail);
    expect(r.match).toBe(false);
    expect(['unknown-thread', 'order']).toContain(r.reason);
  });

  test('mismatches on resolve flag drift in probe window', () => {
    const probeThreads = many.slice(0, 10).map((t, i) =>
      i === 0 ? { ...t, resolved: true } : t
    );
    const page = {
      threads: probeThreads,
      comments: probeThreads.flatMap((t) =>
        t.commentIds.map((cid: number) =>
          comment(cid, t.threadNodeId, { resolved: t.resolved })
        )
      ),
      totalCount: 15,
    };
    const r = newestThreadsPageMatchesCache(page, detail);
    expect(r.match).toBe(false);
    expect(r.reason).toBe('resolved');
  });

  test('mismatches on comment count drift', () => {
    const probeThreads = many.slice(0, 10).map((t, i) =>
      i === 2 ? { ...t, commentIds: [t.commentIds[0], 999] } : t
    );
    const page = {
      threads: probeThreads,
      comments: probeThreads.flatMap((t) =>
        t.commentIds.map((cid: number) => comment(cid, t.threadNodeId))
      ),
      totalCount: 15,
    };
    const r = newestThreadsPageMatchesCache(page, detail);
    expect(r.match).toBe(false);
    expect(r.reason).toBe('comment-count');
  });

  test('mismatches when newest order changes', () => {
    const reordered = [many[1], many[0], ...many.slice(2, 10)];
    const page = {
      threads: reordered,
      comments: reordered.flatMap((t) =>
        t.commentIds.map((cid: number) => comment(cid, t.threadNodeId))
      ),
      totalCount: 15,
    };
    const r = newestThreadsPageMatchesCache(page, detail);
    expect(r.match).toBe(false);
    expect(r.reason).toBe('order');
  });

  test('does not escalate when pageSize already full', () => {
    const page = { threads: [], comments: [], totalCount: 0 };
    expect(
      shouldEscalateNewestThreadsProbe(page, detail, REVIEW_THREADS_API_MAX)
    ).toBe(false);
  });
});
