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

  test('split mode pairs consecutive del+add on the same row', () => {
    const rows = flattenFilesToVirtualRows(
      [
        {
          filename: 's.js',
          status: 'modified',
          additions: 2,
          deletions: 2,
          patch: [
            '@@ -10,5 +10,5 @@',
            ' keep',
            '-old1',
            '-old2',
            '+new1',
            '+new2',
            ' keep2',
          ].join('\n'),
        },
      ],
      'split',
      { expandAll: true }
    );
    const codeRows = rows.filter((r: any) => r.kind === 'diff-line' && r.split);
    // context + one paired change row for (old1|new1) + (old2|new2) + context
    const changes = codeRows.filter((r: any) => r.lineType === 'change');
    expect(changes).toHaveLength(2);
    expect(changes[0].leftCode).toBe('old1');
    expect(changes[0].rightCode).toBe('new1');
    expect(changes[0].oldLine).toBe(11);
    expect(changes[0].newLine).toBe(11);
    expect(changes[1].leftCode).toBe('old2');
    expect(changes[1].rightCode).toBe('new2');
    // Pure del or pure add must not appear as separate unpaired rows for this hunk
    expect(codeRows.some((r: any) => r.lineType === 'del')).toBe(false);
    expect(codeRows.some((r: any) => r.lineType === 'add')).toBe(false);
  });

  test('split mode places line comments under the matching side pane', () => {
    const rows = flattenFilesToVirtualRows(
      [
        {
          filename: 'c.js',
          status: 'modified',
          additions: 1,
          deletions: 1,
          patch: ['@@ -1,3 +1,3 @@', ' a', '-b', '+B', ' c'].join('\n'),
        },
      ],
      'split',
      {
        expandAll: true,
        reviewComments: [
          {
            id: 1,
            path: 'c.js',
            side: 'LEFT',
            line: 2,
            body: 'left note',
            author: 'alice',
          },
          {
            id: 2,
            path: 'c.js',
            side: 'RIGHT',
            line: 2,
            body: 'right note',
            author: 'bob',
          },
        ],
      }
    );
    const comments = rows.filter((r: any) => r.kind === 'inline-comment');
    expect(comments).toHaveLength(2);
    const left = comments.find((r: any) => r.side === 'LEFT');
    const right = comments.find((r: any) => r.side === 'RIGHT');
    expect(left?.split).toBe(true);
    expect(right?.split).toBe(true);
    expect(left?.oldLine).toBe(2);
    expect(right?.newLine).toBe(2);
  });

  test('split mode leaves unpaired dels/adds with empty opposite side', () => {
    const rows = flattenFilesToVirtualRows(
      [
        {
          filename: 'u2.js',
          status: 'modified',
          additions: 1,
          deletions: 2,
          patch: [
            '@@ -1,4 +1,3 @@',
            ' a',
            '-b',
            '-c',
            '+B',
            ' d',
          ].join('\n'),
        },
      ],
      'split',
      { expandAll: true }
    );
    const codeRows = rows.filter((r: any) => r.kind === 'diff-line' && r.split);
    const change = codeRows.find((r: any) => r.lineType === 'change');
    const delOnly = codeRows.find((r: any) => r.lineType === 'del');
    expect(change?.leftCode).toBe('b');
    expect(change?.rightCode).toBe('B');
    expect(delOnly?.leftCode).toBe('c');
    expect(delOnly?.rightCode).toBe('');
    expect(delOnly?.newLine).toBeNull();
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
