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
  shortcutMonitorSize: 'small',
  onboardingCompleted: false,
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
    shortcutMonitorSize: normalizeShortcutMonitorSizeLocal(
      src.shortcutMonitorSize
    ),
    onboardingCompleted:
      typeof src.onboardingCompleted === 'boolean'
        ? src.onboardingCompleted
        : DEFAULT_PREFS.onboardingCompleted,
  };
}

export var PRTreeStorage = {
  DEFAULT_PREFS,
  normalizePrefs: normalizePrefsLocal,
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
    try {
      const res = await send({ type: 'PR_TREE_PREFS_GET' });
      if (res?.ok && res.prefs) return normalizePrefsLocal(res.prefs);
    } catch {
      /* fall through */
    }
    return { ...DEFAULT_PREFS };
  },
  async setExtensionPrefs(patch) {
    const res = await send({
      type: 'PR_TREE_PREFS_SET',
      prefs: patch || ({} as any),
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
    if (!(globalThis as any).chrome?.runtime?.onMessage || typeof onChange !== 'function') {
      return () => {};
    }
    const listener = (message) => {
      if (message?.type === 'PR_TREE_PREFS_CHANGED') {
        onChange(normalizePrefsLocal(message.prefs));
      }
      return false;
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
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
      typeof PRTreeStorage?.getGithubTokenStatus === 'function' ||
        typeof PRTreeStorage?.getExtensionPrefs === 'function'
        ? '1'
        : '0'
    );
  }
} catch {
  /* non-DOM context (tests) */
}

// Page-world e2e can dispatch this to mirror SW GraphQL cost log → sessionStorage.
// Capture phase so we see the event even if page handlers stop propagation.
try {
  document.addEventListener(
    'prp-flush-gql-cost',
    () => {
      void (async () => {
        try {
          await PRTreeFetch.getGraphqlCostLog();
        } catch (e: any) {
          try {
            sessionStorage.setItem(
              'prp:gql-cost-err',
              String(e?.message || e).slice(0, 300)
            );
          } catch {
            /* ignore */
          }
        }
      })();
    },
    true
  );
  document.addEventListener(
    'prp-clear-gql-cost',
    () => {
      void PRTreeFetch.clearGraphqlCostLog?.();
    },
    true
  );
  document.documentElement?.setAttribute?.('data-prp-gql-cost-hook', '1');
  // Dev/e2e: force SW+extension reload so disk rebuilds are picked up.
  document.addEventListener(
    'prp-reload-extension',
    () => {
      try {
        chrome.runtime.reload();
      } catch {
        /* ignore */
      }
    },
    true
  );
  // Page-world e2e: probe SW timeline GraphQL page via content-script bridge.
  document.addEventListener(
    'prp-probe-timeline-page',
    (ev: any) => {
      void (async () => {
        const d = ev?.detail || {};
        const owner = String(d.owner || 'enif-lee');
        const repo = String(d.repo || 'pr-plus');
        const number = Number(d.number || 7);
        try {
          const ping = await send({ type: 'PR_TREE_PING' });
          const page = await PRTreeFetch.fetchPrTimelineItemsPage(
            owner,
            repo,
            number,
            { direction: 'newest', pageSize: 100 }
          );
          sessionStorage.setItem(
            'prp:diag:timeline-bridge-probe',
            JSON.stringify({
              ok: true,
              ping,
              hasMore: page?.hasMore ?? null,
              totalCount: page?.totalCount ?? null,
              events: Array.isArray(page?.timelineEvents)
                ? page.timelineEvents.length
                : -1,
              comments: Array.isArray(page?.comments)
                ? page.comments.length
                : -1,
              hasPrev: page?.pageInfo?.hasPreviousPage ?? null,
              error: page?.error || null,
              source: page?.source || null,
            })
          );
        } catch (e: any) {
          sessionStorage.setItem(
            'prp:diag:timeline-bridge-probe',
            JSON.stringify({
              ok: false,
              err: String(e?.message || e).slice(0, 300),
            })
          );
        }
      })();
    },
    true
  );
} catch {
  /* non-DOM */
}
