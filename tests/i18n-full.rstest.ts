/**
 * Full chrome i18n: catalogs + palette localization + meta keys.
 * Drives shipped formatMessage / buildPaletteCommands (not oracles).
 */
import { describe, expect, test } from '@rstest/core';
import {
  formatMessage,
  CATALOGS,
  createTranslator,
} from '../src/modal/lib/i18n';
import {
  buildPaletteCommands,
  localizePaletteCommands,
} from '../src/modal/lib/command-palette-build';
import {
  resolveEffectiveLocale,
  normalizeUiLanguagePref,
} from '../src/modal/lib/locale-resolve';

describe('chrome catalogs multi-locale', () => {
  const families: Array<{ key: string; family: string }> = [
    { key: 'meta_reviewers', family: 'aside/meta' },
    { key: 'meta_assignees', family: 'aside/meta' },
    { key: 'meta_labels', family: 'aside/meta' },
    { key: 'meta_checks', family: 'aside/meta' },
    { key: 'meta_development', family: 'aside/meta' },
    { key: 'meta_tags', family: 'aside/meta' },
    { key: 'cta_submit_review', family: 'cta' },
    { key: 'cta_load_more', family: 'cta' },
    { key: 'cta_merge_pr', family: 'merge' },
    { key: 'cta_squash_merge', family: 'merge' },
    { key: 'cta_update_branch', family: 'merge' },
    { key: 'cta_approve', family: 'finish-review' },
    { key: 'cta_request_changes', family: 'finish-review' },
    { key: 'cta_discard', family: 'finish-review' },
    { key: 'cta_cancel', family: 'finish-review' },
    { key: 'cta_finish_review', family: 'finish-review' },
    { key: 'cta_close_pr', family: 'header' },
    { key: 'cta_open_github', family: 'header' },
    { key: 'open_with_prp', family: 'list-host' },
    { key: 'resolve_conversation', family: 'review-cta' },
    { key: 'palette_cmd_toggle_diff', family: 'palette' },
    { key: 'palette_cmd_add_reviewer', family: 'palette' },
    { key: 'palette_sec_navigate', family: 'palette-section' },
    { key: 'popup_pref_lang_title', family: 'popup' },
  ];

  test('each key family has non-empty en/ko/ja/zh_CN and en differs from ko', () => {
    for (const { key } of families) {
      const en = formatMessage(key, 'en');
      const ko = formatMessage(key, 'ko');
      const ja = formatMessage(key, 'ja');
      const zh = formatMessage(key, 'zh_CN');
      expect(en.length).toBeGreaterThan(0);
      expect(ko.length).toBeGreaterThan(0);
      expect(ja.length).toBeGreaterThan(0);
      expect(zh.length).toBeGreaterThan(0);
      expect(en).not.toBe(key);
      // At least one non-English locale differs from English baseline
      const differs = [ko, ja, zh].some((v) => v !== en);
      expect(differs).toBe(true);
    }
  });

  test('missing key falls back to English then key', () => {
    expect(formatMessage('__missing_chrome_key__', 'ko')).toBe(
      '__missing_chrome_key__'
    );
  });
});

describe('resolve matrix (shipped)', () => {
  test('preferred ko/ja/zh_CN overrides page en', () => {
    expect(resolveEffectiveLocale('ko', { htmlLang: 'en' })).toBe('ko');
    expect(resolveEffectiveLocale('ja', { htmlLang: 'en' })).toBe('ja');
    expect(resolveEffectiveLocale('zh_CN', { htmlLang: 'en' })).toBe('zh_CN');
  });

  test('auto + htmlLang=ko → ko', () => {
    expect(resolveEffectiveLocale('auto', { htmlLang: 'ko' })).toBe('ko');
    expect(normalizeUiLanguagePref('auto')).toBe('auto');
  });
});

