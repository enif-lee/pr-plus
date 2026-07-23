/**
 * GitHub-like merge box: status copy, merge methods, no Re-request.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  buildMergeBoxStatus,
  mergeMethodButtonLabel,
  normalizeMergeMethod,
  MERGE_METHODS,
} = require('../src/modal/lib/merge-box-status.ts');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

// --- pure status presentation ---
{
  const clean = buildMergeBoxStatus({
    state: 'open',
    draft: false,
    merged: false,
    mergeable: true,
    mergeableState: 'clean',
    checks: { state: 'success', totalCount: 2 },
  });
  assert.equal(clean.kind, 'clean');
  assert.equal(clean.tone, 'ok');
  assert.ok(/no conflicts/i.test(clean.headline));
  assert.ok(clean.showMerge && clean.canMerge);
  assert.equal(clean.draftToggle, 'draft');
  assert.ok(clean.checksLine && /success/.test(clean.checksLine));
  // not a badge farm — single checks line
  assert.ok(!/Able to merge/i.test(clean.headline) || clean.headline.length < 80);
}

{
  const draft = buildMergeBoxStatus({ state: 'open', draft: true, merged: false });
  assert.equal(draft.kind, 'draft');
  assert.equal(draft.showMerge, false);
  assert.equal(draft.draftToggle, 'ready');
}

{
  const blocked = buildMergeBoxStatus({
    state: 'open',
    draft: false,
    merged: false,
    mergeable: false,
    checks: { state: 'failure' },
  });
  assert.equal(blocked.kind, 'blocked');
  assert.equal(blocked.canMerge, false);
  assert.equal(blocked.showMerge, true);
  assert.ok(blocked.showUpdateBranch);
}

{
  const merged = buildMergeBoxStatus({ merged: true, state: 'closed' });
  assert.equal(merged.kind, 'merged');
  assert.equal(merged.showMerge, false);
  assert.equal(merged.showUpdateBranch, false);
}

// --- merge methods ---
assert.equal(MERGE_METHODS.length, 3);
assert.deepEqual(
  MERGE_METHODS.map((m) => m.id).sort(),
  ['merge', 'rebase', 'squash']
);
assert.equal(normalizeMergeMethod('SQUASH'), 'squash');
assert.equal(normalizeMergeMethod('rebase'), 'rebase');
assert.equal(normalizeMergeMethod('other'), 'merge');
assert.ok(/Squash/i.test(mergeMethodButtonLabel('squash')));
assert.ok(/Rebase/i.test(mergeMethodButtonLabel('rebase')));
assert.ok(/Merge pull request/i.test(mergeMethodButtonLabel('merge')));

// --- ConversationView structure ---
const conv = read('src/modal/views/conversation/ConversationView.tsx');
assert.ok(conv.includes('buildMergeBoxStatus'), 'uses pure status helper');
assert.ok(conv.includes('prp-merge-box__headline'), 'headline markup');
assert.ok(conv.includes('prp-merge-box__helper'), 'helper markup');
assert.ok(conv.includes('prp-merge-method'), 'merge method control');
assert.ok(conv.includes('MERGE_METHODS'), 'all methods listed');
assert.ok(conv.includes("onMergePr?.(normalizeMergeMethod(mergeMethod))") || conv.includes('onMergePr?.('));
// Method ids live in merge-box-status; ConversationView iterates MERGE_METHODS
assert.ok(MERGE_METHODS.some((m) => m.id === 'squash'));
assert.ok(MERGE_METHODS.some((m) => m.id === 'rebase'));
assert.ok(MERGE_METHODS.some((m) => m.id === 'merge'));
assert.ok(conv.includes('Update branch'));
assert.ok(conv.includes('Ready for review') || conv.includes('Convert to draft'));
// No Re-request in merge box region
const mergeStart = conv.indexOf('prp-merge-box');
const mergeEnd = conv.indexOf('prp-card--composer', mergeStart);
const mergeSlice = conv.slice(mergeStart, mergeEnd > 0 ? mergeEnd : mergeStart + 5000);
assert.ok(!/Re-request/.test(mergeSlice), 'merge box has no Re-request');
// Old badge-stack primary should not drive the box
assert.ok(!mergeSlice.includes('prp-merge-box__badges'), 'no badge-stack container');
assert.ok(!mergeSlice.includes('Able to merge'), 'no Able to merge badge label');

// App still accepts method
const app = read('src/modal/app/PrModalApp.tsx');
assert.ok(app.includes('mergeMethod') || app.includes("method = 'merge'"));

// CSS hooks
const css = read('src/modal/styles.css');
assert.ok(css.includes('prp-merge-method__menu'));
assert.ok(css.includes('prp-merge-box__headline'));

// Bundle
const bundle = read('src/modal/dist/pr-modal.bundle.js');
assert.ok(
  bundle.includes('prp-merge-method') || bundle.includes('Squash and merge'),
  'bundle has merge method UI'
);

console.log('merge-box.test.js: all assertions passed');
console.log('status-pure=true');
console.log('methods-merge-squash-rebase=true');
console.log('no-rerequest=true');
console.log('no-badge-stack=true');
