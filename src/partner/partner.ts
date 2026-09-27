/**
 * Connected-site partner boot (Linear, Jira, custom hosts).
 *
 * The pr+ sheet never mounts in the host page: it renders in an iframe of the
 * extension shell (`src/shell/shell.html`), so page scripts cannot read PR
 * content or drive merge/review buttons. This script only finds GitHub PR
 * links / Linear review cards, owns the iframe, and answers SW open/status/
 * close for this tab. Opt/Alt+click stays native.
 */
(function bootPartner(global: any) {
  const FRAME_ID = 'prp-partner-frame';
  const TOGGLE_ID = 'prp-gh-open-toggle';
  const FRAME_PARAMS = [
    'owner',
    'repo',
    'number',
    'githubWebHost',
    'page',
    'position',
    'commitSha',
    'commitEndSha',
    'filePath',
    'fileKey',
    'startLine',
    'endLine',
    'side',
  ];
  let lastOpenKey = '';
  let lastOpenAt = 0;
  const REVIEW_CACHE_PREFIX = 'prp:linrev:';
  /** Token + pluginEnabled evaluated (SW open waits on this). */
  let evaluated = false;
  let enabled = false;
  /** PR currently shown in the frame (null when closed). */
  let framePr: any = null;
  /** Page scroll lock owned by the frame (restored exactly once). */
  let scrollLocked = false;
  let prevHtmlOverflow = '';

  function endpoints() {
    return global.PRGithubEndpoints || null;
  }

  function frameEl(): any {
    return global.document.getElementById(FRAME_ID);
  }

  function isPrPlusUiEvent(event: any): boolean {
    const path =
      typeof event?.composedPath === 'function' ? event.composedPath() : [];
    const nodes = path.length ? path : [event?.target];
    return nodes.some((n: any) => {
      const id = String(n?.id || '');
      return id === FRAME_ID || id === TOGGLE_ID;
    });
  }

  function clickPath(event: any) {
    const path =
      typeof event?.composedPath === 'function' ? event.composedPath() : [];
    return path.length ? path : [event?.target];
  }

  function inEditable(event: any): boolean {
    const t = event?.target;
    const el = t?.nodeType === 1 ? t : t?.parentElement;
    return Boolean(el?.closest?.('[contenteditable]:not([contenteditable="false"])'));
  }

  function findPrFromEvent(event: any) {
    const ep = endpoints();
    // Editors: only a real <a> counts (no "unique PR link nearby" heuristic),
    // so clicking text next to a PR link still places the caret.
    if (inEditable(event) || typeof ep?.findGithubPullFromClickPath !== 'function') {
      const a = clickPath(event).find(
        (n: any) => n?.tagName === 'A' && n.getAttribute?.('href')
      );
      const href = a ? a.getAttribute('href') || a.href : null;
      return href && typeof ep?.parseGithubPullUrl === 'function'
        ? ep.parseGithubPullUrl(href, global.location?.href)
        : null;
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

  function frameUrl(args: any): string {
    const u = new URL(global.chrome.runtime.getURL('src/shell/shell.html'));
    for (const k of FRAME_PARAMS) {
      const v = args?.[k];
      if (v != null && v !== '') u.searchParams.set(k, String(v));
    }
    if (!u.searchParams.get('githubWebHost')) u.searchParams.set('githubWebHost', 'github.com');
    return u.toString();
  }

  function openFrame(args: any): boolean {
    if (!enabled) return false;
    if (!args?.owner || !args?.repo || !(Number(args.number) > 0)) return false;
    const doc = global.document;
    let f = frameEl();
    if (!f) {
      f = doc.createElement('iframe');
      f.id = FRAME_ID;
      f.setAttribute('title', 'pr+');
      f.setAttribute('allow', 'clipboard-write');
      f.style.cssText =
        'position:fixed;inset:0;width:100%;height:100%;border:0;margin:0;padding:0;' +
        'background:transparent;color-scheme:normal;z-index:2147483000;';
      doc.documentElement.appendChild(f);
    }
    if (!scrollLocked) {
      prevHtmlOverflow = doc.documentElement.style.overflow || '';
      doc.documentElement.style.overflow = 'hidden';
      scrollLocked = true;
    }
    f.src = frameUrl(args);
    framePr = {
      owner: String(args.owner),
      repo: String(args.repo),
      number: Number(args.number),
      page: args.page || null,
    };
    removeToggle();
    try {
      f.focus();
    } catch {
      /* ignore */
    }
    return true;
  }

  function closeFrame() {
    frameEl()?.remove();
    if (scrollLocked) {
      global.document.documentElement.style.overflow = prevHtmlOverflow;
      scrollLocked = false;
    }
    framePr = null;
    ensureToggle();
  }

  /** The page (or an SPA re-render) removed our iframe: treat as closed. */
  function syncFrameGone() {
    if ((framePr || scrollLocked) && !frameEl()) closeFrame();
  }

  // Shell iframe → close. Only the frame's own window, from the extension origin.
  try {
    const extOrigin = new URL(global.chrome.runtime.getURL('')).origin;
    global.addEventListener('message', (event: any) => {
      const f = frameEl();
      if (!f || event.source !== f.contentWindow || event.origin !== extOrigin) return;
      if (event.data?.type === 'prp-frame-close') closeFrame();
    });
  } catch {
    /* ignore */
  }

  function openOverlay(parsed: any) {
    const key = `${parsed.githubWebHost || 'github.com'}/${parsed.owner}/${parsed.repo}/${parsed.number}`;
    const now = Date.now();
    if (key === lastOpenKey && now - lastOpenAt < 500) return true;
    if (!openFrame(parsed)) return false;
    lastOpenKey = key;
    lastOpenAt = now;
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
    // Page scripts cannot open pr+ by dispatching synthetic clicks.
    if (!event.isTrusted || !enabled) return;
    if (event.defaultPrevented) return;
    if (event.button != null && event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (isPrPlusUiEvent(event)) return;
    // pointerdown in an editor would block caret placement; act on click only.
    if (event.type === 'pointerdown' && inEditable(event)) return;

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
    if (event.type !== 'click') return;
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
   * Linear review page: "pr+" control right of Overview / Diff.
   */
  function reviewPagePull() {
    const ep = endpoints();
    if (!ep?.isLinearReviewPath?.(global.location?.pathname)) return null;
    const found = uniqueGithubPullsIn(global.document);
    return found.length === 1 ? found[0] : null;
  }

  function findReviewTabMount() {
    const doc = global.document;
    const links = Array.from(doc.querySelectorAll('a[href*="/review/"]')) as any[];
    const overview = links.find((a) => /^\s*Overview\s*$/i.test(String(a.textContent || '')));
    const diff = links.find((a) => /^\s*Diff\s*$/i.test(String(a.textContent || '')));
    if (!overview || !diff) return null;
    let el = overview.parentElement;
    for (let i = 0; i < 8 && el; i++) {
      if (el.contains(diff) && el.children.length >= 2 && el.children.length <= 8) return el;
      el = el.parentElement;
    }
    return null;
  }

  function openWithLabel(): string {
    try {
      const pure = global.PRModalI18n;
      const locale =
        global.document.documentElement.getAttribute('lang') ||
        global.navigator?.language ||
        'en';
      const msg = pure?.formatMessage?.('open_with_prp', locale);
      if (msg && msg !== 'open_with_prp') return msg;
    } catch {
      /* fall through */
    }
    return 'Open with pr+';
  }

  function removeToggle() {
    global.document.getElementById(TOGGLE_ID)?.remove();
  }

  function ensureToggle() {
    const pr = enabled && !framePr ? reviewPagePull() : null;
    const mount = pr ? findReviewTabMount() : null;
    if (!pr || !mount) {
      if (!pr) removeToggle();
      return;
    }
    let btn = global.document.getElementById(TOGGLE_ID);
    if (!btn) {
      btn = global.document.createElement('button');
      btn.id = TOGGLE_ID;
      btn.type = 'button';
      btn.className = 'prp-gh-open-toggle prp-linear-open-toggle';
      btn.textContent = 'pr+';
      btn.addEventListener('click', (event: any) => {
        if (!event.isTrusted) return;
        event.preventDefault();
        const cur = reviewPagePull();
        if (cur) openOverlay({ ...cur, page: 'conversation' });
      });
    }
    const label = openWithLabel();
    btn.setAttribute('aria-label', label);
    btn.title = label;
    if (btn.parentElement !== mount) mount.appendChild(btn);
  }

  /**
   * Keys go to the focused iframe, so Linear never sees them. Keep focus in
   * the frame while it is open (Linear pulls focus back to its app).
   */
  try {
    global.document.addEventListener(
      'focusin',
      (event: any) => {
        const f = frameEl();
        if (!f || event.target === f) return;
        try {
          f.focus();
        } catch {
          /* ignore */
        }
      },
      true
    );
    for (const type of ['keydown', 'keypress', 'keyup']) {
      global.addEventListener(
        type,
        (event: any) => {
          if (frameEl()) event.stopPropagation();
        },
        true
      );
    }
  } catch {
    /* ignore */
  }

  /** SW → this tab (opener-embed open, launcher liveness, page-api close). */
  try {
    global.chrome?.runtime?.onMessage?.addListener((message: any, _sender: any, sendResponse: any) => {
      if (message?.type === 'PR_TREE_OPEN_PR') {
        if (!evaluated) sendResponse({ ok: true, ready: false });
        else if (!enabled) {
          sendResponse({ ok: false, ready: true, hostEnabled: false, reason: 'plugin-disabled' });
        } else {
          const opened = openFrame(message);
          sendResponse(
            opened
              ? { ok: true, ready: true, hostEnabled: true }
              : { ok: false, ready: true, hostEnabled: true, error: 'invalid-args' }
          );
        }
        return false;
      }
      if (message?.type === 'PR_TREE_PR_STATUS') {
        syncFrameGone();
        sendResponse({
          ok: true,
          open: Boolean(framePr),
          owner: framePr?.owner ?? null,
          repo: framePr?.repo ?? null,
          number: framePr?.number ?? null,
          page: framePr?.page ?? null,
        });
        return false;
      }
      if (message?.type === 'PR_TREE_CLOSE_PR') {
        closeFrame();
        sendResponse({ ok: true });
        return false;
      }
      return false;
    });
  } catch {
    /* ignore */
  }

  async function evalFeatures() {
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
    enabled = configured && pluginEnabled;
    evaluated = true;
    if (!enabled) closeFrame();
    ensureToggle();
  }

  try {
    global.setInterval(() => {
      syncFrameGone();
      ensureToggle();
    }, 800);
  } catch {
    /* ignore */
  }

  void evalFeatures();
})(typeof globalThis !== 'undefined' ? globalThis : window);
