/**
 * ⌘F / Ctrl+F → openSearch even while an input is focused (incl. our finder
 * after navigate). Must claim the chord so browser find does not open.
 */
import { describe, expect, test } from '@rstest/core';
import { resolveModalShortcutAction } from '../src/modal/lib/shortcut-policy';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('openSearch (mod+f) claims over editable targets', () => {
  test('⌘F → openSearch when not typing', () => {
    expect(
      resolveModalShortcutAction({
        mod: true,
        alt: false,
        shift: false,
        key: 'f',
        code: 'KeyF',
        editableTarget: false,
        layoutMode: 'diff',
      })
    ).toBe('openSearch');
  });

  test('⌘F → openSearch while editable (search input / composer)', () => {
    expect(
      resolveModalShortcutAction({
        mod: true,
        alt: false,
        shift: false,
        key: 'f',
        code: 'KeyF',
        editableTarget: true,
        searchOpen: true,
        layoutMode: 'diff',
      })
    ).toBe('openSearch');
  });

  test('Ctrl+F same as mod on Windows path', () => {
    expect(
      resolveModalShortcutAction({
        mod: true,
        alt: false,
        shift: false,
        key: 'f',
        code: 'KeyF',
        editableTarget: true,
        layoutMode: 'centered',
      })
    ).toBe('openSearch');
  });

  test('⌥F is not openSearch (file fold / thread fold peer)', () => {
    expect(
      resolveModalShortcutAction({
        mod: false,
        alt: true,
        shift: false,
        key: 'f',
        code: 'KeyF',
        editableTarget: false,
        layoutMode: 'diff',
        hasLineSelection: true,
      })
    ).not.toBe('openSearch');
  });
});

describe('openSearch focus+select wiring (source)', () => {
  test('App openSearch focuses input and selects', () => {
    const src = fs.readFileSync(
      path.join(root, 'src/modal/app/PrModalShell.tsx'),
      'utf8'
    );
    expect(src).toMatch(/case 'openSearch'/);
    expect(src).toMatch(/searchInputRef\.current/);
    expect(src).toMatch(/el\.select|typeof el\.select/);
    expect(src).toMatch(/setSelectionRange/);
  });

  test('SearchBar handles Cmd+F on input (block browser find)', () => {
    const src = fs.readFileSync(
      path.join(root, 'src/modal/views/chrome/SearchBar.tsx'),
      'utf8'
    );
    expect(src).toMatch(/isFindChord|KeyF/);
    expect(src).toMatch(/preventDefault/);
    expect(src).toMatch(/\.select\(/);
  });

  test('policy evaluates mod+f before editableTarget early-return', () => {
    const src = fs.readFileSync(
      path.join(root, 'src/modal/lib/shortcut-policy-actions.ts'),
      'utf8'
    );
    const openIdx = src.indexOf("key === 'f') return 'openSearch'");
    const editIdx = src.indexOf('if (opts.editableTarget) return null');
    // The mod+f openSearch must appear before the editable early-return that
    // follows it (not the earlier ones in context-thread blocks).
    const lastEdit = src.lastIndexOf('if (opts.editableTarget) return null');
    expect(openIdx).toBeGreaterThan(0);
    expect(lastEdit).toBeGreaterThan(openIdx);
  });
});
