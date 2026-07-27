/**
 * Progressive detail merge — single app-detail shape, no empty wipe.
 */
const assert = require('node:assert/strict');
const {
  mergeDetailProgressive,
  samePrIdentity,
} = require('../src/modal/pure/detail-merge.js');

const base = { owner: 'o', repo: 'r', number: 9 };

// Sketch has reviewers; core network arrives with empty requestedReviewers
{
  const sketch = {
    ...base,
    title: 'T',
    requestedReviewers: ['alice', 'bob'],
    assignees: ['alice'],
    labels: [{ name: 'bug', color: 'f00' }],
    reviews: [],
    files: [],
    _sketch: true,
    _source: 'list',
  };
  const core = {
    ...base,
    title: 'T',
    body: 'hello',
    requestedReviewers: [],
    assignees: [],
    labels: [],
    reviews: [],
    files: [],
    _source: 'network',
  };
  const m = mergeDetailProgressive(sketch, core);
  assert.deepEqual(m.requestedReviewers, ['alice', 'bob'], 'keep sketch reviewers');
  assert.deepEqual(m.assignees, ['alice'], 'keep sketch assignees');
  assert.equal(m.labels[0].name, 'bug', 'keep sketch labels');
  assert.equal(m.body, 'hello', 'core body wins');
  assert.ok(!m._sketch, 'sketch flag cleared when network layer applied');
}

// Side reviews settle must not wipe meta
{
  const painted = {
    ...base,
    requestedReviewers: ['alice'],
    reviews: [],
    _source: 'network',
  };
  const reviewsLayer = {
    ...base,
    reviews: [{ id: 1, author: 'alice', state: 'APPROVED' }],
    _sideSettled: { reviews: true },
  };
  const m = mergeDetailProgressive(painted, reviewsLayer);
  assert.deepEqual(m.requestedReviewers, ['alice']);
  assert.equal(m.reviews.length, 1);
  assert.equal(m._sideSettled.reviews, true);
}

// Settled empty reviews is authoritative
{
  const painted = {
    ...base,
    reviews: [{ id: 1, author: 'x', state: 'COMMENTED' }],
  };
  const emptySettled = {
    ...base,
    reviews: [],
    _sideSettled: { reviews: true },
  };
  const m = mergeDetailProgressive(painted, emptySettled);
  assert.deepEqual(m.reviews, [], 'settled empty wins');
}

// Explicit trustMetaEmpty allows clearing reviewers (user removed all)
{
  const painted = {
    ...base,
    requestedReviewers: ['alice'],
    _source: 'network',
  };
  const cleared = {
    ...base,
    requestedReviewers: [],
    _source: 'network',
  };
  const m = mergeDetailProgressive(painted, cleared, { trustMetaEmpty: true });
  assert.deepEqual(m.requestedReviewers, []);
}

// Different PR identity → replace entirely
{
  const a = { ...base, title: 'A', requestedReviewers: ['a'] };
  const b = { owner: 'o', repo: 'r', number: 10, title: 'B', requestedReviewers: [] };
  const m = mergeDetailProgressive(a, b);
  assert.equal(m.number, 10);
  assert.deepEqual(m.requestedReviewers, []);
}

assert.ok(samePrIdentity(base, { ...base, title: 'x' }));
assert.ok(!samePrIdentity(base, { ...base, number: 10 }));

// Host loads pure merge helper
const fs = require('node:fs');
const path = require('node:path');
const host = fs.readFileSync(
  path.join(__dirname, '../src/pr-modal-host.js'),
  'utf8'
);
assert.ok(host.includes('mergeDetailProgressive'), 'host uses progressive merge');
assert.ok(host.includes('setDetailProgressive'), 'host setDetailProgressive');
const manifest = fs.readFileSync(
  path.join(__dirname, '../manifest.json'),
  'utf8'
);
assert.ok(manifest.includes('detail-merge.js'), 'manifest loads detail-merge.js');

console.log('detail-merge.test.js: all assertions passed');
console.log('detail-merge-progressive=true');
