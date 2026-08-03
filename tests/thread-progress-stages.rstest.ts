/**
 * Three-stage review-thread open progress: shell → comments → reactions.
 * Drives shipped load-progress helpers (not re-implemented weights).
 */
import { describe, expect, test } from '@rstest/core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  FETCH_UNIT_WEIGHTS,
  OPEN_PROGRESS_KEYS,
  createWeightProgress,
  threadsProgressComplete,
} from '../src/modal/lib/load-progress';

const root = resolve(__dirname, '..');
const read = (rel: string) => readFileSync(resolve(root, rel), 'utf8');

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

describe('open progress settle wiring (source)', () => {
  test('prog.mark settles via tryFinishOpenProgress (threads last-key path)', () => {
    const markSrc = read('src/host/modules/side-fetch-progress.ts');
    // Last OPEN key often lands on threadsReactions via mark(), not markSideProgress.
    expect(markSrc).toMatch(/function mark\s*\(/);
    expect(markSrc).toMatch(/tryFinishOpenProgress\s*\(\s*prog\s*\)/);
    expect(markSrc).toMatch(/Busy hard-cap 99/);
  });

  test('setLoadStage refuses to re-raise bar when open units complete (reconnect)', () => {
    const progress = read('src/host/modules/side-fetch-progress.ts');
    expect(progress).toMatch(/isOpenProgressComplete/);
    expect(progress).toMatch(/re-raising a 100%/);
    const timeline = read('src/host/modules/host-core-timeline-b.ts');
    expect(timeline).toMatch(/function isOpenProgressComplete/);
    expect(timeline).toMatch(
      /tryFinishOpenProgress[\s\S]*isOpenProgressComplete/
    );
  });

  test('revalidate settles thread ladder before unresolved bulk work', () => {
    const open = read('src/host/modules/open-modal-run.ts');
    // After await kickoff: creditAllThreadStages + tryFinish before remaining by-ids.
    expect(open).toMatch(/creditAllThreadStages\(\)/);
    expect(open).toMatch(/tryFinishOpenProgress\(prog\)/);
    expect(open).toMatch(/current\.loadStage\?\.busy/);
  });

  test('unresolved bulk only setLoadStage while open progress still busy', () => {
    const open = read('src/host/modules/open-modal-run.ts');
    expect(open).toMatch(/if \(current\.loadStage\?\.busy\)/);
    expect(open).toMatch(/threads-comments/);
  });

  test('all OPEN_PROGRESS_KEYS complete ⇒ pure tracker at 100 (settle gate input)', () => {
    const prog = createWeightProgress({ total: 100 });
    for (const k of OPEN_PROGRESS_KEYS) {
      prog.complete(k, Number((FETCH_UNIT_WEIGHTS as any)[k] || 0));
    }
    expect(prog.percent()).toBe(100);
    expect(OPEN_PROGRESS_KEYS.every((k) => prog.has(k))).toBe(true);
    expect(threadsProgressComplete((k) => prog.has(k))).toBe(true);
  });
});
