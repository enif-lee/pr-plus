/**
 * Cache revalidate helpers: unresolved id collection + refresh merge.
 */
const assert = require('node:assert/strict');
const {
  collectUnresolvedThreadNodeIds,
  mergeReviewThreadsPageIntoDetail,
  dropReviewThreadsFromDetail,
  emptyReviewThreadsMeta,
} = require('../src/fetch-pulls.js');

// —— collectUnresolvedThreadNodeIds ——
{
  const detail = {
    reviewThreads: [
      { threadNodeId: 'PRRT_open1', resolved: false },
      { threadNodeId: 'PRRT_done', resolved: true },
      { threadNodeId: 'PRRT_open2', resolved: false },
    ],
    reviewComments: [
      {
        id: 1,
        threadNodeId: 'PRRT_open1',
        resolved: false,
        inReplyToId: null,
      },
      {
        id: 2,
        threadNodeId: 'PRRT_open1',
        resolved: false,
        inReplyToId: 1, // reply — should not add extra id
      },
      {
        id: 3,
        threadNodeId: 'PRRT_from_comment_only',
        resolved: false,
        inReplyToId: null,
      },
    ],
  };
  const ids = collectUnresolvedThreadNodeIds(detail).sort();
  assert.deepEqual(ids, [
    'PRRT_from_comment_only',
    'PRRT_open1',
    'PRRT_open2',
  ]);
  assert.ok(!ids.includes('PRRT_done'));
}

// —— merge refresh replaces thread comments (new reply) ——
{
  const base = {
    number: 1,
    reviewComments: [
      {
        id: 10,
        body: 'root',
        threadNodeId: 'PRRT_A',
        resolved: false,
        inReplyToId: null,
      },
      {
        id: 11,
        body: 'old reply',
        threadNodeId: 'PRRT_A',
        resolved: false,
        inReplyToId: 10,
      },
    ],
    reviewThreads: [
      {
        threadNodeId: 'PRRT_A',
        resolved: false,
        commentIds: [10, 11],
      },
    ],
    reviewThreadsMeta: {
      ...emptyReviewThreadsMeta(),
      totalCount: 50,
      hiddenCount: 48,
      hasMore: true,
      newestThreadIds: ['PRRT_new'],
      oldestThreadIds: ['PRRT_old'],
      newestStartCursor: 'CUR_N',
      oldestEndCursor: 'CUR_O',
      pagesLoaded: 2,
    },
  };

  const page = {
    direction: 'refresh',
    threads: [
      {
        threadNodeId: 'PRRT_A',
        resolved: true,
        commentIds: [10, 12],
      },
    ],
    comments: [
      {
        id: 10,
        body: 'root',
        threadNodeId: 'PRRT_A',
        resolved: true,
        inReplyToId: null,
      },
      {
        id: 12,
        body: 'new reply',
        threadNodeId: 'PRRT_A',
        resolved: true,
        inReplyToId: 10,
      },
    ],
    pageCount: 1,
  };

  const next = mergeReviewThreadsPageIntoDetail(base, page, 'refresh');
  const bodies = next.reviewComments.map((c) => c.body).sort();
  assert.deepEqual(bodies, ['new reply', 'root'], 'old reply replaced by bulk snapshot');
  assert.equal(
    next.reviewComments.every((c) => c.resolved === true),
    true,
    'resolved stamped on comments'
  );
  assert.equal(next.reviewThreads.find((t) => t.threadNodeId === 'PRRT_A').resolved, true);
  // dual-window meta preserved
  assert.equal(next.reviewThreadsMeta.newestStartCursor, 'CUR_N');
  assert.equal(next.reviewThreadsMeta.oldestEndCursor, 'CUR_O');
  assert.deepEqual(next.reviewThreadsMeta.newestThreadIds, ['PRRT_new']);
  assert.deepEqual(next.reviewThreadsMeta.oldestThreadIds, ['PRRT_old']);
  assert.equal(next.reviewThreadsMeta.pagesLoaded, 2, 'refresh does not bump pagesLoaded');
  assert.equal(next.reviewThreadsMeta.totalCount, 50);
}

