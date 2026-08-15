/**
 * Adaptive newest-threads warm probe decisions (shipped pure).
 */
import { describe, expect, test } from '@rstest/core';

describe('adaptive decision simulation', () => {
  test('warm match → no escalate; mismatch → escalate', async () => {
    const RT = await import('../src/modal/lib/review-threads');
    const threads = Array.from({ length: 12 }, (_, i) => ({
      threadNodeId: `PRRT_${i}`,
      resolved: false,
      commentIds: [i + 1],
    }));
    const detail = {
      reviewThreads: threads,
      reviewComments: threads.map((t, i) => ({
        id: i + 1,
        threadNodeId: t.threadNodeId,
        body: 'x',
        resolved: false,
      })),
      reviewThreadsMeta: {
        totalCount: 12,
        newestThreadIds: threads.map((t) => t.threadNodeId),
        loadedThreadCount: 12,
      },
    };

    const pageSize = RT.pickNewestThreadsPageSize({ warmCache: true });
    expect(pageSize).toBe(RT.REVIEW_THREADS_WARM_PROBE_SIZE);

    const matchPage = {
      threads: threads.slice(0, pageSize),
      comments: threads.slice(0, pageSize).map((t, i) => ({
        id: i + 1,
        threadNodeId: t.threadNodeId,
        body: 'x',
      })),
      totalCount: 12,
    };
    expect(
      RT.shouldEscalateNewestThreadsProbe(matchPage, detail, pageSize)
    ).toBe(false);

    const mismatchPage = {
      ...matchPage,
      totalCount: 13,
    };
    // Sub-max probe size escalates on mismatch; at WARM_PROBE(=API max=100)
    // there is nowhere larger to escalate.
    expect(
      RT.shouldEscalateNewestThreadsProbe(mismatchPage, detail, 10)
    ).toBe(true);
    expect(
      RT.shouldEscalateNewestThreadsProbe(mismatchPage, detail, pageSize)
    ).toBe(pageSize < RT.REVIEW_THREADS_API_MAX);
  });
});
