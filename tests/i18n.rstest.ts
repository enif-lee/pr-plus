/**
 * Locale resolve + pure message lookup (shipped modules, no chrome.*).
 */
import { describe, expect, test } from '@rstest/core';
import fs from 'node:fs';
import path from 'node:path';
import {
  CATALOGS,
  MESSAGE_KEYS,
  createTranslator,
  formatMessage,
  getCatalog,
} from '../src/modal/lib/i18n';
import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  extractGithubLocaleSignals,
  mapToAppLocale,
  normalizeUiLanguagePref,
  parseJsonLocaleFromHtml,
  resolveEffectiveGithubLocale,
  resolveEffectiveLocale,
  resolveGithubLocale,
  resolveLocale,
} from '../src/modal/lib/locale-resolve';

const root = path.join(__dirname, '..');

describe('mapToAppLocale', () => {
  test('maps en / ko / ja / zh variants to catalog ids', () => {
    expect(mapToAppLocale('en')).toBe('en');
    expect(mapToAppLocale('en-US')).toBe('en');
    expect(mapToAppLocale('ko')).toBe('ko');
    expect(mapToAppLocale('ko-KR')).toBe('ko');
    expect(mapToAppLocale('ja')).toBe('ja');
    expect(mapToAppLocale('ja-JP')).toBe('ja');
    expect(mapToAppLocale('zh')).toBe('zh_CN');
    expect(mapToAppLocale('zh-CN')).toBe('zh_CN');
    expect(mapToAppLocale('zh_CN')).toBe('zh_CN');
    expect(mapToAppLocale('zh-Hans')).toBe('zh_CN');
    expect(mapToAppLocale('zh-TW')).toBe('zh_CN');
  });

  test('empty / unsupported → null', () => {
    expect(mapToAppLocale('')).toBe(null);
    expect(mapToAppLocale(null)).toBe(null);
    expect(mapToAppLocale(undefined)).toBe(null);
    expect(mapToAppLocale('fr')).toBe(null);
    expect(mapToAppLocale('de-DE')).toBe(null);
  });
});

describe('normalizeUiLanguagePref / resolveEffectiveLocale', () => {
  test('default and aliases → auto', () => {
    expect(normalizeUiLanguagePref(undefined)).toBe('auto');
    expect(normalizeUiLanguagePref(null)).toBe('auto');
    expect(normalizeUiLanguagePref('')).toBe('auto');
    expect(normalizeUiLanguagePref('auto')).toBe('auto');
    expect(normalizeUiLanguagePref('detect')).toBe('auto');
    expect(normalizeUiLanguagePref('github')).toBe('auto');
  });

  test('concrete prefs normalize to catalog ids', () => {
    expect(normalizeUiLanguagePref('en')).toBe('en');
    expect(normalizeUiLanguagePref('ko')).toBe('ko');
    expect(normalizeUiLanguagePref('ja-JP')).toBe('ja');
    expect(normalizeUiLanguagePref('zh_CN')).toBe('zh_CN');
    expect(normalizeUiLanguagePref('zh-CN')).toBe('zh_CN');
  });

  test('custom preferred language wins over page signals', () => {
    const page = {
      htmlLang: 'en',
      dataLocale: 'en',
      navigatorLanguage: 'en-US',
    };
    expect(resolveEffectiveLocale('ko', page)).toBe('ko');
    expect(resolveEffectiveLocale('ja', page)).toBe('ja');
    expect(resolveEffectiveLocale('zh_CN', page)).toBe('zh_CN');
    expect(resolveEffectiveLocale('en', { htmlLang: 'ko' })).toBe('en');
  });

  test('auto preferred follows page detect', () => {
    expect(
      resolveEffectiveLocale('auto', { htmlLang: 'ja', navigatorLanguage: 'en' })
    ).toBe('ja');
    expect(resolveEffectiveLocale('auto', { htmlLang: 'fr' })).toBe('en');
    expect(resolveEffectiveLocale(undefined, { htmlLang: 'ko' })).toBe('ko');
  });

  test('resolveEffectiveGithubLocale: override beats document lang', () => {
    const doc = {
      documentElement: {
        getAttribute(name: string) {
          if (name === 'lang') return 'en';
          return null;
        },
        lang: 'en',
      },
      querySelector() {
        return null;
      },
      querySelectorAll() {
        return [];
      },
    } as unknown as Document;
    expect(resolveEffectiveGithubLocale(doc, 'auto')).toBe('en');
    expect(resolveEffectiveGithubLocale(doc, 'ko')).toBe('ko');
    expect(resolveEffectiveGithubLocale(doc, 'ja')).toBe('ja');
  });
});

describe('resolveLocale', () => {
  test('prefers htmlLang over later signals', () => {
    expect(
      resolveLocale({
        htmlLang: 'ko',
        dataLocale: 'ja',
        jsonLocale: 'en',
        navigatorLanguage: 'zh',
      })
    ).toBe('ko');
  });

  test('falls through to dataLocale then jsonLocale then navigator', () => {
    expect(resolveLocale({ dataLocale: 'ja' })).toBe('ja');
    expect(resolveLocale({ jsonLocale: 'zh' })).toBe('zh_CN');
    expect(resolveLocale({ navigatorLanguage: 'ko-KR' })).toBe('ko');
  });

  test('unsupported or empty → English default', () => {
    expect(resolveLocale({})).toBe(DEFAULT_LOCALE);
    expect(resolveLocale({ htmlLang: 'fr' })).toBe('en');
    expect(resolveLocale({ htmlLang: '', dataLocale: null })).toBe('en');
  });

  test('htmlLang wins even when navigator disagrees (GitHub over browser)', () => {
    expect(
      resolveLocale({
        htmlLang: 'en',
        navigatorLanguage: 'ko',
      })
    ).toBe('en');
    expect(
      resolveLocale({
        htmlLang: 'ja',
        navigatorLanguage: 'en-US',
      })
    ).toBe('ja');
  });
});

