/**
 * Pure quote-reply + hide-state helpers (shipped modules).
 */
import { describe, expect, test } from '@rstest/core';
import {
  quoteReplyMarkdown,
  insertQuoteIntoDraft,
  normalizeHideReason,
  hideReasonLabel,
  isCommentMinimized,
  commentMinimizedReason,
  viewerCanMinimizeComment,
  stampCommentMinimized,
  patchDetailCommentMinimized,
  DEFAULT_HIDE_REASON,
  HIDE_REASONS,
} from '../src/modal/lib/comment-quote-hide';
import {
  mergeCommentMinimizeFields,
  mergeTimelineItemsById,
} from '../src/modal/lib/timeline-pagination';

describe('quoteReplyMarkdown', () => {
  test('prefixes each line with > ', () => {
    const q = quoteReplyMarkdown('hello\nworld');
    expect(q).toBe('> hello\n> world\n\n');
  });

  test('empty body yields a single quoted empty line', () => {
    expect(quoteReplyMarkdown('')).toBe('> \n\n');
    expect(quoteReplyMarkdown(null)).toBe('> \n\n');
  });

  test('optional author attribution', () => {
    const q = quoteReplyMarkdown('hi', 'enif-lee');
    expect(q.startsWith('**@enif-lee** wrote:\n')).toBe(true);
    expect(q).toContain('> hi');
  });

  test('strips leading @ from author', () => {
    expect(quoteReplyMarkdown('x', '@bot')).toContain('**@bot** wrote:');
  });
});

describe('insertQuoteIntoDraft', () => {
  test('replaces empty draft', () => {
    expect(insertQuoteIntoDraft('', '> a\n\n')).toBe('> a\n\n');
  });

  test('prepends quote before existing draft', () => {
    const next = insertQuoteIntoDraft('my reply', '> quoted\n\n');
    expect(next.startsWith('> quoted')).toBe(true);
    expect(next).toContain('my reply');
  });
});

describe('hide reason helpers', () => {
  test('normalizeHideReason maps known values', () => {
    expect(normalizeHideReason('spam')).toBe('SPAM');
    expect(normalizeHideReason('off-topic')).toBe('OFF_TOPIC');
    expect(normalizeHideReason('OUTDATED')).toBe('OUTDATED');
    expect(normalizeHideReason('nope')).toBe(DEFAULT_HIDE_REASON);
  });

  test('HIDE_REASONS covers GitHub classifiers', () => {
    expect(HIDE_REASONS).toContain('SPAM');
    expect(HIDE_REASONS).toContain('OFF_TOPIC');
    expect(hideReasonLabel('SPAM')).toBe('spam');
  });
});

describe('minimized comment stamps', () => {
  test('isCommentMinimized reads flags', () => {
    expect(isCommentMinimized({ isMinimized: true })).toBe(true);
    expect(isCommentMinimized({ minimized: true })).toBe(true);
    expect(isCommentMinimized({ body: 'x' })).toBe(false);
  });

  test('commentMinimizedReason', () => {
    expect(commentMinimizedReason({ isMinimized: true, minimizedReason: 'SPAM' })).toBe(
      'SPAM'
    );
    expect(commentMinimizedReason({ body: 'x' })).toBe(null);
  });

  test('viewerCanMinimizeComment', () => {
    expect(
      viewerCanMinimizeComment({ viewerCanMinimize: true, nodeId: 'IC_x' })
    ).toBe(true);
    expect(viewerCanMinimizeComment({ viewerCanMinimize: false })).toBe(false);
    expect(viewerCanMinimizeComment({ nodeId: 'IC_x' })).toBe(true);
    // Minimized without explicit flag still allows Unhide when nodeId known
    expect(
      viewerCanMinimizeComment({
        nodeId: 'IC_x',
        isMinimized: true,
      })
    ).toBe(true);
  });

  test('stampCommentMinimized hide/unhide', () => {
    const base = { id: 1, body: 'hi', isMinimized: false };
    const hid = stampCommentMinimized(base, {
      isMinimized: true,
      minimizedReason: 'SPAM',
    });
    expect(hid.isMinimized).toBe(true);
    expect(hid.minimizedReason).toBe('SPAM');
    const shown = stampCommentMinimized(hid, { isMinimized: false });
    expect(shown.isMinimized).toBe(false);
    expect(shown.minimizedReason).toBe(null);
  });

  test('patchDetailCommentMinimized patches issue + review lists', () => {
    const detail = {
      comments: [{ id: 10, body: 'a', isMinimized: false }],
      reviewComments: [{ id: 20, body: 'b', isMinimized: false }],
    };
    const next = patchDetailCommentMinimized(detail, 10, {
      isMinimized: true,
      minimizedReason: 'OFF_TOPIC',
    });
    expect(next.comments[0].isMinimized).toBe(true);
    expect(next.comments[0].minimizedReason).toBe('OFF_TOPIC');
    expect(next.reviewComments[0].isMinimized).toBe(false);
    const next2 = patchDetailCommentMinimized(next, 20, {
      isMinimized: true,
      minimizedReason: 'SPAM',
    });
    expect(next2.reviewComments[0].isMinimized).toBe(true);
  });
});

