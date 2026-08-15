/**
 * Split-view line selection: side stickiness + visual helpers.
 */
import { describe, expect, test } from '@rstest/core';
import fs from 'node:fs';
import path from 'node:path';
import {
  beginLineSelection,
  beginSelectionOnRow,
  extendLineSelection,
  extractSelectedCodeText,
  firstSelectableRowAnywhere,
  firstSelectableRowInFile,
  firstContentNavRowInFile,
  isCodeBodySelection,
  isFileLevelSelection,
  isMultiLineBodySelection,
  isSingleLineCaretSelection,
  isThreadSelection,
  lineForSideStrict,
  moveLineSelection,
  coalesceSelectionMoveDelta,
  rebindSelectionRowIndices,
  resolveSelectionHeadIndex,
  resolveSelectionIslandRevealPhase,
  resolveSelectionDockVerticalPlacement,
  selectionDockSideNeed,
  selectionHeadBlockRole,
  preferredOptHintPlacementForDock,
  isSelectionDockHostRow,
  SELECTION_DOCK_OPT_HINT_H_EST,
  shouldShowSelectionActionGroup,
  jumpSelectionToAdjacentChangeRegion,
  listChangeRegions,
  buildChangeRegionIndex,
  isChangeRegionIndexValid,
  findChangeRegionIndexContaining,
  isChangedDiffLineRow,
  rowSelectionVisualKey,
  selectionActiveSide,
  shouldUseNativeTextSelectOnDrag,
  isOptHeldForPointerDrag,
  applySelectionPointerDown,
  browserSelectionCopyText,
} from '../src/modal/lib/line-selection';

