/**
 * Diff navigation thrift: page / file / comment / selection share DOM-first
 * programmatic scroll; store setScrollTop is gated (selection-class).
 * Drives shipped pure helpers + source contracts on App wiring.
 */
import { describe, expect, test } from '@rstest/core';
import fs from 'node:fs';
import path from 'node:path';
import {
  planProgrammaticScroll,
  applyProgrammaticDiffScroll,
  scrollTopForIndex,
  scrollTopToRevealIndex,
} from '../src/modal/lib/virtual-range';
import {
  nextScrollTopByPage as pageStep,
  resolveAdjacentFileNav,
} from '../src/modal/lib/shortcut-policy';

const root = path.join(__dirname, '..');
const appImpl = fs.readFileSync(
  path.join(root, 'src/modal/app/PrModalApp.impl.tsx'),
  'utf8'
);

describe('planProgrammaticScroll / applyProgrammaticDiffScroll', () => {
  test('DOM applies when delta exceeds minDom; store gated by minStore', () => {
    const small = planProgrammaticScroll(100, 100, 110, {
      minDomDelta: 0.5,
      minStoreDelta: 24,
    });
    expect(small.applyDom).toBe(true);
    expect(small.applyStore).toBe(false);

    const large = planProgrammaticScroll(100, 100, 200, {
      minDomDelta: 0.5,
      minStoreDelta: 24,
    });
    expect(large.applyDom).toBe(true);
    expect(large.applyStore).toBe(true);
  });

  test('minStoreDelta Infinity never applies store (page-scroll class)', () => {
    const plan = planProgrammaticScroll(0, 0, 900, {
      minStoreDelta: Number.POSITIVE_INFINITY,
    });
    expect(plan.applyDom).toBe(true);
    expect(plan.applyStore).toBe(false);
  });

  test('applyProgrammaticDiffScroll writes DOM and optional store', () => {
    const el = { scrollTop: 0 };
    let store = 0;
    const r1 = applyProgrammaticDiffScroll(el, 40, {
      storeTop: store,
      setStoreTop: (n) => {
        store = n;
      },
      minStoreDelta: 24,
    });
    expect(r1.appliedDom).toBe(true);
    expect(el.scrollTop).toBe(40);
    // 40 < 24? no 40 >= 24 so store applies
    expect(r1.appliedStore).toBe(true);
    expect(store).toBe(40);

    const r2 = applyProgrammaticDiffScroll(el, 50, {
      storeTop: store,
      setStoreTop: (n) => {
        store = n;
      },
      minStoreDelta: 24,
    });
    expect(r2.appliedDom).toBe(true);
    expect(r2.appliedStore).toBe(false); // |50-40|=10 < 24
    expect(store).toBe(40);

    const r3 = applyProgrammaticDiffScroll(el, 900, {
      storeTop: store,
      setStoreTop: (n) => {
        store = n;
      },
      minStoreDelta: Number.POSITIVE_INFINITY,
    });
    expect(r3.appliedDom).toBe(true);
    expect(el.scrollTop).toBe(900);
    expect(r3.appliedStore).toBe(false);
    expect(store).toBe(40);
  });
});

describe('page step pure helper still works', () => {
  test('nextScrollTopByPage advances ~0.9 viewport', () => {
    const fn = typeof pageStep === 'function' ? pageStep : null;
    expect(fn).toBeTruthy();
    const next = fn!(100, 500, 5000, 1);
    expect(next).toBeGreaterThan(100);
    expect(next - 100).toBeGreaterThanOrEqual(40);
    // ~0.9 * 500 = 450
    expect(next - 100).toBeLessThanOrEqual(500);
  });
});

