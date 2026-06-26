/**
 * Testable content-script bootstrap: fetch, tree build, DOM apply, toggle, SPA watch.
 */

function createPrTreeApp(deps) {
  const {
    document,
    window,
    PRTree,
    PRTreeDOM,
    PRTreeFetch,
    PRTreeStorage,
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
    PR_TREE_TOGGLE_ID,
    PR_TREE_INDENT_CLASS,
  } = PRTreeDOM;

  const { buildPrTree } = PRTree;
  const { fetchOpenPulls } = PRTreeFetch;
  const { getGithubToken, watchGithubToken } = PRTreeStorage;

  let cachedForest = null;
  let cachedPrs = null;
  let cachedRepoKey = null;
  let treeModeEnabled = true;
  let active = false;
  let toggleButton = null;
  let syncTimer = null;
  let bootstrapping = false;
  let lastPath = window.location.pathname;

  function repoKey(owner, repo) {
    return `${owner}/${repo}`;
  }

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

  function ensureToggle() {
    const inDoc = document.getElementById(PR_TREE_TOGGLE_ID);
    if (inDoc && toggleButton === inDoc) return toggleButton;
    if (inDoc) inDoc.remove();

    toggleButton = createToggleButton(document, {
      onShowTree: () => {
        treeModeEnabled = true;
        applyTreeView();
      },
      onShowOriginal: () => {
        treeModeEnabled = false;
        restoreOriginalView();
      },
      initialMode: treeModeEnabled ? 'tree' : 'original',
    });
    mountToggleNearHeader(document, toggleButton);
    ensureSettingsLink();
    return toggleButton;
  }

  function ensureSettingsLink() {
    if (document.getElementById('pr-tree-settings')) return;

    const link = document.createElement('a');
    link.id = 'pr-tree-settings';
    link.href = '#';
    link.className = 'pr-tree-settings-link';
    link.textContent = 'API token';
    link.title = 'Open GitHub API token settings';
    link.addEventListener('click', (event) => {
      event.preventDefault();
      globalThis.chrome?.runtime?.openOptionsPage?.();
    });

    if (toggleButton?.parentElement) {
      toggleButton.insertAdjacentElement('afterend', link);
    } else {
      mountToggleNearHeader(document, link);
    }
  }

  function needsReapply() {
    if (!treeModeEnabled || !cachedForest) return false;
    const rows = findOriginalPrRows(document);
    if (rows.length === 0) return false;
    const indented = document.querySelectorAll(`.${PR_TREE_INDENT_CLASS}`);
    return indented.length < rows.length;
  }

  function scheduleSync(delayMs = 200) {
    clearTimeout(syncTimer);
    syncTimer = window.setTimeout(() => {
      void handlePageChange();
    }, delayMs);
  }

  async function handlePageChange() {
    const path = window.location.pathname;
    const onPulls = path.includes('/pulls');
    const pathChanged = path !== lastPath;
    lastPath = path;

    if (!onPulls) {
      active = false;
      return;
    }

    const repoInfo = parseRepoFromPathname(path);
    if (!repoInfo) return;

    const key = repoKey(repoInfo.owner, repoInfo.repo);
    const repoChanged = cachedRepoKey !== key;

    if (pathChanged || repoChanged || !cachedForest) {
      await bootstrap();
      return;
    }

    ensureToggle();

    if (treeModeEnabled && needsReapply()) {
      applyTreeView();
      return;
    }

    if (findOriginalPrRows(document).length === 0) {
      scheduleSync(300);
    }
  }

  async function bootstrap() {
    if (bootstrapping) return { ok: false, reason: 'in-flight' };
    bootstrapping = true;

    try {
      const repoInfo = parseRepoFromPathname(window.location.pathname);
      if (!repoInfo) return { ok: false, reason: 'not-pulls-page' };

      const key = repoKey(repoInfo.owner, repoInfo.repo);
      const container = findPrListContainer(document);
      if (!container) {
        scheduleSync(300);
        return { ok: false, reason: 'no-list-container' };
      }

      if (cachedRepoKey !== key || !cachedForest) {
        const token = await getGithubToken();
        cachedPrs = await fetchOpenPulls(
          repoInfo.owner,
          repoInfo.repo,
          fetchImpl,
          { document, findOriginalPrRows, token }
        );
        cachedForest = buildPrTree(cachedPrs);
        cachedRepoKey = key;
      }

      if (cachedForest.length === 0 && cachedPrs.length === 0) {
        return { ok: false, reason: 'no-prs' };
      }

      ensureToggle();

      if (treeModeEnabled) {
        if (!applyTreeView()) {
          scheduleSync(300);
        }
      }

      return {
        ok: true,
        prCount: cachedPrs.length,
        rootCount: cachedForest.length,
        repo: repoInfo,
      };
    } catch (err) {
      console.warn('[PR Tree] Failed to load PR data:', err);
      scheduleSync(1000);
      return { ok: false, reason: 'fetch-failed', error: err };
    } finally {
      bootstrapping = false;
    }
  }

  function watchPullsPage() {
    const observer = new MutationObserver(() => scheduleSync(200));
    observer.observe(document.body, { childList: true, subtree: true });

    watchGithubToken(() => {
      cachedForest = null;
      cachedPrs = null;
      cachedRepoKey = null;
      void bootstrap();
    });

    const onNav = () => scheduleSync(50);
    window.addEventListener('popstate', onNav);
    window.addEventListener('hashchange', onNav);
    window.addEventListener('turbo:load', onNav);
    window.addEventListener('turbo:frame-load', onNav);
    window.addEventListener('pjax:complete', onNav);
    window.addEventListener('pjax:end', onNav);

    return observer;
  }

  return {
    bootstrap,
    applyTreeView,
    restoreOriginalView,
    ensureToggle,
    handlePageChange,
    scheduleSync,
    watchPullsPage,
    needsReapply,
    getCachedForest: () => cachedForest,
    getCachedPrs: () => cachedPrs,
    isActive: () => active,
    isTreeModeEnabled: () => treeModeEnabled,
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