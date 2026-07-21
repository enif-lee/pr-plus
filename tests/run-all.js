const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SCRATCH =
  process.env.PRP_SCRATCH || '/var/folders/px/qw6l220x5glb_gxf44lws9p80000gn/T/grok-goal-5a6d37e1751e/implementer';
fs.mkdirSync(SCRATCH, { recursive: true });

// Ensure modal bundle exists for host/bundle tests
const build = spawnSync(process.execPath, [path.join(__dirname, '../scripts/build-modal.mjs')], {
  encoding: 'utf8',
  env: process.env,
});
if (build.status !== 0) {
  process.stderr.write(build.stdout + build.stderr);
  process.exit(build.status || 1);
}

const tests = [
  'tree.test.js',
  'storage.test.js',
  'fetch-pulls.test.js',
  'fetch-pr-detail.test.js',
  'detail-cache.test.js',
  'aside-lists.test.js',
  'line-selection.test.js',
  'review-threads.test.js',
  'markdown-composer.test.js',
  'composer-attach.test.js',
  'pending-review.test.js',
  'conversation-timeline.test.js',
  'session-view.test.js',
  'uri-route.test.js',
  'uri-route-host.test.js',
  'diff-snippet.test.js',
  'pr-edit-api.test.js',
  'searchable-select.test.js',
  'diff-thread-refresh.test.js',
  'ui-polish.test.js',
  'refresh-loading.test.js',
  'dom.test.js',
  'content-bootstrap.test.js',
  'browser-eval.js',
  'modal-pure.test.js',
  'modal-modern-pure.test.js',
  'pr-modal-bundle.test.js',
  'pr-modal-host.test.js',
  'pr-modal-diff-anim.test.js',
  'pr-modal-search.test.js',
  'refactor-memo-store.test.js',
  'memo-render-count.test.js',
  'verify-manifest.js',
];

const combined = [];

for (const file of tests) {
  const result = spawnSync(process.execPath, ['--import', 'tsx', path.join(__dirname, file)], {
    encoding: 'utf8',
    env: { ...process.env, PRP_SCRATCH: SCRATCH },
  });
  const out = (result.stdout || '') + (result.stderr || '');
  combined.push(`=== ${file} ===\n${out}`);
  if (result.status !== 0) {
    process.stderr.write(out);
    process.exit(result.status);
  }
}

const testOutput = combined.join('\n');
fs.writeFileSync(path.join(SCRATCH, 'test-output.txt'), testOutput);
fs.writeFileSync(path.join(SCRATCH, 'pr-modal-unit.log'), testOutput);

const treeMatch = testOutput.match(/--- serialized tree ---\n([\s\S]+?)(?:\n===|\n$|$)/);
if (treeMatch) {
  fs.writeFileSync(path.join(SCRATCH, 'tree-output.txt'), treeMatch[1].trim() + '\n');
}

const browserEvalPath = path.join(SCRATCH, 'browser-eval.log');
if (!fs.existsSync(browserEvalPath)) {
  // browser-eval writes to old path sometimes — rewrite from suite output
  const m = testOutput.match(/=== browser-eval\.js ===\n([\s\S]*?)(?=\n=== |\n$)/);
  if (m) fs.writeFileSync(browserEvalPath, m[1]);
}

console.log(testOutput);
console.log(`\nWrote verification logs to ${SCRATCH}`);
