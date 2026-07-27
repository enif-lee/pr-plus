/**
 * AUTO-GENERATED — do not edit. Run: npm run build:sw
 * Single-file MV3 service worker (deps + background handler).
 * TypeScript sources are transformed with esbuild before concat.
 */
/* eslint-disable */


/* ---- github-endpoints.ts ---- */

(function initGithubEndpoints(global) {
  const DEFAULT_REST = "https://api.github.com";
  const DEFAULT_GRAPHQL = "https://api.github.com/graphql";
  function normalizeHostname(host) {
    let h = String(host || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/:\d+$/, "");
    if (h.includes("@")) h = h.slice(h.lastIndexOf("@") + 1);
    return h;
  }
  function isPublicCloudWebHost(host) {
    const h = normalizeHostname(host);
    return h === "github.com" || h === "www.github.com";
  }
  function isKnownGithubHostname(host) {
    const h = normalizeHostname(host);
    if (!h) return false;
    if (isPublicCloudWebHost(h)) return true;
    if (h.endsWith(".github.com")) return true;
    return false;
  }
  const MAX_HOST_ACCOUNTS = 3;
  function normalizeHostAccounts(raw) {
    const list = Array.isArray(raw) ? raw : [];
    const out = [];
    const seen = /* @__PURE__ */ new Set();
    for (const row of list) {
      if (!row || typeof row !== "object") continue;
      const host = normalizeHostname(row.host);
      const token = typeof row.token === "string" ? row.token.trim() : "";
      if (!host || isPublicCloudWebHost(host) || host.endsWith(".github.com")) {
        continue;
      }
      if (!token || seen.has(host)) continue;
      seen.add(host);
      out.push({ host, token });
      if (out.length >= MAX_HOST_ACCOUNTS) break;
    }
    return out;
  }
  function hostsFromAccounts(rawAccounts) {
    return normalizeHostAccounts(rawAccounts).map((a) => a.host);
  }
  function selectTokenForWebHost(webHost, opts = {}) {
    const host = normalizeHostname(webHost) || "github.com";
    const defaultToken = typeof opts.defaultToken === "string" && opts.defaultToken.trim() ? opts.defaultToken.trim() : null;
    const accounts = normalizeHostAccounts(opts.hostAccounts);
    if (isPublicCloudWebHost(host) || host.endsWith(".github.com")) {
      return {
        token: defaultToken,
        source: defaultToken ? "default" : null,
        host: isPublicCloudWebHost(host) ? "github.com" : host
      };
    }
    const pair = accounts.find((a) => a.host === host);
    if (pair) {
      return { token: pair.token, source: "host", host };
    }
    return { token: null, source: null, host };
  }
  function registerHostAccount(existingAccounts, host, token) {
    const accounts = normalizeHostAccounts(existingAccounts);
    const h = normalizeHostname(host);
    const t = typeof token === "string" ? token.trim() : "";
    if (!h) {
      return { ok: false, error: "Host is required", accounts };
    }
    if (isPublicCloudWebHost(h) || h.endsWith(".github.com")) {
      return {
        ok: false,
        error: "github.com uses the default PAT \u2014 do not register it as enterprise",
        accounts
      };
    }
    if (!t) {
      return { ok: false, error: "PAT is required for each enterprise host", accounts };
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
        accounts
      };
    }
    return { ok: true, accounts: [...accounts, { host: h, token: t }] };
  }
  function unregisterHostAccount(existingAccounts, host) {
    const accounts = normalizeHostAccounts(existingAccounts);
    const h = normalizeHostname(host);
    return {
      ok: true,
      accounts: accounts.filter((a) => a.host !== h)
    };
  }
  function isGithubWebDocument(doc, loc) {
    const host = normalizeHostname(loc?.hostname) || normalizeHostname(
      typeof global.location !== "undefined" ? global.location.hostname : ""
    );
    if (isKnownGithubHostname(host)) return true;
    if (!doc || typeof doc.querySelector !== "function") return false;
    if (doc.querySelector('meta[name="github-keyboard-shortcuts"]')) return true;
    if (doc.querySelector('meta[name="octolytics-url"]')) return true;
    if (doc.querySelector('meta[name="octolytics-dimension-request_id"]')) return true;
    if (doc.querySelector('meta[name="route-controller"][content]')) {
      if (doc.querySelector('meta[name="current-catalog-service"]') || doc.querySelector('link[rel="fluid-icon"]') || doc.querySelector('meta[name="theme-color"]')) {
        return true;
      }
    }
    const site = doc.querySelector('meta[property="og:site_name"]')?.getAttribute("content");
    if (site && /^GitHub\b/i.test(String(site).trim())) return true;
    if (doc.querySelector('link[href*="githubassets.com"]')) return true;
    if (doc.querySelector('script[src*="githubassets.com"]')) return true;
    return false;
  }
  function stripTrailingSlashes(url) {
    return String(url || "").trim().replace(/\/+$/, "");
  }
  function graphqlUrlFromRestBase(restBase) {
    const base = stripTrailingSlashes(restBase);
    if (!base) return DEFAULT_GRAPHQL;
    if (base === DEFAULT_REST || base === "https://api.github.com") {
      return DEFAULT_GRAPHQL;
    }
    if (/\/api\/v3$/i.test(base)) {
      return base.replace(/\/api\/v3$/i, "/api/graphql");
    }
    if (/\/api$/i.test(base)) {
      return `${base}/graphql`;
    }
    return `${base}/graphql`;
  }
  function defaultEndpointsForWebHost(webHost) {
    const host = normalizeHostname(webHost);
    if (!host || host === "github.com" || host === "www.github.com") {
      return {
        kind: "dotcom",
        webHost: "github.com",
        webOrigin: "https://github.com",
        restBase: DEFAULT_REST,
        graphqlUrl: DEFAULT_GRAPHQL
      };
    }
    if (host.endsWith(".ghe.com") || host === "ghe.com") {
      const apiHost = host === "ghe.com" || host.startsWith("api.") ? host === "ghe.com" ? "api.ghe.com" : host : `api.${host}`;
      return {
        kind: "ghe-cloud",
        webHost: host,
        webOrigin: `https://${host}`,
        restBase: `https://${apiHost}`,
        graphqlUrl: `https://${apiHost}/graphql`
      };
    }
    return {
      kind: "ghes",
      webHost: host,
      webOrigin: `https://${host}`,
      restBase: `https://${host}/api/v3`,
      graphqlUrl: `https://${host}/api/graphql`
    };
  }
  function resolveGithubEndpoints(opts = {}) {
    return defaultEndpointsForWebHost(opts.webHost);
  }
  function normalizeApiCtx(ctx) {
    if (ctx && typeof ctx === "object" && (ctx.restBase || ctx.graphqlUrl)) {
      const restBase = stripTrailingSlashes(ctx.restBase || DEFAULT_REST) || DEFAULT_REST;
      const graphqlUrl = stripTrailingSlashes(ctx.graphqlUrl || "") || graphqlUrlFromRestBase(restBase);
      return {
        kind: ctx.kind || "custom",
        webHost: normalizeHostname(ctx.webHost) || "github.com",
        webOrigin: ctx.webOrigin || "",
        restBase,
        graphqlUrl
      };
    }
    const webHost = typeof ctx === "string" ? ctx : ctx && typeof ctx === "object" ? ctx.webHost : null;
    return defaultEndpointsForWebHost(webHost || "github.com");
  }
  function setGithubApiContext(endpoints) {
    return normalizeApiCtx(endpoints);
  }
  function getGithubApiContext() {
    return defaultEndpointsForWebHost("github.com");
  }
  function createGithubApiExclusiveRunner() {
    return function runWithGithubApiExclusive(fn) {
      return Promise.resolve().then(fn);
    };
  }
  function githubRestUrl(path, ctx) {
    const { restBase } = normalizeApiCtx(ctx);
    const base = stripTrailingSlashes(restBase) || DEFAULT_REST;
    const p = String(path || "");
    if (/^https?:\/\//i.test(p)) return p;
    return `${base}${p.startsWith("/") ? p : `/${p}`}`;
  }
  function githubGraphqlUrl(ctx) {
    const { graphqlUrl } = normalizeApiCtx(ctx);
    return stripTrailingSlashes(graphqlUrl) || DEFAULT_GRAPHQL;
  }
  function normalizeEnterpriseWebHosts(rawHosts) {
    const list = Array.isArray(rawHosts) ? rawHosts : typeof rawHosts === "string" ? rawHosts.split(/[\s,]+/) : [];
    const out = [];
    const seen = /* @__PURE__ */ new Set();
    for (const raw of list) {
      const h = normalizeHostname(raw);
      if (!h || h === "github.com" || h === "www.github.com") continue;
      if (seen.has(h)) continue;
      seen.add(h);
      out.push(h);
    }
    return out;
  }
  function contentScriptMatchesForHosts(hosts) {
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
    registerHostAccount,
    unregisterHostAccount
  };
  global.PRGithubEndpoints = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : exports);


/* ---- modal/pure/collapse.js ---- */

/* sw-iife */
(function () {
  /**
   * Default-collapse rules for PR files (binary / huge / generated).
   * Aligns with GitHub + linguist-style .gitattributes signals.
   */

  /** Files with this many change lines (additions+deletions) start collapsed. */
  const DEFAULT_LARGE_CHANGES = 5000;
  const DEFAULT_LARGE_PATCH_CHARS = 80_000;

  const IMAGE_EXT_RE =
    /\.(png|jpe?g|gif|webp|bmp|svg|ico|avif|jfif|pjpeg|pjp|tif{1,2})$/i;

  /**
   * @param {unknown} path
   * @returns {boolean}
   */
  function isImagePath(path) {
    const p = String(path || '').split('?')[0].split('#')[0];
    return IMAGE_EXT_RE.test(p);
  }

  /**
   * Classify a PR file for diff presentation.
   * @returns {{ kind: 'image'|'binary'|'text', openableAsText: boolean, renderImage: boolean }}
   */
  function classifyDiffFile(file) {
    if (!file) {
      return { kind: 'binary', openableAsText: false, renderImage: false };
    }
    const path = file.filename || file.path || '';
    const patch = typeof file.patch === 'string' ? file.patch : '';
    const hasPatch = patch.length > 0;
    const media = String(file.mediaType || file.contentType || '').toLowerCase();
    const image = isImagePath(path) || media.startsWith('image/');

    if (image) {
      return { kind: 'image', openableAsText: false, renderImage: true };
    }
    if (hasPatch) {
      return { kind: 'text', openableAsText: true, renderImage: false };
    }
    return { kind: 'binary', openableAsText: false, renderImage: false };
  }

  /**
   * Parse .gitattributes body into path-pattern → attributes map.
   * @param {string} text
   * @returns {Array<{ pattern: string, attrs: Record<string, string|boolean> }>}
   */
  function parseGitattributes(text) {
    const rules = [];
    if (!text || typeof text !== 'string') return rules;
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.replace(/#.*$/, '').trim();
      if (!line) continue;
      const parts = line.split(/\s+/);
      if (parts.length < 2) continue;
      const pattern = parts[0];
      const attrs = {};
      for (let i = 1; i < parts.length; i++) {
        const p = parts[i];
        if (p.startsWith('-')) {
          attrs[p.slice(1)] = false;
        } else if (p.includes('=')) {
          const [k, v] = p.split('=');
          attrs[k] = v;
        } else {
          attrs[p] = true;
        }
      }
      rules.push({ pattern, attrs });
    }
    return rules;
  }

  /**
   * Simple gitignore-style match for attributes patterns (basename or ** suffix).
   * @param {string} filePath
   * @param {string} pattern
   */
  function matchAttrPattern(filePath, pattern) {
    if (!filePath || !pattern) return false;
    const path = filePath.replace(/^\/+/, '');
    if (pattern === path) return true;
    // **/foo or *.min.js style
    if (pattern.startsWith('**/')) {
      const rest = pattern.slice(3);
      return path === rest || path.endsWith(`/${rest}`) || path.endsWith(rest);
    }
    if (pattern.startsWith('*.')) {
      return path.endsWith(pattern.slice(1));
    }
    if (pattern.includes('*')) {
      const re = new RegExp(
        '^' +
          pattern
            .replace(/[.+^${}()|[\]\\]/g, '\\$&')
            .replace(/\*\*/g, '§§')
            .replace(/\*/g, '[^/]*')
            .replace(/§§/g, '.*') +
          '$'
      );
      return re.test(path);
    }
    return path === pattern || path.endsWith(`/${pattern}`);
  }

  /**
   * Resolve attributes for a path (later rules override).
   * @param {string} filePath
   * @param {Array<{ pattern: string, attrs: Record<string, string|boolean> }>} rules
   */
  function attributesForPath(filePath, rules) {
    const out = {};
    if (!Array.isArray(rules)) return out;
    for (const rule of rules) {
      if (matchAttrPattern(filePath, rule.pattern)) {
        Object.assign(out, rule.attrs);
      }
    }
    return out;
  }

  /**
   * gitattributes values arrive as booleans (flag form) or strings ("true"/"false"
   * from key=value). Treat truthy-enabled forms as on.
   * @param {unknown} value
   * @returns {boolean}
   */
  function isAttrEnabled(value) {
    if (value === true) return true;
    if (value === false || value == null) return false;
    if (typeof value === 'string') {
      const v = value.trim().toLowerCase();
      if (v === '' || v === 'false' || v === '0' || v === 'no' || v === 'unset') {
        return false;
      }
      // "true", "set", "yes", "1", or bare presence-like values
      return true;
    }
    return Boolean(value);
  }

  /**
   * Whether a PR file should start collapsed in the diff view.
   * @param {{ filename?: string, path?: string, patch?: string, changes?: number, additions?: number, deletions?: number, status?: string, linguistGenerated?: boolean, binary?: boolean }} file
   * @param {{ rules?: Array, largeChanges?: number, largePatchChars?: number }} [opts]
   */
  function shouldCollapseFile(file, opts = {}) {
    if (!file) return true;
    const path = file.filename || file.path || '';
    const patch = file.patch || '';
    const changes =
      file.changes ??
      (Number(file.additions || 0) + Number(file.deletions || 0));
    const largeChanges = opts.largeChanges ?? DEFAULT_LARGE_CHANGES;
    const largePatchChars = opts.largePatchChars ?? DEFAULT_LARGE_PATCH_CHARS;
    const rules = opts.rules || [];
    const classified = classifyDiffFile(file);

    const attrs = attributesForPath(path, rules);
    if (
      isAttrEnabled(file.linguistGenerated) ||
      isAttrEnabled(attrs['linguist-generated'])
    ) {
      return true;
    }
    if (isAttrEnabled(file.binary) || isAttrEnabled(attrs.binary)) {
      return true;
    }
    // `-diff` sets attrs.diff=false; `diff=false` arrives as string
    if (attrs.diff === false || String(attrs.diff || '').toLowerCase() === 'false') {
      return true;
    }
    if (classified.kind === 'binary') return true;
    if (changes >= largeChanges) return true;
    if (patch && patch.length >= largePatchChars) return true;
    if (classified.kind === 'image') return false;
    if (!patch) return true;

    // Common generated / lockfile noise
    const lower = path.toLowerCase();
    if (
      lower.endsWith('package-lock.json') ||
      lower.endsWith('yarn.lock') ||
      lower.endsWith('pnpm-lock.yaml') ||
      lower.endsWith('.min.js') ||
      lower.endsWith('.min.css') ||
      lower.endsWith('.map') ||
      lower.includes('/dist/') ||
      lower.endsWith('.bundle.js')
    ) {
      return true;
    }

    return false;
  }

  /**
   * Annotate files with collapse + attrs metadata (pure).
   * Always re-runnable with gitattributesText so SW weak defaults can be upgraded.
   * @param {object[]} files
   * @param {string} [gitattributesText]
   */
  function annotateFilesForCollapse(files, gitattributesText) {
    const rules = parseGitattributes(gitattributesText || '');
    return (Array.isArray(files) ? files : []).map((f) => {
      const path = f.filename || f.path || '';
      const attrs = attributesForPath(path, rules);
      const enriched = {
        ...f,
        linguistGenerated:
          isAttrEnabled(f.linguistGenerated) ||
          isAttrEnabled(attrs['linguist-generated']),
        binary: isAttrEnabled(f.binary) || isAttrEnabled(attrs.binary),
      };
      const classified = classifyDiffFile(enriched);
      const collapsed = shouldCollapseFile(enriched, { rules });
      return {
        ...f,
        attrs,
        fileKind: classified.kind,
        openableAsText: classified.openableAsText,
        renderImage: classified.renderImage,
        defaultCollapsed: collapsed,
      };
    });
  }

  function toPathSet(paths) {
    if (!paths) return new Set();
    if (paths instanceof Set) return paths;
    return new Set(Array.isArray(paths) ? paths : []);
  }

  function isPathCollapsed(
    path,
    collapsedPaths,
    defaultCollapsed,
    expandAll,
    viewedPaths
  ) {
    if (expandAll || !path) return false;
    const set = toPathSet(collapsedPaths);
    if (set.has(path)) return true;
    if (set.size === 0) {
      if (defaultCollapsed === true) return true;
      if (toPathSet(viewedPaths).has(path)) return true;
    }
    return false;
  }

  function defaultCollapsedPathSet(files, viewedPaths) {
    const out = new Set();
    for (const f of Array.isArray(files) ? files : []) {
      if (!f || !f.defaultCollapsed) continue;
      const p = f.filename || f.path;
      if (p) out.add(p);
    }
    for (const p of toPathSet(viewedPaths)) {
      if (p) out.add(p);
    }
    return out;
  }

  function materializeCollapsedPaths(collapsedPaths, files, viewedPaths) {
    if (collapsedPaths instanceof Set && collapsedPaths.size > 0) {
      return new Set(collapsedPaths);
    }
    if (Array.isArray(collapsedPaths) && collapsedPaths.length > 0) {
      return new Set(collapsedPaths);
    }
    return defaultCollapsedPathSet(files, viewedPaths);
  }

  const COLLAPSED_SET_EXPLICIT_EMPTY = '\0prp-collapsed-explicit';

  function expandPathInCollapsedSet(collapsedPaths, path, files, viewedPaths) {
    const p = String(path || '').trim();
    const n = materializeCollapsedPaths(collapsedPaths, files, viewedPaths);
    if (p) n.delete(p);
    n.delete(COLLAPSED_SET_EXPLICIT_EMPTY);
    if (n.size === 0) {
      n.add(COLLAPSED_SET_EXPLICIT_EMPTY);
    }
    return n;
  }

  const api = {
    parseGitattributes,
    matchAttrPattern,
    attributesForPath,
    isAttrEnabled,
    isImagePath,
    classifyDiffFile,
    shouldCollapseFile,
    annotateFilesForCollapse,
    isPathCollapsed,
    defaultCollapsedPathSet,
    materializeCollapsedPaths,
    COLLAPSED_SET_EXPLICIT_EMPTY,
    expandPathInCollapsedSet,
    DEFAULT_LARGE_CHANGES,
    DEFAULT_LARGE_PATCH_CHARS,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (typeof globalThis !== 'undefined') {
    globalThis.PRModalCollapse = api;
  }
})();


/* ---- modal/pure/comments-page.js ---- */

/**
 * Pure helpers for paginated / incremental GitHub comment fetches.
 * REST: page+per_page (Link rel=next/last) and since=ISO8601 incremental windows.
 */
(function () {

function githubRestUrl(path) {
  try {
    if (globalThis.PRGithubEndpoints && typeof globalThis.PRGithubEndpoints.githubRestUrl === 'function') {
      return globalThis.PRGithubEndpoints.githubRestUrl(path);
    }
  } catch (_) {}
  const p = String(path || '');
  return 'https://api.github.com' + (p.startsWith('/') ? p : '/' + p);
}
function githubGraphqlUrl() {
  try {
    if (globalThis.PRGithubEndpoints && typeof globalThis.PRGithubEndpoints.githubGraphqlUrl === 'function') {
      return globalThis.PRGithubEndpoints.githubGraphqlUrl();
    }
  } catch (_) {}
  return 'https://api.github.com/graphql';
}



const DEFAULT_COMMENT_PAGE_SIZE = 50;

function parseLinkRelPage(linkHeader, rel) {
  const raw = String(linkHeader || '');
  if (!raw) return null;
  const re = new RegExp('rel="?' + rel + '"?', 'i');
  const parts = raw.split(',');
  for (const part of parts) {
    if (!re.test(part)) continue;
    const m = part.match(/[?&]page=(\d+)/i);
    if (m) {
      const n = Number(m[1]);
      return Number.isFinite(n) && n > 0 ? n : null;
    }
  }
  return null;
}

function parseLinkNextPage(linkHeader) {
  return parseLinkRelPage(linkHeader, 'next');
}

function parseLinkLastPage(linkHeader) {
  return parseLinkRelPage(linkHeader, 'last');
}

function linkHasMore(linkHeader) {
  return parseLinkNextPage(linkHeader) != null;
}

function clampPerPage(n, max = 100) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return DEFAULT_COMMENT_PAGE_SIZE;
  return Math.min(max, Math.floor(v));
}

function buildCommentsListUrl(kind, owner, repo, number, opts = {}) {
  const o = encodeURIComponent(String(owner || ''));
  const r = encodeURIComponent(String(repo || ''));
  const n = Number(number);
  const perPage = clampPerPage(opts.perPage);
  const page = Math.max(1, Number(opts.page) || 1);
  const base =
    kind === 'review'
      ? githubRestUrl(`/repos/${o}/${r}/pulls/${n}/comments`)
      : githubRestUrl(`/repos/${o}/${r}/issues/${n}/comments`);
  const params = new URLSearchParams();
  params.set('per_page', String(perPage));
  params.set('page', String(page));
  if (opts.sort) params.set('sort', String(opts.sort));
  if (opts.direction) params.set('direction', String(opts.direction));
  if (opts.since) params.set('since', String(opts.since));
  return `${base}?${params.toString()}`;
}

function mergeCommentsById(existing, incoming) {
  const map = new Map();
  for (const c of Array.isArray(existing) ? existing : []) {
    if (c && c.id != null) map.set(String(c.id), c);
  }
  for (const c of Array.isArray(incoming) ? incoming : []) {
    if (c && c.id != null) map.set(String(c.id), c);
  }
  return [...map.values()].sort((a, b) => {
    const ta = String(a.createdAt || a.created_at || '');
    const tb = String(b.createdAt || b.created_at || '');
    if (ta !== tb) return ta.localeCompare(tb);
    return Number(a.id) - Number(b.id);
  });
}

function buildCommentsPageMeta(items, opts = {}) {
  const list = Array.isArray(items) ? items : [];
  const page = Math.max(1, Number(opts.page) || 1);
  const perPage = clampPerPage(opts.perPage);
  const order = opts.order === 'from-end' ? 'from-end' : opts.order || 'asc';

  let oldest = null;
  let newest = null;
  let maxId = null;
  for (const c of list) {
    const at = c?.createdAt || c?.created_at || null;
    if (at) {
      if (!oldest || at < oldest) oldest = at;
      if (!newest || at > newest) newest = at;
    }
    if (c?.id != null) {
      const id = Number(c.id);
      if (Number.isFinite(id) && (maxId == null || id > maxId)) maxId = id;
    }
  }

  if (order === 'from-end') {
    const hasMore = page > 1;
    return {
      page,
      perPage,
      hasMore,
      nextPage: hasMore ? page - 1 : null,
      order: 'from-end',
      since: opts.since || null,
      oldestCreatedAt: oldest,
      newestCreatedAt: newest,
      maxId,
      loadedCount: list.length,
    };
  }

  const nextPage = parseLinkNextPage(opts.linkHeader);
  const hasMore =
    nextPage != null || (opts.linkHeader == null && list.length >= perPage);
  return {
    page,
    perPage,
    hasMore: Boolean(hasMore),
    nextPage: nextPage ?? (hasMore ? page + 1 : null),
    order,
    since: opts.since || null,
    oldestCreatedAt: oldest,
    newestCreatedAt: newest,
    maxId,
    loadedCount: list.length,
  };
}

function minIso(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  return a < b ? a : b;
}

function maxIso(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  return a > b ? a : b;
}

function advanceCommentsMeta(prevMeta, pageMeta, totalLoaded) {
  const prev = prevMeta || {};
  const page = pageMeta || {};
  return {
    page: page.page ?? prev.page ?? 1,
    perPage: page.perPage ?? prev.perPage ?? DEFAULT_COMMENT_PAGE_SIZE,
    hasMore: Boolean(page.hasMore),
    nextPage: page.hasMore ? page.nextPage : null,
    order: page.order || prev.order || 'asc',
    since: prev.since || null,
    oldestCreatedAt: minIso(prev.oldestCreatedAt, page.oldestCreatedAt),
    newestCreatedAt: maxIso(prev.newestCreatedAt, page.newestCreatedAt),
    maxId:
      page.maxId != null && (prev.maxId == null || page.maxId > prev.maxId)
        ? page.maxId
        : prev.maxId ?? page.maxId ?? null,
    loadedCount: Number.isFinite(totalLoaded) ? totalLoaded : page.loadedCount || 0,
  };
}

function sinceCursorFromMeta(meta) {
  if (meta?.newestCreatedAt) return meta.newestCreatedAt;
  return null;
}

const api = {
  DEFAULT_COMMENT_PAGE_SIZE,
  parseLinkNextPage,
  parseLinkLastPage,
  linkHasMore,
  buildCommentsListUrl,
  clampPerPage,
  mergeCommentsById,
  buildCommentsPageMeta,
  advanceCommentsMeta,
  sinceCursorFromMeta,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}
if (typeof globalThis !== 'undefined') {
  globalThis.PRModalCommentsPage = api;
}
})();


/* ---- modal/pure/review-threads.js ---- */

/* sw-iife */
(function () {

function githubRestUrl(path) {
  try {
    if (globalThis.PRGithubEndpoints && typeof globalThis.PRGithubEndpoints.githubRestUrl === 'function') {
      return globalThis.PRGithubEndpoints.githubRestUrl(path);
    }
  } catch (_) {}
  const p = String(path || '');
  return 'https://api.github.com' + (p.startsWith('/') ? p : '/' + p);
}
function githubGraphqlUrl() {
  try {
    if (globalThis.PRGithubEndpoints && typeof globalThis.PRGithubEndpoints.githubGraphqlUrl === 'function') {
      return globalThis.PRGithubEndpoints.githubGraphqlUrl();
    }
  } catch (_) {}
  return 'https://api.github.com/graphql';
}


  /**
   * Pure review-thread grouping, counts, resolve/reply request builders.
   */

  /**
   * Group review comments into threads by root (in_reply_to_id).
   * @param {Array} comments
   * @returns {Array<{ id, path, line, side, root, replies, resolved, threadNodeId }>}
   */
  function groupReviewThreads(comments) {
    const list = Array.isArray(comments) ? comments : [];
    const byId = new Map();
    for (const c of list) {
      if (c && c.id != null) byId.set(String(c.id), c);
    }
    const roots = [];
    const children = new Map();
    for (const c of list) {
      if (!c) continue;
      const parentId = c.inReplyToId ?? c.in_reply_to_id ?? null;
      if (parentId != null && byId.has(String(parentId))) {
        const key = String(parentId);
        if (!children.has(key)) children.set(key, []);
        children.get(key).push(c);
      } else {
        roots.push(c);
      }
    }
    return roots.map((root) => {
      const replies = (children.get(String(root.id)) || []).slice().sort((a, b) =>
        String(a.createdAt || a.created_at || '').localeCompare(
          String(b.createdAt || b.created_at || '')
        )
      );
      return {
        id: root.id,
        path: root.path || '',
        line: root.line ?? root.original_line ?? null,
        side: root.side || 'RIGHT',
        root,
        replies,
        resolved: Boolean(root.resolved ?? root.isResolved),
        outdated: Boolean(root.outdated),
        pending: Boolean(
          root.pending || replies.some(function (r) { return r && r.pending; })
        ),
        threadNodeId: root.threadNodeId || root.thread_id || root.pullRequestReviewThreadId || null,
        count: 1 + replies.length,
      };
    });
  }

  /**
   * Merge GraphQL review-thread metadata onto REST review comments.
   * GitHub REST list comments never includes thread GraphQL ids or isResolved;
   * threads come from repository.pullRequest.reviewThreads.
   *
   * @param {Array<{ id?: number|string }>} comments mapped REST comments
   * @param {Array<{ threadNodeId: string, resolved?: boolean, commentIds?: Array<number|string> }>} threads
   * @returns {Array}
   */
  function mergeReviewThreadMeta(comments, threads) {
    const list = Array.isArray(comments) ? comments : [];
    /** @type {Map<string, { threadNodeId: string, resolved: boolean }>} */
    const byCommentId = new Map();
    for (const t of Array.isArray(threads) ? threads : []) {
      if (!t || !t.threadNodeId) continue;
      const meta = {
        threadNodeId: String(t.threadNodeId),
        resolved: Boolean(t.resolved),
      };
      for (const id of t.commentIds || []) {
        if (id == null) continue;
        byCommentId.set(String(id), meta);
      }
    }
    return list.map((c) => {
      if (!c) return c;
      const meta = c.id != null ? byCommentId.get(String(c.id)) : null;
      if (!meta) {
        return {
          ...c,
          threadNodeId: c.threadNodeId || null,
          resolved: Boolean(c.resolved),
        };
      }
      return {
        ...c,
        threadNodeId: meta.threadNodeId,
        resolved: meta.resolved,
      };
    });
  }

  /**
   * Normalize GraphQL reviewThreads.nodes into merge-friendly rows.
   * @param {Array} nodes
   */
  function mapGraphqlReviewThreads(nodes) {
    if (!Array.isArray(nodes)) return [];
    return nodes
      .filter((t) => t && t.id)
      .map((t) => ({
        threadNodeId: t.id,
        resolved: Boolean(t.isResolved),
        commentIds: (t.comments?.nodes || [])
          .map((c) => c?.databaseId)
          .filter((id) => id != null),
      }));
  }

  /**
   * Count review threads (root comments) per file path.
   * @param {Array} comments
   * @returns {Map<string, number>}
   */
  function countReviewThreadsByPath(comments) {
    const threads = groupReviewThreads(comments);
    const map = new Map();
    for (const t of threads) {
      const p = t.path || '';
      if (!p) continue;
      map.set(p, (map.get(p) || 0) + 1);
    }
    return map;
  }

  function countUnresolvedReviewThreadsByPath(comments) {
    const threads = groupReviewThreads(comments);
    const map = new Map();
    for (const t of threads) {
      if (t.resolved) continue;
      const p = t.path || '';
      if (!p) continue;
      map.set(p, (map.get(p) || 0) + 1);
    }
    return map;
  }

  function countPendingReviewThreads(comments) {
    const threads = groupReviewThreads(comments);
    let n = 0;
    for (const t of threads) {
      if (t.pending) n += 1;
    }
    return n;
  }

  function countPendingReviewThreadsByPath(comments) {
    const map = new Map();
    const threads = groupReviewThreads(comments);
    for (const t of threads) {
      if (!t.pending) continue;
      const p = t.path || '';
      if (!p) continue;
      map.set(p, (map.get(p) || 0) + 1);
    }
    for (const c of Array.isArray(comments) ? comments : []) {
      if (!c || !c.pending) continue;
      const p = c.path || '';
      if (!p || map.has(p)) continue;
      map.set(p, 1);
    }
    return map;
  }

  function countReviewThreadTotals(comments, opts) {
    const o = opts && typeof opts === 'object' ? opts : {};
    const pathSet =
      o.allowedPaths instanceof Set
        ? o.allowedPaths
        : o.allowedPaths
          ? new Set(
              Array.isArray(o.allowedPaths)
                ? o.allowedPaths.map(String).filter(Boolean)
                : []
            )
          : null;
    const excludeOutdated = Boolean(o.excludeOutdated);
    const threads = groupReviewThreads(comments);
    let total = 0;
    let unresolved = 0;
    let resolved = 0;
    let pendingThreads = 0;
    for (const t of threads) {
      const p = t.path || '';
      if (!p) continue;
      if (pathSet && !pathSet.has(p)) continue;
      if (excludeOutdated && t.outdated) continue;
      total += 1;
      if (t.pending) pendingThreads += 1;
      if (t.resolved) resolved += 1;
      else if (!t.pending) unresolved += 1;
    }
    return { total, unresolved, resolved, pendingThreads };
  }

  function normalizeReviewCommentId(raw) {
    if (raw == null || raw === '') return null;
    if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
      return Math.floor(raw);
    }
    const s = String(raw).trim();
    if (!/^\d+$/.test(s)) return null;
    const n = Number(s);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  /**
   * Walk in_reply_to chain to the top-level review comment.
   * GitHub rejects replies-to-replies (422 Validation Failed).
   */
  function resolveRootReviewCommentId(comments, commentId) {
    const start = normalizeReviewCommentId(commentId);
    if (start == null) return null;
    const byId = new Map();
    for (const c of Array.isArray(comments) ? comments : []) {
      if (!c || c.id == null) continue;
      const id = normalizeReviewCommentId(c.id);
      if (id != null) byId.set(id, c);
    }
    let cur = byId.get(start) || null;
    if (!cur) return start;
    const seen = new Set();
    while (cur) {
      const id = normalizeReviewCommentId(cur.id);
      if (id == null || seen.has(id)) break;
      seen.add(id);
      const parentRaw = cur.inReplyToId ?? cur.in_reply_to_id ?? null;
      const parentId = normalizeReviewCommentId(parentRaw);
      if (parentId == null || !byId.has(parentId)) return id;
      cur = byId.get(parentId);
    }
    return start;
  }

  function buildReplyReviewThreadGraphql(threadNodeId, body) {
    return {
      method: 'POST',
      url: githubGraphqlUrl(),
      body: {
        query: `mutation($id:ID!,$body:String!){
  addPullRequestReviewThreadReply(input:{pullRequestReviewThreadId:$id,body:$body}){
    comment { databaseId body }
  }
}`,
        variables: {
          id: String(threadNodeId || ''),
          body: String(body || '').trim(),
        },
      },
    };
  }

  /**
   * REST fallback reply (no pending review).
   * POST /pulls/{n}/comments/{id}/replies
   */
  function buildReplyReviewCommentRequest(owner, repo, pullNumber, commentId, body) {
    const parentId = normalizeReviewCommentId(commentId);
    const text = String(body || '').trim();
    return {
      method: 'POST',
      url: githubRestUrl(`/repos/${owner}/${repo}/pulls/${pullNumber}/comments/${parentId ?? commentId}/replies`),
      body: { body: text },
    };
  }

  /**
   * GraphQL resolve / unresolve review thread.
   * @param {string} threadNodeId GraphQL node id (PRRT_…)
   * @param {boolean} resolved
   */
  function buildResolveThreadGraphql(threadNodeId, resolved = true) {
    const mutation = resolved
      ? `mutation($id:ID!){ resolveReviewThread(input:{threadId:$id}){ thread { id isResolved } } }`
      : `mutation($id:ID!){ unresolveReviewThread(input:{threadId:$id}){ thread { id isResolved } } }`;
    return {
      method: 'POST',
      url: githubGraphqlUrl(),
      body: {
        query: mutation,
        variables: { id: threadNodeId },
      },
    };
  }

  /**
   * Filter files by path query (case-insensitive substring).
   */
  function filterFilesByQuery(files, query) {
    const list = Array.isArray(files) ? files : [];
    const q = String(query || '')
      .trim()
      .toLowerCase();
    if (!q) return list.slice();
    return list.filter((f) => {
      const path = String(f.filename || f.path || '').toLowerCase();
      return path.includes(q);
    });
  }

  /**
   * Toggle path in a viewed set (immutable).
   * @param {Set<string>|string[]} viewed
   * @param {string} path
   * @returns {Set<string>}
   */
  function toggleViewedPath(viewed, path) {
    const next = viewed instanceof Set ? new Set(viewed) : new Set(viewed || []);
    const p = String(path || '');
    if (!p) return next;
    if (next.has(p)) next.delete(p);
    else next.add(p);
    return next;
  }

  function isPathViewed(viewed, path) {
    if (!path) return false;
    if (viewed instanceof Set) return viewed.has(path);
    if (Array.isArray(viewed)) return viewed.includes(path);
    return false;
  }

  const api = {
    groupReviewThreads,
    mergeReviewThreadMeta,
    mapGraphqlReviewThreads,
    countReviewThreadsByPath,
    countUnresolvedReviewThreadsByPath,
    countPendingReviewThreads,
    countPendingReviewThreadsByPath,
    countReviewThreadTotals,
    normalizeReviewCommentId,
    resolveRootReviewCommentId,
    buildReplyReviewThreadGraphql,
    buildReplyReviewCommentRequest,
    buildResolveThreadGraphql,
    filterFilesByQuery,
    toggleViewedPath,
    isPathViewed,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (typeof globalThis !== 'undefined') {
    globalThis.PRModalReviewThreads = api;
  }
})();


/* ---- modal/pure/pending-review.js ---- */

/* sw-iife */
(function () {
  /**
   * Pure pending (draft) review batch for multi-comment submit.
   * Comment path posts immediately; "start/add review" appends to batch.
   */

  /**
   * @typedef {{
   *   id: string,
   *   path: string,
   *   line: number,
   *   side?: string,
   *   startLine?: number,
   *   startSide?: string,
   *   body: string,
   * }} PendingComment
   */

  function createEmptyPendingReview() {
    return { comments: [], body: '' };
  }

  /**
   * @param {{ comments?: PendingComment[], body?: string }|null} batch
   * @param {PendingComment} comment
   */
  function addPendingComment(batch, comment) {
    const base = batch && Array.isArray(batch.comments) ? batch : createEmptyPendingReview();
    const body = String(comment?.body || '').trim();
    if (!body || !comment?.path || comment.line == null) {
      return { batch: base, added: false };
    }
    const id =
      comment.id ||
      `pc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const next = {
      body: base.body || '',
      comments: [
        ...base.comments,
        {
          id,
          path: comment.path,
          line: Number(comment.line),
          side: comment.side || 'RIGHT',
          startLine:
            comment.startLine != null && Number(comment.startLine) !== Number(comment.line)
              ? Number(comment.startLine)
              : undefined,
          startSide: comment.startSide || comment.side || 'RIGHT',
          body,
        },
      ],
    };
    return { batch: next, added: true };
  }

  function discardPendingReview() {
    return createEmptyPendingReview();
  }

  function setPendingReviewBody(batch, body) {
    const base = batch && Array.isArray(batch.comments) ? batch : createEmptyPendingReview();
    return { ...base, body: String(body || '') };
  }

  function pendingReviewCount(batch) {
    return Array.isArray(batch?.comments) ? batch.comments.length : 0;
  }

  /**
   * CTA label for pending batch: empty → "Start review", else "Add comment".
   * @param {{ comments?: unknown[] }|null} batch
   */
  function pendingReviewCtaLabel(batch) {
    return pendingReviewCount(batch) > 0 ? 'Add comment' : 'Start review';
  }

  /**
   * Shape GitHub create-review payload (with inline comments).
   * @param {{ comments?: PendingComment[], body?: string }} batch
   * @param {{ event: 'COMMENT'|'APPROVE'|'REQUEST_CHANGES', commitId?: string, body?: string }} opts
   */
  function buildPendingReviewSubmitPayload(batch, opts = {}) {
    const event = opts.event || 'COMMENT';
    if (!['COMMENT', 'APPROVE', 'REQUEST_CHANGES'].includes(event)) {
      return null;
    }
    const comments = (batch?.comments || []).map((c) => {
      const row = {
        path: c.path,
        body: c.body,
        line: Number(c.line),
        side: c.side || 'RIGHT',
      };
      if (c.startLine != null && Number(c.startLine) !== Number(c.line)) {
        row.start_line = Number(c.startLine);
        row.start_side = c.startSide || c.side || 'RIGHT';
      }
      return row;
    });
    const payload = {
      event,
      body: opts.body != null ? String(opts.body) : String(batch?.body || ''),
    };
    if (opts.commitId) payload.commit_id = opts.commitId;
    if (comments.length) payload.comments = comments;
    return payload;
  }

  const api = {
    createEmptyPendingReview,
    addPendingComment,
    discardPendingReview,
    setPendingReviewBody,
    pendingReviewCount,
    pendingReviewCtaLabel,
    buildPendingReviewSubmitPayload,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (typeof globalThis !== 'undefined') {
    globalThis.PRModalPendingReview = api;
  }
})();


/* ---- modal/pure/pr-edit-api.js ---- */

/**
 * Pure request builders for PR metadata edits, comment edits, and suggestion apply.
 * Unit-tested without network; fetch layer uses the same shapes.
 */
(function () {

function githubRestUrl(path) {
  try {
    if (globalThis.PRGithubEndpoints && typeof globalThis.PRGithubEndpoints.githubRestUrl === 'function') {
      return globalThis.PRGithubEndpoints.githubRestUrl(path);
    }
  } catch (_) {}
  const p = String(path || '');
  return 'https://api.github.com' + (p.startsWith('/') ? p : '/' + p);
}
function githubGraphqlUrl() {
  try {
    if (globalThis.PRGithubEndpoints && typeof globalThis.PRGithubEndpoints.githubGraphqlUrl === 'function') {
      return globalThis.PRGithubEndpoints.githubGraphqlUrl();
    }
  } catch (_) {}
  return 'https://api.github.com/graphql';
}



function buildUpdatePullRequest(owner, repo, pullNumber, fields = {}) {
  const body = {};
  if (fields.title != null) body.title = String(fields.title);
  if (fields.body != null) body.body = String(fields.body);
  if (fields.base != null) body.base = String(fields.base);
  if (fields.state != null) body.state = fields.state === 'closed' ? 'closed' : 'open';
  return {
    method: 'PATCH',
    url: githubRestUrl(`/repos/${owner}/${repo}/pulls/${pullNumber}`),
    body,
  };
}

function buildEditIssueComment(owner, repo, commentId, body) {
  return {
    method: 'PATCH',
    url: githubRestUrl(`/repos/${owner}/${repo}/issues/comments/${commentId}`),
    body: { body: String(body || '') },
  };
}

function buildEditReviewComment(owner, repo, commentId, body) {
  return {
    method: 'PATCH',
    url: githubRestUrl(`/repos/${owner}/${repo}/pulls/comments/${commentId}`),
    body: { body: String(body || '') },
  };
}

function buildRequestReviewers(owner, repo, pullNumber, { reviewers = [], teamReviewers = [] } = {}) {
  return {
    method: 'POST',
    url: githubRestUrl(`/repos/${owner}/${repo}/pulls/${pullNumber}/requested_reviewers`),
    body: {
      reviewers: reviewers.slice(),
      team_reviewers: teamReviewers.slice(),
    },
  };
}

function buildRemoveReviewers(owner, repo, pullNumber, { reviewers = [], teamReviewers = [] } = {}) {
  return {
    method: 'DELETE',
    url: githubRestUrl(`/repos/${owner}/${repo}/pulls/${pullNumber}/requested_reviewers`),
    body: {
      reviewers: reviewers.slice(),
      team_reviewers: teamReviewers.slice(),
    },
  };
}

function buildSetAssignees(owner, repo, issueNumber, assignees) {
  return {
    method: 'POST',
    url: githubRestUrl(`/repos/${owner}/${repo}/issues/${issueNumber}/assignees`),
    body: { assignees: (assignees || []).slice() },
  };
}

function buildRemoveAssignees(owner, repo, issueNumber, assignees) {
  return {
    method: 'DELETE',
    url: githubRestUrl(`/repos/${owner}/${repo}/issues/${issueNumber}/assignees`),
    body: { assignees: (assignees || []).slice() },
  };
}

function buildSetLabels(owner, repo, issueNumber, labels) {
  return {
    method: 'PUT',
    url: githubRestUrl(`/repos/${owner}/${repo}/issues/${issueNumber}/labels`),
    body: { labels: (labels || []).slice() },
  };
}

/** Merge PR via REST. mergeMethod: merge | squash | rebase */
function buildMergePullRequest(owner, repo, pullNumber, { mergeMethod = 'merge', commitTitle, commitMessage } = {}) {
  const body = { merge_method: mergeMethod };
  if (commitTitle != null) body.commit_title = String(commitTitle);
  if (commitMessage != null) body.commit_message = String(commitMessage);
  return {
    method: 'PUT',
    url: githubRestUrl(`/repos/${owner}/${repo}/pulls/${pullNumber}/merge`),
    body,
  };
}

/** Update PR head branch with latest base (update branch button). */
function buildUpdateBranch(owner, repo, pullNumber, { expectedHeadSha } = {}) {
  const body = {};
  if (expectedHeadSha) body.expected_head_sha = String(expectedHeadSha);
  return {
    method: 'PUT',
    url: githubRestUrl(`/repos/${owner}/${repo}/pulls/${pullNumber}/update-branch`),
    body,
  };
}

/**
 * Issue/PR subscription via GraphQL updateSubscription
 * (REST /issues/{n}/subscription is 404 / removed for many tokens).
 */
function buildSetSubscription(
  owner,
  repo,
  issueNumber,
  { subscribed = true, ignored = false, nodeId = null } = {}
) {
  const state = ignored ? 'IGNORED' : subscribed ? 'SUBSCRIBED' : 'UNSUBSCRIBED';
  return {
    method: 'POST',
    url: githubGraphqlUrl(),
    body: {
      query: `mutation($id:ID!,$state:SubscriptionState!){
  updateSubscription(input:{subscribableId:$id, state:$state}) {
    subscribable {
      ... on PullRequest { id viewerSubscription }
      ... on Issue { id viewerSubscription }
    }
  }
}`,
      variables: {
        id: String(nodeId || ''),
        state,
      },
    },
  };
}

function buildDeleteSubscription(owner, repo, issueNumber, nodeId = null) {
  return buildSetSubscription(owner, repo, issueNumber, {
    subscribed: false,
    ignored: false,
    nodeId,
  });
}

/** Set or clear milestone on the PR issue. */
function buildSetMilestone(owner, repo, issueNumber, milestoneNumber) {
  return {
    method: 'PATCH',
    url: githubRestUrl(`/repos/${owner}/${repo}/issues/${issueNumber}`),
    body: { milestone: milestoneNumber == null ? null : Number(milestoneNumber) },
  };
}

/**
 * GraphQL mutation names for draft stage (need pullRequest node id).
 * @param {'draft'|'ready'} stage
 */
function buildDraftStageGraphql(stage, pullRequestId) {
  const id = String(pullRequestId || '');
  if (stage === 'ready') {
    return {
      query: `mutation($id:ID!){markPullRequestReadyForReview(input:{pullRequestId:$id}){pullRequest{id isDraft}}}`,
      variables: { id },
    };
  }
  return {
    query: `mutation($id:ID!){convertPullRequestToDraft(input:{pullRequestId:$id}){pullRequest{id isDraft}}}`,
    variables: { id },
  };
}

/** @returns {boolean|null} */
function draftFromStageGraphqlData(data) {
  if (!data || typeof data !== 'object') return null;
  const pr =
    (data.markPullRequestReadyForReview &&
      data.markPullRequestReadyForReview.pullRequest) ||
    (data.convertPullRequestToDraft &&
      data.convertPullRequestToDraft.pullRequest) ||
    data.pullRequest ||
    null;
  if (!pr || typeof pr !== 'object') return null;
  if (typeof pr.isDraft === 'boolean') return pr.isDraft;
  if (typeof pr.draft === 'boolean') return pr.draft;
  return null;
}

/**
 * Extract linked issue numbers from PR body (closes/fixes/refs #N and bare #N).
 * @returns {number[]}
 */
function parseLinkedIssueNumbers(body) {
  const text = body == null ? '' : String(body);
  const nums = new Set();
  const re = /(?:(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+)?#(\d+)/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > 0) nums.add(n);
  }
  return [...nums].sort((a, b) => a - b);
}

/**
 * Logins to POST for "re-request review".
 * GitHub 422s if you re-POST reviewers who are already in requested_reviewers.
 * Target: past review authors (and optional extras) who are not currently pending
 * and are not the PR author.
 *
 * @param {{
 *   requestedReviewers?: string[],
 *   reviews?: Array<{ author?: string }>,
 *   author?: string,
 *   extraLogins?: string[],
 * }} detail
 * @returns {string[]}
 */
function buildRerequestReviewerLogins(detail) {
  const d = detail || {};
  const pending = new Set(
    (d.requestedReviewers || [])
      .map((x) => String(x || '').trim())
      .filter(Boolean)
      .map((x) => x.toLowerCase())
  );
  const author = String(d.author || '')
    .trim()
    .toLowerCase();
  const out = [];
  const seen = new Set();

  function isBotLogin(login, review) {
    if (review && (review.isBot === true || String(review.type || '').toLowerCase() === 'bot')) {
      return true;
    }
    const key = String(login || '').toLowerCase();
    if (d.actorIsBot && typeof d.actorIsBot === 'object') {
      if (d.actorIsBot instanceof Map) {
        if (d.actorIsBot.get(key)) return true;
      } else if (d.actorIsBot[key]) return true;
    }
    return /\[bot\]$/i.test(String(login || ''));
  }

  function consider(login, review) {
    const raw = String(login || '').trim();
    if (!raw) return;
    const key = raw.toLowerCase();
    if (author && key === author) return;
    if (pending.has(key)) return; // already requested → would 422
    if (isBotLogin(raw, review)) return; // bots cannot be re-requested
    if (seen.has(key)) return;
    seen.add(key);
    out.push(raw);
  }

  for (const r of d.reviews || []) {
    consider(r?.author, r);
  }
  for (const login of d.extraLogins || []) {
    consider(login);
  }
  return out;
}

/**
 * Parse GitHub ```suggestion fences from a comment body.
 * @returns {Array<{ content: string, raw: string }>}
 */
function parseSuggestionFences(body) {
  const text = body == null ? '' : String(body);
  const out = [];
  const re = /```suggestion[^\n]*\r?\n([\s\S]*?)```/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    out.push({ content: m[1].replace(/\n$/, ''), raw: m[0] });
  }
  return out;
}

/**
 * Apply suggestion lines into full file content (1-based inclusive line range on RIGHT side of the new file).
 * Replaces lines [startLine, endLine] with suggestion lines (may change line count).
 * @param {string} fileContent
 * @param {{ startLine: number, endLine: number, suggestion: string }} range
 */
function applySuggestionToFileContent(fileContent, { startLine, endLine, suggestion }) {
  const lines = String(fileContent ?? '').split('\n');
  // Preserve trailing newline semantics: split keeps last empty if file ends with \n
  const endsWithNl = String(fileContent ?? '').endsWith('\n');
  if (endsWithNl && lines[lines.length - 1] === '') lines.pop();

  const start = Math.max(1, Number(startLine) || 1);
  const end = Math.max(start, Number(endLine) || start);
  const sugLines = String(suggestion ?? '').split('\n');
  // Drop final empty from suggestion if it was trailing newline only
  if (sugLines.length && sugLines[sugLines.length - 1] === '' && suggestion.endsWith('\n')) {
    sugLines.pop();
  }

  const before = lines.slice(0, start - 1);
  const after = lines.slice(end);
  const next = [...before, ...sugLines, ...after];
  let out = next.join('\n');
  if (endsWithNl || out.length) out = out.endsWith('\n') ? out : `${out}\n`;
  return out;
}

/**
 * Contents API PUT shape for committing applied suggestion on head branch.
 */
function buildApplySuggestionCommitRequest(
  owner,
  repo,
  {
    path,
    branch,
    contentBase64,
    sha,
    message,
  }
) {
  return {
    method: 'PUT',
    url: githubRestUrl(`/repos/${owner}/${repo}/contents/${path
      .split('/')
      .map(encodeURIComponent)
      .join('/')}`),
    body: {
      message: message || `Apply suggestion to ${path}`,
      content: contentBase64,
      branch,
      sha,
    },
  };
}

/**
 * Map unified leave-review form button → GitHub review event or issue comment.
 * @param {'comment'|'approve'|'request_changes'} action
 */
function mapLeaveReviewAction(action) {
  const a = String(action || '').toLowerCase();
  if (a === 'approve') return { kind: 'review', event: 'APPROVE' };
  if (a === 'request_changes' || a === 'request-changes') {
    return { kind: 'review', event: 'REQUEST_CHANGES' };
  }
  return { kind: 'issue-comment', event: 'COMMENT' };
}

function normalizeGithubLogin(login) {
  return String(login || '')
    .trim()
    .replace(/^@/, '')
    .toLowerCase();
}

/**
 * True when the signed-in viewer is the PR author.
 * GitHub rejects APPROVE / REQUEST_CHANGES on your own PR (HTTP 422).
 * @param {{ author?: string, viewerLogin?: string }|null|undefined} detail
 */
function isViewerPrAuthor(detail) {
  const author = normalizeGithubLogin(detail?.author);
  const viewer = normalizeGithubLogin(detail?.viewerLogin);
  return Boolean(author && viewer && author === viewer);
}

/** Approve / Request changes only when viewer is not the author. */
function canSubmitReviewVerdict(detail) {
  return !isViewerPrAuthor(detail);
}

function isReviewVerdictKind(kind) {
  const k = String(kind || '').toLowerCase();
  return k === 'approve' || k === 'request_changes' || k === 'request-changes';
}

/**
 * Map GitHub REST review-comment payload → app shape (optimistic UI).
 * Used after postReviewComment / replyToReviewComment so diff virtual rows
 * and groupReviewThreads update before the next full refresh.
 * @param {object|null} raw REST response body
 * @param {object} [fallback] path/line/body when raw is partial
 */
function mapRestReviewComment(raw, fallback = {}) {
  if (!raw && !String(fallback.body || '').trim()) return null;
  const r = raw || {};
  const subjectRaw = String(
    r.subject_type || r.subjectType || fallback.subjectType || fallback.subject_type || ''
  ).toLowerCase();
  const isFile =
    subjectRaw === 'file' ||
    (fallback.subjectType === 'file' && subjectRaw !== 'line');
  // PENDING comments often omit line and only have position / original_line
  const lineRaw = isFile
    ? null
    : r.line ??
      r.original_line ??
      (r.position != null && Number.isFinite(Number(r.position))
        ? Number(r.position)
        : null) ??
      fallback.line ??
      null;
  return {
    id: r.id ?? fallback.id ?? null,
    author: r.user?.login || fallback.author || '',
    body: r.body || fallback.body || '',
    path: r.path || fallback.path || '',
    line: lineRaw != null ? Number(lineRaw) : null,
    originalLine: isFile ? null : r.original_line ?? null,
    startLine: isFile ? null : r.start_line ?? fallback.startLine ?? null,
    side: r.side || fallback.side || 'RIGHT',
    startSide: r.start_side || null,
    diffHunk: r.diff_hunk || '',
    createdAt: r.created_at || fallback.createdAt || null,
    inReplyToId: r.in_reply_to_id ?? fallback.inReplyToId ?? null,
    nodeId: r.node_id || null,
    threadNodeId: r.threadNodeId || fallback.threadNodeId || null,
    reviewId:
      r.pull_request_review_id != null
        ? Number(r.pull_request_review_id)
        : fallback.reviewId != null
          ? Number(fallback.reviewId)
          : null,
    resolved: false,
    pending: Boolean(r.pending ?? fallback.pending),
    pendingReviewId: r.pendingReviewId ?? fallback.pendingReviewId ?? null,
    subjectType: isFile ? 'file' : 'line',
  };
}

/**
 * Map GitHub REST issue comment payload → app shape.
 */
function mapRestIssueComment(raw, fallback = {}) {
  if (!raw && !fallback.body) return null;
  const r = raw || {};
  return {
    id: r.id ?? fallback.id ?? null,
    author: r.user?.login || fallback.author || '',
    body: r.body || fallback.body || '',
    createdAt: r.created_at || fallback.createdAt || null,
    htmlUrl: r.html_url || null,
  };
}

/**
 * Append an optimistic review comment into a detail-like snapshot.
 * @param {{ reviewComments?: Array }} detail
 * @param {object|null} comment mapped comment
 */
function appendOptimisticReviewComment(detail, comment) {
  const base = detail || {};
  if (!comment || comment.id == null) return base;
  const list = Array.isArray(base.reviewComments) ? base.reviewComments.slice() : [];
  if (list.some((c) => String(c.id) === String(comment.id))) {
    return { ...base, reviewComments: list };
  }
  list.push(comment);
  return { ...base, reviewComments: list };
}

const api = {
  buildUpdatePullRequest,
  buildEditIssueComment,
  buildEditReviewComment,
  buildRequestReviewers,
  buildRemoveReviewers,
  buildSetAssignees,
  buildRemoveAssignees,
  buildSetLabels,
  buildMergePullRequest,
  buildUpdateBranch,
  buildSetSubscription,
  buildDeleteSubscription,
  buildSetMilestone,
  buildDraftStageGraphql,
  draftFromStageGraphqlData,
  parseLinkedIssueNumbers,
  buildRerequestReviewerLogins,
  parseSuggestionFences,
  applySuggestionToFileContent,
  buildApplySuggestionCommitRequest,
  mapLeaveReviewAction,
  normalizeGithubLogin,
  isViewerPrAuthor,
  canSubmitReviewVerdict,
  isReviewVerdictKind,
  mapRestReviewComment,
  mapRestIssueComment,
  appendOptimisticReviewComment,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}
if (typeof globalThis !== 'undefined') {
  globalThis.PRModalPrEditApi = api;
}
})();


/* ---- modal/pure/checks.js ---- */

/* sw-iife */
(function () {
  /**
   * Normalize GitHub commit checks: keep only the latest entry per identity.
   * Commit status contexts and Check Runs can accumulate re-runs / duplicates;
   * GitHub's PR UI surfaces the most recent action list only.
   */

  function parseTime(value) {
    if (value == null || value === '') return 0;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const n = Date.parse(String(value));
    return Number.isFinite(n) ? n : 0;
  }

  function statusKey(s) {
    const ctx = String(s?.context || '')
      .trim()
      .toLowerCase();
    if (ctx) return ctx;
    const desc = String(s?.description || '')
      .trim()
      .toLowerCase();
    if (desc) return `desc:${desc}`;
    return '';
  }

  function statusTime(s) {
    return (
      parseTime(s?.updatedAt ?? s?.updated_at) ||
      parseTime(s?.createdAt ?? s?.created_at) ||
      0
    );
  }

  /**
   * Keep the latest status object per context.
   * @param {Array} statuses
   * @returns {Array}
   */
  function distinctStatuses(statuses) {
    const list = Array.isArray(statuses) ? statuses : [];
    /** @type {Map<string, any>} */
    const byKey = new Map();
    let anon = 0;
    for (const s of list) {
      if (!s || typeof s !== 'object') continue;
      let key = statusKey(s);
      if (!key) key = `__anon_status_${anon++}`;
      const prev = byKey.get(key);
      if (!prev || statusTime(s) >= statusTime(prev)) {
        byKey.set(key, s);
      }
    }
    return [...byKey.values()];
  }

  function checkRunKey(r) {
    const name = String(r?.name || '')
      .trim()
      .toLowerCase();
    const app = String(
      r?.appSlug || r?.app_slug || r?.app?.slug || r?.app?.name || ''
    )
      .trim()
      .toLowerCase();
    if (!name) return '';
    // Same-named jobs from different apps stay separate
    return app ? `${app}::${name}` : name;
  }

  function checkRunTime(r) {
    return (
      parseTime(r?.completedAt ?? r?.completed_at) ||
      parseTime(r?.startedAt ?? r?.started_at) ||
      // Prefer higher numeric id as recency proxy when timestamps missing
      (Number.isFinite(Number(r?.id)) ? Number(r.id) : 0)
    );
  }

  /**
   * Keep the latest check run per name (+ app).
   * @param {Array} runs
   * @returns {Array}
   */
  function distinctCheckRuns(runs) {
    const list = Array.isArray(runs) ? runs : [];
    /** @type {Map<string, any>} */
    const byKey = new Map();
    let anon = 0;
    for (const r of list) {
      if (!r || typeof r !== 'object') continue;
      let key = checkRunKey(r);
      if (!key) key = `__anon_run_${anon++}`;
      const prev = byKey.get(key);
      if (!prev) {
        byKey.set(key, r);
        continue;
      }
      const tNew = checkRunTime(r);
      const tOld = checkRunTime(prev);
      if (
        tNew > tOld ||
        (tNew === tOld && Number(r.id || 0) > Number(prev.id || 0))
      ) {
        byKey.set(key, r);
      }
    }
    return [...byKey.values()];
  }

  /**
   * Derive overall state from statuses + check runs (after distinct).
   * @param {Array} statuses
   * @param {Array} checkRuns
   * @param {string} [fallback]
   */
  function deriveChecksState(statuses, checkRuns, fallback = 'unknown') {
    const st = Array.isArray(statuses) ? statuses : [];
    const runs = Array.isArray(checkRuns) ? checkRuns : [];
    // GitHub combined-status API returns state:"pending" with total_count:0 when
    // the commit has no status contexts. That is not a real in-progress check.
    if (!st.length && !runs.length) return 'unknown';

    const statusStates = st.map((s) => String(s?.state || '').toLowerCase());
    const conclusions = runs.map((r) => String(r?.conclusion || '').toLowerCase());
    const runStatuses = runs.map((r) => String(r?.status || '').toLowerCase());

    const anyFailure =
      statusStates.some((s) => s === 'failure' || s === 'error') ||
      conclusions.some(
        (c) =>
          c === 'failure' ||
          c === 'timed_out' ||
          c === 'startup_failure' ||
          c === 'cancelled'
      );
    if (anyFailure) return 'failure';

    const anyPending =
      statusStates.some((s) => s === 'pending') ||
      runStatuses.some(
        (s) => s === 'queued' || s === 'in_progress' || s === 'waiting'
      ) ||
      conclusions.some((c) => c === '' || c === 'null' || c === 'action_required');
    if (anyPending) return 'pending';

    const anySuccess =
      statusStates.some((s) => s === 'success') ||
      conclusions.some(
        (c) => c === 'success' || c === 'neutral' || c === 'skipped'
      );
    if (anySuccess) return 'success';

    return fallback || 'unknown';
  }

  /**
   * Normalize a checks payload: distinct latest statuses + check runs, recompute counts/state.
   * @param {object|null|undefined} checks
   * @returns {{ state: string, totalCount: number, statuses: Array, checkRuns: Array }}
   */
  function normalizeChecks(checks) {
    const raw = checks && typeof checks === 'object' ? checks : {};
    const statuses = distinctStatuses(raw.statuses);
    const checkRuns = distinctCheckRuns(raw.checkRuns || raw.check_runs);
    // Never trust combined-status "pending" when there are zero contexts/runs.
    const fallback =
      statuses.length || checkRuns.length
        ? String(raw.state || 'unknown')
        : 'unknown';
    const state = deriveChecksState(statuses, checkRuns, fallback);
    return {
      state,
      totalCount: statuses.length + checkRuns.length,
      statuses,
      checkRuns,
    };
  }

  /**
   * GitHub merge-box bucket for one check item.
   * @returns {'failure'|'pending'|'skipped'|'success'}
   */
  function classifyCheckOutcome(item) {
    if (!item || typeof item !== 'object') return 'pending';
    if (item.kind === 'status' || item.state != null) {
      const st = String(item.state || '').toLowerCase();
      if (st === 'failure' || st === 'error') return 'failure';
      if (st === 'success') return 'success';
      if (st === 'pending') return 'pending';
      // expected / unknown → pending
      return 'pending';
    }
    const conclusion = String(item.conclusion || '').toLowerCase();
    const status = String(item.status || '').toLowerCase();
    if (
      conclusion === 'failure' ||
      conclusion === 'timed_out' ||
      conclusion === 'startup_failure' ||
      conclusion === 'cancelled'
    ) {
      return 'failure';
    }
    if (conclusion === 'skipped') return 'skipped';
    if (conclusion === 'success' || conclusion === 'neutral') return 'success';
    if (
      status === 'queued' ||
      status === 'in_progress' ||
      status === 'waiting' ||
      status === 'requested' ||
      status === 'pending' ||
      conclusion === '' ||
      conclusion === 'null' ||
      conclusion === 'action_required'
    ) {
      return 'pending';
    }
    return 'pending';
  }

  /** Compact duration: 9m, 22s, 1h 2m */
  function formatDurationMs(ms) {
    const n = Number(ms);
    if (!Number.isFinite(n) || n < 0) return '';
    if (n < 1000) return '<1s';
    const sec = Math.round(n / 1000);
    if (sec < 60) return `${sec}s`;
    const min = Math.floor(sec / 60);
    const remSec = sec % 60;
    if (min < 60) return remSec ? `${min}m ${remSec}s` : `${min}m`;
    const hr = Math.floor(min / 60);
    const remMin = min % 60;
    return remMin ? `${hr}h ${remMin}m` : `${hr}h`;
  }

  /** Relative time for “Skipped 20 minutes ago” */
  function formatRelativeAgo(iso, nowMs) {
    const t = parseTime(iso);
    if (!t) return '';
    const now = Number.isFinite(nowMs) ? nowMs : Date.now();
    let sec = Math.max(0, Math.round((now - t) / 1000));
    if (sec < 60) return 'just now';
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min} minute${min === 1 ? '' : 's'} ago`;
    const hr = Math.floor(min / 60);
    if (hr < 48) return `${hr} hour${hr === 1 ? '' : 's'} ago`;
    const day = Math.floor(hr / 24);
    return `${day} day${day === 1 ? '' : 's'} ago`;
  }

  /**
   * Human summary next to the check name (GitHub merge-box style).
   * @param {{ outcome: string, description?: string, startedAt?: string, completedAt?: string, updatedAt?: string }} item
   * @param {number} [nowMs]
   */
  function formatCheckSummary(item, nowMs) {
    if (!item) return '';
    const desc = String(item.description || '').trim();
    const start = parseTime(item.startedAt);
    const end = parseTime(item.completedAt) || parseTime(item.updatedAt);
    const duration =
      start && end && end >= start
        ? formatDurationMs(end - start)
        : start && !end
          ? formatDurationMs((Number.isFinite(nowMs) ? nowMs : Date.now()) - start)
          : '';
    const outcome = item.outcome || classifyCheckOutcome(item);

    if (outcome === 'failure') {
      if (duration) return `Failing after ${duration}`;
      return desc || 'Failing';
    }
    if (outcome === 'success') {
      if (duration) return `Successful in ${duration}`;
      return desc || 'Successful';
    }
    if (outcome === 'skipped') {
      const when = formatRelativeAgo(item.completedAt || item.updatedAt, nowMs);
      if (when) return `Skipped ${when}`;
      return desc || 'Skipped';
    }
    // pending
    if (statusIsInProgress(item)) {
      return duration ? `In progress — ${duration}` : desc || 'In progress';
    }
    return desc || 'Expected — Waiting for status to be reported';
  }

  function statusIsInProgress(item) {
    const status = String(item?.status || '').toLowerCase();
    return status === 'in_progress' || status === 'queued' || status === 'waiting';
  }

  /**
   * Flatten statuses + check runs into display rows for the merge box.
   * @param {object|null|undefined} checks
   * @param {{ nowMs?: number }} [opts]
   * @returns {{ state: string, totalCount: number, groups: Array<{ key: string, label: string, outcome: string, items: Array }> }}
   */
  function buildMergeBoxCheckGroups(checks, opts) {
    const nowMs =
      opts && Number.isFinite(opts.nowMs) ? opts.nowMs : Date.now();
    const n = normalizeChecks(checks);
    /** @type {Array<any>} */
    const rows = [];

    for (const s of n.statuses || []) {
      const outcome = classifyCheckOutcome({ kind: 'status', state: s.state });
      const row = {
        id: `status:${s.context || rows.length}`,
        kind: 'status',
        name: s.context || s.description || 'status',
        outcome,
        description: s.description || '',
        url: s.targetUrl || s.target_url || '',
        startedAt: s.createdAt || s.created_at || '',
        completedAt: s.updatedAt || s.updated_at || '',
        updatedAt: s.updatedAt || s.updated_at || '',
        required: Boolean(s.required),
      };
      row.summary = formatCheckSummary(row, nowMs);
      rows.push(row);
    }

    for (const r of n.checkRuns || []) {
      const outcome = classifyCheckOutcome(r);
      const app = String(r.appName || r.app?.name || '').trim();
      const name = String(r.name || 'check').trim() || 'check';
      // Prefer raw job name; app prefix only when it adds context (not already in name)
      const displayName =
        app && !name.toLowerCase().startsWith(app.toLowerCase())
          ? `${app} / ${name}`
          : name;
      const row = {
        id: `run:${r.id || name}`,
        kind: 'run',
        name: displayName,
        outcome,
        description: '',
        url: r.htmlUrl || r.html_url || r.detailsUrl || r.details_url || '',
        startedAt: r.startedAt || r.started_at || '',
        completedAt: r.completedAt || r.completed_at || '',
        updatedAt: r.completedAt || r.completed_at || r.startedAt || '',
        required: Boolean(r.required),
      };
      row.summary = formatCheckSummary(row, nowMs);
      rows.push(row);
    }

    const buckets = {
      failure: [],
      pending: [],
      skipped: [],
      success: [],
    };
    for (const row of rows) {
      const b = buckets[row.outcome] || buckets.pending;
      b.push(row);
    }

    /** @type {Array<{ key: string, label: string, outcome: string, items: Array }>} */
    const groups = [];
    const pushGroup = (key, outcome, singular, plural, items) => {
      if (!items.length) return;
      const label =
        items.length === 1 ? `1 ${singular}` : `${items.length} ${plural}`;
      groups.push({ key, label, outcome, items });
    };
    // GitHub order: failing → expected/pending → skipped → successful
    pushGroup('failure', 'failure', 'failing check', 'failing checks', buckets.failure);
    pushGroup('pending', 'pending', 'expected check', 'expected checks', buckets.pending);
    pushGroup('skipped', 'skipped', 'skipped check', 'skipped checks', buckets.skipped);
    pushGroup(
      'success',
      'success',
      'successful check',
      'successful checks',
      buckets.success
    );

    return {
      state: n.state,
      totalCount: rows.length,
      groups,
    };
  }

  /** Headline under merge-box checks section (GitHub copy). */
  function mergeBoxChecksHeadline(state, totalCount) {
    const st = String(state || '').toLowerCase();
    if (!totalCount) return null;
    if (st === 'failure' || st === 'error') return 'Some checks were not successful';
    if (st === 'pending') return 'Some checks haven’t completed yet';
    if (st === 'success') return 'All checks have passed';
    return 'Checks';
  }

  /**
   * Count outcomes over normalized statuses + check runs for summary icons/popover.
   * @param {object|null|undefined} checks
   * @returns {{ total: number, success: number, failure: number, pending: number, skipped: number, state: string }}
   */
  function summarizeCheckCounts(checks) {
    const n = normalizeChecks(checks);
    let success = 0;
    let failure = 0;
    let pending = 0;
    let skipped = 0;
    for (const s of n.statuses || []) {
      const o = classifyCheckOutcome({ kind: 'status', state: s?.state });
      if (o === 'failure') failure += 1;
      else if (o === 'success') success += 1;
      else if (o === 'skipped') skipped += 1;
      else pending += 1;
    }
    for (const r of n.checkRuns || []) {
      const o = classifyCheckOutcome(r);
      if (o === 'failure') failure += 1;
      else if (o === 'success') success += 1;
      else if (o === 'skipped') skipped += 1;
      else pending += 1;
    }
    const total = success + failure + pending + skipped;
    return {
      total,
      success,
      failure,
      pending,
      skipped,
      state: n.state || 'unknown',
    };
  }

  /**
   * Human popover / aria copy for check counts.
   * @param {{ total?: number, success?: number, failure?: number, pending?: number, skipped?: number, state?: string }|null|undefined} summary
   */
  function formatChecksCountLabel(summary) {
    const s = summary && typeof summary === 'object' ? summary : {};
    const total = Number(s.total) || 0;
    const success = Number(s.success) || 0;
    const failure = Number(s.failure) || 0;
    const pending = Number(s.pending) || 0;
    const skipped = Number(s.skipped) || 0;
    if (!total) {
      // Empty payload — GitHub may still report combined state "pending"
      return 'No checks';
    }
    const parts = [
      `${total} check${total === 1 ? '' : 's'}`,
      `${success} succeeded`,
      `${failure} failed`,
      `${pending} in progress`,
    ];
    if (skipped > 0) parts.push(`${skipped} skipped`);
    return parts.join(' · ');
  }

  /**
   * Names of individual checks bucketed by outcome (for stacked-icon tips).
   * @returns {{ failure: string[], pending: string[], success: string[], skipped: string[], state: string }}
   */
  function listCheckNamesByOutcome(checks) {
    const n = normalizeChecks(checks);
    /** @type {{ failure: string[], pending: string[], success: string[], skipped: string[] }} */
    const groups = { failure: [], pending: [], success: [], skipped: [] };
    for (const s of n.statuses || []) {
      const o = classifyCheckOutcome({ kind: 'status', state: s?.state });
      const name = String(s?.context || s?.description || 'status').trim() || 'status';
      const bucket = groups[o] || groups.pending;
      bucket.push(name);
    }
    for (const r of n.checkRuns || []) {
      const o = classifyCheckOutcome(r);
      const app = String(r?.appName || r?.app?.name || '').trim();
      const job = String(r?.name || 'check').trim() || 'check';
      const name =
        app && !job.toLowerCase().startsWith(app.toLowerCase())
          ? `${app} / ${job}`
          : job;
      const bucket = groups[o] || groups.pending;
      bucket.push(name);
    }
    return {
      failure: groups.failure,
      pending: groups.pending,
      success: groups.success,
      skipped: groups.skipped,
      state: n.state || 'unknown',
    };
  }

  /**
   * Popover text for one outcome group (e.g. failed checks).
   * @param {'failure'|'pending'|'success'|'skipped'} outcome
   * @param {string[]} names
   */
  function formatCheckGroupTip(outcome, names) {
    const list = Array.isArray(names) ? names.filter(Boolean) : [];
    const n = list.length;
    const headings = {
      failure: n === 1 ? '1 failed' : `${n} failed`,
      pending: n === 1 ? '1 in progress' : `${n} in progress`,
      success: n === 1 ? '1 succeeded' : `${n} succeeded`,
      skipped: n === 1 ? '1 skipped' : `${n} skipped`,
    };
    const head = headings[outcome] || `${n} checks`;
    if (!n) return head;
    // Cap long lists so tips stay readable
    const max = 12;
    const shown = list.slice(0, max);
    const more = n - shown.length;
    const body = shown.map((name) => `· ${name}`).join('\n');
    return more > 0 ? `${head}\n${body}\n· +${more} more` : `${head}\n${body}`;
  }

  const api = {
    parseTime,
    statusKey,
    statusTime,
    distinctStatuses,
    checkRunKey,
    checkRunTime,
    distinctCheckRuns,
    deriveChecksState,
    normalizeChecks,
    classifyCheckOutcome,
    formatDurationMs,
    formatRelativeAgo,
    formatCheckSummary,
    buildMergeBoxCheckGroups,
    mergeBoxChecksHeadline,
    summarizeCheckCounts,
    formatChecksCountLabel,
    listCheckNamesByOutcome,
    formatCheckGroupTip,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (typeof globalThis !== 'undefined') {
    globalThis.PRModalChecks = api;
  }
})();


/* ---- storage.ts ---- */

;(function(){
const TOKEN_KEY = "githubToken";
const HOST_ACCOUNTS_KEY = "hostAccounts";
const PREFS_KEY = "extensionPrefs";
const DEFAULT_PREFS = {
  fastReview: true,
  reverseComments: true,
  autoOpenEmbed: true,
  singleFileMode: false
};
function getStorageArea(storageApi2 = globalThis.chrome?.storage?.local) {
  return storageApi2 || null;
}
function normalizePrefs(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  return {
    fastReview: typeof src.fastReview === "boolean" ? src.fastReview : DEFAULT_PREFS.fastReview,
    reverseComments: typeof src.reverseComments === "boolean" ? src.reverseComments : DEFAULT_PREFS.reverseComments,
    autoOpenEmbed: typeof src.autoOpenEmbed === "boolean" ? src.autoOpenEmbed : DEFAULT_PREFS.autoOpenEmbed,
    singleFileMode: typeof src.singleFileMode === "boolean" ? src.singleFileMode : DEFAULT_PREFS.singleFileMode
  };
}
function normalizeHostAccounts(raw) {
  if (globalThis.PRGithubEndpoints?.normalizeHostAccounts) {
    return globalThis.PRGithubEndpoints.normalizeHostAccounts(raw);
  }
  const list = Array.isArray(raw) ? raw : [];
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  for (const row of list) {
    if (!row || typeof row !== "object") continue;
    let host = String(row.host || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/:\d+$/, "");
    if (host.includes("@")) host = host.slice(host.lastIndexOf("@") + 1);
    const token = typeof row.token === "string" ? row.token.trim() : "";
    if (!host || host === "github.com" || host === "www.github.com") continue;
    if (host.endsWith(".github.com")) continue;
    if (!token || seen.has(host)) continue;
    seen.add(host);
    out.push({ host, token });
    if (out.length >= 3) break;
  }
  return out;
}
function getExtensionPrefs(storageApi2) {
  const area = getStorageArea(storageApi2);
  if (!area) return Promise.resolve({ ...DEFAULT_PREFS });
  return new Promise((resolve) => {
    area.get([PREFS_KEY], (result) => {
      resolve(normalizePrefs(result?.[PREFS_KEY]));
    });
  });
}
async function setExtensionPrefs(patch, storageApi2) {
  const area = getStorageArea(storageApi2);
  if (!area) return Promise.reject(new Error("chrome.storage unavailable"));
  const prev = await getExtensionPrefs(area);
  const next = normalizePrefs({
    ...prev,
    ...patch && typeof patch === "object" ? patch : {}
  });
  return new Promise((resolve, reject) => {
    area.set({ [PREFS_KEY]: next }, () => {
      const err = globalThis.chrome?.runtime?.lastError;
      if (err) reject(err);
      else resolve(next);
    });
  });
}
function watchExtensionPrefs(onChange, storageApi2 = globalThis.chrome?.storage) {
  if (!storageApi2?.onChanged || typeof onChange !== "function") return () => {
  };
  const listener = (changes, areaName) => {
    if (areaName !== "local" || !changes[PREFS_KEY]) return;
    onChange(normalizePrefs(changes[PREFS_KEY].newValue));
  };
  storageApi2.onChanged.addListener(listener);
  return () => storageApi2.onChanged.removeListener(listener);
}
function maskGithubToken(token) {
  if (!token || typeof token !== "string") return "";
  const trimmed = token.trim();
  if (!trimmed) return "";
  if (trimmed.length <= 4) return "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022";
  return `${"\u2022".repeat(8)}${trimmed.slice(-4)}`;
}
function looksLikeGithubToken(token) {
  if (typeof token !== "string") return false;
  const t = token.trim();
  if (t.length < 20 || t.length > 400) return false;
  if (/\s/.test(t)) return false;
  return /^(gh[pours]_|github_pat_)[A-Za-z0-9_]+$/.test(t);
}
function getGithubToken(storageApi2) {
  const area = getStorageArea(storageApi2);
  if (!area) return Promise.resolve(null);
  return new Promise((resolve) => {
    area.get([TOKEN_KEY], (result) => {
      const token = result?.[TOKEN_KEY];
      resolve(typeof token === "string" && token.trim() ? token.trim() : null);
    });
  });
}
async function getGithubTokenStatus(storageApi2) {
  const token = await getGithubToken(storageApi2);
  if (!token) {
    return { configured: false, mask: "" };
  }
  return { configured: true, mask: maskGithubToken(token) };
}
function setGithubToken(token, storageApi2) {
  const area = getStorageArea(storageApi2);
  if (!area) return Promise.reject(new Error("chrome.storage unavailable"));
  const value = typeof token === "string" ? token.trim() : "";
  return new Promise((resolve, reject) => {
    if (!value) {
      area.remove([TOKEN_KEY], () => {
        const err = globalThis.chrome?.runtime?.lastError;
        if (err) reject(err);
        else resolve(false);
      });
      return;
    }
    if (!looksLikeGithubToken(value)) {
      reject(
        new Error(
          "Invalid token format. Use a GitHub PAT (ghp_\u2026 / github_pat_\u2026)."
        )
      );
      return;
    }
    area.set({ [TOKEN_KEY]: value }, () => {
      const err = globalThis.chrome?.runtime?.lastError;
      if (err) reject(err);
      else resolve(true);
    });
  });
}
function watchGithubToken(onChange, storageApi2 = globalThis.chrome?.storage) {
  if (!storageApi2?.onChanged) return () => {
  };
  const listener = (changes, areaName) => {
    if (areaName !== "local" || !changes[TOKEN_KEY]) return;
    const next = changes[TOKEN_KEY].newValue;
    onChange(typeof next === "string" && next.trim() ? next.trim() : null);
  };
  storageApi2.onChanged.addListener(listener);
  return () => storageApi2.onChanged.removeListener(listener);
}
function getHostAccounts(storageApi2) {
  const area = getStorageArea(storageApi2);
  if (!area) return Promise.resolve([]);
  return new Promise((resolve) => {
    area.get([HOST_ACCOUNTS_KEY], (result) => {
      resolve(normalizeHostAccounts(result?.[HOST_ACCOUNTS_KEY]));
    });
  });
}
async function getHostAccountHosts(storageApi2) {
  const accounts = await getHostAccounts(storageApi2);
  if (globalThis.PRGithubEndpoints?.hostsFromAccounts) {
    return globalThis.PRGithubEndpoints.hostsFromAccounts(accounts);
  }
  return accounts.map((a) => a.host);
}
async function getHostAccountsPublic(storageApi2) {
  const accounts = await getHostAccounts(storageApi2);
  return accounts.map((a) => ({
    host: a.host,
    mask: maskGithubToken(a.token)
  }));
}
async function setHostAccounts(accounts, storageApi2) {
  const area = getStorageArea(storageApi2);
  if (!area) return Promise.reject(new Error("chrome.storage unavailable"));
  const next = normalizeHostAccounts(accounts);
  return new Promise((resolve, reject) => {
    if (!next.length) {
      area.remove([HOST_ACCOUNTS_KEY], () => {
        const err = globalThis.chrome?.runtime?.lastError;
        if (err) reject(err);
        else resolve([]);
      });
      return;
    }
    area.set({ [HOST_ACCOUNTS_KEY]: next }, () => {
      const err = globalThis.chrome?.runtime?.lastError;
      if (err) reject(err);
      else resolve(next);
    });
  });
}
async function registerHostAccount(host, token, storageApi2) {
  const existing = await getHostAccounts(storageApi2);
  const t = typeof token === "string" ? token.trim() : "";
  if (t && !looksLikeGithubToken(t)) {
    return {
      ok: false,
      error: "Invalid token format. Use a GitHub PAT (ghp_\u2026 / github_pat_\u2026).",
      accounts: existing
    };
  }
  let result;
  if (globalThis.PRGithubEndpoints?.registerHostAccount) {
    result = globalThis.PRGithubEndpoints.registerHostAccount(
      existing,
      host,
      t
    );
  } else {
    const h = String(host || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    if (!h || h === "github.com") {
      result = {
        ok: false,
        error: "Host is required",
        accounts: existing
      };
    } else if (!t) {
      result = {
        ok: false,
        error: "PAT is required for each enterprise host",
        accounts: existing
      };
    } else if (!existing.some((a) => a.host === h) && existing.length >= 3) {
      result = {
        ok: false,
        error: "At most 3 enterprise hosts",
        accounts: existing
      };
    } else {
      const idx = existing.findIndex((a) => a.host === h);
      const next = idx >= 0 ? existing.map((a, i) => i === idx ? { host: h, token: t } : a) : [...existing, { host: h, token: t }];
      result = { ok: true, accounts: next };
    }
  }
  if (!result.ok) return result;
  const saved = await setHostAccounts(result.accounts, storageApi2);
  return { ok: true, accounts: saved };
}
async function unregisterHostAccount(host, storageApi2) {
  const existing = await getHostAccounts(storageApi2);
  let next;
  if (globalThis.PRGithubEndpoints?.unregisterHostAccount) {
    next = globalThis.PRGithubEndpoints.unregisterHostAccount(
      existing,
      host
    ).accounts;
  } else {
    const h = String(host || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    next = existing.filter((a) => a.host !== h);
  }
  const saved = await setHostAccounts(next, storageApi2);
  return { ok: true, accounts: saved };
}
async function getTokenForWebHost(webHost, storageApi2) {
  const [defaultToken, hostAccounts] = await Promise.all([
    getGithubToken(storageApi2),
    getHostAccounts(storageApi2)
  ]);
  if (globalThis.PRGithubEndpoints?.selectTokenForWebHost) {
    return globalThis.PRGithubEndpoints.selectTokenForWebHost(webHost, {
      defaultToken,
      hostAccounts
    });
  }
  let host = String(webHost || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/:\d+$/, "");
  if (!host) host = "github.com";
  if (host === "www.github.com") host = "github.com";
  if (host === "github.com" || host.endsWith(".github.com")) {
    return {
      token: defaultToken,
      source: defaultToken ? "default" : null,
      host: host === "github.com" || host === "www.github.com" ? "github.com" : host
    };
  }
  const pair = hostAccounts.find((a) => a.host === host);
  if (pair) return { token: pair.token, source: "host", host };
  return { token: null, source: null, host };
}
const storageApi = {
  TOKEN_KEY,
  HOST_ACCOUNTS_KEY,
  PREFS_KEY,
  DEFAULT_PREFS,
  normalizePrefs,
  normalizeHostAccounts,
  maskGithubToken,
  looksLikeGithubToken,
  getGithubToken,
  getGithubTokenStatus,
  setGithubToken,
  watchGithubToken,
  getExtensionPrefs,
  setExtensionPrefs,
  watchExtensionPrefs,
  getHostAccounts,
  getHostAccountHosts,
  getHostAccountsPublic,
  setHostAccounts,
  registerHostAccount,
  unregisterHostAccount,
  getTokenForWebHost
};
if (typeof module !== "undefined" && module.exports) {
  module.exports = storageApi;
}
if (typeof globalThis !== "undefined") {
  globalThis.PRTreeStorage = storageApi;
}
})();


/* ---- fetch-pulls.js ---- */

;(function(){
/**
 * AUTO-ASSEMBLED from src/fetch/parts/* — run: npm run build:fetch
 */
/**
 * Fetch open PR branch metadata via GitHub REST API.
 * List up to 100 open PRs, then fill page-visible dangling PRs via single-PR gets.
 */


/**
 * Stateless GitHub API context (REST/GraphQL bases).
 * Prefer explicit ctx from SW message resolve; never use a process-global mutable base.
 * @param {object|string|null|undefined} ctx endpoints object, webHost string, or null → github.com
 */
function normalizeApiCtx(ctx) {
  if (ctx && typeof ctx === 'object' && (ctx.restBase || ctx.graphqlUrl)) {
    return {
      kind: ctx.kind || 'custom',
      webHost: ctx.webHost || 'github.com',
      webOrigin: ctx.webOrigin || '',
      restBase: String(ctx.restBase || 'https://api.github.com').replace(/\/+$/, ''),
      graphqlUrl: String(
        ctx.graphqlUrl ||
          (String(ctx.restBase || '').includes('api.github.com')
            ? 'https://api.github.com/graphql'
            : '')
      ).replace(/\/+$/, '') || 'https://api.github.com/graphql',
    };
  }
  const webHost =
    typeof ctx === 'string'
      ? ctx
      : ctx && typeof ctx === 'object' && ctx.webHost
        ? ctx.webHost
        : 'github.com';
  try {
    if (
      globalThis.PRGithubEndpoints &&
      typeof globalThis.PRGithubEndpoints.resolveGithubEndpoints === 'function'
    ) {
      return globalThis.PRGithubEndpoints.resolveGithubEndpoints({ webHost });
    }
  } catch (_) {}
  return {
    kind: 'dotcom',
    webHost: 'github.com',
    webOrigin: 'https://github.com',
    restBase: 'https://api.github.com',
    graphqlUrl: 'https://api.github.com/graphql',
  };
}

function githubRestUrl(path, ctx) {
  const c = normalizeApiCtx(ctx);
  try {
    if (
      globalThis.PRGithubEndpoints &&
      typeof globalThis.PRGithubEndpoints.githubRestUrl === 'function'
    ) {
      return globalThis.PRGithubEndpoints.githubRestUrl(path, c);
    }
  } catch (_) {}
  const p = String(path || '');
  if (/^https?:\/\//i.test(p)) return p;
  const base = String(c.restBase || 'https://api.github.com').replace(/\/+$/, '');
  return base + (p.startsWith('/') ? p : '/' + p);
}
function githubGraphqlUrl(ctx) {
  const c = normalizeApiCtx(ctx);
  try {
    if (
      globalThis.PRGithubEndpoints &&
      typeof globalThis.PRGithubEndpoints.githubGraphqlUrl === 'function'
    ) {
      return globalThis.PRGithubEndpoints.githubGraphqlUrl(c);
    }
  } catch (_) {}
  return String(c.graphqlUrl || 'https://api.github.com/graphql');
}


/**
 * Map REST pull list/item payload → app list row.
 * Includes labels / assignees / milestone so progressive modal sketch can paint
 * sidebar meta without waiting for full fetchPrDetail.
 */
function mapApiPullRequest(pr) {
  const author = pr.user?.login || '';
  const authorAvatarUrl = pr.user?.avatar_url || '';
  const labels = Array.isArray(pr.labels)
    ? pr.labels.map((l) => ({
        name: l?.name || String(l || ''),
        color: l?.color || '',
        description: l?.description || '',
      })).filter((l) => l.name)
    : [];
  const assignees = Array.isArray(pr.assignees)
    ? pr.assignees.map((u) => u?.login || u).filter(Boolean)
    : [];
  const requestedReviewers = Array.isArray(pr.requested_reviewers)
    ? pr.requested_reviewers.map((u) => u?.login || u).filter(Boolean)
    : [];
  /** login → avatar_url for people chips */
  const avatarUrls = {};
  const putUser = (u) => {
    const login = u?.login || (typeof u === 'string' ? u : '');
    const url = u?.avatar_url || '';
    if (login && url) avatarUrls[String(login).toLowerCase()] = url;
  };
  putUser(pr.user);
  for (const u of pr.assignees || []) putUser(u);
  for (const u of pr.requested_reviewers || []) putUser(u);

  const milestone = pr.milestone
    ? {
        number: pr.milestone.number,
        title: pr.milestone.title || '',
        state: pr.milestone.state || '',
        dueOn: pr.milestone.due_on || null,
      }
    : null;

  return {
    number: pr.number,
    title: pr.title,
    // Body required so attachMagicLinks/prMatchText can match description tokens
    body: pr.body || '',
    headRef: pr.head?.ref || '',
    baseRef: pr.base?.ref || '',
    author,
    authorAvatarUrl,
    draft: Boolean(pr.draft),
    htmlUrl: pr.html_url,
    labels,
    assignees,
    requestedReviewers,
    milestone,
    avatarUrls,
    // Optional stats when present on full list items
    additions: pr.additions ?? null,
    deletions: pr.deletions ?? null,
    changedFiles: pr.changed_files ?? null,
    nodeId: pr.node_id || null,
  };
}

function buildApiHeaders(token) {
  const headers = { Accept: 'application/vnd.github+json' };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

/** Page PR numbers missing from the list-API result set. */
function findDanglingPrNumbers(pagePrNumbers, prs) {
  if (!Array.isArray(pagePrNumbers) || pagePrNumbers.length === 0) {
    return [];
  }
  const have = new Set((prs || []).map((pr) => pr.number));
  const dangling = [];
  const seen = new Set();
  for (const raw of pagePrNumbers) {
    const num = Number(raw);
    if (!Number.isFinite(num) || seen.has(num) || have.has(num)) continue;
    seen.add(num);
    dangling.push(num);
  }
  return dangling;
}

async function mapWithConcurrency(items, limit, worker) {
  if (!items.length) return [];
  const results = new Array(items.length);
  let index = 0;

  async function run() {
    while (index < items.length) {
      const i = index++;
      results[i] = await worker(items[i], i);
    }
  }

  const runners = Array.from({ length: Math.min(limit, items.length) }, run);
  await Promise.all(runners);
  return results;
}

async function fetchOpenPullsPublic(owner, repo, fetchImpl, token = null, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const url = githubRestUrl(`/repos/${owner}/${repo}/pulls?state=open&per_page=100`, ctx);
  const res = await fetchImpl(url, {
    headers: buildApiHeaders(token),
  });
  if (!res.ok) {
    const err = new Error(`GitHub API ${res.status}: ${res.statusText}`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  return data.map(mapApiPullRequest);
}

async function fetchPullByNumber(owner, repo, pullNumber, fetchImpl, token = null, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const url = githubRestUrl(`/repos/${owner}/${repo}/pulls/${pullNumber}`, ctx);
  const res = await fetchImpl(url, {
    headers: buildApiHeaders(token),
  });
  if (!res.ok) {
    const err = new Error(`GitHub API ${res.status}: ${res.statusText} (PR #${pullNumber})`);
    err.status = res.status;
    err.pullNumber = pullNumber;
    throw err;
  }
  const data = await res.json();
  return mapApiPullRequest(data);
}

/**
 * Fetch dangling page PRs by number. Auth errors rethrow; other failures are skipped.
 */
async function fetchDanglingPulls(owner, repo, numbers, fetchImpl, token = null, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  if (!numbers.length) return [];

  const settled = await mapWithConcurrency(numbers, 5, async (pullNumber) => {
    try {
      return await fetchPullByNumber(owner, repo, pullNumber, fetchImpl, token, ctx);
    } catch (err) {
      if (err.status === 401 || err.status === 403) {
        throw err;
      }
      console.warn(`[PR Tree] Skipping dangling PR #${pullNumber}:`, err.message || err);
      return null;
    }
  });

  return settled.filter(Boolean);
}

/**
 * Repo autolink rules (GitHub "magic" external references).
 * Requires admin on the token for the API; returns [] on 403/404.
 * @returns {Promise<Array<{key_prefix:string,url_template:string,is_alphanumeric:boolean}>>}
 */
async function fetchRepoAutolinks(owner, repo, fetchImpl, token = null, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const url = githubRestUrl(`/repos/${owner}/${repo}/autolinks`, ctx);
  try {
    const res = await fetchImpl(url, { headers: buildApiHeaders(token) });
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data
      .filter((a) => a && typeof a.key_prefix === 'string' && typeof a.url_template === 'string')
      .map((a) => ({
        key_prefix: a.key_prefix,
        url_template: a.url_template,
        is_alphanumeric: a.is_alphanumeric !== false,
      }));
  } catch {
    return [];
  }
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Build external magic-link URL from autolink rule + captured num.
 * Supports both `<num>` (GitHub) and `{num}` placeholders.
 */
function buildAutolinkUrl(urlTemplate, num) {
  return String(urlTemplate)
    .replace(/<num>/gi, num)
    .replace(/\{num\}/gi, num);
}

/**
 * Find autolink matches in free text (title, branch, body).
 * @returns {Array<{key:string,url:string,prefix:string}>}
 */
function matchAutolinksInText(text, autolinks) {
  if (!text || !Array.isArray(autolinks) || autolinks.length === 0) return [];

  const found = [];
  const seen = new Set();

  for (const rule of autolinks) {
    const prefix = rule.key_prefix;
    if (!prefix) continue;
    // Prefer pure digits after prefix (ENG-7 in feat/ENG-7-foo) before broader alnum ids.
    const numClass =
      rule.is_alphanumeric !== false
        ? '(?:\\d+|[A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)*)'
        : '\\d+';
    // Word-ish boundary before prefix so we don't match mid-token noise.
    const re = new RegExp(
      `(^|[^A-Za-z0-9_])(${escapeRegExp(prefix)})(${numClass})`,
      'gi'
    );
    let m;
    while ((m = re.exec(text)) !== null) {
      const key = `${m[2]}${m[3]}`;
      const url = buildAutolinkUrl(rule.url_template, m[3]);
      if (!url || seen.has(url)) continue;
      seen.add(url);
      found.push({ key, url, prefix: m[2] });
    }
  }

  return found;
}

/** Collect matchable text for a PR descriptor. */
function prMatchText(pr) {
  if (!pr) return '';
  return [pr.title, pr.headRef, pr.baseRef, pr.body, pr.author]
    .filter(Boolean)
    .join('\n');
}

/**
 * Attach `magicLinks` array onto each PR from repo autolink rules.
 */
function attachMagicLinks(prs, autolinks) {
  if (!Array.isArray(prs)) return [];
  if (!Array.isArray(autolinks) || autolinks.length === 0) {
    return prs.map((pr) => ({ ...pr, magicLinks: pr.magicLinks || [] }));
  }
  return prs.map((pr) => ({
    ...pr,
    magicLinks: matchAutolinksInText(prMatchText(pr), autolinks),
  }));
}

/**
 * @param {object} options
 * @param {string|null} [options.token]
 * @param {number[]} [options.pagePrNumbers] PR numbers visible on the pulls page
 * @param {boolean} [options.includeAutolinks=true]
 */
async function fetchOpenPulls(owner, repo, fetchImpl, options = {}) {
  const {
    token = null,
    pagePrNumbers = [],
    includeAutolinks = true,
  } = options;
  const ctx = normalizeApiCtx(options?.ctx);

  const listed = await fetchOpenPullsPublic(owner, repo, fetchImpl, token, ctx);
  const danglingNumbers = findDanglingPrNumbers(pagePrNumbers, listed);

  let prs = listed;
  if (danglingNumbers.length > 0) {
    const extras = await fetchDanglingPulls(
      owner,
      repo,
      danglingNumbers,
      fetchImpl,
      token,
      ctx
    );
    if (extras.length > 0) {
      const byNumber = new Map(listed.map((pr) => [pr.number, pr]));
      for (const pr of extras) {
        byNumber.set(pr.number, pr);
      }
      prs = [...byNumber.values()];
    }
  }

  if (!includeAutolinks) {
    return attachMagicLinks(prs, []);
  }

  const autolinks = await fetchRepoAutolinks(owner, repo, fetchImpl, token, ctx);
  return attachMagicLinks(prs, autolinks);
}

function decodeBase64Utf8(b64) {
  try {
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(b64, 'base64').toString('utf8');
    }
  } catch {
    /* fall through */
  }
  try {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    return '';
  }
}

async function apiJson(url, fetchImpl, token) {
  const res = await fetchImpl(url, { headers: buildApiHeaders(token) });
  if (!res.ok) {
    const err = new Error(`GitHub API ${res.status}: ${res.statusText}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

/**
 * JSON GET that also returns Link header for pagination.
 * @returns {Promise<{ data: any, link: string }>}
 */
async function apiJsonWithLink(url, fetchImpl, token) {
  const res = await fetchImpl(url, { headers: buildApiHeaders(token) });
  if (!res.ok) {
    const err = new Error(`GitHub API ${res.status}: ${res.statusText}`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  let link = '';
  try {
    if (typeof res.headers?.get === 'function') {
      link = res.headers.get('link') || res.headers.get('Link') || '';
    }
  } catch {
    link = '';
  }
  return { data, link };
}

/** Absolute URL for Link header rel=next (or null). */
function parseLinkNextUrl(linkHeader) {
  if (!linkHeader) return null;
  const parts = String(linkHeader).split(',');
  for (const p of parts) {
    const m = p.match(/<([^>]+)>\s*;\s*rel="?next"?/i);
    if (m) return m[1].trim();
  }
  return null;
}

/**
 * Walk REST list endpoints via Link rel=next until exhausted.
 * @param {string} firstUrl
 * @param {function} fetchImpl
 * @param {string|null} token
 * @param {{ maxPages?: number }} [opts]
 * @returns {Promise<Array>}
 */
async function fetchRestCollectionAll(firstUrl, fetchImpl, token, opts = {}) {
  const maxPages =
    Number.isFinite(opts.maxPages) && opts.maxPages > 0
      ? Math.floor(opts.maxPages)
      : 50;
  const all = [];
  let url = firstUrl;
  let pages = 0;
  while (url && pages < maxPages) {
    pages += 1;
    const { data, link } = await apiJsonWithLink(url, fetchImpl, token);
    if (!Array.isArray(data)) break;
    all.push(...data);
    if (data.length === 0) break;
    url = parseLinkNextUrl(link);
  }
  return all;
}

function mapPrCommitRow(c) {
  return {
    sha: c?.sha || '',
    message: c?.commit?.message || c?.message || '',
    author: c?.commit?.author?.name || c?.author?.login || c?.author || '',
    date: c?.commit?.author?.date || c?.commit?.committer?.date || c?.date || '',
  };
}

/**
 * First page of PR commits (oldest-first, per_page=100). Independent of fetchPrDetail.
 */
async function fetchPrCommits(owner, repo, number, fetchImpl, token = null, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const o = String(owner || '').trim();
  const r = String(repo || '').trim();
  const n = Number(number);
  if (!o || !r || !Number.isFinite(n)) {
    throw new Error('owner, repo, and number are required for commits');
  }
  const url = githubRestUrl(
    `/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}/pulls/${n}/commits?per_page=100`
  , ctx);
  try {
    const data = await apiJson(url, fetchImpl, token);
    return (Array.isArray(data) ? data : []).map(mapPrCommitRow).filter((c) => c.sha);
  } catch (err) {
    if (
      err?.name === 'AbortError' ||
      /aborted|AbortError/i.test(String(err?.message || ''))
    ) {
      throw err;
    }
    return [];
  }
}

/**
 * All PR commits (paginated). GitHub returns oldest-first.
 */
async function fetchAllPrCommits(owner, repo, number, fetchImpl, token = null, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const o = String(owner || '').trim();
  const r = String(repo || '').trim();
  const n = Number(number);
  if (!o || !r || !Number.isFinite(n)) {
    throw new Error('owner, repo, and number are required for commits');
  }
  const first = githubRestUrl(
    `/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}/pulls/${n}/commits?per_page=100`
  , ctx);
  const raw = await fetchRestCollectionAll(first, fetchImpl, token);
  return raw.map(mapPrCommitRow).filter((c) => c.sha);
}

/**
 * Commit status contexts + check runs for a head SHA. Independent of fetchPrDetail.
 * @returns {Promise<{ state: string, totalCount: number, statuses: Array, checkRuns: Array }>}
 */
async function fetchPrChecks(owner, repo, headSha, fetchImpl, token = null, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const o = String(owner || '').trim();
  const r = String(repo || '').trim();
  const sha = String(headSha || '').trim();
  const empty = { state: 'unknown', totalCount: 0, statuses: [], checkRuns: [] };
  if (!o || !r || !sha) return empty;
  const base = githubRestUrl(`/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}`, ctx);
  let checks = { ...empty };
  try {
    const status = await apiJson(`${base}/commits/${encodeURIComponent(sha)}/status`, fetchImpl, token);
    const statusList = Array.isArray(status?.statuses) ? status.statuses : [];
    const emptyCombined =
      !statusList.length && !(Number(status?.total_count) > 0);
    checks = {
      state: emptyCombined ? 'unknown' : status.state || 'unknown',
      totalCount: emptyCombined ? 0 : status.total_count || statusList.length,
      statuses: statusList.map((s) => ({
        context: s.context || '',
        state: s.state || '',
        description: s.description || '',
        targetUrl: s.target_url || '',
        createdAt: s.created_at || '',
        updatedAt: s.updated_at || '',
      })),
      checkRuns: [],
    };
  } catch (err) {
    if (
      err?.name === 'AbortError' ||
      /aborted|AbortError/i.test(String(err?.message || ''))
    ) {
      throw err;
    }
  }
  try {
    const runs = await apiJson(
      `${base}/commits/${encodeURIComponent(sha)}/check-runs?per_page=100&filter=latest`,
      fetchImpl,
      token
    );
    const list = runs?.check_runs || [];
    if (list.length) {
      checks.checkRuns = list.map((r) => ({
        id: r.id,
        name: r.name || '',
        status: r.status || '',
        conclusion: r.conclusion || '',
        htmlUrl: r.html_url || '',
        startedAt: r.started_at || '',
        completedAt: r.completed_at || '',
        appSlug: r.app?.slug || '',
        appName: r.app?.name || '',
      }));
    }
  } catch (err) {
    if (
      err?.name === 'AbortError' ||
      /aborted|AbortError/i.test(String(err?.message || ''))
    ) {
      throw err;
    }
  }
  const normalize =
    (typeof globalThis !== 'undefined' &&
      globalThis.PRModalChecks?.normalizeChecks) ||
    null;
  if (typeof normalize === 'function') {
    return normalize(checks);
  }
  // Fallback de-dupe
  const byCtx = new Map();
  for (const s of checks.statuses || []) {
    const k = String(s.context || '').toLowerCase();
    if (!k) continue;
    const prev = byCtx.get(k);
    const t = Date.parse(s.updatedAt || s.createdAt || '') || 0;
    const pt = prev ? Date.parse(prev.updatedAt || prev.createdAt || '') || 0 : -1;
    if (!prev || t >= pt) byCtx.set(k, s);
  }
  const byName = new Map();
  for (const r of checks.checkRuns || []) {
    const k = String(r.name || '').toLowerCase();
    if (!k) continue;
    const prev = byName.get(k);
    const t = Date.parse(r.completedAt || r.startedAt || '') || Number(r.id) || 0;
    const pt = prev
      ? Date.parse(prev.completedAt || prev.startedAt || '') || Number(prev.id) || 0
      : -1;
    if (!prev || t >= pt) byName.set(k, r);
  }
  checks.statuses = [...byCtx.values()];
  checks.checkRuns = [...byName.values()];
  checks.totalCount = checks.statuses.length + checks.checkRuns.length;
  return checks;
}

/**
 * Development (linked issues) + Projects for conversation aside.
 * Independent of fetchPrDetail. Soft-fails to empty arrays.
 * @param {{ body?: string }} [opts] PR body for #N body links
 */
async function fetchPrDevelopment(
  owner,
  repo,
  number,
  fetchImpl,
  token = null,
  opts = {}
) {
  const ctx = normalizeApiCtx(opts?.ctx);
  const o = String(owner || '').trim();
  const r = String(repo || '').trim();
  const n = Number(number);
  const body = String(opts.body || '');
  let linkedIssues = [];
  try {
    let editApi =
      typeof globalThis !== 'undefined' ? globalThis.PRModalPrEditApi : null;
    if (!editApi && typeof require === 'function') {
      try {
        editApi = require('./modal/pure/pr-edit-api.js');
      } catch {
        editApi = null;
      }
    }
    if (editApi?.parseLinkedIssueNumbers) {
      linkedIssues = editApi.parseLinkedIssueNumbers(body);
    }
  } catch {
    linkedIssues = [];
  }

  let developmentIssues = [];
  let projects = [];
  try {
    const side = await fetchPrSidebarMeta(o, r, n, fetchImpl, token, ctx);
    if (side && typeof side === 'object') {
      if (Array.isArray(side.developmentIssues) && side.developmentIssues.length) {
        developmentIssues = side.developmentIssues.map((item) => ({
          number: Number(item?.number),
          title: String(item?.title || '').trim(),
          url: String(item?.url || '').trim(),
          state: String(item?.state || '').trim().toLowerCase(),
          source: item?.source || 'closing',
          kind: item?.kind || '',
        }));
        const fromGql = developmentIssues
          .map((x) => Number(x?.number))
          .filter((x) => Number.isFinite(x) && x > 0);
        if (fromGql.length) {
          const set = new Set([...linkedIssues, ...fromGql]);
          linkedIssues = [...set].sort((a, b) => a - b);
        }
      }
      if (Array.isArray(side.projects)) projects = side.projects;
    }
  } catch (err) {
    if (
      err?.name === 'AbortError' ||
      /aborted|AbortError/i.test(String(err?.message || ''))
    ) {
      throw err;
    }
  }

  // Union closing-linked + body #N
  {
    const byNum = new Map();
    for (const item of developmentIssues) {
      const num = Number(item?.number);
      if (!Number.isFinite(num) || num <= 0) continue;
      byNum.set(num, {
        number: num,
        title: String(item?.title || '').trim(),
        url: String(item?.url || '').trim(),
        state: String(item?.state || '').trim().toLowerCase(),
        source: item?.source || 'closing',
        kind: item?.kind || '',
      });
    }
    for (const raw of linkedIssues) {
      const num = Number(raw);
      if (!Number.isFinite(num) || num <= 0 || byNum.has(num)) continue;
      byNum.set(num, {
        number: num,
        title: '',
        url: `https://github.com/${o}/${r}/issues/${num}`,
        state: '',
        source: 'body',
        kind: '',
      });
    }
    developmentIssues = [...byNum.values()].sort((a, b) => a.number - b.number);
  }

  const needTitles = developmentIssues
    .filter((x) => !String(x?.title || '').trim())
    .map((x) => x.number);
  if (needTitles.length && token) {
    try {
      const summaries = await fetchIssueOrPrSummaries(
        o,
        r,
        needTitles,
        fetchImpl,
        token
      );
      if (summaries && summaries.size) {
        developmentIssues = developmentIssues.map((item) => {
          const s = summaries.get(item.number);
          if (!s) return item;
          return {
            ...item,
            title: item.title || s.title,
            url: s.url || item.url,
            state: item.state || s.state,
            kind: s.kind || item.kind || '',
          };
        });
      }
    } catch (err) {
      if (
        err?.name === 'AbortError' ||
        /aborted|AbortError/i.test(String(err?.message || ''))
      ) {
        throw err;
      }
    }
  }

  return {
    linkedIssues,
    developmentIssues,
    projects,
  };
}

