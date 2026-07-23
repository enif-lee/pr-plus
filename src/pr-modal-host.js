/**
 * Content-script host: intercept PR list clicks, mount React modal overlay.
 * Bundle + CSS are extension-local (no remote code).
 * Host updates reuse the same React root so Diff/search/scroll state survives refresh.
 * PR detail uses memory + IndexedDB cache (stale-while-revalidate / React Query style).
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
  const DEFAULT_PREFS = {
    fastReview: true,
    reverseComments: true,
  };

  let prefs = { ...DEFAULT_PREFS };
  let prefsWatchUnsub = null;

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
     * Shown in the header diff-stat badge during loads.
     */
    loadStage: null,
  };

  async function refreshPrefs() {
    try {
      const next = await globalThis.PRTreeStorage?.getExtensionPrefs?.();
      if (next && typeof next === 'object') {
        prefs = {
          fastReview: next.fastReview !== false,
          reverseComments: next.reverseComments !== false,
        };
      }
    } catch {
      prefs = { ...DEFAULT_PREFS };
    }
    return prefs;
  }

  function ensurePrefsWatch() {
    if (prefsWatchUnsub) return;
    try {
      prefsWatchUnsub =
        globalThis.PRTreeStorage?.watchExtensionPrefs?.((next) => {
          prefs = {
            fastReview: next?.fastReview !== false,
            reverseComments: next?.reverseComments !== false,
          };
          if (current.open) render();
        }) || null;
    } catch {
      prefsWatchUnsub = null;
    }
  }

  function setLoadStage(phase, label, busy = true) {
    current.loadStage =
      phase || label
        ? { phase: phase || null, label: label || null, busy: Boolean(busy) }
        : null;
  }

  /**
   * Short, near-constant-width load copy for the header stats badge.
   * Keeps morph animation stable (avoids long first phrase → shrink thrash).
   * Target ~22–26 glyphs including ellipsis.
   *
   * @param {string} kind
   * @param {{ count?: number, loaded?: number, total?: number, message?: string }|null} [extra]
   */
  function loadStageLabel(kind, extra = null) {
    const n = Number(extra?.count);
    const loaded = Number(extra?.loaded);
    const total = Number(extra?.total);
    switch (String(kind || '')) {
      case 'core':
        return 'Loading pull request…';
      case 'core-full':
        return 'Loading full details…';
      case 'revalidate':
        return 'Updating pull request…';
      case 'refresh':
        return 'Refreshing pull request…';
      case 'refresh-meta':
        return 'Refreshing metadata…';
      case 'refresh-visible':
        return 'Refreshing visible…';
      case 'refresh-all':
        return 'Refreshing threads…';
      case 'threads-load':
        return 'Loading review threads…';
      case 'threads-update':
        return 'Updating review threads…';
      case 'threads-earlier':
        return 'Loading earlier threads…';
      case 'threads-unresolved':
        return 'Updating open threads…';
      case 'threads-visible': {
        const c = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
        // Fixed shape: "Updating ## threads…" (~22)
        const num = String(Math.min(c, 99)).padStart(2, '0');
        return `Updating ${num} threads…`;
      }
      case 'threads-more':
        return 'Loading more threads…';
      case 'threads-all': {
        if (Number.isFinite(loaded) && loaded >= 0 && Number.isFinite(total) && total > 0) {
          const a = String(Math.min(Math.floor(loaded), 999)).padStart(3, ' ');
          const b = String(Math.min(Math.floor(total), 999)).padStart(3, ' ');
          return `Loading comments${a}/${b}`;
        }
        if (Number.isFinite(loaded) && loaded >= 0) {
          const a = String(Math.min(Math.floor(loaded), 999)).padStart(3, ' ');
          return `Loading comments ·${a}`;
        }
        return 'Loading all comments…';
      }
      case 'refresh-failed':
        return 'Refresh failed';
      case 'threads-failed':
        return 'Threads failed to load';
      case 'threads-more-failed':
        return 'Load more failed';
      case 'threads-all-failed':
        return 'Load all failed';
      default: {
        const msg = String(extra?.message || kind || 'Loading…').trim();
        // Hard cap so unexpected API errors don't explode the badge
        return msg.length > 26 ? `${msg.slice(0, 24)}…` : msg || 'Loading…';
      }
    }
  }

  function clearLoadStage() {
    current.loadStage = null;
  }

  /**
   * Memory SWR (60s fresh) + IndexedDB durable layer (7d / 24 PRs).
   * Page reload → peekAsync hydrates IDB → paint → network revalidate.
   */
  const detailCache =
    globalThis.PRModalDetailCache?.createPersistedDetailCache?.({
      ttlMs: 60_000,
      createIdb: () =>
        globalThis.PRModalDetailIdb?.createDetailIdb?.({
          maxEntries: 24,
          maxAgeMs: 7 * 24 * 60 * 60 * 1000,
        }) || null,
    }) ||
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
        if (!e) return { value: null, fresh: false, stale: false, source: null };
        const fresh = e.expiresAt > Date.now();
        return { value: e.value, fresh, stale: !fresh, source: 'memory' };
      },
      async peekAsync(key) {
        return this.peek(key);
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

  function emptyPeek() {
    return { value: null, fresh: false, stale: false, source: null };
  }

  /** Sync memory only — never blocks paint. */
  function peekDetailMemory(key) {
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
  async function peekDetailIdb(key, ms = 400) {
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

  /** Find a PR already loaded by the pulls-list stack (no extra network). */
  function findListPr(owner, repo, number) {
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
  function detailSketchFromList(listPr, owner, repo, number) {
    const n = Number(number);
    if (!Number.isFinite(n) || n <= 0) return null;
    const title =
      (listPr && String(listPr.title || '').trim()) || `Pull Request #${n}`;
    const body = listPr && listPr.body != null ? String(listPr.body) : '';
    const author = (listPr && listPr.author) || '';
    // Labels: normalize to { name, color, description }
    const labels = Array.isArray(listPr?.labels)
      ? listPr.labels
          .map((l) =>
            typeof l === 'string'
              ? { name: l, color: '', description: '' }
              : {
                  name: l?.name || '',
                  color: l?.color || '',
                  description: l?.description || '',
                }
          )
          .filter((l) => l.name)
      : [];
    // Assignees: login strings (MetaList shape)
    const assignees = Array.isArray(listPr?.assignees)
      ? listPr.assignees
          .map((u) => (typeof u === 'string' ? u : u?.login || ''))
          .filter(Boolean)
      : [];
    const requestedReviewers = Array.isArray(listPr?.requestedReviewers)
      ? listPr.requestedReviewers
          .map((u) => (typeof u === 'string' ? u : u?.login || ''))
          .filter(Boolean)
      : [];
    // Milestone: { number, title, state, dueOn }
    let milestone = null;
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
      mergeable: null,
      labels,
      assignees,
      requestedReviewers,
      milestone,
      avatarUrls,
      files: [],
      comments: [],
      reviews: [],
      reviewComments: [],
      reviewThreads: [],
      commits: [],
      checks: { state: 'unknown', totalCount: 0, statuses: [], checkRuns: [] },
      additions: listPr?.additions ?? null,
      deletions: listPr?.deletions ?? null,
      changedFiles: listPr?.changedFiles ?? null,
      subscribed: null,
      _sketch: true,
      _source: 'list',
    };
  }

  /**
   * Rank detail completeness for progressive upgrade decisions.
   * 0 empty · 1 list sketch · 2 core (no threads) · 3 cached/full with threads/files
   */
  function detailRank(d) {
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
      prefs: { ...prefs },
      // Deep-link restore (page/position); App also writes URI on focus changes
      initialRoute: {
        page: current.routePage,
        position: current.routePosition,
        number: current.number,
      },
      onRouteChange: persistRouteState,
      onClose: closeModal,
      /**
       * Stack strip navigation — preserve current Diff/Conversation view when
       * opts.page is omitted by falling back to current.routePage.
       * @param {number} n
       * @param {{ page?: 'diff'|'conversation'|null }} [opts]
       */
      onOpenStackPr: (n, opts = {}) => {
        if (!owner || !repo || n == null) return;
        const page =
          opts?.page === 'diff' || opts?.page === 'conversation'
            ? opts.page
            : current.routePage === 'diff' || current.routePage === 'conversation'
              ? current.routePage
              : null;
        void openModal({
          owner,
          repo,
          number: Number(n),
          page,
        });
      },
      /**
       * Header / post-mutation refresh.
       * @param {{
       *   mode?: 'revalidate'|'full-threads'|'visible-threads',
       *   threadNodeIds?: string[],
       * }} [opts]
       *   - visible-threads (conversation header): core + bulk only on-screen threads
       *   - full-threads (diff header): core + last:100 + start:20 + Load all
       *   - revalidate (mutations / default): core + last:100 + remaining unresolved bulk
       */
      onRefresh: async (opts = {}) => {
        if (!owner || !repo || !number) return;
        if (!globalThis.PRTreeFetch?.fetchPrDetail) return;
        const modeRaw = String(opts?.mode || 'revalidate');
        const mode =
          modeRaw === 'full-threads'
            ? 'full-threads'
            : modeRaw === 'visible-threads'
              ? 'visible-threads'
              : 'revalidate';
        const visibleIds = [
          ...new Set(
            (Array.isArray(opts?.threadNodeIds) ? opts.threadNodeIds : [])
              .map((id) => String(id || '').trim())
              .filter(Boolean)
          ),
        ];
        const key = detailKey(owner, repo, number);
        const gen = ++detailFetchGen;
        const prevDetail = current.detail;
        current.error = null;
        setLoadStage(
          'refresh',
          mode === 'full-threads'
            ? loadStageLabel('refresh-all')
            : mode === 'visible-threads'
              ? loadStageLabel('refresh-visible')
              : loadStageLabel('refresh'),
          true
        );
        render();

        const stillOpen = () =>
          gen === detailFetchGen &&
          current.open &&
          current.owner === owner &&
          current.repo === repo &&
          Number(current.number) === Number(number);

        const mergeFn =
          globalThis.PRTreeFetch.mergeReviewThreadsPageIntoDetail || null;
        const apiMax = 100;
        const nowMs = () =>
          typeof performance !== 'undefined' && performance.now
            ? performance.now()
            : Date.now();

        try {
          // 1) Core metadata (no threads) — keep prior threads until thread phase
          setLoadStage('refresh', loadStageLabel('refresh-meta'), true);
          render();
          let detail = await globalThis.PRTreeFetch.fetchPrDetail(
            owner,
            repo,
            number,
            { skipReviewThreads: true }
          );
          if (!stillOpen()) return;
          if (
            prevDetail &&
            Array.isArray(prevDetail.reviewComments) &&
            prevDetail.reviewComments.length &&
            (!Array.isArray(detail.reviewComments) ||
              !detail.reviewComments.length)
          ) {
            detail = {
              ...detail,
              reviewComments: prevDetail.reviewComments,
              reviewThreads: prevDetail.reviewThreads || detail.reviewThreads,
              reviewThreadsMeta:
                prevDetail.reviewThreadsMeta || detail.reviewThreadsMeta,
              reviewCommentsMeta:
                prevDetail.reviewCommentsMeta || detail.reviewCommentsMeta,
            };
          }
          current.loading = false;
          current.detail = detail;
          current.error = null;
          detailCache.set(key, detail);
          render();

          // —— Conversation header: only bulk-refresh threads currently on screen ——
          if (mode === 'visible-threads') {
            if (
              visibleIds.length &&
              typeof globalThis.PRTreeFetch.fetchReviewThreadsByIds ===
                'function' &&
              typeof mergeFn === 'function'
            ) {
              setLoadStage(
                'threads',
                loadStageLabel('threads-visible', { count: visibleIds.length }),
                true
              );
              render();
              const tBulk = nowMs();
              const bulk =
                await globalThis.PRTreeFetch.fetchReviewThreadsByIds(
                  visibleIds
                );
              const missingN = (bulk?.missingThreadIds || []).length;
              console.log(
                `[pr-plus] onRefresh visible-threads ${owner}/${repo}#${number}: ${Math.round(
                  nowMs() - tBulk
                )}ms (${bulk?.threads?.length || 0}/${visibleIds.length}` +
                  (missingN ? `, dropped ${missingN} remote-missing` : '') +
                  ')'
              );
              if (!stillOpen()) return;
              if (bulk) {
                const next = mergeFn(current.detail, bulk, 'refresh');
                current.detail = next;
                detailCache.set(key, next);
              }
            } else {
              console.log(
                `[pr-plus] onRefresh visible-threads ${owner}/${repo}#${number}: metadata only (0 visible PRRT ids)`
              );
            }
            if (stillOpen()) {
              clearLoadStage();
              render();
            }
            return;
          }

          if (!globalThis.PRTreeFetch.fetchReviewThreadsPage) {
            clearLoadStage();
            render();
            return;
          }

          // 2a) last:100 (full-threads + mutation revalidate)
          setLoadStage('threads', loadStageLabel('threads-update'), true);
          render();
          const t0 = nowMs();
          const newest = await globalThis.PRTreeFetch.fetchReviewThreadsPage(
            owner,
            repo,
            number,
            { direction: 'newest', cursor: null, pageSize: apiMax }
          );
          if (!stillOpen()) return;
          console.log(
            `[pr-plus] onRefresh last ${owner}/${repo}#${number}: ${Math.round(
              nowMs() - t0
            )}ms (${newest?.threads?.length || 0}) mode=${mode}`
          );
          let next =
            typeof mergeFn === 'function'
              ? mergeFn(current.detail, newest, 'newest')
              : current.detail;
          current.detail = next;
          detailCache.set(key, next);
          render();

          const updatedIdSet = new Set(
            (newest?.threads || [])
              .map((t) => (t?.threadNodeId ? String(t.threadNodeId) : ''))
              .filter(Boolean)
          );
          const totalCount =
            typeof newest.totalCount === 'number'
              ? newest.totalCount
              : newest.threads?.length || 0;

          if (mode === 'full-threads') {
            // Diff: seed start window then drain all remaining pages
            if (totalCount >= apiMax && newest.hasPreviousPage) {
              try {
                setLoadStage('threads', loadStageLabel('threads-earlier'), true);
                render();
                const oldest =
                  await globalThis.PRTreeFetch.fetchReviewThreadsPage(
                    owner,
                    repo,
                    number,
                    { direction: 'oldest', cursor: null, pageSize: 20 }
                  );
                if (!stillOpen()) return;
                if (typeof mergeFn === 'function') {
                  next = mergeFn(next, oldest, 'oldest');
                  current.detail = next;
                  detailCache.set(key, next);
                  render();
                }
              } catch {
                /* keep last-only */
              }
            }
            if (stillOpen() && next?.reviewThreadsMeta?.hasMore) {
              const props = buildProps();
              if (typeof props.onLoadMoreReviewThreads === 'function') {
                await props.onLoadMoreReviewThreads('all');
              }
            } else if (stillOpen()) {
              clearLoadStage();
              render();
            }
          } else {
            // Mutation revalidate: unresolved bulk for threads not in last:100
            const collectIds =
              globalThis.PRTreeFetch.collectUnresolvedThreadNodeIds ||
              ((d) => {
                const ids = new Set();
                for (const t of d?.reviewThreads || []) {
                  if (t?.threadNodeId && !t.resolved) {
                    ids.add(String(t.threadNodeId));
                  }
                }
                return [...ids];
              });
            // Bulk revalidate unresolved threads; drop remote-missing and re-check once
            // so a local zombie PRRT cannot block refresh forever.
            let unresolvedPass = 0;
            const knownMissing = new Set();
            while (
              unresolvedPass < 2 &&
              typeof globalThis.PRTreeFetch.fetchReviewThreadsByIds ===
                'function' &&
              typeof mergeFn === 'function'
            ) {
              unresolvedPass += 1;
              const remainingUnresolvedIds = collectIds(next).filter((id) => {
                const s = String(id);
                return !updatedIdSet.has(s) && !knownMissing.has(s);
              });
              if (!remainingUnresolvedIds.length) break;
              setLoadStage('threads', loadStageLabel('threads-unresolved'), true);
              render();
              const tBulk = nowMs();
              const bulk =
                await globalThis.PRTreeFetch.fetchReviewThreadsByIds(
                  remainingUnresolvedIds
                );
              const missingList = Array.isArray(bulk?.missingThreadIds)
                ? bulk.missingThreadIds
                : [];
              for (const id of missingList) knownMissing.add(String(id));
              const missingN = missingList.length;
              console.log(
                `[pr-plus] onRefresh unresolved-remaining ${owner}/${repo}#${number}: ${Math.round(
                  nowMs() - tBulk
                )}ms (${bulk?.threads?.length || 0}/${remainingUnresolvedIds.length}` +
                  (missingN ? `, dropped ${missingN} remote-missing` : '') +
                  `, pass ${unresolvedPass})`
              );
              if (!stillOpen()) return;
              if (bulk) {
                next = mergeFn(next, bulk, 'refresh');
              }
              // Only retry when we actually pruned zombies (otherwise stop)
              if (!missingN) break;
            }
            if (stillOpen()) {
              current.detail = next;
              detailCache.set(key, next);
              clearLoadStage();
              render();
            }
          }
        } catch (err) {
          if (gen !== detailFetchGen) return;
          if (current.open) {
            current.loading = false;
            // Keep previous detail on soft-refresh failure
            if (!current.detail) {
              current.error = err?.message || String(err);
            } else {
              setLoadStage(
                'refresh',
                loadStageLabel('refresh-failed', { message: err?.message }),
                false
              );
            }
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
            { direction: dir, cursor, pageSize: 100 }
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
            ? loadStageLabel('threads-all', {
                loaded: meta0.loadedThreadCount || 0,
                total: totalHint || 0,
              })
            : loadStageLabel('threads-more'),
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
                loadStageLabel('threads-all', {
                  loaded,
                  total: totalHint || 0,
                }),
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
              loadStageLabel(
                loadAll ? 'threads-all-failed' : 'threads-more-failed',
                { message: err?.message }
              ),
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
        // Explicit empty arrays / null milestone must win (spread alone is fine)
        if (Object.prototype.hasOwnProperty.call(patch, 'assignees')) {
          next.assignees = Array.isArray(patch.assignees) ? patch.assignees : [];
        }
        if (Object.prototype.hasOwnProperty.call(patch, 'labels')) {
          next.labels = Array.isArray(patch.labels) ? patch.labels : [];
        }
        if (Object.prototype.hasOwnProperty.call(patch, 'requestedReviewers')) {
          next.requestedReviewers = Array.isArray(patch.requestedReviewers)
            ? patch.requestedReviewers
            : [];
        }
        if (Object.prototype.hasOwnProperty.call(patch, 'milestone')) {
          next.milestone = patch.milestone == null ? null : patch.milestone;
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
    await refreshPrefs();
    ensurePrefsWatch();
    const key = detailKey(owner, repo, number);
    const gen = ++detailFetchGen;

    // Progressive sources (fast → slow):
    //   1) list sketch (pulls page cache — title/body already available)
    //   2) memory cache
    //   3) IDB (async, non-blocking)
    //   4) network core + threads
    const listPr = findListPr(owner, repo, number);
    const listSketch = detailSketchFromList(listPr, owner, repo, number);

    // 1) Sync memory paint first (never block on IDB)
    let peeked = peekDetailMemory(key);
    let cached = peeked.value || null;
    let fromCache = Boolean(cached);
    const fromList = !fromCache && Boolean(listSketch);
    // Prefer real cache over list sketch; else sketch; else empty
    let initialDetail = cached || listSketch || null;

    // Explicit page (stack nav) > keep current view when already open > default conversation
    const resolvedPage =
      page === 'diff' || page === 'conversation'
        ? page
        : current.open &&
            (current.routePage === 'diff' || current.routePage === 'conversation')
          ? current.routePage
          : page || null;

    current = {
      open: true,
      // Only block whole UI when we have nothing to show yet
      loading: !initialDetail,
      error: null,
      detail: initialDetail,
      owner,
      repo,
      number,
      routePage: resolvedPage,
      routePosition: position || null,
      loadStage: {
        phase: fromCache ? 'revalidate' : fromList ? 'core' : 'core',
        label: fromCache
          ? loadStageLabel('revalidate')
          : fromList
            ? loadStageLabel('core-full')
            : loadStageLabel('core'),
        busy: true,
      },
    };
    persistOpenModal(owner, repo, number, {
      page: resolvedPage,
      position,
    });
    writeUriRoute({
      page: resolvedPage || 'conversation',
      number,
      position,
    });
    render();

    if (fromCache) {
      console.log(
        `[pr-plus] openModal cache-hit ${owner}/${repo}#${number} ` +
          `source=${peeked.source || 'memory'} fresh=${Boolean(peeked.fresh)}`
      );
    } else if (fromList) {
      console.log(
        `[pr-plus] openModal list-sketch ${owner}/${repo}#${number} ` +
          `title=${JSON.stringify(String(listSketch.title || '').slice(0, 60))}`
      );
    }

    // 2) Background IDB hydrate (timeout) — only if memory miss
    //    Upgrades list-sketch → IDB snapshot; must not delay network.
    const idbHydrateP = !fromCache
      ? peekDetailIdb(key, 400).then((idbPeek) => {
          if (gen !== detailFetchGen) return null;
          if (
            !(
              current.open &&
              current.owner === owner &&
              current.repo === repo &&
              Number(current.number) === Number(number)
            )
          ) {
            return null;
          }
          const v = idbPeek?.value || null;
          if (!v) return null;
          const curRank = detailRank(current.detail);
          const idbRank = detailRank(v);
          // Network already delivered richer data — keep IDB only for thread preserve
          if (curRank >= 2 && !current.detail?._sketch) {
            return v;
          }
          // Upgrade empty / list-sketch → IDB
          if (idbRank > curRank || (current.detail?._sketch && idbRank >= 2)) {
            cached = v;
            fromCache = true;
            peeked = idbPeek;
            current.detail = v;
            current.loading = false;
            current.error = null;
            setLoadStage('revalidate', loadStageLabel('revalidate'), true);
            render();
            console.log(
              `[pr-plus] openModal cache-hit ${owner}/${repo}#${number} source=idb (upgraded from ${
                curRank <= 1 ? 'list/empty' : 'partial'
              })`
            );
          }
          return v;
        })
      : Promise.resolve(cached);

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
            // Context invalidation cannot be fixed by retry — page refresh required
            if (
              /Extension context invalidated|Extension was reloaded/i.test(msg)
            ) {
              throw err;
            }
            if (
              attempt === 0 &&
              /message channel closed|Receiving end does not exist|Background worker offline/i.test(
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

      // Prefs drive progressive vs full thread load
      await refreshPrefs();
      ensurePrefsWatch();
      const fastReview = prefs.fastReview !== false;

      // Phase 1: core PR (no threads) — start network immediately (parallel with IDB)
      if (!fromCache && !fromList) {
        setLoadStage('core', loadStageLabel('core'), true);
        render();
      } else if (!fromCache && fromList) {
        setLoadStage('core', loadStageLabel('core-full'), true);
        render();
      } else {
        setLoadStage('revalidate', loadStageLabel('revalidate'), true);
        render();
      }
      const tCore0 =
        typeof performance !== 'undefined' && performance.now
          ? performance.now()
          : Date.now();
      // Let IDB finish (or time out) without blocking core fetch
      void idbHydrateP;
      let detail = await fetchDetailOnce({ skipReviewThreads: true });
      // Prefer whatever IDB provided for thread preserve below
      try {
        const idbVal = await idbHydrateP;
        if (idbVal && !cached) cached = idbVal;
        // If we still only had a list sketch when IDB finished after network race, keep idb for preserve
        if (idbVal && detailRank(cached) < detailRank(idbVal)) cached = idbVal;
      } catch {
        /* ignore */
      }
      const coreMs = Math.round(
        (typeof performance !== 'undefined' && performance.now
          ? performance.now()
          : Date.now()) - tCore0
      );
      console.log(
        `[pr-plus] openModal phase=core ${owner}/${repo}#${number}: ${coreMs}ms ` +
          (detail?._fetchTimings
            ? JSON.stringify(detail._fetchTimings)
            : '(no per-request timings)')
      );
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
      // SWR: keep cached review threads visible until fresh thread pages land
      // so core-only responses do not blank conversation / Diff comments.
      if (
        cached &&
        Array.isArray(cached.reviewComments) &&
        cached.reviewComments.length &&
        (!Array.isArray(detail.reviewComments) || !detail.reviewComments.length)
      ) {
        detail = {
          ...detail,
          reviewComments: cached.reviewComments,
          reviewThreads: cached.reviewThreads || detail.reviewThreads,
          reviewThreadsMeta: cached.reviewThreadsMeta || detail.reviewThreadsMeta,
          reviewCommentsMeta:
            cached.reviewCommentsMeta || detail.reviewCommentsMeta,
          comments:
            Array.isArray(detail.comments) && detail.comments.length
              ? detail.comments
              : cached.comments || detail.comments,
        };
      }
      // Network core is authoritative — drop sketch flags
      if (detail && typeof detail === 'object') {
        detail = { ...detail, _sketch: undefined, _source: 'network' };
      }
      current.loading = false;
      current.detail = detail;
      current.error = null;
      setLoadStage(
        'threads',
        fromCache || detailRank(cached) >= 3
          ? loadStageLabel('threads-update')
          : loadStageLabel('threads-load'),
        true
      );
      detailCache.set(key, detail);
      render();
      console.log(
        `[pr-plus] openModal phase=core-paint ${owner}/${repo}#${number} ` +
          `(prior=${fromCache ? 'cache' : fromList ? 'list' : 'empty'})`
      );

      // Phase 2: review threads
      // - Cold open: dual-window (newest last:N + oldest first:20)
      // - Cache revalidate: newest last:100 + bulk unresolved by PRRT ids (no oldest;
      //   start window is stable when ordered, so skip)
      if (globalThis.PRTreeFetch.fetchReviewThreadsPage) {
        try {
          const mergeFn =
            globalThis.PRTreeFetch.mergeReviewThreadsPageIntoDetail || null;
          const nowMs = () =>
            typeof performance !== 'undefined' && performance.now
              ? performance.now()
              : Date.now();
          const tThreads0 = nowMs();
          const apiMax = 100;
          // Revalidate path when we had durable cache (memory/IDB), not mere list sketch
          const useRevalidatePath = fromCache || detailRank(cached) >= 3;

          if (useRevalidatePath) {
            // —— Incremental revalidate ——
            // 1) last:100 first (always freshest activity window)
            // 2) then bulk-refresh only unresolved among threads NOT updated in step 1
            //    (oldest/start window skipped — stable when ordered)
            setLoadStage('threads', loadStageLabel('threads-update'), true);
            render();

            // Step 1: last N (API max 100)
            const tNewest0 = nowMs();
            const newest = await globalThis.PRTreeFetch.fetchReviewThreadsPage(
              owner,
              repo,
              number,
              { direction: 'newest', cursor: null, pageSize: apiMax }
            );
            console.log(
              `[pr-plus] openModal phase=threads.last ${owner}/${repo}#${number}: ${Math.round(
                nowMs() - tNewest0
              )}ms (${newest?.threads?.length || 0} threads)`
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

            const updatedIdSet = new Set(
              (newest?.threads || [])
                .map((t) => (t?.threadNodeId ? String(t.threadNodeId) : ''))
                .filter(Boolean)
            );

            let next =
              typeof mergeFn === 'function'
                ? mergeFn(current.detail, newest, 'newest')
                : current.detail;

            // Paint last-100 merge before unresolved bulk
            detail = next;
            current.detail = detail;
            detailCache.set(key, detail);
            setLoadStage('threads', loadStageLabel('threads-unresolved'), true);
            render();

            // Step 2: remaining unresolved not in last-100; drop remote-missing zombies
            const collectIds =
              globalThis.PRTreeFetch.collectUnresolvedThreadNodeIds ||
              ((d) => {
                const ids = new Set();
                for (const t of d?.reviewThreads || []) {
                  if (t?.threadNodeId && !t.resolved) {
                    ids.add(String(t.threadNodeId));
                  }
                }
                return [...ids];
              });
            let unresolvedPass = 0;
            /** PRRT ids confirmed remote-missing this open — never re-fetch. */
            const knownMissing = new Set();
            while (
              unresolvedPass < 2 &&
              typeof globalThis.PRTreeFetch.fetchReviewThreadsByIds === 'function'
            ) {
              unresolvedPass += 1;
              const remainingUnresolvedIds = collectIds(next).filter((id) => {
                const s = String(id);
                return !updatedIdSet.has(s) && !knownMissing.has(s);
              });
              if (!remainingUnresolvedIds.length) {
                if (unresolvedPass === 1) {
                  console.log(
                    `[pr-plus] openModal phase=threads.unresolved-remaining ${owner}/${repo}#${number}: skipped (0 remaining, last=${updatedIdSet.size})`
                  );
                }
                break;
              }
              const tBulk0 = nowMs();
              const bulk = await globalThis.PRTreeFetch.fetchReviewThreadsByIds(
                remainingUnresolvedIds
              );
              const missingList = Array.isArray(bulk?.missingThreadIds)
                ? bulk.missingThreadIds
                : [];
              for (const id of missingList) knownMissing.add(String(id));
              const missingN = missingList.length;
              console.log(
                `[pr-plus] openModal phase=threads.unresolved-remaining ${owner}/${repo}#${number}: ${Math.round(
                  nowMs() - tBulk0
                )}ms (${bulk?.threads?.length || 0}/${remainingUnresolvedIds.length} ids, skipped last=${updatedIdSet.size}` +
                  (missingN ? `, dropped ${missingN} remote-missing` : '') +
                  `, pass ${unresolvedPass})`
              );
              if (gen !== detailFetchGen) return;
              if (
                current.open &&
                Number(current.number) === Number(number) &&
                typeof mergeFn === 'function' &&
                bulk
              ) {
                next = mergeFn(next, bulk, 'refresh');
              }
              if (!missingN) break;
            }

            console.log(
              `[pr-plus] openModal phase=threads(revalidate) ${owner}/${repo}#${number}: ${Math.round(
                nowMs() - tThreads0
              )}ms total`
            );
            if (gen !== detailFetchGen) return;
            if (
              current.open &&
              Number(current.number) === Number(number) &&
              current.detail
            ) {
              detail = next;
              current.detail = detail;
              detailCache.set(key, detail);
              clearLoadStage();
              render();
            }
          } else {
            // —— Cold open: last:100 first, then start:20 only if total ≥ 100 ——
            const tNewest0 = nowMs();
            const newest = await globalThis.PRTreeFetch.fetchReviewThreadsPage(
              owner,
              repo,
              number,
              { direction: 'newest', cursor: null, pageSize: apiMax }
            );
            console.log(
              `[pr-plus] openModal phase=threads.last ${owner}/${repo}#${number}: ${Math.round(
                nowMs() - tNewest0
              )}ms (${newest?.threads?.length || 0} threads)`
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

            // Paint last-100 before optional start window
            detail = next;
            current.detail = detail;
            detailCache.set(key, detail);
            render();

            const totalCount =
              typeof newest.totalCount === 'number'
                ? newest.totalCount
                : newest.threads?.length || 0;
            // total < 100 → last page already covers everything; skip start
            const needStartWindow =
              totalCount >= apiMax && Boolean(newest.hasPreviousPage);
            if (needStartWindow) {
              try {
                setLoadStage('threads', loadStageLabel('threads-earlier'), true);
                render();
                const tOldest0 = nowMs();
                const oldest =
                  await globalThis.PRTreeFetch.fetchReviewThreadsPage(
                    owner,
                    repo,
                    number,
                    { direction: 'oldest', cursor: null, pageSize: 20 }
                  );
                console.log(
                  `[pr-plus] openModal phase=threads.start ${owner}/${repo}#${number}: ${Math.round(
                    nowMs() - tOldest0
                  )}ms (${oldest?.threads?.length || 0} threads, total=${totalCount})`
                );
                if (gen === detailFetchGen && typeof mergeFn === 'function') {
                  next = mergeFn(next, oldest, 'oldest');
                }
              } catch {
                /* keep last-only window */
              }
            } else {
              console.log(
                `[pr-plus] openModal phase=threads.start ${owner}/${repo}#${number}: skipped (total=${totalCount} < ${apiMax})`
              );
            }
            console.log(
              `[pr-plus] openModal phase=threads ${owner}/${repo}#${number}: ${Math.round(
                nowMs() - tThreads0
              )}ms total`
            );
            if (gen !== detailFetchGen) return;
            if (
              current.open &&
              Number(current.number) === Number(number) &&
              current.detail
            ) {
              detail = next;
              current.detail = detail;
              detailCache.set(key, detail);
              clearLoadStage();
              render();
            }

            // Full load when "가볍고 빠른 PR 검토" is off — drain remaining pages
            if (
              !fastReview &&
              gen === detailFetchGen &&
              current.open &&
              current.detail?.reviewThreadsMeta?.hasMore
            ) {
              try {
                const props = buildProps();
                if (typeof props.onLoadMoreReviewThreads === 'function') {
                  await props.onLoadMoreReviewThreads('all');
                }
              } catch {
                /* stage error already surfaced */
              }
            }
          }
        } catch (threadErr) {
          // Core already painted — keep it; surface soft stage error
          if (gen === detailFetchGen && current.open) {
            setLoadStage(
              'threads',
              loadStageLabel('threads-failed', { message: threadErr?.message }),
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

    // Extension reload leaves orphan content scripts; restore needs a tab refresh
    const bridge = globalThis.PRTreeBridge;
    if (
      typeof bridge?.isExtensionContextAlive === 'function' &&
      !bridge.isExtensionContextAlive()
    ) {
      return {
        ok: false,
        reason: 'context-invalidated',
        message:
          bridge.RELOAD_REFRESH_MSG ||
          'Extension was reloaded. Refresh this GitHub tab to reconnect pr+.',
      };
    }

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

    try {
      await openModal({
        owner: resolved.open.owner,
        repo: resolved.open.repo,
        number: resolved.open.number,
        page: resolved.page,
        position: resolved.position,
      });
    } catch (err) {
      const msg = String(err?.message || err || '');
      if (
        /Extension context invalidated|Extension was reloaded/i.test(msg)
      ) {
        return {
          ok: false,
          reason: 'context-invalidated',
          message: msg,
        };
      }
      throw err;
    }
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
    // List entry always opens Conversation — do not restore prior Diff/session page.
    // Stack hops / refresh restore may still pass an explicit page.
    void openModal({ ...parsed, page: 'conversation' });
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
      const bridge = globalThis.PRTreeBridge;
      if (
        typeof bridge?.isExtensionContextAlive === 'function' &&
        !bridge.isExtensionContextAlive()
      ) {
        return;
      }
      const props = buildProps();
      if (typeof props.onRefresh === 'function') {
        void props.onRefresh().catch((err) => {
          const msg = String(err?.message || err || '');
          if (/Extension context invalidated|Extension was reloaded/i.test(msg)) {
            return;
          }
          console.warn('[pr+] pageshow refresh failed', err);
        });
      }
    });
  }

  /**
   * Wipe in-memory SWR + page-origin IndexedDB PR detail cache.
   * Invoked from popup settings via PR_TREE_CLEAR_DETAIL_CACHE.
   */
  async function clearDetailCache() {
    try {
      const r = detailCache.clear?.();
      if (r && typeof r.then === 'function') await r;
    } catch (err) {
      console.warn('[pr+] detailCache.clear failed', err);
    }
    // Fresh handle in case the singleton cache missed IDB (tests / fallback)
    try {
      const idb = globalThis.PRModalDetailIdb?.createDetailIdb?.();
      if (idb?.clear) await idb.clear();
    } catch (err) {
      console.warn('[pr+] IDB clear failed', err);
    }
    return { ok: true };
  }

  function listenClearDetailCache() {
    try {
      chrome.runtime?.onMessage?.addListener((message, _sender, sendResponse) => {
        if (message?.type !== 'PR_TREE_CLEAR_DETAIL_CACHE') return false;
        void clearDetailCache()
          .then((res) => {
            try {
              sendResponse(res || { ok: true });
            } catch {
              /* channel closed */
            }
          })
          .catch((err) => {
            try {
              sendResponse({
                ok: false,
                error: err?.message || String(err),
              });
            } catch {
              /* ignore */
            }
          });
        // Keep channel open for async sendResponse
        return true;
      });
    } catch {
      /* ignore */
    }
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
    clearDetailCache,
    _getState: () => ({ ...current, hostEnabled }),
    _detailCache: detailCache,
  };

  listenClearDetailCache();
  install();
})();
