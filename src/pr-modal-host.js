/**
 * Content-script host: intercept PR list clicks, mount React modal overlay.
 * Bundle + CSS are extension-local (no remote code).
 * Host updates reuse the same React root so Diff/search/scroll state survives refresh.
 * PR detail uses memory + IndexedDB cache (stale-while-revalidate / React Query style).
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
  };

  let prefs = { ...DEFAULT_PREFS };
  let prefsWatchUnsub = null;

  let current = {
    open: false,
    loading: false,
    error: null,
    detail: null,
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

  /**
   * On native GH PR pages (when pr+ embed is off), show a toggle next to the
   * PR header to open the pr+ in-page view.
   */
  function ensureGithubPrToggle() {
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

    let btn = document.getElementById(GH_PR_TOGGLE_ID);
    if (!btn) {
      btn = document.createElement('button');
      btn.id = GH_PR_TOGGLE_ID;
      btn.type = 'button';
      // Match Primer PR header actions (32px / 14px / parent gap) — see styles.css
      btn.className = 'prp-gh-open-toggle';
      btn.setAttribute('data-prp-gh-toggle', '1');
      btn.setAttribute('aria-label', 'Open with pr+');
      btn.title = 'Open with pr+';
      btn.textContent = 'pr+';
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const t = parsePrPagePath(
          typeof location !== 'undefined' ? location.pathname : ''
        );
        if (!t) return;
        removeGithubPrToggle();
        void openModal({
          owner: t.owner,
          repo: t.repo,
          number: t.number,
          page: t.page,
          presentation: 'embed',
        });
      });
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
          prefs = {
            fastReview: next?.fastReview !== false,
            reverseComments: next?.reverseComments !== false,
          };
          if (current.open) render();
        }) || null;
    } catch {
      prefsWatchUnsub = null;
    }
  }

  function setLoadStage(phase, label, busy = true) {
    current.loadStage =
      phase || label
        ? { phase: phase || null, label: label || null, busy: Boolean(busy) }
        : null;
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
      default: {
        const msg = String(extra?.message || kind || 'Loading…').trim();
        // Hard cap so unexpected API errors don't explode the badge
        return msg.length > 26 ? `${msg.slice(0, 24)}…` : msg || 'Loading…';
      }
    }
  }

  function clearLoadStage() {
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
          // 1) Core metadata (no threads) — keep prior threads until thread phase
          setLoadStage('refresh', loadStageLabel('refresh-meta'), true);
          render();
          let detail = await globalThis.PRTreeFetch.fetchPrDetail(
            owner,
            repo,
            number,
            { skipReviewThreads: true, signal }
          );
          if (!stillOpen()) return;
          if (
            prevDetail &&
            Array.isArray(prevDetail.reviewComments) &&
            prevDetail.reviewComments.length &&
            (!Array.isArray(detail.reviewComments) ||
              !detail.reviewComments.length)
          ) {
            detail = {
              ...detail,
              reviewComments: prevDetail.reviewComments,
              reviewThreads: prevDetail.reviewThreads || detail.reviewThreads,
              reviewThreadsMeta:
                prevDetail.reviewThreadsMeta || detail.reviewThreadsMeta,
              reviewCommentsMeta:
                prevDetail.reviewCommentsMeta || detail.reviewCommentsMeta,
            };
          }
          current.loading = false;
          current.detail = detail;
          current.error = null;
          detailCache.set(key, detail);
          render();

          // —— Conversation header: only bulk-refresh threads currently on screen ——
          if (mode === 'visible-threads') {
            if (
              visibleIds.length &&
              typeof globalThis.PRTreeFetch.fetchReviewThreadsByIds ===
                'function' &&
              typeof mergeFn === 'function'
            ) {
              setLoadStage(
                'threads',
                loadStageLabel('threads-visible', { count: visibleIds.length }),
                true
              );
              render();
              const tBulk = nowMs();
              const bulk =
                await globalThis.PRTreeFetch.fetchReviewThreadsByIds(
                  visibleIds,
                  { signal }
                );
              const missingN = (bulk?.missingThreadIds || []).length;
              console.log(
                `[pr-plus] onRefresh visible-threads ${owner}/${repo}#${number}: ${Math.round(
                  nowMs() - tBulk
                )}ms (${bulk?.threads?.length || 0}/${visibleIds.length}` +
                  (missingN ? `, dropped ${missingN} remote-missing` : '') +
                  ')'
              );
              if (!stillOpen()) return;
              if (bulk) {
                const next = mergeFn(current.detail, bulk, 'refresh');
                current.detail = next;
                detailCache.set(key, next);
              }
            } else {
              console.log(
                `[pr-plus] onRefresh visible-threads ${owner}/${repo}#${number}: metadata only (0 visible PRRT ids)`
              );
            }
            if (stillOpen()) {
              clearLoadStage();
              render();
            }
            return;
          }

          if (!globalThis.PRTreeFetch.fetchReviewThreadsPage) {
            clearLoadStage();
            render();
            return;
          }

          // 2a) last:100 (full-threads + mutation revalidate)
          setLoadStage('threads', loadStageLabel('threads-update'), true);
          render();
          const t0 = nowMs();
          const newest = await globalThis.PRTreeFetch.fetchReviewThreadsPage(
            owner,
            repo,
            number,
            {
              direction: 'newest',
              cursor: null,
              pageSize: apiMax,
              signal,
            }
          );
          if (!stillOpen()) return;
          console.log(
            `[pr-plus] onRefresh last ${owner}/${repo}#${number}: ${Math.round(
              nowMs() - t0
            )}ms (${newest?.threads?.length || 0}) mode=${mode}`
          );
          let next =
            typeof mergeFn === 'function'
              ? mergeFn(current.detail, newest, 'newest')
              : current.detail;
          current.detail = next;
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
                  current.detail = next;
                  detailCache.set(key, next);
                  render();
                }
              } catch {
                /* keep last-only */
              }
            }
            if (stillOpen() && next?.reviewThreadsMeta?.hasMore) {
              const props = buildProps();
              if (typeof props.onLoadMoreReviewThreads === 'function') {
                await props.onLoadMoreReviewThreads('all');
              }
            } else if (stillOpen()) {
              clearLoadStage();
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
              setLoadStage('threads', loadStageLabel('threads-unresolved'), true);
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
            if (stillOpen()) {
              current.detail = next;
              detailCache.set(key, next);
              clearLoadStage();
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
            next = step.detail;
            current.detail = next;
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
        current.detail = next;
        try {
          const key = detailKey(current.owner, current.repo, current.number);
          detailCache.set(key, next);
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

    current = {
      open: true,
      // Only block whole UI when we have nothing to show yet
      loading: !initialDetail,
      error: null,
      detail: initialDetail,
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
      loadStage: {
        phase: fromCache ? 'revalidate' : fromList ? 'core' : 'core',
        label: fromCache
          ? loadStageLabel('revalidate')
          : fromList
            ? loadStageLabel('core-full')
            : loadStageLabel('core'),
        busy: true,
      },
    };
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
            current.detail = v;
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

      // Phase 1: core PR (no threads) — start network immediately (parallel with IDB)
      if (!fromCache && !fromList) {
        setLoadStage('core', loadStageLabel('core'), true);
        render();
      } else if (!fromCache && fromList) {
        setLoadStage('core', loadStageLabel('core-full'), true);
        render();
      } else {
        setLoadStage('revalidate', loadStageLabel('revalidate'), true);
        render();
      }
      const tCore0 =
        typeof performance !== 'undefined' && performance.now
          ? performance.now()
          : Date.now();
      // Let IDB finish (or time out) without blocking core fetch
      void idbHydrateP;
      let detail = await fetchDetailOnce({ skipReviewThreads: true });
      // Prefer whatever IDB provided for thread preserve below
      try {
        const idbVal = await idbHydrateP;
        if (idbVal && !cached) cached = idbVal;
        // If we still only had a list sketch when IDB finished after network race, keep idb for preserve
        if (idbVal && detailRank(cached) < detailRank(idbVal)) cached = idbVal;
      } catch {
        /* ignore */
      }
      const coreMs = Math.round(
        (typeof performance !== 'undefined' && performance.now
          ? performance.now()
          : Date.now()) - tCore0
      );
      console.log(
        `[pr-plus] openModal phase=core ${owner}/${repo}#${number}: ${coreMs}ms ` +
          (detail?._fetchTimings
            ? JSON.stringify(detail._fetchTimings)
            : '(no per-request timings)')
      );
      if (gen !== detailFetchGen) return;
      if (
        !(
          current.open &&
          current.owner === owner &&
          current.repo === repo &&
          Number(current.number) === Number(number)
        )
      ) {
        return;
      }
      // SWR: keep cached review threads visible until fresh thread pages land
      // so core-only responses do not blank conversation / Diff comments.
      if (
        cached &&
        Array.isArray(cached.reviewComments) &&
        cached.reviewComments.length &&
        (!Array.isArray(detail.reviewComments) || !detail.reviewComments.length)
      ) {
        detail = {
          ...detail,
          reviewComments: cached.reviewComments,
          reviewThreads: cached.reviewThreads || detail.reviewThreads,
          reviewThreadsMeta: cached.reviewThreadsMeta || detail.reviewThreadsMeta,
          reviewCommentsMeta:
            cached.reviewCommentsMeta || detail.reviewCommentsMeta,
          comments:
            Array.isArray(detail.comments) && detail.comments.length
              ? detail.comments
              : cached.comments || detail.comments,
        };
      }
      // Network core is authoritative — drop sketch flags
      if (detail && typeof detail === 'object') {
        detail = { ...detail, _sketch: undefined, _source: 'network' };
      }
      current.loading = false;
      current.detail = detail;
      current.error = null;
      setLoadStage(
        'threads',
        fromCache || detailRank(cached) >= 3
          ? loadStageLabel('threads-update')
          : loadStageLabel('threads-load'),
        true
      );
      detailCache.set(key, detail);
      render();
      console.log(
        `[pr-plus] openModal phase=core-paint ${owner}/${repo}#${number} ` +
          `(prior=${fromCache ? 'cache' : fromList ? 'list' : 'empty'})`
      );

      // Phase 2: review threads
      // - Cold open: dual-window (newest last:N + oldest first:20)
      // - Cache revalidate: newest last:100 + bulk unresolved by PRRT ids (no oldest;
      //   start window is stable when ordered, so skip)
      if (globalThis.PRTreeFetch.fetchReviewThreadsPage) {
        try {
          const mergeFn =
            globalThis.PRTreeFetch.mergeReviewThreadsPageIntoDetail || null;
          const nowMs = () =>
            typeof performance !== 'undefined' && performance.now
              ? performance.now()
              : Date.now();
          const tThreads0 = nowMs();
          const apiMax = 100;
          // Revalidate path when we had durable cache (memory/IDB), not mere list sketch
          const useRevalidatePath = fromCache || detailRank(cached) >= 3;

          if (useRevalidatePath) {
            // —— Incremental revalidate ——
            // 1) last:100 first (always freshest activity window)
            // 2) then bulk-refresh only unresolved among threads NOT updated in step 1
            //    (oldest/start window skipped — stable when ordered)
            setLoadStage('threads', loadStageLabel('threads-update'), true);
            render();

            // Step 1: last N (API max 100)
            const tNewest0 = nowMs();
            const newest = await globalThis.PRTreeFetch.fetchReviewThreadsPage(
              owner,
              repo,
              number,
              { direction: 'newest', cursor: null, pageSize: apiMax, signal }
            );
            console.log(
              `[pr-plus] openModal phase=threads.last ${owner}/${repo}#${number}: ${Math.round(
                nowMs() - tNewest0
              )}ms (${newest?.threads?.length || 0} threads)`
            );
            if (gen !== detailFetchGen) return;
            if (
              !(
                current.open &&
                Number(current.number) === Number(number) &&
                current.detail
              )
            ) {
              return;
            }

            const updatedIdSet = new Set(
              (newest?.threads || [])
                .map((t) => (t?.threadNodeId ? String(t.threadNodeId) : ''))
                .filter(Boolean)
            );

            let next =
              typeof mergeFn === 'function'
                ? mergeFn(current.detail, newest, 'newest')
                : current.detail;

            // Paint last-100 merge before unresolved bulk
            detail = next;
            current.detail = detail;
            detailCache.set(key, detail);
            setLoadStage('threads', loadStageLabel('threads-unresolved'), true);
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

            console.log(
              `[pr-plus] openModal phase=threads(revalidate) ${owner}/${repo}#${number}: ${Math.round(
                nowMs() - tThreads0
              )}ms total`
            );
            if (gen !== detailFetchGen) return;
            if (
              current.open &&
              Number(current.number) === Number(number) &&
              current.detail
            ) {
              detail = next;
              current.detail = detail;
              detailCache.set(key, detail);
              clearLoadStage();
              render();
            }
          } else {
            // —— Cold open: last:100 first, then start:20 only if total ≥ 100 ——
            const tNewest0 = nowMs();
            const newest = await globalThis.PRTreeFetch.fetchReviewThreadsPage(
              owner,
              repo,
              number,
              { direction: 'newest', cursor: null, pageSize: apiMax, signal }
            );
            console.log(
              `[pr-plus] openModal phase=threads.last ${owner}/${repo}#${number}: ${Math.round(
                nowMs() - tNewest0
              )}ms (${newest?.threads?.length || 0} threads)`
            );
            if (gen !== detailFetchGen) return;
            if (
              !(
                current.open &&
                Number(current.number) === Number(number) &&
                current.detail
              )
            ) {
              return;
            }
            let next =
              typeof mergeFn === 'function'
                ? mergeFn(current.detail, newest, 'newest')
                : current.detail;

            // Paint last-100 before optional start window
            detail = next;
            current.detail = detail;
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
                setLoadStage('threads', loadStageLabel('threads-earlier'), true);
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
                if (gen === detailFetchGen && typeof mergeFn === 'function') {
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
            console.log(
              `[pr-plus] openModal phase=threads ${owner}/${repo}#${number}: ${Math.round(
                nowMs() - tThreads0
              )}ms total`
            );
            if (gen !== detailFetchGen) return;
            if (
              current.open &&
              Number(current.number) === Number(number) &&
              current.detail
            ) {
              detail = next;
              current.detail = detail;
              detailCache.set(key, detail);
              clearLoadStage();
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
          if (gen === detailFetchGen && current.open) {
            setLoadStage(
              'threads',
              loadStageLabel('threads-failed', { message: threadErr?.message }),
              false
            );
            render();
          }
        }
      } else {
        clearLoadStage();
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
    // Auto-open embed on PR routes (can also be opened via GH header toggle)
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
    tryEmbedFromLocation();
    try {
      ensureGithubPrToggle();
    } catch {
      /* ignore */
    }
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

  function onClickCapture(event) {
    if (!hostEnabled) return;
    if (!isPullsListPage()) return;
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
    _getState: () => ({
      ...current,
      hostEnabled,
      prefsReady,
      modalCssReady,
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
