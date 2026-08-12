/**
 * Diff variable-height virtualization: measure keys, estimates, offsets,
 * and scroll-anchor when heights change.
 */
import { describe, expect, test } from '@rstest/core';
import {
  ROW_HEIGHT,
  COMMENT_ROW_HEIGHT,
  COMMENT_ROW_HEIGHT_COLLAPSED,
  IMAGE_ROW_HEIGHT,
  diffRowMeasureKey,
  estimateInlineCommentHeight,
  rowHeightFor,
  rowOffsets,
} from '../src/modal/components/common/utils';
import {
  adjustScrollTopForOffsetChange,
  calculateVisibleRange,
} from '../src/modal/lib/virtual-range';
import {
  diffLineExpandKey,
  expandedCodeLineHeight,
} from '../src/modal/lib/line-expand';

describe('diffRowMeasureKey', () => {
  test('comment / image / expanded line keys', () => {
    expect(
      diffRowMeasureKey({
        kind: 'inline-comment',
        commentId: 42,
        body: 'hi',
      })
    ).toBe('c:42:b2:r0:L1');
    // Body fingerprint changes measure key so hydrate re-measures
    expect(
      diffRowMeasureKey({
        kind: 'inline-comment',
        commentId: 42,
        body: 'hello world',
      })
    ).toBe('c:42:b11:r0:L1');
    expect(
      diffRowMeasureKey({ kind: 'diff-image', filePath: 'a.png' })
    ).toBe('img:a.png');
    const line = {
      kind: 'diff-line',
      lineType: 'add',
      filePath: 'a.ts',
      rowIndex: 9,
      newLine: 20,
    };
    const expandKey = diffLineExpandKey(line)!;
    expect(expandKey).toBe('a.ts#add::20');
    expect(diffRowMeasureKey(line)).toBe(null);
    expect(
      diffRowMeasureKey(line, { expandedKeys: new Set([expandKey]) })
    ).toBe(expandKey);
    expect(diffRowMeasureKey({ kind: 'file-header', filePath: 'a.ts' })).toBe(
      null
    );
  });
});

describe('estimateInlineCommentHeight', () => {
  test('collapsed is tight', () => {
    expect(
      estimateInlineCommentHeight(
        { kind: 'inline-comment', commentId: 1 },
        { isCollapsed: () => true }
      )
    ).toBe(COMMENT_ROW_HEIGHT_COLLAPSED);
  });

  test('open floors at COMMENT_ROW_HEIGHT and grows with body/replies', () => {
    const short = estimateInlineCommentHeight({
      kind: 'inline-comment',
      commentId: 1,
      body: 'hi',
    });
    expect(short).toBeGreaterThanOrEqual(COMMENT_ROW_HEIGHT);

    const long = estimateInlineCommentHeight({
      kind: 'inline-comment',
      commentId: 2,
      body: 'x'.repeat(400),
      replies: [{}, {}, {}, {}],
      pending: true,
      path: 'a.ts',
    });
    expect(long).toBeGreaterThan(short);
    expect(long).toBeLessThanOrEqual(1600);
  });

  test('video attachments reserve player height before measurement', () => {
    const plain = estimateInlineCommentHeight({
      kind: 'inline-comment',
      commentId: 3,
      body: 'video',
    });
    const video = estimateInlineCommentHeight({
      kind: 'inline-comment',
      commentId: 4,
      body: 'https://github.com/user-attachments/assets/12345678-abcd',
    });
    expect(video).toBeGreaterThanOrEqual(plain + 350);
  });
});

