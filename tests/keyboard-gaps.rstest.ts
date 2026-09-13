/**
 * Keyboard-first gap fill: shipped resolver + palette coverage for
 * discard pending, hide-whitespace, unified/split, Diff Goto.
 */
import { describe, expect, test } from '@rstest/core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DISCARD_PENDING_SHORTCUT,
  TOGGLE_DIFF_MODE_SHORTCUT,
  TOGGLE_HIDE_WHITESPACE_SHORTCUT,
  resolveModalShortcutAction,
} from '../src/modal/lib/shortcut-policy';
import {
  buildPaletteCommands,
  checkPaletteShortcutCoverage,
} from '../src/modal/lib/command-palette';
import { formatMessage } from '../src/modal/lib/i18n';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

describe('keyboard-gap shortcut resolver', () => {
  test('⌥⇧H on Diff → toggleHideWhitespace', () => {
    expect(
      resolveModalShortcutAction({
        alt: true,
        shift: true,
        key: 'h',
        code: 'KeyH',
        layoutMode: 'diff',
        editableTarget: false,
      })
    ).toBe(TOGGLE_HIDE_WHITESPACE_SHORTCUT.action);
    expect(
      resolveModalShortcutAction({
        alt: true,
        shift: true,
        key: 'h',
        code: 'KeyH',
        layoutMode: 'conversation',
        editableTarget: false,
      })
    ).not.toBe(TOGGLE_HIDE_WHITESPACE_SHORTCUT.action);
  });

  test('⌥⇧\\ on Diff → toggleDiffMode', () => {
    expect(
      resolveModalShortcutAction({
        alt: true,
        shift: true,
        key: '\\',
        code: 'Backslash',
        layoutMode: 'diff',
        editableTarget: false,
      })
    ).toBe(TOGGLE_DIFF_MODE_SHORTCUT.action);
  });

  test('⌥⇧⌫ → discardPendingReview', () => {
    expect(
      resolveModalShortcutAction({
        alt: true,
        shift: true,
        key: 'Backspace',
        code: 'Backspace',
        layoutMode: 'conversation',
        editableTarget: false,
      })
    ).toBe(DISCARD_PENDING_SHORTCUT.action);
  });

  test('⌥G still opens Diff Goto', () => {
    expect(
      resolveModalShortcutAction({
        alt: true,
        key: 'g',
        code: 'KeyG',
        layoutMode: 'diff',
        editableTarget: false,
      })
    ).toBe('openDiffGoto');
  });
});

describe('keyboard-gap palette + i18n', () => {
  test('Diff palette includes goto / whitespace / split with chords', () => {
    const cmds = buildPaletteCommands({}, { layoutMode: 'diff' });
    const byId = Object.fromEntries(cmds.map((c: any) => [c.id, c]));
    expect(byId['diff-goto']?.action).toBe('openDiffGoto');
    expect(String(byId['diff-goto']?.shortcut).toLowerCase()).toBe('opt+g');
    expect(byId['diff-hide-whitespace']?.action).toBe('toggleHideWhitespace');
    expect(String(byId['diff-hide-whitespace']?.shortcut).toLowerCase()).toBe(
      'opt+shift+h'
    );
    expect(byId['diff-toggle-mode']?.action).toBe('toggleDiffMode');
    expect(String(byId['diff-toggle-mode']?.shortcut).toLowerCase()).toBe(
      'opt+shift+\\'
    );
    expect(byId['diff-hide-outdated']?.action).toBe('toggleHideOutdated');
    expect(byId['diff-expand-hunk']?.action).toBe('expandHunkAtCaret');
    const check = checkPaletteShortcutCoverage(cmds, 'diff');
    expect(check.missing).toEqual([]);
  });

  test('Review palette includes discard pending + load more', () => {
    const cmds = buildPaletteCommands({}, { layoutMode: 'conversation' });
    const discard = cmds.find((c: any) => c.id === 'discard-pending-review');
    const load = cmds.find((c: any) => c.id === 'load-more-threads');
    expect(discard?.action).toBe('discardPendingReview');
    expect(String(discard?.shortcut).toLowerCase()).toBe('opt+shift+backspace');
    expect(load?.action).toBe('loadMoreThreads');
  });

  test('new palette titles localize (en + ko)', () => {
    expect(formatMessage('palette_cmd_discard_pending_review', 'en')).toMatch(
      /discard/i
    );
    expect(formatMessage('palette_cmd_discard_pending_review', 'ko')).not.toBe(
      'palette_cmd_discard_pending_review'
    );
    expect(formatMessage('palette_cmd_diff_goto', 'ja')).not.toBe(
      'palette_cmd_diff_goto'
    );
    expect(formatMessage('palette_cmd_diff_hide_whitespace', 'zh_CN')).not.toBe(
      'palette_cmd_diff_hide_whitespace'
    );
  });
});

describe('keyboard-gap wiring', () => {
  test('hotkeys + palette runner dispatch new actions', () => {
    const hk = read('src/modal/hooks/usePrModalHotkeys.ts');
    expect(hk).toMatch(/case 'toggleHideWhitespace'/);
    expect(hk).toMatch(/case 'toggleDiffMode'/);
    expect(hk).toMatch(/case 'discardPendingReview'/);
    expect(hk).toMatch(/case 'loadMoreThreads'/);
    const pal = read('src/modal/app/pr-modal-run-palette.ts');
    expect(pal).toMatch(/case 'toggleHideWhitespace'/);
    expect(pal).toMatch(/case 'discardPendingReview'/);
    expect(pal).toMatch(/prp-open-diff-goto/);
    expect(pal).toMatch(/case 'expandHunkAtCaret'/);
    expect(pal).toMatch(/case 'toggleHideOutdated'/);
    const bodyCmd = read('src/modal/lib/command-palette-build.ts');
    expect(bodyCmd).not.toMatch(/edit-body[\s\S]{0,180}opt\+e/);
    expect(read('src/modal/hooks/useDiffConversationNav.ts')).toMatch(
      /function expandHunkAtCaret/
    );
  });

  test('Finish review Discard shows ⌥⇧⌫ hint', () => {
    const src = read('src/modal/views/chrome/FinishReviewModal.tsx');
    expect(src).toMatch(/scDiscard/);
    expect(src).toMatch(/Backspace/);
    expect(src).toMatch(/onDiscardRef/);
  });
});
