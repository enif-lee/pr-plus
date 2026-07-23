'use strict';

/**
 * After a successful close or merge, the PR shell (centered modal or side sheet)
 * must auto-close so the user lands back on the pulls list.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appSrc = fs.readFileSync(
  path.join(__dirname, '../src/modal/app/PrModalApp.tsx'),
  'utf8'
);

assert.ok(/async function onMergePr/.test(appSrc), 'onMergePr present');
assert.ok(/async function onClosePr/.test(appSrc), 'onClosePr present');

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

// Successful close path same contract
const closeFn = appSrc.slice(appSrc.indexOf('async function onClosePr'));
const closeBody = closeFn.slice(0, closeFn.indexOf('\n  async function onReopenPr'));
assert.ok(
  closeBody.includes('requestClose()') || closeBody.includes('requestClose('),
  'onClosePr must call requestClose after successful close'
);
assert.ok(
  /state:\s*['"]closed['"]/.test(closeBody),
  'onClosePr marks detail.state closed locally before close'
);

// Transition effect: open PR that becomes closed/merged mid-session closes shell
assert.ok(
  appSrc.includes('terminalCloseWasTerminalRef') ||
    appSrc.includes('terminalClosePrKeyRef'),
  'tracks terminal (closed/merged) transition while open'
);
assert.ok(
  /isTerminal && terminalCloseWasTerminalRef\.current === false/.test(appSrc),
  'closes only on open→terminal transition (not already-closed open)'
);
assert.ok(
  appSrc.includes("toLowerCase() === 'closed'") &&
    appSrc.includes('detail.merged'),
  'terminal state includes closed and merged'
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
    closeCallsRequestClose: true,
    transitionGuard: true,
    shellShared: true,
  })
);
