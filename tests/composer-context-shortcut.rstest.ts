/**
 * Composer-focused context shortcuts: Option chords + ⌘/Ctrl+Enter submit.
 * Drives real exported resolvers from shortcut-policy.
 */
import { describe, expect, test } from '@rstest/core';
import {
  COMPOSER_CONTEXT_SHORTCUT,
  isComposerKeyboardTarget,
  resolveComposerContextShortcutAction,
  resolveModalShortcutAction,
} from '../src/modal/lib/shortcut-policy';

describe('resolveComposerContextShortcutAction', () => {
  test('returns null when composer not focused', () => {
    expect(
      resolveComposerContextShortcutAction({
        composerFocused: false,
        alt: true,
        key: 'e',
      })
    ).toBeNull();
    expect(
      resolveComposerContextShortcutAction({
        composerFocused: false,
        mod: true,
        key: 'Enter',
        code: 'Enter',
      })
    ).toBeNull();
  });

  test('⌥E / ⌥C / ⌥I / ⌥T when focused', () => {
    const base = { composerFocused: true, alt: true, mod: false, shift: false };
    expect(resolveComposerContextShortcutAction({ ...base, key: 'e' })).toBe(
      'composerEmoji'
    );
    expect(resolveComposerContextShortcutAction({ ...base, key: 'c' })).toBe(
      'composerSubmit'
    );
    expect(resolveComposerContextShortcutAction({ ...base, key: 'i' })).toBe(
      'composerFocusInput'
    );
    expect(resolveComposerContextShortcutAction({ ...base, key: 't' })).toBe(
      'composerModeToggle'
    );
  });

  test('⌥T null when canToggleMode false', () => {
    expect(
      resolveComposerContextShortcutAction({
        composerFocused: true,
        alt: true,
        key: 't',
        canToggleMode: false,
      })
    ).toBeNull();
  });

  test('⌥⌃R resolve only when allowed', () => {
    expect(
      resolveComposerContextShortcutAction({
        composerFocused: true,
        alt: true,
        ctrl: true,
        key: 'r',
      })
    ).toBe('composerResolve');
    expect(
      resolveComposerContextShortcutAction({
        composerFocused: true,
        alt: true,
        ctrl: true,
        key: 'r',
        canResolve: false,
      })
    ).toBeNull();
  });

  test('⌘Enter / Ctrl+Enter submit', () => {
    expect(
      resolveComposerContextShortcutAction({
        composerFocused: true,
        mod: true,
        key: 'Enter',
        code: 'Enter',
      })
    ).toBe('composerSubmit');
    expect(
      resolveComposerContextShortcutAction({
        composerFocused: true,
        mod: true,
        alt: true,
        key: 'Enter',
        code: 'Enter',
      })
    ).toBeNull();
  });
});

describe('resolveModalShortcutAction composer path', () => {
  test('⌘Enter maps when composerFocused even if editableTarget', () => {
    expect(
      resolveModalShortcutAction({
        mod: true,
        alt: false,
        shift: false,
        key: 'Enter',
        code: 'Enter',
        editableTarget: true,
        composerFocused: true,
      })
    ).toBe('composerSubmit');
  });

  test('⌥E when composer focused', () => {
    expect(
      resolveModalShortcutAction({
        mod: false,
        alt: true,
        key: 'e',
        editableTarget: true,
        composerFocused: true,
      })
    ).toBe('composerEmoji');
  });

  test('⌥E does not fire without composer focus (editable other)', () => {
    expect(
      resolveModalShortcutAction({
        mod: false,
        alt: true,
        key: 'e',
        editableTarget: true,
        composerFocused: false,
      })
    ).toBeNull();
  });
});

describe('isComposerKeyboardTarget', () => {
  test('detects .prp-mdc host and class on ta', () => {
    const host = {
      classList: { contains: (c: string) => c === 'prp-mdc' },
      closest: (sel: string) =>
        sel.includes('prp-mdc') || sel.includes('data-prp-composer')
          ? host
          : null,
    };
    const ta = {
      classList: { contains: (c: string) => c === 'prp-mdc__ta' },
      closest: (sel: string) =>
        sel.includes('prp-mdc') || sel.includes('data-prp-composer')
          ? host
          : null,
    };
    expect(isComposerKeyboardTarget(ta as any)).toBe(true);
    expect(isComposerKeyboardTarget(host as any)).toBe(true);
    const other = {
      classList: { contains: () => false },
      closest: () => null,
    };
    expect(isComposerKeyboardTarget(other as any)).toBe(false);
  });
});

describe('COMPOSER_CONTEXT_SHORTCUT labels', () => {
  test('exports stable action ids', () => {
    expect(COMPOSER_CONTEXT_SHORTCUT.emoji.action).toBe('composerEmoji');
    expect(COMPOSER_CONTEXT_SHORTCUT.submit.action).toBe('composerSubmit');
    expect(COMPOSER_CONTEXT_SHORTCUT.submitModEnter.chord).toBe('mod+enter');
  });
});
