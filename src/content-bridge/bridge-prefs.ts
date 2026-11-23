/** prefs */
import { MSG } from '../sw-messages';
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
  /** /pulls title click: modal (pr+ overlay) | page (/pull/N) */
  listOpenMode: 'modal',
  singleFileMode: false,
  treeView: true,
  pluginEnabled: true,
  shortcutMonitorSize: 'small',
  conversationWidth: 'normal',
  /** merge | squash | rebase — last method picked in the merge box. */
  lastMergeMethod: null as 'merge' | 'squash' | 'rebase' | null,
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

/** /pulls open target: modal | page */
export function normalizeListOpenModeLocal(raw: unknown): 'modal' | 'page' {
  const v = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (
    v === 'page' ||
    v === 'pr-page' ||
    v === 'pr_page' ||
    v === 'navigate' ||
    v === 'native' ||
    v === 'github'
  ) {
    return 'page';
  }
  if (
    v === 'modal' ||
    v === 'overlay' ||
    v === 'sheet' ||
    v === 'pr+' ||
    v === 'prp' ||
    v === 'pr-plus'
  ) {
    return 'modal';
  }
  return 'modal';
}

export function normalizeShortcutMonitorSizeLocal(raw: any) {
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
export function normalizeUiLanguageLocal(raw: any) {
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

/** Last used merge box method; anything else (including absent) → null. */
export function normalizeMergeMethodLocal(raw: unknown): 'merge' | 'squash' | 'rebase' | null {
  const v = String(raw ?? '')
    .trim()
    .toLowerCase();
  return v === 'merge' || v === 'squash' || v === 'rebase' ? v : null;
}

/**
 * Content-side prefs normalize. Must keep keys the host/modal need for live
 * updates (uiLanguage, timelineVisibility, …). Stripping fields here made
 * language changes fail to apply until full reload.
 */
export function normalizePrefsLocal(raw: any) {
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
    listOpenMode: normalizeListOpenModeLocal(src.listOpenMode),
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
    conversationWidth: ['narrow', 'normal', 'wide', 'full'].includes(src.conversationWidth)
      ? src.conversationWidth : 'normal',
    lastMergeMethod: normalizeMergeMethodLocal(src.lastMergeMethod),
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
    const res = await send({ type: MSG.TOKEN_STATUS });
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
  watchGithubToken(onChange: any) {
    if (!(globalThis as any).chrome?.runtime?.onMessage) return () => {};
    const listener = (message: any) => {
      if (message?.type === MSG.TOKEN_CHANGED) {
        onChange(null);
      }
      // Never claim async response — broadcasts have no reply
      return false;
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  },
  async getExtensionPrefs() {
    try {
      const res = await send({ type: MSG.PREFS_GET });
      if (res?.ok && res.prefs) return normalizePrefsLocal(res.prefs);
    } catch {
      /* fall through */
    }
    return { ...DEFAULT_PREFS };
  },
  async setExtensionPrefs(patch: any) {
    const patchObj = patch && typeof patch === 'object' ? patch : {};
    const res = await send({
      type: MSG.PREFS_SET,
      prefs: patchObj as any,
    });
    if (!res?.ok) {
      throw new Error(res?.error || 'Failed to save prefs');
    }
    return normalizePrefsLocal(res.prefs);
  },
  async getOnboardingCompleted() {
    try {
      const res = await send({ type: MSG.ONBOARDING_GET });
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
  async setOnboardingCompleted(completed: any) {
    const res = await send({
      type: MSG.ONBOARDING_SET,
      completed: Boolean(completed),
    });
    if (!res?.ok) {
      throw new Error(res?.error || 'Failed to save onboarding state');
    }
    return Boolean(res.completed);
  },
  watchExtensionPrefs(onChange: any) {
    if (typeof onChange !== 'function') return () => {};
    const chromeApi = (globalThis as any).chrome;
    if (!chromeApi?.runtime?.onMessage) return () => {};
    const listener = (message: any) => {
      if (message?.type === MSG.PREFS_CHANGED && message.prefs) {
        onChange(normalizePrefsLocal(message.prefs));
      }
      return false;
    };
    chromeApi.runtime.onMessage.addListener(listener);
    return () => chromeApi.runtime.onMessage.removeListener(listener);
  },
};

(globalThis as any).PRTreeFetch = PRTreeFetch;
(globalThis as any).PRTreeStorage = PRTreeStorage;
(globalThis as any).PRTreeBridge = {
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

function stampListOpenModeAttr(prefs: any) {
  try {
    const root = document.documentElement;
    if (!root) return;
    const mode = normalizeListOpenModeLocal(prefs?.listOpenMode);
    root.setAttribute('data-prp-list-open-mode', mode);
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
        stampListOpenModeAttr(next);
        document.documentElement.setAttribute('data-prp-prefs-ok', '1');
        document.documentElement.setAttribute(
          'data-prp-prefs-echo',
          JSON.stringify({
            uiLanguage: next?.uiLanguage,
            listOpenMode: next?.listOpenMode,
            reverseComments: next?.reverseComments,
            keys: next ? Object.keys(next) : [],
            resRaw: null,
          })
        );
        // Also surface raw SW response for diagnosis
        try {
          const raw = await send({ type: MSG.PREFS_GET });
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
  PRTreeStorage.watchExtensionPrefs?.((prefs: any) => {
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
