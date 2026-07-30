/**
 * Split-view line selection: side stickiness + visual helpers.
 */
import { describe, expect, test } from '@rstest/core';
import {
  beginLineSelection,
  beginSelectionOnRow,
  extendLineSelection,
  extractSelectedCodeText,
  firstSelectableRowAnywhere,
  isCodeBodySelection,
  isFileLevelSelection,
  isMultiLineBodySelection,
  isSingleLineCaretSelection,
  isThreadSelection,
  lineForSideStrict,
  moveLineSelection,
  rebindSelectionRowIndices,
  resolveSelectionHeadIndex,
  resolveSelectionIslandRevealPhase,
  rowSelectionVisualKey,
  selectionActiveSide,
} from '../src/modal/lib/line-selection';

function splitChangeRow(opts: {
  rowIndex: number;
  oldLine?: number | null;
  newLine?: number | null;
  path?: string;
}) {
  return {
    kind: 'diff-line',
    lineType: 'change',
    split: true,
    filePath: opts.path || 'a.ts',
    rowIndex: opts.rowIndex,
    oldLine: opts.oldLine ?? null,
    newLine: opts.newLine ?? null,
    leftCode: 'old',
    rightCode: 'new',
  };
}

describe('selectionActiveSide / lineForSideStrict', () => {
  test('active side prefers head then anchor', () => {
    expect(
      selectionActiveSide({ anchorSide: 'LEFT', headSide: 'RIGHT' })
    ).toBe('RIGHT');
    expect(selectionActiveSide({ anchorSide: 'LEFT' })).toBe('LEFT');
    expect(selectionActiveSide({})).toBe('RIGHT');
  });

  test('strict side has no cross-pane fallback', () => {
    const delOnly = splitChangeRow({
      rowIndex: 1,
      oldLine: 3,
      newLine: null,
    });
    expect(lineForSideStrict(delOnly, 'RIGHT')).toBe(null);
    expect(lineForSideStrict(delOnly, 'LEFT')).toEqual({
      line: 3,
      side: 'LEFT',
    });
    const addOnly = splitChangeRow({
      rowIndex: 2,
      oldLine: null,
      newLine: 9,
    });
    expect(lineForSideStrict(addOnly, 'LEFT')).toBe(null);
    expect(lineForSideStrict(addOnly, 'RIGHT')).toEqual({
      line: 9,
      side: 'RIGHT',
    });
  });
});

describe('extendLineSelection sticky side', () => {
  test('RIGHT selection stays RIGHT when dragging over del-only row', () => {
    const addRow = splitChangeRow({ rowIndex: 5, oldLine: 1, newLine: 1 });
    const started = beginLineSelection(addRow, 'RIGHT');
    expect(started?.anchorSide).toBe('RIGHT');
    expect(started?.headSide).toBe('RIGHT');

    const delOnly = splitChangeRow({
      rowIndex: 6,
      oldLine: 2,
      newLine: null,
    });
    const ext = extendLineSelection(started, delOnly);
    expect(ext.headSide).toBe('RIGHT');
    expect(ext.headRowIndex).toBe(6);
    // headLine stays on last RIGHT line when this row has no newLine
    expect(ext.headLine).toBe(1);
  });

  test('LEFT selection extends on left lines', () => {
    const rowA = splitChangeRow({ rowIndex: 1, oldLine: 10, newLine: 10 });
    const started = beginLineSelection(rowA, 'LEFT');
    expect(started?.headSide).toBe('LEFT');
    const rowB = splitChangeRow({ rowIndex: 2, oldLine: 11, newLine: 11 });
    const ext = extendLineSelection(started, rowB);
    expect(ext.headSide).toBe('LEFT');
    expect(ext.headLine).toBe(11);
  });
});

describe('rowSelectionVisualKey', () => {
  test('marks row range for multi-line', () => {
    const sel = {
      filePath: 'a.ts',
      anchorRowIndex: 1,
      headRowIndex: 3,
      anchorSide: 'RIGHT',
      headSide: 'RIGHT',
      anchorLine: 1,
      headLine: 3,
    };
    const mid = splitChangeRow({ rowIndex: 2, oldLine: 2, newLine: 2 });
    expect(rowSelectionVisualKey(sel, mid)).toBe('middle');
    const end = splitChangeRow({ rowIndex: 3, oldLine: 3, newLine: 3 });
    expect(rowSelectionVisualKey(sel, end)).toBe('end');
  });
});

