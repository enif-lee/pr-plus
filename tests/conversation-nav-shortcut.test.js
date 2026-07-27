/**
 * Conversation: Opt+Arrow scroll + Opt+J/K comment step.
 */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  resolveModalShortcutAction,
  stepConversationCommentFocus,
  listConversationCommentFocusTargets,
  applyScrollerDelta,
  CONVERSATION_SCROLL_SHORTCUT,
  STEP_NAV_SHORTCUT,
} = require('../src/modal/lib/shortcut-policy.ts');

const conv = { layoutMode: 'centered', editableTarget: false, mod: false };

// --- Opt arrow → conversation scroll actions ---
assert.equal(
  resolveModalShortcutAction({
    ...conv,
    alt: true,
    shift: false,
    key: 'ArrowUp',
    code: 'ArrowUp',
  }),
  CONVERSATION_SCROLL_SHORTCUT.optPrev.action
);
assert.equal(
  resolveModalShortcutAction({
    ...conv,
    alt: true,
    shift: false,
    key: 'ArrowDown',
    code: 'ArrowDown',
  }),
  CONVERSATION_SCROLL_SHORTCUT.optNext.action
);
assert.equal(
  resolveModalShortcutAction({
    ...conv,
    alt: true,
    shift: true,
    key: 'ArrowUp',
    code: 'ArrowUp',
  }),
  CONVERSATION_SCROLL_SHORTCUT.pagePrev.action
);
assert.equal(
  resolveModalShortcutAction({
    ...conv,
    alt: true,
    shift: true,
    key: 'ArrowDown',
    code: 'ArrowDown',
  }),
  CONVERSATION_SCROLL_SHORTCUT.pageNext.action
);

// Diff still owns selection jump / page on Diff layout
assert.equal(
  resolveModalShortcutAction({
    layoutMode: 'diff',
    editableTarget: false,
    mod: false,
    alt: true,
    shift: false,
    key: 'ArrowDown',
    code: 'ArrowDown',
  }),
  'optArrowScrollSelectNext'
);

// --- Opt J/K → step nav on conversation ---
assert.equal(
  resolveModalShortcutAction({
    ...conv,
    alt: true,
    shift: false,
    key: 'j',
    code: 'KeyJ',
  }),
  STEP_NAV_SHORTCUT.next.action
);
assert.equal(
  resolveModalShortcutAction({
    ...conv,
    alt: true,
    shift: false,
    key: 'k',
    code: 'KeyK',
  }),
  STEP_NAV_SHORTCUT.prev.action
);

// Blocked while typing (unless Find open)
assert.equal(
  resolveModalShortcutAction({
    ...conv,
    alt: true,
    shift: false,
    key: 'j',
    code: 'KeyJ',
    editableTarget: true,
  }),
  null
);

// --- stepConversationCommentFocus ---
const items = [
  { kind: 'issue-comment', id: 1 },
  { kind: 'review', id: 2 },
  { kind: 'review-group', id: 'g', pending: true },
  { kind: 'issue-comment', id: 3 },
];
const targets = listConversationCommentFocusTargets(items);
assert.equal(targets.length, 3);
assert.equal(targets[0].anchor, 'issue-comment:1');

// Seed first on down
const first = stepConversationCommentFocus(items, null, 1);
assert.equal(first.anchor, 'issue-comment:1');
// Seed last on up
const last = stepConversationCommentFocus(items, null, -1);
assert.equal(last.anchor, 'issue-comment:3');
// Step wrap
const next = stepConversationCommentFocus(items, 'issue-comment:3', 1);
assert.equal(next.anchor, 'issue-comment:1');
const prev = stepConversationCommentFocus(items, 'issue-comment:1', -1);
assert.equal(prev.anchor, 'issue-comment:3');

// --- review-group → included threads only (no per-reply steps) ---
const withThreads = [
  {
    kind: 'review-group',
    id: 10,
    threads: [
      {
        kind: 'review-thread',
        id: 100,
        replies: [
          { id: 101, body: 'r1' },
          { id: 102, body: 'r2' },
        ],
      },
      {
        kind: 'review-thread',
        id: 200,
        replies: [{ id: 201, body: 'r3' }],
      },
    ],
  },
  {
    kind: 'review-thread',
    id: 300,
    replies: [{ id: 301, body: 'solo-reply' }],
  },
];
const dfs = listConversationCommentFocusTargets(withThreads).map((t) => t.anchor);
assert.deepEqual(
  dfs,
  [
    'review-group:10',
    'review-comment:100',
    'review-comment:200',
    'review-comment:300',
  ],
  'group → each thread unit (replies not separate stops)'
);
// Stepping from group lands on first included thread
assert.equal(
  stepConversationCommentFocus(withThreads, 'review-group:10', 1).anchor,
  'review-comment:100'
);
// Next thread unit (skip replies of 100)
assert.equal(
  stepConversationCommentFocus(withThreads, 'review-comment:100', 1).anchor,
  'review-comment:200'
);
// Standalone thread is one stop even if it has replies
assert.equal(
  stepConversationCommentFocus(withThreads, 'review-comment:200', 1).anchor,
  'review-comment:300'
);

