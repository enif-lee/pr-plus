const assert = require('node:assert/strict');
const {
  buildConversationTimeline,
  pageTimelineItems,
} = require('../src/modal/lib/conversation-timeline.ts');
const { snippetForComment } = require('../src/modal/lib/diff-snippet.ts');
const { pendingReviewCtaLabel } = require('../src/modal/lib/pending-review.ts');

const patch = `@@ -10,3 +10,4 @@
 keep
-oldline
+newline
 keep2
`;

const detail = {
  viewerLogin: 'alice',
  files: [{ filename: 'x.js', patch }],
  reviews: [
    { id: 1, author: 'a', state: 'APPROVED', body: 'lgtm', submittedAt: '2026-01-02T00:00:00Z' },
    { id: 2, author: 'b', state: 'COMMENTED', body: '', submittedAt: '2026-01-01T00:00:00Z' },
  ],
  comments: [
    { id: 10, author: 'alice', body: 'issue note', createdAt: '2026-01-03T00:00:00Z' },
    { id: 11, author: 'bob', body: 'other', createdAt: '2026-01-03T01:00:00Z' },
  ],
  reviewComments: [
    {
      id: 20,
      author: 'alice',
      body: 'line note',
      path: 'x.js',
      line: 11,
      side: 'RIGHT',
      createdAt: '2026-01-04T00:00:00Z',
      resolved: false,
    },
    {
      id: 21,
      author: 'bob',
      body: 'reply body',
      path: 'x.js',
      line: 11,
      inReplyToId: 20,
      createdAt: '2026-01-05T00:00:00Z',
    },
  ],
};

const items = buildConversationTimeline(detail, { snippetForComment });
// Full thread entry (not root-only without replies)
const thread = items.find((i) => i.kind === 'review-thread');
assert.ok(thread, 'review-thread entry present');
assert.equal(thread.replies.length, 1);
assert.equal(thread.replies[0].body, 'reply body');
assert.ok(thread.snippet && thread.snippet.lines.length > 0, 'diff snippet attached');
assert.equal(thread.canDelete, true, 'own review root deletable');
assert.equal(thread.replies[0].canDelete, false, 'bob reply not deletable by alice');
// Own nested reply must expose canDelete so ConversationView can show edit/delete icons
const withOwnReply = buildConversationTimeline(
  {
    ...detail,
    reviewComments: [
      ...detail.reviewComments,
      {
        id: 22,
        author: 'alice',
        body: 'own nested reply',
        path: 'x.js',
        line: 11,
        inReplyToId: 20,
        createdAt: '2026-01-06T00:00:00Z',
      },
    ],
  },
  { snippetForComment }
);
const threadOwn = withOwnReply.find((i) => i.kind === 'review-thread');
const ownReply = threadOwn.replies.find((r) => r.id === 22);
assert.ok(ownReply, 'own nested reply present');
assert.equal(ownReply.canDelete, true, 'own nested reply deletable');
assert.equal(
  items.find((i) => i.kind === 'issue-comment' && i.author === 'alice').canDelete,
  true
);
assert.equal(
  items.find((i) => i.kind === 'issue-comment' && i.author === 'bob').canDelete,
  false
);
assert.ok(items.some((i) => i.kind === 'review' && i.author === 'a'));
// empty COMMENTED review skipped
assert.ok(!items.some((i) => i.author === 'b' && i.kind === 'review'));

// newest-first
const times = items.map((i) => i.at);
assert.deepEqual(times, [...times].sort().reverse());

// Multi-file threads under the same pull_request_review → review-group
{
  const multi = buildConversationTimeline(
    {
      viewerLogin: 'alice',
      files: [],
      reviews: [
        {
          id: 900,
          author: 'coderabbitai[bot]',
          state: 'COMMENTED',
          body: '## Walkthrough\nLooks good overall.',
          submittedAt: '2026-03-01T12:00:00Z',
          isBot: true,
        },
      ],
      comments: [],
      reviewComments: [
        {
          id: 101,
          author: 'coderabbitai[bot]',
          body: 'note a',
          path: 'a.ts',
          line: 10,
          reviewId: 900,
          threadNodeId: 'PRRT_a',
          createdAt: '2026-03-01T12:00:01Z',
          resolved: false,
        },
        {
          id: 102,
          author: 'coderabbitai[bot]',
          body: 'note b',
          path: 'b.ts',
          line: 20,
          reviewId: 900,
          threadNodeId: 'PRRT_b',
          createdAt: '2026-03-01T12:00:02Z',
          resolved: true,
        },
        {
          id: 103,
          author: 'coderabbitai[bot]',
          body: 'note c',
          path: 'c.ts',
          line: 5,
          reviewId: 900,
          threadNodeId: 'PRRT_c',
          createdAt: '2026-03-01T12:00:03Z',
          resolved: false,
        },
      ],
    },
    { snippetForComment }
  );
  const groups = multi.filter((i) => i.kind === 'review-group');
  assert.equal(groups.length, 1, 'one review-group for multi-file review');
  const g = groups[0];
  assert.equal(g.id, 900);
  assert.equal(g.threadCount, 3);
  assert.equal(g.resolvedCount, 1);
  assert.equal(g.threads.length, 3);
  // Sorted by path then line
  assert.deepEqual(
    g.threads.map((t) => t.path),
    ['a.ts', 'b.ts', 'c.ts']
  );
  assert.ok(g.isBot, 'bot flag from review');
  assert.ok(String(g.body).includes('Walkthrough'));
  // Standalone review event not duplicated for grouped review
  assert.ok(!multi.some((i) => i.kind === 'review' && i.id === 900));
  // No flat review-thread for those comments
  assert.ok(
    !multi.some(
      (i) =>
        i.kind === 'review-thread' && [101, 102, 103].includes(Number(i.id))
    )
  );
}

