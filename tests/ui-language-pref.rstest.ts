/**
 * extensionPrefs.uiLanguage normalize + priority over page detect.
 */
import { describe, expect, test } from '@rstest/core';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { formatMessage } from '../src/modal/lib/i18n';
import {
  normalizeUiLanguagePref,
  resolveEffectiveLocale,
} from '../src/modal/lib/locale-resolve';

const root = path.join(__dirname, '..');
const require = createRequire(import.meta.url);

// storage.js is dual-export classic; load after content-ts build in CI.
// Prefer source normalize via require of built storage when present.
function loadStorage() {
  const p = path.join(root, 'src/storage.js');
  if (!fs.existsSync(p)) return null;
  // Clear cache so fresh build is visible in same process
  try {
    delete require.cache[require.resolve(p)];
  } catch {
    /* ignore */
  }
  return require(p);
}

describe('storage.normalizePrefs uiLanguage', () => {
  test('DEFAULT_PREFS.uiLanguage is auto', () => {
    const storage = loadStorage();
    if (!storage) {
      // Source-level contract via pure helper when storage.js not built yet
      expect(normalizeUiLanguagePref(undefined)).toBe('auto');
      return;
    }
    expect(storage.DEFAULT_PREFS.uiLanguage).toBe('auto');
    expect(storage.normalizePrefs({}).uiLanguage).toBe('auto');
  });

  test('preserves en/ko/ja/zh_CN; rejects unknown → auto', () => {
    const storage = loadStorage();
    if (!storage) {
      expect(normalizeUiLanguagePref('ko')).toBe('ko');
      expect(normalizeUiLanguagePref('fr')).toBe('auto');
      return;
    }
    expect(storage.normalizePrefs({ uiLanguage: 'ko' }).uiLanguage).toBe('ko');
    expect(storage.normalizePrefs({ uiLanguage: 'ja' }).uiLanguage).toBe('ja');
    expect(storage.normalizePrefs({ uiLanguage: 'zh_CN' }).uiLanguage).toBe(
      'zh_CN'
    );
    expect(storage.normalizePrefs({ uiLanguage: 'en' }).uiLanguage).toBe('en');
    expect(storage.normalizePrefs({ uiLanguage: 'fr' }).uiLanguage).toBe('auto');
    expect(storage.normalizePrefs({ uiLanguage: 'bogus' }).uiLanguage).toBe(
      'auto'
    );
  });
});

describe('end-to-end pref → message (shipped pure path)', () => {
  test('page en + pref ko → Korean hide_whitespace', () => {
    const locale = resolveEffectiveLocale('ko', { htmlLang: 'en' });
    expect(locale).toBe('ko');
    expect(formatMessage('hide_whitespace', locale)).toBe('공백 숨기기');
  });

  test('page ko + pref auto → Korean', () => {
    const locale = resolveEffectiveLocale('auto', { htmlLang: 'ko' });
    expect(locale).toBe('ko');
    expect(formatMessage('hide_whitespace', locale)).toBe('공백 숨기기');
  });

  test('page ko + pref en → English (override)', () => {
    const locale = resolveEffectiveLocale('en', { htmlLang: 'ko' });
    expect(locale).toBe('en');
    expect(formatMessage('hide_whitespace', locale)).toBe('Hide whitespace');
  });

  test('page en + pref auto → English', () => {
    const locale = resolveEffectiveLocale('auto', { htmlLang: 'en' });
    expect(formatMessage('hide_whitespace', locale)).toBe('Hide whitespace');
  });

  test('page en + pref ja → Japanese', () => {
    const locale = resolveEffectiveLocale('ja', { htmlLang: 'en' });
    expect(formatMessage('hide_whitespace', locale)).toBe('空白を非表示');
  });

  test('page en + pref zh_CN → Chinese', () => {
    const locale = resolveEffectiveLocale('zh_CN', { htmlLang: 'en' });
    expect(formatMessage('hide_whitespace', locale)).toBe('隐藏空白');
  });
});

