/**
 * Focused comment action shortcuts (⌥Y/L/Q/H/W/X/E).
 */
import { describe, expect, test } from '@rstest/core';
import {
  CONTEXT_COMMENT_ACTION_SHORTCUT,
  resolveModalShortcutAction,
} from '../src/modal/lib/shortcut-policy';

describe('CONTEXT_COMMENT_ACTION_SHORTCUT map', () => {
  test('covers chrome actions with opt labels', () => {
    expect(CONTEXT_COMMENT_ACTION_SHORTCUT.copyBody.labelMac).toBe('⌥Y');
    expect(CONTEXT_COMMENT_ACTION_SHORTCUT.copyLink.labelMac).toBe('⌥L');
    expect(CONTEXT_COMMENT_ACTION_SHORTCUT.quote.labelMac).toBe('⌥Q');
    expect(CONTEXT_COMMENT_ACTION_SHORTCUT.hide.labelMac).toBe('⌥H');
    expect(CONTEXT_COMMENT_ACTION_SHORTCUT.edit.labelMac).toBe('⌥W');
    expect(CONTEXT_COMMENT_ACTION_SHORTCUT.delete.labelMac).toBe('⌥X');
    expect(CONTEXT_COMMENT_ACTION_SHORTCUT.react.labelMac).toBe('⌥E');
  });
});

describe('resolveModalShortcutAction — context comment chrome', () => {
  const base = {
    contextThreadActive: true,
    alt: true,
    mod: false,
    shift: false,
    ctrl: false,
    editableTarget: false,
    layoutMode: 'conversation',
  };

  test('⌥Y/L/Q/H/W/X/E map to actions when focused', () => {
    expect(resolveModalShortcutAction({ ...base, key: 'y' })).toBe(
      'contextCommentCopyBody'
    );
    expect(resolveModalShortcutAction({ ...base, key: 'l' })).toBe(
      'contextCommentCopyLink'
    );
    expect(resolveModalShortcutAction({ ...base, key: 'q' })).toBe(
      'contextCommentQuote'
    );
    expect(resolveModalShortcutAction({ ...base, key: 'h' })).toBe(
      'contextCommentHide'
    );
    expect(resolveModalShortcutAction({ ...base, key: 'w' })).toBe(
      'contextCommentEdit'
    );
    expect(resolveModalShortcutAction({ ...base, key: 'x' })).toBe(
      'contextCommentDelete'
    );
    expect(resolveModalShortcutAction({ ...base, key: 'e' })).toBe(
      'contextCommentReact'
    );
  });

  test('⌥. stays Diff layout toggle (not reaction) even with comment focus', () => {
    expect(resolveModalShortcutAction({ ...base, key: '.' })).toBe('toggleDiff');
    expect(
      resolveModalShortcutAction({
        ...base,
        contextThreadActive: false,
        key: '.',
      })
    ).toBe('toggleDiff');
  });

  test('⌥E reaction requires comment focus; composer no longer owns emoji', () => {
    expect(
      resolveModalShortcutAction({
        ...base,
        contextThreadActive: false,
        composerFocused: true,
        editableTarget: true,
        key: 'e',
      })
    ).toBeNull();
  });

  test('null when not context-focused', () => {
    expect(
      resolveModalShortcutAction({
        ...base,
        contextThreadActive: false,
        key: 'y',
      })
    ).toBeNull();
  });

  test('null when typing in composer (editableTarget)', () => {
    expect(
      resolveModalShortcutAction({
        ...base,
        editableTarget: true,
        key: 'y',
      })
    ).toBeNull();
  });

  test('⌥F still folds thread (not stolen by comment actions)', () => {
    expect(resolveModalShortcutAction({ ...base, key: 'f' })).toBe(
      'contextThreadFold'
    );
  });
});
