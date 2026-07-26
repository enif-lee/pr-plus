/**
 * Diff opt-nav: page scroll + viewed toggle shortcuts, floating controller,
 * opt-hint clear-on-action, file-nav scroll-into-view wiring, active-only tip.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const {
  resolveModalShortcutAction,
  nextScrollTopByPage,
  DIFF_PAGE_SCROLL_SHORTCUT,
  TOGGLE_VIEWED_SHORTCUT,
  FILE_NAV_SHORTCUT,
  resolveAdjacentFileNav,
  normalizeShortcutKey,
} = require('../src/modal/lib/shortcut-policy.ts');
const { toggleViewedPath, isPathViewed } = require('../src/modal/lib/review-threads.ts');

// --- normalize arrows / R under Alt ---
assert.equal(
  normalizeShortcutKey({ key: '∆', code: 'ArrowUp', alt: true }),
  'arrowup'
);
assert.equal(
  normalizeShortcutKey({ key: '˚', code: 'ArrowDown', alt: true }),
  'arrowdown'
);
assert.equal(
  normalizeShortcutKey({ key: '®', code: 'KeyR', alt: true }),
  'r'
);

// --- page scroll helper ---
assert.equal(nextScrollTopByPage(0, 400, 2000, 1), 360); // 0.9 * 400
assert.equal(nextScrollTopByPage(360, 400, 2000, -1), 0);
assert.equal(nextScrollTopByPage(1900, 400, 2000, 1), 1600); // max = 2000-400
assert.equal(DIFF_PAGE_SCROLL_SHORTCUT.prev.action, 'scrollDiffPagePrev');
assert.equal(DIFF_PAGE_SCROLL_SHORTCUT.next.action, 'scrollDiffPageNext');
assert.equal(TOGGLE_VIEWED_SHORTCUT.action, 'toggleViewedActiveFile');

// --- resolve: page scroll Diff-only ---
assert.equal(
  resolveModalShortcutAction({
    mod: false,
    alt: true,
    shift: true,
    key: 'ArrowUp',
    code: 'ArrowUp',
    layoutMode: 'diff',
    editableTarget: false,
  }),
  'scrollDiffPagePrev'
);
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
assert.equal(
  resolveModalShortcutAction({
    mod: false,
    alt: true,
    shift: true,
    key: 'ArrowDown',
    code: 'ArrowDown',
    layoutMode: 'conversation',
    editableTarget: false,
  }),
  null,
  'page scroll only on Diff'
);
assert.equal(
  resolveModalShortcutAction({
    mod: false,
    alt: true,
    shift: true,
    key: 'ArrowDown',
    code: 'ArrowDown',
    layoutMode: 'diff',
    editableTarget: true,
  }),
  null,
  'no page scroll while typing'
);

// --- resolve: toggle viewed Diff-only ---
assert.equal(
  resolveModalShortcutAction({
    mod: false,
    alt: true,
    shift: true,
    key: 'r',
    code: 'KeyR',
    layoutMode: 'diff',
    editableTarget: false,
  }),
  'toggleViewedActiveFile'
);
assert.equal(
  resolveModalShortcutAction({
    mod: false,
    alt: true,
    shift: true,
    key: 'r',
    code: 'KeyR',
    layoutMode: 'conversation',
    editableTarget: false,
  }),
  null,
  'viewed toggle only on Diff (conversation keeps other ⌥⇧R uses)'
);
assert.equal(
  resolveModalShortcutAction({
    mod: false,
    alt: true,
    shift: true,
    key: 'r',
    code: 'KeyR',
    layoutMode: 'diff',
    editableTarget: true,
  }),
  null
);

// file nav still works
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
  FILE_NAV_SHORTCUT.next.action
);
assert.equal(resolveAdjacentFileNav([{ path: 'a' }, { path: 'b' }], 'a', 1).path, 'b');

// --- viewed toggle helper (shipped) ---
{
  let set = new Set();
  set = toggleViewedPath(set, 'src/a.ts');
  assert.equal(isPathViewed(set, 'src/a.ts'), true);
  set = toggleViewedPath(set, 'src/a.ts');
  assert.equal(isPathViewed(set, 'src/a.ts'), false);
}

// --- structural wiring ---
const app = fs.readFileSync(path.join(root, 'src/modal/app/PrModalApp.tsx'), 'utf8');
const tree = fs.readFileSync(
  path.join(root, 'src/modal/views/diff/FolderFileTree.tsx'),
  'utf8'
);
const floatSrc = fs.readFileSync(
  path.join(root, 'src/modal/views/diff/DiffFloatingController.tsx'),
  'utf8'
);
const css = fs.readFileSync(path.join(root, 'src/modal/styles.css'), 'utf8');

assert.ok(app.includes("case 'scrollDiffPagePrev'"));
assert.ok(app.includes("case 'scrollDiffPageNext'"));
assert.ok(app.includes("case 'toggleViewedActiveFile'"));
assert.ok(app.includes('setOptHintsSuppressed'));
assert.ok(app.includes('optHintsSuppressed'));
assert.ok(app.includes('scrollFileNavRowIntoView'));
assert.ok(app.includes('DiffFloatingController'));
assert.ok(app.includes('scrollDiffPage'));
assert.ok(floatSrc.includes('prp-diff-float-nav'));
assert.ok(floatSrc.includes('onPrevFile'));
assert.ok(floatSrc.includes('onNextFile'));
assert.ok(floatSrc.includes('onPrevPage'));
assert.ok(floatSrc.includes('onNextPage'));
assert.ok(css.includes('.prp-diff-float-nav'));
assert.ok(tree.includes('TipPopover'));
assert.ok(tree.includes('node.path === activePath'));
assert.ok(tree.includes('TOGGLE_VIEWED_SHORTCUT') || tree.includes('Mark as viewed'));
assert.ok(tree.includes('data-file-path'));

console.log('diff-opt-nav.test.js: all assertions passed');
console.log('page-scroll-shortcut=true');
console.log('viewed-toggle-shortcut=true');
console.log('float-controller=true');
console.log('opt-hints-suppress=true');
console.log('file-nav-scroll-into-view=true');
