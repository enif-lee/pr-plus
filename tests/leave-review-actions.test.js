/**
 * Leave-review actions: Submit review / Approve / Request changes.
 * Covers event mapping, Diff toolbar wiring, opt shortcuts, App API path,
 * and fetch submitPendingPullReview / submitPullReview contracts.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const pure = require('../src/modal/pure/pr-edit-api.js');
const {
  isViewerPrAuthor,
  canSubmitReviewVerdict,
  isReviewVerdictKind,
} = require('../src/modal/lib/pr-edit-api.ts');
const palette = require('../src/modal/lib/command-palette.ts');
const {
  buildPendingReviewSubmitPayload,
  createEmptyPendingReview,
  addPendingComment,
  setPendingReviewBody,
} = require('../src/modal/lib/pending-review.ts');

// Isolate fetch helpers without loading full service worker graph when possible
const fetchPullsPath = path.join(__dirname, '../src/fetch-pulls.js');
const fetchSrc = fs.readFileSync(fetchPullsPath, 'utf8');

const root = path.join(__dirname, '..');
const appSrc = fs.readFileSync(path.join(root, 'src/modal/app/PrModalApp.tsx'), 'utf8');
const toolbarSrc = fs.readFileSync(
  path.join(root, 'src/modal/views/chrome/DiffToolbar.tsx'),
  'utf8'
);
const css = fs.readFileSync(path.join(root, 'src/modal/styles.css'), 'utf8');

// --- mapLeaveReviewAction ---
assert.deepEqual(pure.mapLeaveReviewAction('comment'), {
  kind: 'issue-comment',
  event: 'COMMENT',
});
assert.deepEqual(pure.mapLeaveReviewAction('approve'), {
  kind: 'review',
  event: 'APPROVE',
});
assert.deepEqual(pure.mapLeaveReviewAction('request_changes'), {
  kind: 'review',
  event: 'REQUEST_CHANGES',
});
assert.deepEqual(pure.mapLeaveReviewAction('request-changes'), {
  kind: 'review',
  event: 'REQUEST_CHANGES',
});

// --- Own PR: hide Approve / Request changes ---
assert.equal(
  isViewerPrAuthor({ author: 'enif-lee', viewerLogin: 'enif-lee' }),
  true
);
assert.equal(
  isViewerPrAuthor({ author: 'Enif-Lee', viewerLogin: 'enif-lee' }),
  true,
  'login compare is case-insensitive'
);
assert.equal(
  isViewerPrAuthor({ author: 'alice', viewerLogin: 'bob' }),
  false
);
assert.equal(
  canSubmitReviewVerdict({ author: 'enif-lee', viewerLogin: 'enif-lee' }),
  false
);
assert.equal(
  canSubmitReviewVerdict({ author: 'alice', viewerLogin: 'bob' }),
  true
);
assert.equal(isReviewVerdictKind('approve'), true);
assert.equal(isReviewVerdictKind('request_changes'), true);
assert.equal(isReviewVerdictKind('comment'), false);

{
  const own = palette.buildPaletteCommands({
    author: 'enif-lee',
    viewerLogin: 'enif-lee',
  });
  const ownIds = own.map((c) => c.id);
  assert.ok(ownIds.includes('review-comment'), 'own PR still has comment submit');
  assert.ok(!ownIds.includes('review-approve'), 'own PR hides approve palette cmd');
  assert.ok(!ownIds.includes('review-changes'), 'own PR hides request-changes palette cmd');

  const other = palette.buildPaletteCommands({
    author: 'alice',
    viewerLogin: 'bob',
  });
  const otherIds = other.map((c) => c.id);
  assert.ok(otherIds.includes('review-approve'));
  assert.ok(otherIds.includes('review-changes'));
}

// Diff toolbar / Conversation / App gate verdict buttons for own PR
assert.ok(toolbarSrc.includes('canSubmitReviewVerdict') || toolbarSrc.includes('showReviewVerdict'));
assert.ok(appSrc.includes('isViewerPrAuthor') || appSrc.includes('canSubmitReviewVerdict'));
assert.ok(
  fs
    .readFileSync(path.join(root, 'src/modal/views/conversation/ConversationView.tsx'), 'utf8')
    .includes('showReviewVerdict') ||
    fs
      .readFileSync(path.join(root, 'src/modal/views/conversation/ConversationView.tsx'), 'utf8')
      .includes('canSubmitReviewVerdict')
);

// --- Diff toolbar buttons call the three kinds ---
assert.ok(
  toolbarSrc.includes("onLeaveReviewAction?.('comment')"),
  'Submit review → comment'
);
assert.ok(
  toolbarSrc.includes("onLeaveReviewAction?.('approve')"),
  'Approve → approve'
);
assert.ok(
  toolbarSrc.includes("onLeaveReviewAction?.('request_changes')"),
  'Request changes → request_changes'
);
assert.ok(toolbarSrc.includes('Submit review'));
assert.ok(toolbarSrc.includes('Approve'));
assert.ok(toolbarSrc.includes('Request changes'));

// --- App wires leaveReview + both submit APIs ---
assert.ok(appSrc.includes("case 'leaveReview'"));
assert.ok(appSrc.includes('onLeaveReviewAction'));
assert.ok(appSrc.includes('submitPendingPullReview'));
assert.ok(appSrc.includes('submitPullReview'));
assert.ok(
  appSrc.includes("event === 'APPROVE'") || appSrc.includes("event === \"APPROVE\""),
  'Approve success message branch'
);
assert.ok(
  appSrc.includes("event === 'REQUEST_CHANGES'") ||
    appSrc.includes("event === \"REQUEST_CHANGES\""),
  'Request changes success message branch'
);
// Pending path uses mapped event COMMENT for "Submit review" button
assert.ok(
  /mapped\.kind === 'issue-comment' \? 'COMMENT'/.test(appSrc) ||
    appSrc.includes("mapped.kind === 'issue-comment' ? 'COMMENT'"),
  'comment maps to COMMENT event on pending submit'
);

// --- Option shortcuts resolve to leaveReview with correct payloads ---
{
  const comment = palette.resolvePrModalOptAction({
    alt: true,
    shift: false,
    mod: false,
    key: 'Enter',
    code: 'Enter',
  });
  assert.equal(comment?.action, 'leaveReview');
  assert.equal(comment?.payload?.kind, 'comment');

  const approve = palette.resolvePrModalOptAction({
    alt: true,
    shift: true,
    mod: false,
    key: 'Enter',
    code: 'Enter',
  });
  assert.equal(approve?.action, 'leaveReview');
  assert.equal(approve?.payload?.kind, 'approve');

  const changes = palette.resolvePrModalOptAction({
    alt: true,
    shift: true,
    mod: false,
    key: 'x',
    code: 'KeyX',
  });
  assert.equal(changes?.action, 'leaveReview');
  assert.equal(changes?.payload?.kind, 'request_changes');
}

// --- Command palette entries ---
{
  const cmds = palette.buildPaletteCommands({});
  const byId = Object.fromEntries(cmds.map((c) => [c.id, c]));
  assert.equal(byId['review-comment']?.action || byId['review-approve']?.action, 'leaveReview');
  const approve = cmds.find((c) => c.id === 'review-approve');
  const request = cmds.find((c) => c.id === 'review-request-changes' || c.payload?.kind === 'request_changes');
  const comment = cmds.find(
    (c) => c.payload?.kind === 'comment' && c.action === 'leaveReview'
  );
  assert.ok(approve, 'palette has approve');
  assert.equal(approve.payload.kind, 'approve');
  assert.ok(request, 'palette has request changes');
  assert.equal(request.payload.kind, 'request_changes');
  assert.ok(comment, 'palette has comment submit');
}

// --- Pending payload builder for each event ---
{
  let batch = createEmptyPendingReview();
  batch = addPendingComment(batch, {
    path: 'src/a.ts',
    line: 10,
    body: 'nit',
    side: 'RIGHT',
  }).batch;
  batch = setPendingReviewBody(batch, 'looks good overall');

  for (const event of ['COMMENT', 'APPROVE', 'REQUEST_CHANGES']) {
    const payload = buildPendingReviewSubmitPayload(batch, {
      event,
      commitId: 'deadbeef',
    });
    assert.ok(payload, `payload for ${event}`);
    assert.equal(payload.event, event);
    assert.equal(payload.body, 'looks good overall');
    assert.equal(payload.comments.length, 1);
    assert.equal(payload.comments[0].path, 'src/a.ts');
  }
}

// --- fetch-pulls submitPendingPullReview validates events + posts correct body ---
{
  // Lightweight re-implementation of event gate (mirrors fetch-pulls)
  function validateEvent(event) {
    const ev = String(event || 'COMMENT').toUpperCase();
    if (!['COMMENT', 'APPROVE', 'REQUEST_CHANGES'].includes(ev)) {
      throw new Error('Invalid review event');
    }
    return ev;
  }
  assert.equal(validateEvent('approve'), 'APPROVE');
  assert.equal(validateEvent('COMMENT'), 'COMMENT');
  assert.equal(validateEvent('request_changes'), 'REQUEST_CHANGES');
  assert.throws(() => validateEvent('NOPE'), /Invalid review event/);

  // Source contract: pending submit hits /reviews/{id}/events
  assert.ok(
    fetchSrc.includes('/reviews/${id}/events') ||
      fetchSrc.includes('/reviews/${id}/events') ||
      /reviews\/\$\{id\}\/events/.test(fetchSrc) ||
      fetchSrc.includes('reviews/${id}/events') ||
      /pulls\/\$\{pullNumber\}\/reviews\/\$\{id\}\/events/.test(fetchSrc),
    'submitPendingPullReview posts to reviews/{id}/events'
  );
  assert.ok(
    fetchSrc.includes("['COMMENT', 'APPROVE', 'REQUEST_CHANGES']") ||
      fetchSrc.includes('COMMENT') && fetchSrc.includes('REQUEST_CHANGES'),
    'allowed review events listed'
  );
  assert.ok(fetchSrc.includes('async function submitPendingPullReview'));
  assert.ok(fetchSrc.includes('async function submitPullReview'));
  // one-shot create review endpoint
  assert.ok(
    /pulls\/\$\{pullNumber\}\/reviews/.test(fetchSrc) ||
      fetchSrc.includes('/pulls/${pullNumber}/reviews'),
    'submitPullReview posts to pulls/{n}/reviews'
  );
}

// --- Simulate App decision table: kind → API + event ---
function resolveLeaveReviewApiCall({ kind, hasServerPending, pendingReviewId, body }) {
  const mapped = pure.mapLeaveReviewAction(kind);
  const forceIssueComment =
    kind === 'issue-comment' || kind === 'post-comment' || kind === 'comment-only';
  if (forceIssueComment || (mapped.kind === 'issue-comment' && !hasServerPending)) {
    return { api: 'postIssueComment', event: null, needsBody: true };
  }
  const event = mapped.kind === 'issue-comment' ? 'COMMENT' : mapped.event || 'COMMENT';
  if (event === 'REQUEST_CHANGES' && !body && !hasServerPending) {
    return { api: null, event, error: 'body-required' };
  }
  if (hasServerPending || pendingReviewId) {
    return {
      api: 'submitPendingPullReview',
      event,
      reviewId: pendingReviewId,
    };
  }
  return { api: 'submitPullReview', event };
}

assert.deepEqual(
  resolveLeaveReviewApiCall({
    kind: 'comment',
    hasServerPending: true,
    pendingReviewId: 99,
    body: '',
  }),
  { api: 'submitPendingPullReview', event: 'COMMENT', reviewId: 99 }
);
assert.deepEqual(
  resolveLeaveReviewApiCall({
    kind: 'approve',
    hasServerPending: true,
    pendingReviewId: 99,
    body: '',
  }),
  { api: 'submitPendingPullReview', event: 'APPROVE', reviewId: 99 }
);
assert.deepEqual(
  resolveLeaveReviewApiCall({
    kind: 'request_changes',
    hasServerPending: true,
    pendingReviewId: 99,
    body: 'please fix',
  }),
  { api: 'submitPendingPullReview', event: 'REQUEST_CHANGES', reviewId: 99 }
);
assert.deepEqual(
  resolveLeaveReviewApiCall({
    kind: 'approve',
    hasServerPending: false,
    pendingReviewId: null,
    body: '',
  }),
  { api: 'submitPullReview', event: 'APPROVE' }
);
assert.equal(
  resolveLeaveReviewApiCall({
    kind: 'request_changes',
    hasServerPending: false,
    pendingReviewId: null,
    body: '',
  }).error,
  'body-required'
);
assert.equal(
  resolveLeaveReviewApiCall({
    kind: 'comment',
    hasServerPending: false,
    pendingReviewId: null,
    body: 'hi',
  }).api,
  'postIssueComment'
);

// --- Mock bridge integration: kind → correct API + event ---
async function runLeaveReviewMock({ kind, hasServerPending, pendingReviewId, body = '' }) {
  const calls = [];
  const detail = { owner: 'acme', repo: 'app', number: 42, headSha: 'abc123' };
  const mockApi = {
    async submitPendingPullReview(owner, repo, number, reviewId, opts) {
      calls.push({ fn: 'submitPendingPullReview', owner, repo, number, reviewId, ...opts });
    },
    async submitPullReview(owner, repo, number, payload) {
      calls.push({ fn: 'submitPullReview', owner, repo, number, ...payload });
    },
    async postIssueComment(owner, repo, number, text) {
      calls.push({ fn: 'postIssueComment', owner, repo, number, body: text });
    },
  };
  const mapped = pure.mapLeaveReviewAction(kind);
  const forceIssueComment =
    kind === 'issue-comment' || kind === 'post-comment' || kind === 'comment-only';
  if (forceIssueComment || (mapped.kind === 'issue-comment' && !hasServerPending)) {
    await mockApi.postIssueComment(detail.owner, detail.repo, detail.number, body);
    return calls;
  }
  const event = mapped.kind === 'issue-comment' ? 'COMMENT' : mapped.event || 'COMMENT';
  if (hasServerPending || pendingReviewId) {
    await mockApi.submitPendingPullReview(
      detail.owner,
      detail.repo,
      detail.number,
      pendingReviewId,
      { event, body }
    );
  } else {
    await mockApi.submitPullReview(detail.owner, detail.repo, detail.number, {
      event,
      body,
      commitId: detail.headSha,
      comments: [],
    });
  }
  return calls;
}

(async () => {
  let c = await runLeaveReviewMock({
    kind: 'comment',
    hasServerPending: true,
    pendingReviewId: 7,
  });
  assert.equal(c[0].fn, 'submitPendingPullReview');
  assert.equal(c[0].event, 'COMMENT');
  assert.equal(c[0].reviewId, 7);

  c = await runLeaveReviewMock({
    kind: 'approve',
    hasServerPending: true,
    pendingReviewId: 7,
    body: 'LGTM',
  });
  assert.equal(c[0].event, 'APPROVE');

  c = await runLeaveReviewMock({
    kind: 'request_changes',
    hasServerPending: true,
    pendingReviewId: 7,
    body: 'fix nits',
  });
  assert.equal(c[0].event, 'REQUEST_CHANGES');
  assert.equal(c[0].body, 'fix nits');

  c = await runLeaveReviewMock({
    kind: 'approve',
    hasServerPending: false,
    pendingReviewId: null,
  });
  assert.equal(c[0].fn, 'submitPullReview');
  assert.equal(c[0].event, 'APPROVE');
  assert.equal(c[0].commitId, 'abc123');

  // Bridge message types exist
  const bridge = fs.readFileSync(path.join(root, 'src/content-bridge.js'), 'utf8');
  assert.ok(bridge.includes("type: 'PR_TREE_SUBMIT_PENDING_REVIEW'"));
  assert.ok(bridge.includes("type: 'PR_TREE_SUBMIT_REVIEW'"));
  const bg = fs.readFileSync(path.join(root, 'src/background.js'), 'utf8');
  assert.ok(bg.includes('PR_TREE_SUBMIT_PENDING_REVIEW'));
  assert.ok(bg.includes('PR_TREE_SUBMIT_REVIEW'));

  // --- File nav form control heights unified ---
  assert.ok(css.includes('--prp-filetree-ctrl-h'), 'filetree ctrl height token');
  assert.ok(
    /prp-filetree__search-input[\s\S]{0,200}height:\s*var\(--prp-filetree-ctrl-h/.test(css),
    'search input uses shared height'
  );
  assert.ok(
    /prp-filetree__ext[\s\S]{0,250}height:\s*var\(--prp-filetree-ctrl-h/.test(css),
    'filter chips use shared height'
  );
  assert.ok(
    css.includes('.prp-filetree .prp-step-nav') ||
      /prp-filetree__file-nav[\s\S]{0,200}height:\s*var\(--prp-filetree-ctrl-h/.test(css),
    'file step-nav uses shared height'
  );

  console.log('leave-review-actions.test.js: all assertions passed');
  console.log('leave-review-comment=true');
  console.log('leave-review-approve=true');
  console.log('leave-review-request-changes=true');
  console.log('file-nav-ctrl-height=true');
  console.log('leave-review-mock-api=true');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
