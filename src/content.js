/**
 * Content script entry (browser only).
 * Without a configured PAT: do not activate tree/modal — leave GitHub fully native.
 * With PAT: bootstrap stack list, then restore open modal (incl. diff layout from session).
 */

(function initPrTreeContentScript() {
  // Soft navigations can re-inject in some contexts; keep a single app instance.
  if (globalThis.__PR_TREE_APP__) {
    globalThis.__PR_TREE_APP__.scheduleSync?.(0);
    return;
  }

  const { createPrTreeApp } = globalThis.PRTreeBootstrap;
  if (typeof createPrTreeApp !== 'function') {
    console.warn('[pr+] PRTreeBootstrap missing');
    return;
  }

  const app = createPrTreeApp({
    document,
    window,
    PRTree: globalThis.PRTree,
    PRTreeDOM: globalThis.PRTreeDOM,
    PRTreeFetch: globalThis.PRTreeFetch,
    PRTreeStorage: globalThis.PRTreeStorage,
  });

  globalThis.__PR_TREE_APP__ = app;
  let featuresEnabled = false;
  let watching = false;

  async function tokenConfigured() {
    try {
      const status = await globalThis.PRTreeStorage?.getGithubTokenStatus?.();
      return Boolean(status?.configured);
    } catch {
      return false;
    }
  }

  function disableFeatures() {
    featuresEnabled = false;
    try {
      globalThis.PRModalHost?.setEnabled?.(false);
    } catch {
      /* ignore */
    }
    try {
      // Clear list decorations so the page looks like stock GitHub
      app.restoreOriginalView?.();
      app.clearCache?.();
    } catch {
      /* ignore */
    }
  }

  async function afterStackReady() {
    // Let the list paint stack indents, then restore modal + view session
    await new Promise((r) => window.setTimeout(r, 0));
    try {
      const res = await globalThis.PRModalHost?.tryRestoreOpenModal?.();
      if (res?.ok) {
        // Diff/centered restored inside modal App via session view key for that PR
        return res;
      }
    } catch (err) {
      console.warn('[pr+] modal restore failed', err);
    }
    return null;
  }

  async function enableFeatures() {
    if (featuresEnabled) {
      app.scheduleSync?.(0);
      return;
    }
    featuresEnabled = true;
    try {
      globalThis.PRModalHost?.setEnabled?.(true);
    } catch {
      /* ignore */
    }

    if (!watching) {
      watching = true;
      app.watchPullsPage();
    }

    const result = await app.bootstrap();
    if (!result?.ok) {
      app.scheduleSync(150);
    } else {
      await afterStackReady();
    }
    app.scheduleSync(400);
    app.scheduleSync(1200);
  }

  async function start() {
    const ok = await tokenConfigured();
    if (!ok) {
      disableFeatures();
      // Still listen for PAT set from popup
      listenTokenLifecycle();
      return;
    }
    listenTokenLifecycle();
    await enableFeatures();
  }

  function listenTokenLifecycle() {
    // Bridge may broadcast TOKEN_CHANGED without the secret
    try {
      chrome.runtime?.onMessage?.addListener((message) => {
        if (message?.type !== 'PR_TREE_TOKEN_CHANGED') return false;
        void (async () => {
          const ok = await tokenConfigured();
          if (ok) await enableFeatures();
          else disableFeatures();
        })();
        // Sync listener: do not return true (no async sendResponse)
        return false;
      });
    } catch {
      /* ignore */
    }

    // storage.onChanged in content may not see extension local storage on all
    // browsers — runtime message from SW is primary; also try storage watcher.
    try {
      globalThis.PRTreeStorage?.watchGithubToken?.((token) => {
        if (token) void enableFeatures();
        else disableFeatures();
      });
    } catch {
      /* ignore */
    }
  }

  // Expose for tests / host coordination
  globalThis.__PR_PLUS_CONTENT__ = {
    enableFeatures,
    disableFeatures,
    isEnabled: () => featuresEnabled,
    afterStackReady,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => void start(), { once: true });
  } else {
    void start();
  }
})();