/**
 * All PR files (paginated) with collapse/annotation applied.
 */
async function fetchAllPrFiles(
  owner,
  repo,
  number,
  fetchImpl,
  token = null,
  options = {}
) {
  const ctx = normalizeApiCtx(options?.ctx);
  const o = String(owner || '').trim();
  const r = String(repo || '').trim();
  const n = Number(number);
  if (!o || !r || !Number.isFinite(n)) {
    throw new Error('owner, repo, and number are required for files');
  }
  const first = githubRestUrl(
    `/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}/pulls/${n}/files?per_page=100`
  , ctx);
  const raw = await fetchRestCollectionAll(first, fetchImpl, token);
  return mapAndAnnotateFiles(raw, options.gitattributesText || '');
}

/**
 * First page of PR files (per_page=100) + optional .gitattributes annotate.
 * Independent of fetchPrDetail — progressive open paints core without waiting.
 * @returns {Promise<{ files: Array, gitattributesText: string }>}
 */
async function fetchPrFiles(
  owner,
  repo,
  number,
  fetchImpl,
  token = null,
  options = {}
) {
  const ctx = normalizeApiCtx(options?.ctx);
  const o = String(owner || '').trim();
  const r = String(repo || '').trim();
  const n = Number(number);
  if (!o || !r || !Number.isFinite(n)) {
    throw new Error('owner, repo, and number are required for files');
  }
  const base = githubRestUrl(
    `/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}`
  , ctx);
  let raw = [];
  try {
    const data = await apiJson(
      `${base}/pulls/${n}/files?per_page=100`,
      fetchImpl,
      token
    );
    raw = Array.isArray(data) ? data : [];
  } catch (err) {
    if (
      err?.name === 'AbortError' ||
      /aborted|AbortError/i.test(String(err?.message || ''))
    ) {
      throw err;
    }
    raw = [];
  }

  let gitattributesText = String(options.gitattributesText || '');
  if (!gitattributesText) {
    try {
      const ref =
        String(options.headSha || options.ref || '').trim() || 'HEAD';
      const attr = await apiJson(
        `${base}/contents/.gitattributes?ref=${encodeURIComponent(ref)}`,
        fetchImpl,
        token
      );
      if (attr?.content && attr.encoding === 'base64') {
        gitattributesText = decodeBase64Utf8(
          String(attr.content).replace(/\n/g, '')
        );
      } else if (typeof attr?.content === 'string') {
        gitattributesText = attr.content;
      }
    } catch (err) {
      if (
        err?.name === 'AbortError' ||
        /aborted|AbortError/i.test(String(err?.message || ''))
      ) {
        throw err;
      }
      gitattributesText = '';
    }
  }

  return {
    files: mapAndAnnotateFiles(raw, gitattributesText),
    gitattributesText,
  };
}

