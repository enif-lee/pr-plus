const assert = require('node:assert/strict');
const {
  groupReviewThreads,
  mergeReviewThreadMeta,
  mapGraphqlReviewThreads,
  countReviewThreadsByPath,
  buildReplyReviewCommentRequest,
  buildResolveThreadGraphql,
  filterFilesByQuery,
  toggleViewedPath,
  isPathViewed,
} = require('../src/modal/lib/review-threads.ts');

const comments = [
  {
    id: 1,
    path: 'a.js',
    line: 3,
    body: 'root',
    author: 'alice',
    threadNodeId: 'PRRT_1',
  },
  {
    id: 2,
    path: 'a.js',
    line: 3,
    body: 'reply',
    author: 'bob',
    inReplyToId: 1,
  },
  {
    id: 3,
    path: 'b.js',
    line: 1,
    body: 'other',
    author: 'carol',
  },
];

const threads = groupReviewThreads(comments);
assert.equal(threads.length, 2);
const t1 = threads.find((t) => t.id === 1);
assert.equal(t1.replies.length, 1);
assert.equal(t1.count, 2);
assert.equal(t1.threadNodeId, 'PRRT_1');

const counts = countReviewThreadsByPath(comments);
assert.equal(counts.get('a.js'), 1);
assert.equal(counts.get('b.js'), 1);

const replyReq = buildReplyReviewCommentRequest('o', 'r', 9, 1, 'hi');
assert.equal(replyReq.method, 'POST');
assert.ok(replyReq.url.endsWith('/pulls/9/comments/1/replies'));
assert.equal(replyReq.body.body, 'hi');

const resolveReq = buildResolveThreadGraphql('PRRT_1', true);
assert.equal(resolveReq.method, 'POST');
assert.equal(resolveReq.url, 'https://api.github.com/graphql');
assert.ok(resolveReq.body.query.includes('resolveReviewThread'));
assert.equal(resolveReq.body.variables.id, 'PRRT_1');

const unresolveReq = buildResolveThreadGraphql('PRRT_1', false);
assert.ok(unresolveReq.body.query.includes('unresolveReviewThread'));

const files = [
  { filename: 'src/a.js' },
  { filename: 'src/b.ts' },
  { filename: 'docs/README.md' },
];
assert.equal(filterFilesByQuery(files, 'src/').length, 2);
assert.equal(filterFilesByQuery(files, 'readme').length, 1);
assert.equal(filterFilesByQuery(files, '').length, 3);

let viewed = new Set();
viewed = toggleViewedPath(viewed, 'src/a.js');
assert.equal(isPathViewed(viewed, 'src/a.js'), true);
viewed = toggleViewedPath(viewed, 'src/a.js');
assert.equal(isPathViewed(viewed, 'src/a.js'), false);

// GraphQL → REST merge (real resolve path)
const gqlNodes = [
  {
    id: 'PRRT_thread1',
    isResolved: true,
    comments: { nodes: [{ databaseId: 1 }, { databaseId: 2 }] },
  },
  {
    id: 'PRRT_thread2',
    isResolved: false,
    comments: { nodes: [{ databaseId: 3 }] },
  },
];
const mappedThreads = mapGraphqlReviewThreads(gqlNodes);
assert.equal(mappedThreads.length, 2);
assert.deepEqual(mappedThreads[0].commentIds, [1, 2]);
assert.equal(mappedThreads[0].resolved, true);

const restComments = [
  { id: 1, path: 'a.js', body: 'root', threadNodeId: null, resolved: false },
  { id: 2, path: 'a.js', body: 'reply', inReplyToId: 1, threadNodeId: null, resolved: false },
  { id: 3, path: 'b.js', body: 'other', threadNodeId: null, resolved: false },
  { id: 99, path: 'c.js', body: 'orphan', threadNodeId: null, resolved: false },
];
const merged = mergeReviewThreadMeta(restComments, mappedThreads);
assert.equal(merged.find((c) => c.id === 1).threadNodeId, 'PRRT_thread1');
assert.equal(merged.find((c) => c.id === 1).resolved, true);
assert.equal(merged.find((c) => c.id === 2).threadNodeId, 'PRRT_thread1');
assert.equal(merged.find((c) => c.id === 3).threadNodeId, 'PRRT_thread2');
assert.equal(merged.find((c) => c.id === 3).resolved, false);
assert.equal(merged.find((c) => c.id === 99).threadNodeId, null);

const grouped = groupReviewThreads(merged);
const g1 = grouped.find((t) => t.id === 1);
assert.equal(g1.threadNodeId, 'PRRT_thread1');
assert.equal(g1.resolved, true);

console.log('review-threads.test.js: all assertions passed');
