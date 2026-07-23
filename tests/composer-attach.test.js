const assert = require('node:assert/strict');
const {
  buildAttachmentMarkdown,
  insertMarkdownAtCursor,
  guessContentType,
  mergeDetailPreserveOptimistic,
  stripPendingReviewFromDetail,
  removeReviewCommentFromDetail,
  removeIssueCommentFromDetail,
  buildAssetRepoPath,
} = require('../src/modal/lib/composer-attach.ts');

// Attachment markdown
assert.equal(
  buildAttachmentMarkdown('shot.png', 'https://cdn.example/a.png', { isImage: true }),
  '![shot.png](https://cdn.example/a.png)'
);
assert.equal(
  buildAttachmentMarkdown('notes.pdf', 'https://cdn.example/n.pdf', { isImage: false }),
  '[notes.pdf](https://cdn.example/n.pdf)'
);
assert.ok(buildAttachmentMarkdown('x.png', 'https://x/y.png').startsWith('!['));

// Cursor insert
const ins = insertMarkdownAtCursor('hello', 5, '![a](u)');
assert.equal(ins.text, 'hello\n![a](u)');
assert.ok(ins.cursor >= ins.text.length - 1);

const mid = insertMarkdownAtCursor('ab', 1, 'X');
assert.equal(mid.text, 'a\nX\nb');

// Content type
assert.equal(guessContentType('a.png'), 'image/png');
assert.equal(guessContentType('a.jpg'), 'image/jpeg');
assert.equal(guessContentType('a.bin'), 'application/octet-stream');
assert.equal(guessContentType('x', 'image/webp'), 'image/webp');

// Asset path
const p = buildAssetRepoPath('My Photo!.png');
assert.ok(p.startsWith('.pr-plus-assets/'));
assert.ok(p.includes('My_Photo_.png') || p.includes('Photo'));

// Optimistic merge: host refresh must NOT drop optimistic reply
const prev = {
  number: 1,
  comments: [{ id: 10, body: 'issue' }],
  reviewComments: [
    { id: 100, body: 'root', path: 'a.ts', line: 1 },
    { id: 'tmp-optimistic', body: 'reply flash', inReplyToId: 100 },
  ],
};
const next = {
  number: 1,
  comments: [{ id: 10, body: 'issue' }],
  reviewComments: [{ id: 100, body: 'root', path: 'a.ts', line: 1 }],
};
const merged = mergeDetailPreserveOptimistic(prev, next);
assert.ok(Array.isArray(merged.reviewComments));
assert.ok(
  merged.reviewComments.some((c) => String(c.id) === 'tmp-optimistic'),
  'optimistic reply must survive host rehydrate'
);
assert.ok(merged.reviewComments.some((c) => String(c.id) === '100'));

// Host wins on shared id but keeps threadNodeId from optimistic if missing
const prev2 = {
  reviewComments: [{ id: 5, body: 'old', threadNodeId: 'TH_1' }],
  comments: [],
};
const next2 = {
  reviewComments: [{ id: 5, body: 'new from host' }],
  comments: [],
};
const m2 = mergeDetailPreserveOptimistic(prev2, next2);
const row = m2.reviewComments.find((c) => String(c.id) === '5');
assert.equal(row.body, 'new from host');
assert.equal(row.threadNodeId, 'TH_1');

// Host-only comments kept
const m3 = mergeDetailPreserveOptimistic(
  { number: 1, owner: 'o', repo: 'r', reviewComments: [], comments: [{ id: 1, body: 'a' }] },
  { number: 1, owner: 'o', repo: 'r', reviewComments: [{ id: 9, body: 'r' }], comments: [{ id: 2, body: 'b' }] }
);
assert.equal(m3.comments.length, 2);
assert.equal(m3.reviewComments.length, 1);

// Different PR identity → take host wholesale (no cross-PR optimistic bleed)
const cross = mergeDetailPreserveOptimistic(
  { number: 1, owner: 'o', repo: 'r', assignees: ['alice'], _metaSeq: 3 },
  { number: 2, owner: 'o', repo: 'r', assignees: [], labels: [{ name: 'bug' }] }
);
assert.equal(cross.number, 2);
assert.deepEqual(cross.assignees, []);
assert.equal(cross.labels[0].name, 'bug');

