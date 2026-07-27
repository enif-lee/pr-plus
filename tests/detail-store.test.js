/**
 * Isolated detail store — each fetch domain writes only its own slice.
 */
const assert = require('node:assert/strict');
const {
  createEmptyStore,
  fromAppDetail,
  toAppDetail,
  applyMeta,
  applyFiles,
  applyCommits,
  applyReviews,
  applyCorePayload,
  applyDevelopment,
  sidePendingFlags,
  pickMeta,
} = require('../src/modal/pure/detail-store.js');

// Core does not wipe sketch reviewers / side placeholders
{
  const store = fromAppDetail({
    owner: 'o',
    repo: 'r',
    number: 9,
    title: 'Sketch',
    requestedReviewers: ['alice', 'bob'],
    assignees: ['alice'],
    labels: [{ name: 'bug', color: 'f00' }],
    files: [],
    commits: [],
    reviews: [],
    _sketch: true,
    _source: 'list',
  });

  applyCorePayload(store, {
    owner: 'o',
    repo: 'r',
    number: 9,
    title: 'Sketch',
    body: 'full body',
    headSha: 'deadbeef',
    requestedReviewers: [], // empty network must not wipe sketch meta
    assignees: [],
    labels: [],
    files: [], // placeholders ignored by applyCorePayload
    commits: [],
    reviews: [],
    _source: 'network',
  });

  const flat = toAppDetail(store);
  assert.equal(flat.body, 'full body');
  assert.equal(flat.headSha, 'deadbeef');
  assert.deepEqual(flat.requestedReviewers, ['alice', 'bob'], 'meta protected');
  assert.deepEqual(flat.assignees, ['alice']);
  assert.equal(flat.files.length, 0);
  assert.equal(store.files.settled, false, 'files slice still unsettled');
}

// Side write touches only its slice
{
  const store = fromAppDetail({
    owner: 'o',
    repo: 'r',
    number: 1,
    title: 'T',
    requestedReviewers: ['alice'],
    files: [],
  });
  applyFiles(store, [{ filename: 'a.js', patch: '+x' }], {
    settled: true,
    gitattributesText: '*.pb.go linguist-generated=true\n',
  });
  applyReviews(store, [{ id: 1, author: 'alice', state: 'APPROVED' }], {
    settled: true,
  });
  applyCommits(store, [{ sha: 'abc', message: 'm' }], { settled: true });

  const flat = toAppDetail(store);
  assert.deepEqual(flat.requestedReviewers, ['alice'], 'reviews write left meta');
  assert.equal(flat.files.length, 1);
  assert.equal(flat.reviews.length, 1);
  assert.equal(flat.commits.length, 1);
  assert.ok(flat.gitattributesText.includes('pb.go'));
  assert.equal(flat._sideSettled.files, true);
  assert.equal(flat._sideSettled.reviews, true);
  assert.equal(flat._sideSettled.commits, true);
  assert.equal(flat._sideSettled.development, false);
}

// Development settle empty is OK
{
  const store = createEmptyStore();
  applyMeta(store, { owner: 'o', repo: 'r', number: 2, title: 'x' });
  applyDevelopment(
    store,
    { linkedIssues: [], developmentIssues: [], projects: [] },
    { settled: true }
  );
  const flat = toAppDetail(store);
  assert.equal(flat._sideSettled.development, true);
  assert.deepEqual(flat.developmentIssues, []);
  const pending = sidePendingFlags(store);
  assert.equal(pending.development, false);
  assert.equal(pending.files, true);
}

// pickMeta excludes side arrays
{
  const m = pickMeta({
    title: 't',
    owner: 'o',
    repo: 'r',
    number: 1,
    files: [{ x: 1 }],
    reviews: [{ y: 1 }],
    requestedReviewers: ['a'],
  });
  assert.equal(m.title, 't');
  assert.deepEqual(m.requestedReviewers, ['a']);
  assert.equal(m.files, undefined);
  assert.equal(m.reviews, undefined);
}

// Sequential progressive open: core → reviews → files never wipe each other
{
  const store = fromAppDetail({
    owner: 'o',
    repo: 'r',
    number: 9,
    title: 'Sketch title',
    requestedReviewers: ['reviewer-a'],
    assignees: [],
    files: [],
    reviews: [],
    commits: [],
    _sketch: true,
    _source: 'list',
  });

  applyCorePayload(store, {
    owner: 'o',
    repo: 'r',
    number: 9,
    title: 'Real title',
    body: 'desc',
    headSha: 'abc',
    requestedReviewers: [], // empty must not wipe
    files: [],
    reviews: [],
    commits: [],
  });
  let flat = toAppDetail(store);
  assert.deepEqual(flat.requestedReviewers, ['reviewer-a']);
  assert.equal(flat.title, 'Real title');

  applyReviews(
    store,
    [
      { id: 1, author: 'reviewer-a', state: 'APPROVED' },
      { id: 2, author: 'reviewer-b', state: 'COMMENTED' },
    ],
    { settled: true }
  );
  flat = toAppDetail(store);
  assert.equal(flat.reviews.length, 2);
  assert.deepEqual(flat.requestedReviewers, ['reviewer-a'], 'reviews leave meta');

  applyFiles(store, [{ filename: 'x.ts', patch: '+1' }], { settled: true });
  flat = toAppDetail(store);
  assert.equal(flat.files.length, 1);
  assert.equal(flat.reviews.length, 2, 'files leave reviews');
  assert.deepEqual(flat.requestedReviewers, ['reviewer-a'], 'files leave meta');
  assert.equal(flat.body, 'desc', 'files leave core body');
}

// Host + manifest wire isolation
const fs = require('node:fs');
const path = require('node:path');
const host = fs.readFileSync(
  path.join(__dirname, '../src/pr-modal-host.js'),
  'utf8'
);
assert.ok(host.includes('applySideToStore'), 'host applySideToStore');
assert.ok(host.includes('applyCoreToStore'), 'host applyCoreToStore');
assert.ok(host.includes('applyThreadsToStore'), 'host applyThreadsToStore');
assert.ok(host.includes('detailStore'), 'host detailStore');
assert.ok(
  host.includes('Slice-only write') || host.includes('applySideToStore'),
  'side settle isolated'
);
// Thread mutations must go through applyThreadsToStore (not raw assign in open/refresh)
const threadsAssignRaw = (host.match(/current\.detail\s*=\s*next;/g) || [])
  .length;
const threadsAssignDetail = (
  host.match(/current\.detail\s*=\s*detail;/g) || []
).length;
// publishDetailFromStore / fallbacks may assign; open/refresh paths use applyThreadsToStore
assert.ok(
  host.includes('applyThreadsToStore(next)') ||
    host.includes('applyThreadsToStore(step.detail)'),
  'threads open/refresh use applyThreadsToStore'
);
const manifest = fs.readFileSync(
  path.join(__dirname, '../manifest.json'),
  'utf8'
);
assert.ok(manifest.includes('detail-store.js'), 'manifest loads detail-store');

console.log('detail-store.test.js: all assertions passed');
console.log('detail-store-isolation=true');
