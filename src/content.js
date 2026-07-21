/**
 * Content script entry (browser only).
 */

(function initPrTreeContentScript() {
  // Soft navigations can re-inject in some contexts; keep a single app instance.
  if (globalThis.__PR_TREE_APP__) {
    globalThis.__PR_TREE_APP__.scheduleSync?.(0);
    return;
  }

  const { createPrTreeApp } = globalThis.PRTreeBootstrap;

  const app = createPrTreeApp({
    document,
    window,
    PRTree: globalThis.PRTree,
    PRTreeDOM: globalThis.PRTreeDOM,
    PRTreeFetch: globalThis.PRTreeFetch,
    PRTreeStorage: globalThis.PRTreeStorage,
  });

  globalThis.__PR_TREE_APP__ = app;

  function start() {
    app.watchPullsPage();
    // Immediate + delayed boot: GitHub often paints PR rows after idle.
    void app.bootstrap().then((result) => {
      if (!result?.ok) app.scheduleSync(150);
    });
    app.scheduleSync(400);
    app.scheduleSync(1200);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
