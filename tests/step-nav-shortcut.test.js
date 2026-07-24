/**
 * Option/Alt+J/K step-nav for Find hits and review threads.
 * Pure policy + structural wire (StepNav tips, App cases).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  STEP_NAV_SHORTCUT,
  normalizeShortcutKey,
  stepNavShortcutLabel,
  resolveModalShortcutAction,
} = require('../src/modal/lib/shortcut-policy.ts');

// --- labels ---
assert.equal(stepNavShortcutLabel('prev', true), '⌥K');
assert.equal(stepNavShortcutLabel('next', true), '⌥J');
assert.equal(stepNavShortcutLabel('prev', false), 'Alt+K');
assert.equal(stepNavShortcutLabel('next', false), 'Alt+J');
assert.equal(STEP_NAV_SHORTCUT.prev.action, 'stepNavPrev');
assert.equal(STEP_NAV_SHORTCUT.next.action, 'stepNavNext');

// --- Option produces special glyphs; code wins ---
assert.equal(
  normalizeShortcutKey({ key: '∆', code: 'KeyJ', alt: true }),
  'j'
);
assert.equal(
  normalizeShortcutKey({ key: '˚', code: 'KeyK', alt: true }),
  'k'
);
assert.equal(normalizeShortcutKey({ key: 'j', alt: false }), 'j');

// --- resolve: Find open ---
assert.equal(
  resolveModalShortcutAction({
    mod: false,
    shift: false,
    alt: true,
    key: '∆',
    code: 'KeyJ',
    searchOpen: true,
    editableTarget: true, // Find input focused
  }),
  'stepNavNext'
);
assert.equal(
  resolveModalShortcutAction({
    mod: false,
    shift: false,
    alt: true,
    key: 'k',
    code: 'KeyK',
    searchOpen: true,
    editableTarget: true,
  }),
  'stepNavPrev'
);

// --- resolve: Diff thread nav ---
assert.equal(
  resolveModalShortcutAction({
    mod: false,
    shift: false,
    alt: true,
    key: 'j',
    code: 'KeyJ',
    searchOpen: false,
    layoutMode: 'diff',
    editableTarget: false,
  }),
  'stepNavNext'
);
assert.equal(
  resolveModalShortcutAction({
    mod: false,
    shift: false,
    alt: true,
    key: 'k',
    code: 'KeyK',
    searchOpen: false,
    layoutMode: 'diff',
  }),
  'stepNavPrev'
);

// Conversation (no find) → no step nav
assert.equal(
  resolveModalShortcutAction({
    mod: false,
    shift: false,
    alt: true,
    key: 'j',
    code: 'KeyJ',
    searchOpen: false,
    layoutMode: 'centered',
  }),
  null
);

// Typing in non-search editable → no
assert.equal(
  resolveModalShortcutAction({
    mod: false,
    shift: false,
    alt: true,
    key: 'j',
    code: 'KeyJ',
    searchOpen: false,
    layoutMode: 'diff',
    editableTarget: true,
  }),
  null
);

// Palette owns keyboard
assert.equal(
  resolveModalShortcutAction({
    mod: false,
    shift: false,
    alt: true,
    key: 'j',
    code: 'KeyJ',
    searchOpen: true,
    paletteOpen: true,
  }),
  null
);

// No collision with ⌘K palette
assert.equal(
  resolveModalShortcutAction({
    mod: true,
    shift: false,
    alt: false,
    key: 'k',
  }),
  'openPalette'
);

// pure JS mirror
const pure = require('../src/modal/pure/shortcut-policy.js');
assert.equal(
  pure.resolveModalShortcutAction({
    mod: false,
    shift: false,
    alt: true,
    code: 'KeyJ',
    key: '∆',
    searchOpen: true,
  }),
  'stepNavNext'
);
assert.equal(pure.stepNavShortcutLabel('prev', true), '⌥K');

// --- structure: App + StepNav + DiffToolbar + SearchBar ---
const root = path.join(__dirname, '..');
const app = fs.readFileSync(
  path.join(root, 'src/modal/app/PrModalApp.tsx'),
  'utf8'
);
const stepNav = fs.readFileSync(
  path.join(root, 'src/modal/components/common/StepNav.tsx'),
  'utf8'
);
const toolbar = fs.readFileSync(
  path.join(root, 'src/modal/views/chrome/DiffToolbar.tsx'),
  'utf8'
);
const searchBar = fs.readFileSync(
  path.join(root, 'src/modal/views/chrome/SearchBar.tsx'),
  'utf8'
);

assert.ok(app.includes("case 'stepNavPrev'"), 'App handles stepNavPrev');
assert.ok(app.includes("case 'stepNavNext'"), 'App handles stepNavNext');
assert.ok(app.includes('navSearch'), 'App wires navSearch');
assert.ok(app.includes('navComment'), 'App wires navComment');
assert.ok(app.includes('code: e.code') || app.includes('code: e.code,'));
assert.ok(app.includes('searchOpen:'));

assert.ok(stepNav.includes('TipPopover'), 'StepNav shows TipPopover');
assert.ok(stepNav.includes('prevShortcut'));
assert.ok(stepNav.includes('nextShortcut'));
assert.ok(stepNav.includes('shortcut={prevShortcut'));

assert.ok(toolbar.includes('stepNavShortcutLabel'));
assert.ok(toolbar.includes('prevShortcut={threadPrevShortcut}'));
assert.ok(searchBar.includes('stepNavShortcutLabel'));
assert.ok(searchBar.includes('prevShortcut={prevShortcut}'));

console.log('step-nav-shortcut.test.js: all assertions passed');