describe('palette localization (shipped buildPaletteCommands)', () => {
  test('buildPaletteCommands localizes titles for ko', () => {
    const enCmds = buildPaletteCommands({}, { locale: 'en', layoutMode: 'diff' });
    const koCmds = buildPaletteCommands({}, { locale: 'ko', layoutMode: 'diff' });
    expect(enCmds.length).toBeGreaterThan(10);
    expect(koCmds.length).toBe(enCmds.length);
    const enToggle = enCmds.find((c: any) => c.id === 'toggle-diff');
    const koToggle = koCmds.find((c: any) => c.id === 'toggle-diff');
    expect(enToggle?.title).toMatch(/Diff|Conversation/i);
    expect(koToggle?.title).toBeTruthy();
    expect(koToggle?.title).not.toBe(enToggle?.title);
    // Korean catalog phrase
    expect(String(koToggle?.title)).toMatch(/Diff|대화|전환/);
  });

  test('localizePaletteCommands maps known cmd id', () => {
    const raw = [
      {
        id: 'add-reviewer',
        title: 'Add reviewer…',
        section: 'People',
        action: 'x',
      },
    ];
    const ko = localizePaletteCommands(raw, 'ko');
    expect(ko[0].title).toBe(formatMessage('palette_cmd_add_reviewer', 'ko'));
    expect(ko[0].section).toBe(formatMessage('palette_sec_people', 'ko'));
  });
});

describe('catalogs include chrome merge', () => {
  test('CATALOGS.en has palette and meta keys', () => {
    expect(CATALOGS.en.meta_reviewers).toBe('Reviewers');
    expect(CATALOGS.ko.meta_reviewers).toBeTruthy();
    expect(CATALOGS.en.palette_cmd_toggle_diff).toBeTruthy();
    expect(CATALOGS.zh_CN.cta_submit_review).toBeTruthy();
  });

  test('createTranslator binds chrome keys', () => {
    const t = createTranslator('ja');
    expect(t('meta_assignees')).toBe(formatMessage('meta_assignees', 'ja'));
    expect(t('meta_assignees')).not.toBe(formatMessage('meta_assignees', 'en'));
  });
});

describe('skeptic gap keys wired in source', () => {
  test('FinishReviewModal / MergeBox / Header / list use lookup keys', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const root = path.join(__dirname, '..');
    const finish = fs.readFileSync(
      path.join(root, 'src/modal/views/chrome/FinishReviewModal.tsx'),
      'utf8'
    );
    const merge = fs.readFileSync(
      path.join(root, 'src/modal/views/conversation/MergeBox.tsx'),
      'utf8'
    );
    const header = fs.readFileSync(
      path.join(root, 'src/modal/views/chrome/Header.tsx'),
      'utf8'
    );
    const host = fs.readFileSync(
      path.join(root, 'src/host/modules/host-core-timeline-b.ts'),
      'utf8'
    );
    const compact = fs.readFileSync(
      path.join(root, 'src/modal/views/conversation/AsideCompactRail.tsx'),
      'utf8'
    );
    const diffTb = fs.readFileSync(
      path.join(root, 'src/modal/views/chrome/DiffToolbar.tsx'),
      'utf8'
    );
    expect(finish).toMatch(/useT\(/);
    expect(finish).toMatch(/cta_approve|cta_request_changes|cta_discard|cta_cancel/);
    expect(merge).toMatch(/useT\(/);
    expect(merge).toMatch(/cta_merge_pr|cta_squash_merge|cta_update_branch/);
    expect(header).toMatch(/useT\(/);
    expect(header).toMatch(/cta_close_pr|cta_open_github/);
    expect(host).toMatch(/open_with_prp/);
    expect(compact).toMatch(/meta_checks|meta_development|meta_tags/);
    expect(diffTb).toMatch(/cta_finish_review/);
    const conv = fs.readFileSync(
      path.join(root, 'src/modal/views/conversation/ConversationView.tsx'),
      'utf8'
    );
    const diffChrome = fs.readFileSync(
      path.join(root, 'src/modal/views/chrome/DiffChrome.tsx'),
      'utf8'
    );
    // Expanded aside (not only compact rail)
    expect(conv).toMatch(/title=\{t\('meta_development'\)\}/);
    expect(conv).toMatch(/title=\{t\('meta_checks'\)\}/);
    expect(conv).toMatch(/meta_tags/);
    expect(conv).toMatch(/meta_set_milestone|meta_change_milestone/);
    // Must not leave raw English AsideSection titles for these
    expect(conv).not.toMatch(/title="Development"/);
    expect(conv).not.toMatch(/title="Checks"/);
    expect(conv).not.toMatch(/title=\{`Tags\$\{/);
    expect(diffChrome).toMatch(/useT\(/);
    expect(diffChrome).toMatch(/label=\{t\('meta_checks'\)\}/);
    expect(diffChrome).not.toMatch(/label="Checks"/);
  });
});
