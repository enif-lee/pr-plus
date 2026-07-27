
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
   * Monotonic generation for detail fetches. Parallel soft-refreshes after meta
   * writes used to complete out of order and resurrect stale assignees/labels.
   * Also bumps when the sheet closes so late responses are ignored.
   */
  let detailFetchGen = 0;
  /**
   * AbortController for the current open-session network work.
   * Aborted on closeModal / new open so SW cancels in-flight GitHub fetches.
   * @type {AbortController|null}
   */
  let openFetchAbort = null;
  const DEFAULT_PREFS = {
    fastReview: true,
    reverseComments: true,
    autoOpenEmbed: true,
    singleFileMode: false,
  };

  let prefs = { ...DEFAULT_PREFS };
  let prefsWatchUnsub = null;

  let current = {
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

  /** Project isolated store → flat detail for React / cache. */
  function publishDetailFromStore() {
    const S = detailStoreApi();
    if (!S || !current.detailStore) {
      return current.detail;
    }
    current.detail = S.toAppDetail(current.detailStore);
    // Mirror settled flags for existing sidePending UI
    const settled = S.sideSettledFlags(current.detailStore);
    const pending = S.sidePendingFlags(current.detailStore);
    current.sideSettled = { ...emptySideFlags(), ...settled };
    current.sidePending = {
      commits: Boolean(pending.commits),
      checks: Boolean(pending.checks),
      development: Boolean(pending.development),
      files: Boolean(pending.files),
      comments: Boolean(pending.comments),
      reviews: Boolean(pending.reviews),
    };
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

  function applyCoreToStore(coreFlat) {
    const S = detailStoreApi();
    if (!S) {
      return setDetailProgressive(coreFlat);
    }
    ensureDetailStore(current.detail);
    S.applyCorePayload(current.detailStore, coreFlat);
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
        };
      }
      prefsReady = true;
    } catch {
      prefs = { ...DEFAULT_PREFS };
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

  function ensurePrefsWatch() {
    if (prefsWatchUnsub) return;
    try {
      prefsWatchUnsub =
        globalThis.PRTreeStorage?.watchExtensionPrefs?.((next) => {
          const prevAuto = prefs.autoOpenEmbed !== false;
          prefs = {
            fastReview: next?.fastReview !== false,
            reverseComments: next?.reverseComments !== false,
            autoOpenEmbed: next?.autoOpenEmbed !== false,
            singleFileMode: next?.singleFileMode === true,
          };
          if (current.open) render();
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
        threadsNewest: 14,
        threadsFollow: 6,
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
        'threadsNewest',
        'threadsFollow',
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
    const threadsOk =
      has('threadsVisible') ||
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
    const wrap = (name, p, meta) =>
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
              api
                .fetchPrIssueComments(owner, repo, number, { signal })
                .then((page) => {
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
