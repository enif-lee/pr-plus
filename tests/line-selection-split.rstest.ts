/**
 * Split-view line selection: side stickiness + visual helpers.
 */
import { describe, expect, test } from '@rstest/core';
import {
  beginLineSelection,
  extendLineSelection,
  firstSelectableRowAnywhere,
  lineForSideStrict,
  moveLineSelection,
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

describe('moveLineSelection from folded file', () => {
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

  test('ArrowDown from selection on folded file hops to next open file', () => {
    // Stale selection as if b.ts was selected before fold (old index may be invalid)
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
    expect(next.filePath).toBe('c.ts');
    expect(next.headRowIndex).toBe(5);
    expect(next.headLine).toBe(10);
  });

  test('ArrowUp from selection on folded file hops to previous open file', () => {
    const stale = {
      filePath: 'b.ts',
      anchorLine: 3,
      headLine: 3,
      anchorSide: 'RIGHT',
      headSide: 'RIGHT',
      anchorRowIndex: 99,
      headRowIndex: 99,
    };
    const next = moveLineSelection(stale, afterFoldB, -1, {
      activeFilePath: 'b.ts',
    });
    expect(next).toBeTruthy();
    expect(next.filePath).toBe('a.ts');
    // Nearest selectable above b header is last line of a
    expect(next.headRowIndex).toBe(2);
    expect(next.headLine).toBe(2);
  });

  test('ArrowDown skips multiple collapsed files to first open body', () => {
    const multiCollapsed = [
      { kind: 'file-header', filePath: 'a.ts', rowIndex: 0, collapsed: true },
      { kind: 'file-header', filePath: 'b.ts', rowIndex: 1, collapsed: true },
      { kind: 'file-header', filePath: 'c.ts', rowIndex: 2, collapsed: false },
      splitChangeRow({ rowIndex: 3, oldLine: 1, newLine: 1, path: 'c.ts' }),
    ];
    const stale = {
      filePath: 'a.ts',
      anchorLine: 1,
      headLine: 1,
      anchorSide: 'RIGHT',
      headSide: 'RIGHT',
      anchorRowIndex: 5,
      headRowIndex: 5,
    };
    const next = moveLineSelection(stale, multiCollapsed, 1, {
      activeFilePath: 'a.ts',
    });
    expect(next?.filePath).toBe('c.ts');
    expect(next?.headRowIndex).toBe(3);
  });

  test('Shift+Arrow does not hop out of folded file (extend stays put)', () => {
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
      shift: true,
      activeFilePath: 'b.ts',
    });
    // No same-file selectable rows → unchanged
    expect(next).toBe(stale);
  });
});