// Single COMMENTED thread without review body stays flat (not grouped)
{
  const flat = buildConversationTimeline(
    {
      viewerLogin: 'alice',
      files: [],
      reviews: [
        {
          id: 50,
          author: 'bob',
          state: 'COMMENTED',
          body: '',
          submittedAt: '2026-03-02T00:00:00Z',
        },
      ],
      comments: [],
      reviewComments: [
        {
          id: 51,
          author: 'bob',
          body: 'one liner',
          path: 'solo.ts',
          line: 1,
          reviewId: 50,
          createdAt: '2026-03-02T00:00:01Z',
        },
      ],
    },
    { snippetForComment }
  );
  assert.ok(
    flat.some((i) => i.kind === 'review-thread' && i.id === 51),
    'single empty-body COMMENTED review stays as review-thread'
  );
  assert.ok(!flat.some((i) => i.kind === 'review-group'));
}

// Single thread under a review with body → still group (GitHub-style card)
{
  const withBody = buildConversationTimeline(
    {
      viewerLogin: 'alice',
      files: [],
      reviews: [
        {
          id: 60,
          author: 'carol',
          state: 'COMMENTED',
          body: 'Please check this.',
          submittedAt: '2026-03-03T00:00:00Z',
        },
      ],
      comments: [],
      reviewComments: [
        {
          id: 61,
          author: 'carol',
          body: 'here',
          path: 'x.ts',
          line: 3,
          reviewId: 60,
          createdAt: '2026-03-03T00:00:01Z',
        },
      ],
    },
    { snippetForComment }
  );
  const g = withBody.find((i) => i.kind === 'review-group');
  assert.ok(g, 'review body causes grouping even for one thread');
  assert.equal(g.threadCount, 1);
  assert.equal(g.body, 'Please check this.');
}

// Pending review comments embed as review-group (not flat badge-only)
{
  const pendingTl = buildConversationTimeline(
    {
      viewerLogin: 'alice',
      files: [],
      reviews: [],
      viewerPendingReview: { id: 777, author: 'alice' },
      comments: [],
      reviewComments: [
        {
          id: 701,
          author: 'alice',
          body: 'pending note a',
          path: 'p1.ts',
          line: 1,
          pending: true,
          pendingReviewId: 777,
          reviewId: 777,
          createdAt: '2026-04-01T00:00:00Z',
        },
        {
          id: 702,
          author: 'alice',
          body: 'pending note b',
          path: 'p2.ts',
          line: 2,
          pending: true,
          pendingReviewId: 777,
          reviewId: 777,
          createdAt: '2026-04-01T00:00:01Z',
        },
      ],
    },
    { snippetForComment }
  );
  const pg = pendingTl.filter((i) => i.kind === 'review-group');
  assert.equal(pg.length, 1, 'pending threads share one review-group');
  assert.equal(pg[0].state, 'PENDING');
  assert.equal(pg[0].pending, true);
  assert.equal(pg[0].threadCount, 2);
  assert.ok(
    !pendingTl.some((i) => i.kind === 'review-thread' && [701, 702].includes(i.id)),
    'pending not left as flat review-threads'
  );
}

const many = Array.from({ length: 40 }, (_, i) => ({
  key: `k${i}`,
  kind: 'issue-comment',
  at: `2026-02-${String((i % 28) + 1).padStart(2, '0')}T00:00:00Z`,
  body: `b${i}`,
})).sort((a, b) => String(b.at).localeCompare(String(a.at)));

const page1 = pageTimelineItems(many, { page: 1, pageSize: 15 });
assert.equal(page1.items.length, 15);
assert.equal(page1.hasOlder, true);
assert.equal(page1.hasNewer, false);

// CTA labels
assert.equal(pendingReviewCtaLabel({ comments: [] }), 'Start review');
assert.equal(pendingReviewCtaLabel({ comments: [{ path: 'a' }] }), 'Add comment');
assert.ok(!/Start review \+/.test(pendingReviewCtaLabel({ comments: [] })));

console.log('conversation-timeline.test.js: all assertions passed');
