/**
 * files / comments / reviews / commits / checks / development are independent
 * fetches — not blocking fetchPrDetail core.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const fetchSrc = fs.readFileSync(
  path.join(__dirname, '../src/fetch-pulls.js'),
  'utf8'
);
const host = fs.readFileSync(
  path.join(__dirname, '../src/pr-modal-host.js'),
  'utf8'
);
const bridge = fs.readFileSync(
  path.join(__dirname, '../src/content-bridge.js'),
  'utf8'
);
const bg = fs.readFileSync(path.join(__dirname, '../src/background.js'), 'utf8');

// Extracted API functions exist
for (const name of [
  'fetchPrCommits',
  'fetchPrChecks',
  'fetchPrDevelopment',
  'fetchPrFiles',
  'fetchPrIssueComments',
  'fetchPrReviews',
]) {
  assert.ok(fetchSrc.includes(`async function ${name}`), name);
  assert.ok(fetchSrc.includes(`${name},`) || fetchSrc.includes(`${name}\n`), `export ${name}`);
}

// Core fetchPrDetail no longer awaits deferred panels
const detailFn = fetchSrc.slice(
  fetchSrc.indexOf('async function fetchPrDetail('),
  fetchSrc.indexOf('async function postIssueComment(')
);
assert.ok(
  detailFn.includes('files/comments/reviews/commits/checks/development: deferred') ||
    detailFn.includes('deferred (independent fetches)'),
  'detail logs deferred side panels'
);
assert.ok(
  detailFn.includes("PARALLEL_REST_KEYS = ['pull', 'viewerLogin', 'autolinks']") ||
    (detailFn.includes("'pull'") &&
      detailFn.includes("'viewerLogin'") &&
      detailFn.includes("'autolinks'") &&
      !detailFn.includes("'files'") &&
      !detailFn.includes("'issueComments'") &&
      !detailFn.includes("'reviews'")),
  'core parallel keys are lean (no files/comments/reviews)'
);

// Bridge + SW messages
for (const t of [
  'PR_TREE_FETCH_PR_COMMITS',
  'PR_TREE_FETCH_PR_CHECKS',
  'PR_TREE_FETCH_PR_DEVELOPMENT',
  'PR_TREE_FETCH_PR_FILES',
  'PR_TREE_FETCH_PR_ISSUE_COMMENTS',
  'PR_TREE_FETCH_PR_REVIEWS',
]) {
  assert.ok(bridge.includes(t) || bridge.includes(t.replace('PR_TREE_', '')), `bridge ${t}`);
  assert.ok(bg.includes(t), `background ${t}`);
}
assert.ok(bridge.includes('async fetchPrCommits'));
assert.ok(bridge.includes('async fetchPrChecks'));
assert.ok(bridge.includes('async fetchPrDevelopment'));
assert.ok(bridge.includes('async fetchPrFiles'));
assert.ok(bridge.includes('async fetchPrIssueComments'));
assert.ok(bridge.includes('async fetchPrReviews'));

// Host kicks independent side fetches and patches detail on resolve
assert.ok(
  host.includes('function kickIndependentSideFetches'),
  'host kickIndependentSideFetches'
);
for (const fn of [
  'fetchPrCommits',
  'fetchPrChecks',
  'fetchPrDevelopment',
  'fetchPrFiles',
  'fetchPrIssueComments',
  'fetchPrReviews',
]) {
  assert.ok(host.includes(fn), `host calls ${fn}`);
}

// Skeleton gating: pending only when panel not settled
assert.ok(host.includes('function sideSettledFromDetail'), 'sideSettledFromDetail');
assert.ok(host.includes('function setSideFlag'), 'setSideFlag');
assert.ok(host.includes('sidePending'), 'exposes sidePending');
assert.ok(host.includes('_sideSettled'), 'persists _sideSettled on detail');
assert.ok(host.includes('files:') || host.includes("'files'"), 'side flags include files');
assert.ok(host.includes('comments:') || host.includes("'comments'"), 'side flags include comments');
assert.ok(host.includes('reviews:') || host.includes("'reviews'"), 'side flags include reviews');

const conv = fs.readFileSync(
  path.join(__dirname, '../src/modal/views/conversation/ConversationView.tsx'),
  'utf8'
);
assert.ok(conv.includes('sidePending'), 'ConversationView accepts sidePending');
// Title-spinner only (AsideSection loading=) — no body section skeletons
assert.ok(conv.includes('pendingCommits'), 'pendingCommits flag');
assert.ok(
  conv.includes('title="Development" loading={pendingDevelopment}'),
  'development title spinner'
);
assert.ok(
  conv.includes('title="Checks" loading={pendingChecks'),
  'checks title spinner'
);
assert.ok(conv.includes('pendingFiles'), 'pendingFiles flag');
assert.ok(
  !conv.includes('prp-section-skeleton'),
  'no body section skeletons in ConversationView'
);

console.log('independent-side-fetches.test.js: all assertions passed');
console.log('side-fetches-split=true');
console.log('title-spinner-loading=true');
console.log('files-comments-reviews-deferred=true');
