/**
 * Performance-oriented pure assertions for progressive open weight model.
 * Browser timeline captures go to SCRATCH via agent-browser separately.
 */
import { describe, expect, test } from '@rstest/core';
import {
  createWeightProgress,
  FETCH_UNIT_WEIGHTS,
  OPEN_PROGRESS_KEYS,
} from '../src/modal/lib/load-progress';
import {
  flattenFilesToVirtualRows,
  resolveExpandRange,
} from '../src/modal/lib/diff-rows';

describe('perf-oriented pure gates', () => {
  test('side panels can complete independently of threads', () => {
    const prog = createWeightProgress({ total: 100 });
    const t0 = performance.now();
    for (const k of [
      'start',
      'core',
      'files',
      'comments',
      'reviews',
      'commits',
      'checks',
      'development',
    ] as const) {
      const w = (FETCH_UNIT_WEIGHTS as any)[k];
      if (w) prog.complete(k, w);
    }
    const mid = prog.percent();
    const t1 = performance.now();
    // Threads not yet complete — percent must not already be 100
    expect(mid).toBeLessThan(100);
    expect(mid).toBeGreaterThan(0);
    expect(t1 - t0).toBeLessThan(50);
  });

  test('flatten large synthetic patch stays under budget', () => {
    const hunks: string[] = [];
    for (let i = 0; i < 40; i++) {
      const n = 1 + i * 30;
      hunks.push(`@@ -${n},3 +${n},4 @@`);
      hunks.push(' a', ' b', '+c', ' d');
    }
    const files = [
      {
        filename: 'big.ts',
        status: 'modified',
        additions: 40,
        deletions: 0,
        patch: hunks.join('\n'),
      },
    ];
    const t0 = performance.now();
    const rows = flattenFilesToVirtualRows(files, 'unified', { expandAll: true });
    const ms = performance.now() - t0;
    expect(rows.length).toBeGreaterThan(100);
    expect(ms).toBeLessThan(200);
    // Expand range resolution is O(1)
    const gap = { gapStartNew: 1, gapEndNew: 500, expandChunk: 20 };
    const t2 = performance.now();
    for (let i = 0; i < 1000; i++) resolveExpandRange('fromStart', gap);
    expect(performance.now() - t2).toBeLessThan(50);
  });
});
