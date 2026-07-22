const assert = require('node:assert/strict');
const {
  extractDiffSnippet,
  snippetForComment,
  parsePatchLines,
} = require('../src/modal/lib/diff-snippet.ts');
const {
  flattenFilesToVirtualRows,
  groupComments,
} = require('../src/modal/lib/diff-rows.ts');
const { groupReviewThreads } = require('../src/modal/lib/review-threads.ts');

const patch = `@@ -1,4 +1,5 @@
 context1
-old
+new
 context2
+added2
 context3
`;

const lines = parsePatchLines(patch);
assert.ok(lines.some((l) => l.type === 'add' && l.newLine === 2));

const snip = extractDiffSnippet(patch, { line: 2, side: 'RIGHT' }, { context: 1 });
assert.ok(snip);
assert.ok(snip.lines.some((l) => l.highlight));
assert.ok(snip.lines.some((l) => l.text.includes('+new')));

const multi = extractDiffSnippet(patch, { line: 3, startLine: 2, side: 'RIGHT' });
assert.ok(multi.lines.filter((l) => l.highlight).length >= 1);

const files = [{ filename: 'src/a.js', patch }];
const forC = snippetForComment({ path: 'src/a.js', line: 2, side: 'RIGHT' }, files);
assert.ok(forC && forC.lines.length > 0);
assert.equal(snippetForComment({ path: 'missing.js', line: 1 }, files), null);

// Prefer comment.diffHunk when files[] has no patch (or wrong path)
const { snippetFromDiffHunk } = require('../src/modal/lib/diff-snippet.ts');
const hunk = `@@ -10,3 +10,4 @@
 keep
-old
+new
 keep2
`;
const fromHunk = snippetFromDiffHunk(hunk, { line: 11, side: 'RIGHT' });
assert.ok(fromHunk && fromHunk.lines.some((l) => l.highlight));
const viaComment = snippetForComment(
  { path: 'gone.js', line: 11, side: 'RIGHT', diffHunk: hunk },
  []
);
assert.ok(viaComment && viaComment.lines.length > 0, 'diffHunk preview without files[]');
// original_line fallback when line is null (outdated)
const outdatedSnip = snippetForComment(
  { path: 'gone.js', line: null, originalLine: 11, side: 'RIGHT', diffHunk: hunk },
  []
);
assert.ok(outdatedSnip && outdatedSnip.lines.length > 0, 'originalLine + diffHunk');

// Collapsed file header must not contain the word "collapsed"
const rows = flattenFilesToVirtualRows(
  [
    {
      filename: 'big.js',
      status: 'modified',
      additions: 1,
      deletions: 0,
      patch: '+x\n',
      defaultCollapsed: true,
    },
  ],
  'unified',
  { collapsedPaths: new Set(['big.js']) }
);
const header = rows.find((r) => r.kind === 'file-header');
assert.ok(header);
assert.equal(header.collapsed, true);
assert.ok(!/collapsed/i.test(header.text), `header text must not say collapsed: ${header.text}`);
// Fully closed — no following meta rows for this file
assert.equal(rows.filter((r) => r.filePath === 'big.js').length, 1);

// Root + reply: exactly one inline-comment row; reply nests via groupReviewThreads
const reviewComments = [
  {
    id: 10,
    author: 'alice',
    body: 'root note',
    path: 'a.js',
    line: 2,
    side: 'RIGHT',
  },
  {
    id: 11,
    author: 'bob',
    body: 'nested reply body',
    path: 'a.js',
    line: 2,
    side: 'RIGHT',
    inReplyToId: 10,
  },
];
const grouped = groupComments(reviewComments);
assert.equal(grouped.get('a.js:2').length, 1, 'only root in groupComments');
assert.equal(grouped.get('a.js:2')[0].id, 10);

const threadRows = flattenFilesToVirtualRows(
  [
    {
      filename: 'a.js',
      status: 'modified',
      additions: 1,
      deletions: 0,
      patch: '@@ -1,2 +1,3 @@\n keep\n+added\n keep2\n',
    },
  ],
  'unified',
  { reviewComments }
);
const inline = threadRows.filter((r) => r.kind === 'inline-comment');
assert.equal(inline.length, 1, 'exactly one inline-comment row for root+reply');
assert.equal(inline[0].commentId, 10);
assert.equal(inline[0].body, 'root note');
// Reply body must not appear as its own row
assert.ok(
  !inline.some((r) => /nested reply body/.test(r.body || r.text || '')),
  'reply must not duplicate as its own inline row'
);
const threads = groupReviewThreads(reviewComments);
assert.equal(threads.length, 1);
assert.equal(threads[0].replies.length, 1);
assert.equal(threads[0].replies[0].body, 'nested reply body');

console.log('diff-snippet.test.js: all assertions passed');