describe('popup UI surface', () => {
  test('popup.html has language select with auto + four catalogs', () => {
    const html = fs.readFileSync(path.join(root, 'src/popup.html'), 'utf8');
    expect(html).toMatch(/id="pref-ui-language"/);
    expect(html).toMatch(/value="auto"/);
    expect(html).toMatch(/value="en"/);
    expect(html).toMatch(/value="ko"/);
    expect(html).toMatch(/value="ja"/);
    expect(html).toMatch(/value="zh_CN"/);
  });

  test('popup.ts saves and renders uiLanguage', () => {
    const ts = fs.readFileSync(path.join(root, 'src/popup.ts'), 'utf8');
    expect(ts).toMatch(/pref-ui-language/);
    expect(ts).toMatch(/uiLanguage/);
    expect(ts).toMatch(/normalizeUiLanguage/);
  });

  test('popup.html marks settings chrome with data-i18n', () => {
    const html = fs.readFileSync(path.join(root, 'src/popup.html'), 'utf8');
    expect(html).toMatch(/data-i18n="popup_section_config"/);
    expect(html).toMatch(/data-i18n="popup_pref_plugin_title"/);
    expect(html).toMatch(/data-i18n="popup_pref_lang_title"/);
    expect(html).toMatch(/data-i18n="popup_btn_save"/);
    const count = (html.match(/data-i18n=/g) || []).length;
    expect(count).toBeGreaterThan(40);
  });

  test('popup catalogs cover settings keys in all locales', () => {
    expect(formatMessage('popup_pref_plugin_title', 'en')).toBe('Enable pr+');
    expect(formatMessage('popup_pref_plugin_title', 'ko')).toMatch(/활성화|pr\+/);
    expect(formatMessage('popup_pref_plugin_title', 'ja')).toMatch(/有効/);
    expect(formatMessage('popup_pref_plugin_title', 'zh_CN')).toMatch(/启用/);
    expect(formatMessage('popup_section_config', 'en')).toBe('Config');
    expect(formatMessage('popup_section_config', 'ko')).toBe('설정');
    expect(formatMessage('popup_status_options_saved', 'ko')).toMatch(/저장/);
  });

  test('popup.ts applies i18n on load and after save', () => {
    const ts = fs.readFileSync(path.join(root, 'src/popup.ts'), 'utf8');
    expect(ts).toMatch(/applyPopupI18n/);
    expect(ts).toMatch(/resolvePopupLocale/);
    expect(ts).toMatch(/from '\.\/modal\/lib\/i18n'/);
  });

  test('popup restores language select after option label rewrite', () => {
    const ts = fs.readFileSync(path.join(root, 'src/popup.ts'), 'utf8');
    // Must re-assign select value after data-i18n option text updates
    expect(ts).toMatch(/prefUiLanguage\.value\s*=\s*prevLang/);
    expect(ts).toMatch(/Capture before label rewrite|clobber selectedIndex|Restore selects/i);
  });
});

describe('content-bridge keeps uiLanguage (live apply path)', () => {
  test('normalizePrefsLocal preserves uiLanguage and does not strip it', async () => {
    // Import bridge SoT (no chrome) — only pure normalize helpers.
    const bridge = await import('../src/content-bridge/bridge-prefs');
    expect(bridge.DEFAULT_PREFS.uiLanguage).toBe('auto');
    expect(bridge.normalizePrefsLocal({ uiLanguage: 'ko' }).uiLanguage).toBe(
      'ko'
    );
    expect(bridge.normalizePrefsLocal({ uiLanguage: 'ja' }).uiLanguage).toBe(
      'ja'
    );
    expect(
      bridge.normalizePrefsLocal({ uiLanguage: 'zh_CN' }).uiLanguage
    ).toBe('zh_CN');
    expect(bridge.normalizePrefsLocal({}).uiLanguage).toBe('auto');
    // Round-trip: SW-shaped full prefs must not drop language
    const full = bridge.normalizePrefsLocal({
      reverseComments: true,
      autoOpenEmbed: true,
      singleFileMode: false,
      treeView: true,
      pluginEnabled: true,
      shortcutMonitorSize: 'small',
      autoExpandOnFileNav: false,
      onboardingCompleted: false,
      uiLanguage: 'ko',
      timelineVisibility: {
        events: true,
        participants: true,
        comments: true,
        'review-threads': true,
      },
    });
    expect(full.uiLanguage).toBe('ko');
    expect(full.timelineVisibility?.comments).toBe(true);
  });

  test('host maps uiLanguage on prefs watch (source)', () => {
    const hostWatch = fs.readFileSync(
      path.join(root, 'src/host/modules/host-core-timeline-b.ts'),
      'utf8'
    );
    expect(hostWatch).toMatch(/uiLanguage:\s*normalizeUiLanguage/);
    expect(hostWatch).toMatch(/if \(current\.open\) \{\s*render\(\)/s);
  });
});
