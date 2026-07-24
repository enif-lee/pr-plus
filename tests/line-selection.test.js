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
  extractSelectedCodeText,
  githubBlobLinePermalink,
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

assert.equal(isRowInSelection(multi, row({ newLine: 6, rowIndex: 11 })), true);
assert.equal(
  isRowInSelection(multi, row({ newLine: 20, rowIndex: 99 })),
  false,
  'rowIndex outside range is not selected (even if line number is unrelated)'
);
assert.equal(
  isRowInSelection(multi, row({ filePath: 'other.js', newLine: 6, rowIndex: 11 })),
  false
);

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

// Continuous selection block roles for yellow multi-line UI (by rowIndex)
assert.equal(selectionBlockRole(start, row({ newLine: 5, rowIndex: 10 })), 'only');
assert.equal(selectionBlockRole(multi, row({ newLine: 5, rowIndex: 10 })), 'start');
assert.equal(selectionBlockRole(multi, row({ newLine: 6, rowIndex: 11 })), 'middle');
assert.equal(selectionBlockRole(multi, row({ newLine: 7, rowIndex: 12 })), 'middle');
assert.equal(selectionBlockRole(multi, row({ newLine: 8, rowIndex: 13 })), 'end');
assert.equal(selectionBlockRole(multi, row({ newLine: 99, rowIndex: 99 })), null);
assert.equal(selectionBlockRole(null, row({ newLine: 5, rowIndex: 10 })), null);

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


// extractSelectedCodeText + githubBlobLinePermalink
{
  const rows = [
    {
      kind: 'diff-line',
      filePath: 'a.ts',
      lineType: 'add',
      newLine: 1,
      oldLine: null,
      code: 'const x = 1;',
      raw: '+const x = 1;',
      rowIndex: 1,
    },
    {
      kind: 'diff-line',
      filePath: 'a.ts',
      lineType: 'add',
      newLine: 2,
      oldLine: null,
      code: 'const y = 2;',
      raw: '+const y = 2;',
      rowIndex: 2,
    },
  ];
  const s = beginLineSelection(rows[0]);
  const m = extendLineSelection(s, rows[1]);
  assert.equal(extractSelectedCodeText(rows, m), 'const x = 1;\nconst y = 2;');
  assert.equal(extractSelectedCodeText(rows, null), '');
  assert.equal(
    githubBlobLinePermalink({
      owner: 'acme',
      repo: 'app',
      path: 'src/a.ts',
      startLine: 10,
      endLine: 12,
      side: 'RIGHT',
      headSha: 'deadbeef',
    }),
    'https://github.com/acme/app/blob/deadbeef/src/a.ts#L10-L12'
  );
  assert.equal(
    githubBlobLinePermalink({
      owner: 'acme',
      repo: 'app',
      path: 'src/a.ts',
      startLine: 5,
      side: 'LEFT',
      baseSha: 'cafebabe',
    }),
    'https://github.com/acme/app/blob/cafebabe/src/a.ts#L5'
  );
  assert.equal(githubBlobLinePermalink({ owner: 'a', repo: 'b' }), '');
  // Path segments encoded; line range omitted when single line
  assert.equal(
    githubBlobLinePermalink({
      owner: 'o',
      repo: 'r',
      path: 'src/foo bar.ts',
      startLine: 3,
      endLine: 3,
      headRef: 'main',
    }),
    'https://github.com/o/r/blob/main/src/foo%20bar.ts#L3'
  );
  console.log('ok - extract code + permalink');
}

// File-level selection → comment payload
{
  const fileSel = { kind: 'file', filePath: 'src/a.ts', subjectType: 'file' };
  const norm = normalizeSelection(fileSel);
  assert.equal(norm.subjectType, 'file');
  assert.equal(norm.filePath, 'src/a.ts');
  assert.equal(norm.startLine, null);
  const payload = selectionToCommentPayload(fileSel, {
    body: 'nits on this file',
    commitId: 'deadbeef',
  });
  assert.ok(payload);
  assert.equal(payload.path, 'src/a.ts');
  assert.equal(payload.subject_type, 'file');
  assert.equal(payload.line, undefined);
  assert.equal(payload.commit_id, 'deadbeef');
  assert.equal(
    selectionToCommentPayload(fileSel, { body: '  ' }),
    null,
    'empty body rejected'
  );
  console.log('ok - file-level selection payload');
}

// Interleaved add/del: selection highlights by rowIndex (no line-number jump)
{
  const del = (oldLine, rowIndex) =>
    row({
      lineType: 'del',
      newLine: null,
      oldLine,
      rowIndex,
    });
  const add = (newLine, rowIndex) =>
    row({
      lineType: 'add',
      newLine,
      oldLine: null,
      rowIndex,
    });
  // Unified-style interleave: -5, +5, -6, +6
  const r0 = del(5, 10);
  const r1 = add(5, 11);
  const r2 = del(6, 12);
  const r3 = add(6, 13);
  const r4 = add(7, 14);

  // Drag from add L5 through del L6 to add L7
  let sel = beginLineSelection(r1);
  assert.equal(sel.anchorSide, 'RIGHT');
  sel = extendLineSelection(sel, r2); // del — LEFT line 6, but visual headRowIndex advances
  assert.equal(sel.headRowIndex, 12);
  assert.equal(sel.headSide, 'LEFT');
  sel = extendLineSelection(sel, r3);
  sel = extendLineSelection(sel, r4);
  assert.equal(sel.headRowIndex, 14);
  assert.equal(sel.headLine, 7);
  assert.equal(sel.headSide, 'RIGHT');

  // All rows between anchor and head are selected (continuous visual block)
  assert.equal(isRowInSelection(sel, r1), true, 'anchor add selected');
  assert.equal(isRowInSelection(sel, r2), true, 'interleaved del selected');
  assert.equal(isRowInSelection(sel, r3), true, 'interleaved add selected');
  assert.equal(isRowInSelection(sel, r4), true, 'head add selected');
  assert.equal(isRowInSelection(sel, r0), false, 'row before anchor not selected');

  assert.equal(selectionBlockRole(sel, r1), 'start');
  assert.equal(selectionBlockRole(sel, r2), 'middle');
  assert.equal(selectionBlockRole(sel, r4), 'end');

  // Payload ends ordered by visual rowIndex (start=anchor RIGHT5, end=head RIGHT7)
  const p = selectionToCommentPayload(sel, { body: 'range' });
  assert.equal(p.start_line, 5);
  assert.equal(p.start_side, 'RIGHT');
  assert.equal(p.line, 7);
  assert.equal(p.side, 'RIGHT');

  // Drag reverse: from del up through adds — still continuous by rowIndex
  let rev = beginLineSelection(r2);
  assert.equal(rev.anchorSide, 'LEFT');
  rev = extendLineSelection(rev, r1);
  rev = extendLineSelection(rev, r0);
  assert.equal(isRowInSelection(rev, r0), true);
  assert.equal(isRowInSelection(rev, r1), true);
  assert.equal(isRowInSelection(rev, r2), true);
  assert.equal(isRowInSelection(rev, r3), false);
  const revP = selectionToCommentPayload(rev, { body: 'rev' });
  // Visual start is r0 (del LEFT5), visual end is r2 (del LEFT6)
  assert.equal(revP.start_line, 5);
  assert.equal(revP.start_side, 'LEFT');
  assert.equal(revP.line, 6);
  assert.equal(revP.side, 'LEFT');
  console.log('ok - interleaved add/del selection by rowIndex');
}
