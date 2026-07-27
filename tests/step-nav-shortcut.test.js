/**
 * Option/Alt+J/K step-nav for Find hits and review threads.
 * Pure policy + structural wire (StepNav tips, App cases).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  STEP_NAV_SHORTCUT,
  FILE_NAV_SHORTCUT,
  normalizeShortcutKey,
  stepNavShortcutLabel,
  fileNavShortcutLabel,
  activeFileNavIndex,
  resolveAdjacentFileNav,
  resolveModalShortcutAction,
  isGithubCommandPaletteOpen,
  touchGithubCommandPaletteOpen,
  shouldIgnoreModalEscapeForGithubPalette,
  __resetGithubPaletteWatchForTests,
  GITHUB_PALETTE_ESCAPE_GRACE_MS,
} = require('../src/modal/lib/shortcut-policy.ts');

// --- labels ---
assert.equal(stepNavShortcutLabel('prev', true), '⌥K');
assert.equal(stepNavShortcutLabel('next', true), '⌥J');
assert.equal(stepNavShortcutLabel('prev', false), 'Alt+K');
assert.equal(stepNavShortcutLabel('next', false), 'Alt+J');
assert.equal(STEP_NAV_SHORTCUT.prev.action, 'stepNavPrev');
assert.equal(STEP_NAV_SHORTCUT.next.action, 'stepNavNext');
assert.equal(fileNavShortcutLabel('prev', true), '⌥⇧[');
assert.equal(fileNavShortcutLabel('next', true), '⌥⇧]');
assert.equal(fileNavShortcutLabel('prev', false), 'Alt+Shift+[');
assert.equal(FILE_NAV_SHORTCUT.next.action, 'navFileNext');
assert.equal(FILE_NAV_SHORTCUT.prev.chord, 'opt+shift+[');
assert.equal(FILE_NAV_SHORTCUT.next.chord, 'opt+shift+]');

// --- file list adjacent from current path ---
{
  const files = [{ path: 'a.ts' }, { filename: 'b.ts' }, { path: 'c.ts' }];
  assert.equal(activeFileNavIndex(files, 'b.ts'), 1);
  assert.deepEqual(resolveAdjacentFileNav(files, 'b.ts', 1), {
    index: 2,
    total: 3,
    path: 'c.ts',
  });
  assert.deepEqual(resolveAdjacentFileNav(files, 'b.ts', -1), {
    index: 0,
    total: 3,
    path: 'a.ts',
  });
  assert.equal(resolveAdjacentFileNav(files, 'missing', 1).path, 'a.ts');
  assert.equal(resolveAdjacentFileNav(files, 'missing', -1).path, 'c.ts');
  assert.equal(resolveAdjacentFileNav(files, 'c.ts', 1).path, 'a.ts'); // wrap
}

// --- ⌥⇧[ / ] file nav (Diff only); plain ⌥[ / ] stays PR adjacent ---
assert.equal(
  resolveModalShortcutAction({
    mod: false,
    alt: true,
    shift: true,
    key: ']',
    code: 'BracketRight',
    layoutMode: 'diff',
    editableTarget: false,
  }),
  'navFileNext'
);
assert.equal(
  resolveModalShortcutAction({
    mod: false,
    alt: true,
    shift: true,
    key: '[',
    code: 'BracketLeft',
    layoutMode: 'diff',
    editableTarget: false,
  }),
  'navFilePrev'
);
assert.equal(
  resolveModalShortcutAction({
    mod: false,
    alt: true,
    shift: true,
    key: ']',
    code: 'BracketRight',
    layoutMode: 'conversation',
    editableTarget: false,
  }),
  null,
  'file nav only on Diff'
);
// Option+Shift may emit odd key; code must win
assert.equal(
  resolveModalShortcutAction({
    mod: false,
    alt: true,
    shift: true,
    key: '’',
    code: 'BracketRight',
    layoutMode: 'diff',
    editableTarget: false,
  }),
  'navFileNext'
);
assert.equal(
  resolveModalShortcutAction({
    mod: false,
    alt: true,
    shift: false,
    key: '[',
    code: 'BracketLeft',
    layoutMode: 'diff',
    editableTarget: false,
  }),
  'navAdjacentPrev',
  'plain ⌥[ is still PR adjacent'
);
assert.equal(
  resolveModalShortcutAction({
    mod: false,
    alt: true,
    shift: false,
    key: ']',
    code: 'BracketRight',
    layoutMode: 'diff',
    editableTarget: false,
  }),
  'navAdjacentNext',
  'plain ⌥] is still PR adjacent'
);
// plain ⌥J still review/find step
assert.equal(
  resolveModalShortcutAction({
    mod: false,
    alt: true,
    shift: false,
    key: 'j',
    code: 'KeyJ',
    layoutMode: 'diff',
    editableTarget: false,
  }),
  'stepNavNext'
);

// GitHub native command palette owns keyboard (incl. Escape → do not close pr+)
assert.equal(
  resolveModalShortcutAction({
    githubPaletteOpen: true,
    key: 'Escape',
  }),
  null
);
assert.equal(
  resolveModalShortcutAction({
    githubPaletteOpen: true,
    key: 'escape',
    paletteOpen: false,
  }),
  null
);
assert.equal(typeof isGithubCommandPaletteOpen, 'function');
assert.equal(typeof shouldIgnoreModalEscapeForGithubPalette, 'function');
assert.equal(typeof touchGithubCommandPaletteOpen, 'function');
{
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM(
    `<!doctype html><html><body>
      <dialog id="command-palette-pjax-container">
        <input id="gh-palette-input" />
      </dialog>
    </body></html>`
  );
  const doc = dom.window.document;
  const dlg = doc.getElementById('command-palette-pjax-container');
  const input = doc.getElementById('gh-palette-input');
  __resetGithubPaletteWatchForTests();

  assert.equal(isGithubCommandPaletteOpen(doc), false);
  assert.equal(
    shouldIgnoreModalEscapeForGithubPalette(doc, { now: 1000 }),
    false,
    'no grace before palette ever open'
  );

  dlg.open = true;
  assert.equal(isGithubCommandPaletteOpen(doc), true);
  assert.equal(touchGithubCommandPaletteOpen(doc, 2000), true);
  assert.equal(
    shouldIgnoreModalEscapeForGithubPalette(doc, { now: 2000 }),
    true,
    'open palette owns Escape'
  );

  // Race: GH capture handler already closed dialog on this Escape keydown
  dlg.open = false;
  // Closed dialog must not stay "open" via leftover focus / stuck :modal
  input.focus();
  dlg.matches = (sel) => sel === ':modal';
  assert.equal(
    isGithubCommandPaletteOpen(doc),
    false,
    'closed dialog not open even with focus + :modal'
  );
  assert.equal(
    shouldIgnoreModalEscapeForGithubPalette(doc, {
      now: 2000 + 100,
      graceMs: GITHUB_PALETTE_ESCAPE_GRACE_MS,
    }),
    true,
    'grace window after GH closed first'
  );
  assert.equal(
    shouldIgnoreModalEscapeForGithubPalette(doc, {
      now: 2000 + GITHUB_PALETTE_ESCAPE_GRACE_MS + 50,
      graceMs: GITHUB_PALETTE_ESCAPE_GRACE_MS,
    }),
    false,
    'grace expires — shortcuts work again'
  );

  // Leftover focus inside closed palette must not permanently block Escape
  __resetGithubPaletteWatchForTests();
  assert.equal(
    shouldIgnoreModalEscapeForGithubPalette(doc, {
      target: input,
      now: 9000,
    }),
    false,
    'focus in closed palette alone does not block Escape'
  );
}

// App wires Escape grace for GH palette (not open-check alone)
{
  const app = fs.readFileSync(
    path.join(__dirname, '../src/modal/app/PrModalApp.tsx'),
    'utf8'
  );
  assert.ok(
    app.includes('shouldIgnoreModalEscapeForGithubPalette'),
    'App uses Escape race helper'
  );
  assert.ok(
    app.includes('touchGithubCommandPaletteOpen'),
    'App tracks GH palette open state'
  );
}

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

// Conversation (no find) → step timeline comments
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
  'stepNavNext'
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

// pr+ palette is ⌥⇧K (aligned with pulls); plain ⌘K reserved for GitHub
assert.equal(
  resolveModalShortcutAction({
    mod: false,
    shift: true,
    alt: true,
    key: 'k',
    code: 'KeyK',
  }),
  'openPalette'
);
assert.equal(
  resolveModalShortcutAction({
    mod: true,
    shift: true,
    alt: false,
    key: 'k',
  }),
  null,
  '⌘⇧K must not open pr+ palette'
);
assert.equal(
  resolveModalShortcutAction({
    mod: true,
    shift: false,
    alt: false,
    key: 'k',
  }),
  null,
  '⌘K must not open pr+ palette'
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
assert.ok(app.includes("case 'navFilePrev'"), 'App handles navFilePrev');
assert.ok(app.includes("case 'navFileNext'"), 'App handles navFileNext');
assert.ok(app.includes('navSearch'), 'App wires navSearch');
assert.ok(app.includes('navComment'), 'App wires navComment');
assert.ok(app.includes('navFile'), 'App wires navFile');
assert.ok(
  app.includes('isGithubCommandPaletteOpen') ||
    app.includes('shouldIgnoreModalEscapeForGithubPalette'),
  'App ignores keys while GitHub command palette is open'
);
assert.ok(
  app.includes('shouldIgnoreModalEscapeForGithubPalette'),
  'App uses GH palette Escape race grace'
);
assert.ok(app.includes('code: e.code') || app.includes('code: e.code,'));
assert.ok(app.includes('searchOpen:'));

assert.ok(stepNav.includes('TipPopover'), 'StepNav shows TipPopover');
assert.ok(stepNav.includes('OptBtnHint'), 'StepNav supports Opt-hold badges');
assert.ok(
  !stepNav.includes('showOptHints'),
  'StepNav Opt badges use store (no showOptHints prop)'
);
assert.ok(stepNav.includes('prevShortcut'));
assert.ok(stepNav.includes('nextShortcut'));
assert.ok(
  stepNav.includes('shortcut={prevKbd') ||
    stepNav.includes('shortcut={prevShortcut') ||
    /TipPopover[\s\S]{0,80}prevKbd/.test(stepNav),
  'StepNav TipPopover shows prev shortcut'
);

assert.ok(toolbar.includes('stepNavShortcutLabel'));
assert.ok(toolbar.includes('prevShortcut={threadPrevShortcut}'));
assert.ok(
  !toolbar.includes('showOptHints={showOptHints}'),
  'DiffToolbar does not prop-drill showOptHints'
);
assert.ok(searchBar.includes('stepNavShortcutLabel'));
assert.ok(searchBar.includes('prevShortcut={prevShortcut}'));
assert.ok(
  !searchBar.includes('showOptHints={showOptHints}'),
  'SearchBar does not prop-drill showOptHints'
);

// File step-nav lives in file explorer (beside search input), not Diff toolbar
const fileTree = fs.readFileSync(
  path.join(root, 'src/modal/views/diff/FolderFileTree.tsx'),
  'utf8'
);
assert.ok(fileTree.includes('fileNavShortcutLabel'));
assert.ok(fileTree.includes('prp-filetree__file-nav'));
assert.ok(fileTree.includes('prp-filetree__search-row'));
assert.ok(app.includes('onPrevFile=') || app.includes('onPrevFile={'));

console.log('step-nav-shortcut.test.js: all assertions passed');
