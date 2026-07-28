// TypeScript SoT — assembled by build scripts (classic runtime JS emit)

  function kickIndependentSideFetches({
    owner,
    repo,
    number,
    headSha = null,
    body = '',
    gen,
    stillOpenFn = null,
    signal = null,
  }) {
    const alive = () => {
      if (gen != null && gen !== detailFetchGen) return false;
      if (typeof stillOpenFn === 'function' && !stillOpenFn()) return false;
      return Boolean(current.open);
    };
    const settleSide = (key, partial) => {
      if (!alive()) return;
      if (partial && typeof partial === 'object') {
        // Slice-only write — never spreads into other domains
        applySideToStore(key, partial);
        try {
          const keyStr = detailKey(owner, repo, number);
          detailCache.set(keyStr, current.detail);
        } catch {
          /* ignore */
        }
      }
      setSideFlag(key, { pending: false, settled: true }, { render: true });
      markSideProgress(key);
      console.log(
        `[pr-plus] side-fetch ${key} ${owner}/${repo}#${number} painted`
      );
    };
    const failSide = (key, err) => {
      if (
        err?.name === 'AbortError' ||
        /aborted|AbortError/i.test(String(err?.message || ''))
      ) {
        // Aborted open — leave flags; modal likely closed or superseded
        return;
      }
      console.log(
        `[pr-plus] side-fetch ${key} soft-fail ${err?.message || err}`
      );
      // Soft-fail: stop skeleton so empty state can show (no infinite shimmer)
      if (alive()) {
        setSideFlag(key, { pending: false, settled: true });
        markSideProgress(key);
      }
    };
    /** Credit progress when a panel is skipped (no API / no headSha). */
    const creditSide = (key) => {
      markSideProgress(key);
    };

    const api = globalThis.PRTreeFetch;
    if (!api) {
      for (const k of [
        'files',
        'comments',
        'reviews',
        'commits',
        'checks',
        'development',
      ]) {
        creditSide(k);
      }
      return {
        filesP: null,
        commentsP: null,
        reviewsP: null,
        commitsP: null,
        checksP: null,
        developmentP: null,
      };
    }

    // Dedupe concurrent kicks for the same open gen (early kick + paintCoreNow)
    if (!current._sideKickStarted || current._sideKickGen !== gen) {
      current._sideKickStarted = new Set();
      current._sideKickGen = gen;
    }
    const started = current._sideKickStarted;
    const claim = (key) => {
      if (started.has(key)) return false;
      started.add(key);
      return true;
    };

    // Mark pending only when panel has no settled cache — revalidate keeps content
    const markPendingIfNeeded = (key, cond = true) => {
      if (cond && !current.sideSettled?.[key]) {
        setSideFlag(key, { pending: true }, { render: true });
      }
    };

    let filesP = Promise.resolve(null);
    let commentsP = Promise.resolve(null);
    let reviewsP = Promise.resolve(null);
    let commitsP = Promise.resolve(null);
    let checksP = Promise.resolve(null);
    let developmentP = Promise.resolve(null);

    const tl = getFetchTimeline();
    const wrap = (name, p, meta: any = undefined) =>
      tl && typeof tl.span === 'function' ? tl.span(name, p, meta) : p;

    if (claim('files')) {
      markPendingIfNeeded('files');
      filesP =
        typeof api.fetchPrFiles === 'function'
          ? wrap(
              'side.files',
              api
                .fetchPrFiles(owner, repo, number, {
                  signal,
                  headSha: headSha || null,
                  gitattributesText: current.detail?.gitattributesText || '',
                })
                .then((pack) => {
                  const files = Array.isArray(pack?.files)
                    ? pack.files
                    : Array.isArray(pack)
                      ? pack
                      : [];
                  const gitattributesText =
                    typeof pack?.gitattributesText === 'string'
                      ? pack.gitattributesText
                      : current.detail?.gitattributesText || '';
                  settleSide('files', { files, gitattributesText });
                  return pack;
                })
                .catch((err) => {
                  failSide('files', err);
                  return null;
                }),
              { headSha: headSha ? String(headSha).slice(0, 7) : null }
            )
          : Promise.resolve(null).then(() => {
              if (alive() && !current.sideSettled?.files) {
                setSideFlag('files', { pending: false, settled: true });
              }
              creditSide('files');
              return null;
            });
    }

    if (claim('comments')) {
      markPendingIfNeeded('comments');
      commentsP =
        typeof api.fetchPrIssueComments === 'function'
          ? wrap(
              'side.comments',
              Promise.all([
                api.fetchPrIssueComments(owner, repo, number, { signal }),
                typeof api.fetchPrTimelineEvents === 'function'
                  ? api
                      .fetchPrTimelineEvents(owner, repo, number, { signal })
                      .catch((err) => {
                        if (
                          err?.name === 'AbortError' ||
                          /aborted|AbortError/i.test(
                            String(err?.message || '')
                          )
                        ) {
                          throw err;
                        }
                        return [];
                      })
                  : Promise.resolve([]),
              ])
                .then(([page, events]) => {
                  const items = Array.isArray(page?.items)
                    ? page.items
                    : Array.isArray(page)
                      ? page
                      : [];
                  settleSide('comments', {
                    comments: items,
                    commentsMeta: page?.meta || {
                      page: 1,
                      perPage: items.length,
                      hasMore: false,
                      nextPage: null,
                      loadedCount: items.length,
                    },
                    timelineEvents: Array.isArray(events) ? events : [],
                  });
                  return page;
                })
                .catch((err) => {
                  failSide('comments', err);
                  return null;
                })
            )
          : Promise.resolve(null).then(() => {
              if (alive() && !current.sideSettled?.comments) {
                setSideFlag('comments', { pending: false, settled: true });
              }
              creditSide('comments');
              return null;
            });
    }

    if (claim('reviews')) {
      markPendingIfNeeded('reviews');
      reviewsP =
        typeof api.fetchPrReviews === 'function'
          ? wrap(
              'side.reviews',
              api
                .fetchPrReviews(owner, repo, number, { signal })
                .then((reviews) => {
                  settleSide('reviews', {
                    reviews: Array.isArray(reviews) ? reviews : [],
                  });
                  return reviews;
                })
                .catch((err) => {
                  failSide('reviews', err);
                  return null;
                })
            )
          : Promise.resolve(null).then(() => {
              if (alive() && !current.sideSettled?.reviews) {
                setSideFlag('reviews', { pending: false, settled: true });
              }
              creditSide('reviews');
              return null;
            });
    }

    if (claim('commits')) {
      markPendingIfNeeded('commits');
      commitsP =
        typeof api.fetchPrCommits === 'function'
          ? wrap(
              'side.commits',
              api
                .fetchPrCommits(owner, repo, number, { signal })
                .then((commits) => {
                  settleSide('commits', {
                    commits: Array.isArray(commits) ? commits : [],
                  });
                  return commits;
                })
                .catch((err) => {
                  failSide('commits', err);
                  return null;
                })
            )
          : Promise.resolve(null).then(() => {
              if (alive() && !current.sideSettled?.commits) {
                setSideFlag('commits', { pending: false, settled: true });
              }
              creditSide('commits');
              return null;
            });
    }

    // checks needs headSha — may be claimed later when core paints with sha
    if (headSha && claim('checks')) {
      markPendingIfNeeded('checks');
      checksP =
        typeof api.fetchPrChecks === 'function'
          ? wrap(
              'side.checks',
              api
                .fetchPrChecks(owner, repo, headSha, { signal })
                .then((checks) => {
                  settleSide('checks', {
                    checks: checks || {
                      state: 'unknown',
                      totalCount: 0,
                      statuses: [],
                      checkRuns: [],
                    },
                  });
                  return checks;
                })
                .catch((err) => {
                  failSide('checks', err);
                  return null;
                }),
              { headSha: String(headSha).slice(0, 7) }
            )
          : Promise.resolve(null).then(() => {
              if (alive() && !current.sideSettled?.checks) {
                setSideFlag('checks', { pending: false, settled: true });
              }
              creditSide('checks');
              return null;
            });
    } else if (!headSha) {
      // No head yet — do not credit checks until core paints headSha, unless
      // this open will never get head (rare). Credit only if already settled.
      if (current.sideSettled?.checks) creditSide('checks');
    }

    if (claim('development')) {
      markPendingIfNeeded('development');
      developmentP =
        typeof api.fetchPrDevelopment === 'function'
          ? wrap(
              'side.development',
              api
                .fetchPrDevelopment(owner, repo, number, {
                  signal,
                  body: body || '',
                })
                .then((dev) => {
                  if (!dev || typeof dev !== 'object') {
                    settleSide('development', {
                      linkedIssues: [],
                      developmentIssues: [],
                      projects: [],
                    });
                    return null;
                  }
                  settleSide('development', {
                    linkedIssues: Array.isArray(dev.linkedIssues)
                      ? dev.linkedIssues
                      : [],
                    developmentIssues: Array.isArray(dev.developmentIssues)
                      ? dev.developmentIssues
                      : [],
                    projects: Array.isArray(dev.projects) ? dev.projects : [],
                  });
                  return dev;
                })

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
  function ensureOpenPullsForStack(owner, repo, opts: any = {}) {
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
      timelineEvents: [],
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

