// TypeScript SoT — assembled by build scripts (classic runtime JS emit)
// Auto-refresh: poll PR head SHA while modal or full-page embed is active,
// only when the tab is visible and the user was active in the last 10 minutes.

  /** @type {ReturnType<typeof setInterval>|null} */
  let autoRefreshTimer = null;
  let autoRefreshListenersInstalled = false;
  let autoRefreshLastActionAt = Date.now();
  let autoRefreshProbeInFlight = false;
  /** Avoid re-entry while onRefresh is running from a probe hit */
  let autoRefreshRevalidating = false;

  function autoRefreshApi() {
    return globalThis.PRModalAutoRefresh || null;
  }

  function autoRefreshIdleMs() {
    const api = autoRefreshApi();
    const n = Number(api?.AUTO_REFRESH_IDLE_MS);
    return Number.isFinite(n) && n > 0 ? n : 10 * 60 * 1000;
  }

  function autoRefreshPollMs() {
    const api = autoRefreshApi();
    const n = Number(api?.AUTO_REFRESH_POLL_MS);
    return Number.isFinite(n) && n > 0 ? n : 45 * 1000;
  }

  /**
   * Record user activity (modal + embed share one clock).
   * @param {{ force?: boolean }} [opts]
   */
  function noteAutoRefreshAction(opts: any = {}) {
    const now = Date.now();
    const api = autoRefreshApi();
    if (typeof api?.nextActionAt === 'function') {
      autoRefreshLastActionAt = api.nextActionAt(
        autoRefreshLastActionAt,
        now,
        { force: Boolean(opts.force) }
      );
      return;
    }
    if (opts.force) {
      autoRefreshLastActionAt = now;
      return;
    }
    if (now - autoRefreshLastActionAt < 1000) return;
    autoRefreshLastActionAt = now;
  }

  function canRunAutoRefreshTick() {
    const api = autoRefreshApi();
    const input = {
      hostEnabled,
      surfaceOpen: Boolean(current.open),
      owner: current.owner,
      repo: current.repo,
      number: current.number,
      visibilityState:
        typeof document !== 'undefined' ? document.visibilityState : 'visible',
      lastActionAt: autoRefreshLastActionAt,
      now: Date.now(),
      loadBusy: Boolean(current.loadStage?.busy),
      idleMs: autoRefreshIdleMs(),
    };
    if (typeof api?.canAutoRefresh === 'function') {
      return Boolean(api.canAutoRefresh(input));
    }
    // Fallback if pure module not loaded
    if (!hostEnabled || !current.open) return false;
    if (!current.owner || !current.repo || !current.number) return false;
    if (input.visibilityState !== 'visible') return false;
    if (input.loadBusy) return false;
    if (Date.now() - autoRefreshLastActionAt > autoRefreshIdleMs()) return false;
    return true;
  }

  function headProbeIndicatesStale(baseline, next) {
    const api = autoRefreshApi();
    if (typeof api?.headProbeIndicatesStale === 'function') {
      return Boolean(api.headProbeIndicatesStale(baseline, next));
    }
    const a = String(baseline || '')
      .trim()
      .toLowerCase();
    const b = String(next || '')
      .trim()
      .toLowerCase();
    return Boolean(a && b && a !== b);
  }

  async function tickAutoRefresh() {
    if (!canRunAutoRefreshTick()) return;
    if (autoRefreshProbeInFlight || autoRefreshRevalidating) return;
    const owner = current.owner;
    const repo = current.repo;
    const number = current.number;
    const detail = current.detail;
    const baseline = String(detail?.headSha || '').trim();
    // Allow probe when SHA missing if we still have lifecycle fields to compare
    if (!baseline && detail?.state == null && detail?.draft == null) return;

    const api = globalThis.PRTreeFetch;
    if (typeof api?.fetchPrHeadProbe !== 'function') return;

    autoRefreshProbeInFlight = true;
    try {
      const probe = await api.fetchPrHeadProbe(owner, repo, number);
      if (
        !current.open ||
        String(current.owner || '') !== String(owner || '') ||
        String(current.repo || '') !== String(repo || '') ||
        Number(current.number) !== Number(number)
      ) {
        return;
      }
      if (!canRunAutoRefreshTick()) return;
      const nextHead = String(probe?.headSha || '').trim();
      const pure = autoRefreshApi();
      const lifecycleStale =
        typeof pure?.prProbeIndicatesStale === 'function'
          ? Boolean(
              pure.prProbeIndicatesStale(
                {
                  headSha: detail?.headSha,
                  draft: detail?.draft,
                  state: detail?.state,
                },
                probe
              )
            )
          : headProbeIndicatesStale(baseline, nextHead);
      if (!lifecycleStale) return;

      console.log(
        `[pr-plus] auto-refresh stale ${owner}/${repo}#${number}` +
          (baseline && nextHead && baseline !== nextHead
            ? ` head ${baseline.slice(0, 7)}→${nextHead.slice(0, 7)}`
            : ` draft/state`)
      );
      const props = typeof buildProps === 'function' ? buildProps() : null;
      if (typeof props?.onRefresh !== 'function') return;
      autoRefreshRevalidating = true;
      try {
        await props.onRefresh({ mode: 'revalidate' });
      } finally {
        autoRefreshRevalidating = false;
      }
    } catch (err) {
      if (
        err?.name === 'AbortError' ||
        /aborted|AbortError|Extension context invalidated/i.test(
          String(err?.message || err || '')
        )
      ) {
        return;
      }
      console.log(
        `[pr-plus] auto-refresh probe soft-fail ${err?.message || err}`
      );
    } finally {
      autoRefreshProbeInFlight = false;
    }
  }

  function onAutoRefreshVisibility() {
    if (typeof document === 'undefined') return;
    if (document.visibilityState === 'visible') {
      // Resume: one immediate tick if still within activity window
      void tickAutoRefresh();
    }
  }

  function onAutoRefreshUserEvent() {
    noteAutoRefreshAction();
  }

  /**
   * Install document activity + poll timer (idempotent).
   * Covers modal overlay and full-page embed via shared `current.open`.
   */
  function ensureAutoRefreshWatch() {
    if (!autoRefreshListenersInstalled) {
      autoRefreshListenersInstalled = true;
      try {
        document.addEventListener(
          'visibilitychange',
          onAutoRefreshVisibility,
          false
        );
        // Capture-phase so we see events inside shadow hosts / modal
        const opts = { capture: true, passive: true };
        document.addEventListener('pointerdown', onAutoRefreshUserEvent, opts);
        document.addEventListener('keydown', onAutoRefreshUserEvent, opts);
        document.addEventListener('scroll', onAutoRefreshUserEvent, opts);
        document.addEventListener('wheel', onAutoRefreshUserEvent, opts);
      } catch {
        /* ignore */
      }
    }
    if (autoRefreshTimer == null) {
      autoRefreshTimer = setInterval(() => {
        void tickAutoRefresh();
      }, autoRefreshPollMs());
    }
  }

  /** Call when pr+ opens a PR (modal or embed) so the idle clock is fresh. */
  function armAutoRefreshForOpen() {
    noteAutoRefreshAction({ force: true });
    ensureAutoRefreshWatch();
    // Probe once after paint settles
    try {
      setTimeout(() => {
        void tickAutoRefresh();
      }, 2500);
    } catch {
      /* ignore */
    }
  }
