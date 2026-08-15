/**
 * Diff file fold shortcut path resolution + collapse set toggle + prefs.
 */
import { describe, expect, test } from '@rstest/core';
import {
  resolveActiveFileForCollapse,
  resolveArrowFoldAction,
  resolveModalShortcutAction,
  isEditableKeyboardTarget,
  FILE_FOLD_SHORTCUT,
} from '../src/modal/lib/shortcut-policy';
import {
  togglePathInCollapsedSet,
  setPathCollapsedInSet,
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

  test('Diff code-body line selection owns ⌥F (file fold) over leftover thread', () => {
    expect(
      resolveModalShortcutAction({
        alt: true,
        key: 'f',
        code: 'KeyF',
        layoutMode: 'diff',
        contextThreadActive: true, // App forces true so ⌥C can seed
        diffThreadFocused: true, // leftover ⌥J focus
        hasLineSelection: true, // code-body only (App uses isCodeBodySelection)
      })
    ).toBe(FILE_FOLD_SHORTCUT.action);
  });

  test('Diff thread caret (↑↓ on thread) owns ⌥F — not file fold', () => {
    // hasLineSelection false: thread/file carets are not code-body selection
    expect(
      resolveModalShortcutAction({
        alt: true,
        key: 'f',
        code: 'KeyF',
        layoutMode: 'diff',
        contextThreadActive: true,
        diffThreadFocused: true,
        hasLineSelection: false,
      })
    ).toBe('contextThreadFold');
  });

  test('Diff thread focus owns ArrowLeft collapse (not file)', () => {
    expect(
      resolveModalShortcutAction({
        key: 'ArrowLeft',
        code: 'ArrowLeft',
        layoutMode: 'diff',
        contextThreadActive: true,
        diffThreadFocused: true,
        hasLineSelection: false,
      })
    ).toBe('contextThreadCollapse');
    expect(
      resolveModalShortcutAction({
        key: 'ArrowRight',
        code: 'ArrowRight',
        layoutMode: 'diff',
        contextThreadActive: true,
        diffThreadFocused: true,
        hasLineSelection: false,
      })
    ).toBe('contextThreadExpand');
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

describe('isEditableKeyboardTarget (toolbar radios must not trap arrows)', () => {
  function fakeEl(
    tag: string,
    attrs: Record<string, string> = {}
  ): HTMLElement {
    const type = attrs.type || '';
    return {
      tagName: tag.toUpperCase(),
      type,
      isContentEditable: attrs.contentEditable === 'true',
      closest(sel: string) {
        // Minimal: match self against simple tag/type selectors used by helper
        if (sel.includes('textarea') && tag.toUpperCase() === 'TEXTAREA') {
          return this as unknown as HTMLElement;
        }
        if (sel.includes('select') && tag.toUpperCase() === 'SELECT') {
          return this as unknown as HTMLElement;
        }
        if (sel.includes('contenteditable') && attrs.contentEditable === 'true') {
          return this as unknown as HTMLElement;
        }
        if (sel.includes('input') && tag.toUpperCase() === 'INPUT') {
          return this as unknown as HTMLElement;
        }
        return null;
      },
    } as unknown as HTMLElement;
  }

  test('text inputs / textarea / select are editable', () => {
    expect(isEditableKeyboardTarget(fakeEl('textarea'))).toBe(true);
    expect(isEditableKeyboardTarget(fakeEl('select'))).toBe(true);
    expect(isEditableKeyboardTarget(fakeEl('input', { type: 'text' }))).toBe(
      true
    );
    expect(isEditableKeyboardTarget(fakeEl('input', { type: 'search' }))).toBe(
      true
    );
  });

  test('radio / checkbox are NOT editable (Diff Unified/Split toggle)', () => {
    expect(isEditableKeyboardTarget(fakeEl('input', { type: 'radio' }))).toBe(
      false
    );
    expect(
      isEditableKeyboardTarget(fakeEl('input', { type: 'checkbox' }))
    ).toBe(false);
  });

  test('null / button not editable', () => {
    expect(isEditableKeyboardTarget(null)).toBe(false);
    expect(isEditableKeyboardTarget(fakeEl('button'))).toBe(false);
  });

});

describe('ArrowLeft/Right directed fold', () => {
  test('Diff without thread: ← collapseActiveFile, → expandActiveFile', () => {
    expect(
      resolveModalShortcutAction({
        key: 'ArrowLeft',
        code: 'ArrowLeft',
        layoutMode: 'diff',
      })
    ).toBe('collapseActiveFile');
    expect(
      resolveModalShortcutAction({
        key: 'ArrowRight',
        code: 'ArrowRight',
        layoutMode: 'diff',
      })
    ).toBe('expandActiveFile');
  });

  test('Diff thread focus without line selection folds thread', () => {
    expect(
      resolveModalShortcutAction({
        key: 'ArrowLeft',
        code: 'ArrowLeft',
        layoutMode: 'diff',
        contextThreadActive: true,
        diffThreadFocused: true,
        hasLineSelection: false,
      })
    ).toBe('contextThreadCollapse');
    expect(
      resolveModalShortcutAction({
        key: 'ArrowRight',
        code: 'ArrowRight',
        layoutMode: 'diff',
        contextThreadActive: true,
        diffThreadFocused: true,
        hasLineSelection: false,
      })
    ).toBe('contextThreadExpand');
  });

  test('Diff line selection prefers file fold over thread', () => {
    expect(
      resolveModalShortcutAction({
        key: 'ArrowLeft',
        code: 'ArrowLeft',
        layoutMode: 'diff',
        contextThreadActive: true,
        diffThreadFocused: true,
        hasLineSelection: true,
      })
    ).toBe('collapseActiveFile');
  });

  test('Conversation context thread owns arrows', () => {
    expect(
      resolveModalShortcutAction({
        key: 'ArrowLeft',
        code: 'ArrowLeft',
        layoutMode: 'centered',
        contextThreadActive: true,
      })
    ).toBe('contextThreadCollapse');
  });

  test('editable target blocks arrow fold', () => {
    expect(
      resolveModalShortcutAction({
        key: 'ArrowLeft',
        code: 'ArrowLeft',
        layoutMode: 'diff',
        editableTarget: true,
      })
    ).toBe(null);
  });

  test('resolveArrowFoldAction pure helper matches', () => {
    expect(
      resolveArrowFoldAction({ key: 'arrowleft', layoutMode: 'diff' })
    ).toBe('collapseActiveFile');
    expect(
      resolveArrowFoldAction({
        key: 'arrowright',
        layoutMode: 'diff',
        diffThreadFocused: true,
        hasLineSelection: false,
      })
    ).toBe('contextThreadExpand');
  });
});

describe('setPathCollapsedInSet directed fold', () => {
  const files = [
    { filename: 'a.ts', defaultCollapsed: false },
    { filename: 'b.ts', defaultCollapsed: true },
  ];

  test('force collapse then expand', () => {
    let n = setPathCollapsedInSet(new Set(), 'a.ts', true, files, null);
    expect(isPathCollapsed('a.ts', n, false, false, null)).toBe(true);
    n = setPathCollapsedInSet(n, 'a.ts', false, files, null);
    expect(isPathCollapsed('a.ts', n, false, false, null)).toBe(false);
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
