/**
 * ⌥↑ / ⌥↓ on Diff: override browser — selection jump + matched scroll.
 */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  resolveModalShortcutAction,
  DIFF_OPT_ARROW_SHORTCUT,
  optArrowScrollDeltaPx,
} = require('../src/modal/lib/shortcut-policy.ts');

assert.equal(DIFF_OPT_ARROW_SHORTCUT.selectionSteps, 8);
assert.equal(DIFF_OPT_ARROW_SHORTCUT.prev.action, 'optArrowScrollSelectPrev');
assert.equal(DIFF_OPT_ARROW_SHORTCUT.next.action, 'optArrowScrollSelectNext');

// Policy: Diff only, not editable
assert.equal(
  resolveModalShortcutAction({
    mod: false,
    alt: true,
    shift: false,
    key: 'ArrowDown',
    code: 'ArrowDown',
    layoutMode: 'diff',
    editableTarget: false,
  }),
  'optArrowScrollSelectNext'
);
assert.equal(
  resolveModalShortcutAction({
    mod: false,
    alt: true,
    shift: false,
    key: 'ArrowUp',
    code: 'ArrowUp',
    layoutMode: 'diff',
    editableTarget: false,
  }),
  'optArrowScrollSelectPrev'
);
// Shift still = page scroll
assert.equal(
  resolveModalShortcutAction({
    mod: false,
    alt: true,
    shift: true,
    key: 'ArrowDown',
    code: 'ArrowDown',
    layoutMode: 'diff',
    editableTarget: false,
  }),
  'scrollDiffPageNext'
);
// Conversation uses Opt-arrow for panel scroll (not Diff selection jump)
assert.equal(
  resolveModalShortcutAction({
    mod: false,
    alt: true,
    shift: false,
    key: 'ArrowDown',
    code: 'ArrowDown',
    layoutMode: 'centered',
    editableTarget: false,
  }),
  'scrollConversationOptNext'
);
// Block while typing
assert.equal(
  resolveModalShortcutAction({
    mod: false,
    alt: true,
    shift: false,
    key: 'ArrowDown',
    code: 'ArrowDown',
    layoutMode: 'diff',
    editableTarget: true,
  }),
  null
);

// Scroll delta: 8 * 22 = 176, capped to half viewport
assert.equal(optArrowScrollDeltaPx(1, 22, 1000), 176);
assert.equal(optArrowScrollDeltaPx(-1, 22, 1000), -176);
assert.equal(optArrowScrollDeltaPx(1, 22, 200), 100, 'capped to ½ viewport');

// App wiring
const appSrc = fs.readFileSync(
  path.join(__dirname, '../src/modal/app/PrModalApp.tsx'),
  'utf8'
);
assert.ok(appSrc.includes('optArrowScrollSelect'));
assert.ok(appSrc.includes("case 'optArrowScrollSelectNext'"));
assert.ok(appSrc.includes("case 'optArrowScrollSelectPrev'"));
assert.ok(
  /function optArrowScrollSelect[\s\S]*applySelectionKeyboardMove/.test(appSrc),
  'moves selection by steps'
);
assert.ok(
  /function optArrowScrollSelect[\s\S]*optArrowScrollDeltaPx|scrollTop/.test(
    appSrc
  ),
  'scrolls list'
);

console.log('diff-opt-arrow.test.js: ok');
