  // continued
  function removeGithubPrToggle() {
    try {
      document.getElementById(GH_PR_TOGGLE_ID)?.remove();
    } catch {
      /* ignore */
    }
  }

  function openEmbedShortcutLabel() {
    try {
      const pe = pageEmbedApi();
      const sc = pe?.EMBED_OPEN_SHORTCUT || pe?.EMBED_RESTORE_SHORTCUT;
      if (!sc) return '⌘⇧E';
      const isMac =
        typeof navigator !== 'undefined' &&
        /Mac|iPhone|iPad/.test(navigator.platform || '');
      return isMac ? sc.label || '⌘⇧E' : sc.labelWin || 'Ctrl+Shift+E';
    } catch {
      return '⌘⇧E';
    }
  }

  /** Enter embed for the current native GH PR URL (header button + ⌘⇧E). */
  function openEmbedFromNativePr() {
    if (!hostEnabled) return { ok: false, reason: 'disabled' };
    if (current.open && isEmbedPresentation(current.presentation)) {
      return { ok: false, reason: 'embed-open' };
    }
    const t = parsePrPagePath(
      typeof location !== 'undefined' ? location.pathname : ''
    );
    if (!t) return { ok: false, reason: 'not-pr-page' };
    removeGithubPrToggle();
    void openModal({
      owner: t.owner,
      repo: t.repo,
      number: t.number,
      page: t.page,
      presentation: 'embed',
    });
    return { ok: true, owner: t.owner, repo: t.repo, number: t.number };
  }

  function isEditableKeyTarget(target) {
    const el = target;
    if (!el || typeof el !== 'object') return false;
    try {
      if (el.isContentEditable) return true;
      const tag = String(el.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
      if (el.closest?.('input, textarea, select, [contenteditable="true"]')) {
        return true;
      }
    } catch {
      /* ignore */
    }
    return false;
  }

  /**
   * Native GH PR page: ⌘⇧E / Ctrl+Shift+E opens pr+ (inverse of restore-native).
   * Installed once; no-op when embed is already active (App handles restore).
   */
  let nativePrShortcutBound = false;
  function ensureNativePrOpenShortcut() {
    if (nativePrShortcutBound) return;
    nativePrShortcutBound = true;
    document.addEventListener(
      'keydown',
      (e) => {
        if (!hostEnabled) return;
        if (current.open && isEmbedPresentation(current.presentation)) return;
        if (isEditableKeyTarget(e.target)) return;
        const pe = pageEmbedApi();
        const resolve =
          pe?.resolveEmbedShortcutAction ||
          (typeof globalThis !== 'undefined' &&
            globalThis.PRModalPageEmbed?.resolveEmbedShortcutAction);
        const action =
          typeof resolve === 'function'
            ? resolve({
                mod: e.metaKey || e.ctrlKey,
                shift: e.shiftKey,
                key: e.key,
                presentation: 'modal',
                onNativePrPage: Boolean(
                  parsePrPagePath(
                    typeof location !== 'undefined' ? location.pathname : ''
                  )
                ),
                editableTarget: false,
              })
            : null;
        if (action !== 'openEmbedView') return;
        e.preventDefault();
        e.stopPropagation();
        openEmbedFromNativePr();
      },
      true
    );
  }

  /**
   * On native GH PR pages (when pr+ embed is off), show a toggle next to the
   * PR header to open the pr+ in-page view.
   */
  function ensureGithubPrToggle() {
    ensureNativePrOpenShortcut();
    if (!hostEnabled) {
      removeGithubPrToggle();
      return { ok: false, reason: 'disabled' };
    }
    const path =
      typeof location !== 'undefined' ? location.pathname : '';
    const target = parsePrPagePath(path);
    if (!target) {
      removeGithubPrToggle();
      return { ok: false, reason: 'not-pr-page' };
    }
    // Embed already open — restore control lives in pr+ header
    if (
      current.open &&
      isEmbedPresentation(current.presentation)
    ) {
      removeGithubPrToggle();
      return { ok: false, reason: 'embed-open' };
    }

    const scLabel = openEmbedShortcutLabel();
    let btn = document.getElementById(GH_PR_TOGGLE_ID);
    if (!btn) {
      btn = document.createElement('button');
      btn.id = GH_PR_TOGGLE_ID;
      btn.type = 'button';
      // Match Primer PR header actions (32px / 14px / parent gap) — see styles.css
      btn.className = 'prp-gh-open-toggle';
      btn.setAttribute('data-prp-gh-toggle', '1');
      btn.setAttribute('aria-label', `Open with pr+ (${scLabel})`);
      btn.title = `Open with pr+ (${scLabel})`;
      btn.textContent = 'pr+';
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openEmbedFromNativePr();
      });
    } else {
      btn.setAttribute('aria-label', `Open with pr+ (${scLabel})`);
      btn.title = `Open with pr+ (${scLabel})`;
    }

    const mount = findGithubPrHeaderMount();
    if (!mount) {
      // Keep button if already mounted; otherwise nothing to attach to yet
      if (!btn.isConnected) {
        return { ok: false, reason: 'no-mount' };
      }
      return { ok: true, reason: 'already-mounted' };
    }
    if (btn.parentElement !== mount) {
      // Prefer end of actions cluster (right side of PR header)
      try {
        mount.appendChild(btn);
      } catch {
        try {
          mount.insertBefore(btn, mount.firstChild);
        } catch {
          return { ok: false, reason: 'append-failed' };
        }
      }
    }
    return { ok: true, owner: target.owner, repo: target.repo, number: target.number };
  }

  /** True after at least one successful prefs read (open can skip blocking wait). */
  let prefsReady = false;
  let prefsWarmP = null;
  let warmUpP = null;

  async function refreshPrefs() {
    try {
      const next = await globalThis.PRTreeStorage?.getExtensionPrefs?.();
      if (next && typeof next === 'object') {
        prefs = {
          fastReview: next.fastReview !== false,
          reverseComments: next.reverseComments !== false,
          autoOpenEmbed: next.autoOpenEmbed !== false,
          singleFileMode: next.singleFileMode === true,
          shortcutMonitorSize: normalizeShortcutMonitorSize(
            next.shortcutMonitorSize
          ),
          timelineVisibility: normalizeTimelineVisibilityLocal(
            next.timelineVisibility
          ),
        };
      }
      prefsReady = true;
    } catch {
      prefs = {
        ...DEFAULT_PREFS,
        timelineVisibility: { ...DEFAULT_TIMELINE_VISIBILITY },
      };
      prefsReady = true;
    }
    return prefs;
  }

  /**
   * Non-blocking prefs read used after list paint. Dedupes concurrent callers.
   * @returns {Promise<object>}
   */
  function warmPrefs() {
    if (prefsReady) return Promise.resolve(prefs);
    if (prefsWarmP) return prefsWarmP;
    prefsWarmP = refreshPrefs().finally(() => {
      prefsWarmP = null;
    });
    return prefsWarmP;
  }

  /**
   * After pulls list paints: finish modal CSS + prefs so click → first paint
   * does not wait on storage/network for those. Bundle JS is already injected
   * via content_scripts (not loaded on click).
   * @returns {Promise<{ css: boolean, prefs: boolean }>}
   */
  function warmUp() {
    if (warmUpP) return warmUpP;
    warmUpP = (async () => {
      const out = { css: false, prefs: false };
      try {
        await ensureAssets();
        out.css = Boolean(modalCssReady);
      } catch {
        /* ignore */
      }
      try {
        await warmPrefs();
        out.prefs = prefsReady;
      } catch {
        /* ignore */
      }
      // Pre-create list overlay host (hidden until open) so ensureHost is free
      try {
        if (!document.getElementById(HOST_ID) && !current.open) {
          const host = document.createElement('div');
          host.id = HOST_ID;
          document.documentElement.appendChild(host);
          stampHostCssReady(host);
        } else {
          stampHostCssReady(document.getElementById(HOST_ID));
        }
      } catch {
        /* ignore */
      }
      return out;
    })().finally(() => {
      // Allow a later re-warm after long idle if needed
      warmUpP = null;
    });
    return warmUpP;
  }

  /**
   * When a previously-off system tip is turned on and we have no events yet
   * (partial-fetch skip), load REST issue events and merge into detail.
   */
  async function maybeLazyFetchTimelineEvents(prevVis: any, nextVis: any) {
    if (!current.open || !current.detail) return;
    const pure = (globalThis as any).PRModalConversationTimeline;
    const te = current.detail?.timelineEvents;
    let need = false;
    if (typeof pure?.needsLazyTimelineEventsFetch === 'function') {
      need = pure.needsLazyTimelineEventsFetch(prevVis, nextVis, te);
    } else {
      const want =
        nextVis?.labels !== false ||
        nextVis?.title !== false ||
        nextVis?.milestone !== false;
      const had =
        prevVis?.labels !== false ||
        prevVis?.title !== false ||
        prevVis?.milestone !== false;
      need = want && (!had || !Array.isArray(te) || te.length === 0);
    }
    if (!need) return;
    const api = (globalThis as any).PRTreeFetch;
    if (typeof api?.fetchPrTimelineEvents !== 'function') return;
    const owner = current.owner || current.detail.owner;
    const repo = current.repo || current.detail.repo;
    const number = current.number || current.detail.number;
    if (!owner || !repo || !number) return;
    try {
      const events = await api.fetchPrTimelineEvents(owner, repo, number, {});
      if (!current.open || Number(current.number) !== Number(number)) return;
      const list = Array.isArray(events) ? events : [];
      const prev = Array.isArray(current.detail?.timelineEvents)
        ? current.detail.timelineEvents
        : [];
      const merged =
        typeof pure?.mergeTimelineEventsById === 'function'
          ? pure.mergeTimelineEventsById(prev, list)
          : list.length
            ? list
            : prev;
      const S = detailStoreApi();
      if (S && current.detailStore) {
        const items = Array.isArray(current.detailStore?.comments?.items)
          ? current.detailStore.comments.items
          : Array.isArray(current.detail?.comments)
            ? current.detail.comments
            : [];
        S.applyComments(current.detailStore, items, {
          settled: Boolean(current.detailStore?.comments?.settled),
          pageMeta: current.detailStore?.comments?.pageMeta,
          timelineEvents: merged,
        });
        publishDetailFromStore();
      } else if (current.detail) {
        current.detail = { ...current.detail, timelineEvents: merged };
      }
      render();
    } catch {
      /* soft — filter still works with local/empty events */
    }
  }

  function ensurePrefsWatch() {
    if (prefsWatchUnsub) return;
    try {
      prefsWatchUnsub =
        globalThis.PRTreeStorage?.watchExtensionPrefs?.((next) => {
          const prevAuto = prefs.autoOpenEmbed !== false;
          const prevVis = prefs.timelineVisibility;
          prefs = {
            fastReview: next?.fastReview !== false,
            reverseComments: next?.reverseComments !== false,
            autoOpenEmbed: next?.autoOpenEmbed !== false,
            singleFileMode: next?.singleFileMode === true,
            shortcutMonitorSize: normalizeShortcutMonitorSize(
              next?.shortcutMonitorSize
            ),
            timelineVisibility: normalizeTimelineVisibilityLocal(
              next?.timelineVisibility
            ),
          };
          if (current.open) {
            render();
            // Lazy-load system timeline events when a tip is re-enabled
            try {
              void maybeLazyFetchTimelineEvents(
                prevVis,
                prefs.timelineVisibility
              );
            } catch {
              /* ignore */
            }
          }
          // Turning auto-open on while on a PR page: enter embed.
          // Turning it off does not force-close an open embed.
          if (!prevAuto && prefs.autoOpenEmbed) {
            try {
              tryEmbedFromLocation();
            } catch {
              /* ignore */
            }
          }
          try {
            ensureGithubPrToggle();
          } catch {
            /* ignore */
          }
        }) || null;
    } catch {
      prefsWatchUnsub = null;
    }
  }

  function loadStagePercent(phase, busy = true, phaseFraction) {
    const lp = globalThis.PRModalLoadProgress;
    if (lp && typeof lp.percentFromStageProgress === 'function') {
      return lp.percentFromStageProgress({
        phase,
        busy: Boolean(busy),
        phaseFraction,
      });
    }
    // Fallback weights if pure helper not injected
    const map = {
      start: 5,
      core: 25,
      'core-full': 25,
      revalidate: 20,
      threads: 70,
      refresh: 70,
      done: 100,
    };
    const base = map[String(phase || '')] ?? (busy ? 15 : 100);
    return Math.min(100, Math.max(0, Math.round(base)));
  }

  function fetchUnitWeights() {
    const lp = globalThis.PRModalLoadProgress;
    return (
      (lp && lp.FETCH_UNIT_WEIGHTS) || {
        start: 4,
        core: 18,
        threadsShell: 8,
        threadsComments: 8,
        threadsReactions: 4,
        threadsNewest: 8,
        threadsRemaining: 8,
        threadsEarlier: 4,
        threadsFollow: 12,
        files: 12,
        comments: 10,
        reviews: 10,
        commits: 10,
        checks: 10,
        development: 6,
        threadsVisible: 20,
      }
    );
  }

  function openProgressKeys() {
    const lp = globalThis.PRModalLoadProgress;
    return (
      (lp && lp.OPEN_PROGRESS_KEYS) || [
        'start',
        'core',
        'threadsShell',
        'threadsComments',
        'threadsReactions',
        'files',
        'comments',
        'reviews',
        'commits',
        'checks',
        'development',
      ]
    );
  }

  /** Active open/refresh progress — side fetches mark into this. */
  let activeOpenProgress = null;

  function markSideProgress(name, labelKind = 'panels') {
    const prog = activeOpenProgress;
    if (!prog || typeof prog.mark !== 'function') return;
    const w = Number(prog.weights?.[name]) || 0;
    if (w <= 0) return;
    if (prog.tracker && typeof prog.tracker.has === 'function' && prog.tracker.has(name)) {
      tryFinishOpenProgress(prog);
      return;
    }
    prog.mark(
      name,
      w,
      'panels',
      loadStageLabel(labelKind, { panel: name })
    );
    tryFinishOpenProgress(prog);
  }

  /**
   * Ready only when core+threads+all independent panels have been credited.
   * (Percent is capped at 99 in mark(); clearLoadStage owns 100.)
   */
  function tryFinishOpenProgress(prog = activeOpenProgress) {
    if (!prog?.tracker || typeof prog.tracker.has !== 'function') return false;
    const has = (k) => prog.tracker.has(k);
    const sides = [
      'files',
      'comments',
      'reviews',
      'commits',
      'checks',
      'development',
    ];
    const sidesDone = sides.every(has);
    const openDone = openProgressKeys().every(has);
    const lp = globalThis.PRModalLoadProgress;
    const threadsOk =
      typeof lp?.threadsProgressComplete === 'function'
        ? Boolean(lp.threadsProgressComplete(has))
        : has('threadsVisible') ||
          (has('threadsShell') &&
            has('threadsComments') &&
            has('threadsReactions')) ||
          (has('threadsNewest') &&
            has('threadsRemaining') &&
            has('threadsEarlier')) ||
          (has('threadsNewest') && has('threadsFollow'));
    const refreshDone =
      has('start') && has('core') && threadsOk && sidesDone;
    if (!openDone && !refreshDone) return false;
    clearLoadStage();
    try {
      render();
    } catch {
      /* ignore */
    }
    // Mirror GraphQL cost log into sessionStorage/DOM for e2e observation.
    try {
      void globalThis.PRTreeFetch?.getGraphqlCostLog?.();
    } catch {
      /* ignore */
    }
    return true;
  }

  /**
   * Per-open/refresh progress tracker. Each parallel fetch should call
   * `mark(key, weight, phase, label)` when *that* promise resolves so the bar
   * advances with real timing (not only when Promise.all settles).
   */
  function emptySideFlags() {
    return {
      commits: false,
      checks: false,
      development: false,
      files: false,
      comments: false,
      reviews: false,
    };
  }

  /**
   * Infer which side panels already have durable data (cache / prior fetch).
   * Prefer explicit `_sideSettled` (includes empty-but-loaded panels).
   * Fall back to non-empty arrays so older cache without markers still works.
   */
  function sideSettledFromDetail(detail) {
    const d = detail && typeof detail === 'object' ? detail : null;
    if (!d || d._sketch) return emptySideFlags();
    const marked =
      d._sideSettled && typeof d._sideSettled === 'object' ? d._sideSettled : {};
    const checks = d.checks;
    const hasCheckItems =
      checks &&
      ((Array.isArray(checks.statuses) && checks.statuses.length > 0) ||
        (Array.isArray(checks.checkRuns) && checks.checkRuns.length > 0) ||
        (Array.isArray(checks.check_runs) && checks.check_runs.length > 0));
    // Full cache snapshots always include files/commits pages — treat as settled
    // even when empty arrays (PR with 0 commits is rare but valid).
    const fullSnap = d._cacheFull === true;
    return {
      commits:
        Boolean(marked.commits) ||
        fullSnap ||
        (Array.isArray(d.commits) && d.commits.length > 0),
      checks: Boolean(marked.checks) || Boolean(hasCheckItems),
      development:
        Boolean(marked.development) ||
        (Array.isArray(d.developmentIssues) && d.developmentIssues.length > 0) ||
        (Array.isArray(d.linkedIssues) && d.linkedIssues.length > 0),
      files:
        Boolean(marked.files) ||
        fullSnap ||
        (Array.isArray(d.files) && d.files.length > 0),
      comments:
        Boolean(marked.comments) ||
        (Array.isArray(d.comments) && d.comments.length > 0),
      reviews:
        Boolean(marked.reviews) ||
        (Array.isArray(d.reviews) && d.reviews.length > 0),
    };
  }

  /**
   * @param {'commits'|'checks'|'development'|'files'|'comments'|'reviews'} key
   * @param {{ pending?: boolean, settled?: boolean }} flags
   * @param {{ render?: boolean }} [opts]
   */
  function setSideFlag(key, flags, opts = null) {
    let changed = false;
    if (flags && typeof flags.pending === 'boolean') {
      const prev = Boolean(current.sidePending?.[key]);
      if (prev !== flags.pending) {
        current.sidePending = {
          ...(current.sidePending || emptySideFlags()),
          [key]: flags.pending,
        };
        changed = true;
      }
    }
    if (flags && typeof flags.settled === 'boolean') {
      const prev = Boolean(current.sideSettled?.[key]);
      if (prev !== flags.settled) {
        current.sideSettled = {
          ...(current.sideSettled || emptySideFlags()),
          [key]: flags.settled,
        };
        changed = true;
      }
    }
    if (changed) {
      try {
        publishE2eLoadHook(`setSideFlag:${key}`);
      } catch {
        /* ignore */
      }
    }
    if (changed && opts?.render !== false) {
      try {
        render();
      } catch {
        /* ignore */
      }
    }
    return changed;
  }

  /**
   * Independent panel fetches (parallel, non-blocking for core paint):
   * files, issue comments, reviews, commits, checks, development.
   * Skeleton UI: pending only when that panel is not yet settled (no cache).
   */
