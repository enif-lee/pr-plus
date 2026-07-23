'use strict';

/**
 * Gating test for optimistic review comment → diff virtual rows / threads.
 * Drives shipped pure helpers (mapRestReviewComment, appendOptimisticReviewComment,
 * flattenFilesToVirtualRows, groupReviewThreads) — the same path App uses after
 * postReviewComment / replyToReviewComment before onRefresh completes.
 */

const assert = require('assert');
const fs = require('node:fs');
const path = require('node:path');

const SCRATCH =
  process.env.PRP_SCRATCH || '/var/folders/px/qw6l220x5glb_gxf44lws9p80000gn/T/grok-goal-5a6d37e1751e/implementer';
fs.mkdirSync(SCRATCH, { recursive: true });

const editApi = require('../src/modal/lib/pr-edit-api.ts');
const diffRows = require('../src/modal/lib/diff-rows.ts');
const threads = require('../src/modal/lib/review-threads.ts');

const lines = [];
function ok(msg) {
  lines.push('ok - ' + msg);
  console.log('ok -', msg);
}

// Fixture: single-file patch with RIGHT line numbers 1..3
const files = [
  {
    filename: 'src/foo.js',
    status: 'modified',
    additions: 2,
    deletions: 0,
    patch: [
      '@@ -1,1 +1,3 @@',
      ' context',
      '+added one',
      '+added two',
    ].join('\n'),
  },
];

// --- 1) New root line comment appears as inline-comment virtual row ---
{
  const detail = { reviewComments: [] };
  const raw = {
    id: 9001,
    user: { login: 'alice' },
    body: 'Looks good on this line',
    path: 'src/foo.js',
    line: 2,
    side: 'RIGHT',
    created_at: '2026-07-22T00:00:00Z',
    node_id: 'PRRC_9001',
  };
  const mapped = editApi.mapRestReviewComment(raw);
  assert.ok(mapped);
  assert.equal(mapped.id, 9001);
  assert.equal(mapped.author, 'alice');
  assert.equal(mapped.path, 'src/foo.js');
  assert.equal(mapped.line, 2);
  assert.equal(mapped.inReplyToId, null);

  const next = editApi.appendOptimisticReviewComment(detail, mapped);
  assert.equal(next.reviewComments.length, 1);
  assert.equal(next.reviewComments[0].body, 'Looks good on this line');

  // Idempotent append
  const again = editApi.appendOptimisticReviewComment(next, mapped);
  assert.equal(again.reviewComments.length, 1);

  const rows = diffRows.flattenFilesToVirtualRows(files, 'unified', {
    reviewComments: next.reviewComments,
  });
  const inline = rows.filter((r) => r.kind === 'inline-comment');
  assert.equal(inline.length, 1, 'expected one inline-comment row after optimistic append');
  assert.equal(inline[0].commentId, 9001);
  assert.equal(inline[0].body, 'Looks good on this line');
  assert.equal(inline[0].newLine, 2);
  assert.ok(
    rows.some((r) => r.kind === 'diff-line' && r.newLine === 2),
    'comment anchors on matching RIGHT line'
  );
  ok('optimistic root comment → virtual inline-comment row');
}

// --- 2) Reply maps with inReplyToId → thread replies, not second inline row ---
{
  const root = editApi.mapRestReviewComment({
    id: 100,
    user: { login: 'bob' },
    body: 'root comment',
    path: 'src/foo.js',
    line: 3,
    side: 'RIGHT',
    created_at: '2026-07-22T01:00:00Z',
  });
  let detail = editApi.appendOptimisticReviewComment({ reviewComments: [] }, root);

  const replyRaw = {
    id: 101,
    user: { login: 'carol' },
    body: 'reply body',
    path: 'src/foo.js',
    line: 3,
    side: 'RIGHT',
    in_reply_to_id: 100,
    created_at: '2026-07-22T01:01:00Z',
  };
  const reply = editApi.mapRestReviewComment(replyRaw, {
    path: 'src/foo.js',
    line: 3,
    inReplyToId: 100,
    author: 'carol',
    body: 'reply body',
  });
  assert.equal(reply.inReplyToId, 100);
  detail = editApi.appendOptimisticReviewComment(detail, reply);
  assert.equal(detail.reviewComments.length, 2);

  const grouped = threads.groupReviewThreads(detail.reviewComments);
  assert.equal(grouped.length, 1, 'one thread root');
  assert.equal(grouped[0].id, 100);
  assert.equal(grouped[0].replies.length, 1);
  assert.equal(grouped[0].replies[0].id, 101);
  assert.equal(grouped[0].replies[0].body, 'reply body');

  const rows = diffRows.flattenFilesToVirtualRows(files, 'unified', {
    reviewComments: detail.reviewComments,
  });
  const inline = rows.filter((r) => r.kind === 'inline-comment');
  assert.equal(
    inline.length,
    1,
    'reply must not emit a second inline-comment row (nested under root)'
  );
  assert.equal(inline[0].commentId, 100);
  ok('optimistic reply → thread replies + single inline root row');
}

// --- 3) Fallback when REST body is sparse (network race) ---
{
  const mapped = editApi.mapRestReviewComment(
    { id: 55 },
    {
      body: 'from fallback',
      path: 'src/foo.js',
      line: 1,
      author: 'dave',
      side: 'RIGHT',
    }
  );
  assert.equal(mapped.body, 'from fallback');
  assert.equal(mapped.path, 'src/foo.js');
  assert.equal(mapped.line, 1);
  assert.equal(mapped.author, 'dave');
  ok('mapRestReviewComment fallback fields');
}

// --- 4) App ships pure helpers + localDetail optimistic path ---
{
  const appSrc = fs.readFileSync(path.join(__dirname, '../src/modal/app/PrModalApp.tsx'), 'utf8');
  assert.ok(appSrc.includes('appendOptimisticReviewComment'));
  assert.ok(appSrc.includes('mapRestReviewComment'));
  assert.ok(appSrc.includes('setLocalDetail'));
  assert.ok(appSrc.includes('localDetail'));
  ok('App wires optimistic pure helpers');
}

const log = ['diff-thread-refresh.test.js', ...lines].join('\n') + '\n';
fs.writeFileSync(path.join(SCRATCH, 'diff-thread-refresh.md'), log);
fs.writeFileSync(path.join(SCRATCH, 'diff-thread-refresh.log'), log);
console.log('diff-thread-refresh.test.js: all assertions passed');
