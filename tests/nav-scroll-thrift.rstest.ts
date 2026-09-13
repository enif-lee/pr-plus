/**
 * Diff navigation thrift: page / file / comment / selection share DOM-first
 * programmatic scroll; store setScrollTop is gated (selection-class).
 * Drives shipped pure helpers.
 */
import { describe, expect, test } from '@rstest/core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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

  test('third pin is rowTop - viewportHeight/3 (clamped), same both dirs', () => {
    const rh = 20;
    const vh = 600;
    const total = 80;
    const idx = 30;
    const rowTop = idx * rh;
    const max = Math.max(0, total * rh - vh);
    const want = Math.min(max, Math.max(0, rowTop - vh / 3));
    const down = scrollTopForIndex(idx, rh, vh, total, null, {
      align: 'third',
    });
    const up = scrollTopForIndex(idx, rh, vh, total, null, { align: 'third' });
    expect(down).toBe(want);
    expect(up).toBe(want);
    const offs = Array.from({ length: total + 1 }, (_, i) => i * rh);
    expect(
      scrollTopForIndex(idx, rh, vh, total, offs, { align: 'third' })
    ).toBe(want);
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

  test('reveal does not force third when already visible', () => {
    const rh = 20;
    const vh = 600;
    const total = 80;
    const idx = 15; // y=300, already in 0..600; third pin is 300-200=100
    const cur = 0;
    const revealed = scrollTopToRevealIndex(idx, cur, rh, vh, total, null, {
      padTop: 0,
      padBottom: 0,
    });
    const third = scrollTopForIndex(idx, rh, vh, total, null, {
      align: 'third',
    });
    expect(revealed).toBe(0);
    expect(third).not.toBe(revealed);
  });
});

describe('hop wiring uses third; arrows use reveal', () => {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  function read(rel: string): string {
    return fs.readFileSync(path.join(root, rel), 'utf8');
  }

  test('thread hop pins third', () => {
    const nav = read('src/modal/hooks/useDiffConversationNav.ts');
    const start = nav.indexOf('scrollMappedCommentIntoView = useCallback');
    const threadBlock = nav.slice(start, start + 900);
    expect(threadBlock).toMatch(/align:\s*'third'/);
  });

  test('file hop pins third', () => {
    const shell = read('src/modal/app/PrModalShell.tsx');
    const block = shell.slice(
      shell.indexOf('function onSelectFile'),
      shell.indexOf('function onToggleDir')
    );
    expect(block).toMatch(/align:\s*'third'/);
    expect(block).not.toMatch(/align:\s*'start'/);
  });

  test('change-region hop uses third helper', () => {
    const nav = read('src/modal/hooks/useDiffConversationNav.ts');
    const block = nav.slice(
      nav.indexOf('function applyOptArrowScrollSelect'),
      nav.indexOf('function optArrowScrollSelect')
    );
    expect(block).toMatch(/scrollSelectionHeadToThird/);
  });

  test('Arrow caret still uses reveal-only helper', () => {
    const sel = read('src/modal/hooks/useSelectionKeyboard.ts');
    expect(sel).toMatch(/function scrollSelectionHeadDomOnly/);
    expect(sel).toMatch(/scrollTopToRevealIndex/);
    const flush = sel.slice(
      sel.indexOf('function flushSelectionKeyboardMove') >= 0
        ? sel.indexOf('scrollSelectionHeadDomOnly(nextSel)')
        : 0
    );
    expect(sel).toMatch(/scrollSelectionHeadDomOnly\(nextSel\)/);
    expect(flush).not.toMatch(/scrollSelectionHeadToThird\(nextSel\)/);
  });
});

