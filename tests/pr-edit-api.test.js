/**
 * Unit tests for PR-edit pure helpers AND real fetch-pulls write helpers
 * (mock fetch records URL/method/body — no re-implementation of request shapes).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SCRATCH =
  process.env.PRP_SCRATCH || '/var/folders/px/qw6l220x5glb_gxf44lws9p80000gn/T/grok-goal-5a6d37e1751e/implementer';
fs.mkdirSync(SCRATCH, { recursive: true });

const pure = require('../src/modal/lib/pr-edit-api.ts');
const palette = require('../src/modal/lib/command-palette.ts');
const shortcutPolicy = require('../src/modal/lib/shortcut-policy.ts');
const fetchApi = require('../src/fetch-pulls.js');

globalThis.PRModalPrEditApi = pure;

const log = [];
function ok(name) {
  log.push(`ok - ${name}`);
  console.log(`ok - ${name}`);
}

function mockRecorder() {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    let body = null;
    if (init.body) {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = init.body;
      }
    }
    const rec = {
      url: String(url),
      method: (init.method || 'GET').toUpperCase(),
      body,
      headers: init.headers || {},
    };
    calls.push(rec);
    if (fetchImpl.queue && fetchImpl.queue.length) {
      const next = fetchImpl.queue.shift();
      if (next.throw) throw next.throw;
      return {
        ok: next.ok !== false,
        status: next.status ?? 200,
        statusText: next.statusText || 'OK',
        json: async () => next.json ?? {},
      };
    }
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ ok: true }),
    };
  };
  fetchImpl.queue = [];
  fetchImpl.calls = calls;
  return fetchImpl;
}

// --- Pure request builders ---
{
  const r = pure.buildUpdatePullRequest('o', 'r', 12, {
    body: 'hello',
    base: 'develop',
    title: 'T',
    state: 'closed',
  });
  assert.equal(r.method, 'PATCH');
  assert.match(r.url, /\/repos\/o\/r\/pulls\/12$/);
  assert.deepEqual(r.body, {
    body: 'hello',
    base: 'develop',
    title: 'T',
    state: 'closed',
  });
  ok('pure buildUpdatePullRequest');
}

{
  const r = pure.buildEditIssueComment('o', 'r', 99, 'edited');
  assert.equal(r.method, 'PATCH');
  assert.match(r.url, /issues\/comments\/99$/);
  assert.equal(r.body.body, 'edited');
  ok('pure buildEditIssueComment');
}

{
  const r = pure.buildEditReviewComment('o', 'r', 7, 'rc');
  assert.equal(r.method, 'PATCH');
  assert.match(r.url, /pulls\/comments\/7$/);
  ok('pure buildEditReviewComment');
}

{
  const r = pure.buildRequestReviewers('o', 'r', 1, {
    reviewers: ['alice'],
    teamReviewers: ['core'],
  });
  assert.equal(r.method, 'POST');
  assert.deepEqual(r.body.reviewers, ['alice']);
  assert.deepEqual(r.body.team_reviewers, ['core']);
  ok('pure buildRequestReviewers');
}

{
  const r = pure.buildRemoveReviewers('o', 'r', 1, { reviewers: ['bob'] });
  assert.equal(r.method, 'DELETE');
  assert.deepEqual(r.body.reviewers, ['bob']);
  ok('pure buildRemoveReviewers');
}

{
  const a = pure.buildSetAssignees('o', 'r', 3, ['carol']);
  assert.equal(a.method, 'POST');
  assert.deepEqual(a.body.assignees, ['carol']);
  const b = pure.buildRemoveAssignees('o', 'r', 3, ['carol']);
  assert.equal(b.method, 'DELETE');
  ok('pure buildSet/RemoveAssignees');
}

{
  const r = pure.buildSetLabels('o', 'r', 3, ['bug', 'help']);
  assert.equal(r.method, 'PUT');
  assert.deepEqual(r.body.labels, ['bug', 'help']);
  ok('pure buildSetLabels');
}

// --- Suggestions pure ---
{
  const fences = pure.parseSuggestionFences(
    'before\n```suggestion\nconst x = 1;\n```\nafter\n```suggestion\ny\n```'
  );
  assert.equal(fences.length, 2);
  assert.equal(fences[0].content, 'const x = 1;');
  assert.equal(fences[1].content, 'y');
  ok('pure parseSuggestionFences');
}

{
  const file = 'a\nb\nc\nd\n';
  const next = pure.applySuggestionToFileContent(file, {
    startLine: 2,
    endLine: 3,
    suggestion: 'B\nC',
  });
  assert.equal(next, 'a\nB\nC\nd\n');
  ok('pure applySuggestionToFileContent multi-line replace');
}

{
  const file = 'one\ntwo\nthree';
  const next = pure.applySuggestionToFileContent(file, {
    startLine: 2,
    endLine: 2,
    suggestion: 'TWO',
  });
  assert.equal(next, 'one\nTWO\nthree\n');
  ok('pure applySuggestionToFileContent single line');
}

{
  const r = pure.buildApplySuggestionCommitRequest('o', 'r', {
    path: 'src/a.js',
    branch: 'feat',
    contentBase64: 'YWJj',
    sha: 'deadbeef',
    message: 'Apply',
  });
  assert.equal(r.method, 'PUT');
  assert.match(r.url, /contents\/src\/a\.js$/);
  assert.equal(r.body.branch, 'feat');
  assert.equal(r.body.sha, 'deadbeef');
  assert.equal(r.body.content, 'YWJj');
  ok('pure buildApplySuggestionCommitRequest');
}

// --- Leave review mapping ---
{
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
  ok('pure mapLeaveReviewAction');
}

// --- Command palette ---
{
  const cmds = palette.buildPaletteCommands({
    baseRef: 'main',
    requestedReviewers: ['alice'],
    assignees: ['bob'],
    labels: [{ name: 'bug' }],
  });
  const ids = cmds.map((c) => c.id);
  assert.ok(ids.includes('edit-body'));
  assert.ok(ids.includes('set-base'));
  assert.ok(ids.includes('review-approve'));
  assert.ok(ids.includes('rm-rev-alice'));
  assert.ok(ids.includes('rm-asg-bob'));
  assert.ok(ids.includes('label-bug'));
  const filtered = palette.filterPaletteCommands(cmds, 'approve');
  assert.ok(filtered.some((c) => c.id === 'review-approve'));
  assert.equal(palette.formatShortcut('mod+shift+enter', true), '⌘⇧↵');
  assert.equal(palette.formatShortcut('mod+k', false), 'Ctrl+k');
  ok('command palette build/filter/format');
}

// --- Shortcut policy: only palette / diff toggle / find / escape remain ---
{
  const sp = shortcutPolicy;
  assert.equal(
    sp.resolveModalShortcutAction({
      mod: true,
      shift: false,
      key: 'k',
      paletteOpen: false,
    }),
    'openPalette'
  );
  assert.equal(
    sp.resolveModalShortcutAction({
      mod: true,
      shift: false,
      key: '.',
      paletteOpen: false,
    }),
    'toggleDiff'
  );
  // ⌘F must NOT open search — only Diff / palette / Esc remain
  assert.equal(
    sp.resolveModalShortcutAction({
      mod: true,
      shift: false,
      key: 'f',
      paletteOpen: false,
    }),
    null
  );
  // Leave-review chords intentionally disabled
  assert.equal(
    sp.resolveModalShortcutAction({
      mod: true,
      shift: false,
      key: 'enter',
      editingBody: false,
      paletteOpen: false,
    }),
    null
  );
  assert.equal(
    sp.resolveModalShortcutAction({
      mod: true,
      shift: true,
      key: 'enter',
      editingBody: false,
      paletteOpen: false,
    }),
    null
  );
  assert.equal(
    sp.resolveModalShortcutAction({
      mod: true,
      shift: true,
      key: 'm',
      paletteOpen: false,
    }),
    null
  );
  assert.equal(
    sp.resolveModalShortcutAction({
      key: 'escape',
      paletteOpen: true,
    }),
    'closePalette'
  );
  assert.equal(
    sp.resolveModalShortcutAction({
      key: 'escape',
      editingBody: true,
    }),
    'cancelEdit'
  );
  assert.equal(
    sp.resolveModalShortcutAction({
      key: 'escape',
    }),
    'escapeNav'
  );
  ok('shortcut policy palette/diff/esc only');
}

// ============================================================================
// Real shipped fetch-pulls write helpers (mock fetch records URL/method/body)
// ============================================================================
async function runFetchWriteTests() {
  const token = 'ghp_test_token';

  {
    const fetchImpl = mockRecorder();
    await fetchApi.updatePullRequest(
      'acme',
      'app',
      42,
      { body: '## New body', base: 'develop' },
      fetchImpl,
      token
    );
    assert.equal(fetchImpl.calls.length, 1);
    const c = fetchImpl.calls[0];
    assert.equal(c.method, 'PATCH');
    assert.equal(c.url, 'https://api.github.com/repos/acme/app/pulls/42');
    assert.deepEqual(c.body, { body: '## New body', base: 'develop' });
    assert.match(c.headers.Authorization || '', /Bearer/);
    ok('fetch updatePullRequest body+base');
  }

  {
    const fetchImpl = mockRecorder();
    await fetchApi.editIssueComment('acme', 'app', 9001, 'edited issue', fetchImpl, token);
    const c = fetchImpl.calls[0];
    assert.equal(c.method, 'PATCH');
    assert.equal(c.url, 'https://api.github.com/repos/acme/app/issues/comments/9001');
    assert.deepEqual(c.body, { body: 'edited issue' });
    ok('fetch editIssueComment');
  }

  {
    const fetchImpl = mockRecorder();
    await fetchApi.editReviewComment('acme', 'app', 77, 'edited review', fetchImpl, token);
    const c = fetchImpl.calls[0];
    assert.equal(c.method, 'PATCH');
    assert.equal(c.url, 'https://api.github.com/repos/acme/app/pulls/comments/77');
    assert.deepEqual(c.body, { body: 'edited review' });
    ok('fetch editReviewComment');
  }

  {
    const fetchImpl = mockRecorder();
    await fetchApi.requestReviewers(
      'acme',
      'app',
      42,
      { reviewers: ['alice', 'bob'], teamReviewers: ['core'] },
      fetchImpl,
      token
    );
    const c = fetchImpl.calls[0];
    assert.equal(c.method, 'POST');
    assert.equal(
      c.url,
      'https://api.github.com/repos/acme/app/pulls/42/requested_reviewers'
    );
    assert.deepEqual(c.body, {
      reviewers: ['alice', 'bob'],
      team_reviewers: ['core'],
    });
    ok('fetch requestReviewers');
  }

  {
    const fetchImpl = mockRecorder();
    await fetchApi.removeReviewers(
      'acme',
      'app',
      42,
      { reviewers: ['alice'] },
      fetchImpl,
      token
    );
    const c = fetchImpl.calls[0];
    assert.equal(c.method, 'DELETE');
    assert.equal(
      c.url,
      'https://api.github.com/repos/acme/app/pulls/42/requested_reviewers'
    );
    assert.deepEqual(c.body.reviewers, ['alice']);
    ok('fetch removeReviewers');
  }

  {
    const fetchImpl = mockRecorder();
    await fetchApi.addAssignees('acme', 'app', 42, ['carol'], fetchImpl, token);
    const c = fetchImpl.calls[0];
    assert.equal(c.method, 'POST');
    assert.equal(c.url, 'https://api.github.com/repos/acme/app/issues/42/assignees');
    assert.deepEqual(c.body, { assignees: ['carol'] });
    ok('fetch addAssignees');
  }

  {
    const fetchImpl = mockRecorder();
    await fetchApi.removeAssignees('acme', 'app', 42, ['carol'], fetchImpl, token);
    const c = fetchImpl.calls[0];
    assert.equal(c.method, 'DELETE');
    assert.equal(c.url, 'https://api.github.com/repos/acme/app/issues/42/assignees');
    assert.deepEqual(c.body, { assignees: ['carol'] });
    ok('fetch removeAssignees');
  }

  {
    const fetchImpl = mockRecorder();
    await fetchApi.setIssueLabels('acme', 'app', 42, ['bug', 'p1'], fetchImpl, token);
    const c = fetchImpl.calls[0];
    assert.equal(c.method, 'PUT');
    assert.equal(c.url, 'https://api.github.com/repos/acme/app/issues/42/labels');
    assert.deepEqual(c.body, { labels: ['bug', 'p1'] });
    ok('fetch setIssueLabels');
  }

  {
    const original = 'line1\nline2\nline3\n';
    const b64 = Buffer.from(original, 'utf8').toString('base64');
    const fetchImpl = mockRecorder();
    fetchImpl.queue.push({
      json: { content: b64, sha: 'blobsha123', encoding: 'base64' },
    });
    fetchImpl.queue.push({
      json: { commit: { sha: 'commitsha' }, content: { path: 'src/foo.js' } },
    });
    await fetchApi.applyReviewSuggestion(
      'acme',
      'app',
      {
        path: 'src/foo.js',
        headRef: 'feature/x',
        startLine: 2,
        endLine: 2,
        suggestion: 'LINE_TWO',
        message: 'Apply suggestion to src/foo.js',
      },
      fetchImpl,
      token
    );
    assert.equal(fetchImpl.calls.length, 2);
    const get = fetchImpl.calls[0];
    assert.equal(get.method, 'GET');
    assert.match(get.url, /\/contents\/src\/foo\.js\?ref=feature%2Fx/);
    const put = fetchImpl.calls[1];
    assert.equal(put.method, 'PUT');
    assert.match(put.url, /\/contents\/src\/foo\.js$/);
    assert.equal(put.body.branch, 'feature/x');
    assert.equal(put.body.sha, 'blobsha123');
    const decoded = Buffer.from(put.body.content, 'base64').toString('utf8');
    assert.equal(decoded, 'line1\nLINE_TWO\nline3\n');
    ok('fetch applyReviewSuggestion GET+PUT');
  }


  {
    const r = pure.buildMergePullRequest('acme', 'app', 9, { mergeMethod: 'squash', commitTitle: 'T' });
    assert.equal(r.method, 'PUT');
    assert.match(r.url, /\/pulls\/9\/merge$/);
    assert.equal(r.body.merge_method, 'squash');
    ok('pure buildMergePullRequest');
  }
  {
    const r = pure.buildUpdateBranch('acme', 'app', 9, { expectedHeadSha: 'abc' });
    assert.equal(r.method, 'PUT');
    assert.match(r.url, /update-branch$/);
    assert.equal(r.body.expected_head_sha, 'abc');
    ok('pure buildUpdateBranch');
  }
  {
    const r = pure.buildSetSubscription('acme', 'app', 9, { subscribed: true });
    assert.equal(r.method, 'PUT');
    assert.match(r.url, /subscription$/);
    assert.deepEqual(r.body, { subscribed: true, ignored: false });
    ok('pure buildSetSubscription');
  }
  {
    const r = pure.buildSetMilestone('acme', 'app', 9, 3);
    assert.equal(r.method, 'PATCH');
    assert.deepEqual(r.body, { milestone: 3 });
    const clear = pure.buildSetMilestone('acme', 'app', 9, null);
    assert.equal(clear.body.milestone, null);
    ok('pure buildSetMilestone');
  }
  {
    const g = pure.buildDraftStageGraphql('ready', 'PR_node');
    assert.match(g.query, /markPullRequestReadyForReview/);
    assert.equal(g.variables.id, 'PR_node');
    const d = pure.buildDraftStageGraphql('draft', 'PR_node');
    assert.match(d.query, /convertPullRequestToDraft/);
    ok('pure buildDraftStageGraphql');
  }
  {
    assert.deepEqual(pure.parseLinkedIssueNumbers('Fixes #12 and refs #3'), [3, 12]);
    ok('pure parseLinkedIssueNumbers');
  }
  // Re-request selection: never include currently pending requested reviewers
  {
    assert.deepEqual(
      pure.buildRerequestReviewerLogins({
        requestedReviewers: ['alice', 'bob'],
        reviews: [],
        author: 'owner',
      }),
      [],
      'pending-only → empty (re-POST would 422)'
    );
    assert.deepEqual(
      pure.buildRerequestReviewerLogins({
        requestedReviewers: [],
        reviews: [{ author: 'carol' }, { author: 'dave' }, { author: 'owner' }],
        author: 'owner',
      }),
      ['carol', 'dave'],
      'past-only excludes PR author'
    );
    assert.deepEqual(
      pure.buildRerequestReviewerLogins({
        requestedReviewers: ['alice'],
        reviews: [
          { author: 'alice' },
          { author: 'bob' },
          { author: 'Carol' },
          { author: 'owner' },
        ],
        author: 'owner',
      }),
      ['bob', 'Carol'],
      'mixed: skip pending alice + author'
    );
    assert.deepEqual(
      pure.buildRerequestReviewerLogins({
        requestedReviewers: ['eve'],
        reviews: [{ author: 'eve' }],
        author: 'owner',
        extraLogins: ['eve', 'frank'],
      }),
      ['frank'],
      'extraLogins still excludes pending'
    );
    ok('pure buildRerequestReviewerLogins pending/past/mixed');
  }

  // Real fetch write helpers for new actions
  {
    const fetchImpl = mockRecorder();
    await fetchApi.mergePullRequest('acme', 'app', 9, { mergeMethod: 'merge' }, fetchImpl, token);
    const c = fetchImpl.calls[0];
    assert.equal(c.method, 'PUT');
    assert.equal(c.url, 'https://api.github.com/repos/acme/app/pulls/9/merge');
    assert.equal(c.body.merge_method, 'merge');
    ok('fetch mergePullRequest');
  }
  {
    const fetchImpl = mockRecorder();
    await fetchApi.updatePullBranch('acme', 'app', 9, { expectedHeadSha: 'dead' }, fetchImpl, token);
    const c = fetchImpl.calls[0];
    assert.equal(c.method, 'PUT');
    assert.match(c.url, /update-branch$/);
    assert.equal(c.body.expected_head_sha, 'dead');
    ok('fetch updatePullBranch');
  }
  {
    const fetchImpl = mockRecorder();
    await fetchApi.setIssueSubscription('acme', 'app', 9, { subscribed: true }, fetchImpl, token);
    assert.equal(fetchImpl.calls[0].method, 'PUT');
    ok('fetch setIssueSubscription');
  }
  {
    const fetchImpl = mockRecorder();
    await fetchApi.setIssueMilestone('acme', 'app', 9, 7, fetchImpl, token);
    assert.equal(fetchImpl.calls[0].method, 'PATCH');
    assert.deepEqual(fetchImpl.calls[0].body, { milestone: 7 });
    ok('fetch setIssueMilestone');
  }
  {
    const fetchImpl = mockRecorder();
    fetchImpl.queue.push({ json: { node_id: 'PR_kw_test' } });
    fetchImpl.queue.push({ json: { data: { convertPullRequestToDraft: { pullRequest: { isDraft: true } } } } });
    // apiGraphql expects ok json - second call is POST graphql
    await fetchApi.setPullRequestDraftStage('acme', 'app', 9, 'draft', fetchImpl, token, null);
    assert.ok(fetchImpl.calls.some((c) => c.method === 'GET' && /pulls\/9$/.test(c.url)));
    assert.ok(fetchImpl.calls.some((c) => c.method === 'POST' && /graphql/.test(c.url)));
    ok('fetch setPullRequestDraftStage');
  }

  {
    assert.equal(pure.mapLeaveReviewAction('comment').kind, 'issue-comment');
    assert.equal(pure.mapLeaveReviewAction('approve').event, 'APPROVE');
    assert.equal(pure.mapLeaveReviewAction('request_changes').event, 'REQUEST_CHANGES');
    ok('leave-review form event mapping contract');
  }
}

runFetchWriteTests()
  .then(() => {
    const out = log.join('\n') + '\n';
    fs.writeFileSync(path.join(SCRATCH, 'pr-edit-api-test.log'), out);
    console.log(`\nWrote ${path.join(SCRATCH, 'pr-edit-api-test.log')}`);
    console.log(`assertions=${log.length}`);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
