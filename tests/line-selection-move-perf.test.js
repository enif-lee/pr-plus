/**
 * Line selection keyboard move: seed after file nav, multi-step coalesce,
 * delayed action toggles wiring in App.
 */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  beginLineSelection,
  firstSelectableRowInFile,
  lastSelectableRowInFile,
  moveLineSelection,
  isSelectionAtFileEdge,
  SELECTION_ACTIONS_REVEAL_MS,
  rowSelectionVisualKey,
} = require('../src/modal/lib/line-selection.ts');

function row(filePath, rowIndex, newLine, lineType = 'context') {
  return {
    kind: 'diff-line',
    lineType,
    filePath,
    rowIndex,
    newLine,
    oldLine: newLine,
  };
}

const rows = [
  { kind: 'file-header', filePath: 'a.ts', rowIndex: 0 },
  row('a.ts', 1, 1, 'add'),
  row('a.ts', 2, 2, 'context'),
  row('a.ts', 3, 3, 'context'),
  row('a.ts', 4, 4, 'del'),
  { kind: 'file-header', filePath: 'b.ts', rowIndex: 5 },
  row('b.ts', 6, 10, 'add'),
  row('b.ts', 7, 11, 'context'),
];

// firstSelectableRowInFile
const firstA = firstSelectableRowInFile(rows, 'a.ts');
assert.ok(firstA);
assert.equal(firstA.rowIndex, 1);
assert.equal(firstA.newLine, 1);
const firstB = firstSelectableRowInFile(rows, 'b.ts');
assert.equal(firstB.rowIndex, 6);
assert.equal(firstSelectableRowInFile(rows, 'missing.ts'), null);

// Seed when no selection + activeFilePath
const seeded = moveLineSelection(null, rows, 1, {
  shift: false,
  activeFilePath: 'b.ts',
});
assert.ok(seeded);
assert.equal(seeded.filePath, 'b.ts');
assert.equal(seeded.headLine, 10);
assert.equal(seeded.anchorRowIndex, 6);

// Seed only once per keypress (|delta|===1) — do not also step
const seededUp = moveLineSelection(null, rows, -1, {
  activeFilePath: 'a.ts',
});
assert.equal(seededUp.headLine, 1, 'first arrow seeds first line regardless of dir');

// Seed then multi-step (rAF coalesce of key-hold)
const multi = moveLineSelection(null, rows, 3, {
  shift: false,
  activeFilePath: 'a.ts',
});
// 1 seed + 2 moves → line 3
assert.equal(multi.headLine, 3);
assert.equal(multi.anchorRowIndex, multi.headRowIndex);

// Wrong-file selection reseeds to active file first line
const onA = beginLineSelection(row('a.ts', 3, 3));
const reseed = moveLineSelection(onA, rows, 1, {
  activeFilePath: 'b.ts',
});
assert.equal(reseed.filePath, 'b.ts');
assert.equal(reseed.headLine, 10);

// Same-file multi-step without seed
const from2 = beginLineSelection(row('a.ts', 2, 2));
const jumped = moveLineSelection(from2, rows, 2, { shift: false });
assert.equal(jumped.headLine, 4);

// Cross file at EOF (plain arrow) — enter next file first selectable
const lastA = beginLineSelection(row('a.ts', 4, 4, 'del'));
const crossed = moveLineSelection(lastA, rows, 1, { shift: false });
assert.equal(crossed.filePath, 'b.ts');
assert.equal(crossed.headLine, 10);
assert.equal(crossed.anchorRowIndex, crossed.headRowIndex);

// Cross file at BOF (plain arrow up) — previous file last selectable
const startB = beginLineSelection(row('b.ts', 6, 10, 'add'));
const crossedUp = moveLineSelection(startB, rows, -1, { shift: false });
assert.equal(crossedUp.filePath, 'a.ts');
assert.equal(crossedUp.headLine, 4);

// Multi-line extend (shift) blocked at file boundary
const nearEnd = beginLineSelection(row('a.ts', 3, 3));
const extAtEnd = moveLineSelection(nearEnd, rows, 1, { shift: true });
assert.equal(extAtEnd.filePath, 'a.ts');
assert.equal(extAtEnd.headLine, 4);
const blocked = moveLineSelection(extAtEnd, rows, 1, { shift: true });
assert.equal(blocked.filePath, 'a.ts', 'shift extend does not enter b.ts');
assert.equal(blocked.headLine, 4);
assert.equal(blocked.headRowIndex, extAtEnd.headRowIndex);

