/**
 * Dual-window review thread load: newest + oldest ends, middle gap math.
 */
const assert = require('node:assert/strict');
const {
  mergeReviewThreadsPageIntoDetail,
  emptyReviewThreadsMeta,
} = require('../src/fetch-pulls.js');
const {
  partitionTimelineWithThreadGap,
} = require('../src/modal/pure/conversation-timeline.js');

function thread(id, commentId) {
  return {
    threadNodeId: id,
    resolved: false,
    outdated: false,
    path: 'a.ts',
    line: 1,
    commentIds: [commentId],
    loadWindow: id.startsWith('new') ? 'newest' : 'oldest',
  };
}

function comment(id, threadNodeId, at) {
  return {
    id,
    author: 'u',
    body: `c${id}`,
    path: 'a.ts',
    line: 1,
    createdAt: at,
    threadNodeId,
  };
}

// --- merge: newest then oldest seeds dual meta ---
{
  const detail = {
    reviewComments: [],
    reviewThreads: [],
    reviewThreadsMeta: null,
  };
  const newestPage = {
    direction: 'newest',
    threads: [thread('PRRT_new1', 1), thread('PRRT_new2', 2)],
    comments: [
      comment(1, 'PRRT_new1', '2026-06-02T00:00:00Z'),
      comment(2, 'PRRT_new2', '2026-06-01T00:00:00Z'),
    ],
    totalCount: 100,
    startCursor: 'cur_new_start',
    endCursor: 'cur_new_end',
    hasPreviousPage: true,
    hasNextPage: false,
    pageCount: 1,
  };
  let next = mergeReviewThreadsPageIntoDetail(detail, newestPage, 'newest');
  assert.equal(next.reviewThreadsMeta.totalCount, 100);
  assert.equal(next.reviewThreadsMeta.loadedThreadCount, 2);
  assert.equal(next.reviewThreadsMeta.hiddenCount, 98);
  assert.equal(next.reviewThreadsMeta.hasOlder, true);
  assert.deepEqual(next.reviewThreadsMeta.newestThreadIds.sort(), [
    'PRRT_new1',
    'PRRT_new2',
  ]);
  assert.equal(next.reviewThreadsMeta.newestStartCursor, 'cur_new_start');

  const oldestPage = {
    direction: 'oldest',
    threads: [thread('PRRT_old1', 10), thread('PRRT_old2', 11)],
    comments: [
      comment(10, 'PRRT_old1', '2025-01-01T00:00:00Z'),
      comment(11, 'PRRT_old2', '2025-01-02T00:00:00Z'),
    ],
    totalCount: 100,
    startCursor: 'cur_old_start',
    endCursor: 'cur_old_end',
    hasNextPage: true,
    hasPreviousPage: false,
    pageCount: 1,
  };
  next = mergeReviewThreadsPageIntoDetail(next, oldestPage, 'oldest');
  assert.equal(next.reviewThreadsMeta.loadedThreadCount, 4);
  assert.equal(next.reviewThreadsMeta.hiddenCount, 96);
  assert.equal(next.reviewThreadsMeta.hasMore, true);
  assert.equal(next.reviewThreadsMeta.hasNewerFromOldest, true);
  assert.deepEqual(next.reviewThreadsMeta.oldestThreadIds.sort(), [
    'PRRT_old1',
    'PRRT_old2',
  ]);
  assert.equal(next.reviewThreadsMeta.oldestEndCursor, 'cur_old_end');
}

