/**
 * Lazy expand of deferred review threads must preserve sibling order.
 */
import { describe, expect, test } from '@rstest/core';
import {
  hydrateReviewCommentsInPlace,
  mergeThreadCommentsBulkIntoDetail,
  groupReviewThreads,
} from '../src/modal/lib/review-threads.ts';

function orderByThreadNodeId(comments: any[]) {
  const seen: string[] = [];
  for (const c of comments) {
    const tid = c?.threadNodeId ? String(c.threadNodeId) : '';
    if (!tid) continue;
    if (!seen.includes(tid)) seen.push(tid);
  }
  return seen;
}

describe('hydrateReviewCommentsInPlace (shipped pure)', () => {
  test('middle thread hydrate keeps A–middle–C order', () => {
    const prev = [
      {
        id: 1,
        body: 'open A',
        path: 'a.ts',
        line: 1,
        threadNodeId: 'PRRT_A',
        resolved: false,
      },
      {
        id: 'shell:PRRT_B',
        body: 'resolved preview',
        path: 'a.ts',
        line: 5,
        threadNodeId: 'PRRT_B',
        resolved: true,
        _commentsPending: false,
        _commentsPreview: true,
      },
      {
        id: 3,
        body: 'open C',
        path: 'a.ts',
        line: 10,
        threadNodeId: 'PRRT_C',
        resolved: false,
      },
    ];
    const bulk = [
      {
        id: 20,
        body: 'resolved root full',
        path: 'a.ts',
        line: 5,
        threadNodeId: 'PRRT_B',
        resolved: true,
      },
      {
        id: 21,
        body: 'resolved reply',
        path: 'a.ts',
        line: 5,
        threadNodeId: 'PRRT_B',
        resolved: true,
        inReplyToId: 20,
      },
    ];
    const before = orderByThreadNodeId(prev);
    expect(before).toEqual(['PRRT_A', 'PRRT_B', 'PRRT_C']);

    const next = hydrateReviewCommentsInPlace(prev, bulk, ['PRRT_B']);
    expect(orderByThreadNodeId(next)).toEqual(['PRRT_A', 'PRRT_B', 'PRRT_C']);
    // Shell id gone; full root at middle slot
    expect(next.map((c) => c.id)).toEqual([1, 20, 21, 3]);
    expect(next[1].body).toBe('resolved root full');
    expect(next.some((c) => String(c.id).startsWith('shell:'))).toBe(false);
  });

  test('mergeThreadCommentsBulkIntoDetail preserves reviewThreads order', () => {
    const detail = {
      number: 7,
      reviewThreads: [
        { threadNodeId: 'PRRT_A', resolved: false, commentsLoaded: true },
        { threadNodeId: 'PRRT_B', resolved: true, commentsLoaded: false },
        { threadNodeId: 'PRRT_C', resolved: false, commentsLoaded: true },
      ],
      reviewComments: [
        { id: 1, threadNodeId: 'PRRT_A', body: 'a', path: 'f.ts', line: 1 },
        {
          id: 'shell:PRRT_B',
          threadNodeId: 'PRRT_B',
          body: 'b-preview',
          path: 'f.ts',
          line: 2,
          _commentsPreview: true,
        },
        { id: 3, threadNodeId: 'PRRT_C', body: 'c', path: 'f.ts', line: 3 },
      ],
    };
    const bulk = {
      threads: [
        {
          threadNodeId: 'PRRT_B',
          resolved: true,
          commentsLoaded: true,
          commentIds: [20, 21],
        },
      ],
      comments: [
        {
          id: 20,
          threadNodeId: 'PRRT_B',
          body: 'b-full',
          path: 'f.ts',
          line: 2,
        },
        {
          id: 21,
          threadNodeId: 'PRRT_B',
          body: 'b-reply',
          path: 'f.ts',
          line: 2,
          inReplyToId: 20,
        },
      ],
    };
    const next = mergeThreadCommentsBulkIntoDetail(detail, bulk);
    expect(next.reviewThreads.map((t: any) => t.threadNodeId)).toEqual([
      'PRRT_A',
      'PRRT_B',
      'PRRT_C',
    ]);
    expect(next.reviewThreads[1].commentsLoaded).toBe(true);
    expect(orderByThreadNodeId(next.reviewComments)).toEqual([
      'PRRT_A',
      'PRRT_B',
      'PRRT_C',
    ]);
    // groupReviewThreads still sees three roots in A-B-C order
    const groups = groupReviewThreads(next.reviewComments);
    expect(groups.map((g) => g.threadNodeId)).toEqual([
      'PRRT_A',
      'PRRT_B',
      'PRRT_C',
    ]);
  });
});