// Local meta write must survive stale host rehydrate (non-empty stale labels)
const afterWrite = mergeDetailPreserveOptimistic(
  {
    number: 9,
    owner: 'o',
    repo: 'r',
    assignees: [],
    labels: [{ name: 'documentation' }],
    _metaSeq: 2,
  },
  {
    number: 9,
    owner: 'o',
    repo: 'r',
    assignees: ['stale-user'],
    labels: [{ name: 'bug' }, { name: 'wontfix' }],
    _metaSeq: 0,
  }
);
assert.deepEqual(afterWrite.assignees, []);
assert.equal(afterWrite.labels.length, 1);
assert.equal(afterWrite.labels[0].name, 'documentation');
assert.equal(afterWrite._metaSeq, 2);

// Once host matches local write, drop the meta lock
const synced = mergeDetailPreserveOptimistic(
  {
    number: 9,
    owner: 'o',
    repo: 'r',
    assignees: ['enif-lee'],
    labels: [{ name: 'documentation' }],
    _metaSeq: 2,
  },
  {
    number: 9,
    owner: 'o',
    repo: 'r',
    assignees: ['enif-lee'],
    labels: [{ name: 'documentation', color: '0075ca' }],
    _metaSeq: 0,
  }
);
assert.equal(synced.labels[0].color, '0075ca');
assert.equal(synced._metaSeq, 0);

// Intentional clear (empty arrays) held while host is still stale
const cleared = mergeDetailPreserveOptimistic(
  {
    number: 9,
    owner: 'o',
    repo: 'r',
    assignees: [],
    labels: [],
    _metaSeq: 1,
  },
  {
    number: 9,
    owner: 'o',
    repo: 'r',
    assignees: ['ghost'],
    labels: [{ name: 'bug' }],
  }
);
assert.deepEqual(cleared.assignees, []);
assert.deepEqual(cleared.labels, []);

// stripPendingReviewFromDetail removes pending rows + clears viewerPendingReview
const stripped = stripPendingReviewFromDetail({
  number: 1,
  owner: 'o',
  repo: 'r',
  viewerPendingReview: { id: 9, commentCount: 2 },
  reviewComments: [
    { id: 1, body: 'published', pending: false },
    { id: 2, body: 'pending reply', pending: true, inReplyToId: 1 },
    { id: 3, body: 'pending root', pending: true },
  ],
});
assert.equal(stripped.viewerPendingReview, null);
assert.equal(stripped.reviewComments.length, 1);
assert.equal(stripped.reviewComments[0].id, 1);

// After explicit discard strip (no viewerPendingReview on prev), host empty → drop zombies
const afterDiscard = mergeDetailPreserveOptimistic(
  {
    number: 1,
    owner: 'o',
    repo: 'r',
    viewerPendingReview: null,
    reviewComments: [
      { id: 1, body: 'root', pending: false },
      { id: 99, body: 'zombie pending', pending: true },
    ],
  },
  {
    number: 1,
    owner: 'o',
    repo: 'r',
    viewerPendingReview: null,
    reviewComments: [{ id: 1, body: 'root', pending: false }],
  }
);
assert.equal(afterDiscard.viewerPendingReview, null);
assert.equal(afterDiscard.reviewComments.length, 1);
assert.ok(!afterDiscard.reviewComments.some((c) => String(c.id) === '99'));

// strip() sets _dropPending so even if prev still has viewerPendingReview id
// (React setState race before strip commit), discard merge drops zombies
const stripRace = stripPendingReviewFromDetail({
  number: 1,
  owner: 'o',
  repo: 'r',
  viewerPendingReview: { id: 9 },
  reviewComments: [
    { id: 1, body: 'root', pending: false },
    { id: 50, body: 'pending', pending: true },
  ],
});
assert.equal(stripRace._dropPending, true);
assert.equal(stripRace.viewerPendingReview, null);
// Simulate race: merge from a prev that still held review id but also _dropPending
const stripRaceMerge = mergeDetailPreserveOptimistic(
  {
    number: 1,
    owner: 'o',
    repo: 'r',
    viewerPendingReview: { id: 9 },
    _dropPending: true,
    reviewComments: [
      { id: 1, body: 'root', pending: false },
      { id: 50, body: 'pending', pending: true },
    ],
  },
  {
    number: 1,
    owner: 'o',
    repo: 'r',
    viewerPendingReview: null,
    reviewComments: [{ id: 1, body: 'root', pending: false }],
  }
);
assert.equal(stripRaceMerge.viewerPendingReview, null);
assert.ok(
  !stripRaceMerge.reviewComments.some((c) => String(c.id) === '50'),
  '_dropPending must drop pending across discard race'
);

