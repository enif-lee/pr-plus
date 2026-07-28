/**
 * rstest — load progress weights / percent (shipped lib/load-progress.ts).
 */
import { describe, expect, test } from '@rstest/core';
import {
  createWeightProgress,
  FETCH_UNIT_WEIGHTS,
  OPEN_PROGRESS_KEYS,
  clampPercent,
  percentFromStageProgress,
} from '../src/modal/lib/load-progress';

describe('load-progress', () => {
  test('OPEN_PROGRESS_KEYS covers core sides and threads', () => {
    expect(OPEN_PROGRESS_KEYS).toContain('core');
    expect(OPEN_PROGRESS_KEYS).toContain('files');
    expect(OPEN_PROGRESS_KEYS).toContain('reviews');
    expect(OPEN_PROGRESS_KEYS.some((k) => String(k).includes('thread'))).toBe(
      true
    );
  });

  test('weight progress reaches 100 when all keys complete', () => {
    const prog = createWeightProgress({ total: 100 });
    for (const k of OPEN_PROGRESS_KEYS) {
      const w = (FETCH_UNIT_WEIGHTS as any)[k] ?? 1;
      prog.complete(k, w);
    }
    expect(clampPercent(prog.percent())).toBe(100);
  });

  test('percentFromStageProgress maps done high', () => {
    const p = percentFromStageProgress({ phase: 'done', busy: false });
    expect(p).toBeGreaterThanOrEqual(90);
  });
});
