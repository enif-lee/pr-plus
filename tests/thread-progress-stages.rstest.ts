/**
 * Three-stage review-thread open progress: shell → comments → reactions.
 * Drives shipped load-progress helpers (not re-implemented weights).
 */
import { describe, expect, test } from '@rstest/core';
import {
  FETCH_UNIT_WEIGHTS,
  OPEN_PROGRESS_KEYS,
  createWeightProgress,
  threadsProgressComplete,
} from '../src/modal/lib/load-progress';

describe('thread progress 3 stages (pure)', () => {
  test('OPEN_PROGRESS_KEYS lists shell / comments / reactions', () => {
    expect(OPEN_PROGRESS_KEYS).toContain('threadsShell');
    expect(OPEN_PROGRESS_KEYS).toContain('threadsComments');
    expect(OPEN_PROGRESS_KEYS).toContain('threadsReactions');
    expect(OPEN_PROGRESS_KEYS).not.toContain('threadsFollow');
    expect(OPEN_PROGRESS_KEYS).not.toContain('threadsNewest');
  });

  test('three thread weights are positive and sum with open keys to 100', () => {
    expect(FETCH_UNIT_WEIGHTS.threadsShell).toBeGreaterThan(0);
    expect(FETCH_UNIT_WEIGHTS.threadsComments).toBeGreaterThan(0);
    expect(FETCH_UNIT_WEIGHTS.threadsReactions).toBeGreaterThan(0);
    let sum = 0;
    for (const k of OPEN_PROGRESS_KEYS) {
      sum += Number((FETCH_UNIT_WEIGHTS as any)[k] || 0);
    }
    expect(sum).toBe(100);
  });

  test('each stage mark advances percent; all three complete threads ladder', () => {
    const prog = createWeightProgress({ total: 100 });
    prog.complete('start', FETCH_UNIT_WEIGHTS.start);
    prog.complete('core', FETCH_UNIT_WEIGHTS.core);
    const afterCore = prog.percent();

    prog.complete('threadsShell', FETCH_UNIT_WEIGHTS.threadsShell);
    const afterShell = prog.percent();
    expect(afterShell).toBeGreaterThan(afterCore);

    prog.complete('threadsComments', FETCH_UNIT_WEIGHTS.threadsComments);
    const afterComments = prog.percent();
    expect(afterComments).toBeGreaterThan(afterShell);

    prog.complete('threadsReactions', FETCH_UNIT_WEIGHTS.threadsReactions);
    const afterReactions = prog.percent();
    expect(afterReactions).toBeGreaterThan(afterComments);

    expect(threadsProgressComplete((k) => prog.has(k))).toBe(true);
  });

  test('skip-with-credit still completes threads ladder', () => {
    const prog = createWeightProgress({ total: 100 });
    prog.complete('threadsShell', FETCH_UNIT_WEIGHTS.threadsShell);
    prog.complete('threadsComments', FETCH_UNIT_WEIGHTS.threadsComments);
    prog.complete('threadsReactions', FETCH_UNIT_WEIGHTS.threadsReactions);
    expect(threadsProgressComplete((k) => prog.has(k))).toBe(true);
  });

  test('legacy threadsFollow + newest still counts as complete', () => {
    const prog = createWeightProgress({ total: 100 });
    prog.complete('threadsNewest', FETCH_UNIT_WEIGHTS.threadsNewest);
    prog.complete('threadsFollow', FETCH_UNIT_WEIGHTS.threadsFollow);
    expect(threadsProgressComplete((k) => prog.has(k))).toBe(true);
  });

  test('threadsVisible alone completes (refresh path)', () => {
    const prog = createWeightProgress({ total: 100 });
    prog.complete('threadsVisible', FETCH_UNIT_WEIGHTS.threadsVisible);
    expect(threadsProgressComplete((k) => prog.has(k))).toBe(true);
  });
});