/**
 * Newest-first first window of issue comments (conversation). Independent of core.
 * @returns {Promise<{ items: Array, meta: object }>}
 */
async function fetchPrIssueComments(
  owner,
  repo,
  number,
  fetchImpl,
  token = null,
  ctx = null
) {
  ctx = normalizeApiCtx(ctx);
  const o = String(owner || '').trim();
  const r = String(repo || '').trim();
  const n = Number(number);
  const empty = {
    items: [],
    meta: {
      page: 1,
      perPage: COMMENT_PAGE_SIZE,
      hasMore: false,
      nextPage: null,
      order: 'from-end',
      loadedCount: 0,
    },
  };
  if (!o || !r || !Number.isFinite(n)) return empty;
  try {
    return await fetchPrCommentsPage(
      o,
      r,
      n,
      'issue',
      { page: 1, perPage: COMMENT_PAGE_SIZE, preferNewest: true },
      fetchImpl,
      token,
      ctx
    );
  } catch (err) {
    if (
      err?.name === 'AbortError' ||
      /aborted|AbortError/i.test(String(err?.message || ''))
    ) {
      throw err;
    }
    return empty;
  }
}

/**
 * Submitted PR reviews list. Independent of fetchPrDetail.
 * @returns {Promise<Array>}
 */