describe('App source contracts — thrift nav paths', () => {
  test('scrollDiffPage uses thrift helper with Infinity store min (no per-hop setScrollTop)', () => {
    expect(appImpl).toMatch(/function scrollDiffPage/);
    expect(appImpl).toMatch(/applyProgrammaticDiffScroll/);
    expect(appImpl).toMatch(
      /minStoreDelta:\s*Number\.POSITIVE_INFINITY/
    );
    // Old thrash pattern: assign DOM then always setScrollTop(next)
    expect(appImpl).not.toMatch(
      /el\.scrollTop\s*=\s*next;\s*\n\s*setScrollTop\(next\)/
    );
  });

  test('comment + selection + file pin call applyProgrammaticDiffScroll', () => {
    // Counts of helper call sites in App (page + comment + selection + file + …)
    const n = (appImpl.match(/applyProgrammaticDiffScroll\(/g) || []).length;
    expect(n).toBeGreaterThanOrEqual(4);
    expect(appImpl).toContain('scrollMappedCommentIntoView');
    expect(appImpl).toContain('scrollSelectionHeadDomOnly');
    expect(appImpl).toContain('function onSelectFile');
  });

  test('file nav is rAF-coalesced; page scroll applies sync (headless-safe)', () => {
    // File nav still one hop per frame under key-hold
    expect(appImpl).toMatch(/fileNavRafRef/);
    expect(appImpl).toMatch(/pendingFileNavDeltaRef/);
    expect(appImpl).toMatch(
      /pendingFileNavDeltaRef\.current\s*=\s*d/
    );
    expect(appImpl).not.toMatch(
      /pendingFileNavDeltaRef\.current\s*\+=/
    );
    // Page scroll: sync DOM hop (rAF freezes in background/headless) + optional
    // rAF bookkeeping refs still present for same-frame key-repeat clear
    expect(appImpl).toMatch(/pageScrollRafRef/);
    expect(appImpl).toMatch(/pendingPageScrollDirRef/);
    expect(appImpl).toMatch(/function applyDiffPageScroll/);
    expect(appImpl).toMatch(/applyDiffPageScroll\(dir\)/);
  });

  test('selection still rAF-coalesces keyboard move', () => {
    expect(appImpl).toMatch(/selectionMoveRafRef/);
    expect(appImpl).toMatch(/applySelectionKeyboardMove/);
  });
});

describe('resolveAdjacentFileNav multi-step (key-hold coalesce)', () => {
  const files = ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts'].map((filename) => ({
    filename,
  }));

  test('delta ±1 still steps one file', () => {
    expect(resolveAdjacentFileNav(files, 'c.ts', 1).path).toBe('d.ts');
    expect(resolveAdjacentFileNav(files, 'c.ts', -1).path).toBe('b.ts');
  });

  test('delta N jumps N files in one call (skips intermediates)', () => {
    const r = resolveAdjacentFileNav(files, 'a.ts', 3);
    expect(r.path).toBe('d.ts');
    expect(r.index).toBe(3);
    const back = resolveAdjacentFileNav(files, 'e.ts', -3);
    expect(back.path).toBe('b.ts');
  });

  test('wraps multi-step at list ends', () => {
    expect(resolveAdjacentFileNav(files, 'd.ts', 3).path).toBe('b.ts');
    expect(resolveAdjacentFileNav(files, 'b.ts', -3).path).toBe('d.ts');
  });

  test('delta 0 is no-op on current path', () => {
    const r = resolveAdjacentFileNav(files, 'c.ts', 0);
    expect(r.path).toBe('c.ts');
    expect(r.index).toBe(2);
  });
});

describe('offset helpers still ship (no product contract change)', () => {
  test('scrollTopForIndex third and start', () => {
    const third = scrollTopForIndex(10, 20, 600, 100, null, { align: 'third' });
    const start = scrollTopForIndex(10, 20, 600, 100, null, {
      align: 'start',
      pad: 0,
    });
    expect(third).toBeLessThan(start + 200);
    expect(Number.isFinite(third)).toBe(true);
  });

  test('scrollTopToRevealIndex no-op when visible', () => {
    // row 5 at y=100 if rh=20; viewport 0..200 includes it
    const cur = 0;
    const next = scrollTopToRevealIndex(5, cur, 20, 200, 50, null, {
      padTop: 0,
      padBottom: 0,
    });
    expect(next).toBe(0);
  });
});
