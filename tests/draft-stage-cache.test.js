/**
 * Draft stage → ready/draft must update local + host cache so UI does not
 * stick on the cached draft flag after a successful mutation.
 */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  buildDraftStageGraphql,
  draftFromStageGraphqlData,
} = require('../src/modal/lib/pr-edit-api.ts');

// GraphQL builders
const ready = buildDraftStageGraphql('ready', 'PR_node_1');
assert.ok(ready.query.includes('markPullRequestReadyForReview'));
assert.equal(ready.variables.id, 'PR_node_1');
const draft = buildDraftStageGraphql('draft', 'PR_node_2');
assert.ok(draft.query.includes('convertPullRequestToDraft'));

// Parse isDraft from either mutation shape
assert.equal(
  draftFromStageGraphqlData({
    markPullRequestReadyForReview: { pullRequest: { id: 'x', isDraft: false } },
  }),
  false
);
assert.equal(
  draftFromStageGraphqlData({
    convertPullRequestToDraft: { pullRequest: { id: 'x', isDraft: true } },
  }),
  true
);
assert.equal(draftFromStageGraphqlData(null), null);
assert.equal(draftFromStageGraphqlData({}), null);

// App wiring: optimistic draft + onPatchDetail + re-assert after refresh
const appSrc = fs.readFileSync(
  path.join(__dirname, '../src/modal/app/PrModalApp.tsx'),
  'utf8'
);
assert.ok(
  /function onSetDraftStage[\s\S]*onPatchDetail\?\.\(\{\s*draft/.test(appSrc) ||
    /function onSetDraftStage[\s\S]*onPatchDetail\?\.\(\{ draft/.test(appSrc),
  'onSetDraftStage patches host detail.draft'
);
assert.ok(
  /function onSetDraftStage[\s\S]*applyDraft/.test(appSrc),
  'central applyDraft for optimistic + post-refresh re-assert'
);
assert.ok(
  /function onSetDraftStage[\s\S]*result\.draft/.test(appSrc),
  'applies GraphQL-confirmed draft from API result'
);
assert.ok(
  /function onSetDraftStage[\s\S]*prevDraft/.test(appSrc),
  'reverts draft on failure'
);

// fetch layer returns { draft, data }
const fetchSrc = fs.readFileSync(
  path.join(__dirname, '../src/fetch-pulls.js'),
  'utf8'
);
assert.ok(
  fetchSrc.includes('draftFromStageGraphqlData') ||
    fetchSrc.includes('return { draft: Boolean(draft), data }'),
  'setPullRequestDraftStage returns draft boolean'
);

// Host onPatchDetail writes cache (used by draft patch)
const hostSrc = fs.readFileSync(
  path.join(__dirname, '../src/pr-modal-host.js'),
  'utf8'
);
assert.ok(hostSrc.includes('onPatchDetail'), 'host exposes onPatchDetail');
assert.ok(
  /onPatchDetail:[\s\S]{0,2500}detailCache\.set/.test(hostSrc),
  'onPatchDetail writes detailCache so SWR does not resurrect old draft'
);

console.log('draft-stage-cache.test.js: ok');
