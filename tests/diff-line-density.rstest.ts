/**
 * Diff code density: ROW_HEIGHT / --prp-diff-row-h stay in sync and denser
 * than the historical 22px GitHub-adjacent line box.
 */
import { describe, expect, test } from '@rstest/core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ROW_HEIGHT,
  rowHeightFor,
  averageRowHeight,
} from '../src/modal/components/common/utils';
import { createInitialModalState } from '../src/modal/lib/modal-state';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(rel: string) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

describe('ROW_HEIGHT SoT (GitHub-like density)', () => {
  test('plain code row is denser than prior 22px and positive', () => {
    expect(ROW_HEIGHT).toBeLessThan(22);
    expect(ROW_HEIGHT).toBeGreaterThanOrEqual(18);
    expect(ROW_HEIGHT).toBe(20);
  });

  test('rowHeightFor plain code/context returns ROW_HEIGHT', () => {
    const code = {
      kind: 'diff-line',
      lineType: 'context',
      filePath: 'a.ts',
      text: 'const x = 1;',
      oldLine: 1,
      newLine: 1,
    };
    expect(rowHeightFor(code)).toBe(ROW_HEIGHT);
    expect(
      rowHeightFor({ kind: 'diff-line', lineType: 'add', text: '+ok' })
    ).toBe(ROW_HEIGHT);
  });

  test('rowHeightFor does not force comment/header chrome into code density', () => {
    const comment = {
      kind: 'inline-comment',
      commentId: 1,
      body: 'hello',
    };
    const h = rowHeightFor(comment);
    expect(h).toBeGreaterThan(ROW_HEIGHT);
    // Header/meta still use ROW_HEIGHT for fixed chrome rows
    expect(rowHeightFor({ kind: 'file-header', filePath: 'a.ts' })).toBe(
      ROW_HEIGHT
    );
  });

  test('averageRowHeight empty list uses ROW_HEIGHT', () => {
    expect(averageRowHeight([])).toBe(ROW_HEIGHT);
    expect(averageRowHeight(null as any)).toBe(ROW_HEIGHT);
  });

  test('modal-state initial rowHeight matches ROW_HEIGHT', () => {
    expect(createInitialModalState().rowHeight).toBe(ROW_HEIGHT);
  });
});

describe('Diff CSS --prp-diff-row-h matches ROW_HEIGHT', () => {
  test('vlist-host defines CSS var equal to ROW_HEIGHT', () => {
    const css = read('src/modal/views/diff/DiffActiveRow.css');
    expect(css).toMatch(/--prp-diff-row-h:\s*20px/);
    expect(css).toMatch(
      new RegExp(`--prp-diff-row-h:\\s*${ROW_HEIGHT}px`)
    );
    expect(css).toMatch(
      /line-height:\s*var\(--prp-diff-row-h,\s*20px\)/
    );
    // Must not hard-code the old 22px on the host
    expect(css).not.toMatch(/\.prp-vlist-host\s*\{[^}]*line-height:\s*22px/s);
  });

  test('code/LN cells use shared --prp-diff-row-h', () => {
    const code = read('src/modal/views/diff/CodeCell.css');
    const ln = read('src/modal/views/diff/unified-line-numbers.css');
    const sel = read('src/modal/views/diff/LineSelection.css');
    for (const src of [code, ln, sel]) {
      expect(src).toMatch(/var\(--prp-diff-row-h,\s*20px\)/);
    }
    // Code paths no longer hard-code 22px line-height
    expect(code).not.toMatch(/line-height:\s*22px/);
    expect(ln).not.toMatch(/line-height:\s*22px/);
    expect(sel).not.toMatch(/line-height:\s*22px/);
  });

  test('inline thread / file chrome keep independent metrics (not forced to ROW_HEIGHT)', () => {
    const thread = read('src/modal/views/diff/InlineReviewThreads.css');
    // Threads still use relative line-height, not the code row box
    expect(thread).toMatch(/line-height:\s*1\./);
    expect(thread).not.toMatch(/--prp-diff-row-h/);
  });

  test('selection dock host height matches ROW_HEIGHT (not stale 22px fallback)', () => {
    const css = read('src/modal/components/common/TipPopover.css');
    // Host must use shared Diff row metric so virtual offsets do not drift
    expect(css).toMatch(
      /\.prp-sel-dock-host\s*\{[^}]*height:\s*var\(--prp-diff-row-h,\s*20px\)/s
    );
    expect(css).toMatch(
      new RegExp(
        `height:\\s*var\\(--prp-diff-row-h,\\s*${ROW_HEIGHT}px\\)`
      )
    );
    // Old --prp-row-height / 22px fallback must not remain on dock host
    expect(css).not.toMatch(
      /\.prp-sel-dock-host\s*\{[^}]*--prp-row-height[^}]*22px/s
    );
    expect(css).not.toMatch(
      /\.prp-sel-dock-host\s*\{[^}]*height:\s*var\(--prp-row-height,\s*22px\)/s
    );
  });
});
