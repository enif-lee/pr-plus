/** prefs */
import {
  send,
  isExtensionContextAlive,
  isContextInvalidated,
  isTransientChannelError,
  RELOAD_REFRESH_MSG,
} from './bridge-channel';
import { PRTreeFetch } from './bridge-fetch-proxy';
// send used by e2e probe hook below

export const DEFAULT_PREFS = {
  reverseComments: true,
  autoOpenEmbed: true,
  singleFileMode: false,
  treeView: true,
  pluginEnabled: true,
  shortcutMonitorSize: 'small',
  autoExpandOnFileNav: false,
  onboardingCompleted: false,
  /** auto | en | ko | ja | zh_CN — custom overrides GitHub page detect */
  uiLanguage: 'auto',
  timelineVisibility: {
    events: true,
    participants: true,
    comments: true,
    'review-threads': true,
  },
};

export function normalizeShortcutMonitorSizeLocal(raw) {
  const v = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (v === 'none' || v === 'off' || v === 'hidden' || v === '0') return 'none';
  if (v === 'medium' || v === 'md' || v === '2' || v === '2x') return 'medium';
  if (v === 'large' || v === 'lg' || v === '3' || v === '3x') return 'large';
  if (v === 'small' || v === 'sm' || v === '1' || v === '1x') return 'small';
  if (raw === false) return 'none';
  return DEFAULT_PREFS.shortcutMonitorSize;
}

/** Plugin UI language: auto | en | ko | ja | zh_CN */
export function normalizeUiLanguageLocal(raw) {
  try {
    const pure = (globalThis as any).PRModalLocaleResolve;
    if (typeof pure?.normalizeUiLanguagePref === 'function') {
      return pure.normalizeUiLanguagePref(raw);
    }
  } catch {
    /* fall through */
  }
  if (raw == null) return DEFAULT_PREFS.uiLanguage;
  const v = String(raw).trim();
  if (!v) return DEFAULT_PREFS.uiLanguage;
  const lower = v.toLowerCase().replace(/_/g, '-');
  if (
    lower === 'auto' ||
    lower === 'detect' ||
    lower === 'default' ||
    lower === 'system' ||
    lower === 'github'
  ) {
    return 'auto';
  }
  if (v === 'zh_CN' || lower === 'zh-cn' || lower === 'zh_cn' || lower === 'zh') {
    return 'zh_CN';
  }
  if (lower === 'en' || lower.startsWith('en-')) return 'en';
  if (lower === 'ko' || lower.startsWith('ko-')) return 'ko';
  if (lower === 'ja' || lower.startsWith('ja-')) return 'ja';
  return DEFAULT_PREFS.uiLanguage;
}

function normalizeTimelineVisibilityLocal(raw: any) {
  try {
    const pure = (globalThis as any).PRModalConversationTimeline;
    if (typeof pure?.normalizeTimelineVisibility === 'function') {
      return pure.normalizeTimelineVisibility(raw);
    }
  } catch {
    /* fall through */
  }
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const base: Record<string, boolean> = {
    events: true,
    participants: true,
    comments: true,
    'review-threads': true,
  };
  for (const id of Object.keys(base)) {
    if (typeof src[id] === 'boolean') base[id] = src[id] as boolean;
  }
  return base;
}

/**
 * Content-side prefs normalize. Must keep keys the host/modal need for live
 * updates (uiLanguage, timelineVisibility, …). Stripping fields here made
 * language changes fail to apply until full reload.
 */
export function normalizePrefsLocal(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    reverseComments:
      typeof src.reverseComments === 'boolean'
        ? src.reverseComments
        : DEFAULT_PREFS.reverseComments,
    autoOpenEmbed:
      typeof src.autoOpenEmbed === 'boolean'
        ? src.autoOpenEmbed
        : DEFAULT_PREFS.autoOpenEmbed,
    singleFileMode:
      typeof src.singleFileMode === 'boolean'
        ? src.singleFileMode
        : DEFAULT_PREFS.singleFileMode,
    treeView:
      typeof src.treeView === 'boolean' ? src.treeView : DEFAULT_PREFS.treeView,
    pluginEnabled:
      typeof src.pluginEnabled === 'boolean'
        ? src.pluginEnabled
        : DEFAULT_PREFS.pluginEnabled,
    shortcutMonitorSize: normalizeShortcutMonitorSizeLocal(
      src.shortcutMonitorSize
    ),
    autoExpandOnFileNav:
      typeof src.autoExpandOnFileNav === 'boolean'
        ? src.autoExpandOnFileNav
        : DEFAULT_PREFS.autoExpandOnFileNav,
    onboardingCompleted:
      typeof src.onboardingCompleted === 'boolean'
        ? src.onboardingCompleted
        : DEFAULT_PREFS.onboardingCompleted,
    uiLanguage: normalizeUiLanguageLocal(src.uiLanguage),
    timelineVisibility: normalizeTimelineVisibilityLocal(
      src.timelineVisibility ?? DEFAULT_PREFS.timelineVisibility
    ),
  };
}

