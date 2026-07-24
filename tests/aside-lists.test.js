const assert = require('node:assert/strict');
const {
  takeCommitsForTimeline,
  takeVisibleTreeNodes,
} = require('../src/modal/lib/aside-lists.ts');
const {
  buildNestedFileTree,
  flattenVisibleTree,
} = require('../src/modal/lib/file-tree.ts');

// Commits timeline truncation
const commits = Array.from({ length: 20 }, (_, i) => ({
  sha: `sha${String(i).padStart(4, '0')}abcdef`,
  message: `Commit message ${i}\n\nbody line`,
  author: `dev${i}`,
  date: `2026-01-${String((i % 28) + 1).padStart(2, '0')}T00:00:00Z`,
}));

const tl = takeCommitsForTimeline(commits, 12);
assert.equal(tl.items.length, 12);
assert.equal(tl.total, 20);
assert.equal(tl.truncated, 8);
assert.equal(tl.items[0].shortSha.length, 7);
// Newest-first: last array element is shown first
assert.equal(tl.items[0].message, 'Commit message 19');
assert.equal(tl.items[1].message, 'Commit message 18');
assert.ok(!tl.items[0].message.includes('\n'));

const empty = takeCommitsForTimeline([], 12);
assert.equal(empty.items.length, 0);
assert.equal(empty.truncated, 0);

const longMsg = takeCommitsForTimeline(
  [{ sha: 'abc1234', message: 'x'.repeat(100) }],
  5
);
assert.ok(longMsg.items[0].message.endsWith('…'));
assert.ok(longMsg.items[0].message.length <= 72);

// Files nested tree + visible cap (uses real file-tree builders)
const files = [
  { filename: 'src/a.js', additions: 1, deletions: 0 },
  { filename: 'src/b.js', additions: 2, deletions: 1 },
  { filename: 'src/nested/c.js', additions: 3, deletions: 0 },
  { filename: 'docs/readme.md', additions: 1, deletions: 0 },
  { filename: 'package.json', additions: 0, deletions: 1 },
];
const tree = buildNestedFileTree(files);
assert.ok(tree.some((n) => n.type === 'dir' && n.name === 'src'));
assert.ok(tree.some((n) => n.type === 'file' && n.name === 'package.json'));

const expanded = new Set(['src', 'src/nested', 'docs']);
const visible = flattenVisibleTree(tree, expanded);
assert.ok(visible.length >= 5);

const capped = takeVisibleTreeNodes(visible, 3);
assert.equal(capped.nodes.length, 3);
assert.equal(capped.total, visible.length);
assert.equal(capped.truncated, visible.length - 3);

const all = takeVisibleTreeNodes(visible, 100);
assert.equal(all.truncated, 0);
assert.equal(all.nodes.length, visible.length);

console.log('aside-lists.test.js: all assertions passed');
