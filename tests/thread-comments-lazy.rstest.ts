/**
 * GraphQL threads shell + selective/lazy comments — pure selection + map + merge.
 * Drives shipped helpers (not re-implementations).
 */
import { describe, expect, test } from '@rstest/core';
import {
  buildShellThreadPlaceholderComment,
  ensureShellPlaceholderComments,
  isGraphqlReviewThreadNodeId,
  mapGraphqlReviewThreadNodes,
  mergeCommentsBulkIntoThreadsPage,
  mergeReviewThreadGroupsWithShells,
  mergeThreadCommentsBulkIntoDetail,
  retainShellCommentsAfterBulk,
  selectThreadIdsForEagerComments,
  selectThreadIdsMissingComments,
  threadCommentsAreLoaded,
  threadNeedsEagerComments,
  groupReviewThreads,
} from '../src/modal/lib/review-threads.ts';
import {
  labelGraphqlOperation,
} from '../src/modal/lib/graphql-cost-log.ts';

describe('eager vs deferred comment selection (shipped pure)', () => {
  const openT = { threadNodeId: 'PRRT_open1', resolved: false, commentsLoaded: false };
  const resolvedT = { threadNodeId: 'PRRT_res1', resolved: true, commentsLoaded: false };
  const restT = { threadNodeId: 'rest-thread-9', resolved: false, commentsLoaded: true };

  test('unresolved needs eager; resolved defers', () => {
    expect(threadNeedsEagerComments(openT)).toBe(true);
    expect(threadNeedsEagerComments(resolvedT)).toBe(false);
    expect(threadNeedsEagerComments(restT)).toBe(false); // not PRRT
  });

  test('expanded resolved becomes eager', () => {
    expect(
      threadNeedsEagerComments(resolvedT, {
        expandedThreadIds: new Set(['PRRT_res1']),
      })
    ).toBe(true);
  });

  test('selectThreadIdsForEagerComments skips loaded + resolved', () => {
    const ids = selectThreadIdsForEagerComments([
      openT,
      resolvedT,
      { ...openT, threadNodeId: 'PRRT_open2', commentsLoaded: true },
      restT,
    ]);
    expect(ids).toEqual(['PRRT_open1']);
  });

  test('threadCommentsAreLoaded + missing selection for expand', () => {
    expect(threadCommentsAreLoaded(resolvedT, [])).toBe(false);
    expect(
      threadCommentsAreLoaded(
        { ...resolvedT, commentsLoaded: true, commentIds: [1] },
        [{ id: 1, threadNodeId: 'PRRT_res1', body: 'hi' }]
      )
    ).toBe(true);
    const missing = selectThreadIdsMissingComments(
      [openT, resolvedT],
      [],
      { onlyThreadIds: ['PRRT_res1'] }
    );
    expect(missing).toEqual(['PRRT_res1']);
    // re-expand after load
    const loaded = selectThreadIdsMissingComments(
      [{ ...resolvedT, commentsLoaded: true }],
      [{ id: 1, threadNodeId: 'PRRT_res1', body: 'x' }],
      { onlyThreadIds: ['PRRT_res1'] }
    );
    expect(loaded).toEqual([]);
  });
});

