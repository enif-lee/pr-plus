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