// Edge helpers
assert.equal(lastSelectableRowInFile(rows, 'a.ts').rowIndex, 4);
assert.equal(isSelectionAtFileEdge(lastA, rows, 1), true);
assert.equal(isSelectionAtFileEdge(lastA, rows, -1), false);
assert.equal(isSelectionAtFileEdge(startB, rows, -1), true);

// Reveal delay constant is a positive number (used by App)
assert.ok(
  typeof SELECTION_ACTIONS_REVEAL_MS === 'number' &&
    SELECTION_ACTIONS_REVEAL_MS >= 150 &&
    SELECTION_ACTIONS_REVEAL_MS <= 800
);

// Leaf visual keys: multi extend only flips edge roles (middles stay "middle")
const multiSel = {
  filePath: 'a.ts',
  anchorRowIndex: 1,
  headRowIndex: 3,
  anchorLine: 1,
  headLine: 3,
  anchorSide: 'RIGHT',
  headSide: 'RIGHT',
};
assert.equal(rowSelectionVisualKey(multiSel, row('a.ts', 1, 1, 'add')), 'start');
assert.equal(rowSelectionVisualKey(multiSel, row('a.ts', 2, 2)), 'middle');
assert.equal(rowSelectionVisualKey(multiSel, row('a.ts', 3, 3)), 'end');
assert.equal(rowSelectionVisualKey(multiSel, row('a.ts', 4, 4, 'del')), '');
const multiExt = { ...multiSel, headRowIndex: 4, headLine: 4 };
assert.equal(
  rowSelectionVisualKey(multiExt, row('a.ts', 2, 2)),
  'middle',
  'middle stays middle when range grows — no React re-render'
);
assert.equal(rowSelectionVisualKey(multiExt, row('a.ts', 3, 3)), 'middle');
assert.equal(rowSelectionVisualKey(multiExt, row('a.ts', 4, 4, 'del')), 'end');

// --- App wiring contracts ---
const appSrc = fs.readFileSync(
  path.join(__dirname, '../src/modal/app/PrModalApp.tsx'),
  'utf8'
);
assert.ok(
  appSrc.includes('scheduleSelectionActionsReveal'),
  'delayed action toggles helper'
);
assert.ok(
  appSrc.includes('SELECTION_ACTIONS_REVEAL_MS'),
  'uses reveal delay constant'
);
assert.ok(
  appSrc.includes('selectionMoveRafRef') ||
    appSrc.includes('requestAnimationFrame'),
  'rAF-coalesced keyboard moves'
);
assert.ok(
  appSrc.includes('activeFilePath: activePath') ||
    appSrc.includes('activeFilePath:'),
  'passes activeFilePath into moveLineSelection for seed'
);
assert.ok(
  appSrc.includes('syncActiveFileFromSelection'),
  'syncs tree active path when caret crosses files'
);
assert.ok(
  appSrc.includes('pendingCrossFileSeedRef'),
  'single-file mode hop seeds after rebuild'
);
// File nav clears selection so next arrow seeds first line
assert.ok(
  /function onSelectFile[\s\S]*setLineSelection\(null\)/.test(appSrc),
  'onSelectFile clears line selection'
);
assert.ok(
  appSrc.includes('scrollSelectionHeadDomOnly') ||
    appSrc.includes('listRef.current.scrollTop'),
  'keyboard move prefers DOM scroll over setScrollTop thrash'
);

const vdSrc = fs.readFileSync(
  path.join(__dirname, '../src/modal/views/diff/VirtualDiff.tsx'),
  'utf8'
);
assert.ok(
  vdSrc.includes('rowSelectionVisualKey'),
  'DiffCodeLine uses leaf visual key helper'
);
assert.ok(
  vdSrc.includes('DiffCodeLineBody'),
  'selection shell split from highlight body'
);
assert.ok(
  /storeFileSelectionPath|kind === 'file'/.test(vdSrc) &&
    !/useModalStore\(\(s\) => s\.lineSelection\)/.test(vdSrc),
  'VirtualDiff does not subscribe to full lineSelection'
);

console.log('line-selection-move-perf: ok');
