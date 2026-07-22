const assert = require('node:assert/strict');
const filter = require('../src/modal/lib/diff-commit-filter.ts');

const commits = [
  { sha: 'aaa1111aaaa', message: 'first\nbody' },
  { sha: 'bbb2222bbbb', message: 'second change' },
  { sha: 'ccc3333cccc', message: 'third' },
];

{
  assert.deepEqual(filter.normalizeDiffCommitFilter({ mode: 'single', sha: 'x' }), {
    mode: 'single',
    sha: 'x',
  });
  assert.deepEqual(filter.normalizeDiffCommitFilter({ mode: 'range', sha: 'a', endSha: 'b' }), {
    mode: 'range',
    sha: 'a',
    endSha: 'b',
  });
  assert.deepEqual(filter.normalizeDiffCommitFilter({ mode: 'nope' }), { mode: 'all' });
  assert.equal(filter.isAllCommitsFilter({ mode: 'all' }), true);
  assert.equal(filter.isAllCommitsFilter({ mode: 'single', sha: 'x' }), false);
  console.log('ok - normalize / isAll');
}

{
  assert.equal(filter.shortSha('abcdef0123'), 'abcdef0');
  assert.equal(filter.commitOptionLabel(commits[0]), 'aaa1111 · first');
  console.log('ok - labels');
}

{
  assert.equal(filter.resolveCompareRange(commits, 'base-sha', { mode: 'all' }), null);

  const singleFirst = filter.resolveCompareRange(commits, 'base-sha', {
    mode: 'single',
    sha: 'aaa1111aaaa',
  });
  assert.deepEqual(
    { base: singleFirst.base, head: singleFirst.head },
    { base: 'base-sha', head: 'aaa1111aaaa' }
  );

  const singleMid = filter.resolveCompareRange(commits, 'base-sha', {
    mode: 'single',
    sha: 'bbb2222bbbb',
  });
  assert.deepEqual(
    { base: singleMid.base, head: singleMid.head },
    { base: 'aaa1111aaaa', head: 'bbb2222bbbb' }
  );

  const range = filter.resolveCompareRange(commits, 'main', {
    mode: 'range',
    sha: 'aaa1111aaaa',
    endSha: 'ccc3333cccc',
  });
  assert.equal(range.base, 'main');
  assert.equal(range.head, 'ccc3333cccc');
  assert.match(range.label, /3 commits/);

  const swapped = filter.resolveCompareRange(commits, 'main', {
    mode: 'range',
    sha: 'ccc3333cccc',
    endSha: 'bbb2222bbbb',
  });
  assert.equal(swapped.base, 'aaa1111aaaa');
  assert.equal(swapped.head, 'ccc3333cccc');

  assert.equal(
    filter.resolveCompareRange(commits, 'main', { mode: 'single', sha: 'missing' }),
    null
  );
  console.log('ok - resolveCompareRange');
}

{
  const opts = filter.buildCommitFilterOptions(commits);
  assert.equal(opts.length, 3);
  assert.equal(opts[0].sha, 'ccc3333cccc'); // newest first
  assert.equal(opts[2].sha, 'aaa1111aaaa');
  assert.equal(
    filter.compareCacheKey('Acme', 'App', 'a', 'b'),
    'acme/app@a...b'
  );
  console.log('ok - options + cache key');
}

console.log('diff-commit-filter.test.js: all assertions passed');