// applyScrollerDelta clamp
const el = { scrollTop: 0, clientHeight: 100, scrollHeight: 500 };
assert.equal(applyScrollerDelta(el, 200), 200);
assert.equal(applyScrollerDelta(el, 9999), 400);
assert.equal(applyScrollerDelta(el, -9999), 0);

// --- App wiring ---
const appSrc = fs.readFileSync(
  path.join(__dirname, '../src/modal/app/PrModalApp.tsx'),
  'utf8'
);
assert.ok(appSrc.includes('navConversationComment'));
assert.ok(appSrc.includes('scrollConversationPanel'));
assert.ok(appSrc.includes("case 'scrollConversationOptNext':"));
assert.ok(appSrc.includes('stepConversationCommentFocus'));
assert.ok(
  appSrc.includes('conversationCommentPageOrder') ||
    appSrc.includes('partitionTimelineWithThreadGap'),
  'comment step uses page visual order (top→bottom), not reverseComments flip'
);
// Must not reverse timeline solely from reverseComments for nav order
assert.ok(
  !/const ordered = reverseComments \? timeline : \[\.\.\.timeline\]\.reverse\(\)/.test(
    appSrc
  ),
  'removed reverseComments-based nav order (mismatched page order)'
);

const css = fs.readFileSync(
  path.join(__dirname, '../src/modal/styles.css'),
  'utf8'
);
assert.ok(css.includes('prp-card--kb-focus'));
assert.ok(css.includes('prp-review-group__row--kb-focus'));
assert.ok(
  /prp-card--kb-focus[\s\S]{0,200}outline-offset:\s*-2px/.test(css),
  'kb-focus ring is inset so overflow-x does not clip left/right'
);
assert.ok(
  css.includes('prp-kb-focus-settle') ||
    css.includes('@keyframes prp-kb-focus-settle'),
  'kb-focus ring settles strong → soft via animation'
);
assert.ok(
  appSrc.includes('requestConversationNav') ||
    appSrc.includes('pendingConversationNavAnchor'),
  'next-comment uses scroll-then-focus (pending nav → focus ring)'
);

const vclSrc = fs.readFileSync(
  path.join(__dirname, '../src/modal/views/conversation/VirtualConversationList.tsx'),
  'utf8'
);
assert.ok(
  vclSrc.includes('pendingConversationNavAnchor') ||
    vclSrc.includes('pendingNavAnchor'),
  'VCL scrolls keyboard focus via virtual row index (off-window threads)'
);
assert.ok(
  vclSrc.includes('indexForConversationAnchor') &&
    vclSrc.includes('scrollTopForIndex'),
  'VCL keyboard focus uses same jump path as search'
);
assert.ok(
  vclSrc.includes('scrollChildToScrollerTop') ||
    vclSrc.includes('queryAnchorInScroller'),
  'VCL refines scroll for in-group threads (shared virtual row)'
);
// Opt-hold must not flip overflow on body/conversation (layout shake)
assert.ok(
  !/\.prp-opt-hints-on \.prp-body-panel/.test(css) &&
    !/\.prp-opt-hints-on \.prp-conversation\s*\{/.test(css),
  'opt-hints must not toggle overflow on body-panel/conversation'
);
assert.ok(
  !css.includes('prp-review-thread__item--kb-focus'),
  'no per-comment kb-focus (thread container only)'
);

const convSrc = fs.readFileSync(
  path.join(__dirname, '../src/modal/views/conversation/ConversationView.tsx'),
  'utf8'
);
assert.ok(convSrc.includes('expandFocusedThread'));
assert.ok(
  convSrc.includes('ConversationKbEnterExpand') ||
    convSrc.includes("e.key !== 'Enter'"),
  'Enter expands collapsed thread'
);
assert.ok(convSrc.includes('data-thread-focus-anchor'));
assert.ok(
  convSrc.includes('ConversationKbFocusClassName') ||
    convSrc.includes('useIsConversationKbFocused') ||
    convSrc.includes('ConversationKbFocusHost'),
  'leaf focus subscription for partial re-render'
);
assert.ok(
  !/focusedConversationAnchor\s*=/.test(convSrc),
  'ConversationView does not take focusedConversationAnchor prop'
);

const paletteSrc = fs.readFileSync(
  path.join(__dirname, '../src/modal/lib/command-palette.ts'),
  'utf8'
);
assert.ok(paletteSrc.includes('conv-comment-next'));
assert.ok(paletteSrc.includes('scrollConversationOptNext'));

console.log('conversation-nav-shortcut.test.js: ok');
