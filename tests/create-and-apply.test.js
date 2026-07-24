/**
 * Pure helpers: Create-and-apply, tags∩commits, aside search/full-load.
 */
const assert = require('node:assert/strict');
const api = require('../src/modal/lib/create-and-apply.ts');

const {
  shouldOfferCreateAndApply,
  resolveCreateAndApplyConfirmLabel,
  mergeCreateAndApplyLabelIds,
  tagsIntersectingCommits,
  filterCommitsByQuery,
  filterFilesByQuery,
  needsFullCorpusLoad,
} = api;

assert.equal(shouldOfferCreateAndApply(0, 'new-label'), true);
assert.equal(shouldOfferCreateAndApply(0, '  '), false);
assert.equal(shouldOfferCreateAndApply(2, 'new-label'), false);
assert.equal(
  resolveCreateAndApplyConfirmLabel(0, 'x', 'Apply labels'),
  'Create and apply'
);
assert.equal(
  resolveCreateAndApplyConfirmLabel(1, 'x', 'Apply labels'),
  'Apply labels'
);

assert.deepEqual(mergeCreateAndApplyLabelIds(['a'], 'b', true), ['a', 'b']);
assert.deepEqual(mergeCreateAndApplyLabelIds(['a'], 'a', true), ['a']);
assert.deepEqual(mergeCreateAndApplyLabelIds(['a'], 'b', false), ['a']);

const tags = [
  { name: 'v1', sha: 'aaa1111bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' },
  { name: 'v2', sha: 'ccc3333ddddddddddddddddddddddddddddddd' },
  { name: 'orphan', sha: 'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz' },
];
const commits = [
  { sha: 'aaa1111bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', message: 'first' },
  { sha: 'ccc3333ddddddddddddddddddddddddddddddd', message: 'second' },
];
const hit = tagsIntersectingCommits(tags, commits);
assert.equal(hit.length, 2);
assert.equal(hit[0].name, 'v1');
assert.equal(hit[1].name, 'v2');
// prefix match
assert.equal(
  tagsIntersectingCommits([{ name: 'short', sha: 'aaa1111' }], commits).length,
  1
);

const fc = filterCommitsByQuery(
  [
    { sha: 'abc', message: 'Fix login', author: 'alice' },
    { sha: 'def', message: 'Docs', author: 'bob' },
  ],
  'login'
);
assert.equal(fc.length, 1);
assert.equal(fc[0].author, 'alice');

const ff = filterFilesByQuery(
  [{ filename: 'src/foo.ts' }, { filename: 'README.md' }],
  'readme'
);
assert.equal(ff.length, 1);

assert.equal(needsFullCorpusLoad({ query: 'x', fullyLoaded: false }), true);
assert.equal(needsFullCorpusLoad({ loadMore: true, fullyLoaded: false }), true);
assert.equal(needsFullCorpusLoad({ query: 'x', fullyLoaded: true }), false);
assert.equal(needsFullCorpusLoad({}), false);

console.log('create-and-apply.test.js: all assertions passed');