describe('shell groups + placeholder (shipped pure)', () => {
  test('mergeReviewThreadGroupsWithShells injects shell-only resolved', () => {
    const comments = [
      {
        id: 10,
        body: 'open root',
        path: 'a.ts',
        line: 1,
        side: 'RIGHT',
        threadNodeId: 'PRRT_open1',
        resolved: false,
      },
    ];
    const groups = groupReviewThreads(comments);
    const merged = mergeReviewThreadGroupsWithShells(groups, [
      {
        threadNodeId: 'PRRT_open1',
        resolved: false,
        commentsLoaded: true,
        commentIds: [10],
        path: 'a.ts',
        line: 1,
      },
      {
        threadNodeId: 'PRRT_res1',
        resolved: true,
        commentsLoaded: false,
        commentIds: [],
        path: 'b.ts',
        line: 2,
      },
    ]);
    expect(merged.some((g) => g.threadNodeId === 'PRRT_open1')).toBe(true);
    const shell = merged.find((g) => g.threadNodeId === 'PRRT_res1');
    expect(shell).toBeTruthy();
    expect(shell.commentsPending).toBe(true);
    expect(shell.root?._commentsPending).toBe(true);
  });

  test('buildShellThreadPlaceholderComment', () => {
    const p = buildShellThreadPlaceholderComment({
      threadNodeId: 'PRRT_x',
      path: 'f.ts',
      line: 3,
      resolved: true,
    });
    expect(p?.id).toBe('shell:PRRT_x');
    expect(p?._commentsPending).toBe(true);
    expect(isGraphqlReviewThreadNodeId('PRRT_x')).toBe(true);
  });

  test('ensureShellPlaceholderComments injects deferred only', () => {
    const threads = [
      {
        threadNodeId: 'PRRT_open',
        resolved: false,
        commentsLoaded: true,
        commentIds: [1],
        path: 'a.ts',
        line: 1,
      },
      {
        threadNodeId: 'PRRT_res',
        resolved: true,
        commentsLoaded: false,
        commentIds: [],
        path: 'b.ts',
        line: 2,
      },
    ];
    const out = ensureShellPlaceholderComments(threads, [
      { id: 1, threadNodeId: 'PRRT_open', body: 'hi' },
    ]);
    expect(out).toHaveLength(2);
    expect(out.some((c) => c.id === 1)).toBe(true);
    expect(
      out.some((c) => c.id === 'shell:PRRT_res' && c._commentsPending)
    ).toBe(true);
    // idempotent
    expect(ensureShellPlaceholderComments(threads, out)).toHaveLength(2);
  });
});

