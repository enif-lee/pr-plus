// TypeScript SoT — assembled by build scripts (classic runtime JS emit)



  const HOST_ID = 'prp-modal-host';
  let reactRoot = null;
  /** DOM node the current reactRoot is bound to (soft-nav may replace it). */
  let reactRootHost = null;
  /** When false (no PAT), click intercept is idle — native GitHub navigation works. */
  let hostEnabled = false;
  /** Soft-nav poll / listeners for PR page embed */
  let embedWatchInstalled = false;
  let lastEmbedPath = null;
  /**
   * Open-session generation for progressive data apply (core/threads/sides).
   * Bumped on new open / hard supersede / close — NOT on meta write-through.
   */
  let detailFetchGen = 0;
  /**
   * Meta soft-refresh supersede counter (module-level open lifetime).
   * Bumped when App patches SUPERSEDES_META_REFRESH_KEYS so in-flight core
   * meta projections cannot resurrect chips. Independent of detailFetchGen.
   */
  let metaRefreshGen = 0;
  /**
   * Last confirmed people-meta write (labels/assignees/…) for this page session.
   * Survives closeModal / list→detail soft-nav so revalidate cannot flash then
   * wipe post-write chips with a stale core GET.
   * @type {null | {
   *   owner: string,
   *   repo: string,
   *   number: number,
   *   gen: number,
   *   at: number,
   *   fields: Record<string, unknown>,
   * }}
   */
  let lastPeopleMetaAuthority = null;
  /**
   * People-meta write-through key.
   * - sessionStorage: soft close/reopen same tab (sync first paint)
   * - chrome.storage.session: survives page reload + site sessionStorage clear
   *   (e2e hard reopen clears prp: sessionStorage + IDB but not extension session
   *   storage — modal set must still paint on first hard open when REST lags)
   */
  const PEOPLE_META_AUTH_SS_KEY = 'prp:peopleMetaAuthority';
  const PEOPLE_META_AUTH_TTL_MS = 120_000;

  function parsePeopleMetaAuthorityRaw(raw: unknown) {
    if (raw == null) return null;
    let parsed = raw;
    if (typeof raw === 'string') {
      try {
        parsed = JSON.parse(raw);
      } catch {
        return null;
      }
    }
    if (!parsed || typeof parsed !== 'object') return null;
    const n = Number((parsed as any).number);
    if (!Number.isFinite(n) || n <= 0) return null;
    const age = Date.now() - Number((parsed as any).at || 0);
    if (age < 0 || age > PEOPLE_META_AUTH_TTL_MS) return null;
    return parsed as any;
  }

  function persistPeopleMetaAuthority(auth) {
    // Sync page sessionStorage
    try {
      if (typeof sessionStorage !== 'undefined') {
        if (!auth) sessionStorage.removeItem(PEOPLE_META_AUTH_SS_KEY);
        else sessionStorage.setItem(PEOPLE_META_AUTH_SS_KEY, JSON.stringify(auth));
      }
    } catch {
      /* private mode / quota */
    }
    // Extension session (survives reload + page sessionStorage clear)
    try {
      const area = (globalThis as any).chrome?.storage?.session;
      if (area && typeof area.set === 'function') {
        if (!auth) {
          void area.remove(PEOPLE_META_AUTH_SS_KEY).catch?.(() => {});
        } else {
          void area
            .set({ [PEOPLE_META_AUTH_SS_KEY]: auth })
            .catch?.(() => {});
        }
      }
    } catch {
      /* no chrome.storage */
    }
  }

  function loadPeopleMetaAuthorityFromSession() {
    try {
      if (typeof sessionStorage === 'undefined') return null;
      const raw = sessionStorage.getItem(PEOPLE_META_AUTH_SS_KEY);
      const parsed = parsePeopleMetaAuthorityRaw(raw);
      if (!parsed && raw) {
        try {
          sessionStorage.removeItem(PEOPLE_META_AUTH_SS_KEY);
        } catch {
          /* ignore */
        }
      }
      return parsed;
    } catch {
      return null;
    }
  }

  /**
   * Async hydrate from chrome.storage.session (page reload / hard e2e clear of
   * sessionStorage). Caller re-applies onto open detail when still same PR.
   */
  function loadPeopleMetaAuthorityFromChromeSession() {
    try {
      const area = (globalThis as any).chrome?.storage?.session;
      if (!area || typeof area.get !== 'function') {
        return Promise.resolve(null);
      }
      return new Promise((resolve) => {
        try {
          area.get(PEOPLE_META_AUTH_SS_KEY, (data: any) => {
            try {
              const raw = data?.[PEOPLE_META_AUTH_SS_KEY];
              const parsed = parsePeopleMetaAuthorityRaw(raw);
              if (!parsed && raw != null && typeof area.remove === 'function') {
                void area.remove(PEOPLE_META_AUTH_SS_KEY);
              }
              resolve(parsed);
            } catch {
              resolve(null);
            }
          });
        } catch {
          resolve(null);
        }
      });
    } catch {
      return Promise.resolve(null);
    }
  }
  /** Monotonic seq for e2e load hooks (poll + CustomEvent). */
  let e2eLoadSeq = 0;
  /**
   * AbortController for the current open-session network work.
   * Aborted on closeModal / new open so SW cancels in-flight GitHub fetches.
   * @type {AbortController|null}
   */
  let openFetchAbort = null;
  const DEFAULT_TIMELINE_VISIBILITY = {
    labels: true,
    title: true,
    milestone: true,
    referenced: true,
    comments: true,
  };

  function normalizeTimelineVisibilityLocal(raw: any) {
    try {
      const pure = (globalThis as any).PRModalConversationTimeline;
      if (typeof pure?.normalizeTimelineVisibility === 'function') {
        return pure.normalizeTimelineVisibility(raw);
      }
    } catch {
      /* ignore */
    }
    const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const out = { ...DEFAULT_TIMELINE_VISIBILITY };
    for (const id of Object.keys(out) as (keyof typeof out)[]) {
      if (typeof src[id] === 'boolean') out[id] = src[id];
    }
    if (src.all === true) {
      out.labels = true;
      out.title = true;
      out.milestone = true;
      out.referenced = true;
      out.comments = true;
    }
    return out;
  }

  const DEFAULT_PREFS = {
    fastReview: true,
    reverseComments: true,
    autoOpenEmbed: true,
    singleFileMode: false,
    shortcutMonitorSize: 'small',
    timelineVisibility: { ...DEFAULT_TIMELINE_VISIBILITY },
  };

  function normalizeShortcutMonitorSize(raw: unknown): string {
    const v = String(raw ?? '')
      .trim()
      .toLowerCase();
    if (v === 'none' || v === 'off' || v === 'hidden' || v === '0') return 'none';
    if (v === 'medium' || v === 'md' || v === '2' || v === '2x') return 'medium';
    if (v === 'large' || v === 'lg' || v === '3' || v === '3x') return 'large';
    if (v === 'small' || v === 'sm' || v === '1' || v === '1x') return 'small';
    if (raw === false) return 'none';
    return 'small';
  }

  let prefs = { ...DEFAULT_PREFS };
  let prefsWatchUnsub = null;

  let current: any = {
    open: false,
    loading: false,
    error: null,
    detail: null,
    /** Isolated slice store; `detail` is a projection for React (toAppDetail). */
    detailStore: null,
    owner: null,
    repo: null,
    number: null,
    /** @type {string|null} */
    routePage: null,
    /** @type {string|null} */
    routePosition: null,
    /** GH /changes/{sha} or range start */
    routeCommitSha: null,
    /** GH /changes/{a}..{b} end */
    routeCommitEndSha: null,
    routeFilePath: null,
    routeFileKey: null,
    routeStartLine: null,
    routeEndLine: null,
    routeSide: null,
    /**
     * Progressive load UI: { busy: boolean, label: string|null, phase: string|null }
     * Shown in the header diff-stat badge during loads.
     */
    loadStage: null,
    /**
     * Independent side panels still in flight.
     * Skeleton UI only when pending && !settled (no cached data for that panel).
     */
    sidePending: {
      commits: false,
      checks: false,
      development: false,
      files: false,
      comments: false,
      reviews: false,
    },
    /** Side panel has real data (from cache or completed fetch). */
    sideSettled: {
      commits: false,
      checks: false,
      development: false,
      files: false,
      comments: false,
      reviews: false,
    },
    /**
     * Presentation: 'modal' (overlay from pulls list) | 'embed' (in-page under GH header).
     * @type {'modal'|'embed'}
     */
    presentation: 'modal',
  };

  function pageEmbedApi() {
    return globalThis.PRModalPageEmbed || null;
  }

  function githubRouteApi() {
    return globalThis.PRModalGithubPrRoute || null;
  }

  function detailStoreApi() {
    return globalThis.PRModalDetailStore || null;
  }

  function mergeDetailProgressive(prev, next, opts = null) {
    const api = globalThis.PRModalDetailMerge;
    if (api && typeof api.mergeDetailProgressive === 'function') {
      return api.mergeDetailProgressive(prev, next, opts || undefined);
    }
    if (!next) return prev || next;
    if (!prev) return next;
    return { ...prev, ...next };
  }

  /**
   * True when files[] can paint Diff text (or are legitimately patchless).
   * Mirrors modal filesListHasUsableDiffBodies — kept local so host has no import.
   */
  function e2eFilesBodiesOk(files) {
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

  /**
   * Publish readiness for agent-browser e2e:
   * - window.__prpE2eLoad (poll)
   * - window event `prp-e2e-load` (push)
   * - host data-prp-load-* attributes
   *
   * Tests wait on this instead of fixed waitMs after open/layout.
   */
  function publishE2eLoadHook(reason = '') {
    try {
      const d = current.detail;
      const files = Array.isArray(d?.files) ? d.files : [];
      const filesBodiesOk = e2eFilesBodiesOk(files);
      const loadStage = current.loadStage || null;
      const loadBusy = Boolean(loadStage && loadStage.busy);
      const shellReady = Boolean(
        current.open &&
          d &&
          (d.title != null || d.number != null) &&
          !current.loading
      );
      // Meta "open settle": core painted and open progress bar cleared.
      const metaReady = Boolean(shellReady && !loadBusy);
      const snap = {
        seq: ++e2eLoadSeq,
        ts: Date.now(),
        reason: reason || null,
        open: Boolean(current.open),
        loading: Boolean(current.loading),
        owner: current.owner || null,
        repo: current.repo || null,
        number: current.number != null ? Number(current.number) : null,
        title: d?.title != null ? String(d.title).slice(0, 120) : null,
        loadStage: loadStage
          ? {
              phase: loadStage.phase || null,
              label: loadStage.label || null,
              busy: Boolean(loadStage.busy),
              percent:
                loadStage.percent != null ? Number(loadStage.percent) : null,
            }
          : null,
        loadBusy,
        sideSettled: { ...(current.sideSettled || {}) },
        sidePending: { ...(current.sidePending || {}) },
        filesCount: files.length,
        filesBodiesOk,
        filesReady: filesBodiesOk,
        shellReady,
        metaReady,
        // Full open progress done (bar cleared) + optional files for Diff.
        ready: metaReady,
        readyWithFiles: metaReady && filesBodiesOk,
      };
      // Content-script world is isolated from page eval (agent-browser).
      // Always stamp the **page DOM** so e2e can read readiness without CDP
      // world bridging. window.__prpE2eLoad is best-effort for same-world tools.
      try {
        (globalThis as any).__prpE2eLoad = snap;
        (globalThis as any).__prpE2eLoadSeq = snap.seq;
      } catch {
        /* ignore */
      }
      try {
        const host =
          document.getElementById('prp-page-embed') ||
          document.getElementById(HOST_ID);
        if (host) {
          host.setAttribute('data-prp-load-seq', String(snap.seq));
          host.setAttribute('data-prp-load-busy', loadBusy ? '1' : '0');
          host.setAttribute('data-prp-meta-ready', snap.metaReady ? '1' : '0');
          host.setAttribute('data-prp-files-ready', snap.filesReady ? '1' : '0');
          host.setAttribute(
            'data-prp-files-count',
            String(snap.filesCount || 0)
          );
          if (snap.number != null) {
            host.setAttribute('data-prp-load-number', String(snap.number));
          }
          // Host milestone truth for e2e / hard-reopen diagnostics.
          try {
            const ms = d?.milestone;
            host.setAttribute(
              'data-prp-milestone',
              ms == null
                ? 'null'
                : String(ms.title || ms.number || 'obj').slice(0, 80)
            );
          } catch {
            /* ignore */
          }
          // Compact JSON for probeLoad() — page-visible attribute.
          try {
            host.setAttribute(
              'data-prp-e2e-load',
              JSON.stringify({
                seq: snap.seq,
                number: snap.number,
                loading: snap.loading,
                loadBusy: snap.loadBusy,
                metaReady: snap.metaReady,
                filesReady: snap.filesReady,
                filesCount: snap.filesCount,
                ready: snap.ready,
                readyWithFiles: snap.readyWithFiles,
                phase: snap.loadStage?.phase || null,
                reason: snap.reason,
              })
            );
          } catch {
            /* ignore */
          }
        }
        // Also stamp documentElement so eval works even if host id changes
        try {
          document.documentElement.setAttribute(
            'data-prp-meta-ready',
            snap.metaReady ? '1' : '0'
          );
          document.documentElement.setAttribute(
            'data-prp-files-ready',
            snap.filesReady ? '1' : '0'
          );
          document.documentElement.setAttribute(
            'data-prp-load-busy',
            loadBusy ? '1' : '0'
          );
        } catch {
          /* ignore */
        }
      } catch {
        /* ignore */
      }
      try {
        globalThis.dispatchEvent?.(
          new CustomEvent('prp-e2e-load', { detail: snap })
        );
      } catch {
        /* ignore */
      }
      return snap;
    } catch {
      return null;
    }
  }

  /** Project isolated store → flat detail for React / cache. */
  function publishDetailFromStore() {
    const S = detailStoreApi();
    if (!S || !current.detailStore) {
      return current.detail;
    }
    current.detail = S.toAppDetail(current.detailStore);
    // Mirror settled from store. Do NOT map !settled → pending:true —
    // files/commits are intentionally deferred (settled:false, idle) until
    // ensureAll*; treating them as pending made aside "Loading…" forever
    // every time another side published.
    const settled = S.sideSettledFlags(current.detailStore);
    current.sideSettled = { ...emptySideFlags(), ...settled };
    const prevPending = current.sidePending || emptySideFlags();
    current.sidePending = {
      commits: settled.commits ? false : Boolean(prevPending.commits),
      checks: settled.checks ? false : Boolean(prevPending.checks),
      development: settled.development
        ? false
        : Boolean(prevPending.development),
      files: settled.files ? false : Boolean(prevPending.files),
      comments: settled.comments ? false : Boolean(prevPending.comments),
      reviews: settled.reviews ? false : Boolean(prevPending.reviews),
    };
    try {
      publishE2eLoadHook('publishDetailFromStore');
    } catch {
      /* ignore */
    }
    return current.detail;
  }

  /** Ensure store exists; hydrate from flat seed when needed. */
  function ensureDetailStore(seedFlat = null) {
    const S = detailStoreApi();
    if (!S) return null;
    if (!current.detailStore) {
      current.detailStore = seedFlat
        ? S.fromAppDetail(seedFlat)
        : S.createEmptyStore();
    }
    return current.detailStore;
  }

  /**
   * Hydrate/replace store from a full flat snapshot (list sketch / cache open).
   * Isolation starts after this; subsequent writes are slice-only.
   */
  function resetDetailStoreFromFlat(flat) {
    const S = detailStoreApi();
    if (!S) {
      current.detail = flat;
      current.detailStore = null;
      return flat;
    }
    current.detailStore = S.fromAppDetail(flat);
    return publishDetailFromStore();
  }

  /**
   * Legacy progressive merge when store API missing; otherwise prefer isolation.
   */
  function setDetailProgressive(next, opts = null) {
    if (!next || typeof next !== 'object') {
      current.detail = next;
      return current.detail;
    }
    const S = detailStoreApi();
    if (S && current.detailStore) {
      // Ambiguous full-object write: only apply meta (+ optional threads)
      S.applyMeta(current.detailStore, S.pickMeta(next), {
        source: next._source,
        sketch: next._sketch ? true : false,
        trustEmpty: Boolean(opts?.trustMetaEmpty),
      });
      if (
        (Array.isArray(next.reviewThreads) && next.reviewThreads.length) ||
        (Array.isArray(next.reviewComments) && next.reviewComments.length)
      ) {
        S.applyThreadsFromMergedDetail(current.detailStore, next);
      }
      return publishDetailFromStore();
    }
    current.detail = mergeDetailProgressive(current.detail, next, opts);
    return current.detail;
  }

  /**
   * Record a confirmed App meta write so later open/revalidate core GETs cannot
   * clobber labels (etc.) while GitHub/cache is still stale.
   */
  function notePeopleMetaAuthority(patch, identity: any = null) {
    const S = detailStoreApi();
    const build =
      typeof S?.buildPeopleMetaAuthority === 'function'
        ? S.buildPeopleMetaAuthority
        : null;
    if (!build) {
      // Fallback: minimal stamp when pure module lags rebuild
      if (!patch || typeof patch !== 'object') return;
      const keys = ['labels', 'assignees', 'requestedReviewers', 'milestone'];
      const fields: any = {};
      for (const k of keys) {
        if (Object.prototype.hasOwnProperty.call(patch, k)) fields[k] = patch[k];
      }
      if (!Object.keys(fields).length) return;
      const owner = identity?.owner ?? current.owner;
      const repo = identity?.repo ?? current.repo;
      const number = identity?.number ?? current.number;
      const n = Number(number);
      if (!Number.isFinite(n) || n <= 0) return;
      lastPeopleMetaAuthority = {
        owner: String(owner || '').toLowerCase(),
        repo: String(repo || '').toLowerCase(),
        number: n,
        gen: metaRefreshGen,
        at: Date.now(),
        fields: {
          ...(lastPeopleMetaAuthority &&
          Number(lastPeopleMetaAuthority.number) === n
            ? lastPeopleMetaAuthority.fields
            : {}),
          ...fields,
        },
      };
      persistPeopleMetaAuthority(lastPeopleMetaAuthority);
      return;
    }
    const owner = identity?.owner ?? current.owner;
    const repo = identity?.repo ?? current.repo;
    const number = identity?.number ?? current.number;
    const base =
      lastPeopleMetaAuthority &&
      Number(lastPeopleMetaAuthority.number) === Number(number)
        ? { ...lastPeopleMetaAuthority.fields }
        : {};
    const nextPatch = { ...base, ...patch };
    const auth = build(
      { owner, repo, number },
      nextPatch,
      { gen: metaRefreshGen, at: Date.now() }
    );
    if (auth) {
      lastPeopleMetaAuthority = auth;
      persistPeopleMetaAuthority(auth);
    }
  }

  /** Prefer last write-through people meta over a stale core GET. */
  function withPeopleMetaAuthority(coreFlat) {
    // Hydrate from sessionStorage if memory was wiped (force-close without host
    // closeModal, or a new content-script world). Soft reopen e2e relies on this.
    if (!lastPeopleMetaAuthority) {
      lastPeopleMetaAuthority = loadPeopleMetaAuthorityFromSession();
    }
    const S = detailStoreApi();
    const apply =
      typeof S?.applyPeopleMetaAuthorityToCore === 'function'
        ? S.applyPeopleMetaAuthorityToCore
        : null;
    if (!apply || !lastPeopleMetaAuthority || !coreFlat) return coreFlat;
    const { flat, fullyMatched } = apply(
      coreFlat,
      lastPeopleMetaAuthority,
      {
        owner: current.owner,
        repo: current.repo,
        number: current.number,
      }
    );
    // Keep authority for a short window after network matches so a subsequent
    // lagging null core cannot wipe the just-set milestone (soft reopen).
    if (fullyMatched) {
      const age = Date.now() - Number(lastPeopleMetaAuthority.at || 0);
      if (age > 30_000) {
        lastPeopleMetaAuthority = null;
        persistPeopleMetaAuthority(null);
      }
    }
    return flat || coreFlat;
  }

  function applyCoreToStore(coreFlat, opts: any = null) {
    const S = detailStoreApi();
    const metaGenAtStart =
      opts && Number.isFinite(opts.metaGenAtStart)
        ? Number(opts.metaGenAtStart)
        : null;
    const skipSupersedeMeta =
      metaGenAtStart != null && metaGenAtStart !== metaRefreshGen;
    // Session write-through shield (labels flash-then-gone on list→detail).
    let core = withPeopleMetaAuthority(coreFlat);
    if (!S) {
      let progressive = core;
      if (skipSupersedeMeta) {
        const strip =
          globalThis.PRModalDetailStore?.stripSupersededMetaFields;
        progressive =
          typeof strip === 'function' ? strip(core) : core;
      }
      return setDetailProgressive(progressive);
    }
    ensureDetailStore(current.detail);
    S.applyCorePayload(current.detailStore, core, {
      skipSupersedeMeta,
    });
    // Re-assert people-meta authority after core apply. Lagging REST null
    // milestone/labels must not stick when App just write-through confirmed.
    try {
      if (
        lastPeopleMetaAuthority &&
        Number(lastPeopleMetaAuthority.number) === Number(current.number) &&
        lastPeopleMetaAuthority.fields &&
        typeof S.applyMeta === 'function'
      ) {
        const age = Date.now() - Number(lastPeopleMetaAuthority.at || 0);
        if (age >= 0 && age < 120_000) {
          S.applyMeta(current.detailStore, lastPeopleMetaAuthority.fields, {
            trustEmpty: true,
            source: 'people-meta-authority-reassert',
            sketch: false,
          });
        }
      }
    } catch {
      /* ignore */
    }
    return publishDetailFromStore();
  }

  function applySideToStore(key, payload) {
    const S = detailStoreApi();
    if (!S || !current.detailStore) {
      return setDetailProgressive({
        ...payload,
        _sideSettled: {
          ...(current.detail?._sideSettled || {}),
          [key]: true,
        },
      });
    }
    if (key === 'files') {
      S.applyFiles(current.detailStore, payload.files, {
        settled: true,
        gitattributesText: payload.gitattributesText,
      });
    } else if (key === 'commits') {
      S.applyCommits(current.detailStore, payload.commits, { settled: true });
    } else if (key === 'comments') {
      S.applyComments(current.detailStore, payload.comments, {
        settled: true,
        pageMeta: payload.commentsMeta,
        timelineEvents: payload.timelineEvents,
      });
    } else if (key === 'reviews') {
      S.applyReviews(current.detailStore, payload.reviews, { settled: true });
    } else if (key === 'checks') {
      S.applyChecks(current.detailStore, payload.checks, { settled: true });
    } else if (key === 'development') {
      S.applyDevelopment(current.detailStore, payload, { settled: true });
    }
    return publishDetailFromStore();
  }

  function applyThreadsToStore(mergedFlat) {
    const S = detailStoreApi();
    if (!S) {
      // No store API: merge threads fields only when possible
      if (current.detail && mergedFlat) {
        current.detail = {
          ...current.detail,
          reviewThreads: mergedFlat.reviewThreads,
          reviewComments: mergedFlat.reviewComments,
          reviewThreadsMeta: mergedFlat.reviewThreadsMeta,
          reviewCommentsMeta: mergedFlat.reviewCommentsMeta,
          viewerPendingReview:
            mergedFlat.viewerPendingReview !== undefined
              ? mergedFlat.viewerPendingReview
              : current.detail.viewerPendingReview,
        };
        return current.detail;
      }
      current.detail = mergedFlat;
      return current.detail;
    }
    ensureDetailStore(current.detail || mergedFlat);
    S.applyThreadsFromMergedDetail(current.detailStore, mergedFlat);
    return publishDetailFromStore();
  }

  /**
   * Structured open-session fetch timeline for performance analysis.
   * - console: `[pr-plus][tl +Nms] start|end name …`
   * - globalThis.__PRP_FETCH_TIMELINE__ (content world)
   * - #prp-modal-host[data-prp-tl] JSON for page-world agent-browser eval
   */
  let activeFetchTimeline = null;

  function nowMs() {
    return typeof performance !== 'undefined' && performance.now
      ? performance.now()
      : Date.now();
  }

  function publishFetchTimeline(tl) {
    if (!tl) return;
    try {
      globalThis.__PRP_FETCH_TIMELINE__ = {
        label: tl.label,
        t0: tl.t0,
        elapsedMs: Math.round(nowMs() - tl.t0),
        events: tl.events.slice(),
      };
    } catch {
      /* ignore */
    }
    try {
      const host = document.getElementById(HOST_ID);
      if (host) {
        // Cap payload size for attribute
        const slim = tl.events.map((e) => ({
          t: e.t,
          p: e.phase,
          n: e.name,
          d: e.dur,
          ok: e.ok,
        }));
        host.setAttribute(
          'data-prp-tl',
          JSON.stringify({
            label: tl.label,
            elapsedMs: Math.round(nowMs() - tl.t0),
            events: slim,
          })
        );
      }
    } catch {
      /* ignore */
    }
  }

  function beginFetchTimeline(label) {
    const t0 = nowMs();
    const events = [];
    const tl = {
      label: String(label || 'open'),
      t0,
      events,
      now() {
        return Math.round(nowMs() - t0);
      },
      mark(name, phase, extra = null) {
        const e = {
          t: Math.round(nowMs() - t0),
          name: String(name || ''),
          phase: String(phase || 'mark'),
          ...(extra && typeof extra === 'object' ? extra : {}),
        };
        events.push(e);
        const dur =
          e.dur != null ? ` ${e.dur}ms` : e.phase === 'end' && e.dur != null ? ` ${e.dur}ms` : '';
        const ok =
          e.ok === false ? ' FAIL' : e.ok === true && e.phase === 'end' ? ' ok' : '';
        console.log(
          `[pr-plus][tl +${e.t}ms] ${e.phase} ${e.name}${dur}${ok}` +
            (e.err ? ` err=${e.err}` : '') +
            (e.note ? ` ${e.note}` : '')
        );
        publishFetchTimeline(tl);
        return e;
      },
      /**
       * Wrap a promise: logs start immediately, end/error when settled.
       * @template T
       * @param {string} name
       * @param {Promise<T>|T} promise
       * @param {object} [meta]
       * @returns {Promise<T>}
       */
      span(name, promise, meta = null) {
        const tStart = nowMs();
        tl.mark(name, 'start', meta || undefined);
        return Promise.resolve(promise).then(
          (value) => {
            const dur = Math.round(nowMs() - tStart);
            tl.mark(name, 'end', {
              ...(meta || {}),
              ok: true,
              dur,
            });
            return value;
          },
          (err) => {
            const dur = Math.round(nowMs() - tStart);
            tl.mark(name, 'error', {
              ...(meta || {}),
              ok: false,
              dur,
              err: String(err?.message || err || 'error').slice(0, 160),
            });
            throw err;
          }
        );
      },
      dump() {
        publishFetchTimeline(tl);
        return {
          label: tl.label,
          elapsedMs: Math.round(nowMs() - t0),
          events: events.slice(),
        };
      },
    };
    activeFetchTimeline = tl;
    tl.mark('session', 'begin', { note: label });
    return tl;
  }

  function getFetchTimeline() {
    return activeFetchTimeline;
  }

  function isEmbedPresentation(value) {
    const api = pageEmbedApi();
    if (api?.isEmbedPresentation) return api.isEmbedPresentation(value);
    return String(value || '').toLowerCase() === 'embed';
  }

  function parsePrPagePath(pathname) {
    const api = pageEmbedApi();
    if (typeof api?.parsePrPagePath === 'function') {
      return api.parsePrPagePath(pathname);
    }
    // Fallback if pure module missing (files|changes|sha|a..b)
    const path = String(pathname || '')
      .split('?')[0]
      .split('#')[0];
    const m = path.match(
      /^\/([^/]+)\/([^/]+)\/pull\/(\d+)(?:\/(files|changes)(?:\/([^/]+))?)?\/?$/i
    );
    if (!m) return null;
    const tab = String(m[4] || '')
      .trim()
      .toLowerCase();
    if (tab && tab !== 'files' && tab !== 'changes') return null;
    const rest = String(m[5] || '').trim();
    let commitSha = null;
    let commitEndSha = null;
    if (rest) {
      const range = rest.match(/^([0-9a-f]{7,40})\.\.([0-9a-f]{7,40})$/i);
      if (range) {
        commitSha = range[1].toLowerCase();
        commitEndSha = range[2].toLowerCase();
      } else if (/^[0-9a-f]{7,40}$/i.test(rest)) {
        commitSha = rest.toLowerCase();
      }
    }
    return {
      owner: m[1],
      repo: m[2],
      number: Number(m[3]),
      page: tab === 'files' || tab === 'changes' ? 'diff' : 'conversation',
      tab: tab || 'conversation',
      commitSha,
      commitEndSha,
    };
  }

  /** Path + hash for embed soft-nav identity (commit/range + #diff-). */
  function embedLocationKey() {
    if (typeof location === 'undefined') return '';
    return `${location.pathname || ''}${location.hash || ''}`;
  }

  /**
   * Parse full GH PR location (path + #diff-) when github route API available.
   */
  function parseGithubLocation() {
    const gh = githubRouteApi();
    if (typeof gh?.parseGithubPrLocation === 'function' && typeof location !== 'undefined') {
      return gh.parseGithubPrLocation({
        pathname: location.pathname,
        hash: location.hash,
      });
    }
    const pathTarget = parsePrPagePath(
      typeof location !== 'undefined' ? location.pathname : ''
    );
    if (!pathTarget) return null;
    return pathTarget;
  }

  /**
   * Apply path/hash route fields onto current. Always assign selection + commit
   * fields (null when absent) so soft-nav to /pull/N or /changes without #diff-
   * clears stale fileKey/startLine from a prior deep link.
   */
  function applyRouteFieldsFromTarget(target) {
    if (!target) return;
    if (target.page === 'diff' || target.page === 'conversation') {
      current.routePage = target.page;
    }
    current.routeCommitSha = target.commitSha || null;
    current.routeCommitEndSha = target.commitEndSha || null;
    current.routeFilePath = target.filePath || null;
    current.routeFileKey = target.fileKey || null;
    current.routeStartLine =
      target.startLine != null && Number.isFinite(Number(target.startLine))
        ? Number(target.startLine)
        : null;
    current.routeEndLine =
      target.endLine != null && Number.isFinite(Number(target.endLine))
        ? Number(target.endLine)
        : null;
    current.routeSide = target.side || null;
  }

  function embedHostId() {
    return pageEmbedApi()?.PAGE_EMBED_HOST_ID || 'prp-page-embed';
  }

  function embedActiveClass() {
    return pageEmbedApi()?.PAGE_EMBED_ACTIVE_CLASS || 'prp-embed-active';
  }

  /** Resilient selectors for GitHub main content under the global header. */
  function findGithubMainRegion(doc = document) {
    const selectors = [
      '.application-main',
      'main#js-repo-pjax-container',
      '#js-repo-pjax-container',
      '[data-turbo-body] main',
      'main[data-pjax-container]',
      'main',
    ];
    for (const sel of selectors) {
      try {
        const el = doc.querySelector(sel);
        if (el) return el;
      } catch {
        /* ignore */
      }
    }
    return null;
  }

  function hideNativeMainChildren(main, embedEl) {
    if (!main) return;
    for (const child of [...main.children]) {
      if (child === embedEl) continue;
      if (child.getAttribute('data-prp-native-hidden') === '1') continue;
      child.setAttribute('data-prp-native-hidden', '1');
      child.style.setProperty('display', 'none', 'important');
    }
    main.classList.add('prp-embed-main');
  }

  function hideGithubFooter() {
    const api = pageEmbedApi();
    if (typeof api?.applyFooterHide === 'function') {
      try {
        return api.applyFooterHide(document);
      } catch {
        /* ignore */
      }
    }
    return 0;
  }

  function restoreGithubFooter() {
    const api = pageEmbedApi();
    if (typeof api?.restoreFooters === 'function') {
      try {
        return api.restoreFooters(document);
      } catch {
        /* ignore */
      }
    }
    // Fallback if pure module missing
    try {
      document
        .querySelectorAll('[data-prp-footer-hidden="1"]')
        .forEach((el) => {
          el.removeAttribute('data-prp-footer-hidden');
          el.style?.removeProperty?.('display');
        });
    } catch {
      /* ignore */
    }
    return 0;
  }

  function restoreNativeMain() {
    try {
      document.documentElement.classList.remove(embedActiveClass());
      document.body?.classList?.remove(embedActiveClass());
    } catch {
      /* ignore */
    }
    try {
      document.querySelectorAll('[data-prp-native-hidden="1"]').forEach((el) => {
        el.removeAttribute('data-prp-native-hidden');
        el.style.removeProperty('display');
      });
      document.querySelectorAll('.prp-embed-main').forEach((el) => {
        el.classList.remove('prp-embed-main');
      });
    } catch {
      /* ignore */
    }
    restoreGithubFooter();
    try {
      const host = document.getElementById(embedHostId());
      if (host) host.remove();
    } catch {
      /* ignore */
    }
  }

  /**
   * Full-window embed host.
   * Mount on document.body (NOT inside .application-main): GH ancestors often
   * use transform/filter which make position:fixed relative to a zero-height
   * box and the panel disappears. Still hide native main + footer.
   */
  function ensureEmbedHost() {
    void ensureAssets();
    const id = embedHostId();
    const mountParent = document.body || document.documentElement;
    let host = document.getElementById(id);
    if (!host) {
      host = document.createElement('div');
      host.id = id;
      host.className = 'prp-page-embed';
      host.setAttribute('data-prp-embed', '1');
      mountParent.appendChild(host);
    } else if (host.parentElement !== mountParent) {
      // Soft-nav / old code may have left host under main — reparent to body
      try {
        mountParent.appendChild(host);
      } catch {
        /* ignore */
      }
    }
    stampHostCssReady(host);
    const main = findGithubMainRegion();
    if (main) hideNativeMainChildren(main, host);
    document.documentElement.classList.add(embedActiveClass());
    try {
      document.body?.classList?.add(embedActiveClass());
    } catch {
      /* ignore */
    }
    hideGithubFooter();
    return host;
  }

  /** Tear down embed and show original GitHub PR UI (same tab). */
  function restoreNativeView() {
    if (!isEmbedPresentation(current.presentation) && !document.getElementById(embedHostId())) {
      return { ok: false, reason: 'not-embed' };
    }
    closeModal();
    // Native GH PR chrome is visible again — offer pr+ re-entry toggle
    try {
      ensureGithubPrToggle();
    } catch {
      /* ignore */
    }
    return { ok: true };
  }

  const GH_PR_TOGGLE_ID = 'prp-gh-open-toggle';

  /**
   * Find a mount point next to the native GitHub PR header actions / title row.
   */
  function findGithubPrHeaderMount(doc = document) {
    const selectors = [
      '.gh-header-actions',
      '.gh-header .gh-header-actions',
      '[data-testid="pull-request-header"] .gh-header-actions',
      '.js-pull-header-details .gh-header-actions',
      // React PR header action clusters
      '[data-component="PH_Actions"]',
      '.gh-header-meta',
      '.gh-header-show .gh-header-actions',
      // Fallback: conversation tab nav row
      'nav.js-repo-nav, nav[aria-label="Pull request tabs"]',
      '.UnderlineNav-body',
    ];
    for (const sel of selectors) {
      try {
        const el = doc.querySelector(sel);
        if (el) return el;
      } catch {
        /* ignore */
      }
    }
    // Last resort: PR title heading parent
    try {
      const h1 =
        doc.querySelector('.js-issue-title') ||
        doc.querySelector('h1.gh-header-title') ||
        doc.querySelector('[data-testid="issue-title"]');
      if (h1?.parentElement) return h1.parentElement;
    } catch {
      /* ignore */
    }
    return null;
  }

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
