/**
 * Linear partner boot. Host IIFE already ran (PARTNER_HOST_JS order).
 * Overlay only; enable after token/prefs evaluation.
 * Capture-phase click on GitHub PR links and Linear issue Diffs/review cards
 * opens pr+. Opt/Alt+click is native Linear (or GitHub).
 */
(function bootPartner(global: any) {
  let lastOpenKey = '';
  let lastOpenAt = 0;
  const REVIEW_CACHE_PREFIX = 'prp:linrev:';

  function endpoints() {
    return global.PRGithubEndpoints || null;
  }

  function isPrPlusUiEvent(event: any): boolean {
    const path =
      typeof event?.composedPath === 'function' ? event.composedPath() : [];
    const nodes = path.length ? path : [event?.target];
    for (const n of nodes) {
      if (!n) continue;
      const id = String(n.id || '');
      if (
        id === 'prp-modal-host' ||
        id === 'prp-page-embed' ||
        id === 'prp-modal-root' ||
        id === 'prp-gh-open-toggle'
      ) {
        return true;
      }
      if (n.getAttribute && n.getAttribute('data-prp-gh-toggle') === '1') {
        return true;
      }
      const cls = n.classList;
      if (
        cls &&
        typeof cls.contains === 'function' &&
        (cls.contains('prp-overlay') ||
          cls.contains('prp-shell') ||
          cls.contains('prp-header') ||
          cls.contains('prp-gh-open-toggle'))
      ) {
        return true;
      }
      if (typeof n.closest === 'function') {
        if (
          n.closest(
            '#prp-modal-host, #prp-page-embed, .prp-overlay, .prp-shell, #prp-gh-open-toggle, [data-prp-gh-toggle]'
          )
        ) {
          return true;
        }
      }
    }
    return false;
  }

  function clickPath(event: any) {
    const path =
      typeof event?.composedPath === 'function' ? event.composedPath() : [];
    return path.length ? path : [event?.target];
  }

  function findPrFromEvent(event: any) {
    const ep = endpoints();
    if (typeof ep?.findGithubPullFromClickPath !== 'function') {
      if (typeof ep?.parseGithubPullUrl === 'function') {
        const t = event?.target;
        const href =
          (t && t.getAttribute && t.getAttribute('href')) || t?.href || null;
        return ep.parseGithubPullUrl(href, global.location?.href);
      }
      return null;
    }
    return ep.findGithubPullFromClickPath(clickPath(event), {
      base: global.location?.href,
    });
  }

  function findLinearReviewHref(event: any) {
    const ep = endpoints();
    if (typeof ep?.findLinearReviewHrefFromClickPath !== 'function') return null;
    return ep.findLinearReviewHrefFromClickPath(clickPath(event), {
      base: global.location?.href,
    });
  }

  function openOverlay(parsed: any) {
    const host = global.PRModalHost;
    if (host && typeof host.openModal === 'function') {
      if (typeof host.isEnabled === 'function' && !host.isEnabled()) {
        return false;
      }
      const key = `${parsed.githubWebHost || 'github.com'}/${parsed.owner}/${parsed.repo}/${parsed.number}`;
      const now = Date.now();
      if (key === lastOpenKey && now - lastOpenAt < 500) return true;
      lastOpenKey = key;
      lastOpenAt = now;
      void host.openModal({
        owner: parsed.owner,
        repo: parsed.repo,
        number: parsed.number,
        presentation: 'modal',
      });
      try {
        global.chrome?.runtime?.sendMessage?.({
          type: 'PR_TREE_OPEN_PR',
          owner: parsed.owner,
          repo: parsed.repo,
          number: parsed.number,
          githubWebHost: parsed.githubWebHost,
          target: 'opener-embed',
          source: 'local-host',
        });
      } catch {
        /* ignore */
      }
      return true;
    }
    return false;
  }

  function cacheKey(path: string) {
    return REVIEW_CACHE_PREFIX + path;
  }

  function readReviewCache(path: string) {
    try {
      const raw = global.sessionStorage?.getItem(cacheKey(path));
      if (!raw) return null;
      const v = JSON.parse(raw);
      if (v && v.owner && v.repo && Number(v.number) > 0) return v;
    } catch {
      /* ignore */
    }
    return null;
  }

  function writeReviewCache(path: string, pr: any) {
    try {
      global.sessionStorage?.setItem(
        cacheKey(path),
        JSON.stringify({
          owner: pr.owner,
          repo: pr.repo,
          number: pr.number,
          githubWebHost: pr.githubWebHost || 'github.com',
        })
      );
    } catch {
      /* ignore */
    }
  }

  function uniqueGithubPullsIn(root: any) {
    const ep = endpoints();
    if (!ep?.parseGithubPullUrl || !root?.querySelectorAll) return [];
    const found: any[] = [];
    const seen = new Set();
    const anchors = root.querySelectorAll('a[href]');
    for (let i = 0; i < anchors.length; i++) {
      const p = ep.parseGithubPullUrl(
        anchors[i].getAttribute('href') || anchors[i].href,
        global.location?.href
      );
      if (!p) continue;
      const key = `${p.githubWebHost}/${p.owner}/${p.repo}/${p.number}`;
      if (seen.has(key)) continue;
      seen.add(key);
      found.push(p);
    }
    return found;
  }

  function rememberReviewPagePull() {
    const ep = endpoints();
    if (!ep?.isLinearReviewPath?.(global.location?.pathname)) return;
    const parsed = ep.parseLinearReviewPath(global.location?.href);
    if (!parsed?.path) return;
    const found = uniqueGithubPullsIn(global.document);
    if (found.length === 1) writeReviewCache(parsed.path, found[0]);
  }

  function openIdb(name: string): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(name);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function storeGetAll(db: IDBDatabase, store: string, limit?: number): Promise<any[]> {
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(store, 'readonly');
        const os = tx.objectStore(store);
        const req = limit != null ? os.getAll(undefined, limit) : os.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  function pullFromLinearRow(row: any) {
    const ep = endpoints();
    if (!row || typeof row !== 'object' || !ep?.parseGithubPullUrl) return null;
    if (row.url) {
      const fromUrl = ep.parseGithubPullUrl(row.url);
      if (fromUrl) return fromUrl;
    }
    const repo = row.repository;
    const number = Number(row.number ?? row.metadata?.number);
    const owner = repo?.owner || row.metadata?.repoLogin;
    const name = repo?.name || row.metadata?.repoName;
    if (owner && name && Number.isFinite(number) && number > 0) {
      return {
        owner: String(owner),
        repo: String(name),
        number,
        githubWebHost: 'github.com',
      };
    }
    return null;
  }

  function rowLooksLikeLinearPull(row: any) {
    if (!row || typeof row !== 'object') return false;
    if (row.slugId && row.number && (row.url || row.repository)) return true;
    if (row.url && /github\.com\/.+\/pull\/\d+/i.test(String(row.url))) return true;
    return false;
  }

  async function scanLinearIdbForReview(parsed: any) {
    if (!parsed) return null;
    let dbs: { name?: string }[] = [];
    try {
      dbs = await indexedDB.databases();
    } catch {
      return null;
    }
    for (const info of dbs) {
      const name = String(info?.name || '');
      if (!name.startsWith('linear_') || name === 'linear_databases') continue;
      let db: IDBDatabase | null = null;
      try {
        db = await openIdb(name);
        const stores = Array.from(db.objectStoreNames);
        for (const store of stores) {
          let probe: any[] = [];
          try {
            probe = await storeGetAll(db, store, 1);
          } catch {
            continue;
          }
          if (!rowLooksLikeLinearPull(probe[0])) continue;
          let rows: any[] = [];
          try {
            rows = await storeGetAll(db, store);
          } catch {
            continue;
          }
          for (const row of rows) {
            if (parsed.slugId && String(row.slugId || '').toLowerCase() === parsed.slugId) {
              const hit = pullFromLinearRow(row);
              if (hit) {
                db.close();
                return hit;
              }
            }
          }
          if (parsed.slug) {
            for (const row of rows) {
              const url = String(row.url || '');
              if (url.includes(`/review/${parsed.slug}`)) {
                const hit = pullFromLinearRow(row);
                if (hit) {
                  db.close();
                  return hit;
                }
              }
            }
          }
        }
      } catch {
        /* next db */
      } finally {
        try {
          db?.close();
        } catch {
          /* ignore */
        }
      }
    }
    return null;
  }

  async function resolveLinearReviewToGithub(href: string) {
    const ep = endpoints();
    const parsed = ep?.parseLinearReviewPath?.(href, global.location?.href);
    if (!parsed?.path) return null;
    const cached = readReviewCache(parsed.path);
    if (cached) return cached;
    rememberReviewPagePull();
    const cached2 = readReviewCache(parsed.path);
    if (cached2) return cached2;
    const fromIdb = await scanLinearIdbForReview(parsed);
    if (fromIdb) {
      writeReviewCache(parsed.path, fromIdb);
      return fromIdb;
    }
    return null;
  }

  function onLinkedPrPointer(event: any) {
    if (event.defaultPrevented) return;
    if (event.button != null && event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (isPrPlusUiEvent(event)) return;

    const github = findPrFromEvent(event);
    if (github) {
      if (!openOverlay(github)) return;
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation();
      }
      return;
    }

    const ep = endpoints();
    const onIssue = ep?.isLinearIssuePath?.(global.location?.pathname);
    if (!onIssue) return;
    const reviewHref = findLinearReviewHref(event);
    if (!reviewHref) return;

    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === 'function') {
      event.stopImmediatePropagation();
    }
    void resolveLinearReviewToGithub(reviewHref).then((pr) => {
      if (pr && openOverlay(pr)) return;
      try {
        global.location.assign(reviewHref);
      } catch {
        /* ignore */
      }
    });
  }

  try {
    global.document.addEventListener('pointerdown', onLinkedPrPointer, true);
    global.document.addEventListener('click', onLinkedPrPointer, true);
  } catch {
    /* ignore */
  }

  try {
    rememberReviewPagePull();
    global.setInterval(rememberReviewPagePull, 2000);
  } catch {
    /* ignore */
  }

  /**
   * Keyboard isolation while the sheet is open. Linear binds single-key
   * shortcuts (`c` create issue, `x` select, Esc, …) on document/body, so
   * keys typed at the sheet — or with focus stranded on the Linear page —
   * must not reach them. pr+ hotkeys listen on window capture and still run
   * (stopPropagation keeps the other listeners on the same currentTarget).
   */
  const KEY_EVENTS = ['keydown', 'keypress', 'keyup'];

  function overlayOpen(): boolean {
    try {
      return Boolean(global.document.querySelector('#prp-modal-host .prp-overlay'));
    } catch {
      return false;
    }
  }

  // Utility classes pr+ stamps on the host page's <html>/<body>, not pr+ UI
  // (SCROLL_LOCK_CLASS, PAGE_EMBED_ACTIVE_CLASS, Opt-hint root class).
  const HOST_PAGE_CLASSES = new Set(['prp-scroll-lock', 'prp-embed-active', 'prp-opt-hints']);

  function isPrPlusNode(n: any): boolean {
    if (!n || n.nodeType !== 1) return false;
    if (String(n.id || '').startsWith('prp-')) return true;
    const cls = n.classList;
    if (!cls) return false;
    for (const c of cls) {
      if (String(c).startsWith('prp-') && !HOST_PAGE_CLASSES.has(String(c))) return true;
    }
    return false;
  }

  function eventInPrPlus(event: any): boolean {
    const path =
      typeof event?.composedPath === 'function' ? event.composedPath() : [event?.target];
    return path.some((n: any) => isPrPlusNode(n));
  }

  /** Focus stranded on Linear (or body): stop before document/target handlers. */
  function onKeyCapture(event: any) {
    if (!overlayOpen() || eventInPrPlus(event)) return;
    event.stopPropagation();
  }

  /** Keys inside the sheet / its body portals: React already ran; stop bubbling. */
  function onKeyBubble(event: any) {
    if (!overlayOpen() || !eventInPrPlus(event)) return;
    event.stopPropagation();
  }

  // Linear also reacts to focus moving outside its app and pulls it back.
  const FOCUS_EVENTS = ['focusin', 'focusout'];

  try {
    for (const type of KEY_EVENTS) {
      global.addEventListener(type, onKeyCapture, true);
    }
    for (const type of [...KEY_EVENTS, ...FOCUS_EVENTS]) {
      global.document.documentElement.addEventListener(type, onKeyBubble, false);
    }
  } catch {
    /* ignore */
  }

  /**
   * Linear's shortcut listener runs on window capture ahead of ours and only
   * skips events targeted outside its app, so focus must live in the sheet
   * while it is open (modal focus trap).
   */
  /** @returns true once focus is inside pr+ UI. */
  function focusSheet(): boolean {
    if (!overlayOpen()) return false;
    const active = global.document.activeElement;
    if (active && eventInPrPlus({ composedPath: () => pathOf(active) })) return true;
    const sheet = global.document.querySelector('#prp-modal-host .prp-modal');
    if (!sheet) return false;
    if (!sheet.hasAttribute('tabindex')) sheet.setAttribute('tabindex', '-1');
    try {
      sheet.focus({ preventScroll: true });
    } catch {
      /* ignore */
    }
    return global.document.activeElement === sheet;
  }

  function pathOf(node: any): any[] {
    const out: any[] = [];
    for (let n = node; n; n = n.parentNode) out.push(n);
    return out;
  }

  // Overlay mounts before the sheet renders: keep trying until focus lands.
  let focusPending = true;
  function syncSheetFocus() {
    if (!overlayOpen()) {
      focusPending = true;
      return;
    }
    if (focusPending && focusSheet()) focusPending = false;
  }

  try {
    new MutationObserver(syncSheetFocus).observe(global.document.documentElement, {
      childList: true,
      subtree: true,
    });
    global.document.addEventListener(
      'focusin',
      (event: any) => {
        if (!overlayOpen() || eventInPrPlus(event)) return;
        // Put focus back where it was inside the sheet, else on the sheet.
        const prev = event.relatedTarget;
        if (prev && eventInPrPlus({ composedPath: () => pathOf(prev) })) {
          try {
            prev.focus({ preventScroll: true });
            if (global.document.activeElement === prev) return;
          } catch {
            /* ignore */
          }
        }
        focusSheet();
      },
      true
    );
    // Blur to <body> (Esc in a composer, removed node) fires no focusin.
    global.document.addEventListener(
      'focusout',
      (event: any) => {
        if (!overlayOpen() || event.relatedTarget || !eventInPrPlus(event)) return;
        global.setTimeout(() => {
          const active = global.document.activeElement;
          if (!active || active === global.document.body) focusSheet();
        }, 0);
      },
      true
    );
  } catch {
    /* ignore */
  }

  async function evalFeatures() {
    const host = global.PRModalHost;
    if (!host || typeof host.setEnabled !== 'function') return;
    let configured = false;
    let pluginEnabled = true;
    try {
      const token = await global.chrome?.runtime?.sendMessage?.({
        type: 'PR_TREE_TOKEN_STATUS',
      });
      configured = Boolean(token?.configured);
    } catch {
      configured = false;
    }
    try {
      const prefs = await global.chrome?.runtime?.sendMessage?.({
        type: 'PR_TREE_PREFS_GET',
      });
      pluginEnabled = prefs?.prefs?.pluginEnabled !== false;
    } catch {
      pluginEnabled = true;
    }
    host.setEnabled(configured && pluginEnabled);
  }

  void evalFeatures();
})(typeof globalThis !== 'undefined' ? globalThis : window);
