/**
 * Conversation timeline always groups review-backed threads under review-group,
 * including single COMMENTED + empty body and resolved/unresolved variants.
 */
import { describe, expect, test } from '@rstest/core';
import { buildConversationTimeline } from '../src/modal/lib/conversation-timeline-build.ts';

function detailWithSingleThread(opts: {
  resolved?: boolean;
  reviewBody?: string;
  state?: string;
  reviewId?: number;
}) {
  const reviewId = opts.reviewId ?? 42;
  return {
    viewerLogin: 'viewer',
    reviews: [
      {
        id: reviewId,
        author: 'alice',
        state: opts.state || 'COMMENTED',
        body: opts.reviewBody ?? '',
        submittedAt: '2026-07-01T12:00:00Z',
      },
    ],
    reviewComments: [
      {
        id: 9001,
        author: 'alice',
        body: 'nit',
        createdAt: '2026-07-01T12:00:00Z',
        path: 'src/a.ts',
        line: 10,
        side: 'RIGHT',
        reviewId,
        resolved: Boolean(opts.resolved),
        threadNodeId: 'PRRT_single',
      },
    ],
    comments: [],
    timelineEvents: [],
  };
}

describe('buildConversationTimeline always-group (shipped)', () => {
  test('single COMMENTED unresolved → review-group embeds thread', () => {
    const items = buildConversationTimeline(
      detailWithSingleThread({ resolved: false })
    );
    const groups = items.filter((i) => i.kind === 'review-group');
    const standalone = items.filter((i) => i.kind === 'review-thread');
    expect(groups).toHaveLength(1);
    expect(standalone).toHaveLength(0);
    expect(groups[0].threads).toHaveLength(1);
    expect(groups[0].threads[0].id).toBe(9001);
    expect(groups[0].state).toBe('COMMENTED');
    expect(groups[0].resolvedCount).toBe(0);
  });

  test('single COMMENTED resolved → still review-group (not standalone)', () => {
    const items = buildConversationTimeline(
      detailWithSingleThread({ resolved: true })
    );
    const groups = items.filter((i) => i.kind === 'review-group');
    expect(groups).toHaveLength(1);
    expect(items.some((i) => i.kind === 'review-thread')).toBe(false);
    expect(groups[0].resolvedCount).toBe(1);
    expect(groups[0].threads[0].resolved).toBe(true);
  });

  test('orphan thread without reviewId stays review-thread', () => {
    const items = buildConversationTimeline({
      reviews: [],
      reviewComments: [
        {
          id: 1,
          author: 'bob',
          body: 'orphan',
          createdAt: '2026-07-01T12:00:00Z',
          path: 'x.ts',
          line: 1,
          // no reviewId
        },
      ],
    });
    expect(items.some((i) => i.kind === 'review-thread')).toBe(true);
    expect(items.some((i) => i.kind === 'review-group')).toBe(false);
  });

  test('multi-file same reviewId → one group with two threads', () => {
    const items = buildConversationTimeline({
      reviews: [
        {
          id: 7,
          author: 'alice',
          state: 'APPROVED',
          body: 'LGTM',
          submittedAt: '2026-07-02T10:00:00Z',
        },
      ],
      reviewComments: [
        {
          id: 1,
          author: 'alice',
          body: 'a',
          createdAt: '2026-07-02T09:00:00Z',
          path: 'a.ts',
          line: 1,
          reviewId: 7,
        },
        {
          id: 2,
          author: 'alice',
          body: 'b',
          createdAt: '2026-07-02T09:01:00Z',
          path: 'b.ts',
          line: 2,
          reviewId: 7,
        },
      ],
    });
    const groups = items.filter((i) => i.kind === 'review-group');
    expect(groups).toHaveLength(1);
    expect(groups[0].threadCount).toBe(2);
    expect(groups[0].state).toBe('APPROVED');
    expect(items.filter((i) => i.kind === 'review-thread')).toHaveLength(0);
  });
});
