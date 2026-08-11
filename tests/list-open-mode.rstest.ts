/**
 * listOpenMode normalize + host/popup wiring (static).
 * Pref: /pulls title click → pr+ modal | navigate to PR page.
 */
import { describe, expect, test } from '@rstest/core';
import fs from 'node:fs';
import path from 'node:path';
import { normalizeListOpenModeLocal } from '../src/content-bridge/bridge-prefs';

describe('normalizeListOpenModeLocal (shipped bridge helper)', () => {
  test('defaults and aliases', () => {
    expect(normalizeListOpenModeLocal(undefined)).toBe('modal');
    expect(normalizeListOpenModeLocal(null)).toBe('modal');
    expect(normalizeListOpenModeLocal('')).toBe('modal');
    expect(normalizeListOpenModeLocal('modal')).toBe('modal');
    expect(normalizeListOpenModeLocal('sheet')).toBe('modal');
    expect(normalizeListOpenModeLocal('page')).toBe('page');
    expect(normalizeListOpenModeLocal('navigate')).toBe('page');
    expect(normalizeListOpenModeLocal('PR-PAGE')).toBe('page');
    expect(normalizeListOpenModeLocal('garbage')).toBe('modal');
  });
});

describe('listOpenMode wiring (static)', () => {
  const root = path.join(__dirname, '..');
  const read = (rel: string) =>
    fs.readFileSync(path.join(root, rel), 'utf8');

  test('storage + bridge + host click-intercept honor listOpenMode', () => {
    const storage = read('src/storage.ts');
    expect(storage).toMatch(/listOpenMode:\s*'modal'/);
    expect(storage).toMatch(/normalizeListOpenModePref/);
    expect(storage).toMatch(/listOpenMode:\s*normalizeListOpenModePref/);

    const bridge = read('src/content-bridge/bridge-prefs.ts');
    expect(bridge).toMatch(/listOpenMode:\s*'modal'/);
    expect(bridge).toMatch(/listOpenMode:\s*normalizeListOpenModeLocal/);

    const click = read('src/host/modules/click-intercept.ts');
    expect(click).toMatch(/listOpenMode/);
    expect(click).toMatch(/normalizeListOpenMode\(prefs/);
    expect(click).toMatch(/===\s*'page'/);

    const row = read('src/host/modules/list-row-lifecycle.ts');
    expect(row).toMatch(/listOpenMode/);
    expect(row).toMatch(/navigatePage/);
  });

  test('popup exposes select + i18n keys', () => {
    const html = read('src/popup.html');
    expect(html).toMatch(/id="pref-list-open-mode"/);
    expect(html).toMatch(/value="modal"/);
    expect(html).toMatch(/value="page"/);
    expect(html).toMatch(/popup_pref_list_open_title/);
    expect(html).toMatch(/popup_opt_list_open_modal/);
    expect(html).toMatch(/popup_opt_list_open_page/);

    const popup = read('src/popup.ts');
    expect(popup).toMatch(/pref-list-open-mode/);
    expect(popup).toMatch(/listOpenMode:\s*normalizeListOpenMode/);

    const i18n = read('src/modal/lib/i18n-popup.ts');
    expect(i18n).toMatch(/popup_pref_list_open_title/);
    expect(i18n).toMatch(/popup_opt_list_open_page/);
    // All four catalogs
    const titleHits = i18n.match(/popup_pref_list_open_title:/g) || [];
    expect(titleHits.length).toBeGreaterThanOrEqual(4);
  });
});
