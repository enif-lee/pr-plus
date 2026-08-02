/** SW unit: sw-broadcast.ts */
/* global PRTreeStorage, PRTreeFetch, PRModalCollapse, PRGithubEndpoints */

export const ENTERPRISE_CS_ID = 'prp-enterprise-hosts';
export const CONTENT_SCRIPT_JS = [
  'src/tree.js',
  'src/dom.js',
  'src/pr-list-focus.js',
  'src/pulls-palette.js',
  'src/github-endpoints.js',
  'src/content-bridge.js',
  'src/content-bootstrap.js',
  'src/onboarding.js',
  'src/content.js',
  'src/modal/pure/detail-idb-cache.js',
  'src/modal/pure/detail-cache.js',
  'src/modal/pure/detail-merge.js',
  'src/modal/pure/detail-store.js',
  'src/modal/pure/load-progress.js',
  'src/modal/pure/page-embed.js',
  'src/modal/pure/floating-scrollbar.js',
  'src/modal/pure/auto-refresh.js',
  'src/modal/dist/pr-modal.bundle.js',
  'src/pr-modal-host.js',
];

/**
 * Stateless API context from RPC message (webHost from content page).
 * No process-global mutation — pass returned ctx into every PRTreeFetch call.
 * @param {object|null|undefined} message
 */
export function broadcastToGithubTabs(message: any) {
  // Notify extension pages / open content scripts without sending secrets.
  // sendMessage may not return a Promise on all runtimes — never assume .catch.
  try {
    chrome.runtime.sendMessage(message, () => {
      void chrome.runtime.lastError; // no receivers is fine
    });
  } catch {
    /* ignore */
  }
  try {
    registeredEnterpriseHosts().then((hosts) => {
      const url = githubTabUrlPatterns(hosts);
      chrome.tabs.query({ url }, (tabs) => {
        for (const tab of tabs || []) {
          if (tab.id == null) continue;
          try {
            chrome.tabs.sendMessage(tab.id, message, () => {
              void chrome.runtime.lastError;
            });
          } catch {
            /* tab may not have content script */
          }
        }
      });
    });
  } catch {
    /* ignore */
  }
}

export function broadcastTokenChanged() {
  broadcastToGithubTabs({ type: MSG.TOKEN_CHANGED });
}

export function broadcastPrefsChanged(prefs: any) {
  broadcastToGithubTabs({ type: MSG.PREFS_CHANGED, prefs });
}

/**
 * Ask every open github.com tab to wipe PR detail memory + IndexedDB.
 * Content scripts own the page-origin IDB (`pr-plus-detail-cache`).
 * @returns {Promise<{ tabs: number, cleared: number, failed: number }>}
 */
export function clearDetailCacheOnGithubTabs() {
  return new Promise((resolve) => {
    try {
      registeredEnterpriseHosts().then((hosts) => {
        const url = githubTabUrlPatterns(hosts);
        chrome.tabs.query({ url }, (tabs) => {
          void chrome.runtime.lastError;
          const list = Array.isArray(tabs) ? tabs : [];
          if (!list.length) {
            resolve({ tabs: 0, cleared: 0, failed: 0 });
            return;
          }
          let pending = 0;
          let cleared = 0;
          let failed = 0;
          const done = () => {
            if (pending > 0) return;
            resolve({ tabs: list.length, cleared, failed });
          };
          for (const tab of list) {
            if (tab?.id == null) continue;
            pending += 1;
            try {
              chrome.tabs.sendMessage(
                tab.id,
                { type: MSG.CLEAR_DETAIL_CACHE },
                (res) => {
                  const err = chrome.runtime.lastError;
                  if (err || !res?.ok) failed += 1;
                  else cleared += 1;
                  pending -= 1;
                  done();
                }
              );
            } catch {
              failed += 1;
              pending -= 1;
            }
          }
          if (pending === 0) done();
        });
      });
    } catch {
      resolve({ tabs: 0, cleared: 0, failed: 0 });
    }
  });
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;
  if (changes[PRTreeStorage.TOKEN_KEY]) {
    broadcastTokenChanged();
  }
  if (changes[PRTreeStorage.HOST_ACCOUNTS_KEY]) {
    broadcastToGithubTabs({ type: MSG.HOST_ACCOUNTS_CHANGED });
    broadcastTokenChanged();
    void registeredEnterpriseHosts().then((hosts) =>
      syncEnterpriseContentScripts(hosts)
    );
  }
  if (changes[PRTreeStorage.PREFS_KEY]) {
    const prefs = PRTreeStorage.normalizePrefs(
      changes[PRTreeStorage.PREFS_KEY].newValue
    );
    rlMem.pluginEnabled = prefs?.pluginEnabled !== false;
    rlMem.loaded = true;
    broadcastPrefsChanged(prefs);
  }
  if (
    PRTreeStorage.RATE_LIMIT_KEY &&
    changes[PRTreeStorage.RATE_LIMIT_KEY]
  ) {
    try {
      const RL = rateLimitApi();
      const raw = changes[PRTreeStorage.RATE_LIMIT_KEY].newValue;
      rlMem.state =
        typeof RL?.normalizeRateLimitState === 'function'
          ? RL.normalizeRateLimitState(raw)
          : raw;
      rlMem.loaded = true;
    } catch {
      /* ignore */
    }
  }
});

/**
 * In-flight GitHub fetches keyed by content-script requestId.
 * Abort when the modal/sheet closes so network work stops immediately.
 * @type {Map<string, AbortController>}
 */
export const activeFetchControllers = new Map();
/**
 * requestIds cancelled before beginTrackedFetch ran (still in microtask queue).
 * beginTrackedFetch honors these and starts aborted.
 * @type {Set<string>}
 */
export const preCancelledFetchIds = new Set();

