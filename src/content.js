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
  });

  function runBootstrap() {
    app.bootstrap();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runBootstrap);
  } else {
    runBootstrap();
  }

  let lastPath = window.location.pathname;
  const observer = new MutationObserver(() => {
    if (window.location.pathname !== lastPath) {
      lastPath = window.location.pathname;
      if (lastPath.includes('/pulls')) {
        runBootstrap();
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();