async function fetchPrReviews(owner, repo, number, fetchImpl, token = null, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const o = String(owner || '').trim();
  const r = String(repo || '').trim();
  const n = Number(number);
  if (!o || !r || !Number.isFinite(n)) return [];
  try {
    const data = await apiJson(
      githubRestUrl(
        `/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}/pulls/${n}/reviews?per_page=100`
      , ctx),
      fetchImpl,
      token
    );
    return (Array.isArray(data) ? data : []).map((rev) => ({
      id: rev.id,
      author: rev.user?.login || '',
      avatarUrl: rev.user?.avatar_url || '',
      type: rev.user?.type || '',
      isBot:
        String(rev.user?.type || '').toLowerCase() === 'bot' ||
        /\[bot\]$/i.test(String(rev.user?.login || '')),
      state: rev.state || '',
      body: rev.body || '',
      submittedAt: rev.submitted_at,
    }));
  } catch (err) {
    if (
      err?.name === 'AbortError' ||
      /aborted|AbortError/i.test(String(err?.message || ''))
    ) {
      throw err;
    }
    return [];
  }
}

const COMMENT_PAGE_SIZE = 50;

function commentsPageHelpers() {
  try {
    let mod =
      typeof globalThis !== 'undefined' ? globalThis.PRModalCommentsPage : null;
    if (!mod && typeof require === 'function') {
      try {
        mod = require('./modal/pure/comments-page.js');
      } catch {
        mod = null;
      }
    }
    return mod;
  } catch {
    return null;
  }
}

function mapIssueComment(c) {
  return {
    id: c.id,
    author: c.user?.login || '',
    avatarUrl: c.user?.avatar_url || '',
    body: c.body || '',
    createdAt: c.created_at,
  };
}

function mapReviewComment(c, extra = {}) {
  const subjectTypeRaw = String(
    extra.subjectType || c.subject_type || c.subjectType || ''
  ).toLowerCase();
  const isFileSubject = subjectTypeRaw === 'file';
  // Pending-review comments often omit line and only have position/original_line
  // File-level comments intentionally have no line.
  const line = isFileSubject
    ? null
    : c.line ??
      c.original_line ??
      (c.position != null && Number.isFinite(Number(c.position))
        ? Number(c.position)
        : null);
  // REST has no outdated flag — infer when line is gone but original_line remains
  const outdated =
    extra.outdated != null
      ? Boolean(extra.outdated)
      : c.outdated != null
        ? Boolean(c.outdated)
        : !isFileSubject && c.line == null && c.original_line != null;
  // Prefer explicit subject_type; otherwise path-only (no line) → file
  const subjectType =
    isFileSubject ||
    (line == null && !c.original_line && c.path && subjectTypeRaw !== 'line')
      ? 'file'
      : 'line';
  return {
    id: c.id,
    author: c.user?.login || '',
    avatarUrl: c.user?.avatar_url || '',
    body: c.body || '',
    path: c.path || '',
    line: line != null ? Number(line) : null,
    originalLine: subjectType === 'file' ? null : c.original_line ?? null,
    startLine: subjectType === 'file' ? null : c.start_line ?? null,
    side: c.side || 'RIGHT',
    startSide: c.start_side || null,
    diffHunk: c.diff_hunk || c.diffHunk || '',
    createdAt: c.created_at,
    inReplyToId: c.in_reply_to_id ?? null,
    nodeId: c.node_id || null,
    threadNodeId: extra.threadNodeId ?? null,
    /** Pull request review id (groups file threads under one review event). */
    reviewId:
      c.pull_request_review_id != null
        ? Number(c.pull_request_review_id)
        : extra.reviewId != null
          ? Number(extra.reviewId)
          : null,
    resolved: Boolean(extra.resolved),
    outdated,
    /** True when part of a not-yet-submitted PENDING review (hidden from main list). */
    pending: Boolean(extra.pending || c.pending),
    pendingReviewId: extra.pendingReviewId ?? c.pendingReviewId ?? null,
    /** `file` | `line` — file-level comments have no line anchor. */
    subjectType,
  };
}

/**
 * Map a GraphQL PullRequestReviewComment node (+ parent thread meta) → app shape.
 */
function mapGraphqlReviewCommentNode(node, threadMeta = {}) {
  if (!node) return null;
  const id = node.databaseId ?? null;
  if (id == null) return null;
  const reviewState = String(node.pullRequestReview?.state || '').toUpperCase();
  const pending = reviewState === 'PENDING';
  const reviewDbId =
    node.pullRequestReview?.databaseId != null
      ? Number(node.pullRequestReview.databaseId)
      : null;
  const subjectTypeRaw = String(
    threadMeta.subjectType || node.subjectType || ''
  ).toUpperCase();
  const isFile = subjectTypeRaw === 'FILE';
  const line = isFile
    ? null
    : node.line != null
      ? Number(node.line)
      : node.originalLine != null
        ? Number(node.originalLine)
        : null;
  const sideRaw = threadMeta.diffSide || threadMeta.side || 'RIGHT';
  const side = String(sideRaw).toUpperCase() === 'LEFT' ? 'LEFT' : 'RIGHT';
  return {
    id: Number(id),
    author: node.author?.login || '',
    avatarUrl: node.author?.avatarUrl || '',
    body: node.body || '',
    path: node.path || threadMeta.path || '',
    line,
    originalLine: isFile ? null : node.originalLine ?? null,
    startLine: isFile ? null : node.startLine ?? node.originalStartLine ?? null,
    side,
    startSide: threadMeta.startDiffSide || null,
    diffHunk: node.diffHunk || '',
    createdAt: node.createdAt || null,
    inReplyToId: node.replyTo?.databaseId ?? null,
    nodeId: node.id || null,
    threadNodeId: threadMeta.threadNodeId || null,
    reviewId: reviewDbId,
    resolved: Boolean(threadMeta.resolved),
    outdated: Boolean(node.outdated ?? threadMeta.isOutdated),
    pending,
    pendingReviewId: pending ? reviewDbId : null,
    subjectType: isFile ? 'file' : 'line',
  };
}

/**
 * Merge published / GraphQL review comments with PENDING-only rows.
 * GraphQL rows win for threadNodeId / outdated / diffHunk; pending flag merges in.
 */
function mergePendingReviewComments(published, pendingList) {
  const list = Array.isArray(published) ? published.slice() : [];
  const seen = new Set(list.map((c) => (c && c.id != null ? String(c.id) : '')).filter(Boolean));
  for (const p of Array.isArray(pendingList) ? pendingList : []) {
    if (!p || p.id == null) continue;
    const key = String(p.id);
    if (seen.has(key)) {
      const idx = list.findIndex((c) => c && String(c.id) === key);
      if (idx < 0) continue;
      const host = list[idx];
      list[idx] = {
        ...p,
        ...host,
        pending: Boolean(host.pending || p.pending),
        pendingReviewId: host.pendingReviewId ?? p.pendingReviewId ?? null,
        threadNodeId: host.threadNodeId || p.threadNodeId || null,
        nodeId: host.nodeId || p.nodeId || null,
        outdated: Boolean(host.outdated || p.outdated),
        diffHunk: host.diffHunk || p.diffHunk || '',
        resolved: Boolean(host.resolved || p.resolved),
      };
      continue;
    }
    seen.add(key);
    list.push(p);
  }
  return list;
}

/**
 * Pick the viewer's latest PENDING review from a reviews list payload.
 * @param {Array} reviews
 * @param {string|null} login
 * @returns {{ id: number, node_id: string|null }|null}
 */
function pickViewerPendingFromReviews(reviews, login) {
  const list = Array.isArray(reviews) ? reviews : [];
  const mine = list.filter((r) => {
    if (!r || String(r.state || '').toUpperCase() !== 'PENDING') return false;
    if (!login) return true;
    return (
      String(r.user?.login || '').toLowerCase() === String(login).toLowerCase()
    );
  });
  if (!mine.length) return null;
  const r = mine[mine.length - 1];
  return {
    id: Number(r.id),
    node_id: r.node_id || null,
  };
}

/**
 * Comments on the viewer's PENDING review (includes replies not in the main list).
 * Pass `preloaded` reviews + login from fetchPrDetail to avoid a second
 * GET /reviews (rate-limit / race) that can miss PENDING on hard reload.
 * @returns {Promise<{ comments: Array, review: { id: number, nodeId: string|null, commentCount: number }|null }>}
 */
async function fetchViewerPendingReviewBundle(
  owner,
  repo,
  pullNumber,
  fetchImpl,
  token,
  preloaded = null
, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  if (!token) return { comments: [], review: null };
  let pending = null;
  if (preloaded && (Array.isArray(preloaded.reviews) || preloaded.login != null)) {
    pending = pickViewerPendingFromReviews(
      preloaded.reviews,
      preloaded.login || null
    );
  }
  if (!pending?.id) {
    pending = await findViewerPendingReview(
      owner,
      repo,
      pullNumber,
      fetchImpl,
      token
    );
  }
  if (!pending?.id) return { comments: [], review: null };
  try {
    const n = Number(pullNumber);
    const raw = await apiJson(
      githubRestUrl(`/repos/${owner}/${repo}/pulls/${n}/reviews/${pending.id}/comments?per_page=100`, ctx),
      fetchImpl,
      token
    );
    const comments = (Array.isArray(raw) ? raw : []).map((c) =>
      mapReviewComment(c, { pending: true, pendingReviewId: pending.id })
    );
    return {
      comments,
      review: {
        id: pending.id,
        nodeId: pending.node_id || null,
        commentCount: comments.length,
      },
    };
  } catch {
    return {
      comments: [],
      review: {
        id: pending.id,
        nodeId: pending.node_id || null,
        commentCount: 0,
      },
    };
  }
}

/**
 * @returns {Promise<Array>}
 */

async function fetchViewerPendingReviewComments(
  owner,
  repo,
  pullNumber,
  fetchImpl,
  token
) {
  const { comments } = await fetchViewerPendingReviewBundle(
    owner,
    repo,
    pullNumber,
    fetchImpl,
    token
  );
  return comments;
}

/**
 * Create an empty PENDING review (no event). Required before attaching
 * "Start review" replies when none exists yet.
 */
async function createPendingPullReview(
  owner,
  repo,
  pullNumber,
  { commitId } = {},
  fetchImpl,
  token
, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const body = {};
  if (commitId) body.commit_id = commitId;
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/pulls/${pullNumber}/reviews`, ctx),
    fetchImpl,
    token,
    { method: 'POST', body }
  );
}

/**
 * Submit an existing PENDING review.
 * POST /repos/{owner}/{repo}/pulls/{pull}/reviews/{review_id}/events
 */
async function submitPendingPullReview(
  owner,
  repo,
  pullNumber,
  reviewId,
  { event = 'COMMENT', body = '' } = {},
  fetchImpl,
  token
, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const id = Number(reviewId);
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error('Invalid pending review id');
  }
  const ev = String(event || 'COMMENT').toUpperCase();
  if (!['COMMENT', 'APPROVE', 'REQUEST_CHANGES'].includes(ev)) {
    throw new Error('Invalid review event');
  }
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/pulls/${pullNumber}/reviews/${id}/events`, ctx),
    fetchImpl,
    token,
    { method: 'POST', body: { event: ev, body: body || '' } }
  );
}

/**
 * Delete a PENDING review (discards all pending comments/replies on it).
 * DELETE /repos/{owner}/{repo}/pulls/{pull}/reviews/{review_id}
 */
async function deletePendingPullReview(
  owner,
  repo,
  pullNumber,
  reviewId,
  fetchImpl,
  token
, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const id = Number(reviewId);
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error('Invalid pending review id');
  }
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/pulls/${pullNumber}/reviews/${id}`, ctx),
    fetchImpl,
    token,
    { method: 'DELETE' }
  );
}

/**
 * Paginated issue or pull review comments.
 * Supports page/per_page offset and since= (ISO8601) incremental windows.
 *
 * @param {'issue'|'review'} kind
 * @param {{ page?: number, perPage?: number, since?: string|null }} [opts]
 */
async function fetchPrCommentsPage(
  owner,
  repo,
  pullNumber,
  kind,
  opts,
  fetchImpl,
  token
, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const helpers = commentsPageHelpers();
  const perPage =
    helpers?.clampPerPage?.(opts?.perPage) ||
    Math.min(100, Number(opts?.perPage) || COMMENT_PAGE_SIZE);
  let page = Math.max(1, Number(opts?.page) || 1);
  const since = opts?.since || null;
  // Prefer newest-first: review API supports direction=desc; issue comments
  // are ascending-only so we jump to Link rel=last on the first preferNewest fetch.
  const preferNewest = Boolean(opts?.preferNewest) && !since;
  const orderHint = opts?.order || null;

  async function fetchPage(pageNum, listOpts = {}, ctx = null) {
  ctx = normalizeApiCtx(ctx);
    const sort =
      listOpts.sort != null
        ? listOpts.sort
        : kind === 'review'
          ? 'created'
          : undefined;
    const direction =
      listOpts.direction != null
        ? listOpts.direction
        : kind === 'review'
          ? preferNewest || orderHint === 'desc'
            ? 'desc'
            : 'asc'
          : undefined;
    const url = helpers?.buildCommentsListUrl
      ? helpers.buildCommentsListUrl(kind, owner, repo, pullNumber, {
          page: pageNum,
          perPage,
          since,
          sort,
          direction,
        })
      : (() => {
          const base =
            kind === 'review'
              ? githubRestUrl(`/repos/${owner}/${repo}/pulls/${pullNumber}/comments`, ctx)
              : githubRestUrl(`/repos/${owner}/${repo}/issues/${pullNumber}/comments`, ctx);
          const q = new URLSearchParams({
            per_page: String(perPage),
            page: String(pageNum),
          });
          if (since) q.set('since', since);
          if (sort) q.set('sort', sort);
          if (direction) q.set('direction', direction);
          return `${base}?${q}`;
        })();
    const { data, link } = await apiJsonWithLink(url, fetchImpl, token);
    const raw = Array.isArray(data) ? data : [];
    const items =
      kind === 'review' ? raw.map(mapReviewComment) : raw.map(mapIssueComment);
    return { items, raw, link, pageNum };
  }

  // Issue comments: ascending only → first paint from last page (newest), then page-1…
  if (kind === 'issue' && preferNewest && page === 1 && !orderHint) {
    const probe = await fetchPage(1);
    const lastPage =
      (helpers?.parseLinkLastPage && helpers.parseLinkLastPage(probe.link)) ||
      null;
    if (lastPage != null && lastPage > 1) {
      const newest = await fetchPage(lastPage);
      const meta = helpers?.buildCommentsPageMeta
        ? helpers.buildCommentsPageMeta(newest.items, {
            page: lastPage,
            perPage,
            linkHeader: newest.link,
            since,
            order: 'from-end',
          })
        : {
            page: lastPage,
            perPage,
            hasMore: lastPage > 1,
            nextPage: lastPage > 1 ? lastPage - 1 : null,
            order: 'from-end',
            since,
            loadedCount: newest.items.length,
          };
      return { items: newest.items, meta, kind };
    }
    // Only one page — already the full set (oldest=newest window)
    const meta = helpers?.buildCommentsPageMeta
      ? helpers.buildCommentsPageMeta(probe.items, {
          page: 1,
          perPage,
          linkHeader: probe.link,
          since,
          order: 'from-end',
        })
      : {
          page: 1,
          perPage,
          hasMore: false,
          nextPage: null,
          order: 'from-end',
          since,
          loadedCount: probe.items.length,
        };
    return { items: probe.items, meta, kind };
  }

  // Continuing from-end (older pages) for issue comments
  if (kind === 'issue' && (orderHint === 'from-end' || opts?.order === 'from-end')) {
    const res = await fetchPage(page);
    const meta = helpers?.buildCommentsPageMeta
      ? helpers.buildCommentsPageMeta(res.items, {
          page,
          perPage,
          linkHeader: res.link,
          since,
          order: 'from-end',
        })
      : {
          page,
          perPage,
          hasMore: page > 1,
          nextPage: page > 1 ? page - 1 : null,
          order: 'from-end',
          since,
          loadedCount: res.items.length,
        };
    return { items: res.items, meta, kind };
  }

  // Review comments (and default issue): page 1 = newest when preferNewest
  const res = await fetchPage(page, {
    direction: kind === 'review' ? (preferNewest || orderHint === 'desc' ? 'desc' : 'asc') : undefined,
    sort: kind === 'review' ? 'created' : undefined,
  });
  const meta = helpers?.buildCommentsPageMeta
    ? helpers.buildCommentsPageMeta(res.items, {
        page,
        perPage,
        linkHeader: res.link,
        since,
        order: kind === 'review' && (preferNewest || orderHint === 'desc') ? 'desc' : 'asc',
      })
    : {
        page,
        perPage,
        hasMore: res.raw.length >= perPage,
        nextPage: res.raw.length >= perPage ? page + 1 : null,
        since,
        loadedCount: res.items.length,
      };
  return { items: res.items, meta, kind };
}

async function apiSend(url, fetchImpl, token, { method = 'GET', body } = {}) {
  const headers = buildApiHeaders(token);
  if (body != null) headers['Content-Type'] = 'application/json';
  const res = await fetchImpl(url, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const j = await res.json();
      if (j?.message) detail = j.message;
      // Surface field-level validation (common on 422 replies / review comments)
      if (Array.isArray(j?.errors) && j.errors.length) {
        const bits = j.errors
          .map((e) => {
            if (!e || typeof e !== 'object') return String(e);
            if (e.message) return e.message;
            const field = e.field || e.resource || '';
            const code = e.code || '';
            return [field, code].filter(Boolean).join(' ') || null;
          })
          .filter(Boolean);
        if (bits.length) detail = `${detail}: ${bits.join('; ')}`;
      }
    } catch {
      /* ignore */
    }
    const err = new Error(`GitHub API ${res.status}: ${detail}`);
    err.status = res.status;
    throw err;
  }
  if (res.status === 204) return null;
  return res.json();
}

/**
 * Pull request sidebar meta for conversation rail:
 * - ProjectV2 items (Projects section)
 * - Closing-linked issues (Development section)
 * Soft fields only — failures return empty arrays.
 *
 * @returns {Promise<{ projects: Array, developmentIssues: Array }>}
 */
async function fetchPrSidebarMeta(owner, repo, number, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const o = String(owner || '').trim();
  const r = String(repo || '').trim();
  const n = Number(number);
  if (!o || !r || !Number.isFinite(n) || n <= 0 || !token) {
    return { projects: [], developmentIssues: [] };
  }
  const query = `
    query($owner:String!,$repo:String!,$number:Int!) {
      repository(owner:$owner, name:$repo) {
        pullRequest(number:$number) {
          projectItems(first: 20) {
            nodes {
              id
              project {
                title
                number
                url
              }
            }
          }
          closingIssuesReferences(first: 20) {
            nodes {
              number
              title
              url
              state
            }
          }
        }
      }
    }
  `;
  try {
    const data = await apiGraphql(
      query,
      { owner: o, repo: r, number: n },
      fetchImpl,
      token,
      ctx
    );
    const prNode = data?.repository?.pullRequest || null;
    const projects = [];
    for (const node of prNode?.projectItems?.nodes || []) {
      const p = node?.project;
      if (!p) continue;
      const title = String(p.title || '').trim();
      if (!title) continue;
      projects.push({
        id: String(node.id || `${p.number}:${title}`),
        title,
        number: p.number != null ? Number(p.number) : null,
        url: String(p.url || '').trim(),
      });
    }
    const developmentIssues = [];
    for (const node of prNode?.closingIssuesReferences?.nodes || []) {
      const num = Number(node?.number);
      if (!Number.isFinite(num) || num <= 0) continue;
      developmentIssues.push({
        number: num,
        title: String(node?.title || '').trim(),
        url: String(node?.url || '').trim(),
        state: String(node?.state || '').trim().toLowerCase(),
      });
    }
    return { projects, developmentIssues };
  } catch (err) {
    // Soft: missing ProjectV2 scope / org policy / etc.
    if (err?.name === 'AbortError' || /aborted|AbortError/i.test(String(err?.message || ''))) {
      throw err;
    }
    return { projects: [], developmentIssues: [] };
  }
}

/**
 * Resolve title/url/state for issue or PR numbers (body-linked Development rows).
 * Soft-fail: empty Map when GraphQL unavailable.
 *
 * @param {string} owner
 * @param {string} repo
 * @param {number[]} numbers
 * @param {typeof fetch} fetchImpl
 * @param {string} token
 * @returns {Promise<Map<number, { number: number, title: string, url: string, state: string, kind: string }>>}
 */
async function fetchIssueOrPrSummaries(owner, repo, numbers, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const o = String(owner || '').trim();
  const r = String(repo || '').trim();
  const nums = [
    ...new Set(
      (Array.isArray(numbers) ? numbers : [])
        .map((n) => Number(n))
        .filter((n) => Number.isFinite(n) && n > 0)
    ),
  ].slice(0, 30);
  /** @type {Map<number, { number: number, title: string, url: string, state: string, kind: string }>} */
  const out = new Map();
  if (!o || !r || !nums.length || !token) return out;

  // Alias each number — GraphQL has no list-of-numbers helper for issueOrPullRequest.
  const fields = nums
    .map(
      (n, i) => `
      n${i}: issueOrPullRequest(number: ${n}) {
        __typename
        ... on Issue { number title url state }
        ... on PullRequest { number title url state }
      }`
    )
    .join('\n');
  const query = `
    query($owner:String!,$repo:String!) {
      repository(owner:$owner, name:$repo) {
        ${fields}
      }
    }
  `;
  try {
    const data = await apiGraphql(
      query,
      { owner: o, repo: r },
      fetchImpl,
      token,
      ctx
    );
    const repoNode = data?.repository || {};
    for (let i = 0; i < nums.length; i++) {
      const node = repoNode[`n${i}`];
      if (!node || node.number == null) continue;
      const num = Number(node.number);
      if (!Number.isFinite(num) || num <= 0) continue;
      out.set(num, {
        number: num,
        title: String(node.title || '').trim(),
        url: String(node.url || '').trim(),
        state: String(node.state || '').trim().toLowerCase(),
        kind: node.__typename === 'PullRequest' ? 'pull' : 'issue',
      });
    }
  } catch (err) {
    if (
      err?.name === 'AbortError' ||
      /aborted|AbortError/i.test(String(err?.message || ''))
    ) {
      throw err;
    }
    // Soft-fail: keep empty map
  }
  return out;
}

/**
 * GraphQL client: HTTP 200 can still carry body.errors — treat those as failures.
 * @returns {Promise<object>} data field only
 */
async function apiGraphql(query, variables, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const json = await apiSend(
    githubGraphqlUrl(ctx),
    fetchImpl,
    token,
    { method: 'POST', body: { query, variables: variables || {} } }
  );
  if (json?.errors?.length) {
    const msg = json.errors
      .map((e) => e?.message || String(e))
      .filter(Boolean)
      .join('; ');
    const err = new Error(`GitHub GraphQL: ${msg || 'unknown error'}`);
    err.graphqlErrors = json.errors;
    err.status = 200;
    throw err;
  }
  return json?.data ?? null;
}

/** Thread node fields shared by first/last pagination queries. */
const REVIEW_THREAD_NODE_FIELDS = `
  id
  isResolved
  isOutdated
  path
  line
  originalLine
  startLine
  originalStartLine
  diffSide
  startDiffSide
  subjectType
  comments(first:100){
    nodes{
      id
      databaseId
      body
      path
      line
      originalLine
      startLine
      originalStartLine
      outdated
      diffHunk
      createdAt
      author { login avatarUrl }
      replyTo { databaseId }
      pullRequestReview { databaseId state }
    }
  }
`;

/** Oldest → newer (forward). */
const REVIEW_THREADS_FIRST_QUERY = `
query($owner:String!,$name:String!,$number:Int!,$n:Int!,$cursor:String){
  repository(owner:$owner,name:$name){
    pullRequest(number:$number){
      reviewThreads(first:$n, after:$cursor){
        totalCount
        pageInfo { hasNextPage hasPreviousPage startCursor endCursor }
        nodes { ${REVIEW_THREAD_NODE_FIELDS} }
      }
    }
  }
}`;

/** Newest ← older (backward). */
const REVIEW_THREADS_LAST_QUERY = `
query($owner:String!,$name:String!,$number:Int!,$n:Int!,$cursor:String){
  repository(owner:$owner,name:$name){
    pullRequest(number:$number){
      reviewThreads(last:$n, before:$cursor){
        totalCount
        pageInfo { hasNextPage hasPreviousPage startCursor endCursor }
        nodes { ${REVIEW_THREAD_NODE_FIELDS} }
      }
    }
  }
}`;

/** GraphQL connection / nodes(ids) hard cap. */
const REVIEW_THREADS_API_MAX = 100;
/** Default page size for dual-window expand (Load more / Load all). Matches API max. */
const REVIEW_THREADS_PAGE_SIZE = REVIEW_THREADS_API_MAX;

/**
 * Map GraphQL reviewThreads.nodes → { threads, comments }.
 */
function mapReviewThreadNodes(allNodes) {
  const threads = [];
  const comments = [];
  for (const t of Array.isArray(allNodes) ? allNodes : []) {
    if (!t?.id) continue;
    const threadMeta = {
      threadNodeId: t.id,
      resolved: Boolean(t.isResolved),
      isOutdated: Boolean(t.isOutdated),
      path: t.path || '',
      diffSide: t.diffSide || 'RIGHT',
      startDiffSide: t.startDiffSide || null,
      line: t.line ?? null,
      originalLine: t.originalLine ?? null,
      startLine: t.startLine ?? t.originalStartLine ?? null,
      subjectType: t.subjectType || null,
    };
    const commentIds = [];
    for (const node of t.comments?.nodes || []) {
      const mapped = mapGraphqlReviewCommentNode(node, threadMeta);
      if (!mapped) continue;
      comments.push(mapped);
      commentIds.push(mapped.id);
    }
    threads.push({
      threadNodeId: t.id,
      resolved: Boolean(t.isResolved),
      outdated: Boolean(t.isOutdated),
      path: t.path || '',
      line: t.line ?? t.originalLine ?? null,
      startLine: t.startLine ?? t.originalStartLine ?? null,
      side: t.diffSide || 'RIGHT',
      commentIds,
    });
  }
  return { threads, comments };
}

/**
 * Single GraphQL page of review threads.
 * @param {'newest'|'older'|'oldest'|'newer'} direction
 *   - newest: last:N (connection end = most recent)
 *   - older:  last:N before startCursor (expand newest window into older)
 *   - oldest: first:N (connection start = earliest)
 *   - newer:  first:N after endCursor (expand oldest window into newer)
 */
async function fetchReviewThreadsPage(
  owner,
  repo,
  pullNumber,
  { direction = 'newest', cursor = null, pageSize = REVIEW_THREADS_PAGE_SIZE } = {},
  fetchImpl,
  token,
  ctx = null
) {
  ctx = normalizeApiCtx(ctx);
  const empty = {
    threads: [],
    comments: [],
    hasMore: false,
    endCursor: null,
    startCursor: null,
    hasNextPage: false,
    hasPreviousPage: false,
    totalCount: null,
    pageCount: 0,
    direction,
  };
  if (!token) return empty;
  const n = Number(pullNumber);
  if (!Number.isFinite(n)) return empty;
  const size = Math.max(
    1,
    Math.min(REVIEW_THREADS_API_MAX, Number(pageSize) || REVIEW_THREADS_PAGE_SIZE)
  );
  const dir = String(direction || 'newest');
  const useLast = dir === 'newest' || dir === 'older';
  const query = useLast ? REVIEW_THREADS_LAST_QUERY : REVIEW_THREADS_FIRST_QUERY;
  // newest: last:N, cursor=null
  // older:  last:N, before=cursor (start of current newest window)
  // oldest: first:N, cursor=null
  // newer:  first:N, after=cursor (end of current oldest window)
  const data = await apiGraphql(
    query,
    {
      owner,
      name: repo,
      number: n,
      n: size,
      cursor: cursor || null,
    },
    fetchImpl,
    token,
    ctx
  );
  const conn = data?.repository?.pullRequest?.reviewThreads;
  const nodes = conn?.nodes || [];
  const pageInfo = conn?.pageInfo || {};
  const mapped = mapReviewThreadNodes(nodes);
  // Tag threads with load window for UI gap split
  const windowTag =
    dir === 'newest' || dir === 'older' ? 'newest' : 'oldest';
  for (const t of mapped.threads) {
    t.loadWindow = windowTag;
  }
  return {
    threads: mapped.threads,
    comments: mapped.comments,
    totalCount:
      typeof conn?.totalCount === 'number' ? conn.totalCount : null,
    startCursor: pageInfo.startCursor || null,
    endCursor: pageInfo.endCursor || null,
    hasNextPage: Boolean(pageInfo.hasNextPage),
    hasPreviousPage: Boolean(pageInfo.hasPreviousPage),
    // Convenience for dual-window UI
    hasMore:
      useLast
        ? Boolean(pageInfo.hasPreviousPage)
        : Boolean(pageInfo.hasNextPage),
    pageCount: 1,
    direction: dir,
    window: windowTag,
  };
}

/**
 * Collect GraphQL thread node ids (PRRT_…) that are unresolved in a detail snapshot.
 * Used for cache revalidate bulk refresh.
 * @param {object|null} detail
 * @returns {string[]}
 */
function collectUnresolvedThreadNodeIds(detail) {
  const dropped =
    detail?._droppedThreadNodeIds instanceof Set
      ? detail._droppedThreadNodeIds
      : new Set(
          Array.isArray(detail?._droppedThreadNodeIds)
            ? detail._droppedThreadNodeIds.map(String)
            : []
        );
  const ids = new Set();
  for (const t of Array.isArray(detail?.reviewThreads) ? detail.reviewThreads : []) {
    if (!t?.threadNodeId || t.resolved) continue;
    const id = String(t.threadNodeId);
    if (dropped.has(id)) continue;
    ids.add(id);
  }
  const list = Array.isArray(detail?.reviewComments) ? detail.reviewComments : [];
  const byId = new Map();
  for (const c of list) {
    if (c && c.id != null) byId.set(String(c.id), c);
  }
  for (const c of list) {
    if (!c?.threadNodeId || c.resolved) continue;
    const id = String(c.threadNodeId);
    if (dropped.has(id)) continue;
    const parentId = c.inReplyToId ?? c.in_reply_to_id ?? null;
    // Prefer roots (or orphans) — replies inherit resolved from thread meta anyway
    if (parentId != null && byId.has(String(parentId))) continue;
    ids.add(id);
  }
  return [...ids];
}

/**
 * Fetch specific review threads by GraphQL global ids (PRRT_…).
 * Batches in chunks of REVIEW_THREADS_API_MAX (100).
 * @param {string[]} threadNodeIds
 * @param {typeof fetch} fetchImpl
 * @param {string} token
 */
async function fetchReviewThreadsByIds(threadNodeIds, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const empty = {
    threads: [],
    comments: [],
    pageCount: 0,
    direction: 'refresh',
    totalCount: null,
    hasPreviousPage: false,
    hasNextPage: false,
    requestedThreadIds: [],
    missingThreadIds: [],
  };
  if (!token) return empty;
  const ids = [
    ...new Set(
      (Array.isArray(threadNodeIds) ? threadNodeIds : [])
        .map((id) => String(id || '').trim())
        .filter(Boolean)
    ),
  ];
  if (!ids.length) return empty;

  const query = `
