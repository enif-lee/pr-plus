const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SCRATCH =
  process.env.PRP_SCRATCH ||
  require('node:path').join(require('node:os').tmpdir(), 'pr-plus-test-scratch');
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
  'github-endpoints.test.js',
  'tree.test.js',
  'storage.test.js',
  'service-worker-load.test.js',
  'fetch-pulls.test.js',
  'fetch-pr-detail.test.js',
  'detail-cache.test.js',
  'detail-idb-cache.test.js',
  'review-threads-revalidate.test.js',
  'aside-lists.test.js',
  'conversation-aside-ux.test.js',
  'aside-layout.test.js',
  'floating-scrollbar.test.js',
  'line-selection.test.js',
  'line-selection-move-perf.test.js',
  'draft-stage-cache.test.js',
  'tip-popover-placement.test.js',
  'action-toast.test.js',
  'comment-nav.test.js',
  'md-inline-vs-fence.test.js',
  'review-threads.test.js',
  'review-threads-dual-window.test.js',
  'markdown-composer.test.js',
  'mermaid-lazy.test.js',
  'mermaid-viewer.test.js',
  'composer-attach.test.js',
  'pending-review.test.js',
  'conversation-timeline.test.js',
  'session-view.test.js',
  'shell-preference.test.js',
  'page-embed.test.js',
  'page-embed-scroll.test.js',
  'page-embed-host-lifecycle.test.js',
  'shell-size.test.js',
  'conversation-comment-shortcut.test.js',
  'conversation-nav-shortcut.test.js',
  'opt-key-normalize.test.js',
  'step-nav-shortcut.test.js',
  'pr-view-palette-nav.test.js',
  'confirm-palette-opt.test.js',
  'shell-resize-ui.test.js',
  'side-sheet-toggle.test.js',
  'scroll-lock.test.js',
  'ui-chrome-goal.test.js',
  'branch-rerequest.test.js',
  'merge-box.test.js',
  'merge-auto-close.test.js',
  'checks.test.js',
  'narrow-chrome.test.js',
  'file-nav-layout.test.js',
  'hljs-lazy.test.js',
  'file-nav-ui.test.js',
  'file-tree-ext-filter.test.js',
  'file-order-dfs.test.js',
  'file-nav-scroll-focus.test.js',
  'shortcut-monitor.test.js',
  'diff-palette-commands.test.js',
  'diff-opt-arrow.test.js',
  'uri-route.test.js',
  'uri-route-host.test.js',
  'github-pr-route.test.js',
  'github-pr-route-structure.test.js',
  'github-pr-route-host-softnav.test.js',
  'diff-snippet.test.js',
  'diff-expand-gap.test.js',
  'pr-edit-api.test.js',
  'leave-review-actions.test.js',
  'diff-opt-nav.test.js',
  'review-filter-goto.test.js',
  'single-file-mode.test.js',
  'searchable-select.test.js',
  'diff-thread-refresh.test.js',
  'ui-polish.test.js',
  'stack-strip-path.test.js',
  'comments-page.test.js',
  'diff-commit-filter.test.js',
  'refresh-loading.test.js',
  'dom.test.js',
  'pr-list-focus.test.js',
  'pulls-palette.test.js',
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
  'diff-scroll-perf.test.js',
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