// Race: just posted (local still has viewerPendingReview) but host refresh is empty
const raceKeep = mergeDetailPreserveOptimistic(
  {
    number: 1,
    owner: 'o',
    repo: 'r',
    viewerPendingReview: { id: 9 },
    reviewComments: [
      { id: 1, body: 'root', pending: false },
      { id: 50, body: 'just posted', pending: true },
    ],
  },
  {
    number: 1,
    owner: 'o',
    repo: 'r',
    viewerPendingReview: null,
    reviewComments: [{ id: 1, body: 'root', pending: false }],
  }
);
assert.ok(
  raceKeep.reviewComments.some((c) => String(c.id) === '50'),
  'keep optimistic pending across racey empty refresh while local still holds pending review'
);
assert.equal(
  raceKeep.viewerPendingReview?.id,
  9,
  'keep local viewerPendingReview across race so Submit/Discard still work'
);

// Still-pending host keeps optimistic pending not yet in snapshot
const keepOptimisticPending = mergeDetailPreserveOptimistic(
  {
    number: 1,
    owner: 'o',
    repo: 'r',
    viewerPendingReview: { id: 9 },
    reviewComments: [
      { id: 1, body: 'root' },
      { id: 50, body: 'just posted pending', pending: true },
    ],
  },
  {
    number: 1,
    owner: 'o',
    repo: 'r',
    viewerPendingReview: { id: 9, commentCount: 1 },
    reviewComments: [{ id: 1, body: 'root' }],
  }
);
assert.ok(
  keepOptimisticPending.reviewComments.some((c) => String(c.id) === '50'),
  'optimistic pending kept while host still has pending review'
);

// removeReviewCommentFromDetail: cascade replies + tombstone + scrub threads
{
  const before = {
    number: 1,
    owner: 'o',
    repo: 'r',
    viewerPendingReview: { id: 9, commentCount: 1 },
    reviewComments: [
      { id: 10, body: 'root', pending: true, threadNodeId: 'PRRT_X' },
      { id: 11, body: 'reply', pending: true, inReplyToId: 10, threadNodeId: 'PRRT_X' },
      { id: 20, body: 'other', pending: false, threadNodeId: 'PRRT_Y' },
    ],
    reviewThreads: [
      { threadNodeId: 'PRRT_X', resolved: false, commentIds: [10, 11] },
      { threadNodeId: 'PRRT_Y', resolved: false, commentIds: [20] },
    ],
  };
  const removed = removeReviewCommentFromDetail(before, 10);
  assert.deepEqual(
    removed.reviewComments.map((c) => c.id),
    [20],
    'drops root + reply tree'
  );
  assert.equal(removed.viewerPendingReview, null, 'clears pending review when last pending gone');
  assert.ok(removed._deletedReviewCommentIds.has('10'));
  assert.ok(removed._deletedReviewCommentIds.has('11'));
  assert.ok(
    !removed.reviewThreads.some((t) => t.threadNodeId === 'PRRT_X'),
    'empty thread dropped from revalidate targets'
  );
  assert.ok(removed.reviewThreads.some((t) => t.threadNodeId === 'PRRT_Y'));

  // Stale host still listing deleted id must not resurrect after merge
  const resurrect = mergeDetailPreserveOptimistic(removed, {
    number: 1,
    owner: 'o',
    repo: 'r',
    reviewComments: [
      { id: 10, body: 'stale root', pending: true },
      { id: 20, body: 'other', pending: false },
    ],
    reviewThreads: [
      { threadNodeId: 'PRRT_X', resolved: false, commentIds: [10, 11] },
    ],
  });
  assert.ok(
    !resurrect.reviewComments.some((c) => String(c.id) === '10'),
    'tombstone blocks host resurrection'
  );
  assert.ok(resurrect.reviewComments.some((c) => String(c.id) === '20'));
}

// removeIssueCommentFromDetail tombstone
{
  const before = {
    number: 2,
    owner: 'o',
    repo: 'r',
    comments: [
      { id: 1, body: 'keep' },
      { id: 2, body: 'bye' },
    ],
  };
  const removed = removeIssueCommentFromDetail(before, 2);
  assert.deepEqual(
    removed.comments.map((c) => c.id),
    [1]
  );
  const m = mergeDetailPreserveOptimistic(removed, {
    number: 2,
    owner: 'o',
    repo: 'r',
    comments: [
      { id: 1, body: 'keep' },
      { id: 2, body: 'stale' },
    ],
  });
  assert.ok(!m.comments.some((c) => String(c.id) === '2'));
}

console.log('composer-attach.test.js: all assertions passed');
