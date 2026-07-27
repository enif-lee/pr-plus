/**
 * Context-thread shortcuts: ⌥F fold · ⌥D Diff · ⌥C comment · ⌥⌃R resolve
 * Active on Conversation focus and Diff comment nav.
 */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  resolveModalShortcutAction,
  CONTEXT_THREAD_SHORTCUT,
  FOCUSED_THREAD_SHORTCUT,
} = require('../src/modal/lib/shortcut-policy.ts');

assert.equal(CONTEXT_THREAD_SHORTCUT.fold.action, 'contextThreadFold');
assert.equal(CONTEXT_THREAD_SHORTCUT.comment.action, 'contextThreadComment');
assert.equal(CONTEXT_THREAD_SHORTCUT.resolve.chord, 'opt+ctrl+r');
// Back-compat alias
assert.equal(FOCUSED_THREAD_SHORTCUT.fold.action, CONTEXT_THREAD_SHORTCUT.fold.action);

const base = {
  mod: false,
  shift: false,
  alt: true,
  ctrl: false,
  editableTarget: false,
  contextThreadActive: true,
  layoutMode: 'centered',
};

assert.equal(
  resolveModalShortcutAction({ ...base, key: 'f', code: 'KeyF' }),
  'contextThreadFold'
);
assert.equal(
  resolveModalShortcutAction({ ...base, key: 'd', code: 'KeyD' }),
  'contextThreadGotoDiff'
);
assert.equal(
  resolveModalShortcutAction({ ...base, key: 'c', code: 'KeyC' }),
  'contextThreadComment'
);
// Second stage: still fires while typing in reply
assert.equal(
  resolveModalShortcutAction({
    ...base,
    key: 'c',
    code: 'KeyC',
    editableTarget: true,
  }),
  'contextThreadComment'
);
assert.equal(
  resolveModalShortcutAction({
    ...base,
    key: 'r',
    code: 'KeyR',
    ctrl: true,
  }),
  'contextThreadResolve'
);

// Diff layout too
assert.equal(
  resolveModalShortcutAction({
    ...base,
    layoutMode: 'diff',
    key: 'f',
    code: 'KeyF',
  }),
  'contextThreadFold'
);
assert.equal(
  resolveModalShortcutAction({
    ...base,
    layoutMode: 'diff',
    key: 'c',
    code: 'KeyC',
  }),
  'contextThreadComment'
);
assert.equal(
  resolveModalShortcutAction({
    ...base,
    layoutMode: 'diff',
    key: 'r',
    code: 'KeyR',
    ctrl: true,
  }),
  'contextThreadResolve'
);

// Inactive context → no steal (except Diff filter still uses ⌥R without ctrl)
assert.equal(
  resolveModalShortcutAction({
    ...base,
    contextThreadActive: false,
    conversationCommentFocused: false,
    key: 'f',
    code: 'KeyF',
    layoutMode: 'centered',
  }),
  null
);
// Diff filter ⌥R (no ctrl) still works when no context
assert.equal(
  resolveModalShortcutAction({
    mod: false,
    shift: false,
    alt: true,
    ctrl: false,
    editableTarget: false,
    contextThreadActive: false,
    layoutMode: 'diff',
    key: 'r',
    code: 'KeyR',
  }),
  'toggleReviewFilterResolved'
);
// With context + ctrl, resolve wins over filter
assert.equal(
  resolveModalShortcutAction({
    mod: false,
    shift: false,
    alt: true,
    ctrl: true,
    editableTarget: false,
    contextThreadActive: true,
    layoutMode: 'diff',
    key: 'r',
    code: 'KeyR',
  }),
  'contextThreadResolve'
);

// App wiring
const app = fs.readFileSync(
  path.join(__dirname, '../src/modal/app/PrModalApp.tsx'),
  'utf8'
);
assert.ok(app.includes('runContextThreadAction'));
assert.ok(app.includes('contextThreadFold') || app.includes('contextThreadActive'));
assert.ok(app.includes('onRegisterContextThreadActions'));
assert.ok(app.includes('runDiffContextThreadAction') || app.includes('getActiveDiffContextThread'));
assert.ok(
  app.includes('ctrl: ctrlKey') || app.includes('ctrl: Boolean(e.ctrlKey)'),
  'App passes physical Control for ⌥⌃R'
);
assert.ok(
  app.includes('liveContextThread') || app.includes('liveConvFocus'),
  'keydown computes live contextThreadActive (not stale uiRef)'
);
assert.ok(
  app.includes('setActiveDiffCommentId') || app.includes('activeDiffCommentId'),
  'Diff context id synced for focused-thread tips only'
);

const inline = fs.readFileSync(
  path.join(__dirname, '../src/modal/views/diff/InlineThread.tsx'),
  'utf8'
);
assert.ok(
  inline.includes('isContextThreadCommentActive') ||
    inline.includes('contextActive'),
  'InlineThread gates context tips on active thread only'
);
assert.ok(
  inline.includes('contextActive ?') || inline.includes('{contextActive'),
  'OptBtnHint not rendered on non-focused threads'
);
assert.ok(
  inline.includes('⌥F') || inline.includes('label="⌥F"'),
  'fold control shows ⌥F context tip'
);
assert.ok(
  inline.includes('replyFocused') &&
    (inline.includes('contextActive && replyFocused') ||
      inline.includes('contextActive&&replyFocused')),
  'resolve tip only while reply input is focused'
);

const appEsc = fs.readFileSync(
  path.join(__dirname, '../src/modal/app/PrModalApp.tsx'),
  'utf8'
);
assert.ok(
  /blur\?\.\(\)|focusEl\?\.blur/.test(appEsc) &&
    appEsc.includes('isEditableKeyboardTarget'),
  'Esc on reply input blurs only (does not close sheet/diff)'
);

const css = fs.readFileSync(
  path.join(__dirname, '../src/modal/styles.css'),
  'utf8'
);
assert.ok(
  !/prp-inline-thread__context-hint[\s\S]{0,120}width:\s*0/.test(css),
  'context tip host must not be zero-sized (OptBtnHint hostIsLive)'
);

const ctxDom = fs.readFileSync(
  path.join(__dirname, '../src/modal/lib/context-thread-dom.ts'),
  'utf8'
);
assert.ok(
  ctxDom.includes('prp-body-panel--active'),
  'DOM host query prefers active keep-alive panel (Diff vs Conversation)'
);

assert.ok(
  app.includes('ensureDiffContextThread') ||
    app.includes('getActiveDiffContextThread'),
  'Diff context shortcuts resolve active review thread'
);
assert.ok(
  app.includes('liveLayout') ||
    /layoutMode === LAYOUT_DIFF/.test(app),
  'Diff path uses live layout so keep-alive Conversation does not steal actions'
);

const conv = fs.readFileSync(
  path.join(__dirname, '../src/modal/views/conversation/ConversationView.tsx'),
  'utf8'
);
assert.ok(conv.includes('onRegisterContextThreadActions'));
assert.ok(conv.includes('focusContextThreadReplyAfterPaint'));

const vdiff = fs.readFileSync(
  path.join(__dirname, '../src/modal/views/diff/VirtualDiff.tsx'),
  'utf8'
);
assert.ok(vdiff.includes('data-thread-focus-anchor'));

console.log('context-thread-shortcut.test.js: ok');
