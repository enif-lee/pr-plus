/**
 * Content-script host: intercept PR list clicks, mount React modal overlay.
 * AUTO-ASSEMBLED from src/host/parts/* — edit parts, run: npm run build:host
 * Bundle + CSS are extension-local (no remote code).
 */
(function initPrModalHost() {

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

  function isReactRootLiveOn(host) {
    if (!reactRoot || !host) return false;
    if (typeof reactRoot.render !== 'function') return false;
    if (reactRootHost !== host) return false;
    // Node may be detached after Turbo swap
    if (host.isConnected === false) return false;
    // createRoot stamp must still be present (wrapper unmount deletes it)
    if (!host.__prpReactRoot) return false;
    return true;
  }

  function dropReactRoot() {
    if (reactRoot) {
      try {
        reactRoot.unmount();
      } catch {
        /* ignore */
      }
    }
    // If wrapper unmount failed / partial, clear createRoot stamp on old host
    if (reactRootHost) {
      try {
        if (reactRootHost.__prpReactRoot) {
          try {
            // Real createRoot has .unmount(); stub may not
            reactRootHost.__prpReactRoot.unmount?.();
          } catch {
            /* ignore */
          }
          delete reactRootHost.__prpReactRoot;
        }
      } catch {
        /* ignore */
      }
    }
    reactRoot = null;
    reactRootHost = null;
  }

  function render() {
    if (typeof globalThis.mountPrModal !== 'function') {
      console.warn('[pr+] modal bundle not loaded (mountPrModal missing)');
      return;
    }

    if (!current.open) {
      dropReactRoot();
      // Tear down both hosts when closed
      try {
        const overlay = document.getElementById(HOST_ID);
        if (overlay) overlay.replaceChildren();
      } catch {
        /* ignore */
      }
      if (
        isEmbedPresentation(current.presentation) ||
        document.getElementById(embedHostId())
      ) {
        restoreNativeMain();
      }
      return;
    }

    // Keep CSS warming; host stays invisible (styles.css FOUC gate) until ready.
    // React may mount while hidden — when the sheet loads we flip data-prp-css-ready
    // so the first visible frame is already styled.
    void ensureAssets();

    const host = ensureHost();
    stampHostCssReady(host);
    const props = buildProps();

    if (isReactRootLiveOn(host)) {
      try {
        // Reuse root — preserves Diff layout, scrollTop, and search UI state.
        reactRoot.render(props);
        return;
      } catch (err) {
        console.warn('[pr+] root.render failed; remounting', err);
        dropReactRoot();
      }
    } else if (reactRoot) {
      // Host recreated or detached — unmount orphan and bind to the new node
      dropReactRoot();
    }

    // Stale createRoot stamp on this host (orphan after lost wrapper) — clear first
    try {
      if (host.__prpReactRoot) {
        try {
          host.__prpReactRoot.unmount?.();
        } catch {
          /* ignore */
        }
        delete host.__prpReactRoot;
      }
    } catch {
      /* ignore */
    }

    reactRoot = globalThis.mountPrModal(host, props);
    reactRootHost = host;
  }

  function persistOpenModal(owner, repo, number, extra = {}) {
    const api = sessionApi();
    if (typeof sessionStorage === 'undefined' || !api?.saveOpenModal) return;
    api.saveOpenModal(sessionStorage, {
      owner,
      repo,
      number,
      page: extra.page ?? current.routePage ?? null,
      position: extra.position ?? current.routePosition ?? null,
    });
  }

  function clearPersistedOpenModal() {
    const api = sessionApi();
    if (typeof sessionStorage === 'undefined' || !api?.clearOpenModal) return;
    api.clearOpenModal(sessionStorage);
  }

  /**
   * Write location. Embed / in-page PR shell uses GitHub-native
   * /pull/N[/changes[/{sha}|/{a}..{b}]]#diff-… ; list modal keeps prp_* query.
   */
  function writeUriRoute(route = {}) {
    const page = route.page ?? current.routePage ?? null;
    const number = route.number ?? current.number ?? null;
    const position = route.position !== undefined ? route.position : current.routePosition;

    const gh = githubRouteApi();
    const useGithubPath =
      isEmbedPresentation(current.presentation) &&
      current.owner &&
      current.repo &&
      number != null &&
      typeof gh?.replaceGithubPrLocation === 'function';

    if (useGithubPath) {
      try {
        const commitSha =
          route.commitSha !== undefined ? route.commitSha : current.routeCommitSha;
        const commitEndSha =
          route.commitEndSha !== undefined
            ? route.commitEndSha
            : current.routeCommitEndSha;
        const filePath =
          route.filePath !== undefined ? route.filePath : current.routeFilePath;
        const fileKey =
          route.fileKey !== undefined ? route.fileKey : current.routeFileKey;
        const startLine =
          route.startLine !== undefined ? route.startLine : current.routeStartLine;
        const endLine =
          route.endLine !== undefined ? route.endLine : current.routeEndLine;
        const side = route.side !== undefined ? route.side : current.routeSide;
        gh.replaceGithubPrLocation(
          typeof history !== 'undefined' ? history : null,
          typeof location !== 'undefined' ? location : null,
          {
            owner: current.owner,
            repo: current.repo,
            number,
            page: page === 'diff' ? 'diff' : 'conversation',
            commitSha: commitSha || null,
            commitEndSha: commitEndSha || null,
            filePath: filePath || null,
            fileKey: fileKey || null,
            startLine: startLine ?? null,
            endLine: endLine ?? null,
            side: side || null,
          }
        );
        lastEmbedPath = embedLocationKey();
      } catch {
        /* ignore */
      }
      return;
    }

    const api = uriApi();
    if (!api?.replaceLocationRoute) return;
    try {
      api.replaceLocationRoute(
        typeof history !== 'undefined' ? history : null,
        typeof location !== 'undefined' ? location : null,
        {
          page: page ?? null,
          number: number ?? null,
          position: position ?? null,
        }
      );
    } catch {
      /* ignore — non-browser / restricted */
    }
  }

  function clearUriRoute() {
    const api = uriApi();
    if (!api?.clearLocationRoute) return;
    try {
      api.clearLocationRoute(
        typeof history !== 'undefined' ? history : null,
        typeof location !== 'undefined' ? location : null
      );
    } catch {
      /* ignore */
    }
  }

  /**
   * Called from modal when layout / selection / commit filter changes.
   * Keeps session + URI in sync (replaceState only).
   */
  function persistRouteState(route = {}) {
    if (!current.open || !current.owner || !current.repo || !current.number) return;
    if (route.page != null) current.routePage = route.page;
    if (route.position !== undefined) current.routePosition = route.position || null;
    if (route.commitSha !== undefined) {
      current.routeCommitSha = route.commitSha || null;
    }
    if (route.commitEndSha !== undefined) {
      current.routeCommitEndSha = route.commitEndSha || null;
    }
    if (route.filePath !== undefined) current.routeFilePath = route.filePath || null;
    if (route.fileKey !== undefined) current.routeFileKey = route.fileKey || null;
    if (route.startLine !== undefined) current.routeStartLine = route.startLine ?? null;
    if (route.endLine !== undefined) current.routeEndLine = route.endLine ?? null;
    if (route.side !== undefined) current.routeSide = route.side || null;
    persistOpenModal(current.owner, current.repo, current.number, {
      page: current.routePage,
      position: current.routePosition,
    });
    writeUriRoute({
      page: current.routePage,
      number: current.number,
      position: current.routePosition,
      commitSha: current.routeCommitSha,
      commitEndSha: current.routeCommitEndSha,
      filePath: current.routeFilePath,
      fileKey: current.routeFileKey,
      startLine: current.routeStartLine,
      endLine: current.routeEndLine,
      side: current.routeSide,
    });
  }

  /**
   * Cancel all in-flight open-session fetches (content → SW → GitHub).
   * Safe to call when nothing is running.
   */
  function abortOpenFetches(reason = 'sheet-closed') {
    detailFetchGen += 1;
    const ac = openFetchAbort;
    openFetchAbort = null;
    // Bulk-cancel: known requestIds + every active SW GitHub fetch.
    // cancelAll covers the race where a FETCH is mid-flight before its id
    // is registered on the signal (or exclusive-queue pre-cancel misses).
    try {
      const ids = ac?.signal?.__prpRequestIds
        ? [...ac.signal.__prpRequestIds]
        : [];
      if (globalThis.PRTreeFetch?.cancelFetches) {
        void globalThis.PRTreeFetch.cancelFetches(ids, { cancelAll: true });
      }
    } catch {
      /* ignore */
    }
    if (ac) {
      try {
        ac.abort(reason);
      } catch {
        try {
          ac.abort();
        } catch {
          /* ignore */
        }
      }
    }
  }

  function beginOpenFetchSession() {
    // Supersede any previous open's network work immediately
    abortOpenFetches('superseded');
    openFetchAbort = new AbortController();
    // gen already bumped in abortOpenFetches; capture current for this session
    return {
      gen: detailFetchGen,
      signal: openFetchAbort.signal,
    };
  }

  function closeModal() {
    abortOpenFetches('sheet-closed');
    const wasEmbed = isEmbedPresentation(current.presentation);
    clearPersistedOpenModal();
    // Keep native PR URL clean when embed closes (no prp_* strip needed if we never wrote)
    if (!wasEmbed) clearUriRoute();
    current = {
      open: false,
      loading: false,
      error: null,
      detail: null,
      detailStore: null,
      owner: null,
      repo: null,
      number: null,
      routePage: null,
      routePosition: null,
      routeCommitSha: null,
      routeCommitEndSha: null,
      routeFilePath: null,
      routeFileKey: null,
      routeStartLine: null,
      routeEndLine: null,
      routeSide: null,
      loadStage: null,
      sidePending: emptySideFlags(),
      sideSettled: emptySideFlags(),
      presentation: 'modal',
    };
    render();
    if (wasEmbed) restoreNativeMain();
    // After leaving embed (or closing overlay), re-offer native GH → pr+ toggle
    try {
      ensureGithubPrToggle();
    } catch {
      /* ignore */
    }
  }

  /**
   * Open PR shell. **First paint is synchronous** (list sketch / memory / skeleton).
   * Never await storage or network before that paint — network core upgrades after.
   * Returns a Promise for the background fetch chain (callers may void it).
   */
  function openModal({
    owner,
    repo,
    number,
    page = null,
    position = null,
    presentation = null,
    commitSha = null,
    commitEndSha = null,
    filePath = null,
    fileKey = null,
    startLine = null,
    endLine = null,
    side = null,
  }) {
    if (!hostEnabled) return Promise.resolve({ ok: false, reason: 'disabled' });
    // Dismiss pulls list palette if it was open (Esc-restore path is separate)
    try {
      if (typeof closePullsPalette === 'function') closePullsPalette();
    } catch {
      /* ignore */
    }
    // Prefs/CSS never block first paint (defaults + content_scripts CSS).
    void refreshPrefs();
    ensurePrefsWatch();
    void ensureAssets();
    const key = detailKey(owner, repo, number);
    // Abort any previous open's fetches, start a new cancelable session
    const { gen, signal } = beginOpenFetchSession();

    // Stack strip needs open PR list. List page has it cached; PR-page embed does
    // not — fetch in background so Stack/header parity matches fullscreen.
    void ensureOpenPullsForStack(owner, repo, { signal });

    // Resolve presentation: explicit > path-based embed > keep current if same PR > modal
    const pathTarget = parsePrPagePath(
      typeof location !== 'undefined' ? location.pathname : ''
    );
    let resolvedPresentation = 'modal';
    if (presentation === 'embed' || presentation === 'modal') {
      resolvedPresentation = presentation;
    } else if (
      pathTarget &&
      String(pathTarget.owner).toLowerCase() === String(owner).toLowerCase() &&
      String(pathTarget.repo).toLowerCase() === String(repo).toLowerCase() &&
      Number(pathTarget.number) === Number(number)
    ) {
      resolvedPresentation = 'embed';
    } else if (
      current.open &&
      isEmbedPresentation(current.presentation) &&
      String(current.owner).toLowerCase() === String(owner).toLowerCase() &&
      String(current.repo).toLowerCase() === String(repo).toLowerCase() &&
      Number(current.number) === Number(number)
    ) {
      resolvedPresentation = 'embed';
    }
    // Switching overlay ↔ embed needs a clean host + fresh React root
    if (
      current.open &&
      isEmbedPresentation(current.presentation) !==
        isEmbedPresentation(resolvedPresentation)
    ) {
      dropReactRoot();
      if (isEmbedPresentation(current.presentation)) restoreNativeMain();
    }
    current.presentation = resolvedPresentation;

    // Progressive sources (fast → slow):
    //   1) list sketch (pulls page cache — title/body already available)
    //   2) memory cache
    //   3) IDB (async, non-blocking)
    //   4) network core + threads
    const listPr = findListPr(owner, repo, number);
    const listSketch = detailSketchFromList(listPr, owner, repo, number);

    // 1) Sync memory paint first (never block on IDB)
    let peeked = peekDetailMemory(key);
    let cached = peeked.value || null;
    let fromCache = Boolean(cached);
    const fromList = !fromCache && Boolean(listSketch);
    // Prefer real cache over list sketch; else sketch; else empty
    let initialDetail = cached || listSketch || null;

    // Explicit page (stack nav) > path tab (embed) > keep current view > default conversation
    const ghLoc =
      isEmbedPresentation(resolvedPresentation) ||
      (pathTarget &&
        String(pathTarget.owner).toLowerCase() === String(owner).toLowerCase() &&
        String(pathTarget.repo).toLowerCase() === String(repo).toLowerCase() &&
        Number(pathTarget.number) === Number(number))
        ? parseGithubLocation()
        : null;
    const resolvedPage =
      page === 'diff' || page === 'conversation'
        ? page
        : pathTarget &&
            isEmbedPresentation(resolvedPresentation) &&
            (pathTarget.page === 'diff' || pathTarget.page === 'conversation')
          ? pathTarget.page
          : current.open &&
              (current.routePage === 'diff' || current.routePage === 'conversation')
            ? current.routePage
            : page || null;

    const resolvedCommitSha =
      commitSha != null
        ? commitSha
        : ghLoc?.commitSha != null
          ? ghLoc.commitSha
          : pathTarget?.commitSha != null
            ? pathTarget.commitSha
            : null;
    const resolvedCommitEndSha =
      commitEndSha != null
        ? commitEndSha
        : ghLoc?.commitEndSha != null
          ? ghLoc.commitEndSha
          : pathTarget?.commitEndSha != null
            ? pathTarget.commitEndSha
            : null;
    const resolvedFilePath = filePath != null ? filePath : ghLoc?.filePath || null;
    const resolvedFileKey = fileKey != null ? fileKey : ghLoc?.fileKey || null;
    const resolvedStartLine =
      startLine != null ? startLine : ghLoc?.startLine ?? null;
    const resolvedEndLine = endLine != null ? endLine : ghLoc?.endLine ?? null;
    const resolvedSide = side != null ? side : ghLoc?.side || null;

    // Side panels: if we already have cached data, mark settled so revalidate
    // does not flash section skeletons over real content.
    const initialSideSettled = sideSettledFromDetail(initialDetail);
    const fetchTl = beginFetchTimeline(
      `open ${owner}/${repo}#${number}` +
        (fromCache ? ' cache' : fromList ? ' list' : ' cold')
    );
    fetchTl.mark('first-paint-source', 'mark', {
      note: fromCache
        ? `cache:${peeked?.source || 'memory'}`
        : fromList
          ? 'list-sketch'
          : 'empty',
      hasDetail: Boolean(initialDetail),
    });
    current = {
      open: true,
      // Only block whole UI when we have nothing to show yet
      loading: !initialDetail,
      error: null,
      detail: initialDetail,
      detailStore: null,
      owner,
      repo,
      number,
      routePage: resolvedPage,
      routePosition: position || null,
      routeCommitSha: resolvedCommitSha,
      routeCommitEndSha: resolvedCommitEndSha,
      routeFilePath: resolvedFilePath,
      routeFileKey: resolvedFileKey,
      routeStartLine: resolvedStartLine,
      routeEndLine: resolvedEndLine,
      routeSide: resolvedSide,
      presentation: resolvedPresentation,
      sidePending: emptySideFlags(),
      sideSettled: initialSideSettled,
      loadStage: {
        phase: fromCache ? 'revalidate' : fromList ? 'core' : 'core',
        label: fromCache
          ? loadStageLabel('revalidate')
          : fromList
            ? loadStageLabel('core-full')
            : loadStageLabel('core'),
        busy: true,
        // Start at unit weight floor; parallel fetches mark up as each resolves
        percent: fetchUnitWeights().start || 5,
      },
    };
    // Isolated slice store — subsequent core/side/threads writes never clobber
    // other domains. Flat `detail` is a projection for React.
    if (initialDetail) {
      resetDetailStoreFromFlat(initialDetail);
      current.sideSettled = {
        ...emptySideFlags(),
        ...sideSettledFromDetail(current.detail),
      };
      current.sidePending = emptySideFlags();
      // Pending = not yet settled
      for (const k of Object.keys(current.sideSettled)) {
        current.sidePending[k] = !current.sideSettled[k];
      }
    }
    persistOpenModal(owner, repo, number, {
      page: resolvedPage,
      position,
    });
    writeUriRoute({
      page: resolvedPage || 'conversation',
      number,
      position,
      commitSha: resolvedCommitSha,
      commitEndSha: resolvedCommitEndSha,
      filePath: resolvedFilePath,
      fileKey: resolvedFileKey,
      startLine: resolvedStartLine,
      endLine: resolvedEndLine,
      side: resolvedSide,
    });
    render();

    if (fromCache) {
      console.log(
        `[pr-plus] openModal cache-hit ${owner}/${repo}#${number} ` +
          `source=${peeked.source || 'memory'} fresh=${Boolean(peeked.fresh)}`
      );
    } else if (fromList) {
      console.log(
        `[pr-plus] openModal list-sketch ${owner}/${repo}#${number} ` +
          `title=${JSON.stringify(String(listSketch.title || '').slice(0, 60))}`
      );
    }

    // ── First paint is done (list sketch / cache / empty skeleton). ──
    // Everything below upgrades asynchronously and must not delay click→visible.

    // 2) Background IDB hydrate (timeout) — only if memory miss
    //    Upgrades list-sketch → IDB snapshot; must not delay network.
    const idbHydrateP = !fromCache
      ? peekDetailIdb(key, 400).then((idbPeek) => {
          if (gen !== detailFetchGen) return null;
          if (
            !(
              current.open &&
              current.owner === owner &&
              current.repo === repo &&
              Number(current.number) === Number(number)
            )
          ) {
            return null;
          }
          const v = idbPeek?.value || null;
          if (!v) return null;
          const curRank = detailRank(current.detail);
          const idbRank = detailRank(v);
          // Network already delivered richer data — keep IDB only for thread preserve
          if (curRank >= 2 && !current.detail?._sketch) {
            return v;
          }
          // Upgrade empty / list-sketch → IDB
          if (idbRank > curRank || (current.detail?._sketch && idbRank >= 2)) {
            cached = v;
            fromCache = true;
            peeked = idbPeek;
            resetDetailStoreFromFlat(v);
            current.loading = false;
            current.error = null;
            setLoadStage('revalidate', loadStageLabel('revalidate'), true);
            render();
            console.log(
              `[pr-plus] openModal cache-hit ${owner}/${repo}#${number} source=idb (upgraded from ${
                curRank <= 1 ? 'list/empty' : 'partial'
              })`
            );
          }
          return v;
        })
      : Promise.resolve(cached);

    return (async () => {
    try {
      if (!globalThis.PRTreeFetch?.fetchPrDetail) {
        throw new Error('PR detail bridge unavailable');
      }

      function isAbortErr(err) {
        return (
          err?.name === 'AbortError' ||
          /aborted|AbortError/i.test(String(err?.message || err || ''))
        );
      }

      async function fetchDetailOnce(opts) {
        let lastErr;
        for (let attempt = 0; attempt < 2; attempt++) {
          if (signal.aborted || gen !== detailFetchGen) {
            const e = new Error('The operation was aborted.');
            e.name = 'AbortError';
            throw e;
          }
          try {
            return await globalThis.PRTreeFetch.fetchPrDetail(owner, repo, number, {
              ...opts,
              signal,
            });
          } catch (err) {
            if (isAbortErr(err)) throw err;
            lastErr = err;
            const msg = String(err?.message || err || '');
            // Context invalidation cannot be fixed by retry — page refresh required
            if (
              /Extension context invalidated|Extension was reloaded/i.test(msg)
            ) {
              throw err;
            }
            if (
              attempt === 0 &&
              /message channel closed|Receiving end does not exist|Background worker offline/i.test(
                msg
              )
            ) {
              await new Promise((r) => setTimeout(r, 200));
              continue;
            }
            throw err;
          }
        }
        throw lastErr || new Error('Failed to fetch PR detail');
      }

      // Prefs may still be warming; do not re-await for first network phase
      if (!prefsReady) await refreshPrefs();
      ensurePrefsWatch();
      const fastReview = prefs.fastReview !== false;

      // Phase 1+2 kickoff: core + threads in parallel. Progress bar advances
      // inside each promise's completion (order-independent), not only at the end.
      const openStill = () =>
        gen === detailFetchGen &&
        current.open &&
        current.owner === owner &&
        current.repo === repo &&
        Number(current.number) === Number(number);
      const prog = beginFetchProgress(gen, openStill);
      const uw = prog.weights;
      const corePhase = fromCache ? 'revalidate' : 'core';
      const coreLabel = fromCache
        ? loadStageLabel('revalidate')
        : fromList
          ? loadStageLabel('core-full')
          : loadStageLabel('core');
      prog.mark('start', uw.start, corePhase, coreLabel);

      const tCore0 =
        typeof performance !== 'undefined' && performance.now
          ? performance.now()
          : Date.now();
      // Let IDB finish (or time out) without blocking core fetch
      void idbHydrateP;

      const apiMax = 100;
      const canFetchThreads = Boolean(
        globalThis.PRTreeFetch.fetchReviewThreadsPage
      );
      const mergeFn =
        globalThis.PRTreeFetch.mergeReviewThreadsPageIntoDetail || null;
      /** @type {any} */
      let earlyThreadsPage = null;
      let corePainted = false;
      let threadsPaintedEarly = false;

      /** Merge SWR preserve fields from cache into network core detail. */
      function mergeCoreWithCache(raw, cacheSnap) {
        let detail = raw;
        if (
          cacheSnap &&
          Array.isArray(cacheSnap.reviewComments) &&
          cacheSnap.reviewComments.length &&
          (!Array.isArray(detail.reviewComments) || !detail.reviewComments.length)
        ) {
          detail = {
            ...detail,
            reviewComments: cacheSnap.reviewComments,
            reviewThreads: cacheSnap.reviewThreads || detail.reviewThreads,
            reviewThreadsMeta:
              cacheSnap.reviewThreadsMeta || detail.reviewThreadsMeta,
            reviewCommentsMeta:
              cacheSnap.reviewCommentsMeta || detail.reviewCommentsMeta,
            comments:
              Array.isArray(detail.comments) && detail.comments.length
                ? detail.comments
                : cacheSnap.comments || detail.comments,
          };
        }
        if (cacheSnap && Array.isArray(cacheSnap.files) && cacheSnap.files.length) {
          const netFiles = Array.isArray(detail.files) ? detail.files : [];
          const cachedHasPatches = cacheSnap.files.some(
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
            detail = { ...detail, files: cacheSnap.files };
          }
        }
        if (
          cacheSnap &&
          Array.isArray(cacheSnap.commits) &&
          cacheSnap.commits.length &&
          (!Array.isArray(detail.commits) || !detail.commits.length)
        ) {
          detail = { ...detail, commits: cacheSnap.commits };
        }
        if (detail && typeof detail === 'object') {
          detail = { ...detail, _sketch: undefined, _source: 'network' };
        }
        return detail;
      }

      /** Immediate partial paint when core fetch resolves (do not wait for threads/IDB). */
      function paintCoreNow(raw) {
        if (!openStill() || !raw) return null;
        // Core writes meta slice only (via applyCorePayload) — never empties
        // files/commits/reviews that other fetches own.
        const fromNetwork = mergeCoreWithCache(raw, cached);
        ensureDetailStore(current.detail);
        applyCoreToStore(fromNetwork);
        current.loading = false;
        current.error = null;
        const detail = current.detail;
        detailCache.set(key, detail);
        corePainted = true;
        setLoadStage(
          'threads',
          fromCache || detailRank(cached) >= 3
            ? loadStageLabel('threads-update')
            : loadStageLabel('threads-load'),
          true,
          { percent: prog.percent() }
        );
        render();
        console.log(
          `[pr-plus] openModal phase=core-paint ${owner}/${repo}#${number} ` +
            `(prior=${fromCache ? 'cache' : fromList ? 'list' : 'empty'}) pct=${prog.percent()}`
        );
        // Independent panels — do not block conversation/threads
        kickIndependentSideFetches({
          owner,
          repo,
          number,
          headSha: detail.headSha || null,
          body: detail.body || '',
          gen,
          stillOpenFn: openStill,
          signal,
        });
        // If threads already landed, merge immediately (partial progressive UI)
        if (earlyThreadsPage && typeof mergeFn === 'function') {
          paintThreadsNewestNow(earlyThreadsPage);
        }
        return detail;
      }

      /**
       * Immediate partial paint when newest threads resolve — works against
       * cache/list core already on screen, without waiting for network core.
       */
      function paintThreadsNewestNow(page) {
        if (!openStill() || !page || typeof mergeFn !== 'function') return false;
        const base = current.detail;
        // Need a real detail shell (cache or core) — not empty
        if (!base || typeof base !== 'object') return false;
        // Allow merge into sketch only if it has identity; prefer non-empty host
        const next = mergeFn(base, page, 'newest');
        if (!next) return false;
        current.loading = false;
        // Threads merge only touches threads slice (via applyThreadsToStore)
        applyThreadsToStore(next);
        detailCache.set(key, current.detail);
        threadsPaintedEarly = true;
        setLoadStage(
          'threads',
          fromCache || detailRank(cached) >= 3
            ? loadStageLabel('threads-update')
            : loadStageLabel('threads-load'),
          true,
          { percent: prog.percent() }
        );
        render();
        console.log(
          `[pr-plus] openModal phase=threads.last-early-paint ${owner}/${repo}#${number} ` +
            `(${page?.threads?.length || 0} threads) pct=${prog.percent()}`
        );
        return true;
      }

      const tl = getFetchTimeline();
      const span =
        tl && typeof tl.span === 'function'
          ? (name, p, meta) => tl.span(name, p, meta)
          : (_n, p) => p;

      // Start threads in parallel with core — paint as soon as *this* fetch lands
      const threadsKickoffP = canFetchThreads
        ? span(
            'fetch.threadsNewest',
            globalThis.PRTreeFetch
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
                  fromCache || detailRank(cached) >= 3
                    ? loadStageLabel('threads-update')
                    : loadStageLabel('threads-load')
                );
                earlyThreadsPage = page;
                paintThreadsNewestNow(page);
                tl?.mark?.('paint.threadsNewest', 'mark', {
                  note: `${page?.threads?.length || 0} threads`,
                });
                return { ok: true, page, paintedEarly: threadsPaintedEarly };
              })
              .catch((err) => {
                prog.mark(
                  'threadsNewest',
                  uw.threadsNewest,
                  'threads',
                  loadStageLabel('threads-failed', { message: err?.message })
                );
                return { ok: false, err };
              }),
            { pageSize: apiMax }
          )
        : Promise.resolve({ ok: false, err: null, skipped: true }).then((r) => {
            prog.mark('threadsNewest', uw.threadsNewest, corePhase, coreLabel);
            return r;
          });

      // Core fetch: mark + partial paint on resolve (may finish before or after threads)
      const coreP = span(
        'fetch.core',
        fetchDetailOnce({ skipReviewThreads: true }).then((d) => {
          prog.mark('core', uw.core, corePhase, coreLabel);
          paintCoreNow(d);
          tl?.mark?.('paint.core', 'mark', {
            note: d?.title ? String(d.title).slice(0, 40) : 'core',
            headSha: d?.headSha ? String(d.headSha).slice(0, 7) : null,
          });
          return d;
        })
      );

      // Non-blocking IDB upgrade (must not delay core paint)
      void idbHydrateP
        .then((idbVal) => {
          if (!openStill() || !idbVal) return;
          if (!cached) cached = idbVal;
          if (detailRank(cached) < detailRank(idbVal)) cached = idbVal;
          // Upgrade sketch-only shell if network core not yet painted
          if (
            !corePainted &&
            current.detail &&
            (current.detail._sketch || detailRank(current.detail) < detailRank(idbVal))
          ) {
            resetDetailStoreFromFlat(idbVal);
            current.loading = false;
            render();
            if (earlyThreadsPage) paintThreadsNewestNow(earlyThreadsPage);
            // Side panels from cached headSha while core still in flight
            kickIndependentSideFetches({
              owner,
              repo,
              number,
              headSha: idbVal.headSha || null,
              body: idbVal.body || '',
              gen,
              stillOpenFn: openStill,
              signal,
            });
          }
        })
        .catch(() => {});

      // Kick independent panels ASAP (files/comments/reviews/commits/development).
      // Do not wait for core — only checks needs headSha (re-kicked from paintCoreNow).
      {
        const seed = cached || listSketch || initialDetail || null;
        kickIndependentSideFetches({
          owner,
          repo,
          number,
          headSha: seed?.headSha || null,
          body: seed?.body || '',
          gen,
          stillOpenFn: openStill,
          signal,
        });
      }

      let detail = await coreP;
      const coreMs = Math.round(
        (typeof performance !== 'undefined' && performance.now
          ? performance.now()
          : Date.now()) - tCore0
      );
      console.log(
        `[pr-plus] openModal phase=core ${owner}/${repo}#${number}: ${coreMs}ms ` +
          (detail?._fetchTimings
            ? JSON.stringify(detail._fetchTimings)
            : '(no per-request timings)') +
          ` pct=${prog.percent()} painted=${corePainted}`
      );
      if (!openStill()) return;
      // Ensure core is on screen (paintCoreNow should have run; re-apply if aborted mid-flight)
      if (!corePainted && detail) {
        detail = paintCoreNow(detail) || detail;
      } else {
        detail = current.detail || detail;
      }

      // Phase 2: await parallel threads kickoff (may already be painted early)
      // - Cold open: dual-window (newest last:N + oldest first:20)
      // - Cache revalidate: newest last:100 + bulk unresolved by PRRT ids
      if (canFetchThreads) {
        try {
          const nowMs = () =>
            typeof performance !== 'undefined' && performance.now
              ? performance.now()
              : Date.now();
          const tThreads0 = nowMs();
          // Revalidate path when we had durable cache (memory/IDB), not mere list sketch
          const useRevalidatePath = fromCache || detailRank(cached) >= 3;

          if (useRevalidatePath) {
            // —— Incremental revalidate ——
            setLoadStage(
              'threads',
              loadStageLabel('threads-update'),
              true,
              { percent: prog.percent() }
            );
            render();

            const tNewest0 = nowMs();
            const kick = await threadsKickoffP;
            if (!kick.ok) throw kick.err || new Error('Threads fetch failed');
            const newest = kick.page;
            console.log(
              `[pr-plus] openModal phase=threads.last ${owner}/${repo}#${number}: ${Math.round(
                nowMs() - tNewest0
              )}ms (${newest?.threads?.length || 0} threads, parallel-kickoff) pct=${prog.percent()} early=${Boolean(kick.paintedEarly || threadsPaintedEarly)}`
            );
            if (!openStill()) return;

            const updatedIdSet = new Set(
              (newest?.threads || [])
                .map((t) => (t?.threadNodeId ? String(t.threadNodeId) : ''))
                .filter(Boolean)
            );

            // Re-merge if early paint raced before core, or not painted yet
            let next =
              typeof mergeFn === 'function'
                ? mergeFn(current.detail, newest, 'newest')
                : current.detail;

            applyThreadsToStore(next);
            detail = current.detail;
            detailCache.set(key, detail);
            setLoadStage(
              'threads',
              loadStageLabel('threads-unresolved'),
              true,
              { percent: prog.percent() }
            );
            render();

            // Step 2: remaining unresolved not in last-100; drop remote-missing zombies
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
            let unresolvedPass = 0;
            let didUnresolvedFetch = false;
            /** PRRT ids confirmed remote-missing this open — never re-fetch. */
            const knownMissing = new Set();
            while (
              unresolvedPass < 2 &&
              typeof globalThis.PRTreeFetch.fetchReviewThreadsByIds === 'function'
            ) {
              unresolvedPass += 1;
              const remainingUnresolvedIds = collectIds(next).filter((id) => {
                const s = String(id);
                return !updatedIdSet.has(s) && !knownMissing.has(s);
              });
              if (!remainingUnresolvedIds.length) {
                if (unresolvedPass === 1) {
                  console.log(
                    `[pr-plus] openModal phase=threads.unresolved-remaining ${owner}/${repo}#${number}: skipped (0 remaining, last=${updatedIdSet.size})`
                  );
                }
                break;
              }
              didUnresolvedFetch = true;
              const tBulk0 = nowMs();
              const bulk = await globalThis.PRTreeFetch.fetchReviewThreadsByIds(
                remainingUnresolvedIds,
                { signal }
              );
              const missingList = Array.isArray(bulk?.missingThreadIds)
                ? bulk.missingThreadIds
                : [];
              for (const id of missingList) knownMissing.add(String(id));
              const missingN = missingList.length;
              console.log(
                `[pr-plus] openModal phase=threads.unresolved-remaining ${owner}/${repo}#${number}: ${Math.round(
                  nowMs() - tBulk0
                )}ms (${bulk?.threads?.length || 0}/${remainingUnresolvedIds.length} ids, skipped last=${updatedIdSet.size}` +
                  (missingN ? `, dropped ${missingN} remote-missing` : '') +
                  `, pass ${unresolvedPass})`
              );
              if (gen !== detailFetchGen) return;
              if (
                current.open &&
                Number(current.number) === Number(number) &&
                typeof mergeFn === 'function' &&
                bulk
              ) {
                next = mergeFn(next, bulk, 'refresh');
              }
              if (!missingN) break;
            }

            // Credit follow-up weight when bulk finished or was skipped
            prog.mark(
              'threadsFollow',
              uw.threadsFollow,
              'threads',
              didUnresolvedFetch
                ? loadStageLabel('threads-unresolved')
                : loadStageLabel('threads-update')
            );
            console.log(
              `[pr-plus] openModal phase=threads(revalidate) ${owner}/${repo}#${number}: ${Math.round(
                nowMs() - tThreads0
              )}ms total pct=${prog.percent()}`
            );
            if (!openStill()) return;
            if (current.detail) {
              applyThreadsToStore(next);
              detail = current.detail;
              detailCache.set(key, detail);
              tryFinishOpenProgress(prog);
              render();
            }
          } else {
            // —— Cold open: last:100 (parallel kickoff) then start:20 if total ≥ 100 ——
            const tNewest0 = nowMs();
            const kick = await threadsKickoffP;
            if (!kick.ok) throw kick.err || new Error('Threads fetch failed');
            const newest = kick.page;
            console.log(
              `[pr-plus] openModal phase=threads.last ${owner}/${repo}#${number}: ${Math.round(
                nowMs() - tNewest0
              )}ms (${newest?.threads?.length || 0} threads, parallel-kickoff) pct=${prog.percent()} early=${Boolean(kick.paintedEarly || threadsPaintedEarly)}`
            );
            if (!openStill()) return;
            // Re-merge after core (early paint may have used sketch/cache base)
            let next =
              typeof mergeFn === 'function'
                ? mergeFn(current.detail, newest, 'newest')
                : current.detail;

            applyThreadsToStore(next);
            detail = current.detail;
            next = detail;
            detailCache.set(key, detail);
            render();

            const totalCount =
              typeof newest.totalCount === 'number'
                ? newest.totalCount
                : newest.threads?.length || 0;
            // total < 100 → last page already covers everything; skip start
            const needStartWindow =
              totalCount >= apiMax && Boolean(newest.hasPreviousPage);
            if (needStartWindow) {
              try {
                setLoadStage(
                  'threads',
                  loadStageLabel('threads-earlier'),
                  true,
                  { percent: prog.percent() }
                );
                render();
                const tOldest0 = nowMs();
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
                console.log(
                  `[pr-plus] openModal phase=threads.start ${owner}/${repo}#${number}: ${Math.round(
                    nowMs() - tOldest0
                  )}ms (${oldest?.threads?.length || 0} threads, total=${totalCount})`
                );
                if (openStill() && typeof mergeFn === 'function') {
                  next = mergeFn(next, oldest, 'oldest');
                }
              } catch {
                /* keep last-only window */
              }
            } else {
              console.log(
                `[pr-plus] openModal phase=threads.start ${owner}/${repo}#${number}: skipped (total=${totalCount} < ${apiMax})`
              );
            }
            // Follow-up weight after start window completes or is skipped
            prog.mark(
              'threadsFollow',
              uw.threadsFollow,
              'threads',
              loadStageLabel('threads-load')
            );
            console.log(
              `[pr-plus] openModal phase=threads ${owner}/${repo}#${number}: ${Math.round(
                nowMs() - tThreads0
              )}ms total pct=${prog.percent()}`
            );
            if (!openStill()) return;
            if (current.detail) {
              applyThreadsToStore(next);
              detail = current.detail;
              detailCache.set(key, detail);
              tryFinishOpenProgress(prog);
              render();
            }

            // Full load when "가볍고 빠른 PR 검토" is off — drain remaining pages
            if (
              !fastReview &&
              gen === detailFetchGen &&
              current.open &&
              current.detail?.reviewThreadsMeta?.hasMore
            ) {
              try {
                const props = buildProps();
                if (typeof props.onLoadMoreReviewThreads === 'function') {
                  await props.onLoadMoreReviewThreads('all');
                }
              } catch {
                /* stage error already surfaced */
              }
            }
          }
        } catch (threadErr) {
          // Core already painted — keep it; surface soft stage error
          if (openStill()) {
            prog.mark(
              'threadsFollow',
              uw.threadsFollow,
              'threads',
              loadStageLabel('threads-failed', { message: threadErr?.message })
            );
            if (!tryFinishOpenProgress(prog)) {
              setLoadStage(
                'threads',
                loadStageLabel('threads-failed', { message: threadErr?.message }),
                true,
                { percent: Math.min(99, prog.percent()) }
              );
            }
            render();
          }
        }
      } else {
        // No thread API — credit remaining units then settle
        prog.mark('threadsFollow', uw.threadsFollow, corePhase, coreLabel);
        tryFinishOpenProgress(prog);
        render();
      }
    } catch (err) {
      if (
        gen !== detailFetchGen ||
        signal.aborted ||
        err?.name === 'AbortError' ||
        /aborted|AbortError/i.test(String(err?.message || err || ''))
      ) {
        return;
      }
      if (current.open) {
        current.loading = false;
        if (!current.detail) {
          current.error = err?.message || String(err);
        }
        clearLoadStage();
        render();
      }
    }
    })(); // end background upgrade after sync first paint
  }

  /**
   * After stack tree is applied on /pulls, reopen the modal that was open before refresh.
   * Priority: sessionStorage open snap > URI (pr+number / page / position).
   * Diff/conversation layout also restored inside App via loadSessionView + initialRoute.
   */

  async function tryRestoreOpenModal() {
    if (!hostEnabled) return { ok: false, reason: 'disabled' };
    if (!isPullsListPage()) return { ok: false, reason: 'not-pulls' };
    if (current.open) return { ok: true, reason: 'already-open' };

    // Extension reload leaves orphan content scripts; restore needs a tab refresh
    const bridge = globalThis.PRTreeBridge;
    if (
      typeof bridge?.isExtensionContextAlive === 'function' &&
      !bridge.isExtensionContextAlive()
    ) {
      return {
        ok: false,
        reason: 'context-invalidated',
        message:
          bridge.RELOAD_REFRESH_MSG ||
          'Extension was reloaded. Refresh this GitHub tab to reconnect pr+.',
      };
    }

    const path = location.pathname || '';
    const m = path.match(/^\/([^/]+)\/([^/]+)\/pulls/);
    if (!m) return { ok: false, reason: 'path' };
    const pathOwner = m[1];
    const pathRepo = m[2];

    const sess = sessionApi();
    const uri = uriApi();
    let sessionOpen = null;
    if (typeof sessionStorage !== 'undefined' && sess?.loadOpenModal) {
      sessionOpen = sess.loadOpenModal(sessionStorage);
    }
    let sessionView = null;
    if (
      sessionOpen &&
      typeof sessionStorage !== 'undefined' &&
      sess?.loadSessionView
    ) {
      sessionView = sess.loadSessionView(
        sessionStorage,
        sessionOpen.owner,
        sessionOpen.repo,
        sessionOpen.number
      );
    }
    const uriRoute =
      typeof uri?.parseLocationRoute === 'function'
        ? uri.parseLocationRoute(typeof location !== 'undefined' ? location : null)
        : { page: null, number: null, position: null };

    const resolved =
      typeof uri?.resolveRestore === 'function'
        ? uri.resolveRestore({
            sessionOpen,
            sessionView,
            uri: uriRoute,
            pathOwner,
            pathRepo,
          })
        : sessionOpen
          ? {
              open: sessionOpen,
              page: sessionOpen.page || null,
              position: sessionOpen.position || null,
              source: 'session',
            }
          : { open: null, page: null, position: null, source: 'none' };

    if (!resolved.open) return { ok: false, reason: 'none' };

    // Session restore must match current pulls list repo
    if (resolved.source === 'session') {
      if (
        pathOwner.toLowerCase() !== String(resolved.open.owner).toLowerCase() ||
        pathRepo.toLowerCase() !== String(resolved.open.repo).toLowerCase()
      ) {
        return { ok: false, reason: 'repo-mismatch' };
      }
    }

    try {
      await openModal({
        owner: resolved.open.owner,
        repo: resolved.open.repo,
        number: resolved.open.number,
        page: resolved.page,
        position: resolved.position,
      });
    } catch (err) {
      const msg = String(err?.message || err || '');
      if (
        /Extension context invalidated|Extension was reloaded/i.test(msg)
      ) {
        return {
          ok: false,
          reason: 'context-invalidated',
          message: msg,
        };
      }
      throw err;
    }
    return {
      ok: true,
      owner: resolved.open.owner,
      repo: resolved.open.repo,
      number: resolved.open.number,
      page: resolved.page,
      position: resolved.position,
      source: resolved.source,
    };
  }

  /**
   * On PR conversation/files/changes routes, mount pr+ as in-page embed under GH header.
   * Soft-nav re-entry when path / commit / #diff- changes.
   */
  function tryEmbedFromLocation() {
    if (!hostEnabled) return { ok: false, reason: 'disabled' };
    const locKey = embedLocationKey();
    const path = typeof location !== 'undefined' ? location.pathname : '';
    const target = parseGithubLocation() || parsePrPagePath(path);
    if (!target) {
      if (isEmbedPresentation(current.presentation) && current.open) {
        closeModal();
      }
      lastEmbedPath = locKey;
      removeGithubPrToggle();
      return { ok: false, reason: 'not-pr-page' };
    }
    const samePr =
      current.open &&
      isEmbedPresentation(current.presentation) &&
      String(current.owner).toLowerCase() === String(target.owner).toLowerCase() &&
      String(current.repo).toLowerCase() === String(target.repo).toLowerCase() &&
      Number(current.number) === Number(target.number);
    const sameSurface =
      samePr &&
      current.routePage === target.page &&
      String(current.routeCommitSha || '') === String(target.commitSha || '') &&
      String(current.routeCommitEndSha || '') === String(target.commitEndSha || '') &&
      String(current.routeFileKey || '') === String(target.fileKey || '') &&
      Number(current.routeStartLine || 0) === Number(target.startLine || 0) &&
      Number(current.routeEndLine || 0) === Number(target.endLine || 0);
    lastEmbedPath = locKey;
    if (sameSurface) {
      // Re-hide native if Turbo re-injected content, and remount if host was destroyed
      ensureEmbedHost();
      render();
      removeGithubPrToggle();
      return { ok: true, reason: 'already-open' };
    }
    if (samePr) {
      // Same PR, path/hash changed — remount so App re-applies commit/selection
      applyRouteFieldsFromTarget(target);
      dropReactRoot();
      ensureEmbedHost();
      render();
      removeGithubPrToggle();
      return { ok: true, reason: 'route-updated', page: target.page };
    }
    // Auto-open only when pref allows (manual: header pr+ / ⌘⇧E)
    if (prefs.autoOpenEmbed === false) {
      try {
        ensureGithubPrToggle();
      } catch {
        /* ignore */
      }
      return { ok: false, reason: 'auto-open-disabled' };
    }
    void openModal({
      owner: target.owner,
      repo: target.repo,
      number: target.number,
      page: target.page,
      presentation: 'embed',
      commitSha: target.commitSha || null,
      commitEndSha: target.commitEndSha || null,
      filePath: target.filePath || null,
      fileKey: target.fileKey || null,
      startLine: target.startLine ?? null,
      endLine: target.endLine ?? null,
      side: target.side || null,
    });
    removeGithubPrToggle();
    return {
      ok: true,
      owner: target.owner,
      repo: target.repo,
      number: target.number,
      page: target.page,
    };
  }

  function installEmbedWatch() {
    if (embedWatchInstalled) return;
    embedWatchInstalled = true;
    const onNav = () => {
      if (!hostEnabled) return;
      const locKey = embedLocationKey();
      if (
        locKey === lastEmbedPath &&
        current.open &&
        isEmbedPresentation(current.presentation)
      ) {
        // Same path+hash: Turbo may have replaced #prp-page-embed — rebind React root
        try {
          ensureEmbedHost();
          render();
        } catch {
          /* ignore */
        }
        return;
      }
      tryEmbedFromLocation();
      try {
        ensureGithubPrToggle();
      } catch {
        /* ignore */
      }
    };
    window.addEventListener('popstate', onNav);
    window.addEventListener('turbo:load', onNav);
    window.addEventListener('turbo:render', onNav);
    window.addEventListener('pjax:end', onNav);
    // GitHub soft navigations sometimes only mutate DOM
    document.addEventListener('soft-nav:end', onNav);
    // Fallback poll for missed events (pathname + hash)
    const pollId = window.setInterval(() => {
      if (!hostEnabled) return;
      if (embedLocationKey() !== lastEmbedPath) onNav();
    }, 800);
    // Allow Node test processes to exit (browser ignores unref)
    try {
      if (typeof pollId === 'object' && typeof pollId.unref === 'function') {
        pollId.unref();
      } else if (
        typeof pollId === 'number' &&
        typeof window.clearInterval === 'function'
      ) {
        /* browser timer id */
      }
    } catch {
      /* ignore */
    }
  }

  function setEnabled(enabled) {
    hostEnabled = Boolean(enabled);
    if (!hostEnabled) {
      // Tear down modal + stop intercepting so GitHub is fully native
      removeGithubPrToggle();
      try {
        closePullsPalette();
      } catch {
        /* ignore */
      }
      try {
        clearPullsListFocus();
      } catch {
        /* ignore */
      }
      if (current.open) {
        clearUriRoute();
        const wasEmbed = isEmbedPresentation(current.presentation);
        current = {
          open: false,
          loading: false,
          error: null,
          detail: null,
          owner: null,
          repo: null,
          number: null,
          routePage: null,
          routePosition: null,
          routeCommitSha: null,
          routeCommitEndSha: null,
          routeFilePath: null,
          routeFileKey: null,
          routeStartLine: null,
          routeEndLine: null,
          routeSide: null,
          loadStage: null,
          presentation: 'modal',
        };
        render();
        if (wasEmbed) restoreNativeMain();
      } else {
        restoreNativeMain();
      }
      return;
    }
    // Light preload only — full warmUp runs after list paint (content.js)
    void ensureAssets();
    installEmbedWatch();
    ensurePrefsWatch();
    // Wait for prefs so autoOpenEmbed=false is respected before first open.
    void warmPrefs()
      .catch(() => prefs)
      .then(() => {
        tryEmbedFromLocation();
        try {
          ensureGithubPrToggle();
        } catch {
          /* ignore */
        }
      });
  }

  function parsePrFromAnchor(anchor) {
    if (!anchor || !anchor.getAttribute) return null;
    const href = anchor.getAttribute('href') || '';
    const m = href.match(/\/?([^/]+)\/([^/]+)\/pull\/(\d+)(?:\/|$|\?|#)/);
    if (!m) return null;
    return { owner: m[1], repo: m[2], number: Number(m[3]) };
  }

  function isPullsListPage() {
    return /\/[^/]+\/[^/]+\/pulls/.test(location.pathname || '');
  }

  /**
   * Keyboard focus on the native PR list (⌥J / ⌥K + Enter).
   * Tracks by PR number so tree reorder does not lose the selection.
   */
  let listFocusNumber = null;
  let listFocusKeyBound = false;

  function listFocusApi() {
    return globalThis.PRListFocus || null;
  }

  function listDomApi() {
    return globalThis.PRTreeDOM || null;
  }

  function getPullsListRows() {
    const dom = listDomApi();
    if (typeof dom?.findOriginalPrRows === 'function') {
      try {
        return dom.findOriginalPrRows(document) || [];
      } catch {
        /* ignore */
      }
    }
    return [];
  }

  function getRowPrNumber(row) {
    const dom = listDomApi();
    if (typeof dom?.getPrNumberFromRow === 'function') {
      try {
        return dom.getPrNumberFromRow(row);
      } catch {
        /* ignore */
      }
    }
    return Number.NaN;
  }

  function clearPullsListFocus() {
    const api = listFocusApi();
    const rows = getPullsListRows();
    if (api?.applyFocusToRows) {
      api.applyFocusToRows(rows, -1);
    } else {
      for (const row of rows) {
        row?.classList?.remove?.('prp-list-focus');
        try {
          row?.removeAttribute?.('data-prp-list-focus');
        } catch {
          /* ignore */
        }
      }
    }
    listFocusNumber = null;
  }

  function resolvePullsListFocusIndex() {
    const api = listFocusApi();
    const rows = getPullsListRows();
    if (api?.findFocusIndex) {
      return api.findFocusIndex(rows, {
        focusNumber: listFocusNumber,
        getNumber: getRowPrNumber,
      });
    }
    if (listFocusNumber != null) {
      const byNum = rows.findIndex((r) => getRowPrNumber(r) === listFocusNumber);
      if (byNum >= 0) return byNum;
    }
    return rows.findIndex((r) => r?.classList?.contains?.('prp-list-focus'));
  }

  function applyPullsListFocus(index) {
    const api = listFocusApi();
    const rows = getPullsListRows();
    const row = api?.applyFocusToRows
      ? api.applyFocusToRows(rows, index)
      : (() => {
          for (const r of rows) {
            r?.classList?.remove?.('prp-list-focus');
            try {
              r?.removeAttribute?.('data-prp-list-focus');
            } catch {
              /* ignore */
            }
          }
          if (index < 0 || index >= rows.length) return null;
          const r = rows[index];
          r.classList.add('prp-list-focus');
          try {
            r.setAttribute('data-prp-list-focus', '1');
          } catch {
            /* ignore */
          }
          return r;
        })();
    if (!row) {
      listFocusNumber = null;
      return null;
    }
    const num = getRowPrNumber(row);
    listFocusNumber = Number.isFinite(num) ? num : null;
    try {
      row.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    } catch {
      /* ignore */
    }
    return row;
  }

  function parsePrFromListRow(row) {
    if (!row) return null;
    const links = row.querySelectorAll?.(
      'a[href*="/pull/"], a.js-navigation-open, a[id$="_link"], h3 a'
    );
    if (links) {
      for (const a of links) {
        const parsed = parsePrFromAnchor(a);
        if (parsed) return parsed;
      }
    }
    const num = getRowPrNumber(row);
    if (!Number.isFinite(num)) return null;
    const pathApi = listDomApi();
    const repo =
      typeof pathApi?.parseRepoFromPathname === 'function'
        ? pathApi.parseRepoFromPathname(location.pathname || '')
        : null;
    if (!repo) {
      const m = String(location.pathname || '').match(
        /^\/([^/]+)\/([^/]+)\/pulls(?:\/|$)/
      );
      if (!m) return null;
      return { owner: m[1], repo: m[2], number: num };
    }
    return { owner: repo.owner, repo: repo.repo, number: num };
  }

  function openFocusedPullsListRow() {
    const index = resolvePullsListFocusIndex();
    if (index < 0) return false;
    return openPullsListRowAt(index);
  }

  function openPullsListRowAt(index) {
    const rows = getPullsListRows();
    if (index < 0 || index >= rows.length) return false;
    const row = rows[index];
    const parsed = parsePrFromListRow(row);
    if (!parsed) return false;
    applyPullsListFocus(index);
    void openModal({ ...parsed, page: 'conversation' });
    return true;
  }

  function openNewPullRequestFromList() {
    const api = pullsPaletteApi();
    const repo = getRepoForPalette();
    const href =
      typeof api?.buildCreatePullRequestUrl === 'function'
        ? api.buildCreatePullRequestUrl(
            repo.owner,
            repo.repo,
            getWebOrigin()
          )
        : `${getWebOrigin()}/${repo.owner}/${repo.repo}/compare`;
    return navigatePage(href);
  }

  /** Find GitHub "New pull request" control on the pulls page. */
  function findNewPullRequestControl() {
    try {
      // Prefer labeled CTA (header) over any /compare link
      const candidates = document.querySelectorAll(
        'a[href*="/compare"], a.btn-primary, button.btn-primary, a.Button--primary'
      );
      let fallback = null;
      for (const el of candidates) {
        const t = String(el.textContent || '')
          .replace(/\s+/g, ' ')
          .trim()
          .toLowerCase()
          // strip our badge text if re-shown
          .replace(/⌥n/g, '')
          .trim();
        if (
          t === 'new pull request' ||
          t === 'new pr' ||
          t.startsWith('new pull request')
        ) {
          return el;
        }
        if (
          !fallback &&
          el.matches?.('a[href*="/compare"]') &&
          /compare/.test(el.getAttribute('href') || '')
        ) {
          fallback = el;
        }
      }
      return fallback;
    } catch {
      /* ignore */
    }
    return null;
  }

  function findRowTitleAnchor(row) {
    if (!row?.querySelector) return null;
    return (
      row.querySelector('a.js-navigation-open') ||
      row.querySelector('a[id$="_link"]') ||
      row.querySelector('h3 a[href*="/pull/"]') ||
      row.querySelector('a[href*="/pull/"]')
    );
  }

  function cleanControlLabel(el) {
    return String(el?.textContent || '')
      .replace(/\s+/g, ' ')
      .replace(/⌥⇧?[A-Z0-9]/gi, '')
      .replace(/alt\+shift\+[a-z]/gi, '')
      .trim();
  }

  /** summary.btn-link filter chips in the pulls table header. */
  function findFilterBarControls() {
    const api = listFocusApi();
    const defs = api?.PR_LIST_FILTER_BAR || [];
    const matchFn =
      typeof api?.matchFilterBarLabel === 'function'
        ? api.matchFilterBarLabel
        : null;
    const found = [];
    const seen = new Set();
    // Prefer list header scopes so we don't hit sidebars
    const scopes = [
      document.querySelector('.table-list-header'),
      document.querySelector('.Box .Box-header'),
      document.querySelector('[class*="TableList"]'),
      document.querySelector('.js-check-all-container'),
      document,
    ].filter(Boolean);
    const visited = new Set();
    for (const scope of scopes) {
      const summaries = scope.querySelectorAll?.(
        'summary.btn-link, summary.select-menu-button, summary[role="button"], summary.Button, summary.Button--secondary, summary'
      );
      if (!summaries) continue;
      for (const el of summaries) {
        if (visited.has(el)) continue;
        visited.add(el);
        const text = cleanControlLabel(el);
        const def = matchFn
          ? matchFn(text)
          : defs.find((d) => d.match?.test?.(text));
        if (!def || seen.has(def.id)) continue;
        seen.add(def.id);
        found.push({ el, def });
      }
      if (found.length >= defs.length) break;
    }
    return found;
  }

  /** Dispatch a full click sequence so GH SelectMenu / details open reliably. */
  function clickControl(el) {
    if (!el) return false;
    try {
      el.focus?.({ preventScroll: true });
    } catch {
      try {
        el.focus?.();
      } catch {
        /* ignore */
      }
    }
    const opts = {
      bubbles: true,
      cancelable: true,
      view: window,
      button: 0,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
    };
    try {
      if (typeof PointerEvent === 'function') {
        el.dispatchEvent(new PointerEvent('pointerdown', opts));
      }
      el.dispatchEvent(new MouseEvent('mousedown', opts));
      if (typeof PointerEvent === 'function') {
        el.dispatchEvent(new PointerEvent('pointerup', opts));
      }
      el.dispatchEvent(new MouseEvent('mouseup', opts));
      el.dispatchEvent(new MouseEvent('click', opts));
      return true;
    } catch {
      try {
        el.click?.();
        return true;
      } catch {
        return false;
      }
    }
  }

  function activateFilterBar(filterId) {
    // Filters ▾ open/close (toggle)
    if (filterId === 'filters-menu') {
      return toggleFiltersMenu();
    }
    const controls = findFilterBarControls();
    const hit = controls.find((c) => c.def?.id === filterId);
    if (!hit?.el) return false;
    // Do not set details.open manually — can double-toggle with click.
    // Real click opens SelectMenu + focuses the control.
    return clickControl(hit.el);
  }

  function findFiltersMenuSummary() {
    try {
      const summaries = document.querySelectorAll('summary');
      for (const el of summaries) {
        const t = cleanControlLabel(el);
        if (/^filters?$/i.test(t)) return el;
      }
    } catch {
      /* ignore */
    }
    return null;
  }

  /** Open or close the GH “Filters ▾” dropdown next to search. */
  function toggleFiltersMenu() {
    const summary = findFiltersMenuSummary();
    if (!summary) return false;
    return clickControl(summary);
  }

  let listHotkeyHintsVisible = false;

  /**
   * While Option is held: show list hotkeys + filter-bar ⌥⇧ shortcuts + ⌥⇧N.
   * Filter badges are CSS-positioned on each control (scroll-follow for free).
   */
  function setPullsListHotkeyHints(visible) {
    const api = listFocusApi();
    const slots =
      (api && api.PR_LIST_HOTKEY_SLOTS) ||
      (typeof api?.buildPrListHotkeySlots === 'function'
        ? api.buildPrListHotkeySlots()
        : '123456789abcdefgh ilmnopqrstuvwxyz'.replace(/\s/g, ''));
    const attr =
      (api && api.PR_LIST_HOTKEY_ATTR) || 'data-prp-list-hotkey';
    const newAttr =
      (api && api.PR_LIST_NEW_PR_HOTKEY_ATTR) || 'data-prp-new-pr-hotkey';
    const filterAttr =
      (api && api.PR_LIST_FILTER_BAR_ATTR) || 'data-prp-filter-bar-hotkey';
    const labelFn =
      typeof api?.prListHotkeyLabel === 'function'
        ? api.prListHotkeyLabel
        : (i) => slots[i] || null;

    if (!visible) {
      try {
        document.documentElement.classList.remove('prp-opt-hints');
        document
          .querySelectorAll(`[${attr}], [${newAttr}], [${filterAttr}]`)
          .forEach((el) => el.remove());
        document
          .querySelectorAll('.prp-filter-bar-float-host, .prp-filter-bar-host')
          .forEach((el) => {
            el.classList.remove('prp-filter-bar-float-host', 'prp-filter-bar-host');
          });
      } catch {
        /* ignore */
      }
      return;
    }
    if (!isPullsListPage() || current.open || isPullsPaletteOpen()) return;

    // Lets CSS lift overflow:hidden on GH filter chrome so absolute badges paint above
    try {
      document.documentElement.classList.add('prp-opt-hints');
    } catch {
      /* ignore */
    }

    const rows = getPullsListRows();
    const max = Math.min(rows.length, slots.length);
    for (let i = 0; i < max; i++) {
      const row = rows[i];
      const label = labelFn(i);
      if (!label || !row) continue;
      let badge = row.querySelector?.(`[${attr}]`);
      if (!badge) {
        badge = document.createElement('kbd');
        badge.className = 'prp-list-hotkey';
        badge.setAttribute(attr, label);
        const title = findRowTitleAnchor(row);
        if (title?.parentElement) {
          title.insertAdjacentElement('afterend', badge);
        } else {
          row.appendChild(badge);
        }
      }
      badge.textContent = `⌥${label}`;
      badge.setAttribute(attr, label);
    }

    /*
     * Filter toolbar: badge is a child of the control with CSS absolute.
     * Moves with scroll automatically — no fixed overlay / rAF follow.
     */
    for (const { el, def } of findFilterBarControls()) {
      if (!el || !def) continue;
      try {
        el.classList.add('prp-filter-bar-float-host', 'prp-filter-bar-host');
        // Also mark immediate parents so CSS can set overflow:visible up the chain
        let p = el.parentElement;
        for (let d = 0; p && d < 4; d++) {
          p.classList.add('prp-filter-bar-float-host');
          p = p.parentElement;
        }
      } catch {
        /* ignore */
      }
      let fb = el.querySelector?.(`[${filterAttr}]`);
      if (!fb) {
        fb = document.createElement('kbd');
        fb.className = 'prp-list-hotkey prp-list-hotkey--filter';
        fb.setAttribute(filterAttr, def.key);
        el.appendChild(fb);
      }
      fb.textContent = def.labelMac || `⌥⇧${String(def.key).toUpperCase()}`;
      fb.setAttribute(filterAttr, def.key);
    }

    // New pull request → ⌥⇧N (inside the button/link)
    const newBtn = findNewPullRequestControl();
    if (newBtn) {
      let nb = newBtn.querySelector?.(`[${newAttr}]`);
      if (!nb) {
        nb = document.createElement('kbd');
        nb.className = 'prp-list-hotkey prp-list-hotkey--new';
        nb.setAttribute(newAttr, 'n');
        newBtn.appendChild(nb);
      }
      nb.textContent = '⌥⇧N';
    }
  }

  function showPullsListHotkeyHints() {
    if (listHotkeyHintsVisible) {
      setPullsListHotkeyHints(true);
      return;
    }
    listHotkeyHintsVisible = true;
    setPullsListHotkeyHints(true);
  }

  function hidePullsListHotkeyHints() {
    if (!listHotkeyHintsVisible) {
      setPullsListHotkeyHints(false);
      return;
    }
    listHotkeyHintsVisible = false;
    setPullsListHotkeyHints(false);
  }

  function stepPullsListFocus(delta) {
    const api = listFocusApi();
    const rows = getPullsListRows();
    if (rows.length === 0) return false;
    const cur = resolvePullsListFocusIndex();
    const next =
      typeof api?.nextFocusIndex === 'function'
        ? api.nextFocusIndex(cur, delta, rows.length)
        : (() => {
            if (cur < 0) return delta > 0 ? 0 : rows.length - 1;
            return (cur + (delta > 0 ? 1 : -1) + rows.length) % rows.length;
          })();
    return Boolean(applyPullsListFocus(next));
  }

  function githubPaletteOpenNow() {
    const api = listFocusApi();
    if (typeof api?.touchGithubCommandPaletteOpen === 'function') {
      try {
        return Boolean(api.touchGithubCommandPaletteOpen(document));
      } catch {
        /* ignore */
      }
    }
    if (typeof api?.isGithubCommandPaletteOpen === 'function') {
      try {
        return Boolean(api.isGithubCommandPaletteOpen(document));
      } catch {
        /* ignore */
      }
    }
    try {
      const d = document.getElementById('command-palette-pjax-container');
      return Boolean(d?.open);
    } catch {
      return false;
    }
  }

  /** Escape race: GH often closes its palette before our listener runs. */
  function githubPaletteOwnsEscape(event) {
    const api = listFocusApi();
    if (typeof api?.shouldIgnoreModalEscapeForGithubPalette === 'function') {
      try {
        return Boolean(
          api.shouldIgnoreModalEscapeForGithubPalette(document, {
            target: event?.target,
          })
        );
      } catch {
        /* ignore */
      }
    }
    return githubPaletteOpenNow();
  }

  /**
   * GH ⌘K palette can leave its <dialog> stuck in the CSS top layer (:modal)
   * after close, which blocks all PR list clicks. Heal on user interaction.
   */
  function recoverGithubPaletteIfStuck() {
    const api = listFocusApi();
    if (typeof api?.recoverGithubCommandPaletteTopLayer === 'function') {
      try {
        return Boolean(api.recoverGithubCommandPaletteTopLayer(document));
      } catch {
        return false;
      }
    }
    return false;
  }

  /* ------------------------------------------------------------------ */
  /* Pulls-page command palette (⌥⇧K) — search/filter/open/create        */
  /* ------------------------------------------------------------------ */
  const PULLS_PALETTE_ROOT_ID = 'prp-pulls-palette';
  let pullsPaletteOpen = false;
  let pullsPaletteQuery = '';
  let pullsPaletteFocusIndex = 0;
  /** @type {Array|null} */
  let pullsPaletteItems = null;
  /** Snapshot of list-row focus number so Esc can restore it */
  let pullsPaletteSavedListFocus = null;
  let pullsPaletteRoot = null;
  /** @type {null|(() => void)} */
  let pullsPaletteScrollbarDestroy = null;

  function pullsPaletteApi() {
    return globalThis.PRPullsPalette || null;
  }

  function isPullsPaletteOpen() {
    return Boolean(pullsPaletteOpen);
  }

  function getViewerLoginForPalette() {
    const api = pullsPaletteApi();
    if (typeof api?.readViewerLoginFromDocument === 'function') {
      try {
        const v = api.readViewerLoginFromDocument(document);
        if (v) return v;
      } catch {
        /* ignore */
      }
    }
    try {
      return (
        document
          .querySelector('meta[name="user-login"]')
          ?.getAttribute('content') || ''
      );
    } catch {
      return '';
    }
  }

  function getRepoForPalette() {
    const dom = listDomApi();
    if (typeof dom?.parseRepoFromPathname === 'function') {
      try {
        const r = dom.parseRepoFromPathname(location.pathname || '');
        if (r?.owner && r?.repo) return r;
      } catch {
        /* ignore */
      }
    }
    const m = String(location.pathname || '').match(
      /^\/([^/]+)\/([^/]+)\/pulls(?:\/|$)/
    );
    if (!m) return { owner: '', repo: '' };
    return { owner: m[1], repo: m[2] };
  }

  function getWebOrigin() {
    try {
      return location.origin || 'https://github.com';
    } catch {
      return 'https://github.com';
    }
  }

  function rebuildPullsPaletteItems() {
    const api = pullsPaletteApi();
    const prs = resolveOpenPulls();
    const repo = getRepoForPalette();
    const viewer = getViewerLoginForPalette();
    if (typeof api?.buildPullsPaletteItems === 'function') {
      pullsPaletteItems = api.buildPullsPaletteItems(prs, {
        query: pullsPaletteQuery,
        viewerLogin: viewer,
        owner: repo.owner,
        repo: repo.repo,
        webOrigin: getWebOrigin(),
      });
    } else {
      pullsPaletteItems = [];
    }
    const n = pullsPaletteItems.length;
    if (n === 0) {
      pullsPaletteFocusIndex = -1;
    } else if (
      pullsPaletteFocusIndex < 0 ||
      pullsPaletteFocusIndex >= n
    ) {
      pullsPaletteFocusIndex = 0;
    }
    return pullsPaletteItems;
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /** Author avatar or initials fallback for palette PR rows. */
  function renderPullsPaletteAvatar(item) {
    const login = String(item?.author || '').trim();
    const url = String(item?.authorAvatarUrl || '').trim();
    const initials = login
      ? login
          .slice(0, 2)
          .toUpperCase()
      : '?';
    if (url) {
      return `<img class="prp-pp-avatar" src="${escapeHtml(
        url
      )}" alt="" width="28" height="28" loading="lazy" decoding="async" />`;
    }
    return `<span class="prp-pp-avatar prp-pp-avatar--fallback" aria-hidden="true">${escapeHtml(
      initials
    )}</span>`;
  }

  /** Rich meta row: #num · avatar @author · branch chips */
  function renderPullsPalettePrBody(item) {
    const num = item?.number != null ? Number(item.number) : NaN;
    const numHtml = Number.isFinite(num)
      ? `<span class="prp-pp-pr-num">#${num}</span>`
      : '';
    const author = String(item?.author || '').trim();
    const authorHtml = author
      ? `<span class="prp-pp-author">${renderPullsPaletteAvatar(
          item
        )}<span class="prp-pp-author__login">@${escapeHtml(author)}</span></span>`
      : '';
    const head = String(item?.headRef || '').trim();
    const base = String(item?.baseRef || '').trim();
    let branchHtml = '';
    if (head || base) {
      const headChip = head
        ? `<span class="prp-pp-branch" title="${escapeHtml(head)}">${escapeHtml(
            head
          )}</span>`
        : '';
      const baseChip = base
        ? `<span class="prp-pp-branch prp-pp-branch--base" title="${escapeHtml(
            base
          )}">${escapeHtml(base)}</span>`
        : '';
      const arrow =
        head && base ? `<span class="prp-pp-branch-arrow" aria-hidden="true">→</span>` : '';
      branchHtml = `<span class="prp-pp-branches">${headChip}${arrow}${baseChip}</span>`;
    }
    const draftHtml = item?.draft
      ? `<span class="prp-pp-draft">Draft</span>`
      : '';
    return `
      <span class="prp-pp-item__main">
        <span class="prp-pp-item__title">${escapeHtml(item.title || '')}</span>
        <span class="prp-pp-item__meta">
          ${numHtml}
          ${authorHtml}
          ${draftHtml}
          ${branchHtml}
        </span>
      </span>`;
  }

  /**
   * Action row body: title + aliases/description under it.
   * Must wrap in __main so the digit kbd stays a single right-column badge
   * (bare title/sub children auto-place into col2 / row2).
   */
  function renderPullsPaletteActionBody(item) {
    const aliases = Array.isArray(item?.aliases)
      ? item.aliases.map((a) => String(a || '').trim()).filter(Boolean)
      : [];
    const aliasHtml = aliases.length
      ? `<span class="prp-pp-aliases">${aliases
          .map(
            (a) =>
              `<kbd class="prp-pp-alias">${escapeHtml(a)}</kbd>`
          )
          .join('')}</span>`
      : '';
    const rawDesc = String(item?.description || item?.subtitle || '').trim();
    const aliasJoined = aliases.join(' · ');
    // Avoid repeating pure alias text under the chips
    const desc =
      rawDesc &&
      rawDesc !== aliasJoined &&
      !(aliases.length === 1 && rawDesc === aliases[0])
        ? rawDesc
        : '';
    // If description still starts with "cm · …", drop the alias prefix
    let descShow = desc;
    if (descShow && aliases.length) {
      for (const a of aliases) {
        const prefix = `${a} · `;
        if (descShow.startsWith(prefix)) {
          descShow = descShow.slice(prefix.length);
          break;
        }
      }
    }
    const descHtml = descShow
      ? `<span class="prp-pp-action-desc">${escapeHtml(descShow)}</span>`
      : '';
    const meta =
      aliasHtml || descHtml
        ? `<span class="prp-pp-item__meta prp-pp-item__meta--action">${aliasHtml}${descHtml}</span>`
        : '';
    return `
      <span class="prp-pp-item__main">
        <span class="prp-pp-item__title">${escapeHtml(item?.title || '')}</span>
        ${meta}
      </span>`;
  }

  function fillPullsPaletteHelp(root) {
    const host = root || pullsPaletteRoot;
    const list = host?.querySelector?.('[data-prp-pp-help-list]');
    if (!list) return;
    const api = pullsPaletteApi();
    const entries =
      typeof api?.buildPullsPaletteHelpEntries === 'function'
        ? api.buildPullsPaletteHelpEntries()
        : [];
    if (!entries.length) {
      list.innerHTML =
        '<div class="prp-pp-help__empty prp-muted">No actions configured</div>';
      return;
    }
    list.innerHTML = entries
      .map((e) => {
        const codes = (e.aliases || [])
          .map(
            (a) =>
              `<kbd class="prp-pp-help__alias">${escapeHtml(String(a))}</kbd>`
          )
          .join('');
        const fid = e.filterId
          ? ` data-prp-pp-help-filter="${escapeHtml(String(e.filterId))}"`
          : '';
        return `<button type="button" class="prp-pp-help__row" data-prp-pp-help-run="1"
          data-prp-pp-help-id="${escapeHtml(String(e.id || ''))}"
          data-prp-pp-help-action="${escapeHtml(String(e.action || ''))}"${fid}
          title="Run: ${escapeHtml(e.title)}">
          <span class="prp-pp-help__action">${escapeHtml(e.title)}</span>
          <span class="prp-pp-help__aliases">${codes}</span>
        </button>`;
      })
      .join('');
  }

  /** Run a configured palette action (from help sidebar or list). */
  function executePullsPaletteCommand(item) {
    if (!item || typeof item !== 'object') return false;
    const api = pullsPaletteApi();

    if (item.action === 'toggleFiltersMenu') {
      closePullsPalette();
      queueMicrotask(() => toggleFiltersMenu());
      return true;
    }

    // Toggle right-side help panel (keep palette open)
    if (item.action === 'toggleHelp') {
      togglePullsPaletteHelp();
      return true;
    }

    if (item.action === 'applyFilter' && item.filterId) {
      const repo = getRepoForPalette();
      const fid = String(item.filterId).toLowerCase();
      const href =
        typeof api?.buildPullsListFilterUrl === 'function'
          ? api.buildPullsListFilterUrl(
              repo.owner,
              repo.repo,
              fid,
              getWebOrigin()
            )
          : `${getWebOrigin()}/${repo.owner}/${repo.repo}/pulls`;
      const isExternal = /^https?:\/\//i.test(href);
      if (!isExternal && (!repo.owner || !repo.repo)) {
        console.warn('[pr+] pulls palette filter: missing owner/repo', repo);
        return false;
      }
      closePullsPalette();
      return navigatePage(href);
    }

    if (item.action === 'createPullRequest') {
      const repo = getRepoForPalette();
      const href =
        item.href ||
        (typeof api?.buildCreatePullRequestUrl === 'function'
          ? api.buildCreatePullRequestUrl(
              repo.owner,
              repo.repo,
              getWebOrigin()
            )
          : `${getWebOrigin()}/${repo.owner}/${repo.repo}/compare`);
      closePullsPalette();
      return navigatePage(href);
    }

    if (item.kind === 'pr' || item.action === 'openPullRequest') {
      const repo = getRepoForPalette();
      const owner = item.owner || repo.owner;
      const r = item.repo || repo.repo;
      const number = Number(item.number);
      if (!owner || !r || !Number.isFinite(number)) return false;
      closePullsPalette();
      void openModal({
        owner,
        repo: r,
        number,
        page: 'conversation',
      });
      return true;
    }
    return false;
  }

  function runPullsPaletteHelpAction(el) {
    if (!el) return false;
    const action = el.getAttribute('data-prp-pp-help-action') || '';
    const filterId = el.getAttribute('data-prp-pp-help-filter') || '';
    const id = el.getAttribute('data-prp-pp-help-id') || '';
    return executePullsPaletteCommand({
      id,
      kind: 'action',
      action,
      filterId: filterId || undefined,
    });
  }

  function togglePullsPaletteHelp(force) {
    if (!pullsPaletteRoot) return;
    const panel = pullsPaletteRoot.querySelector('[data-prp-pp-help]');
    const toggle = pullsPaletteRoot.querySelector('[data-prp-pp-help-toggle]');
    if (!panel) return;
    const open =
      typeof force === 'boolean' ? force : panel.hasAttribute('hidden');
    if (open) {
      panel.removeAttribute('hidden');
      fillPullsPaletteHelp(pullsPaletteRoot);
      toggle?.setAttribute('aria-expanded', 'true');
      pullsPaletteRoot
        .querySelector('.prp-pp-panel')
        ?.classList.add('prp-pp-panel--help');
    } else {
      panel.setAttribute('hidden', '');
      toggle?.setAttribute('aria-expanded', 'false');
      pullsPaletteRoot
        .querySelector('.prp-pp-panel')
        ?.classList.remove('prp-pp-panel--help');
    }
  }

  /**
   * Move focus highlight without rebuilding list DOM (avoids re-animation / re-render).
   */
  function updatePullsPaletteFocus() {
    if (!pullsPaletteRoot) return;
    const listEl = pullsPaletteRoot.querySelector('[data-prp-pp-list]');
    if (!listEl) return;
    const rows = listEl.querySelectorAll('.prp-pp-item[data-prp-pp-index]');
    if (!rows.length) return;
    let focusedEl = null;
    for (const row of rows) {
      const i = Number(row.getAttribute('data-prp-pp-index'));
      const on = i === pullsPaletteFocusIndex;
      row.classList.toggle('is-focused', on);
      row.setAttribute('aria-selected', on ? 'true' : 'false');
      if (on) focusedEl = row;
    }
    try {
      // Instant — never smooth-scroll on focus step
      focusedEl?.scrollIntoView?.({ block: 'nearest', behavior: 'auto' });
    } catch {
      /* ignore */
    }
  }

  /** Full list rebuild (query / open). Prefer updatePullsPaletteFocus for ↑↓. */
  function paintPullsPalette() {
    if (!pullsPaletteRoot) return;
    const items = rebuildPullsPaletteItems() || [];
    const listEl = pullsPaletteRoot.querySelector('[data-prp-pp-list]');
    const input = pullsPaletteRoot.querySelector('[data-prp-pp-input]');
    const meta = pullsPaletteRoot.querySelector('[data-prp-pp-meta]');
    if (input && input.value !== pullsPaletteQuery) {
      input.value = pullsPaletteQuery;
    }
    if (meta) {
      const viewer = getViewerLoginForPalette();
      meta.textContent = viewer
        ? `Type to filter · open help for actions  ·  @${viewer}`
        : 'Type to filter · open help for actions';
    }
    if (!listEl) return;
    if (items.length === 0) {
      listEl.removeAttribute('data-prp-pp-animate');
      listEl.innerHTML =
        '<li class="prp-pp-empty prp-muted">No matching results</li>';
      return;
    }
    // One-shot enter animation on full rebuild only (not focus moves)
    listEl.setAttribute('data-prp-pp-animate', '1');
    listEl.innerHTML = items
      .map((item, i) => {
        const focused = i === pullsPaletteFocusIndex ? ' is-focused' : '';
        const digit =
          item.digit != null
            ? `<kbd class="prp-pp-digit">⌥${item.digit}</kbd>`
            : '';
        const isPr = item.kind === 'pr';
        const body = isPr
          ? renderPullsPalettePrBody(item)
          : renderPullsPaletteActionBody(item);
        return `<li class="prp-pp-item${focused}${
          item.kind === 'action' ? ' prp-pp-item--action' : ' prp-pp-item--pr'
        }" data-prp-pp-index="${i}" role="option" aria-selected="${
          i === pullsPaletteFocusIndex ? 'true' : 'false'
        }">
          <button type="button" class="prp-pp-item__btn prp-pp-item__btn--row" data-prp-pp-index="${i}">
            ${body}
            ${digit}
          </button>
        </li>`;
      })
      .join('');
    updatePullsPaletteFocus();
    // Drop animate flag after paint so later DOM ops don't re-trigger
    requestAnimationFrame(() => {
      try {
        listEl.removeAttribute('data-prp-pp-animate');
      } catch {
        /* ignore */
      }
    });
  }

  function closePullsPalette() {
    if (!pullsPaletteOpen && !pullsPaletteRoot) return;
    pullsPaletteOpen = false;
    pullsPaletteQuery = '';
    pullsPaletteItems = null;
    pullsPaletteFocusIndex = 0;
    try {
      pullsPaletteScrollbarDestroy?.();
    } catch {
      /* ignore */
    }
    pullsPaletteScrollbarDestroy = null;
    try {
      pullsPaletteRoot?.remove?.();
    } catch {
      /* ignore */
    }
    pullsPaletteRoot = null;
    // Restore prior list-row keyboard focus when we had one
    if (
      pullsPaletteSavedListFocus != null &&
      Number.isFinite(Number(pullsPaletteSavedListFocus))
    ) {
      const want = Number(pullsPaletteSavedListFocus);
      const rows = getPullsListRows();
      const idx = rows.findIndex((r) => getRowPrNumber(r) === want);
      if (idx >= 0) applyPullsListFocus(idx);
    }
    pullsPaletteSavedListFocus = null;
  }

  function openPullsPalette() {
    if (!hostEnabled || !isPullsListPage() || current.open) return false;
    if (githubPaletteOpenNow()) return false;
    recoverGithubPaletteIfStuck();

    pullsPaletteSavedListFocus = listFocusNumber;
    pullsPaletteOpen = true;
    pullsPaletteQuery = '';
    pullsPaletteFocusIndex = 0;

    let root = document.getElementById(PULLS_PALETTE_ROOT_ID);
    if (!root) {
      root = document.createElement('div');
      root.id = PULLS_PALETTE_ROOT_ID;
      root.className = 'prp-pp-layer prp-pp-layer--enter';
      root.setAttribute('role', 'presentation');
      root.innerHTML = `
        <div class="prp-pp-backdrop" data-prp-pp-close="1"></div>
        <div class="prp-pp-panel" role="dialog" aria-label="pr+ pulls command palette" aria-modal="true">
          <div class="prp-pp-main">
            <div class="prp-pp-head">
              <input class="prp-pp-input" data-prp-pp-input type="search" autocomplete="off" spellcheck="false"
                placeholder="Search PRs or filters…  np  am  df  rd  rs  oi" />
              <div class="prp-pp-meta prp-muted" data-prp-pp-meta></div>
            </div>
            <div class="prp-scroll-float-host prp-edge-fade prp-pp-list-host" data-prp-pp-list-host>
              <ul class="prp-pp-list prp-scroll-float" data-prp-pp-list role="listbox"></ul>
            </div>
            <div class="prp-pp-foot">
              <span class="prp-pp-foot__keys prp-muted">⌥⇧K · ↑↓ · ⌥J ⌥K · Enter · Esc</span>
              <button type="button" class="prp-pp-help-btn" data-prp-pp-help-toggle
                aria-expanded="false" aria-controls="prp-pp-help-panel" title="Help">
                <svg class="prp-pp-help-icon" width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
                  <path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm9 3a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM6.92 6.085c.081-.16.19-.299.34-.398.145-.097.346-.178.62-.178.26 0 .44.07.55.16.12.095.17.22.17.37 0 .17-.06.3-.19.42-.12.12-.33.26-.66.42-.4.19-.7.4-.92.64a1.7 1.7 0 0 0-.36.75 1 1 0 0 0 1.95.4c.02-.08.06-.15.12-.22.08-.09.2-.19.38-.28.4-.2.76-.45 1.02-.74.27-.3.4-.66.4-1.1 0-.47-.16-.88-.48-1.2-.32-.33-.8-.5-1.4-.5-.52 0-.96.13-1.32.39-.36.25-.6.61-.71 1.06a1 1 0 0 0 1.9.4Z"/>
                </svg>
                <span class="prp-pp-help-btn__label prp-muted">help</span>
              </button>
            </div>
          </div>
          <aside class="prp-pp-help" id="prp-pp-help-panel" data-prp-pp-help hidden>
            <div class="prp-pp-help__head">
              <div class="prp-pp-help__title">Actions</div>
              <button type="button" class="prp-pp-help-close" data-prp-pp-help-toggle aria-label="Close help">×</button>
            </div>
            <div class="prp-pp-help__list" data-prp-pp-help-list></div>
            <div class="prp-pp-help__hint prp-muted">Click a row to run · or type alias + Enter</div>
          </aside>
        </div>`;
      document.documentElement.appendChild(root);
      root.addEventListener('click', (e) => {
        const t = e.target;
        if (t?.closest?.('[data-prp-pp-close]')) {
          e.preventDefault();
          closePullsPalette();
          return;
        }
        const helpToggle = t?.closest?.('[data-prp-pp-help-toggle]');
        if (helpToggle) {
          e.preventDefault();
          e.stopPropagation();
          togglePullsPaletteHelp();
          return;
        }
        const helpRun = t?.closest?.('[data-prp-pp-help-run]');
        if (helpRun) {
          e.preventDefault();
          e.stopPropagation();
          runPullsPaletteHelpAction(helpRun);
          return;
        }
        const btn = t?.closest?.('[data-prp-pp-index]');
        if (btn) {
          const idx = Number(btn.getAttribute('data-prp-pp-index'));
          if (Number.isFinite(idx)) {
            pullsPaletteFocusIndex = idx;
            activatePullsPaletteItem(idx);
          }
        }
      });
      const input = root.querySelector('[data-prp-pp-input]');
      input?.addEventListener('input', (e) => {
        pullsPaletteQuery = String(e.target?.value || '');
        pullsPaletteFocusIndex = 0;
        paintPullsPalette();
      });
      fillPullsPaletteHelp(root);
    }
    pullsPaletteRoot = root;
    // Shared floating scrollbar (same system as modal lists)
    try {
      pullsPaletteScrollbarDestroy?.();
    } catch {
      /* ignore */
    }
    pullsPaletteScrollbarDestroy = null;
    try {
      const attach =
        globalThis.PRModalFloatingScrollbar?.attachFloatingScrollbar;
      const listEl = root.querySelector('[data-prp-pp-list]');
      const listHost = root.querySelector('[data-prp-pp-list-host]');
      if (typeof attach === 'function' && listEl) {
        pullsPaletteScrollbarDestroy = attach(listEl, { host: listHost });
      }
    } catch {
      /* ignore */
    }
    // Restart enter animation on reopen
    try {
      root.classList.remove('prp-pp-layer--enter');
      void root.offsetWidth;
      root.classList.add('prp-pp-layer--enter');
    } catch {
      /* ignore */
    }
    paintPullsPalette();
    queueMicrotask(() => {
      try {
        const input = root.querySelector('[data-prp-pp-input]');
        input?.focus?.();
        input?.select?.();
      } catch {
        /* ignore */
      }
    });
    return true;
  }

  /** Navigate the real tab (filters / create) so the pulls list page changes. */

  function navigatePage(href) {
    const raw = String(href || '').trim();
    if (!raw) return false;
    let abs = raw;
    try {
      abs = new URL(raw, location.href).href;
    } catch {
      /* keep raw */
    }
    // GitHub Turbo soft-nav when available (keeps SPA shell, still updates list)
    try {
      const turbo = globalThis.Turbo || globalThis.turbo;
      if (turbo && typeof turbo.visit === 'function') {
        turbo.visit(abs);
        return true;
      }
    } catch {
      /* fall through */
    }
    try {
      location.href = abs;
      return true;
    } catch {
      try {
        location.assign(abs);
        return true;
      } catch {
        try {
          const a = document.createElement('a');
          a.href = abs;
          a.setAttribute('data-turbo', 'true');
          document.body.appendChild(a);
          a.click();
          a.remove();
          return true;
        } catch {
          return false;
        }
      }
    }
  }

  function activatePullsPaletteItem(index) {
    const api = pullsPaletteApi();
    const items = pullsPaletteItems || rebuildPullsPaletteItems() || [];
    // Prefer exact alias (am/my/np) over stale focus index
    const resolvedIdx =
      typeof api?.resolveActivateIndex === 'function'
        ? api.resolveActivateIndex(items, index, pullsPaletteQuery)
        : index;
    const item = items[resolvedIdx];
    if (!item) return false;
    pullsPaletteFocusIndex = resolvedIdx;
    return executePullsPaletteCommand(item);
  }

  function stepPullsPaletteFocus(delta) {
    const api = pullsPaletteApi();
    const items = pullsPaletteItems || rebuildPullsPaletteItems() || [];
    const next =
      typeof api?.nextPaletteFocusIndex === 'function'
        ? api.nextPaletteFocusIndex(
            pullsPaletteFocusIndex,
            delta,
            items.length
          )
        : items.length
          ? (pullsPaletteFocusIndex + delta + items.length) % items.length
          : -1;
    pullsPaletteFocusIndex = next;
    updatePullsPaletteFocus();
    return next;
  }

  function onPullsListKeydown(event) {
    // Escape / any key while GH palette is closing: heal stuck top-layer first
    if (!current.open) {
      recoverGithubPaletteIfStuck();
    }

    // Never steal keys while GitHub's command palette is open
    if (githubPaletteOpenNow()) return;
    // Same Escape that just closed GH palette — do not treat as our action
    if (event.key === 'Escape' && githubPaletteOwnsEscape(event)) return;

    if (!hostEnabled) return;
    if (current.open) return;

    const pp = pullsPaletteApi();
    const listApi = listFocusApi();
    const mod = event.metaKey || event.ctrlKey;
    const shift = event.shiftKey;
    const alt = event.altKey;

    // Option held → show ⌥1–9a–e / ⌥N hints on the list (not inside palette)
    if (
      !isPullsPaletteOpen() &&
      isPullsListPage() &&
      alt &&
      !mod &&
      !shift &&
      (event.code === 'AltLeft' ||
        event.code === 'AltRight' ||
        event.key === 'Alt')
    ) {
      showPullsListHotkeyHints();
    } else if (alt && !mod && !shift && !isPullsPaletteOpen() && isPullsListPage()) {
      // Any other Option+chord while held: keep hints visible
      showPullsListHotkeyHints();
    }

    // --- Pulls command palette shortcuts ---
    if (typeof pp?.resolvePullsPaletteShortcutAction === 'function') {
      const raw = pp.resolvePullsPaletteShortcutAction({
        mod,
        shift,
        alt,
        key: event.key,
        code: event.code,
        paletteOpen: isPullsPaletteOpen(),
        isPullsList: isPullsListPage(),
        hostEnabled,
        githubPaletteOpen: false,
        modalOpen: false,
        editableTarget: isEditableKeyTarget(event.target),
      });
      const { action, digitIndex } =
        typeof pp.unwrapPullsPaletteAction === 'function'
          ? pp.unwrapPullsPaletteAction(raw)
          : { action: typeof raw === 'string' ? raw : raw?.action, digitIndex: raw?.digitIndex ?? -1 };

      if (action) {
        // Allow typing in the palette search for normal keys; only handle resolved actions
        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === 'function') {
          event.stopImmediatePropagation();
        }
        if (action === 'openPalette') {
          openPullsPalette();
          return;
        }
        if (action === 'closePalette') {
          closePullsPalette();
          return;
        }
        if (action === 'focusNext') {
          stepPullsPaletteFocus(1);
          return;
        }
        if (action === 'focusPrev') {
          stepPullsPaletteFocus(-1);
          return;
        }
        if (action === 'activate') {
          activatePullsPaletteItem(
            pullsPaletteFocusIndex >= 0 ? pullsPaletteFocusIndex : 0
          );
          return;
        }
        // (selectDigit handled below)
        if (action === 'selectDigit') {
          const items = pullsPaletteItems || rebuildPullsPaletteItems() || [];
          if (digitIndex >= 0 && digitIndex < items.length) {
            pullsPaletteFocusIndex = digitIndex;
            activatePullsPaletteItem(digitIndex);
          }
          return;
        }
      }
    }

    // When palette is open, do not run list-row shortcuts
    if (isPullsPaletteOpen()) return;

    if (!isPullsListPage()) return;

    // Peer filter actions (⌥⇧G Assigned, ⌥⇧C Created, …) — floating dock
    if (alt && shift && !mod && typeof pp?.resolvePullsPeerOptAction === 'function') {
      const peer = pp.resolvePullsPeerOptAction({
        alt: true,
        shift: true,
        mod: false,
        key: event.key,
        code: event.code,
      });
      if (peer?.filterId || peer?.action) {
        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === 'function') {
          event.stopImmediatePropagation();
        }
        executePullsPaletteCommand({
          action: peer.action || 'applyFilter',
          filterId: peer.filterId,
          id: peer.id,
        });
        return;
      }
    }

    const resolve =
      listApi?.resolvePrListShortcutAction ||
      (typeof globalThis !== 'undefined' &&
        globalThis.PRListFocus?.resolvePrListShortcutAction);
    if (typeof resolve !== 'function') return;

    const rawList = resolve({
      mod,
      shift,
      alt,
      key: event.key,
      code: event.code,
      editableTarget: isEditableKeyTarget(event.target),
      modalOpen: Boolean(current.open),
      isPullsList: true,
      hostEnabled,
      hasFocusedRow: resolvePullsListFocusIndex() >= 0,
      githubPaletteOpen: false,
      pullsPaletteOpen: false,
    });
    const unwrapped =
      typeof listApi?.unwrapPrListAction === 'function'
        ? listApi.unwrapPrListAction(rawList)
        : typeof rawList === 'string'
          ? { action: rawList, index: -1, filterId: null }
          : {
              action: rawList?.action || null,
              index: rawList?.index ?? -1,
              filterId: rawList?.filterId || null,
            };
    const { action, index: hotIndex, filterId } = unwrapped;
    if (!action) return;

    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === 'function') {
      event.stopImmediatePropagation();
    }

    if (action === 'focusNext') {
      stepPullsListFocus(1);
      return;
    }
    if (action === 'focusPrev') {
      stepPullsListFocus(-1);
      return;
    }
    if (action === 'openFocused') {
      openFocusedPullsListRow();
      return;
    }
    if (action === 'openByHotkey') {
      hidePullsListHotkeyHints();
      openPullsListRowAt(hotIndex);
      return;
    }
    if (action === 'openFilterBar') {
      hidePullsListHotkeyHints();
      activateFilterBar(filterId);
      return;
    }
    if (action === 'newPullRequest') {
      hidePullsListHotkeyHints();
      openNewPullRequestFromList();
    }
  }

  function onPullsListKeyup(event) {
    if (event.key === 'Alt' || event.code === 'AltLeft' || event.code === 'AltRight') {
      hidePullsListHotkeyHints();
    }
    // If Option released mid-chord (browser may not fire Alt keyup alone)
    if (!event.altKey) {
      hidePullsListHotkeyHints();
    }
  }

  /**
   * ⌥J/K list navigator is ephemeral: any pointer/click or focus leaving
   * the list clears the highlight so it does not stick after mouse use.
   */
  function dismissPullsListFocusIfAny() {
    if (listFocusNumber == null && resolvePullsListFocusIndex() < 0) return;
    clearPullsListFocus();
  }

  function onPointerDownCapture(event) {
    if (current.open) return;
    recoverGithubPaletteIfStuck();
    // Pulls palette owns its own focus chrome
    if (isPullsPaletteOpen()) return;
    if (!isPullsListPage()) return;
    // Any click/tap dismisses keyboard list focus (including on a PR row)
    if (listFocusNumber != null || resolvePullsListFocusIndex() >= 0) {
      dismissPullsListFocusIfAny();
    }
  }

  function onDocumentFocusIn(event) {
    if (current.open) return;
    if (isPullsPaletteOpen()) return;
    if (!isPullsListPage()) return;
    if (listFocusNumber == null && resolvePullsListFocusIndex() < 0) return;

    const t = event?.target;
    // Focus moved into an editable / chrome control → drop list navigator
    if (isEditableKeyTarget(t)) {
      dismissPullsListFocusIfAny();
      return;
    }
    // Focus outside any PR row → drop
    try {
      const rows = getPullsListRows();
      const inside = rows.some((r) => r && (r === t || r.contains?.(t)));
      if (!inside) dismissPullsListFocusIfAny();
    } catch {
      dismissPullsListFocusIfAny();
    }
  }

  function onWindowBlur() {
    if (current.open) return;
    dismissPullsListFocusIfAny();
    hidePullsListHotkeyHints();
  }

  function ensurePullsListKeyboard() {
    if (listFocusKeyBound) return;
    listFocusKeyBound = true;
    document.addEventListener('keydown', onPullsListKeydown, true);
    document.addEventListener('keyup', onPullsListKeyup, true);
    // pointerdown: recover stuck GH palette top-layer + dismiss list focus
    document.addEventListener('pointerdown', onPointerDownCapture, true);
    document.addEventListener('focusin', onDocumentFocusIn, true);
    window.addEventListener('blur', onWindowBlur);
  }

  function onClickCapture(event) {
    if (!current.open) {
      recoverGithubPaletteIfStuck();
    }
    // Clicks outside the pulls palette (non-palette targets) close it only via backdrop handler
    if (!hostEnabled) return;
    if (!isPullsListPage()) return;
    if (isPullsPaletteOpen()) return;
    if (githubPaletteOpenNow()) return;
    if (event.defaultPrevented) return;
    if (event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    const path =
      typeof event.composedPath === 'function' ? event.composedPath() : [];
    const nodes = path.length ? path : [event.target];
    let anchor = null;
    for (const n of nodes) {
      if (
        n &&
        n.tagName === 'A' &&
        n.getAttribute?.('href')?.includes('/pull/')
      ) {
        anchor = n;
        break;
      }
      if (n?.closest) {
        const a = n.closest('a[href*="/pull/"]');
        if (a) {
          anchor = a;
          break;
        }
      }
    }
    if (!anchor) return;

    const parsed = parsePrFromAnchor(anchor);
    if (!parsed) return;

    const inRow = anchor.closest(
      '.js-issue-row, [id^="issue_"], li[role="listitem"], .js-navigation-container'
    );
    const looksLikeTitle =
      anchor.classList.contains('js-navigation-open') ||
      anchor.classList.contains('markdown-title') ||
      Boolean(anchor.id?.endsWith('_link')) ||
      Boolean(inRow);

    if (!looksLikeTitle) return;

    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === 'function') {
      event.stopImmediatePropagation();
    }
    // List entry always opens Conversation — do not restore prior Diff/session page.
    // Stack hops / refresh restore may still pass an explicit page.
    void openModal({ ...parsed, page: 'conversation' });
  }

  function install() {
    document.addEventListener('click', onClickCapture, true);
    ensurePullsListKeyboard();
    // After stack tree bootstrap (or re-apply), restore open modal + session view
    window.addEventListener('pr-plus-stack-ready', () => {
      if (!hostEnabled) return;
      void tryRestoreOpenModal();
    });
    // Back/forward cache can restore a frozen modal without re-running content
    // scripts — pending review rows then look missing until a soft refresh.
    window.addEventListener('pageshow', (event) => {
      if (!event?.persisted) return;
      if (!hostEnabled || !current.open) return;
      if (!current.owner || !current.repo || current.number == null) return;
      const bridge = globalThis.PRTreeBridge;
      if (
        typeof bridge?.isExtensionContextAlive === 'function' &&
        !bridge.isExtensionContextAlive()
      ) {
        return;
      }
      const props = buildProps();
      if (typeof props.onRefresh === 'function') {
        void props.onRefresh().catch((err) => {
          const msg = String(err?.message || err || '');
          if (/Extension context invalidated|Extension was reloaded/i.test(msg)) {
            return;
          }
          console.warn('[pr+] pageshow refresh failed', err);
        });
      }
    });
  }

  /**
   * Wipe in-memory SWR + page-origin IndexedDB PR detail cache.
   * Invoked from popup settings via PR_TREE_CLEAR_DETAIL_CACHE.
   */
  async function clearDetailCache() {
    try {
      const r = detailCache.clear?.();
      if (r && typeof r.then === 'function') await r;
    } catch (err) {
      console.warn('[pr+] detailCache.clear failed', err);
    }
    // Fresh handle in case the singleton cache missed IDB (tests / fallback)
    try {
      const idb = globalThis.PRModalDetailIdb?.createDetailIdb?.();
      if (idb?.clear) await idb.clear();
    } catch (err) {
      console.warn('[pr+] IDB clear failed', err);
    }
    return { ok: true };
  }

  function listenClearDetailCache() {
    try {
      chrome.runtime?.onMessage?.addListener((message, _sender, sendResponse) => {
        if (message?.type !== 'PR_TREE_CLEAR_DETAIL_CACHE') return false;
        void clearDetailCache()
          .then((res) => {
            try {
              sendResponse(res || { ok: true });
            } catch {
              /* channel closed */
            }
          })
          .catch((err) => {
            try {
              sendResponse({
                ok: false,
                error: err?.message || String(err),
              });
            } catch {
              /* ignore */
            }
          });
        // Keep channel open for async sendResponse
        return true;
      });
    } catch {
      /* ignore */
    }
  }

  globalThis.PRModalHost = {
    install,
    openModal,
    closeModal,
    tryRestoreOpenModal,
    tryEmbedFromLocation,
    restoreNativeView,
    ensureGithubPrToggle,
    persistRouteState,
    setEnabled,
    /** After list paint: CSS + prefs so click is not cold. */
    warmUp,
    isEnabled: () => hostEnabled,
    parsePrFromAnchor,
    parsePrPagePath,
    isPullsListPage,
    clearDetailCache,
    /** Test / debug: PR list keyboard focus helpers */
    _listFocus: {
      clear: clearPullsListFocus,
      dismiss: dismissPullsListFocusIfAny,
      apply: applyPullsListFocus,
      step: stepPullsListFocus,
      openFocused: openFocusedPullsListRow,
      resolveIndex: resolvePullsListFocusIndex,
      get focusNumber() {
        return listFocusNumber;
      },
      set focusNumber(v) {
        listFocusNumber = v;
      },
    },
    /** Test / debug: pulls command palette */
    _pullsPalette: {
      open: openPullsPalette,
      close: closePullsPalette,
      isOpen: isPullsPaletteOpen,
      paint: paintPullsPalette,
      activate: activatePullsPaletteItem,
      stepFocus: stepPullsPaletteFocus,
      get query() {
        return pullsPaletteQuery;
      },
      set query(v) {
        pullsPaletteQuery = String(v || '');
      },
      get focusIndex() {
        return pullsPaletteFocusIndex;
      },
      get items() {
        return pullsPaletteItems;
      },
    },
    _getState: () => ({
      ...current,
      hostEnabled,
      prefsReady,
      modalCssReady,
      listFocusNumber,
      pullsPaletteOpen,
      pullsPaletteQuery,
      pullsPaletteFocusIndex,
    }),
    _detailCache: detailCache,
  };

  listenClearDetailCache();
  install();
  // Preload modal CSS as soon as the content script boots (before clicks)
  try {
    void ensureAssets();
  } catch {
    /* ignore */
  }
})();
