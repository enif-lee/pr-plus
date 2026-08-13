/**
 * Testable content-script bootstrap: fetch, tree build, DOM apply, toggle, SPA watch.
 */

function createPrTreeApp(deps: any) {
  const {
    document,
    window,
    PRTree,
    PRTreeDOM,
    PRTreeFetch,
    PRTreeStorage,
    fetchImpl = (globalThis as any).fetch,
  } = deps;

  const {
    parseRepoFromPathname,
    findPrListContainer,
    findOriginalPrRows,
    collectPagePrNumbers,
    applyTreeIndents,
    clearTreeIndents,
    countUnstyledPrRows,
    applyListDecorations,
    clearListDecorations,
    countMissingDecorations,
    refreshReviewBadges,
    createToggleButton,
    mountToggleNearHeader,
    PR_TREE_TOGGLE_ID,
    PR_TREE_INDENT_CLASS,
  } = PRTreeDOM;

  const { buildPrTree } = PRTree;
  const { fetchOpenPulls, fetchDanglingPulls, findDanglingPrNumbers } = PRTreeFetch;
  // Content context: watchGithubToken is signal-only (never receives the secret).
  const { watchGithubToken, getExtensionPrefs, setExtensionPrefs, watchExtensionPrefs } =
    PRTreeStorage || {};

  let cachedForest: any = null;
  let cachedPrs: any = null;
  let cachedRepoKey: any = null;
  let treeModeEnabled = true;
  let prefsUnsub: any = null;
  let active = false;
  let toggleButton: any = null;
  let syncTimer: any = null;
  let reapplyTimers: any[] = [];
  let bootstrapping = false;
  let bootstrapQueued = false;
  let syncAttempts = 0;
  let lastSyncedPath: any = null;
  let lastPageSignature: any = null;
  let lastLocationHref: any = null;
  let suppressObserverUntil = 0;
  let fillingDangling = false;

  function repoKey(owner: any, repo: any) {
    return `${owner}/${repo}`;
  }

  function clearCache() {
    cachedForest = null;
    cachedPrs = null;
    cachedRepoKey = null;
    lastSyncedPath = null;
    lastPageSignature = null;
  }

  /**
   * Patch one PR in the list cache (draft/title/state). Rebuilds forest + redecorates.
   */
  function patchCachedPr(number: any, patch: any) {
    const n = Number(number);
    if (!Number.isFinite(n) || n <= 0 || !patch || typeof patch !== 'object') {
      return false;
    }
    if (!Array.isArray(cachedPrs) || !cachedPrs.length) return false;
    let hit = false;
    cachedPrs = cachedPrs.map((p) => {
      if (!p || Number(p.number) !== n) return p;
      hit = true;
      return { ...p, ...patch, number: n };
    });
    if (!hit) return false;
    try {
      cachedForest = buildPrTree(cachedPrs);
    } catch {
      /* keep prior forest */
    }
    if (currentPullsContext()) {
      try {
        if (treeModeEnabled && cachedForest) applyTreeView();
        else applyDecorations();
      } catch {
        /* ignore */
      }
    }
    return true;
  }

  /**
   * Remove a PR from the list cache (merge/close). Rebuilds forest + redecorates.
   */
  function removeCachedPr(number: any) {
    const n = Number(number);
    if (!Number.isFinite(n) || n <= 0) return false;
    if (!Array.isArray(cachedPrs) || !cachedPrs.length) return false;
    const next = cachedPrs.filter((p) => !p || Number(p.number) !== n);
    if (next.length === cachedPrs.length) return false;
    cachedPrs = next;
    try {
      cachedForest = cachedPrs.length ? buildPrTree(cachedPrs) : [];
    } catch {
      cachedForest = [];
    }
    if (currentPullsContext()) {
      try {
        if (treeModeEnabled && cachedForest?.length) applyTreeView();
        else applyDecorations();
      } catch {
        /* ignore */
      }
    }
    return true;
  }

  /**
   * Replace open-list snapshot after a forced network fetch (same repo).
   */
  function replaceCachedPrs(prs: any, opts: any = {}) {
    if (!Array.isArray(prs)) return false;
    const o = String(opts?.owner || '').trim();
    const r = String(opts?.repo || '').trim();
    if (o && r) {
      const key = repoKey(o, r);
      if (cachedRepoKey && cachedRepoKey !== key) {
        // Different repo — adopt new key
        cachedRepoKey = key;
      } else if (!cachedRepoKey) {
        cachedRepoKey = key;
      }
    }
    cachedPrs = prs.slice();
    try {
      cachedForest = cachedPrs.length ? buildPrTree(cachedPrs) : [];
    } catch {
      cachedForest = [];
    }
    if (currentPullsContext()) {
      try {
        if (treeModeEnabled && cachedForest?.length) applyTreeView();
        else applyDecorations();
      } catch {
        /* ignore */
      }
    }
    return true;
  }

  function pageSignature(numbers: any) {
    return numbers.slice().sort((a: any, b: any) => a - b).join(',');
  }

  function currentPullsContext() {
    const path = window.location.pathname;
    // Include search so filter/query changes re-sync.
    const pathWithQuery = `${path}${window.location.search || ''}`;
    if (!path.includes('/pulls')) return null;
    const repoInfo = parseRepoFromPathname(path);
    if (!repoInfo) return null;
    return {
      path: pathWithQuery,
      repoInfo,
      key: repoKey(repoInfo.owner, repoInfo.repo),
    };
  }

  function clearReapplyTimers() {
    for (const id of reapplyTimers) window.clearTimeout(id);
    reapplyTimers = [];
  }

  function scheduleDeferredReapply() {
    clearReapplyTimers();
    // GitHub React/Turbo often re-renders shortly after our DOM edits.
    for (const delay of [50, 200, 600, 1500, 3000]) {
      const id = window.setTimeout(() => {
        if (!currentPullsContext()) return;
        if (cachedPrs?.length) {
          refreshReviewBadges(document, cachedPrs);
        }
        if (needsReapply() || !document.getElementById(PR_TREE_TOGGLE_ID)) {
          ensureToggle();
          if (treeModeEnabled && cachedForest) applyTreeView();
          else applyDecorations();
        }
      }, delay);
      reapplyTimers.push(id);
    }
  }

  function applyDecorations() {
    if (!cachedPrs || cachedPrs.length === 0) return 0;
    suppressObserverUntil = Date.now() + 400;
    const n = applyListDecorations(document, cachedPrs);
    // Review decisions often arrive via batch-deferred-content after paint.
    refreshReviewBadges(document, cachedPrs);
    return n;
  }

  function applyTreeView() {
    if (!cachedForest) return false;
    suppressObserverUntil = Date.now() + 400;
    const applied = applyTreeIndents(document, cachedForest);
    applyDecorations();
    if (applied === 0) {
      active = false;
      return false;
    }
    active = true;
    scheduleDeferredReapply();
    return true;
  }

  function restoreOriginalView() {
    clearReapplyTimers();
    suppressObserverUntil = Date.now() + 400;
    clearTreeIndents(document);
    // Keep branch/draft badges in default order mode.
    applyDecorations();
    active = false;
    return true;
  }

  function setTreeModeEnabled(next: boolean, { persist = false } = {}) {
    const enabled = Boolean(next);
    if (treeModeEnabled === enabled && !persist) {
      // Still sync label if toggle exists
      if (toggleButton && typeof toggleButton.setMode === 'function') {
        toggleButton.setMode(enabled ? 'tree' : 'original');
      }
      return;
    }
    treeModeEnabled = enabled;
    if (currentPullsContext()) {
      if (enabled) applyTreeView();
      else restoreOriginalView();
    }
    if (toggleButton && typeof toggleButton.setMode === 'function') {
      try {
        toggleButton.setMode(enabled ? 'tree' : 'original');
      } catch {
        /* ignore */
      }
    }
    if (persist && typeof setExtensionPrefs === 'function') {
      void setExtensionPrefs({ treeView: enabled }).catch(() => {});
    }
  }

  async function hydrateTreeViewPref() {
    if (typeof getExtensionPrefs !== 'function') return;
    try {
      const prefs = await getExtensionPrefs();
      if (prefs && typeof prefs.treeView === 'boolean') {
        treeModeEnabled = prefs.treeView;
      }
    } catch {
      /* keep default */
    }
  }

  function ensurePrefsWatch() {
    if (prefsUnsub || typeof watchExtensionPrefs !== 'function') return;
    prefsUnsub = watchExtensionPrefs((prefs: any) => {
      if (prefs && typeof prefs.treeView === 'boolean') {
        setTreeModeEnabled(prefs.treeView, { persist: false });
      }
      // Language pref: re-localize Tree/Original toggle labels
      if (prefs && prefs.uiLanguage != null) {
        try {
          const pure = (globalThis as any).PRModalI18n;
          const resolve =
            pure?.mapToAppLocale ||
            ((raw: string) => (raw === 'auto' ? null : raw));
          let locale = String(prefs.uiLanguage || 'auto');
          if (locale === 'auto') {
            locale =
              document.documentElement.getAttribute('lang') ||
              document.documentElement.getAttribute('data-prp-app-locale') ||
              'en';
          } else {
            locale = resolve(locale) || locale;
          }
          document.documentElement.setAttribute('data-prp-ui-language', String(prefs.uiLanguage));
          document.documentElement.setAttribute('data-prp-app-locale', locale);
        } catch {
          /* ignore */
        }
        try {
          (toggleButton as any)?.rebindLocale?.();
        } catch {
          /* ignore */
        }
      }
    });
  }

  function ensureToggle() {
    const inDoc = document.getElementById(PR_TREE_TOGGLE_ID);
    if (inDoc && toggleButton === inDoc) return toggleButton;
    if (inDoc) inDoc.remove();

    toggleButton = createToggleButton(document, {
      onShowTree: () => {
        setTreeModeEnabled(true, { persist: true });
      },
      onShowOriginal: () => {
        setTreeModeEnabled(false, { persist: true });
      },
      initialMode: treeModeEnabled ? 'tree' : 'original',
    });
    mountToggleNearHeader(document, toggleButton);
    return toggleButton;
  }

  function needsReapply() {
    if (!cachedPrs || cachedPrs.length === 0) return false;
    if (countMissingDecorations(document, cachedPrs) > 0) return true;
    if (treeModeEnabled && cachedForest && countUnstyledPrRows(document) > 0) {
      return true;
    }
    return false;
  }

  function scheduleSync(delayMs: any = 200) {
    clearTimeout(syncTimer);
    syncTimer = window.setTimeout(() => {
      void handlePageChange();
    }, delayMs);
  }

  function mergePrs(base: any, extras: any) {
    const byNumber = new Map((base || []).map((pr: any) => [pr.number, pr]));
    for (const pr of extras || []) {
      byNumber.set(pr.number, pr);
    }
    return [...byNumber.values()];
  }

  async function fillDanglingForPage(pagePrNumbers: any) {
    if (!cachedPrs || !pagePrNumbers.length || fillingDangling) return false;
    const dangling = findDanglingPrNumbers(pagePrNumbers, cachedPrs);
    if (dangling.length === 0) return false;

    const ctx = currentPullsContext();
    if (!ctx) return false;

    fillingDangling = true;
    try {
      // Token stays in the service worker; content only receives PR metadata.
      const extras = await fetchDanglingPulls(
        ctx.repoInfo.owner,
        ctx.repoInfo.repo,
        dangling,
        fetchImpl
      );
      if (extras.length === 0) return false;
      cachedPrs = mergePrs(cachedPrs, extras);
      cachedForest = buildPrTree(cachedPrs);
      return true;
    } finally {
      fillingDangling = false;
    }
  }

  async function loadPrData(repoInfo: any, pagePrNumbers: any) {
    // API auth is applied in the background service worker only.
    cachedPrs = await fetchOpenPulls(repoInfo.owner, repoInfo.repo, fetchImpl, {
      pagePrNumbers,
    });
    cachedForest = buildPrTree(cachedPrs);
    cachedRepoKey = repoKey(repoInfo.owner, repoInfo.repo);
  }

  async function handlePageChange() {
    const ctx = currentPullsContext();
    if (!ctx) {
      active = false;
      return;
    }

    const { path, repoInfo, key } = ctx;
    const pagePrNumbers = collectPagePrNumbers(document);
    const signature = pageSignature(pagePrNumbers);
    const repoChanged = cachedRepoKey !== null && cachedRepoKey !== key;
    const pathChanged = lastSyncedPath !== null && lastSyncedPath !== path;
    const pageChanged = lastPageSignature !== null && lastPageSignature !== signature;
    const needsFullLoad = !cachedForest || repoChanged;

    if (repoChanged) clearCache();

    // Full bootstrap when no cache, repo change, or first paint for this path without data.
    if (needsFullLoad || (pathChanged && !cachedForest)) {
      const result = await bootstrap();
      if (result.ok) {
        lastSyncedPath = path;
        lastPageSignature = signature;
        syncAttempts = 0;
      } else if (result.reason !== 'in-flight') {
        scheduleSync(Math.min(300 * (syncAttempts + 1), 2500));
        syncAttempts += 1;
      }
      return;
    }

    // List wiped during SPA re-render — wait for rows to come back.
    if (pagePrNumbers.length === 0 || findOriginalPrRows(document).length === 0) {
      active = false;
      scheduleSync(Math.min(250 * (syncAttempts + 1), 2500));
      syncAttempts += 1;
      return;
    }

    // Filter/query/list content changed: fill dangling metadata then re-apply.
    if (pathChanged || pageChanged || findDanglingPrNumbers(pagePrNumbers, cachedPrs || []).length > 0) {
      try {
        await fillDanglingForPage(pagePrNumbers);
      } catch (err) {
        console.warn('[PR Tree] Dangling fill failed:', err);
      }
      lastSyncedPath = path;
      lastPageSignature = signature;
    }

    ensureToggle();

    if (!treeModeEnabled) {
      if (countMissingDecorations(document, cachedPrs || []) > 0) {
        applyDecorations();
      }
      return;
    }

    if (needsReapply() || !active) {
      if (applyTreeView()) {
        syncAttempts = 0;
        return;
      }
      // Rows present but apply failed (transient DOM) — retry.
      scheduleSync(Math.min(300 * (syncAttempts + 1), 2500));
      syncAttempts += 1;
      return;
    }

    // Cache hit, styled, active — still remount toggle if SPA wiped it.
    if (!document.getElementById(PR_TREE_TOGGLE_ID)) {
      ensureToggle();
    }
    if (countMissingDecorations(document, cachedPrs || []) > 0) {
      applyDecorations();
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

      await hydrateTreeViewPref();
      ensurePrefsWatch();

      const { repoInfo, key, path } = ctx;

      // Soft-wait for list shell; GitHub often paints shell before rows.
      const container = findPrListContainer(document);
      if (!container) {
        return { ok: false, reason: 'no-list-container' };
      }

      const rows = findOriginalPrRows(document);
      const pagePrNumbers = collectPagePrNumbers(document);
      if (rows.length === 0 && pagePrNumbers.length === 0) {
        return { ok: false, reason: 'no-rows' };
      }

      if (cachedRepoKey !== key || !cachedForest) {
        await loadPrData(repoInfo, pagePrNumbers);
      } else {
        // Same repo cache: still fill any page-only PRs.
        await fillDanglingForPage(pagePrNumbers);
      }

      if (!cachedPrs || (cachedForest.length === 0 && cachedPrs.length === 0)) {
        return { ok: false, reason: 'no-prs' };
      }

      ensureToggle();

      if (treeModeEnabled) {
        if (!applyTreeView()) {
          return { ok: false, reason: 'apply-failed' };
        }
      } else {
        applyDecorations();
      }

      lastSyncedPath = path;
      lastPageSignature = pageSignature(pagePrNumbers);

      // Notify modal host that stack list is ready (refresh restore can open modal)
      try {
        window.dispatchEvent(
          new CustomEvent('pr-plus-stack-ready', {
            detail: { owner: repoInfo.owner, repo: repoInfo.repo, prCount: cachedPrs.length },
          })
        );
      } catch {
        /* ignore */
      }

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

  function patchHistoryNavigation() {
    const historyObj = window.history;
    if (!historyObj || historyObj.__prTreePatched) return () => {};

    const fire = () => {
      window.dispatchEvent(new Event('pr-tree-location'));
    };

    const wrap = (method: any) => {
      const original = historyObj[method];
      if (typeof original !== 'function') return null;
      historyObj[method] = function prTreePatchedHistory(...args: any[]) {
        const ret = original.apply(this, args);
        fire();
        return ret;
      };
      return original;
    };

    const origPush = wrap('pushState');
    const origReplace = wrap('replaceState');
    historyObj.__prTreePatched = true;

    return () => {
      if (origPush) historyObj.pushState = origPush;
      if (origReplace) historyObj.replaceState = origReplace;
      delete historyObj.__prTreePatched;
    };
  }

  function watchPullsPage() {
    const observer = new MutationObserver(() => {
      // This observer only owns /pulls. Ignore pr+ React commits on PR pages.
      if (!currentPullsContext()) return;
      if (Date.now() < suppressObserverUntil) return;
      scheduleSync(200);
    });

    const root = document.documentElement || document.body;
    if (root) {
      observer.observe(root, { childList: true, subtree: true });
    }

    watchGithubToken(() => {
      clearCache();
      scheduleSync(0);
    });
    ensurePrefsWatch();
    void hydrateTreeViewPref();

    const onNav = () => scheduleSync(50);
    window.addEventListener('popstate', onNav);
    window.addEventListener('hashchange', onNav);
    window.addEventListener('pr-tree-location', onNav);
    window.addEventListener('turbo:load', onNav);
    window.addEventListener('turbo:render', onNav);
    window.addEventListener('turbo:frame-load', onNav);
    window.addEventListener('turbo:before-render', onNav);
    window.addEventListener('pjax:complete', onNav);
    window.addEventListener('pjax:end', onNav);
    window.addEventListener('pageshow', onNav);
    window.addEventListener('focus', () => {
      if (currentPullsContext() && (needsReapply() || !active)) scheduleSync(0);
    });

    const unpatchHistory = patchHistoryNavigation();

    // Location polling catches Turbo/soft-nav that skip events.
    const hrefPoll = window.setInterval(() => {
      const href = window.location.href;
      if (href !== lastLocationHref) {
        lastLocationHref = href;
        scheduleSync(50);
        return;
      }
      if (!currentPullsContext()) return;
      if (needsReapply() || !document.getElementById(PR_TREE_TOGGLE_ID)) {
        scheduleSync(0);
      }
    }, 1000);

    lastLocationHref = window.location.href;

    return {
      observer,
      disconnect() {
        observer.disconnect();
        unpatchHistory();
        window.clearInterval(hrefPoll);
        clearTimeout(syncTimer);
        clearReapplyTimers();
      },
    };
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
    patchCachedPr,
    removeCachedPr,
    replaceCachedPrs,
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
  (globalThis as any).PRTreeBootstrap = bootstrapApi;
}