describe('mapGraphqlReviewThreadNodes + merge bulk (shipped pure)', () => {
  test('shell nodes without comments → commentsLoaded false', () => {
    const mapped = mapGraphqlReviewThreadNodes([
      {
        id: 'PRRT_open',
        isResolved: false,
        path: 'a.ts',
        line: 1,
        diffSide: 'RIGHT',
      },
      {
        id: 'PRRT_res',
        isResolved: true,
        path: 'b.ts',
        line: 2,
        diffSide: 'RIGHT',
      },
    ]);
    expect(mapped.comments).toEqual([]);
    expect(mapped.threads).toHaveLength(2);
    expect(mapped.threads.every((t) => t.commentsLoaded === false)).toBe(true);
    expect(mapped.threads.every((t) => (t.commentIds || []).length === 0)).toBe(
      true
    );
    // Eager only unresolved
    expect(selectThreadIdsForEagerComments(mapped.threads)).toEqual([
      'PRRT_open',
    ]);
  });

  test('shell comments(first:1) preview keeps multi-reply deferred', () => {
    const mapped = mapGraphqlReviewThreadNodes([
      {
        id: 'PRRT_res',
        isResolved: true,
        path: 'b.ts',
        line: 2,
        diffSide: 'RIGHT',
        comments: {
          totalCount: 3,
          nodes: [
            {
              databaseId: 50,
              body: 'root description',
              path: 'b.ts',
              line: 2,
              author: { login: 'alice', avatarUrl: 'u' },
            },
          ],
        },
      },
    ]);
    expect(mapped.threads[0].commentsLoaded).toBe(false);
    expect(mapped.threads[0].commentCount).toBe(3);
    expect(mapped.comments).toHaveLength(1);
    expect(mapped.comments[0].body).toBe('root description');
    expect(mapped.comments[0]._commentsPreview).toBe(true);
    // still missing full replies for expand
    expect(
      selectThreadIdsMissingComments(mapped.threads, mapped.comments, {
        onlyThreadIds: ['PRRT_res'],
      })
    ).toEqual(['PRRT_res']);
  });

  test('shell comments(first:1) with totalCount 1 is fully loaded', () => {
    const mapped = mapGraphqlReviewThreadNodes([
      {
        id: 'PRRT_solo',
        isResolved: true,
        path: 'c.ts',
        line: 1,
        comments: {
          totalCount: 1,
          nodes: [{ databaseId: 7, body: 'only one', path: 'c.ts', line: 1 }],
        },
      },
    ]);
    expect(mapped.threads[0].commentsLoaded).toBe(true);
    expect(mapped.comments[0].body).toBe('only one');
    expect(mapped.comments[0]._commentsPreview).toBe(false);
  });

  test('full by-id nodes → commentsLoaded true + bodies', () => {
    const mapped = mapGraphqlReviewThreadNodes([
      {
        id: 'PRRT_open',
        isResolved: false,
        path: 'a.ts',
        line: 1,
        diffSide: 'RIGHT',
        comments: {
          nodes: [
            {
              databaseId: 101,
              body: 'hello root',
              path: 'a.ts',
              line: 1,
              author: { login: 'u' },
            },
            {
              databaseId: 102,
              body: 'reply',
              path: 'a.ts',
              line: 1,
              replyTo: { databaseId: 101 },
              author: { login: 'v' },
            },
          ],
        },
      },
    ]);
    expect(mapped.threads[0].commentsLoaded).toBe(true);
    expect(mapped.threads[0].commentIds).toEqual([101, 102]);
    expect(mapped.comments).toHaveLength(2);
    expect(mapped.comments[0].body).toBe('hello root');
    expect(mapped.comments[0].threadNodeId).toBe('PRRT_open');
  });

  test('mergeCommentsBulkIntoThreadsPage fills eager only', () => {
    const shell = mapGraphqlReviewThreadNodes([
      { id: 'PRRT_open', isResolved: false, path: 'a.ts', line: 1 },
      { id: 'PRRT_res', isResolved: true, path: 'b.ts', line: 2 },
    ]);
    const bulk = mapGraphqlReviewThreadNodes([
      {
        id: 'PRRT_open',
        isResolved: false,
        path: 'a.ts',
        line: 1,
        comments: {
          nodes: [{ databaseId: 10, body: 'open body', path: 'a.ts', line: 1 }],
        },
      },
    ]);
    const page = mergeCommentsBulkIntoThreadsPage(
      { ...shell, source: 'graphql', shellOnly: true },
      bulk
    );
    const open = page.threads.find((t) => t.threadNodeId === 'PRRT_open');
    const res = page.threads.find((t) => t.threadNodeId === 'PRRT_res');
    expect(open?.commentsLoaded).toBe(true);
    expect(open?.commentIds).toEqual([10]);
    expect(res?.commentsLoaded).toBe(false);
    // Eager body for open + shell placeholder for deferred resolved
    expect(page.comments).toHaveLength(2);
    expect(page.comments.some((c) => c.body === 'open body')).toBe(true);
    const shellPh = page.comments.find(
      (c) => c.threadNodeId === 'PRRT_res' && c._commentsPending
    );
    expect(shellPh).toBeTruthy();
    expect(shellPh?.id).toBe('shell:PRRT_res');
    // re-select missing for resolved expand
    expect(
      selectThreadIdsMissingComments(page.threads, page.comments, {
        onlyThreadIds: ['PRRT_res'],
      })
    ).toEqual(['PRRT_res']);
    expect(
      selectThreadIdsMissingComments(page.threads, page.comments, {
        onlyThreadIds: ['PRRT_open'],
      })
    ).toEqual([]);
  });

  test('merge bulk keeps deferred first:1 root description (no empty shell)', () => {
    const shell = mapGraphqlReviewThreadNodes([
      {
        id: 'PRRT_open',
        isResolved: false,
        path: 'a.ts',
        line: 1,
        comments: {
          totalCount: 2,
          nodes: [
            {
              databaseId: 1,
              body: 'open preview',
              path: 'a.ts',
              line: 1,
              author: { login: 'o' },
            },
          ],
        },
      },
      {
        id: 'PRRT_res',
        isResolved: true,
        path: 'b.ts',
        line: 2,
        comments: {
          totalCount: 3,
          nodes: [
            {
              databaseId: 50,
              body: 'resolved description',
              path: 'b.ts',
              line: 2,
              author: { login: 'r' },
            },
          ],
        },
      },
    ]);
    expect(shell.comments).toHaveLength(2);
    expect(shell.threads.find((t) => t.threadNodeId === 'PRRT_res')?.commentsLoaded).toBe(
      false
    );

    const bulk = mapGraphqlReviewThreadNodes([
      {
        id: 'PRRT_open',
        isResolved: false,
        path: 'a.ts',
        line: 1,
        comments: {
          nodes: [
            {
              databaseId: 1,
              body: 'open full',
              path: 'a.ts',
              line: 1,
              author: { login: 'o' },
            },
            {
              databaseId: 2,
              body: 'open reply',
              path: 'a.ts',
              line: 1,
              replyTo: { databaseId: 1 },
              author: { login: 'x' },
            },
          ],
        },
      },
    ]);
    const page = mergeCommentsBulkIntoThreadsPage(
      { ...shell, source: 'graphql', shellOnly: true },
      bulk
    );

    // Open: full bulk replaced preview
    expect(page.comments.some((c) => c.body === 'open full')).toBe(true);
    expect(page.comments.some((c) => c.body === 'open reply')).toBe(true);
    expect(page.comments.some((c) => c.body === 'open preview')).toBe(false);

    // Resolved deferred: first:1 description must survive (not empty shell)
    const resRows = page.comments.filter((c) => c.threadNodeId === 'PRRT_res');
    expect(resRows).toHaveLength(1);
    expect(resRows[0].body).toBe('resolved description');
    expect(resRows[0].author).toBe('r');
    expect(resRows[0]._commentsPreview).toBe(true);
    expect(resRows[0]._commentsPending).toBeFalsy();
    // No empty "No content" placeholder for that thread
    expect(
      page.comments.some(
        (c) =>
          c.threadNodeId === 'PRRT_res' &&
          c._commentsPending &&
          !String(c.body || '').trim()
      )
    ).toBe(false);

    // retain helper unit
    const retained = retainShellCommentsAfterBulk(shell.comments, new Set(['PRRT_open']));
    expect(retained.some((c) => c.body === 'resolved description')).toBe(true);
    expect(retained.some((c) => c.body === 'open preview')).toBe(false);
  });

  test('lazy expand merge into detail + re-expand no-op', () => {
    const detail = {
      number: 7,
      reviewThreads: [
        {
          threadNodeId: 'PRRT_res',
          resolved: true,
          commentsLoaded: false,
          commentIds: [],
          path: 'b.ts',
          line: 2,
        },
      ],
      reviewComments: [
        {
          id: 'shell:PRRT_res',
          threadNodeId: 'PRRT_res',
          body: '',
          _commentsPending: true,
        },
      ],
    };
    const bulk = mapGraphqlReviewThreadNodes([
      {
        id: 'PRRT_res',
        isResolved: true,
        path: 'b.ts',
        line: 2,
        comments: {
          nodes: [
            { databaseId: 99, body: 'resolved body', path: 'b.ts', line: 2 },
          ],
        },
      },
    ]);
    const next = mergeThreadCommentsBulkIntoDetail(detail, bulk);
    const th = next.reviewThreads.find(
      (t: any) => t.threadNodeId === 'PRRT_res'
    );
    expect(th?.commentsLoaded).toBe(true);
    expect(next.reviewComments.some((c: any) => c.body === 'resolved body')).toBe(
      true
    );
    expect(
      next.reviewComments.some((c: any) => c._commentsPending)
    ).toBe(false);
    // re-expand: nothing missing
    expect(
      selectThreadIdsMissingComments(next.reviewThreads, next.reviewComments, {
        onlyThreadIds: ['PRRT_res'],
      })
    ).toEqual([]);
  });
});

describe('GraphQL cost labels (shipped pure)', () => {
  test('cost labels distinguish shell vs byIds', () => {
    expect(
      labelGraphqlOperation('query ReviewThreadsLastShell { repository { x } }')
    ).toBe('reviewThreads.last.shell');
    expect(
      labelGraphqlOperation(
        'query ReviewThreadsByIdsFull($ids:[ID!]!){ nodes(ids:$ids){ ... on PullRequestReviewThread { id } } }'
      )
    ).toBe('reviewThreads.byIds');
  });
});
