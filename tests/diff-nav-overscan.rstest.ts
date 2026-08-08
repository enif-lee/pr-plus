/**
 * Diff virtual overscan + programmatic scroll contracts used to cut blank bands
 * and support ⌥J/K hold (shipped VirtualDiff + virtual-range).
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from '@rstest/core';
import { applyProgrammaticDiffScroll } from '../src/modal/lib/virtual-range';

const root = path.resolve(__dirname, '..');

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

describe('Diff overscan / scroll path (shipped)', () => {
  test('VirtualDiff uses elevated DIFF_OVERSCAN and larger jump overscan', () => {
    const src = read('src/modal/views/diff/VirtualDiff.tsx');
    expect(src).toMatch(/const\s+DIFF_OVERSCAN\s*=\s*20/);
    expect(src).toMatch(/overscan:\s*DIFF_OVERSCAN/);
    // Programmatic jump pre-renders neighbors
    expect(src).toMatch(/Math\.max\(\s*DIFF_OVERSCAN\s*,\s*32\s*\)/);
  });

  test('applyProgrammaticDiffScroll dispatches scroll so range updates same tick', () => {
    const src = read('src/modal/lib/virtual-range.ts');
    expect(src).toMatch(/dispatchEvent/);
    expect(src).toMatch(/['"]scroll['"]/);

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

  test('navComment is rAF-coalesced under key-repeat (shell)', () => {
    const shell = read('src/modal/app/PrModalShell.tsx');
    expect(shell).toMatch(/navCommentRafRef/);
    expect(shell).toMatch(/navCommentDeltaRef/);
    expect(shell).toMatch(/function navComment\s*\(/);
    expect(shell).toMatch(/requestAnimationFrame\(run\)/);
  });
});
