  // continued host module segment
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

