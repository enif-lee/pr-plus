/**
 * Diff file fold shortcut path resolution + collapse set toggle + prefs.
 */
import { describe, expect, test } from '@rstest/core';
import {
  resolveActiveFileForCollapse,
  resolveModalShortcutAction,
  FILE_FOLD_SHORTCUT,
} from '../src/modal/lib/shortcut-policy';
import {
  togglePathInCollapsedSet,
  isPathCollapsed,
  shouldAutoExpandOnFileNav,
  materializeCollapsedPaths,
} from '../src/modal/lib/collapse';
import { buildDiffPaletteCommands } from '../src/modal/lib/command-palette';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const storageApi = require('../src/storage');
const { normalizePrefs, DEFAULT_PREFS } = storageApi;

describe('resolveActiveFileForCollapse', () => {
  test('prefers line selection path over active tree file', () => {
    expect(
      resolveActiveFileForCollapse({
        lineSelection: { filePath: 'a.ts' },
        activeFilePath: 'b.ts',
      })
    ).toBe('a.ts');
  });

  test('falls back to activeFilePath', () => {
    expect(
      resolveActiveFileForCollapse({
        lineSelection: null,
        activeFilePath: 'b.ts',
      })
    ).toBe('b.ts');
  });

  test('null when nothing focused', () => {
    expect(resolveActiveFileForCollapse({})).toBe(null);
  });
});

describe('FILE_FOLD_SHORTCUT / resolveModalShortcutAction', () => {
  test('⌥F on Diff folds file when no context thread', () => {
    expect(
      resolveModalShortcutAction({
        alt: true,
        key: 'f',
        code: 'KeyF',
        layoutMode: 'diff',
      })
    ).toBe(FILE_FOLD_SHORTCUT.action);
  });

  test('Diff review-thread focus owns ⌥F (thread fold)', () => {
    expect(
      resolveModalShortcutAction({
        alt: true,
        key: 'f',
        code: 'KeyF',
        layoutMode: 'diff',
        contextThreadActive: true,
        diffThreadFocused: true,
      })
    ).toBe('contextThreadFold');
  });

  test('Diff line selection owns ⌥F (file fold) over thread force-true', () => {
    expect(
      resolveModalShortcutAction({
        alt: true,
        key: 'f',
        code: 'KeyF',
        layoutMode: 'diff',
        contextThreadActive: true, // App forces true so ⌥C can seed
        diffThreadFocused: true, // leftover ⌥J focus
        hasLineSelection: true,
      })
    ).toBe(FILE_FOLD_SHORTCUT.action);
  });

  test('Diff with forced context but no real thread focus → file fold', () => {
    expect(
      resolveModalShortcutAction({
        alt: true,
        key: 'f',
        code: 'KeyF',
        layoutMode: 'diff',
        contextThreadActive: true,
        diffThreadFocused: false,
        hasLineSelection: false,
      })
    ).toBe(FILE_FOLD_SHORTCUT.action);
  });

  test('Conversation context thread still owns ⌥F', () => {
    expect(
      resolveModalShortcutAction({
        alt: true,
        key: 'f',
        code: 'KeyF',
        layoutMode: 'centered',
        contextThreadActive: true,
      })
    ).toBe('contextThreadFold');
  });

  test('⌥F does not fire on conversation without context', () => {
    expect(
      resolveModalShortcutAction({
        alt: true,
        key: 'f',
        code: 'KeyF',
        layoutMode: 'centered',
      })
    ).toBe(null);
  });
});

describe('togglePathInCollapsedSet', () => {
  const files = [
    { filename: 'a.ts', defaultCollapsed: false },
    { filename: 'b.ts', defaultCollapsed: true },
  ];

  test('collapses an open path', () => {
    const next = togglePathInCollapsedSet(new Set(), 'a.ts', files, null);
    expect(isPathCollapsed('a.ts', next, false, false, null)).toBe(true);
  });

  test('expands a collapsed path without re-opening defaults', () => {
    const start = materializeCollapsedPaths(new Set(), files, null);
    expect(isPathCollapsed('b.ts', start, true, false, null)).toBe(true);
    const next = togglePathInCollapsedSet(start, 'b.ts', files, null);
    expect(isPathCollapsed('b.ts', next, true, false, null)).toBe(false);
    // default-collapsed path stays collapsed when still in set / materialized
    expect(next.has('b.ts')).toBe(false);
  });
});

describe('autoExpandOnFileNav pref', () => {
  test('defaults off', () => {
    expect(DEFAULT_PREFS.autoExpandOnFileNav).toBe(false);
    expect(shouldAutoExpandOnFileNav(null)).toBe(false);
    expect(shouldAutoExpandOnFileNav({})).toBe(false);
    expect(normalizePrefs({}).autoExpandOnFileNav).toBe(false);
  });

  test('normalizePrefs preserves true', () => {
    expect(
      normalizePrefs({ autoExpandOnFileNav: true }).autoExpandOnFileNav
    ).toBe(true);
    expect(shouldAutoExpandOnFileNav({ autoExpandOnFileNav: true })).toBe(
      true
    );
  });
});

describe('command palette', () => {
  test('includes fold focused file command', () => {
    const cmds = buildDiffPaletteCommands();
    const fold = cmds.find((c) => c.id === 'diff-fold-file');
    expect(fold).toBeTruthy();
    expect(fold.action).toBe('toggleActiveFileCollapse');
    expect(String(fold.shortcut || '')).toMatch(/opt\+f/i);
  });
});