query($ids:[ID!]!){
  nodes(ids:$ids){
    ... on PullRequestReviewThread {
      ${REVIEW_THREAD_NODE_FIELDS}
    }
  }
}`;

  const allThreads = [];
  const allComments = [];
  const foundIds = new Set();
  let pages = 0;
  for (let i = 0; i < ids.length; i += REVIEW_THREADS_API_MAX) {
    const chunk = ids.slice(i, i + REVIEW_THREADS_API_MAX);
    try {
      const data = await apiGraphql(query, { ids: chunk }, fetchImpl, token, ctx);
      // nodes[] is parallel to requested ids; deleted/not-found → null
      const rawNodes = Array.isArray(data?.nodes) ? data.nodes : [];
      const nodes = rawNodes.filter(Boolean);
      const mapped = mapReviewThreadNodes(nodes);
      for (const t of mapped.threads) {
        t.loadWindow = t.loadWindow || 'refresh';
        if (t.threadNodeId) foundIds.add(String(t.threadNodeId));
      }
      // Also mark any non-null node id from raw (even if mapping skipped)
      for (const n of nodes) {
        if (n?.id) foundIds.add(String(n.id));
      }
      allThreads.push(...mapped.threads);
      allComments.push(...mapped.comments);
      pages += 1;
    } catch (err) {
      // One bad chunk must not block the rest — treat whole chunk as unknown
      // (not missing) so we don't mass-drop on transient GraphQL errors.
      console.warn(
        '[pr-plus] fetchReviewThreadsByIds chunk failed',
        err?.message || err
      );
    }
  }
  const missingThreadIds = ids.filter((id) => !foundIds.has(String(id)));
  return {
    threads: allThreads,
    comments: allComments,
    pageCount: pages,
    direction: 'refresh',
    totalCount: null,
    hasPreviousPage: false,
    hasNextPage: false,
    requestedThreadIds: ids,
    missingThreadIds,
  };
}

/**
 * Drop review threads (and their comments) that no longer exist remotely.
 * Records comment id tombstones so App mergeDetailPreserveOptimistic cannot
 * resurrect them across a racey host→local merge.
 *
 * @param {object|null} detail
 * @param {Iterable<string>|string[]|null|undefined} threadNodeIds
 * @returns {object|null}
 */
function dropReviewThreadsFromDetail(detail, threadNodeIds) {
  if (!detail) return detail;
  const drop = new Set(
    [...(threadNodeIds || [])]
      .map((id) => String(id || '').trim())
      .filter(Boolean)
  );
  if (!drop.size) return detail;

  const prevRc = Array.isArray(detail.reviewComments) ? detail.reviewComments : [];
  const prevTh = Array.isArray(detail.reviewThreads) ? detail.reviewThreads : [];
  const droppedCommentIds = [];
  const reviewComments = prevRc.filter((c) => {
    if (!c) return false;
    const tid = c.threadNodeId ? String(c.threadNodeId) : '';
    if (tid && drop.has(tid)) {
      if (c.id != null) droppedCommentIds.push(String(c.id));
      return false;
    }
    return true;
  });
  const reviewThreads = prevTh.filter(
    (t) => !t?.threadNodeId || !drop.has(String(t.threadNodeId))
  );

  const deleted = new Set(
    [
      ...(detail._deletedReviewCommentIds instanceof Set
        ? detail._deletedReviewCommentIds
        : Array.isArray(detail._deletedReviewCommentIds)
          ? detail._deletedReviewCommentIds
          : []),
      ...droppedCommentIds,
    ].map(String)
  );

  const prevMeta = detail.reviewThreadsMeta || emptyReviewThreadsMeta();
  const filterIdList = (list) =>
    (Array.isArray(list) ? list : [])
      .map(String)
      .filter((id) => id && !drop.has(id));
  const loadedThreadCount = reviewThreads.length;
  const totalCount = Math.max(
    0,
    Number(prevMeta.totalCount) || loadedThreadCount
  );
  // Prefer shrinking total when we know threads vanished (never inflate)
  const nextTotal =
    Number.isFinite(Number(prevMeta.totalCount)) &&
    Number(prevMeta.totalCount) >= drop.size
      ? Math.max(loadedThreadCount, Number(prevMeta.totalCount) - drop.size)
      : totalCount;
  const hiddenCount = Math.max(0, nextTotal - loadedThreadCount);

  const prevDroppedThreads =
    detail._droppedThreadNodeIds instanceof Set
      ? detail._droppedThreadNodeIds
      : Array.isArray(detail._droppedThreadNodeIds)
        ? detail._droppedThreadNodeIds
        : [];
  const droppedThreads = new Set([...prevDroppedThreads, ...drop].map(String));

  return {
    ...detail,
    reviewComments,
    reviewThreads,
    reviewCommentsMeta: {
      ...(detail.reviewCommentsMeta || {}),
      loadedCount: reviewComments.length,
    },
    reviewThreadsMeta: {
      ...prevMeta,
      totalCount: nextTotal,
      hiddenCount,
      loadedThreadCount,
      loadedCommentCount: reviewComments.length,
      newestThreadIds: filterIdList(prevMeta.newestThreadIds),
      oldestThreadIds: filterIdList(prevMeta.oldestThreadIds),
      hasMore: hiddenCount > 0,
      hasOlder: hiddenCount > 0 && Boolean(prevMeta.hasOlder),
      hasNewerFromOldest:
        hiddenCount > 0 && Boolean(prevMeta.hasNewerFromOldest),
    },
    _deletedReviewCommentIds: deleted.size ? deleted : detail._deletedReviewCommentIds,
    // Never re-request these PRRT ids in collectUnresolvedThreadNodeIds
    _droppedThreadNodeIds: droppedThreads,
  };
}

/**
 * Initial dual-window load: last:100 first, then start:20 only when total ≥ 100.
 * Small PRs (total < 100) load a single last window covering everything.
 */
async function fetchPullReviewThreadsBundle(
  owner,
  repo,
  pullNumber,
  fetchImpl,
  token,
  opts = {}
) {
  const ctx = normalizeApiCtx(opts?.ctx);
  if (!token) {
    return {
      threads: [],
      comments: [],
      hasMore: false,
      endCursor: null,
      startCursor: null,
      pageCount: 0,
      totalCount: 0,
      reviewThreadsMeta: emptyReviewThreadsMeta(),
    };
  }
  const lastPageSize = Math.min(
    REVIEW_THREADS_API_MAX,
    Number(opts.pageSize) || REVIEW_THREADS_API_MAX
  );
  const startPageSize = Math.min(
    20,
    Number(opts.startPageSize) || 20
  );
  // Last (newest) first
  const newest = await fetchReviewThreadsPage(
    owner,
    repo,
    pullNumber,
    { direction: 'newest', cursor: null, pageSize: lastPageSize },
    fetchImpl,
    token,
    ctx
  );
  const totalCount = Number(newest.totalCount) || newest.threads.length;
  let oldest = null;
  // total < 100 → last page already covers all; skip start window
  if (totalCount >= REVIEW_THREADS_API_MAX && newest.hasPreviousPage) {
    try {
      oldest = await fetchReviewThreadsPage(
        owner,
        repo,
        pullNumber,
        {
          direction: 'oldest',
          cursor: null,
          pageSize: startPageSize,
        },
        fetchImpl,
        token,
        ctx
      );
    } catch {
      oldest = null;
    }
  }

  const threads = [...(newest.threads || [])];
  const comments = [...(newest.comments || [])];
  const newestIds = newest.threads.map((t) => t.threadNodeId).filter(Boolean);
  const oldestIds = [];
  if (oldest) {
    for (const t of oldest.threads || []) {
      if (!newestIds.includes(t.threadNodeId)) {
        threads.push(t);
        oldestIds.push(t.threadNodeId);
      }
    }
    for (const c of oldest.comments || []) {
      if (!comments.some((x) => String(x.id) === String(c.id))) comments.push(c);
    }
  }

  const loaded = threads.length;
  const hiddenCount = Math.max(0, totalCount - loaded);
  const meta = {
    totalCount,
    hiddenCount,
    loadedThreadCount: loaded,
    loadedCommentCount: comments.length,
    pagesLoaded: 1 + (oldest ? 1 : 0),
    // Newest window cursors (expand older with before: startCursor)
    newestStartCursor: newest.startCursor || null,
    newestEndCursor: newest.endCursor || null,
    hasOlder: Boolean(newest.hasPreviousPage),
    // Oldest window cursors (expand newer with after: endCursor)
    oldestStartCursor: oldest?.startCursor || null,
    oldestEndCursor: oldest?.endCursor || null,
    hasNewerFromOldest: Boolean(oldest?.hasNextPage),
    newestThreadIds: newestIds,
    oldestThreadIds: oldestIds,
    hasMore: hiddenCount > 0,
    endCursor: newest.startCursor || null, // legacy: load-more-older
  };

  return {
    threads,
    comments,
    hasMore: meta.hasMore,
    endCursor: meta.endCursor,
    startCursor: newest.startCursor || null,
    pageCount: meta.pagesLoaded,
    totalCount,
    reviewThreadsMeta: meta,
  };
}

function emptyReviewThreadsMeta() {
  return {
    totalCount: 0,
    hiddenCount: 0,
    loadedThreadCount: 0,
    loadedCommentCount: 0,
    pagesLoaded: 0,
    newestStartCursor: null,
    newestEndCursor: null,
    hasOlder: false,
    oldestStartCursor: null,
    oldestEndCursor: null,
    hasNewerFromOldest: false,
    newestThreadIds: [],
    oldestThreadIds: [],
    hasMore: false,
    endCursor: null,
  };
}

/**
 * Merge a dual-window page (or bulk refresh) into detail.reviewThreadsMeta + comments.
 * @param {'older'|'newer'|'newest'|'oldest'|'refresh'} direction
 *   - refresh: update thread/comment bodies only; keep dual-window cursors/id sets
 */
function mergeReviewThreadsPageIntoDetail(detail, page, direction = 'older') {
  if (!detail) return detail;
  const dir = String(direction || page?.direction || 'older');
  const prevMeta = detail.reviewThreadsMeta || emptyReviewThreadsMeta();
  const prevRc = Array.isArray(detail.reviewComments) ? detail.reviewComments : [];
  const prevTh = Array.isArray(detail.reviewThreads) ? detail.reviewThreads : [];

  // Explicit missing list from nodes(ids:) bulk fetch (remote-deleted threads)
  const explicitMissing = Array.isArray(page?.missingThreadIds)
    ? page.missingThreadIds.map(String).filter(Boolean)
    : [];
  // Or derive: requested − returned
  const requested = Array.isArray(page?.requestedThreadIds)
    ? page.requestedThreadIds.map(String).filter(Boolean)
    : [];
  const returnedIds = new Set(
    (page?.threads || [])
      .map((t) => (t?.threadNodeId ? String(t.threadNodeId) : ''))
      .filter(Boolean)
  );
  const derivedMissing =
    requested.length > 0
      ? requested.filter((id) => !returnedIds.has(id))
      : [];
  const missingIds = [
    ...new Set([...explicitMissing, ...derivedMissing]),
  ];

  // refresh/ids: replace comments for updated threads so new replies land and deleted ones drop
  let baseRc = prevRc;
  if ((dir === 'refresh' || dir === 'ids') && (page?.threads || []).length) {
    const refreshed = new Set(
      (page.threads || [])
        .map((t) => (t?.threadNodeId ? String(t.threadNodeId) : ''))
        .filter(Boolean)
    );
    if (refreshed.size) {
      baseRc = prevRc.filter(
        (c) => !c?.threadNodeId || !refreshed.has(String(c.threadNodeId))
      );
    }
  }
  const reviewComments = mergePendingReviewComments(baseRc, page?.comments || []);
  // When GraphQL thread meta updates resolved, stamp onto all comments in those threads
  const resolvedByThread = new Map();
  for (const t of page?.threads || []) {
    if (t?.threadNodeId) {
      resolvedByThread.set(String(t.threadNodeId), Boolean(t.resolved));
    }
  }
  const stampedComments =
    resolvedByThread.size === 0
      ? reviewComments
      : reviewComments.map((c) => {
          if (!c?.threadNodeId) return c;
          const key = String(c.threadNodeId);
          if (!resolvedByThread.has(key)) return c;
          return { ...c, resolved: resolvedByThread.get(key) };
        });

  const thById = new Map(
    prevTh.map((t) => [String(t.threadNodeId), t]).filter(([k]) => k && k !== 'undefined')
  );
  for (const t of page?.threads || []) {
    if (t?.threadNodeId) {
      thById.set(String(t.threadNodeId), {
        ...(thById.get(String(t.threadNodeId)) || {}),
        ...t,
      });
    }
  }
  const reviewThreads = [...thById.values()];

  let newestIds = new Set((prevMeta.newestThreadIds || []).map(String));
  let oldestIds = new Set((prevMeta.oldestThreadIds || []).map(String));
  const pageIds = (page?.threads || [])
    .map((t) => t.threadNodeId)
    .filter(Boolean)
    .map(String);

  let newestStartCursor = prevMeta.newestStartCursor;
  let newestEndCursor = prevMeta.newestEndCursor;
  let hasOlder = prevMeta.hasOlder;
  let oldestStartCursor = prevMeta.oldestStartCursor;
  let oldestEndCursor = prevMeta.oldestEndCursor;
  let hasNewerFromOldest = prevMeta.hasNewerFromOldest;

  if (dir === 'refresh' || dir === 'ids') {
    // Bulk / targeted revalidate — preserve dual-window pagination state
  } else if (dir === 'newest' || dir === 'older') {
    for (const id of pageIds) newestIds.add(id);
    // Expanding older moves the "start" of newest window further back
    if (page?.startCursor) newestStartCursor = page.startCursor;
    if (dir === 'newest' && page?.endCursor) newestEndCursor = page.endCursor;
    hasOlder = Boolean(page?.hasPreviousPage);
  } else {
    // oldest | newer — expand oldest window toward the middle
    for (const id of pageIds) oldestIds.add(id);
    if (page?.endCursor) oldestEndCursor = page.endCursor;
    if (dir === 'oldest' && page?.startCursor) oldestStartCursor = page.startCursor;
    hasNewerFromOldest = Boolean(page?.hasNextPage);
  }

  // Windows meet when no hidden left or cursors exhausted both ways
  const totalCount =
    typeof page?.totalCount === 'number'
      ? page.totalCount
      : Number(prevMeta.totalCount) || reviewThreads.length;
  const loadedThreadCount = reviewThreads.length;
  const hiddenCount = Math.max(0, totalCount - loadedThreadCount);

  // Drop ids from oldest that are now in newest (overlap)
  for (const id of newestIds) oldestIds.delete(id);

  const meta = {
    ...prevMeta,
    totalCount,
    hiddenCount,
    loadedThreadCount,
    loadedCommentCount: stampedComments.length,
    pagesLoaded:
      dir === 'refresh' || dir === 'ids'
        ? Number(prevMeta.pagesLoaded) || 0
        : (Number(prevMeta.pagesLoaded) || 0) + (page?.pageCount || 1),
    newestStartCursor,
    newestEndCursor,
    hasOlder: hiddenCount > 0 && hasOlder,
    oldestStartCursor,
    oldestEndCursor,
    hasNewerFromOldest: hiddenCount > 0 && hasNewerFromOldest,
    newestThreadIds: [...newestIds],
    oldestThreadIds: [...oldestIds],
    hasMore: hiddenCount > 0,
    endCursor: newestStartCursor,
  };

  let next = {
    ...detail,
    reviewComments: stampedComments,
    reviewThreads,
    reviewCommentsMeta: {
      ...(detail.reviewCommentsMeta || {}),
      loadedCount: stampedComments.length,
      hasMore: meta.hasMore,
    },
    reviewThreadsMeta: meta,
  };

  // Remote-deleted threads: GraphQL nodes(ids:) returns null — strip local zombies
  // so revalidate does not keep re-requesting dead PRRT ids forever.
  if ((dir === 'refresh' || dir === 'ids') && missingIds.length) {
    next = dropReviewThreadsFromDetail(next, missingIds);
  }
  return next;
}

/**
 * Fetch PR review threads (ids + isResolved) for resolve UI / legacy callers.
 * Returns [] on failure so REST detail still loads.
 */

async function fetchPullReviewThreads(owner, repo, pullNumber, fetchImpl, token) {
  try {
    const bundle = await fetchPullReviewThreadsBundle(
      owner,
      repo,
      pullNumber,
      fetchImpl,
      token
    );
    return bundle.threads || [];
  } catch {
    return [];
  }
}

/**
 * Full PR detail payload for the modal: header, body, files+patches,
 * issue comments, reviews, review comments, commits, checks.
 *
 * Partial by default: only the **first GraphQL page** of review threads
 * (see opts.threadsMaxPages / opts.skipReviewThreads). More pages load via
 * fetchReviewThreadsPage + mergeReviewThreadsPageIntoDetail.
 *
 * @param {{ skipReviewThreads?: boolean, threadsMaxPages?: number, threadsCursor?: string|null }} [opts]
 */
function fetchNowMs() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

/**
 * Time an async fetch and record ms into `timings[name]`.
 * Always logs to console for SW / page debugging.
 *
 * When `opts.batchStart` is set (ms from fetchNowMs), also records
 * `timings[name_start]` = offset from batch start (for parallel REST fan-out).
 *
 * @template T
 * @param {Record<string, number|string>} timings
 * @param {string} name
 * @param {Promise<T>} promise
 * @param {(result: T) => string} [extra]
 * @param {{ batchStart?: number }} [opts]
 * @returns {Promise<T>}
 */
async function timedFetch(timings, name, promise, extra, opts = {}) {
  const t0 = fetchNowMs();
  const batchStart =
    opts && Number.isFinite(opts.batchStart) ? Number(opts.batchStart) : null;
  if (batchStart != null) {
    timings[`${name}_start`] = Math.round(t0 - batchStart);
  }
  try {
    const result = await promise;
    const ms = Math.round(fetchNowMs() - t0);
    timings[name] = ms;
    let suffix = '';
    try {
      if (typeof extra === 'function') suffix = extra(result) || '';
    } catch {
      /* ignore extra formatting errors */
    }
    const startLabel =
      batchStart != null && timings[`${name}_start`] != null
        ? ` t+${timings[`${name}_start`]}ms`
        : '';
    console.log(
      `[pr-plus] fetchPrDetail ${name}: ${ms}ms${startLabel}${
        suffix ? ` ${suffix}` : ''
      }`
    );
    return result;
  } catch (err) {
    const ms = Math.round(fetchNowMs() - t0);
    timings[name] = ms;
    const msg = err?.message || String(err);
    timings[`${name}_error`] = msg;
    const startLabel =
      batchStart != null && timings[`${name}_start`] != null
        ? ` t+${timings[`${name}_start`]}ms`
        : '';
    console.log(
      `[pr-plus] fetchPrDetail ${name}: ${ms}ms${startLabel} ERROR ${msg}`
    );
    throw err;
  }
}

/**
 * Pretty-print parallel REST timings after Promise.all settles.
 * @param {Record<string, number|string>} timings
 * @param {string[]} names keys that participated in the batch
 * @param {number} wallMs wall-clock for Promise.all
 */
function logParallelRestSummary(timings, names, wallMs) {
  const rows = (Array.isArray(names) ? names : [])
    .map((name) => {
      const ms = Number(timings[name]);
      const start = Number(timings[`${name}_start`]);
      const err = timings[`${name}_error`];
      return {
        name,
        ms: Number.isFinite(ms) ? ms : null,
        start: Number.isFinite(start) ? start : null,
        error: err ? String(err) : null,
      };
    })
    .filter((r) => r.ms != null);
  rows.sort((a, b) => (b.ms || 0) - (a.ms || 0));
  const slowest = rows[0];
  const sum = rows.reduce((s, r) => s + (r.ms || 0), 0);
  const lines = rows.map((r) => {
    const bar =
      wallMs > 0 && r.ms != null
        ? '█'.repeat(Math.max(1, Math.round((r.ms / wallMs) * 20)))
        : '';
    const start = r.start != null ? `+${r.start}ms`.padStart(7) : '   n/a';
    const dur = r.ms != null ? `${r.ms}ms`.padStart(6) : '   n/a';
    const err = r.error ? ` ERR:${r.error.slice(0, 40)}` : '';
    return `  ${r.name.padEnd(16)} start${start}  dur${dur}  ${bar}${err}`;
  });
  console.log(
    `[pr-plus] fetchPrDetail parallel REST summary\n` +
      `  wall=${Math.round(wallMs)}ms  sum=${sum}ms  ` +
      `slowest=${slowest ? `${slowest.name}@${slowest.ms}ms` : 'n/a'}\n` +
      (lines.length ? lines.join('\n') : '  (no rows)')
  );
  timings.coreParallel = {
    wallMs: Math.round(wallMs),
    sumMs: sum,
    slowest: slowest ? { name: slowest.name, ms: slowest.ms } : null,
    byName: Object.fromEntries(rows.map((r) => [r.name, r.ms])),
  };
}

/**
 * Sleep helper for mergeability re-fetch (GitHub starts compute on first GET).
 * @param {number} ms
 */
function sleepMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms || 0)));
}

/**
 * Dual-modified paths since merge-base (base tip ∩ head) ≈ conflict file list.
 * Uses current base-branch tip (not stale pr.base.sha) so behind PRs work.
 * Soft-fails to [] on any error.
 *
 * @returns {Promise<string[]>}
 */
async function fetchConflictFilePaths(
  owner,
  repo,
  baseRef,
  headSha,
  fetchImpl,
  token
, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const o = String(owner || '').trim();
  const r = String(repo || '').trim();
  const ref = String(baseRef || '').trim();
  const head = String(headSha || '').trim();
  if (!o || !r || !ref || !head) return [];
  try {
    const baseUrl = githubRestUrl(`/repos/${o}/${r}`, ctx);
    const refJson = await apiJson(
      `${baseUrl}/git/ref/heads/${encodeURIComponent(ref)}`,
      fetchImpl,
      token
    );
    const baseTip = String(refJson?.object?.sha || '').trim();
    if (!baseTip) return [];
    const headVsBase = await apiJson(
      `${baseUrl}/compare/${encodeURIComponent(baseTip)}...${encodeURIComponent(head)}`,
      fetchImpl,
      token
    );
    const mergeBase = String(headVsBase?.merge_base_commit?.sha || '').trim();
    if (!mergeBase) return [];
    const [baseSide, headSide] = await Promise.all([
      apiJson(
        `${baseUrl}/compare/${encodeURIComponent(mergeBase)}...${encodeURIComponent(baseTip)}?per_page=100`,
        fetchImpl,
        token
      ),
      apiJson(
        `${baseUrl}/compare/${encodeURIComponent(mergeBase)}...${encodeURIComponent(head)}?per_page=100`,
        fetchImpl,
        token
      ),
    ]);
    const onBase = new Set(
      (Array.isArray(baseSide?.files) ? baseSide.files : [])
        .map((f) => String(f?.filename || f?.previous_filename || '').trim())
        .filter(Boolean)
    );
    const conflicts = [];
    for (const f of Array.isArray(headSide?.files) ? headSide.files : []) {
      const path = String(f?.filename || '').trim();
      if (path && onBase.has(path)) conflicts.push(path);
    }
    return conflicts;
  } catch (err) {
    if (
      err?.name === 'AbortError' ||
      /aborted|AbortError/i.test(String(err?.message || ''))
    ) {
      throw err;
    }
    console.log(
      `[pr-plus] fetchConflictFilePaths: soft-fail ${err?.message || err}`
    );
    return [];
  }
}

/**
 * Ensure mergeable/mergeable_state are computed; when dirty, attach conflict paths.
 * @returns {Promise<object>} pr with optional `_conflictFiles`
 */
async function resolvePrMergeability(
  pr,
  base,
  pullNumber,
  fetchImpl,
  token,
  timings,
  /** @type {{ owner?: string, repo?: string, apiCtx?: object }} */
  meta = {}
) {
  if (!pr || typeof pr !== 'object') return pr;
  let out = pr;
  const apiCtx = normalizeApiCtx(meta?.apiCtx || meta?.ctx);
  const needsCompute =
    out.mergeable == null ||
    out.mergeable === undefined ||
    !String(out.mergeable_state || '').trim() ||
    String(out.mergeable_state || '').toLowerCase() === 'unknown';

  if (needsCompute) {
    try {
      // Brief pause so GitHub's background job can finish after the first GET
      await sleepMs(350);
      const again = await timedFetch(
        timings,
        'pullMergeable',
        apiJson(`${base}/pulls/${pullNumber}`, fetchImpl, token),
        (p) =>
          `(mergeable=${p?.mergeable} state=${p?.mergeable_state || '?'})`
      );
      if (again && typeof again === 'object') {
        out = {
          ...out,
          mergeable: again.mergeable,
          mergeable_state: again.mergeable_state,
          rebaseable:
            again.rebaseable != null ? again.rebaseable : out.rebaseable,
          merge_commit_sha: again.merge_commit_sha || out.merge_commit_sha,
        };
      }
    } catch (err) {
      if (
        err?.name === 'AbortError' ||
        /aborted|AbortError/i.test(String(err?.message || ''))
      ) {
        throw err;
      }
      console.log(
        `[pr-plus] resolvePrMergeability re-fetch: soft-fail ${err?.message || err}`
      );
    }
  }

  const state = String(out.mergeable_state || '').toLowerCase();
  const isDirty =
    state === 'dirty' ||
    (out.mergeable === false && state !== 'blocked' && state !== 'clean');

  if (isDirty) {
    const baseOwner =
      out.base?.repo?.owner?.login ||
      String(meta.owner || '').trim() ||
      null;
    const baseRepo =
      out.base?.repo?.name || String(meta.repo || '').trim() || null;
    const conflictFiles = await timedFetch(
      timings,
      'conflictFiles',
      fetchConflictFilePaths(
        baseOwner,
        baseRepo,
        out.base?.ref || '',
        out.head?.sha || '',
        fetchImpl,
        token,
        apiCtx
      ).catch(() => []),
      (list) => `(${Array.isArray(list) ? list.length : 0} paths)`
    );
    out = {
      ...out,
      _conflictFiles: Array.isArray(conflictFiles) ? conflictFiles : [],
    };
  } else {
    out = { ...out, _conflictFiles: [] };
  }
  return out;
}

async function fetchPrDetail(
  owner,
  repo,
  pullNumber,
  fetchImpl,
  token = null,
  opts = {}
) {
  const ctx = normalizeApiCtx(opts?.ctx);
  const base = githubRestUrl(`/repos/${owner}/${repo}`, ctx);
  const n = Number(pullNumber);
  const skipReviewThreads = Boolean(opts.skipReviewThreads);
  const threadsMaxPages = skipReviewThreads
    ? 0
    : Math.max(1, Math.min(20, Number(opts.threadsMaxPages) || 1));
  /** @type {Record<string, number|string>} */
  const timings = {};
  const tTotal0 = fetchNowMs();
  console.log(
    `[pr-plus] fetchPrDetail start ${owner}/${repo}#${n}` +
      ` skipReviewThreads=${skipReviewThreads} threadsMaxPages=${threadsMaxPages}`
  );

  // Lean core: pull identity + viewer + autolinks only.
  // files / issue comments / reviews / commits / checks / development are
  // independent host fetches (do not block header + description paint).
  const PARALLEL_REST_KEYS = ['pull', 'viewerLogin', 'autolinks'];
  const tParallel0 = fetchNowMs();
  const batchOpt = { batchStart: tParallel0 };
  let [pr, viewerLogin, autolinks] = await Promise.all([
    timedFetch(
      timings,
      'pull',
      apiJson(`${base}/pulls/${n}`, fetchImpl, token),
      null,
      batchOpt
    ),
    timedFetch(
      timings,
      'viewerLogin',
      fetchViewerLogin(fetchImpl, token, ctx),
      null,
      batchOpt
    ),
    timedFetch(
      timings,
      'autolinks',
      fetchRepoAutolinks(owner, repo, fetchImpl, token, ctx),
      (r) => `(${Array.isArray(r) ? r.length : 0} links)`,
      batchOpt
    ),
  ]);
  const parallelWall = fetchNowMs() - tParallel0;
  timings.coreParallelWall = Math.round(parallelWall);
  logParallelRestSummary(timings, PARALLEL_REST_KEYS, parallelWall);
  timings.files = 0;
  timings.issueComments = 0;
  timings.reviews = 0;
  timings.commits = 0;
  timings.commitStatus = 0;
  timings.checkRuns = 0;
  timings.sidebarMeta = 0;
  timings.gitattributes = 0;
  console.log(
    '[pr-plus] fetchPrDetail files/comments/reviews/commits/checks/development: deferred (independent fetches)'
  );
  const files = [];
  const commentsPage = {
    items: [],
    meta: {
      page: 1,
      perPage: COMMENT_PAGE_SIZE,
      hasMore: false,
      nextPage: null,
      order: 'from-end',
      loadedCount: 0,
    },
  };
  const reviews = [];

  // GitHub computes mergeable async on first GET (often null/unknown).
  // Re-fetch once so conflict (dirty) is not mislabeled as "still calculating".
  pr = await resolvePrMergeability(pr, base, n, fetchImpl, token, timings, {
    owner,
    repo,
    apiCtx: ctx,
  });

  // GraphQL viewerSubscription (REST issues/.../subscription is 404 / dead)
  const subscription = await timedFetch(
    timings,
    'subscription',
    token
      ? fetchPullRequestSubscription(
          owner,
          repo,
          n,
          fetchImpl,
          token,
          pr?.node_id || null,
          ctx
        )
      : Promise.resolve(null)
  );
  const comments = commentsPage?.items || [];

  // First page (or zero) of review threads — not the full 500+ dump
  let reviewThreadBundle = {
    threads: [],
    comments: [],
    hasMore: false,
    endCursor: null,
    pageCount: 0,
  };
  if (token && threadsMaxPages > 0) {
    reviewThreadBundle = await timedFetch(
      timings,
      'reviewThreads',
      fetchPullReviewThreadsBundle(owner, repo, n, fetchImpl, token, {
        cursor: opts.threadsCursor || null,
        maxPages: threadsMaxPages,
        ctx,
      }).catch((err) => {
        if (err?.name === 'AbortError' || /aborted|AbortError/i.test(String(err?.message || ''))) {
          throw err;
        }
        return reviewThreadBundle;
      }),
      (b) =>
        `(${(b?.threads || []).length} threads, ${(b?.comments || []).length} comments)`
    );
  } else {
    timings.reviewThreads = 0;
    console.log(
      `[pr-plus] fetchPrDetail reviewThreads: skipped (token=${Boolean(
        token
      )} maxPages=${threadsMaxPages})`
    );
  }

  const reviewThreads = reviewThreadBundle?.threads || [];
  // PENDING-only REST rows when GraphQL misses them (reviews list is independent;
  // pending bundle finds PENDING via its own lookup when preloaded reviews empty).
  let pendingBundle = { comments: [], review: null };
  if (token) {
    pendingBundle = await timedFetch(
      timings,
      'pendingReview',
      fetchViewerPendingReviewBundle(
        owner,
        repo,
        n,
        fetchImpl,
        token,
        {
          reviews: [],
          login: viewerLogin,
        },
        ctx
      ).catch((err) => {
        if (err?.name === 'AbortError' || /aborted|AbortError/i.test(String(err?.message || ''))) {
          throw err;
        }
        return { comments: [], review: null };
      }),
      (b) => `(${(b?.comments || []).length} pending comments)`
    );
  } else {
    timings.pendingReview = 0;
    console.log('[pr-plus] fetchPrDetail pendingReview: skipped (no token)');
  }
  const pendingReviewComments = pendingBundle.comments || [];
  const reviewComments = mergePendingReviewComments(
    reviewThreadBundle?.comments || [],
    pendingReviewComments
  );
  const viewerPendingReview = pendingBundle.review || null;
  const reviewCommentsMeta = {
    page: 1,
    perPage: (reviewThreadBundle?.comments || []).length || COMMENT_PAGE_SIZE,
    hasMore: Boolean(reviewThreadBundle?.hasMore),
    nextPage: null,
    loadedCount: (reviewComments || []).length,
  };
  const reviewThreadsMeta = reviewThreadBundle?.reviewThreadsMeta
    ? { ...reviewThreadBundle.reviewThreadsMeta }
    : {
        ...emptyReviewThreadsMeta(),
        hasMore: Boolean(reviewThreadBundle?.hasMore),
        endCursor: reviewThreadBundle?.endCursor || null,
        loadedThreadCount: (reviewThreads || []).length,
        loadedCommentCount: (reviewThreadBundle?.comments || []).length,
        pagesLoaded: reviewThreadBundle?.pageCount || (threadsMaxPages > 0 ? 1 : 0),
        totalCount: Number(reviewThreadBundle?.totalCount) || (reviewThreads || []).length,
        hiddenCount: Math.max(
          0,
          (Number(reviewThreadBundle?.totalCount) || 0) - (reviewThreads || []).length
        ),
      };

  const headSha = pr.head?.sha || '';
  // files / comments / reviews / checks / commits / development: independent host fetches
  const checks = { state: 'unknown', totalCount: 0, statuses: [], checkRuns: [] };
  const commits = [];
  let linkedIssues = [];
  const developmentIssues = [];
  const projects = [];
  try {
    let editApi =
      typeof globalThis !== 'undefined' ? globalThis.PRModalPrEditApi : null;
    if (!editApi && typeof require === 'function') {
      try {
        editApi = require('./modal/pure/pr-edit-api.js');
      } catch {
        editApi = null;
      }
    }
    // Sync body #N only — GraphQL Development is independent (fetchPrDevelopment)
    if (editApi?.parseLinkedIssueNumbers) {
      linkedIssues = editApi.parseLinkedIssueNumbers(pr.body || '');
    }
  } catch {
    linkedIssues = [];
  }

  // gitattributes + file annotate moved to fetchPrFiles (independent)
  const gitattributesText = '';
  const filesOut = [];
  timings.mapAnnotateFiles = 0;

  const subscribed =
    subscription && typeof subscription.subscribed === 'boolean'
      ? Boolean(subscription.subscribed)
      : null;
  // subscription.viewerSubscription kept for debugging / future UI (IGNORED)

  // Magic links from title/body/branch (body-only tokens e.g. ENG-99 must match)
  const magicLinks = matchAutolinksInText(
    prMatchText({
      title: pr.title,
      body: pr.body || '',
      headRef: pr.head?.ref || '',
      baseRef: pr.base?.ref || '',
      author: pr.user?.login || '',
    }),
    Array.isArray(autolinks) ? autolinks : []
  );

  timings.total = Math.round(fetchNowMs() - tTotal0);
  console.log(
    `[pr-plus] fetchPrDetail total: ${timings.total}ms`,
    JSON.stringify(timings)
  );
  if (typeof console.table === 'function') {
    try {
      console.table(timings);
    } catch {
      /* ignore */
    }
  }

  return {
    owner,
    repo,
    number: pr.number,
    nodeId: pr.node_id || null,
    title: pr.title,
    body: pr.body || '',
    state: pr.state,
    draft: Boolean(pr.draft),
    author: pr.user?.login || '',
    authorAvatarUrl: pr.user?.avatar_url || '',
    viewerLogin: viewerLogin || null,
    baseRef: pr.base?.ref || '',
    headRef: pr.head?.ref || '',
    baseSha: pr.base?.sha || '',
    /** Repo that owns the base ref (usually same as PR repo). */
    baseOwner: pr.base?.repo?.owner?.login || owner,
    baseRepo: pr.base?.repo?.name || repo,
    /** Head may be a fork — prefer head.repo when present. */
    headOwner: pr.head?.repo?.owner?.login || pr.head?.user?.login || owner,
    headRepo: pr.head?.repo?.name || repo,
    headSha,
    magicLinks,
    htmlUrl: pr.html_url,
    merged: Boolean(pr.merged),
    mergeable: pr.mergeable,
    mergeableState: pr.mergeable_state || null,
    /** Paths that appear modified on both base tip and head (conflict candidates). */
    conflictFiles: Array.isArray(pr._conflictFiles) ? pr._conflictFiles : [],
    rebaseable: pr.rebaseable ?? null,
    createdAt: pr.created_at,
    updatedAt: pr.updated_at,
    additions: pr.additions,
    deletions: pr.deletions,
    changedFiles: pr.changed_files,
    /** Total commits on the PR (REST field); may exceed first page of commits[]. */
    commitsCount: pr.commits != null ? Number(pr.commits) : null,
    labels: Array.isArray(pr.labels)
      ? pr.labels.map((l) => ({
          name: l.name || '',
          color: l.color || '',
          description: l.description || '',
        }))
      : [],
    assignees: Array.isArray(pr.assignees)
      ? pr.assignees.map((u) => u.login || u).filter(Boolean)
      : [],
    /** login → avatar_url for people chips when API provided them */
    avatarUrls: (() => {
      const map = {};
      const putUser = (u) => {
        const login = u?.login || (typeof u === 'string' ? u : '');
        const url = u?.avatar_url || '';
        if (login && url) map[String(login).toLowerCase()] = url;
      };
      putUser(pr.user);
      for (const u of pr.assignees || []) putUser(u);
      for (const u of pr.requested_reviewers || []) putUser(u);
      for (const c of comments || []) putUser(c?.user);
      for (const r of reviews || []) putUser(r?.user);
      for (const c of reviewComments || []) putUser(c?.user);
      return map;
    })(),
    /**
     * login (lower) → true when GitHub user.type is Bot (or [bot] login).
     * Used to hide re-request / remove for bot reviewers & assignees.
     */
    actorIsBot: (() => {
      const map = {};
      const put = (u) => {
        const login = u?.login || (typeof u === 'string' ? u : '');
        if (!login) return;
        const key = String(login).toLowerCase();
        const type = String(u?.type || '').toLowerCase();
        if (type === 'bot' || /\[bot\]$/i.test(String(login))) map[key] = true;
      };
      for (const u of pr.assignees || []) put(u);
      for (const u of pr.requested_reviewers || []) put(u);
      for (const r of reviews || []) put(r?.user);
      for (const c of comments || []) put(c?.user);
      for (const c of reviewComments || []) put(c?.user);
      return map;
    })(),
    requestedReviewers: Array.isArray(pr.requested_reviewers)
      ? pr.requested_reviewers.map((u) => u.login || u).filter(Boolean)
      : [],
    requestedTeams: Array.isArray(pr.requested_teams)
      ? pr.requested_teams.map((t) => t.slug || t.name).filter(Boolean)
      : [],
    milestone: pr.milestone
      ? {
          number: pr.milestone.number,
          title: pr.milestone.title || '',
          state: pr.milestone.state || '',
          dueOn: pr.milestone.due_on || null,
        }
      : null,
    linkedIssues,
    /** Issues linked for Development (closing refs / body #N). */
    developmentIssues,
    /** ProjectV2 boards this PR is on. */
    projects,
    subscribed,
    locked: Boolean(pr.locked),
    gitattributesText,
    files: filesOut,
    comments: Array.isArray(comments) ? comments : [],
    commentsMeta: commentsPage?.meta || {
      page: 1,
      perPage: COMMENT_PAGE_SIZE,
      hasMore: false,
      nextPage: null,
      loadedCount: Array.isArray(comments) ? comments.length : 0,
    },
    // Populated by independent fetchPrReviews
    reviews: Array.isArray(reviews) ? reviews : [],
    // GraphQL first page (or empty if skipReviewThreads) — more via fetchReviewThreadsPage
    reviewComments: Array.isArray(reviewComments) ? reviewComments : [],
    reviewCommentsMeta,
    reviewThreads: Array.isArray(reviewThreads) ? reviewThreads : [],
    reviewThreadsMeta,
    /**
     * Viewer's unsubmitted PENDING review (if any), including replies that only
     * appear via GET /reviews/{id}/comments.
     */
    viewerPendingReview,
    // Populated by independent side fetches (host)
    commits: Array.isArray(commits) ? commits : [],
    checks,
    /** Debug: per-request ms from this fetchPrDetail call */
    _fetchTimings: timings,
  };
}