describe('moveLineSelection seed without active file', () => {
  test('ArrowDown with null selection seeds first selectable row', () => {
    const rows = [
      { kind: 'file-header', filePath: 'a.ts', rowIndex: 0 },
      splitChangeRow({ rowIndex: 1, oldLine: 1, newLine: 1, path: 'a.ts' }),
      splitChangeRow({ rowIndex: 2, oldLine: 2, newLine: 2, path: 'a.ts' }),
    ];
    expect(firstSelectableRowAnywhere(rows)?.rowIndex).toBe(1);
    const seeded = moveLineSelection(null, rows, 1, { activeFilePath: null });
    expect(seeded).toBeTruthy();
    expect(seeded.filePath).toBe('a.ts');
    expect(seeded.headRowIndex).toBe(1);
    // Second step from seed would move if steps>0 on same press; next press moves
    const moved = moveLineSelection(seeded, rows, 1, {
      activeFilePath: 'a.ts',
    });
    expect(moved.headRowIndex).toBe(2);
  });

  test('empty list cannot seed', () => {
    expect(moveLineSelection(null, [], 1, { activeFilePath: null })).toBe(null);
  });
});

describe('moveLineSelection file headers + folded files', () => {
  /**
   * After fold, body rows are gone — only file-header remains. Stale selection
   * still points at the folded path / old headRowIndex.
   */
  // a expanded, b header only (folded), c expanded
  const afterFoldB = [
    { kind: 'file-header', filePath: 'a.ts', rowIndex: 0, collapsed: false },
    splitChangeRow({ rowIndex: 1, oldLine: 1, newLine: 1, path: 'a.ts' }),
    splitChangeRow({ rowIndex: 2, oldLine: 2, newLine: 2, path: 'a.ts' }),
    { kind: 'file-header', filePath: 'b.ts', rowIndex: 3, collapsed: true },
    { kind: 'file-header', filePath: 'c.ts', rowIndex: 4, collapsed: false },
    splitChangeRow({ rowIndex: 5, oldLine: 10, newLine: 10, path: 'c.ts' }),
    splitChangeRow({ rowIndex: 6, oldLine: 11, newLine: 11, path: 'c.ts' }),
  ];

  test('beginSelectionOnRow on header creates file-level selection', () => {
    const header = {
      kind: 'file-header',
      filePath: 'a.ts',
      rowIndex: 0,
      collapsed: false,
    };
    const sel = beginSelectionOnRow(header);
    expect(isFileLevelSelection(sel)).toBe(true);
    expect(sel?.filePath).toBe('a.ts');
    expect(sel?.headRowIndex).toBe(0);
    expect(rowSelectionVisualKey(sel, header)).toBe('only');
  });

  test('plain ↑↓ visits file header between files', () => {
    const rows = [
      { kind: 'file-header', filePath: 'a.ts', rowIndex: 0 },
      splitChangeRow({ rowIndex: 1, oldLine: 1, newLine: 1, path: 'a.ts' }),
      splitChangeRow({ rowIndex: 2, oldLine: 2, newLine: 2, path: 'a.ts' }),
      { kind: 'file-header', filePath: 'b.ts', rowIndex: 3 },
      splitChangeRow({ rowIndex: 4, oldLine: 1, newLine: 1, path: 'b.ts' }),
    ];
    // From last line of a → next is b header (file-level)
    const onLastA = beginLineSelection(rows[2]);
    const toHeader = moveLineSelection(onLastA, rows, 1, {
      activeFilePath: 'a.ts',
    });
    expect(isFileLevelSelection(toHeader)).toBe(true);
    expect(toHeader.filePath).toBe('b.ts');
    expect(toHeader.headRowIndex).toBe(3);
    // From b header ↓ → first line of b
    const toLine = moveLineSelection(toHeader, rows, 1, {
      activeFilePath: 'b.ts',
    });
    expect(isFileLevelSelection(toLine)).toBe(false);
    expect(toLine.filePath).toBe('b.ts');
    expect(toLine.headRowIndex).toBe(4);
    // From first line of a ↑ → a header
    const onFirstA = beginLineSelection(rows[1]);
    const toAHeader = moveLineSelection(onFirstA, rows, -1, {
      activeFilePath: 'a.ts',
    });
    expect(isFileLevelSelection(toAHeader)).toBe(true);
    expect(toAHeader.filePath).toBe('a.ts');
    expect(toAHeader.headRowIndex).toBe(0);
  });

  test('ArrowDown from folded file header hops to next file header', () => {
    // Stale line selection as if b.ts was selected before fold
    const stale = {
      filePath: 'b.ts',
      anchorLine: 3,
      headLine: 3,
      anchorSide: 'RIGHT',
      headSide: 'RIGHT',
      anchorRowIndex: 99,
      headRowIndex: 99,
    };
    const next = moveLineSelection(stale, afterFoldB, 1, {
      activeFilePath: 'b.ts',
    });
    expect(next).toBeTruthy();
    expect(isFileLevelSelection(next)).toBe(true);
    expect(next.filePath).toBe('c.ts');
    expect(next.headRowIndex).toBe(4);
  });

  test('ArrowUp from folded file header hops to previous file last line', () => {
    const onBHeader = beginSelectionOnRow(afterFoldB[3]);
    const next = moveLineSelection(onBHeader, afterFoldB, -1, {
      activeFilePath: 'b.ts',
    });
    expect(next).toBeTruthy();
    expect(next.filePath).toBe('a.ts');
    // Nearest nav stop above b header is last line of a
    expect(next.headRowIndex).toBe(2);
    expect(next.headLine).toBe(2);
  });

  test('ArrowDown across consecutive collapsed headers lands on next header', () => {
    const multiCollapsed = [
      { kind: 'file-header', filePath: 'a.ts', rowIndex: 0, collapsed: true },
      { kind: 'file-header', filePath: 'b.ts', rowIndex: 1, collapsed: true },
      { kind: 'file-header', filePath: 'c.ts', rowIndex: 2, collapsed: false },
      splitChangeRow({ rowIndex: 3, oldLine: 1, newLine: 1, path: 'c.ts' }),
    ];
    const onA = beginSelectionOnRow(multiCollapsed[0]);
    const next = moveLineSelection(onA, multiCollapsed, 1, {
      activeFilePath: 'a.ts',
    });
    // Next nav stop is b's header (also folded)
    expect(isFileLevelSelection(next)).toBe(true);
    expect(next?.filePath).toBe('b.ts');
    expect(next?.headRowIndex).toBe(1);
  });

  test('Shift+Arrow does not hop out of folded file (extend stays put)', () => {
    const onB = beginSelectionOnRow(afterFoldB[3]);
    const next = moveLineSelection(onB, afterFoldB, 1, {
      shift: true,
      activeFilePath: 'b.ts',
    });
    // File-level + shift → no multi-line extend
    expect(next).toEqual(onB);
  });
});

