/**
 * Thread open progress: UI stages shell → comments; reactions weight is
 * silent-credited with comments (no third label flash).
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

describe('thread progress ladder (pure + wiring)', () => {
  test('OPEN_PROGRESS_KEYS lists shell / comments / reactions weight keys', () => {
    expect(OPEN_PROGRESS_KEYS).toContain('threadsShell');
    expect(OPEN_PROGRESS_KEYS).toContain('threadsComments');
    expect(OPEN_PROGRESS_KEYS).toContain('threadsReactions');
    expect(OPEN_PROGRESS_KEYS).not.toContain('threadsFollow');
    expect(OPEN_PROGRESS_KEYS).not.toContain('threadsNewest');
  });

  test('thread weights are positive and sum with open keys to 100', () => {
    expect(FETCH_UNIT_WEIGHTS.threadsShell).toBeGreaterThan(0);
    expect(FETCH_UNIT_WEIGHTS.threadsComments).toBeGreaterThan(0);
    expect(FETCH_UNIT_WEIGHTS.threadsReactions).toBeGreaterThan(0);
    let sum = 0;
    for (const k of OPEN_PROGRESS_KEYS) {
      sum += Number((FETCH_UNIT_WEIGHTS as any)[k] || 0);
    }
    expect(sum).toBe(100);
  });

  test('shell then comments (+ silent reactions) completes threads ladder', () => {
    const prog = createWeightProgress({ total: 100 });
    prog.complete('start', FETCH_UNIT_WEIGHTS.start);
    prog.complete('core', FETCH_UNIT_WEIGHTS.core);
    const afterCore = prog.percent();

    prog.complete('threadsShell', FETCH_UNIT_WEIGHTS.threadsShell);
    const afterShell = prog.percent();
    expect(afterShell).toBeGreaterThan(afterCore);

    // Product: credit comments + reactions together (same by-ids)
    prog.complete('threadsComments', FETCH_UNIT_WEIGHTS.threadsComments);
    prog.complete('threadsReactions', FETCH_UNIT_WEIGHTS.threadsReactions);
    const afterComments = prog.percent();
    expect(afterComments).toBeGreaterThan(afterShell);

    expect(threadsProgressComplete((k) => prog.has(k))).toBe(true);
  });

  test('host adaptive ladder drops comments-start and reactions UI stages', () => {
    const adaptive = read('src/host/modules/side-fetch-cache-assets.ts');
    expect(adaptive).not.toMatch(/onStage\(['"]comments-start['"]/);
    expect(adaptive).not.toMatch(/onStage\(['"]reactions['"]/);
    expect(adaptive).toMatch(/onStage\(['"]shell['"]/);
    expect(adaptive).toMatch(/onStage\(['"]comments['"]/);
    const open = read('src/host/modules/open-modal-run.ts');
    expect(open).toMatch(/Silent credit/);
    expect(open).not.toMatch(/markThreadStage\(['"]reactions['"]/);
    expect(open).not.toMatch(/markThreadStage\(['"]comments-start['"]/);
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

  test('setLoadStage refuses to re-raise critical bar when critical complete', () => {
    const progress = read('src/host/modules/side-fetch-progress.ts');
    expect(progress).toMatch(/isCriticalProgressComplete/);
    expect(progress).toMatch(/mode:\s*['"]background['"]/);
    const timeline = read('src/host/modules/host-core-timeline-b.ts');
    expect(timeline).toMatch(/function isCriticalProgressComplete/);
    expect(timeline).toMatch(/function isOpenProgressComplete/);
    expect(timeline).toMatch(
      /tryFinishOpenProgress[\s\S]*isCriticalProgressComplete/
    );
    expect(timeline).toMatch(/mode:\s*['"]background['"]/);
  });

  test('open progress watchdog has an absolute deadline and retries core loading', () => {
    const progress = read('src/host/modules/side-fetch-progress.ts');
    const watchdog = progress.slice(
      progress.indexOf('function armOpenProgressWatchdog'),
      progress.indexOf('function beginFetchProgress')
    );
    expect(watchdog).toMatch(/if \(openProgressWatchdogTimer\) return/);
    expect(watchdog).not.toMatch(
      /if \(openProgressWatchdogTimer\) clearTimeout/
    );
    expect(watchdog).toMatch(/if \(current\.loading\)[\s\S]*armOpenProgressWatchdog\(1_000\)/);
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
