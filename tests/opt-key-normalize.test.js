/**
 * Fundamental Option/Alt key normalization: KeyboardEvent.code always wins
 * so macOS Option glyphs never break product chords.
 */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  keyTokenFromCode,
  isOptionGlyphKey,
  normalizeShortcutKey,
  shortcutKeyFromEvent,
  resolveModalShortcutAction,
  TOGGLE_SIDE_PANEL_SHORTCUT,
  STEP_NAV_SHORTCUT,
  REVIEW_FILTER_SHORTCUT,
  TOGGLE_VIEWED_SHORTCUT,
  FILE_NAV_SHORTCUT,
  DIFF_OPT_ARROW_SHORTCUT,
} = require('../src/modal/lib/shortcut-policy.ts');

const {
  resolvePrModalOptAction,
} = require('../src/modal/lib/command-palette.ts');

// --- code → token ---
assert.equal(keyTokenFromCode('KeyC'), 'c');
assert.equal(keyTokenFromCode('KeyB'), 'b');
assert.equal(keyTokenFromCode('KeyJ'), 'j');
assert.equal(keyTokenFromCode('Digit3'), '3');
assert.equal(keyTokenFromCode('BracketLeft'), '[');
assert.equal(keyTokenFromCode('Period'), '.');
assert.equal(keyTokenFromCode('ArrowUp'), 'arrowup');
assert.equal(keyTokenFromCode('Escape'), 'escape');
assert.equal(keyTokenFromCode('Enter'), 'enter');
assert.equal(keyTokenFromCode(''), null);
assert.equal(keyTokenFromCode('AltLeft'), null);

// --- glyph detection ---
assert.equal(isOptionGlyphKey('ç'), true);
assert.equal(isOptionGlyphKey('∫'), true);
assert.equal(isOptionGlyphKey('∆'), true);
assert.equal(isOptionGlyphKey('®'), true);
assert.equal(isOptionGlyphKey('c'), false);
assert.equal(isOptionGlyphKey('1'), false);
assert.equal(isOptionGlyphKey('['), false);
assert.equal(isOptionGlyphKey('Escape'), false);

// --- normalize always prefers code (even without alt flag) ---
const macGlyphs = [
  { key: 'ç', code: 'KeyC', want: 'c' }, // ⌥C
  { key: '∫', code: 'KeyB', want: 'b' }, // ⌥B
  { key: '∆', code: 'KeyJ', want: 'j' }, // ⌥J
  { key: '˚', code: 'KeyK', want: 'k' }, // ⌥K
  { key: '®', code: 'KeyR', want: 'r' }, // ⌥R / ⌥⇧R
  { key: '¨', code: 'KeyU', want: 'u' }, // ⌥U
  { key: 'π', code: 'KeyP', want: 'p' }, // ⌥P
  { key: '´', code: 'KeyE', want: 'e' }, // ⌥E
  { key: '†', code: 'KeyT', want: 't' }, // ⌥T
  { key: '¬', code: 'KeyL', want: 'l' }, // ⌥L
  { key: 'µ', code: 'KeyM', want: 'm' }, // ⌥M
  { key: 'å', code: 'KeyA', want: 'a' }, // ⌥A
  { key: 'ß', code: 'KeyS', want: 's' }, // ⌥S
  { key: '∂', code: 'KeyD', want: 'd' }, // ⌥D
  { key: 'ƒ', code: 'KeyF', want: 'f' }, // ⌥F
  { key: '≈', code: 'KeyX', want: 'x' }, // ⌥X
  { key: '“', code: 'BracketLeft', want: '[' },
  { key: '‘', code: 'BracketRight', want: ']' },
  { key: '≥', code: 'Period', want: '.' },
  { key: '¡', code: 'Digit1', want: '1' },
];

for (const g of macGlyphs) {
  assert.equal(
    normalizeShortcutKey({ key: g.key, code: g.code, alt: true }),
    g.want,
    `alt+${g.code} glyph ${g.key} → ${g.want}`
  );
  // Code wins even when alt flag is false
  assert.equal(
    normalizeShortcutKey({ key: g.key, code: g.code, alt: false }),
    g.want,
    `code ${g.code} wins without alt flag`
  );
}

// shortcutKeyFromEvent
assert.equal(
  shortcutKeyFromEvent({ key: 'ç', code: 'KeyC', altKey: true }),
  'c'
);
assert.equal(
  shortcutKeyFromEvent({ key: 'c', code: 'KeyC', altKey: false }),
  'c'
);

// --- product chords resolve with macOS glyphs ---
const layoutDiff = { layoutMode: 'diff', editableTarget: false };

