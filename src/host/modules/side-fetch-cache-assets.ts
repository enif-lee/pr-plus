  // continued host module segment
  function sessionApi() {
    return (globalThis as any).PRModalSessionView || null;
  }

  function uriApi() {
    return (globalThis as any).PRModalUriRoute || null;
  }

  function createFallbackCache() {
    const store = new Map();
    const TTL = 60_000;
    return {
      cacheKey(owner: any, repo: any, number: any) {
        return `${String(owner || '').toLowerCase()}/${String(repo || '').toLowerCase()}#${Number(number)}`;
      },
      peek(key: any) {
        const e = store.get(key);
        if (!e) return { value: null, fresh: false, stale: false, source: null };
        const fresh = e.expiresAt > Date.now();
        return { value: e.value, fresh, stale: !fresh, source: 'memory' };
      },
      async peekAsync(key: any) {
        return this.peek(key);
      },
      get(key: any) {
        const p = this.peek(key);
        return p.fresh ? p.value : null;
      },
      set(key: any, value: any) {
        store.set(key, { value, expiresAt: Date.now() + TTL });
      },
      invalidate(key: any) {
        store.delete(key);
      },
    };
  }

  function emptyPeek() {
    return { value: null as any, fresh: false, stale: false, source: null as any };
  }

  /** Sync memory only — never blocks paint. */
  function peekDetailMemory(key: any) {
    try {
      return detailCache.peek?.(key) || emptyPeek();
    } catch {
      return emptyPeek();
    }
  }

  /**
   * IDB hydrate with hard timeout so a large/slow read cannot freeze openModal.
   * @param {string} key
   * @param {number} [ms]
   */
  async function peekDetailIdb(key: any, ms = 800) {
    if (typeof detailCache.peekAsync !== 'function') return emptyPeek();
    try {
      const result = await Promise.race([
        detailCache.peekAsync(key),
        new Promise((resolve) => {
          setTimeout(() => resolve(emptyPeek()), ms);
        }),
      ]);
      return result && typeof result === 'object' ? result : emptyPeek();
    } catch {
      return emptyPeek();
    }
  }

  /**
   * Modal CSS readiness. Prefer content_scripts injection of pr-modal.css
   * (available before any click). Optional dynamic <link> is a backup only.
   * Hosts use data-prp-css-ready so FOUC gate does not hide a ready shell.
   */
  let modalCssReady = false;
  let modalCssReadyP: any = null;

  function markHostsCssReady() {
    modalCssReady = true;
    try {
      const ids = [HOST_ID, embedHostId()];
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el) el.setAttribute('data-prp-css-ready', '1');
      }
    } catch {
      /* ignore */
    }
  }

  function stampHostCssReady(host: any) {
    if (!host) return host;
    // Manifest content_scripts CSS is present at document_idle — stamp ready so
    // list sketch first paint is never delayed by the FOUC opacity gate.
    try {
      host.setAttribute('data-prp-css-ready', '1');
    } catch {
      /* ignore */
    }
    modalCssReady = true;
    return host;
  }

  /**
   * Ensure modal CSS is available. Does not block openModal first paint.
   * @returns {Promise<boolean>}
   */
  function ensureAssets() {
    // Content-script CSS (manifest) already applied before JS — mark ready now.
    if (!modalCssReady) markHostsCssReady();
    if (document.getElementById('prp-modal-css')) {
      return Promise.resolve(true);
    }
    if (modalCssReadyP) return modalCssReadyP;

    modalCssReadyP = new Promise((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        markHostsCssReady();
        resolve(true);
      };

      try {
        const link = document.createElement('link');
        link.id = 'prp-modal-css';
        link.rel = 'stylesheet';
        link.setAttribute('data-prp-asset', 'modal-css');
        link.href = chrome.runtime.getURL('src/modal/dist/pr-modal.css');
        link.addEventListener('load', done, { once: true });
        link.addEventListener('error', done, { once: true });
        (document.head || document.documentElement).appendChild(link);
        try {
          if (link.sheet) done();
        } catch {
          /* ignore */
        }
        setTimeout(done, 0);
      } catch {
        done();
      }
    });
    return modalCssReadyP;
  }

  function ensureHost() {
    // In-page embed mounts under GH main; list overlay uses documentElement host.
    if (isEmbedPresentation(current.presentation)) {
      return ensureEmbedHost();
    }
    void ensureAssets();
    let host = document.getElementById(HOST_ID);
    if (host) return stampHostCssReady(host);
    host = document.createElement('div');
    host.id = HOST_ID;
    document.documentElement.appendChild(host);
    return stampHostCssReady(host);
  }

  function detailKey(owner: any, repo: any, number: any) {
    return detailCache.cacheKey(owner, repo, number);
  }

  /**
   * Open-PR list for stack strip / branch picker.
   * Prefer the pulls-page tree cache; when opening from a PR page (embed) that
   * cache is empty, use a host-fetched list so Stack matches fullscreen.
   * @type {Array|null}
   */
  let openPullsFetched: any = null;
  /** @type {string} owner/repo key for openPullsFetched */
  let openPullsFetchedKey = '';
  /** @type {Promise<Array>|null} */
  let openPullsFetchP: any = null;
  /** epoch ms of last successful host open-list fetch for openPullsFetchedKey */
  let openPullsFetchedAt = 0;
  /** Monotonic gen — only the latest force/fetch may commit results */
  let openPullsFetchGen = 0;
  /** @type {AbortController|null} */
  let openPullsFetchAbort: any = null;
  /**
   * PR numbers removed by local lifecycle (merge/close) for the current
   * openPullsFetchedKey. Network open-list lag must not resurrect them.
   * @type {Set<number>}
   */
  let openPullsTombstones = new Set();
  /** Default SWR age for open list (force always bypasses). */
  const OPEN_PULLS_MAX_AGE_MS = 30_000;

  function openPullsLifecycleApi() {
    return (globalThis as any).PRModalOpenPullsLifecycle || null;
  }

  function resolveOpenPulls() {
    try {
      const app = (globalThis as any).__PR_TREE_APP__;
      const list = app?.getCachedPrs?.();
      if (Array.isArray(list) && list.length) {
        return filterOpenPullsLocal(list);
      }
    } catch {
      /* ignore */
    }
    if (Array.isArray(openPullsFetched) && openPullsFetched.length) {
      return filterOpenPullsLocal(openPullsFetched);
    }
    return [];
  }

  function filterOpenPullsLocal(prs: any) {
    const api = openPullsLifecycleApi();
    if (typeof api?.filterOpenPullsByTombstones === 'function') {
      return api.filterOpenPullsByTombstones(prs, openPullsTombstones);
    }
    if (!openPullsTombstones.size) {
      return Array.isArray(prs) ? prs.slice() : [];
    }
    return (Array.isArray(prs) ? prs : []).filter(
      (p) => !p || !openPullsTombstones.has(Number(p.number))
    );
  }

  /**
   * Drop host open-list cache (optionally scoped to owner/repo).
   * Does not clear tree cachedPrs — use applyOpenPullLifecycle / tree APIs.
   */
  function invalidateOpenPulls(owner?: string, repo?: string) {
    const o = String(owner || '').trim().toLowerCase();
    const r = String(repo || '').trim().toLowerCase();
    if (o && r) {
      const key = `${o}/${r}`;
      if (openPullsFetchedKey && openPullsFetchedKey !== key) {
        // Different repo still cached — leave it unless caller clears all
        return;
      }
    }
    openPullsFetched = null;
    openPullsFetchedKey = '';
    openPullsFetchedAt = 0;
    openPullsFetchP = null;
    openPullsFetchGen += 1;
    try {
      openPullsFetchAbort?.abort?.();
    } catch {
      /* ignore */
    }
    openPullsFetchAbort = null;
    // Keep tombstones for same-repo lag protection until reopen clears them
  }

  /**
   * Apply lifecycle mutation to tree list cache + host openPullsFetched.
   * merged/closed → remove; draft/state → patch row.
   * Uses shipped pure helpers when PRModalOpenPullsLifecycle is loaded.
   */
  function applyOpenPullLifecycle(
    owner: string,
    repo: string,
    number: number | string,
    patch: Record<string, unknown>
  ) {
    const n = Number(number);
    if (!Number.isFinite(n) || n <= 0) return;
    const o = String(owner || '').trim();
    const r = String(repo || '').trim();
    const key = `${o.toLowerCase()}/${r.toLowerCase()}`;
    const life = openPullsLifecycleApi();

    // Tombstones for force-fetch lag (pure policy)
    if (typeof life?.nextOpenPullTombstones === 'function') {
      openPullsTombstones = life.nextOpenPullTombstones(
        openPullsTombstones,
        n,
        patch
      );
    } else {
      const merged = patch?.merged === true;
      const state = String(patch?.state || '').toLowerCase();
      if (merged || state === 'closed') openPullsTombstones.add(n);
      else if (state === 'open' && patch?.merged !== true) {
        openPullsTombstones.delete(n);
      }
    }

    // Tree list (preferred by resolveOpenPulls)
    try {
      const app = (globalThis as any).__PR_TREE_APP__;
      const removes =
        typeof life?.lifecycleRemovesFromOpenList === 'function'
          ? life.lifecycleRemovesFromOpenList(patch)
          : patch?.merged === true ||
            String(patch?.state || '').toLowerCase() === 'closed';
      if (removes) {
        app?.removeCachedPr?.(n);
      } else if (typeof app?.patchCachedPr === 'function') {
        const field: Record<string, unknown> = {};
        if (typeof patch?.draft === 'boolean') field.draft = patch.draft;
        if (patch?.state != null) field.state = patch.state;
        if (typeof patch?.merged === 'boolean') field.merged = patch.merged;
        if (Object.keys(field).length) app.patchCachedPr(n, field);
      }
    } catch {
      /* ignore */
    }

    // Host fallback list via pure applyLifecycleToOpenPulls
    if (
      openPullsFetchedKey === key &&
      Array.isArray(openPullsFetched) &&
      openPullsFetched.length
    ) {
      if (typeof life?.applyLifecycleToOpenPulls === 'function') {
        const res = life.applyLifecycleToOpenPulls(
          openPullsFetched,
          n,
          patch
        );
        openPullsFetched = res.prs;
        if (!openPullsFetched.length) {
          openPullsFetched = null;
          openPullsFetchedAt = 0;
        }
      } else {
        const removes =
          patch?.merged === true ||
          String(patch?.state || '').toLowerCase() === 'closed';
        if (removes) {
          openPullsFetched = openPullsFetched.filter(
            (p) => !p || Number(p.number) !== n
          );
          if (!openPullsFetched.length) {
            openPullsFetched = null;
            openPullsFetchedAt = 0;
          }
        } else {
          openPullsFetched = openPullsFetched.map((p) => {
            if (!p || Number(p.number) !== n) return p;
            const next = { ...p };
            if (typeof patch?.draft === 'boolean') next.draft = patch.draft;
            if (patch?.state != null) next.state = patch.state;
            if (typeof patch?.merged === 'boolean') next.merged = patch.merged;
            return next;
          });
        }
      }
    }

    if (
      current.open &&
      String(current.owner || '').toLowerCase() === o.toLowerCase() &&
      String(current.repo || '').toLowerCase() === r.toLowerCase()
    ) {
      try {
        render();
      } catch {
        /* ignore */
      }
    }
  }

  /**
   * Ensure we have open PRs for stack strip when the list page never painted
   * (embed / direct PR URL / cold tab). Non-blocking; re-renders when ready.
   * @param {string} owner
   * @param {string} repo
   * @param {{ signal?: AbortSignal, force?: boolean }} [opts]
   */
  function ensureOpenPullsForStack(owner: any, repo: any, opts: any = {}) {
    const o = String(owner || '').trim();
    const r = String(repo || '').trim();
    if (!o || !r) return Promise.resolve([]);
    const key = `${o.toLowerCase()}/${r.toLowerCase()}`;
    const force = Boolean(opts.force);
    const cached = resolveOpenPulls();
    const now = Date.now();
    const ageOk =
      openPullsFetchedKey === key &&
      openPullsFetchedAt > 0 &&
      now - openPullsFetchedAt <= OPEN_PULLS_MAX_AGE_MS;

    // Serve warm cache only when a recent host fetch timestamp says so.
    // force / missing age / expired age → network. Lifecycle patches keep tree
    // in sync so resolveOpenPulls does not resurrect removed rows.
    if (!force && ageOk) {
      if (cached.length >= 2) return Promise.resolve(cached);
      if (
        openPullsFetchedKey === key &&
        Array.isArray(openPullsFetched) &&
        openPullsFetched.length
      ) {
        return Promise.resolve(filterOpenPullsLocal(openPullsFetched));
      }
    }

    if (openPullsFetchP && !force) return openPullsFetchP;
    if (!(globalThis as any).PRTreeFetch?.fetchOpenPulls) {
      return Promise.resolve(cached);
    }

    // Abort prior in-flight; only latest gen may commit
    try {
      openPullsFetchAbort?.abort?.();
    } catch {
      /* ignore */
    }
    const ac =
      typeof AbortController !== 'undefined' ? new AbortController() : null;
    openPullsFetchAbort = ac;
    const parentSignal = opts.signal || null;
    const onParentAbort = () => {
      try {
        ac?.abort?.();
      } catch {
        /* ignore */
      }
    };
    if (parentSignal) {
      if (parentSignal.aborted) onParentAbort();
      else {
        try {
          parentSignal.addEventListener?.('abort', onParentAbort, {
            once: true,
          });
        } catch {
          /* ignore */
        }
      }
    }

    const fetchGen = ++openPullsFetchGen;
    openPullsFetchP = (async () => {
      try {
        if (ac?.signal?.aborted) return cached;
        const prs = await (globalThis as any).PRTreeFetch.fetchOpenPulls(o, r, null, {
          signal: ac?.signal || null,
        });
        const life = openPullsLifecycleApi();
        const decision =
          typeof life?.acceptOpenPullsNetworkResult === 'function'
            ? life.acceptOpenPullsNetworkResult({
                fetchGen,
                currentGen: openPullsFetchGen,
                aborted: Boolean(ac?.signal?.aborted),
                networkPrs: prs,
                tombstones: openPullsTombstones,
              })
            : {
                ok:
                  fetchGen === openPullsFetchGen &&
                  !ac?.signal?.aborted &&
                  Array.isArray(prs),
                prs: filterOpenPullsLocal(Array.isArray(prs) ? prs : []),
              };
        if (!decision.ok) return cached;
        const next = decision.prs;
        openPullsFetched = next;
        openPullsFetchedKey = key;
        openPullsFetchedAt = Date.now();
        try {
          const app = (globalThis as any).__PR_TREE_APP__;
          if (typeof app?.replaceCachedPrs === 'function') {
            app.replaceCachedPrs(next, { owner: o, repo: r });
          }
        } catch {
          /* optional */
        }
        if (
          current.open &&
          String(current.owner || '').toLowerCase() === o.toLowerCase() &&
          String(current.repo || '').toLowerCase() === r.toLowerCase()
        ) {
          render();
        }
        return next;
      } catch {
        return cached;
      } finally {
        if (fetchGen === openPullsFetchGen) {
          openPullsFetchP = null;
        }
      }
    })();
    return openPullsFetchP;
  }

  /** Find a PR already loaded by the pulls-list stack (no extra network). */
  function findListPr(owner: any, repo: any, number: any) {
    const n = Number(number);
    if (!Number.isFinite(n) || n <= 0) return null;
    const o = String(owner || '').toLowerCase();
    const r = String(repo || '').toLowerCase();
    for (const p of resolveOpenPulls()) {
      if (!p || Number(p.number) !== n) continue;
      // List rows are for the current repo page; match number primarily
      if (p.owner && o && String(p.owner).toLowerCase() !== o) continue;
      if (p.repo && r && String(p.repo).toLowerCase() !== r) continue;
      return p;
    }
    return null;
  }

  /**
   * Minimal detail from list API row so header/title/body paint immediately.
   * Marked `_sketch: true` so later cache/network can upgrade freely.
   */
  function detailSketchFromList(listPr: any, owner: any, repo: any, number: any) {
    const n = Number(number);
    if (!Number.isFinite(n) || n <= 0) return null;
    const title =
      (listPr && String(listPr.title || '').trim()) || `Pull Request #${n}`;
    const body = listPr && listPr.body != null ? String(listPr.body) : '';
    const author = (listPr && listPr.author) || '';
    // Labels: normalize to { name, color, description }
    const labels = Array.isArray(listPr?.labels)
      ? listPr.labels
          .map((l: any) =>
            typeof l === 'string'
              ? { name: l, color: '', description: '' }
              : {
                  name: l?.name || '',
                  color: l?.color || '',
                  description: l?.description || '',
                }
          )
          .filter((l: any) => l.name)
      : [];
    // Assignees: login strings (MetaList shape)
    const assignees = Array.isArray(listPr?.assignees)
      ? listPr.assignees
          .map((u: any) => (typeof u === 'string' ? u : u?.login || ''))
          .filter(Boolean)
      : [];
    const requestedReviewers = Array.isArray(listPr?.requestedReviewers)
      ? listPr.requestedReviewers
          .map((u: any) => (typeof u === 'string' ? u : u?.login || ''))
          .filter(Boolean)
      : [];
    // Milestone: { number, title, state, dueOn }
    let milestone: any = null;
    if (listPr?.milestone && typeof listPr.milestone === 'object') {
      const m = listPr.milestone;
      if (m.number != null || m.title) {
        milestone = {
          number: m.number != null ? Number(m.number) : null,
          title: m.title || '',
          state: m.state || '',
          dueOn: m.dueOn || m.due_on || null,
        };
      }
    }
    const avatarUrls =
      listPr?.avatarUrls && typeof listPr.avatarUrls === 'object'
        ? { ...listPr.avatarUrls }
        : {};
    if (author && listPr?.authorAvatarUrl) {
      avatarUrls[String(author).toLowerCase()] = listPr.authorAvatarUrl;
    }
    return {
      owner: String(owner || ''),
      repo: String(repo || ''),
      number: n,
      nodeId: listPr?.nodeId || listPr?.node_id || null,
      title,
      body,
      state: 'open',
      draft: Boolean(listPr?.draft),
      author,
      authorAvatarUrl: listPr?.authorAvatarUrl || listPr?.avatarUrl || '',
      baseRef: listPr?.baseRef || '',
      headRef: listPr?.headRef || '',
      htmlUrl:
        listPr?.htmlUrl ||
        `https://github.com/${owner}/${repo}/pull/${n}`,
      merged: false,
      mergeable: null as any,
      labels,
      assignees,
      requestedReviewers,
      milestone,
      avatarUrls,
      files: [] as any[],
      comments: [] as any[],
      timelineEvents: [] as any[],
      reviews: [] as any[],
      reviewComments: [] as any[],
      reviewThreads: [] as any[],
      commits: [] as any[],
      checks: { state: 'unknown', totalCount: 0, statuses: [] as any[], checkRuns: [] as any[] },
      additions: listPr?.additions ?? null,
      deletions: listPr?.deletions ?? null,
      changedFiles: listPr?.changedFiles ?? null,
      subscribed: null as any,
      _sketch: true,
      _source: 'list',
    };
  }

  /**
   * Rank detail completeness for progressive upgrade decisions.
   * 0 empty · 1 list sketch · 2 core (no threads) · 3 cached/full with threads/files
   */
  function detailRank(d: any) {
    if (!d || typeof d !== 'object') return 0;
    if (d._sketch) return 1;
    const hasThreads =
      (Array.isArray(d.reviewComments) && d.reviewComments.length > 0) ||
      (Array.isArray(d.reviewThreads) && d.reviewThreads.length > 0);
    const hasFiles = Array.isArray(d.files) && d.files.length > 0;
    if (hasThreads || hasFiles) return 3;
    // Has real title body from network/cache without sketch flag
    if (d.title != null && !d._sketch) return 2;
    return 1;
  }

  /**
   * Newest reviewThreads fetch (GraphQL shell, page size 100).
   * Always PRRT_… ids; selective by-ids comments for unresolved.
   *
   * @param {string} owner
   * @param {string} repo
   * @param {number|string} number
   * @param {{
   *   signal?: AbortSignal|null,
   *   cacheDetail?: any,
   *   forceFull?: boolean,
   * }} [opts]
   * @returns {Promise<{
   *   page: any,
   *   pageSize: number,
   *   warm: boolean,
   *   escalated: boolean,
   *   earlyExit: boolean,
   * }>}
   */
  async function fetchNewestReviewThreadsAdaptive(
    owner: any,
    repo: any,
    number: any,
    opts: any = {}
  ) {
    const signal = opts?.signal || null;
    const cacheDetail = opts?.cacheDetail || null;
    const forceFull = Boolean(opts?.forceFull);
    const RT =
      typeof globalThis !== 'undefined' && (globalThis as any).PRModalReviewThreads
        ? (globalThis as any).PRModalReviewThreads
        : {};
    const apiMax = Number(RT.REVIEW_THREADS_PAGE_SIZE) || Number(RT.REVIEW_THREADS_API_MAX) || 100;
    const probeN = Number(RT.REVIEW_THREADS_WARM_PROBE_SIZE) || apiMax;
    const hasWarm =
      !forceFull &&
      (typeof RT.hasUsableReviewThreadsCache === 'function'
        ? Boolean(RT.hasUsableReviewThreadsCache(cacheDetail))
        : Boolean(
            cacheDetail &&
              !cacheDetail._sketch &&
              ((Array.isArray(cacheDetail.reviewThreads) &&
                cacheDetail.reviewThreads.some((t: any) => t?.threadNodeId)) ||
                (Array.isArray(cacheDetail.reviewComments) &&
                  cacheDetail.reviewComments.some((c: any) => c?.threadNodeId)))
          ));
    const pageSize =
      typeof RT.pickNewestThreadsPageSize === 'function'
        ? Number(
            RT.pickNewestThreadsPageSize({
              warmCache: hasWarm,
              forceFull,
            })
          ) || (hasWarm ? probeN : apiMax)
        : hasWarm
          ? probeN
          : apiMax;

    // GraphQL-first shell (page size 100) + PRRT_; selective comments bulk.
    const reviewCommentsCount = (() => {
      const d = cacheDetail;
      if (d && d.reviewCommentsCount != null && Number.isFinite(Number(d.reviewCommentsCount))) {
        return Number(d.reviewCommentsCount);
      }
      return null;
    })();
    const fetchPage = (size: any, transport: any = {}) =>
      (globalThis as any).PRTreeFetch.fetchReviewThreadsPage(owner, repo, number, {
        direction: 'newest',
        cursor: null,
        pageSize: size,
        signal,
        preferRest: false,
        forceGraphql: true,
        forceFull: Boolean(forceFull),
        // Shell only — host runs eager by-ids so progress can mark
        // threads → comments → reactions as separate bar steps.
        skipEagerComments: true,
        reviewCommentsCount,
      });

    /** Host-side REST page when SW GraphQL path is gated / empty. */
    async function restPageFromComments() {
      try {
        const F = (globalThis as any).PRTreeFetch;
        if (typeof F?.fetchPrCommentsPage !== 'function') return null;
        const restPage = await F.fetchPrCommentsPage(owner, repo, number, {
          kind: 'review',
          page: 1,
          perPage: Number(RT.REVIEW_THREADS_PAGE_SIZE) || 100,
          preferNewest: true,
          signal,
        });
        const items = Array.isArray(restPage?.items) ? restPage.items : [];
        if (!items.length) return null;
        const build =
          typeof RT.buildRestReviewThreadsPageFromComments === 'function'
            ? RT.buildRestReviewThreadsPageFromComments
            : null;
        if (!build) {
          // Minimal synthetic page so Diff can group from comments
          return {
            threads: items
              .filter((c: any) => c && c.id != null && c.inReplyToId == null)
              .map((r: any) => ({
                threadNodeId:
                  r.threadNodeId || r.nodeId || `rest-thread-${r.id}`,
                resolved: Boolean(r.resolved),
                outdated: Boolean(r.outdated),
                path: r.path || '',
                line: r.line ?? r.originalLine ?? null,
                startLine: r.startLine ?? null,
                side: r.side || 'RIGHT',
                commentIds: [r.id],
                loadWindow: 'newest',
              })),
            comments: items,
            totalCount: items.length,
            hasMore: false,
            pageCount: 1,
            direction: 'newest',
            window: 'newest',
            source: 'rest',
          };
        }
        const page = build(items, 'newest');
        return page ? { ...page, source: 'rest' } : null;
      } catch (err) {
        if (
          err?.name === 'AbortError' ||
          /aborted|AbortError/i.test(String(err?.message || ''))
        ) {
          throw err;
        }
        console.log(
          `[pr-plus] host REST threads fallback soft-fail: ${err?.message || err}`
        );
        return null;
      }
    }

    const pageHasData = (p: any) =>
      (Array.isArray(p?.threads) && p.threads.length > 0) ||
      (Array.isArray(p?.comments) && p.comments.length > 0);

    let page: any = null;
    let escalated = false;
    let earlyExit = false;
    let hostRestFallback = false;
    /** Bound GraphQL shell so a stuck SW channel cannot leave openModal threads forever. */
    const SHELL_TIMEOUT_MS = 8_000;
    const fetchPageBounded = async (size: number, transport: any = {}) => {
      let timer: ReturnType<typeof setTimeout> | null = null;
      try {
        return await Promise.race([
          fetchPage(size, transport),
          new Promise((_, reject) => {
            timer = setTimeout(() => {
              const err: any = new Error(
                `reviewThreads shell timed out after ${SHELL_TIMEOUT_MS}ms`
              );
              err.status = 408;
              reject(err);
            }, SHELL_TIMEOUT_MS);
          }),
        ]);
      } finally {
        if (timer) clearTimeout(timer);
      }
    };
    try {
      page = await fetchPageBounded(pageSize);
    } catch (err) {
      if (
        err?.name === 'AbortError' ||
        /aborted|AbortError/i.test(String(err?.message || ''))
      ) {
        throw err;
      }
      // GraphQL remaining=0 / SW hang / throw → host REST comments fallback.
      console.log(
        `[pr-plus] fetchNewestReviewThreadsAdaptive primary fail: ${err?.message || err}`
      );
      page = null;
    }

    let fromRest = page?.source === 'rest';
    let hasData = pageHasData(page);

    // GraphQL shell success — done (PRRT always on graphql pages).
    if (hasData && page?.source === 'graphql') {
      earlyExit = true;
    } else if (hasWarm && pageSize < apiMax && hasData) {
      const shouldEsc =
        typeof RT.shouldEscalateNewestThreadsProbe === 'function'
          ? Boolean(
              RT.shouldEscalateNewestThreadsProbe(page, cacheDetail, pageSize)
            )
          : true;
      if (shouldEsc) {
        try {
          page = await fetchPageBounded(apiMax, { forceGraphql: true });
          escalated = true;
          fromRest = page?.source === 'rest';
          hasData = pageHasData(page);
        } catch {
          /* keep probe page */
        }
      } else {
        earlyExit = true;
      }
    }

    // REST fallback when GraphQL empty, timed out, or never returned PRRT shells.
    // (E2e / flaky SW: GraphQL cost log may show shell while content channel stalls.)
    if (!hasData) {
      try {
        let restTimer: ReturnType<typeof setTimeout> | null = null;
        const rest = await Promise.race([
          restPageFromComments(),
          new Promise((_, reject) => {
            restTimer = setTimeout(() => {
              const err: any = new Error(
                `reviewThreads REST fallback timed out after ${SHELL_TIMEOUT_MS}ms`
              );
              err.status = 408;
              reject(err);
            }, SHELL_TIMEOUT_MS);
          }),
        ]).finally(() => {
          if (restTimer) clearTimeout(restTimer);
        });
        if (pageHasData(rest)) {
          page = rest;
          hostRestFallback = true;
          fromRest = true;
          hasData = true;
          earlyExit = true;
        }
      } catch (restErr) {
        if (
          restErr?.name === 'AbortError' ||
          /aborted|AbortError/i.test(String(restErr?.message || ''))
        ) {
          throw restErr;
        }
        console.log(
          `[pr-plus] fetchNewestReviewThreadsAdaptive REST fallback soft-fail: ${
            restErr?.message || restErr
          }`
        );
      }
    }

    if (!page) {
      page = {
        threads: [],
        comments: [],
        hasMore: false,
        totalCount: 0,
        pageCount: 0,
        direction: 'newest',
        source: null,
      };
    }

    // Yield so ladder labels can paint. Prefer setTimeout over rAF — background
    // / headless tabs throttle rAF to near-zero, which starved openModal threads.
    const yieldStagePaint = () =>
      new Promise((resolve) => {
        setTimeout(resolve, 0);
      });

    // Progress stage: shell list/meta is ready.
    // Ladder is shell → comments only (reactions co-fetched on by-ids; no
    // separate "Updating reactions…" / comments-start flash stages).
    try {
      if (typeof opts?.onStage === 'function') {
        opts.onStage('shell', {
          page,
          pageSize: escalated ? apiMax : pageSize,
          warm: hasWarm,
        });
      }
    } catch {
      /* ignore stage */
    }

    // Eager full comments + reaction counts on host (by-ids).
    // Warm early-exit still loads unresolved bodies when comments are missing.
    const pureMerge =
      typeof RT.mergeCommentsBulkIntoThreadsPage === 'function'
        ? RT.mergeCommentsBulkIntoThreadsPage
        : null;
    const selectEager =
      typeof RT.selectThreadIdsForEagerComments === 'function'
        ? RT.selectThreadIdsForEagerComments
        : null;
    const needBodies =
      !earlyExit ||
      !hasWarm ||
      (Array.isArray(page?.threads) &&
        page.threads.some(
          (t: any) => t && t.commentsLoaded !== true && !Boolean(t.resolved)
        ));
    let eagerN = 0;
    if (
      needBodies &&
      page?.source === 'graphql' &&
      typeof (globalThis as any).PRTreeFetch?.fetchReviewThreadsByIds === 'function' &&
      selectEager
    ) {
      const eagerIds = selectEager(page.threads || [], {
        forceAll: Boolean(forceFull),
      });
      eagerN = eagerIds.length;
      if (eagerIds.length) {
        try {
          // Bound by-ids: shell already has PRRT + preview bodies; a stuck
          // SW channel must not block Diff thread paint indefinitely.
          let bulkTimer: ReturnType<typeof setTimeout> | null = null;
          const bulk = await Promise.race([
            (globalThis as any).PRTreeFetch.fetchReviewThreadsByIds(eagerIds, {
              signal,
            }),
            new Promise((_, reject) => {
              bulkTimer = setTimeout(() => {
                const err: any = new Error(
                  `reviewThreads byIds timed out after ${SHELL_TIMEOUT_MS}ms`
                );
                err.status = 408;
                reject(err);
              }, SHELL_TIMEOUT_MS);
            }),
          ]).finally(() => {
            if (bulkTimer) clearTimeout(bulkTimer);
          });
          if (pureMerge && bulk) {
            page = pureMerge(page, bulk);
            page.shellOnly = false;
            page.eagerCommentIds = eagerIds;
          }
        } catch (bulkErr) {
          console.log(
            `[pr-plus] fetchNewestReviewThreadsAdaptive eager by-ids soft-fail: ${
              bulkErr?.message || bulkErr
            }`
          );
        }
      }
    }

    // Comments stage only — reactors{totalCount} already on by-ids (or shell).
    try {
      if (typeof opts?.onStage === 'function') {
        // Yield once so shell label can paint before comments overwrites it.
        await yieldStagePaint();
        opts.onStage('comments', {
          page,
          eager: eagerN,
          skipped: eagerN === 0,
        });
      }
    } catch {
      /* ignore stage */
    }

    return {
      page,
      pageSize: escalated ? apiMax : pageSize,
      warm: hasWarm,
      escalated,
      earlyExit,
      source: page?.source || null,
      hostRestFallback,
      eagerCommentCount: eagerN,
    };
  }