async function postIssueComment(owner, repo, issueNumber, body, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/issues/${issueNumber}/comments`, ctx),
    fetchImpl,
    token,
    { method: 'POST', body: { body } }
  );
}

/**
 * @param {'APPROVE'|'REQUEST_CHANGES'|'COMMENT'} event
 * @param {Array} [comments] pending inline comments for bulk submit
 */
async function submitPullReview(
  owner,
  repo,
  pullNumber,
  { event, body = '', commitId, comments },
  fetchImpl,
  token
, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const payload = { event, body: body || '' };
  if (commitId) payload.commit_id = commitId;
  if (Array.isArray(comments) && comments.length) {
    payload.comments = comments.map((c) => {
      const row = {
        path: c.path,
        body: c.body,
        line: c.line,
        side: c.side || 'RIGHT',
      };
      if (c.start_line != null || c.startLine != null) {
        const sl = c.start_line != null ? c.start_line : c.startLine;
        if (Number(sl) !== Number(c.line)) {
          row.start_line = Number(sl);
          row.start_side = c.start_side || c.startSide || c.side || 'RIGHT';
        }
      }
      return row;
    });
  }
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/pulls/${pullNumber}/reviews`, ctx),
    fetchImpl,
    token,
    { method: 'POST', body: payload }
  );
}

/**
 * GraphQL: add a new review *thread* (line or file comment) onto an existing PENDING review.
 * REST POST /comments creates a second pending review → 422.
 */
async function postReviewCommentViaPendingGraphql(
  pendingReviewNodeId,
  { body, path, line, side = 'RIGHT', startLine, startSide, subjectType = 'line' },
  fetchImpl,
  token,
  ctx = null
) {
  ctx = normalizeApiCtx(ctx);
  const isFile = String(subjectType || '').toLowerCase() === 'file';
  const hasRange =
    !isFile &&
    startLine != null &&
    Number.isFinite(Number(startLine)) &&
    Number(startLine) !== Number(line);
  const variables = {
    review: String(pendingReviewNodeId),
    body: String(body || '').trim(),
    path: String(path || ''),
  };
  let query;
  if (isFile) {
    query = `mutation($review:ID!,$body:String!,$path:String!){
      addPullRequestReviewThread(input:{
        pullRequestReviewId:$review
        body:$body
        path:$path
        subjectType:FILE
      }){
        thread {
          id
          comments(first:1){
            nodes{
              id
              databaseId
              body
              path
              createdAt
              author { login avatarUrl }
              pullRequestReview { databaseId }
            }
          }
        }
      }
    }`;
  } else if (hasRange) {
    variables.line = Number(line);
    variables.side =
      String(side || 'RIGHT').toUpperCase() === 'LEFT' ? 'LEFT' : 'RIGHT';
    variables.startLine = Number(startLine);
    variables.startSide =
      String(startSide || side || 'RIGHT').toUpperCase() === 'LEFT' ? 'LEFT' : 'RIGHT';
    query = `mutation($review:ID!,$body:String!,$path:String!,$line:Int!,$side:DiffSide!,$startLine:Int!,$startSide:DiffSide!){
      addPullRequestReviewThread(input:{
        pullRequestReviewId:$review
        body:$body
        path:$path
        line:$line
        side:$side
        startLine:$startLine
        startSide:$startSide
      }){
        thread {
          id
          comments(first:1){
            nodes{
              id
              databaseId
              body
              path
              createdAt
              author { login avatarUrl }
              pullRequestReview { databaseId }
            }
          }
        }
      }
    }`;
  } else {
    variables.line = Number(line);
    variables.side =
      String(side || 'RIGHT').toUpperCase() === 'LEFT' ? 'LEFT' : 'RIGHT';
    query = `mutation($review:ID!,$body:String!,$path:String!,$line:Int!,$side:DiffSide!){
      addPullRequestReviewThread(input:{
        pullRequestReviewId:$review
        body:$body
        path:$path
        line:$line
        side:$side
      }){
        thread {
          id
          comments(first:1){
            nodes{
              id
              databaseId
              body
              path
              createdAt
              author { login avatarUrl }
              pullRequestReview { databaseId }
            }
          }
        }
      }
    }`;
  }
  const data = await apiGraphql(query, variables, fetchImpl, token, ctx);
  const thread = data?.addPullRequestReviewThread?.thread;
  const node = thread?.comments?.nodes?.[0];
  if (!node) {
    throw new Error(
      isFile
        ? `Could not add pending file comment on ${path}.`
        : `Could not add pending comment on ${path}:${line} (${side || 'RIGHT'}). ` +
            `The line may be outside the diff or on the wrong side.`
    );
  }
  const threadNodeId = thread?.id || null;
  const rest = mapGraphqlReviewCommentToRest(node, {
    body,
    path,
    line: isFile ? null : line,
    startLine: hasRange ? Number(startLine) : null,
    side,
    inReplyToId: null,
  });
  return {
    ...rest,
    // GraphQL/REST often omit line on pending comments — keep selection line for UI
    line: isFile ? null : rest.line ?? Number(line),
    path: rest.path || path,
    side: side || 'RIGHT',
    start_line: hasRange ? Number(startLine) : null,
    start_side: hasRange ? startSide || side || 'RIGHT' : null,
    subject_type: isFile ? 'file' : 'line',
    pending: true,
    pendingReviewId: node.pullRequestReview?.databaseId ?? null,
    threadNodeId,
  };
}

/**
 * Resolve the viewer's PENDING review, creating one if needed (asPending).
 * Recovers from 422 "one pending review" by re-fetching the existing review.
 * Always re-GETs the review so discarded/stale list entries (with a dead
 * node_id) are not returned after Discard.
 */
async function ensureViewerPendingReview(
  owner,
  repo,
  pullNumber,
  { commitId = null, createIfMissing = false } = {},
  fetchImpl,
  token
, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  /** Re-fetch review; return null if missing or no longer PENDING. */
  const hydrateNodeId = async (pending) => {
    if (!pending?.id) return null;
    try {
      const full = await apiJson(
        githubRestUrl(`/repos/${owner}/${repo}/pulls/${pullNumber}/reviews/${pending.id}`, ctx),
        fetchImpl,
        token
      );
      if (!full || String(full.state || '').toUpperCase() !== 'PENDING') {
        return null;
      }
      return {
        id: Number(pending.id),
        node_id: full.node_id || pending.node_id || null,
      };
    } catch (err) {
      // 404 after discard — list can briefly still show the dead PENDING row
      if (err?.status === 404) return null;
      // Keep list node_id only when re-GET is unavailable (network); prefer null
      // over a known-dead id when status is 4xx.
      if (err?.status >= 400 && err?.status < 500) return null;
      return pending?.node_id
        ? { id: Number(pending.id), node_id: pending.node_id }
        : null;
    }
  };

  let pending = await findViewerPendingReview(
    owner,
    repo,
    pullNumber,
    fetchImpl,
    token
  );
  pending = await hydrateNodeId(pending);
  if (pending?.node_id) return pending;
  if (!createIfMissing) return pending;

  try {
    const created = await createPendingPullReview(
      owner,
      repo,
      pullNumber,
      { commitId },
      fetchImpl,
      token
    );
    return {
      id: Number(created?.id),
      node_id: created?.node_id || null,
    };
  } catch (err) {
    // Already have a PENDING review (race or find missed it) — attach to it
    const msg = String(err?.message || err || '');
    if (
      err?.status === 422 ||
      /one pending review/i.test(msg) ||
      /Unprocessable Entity/i.test(msg)
    ) {
      pending = await findViewerPendingReview(
        owner,
        repo,
        pullNumber,
        fetchImpl,
        token
      );
      pending = await hydrateNodeId(pending);
      if (pending?.node_id) return pending;
    }
    throw err;
  }
}

/**
 * Review comment on a PR file (line-level or file-level).
 * Prefer commit_id + path + line (side RIGHT). Multi-line uses start_line/start_side.
 * File-level: subject_type: 'file' (line omitted).
 *
 * Unified pending model (single GitHub PENDING review):
 * - asPending: true → create PENDING review if needed, always attach via GraphQL
 * - existing PENDING (any path) → GraphQL attach (REST would 422)
 * - else → REST published single comment
 *
 * @param {object} fields
 * @param {boolean} [fields.asPending] Start review / Add comment — always pending
 * @param {'line'|'file'} [fields.subjectType]
 */
async function postReviewComment(
  owner,
  repo,
  pullNumber,
  {
    body,
    path,
    line,
    side = 'RIGHT',
    commitId,
    startLine,
    startSide,
    asPending = false,
    subjectType = 'line',
  },
  fetchImpl,
  token
, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const text = String(body || '').trim();
  if (!text) throw new Error('Comment body is required');
  if (!path) throw new Error('path is required');
  const isFile = String(subjectType || '').toLowerCase() === 'file';
  if (!isFile && line == null) throw new Error('path and line are required');

  // Unified PENDING: attach to existing, or create (asPending). Recover from 422.
  let pending = await ensureViewerPendingReview(
    owner,
    repo,
    pullNumber,
    {
      commitId: commitId || null,
      // Create only when caller wants pending; also create path recovers on 422
      createIfMissing: Boolean(asPending),
    },
    fetchImpl,
    token
  );

  const gqlFields = {
    body: text,
    path,
    line: isFile ? null : line,
    side,
    startLine: isFile ? null : startLine,
    startSide: isFile ? null : startSide,
    subjectType: isFile ? 'file' : 'line',
  };

  // Existing PENDING (or just created) → always GraphQL attach (REST 422s)
  if (pending?.node_id) {
    try {
      const raw = await postReviewCommentViaPendingGraphql(
        pending.node_id,
        gqlFields,
        fetchImpl,
        token,
        ctx
      );
      return {
        ...raw,
        pending: true,
        pendingReviewId: raw.pendingReviewId || pending.id || null,
      };
    } catch (err) {
      // Discarded review can linger in the list with a dead GraphQL node id.
      const msg = String(err?.message || err || '');
      if (
        asPending &&
        /Could not resolve to a node|global id|NOT_FOUND|Could not find/i.test(msg)
      ) {
        // Force a fresh PENDING review and retry once
        try {
          const created = await createPendingPullReview(
            owner,
            repo,
            pullNumber,
            { commitId: commitId || null },
            fetchImpl,
            token,
            ctx
          );
          pending = {
            id: Number(created?.id),
            node_id: created?.node_id || null,
          };
        } catch (createErr) {
          if (
            createErr?.status === 422 ||
            /one pending review/i.test(String(createErr?.message || ''))
          ) {
            pending = await ensureViewerPendingReview(
              owner,
              repo,
              pullNumber,
              { commitId: commitId || null, createIfMissing: false },
              fetchImpl,
              token,
              ctx
            );
          } else {
            throw createErr;
          }
        }
        if (pending?.node_id) {
          const raw = await postReviewCommentViaPendingGraphql(
            pending.node_id,
            gqlFields,
            fetchImpl,
            token,
            ctx
          );
          return {
            ...raw,
            pending: true,
            pendingReviewId: raw.pendingReviewId || pending.id || null,
          };
        }
      }
      throw err;
    }
  }

  // asPending but still no node_id — cannot attach
  if (asPending) {
    throw new Error(
      'Could not start or find a pending review. Try Discard any leftover pending review, then retry.'
    );
  }

  // Published single comment (no PENDING review)
  const payload = isFile
    ? { body: text, path, subject_type: 'file' }
    : { body: text, path, line, side };
  if (commitId) payload.commit_id = commitId;
  if (!isFile && startLine != null && Number(startLine) !== Number(line)) {
    payload.start_line = Number(startLine);
    payload.start_side = startSide || side || 'RIGHT';
  }
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/pulls/${pullNumber}/comments`, ctx),
    fetchImpl,
    token,
    { method: 'POST', body: payload }
  );
}

/**
 * Viewer's PENDING review on a PR (at most one). Used because REST
 * POST /comments and /replies 422 with:
 * "user_id can only have one pending review per pull request".
 * @returns {Promise<{ id: number, node_id: string|null }|null>}
 */
async function findViewerPendingReview(owner, repo, pullNumber, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  if (!token) return null;
  const n = Number(pullNumber);
  if (!Number.isFinite(n)) return null;
  try {
    const [reviews, login] = await Promise.all([
      apiJson(
        githubRestUrl(`/repos/${owner}/${repo}/pulls/${n}/reviews?per_page=100`, ctx),
        fetchImpl,
        token
      ).catch(() => []),
      fetchViewerLogin(fetchImpl, token).catch(() => null),
    ]);
    return pickViewerPendingFromReviews(reviews, login);
  } catch {
    return null;
  }
}

/**
 * Map GraphQL review-comment payload → REST-like shape (mapRestReviewComment).
 */

function mapGraphqlReviewCommentToRest(c, fallback = {}) {
  if (!c) return null;
  return {
    id: c.databaseId ?? fallback.id ?? null,
    node_id: c.id || null,
    body: c.body || fallback.body || '',
    path: c.path || fallback.path || '',
    line: c.line ?? fallback.line ?? null,
    original_line: c.originalLine ?? null,
    start_line: c.startLine ?? fallback.startLine ?? null,
    side: c.side || fallback.side || 'RIGHT',
    start_side: c.startSide || null,
    diff_hunk: c.diffHunk || '',
    created_at: c.createdAt || fallback.createdAt || null,
    in_reply_to_id:
      c.replyTo?.databaseId ??
      c.replyTo?.id ??
      fallback.inReplyToId ??
      fallback.in_reply_to_id ??
      null,
    user: {
      login: c.author?.login || fallback.author || '',
      avatar_url: c.author?.avatarUrl || fallback.avatarUrl || '',
    },
    pull_request_review_id: c.pullRequestReview?.databaseId ?? null,
  };
}

/**
 * GraphQL: addPullRequestReviewThreadReply — works with or without a pending
 * review (attaches to pending when one exists).
 */
async function replyViaThreadGraphql(threadNodeId, body, fetchImpl, token, fallback = {}, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const data = await apiGraphql(
    `mutation($id:ID!,$body:String!){
      addPullRequestReviewThreadReply(input:{pullRequestReviewThreadId:$id,body:$body}){
        comment {
          id
          databaseId
          body
          path
          diffHunk
          createdAt
          author { login avatarUrl }
          replyTo { databaseId }
          pullRequestReview { databaseId }
        }
      }
    }`,
    { id: String(threadNodeId), body: String(body) },
    fetchImpl,
    token,
    ctx
  );
  const c = data?.addPullRequestReviewThreadReply?.comment;
  if (!c) throw new Error('GraphQL thread reply returned no comment');
  return mapGraphqlReviewCommentToRest(c, fallback);
}

/**
 * GraphQL: addPullRequestReviewComment on an existing PENDING review.
 */
async function replyViaPendingReviewGraphql(
  pendingReviewNodeId,
  parentCommentNodeId,
  body,
  fetchImpl,
  token,
  fallback = {},
  ctx = null
) {
  ctx = normalizeApiCtx(ctx);
  const data = await apiGraphql(
    `mutation($review:ID!,$body:String!,$inReplyTo:ID!){
      addPullRequestReviewComment(input:{
        pullRequestReviewId:$review
        body:$body
        inReplyTo:$inReplyTo
      }){
        comment {
          id
          databaseId
          body
          path
          diffHunk
          createdAt
          author { login avatarUrl }
          replyTo { databaseId }
          pullRequestReview { databaseId }
        }
      }
    }`,
    {
      review: String(pendingReviewNodeId),
      body: String(body),
      inReplyTo: String(parentCommentNodeId),
    },
    fetchImpl,
    token
  );
  const c = data?.addPullRequestReviewComment?.comment;
  if (!c) throw new Error('GraphQL pending-review reply returned no comment');
  return mapGraphqlReviewCommentToRest(c, fallback);
}

/**
 * Resolve parent comment GraphQL node id (PRRC_…) for pending-review replies.
 * Published comments: GET /pulls/comments/{id}.
 * PENDING comments are omitted from that endpoint (404) — fall back to the
 * viewer's pending-review comment list (or a known node id from UI state).
 */
async function resolveParentCommentNodeId(
  owner,
  repo,
  parentId,
  fetchImpl,
  token,
  knownNodeId,
  pullNumber = null
, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  if (knownNodeId) return String(knownNodeId);
  const id = Math.floor(Number(parentId));
  if (!Number.isFinite(id) || id <= 0) return null;
  try {
    const parent = await apiJson(
      githubRestUrl(`/repos/${owner}/${repo}/pulls/comments/${id}`, ctx),
      fetchImpl,
      token
    );
    if (parent?.node_id) return String(parent.node_id);
  } catch {
    /* pending comments 404 here — try pending review bundle below */
  }
  if (pullNumber == null || !token) return null;
  try {
    const { comments } = await fetchViewerPendingReviewBundle(
      owner,
      repo,
      pullNumber,
      fetchImpl,
      token
    );
    const hit = (comments || []).find(
      (c) => c && Number(c.id) === id && (c.nodeId || c.node_id)
    );
    if (hit) return String(hit.nodeId || hit.node_id);
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Reply to an existing pull request review comment.
 *
 * mode:
 * - `comment` (default): publish immediately when no pending review; if a
 *   PENDING review exists, GitHub only allows attaching to it (shown as pending).
 * - `pending` ("Start review" / "Add comment"): always attach to the viewer's
 *   PENDING review, creating one if needed.
 *
 * REST POST /comments and /replies 422 when a pending review already exists:
 * "user_id can only have one pending review per pull request".
 *
 * @param {object} [opts]
 * @param {'comment'|'pending'} [opts.mode]
 * @param {string} [opts.threadNodeId] GraphQL PRRT_… id
 * @param {string} [opts.parentNodeId] GraphQL PRRC_… id of parent comment
 * @param {string} [opts.commitId] head SHA when creating a new pending review
 */
async function replyToReviewComment(
  owner,
  repo,
  pullNumber,
  commentId,
  body,
  fetchImpl,
  token,
  opts = {}
) {
  const ctx = normalizeApiCtx(opts?.ctx);
  const text = String(body || '').trim();
  if (!text) throw new Error('Reply body is required');
  const parentId = Number(commentId);
  if (!Number.isFinite(parentId) || parentId <= 0) {
    throw new Error('Invalid review comment id for reply');
  }
  const n = Number(pullNumber);
  const mode = opts?.mode === 'pending' ? 'pending' : 'comment';
  const threadNodeId = opts?.threadNodeId || null;
  let parentNodeId = opts?.parentNodeId || null;
  const fallback = {
    body: text,
    inReplyToId: Math.floor(parentId),
    path: opts?.path || '',
    line: opts?.line ?? null,
    side: opts?.side || 'RIGHT',
  };

  /**
   * Attach reply onto viewer's PENDING review via GraphQL.
   * Prefer thread reply (PRRT_…) when available — works for pending threads and
   * does not need the parent PRRC_ id (which REST cannot resolve for PENDING
   * comments: GET /pulls/comments/{id} → 404).
   * Uses ensureViewerPendingReview (create + 422 recover + dead-node re-GET).
   */
  async function attachReplyToPending({ createIfMissing }) {
    const pending = await ensureViewerPendingReview(
      owner,
      repo,
      n,
      {
        commitId: opts?.commitId || null,
        createIfMissing: Boolean(createIfMissing),
      },
      fetchImpl,
      token
    );
    if (!pending?.node_id && !threadNodeId) return null;

    // 1) Thread reply — only needs pullRequestReviewThreadId
    if (threadNodeId) {
      try {
        const raw = await replyViaThreadGraphql(
          threadNodeId,
          text,
          fetchImpl,
          token,
          fallback
        );
        return {
          ...raw,
          pending: true,
          pendingReviewId: raw.pendingReviewId || pending?.id || null,
        };
      } catch {
        /* fall through to inReplyTo path */
      }
    }

    if (!pending?.node_id) return null;

    // 2) inReplyTo on the PENDING review — needs parent PRRC_ node id
    parentNodeId = await resolveParentCommentNodeId(
      owner,
      repo,
      parentId,
      fetchImpl,
      token,
      parentNodeId,
      n
    );
    if (!parentNodeId) {
      throw new Error(
        'Cannot reply while a pending review exists (missing parent comment node id).'
      );
    }
    try {
      const raw = await replyViaPendingReviewGraphql(
        pending.node_id,
        parentNodeId,
        text,
        fetchImpl,
        token,
        fallback
      );
      return { ...raw, pending: true, pendingReviewId: pending.id };
    } catch (err) {
      // Discarded/stale review node — create or re-find and retry once
      const msg = String(err?.message || err || '');
      if (
        !/Could not resolve to a node|global id|NOT_FOUND|Could not find/i.test(msg)
      ) {
        throw err;
      }
      let next = null;
      try {
        const created = await createPendingPullReview(
          owner,
          repo,
          n,
          { commitId: opts?.commitId || null },
          fetchImpl,
          token
        );
        next = {
          id: Number(created?.id),
          node_id: created?.node_id || null,
        };
      } catch (createErr) {
        if (
          createErr?.status === 422 ||
          /one pending review/i.test(String(createErr?.message || ''))
        ) {
          next = await ensureViewerPendingReview(
            owner,
            repo,
            n,
            { commitId: opts?.commitId || null, createIfMissing: false },
            fetchImpl,
            token
          );
        } else {
          throw createErr;
        }
      }
      if (!next?.node_id) throw err;
      const raw = await replyViaPendingReviewGraphql(
        next.node_id,
        parentNodeId,
        text,
        fetchImpl,
        token,
        fallback
      );
      return { ...raw, pending: true, pendingReviewId: next.id };
    }
  }

  // ── Start review / Add comment: always land on a PENDING review ──
  if (mode === 'pending') {
    const attached = await attachReplyToPending({ createIfMissing: true });
    if (attached) return attached;
    throw new Error(
      'Could not start or find a pending review for this reply. Try Discard any leftover pending review, then retry.'
    );
  }

  // ── Comment (immediate when possible) ──
  // If a PENDING review already exists, REST replies 422 — attach via GraphQL.
  const existingPending = await ensureViewerPendingReview(
    owner,
    repo,
    n,
    { createIfMissing: false },
    fetchImpl,
    token
  );
  if (existingPending?.node_id) {
    const attached = await attachReplyToPending({ createIfMissing: false });
    if (attached) return attached;
  }

  // Prefer GraphQL thread reply when we have the thread id (published path).
  if (threadNodeId) {
    try {
      const raw = await replyViaThreadGraphql(
        threadNodeId,
        text,
        fetchImpl,
        token,
        fallback
      );
      return { ...raw, pending: false };
    } catch {
      /* fall through to REST */
    }
  }

  // No pending review: REST dedicated replies endpoint (published immediately)
  try {
    return await apiSend(
      githubRestUrl(`/repos/${owner}/${repo}/pulls/${n}/comments/${Math.floor(parentId)}/replies`, ctx),
      fetchImpl,
      token,
      { method: 'POST', body: { body: text } }
    );
  } catch (err) {
    // Race: PENDING appeared between find and REST POST
    const msg = String(err?.message || err || '');
    if (
      err?.status === 422 ||
      /one pending review/i.test(msg) ||
      /Unprocessable Entity/i.test(msg)
    ) {
      const attached = await attachReplyToPending({ createIfMissing: false });
      if (attached) return attached;
    }
    throw err;
  }
}

/**
 * Resolve or unresolve a pull request review thread via GraphQL.
 * Uses apiGraphql so body.errors (HTTP 200) surface as thrown errors.
 * @param {string} threadNodeId GraphQL id (PRRT_…)
 * @param {boolean} [resolved=true]
 */
async function resolveReviewThread(threadNodeId, resolved, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  if (!threadNodeId) throw new Error('threadNodeId required to resolve review thread');
  const mutation = resolved
    ? `mutation($id:ID!){ resolveReviewThread(input:{threadId:$id}){ thread { id isResolved } } }`
    : `mutation($id:ID!){ unresolveReviewThread(input:{threadId:$id}){ thread { id isResolved } } }`;
  return apiGraphql(
    mutation,
    { id: threadNodeId },
    fetchImpl,
    token,
    ctx
  );
}

/**
 * Close or reopen a pull request.
 * @param {'open'|'closed'} state
 */
async function updatePullState(owner, repo, pullNumber, state, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const next = state === 'closed' ? 'closed' : 'open';
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/pulls/${pullNumber}`, ctx),
    fetchImpl,
    token,
    { method: 'PATCH', body: { state: next } }
  );
}

async function closePullRequest(owner, repo, pullNumber, fetchImpl, token) {
  return updatePullState(owner, repo, pullNumber, 'closed', fetchImpl, token);
}

async function reopenPullRequest(owner, repo, pullNumber, fetchImpl, token) {
  return updatePullState(owner, repo, pullNumber, 'open', fetchImpl, token);
}

/**
 * Delete a pull request review comment (own comments only on GitHub).
 * DELETE /repos/{owner}/{repo}/pulls/comments/{comment_id}
 */
async function deleteReviewComment(owner, repo, commentId, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/pulls/comments/${commentId}`, ctx),
    fetchImpl,
    token,
    { method: 'DELETE' }
  );
}

/**
 * Delete an issue comment on the PR conversation.
 * DELETE /repos/{owner}/{repo}/issues/comments/{comment_id}
 */
async function deleteIssueComment(owner, repo, commentId, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/issues/comments/${commentId}`, ctx),
    fetchImpl,
    token,
    { method: 'DELETE' }
  );
}

async function updatePullRequest(owner, repo, pullNumber, fields, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const body = {};
  if (fields?.title != null) body.title = String(fields.title);
  if (fields?.body != null) body.body = String(fields.body);
  if (fields?.base != null) body.base = String(fields.base);
  if (fields?.state != null) body.state = fields.state === 'closed' ? 'closed' : 'open';
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/pulls/${pullNumber}`, ctx),
    fetchImpl,
    token,
    { method: 'PATCH', body }
  );
}

async function editIssueComment(owner, repo, commentId, body, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/issues/comments/${commentId}`, ctx),
    fetchImpl,
    token,
    { method: 'PATCH', body: { body: String(body || '') } }
  );
}

async function editReviewComment(owner, repo, commentId, body, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/pulls/comments/${commentId}`, ctx),
    fetchImpl,
    token,
    { method: 'PATCH', body: { body: String(body || '') } }
  );
}

async function requestReviewers(
  owner,
  repo,
  pullNumber,
  { reviewers = [], teamReviewers = [] },
  fetchImpl,
  token
, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/pulls/${pullNumber}/requested_reviewers`, ctx),
    fetchImpl,
    token,
    {
      method: 'POST',
      body: { reviewers, team_reviewers: teamReviewers },
    }
  );
}

async function removeReviewers(
  owner,
  repo,
  pullNumber,
  { reviewers = [], teamReviewers = [] },
  fetchImpl,
  token
, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/pulls/${pullNumber}/requested_reviewers`, ctx),
    fetchImpl,
    token,
    {
      method: 'DELETE',
      body: { reviewers, team_reviewers: teamReviewers },
    }
  );
}

async function addAssignees(owner, repo, issueNumber, assignees, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/issues/${issueNumber}/assignees`, ctx),
    fetchImpl,
    token,
    { method: 'POST', body: { assignees: assignees || [] } }
  );
}

async function removeAssignees(owner, repo, issueNumber, assignees, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/issues/${issueNumber}/assignees`, ctx),
    fetchImpl,
    token,
    { method: 'DELETE', body: { assignees: assignees || [] } }
  );
}

async function setIssueLabels(owner, repo, issueNumber, labels, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/issues/${issueNumber}/labels`, ctx),
    fetchImpl,
    token,
    { method: 'PUT', body: { labels: labels || [] } }
  );
}

/**
 * List repository labels (name + color + description) for the label picker.
 * Paginates up to maxPages × 100.
 * @returns {Promise<Array<{ name: string, color: string, description: string }>>}
 */
