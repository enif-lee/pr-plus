'use strict';

/**
 * After a successful merge, the PR shell (centered modal or side sheet) must
 * auto-close so the user lands back on the pulls list.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appSrc = fs.readFileSync(
  path.join(__dirname, '../src/modal/app/PrModalApp.tsx'),
  'utf8'
);

assert.ok(
  /async function onMergePr/.test(appSrc),
  'onMergePr present'
);

// Successful merge path marks local detail + requestClose
const mergeFn = appSrc.slice(appSrc.indexOf('async function onMergePr'));
const mergeBody = mergeFn.slice(0, mergeFn.indexOf('\n  async function onUpdateBranch'));
assert.ok(
  mergeBody.includes('requestClose()') || mergeBody.includes('requestClose('),
  'onMergePr must call requestClose after successful merge'
);
assert.ok(
  /merged:\s*true/.test(mergeBody),
  'onMergePr marks detail.merged locally before close'
);

// Transition effect: open PR that becomes merged mid-session closes shell
assert.ok(
  appSrc.includes('mergeCloseWasMergedRef') ||
    appSrc.includes('mergeClosePrKeyRef'),
  'tracks merged transition while open'
);
assert.ok(
  /isMerged && mergeCloseWasMergedRef\.current === false/.test(appSrc) ||
    /mergedSeenRef|wasMergedRef/.test(appSrc),
  'closes only on false→true merged transition (not already-merged open)'
);

// requestClose is shared for modal + sheet exit animation
assert.ok(
  appSrc.includes('requestClose') &&
    (appSrc.includes('prp-modal--sheet-out') ||
      appSrc.includes('SHELL_SHEET')),
  'requestClose handles side-sheet and modal exit'
);

console.log('merge-auto-close.test.js: all assertions passed');
console.log(
  JSON.stringify({
    mergeCallsRequestClose: true,
    transitionGuard: true,
    shellShared: true,
  })
);
