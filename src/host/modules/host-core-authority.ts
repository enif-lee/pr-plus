// TypeScript SoT — assembled by build scripts (classic runtime JS emit)

  const HOST_ID = 'prp-modal-host';

  function detectHostRuntime() {
    try {
      const href = String(globalThis.location?.href || '');
      if (href.startsWith('chrome-extension://')) return 'shell';
      const host = String(globalThis.location?.hostname || '').toLowerCase();
      if (host === 'linear.app' || host.endsWith('.linear.app')) return 'partner';
    } catch {
      /* ignore */
    }
    return 'github';
  }
  const HOST_RUNTIME = detectHostRuntime();
  function isPartnerOrShellRuntime() {
    return HOST_RUNTIME === 'partner' || HOST_RUNTIME === 'shell';
  }
  try {
    document.documentElement?.setAttribute('data-prp-runtime', HOST_RUNTIME);
  } catch {
    /* ignore */
  }

  let reactRoot: any = null;
  /** DOM node the current reactRoot is bound to (soft-nav may replace it). */
  let reactRootHost: any = null;
  /** When false (no PAT), click intercept is idle — native GitHub navigation works. */
  let hostEnabled = false;
  /** True after setEnabled ran (PAT + pluginEnabled evaluated). */
  let hostFeaturesEvaluated = false;
  /** Soft-nav poll / listeners for PR page embed */
  let embedWatchInstalled = false;
  let lastEmbedPath: any = null;
  /**
   * Once-per-PR auto-open latch (document lifetime / until leave-PR).
   * After first evaluation for `owner/repo#n`, location/hash/tab events must
   * not call openModal for auto-open again. Cleared when leaving PR pages.
   * Manual open and pref false→true (force) bypass.
   * @type {string|null}
   */
  let autoOpenEvaluatedPrKey: any = null;
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
  let lastPeopleMetaAuthority: any = null;
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

  function persistPeopleMetaAuthority(auth: any) {
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
  let openFetchAbort: any = null;
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
    reverseComments: true,
    autoOpenEmbed: true,
    /** /pulls title click: modal | page */
    listOpenMode: 'modal',
    singleFileMode: false,
    autoExpandOnFileNav: false,
    shortcutMonitorSize: 'small',
    /** auto | en | ko | ja | zh_CN — custom overrides GitHub page detect */
    uiLanguage: 'auto',
    timelineVisibility: { ...DEFAULT_TIMELINE_VISIBILITY },
  };

  function normalizeListOpenMode(raw: unknown): 'modal' | 'page' {
    const v = String(raw ?? '')
      .trim()
      .toLowerCase();
    if (
      v === 'page' ||
      v === 'pr-page' ||
      v === 'pr_page' ||
      v === 'navigate' ||
      v === 'native' ||
      v === 'github'
    ) {
      return 'page';
    }
    return 'modal';
  }

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

  function normalizeUiLanguage(raw: unknown): string {
    try {
      const pure = (globalThis as any).PRModalLocaleResolve;
      if (typeof pure?.normalizeUiLanguagePref === 'function') {
        return pure.normalizeUiLanguagePref(raw);
      }
    } catch {
      /* fall through */
    }
    if (raw == null) return 'auto';
    const v = String(raw).trim();
    if (!v) return 'auto';
    const lower = v.toLowerCase().replace(/_/g, '-');
    if (
      lower === 'auto' ||
      lower === 'detect' ||
      lower === 'default' ||
      lower === 'system' ||
      lower === 'github'
    ) {
      return 'auto';
    }
    if (v === 'zh_CN' || lower === 'zh-cn' || lower === 'zh_cn' || lower === 'zh') {
      return 'zh_CN';
    }
    if (lower === 'en' || lower.startsWith('en-')) return 'en';
    if (lower === 'ko' || lower.startsWith('ko-')) return 'ko';
    if (lower === 'ja' || lower.startsWith('ja-')) return 'ja';
    return 'auto';
  }

  let prefs = { ...DEFAULT_PREFS };
  let prefsWatchUnsub: any = null;

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

