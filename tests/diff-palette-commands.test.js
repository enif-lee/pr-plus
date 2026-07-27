/**
 * Diff-view command palette: file nav, selection, filters, viewed toggle, etc.
 */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  buildPaletteCommands,
  buildDiffPaletteCommands,
  filterPaletteCommands,
  optShortcutForCommandId,
} = require('../src/modal/lib/command-palette.ts');

// Diff helpers
const diffOnly = buildDiffPaletteCommands();
assert.ok(diffOnly.length >= 10, 'diff palette has many actions');
const byId = Object.fromEntries(diffOnly.map((c) => [c.id, c]));
assert.equal(byId['diff-next-file'].action, 'navFileNext');
assert.equal(byId['diff-prev-file'].action, 'navFilePrev');
assert.equal(byId['diff-toggle-viewed'].action, 'toggleViewedActiveFile');
assert.equal(byId['diff-sel-down'].action, 'moveSelectionDown');
assert.equal(byId['diff-sel-extend-up'].action, 'extendSelectionUp');
assert.equal(byId['diff-page-down'].action, 'scrollDiffPageNext');
assert.equal(byId['diff-filter-unresolved'].action, 'toggleReviewFilterUnresolved');
assert.ok(byId['diff-next-file'].section === 'Diff');

// Only when layoutMode is diff
const conv = buildPaletteCommands({ number: 1, author: 'a', viewerLogin: 'b' }, {
  layoutMode: 'centered',
});
assert.equal(
  conv.some((c) => c.id === 'diff-next-file'),
  false,
  'conversation layout hides Diff commands'
);

const diff = buildPaletteCommands({ number: 1, author: 'a', viewerLogin: 'b' }, {
  layoutMode: 'diff',
  stackItems: [{ number: 1 }, { number: 2 }],
  openPulls: [{ number: 1 }, { number: 2 }],
});
assert.ok(diff.some((c) => c.id === 'diff-next-file'));
assert.ok(diff.some((c) => c.id === 'diff-toggle-viewed'));
assert.ok(diff.some((c) => c.id === 'nav-adjacent-next'), 'next PR still present');
assert.ok(diff.some((c) => c.id === 'nav-adjacent-prev'), 'prev PR still present');
assert.ok(diff.some((c) => c.id === 'diff-sel-down'));
assert.ok(diff.some((c) => c.id === 'diff-sel-comment'));

// Filter finds Diff commands
const hits = filterPaletteCommands(diff, 'next file');
assert.ok(hits.some((c) => c.id === 'diff-next-file'));
const viewed = filterPaletteCommands(diff, 'viewed');
assert.ok(viewed.some((c) => c.id === 'diff-toggle-viewed'));

// Shortcut map
assert.equal(optShortcutForCommandId('diff-next-file'), 'opt+shift+]');
assert.equal(optShortcutForCommandId('diff-toggle-viewed'), 'opt+shift+r');
assert.equal(optShortcutForCommandId('toggle-side-panel'), 'opt+b');

// Side panel toggle (layout-aware title; always available)
const sideDiff = conv.find((c) => c.id === 'toggle-side-panel');
assert.ok(sideDiff, 'conversation has toggle-side-panel');
assert.equal(sideDiff.action, 'toggleSidePanel');
assert.equal(sideDiff.title, 'Toggle metadata panel');
const sideOnDiff = diff.find((c) => c.id === 'toggle-side-panel');
assert.ok(sideOnDiff);
assert.equal(sideOnDiff.title, 'Toggle files panel');
assert.equal(sideOnDiff.shortcut, 'opt+b');

// App wiring
const appSrc = fs.readFileSync(
  path.join(__dirname, '../src/modal/app/PrModalApp.tsx'),
  'utf8'
);
assert.ok(
  /layoutMode:\s*layoutMode\s*===\s*LAYOUT_DIFF\s*\?\s*['"]diff['"]/.test(appSrc) ||
    appSrc.includes("layoutMode: layoutMode === LAYOUT_DIFF ? 'diff'"),
  'passes layoutMode into buildPaletteCommands'
);
assert.ok(appSrc.includes("case 'navFileNext':"));
assert.ok(appSrc.includes("case 'toggleViewedActiveFile':"));
assert.ok(appSrc.includes("case 'moveSelectionDown':"));
assert.ok(appSrc.includes("case 'scrollDiffPageNext':"));
assert.ok(appSrc.includes("case 'toggleReviewFilterUnresolved':"));
assert.ok(appSrc.includes("case 'openSelectionComment':"));
assert.ok(appSrc.includes("case 'toggleSidePanel':"));
assert.ok(appSrc.includes('function toggleSidePanel'));
assert.ok(appSrc.includes('onRegisterAsideToggle'));
// Selection / Opt chords go through code-normalized key (macOS glyphs)
assert.ok(
  appSrc.includes('shortcutKeyFromEvent') || appSrc.includes('normalizeShortcutKey'),
  'App uses shared key normalizer for Opt chords'
);

console.log('diff-palette-commands.test.js: ok');
