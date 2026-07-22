/**
 * Branch copy + per-reviewer re-request (merge box Re-request removed).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  branchRefCopyText,
  copyTextToClipboard,
} = require('../src/modal/lib/copy-to-clipboard.ts');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

// --- pure copy helper ---
assert.equal(branchRefCopyText('  feature/x  '), 'feature/x');
assert.equal(branchRefCopyText(''), '');
assert.equal(branchRefCopyText(null), '');

async function runAsyncCopyTests() {
  const writes = [];
  const ok = await copyTextToClipboard('demo/base', {
    clipboard: {
      async writeText(t) {
        writes.push(t);
      },
    },
  });
  assert.equal(ok, true);
  assert.deepEqual(writes, ['demo/base']);

  const emptyOk = await copyTextToClipboard('', {
    clipboard: { async writeText() {} },
  });
  assert.equal(emptyOk, false);

  const { JSDOM } = require('jsdom');
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  const fallbackOk = await copyTextToClipboard('head-ref', {
    clipboard: null,
    doc: dom.window.document,
  });
  assert.equal(typeof fallbackOk, 'boolean');
}

// --- Header: base + head copy affordances ---
const header = read('src/modal/views/chrome/Header.tsx');
assert.ok(header.includes('copyBranchRef'), 'Header has copyBranchRef');
assert.ok(header.includes("copyBranchRef('base'"), 'base copy');
assert.ok(header.includes("copyBranchRef('head'"), 'head copy');
assert.ok(header.includes('prp-branch-tag__copy-btn'), 'copy button class');
assert.ok(header.includes('copyTextToClipboard') || header.includes('branchRefCopyText'));
assert.ok(header.includes('detail.baseRef') && header.includes('detail.headRef'));

// --- Reviewers widget re-request; merge box without Re-request ---
const meta = read('src/modal/views/conversation/MetaList.tsx');
const conv = read('src/modal/views/conversation/ConversationView.tsx');
const app = read('src/modal/app/PrModalApp.tsx');

assert.ok(meta.includes('onRerequest'), 'MetaList supports onRerequest');
assert.ok(meta.includes('Re-request') || meta.includes('rerequestLabel'));
assert.ok(conv.includes('onRerequestReviewer'), 'ConversationView wires onRerequestReviewer');
assert.ok(conv.includes('onRerequest={'), 'Reviewers MetaList gets onRerequest');
assert.ok(app.includes('onRerequestReviewer'), 'App defines/wires onRerequestReviewer');
assert.ok(app.includes('applyRerequestReviewers'), 'uses existing re-request API path');
assert.ok(app.includes('requestReviewers'), 'REST requestReviewers still used');

// Merge box must not mount Re-request
const mergeIdx = conv.indexOf('prp-merge-box');
assert.ok(mergeIdx >= 0, 'merge box present');
const mergeSlice = conv.slice(mergeIdx, mergeIdx + 3500);
assert.ok(
  !/Re-request/.test(mergeSlice),
  'merge box source has no Re-request button'
);
// Global conversation file may still say Re-request in MetaList label only
assert.ok(
  conv.includes('rerequestLabel="Re-request"') || conv.includes('onRerequest'),
  're-request only via reviewers widget'
);

// Bundle hooks
const bundle = read('src/modal/dist/pr-modal.bundle.js');
assert.ok(
  bundle.includes('prp-branch-tag__copy-btn') || bundle.includes('copyBranchRef'),
  'bundle has branch copy'
);
assert.ok(
  bundle.includes('onRerequestReviewer') || bundle.includes('Re-request'),
  'bundle has reviewer re-request'
);

runAsyncCopyTests()
  .then(() => {
    console.log('branch-rerequest.test.js: all assertions passed');
    console.log('copy-helper=true');
    console.log('header-base-head-copy=true');
    console.log('reviewers-rerequest=true');
    console.log('merge-box-no-rerequest=true');
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
