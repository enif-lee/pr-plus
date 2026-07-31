/**
 * Shortcut monitor size pref normalize (shipped pure helper).
 */
import { describe, expect, test } from '@rstest/core';
import {
  DEFAULT_SHORTCUT_MONITOR_SIZE,
  isShortcutMonitorEnabled,
  normalizeShortcutMonitorSize,
  describeShortcutAction,
  formatShortcutMonitorText,
  buildShortcutMonitorFire,
  SHORTCUT_MONITOR_CATALOG,
} from '../src/modal/lib/shortcut-monitor';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const storageApi = require('../src/storage');

describe('normalizeShortcutMonitorSize', () => {
  test('defaults to small', () => {
    expect(normalizeShortcutMonitorSize(undefined)).toBe('small');
    expect(normalizeShortcutMonitorSize('')).toBe('small');
    expect(normalizeShortcutMonitorSize('weird')).toBe(
      DEFAULT_SHORTCUT_MONITOR_SIZE
    );
  });

  test('accepts none / small / medium / large (+ aliases)', () => {
    expect(normalizeShortcutMonitorSize('none')).toBe('none');
    expect(normalizeShortcutMonitorSize('off')).toBe('none');
    expect(normalizeShortcutMonitorSize('small')).toBe('small');
    expect(normalizeShortcutMonitorSize('1x')).toBe('small');
    expect(normalizeShortcutMonitorSize('medium')).toBe('medium');
    expect(normalizeShortcutMonitorSize('2x')).toBe('medium');
    expect(normalizeShortcutMonitorSize('large')).toBe('large');
    expect(normalizeShortcutMonitorSize('3x')).toBe('large');
  });

  test('isShortcutMonitorEnabled', () => {
    expect(isShortcutMonitorEnabled('none')).toBe(false);
    expect(isShortcutMonitorEnabled('small')).toBe(true);
    expect(isShortcutMonitorEnabled('large')).toBe(true);
  });
});

describe('storage.normalizePrefs shortcutMonitorSize', () => {
  test('preserves size through normalizePrefs', () => {
    const p = storageApi.normalizePrefs({
      shortcutMonitorSize: 'medium',
      treeView: true,
    });
    expect(p.shortcutMonitorSize).toBe('medium');
    expect(storageApi.normalizePrefs({}).shortcutMonitorSize).toBe('small');
    expect(
      storageApi.normalizePrefs({ shortcutMonitorSize: 'none' })
        .shortcutMonitorSize
    ).toBe('none');
  });
});

describe('shortcut monitor never shows bare ?', () => {
  test('context-thread and fold actions have chords', () => {
    for (const id of [
      'contextThreadFold',
      'contextThreadGotoDiff',
      'contextThreadComment',
      'contextThreadResolve',
      'contextThreadCollapse',
      'contextThreadExpand',
      'collapseActiveFile',
      'expandActiveFile',
      'toggleSidePanel',
    ]) {
      expect(SHORTCUT_MONITOR_CATALOG[id]).toBeTruthy();
      const d = describeShortcutAction(id, true);
      expect(d.shortcut).toBeTruthy();
      expect(d.shortcut).not.toBe('?');
      expect(formatShortcutMonitorText(d.shortcut, d.title)).not.toMatch(
        /\[\?/
      );
    }
  });

  test('unknown action falls back to title-only (no ? keycap)', () => {
    const d = describeShortcutAction('totallyUnknownActionZzz', true);
    expect(d.shortcut).toBe('');
    expect(formatShortcutMonitorText(d.shortcut, d.title)).toBe(
      '[Totally Unknown Action Zzz]'
    );
    const fire = buildShortcutMonitorFire('totallyUnknownActionZzz', true);
    expect(fire.text).not.toContain('?');
  });
});