describe('mergeCommentMinimizeFields (refresh persistence)', () => {
  test('REST null isMinimized does not wipe GraphQL minimized true', () => {
    const gql = {
      id: 1,
      body: 'x',
      isMinimized: true,
      minimizedReason: 'OFF_TOPIC',
      viewerCanMinimize: true,
      nodeId: 'IC_x',
    };
    const rest = {
      id: 1,
      body: 'x',
      isMinimized: null,
      minimizedReason: null,
      viewerCanMinimize: null,
      nodeId: 'IC_x',
    };
    const m = mergeCommentMinimizeFields(gql, rest);
    expect(m.isMinimized).toBe(true);
    expect(m.minimizedReason).toBe('OFF_TOPIC');
    expect(m.viewerCanMinimize).toBe(true);
  });

  test('GraphQL false overwrites prior minimized after unhide', () => {
    const prev = {
      id: 1,
      isMinimized: true,
      minimizedReason: 'SPAM',
    };
    const gql = {
      id: 1,
      isMinimized: false,
      minimizedReason: null,
      viewerCanMinimize: true,
    };
    const m = mergeCommentMinimizeFields(prev, gql);
    expect(m.isMinimized).toBe(false);
    expect(m.minimizedReason).toBe(null);
  });

  test('mergeTimelineItemsById keeps minimize across REST overwrite', () => {
    const gqlComments = [
      {
        kind: 'issue-comment',
        id: 9,
        body: 'hidden',
        isMinimized: true,
        minimizedReason: 'OFF_TOPIC',
        nodeId: 'IC_9',
      },
    ];
    const restItems = [
      {
        kind: 'issue-comment',
        id: 9,
        body: 'hidden',
        isMinimized: null,
        nodeId: 'IC_9',
      },
    ];
    const merged = mergeTimelineItemsById(gqlComments, restItems);
    expect(merged).toHaveLength(1);
    expect(merged[0].isMinimized).toBe(true);
    expect(merged[0].minimizedReason).toBe('OFF_TOPIC');
  });

  test('REST-only minimized (enrichment) paints without GraphQL timeline row', () => {
    // Comment only present on REST page after Minimizable enrich
    const restOnly = [
      {
        id: 42,
        body: 'off-topic body',
        isMinimized: true,
        minimizedReason: 'OFF_TOPIC',
        nodeId: 'IC_42',
      },
    ];
    const merged = mergeTimelineItemsById([], restOnly);
    expect(merged).toHaveLength(1);
    expect(merged[0].isMinimized).toBe(true);
  });
});

describe('REST mappers preserve unknown minimize as null', () => {
  test('mapIssueComment REST payload → isMinimized null', async () => {
    const { mapIssueComment, mapReviewComment } = await import(
      '../src/fetch/mappers'
    );
    const issue = mapIssueComment({
      id: 1,
      node_id: 'IC_x',
      body: 'hi',
      user: { login: 'a', avatar_url: '' },
      created_at: '2024-01-01T00:00:00Z',
    });
    expect(issue.isMinimized).toBe(null);
    expect(issue.minimizedReason).toBe(null);

    const review = mapReviewComment({
      id: 2,
      node_id: 'PRRC_x',
      body: 'line note',
      path: 'a.ts',
      user: { login: 'a', avatar_url: '' },
      created_at: '2024-01-01T00:00:00Z',
      line: 1,
      side: 'RIGHT',
    });
    expect(review.isMinimized).toBe(null);
    expect(review.minimizedReason).toBe(null);
  });

  test('mapIssueComment keeps GraphQL isMinimized true', async () => {
    const { mapIssueComment } = await import('../src/fetch/mappers');
    const c = mapIssueComment({
      id: 1,
      node_id: 'IC_x',
      body: 'hi',
      user: { login: 'a' },
      created_at: '2024-01-01T00:00:00Z',
      isMinimized: true,
      minimizedReason: 'OFF_TOPIC',
      viewerCanMinimize: true,
    });
    expect(c.isMinimized).toBe(true);
    expect(c.minimizedReason).toBe('OFF_TOPIC');
    expect(c.viewerCanMinimize).toBe(true);
  });
});

describe('mapGraphqlReviewThreadNodes keeps Minimizable fields', () => {
  test('shell first:1 node maps isMinimized + nodeId', async () => {
    const { mapGraphqlReviewThreadNodes } = await import(
      '../src/modal/lib/review-threads-map'
    );
    const { threads, comments } = mapGraphqlReviewThreadNodes([
      {
        id: 'PRRT_1',
        isResolved: false,
        isOutdated: false,
        path: 'f.ts',
        line: 3,
        diffSide: 'RIGHT',
        comments: {
          totalCount: 1,
          nodes: [
            {
              id: 'PRRC_node',
              databaseId: 99,
              body: 'hidden review note',
              path: 'f.ts',
              line: 3,
              createdAt: '2024-01-01T00:00:00Z',
              author: { login: 'a', avatarUrl: '' },
              isMinimized: true,
              minimizedReason: 'OFF_TOPIC',
              viewerCanMinimize: true,
              pullRequestReview: { databaseId: 7, state: 'COMMENTED' },
            },
          ],
        },
      },
    ]);
    expect(threads).toHaveLength(1);
    expect(comments).toHaveLength(1);
    expect(comments[0].nodeId).toBe('PRRC_node');
    expect(comments[0].isMinimized).toBe(true);
    expect(comments[0].minimizedReason).toBe('OFF_TOPIC');
    expect(comments[0].viewerCanMinimize).toBe(true);
  });
});
