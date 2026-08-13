/**
 * Empty-commit PRs (changedFiles: 0) must not enter Diff.
 * Drives the shipped pure helper + static wiring in App/Header.
 */
import { describe, expect, test } from '@rstest/core';
import fs from 'node:fs';
import path from 'node:path';
import { isDiffUnavailable } from '../src/modal/lib/layout-mode';

describe('isDiffUnavailable (pure gate)', () => {
  test('false when detail missing or changedFiles unknown', () => {
    expect(isDiffUnavailable(null)).toBe(false);
    expect(isDiffUnavailable(undefined)).toBe(false);
    expect(isDiffUnavailable({})).toBe(false);
    expect(isDiffUnavailable({ changedFiles: null })).toBe(false);
    expect(isDiffUnavailable({ files: [] })).toBe(false);
    // Empty files alone must not false-disable progressive load
    expect(isDiffUnavailable({ files: [], additions: null, deletions: null })).toBe(
      false
    );
  });

  test('true when changedFiles is explicitly 0', () => {
    expect(isDiffUnavailable({ changedFiles: 0 })).toBe(true);
    expect(isDiffUnavailable({ changedFiles: '0' })).toBe(true);
    expect(
      isDiffUnavailable({
        changedFiles: 0,
        files: [],
        additions: 0,
        deletions: 0,
      })
    ).toBe(true);
  });

  test('false when there are file changes', () => {
    expect(isDiffUnavailable({ changedFiles: 1 })).toBe(false);
    expect(isDiffUnavailable({ changedFiles: 24 })).toBe(false);
    expect(
      isDiffUnavailable({
        changedFiles: 1,
        files: [{ filename: 'a.ts' }],
        additions: 1,
        deletions: 0,
      })
    ).toBe(false);
  });

  test('fallback: empty files + explicit +0/−0 when changedFiles absent', () => {
    expect(
      isDiffUnavailable({ files: [], additions: 0, deletions: 0 })
    ).toBe(true);
    expect(
      isDiffUnavailable({ files: [], additions: 0, deletions: 1 })
    ).toBe(false);
    expect(
      isDiffUnavailable({ files: [{ filename: 'x' }], additions: 0, deletions: 0 })
    ).toBe(false);
  });
});

describe('empty-diff gate wiring (static)', () => {
  const root = path.join(__dirname, '..');
  const app = [
    'src/modal/app/PrModalShell.tsx',
    'src/modal/hooks/usePrModalSessionRoute.ts',
    'src/modal/hooks/useDiffConversationNav.ts',
  ]
    .map((rel) => fs.readFileSync(path.join(root, rel), 'utf8'))
    .join('\n');
  const header = fs.readFileSync(
    path.join(root, 'src/modal/views/chrome/Header.tsx'),
    'utf8'
  );
  const layout = fs.readFileSync(
    path.join(root, 'src/modal/lib/layout-mode.ts'),
    'utf8'
  );

  test('layout-mode exports isDiffUnavailable', () => {
    expect(layout).toMatch(/export function isDiffUnavailable/);
  });

  test('expandDiff / onToggleDiff / session restore use isDiffUnavailable', () => {
    expect(app).toMatch(/isDiffUnavailable/);
    // expandDiff body must gate before setLayoutMode(LAYOUT_DIFF)
    const expandStart = app.indexOf('function expandDiff');
    expect(expandStart).toBeGreaterThan(0);
    const expandSlice = app.slice(expandStart, expandStart + 600);
    expect(expandSlice).toMatch(/isDiffUnavailable/);
    // Session / route open must not land Diff when empty
    expect(app).toMatch(/wantDiff && !emptyDiff|stored\.layoutMode === 'diff' && !emptyDiff/);
  });

  test('Header disables layout toggle when Diff unavailable', () => {
    expect(header).toMatch(/isDiffUnavailable/);
    expect(header).toMatch(/layoutToggleDisabled/);
    expect(header).toMatch(/data-prp-diff-unavailable/);
    expect(header).toMatch(/disabled=\{layoutToggleDisabled\}/);
  });
});
