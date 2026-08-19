/**
 * GitHub.com + GitHub Enterprise (Server/Cloud) endpoint resolution.
 *
 * REST:
 *   github.com  → https://api.github.com
 *   GHE Server  → https://{host}/api/v3
 * GraphQL:
 *   github.com  → https://api.github.com/graphql
 *   GHE Server  → https://{host}/api/graphql
 *
 * API bases are always derived from the web host (no custom API override).
 */
(function initGithubEndpoints(global: any) {
  const DEFAULT_REST = 'https://api.github.com';
  const DEFAULT_GRAPHQL = 'https://api.github.com/graphql';

  /**
   * @param {unknown} host
   * @returns {string}
   */
  function normalizeHostname(host: any) {
    let h = String(host || '')
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/\/.*$/, '')
      .replace(/:\d+$/, '');
    // strip credentials if pasted as user@host
    if (h.includes('@')) h = h.slice(h.lastIndexOf('@') + 1);
    return h;
  }

  /**
   * Public GitHub.com cloud only (default PAT applies solely here).
   * *.ghe.com is NOT public cloud — requires an explicit registered host pair.
   * @param {unknown} host
   */
  function isPublicCloudWebHost(host: any) {
    const h = normalizeHostname(host);
    return h === 'github.com' || h === 'www.github.com';
  }

  /**
   * Hostname is known github.com web (not enterprise).
   * @param {unknown} host
   */
  function isKnownGithubHostname(host: any) {
    const h = normalizeHostname(host);
    if (!h) return false;
    if (isPublicCloudWebHost(h)) return true;
    // gist.github.com etc. — still github.com product surface, not multi-account enterprise
    if (h.endsWith('.github.com')) return true;
    // Do NOT auto-treat *.ghe.com as known — manual host registration required
    return false;
  }

  /** Max non-github.com host↔PAT pairs. */
  const MAX_HOST_ACCOUNTS = 3;

  /**
   * @typedef {{ host: string, token: string }} HostAccount
   */

  /**
   * Normalize host↔PAT pairs (max MAX_HOST_ACCOUNTS, no github.com).
   * @param {unknown} raw
   * @returns {HostAccount[]}
   */
  function normalizeHostAccounts(raw: any) {
    const list = Array.isArray(raw) ? raw : [];
    const out: any[] = [];
    const seen = new Set();
    for (const row of list) {
      if (!row || typeof row !== 'object') continue;
      const host = normalizeHostname(row.host);
      const token = typeof row.token === 'string' ? row.token.trim() : '';
      if (!host || isPublicCloudWebHost(host) || host.endsWith('.github.com')) {
        continue;
      }
      if (!token || seen.has(host)) continue;
      seen.add(host);
      out.push({ host, token });
      if (out.length >= MAX_HOST_ACCOUNTS) break;
    }
    return out;
  }

  /**
   * Hosts list derived from pairs (for content-script registration).
   * @param {unknown} rawAccounts
   */
  function hostsFromAccounts(rawAccounts: any) {
    return normalizeHostAccounts(rawAccounts).map((a) => a.host);
  }

  /**
   * Select which PAT to use for API traffic for this web host.
   * - github.com → defaultToken only
   * - registered host → that host's token
   * - unregistered non-github.com (incl. *.ghe.com) → no token
   *
   * @param {unknown} webHost
   * @param {{ defaultToken?: string|null, hostAccounts?: unknown }} [opts]
   * @returns {{ token: string|null, source: 'default'|'host'|null, host: string }}
   */
  function selectTokenForWebHost(webHost: any, opts: any = {}) {
    const host = normalizeHostname(webHost) || 'github.com';
    const defaultToken =
      typeof opts.defaultToken === 'string' && opts.defaultToken.trim()
        ? opts.defaultToken.trim()
        : null;
    const accounts = normalizeHostAccounts(opts.hostAccounts);

    if (isPublicCloudWebHost(host) || host.endsWith('.github.com')) {
      return {
        token: defaultToken,
        source: defaultToken ? 'default' : null,
        host: isPublicCloudWebHost(host) ? 'github.com' : host,
      };
    }

    const pair = accounts.find((a) => a.host === host);
    if (pair) {
      return { token: pair.token, source: 'host', host };
    }
    return { token: null, source: null, host };
  }

  /**
   * GitHub API hostname (not a web UI host). Must not be used as webHost.
   * @param {unknown} host
   */
  function isGithubApiHostname(host: any) {
    const h = normalizeHostname(host);
    if (!h) return false;
    if (h === 'api.github.com') return true;
    return /^api\.[^.]+\.ghe\.com$/.test(h);
  }

  /**
   * Which GitHub web host a SW message should use for PAT + API base.
   * Page hostname is only trusted when it is github.com / registered GHES.
   * Linear / Jira / localhost / extension pages fall back to activeGithubWebHost.
   *
   * @param {object|null|undefined} message
   * @param {{ registeredHosts?: unknown, activeGithubWebHost?: unknown }} [opts]
   * @returns {string}
   */
  function resolveGithubWebHost(message: any, opts: any = {}) {
    const registered = (
      Array.isArray(opts.registeredHosts) ? opts.registeredHosts : []
    )
      .map((h: any) => normalizeHostname(h))
      .filter(Boolean);
    const activeRaw = normalizeHostname(opts.activeGithubWebHost) || 'github.com';
    const active = isGithubApiHostname(activeRaw)
      ? 'github.com'
      : activeRaw === 'www.github.com'
        ? 'github.com'
        : activeRaw;

    const explicit = normalizeHostname(
      message?.githubWebHost ?? message?.githubHost
    );
    if (explicit) {
      if (isGithubApiHostname(explicit)) return 'github.com';
      return explicit === 'www.github.com' ? 'github.com' : explicit;
    }

    const page = normalizeHostname(message?.webHost || message?.webOrigin);
    if (page && (isKnownGithubHostname(page) || registered.includes(page))) {
      return page === 'www.github.com' ? 'github.com' : page;
    }
    return active || 'github.com';
  }

  /**
   * Parse a GitHub PR URL (github.com or *.ghe.com) into openModal identity.
   * Used by Linear click-intercept for linked-PR buttons.
   */
  function parseGithubPullUrl(href: any, base?: any) {
    if (href == null) return null;
    const raw = String(href).trim();
    if (!raw || raw === '#') return null;
    try {
      const u = new URL(raw, base || 'https://github.com');
      const host = normalizeHostname(u.hostname);
      if (!host) return null;
      const githubWeb =
        isKnownGithubHostname(host) || /\.ghe\.com$/.test(host);
      if (!githubWeb) return null;
      const m = u.pathname.match(/^\/([^/]+)\/([^/]+)\/pull\/(\d+)(?:\/|$)/);
      if (!m) return null;
      const number = Number(m[3]);
      if (!Number.isFinite(number) || number <= 0) return null;
      return {
        owner: m[1],
        repo: m[2],
        number,
        githubWebHost: host === 'www.github.com' ? 'github.com' : host,
      };
    } catch {
      return null;
    }
  }

  function isLinearAppHost(host: any) {
    const h = normalizeHostname(host);
    return h === 'linear.app' || h.endsWith('.linear.app');
  }

  /** `/workspace/issue/PRP-2` (and `/issue/PRP-2/slug`). */
  function isLinearIssuePath(pathname: any) {
    return /\/issue\/[A-Z][A-Z0-9]*-\d+/i.test(String(pathname || ''));
  }

  /** `/workspace/review/{slug}` or `.../changes`. */
  function isLinearReviewPath(pathname: any) {
    return /\/review\/[^/]+/i.test(String(pathname || ''));
  }

  /**
   * Linear GitHub-integration review URL.
   * Slug is `{title-slug}-{slugId}`; slugId is the trailing hex token.
   */
  function parseLinearReviewPath(href: any, base?: any) {
    if (href == null) return null;
    const raw = String(href).trim();
    if (!raw || raw === '#') return null;
    try {
      const u = new URL(raw, base || 'https://linear.app');
      if (u.hostname && !isLinearAppHost(u.hostname)) return null;
      const m = u.pathname.match(
        /^\/([^/]+)\/review\/([^/]+)(?:\/(changes|overview))?\/?$/i
      );
      if (!m) return null;
      const slug = m[2];
      const slugIdMatch = String(slug).match(/-([a-f0-9]{8,16})$/i);
      return {
        workspace: m[1],
        slug,
        slugId: slugIdMatch ? slugIdMatch[1].toLowerCase() : '',
        tab: String(m[3] || 'overview').toLowerCase() === 'changes' ? 'changes' : 'overview',
        path: `/${m[1]}/review/${slug}`,
      };
    } catch {
      return null;
    }
  }

  function hrefFromClickNode(node: any): string | null {
    if (!node) return null;
    if (typeof node.getAttribute === 'function') {
      const data =
        node.getAttribute('href') ||
        node.getAttribute('data-href') ||
        node.getAttribute('data-url');
      if (data) return data;
    }
    if (typeof node.href === 'string' && node.href) return node.href;
    return null;
  }

  function isPrPlusUiNode(el: any): boolean {
    if (!el) return false;
    const id = String(el.id || '');
    if (
      id === 'prp-modal-host' ||
      id === 'prp-page-embed' ||
      id === 'prp-modal-root'
    ) {
      return true;
    }
    const cls = el.classList;
    if (cls && typeof cls.contains === 'function') {
      if (
        cls.contains('prp-overlay') ||
        cls.contains('prp-shell') ||
        cls.contains('prp-header')
      ) {
        return true;
      }
    }
    return false;
  }

  function isOtherControlNode(el: any): boolean {
    const tag = String(el?.tagName || '').toUpperCase();
    return (
      tag === 'BUTTON' ||
      tag === 'INPUT' ||
      tag === 'SELECT' ||
      tag === 'TEXTAREA' ||
      tag === 'SUMMARY' ||
      tag === 'LABEL'
    );
  }

  function clickNodeIsPrPlusChrome(n: any): boolean {
    if (isPrPlusUiNode(n)) return true;
    return Boolean(
      n &&
        typeof n.closest === 'function' &&
        n.closest('#prp-modal-host, #prp-page-embed, .prp-overlay, .prp-shell')
    );
  }

  /**
   * Resolve a GitHub PR from a click composedPath.
   * Linear chips wrap the <a>; the click target is often the parent, not the link.
   * Do not walk descendants of the pr+ overlay — header "Open on GitHub" would
   * steal Close / shell-toggle clicks.
   * Do not walk large ancestors: Linear review pages have one github.com/pull
   * link in the header, so a 6-level walk made every button open pr+.
   */
  function findGithubPullFromClickPath(nodes: any, opts: any = {}) {
    const list = Array.isArray(nodes) ? nodes : [];
    const hrefOf =
      typeof opts.hrefOf === 'function' ? opts.hrefOf : hrefFromClickNode;
    const parse = (href: any) => parseGithubPullUrl(href, opts.base);

    for (const n of list) {
      if (clickNodeIsPrPlusChrome(n)) break;
      const direct = parse(hrefOf(n));
      if (direct) return direct;
      if (n && typeof n.closest === 'function') {
        const a = n.closest('a[href]');
        if (a && !clickNodeIsPrPlusChrome(a)) {
          const fromA = parse(hrefOf(a));
          if (fromA) return fromA;
        }
      }
    }

    const start = list[0];
    if (
      start &&
      !isOtherControlNode(start) &&
      !clickNodeIsPrPlusChrome(start)
    ) {
      let el = start;
      for (let i = 0; i < 3 && el; i++) {
        const tag = String(el.tagName || '').toUpperCase();
        if (tag === 'BODY' || tag === 'HTML' || tag === 'MAIN' || tag === 'NAV') {
          break;
        }
        if (isPrPlusUiNode(el)) break;
        if (typeof el.childElementCount === 'number' && el.childElementCount > 12) {
          break;
        }
        if (typeof el.querySelectorAll === 'function') {
          const found: any[] = [];
          const seen = new Set();
          const anchors = el.querySelectorAll('a[href]');
          for (let j = 0; j < anchors.length; j++) {
            const p = parse(hrefOf(anchors[j]));
            if (!p) continue;
            const key = `${p.githubWebHost}/${p.owner}/${p.repo}/${p.number}`;
            if (seen.has(key)) continue;
            seen.add(key);
            found.push(p);
          }
          if (found.length === 1) return found[0];
        }
        el = el.parentElement || el.parentNode;
      }
    }
    return null;
  }

  /** Closest Linear `/review/{slug}` href in a click path (issue Diffs cards). */
  function findLinearReviewHrefFromClickPath(nodes: any, opts: any = {}) {
    const list = Array.isArray(nodes) ? nodes : [];
    const hrefOf =
      typeof opts.hrefOf === 'function' ? opts.hrefOf : hrefFromClickNode;
    const base = opts.base || 'https://linear.app';
    for (const n of list) {
      if (clickNodeIsPrPlusChrome(n)) break;
      const href = hrefOf(n);
      if (parseLinearReviewPath(href, base)) {
        try {
          return new URL(String(href), base).href;
        } catch {
          return String(href);
        }
      }
      if (n && typeof n.closest === 'function') {
        const a = n.closest('a[href]');
        if (a && !clickNodeIsPrPlusChrome(a)) {
          const fromA = hrefOf(a);
          if (parseLinearReviewPath(fromA, base)) {
            try {
              return new URL(String(fromA), base).href;
            } catch {
              return String(fromA);
            }
          }
        }
      }
    }
    return null;
  }

  /**
   * Resolve host then select PAT. Used by SW tokenForMessage after loading storage.
   */
  function selectTokenForMessage(message: any, opts: any = {}) {
    const host = resolveGithubWebHost(message, opts);
    return selectTokenForWebHost(host, {
      defaultToken: opts.defaultToken,
      hostAccounts: opts.hostAccounts,
    });
  }

  /**
   * Validate adding a host↔PAT pair.
   * @param {unknown} existingAccounts
   * @param {unknown} host
   * @param {unknown} token
   * @returns {{ ok: true, accounts: HostAccount[] } | { ok: false, error: string, accounts: HostAccount[] }}
   */
  function registerHostAccount(existingAccounts: any, host: any, token: any) {
    const accounts = normalizeHostAccounts(existingAccounts);
    const h = normalizeHostname(host);
    const t = typeof token === 'string' ? token.trim() : '';
    if (!h) {
      return { ok: false, error: 'Host is required', accounts };
    }
    if (isPublicCloudWebHost(h) || h.endsWith('.github.com')) {
      return {
        ok: false,
        error: 'github.com uses the default PAT — do not register it as enterprise',
        accounts,
      };
    }
    if (!t) {
      return { ok: false, error: 'PAT is required for each enterprise host', accounts };
    }
    const idx = accounts.findIndex((a) => a.host === h);
    if (idx >= 0) {
      const next = accounts.slice();
      next[idx] = { host: h, token: t };
      return { ok: true, accounts: next };
    }
    if (accounts.length >= MAX_HOST_ACCOUNTS) {
      return {
        ok: false,
        error: `At most ${MAX_HOST_ACCOUNTS} enterprise hosts`,
        accounts,
      };
    }
    return { ok: true, accounts: [...(accounts as any), { host: h, token: t }] };
  }

  /**
   * @param {unknown} existingAccounts
   * @param {unknown} host
   */
  function unregisterHostAccount(existingAccounts: any, host: any) {
    const accounts = normalizeHostAccounts(existingAccounts);
    const h = normalizeHostname(host);
    return {
      ok: true,
      accounts: accounts.filter((a) => a.host !== h),
    };
  }

  /**
   * Heuristic: is this document a GitHub / GHE web UI?
   * @param {Document|null|undefined} doc
   * @param {{ hostname?: string }|null|undefined} [loc]
   */
  function isGithubWebDocument(doc: any, loc: any) {
    const host =
      normalizeHostname(loc?.hostname) ||
      normalizeHostname(
        typeof global.location !== 'undefined' ? global.location.hostname : ''
      );
    if (isKnownGithubHostname(host)) return true;
    if (!doc || typeof doc.querySelector !== 'function') return false;

    // Strong GitHub UI markers (GHES + github.com)
    if (doc.querySelector('meta[name="github-keyboard-shortcuts"]')) return true;
    if (doc.querySelector('meta[name="octolytics-url"]')) return true;
    if (doc.querySelector('meta[name="octolytics-dimension-request_id"]')) return true;
    if (doc.querySelector('meta[name="route-controller"][content]')) {
      // Many GHE pages expose route-controller; pair with soft signals
      if (
        doc.querySelector('meta[name="current-catalog-service"]') ||
        doc.querySelector('link[rel="fluid-icon"]') ||
        doc.querySelector('meta[name="theme-color"]')
      ) {
        return true;
      }
    }
    const site = doc
      .querySelector('meta[property="og:site_name"]')
      ?.getAttribute('content');
    if (site && /^GitHub\b/i.test(String(site).trim())) return true;

    // Assets / turbo patterns
    if (doc.querySelector('link[href*="githubassets.com"]')) return true;
    if (doc.querySelector('script[src*="githubassets.com"]')) return true;

    return false;
  }

  /**
   * Strip trailing slashes from an origin/base URL.
   * @param {unknown} url
   */
  function stripTrailingSlashes(url: any) {
    return String(url || '').trim().replace(/\/+$/, '');
  }

  /**
   * Derive GraphQL URL from a REST API base.
   * @param {string} restBase
   */
  function graphqlUrlFromRestBase(restBase: any) {
    const base = stripTrailingSlashes(restBase);
    if (!base) return DEFAULT_GRAPHQL;
    if (base === DEFAULT_REST || base === 'https://api.github.com') {
      return DEFAULT_GRAPHQL;
    }
    // GHE classic: …/api/v3 → …/api/graphql
    if (/\/api\/v3$/i.test(base)) {
      return base.replace(/\/api\/v3$/i, '/api/graphql');
    }
    // …/api → …/api/graphql
    if (/\/api$/i.test(base)) {
      return `${base}/graphql`;
    }
    // Bare API host (api.github.example.com style)
    return `${base}/graphql`;
  }

  /**
   * Default endpoints for a web hostname (no custom override).
   * @param {unknown} webHost
   */
  function defaultEndpointsForWebHost(webHost: any) {
    const host = normalizeHostname(webHost);
    if (!host || host === 'github.com' || host === 'www.github.com') {
      return {
        kind: 'dotcom',
        webHost: 'github.com',
        webOrigin: 'https://github.com',
        restBase: DEFAULT_REST,
        graphqlUrl: DEFAULT_GRAPHQL,
      };
    }
    if (host.endsWith('.ghe.com') || host === 'ghe.com') {
      // Enterprise Cloud (data residency): web SUBDOMAIN.ghe.com → API api.SUBDOMAIN.ghe.com
      // Official docs: replace api.github.com with api.SUBDOMAIN.ghe.com (no /api/v3 path).
      // See: docs.github.com/en/enterprise-cloud@latest/rest/*
      const apiHost =
        host === 'ghe.com' || host.startsWith('api.')
          ? host === 'ghe.com'
            ? 'api.ghe.com'
            : host
          : `api.${host}`;
      return {
        kind: 'ghe-cloud',
        webHost: host,
        webOrigin: `https://${host}`,
        restBase: `https://${apiHost}`,
        graphqlUrl: `https://${apiHost}/graphql`,
      };
    }
    // Self-hosted Enterprise Server: https://HOSTNAME/api/v3 and /api/graphql
    // Official: docs.github.com/en/enterprise-server@latest/rest/quickstart
    return {
      kind: 'ghes',
      webHost: host,
      webOrigin: `https://${host}`,
      restBase: `https://${host}/api/v3`,
      graphqlUrl: `https://${host}/api/graphql`,
    };
  }

  /**
   * Resolve REST + GraphQL endpoints for API calls from the web host only.
   * @param {{ webHost?: string|null }} [opts]
   * @returns {{
   *   kind: string,
   *   webHost: string,
   *   webOrigin: string,
   *   restBase: string,
   *   graphqlUrl: string,
   * }}
   */
  function resolveGithubEndpoints(opts: any = {}) {
    return defaultEndpointsForWebHost(opts.webHost);
  }

  /**
   * Normalize API context for pure URL builders.
   * Stateless: never reads/writes process-global mutable state.
   * Accepts full endpoints object, { webHost }, host string, or null → github.com.
   *
   * @param {object|string|null|undefined} ctx
   */
  function normalizeApiCtx(ctx: any) {
    if (ctx && typeof ctx === 'object' && (ctx.restBase || ctx.graphqlUrl)) {
      const restBase =
        stripTrailingSlashes(ctx.restBase || DEFAULT_REST) || DEFAULT_REST;
      const graphqlUrl =
        stripTrailingSlashes(ctx.graphqlUrl || '') ||
        graphqlUrlFromRestBase(restBase);
      return {
        kind: ctx.kind || 'custom',
        webHost: normalizeHostname(ctx.webHost) || 'github.com',
        webOrigin: ctx.webOrigin || '',
        restBase,
        graphqlUrl,
      };
    }
    const webHost =
      typeof ctx === 'string'
        ? ctx
        : ctx && typeof ctx === 'object'
          ? ctx.webHost
          : null;
    return defaultEndpointsForWebHost(webHost || 'github.com');
  }

  /**
   * @deprecated Prefer resolveGithubEndpoints + explicit ctx propagation.
   * No longer mutates process global — returns a normalized ctx only.
   */
  function setGithubApiContext(endpoints: any) {
    return normalizeApiCtx(endpoints);
  }

  /**
   * @deprecated Prefer explicit ctx from resolveGithubEndpoints / message.
   * Always returns github.com defaults (stateless; no global store).
   */
  function getGithubApiContext() {
    return defaultEndpointsForWebHost('github.com');
  }

  /**
   * @deprecated Global exclusive queue is obsolete under stateless ctx RPC.
   * Kept as a no-op pass-through for tests / old call sites.
   * @returns {(fn: () => any|Promise<any>) => Promise<any>}
   */
  function createGithubApiExclusiveRunner() {
    return function runWithGithubApiExclusive(fn: any) {
      return Promise.resolve().then(fn);
    };
  }

  /**
   * REST absolute URL from explicit ctx (required for multi-host safety).
   * @param {string} path
   * @param {object|string|null|undefined} [ctx]
   */
  function githubRestUrl(path: any, ctx: any) {
    const { restBase } = normalizeApiCtx(ctx);
    const base = stripTrailingSlashes(restBase) || DEFAULT_REST;
    const p = String(path || '');
    if (/^https?:\/\//i.test(p)) return p;
    return `${base}${p.startsWith('/') ? p : `/${p}`}`;
  }

  /**
   * GraphQL absolute URL from explicit ctx.
   * @param {object|string|null|undefined} [ctx]
   */
  function githubGraphqlUrl(ctx: any) {
    const { graphqlUrl } = normalizeApiCtx(ctx);
    return stripTrailingSlashes(graphqlUrl) || DEFAULT_GRAPHQL;
  }

  /**
   * Hosts that should receive content-script registration (enterprise).
   * Always includes github.com patterns via static manifest matches.
   * @param {unknown} rawHosts
   * @returns {string[]}
   */
  function normalizeEnterpriseWebHosts(rawHosts: any) {
    const list = Array.isArray(rawHosts)
      ? rawHosts
      : typeof rawHosts === 'string'
        ? rawHosts.split(/[\s,]+/)
        : [];
    const out: any[] = [];
    const seen = new Set();
    for (const raw of list) {
      const h = normalizeHostname(raw);
      if (!h || h === 'github.com' || h === 'www.github.com') continue;
      if (seen.has(h)) continue;
      seen.add(h);
      out.push(h);
    }
    return out;
  }

  /**
   * Match patterns for chrome.scripting.registerContentScripts.
   * @param {string[]} hosts
   */
  function contentScriptMatchesForHosts(hosts: any) {
    return normalizeEnterpriseWebHosts(hosts).map(
      (h) => `https://${h}/*`
    );
  }

  const api = {
    DEFAULT_REST,
    DEFAULT_GRAPHQL,
    MAX_HOST_ACCOUNTS,
    normalizeHostname,
    isPublicCloudWebHost,
    isKnownGithubHostname,
    isGithubWebDocument,
    graphqlUrlFromRestBase,
    defaultEndpointsForWebHost,
    resolveGithubEndpoints,
    normalizeApiCtx,
    setGithubApiContext,
    getGithubApiContext,
    createGithubApiExclusiveRunner,
    githubRestUrl,
    githubGraphqlUrl,
    normalizeEnterpriseWebHosts,
    contentScriptMatchesForHosts,
    normalizeHostAccounts,
    hostsFromAccounts,
    selectTokenForWebHost,
    isGithubApiHostname,
    resolveGithubWebHost,
    parseGithubPullUrl,
    isLinearIssuePath,
    isLinearReviewPath,
    parseLinearReviewPath,
    findGithubPullFromClickPath,
    findLinearReviewHrefFromClickPath,
    selectTokenForMessage,
    registerHostAccount,
    unregisterHostAccount,
  };

  global.PRGithubEndpoints = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