export var PRTreeStorage = {
  DEFAULT_PREFS,
  normalizePrefs: normalizePrefsLocal,
  normalizeUiLanguage: normalizeUiLanguageLocal,
  /** Intentionally unavailable in content scripts. */
  getGithubToken() {
    return Promise.reject(
      new Error('PAT is not accessible from content scripts')
    );
  },
  async getGithubTokenStatus() {
    const res = await send({ type: 'PR_TREE_TOKEN_STATUS' });
    if (!res?.ok) {
      return { configured: false, mask: '' };
    }
    return { configured: Boolean(res.configured), mask: res.mask || '' };
  },
  setGithubToken() {
    return Promise.reject(
      new Error('Set PAT from the extension popup only')
    );
  },
  /**
   * Signal-only watch: callback receives null (never the secret).
   * Re-fetch via background when this fires.
   */
  watchGithubToken(onChange) {
    if (!(globalThis as any).chrome?.runtime?.onMessage) return () => {};
    const listener = (message) => {
      if (message?.type === 'PR_TREE_TOKEN_CHANGED') {
        onChange(null);
      }
      // Never claim async response — broadcasts have no reply
      return false;
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  },
  async getExtensionPrefs() {
    // Prefer chrome.storage.local directly so new pref keys (uiLanguage, …)
    // work even if the service worker bundle is still stale (unpacked SW cache).
    try {
      const area = (globalThis as any).chrome?.storage?.local;
      if (area?.get) {
        const raw = await new Promise((resolve) => {
          area.get(['extensionPrefs'], (result: any) => {
            resolve(result?.extensionPrefs);
          });
        });
        return normalizePrefsLocal(raw);
      }
    } catch {
      /* fall through to SW */
    }
    try {
      const res = await send({ type: 'PR_TREE_PREFS_GET' });
      if (res?.ok && res.prefs) return normalizePrefsLocal(res.prefs);
    } catch {
      /* fall through */
    }
    return { ...DEFAULT_PREFS };
  },
  async setExtensionPrefs(patch) {
    const patchObj = patch && typeof patch === 'object' ? patch : {};
    // Direct storage write with content-side normalize (authoritative for new keys).
    try {
      const area = (globalThis as any).chrome?.storage?.local;
      if (area?.get && area?.set) {
        const prevRaw = await new Promise((resolve) => {
          area.get(['extensionPrefs'], (result: any) => {
            resolve(result?.extensionPrefs);
          });
        });
        const next = normalizePrefsLocal({
          ...normalizePrefsLocal(prevRaw),
          ...patchObj,
        });
        await new Promise((resolve, reject) => {
          area.set({ extensionPrefs: next }, () => {
            const err = (globalThis as any).chrome?.runtime?.lastError;
            if (err) reject(err);
            else resolve(undefined);
          });
        });
        // Do NOT re-send PREFS_SET through SW after a direct storage write:
        // a stale SW normalizePrefs can drop new keys (uiLanguage) and overwrite
        // chrome.storage, undoing this write. storage.onChanged is enough for
        // host/content watchers; SW rate-limit mem is updated on next PREFS_GET.
        return next;
      }
    } catch {
      /* fall through to SW-only path */
    }
    const res = await send({
      type: 'PR_TREE_PREFS_SET',
      prefs: patchObj as any,
    });
    if (!res?.ok) {
      throw new Error(res?.error || 'Failed to save prefs');
    }
    return normalizePrefsLocal(res.prefs);
  },
  async getOnboardingCompleted() {
    try {
      const res = await send({ type: 'PR_TREE_ONBOARDING_GET' });
      if (res?.ok) return Boolean(res.completed);
    } catch {
      /* fall through */
    }
    // Legacy: prefs field
    try {
      const prefs = await this.getExtensionPrefs();
      return Boolean(prefs?.onboardingCompleted);
    } catch {
      return false;
    }
  },
  async setOnboardingCompleted(completed) {
    const res = await send({
      type: 'PR_TREE_ONBOARDING_SET',
      completed: Boolean(completed),
    });
    if (!res?.ok) {
      throw new Error(res?.error || 'Failed to save onboarding state');
    }
    return Boolean(res.completed);
  },
  watchExtensionPrefs(onChange) {
    if (typeof onChange !== 'function') return () => {};
    const chromeApi = (globalThis as any).chrome;
    const unsubs: Array<() => void> = [];

    // Primary: storage.onChanged — sees full object even when SW broadcast is stale
    if (chromeApi?.storage?.onChanged) {
      const storageListener = (changes: any, areaName: string) => {
        if (areaName !== 'local' || !changes?.extensionPrefs) return;
        onChange(normalizePrefsLocal(changes.extensionPrefs.newValue));
      };
      chromeApi.storage.onChanged.addListener(storageListener);
      unsubs.push(() =>
        chromeApi.storage.onChanged.removeListener(storageListener)
      );
    }

    // Secondary: SW broadcast (may omit new keys if SW is stale — re-read storage)
    if (chromeApi?.runtime?.onMessage) {
      const msgListener = (message: any) => {
        if (message?.type === 'PR_TREE_PREFS_CHANGED') {
          // Prefer a fresh local read so uiLanguage is never dropped by old SW
          void PRTreeStorage.getExtensionPrefs().then((prefs) =>
            onChange(prefs)
          );
        }
        return false;
      };
      chromeApi.runtime.onMessage.addListener(msgListener);
      unsubs.push(() =>
        chromeApi.runtime.onMessage.removeListener(msgListener)
      );
    }

    return () => {
      for (const u of unsubs) {
        try {
          u();
        } catch {
          /* ignore */
        }
      }
    };
  },
};

globalThis.PRTreeFetch = PRTreeFetch;
globalThis.PRTreeStorage = PRTreeStorage;
globalThis.PRTreeBridge = {
  isExtensionContextAlive,
  isContextInvalidated,
  isTransientChannelError,
  RELOAD_REFRESH_MSG,
};

function stampUiLanguageAttr(prefs: any) {
  try {
    const root = document.documentElement;
    if (!root) return;
    const lang =
      prefs && typeof prefs.uiLanguage === 'string' ? prefs.uiLanguage : 'auto';
    root.setAttribute('data-prp-ui-language', lang);
  } catch {
    /* ignore */
  }
}

/**
 * Page → content-script bridge for e2e / agent-browser:
 *   document.documentElement.setAttribute('data-prp-prefs-request', JSON.stringify({ uiLanguage: 'ko' }))
 *   document.dispatchEvent(new CustomEvent('prp-set-prefs', { detail: { uiLanguage: 'ko' }, bubbles: true }))
 * Prefer event.detail; fall back to data-prp-prefs-request (detail can be empty across worlds).
 * Response attributes: data-prp-ui-language, data-prp-prefs-ok
 */
try {
  document.addEventListener('prp-set-prefs', (ev: any) => {
    let patch: Record<string, unknown> =
      ev?.detail && typeof ev.detail === 'object' && !Array.isArray(ev.detail)
        ? { ...ev.detail }
        : {};
    if (!Object.keys(patch).length) {
      try {
        const raw = document.documentElement.getAttribute('data-prp-prefs-request');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            patch = parsed;
          }
        }
      } catch {
        /* ignore */
      }
    }
    try {
      document.documentElement.setAttribute(
        'data-prp-prefs-patch',
        JSON.stringify(patch)
      );
    } catch {
      /* ignore */
    }
    void (async () => {
      try {
        const next = await PRTreeStorage.setExtensionPrefs(patch);
        stampUiLanguageAttr(next);
        document.documentElement.setAttribute('data-prp-prefs-ok', '1');
        document.documentElement.setAttribute(
          'data-prp-prefs-echo',
          JSON.stringify({
            uiLanguage: next?.uiLanguage,
            reverseComments: next?.reverseComments,
            keys: next ? Object.keys(next) : [],
            resRaw: null,
          })
        );
        // Also surface raw SW response for diagnosis
        try {
          const raw = await send({ type: 'PR_TREE_PREFS_GET' });
          document.documentElement.setAttribute(
            'data-prp-prefs-get',
            JSON.stringify({
              ok: raw?.ok,
              uiLanguage: raw?.prefs?.uiLanguage,
              reverseComments: raw?.prefs?.reverseComments,
            })
          );
        } catch (e) {
          document.documentElement.setAttribute(
            'data-prp-prefs-get',
            String((e as any)?.message || e)
          );
        }
      } catch (err) {
        document.documentElement.setAttribute('data-prp-prefs-ok', '0');
        document.documentElement.setAttribute(
          'data-prp-prefs-err',
          String((err as any)?.message || err || 'fail')
        );
      }
    })();
  });
  PRTreeStorage.watchExtensionPrefs?.((prefs) => {
    stampUiLanguageAttr(prefs);
  });
  void PRTreeStorage.getExtensionPrefs?.().then((prefs) => {
    stampUiLanguageAttr(prefs);
  });
} catch {
  /* ignore */
}

/**
 * Stamp the page document so main-world automation (agent-browser eval)
 * can detect that the content-script bridge loaded. Content scripts run in
 * an isolated world, so `globalThis.PRTreeFetch` is not visible to page JS.
 */
try {
  const root = document.documentElement;
  if (root) {
    root.setAttribute('data-prp-bridge', '1');
    root.setAttribute(
      'data-prp-bridge-fetch',
      typeof PRTreeFetch?.fetchPrDetail === 'function' ? '1' : '0'
    );
    root.setAttribute(
      'data-prp-bridge-storage',
      typeof PRTreeStorage?.getExtensionPrefs === 'function' ? '1' : '0'
    );
  }
} catch {
  /* ignore */
}
