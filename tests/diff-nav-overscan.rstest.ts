/**
 * Diff virtual overscan + programmatic scroll contracts used to cut blank bands
 * and support ⌥J/K hold (shipped VirtualDiff + virtual-range).
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from '@rstest/core';
import {
  applyProgrammaticDiffScroll,
  virtualRangeCoversViewport,
} from '../src/modal/lib/virtual-range';

const root = path.resolve(__dirname, '..');

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

describe('Diff overscan / scroll path (shipped)', () => {
  test('VirtualDiff uses elevated DIFF_OVERSCAN and larger jump overscan', () => {
    const src = read('src/modal/views/diff/VirtualDiff.tsx');
    expect(src).toMatch(/const\s+DIFF_OVERSCAN\s*=\s*20/);
    expect(src).toMatch(/const\s+DIFF_SCROLL_OVERSCAN\s*=\s*32/);
    expect(src).toMatch(/overscan:\s*DIFF_OVERSCAN/);
    expect(src).toMatch(/Math\.min\(measuredH[^,]+, viewportCap\)/);
    expect(src).toMatch(/viewportHeight:\s*vp/);
    // Programmatic jump pre-renders neighbors
    expect(src).toMatch(/applyScrollTop\(propTop, DIFF_SCROLL_OVERSCAN\)/);
    expect(src).not.toMatch(/applyScrollTop\(top\);/);
  });

  test('applyProgrammaticDiffScroll dispatches scroll so range updates same tick', () => {
    const src = read('src/modal/lib/virtual-range.ts');
    const view = read('src/modal/views/diff/VirtualDiff.tsx');
    expect(src).toMatch(/dispatchEvent/);
    expect(src).toMatch(/['"]scroll['"]/);
    expect(view).toMatch(/nativeEvent\.isTrusted === false/);
    expect(view).toMatch(
      /flushPendingScroll\(DIFF_SCROLL_OVERSCAN\)/
    );
    expect(view).toMatch(
      /requestAnimationFrame\(\(\) =>\s*flushSync\(\(\) => flushPendingScroll\(DIFF_SCROLL_OVERSCAN\)\)\s*\)/
    );
    expect(view).not.toMatch(/requestAnimationFrame\(flushPendingScroll\)/);

    const events: string[] = [];
    const el = {
      scrollTop: 0,
      dispatchEvent(ev: { type: string }) {
        events.push(ev.type);
        return true;
      },
    };
    const r = applyProgrammaticDiffScroll(el as any, 120, {
      storeTop: 0,
      setStoreTop: null,
    });
    expect(r.appliedDom).toBe(true);
    expect(el.scrollTop).toBe(120);
    expect(events).toContain('scroll');
  });

  test('trusted scroll bypasses rAF when the mounted range no longer covers viewport', () => {
    const offsets = Array.from({ length: 11 }, (_, i) => i * 20);
    const range = { start: 2, end: 7, offsetY: 40, totalHeight: 200 };
    expect(
      virtualRangeCoversViewport(range, 60, 80, { offsets, rowHeight: 20 })
    ).toBe(true);
    expect(
      virtualRangeCoversViewport(range, 0, 80, { offsets, rowHeight: 20 })
    ).toBe(false);
    expect(
      virtualRangeCoversViewport(range, 100, 80, { offsets, rowHeight: 20 })
    ).toBe(false);

    const view = read('src/modal/views/diff/VirtualDiff.tsx');
    expect(view).toMatch(/visible intermediate Diff frames are a product contract/);
    expect(view).toMatch(/!virtualRangeCoversViewport/);
    expect(view).toMatch(
      /flushSync\(\(\) => flushPendingScroll\(DIFF_SCROLL_OVERSCAN\)\);\s*return;/
    );
  });

  test('navComment is rAF-coalesced under key-repeat (shell)', () => {
    const shell =
      read('src/modal/app/PrModalShell.tsx') +
      read('src/modal/hooks/useDiffConversationNav.ts');
    expect(shell).toMatch(/navCommentRafRef/);
    expect(shell).toMatch(/navCommentDeltaRef/);
    expect(shell).toMatch(/function navComment\s*\(/);
    expect(shell).toMatch(/requestAnimationFrame\(run\)/);
  });

  test('⌥J/K thread hops replace the ArrowUp/Down cursor atomically', () => {
    const shell =
      read('src/modal/app/PrModalShell.tsx') +
      read('src/modal/hooks/useDiffConversationNav.ts');
    const jump = shell.slice(
      shell.indexOf('const jumpToReviewComment'),
      shell.indexOf('// Finish jump after collapse expand')
    );
    expect(jump).toMatch(/clearLineSelectionForNav\(true\)/);
    expect(jump).toMatch(/commitDiffThreadCursor\(active\?\.id \?\? id, idx\)/);

    const commit = shell.slice(
      shell.indexOf('function commitDiffThreadCursor'),
      shell.indexOf('function handoffThreadExitToSelection')
    );
    expect(commit).toMatch(
      /useModalStore\.setState\(\{[\s\S]*?commentIndex: nextCommentIndex,[\s\S]*?activeDiffCommentId: rootId \?\? null,[\s\S]*?focusedThreadUnitId: null,[\s\S]*?lineSelection: pinned/
    );
  });
});
