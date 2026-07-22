/**
 * Content-script host: intercept PR list clicks, mount React modal overlay.
 * Bundle + CSS are extension-local (no remote code).
 * Host updates reuse the same React root so Diff/search/scroll state survives refresh.
 * PR detail uses a short-lived cache for stale-while-revalidate opens.
 */

(function initPrModalHost() {
  const HOST_ID = 'prp-modal-host';
  let reactRoot = null;
  /** When false (no PAT), click intercept is idle — native GitHub navigation works. */
  let hostEnabled = false;
  let current = {
    open: false,
    loading: false,
    error: null,
    detail: null,
    owner: null,
    repo: null,
    number: null,
    /** @type {string|null} */
    routePage: null,
    /** @type {string|null} */
    routePosition: null,
  };

  const detailCache =
    globalThis.PRModalDetailCache?.createDetailCache?.({ ttlMs: 60_000 }) ||
    createFallbackCache();

  function sessionApi() {
    return globalThis.PRModalSessionView || null;
  }

  function uriApi() {
    return globalThis.PRModalUriRoute || null;
  }

  function createFallbackCache() {
    const store = new Map();
    const TTL = 60_000;
    return {
      cacheKey(owner, repo, number) {
        return `${String(owner || '').toLowerCase()}/${String(repo || '').toLowerCase()}#${Number(number)}`;
      },
      peek(key) {
        const e = store.get(key);
        if (!e) return { value: null, fresh: false, stale: false };
        const fresh = e.expiresAt > Date.now();
        return { value: e.value, fresh, stale: !fresh };
      },
      get(key) {
        const p = this.peek(key);
        return p.fresh ? p.value : null;
      },
      set(key, value) {
        store.set(key, { value, expiresAt: Date.now() + TTL });
      },
      invalidate(key) {
        store.delete(key);
      },
    };
  }

  function ensureAssets() {
    if (!document.getElementById('prp-modal-css')) {
      const link = document.createElement('link');
      link.id = 'prp-modal-css';
      link.rel = 'stylesheet';
      link.href = chrome.runtime.getURL('src/modal/dist/pr-modal.css');
      (document.head || document.documentElement).appendChild(link);
    }
  }

  function ensureHost() {
    ensureAssets();
    let host = document.getElementById(HOST_ID);
    if (!host) {
      host = document.createElement('div');
      host.id = HOST_ID;
      document.documentElement.appendChild(host);
    }
    return host;
  }

  function detailKey(owner, repo, number) {
    return detailCache.cacheKey(owner, repo, number);
  }

  function resolveOpenPulls() {
    try {
      const app = globalThis.__PR_TREE_APP__;
      const list = app?.getCachedPrs?.();
      if (Array.isArray(list) && list.length) return list;
    } catch {
      /* ignore */
    }
    return [];
  }

  function buildProps() {
    const owner = current.owner;
    const repo = current.repo;
    const number = current.number;
    const openPulls = resolveOpenPulls();
    return {
      open: current.open,
      loading: current.loading,
      error: current.error,
      detail: current.detail,
      openPulls,
      // Deep-link restore (page/position); App also writes URI on focus changes
      initialRoute: {
        page: current.routePage,
        position: current.routePosition,
        number: current.number,
      },
      onRouteChange: persistRouteState,
      onClose: closeModal,
      onOpenStackPr: (n) => {
        if (!owner || !repo || n == null) return;
        void openModal({ owner, repo, number: Number(n) });
      },
      onRefresh: async () => {
        if (!owner || !repo || !number) return;
        if (!globalThis.PRTreeFetch?.fetchPrDetail) return;
        const key = detailKey(owner, repo, number);
        // Invalidate cache so write actions never re-surface stale conversation
        detailCache.invalidate?.(key);
        current.loading = true;
        current.error = null;
        render();
        try {
          const detail = await globalThis.PRTreeFetch.fetchPrDetail(
            owner,
            repo,
            number
          );
          if (
            current.open &&
            current.owner === owner &&
            current.repo === repo &&
            Number(current.number) === Number(number)
          ) {
            current.loading = false;
            current.detail = detail;
            current.error = null;
            detailCache.set(key, detail);
            render();
          }
        } catch (err) {
          if (current.open) {
            current.loading = false;
            current.error = err?.message || String(err);
            render();
          }
        }
      },
      /** Files for a single commit or commit range (GitHub compare). */
      onFetchCompareFiles: async (base, head, options = {}) => {
        if (!owner || !repo) {
          throw new Error('No open repository for compare');
        }
        if (!globalThis.PRTreeFetch?.fetchCompareFiles) {
          throw new Error('Compare fetch unavailable');
        }
        return globalThis.PRTreeFetch.fetchCompareFiles(owner, repo, base, head, {
          gitattributesText:
            options.gitattributesText ||
            current.detail?.gitattributesText ||
            '',
        });
      },
    };
  }

  function render() {
    if (typeof globalThis.mountPrModal !== 'function') {
      console.warn('[pr+] modal bundle not loaded (mountPrModal missing)');
      return;
    }
    const host = ensureHost();

    if (!current.open) {
      if (reactRoot) {
        try {
          reactRoot.unmount();
        } catch {
          /* ignore */
        }
        reactRoot = null;
        host.replaceChildren();
      }
      return;
    }

    const props = buildProps();
    if (reactRoot && typeof reactRoot.render === 'function') {
      // Reuse root — preserves Diff layout, scrollTop, and search UI state.
      reactRoot.render(props);
      return;
    }
    reactRoot = globalThis.mountPrModal(host, props);
  }

  function persistOpenModal(owner, repo, number, extra = {}) {
    const api = sessionApi();
    if (typeof sessionStorage === 'undefined' || !api?.saveOpenModal) return;
    api.saveOpenModal(sessionStorage, {
      owner,
      repo,
      number,
      page: extra.page ?? current.routePage ?? null,
      position: extra.position ?? current.routePosition ?? null,
    });
  }

  function clearPersistedOpenModal() {
    const api = sessionApi();
    if (typeof sessionStorage === 'undefined' || !api?.clearOpenModal) return;
    api.clearOpenModal(sessionStorage);
  }

  function writeUriRoute({ page, number, position } = {}) {
    const api = uriApi();
    if (!api?.replaceLocationRoute) return;
    try {
      api.replaceLocationRoute(
        typeof history !== 'undefined' ? history : null,
        typeof location !== 'undefined' ? location : null,
        {
          page: page ?? current.routePage ?? null,
          number: number ?? current.number ?? null,
          position: position ?? current.routePosition ?? null,
        }
      );
    } catch {
      /* ignore — non-browser / restricted */
    }
  }

  function clearUriRoute() {
    const api = uriApi();
    if (!api?.clearLocationRoute) return;
    try {
      api.clearLocationRoute(
        typeof history !== 'undefined' ? history : null,
        typeof location !== 'undefined' ? location : null
      );
    } catch {
      /* ignore */
    }
  }

  /**
   * Called from modal when layout/comment focus changes.
   * Keeps session + URI in sync (replaceState only).
   */
  function persistRouteState(route = {}) {
    if (!current.open || !current.owner || !current.repo || !current.number) return;
    if (route.page != null) current.routePage = route.page;
    if (route.position !== undefined) current.routePosition = route.position || null;
    persistOpenModal(current.owner, current.repo, current.number, {
      page: current.routePage,
      position: current.routePosition,
    });
    writeUriRoute({
      page: current.routePage,
      number: current.number,
      position: current.routePosition,
    });
  }

  function closeModal() {
    clearPersistedOpenModal();
    clearUriRoute();
    current = {
      open: false,
      loading: false,
      error: null,
      detail: null,
      owner: null,
      repo: null,
      number: null,
      routePage: null,
      routePosition: null,
    };
    render();
  }

  async function openModal({ owner, repo, number, page = null, position = null }) {
    if (!hostEnabled) return;
    const key = detailKey(owner, repo, number);
    const peeked = detailCache.peek(key);
    const cached = peeked.value;

    current = {
      open: true,
      loading: true,
      error: null,
      detail: cached || null,
      owner,
      repo,
      number,
      routePage: page || null,
      routePosition: position || null,
    };
    persistOpenModal(owner, repo, number, { page, position });
    writeUriRoute({ page: page || 'conversation', number, position });
    render();

    // Fresh cache: still revalidate in background (SWR)
    try {
      if (!globalThis.PRTreeFetch?.fetchPrDetail) {
        throw new Error('PR detail bridge unavailable');
      }
      const detail = await globalThis.PRTreeFetch.fetchPrDetail(
        owner,
        repo,
        number
      );
      if (
        current.open &&
        current.owner === owner &&
        current.repo === repo &&
        Number(current.number) === Number(number)
      ) {
        current.loading = false;
        current.detail = detail;
        current.error = null;
        detailCache.set(key, detail);
        render();
      }
    } catch (err) {
      if (current.open) {
        current.loading = false;
        // Keep stale detail if revalidation fails
        if (!current.detail) {
          current.error = err?.message || String(err);
        } else {
          current.error = null;
        }
        render();
      }
    }
  }

  /**
   * After stack tree is applied on /pulls, reopen the modal that was open before refresh.
   * Priority: sessionStorage open snap > URI (pr+number / page / position).
   * Diff/conversation layout also restored inside App via loadSessionView + initialRoute.
   */
  async function tryRestoreOpenModal() {
    if (!hostEnabled) return { ok: false, reason: 'disabled' };
    if (!isPullsListPage()) return { ok: false, reason: 'not-pulls' };
    if (current.open) return { ok: true, reason: 'already-open' };

    const path = location.pathname || '';
    const m = path.match(/^\/([^/]+)\/([^/]+)\/pulls/);
    if (!m) return { ok: false, reason: 'path' };
    const pathOwner = m[1];
    const pathRepo = m[2];

    const sess = sessionApi();
    const uri = uriApi();
    let sessionOpen = null;
    if (typeof sessionStorage !== 'undefined' && sess?.loadOpenModal) {
      sessionOpen = sess.loadOpenModal(sessionStorage);
    }
    let sessionView = null;
    if (
      sessionOpen &&
      typeof sessionStorage !== 'undefined' &&
      sess?.loadSessionView
    ) {
      sessionView = sess.loadSessionView(
        sessionStorage,
        sessionOpen.owner,
        sessionOpen.repo,
        sessionOpen.number
      );
    }
    const uriRoute =
      typeof uri?.parseLocationRoute === 'function'
        ? uri.parseLocationRoute(typeof location !== 'undefined' ? location : null)
        : { page: null, number: null, position: null };

    const resolved =
      typeof uri?.resolveRestore === 'function'
        ? uri.resolveRestore({
            sessionOpen,
            sessionView,
            uri: uriRoute,
            pathOwner,
            pathRepo,
          })
        : sessionOpen
          ? {
              open: sessionOpen,
              page: sessionOpen.page || null,
              position: sessionOpen.position || null,
              source: 'session',
            }
          : { open: null, page: null, position: null, source: 'none' };

    if (!resolved.open) return { ok: false, reason: 'none' };

    // Session restore must match current pulls list repo
    if (resolved.source === 'session') {
      if (
        pathOwner.toLowerCase() !== String(resolved.open.owner).toLowerCase() ||
        pathRepo.toLowerCase() !== String(resolved.open.repo).toLowerCase()
      ) {
        return { ok: false, reason: 'repo-mismatch' };
      }
    }

    await openModal({
      owner: resolved.open.owner,
      repo: resolved.open.repo,
      number: resolved.open.number,
      page: resolved.page,
      position: resolved.position,
    });
    return {
      ok: true,
      owner: resolved.open.owner,
      repo: resolved.open.repo,
      number: resolved.open.number,
      page: resolved.page,
      position: resolved.position,
      source: resolved.source,
    };
  }

  function setEnabled(enabled) {
    hostEnabled = Boolean(enabled);
    if (!hostEnabled) {
      // Tear down modal + stop intercepting so GitHub is fully native
      if (current.open) {
        clearUriRoute();
        current = {
          open: false,
          loading: false,
          error: null,
          detail: null,
          owner: null,
          repo: null,
          number: null,
          routePage: null,
          routePosition: null,
        };
        render();
      }
    }
  }

  function parsePrFromAnchor(anchor) {
    if (!anchor || !anchor.getAttribute) return null;
    const href = anchor.getAttribute('href') || '';
    const m = href.match(/\/?([^/]+)\/([^/]+)\/pull\/(\d+)(?:\/|$|\?|#)/);
    if (!m) return null;
    return { owner: m[1], repo: m[2], number: Number(m[3]) };
  }

  function isPullsListPage() {
    return /\/[^/]+\/[^/]+\/pulls/.test(location.pathname || '');
  }

  function onClickCapture(event) {
    if (!hostEnabled) return;
    if (!isPullsListPage()) return;
    if (event.defaultPrevented) return;
    if (event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    const path =
      typeof event.composedPath === 'function' ? event.composedPath() : [];
    const nodes = path.length ? path : [event.target];
    let anchor = null;
    for (const n of nodes) {
      if (
        n &&
        n.tagName === 'A' &&
        n.getAttribute?.('href')?.includes('/pull/')
      ) {
        anchor = n;
        break;
      }
      if (n?.closest) {
        const a = n.closest('a[href*="/pull/"]');
        if (a) {
          anchor = a;
          break;
        }
      }
    }
    if (!anchor) return;

    const parsed = parsePrFromAnchor(anchor);
    if (!parsed) return;

    const inRow = anchor.closest(
      '.js-issue-row, [id^="issue_"], li[role="listitem"], .js-navigation-container'
    );
    const looksLikeTitle =
      anchor.classList.contains('js-navigation-open') ||
      anchor.classList.contains('markdown-title') ||
      Boolean(anchor.id?.endsWith('_link')) ||
      Boolean(inRow);

    if (!looksLikeTitle) return;

    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === 'function') {
      event.stopImmediatePropagation();
    }
    void openModal(parsed);
  }

  function install() {
    document.addEventListener('click', onClickCapture, true);
    // After stack tree bootstrap (or re-apply), restore open modal + session view
    window.addEventListener('pr-plus-stack-ready', () => {
      if (!hostEnabled) return;
      void tryRestoreOpenModal();
    });
  }

  globalThis.PRModalHost = {
    install,
    openModal,
    closeModal,
    tryRestoreOpenModal,
    persistRouteState,
    setEnabled,
    isEnabled: () => hostEnabled,
    parsePrFromAnchor,
    isPullsListPage,
    _getState: () => ({ ...current, hostEnabled }),
    _detailCache: detailCache,
  };

  install();
})();