describe('rebindSelectionRowIndices after comment insert', () => {
  test('single-line visual key matches by line even with stale rowIndex', () => {
    // Selection still has old index 2, but line 2 is now at index 3
    const sel = {
      filePath: 'a.ts',
      anchorLine: 2,
      headLine: 2,
      anchorSide: 'RIGHT',
      headSide: 'RIGHT',
      anchorRowIndex: 2,
      headRowIndex: 2,
    };
    const after = [
      { kind: 'file-header', filePath: 'a.ts', rowIndex: 0 },
      splitChangeRow({ rowIndex: 1, oldLine: 1, newLine: 1, path: 'a.ts' }),
      {
        kind: 'inline-comment',
        filePath: 'a.ts',
        rowIndex: 2,
        commentId: 9,
        newLine: 1,
        oldLine: null,
      },
      splitChangeRow({ rowIndex: 3, oldLine: 2, newLine: 2, path: 'a.ts' }),
    ];
    // Line identity wins — paint the real line even before rebind
    expect(rowSelectionVisualKey(sel, after[3])).toBe('only');
    expect(rowSelectionVisualKey(sel, after[2])).toBe(''); // comment not a line
    expect(rowSelectionVisualKey(sel, after[1])).toBe(''); // wrong line

    const rebound = rebindSelectionRowIndices(sel, after);
    expect(rebound.headRowIndex).toBe(3);
    expect(rebound.anchorRowIndex).toBe(3);
    expect(rowSelectionVisualKey(rebound, after[3])).toBe('only');
  });

  test('no-op when indices already match (same object)', () => {
    const rows = [
      { kind: 'file-header', filePath: 'a.ts', rowIndex: 0 },
      splitChangeRow({ rowIndex: 1, oldLine: 1, newLine: 1, path: 'a.ts' }),
    ];
    const sel = beginLineSelection(rows[1]);
    expect(rebindSelectionRowIndices(sel, rows)).toBe(sel);
  });
});

