/**
 * Diff comment navigator: thread roots only (replies excluded).
 */
const assert = require('node:assert/strict');
const {
  filterThreadRootComments,
  sortThreadRootComments,
  mapCommentsToRowIndices,
  resolveCommentNav,
  nextCommentIndex,
  filterReviewRootsForNav,
  filterReviewCommentsForNav,
  buildPathOrderMap,
  sortMappedCommentsByDiffOrder,
} = require('../src/modal/lib/comment-nav.ts');

const comments = [
  { id: 1, path: 'a.js', line: 3, body: 'root A' },
  { id: 2, path: 'a.js', line: 3, body: 'reply to A', inReplyToId: 1 },
  { id: 3, path: 'b.js', line: 1, body: 'root B' },
  { id: 4, path: 'a.js', line: 10, body: 'root C' },
  { id: 5, path: 'b.js', line: 1, body: 'reply to B', in_reply_to_id: 3 },
];

const roots = filterThreadRootComments(comments);
assert.equal(roots.length, 3);
assert.deepEqual(
  roots.map((c) => c.id).sort((a, b) => a - b),
  [1, 3, 4]
);

const sorted = sortThreadRootComments(comments);
assert.deepEqual(
  sorted.map((c) => c.id),
  [1, 4, 3], // a.js:3, a.js:10, b.js:1 (alpha path fallback)
);

// File list order (Diff top → bottom), not alphabetical path
const fileOrder = buildPathOrderMap([
  { filename: 'z/last.js' },
  { filename: 'a.js' },
  { filename: 'b.js' },
]);
const orderedByFiles = sortThreadRootComments(
  [
    { id: 10, path: 'a.js', line: 1 },
    { id: 11, path: 'z/last.js', line: 5 },
    { id: 12, path: 'b.js', line: 2 },
  ],
  fileOrder
);
assert.deepEqual(
  orderedByFiles.map((c) => c.id),
  [11, 10, 12],
  'nav follows Diff file list order top → bottom'
);

const virtualRows = [
  { kind: 'diff-line', filePath: 'a.js', newLine: 3, rowIndex: 10 },
  { kind: 'inline-comment', filePath: 'a.js', newLine: 3, commentId: 1, rowIndex: 11 },
  { kind: 'diff-line', filePath: 'a.js', newLine: 10, rowIndex: 20 },
  { kind: 'inline-comment', filePath: 'a.js', newLine: 10, commentId: 4, rowIndex: 21 },
  { kind: 'diff-line', filePath: 'b.js', newLine: 1, rowIndex: 30 },
  { kind: 'inline-comment', filePath: 'b.js', newLine: 1, commentId: 3, rowIndex: 31 },
];

const mapped = mapCommentsToRowIndices(sorted, virtualRows);
assert.equal(mapped.length, 3);
assert.equal(mapped[0].id, 1);
assert.equal(mapped[0].rowIndex, 11);
assert.equal(mapped[1].id, 4);
assert.equal(mapped[1].rowIndex, 21);
assert.equal(mapped[2].id, 3);
assert.equal(mapped[2].rowIndex, 31);

// Visual order: lower rowIndex first even if path order differs
const visual = sortMappedCommentsByDiffOrder([
  { id: 'late', path: 'a.js', line: 1, rowIndex: 50 },
  { id: 'early', path: 'z.js', line: 9, rowIndex: 5 },
]);
assert.deepEqual(
  visual.map((c) => c.id),
  ['early', 'late'],
  'rowIndex top → bottom wins over path alpha'
);

// Nav wraps across threads only
let st = resolveCommentNav(mapped, -1, 1);
assert.equal(st.commentIndex, 0);
assert.equal(st.active.id, 1);
st = resolveCommentNav(mapped, 0, 1);
assert.equal(st.active.id, 4);
st = resolveCommentNav(mapped, 2, 1);
assert.equal(st.active.id, 1); // wrap
assert.equal(nextCommentIndex(1, 3, -1), 0);

// LEFT-side comments map via oldLine; file-header fallback when line missing
const leftMapped = mapCommentsToRowIndices(
  [{ id: 9, path: 'left.js', line: 5, side: 'LEFT' }],
  [
    { kind: 'file-header', filePath: 'left.js', rowIndex: 1 },
    { kind: 'diff-line', filePath: 'left.js', oldLine: 5, newLine: null, rowIndex: 2 },
  ]
);
assert.equal(leftMapped[0].rowIndex, 2, 'LEFT side uses oldLine');

