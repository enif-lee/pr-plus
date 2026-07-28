/**
 * rstest — unified LN + expand control composition (lib/diff-rows.ts).
 */
import { describe, expect, test } from '@rstest/core';
import {
  flattenFilesToVirtualRows,
  resolveExpandRange,
  expandControlKinds,
  makeExpandBusyKey,
  expandBusyMatches,
  mergeLineRanges,
} from '../src/modal/lib/diff-rows';

describe('diff expand + unified line numbers', () => {
  test('expandControlKinds is ▼ | all | ▲ for multi-chunk gaps', () => {
    const big = { hiddenCount: 61, expandChunk: 20 };
    expect(expandControlKinds('above', big)).toEqual([
      'fromStart',
      'all',
      'fromEnd',
    ]);
    expect(expandControlKinds('below', { hiddenCount: 12, expandChunk: 20 })).toEqual([
      'all',
    ]);
  });

  test('fromStart and fromEnd resolve different ranges', () => {
    const gap = { gapStartNew: 10, gapEndNew: 40, expandChunk: 20 };
    expect(resolveExpandRange('fromStart', gap)).not.toEqual(
      resolveExpandRange('fromEnd', gap)
    );
    expect(resolveExpandRange('all', gap)).toEqual({ start: 10, end: 40 });
  });

  test('busy key matches gap identity for partial directions', () => {
    const gap = { gapStartNew: 10, gapEndNew: 40 };
    const key = makeExpandBusyKey('a.js', gap, 'fromStart');
    expect(key).toBe('a.js:10-40:fromStart');
    expect(expandBusyMatches(key, 'a.js', gap)).toBe(true);
    expect(
      expandBusyMatches('a.js:21-40:fromEnd', 'a.js', gap)
    ).toBe(false);
  });

  test('unified rows expose old/new line numbers', () => {
    const rows = flattenFilesToVirtualRows(
      [
        {
          filename: 'u.js',
          status: 'modified',
          additions: 1,
          deletions: 1,
          patch: ['@@ -10,4 +10,4 @@', ' keep', '-old', '+new', ' keep2'].join(
            '\n'
          ),
        },
      ],
      'unified',
      { expandAll: true }
    );
    const ctx = rows.find((r: any) => r.lineType === 'context' && r.code === 'keep');
    const del = rows.find((r: any) => r.lineType === 'del');
    const add = rows.find((r: any) => r.lineType === 'add');
    expect(ctx?.oldLine).toBe(10);
    expect(ctx?.newLine).toBe(10);
    expect(del?.oldLine).not.toBeNull();
    expect(del?.newLine).toBeNull();
    expect(add?.newLine).not.toBeNull();
    expect(add?.oldLine).toBeNull();
  });

  test('middle gap mounts once; sequential edge expand clears', () => {
    const lines = Array.from({ length: 53 }, (_, i) => `L${i + 1}`);
    const multi = [
      {
        filename: 'm.py',
        status: 'modified',
        additions: 2,
        deletions: 0,
        patch: [
          '@@ -1,3 +1,3 @@',
          ' L1',
          ' L2',
          ' L3',
          '@@ -50,3 +50,4 @@',
          ' L50',
          '+added',
          ' L51',
          ' L52',
        ].join('\n'),
      },
    ];
    let ranges: Array<{ start: number; end: number }> = [];
    let rows = flattenFilesToVirtualRows(multi, 'unified', {
      expandAll: true,
      expandedRanges: new Map([['m.py', ranges]]),
      fileLineTexts: new Map([['m.py', lines]]),
    });
    const gap0 = rows.find((r: any) => r.expandAbove)?.expandAbove;
    expect(gap0).toBeTruthy();
    expect(rows.some((r: any) => r.expandBelow)).toBe(false);

    const front = resolveExpandRange('fromStart', gap0)!;
    ranges = mergeLineRanges(ranges, front.start, front.end);
    rows = flattenFilesToVirtualRows(multi, 'unified', {
      expandAll: true,
      expandedRanges: new Map([['m.py', ranges]]),
      fileLineTexts: new Map([['m.py', lines]]),
    });
    let rem = rows.find((r: any) => r.expandAbove)?.expandAbove;
    expect(rem.gapStartNew).toBeGreaterThan(gap0.gapStartNew);

    const back = resolveExpandRange('fromEnd', rem)!;
    ranges = mergeLineRanges(ranges, back.start, back.end);
    rem = flattenFilesToVirtualRows(multi, 'unified', {
      expandAll: true,
      expandedRanges: new Map([['m.py', ranges]]),
      fileLineTexts: new Map([['m.py', lines]]),
    }).find((r: any) => r.expandAbove)?.expandAbove;

    ranges = mergeLineRanges(ranges, rem.gapStartNew, rem.gapEndNew);
    rows = flattenFilesToVirtualRows(multi, 'unified', {
      expandAll: true,
      expandedRanges: new Map([['m.py', ranges]]),
      fileLineTexts: new Map([['m.py', lines]]),
    });
    expect(rows.some((r: any) => r.expandAbove || r.expandBelow)).toBe(false);
  });
});
