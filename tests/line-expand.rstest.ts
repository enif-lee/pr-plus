/**
 * Diff long-line expand helpers + rowHeightFor integration.
 */
import { describe, expect, test } from '@rstest/core';
import {
  diffLineExpandKey,
  diffLineTextLength,
  isDiffLineExpandable,
  isDiffLineExpanded,
  estimateExpandedLineHeight,
  expandedCodeLineHeight,
  toggleExpandKey,
  LINE_EXPAND_CHAR_THRESHOLD,
} from '../src/modal/lib/line-expand';
import { ROW_HEIGHT, rowHeightFor, rowOffsets } from '../src/modal/components/common/utils';

function codeRow(opts: {
  rowIndex: number;
  text?: string;
  path?: string;
  lineType?: string;
  split?: boolean;
  leftCode?: string;
  rightCode?: string;
  oldLine?: number | null;
  newLine?: number | null;
}) {
  return {
    kind: 'diff-line',
    lineType: opts.lineType || 'add',
    rowIndex: opts.rowIndex,
    filePath: opts.path || 'a.ts',
    text: opts.text ?? '',
    code: opts.text ?? '',
    split: opts.split,
    leftCode: opts.leftCode,
    rightCode: opts.rightCode,
    // Distinct line numbers so expand keys do not collide across rows.
    newLine: opts.newLine !== undefined ? opts.newLine : opts.rowIndex + 1,
    oldLine: opts.oldLine !== undefined ? opts.oldLine : null,
  };
}

describe('diffLineExpandKey / length', () => {
  test('keys code rows by path+lines; ignores hunks', () => {
    // codeRow default newLine=rowIndex+1, lineType=add
    expect(diffLineExpandKey(codeRow({ rowIndex: 3, text: 'x' }))).toBe(
      'a.ts#add::4'
    );
    expect(
      diffLineExpandKey({
        kind: 'diff-line',
        lineType: 'context',
        rowIndex: 9,
        filePath: 'b.ts',
        oldLine: 4,
        newLine: 4,
      })
    ).toBe('b.ts#context:4:4');
    expect(
      diffLineExpandKey({
        kind: 'diff-line',
        lineType: 'hunk',
        rowIndex: 1,
        filePath: 'a.ts',
      })
    ).toBe(null);
  });

  test('length uses longest pane on split', () => {
    const row = codeRow({
      rowIndex: 1,
      split: true,
      leftCode: 'short',
      rightCode: 'x'.repeat(50),
      text: 'mid',
    });
    expect(diffLineTextLength(row)).toBe(50);
  });
});

describe('expandable / expanded', () => {
  test('threshold gate', () => {
    const short = codeRow({
      rowIndex: 0,
      text: 'x'.repeat(LINE_EXPAND_CHAR_THRESHOLD - 1),
    });
    const long = codeRow({
      rowIndex: 1,
      text: 'x'.repeat(LINE_EXPAND_CHAR_THRESHOLD),
    });
    expect(isDiffLineExpandable(short)).toBe(false);
    expect(isDiffLineExpandable(long)).toBe(true);
  });

  test('toggleExpandKey', () => {
    const k = 'a.ts#1';
    const a = toggleExpandKey(new Set(), k);
    expect(a.has(k)).toBe(true);
    const b = toggleExpandKey(a, k);
    expect(b.has(k)).toBe(false);
  });

  test('isDiffLineExpanded', () => {
    const row = codeRow({ rowIndex: 2, text: 'x'.repeat(120) });
    const set = new Set([diffLineExpandKey(row)!]);
    expect(isDiffLineExpanded(set, row)).toBe(true);
    expect(isDiffLineExpanded(new Set(), row)).toBe(false);
  });
});

describe('heights', () => {
  test('estimate is multiple of line height and capped', () => {
    const row = codeRow({ rowIndex: 0, text: 'y'.repeat(500) });
    const h = estimateExpandedLineHeight(row);
    expect(h).toBeGreaterThan(ROW_HEIGHT);
    expect(h % ROW_HEIGHT).toBe(0);
    expect(h).toBeLessThanOrEqual(ROW_HEIGHT * 48);
  });

  test('expandedCodeLineHeight prefers measure', () => {
    const row = codeRow({ rowIndex: 5, text: 'z'.repeat(200) });
    const key = diffLineExpandKey(row)!;
    const h = expandedCodeLineHeight(row, {
      expandedKeys: new Set([key]),
      measuredHeights: new Map([[key, 88]]),
    });
    expect(h).toBe(88);
  });

  test('rowHeightFor + rowOffsets grow when expanded', () => {
    const short = codeRow({ rowIndex: 0, text: 'hi' });
    const long = codeRow({ rowIndex: 1, text: 'w'.repeat(200) });
    const key = diffLineExpandKey(long)!;
    const opts = {
      expandedKeys: new Set([key]),
      measuredHeights: new Map([[key, 66]]),
      expandedCodeLineHeight,
    };
    expect(rowHeightFor(short, opts)).toBe(ROW_HEIGHT);
    expect(rowHeightFor(long, opts)).toBe(66);
    const off = rowOffsets([short, long], opts);
    expect(off[2] - off[1]).toBe(66);
    expect(off[1] - off[0]).toBe(ROW_HEIGHT);
  });
});
