const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SCRATCH =
  process.env.PRP_SCRATCH || '/var/folders/px/qw6l220x5glb_gxf44lws9p80000gn/T/grok-goal-5a6d37e1751e/implementer';
fs.mkdirSync(SCRATCH, { recursive: true });

const hostSrc = fs.readFileSync(
  path.join(__dirname, '../src/pr-modal-host.js'),
  'utf8'
);
const appSrc = [
  fs.readFileSync(path.join(__dirname, '../src/modal/app/PrModalApp.tsx'), 'utf8'),
  fs.readFileSync(path.join(__dirname, '../src/modal/views/conversation/ConversationView.tsx'), 'utf8'),
].join('\n');

// Host soft-refresh revalidates via fetchPrDetail and writes detailCache.set
// (SWR: keep prior threads until thread phase; no hard invalidate wipe)
assert.ok(
  hostSrc.includes('onRefresh:') &&
    hostSrc.includes('fetchPrDetail') &&
    hostSrc.includes('detailCache.set'),
  'onRefresh must re-fetch PR detail and update detailCache'
);
// Soft refresh must NOT flip loading=true mid-flight (that clobbered optimistic
// assignees/labels). openModal still sets loading for the initial open path.
assert.ok(
  hostSrc.includes('current.loading = false'),
  'refresh/open clears loading when fetch settles'
);
assert.ok(
  hostSrc.includes('onPatchDetail'),
  'host exposes onPatchDetail so meta writes update cache without full reload'
);
assert.ok(
  hostSrc.includes('detailFetchGen'),
  'host uses detailFetchGen to drop out-of-order soft-refresh responses'
);
assert.ok(
  !/onRefresh:\s*async\s*\(\)\s*=>\s*\{[\s\S]*?current\.loading\s*=\s*true/.test(hostSrc),
  'onRefresh must not set loading=true (avoids stale detail re-render races)'
);

// App write handlers await onRefresh after success (conversation writes)
const writeSites = [
  'onLeaveReviewAction',
  'onSaveBody',
  'onSubmitSelectionCommentImmediate',
  'onReplyToThread',
  'onResolveThread',
  'onClosePr',
  'onReopenPr',
  'onApplySuggestion',
];
for (const name of writeSites) {
  assert.ok(appSrc.includes(name), `handler ${name} exists`);
}
assert.ok(
  (appSrc.match(/await onRefresh\?\.\(\)/g) || []).length >= 5,
  'multiple write paths must await onRefresh'
);
// Meta writes (labels/assignees/reviewers/milestone) patch local+host only —
// no full PR detail re-fetch after a successful write API.
assert.ok(appSrc.includes('commitMetaPatch'), 'meta writes patch local+host detail');
assert.ok(
  !appSrc.includes('scheduleMetaRefresh'),
  'meta writes must not schedule full soft-refresh'
);

function extractFn(src, name) {
  const m = src.match(
    new RegExp(
      `(?:async\\s+)?function\\s+${name}\\b[\\s\\S]*?(?=\\n  (?:async\\s+)?function\\s+|\\n  const\\s+[a-zA-Z]+\\s*=)`,
      'm'
    )
  );
  return m ? m[0] : '';
}
for (const name of [
  'applyAddReviewer',
  'onRemoveReviewer',
  'applyAddAssignees',
  'onRemoveAssignee',
  'applySetLabels',
  'applyMilestoneNumber',
  'applyRerequestReviewers',
]) {
  const body = extractFn(appSrc, name);
  assert.ok(body, `handler ${name} exists`);
  assert.ok(body.includes('commitMetaPatch'), `${name} commits local meta patch`);
  assert.ok(!/await\s+onRefresh\s*\?/.test(body), `${name} must not full-refresh after success`);
}

// Per-region skeleton markers — must be wired to real loading flags
assert.ok(appSrc.includes('prp-section-skeleton') || appSrc.includes('LoadingSkeleton'));
assert.ok(appSrc.includes('isInitialLoad'), 'isInitialLoad flag for section skeletons');
assert.ok(
  appSrc.includes('sectionLoading={isInitialLoad}') ||
    appSrc.includes('sectionLoading={isInitialLoad }'),
  'ConversationView/Header must receive sectionLoading={isInitialLoad}'
);
assert.ok(
  appSrc.includes('loading && !detail') || appSrc.includes('Boolean(loading && !detail)'),
  'isInitialLoad derived from loading && !detail'
);
// Conversation uses virtual list + dual-window gap (Load more / Load all),
// not client-side Newer/Older page buttons.
assert.ok(
  appSrc.includes('Load more') || appSrc.includes('Load more…'),
  'dual-window gap exposes Load more'
);
assert.ok(appSrc.includes('Load all'), 'dual-window gap exposes Load all');
assert.ok(
  appSrc.includes('onLoadMoreReviewThreads') ||
    appSrc.includes('VirtualConversationList'),
  'conversation wires virtual list / thread window loader'
);

const log = [
  'refresh-loading.test.js: ok',
  'host-revalidate=true',
  `onRefresh-calls=${(appSrc.match(/await onRefresh\?\.\(\)/g) || []).length}`,
  'sectionLoading=isInitialLoad',
  'pagination-load-more-all=true',
].join('\n');
fs.writeFileSync(path.join(SCRATCH, 'refresh-loading-test.log'), log + '\n');
console.log(log);
console.log('refresh-loading.test.js: all assertions passed');
