/** @module modal/lib/merge-box-i18n */
/**
 * Locale-aware MergeBox copy from status kind (pure catalogs, no chrome.*).
 * Pure `buildMergeBoxStatus` keeps English phrases for domain tests; UI uses this.
 */
import { formatMessage, type TranslateFn } from './i18n';
import {
  detailCommitCount,
  type MergeMethod,
} from './merge-box-status';

export type MergeBoxCopy = {
  headline: string;
  helper: string;
  /** Extra line under conflicts helper when files listed (may be empty). */
  conflictsFilesNote: string;
};

function tFn(
  localeOrT: string | TranslateFn,
  key: string,
  subs?: Record<string, string | number> | null
): string {
  if (typeof localeOrT === 'function') return localeOrT(key, subs);
  return formatMessage(key, localeOrT, subs);
}

/**
 * Resolve merge-box headline/helper for the active locale from status kind.
 */
export function mergeBoxLocalizedCopy(
  ms: any,
  localeOrT: string | TranslateFn
): MergeBoxCopy {
  const t = (key: string, subs?: Record<string, string | number> | null) =>
    tFn(localeOrT, key, subs);
  const kind = String(ms?.kind || '');

  // Repo disabled every merge method (kind stays clean/unstable but CTA hidden).
  if (
    (kind === 'clean' || kind === 'unstable') &&
    !ms?.showMerge &&
    !ms?.canMerge
  ) {
    return {
      headline: t('merge_status_disabled_headline'),
      helper: t('merge_status_disabled_helper'),
      conflictsFilesNote: '',
    };
  }

  switch (kind) {
    case 'merged':
      return {
        headline: t('merge_status_merged_headline'),
        helper: t('merge_status_merged_helper'),
        conflictsFilesNote: '',
      };
    case 'closed':
      return {
        headline: t('merge_status_closed_headline'),
        helper: t('merge_status_closed_helper'),
        conflictsFilesNote: '',
      };
    case 'draft':
      return {
        headline: t('merge_status_draft_headline'),
        helper: t('merge_status_draft_helper'),
        conflictsFilesNote: '',
      };
    case 'conflicts': {
      const n = Array.isArray(ms?.conflictFiles) ? ms.conflictFiles.length : 0;
      let filesNote = '';
      if (n === 1) filesNote = t('merge_status_conflicts_files_one');
      else if (n > 1) filesNote = t('merge_status_conflicts_files_n', { count: n });
      return {
        headline: t('merge_status_conflicts_headline'),
        helper: t('merge_status_conflicts_helper'),
        conflictsFilesNote: filesNote,
      };
    }
    case 'blocked':
      return {
        headline: t('merge_status_blocked_headline'),
        helper: ms?.offerBypassRules
          ? t('merge_status_blocked_helper_admin')
          : t('merge_status_blocked_helper'),
        conflictsFilesNote: '',
      };
    case 'unknown':
      return {
        headline: t('merge_status_unknown_headline'),
        helper: t('merge_status_unknown_helper'),
        conflictsFilesNote: '',
      };
    case 'unstable':
    case 'clean':
      return {
        headline: t('merge_no_conflicts'),
        helper: t('merge_status_clean_helper'),
        conflictsFilesNote: '',
      };
    default:
      return {
        headline: String(ms?.headline || ''),
        helper: String(ms?.helper || ''),
        conflictsFilesNote: '',
      };
  }
}

/** Localized merge-method menu row. */
export function localizeMergeMethodRow(
  method: MergeMethod,
  detail: any,
  localeOrT: string | TranslateFn
): { id: MergeMethod; label: string; description: string } {
  const t = (key: string, subs?: Record<string, string | number> | null) =>
    tFn(localeOrT, key, subs);
  const count = detailCommitCount(detail);
  const hasN = Number.isFinite(Number(count)) && Number(count) > 0;
  if (method === 'squash') {
    return {
      id: 'squash',
      label: t('merge_method_squash_label'),
      description: hasN
        ? t('merge_method_squash_desc_n', { count: Number(count) })
        : t('merge_method_squash_desc'),
    };
  }
  if (method === 'rebase') {
    return {
      id: 'rebase',
      label: t('merge_method_rebase_label'),
      description: hasN
        ? t('merge_method_rebase_desc_n', { count: Number(count) })
        : t('merge_method_rebase_desc'),
    };
  }
  return {
    id: 'merge',
    label: t('merge_method_merge_label'),
    description: t('merge_method_merge_desc'),
  };
}

/** Primary merge CTA label (normal / force / bypass). */
export function localizeMergeButtonLabel(
  method: MergeMethod,
  opts: { force?: boolean; bypass?: boolean },
  localeOrT: string | TranslateFn
): string {
  const t = (key: string) => tFn(localeOrT, key);
  if (opts.bypass) {
    if (method === 'squash') return t('merge_btn_bypass_squash');
    if (method === 'rebase') return t('merge_btn_bypass_rebase');
    return t('merge_btn_bypass_merge');
  }
  if (opts.force) {
    if (method === 'squash') return t('merge_btn_force_squash');
    if (method === 'rebase') return t('merge_btn_force_rebase');
    return t('merge_btn_force_merge');
  }
  if (method === 'squash') return t('cta_squash_merge');
  if (method === 'rebase') return t('cta_rebase_merge');
  return t('cta_merge_pr');
}

/** Delete-head-branch button label with optional branch name. */
export function localizeDeleteHeadBranchLabel(
  detail: any,
  localeOrT: string | TranslateFn
): string {
  const t = (
    key: string,
    subs?: Record<string, string | number> | null
  ) => tFn(localeOrT, key, subs);
  const branch = String(detail?.headRef || detail?.head_ref || '')
    .trim()
    .replace(/^refs\/heads\//, '');
  if (branch) return t('merge_delete_branch_named', { branch });
  return t('cta_delete_branch');
}

/** Optional checks summary line under merge box. */
export function localizeMergeChecksLine(
  checksLine: string | null | undefined,
  localeOrT: string | TranslateFn
): string | null {
  if (!checksLine) return null;
  const m = String(checksLine).match(/^Checks:\s*(\S+)\s*\((\d+)\)\s*$/i);
  if (!m) return String(checksLine);
  return tFn(localeOrT, 'merge_checks_line', {
    state: m[1],
    count: m[2],
  });
}
