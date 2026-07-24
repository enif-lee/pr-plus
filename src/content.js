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

  // Only run on GitHub.com / Enterprise web UI (not arbitrary HTTPS sites).
  try {
    const ep = globalThis.PRGithubEndpoints;
    if (
      ep &&
      typeof ep.isGithubWebDocument === 'function' &&
      !ep.isGithubWebDocument(document, window.location)
    ) {
      return;
    }
  } catch {
    /* continue — static github.com match still valid */
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

  function isContextDeadError(err) {
    const msg = String(err?.message || err || '');
    const bridge = globalThis.PRTreeBridge;
    if (typeof bridge?.isExtensionContextAlive === 'function') {
      if (!bridge.isExtensionContextAlive()) return true;
    }
    if (typeof bridge?.isContextInvalidated === 'function') {
      return bridge.isContextInvalidated(msg);
    }
    return /Extension context invalidated|Extension was reloaded/i.test(msg);
  }

  /** One-shot banner: extension reloaded while this tab still ran the old content script. */
  function showReloadBanner(message) {
    try {
      if (document.getElementById('prp-reload-banner')) return;
      const el = document.createElement('div');
      el.id = 'prp-reload-banner';
      el.setAttribute('role', 'status');
      el.style.cssText = [
        'position:fixed',
        'z-index:100000',
        'left:50%',
        'bottom:20px',
        'transform:translateX(-50%)',
        'max-width:min(480px,92vw)',
        'padding:12px 14px',
        'border-radius:10px',
        'border:1px solid #d0d7de',
        'background:#fff8c5',
        'color:#1f2328',
        'font:13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif',
        'box-shadow:0 8px 24px rgba(1,4,9,.18)',
        'display:flex',
        'align-items:flex-start',
        'gap:10px',
      ].join(';');
      const text = document.createElement('div');
      text.style.flex = '1 1 auto';
      text.textContent =
        message ||
        'pr+ was reloaded. Refresh this GitHub tab (⌘R / Ctrl+R) to reconnect.';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = 'Refresh';
      btn.style.cssText =
        'flex:0 0 auto;appearance:none;border:1px solid #d0d7de;background:#f6f8fa;border-radius:6px;padding:4px 10px;font:inherit;cursor:pointer;font-weight:600';
      btn.onclick = () => {
        try {
          location.reload();
        } catch {
          /* ignore */
        }
      };
      const close = document.createElement('button');
      close.type = 'button';
      close.setAttribute('aria-label', 'Dismiss');
      close.textContent = '×';
      close.style.cssText =
        'flex:0 0 auto;appearance:none;border:0;background:transparent;font-size:18px;line-height:1;cursor:pointer;color:#656d76;padding:0 2px';
      close.onclick = () => el.remove();
      el.appendChild(text);
      el.appendChild(btn);
      el.appendChild(close);
      (document.body || document.documentElement).appendChild(el);
    } catch {
      /* ignore DOM failures */
    }
  }

  async function afterStackReady() {
    // Let the list paint stack indents, then restore modal + view session
    await new Promise((r) => window.setTimeout(r, 0));
    try {
      // Skip restore when this tab's content script was orphaned by extension reload
      if (
        globalThis.PRTreeBridge &&
        typeof globalThis.PRTreeBridge.isExtensionContextAlive === 'function' &&
        !globalThis.PRTreeBridge.isExtensionContextAlive()
      ) {
        showReloadBanner(globalThis.PRTreeBridge.RELOAD_REFRESH_MSG);
        return { ok: false, reason: 'context-invalidated' };
      }
      const res = await globalThis.PRModalHost?.tryRestoreOpenModal?.();
      if (res?.ok) {
        // Diff/centered restored inside modal App via session view key for that PR
        return res;
      }
      if (res?.reason === 'context-invalidated') {
        showReloadBanner(res.message);
        return res;
      }
    } catch (err) {
      if (isContextDeadError(err)) {
        showReloadBanner(
          err?.message || globalThis.PRTreeBridge?.RELOAD_REFRESH_MSG
        );
        // Expected after chrome://extensions → Reload; not a product bug
        console.info(
          '[pr+] modal restore skipped (extension context invalidated — refresh this tab)'
        );
      } else {
        console.warn('[pr+] modal restore failed', err);
      }
    }
    return null;
  }

  /**
   * Idle after list paint: finish modal CSS + prefs so the next PR click
   * does not wait on those. Bundle JS is already content_scripts-injected.
   */
  function warmModalAfterListPaint() {
    try {
      const warm = globalThis.PRModalHost?.warmUp;
      if (typeof warm !== 'function') return;
      // Double rAF: after stack indents + browser paint
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          void warm.call(globalThis.PRModalHost);
        });
      });
    } catch {
      /* ignore */
    }
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
      // Still warm modal assets even if stack bootstrap soft-failed
      warmModalAfterListPaint();
    } else {
      await afterStackReady();
      // After list (and optional session restore) is done — preload for next click
      warmModalAfterListPaint();
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
