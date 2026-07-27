                .catch((err) => {
                  failSide('development', err);
                  return null;
                })
            )
          : Promise.resolve(null).then(() => {
              if (alive() && !current.sideSettled?.development) {
                setSideFlag('development', { pending: false, settled: true });
              }
              creditSide('development');
              return null;
            });
    }

    return {
      filesP,
      commentsP,
      reviewsP,
      commitsP,
      checksP,
      developmentP,
    };
  }

  function beginFetchProgress(gen, stillOpenFn = null) {
    const lp = globalThis.PRModalLoadProgress;
    const w = fetchUnitWeights();
    const tracker =
      lp && typeof lp.createWeightProgress === 'function'
        ? lp.createWeightProgress({ total: 100, initial: 0 })
        : {
            complete(key, weight) {
              this._c = Math.min(100, (this._c || 0) + Math.max(0, weight || 0));
              this._keys = this._keys || new Set();
              if (this._keys.has(key)) {
                return { percent: this._c, added: false, completed: this._c };
              }
              this._keys.add(key);
              return { percent: this._c, added: true, completed: this._c };
            },
            percent() {
              return Math.min(100, Math.round(this._c || 0));
            },
            has(key) {
              return (this._keys || new Set()).has(String(key || ''));
            },
            getKeys() {
              return [...(this._keys || [])];
            },
            _c: 0,
          };

    function alive() {
      if (gen != null && gen !== detailFetchGen) return false;
      if (typeof stillOpenFn === 'function' && !stillOpenFn()) return false;
      return Boolean(current.open);
    }

    function mark(key, weight, phase, label, opts = null) {
      if (!alive()) return tracker.percent();
      const res = tracker.complete(String(key), Number(weight) || 0);
      // Cap at 99 while busy so clearLoadStage owns the 100 settle
      const percent = Math.min(99, Math.max(0, res.percent));
      setLoadStage(phase, label, true, {
        percent,
        ...(opts && typeof opts === 'object' ? opts : {}),
      });
      try {
        render();
      } catch {
        /* ignore */
      }
      return percent;
    }

    const prog = { mark, percent: () => tracker.percent(), tracker, weights: w };
    activeOpenProgress = prog;
    return prog;
  }

  function setLoadStage(phase, label, busy = true, opts = null) {
    if (!phase && !label) {
      current.loadStage = null;
      return;
    }
    const b = Boolean(busy);
    const fraction =
      opts && Number.isFinite(opts.phaseFraction) ? opts.phaseFraction : undefined;
    // Prefer explicit percent from fetch-unit marks; else derive from phase
    const percent =
      opts && Number.isFinite(opts.percent)
        ? Math.min(100, Math.max(0, Math.round(opts.percent)))
        : loadStagePercent(phase, b, fraction);
    // Never decrease percent during a busy session (parallel completions can race)
    const prev =
      current.loadStage && Number.isFinite(current.loadStage.percent)
        ? Number(current.loadStage.percent)
        : 0;
    const nextPercent =
      b && current.loadStage && current.loadStage.busy
        ? Math.max(prev, percent)
        : percent;
    current.loadStage = {
      phase: phase || null,
      label: label || null,
      busy: b,
      percent: nextPercent,
    };
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
      case 'panels': {
        const panel = String(extra?.panel || '');
        if (panel === 'files') return 'Loading files…';
        if (panel === 'comments') return 'Loading comments…';
        if (panel === 'reviews') return 'Loading reviews…';
        if (panel === 'commits') return 'Loading commits…';
        if (panel === 'checks') return 'Loading checks…';
        if (panel === 'development') return 'Loading development…';
        return 'Loading panels…';
      }
      default: {
        const msg = String(extra?.message || kind || 'Loading…').trim();
        // Hard cap so unexpected API errors don't explode the badge
        return msg.length > 26 ? `${msg.slice(0, 24)}…` : msg || 'Loading…';
      }
    }
  }

  function clearLoadStage() {
    try {
      const tl = getFetchTimeline();
      if (tl) {
        tl.mark('session', 'done', { note: 'load stage cleared' });
        const dump = tl.dump();
        console.log(
          `[pr-plus][tl] SESSION DONE ${dump.label} elapsed=${dump.elapsedMs}ms events=${dump.events.length}`
        );
        const ends = dump.events.filter(
          (e) => e.phase === 'end' || e.phase === 'error'
        );
        if (ends.length) {
          console.log(
            '[pr-plus][tl] fetch durations: ' +
              ends
                .map(
                  (e) =>
                    `${e.name}=${e.dur != null ? e.dur + 'ms' : '?'}${
                      e.ok === false ? '!' : ''
                    }`
                )
                .join(' ')
          );
        }
      }
    } catch {
      /* ignore */
    }
    // Drop load pill immediately → metrics stats (no "Ready" settle flash).
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

  /**
   * Modal CSS readiness. Prefer content_scripts injection of pr-modal.css
   * (available before any click). Optional dynamic <link> is a backup only.
   * Hosts use data-prp-css-ready so FOUC gate does not hide a ready shell.
   */
  let modalCssReady = false;
  let modalCssReadyP = null;

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

  function stampHostCssReady(host) {
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

  function detailKey(owner, repo, number) {
    return detailCache.cacheKey(owner, repo, number);
  }

  /**
   * Open-PR list for stack strip / branch picker.
   * Prefer the pulls-page tree cache; when opening from a PR page (embed) that
   * cache is empty, use a host-fetched list so Stack matches fullscreen.
   * @type {Array|null}
   */
  let openPullsFetched = null;
  /** @type {string} owner/repo key for openPullsFetched */
  let openPullsFetchedKey = '';
  /** @type {Promise<Array>|null} */
  let openPullsFetchP = null;

  function resolveOpenPulls() {
    try {
      const app = globalThis.__PR_TREE_APP__;
      const list = app?.getCachedPrs?.();
      if (Array.isArray(list) && list.length) return list;
    } catch {
      /* ignore */
    }
    if (Array.isArray(openPullsFetched) && openPullsFetched.length) {
      return openPullsFetched;
    }
    return [];
  }

  /**
   * Ensure we have open PRs for stack strip when the list page never painted
   * (embed / direct PR URL / cold tab). Non-blocking; re-renders when ready.
   * @param {string} owner
   * @param {string} repo
   * @param {{ signal?: AbortSignal }} [opts]
   */
  function ensureOpenPullsForStack(owner, repo, opts = {}) {
    const o = String(owner || '').trim();
    const r = String(repo || '').trim();
    if (!o || !r) return Promise.resolve([]);
    const key = `${o.toLowerCase()}/${r.toLowerCase()}`;
    const cached = resolveOpenPulls();
    // Already have enough rows to build a stack (or any list for branch picker)
    if (cached.length >= 2) return Promise.resolve(cached);
    if (
      openPullsFetchedKey === key &&
      Array.isArray(openPullsFetched) &&
      openPullsFetched.length
    ) {
      return Promise.resolve(openPullsFetched);
    }
    if (openPullsFetchP) return openPullsFetchP;
    if (!globalThis.PRTreeFetch?.fetchOpenPulls) {
      return Promise.resolve(cached);
    }
    const signal = opts.signal || null;
    openPullsFetchP = (async () => {
      try {
        if (signal?.aborted) return cached;
        const prs = await globalThis.PRTreeFetch.fetchOpenPulls(o, r, null, {
          signal,
        });
        if (signal?.aborted) return cached;
        if (Array.isArray(prs) && prs.length) {
          openPullsFetched = prs;
          openPullsFetchedKey = key;
          // Stack strip depends on openPulls — re-render if modal still open
          if (
            current.open &&
            String(current.owner || '').toLowerCase() === o.toLowerCase() &&
            String(current.repo || '').toLowerCase() === r.toLowerCase()
          ) {
            render();
          }
          return prs;
        }
        return cached;
      } catch {
        return cached;
      } finally {
        openPullsFetchP = null;
      }
    })();
    return openPullsFetchP;
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
    const presentation = isEmbedPresentation(current.presentation)
      ? 'embed'
      : 'modal';
    const chrome =
      presentation === 'embed' && pageEmbedApi()?.embedShellChromeFlags
        ? pageEmbedApi().embedShellChromeFlags()
        : {
            presentation: 'modal',
            showClose: true,
            showShellToggle: true,
            showFullscreen: true,
            showExit: true,
          };
    return {
      open: current.open,
      loading: current.loading,
      error: current.error,
      detail: current.detail,
      loadStage: current.loadStage,
      /** Side panels loading without settled cache → section skeletons */
      sidePending: {
        commits: Boolean(current.sidePending?.commits),
        checks: Boolean(current.sidePending?.checks),
        development: Boolean(current.sidePending?.development),
        files: Boolean(current.sidePending?.files),
        comments: Boolean(current.sidePending?.comments),
        reviews: Boolean(current.sidePending?.reviews),
      },
      openPulls,
      prefs: { ...prefs },
      presentation,
      shellChrome: chrome,
      // Deep-link restore (page/position + GH commit/selection); App also writes URI
      initialRoute: {
        page: current.routePage,
        position: current.routePosition,
        number: current.number,
        commitSha: current.routeCommitSha,
        commitEndSha: current.routeCommitEndSha,
        filePath: current.routeFilePath,
        fileKey: current.routeFileKey,
        startLine: current.routeStartLine,
        endLine: current.routeEndLine,
        side: current.routeSide,
      },
      onRouteChange: persistRouteState,
      onClose: presentation === 'embed' ? () => {} : closeModal,
      onRestoreNative:
        presentation === 'embed' ? () => restoreNativeView() : undefined,
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
        // Cancel prior open/refresh fetches; new cancelable session
        const { gen, signal } = beginOpenFetchSession();
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
          !signal.aborted &&
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
          // Kick independent network work in parallel (mirror openModal).
          // Each fetch marks progress on *its own* completion (timing-accurate bar).
          const prog = beginFetchProgress(gen, stillOpen);
          const uw = prog.weights;
          prog.mark('start', uw.start, 'refresh', loadStageLabel('refresh-meta'));

          const canPageThreads = Boolean(
            globalThis.PRTreeFetch.fetchReviewThreadsPage
          );
          const canBulkThreads = Boolean(
            globalThis.PRTreeFetch.fetchReviewThreadsByIds
          );

          /** @type {any} */
          let earlyRefreshThreadsPage = null;
          /** @type {any} */
          let earlyRefreshVisibleBulk = null;

          /** Partial paint helper for refresh core (immediate on resolve). */
          function paintRefreshCore(raw) {
            if (!stillOpen() || !raw) return null;
            let detail = raw;
            // Prefer live on-screen threads (may include early-fetched newest)
            // over stale prevDetail when network core has empty comments.
            const threadSrc =
              current.detail &&
              Array.isArray(current.detail.reviewComments) &&
              current.detail.reviewComments.length
                ? current.detail
                : prevDetail;
            if (
              threadSrc &&
              Array.isArray(threadSrc.reviewComments) &&
              threadSrc.reviewComments.length &&
              (!Array.isArray(detail.reviewComments) ||
                !detail.reviewComments.length)
            ) {
              detail = {
                ...detail,
                reviewComments: threadSrc.reviewComments,
                reviewThreads: threadSrc.reviewThreads || detail.reviewThreads,
                reviewThreadsMeta:
                  threadSrc.reviewThreadsMeta || detail.reviewThreadsMeta,
                reviewCommentsMeta:
                  threadSrc.reviewCommentsMeta || detail.reviewCommentsMeta,
              };
            }
            if (prevDetail && Array.isArray(prevDetail.files) && prevDetail.files.length) {
              const netFiles = Array.isArray(detail.files) ? detail.files : [];
              const cachedHasPatches = prevDetail.files.some(
                (f) =>
                  f &&
                  typeof f.patch === 'string' &&
                  f.patch.length > 0 &&
                  !f._patchOmitted
              );
              const netHasPatches = netFiles.some(
                (f) =>
                  f &&
                  typeof f.patch === 'string' &&
                  f.patch.length > 0 &&
                  !f._patchOmitted
              );
              if (cachedHasPatches && !netHasPatches) {
                detail = { ...detail, files: prevDetail.files };
              }
            }
            if (
              prevDetail &&
              Array.isArray(prevDetail.commits) &&
              prevDetail.commits.length &&
              (!Array.isArray(detail.commits) || !detail.commits.length)
            ) {
              detail = { ...detail, commits: prevDetail.commits };
            }
            current.loading = false;
            // Core refresh: meta slice only (isolation)
            ensureDetailStore(current.detail || prevDetail);
            applyCoreToStore(detail);
            current.error = null;
            detailCache.set(key, current.detail);
            setLoadStage(
              'refresh',
              loadStageLabel('refresh-meta'),
              true,
              { percent: prog.percent() }
            );
            render();
            kickIndependentSideFetches({
              owner,
              repo,
              number,
              headSha: current.detail?.headSha || null,
              body: current.detail?.body || '',
              gen,
              stillOpenFn: stillOpen,
              signal,
            });
            // Re-apply early thread fetches after core shell is updated
            if (earlyRefreshThreadsPage) {
              paintRefreshThreadsNewest(earlyRefreshThreadsPage);
            }
            if (earlyRefreshVisibleBulk) {
              paintRefreshVisibleBulk(earlyRefreshVisibleBulk);
            }
            return current.detail;
          }

          function paintRefreshThreadsNewest(page) {
            if (!stillOpen() || !page || typeof mergeFn !== 'function') return false;
            if (!current.detail) return false;
            const next = mergeFn(current.detail, page, 'newest');
            applyThreadsToStore(next);
            detailCache.set(key, current.detail);
            setLoadStage(
              'threads',
              loadStageLabel('threads-update'),
              true,
              { percent: prog.percent() }
            );
            render();
            return true;
          }

          function paintRefreshVisibleBulk(bulk) {
            if (!stillOpen() || !bulk || typeof mergeFn !== 'function') return false;
            if (!current.detail) return false;
            const next = mergeFn(current.detail, bulk, 'refresh');
            applyThreadsToStore(next);
            detailCache.set(key, current.detail);
            setLoadStage(
              'threads',
              loadStageLabel('threads-visible', { count: visibleIds.length }),
              true,
              { percent: prog.percent() }
            );
            render();
            return true;
          }

          // Parallel kickoff — paint as each fetch lands
          const threadsNewestP =
            mode !== 'visible-threads' && canPageThreads
              ? globalThis.PRTreeFetch
                  .fetchReviewThreadsPage(owner, repo, number, {
                    direction: 'newest',
                    cursor: null,
                    pageSize: apiMax,
                    signal,
                  })
                  .then((page) => {
                    prog.mark(
                      'threadsNewest',
                      uw.threadsNewest,
                      'threads',
                      loadStageLabel('threads-update')
                    );
                    earlyRefreshThreadsPage = page;
                    paintRefreshThreadsNewest(page);
                    return { ok: true, page };
                  })
                  .catch((err) => {
                    prog.mark(
                      'threadsNewest',
                      uw.threadsNewest,
                      'threads',
                      loadStageLabel('threads-failed', { message: err?.message })
                    );
                    return { ok: false, err };
                  })
              : Promise.resolve({ ok: false, skipped: true }).then((r) => {
                  if (mode !== 'visible-threads') {
                    prog.mark(
                      'threadsNewest',
                      uw.threadsNewest,
                      'refresh',
                      loadStageLabel('refresh-meta')
                    );
                  }
                  return r;
                });

          const threadsVisibleP =
            mode === 'visible-threads' &&
            visibleIds.length &&
            canBulkThreads
              ? globalThis.PRTreeFetch
                  .fetchReviewThreadsByIds(visibleIds, { signal })
                  .then((bulk) => {
                    prog.mark(
                      'threadsVisible',
                      uw.threadsVisible,
                      'threads',
                      loadStageLabel('threads-visible', {
                        count: visibleIds.length,
                      })
                    );
                    earlyRefreshVisibleBulk = bulk;
                    paintRefreshVisibleBulk(bulk);
                    return { ok: true, bulk };
                  })
                  .catch((err) => {
                    prog.mark(
                      'threadsVisible',
                      uw.threadsVisible,
                      'threads',
                      loadStageLabel('threads-failed', { message: err?.message })
                    );
                    return { ok: false, err };
                  })
              : Promise.resolve({ ok: false, skipped: true });

          let detail = await globalThis.PRTreeFetch.fetchPrDetail(
            owner,
            repo,
            number,
            { skipReviewThreads: true, signal }
          ).then((d) => {
            prog.mark('core', uw.core, 'refresh', loadStageLabel('refresh-meta'));
            paintRefreshCore(d);
            return d;
          });
          if (!stillOpen()) return;
          detail = current.detail || detail;

          // —— Conversation header: only bulk-refresh threads currently on screen ——
          if (mode === 'visible-threads') {
            if (
              visibleIds.length &&
              canBulkThreads &&
              typeof mergeFn === 'function'
            ) {
              setLoadStage(
                'threads',
                loadStageLabel('threads-visible', { count: visibleIds.length }),
                true,
                { percent: prog.percent() }
              );
              render();
              const tBulk = nowMs();
              const vis = await threadsVisibleP;
              if (!vis.ok && !vis.skipped) throw vis.err;
              const bulk = vis.bulk;
              // threadsVisible weight already applied in promise .then
              const missingN = (bulk?.missingThreadIds || []).length;
              console.log(
                `[pr-plus] onRefresh visible-threads ${owner}/${repo}#${number}: ${Math.round(
                  nowMs() - tBulk
                )}ms (${bulk?.threads?.length || 0}/${visibleIds.length}` +
                  (missingN ? `, dropped ${missingN} remote-missing` : '') +
                  `, parallel-kickoff) pct=${prog.percent()}`
              );
              if (!stillOpen()) return;
              if (bulk) {
                const next = mergeFn(current.detail, bulk, 'refresh');
                // Threads slice only — do not replace other domains
                applyThreadsToStore(next);
                detailCache.set(key, current.detail);
              }
            } else {
              // No visible ids — credit thread weight so settle is not stuck
              prog.mark(
                'threadsVisible',
                uw.threadsVisible,
                'refresh',
                loadStageLabel('refresh-visible')
              );
              console.log(
                `[pr-plus] onRefresh visible-threads ${owner}/${repo}#${number}: metadata only (0 visible PRRT ids)`
              );
            }
            if (stillOpen()) {
              tryFinishOpenProgress(prog);
              render();
            }
            return;
          }

          if (!canPageThreads) {
            prog.mark(
              'threadsNewest',
              uw.threadsNewest,
              'refresh',
              loadStageLabel('refresh')
            );
            prog.mark(
              'threadsFollow',
              uw.threadsFollow,
              'refresh',
              loadStageLabel('refresh')
            );
            tryFinishOpenProgress(prog);
            render();
            return;
          }

          // 2a) last:100 (full-threads + mutation revalidate) — await parallel kickoff
          setLoadStage(
            'threads',
            loadStageLabel('threads-update'),
            true,
            { percent: prog.percent() }
          );
          render();
          const t0 = nowMs();
          const kick = await threadsNewestP;
          if (!kick.ok) throw kick.err || new Error('Threads fetch failed');
          const newest = kick.page;
          if (!stillOpen()) return;
          console.log(
            `[pr-plus] onRefresh last ${owner}/${repo}#${number}: ${Math.round(
              nowMs() - t0
            )}ms (${newest?.threads?.length || 0}) mode=${mode} parallel-kickoff pct=${prog.percent()}`
          );
          let next =
            typeof mergeFn === 'function'
              ? mergeFn(current.detail, newest, 'newest')
              : current.detail;
          applyThreadsToStore(next);
          next = current.detail;
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
                    {
                      direction: 'oldest',
                      cursor: null,
                      pageSize: 20,
                      signal,
                    }
                  );
                if (!stillOpen()) return;
                if (typeof mergeFn === 'function') {
                  next = mergeFn(next, oldest, 'oldest');
                  applyThreadsToStore(next);
                  next = current.detail;
                  detailCache.set(key, next);
                  render();
                }
              } catch {
                /* keep last-only */
              }
            }
            prog.mark(
              'threadsFollow',
              uw.threadsFollow,
              'threads',
              loadStageLabel('threads-earlier')
            );
            if (stillOpen() && next?.reviewThreadsMeta?.hasMore) {
              const props = buildProps();
              if (typeof props.onLoadMoreReviewThreads === 'function') {
                await props.onLoadMoreReviewThreads('all');
              }
            } else if (stillOpen()) {
              tryFinishOpenProgress(prog);
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
              setLoadStage(
                'threads',
                loadStageLabel('threads-unresolved'),
                true,
                { percent: prog.percent() }
              );
              render();
              const tBulk = nowMs();
              const bulk =
                await globalThis.PRTreeFetch.fetchReviewThreadsByIds(
                  remainingUnresolvedIds,
                  { signal }
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
            prog.mark(
              'threadsFollow',
              uw.threadsFollow,
              'threads',
              loadStageLabel('threads-unresolved')
            );
            if (stillOpen()) {
              applyThreadsToStore(next);
              detailCache.set(key, current.detail);
              tryFinishOpenProgress(prog);
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
            {
              direction: dir,
              cursor,
              pageSize: 100,
              signal: openFetchAbort?.signal || null,
            }
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
            applyThreadsToStore(step.detail);
            next = current.detail;
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
        // User/meta mutations: write meta slice with trustEmpty so clears stick
        const S = detailStoreApi();
        if (S) {
          ensureDetailStore(next);
          S.applyMeta(current.detailStore, S.pickMeta(next), {
            trustEmpty: true,
            source: 'patch',
            sketch: false,
          });
          publishDetailFromStore();
        } else {
          current.detail = next;
        }
        try {
          const key = detailKey(current.owner, current.repo, current.number);
          detailCache.set(key, current.detail);
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
          signal: openFetchAbort?.signal || null,
        });
      },
      /** Remaining PR commits beyond the initial page (for searchable picker). */
      onFetchAllPrCommits: async () => {
        if (!owner || !repo || !current.number) {
          throw new Error('No open pull request for commits');
        }
        if (!globalThis.PRTreeFetch?.fetchAllPrCommits) {
          throw new Error('Full commits fetch unavailable');
        }
        return globalThis.PRTreeFetch.fetchAllPrCommits(
          owner,
          repo,
          current.number
        );
      },
      /** Remaining PR files beyond the initial page (for searchable files nav). */
      onFetchAllPrFiles: async (options = {}) => {
        if (!owner || !repo || !current.number) {
          throw new Error('No open pull request for files');
        }
        if (!globalThis.PRTreeFetch?.fetchAllPrFiles) {
          throw new Error('Full files fetch unavailable');
        }
        return globalThis.PRTreeFetch.fetchAllPrFiles(owner, repo, current.number, {
          gitattributesText:
            options.gitattributesText ||
            current.detail?.gitattributesText ||
            '',
        });
      },
    };
  }

  /**
   * True when reactRoot is still bound to a live host element.
   * Soft-nav / Turbo often replace #prp-page-embed; reusing a detached root
   * paints into nothing while natives stay display:none.
   *
   * Note: mountPrModal stamps host.__prpReactRoot = createRoot(...), but
   * returns a {render,unmount} *wrapper*. Never compare stamp === reactRoot.
   */
