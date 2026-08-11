/**
 * Residual chrome i18n: stats pill, load-stage, shell/aside/gnb keys.
 * Drives shipped formatMessage + formatLoadStageLabel (not oracles).
 */
import { describe, expect, test } from '@rstest/core';
import { formatMessage } from '../src/modal/lib/i18n';
import { formatLoadStageLabel } from '../src/modal/lib/load-stage-i18n';
import { buildDetailGnbLeftItems } from '../src/modal/lib/detail-gnb';
import {
  describeShortcutAction,
  buildShortcutMonitorFire,
} from '../src/modal/lib/shortcut-monitor';

const LOCALES = ['en', 'ko', 'ja', 'zh_CN'] as const;

function assertLocalized(key: string) {
  const en = formatMessage(key, 'en');
  const ko = formatMessage(key, 'ko');
  const ja = formatMessage(key, 'ja');
  const zh = formatMessage(key, 'zh_CN');
  expect(en.length).toBeGreaterThan(0);
  expect(ko.length).toBeGreaterThan(0);
  expect(ja.length).toBeGreaterThan(0);
  expect(zh.length).toBeGreaterThan(0);
  expect(en).not.toBe(key);
  expect([ko, ja, zh].some((v) => v !== en)).toBe(true);
}

describe('stats pill + progress keys', () => {
  test('files changed / N files / loading fallbacks en≠ko', () => {
    for (const key of [
      'stats_files_changed',
      'stats_n_files',
      'stats_loading',
      'stats_loading_short',
      'stats_loading_panels',
      'progress_loading_all_files',
      'progress_files_ready',
      'progress_loading_files_n',
    ]) {
      assertLocalized(key);
    }
    expect(formatMessage('stats_n_files', 'en', { count: 3 })).toMatch(/3/);
    expect(formatMessage('stats_n_files', 'ko', { count: 3 })).toMatch(/3/);
    expect(formatMessage('stats_n_files', 'ko', { count: 3 })).not.toBe(
      formatMessage('stats_n_files', 'en', { count: 3 })
    );
  });
});

describe('formatLoadStageLabel (shipped)', () => {
  test('core and refresh differ en vs ko', () => {
    const enCore = formatLoadStageLabel('core', null, 'en');
    const koCore = formatLoadStageLabel('core', null, 'ko');
    const enRefresh = formatLoadStageLabel('refresh', null, 'en');
    const koRefresh = formatLoadStageLabel('refresh', null, 'ko');
    expect(enCore).toMatch(/Loading|pull/i);
    expect(koCore).not.toBe(enCore);
    expect(koRefresh).not.toBe(enRefresh);
    expect(koCore.length).toBeGreaterThan(0);
  });

  test('files-all with counts and panels', () => {
    const en = formatLoadStageLabel(
      'files-all',
      { loaded: 2, total: 10 },
      'en'
    );
    const ko = formatLoadStageLabel(
      'files-all',
      { loaded: 2, total: 10 },
      'ko'
    );
    expect(en).toMatch(/2/);
    expect(en).toMatch(/10/);
    expect(ko).not.toBe(en);
    const panelEn = formatLoadStageLabel('panels', { panel: 'reviews' }, 'en');
    const panelKo = formatLoadStageLabel('panels', { panel: 'reviews' }, 'ko');
    expect(panelEn).toMatch(/review/i);
    expect(panelKo).not.toBe(panelEn);
  });

  test('all locales non-empty for core', () => {
    for (const loc of LOCALES) {
      const s = formatLoadStageLabel('core', null, loc);
      expect(s.length).toBeGreaterThan(0);
      expect(s).not.toBe('load_stage_core');
    }
  });
});

describe('palette shell + aside + gnb residual keys', () => {
  test('shell and aside keys localized', () => {
    for (const key of [
      'palette_shell_placeholder',
      'palette_shell_no_commands',
      'aside_no_files',
      'aside_search_files',
      'diff_view_settings',
      'display_options',
      'header_no_pr_link',
      'content_refresh',
      'gnb_code',
      'gnb_pulls',
      'onboarding_done',
      'pulls_palette_empty',
    ]) {
      assertLocalized(key);
    }
  });

  test('buildDetailGnbLeftItems localizes labels', () => {
    const en = buildDetailGnbLeftItems('o', 'r', 'en');
    const ko = buildDetailGnbLeftItems('o', 'r', 'ko');
    expect(en.find((i) => i.id === 'code')?.label).toBe('Code');
    expect(ko.find((i) => i.id === 'code')?.label).not.toBe('Code');
    expect(ko.find((i) => i.id === 'pulls')?.label).not.toBe(
      en.find((i) => i.id === 'pulls')?.label
    );
  });
});

describe('shortcut-monitor + palette help residual', () => {
  test('describeShortcutAction localizes resolve / filter titles', () => {
    const en = describeShortcutAction('contextThreadResolve', true, 'en');
    const ko = describeShortcutAction('contextThreadResolve', true, 'ko');
    expect(en.title).toMatch(/Resolve/i);
    expect(ko.title).not.toBe(en.title);
    expect(ko.title.length).toBeGreaterThan(0);

    const enF = describeShortcutAction(
      'toggleReviewFilterUnresolved',
      true,
      'en'
    );
    const koF = describeShortcutAction(
      'toggleReviewFilterUnresolved',
      true,
      'ko'
    );
    expect(enF.title).toMatch(/unresolved/i);
    expect(koF.title).not.toBe(enF.title);

    const fire = buildShortcutMonitorFire(
      'composerResolve',
      true,
      Date.now(),
      'ko'
    );
    expect(fire.title).not.toMatch(/^Resolve conversation$/);
    expect(fire.text).toContain(fire.title);
  });

  test('palette_help_empty and onboarding enter keys en≠ko', () => {
    assertLocalized('palette_help_empty');
    assertLocalized('onboarding_continue_enter');
    assertLocalized('onboarding_save_continue_enter');
    assertLocalized('onboarding_done_enter');
    assertLocalized('onboarding_skip_enter');
    assertLocalized('monitor_context_thread_resolve');
  });
});