async function fetchRepoLabels(owner, repo, fetchImpl, token = null, opts = {}) {
  const ctx = normalizeApiCtx(opts?.ctx);
  const perPage = 100;
  const maxPages = Math.max(1, Math.min(10, Number(opts.maxPages) || 5));
  const out = [];
  for (let page = 1; page <= maxPages; page++) {
    const url = githubRestUrl(
      `/repos/${owner}/${repo}/labels?per_page=${perPage}&page=${page}`
    , ctx);
    const batch = await apiJson(url, fetchImpl, token);
    if (!Array.isArray(batch) || !batch.length) break;
    for (const l of batch) {
      const name = String(l?.name || '').trim();
      if (!name) continue;
      out.push({
        name,
        color: String(l?.color || '')
          .trim()
          .replace(/^#/, ''),
        description: String(l?.description || ''),
      });
    }
    if (batch.length < perPage) break;
  }
  return out;
}

/** Stable-ish default color for newly created labels (hex without #). */
function defaultNewLabelColor(name) {
  const palette = [
    'd73a4a',
    '0075ca',
    'a2eeef',
    '7057ff',
    '008672',
    'e4e669',
    'd876e3',
    'fbca04',
    '0e8a16',
    '5319e7',
  ];
  const s = String(name || '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

/**
 * Create a repository label.
 * @returns {Promise<{ name: string, color: string, description: string }>}
 */
async function createRepoLabel(
  owner,
  repo,
  { name, color, description } = {},
  fetchImpl,
  token
, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const rawName = String(name || '').trim();
  if (!rawName) throw new Error('Label name is required');
  const body = {
    name: rawName,
    color: String(color || defaultNewLabelColor(rawName))
      .trim()
      .replace(/^#/, ''),
  };
  if (description != null) body.description = String(description);
  const result = await apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/labels`, ctx),
    fetchImpl,
    token,
    { method: 'POST', body }
  );
  return {
    name: String(result?.name || rawName),
    color: String(result?.color || body.color || '')
      .trim()
      .replace(/^#/, ''),
    description: String(result?.description || description || ''),
  };
}

/**
 * List repository milestones (open + closed, limited pages).
 * @returns {Promise<Array<{ number: number, title: string, state: string, description: string }>>}
 */
async function fetchRepoMilestones(owner, repo, fetchImpl, token = null, opts = {}) {
  const ctx = normalizeApiCtx(opts?.ctx);
  const perPage = 100;
  const maxPages = Math.max(1, Math.min(10, Number(opts.maxPages) || 5));
  const state = opts.state || 'all';
  const out = [];
  for (let page = 1; page <= maxPages; page++) {
    const url = githubRestUrl(
      `/repos/${owner}/${repo}/milestones?state=${encodeURIComponent(state)}&per_page=${perPage}&page=${page}&sort=due_on&direction=desc`
    , ctx);
    const batch = await apiJson(url, fetchImpl, token);
    if (!Array.isArray(batch) || !batch.length) break;
    for (const m of batch) {
      const number = Number(m?.number);
      if (!Number.isFinite(number) || number <= 0) continue;
      out.push({
        number,
        title: String(m?.title || `Milestone ${number}`),
        state: String(m?.state || ''),
        description: String(m?.description || ''),
        dueOn: m?.due_on || null,
      });
    }
    if (batch.length < perPage) break;
  }
  return out;
}

/**
 * Create a repository milestone.
 * @returns {Promise<{ number: number, title: string, state: string, description: string }>}
 */
async function createRepoMilestone(
  owner,
  repo,
  { title, description, state } = {},
  fetchImpl,
  token
, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const rawTitle = String(title || '').trim();
  if (!rawTitle) throw new Error('Milestone title is required');
  const body = { title: rawTitle, state: state === 'closed' ? 'closed' : 'open' };
  if (description != null) body.description = String(description);
  const result = await apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/milestones`, ctx),
    fetchImpl,
    token,
    { method: 'POST', body }
  );
  return {
    number: Number(result?.number) || 0,
    title: String(result?.title || rawTitle),
    state: String(result?.state || body.state),
    description: String(result?.description || description || ''),
    dueOn: result?.due_on || null,
  };
}

/**
 * List repository tags (paginated). Used to surface tags related to a PR head/commits.
 * @returns {Promise<Array<{ name: string, sha: string, zipballUrl?: string, tarballUrl?: string }>>}
 */
async function fetchRepoTags(owner, repo, fetchImpl, token = null, opts = {}) {
  const ctx = normalizeApiCtx(opts?.ctx);
  const perPage = 100;
  const maxPages = Math.max(1, Math.min(20, Number(opts.maxPages) || 10));
  const out = [];
  for (let page = 1; page <= maxPages; page++) {
    const url = githubRestUrl(
      `/repos/${owner}/${repo}/tags?per_page=${perPage}&page=${page}`
    , ctx);
    const batch = await apiJson(url, fetchImpl, token);
    if (!Array.isArray(batch) || !batch.length) break;
    for (const t of batch) {
      const name = String(t?.name || '').trim();
      const sha = String(t?.commit?.sha || t?.sha || '').trim();
      if (!name) continue;
      out.push({
        name,
        sha,
        zipballUrl: t?.zipball_url || '',
        tarballUrl: t?.tarball_url || '',
      });
    }
    if (batch.length < perPage) break;
  }
  return out;
}

/**
 * Tags whose commit sha is in `shaSet` (PR commits / head).
 * @param {string[]} shas
 * @returns {Promise<Array<{ name: string, sha: string }>>}
 */
async function fetchTagsForCommits(
  owner,
  repo,
  shas,
  fetchImpl,
  token = null,
  opts = {}
) {
  const want = new Set(
    (shas || [])
      .map((s) => String(s || '').trim().toLowerCase())
      .filter(Boolean)
  );
  if (!want.size) return [];
  const tags = await fetchRepoTags(owner, repo, fetchImpl, token, opts);
  return tags.filter((t) => want.has(String(t.sha || '').toLowerCase()));
}

/**
 * Apply a GitHub suggestion: replace lines on head branch via Contents API.
 * @param {{ path: string, headRef: string, startLine: number, endLine: number, suggestion: string, message?: string }} opts
 */
async function mergePullRequest(
  owner,
  repo,
  pullNumber,
  { mergeMethod = 'merge', commitTitle, commitMessage } = {},
  fetchImpl,
  token
, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const body = { merge_method: mergeMethod };
  if (commitTitle != null) body.commit_title = String(commitTitle);
  if (commitMessage != null) body.commit_message = String(commitMessage);
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/pulls/${pullNumber}/merge`, ctx),
    fetchImpl,
    token,
    { method: 'PUT', body }
  );
}

async function updatePullBranch(
  owner,
  repo,
  pullNumber,
  { expectedHeadSha } = {},
  fetchImpl,
  token
, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const body = {};
  if (expectedHeadSha) body.expected_head_sha = String(expectedHeadSha);
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/pulls/${pullNumber}/update-branch`, ctx),
    fetchImpl,
    token,
    { method: 'PUT', body }
  );
}

/**
 * Resolve GraphQL node id for a pull request (PR_…).
 * Prefer REST `node_id` when available; otherwise look up via GraphQL.
 */
async function resolvePullRequestNodeId(
  owner,
  repo,
  pullNumber,
  fetchImpl,
  token,
  nodeId = null
, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  if (nodeId) return String(nodeId);
  const n = Number(pullNumber);
  if (!token || !owner || !repo || !Number.isFinite(n) || n <= 0) return null;
  try {
    // Prefer REST node_id (cheap, same id GraphQL expects)
    const pr = await apiJson(
      githubRestUrl(`/repos/${owner}/${repo}/pulls/${n}`, ctx),
      fetchImpl,
      token
    );
    if (pr?.node_id) return String(pr.node_id);
  } catch {
    /* fall through */
  }
  try {
    const data = await apiGraphql(
      `query($owner:String!,$name:String!,$number:Int!){
  repository(owner:$owner, name:$name) {
    pullRequest(number:$number) { id }
  }
}`,
      { owner: String(owner), name: String(repo), number: n },
      fetchImpl,
      token,
      ctx
    );
    const id = data?.repository?.pullRequest?.id;
    return id ? String(id) : null;
  } catch {
    return null;
  }
}

/**
 * Map GraphQL SubscriptionState → app shape.
 * @param {string|null|undefined} state SUBSCRIBED | UNSUBSCRIBED | IGNORED
 */
function mapViewerSubscription(state) {
  const s = String(state || '').toUpperCase();
  if (s === 'SUBSCRIBED') return { subscribed: true, ignored: false, viewerSubscription: s };
  if (s === 'IGNORED') return { subscribed: false, ignored: true, viewerSubscription: s };
  if (s === 'UNSUBSCRIBED') {
    return { subscribed: false, ignored: false, viewerSubscription: s };
  }
  return { subscribed: null, ignored: false, viewerSubscription: s || null };
}

/**
 * Issue/PR thread subscription via GraphQL updateSubscription.
 * REST `/issues/{n}/subscription` is gone / 404 for many tokens — use GraphQL.
 *
 * @param {object} [opts]
 * @param {boolean} [opts.subscribed=true]
 * @param {boolean} [opts.ignored=false]
 * @param {string|null} [opts.nodeId] PR GraphQL id (detail.nodeId)
 */
async function setIssueSubscription(
  owner,
  repo,
  issueNumber,
  { subscribed = true, ignored = false, nodeId = null } = {},
  fetchImpl,
  token,
  ctx = null
) {
  ctx = normalizeApiCtx(ctx);
  if (!token) throw new Error('GitHub PAT required for notifications');
  const id = await resolvePullRequestNodeId(
    owner,
    repo,
    issueNumber,
    fetchImpl,
    token,
    nodeId,
    ctx
  );
  if (!id) {
    throw new Error(
      'Could not resolve pull request id for subscription. Refresh and try again.'
    );
  }
  const state = ignored ? 'IGNORED' : subscribed ? 'SUBSCRIBED' : 'UNSUBSCRIBED';
  const data = await apiGraphql(
    `mutation($id:ID!,$state:SubscriptionState!){
  updateSubscription(input:{subscribableId:$id, state:$state}) {
    subscribable {
      ... on PullRequest { id viewerSubscription }
      ... on Issue { id viewerSubscription }
    }
  }
}`,
    { id: String(id), state },
    fetchImpl,
    token
  );
  const vs = data?.updateSubscription?.subscribable?.viewerSubscription;
  return mapViewerSubscription(vs);
}

/** Unsubscribe from PR notifications (GraphQL state UNSUBSCRIBED). */
async function deleteIssueSubscription(
  owner,
  repo,
  issueNumber,
  fetchImpl,
  token,
  nodeId = null
) {
  return setIssueSubscription(
    owner,
    repo,
    issueNumber,
    { subscribed: false, ignored: false, nodeId },
    fetchImpl,
    token
  );
}

/**
 * Read viewer subscription for a PR (GraphQL). Returns null on failure.
 */
async function fetchPullRequestSubscription(
  owner,
  repo,
  pullNumber,
  fetchImpl,
  token,
  nodeId = null,
  ctx = null
) {
  ctx = normalizeApiCtx(ctx);
  if (!token) return null;
  try {
    const id = await resolvePullRequestNodeId(
      owner,
      repo,
      pullNumber,
      fetchImpl,
      token,
      nodeId,
      ctx
    );
    if (!id) return null;
    const data = await apiGraphql(
      `query($id:ID!){
  node(id:$id) {
    ... on PullRequest { viewerSubscription viewerCanSubscribe }
    ... on Issue { viewerSubscription viewerCanSubscribe }
  }
}`,
      { id: String(id) },
      fetchImpl,
      token,
      ctx
    );
    const vs = data?.node?.viewerSubscription;
    if (!vs) return null;
    return mapViewerSubscription(vs);
  } catch {
    return null;
  }
}

async function setIssueMilestone(owner, repo, issueNumber, milestoneNumber, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/issues/${issueNumber}`, ctx),
    fetchImpl,
    token,
    {
      method: 'PATCH',
      body: { milestone: milestoneNumber == null ? null : Number(milestoneNumber) },
    }
  );
}

/**
 * Convert PR to draft or mark ready for review (GraphQL; needs PR node_id).
 * @param {'draft'|'ready'} stage
 */
async function setPullRequestDraftStage(
  owner,
  repo,
  pullNumber,
  stage,
  fetchImpl,
  token,
  nodeId = null
, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  let id = nodeId;
  if (!id) {
    const pr = await apiJson(
      githubRestUrl(`/repos/${owner}/${repo}/pulls/${pullNumber}`, ctx),
      fetchImpl,
      token
    );
    id = pr?.node_id;
  }
  if (!id) throw new Error('PR node_id unavailable for draft stage change');
  let buildFn = null;
  try {
    let mod =
      typeof globalThis !== 'undefined' ? globalThis.PRModalPrEditApi : null;
    if (!mod && typeof require === 'function') {
      try {
        mod = require('./modal/pure/pr-edit-api.js');
      } catch {
        mod = null;
      }
    }
    buildFn = mod?.buildDraftStageGraphql;
  } catch {
    buildFn = null;
  }
  const gql = buildFn
    ? buildFn(stage === 'ready' ? 'ready' : 'draft', id)
    : stage === 'ready'
      ? {
          query: `mutation($id:ID!){markPullRequestReadyForReview(input:{pullRequestId:$id}){pullRequest{id isDraft}}}`,
          variables: { id },
        }
      : {
          query: `mutation($id:ID!){convertPullRequestToDraft(input:{pullRequestId:$id}){pullRequest{id isDraft}}}`,
          variables: { id },
        };
  const data = await apiGraphql(gql.query, gql.variables, fetchImpl, token, ctx);
  let parseFn = null;
  try {
    let mod =
      typeof globalThis !== 'undefined' ? globalThis.PRModalPrEditApi : null;
    if (!mod && typeof require === 'function') {
      try {
        mod = require('./modal/pure/pr-edit-api.js');
      } catch {
        mod = null;
      }
    }
    parseFn = mod?.draftFromStageGraphqlData;
  } catch {
    parseFn = null;
  }
  let draft = null;
  if (typeof parseFn === 'function') {
    draft = parseFn(data);
  } else if (data && typeof data === 'object') {
    const pr =
      data.markPullRequestReadyForReview?.pullRequest ||
      data.convertPullRequestToDraft?.pullRequest ||
      null;
    if (pr && typeof pr.isDraft === 'boolean') draft = pr.isDraft;
  }
  // Fall back to the requested stage so callers always get a boolean draft flag
  if (typeof draft !== 'boolean') {
    draft = stage !== 'ready';
  }
  return { draft: Boolean(draft), data };
}


/**
 * Upload a binary/text file via Contents API (creates or overwrites path on branch).
 * Used for comment attachments when PAT has repo contents write access.
 * @returns {{ downloadUrl: string, htmlUrl: string, path: string, sha: string }}
 */
async function uploadRepoFile(
  owner,
  repo,
  { path, contentBase64, message, branch },
  fetchImpl,
  token
, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  if (!path || !contentBase64) throw new Error('path and contentBase64 required');
  const encPath = String(path)
    .split('/')
    .map(encodeURIComponent)
    .join('/');
  // Try GET existing sha (overwrite path)
  let sha;
  try {
    const meta = await apiJson(
      githubRestUrl(
        `/repos/${owner}/${repo}/contents/${encPath}${
          branch ? `?ref=${encodeURIComponent(branch)}` : ''
        }`
      , ctx),
      fetchImpl,
      token
    );
    sha = meta?.sha;
  } catch {
    sha = undefined;
  }
  const body = {
    message: message || `Upload ${path}`,
    content: String(contentBase64).replace(/\s+/g, ''),
  };
  if (branch) body.branch = branch;
  if (sha) body.sha = sha;
  const result = await apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/contents/${encPath}`, ctx),
    fetchImpl,
    token,
    { method: 'PUT', body }
  );
  const content = result?.content || result;
  return {
    downloadUrl: content?.download_url || content?.html_url || '',
    htmlUrl: content?.html_url || content?.download_url || '',
    path: content?.path || path,
    sha: content?.sha || '',
  };
}

/**
 * Fetch a file's text content at a ref (branch or SHA).
 * @returns {{ path: string, ref: string, text: string, sha: string, size: number }}
 */
async function getRepoFileText(owner, repo, { path, ref }, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  if (!path) throw new Error('path required');
  const rev = ref || 'HEAD';
  const encPath = String(path)
    .split('/')
    .map(encodeURIComponent)
    .join('/');
  const meta = await apiJson(
    githubRestUrl(`/repos/${owner}/${repo}/contents/${encPath}?ref=${encodeURIComponent(rev)}`, ctx),
    fetchImpl,
    token
  );
  if (meta?.type && meta.type !== 'file') {
    throw new Error(`Not a file: ${path}`);
  }
  // Large files may omit content and only provide download_url
  let raw = '';
  if (meta?.content && meta?.encoding === 'base64') {
    raw = decodeBase64Utf8(String(meta.content).replace(/\n/g, ''));
  } else if (meta?.download_url) {
    const res = await fetchImpl(meta.download_url, {
      headers: buildApiHeaders(token),
    });
    if (!res.ok) {
      const err = new Error(`GitHub download ${res.status}: ${res.statusText}`);
      err.status = res.status;
      throw err;
    }
    raw = await res.text();
  } else if (meta?.content) {
    raw = decodeBase64Utf8(String(meta.content).replace(/\n/g, ''));
  }
  return {
    path: meta?.path || path,
    ref: rev,
    text: raw,
    sha: meta?.sha || '',
    size: Number(meta?.size) || raw.length,
  };
}