function splitChangeRow(opts: {
  rowIndex: number;
  oldLine?: number | null;
  newLine?: number | null;
  path?: string;
  lineType?: string;
}) {
  return {
    kind: 'diff-line',
    lineType: opts.lineType || 'change',
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
  test('ArrowDown with null selection seeds first content stop (body line)', () => {
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

  test('ArrowDown seeds file-level review thread before first body line', () => {
    const rows = [
      { kind: 'file-header', filePath: 'a.ts', rowIndex: 0 },
      {
        kind: 'inline-comment',
        filePath: 'a.ts',
        rowIndex: 1,
        commentId: 99,
        subjectType: 'file',
        side: 'RIGHT',
        newLine: null,
        oldLine: null,
      },
      splitChangeRow({ rowIndex: 2, oldLine: 1, newLine: 1, path: 'a.ts' }),
      splitChangeRow({ rowIndex: 3, oldLine: 2, newLine: 2, path: 'a.ts' }),
    ];
    // Body-line helper still points at first line (index 2)
    expect(firstSelectableRowInFile(rows, 'a.ts')?.rowIndex).toBe(2);
    // Content nav / seed follows scroll order: thread under header first
    const seeded = moveLineSelection(null, rows, 1, {
      activeFilePath: 'a.ts',
    });
    expect(isThreadSelection(seeded)).toBe(true);
    expect(seeded.commentId).toBe(99);
    expect(seeded.headRowIndex).toBe(1);
    // Next ↓ leaves thread for first body line
    const moved = moveLineSelection(seeded, rows, 1, {
      activeFilePath: 'a.ts',
    });
    expect(isThreadSelection(moved)).toBe(false);
    expect(moved.headRowIndex).toBe(2);
    expect(moved.headLine).toBe(1);
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

  test('ArrowUp from line below re-enters thread (P3c reverse continuum)', () => {
    const onLineBelow = beginSelectionOnRow(rows[3], 'RIGHT', 3);
    expect(isThreadSelection(onLineBelow)).toBe(false);
    const up = moveLineSelection(onLineBelow, rows, -1, {
      activeFilePath: 'a.ts',
    });
    expect(isThreadSelection(up)).toBe(true);
    expect(up.commentId).toBe(42);
    expect(Number(up.headRowIndex)).toBe(2);
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

describe('resolveSelectionIslandRevealPhase (supported phase, not auto-show)', () => {
  test('file header selection supports actions phase', () => {
    const fileSel = beginSelectionOnRow({
      kind: 'file-header',
      filePath: 'a.ts',
      rowIndex: 0,
    });
    expect(isFileLevelSelection(fileSel)).toBe(true);
    expect(resolveSelectionIslandRevealPhase(fileSel)).toBe('actions');
  });

  test('line selection supports actions phase', () => {
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
});

describe('resolveSelectionDockVerticalPlacement (flip above when tight below)', () => {
  test('prefers below when enough room under host', () => {
    expect(
      resolveSelectionDockVerticalPlacement({
        hostTop: 100,
        hostBottom: 120,
        dockHeight: 40,
        clipTop: 0,
        clipBottom: 400,
        phase: 'actions',
        includeOptHints: true,
        headBlockRole: 'only',
      })
    ).toBe('below');
  });

  test('flips above when below is tight and above has room (comment form)', () => {
    expect(
      resolveSelectionDockVerticalPlacement({
        hostTop: 500,
        hostBottom: 520,
        dockHeight: 180,
        clipTop: 80,
        clipBottom: 560,
        gap: 8,
        phase: 'comment',
        includeOptHints: false,
        headBlockRole: 'only',
      })
    ).toBe('above');
  });

  test('defaults below on incomplete geometry', () => {
    expect(resolveSelectionDockVerticalPlacement({})).toBe('below');
  });

  test('action floatbar flips above near Diff bottom (need includes Opt hints)', () => {
    const need = selectionDockSideNeed({
      dockHeight: 40,
      phase: 'actions',
      includeOptHints: true,
      gap: 0,
    });
    expect(need).toBeGreaterThanOrEqual(40 + SELECTION_DOCK_OPT_HINT_H_EST);
    expect(
      resolveSelectionDockVerticalPlacement({
        hostTop: 520,
        hostBottom: 540,
        dockHeight: 40,
        clipTop: 80,
        clipBottom: 560,
        gap: 6,
        phase: 'actions',
        includeOptHints: true,
        headBlockRole: 'only',
      })
    ).toBe('above');
  });

  test('multi-line head-at-start prefers above (outward from block)', () => {
    // Caret mid-viewport; selection extends down near scroller bottom.
    // Must not treat space under the caret into the block as free room.
    expect(
      resolveSelectionDockVerticalPlacement({
        hostTop: 300,
        hostBottom: 320,
        selectionTop: 300,
        selectionBottom: 520,
        dockHeight: 40,
        clipTop: 80,
        clipBottom: 560,
        gap: 6,
        phase: 'actions',
        includeOptHints: true,
        headBlockRole: 'start',
      })
    ).toBe('above');
  });

  test('multi-line head-at-end stays below when block bottom has room', () => {
    expect(
      resolveSelectionDockVerticalPlacement({
        hostTop: 200,
        hostBottom: 220,
        selectionTop: 100,
        selectionBottom: 220,
        dockHeight: 40,
        clipTop: 80,
        clipBottom: 600,
        phase: 'actions',
        includeOptHints: true,
        headBlockRole: 'end',
      })
    ).toBe('below');
  });
});

describe('selectionHeadBlockRole / preferredOptHintPlacementForDock', () => {
  test('head at min index → start; max → end', () => {
    expect(
      selectionHeadBlockRole({
        filePath: 'a.ts',
        anchorRowIndex: 10,
        headRowIndex: 5,
        anchorLine: 10,
        headLine: 5,
      })
    ).toBe('start');
    expect(
      selectionHeadBlockRole({
        filePath: 'a.ts',
        anchorRowIndex: 5,
        headRowIndex: 10,
        anchorLine: 5,
        headLine: 10,
      })
    ).toBe('end');
  });

  test('Opt hint place follows dock place', () => {
    expect(preferredOptHintPlacementForDock('above')).toBe('top');
    expect(preferredOptHintPlacementForDock('below')).toBe('bottom');
  });
});

describe('isSelectionDockHostRow (caret host)', () => {
  test('multi-line docks on head not range end when head is start', () => {
    const sel = {
      filePath: 'a.ts',
      anchorRowIndex: 10,
      headRowIndex: 5,
      anchorLine: 10,
      headLine: 5,
      anchorSide: 'RIGHT',
      headSide: 'RIGHT',
    };
    const headRow = {
      kind: 'diff-line',
      lineType: 'context',
      filePath: 'a.ts',
      rowIndex: 5,
      newLine: 5,
      oldLine: 5,
    };
    const endRow = {
      kind: 'diff-line',
      lineType: 'context',
      filePath: 'a.ts',
      rowIndex: 10,
      newLine: 10,
      oldLine: 10,
    };
    expect(isSelectionDockHostRow(sel, headRow)).toBe(true);
    expect(isSelectionDockHostRow(sel, endRow)).toBe(false);
  });
});

describe('shouldShowSelectionActionGroup (Opt / hover / comment)', () => {
  test('selection alone does not show', () => {
    expect(
      shouldShowSelectionActionGroup({
        hasLineOrFileSelection: true,
        selecting: false,
        optHeld: false,
        hoverReveal: false,
        phase: 'actions',
      })
    ).toBe(false);
  });

  test('Opt-hold shows actions', () => {
    expect(
      shouldShowSelectionActionGroup({
        hasLineOrFileSelection: true,
        optHeld: true,
        phase: 'actions',
      })
    ).toBe(true);
  });

  test('hover shows actions', () => {
    expect(
      shouldShowSelectionActionGroup({
        hasLineOrFileSelection: true,
        hoverReveal: true,
        phase: 'actions',
      })
    ).toBe(true);
  });

  test('comment phase stays open without Opt/hover', () => {
    expect(
      shouldShowSelectionActionGroup({
        hasLineOrFileSelection: true,
        optHeld: false,
        hoverReveal: false,
        phase: 'comment',
      })
    ).toBe(true);
  });

  test('selecting drag hides dock', () => {
    expect(
      shouldShowSelectionActionGroup({
        hasLineOrFileSelection: true,
        selecting: true,
        optHeld: true,
        phase: 'actions',
      })
    ).toBe(false);
  });

  test('selection nav busy hides dock even with Opt', () => {
    expect(
      shouldShowSelectionActionGroup({
        hasLineOrFileSelection: true,
        optHeld: true,
        selectionNavBusy: true,
        phase: 'actions',
      })
    ).toBe(false);
  });

  test('comment phase stays open during selection nav busy', () => {
    expect(
      shouldShowSelectionActionGroup({
        hasLineOrFileSelection: true,
        selectionNavBusy: true,
        phase: 'comment',
      })
    ).toBe(true);
  });

  test('no selection never shows', () => {
    expect(
      shouldShowSelectionActionGroup({
        hasLineOrFileSelection: false,
        optHeld: true,
      })
    ).toBe(false);
  });
});

describe('jumpSelectionToAdjacentChangeRegion (⌥↑/⌥↓ next/prev change)', () => {
  function ctxRow(i: number, line: number) {
    return {
      kind: 'diff-line',
      lineType: 'context',
      filePath: 'a.ts',
      rowIndex: i,
      oldLine: line,
      newLine: line,
      leftCode: 'ctx',
      rightCode: 'ctx',
    };
  }

  /** Two change regions separated by context (and a hunk header gap). */
  const multiRegionRows = [
    { kind: 'file-header', filePath: 'a.ts', rowIndex: 0 },
    // region A: two changed lines
    splitChangeRow({ rowIndex: 1, oldLine: 1, newLine: 1, lineType: 'add' }),
    splitChangeRow({ rowIndex: 2, oldLine: null, newLine: 2, lineType: 'add' }),
    // break
    ctxRow(3, 3),
    ctxRow(4, 4),
    // region B: three changed lines (would be "huge" if fully selected)
    splitChangeRow({ rowIndex: 5, oldLine: 5, newLine: 5, lineType: 'del' }),
    splitChangeRow({ rowIndex: 6, oldLine: 6, newLine: null, lineType: 'del' }),
    splitChangeRow({ rowIndex: 7, oldLine: 7, newLine: 7, lineType: 'change' }),
    ctxRow(8, 8),
    // region C
    splitChangeRow({ rowIndex: 9, oldLine: null, newLine: 9, lineType: 'add' }),
  ];

  test('listChangeRegions finds three regions', () => {
    const regs = listChangeRegions(multiRegionRows);
    expect(regs.map((r) => r.startIndex)).toEqual([1, 5, 9]);
    expect(regs[0].endIndex).toBe(2);
    expect(regs[1].endIndex).toBe(7);
    expect(isChangedDiffLineRow(multiRegionRows[1])).toBe(true);
    expect(isChangedDiffLineRow(multiRegionRows[3])).toBe(false);
  });

  test('⌥↓ from region A first line → first line of region B only', () => {
    const start = beginLineSelection(multiRegionRows[1], 'RIGHT', 1);
    const next = jumpSelectionToAdjacentChangeRegion(
      start,
      multiRegionRows,
      1
    );
    expect(next).toBeTruthy();
    expect(next.headRowIndex).toBe(5);
    expect(next.anchorRowIndex).toBe(5);
    expect(next.headLine).toBe(next.anchorLine);
    // Single-line: not the whole region B (indices 5–7)
    expect(next.headRowIndex).not.toBe(7);
  });

  test('⌥↑ from region B → first line of region A', () => {
    const start = beginLineSelection(multiRegionRows[6], 'RIGHT', 6);
    const prev = jumpSelectionToAdjacentChangeRegion(
      start,
      multiRegionRows,
      -1
    );
    expect(prev.headRowIndex).toBe(1);
    expect(prev.anchorRowIndex).toBe(1);
  });

  test('at last region ⌥↓ stays single-line first of last region (no wrap)', () => {
    const start = beginLineSelection(multiRegionRows[9], 'RIGHT', 9);
    const next = jumpSelectionToAdjacentChangeRegion(
      start,
      multiRegionRows,
      1
    );
    expect(next.headRowIndex).toBe(9);
    expect(next.anchorRowIndex).toBe(9);
  });

  test('null selection ⌥↓ seeds first change region first line', () => {
    const next = jumpSelectionToAdjacentChangeRegion(
      null,
      multiRegionRows,
      1
    );
    expect(next.headRowIndex).toBe(1);
  });

  test('buildChangeRegionIndex matches listChangeRegions starts/ends', () => {
    const index = buildChangeRegionIndex(multiRegionRows);
    const regs = listChangeRegions(multiRegionRows);
    expect(index.starts).toEqual(regs.map((r) => r.startIndex));
    expect(index.ends).toEqual(regs.map((r) => r.endIndex));
    expect(index.regionCount).toBe(3);
    expect(isChangeRegionIndexValid(index, multiRegionRows)).toBe(true);
    expect(isChangeRegionIndexValid(index, multiRegionRows.slice(0, 3))).toBe(
      false
    );
    expect(findChangeRegionIndexContaining(index, 6)).toBe(1);
    expect(findChangeRegionIndexContaining(index, 3)).toBe(-1);
  });

  test('prebuilt index hop matches cold jump (semantics)', () => {
    const index = buildChangeRegionIndex(multiRegionRows);
    const start = beginLineSelection(multiRegionRows[1], 'RIGHT', 1);
    const withIdx = jumpSelectionToAdjacentChangeRegion(
      start,
      multiRegionRows,
      1,
      undefined,
      index
    );
    const cold = jumpSelectionToAdjacentChangeRegion(
      start,
      multiRegionRows,
      1
    );
    expect(withIdx.headRowIndex).toBe(cold.headRowIndex);
    expect(withIdx.headRowIndex).toBe(5);
  });

  test('hop with prebuilt index does not re-scan all rows', () => {
    const n = 40_000;
    /** Regions at 0..9, 1000..1009, … every 1000 (40 regions). */
    const rows: any[] = new Array(n);
    for (let i = 0; i < n; i++) {
      const inRegion = i % 1000 < 10;
      if (inRegion) {
        rows[i] = {
          kind: 'diff-line',
          lineType: 'add',
          filePath: 'big.ts',
          rowIndex: i,
          oldLine: null,
          newLine: i + 1,
          leftCode: '',
          rightCode: 'x',
        };
      } else {
        rows[i] = {
          kind: 'diff-line',
          lineType: 'context',
          filePath: 'big.ts',
          rowIndex: i,
          oldLine: i + 1,
          newLine: i + 1,
          leftCode: 'c',
          rightCode: 'c',
        };
      }
    }
    const index = buildChangeRegionIndex(rows);
    expect(index.regionCount).toBe(40);
    expect(index.starts[0]).toBe(0);
    expect(index.starts[1]).toBe(1000);

    let indexedReads = 0;
    const proxied = new Proxy(rows, {
      get(target, prop, receiver) {
        if (prop === 'length') return target.length;
        if (typeof prop === 'string' && /^\d+$/.test(prop)) {
          indexedReads += 1;
          return target[Number(prop)];
        }
        if (prop === Symbol.iterator) {
          // Forbid full for-of / spread scans through the proxy
          throw new Error('unexpected full list iteration during hop');
        }
        return Reflect.get(target, prop, receiver);
      },
    });

    const start = beginLineSelection(rows[0], 'RIGHT', 0);
    // 20 hops forward with the same prebuilt index
    let sel = start;
    for (let h = 0; h < 20; h++) {
      const before = indexedReads;
      sel = jumpSelectionToAdjacentChangeRegion(
        sel,
        proxied,
        1,
        undefined,
        index
      );
      // Each hop should only touch the target first row (beginLineSelection),
      // not walk tens of thousands of rows.
      expect(indexedReads - before).toBeLessThan(30);
    }
    expect(sel.headRowIndex).toBe(20_000);
    // Total reads across 20 hops must be far below one full list scan
    expect(indexedReads).toBeLessThan(n / 10);

    // Cold path without index would scan ~n rows per hop; prove rebuild is
    // separate: one buildChangeRegionIndex is O(n), hops reuse starts.
    const t0 = performance.now();
    for (let h = 0; h < 50; h++) {
      jumpSelectionToAdjacentChangeRegion(
        start,
        rows,
        1,
        undefined,
        index
      );
    }
    const indexedMs = performance.now() - t0;
    const t1 = performance.now();
    for (let h = 0; h < 50; h++) {
      jumpSelectionToAdjacentChangeRegion(start, rows, 1);
    }
    const coldMs = performance.now() - t1;
    // Indexed hops should be meaningfully cheaper than full re-scan (or at
    // least not slower on tiny CI noise). Soft gate: cold spends more time.
    // On very fast machines both can be ~0; then skip ratio assert.
    if (coldMs > 2 && indexedMs > 0) {
      expect(coldMs).toBeGreaterThan(indexedMs * 1.5);
    }
  });
});

describe('optArrow shell wiring (static)', () => {
  test('PrModalShell caches region index and rAF-coalesces ⌥↑/⌥↓', () => {
    const shell = [
      'src/modal/app/PrModalShell.tsx',
      'src/modal/hooks/useDiffConversationNav.ts',
      'src/modal/hooks/useSelectionKeyboard.ts',
    ]
      .map((rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'))
      .join('\n');
    expect(shell).toMatch(/buildChangeRegionIndex/);
    expect(shell).toMatch(/getChangeRegionIndexForList/);
    expect(shell).toMatch(/changeRegionIndexRef/);
    expect(shell).toMatch(/optArrowRafRef/);
    expect(shell).toMatch(/pendingOptArrowDirRef/);
    expect(shell).toMatch(/applyOptArrowScrollSelect/);
    // Passes prebuilt index into pure hop
    expect(shell).toMatch(
      /jumpSelectionToAdjacentChangeRegion\(\s*st\.lineSelection,\s*list,\s*d,\s*undefined,\s*regionIndex\s*\)/s
    );
  });

  test('selection hop uses thrifted index scroll; thread unit only uses DOM reveal', () => {
    const shell = [
      'src/modal/app/PrModalShell.tsx',
      'src/modal/hooks/useDiffConversationNav.ts',
      'src/modal/hooks/useSelectionKeyboard.ts',
    ]
      .map((rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'))
      .join('\n');
    // Line hop path (1.9.6 thrift)
    expect(shell).toMatch(/function scrollSelectionCaretAfterHop/);
    expect(shell).toMatch(/function scrollSelectionHeadDomOnly/);
    // flush uses sync index scroll on line hops (not double-rAF for all)
    const flushIdx = shell.indexOf('function flushSelectionKeyboardMove');
    expect(flushIdx).toBeGreaterThan(0);
    const flushBlock = shell.slice(flushIdx, flushIdx + 14000);
    expect(flushBlock).toMatch(/scrollSelectionHeadDomOnly\(nextSel\)/);
    // Multi-reply entry settles root + directional unit in one store commit.
    expect(flushBlock).toMatch(
      /useModalStore\.setState\(\{[\s\S]*?lineSelection: nextSel,[\s\S]*?activeDiffCommentId: rootId,[\s\S]*?focusedThreadUnitId: unitId,[\s\S]*?commentIndex: nextCommentIndex/
    );
    // Mounted single-comment threads also use DOM visibility, not row offsets.
    expect(flushBlock).toMatch(
      /scrollFocusedThreadUnitIntoView\(rootId,[\s\S]*?live\.lineSelection \|\| nextSel/
    );
    const reenterIdx = shell.indexOf('function tryReenterExitedMultiReply');
    expect(reenterIdx).toBeGreaterThan(0);
    const reenterBlock = shell.slice(reenterIdx, reenterIdx + 5000);
    expect(reenterBlock).not.toMatch(/jumpToReviewComment\(\{/);
    expect(reenterBlock).toMatch(
      /useModalStore\.setState\(\{[\s\S]*?lineSelection: pinned,[\s\S]*?activeDiffCommentId: rootId,[\s\S]*?focusedThreadUnitId: unitId/
    );
    const inlineThread = fs.readFileSync(
      path.join(__dirname, '..', 'src/modal/views/diff/InlineThread.tsx'),
      'utf8'
    );
    expect(inlineThread).toMatch(
      /useShallow\(\(s\) => \(\{[\s\S]*?contextActive:[\s\S]*?focusedThreadUnitId:/
    );
    expect(shell).toMatch(/function scrollDiffThreadUnitIntoView/);
    // Store thrift restored (not 0.5 on every reveal)
    expect(shell).toMatch(/minStoreDelta:\s*Math\.max\(24,\s*h\s*\*\s*2\)/);
    // File nav same-path short-circuit
    const onSel = shell.indexOf('function onSelectFile');
    expect(onSel).toBeGreaterThan(0);
    expect(shell.slice(onSel, onSel + 900)).toMatch(/Same-file re-select/);
    // replies hot path uses threadsByCommentId (no regroup every hop)
    const repliesIdx = shell.indexOf('function repliesForRootCommentId');
    expect(repliesIdx).toBeGreaterThan(0);
    expect(shell.slice(repliesIdx, repliesIdx + 800)).toMatch(
      /threadsByCommentId/
    );
  });

  test('usePrModalHotkeys has Diff ↑↓ fast path before GH palette touch', () => {
    const hk = fs.readFileSync(
      path.join(__dirname, '..', 'src/modal/hooks/usePrModalHotkeys.ts'),
      'utf8'
    );
    const onKey = hk.indexOf('const onKey = (e');
    expect(onKey).toBeGreaterThan(0);
    const body = hk.slice(onKey, onKey + 6000);
    const fast = body.indexOf('Diff ↑/↓ / Shift+↑↓ hot path');
    const ghInOnKey = body.indexOf('touchGithubCommandPaletteOpen');
    expect(fast).toBeGreaterThan(0);
    expect(ghInOnKey).toBeGreaterThan(fast);
    expect(body).toMatch(/applySelectionKeyboardMove/);
    expect(body).toMatch(/navFile/);
    expect(body).toMatch(/optArrowScrollSelect/);
  });
});

describe('shouldUseNativeTextSelectOnDrag (Opt+drag text mode)', () => {
  test('default plain drag is line-selection (false)', () => {
    expect(shouldUseNativeTextSelectOnDrag({})).toBe(false);
    expect(shouldUseNativeTextSelectOnDrag({ altKey: false })).toBe(false);
  });

  test('altKey or optHeld → native text mode', () => {
    expect(shouldUseNativeTextSelectOnDrag({ altKey: true })).toBe(true);
    expect(shouldUseNativeTextSelectOnDrag({ optHeld: true })).toBe(true);
  });

  test('meta/ctrl suppress native text gate (do not steal cmd-click)', () => {
    expect(
      shouldUseNativeTextSelectOnDrag({ altKey: true, metaKey: true })
    ).toBe(false);
    expect(
      shouldUseNativeTextSelectOnDrag({ altKey: true, ctrlKey: true })
    ).toBe(false);
  });

  test('isOptHeldForPointerDrag reads event altKey and data-prp-opt-held', () => {
    expect(isOptHeldForPointerDrag({ altKey: true })).toBe(true);
    expect(isOptHeldForPointerDrag({ altKey: false })).toBe(false);
    // Minimal DOM stub
    const root = {
      getAttribute: (k: string) => (k === 'data-prp-opt-held' ? '1' : null),
      hasAttribute: (k: string) => k === 'data-prp-opt-held',
      classList: { contains: () => false },
    };
    const doc = { documentElement: root, body: null } as any;
    expect(isOptHeldForPointerDrag({ altKey: false }, doc)).toBe(true);
  });

  test('applySelectionPointerDown returns native-text when Opt held', () => {
    const row = {
      kind: 'diff-line',
      lineType: 'add',
      filePath: 'a.ts',
      rowIndex: 1,
      oldLine: null,
      newLine: 1,
      leftCode: '',
      rightCode: 'hello',
    };
    const plain = applySelectionPointerDown(null, row, { shiftKey: false });
    expect(plain.mode).toBe('begin');
    expect(plain.selection).toBeTruthy();

    const opt = applySelectionPointerDown(null, row, {
      altKey: true,
      preferredSide: 'RIGHT',
    });
    expect(opt.mode).toBe('native-text');
    // Does not replace selection with a new line caret
    expect(opt.selection).toBe(null);
  });

  test('file header click begins file caret even when Opt is held', () => {
    const header = {
      kind: 'file-header',
      filePath: 'a.ts',
      rowIndex: 0,
    };
    const leftover = {
      filePath: 'a.ts',
      anchorLine: 1,
      headLine: 8,
      anchorRowIndex: 1,
      headRowIndex: 8,
      anchorSide: 'RIGHT',
      headSide: 'RIGHT',
    };
    const started = applySelectionPointerDown(leftover, header, {
      altKey: true,
      optHeld: true,
      preferredSide: 'RIGHT',
    });
    expect(started.mode).toBe('begin');
    expect(started.selection?.kind || started.selection?.subjectType).toBe(
      'file'
    );
    expect(started.selection?.filePath).toBe('a.ts');
  });

  test('VirtualDiffRows Opt path skips preventDefault; notifies shell for auto-copy', () => {
    const rows = fs.readFileSync(
      path.join(__dirname, '..', 'src/modal/views/diff/VirtualDiffRows.tsx'),
      'utf8'
    );
    expect(rows).toMatch(/shouldUseNativeTextSelectOnDrag/);
    expect(rows).toMatch(/isOptHeldForPointerDrag/);
    expect(rows).toMatch(/nativeTextSelect:\s*true/);
    // Opt branch notifies onSelectionStart then returns before preventDefault
    const idx = rows.indexOf('const nativeText');
    expect(idx).toBeGreaterThan(0);
    const block = rows.slice(idx, idx + 900);
    expect(block).toMatch(/if \(nativeText\) \{/);
    expect(block).toMatch(/nativeTextSelect:\s*true/);
    const nativeIf = block.indexOf('if (nativeText)');
    const prevent = block.indexOf('preventDefault');
    expect(prevent).toBeGreaterThan(nativeIf);
  });

  test('browserSelectionCopyText trims empty-only selections', () => {
    expect(browserSelectionCopyText(null)).toBe('');
    expect(browserSelectionCopyText({ toString: () => '   ' })).toBe('');
    expect(browserSelectionCopyText({ toString: () => '  hello  ' })).toBe(
      '  hello  '
    );
    expect(browserSelectionCopyText({ toString: () => 'foo\nbar' })).toBe(
      'foo\nbar'
    );
  });

  test('shell arms native text auto-copy on Opt+drag start', () => {
    const shell = fs.readFileSync(
      path.join(__dirname, '..', 'src/modal/app/PrModalShell.tsx'),
      'utf8'
    );
    expect(shell).toMatch(/armNativeTextSelectCopy/);
    expect(shell).toMatch(/finishNativeTextSelectCopy/);
    expect(shell).toMatch(/browserSelectionCopyText/);
    expect(shell).toMatch(/toast_text_copied/);
    expect(shell).toMatch(/data-prp-last-copied-text/);
  });

  test('usePrModalHotkeys clears data-prp-opt-held on close and effect cleanup', () => {
    const hotkeys = fs.readFileSync(
      path.join(__dirname, '..', 'src/modal/hooks/usePrModalHotkeys.ts'),
      'utf8'
    );
    expect(hotkeys).toMatch(/stampOptHeldAttr/);
    // open === false branch must unstamp (not only reset refs)
    const closedIdx = hotkeys.indexOf('if (!open)');
    expect(closedIdx).toBeGreaterThan(0);
    const closedBlock = hotkeys.slice(closedIdx, closedIdx + 350);
    expect(closedBlock).toMatch(/stampOptHeldAttr\(false\)/);
    // Effect cleanup return must force-clear sticky latch after removeEventListener
    const cleanupIdx = hotkeys.indexOf('return () =>');
    expect(cleanupIdx).toBeGreaterThan(0);
    const cleanupBlock = hotkeys.slice(cleanupIdx, cleanupIdx + 550);
    expect(cleanupBlock).toMatch(/removeEventListener\('keyup'/);
    expect(cleanupBlock).toMatch(/stampOptHeldAttr\(false\)/);
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

/**
 * Long Diff travel then ↑ must move to a previous nav stop (not invert).
 * Synthetic multi-kind rows: headers, lines, threads — mirrors large PR #2647.
 */
describe('selectionNeedsSeed / activeFilePath lag (key-hold cross-file)', () => {
  test('↓ with activeFilePath still on previous file does not jump to that file top', () => {
    const rows: any[] = [];
    let idx = 0;
    rows.push({ kind: 'file-header', filePath: 'a.ts', rowIndex: idx++ });
    for (let L = 1; L <= 5; L++) {
      rows.push(
        splitChangeRow({
          rowIndex: idx++,
          oldLine: L,
          newLine: L,
          path: 'a.ts',
        })
      );
    }
    rows.push({ kind: 'file-header', filePath: 'b.ts', rowIndex: idx++ });
    for (let L = 1; L <= 5; L++) {
      rows.push(
        splitChangeRow({
          rowIndex: idx++,
          oldLine: L,
          newLine: L,
          path: 'b.ts',
        })
      );
    }
    // Caret already on b.ts line 2 (after natural ↓ cross-file); tree active still a.ts
    const onB2 = rows.find(
      (r) => r.filePath === 'b.ts' && r.newLine === 2
    );
    expect(onB2).toBeTruthy();
    let sel = beginLineSelection(onB2);
    expect(sel?.filePath).toBe('b.ts');
    expect(Number(sel?.headLine)).toBe(2);
    // Stale activeFilePath = a.ts used to reseed to a.ts first line (jump UP)
    const next = moveLineSelection(sel, rows, 1, {
      activeFilePath: 'a.ts',
    });
    expect(next.filePath).toBe('b.ts');
    expect(Number(next.headLine)).toBe(3);
    expect(Number(next.headRowIndex)).toBeGreaterThan(Number(sel!.headRowIndex));
  });
});

describe('moveLineSelection long-travel then up (direction monotonic)', () => {
  function buildLongRows() {
    const rows: any[] = [];
    let idx = 0;
    const pushHeader = (path: string) => {
      rows.push({ kind: 'file-header', filePath: path, rowIndex: idx++ });
    };
    const pushLine = (path: string, line: number) => {
      rows.push(
        splitChangeRow({
          rowIndex: idx++,
          oldLine: line,
          newLine: line,
          path,
        })
      );
    };
    const pushThread = (path: string, commentId: number, line: number) => {
      rows.push({
        kind: 'inline-comment',
        filePath: path,
        rowIndex: idx++,
        commentId,
        side: 'RIGHT',
        newLine: line,
        oldLine: null,
      });
    };
    pushHeader('a.ts');
    for (let L = 1; L <= 20; L++) {
      pushLine('a.ts', L);
      if (L % 5 === 0) pushThread('a.ts', 1000 + L, L);
    }
    pushHeader('b.ts');
    for (let L = 1; L <= 25; L++) {
      pushLine('b.ts', L);
      if (L % 7 === 0) pushThread('b.ts', 2000 + L, L);
    }
    pushHeader('c.ts');
    for (let L = 1; L <= 15; L++) pushLine('c.ts', L);
    return rows;
  }

  test('50 downs then one up decreases head nav order', () => {
    const rows = buildLongRows();
    let sel = beginLineSelection(rows[1]); // first line of a.ts
    expect(sel).toBeTruthy();
    let prevHead = Number(sel!.headRowIndex);
    for (let i = 0; i < 50; i++) {
      const next = moveLineSelection(sel, rows, 1, {
        activeFilePath: sel!.filePath,
      });
      expect(Number(next.headRowIndex)).toBeGreaterThanOrEqual(prevHead);
      sel = next;
      prevHead = Number(sel.headRowIndex);
    }
    const beforeUp = Number(sel!.headRowIndex);
    const afterUp = moveLineSelection(sel, rows, -1, {
      activeFilePath: sel!.filePath,
    });
    expect(Number(afterUp.headRowIndex)).toBeLessThan(beforeUp);
  });

  test('stale headRowIndex rebind then up still moves previous', () => {
    const rows = buildLongRows();
    // Land deep in the list
    let sel = beginLineSelection(rows[1]);
    for (let i = 0; i < 40; i++) {
      sel = moveLineSelection(sel, rows, 1, { activeFilePath: sel!.filePath });
    }
    const liveHead = Number(sel!.headRowIndex);
    const liveLine = Number(sel!.headLine);
    // Simulate renumber desync: headRowIndex lagging behind identity
    const stale = {
      ...sel!,
      headRowIndex: Math.max(0, liveHead - 8),
      anchorRowIndex: Math.max(0, liveHead - 8),
    };
    const up = moveLineSelection(stale, rows, -1, {
      activeFilePath: stale.filePath,
    });
    // After rebind by line, up must not jump past live head downward
    expect(Number(up.headRowIndex)).toBeLessThanOrEqual(liveHead);
    // Prefer strictly previous line when rebind succeeds
    if (Number.isFinite(liveLine) && Number.isFinite(Number(up.headLine))) {
      expect(Number(up.headLine)).toBeLessThanOrEqual(liveLine);
    }
  });
});

/**
 * Root cause of “↑ moves down after long ↓”: rAF coalesce summed opposite
 * keys into residual stack (12×↓ + 1×↑ ⇒ net +11 down).
 */
/**
 * Hidden @@ hunk rows must not consume rowIndex (array index ≡ rowIndex).
 * Regression for callabo-server #2647: desync made ↑ resolve the wrong head
 * and appear to move down.
 */
describe('diff-rows rowIndex stays sequential (no skip on hidden hunk)', () => {
  test('hidden fully-omitted @@ does not desync rowIndex from array index', async () => {
    // Dynamic import of flatten helper
    const { flattenFilesToVirtualRows } = await import(
      '../src/modal/lib/diff-rows'
    );
    // Two hunks where first is 1,1,1,1 style (hideHunkHeader) without expand —
    // and a normal second hunk. Mirrors collapse chrome that skipped index++.
    const files = [
      {
        filename: 'a.ts',
        patch: [
          '@@ -1,1 +1,1 @@',
          ' context-one',
          '@@ -10,3 +10,3 @@',
          ' line-a',
          '-old',
          '+new',
          ' line-b',
        ].join('\n'),
      },
    ];
    const rows = flattenFilesToVirtualRows(files, 'unified', {
      // no fileLines → no expandAbove for first hunk; hideHunkHeader may apply
    });
    for (let i = 0; i < rows.length; i++) {
      expect(Number(rows[i].rowIndex)).toBe(i);
    }
    // Keyboard: travel down then up must not invert when indices are consistent
    let sel: any = beginLineSelection(rows[1] || rows[0], 'RIGHT', 1);
    if (!sel && rows[0]) sel = beginSelectionOnRow(rows[0], 'RIGHT', 0);
    expect(sel).toBeTruthy();
    const start = Number(sel!.headRowIndex);
    for (let i = 0; i < 5; i++) {
      sel = moveLineSelection(sel, rows, 1, {
        activeFilePath: String(sel!.filePath),
      });
    }
    const mid = Number(sel!.headRowIndex);
    expect(mid).toBeGreaterThanOrEqual(start);
    const up = moveLineSelection(sel, rows, -1, {
      activeFilePath: String(sel!.filePath),
    });
    expect(Number(up.headRowIndex)).toBeLessThan(mid);
  });
});

describe('coalesceSelectionMoveDelta (shipped keyboard batching)', () => {
  test('same-direction downs sum for key-hold', () => {
    let p = coalesceSelectionMoveDelta(null, 1, false);
    p = coalesceSelectionMoveDelta(p, 1, false);
    p = coalesceSelectionMoveDelta(p, 1, false);
    expect(p.delta).toBe(3);
    expect(p.shift).toBe(false);
  });

  test('↑ after residual ↓ discards stack — net is up (not still down)', () => {
    let p: { delta: number; shift: boolean } | null = null;
    // Burst of downs in one frame (key-repeat)
    for (let i = 0; i < 12; i++) {
      p = coalesceSelectionMoveDelta(p, 1, false);
    }
    expect(p!.delta).toBe(12);
    // User taps up — must not net positive
    p = coalesceSelectionMoveDelta(p, -1, false);
    expect(p.delta).toBe(-1);
  });

  test('↓ after residual ↑ discards stack — net is down', () => {
    let p = coalesceSelectionMoveDelta(null, -1, false);
    p = coalesceSelectionMoveDelta(p, -1, false);
    p = coalesceSelectionMoveDelta(p, 1, false);
    expect(p.delta).toBe(1);
  });

  test('shift flag change starts a fresh pending', () => {
    let p = coalesceSelectionMoveDelta(null, 1, false);
    p = coalesceSelectionMoveDelta(p, 1, true);
    expect(p.delta).toBe(1);
    expect(p.shift).toBe(true);
  });

  test('coalesced net applied to moveLineSelection keeps ↑ direction', () => {
    const rows = Array.from({ length: 30 }, (_, i) =>
      splitChangeRow({
        rowIndex: i,
        oldLine: i + 1,
        newLine: i + 1,
        path: 'a.ts',
      })
    );
    let sel = beginLineSelection(rows[5]);
    // Simulate held ↓: net +8
    let pending = coalesceSelectionMoveDelta(null, 1, false);
    for (let i = 0; i < 7; i++) pending = coalesceSelectionMoveDelta(pending, 1, false);
    sel = moveLineSelection(sel, rows, pending.delta, {
      activeFilePath: 'a.ts',
    });
    const afterDown = Number(sel.headRowIndex);
    // User taps ↑ while residual would have been wrong under old sum
    pending = coalesceSelectionMoveDelta(
      { delta: 8, shift: false },
      -1,
      false
    );
    expect(pending.delta).toBe(-1);
    const afterUp = moveLineSelection(sel, rows, pending.delta, {
      activeFilePath: 'a.ts',
    });
    expect(Number(afterUp.headRowIndex)).toBe(afterDown - 1);
  });
});
