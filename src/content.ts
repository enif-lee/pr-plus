/**
 * Content script entry (browser only).
 * Without a configured PAT: do not activate tree/modal — leave GitHub fully native.
 * With PAT: bootstrap stack list, then restore open modal (incl. diff layout from session).
 */

(function initPrTreeContentScript() {
  // Soft navigations can re-inject in some contexts; keep a single app instance.
  if ((globalThis as any).__PR_TREE_APP__) {
    (globalThis as any).__PR_TREE_APP__.scheduleSync?.(0);
    return;
  }

  // Only run on GitHub.com / Enterprise web UI (not arbitrary HTTPS sites).
  try {
    const ep = (globalThis as any).PRGithubEndpoints;
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

  const { createPrTreeApp } = (globalThis as any).PRTreeBootstrap;
  if (typeof createPrTreeApp !== 'function') {
    console.warn('[pr+] PRTreeBootstrap missing');
    return;
  }

  const app = createPrTreeApp({
    document,
    window,
    PRTree: (globalThis as any).PRTree,
    PRTreeDOM: (globalThis as any).PRTreeDOM,
    PRTreeFetch: (globalThis as any).PRTreeFetch,
    PRTreeStorage: (globalThis as any).PRTreeStorage,
  });

  (globalThis as any).__PR_TREE_APP__ = app;
  try {
    document.documentElement?.setAttribute('data-prp-content', '1');
  } catch {
    /* ignore */
  }
  let featuresEnabled = false;
  let watching = false;

  async function tokenConfigured() {
    try {
      const status = await (globalThis as any).PRTreeStorage?.getGithubTokenStatus?.();
      return Boolean(status?.configured);
    } catch {
      return false;
    }
  }

  function disableFeatures() {
    featuresEnabled = false;
    try {
      (globalThis as any).PRModalHost?.setEnabled?.(false);
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

  function isContextDeadError(err: any) {
    const msg = String(err?.message || err || '');
    const bridge = (globalThis as any).PRTreeBridge;
    if (typeof bridge?.isExtensionContextAlive === 'function') {
      if (!bridge.isExtensionContextAlive()) return true;
    }
    if (typeof bridge?.isContextInvalidated === 'function') {
      return bridge.isContextInvalidated(msg);
    }
    return /Extension context invalidated|Extension was reloaded/i.test(msg);
  }

  /** One-shot banner: extension reloaded while this tab still ran the old content script. */
  function showReloadBanner(message: any) {
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
      const i18n = (globalThis as any).PRModalI18n;
      let locale = 'en';
      try {
        locale =
          document.documentElement.getAttribute('data-prp-app-locale') ||
          document.documentElement.getAttribute('data-prp-ui-language') ||
          document.documentElement.getAttribute('lang') ||
          'en';
        if (locale === 'auto') {
          locale = document.documentElement.getAttribute('lang') || 'en';
        }
      } catch {
        locale = 'en';
      }
      const msg = (key: string, fallback: string) => {
        try {
          if (typeof i18n?.formatMessage === 'function') {
            const m = i18n.formatMessage(key, locale);
            if (m && m !== key) return m;
          }
        } catch {
          /* ignore */
        }
        return fallback;
      };
      text.textContent =
        message ||
        msg(
          'content_reload_message',
          'pr+ was reloaded. Refresh this GitHub tab (⌘R / Ctrl+R) to reconnect.'
        );
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = msg('content_refresh', 'Refresh');
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
      close.setAttribute(
        'aria-label',
        msg('content_dismiss', 'Dismiss')
      );
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
        (globalThis as any).PRTreeBridge &&
        typeof (globalThis as any).PRTreeBridge.isExtensionContextAlive === 'function' &&
        !(globalThis as any).PRTreeBridge.isExtensionContextAlive()
      ) {
        showReloadBanner((globalThis as any).PRTreeBridge.RELOAD_REFRESH_MSG);
        return { ok: false, reason: 'context-invalidated' };
      }
      const res = await (globalThis as any).PRModalHost?.tryRestoreOpenModal?.();
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
          err?.message || (globalThis as any).PRTreeBridge?.RELOAD_REFRESH_MSG
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
      const warm = (globalThis as any).PRModalHost?.warmUp;
      if (typeof warm !== 'function') return;
      // Double rAF: after stack indents + browser paint
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          void warm.call((globalThis as any).PRModalHost);
        });
      });
    } catch {
      /* ignore */
    }
  }

  async function pluginAllowed() {
    try {
      const prefs = await (globalThis as any).PRTreeStorage?.getExtensionPrefs?.();
      return prefs?.pluginEnabled !== false;
    } catch {
      return true;
    }
  }

  async function enableFeatures() {
    if (!(await pluginAllowed())) {
      disableFeatures();
      return;
    }
    if (featuresEnabled) {
      app.scheduleSync?.(0);
      return;
    }
    featuresEnabled = true;
    try {
      (globalThis as any).PRModalHost?.setEnabled?.(true);
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
      chrome.runtime?.onMessage?.addListener((message: any) => {
        if (message?.type === 'PR_TREE_TOKEN_CHANGED') {
          void (async () => {
            const ok = await tokenConfigured();
            if (ok) await enableFeatures();
            else disableFeatures();
          })();
          return false;
        }
        // Master enable + rate-limit auto-disable
        if (message?.type === 'PR_TREE_PREFS_CHANGED') {
          const enabled = message?.prefs?.pluginEnabled !== false;
          if (!enabled) disableFeatures();
          else void enableFeatures();
          return false;
        }
        if (message?.type === 'PR_TREE_RATE_LIMIT_CHANGED') {
          if (message?.pluginEnabled === false) disableFeatures();
          return false;
        }
        return false;
      });
    } catch {
      /* ignore */
    }

    // storage.onChanged in content may not see extension local storage on all
    // browsers — runtime message from SW is primary; also try storage watcher.
    try {
      (globalThis as any).PRTreeStorage?.watchGithubToken?.((token: any) => {
        if (token) void enableFeatures();
        else disableFeatures();
      });
    } catch {
      /* ignore */
    }
    try {
      (globalThis as any).PRTreeStorage?.watchExtensionPrefs?.((prefs: any) => {
        if (prefs?.pluginEnabled === false) disableFeatures();
        else void enableFeatures();
      });
    } catch {
      /* ignore */
    }
    // Unpacked rebuilds leave a stale SW until reload — e2e / agents dispatch this.
    try {
      document.addEventListener('prp-reload-extension', () => {
        try {
          (globalThis as any).chrome?.runtime?.reload?.();
        } catch {
          /* ignore */
        }
      });
    } catch {
      /* ignore */
    }
  }

  // ── First-run onboarding (pulls page, top-right) ─────────────────────
  let onboardingTour: any = null;

  function isPullsListPath(pathname = window.location.pathname) {
    const path = String(pathname || '');
    if (!path.includes('/pulls')) return false;
    if (/\/pull\/\d+/.test(path)) return false;
    return true;
  }

  async function maybeStartOnboarding() {
    try {
      // Keep an in-progress tour alive when a PR modal opens over the list
      if (onboardingTour?.isActive?.()) return;

      if (!isPullsListPath()) {
        onboardingTour?.dispose?.();
        onboardingTour = null;
        return;
      }
      const api = (globalThis as any).PROnboarding;
      if (!api || typeof api.createOnboardingTour !== 'function') return;
      if (onboardingTour) return;

      const storage = (globalThis as any).PRTreeStorage;
      const bridgeSend = async (message: any) => {
        const chromeApi = (globalThis as any).chrome;
        if (!chromeApi?.runtime?.sendMessage) {
          throw new Error('chrome.runtime unavailable');
        }
        return chromeApi.runtime.sendMessage(message);
      };

      const getPrefs = async () => {
        if (typeof storage?.getExtensionPrefs !== 'function') {
          throw new Error('prefs unavailable');
        }
        // Retry while SW wakes from idle (first paint after install/reload)
        let lastErr: any = null;
        for (let i = 0; i < 4; i++) {
          try {
            return await storage.getExtensionPrefs();
          } catch (err) {
            lastErr = err;
            await new Promise((r) => setTimeout(r, 60 * (i + 1)));
          }
        }
        throw lastErr || new Error('prefs unavailable');
      };
      const setPrefs = async (patch: any) => {
        if (typeof storage?.setExtensionPrefs !== 'function') {
          const res = await bridgeSend({
            type: 'PR_TREE_PREFS_SET',
            prefs: patch || {},
          });
          if (!res?.ok) throw new Error(res?.error || 'Failed to save prefs');
          return res.prefs || patch;
        }
        return storage.setExtensionPrefs(patch);
      };
      /**
       * Content scripts have `storage` permission — write the one-shot flag
       * directly so we do not depend on a woken service worker for completion.
       */
      const ONBOARDING_KEY = 'onboardingCompleted';
      const chromeApi = () => (globalThis as any).chrome;
      const readOnboardingLocal = () =>
        new Promise((resolve) => {
          try {
            const area = chromeApi()?.storage?.local;
            if (!area?.get) {
              resolve(null);
              return;
            }
            area.get([ONBOARDING_KEY, 'extensionPrefs'], (result: any) => {
              if (typeof result?.[ONBOARDING_KEY] === 'boolean') {
                resolve(Boolean(result[ONBOARDING_KEY]));
                return;
              }
              const prefs = result?.extensionPrefs;
              if (prefs && typeof prefs.onboardingCompleted === 'boolean') {
                resolve(Boolean(prefs.onboardingCompleted));
                return;
              }
              resolve(null);
            });
          } catch {
            resolve(null);
          }
        });
      const writeOnboardingLocal = (completed: any) =>
        new Promise((resolve) => {
          try {
            const area = chromeApi()?.storage?.local;
            if (!area?.set) {
              resolve(false);
              return;
            }
            area.get(['extensionPrefs'], (cur: any) => {
              const prev =
                cur?.extensionPrefs && typeof cur.extensionPrefs === 'object'
                  ? cur.extensionPrefs
                  : {};
              area.set(
                {
                  [ONBOARDING_KEY]: Boolean(completed),
                  extensionPrefs: {
                    ...prev,
                    onboardingCompleted: Boolean(completed),
                  },
                },
                () => {
                  const err = chromeApi()?.runtime?.lastError;
                  resolve(!err);
                }
              );
            });
          } catch {
            resolve(false);
          }
        });

      const isOnboardingDone = async () => {
        const local = await readOnboardingLocal();
        if (local != null) return Boolean(local);
        if (typeof storage?.getOnboardingCompleted === 'function') {
          try {
            return Boolean(await storage.getOnboardingCompleted());
          } catch {
            /* fall through */
          }
        }
        try {
          const p = await getPrefs();
          return Boolean(p?.onboardingCompleted);
        } catch {
          // Unknown → do not block first-run forever
          return false;
        }
      };
      const markOnboardingDone = async () => {
        // 1) Direct storage write (reliable without SW)
        if (await writeOnboardingLocal(true)) return true;
        // 2) Bridge / SW path
        try {
          if (typeof storage?.setOnboardingCompleted === 'function') {
            if (Boolean(await storage.setOnboardingCompleted(true))) return true;
          }
        } catch (err) {
          console.warn('[pr+] setOnboardingCompleted failed', err);
        }
        try {
          const res = await bridgeSend({
            type: 'PR_TREE_ONBOARDING_SET',
            completed: true,
          });
          if (res?.ok && res.completed) return true;
        } catch {
          /* continue */
        }
        try {
          const next = await setPrefs({ onboardingCompleted: true });
          return Boolean(next?.onboardingCompleted);
        } catch {
          return false;
        }
      };

      onboardingTour = api.createOnboardingTour({
        document,
        window,
        getPrefs,
        setPrefs,
        isOnboardingDone,
        markOnboardingDone,
        getTokenStatus: () =>
          storage?.getGithubTokenStatus?.() ||
          Promise.resolve({ configured: false, mask: '' }),
        setToken: async (token: any) => {
          const res = await bridgeSend({
            type: 'PR_TREE_TOKEN_SET',
            token: String(token || ''),
          });
          if (!res?.ok && res?.error) {
            return { ok: false, error: res.error };
          }
          return {
            ok: true,
            configured: Boolean(res?.configured ?? true),
            mask: res?.mask || '',
          };
        },
        getPathname: () => window.location.pathname,
      });
      const res = await onboardingTour.start();
      if (!res?.ok) {
        onboardingTour.dispose?.();
        onboardingTour = null;
      }
    } catch (err) {
      console.warn('[pr+] onboarding failed', err);
      try {
        onboardingTour?.dispose?.();
      } catch {
        /* ignore */
      }
      onboardingTour = null;
    }
  }

  function watchOnboardingRoute() {
    const check = () => {
      void maybeStartOnboarding();
    };
    window.addEventListener('popstate', check);
    window.addEventListener('turbo:load', check);
    window.addEventListener('turbo:render', check);
    window.addEventListener('pjax:end', check);
    window.addEventListener('pr-tree-location', check);
    // Soft-nav poll (same idea as tree bootstrap)
    window.setInterval(() => {
      const active = onboardingTour?.isActive?.();
      if (active) return;
      if (isPullsListPath() && !document.getElementById('prp-onboarding')) {
        void maybeStartOnboarding();
      }
    }, 2000);

    // Popup "Start onboarding" — clear flag already done; remount tour
    try {
      chrome.runtime?.onMessage?.addListener((message: any) => {
        if (message?.type !== 'PR_TREE_ONBOARDING_RESTART') return false;
        try {
          onboardingTour?.dispose?.();
        } catch {
          /* ignore */
        }
        onboardingTour = null;
        void maybeStartOnboarding();
        return false;
      });
    } catch {
      /* ignore */
    }
  }

  // Expose for tests / host coordination
  (globalThis as any).__PR_PLUS_CONTENT__ = {
    enableFeatures,
    disableFeatures,
    isEnabled: () => featuresEnabled,
    afterStackReady,
    maybeStartOnboarding,
  };

  async function boot() {
    await start();
    watchOnboardingRoute();
    // Tour even without PAT (step 1 is PAT setup)
    await maybeStartOnboarding();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => void boot(), { once: true });
  } else {
    void boot();
  }
})();
