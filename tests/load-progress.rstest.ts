/**
 * rstest — load progress weights / percent (shipped lib/load-progress.ts).
 */
import { describe, expect, test } from '@rstest/core';
import {
  createWeightProgress,
  FETCH_UNIT_WEIGHTS,
  OPEN_PROGRESS_KEYS,
  OPEN_PROGRESS_CRITICAL_KEYS,
  OPEN_PROGRESS_BACKGROUND_KEYS,
  clampPercent,
  percentFromStageProgress,
  criticalProgressComplete,
  backgroundProgressComplete,
  openProgressFullyComplete,
  criticalProgressPercent,
  resolveOpenProgressUiMode,
} from '../src/modal/lib/load-progress';

describe('load-progress', () => {
  test('OPEN_PROGRESS_KEYS covers core sides and three thread stages', () => {
    expect(OPEN_PROGRESS_KEYS).toContain('core');
    expect(OPEN_PROGRESS_KEYS).toContain('files');
    expect(OPEN_PROGRESS_KEYS).toContain('reviews');
    expect(OPEN_PROGRESS_KEYS).toContain('threadsShell');
    expect(OPEN_PROGRESS_KEYS).toContain('threadsComments');
    expect(OPEN_PROGRESS_KEYS).toContain('threadsReactions');
  });

  test('critical + background partition open keys without overlap', () => {
    const crit = new Set(OPEN_PROGRESS_CRITICAL_KEYS);
    const bg = new Set(OPEN_PROGRESS_BACKGROUND_KEYS);
    for (const k of OPEN_PROGRESS_CRITICAL_KEYS) {
      expect(bg.has(k)).toBe(false);
      expect(OPEN_PROGRESS_KEYS).toContain(k);
    }
    for (const k of OPEN_PROGRESS_BACKGROUND_KEYS) {
      expect(crit.has(k)).toBe(false);
      expect(OPEN_PROGRESS_KEYS).toContain(k);
    }
    expect(crit.size + bg.size).toBe(OPEN_PROGRESS_KEYS.length);
  });

  test('weight progress reaches 100 when all keys complete', () => {
    const prog = createWeightProgress({ total: 100 });
    for (const k of OPEN_PROGRESS_KEYS) {
      const w = (FETCH_UNIT_WEIGHTS as any)[k] ?? 1;
      prog.complete(k, w);
    }
    expect(clampPercent(prog.percent())).toBe(100);
  });

  test('critical complete without sides → background UI mode', () => {
    const prog = createWeightProgress({ total: 100 });
    for (const k of OPEN_PROGRESS_CRITICAL_KEYS) {
      prog.complete(k, (FETCH_UNIT_WEIGHTS as any)[k] ?? 1);
    }
    const has = (k: string) => prog.has(k);
    expect(criticalProgressComplete(has)).toBe(true);
    expect(backgroundProgressComplete(has)).toBe(false);
    expect(openProgressFullyComplete(has)).toBe(false);
    expect(resolveOpenProgressUiMode(has)).toBe('background');
    expect(criticalProgressPercent(has)).toBe(99);
  });

  test('all keys → done mode', () => {
    const prog = createWeightProgress({ total: 100 });
    for (const k of OPEN_PROGRESS_KEYS) {
      prog.complete(k, (FETCH_UNIT_WEIGHTS as any)[k] ?? 1);
    }
    const has = (k: string) => prog.has(k);
    expect(resolveOpenProgressUiMode(has)).toBe('done');
    expect(openProgressFullyComplete(has)).toBe(true);
  });

  test('percentFromStageProgress maps done high', () => {
    const p = percentFromStageProgress({ phase: 'done', busy: false });
    expect(p).toBeGreaterThanOrEqual(90);
  });
});
