/**
 * GitHub-like merge box: status copy, CTA tone/enabled/force, merge methods.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  buildMergeBoxStatus,
  mergeMethodButtonLabel,
  normalizeMergeMethod,
  viewerMayForceMerge,
  MERGE_METHODS,
} = require('../src/modal/lib/merge-box-status.ts');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const SCRATCH =
  process.env.PRP_SCRATCH ||
  '/var/folders/sl/km7nh7qj50b9mw4901n7ch940000gn/T/grok-goal-d7c25991b988/implementer';

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
  assert.equal(clean.ctaVariant, 'ok');
  assert.equal(clean.forceMerge, false);
  assert.ok(/no conflicts/i.test(clean.headline));
  assert.ok(clean.showMerge && clean.canMerge);
  assert.equal(clean.draftToggle, 'draft');
  assert.ok(clean.checksLine && /success/.test(clean.checksLine));
  assert.ok(!/force/i.test(mergeMethodButtonLabel('merge', { force: clean.forceMerge })));
}

{
  const draft = buildMergeBoxStatus({ state: 'open', draft: true, merged: false });
  assert.equal(draft.kind, 'draft');
  assert.equal(draft.showMerge, false);
  assert.equal(draft.canMerge, false);
  assert.equal(draft.forceMerge, false);
  assert.equal(draft.draftToggle, 'ready');
}

{
  // Blocked / conflicts without force permission → not a green enabled CTA
  const blocked = buildMergeBoxStatus({
    state: 'open',
    draft: false,
    merged: false,
    mergeable: false,
    checks: { state: 'failure' },
  });
  assert.equal(blocked.kind, 'blocked');
  assert.equal(blocked.tone, 'danger');
  assert.equal(blocked.ctaVariant, 'danger');
  assert.equal(blocked.canMerge, false);
  assert.equal(blocked.forceMerge, false);
  assert.equal(blocked.showMerge, true);
  assert.ok(blocked.showUpdateBranch);
  assert.notEqual(blocked.ctaVariant, 'ok');
}

{
  // Policy blocked + force allowed → actionable with force wording
  const force = buildMergeBoxStatus({
    state: 'open',
    draft: false,
    merged: false,
    mergeable: false,
    mergeableState: 'blocked',
    checks: { state: 'failure' },
    viewerCanMergeAsAdmin: true,
  });
  assert.equal(force.kind, 'blocked');
  assert.equal(force.tone, 'danger');
  assert.equal(force.ctaVariant, 'danger');
  assert.equal(force.forceMerge, true);
  assert.equal(force.canMerge, true);
  assert.match(mergeMethodButtonLabel('merge', { force: force.forceMerge }), /force/i);
  assert.match(mergeMethodButtonLabel('squash', { force: true }), /force squash/i);
  assert.match(mergeMethodButtonLabel('rebase', { force: true }), /force rebase/i);
}

{
  // Pure conflicts (dirty) + admin flags must NOT enable force merge
  const dirtyAdmin = buildMergeBoxStatus({
    state: 'open',
    draft: false,
    merged: false,
    mergeable: false,
    mergeableState: 'dirty',
    viewerCanMergeAsAdmin: true,
    canForceMerge: true,
  });
  assert.equal(dirtyAdmin.kind, 'blocked');
  assert.equal(dirtyAdmin.ctaVariant, 'danger');
  assert.equal(dirtyAdmin.canMerge, false, 'conflicts cannot be force-merged');
  assert.equal(dirtyAdmin.forceMerge, false);
  assert.ok(/conflict/i.test(dirtyAdmin.headline));
  assert.ok(!/force/i.test(dirtyAdmin.helper));
  assert.ok(
    !/force/i.test(
      mergeMethodButtonLabel('merge', { force: dirtyAdmin.forceMerge })
    )
  );
}

{
  // Unstable / warn — caution CTA, still mergeable, no force wording
  const unstable = buildMergeBoxStatus({
    state: 'open',
    draft: false,
    merged: false,
    mergeable: true,
    mergeableState: 'unstable',
    checks: { state: 'failure', totalCount: 3 },
  });
  assert.equal(unstable.kind, 'unstable');
  assert.equal(unstable.tone, 'warn');
  assert.equal(unstable.ctaVariant, 'warn');
  assert.equal(unstable.canMerge, true);
  assert.equal(unstable.forceMerge, false);
  assert.ok(!/force/i.test(mergeMethodButtonLabel('merge', { force: unstable.forceMerge })));
}

{
  // mergeable null (computing) — not green success
  const pending = buildMergeBoxStatus({
    state: 'open',
    draft: false,
    merged: false,
    mergeable: null,
    mergeableState: 'unknown',
  });
  assert.equal(pending.kind, 'unknown');
  assert.equal(pending.canMerge, false);
  assert.notEqual(pending.ctaVariant, 'ok');
  assert.equal(pending.forceMerge, false);
}

{
  const merged = buildMergeBoxStatus({ merged: true, state: 'closed' });
  assert.equal(merged.kind, 'merged');
  assert.equal(merged.showMerge, false);
  assert.equal(merged.canMerge, false);
  assert.equal(merged.showUpdateBranch, false);
}

// Force permission helper defaults false
assert.equal(viewerMayForceMerge({}), false);
assert.equal(viewerMayForceMerge({ viewerCanMergeAsAdmin: true }), true);
assert.equal(viewerMayForceMerge({ canForceMerge: true }), true);
assert.equal(viewerMayForceMerge({ viewerPermission: 'admin' }), true);

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

// --- ConversationView structure binds CTA fields ---
const conv = read('src/modal/views/conversation/ConversationView.tsx');
assert.ok(conv.includes('buildMergeBoxStatus'), 'uses pure status helper');
assert.ok(conv.includes('prp-merge-box__headline'), 'headline markup');
assert.ok(conv.includes('prp-merge-box__helper'), 'helper markup');
assert.ok(conv.includes('MergeBoxChecks'), 'GitHub-style checks in merge box');
assert.ok(conv.includes('prp-merge-method'), 'merge method control');
assert.ok(conv.includes('MERGE_METHODS'), 'all methods listed');
assert.ok(conv.includes('ctaVariant') || conv.includes('ms.ctaVariant'), 'binds ctaVariant');
assert.ok(conv.includes('forceMerge') || conv.includes('ms.forceMerge'), 'binds forceMerge');
assert.ok(
  conv.includes("mergeMethodButtonLabel(mergeMethod,") ||
    conv.includes('force: Boolean(ms.forceMerge)'),
  'merge label uses force flag'
);
assert.ok(
  !/variant=\"ok\"[\s\S]{0,80}mergeMethodButtonLabel/.test(conv) ||
    conv.includes('ms.ctaVariant'),
  'primary merge not hard-coded ok for all states'
);
assert.ok(conv.includes("onMergePr?.(normalizeMergeMethod(mergeMethod))") || conv.includes('onMergePr?.('));
assert.ok(MERGE_METHODS.some((m) => m.id === 'squash'));
assert.ok(MERGE_METHODS.some((m) => m.id === 'rebase'));
assert.ok(MERGE_METHODS.some((m) => m.id === 'merge'));
assert.ok(conv.includes('Update branch'));
assert.ok(conv.includes('Ready for review') || conv.includes('Convert to draft'));
const mergeStart = conv.indexOf('prp-merge-box');
const mergeEnd = conv.indexOf('prp-card--composer', mergeStart);
const mergeSlice = conv.slice(mergeStart, mergeEnd > 0 ? mergeEnd : mergeStart + 5000);
assert.ok(!/Re-request/.test(mergeSlice), 'merge box has no Re-request');
assert.ok(!mergeSlice.includes('prp-merge-box__badges'), 'no badge-stack container');
assert.ok(!mergeSlice.includes('Able to merge'), 'no Able to merge badge label');

// App still accepts method
const app = read('src/modal/app/PrModalApp.tsx');
assert.ok(app.includes('mergeMethod') || app.includes("method = 'merge'"));

// CSS hooks for tone-aware CTA
const css = read('src/modal/styles.css');
assert.ok(css.includes('prp-merge-method__menu'));
assert.ok(css.includes('prp-merge-box__headline'));
assert.ok(css.includes('--prp-merge-cta') || css.includes('prp-merge-method--danger'));
assert.ok(css.includes('prp-merge-method--warn'));
assert.ok(css.includes('prp-merge-checks__group'), 'merge checks group styles');
assert.ok(css.includes('prp-merge-checks__item'), 'merge checks item styles');

// MergeBoxChecks component present
const mbc = read('src/modal/views/conversation/MergeBoxChecks.tsx');
assert.ok(mbc.includes('buildMergeBoxCheckGroups'));
assert.ok(mbc.includes('failing') || mbc.includes('group-toggle'));

// Bundle (after build)
const bundlePath = path.join(root, 'src/modal/dist/pr-modal.bundle.js');
if (fs.existsSync(bundlePath)) {
  const bundle = read('src/modal/dist/pr-modal.bundle.js');
  assert.ok(
    bundle.includes('prp-merge-method') || bundle.includes('Squash and merge'),
    'bundle has merge method UI'
  );
  assert.ok(
    bundle.includes('Force merge') || bundle.includes('forceMerge') || bundle.includes('ctaVariant'),
    'bundle has force/cta merge fields'
  );
}

console.log('merge-box.test.js: all assertions passed');
console.log('status-pure=true');
console.log('cta-clean-ok=true');
console.log('cta-blocked-disabled=true');
console.log('cta-force-allowed=true');
console.log('cta-unstable-warn=true');
console.log('methods-merge-squash-rebase=true');
console.log('no-rerequest=true');
console.log('no-badge-stack=true');
console.log('SCRATCH_HINT=' + SCRATCH);
