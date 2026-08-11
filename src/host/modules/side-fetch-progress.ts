  // continued host module segment
  /** Force-clear a stuck open progress pill after shell is interactive. */
  let openProgressWatchdogTimer = null;
  function armOpenProgressWatchdog(ms = 10_000) {
    // Absolute deadline from the first critical stage. Re-arming on every
    // label/percent update allowed a busy pill to extend indefinitely.
    if (openProgressWatchdogTimer) return;
    openProgressWatchdogTimer = setTimeout(() => {
      openProgressWatchdogTimer = null;
      if (!current.open || !current.loadStage?.busy) return;
      const d = current.detail;
      if (!d || (d.title == null && d.number == null)) return;
      if (current.loading) {
        armOpenProgressWatchdog(1_000);
        return;
      }
      console.log(
        '[pr-plus] open progress watchdog: force clearLoadStage (shell ready, bar still busy)'
      );
      clearLoadStage();
      try {
        render();
      } catch {
        /* ignore */
      }
    }, ms);
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
      const has = (k) => tracker.has(k);
      const lp = globalThis.PRModalLoadProgress;
      // Critical bar % only (sides do not dilute 0–100 progress)
      let percent = Math.min(99, Math.max(0, res.percent));
      if (typeof lp?.criticalProgressPercent === 'function') {
        percent = Math.min(
          99,
          Math.max(0, Number(lp.criticalProgressPercent(has, prog.weights)) || 0)
        );
      }
      if (res.added) {
        const criticalOk =
          typeof lp?.criticalProgressComplete === 'function'
            ? Boolean(lp.criticalProgressComplete(has))
            : false;
        const allOk =
          typeof lp?.openProgressFullyComplete === 'function'
            ? Boolean(lp.openProgressFullyComplete(has))
            : false;
        if (allOk) {
          // tryFinish will clear
        } else if (criticalOk) {
          // Progress bar done — show stats + border loading
          setLoadStage('background', null, false, {
            mode: 'background',
            background: true,
            percent: 100,
            ...(opts && typeof opts === 'object' ? opts : {}),
          });
        } else {
          setLoadStage(phase, label, true, {
            percent,
            mode: 'critical',
            ...(opts && typeof opts === 'object' ? opts : {}),
          });
        }
        try {
          render();
        } catch {
          /* ignore */
        }
      }
      tryFinishOpenProgress(prog);
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
    if (!phase && !label && !(opts && (opts.mode === 'background' || opts.background))) {
      current.loadStage = null;
      return;
    }
    const modeRaw =
      opts && opts.mode != null
        ? String(opts.mode)
        : opts && opts.background
          ? 'background'
          : null;
    const isBackground = modeRaw === 'background' || Boolean(opts?.background);
    const b = Boolean(busy) && !isBackground;
    // Do not re-raise **critical** progress once critical (or full) is complete.
    if (b && isCriticalProgressComplete(activeOpenProgress)) {
      if (isOpenProgressComplete(activeOpenProgress)) {
        clearLoadStage();
        try {
          render();
        } catch {
          /* ignore */
        }
        return;
      }
      // Stay on background border loading
      current.loadStage = {
        phase: 'background',
        label: null,
        busy: false,
        percent: 100,
        mode: 'background',
        background: true,
      };
      try {
        publishE2eLoadHook('setLoadStage:background:hold');
      } catch {
        /* ignore */
      }
      return;
    }
    // Full done: refuse any re-raise
    if ((b || isBackground) && isOpenProgressComplete(activeOpenProgress)) {
      clearLoadStage();
      try {
        render();
      } catch {
        /* ignore */
      }
      return;
    }
    const fraction =
      opts && Number.isFinite(opts.phaseFraction) ? opts.phaseFraction : undefined;
    // Prefer explicit percent from fetch-unit marks; else derive from phase
    const percent =
      opts && Number.isFinite(opts.percent)
        ? Math.min(100, Math.max(0, Math.round(opts.percent)))
        : loadStagePercent(phase, b, fraction);
    // Never decrease percent during a busy critical session (parallel races).
    // Busy hard-cap 99 — only clearLoadStage removes the pill (never show 100% stuck).
    const prev =
      current.loadStage && Number.isFinite(current.loadStage.percent)
        ? Number(current.loadStage.percent)
        : 0;
    const nextPercent = b
      ? Math.min(
          99,
          current.loadStage && current.loadStage.busy
            ? Math.max(prev, percent)
            : percent
        )
      : percent;
    current.loadStage = {
      phase: phase || null,
      label: isBackground ? null : label || null,
      busy: b,
      percent: nextPercent,
      mode: isBackground ? 'background' : b ? 'critical' : modeRaw || null,
      background: isBackground,
    };
    if (b) armOpenProgressWatchdog(10_000);
    try {
      publishE2eLoadHook(
        `setLoadStage:${phase || ''}:${isBackground ? 'background' : b ? 'busy' : 'idle'}`
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
  /**
   * Short, near-constant-width load copy for the header stats badge.
   * Locale via pure PRModalI18n + data-prp-app-locale (or English fallback).
   */
  function loadStageLabel(kind, extra = null) {
    try {
      const pure = (globalThis as any).PRModalI18n;
      let locale = 'en';
      try {
        const el = document?.documentElement;
        locale =
          el?.getAttribute?.('data-prp-app-locale') ||
          el?.getAttribute?.('data-prp-ui-language') ||
          'en';
        if (locale === 'auto') {
          locale = el?.getAttribute?.('lang') || 'en';
        }
      } catch {
        locale = 'en';
      }
      if (typeof pure?.formatLoadStageLabel === 'function') {
        return pure.formatLoadStageLabel(kind, extra, locale);
      }
      // Inline map when pure helper not yet bundled into PRModalI18n
      if (typeof pure?.formatMessage === 'function') {
        const t = (key: string, subs?: Record<string, string | number>) => {
          const m = pure.formatMessage(key, locale, subs);
          return m && m !== key ? m : '';
        };
        const n = Number(extra?.count);
        const loaded = Number(extra?.loaded);
        const total = Number(extra?.total);
        const k = String(kind || '');
        const map: Record<string, string> = {
          core: t('load_stage_core'),
          'core-full': t('load_stage_core_full'),
          revalidate: t('load_stage_revalidate'),
          refresh: t('load_stage_refresh'),
          'refresh-meta': t('load_stage_refresh_meta'),
          'refresh-visible': t('load_stage_refresh_visible'),
          'refresh-all': t('load_stage_refresh_all'),
          'threads-load': t('load_stage_threads_load'),
          'threads-update': t('load_stage_threads_update'),
          'threads-shell': t('load_stage_threads_update'),
          'threads-comments': t('load_stage_threads_comments'),
          'threads-reactions': t('load_stage_threads_reactions'),
          'threads-earlier': t('load_stage_threads_earlier'),
          'threads-unresolved': t('load_stage_threads_unresolved'),
          'threads-more': t('load_stage_threads_more'),
          'refresh-failed': t('load_stage_refresh_failed'),
          'threads-failed': t('load_stage_threads_failed'),
          'threads-more-failed': t('load_stage_threads_more_failed'),
          'threads-all-failed': t('load_stage_threads_all_failed'),
        };
        if (map[k]) return map[k];
        if (k === 'threads-visible') {
          const c = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
          const num = String(Math.min(c, 99)).padStart(2, '0');
          return (
            t('load_stage_threads_visible', { count: num }) ||
            `Updating ${num} threads…`
          );
        }
        if (k === 'threads-all') {
          if (
            Number.isFinite(loaded) &&
            loaded >= 0 &&
            Number.isFinite(total) &&
            total > 0
          ) {
            return (
              t('load_stage_threads_all_n', {
                loaded: Math.min(Math.floor(loaded), 999),
                total: Math.min(Math.floor(total), 999),
              }) || `Loading comments ${loaded}/${total}`
            );
          }
          if (Number.isFinite(loaded) && loaded >= 0) {
            return (
              t('load_stage_threads_all_count', {
                loaded: Math.min(Math.floor(loaded), 999),
              }) || `Loading comments · ${loaded}`
            );
          }
          return t('load_stage_threads_all') || 'Loading all comments…';
        }
        if (k === 'files-all' || k === 'files-load') {
          if (
            Number.isFinite(loaded) &&
            loaded >= 0 &&
            Number.isFinite(total) &&
            total > 0
          ) {
            return (
              t('load_stage_files_n', {
                loaded: Math.min(Math.floor(loaded), 999),
                total: Math.min(Math.floor(total), 999),
              }) || `Loading files ${loaded}/${total}`
            );
          }
          return t('load_stage_files_all') || 'Loading all files…';
        }
        if (k === 'panels') {
          const panel = String(extra?.panel || '');
          const pk =
            panel === 'files'
              ? 'load_stage_panel_files'
              : panel === 'comments'
                ? 'load_stage_panel_comments'
                : panel === 'reviews'
                  ? 'load_stage_panel_reviews'
                  : panel === 'commits'
                    ? 'load_stage_panel_commits'
                    : panel === 'checks'
                      ? 'load_stage_panel_checks'
                      : panel === 'development'
                        ? 'load_stage_panel_development'
                        : 'load_stage_panels';
          return t(pk) || 'Loading panels…';
        }
        const msg = String(extra?.message || kind || '').trim();
        if (msg) return msg.length > 26 ? `${msg.slice(0, 24)}…` : msg;
        return t('load_stage_loading') || 'Loading…';
      }
    } catch {
      /* fall through */
    }
    // Last-resort English (pure catalogs unavailable)
    return String(extra?.message || kind || 'Loading…').slice(0, 26);
  }

  function clearLoadStage() {
    if (openProgressWatchdogTimer) {
      clearTimeout(openProgressWatchdogTimer);
      openProgressWatchdogTimer = null;
    }
    try {
      if (typeof clearBackgroundHoldTimer === 'function') {
        clearBackgroundHoldTimer();
      }
    } catch {
      /* ignore */
    }
    try {
      backgroundHoldUntil = 0;
    } catch {
      /* ignore */
    }
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