describe('parseJsonLocaleFromHtml / resolveGithubLocale', () => {
  test('parses embedded JSON locale', () => {
    expect(parseJsonLocaleFromHtml('{"locale":"ko","x":1}')).toBe('ko');
    expect(parseJsonLocaleFromHtml('no locale here')).toBe(null);
  });

  test('resolveGithubLocale reads documentElement lang', () => {
    const doc = {
      documentElement: {
        getAttribute(name: string) {
          if (name === 'lang') return 'ja';
          return null;
        },
        lang: 'ja',
      },
      querySelector() {
        return null;
      },
      querySelectorAll() {
        return [];
      },
    } as unknown as Document;
    expect(resolveGithubLocale(doc)).toBe('ja');
  });

  test('extractGithubLocaleSignals prefers html lang then data-locale', () => {
    const doc = {
      documentElement: {
        getAttribute(name: string) {
          if (name === 'lang') return 'en';
          if (name === 'data-locale') return 'en';
          return null;
        },
        lang: 'en',
      },
      querySelector() {
        return null;
      },
      querySelectorAll() {
        return [];
      },
    } as unknown as Document;
    const signals = extractGithubLocaleSignals(doc);
    expect(signals.htmlLang).toBe('en');
    expect(resolveLocale(signals)).toBe('en');
  });

  test('null document → en', () => {
    expect(resolveGithubLocale(null)).toBe('en');
    expect(resolveGithubLocale(undefined)).toBe('en');
  });
});

describe('formatMessage / catalogs', () => {
  test('all four catalogs resolve a known key to non-empty strings', () => {
    for (const loc of SUPPORTED_LOCALES) {
      const msg = formatMessage('hide_whitespace', loc);
      expect(msg.length).toBeGreaterThan(0);
      expect(getCatalog(loc).hide_whitespace).toBe(msg);
    }
  });

  test('en baseline differs from ko/ja/zh for shared key', () => {
    const en = formatMessage('hide_whitespace', 'en');
    const ko = formatMessage('hide_whitespace', 'ko');
    const ja = formatMessage('hide_whitespace', 'ja');
    const zh = formatMessage('hide_whitespace', 'zh_CN');
    expect(en).toBe('Hide whitespace');
    expect(ko).not.toBe(en);
    expect(ja).not.toBe(en);
    expect(zh).not.toBe(en);
    expect(ko).toMatch(/공백|숨기/);
    expect(ja).toMatch(/空白|非表示/);
    expect(zh).toMatch(/隐藏|空白/);
  });

  test('missing key falls back to English then key', () => {
    expect(formatMessage('__no_such_key__', 'ko')).toBe('__no_such_key__');
    // only in en catalog path: invent key only on en would still return key
    expect(CATALOGS.en.hide_whitespace).toBeTruthy();
  });

  test('unsupported locale string → English messages', () => {
    expect(formatMessage('hide_whitespace', 'fr')).toBe('Hide whitespace');
    expect(formatMessage('hide_whitespace', '')).toBe('Hide whitespace');
    expect(formatMessage('hide_whitespace', null)).toBe('Hide whitespace');
  });

  test('createTranslator binds locale', () => {
    const t = createTranslator('ko');
    expect(t('hide_outdated_comments')).toBe(
      formatMessage('hide_outdated_comments', 'ko')
    );
  });

  test('Chrome _locales catalogs exist with overlapping chrome keys', () => {
    // Install-time chrome strings only (popup settings use pure catalogs in popup.js)
    const chromeKeys = [
      'extName',
      'extDescription',
      'actionTitle',
      'hide_whitespace',
      'hide_whitespace_title',
      'hide_outdated_comments',
      'hide_outdated_comments_title',
      'tab_conversation',
      'tab_files',
      'resolve_conversation',
      'unresolved',
      'resolved',
      'pending',
      'display_options',
      'reviewed_by',
    ];
    for (const loc of SUPPORTED_LOCALES) {
      const p = path.join(root, '_locales', loc, 'messages.json');
      expect(fs.existsSync(p)).toBe(true);
      const chrome = JSON.parse(fs.readFileSync(p, 'utf8')) as Record<
        string,
        { message: string }
      >;
      for (const key of chromeKeys) {
        expect(chrome[key]?.message).toBeTruthy();
        // Chrome catalog message should match pure catalog for shipped keys
        expect(chrome[key].message).toBe(CATALOGS[loc][key]);
      }
    }
  });

  test('manifest default_locale is en and uses __MSG_ placeholders', () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(root, 'manifest.json'), 'utf8')
    );
    expect(manifest.default_locale).toBe('en');
    expect(manifest.name).toBe('__MSG_extName__');
    expect(manifest.description).toBe('__MSG_extDescription__');
    expect(manifest.action?.default_title).toBe('__MSG_actionTitle__');
  });
});

describe('pure layer stays chrome-free', () => {
  test('locale-resolve and i18n sources do not call chrome.i18n', () => {
    const files = [
      'src/modal/lib/locale-resolve.ts',
      'src/modal/lib/i18n.ts',
    ];
    for (const rel of files) {
      // Strip block + line comments before scanning for chrome APIs
      const body = fs
        .readFileSync(path.join(root, rel), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      expect(body).not.toMatch(/chrome\.i18n/);
      expect(body).not.toMatch(/\bchrome\./);
    }
  });
});
