/**
 * Shell reviewThreads comments(first:1) carry pullRequestReview so first paint
 * can always-group without by-ids. GraphQL cost measured flat (cost=1).
 */
import { describe, expect, test } from '@rstest/core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mapGraphqlReviewThreadNodes } from '../src/modal/lib/review-threads-map.ts';
import { buildConversationTimeline } from '../src/modal/lib/conversation-timeline-build.ts';
import { REVIEW_THREAD_SHELL_FIELDS } from '../src/fetch/review-threads-map.ts';

const root = resolve(__dirname, '..');

describe('shell includes pullRequestReview (cost-safe first-paint group)', () => {
  test('shell field selection requests pullRequestReview.databaseId', () => {
    expect(REVIEW_THREAD_SHELL_FIELDS).toMatch(
      /pullRequestReview\s*\{\s*databaseId\s+state\s*\}/
    );
    // Still first:1 preview — not first:100 nested on shell
    expect(REVIEW_THREAD_SHELL_FIELDS).toMatch(/comments\s*\(\s*first\s*:\s*1\s*\)/);
  });

  test('mapGraphqlReviewThreadNodes maps reviewId from shell preview nodes', () => {
    const mapped = mapGraphqlReviewThreadNodes([
      {
        id: 'PRRT_A',
        isResolved: true,
        isOutdated: false,
        path: 'a.py',
        line: 10,
        diffSide: 'RIGHT',
        comments: {
          totalCount: 1,
          nodes: [
            {
              databaseId: 1,
              body: 'one',
              path: 'a.py',
              line: 10,
              createdAt: '2026-07-15T08:00:00Z',
              author: { login: 'bot', avatarUrl: '' },
              pullRequestReview: { databaseId: 99, state: 'COMMENTED' },
            },
          ],
        },
      },
      {
        id: 'PRRT_B',
        isResolved: true,
        path: 'b.py',
        line: 20,
        diffSide: 'RIGHT',
        comments: {
          totalCount: 1,
          nodes: [
            {
              databaseId: 2,
              body: 'two',
              path: 'b.py',
              line: 20,
              createdAt: '2026-07-15T08:01:00Z',
              author: { login: 'bot', avatarUrl: '' },
              pullRequestReview: { databaseId: 99, state: 'COMMENTED' },
            },
          ],
        },
      },
      {
        id: 'PRRT_C',
        isResolved: true,
        path: 'c.py',
        line: 30,
        diffSide: 'RIGHT',
        comments: {
          totalCount: 1,
          nodes: [
            {
              databaseId: 3,
              body: 'three',
              path: 'c.py',
              line: 30,
              createdAt: '2026-07-15T08:02:00Z',
              author: { login: 'bot', avatarUrl: '' },
              pullRequestReview: { databaseId: 99, state: 'COMMENTED' },
            },
          ],
        },
      },
    ]);
    expect(mapped.comments).toHaveLength(3);
    expect(mapped.comments.every((c: any) => c.reviewId === 99)).toBe(true);
    expect(mapped.comments.every((c: any) => c._commentsPreview === false)).toBe(
      true
    );

    const items = buildConversationTimeline({
      reviews: [
        {
          id: 99,
          author: 'chatgpt-codex-connector[bot]',
          state: 'COMMENTED',
          body: 'Codex Review\n\nP1 …',
          submittedAt: '2026-07-15T08:27:24Z',
        },
      ],
      reviewComments: mapped.comments,
    });
    const groups = items.filter((i) => i.kind === 'review-group');
    const standalone = items.filter((i) => i.kind === 'review-thread');
    expect(groups).toHaveLength(1);
    expect(groups[0].threadCount).toBe(3);
    expect(standalone).toHaveLength(0);
  });

  test('cost probe evidence note is documented in source comment', () => {
    const src = readFileSync(
      resolve(root, 'src/fetch/review-threads-map.ts'),
      'utf8'
    );
    expect(src).toMatch(/cost stays 1|measured on/i);
  });
});
