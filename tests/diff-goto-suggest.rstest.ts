/**
 * Diff Goto pure match / rank helpers (shipped SoT).
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from '@rstest/core';
import {
  fileChangeVolume,
  filePathMatchesQuery,
  gotoHighlightSegments,
  gotoMatchRanges,
  gotoPathQueryForMatch,
  pathInitials,
  rankGotoFileSuggestions,
  resolveGotoSubmitQuery,
  scoreFilePathMatch,
  segmentInitials,
} from '../src/modal/lib/diff-goto-suggest';
import { resolveModalShortcutAction } from '../src/modal/lib/shortcut-policy';
import { parseGotoQuery } from '../src/modal/lib/line-selection';

const root = path.resolve(__dirname, '..');

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

describe('diff-goto-suggest match + rank', () => {
  test('segmentInitials: Pascal / snake / whitespace', () => {
    expect(segmentInitials('FooBarBaz')).toBe('fbb');
    expect(segmentInitials('foo_bar_baz')).toBe('fbb');
    expect(segmentInitials('foo-bar-baz')).toBe('fbb');
    expect(segmentInitials('foo bar baz')).toBe('fbb');
  });

  test('pathInitials: /abc/def/gg → adg', () => {
    const init = pathInitials('/abc/def/gg');
    expect(init.replace(/\s+/g, '')).toMatch(/adg/);
    expect(pathInitials('src/modal/DiffGoto.tsx').length).toBeGreaterThan(0);
  });

  test('contains match scores basename prefix above path contains', () => {
    const path = 'src/modal/views/diff/DiffFloatingController.tsx';
    expect(filePathMatchesQuery(path, 'diff')).toBe(true);
    expect(filePathMatchesQuery(path, 'floating')).toBe(true);
    expect(filePathMatchesQuery(path, 'zzz')).toBe(false);
    // Exact basename prefix beats a short substring hit elsewhere in the path
    expect(scoreFilePathMatch(path, 'DiffFloatingController')).toBeGreaterThan(
      scoreFilePathMatch(path, 'views')
    );
    expect(scoreFilePathMatch(path, 'DiffFloatingController.tsx')).toBeGreaterThanOrEqual(
      700
    );
  });

  test('initial match path adg for abc/def/gg', () => {
    expect(filePathMatchesQuery('abc/def/gg', 'adg')).toBe(true);
    expect(filePathMatchesQuery('foo/bar/baz', 'fbb')).toBe(true);
  });

  test('idle rank: most changes first, top 3', () => {
    const files = [
      { filename: 'a.ts', changes: 10 },
      { filename: 'b.ts', changes: 100 },
      { filename: 'c.ts', changes: 50 },
      { filename: 'd.ts', changes: 1 },
    ];
    const top = rankGotoFileSuggestions(files, '', { idleLimit: 3 });
    expect(top.map((t) => t.path)).toEqual(['b.ts', 'c.ts', 'a.ts']);
    expect(top).toHaveLength(3);
  });

  test('typed query filters and re-ranks', () => {
    const files = [
      { filename: 'src/foo/Bar.ts', changes: 5 },
      { filename: 'src/foo/Baz.ts', changes: 50 },
      { filename: 'other/x.ts', changes: 200 },
    ];
    const hits = rankGotoFileSuggestions(files, 'foo', { searchLimit: 12 });
    expect(hits.every((h) => h.path.includes('foo'))).toBe(true);
    expect(hits[0].path).toMatch(/Baz|Bar/);
  });

  test('fileChangeVolume falls back to additions+deletions', () => {
    expect(fileChangeVolume({ additions: 3, deletions: 2 })).toBe(5);
    expect(fileChangeVolume({ changes: 9, additions: 1 })).toBe(9);
  });

  test('parseGotoQuery accepts bare file path (suggestion select)', () => {
    expect(parseGotoQuery('src/foo.ts')).toEqual({
      path: 'src/foo.ts',
      startLine: 1,
      endLine: null,
    });
    expect(parseGotoQuery('42')).toEqual({
      path: null,
      startLine: 42,
      endLine: null,
    });
  });

  test('resolveGotoSubmitQuery: bare line ignores suggestion path', () => {
    expect(resolveGotoSubmitQuery('42', 'src/big.ts')).toBe('42');
    expect(resolveGotoSubmitQuery('10:20', 'src/big.ts')).toBe('10:20');
    // Idle top-file suggestion must not steal line Goto
    expect(resolveGotoSubmitQuery('99', 'a.ts')).toBe('99');
  });

  test('resolveGotoSubmitQuery: empty typed uses active suggestion (idle Enter)', () => {
    expect(resolveGotoSubmitQuery('', 'src/top.ts')).toBe('src/top.ts');
    expect(resolveGotoSubmitQuery('   ', 'src/top.ts')).toBe('src/top.ts');
    expect(resolveGotoSubmitQuery('', null)).toBe('');
    expect(resolveGotoSubmitQuery('', '')).toBe('');
  });

  test('resolveGotoSubmitQuery: path pick uses suggestion; keeps :line suffix', () => {
    expect(resolveGotoSubmitQuery('foo', 'src/foo/Bar.ts')).toBe('src/foo/Bar.ts');
    expect(resolveGotoSubmitQuery('foo:12', 'src/foo/Bar.ts')).toBe(
      'src/foo/Bar.ts:12'
    );
    expect(resolveGotoSubmitQuery('src/x.ts:3:5', 'src/x.ts')).toBe(
      'src/x.ts:3:5'
    );
    expect(resolveGotoSubmitQuery('alone.ts', null)).toBe('alone.ts');
  });
});

describe('goto match bold ranges (contains + initial)', () => {
  test('gotoPathQueryForMatch strips :line and bare digits', () => {
    expect(gotoPathQueryForMatch('src/foo.ts:12')).toBe('src/foo.ts');
    expect(gotoPathQueryForMatch('foo:3:5')).toBe('foo');
    expect(gotoPathQueryForMatch('42')).toBe('');
    expect(gotoPathQueryForMatch('10:20')).toBe('');
    expect(gotoPathQueryForMatch('  Diff  ')).toBe('Diff');
  });

  test('contains match: first contiguous hit is bold', () => {
    const path = 'src/modal/views/diff/DiffFloatingController.tsx';
    const ranges = gotoMatchRanges(path, 'diff');
    expect(ranges.length).toBe(1);
    expect(ranges[0].mode).toBe('contains');
    const slice = path.slice(ranges[0].start, ranges[0].end);
    expect(slice.toLowerCase()).toBe('diff');
    const segs = gotoHighlightSegments(path, 'floating');
    const bold = segs.filter((s) => s.bold).map((s) => s.text).join('');
    expect(bold.toLowerCase()).toBe('floating');
    expect(segs.some((s) => !s.bold && s.text.length > 0)).toBe(true);
  });

  test('initial match: path segment first letters are bold', () => {
    const path = 'abc/def/gg';
    const ranges = gotoMatchRanges(path, 'adg');
    expect(ranges.length).toBe(3);
    expect(ranges.every((r) => r.mode === 'initial')).toBe(true);
    const chars = ranges.map((r) => path.slice(r.start, r.end)).join('');
    expect(chars.toLowerCase()).toBe('adg');
    const segs = gotoHighlightSegments(path, 'adg');
    const bold = segs.filter((s) => s.bold).map((s) => s.text).join('');
    expect(bold.toLowerCase()).toBe('adg');
  });

  test('idle / no match: no bold spans invented', () => {
    expect(gotoMatchRanges('a/b.ts', '')).toEqual([]);
    expect(gotoHighlightSegments('a/b.ts', '')).toEqual([
      { text: 'a/b.ts', bold: false },
    ]);
    expect(gotoMatchRanges('a/b.ts', 'zzz')).toEqual([]);
  });
});

describe('Diff Goto UI + hotkey contracts', () => {
  test('⌥G resolves to openDiffGoto on Diff only', () => {
    expect(
      resolveModalShortcutAction({
        alt: true,
        shift: false,
        mod: false,
        key: 'g',
        code: 'KeyG',
        layoutMode: 'diff',
        editableTarget: false,
      })
    ).toBe('openDiffGoto');
    expect(
      resolveModalShortcutAction({
        alt: true,
        shift: false,
        mod: false,
        key: 'g',
        code: 'KeyG',
        layoutMode: 'centered',
        editableTarget: false,
      })
    ).not.toBe('openDiffGoto');
  });

  test('DiffFloatingController: separate Goto surface + bold match wiring', () => {
    const ui = read('src/modal/views/diff/DiffFloatingController.tsx');
    expect(ui).toMatch(/data-prp-diff-goto=["']1["']/);
    expect(ui).toMatch(/data-prp-diff-goto-input=["']1["']/);
    expect(ui).toMatch(/data-prp-diff-goto-suggest=["']1["']/);
    expect(ui).toMatch(/data-prp-diff-float-nav=["']1["']/);
    expect(ui).toMatch(/data-prp-diff-float-stack=["']1["']/);
    expect(ui).toMatch(/rankGotoFileSuggestions/);
    expect(ui).toMatch(/gotoHighlightSegments/);
    expect(ui).toMatch(/prp-diff-float-goto__match/);
    expect(ui).toMatch(/ArrowDown/);
    expect(ui).toMatch(/ArrowUp/);
    expect(ui).toMatch(/prp-open-diff-goto|PRP_OPEN_DIFF_GOTO/);
    expect(ui).toMatch(/setTimeout\(\s*\(\)\s*=>\s*setDebouncedQuery/);
    expect(ui).toMatch(/inputRef\.current\?\.focus/);
    // Goto is not nested inside float-nav chrome
    expect(ui).not.toMatch(
      /prp-diff-float-nav["'][\s\S]{0,200}data-prp-diff-goto=["']1["']/
    );
  });

  test('Goto CSS: fixed width bar + separate surface classes', () => {
    const css = read('src/modal/views/diff/DiffActiveRow.css');
    expect(css).toMatch(/\.prp-diff-float-goto\s*\{/);
    expect(css).toMatch(/\.prp-diff-float-nav\s*\{/);
    expect(css).toMatch(/\.prp-diff-float-stack\s*\{/);
    // Fixed width (not min/max-only shrink wrap)
    expect(css).toMatch(
      /\.prp-diff-float-goto\s*\{[\s\S]*?width:\s*320px[\s\S]*?min-width:\s*320px[\s\S]*?max-width:\s*320px/
    );
    expect(css).toMatch(/\.prp-diff-float-goto__match\s*\{[\s\S]*?font-weight:\s*700/);
  });

  test('hotkeys dispatch openDiffGoto; workspace passes files', () => {
    const hk = read('src/modal/hooks/usePrModalHotkeys.ts');
    expect(hk).toMatch(/openDiffGoto/);
    expect(hk).toMatch(/prp-open-diff-goto/);
    const ws = read('src/modal/views/pr-modal/DiffWorkspace.tsx');
    expect(ws).toMatch(/files=\{displayFiles/);
  });
});
