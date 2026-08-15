/**
 * File-header viewed/read checkbox ShortcutHint under file focus.
 * Drives real `fileHeaderViewedOptHintLabel` + TOGGLE_VIEWED_SHORTCUT SoT
 * and structural wiring in FileHeaderRow / shipped bundle.
 */
import { describe, expect, test } from '@rstest/core';
import {
  fileHeaderViewedOptHintLabel,
} from '../src/modal/views/diff/VirtualDiffRows';
import { TOGGLE_VIEWED_SHORTCUT } from '../src/modal/lib/shortcut-policy';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('fileHeaderViewedOptHintLabel (file focus gate)', () => {
  test('TOGGLE_VIEWED_SHORTCUT SoT is opt+shift+r family', () => {
    expect(TOGGLE_VIEWED_SHORTCUT.chord).toBe('opt+shift+r');
    expect(TOGGLE_VIEWED_SHORTCUT.action).toBe('toggleViewedActiveFile');
    expect(TOGGLE_VIEWED_SHORTCUT.labelMac).toBe('⌥⇧R');
    expect(TOGGLE_VIEWED_SHORTCUT.labelWin).toBe('Alt+Shift+R');
  });

  test('focused: label matches TOGGLE_VIEWED_SHORTCUT (Mac + Win)', () => {
    const mac = fileHeaderViewedOptHintLabel(true, true);
    const win = fileHeaderViewedOptHintLabel(true, false);
    expect(mac).toBe(TOGGLE_VIEWED_SHORTCUT.labelMac);
    expect(win).toBe(TOGGLE_VIEWED_SHORTCUT.labelWin);
    // Must not invent alternate chords
    expect(mac).not.toBe('⌥R');
    expect(win).not.toBe('Alt+R');
  });

  test('unfocused: no label (no focused ShortcutHint claim)', () => {
    expect(fileHeaderViewedOptHintLabel(false, true)).toBeNull();
    expect(fileHeaderViewedOptHintLabel(false, false)).toBeNull();
  });
});

describe('FileHeaderRow viewed ShortcutHint wiring', () => {
  test('FileHeaderRow mounts ShortcutHint from fileHeaderViewedOptHintLabel', () => {
    const src = fs.readFileSync(
      path.join(root, 'src/modal/views/diff/VirtualDiffRows.tsx'),
      'utf8'
    );
    // Shared FileHeaderRow (sticky + list)
    expect(src).toMatch(/export function FileHeaderRow/);
    expect(src).toMatch(/fileHeaderViewedOptHintLabel\(focused/);
    expect(src).toMatch(/TOGGLE_VIEWED_SHORTCUT/);
    // Focus-gated ShortcutHint on viewed host
    expect(src).toMatch(/data-prp-file-viewed-hint/);
    expect(src).toMatch(
      /viewedKbd\s*\?\s*\(\s*<ShortcutHint\s+label=\{viewedKbd\}/
    );
    expect(src).toMatch(/prp-file-header__viewed/);
    expect(src).toMatch(/prp-opt-hint-host/);
  });

  test('shipped modal bundle includes viewed focus hint marker + chord label', () => {
    const bundlePath = path.join(root, 'src/modal/dist/pr-modal.bundle.js');
    expect(fs.existsSync(bundlePath)).toBe(true);
    const bundle = fs.readFileSync(bundlePath, 'utf8');
    expect(bundle).toMatch(/data-prp-file-viewed-hint|prp-file-viewed-hint/);
    // Product labels or helper name from shipped code path
    const hasLabel =
      bundle.includes(TOGGLE_VIEWED_SHORTCUT.labelMac) ||
      bundle.includes(TOGGLE_VIEWED_SHORTCUT.labelWin) ||
      bundle.includes('fileHeaderViewedOptHintLabel') ||
      bundle.includes(TOGGLE_VIEWED_SHORTCUT.chord);
    expect(hasLabel).toBe(true);
  });
});