// —— newest merge still updates newest window ——
{
  const base = {
    reviewComments: [],
    reviewThreads: [],
    reviewThreadsMeta: emptyReviewThreadsMeta(),
  };
  const page = {
    threads: [{ threadNodeId: 'PRRT_N1', resolved: false, commentIds: [1] }],
    comments: [{ id: 1, threadNodeId: 'PRRT_N1', body: 'n', inReplyToId: null }],
    totalCount: 10,
    startCursor: 'S',
    endCursor: 'E',
    hasPreviousPage: true,
    pageCount: 1,
  };
  const next = mergeReviewThreadsPageIntoDetail(base, page, 'newest');
  assert.deepEqual(next.reviewThreadsMeta.newestThreadIds, ['PRRT_N1']);
  assert.equal(next.reviewThreadsMeta.hasPreviousPage !== false || next.reviewThreadsMeta.hasOlder, true);
  assert.equal(next.reviewThreadsMeta.totalCount, 10);
}

// —— Remote-missing threads drop on bulk refresh (local zombie cleanup) ——
{
  const base = {
    number: 1,
    reviewComments: [
      {
        id: 10,
        body: 'alive',
        threadNodeId: 'PRRT_alive',
        resolved: false,
        inReplyToId: null,
      },
      {
        id: 20,
        body: 'zombie',
        threadNodeId: 'PRRT_dead',
        resolved: false,
        inReplyToId: null,
      },
      {
        id: 21,
        body: 'zombie reply',
        threadNodeId: 'PRRT_dead',
        resolved: false,
        inReplyToId: 20,
      },
    ],
    reviewThreads: [
      { threadNodeId: 'PRRT_alive', resolved: false, commentIds: [10] },
      { threadNodeId: 'PRRT_dead', resolved: false, commentIds: [20, 21] },
    ],
    reviewThreadsMeta: {
      ...emptyReviewThreadsMeta(),
      totalCount: 2,
      hiddenCount: 0,
      newestThreadIds: ['PRRT_alive', 'PRRT_dead'],
    },
  };

  // Only alive returned; dead is missing (remote deleted)
  const page = {
    direction: 'refresh',
    requestedThreadIds: ['PRRT_alive', 'PRRT_dead'],
    missingThreadIds: ['PRRT_dead'],
    threads: [
      { threadNodeId: 'PRRT_alive', resolved: false, commentIds: [10] },
    ],
    comments: [
      {
        id: 10,
        body: 'alive',
        threadNodeId: 'PRRT_alive',
        resolved: false,
        inReplyToId: null,
      },
    ],
    pageCount: 1,
  };

  const next = mergeReviewThreadsPageIntoDetail(base, page, 'refresh');
  assert.deepEqual(
    next.reviewThreads.map((t) => t.threadNodeId).sort(),
    ['PRRT_alive'],
    'dead thread dropped from reviewThreads'
  );
  assert.deepEqual(
    next.reviewComments.map((c) => c.id).sort((a, b) => a - b),
    [10],
    'zombie comments removed'
  );
  assert.ok(
    next._deletedReviewCommentIds instanceof Set &&
      next._deletedReviewCommentIds.has('20') &&
      next._deletedReviewCommentIds.has('21'),
    'tombstones for App merge'
  );
  assert.ok(
    !next.reviewThreadsMeta.newestThreadIds.includes('PRRT_dead'),
    'meta id list scrubbed'
  );
  // collectUnresolved must not keep requesting the dead id
  assert.ok(
    !collectUnresolvedThreadNodeIds(next).includes('PRRT_dead'),
    'revalidate targets exclude remote-missing'
  );
}

// —— dropReviewThreadsFromDetail standalone ——
{
  const base = {
    reviewComments: [
      { id: 1, threadNodeId: 'PRRT_X', body: 'a' },
      { id: 2, threadNodeId: 'PRRT_Y', body: 'b' },
    ],
    reviewThreads: [
      { threadNodeId: 'PRRT_X' },
      { threadNodeId: 'PRRT_Y' },
    ],
    reviewThreadsMeta: {
      ...emptyReviewThreadsMeta(),
      totalCount: 2,
      newestThreadIds: ['PRRT_X', 'PRRT_Y'],
    },
  };
  const dropped = dropReviewThreadsFromDetail(base, ['PRRT_X']);
  assert.equal(dropped.reviewThreads.length, 1);
  assert.equal(dropped.reviewComments[0].id, 2);
  assert.ok(dropped._deletedReviewCommentIds.has('1'));
}

console.log('review-threads-revalidate.test.js: all assertions passed');
