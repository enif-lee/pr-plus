/**
 * Conversation-view ⌘⇧C / Ctrl+Shift+C: focus first PR comment/review,
 * re-press clears focus. Pure policy + pick helpers + static wire.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  resolveModalShortcutAction,
  pickConversationCommentFocusTarget,
  conversationCommentFocusAnchor,
} = require('../src/modal/pure/shortcut-policy.js');

const base = { mod: true, shift: true, key: 'c', paletteOpen: false };

// Unfocused → focus action
assert.equal(
  resolveModalShortcutAction({ ...base, conversationCommentFocused: false }),
  'focusConversationComment'
);
assert.equal(
  resolveModalShortcutAction({ ...base, conversationCommentFocused: undefined }),
  'focusConversationComment'
);

// Already focused → toggle off
assert.equal(
  resolveModalShortcutAction({ ...base, conversationCommentFocused: true }),
  'clearConversationCommentFocus'
);

// Typing in field → no action
assert.equal(
  resolveModalShortcutAction({
    ...base,
    editableTarget: true,
    conversationCommentFocused: false,
  }),
  null
);
assert.equal(
  resolveModalShortcutAction({
    ...base,
    editableTarget: true,
    conversationCommentFocused: true,
  }),
  null
);

// Palette owns keyboard → no action
assert.equal(
  resolveModalShortcutAction({
    ...base,
    paletteOpen: true,
    conversationCommentFocused: false,
  }),
  null
);

// Chord is a mod(+shift) combo, not bare letter
assert.equal(
  resolveModalShortcutAction({
    mod: false,
    shift: false,
    key: 'c',
    conversationCommentFocused: false,
  }),
  null
);

// No collision with shipped combos
assert.equal(
  resolveModalShortcutAction({ mod: true, shift: false, key: 'k' }),
  'openPalette'
);
assert.equal(
  resolveModalShortcutAction({ mod: true, shift: false, key: '.' }),
  'toggleDiff'
);
assert.equal(
  resolveModalShortcutAction({ mod: true, shift: false, key: 'f' }),
  'openSearch'
);
assert.equal(
  resolveModalShortcutAction({ mod: true, shift: true, key: 'f' }),
  'toggleFullscreen'
);
assert.notEqual(
  resolveModalShortcutAction({ ...base }),
  'openPalette'
);
assert.notEqual(
  resolveModalShortcutAction({ ...base }),
  'toggleDiff'
);
assert.notEqual(
  resolveModalShortcutAction({ ...base }),
  'openSearch'
);
assert.notEqual(
  resolveModalShortcutAction({ ...base }),
  'toggleFullscreen'
);

// pickConversationCommentFocusTarget walks real timeline shapes
{
  const target = pickConversationCommentFocusTarget([
    { kind: 'meta', id: 'x' },
    { kind: 'issue-comment', id: 42, body: 'hi' },
    { kind: 'review', id: 9 },
  ]);
  assert.ok(target);
  assert.equal(target.id, '42');
  assert.equal(target.kind, 'issue-comment');
  assert.equal(target.anchor, 'issue-comment:42');
  assert.equal(
    conversationCommentFocusAnchor({ kind: 'review-thread', id: 7 }),
    'review-comment:7'
  );
  assert.equal(
    conversationCommentFocusAnchor({ kind: 'review-group', id: 3 }),
    'review-group:3'
  );
  // Skip pending review-group
  const skipPending = pickConversationCommentFocusTarget([
    { kind: 'review-group', id: 1, pending: true },
    { kind: 'review', id: 2 },
  ]);
  assert.equal(skipPending.anchor, 'review:2');
  assert.equal(pickConversationCommentFocusTarget([]), null);
}

// Static wire: app key handler dispatches focus/clear; VCL owns scroll
{
  const app = fs.readFileSync(
    path.join(__dirname, '../src/modal/app/PrModalApp.tsx'),
    'utf8'
  );
  assert.ok(
    app.includes("case 'focusConversationComment'"),
    'App handles focusConversationComment'
  );
  assert.ok(
    app.includes("case 'clearConversationCommentFocus'"),
    'App handles clearConversationCommentFocus'
  );
  assert.ok(
    app.includes('focusConversationCommentItem'),
    'App defines focusConversationCommentItem'
  );
  assert.ok(
    app.includes('setConversationCommentFocus(target)'),
    'App sets focused anchor state for ConversationView/VCL'
  );
  // Must NOT one-shot querySelector-scroll from App (virtual list off-window miss)
  const focusFn = app.slice(
    app.indexOf('function focusConversationCommentItem'),
    app.indexOf('function clearConversationCommentFocus')
  );
  // Strip line comments so prose about the old path does not false-positive
  const focusCode = focusFn
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n');
  assert.ok(
    !/\.querySelector\s*\(/.test(focusCode),
    'focusConversationCommentItem must not querySelector-scroll (use VCL path)'
  );
  assert.ok(
    !/queueMicrotask\s*\(/.test(focusCode),
    'focusConversationCommentItem must not microtask-scroll (Diff→Conversation race)'
  );
  assert.ok(
    !/scrollIntoView\s*\(/.test(focusCode),
    'focusConversationCommentItem must not call scrollIntoView directly'
  );
  assert.ok(
    app.includes('conversationCommentFocused'),
    'App passes focused flag into policy'
  );
  assert.ok(
    app.includes('focusedConversationAnchor'),
    'App passes focused anchor to ConversationView'
  );
  assert.ok(
    app.includes('editableTarget'),
    'App reports editable target to policy'
  );
  const conv = fs.readFileSync(
    path.join(__dirname, '../src/modal/views/conversation/ConversationView.tsx'),
    'utf8'
  );
  assert.ok(
    conv.includes('prp-card--kb-focus'),
    'ConversationView marks keyboard-focused row'
  );
  assert.ok(
    conv.includes('focusedConversationAnchor'),
    'ConversationView accepts focusedConversationAnchor'
  );
  assert.ok(
    conv.includes('focusedConversationAnchor || activeAnchor') ||
      conv.includes('focusedConversationAnchor||activeAnchor'),
    'ConversationView wires focused anchor into VCL scrollToAnchor'
  );
  const vcl = fs.readFileSync(
    path.join(__dirname, '../src/modal/views/conversation/VirtualConversationList.tsx'),
    'utf8'
  );
  assert.ok(
    vcl.includes('indexForConversationAnchor'),
    'VCL uses indexForConversationAnchor for scroll'
  );
  assert.ok(
    vcl.includes('scrollToAnchor'),
    'VCL accepts scrollToAnchor'
  );
  assert.ok(
    /el\.scrollTop\s*=/.test(vcl) || vcl.includes('scrollTop = top'),
    'VCL sets scroller.scrollTop for virtual jump'
  );
}

// Real path: pick target + indexForConversationAnchor find off-window row
{
  const {
    buildConversationVirtualRows,
    indexForConversationAnchor,
  } = require('../src/modal/pure/conversation-virtual.js');
  const items = [];
  for (let i = 1; i <= 40; i++) {
    items.push({
      id: i,
      kind: i % 3 === 0 ? 'review-thread' : 'issue-comment',
      body: `comment ${i}`,
      at: `2024-01-${String(i).padStart(2, '0')}T00:00:00Z`,
    });
  }
  // Newest-first timeline (same as buildConversationTimeline sort direction)
  const ordered = items.slice().reverse();
  const target = pickConversationCommentFocusTarget(ordered);
  assert.ok(target, 'picks a focusable comment');
  assert.equal(target.kind, 'issue-comment');
  // First displayed = highest id (39 is review-thread, 40 is issue-comment)
  assert.equal(String(target.id), '40');
  assert.equal(target.anchor, 'issue-comment:40');

  const rows = buildConversationVirtualRows(
    { items: ordered, bottomItems: [] },
    { reverseComments: true }
  );
  const idx = indexForConversationAnchor(rows, target.anchor);
  assert.ok(idx >= 0, 'anchor resolves in virtual rows');
  // Must be past chrome (description/composer/merge) so scroll is non-trivial
  assert.ok(idx >= 3, `focus row index ${idx} should be in timeline region`);
  // A deep row still resolves (virtual off-window)
  const deepAnchor = conversationCommentFocusAnchor(ordered[35]);
  assert.ok(deepAnchor);
  const deepIdx = indexForConversationAnchor(rows, deepAnchor);
  assert.ok(deepIdx >= 0, 'deep off-window anchor still indexable');
  assert.notEqual(deepIdx, idx);
}

console.log('conversation-comment-shortcut.test.js: all assertions passed');
console.log('conversation-comment-shortcut=true');
