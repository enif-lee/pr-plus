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
  let bootstrapQueued = false;
  let syncAttempts = 0;
  let lastSyncedPath = null;

  function repoKey(owner, repo) {
    return `${owner}/${repo}`;
  }

  function clearCache() {
    cachedForest = null;
    cachedPrs = null;
    cachedRepoKey = null;
    lastSyncedPath = null;
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

    const unstyled = rows.filter((row) => !row.classList.contains(PR_TREE_INDENT_CLASS));
    return unstyled.length > 0;
  }

  function scheduleSync(delayMs = 200) {
    clearTimeout(syncTimer);
    syncTimer = window.setTimeout(() => {
      void handlePageChange();
    }, delayMs);
  }

  function currentPullsContext() {
    const path = window.location.pathname;
    if (!path.includes('/pulls')) return null;
    const repoInfo = parseRepoFromPathname(path);
    if (!repoInfo) return null;
    return { path, repoInfo, key: repoKey(repoInfo.owner, repoInfo.repo) };
  }

  async function handlePageChange() {
    const ctx = currentPullsContext();
    if (!ctx) {
      active = false;
      return;
    }

    const { path, repoInfo, key } = ctx;
    const repoChanged = cachedRepoKey !== null && cachedRepoKey !== key;
    const needsBootstrap = !cachedForest || repoChanged || lastSyncedPath !== path;

    if (needsBootstrap) {
      if (repoChanged) clearCache();
      const result = await bootstrap();
      if (result.ok) {
        lastSyncedPath = path;
        syncAttempts = 0;
      } else if (result.reason !== 'in-flight') {
        scheduleSync(Math.min(300 * (syncAttempts + 1), 2000));
        syncAttempts += 1;
      }
      return;
    }

    ensureToggle();

    if (treeModeEnabled) {
      if (needsReapply()) {
        if (applyTreeView()) {
          syncAttempts = 0;
          return;
        }
      } else if (active) {
        return;
      }
    }

    if (findOriginalPrRows(document).length === 0) {
      scheduleSync(Math.min(300 * (syncAttempts + 1), 2000));
      syncAttempts += 1;
    }
  }

  async function bootstrap() {
    if (bootstrapping) {
      bootstrapQueued = true;
      return { ok: false, reason: 'in-flight' };
    }

    bootstrapping = true;

    try {
      const ctx = currentPullsContext();
      if (!ctx) return { ok: false, reason: 'not-pulls-page' };

      const { repoInfo, key } = ctx;
      const container = findPrListContainer(document);
      if (!container) {
        return { ok: false, reason: 'no-list-container' };
      }

      const rows = findOriginalPrRows(document);
      if (rows.length === 0) {
        return { ok: false, reason: 'no-rows' };
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
          return { ok: false, reason: 'apply-failed' };
        }
      }

      lastSyncedPath = ctx.path;
      return {
        ok: true,
        prCount: cachedPrs.length,
        rootCount: cachedForest.length,
        repo: repoInfo,
      };
    } catch (err) {
      console.warn('[PR Tree] Failed to load PR data:', err);
      return { ok: false, reason: 'fetch-failed', error: err };
    } finally {
      bootstrapping = false;
      if (bootstrapQueued) {
        bootstrapQueued = false;
        scheduleSync(0);
      }
    }
  }

  function watchPullsPage() {
    const observer = new MutationObserver(() => scheduleSync(250));
    observer.observe(document.body, { childList: true, subtree: true });

    watchGithubToken(() => {
      clearCache();
      scheduleSync(0);
    });

    const onNav = () => scheduleSync(80);
    window.addEventListener('popstate', onNav);
    window.addEventListener('hashchange', onNav);
    window.addEventListener('turbo:load', onNav);
    window.addEventListener('turbo:frame-load', onNav);
    window.addEventListener('pjax:complete', onNav);
    window.addEventListener('pjax:end', onNav);

    window.setInterval(() => {
      if (!currentPullsContext()) return;
      if (treeModeEnabled && (needsReapply() || !document.getElementById(PR_TREE_TOGGLE_ID))) {
        scheduleSync(0);
      }
    }, 2000);

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
    clearCache,
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