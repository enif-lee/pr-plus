/**
 * Residual MergeBox + Header chrome i18n.
 * Drives shipped formatMessage + mergeBoxLocalizedCopy (not oracles).
 */
import { describe, expect, test } from '@rstest/core';
import { formatMessage } from '../src/modal/lib/i18n';
import {
  mergeBoxLocalizedCopy,
  localizeMergeButtonLabel,
  localizeDeleteHeadBranchLabel,
  localizeMergeMethodRow,
} from '../src/modal/lib/merge-box-i18n';
import { buildMergeBoxStatus } from '../src/modal/lib/merge-box-status';

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

describe('mergebox + header catalog keys (shipped)', () => {
  const keys = [
    'merge_status_merged_headline',
    'merge_status_conflicts_headline',
    'merge_status_blocked_headline',
    'merge_status_clean_helper',
    'merge_status_disabled_headline',
    'cta_resolve_conflicts',
    'merge_bypass_checkbox',
    'merge_delete_branch_named',
    'merge_method_merge_label',
    'merge_btn_bypass_merge',
    'badge_draft',
    'badge_merged',
    'badge_closed',
    'header_close',
    'header_save_title',
    'header_more_actions',
    'header_shell_modal',
    'header_enter_fullscreen',
    'header_subscribe',
    'header_refresh_all_tip',
  ];

  test('each key en≠ko and non-empty for all locales', () => {
    for (const key of keys) assertLocalized(key);
  });
});

describe('mergeBoxLocalizedCopy (shipped path)', () => {
  test('merged status: en headline differs from ko', () => {
    const ms = buildMergeBoxStatus({
      state: 'closed',
      merged: true,
      number: 1,
    });
    expect(ms.kind).toBe('merged');
    const en = mergeBoxLocalizedCopy(ms, 'en');
    const ko = mergeBoxLocalizedCopy(ms, 'ko');
    expect(en.headline).toMatch(/merged/i);
    expect(ko.headline.length).toBeGreaterThan(0);
    expect(ko.headline).not.toBe(en.headline);
    expect(ko.helper).not.toBe(en.helper);
  });

  test('conflicts status + resolve CTA key', () => {
    const ms = buildMergeBoxStatus({
      state: 'open',
      mergeable: false,
      mergeable_state: 'dirty',
      conflictFiles: ['a.ts', 'b.ts'],
      htmlUrl: 'https://github.com/o/r/pull/1',
      number: 1,
      owner: 'o',
      repo: 'r',
    });
    expect(ms.kind).toBe('conflicts');
    const en = mergeBoxLocalizedCopy(ms, 'en');
    const ko = mergeBoxLocalizedCopy(ms, 'ko');
    expect(en.headline).toMatch(/conflict/i);
    expect(ko.headline).not.toBe(en.headline);
    expect(en.conflictsFilesNote).toMatch(/2/);
    expect(ko.conflictsFilesNote).toMatch(/2/);
    expect(formatMessage('cta_resolve_conflicts', 'ko')).not.toBe(
      formatMessage('cta_resolve_conflicts', 'en')
    );
  });

  test('clean / no-conflicts helper localizes', () => {
    const ms = buildMergeBoxStatus({
      state: 'open',
      mergeable: true,
      mergeable_state: 'clean',
      draft: false,
      allowMergeCommit: true,
    });
    expect(ms.kind).toBe('clean');
    const en = mergeBoxLocalizedCopy(ms, 'en');
    const zh = mergeBoxLocalizedCopy(ms, 'zh_CN');
    expect(en.headline).toBe(formatMessage('merge_no_conflicts', 'en'));
    expect(zh.headline).toBe(formatMessage('merge_no_conflicts', 'zh_CN'));
    expect(zh.helper).not.toBe(en.helper);
  });

  test('disabled merge methods gate localizes via showMerge=false clean', () => {
    const ms = buildMergeBoxStatus({
      state: 'open',
      mergeable: true,
      mergeable_state: 'clean',
      allowMergeCommit: false,
      allowSquashMerge: false,
      allowRebaseMerge: false,
    });
    expect(ms.showMerge).toBe(false);
    const en = mergeBoxLocalizedCopy(ms, 'en');
    const ja = mergeBoxLocalizedCopy(ms, 'ja');
    expect(en.headline).toMatch(/disabled/i);
    expect(ja.headline).not.toBe(en.headline);
  });

  test('blocked admin helper differs from non-admin', () => {
    const blocked = {
      state: 'open',
      mergeable: true,
      mergeable_state: 'blocked',
      allowMergeCommit: true,
      viewerCanMergeAsAdmin: true,
    };
    const msAdmin = buildMergeBoxStatus(blocked);
    const msUser = buildMergeBoxStatus({
      ...blocked,
      viewerCanMergeAsAdmin: false,
    });
    expect(msAdmin.offerBypassRules).toBe(true);
    expect(msUser.offerBypassRules).toBe(false);
    const adminKo = mergeBoxLocalizedCopy(msAdmin, 'ko').helper;
    const userKo = mergeBoxLocalizedCopy(msUser, 'ko').helper;
    expect(adminKo).not.toBe(userKo);
  });
});

describe('merge method / button / delete labels', () => {
  test('localizeMergeMethodRow squash en≠ko', () => {
    const en = localizeMergeMethodRow('squash', { commits: [{}, {}, {}] }, 'en');
    const ko = localizeMergeMethodRow('squash', { commits: [{}, {}, {}] }, 'ko');
    expect(en.label).toMatch(/Squash/i);
    expect(ko.label).not.toBe(en.label);
    expect(en.description).toMatch(/3/);
    expect(ko.description).toMatch(/3/);
  });

  test('localizeMergeButtonLabel bypass wording', () => {
    const en = localizeMergeButtonLabel('merge', { bypass: true }, 'en');
    const ko = localizeMergeButtonLabel('merge', { bypass: true }, 'ko');
    expect(en).toMatch(/Bypass/i);
    expect(ko).not.toBe(en);
  });

  test('localizeDeleteHeadBranchLabel includes branch', () => {
    const en = localizeDeleteHeadBranchLabel({ headRef: 'feature/x' }, 'en');
    const ko = localizeDeleteHeadBranchLabel({ headRef: 'feature/x' }, 'ko');
    expect(en).toContain('feature/x');
    expect(ko).toContain('feature/x');
    expect(ko).not.toBe(en);
  });
});

describe('header badge keys matrix', () => {
  test('Draft/Merged/Closed badges differ en vs ko', () => {
    for (const key of ['badge_draft', 'badge_merged', 'badge_closed']) {
      assertLocalized(key);
    }
  });

  test('header close / save keys present all locales', () => {
    for (const loc of LOCALES) {
      expect(formatMessage('header_close', loc)).not.toBe('header_close');
      expect(formatMessage('header_save_title', loc)).not.toBe(
        'header_save_title'
      );
    }
    expect(formatMessage('header_close', 'en')).not.toBe(
      formatMessage('header_close', 'ko')
    );
  });
});