// --- merge older expands newest window, shrinks hidden ---
{
  let detail = {
    reviewComments: [comment(1, 'PRRT_new1', '2026-06-02T00:00:00Z')],
    reviewThreads: [thread('PRRT_new1', 1)],
    reviewThreadsMeta: {
      totalCount: 50,
      hiddenCount: 49,
      loadedThreadCount: 1,
      pagesLoaded: 1,
      newestStartCursor: 'c0',
      newestEndCursor: 'c1',
      hasOlder: true,
      oldestStartCursor: null,
      oldestEndCursor: null,
      hasNewerFromOldest: false,
      newestThreadIds: ['PRRT_new1'],
      oldestThreadIds: [],
      hasMore: true,
      endCursor: 'c0',
    },
  };
  const olderPage = {
    direction: 'older',
    threads: [thread('PRRT_mid1', 20), thread('PRRT_mid2', 21)],
    comments: [
      comment(20, 'PRRT_mid1', '2026-05-01T00:00:00Z'),
      comment(21, 'PRRT_mid2', '2026-05-02T00:00:00Z'),
    ],
    totalCount: 50,
    startCursor: 'c_older',
    endCursor: 'c0',
    hasPreviousPage: true,
    pageCount: 1,
  };
  detail = mergeReviewThreadsPageIntoDetail(detail, olderPage, 'older');
  assert.equal(detail.reviewThreadsMeta.loadedThreadCount, 3);
  assert.equal(detail.reviewThreadsMeta.hiddenCount, 47);
  assert.equal(detail.reviewThreadsMeta.newestStartCursor, 'c_older');
  assert.ok(detail.reviewThreadsMeta.newestThreadIds.includes('PRRT_mid1'));
  assert.equal(detail.reviewThreadsMeta.hasMore, true);
}

// --- windows meet: hiddenCount 0 ---
{
  let detail = {
    reviewComments: [],
    reviewThreads: [thread('a', 1), thread('b', 2)],
    reviewThreadsMeta: {
      totalCount: 4,
      hiddenCount: 2,
      loadedThreadCount: 2,
      pagesLoaded: 1,
      newestStartCursor: 's',
      hasOlder: true,
      hasNewerFromOldest: false,
      newestThreadIds: ['a', 'b'],
      oldestThreadIds: [],
      hasMore: true,
      endCursor: 's',
    },
  };
  const page = {
    direction: 'older',
    threads: [thread('c', 3), thread('d', 4)],
    comments: [comment(3, 'c', 't'), comment(4, 'd', 't')],
    totalCount: 4,
    startCursor: 's2',
    hasPreviousPage: false,
    pageCount: 1,
  };
  detail = mergeReviewThreadsPageIntoDetail(detail, page, 'older');
  assert.equal(detail.reviewThreadsMeta.loadedThreadCount, 4);
  assert.equal(detail.reviewThreadsMeta.hiddenCount, 0);
  assert.equal(detail.reviewThreadsMeta.hasMore, false);
  assert.equal(detail.reviewThreadsMeta.hasOlder, false);
}

// --- partition: dual windows insert middle gap ---
{
  const items = [
    {
      kind: 'review-thread',
      id: 1,
      threadNodeId: 'PRRT_new1',
      at: '2026-06-02',
    },
    {
      kind: 'issue-comment',
      id: 99,
      at: '2026-05-01',
    },
    {
      kind: 'review-thread',
      id: 10,
      threadNodeId: 'PRRT_old1',
      at: '2025-01-01',
    },
  ];
  const part = partitionTimelineWithThreadGap(items, {
    hasMore: true,
    hiddenCount: 40,
    newestThreadIds: ['PRRT_new1'],
    oldestThreadIds: ['PRRT_old1'],
  });
  assert.equal(part.showGap, true);
  assert.equal(part.hiddenCount, 40);
  assert.equal(part.top.length, 2);
  assert.equal(part.bottom.length, 1);
  assert.equal(part.bottom[0].threadNodeId, 'PRRT_old1');
  assert.ok(part.top.some((i) => i.kind === 'issue-comment'));
}

// --- partition: no gap when fully loaded ---
{
  const part = partitionTimelineWithThreadGap(
    [{ kind: 'review-thread', id: 1, threadNodeId: 'x' }],
    { hasMore: false, hiddenCount: 0, oldestThreadIds: [] }
  );
  assert.equal(part.showGap, false);
  assert.equal(part.top.length, 1);
  assert.equal(part.bottom.length, 0);
}

// emptyReviewThreadsMeta exported for host/tests
if (typeof emptyReviewThreadsMeta === 'function') {
  const e = emptyReviewThreadsMeta();
  assert.equal(e.hiddenCount, 0);
  assert.equal(e.hasMore, false);
}

console.log('review-threads-dual-window.test.js: ok');
