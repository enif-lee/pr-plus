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
  /**
   * Monotonic generation for detail fetches. Parallel soft-refreshes after meta
   * writes used to complete out of order and resurrect stale assignees/labels.
   */
  let detailFetchGen = 0;
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
    /**
     * Progressive load UI: { busy: boolean, label: string|null, phase: string|null }
     * Shown as top bar + stage caption during initial/partial loads.
     */
    loadStage: null,
  };

  function setLoadStage(phase, label, busy = true) {
    current.loadStage =
      phase || label
        ? { phase: phase || null, label: label || null, busy: Boolean(busy) }
        : null;
  }

  function clearLoadStage() {
    current.loadStage = null;
  }

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
      loadStage: current.loadStage,
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
        const gen = ++detailFetchGen;
        detailCache.invalidate?.(key);
        current.error = null;
        setLoadStage('refresh', 'Refreshing pull request…', true);
        render();
        try {
          // Soft refresh: core + first threads page only (same as open)
          const detail = await globalThis.PRTreeFetch.fetchPrDetail(
            owner,
            repo,
            number,
            { threadsMaxPages: 1 }
          );
          if (gen !== detailFetchGen) return;
          if (
            current.open &&
            current.owner === owner &&
            current.repo === repo &&
            Number(current.number) === Number(number)
          ) {
            current.loading = false;
            current.detail = detail;
            current.error = null;
            clearLoadStage();
            detailCache.set(key, detail);
            render();
          }
        } catch (err) {
          if (gen !== detailFetchGen) return;
          if (current.open) {
            current.loading = false;
            current.error = err?.message || String(err);
            clearLoadStage();
            render();
          }
        }
      },
      /**
       * Lazy GraphQL page of review threads (middle fold / dual-window).
       * @param {'older'|'newer'|'all'|string} [direction]
       *   older/newer: one page toward the gap
       *   all: keep paging until hasMore is false (full comment/thread corpus)
       */
      onLoadMoreReviewThreads: async (direction) => {
        if (!owner || !repo || !number) return null;
        if (!globalThis.PRTreeFetch?.fetchReviewThreadsPage) return null;
        if (!current.detail) return null;
        const loadAll =
          direction === 'all' ||
          direction === true ||
          (direction && String(direction).toLowerCase() === 'all');
        const gen = detailFetchGen;
        const mergeFn =
          globalThis.PRTreeFetch?.mergeReviewThreadsPageIntoDetail || null;

        const pickDirection = (meta) => {
          if (meta.hasOlder) return 'older';
          if (meta.hasNewerFromOldest) return 'newer';
          return null;
        };
        const cursorFor = (meta, dir) =>
          dir === 'older' || dir === 'newest'
            ? meta.newestStartCursor || meta.endCursor || null
            : meta.oldestEndCursor || null;

        const loadOnePage = async (detailSnap) => {
          const meta = detailSnap.reviewThreadsMeta || {};
          if (!meta.hasMore) return { detail: detailSnap, progressed: false };
          let dir = String(direction || '').toLowerCase();
          if (loadAll || !['older', 'newer', 'oldest', 'newest'].includes(dir)) {
            dir = pickDirection(meta);
          }
          if (!dir) return { detail: detailSnap, progressed: false };
          if (
            (dir === 'older' || dir === 'newest') &&
            !meta.hasOlder &&
            meta.hasNewerFromOldest
          ) {
            dir = 'newer';
          }
          if (
            (dir === 'newer' || dir === 'oldest') &&
            !meta.hasNewerFromOldest &&
            meta.hasOlder
          ) {
            dir = 'older';
          }
          const cursor = cursorFor(meta, dir);
          const beforeCount = Number(meta.loadedThreadCount) || 0;
          const page = await globalThis.PRTreeFetch.fetchReviewThreadsPage(
            owner,
            repo,
            number,
            { direction: dir, cursor }
          );
          if (gen !== detailFetchGen) return { detail: null, progressed: false };
          let next = detailSnap;
          if (typeof mergeFn === 'function') {
            next = mergeFn(detailSnap, page, dir);
          }
          const afterCount =
            Number(next?.reviewThreadsMeta?.loadedThreadCount) || 0;
          return {
            detail: next,
            progressed: afterCount > beforeCount || Boolean(page?.threads?.length),
          };
        };

        let meta0 = current.detail.reviewThreadsMeta || {};
        if (!meta0.hasMore) return current.detail;

        const totalHint = Number(meta0.totalCount) || 0;
        const hidden0 = Number(meta0.hiddenCount) || 0;
        setLoadStage(
          'threads',
          loadAll
            ? `Loading all review comments… (${hidden0 || '?'} remaining)`
            : hidden0 > 0
              ? `Loading more review threads… (${hidden0} still hidden)`
              : `Loading more review threads… (${meta0.loadedThreadCount || 0} loaded)`,
          true
        );
        render();

        try {
          // Single page (timeline gap) or drain dual-window until complete
          const maxPages = loadAll ? 80 : 1;
          let next = current.detail;
          let pages = 0;
          while (pages < maxPages) {
            const meta = next.reviewThreadsMeta || {};
            if (!meta.hasMore) break;
            const hidden = Number(meta.hiddenCount) || 0;
            const loaded = Number(meta.loadedThreadCount) || 0;
            if (loadAll) {
              setLoadStage(
                'threads',
                totalHint > 0
                  ? `Loading all review comments… ${loaded}/${totalHint}`
                  : `Loading all review comments… ${loaded} loaded${
                      hidden > 0 ? `, ${hidden} remaining` : ''
                    }`,
                true
              );
              render();
            }
            const step = await loadOnePage(next);
            if (gen !== detailFetchGen) return null;
            if (!current.open || Number(current.number) !== Number(number)) {
              return null;
            }
            if (!step.detail) return null;
            next = step.detail;
            current.detail = next;
            detailCache.set(detailKey(owner, repo, number), next);
            pages += 1;
            if (!loadAll) break;
            if (!step.progressed) break;
            if (!(next.reviewThreadsMeta || {}).hasMore) break;
          }
          clearLoadStage();
          render();
          return next;
        } catch (err) {
          if (current.open) {
            setLoadStage(
              'threads',
              err?.message ||
                (loadAll
                  ? 'Failed to load all comments'
                  : 'Failed to load more threads'),
              false
            );
            render();
          }
          return null;
        }
      },
      /**
       * Patch in-memory detail + cache after a successful meta write so a
       * remount / soft refresh does not resurrect pre-write assignees/labels.
       */
      onPatchDetail: (patch) => {
        if (!patch || typeof patch !== 'object') return;
        if (!current.open || !current.detail) return;
        if (
          owner &&
          repo &&
          number &&
          (current.owner !== owner ||
            current.repo !== repo ||
            Number(current.number) !== Number(number))
        ) {
          return;
        }
        // Supersede in-flight soft-refreshes that started before this write so
        // their responses cannot resurrect pre-write assignees/labels.
        detailFetchGen += 1;
        const next = {
          ...current.detail,
          ...patch,
          avatarUrls: {
            ...(current.detail.avatarUrls || {}),
            ...(patch.avatarUrls && typeof patch.avatarUrls === 'object'
              ? patch.avatarUrls
              : {}),
          },
          // Meta lock is React-local only; never stick it in the SWR cache.
          _metaSeq: 0,
        };
        // Explicit empty arrays must win (spread alone is fine; keep intent clear)
        if (Object.prototype.hasOwnProperty.call(patch, 'assignees')) {
          next.assignees = Array.isArray(patch.assignees) ? patch.assignees : [];
        }
        if (Object.prototype.hasOwnProperty.call(patch, 'labels')) {
          next.labels = Array.isArray(patch.labels) ? patch.labels : [];
        }
        current.detail = next;
        try {
          const key = detailKey(current.owner, current.repo, current.number);
          detailCache.set(key, next);
        } catch {
          /* ignore */
        }
        render();
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
      loadStage: null,
    };
    render();
  }

  async function openModal({ owner, repo, number, page = null, position = null }) {
    if (!hostEnabled) return;
    const key = detailKey(owner, repo, number);
    const peeked = detailCache.peek(key);
    const cached = peeked.value;
    const gen = ++detailFetchGen;

    current = {
      open: true,
      loading: !cached,
      error: null,
      detail: cached || null,
      owner,
      repo,
      number,
      routePage: page || null,
      routePosition: position || null,
      loadStage: {
        phase: 'core',
        label: cached ? 'Refreshing pull request…' : 'Loading pull request…',
        busy: true,
      },
    };
    persistOpenModal(owner, repo, number, { page, position });
    writeUriRoute({ page: page || 'conversation', number, position });
    render();

    try {
      if (!globalThis.PRTreeFetch?.fetchPrDetail) {
        throw new Error('PR detail bridge unavailable');
      }

      async function fetchDetailOnce(opts) {
        let lastErr;
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            return await globalThis.PRTreeFetch.fetchPrDetail(
              owner,
              repo,
              number,
              opts
            );
          } catch (err) {
            lastErr = err;
            const msg = String(err?.message || err || '');
            if (
              attempt === 0 &&
              /message channel closed|Receiving end does not exist|Background worker offline|Extension context invalidated/i.test(
                msg
              )
            ) {
              await new Promise((r) => setTimeout(r, 200));
              continue;
            }
            throw err;
          }
        }
        throw lastErr || new Error('Failed to fetch PR detail');
      }

      // Phase 1: core PR (no threads) — paint header / description / issue comments fast
      setLoadStage('core', 'Loading pull request…', true);
      render();
      let detail = await fetchDetailOnce({ skipReviewThreads: true });
      if (gen !== detailFetchGen) return;
      if (
        !(
          current.open &&
          current.owner === owner &&
          current.repo === repo &&
          Number(current.number) === Number(number)
        )
      ) {
        return;
      }
      current.loading = false;
      current.detail = detail;
      current.error = null;
      setLoadStage('threads', 'Loading review threads…', true);
      detailCache.set(key, detail);
      render();

      // Phase 2: dual-window GraphQL threads — newest (last) + oldest (first) when large
      if (globalThis.PRTreeFetch.fetchReviewThreadsPage) {
        try {
          const mergeFn =
            globalThis.PRTreeFetch.mergeReviewThreadsPageIntoDetail || null;
          const newest = await globalThis.PRTreeFetch.fetchReviewThreadsPage(
            owner,
            repo,
            number,
            { direction: 'newest', cursor: null }
          );
          if (gen !== detailFetchGen) return;
          if (
            !(
              current.open &&
              Number(current.number) === Number(number) &&
              current.detail
            )
          ) {
            return;
          }
          let next =
            typeof mergeFn === 'function'
              ? mergeFn(current.detail, newest, 'newest')
              : current.detail;
          // Seed oldest end when more than one window of threads
          const totalCount =
            typeof newest.totalCount === 'number'
              ? newest.totalCount
              : newest.threads?.length || 0;
          const pageLen = newest.threads?.length || 0;
          if (totalCount > pageLen && newest.hasPreviousPage) {
            try {
              const oldest = await globalThis.PRTreeFetch.fetchReviewThreadsPage(
                owner,
                repo,
                number,
                { direction: 'oldest', cursor: null, pageSize: 20 }
              );
              if (gen === detailFetchGen && typeof mergeFn === 'function') {
                next = mergeFn(next, oldest, 'oldest');
              }
            } catch {
              /* keep newest-only window */
            }
          }
          if (gen !== detailFetchGen) return;
          if (
            current.open &&
            Number(current.number) === Number(number) &&
            current.detail
          ) {
            detail = next;
            current.detail = detail;
            detailCache.set(key, detail);
            // Initial dual-window load done — hide top bar / stage caption.
            // Remaining threads use the Conversation "Load more…" gap, not the bar.
            clearLoadStage();
            render();
          }
        } catch (threadErr) {
          // Core already painted — keep it; surface soft stage error
          if (gen === detailFetchGen && current.open) {
            setLoadStage(
              'threads',
              threadErr?.message || 'Review threads failed to load',
              false
            );
            render();
          }
        }
      } else {
        clearLoadStage();
        render();
      }
    } catch (err) {
      if (gen !== detailFetchGen) return;
      if (current.open) {
        current.loading = false;
        if (!current.detail) {
          current.error = err?.message || String(err);
        }
        clearLoadStage();
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
          loadStage: null,
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
    // Back/forward cache can restore a frozen modal without re-running content
    // scripts — pending review rows then look missing until a soft refresh.
    window.addEventListener('pageshow', (event) => {
      if (!event?.persisted) return;
      if (!hostEnabled || !current.open) return;
      if (!current.owner || !current.repo || current.number == null) return;
      const props = buildProps();
      if (typeof props.onRefresh === 'function') {
        void props.onRefresh();
      }
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
