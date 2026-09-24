/**
 * Diff file-focus outline: wrap the whole focused file (header + body),
 * not the header strip. Line-caret focus keeps the same file ring.
 */
import { describe, expect, test } from '@rstest/core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  diffFileFocusPath,
  fileRowRangesByPath,
  focusedFileOutlineRect,
  focusedFileRowRange,
  unfocusedFileDimBands,
} from '../src/modal/lib/diff-rows-core';
import { rowOffsets, ROW_HEIGHT } from '../src/modal/components/common/utils';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function rowsFor(...files: Array<{ path: string; lines: number }>) {
  const out: any[] = [];
  let i = 0;
  for (const f of files) {
    out.push({ kind: 'file-header', filePath: f.path, rowIndex: i++ });
    for (let n = 0; n < f.lines; n++) {
      out.push({
        kind: 'diff-line',
        filePath: f.path,
        rowIndex: i++,
        lineType: 'context',
      });
    }
  }
  return out;
}

describe('diffFileFocusPath (file + line caret share one file)', () => {
  test('pointer caret wins over a stale tree activeFilePath', () => {
    expect(
      diffFileFocusPath({
        activeFilePath: 'a.ts',
        lineSelection: { filePath: 'b.ts' },
      })
    ).toBe('b.ts');
  });

  test('line caret keeps file outline when tree path is empty', () => {
    expect(
      diffFileFocusPath({
        activeFilePath: null,
        lineSelection: { filePath: 'a.ts' },
      })
    ).toBe('a.ts');
  });

  test('tree/file-nav with no caret still uses activeFilePath', () => {
    expect(
      diffFileFocusPath({
        activeFilePath: 'a.ts',
        lineSelection: null,
      })
    ).toBe('a.ts');
  });

  test('file-header caret and line caret resolve the same path', () => {
    const fileCaret = diffFileFocusPath({
      activeFilePath: 'src/app.ts',
      lineSelection: { filePath: 'src/app.ts' },
    });
    const lineCaret = diffFileFocusPath({
      activeFilePath: 'src/app.ts',
      lineSelection: { filePath: 'src/app.ts' },
    });
    expect(fileCaret).toBe('src/app.ts');
    expect(lineCaret).toBe(fileCaret);
  });

  test('empty state is no focus path', () => {
    expect(diffFileFocusPath({})).toBe('');
    expect(diffFileFocusPath(null)).toBe('');
  });
});

describe('focusedFileRowRange / focusedFileOutlineRect', () => {
  test('covers header through last body row of the focused file', () => {
    const rows = rowsFor(
      { path: 'a.ts', lines: 2 },
      { path: 'b.ts', lines: 3 },
      { path: 'c.ts', lines: 1 }
    );
    expect(focusedFileRowRange(rows, 'b.ts')).toEqual({ start: 3, end: 6 });
    const offsets = rowOffsets(rows);
    const rect = focusedFileOutlineRect(
      focusedFileRowRange(rows, 'b.ts'),
      offsets
    );
    expect(rect).toEqual({
      top: ROW_HEIGHT * 3,
      height: ROW_HEIGHT * 4,
    });
  });

  test('collapsed / header-only file is a one-row ring', () => {
    const rows = rowsFor({ path: 'solo.ts', lines: 0 });
    expect(focusedFileRowRange(rows, 'solo.ts')).toEqual({ start: 0, end: 0 });
    const rect = focusedFileOutlineRect(
      focusedFileRowRange(rows, 'solo.ts'),
      rowOffsets(rows)
    );
    expect(rect).toEqual({ top: 0, height: ROW_HEIGHT });
  });

  test('unknown path and empty inputs yield no rect', () => {
    const rows = rowsFor({ path: 'a.ts', lines: 1 });
    expect(focusedFileRowRange(rows, 'missing.ts')).toBeNull();
    expect(focusedFileRowRange([], 'a.ts')).toBeNull();
    expect(focusedFileOutlineRect(null, rowOffsets(rows))).toBeNull();
  });

  test('unfocused dim bands sit above and below the focused file', () => {
    expect(unfocusedFileDimBands({ top: 40, height: 80 }, 200)).toEqual([
      { top: 0, height: 40 },
      { top: 120, height: 80 },
    ]);
    expect(unfocusedFileDimBands({ top: 0, height: 100 }, 100)).toEqual([]);
    expect(unfocusedFileDimBands(null, 200)).toEqual([]);
  });

  test('fileRowRangesByPath is a one-pass map (file hops look up, not scan)', () => {
    const rows = rowsFor(
      { path: 'a.ts', lines: 2 },
      { path: 'b.ts', lines: 3 },
      { path: 'c.ts', lines: 1 }
    );
    const map = fileRowRangesByPath(rows);
    expect(map.get('a.ts')).toEqual({ start: 0, end: 2 });
    expect(map.get('b.ts')).toEqual({ start: 3, end: 6 });
    expect(map.get('c.ts')).toEqual({ start: 7, end: 8 });
    expect(map.get('missing.ts')).toBeUndefined();
    expect(fileRowRangesByPath([]).size).toBe(0);
  });
});

