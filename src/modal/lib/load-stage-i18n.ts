/** @module modal/lib/load-stage-i18n */
/**
 * Locale-aware load-stage / progress labels (pure catalogs, no chrome.*).
 * Used by host loadStageLabel and unit tests.
 */
import { formatMessage } from './i18n';

export type LoadStageExtra = {
  count?: number;
  loaded?: number;
  total?: number;
  message?: string;
  panel?: string;
} | null;

/**
 * Resolve load-stage kind → localized short badge label.
 * @param kind stage key (core, refresh, files-all, …)
 * @param extra optional counts / panel / raw message
 * @param locale app locale id
 */
export function formatLoadStageLabel(
  kind: string,
  extra: LoadStageExtra = null,
  locale: string | null | undefined = 'en'
): string {
  const loc = locale || 'en';
  const t = (
    key: string,
    subs?: Record<string, string | number> | null
  ) => formatMessage(key, loc, subs);
  const n = Number(extra?.count);
  const loaded = Number(extra?.loaded);
  const total = Number(extra?.total);
  switch (String(kind || '')) {
    case 'core':
      return t('load_stage_core');
    case 'core-full':
      return t('load_stage_core_full');
    case 'revalidate':
      return t('load_stage_revalidate');
    case 'refresh':
      return t('load_stage_refresh');
    case 'refresh-meta':
      return t('load_stage_refresh_meta');
    case 'refresh-visible':
      return t('load_stage_refresh_visible');
    case 'refresh-all':
      return t('load_stage_refresh_all');
    case 'threads-load':
      return t('load_stage_threads_load');
    case 'threads-update':
    case 'threads-shell':
      return t('load_stage_threads_update');
    case 'threads-comments':
      return t('load_stage_threads_comments');
    case 'threads-reactions':
      return t('load_stage_threads_reactions');
    case 'threads-earlier':
      return t('load_stage_threads_earlier');
    case 'threads-unresolved':
      return t('load_stage_threads_unresolved');
    case 'threads-visible': {
      const c = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
      const num = String(Math.min(c, 99)).padStart(2, '0');
      return t('load_stage_threads_visible', { count: num });
    }
    case 'threads-more':
      return t('load_stage_threads_more');
    case 'threads-all': {
      if (
        Number.isFinite(loaded) &&
        loaded >= 0 &&
        Number.isFinite(total) &&
        total > 0
      ) {
        return t('load_stage_threads_all_n', {
          loaded: Math.min(Math.floor(loaded), 999),
          total: Math.min(Math.floor(total), 999),
        });
      }
      if (Number.isFinite(loaded) && loaded >= 0) {
        return t('load_stage_threads_all_count', {
          loaded: Math.min(Math.floor(loaded), 999),
        });
      }
      return t('load_stage_threads_all');
    }
    case 'refresh-failed':
      return t('load_stage_refresh_failed');
    case 'threads-failed':
      return t('load_stage_threads_failed');
    case 'threads-more-failed':
      return t('load_stage_threads_more_failed');
    case 'threads-all-failed':
      return t('load_stage_threads_all_failed');
    case 'files-all':
    case 'files-load': {
      if (
        Number.isFinite(loaded) &&
        loaded >= 0 &&
        Number.isFinite(total) &&
        total > 0
      ) {
        return t('load_stage_files_n', {
          loaded: Math.min(Math.floor(loaded), 999),
          total: Math.min(Math.floor(total), 999),
        });
      }
      return t('load_stage_files_all');
    }
    case 'panels': {
      const panel = String(extra?.panel || '');
      if (panel === 'files') return t('load_stage_panel_files');
      if (panel === 'comments') return t('load_stage_panel_comments');
      if (panel === 'reviews') return t('load_stage_panel_reviews');
      if (panel === 'commits') return t('load_stage_panel_commits');
      if (panel === 'checks') return t('load_stage_panel_checks');
      if (panel === 'development') return t('load_stage_panel_development');
      return t('load_stage_panels');
    }
    default: {
      const msg = String(extra?.message || kind || '').trim();
      if (msg) {
        return msg.length > 26 ? `${msg.slice(0, 24)}…` : msg;
      }
      return t('load_stage_loading');
    }
  }
}

/** Resolve app locale from document stamps (host / content). */
export function resolveAppLocaleFromDocument(
  doc: Document | null | undefined = typeof document !== 'undefined'
    ? document
    : null
): string {
  try {
    const el = doc?.documentElement;
    if (!el) return 'en';
    let locale =
      el.getAttribute('data-prp-app-locale') ||
      el.getAttribute('data-prp-ui-language') ||
      'en';
    if (locale === 'auto') {
      locale = el.getAttribute('lang') || (el as any).lang || 'en';
    }
    return locale || 'en';
  } catch {
    return 'en';
  }
}