describe('rowHeightFor measured-first', () => {
  test('comment uses measured map over estimate', () => {
    const row = {
      kind: 'inline-comment',
      commentId: 7,
      body: 'x'.repeat(500),
      replies: [{}, {}],
    };
    const key = diffRowMeasureKey(row)!;
    const est = rowHeightFor(row, { isCollapsed: () => false });
    expect(est).toBeGreaterThanOrEqual(COMMENT_ROW_HEIGHT);

    const measured = rowHeightFor(row, {
      isCollapsed: () => false,
      measuredHeights: new Map([[key, 480]]),
    });
    expect(measured).toBe(480);
  });

  test('stale open measure ignored while collapsed', () => {
    const row = { kind: 'inline-comment', commentId: 8 };
    const key = diffRowMeasureKey(row)!;
    expect(
      rowHeightFor(row, {
        isCollapsed: () => true,
        measuredHeights: new Map([[key, 520]]),
      })
    ).toBe(COMMENT_ROW_HEIGHT_COLLAPSED);
  });

  test('image measure wins', () => {
    const row = { kind: 'diff-image', filePath: 'x.png', rowIndex: 3 };
    const key = diffRowMeasureKey(row)!;
    expect(rowHeightFor(row, {})).toBe(IMAGE_ROW_HEIGHT);
    expect(
      rowHeightFor(row, { measuredHeights: new Map([[key, 310]]) })
    ).toBe(310);
  });

  test('expanded code line measure via shared map', () => {
    const row = {
      kind: 'diff-line',
      lineType: 'add',
      filePath: 'a.ts',
      rowIndex: 2,
      newLine: 12,
      text: 'w'.repeat(200),
    };
    const key = diffLineExpandKey(row)!;
    expect(key).toBe('a.ts#add::12');
    const opts = {
      expandedKeys: new Set([key]),
      measuredHeights: new Map([[key, 88]]),
      expandedCodeLineHeight,
    };
    expect(rowHeightFor(row, opts)).toBe(88);
    expect(diffRowMeasureKey(row, opts)).toBe(key);
  });
});

describe('rowOffsets + visible range with mixed heights', () => {
  test('prefix offsets track measured comments', () => {
    const rows = [
      { kind: 'file-header', rowIndex: 0, filePath: 'a.ts' },
      {
        kind: 'diff-line',
        lineType: 'add',
        rowIndex: 1,
        filePath: 'a.ts',
        text: 'x',
      },
      { kind: 'inline-comment', commentId: 1, rowIndex: 2, body: 'hi' },
      {
        kind: 'diff-line',
        lineType: 'context',
        rowIndex: 3,
        filePath: 'a.ts',
        text: 'y',
      },
    ];
    const key = diffRowMeasureKey(rows[2])!; // c:1:b2:r0:L1
    expect(key).toMatch(/^c:1:/);
    const opts = {
      isCollapsed: () => false,
      measuredHeights: new Map([[key, 400]]),
    };
    const off = rowOffsets(rows, opts);
    expect(off[0]).toBe(0);
    expect(off[1] - off[0]).toBe(ROW_HEIGHT);
    expect(off[2] - off[1]).toBe(ROW_HEIGHT);
    expect(off[3] - off[2]).toBe(400);
    expect(off[4] - off[3]).toBe(ROW_HEIGHT);
    expect(off[4]).toBe(ROW_HEIGHT * 3 + 400);

    // Viewport over the tall comment only
    const range = calculateVisibleRange({
      totalRows: rows.length,
      rowHeight: ROW_HEIGHT,
      viewportHeight: 200,
      scrollTop: ROW_HEIGHT * 2,
      overscan: 0,
      offsets: off,
    });
    expect(range.start).toBe(2);
    expect(range.totalHeight).toBe(off[4]);
  });
});

describe('adjustScrollTopForOffsetChange', () => {
  test('keeps same row under viewport top when a prior row grows', () => {
    // 4 rows of 22 → total 88; focus mid row 2 (y=44)
    const prev = [0, 22, 44, 66, 88];
    // row 1 grows from 22 → 100
    const next = [0, 22, 122, 144, 166];
    const top = 44; // was start of row 2
    const adj = adjustScrollTopForOffsetChange(top, prev, next);
    expect(adj).toBe(122); // start of same index in next
  });

  test('preserves in-row offset', () => {
    const prev = [0, 100, 200, 300];
    const next = [0, 100, 250, 350];
    // scrolled 30px into row 1
    expect(adjustScrollTopForOffsetChange(130, prev, next)).toBe(130);
    // after row 1 grew by 50, same in-row offset on row 2: 200+10 → 250+10
    expect(adjustScrollTopForOffsetChange(210, prev, next)).toBe(260);
  });
});