assert.equal(
  resolveModalShortcutAction({
    ...layoutDiff,
    alt: true,
    mod: false,
    shift: false,
    key: '∫',
    code: 'KeyB',
  }),
  TOGGLE_SIDE_PANEL_SHORTCUT.action
);

assert.equal(
  resolveModalShortcutAction({
    ...layoutDiff,
    alt: true,
    mod: false,
    shift: false,
    key: '∆',
    code: 'KeyJ',
    searchOpen: false,
  }),
  STEP_NAV_SHORTCUT.next.action
);

assert.equal(
  resolveModalShortcutAction({
    ...layoutDiff,
    alt: true,
    mod: false,
    shift: false,
    key: '˚',
    code: 'KeyK',
  }),
  STEP_NAV_SHORTCUT.prev.action
);

assert.equal(
  resolveModalShortcutAction({
    ...layoutDiff,
    alt: true,
    mod: false,
    shift: false,
    key: '¨',
    code: 'KeyU',
  }),
  REVIEW_FILTER_SHORTCUT.unresolved.action
);

assert.equal(
  resolveModalShortcutAction({
    ...layoutDiff,
    alt: true,
    mod: false,
    shift: false,
    key: '®',
    code: 'KeyR',
  }),
  REVIEW_FILTER_SHORTCUT.resolved.action
);

assert.equal(
  resolveModalShortcutAction({
    ...layoutDiff,
    alt: true,
    mod: false,
    shift: false,
    key: 'π',
    code: 'KeyP',
  }),
  REVIEW_FILTER_SHORTCUT.pending.action
);

assert.equal(
  resolveModalShortcutAction({
    ...layoutDiff,
    alt: true,
    mod: false,
    shift: true,
    key: '®',
    code: 'KeyR',
  }),
  TOGGLE_VIEWED_SHORTCUT.action
);

assert.equal(
  resolveModalShortcutAction({
    ...layoutDiff,
    alt: true,
    mod: false,
    shift: true,
    key: '“',
    code: 'BracketLeft',
  }),
  FILE_NAV_SHORTCUT.prev.action
);

assert.equal(
  resolveModalShortcutAction({
    ...layoutDiff,
    alt: true,
    mod: false,
    shift: false,
    key: '¿',
    code: 'ArrowUp',
  }),
  DIFF_OPT_ARROW_SHORTCUT.prev.action
);

assert.equal(
  resolveModalShortcutAction({
    alt: true,
    mod: false,
    shift: false,
    key: '≥',
    code: 'Period',
  }),
  'toggleDiff'
);

assert.equal(
  resolveModalShortcutAction({
    alt: true,
    mod: false,
    shift: true,
    key: 'ç',
    code: 'KeyC',
  }),
  'focusConversationComment'
);

// Stack digit with glyph
assert.equal(
  resolveModalShortcutAction({
    alt: true,
    mod: false,
    shift: false,
    key: '¡',
    code: 'Digit1',
    editableTarget: false,
  }),
  'navStackDigit1'
);

// Opt peer actions: match by code despite glyph key
const peerEditBody = resolvePrModalOptAction({
  alt: true,
  shift: false,
  mod: false,
  key: '´',
  code: 'KeyE',
});
assert.ok(peerEditBody);
assert.equal(peerEditBody.action, 'editBody');

const peerFullscreen = resolvePrModalOptAction({
  alt: true,
  shift: true,
  mod: false,
  key: 'ƒ',
  code: 'KeyF',
});
assert.ok(peerFullscreen);
assert.equal(peerFullscreen.action, 'toggleFullscreen');

const peerMerge = resolvePrModalOptAction({
  alt: true,
  shift: true,
  mod: false,
  key: 'µ',
  code: 'KeyM',
});
assert.ok(peerMerge);
assert.equal(peerMerge.action, 'mergePr');

// Glyph alone without code cannot invent a letter
assert.equal(
  normalizeShortcutKey({ key: 'ç', code: '', alt: true }),
  'ç'
);

// --- App wiring: handler uses shortcutKeyFromEvent / normalizeShortcutKey ---
const appSrc = fs.readFileSync(
  path.join(__dirname, '../src/modal/app/PrModalApp.tsx'),
  'utf8'
);
assert.ok(
  appSrc.includes('shortcutKeyFromEvent') || appSrc.includes('normalizeShortcutKey'),
  'App normalizes keys via shared helper'
);
assert.ok(
  /const key\s*=/.test(appSrc) &&
    (appSrc.includes('shortcutKeyFromEvent(e)') ||
      appSrc.includes('normalizeShortcutKey({')),
  'keydown uses normalized key, not raw e.key alone'
);

console.log('opt-key-normalize.test.js: ok');
