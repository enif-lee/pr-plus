/** @module modal/lib/locale-resolve */
/**
 * Pure locale resolution from GitHub page signals (no browser extension APIs).
 *
 * Prefer GitHub UI language over the browser UI language.
 * Fallback chain ends at English (en).
 */

export const DEFAULT_LOCALE = 'en' as const;

/** Chrome `_locales` directory ids we ship. */
export const SUPPORTED_LOCALES = ['en', 'ko', 'ja', 'zh_CN'] as const;

export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

/**
 * Plugin language preference.
 * - `auto` (default): follow GitHub page signals
 * - concrete AppLocale: user override (wins over page detect)
 */
export type UiLanguagePref = 'auto' | AppLocale;

export const UI_LANGUAGE_PREF_AUTO = 'auto' as const;

export type GithubLocaleSignals = {
  /** `html[lang]` / documentElement.lang */
  htmlLang?: string | null;
  /** `data-locale` on documentElement or first matching node */
  dataLocale?: string | null;
  /** Embedded JSON `"locale":"…"` when parsed from page */
  jsonLocale?: string | null;
  /** Browser UI language — secondary only */
  navigatorLanguage?: string | null;
};

const SUPPORTED_SET = new Set<string>(SUPPORTED_LOCALES);

/**
 * Map a BCP-47-ish or GitHub locale tag to a shipped catalog id.
 * Returns null when empty/unsupported (caller falls back).
 */
export function mapToAppLocale(
  raw: string | null | undefined
): AppLocale | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;

  // Normalize separators; lower-case language, preserve structure for region.
  const normalized = s.replace(/_/g, '-');
  const lower = normalized.toLowerCase();
  const primary = lower.split('-')[0] || lower;

  if (primary === 'en') return 'en';
  if (primary === 'ko') return 'ko';
  if (primary === 'ja') return 'ja';
  // GitHub docs use lang="zh"; Chrome catalog is zh_CN.
  // Single Chinese catalog: map Hans/Hant/TW/HK → zh_CN for now.
  if (primary === 'zh') return 'zh_CN';

  // Exact Chrome-style directory names
  if (SUPPORTED_SET.has(s)) return s as AppLocale;
  if (SUPPORTED_SET.has(lower)) return lower as AppLocale;
  if (lower === 'zh-cn' || lower === 'zh-hans' || lower === 'zh-sg') {
    return 'zh_CN';
  }
  if (lower === 'zh-tw' || lower === 'zh-hant' || lower === 'zh-hk') {
    return 'zh_CN';
  }

  return null;
}

/**
 * Normalize plugin language pref from storage / popup.
 * Unknown values → `auto` (safe default: detect from GitHub page).
 */
export function normalizeUiLanguagePref(
  raw: string | null | undefined
): UiLanguagePref {
  if (raw == null) return UI_LANGUAGE_PREF_AUTO;
  const v = String(raw).trim();
  if (!v) return UI_LANGUAGE_PREF_AUTO;
  const lower = v.toLowerCase().replace(/_/g, '-');
  if (
    lower === 'auto' ||
    lower === 'detect' ||
    lower === 'default' ||
    lower === 'system' ||
    lower === 'github'
  ) {
    return UI_LANGUAGE_PREF_AUTO;
  }
  // Accept chrome-style zh_CN as well as zh-CN
  if (v === 'zh_CN' || lower === 'zh-cn' || lower === 'zh_cn') return 'zh_CN';
  const mapped = mapToAppLocale(v);
  return mapped || UI_LANGUAGE_PREF_AUTO;
}

/**
 * Resolve app locale from ordered GitHub (then browser) signals.
 * Always returns a supported catalog id; default `en`.
 * Does **not** apply plugin language override — use resolveEffectiveLocale.
 */
export function resolveLocale(signals: GithubLocaleSignals = {}): AppLocale {
  const ordered = [
    signals.htmlLang,
    signals.dataLocale,
    signals.jsonLocale,
    signals.navigatorLanguage,
  ];
  for (const candidate of ordered) {
    const mapped = mapToAppLocale(candidate);
    if (mapped) return mapped;
  }
  return DEFAULT_LOCALE;
}

