const assert = require('node:assert/strict');
const {
  createEmptyPendingReview,
  addPendingComment,
  discardPendingReview,
  pendingReviewCount,
  pendingReviewCtaLabel,
  buildPendingReviewSubmitPayload,
  setPendingReviewBody,
} = require('../src/modal/lib/pending-review.ts');

let batch = createEmptyPendingReview();
assert.equal(pendingReviewCount(batch), 0);

let r = addPendingComment(batch, {
  path: 'a.js',
  line: 3,
  body: 'first',
  side: 'RIGHT',
});
assert.equal(r.added, true);
batch = r.batch;
assert.equal(pendingReviewCount(batch), 1);

r = addPendingComment(batch, {
  path: 'a.js',
  line: 8,
  startLine: 5,
  body: 'multi',
  side: 'RIGHT',
  startSide: 'RIGHT',
});
batch = r.batch;
assert.equal(pendingReviewCount(batch), 2);

// empty body rejected
r = addPendingComment(batch, { path: 'b.js', line: 1, body: '  ' });
assert.equal(r.added, false);
assert.equal(pendingReviewCount(r.batch), 2);

batch = setPendingReviewBody(batch, 'overall summary');
const payload = buildPendingReviewSubmitPayload(batch, {
  event: 'APPROVE',
  commitId: 'abc',
});
assert.equal(payload.event, 'APPROVE');
assert.equal(payload.body, 'overall summary');
assert.equal(payload.commit_id, 'abc');
assert.equal(payload.comments.length, 2);
assert.equal(payload.comments[0].path, 'a.js');
assert.equal(payload.comments[0].line, 3);
assert.equal(payload.comments[1].start_line, 5);
assert.equal(payload.comments[1].line, 8);

const commentOnly = buildPendingReviewSubmitPayload(batch, { event: 'COMMENT' });
assert.equal(commentOnly.event, 'COMMENT');

const bad = buildPendingReviewSubmitPayload(batch, { event: 'NOPE' });
assert.equal(bad, null);

assert.equal(pendingReviewCtaLabel(createEmptyPendingReview()), 'Start review');
assert.equal(pendingReviewCtaLabel(batch), 'Add comment');

batch = discardPendingReview();
assert.equal(pendingReviewCount(batch), 0);
assert.equal(pendingReviewCtaLabel(batch), 'Start review');

console.log('pending-review.test.js: all assertions passed');

