/**
 * AUTO-GENERATED from src/content.ts
 * SOURCE OF TRUTH: src/content.ts — do not edit this .js
 * Rebuild: node scripts/build-content-ts.mjs
 */
(function initPrTreeContentScript() {
  if (globalThis.__PR_TREE_APP__) {
    globalThis.__PR_TREE_APP__.scheduleSync?.(0);
    return;
  }
  try {
    const ep = globalThis.PRGithubEndpoints;
    if (ep && typeof ep.isGithubWebDocument === "function" && !ep.isGithubWebDocument(document, window.location)) {
      return;
    }
  } catch {
  }
  const { createPrTreeApp } = globalThis.PRTreeBootstrap;
  if (typeof createPrTreeApp !== "function") {
    console.warn("[pr+] PRTreeBootstrap missing");
    return;
  }
  const app = createPrTreeApp({
    document,
    window,
    PRTree: globalThis.PRTree,
    PRTreeDOM: globalThis.PRTreeDOM,
    PRTreeFetch: globalThis.PRTreeFetch,
    PRTreeStorage: globalThis.PRTreeStorage
  });
  globalThis.__PR_TREE_APP__ = app;
  try {
    document.documentElement?.setAttribute("data-prp-content", "1");
  } catch {
  }
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
    }
    try {
      app.restoreOriginalView?.();
      app.clearCache?.();
    } catch {
    }
  }
  function isContextDeadError(err) {
    const msg = String(err?.message || err || "");
    const bridge = globalThis.PRTreeBridge;
    if (typeof bridge?.isExtensionContextAlive === "function") {
      if (!bridge.isExtensionContextAlive()) return true;
    }
    if (typeof bridge?.isContextInvalidated === "function") {
      return bridge.isContextInvalidated(msg);
    }
    return /Extension context invalidated|Extension was reloaded/i.test(msg);
  }
  function showReloadBanner(message) {
    try {
      if (document.getElementById("prp-reload-banner")) return;
      const el = document.createElement("div");
      el.id = "prp-reload-banner";
      el.setAttribute("role", "status");
      el.style.cssText = [
        "position:fixed",
        "z-index:100000",
        "left:50%",
        "bottom:20px",
        "transform:translateX(-50%)",
        "max-width:min(480px,92vw)",
        "padding:12px 14px",
        "border-radius:10px",
        "border:1px solid #d0d7de",
        "background:#fff8c5",
        "color:#1f2328",
        'font:13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif',
        "box-shadow:0 8px 24px rgba(1,4,9,.18)",
        "display:flex",
        "align-items:flex-start",
        "gap:10px"
      ].join(";");
      const text = document.createElement("div");
      text.style.flex = "1 1 auto";
      text.textContent = message || "pr+ was reloaded. Refresh this GitHub tab (\u2318R / Ctrl+R) to reconnect.";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = "Refresh";
      btn.style.cssText = "flex:0 0 auto;appearance:none;border:1px solid #d0d7de;background:#f6f8fa;border-radius:6px;padding:4px 10px;font:inherit;cursor:pointer;font-weight:600";
      btn.onclick = () => {
        try {
          location.reload();
        } catch {
        }
      };
      const close = document.createElement("button");
      close.type = "button";
      close.setAttribute("aria-label", "Dismiss");
      close.textContent = "\xD7";
      close.style.cssText = "flex:0 0 auto;appearance:none;border:0;background:transparent;font-size:18px;line-height:1;cursor:pointer;color:#656d76;padding:0 2px";
      close.onclick = () => el.remove();
      el.appendChild(text);
      el.appendChild(btn);
      el.appendChild(close);
      (document.body || document.documentElement).appendChild(el);
    } catch {
    }
  }
  async function afterStackReady() {
    await new Promise((r) => window.setTimeout(r, 0));
    try {
      if (globalThis.PRTreeBridge && typeof globalThis.PRTreeBridge.isExtensionContextAlive === "function" && !globalThis.PRTreeBridge.isExtensionContextAlive()) {
        showReloadBanner(globalThis.PRTreeBridge.RELOAD_REFRESH_MSG);
        return { ok: false, reason: "context-invalidated" };
      }
      const res = await globalThis.PRModalHost?.tryRestoreOpenModal?.();
      if (res?.ok) {
        return res;
      }
      if (res?.reason === "context-invalidated") {
        showReloadBanner(res.message);
        return res;
      }
    } catch (err) {
      if (isContextDeadError(err)) {
        showReloadBanner(
          err?.message || globalThis.PRTreeBridge?.RELOAD_REFRESH_MSG
        );
        console.info(
          "[pr+] modal restore skipped (extension context invalidated \u2014 refresh this tab)"
        );
      } else {
        console.warn("[pr+] modal restore failed", err);
      }
    }
    return null;
  }
  function warmModalAfterListPaint() {
    try {
      const warm = globalThis.PRModalHost?.warmUp;
      if (typeof warm !== "function") return;
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          void warm.call(globalThis.PRModalHost);
        });
      });
    } catch {
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
    }
    if (!watching) {
      watching = true;
      app.watchPullsPage();
    }
    const result = await app.bootstrap();
    if (!result?.ok) {
      app.scheduleSync(150);
      warmModalAfterListPaint();
    } else {
      await afterStackReady();
      warmModalAfterListPaint();
    }
    app.scheduleSync(400);
    app.scheduleSync(1200);
  }
  async function start() {
    const ok = await tokenConfigured();
    if (!ok) {
      disableFeatures();
      listenTokenLifecycle();
      return;
    }
    listenTokenLifecycle();
    await enableFeatures();
  }
  function listenTokenLifecycle() {
    try {
      chrome.runtime?.onMessage?.addListener((message) => {
        if (message?.type !== "PR_TREE_TOKEN_CHANGED") return false;
        void (async () => {
          const ok = await tokenConfigured();
          if (ok) await enableFeatures();
          else disableFeatures();
        })();
        return false;
      });
    } catch {
    }
    try {
      globalThis.PRTreeStorage?.watchGithubToken?.((token) => {
        if (token) void enableFeatures();
        else disableFeatures();
      });
    } catch {
    }
  }
  globalThis.__PR_PLUS_CONTENT__ = {
    enableFeatures,
    disableFeatures,
    isEnabled: () => featuresEnabled,
    afterStackReady
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => void start(), { once: true });
  } else {
    void start();
  }
})();
