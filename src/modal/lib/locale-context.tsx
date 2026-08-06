/** @module modal/lib/locale-context */
/**
 * React locale context for modal UI (pure catalogs, no chrome.*).
 */
import React, { createContext, useContext, useMemo } from 'react';
import {
  createTranslator,
  formatMessage,
  type TranslateFn,
} from './i18n';
import {
  DEFAULT_LOCALE,
  type AppLocale,
  type UiLanguagePref,
  normalizeUiLanguagePref,
  resolveEffectiveGithubLocale,
} from './locale-resolve';

export type LocaleContextValue = {
  /** Resolved catalog id used for strings */
  locale: AppLocale;
  /** Raw plugin pref (auto | en | ko | ja | zh_CN) */
  uiLanguagePref: UiLanguagePref;
  t: TranslateFn;
};

const LocaleContext = createContext<LocaleContextValue>({
  locale: DEFAULT_LOCALE,
  uiLanguagePref: 'auto',
  t: createTranslator(DEFAULT_LOCALE),
});

export function useLocale(): LocaleContextValue {
  return useContext(LocaleContext);
}

export function useT(): TranslateFn {
  return useContext(LocaleContext).t;
}

type ProviderProps = {
  /** extensionPrefs.uiLanguage */
  uiLanguage?: string | null;
  children: React.ReactNode;
};

/**
 * Resolve locale from plugin pref + host GitHub document; provide t().
 * Re-renders when uiLanguage pref changes (host prefs watch → new props).
 */
export function LocaleProvider({ uiLanguage, children }: ProviderProps) {
  const uiLanguagePref = normalizeUiLanguagePref(uiLanguage);
  const value = useMemo((): LocaleContextValue => {
    const locale = resolveEffectiveGithubLocale(
      typeof document !== 'undefined' ? document : null,
      uiLanguagePref
    );
    // Stamp for e2e / agent-browser (page world can read attributes)
    try {
      if (typeof document !== 'undefined') {
        document.documentElement.setAttribute('data-prp-app-locale', locale);
        document.documentElement.setAttribute(
          'data-prp-ui-language',
          uiLanguagePref
        );
      }
    } catch {
      /* ignore */
    }
    return {
      locale,
      uiLanguagePref,
      t: (key, substitutions) => formatMessage(key, locale, substitutions),
    };
  }, [uiLanguagePref]);

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}