/**
 * Effective UI locale: **plugin preferred language wins**, else page detect.
 *
 * @param preferred - `auto` or a shipped catalog id (from extensionPrefs.uiLanguage)
 * @param signals - GitHub page signals (when preferred is auto)
 */
export function resolveEffectiveLocale(
  preferred: string | null | undefined = UI_LANGUAGE_PREF_AUTO,
  signals: GithubLocaleSignals = {}
): AppLocale {
  const pref = normalizeUiLanguagePref(preferred);
  if (pref !== UI_LANGUAGE_PREF_AUTO) return pref;
  return resolveLocale(signals);
}

/**
 * Parse first `"locale":"<tag>"` from HTML/script text (cheap scan).
 */
export function parseJsonLocaleFromHtml(
  html: string | null | undefined
): string | null {
  if (!html) return null;
  const m = String(html).match(/"locale"\s*:\s*"([a-zA-Z0-9_-]+)"/);
  return m?.[1] ?? null;
}

/**
 * Extract GitHub locale signals from a Document (page context).
 * Safe with null/undefined doc (returns empty signals → resolve → en).
 */
export function extractGithubLocaleSignals(
  doc: Document | null | undefined
): GithubLocaleSignals {
  if (!doc?.documentElement) return {};

  const html = doc.documentElement;
  const htmlLang =
    (typeof html.getAttribute === 'function'
      ? html.getAttribute('lang')
      : null) ||
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (html as any).lang ||
    '';

  let dataLocale =
    (typeof html.getAttribute === 'function'
      ? html.getAttribute('data-locale')
      : null) || '';
  if (!dataLocale && typeof doc.querySelector === 'function') {
    try {
      const el = doc.querySelector('[data-locale]');
      dataLocale =
        (el &&
          typeof el.getAttribute === 'function' &&
          el.getAttribute('data-locale')) ||
        '';
    } catch {
      /* ignore */
    }
  }

  let jsonLocale: string | null = null;
  try {
    // Prefer small next/bootstrap blobs when present; else skip full scan.
    const scripts =
      typeof doc.querySelectorAll === 'function'
        ? doc.querySelectorAll(
            'script[type="application/json"], script[data-target], script#__NEXT_DATA__'
          )
        : [];
    for (let i = 0; i < scripts.length && i < 12; i++) {
      const text = scripts[i]?.textContent || '';
      if (text.length > 2_000_000) continue;
      const found = parseJsonLocaleFromHtml(text);
      if (found) {
        jsonLocale = found;
        break;
      }
    }
  } catch {
    /* ignore */
  }

  return {
    htmlLang: htmlLang || null,
    dataLocale: dataLocale || null,
    jsonLocale,
  };
}

/**
 * Resolve app locale from a GitHub Document (page detect only).
 * Prefer page signals; pass navigatorLanguage separately if desired.
 */
export function resolveGithubLocale(
  doc: Document | null | undefined,
  opts: { navigatorLanguage?: string | null } = {}
): AppLocale {
  const signals = extractGithubLocaleSignals(doc);
  if (opts.navigatorLanguage != null) {
    signals.navigatorLanguage = opts.navigatorLanguage;
  }
  return resolveLocale(signals);
}

/**
 * Effective locale from plugin pref + GitHub Document.
 * Custom pref (en/ko/ja/zh_CN) overrides page `html[lang]`.
 */
export function resolveEffectiveGithubLocale(
  doc: Document | null | undefined,
  preferred: string | null | undefined = UI_LANGUAGE_PREF_AUTO,
  opts: { navigatorLanguage?: string | null } = {}
): AppLocale {
  const signals = extractGithubLocaleSignals(doc);
  if (opts.navigatorLanguage != null) {
    signals.navigatorLanguage = opts.navigatorLanguage;
  }
  return resolveEffectiveLocale(preferred, signals);
}

export function isSupportedLocale(value: string | null | undefined): value is AppLocale {
  return value != null && SUPPORTED_SET.has(String(value));
}
