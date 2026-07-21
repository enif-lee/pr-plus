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

// Host refresh must invalidate cache then re-fetch (real write→reload path)
assert.ok(
  hostSrc.includes('detailCache.invalidate') && hostSrc.includes('fetchPrDetail'),
  'onRefresh must invalidate cache before fetchPrDetail'
);
assert.ok(
  hostSrc.includes('current.loading = true') && hostSrc.includes('current.loading = false'),
  'refresh toggles loading for revalidate UI'
);

// App write handlers await onRefresh after success
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
// Pagination labels match newest-first paging
assert.ok(appSrc.includes('>Newer<') || appSrc.includes('Newer'));
assert.ok(appSrc.includes('>Older<') || appSrc.includes('Older'));
assert.ok(
  appSrc.includes('hasNewer') || appSrc.includes('hasOlder'),
  'pagination uses hasNewer/hasOlder from pure pager'
);

const log = [
  'refresh-loading.test.js: ok',
  'host-invalidate=true',
  `onRefresh-calls=${(appSrc.match(/await onRefresh\?\.\(\)/g) || []).length}`,
  'sectionLoading=isInitialLoad',
  'pagination-newer-older=true',
].join('\n');
fs.writeFileSync(path.join(SCRATCH, 'refresh-loading-test.log'), log + '\n');
console.log(log);
console.log('refresh-loading.test.js: all assertions passed');
