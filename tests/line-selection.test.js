const assert = require('node:assert/strict');
const {
  isSelectableDiffRow,
  beginLineSelection,
  extendLineSelection,
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

console.log('line-selection.test.js: all assertions passed');

