/**
 * Testable content-script bootstrap: fetch, tree build, DOM apply, toggle.
 */

function createPrTreeApp(deps) {
  const {
    document,
    window,
    PRTree,
    PRTreeDOM,
    PRTreeFetch,
    fetchImpl = globalThis.fetch,
  } = deps;

  const {
    parseRepoFromPathname,
    findPrListContainer,
    findOriginalPrRows,
    applyTreeIndents,
    clearTreeIndents,
    createToggleButton,
    mountToggleNearHeader,
  } = PRTreeDOM;

  const { buildPrTree } = PRTree;
  const { fetchOpenPulls } = PRTreeFetch;

  let cachedForest = null;
  let cachedPrs = null;
  let active = false;
  let toggleButton = null;

  function applyTreeView() {
    if (!cachedForest) return false;
    const applied = applyTreeIndents(document, cachedForest);
    if (applied === 0) return false;
    active = true;
    return true;
  }

  function restoreOriginalView() {
    clearTreeIndents(document);
    active = false;
    return true;
  }

  async function bootstrap() {
    const repoInfo = parseRepoFromPathname(window.location.pathname);
    if (!repoInfo) return { ok: false, reason: 'not-pulls-page' };

    const container = findPrListContainer(document);
    if (!container) return { ok: false, reason: 'no-list-container' };

    try {
      cachedPrs = await fetchOpenPulls(
        repoInfo.owner,
        repoInfo.repo,
        fetchImpl,
        { document, findOriginalPrRows }
      );
      cachedForest = buildPrTree(cachedPrs);
    } catch (err) {
      return { ok: false, reason: 'fetch-failed', error: err };
    }

    if (cachedForest.length === 0 && cachedPrs.length === 0) {
      return { ok: false, reason: 'no-prs' };
    }

    if (!toggleButton) {
      toggleButton = createToggleButton(document, {
        onShowTree: applyTreeView,
        onShowOriginal: restoreOriginalView,
        initialMode: 'tree',
      });
      mountToggleNearHeader(document, toggleButton);
    }

    applyTreeView();
    return {
      ok: true,
      prCount: cachedPrs.length,
      rootCount: cachedForest.length,
      repo: repoInfo,
    };
  }

  return {
    bootstrap,
    applyTreeView,
    restoreOriginalView,
    getCachedForest: () => cachedForest,
    getCachedPrs: () => cachedPrs,
    isActive: () => active,
    getToggleButton: () => toggleButton,
  };
}

const bootstrapApi = { createPrTreeApp };

if (typeof module !== 'undefined' && module.exports) {
  module.exports = bootstrapApi;
}
if (typeof globalThis !== 'undefined') {
  globalThis.PRTreeBootstrap = bootstrapApi;
}