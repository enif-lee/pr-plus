// TypeScript SoT — assembled by build scripts (classic runtime JS emit)

  const PULLS_PALETTE_ROOT_ID = 'prp-pulls-palette';
  let pullsPaletteOpen = false;
  let pullsPaletteQuery = '';
  let pullsPaletteFocusIndex = 0;
  /** @type {Array|null} */
  let pullsPaletteItems = null;
  /** Snapshot of list-row focus number so Esc can restore it */
  let pullsPaletteSavedListFocus = null;
  let pullsPaletteRoot = null;
  /** @type {null|(() => void)} */
  let pullsPaletteScrollbarDestroy = null;
  /** Async PR-search (`#…`) state */
  let pullsPalettePrSearchAsyncHits = [];
  let pullsPalettePrSearchLoading = false;
  let pullsPalettePrSearchError = null;
  /** @type {AbortController|null} */
  let pullsPalettePrSearchAbort = null;
  let pullsPalettePrSearchSeq = 0;
  let pullsPalettePrSearchTimer = null;

  function pullsPaletteApi() {
    return globalThis.PRPullsPalette || null;
  }

  function isPullsPaletteOpen() {
    return Boolean(pullsPaletteOpen);
  }

  function getViewerLoginForPalette() {
    const api = pullsPaletteApi();
    if (typeof api?.readViewerLoginFromDocument === 'function') {
      try {
        const v = api.readViewerLoginFromDocument(document);
        if (v) return v;
      } catch {
        /* ignore */
      }
    }
    try {
      return (
        document
          .querySelector('meta[name="user-login"]')
          ?.getAttribute('content') || ''
      );
    } catch {
      return '';
    }
  }

  function getRepoForPalette() {
    const dom = listDomApi();
    if (typeof dom?.parseRepoFromPathname === 'function') {
      try {
        const r = dom.parseRepoFromPathname(location.pathname || '');
        if (r?.owner && r?.repo) return r;
      } catch {
        /* ignore */
      }
    }
    const m = String(location.pathname || '').match(
      /^\/([^/]+)\/([^/]+)\/pulls(?:\/|$)/
    );
    if (!m) return { owner: '', repo: '' };
    return { owner: m[1], repo: m[2] };
  }

  function getWebOrigin() {
    try {
      return location.origin || 'https://github.com';
    } catch {
      return 'https://github.com';
    }
  }

  function rebuildPullsPaletteItems() {
    const api = pullsPaletteApi();
    const prs = resolveOpenPulls();
    const repo = getRepoForPalette();
    const viewer = getViewerLoginForPalette();
    if (typeof api?.buildPullsPaletteItems === 'function') {
      pullsPaletteItems = api.buildPullsPaletteItems(prs, {
        query: pullsPaletteQuery,
        viewerLogin: viewer,
        owner: repo.owner,
        repo: repo.repo,
        webOrigin: getWebOrigin(),
        asyncHits: pullsPalettePrSearchAsyncHits,
        prSearchLoading: pullsPalettePrSearchLoading,
        prSearchError: pullsPalettePrSearchError,
      });
    } else {
      pullsPaletteItems = [];
    }
    const n = pullsPaletteItems.length;
    if (n === 0) {
      pullsPaletteFocusIndex = -1;
    } else if (
      pullsPaletteFocusIndex < 0 ||
      pullsPaletteFocusIndex >= n
    ) {
      pullsPaletteFocusIndex = 0;
    }
    return pullsPaletteItems;
  }

  function resetPullsPalettePrSearch() {
    pullsPalettePrSearchAsyncHits = [];
    pullsPalettePrSearchLoading = false;
    pullsPalettePrSearchError = null;
    pullsPalettePrSearchSeq += 1;
    try {
      pullsPalettePrSearchAbort?.abort?.();
    } catch {
      /* ignore */
    }
    pullsPalettePrSearchAbort = null;
    if (pullsPalettePrSearchTimer != null) {
      try {
        clearTimeout(pullsPalettePrSearchTimer);
      } catch {
        /* ignore */
      }
      pullsPalettePrSearchTimer = null;
    }
  }

  /**
   * Cache-first PR search already applied via buildPullsPaletteItems; kick a
   * debounced network re-fetch of open pulls and merge extra matches.
   * Bare `#` / `#$` (empty term) stays cache-only — no network until the user
   * types a non-empty term after the prefix (still debounced).
   */
  function schedulePullsPalettePrSearch() {
    const api = pullsPaletteApi();
    const parsed =
      typeof api?.parsePalettePrSearchQuery === 'function'
        ? api.parsePalettePrSearchQuery(pullsPaletteQuery)
        : { isPrSearch: false, term: '' };
    if (!parsed.isPrSearch) {
      resetPullsPalettePrSearch();
      return;
    }
    // Drop prior async hits (stale term) immediately
    pullsPalettePrSearchAsyncHits = [];
    pullsPalettePrSearchError = null;
    if (pullsPalettePrSearchTimer != null) {
      try {
        clearTimeout(pullsPalettePrSearchTimer);
      } catch {
        /* ignore */
      }
      pullsPalettePrSearchTimer = null;
    }
    try {
      pullsPalettePrSearchAbort?.abort?.();
    } catch {
      /* ignore */
    }
    pullsPalettePrSearchAbort = null;
    const term = String(parsed.term || '');
    const kickAsync =
      typeof api?.shouldKickPrSearchAsync === 'function'
        ? api.shouldKickPrSearchAsync(term)
        : term.trim().length > 0;
    if (!kickAsync) {
      // Bare prefix: cache-only, no loading spinner / network
      pullsPalettePrSearchLoading = false;
      pullsPalettePrSearchSeq += 1;
      return;
    }
    pullsPalettePrSearchLoading = true;
    const seq = ++pullsPalettePrSearchSeq;
    pullsPalettePrSearchTimer = setTimeout(() => {
      pullsPalettePrSearchTimer = null;
      void runPullsPalettePrSearchAsync(term, seq);
    }, 180);
  }

  async function runPullsPalettePrSearchAsync(term, seq) {
    if (seq !== pullsPalettePrSearchSeq) return;
    const repo = getRepoForPalette();
    if (!repo.owner || !repo.repo) {
      if (seq === pullsPalettePrSearchSeq) {
        pullsPalettePrSearchLoading = false;
        paintPullsPalette();
      }
      return;
    }
    try {
      pullsPalettePrSearchAbort?.abort?.();
    } catch {
      /* ignore */
    }
    const ac =
      typeof AbortController !== 'undefined' ? new AbortController() : null;
    pullsPalettePrSearchAbort = ac;
    try {
      let remote = [];
      if (typeof globalThis.PRTreeFetch?.fetchOpenPulls === 'function') {
        const prs = await globalThis.PRTreeFetch.fetchOpenPulls(
          repo.owner,
          repo.repo,
          null,
          { signal: ac?.signal || null }
        );
        if (seq !== pullsPalettePrSearchSeq) return;
        const api = pullsPaletteApi();
        remote =
          typeof api?.matchCachedPrsForSearch === 'function'
            ? api.matchCachedPrsForSearch(prs || [], term)
            : Array.isArray(prs)
              ? prs
              : [];
      }
      if (seq !== pullsPalettePrSearchSeq) return;
      pullsPalettePrSearchAsyncHits = remote;
      pullsPalettePrSearchLoading = false;
      pullsPalettePrSearchError = null;
      paintPullsPalette();
    } catch (err) {
      if (seq !== pullsPalettePrSearchSeq) return;
      if (err?.name === 'AbortError' || ac?.signal?.aborted) return;
      pullsPalettePrSearchLoading = false;
      pullsPalettePrSearchError =
        err?.message || String(err || 'Search failed');
      paintPullsPalette();
    }
  }

