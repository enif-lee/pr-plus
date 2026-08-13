/**
 * Composer-focused context shortcuts: Option chords + ⌘/Ctrl+Enter submit.
 * Drives real exported resolvers from shortcut-policy.
 */
import { describe, expect, test } from '@rstest/core';
import {
  COMPOSER_CONTEXT_SHORTCUT,
  findComposerShortcutSurface,
  isComposerKeyboardTarget,
  isEditableKeyboardTarget,
  resolveComposerContextShortcutAction,
  resolveModalShortcutAction,
  shouldPreventConvArrowFallback,
} from '../src/modal/lib/shortcut-policy';
import fs from 'node:fs';
import path from 'node:path';

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

  test('⌥C / ⌥I / ⌥S / ⌥T when focused (⌥E is comment reaction, not composer)', () => {
    const base = { composerFocused: true, alt: true, mod: false, shift: false };
    expect(resolveComposerContextShortcutAction({ ...base, key: 'e' })).toBeNull();
    expect(resolveComposerContextShortcutAction({ ...base, key: 'c' })).toBe(
      'composerSubmit'
    );
    expect(resolveComposerContextShortcutAction({ ...base, key: 'i' })).toBe(
      'composerFocusInput'
    );
    expect(resolveComposerContextShortcutAction({ ...base, key: 's' })).toBe(
      'composerStartPending'
    );
    expect(resolveComposerContextShortcutAction({ ...base, key: 't' })).toBe(
      'composerModeToggle'
    );
  });

  test('⌥S null when canStartPending false', () => {
    expect(
      resolveComposerContextShortcutAction({
        composerFocused: true,
        alt: true,
        key: 's',
        canStartPending: false,
      })
    ).toBeNull();
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

  test('⌥E is not a composer chord (reaction chrome owns it)', () => {
    expect(
      resolveModalShortcutAction({
        mod: false,
        alt: true,
        key: 'e',
        editableTarget: true,
        composerFocused: true,
      })
    ).toBeNull();
  });

  test('⌥E without context focus is not composer emoji', () => {
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

describe('findComposerShortcutSurface', () => {
  test('defaults to conversation footer when focus is body', () => {
    if (typeof document === 'undefined') {
      expect(true).toBe(true);
      return;
    }
    const root = document.createElement('div');
    root.setAttribute('data-prp-composer-root', '1');
    root.setAttribute('data-prp-composer-kind', 'conversation');
    root.setAttribute('data-prp-can-toggle-mode', '1');
    const mdc = document.createElement('div');
    mdc.className = 'prp-mdc';
    mdc.setAttribute('data-prp-composer', '1');
    root.appendChild(mdc);
    document.body.appendChild(root);
    try {
      const surface = findComposerShortcutSurface({
        activeElement: document.body,
        doc: document,
      });
      expect(surface.active).toBe(true);
      expect(surface.root).toBe(root);
      expect(surface.mdc).toBe(mdc);
    } finally {
      root.remove();
    }
  });

  test('does not default when typing in a non-composer editable', () => {
    if (typeof document === 'undefined') {
      expect(true).toBe(true);
      return;
    }
    const root = document.createElement('div');
    root.setAttribute('data-prp-composer-root', '1');
    root.setAttribute('data-prp-composer-kind', 'conversation');
    document.body.appendChild(root);
    const input = document.createElement('input');
    document.body.appendChild(input);
    try {
      expect(isEditableKeyboardTarget(input)).toBe(true);
      const surface = findComposerShortcutSurface({
        activeElement: input,
        doc: document,
      });
      expect(surface.active).toBe(false);
    } finally {
      root.remove();
      input.remove();
    }
  });

  test('layoutMode=diff never claims conversation footer (keep-alive steal)', () => {
    if (typeof document === 'undefined') {
      expect(true).toBe(true);
      return;
    }
    const root = document.createElement('div');
    root.setAttribute('data-prp-composer-root', '1');
    root.setAttribute('data-prp-composer-kind', 'conversation');
    const mdc = document.createElement('div');
    mdc.setAttribute('data-prp-composer', '1');
    root.appendChild(mdc);
    document.body.appendChild(root);
    try {
      const surface = findComposerShortcutSurface({
        activeElement: document.body,
        doc: document,
        layoutMode: 'diff',
      });
      expect(surface.active).toBe(false);
      expect(surface.root).toBe(null);
    } finally {
      root.remove();
    }
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
  test('exports stable action ids (no emoji chord)', () => {
    expect((COMPOSER_CONTEXT_SHORTCUT as any).emoji).toBeUndefined();
    expect(COMPOSER_CONTEXT_SHORTCUT.submit.action).toBe('composerSubmit');
    expect(COMPOSER_CONTEXT_SHORTCUT.submitModEnter.chord).toBe('mod+enter');
    expect(COMPOSER_CONTEXT_SHORTCUT.startPending.action).toBe(
      'composerStartPending'
    );
    expect(COMPOSER_CONTEXT_SHORTCUT.startPending.chord).toBe('opt+s');
    expect(COMPOSER_CONTEXT_SHORTCUT.startPending.labelMac).toBe('⌥S');
  });
});

describe('shouldPreventConvArrowFallback (shipped swallow gate)', () => {
  test('swallows bare ↑/↓ only when conversation is focused and not editing', () => {
    expect(
      shouldPreventConvArrowFallback({
        liveConvFocus: true,
        editable: false,
        key: 'ArrowDown',
      })
    ).toBe(true);
    expect(
      shouldPreventConvArrowFallback({
        liveConvFocus: true,
        editable: false,
        key: 'ArrowUp',
      })
    ).toBe(true);
  });

  test('does not swallow caret movement in a text-entry target', () => {
    const ta = { tagName: 'TEXTAREA' };
    expect(isEditableKeyboardTarget(ta as any)).toBe(true);
    expect(
      shouldPreventConvArrowFallback({
        liveConvFocus: true,
        editable: isEditableKeyboardTarget(ta as any),
        key: 'ArrowDown',
      })
    ).toBe(false);
    expect(
      shouldPreventConvArrowFallback({
        liveConvFocus: true,
        editable: true,
        key: 'ArrowUp',
      })
    ).toBe(false);
  });

  test('does not swallow when conversation is unfocused or modifiers are down', () => {
    expect(
      shouldPreventConvArrowFallback({
        liveConvFocus: false,
        editable: false,
        key: 'ArrowDown',
      })
    ).toBe(false);
    expect(
      shouldPreventConvArrowFallback({
        liveConvFocus: true,
        editable: false,
        alt: true,
        key: 'ArrowDown',
      })
    ).toBe(false);
  });

  test('hotkeys hook calls the shipped gate with editable', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../src/modal/hooks/usePrModalHotkeys.ts'),
      'utf8'
    );
    expect(src).toMatch(/shouldPreventConvArrowFallback\s*\(\s*\{/);
    expect(src).toMatch(/shouldPreventConvArrowFallback\([\s\S]*editable/);
  });
});