async function applyReviewSuggestion(
  owner,
  repo,
  { path, headRef, startLine, endLine, suggestion, message },
  fetchImpl,
  token
, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const ref = headRef || 'HEAD';
  const file = await getRepoFileText(
    owner,
    repo,
    { path, ref },
    fetchImpl,
    token
  );
  const raw = file.text || '';
  let applyFn = null;
  try {
    let mod =
      typeof globalThis !== 'undefined' ? globalThis.PRModalPrEditApi : null;
    if (!mod && typeof require === 'function') {
      try {
        mod = require('./modal/pure/pr-edit-api.js');
      } catch {
        mod = null;
      }
    }
    applyFn = mod?.applySuggestionToFileContent;
  } catch {
    applyFn = null;
  }
  if (!applyFn) throw new Error('applySuggestionToFileContent unavailable');
  const next = applyFn(raw, {
    startLine,
    endLine,
    suggestion,
  });
  // base64 encode
  let contentB64;
  if (typeof Buffer !== 'undefined') {
    contentB64 = Buffer.from(next, 'utf8').toString('base64');
  } else {
    contentB64 = btoa(unescape(encodeURIComponent(next)));
  }
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/contents/${path
      .split('/')
      .map(encodeURIComponent)
      .join('/')}`, ctx),
    fetchImpl,
    token,
    {
      method: 'PUT',
      body: {
        message: message || `Apply suggestion to ${path}`,
        content: contentB64,
        branch: ref,
        sha: file.sha,
      },
    }
  );
}

/**
 * Current authenticated user (for "delete own" gating).
 */
async function fetchViewerLogin(fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  if (!token) return null;
  try {
    const me = await apiJson(githubRestUrl('/user', ctx), fetchImpl, token);
    return me?.login || null;
  } catch {
    return null;
  }
}

/**
 * Map GitHub file list (+ optional gitattributes) to modal file rows with collapse hints.
 * @param {Array} files raw API file objects
 * @param {string} [gitattributesText]
 */
function mapAndAnnotateFiles(files, gitattributesText = '') {
  const mappedFiles = (Array.isArray(files) ? files : []).map((f) => ({
    filename: f.filename,
    status: f.status,
    additions: f.additions,
    deletions: f.deletions,
    changes: f.changes,
    patch: f.patch || '',
    // Preserve media URLs for image preview / binary classification
    raw_url: f.raw_url || f.rawUrl || '',
    blob_url: f.blob_url || f.blobUrl || '',
    contents_url: f.contents_url || f.contentsUrl || '',
    sha: f.sha || '',
    previous_filename: f.previous_filename || f.previousFilename || '',
  }));

  let filesOut;
  try {
    let collapse = typeof globalThis !== 'undefined' ? globalThis.PRModalCollapse : null;
    if (!collapse && typeof require === 'function') {
      try {
        collapse = require('./modal/pure/collapse.js');
      } catch {
        collapse = null;
      }
    }
    if (collapse?.annotateFilesForCollapse) {
      filesOut = collapse.annotateFilesForCollapse(mappedFiles, gitattributesText);
    }
  } catch {
    filesOut = null;
  }
  if (!filesOut) {
    const LARGE = 5000;
    filesOut = mappedFiles.map((f) => {
      const path = f.filename || '';
      const isImage =
        /\.(png|jpe?g|gif|webp|bmp|svg|ico|avif)$/i.test(path);
      const hasPatch = Boolean(f.patch);
      const kind = isImage ? 'image' : hasPatch ? 'text' : 'binary';
      return {
        ...f,
        fileKind: kind,
        openableAsText: kind === 'text',
        renderImage: kind === 'image',
        defaultCollapsed:
          kind === 'binary' ||
          (f.changes || 0) >= LARGE ||
          /package-lock\.json$|yarn\.lock$|\.min\.(js|css)$|\.bundle\.js$/i.test(
            path
          ),
      };
    });
  }
  return filesOut;
}

/**
 * Files+patches for a commit or commit range via GitHub compare API.
 * Use base...head (triple-dot) for merge-base style PR commit diffs.
 * @returns {Promise<{ files: Array, base: string, head: string, status?: string, aheadBy?: number, behindBy?: number, totalCommits?: number }>}
 */
async function fetchCompareFiles(owner, repo, base, head, fetchImpl, token = null, options = {}) {
  const ctx = normalizeApiCtx(options?.ctx);
  const o = String(owner || '').trim();
  const r = String(repo || '').trim();
  const b = String(base || '').trim();
  const h = String(head || '').trim();
  if (!o || !r || !b || !h) {
    throw new Error('owner, repo, base, and head are required for compare');
  }
  const gitattributesText = String(options.gitattributesText || '');
  const url = githubRestUrl(`/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}/compare/${encodeURIComponent(b)}...${encodeURIComponent(h)}`, ctx);
  const data = await apiJson(url, fetchImpl, token);
  const files = mapAndAnnotateFiles(data?.files || [], gitattributesText);
  return {
    files,
    base: b,
    head: h,
    status: data?.status || null,
    aheadBy: data?.ahead_by ?? null,
    behindBy: data?.behind_by ?? null,
    totalCommits: data?.total_commits ?? (Array.isArray(data?.commits) ? data.commits.length : null),
    truncated: Boolean(data?.files && data.files.length >= 300),
  };
}

const fetchApi = {
  normalizeApiCtx,
  mapApiPullRequest,
  buildApiHeaders,
  findDanglingPrNumbers,
  mapWithConcurrency,
  fetchOpenPullsPublic,
  fetchPullByNumber,
  fetchDanglingPulls,
  fetchRepoAutolinks,
  buildAutolinkUrl,
  matchAutolinksInText,
  prMatchText,
  attachMagicLinks,
  fetchOpenPulls,
  fetchPrDetail,
  fetchPrCommentsPage,
  fetchPrCommits,
  fetchAllPrCommits,
  fetchAllPrFiles,
  fetchPrFiles,
  fetchPrIssueComments,
  fetchPrReviews,
  fetchPrChecks,
  fetchPrDevelopment,
  fetchPrSidebarMeta,
  fetchIssueOrPrSummaries,
  fetchCompareFiles,
  mapAndAnnotateFiles,
  fetchPullReviewThreads,
  fetchPullReviewThreadsBundle,
  fetchReviewThreadsPage,
  fetchReviewThreadsByIds,
  collectUnresolvedThreadNodeIds,
  dropReviewThreadsFromDetail,
  mapGraphqlReviewCommentNode,
  mergeReviewThreadsPageIntoDetail,
  emptyReviewThreadsMeta,
  REVIEW_THREADS_API_MAX,
  REVIEW_THREADS_PAGE_SIZE,
  postIssueComment,
  submitPullReview,
  postReviewComment,
  replyToReviewComment,
  findViewerPendingReview,
  ensureViewerPendingReview,
  pickViewerPendingFromReviews,
  fetchViewerPendingReviewComments,
  fetchViewerPendingReviewBundle,
  createPendingPullReview,
  submitPendingPullReview,
  deletePendingPullReview,
  mergePendingReviewComments,
  resolveReviewThread,
  updatePullState,
  closePullRequest,
  reopenPullRequest,
  deleteReviewComment,
  deleteIssueComment,
  updatePullRequest,
  editIssueComment,
  editReviewComment,
  requestReviewers,
  removeReviewers,
  addAssignees,
  removeAssignees,
  setIssueLabels,
  fetchRepoLabels,
  createRepoLabel,
  fetchRepoMilestones,
  createRepoMilestone,
  fetchRepoTags,
  fetchTagsForCommits,
  defaultNewLabelColor,
  mergePullRequest,
  updatePullBranch,
  setIssueSubscription,
  deleteIssueSubscription,
  fetchPullRequestSubscription,
  resolvePullRequestNodeId,
  setIssueMilestone,
  setPullRequestDraftStage,
  applyReviewSuggestion,
  getRepoFileText,
  uploadRepoFile,
  fetchViewerLogin,
  apiJson,
  apiSend,
  apiGraphql,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = fetchApi;
}
if (typeof globalThis !== 'undefined') {
  globalThis.PRTreeFetch = fetchApi;
}
})();


/* ---- background.ts ---- */

/* deps inlined by scripts/build-sw.mjs */
const ENTERPRISE_CS_ID = "prp-enterprise-hosts";
const CONTENT_SCRIPT_JS = [
  "src/tree.js",
  "src/dom.js",
  "src/pr-list-focus.js",
  "src/pulls-palette.js",
  "src/github-endpoints.js",
  "src/content-bridge.js",
  "src/content-bootstrap.js",
  "src/content.js",
  "src/modal/pure/detail-idb-cache.js",
  "src/modal/pure/detail-cache.js",
  "src/modal/pure/load-progress.js",
  "src/modal/dist/pr-modal.bundle.js",
  "src/pr-modal-host.js"
];
function apiCtxFromMessage(message) {
  const webHost = message?.webHost || message?.webOrigin || "github.com";
  if (typeof PRGithubEndpoints?.resolveGithubEndpoints === "function") {
    return PRGithubEndpoints.resolveGithubEndpoints({ webHost });
  }
  if (typeof PRGithubEndpoints?.normalizeApiCtx === "function") {
    return PRGithubEndpoints.normalizeApiCtx({ webHost });
  }
  return {
    kind: "dotcom",
    webHost: "github.com",
    webOrigin: "https://github.com",
    restBase: "https://api.github.com",
    graphqlUrl: "https://api.github.com/graphql"
  };
}
async function tokenForMessage(message) {
  const webHost = message?.webHost || message?.webOrigin || "github.com";
  const sel = await PRTreeStorage.getTokenForWebHost(webHost);
  return sel.token;
}
async function registeredEnterpriseHosts() {
  return PRTreeStorage.getHostAccountHosts();
}
function githubTabUrlPatterns(enterpriseHosts) {
  const patterns = ["https://github.com/*", "https://*.github.com/*"];
  const hosts = PRGithubEndpoints.normalizeEnterpriseWebHosts(enterpriseHosts);
  for (const h of hosts) {
    patterns.push(`https://${h}/*`);
  }
  return patterns;
}
let enterpriseCsSyncChain = Promise.resolve();
async function syncEnterpriseContentScripts(enterpriseHosts) {
  const run = () => syncEnterpriseContentScriptsImpl(enterpriseHosts);
  const next = enterpriseCsSyncChain.then(run, run);
  enterpriseCsSyncChain = next.then(
    () => void 0,
    () => void 0
  );
  return next;
}
async function syncEnterpriseContentScriptsImpl(enterpriseHosts) {
  if (!chrome.scripting?.registerContentScripts) {
    return { registered: false };
  }
  const matches = PRGithubEndpoints.contentScriptMatchesForHosts(enterpriseHosts);
  try {
    if (typeof chrome.scripting.getRegisteredContentScripts === "function") {
      const existing = await chrome.scripting.getRegisteredContentScripts({
        ids: [ENTERPRISE_CS_ID]
      });
      if (Array.isArray(existing) && existing.length > 0) {
        await chrome.scripting.unregisterContentScripts({
          ids: [ENTERPRISE_CS_ID]
        });
      }
    } else {
      await chrome.scripting.unregisterContentScripts({
        ids: [ENTERPRISE_CS_ID]
      });
    }
  } catch {
  }
  if (!matches.length) return { registered: false, matches: [] };
  const script = {
    id: ENTERPRISE_CS_ID,
    matches,
    js: CONTENT_SCRIPT_JS,
    css: ["src/styles.css"],
    runAt: "document_idle",
    persistAcrossSessions: true
  };
  if (typeof chrome.scripting.updateContentScripts === "function") {
    try {
      await chrome.scripting.updateContentScripts([script]);
      return { registered: true, matches, updated: true };
    } catch {
    }
  }
  try {
    await chrome.scripting.registerContentScripts([script]);
  } catch (err) {
    const msg = String(err?.message || err || "");
    if (/duplicate script id/i.test(msg)) {
      try {
        await chrome.scripting.unregisterContentScripts({
          ids: [ENTERPRISE_CS_ID]
        });
      } catch {
      }
      await chrome.scripting.registerContentScripts([script]);
    } else {
      throw err;
    }
  }
  return { registered: true, matches };
}
async function requestEnterprisePermissions(enterpriseHosts) {
  if (!chrome.permissions?.request) {
    return { granted: false, error: "permissions API unavailable" };
  }
  const origins = /* @__PURE__ */ new Set();
  for (const h of PRGithubEndpoints.normalizeEnterpriseWebHosts(enterpriseHosts)) {
    origins.add(`https://${h}/*`);
    if (h.endsWith(".ghe.com") && !h.startsWith("api.")) {
      origins.add(`https://api.${h}/*`);
    }
  }
  const list = [...origins];
  if (!list.length) return { granted: true, origins: [] };
  return new Promise((resolve) => {
    chrome.permissions.request({ origins: list }, (granted) => {
      const err = chrome.runtime.lastError;
      if (err) resolve({ granted: false, error: err.message, origins: list });
      else resolve({ granted: Boolean(granted), origins: list });
    });
  });
}
const MSG = {
  /** Lightweight wake / health check (content scripts retry against this). */
  PING: "PR_TREE_PING",
  TOKEN_STATUS: "PR_TREE_TOKEN_STATUS",
  TOKEN_SET: "PR_TREE_TOKEN_SET",
  TOKEN_CLEAR: "PR_TREE_TOKEN_CLEAR",
  TOKEN_CHANGED: "PR_TREE_TOKEN_CHANGED",
  PREFS_GET: "PR_TREE_PREFS_GET",
  PREFS_SET: "PR_TREE_PREFS_SET",
  PREFS_CHANGED: "PR_TREE_PREFS_CHANGED",
  HOST_ACCOUNTS_LIST: "PR_TREE_HOST_ACCOUNTS_LIST",
  HOST_ACCOUNT_ADD: "PR_TREE_HOST_ACCOUNT_ADD",
  HOST_ACCOUNT_REMOVE: "PR_TREE_HOST_ACCOUNT_REMOVE",
  HOST_ACCOUNTS_CHANGED: "PR_TREE_HOST_ACCOUNTS_CHANGED",
  /** Clear PR detail memory + IndexedDB cache on open github.com tabs. */
  CLEAR_DETAIL_CACHE: "PR_TREE_CLEAR_DETAIL_CACHE",
  /** Abort in-flight GitHub fetches by requestId (sheet closed / superseded open). */
  CANCEL_FETCH: "PR_TREE_CANCEL_FETCH",
  FETCH_OPEN_PULLS: "PR_TREE_FETCH_OPEN_PULLS",
  FETCH_DANGLING: "PR_TREE_FETCH_DANGLING",
  FETCH_PR_DETAIL: "PR_TREE_FETCH_PR_DETAIL",
  FETCH_REVIEW_THREADS_PAGE: "PR_TREE_FETCH_REVIEW_THREADS_PAGE",
  FETCH_REVIEW_THREADS_BY_IDS: "PR_TREE_FETCH_REVIEW_THREADS_BY_IDS",
  FETCH_COMMENTS_PAGE: "PR_TREE_FETCH_COMMENTS_PAGE",
  FETCH_COMPARE_FILES: "PR_TREE_FETCH_COMPARE_FILES",
  POST_ISSUE_COMMENT: "PR_TREE_POST_ISSUE_COMMENT",
  SUBMIT_REVIEW: "PR_TREE_SUBMIT_REVIEW",
  SUBMIT_PENDING_REVIEW: "PR_TREE_SUBMIT_PENDING_REVIEW",
  DELETE_PENDING_REVIEW: "PR_TREE_DELETE_PENDING_REVIEW",
  POST_REVIEW_COMMENT: "PR_TREE_POST_REVIEW_COMMENT",
  REPLY_REVIEW_COMMENT: "PR_TREE_REPLY_REVIEW_COMMENT",
  RESOLVE_REVIEW_THREAD: "PR_TREE_RESOLVE_REVIEW_THREAD",
  UPDATE_PULL_STATE: "PR_TREE_UPDATE_PULL_STATE",
  DELETE_REVIEW_COMMENT: "PR_TREE_DELETE_REVIEW_COMMENT",
  DELETE_ISSUE_COMMENT: "PR_TREE_DELETE_ISSUE_COMMENT",
  UPDATE_PULL: "PR_TREE_UPDATE_PULL",
  EDIT_ISSUE_COMMENT: "PR_TREE_EDIT_ISSUE_COMMENT",
  EDIT_REVIEW_COMMENT: "PR_TREE_EDIT_REVIEW_COMMENT",
  REQUEST_REVIEWERS: "PR_TREE_REQUEST_REVIEWERS",
  REMOVE_REVIEWERS: "PR_TREE_REMOVE_REVIEWERS",
  ADD_ASSIGNEES: "PR_TREE_ADD_ASSIGNEES",
  REMOVE_ASSIGNEES: "PR_TREE_REMOVE_ASSIGNEES",
  SET_LABELS: "PR_TREE_SET_LABELS",
  FETCH_REPO_LABELS: "PR_TREE_FETCH_REPO_LABELS",
  CREATE_REPO_LABEL: "PR_TREE_CREATE_REPO_LABEL",
  FETCH_REPO_MILESTONES: "PR_TREE_FETCH_REPO_MILESTONES",
  CREATE_REPO_MILESTONE: "PR_TREE_CREATE_REPO_MILESTONE",
  FETCH_REPO_TAGS: "PR_TREE_FETCH_REPO_TAGS",
  FETCH_TAGS_FOR_COMMITS: "PR_TREE_FETCH_TAGS_FOR_COMMITS",
  FETCH_ALL_PR_COMMITS: "PR_TREE_FETCH_ALL_PR_COMMITS",
  FETCH_PR_COMMITS: "PR_TREE_FETCH_PR_COMMITS",
  FETCH_PR_FILES: "PR_TREE_FETCH_PR_FILES",
  FETCH_PR_ISSUE_COMMENTS: "PR_TREE_FETCH_PR_ISSUE_COMMENTS",
  FETCH_PR_REVIEWS: "PR_TREE_FETCH_PR_REVIEWS",
  FETCH_PR_CHECKS: "PR_TREE_FETCH_PR_CHECKS",
  FETCH_PR_DEVELOPMENT: "PR_TREE_FETCH_PR_DEVELOPMENT",
  FETCH_ALL_PR_FILES: "PR_TREE_FETCH_ALL_PR_FILES",
  APPLY_SUGGESTION: "PR_TREE_APPLY_SUGGESTION",
  GET_REPO_FILE_TEXT: "PR_TREE_GET_REPO_FILE_TEXT",
  MERGE_PULL: "PR_TREE_MERGE_PULL",
  UPDATE_BRANCH: "PR_TREE_UPDATE_BRANCH",
  SET_SUBSCRIPTION: "PR_TREE_SET_SUBSCRIPTION",
  DELETE_SUBSCRIPTION: "PR_TREE_DELETE_SUBSCRIPTION",
  SET_MILESTONE: "PR_TREE_SET_MILESTONE",
  SET_DRAFT_STAGE: "PR_TREE_SET_DRAFT_STAGE",
  UPLOAD_REPO_FILE: "PR_TREE_UPLOAD_REPO_FILE"
};
const MESSAGE_TIMEOUT_MS = 12e4;
function broadcastToGithubTabs(message) {
  try {
    chrome.runtime.sendMessage(message, () => {
      void chrome.runtime.lastError;
    });
  } catch {
  }
  try {
    registeredEnterpriseHosts().then((hosts) => {
      const url = githubTabUrlPatterns(hosts);
      chrome.tabs.query({ url }, (tabs) => {
        for (const tab of tabs || []) {
          if (tab.id == null) continue;
          try {
            chrome.tabs.sendMessage(tab.id, message, () => {
              void chrome.runtime.lastError;
            });
          } catch {
          }
        }
      });
    });
  } catch {
  }
}
function broadcastTokenChanged() {
  broadcastToGithubTabs({ type: MSG.TOKEN_CHANGED });
}
function broadcastPrefsChanged(prefs) {
  broadcastToGithubTabs({ type: MSG.PREFS_CHANGED, prefs });
}
function clearDetailCacheOnGithubTabs() {
  return new Promise((resolve) => {
    try {
      registeredEnterpriseHosts().then((hosts) => {
        const url = githubTabUrlPatterns(hosts);
        chrome.tabs.query({ url }, (tabs) => {
          void chrome.runtime.lastError;
          const list = Array.isArray(tabs) ? tabs : [];
          if (!list.length) {
            resolve({ tabs: 0, cleared: 0, failed: 0 });
            return;
          }
          let pending = 0;
          let cleared = 0;
          let failed = 0;
          const done = () => {
            if (pending > 0) return;
            resolve({ tabs: list.length, cleared, failed });
          };
          for (const tab of list) {
            if (tab?.id == null) continue;
            pending += 1;
            try {
              chrome.tabs.sendMessage(
                tab.id,
                { type: MSG.CLEAR_DETAIL_CACHE },
                (res) => {
                  const err = chrome.runtime.lastError;
                  if (err || !res?.ok) failed += 1;
                  else cleared += 1;
                  pending -= 1;
                  done();
                }
              );
            } catch {
              failed += 1;
              pending -= 1;
            }
          }
          if (pending === 0) done();
        });
      });
    } catch {
      resolve({ tabs: 0, cleared: 0, failed: 0 });
    }
  });
}
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  if (changes[PRTreeStorage.TOKEN_KEY]) {
    broadcastTokenChanged();
  }
  if (changes[PRTreeStorage.HOST_ACCOUNTS_KEY]) {
    broadcastToGithubTabs({ type: MSG.HOST_ACCOUNTS_CHANGED });
    broadcastTokenChanged();
    void registeredEnterpriseHosts().then(
      (hosts) => syncEnterpriseContentScripts(hosts)
    );
  }
  if (changes[PRTreeStorage.PREFS_KEY]) {
    const prefs = PRTreeStorage.normalizePrefs(
      changes[PRTreeStorage.PREFS_KEY].newValue
    );
    broadcastPrefsChanged(prefs);
  }
});
function fetchImpl() {
  return globalThis.fetch.bind(globalThis);
}
const activeFetchControllers = /* @__PURE__ */ new Map();
const preCancelledFetchIds = /* @__PURE__ */ new Set();
function makeAbortError() {
  const err = new Error("The operation was aborted.");
  err.name = "AbortError";
  return err;
}
function wrapFetchWithSignal(baseFetch, signal) {
  return (url, init = {}) => {
    if (signal.aborted) return Promise.reject(makeAbortError());
    let nextSignal = signal;
    if (init.signal && init.signal !== signal) {
      if (typeof AbortSignal !== "undefined" && typeof AbortSignal.any === "function") {
        nextSignal = AbortSignal.any([init.signal, signal]);
      }
    }
    return baseFetch(url, { ...init, signal: nextSignal });
  };
}
function beginTrackedFetch(requestId) {
  const id = requestId != null && String(requestId) ? String(requestId) : `auto-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  if (preCancelledFetchIds.has(id)) {
    preCancelledFetchIds.delete(id);
    const controller2 = new AbortController();
    try {
      controller2.abort();
    } catch {
    }
    return {
      requestId: id,
      controller: controller2,
      fetch: wrapFetchWithSignal(fetchImpl(), controller2.signal)
    };
  }
  const prev = activeFetchControllers.get(id);
  if (prev) {
    try {
      prev.abort();
    } catch {
    }
  }
  const controller = new AbortController();
  activeFetchControllers.set(id, controller);
  return {
    requestId: id,
    controller,
    fetch: wrapFetchWithSignal(fetchImpl(), controller.signal)
  };
}
function endTrackedFetch(requestId) {
  const id = requestId != null ? String(requestId) : "";
  if (!id) return;
  activeFetchControllers.delete(id);
  preCancelledFetchIds.delete(id);
}
function cancelTrackedFetch(requestId) {
  const id = requestId != null ? String(requestId) : "";
  if (!id) return false;
  preCancelledFetchIds.add(id);
  try {
    setTimeout(() => preCancelledFetchIds.delete(id), 6e4);
  } catch {
  }
  const ac = activeFetchControllers.get(id);
  if (ac) {
    try {
      ac.abort();
    } catch {
    }
    activeFetchControllers.delete(id);
  }
  return true;
}
function cancelTrackedFetches(requestIds) {
  const ids = Array.isArray(requestIds) ? requestIds : [];
  let n = 0;
  for (const id of ids) {
    if (cancelTrackedFetch(id)) n += 1;
  }
  return n;
}
function cancelAllTrackedFetches() {
  const ids = [...activeFetchControllers.keys()];
  let n = 0;
  for (const id of ids) {
    if (cancelTrackedFetch(id)) n += 1;
  }
  return n;
}
function isAbortError(err) {
  return err?.name === "AbortError" || /aborted|AbortError/i.test(String(err?.message || err || ""));
}
function withServiceWorkerKeepAlive(work) {
  let tick = 0;
  const id = setInterval(() => {
    tick += 1;
    try {
      chrome.runtime.getPlatformInfo(() => {
        void chrome.runtime.lastError;
      });
    } catch {
    }
    if (tick % 2 === 0) {
      try {
        chrome.storage.local.get("__prp_keepalive__", () => {
          void chrome.runtime.lastError;
        });
      } catch {
      }
    }
  }, 15e3);
  return Promise.resolve().then(work).finally(() => clearInterval(id));
}
function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(
        `${label || "Request"} timed out after ${Math.round(ms / 1e3)}s`
      );
      err.status = 408;
      reject(err);
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
async function handleMessage(message) {
  const apiCtx = apiCtxFromMessage(message || {});
  switch (message.type) {
    case MSG.PING: {
      return {
        ok: true,
        pong: true,
        hasFetch: typeof PRTreeFetch?.fetchPrDetail === "function",
        hasStorage: typeof PRTreeStorage?.getGithubTokenStatus === "function",
        hasEndpoints: typeof PRGithubEndpoints?.resolveGithubEndpoints === "function"
      };
    }
    case MSG.TOKEN_STATUS: {
      const webHost = message.webHost || message.webOrigin || "github.com";
      const sel = await PRTreeStorage.getTokenForWebHost(webHost);
      if (!sel.token) {
        return {
          ok: true,
          configured: false,
          mask: "",
          source: null,
          host: sel.host
        };
      }
      return {
        ok: true,
        configured: true,
        mask: PRTreeStorage.maskGithubToken(sel.token),
        source: sel.source,
        host: sel.host
      };
    }
    case MSG.TOKEN_SET: {
      await PRTreeStorage.setGithubToken(message.token || "");
      const status = await PRTreeStorage.getGithubTokenStatus();
      return { ok: true, ...status };
    }
    case MSG.TOKEN_CLEAR: {
      await PRTreeStorage.setGithubToken("");
      return { ok: true, configured: false, mask: "" };
    }
    case MSG.PREFS_GET: {
      const prefs = await PRTreeStorage.getExtensionPrefs();
      const hostAccounts = await PRTreeStorage.getHostAccountsPublic();
      let endpoints = null;
      try {
        endpoints = PRGithubEndpoints.resolveGithubEndpoints({
          webHost: message.webHost || "github.com"
        });
      } catch {
        endpoints = null;
      }
      return { ok: true, prefs, hostAccounts, endpoints };
    }
    case MSG.PREFS_SET: {
      const patch = message.prefs || message.patch || {};
      if (patch && typeof patch === "object" && "enterpriseWebHosts" in patch) {
        delete patch.enterpriseWebHosts;
      }
      const prefs = await PRTreeStorage.setExtensionPrefs(patch);
      return { ok: true, prefs };
    }
    case MSG.HOST_ACCOUNTS_LIST: {
      const accounts = await PRTreeStorage.getHostAccountsPublic();
      return {
        ok: true,
        accounts,
        max: PRGithubEndpoints.MAX_HOST_ACCOUNTS || 3
      };
    }
    case MSG.HOST_ACCOUNT_ADD: {
      const result = await PRTreeStorage.registerHostAccount(
        message.host,
        message.token
      );
      if (!result.ok) {
        return {
          ok: false,
          error: result.error,
          accounts: (result.accounts || []).map((a) => ({
            host: a.host,
            mask: PRTreeStorage.maskGithubToken(a.token)
          }))
        };
      }
      const hosts = result.accounts.map((a) => a.host);
      const permission = await requestEnterprisePermissions(hosts);
      const contentScripts = await syncEnterpriseContentScripts(hosts);
      return {
        ok: true,
        accounts: result.accounts.map((a) => ({
          host: a.host,
          mask: PRTreeStorage.maskGithubToken(a.token)
        })),
        permission,
        contentScripts,
        max: PRGithubEndpoints.MAX_HOST_ACCOUNTS || 3
      };
    }
    case MSG.HOST_ACCOUNT_REMOVE: {
      const result = await PRTreeStorage.unregisterHostAccount(message.host);
      const hosts = result.accounts.map((a) => a.host);
      const contentScripts = await syncEnterpriseContentScripts(hosts);
      return {
        ok: true,
        accounts: result.accounts.map((a) => ({
          host: a.host,
          mask: PRTreeStorage.maskGithubToken(a.token)
        })),
        contentScripts,
        max: PRGithubEndpoints.MAX_HOST_ACCOUNTS || 3
      };
    }
    case MSG.CLEAR_DETAIL_CACHE: {
      const result = await clearDetailCacheOnGithubTabs();
      return { ok: true, ...result };
    }
    case MSG.FETCH_OPEN_PULLS: {
      const tracked = beginTrackedFetch(message.requestId);
      try {
        const token = await tokenForMessage(message);
        const prs = await PRTreeFetch.fetchOpenPulls(
          message.owner,
          message.repo,
          tracked.fetch,
          {
            token,
            pagePrNumbers: Array.isArray(message.pagePrNumbers) ? message.pagePrNumbers : [],
            ctx: apiCtx
          }
        );
        return { ok: true, prs };
      } catch (err) {
        if (isAbortError(err)) return { ok: false, aborted: true, error: "aborted" };
        throw err;
      } finally {
        endTrackedFetch(tracked.requestId);
      }
    }
    case MSG.FETCH_DANGLING: {
      const tracked = beginTrackedFetch(message.requestId);
      try {
        const token = await tokenForMessage(message);
        const prs = await PRTreeFetch.fetchDanglingPulls(
          message.owner,
          message.repo,
          Array.isArray(message.numbers) ? message.numbers : [],
          tracked.fetch,
          token,
          apiCtx
        );
        return { ok: true, prs };
      } catch (err) {
        if (isAbortError(err)) return { ok: false, aborted: true, error: "aborted" };
        throw err;
      } finally {
        endTrackedFetch(tracked.requestId);
      }
    }
    case MSG.CANCEL_FETCH: {
      const ids = Array.isArray(message.requestIds) ? message.requestIds : message.requestId != null ? [message.requestId] : [];
      const cancelled = (message.cancelAll ? cancelAllTrackedFetches() : 0) + cancelTrackedFetches(ids);
      return { ok: true, cancelled };
    }
    case MSG.FETCH_PR_DETAIL: {
      const tracked = beginTrackedFetch(message.requestId);
      try {
        const token = await tokenForMessage(message);
        const detail = await PRTreeFetch.fetchPrDetail(
          message.owner,
          message.repo,
          message.number,
          tracked.fetch,
          token,
          {
            skipReviewThreads: Boolean(message.skipReviewThreads),
            threadsMaxPages: message.threadsMaxPages != null ? Number(message.threadsMaxPages) : 1,
            ctx: apiCtx
          }
        );
        return { ok: true, detail };
      } catch (err) {
        if (isAbortError(err)) return { ok: false, aborted: true, error: "aborted" };
        throw err;
      } finally {
        endTrackedFetch(tracked.requestId);
      }
    }
    case MSG.FETCH_REVIEW_THREADS_PAGE: {
      const tracked = beginTrackedFetch(message.requestId);
      try {
        const token = await tokenForMessage(message);
        if (!token) {
          return {
            ok: true,
            page: {
              threads: [],
              comments: [],
              hasMore: false,
              endCursor: null,
              pageCount: 0
            }
          };
        }
        const page = await PRTreeFetch.fetchReviewThreadsPage(
          message.owner,
          message.repo,
          message.number,
          {
            direction: message.direction || "newest",
            cursor: message.cursor || null,
            pageSize: message.pageSize != null ? Number(message.pageSize) : void 0
          },
          tracked.fetch,
          token,
          apiCtx
        );
        return { ok: true, page };
      } catch (err) {
        if (isAbortError(err)) return { ok: false, aborted: true, error: "aborted" };
        throw err;
      } finally {
        endTrackedFetch(tracked.requestId);
      }
    }
    case MSG.FETCH_REVIEW_THREADS_BY_IDS: {
      const tracked = beginTrackedFetch(message.requestId);
      try {
        const token = await tokenForMessage(message);
        if (!token) {
          return {
            ok: true,
            page: { threads: [], comments: [], pageCount: 0, direction: "refresh" }
          };
        }
        const page = await PRTreeFetch.fetchReviewThreadsByIds(message.threadNodeIds || message.ids || [], tracked.fetch, token, apiCtx);
        return { ok: true, page };
      } catch (err) {
        if (isAbortError(err)) return { ok: false, aborted: true, error: "aborted" };
        throw err;
      } finally {
        endTrackedFetch(tracked.requestId);
      }
    }
    case MSG.FETCH_COMMENTS_PAGE: {
      const tracked = beginTrackedFetch(message.requestId);
      try {
        const token = await tokenForMessage(message);
        const page = await PRTreeFetch.fetchPrCommentsPage(
          message.owner,
          message.repo,
          message.number,
          message.kind === "review" ? "review" : "issue",
          {
            page: message.page,
            perPage: message.perPage,
            since: message.since || null
          },
          tracked.fetch,
          token,
          apiCtx
        );
        return { ok: true, page };
      } catch (err) {
        if (isAbortError(err)) return { ok: false, aborted: true, error: "aborted" };
        throw err;
      } finally {
        endTrackedFetch(tracked.requestId);
      }
    }
    case MSG.FETCH_COMPARE_FILES: {
      const tracked = beginTrackedFetch(message.requestId);
      try {
        const token = await tokenForMessage(message);
        const result = await PRTreeFetch.fetchCompareFiles(
          message.owner,
          message.repo,
          message.base,
          message.head,
          tracked.fetch,
          token,
          { gitattributesText: message.gitattributesText || "", ctx: apiCtx }
        );
        return { ok: true, result };
      } catch (err) {
        if (isAbortError(err)) return { ok: false, aborted: true, error: "aborted" };
        throw err;
      } finally {
        endTrackedFetch(tracked.requestId);
      }
    }
    case MSG.POST_ISSUE_COMMENT: {
      const token = await tokenForMessage(message);
      if (!token) throw new Error("GitHub PAT required to post comments");
      const result = await PRTreeFetch.postIssueComment(
        message.owner,
        message.repo,
        message.number,
        message.body,
        fetchImpl(),
        token,
        apiCtx
      );
      return { ok: true, result };
    }
    case MSG.SUBMIT_REVIEW: {
      const token = await tokenForMessage(message);
      if (!token) throw new Error("GitHub PAT required to submit reviews");
      const result = await PRTreeFetch.submitPullReview(
        message.owner,
        message.repo,
        message.number,
        {
          event: message.event,
          body: message.body || "",
          commitId: message.commitId,
          comments: Array.isArray(message.comments) ? message.comments : void 0
        },
        fetchImpl(),
        token,
        apiCtx
      );
      return { ok: true, result };
    }
    case MSG.SUBMIT_PENDING_REVIEW: {
      const token = await tokenForMessage(message);
      if (!token) throw new Error("GitHub PAT required to submit pending reviews");
      const result = await PRTreeFetch.submitPendingPullReview(
        message.owner,
        message.repo,
        message.number,
        message.reviewId,
        { event: message.event || "COMMENT", body: message.body || "" },
        fetchImpl(),
        token,
        apiCtx
      );
      return { ok: true, result };
    }
    case MSG.DELETE_PENDING_REVIEW: {
      const token = await tokenForMessage(message);
      if (!token) throw new Error("GitHub PAT required to discard pending reviews");
      const result = await PRTreeFetch.deletePendingPullReview(
        message.owner,
        message.repo,
        message.number,
        message.reviewId,
        fetchImpl(),
        token,
        apiCtx
      );
      return { ok: true, result };
    }
    case MSG.POST_REVIEW_COMMENT: {
      const token = await tokenForMessage(message);
      if (!token) throw new Error("GitHub PAT required to post review comments");
      const result = await PRTreeFetch.postReviewComment(
        message.owner,
        message.repo,
        message.number,
        {
          body: message.body,
          path: message.path,
          line: message.line,
          side: message.side || "RIGHT",
          commitId: message.commitId,
          startLine: message.startLine,
          startSide: message.startSide,
          asPending: Boolean(message.asPending),
          subjectType: message.subjectType || message.subject_type || "line"
        },
        fetchImpl(),
        token,
        apiCtx
      );
      return { ok: true, result };
    }
    case MSG.REPLY_REVIEW_COMMENT: {
      const token = await tokenForMessage(message);
      if (!token) throw new Error("GitHub PAT required to reply to review comments");
      const result = await PRTreeFetch.replyToReviewComment(
        message.owner,
        message.repo,
        message.number,
        message.commentId,
        message.body,
        fetchImpl(),
        token,
        {
          mode: message.mode || "comment",
          threadNodeId: message.threadNodeId || null,
          parentNodeId: message.parentNodeId || null,
          path: message.path || null,
          line: message.line ?? null,
          side: message.side || null,
          commitId: message.commitId || null
        },
        apiCtx
      );
      return { ok: true, result };
    }
    case MSG.RESOLVE_REVIEW_THREAD: {
      const token = await tokenForMessage(message);
      if (!token, apiCtx) throw new Error("GitHub PAT required to resolve review threads");
      const result = await PRTreeFetch.resolveReviewThread(
        message.threadNodeId,
        message.resolved !== false,
        fetchImpl(),
        token,
        apiCtx
      );
      return { ok: true, result };
    }
    case MSG.UPDATE_PULL_STATE: {
      const token = await tokenForMessage(message);
      if (!token) throw new Error("GitHub PAT required to close or reopen pull requests");
      const result = await PRTreeFetch.updatePullState(
        message.owner,
        message.repo,
        message.number,
        message.state === "closed" ? "closed" : "open",
        fetchImpl(),
        token,
        apiCtx
      );
      return { ok: true, result };
    }
    case MSG.DELETE_REVIEW_COMMENT: {
      const token = await tokenForMessage(message);
      if (!token) throw new Error("GitHub PAT required to delete review comments");
      const result = await PRTreeFetch.deleteReviewComment(
        message.owner,
        message.repo,
        message.commentId,
        fetchImpl(),
        token,
        apiCtx
      );
      return { ok: true, result };
    }
    case MSG.DELETE_ISSUE_COMMENT: {
      const token = await tokenForMessage(message);
      if (!token) throw new Error("GitHub PAT required to delete comments");
      const result = await PRTreeFetch.deleteIssueComment(
        message.owner,
        message.repo,
        message.commentId,
        fetchImpl(),
        token,
        apiCtx
      );
      return { ok: true, result };
    }
    case MSG.UPDATE_PULL: {
      const token = await tokenForMessage(message);
      if (!token) throw new Error("GitHub PAT required to update pull request");
      const result = await PRTreeFetch.updatePullRequest(
        message.owner,
        message.repo,
        message.number,
        message.fields || {},
        fetchImpl(),
        token,
        apiCtx
      );
      return { ok: true, result };
    }
    case MSG.EDIT_ISSUE_COMMENT: {
      const token = await tokenForMessage(message);
      if (!token) throw new Error("GitHub PAT required to edit comments");
      const result = await PRTreeFetch.editIssueComment(
        message.owner,
        message.repo,
        message.commentId,
        message.body,
        fetchImpl(),
        token,
        apiCtx
      );
      return { ok: true, result };
    }
    case MSG.EDIT_REVIEW_COMMENT: {
      const token = await tokenForMessage(message);
      if (!token) throw new Error("GitHub PAT required to edit review comments");
      const result = await PRTreeFetch.editReviewComment(
        message.owner,
        message.repo,
        message.commentId,
        message.body,
        fetchImpl(),
        token,
        apiCtx
      );
      return { ok: true, result };
    }
    case MSG.REQUEST_REVIEWERS: {
      const token = await tokenForMessage(message);
      if (!token) throw new Error("GitHub PAT required to request reviewers");
      const result = await PRTreeFetch.requestReviewers(
        message.owner,
        message.repo,
        message.number,
        {
          reviewers: message.reviewers || [],
          teamReviewers: message.teamReviewers || []
        },
        fetchImpl(),
        token,
        apiCtx
      );
      return { ok: true, result };
    }
    case MSG.REMOVE_REVIEWERS: {
      const token = await tokenForMessage(message);
      if (!token) throw new Error("GitHub PAT required to remove reviewers");
      const result = await PRTreeFetch.removeReviewers(
        message.owner,
        message.repo,
        message.number,
        {
          reviewers: message.reviewers || [],
          teamReviewers: message.teamReviewers || []
        },
        fetchImpl(),
        token,
        apiCtx
      );
      return { ok: true, result };
    }
    case MSG.ADD_ASSIGNEES: {
      const token = await tokenForMessage(message);
      if (!token) throw new Error("GitHub PAT required to add assignees");
      const result = await PRTreeFetch.addAssignees(
        message.owner,
        message.repo,
        message.number,
        message.assignees || [],
        fetchImpl(),
        token,
        apiCtx
      );
      return { ok: true, result };
    }
    case MSG.REMOVE_ASSIGNEES: {
      const token = await tokenForMessage(message);
      if (!token) throw new Error("GitHub PAT required to remove assignees");
      const result = await PRTreeFetch.removeAssignees(
        message.owner,
        message.repo,
        message.number,
        message.assignees || [],
        fetchImpl(),
        token,
        apiCtx
      );
      return { ok: true, result };
    }
    case MSG.SET_LABELS: {
      const token = await tokenForMessage(message);
      if (!token) throw new Error("GitHub PAT required to set labels");
      const result = await PRTreeFetch.setIssueLabels(
        message.owner,
        message.repo,
        message.number,
        message.labels || [],
        fetchImpl(),
        token,
        apiCtx
      );
      return { ok: true, result };
    }
    case MSG.FETCH_REPO_LABELS: {
      const tracked = beginTrackedFetch(message.requestId);
      try {
        const token = await tokenForMessage(message);
        const labels = await PRTreeFetch.fetchRepoLabels(
          message.owner,
          message.repo,
          tracked.fetch,
          token,
          {
            maxPages: message.maxPages != null ? Number(message.maxPages) : void 0,
            ctx: apiCtx
          }
        );
        return { ok: true, labels };
      } catch (err) {
        if (isAbortError(err)) return { ok: false, aborted: true, error: "aborted" };
        throw err;
      } finally {
        endTrackedFetch(tracked.requestId);
      }
    }
    case MSG.CREATE_REPO_LABEL: {
      const token = await tokenForMessage(message);
      if (!token, apiCtx) throw new Error("GitHub PAT required to create labels");
      const result = await PRTreeFetch.createRepoLabel(
        message.owner,
        message.repo,
        {
          name: message.name,
          color: message.color,
          description: message.description
        },
        fetchImpl(),
        token,
        apiCtx
      );
      return { ok: true, result };
    }
    case MSG.FETCH_REPO_MILESTONES: {
      const tracked = beginTrackedFetch(message.requestId);
      try {
        const token = await tokenForMessage(message);
        const milestones = await PRTreeFetch.fetchRepoMilestones(
          message.owner,
          message.repo,
          tracked.fetch,
          token,
          {
            maxPages: message.maxPages != null ? Number(message.maxPages) : void 0,
            state: message.state || "all",
            ctx: apiCtx
          }
        );
        return { ok: true, milestones };
      } catch (err) {
        if (isAbortError(err)) return { ok: false, aborted: true, error: "aborted" };
        throw err;
      } finally {
        endTrackedFetch(tracked.requestId);
      }
    }
    case MSG.CREATE_REPO_MILESTONE: {
      const token = await tokenForMessage(message);
      if (!token, apiCtx) throw new Error("GitHub PAT required to create milestones");
      const result = await PRTreeFetch.createRepoMilestone(
        message.owner,
        message.repo,
        {
          title: message.title,
          description: message.description,
          state: message.state
        },
        fetchImpl(),
        token,
        apiCtx
      );
      return { ok: true, result };
    }
    case MSG.FETCH_REPO_TAGS: {
      const tracked = beginTrackedFetch(message.requestId);
      try {
        const token = await tokenForMessage(message);
        const tags = await PRTreeFetch.fetchRepoTags(
          message.owner,
          message.repo,
          tracked.fetch,
          token,
          {
            maxPages: message.maxPages != null ? Number(message.maxPages) : void 0,
            ctx: apiCtx
          }
        );
        return { ok: true, tags };
      } catch (err) {
        if (isAbortError(err)) return { ok: false, aborted: true, error: "aborted" };
        throw err;
      } finally {
        endTrackedFetch(tracked.requestId);
      }
    }
    case MSG.FETCH_TAGS_FOR_COMMITS: {
      const tracked = beginTrackedFetch(message.requestId);
      try {
        const token = await tokenForMessage(message);
        const tags = await PRTreeFetch.fetchTagsForCommits(
          message.owner,
          message.repo,
          message.shas || [],
          tracked.fetch,
          token,
          {
            maxPages: message.maxPages != null ? Number(message.maxPages) : void 0,
            ctx: apiCtx
          }
        );
        return { ok: true, tags };
      } catch (err) {
        if (isAbortError(err)) return { ok: false, aborted: true, error: "aborted" };
        throw err;
      } finally {
        endTrackedFetch(tracked.requestId);
      }
    }
    case MSG.FETCH_ALL_PR_COMMITS: {
      const tracked = beginTrackedFetch(message.requestId);
      try {
        const token = await tokenForMessage(message);
        const commits = await PRTreeFetch.fetchAllPrCommits(
          message.owner,
          message.repo,
          message.number,
          tracked.fetch,
          token,
          apiCtx
        );
        return { ok: true, commits };
      } catch (err) {
        if (isAbortError(err)) return { ok: false, aborted: true, error: "aborted" };
        throw err;
      } finally {
        endTrackedFetch(tracked.requestId);
      }
    }
    case MSG.FETCH_PR_COMMITS: {
      const tracked = beginTrackedFetch(message.requestId);
      try {
        const token = await tokenForMessage(message);
        const commits = await PRTreeFetch.fetchPrCommits(
          message.owner,
          message.repo,
          message.number,
          tracked.fetch,
          token,
          apiCtx
        );
        return { ok: true, commits };
      } catch (err) {
        if (isAbortError(err)) return { ok: false, aborted: true, error: "aborted" };
        throw err;
      } finally {
        endTrackedFetch(tracked.requestId);
      }
    }
    case MSG.FETCH_PR_FILES: {
      const tracked = beginTrackedFetch(message.requestId);
      try {
        const token = await tokenForMessage(message);
        const pack = await PRTreeFetch.fetchPrFiles(
          message.owner,
          message.repo,
          message.number,
          tracked.fetch,
          token,
          {
            headSha: message.headSha || null,
            gitattributesText: message.gitattributesText || "",
            ctx: apiCtx
          }
        );
        return {
          ok: true,
          files: Array.isArray(pack?.files) ? pack.files : [],
          gitattributesText: typeof pack?.gitattributesText === "string" ? pack.gitattributesText : ""
        };
      } catch (err) {
        if (isAbortError(err)) return { ok: false, aborted: true, error: "aborted" };
        throw err;
      } finally {
        endTrackedFetch(tracked.requestId);
      }
    }
    case MSG.FETCH_PR_ISSUE_COMMENTS: {
      const tracked = beginTrackedFetch(message.requestId);
      try {
        const token = await tokenForMessage(message);
        const page = await PRTreeFetch.fetchPrIssueComments(
          message.owner,
          message.repo,
          message.number,
          tracked.fetch,
          token,
          apiCtx
        );
        return { ok: true, page };
      } catch (err) {
        if (isAbortError(err)) return { ok: false, aborted: true, error: "aborted" };
        throw err;
      } finally {
        endTrackedFetch(tracked.requestId);
      }
    }
    case MSG.FETCH_PR_REVIEWS: {
      const tracked = beginTrackedFetch(message.requestId);
      try {
        const token = await tokenForMessage(message);
        const reviews = await PRTreeFetch.fetchPrReviews(
          message.owner,
          message.repo,
          message.number,
          tracked.fetch,
          token,
          apiCtx
        );
        return { ok: true, reviews: Array.isArray(reviews) ? reviews : [] };
      } catch (err) {
        if (isAbortError(err)) return { ok: false, aborted: true, error: "aborted" };
        throw err;
      } finally {
        endTrackedFetch(tracked.requestId);
      }
    }
    case MSG.FETCH_PR_CHECKS: {
      const tracked = beginTrackedFetch(message.requestId);
      try {
        const token = await tokenForMessage(message);
        const checks = await PRTreeFetch.fetchPrChecks(
          message.owner,
          message.repo,
          message.headSha,
          tracked.fetch,
          token,
          apiCtx
        );
        return { ok: true, checks };
      } catch (err) {
        if (isAbortError(err)) return { ok: false, aborted: true, error: "aborted" };
        throw err;
      } finally {
        endTrackedFetch(tracked.requestId);
      }
    }
    case MSG.FETCH_PR_DEVELOPMENT: {
      const tracked = beginTrackedFetch(message.requestId);
      try {
        const token = await tokenForMessage(message);
        const development = await PRTreeFetch.fetchPrDevelopment(
          message.owner,
          message.repo,
          message.number,
          tracked.fetch,
          token,
          { body: message.body || "", ctx: apiCtx }
        );
        return { ok: true, development };
      } catch (err) {
        if (isAbortError(err)) return { ok: false, aborted: true, error: "aborted" };
        throw err;
      } finally {
        endTrackedFetch(tracked.requestId);
      }
    }
    case MSG.FETCH_ALL_PR_FILES: {
      const tracked = beginTrackedFetch(message.requestId);
      try {
        const token = await tokenForMessage(message);
        const files = await PRTreeFetch.fetchAllPrFiles(
          message.owner,
          message.repo,
          message.number,
          tracked.fetch,
          token,
          { gitattributesText: message.gitattributesText || "", ctx: apiCtx }
        );
        return { ok: true, files };
      } catch (err) {
        if (isAbortError(err)) return { ok: false, aborted: true, error: "aborted" };
        throw err;
      } finally {
        endTrackedFetch(tracked.requestId);
      }
    }
    case MSG.UPLOAD_REPO_FILE: {
      const token = await tokenForMessage(message);
      if (!token) throw new Error("GitHub PAT required to upload files");
      const result = await PRTreeFetch.uploadRepoFile(
        message.owner,
        message.repo,
        {
          path: message.path,
          contentBase64: message.contentBase64,
          message: message.message,
          branch: message.branch
        },
        fetchImpl(),
        token,
        apiCtx
      );
      return { ok: true, result };
    }
    case MSG.APPLY_SUGGESTION: {
      const token = await tokenForMessage(message);
      if (!token) throw new Error("GitHub PAT required to apply suggestions");
      const result = await PRTreeFetch.applyReviewSuggestion(
        message.owner,
        message.repo,
        {
          path: message.path,
          headRef: message.headRef,
          startLine: message.startLine,
          endLine: message.endLine,
          suggestion: message.suggestion,
          message: message.commitMessage
        },
        fetchImpl(),
        token,
        apiCtx
      );
      return { ok: true, result };
    }
    case MSG.GET_REPO_FILE_TEXT: {
      const token = await tokenForMessage(message);
      if (!token) throw new Error("GitHub PAT required to read files");
      const result = await PRTreeFetch.getRepoFileText(
        message.owner,
        message.repo,
        {
          path: message.path,
          ref: message.ref || message.headRef || message.headSha
        },
        fetchImpl(),
        token,
        apiCtx
      );
      return { ok: true, result };
    }
    case MSG.MERGE_PULL: {
      const token = await tokenForMessage(message);
      if (!token) throw new Error("GitHub PAT required to merge");
      const result = await PRTreeFetch.mergePullRequest(
        message.owner,
        message.repo,
        message.number,
        {
          mergeMethod: message.mergeMethod || "merge",
          commitTitle: message.commitTitle,
          commitMessage: message.commitMessage
        },
        fetchImpl(),
        token,
        apiCtx
      );
      return { ok: true, result };
    }
    case MSG.UPDATE_BRANCH: {
      const token = await tokenForMessage(message);
      if (!token) throw new Error("GitHub PAT required to update branch");
      const result = await PRTreeFetch.updatePullBranch(
        message.owner,
        message.repo,
        message.number,
        { expectedHeadSha: message.expectedHeadSha },
        fetchImpl(),
        token,
        apiCtx
      );
      return { ok: true, result };
    }
    case MSG.SET_SUBSCRIPTION: {
      const token = await tokenForMessage(message);
      if (!token) throw new Error("GitHub PAT required for notifications");
      const result = await PRTreeFetch.setIssueSubscription(
        message.owner,
        message.repo,
        message.number,
        {
          subscribed: message.subscribed !== false,
          ignored: Boolean(message.ignored),
          nodeId: message.nodeId || null
        },
        fetchImpl(),
        token,
        apiCtx
      );
      return { ok: true, result };
    }
    case MSG.DELETE_SUBSCRIPTION: {
      const token = await tokenForMessage(message);
      if (!token) throw new Error("GitHub PAT required for notifications");
      const result = await PRTreeFetch.deleteIssueSubscription(
        message.owner,
        message.repo,
        message.number,
        fetchImpl(),
        token,
        message.nodeId || null
      );
      return { ok: true, result };
    }
    case MSG.SET_MILESTONE: {
      const token = await tokenForMessage(message);
      if (!token, apiCtx) throw new Error("GitHub PAT required to set milestone");
      const result = await PRTreeFetch.setIssueMilestone(
        message.owner,
        message.repo,
        message.number,
        message.milestone,
        fetchImpl(),
        token,
        apiCtx
      );
      return { ok: true, result };
    }
    case MSG.SET_DRAFT_STAGE: {
      const token = await tokenForMessage(message);
      if (!token) throw new Error("GitHub PAT required to change draft stage");
      const result = await PRTreeFetch.setPullRequestDraftStage(
        message.owner,
        message.repo,
        message.number,
        message.stage === "ready" ? "ready" : "draft",
        fetchImpl(),
        token,
        message.nodeId || null,
        apiCtx
      );
      return { ok: true, result };
    }
    default:
      return { ok: false, error: `unknown type: ${message.type}` };
  }
}
chrome.runtime.onMessage.addListener((message, _sender) => {
  if (message?.type === MSG.TOKEN_CHANGED) {
    return false;
  }
  if (!message || typeof message.type !== "string") {
    return Promise.resolve({ ok: false, error: "invalid message" });
  }
  if (message.type === MSG.CANCEL_FETCH || message.type === MSG.PING) {
    return Promise.resolve().then(() => handleMessage(message)).catch((err) => ({
      ok: false,
      error: err?.message || String(err),
      status: err?.status
    }));
  }
  return withServiceWorkerKeepAlive(
    () => withTimeout(
      handleMessage(message),
      MESSAGE_TIMEOUT_MS,
      message.type
    ).catch((err) => ({
      ok: false,
      error: err?.message || String(err),
      status: err?.status,
      aborted: isAbortError(err) || void 0
    }))
  );
});
async function rehydrateEnterpriseScripts() {
  try {
    const hosts = await registeredEnterpriseHosts();
    await syncEnterpriseContentScripts(hosts);
  } catch (err) {
    console.warn("[pr+] enterprise content scripts", err?.message || err);
  }
}
try {
  chrome.runtime.onInstalled.addListener(() => {
    void rehydrateEnterpriseScripts();
  });
  chrome.runtime.onStartup.addListener(() => {
    void rehydrateEnterpriseScripts();
  });
} catch {
}
void rehydrateEnterpriseScripts();
