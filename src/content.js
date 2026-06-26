/**
 * Content script entry (browser only).
 */

(function initPrTreeContentScript() {
  const { createPrTreeApp } = globalThis.PRTreeBootstrap;

  const app = createPrTreeApp({
    document,
    window,
    PRTree: globalThis.PRTree,
    PRTreeDOM: globalThis.PRTreeDOM,
    PRTreeFetch: globalThis.PRTreeFetch,
    PRTreeStorage: globalThis.PRTreeStorage,
  });

  function start() {
    app.watchPullsPage();
    app.bootstrap();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();