const collapsedMapped = mapCommentsToRowIndices(
  [{ id: 8, path: 'big.js', line: 99, side: 'RIGHT' }],
  [{ kind: 'file-header', filePath: 'big.js', rowIndex: 7, collapsed: true }]
);
assert.equal(
  collapsedMapped[0].rowIndex,
  7,
  'collapsed file still gets file-header jump target'
);

// Nav still advances when shouldJump is false
const noJump = resolveCommentNav(
  [{ id: 1, path: 'x', line: 1, rowIndex: undefined }],
  -1,
  1
);
assert.equal(noJump.commentIndex, 0);
assert.equal(noJump.shouldJump, false);

// App wiring
const fs = require('node:fs');
const path = require('node:path');
const app = fs.readFileSync(
  path.join(__dirname, '../src/modal/app/PrModalApp.tsx'),
  'utf8'
);
assert.ok(app.includes('sortThreadRootComments'), 'App uses thread-root sort');
assert.ok(
  !/sortInlineComments\s*\(\s*detail\?\.reviewComments/.test(app),
  'App no longer navigates all comments including replies'
);
assert.ok(app.includes("case 'openSearch'"), 'App wires openSearch');

// Resolution + path filters for Diff review nav
{
  const mixed = [
    { id: 1, path: 'a.js', line: 1, resolved: false, body: 'open' },
    { id: 2, path: 'a.js', line: 2, resolved: true, body: 'done' },
    { id: 3, path: 'b.js', line: 1, resolved: false, body: 'other' },
    { id: 4, path: 'a.js', line: 1, resolved: false, body: 'reply', inReplyToId: 1 },
  ];
  const openRoots = filterReviewRootsForNav(mixed, 'unresolved', null);
  assert.deepEqual(
    openRoots.map((c) => c.id).sort((a, b) => a - b),
    [1, 3]
  );
  const doneRoots = filterReviewRootsForNav(mixed, 'resolved', null);
  assert.deepEqual(
    doneRoots.map((c) => c.id),
    [2]
  );
  const pathOnly = filterReviewRootsForNav(mixed, null, new Set(['a.js']));
  assert.deepEqual(
    pathOnly.map((c) => c.id).sort((a, b) => a - b),
    [1, 2]
  );
  const unresOnA = filterReviewRootsForNav(mixed, 'unresolved', new Set(['a.js']));
  assert.deepEqual(
    unresOnA.map((c) => c.id),
    [1]
  );
  const withReplies = filterReviewCommentsForNav(mixed, 'unresolved', new Set(['a.js']));
  assert.deepEqual(
    withReplies.map((c) => c.id).sort((a, b) => a - b),
    [1, 4],
    'keeps replies under allowed roots'
  );

  // Pending filter: pending roots only; unresolved excludes pending drafts
  const withPending = [
    { id: 10, path: 'a.js', line: 1, resolved: false, pending: true, body: 'draft' },
    { id: 11, path: 'a.js', line: 2, resolved: false, pending: false, body: 'open' },
    { id: 12, path: 'b.js', line: 1, resolved: true, body: 'done' },
    {
      id: 13,
      path: 'a.js',
      line: 1,
      resolved: false,
      pending: true,
      body: 'draft reply',
      inReplyToId: 10,
    },
  ];
  assert.deepEqual(
    filterReviewRootsForNav(withPending, 'pending', null).map((c) => c.id),
    [10],
    'pending mode keeps pending roots'
  );
  assert.deepEqual(
    filterReviewRootsForNav(withPending, 'unresolved', null).map((c) => c.id),
    [11],
    'unresolved excludes pending drafts'
  );
  assert.deepEqual(
    filterReviewCommentsForNav(withPending, 'pending', null)
      .map((c) => c.id)
      .sort((a, b) => a - b),
    [10, 13],
    'pending mode keeps replies under pending roots'
  );
}

const policy = require('../src/modal/lib/shortcut-policy.ts');
assert.equal(
  policy.resolveModalShortcutAction({ mod: true, shift: false, key: 'f' }),
  'openSearch'
);
assert.equal(
  policy.resolveModalShortcutAction({ mod: true, shift: true, key: 'f' }),
  'toggleFullscreen'
);

console.log('comment-nav.test.js: all assertions passed');