describe('moveLineSelection visits review threads (plain only)', () => {
  const rows = [
    { kind: 'file-header', filePath: 'a.ts', rowIndex: 0 },
    splitChangeRow({ rowIndex: 1, oldLine: 1, newLine: 1, path: 'a.ts' }),
    {
      kind: 'inline-comment',
      filePath: 'a.ts',
      rowIndex: 2,
      commentId: 42,
      side: 'RIGHT',
      newLine: 1,
      oldLine: null,
    },
    splitChangeRow({ rowIndex: 3, oldLine: 2, newLine: 2, path: 'a.ts' }),
  ];

  test('ArrowDown from line lands on following thread', () => {
    const onLine = beginLineSelection(rows[1]);
    const next = moveLineSelection(onLine, rows, 1, { activeFilePath: 'a.ts' });
    expect(isThreadSelection(next)).toBe(true);
    expect(next.commentId).toBe(42);
    expect(rowSelectionVisualKey(next, rows[2])).toBe('only');
  });

  test('ArrowDown from thread lands on next line', () => {
    const onThread = beginSelectionOnRow(rows[2]);
    const next = moveLineSelection(onThread, rows, 1, {
      activeFilePath: 'a.ts',
    });
    expect(isThreadSelection(next)).toBe(false);
    expect(next.headLine).toBe(2);
    expect(next.headRowIndex).toBe(3);
  });

  test('Shift+Arrow skips threads (multi-line stays on body lines)', () => {
    const onLine = beginLineSelection(rows[1]);
    const next = moveLineSelection(onLine, rows, 1, {
      shift: true,
      activeFilePath: 'a.ts',
    });
    expect(isThreadSelection(next)).toBe(false);
    expect(next.headLine).toBe(2);
    expect(next.headRowIndex).toBe(3);
  });
});

describe('isCodeBodySelection (fold priority)', () => {
  test('code lines true; thread/file false', () => {
    expect(
      isCodeBodySelection({
        kind: 'line',
        subjectType: 'line',
        filePath: 'a.ts',
        anchorLine: 1,
        headLine: 2,
      })
    ).toBe(true);
    expect(
      isCodeBodySelection({
        kind: 'thread',
        subjectType: 'thread',
        commentId: 9,
        filePath: 'a.ts',
      })
    ).toBe(false);
    expect(
      isCodeBodySelection({
        kind: 'file',
        subjectType: 'file',
        filePath: 'a.ts',
      })
    ).toBe(false);
    expect(isCodeBodySelection(null)).toBe(false);
  });
});

describe('cross-side keyboard multi-select (sticky head past opposing region)', () => {
  /**
   * Unified/split opposing region: del-only then add-only then context.
   * After extending RIGHT selection across del-only, Shift+↓ must still grow.
   */
  const rows = [
    splitChangeRow({ rowIndex: 0, oldLine: 1, newLine: 1, path: 'a.ts' }),
    // pure del (LEFT only)
    splitChangeRow({ rowIndex: 1, oldLine: 2, newLine: null, path: 'a.ts' }),
    splitChangeRow({ rowIndex: 2, oldLine: 3, newLine: null, path: 'a.ts' }),
    // pure add (RIGHT only)
    splitChangeRow({ rowIndex: 3, oldLine: null, newLine: 2, path: 'a.ts' }),
    splitChangeRow({ rowIndex: 4, oldLine: null, newLine: 3, path: 'a.ts' }),
    // context both sides
    splitChangeRow({ rowIndex: 5, oldLine: 4, newLine: 4, path: 'a.ts' }),
    splitChangeRow({ rowIndex: 6, oldLine: 5, newLine: 5, path: 'a.ts' }),
  ];

  test('sticky multi is not single-line caret; head index trusted', () => {
    let sel = beginLineSelection(rows[0], 'RIGHT');
    sel = extendLineSelection(sel, rows[1]);
    sel = extendLineSelection(sel, rows[2]);
    expect(sel.headRowIndex).toBe(2);
    expect(sel.headSide).toBe('RIGHT');
    // headLine still last RIGHT line (sticky)
    expect(sel.headLine).toBe(1);
    expect(isSingleLineCaretSelection(sel)).toBe(false);
    expect(isMultiLineBodySelection(sel)).toBe(true);
    // resolve must not snap head back to row 0
    expect(resolveSelectionHeadIndex(sel, rows)).toBe(2);
  });

  test('Shift+ArrowDown continues past del/add opposing block', () => {
    let sel = beginLineSelection(rows[0], 'RIGHT');
    // Simulate multi already spanning into del block (as in screenshot)
    sel = extendLineSelection(sel, rows[1]);
    sel = extendLineSelection(sel, rows[2]);
    expect(sel.headRowIndex).toBe(2);

    const mid = moveLineSelection(sel, rows, 1, {
      shift: true,
      activeFilePath: 'a.ts',
    });
    expect(mid.headRowIndex).toBe(3);

    const further = moveLineSelection(mid, rows, 1, {
      shift: true,
      activeFilePath: 'a.ts',
    });
    expect(further.headRowIndex).toBe(4);

    const past = moveLineSelection(further, rows, 2, {
      shift: true,
      activeFilePath: 'a.ts',
    });
    expect(past.headRowIndex).toBe(6);
  });
});