describe('full-file outline wiring', () => {
  test('overlay lives in the virtual spacer; header keeps leaf chrome only', () => {
    const vdiff = read('src/modal/views/diff/VirtualDiff.tsx');
    const rows = read('src/modal/views/diff/VirtualDiffRows.tsx');
    const css = read('src/modal/views/diff/DiffActiveRow.css');
    const headerCss = read('src/modal/components/common/MermaidBlock.css');
    expect(rows).toMatch(/className="prp-file-focus-outline"/);
    expect(rows).toMatch(/data-file-focus-outline="1"/);
    expect(rows).toMatch(/className="prp-file-unfocused-dim-host"/);
    expect(rows).toMatch(/className="prp-file-unfocused-dim"/);
    expect(rows).toMatch(/fileRowRangesByPath\(virtualRows\)/);
    expect(rows).toMatch(/addEventListener\('scroll', update/);
    expect(vdiff).toMatch(/<DiffFileFocusOutline/);
    expect(vdiff).toMatch(/dimUnfocused=\{dimUnfocused\}/);
    expect(css).toMatch(/\.prp-file-focus-outline\s*\{/);
    expect(css).toMatch(/\.prp-file-unfocused-dim-host\s*\{/);
    expect(css).toMatch(/\.prp-file-unfocused-dim\s*\{/);
    expect(css).toMatch(/inset 0 0 0 1px/);
    expect(css).not.toMatch(/0 0 0 100vmax/);
    const dimHost = css.match(
      /(?:^|\n)\.prp-file-unfocused-dim-host\s*\{[^}]+\}/
    )?.[0];
    expect(dimHost).toBeTruthy();
    expect(dimHost).toMatch(/position:\s*sticky/);
    expect(dimHost).toMatch(/height:\s*0/);
    // Standalone header-focus is leaf chrome (no ring of its own)
    const standaloneHeader = headerCss.match(
      /(?:^|\n)\.prp-vline--header-focus\s*\{[^}]+\}/
    )?.[0];
    expect(standaloneHeader).toBeTruthy();
    expect(standaloneHeader).toMatch(/outline:\s*none/);
    expect(standaloneHeader).not.toMatch(/box-shadow/);
    // Header ring is on ::after so checkbox / status / Comment cannot cover it
    expect(headerCss).toMatch(/\.prp-vline--header-focus::after/);
    expect(headerCss).toMatch(
      /\.prp-file-header-sticky\s+\.prp-vline--header-focus\s*\{/
    );
    // Sticky is a scroller-sibling clone, not CSS position:sticky — ring on host
    expect(headerCss).toMatch(
      /\.prp-file-header-sticky:has\(\[data-file-focus="1"\]\)::after/
    );
    expect(headerCss).toMatch(
      /\.prp-file-header-sticky\s+\.prp-vline--header-focus::after/
    );
    const stickyInnerAfter = headerCss.match(
      /\.prp-file-header-sticky\s+\.prp-vline--header-focus::after\s*\{[^}]+\}/
    )?.[0];
    expect(stickyInnerAfter).toBeTruthy();
    expect(stickyInnerAfter).toMatch(/content:\s*none/);
    const stickyHost = headerCss.match(
      /(?:^|\n)\.prp-file-header-sticky\s*\{[^}]+\}/
    )?.[0];
    expect(stickyHost).toBeTruthy();
    expect(stickyHost).toMatch(/position:\s*absolute/);
    expect(stickyHost).not.toMatch(/position:\s*sticky/);
    expect(stickyHost).toMatch(/background:\s*var\(--prp-bg-muted\)/);
    // Add/del washes are rgba in dark — flatten onto muted or sticky shows code
    const headerAdd = headerCss.match(
      /\.prp-vline--header-add\s*\{[^}]+\}/
    )?.[0];
    expect(headerAdd).toBeTruthy();
    expect(headerAdd).toMatch(/var\(--prp-bg-muted\)/);
    expect(headerAdd).toMatch(/linear-gradient/);
    expect(vdiff).toMatch(/className="prp-file-header-sticky"/);
    expect(vdiff).toMatch(/Sticky is a SIBLING of the scrollport/);
  });

  test('pointer selection start syncs active file (same helper as ↑↓)', () => {
    const shell = read('src/modal/app/PrModalShell.tsx');
    const start = shell.indexOf('function onSelectionStart');
    expect(start).toBeGreaterThan(0);
    const body = shell.slice(start, start + 2800);
    expect(body).toMatch(/setLineSelection\(next\)/);
    expect(body).toMatch(/syncActiveFileFromSelection\(next\)/);
    expect(body).not.toMatch(/onSelectFile\(/);
  });
});
