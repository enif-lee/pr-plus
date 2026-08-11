/**
 * Diff keyboard-nav perf sampling (opt-in modal vs embed).
 */
import { describe, expect, test, beforeEach } from '@rstest/core';
import {
  beginDiffNavPerfSample,
  endDiffNavPerfSample,
  getDiffNavPerfSnapshot,
  installDiffNavPerfGlobal,
  invalidateDiffNavPerfEnabledCache,
  isDiffNavPerfEnabled,
  percentileSorted,
  resetDiffNavPerfSamples,
  resolveDiffNavPerfEnabled,
  setDiffNavPerfEnabled,
  summarizeMs,
} from '../src/modal/lib/diff-nav-perf';

describe('percentileSorted / summarizeMs', () => {
  test('empty', () => {
    expect(percentileSorted([], 0.5)).toBeNull();
    expect(summarizeMs([]).count).toBe(0);
  });

  test('p50 p95 max mean', () => {
    const vals = [1, 2, 3, 4, 100];
    const s = summarizeMs(vals);
    expect(s.count).toBe(5);
    expect(s.maxMs).toBe(100);
    expect(s.meanMs).toBeCloseTo(22, 5);
    expect(s.p50Ms).toBe(3);
    expect(s.p95Ms).toBe(100);
  });
});

describe('enable gate', () => {
  beforeEach(() => {
    invalidateDiffNavPerfEnabledCache();
    resetDiffNavPerfSamples();
  });

  test('off by default', () => {
    const g: any = { localStorage: { getItem: () => null } };
    expect(resolveDiffNavPerfEnabled(g)).toBe(false);
  });

  test('localStorage on', () => {
    const store: Record<string, string> = { 'prp:diff-nav-perf': '1' };
    const g: any = {
      localStorage: {
        getItem: (k: string) => store[k] ?? null,
        setItem: (k: string, v: string) => {
          store[k] = v;
        },
        removeItem: (k: string) => {
          delete store[k];
        },
      },
    };
    expect(resolveDiffNavPerfEnabled(g)).toBe(true);
  });

  test('query flag', () => {
    const g: any = {
      location: { search: '?prp_diff_nav_perf=1' },
      localStorage: { getItem: () => null },
    };
    expect(resolveDiffNavPerfEnabled(g)).toBe(true);
  });

  test('explicit window flag wins', () => {
    const g: any = {
      __PRP_DIFF_NAV_PERF_ENABLE__: true,
      localStorage: { getItem: () => null },
    };
    expect(resolveDiffNavPerfEnabled(g)).toBe(true);
  });
});

describe('sample record', () => {
  beforeEach(() => {
    resetDiffNavPerfSamples();
    invalidateDiffNavPerfEnabledCache();
  });

  test('no-op when disabled', () => {
    const g: any = {
      __PRP_DIFF_NAV_PERF_ENABLE__: false,
      performance: { now: () => 100 },
    };
    setDiffNavPerfEnabled(false, g);
    const t0 = beginDiffNavPerfSample(g);
    expect(t0).toBeNull();
    expect(endDiffNavPerfSample(t0, { presentation: 'modal' }, g)).toBeNull();
  });

  test('records modal vs embed and snapshot byPresentation', () => {
    let clock = 1000;
    const marks: string[] = [];
    const measures: string[] = [];
    const g: any = {
      __PRP_DIFF_NAV_PERF_ENABLE__: true,
      performance: {
        now: () => clock,
        mark: (n: string) => {
          marks.push(n);
        },
        measure: (n: string) => {
          measures.push(n);
        },
        clearMarks: () => {},
        clearMeasures: () => {},
      },
      localStorage: {
        getItem: () => '1',
        setItem: () => {},
        removeItem: () => {},
      },
    };
    setDiffNavPerfEnabled(true, g);

    const a = beginDiffNavPerfSample(g);
    clock = 1004.5;
    endDiffNavPerfSample(
      a,
      { presentation: 'modal', operation: 'file', delta: 1 },
      g
    );

    const b = beginDiffNavPerfSample(g);
    clock = 1012;
    endDiffNavPerfSample(
      b,
      { presentation: 'embed', operation: 'region', delta: -1 },
      g
    );

    const snap = getDiffNavPerfSnapshot(g);
    expect(snap.enabled).toBe(true);
    expect(snap.count).toBe(2);
    expect(snap.byPresentation.modal.count).toBe(1);
    expect(snap.byPresentation.embed.count).toBe(1);
    expect(snap.byPresentation.modal.meanMs).toBeCloseTo(4.5, 5);
    expect(snap.byPresentation.embed.meanMs).toBeCloseTo(7.5, 5);
    expect(snap.byOperation.file.count).toBe(1);
    expect(snap.byOperation.region.count).toBe(1);
    expect(snap.byOperation.page.count).toBe(0);
    expect(measures).toContain('prp-diff-nav');
    expect(measures).toContain('prp-diff-nav-file');
    expect(measures).toContain('prp-diff-nav-region');
    expect(marks.length).toBeGreaterThanOrEqual(2);
  });

  test('installDiffNavPerfGlobal exposes API', () => {
    const g: any = {
      localStorage: {
        store: {} as Record<string, string>,
        getItem(k: string) {
          return this.store[k] ?? null;
        },
        setItem(k: string, v: string) {
          this.store[k] = v;
        },
        removeItem(k: string) {
          delete this.store[k];
        },
      },
      performance: { now: () => 1 },
    };
    const api = installDiffNavPerfGlobal(g);
    expect(api).toBeTruthy();
    expect(g.__PRP_DIFF_NAV_PERF__).toBe(api);
    api!.enable();
    expect(isDiffNavPerfEnabled(g)).toBe(true);
    api!.disable();
    expect(isDiffNavPerfEnabled(g)).toBe(false);
  });
});