describe('resolveSelectionIslandRevealPhase (shipped idle-reveal path)', () => {
  test('file header selection reveals actions (not comment)', () => {
    const fileSel = beginSelectionOnRow({
      kind: 'file-header',
      filePath: 'a.ts',
      rowIndex: 0,
    });
    expect(isFileLevelSelection(fileSel)).toBe(true);
    expect(resolveSelectionIslandRevealPhase(fileSel)).toBe('actions');
  });

  test('line selection reveals actions', () => {
    const line = beginLineSelection(
      splitChangeRow({ rowIndex: 1, oldLine: 1, newLine: 1 }),
      'RIGHT'
    );
    expect(resolveSelectionIslandRevealPhase(line)).toBe('actions');
  });

  test('thread caret hides line island', () => {
    const thr = beginSelectionOnRow({
      kind: 'inline-comment',
      filePath: 'a.ts',
      rowIndex: 2,
      commentId: 9,
      newLine: 3,
    });
    expect(isThreadSelection(thr)).toBe(true);
    expect(resolveSelectionIslandRevealPhase(thr)).toBe('hidden');
  });

  test('PrModalApp scheduleSelectionActionsReveal uses pure reveal phase', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const app = fs.readFileSync(
      path.join(__dirname, '../src/modal/app/PrModalApp.impl.tsx'),
      'utf8'
    );
    expect(app).toMatch(/resolveSelectionIslandRevealPhase/);
    // Must not force file → comment inside the reveal timer
    expect(app).not.toMatch(
      /lineSelection\.kind === 'file'[\s\S]{0,200}setSelectionIslandPhase\('comment'\)/
    );
  });

  test('SelectionCommentBar: file actions + Back from comment', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const src = fs.readFileSync(
      path.join(__dirname, '../src/modal/views/diff/SelectionCommentBar.tsx'),
      'utf8'
    );
    expect(src).not.toMatch(/isFileTarget\s*\?\s*['"]comment['"]/);
    expect(src).toMatch(/data-file-target/);
    expect(src).toMatch(/data-prp-selection-back/);
    // Back must not be gated only for non-file
    expect(src).not.toMatch(/\{!isFileTarget \?\s*\([\s\S]*?Back[\s\S]*?\)\s*:\s*null\}/);
  });
});

describe('file-level extractSelectedCodeText = whole file body', () => {
  test('file selection copies all selectable lines for path', () => {
    const rows = [
      { kind: 'file-header', filePath: 'a.ts', rowIndex: 0 },
      {
        ...splitChangeRow({ rowIndex: 1, oldLine: 1, newLine: 1, path: 'a.ts' }),
        rightCode: 'line-one',
        leftCode: 'old-one',
      },
      {
        ...splitChangeRow({ rowIndex: 2, oldLine: 2, newLine: 2, path: 'a.ts' }),
        rightCode: 'line-two',
        leftCode: 'old-two',
      },
      { kind: 'file-header', filePath: 'b.ts', rowIndex: 3 },
      {
        ...splitChangeRow({ rowIndex: 4, oldLine: 1, newLine: 1, path: 'b.ts' }),
        rightCode: 'other',
        leftCode: 'other-old',
      },
    ];
    const fileSel = beginSelectionOnRow(rows[0]);
    expect(isFileLevelSelection(fileSel)).toBe(true);
    const text = extractSelectedCodeText(rows, fileSel);
    expect(text).toBe('line-one\nline-two');
    expect(text.includes('other')).toBe(false);
  });
});
