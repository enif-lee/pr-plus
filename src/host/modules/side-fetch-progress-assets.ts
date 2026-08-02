// TypeScript SoT — assembled by build scripts (classic runtime JS emit)

  /**
   * True when a files[] snapshot can paint Diff (has patches, or only
   * legitimately patchless entries). Slim IDB rows use `_patchOmitted`.
   * Host pure global may lag rebuild — keep this inline for settle gates.
   */
  function filesSnapshotHasUsableDiffBodies(files) {
    if (!Array.isArray(files) || files.length === 0) return false;
    let missingRequired = false;
    for (const f of files) {
      if (!f || typeof f !== 'object') continue;
      if (f._patchOmitted) {
        missingRequired = true;
        continue;
      }
      const patch = typeof f.patch === 'string' ? f.patch : '';
      if (patch.length > 0) continue;
      const st = String(f.status || f.changeType || '').toLowerCase();
      const binary = Boolean(f.binary || f.isBinary);
      const noChange =
        Number(f.changes) === 0 ||
        (Number(f.additions || 0) === 0 && Number(f.deletions || 0) === 0);
      if (
        !(
          binary ||
          st === 'renamed' ||
          st === 'removed' ||
          st === 'deleted' ||
          noChange
        )
      ) {
        missingRequired = true;
      }
    }
    return !missingRequired;
  }

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
        // Aborted/superseded open — do not credit the new session's progress
        // and do not invent settled empty authority.
        return;
      }
      console.log(
        `[pr-plus] side-fetch ${key} soft-fail ${err?.message || err}`
      );
      // Soft-fail: clear pending skeleton + credit progress terminal, but do
      // NOT set settled:true (would invent authoritative empty and wipe lists).
      if (alive()) {
        setSideFlag(key, { pending: false }, { render: true });
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

    // Files list is deferred: conversation aside / Diff first-need owns the
    // fetch. Credit progress so open loadStage can finish without the list.
    // Same headSha + usable Diff bodies → settle from cache (no re-fetch).
    // Slim IDB (`_patchOmitted`) or head mismatch → leave unsettled so
    // ensureAllFiles fetches patches.
    if (claim('files')) {
      const snap = current.detail || null;
      const snapFiles = Array.isArray(snap?.files) ? snap.files : [];
      const idb =
        typeof globalThis !== 'undefined'
          ? (globalThis as any).PRModalDetailIdb
          : null;
      const reuse =
        typeof idb?.mayReuseFilesCommitsDiff === 'function'
          ? idb.mayReuseFilesCommitsDiff(snap, {
              headSha: headSha || snap?.headSha || null,
              changedFiles: snap?.changedFiles,
            })
          : null;
      const bodiesOk =
        reuse != null
          ? Boolean(reuse.reuseFiles)
          : filesSnapshotHasUsableDiffBodies(snapFiles) &&
            snapFiles.length > 0 &&
            Boolean(
              String(snap?.headSha || headSha || '')
                .trim()
            );
      const reason =
        reuse?.reason ||
        (bodiesOk ? 'reuse' : snapFiles.length ? 'cache-slim' : 'empty');
      try {
        console.log(
          `[pr-plus] side-fetch files ${owner}/${repo}#${number} ` +
            `cache-reuse=${bodiesOk ? 1 : 0} reason=${reason}` +
            (headSha ? ` head=${String(headSha).slice(0, 7)}` : '')
        );
        for (const id of [HOST_ID, embedHostId()]) {
          try {
            const el = document.getElementById(id);
            if (!el) continue;
            el.setAttribute(
              'data-prp-cache-files',
              bodiesOk ? 'reuse' : String(reason).slice(0, 24)
            );
            if (headSha) {
              el.setAttribute(
                'data-prp-head-sha',
                String(headSha).slice(0, 12)
              );
            }
          } catch {
            /* ignore */
          }
        }
      } catch {
        /* ignore */
      }
      if (current.sideSettled?.files && bodiesOk) {
        creditSide('files');
      } else if (snapFiles.length > 0 && bodiesOk) {
        // Same head + usable Diff bodies — mark settled, no re-fetch
        settleSide('files', {
          files: snapFiles,
          gitattributesText: current.detail?.gitattributesText || '',
        });
      } else {
        // Lazy, slim, or head-mismatch: Diff ensureAllFiles will fetch patches
        if (alive()) {
          setSideFlag(
            'files',
            { pending: false, settled: false },
            { render: false }
          );
        }
        creditSide('files');
      }
    }

    if (claim('comments')) {
      markPendingIfNeeded('comments');
      // Skip REST issue events when all system tips (labels/title/milestone) are off.
      let wantSystemEvents = true;
      try {
        const pure = (globalThis as any).PRModalConversationTimeline;
        const vis =
          prefs?.timelineVisibility ??
          pure?.DEFAULT_TIMELINE_VISIBILITY ??
          null;
        if (typeof pure?.shouldFetchSystemTimelineEvents === 'function') {
          wantSystemEvents = pure.shouldFetchSystemTimelineEvents(vis);
        } else {
          const v = vis || {};
          wantSystemEvents =
            v.labels !== false ||
            v.title !== false ||
            v.milestone !== false ||
            v.referenced !== false;
        }
      } catch {
        wantSystemEvents = true;
      }
      commentsP =
        typeof api.fetchPrIssueComments === 'function'
          ? wrap(
              'side.comments',
              Promise.all([
                api.fetchPrIssueComments(owner, repo, number, { signal }),
                wantSystemEvents &&
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
                  : Promise.resolve(null),
              ])
                .then(([page, events]) => {
                  const items = Array.isArray(page?.items)
                    ? page.items
                    : Array.isArray(page)
                      ? page
                      : [];
                  const patch: any = {
                    comments: items,
                    commentsMeta: page?.meta || {
                      page: 1,
                      perPage: items.length,
                      hasMore: false,
                      nextPage: null,
                      loadedCount: items.length,
                    },
                  };
                  // Only overwrite timelineEvents when we actually fetched
                  // (null skip keeps prior / empty until lazy tip re-enable).
                  if (Array.isArray(events)) {
                    patch.timelineEvents = events;
                  }
                  settleSide('comments', patch);
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

    // Commits list deferred (aside first-open / Diff commit picker).
    // Reuse only when same headSha as seed/core and cache has commits.
    if (claim('commits')) {
      const snap = current.detail || null;
      const idb =
        typeof globalThis !== 'undefined'
          ? (globalThis as any).PRModalDetailIdb
          : null;
      const reuse =
        typeof idb?.mayReuseFilesCommitsDiff === 'function'
          ? idb.mayReuseFilesCommitsDiff(snap, {
              headSha: headSha || snap?.headSha || null,
            })
          : null;
      const canReuseCommits =
        reuse != null
          ? Boolean(reuse.reuseCommits)
          : Array.isArray(snap?.commits) &&
            snap.commits.length > 0 &&
            Boolean(String(snap?.headSha || headSha || '').trim());
      try {
        console.log(
          `[pr-plus] side-fetch commits ${owner}/${repo}#${number} ` +
            `cache-reuse=${canReuseCommits ? 1 : 0}` +
            (reuse?.reason ? ` reason=${reuse.reason}` : '')
        );
      } catch {
        /* ignore */
      }
      if (current.sideSettled?.commits && canReuseCommits) {
        creditSide('commits');
      } else if (
        canReuseCommits &&
        Array.isArray(snap?.commits) &&
        snap.commits.length > 0
      ) {
        settleSide('commits', {
          commits: snap.commits,
        });
      } else {
        if (alive()) {
          setSideFlag(
            'commits',
            { pending: false, settled: false },
            { render: false }
          );
        }
        creditSide('commits');
      }
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

    /**
     * Progress bookkeeping stays live while this prog owns the open bar.
     * Do not gate on detailFetchGen: meta patches may bump gen to supersede
     * soft-refresh, and side-data patches previously did too — either would
     * leave the header stuck on the last panel label (often "Loading reviews…")
     * even after that panel finished.
     */
    function progressAlive() {
      if (activeOpenProgress !== prog) return false;
      return Boolean(current.open);
    }

    function mark(key, weight, phase, label, opts = null) {
      if (!progressAlive()) return tracker.percent();
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

    const prog = {
      mark,
      percent: () => tracker.percent(),
      tracker,
      weights: w,
      /** True when data writes for this open gen are still valid. */
      stillOpen: alive,
    };
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
    try {
      publishE2eLoadHook(
        `setLoadStage:${phase || ''}:${b ? 'busy' : 'idle'}`
      );
    } catch {
      /* ignore */
    }
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
      case 'threads-shell':
        return 'Updating threads…';
      case 'threads-comments':
        return 'Updating comments…';
      case 'threads-reactions':
        return 'Updating reactions…';
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
          const a = Math.min(Math.floor(loaded), 999);
          const b = Math.min(Math.floor(total), 999);
          // No padStart spaces — fixed badge width + spaces caused flicker thrash.
          return `Loading comments ${a}/${b}`;
        }
        if (Number.isFinite(loaded) && loaded >= 0) {
          const a = Math.min(Math.floor(loaded), 999);
          return `Loading comments · ${a}`;
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
    try {
      publishE2eLoadHook('clearLoadStage');
    } catch {
      /* ignore */
    }
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
  /** epoch ms of last successful host open-list fetch for openPullsFetchedKey */
  let openPullsFetchedAt = 0;
  /** Monotonic gen — only the latest force/fetch may commit results */
  let openPullsFetchGen = 0;
  /** @type {AbortController|null} */
  let openPullsFetchAbort = null;
  /**
   * PR numbers removed by local lifecycle (merge/close) for the current
   * openPullsFetchedKey. Network open-list lag must not resurrect them.
   * @type {Set<number>}
   */
  let openPullsTombstones = new Set();
  /** Default SWR age for open list (force always bypasses). */
  const OPEN_PULLS_MAX_AGE_MS = 30_000;

  function openPullsLifecycleApi() {
    return globalThis.PRModalOpenPullsLifecycle || null;
  }

  function resolveOpenPulls() {
    try {
      const app = globalThis.__PR_TREE_APP__;
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

  function filterOpenPullsLocal(prs) {
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
      const app = globalThis.__PR_TREE_APP__;
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
  function ensureOpenPullsForStack(owner, repo, opts: any = {}) {
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
    if (!globalThis.PRTreeFetch?.fetchOpenPulls) {
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
        const prs = await globalThis.PRTreeFetch.fetchOpenPulls(o, r, null, {
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
          const app = globalThis.__PR_TREE_APP__;
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
    owner,
    repo,
    number,
    opts: any = {}
  ) {
    const signal = opts?.signal || null;
    const cacheDetail = opts?.cacheDetail || null;
    const forceFull = Boolean(opts?.forceFull);
    const RT =
      typeof globalThis !== 'undefined' && globalThis.PRModalReviewThreads
        ? globalThis.PRModalReviewThreads
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
                cacheDetail.reviewThreads.some((t) => t?.threadNodeId)) ||
                (Array.isArray(cacheDetail.reviewComments) &&
                  cacheDetail.reviewComments.some((c) => c?.threadNodeId)))
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
    const fetchPage = (size, transport: any = {}) =>
      globalThis.PRTreeFetch.fetchReviewThreadsPage(owner, repo, number, {
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
        const F = globalThis.PRTreeFetch;
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
              .filter((c) => c && c.id != null && c.inReplyToId == null)
              .map((r) => ({
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

    const pageHasData = (p) =>
      (Array.isArray(p?.threads) && p.threads.length > 0) ||
      (Array.isArray(p?.comments) && p.comments.length > 0);

    let page = null;
    let escalated = false;
    let earlyExit = false;
    let hostRestFallback = false;
    try {
      page = await fetchPage(pageSize);
    } catch (err) {
      if (
        err?.name === 'AbortError' ||
        /aborted|AbortError/i.test(String(err?.message || ''))
      ) {
        throw err;
      }
      // GraphQL remaining=0 / SW throw → still try host REST comments.
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
          page = await fetchPage(apiMax, { forceGraphql: true });
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

    // No REST host fallback — GraphQL empty is authoritative.

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

    // Progress stage: shell list/meta is ready.
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

    // Eager full comments + reaction counts on host (by-ids) so the open bar
    // can advance threads → comments → reactions separately.
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
          (t) => t && t.commentsLoaded !== true && !Boolean(t.resolved)
        ));
    let eagerN = 0;
    if (
      needBodies &&
      page?.source === 'graphql' &&
      typeof globalThis.PRTreeFetch?.fetchReviewThreadsByIds === 'function' &&
      selectEager
    ) {
      const eagerIds = selectEager(page.threads || [], {
        forceAll: Boolean(forceFull),
      });
      eagerN = eagerIds.length;
      if (eagerIds.length) {
        try {
          try {
            if (typeof opts?.onStage === 'function') {
              opts.onStage('comments-start', { ids: eagerIds.length });
            }
          } catch {
            /* ignore */
          }
          const bulk = await globalThis.PRTreeFetch.fetchReviewThreadsByIds(
            eagerIds,
            { signal }
          );
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

    try {
      if (typeof opts?.onStage === 'function') {
        opts.onStage('comments', {
          page,
          eager: eagerN,
          skipped: eagerN === 0,
        });
        // Reaction counts ship on the same by-ids document (reactors{totalCount}).
        opts.onStage('reactions', {
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

