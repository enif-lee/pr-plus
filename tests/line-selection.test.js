const assert = require('node:assert/strict');
const {
  isSelectableDiffRow,
  beginLineSelection,
  extendLineSelection,
  applySelectionPointerDown,
  normalizeSelection,
  selectionToCommentPayload,
  finalizeSelection,
  selectionGestureMode,
  isRowInSelection,
  selectionBlockRole,
} = require('../src/modal/lib/line-selection.ts');

const row = (overrides) => ({
  kind: 'diff-line',
  lineType: 'add',
  filePath: 'src/a.js',
  rowIndex: 10,
  newLine: 5,
  oldLine: null,
  ...overrides,
});

assert.equal(isSelectableDiffRow(row()), true);
assert.equal(isSelectableDiffRow({ kind: 'file-header' }), false);
assert.equal(isSelectableDiffRow(row({ lineType: 'hunk' })), false);

const start = beginLineSelection(row({ newLine: 5, rowIndex: 10 }));
assert.ok(start);
assert.equal(start.filePath, 'src/a.js');
assert.equal(start.anchorLine, 5);
assert.equal(start.headLine, 5);

const multi = extendLineSelection(
  start,
  row({ newLine: 8, rowIndex: 13, lineType: 'context', oldLine: 7 })
);
assert.equal(multi.headLine, 8);
const norm = normalizeSelection(multi);
assert.equal(norm.startLine, 5);
assert.equal(norm.endLine, 8);
assert.equal(norm.multi, true);

const payload = selectionToCommentPayload(multi, {
  body: 'please fix',
  commitId: 'deadbeef',
});
assert.ok(payload);
assert.equal(payload.path, 'src/a.js');
assert.equal(payload.line, 8);
assert.equal(payload.start_line, 5);
assert.equal(payload.side, 'RIGHT');
assert.equal(payload.start_side, 'RIGHT');
assert.equal(payload.commit_id, 'deadbeef');
assert.equal(payload.body, 'please fix');

const single = selectionToCommentPayload(start, { body: 'one line' });
assert.equal(single.start_line, undefined);
assert.equal(single.line, 5);

assert.equal(isRowInSelection(multi, row({ newLine: 6 })), true);
assert.equal(isRowInSelection(multi, row({ newLine: 20 })), false);
assert.equal(isRowInSelection(multi, row({ filePath: 'other.js', newLine: 6 })), false);

assert.equal(selectionToCommentPayload(start, { body: '   ' }), null);

// click vs drag finalization
assert.equal(selectionGestureMode({ x: 0, y: 0 }, { x: 1, y: 1 }, 4), 'click');
assert.equal(selectionGestureMode({ x: 0, y: 0 }, { x: 0, y: 10 }, 4), 'drag');
const dragged = extendLineSelection(
  beginLineSelection(row({ newLine: 2, rowIndex: 1 })),
  row({ newLine: 6, rowIndex: 5 })
);
const asClick = finalizeSelection(dragged, 'click');
assert.equal(normalizeSelection(asClick).multi, false);
assert.equal(normalizeSelection(asClick).startLine, 2);
assert.equal(normalizeSelection(asClick).endLine, 2);
const asDrag = finalizeSelection(dragged, 'drag');
assert.equal(normalizeSelection(asDrag).multi, true);
assert.equal(normalizeSelection(asDrag).endLine, 6);

// Continuous selection block roles for yellow multi-line UI
assert.equal(selectionBlockRole(start, row({ newLine: 5 })), 'only');
assert.equal(selectionBlockRole(multi, row({ newLine: 5 })), 'start');
assert.equal(selectionBlockRole(multi, row({ newLine: 6 })), 'middle');
assert.equal(selectionBlockRole(multi, row({ newLine: 7 })), 'middle');
assert.equal(selectionBlockRole(multi, row({ newLine: 8 })), 'end');
assert.equal(selectionBlockRole(multi, row({ newLine: 99 })), null);
assert.equal(selectionBlockRole(null, row({ newLine: 5 })), null);

// --- Click then Shift-click → multi range (anchor fixed) ---
{
  const anchor = applySelectionPointerDown(null, row({ newLine: 5, rowIndex: 10 }), {
    shiftKey: false,
  });
  assert.equal(anchor.mode, 'begin');
  assert.equal(anchor.keepRange, false);
  assert.equal(anchor.selection.anchorLine, 5);
  assert.equal(anchor.selection.headLine, 5);

  const shifted = applySelectionPointerDown(
    anchor.selection,
    row({ newLine: 12, rowIndex: 20, lineType: 'context', oldLine: 11 }),
    { shiftKey: true }
  );
  assert.equal(shifted.mode, 'extend');
  assert.equal(shifted.keepRange, true);
  assert.equal(shifted.selection.anchorLine, 5, 'anchor stays fixed');
  assert.equal(shifted.selection.anchorRowIndex, 10);
  assert.equal(shifted.selection.headLine, 12);
  const shiftNorm = normalizeSelection(shifted.selection);
  assert.equal(shiftNorm.multi, true);
  assert.equal(shiftNorm.startLine, 5);
  assert.equal(shiftNorm.endLine, 12);

  // Finalize Shift range must NOT collapse to single line
  const finalized = finalizeSelection(shifted.selection, 'shift');
  assert.equal(normalizeSelection(finalized).multi, true);
  assert.equal(normalizeSelection(finalized).endLine, 12);

  // Plain re-click without Shift starts a new single-line selection
  const reclick = applySelectionPointerDown(
    shifted.selection,
    row({ newLine: 3, rowIndex: 8 }),
    { shiftKey: false }
  );
  assert.equal(reclick.mode, 'begin');
  assert.equal(reclick.keepRange, false);
  assert.equal(reclick.selection.anchorLine, 3);
  assert.equal(reclick.selection.headLine, 3);
  assert.equal(normalizeSelection(reclick.selection).multi, false);
}

// --- Edges: Shift with no prior selection; non-selectable; cross-file ---
{
  const noPrior = applySelectionPointerDown(
    null,
    row({ newLine: 9, rowIndex: 1 }),
    { shiftKey: true }
  );
  assert.equal(noPrior.mode, 'begin', 'Shift with no selection starts normally');
  assert.equal(noPrior.keepRange, false);
  assert.equal(noPrior.selection.anchorLine, 9);

  const prior = beginLineSelection(row({ newLine: 2, rowIndex: 1 }));
  const nonSel = applySelectionPointerDown(
    prior,
    { kind: 'file-header', filePath: 'src/a.js', rowIndex: 0 },
    { shiftKey: true }
  );
  assert.equal(nonSel.mode, 'ignore');
  assert.equal(nonSel.selection, prior);
  assert.equal(nonSel.keepRange, false);

  const otherFile = applySelectionPointerDown(
    prior,
    row({ filePath: 'src/b.js', newLine: 4, rowIndex: 40 }),
    { shiftKey: true }
  );
  assert.equal(otherFile.mode, 'begin', 'cross-file Shift starts new selection');
  assert.equal(otherFile.keepRange, false);
  assert.equal(otherFile.selection.filePath, 'src/b.js');
  assert.equal(otherFile.selection.anchorLine, 4);
}

console.log('line-selection.test.js: all assertions passed');
console.log('diff-shift-select=true');

