/**
 * AUTO-GENERATED — do not edit. Run: npm run build:sw
 * Single-file MV3 service worker (deps + background handler).
 * TypeScript sources are transformed with esbuild before concat.
 */
/* eslint-disable */


/* ---- github-endpoints.ts ---- */

(function(global) {
  const DEFAULT_REST = "https://api.github.com", DEFAULT_GRAPHQL = "https://api.github.com/graphql";
  function normalizeHostname(host) {
    let h = String(host || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/:\d+$/, "");
    return h.includes("@") && (h = h.slice(h.lastIndexOf("@") + 1)), h;
  }
  function isPublicCloudWebHost(host) {
    const h = normalizeHostname(host);
    return h === "github.com" || h === "www.github.com";
  }
  function isKnownGithubHostname(host) {
    const h = normalizeHostname(host);
    return h ? !!(isPublicCloudWebHost(h) || h.endsWith(".github.com")) : !1;
  }
  const MAX_HOST_ACCOUNTS = 3;
  function normalizeHostAccounts(raw) {
    const list = Array.isArray(raw) ? raw : [], out = [], seen = /* @__PURE__ */ new Set();
    for (const row of list) {
      if (!row || typeof row != "object") continue;
      const host = normalizeHostname(row.host), token = typeof row.token == "string" ? row.token.trim() : "";
      if (!(!host || isPublicCloudWebHost(host) || host.endsWith(".github.com")) && !(!token || seen.has(host)) && (seen.add(host), out.push({ host, token }), out.length >= MAX_HOST_ACCOUNTS))
        break;
    }
    return out;
  }
  function hostsFromAccounts(rawAccounts) {
    return normalizeHostAccounts(rawAccounts).map((a) => a.host);
  }
  function selectTokenForWebHost(webHost, opts = {}) {
    const host = normalizeHostname(webHost) || "github.com", defaultToken = typeof opts.defaultToken == "string" && opts.defaultToken.trim() ? opts.defaultToken.trim() : null, accounts = normalizeHostAccounts(opts.hostAccounts);
    if (isPublicCloudWebHost(host) || host.endsWith(".github.com"))
      return {
        token: defaultToken,
        source: defaultToken ? "default" : null,
        host: isPublicCloudWebHost(host) ? "github.com" : host
      };
    const pair = accounts.find((a) => a.host === host);
    return pair ? { token: pair.token, source: "host", host } : { token: null, source: null, host };
  }
  function registerHostAccount(existingAccounts, host, token) {
    const accounts = normalizeHostAccounts(existingAccounts), h = normalizeHostname(host), t = typeof token == "string" ? token.trim() : "";
    if (!h)
      return { ok: !1, error: "Host is required", accounts };
    if (isPublicCloudWebHost(h) || h.endsWith(".github.com"))
      return {
        ok: !1,
        error: "github.com uses the default PAT \u2014 do not register it as enterprise",
        accounts
      };
    if (!t)
      return { ok: !1, error: "PAT is required for each enterprise host", accounts };
    const idx = accounts.findIndex((a) => a.host === h);
    if (idx >= 0) {
      const next = accounts.slice();
      return next[idx] = { host: h, token: t }, { ok: !0, accounts: next };
    }
    return accounts.length >= MAX_HOST_ACCOUNTS ? {
      ok: !1,
      error: `At most ${MAX_HOST_ACCOUNTS} enterprise hosts`,
      accounts
    } : { ok: !0, accounts: [...accounts, { host: h, token: t }] };
  }
  function unregisterHostAccount(existingAccounts, host) {
    const accounts = normalizeHostAccounts(existingAccounts), h = normalizeHostname(host);
    return {
      ok: !0,
      accounts: accounts.filter((a) => a.host !== h)
    };
  }
  function isGithubWebDocument(doc, loc) {
    const host = normalizeHostname(loc?.hostname) || normalizeHostname(
      typeof global.location < "u" ? global.location.hostname : ""
    );
    if (isKnownGithubHostname(host)) return !0;
    if (!doc || typeof doc.querySelector != "function") return !1;
    if (doc.querySelector('meta[name="github-keyboard-shortcuts"]') || doc.querySelector('meta[name="octolytics-url"]') || doc.querySelector('meta[name="octolytics-dimension-request_id"]') || doc.querySelector('meta[name="route-controller"][content]') && (doc.querySelector('meta[name="current-catalog-service"]') || doc.querySelector('link[rel="fluid-icon"]') || doc.querySelector('meta[name="theme-color"]')))
      return !0;
    const site = doc.querySelector('meta[property="og:site_name"]')?.getAttribute("content");
    return !!(site && /^GitHub\b/i.test(String(site).trim()) || doc.querySelector('link[href*="githubassets.com"]') || doc.querySelector('script[src*="githubassets.com"]'));
  }
  function stripTrailingSlashes(url) {
    return String(url || "").trim().replace(/\/+$/, "");
  }
  function graphqlUrlFromRestBase(restBase) {
    const base = stripTrailingSlashes(restBase);
    return !base || base === DEFAULT_REST || base === "https://api.github.com" ? DEFAULT_GRAPHQL : /\/api\/v3$/i.test(base) ? base.replace(/\/api\/v3$/i, "/api/graphql") : /\/api$/i.test(base) ? `${base}/graphql` : `${base}/graphql`;
  }
  function defaultEndpointsForWebHost(webHost) {
    const host = normalizeHostname(webHost);
    if (!host || host === "github.com" || host === "www.github.com")
      return {
        kind: "dotcom",
        webHost: "github.com",
        webOrigin: "https://github.com",
        restBase: DEFAULT_REST,
        graphqlUrl: DEFAULT_GRAPHQL
      };
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
    if (ctx && typeof ctx == "object" && (ctx.restBase || ctx.graphqlUrl)) {
      const restBase = stripTrailingSlashes(ctx.restBase || DEFAULT_REST) || DEFAULT_REST, graphqlUrl = stripTrailingSlashes(ctx.graphqlUrl || "") || graphqlUrlFromRestBase(restBase);
      return {
        kind: ctx.kind || "custom",
        webHost: normalizeHostname(ctx.webHost) || "github.com",
        webOrigin: ctx.webOrigin || "",
        restBase,
        graphqlUrl
      };
    }
    const webHost = typeof ctx == "string" ? ctx : ctx && typeof ctx == "object" ? ctx.webHost : null;
    return defaultEndpointsForWebHost(webHost || "github.com");
  }
  function setGithubApiContext(endpoints) {
    return normalizeApiCtx(endpoints);
  }
  function getGithubApiContext() {
    return defaultEndpointsForWebHost("github.com");
  }
  function createGithubApiExclusiveRunner() {
    return function(fn) {
      return Promise.resolve().then(fn);
    };
  }
  function githubRestUrl(path, ctx) {
    const { restBase } = normalizeApiCtx(ctx), base = stripTrailingSlashes(restBase) || DEFAULT_REST, p = String(path || "");
    return /^https?:\/\//i.test(p) ? p : `${base}${p.startsWith("/") ? p : `/${p}`}`;
  }
  function githubGraphqlUrl(ctx) {
    const { graphqlUrl } = normalizeApiCtx(ctx);
    return stripTrailingSlashes(graphqlUrl) || DEFAULT_GRAPHQL;
  }
  function normalizeEnterpriseWebHosts(rawHosts) {
    const list = Array.isArray(rawHosts) ? rawHosts : typeof rawHosts == "string" ? rawHosts.split(/[\s,]+/) : [], out = [], seen = /* @__PURE__ */ new Set();
    for (const raw of list) {
      const h = normalizeHostname(raw);
      !h || h === "github.com" || h === "www.github.com" || seen.has(h) || (seen.add(h), out.push(h));
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
  global.PRGithubEndpoints = api, typeof module < "u" && module.exports && (module.exports = api);
})(typeof globalThis < "u" ? globalThis : exports);


/* ---- modal/pure/collapse.js ---- */

(function(global) {
  var module = { exports: {} }, exports = module.exports, __defProp = Object.defineProperty, __getOwnPropDesc = Object.getOwnPropertyDescriptor, __getOwnPropNames = Object.getOwnPropertyNames, __hasOwnProp = Object.prototype.hasOwnProperty, __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: !0 });
  }, __copyProps = (to, from, except, desc) => {
    if (from && typeof from == "object" || typeof from == "function")
      for (let key of __getOwnPropNames(from))
        !__hasOwnProp.call(to, key) && key !== except && __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    return to;
  }, __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: !0 }), mod), stdin_exports = {};
  __export(stdin_exports, {
    COLLAPSED_SET_EXPLICIT_EMPTY: () => COLLAPSED_SET_EXPLICIT_EMPTY,
    DEFAULT_LARGE_CHANGES: () => DEFAULT_LARGE_CHANGES,
    DEFAULT_LARGE_PATCH_CHARS: () => DEFAULT_LARGE_PATCH_CHARS,
    annotateFilesForCollapse: () => annotateFilesForCollapse,
    attributesForPath: () => attributesForPath,
    classifyDiffFile: () => classifyDiffFile,
    defaultCollapsedPathSet: () => defaultCollapsedPathSet,
    expandPathInCollapsedSet: () => expandPathInCollapsedSet,
    isAttrEnabled: () => isAttrEnabled,
    isImagePath: () => isImagePath,
    isPathCollapsed: () => isPathCollapsed,
    matchAttrPattern: () => matchAttrPattern,
    materializeCollapsedPaths: () => materializeCollapsedPaths,
    parseGitattributes: () => parseGitattributes,
    setPathCollapsedInSet: () => setPathCollapsedInSet,
    shouldAutoExpandOnFileNav: () => shouldAutoExpandOnFileNav,
    shouldCollapseFile: () => shouldCollapseFile,
    togglePathInCollapsedSet: () => togglePathInCollapsedSet
  }), module.exports = __toCommonJS(stdin_exports);
  const DEFAULT_LARGE_CHANGES = 5e3, DEFAULT_LARGE_PATCH_CHARS = 8e4, IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|bmp|svg|ico|avif|jfif|pjpeg|pjp|tif{1,2})$/i;
  function isImagePath(path) {
    const p = String(path || "").split("?")[0].split("#")[0];
    return IMAGE_EXT_RE.test(p);
  }
  function classifyDiffFile(file) {
    if (!file)
      return { kind: "binary", openableAsText: !1, renderImage: !1 };
    const path = file.filename || file.path || "", hasPatch = (typeof file.patch == "string" ? file.patch : "").length > 0, media = String(file.mediaType || file.contentType || "").toLowerCase();
    return isImagePath(path) || media.startsWith("image/") && media !== "image/svg+xml-not" ? { kind: "image", openableAsText: !1, renderImage: !0 } : hasPatch ? { kind: "text", openableAsText: !0, renderImage: !1 } : { kind: "binary", openableAsText: !1, renderImage: !1 };
  }
  function parseGitattributes(text) {
    const rules = [];
    if (!text || typeof text != "string") return rules;
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.replace(/#.*$/, "").trim();
      if (!line) continue;
      const parts = line.split(/\s+/);
      if (parts.length < 2) continue;
      const pattern = parts[0], attrs = {};
      for (let i = 1; i < parts.length; i++) {
        const p = parts[i];
        if (p.startsWith("-"))
          attrs[p.slice(1)] = !1;
        else if (p.includes("=")) {
          const [k2, v] = p.split("=");
          attrs[k2] = v;
        } else
          attrs[p] = !0;
      }
      rules.push({ pattern, attrs });
    }
    return rules;
  }
  function matchAttrPattern(filePath, pattern) {
    if (!filePath || !pattern) return !1;
    const path = filePath.replace(/^\/+/, "");
    if (pattern === path) return !0;
    if (pattern.startsWith("**/")) {
      const rest = pattern.slice(3);
      return path === rest || path.endsWith(`/${rest}`) || path.endsWith(rest);
    }
    return pattern.startsWith("*.") ? path.endsWith(pattern.slice(1)) : pattern.includes("*") ? new RegExp(
      "^" + pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*/g, "\xA7\xA7").replace(/\*/g, "[^/]*").replace(/§§/g, ".*") + "$"
    ).test(path) : path === pattern || path.endsWith(`/${pattern}`);
  }
  function attributesForPath(filePath, rules) {
    const out = {};
    if (!Array.isArray(rules)) return out;
    for (const rule of rules)
      matchAttrPattern(filePath, rule.pattern) && Object.assign(out, rule.attrs);
    return out;
  }
  function isAttrEnabled(value) {
    if (value === !0) return !0;
    if (value === !1 || value == null) return !1;
    if (typeof value == "string") {
      const v = value.trim().toLowerCase();
      return !(v === "" || v === "false" || v === "0" || v === "no" || v === "unset");
    }
    return !!value;
  }
  function shouldCollapseFile(file, opts = {}) {
    if (!file) return !0;
    const path = file.filename || file.path || "", patch = file.patch || "", changes = file.changes ?? Number(file.additions || 0) + Number(file.deletions || 0), largeChanges = opts.largeChanges ?? DEFAULT_LARGE_CHANGES, largePatchChars = opts.largePatchChars ?? DEFAULT_LARGE_PATCH_CHARS, rules = opts.rules || [], classified = classifyDiffFile(file), attrs = attributesForPath(path, rules);
    if (isAttrEnabled(file.linguistGenerated) || isAttrEnabled(attrs["linguist-generated"]) || isAttrEnabled(file.binary) || isAttrEnabled(attrs.binary) || attrs.diff === !1 || String(attrs.diff || "").toLowerCase() === "false" || classified.kind === "binary" || changes >= largeChanges || patch && patch.length >= largePatchChars) return !0;
    if (classified.kind === "image") return !1;
    if (!patch) return !0;
    const lower = path.toLowerCase();
    return !!(lower.endsWith("package-lock.json") || lower.endsWith("yarn.lock") || lower.endsWith("pnpm-lock.yaml") || lower.endsWith(".min.js") || lower.endsWith(".min.css") || lower.endsWith(".map") || lower.includes("/dist/") || lower.endsWith(".bundle.js"));
  }
  function annotateFilesForCollapse(files, gitattributesText) {
    const rules = parseGitattributes(gitattributesText || "");
    return (Array.isArray(files) ? files : []).map((f) => {
      const path = f.filename || f.path || "", attrs = attributesForPath(path, rules), enriched = {
        ...f,
        linguistGenerated: isAttrEnabled(f.linguistGenerated) || isAttrEnabled(attrs["linguist-generated"]),
        binary: isAttrEnabled(f.binary) || isAttrEnabled(attrs.binary)
      }, classified = classifyDiffFile(enriched), collapsed = shouldCollapseFile(enriched, { rules });
      return {
        ...f,
        attrs,
        fileKind: classified.kind,
        openableAsText: classified.openableAsText,
        renderImage: classified.renderImage,
        defaultCollapsed: collapsed
      };
    });
  }
  function toPathSet(paths) {
    return paths ? paths instanceof Set ? paths : new Set(Array.isArray(paths) ? paths : []) : /* @__PURE__ */ new Set();
  }
  function isPathCollapsed(path, collapsedPaths, defaultCollapsed = !1, expandAll = !1, viewedPaths = null) {
    if (expandAll || !path) return !1;
    const set = toPathSet(collapsedPaths);
    return !!(set.has(path) || set.size === 0 && (defaultCollapsed === !0 || toPathSet(viewedPaths).has(path)));
  }
  function defaultCollapsedPathSet(files, viewedPaths = null) {
    const out = /* @__PURE__ */ new Set();
    for (const f of Array.isArray(files) ? files : []) {
      if (!f?.defaultCollapsed) continue;
      const p = f.filename || f.path;
      p && out.add(p);
    }
    for (const p of toPathSet(viewedPaths))
      p && out.add(p);
    return out;
  }
  function materializeCollapsedPaths(collapsedPaths, files, viewedPaths = null) {
    return collapsedPaths instanceof Set && collapsedPaths.size > 0 ? new Set(collapsedPaths) : Array.isArray(collapsedPaths) && collapsedPaths.length > 0 ? new Set(collapsedPaths) : defaultCollapsedPathSet(files, viewedPaths);
  }
  const COLLAPSED_SET_EXPLICIT_EMPTY = "\0prp-collapsed-explicit";
  function expandPathInCollapsedSet(collapsedPaths, path, files, viewedPaths = null) {
    const p = String(path || "").trim(), n = materializeCollapsedPaths(collapsedPaths, files, viewedPaths);
    return p && n.delete(p), n.delete(COLLAPSED_SET_EXPLICIT_EMPTY), n.size === 0 && n.add(COLLAPSED_SET_EXPLICIT_EMPTY), n;
  }
  function togglePathInCollapsedSet(collapsedPaths, path, files, viewedPaths = null) {
    const p = String(path || "").trim();
    if (!p)
      return materializeCollapsedPaths(collapsedPaths, files, viewedPaths);
    const n = materializeCollapsedPaths(collapsedPaths, files, viewedPaths);
    return n.has(p) ? n.delete(p) : n.add(p), n.delete(COLLAPSED_SET_EXPLICIT_EMPTY), n.size === 0 && n.add(COLLAPSED_SET_EXPLICIT_EMPTY), n;
  }
  function setPathCollapsedInSet(collapsedPaths, path, wantCollapsed, files, viewedPaths = null) {
    const p = String(path || "").trim();
    if (!p)
      return materializeCollapsedPaths(collapsedPaths, files, viewedPaths);
    if (!wantCollapsed)
      return expandPathInCollapsedSet(collapsedPaths, p, files, viewedPaths);
    const n = materializeCollapsedPaths(collapsedPaths, files, viewedPaths);
    return n.add(p), n.delete(COLLAPSED_SET_EXPLICIT_EMPTY), n;
  }
  function shouldAutoExpandOnFileNav(prefs) {
    return prefs?.autoExpandOnFileNav === !0;
  }
  var api = module.exports && module.exports.__esModule ? module.exports.default && typeof module.exports.default == "object" ? Object.assign({}, module.exports, module.exports.default) : module.exports.default || module.exports : module.exports;
  if (api && typeof api == "object" && api.__esModule) {
    var flat = {};
    for (var k in api)
      k !== "default" && k !== "__esModule" && Object.prototype.hasOwnProperty.call(api, k) && (flat[k] = api[k]);
    if (api.default && typeof api.default == "object")
      for (var dk in api.default)
        Object.prototype.hasOwnProperty.call(api.default, dk) && flat[dk] === void 0 && (flat[dk] = api.default[dk]);
    Object.keys(flat).length && (api = flat);
  }
  global.PRModalCollapse = api;
})(typeof globalThis < "u" ? globalThis : typeof window < "u" ? window : this);


/* ---- modal/pure/comments-page.js ---- */

(function(global) {
  var module = { exports: {} }, exports = module.exports, __defProp = Object.defineProperty, __getOwnPropDesc = Object.getOwnPropertyDescriptor, __getOwnPropNames = Object.getOwnPropertyNames, __hasOwnProp = Object.prototype.hasOwnProperty, __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: !0 });
  }, __copyProps = (to, from, except, desc) => {
    if (from && typeof from == "object" || typeof from == "function")
      for (let key of __getOwnPropNames(from))
        !__hasOwnProp.call(to, key) && key !== except && __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    return to;
  }, __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: !0 }), mod), stdin_exports = {};
  __export(stdin_exports, {
    DEFAULT_COMMENT_PAGE_SIZE: () => DEFAULT_COMMENT_PAGE_SIZE,
    advanceCommentsMeta: () => advanceCommentsMeta,
    buildCommentsListUrl: () => buildCommentsListUrl,
    buildCommentsPageMeta: () => buildCommentsPageMeta,
    clampPerPage: () => clampPerPage,
    linkHasMore: () => linkHasMore,
    mergeCommentsById: () => mergeCommentsById,
    parseLinkLastPage: () => parseLinkLastPage,
    parseLinkNextPage: () => parseLinkNextPage,
    sinceCursorFromMeta: () => sinceCursorFromMeta
  }), module.exports = __toCommonJS(stdin_exports);
  const DEFAULT_COMMENT_PAGE_SIZE = 50;
  function parseLinkRelPage(linkHeader, rel) {
    const raw = String(linkHeader || "");
    if (!raw) return null;
    const re = new RegExp(`rel="?${rel}"?`, "i"), parts = raw.split(",");
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
    return parseLinkRelPage(linkHeader, "next");
  }
  function parseLinkLastPage(linkHeader) {
    return parseLinkRelPage(linkHeader, "last");
  }
  function linkHasMore(linkHeader) {
    return parseLinkNextPage(linkHeader) != null;
  }
  function buildCommentsListUrl(kind, owner, repo, number, opts = {}) {
    const o = encodeURIComponent(String(owner || "")), r = encodeURIComponent(String(repo || "")), n = Number(number), perPage = clampPerPage(opts.perPage), page = Math.max(1, Number(opts.page) || 1), base = kind === "review" ? `https://api.github.com/repos/${o}/${r}/pulls/${n}/comments` : `https://api.github.com/repos/${o}/${r}/issues/${n}/comments`, params = new URLSearchParams();
    return params.set("per_page", String(perPage)), params.set("page", String(page)), opts.sort && params.set("sort", String(opts.sort)), opts.direction && params.set("direction", String(opts.direction)), opts.since && params.set("since", String(opts.since)), `${base}?${params.toString()}`;
  }
  function clampPerPage(n, max = 100) {
    const v = Number(n);
    return !Number.isFinite(v) || v <= 0 ? DEFAULT_COMMENT_PAGE_SIZE : Math.min(max, Math.floor(v));
  }
  function mergeCommentsById(existing, incoming, excludeIds = null) {
    const ban = excludeIds instanceof Set ? excludeIds : excludeIds ? new Set(
      (Array.isArray(excludeIds) ? excludeIds : []).map((x) => String(x))
    ) : null, map = /* @__PURE__ */ new Map();
    for (const c of Array.isArray(existing) ? existing : []) {
      if (!c || c.id == null) continue;
      const key = String(c.id);
      ban && ban.has(key) || map.set(key, c);
    }
    for (const c of Array.isArray(incoming) ? incoming : []) {
      if (!c || c.id == null) continue;
      const key = String(c.id);
      ban && ban.has(key) || map.set(key, c);
    }
    return [...map.values()].sort((a, b) => {
      const ta = String(a.createdAt || a.created_at || ""), tb = String(b.createdAt || b.created_at || "");
      return ta !== tb ? ta.localeCompare(tb) : Number(a.id) - Number(b.id);
    });
  }
  function buildCommentsPageMeta(items, opts = {}) {
    const list = Array.isArray(items) ? items : [], page = Math.max(1, Number(opts.page) || 1), perPage = clampPerPage(opts.perPage), order = opts.order === "from-end" ? "from-end" : opts.order || "asc";
    let oldest = null, newest = null, maxId = null;
    for (const c of list) {
      const at = c?.createdAt || c?.created_at || null;
      if (at && ((!oldest || at < oldest) && (oldest = at), (!newest || at > newest) && (newest = at)), c?.id != null) {
        const id = Number(c.id);
        Number.isFinite(id) && (maxId == null || id > maxId) && (maxId = id);
      }
    }
    if (order === "from-end") {
      const hasMore2 = page > 1;
      return {
        page,
        perPage,
        hasMore: hasMore2,
        nextPage: hasMore2 ? page - 1 : null,
        order: "from-end",
        since: opts.since || null,
        oldestCreatedAt: oldest,
        newestCreatedAt: newest,
        maxId,
        loadedCount: list.length
      };
    }
    const nextPage = parseLinkNextPage(opts.linkHeader), hasMore = nextPage != null || // If no Link header (mocks), treat full page as maybe-more
    opts.linkHeader == null && list.length >= perPage;
    return {
      page,
      perPage,
      hasMore: !!hasMore,
      nextPage: nextPage ?? (hasMore ? page + 1 : null),
      order,
      since: opts.since || null,
      oldestCreatedAt: oldest,
      newestCreatedAt: newest,
      maxId,
      loadedCount: list.length
    };
  }
  function advanceCommentsMeta(prevMeta, pageMeta, totalLoaded) {
    const prev = prevMeta || {}, page = pageMeta || {};
    return {
      page: page.page ?? prev.page ?? 1,
      perPage: page.perPage ?? prev.perPage ?? DEFAULT_COMMENT_PAGE_SIZE,
      hasMore: !!page.hasMore,
      nextPage: page.hasMore ? page.nextPage : null,
      order: page.order || prev.order || "asc",
      since: prev.since || null,
      oldestCreatedAt: minIso(prev.oldestCreatedAt, page.oldestCreatedAt),
      newestCreatedAt: maxIso(prev.newestCreatedAt, page.newestCreatedAt),
      maxId: page.maxId != null && (prev.maxId == null || page.maxId > prev.maxId) ? page.maxId : prev.maxId ?? page.maxId ?? null,
      loadedCount: Number.isFinite(totalLoaded) ? totalLoaded : page.loadedCount || 0
    };
  }
  function minIso(a, b) {
    return a ? b ? a < b ? a : b : a : b || null;
  }
  function maxIso(a, b) {
    return a ? b ? a > b ? a : b : a : b || null;
  }
  function sinceCursorFromMeta(meta) {
    return meta?.newestCreatedAt ? meta.newestCreatedAt : null;
  }
  var api = module.exports && module.exports.__esModule ? module.exports.default && typeof module.exports.default == "object" ? Object.assign({}, module.exports, module.exports.default) : module.exports.default || module.exports : module.exports;
  if (api && typeof api == "object" && api.__esModule) {
    var flat = {};
    for (var k in api)
      k !== "default" && k !== "__esModule" && Object.prototype.hasOwnProperty.call(api, k) && (flat[k] = api[k]);
    if (api.default && typeof api.default == "object")
      for (var dk in api.default)
        Object.prototype.hasOwnProperty.call(api.default, dk) && flat[dk] === void 0 && (flat[dk] = api.default[dk]);
    Object.keys(flat).length && (api = flat);
  }
  global.PRModalCommentsPage = api;
})(typeof globalThis < "u" ? globalThis : typeof window < "u" ? window : this);


/* ---- modal/pure/review-threads.js ---- */

(function(global) {
  var module = { exports: {} }, exports = module.exports, __defProp = Object.defineProperty, __getOwnPropDesc = Object.getOwnPropertyDescriptor, __getOwnPropNames = Object.getOwnPropertyNames, __hasOwnProp = Object.prototype.hasOwnProperty, __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: !0 });
  }, __copyProps = (to, from, except, desc) => {
    if (from && typeof from == "object" || typeof from == "function")
      for (let key of __getOwnPropNames(from))
        !__hasOwnProp.call(to, key) && key !== except && __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    return to;
  }, __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: !0 }), mod), review_threads_exports = {};
  __export(review_threads_exports, {
    REVIEW_THREADS_API_MAX: () => REVIEW_THREADS_API_MAX,
    REVIEW_THREADS_PAGE_SIZE: () => REVIEW_THREADS_PAGE_SIZE,
    REVIEW_THREADS_WARM_PROBE_SIZE: () => REVIEW_THREADS_WARM_PROBE_SIZE,
    applyByIdsRefreshDrop: () => applyByIdsRefreshDrop,
    buildReplyReviewCommentRequest: () => buildReplyReviewCommentRequest,
    buildReplyReviewThreadGraphql: () => buildReplyReviewThreadGraphql,
    buildResolveThreadGraphql: () => buildResolveThreadGraphql,
    buildRestReviewThreadsPageFromComments: () => buildRestReviewThreadsPageFromComments,
    buildShellThreadPlaceholderComment: () => buildShellThreadPlaceholderComment,
    chooseReviewThreadsTransport: () => chooseReviewThreadsTransport,
    confirmedMissingThreadIdsFromNodes: () => confirmedMissingThreadIdsFromNodes,
    countCommentsForThread: () => countCommentsForThread,
    countPendingReviewThreads: () => countPendingReviewThreads,
    countPendingReviewThreadsByPath: () => countPendingReviewThreadsByPath,
    countReviewThreadTotals: () => countReviewThreadTotals,
    countReviewThreadsByPath: () => countReviewThreadsByPath,
    countUnresolvedReviewThreadsByPath: () => countUnresolvedReviewThreadsByPath,
    dropReviewThreadsByNodeIds: () => dropReviewThreadsByNodeIds,
    ensureShellPlaceholderComments: () => ensureShellPlaceholderComments,
    filterFilesByQuery: () => filterFilesByQuery,
    graphqlCommentsAreFullyLoaded: () => graphqlCommentsAreFullyLoaded,
    groupReviewThreads: () => groupReviewThreads,
    hasUsableReviewThreadsCache: () => hasUsableReviewThreadsCache,
    hydrateReviewCommentsInPlace: () => hydrateReviewCommentsInPlace,
    isGraphqlReviewThreadNodeId: () => isGraphqlReviewThreadNodeId,
    isPathViewed: () => isPathViewed,
    mapGraphqlReviewThreadNodes: () => mapGraphqlReviewThreadNodes,
    mapGraphqlReviewThreads: () => mapGraphqlReviewThreads,
    mergeCommentsBulkIntoThreadsPage: () => mergeCommentsBulkIntoThreadsPage,
    mergeReviewThreadGroupsWithShells: () => mergeReviewThreadGroupsWithShells,
    mergeReviewThreadMeta: () => mergeReviewThreadMeta,
    mergeThreadCommentsBulkIntoDetail: () => mergeThreadCommentsBulkIntoDetail,
    newestThreadsPageMatchesCache: () => newestThreadsPageMatchesCache,
    normalizeReviewCommentId: () => normalizeReviewCommentId,
    pickNewestThreadsPageSize: () => pickNewestThreadsPageSize,
    remainingUnresolvedForByIdsBulk: () => remainingUnresolvedForByIdsBulk,
    resolveMissingThreadIdsForDrop: () => resolveMissingThreadIdsForDrop,
    resolveRootReviewCommentId: () => resolveRootReviewCommentId,
    retainShellCommentsAfterBulk: () => retainShellCommentsAfterBulk,
    selectThreadIdsForEagerComments: () => selectThreadIdsForEagerComments,
    selectThreadIdsMissingComments: () => selectThreadIdsMissingComments,
    shouldEscalateNewestThreadsProbe: () => shouldEscalateNewestThreadsProbe,
    shouldSkipUnresolvedByIdsBulk: () => shouldSkipUnresolvedByIdsBulk,
    shouldTrustRestEmptyReviewThreads: () => shouldTrustRestEmptyReviewThreads,
    threadCommentsAreLoaded: () => threadCommentsAreLoaded,
    threadNeedsEagerComments: () => threadNeedsEagerComments,
    toggleViewedPath: () => toggleViewedPath
  }), module.exports = __toCommonJS(review_threads_exports);
  function groupReviewThreads(comments) {
    const list = Array.isArray(comments) ? comments : [], byId = /* @__PURE__ */ new Map();
    for (const c of list)
      c && c.id != null && byId.set(String(c.id), c);
    const roots = [], children = /* @__PURE__ */ new Map();
    for (const c of list) {
      if (!c) continue;
      const parentId = c.inReplyToId ?? c.in_reply_to_id ?? null;
      if (parentId != null && byId.has(String(parentId))) {
        const key = String(parentId);
        children.has(key) || children.set(key, []), children.get(key).push(c);
      } else
        roots.push(c);
    }
    return roots.map((root) => {
      const replies = (children.get(String(root.id)) || []).slice().sort(
        (a, b) => String(a.createdAt || a.created_at || "").localeCompare(
          String(b.createdAt || b.created_at || "")
        )
      );
      return {
        id: root.id,
        path: root.path || "",
        line: root.line ?? root.original_line ?? null,
        side: root.side || "RIGHT",
        root,
        replies,
        resolved: !!(root.resolved ?? root.isResolved),
        outdated: !!root.outdated,
        pending: !!(root.pending || replies.some((r) => r && r.pending)),
        threadNodeId: root.threadNodeId || root.thread_id || root.pullRequestReviewThreadId || null,
        count: 1 + replies.length
      };
    });
  }
  function countReviewThreadsByPath(comments) {
    const threads = groupReviewThreads(comments), map = /* @__PURE__ */ new Map();
    for (const t of threads) {
      const p = t.path || "";
      p && map.set(p, (map.get(p) || 0) + 1);
    }
    return map;
  }
  function countUnresolvedReviewThreadsByPath(comments) {
    const threads = groupReviewThreads(comments), map = /* @__PURE__ */ new Map();
    for (const t of threads) {
      if (t.resolved) continue;
      const p = t.path || "";
      p && map.set(p, (map.get(p) || 0) + 1);
    }
    return map;
  }
  function countPendingReviewThreads(comments) {
    const threads = groupReviewThreads(comments);
    let n = 0;
    for (const t of threads)
      t.pending && (n += 1);
    return n;
  }
  function countPendingReviewThreadsByPath(comments) {
    const map = /* @__PURE__ */ new Map(), threads = groupReviewThreads(comments);
    for (const t of threads) {
      if (!t.pending) continue;
      const p = t.path || "";
      p && map.set(p, (map.get(p) || 0) + 1);
    }
    for (const c of Array.isArray(comments) ? comments : []) {
      if (!c?.pending) continue;
      const p = c.path || "";
      !p || map.has(p) || map.set(p, 1);
    }
    return map;
  }
  function countReviewThreadTotals(comments, opts = {}) {
    const pathSet = opts?.allowedPaths instanceof Set ? opts.allowedPaths : opts?.allowedPaths ? new Set(
      Array.isArray(opts.allowedPaths) ? opts.allowedPaths.map(String).filter(Boolean) : []
    ) : null, excludeOutdated = !!opts?.excludeOutdated, threads = groupReviewThreads(comments);
    let total = 0, unresolved = 0, resolved = 0, pendingThreads = 0;
    for (const t of threads) {
      const p = t.path || "";
      p && (pathSet && !pathSet.has(p) || excludeOutdated && t.outdated || (total += 1, t.pending && (pendingThreads += 1), t.resolved ? resolved += 1 : t.pending || (unresolved += 1)));
    }
    return { total, unresolved, resolved, pendingThreads };
  }
  function normalizeReviewCommentId(raw) {
    if (raw == null || raw === "") return null;
    if (typeof raw == "number" && Number.isFinite(raw) && raw > 0)
      return Math.floor(raw);
    const s = String(raw).trim();
    if (!/^\d+$/.test(s)) return null;
    const n = Number(s);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  function resolveRootReviewCommentId(comments, commentId) {
    const start = normalizeReviewCommentId(commentId);
    if (start == null) return null;
    const byId = /* @__PURE__ */ new Map();
    for (const c of Array.isArray(comments) ? comments : []) {
      if (!c || c.id == null) continue;
      const id = normalizeReviewCommentId(c.id);
      id != null && byId.set(id, c);
    }
    let cur = byId.get(start) || null;
    if (!cur) return start;
    const seen = /* @__PURE__ */ new Set();
    for (; cur; ) {
      const id = normalizeReviewCommentId(cur.id);
      if (id == null || seen.has(id)) break;
      seen.add(id);
      const parentRaw = cur.inReplyToId ?? cur.in_reply_to_id ?? null, parentId = normalizeReviewCommentId(parentRaw);
      if (parentId == null || !byId.has(parentId)) return id;
      cur = byId.get(parentId);
    }
    return start;
  }
  function filterFilesByQuery(files, query) {
    const list = Array.isArray(files) ? files : [], q = String(query || "").trim().toLowerCase();
    return q ? list.filter((f) => String(f.filename || f.path || "").toLowerCase().includes(q)) : list.slice();
  }
  function toggleViewedPath(viewed, path) {
    const next = viewed instanceof Set ? new Set(viewed) : new Set(viewed || []), p = String(path || "");
    return p && (next.has(p) ? next.delete(p) : next.add(p)), next;
  }
  function isPathViewed(viewed, path) {
    return path ? viewed instanceof Set ? viewed.has(path) : Array.isArray(viewed) ? viewed.includes(path) : !1 : !1;
  }
  var REVIEW_THREADS_API_MAX = 100, REVIEW_THREADS_PAGE_SIZE = 100, REVIEW_THREADS_WARM_PROBE_SIZE = 100;
  function hasUsableReviewThreadsCache(detail) {
    if (!detail || typeof detail != "object" || detail._sketch) return !1;
    const threads = Array.isArray(detail.reviewThreads) ? detail.reviewThreads : [], comments = Array.isArray(detail.reviewComments) ? detail.reviewComments : [], meta = detail.reviewThreadsMeta || {}, loadedMeta = Number(meta.loadedThreadCount), withNode = threads.some((t) => t && t.threadNodeId) || comments.some((c) => c && c.threadNodeId);
    return !withNode && !(loadedMeta > 0) && threads.length === 0 && comments.length === 0 ? !1 : withNode || loadedMeta > 0;
  }
  function pickNewestThreadsPageSize(opts = {}) {
    return REVIEW_THREADS_PAGE_SIZE;
  }
  function shouldTrustRestEmptyReviewThreads(opts = {}) {
    if (opts?.forceGraphql || opts?.forceFull) return !1;
    const prCount = opts?.reviewCommentsCount;
    if (prCount != null && Number.isFinite(Number(prCount)) && Number(prCount) <= 0)
      return !0;
    const restN = opts?.restCommentCount;
    return !!(restN != null && Number.isFinite(Number(restN)) && Number(restN) <= 0);
  }
  function chooseReviewThreadsTransport(opts = {}) {
    return opts?.preferRest === !0 ? "rest" : (opts?.forceGraphql || opts?.forceFull || opts?.preferRest === !1, "graphql");
  }
  function isGraphqlReviewThreadNodeId(id) {
    return /^PRRT_/i.test(String(id || "").trim());
  }
  function threadNeedsEagerComments(thread, opts = {}) {
    if (!thread || !isGraphqlReviewThreadNodeId(thread.threadNodeId)) return !1;
    if (opts?.forceAll) return !0;
    const tid = String(thread.threadNodeId), expanded = opts?.expandedThreadIds;
    if (expanded != null) {
      if (expanded instanceof Set) {
        if (expanded.has(tid)) return !0;
      } else if (Array.isArray(expanded)) {
        if (expanded.some((id) => String(id) === tid)) return !0;
      } else if (typeof expanded[Symbol.iterator] == "function") {
        for (const id of expanded)
          if (String(id) === tid) return !0;
      }
    }
    return !thread.resolved;
  }
  function selectThreadIdsForEagerComments(threads, opts = {}) {
    const list = Array.isArray(threads) ? threads : [], out = [], seen = /* @__PURE__ */ new Set();
    for (const t of list) {
      if (!threadNeedsEagerComments(t, opts)) continue;
      const id = String(t.threadNodeId || "").trim();
      !id || seen.has(id) || t.commentsLoaded !== !0 && (seen.add(id), out.push(id));
    }
    return out;
  }
  function threadCommentsAreLoaded(thread, comments = null) {
    if (!thread) return !1;
    if (thread.commentsLoaded === !0) return !0;
    if (thread.commentsLoaded === !1) return !1;
    if (Array.isArray(thread.commentIds) && thread.commentIds.length > 0 && !isGraphqlReviewThreadNodeId(thread.threadNodeId))
      return !0;
    const tid = String(thread.threadNodeId || "");
    if (!tid || !Array.isArray(comments)) return !1;
    let n = 0;
    for (const c of comments)
      !c || String(c.threadNodeId || "") !== tid || c._commentsPending || (n += 1);
    return n > 0;
  }
  function selectThreadIdsMissingComments(threads, comments = null, opts = {}) {
    const list = Array.isArray(threads) ? threads : [], only = opts?.onlyThreadIds ? new Set(
      [...opts.onlyThreadIds].map((id) => String(id || "").trim()).filter(Boolean)
    ) : null, out = [], seen = /* @__PURE__ */ new Set();
    for (const t of list) {
      const id = String(t?.threadNodeId || "").trim();
      if (isGraphqlReviewThreadNodeId(id) && !(only && !only.has(id))) {
        if (only) {
          if (threadCommentsAreLoaded(t, comments)) continue;
        } else if (threadNeedsEagerComments(t, opts)) {
          if (threadCommentsAreLoaded(t, comments))
            continue;
        } else continue;
        seen.has(id) || (seen.add(id), out.push(id));
      }
    }
    return out;
  }
  function shouldSkipUnresolvedByIdsBulk(opts = {}) {
    return opts?.forceFull || opts?.mode === "full-threads" ? !1 : opts?.hostRestFallback ? !0 : String(opts?.newestSource || "").toLowerCase() === "rest";
  }
  function remainingUnresolvedForByIdsBulk(unresolvedIds, updatedIdSet = null, knownMissing = null) {
    const updated = updatedIdSet instanceof Set ? updatedIdSet : new Set(
      [...updatedIdSet || []].map((id) => String(id || "")).filter(Boolean)
    ), missing = knownMissing instanceof Set ? knownMissing : new Set(
      [...knownMissing || []].map((id) => String(id || "")).filter(Boolean)
    ), out = [], seen = /* @__PURE__ */ new Set();
    for (const raw of unresolvedIds || []) {
      const id = String(raw || "").trim();
      !id || seen.has(id) || isGraphqlReviewThreadNodeId(id) && (updated.has(id) || missing.has(id) || (seen.add(id), out.push(id)));
    }
    return out;
  }
  function confirmedMissingThreadIdsFromNodes(chunkIds, rawNodes) {
    const ids = Array.isArray(chunkIds) ? chunkIds.map((id) => String(id)) : [];
    if (!Array.isArray(rawNodes) || !ids.length) return [];
    const missing = [], n = Math.min(ids.length, rawNodes.length);
    for (let i = 0; i < n; i++)
      rawNodes[i] == null && missing.push(ids[i]);
    return missing;
  }
  function resolveMissingThreadIdsForDrop(page) {
    if (!page || typeof page != "object") return [];
    if (!Array.isArray(page.missingThreadIds)) return [];
    const ids = page.missingThreadIds.map((id) => String(id || "").trim()).filter(Boolean);
    return [...new Set(ids)];
  }
  function dropReviewThreadsByNodeIds(detail, threadNodeIds) {
    if (!detail) return detail;
    const drop = new Set(
      [...threadNodeIds || []].map((id) => String(id || "").trim()).filter(Boolean)
    );
    if (!drop.size) return detail;
    const prevRc = Array.isArray(detail.reviewComments) ? detail.reviewComments : [], prevTh = Array.isArray(detail.reviewThreads) ? detail.reviewThreads : [];
    return {
      ...detail,
      reviewComments: prevRc.filter((c) => {
        if (!c) return !1;
        const tid = c.threadNodeId ? String(c.threadNodeId) : "";
        return !(tid && drop.has(tid));
      }),
      reviewThreads: prevTh.filter(
        (t) => !t?.threadNodeId || !drop.has(String(t.threadNodeId))
      )
    };
  }
  function applyByIdsRefreshDrop(detail, page) {
    const missing = resolveMissingThreadIdsForDrop(page);
    return missing.length ? dropReviewThreadsByNodeIds(detail, missing) : detail;
  }
  function buildRestReviewThreadsPageFromComments(items, direction = "newest") {
    const list = Array.isArray(items) ? items : [], empty = {
      threads: [],
      comments: [],
      hasMore: !1,
      endCursor: null,
      startCursor: null,
      hasNextPage: !1,
      hasPreviousPage: !1,
      totalCount: 0,
      pageCount: list.length ? 1 : 0,
      direction: direction || "newest",
      window: "newest",
      source: "rest"
    };
    if (!list.length) return empty;
    const byId = /* @__PURE__ */ new Map();
    for (const c of list)
      c && c.id != null && byId.set(String(c.id), c);
    return {
      threads: list.filter((c) => {
        if (!c || c.id == null) return !1;
        const parent = c.inReplyToId ?? c.in_reply_to_id ?? null;
        return parent == null || !byId.has(String(parent));
      }).map((r) => {
        const replyIds = list.filter(
          (c) => c && String(c.inReplyToId ?? c.in_reply_to_id ?? "") === String(r.id)
        ).map((c) => c.id), threadNodeId = r.threadNodeId && /^PRRT_/i.test(String(r.threadNodeId)) ? String(r.threadNodeId) : `rest-thread-${r.id}`, commentIds = [r.id, ...replyIds];
        for (const cid of commentIds) {
          const row = byId.get(String(cid));
          row && (row.threadNodeId = threadNodeId, row.loadWindow = "newest");
        }
        return {
          threadNodeId,
          resolved: !!(r.resolved ?? r.isResolved),
          outdated: !!r.outdated,
          path: r.path || "",
          line: r.line ?? r.originalLine ?? r.original_line ?? null,
          startLine: r.startLine ?? r.start_line ?? null,
          side: r.side || "RIGHT",
          commentIds,
          commentsLoaded: !0,
          loadWindow: "newest"
        };
      }),
      comments: list,
      totalCount: list.length,
      startCursor: null,
      endCursor: null,
      hasNextPage: !1,
      hasPreviousPage: !1,
      hasMore: !1,
      pageCount: 1,
      direction: direction || "newest",
      window: "newest",
      source: "rest"
    };
  }
  function countCommentsForThread(pageOrDetail, threadNodeId, thread = null) {
    const id = String(threadNodeId || "");
    if (!id) return 0;
    if (thread && Array.isArray(thread.commentIds) && thread.commentIds.length)
      return thread.commentIds.length;
    const comments = Array.isArray(pageOrDetail?.comments) ? pageOrDetail.comments : Array.isArray(pageOrDetail?.reviewComments) ? pageOrDetail.reviewComments : [];
    let n = 0;
    for (const c of comments)
      c && c.threadNodeId != null && String(c.threadNodeId) === id && (n += 1);
    return n;
  }
  function newestThreadsPageMatchesCache(page, detail) {
    if (!page || !detail)
      return { match: !1, reason: "missing" };
    if (!hasUsableReviewThreadsCache(detail))
      return { match: !1, reason: "no-cache" };
    const pageThreads = Array.isArray(page.threads) ? page.threads : [], cachedThreads = Array.isArray(detail.reviewThreads) ? detail.reviewThreads : [], byId = /* @__PURE__ */ new Map();
    for (const t of cachedThreads)
      t?.threadNodeId && byId.set(String(t.threadNodeId), t);
    if (byId.size === 0)
      for (const c of Array.isArray(detail.reviewComments) ? detail.reviewComments : []) {
        if (!c?.threadNodeId) continue;
        const id = String(c.threadNodeId);
        byId.has(id) || byId.set(id, {
          threadNodeId: id,
          resolved: !!c.resolved
        });
      }
    const pageTotal = typeof page.totalCount == "number" && Number.isFinite(page.totalCount) ? page.totalCount : null, cachedTotalRaw = detail.reviewThreadsMeta?.totalCount, cachedTotal = typeof cachedTotalRaw == "number" && Number.isFinite(cachedTotalRaw) ? cachedTotalRaw : null;
    if (pageTotal != null && cachedTotal != null && pageTotal !== cachedTotal)
      return { match: !1, reason: "totalCount" };
    const pageIds = [];
    for (const t of pageThreads) {
      if (!t?.threadNodeId) continue;
      const id = String(t.threadNodeId);
      pageIds.push(id);
      const cached = byId.get(id);
      if (!cached)
        return { match: !1, reason: "unknown-thread" };
      if (!!cached.resolved != !!t.resolved)
        return { match: !1, reason: "resolved" };
      const pageN = countCommentsForThread(page, id, t);
      if (pageN > 0) {
        const cacheN = countCommentsForThread(detail, id, cached);
        if (cacheN > 0 && cacheN !== pageN)
          return { match: !1, reason: "comment-count" };
        if (cacheN === 0 && pageN > 0 && byId.has(id) && Array.isArray(detail.reviewComments) && detail.reviewComments.length > 0)
          return { match: !1, reason: "comment-count" };
      }
    }
    const prevNewest = Array.isArray(detail.reviewThreadsMeta?.newestThreadIds) ? detail.reviewThreadsMeta.newestThreadIds.map(String).filter(Boolean) : [];
    if (prevNewest.length > 0 && pageIds.length > 0) {
      for (let i = 0; i < pageIds.length; i++)
        if (String(prevNewest[i] || "") !== pageIds[i])
          return { match: !1, reason: "order" };
    }
    return { match: !0, reason: "ok" };
  }
  function shouldEscalateNewestThreadsProbe(page, detail, pageSize) {
    return Math.max(0, Number(pageSize) || 0) >= REVIEW_THREADS_API_MAX ? !1 : hasUsableReviewThreadsCache(detail) ? !newestThreadsPageMatchesCache(page, detail).match : !0;
  }
  function mergeReviewThreadMeta(comments, threads) {
    const list = Array.isArray(comments) ? comments : [], byCommentId = /* @__PURE__ */ new Map();
    for (const t of Array.isArray(threads) ? threads : []) {
      if (!t || !t.threadNodeId) continue;
      const meta = {
        threadNodeId: String(t.threadNodeId),
        resolved: !!t.resolved
      };
      for (const id of t.commentIds || [])
        id != null && byCommentId.set(String(id), meta);
    }
    return list.map((c) => {
      if (!c) return c;
      const meta = c.id != null ? byCommentId.get(String(c.id)) : null;
      return meta ? {
        ...c,
        threadNodeId: meta.threadNodeId,
        resolved: meta.resolved
      } : {
        ...c,
        threadNodeId: c.threadNodeId || null,
        resolved: !!c.resolved
      };
    });
  }
  function mapGraphqlReviewThreads(nodes) {
    return Array.isArray(nodes) ? nodes.filter((t) => t && t.id).map((t) => ({
      threadNodeId: t.id,
      resolved: !!t.isResolved,
      commentIds: (t.comments?.nodes || []).map((c) => c?.databaseId).filter((id) => id != null)
    })) : [];
  }
  function graphqlCommentsAreFullyLoaded(commentsConn) {
    if (!commentsConn || typeof commentsConn != "object") return !1;
    const nodes = Array.isArray(commentsConn.nodes) ? commentsConn.nodes : [], totalRaw = commentsConn.totalCount, total = typeof totalRaw == "number" && Number.isFinite(totalRaw) ? totalRaw : null;
    return nodes.length === 0 ? total === 0 : total != null ? total <= nodes.length : !0;
  }
  function mapGraphqlReviewThreadNodes(allNodes) {
    const threads = [], comments = [];
    for (const t of Array.isArray(allNodes) ? allNodes : []) {
      if (!t?.id) continue;
      const commentsConnPresent = t.comments != null && typeof t.comments == "object", commentsLoaded = commentsConnPresent && graphqlCommentsAreFullyLoaded(t.comments), commentIds = [];
      if (commentsConnPresent)
        for (const node of t.comments?.nodes || []) {
          if (!node) continue;
          const dbId = node.databaseId ?? node.id;
          if (dbId == null) continue;
          const id = typeof dbId == "number" ? dbId : Number(dbId) || String(dbId);
          commentIds.push(id);
          const reviewState = String(
            node.pullRequestReview?.state || ""
          ).toUpperCase(), reviewDbId = node.pullRequestReview?.databaseId != null ? Number(node.pullRequestReview.databaseId) : null, pending = reviewState === "PENDING";
          comments.push({
            id,
            body: node.body || "",
            path: node.path || t.path || "",
            line: node.line ?? t.line ?? null,
            side: t.diffSide || "RIGHT",
            author: node.author?.login || "",
            avatarUrl: node.author?.avatarUrl || "",
            createdAt: node.createdAt || null,
            inReplyToId: node.replyTo?.databaseId ?? null,
            threadNodeId: t.id,
            // Shell first:1 includes pullRequestReview so timeline can group
            // before by-ids hydrate (resolved threads skip eager bulk).
            reviewId: Number.isFinite(reviewDbId) ? reviewDbId : null,
            resolved: !!t.isResolved,
            outdated: !!(node.outdated ?? t.isOutdated),
            pending,
            pendingReviewId: pending ? reviewDbId : null,
            // Preview-only root when shell first:1 and more replies remain
            _commentsPreview: !commentsLoaded
          });
        }
      threads.push({
        threadNodeId: t.id,
        resolved: !!t.isResolved,
        outdated: !!t.isOutdated,
        path: t.path || "",
        line: t.line ?? t.originalLine ?? null,
        startLine: t.startLine ?? t.originalStartLine ?? null,
        side: t.diffSide || "RIGHT",
        commentIds,
        commentsLoaded,
        commentCount: typeof t.comments?.totalCount == "number" ? t.comments.totalCount : commentIds.length || null
      });
    }
    return { threads, comments };
  }
  function mergeCommentsBulkIntoThreadsPage(shellPage, bulkPage) {
    const shellThreads = Array.isArray(shellPage?.threads) ? shellPage.threads : [], bulkThreads = Array.isArray(bulkPage?.threads) ? bulkPage.threads : [], bulkComments = Array.isArray(bulkPage?.comments) ? bulkPage.comments : [], byId = new Map(
      bulkThreads.filter((t) => t?.threadNodeId).map((t) => [String(t.threadNodeId), t])
    ), threads = shellThreads.map((t) => {
      const id = t?.threadNodeId ? String(t.threadNodeId) : "", full = id ? byId.get(id) : null;
      if (!full)
        return {
          ...t,
          commentsLoaded: t.commentsLoaded === !0
        };
      const fullObj = full && typeof full == "object" ? full : {};
      return {
        ...t,
        ...fullObj,
        commentsLoaded: !0,
        commentIds: Array.isArray(fullObj.commentIds) ? fullObj.commentIds : t.commentIds || []
      };
    }), loadedIds = new Set(
      threads.filter((t) => t.commentsLoaded).map((t) => String(t.threadNodeId))
    ), prevComments = Array.isArray(shellPage?.comments) ? shellPage.comments : [], kept = retainShellCommentsAfterBulk(prevComments, loadedIds), seen = new Set(kept.map((c) => String(c.id)));
    for (const c of bulkComments) {
      if (!c || c.id == null) continue;
      const k2 = String(c.id);
      seen.has(k2) || (seen.add(k2), kept.push(c));
    }
    return {
      ...shellPage,
      threads,
      comments: ensureShellPlaceholderComments(threads, kept),
      shellOnly: !1
    };
  }
  function retainShellCommentsAfterBulk(prevComments, loadedIds) {
    const loaded = loadedIds instanceof Set ? loadedIds : new Set(
      [...loadedIds || []].map((id) => String(id || "").trim()).filter(Boolean)
    ), kept = [];
    for (const c of Array.isArray(prevComments) ? prevComments : []) {
      if (!c?.threadNodeId) continue;
      const tid = String(c.threadNodeId);
      if (loaded.has(tid)) {
        if (c._commentsPending || c._commentsPreview) continue;
        kept.push(c);
        continue;
      }
      c._commentsPending && !String(c.body || "").trim() || kept.push(c);
    }
    return kept;
  }
  function hydrateReviewCommentsInPlace(prevComments, bulkComments, loadedThreadIds) {
    const loaded = loadedThreadIds instanceof Set ? loadedThreadIds : new Set(
      [...loadedThreadIds || []].map((id) => String(id || "").trim()).filter(Boolean)
    );
    if (!loaded.size)
      return Array.isArray(prevComments) ? prevComments.slice() : [];
    const bulkByTid = /* @__PURE__ */ new Map();
    for (const c of Array.isArray(bulkComments) ? bulkComments : []) {
      if (!c || c.id == null) continue;
      const tid = String(c.threadNodeId || "").trim();
      if (!tid || !loaded.has(tid)) continue;
      bulkByTid.has(tid) || bulkByTid.set(tid, []);
      const row = c._commentsPreview ? { ...c, _commentsPreview: !1 } : c;
      bulkByTid.get(tid).push(row);
    }
    const emitted = /* @__PURE__ */ new Set(), result = [];
    for (const c of Array.isArray(prevComments) ? prevComments : []) {
      if (!c) continue;
      const tid = c.threadNodeId != null ? String(c.threadNodeId) : "";
      if (tid && loaded.has(tid)) {
        if (!emitted.has(tid)) {
          emitted.add(tid);
          const bulk = bulkByTid.get(tid) || [];
          for (const bc of bulk) result.push(bc);
        }
        continue;
      }
      result.push(c);
    }
    for (const [tid, bulk] of bulkByTid)
      if (!emitted.has(tid))
        for (const bc of bulk) result.push(bc);
    return result;
  }
  function mergeThreadCommentsBulkIntoDetail(detail, bulkPage) {
    if (!detail || typeof detail != "object") return detail;
    const prevTh = Array.isArray(detail.reviewThreads) ? detail.reviewThreads : [], prevRc = Array.isArray(detail.reviewComments) ? detail.reviewComments : [], bulkThreads = Array.isArray(bulkPage?.threads) ? bulkPage.threads : [], bulkComments = Array.isArray(bulkPage?.comments) ? bulkPage.comments : [], byId = new Map(
      bulkThreads.filter((t) => t?.threadNodeId).map((t) => [String(t.threadNodeId), t])
    ), reviewThreads = prevTh.map((t) => {
      const id = t?.threadNodeId ? String(t.threadNodeId) : "", full = id ? byId.get(id) : null;
      if (!full) return t;
      const fullObj = full && typeof full == "object" ? full : {};
      return {
        ...t,
        ...fullObj,
        commentsLoaded: !0,
        commentIds: Array.isArray(fullObj.commentIds) ? fullObj.commentIds : t.commentIds || []
      };
    });
    for (const t of bulkThreads) {
      const id = t?.threadNodeId ? String(t.threadNodeId) : "";
      !id || prevTh.some((p) => String(p?.threadNodeId) === id) || reviewThreads.push({ ...t, commentsLoaded: !0 });
    }
    const loadedIds = new Set(
      bulkThreads.map((t) => String(t?.threadNodeId || "")).filter(Boolean)
    ), reviewComments = hydrateReviewCommentsInPlace(
      prevRc,
      bulkComments,
      loadedIds
    );
    return {
      ...detail,
      reviewThreads,
      reviewComments
    };
  }
  function buildShellThreadPlaceholderComment(thread) {
    if (!thread || !isGraphqlReviewThreadNodeId(thread.threadNodeId)) return null;
    const tid = String(thread.threadNodeId);
    return {
      id: `shell:${tid}`,
      author: "",
      avatarUrl: "",
      body: "",
      path: thread.path || "",
      line: thread.line ?? null,
      startLine: thread.startLine ?? null,
      side: thread.side || "RIGHT",
      threadNodeId: tid,
      resolved: !!thread.resolved,
      outdated: !!thread.outdated,
      pending: !1,
      _commentsPending: !0,
      commentsLoaded: !1
    };
  }
  function ensureShellPlaceholderComments(threads, comments = null) {
    const list = Array.isArray(comments) ? comments.slice() : [], covered = /* @__PURE__ */ new Set();
    for (const c of list)
      c?.threadNodeId && covered.add(String(c.threadNodeId));
    for (const t of Array.isArray(threads) ? threads : []) {
      const tid = t?.threadNodeId ? String(t.threadNodeId) : "";
      if (!isGraphqlReviewThreadNodeId(tid) || covered.has(tid)) continue;
      const ph = buildShellThreadPlaceholderComment(t);
      ph && (list.push(ph), covered.add(tid));
    }
    return list;
  }
  function mergeReviewThreadGroupsWithShells(commentGroups, reviewThreads) {
    const groups = Array.isArray(commentGroups) ? commentGroups.slice() : [], have = /* @__PURE__ */ new Set();
    for (const g of groups) {
      const tid = g?.threadNodeId || g?.root?.threadNodeId || null;
      tid && have.add(String(tid));
    }
    for (const t of Array.isArray(reviewThreads) ? reviewThreads : []) {
      const tid = t?.threadNodeId ? String(t.threadNodeId) : "";
      !tid || have.has(tid) || threadCommentsAreLoaded(t, null) && (t.commentIds || []).length || (have.add(tid), groups.push({
        id: `shell:${tid}`,
        path: t.path || "",
        line: t.line ?? null,
        side: t.side || "RIGHT",
        root: {
          id: `shell:${tid}`,
          body: "",
          path: t.path || "",
          line: t.line ?? null,
          side: t.side || "RIGHT",
          threadNodeId: tid,
          resolved: !!t.resolved,
          outdated: !!t.outdated,
          _commentsPending: !0
        },
        replies: [],
        resolved: !!t.resolved,
        outdated: !!t.outdated,
        pending: !1,
        threadNodeId: tid,
        count: 0,
        commentsPending: !0,
        commentsLoaded: !1
      }));
    }
    return groups;
  }
  function buildReplyReviewThreadGraphql(threadNodeId, body) {
    return {
      method: "POST",
      url: "https://api.github.com/graphql",
      body: {
        query: `mutation($id:ID!,$body:String!){
  addPullRequestReviewThreadReply(input:{pullRequestReviewThreadId:$id,body:$body}){
    comment { databaseId body }
  }
}`,
        variables: {
          id: String(threadNodeId || ""),
          body: String(body || "").trim()
        }
      }
    };
  }
  function buildReplyReviewCommentRequest(owner, repo, pullNumber, commentId, body) {
    const parentId = normalizeReviewCommentId(commentId), text = String(body || "").trim();
    return {
      method: "POST",
      url: `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}/comments/${parentId ?? commentId}/replies`,
      body: { body: text }
    };
  }
  function buildResolveThreadGraphql(threadNodeId, resolved = !0) {
    return {
      method: "POST",
      url: "https://api.github.com/graphql",
      body: {
        query: resolved ? "mutation($id:ID!){ resolveReviewThread(input:{threadId:$id}){ thread { id isResolved } } }" : "mutation($id:ID!){ unresolveReviewThread(input:{threadId:$id}){ thread { id isResolved } } }",
        variables: { id: threadNodeId }
      }
    };
  }
  var api = module.exports && module.exports.__esModule ? module.exports.default && typeof module.exports.default == "object" ? Object.assign({}, module.exports, module.exports.default) : module.exports.default || module.exports : module.exports;
  if (api && typeof api == "object" && api.__esModule) {
    var flat = {};
    for (var k in api)
      k !== "default" && k !== "__esModule" && Object.prototype.hasOwnProperty.call(api, k) && (flat[k] = api[k]);
    if (api.default && typeof api.default == "object")
      for (var dk in api.default)
        Object.prototype.hasOwnProperty.call(api.default, dk) && flat[dk] === void 0 && (flat[dk] = api.default[dk]);
    Object.keys(flat).length && (api = flat);
  }
  global.PRModalReviewThreads = api;
})(typeof globalThis < "u" ? globalThis : typeof window < "u" ? window : this);


/* ---- modal/pure/pending-review.js ---- */

(function(global) {
  var module = { exports: {} }, exports = module.exports, __defProp = Object.defineProperty, __getOwnPropDesc = Object.getOwnPropertyDescriptor, __getOwnPropNames = Object.getOwnPropertyNames, __hasOwnProp = Object.prototype.hasOwnProperty, __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: !0 });
  }, __copyProps = (to, from, except, desc) => {
    if (from && typeof from == "object" || typeof from == "function")
      for (let key of __getOwnPropNames(from))
        !__hasOwnProp.call(to, key) && key !== except && __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    return to;
  }, __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: !0 }), mod), stdin_exports = {};
  __export(stdin_exports, {
    addPendingComment: () => addPendingComment,
    buildPendingReviewSubmitPayload: () => buildPendingReviewSubmitPayload,
    createEmptyPendingReview: () => createEmptyPendingReview,
    discardPendingReview: () => discardPendingReview,
    pendingReviewCount: () => pendingReviewCount,
    pendingReviewCtaLabel: () => pendingReviewCtaLabel,
    setPendingReviewBody: () => setPendingReviewBody
  }), module.exports = __toCommonJS(stdin_exports);
  function createEmptyPendingReview() {
    return { comments: [], body: "" };
  }
  function addPendingComment(batch, comment) {
    const base = batch && Array.isArray(batch.comments) ? batch : createEmptyPendingReview(), body = String(comment?.body || "").trim();
    if (!body || !comment?.path || comment.line == null)
      return { batch: base, added: !1 };
    const id = comment.id || `pc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    return { batch: {
      body: base.body || "",
      comments: [
        ...base.comments,
        {
          id,
          path: comment.path,
          line: Number(comment.line),
          side: comment.side || "RIGHT",
          startLine: comment.startLine != null && Number(comment.startLine) !== Number(comment.line) ? Number(comment.startLine) : void 0,
          startSide: comment.startSide || comment.side || "RIGHT",
          body
        }
      ]
    }, added: !0 };
  }
  function discardPendingReview() {
    return createEmptyPendingReview();
  }
  function setPendingReviewBody(batch, body) {
    return { ...batch && Array.isArray(batch.comments) ? batch : createEmptyPendingReview(), body: String(body || "") };
  }
  function pendingReviewCount(batch) {
    return Array.isArray(batch?.comments) ? batch.comments.length : 0;
  }
  function pendingReviewCtaLabel(batch) {
    return pendingReviewCount(batch) > 0 ? "Add comment" : "Start review";
  }
  function buildPendingReviewSubmitPayload(batch, opts = {
    // typed loosely for mutable REST payloads
  }) {
    const event = opts.event || "COMMENT";
    if (!["COMMENT", "APPROVE", "REQUEST_CHANGES"].includes(event))
      return null;
    const comments = (batch?.comments || []).map((c) => {
      const row = {
        path: c.path,
        body: c.body,
        line: Number(c.line),
        side: c.side || "RIGHT"
      };
      return c.startLine != null && Number(c.startLine) !== Number(c.line) && (row.start_line = Number(c.startLine), row.start_side = c.startSide || c.side || "RIGHT"), row;
    }), payload = {
      event,
      body: opts.body != null ? String(opts.body) : String(batch?.body || "")
    };
    return opts.commitId && (payload.commit_id = opts.commitId), comments.length && (payload.comments = comments), payload;
  }
  var api = module.exports && module.exports.__esModule ? module.exports.default && typeof module.exports.default == "object" ? Object.assign({}, module.exports, module.exports.default) : module.exports.default || module.exports : module.exports;
  if (api && typeof api == "object" && api.__esModule) {
    var flat = {};
    for (var k in api)
      k !== "default" && k !== "__esModule" && Object.prototype.hasOwnProperty.call(api, k) && (flat[k] = api[k]);
    if (api.default && typeof api.default == "object")
      for (var dk in api.default)
        Object.prototype.hasOwnProperty.call(api.default, dk) && flat[dk] === void 0 && (flat[dk] = api.default[dk]);
    Object.keys(flat).length && (api = flat);
  }
  global.PRModalPendingReview = api;
})(typeof globalThis < "u" ? globalThis : typeof window < "u" ? window : this);


/* ---- modal/pure/pr-edit-api.js ---- */

(function(global) {
  var module = { exports: {} }, exports = module.exports, __defProp = Object.defineProperty, __getOwnPropDesc = Object.getOwnPropertyDescriptor, __getOwnPropNames = Object.getOwnPropertyNames, __hasOwnProp = Object.prototype.hasOwnProperty, __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: !0 });
  }, __copyProps = (to, from, except, desc) => {
    if (from && typeof from == "object" || typeof from == "function")
      for (let key of __getOwnPropNames(from))
        !__hasOwnProp.call(to, key) && key !== except && __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    return to;
  }, __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: !0 }), mod), stdin_exports = {};
  __export(stdin_exports, {
    appendIssueCommentToDetail: () => appendIssueCommentToDetail,
    appendOptimisticReviewComment: () => appendOptimisticReviewComment,
    applyResolveStamps: () => applyResolveStamps,
    applySuggestionToFileContent: () => applySuggestionToFileContent,
    buildApplySuggestionCommitRequest: () => buildApplySuggestionCommitRequest,
    buildDeleteSubscription: () => buildDeleteSubscription,
    buildDraftStageGraphql: () => buildDraftStageGraphql,
    buildEditIssueComment: () => buildEditIssueComment,
    buildEditReviewComment: () => buildEditReviewComment,
    buildMergePullRequest: () => buildMergePullRequest,
    buildRemoveAssignees: () => buildRemoveAssignees,
    buildRemoveReviewers: () => buildRemoveReviewers,
    buildRequestReviewers: () => buildRequestReviewers,
    buildRerequestReviewerLogins: () => buildRerequestReviewerLogins,
    buildSetAssignees: () => buildSetAssignees,
    buildSetLabels: () => buildSetLabels,
    buildSetMilestone: () => buildSetMilestone,
    buildSetSubscription: () => buildSetSubscription,
    buildUpdateBranch: () => buildUpdateBranch,
    buildUpdatePullRequest: () => buildUpdatePullRequest,
    canSubmitReviewVerdict: () => canSubmitReviewVerdict,
    draftFromStageGraphqlData: () => draftFromStageGraphqlData,
    isReviewVerdictKind: () => isReviewVerdictKind,
    isViewerPrAuthor: () => isViewerPrAuthor,
    mapLeaveReviewAction: () => mapLeaveReviewAction,
    mapRestIssueComment: () => mapRestIssueComment,
    mapRestReviewComment: () => mapRestReviewComment,
    normalizeGithubLogin: () => normalizeGithubLogin,
    parseLinkedIssueNumbers: () => parseLinkedIssueNumbers,
    parseSuggestionFences: () => parseSuggestionFences,
    stampThreadResolved: () => stampThreadResolved
  }), module.exports = __toCommonJS(stdin_exports);
  function buildUpdatePullRequest(owner, repo, pullNumber, fields = {
    // typed loosely for mutable REST payloads
  }) {
    const body = {};
    return fields.title != null && (body.title = String(fields.title)), fields.body != null && (body.body = String(fields.body)), fields.base != null && (body.base = String(fields.base)), fields.state != null && (body.state = fields.state === "closed" ? "closed" : "open"), {
      method: "PATCH",
      url: `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}`,
      body
    };
  }
  function buildEditIssueComment(owner, repo, commentId, body) {
    return {
      method: "PATCH",
      url: `https://api.github.com/repos/${owner}/${repo}/issues/comments/${commentId}`,
      body: { body: String(body || "") }
    };
  }
  function buildEditReviewComment(owner, repo, commentId, body) {
    return {
      method: "PATCH",
      url: `https://api.github.com/repos/${owner}/${repo}/pulls/comments/${commentId}`,
      body: { body: String(body || "") }
    };
  }
  function buildRequestReviewers(owner, repo, pullNumber, { reviewers = [], teamReviewers = [] } = {}) {
    return {
      method: "POST",
      url: `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}/requested_reviewers`,
      body: {
        reviewers: reviewers.slice(),
        team_reviewers: teamReviewers.slice()
      }
    };
  }
  function buildRemoveReviewers(owner, repo, pullNumber, { reviewers = [], teamReviewers = [] } = {}) {
    return {
      method: "DELETE",
      url: `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}/requested_reviewers`,
      body: {
        reviewers: reviewers.slice(),
        team_reviewers: teamReviewers.slice()
      }
    };
  }
  function buildSetAssignees(owner, repo, issueNumber, assignees) {
    return {
      method: "POST",
      url: `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/assignees`,
      body: { assignees: (assignees || []).slice() }
    };
  }
  function buildRemoveAssignees(owner, repo, issueNumber, assignees) {
    return {
      method: "DELETE",
      url: `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/assignees`,
      body: { assignees: (assignees || []).slice() }
    };
  }
  function buildSetLabels(owner, repo, issueNumber, labels) {
    return {
      method: "PUT",
      url: `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/labels`,
      body: { labels: (labels || []).slice() }
    };
  }
  function buildMergePullRequest(owner, repo, pullNumber, { mergeMethod = "merge", commitTitle, commitMessage } = {}) {
    const body = { merge_method: mergeMethod };
    return commitTitle != null && (body.commit_title = String(commitTitle)), commitMessage != null && (body.commit_message = String(commitMessage)), {
      method: "PUT",
      url: `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}/merge`,
      body
    };
  }
  function buildUpdateBranch(owner, repo, pullNumber, { expectedHeadSha } = {}) {
    const body = {};
    return expectedHeadSha && (body.expected_head_sha = String(expectedHeadSha)), {
      method: "PUT",
      url: `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}/update-branch`,
      body
    };
  }
  function buildSetSubscription(owner, repo, issueNumber, { subscribed = !0, ignored = !1, nodeId = null } = {}) {
    const state = ignored ? "IGNORED" : subscribed ? "SUBSCRIBED" : "UNSUBSCRIBED";
    return {
      method: "POST",
      url: "https://api.github.com/graphql",
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
          id: String(nodeId || ""),
          state
        }
      }
    };
  }
  function buildDeleteSubscription(owner, repo, issueNumber, nodeId = null) {
    return buildSetSubscription(owner, repo, issueNumber, {
      subscribed: !1,
      ignored: !1,
      nodeId
    });
  }
  function buildSetMilestone(owner, repo, issueNumber, milestoneNumber) {
    return {
      method: "PATCH",
      url: `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`,
      body: { milestone: milestoneNumber == null ? null : Number(milestoneNumber) }
    };
  }
  function buildDraftStageGraphql(stage, pullRequestId) {
    const id = String(pullRequestId || "");
    return stage === "ready" ? {
      query: "mutation($id:ID!){markPullRequestReadyForReview(input:{pullRequestId:$id}){pullRequest{id isDraft}}}",
      variables: { id }
    } : {
      query: "mutation($id:ID!){convertPullRequestToDraft(input:{pullRequestId:$id}){pullRequest{id isDraft}}}",
      variables: { id }
    };
  }
  function draftFromStageGraphqlData(data) {
    if (!data || typeof data != "object") return null;
    const pr = data.markPullRequestReadyForReview?.pullRequest || data.convertPullRequestToDraft?.pullRequest || data.pullRequest || null;
    return !pr || typeof pr != "object" ? null : typeof pr.isDraft == "boolean" ? pr.isDraft : typeof pr.draft == "boolean" ? pr.draft : null;
  }
  function parseLinkedIssueNumbers(body) {
    const text = body == null ? "" : String(body), nums = /* @__PURE__ */ new Set(), re = /(?:(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+)?#(\d+)/gi;
    let m;
    for (; (m = re.exec(text)) !== null; ) {
      const n = Number(m[1]);
      Number.isFinite(n) && n > 0 && nums.add(n);
    }
    return [...nums].sort((a, b) => Number(a) - Number(b));
  }
  function buildRerequestReviewerLogins(detail) {
    const d = detail || {}, pending = new Set(
      (d.requestedReviewers || []).map((x) => String(x || "").trim()).filter(Boolean).map((x) => x.toLowerCase())
    ), author = String(d.author || "").trim().toLowerCase(), out = [], seen = /* @__PURE__ */ new Set();
    function isBotLogin(login, review) {
      if (review?.isBot === !0 || String(review?.type || "").toLowerCase() === "bot")
        return !0;
      const key = String(login || "").toLowerCase();
      if (d.actorIsBot && typeof d.actorIsBot == "object") {
        if (d.actorIsBot instanceof Map) {
          if (d.actorIsBot.get(key)) return !0;
        } else if (d.actorIsBot[key]) return !0;
      }
      return /\[bot\]$/i.test(String(login || ""));
    }
    function consider(login, review = null) {
      const raw = String(login || "").trim();
      if (!raw) return;
      const key = raw.toLowerCase();
      author && key === author || pending.has(key) || isBotLogin(raw, review) || seen.has(key) || (seen.add(key), out.push(raw));
    }
    for (const r of d.reviews || [])
      consider(r?.author, r);
    for (const login of d.extraLogins || [])
      consider(login, null);
    return out;
  }
  function parseSuggestionFences(body) {
    const text = body == null ? "" : String(body), out = [], re = /```suggestion[^\n]*\r?\n([\s\S]*?)```/gi;
    let m;
    for (; (m = re.exec(text)) !== null; )
      out.push({ content: m[1].replace(/\n$/, ""), raw: m[0] });
    return out;
  }
  function applySuggestionToFileContent(fileContent, { startLine, endLine, suggestion }) {
    const lines = String(fileContent ?? "").split(`
`), endsWithNl = String(fileContent ?? "").endsWith(`
`);
    endsWithNl && lines[lines.length - 1] === "" && lines.pop();
    const start = Math.max(1, Number(startLine) || 1), end = Math.max(start, Number(endLine) || start), sugLines = String(suggestion ?? "").split(`
`);
    sugLines.length && sugLines[sugLines.length - 1] === "" && suggestion.endsWith(`
`) && sugLines.pop();
    const before = lines.slice(0, start - 1), after = lines.slice(end);
    let out = [...before, ...sugLines, ...after].join(`
`);
    return (endsWithNl || out.length) && (out = out.endsWith(`
`) ? out : `${out}
`), out;
  }
  function buildApplySuggestionCommitRequest(owner, repo, {
    path,
    branch,
    contentBase64,
    sha,
    message
  }) {
    return {
      method: "PUT",
      url: `https://api.github.com/repos/${owner}/${repo}/contents/${path.split("/").map(encodeURIComponent).join("/")}`,
      body: {
        message: message || `Apply suggestion to ${path}`,
        content: contentBase64,
        branch,
        sha
      }
    };
  }
  function mapLeaveReviewAction(action) {
    const a = String(action || "").toLowerCase();
    return a === "approve" ? { kind: "review", event: "APPROVE" } : a === "request_changes" || a === "request-changes" ? { kind: "review", event: "REQUEST_CHANGES" } : { kind: "issue-comment", event: "COMMENT" };
  }
  function normalizeGithubLogin(login) {
    return String(login || "").trim().replace(/^@/, "").toLowerCase();
  }
  function isViewerPrAuthor(detail) {
    const author = normalizeGithubLogin(detail?.author), viewer = normalizeGithubLogin(detail?.viewerLogin);
    return !!(author && viewer && author === viewer);
  }
  function canSubmitReviewVerdict(detail) {
    return !isViewerPrAuthor(detail);
  }
  function isReviewVerdictKind(kind) {
    const k2 = String(kind || "").toLowerCase();
    return k2 === "approve" || k2 === "request_changes" || k2 === "request-changes";
  }
  function mapRestReviewComment(raw, fallback = {}) {
    if (!raw && !String(fallback.body || "").trim()) return null;
    const r = raw || {}, subjectRaw = String(
      r.subject_type || r.subjectType || fallback.subjectType || fallback.subject_type || ""
    ).toLowerCase(), isFile = subjectRaw === "file" || fallback.subjectType === "file" && subjectRaw !== "line", lineRaw = isFile ? null : r.line ?? r.original_line ?? (r.position != null && Number.isFinite(Number(r.position)) ? Number(r.position) : null) ?? fallback.line ?? null;
    return {
      id: r.id ?? fallback.id ?? null,
      author: r.user?.login || fallback.author || "",
      avatarUrl: r.user?.avatar_url || fallback.avatarUrl || "",
      body: r.body || fallback.body || "",
      path: r.path || fallback.path || "",
      line: lineRaw != null ? Number(lineRaw) : null,
      originalLine: isFile ? null : r.original_line ?? null,
      startLine: isFile ? null : r.start_line ?? fallback.startLine ?? null,
      side: r.side || fallback.side || "RIGHT",
      startSide: r.start_side || null,
      diffHunk: r.diffHunk || r.diff_hunk || fallback.diffHunk || "",
      createdAt: r.created_at || fallback.createdAt || null,
      inReplyToId: r.in_reply_to_id ?? fallback.inReplyToId ?? null,
      nodeId: r.node_id || null,
      threadNodeId: r.threadNodeId || fallback.threadNodeId || null,
      reviewId: r.pull_request_review_id != null ? Number(r.pull_request_review_id) : fallback.reviewId != null ? Number(fallback.reviewId) : null,
      resolved: !!(r.resolved ?? fallback.resolved),
      pending: !!(r.pending ?? fallback.pending),
      pendingReviewId: r.pendingReviewId ?? fallback.pendingReviewId ?? null,
      outdated: !!(r.outdated ?? fallback.outdated),
      subjectType: isFile ? "file" : "line"
    };
  }
  function mapRestIssueComment(raw, fallback = {}) {
    if (!raw && !fallback.body) return null;
    const r = raw || {};
    return {
      id: r.id ?? fallback.id ?? null,
      author: r.user?.login || fallback.author || "",
      avatarUrl: r.user?.avatar_url || fallback.avatarUrl || "",
      body: r.body || fallback.body || "",
      createdAt: r.created_at || fallback.createdAt || null,
      htmlUrl: r.html_url || null,
      nodeId: r.node_id || fallback.nodeId || null,
      reactions: Array.isArray(fallback.reactions) ? fallback.reactions : []
    };
  }
  function appendOptimisticReviewComment(detail, comment) {
    const base = detail || {};
    if (!comment || comment.id == null) return base;
    const list = Array.isArray(base.reviewComments) ? base.reviewComments.slice() : [];
    return list.some((c) => String(c.id) === String(comment.id)) ? { ...base, reviewComments: list } : (list.push(comment), { ...base, reviewComments: list });
  }
  function appendIssueCommentToDetail(detail, comment) {
    const base = detail || {};
    if (!comment || comment.id == null) return base;
    const list = Array.isArray(base.comments) ? base.comments.slice() : [];
    return list.some((c) => String(c.id) === String(comment.id)) ? { ...base, comments: list } : (list.push(comment), { ...base, comments: list });
  }
  function stampThreadResolved(detail, threadNodeId, resolved) {
    if (!detail) return detail;
    const tid = threadNodeId != null ? String(threadNodeId).trim() : "";
    if (!tid) return detail;
    const nextResolved = !!resolved, stampC = (c) => c && String(c.threadNodeId || "") === tid ? { ...c, resolved: nextResolved } : c, prevStamps = detail._resolveStamps && typeof detail._resolveStamps == "object" ? detail._resolveStamps : {};
    return {
      ...detail,
      reviewComments: Array.isArray(detail.reviewComments) ? detail.reviewComments.map(stampC) : detail.reviewComments,
      reviewThreads: Array.isArray(detail.reviewThreads) ? detail.reviewThreads.map(
        (t) => t && String(t.threadNodeId || "") === tid ? { ...t, resolved: nextResolved } : t
      ) : detail.reviewThreads,
      _resolveStamps: { ...prevStamps, [tid]: nextResolved }
    };
  }
  function applyResolveStamps(detail, stamps) {
    if (!detail) return detail;
    const map = stamps && typeof stamps == "object" && !Array.isArray(stamps) ? stamps : detail._resolveStamps && typeof detail._resolveStamps == "object" ? detail._resolveStamps : null;
    if (!map || !Object.keys(map).length)
      return detail._resolveStamps ? { ...detail, _resolveStamps: void 0 } : detail;
    const remaining = { ...map }, inComments = Array.isArray(detail.reviewComments) ? detail.reviewComments : [], inThreads = Array.isArray(detail.reviewThreads) ? detail.reviewThreads : [];
    for (const tid of Object.keys(remaining)) {
      const want = !!remaining[tid], relatedC = inComments.filter(
        (c) => c && String(c.threadNodeId || "") === tid
      ), relatedT = inThreads.filter(
        (t) => t && String(t.threadNodeId || "") === tid
      );
      if (relatedC.length === 0 && relatedT.length === 0) continue;
      (relatedC.length === 0 || relatedC.every((c) => !!c.resolved === want)) && (relatedT.length === 0 || relatedT.every((t) => !!t.resolved === want)) && delete remaining[tid];
    }
    const stampC = (c) => {
      if (!c) return c;
      const tid = String(c.threadNodeId || "");
      if (!tid || !Object.prototype.hasOwnProperty.call(map, tid)) return c;
      const want = !!map[tid];
      return !!c.resolved === want ? c : { ...c, resolved: want };
    };
    return {
      ...detail,
      reviewComments: inComments.map(stampC),
      reviewThreads: inThreads.map(stampC),
      _resolveStamps: Object.keys(remaining).length > 0 ? remaining : void 0
    };
  }
  var api = module.exports && module.exports.__esModule ? module.exports.default && typeof module.exports.default == "object" ? Object.assign({}, module.exports, module.exports.default) : module.exports.default || module.exports : module.exports;
  if (api && typeof api == "object" && api.__esModule) {
    var flat = {};
    for (var k in api)
      k !== "default" && k !== "__esModule" && Object.prototype.hasOwnProperty.call(api, k) && (flat[k] = api[k]);
    if (api.default && typeof api.default == "object")
      for (var dk in api.default)
        Object.prototype.hasOwnProperty.call(api.default, dk) && flat[dk] === void 0 && (flat[dk] = api.default[dk]);
    Object.keys(flat).length && (api = flat);
  }
  global.PRModalPrEditApi = api;
})(typeof globalThis < "u" ? globalThis : typeof window < "u" ? window : this);


/* ---- modal/pure/checks.js ---- */

(function() {
  function parseTime(value) {
    if (value == null || value === "") return 0;
    if (typeof value == "number" && Number.isFinite(value)) return value;
    const n = Date.parse(String(value));
    return Number.isFinite(n) ? n : 0;
  }
  function statusKey(s) {
    const ctx = String(s?.context || "").trim().toLowerCase();
    if (ctx) return ctx;
    const desc = String(s?.description || "").trim().toLowerCase();
    return desc ? `desc:${desc}` : "";
  }
  function statusTime(s) {
    return parseTime(s?.updatedAt ?? s?.updated_at) || parseTime(s?.createdAt ?? s?.created_at) || 0;
  }
  function distinctStatuses(statuses) {
    const list = Array.isArray(statuses) ? statuses : [], byKey = /* @__PURE__ */ new Map();
    let anon = 0;
    for (const s of list) {
      if (!s || typeof s != "object") continue;
      let key = statusKey(s);
      key || (key = `__anon_status_${anon++}`);
      const prev = byKey.get(key);
      (!prev || statusTime(s) >= statusTime(prev)) && byKey.set(key, s);
    }
    return [...byKey.values()];
  }
  function checkRunKey(r) {
    const name = String(r?.name || "").trim().toLowerCase(), app = String(
      r?.appSlug || r?.app_slug || r?.app?.slug || r?.app?.name || ""
    ).trim().toLowerCase();
    return name ? app ? `${app}::${name}` : name : "";
  }
  function checkRunTime(r) {
    return parseTime(r?.completedAt ?? r?.completed_at) || parseTime(r?.startedAt ?? r?.started_at) || // Prefer higher numeric id as recency proxy when timestamps missing
    (Number.isFinite(Number(r?.id)) ? Number(r.id) : 0);
  }
  function distinctCheckRuns(runs) {
    const list = Array.isArray(runs) ? runs : [], byKey = /* @__PURE__ */ new Map();
    let anon = 0;
    for (const r of list) {
      if (!r || typeof r != "object") continue;
      let key = checkRunKey(r);
      key || (key = `__anon_run_${anon++}`);
      const prev = byKey.get(key);
      if (!prev) {
        byKey.set(key, r);
        continue;
      }
      const tNew = checkRunTime(r), tOld = checkRunTime(prev);
      (tNew > tOld || tNew === tOld && Number(r.id || 0) > Number(prev.id || 0)) && byKey.set(key, r);
    }
    return [...byKey.values()];
  }
  function deriveChecksState(statuses, checkRuns, fallback = "unknown") {
    const st = Array.isArray(statuses) ? statuses : [], runs = Array.isArray(checkRuns) ? checkRuns : [];
    if (!st.length && !runs.length) return "unknown";
    const statusStates = st.map((s) => String(s?.state || "").toLowerCase()), conclusions = runs.map((r) => String(r?.conclusion || "").toLowerCase()), runStatuses = runs.map((r) => String(r?.status || "").toLowerCase());
    return statusStates.some((s) => s === "failure" || s === "error") || conclusions.some(
      (c) => c === "failure" || c === "timed_out" || c === "startup_failure" || c === "cancelled"
    ) ? "failure" : statusStates.some((s) => s === "pending") || runStatuses.some(
      (s) => s === "queued" || s === "in_progress" || s === "waiting"
    ) || conclusions.some((c) => c === "" || c === "null" || c === "action_required") ? "pending" : statusStates.some((s) => s === "success") || conclusions.some(
      (c) => c === "success" || c === "neutral" || c === "skipped"
    ) ? "success" : fallback || "unknown";
  }
  function normalizeChecks(checks) {
    const raw = checks && typeof checks == "object" ? checks : {}, statuses = distinctStatuses(raw.statuses), checkRuns = distinctCheckRuns(raw.checkRuns || raw.check_runs), fallback = statuses.length || checkRuns.length ? String(raw.state || "unknown") : "unknown";
    return {
      state: deriveChecksState(statuses, checkRuns, fallback),
      totalCount: statuses.length + checkRuns.length,
      statuses,
      checkRuns
    };
  }
  function statusIsInProgress(item) {
    const status = String(item?.status || "").toLowerCase();
    return status === "in_progress" || status === "queued" || status === "waiting";
  }
  function classifyCheckOutcome(item) {
    if (!item || typeof item != "object") return "pending";
    if (item.kind === "status" || item.state != null && item.status == null && item.conclusion == null) {
      const st = String(item.state || "").toLowerCase();
      return st === "failure" || st === "error" ? "failure" : st === "success" ? "success" : "pending";
    }
    const conclusion = String(item.conclusion || "").toLowerCase();
    return conclusion === "failure" || conclusion === "timed_out" || conclusion === "startup_failure" || conclusion === "cancelled" ? "failure" : conclusion === "skipped" ? "skipped" : conclusion === "success" || conclusion === "neutral" ? "success" : statusIsInProgress(item) ? "in_progress" : "pending";
  }
  function formatDurationMs(ms) {
    const n = Number(ms);
    if (!Number.isFinite(n) || n < 0) return "";
    if (n < 1e3) return "<1s";
    const sec = Math.round(n / 1e3);
    if (sec < 60) return `${sec}s`;
    const min = Math.floor(sec / 60), remSec = sec % 60;
    if (min < 60) return remSec ? `${min}m ${remSec}s` : `${min}m`;
    const hr = Math.floor(min / 60), remMin = min % 60;
    return remMin ? `${hr}h ${remMin}m` : `${hr}h`;
  }
  function formatRelativeAgo(iso, nowMs) {
    const t = parseTime(iso);
    if (!t) return "";
    const now = Number.isFinite(nowMs) ? nowMs : Date.now();
    let sec = Math.max(0, Math.round((now - t) / 1e3));
    if (sec < 60) return "just now";
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min} minute${min === 1 ? "" : "s"} ago`;
    const hr = Math.floor(min / 60);
    if (hr < 48) return `${hr} hour${hr === 1 ? "" : "s"} ago`;
    const day = Math.floor(hr / 24);
    return `${day} day${day === 1 ? "" : "s"} ago`;
  }
  function formatCheckSummary(item, nowMs) {
    if (!item) return "";
    const desc = String(item.description || "").trim(), start = parseTime(item.startedAt), end = parseTime(item.completedAt) || parseTime(item.updatedAt), duration = start && end && end >= start ? formatDurationMs(end - start) : start && !end ? formatDurationMs((Number.isFinite(nowMs) ? nowMs : Date.now()) - start) : "", outcome = item.outcome || classifyCheckOutcome(item);
    if (outcome === "failure")
      return duration ? `Failing after ${duration}` : desc || "Failing";
    if (outcome === "success")
      return duration ? `Successful in ${duration}` : desc || "Successful";
    if (outcome === "skipped") {
      const when = formatRelativeAgo(item.completedAt || item.updatedAt, nowMs);
      return when ? `Skipped ${when}` : desc || "Skipped";
    }
    return outcome === "in_progress" || statusIsInProgress(item) ? duration ? `In progress \u2014 ${duration}` : desc || "In progress" : desc || "Expected \u2014 Waiting for status to be reported";
  }
  function buildMergeBoxCheckGroups(checks, opts) {
    const nowMs = opts && Number.isFinite(opts.nowMs) ? opts.nowMs : Date.now(), n = normalizeChecks(checks), rows = [];
    for (const s of n.statuses || []) {
      const outcome = classifyCheckOutcome({ kind: "status", state: s.state }), row = {
        id: `status:${s.context || rows.length}`,
        kind: "status",
        name: s.context || s.description || "status",
        outcome,
        description: s.description || "",
        url: s.targetUrl || s.target_url || "",
        startedAt: s.createdAt || s.created_at || "",
        completedAt: s.updatedAt || s.updated_at || "",
        updatedAt: s.updatedAt || s.updated_at || "",
        required: !!s.required
      };
      row.summary = formatCheckSummary(row, nowMs), rows.push(row);
    }
    for (const r of n.checkRuns || []) {
      const outcome = classifyCheckOutcome(r), app = String(r.appName || r.app?.name || "").trim(), name = String(r.name || "check").trim() || "check", displayName = app && !name.toLowerCase().startsWith(app.toLowerCase()) ? `${app} / ${name}` : name, row = {
        id: `run:${r.id || name}`,
        kind: "run",
        name: displayName,
        outcome,
        status: r.status || "",
        conclusion: r.conclusion || "",
        description: "",
        url: r.htmlUrl || r.html_url || r.detailsUrl || r.details_url || "",
        startedAt: r.startedAt || r.started_at || "",
        completedAt: r.completedAt || r.completed_at || "",
        updatedAt: r.completedAt || r.completed_at || r.startedAt || "",
        required: !!r.required
      };
      row.summary = formatCheckSummary(row, nowMs), rows.push(row);
    }
    const buckets = {
      failure: [],
      in_progress: [],
      pending: [],
      skipped: [],
      success: []
    };
    for (const row of rows)
      (buckets[row.outcome] || buckets.pending).push(row);
    const groups = [], pushGroup = (key, outcome, singular, plural, items) => {
      if (!items.length) return;
      const label = items.length === 1 ? `1 ${singular}` : `${items.length} ${plural}`;
      groups.push({ key, label, outcome, items });
    };
    return pushGroup("failure", "failure", "failing check", "failing checks", buckets.failure), pushGroup(
      "in_progress",
      "in_progress",
      "in progress check",
      "in progress checks",
      buckets.in_progress
    ), pushGroup("pending", "pending", "expected check", "expected checks", buckets.pending), pushGroup("skipped", "skipped", "skipped check", "skipped checks", buckets.skipped), pushGroup(
      "success",
      "success",
      "successful check",
      "successful checks",
      buckets.success
    ), {
      state: n.state,
      totalCount: rows.length,
      groups
    };
  }
  function mergeBoxChecksHeadline(state, totalCount) {
    const st = String(state || "").toLowerCase();
    return totalCount ? st === "failure" || st === "error" ? "Some checks were not successful" : st === "pending" ? "Some checks haven\u2019t completed yet" : st === "success" ? "All checks have passed" : "Checks" : null;
  }
  function summarizeCheckCounts(checks) {
    const n = normalizeChecks(checks);
    let success = 0, failure = 0, pending = 0, inProgress = 0, skipped = 0;
    for (const s of n.statuses || []) {
      const o = classifyCheckOutcome({ kind: "status", state: s?.state });
      o === "failure" ? failure += 1 : o === "success" ? success += 1 : o === "skipped" ? skipped += 1 : o === "in_progress" ? inProgress += 1 : pending += 1;
    }
    for (const r of n.checkRuns || []) {
      const o = classifyCheckOutcome(r);
      o === "failure" ? failure += 1 : o === "success" ? success += 1 : o === "skipped" ? skipped += 1 : o === "in_progress" ? inProgress += 1 : pending += 1;
    }
    return {
      total: success + failure + pending + inProgress + skipped,
      success,
      failure,
      pending,
      inProgress,
      skipped,
      state: n.state || "unknown"
    };
  }
  function formatChecksCountLabel(summary) {
    const s = summary && typeof summary == "object" ? summary : {}, total = Number(s.total) || 0, success = Number(s.success) || 0, failure = Number(s.failure) || 0, pending = Number(s.pending) || 0, inProgress = Number(s.inProgress) || 0, skipped = Number(s.skipped) || 0;
    if (!total)
      return "No checks";
    const parts = [
      `${total} check${total === 1 ? "" : "s"}`,
      `${success} succeeded`,
      `${failure} failed`
    ];
    return inProgress > 0 && parts.push(`${inProgress} in progress`), pending > 0 && parts.push(`${pending} expected`), skipped > 0 && parts.push(`${skipped} skipped`), parts.join(" \xB7 ");
  }
  function listCheckNamesByOutcome(checks) {
    const n = normalizeChecks(checks), groups = {
      failure: [],
      pending: [],
      in_progress: [],
      success: [],
      skipped: []
    };
    for (const s of n.statuses || []) {
      const o = classifyCheckOutcome({ kind: "status", state: s?.state }), name = String(s?.context || s?.description || "status").trim() || "status";
      (groups[o] || groups.pending).push(name);
    }
    for (const r of n.checkRuns || []) {
      const o = classifyCheckOutcome(r), app = String(r?.appName || r?.app?.name || "").trim(), job = String(r?.name || "check").trim() || "check", name = app && !job.toLowerCase().startsWith(app.toLowerCase()) ? `${app} / ${job}` : job;
      (groups[o] || groups.pending).push(name);
    }
    return {
      failure: groups.failure,
      pending: groups.pending,
      in_progress: groups.in_progress,
      success: groups.success,
      skipped: groups.skipped,
      state: n.state || "unknown"
    };
  }
  function formatCheckGroupTip(outcome, names) {
    const list = Array.isArray(names) ? names.filter(Boolean) : [], n = list.length, head = {
      failure: n === 1 ? "1 failed" : `${n} failed`,
      in_progress: n === 1 ? "1 in progress" : `${n} in progress`,
      pending: n === 1 ? "1 expected" : `${n} expected`,
      success: n === 1 ? "1 succeeded" : `${n} succeeded`,
      skipped: n === 1 ? "1 skipped" : `${n} skipped`
    }[outcome] || `${n} checks`;
    if (!n) return head;
    const shown = list.slice(0, 12), more = n - shown.length, body = shown.map((name) => `\xB7 ${name}`).join(`
`);
    return more > 0 ? `${head}
${body}
\xB7 +${more} more` : `${head}
${body}`;
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
    statusIsInProgress,
    formatDurationMs,
    formatRelativeAgo,
    formatCheckSummary,
    buildMergeBoxCheckGroups,
    mergeBoxChecksHeadline,
    summarizeCheckCounts,
    formatChecksCountLabel,
    listCheckNamesByOutcome,
    formatCheckGroupTip
  };
  typeof module < "u" && module.exports && (module.exports = api), typeof globalThis < "u" && (globalThis.PRModalChecks = api);
})();


/* ---- modal/pure/rate-limit.js ---- */

(function(global) {
  var module = { exports: {} }, exports = module.exports, __defProp = Object.defineProperty, __getOwnPropDesc = Object.getOwnPropertyDescriptor, __getOwnPropNames = Object.getOwnPropertyNames, __hasOwnProp = Object.prototype.hasOwnProperty, __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: !0 });
  }, __copyProps = (to, from, except, desc) => {
    if (from && typeof from == "object" || typeof from == "function")
      for (let key of __getOwnPropNames(from))
        !__hasOwnProp.call(to, key) && key !== except && __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    return to;
  }, __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: !0 }), mod), stdin_exports = {};
  __export(stdin_exports, {
    RATE_LIMIT_RESOURCES: () => RATE_LIMIT_RESOURCES,
    classifyGithubUrl: () => classifyGithubUrl,
    clearExpiredRateDisables: () => clearExpiredRateDisables,
    disableUntilMsFrom429: () => disableUntilMsFrom429,
    emptyRateLimitState: () => emptyRateLimitState,
    formatRateLimitReset: () => formatRateLimitReset,
    hasAnyRateLimitSnapshot: () => hasAnyRateLimitSnapshot,
    headersToLowerMap: () => headersToLowerMap,
    normalizeRateLimitState: () => normalizeRateLimitState,
    normalizeResource: () => normalizeResource,
    parseRateLimitHeaders: () => parseRateLimitHeaders,
    rateLimitBarPercent: () => rateLimitBarPercent,
    shouldAllowGithubRequest: () => shouldAllowGithubRequest,
    snapshotFromGraphqlRateLimit: () => snapshotFromGraphqlRateLimit,
    snapshotFromResourceBlock: () => snapshotFromResourceBlock,
    withRateLimit429: () => withRateLimit429,
    withRateLimitEndpointPayload: () => withRateLimitEndpointPayload,
    withRateLimitSnapshot: () => withRateLimitSnapshot
  }), module.exports = __toCommonJS(stdin_exports);
  const RATE_LIMIT_RESOURCES = [
    "core",
    "graphql",
    "search"
  ];
  function emptyRateLimitState() {
    return {
      disabledUntil: { core: 0, graphql: 0, search: 0 },
      snapshots: { core: null, graphql: null, search: null }
    };
  }
  function normalizeRateLimitState(raw) {
    const base = emptyRateLimitState();
    if (!raw || typeof raw != "object") return base;
    const src = raw, du = src.disabledUntil && typeof src.disabledUntil == "object" ? src.disabledUntil : {}, snaps = src.snapshots && typeof src.snapshots == "object" ? src.snapshots : {};
    return {
      disabledUntil: {
        core: toNonNegMs(du.core),
        graphql: toNonNegMs(du.graphql),
        search: toNonNegMs(du.search)
      },
      snapshots: {
        core: normalizeSnapshot(snaps.core, "core"),
        graphql: normalizeSnapshot(snaps.graphql, "graphql"),
        search: normalizeSnapshot(snaps.search, "search")
      }
    };
  }
  function toNonNegMs(v) {
    const n = Number(v);
    return !Number.isFinite(n) || n <= 0 ? 0 : Math.floor(n);
  }
  function toNullableInt(v) {
    if (v == null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? Math.floor(n) : null;
  }
  function normalizeSnapshot(raw, fallbackResource) {
    if (!raw || typeof raw != "object") return null;
    const s = raw;
    return {
      resource: normalizeResource(s.resource) || fallbackResource,
      limit: toNullableInt(s.limit),
      remaining: toNullableInt(s.remaining),
      used: toNullableInt(s.used),
      reset: toNullableInt(s.reset),
      updatedAt: toNonNegMs(s.updatedAt) || Date.now()
    };
  }
  function normalizeResource(raw) {
    const v = String(raw || "").trim().toLowerCase();
    return v === "core" || v === "rest" ? "core" : v === "graphql" || v === "graph_ql" ? "graphql" : v === "search" ? "search" : null;
  }
  function classifyGithubUrl(url) {
    const u = String(url || "");
    try {
      const p = (u.includes("://") ? new URL(u).pathname : u.split("?")[0] || "").toLowerCase();
      if (p.includes("/graphql") || p.endsWith("graphql")) return "graphql";
      if (p.includes("/search/") || p.endsWith("/search") || p.includes("/search?"))
        return "search";
    } catch {
      if (/graphql/i.test(u)) return "graphql";
      if (/\/search(\/|\?|$)/i.test(u)) return "search";
    }
    return "core";
  }
  function headersToLowerMap(headers) {
    const out = {};
    if (!headers) return out;
    if (typeof headers.forEach == "function")
      try {
        return headers.forEach((value, key) => {
          key != null && value != null && value !== "" && (out[String(key).toLowerCase()] = String(value));
        }), out;
      } catch {
      }
    if (typeof headers.entries == "function")
      try {
        for (const [key, value] of headers.entries())
          key != null && value != null && value !== "" && (out[String(key).toLowerCase()] = String(value));
        return out;
      } catch {
      }
    if (typeof headers.get == "function") {
      for (const name of [
        "x-ratelimit-limit",
        "x-ratelimit-remaining",
        "x-ratelimit-used",
        "x-ratelimit-reset",
        "x-ratelimit-resource",
        "retry-after"
      ])
        try {
          const v = headers.get(name) ?? headers.get(name.toUpperCase());
          v != null && v !== "" && (out[name] = String(v));
        } catch {
        }
      return out;
    }
    const o = headers;
    for (const k2 of Object.keys(o)) {
      const v = o[k2];
      v != null && v !== "" && (out[k2.toLowerCase()] = String(v));
    }
    return out;
  }
  function headerGet(headers, name) {
    if (!headers) return null;
    const lower = name.toLowerCase(), map = headersToLowerMap(headers);
    if (Object.keys(map).length) {
      const v = map[lower];
      return v != null && v !== "" ? v : null;
    }
    if (typeof headers.get == "function")
      try {
        const v = headers.get(name) ?? headers.get(lower) ?? headers.get(name.toUpperCase());
        return v != null && v !== "" ? String(v) : null;
      } catch {
        return null;
      }
    return null;
  }
  function parseRateLimitHeaders(headers, opts = {}) {
    if (!headers) return null;
    const limit = toNullableInt(headerGet(headers, "x-ratelimit-limit")), remaining = toNullableInt(headerGet(headers, "x-ratelimit-remaining")), used = toNullableInt(headerGet(headers, "x-ratelimit-used")), reset = toNullableInt(headerGet(headers, "x-ratelimit-reset"));
    if (limit == null && remaining == null && reset == null && used == null)
      return null;
    const resource = normalizeResource(
      headerGet(headers, "x-ratelimit-resource")
    ) || opts.fallbackResource || "core", nowMs = Number.isFinite(opts.nowMs) ? Number(opts.nowMs) : Date.now();
    let usedVal = used;
    return usedVal == null && limit != null && remaining != null && (usedVal = Math.max(0, limit - remaining)), {
      resource,
      limit,
      remaining,
      used: usedVal,
      reset,
      updatedAt: nowMs
    };
  }
  function disableUntilMsFrom429(headers, nowMs = Date.now()) {
    const resetSec = toNullableInt(headerGet(headers, "x-ratelimit-reset"));
    if (resetSec != null && resetSec > 0)
      return Math.max(nowMs, resetSec * 1e3);
    const retry = headerGet(headers, "retry-after");
    if (retry) {
      const asNum = Number(retry);
      if (Number.isFinite(asNum) && asNum >= 0)
        return nowMs + Math.floor(asNum) * 1e3;
      const asDate = Date.parse(retry);
      if (Number.isFinite(asDate)) return Math.max(nowMs, asDate);
    }
    return nowMs + 6e4;
  }
  function shouldAllowGithubRequest(opts) {
    const now = Number.isFinite(opts.nowMs) ? Number(opts.nowMs) : Date.now();
    if (opts.pluginEnabled === !1)
      return { allow: !1, reason: "plugin-disabled", disabledUntilMs: 0 };
    const state = normalizeRateLimitState(opts.state), resource = opts.resource || "core", until = Number(state.disabledUntil[resource]) || 0;
    if (until > now)
      return {
        allow: !1,
        reason: "rate-disabled",
        disabledUntilMs: until
      };
    const snap = state.snapshots[resource];
    return snap && snap.remaining === 0 && snap.reset != null && snap.reset * 1e3 > now ? {
      allow: !1,
      reason: "remaining-zero",
      disabledUntilMs: snap.reset * 1e3
    } : { allow: !0, reason: "ok", disabledUntilMs: 0 };
  }
  function withRateLimitSnapshot(prev, snapshot) {
    const state = normalizeRateLimitState(prev);
    if (!snapshot) return state;
    const resource = snapshot.resource;
    return {
      ...state,
      snapshots: {
        ...state.snapshots,
        [resource]: snapshot
      }
    };
  }
  function snapshotFromResourceBlock(resource, block, nowMs = Date.now()) {
    if (!block || typeof block != "object") return null;
    const b = block, limit = toNullableInt(b.limit), remaining = toNullableInt(b.remaining), used = toNullableInt(b.used), reset = toNullableInt(b.reset);
    if (limit == null && remaining == null && reset == null && used == null)
      return null;
    let usedVal = used;
    return usedVal == null && limit != null && remaining != null && (usedVal = Math.max(0, limit - remaining)), {
      resource,
      limit,
      remaining,
      used: usedVal,
      reset,
      updatedAt: nowMs
    };
  }
  function withRateLimitEndpointPayload(prev, json, nowMs = Date.now()) {
    let state = normalizeRateLimitState(prev);
    if (!json || typeof json != "object") return state;
    const root = json, resources = root.resources && typeof root.resources == "object" ? root.resources : root;
    for (const r of RATE_LIMIT_RESOURCES) {
      const block = resources?.[r] ?? (r === "core" ? root.rate : null), snap = snapshotFromResourceBlock(r, block, nowMs);
      snap && (state = withRateLimitSnapshot(state, snap));
    }
    return state;
  }
  function hasAnyRateLimitSnapshot(state) {
    const s = normalizeRateLimitState(state);
    return RATE_LIMIT_RESOURCES.some((r) => {
      const snap = s.snapshots[r];
      return snap != null && (snap.limit != null || snap.remaining != null || snap.reset != null);
    });
  }
  function withRateLimit429(prev, resource, headers, nowMs = Date.now()) {
    const snap = parseRateLimitHeaders(headers, {
      fallbackResource: resource,
      nowMs
    }) || null;
    let state = withRateLimitSnapshot(prev, snap);
    const until = disableUntilMsFrom429(headers, nowMs);
    return state = {
      ...state,
      disabledUntil: {
        ...state.disabledUntil,
        [resource]: Math.max(state.disabledUntil[resource] || 0, until)
      }
    }, state;
  }
  function clearExpiredRateDisables(prev, nowMs = Date.now(), opts = {}) {
    const state = normalizeRateLimitState(prev);
    if (opts.clearAll)
      return {
        ...state,
        disabledUntil: { core: 0, graphql: 0, search: 0 }
      };
    if (opts.forceResource)
      return {
        ...state,
        disabledUntil: {
          ...state.disabledUntil,
          [opts.forceResource]: 0
        }
      };
    const next = { ...state.disabledUntil };
    for (const r of RATE_LIMIT_RESOURCES)
      next[r] > 0 && next[r] <= nowMs && (next[r] = 0);
    return { ...state, disabledUntil: next };
  }
  function rateLimitBarPercent(snapshot) {
    if (!snapshot) return 0;
    const limit = Number(snapshot.limit);
    if (!Number.isFinite(limit) || limit <= 0) return 0;
    const remaining = Number(snapshot.remaining);
    if (!Number.isFinite(remaining)) {
      const used = Number(snapshot.used);
      return Number.isFinite(used) ? Math.max(0, Math.min(100, Math.round((limit - used) / limit * 100))) : 0;
    }
    return Math.max(0, Math.min(100, Math.round(remaining / limit * 100)));
  }
  function formatRateLimitReset(snapshot, nowMs = Date.now()) {
    if (!snapshot?.reset) return "\u2014";
    const ms = snapshot.reset * 1e3;
    if (ms <= nowMs) return "now";
    try {
      return new Date(ms).toLocaleTimeString();
    } catch {
      return String(snapshot.reset);
    }
  }
  function snapshotFromGraphqlRateLimit(rateLimit, nowMs = Date.now()) {
    if (!rateLimit || typeof rateLimit != "object") return null;
    const r = rateLimit, limit = toNullableInt(r.limit), remaining = toNullableInt(r.remaining), used = toNullableInt(r.used);
    let reset = null;
    if (r.resetAt) {
      const t = Date.parse(String(r.resetAt));
      Number.isFinite(t) && (reset = Math.floor(t / 1e3));
    } else r.reset != null && (reset = toNullableInt(r.reset));
    if (limit == null && remaining == null && reset == null) return null;
    let usedVal = used;
    return usedVal == null && limit != null && remaining != null && (usedVal = Math.max(0, limit - remaining)), {
      resource: "graphql",
      limit,
      remaining,
      used: usedVal,
      reset,
      updatedAt: nowMs
    };
  }
  var api = module.exports && module.exports.__esModule ? module.exports.default && typeof module.exports.default == "object" ? Object.assign({}, module.exports, module.exports.default) : module.exports.default || module.exports : module.exports;
  if (api && typeof api == "object" && api.__esModule) {
    var flat = {};
    for (var k in api)
      k !== "default" && k !== "__esModule" && Object.prototype.hasOwnProperty.call(api, k) && (flat[k] = api[k]);
    if (api.default && typeof api.default == "object")
      for (var dk in api.default)
        Object.prototype.hasOwnProperty.call(api.default, dk) && flat[dk] === void 0 && (flat[dk] = api.default[dk]);
    Object.keys(flat).length && (api = flat);
  }
  global.PRModalRateLimit = api;
})(typeof globalThis < "u" ? globalThis : typeof window < "u" ? window : this);


/* ---- modal/pure/graphql-cost-log.js ---- */

(function(global) {
  var module = { exports: {} }, exports = module.exports, __defProp = Object.defineProperty, __getOwnPropDesc = Object.getOwnPropertyDescriptor, __getOwnPropNames = Object.getOwnPropertyNames, __hasOwnProp = Object.prototype.hasOwnProperty, __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: !0 });
  }, __copyProps = (to, from, except, desc) => {
    if (from && typeof from == "object" || typeof from == "function")
      for (let key of __getOwnPropNames(from))
        !__hasOwnProp.call(to, key) && key !== except && __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    return to;
  }, __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: !0 }), mod), stdin_exports = {};
  __export(stdin_exports, {
    injectRateLimitCostField: () => injectRateLimitCostField,
    labelGraphqlOperation: () => labelGraphqlOperation,
    sanitizeGraphqlVariables: () => sanitizeGraphqlVariables,
    summarizeGraphqlCostEntries: () => summarizeGraphqlCostEntries
  }), module.exports = __toCommonJS(stdin_exports);
  function injectRateLimitCostField(query) {
    const q = String(query || "");
    if (!q.trim() || /rateLimit\s*\{/.test(q) || /\bmutation\b/i.test(q)) return q;
    const trimmed = q.replace(/\s+$/, ""), lastBrace = trimmed.lastIndexOf("}");
    return lastBrace < 0 ? q : trimmed.slice(0, lastBrace) + `
  rateLimit { cost remaining used limit resetAt }
` + trimmed.slice(lastBrace);
  }
  function labelGraphqlOperation(query, variables = null) {
    const q = String(query || "");
    if (/ReviewThreadsLastShell/.test(q)) return "reviewThreads.last.shell";
    if (/ReviewThreadsFirstShell/.test(q)) return "reviewThreads.first.shell";
    if (/ReviewThreadsByIdsFull/.test(q)) return "reviewThreads.byIds";
    if (/TimelineItemsPage/.test(q) || /timelineItems\s*\(/.test(q))
      return "timelineItems.page";
    if (/reviewThreads\s*\(/.test(q) && /last\s*:/.test(q))
      return /comments\s*\(\s*first\s*:\s*100/.test(q) ? "reviewThreads.last" : "reviewThreads.last.shell";
    if (/reviewThreads\s*\(/.test(q) && /first\s*:/.test(q))
      return /comments\s*\(\s*first\s*:\s*100/.test(q) ? "reviewThreads.first" : "reviewThreads.first.shell";
    if (/PullRequestReviewThread/.test(q) && /nodes\s*\(\s*ids/.test(q))
      return "reviewThreads.byIds";
    const named = q.match(/\b(query|mutation)\s+([A-Za-z_][A-Za-z0-9_]*)/);
    if (named?.[2]) return named[2];
    if (/viewerViewedState|ViewerViewedFiles/.test(q)) return "viewerViewedFiles";
    if (/projectItems|closingIssuesReferences|sidebar/i.test(q)) return "sidebarMeta";
    if (/viewerSubscription|mergeStateStatus|updateSubscription/.test(q))
      return /updateSubscription/.test(q) ? "subscription.update" : "subscription.read";
    if (/markFileAsViewed/.test(q)) return "markFileAsViewed";
    if (/unmarkFileAsViewed/.test(q)) return "unmarkFileAsViewed";
    if (/addPullRequestReviewThread/.test(q)) return "addReviewThread";
    if (/resolveReviewThread|unresolveReviewThread/.test(q)) return "resolveThread";
    if (/reactionGroups|Reactable/.test(q) && /nodes\s*\(\s*ids/.test(q))
      return "reactableReactions";
    if (/addReaction|removeReaction/.test(q)) return "reaction.mutate";
    if (/issueOrPullRequest/.test(q)) return "issueOrPrSummaries";
    const root = q.match(
      /\b(?:query|mutation)\b[^{]*\{\s*([A-Za-z_][A-Za-z0-9_]*)/
    );
    return root?.[1] && root[1] !== "rateLimit" ? root[1] : /\bmutation\b/.test(q) ? "mutation" : "query";
  }
  function sanitizeGraphqlVariables(variables) {
    if (!variables || typeof variables != "object") return {};
    const out = {};
    for (const k2 of [
      "owner",
      "name",
      "repo",
      "number",
      "n",
      "cursor",
      "ids",
      "first",
      "last",
      "since",
      "before",
      "after"
    ]) {
      if (variables[k2] === void 0) continue;
      if (k2 === "ids" && Array.isArray(variables[k2])) {
        out.idsCount = variables[k2].length, out.idsSample = variables[k2].slice(0, 3).map(String);
        continue;
      }
      const v = variables[k2];
      v == null || typeof v == "number" || typeof v == "boolean" ? out[k2] = v : out[k2] = String(v).slice(0, 48);
    }
    return out;
  }
  function summarizeGraphqlCostEntries(entries) {
    const list = Array.isArray(entries) ? entries : [], map = /* @__PURE__ */ new Map();
    let totalCost = 0, unknownCostCalls = 0;
    for (const e of list) {
      const op = String(e?.op || "unknown"), cost = e?.cost != null && Number.isFinite(Number(e.cost)) ? Number(e.cost) : null, ms = e?.ms != null && Number.isFinite(Number(e.ms)) ? Number(e.ms) : 0;
      map.has(op) || map.set(op, {
        op,
        calls: 0,
        cost: 0,
        maxCost: 0,
        msSum: 0,
        knownCostCalls: 0
      });
      const row = map.get(op);
      row.calls += 1, row.msSum += ms, cost != null ? (row.cost += cost, row.knownCostCalls += 1, row.maxCost = Math.max(row.maxCost, cost), totalCost += cost) : unknownCostCalls += 1;
    }
    const byOp = [...map.values()].map((r) => ({
      op: r.op,
      calls: r.calls,
      cost: r.cost,
      avgCost: r.knownCostCalls > 0 ? Math.round(r.cost / r.knownCostCalls * 100) / 100 : 0,
      maxCost: r.maxCost,
      avgMs: r.calls > 0 ? Math.round(r.msSum / r.calls) : 0
    })).sort((a, b) => b.cost - a.cost || b.calls - a.calls);
    return {
      totalCalls: list.length,
      totalCost,
      unknownCostCalls,
      byOp
    };
  }
  var api = module.exports && module.exports.__esModule ? module.exports.default && typeof module.exports.default == "object" ? Object.assign({}, module.exports, module.exports.default) : module.exports.default || module.exports : module.exports;
  if (api && typeof api == "object" && api.__esModule) {
    var flat = {};
    for (var k in api)
      k !== "default" && k !== "__esModule" && Object.prototype.hasOwnProperty.call(api, k) && (flat[k] = api[k]);
    if (api.default && typeof api.default == "object")
      for (var dk in api.default)
        Object.prototype.hasOwnProperty.call(api.default, dk) && flat[dk] === void 0 && (flat[dk] = api.default[dk]);
    Object.keys(flat).length && (api = flat);
  }
  global.PRModalGraphqlCostLog = api;
})(typeof globalThis < "u" ? globalThis : typeof window < "u" ? window : this);


/* ---- modal/pure/conversation-timeline.js ---- */

(function(global) {
  var module = { exports: {} }, exports = module.exports, __defProp = Object.defineProperty, __getOwnPropDesc = Object.getOwnPropertyDescriptor, __getOwnPropNames = Object.getOwnPropertyNames, __hasOwnProp = Object.prototype.hasOwnProperty, __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: !0 });
  }, __copyProps = (to, from, except, desc) => {
    if (from && typeof from == "object" || typeof from == "function")
      for (let key of __getOwnPropNames(from))
        !__hasOwnProp.call(to, key) && key !== except && __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    return to;
  }, __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: !0 }), mod), conversation_timeline_exports = {};
  __export(conversation_timeline_exports, {
    DEFAULT_TIMELINE_VISIBILITY: () => DEFAULT_TIMELINE_VISIBILITY,
    TIMELINE_CATEGORY_IDS: () => TIMELINE_CATEGORY_IDS,
    TIMELINE_PAGE_SIZE: () => TIMELINE_PAGE_SIZE,
    TIMELINE_TIP_IDS: () => TIMELINE_TIP_IDS,
    TIMELINE_TIP_LABELS: () => TIMELINE_TIP_LABELS,
    assigneeChangeTimelineEvents: () => assigneeChangeTimelineEvents,
    buildConversationTimeline: () => buildConversationTimeline,
    buildThreadEntry: () => buildThreadEntry,
    compareTimelineItemsNewestFirst: () => compareTimelineItemsNewestFirst,
    conversationLoadMoreState: () => conversationLoadMoreState,
    describeTimelineEvent: () => describeTimelineEvent,
    emptyTimelinePageMeta: () => emptyTimelinePageMeta,
    filterTimelineItemsByVisibility: () => filterTimelineItemsByVisibility,
    isReviewThreadsLoadIncomplete: () => isReviewThreadsLoadIncomplete,
    isTimelineLoadIncomplete: () => isTimelineLoadIncomplete,
    isTimelineVisibilityAllOn: () => isTimelineVisibilityAllOn,
    itemTimestampMs: () => itemTimestampMs,
    labelChangeTimelineEvents: () => labelChangeTimelineEvents,
    labelNameKey: () => labelNameKey,
    labelObj: () => labelObj,
    loginKey: () => loginKey,
    makeLocalTimelineEvent: () => makeLocalTimelineEvent,
    maxTimelineWatermark: () => maxTimelineWatermark,
    mergeTimelineEventsById: () => mergeTimelineEventsById,
    mergeTimelineItemsById: () => mergeTimelineItemsById,
    milestoneChangeTimelineEvents: () => milestoneChangeTimelineEvents,
    minTimelineCoverageEndAt: () => minTimelineCoverageEndAt,
    needsLazyTimelineEventsFetch: () => needsLazyTimelineEventsFetch,
    normalizeTimelineVisibility: () => normalizeTimelineVisibility,
    pageTimelineItems: () => pageTimelineItems,
    partitionConversationLoadMore: () => partitionConversationLoadMore,
    partitionTimelineWithThreadGap: () => partitionTimelineWithThreadGap,
    planTimelineVisibilityChange: () => planTimelineVisibilityChange,
    reviewerChangeTimelineEvents: () => reviewerChangeTimelineEvents,
    selectDirtyThreadIdsByCommentCount: () => selectDirtyThreadIdsByCommentCount,
    serverEventCoversLocal: () => serverEventCoversLocal,
    shouldAcceptTimelineVisibilityFromHost: () => shouldAcceptTimelineVisibilityFromHost,
    shouldFetchSystemTimelineEvents: () => shouldFetchSystemTimelineEvents,
    singleCursorReviewThreadsMeta: () => singleCursorReviewThreadsMeta,
    timelineCoverageEndAtFromItems: () => timelineCoverageEndAtFromItems,
    timelineEventToItem: () => timelineEventToItem,
    timelineEventsCloseInTime: () => timelineEventsCloseInTime,
    timelineEventsNarrativelyEqual: () => timelineEventsNarrativelyEqual,
    timelineItemCategory: () => timelineItemCategory,
    timelineItemTimeMs: () => timelineItemTimeMs,
    timelineMetaFromPageInfo: () => timelineMetaFromPageInfo,
    toggleTimelineTip: () => toggleTimelineTip
  }), module.exports = __toCommonJS(conversation_timeline_exports);
  function describeTimelineEvent(ev) {
    if (!ev || typeof ev != "object") return null;
    const event = String(ev.event || "").trim();
    if (!event) return null;
    const t = (text) => ({ type: "text", text: String(text) }), strong = (text) => ({ type: "strong", text: String(text) }), title = (text) => ({ type: "title", text: String(text) }), status = (text, tone) => ({
      type: "status",
      text: String(text),
      tone: tone ? String(tone) : void 0
    }), commit = (text) => ({ type: "commit", text: String(text) }), user = (login) => ({ type: "user", login: String(login || "") }), label = (name, color) => ({
      type: "label",
      name: String(name || ""),
      color: color ? String(color) : void 0
    }), milestone = (titleText) => ({
      type: "milestone",
      title: String(titleText || "")
    }), shortSha = (sha) => {
      const s = String(sha || "");
      return s.length > 7 ? s.slice(0, 7) : s;
    };
    switch (event) {
      case "renamed": {
        const from = ev.rename?.from || "", to = ev.rename?.to || "";
        return !from && !to ? [t("changed the title")] : [
          t("changed the title from "),
          title(from || "\u2026"),
          t(" to "),
          title(to || "\u2026")
        ];
      }
      case "convert_to_draft":
        return [
          t("marked this pull request as "),
          status("draft", "draft")
        ];
      case "ready_for_review":
        return [
          t("marked this pull request as "),
          status("ready for review", "ready")
        ];
      case "closed":
        return [status("closed", "closed"), t(" this")];
      case "reopened":
        return [status("reopened", "reopened"), t(" this")];
      case "merged":
        return ev.commitId ? [status("merged", "merged"), t(" commit "), commit(shortSha(ev.commitId))] : [status("merged", "merged"), t(" this pull request")];
      case "committed":
        return ev.commitId ? [t("added commit "), commit(shortSha(ev.commitId))] : [t("added a commit")];
      case "labeled":
        return ev.label?.name ? [t("added the "), label(ev.label.name, ev.label.color), t(" label")] : [t("added a label")];
      case "unlabeled":
        return ev.label?.name ? [
          t("removed the "),
          label(ev.label.name, ev.label.color),
          t(" label")
        ] : [t("removed a label")];
      case "assigned":
        return ev.assignee ? [t("assigned "), user(ev.assignee)] : [t("assigned someone")];
      case "unassigned":
        return ev.assignee ? [t("unassigned "), user(ev.assignee)] : [t("unassigned someone")];
      case "review_requested":
        return ev.requestedTeam ? [t("requested a review from team "), strong(ev.requestedTeam)] : ev.requestedReviewer ? [t("requested a review from "), user(ev.requestedReviewer)] : [t("requested a review")];
      case "review_request_removed":
        return ev.requestedTeam ? [
          t("removed "),
          strong(ev.requestedTeam),
          t(" from requested reviewers")
        ] : ev.requestedReviewer ? [
          t("removed "),
          user(ev.requestedReviewer),
          t(" from requested reviewers")
        ] : [t("removed a review request")];
      case "review_dismissed":
        return ev.dismissReason ? [t("dismissed a review: "), strong(ev.dismissReason)] : [t("dismissed a review")];
      case "milestoned":
        return ev.milestone?.title ? [
          t("added this to the "),
          milestone(ev.milestone.title),
          t(" milestone")
        ] : [t("added this to a milestone")];
      case "demilestoned":
        return ev.milestone?.title ? [
          t("removed this from the "),
          milestone(ev.milestone.title),
          t(" milestone")
        ] : [t("removed this from a milestone")];
      case "locked":
        return ev.lockReason ? [
          t("locked as "),
          status(ev.lockReason, "locked"),
          t(" and limited conversation to collaborators")
        ] : [t("locked and limited conversation to collaborators")];
      case "unlocked":
        return [t("unlocked this conversation")];
      case "head_ref_force_pushed":
        return [t("force-pushed the head branch")];
      case "head_ref_deleted":
        return [t("deleted the head branch")];
      case "head_ref_restored":
        return [t("restored the head branch")];
      case "base_ref_changed":
        return [t("changed the base branch")];
      case "automatic_base_change_succeeded":
        return [t("changed the base branch automatically")];
      case "automatic_base_change_failed":
        return [t("failed to change the base branch automatically")];
      case "connected":
        return [t("connected a referenced issue")];
      case "disconnected":
        return [t("disconnected a referenced issue")];
      case "referenced":
        return ev.commitId ? [
          t("referenced this pull request from commit "),
          commit(shortSha(ev.commitId))
        ] : [t("referenced this pull request")];
      case "cross-referenced":
        return [t("mentioned this pull request")];
      case "transferred":
        return [t("transferred this pull request")];
      case "pinned":
        return [t("pinned this")];
      case "unpinned":
        return [t("unpinned this")];
      case "marked_as_duplicate":
        return [t("marked this as a duplicate")];
      case "unmarked_as_duplicate":
        return [t("unmarked this as a duplicate")];
      case "converted_to_discussion":
        return [t("converted this pull request to a discussion")];
      case "added_to_project":
      case "added_to_project_v2":
        return [t("added this to a project")];
      case "removed_from_project":
      case "removed_from_project_v2":
        return [t("removed this from a project")];
      case "moved_columns_in_project":
      case "moved_columns_in_project_v2":
        return [t("moved this in a project")];
      case "auto_merge_enabled":
        return [t("enabled "), status("auto-merge", "ready")];
      case "auto_merge_disabled":
        return [t("disabled "), status("auto-merge", "draft")];
      case "added_to_merge_queue":
        return [t("added this to the "), status("merge queue", "ready")];
      case "removed_from_merge_queue":
        return [t("removed this from the "), status("merge queue", "draft")];
      case "deployed":
        return [t("deployed this")];
      case "deployment_environment_changed":
        return [t("changed the deployment environment")];
      case "user_blocked":
        return [t("blocked a user")];
      default:
        return [t(event.replace(/_/g, " "))];
    }
  }
  function timelineEventToItem(ev, i = 0) {
    if (!ev) return null;
    const parts = describeTimelineEvent(ev);
    if (!parts || !parts.length) return null;
    const id = ev.id != null ? ev.id : i;
    return {
      key: `evt-${id}`,
      kind: "timeline-event",
      id,
      event: String(ev.event || ""),
      author: ev.actor || "",
      avatarUrl: ev.avatarUrl || ev.avatar_url || null,
      at: ev.at || ev.createdAt || null,
      parts,
      canDelete: !1
    };
  }
  function makeLocalTimelineEvent(partial = { event: "" }) {
    const event = String(partial.event || "").trim(), stamp = partial.at || (/* @__PURE__ */ new Date()).toISOString(), keyPart = partial.label?.name || partial.assignee || partial.requestedReviewer || partial.requestedTeam || partial.milestone?.title || partial.milestone?.number || partial.rename?.to || event, id = `local:${event}:${String(keyPart).toLowerCase()}:${stamp}:${Math.random().toString(36).slice(2, 7)}`, label = partial.label && partial.label.name ? {
      name: String(partial.label.name),
      color: String(partial.label.color || ""),
      description: String(partial.label.description || "")
    } : null;
    return {
      id,
      event,
      actor: partial.actor || "",
      avatarUrl: partial.avatarUrl || "",
      at: stamp,
      label,
      assignee: partial.assignee || null,
      requestedReviewer: partial.requestedReviewer || null,
      requestedTeam: partial.requestedTeam || null,
      milestone: partial.milestone || null,
      rename: partial.rename || null,
      commitId: partial.commitId || null,
      lockReason: null,
      dismissReason: null,
      reviewState: null,
      _local: !0
    };
  }
  function timelineEventsNarrativelyEqual(a, b) {
    if (!a || !b || String(a.event || "") !== String(b.event || "")) return !1;
    const al = String(a.label?.name || "").toLowerCase(), bl = String(b.label?.name || "").toLowerCase();
    if (al || bl) return al === bl && al !== "";
    const aa = String(a.assignee || "").toLowerCase(), ba = String(b.assignee || "").toLowerCase();
    if (aa || ba) return aa === ba && aa !== "";
    const ar = String(a.requestedReviewer || "").toLowerCase(), br = String(b.requestedReviewer || "").toLowerCase();
    if (ar || br) return ar === br && ar !== "";
    const at = String(a.requestedTeam || "").toLowerCase(), bt = String(b.requestedTeam || "").toLowerCase();
    if (at || bt) return at === bt && at !== "";
    const am = String(a.milestone?.title || a.milestone?.number || "").toLowerCase(), bm = String(b.milestone?.title || b.milestone?.number || "").toLowerCase();
    if (am || bm) return am === bm && am !== "";
    const af = String(a.rename?.from || ""), at2 = String(a.rename?.to || ""), bf = String(b.rename?.from || ""), bt2 = String(b.rename?.to || "");
    return af || at2 || bf || bt2 ? af === bf && at2 === bt2 : !0;
  }
  function serverEventCoversLocal(server, local, skewMs = 5e3, maxFutureMs = 18e4) {
    if (!timelineEventsNarrativelyEqual(server, local)) return !1;
    const ts = Date.parse(String(server?.at || server?.createdAt || "")), tl = Date.parse(String(local?.at || local?.createdAt || ""));
    return !Number.isFinite(ts) || !Number.isFinite(tl) ? !1 : ts >= tl - skewMs && ts <= tl + maxFutureMs;
  }
  function timelineEventsCloseInTime(a, b, windowMs = 12e4) {
    const ta = Date.parse(String(a?.at || a?.createdAt || "")), tb = Date.parse(String(b?.at || b?.createdAt || ""));
    return !Number.isFinite(ta) || !Number.isFinite(tb) ? !1 : Math.abs(ta - tb) <= windowMs;
  }
  function mergeTimelineEventsById(prev, next) {
    const byId = /* @__PURE__ */ new Map();
    for (const e of Array.isArray(prev) ? prev : [])
      e && e.id != null && byId.set(String(e.id), e);
    for (const e of Array.isArray(next) ? next : [])
      e && e.id != null && byId.set(String(e.id), e);
    const all = [...byId.values()], server = all.filter((e) => !String(e?.id ?? "").startsWith("local:")), keptLocals = all.filter((e) => String(e?.id ?? "").startsWith("local:")).filter(
      (local) => !server.some((s) => serverEventCoversLocal(s, local))
    );
    return [...server, ...keptLocals];
  }
  function labelNameKey(l) {
    const name = typeof l == "string" ? l : l?.name;
    return String(name || "").trim().toLowerCase();
  }
  function labelObj(l) {
    return typeof l == "string" && l.trim() ? { name: l.trim(), color: "" } : l && typeof l == "object" && l.name ? {
      name: String(l.name),
      color: String(l.color || ""),
      description: String(l.description || "")
    } : null;
  }
  function labelChangeTimelineEvents(prevLabels, nextLabels, actor = {}) {
    const prevMap = /* @__PURE__ */ new Map();
    for (const l of Array.isArray(prevLabels) ? prevLabels : []) {
      const k2 = labelNameKey(l), obj = labelObj(l);
      k2 && obj && prevMap.set(k2, obj);
    }
    const nextMap = /* @__PURE__ */ new Map();
    for (const l of Array.isArray(nextLabels) ? nextLabels : []) {
      const k2 = labelNameKey(l), obj = labelObj(l);
      k2 && obj && nextMap.set(k2, obj);
    }
    const out = [], actorLogin = actor.login || "", avatarUrl = actor.avatarUrl || "";
    for (const [k2, lab] of nextMap)
      prevMap.has(k2) || out.push(
        makeLocalTimelineEvent({
          event: "labeled",
          actor: actorLogin,
          avatarUrl,
          label: lab
        })
      );
    for (const [k2, lab] of prevMap)
      nextMap.has(k2) || out.push(
        makeLocalTimelineEvent({
          event: "unlabeled",
          actor: actorLogin,
          avatarUrl,
          label: lab
        })
      );
    return out;
  }
  function loginKey(x) {
    return String(typeof x == "string" ? x : x?.login || "").trim().toLowerCase();
  }
  function assigneeChangeTimelineEvents(prevAssignees, nextAssignees, actor = {}) {
    const prev = new Set(
      (Array.isArray(prevAssignees) ? prevAssignees : []).map(loginKey).filter(Boolean)
    ), nextList = Array.isArray(nextAssignees) ? nextAssignees : [], next = new Set(nextList.map(loginKey).filter(Boolean)), out = [], actorLogin = actor.login || "", avatarUrl = actor.avatarUrl || "";
    for (const a of nextList) {
      const k2 = loginKey(a);
      !k2 || prev.has(k2) || out.push(
        makeLocalTimelineEvent({
          event: "assigned",
          actor: actorLogin,
          avatarUrl,
          assignee: typeof a == "string" ? a : a?.login || k2
        })
      );
    }
    for (const a of Array.isArray(prevAssignees) ? prevAssignees : []) {
      const k2 = loginKey(a);
      !k2 || next.has(k2) || out.push(
        makeLocalTimelineEvent({
          event: "unassigned",
          actor: actorLogin,
          avatarUrl,
          assignee: typeof a == "string" ? a : a?.login || k2
        })
      );
    }
    return out;
  }
  function reviewerChangeTimelineEvents(prevReviewers, nextReviewers, actor = {}) {
    const prev = new Set(
      (Array.isArray(prevReviewers) ? prevReviewers : []).map(loginKey).filter(Boolean)
    ), nextList = Array.isArray(nextReviewers) ? nextReviewers : [], next = new Set(nextList.map(loginKey).filter(Boolean)), out = [], actorLogin = actor.login || "", avatarUrl = actor.avatarUrl || "";
    for (const r of nextList) {
      const k2 = loginKey(r);
      !k2 || prev.has(k2) || out.push(
        makeLocalTimelineEvent({
          event: "review_requested",
          actor: actorLogin,
          avatarUrl,
          requestedReviewer: typeof r == "string" ? r : r?.login || k2
        })
      );
    }
    for (const r of Array.isArray(prevReviewers) ? prevReviewers : []) {
      const k2 = loginKey(r);
      !k2 || next.has(k2) || out.push(
        makeLocalTimelineEvent({
          event: "review_request_removed",
          actor: actorLogin,
          avatarUrl,
          requestedReviewer: typeof r == "string" ? r : r?.login || k2
        })
      );
    }
    return out;
  }
  function milestoneChangeTimelineEvents(prevMilestone, nextMilestone, actor = {}) {
    const prevTitle = prevMilestone?.title ? String(prevMilestone.title) : prevMilestone?.number != null ? String(prevMilestone.number) : "", nextTitle = nextMilestone?.title ? String(nextMilestone.title) : nextMilestone?.number != null ? String(nextMilestone.number) : "", prevKey = prevMilestone ? `${prevMilestone.number ?? ""}:${prevTitle}`.toLowerCase() : "", nextKey = nextMilestone ? `${nextMilestone.number ?? ""}:${nextTitle}`.toLowerCase() : "";
    if (prevKey === nextKey) return [];
    const out = [], actorLogin = actor.login || "", avatarUrl = actor.avatarUrl || "";
    return prevMilestone && prevKey && out.push(
      makeLocalTimelineEvent({
        event: "demilestoned",
        actor: actorLogin,
        avatarUrl,
        milestone: {
          number: prevMilestone.number != null ? Number(prevMilestone.number) : null,
          title: prevTitle
        }
      })
    ), nextMilestone && nextKey && out.push(
      makeLocalTimelineEvent({
        event: "milestoned",
        actor: actorLogin,
        avatarUrl,
        milestone: {
          number: nextMilestone.number != null ? Number(nextMilestone.number) : null,
          title: nextTitle
        }
      })
    ), out;
  }
  var TIMELINE_PAGE_SIZE = 100;
  function emptyTimelinePageMeta(overrides = {}) {
    return {
      pageSize: TIMELINE_PAGE_SIZE,
      direction: "newest",
      // 'newest' | 'oldest'
      hasMore: !1,
      hasPreviousPage: !1,
      hasNextPage: !1,
      startCursor: null,
      endCursor: null,
      /** ISO watermark for newest-only since incremental */
      watermark: null,
      loadedCount: 0,
      totalCount: null,
      complete: !0,
      source: "graphql",
      ...overrides
    };
  }
  function timelineMetaFromPageInfo(pageInfo, opts = {}) {
    const dir = String(opts.direction || opts.prev?.direction || "newest").toLowerCase() === "oldest" ? "oldest" : "newest", hasPreviousPage = !!pageInfo?.hasPreviousPage, hasNextPage = !!pageInfo?.hasNextPage, hasMore = dir === "newest" ? hasPreviousPage : hasNextPage, loadedCount = Number(opts.loadedCount) || 0, totalCount = opts.totalCount != null ? Number(opts.totalCount) : opts.prev?.totalCount != null ? Number(opts.prev.totalCount) : null;
    return emptyTimelinePageMeta({
      direction: dir,
      hasMore,
      hasPreviousPage,
      hasNextPage,
      startCursor: pageInfo?.startCursor || null,
      endCursor: pageInfo?.endCursor || null,
      watermark: opts.watermark != null ? opts.watermark : opts.prev?.watermark != null ? opts.prev.watermark : null,
      loadedCount,
      totalCount: Number.isFinite(totalCount) ? totalCount : null,
      complete: !hasMore,
      source: "graphql"
    });
  }
  function maxTimelineWatermark(items) {
    let best = null, bestMs = 0;
    for (const it of Array.isArray(items) ? items : []) {
      const raw = it?.at || it?.createdAt || it?.submittedAt || it?.created_at || "", s = String(raw || "").trim();
      if (!s) continue;
      const ms = Date.parse(s);
      Number.isFinite(ms) && ms >= bestMs && (bestMs = ms, best = s);
    }
    return best;
  }
  function mergeTimelineItemsById(prevItems, nextItems, opts = {}) {
    const map = /* @__PURE__ */ new Map(), keyOf = (it, i2) => it?.key != null ? String(it.key) : it?.id != null ? `${it.kind || "item"}-${it.id}` : it?.nodeId != null ? String(it.nodeId) : `idx-${i2}-${it?.at || ""}`;
    let i = 0;
    for (const it of Array.isArray(prevItems) ? prevItems : [])
      it && map.set(keyOf(it, i++), it);
    for (const it of Array.isArray(nextItems) ? nextItems : [])
      it && map.set(keyOf(it, i++), it);
    const out = [...map.values()];
    return opts.sortNewest !== !1 && out.sort((a, b) => {
      const ta = Date.parse(String(a?.at || a?.createdAt || "")) || 0, tb = Date.parse(String(b?.at || b?.createdAt || "")) || 0;
      return tb !== ta ? tb - ta : String(b?.key || b?.id || "").localeCompare(
        String(a?.key || a?.id || "")
      );
    }), out;
  }
  function selectDirtyThreadIdsByCommentCount(prevThreads, nextThreads) {
    const prevById = /* @__PURE__ */ new Map();
    for (const t of Array.isArray(prevThreads) ? prevThreads : []) {
      const id = t?.threadNodeId ? String(t.threadNodeId) : "";
      id && prevById.set(id, t);
    }
    const dirty = [];
    for (const t of Array.isArray(nextThreads) ? nextThreads : []) {
      const id = t?.threadNodeId ? String(t.threadNodeId) : "";
      if (!id || !/^PRRT_/i.test(id)) continue;
      const prev = prevById.get(id);
      if (!prev) {
        t.commentsLoaded !== !0 && dirty.push(id);
        continue;
      }
      const prevCount = typeof prev.commentCount == "number" ? prev.commentCount : Array.isArray(prev.commentIds) ? prev.commentIds.length : null, nextCount = typeof t.commentCount == "number" ? t.commentCount : Array.isArray(t.commentIds) ? t.commentIds.length : null;
      if (prevCount != null && nextCount != null && Number(prevCount) !== Number(nextCount)) {
        dirty.push(id);
        continue;
      }
      if (!!prev.resolved != !!t.resolved) {
        dirty.push(id);
        continue;
      }
      t.commentsLoaded !== !0 && prev.commentsLoaded === !0 && dirty.push(id);
    }
    return dirty;
  }
  function isReviewThreadsLoadIncomplete(meta) {
    if (!meta || typeof meta != "object") return !1;
    if (meta.hasMore || meta.hasOlder || meta.hasNewerFromOldest || (Number(meta.hiddenCount) || 0) > 0) return !0;
    const total = Number(meta.totalCount), loaded = Number(meta.loadedThreadCount);
    return !!(Number.isFinite(total) && Number.isFinite(loaded) && total > loaded);
  }
  function isTimelineLoadIncomplete(meta) {
    return !meta || typeof meta != "object" ? !1 : !!(meta.hasMore || meta.complete === !1);
  }
  function conversationLoadMoreState(threadsMeta = null, timelineMeta = null) {
    const threadsIncomplete = isReviewThreadsLoadIncomplete(threadsMeta), timelineIncomplete = isTimelineLoadIncomplete(timelineMeta), threadsHidden = Math.max(0, Number(threadsMeta?.hiddenCount) || 0), timelineLoaded = Number(timelineMeta?.loadedCount) || 0, timelineTotal = timelineMeta?.totalCount != null ? Number(timelineMeta.totalCount) : null, timelineHidden = timelineTotal != null && Number.isFinite(timelineTotal) ? Math.max(0, timelineTotal - timelineLoaded) : timelineIncomplete ? 1 : 0;
    return {
      threadsIncomplete,
      timelineIncomplete,
      anyIncomplete: threadsIncomplete || timelineIncomplete,
      /**
       * When Diff (or load-all threads) already completed reviewThreads but
       * timelineItems still has older pages, older threads may already paint
       * below the timeline window — prefer a mid-list gap at coverage floor.
       */
      preferMiddleGap: !threadsIncomplete && timelineIncomplete,
      hiddenCount: Math.max(threadsHidden, timelineHidden),
      coverageEndAt: timelineMeta?.coverageEndAt || timelineMeta?.oldestLoadedAt || null
    };
  }
  function itemTimestampMs(it) {
    const raw = it?.at || it?.createdAt || it?.submittedAt || it?.created_at || "", s = String(raw || "").trim();
    if (!s) return null;
    const ms = Date.parse(s);
    return Number.isFinite(ms) ? ms : null;
  }
  function timelineCoverageEndAtFromItems(items) {
    let best = null, bestMs = 1 / 0;
    for (const it of Array.isArray(items) ? items : []) {
      if (!it) continue;
      const kind = String(it.kind || it.type || "").toLowerCase();
      if (kind === "review-thread" || kind === "review-group" || kind === "review" || kind === "pending-review")
        continue;
      const ms = itemTimestampMs(it);
      ms != null && ms < bestMs && (bestMs = ms, best = String(it.at || it.createdAt || it.submittedAt || "").trim() || null);
    }
    return best;
  }
  function minTimelineCoverageEndAt(comments, events) {
    let best = null, bestMs = 1 / 0;
    for (const it of [
      ...Array.isArray(comments) ? comments : [],
      ...Array.isArray(events) ? events : []
    ]) {
      const raw = it?.createdAt || it?.at || it?.created_at || "", s = String(raw || "").trim();
      if (!s) continue;
      const ms = Date.parse(s);
      !Number.isFinite(ms) || ms >= bestMs || (bestMs = ms, best = s);
    }
    return best;
  }
  function partitionConversationLoadMore(items, threadsMeta = null, timelineMeta = null) {
    const list = Array.isArray(items) ? items : [], st = conversationLoadMoreState(threadsMeta, timelineMeta);
    if (!st.anyIncomplete)
      return {
        top: list,
        bottom: [],
        hiddenCount: 0,
        showGap: !1,
        gapPlacement: "none",
        loadState: st
      };
    if (st.preferMiddleGap) {
      const floorRaw = st.coverageEndAt, floorMs = floorRaw ? Date.parse(String(floorRaw)) : NaN;
      if (Number.isFinite(floorMs)) {
        const top = [], bottom = [];
        for (const it of list) {
          const ms = itemTimestampMs(it);
          ms == null || ms >= floorMs ? top.push(it) : bottom.push(it);
        }
        if (bottom.length > 0 && top.length > 0)
          return {
            top,
            bottom,
            hiddenCount: st.hiddenCount,
            showGap: !0,
            gapPlacement: "middle",
            loadState: st
          };
      }
    }
    return {
      top: list,
      bottom: [],
      hiddenCount: st.hiddenCount,
      showGap: !0,
      gapPlacement: "end",
      loadState: st
    };
  }
  function singleCursorReviewThreadsMeta(page, prev = null) {
    const threads = Array.isArray(page?.threads) ? page.threads : [], totalCount = typeof page?.totalCount == "number" ? page.totalCount : Number(prev?.totalCount) || threads.length, loadedThreadCount = threads.length, hiddenCount = Math.max(0, totalCount - loadedThreadCount), dir = String(page?.direction || page?.window || "newest").toLowerCase() === "oldest" ? "oldest" : "newest", hasOlder = dir === "newest" ? !!page?.hasPreviousPage && hiddenCount > 0 : !1, hasNewer = dir === "oldest" ? !!page?.hasNextPage && hiddenCount > 0 : !1;
    return {
      totalCount,
      hiddenCount,
      loadedThreadCount,
      loadedCommentCount: Array.isArray(page?.comments) ? page.comments.length : 0,
      pagesLoaded: 1,
      newestStartCursor: page?.startCursor || null,
      newestEndCursor: page?.endCursor || null,
      hasOlder: hasOlder || dir === "newest" && !!page?.hasPreviousPage,
      oldestStartCursor: null,
      oldestEndCursor: null,
      /** Dual-window retired — always false in product path */
      hasNewerFromOldest: !1,
      newestThreadIds: threads.map((t) => t.threadNodeId).filter(Boolean),
      oldestThreadIds: [],
      hasMore: hiddenCount > 0 || hasOlder || hasNewer,
      endCursor: page?.startCursor || null,
      direction: dir,
      source: page?.source || "graphql"
    };
  }
  function buildThreadEntry(c, children, snippetFn, files, viewerLogin, i) {
    const replies = (children.get(String(c.id)) || []).slice().sort(
      (a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || ""))
    ).map((r) => ({
      id: r.id,
      author: r.author,
      avatarUrl: r.avatarUrl || null,
      body: r.body || "",
      at: r.createdAt,
      createdAt: r.createdAt,
      pending: !!r.pending,
      nodeId: r.nodeId || r.node_id || null,
      reactions: Array.isArray(r.reactions) ? r.reactions : [],
      canDelete: !!(viewerLogin && r.author && r.author === viewerLogin && !r.pending)
    })), snippet = snippetFn ? snippetFn(
      {
        path: c.path,
        line: c.line,
        originalLine: c.originalLine ?? c.original_line,
        startLine: c.startLine ?? c.start_line,
        side: c.side,
        diffHunk: c.diffHunk || c.diff_hunk || ""
      },
      files
    ) : null, displayLine = c.line != null ? Number(c.line) : c.originalLine != null ? Number(c.originalLine) : c.original_line != null ? Number(c.original_line) : null, reviewId = c.reviewId != null ? Number(c.reviewId) : c.pendingReviewId != null ? Number(c.pendingReviewId) : c.pull_request_review_id != null ? Number(c.pull_request_review_id) : null;
    return {
      key: `thread-${c.id || i}`,
      kind: "review-thread",
      id: c.id,
      author: c.author,
      avatarUrl: c.avatarUrl || c.avatar_url || null,
      body: c.body || "",
      at: c.createdAt,
      path: c.path,
      line: displayLine,
      startLine: c.startLine ?? c.start_line ?? null,
      side: c.side || "RIGHT",
      resolved: !!c.resolved,
      outdated: !!c.outdated,
      threadNodeId: c.threadNodeId || null,
      nodeId: c.nodeId || c.node_id || null,
      reactions: Array.isArray(c.reactions) ? c.reactions : [],
      reviewId: Number.isFinite(reviewId) ? reviewId : null,
      pending: !!c.pending,
      replies,
      snippet,
      canDelete: !!(viewerLogin && c.author && c.author === viewerLogin && !c.pending)
    };
  }
  function timelineItemTimeMs(item) {
    if (!item || typeof item != "object") return 0;
    const raw = item.at || item.createdAt || item.submittedAt || item.created_at || "", t = Date.parse(String(raw));
    return Number.isFinite(t) ? t : 0;
  }
  function compareTimelineItemsNewestFirst(a, b) {
    const d = timelineItemTimeMs(b) - timelineItemTimeMs(a);
    return d !== 0 ? d : String(b?.key || b?.id || "").localeCompare(
      String(a?.key || a?.id || "")
    );
  }
  function buildConversationTimeline(detail, opts = {}) {
    if (!detail) return [];
    const items = [], snippetFn = typeof opts.snippetForComment == "function" ? opts.snippetForComment : typeof globalThis < "u" && globalThis.PRModalDiffSnippet?.snippetForComment ? globalThis.PRModalDiffSnippet.snippetForComment : null, files = detail.files || [], viewerLogin = detail.viewerLogin, reviewById = /* @__PURE__ */ new Map();
    for (const r of detail.reviews || [])
      r && r.id != null && reviewById.set(String(r.id), r);
    const vpr = detail.viewerPendingReview;
    vpr?.id != null && !reviewById.has(String(vpr.id)) && reviewById.set(String(vpr.id), {
      id: vpr.id,
      author: vpr.author || detail.viewerLogin || "",
      avatarUrl: vpr.avatarUrl || vpr.avatar_url || null,
      state: "PENDING",
      body: vpr.body || "",
      submittedAt: vpr.submittedAt || vpr.createdAt || null,
      isBot: !1
    });
    const viewerPendingId = vpr?.id != null ? String(vpr.id) : null;
    (detail.comments || []).forEach((c, i) => {
      items.push({
        key: `c-${c.id || i}`,
        kind: "issue-comment",
        id: c.id,
        author: c.author,
        avatarUrl: c.avatarUrl || c.avatar_url || null,
        body: c.body || "",
        at: c.createdAt,
        nodeId: c.nodeId || c.node_id || null,
        reactions: Array.isArray(c.reactions) ? c.reactions : [],
        canDelete: !!(viewerLogin && c.author && c.author === viewerLogin)
      });
    });
    const allRc = Array.isArray(detail.reviewComments) ? detail.reviewComments : [], byId = /* @__PURE__ */ new Map();
    for (const c of allRc)
      c && c.id != null && byId.set(String(c.id), c);
    const children = /* @__PURE__ */ new Map(), roots = [];
    for (const c of allRc) {
      if (!c) continue;
      const parentId = c.inReplyToId ?? c.in_reply_to_id ?? null;
      if (parentId != null && byId.has(String(parentId))) {
        const key = String(parentId);
        children.has(key) || children.set(key, []), children.get(key).push(c);
      } else
        roots.push(c);
    }
    const threadsByReviewId = /* @__PURE__ */ new Map(), orphanThreads = [];
    roots.forEach((c, i) => {
      const thread = buildThreadEntry(
        c,
        children,
        snippetFn,
        files,
        viewerLogin,
        i
      );
      let groupKey = thread.reviewId != null ? String(thread.reviewId) : thread.pending && viewerPendingId ? viewerPendingId : thread.pending ? "viewer-pending" : null;
      groupKey != null ? (threadsByReviewId.has(groupKey) || threadsByReviewId.set(groupKey, []), threadsByReviewId.get(groupKey).push(thread)) : orphanThreads.push(thread);
    });
    const usedReviewIds = /* @__PURE__ */ new Set();
    for (const [rid, threads] of threadsByReviewId) {
      const review = reviewById.get(rid), reviewBody = String(review?.body || "").trim(), anyPending = threads.some((t) => t.pending) || String(review?.state || "").toUpperCase() === "PENDING" || rid === "viewer-pending" || viewerPendingId != null && rid === viewerPendingId, state = anyPending ? "PENDING" : String(review?.state || "COMMENTED").toUpperCase(), shouldGroup = threads.length >= 1;
      if (threads.sort((a, b) => {
        const pa = a.path || "", pb = b.path || "";
        return pa !== pb ? pa.localeCompare(pb) : (Number(a.line) || 0) - (Number(b.line) || 0);
      }), shouldGroup) {
        usedReviewIds.add(rid);
        const latestThreadAt = threads.reduce(
          (max, t) => String(t.at || "") > max ? String(t.at || "") : max,
          ""
        ), at = review?.submittedAt || latestThreadAt || threads[0]?.at || null, author = review?.author || threads[0]?.author || (anyPending ? viewerLogin : "") || "";
        items.push({
          key: `rev-group-${rid}`,
          kind: "review-group",
          id: Number(rid) || rid,
          author,
          avatarUrl: review?.avatarUrl || review?.avatar_url || threads[0]?.avatarUrl || null,
          state,
          body: reviewBody,
          at,
          isBot: !!review?.isBot || /\[bot\]$/i.test(author) || String(review?.type || "").toLowerCase() === "bot",
          pending: anyPending,
          threads,
          threadCount: threads.length,
          resolvedCount: threads.filter((t) => t.resolved).length,
          canDelete: !1
        });
      } else
        for (const t of threads) orphanThreads.push(t);
    }
    (detail.reviews || []).forEach((r, i) => {
      r?.id != null && usedReviewIds.has(String(r.id)) || !r.body && (!r.state || r.state === "COMMENTED" || r.state === "PENDING") || items.push({
        key: `rev-${r.id || i}`,
        kind: "review",
        id: r.id,
        author: r.author,
        avatarUrl: r.avatarUrl || r.avatar_url || null,
        state: r.state,
        body: r.body || "",
        at: r.submittedAt,
        isBot: !!r.isBot || /\[bot\]$/i.test(String(r.author || "")) || String(r.type || "").toLowerCase() === "bot",
        canDelete: !1
      });
    });
    for (const t of orphanThreads)
      items.push(t);
    return (Array.isArray(detail.timelineEvents) ? detail.timelineEvents : []).forEach((ev, i) => {
      const item = timelineEventToItem(ev, i);
      item && items.push(item);
    }), items.sort(compareTimelineItemsNewestFirst), items;
  }
  function pageTimelineItems(items, opts = {}) {
    const list = Array.isArray(items) ? items : [], pageSize = Number.isFinite(opts.pageSize) && opts.pageSize > 0 ? Math.floor(opts.pageSize) : 20, page = Number.isFinite(opts.page) && opts.page > 0 ? Math.floor(opts.page) : 1, total = list.length, totalPages = Math.max(1, Math.ceil(total / pageSize) || 1), safePage = Math.min(page, totalPages), start = (safePage - 1) * pageSize, slice = list.slice(start, start + pageSize), hasNewer = safePage > 1, hasOlder = safePage < totalPages;
    return {
      items: slice,
      page: safePage,
      pageSize,
      total,
      totalPages,
      hasMore: hasOlder,
      hasPrev: hasNewer,
      hasNewer,
      hasOlder
    };
  }
  function partitionTimelineWithThreadGap(items, threadsMeta = null, timelineMeta = null) {
    return partitionConversationLoadMore(items, threadsMeta, timelineMeta);
  }
  var TIMELINE_CATEGORY_IDS = [
    "events",
    "participants",
    "comments",
    "review-threads"
  ], TIMELINE_TIP_IDS = ["all", ...TIMELINE_CATEGORY_IDS], TIMELINE_TIP_LABELS = {
    all: "All",
    events: "events",
    participants: "participants",
    comments: "comments",
    "review-threads": "threads"
  }, DEFAULT_TIMELINE_VISIBILITY = {
    events: !0,
    participants: !0,
    comments: !0,
    "review-threads": !0
  }, LEGACY_EVENT_KEYS = [
    "labels",
    "title",
    "milestone",
    "referenced"
  ], LEGACY_PARTICIPANT_KEYS = ["assignees", "reviewers"];
  function normalizeTimelineVisibility(raw) {
    const src = raw && typeof raw == "object" && !Array.isArray(raw) ? raw : {}, out = { ...DEFAULT_TIMELINE_VISIBILITY };
    for (const id of TIMELINE_CATEGORY_IDS)
      typeof src[id] == "boolean" && (out[id] = src[id]);
    if (TIMELINE_CATEGORY_IDS.some((id) => typeof src[id] == "boolean") || [...LEGACY_EVENT_KEYS, ...LEGACY_PARTICIPANT_KEYS, "comments"].some(
      (k2) => typeof src[k2] == "boolean"
    ) && (out.events = LEGACY_EVENT_KEYS.some((k2) => src[k2] !== !1), out.participants = LEGACY_PARTICIPANT_KEYS.some((k2) => src[k2] !== !1), typeof src.comments == "boolean" && (out.comments = src.comments), out["review-threads"] = !0), src.all === !0)
      for (const id of TIMELINE_CATEGORY_IDS) out[id] = !0;
    return out;
  }
  function isTimelineVisibilityAllOn(vis) {
    const v = normalizeTimelineVisibility(vis);
    return TIMELINE_CATEGORY_IDS.every((id) => v[id] !== !1);
  }
  function toggleTimelineTip(vis, tipId) {
    const cur = normalizeTimelineVisibility(vis), id = String(tipId || "").trim().toLowerCase();
    if (id === "all") {
      if (isTimelineVisibilityAllOn(cur)) {
        const off = { ...cur };
        for (const key of TIMELINE_CATEGORY_IDS) off[key] = !1;
        return off;
      }
      return { ...DEFAULT_TIMELINE_VISIBILITY };
    }
    if (TIMELINE_CATEGORY_IDS.includes(id)) {
      const key = id;
      return { ...cur, [key]: !cur[key] };
    }
    return cur;
  }
  function timelineItemCategory(item) {
    if (!item || typeof item != "object") return null;
    const kind = String(item.kind || "");
    if (kind === "issue-comment") return "comments";
    if (kind === "review-thread" || kind === "review-comment")
      return "review-threads";
    if (kind === "review-group" || kind === "review") return "comments";
    const cat = String(item.category || "").trim().toLowerCase();
    if (TIMELINE_CATEGORY_IDS.includes(cat))
      return cat;
    const event = String(item.event || "").trim().toLowerCase();
    return event === "assigned" || event === "unassigned" || event === "review_requested" || event === "review_request_removed" ? "participants" : event === "labeled" || event === "unlabeled" || event === "renamed" || event === "milestoned" || event === "demilestoned" || event === "referenced" || event === "cross-referenced" || event === "connected" || event === "disconnected" || event === "closed" || event === "reopened" || event === "merged" || event === "convert_to_draft" || event === "ready_for_review" || event === "head_ref_force_pushed" || event === "base_ref_changed" || event === "locked" || event === "unlocked" || event === "added_to_project" || event === "removed_from_project" || event === "moved_columns_in_project" || event === "project_v2_item_status_changed" || kind === "timeline-event" || kind === "system-event" ? "events" : null;
  }
  function filterTimelineItemsByVisibility(items, visibility) {
    const list = Array.isArray(items) ? items : [], vis = normalizeTimelineVisibility(visibility);
    return list.filter((item) => {
      const cat = timelineItemCategory(item);
      return cat ? vis[cat] !== !1 : !0;
    });
  }
  function shouldFetchSystemTimelineEvents(visibility) {
    const vis = normalizeTimelineVisibility(visibility);
    return vis.events !== !1 || vis.participants !== !1;
  }
  function needsLazyTimelineEventsFetch(prevVisibility, nextVisibility, timelineEvents) {
    if (!shouldFetchSystemTimelineEvents(nextVisibility)) return !1;
    if (shouldFetchSystemTimelineEvents(prevVisibility)) {
      const prev = normalizeTimelineVisibility(prevVisibility), next = normalizeTimelineVisibility(nextVisibility);
      if (!(prev.events === !1 && next.events !== !1 || prev.participants === !1 && next.participants !== !1)) return !1;
    }
    return (Array.isArray(timelineEvents) ? timelineEvents : []).length === 0;
  }
  function planTimelineVisibilityChange(prevVisibility, nextVisibility, timelineEvents = null) {
    const prev = normalizeTimelineVisibility(prevVisibility), next = normalizeTimelineVisibility(nextVisibility);
    return {
      prevVisibility: prev,
      nextVisibility: next,
      shouldLazyFetch: needsLazyTimelineEventsFetch(prev, next, timelineEvents)
    };
  }
  function shouldAcceptTimelineVisibilityFromHost(opts) {
    const incoming = normalizeTimelineVisibility(opts.incoming), lastEmitted = normalizeTimelineVisibility(opts.lastEmitted), incomingJson = JSON.stringify(incoming), emittedJson = JSON.stringify(lastEmitted);
    if (incomingJson === emittedJson)
      return { accept: !0, clearPending: !0 };
    const now = Number(opts.nowMs ?? Date.now()), until = Number(opts.ignoreHostUntilMs || 0);
    return until > 0 && now < until ? { accept: !1, clearPending: !1 } : { accept: !0, clearPending: !0 };
  }
  var api = module.exports && module.exports.__esModule ? module.exports.default && typeof module.exports.default == "object" ? Object.assign({}, module.exports, module.exports.default) : module.exports.default || module.exports : module.exports;
  if (api && typeof api == "object" && api.__esModule) {
    var flat = {};
    for (var k in api)
      k !== "default" && k !== "__esModule" && Object.prototype.hasOwnProperty.call(api, k) && (flat[k] = api[k]);
    if (api.default && typeof api.default == "object")
      for (var dk in api.default)
        Object.prototype.hasOwnProperty.call(api.default, dk) && flat[dk] === void 0 && (flat[dk] = api.default[dk]);
    Object.keys(flat).length && (api = flat);
  }
  global.PRModalConversationTimeline = api;
})(typeof globalThis < "u" ? globalThis : typeof window < "u" ? window : this);


/* ---- storage.ts ---- */

;(function(){
const TOKEN_KEY = "githubToken", HOST_ACCOUNTS_KEY = "hostAccounts", PREFS_KEY = "extensionPrefs", ONBOARDING_KEY = "onboardingCompleted", DEFAULT_PREFS = {
  reverseComments: !0,
  autoOpenEmbed: !0,
  singleFileMode: !1,
  treeView: !0,
  /**
   * Master switch: when false, pr+ host/network features stay off.
   * Rate-limit auto-disable also flips this off until reset (user may re-enable).
   */
  pluginEnabled: !0,
  /**
   * Bottom-center shortcut / action monitor size:
   * none | small (1× default) | medium (2×) | large (3×)
   */
  shortcutMonitorSize: "small",
  /**
   * Diff file nav (tree click / ⌥⇧[ ]): auto-expand the target file.
   * Off by default — collapsed files stay collapsed until the user expands.
   */
  autoExpandOnFileNav: !1,
  onboardingCompleted: !1,
  /**
   * Conversation timeline category visibility (plugin-global).
   * events | participants | comments | review-threads
   * — each true = tip on / rows shown. Synced with conversation tip row + popup.
   * Legacy 7-key maps are migrated in normalizeTimelineVisibility.
   */
  timelineVisibility: {
    events: !0,
    participants: !0,
    comments: !0,
    "review-threads": !0
  }
}, RATE_LIMIT_KEY = "rateLimitState";
function normalizeShortcutMonitorSizePref(raw) {
  const v = String(raw ?? "").trim().toLowerCase();
  return v === "none" || v === "off" || v === "hidden" || v === "0" ? "none" : v === "medium" || v === "md" || v === "2" || v === "2x" ? "medium" : v === "large" || v === "lg" || v === "3" || v === "3x" ? "large" : v === "small" || v === "sm" || v === "1" || v === "1x" ? "small" : raw === !1 ? "none" : DEFAULT_PREFS.shortcutMonitorSize;
}
function getStorageArea(storageApi2 = globalThis.chrome?.storage?.local) {
  return storageApi2 || null;
}
function normalizeTimelineVisibilityPref(raw) {
  try {
    const pure = globalThis.PRModalConversationTimeline;
    if (typeof pure?.normalizeTimelineVisibility == "function")
      return pure.normalizeTimelineVisibility(raw);
  } catch {
  }
  const src = raw && typeof raw == "object" && !Array.isArray(raw) ? raw : {}, base = {
    events: !0,
    participants: !0,
    comments: !0,
    "review-threads": !0
  };
  for (const id of Object.keys(base))
    typeof src[id] == "boolean" && (base[id] = src[id]);
  if (!Object.keys(base).some((k) => typeof src[k] == "boolean")) {
    const legacyEvent = ["labels", "title", "milestone", "referenced"], legacyPart = ["assignees", "reviewers"];
    [...legacyEvent, ...legacyPart, "comments"].some((k) => typeof src[k] == "boolean") && (base.events = legacyEvent.some((k) => src[k] !== !1), base.participants = legacyPart.some((k) => src[k] !== !1), typeof src.comments == "boolean" && (base.comments = src.comments), base["review-threads"] = !0);
  }
  if (src.all === !0)
    for (const id of Object.keys(base)) base[id] = !0;
  return base;
}
function normalizePrefs(raw) {
  const src = raw && typeof raw == "object" ? raw : {};
  return {
    reverseComments: typeof src.reverseComments == "boolean" ? src.reverseComments : DEFAULT_PREFS.reverseComments,
    autoOpenEmbed: typeof src.autoOpenEmbed == "boolean" ? src.autoOpenEmbed : DEFAULT_PREFS.autoOpenEmbed,
    singleFileMode: typeof src.singleFileMode == "boolean" ? src.singleFileMode : DEFAULT_PREFS.singleFileMode,
    treeView: typeof src.treeView == "boolean" ? src.treeView : DEFAULT_PREFS.treeView,
    pluginEnabled: typeof src.pluginEnabled == "boolean" ? src.pluginEnabled : DEFAULT_PREFS.pluginEnabled,
    shortcutMonitorSize: normalizeShortcutMonitorSizePref(
      src.shortcutMonitorSize
    ),
    autoExpandOnFileNav: typeof src.autoExpandOnFileNav == "boolean" ? src.autoExpandOnFileNav : DEFAULT_PREFS.autoExpandOnFileNav,
    onboardingCompleted: typeof src.onboardingCompleted == "boolean" ? src.onboardingCompleted : DEFAULT_PREFS.onboardingCompleted,
    timelineVisibility: normalizeTimelineVisibilityPref(
      src.timelineVisibility ?? DEFAULT_PREFS.timelineVisibility
    )
  };
}
function emptyRateLimitStateLocal() {
  const RL = globalThis.PRModalRateLimit;
  return typeof RL?.emptyRateLimitState == "function" ? RL.emptyRateLimitState() : {
    disabledUntil: { core: 0, graphql: 0, search: 0 },
    snapshots: { core: null, graphql: null, search: null }
  };
}
function normalizeRateLimitStateLocal(raw) {
  const RL = globalThis.PRModalRateLimit;
  return typeof RL?.normalizeRateLimitState == "function" ? RL.normalizeRateLimitState(raw) : emptyRateLimitStateLocal();
}
function getRateLimitState(storageApi2) {
  const area = getStorageArea(storageApi2);
  return area ? new Promise((resolve) => {
    area.get([RATE_LIMIT_KEY], (result) => {
      resolve(normalizeRateLimitStateLocal(result?.[RATE_LIMIT_KEY]));
    });
  }) : Promise.resolve(emptyRateLimitStateLocal());
}
async function setRateLimitState(next, storageApi2) {
  const area = getStorageArea(storageApi2);
  if (!area) return Promise.reject(new Error("chrome.storage unavailable"));
  const normalized = normalizeRateLimitStateLocal(next);
  return new Promise((resolve, reject) => {
    area.set({ [RATE_LIMIT_KEY]: normalized }, () => {
      const err = globalThis.chrome?.runtime?.lastError;
      err ? reject(err) : resolve(normalized);
    });
  });
}
async function patchRateLimitState(patch, storageApi2) {
  const prev = await getRateLimitState(storageApi2), next = normalizeRateLimitStateLocal({
    ...prev,
    ...patch && typeof patch == "object" ? patch : {},
    disabledUntil: {
      ...prev.disabledUntil,
      ...patch?.disabledUntil && typeof patch.disabledUntil == "object" ? patch.disabledUntil : {}
    },
    snapshots: {
      ...prev.snapshots,
      ...patch?.snapshots && typeof patch.snapshots == "object" ? patch.snapshots : {}
    }
  });
  return setRateLimitState(next, storageApi2);
}
function watchRateLimitState(onChange, storageApi2 = globalThis.chrome?.storage) {
  if (!storageApi2?.onChanged || typeof onChange != "function") return () => {
  };
  const listener = (changes, areaName) => {
    areaName !== "local" || !changes[RATE_LIMIT_KEY] || onChange(normalizeRateLimitStateLocal(changes[RATE_LIMIT_KEY].newValue));
  };
  return storageApi2.onChanged.addListener(listener), () => storageApi2.onChanged.removeListener(listener);
}
function normalizeHostAccounts(raw) {
  if (globalThis.PRGithubEndpoints?.normalizeHostAccounts)
    return globalThis.PRGithubEndpoints.normalizeHostAccounts(raw);
  const list = Array.isArray(raw) ? raw : [], out = [], seen = /* @__PURE__ */ new Set();
  for (const row of list) {
    if (!row || typeof row != "object") continue;
    let host = String(row.host || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/:\d+$/, "");
    host.includes("@") && (host = host.slice(host.lastIndexOf("@") + 1));
    const token = typeof row.token == "string" ? row.token.trim() : "";
    if (!(!host || host === "github.com" || host === "www.github.com") && !host.endsWith(".github.com") && !(!token || seen.has(host)) && (seen.add(host), out.push({ host, token }), out.length >= 3))
      break;
  }
  return out;
}
function getExtensionPrefs(storageApi2) {
  const area = getStorageArea(storageApi2);
  return area ? new Promise((resolve) => {
    area.get([PREFS_KEY], (result) => {
      resolve(normalizePrefs(result?.[PREFS_KEY]));
    });
  }) : Promise.resolve({ ...DEFAULT_PREFS });
}
async function setExtensionPrefs(patch, storageApi2) {
  const area = getStorageArea(storageApi2);
  if (!area) return Promise.reject(new Error("chrome.storage unavailable"));
  const prev = await getExtensionPrefs(area), next = normalizePrefs({
    ...prev,
    ...patch && typeof patch == "object" ? patch : {}
  });
  return new Promise((resolve, reject) => {
    area.set({ [PREFS_KEY]: next }, () => {
      const err = globalThis.chrome?.runtime?.lastError;
      err ? reject(err) : resolve(next);
    });
  });
}
function watchExtensionPrefs(onChange, storageApi2 = globalThis.chrome?.storage) {
  if (!storageApi2?.onChanged || typeof onChange != "function") return () => {
  };
  const listener = (changes, areaName) => {
    areaName !== "local" || !changes[PREFS_KEY] || onChange(normalizePrefs(changes[PREFS_KEY].newValue));
  };
  return storageApi2.onChanged.addListener(listener), () => storageApi2.onChanged.removeListener(listener);
}
function getOnboardingCompleted(storageApi2) {
  const area = getStorageArea(storageApi2);
  return area ? new Promise((resolve) => {
    area.get([ONBOARDING_KEY, PREFS_KEY], (result) => {
      if (typeof result?.[ONBOARDING_KEY] == "boolean") {
        resolve(!!result[ONBOARDING_KEY]);
        return;
      }
      const prefs = normalizePrefs(result?.[PREFS_KEY]);
      resolve(!!prefs.onboardingCompleted);
    });
  }) : Promise.resolve(!1);
}
async function setOnboardingCompleted(completed, storageApi2) {
  const area = getStorageArea(storageApi2);
  if (!area) return Promise.reject(new Error("chrome.storage unavailable"));
  const value = !!completed;
  await new Promise((resolve, reject) => {
    area.set({ [ONBOARDING_KEY]: value }, () => {
      const err = globalThis.chrome?.runtime?.lastError;
      err ? reject(err) : resolve(void 0);
    });
  });
  try {
    await setExtensionPrefs({ onboardingCompleted: value }, area);
  } catch {
  }
  return value;
}
function maskGithubToken(token) {
  if (!token || typeof token != "string") return "";
  const trimmed = token.trim();
  return trimmed ? trimmed.length <= 4 ? "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" : `${"\u2022".repeat(8)}${trimmed.slice(-4)}` : "";
}
function looksLikeGithubToken(token) {
  if (typeof token != "string") return !1;
  const t = token.trim();
  return t.length < 20 || t.length > 400 || /\s/.test(t) ? !1 : /^(gh[pours]_|github_pat_)[A-Za-z0-9_]+$/.test(t);
}
function getGithubToken(storageApi2) {
  const area = getStorageArea(storageApi2);
  return area ? new Promise((resolve) => {
    area.get([TOKEN_KEY], (result) => {
      const token = result?.[TOKEN_KEY];
      resolve(typeof token == "string" && token.trim() ? token.trim() : null);
    });
  }) : Promise.resolve(null);
}
async function getGithubTokenStatus(storageApi2) {
  const token = await getGithubToken(storageApi2);
  return token ? { configured: !0, mask: maskGithubToken(token) } : { configured: !1, mask: "" };
}
function setGithubToken(token, storageApi2) {
  const area = getStorageArea(storageApi2);
  if (!area) return Promise.reject(new Error("chrome.storage unavailable"));
  const value = typeof token == "string" ? token.trim() : "";
  return new Promise((resolve, reject) => {
    if (!value) {
      area.remove([TOKEN_KEY], () => {
        const err = globalThis.chrome?.runtime?.lastError;
        err ? reject(err) : resolve(!1);
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
      err ? reject(err) : resolve(!0);
    });
  });
}
function watchGithubToken(onChange, storageApi2 = globalThis.chrome?.storage) {
  if (!storageApi2?.onChanged) return () => {
  };
  const listener = (changes, areaName) => {
    if (areaName !== "local" || !changes[TOKEN_KEY]) return;
    const next = changes[TOKEN_KEY].newValue;
    onChange(typeof next == "string" && next.trim() ? next.trim() : null);
  };
  return storageApi2.onChanged.addListener(listener), () => storageApi2.onChanged.removeListener(listener);
}
function getHostAccounts(storageApi2) {
  const area = getStorageArea(storageApi2);
  return area ? new Promise((resolve) => {
    area.get([HOST_ACCOUNTS_KEY], (result) => {
      resolve(normalizeHostAccounts(result?.[HOST_ACCOUNTS_KEY]));
    });
  }) : Promise.resolve([]);
}
async function getHostAccountHosts(storageApi2) {
  const accounts = await getHostAccounts(storageApi2);
  return globalThis.PRGithubEndpoints?.hostsFromAccounts ? globalThis.PRGithubEndpoints.hostsFromAccounts(accounts) : accounts.map((a) => a.host);
}
async function getHostAccountsPublic(storageApi2) {
  return (await getHostAccounts(storageApi2)).map((a) => ({
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
        err ? reject(err) : resolve([]);
      });
      return;
    }
    area.set({ [HOST_ACCOUNTS_KEY]: next }, () => {
      const err = globalThis.chrome?.runtime?.lastError;
      err ? reject(err) : resolve(next);
    });
  });
}
async function registerHostAccount(host, token, storageApi2) {
  const existing = await getHostAccounts(storageApi2), t = typeof token == "string" ? token.trim() : "";
  if (t && !looksLikeGithubToken(t))
    return {
      ok: !1,
      error: "Invalid token format. Use a GitHub PAT (ghp_\u2026 / github_pat_\u2026).",
      accounts: existing
    };
  let result;
  if (globalThis.PRGithubEndpoints?.registerHostAccount)
    result = globalThis.PRGithubEndpoints.registerHostAccount(
      existing,
      host,
      t
    );
  else {
    const h = String(host || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    if (!h || h === "github.com")
      result = {
        ok: !1,
        error: "Host is required",
        accounts: existing
      };
    else if (!t)
      result = {
        ok: !1,
        error: "PAT is required for each enterprise host",
        accounts: existing
      };
    else if (
      // @ts-expect-error classic content-script dynamic shapes
      !existing.some((a) => a.host === h) && // @ts-expect-error classic content-script dynamic shapes
      existing.length >= 3
    )
      result = {
        ok: !1,
        error: "At most 3 enterprise hosts",
        accounts: existing
      };
    else {
      const idx = existing.findIndex((a) => a.host === h);
      result = { ok: !0, accounts: idx >= 0 ? existing.map((a, i) => i === idx ? { host: h, token: t } : a) : [...existing, { host: h, token: t }] };
    }
  }
  return result.ok ? { ok: !0, accounts: await setHostAccounts(result.accounts, storageApi2) } : result;
}
async function unregisterHostAccount(host, storageApi2) {
  const existing = await getHostAccounts(storageApi2);
  let next;
  if (globalThis.PRGithubEndpoints?.unregisterHostAccount)
    next = globalThis.PRGithubEndpoints.unregisterHostAccount(
      existing,
      host
    ).accounts;
  else {
    const h = String(host || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    next = existing.filter((a) => a.host !== h);
  }
  return { ok: !0, accounts: await setHostAccounts(next, storageApi2) };
}
async function getTokenForWebHost(webHost, storageApi2) {
  const [defaultToken, hostAccounts] = await Promise.all([
    getGithubToken(storageApi2),
    getHostAccounts(storageApi2)
  ]);
  if (globalThis.PRGithubEndpoints?.selectTokenForWebHost)
    return globalThis.PRGithubEndpoints.selectTokenForWebHost(webHost, {
      defaultToken,
      hostAccounts
    });
  let host = String(webHost || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/:\d+$/, "");
  if (host || (host = "github.com"), host === "www.github.com" && (host = "github.com"), host === "github.com" || host.endsWith(".github.com"))
    return {
      token: defaultToken,
      source: defaultToken ? "default" : null,
      host: host === "github.com" || host === "www.github.com" ? "github.com" : host
    };
  const pair = hostAccounts.find((a) => a.host === host);
  return pair ? { token: pair.token, source: "host", host } : { token: null, source: null, host };
}
const storageApi = {
  TOKEN_KEY,
  HOST_ACCOUNTS_KEY,
  PREFS_KEY,
  ONBOARDING_KEY,
  RATE_LIMIT_KEY,
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
  getRateLimitState,
  setRateLimitState,
  patchRateLimitState,
  watchRateLimitState,
  getOnboardingCompleted,
  setOnboardingCompleted,
  getHostAccounts,
  getHostAccountHosts,
  getHostAccountsPublic,
  setHostAccounts,
  registerHostAccount,
  unregisterHostAccount,
  getTokenForWebHost
};
typeof module < "u" && module.exports && (module.exports = storageApi), typeof globalThis < "u" && (globalThis.PRTreeStorage = storageApi);
})();


/* ---- fetch-pulls.js ---- */

var __require = /* @__PURE__ */ ((x) => typeof require < "u" ? require : typeof Proxy < "u" ? new Proxy(x, {
  get: (a, b) => (typeof require < "u" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require < "u") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
function normalizeApiCtx(ctx) {
  if (ctx && typeof ctx == "object" && (ctx.restBase || ctx.graphqlUrl))
    return {
      kind: ctx.kind || "custom",
      webHost: ctx.webHost || "github.com",
      webOrigin: ctx.webOrigin || "",
      restBase: String(ctx.restBase || "https://api.github.com").replace(/\/+$/, ""),
      graphqlUrl: String(
        ctx.graphqlUrl || (String(ctx.restBase || "").includes("api.github.com") ? "https://api.github.com/graphql" : "")
      ).replace(/\/+$/, "") || "https://api.github.com/graphql"
    };
  const webHost = typeof ctx == "string" ? ctx : ctx && typeof ctx == "object" && ctx.webHost ? ctx.webHost : "github.com";
  try {
    if (globalThis.PRGithubEndpoints && typeof globalThis.PRGithubEndpoints.resolveGithubEndpoints == "function")
      return globalThis.PRGithubEndpoints.resolveGithubEndpoints({ webHost });
  } catch {
  }
  return {
    kind: "dotcom",
    webHost: "github.com",
    webOrigin: "https://github.com",
    restBase: "https://api.github.com",
    graphqlUrl: "https://api.github.com/graphql"
  };
}
function githubRestUrl(path, ctx) {
  const c = normalizeApiCtx(ctx);
  try {
    if (globalThis.PRGithubEndpoints && typeof globalThis.PRGithubEndpoints.githubRestUrl == "function")
      return globalThis.PRGithubEndpoints.githubRestUrl(path, c);
  } catch {
  }
  const p = String(path || "");
  return /^https?:\/\//i.test(p) ? p : String(c.restBase || "https://api.github.com").replace(/\/+$/, "") + (p.startsWith("/") ? p : "/" + p);
}
function githubGraphqlUrl(ctx) {
  const c = normalizeApiCtx(ctx);
  try {
    if (globalThis.PRGithubEndpoints && typeof globalThis.PRGithubEndpoints.githubGraphqlUrl == "function")
      return globalThis.PRGithubEndpoints.githubGraphqlUrl(c);
  } catch {
  }
  return String(c.graphqlUrl || "https://api.github.com/graphql");
}
function buildApiHeaders(token) {
  const headers = { Accept: "application/vnd.github+json" };
  return token && (headers.Authorization = `Bearer ${token}`), headers;
}
async function mapWithConcurrency(items, limit, worker) {
  if (!items.length) return [];
  const results = new Array(items.length);
  let index = 0;
  async function run() {
    for (; index < items.length; ) {
      const i = index++;
      results[i] = await worker(items[i], i);
    }
  }
  const runners = Array.from({ length: Math.min(limit, items.length) }, run);
  return await Promise.all(runners), results;
}
function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function decodeBase64Utf8(b64) {
  try {
    if (typeof Buffer < "u")
      return Buffer.from(b64, "base64").toString("utf8");
  } catch {
  }
  try {
    const bin = atob(b64), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder("utf-8").decode(bytes);
  } catch {
    return "";
  }
}
async function apiJson(url, fetchImpl, token, opts = {}) {
  const init = { headers: {
    ...buildApiHeaders(token),
    ...opts.headers && typeof opts.headers == "object" ? opts.headers : {}
  } };
  opts.cache && (init.cache = opts.cache);
  const res = await fetchImpl(url, init);
  if (!res.ok) {
    const err = new Error(`GitHub API ${res.status}: ${res.statusText}`);
    throw err.status = res.status, err;
  }
  return res.json();
}
async function apiJsonWithLink(url, fetchImpl, token) {
  const res = await fetchImpl(url, { headers: buildApiHeaders(token) });
  if (!res.ok) {
    const err = new Error(`GitHub API ${res.status}: ${res.statusText}`);
    throw err.status = res.status, err;
  }
  const data = await res.json();
  let link = "";
  try {
    typeof res.headers?.get == "function" && (link = res.headers.get("link") || res.headers.get("Link") || "");
  } catch {
    link = "";
  }
  return { data, link };
}
function parseLinkNextUrl(linkHeader) {
  if (!linkHeader) return null;
  const parts = String(linkHeader).split(",");
  for (const p of parts) {
    const m = p.match(/<([^>]+)>\s*;\s*rel="?next"?/i);
    if (m) return m[1].trim();
  }
  return null;
}
function parseLinkRelPage(linkHeader, rel) {
  const raw = String(linkHeader || "");
  if (!raw || !rel) return null;
  const re = new RegExp(`rel="?${rel}"?`, "i"), parts = raw.split(",");
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
async function fetchRestCollectionAll(firstUrl, fetchImpl, token, opts = {}) {
  const maxPages = Number.isFinite(opts.maxPages) && opts.maxPages > 0 ? Math.floor(opts.maxPages) : 50, all = [];
  let url = firstUrl, pages = 0;
  for (; url && pages < maxPages; ) {
    pages += 1;
    const { data, link } = await apiJsonWithLink(url, fetchImpl, token);
    if (!Array.isArray(data) || (all.push(...data), data.length === 0)) break;
    url = parseLinkNextUrl(link);
  }
  return all;
}
async function apiSend(url, fetchImpl, token, opts = {}) {
  const method = opts?.method || "GET", body = opts?.body, headers = buildApiHeaders(token);
  body != null && (headers["Content-Type"] = "application/json");
  const res = await fetchImpl(url, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : void 0
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const j = await res.json();
      if (j?.message && (detail = j.message), Array.isArray(j?.errors) && j.errors.length) {
        const bits = j.errors.map((e) => {
          if (!e || typeof e != "object") return String(e);
          if (e.message) return e.message;
          const field = e.field || e.resource || "", code = e.code || "";
          return [field, code].filter(Boolean).join(" ") || null;
        }).filter(Boolean);
        bits.length && (detail = `${detail}: ${bits.join("; ")}`);
      }
    } catch {
    }
    const err = new Error(`GitHub API ${res.status}: ${detail}`);
    throw err.status = res.status, err;
  }
  return res.status === 204 ? null : res.json();
}
var GQL_COST_LOG_MAX = 400, gqlCostLogEntries = [], gqlCostHeaderUsedPrev = null;
function graphqlCostPure() {
  try {
    return typeof globalThis < "u" && globalThis.PRModalGraphqlCostLog || null;
  } catch {
    return null;
  }
}
function injectRateLimitCostFieldLocal(query) {
  const pure = graphqlCostPure();
  if (typeof pure?.injectRateLimitCostField == "function")
    return pure.injectRateLimitCostField(query);
  const q = String(query || "");
  if (!q.trim() || /rateLimit\s*\{/.test(q) || /\bmutation\b/i.test(q)) return q;
  const trimmed = q.replace(/\s+$/, ""), lastBrace = trimmed.lastIndexOf("}");
  return lastBrace < 0 ? q : trimmed.slice(0, lastBrace) + `
  rateLimit { cost remaining used limit resetAt }
` + trimmed.slice(lastBrace);
}
function labelGraphqlOperationLocal(query, variables = null) {
  const pure = graphqlCostPure();
  if (typeof pure?.labelGraphqlOperation == "function")
    return pure.labelGraphqlOperation(query, variables);
  const q = String(query || ""), named = q.match(/\b(query|mutation)\s+([A-Za-z_][A-Za-z0-9_]*)/);
  return named?.[2] ? named[2] : /reviewThreads/.test(q) ? "reviewThreads" : /\bmutation\b/.test(q) ? "mutation" : "query";
}
function sanitizeGraphqlVariablesLocal(variables) {
  const pure = graphqlCostPure();
  return typeof pure?.sanitizeGraphqlVariables == "function" ? pure.sanitizeGraphqlVariables(variables) : {};
}
function summarizeGraphqlCostLogLocal(entries = gqlCostLogEntries) {
  const pure = graphqlCostPure();
  if (typeof pure?.summarizeGraphqlCostEntries == "function")
    return pure.summarizeGraphqlCostEntries(entries);
  const list = Array.isArray(entries) ? entries : [], map = /* @__PURE__ */ new Map();
  let totalCost = 0, unknownCostCalls = 0;
  for (const e of list) {
    const op = String(e?.op || "unknown"), cost = e?.cost != null && Number.isFinite(Number(e.cost)) ? Number(e.cost) : null, ms = e?.ms != null && Number.isFinite(Number(e.ms)) ? Number(e.ms) : 0;
    map.has(op) || map.set(op, {
      op,
      calls: 0,
      cost: 0,
      maxCost: 0,
      msSum: 0,
      knownCostCalls: 0
    });
    const row = map.get(op);
    row.calls += 1, row.msSum += ms, cost != null ? (row.cost += cost, row.knownCostCalls += 1, row.maxCost = Math.max(row.maxCost, cost), totalCost += cost) : unknownCostCalls += 1;
  }
  const byOp = [...map.values()].map((r) => ({
    op: r.op,
    calls: r.calls,
    cost: r.cost,
    avgCost: r.knownCostCalls > 0 ? Math.round(r.cost / r.knownCostCalls * 100) / 100 : 0,
    maxCost: r.maxCost,
    avgMs: r.calls > 0 ? Math.round(r.msSum / r.calls) : 0
  })).sort((a, b) => b.cost - a.cost || b.calls - a.calls);
  return {
    totalCalls: list.length,
    totalCost,
    unknownCostCalls,
    byOp
  };
}
function headerInt(headers, name) {
  if (!headers || typeof headers.get != "function") return null;
  try {
    const v = headers.get(name) ?? headers.get(name.toLowerCase()) ?? headers.get(name.toUpperCase());
    if (v == null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}
function recordGraphqlCostEntry(entry) {
  const row = {
    t: Date.now(),
    op: String(entry?.op || "unknown"),
    cost: entry?.cost != null && Number.isFinite(Number(entry.cost)) ? Number(entry.cost) : null,
    costSource: entry?.costSource || null,
    remaining: entry?.remaining != null && Number.isFinite(Number(entry.remaining)) ? Number(entry.remaining) : null,
    used: entry?.used != null && Number.isFinite(Number(entry.used)) ? Number(entry.used) : null,
    ms: entry?.ms != null && Number.isFinite(Number(entry.ms)) ? Math.round(Number(entry.ms)) : null,
    ok: entry?.ok !== !1,
    err: entry?.err ? String(entry.err).slice(0, 160) : null,
    vars: entry?.vars && typeof entry.vars == "object" ? entry.vars : {}
  };
  for (gqlCostLogEntries.push(row); gqlCostLogEntries.length > GQL_COST_LOG_MAX; ) gqlCostLogEntries.shift();
  const costStr = row.cost != null ? String(row.cost) : "?", remStr = row.remaining != null ? String(row.remaining) : "?";
  return row;
}
function getGraphqlCostLog() {
  return gqlCostLogEntries.slice();
}
function clearGraphqlCostLog() {
  gqlCostLogEntries.length = 0, gqlCostHeaderUsedPrev = null;
}
function summarizeGraphqlCostLog() {
  return summarizeGraphqlCostLogLocal(gqlCostLogEntries);
}
async function apiGraphql(query, variables, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const op = labelGraphqlOperationLocal(query, variables), vars = sanitizeGraphqlVariablesLocal(variables), q = injectRateLimitCostFieldLocal(query), t0 = typeof performance < "u" && performance.now ? performance.now() : Date.now(), url = githubGraphqlUrl(ctx), headers = buildApiHeaders(token);
  headers["Content-Type"] = "application/json";
  let res, json = null;
  try {
    res = await fetchImpl(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ query: q, variables: variables || {} })
    });
  } catch (err) {
    const ms2 = (typeof performance < "u" && performance.now ? performance.now() : Date.now()) - t0;
    throw recordGraphqlCostEntry({
      op,
      cost: null,
      ms: ms2,
      ok: !1,
      err: err?.message || err,
      vars
    }), err;
  }
  const hdrRemaining = headerInt(res?.headers, "x-ratelimit-remaining"), hdrUsed = headerInt(res?.headers, "x-ratelimit-used"), hdrLimit = headerInt(res?.headers, "x-ratelimit-limit");
  try {
    json = await res.json();
  } catch (err) {
    const ms2 = (typeof performance < "u" && performance.now ? performance.now() : Date.now()) - t0;
    throw recordGraphqlCostEntry({
      op,
      cost: null,
      remaining: hdrRemaining,
      used: hdrUsed,
      ms: ms2,
      ok: !1,
      err: err?.message || "invalid json",
      vars
    }), err;
  }
  const ms = (typeof performance < "u" && performance.now ? performance.now() : Date.now()) - t0, bodyRl = json?.data?.rateLimit || null;
  let cost = bodyRl?.cost != null && Number.isFinite(Number(bodyRl.cost)) ? Number(bodyRl.cost) : null, costSource = cost != null ? "body.rateLimit.cost" : null;
  if (cost == null && hdrUsed != null && gqlCostHeaderUsedPrev != null) {
    const delta = hdrUsed - gqlCostHeaderUsedPrev;
    delta >= 0 && delta < 5e3 && (cost = delta, costSource = "header.used-delta");
  }
  hdrUsed != null && (gqlCostHeaderUsedPrev = hdrUsed);
  const remaining = bodyRl?.remaining != null && Number.isFinite(Number(bodyRl.remaining)) ? Number(bodyRl.remaining) : hdrRemaining, used = bodyRl?.used != null && Number.isFinite(Number(bodyRl.used)) ? Number(bodyRl.used) : hdrUsed;
  if (!res.ok) {
    recordGraphqlCostEntry({
      op,
      cost,
      costSource,
      remaining,
      used,
      ms,
      ok: !1,
      err: `HTTP ${res.status}`,
      vars
    });
    const err = new Error(
      `GitHub GraphQL HTTP ${res.status}: ${res.statusText || ""}`
    );
    throw err.status = res.status, err;
  }
  if (json?.errors?.length) {
    const msg = json.errors.map((e) => e?.message || String(e)).filter(Boolean).join("; ");
    recordGraphqlCostEntry({
      op,
      cost,
      costSource,
      remaining,
      used,
      ms,
      ok: !1,
      err: msg || "graphql errors",
      vars
    });
    const err = new Error(`GitHub GraphQL: ${msg || "unknown error"}`);
    throw err.graphqlErrors = json.errors, err.status = 200, err;
  }
  return recordGraphqlCostEntry({
    op,
    cost,
    costSource,
    remaining,
    used,
    limit: bodyRl?.limit != null ? Number(bodyRl.limit) : hdrLimit,
    ms,
    ok: !0,
    vars
  }), json?.data ?? null;
}
function fetchNowMs() {
  return typeof performance < "u" && typeof performance.now == "function" ? performance.now() : Date.now();
}
async function timedFetch(timings, name, promise, extra = void 0, opts = {}) {
  const t0 = fetchNowMs(), batchStart = opts && Number.isFinite(opts.batchStart) ? Number(opts.batchStart) : null;
  batchStart != null && (timings[`${name}_start`] = Math.round(t0 - batchStart));
  try {
    const result = await promise, ms = Math.round(fetchNowMs() - t0);
    timings[name] = ms;
    let suffix = "";
    try {
      typeof extra == "function" && (suffix = extra(result) || "");
    } catch {
    }
    const startLabel = batchStart != null && timings[`${name}_start`] != null ? ` t+${timings[`${name}_start`]}ms` : "";
    return result;
  } catch (err) {
    const ms = Math.round(fetchNowMs() - t0);
    timings[name] = ms;
    const msg = err?.message || String(err);
    timings[`${name}_error`] = msg;
    const startLabel = batchStart != null && timings[`${name}_start`] != null ? ` t+${timings[`${name}_start`]}ms` : "";
    throw err;
  }
}
function logParallelRestSummary(timings, names, wallMs) {
  const rows = (Array.isArray(names) ? names : []).map((name) => {
    const ms = Number(timings[name]), start = Number(timings[`${name}_start`]), err = timings[`${name}_error`];
    return {
      name,
      ms: Number.isFinite(ms) ? ms : null,
      start: Number.isFinite(start) ? start : null,
      error: err ? String(err) : null
    };
  }).filter((r) => r.ms != null);
  rows.sort((a, b) => (b.ms || 0) - (a.ms || 0));
  const slowest = rows[0], sum = rows.reduce((s, r) => s + (r.ms || 0), 0), lines = rows.map((r) => {
    const bar = wallMs > 0 && r.ms != null ? "\u2588".repeat(Math.max(1, Math.round(r.ms / wallMs * 20))) : "", start = r.start != null ? `+${r.start}ms`.padStart(7) : "   n/a", dur = r.ms != null ? `${r.ms}ms`.padStart(6) : "   n/a", err = r.error ? ` ERR:${r.error.slice(0, 40)}` : "";
    return `  ${r.name.padEnd(16)} start${start}  dur${dur}  ${bar}${err}`;
  });
  timings.coreParallel = {
    wallMs: Math.round(wallMs),
    sumMs: sum,
    slowest: slowest ? { name: slowest.name, ms: slowest.ms } : null,
    byName: Object.fromEntries(rows.map((r) => [r.name, r.ms]))
  };
}
function sleepMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms || 0)));
}
function mapApiPullRequest(pr) {
  const author = pr.user?.login || "", authorAvatarUrl = pr.user?.avatar_url || "", labels = Array.isArray(pr.labels) ? pr.labels.map((l) => ({
    name: l?.name || String(l || ""),
    color: l?.color || "",
    description: l?.description || ""
  })).filter((l) => l.name) : [], assignees = Array.isArray(pr.assignees) ? pr.assignees.map((u) => u?.login || u).filter(Boolean) : [], requestedReviewers = Array.isArray(pr.requested_reviewers) ? pr.requested_reviewers.map((u) => u?.login || u).filter(Boolean) : [], avatarUrls = {}, putUser = (u) => {
    const login = u?.login || (typeof u == "string" ? u : ""), url = u?.avatar_url || "";
    login && url && (avatarUrls[String(login).toLowerCase()] = url);
  };
  putUser(pr.user);
  for (const u of pr.assignees || []) putUser(u);
  for (const u of pr.requested_reviewers || []) putUser(u);
  const milestone = pr.milestone ? {
    number: pr.milestone.number,
    title: pr.milestone.title || "",
    state: pr.milestone.state || "",
    dueOn: pr.milestone.due_on || null
  } : null;
  return {
    number: pr.number,
    title: pr.title,
    // Body required so attachMagicLinks/prMatchText can match description tokens
    body: pr.body || "",
    headRef: pr.head?.ref || "",
    baseRef: pr.base?.ref || "",
    author,
    authorAvatarUrl,
    draft: !!pr.draft,
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
    // Official PR review-comment count (not thread count). Used to skip GraphQL
    // escalate when 0 and to size REST windows.
    reviewCommentsCount: pr.review_comments != null && Number.isFinite(Number(pr.review_comments)) ? Number(pr.review_comments) : null,
    nodeId: pr.node_id || null
  };
}
function mapPrCommitRow(c) {
  return {
    sha: c?.sha || "",
    message: c?.commit?.message || c?.message || "",
    author: c?.commit?.author?.name || c?.author?.login || c?.author || "",
    date: c?.commit?.author?.date || c?.commit?.committer?.date || c?.date || ""
  };
}
function commentsPageHelpers() {
  try {
    let mod = typeof globalThis < "u" ? globalThis.PRModalCommentsPage : null;
    if (!mod && typeof __require == "function")
      try {
        mod = __require("./modal/pure/comments-page.js");
      } catch {
        mod = null;
      }
    return mod;
  } catch {
    return null;
  }
}
function mapRestReactions(raw) {
  const DEFS = [
    "+1",
    "-1",
    "laugh",
    "hooray",
    "confused",
    "heart",
    "rocket",
    "eyes"
  ];
  if (!raw || typeof raw != "object") return [];
  const out = [];
  for (const content of DEFS) {
    const count = Number(raw[content]) || 0;
    count <= 0 || out.push({ content, count, viewerHasReacted: !1, users: [] });
  }
  return out;
}
var GQL_REACTION_TO_REST = {
  THUMBS_UP: "+1",
  THUMBS_DOWN: "-1",
  LAUGH: "laugh",
  HOORAY: "hooray",
  CONFUSED: "confused",
  HEART: "heart",
  ROCKET: "rocket",
  EYES: "eyes",
  "+1": "+1",
  "-1": "-1",
  laugh: "laugh",
  hooray: "hooray",
  confused: "confused",
  heart: "heart",
  rocket: "rocket",
  eyes: "eyes"
};
function extractReactorLogins(reactors) {
  const nodes = reactors?.nodes || [], out = [], seen = /* @__PURE__ */ new Set();
  for (const n of Array.isArray(nodes) ? nodes : []) {
    const login = String(n?.login || "").trim();
    if (!login) continue;
    const key = login.toLowerCase();
    seen.has(key) || (seen.add(key), out.push(login));
  }
  return out;
}
function mapGraphqlReactionGroups(groups) {
  if (!Array.isArray(groups)) return [];
  const order = [
    "+1",
    "-1",
    "laugh",
    "hooray",
    "confused",
    "heart",
    "rocket",
    "eyes"
  ], by = /* @__PURE__ */ new Map();
  for (const g of groups) {
    if (!g) continue;
    const content = GQL_REACTION_TO_REST[String(g.content || "").toUpperCase()] || GQL_REACTION_TO_REST[String(g.content || "")] || null;
    if (!content) continue;
    const users = extractReactorLogins(g.reactors), count = Number(
      g.reactors?.totalCount ?? g.users?.totalCount ?? users.length ?? 0
    ), viewerHasReacted = !!g.viewerHasReacted;
    count <= 0 && !viewerHasReacted || by.set(content, {
      content,
      count: Math.max(0, count, users.length),
      viewerHasReacted,
      users
    });
  }
  return order.map((c) => by.get(c)).filter(Boolean);
}
function mapIssueComment(c) {
  return {
    id: c.id,
    author: c.user?.login || "",
    avatarUrl: c.user?.avatar_url || "",
    body: c.body || "",
    createdAt: c.created_at,
    nodeId: c.node_id || null,
    reactions: mapRestReactions(c.reactions)
  };
}
function mapReviewComment(c, extra = {}) {
  const subjectTypeRaw = String(
    extra.subjectType || c.subject_type || c.subjectType || ""
  ).toLowerCase(), isFileSubject = subjectTypeRaw === "file", line = isFileSubject ? null : c.line ?? c.original_line ?? (c.position != null && Number.isFinite(Number(c.position)) ? Number(c.position) : null), outdated = extra.outdated != null ? !!extra.outdated : c.outdated != null ? !!c.outdated : !isFileSubject && c.line == null && c.original_line != null, subjectType = isFileSubject || line == null && !c.original_line && c.path && subjectTypeRaw !== "line" ? "file" : "line";
  return {
    id: c.id,
    author: c.user?.login || "",
    avatarUrl: c.user?.avatar_url || "",
    body: c.body || "",
    path: c.path || "",
    line: line != null ? Number(line) : null,
    originalLine: subjectType === "file" ? null : c.original_line ?? null,
    startLine: subjectType === "file" ? null : c.start_line ?? null,
    side: c.side || "RIGHT",
    startSide: c.start_side || null,
    diffHunk: c.diff_hunk || c.diffHunk || "",
    createdAt: c.created_at,
    inReplyToId: c.in_reply_to_id ?? null,
    nodeId: c.node_id || null,
    reactions: mapRestReactions(c.reactions),
    threadNodeId: extra.threadNodeId ?? null,
    /** Pull request review id (groups file threads under one review event). */
    reviewId: c.pull_request_review_id != null ? Number(c.pull_request_review_id) : extra.reviewId != null ? Number(extra.reviewId) : null,
    resolved: !!extra.resolved,
    outdated,
    /** True when part of a not-yet-submitted PENDING review (hidden from main list). */
    pending: !!(extra.pending || c.pending),
    pendingReviewId: extra.pendingReviewId ?? c.pendingReviewId ?? null,
    /** `file` | `line` — file-level comments have no line anchor. */
    subjectType
  };
}
function mapGraphqlReviewCommentNode(node, threadMeta = {}) {
  if (!node) return null;
  const id = node.databaseId ?? null;
  if (id == null) return null;
  const pending = String(node.pullRequestReview?.state || "").toUpperCase() === "PENDING", reviewDbId = node.pullRequestReview?.databaseId != null ? Number(node.pullRequestReview.databaseId) : null, isFile = String(
    threadMeta.subjectType || node.subjectType || ""
  ).toUpperCase() === "FILE", line = isFile ? null : node.line != null ? Number(node.line) : node.originalLine != null ? Number(node.originalLine) : null, sideRaw = threadMeta.diffSide || threadMeta.side || "RIGHT", side = String(sideRaw).toUpperCase() === "LEFT" ? "LEFT" : "RIGHT";
  return {
    id: Number(id),
    author: node.author?.login || "",
    avatarUrl: node.author?.avatarUrl || "",
    body: node.body || "",
    path: node.path || threadMeta.path || "",
    line,
    originalLine: isFile ? null : node.originalLine ?? null,
    startLine: isFile ? null : node.startLine ?? node.originalStartLine ?? null,
    side,
    startSide: threadMeta.startDiffSide || null,
    diffHunk: node.diffHunk || "",
    createdAt: node.createdAt || null,
    inReplyToId: node.replyTo?.databaseId ?? null,
    nodeId: node.id || null,
    reactions: mapGraphqlReactionGroups(node.reactionGroups),
    threadNodeId: threadMeta.threadNodeId || null,
    reviewId: reviewDbId,
    resolved: !!threadMeta.resolved,
    outdated: !!(node.outdated ?? threadMeta.isOutdated),
    pending,
    pendingReviewId: pending ? reviewDbId : null,
    subjectType: isFile ? "file" : "line"
  };
}
function extractRepoMergeMethodFlags(repo) {
  if (!repo || typeof repo != "object" || !(Object.prototype.hasOwnProperty.call(repo, "allow_merge_commit") || Object.prototype.hasOwnProperty.call(repo, "allow_squash_merge") || Object.prototype.hasOwnProperty.call(repo, "allow_rebase_merge"))) return null;
  const flag = (v) => v === !0 || v === !1 ? v : null;
  return {
    allowMergeCommit: flag(repo.allow_merge_commit),
    allowSquashMerge: flag(repo.allow_squash_merge),
    allowRebaseMerge: flag(repo.allow_rebase_merge)
  };
}
function extractViewerCanMergeAsAdmin(repo) {
  if (!repo || typeof repo != "object") return null;
  const p = repo.permissions;
  return !p || typeof p != "object" ? null : p.admin === !0 ? !0 : p.admin === !1 ? !1 : null;
}
function mapGraphqlReviewCommentToRest(c, fallback = {}) {
  return c ? {
    id: c.databaseId ?? fallback.id ?? null,
    node_id: c.id || null,
    body: c.body || fallback.body || "",
    path: c.path || fallback.path || "",
    line: c.line ?? fallback.line ?? null,
    original_line: c.originalLine ?? null,
    start_line: c.startLine ?? fallback.startLine ?? null,
    side: c.side || fallback.side || "RIGHT",
    start_side: c.startSide || null,
    diff_hunk: c.diffHunk || "",
    created_at: c.createdAt || fallback.createdAt || null,
    in_reply_to_id: c.replyTo?.databaseId ?? c.replyTo?.id ?? fallback.inReplyToId ?? fallback.in_reply_to_id ?? null,
    user: {
      login: c.author?.login || fallback.author || "",
      avatar_url: c.author?.avatarUrl || fallback.avatarUrl || ""
    },
    pull_request_review_id: c.pullRequestReview?.databaseId ?? null
  } : null;
}
function mapViewerSubscription(state) {
  const s = String(state || "").toUpperCase();
  return s === "SUBSCRIBED" ? { subscribed: !0, ignored: !1, viewerSubscription: s } : s === "IGNORED" ? { subscribed: !1, ignored: !0, viewerSubscription: s } : s === "UNSUBSCRIBED" ? { subscribed: !1, ignored: !1, viewerSubscription: s } : { subscribed: null, ignored: !1, viewerSubscription: s || null };
}
function mapAndAnnotateFiles(files, gitattributesText = "") {
  const mappedFiles = (Array.isArray(files) ? files : []).map((f) => ({
    filename: f.filename,
    status: f.status,
    additions: f.additions,
    deletions: f.deletions,
    changes: f.changes,
    patch: f.patch || "",
    // Preserve media URLs for image preview / binary classification
    raw_url: f.raw_url || f.rawUrl || "",
    blob_url: f.blob_url || f.blobUrl || "",
    contents_url: f.contents_url || f.contentsUrl || "",
    sha: f.sha || "",
    previous_filename: f.previous_filename || f.previousFilename || ""
  }));
  let filesOut;
  try {
    let collapse = typeof globalThis < "u" ? globalThis.PRModalCollapse : null;
    if (!collapse && typeof __require == "function")
      try {
        collapse = __require("./modal/pure/collapse.js");
      } catch {
        collapse = null;
      }
    collapse?.annotateFilesForCollapse && (filesOut = collapse.annotateFilesForCollapse(mappedFiles, gitattributesText));
  } catch {
    filesOut = null;
  }
  return filesOut || (filesOut = mappedFiles.map((f) => {
    const path = f.filename || "", isImage = /\.(png|jpe?g|gif|webp|bmp|svg|ico|avif)$/i.test(path), hasPatch = !!f.patch, kind = isImage ? "image" : hasPatch ? "text" : "binary";
    return {
      ...f,
      fileKind: kind,
      openableAsText: kind === "text",
      renderImage: kind === "image",
      defaultCollapsed: kind === "binary" || (f.changes || 0) >= 5e3 || /package-lock\.json$|yarn\.lock$|\.min\.(js|css)$|\.bundle\.js$/i.test(
        path
      )
    };
  })), filesOut;
}
var REST_TO_GQL_REACTION = {
  "+1": "THUMBS_UP",
  "-1": "THUMBS_DOWN",
  laugh: "LAUGH",
  hooray: "HOORAY",
  confused: "CONFUSED",
  heart: "HEART",
  rocket: "ROCKET",
  eyes: "EYES"
};
async function fetchViewerViewedPaths(owner, repo, pullNumber, fetchImpl, token, opts = {}) {
  const apiCtx = normalizeApiCtx(opts?.ctx);
  if (!token)
    return { pullRequestId: null, viewedPaths: [], unauthorized: !0 };
  const maxPages = Math.max(1, Math.min(20, Number(opts.maxPages) || 5)), viewed = [];
  let cursor = null, pullRequestId = null;
  for (let page = 0; page < maxPages; page++) {
    const pr = (await apiGraphql(
      `query ViewerViewedFiles($owner:String!,$repo:String!,$number:Int!,$cursor:String) {
  repository(owner:$owner, name:$repo) {
    pullRequest(number:$number) {
      id
      files(first:100, after:$cursor) {
        pageInfo { hasNextPage endCursor }
        nodes { path viewerViewedState }
      }
    }
  }
}`,
      {
        owner: String(owner || ""),
        repo: String(repo || ""),
        number: Number(pullNumber) || 0,
        cursor
      },
      fetchImpl,
      token,
      apiCtx
    ))?.repository?.pullRequest;
    if (!pr) break;
    pr.id && (pullRequestId = String(pr.id));
    const nodes = pr.files?.nodes || [];
    for (const n of nodes)
      String(n?.viewerViewedState || "").toUpperCase() === "VIEWED" && n?.path && viewed.push(String(n.path));
    if (!pr.files?.pageInfo?.hasNextPage || (cursor = pr.files.pageInfo.endCursor || null, !cursor)) break;
  }
  return { pullRequestId, viewedPaths: viewed };
}
async function markFileAsViewed(pullRequestId, path, fetchImpl, token, ctx = null) {
  return ctx = normalizeApiCtx(ctx), await apiGraphql(
    `mutation MarkFileAsViewed($input: MarkFileAsViewedInput!) {
  markFileAsViewed(input: $input) {
    pullRequest { id }
  }
}`,
    {
      input: {
        pullRequestId: String(pullRequestId || ""),
        path: String(path || "")
      }
    },
    fetchImpl,
    token,
    ctx
  );
}
async function unmarkFileAsViewed(pullRequestId, path, fetchImpl, token, ctx = null) {
  return ctx = normalizeApiCtx(ctx), await apiGraphql(
    `mutation UnmarkFileAsViewed($input: UnmarkFileAsViewedInput!) {
  unmarkFileAsViewed(input: $input) {
    pullRequest { id }
  }
}`,
    {
      input: {
        pullRequestId: String(pullRequestId || ""),
        path: String(path || "")
      }
    },
    fetchImpl,
    token,
    ctx
  );
}
async function resolvePullRequestNodeId(owner, repo, pullNumber, fetchImpl, token, nodeId = null, ctx = null) {
  if (ctx = normalizeApiCtx(ctx), nodeId) return String(nodeId);
  const n = Number(pullNumber);
  if (!token || !owner || !repo || !Number.isFinite(n) || n <= 0) return null;
  try {
    const pr = await apiJson(
      githubRestUrl(`/repos/${owner}/${repo}/pulls/${n}`, ctx),
      fetchImpl,
      token
    );
    if (pr?.node_id) return String(pr.node_id);
  } catch {
  }
  try {
    const id = (await apiGraphql(
      `query($owner:String!,$name:String!,$number:Int!){
  repository(owner:$owner, name:$name) {
    pullRequest(number:$number) { id }
  }
}`,
      { owner: String(owner), name: String(repo), number: n },
      fetchImpl,
      token,
      ctx
    ))?.repository?.pullRequest?.id;
    return id ? String(id) : null;
  } catch {
    return null;
  }
}
async function setIssueSubscription(owner, repo, issueNumber, { subscribed = !0, ignored = !1, nodeId = null } = {}, fetchImpl, token, ctx = null) {
  if (ctx = normalizeApiCtx(ctx), !token) throw new Error("GitHub PAT required for notifications");
  const id = await resolvePullRequestNodeId(
    owner,
    repo,
    issueNumber,
    fetchImpl,
    token,
    nodeId,
    ctx
  );
  if (!id)
    throw new Error(
      "Could not resolve pull request id for subscription. Refresh and try again."
    );
  const state = ignored ? "IGNORED" : subscribed ? "SUBSCRIBED" : "UNSUBSCRIBED", vs = (await apiGraphql(
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
  ))?.updateSubscription?.subscribable?.viewerSubscription;
  return mapViewerSubscription(vs);
}
async function deleteIssueSubscription(owner, repo, issueNumber, fetchImpl, token, nodeId = null) {
  return setIssueSubscription(
    owner,
    repo,
    issueNumber,
    { subscribed: !1, ignored: !1, nodeId },
    fetchImpl,
    token
  );
}
async function fetchPullRequestSubscription(owner, repo, pullNumber, fetchImpl, token, nodeId = null, ctx = null) {
  if (ctx = normalizeApiCtx(ctx), !token) return null;
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
    const node = (await apiGraphql(
      `query($id:ID!){
  node(id:$id) {
    ... on PullRequest {
      viewerSubscription
      viewerCanSubscribe
      mergeStateStatus
    }
    ... on Issue { viewerSubscription viewerCanSubscribe }
  }
}`,
      { id: String(id) },
      fetchImpl,
      token,
      ctx
    ))?.node || null, vs = node?.viewerSubscription;
    if (!vs)
      return node?.mergeStateStatus ? {
        subscribed: null,
        mergeStateStatus: String(node.mergeStateStatus || "") || null
      } : null;
    const mapped = mapViewerSubscription(vs);
    return node?.mergeStateStatus ? {
      ...mapped,
      mergeStateStatus: String(node.mergeStateStatus || "") || null
    } : mapped;
  } catch {
    return null;
  }
}
async function uploadRepoFile(owner, repo, { path, contentBase64, message, branch }, fetchImpl, token, ctx = null) {
  if (ctx = normalizeApiCtx(ctx), !path || !contentBase64) throw new Error("path and contentBase64 required");
  const encPath = String(path).split("/").map(encodeURIComponent).join("/");
  let sha;
  try {
    sha = (await apiJson(
      githubRestUrl(
        `/repos/${owner}/${repo}/contents/${encPath}${branch ? `?ref=${encodeURIComponent(branch)}` : ""}`,
        ctx
      ),
      fetchImpl,
      token
    ))?.sha;
  } catch {
    sha = void 0;
  }
  const body = {
    message: message || `Upload ${path}`,
    content: String(contentBase64).replace(/\s+/g, "")
  };
  branch && (body.branch = branch), sha && (body.sha = sha);
  const result = await apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/contents/${encPath}`, ctx),
    fetchImpl,
    token,
    { method: "PUT", body }
  ), content = result?.content || result;
  return {
    downloadUrl: content?.download_url || content?.html_url || "",
    htmlUrl: content?.html_url || content?.download_url || "",
    path: content?.path || path,
    sha: content?.sha || ""
  };
}
async function getRepoFileText(owner, repo, { path, ref }, fetchImpl, token, ctx = null) {
  if (ctx = normalizeApiCtx(ctx), !path) throw new Error("path required");
  const rev = ref || "HEAD", encPath = String(path).split("/").map(encodeURIComponent).join("/"), meta = await apiJson(
    githubRestUrl(`/repos/${owner}/${repo}/contents/${encPath}?ref=${encodeURIComponent(rev)}`, ctx),
    fetchImpl,
    token
  );
  if (meta?.type && meta.type !== "file")
    throw new Error(`Not a file: ${path}`);
  let raw = "";
  if (meta?.content && meta?.encoding === "base64")
    raw = decodeBase64Utf8(String(meta.content).replace(/\n/g, ""));
  else if (meta?.download_url) {
    const res = await fetchImpl(meta.download_url, {
      headers: buildApiHeaders(token)
    });
    if (!res.ok) {
      const err = new Error(`GitHub download ${res.status}: ${res.statusText}`);
      throw err.status = res.status, err;
    }
    raw = await res.text();
  } else meta?.content && (raw = decodeBase64Utf8(String(meta.content).replace(/\n/g, "")));
  return {
    path: meta?.path || path,
    ref: rev,
    text: raw,
    sha: meta?.sha || "",
    size: Number(meta?.size) || raw.length
  };
}
async function applyReviewSuggestion(owner, repo, { path, headRef, startLine, endLine, suggestion, message }, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const ref = headRef || "HEAD", file = await getRepoFileText(
    owner,
    repo,
    { path, ref },
    fetchImpl,
    token
  ), raw = file.text || "";
  let applyFn = null;
  try {
    let mod = typeof globalThis < "u" ? globalThis.PRModalPrEditApi : null;
    if (!mod && typeof __require == "function")
      try {
        mod = __require("./modal/pure/pr-edit-api.js");
      } catch {
        mod = null;
      }
    applyFn = mod?.applySuggestionToFileContent;
  } catch {
    applyFn = null;
  }
  if (!applyFn) throw new Error("applySuggestionToFileContent unavailable");
  const next = applyFn(raw, {
    startLine,
    endLine,
    suggestion
  });
  let contentB64;
  return typeof Buffer < "u" ? contentB64 = Buffer.from(next, "utf8").toString("base64") : contentB64 = btoa(unescape(encodeURIComponent(next))), apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/contents/${path.split("/").map(encodeURIComponent).join("/")}`, ctx),
    fetchImpl,
    token,
    {
      method: "PUT",
      body: {
        message: message || `Apply suggestion to ${path}`,
        content: contentB64,
        branch: ref,
        sha: file.sha
      }
    }
  );
}
async function fetchViewerLogin(fetchImpl, token, ctx = null) {
  if (ctx = normalizeApiCtx(ctx), !token) return null;
  try {
    return (await apiJson(githubRestUrl("/user", ctx), fetchImpl, token))?.login || null;
  } catch {
    return null;
  }
}
async function fetchReactableReactionGroups(nodeIds, fetchImpl, token, ctx = null, opts = null) {
  ctx = normalizeApiCtx(ctx);
  const ids = [
    ...new Set(
      (Array.isArray(nodeIds) ? nodeIds : []).map((id) => String(id || "").trim()).filter(Boolean)
    )
  ].slice(0, 100), out = /* @__PURE__ */ new Map();
  if (!ids.length || !token) return out;
  const reactorsFirst = Math.max(
    0,
    Math.min(20, Number(opts?.reactorsFirst) || 0)
  ), query = `query($ids:[ID!]!){
    nodes(ids:$ids){
      ... on Reactable {
        id
        reactionGroups {
          content
          viewerHasReacted
          ${reactorsFirst > 0 ? `reactors(first:${reactorsFirst}){
            totalCount
            nodes{
              ... on User { login }
              ... on Bot { login }
            }
          }` : "reactors { totalCount }"}
        }
      }
    }
  }`;
  try {
    const data = await apiGraphql(query, { ids }, fetchImpl, token, ctx);
    for (const node of data?.nodes || [])
      node?.id && out.set(String(node.id), mapGraphqlReactionGroups(node.reactionGroups));
  } catch {
  }
  return out;
}
async function fetchReactableReactors(nodeId, fetchImpl, token, ctx = null, opts = null) {
  ctx = normalizeApiCtx(ctx);
  const id = String(nodeId || "").trim();
  if (!id || !token) return [];
  const first = Math.max(1, Math.min(10, Number(opts?.first) || 5));
  return (await fetchReactableReactionGroups(
    [id],
    fetchImpl,
    token,
    ctx,
    { reactorsFirst: first }
  )).get(id) || [];
}
async function toggleCommentReaction(owner, repo, kind, opts, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const content = String(opts?.content || "").trim(), gqlContent = REST_TO_GQL_REACTION[content];
  if (!gqlContent)
    throw new Error(`Unsupported reaction: ${content || "(empty)"}`);
  const nodeId = String(opts?.nodeId || "").trim(), nextReacted = !opts?.viewerHasReacted, kRaw = String(kind || "issue").toLowerCase(), k = kRaw === "review" ? "review" : kRaw === "pr" ? "pr" : "issue";
  if (nodeId) {
    const mutation = nextReacted ? `mutation($id:ID!,$content:ReactionContent!){
          addReaction(input:{subjectId:$id, content:$content}) {
            reaction { content }
          }
        }` : `mutation($id:ID!,$content:ReactionContent!){
          removeReaction(input:{subjectId:$id, content:$content}) {
            reaction { content }
          }
        }`;
    try {
      return await apiGraphql(
        mutation,
        { id: nodeId, content: gqlContent },
        fetchImpl,
        token,
        ctx
      ), { content, reacted: nextReacted };
    } catch {
    }
  }
  let basePath = "", deletePath = (reactionId) => "";
  if (k === "review") {
    const commentId = opts?.commentId;
    if (commentId == null || commentId === "")
      throw new Error("Reaction toggle needs nodeId or commentId");
    basePath = `/repos/${owner}/${repo}/pulls/comments/${commentId}/reactions`, deletePath = (rid) => `/repos/${owner}/${repo}/pulls/comments/${commentId}/reactions/${rid}`;
  } else if (k === "pr") {
    const num = opts?.number ?? opts?.commentId;
    if (num == null || num === "")
      throw new Error("Reaction toggle needs nodeId or PR number");
    basePath = `/repos/${owner}/${repo}/issues/${num}/reactions`, deletePath = (rid) => `/repos/${owner}/${repo}/issues/${num}/reactions/${rid}`;
  } else {
    const commentId = opts?.commentId;
    if (commentId == null || commentId === "")
      throw new Error("Reaction toggle needs nodeId or commentId");
    basePath = `/repos/${owner}/${repo}/issues/comments/${commentId}/reactions`, deletePath = (rid) => `/repos/${owner}/${repo}/issues/comments/${commentId}/reactions/${rid}`;
  }
  if (nextReacted)
    return await apiSend(
      githubRestUrl(basePath, ctx),
      fetchImpl,
      token,
      { method: "POST", body: { content } }
    ), { content, reacted: !0 };
  const listed = await apiJson(
    githubRestUrl(
      `${basePath}?content=${encodeURIComponent(content)}&per_page=100`,
      ctx
    ),
    fetchImpl,
    token
  ), rows = Array.isArray(listed) ? listed : [];
  let target = rows[0] || null;
  try {
    const me = await fetchViewerLogin(fetchImpl, token, ctx), login = String(me || "").toLowerCase();
    if (login) {
      const mine = rows.find(
        (r) => String(r?.user?.login || "").toLowerCase() === login
      );
      mine && (target = mine);
    }
  } catch {
  }
  return target?.id ? (await apiSend(
    githubRestUrl(deletePath(target.id), ctx),
    fetchImpl,
    token,
    { method: "DELETE" }
  ), { content, reacted: !1 }) : { content, reacted: !1 };
}
async function fetchPrIssueComments(owner, repo, number, fetchImpl, token = null, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const o = String(owner || "").trim(), r = String(repo || "").trim(), n = Number(number), empty = {
    items: [],
    meta: {
      page: 1,
      perPage: COMMENT_PAGE_SIZE,
      hasMore: !1,
      nextPage: null,
      order: "from-end",
      loadedCount: 0
    }
  };
  return !o || !r || !Number.isFinite(n) ? empty : await fetchPrCommentsPage(
    o,
    r,
    n,
    "issue",
    { page: 1, perPage: COMMENT_PAGE_SIZE, preferNewest: !0 },
    fetchImpl,
    token,
    ctx
  );
}
async function fetchPrTimelineEvents(owner, repo, number, fetchImpl, token = null, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const o = String(owner || "").trim(), r = String(repo || "").trim(), n = Number(number);
  if (!o || !r || !Number.isFinite(n)) return [];
  const SKIP = /* @__PURE__ */ new Set([
    "subscribed",
    "unsubscribed",
    "mentioned",
    "comment_deleted"
  ]);
  function mapEvent(raw) {
    if (!raw || typeof raw != "object") return null;
    const event = String(raw.event || "").trim();
    if (!event || SKIP.has(event)) return null;
    const actor = raw.actor || raw.user || null, login = actor?.login || "", label = raw.label ? {
      name: String(raw.label.name || ""),
      color: String(raw.label.color || ""),
      description: String(raw.label.description || "")
    } : null, assigneeLogin = typeof raw.assignee == "string" ? raw.assignee : raw.assignee?.login || null, requestedReviewer = raw.requested_reviewer?.login || (typeof raw.requested_reviewer == "string" ? raw.requested_reviewer : null), requestedTeam = raw.requested_team?.slug || raw.requested_team?.name || (typeof raw.requested_team == "string" ? raw.requested_team : null), milestone = raw.milestone ? {
      number: raw.milestone.number != null ? Number(raw.milestone.number) : null,
      title: String(raw.milestone.title || "")
    } : null, rename = raw.rename && typeof raw.rename == "object" ? {
      from: String(raw.rename.from || ""),
      to: String(raw.rename.to || "")
    } : null;
    return {
      id: raw.id != null ? raw.id : null,
      event,
      actor: login,
      avatarUrl: actor?.avatar_url || actor?.avatarUrl || "",
      at: raw.created_at || raw.createdAt || null,
      rename,
      label: label && label.name ? label : null,
      assignee: assigneeLogin || null,
      requestedReviewer: requestedReviewer || null,
      requestedTeam: requestedTeam || null,
      milestone: milestone && (milestone.title || milestone.number != null) ? milestone : null,
      lockReason: raw.lock_reason || raw.lockReason || null,
      commitId: raw.commit_id || raw.commitId || null,
      dismissReason: raw.dismissed_review?.dismissal_message || null,
      reviewState: raw.dismissed_review?.state || raw.state || null
    };
  }
  const out = [];
  try {
    const pageUrl = (page) => githubRestUrl(
      `/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}/issues/${n}/events?per_page=100&page=${page}`,
      ctx
    ), first = await apiJsonWithLink(pageUrl(1), fetchImpl, token), firstBatch = Array.isArray(first.data) ? first.data : [], lastPage = parseLinkRelPage(first.link, "last") || (firstBatch.length < 100 ? 1 : null);
    if (lastPage == null) {
      for (const raw of firstBatch) {
        const mapped = mapEvent(raw);
        mapped && out.push(mapped);
      }
      let page = 2, link = first.link;
      for (; page <= 25 && parseLinkNextUrl(link); ) {
        const { data, link: nextLink } = await apiJsonWithLink(
          pageUrl(page),
          fetchImpl,
          token
        );
        link = nextLink;
        const batch = Array.isArray(data) ? data : [];
        for (const raw of batch) {
          const mapped = mapEvent(raw);
          mapped && out.push(mapped);
        }
        if (batch.length < 100) break;
        page += 1;
      }
      return out;
    }
    const endPage = Math.max(1, Number(lastPage) || 1), startPage = Math.max(1, endPage - 25 + 1), cachedPage1 = startPage === 1 ? firstBatch : null;
    for (let page = startPage; page <= endPage; page++) {
      let batch;
      if (page === 1 && cachedPage1)
        batch = cachedPage1;
      else {
        const { data } = await apiJsonWithLink(pageUrl(page), fetchImpl, token);
        batch = Array.isArray(data) ? data : [];
      }
      for (const raw of batch) {
        const mapped = mapEvent(raw);
        mapped && out.push(mapped);
      }
    }
    return out;
  } catch (err) {
    if (err?.name === "AbortError" || /aborted|AbortError/i.test(String(err?.message || "")))
      throw err;
    return [];
  }
}
async function fetchPrReviews(owner, repo, number, fetchImpl, token = null, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const o = String(owner || "").trim(), r = String(repo || "").trim(), n = Number(number);
  if (!o || !r || !Number.isFinite(n)) return [];
  try {
    const firstUrl = githubRestUrl(
      `/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}/pulls/${n}/reviews?per_page=100`,
      ctx
    ), data = await fetchRestCollectionAll(firstUrl, fetchImpl, token, {
      // Safety cap: 100 pages × 100 = 10k reviews (pathological bots).
      maxPages: 100
    });
    return (Array.isArray(data) ? data : []).map((rev) => ({
      id: rev.id,
      author: rev.user?.login || "",
      avatarUrl: rev.user?.avatar_url || "",
      type: rev.user?.type || "",
      isBot: String(rev.user?.type || "").toLowerCase() === "bot" || /\[bot\]$/i.test(String(rev.user?.login || "")),
      state: rev.state || "",
      body: rev.body || "",
      submittedAt: rev.submitted_at
    }));
  } catch (err) {
    if (err?.name === "AbortError" || /aborted|AbortError/i.test(String(err?.message || "")))
      throw err;
    return [];
  }
}
var COMMENT_PAGE_SIZE = 50;
async function fetchPrCommentsPage(owner, repo, pullNumber, kind, opts, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const helpers = commentsPageHelpers(), perPage = helpers?.clampPerPage?.(opts?.perPage) || Math.min(100, Number(opts?.perPage) || COMMENT_PAGE_SIZE);
  let page = Math.max(1, Number(opts?.page) || 1);
  const since = opts?.since || null, preferNewest = !!opts?.preferNewest && !since, orderHint = opts?.order || null;
  async function fetchPage(pageNum, listOpts = {}, ctx2 = null) {
    ctx2 = normalizeApiCtx(ctx2);
    const sort = listOpts?.sort != null ? listOpts.sort : kind === "review" ? "created" : void 0, direction = listOpts?.direction != null ? listOpts.direction : kind === "review" ? preferNewest || orderHint === "desc" ? "desc" : "asc" : void 0, url = helpers?.buildCommentsListUrl ? helpers.buildCommentsListUrl(kind, owner, repo, pullNumber, {
      page: pageNum,
      perPage,
      since,
      sort,
      direction
    }) : (() => {
      const base = githubRestUrl(kind === "review" ? `/repos/${owner}/${repo}/pulls/${pullNumber}/comments` : `/repos/${owner}/${repo}/issues/${pullNumber}/comments`, ctx2), q = new URLSearchParams({
        per_page: String(perPage),
        page: String(pageNum)
      });
      return since && q.set("since", since), sort && q.set("sort", sort), direction && q.set("direction", direction), `${base}?${q}`;
    })(), { data, link } = await apiJsonWithLink(url, fetchImpl, token), raw = Array.isArray(data) ? data : [], items = kind === "review" ? raw.map(mapReviewComment) : raw.map(mapIssueComment);
    if (kind === "issue" && token && items.length) {
      const ids = items.map((c) => c?.nodeId).filter(Boolean);
      if (ids.length)
        try {
          const byId = await fetchReactableReactionGroups(
            ids,
            fetchImpl,
            token,
            ctx2
          );
          for (const c of items) {
            if (!c?.nodeId) continue;
            const groups = byId.get(String(c.nodeId));
            groups && groups.length && (c.reactions = groups);
          }
        } catch (err) {
          if (err?.name === "AbortError" || /aborted|AbortError/i.test(String(err?.message || "")))
            throw err;
        }
    }
    return { items, raw, link, pageNum };
  }
  if (kind === "issue" && preferNewest && page === 1 && !orderHint) {
    const probe = await fetchPage(1), lastPage = helpers?.parseLinkLastPage && helpers.parseLinkLastPage(probe.link) || null;
    if (lastPage != null && lastPage > 1) {
      const newest = await fetchPage(lastPage), meta3 = helpers?.buildCommentsPageMeta ? helpers.buildCommentsPageMeta(newest.items, {
        page: lastPage,
        perPage,
        linkHeader: newest.link,
        since,
        order: "from-end"
      }) : {
        page: lastPage,
        perPage,
        hasMore: lastPage > 1,
        nextPage: lastPage > 1 ? lastPage - 1 : null,
        order: "from-end",
        since,
        loadedCount: newest.items.length
      };
      return { items: newest.items, meta: meta3, kind };
    }
    const meta2 = helpers?.buildCommentsPageMeta ? helpers.buildCommentsPageMeta(probe.items, {
      page: 1,
      perPage,
      linkHeader: probe.link,
      since,
      order: "from-end"
    }) : {
      page: 1,
      perPage,
      hasMore: !1,
      nextPage: null,
      order: "from-end",
      since,
      loadedCount: probe.items.length
    };
    return { items: probe.items, meta: meta2, kind };
  }
  if (kind === "issue" && (orderHint === "from-end" || opts?.order === "from-end")) {
    const res2 = await fetchPage(page), meta2 = helpers?.buildCommentsPageMeta ? helpers.buildCommentsPageMeta(res2.items, {
      page,
      perPage,
      linkHeader: res2.link,
      since,
      order: "from-end"
    }) : {
      page,
      perPage,
      hasMore: page > 1,
      nextPage: page > 1 ? page - 1 : null,
      order: "from-end",
      since,
      loadedCount: res2.items.length
    };
    return { items: res2.items, meta: meta2, kind };
  }
  const res = await fetchPage(page, {
    direction: kind === "review" ? preferNewest || orderHint === "desc" ? "desc" : "asc" : void 0,
    sort: kind === "review" ? "created" : void 0
  }), meta = helpers?.buildCommentsPageMeta ? helpers.buildCommentsPageMeta(res.items, {
    page,
    perPage,
    linkHeader: res.link,
    since,
    order: kind === "review" && (preferNewest || orderHint === "desc") ? "desc" : "asc"
  }) : {
    page,
    perPage,
    hasMore: res.raw.length >= perPage,
    nextPage: res.raw.length >= perPage ? page + 1 : null,
    since,
    loadedCount: res.items.length
  };
  return { items: res.items, meta, kind };
}
async function fetchPrSidebarMeta(owner, repo, number, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const o = String(owner || "").trim(), r = String(repo || "").trim(), n = Number(number);
  if (!o || !r || !Number.isFinite(n) || n <= 0 || !token)
    return { projects: [], developmentIssues: [] };
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
    const prNode = (await apiGraphql(
      query,
      { owner: o, repo: r, number: n },
      fetchImpl,
      token,
      ctx
    ))?.repository?.pullRequest || null, projects = [];
    for (const node of prNode?.projectItems?.nodes || []) {
      const p = node?.project;
      if (!p) continue;
      const title = String(p.title || "").trim();
      title && projects.push({
        id: String(node.id || `${p.number}:${title}`),
        title,
        number: p.number != null ? Number(p.number) : null,
        url: String(p.url || "").trim()
      });
    }
    const developmentIssues = [];
    for (const node of prNode?.closingIssuesReferences?.nodes || []) {
      const num = Number(node?.number);
      !Number.isFinite(num) || num <= 0 || developmentIssues.push({
        number: num,
        title: String(node?.title || "").trim(),
        url: String(node?.url || "").trim(),
        state: String(node?.state || "").trim().toLowerCase()
      });
    }
    return { projects, developmentIssues };
  } catch (err) {
    if (err?.name === "AbortError" || /aborted|AbortError/i.test(String(err?.message || "")))
      throw err;
    return { projects: [], developmentIssues: [] };
  }
}
async function fetchIssueOrPrSummaries(owner, repo, numbers, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const o = String(owner || "").trim(), r = String(repo || "").trim(), nums = [
    ...new Set(
      (Array.isArray(numbers) ? numbers : []).map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0)
    )
  ].slice(0, 30), out = /* @__PURE__ */ new Map();
  if (!o || !r || !nums.length || !token) return out;
  const query = `
    query($owner:String!,$repo:String!) {
      repository(owner:$owner, name:$repo) {
        ${nums.map(
    (n, i) => `
      n${i}: issueOrPullRequest(number: ${n}) {
        __typename
        ... on Issue { number title url state }
        ... on PullRequest { number title url state }
      }`
  ).join(`
`)}
      }
    }
  `;
  try {
    const repoNode = (await apiGraphql(
      query,
      { owner: o, repo: r },
      fetchImpl,
      token,
      ctx
    ))?.repository || {};
    for (let i = 0; i < nums.length; i++) {
      const node = repoNode[`n${i}`];
      if (!node || node.number == null) continue;
      const num = Number(node.number);
      !Number.isFinite(num) || num <= 0 || out.set(num, {
        number: num,
        title: String(node.title || "").trim(),
        url: String(node.url || "").trim(),
        state: String(node.state || "").trim().toLowerCase(),
        kind: node.__typename === "PullRequest" ? "pull" : "issue"
      });
    }
  } catch (err) {
    if (err?.name === "AbortError" || /aborted|AbortError/i.test(String(err?.message || "")))
      throw err;
  }
  return out;
}
async function fetchConflictFilePaths(owner, repo, baseRef, headSha, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const o = String(owner || "").trim(), r = String(repo || "").trim(), ref = String(baseRef || "").trim(), head = String(headSha || "").trim();
  if (!o || !r || !ref || !head) return [];
  try {
    const baseUrl = githubRestUrl(`/repos/${o}/${r}`, ctx), refJson = await apiJson(
      `${baseUrl}/git/ref/heads/${encodeURIComponent(ref)}`,
      fetchImpl,
      token
    ), baseTip = String(refJson?.object?.sha || "").trim();
    if (!baseTip) return [];
    const headVsBase = await apiJson(
      `${baseUrl}/compare/${encodeURIComponent(baseTip)}...${encodeURIComponent(head)}`,
      fetchImpl,
      token
    ), mergeBase = String(headVsBase?.merge_base_commit?.sha || "").trim();
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
      )
    ]), onBase = new Set(
      (Array.isArray(baseSide?.files) ? baseSide.files : []).map((f) => String(f?.filename || f?.previous_filename || "").trim()).filter(Boolean)
    ), conflicts = [];
    for (const f of Array.isArray(headSide?.files) ? headSide.files : []) {
      const path = String(f?.filename || "").trim();
      path && onBase.has(path) && conflicts.push(path);
    }
    return conflicts;
  } catch (err) {
    if (err?.name === "AbortError" || /aborted|AbortError/i.test(String(err?.message || "")))
      throw err;
    return [];
  }
}
async function resolvePrMergeability(pr, base, pullNumber, fetchImpl, token, timings, meta = {}) {
  if (!pr || typeof pr != "object") return pr;
  let out = pr;
  const apiCtx = normalizeApiCtx(meta?.apiCtx || meta?.ctx);
  if (out.mergeable == null || out.mergeable === void 0 || !String(out.mergeable_state || "").trim() || String(out.mergeable_state || "").toLowerCase() === "unknown")
    try {
      await sleepMs(350);
      const again = await timedFetch(
        timings,
        "pullMergeable",
        apiJson(`${base}/pulls/${pullNumber}`, fetchImpl, token),
        (p) => `(mergeable=${p?.mergeable} state=${p?.mergeable_state || "?"})`
      );
      again && typeof again == "object" && (out = {
        ...out,
        mergeable: again.mergeable,
        mergeable_state: again.mergeable_state,
        rebaseable: again.rebaseable != null ? again.rebaseable : out.rebaseable,
        merge_commit_sha: again.merge_commit_sha || out.merge_commit_sha
      });
    } catch (err) {
      if (err?.name === "AbortError" || /aborted|AbortError/i.test(String(err?.message || "")))
        throw err;
    }
  const state = String(out.mergeable_state || "").toLowerCase();
  try {
    if (state === "behind")
      out = { ...out, behind_by: Math.max(1, Number(out.behind_by) || 1) };
    else if (state === "clean" || state === "unstable" || state === "has_hooks")
      out = { ...out, behind_by: 0 };
    else {
      const baseOwner = out.base?.repo?.owner?.login || String(meta.owner || "").trim() || "", baseRepo = out.base?.repo?.name || String(meta.repo || "").trim() || "", baseRef = String(out.base?.ref || "").trim(), headSha = String(out.head?.sha || "").trim();
      if (baseOwner && baseRepo && baseRef && headSha) {
        const cmpUrl = githubRestUrl(
          `/repos/${encodeURIComponent(baseOwner)}/${encodeURIComponent(baseRepo)}/compare/${encodeURIComponent(baseRef)}...${encodeURIComponent(headSha)}`,
          apiCtx
        ), cmp = await timedFetch(
          timings,
          "branchBehind",
          apiJson(cmpUrl, fetchImpl, token),
          (c) => `(behind=${c?.behind_by ?? "?"} status=${c?.status || "?"})`
        );
        cmp && typeof cmp == "object" && cmp.behind_by != null && (out = { ...out, behind_by: Number(cmp.behind_by) || 0 });
      }
    }
  } catch (err) {
    if (err?.name === "AbortError" || /aborted|AbortError/i.test(String(err?.message || "")))
      throw err;
  }
  if (state === "dirty" || out.mergeable === !1 && state !== "blocked" && state !== "clean") {
    const baseOwner = out.base?.repo?.owner?.login || String(meta.owner || "").trim() || null, baseRepo = out.base?.repo?.name || String(meta.repo || "").trim() || null, conflictFiles = await timedFetch(
      timings,
      "conflictFiles",
      fetchConflictFilePaths(
        baseOwner,
        baseRepo,
        out.base?.ref || "",
        out.head?.sha || "",
        fetchImpl,
        token,
        apiCtx
      ).catch(() => []),
      (list) => `(${Array.isArray(list) ? list.length : 0} paths)`
    );
    out = {
      ...out,
      _conflictFiles: Array.isArray(conflictFiles) ? conflictFiles : []
    };
  } else
    out = { ...out, _conflictFiles: [] };
  return out;
}
async function fetchCompareFiles(owner, repo, base, head, fetchImpl, token = null, options = {}) {
  const ctx = normalizeApiCtx(options?.ctx), o = String(owner || "").trim(), r = String(repo || "").trim(), b = String(base || "").trim(), h = String(head || "").trim();
  if (!o || !r || !b || !h)
    throw new Error("owner, repo, base, and head are required for compare");
  const gitattributesText = String(options.gitattributesText || ""), url = githubRestUrl(`/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}/compare/${encodeURIComponent(b)}...${encodeURIComponent(h)}`, ctx), data = await apiJson(url, fetchImpl, token);
  return {
    files: mapAndAnnotateFiles(data?.files || [], gitattributesText),
    base: b,
    head: h,
    status: data?.status || null,
    aheadBy: data?.ahead_by ?? null,
    behindBy: data?.behind_by ?? null,
    totalCommits: data?.total_commits ?? (Array.isArray(data?.commits) ? data.commits.length : null),
    truncated: !!(data?.files && data.files.length >= 300)
  };
}
async function fetchPrCommits(owner, repo, number, fetchImpl, token = null, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const o = String(owner || "").trim(), r = String(repo || "").trim(), n = Number(number);
  if (!o || !r || !Number.isFinite(n))
    throw new Error("owner, repo, and number are required for commits");
  const url = githubRestUrl(
    `/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}/pulls/${n}/commits?per_page=100`,
    ctx
  );
  try {
    const data = await apiJson(url, fetchImpl, token);
    return (Array.isArray(data) ? data : []).map(mapPrCommitRow).filter((c) => c.sha);
  } catch (err) {
    if (err?.name === "AbortError" || /aborted|AbortError/i.test(String(err?.message || "")))
      throw err;
    return [];
  }
}
async function fetchAllPrCommits(owner, repo, number, fetchImpl, token = null, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const o = String(owner || "").trim(), r = String(repo || "").trim(), n = Number(number);
  if (!o || !r || !Number.isFinite(n))
    throw new Error("owner, repo, and number are required for commits");
  const first = githubRestUrl(
    `/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}/pulls/${n}/commits?per_page=100`,
    ctx
  );
  return (await fetchRestCollectionAll(first, fetchImpl, token)).map(mapPrCommitRow).filter((c) => c.sha);
}
async function fetchPrChecks(owner, repo, headSha, fetchImpl, token = null, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const o = String(owner || "").trim(), r = String(repo || "").trim(), sha = String(headSha || "").trim(), empty = { state: "unknown", totalCount: 0, statuses: [], checkRuns: [] };
  if (!o || !r || !sha) return empty;
  const base = githubRestUrl(`/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}`, ctx);
  let checks = { ...empty };
  try {
    const status = await apiJson(`${base}/commits/${encodeURIComponent(sha)}/status`, fetchImpl, token), statusList = Array.isArray(status?.statuses) ? status.statuses : [], emptyCombined = !statusList.length && !(Number(status?.total_count) > 0);
    checks = {
      state: emptyCombined ? "unknown" : status.state || "unknown",
      totalCount: emptyCombined ? 0 : status.total_count || statusList.length,
      statuses: statusList.map((s) => ({
        context: s.context || "",
        state: s.state || "",
        description: s.description || "",
        targetUrl: s.target_url || "",
        createdAt: s.created_at || "",
        updatedAt: s.updated_at || ""
      })),
      checkRuns: []
    };
  } catch (err) {
    if (err?.name === "AbortError" || /aborted|AbortError/i.test(String(err?.message || "")))
      throw err;
  }
  try {
    const list = (await apiJson(
      `${base}/commits/${encodeURIComponent(sha)}/check-runs?per_page=100&filter=latest`,
      fetchImpl,
      token
    ))?.check_runs || [];
    list.length && (checks.checkRuns = list.map((r2) => ({
      id: r2.id,
      name: r2.name || "",
      status: r2.status || "",
      conclusion: r2.conclusion || "",
      htmlUrl: r2.html_url || "",
      startedAt: r2.started_at || "",
      completedAt: r2.completed_at || "",
      appSlug: r2.app?.slug || "",
      appName: r2.app?.name || ""
    })));
  } catch (err) {
    if (err?.name === "AbortError" || /aborted|AbortError/i.test(String(err?.message || "")))
      throw err;
  }
  const normalize = typeof globalThis < "u" && globalThis.PRModalChecks?.normalizeChecks || null;
  if (typeof normalize == "function")
    return normalize(checks);
  const byCtx = /* @__PURE__ */ new Map();
  for (const s of checks.statuses || []) {
    const k = String(s.context || "").toLowerCase();
    if (!k) continue;
    const prev = byCtx.get(k), t = Date.parse(s.updatedAt || s.createdAt || "") || 0, pt = prev ? Date.parse(prev.updatedAt || prev.createdAt || "") || 0 : -1;
    (!prev || t >= pt) && byCtx.set(k, s);
  }
  const byName = /* @__PURE__ */ new Map();
  for (const r2 of checks.checkRuns || []) {
    const k = String(r2.name || "").toLowerCase();
    if (!k) continue;
    const prev = byName.get(k), t = Date.parse(r2.completedAt || r2.startedAt || "") || Number(r2.id) || 0, pt = prev ? Date.parse(prev.completedAt || prev.startedAt || "") || Number(prev.id) || 0 : -1;
    (!prev || t >= pt) && byName.set(k, r2);
  }
  return checks.statuses = [...byCtx.values()], checks.checkRuns = [...byName.values()], checks.totalCount = checks.statuses.length + checks.checkRuns.length, checks;
}
async function fetchPrDevelopment(owner, repo, number, fetchImpl, token = null, opts = {}) {
  const ctx = normalizeApiCtx(opts?.ctx), o = String(owner || "").trim(), r = String(repo || "").trim(), n = Number(number), body = String(opts.body || "");
  let linkedIssues = [];
  try {
    let editApi = typeof globalThis < "u" ? globalThis.PRModalPrEditApi : null;
    if (!editApi && typeof __require == "function")
      try {
        editApi = __require("./modal/pure/pr-edit-api.js");
      } catch {
        editApi = null;
      }
    editApi?.parseLinkedIssueNumbers && (linkedIssues = editApi.parseLinkedIssueNumbers(body));
  } catch {
    linkedIssues = [];
  }
  let developmentIssues = [], projects = [];
  try {
    const side = await fetchPrSidebarMeta(o, r, n, fetchImpl, token, ctx);
    if (side && typeof side == "object") {
      if (Array.isArray(side.developmentIssues) && side.developmentIssues.length) {
        developmentIssues = side.developmentIssues.map((item) => ({
          number: Number(item?.number),
          title: String(item?.title || "").trim(),
          url: String(item?.url || "").trim(),
          state: String(item?.state || "").trim().toLowerCase(),
          source: item?.source || "closing",
          kind: item?.kind || ""
        }));
        const fromGql = developmentIssues.map((x) => Number(x?.number)).filter((x) => Number.isFinite(x) && x > 0);
        fromGql.length && (linkedIssues = [.../* @__PURE__ */ new Set([...linkedIssues, ...fromGql])].sort((a, b) => a - b));
      }
      Array.isArray(side.projects) && (projects = side.projects);
    }
  } catch (err) {
    if (err?.name === "AbortError" || /aborted|AbortError/i.test(String(err?.message || "")))
      throw err;
  }
  {
    const byNum = /* @__PURE__ */ new Map();
    for (const item of developmentIssues) {
      const num = Number(item?.number);
      !Number.isFinite(num) || num <= 0 || byNum.set(num, {
        number: num,
        title: String(item?.title || "").trim(),
        url: String(item?.url || "").trim(),
        state: String(item?.state || "").trim().toLowerCase(),
        source: item?.source || "closing",
        kind: item?.kind || ""
      });
    }
    for (const raw of linkedIssues) {
      const num = Number(raw);
      !Number.isFinite(num) || num <= 0 || byNum.has(num) || byNum.set(num, {
        number: num,
        title: "",
        url: `https://github.com/${o}/${r}/issues/${num}`,
        state: "",
        source: "body",
        kind: ""
      });
    }
    developmentIssues = [...byNum.values()].sort((a, b) => a.number - b.number);
  }
  const needTitles = developmentIssues.filter((x) => !String(x?.title || "").trim()).map((x) => x.number);
  if (needTitles.length && token)
    try {
      const summaries = await fetchIssueOrPrSummaries(
        o,
        r,
        needTitles,
        fetchImpl,
        token
      );
      summaries && summaries.size && (developmentIssues = developmentIssues.map((item) => {
        const s = summaries.get(item.number);
        return s ? {
          ...item,
          title: item.title || s.title,
          url: s.url || item.url,
          state: item.state || s.state,
          kind: s.kind || item.kind || ""
        } : item;
      }));
    } catch (err) {
      if (err?.name === "AbortError" || /aborted|AbortError/i.test(String(err?.message || "")))
        throw err;
    }
  return {
    linkedIssues,
    developmentIssues,
    projects
  };
}
async function fetchAllPrFiles(owner, repo, number, fetchImpl, token = null, options = {}) {
  const ctx = normalizeApiCtx(options?.ctx), o = String(owner || "").trim(), r = String(repo || "").trim(), n = Number(number);
  if (!o || !r || !Number.isFinite(n))
    throw new Error("owner, repo, and number are required for files");
  const first = githubRestUrl(
    `/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}/pulls/${n}/files?per_page=100`,
    ctx
  ), raw = await fetchRestCollectionAll(first, fetchImpl, token);
  return mapAndAnnotateFiles(raw, options.gitattributesText || "");
}
async function fetchPrFiles(owner, repo, number, fetchImpl, token = null, options = {}) {
  const ctx = normalizeApiCtx(options?.ctx), o = String(owner || "").trim(), r = String(repo || "").trim(), n = Number(number);
  if (!o || !r || !Number.isFinite(n))
    throw new Error("owner, repo, and number are required for files");
  const base = githubRestUrl(
    `/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}`,
    ctx
  );
  let raw = [];
  try {
    const data = await apiJson(
      `${base}/pulls/${n}/files?per_page=100`,
      fetchImpl,
      token
    );
    raw = Array.isArray(data) ? data : [];
  } catch (err) {
    if (err?.name === "AbortError" || /aborted|AbortError/i.test(String(err?.message || "")))
      throw err;
    raw = [];
  }
  let gitattributesText = String(options.gitattributesText || "");
  if (!gitattributesText)
    try {
      const ref = String(options.headSha || options.ref || "").trim() || "HEAD", attr = await apiJson(
        `${base}/contents/.gitattributes?ref=${encodeURIComponent(ref)}`,
        fetchImpl,
        token
      );
      attr?.content && attr.encoding === "base64" ? gitattributesText = decodeBase64Utf8(
        String(attr.content).replace(/\n/g, "")
      ) : typeof attr?.content == "string" && (gitattributesText = attr.content);
    } catch (err) {
      if (err?.name === "AbortError" || /aborted|AbortError/i.test(String(err?.message || "")))
        throw err;
      gitattributesText = "";
    }
  return {
    files: mapAndAnnotateFiles(raw, gitattributesText),
    gitattributesText
  };
}
function mergePendingReviewComments(published, pendingList) {
  const list = Array.isArray(published) ? published.slice() : [], seen = new Set(list.map((c) => c && c.id != null ? String(c.id) : "").filter(Boolean));
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
        pending: !!(host.pending || p.pending),
        pendingReviewId: host.pendingReviewId ?? p.pendingReviewId ?? null,
        threadNodeId: host.threadNodeId || p.threadNodeId || null,
        nodeId: host.nodeId || p.nodeId || null,
        outdated: !!(host.outdated || p.outdated),
        diffHunk: host.diffHunk || p.diffHunk || "",
        resolved: !!(host.resolved || p.resolved)
      };
      continue;
    }
    seen.add(key), list.push(p);
  }
  return list;
}
function pickViewerPendingFromReviews(reviews, login) {
  const mine = (Array.isArray(reviews) ? reviews : []).filter((r2) => !r2 || String(r2.state || "").toUpperCase() !== "PENDING" ? !1 : login ? String(r2.user?.login || "").toLowerCase() === String(login).toLowerCase() : !0);
  if (!mine.length) return null;
  const r = mine[mine.length - 1];
  return {
    id: Number(r.id),
    node_id: r.node_id || null
  };
}
async function fetchViewerPendingReviewBundle(owner, repo, pullNumber, fetchImpl, token, preloaded = null, ctx = null) {
  if (ctx = normalizeApiCtx(ctx), !token) return { comments: [], review: null };
  let pending = null;
  if (preloaded && (Array.isArray(preloaded.reviews) || preloaded.login != null) && (pending = pickViewerPendingFromReviews(
    preloaded.reviews,
    preloaded.login || null
  )), pending?.id || (pending = await findViewerPendingReview(
    owner,
    repo,
    pullNumber,
    fetchImpl,
    token
  )), !pending?.id) return { comments: [], review: null };
  try {
    const n = Number(pullNumber), raw = await apiJson(
      githubRestUrl(`/repos/${owner}/${repo}/pulls/${n}/reviews/${pending.id}/comments?per_page=100`, ctx),
      fetchImpl,
      token
    ), comments = (Array.isArray(raw) ? raw : []).map(
      (c) => mapReviewComment(c, { pending: !0, pendingReviewId: pending.id })
    );
    return {
      comments,
      review: {
        id: pending.id,
        nodeId: pending.node_id || null,
        commentCount: comments.length
      }
    };
  } catch {
    return {
      comments: [],
      review: {
        id: pending.id,
        nodeId: pending.node_id || null,
        commentCount: 0
      }
    };
  }
}
async function fetchViewerPendingReviewComments(owner, repo, pullNumber, fetchImpl, token) {
  const { comments } = await fetchViewerPendingReviewBundle(
    owner,
    repo,
    pullNumber,
    fetchImpl,
    token
  );
  return comments;
}
async function createPendingPullReview(owner, repo, pullNumber, opts = {}, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const body = {};
  return opts?.commitId && (body.commit_id = opts.commitId), apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/pulls/${pullNumber}/reviews`, ctx),
    fetchImpl,
    token,
    { method: "POST", body }
  );
}
async function submitPendingPullReview(owner, repo, pullNumber, reviewId, { event = "COMMENT", body = "" } = {}, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const id = Number(reviewId);
  if (!Number.isFinite(id) || id <= 0)
    throw new Error("Invalid pending review id");
  const ev = String(event || "COMMENT").toUpperCase();
  if (!["COMMENT", "APPROVE", "REQUEST_CHANGES"].includes(ev))
    throw new Error("Invalid review event");
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/pulls/${pullNumber}/reviews/${id}/events`, ctx),
    fetchImpl,
    token,
    { method: "POST", body: { event: ev, body: body || "" } }
  );
}
async function deletePendingPullReview(owner, repo, pullNumber, reviewId, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const id = Number(reviewId);
  if (!Number.isFinite(id) || id <= 0)
    throw new Error("Invalid pending review id");
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/pulls/${pullNumber}/reviews/${id}`, ctx),
    fetchImpl,
    token,
    { method: "DELETE" }
  );
}
async function postReviewCommentViaPendingGraphql(pendingReviewNodeId, { body, path, line, side = "RIGHT", startLine, startSide, subjectType = "line" }, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const isFile = String(subjectType || "").toLowerCase() === "file", hasRange = !isFile && startLine != null && Number.isFinite(Number(startLine)) && Number(startLine) !== Number(line), variables = {
    review: String(pendingReviewNodeId),
    body: String(body || "").trim(),
    path: String(path || "")
  };
  let query;
  isFile ? query = `mutation($review:ID!,$body:String!,$path:String!){
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
    }` : hasRange ? (variables.line = Number(line), variables.side = String(side || "RIGHT").toUpperCase() === "LEFT" ? "LEFT" : "RIGHT", variables.startLine = Number(startLine), variables.startSide = String(startSide || side || "RIGHT").toUpperCase() === "LEFT" ? "LEFT" : "RIGHT", query = `mutation($review:ID!,$body:String!,$path:String!,$line:Int!,$side:DiffSide!,$startLine:Int!,$startSide:DiffSide!){
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
    }`) : (variables.line = Number(line), variables.side = String(side || "RIGHT").toUpperCase() === "LEFT" ? "LEFT" : "RIGHT", query = `mutation($review:ID!,$body:String!,$path:String!,$line:Int!,$side:DiffSide!){
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
    }`);
  const thread = (await apiGraphql(query, variables, fetchImpl, token, ctx))?.addPullRequestReviewThread?.thread, node = thread?.comments?.nodes?.[0];
  if (!node)
    throw new Error(
      isFile ? `Could not add pending file comment on ${path}.` : `Could not add pending comment on ${path}:${line} (${side || "RIGHT"}). The line may be outside the diff or on the wrong side.`
    );
  const threadNodeId = thread?.id || null, rest = mapGraphqlReviewCommentToRest(node, {
    body,
    path,
    line: isFile ? null : line,
    startLine: hasRange ? Number(startLine) : null,
    side,
    inReplyToId: null
  });
  return {
    ...rest,
    // GraphQL/REST often omit line on pending comments — keep selection line for UI
    line: isFile ? null : rest.line ?? Number(line),
    path: rest.path || path,
    side: side || "RIGHT",
    start_line: hasRange ? Number(startLine) : null,
    start_side: hasRange ? startSide || side || "RIGHT" : null,
    subject_type: isFile ? "file" : "line",
    pending: !0,
    pendingReviewId: node.pullRequestReview?.databaseId ?? null,
    threadNodeId
  };
}
async function ensureViewerPendingReview(owner, repo, pullNumber, { commitId = null, createIfMissing = !1 } = {}, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const hydrateNodeId = async (pending2) => {
    if (!pending2?.id) return null;
    try {
      const full = await apiJson(
        githubRestUrl(`/repos/${owner}/${repo}/pulls/${pullNumber}/reviews/${pending2.id}`, ctx),
        fetchImpl,
        token
      );
      return !full || String(full.state || "").toUpperCase() !== "PENDING" ? null : {
        id: Number(pending2.id),
        node_id: full.node_id || pending2.node_id || null
      };
    } catch (err) {
      return err?.status === 404 || err?.status >= 400 && err?.status < 500 ? null : pending2?.node_id ? { id: Number(pending2.id), node_id: pending2.node_id } : null;
    }
  };
  let pending = await findViewerPendingReview(
    owner,
    repo,
    pullNumber,
    fetchImpl,
    token
  );
  if (pending = await hydrateNodeId(pending), pending?.node_id || !createIfMissing) return pending;
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
      node_id: created?.node_id || null
    };
  } catch (err) {
    const msg = String(err?.message || err || "");
    if ((err?.status === 422 || /one pending review/i.test(msg) || /Unprocessable Entity/i.test(msg)) && (pending = await findViewerPendingReview(
      owner,
      repo,
      pullNumber,
      fetchImpl,
      token
    ), pending = await hydrateNodeId(pending), pending?.node_id))
      return pending;
    throw err;
  }
}
async function findViewerPendingReview(owner, repo, pullNumber, fetchImpl, token, ctx = null) {
  if (ctx = normalizeApiCtx(ctx), !token) return null;
  const n = Number(pullNumber);
  if (!Number.isFinite(n)) return null;
  try {
    const [reviews, login] = await Promise.all([
      apiJson(
        githubRestUrl(`/repos/${owner}/${repo}/pulls/${n}/reviews?per_page=100`, ctx),
        fetchImpl,
        token
      ).catch(() => []),
      fetchViewerLogin(fetchImpl, token).catch(() => null)
    ]);
    return pickViewerPendingFromReviews(reviews, login);
  } catch {
    return null;
  }
}
async function replyViaThreadGraphql(threadNodeId, body, fetchImpl, token, fallback = {}, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const c = (await apiGraphql(
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
  ))?.addPullRequestReviewThreadReply?.comment;
  if (!c) throw new Error("GraphQL thread reply returned no comment");
  return mapGraphqlReviewCommentToRest(c, fallback);
}
async function replyViaPendingReviewGraphql(pendingReviewNodeId, parentCommentNodeId, body, fetchImpl, token, fallback = {}, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const c = (await apiGraphql(
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
      inReplyTo: String(parentCommentNodeId)
    },
    fetchImpl,
    token
  ))?.addPullRequestReviewComment?.comment;
  if (!c) throw new Error("GraphQL pending-review reply returned no comment");
  return mapGraphqlReviewCommentToRest(c, fallback);
}
async function resolveParentCommentNodeId(owner, repo, parentId, fetchImpl, token, knownNodeId, pullNumber = null, ctx = null) {
  if (ctx = normalizeApiCtx(ctx), knownNodeId) return String(knownNodeId);
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
  }
  if (pullNumber == null || !token) return null;
  try {
    const { comments } = await fetchViewerPendingReviewBundle(
      owner,
      repo,
      pullNumber,
      fetchImpl,
      token
    ), hit = (comments || []).find(
      (c) => c && Number(c.id) === id && (c.nodeId || c.node_id)
    );
    if (hit) return String(hit.nodeId || hit.node_id);
  } catch {
  }
  return null;
}
async function postIssueComment(owner, repo, issueNumber, body, fetchImpl, token, ctx = null) {
  return ctx = normalizeApiCtx(ctx), apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/issues/${issueNumber}/comments`, ctx),
    fetchImpl,
    token,
    { method: "POST", body: { body } }
  );
}
async function submitPullReview(owner, repo, pullNumber, { event, body = "", commitId, comments }, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const payload = { event, body: body || "" };
  return commitId && (payload.commit_id = commitId), Array.isArray(comments) && comments.length && (payload.comments = comments.map((c) => {
    const row = {
      path: c.path,
      body: c.body,
      line: c.line,
      side: c.side || "RIGHT"
    };
    if (c.start_line != null || c.startLine != null) {
      const sl = c.start_line != null ? c.start_line : c.startLine;
      Number(sl) !== Number(c.line) && (row.start_line = Number(sl), row.start_side = c.start_side || c.startSide || c.side || "RIGHT");
    }
    return row;
  })), apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/pulls/${pullNumber}/reviews`, ctx),
    fetchImpl,
    token,
    { method: "POST", body: payload }
  );
}
async function postReviewComment(owner, repo, pullNumber, {
  body,
  path,
  line,
  side = "RIGHT",
  commitId,
  startLine,
  startSide,
  asPending = !1,
  subjectType = "line"
}, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const text = String(body || "").trim();
  if (!text) throw new Error("Comment body is required");
  if (!path) throw new Error("path is required");
  const isFile = String(subjectType || "").toLowerCase() === "file";
  if (!isFile && line == null) throw new Error("path and line are required");
  let pending = await ensureViewerPendingReview(
    owner,
    repo,
    pullNumber,
    {
      commitId: commitId || null,
      // Create only when caller wants pending; also create path recovers on 422
      createIfMissing: !!asPending
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
    subjectType: isFile ? "file" : "line"
  };
  if (pending?.node_id)
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
        pending: !0,
        pendingReviewId: raw.pendingReviewId || pending.id || null
      };
    } catch (err) {
      const msg = String(err?.message || err || "");
      if (asPending && /Could not resolve to a node|global id|NOT_FOUND|Could not find/i.test(msg)) {
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
            node_id: created?.node_id || null
          };
        } catch (createErr) {
          if (createErr?.status === 422 || /one pending review/i.test(String(createErr?.message || "")))
            pending = await ensureViewerPendingReview(
              owner,
              repo,
              pullNumber,
              { commitId: commitId || null, createIfMissing: !1 },
              fetchImpl,
              token,
              ctx
            );
          else
            throw createErr;
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
            pending: !0,
            pendingReviewId: raw.pendingReviewId || pending.id || null
          };
        }
      }
      throw err;
    }
  if (asPending)
    throw new Error(
      "Could not start or find a pending review. Try Discard any leftover pending review, then retry."
    );
  const payload = isFile ? { body: text, path, subject_type: "file" } : { body: text, path, line, side };
  return commitId && (payload.commit_id = commitId), !isFile && startLine != null && Number(startLine) !== Number(line) && (payload.start_line = Number(startLine), payload.start_side = startSide || side || "RIGHT"), apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/pulls/${pullNumber}/comments`, ctx),
    fetchImpl,
    token,
    { method: "POST", body: payload }
  );
}
async function replyToReviewComment(owner, repo, pullNumber, commentId, body, fetchImpl, token, opts = {}) {
  const ctx = normalizeApiCtx(opts?.ctx), text = String(body || "").trim();
  if (!text) throw new Error("Reply body is required");
  const parentId = Number(commentId);
  if (!Number.isFinite(parentId) || parentId <= 0)
    throw new Error("Invalid review comment id for reply");
  const n = Number(pullNumber), mode = opts?.mode === "pending" ? "pending" : "comment", threadNodeId = opts?.threadNodeId || null;
  let parentNodeId = opts?.parentNodeId || null;
  const fallback = {
    body: text,
    inReplyToId: Math.floor(parentId),
    path: opts?.path || "",
    line: opts?.line ?? null,
    side: opts?.side || "RIGHT"
  };
  async function attachReplyToPending({ createIfMissing }) {
    const pending = await ensureViewerPendingReview(
      owner,
      repo,
      n,
      {
        commitId: opts?.commitId || null,
        createIfMissing: !!createIfMissing
      },
      fetchImpl,
      token
    );
    if (!pending?.node_id && !threadNodeId) return null;
    if (threadNodeId)
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
          pending: !0,
          pendingReviewId: raw.pendingReviewId || pending?.id || null
        };
      } catch {
      }
    if (!pending?.node_id) return null;
    if (parentNodeId = await resolveParentCommentNodeId(
      owner,
      repo,
      parentId,
      fetchImpl,
      token,
      parentNodeId,
      n
    ), !parentNodeId)
      throw new Error(
        "Cannot reply while a pending review exists (missing parent comment node id)."
      );
    try {
      return { ...await replyViaPendingReviewGraphql(
        pending.node_id,
        parentNodeId,
        text,
        fetchImpl,
        token,
        fallback
      ), pending: !0, pendingReviewId: pending.id };
    } catch (err) {
      const msg = String(err?.message || err || "");
      if (!/Could not resolve to a node|global id|NOT_FOUND|Could not find/i.test(msg))
        throw err;
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
          node_id: created?.node_id || null
        };
      } catch (createErr) {
        if (createErr?.status === 422 || /one pending review/i.test(String(createErr?.message || "")))
          next = await ensureViewerPendingReview(
            owner,
            repo,
            n,
            { commitId: opts?.commitId || null, createIfMissing: !1 },
            fetchImpl,
            token
          );
        else
          throw createErr;
      }
      if (!next?.node_id) throw err;
      return { ...await replyViaPendingReviewGraphql(
        next.node_id,
        parentNodeId,
        text,
        fetchImpl,
        token,
        fallback
      ), pending: !0, pendingReviewId: next.id };
    }
  }
  if (mode === "pending") {
    const attached = await attachReplyToPending({ createIfMissing: !0 });
    if (attached) return attached;
    throw new Error(
      "Could not start or find a pending review for this reply. Try Discard any leftover pending review, then retry."
    );
  }
  if ((await ensureViewerPendingReview(
    owner,
    repo,
    n,
    { createIfMissing: !1 },
    fetchImpl,
    token
  ))?.node_id) {
    const attached = await attachReplyToPending({ createIfMissing: !1 });
    if (attached) return attached;
  }
  if (threadNodeId)
    try {
      return { ...await replyViaThreadGraphql(
        threadNodeId,
        text,
        fetchImpl,
        token,
        fallback
      ), pending: !1 };
    } catch {
    }
  try {
    return await apiSend(
      githubRestUrl(`/repos/${owner}/${repo}/pulls/${n}/comments/${Math.floor(parentId)}/replies`, ctx),
      fetchImpl,
      token,
      { method: "POST", body: { body: text } }
    );
  } catch (err) {
    const msg = String(err?.message || err || "");
    if (err?.status === 422 || /one pending review/i.test(msg) || /Unprocessable Entity/i.test(msg)) {
      const attached = await attachReplyToPending({ createIfMissing: !1 });
      if (attached) return attached;
    }
    throw err;
  }
}
async function resolveReviewThread(threadNodeId, resolved, fetchImpl, token, ctx = null) {
  if (ctx = normalizeApiCtx(ctx), !threadNodeId) throw new Error("threadNodeId required to resolve review thread");
  return apiGraphql(
    resolved ? "mutation($id:ID!){ resolveReviewThread(input:{threadId:$id}){ thread { id isResolved } } }" : "mutation($id:ID!){ unresolveReviewThread(input:{threadId:$id}){ thread { id isResolved } } }",
    { id: threadNodeId },
    fetchImpl,
    token,
    ctx
  );
}
async function updatePullState(owner, repo, pullNumber, state, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const next = state === "closed" ? "closed" : "open";
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/pulls/${pullNumber}`, ctx),
    fetchImpl,
    token,
    { method: "PATCH", body: { state: next } }
  );
}
async function closePullRequest(owner, repo, pullNumber, fetchImpl, token) {
  return updatePullState(owner, repo, pullNumber, "closed", fetchImpl, token);
}
async function reopenPullRequest(owner, repo, pullNumber, fetchImpl, token) {
  return updatePullState(owner, repo, pullNumber, "open", fetchImpl, token);
}
async function deleteReviewComment(owner, repo, commentId, fetchImpl, token, ctx = null) {
  return ctx = normalizeApiCtx(ctx), apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/pulls/comments/${commentId}`, ctx),
    fetchImpl,
    token,
    { method: "DELETE" }
  );
}
async function deleteIssueComment(owner, repo, commentId, fetchImpl, token, ctx = null) {
  return ctx = normalizeApiCtx(ctx), apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/issues/comments/${commentId}`, ctx),
    fetchImpl,
    token,
    { method: "DELETE" }
  );
}
async function updatePullRequest(owner, repo, pullNumber, fields, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const body = {};
  return fields?.title != null && (body.title = String(fields.title)), fields?.body != null && (body.body = String(fields.body)), fields?.base != null && (body.base = String(fields.base)), fields?.state != null && (body.state = fields.state === "closed" ? "closed" : "open"), apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/pulls/${pullNumber}`, ctx),
    fetchImpl,
    token,
    { method: "PATCH", body }
  );
}
async function editIssueComment(owner, repo, commentId, body, fetchImpl, token, ctx = null) {
  return ctx = normalizeApiCtx(ctx), apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/issues/comments/${commentId}`, ctx),
    fetchImpl,
    token,
    { method: "PATCH", body: { body: String(body || "") } }
  );
}
async function editReviewComment(owner, repo, commentId, body, fetchImpl, token, ctx = null) {
  return ctx = normalizeApiCtx(ctx), apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/pulls/comments/${commentId}`, ctx),
    fetchImpl,
    token,
    { method: "PATCH", body: { body: String(body || "") } }
  );
}
async function requestReviewers(owner, repo, pullNumber, { reviewers = [], teamReviewers = [] }, fetchImpl, token, ctx = null) {
  return ctx = normalizeApiCtx(ctx), apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/pulls/${pullNumber}/requested_reviewers`, ctx),
    fetchImpl,
    token,
    {
      method: "POST",
      body: { reviewers, team_reviewers: teamReviewers }
    }
  );
}
async function removeReviewers(owner, repo, pullNumber, { reviewers = [], teamReviewers = [] }, fetchImpl, token, ctx = null) {
  return ctx = normalizeApiCtx(ctx), apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/pulls/${pullNumber}/requested_reviewers`, ctx),
    fetchImpl,
    token,
    {
      method: "DELETE",
      body: { reviewers, team_reviewers: teamReviewers }
    }
  );
}
async function addAssignees(owner, repo, issueNumber, assignees, fetchImpl, token, ctx = null) {
  return ctx = normalizeApiCtx(ctx), apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/issues/${issueNumber}/assignees`, ctx),
    fetchImpl,
    token,
    { method: "POST", body: { assignees: assignees || [] } }
  );
}
async function removeAssignees(owner, repo, issueNumber, assignees, fetchImpl, token, ctx = null) {
  return ctx = normalizeApiCtx(ctx), apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/issues/${issueNumber}/assignees`, ctx),
    fetchImpl,
    token,
    { method: "DELETE", body: { assignees: assignees || [] } }
  );
}
async function setIssueLabels(owner, repo, issueNumber, labels, fetchImpl, token, ctx = null) {
  return ctx = normalizeApiCtx(ctx), apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/issues/${issueNumber}/labels`, ctx),
    fetchImpl,
    token,
    { method: "PUT", body: { labels: labels || [] } }
  );
}
async function fetchRepoLabels(owner, repo, fetchImpl, token = null, opts = {}) {
  const ctx = normalizeApiCtx(opts?.ctx), perPage = 100, maxPages = Math.max(1, Math.min(10, Number(opts.maxPages) || 5)), out = [];
  for (let page = 1; page <= maxPages; page++) {
    const url = githubRestUrl(
      `/repos/${owner}/${repo}/labels?per_page=${perPage}&page=${page}`,
      ctx
    ), batch = await apiJson(url, fetchImpl, token);
    if (!Array.isArray(batch) || !batch.length) break;
    for (const l of batch) {
      const name = String(l?.name || "").trim();
      name && out.push({
        name,
        color: String(l?.color || "").trim().replace(/^#/, ""),
        description: String(l?.description || "")
      });
    }
    if (batch.length < perPage) break;
  }
  return out;
}
function defaultNewLabelColor(name) {
  const palette = [
    "d73a4a",
    "0075ca",
    "a2eeef",
    "7057ff",
    "008672",
    "e4e669",
    "d876e3",
    "fbca04",
    "0e8a16",
    "5319e7"
  ], s = String(name || "");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = h * 31 + s.charCodeAt(i) >>> 0;
  return palette[h % palette.length];
}
async function createRepoLabel(owner, repo, { name, color, description } = {}, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const rawName = String(name || "").trim();
  if (!rawName) throw new Error("Label name is required");
  const body = {
    name: rawName,
    color: String(color || defaultNewLabelColor(rawName)).trim().replace(/^#/, "")
  };
  description != null && (body.description = String(description));
  const result = await apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/labels`, ctx),
    fetchImpl,
    token,
    { method: "POST", body }
  );
  return {
    name: String(result?.name || rawName),
    color: String(result?.color || body.color || "").trim().replace(/^#/, ""),
    description: String(result?.description || description || "")
  };
}
async function fetchRepoMilestones(owner, repo, fetchImpl, token = null, opts = {}) {
  const ctx = normalizeApiCtx(opts?.ctx), perPage = 100, maxPages = Math.max(1, Math.min(10, Number(opts.maxPages) || 5)), state = opts.state || "all", out = [];
  for (let page = 1; page <= maxPages; page++) {
    const url = githubRestUrl(
      `/repos/${owner}/${repo}/milestones?state=${encodeURIComponent(state)}&per_page=${perPage}&page=${page}&sort=due_on&direction=desc`,
      ctx
    ), batch = await apiJson(url, fetchImpl, token);
    if (!Array.isArray(batch) || !batch.length) break;
    for (const m of batch) {
      const number = Number(m?.number);
      !Number.isFinite(number) || number <= 0 || out.push({
        number,
        title: String(m?.title || `Milestone ${number}`),
        state: String(m?.state || ""),
        description: String(m?.description || ""),
        dueOn: m?.due_on || null
      });
    }
    if (batch.length < perPage) break;
  }
  return out;
}
async function createRepoMilestone(owner, repo, { title, description, state } = {}, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const rawTitle = String(title || "").trim();
  if (!rawTitle) throw new Error("Milestone title is required");
  const body = { title: rawTitle, state: state === "closed" ? "closed" : "open" };
  description != null && (body.description = String(description));
  const result = await apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/milestones`, ctx),
    fetchImpl,
    token,
    { method: "POST", body }
  );
  return {
    number: Number(result?.number) || 0,
    title: String(result?.title || rawTitle),
    state: String(result?.state || body.state),
    description: String(result?.description || description || ""),
    dueOn: result?.due_on || null
  };
}
async function fetchRepoTags(owner, repo, fetchImpl, token = null, opts = {}) {
  const ctx = normalizeApiCtx(opts?.ctx), perPage = 100, maxPages = Math.max(1, Math.min(20, Number(opts.maxPages) || 10)), out = [];
  for (let page = 1; page <= maxPages; page++) {
    const url = githubRestUrl(
      `/repos/${owner}/${repo}/tags?per_page=${perPage}&page=${page}`,
      ctx
    ), batch = await apiJson(url, fetchImpl, token);
    if (!Array.isArray(batch) || !batch.length) break;
    for (const t of batch) {
      const name = String(t?.name || "").trim(), sha = String(t?.commit?.sha || t?.sha || "").trim();
      name && out.push({
        name,
        sha,
        zipballUrl: t?.zipball_url || "",
        tarballUrl: t?.tarball_url || ""
      });
    }
    if (batch.length < perPage) break;
  }
  return out;
}
async function fetchTagsForCommits(owner, repo, shas, fetchImpl, token = null, opts = {}) {
  const want = new Set(
    (shas || []).map((s) => String(s || "").trim().toLowerCase()).filter(Boolean)
  );
  return want.size ? (await fetchRepoTags(owner, repo, fetchImpl, token, opts)).filter((t) => want.has(String(t.sha || "").toLowerCase())) : [];
}
async function mergePullRequest(owner, repo, pullNumber, {
  mergeMethod = "merge",
  commitTitle,
  commitMessage
} = {}, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const body = { merge_method: mergeMethod };
  return commitTitle != null && (body.commit_title = String(commitTitle)), commitMessage != null && (body.commit_message = String(commitMessage)), apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/pulls/${pullNumber}/merge`, ctx),
    fetchImpl,
    token,
    { method: "PUT", body }
  );
}
async function updatePullBranch(owner, repo, pullNumber, { expectedHeadSha } = {}, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const body = {};
  return expectedHeadSha && (body.expected_head_sha = String(expectedHeadSha)), apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/pulls/${pullNumber}/update-branch`, ctx),
    fetchImpl,
    token,
    { method: "PUT", body }
  );
}
async function deleteHeadBranch(owner, repo, branch, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const b = String(branch || "").trim().replace(/^refs\/heads\//, "");
  if (!b) throw new Error("Branch name required");
  const branchPath = b.split("/").filter(Boolean).map((seg) => encodeURIComponent(seg)).join("/");
  return apiSend(
    githubRestUrl(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/refs/heads/${branchPath}`,
      ctx
    ),
    fetchImpl,
    token,
    { method: "DELETE" }
  );
}
async function setIssueMilestone(owner, repo, issueNumber, milestoneNumber, fetchImpl, token, ctx = null) {
  return ctx = normalizeApiCtx(ctx), apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/issues/${issueNumber}`, ctx),
    fetchImpl,
    token,
    {
      method: "PATCH",
      body: { milestone: milestoneNumber == null ? null : Number(milestoneNumber) }
    }
  );
}
async function setPullRequestDraftStage(owner, repo, pullNumber, stage, fetchImpl, token, nodeId = null, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  let id = nodeId;
  if (id || (id = (await apiJson(
    githubRestUrl(`/repos/${owner}/${repo}/pulls/${pullNumber}`, ctx),
    fetchImpl,
    token
  ))?.node_id), !id) throw new Error("PR node_id unavailable for draft stage change");
  let buildFn = null;
  try {
    let mod = typeof globalThis < "u" ? globalThis.PRModalPrEditApi : null;
    if (!mod && typeof __require == "function")
      try {
        mod = __require("./modal/pure/pr-edit-api.js");
      } catch {
        mod = null;
      }
    buildFn = mod?.buildDraftStageGraphql;
  } catch {
    buildFn = null;
  }
  const gql = buildFn ? buildFn(stage === "ready" ? "ready" : "draft", id) : stage === "ready" ? {
    query: "mutation($id:ID!){markPullRequestReadyForReview(input:{pullRequestId:$id}){pullRequest{id isDraft}}}",
    variables: { id }
  } : {
    query: "mutation($id:ID!){convertPullRequestToDraft(input:{pullRequestId:$id}){pullRequest{id isDraft}}}",
    variables: { id }
  }, data = await apiGraphql(gql.query, gql.variables, fetchImpl, token, ctx);
  let parseFn = null;
  try {
    let mod = typeof globalThis < "u" ? globalThis.PRModalPrEditApi : null;
    if (!mod && typeof __require == "function")
      try {
        mod = __require("./modal/pure/pr-edit-api.js");
      } catch {
        mod = null;
      }
    parseFn = mod?.draftFromStageGraphqlData;
  } catch {
    parseFn = null;
  }
  let draft = null;
  if (typeof parseFn == "function")
    draft = parseFn(data);
  else if (data && typeof data == "object") {
    const pr = data.markPullRequestReadyForReview?.pullRequest || data.convertPullRequestToDraft?.pullRequest || null;
    pr && typeof pr.isDraft == "boolean" && (draft = pr.isDraft);
  }
  return typeof draft != "boolean" && (draft = stage !== "ready"), { draft: !!draft, data };
}
function findDanglingPrNumbers(pagePrNumbers, prs) {
  if (!Array.isArray(pagePrNumbers) || pagePrNumbers.length === 0)
    return [];
  const have = new Set((prs || []).map((pr) => pr.number)), dangling = [], seen = /* @__PURE__ */ new Set();
  for (const raw of pagePrNumbers) {
    const num = Number(raw);
    !Number.isFinite(num) || seen.has(num) || have.has(num) || (seen.add(num), dangling.push(num));
  }
  return dangling;
}
async function fetchOpenPullsPublic(owner, repo, fetchImpl, token = null, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const url = githubRestUrl(`/repos/${owner}/${repo}/pulls?state=open&per_page=100`, ctx), res = await fetchImpl(url, {
    headers: buildApiHeaders(token)
  });
  if (!res.ok) {
    const err = new Error(`GitHub API ${res.status}: ${res.statusText}`);
    throw err.status = res.status, err;
  }
  return (await res.json()).map(mapApiPullRequest);
}
async function fetchPrHeadProbe(owner, repo, number, fetchImpl, token = null, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const o = String(owner || "").trim(), r = String(repo || "").trim(), n = Number(number), empty = {
    headSha: "",
    baseSha: "",
    updatedAt: null,
    draft: !1,
    state: "",
    number: Number.isFinite(n) ? n : 0
  };
  if (!o || !r || !Number.isFinite(n) || n <= 0) return empty;
  try {
    const url = githubRestUrl(
      `/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}/pulls/${n}`,
      ctx
    ), res = await fetchImpl(url, { headers: buildApiHeaders(token) });
    if (!res.ok) {
      const err = new Error(`GitHub API ${res.status}: ${res.statusText}`);
      throw err.status = res.status, err;
    }
    const data = await res.json();
    return {
      headSha: String(data?.head?.sha || ""),
      baseSha: String(data?.base?.sha || ""),
      updatedAt: data?.updated_at || null,
      draft: !!data?.draft,
      state: String(data?.state || ""),
      number: Number(data?.number) || n
    };
  } catch (err) {
    if (err?.name === "AbortError" || /aborted|AbortError/i.test(String(err?.message || "")))
      throw err;
    return empty;
  }
}
async function fetchPullByNumber(owner, repo, pullNumber, fetchImpl, token = null, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const url = githubRestUrl(`/repos/${owner}/${repo}/pulls/${pullNumber}`, ctx), res = await fetchImpl(url, {
    headers: buildApiHeaders(token)
  });
  if (!res.ok) {
    const err = new Error(`GitHub API ${res.status}: ${res.statusText} (PR #${pullNumber})`);
    throw err.status = res.status, err.pullNumber = pullNumber, err;
  }
  const data = await res.json();
  return mapApiPullRequest(data);
}
async function fetchDanglingPulls(owner, repo, numbers, fetchImpl, token = null, ctx = null) {
  return ctx = normalizeApiCtx(ctx), numbers.length ? (await mapWithConcurrency(numbers, 5, async (pullNumber) => {
    try {
      return await fetchPullByNumber(owner, repo, pullNumber, fetchImpl, token, ctx);
    } catch (err) {
      if (err.status === 401 || err.status === 403)
        throw err;
      return console.warn(`[PR Tree] Skipping dangling PR #${pullNumber}:`, err.message || err), null;
    }
  })).filter(Boolean) : [];
}
async function fetchRepoAutolinks(owner, repo, fetchImpl, token = null, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const url = githubRestUrl(`/repos/${owner}/${repo}/autolinks`, ctx);
  try {
    const res = await fetchImpl(url, { headers: buildApiHeaders(token) });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data.filter((a) => a && typeof a.key_prefix == "string" && typeof a.url_template == "string").map((a) => ({
      key_prefix: a.key_prefix,
      url_template: a.url_template,
      is_alphanumeric: a.is_alphanumeric !== !1
    })) : [];
  } catch {
    return [];
  }
}
function buildAutolinkUrl(urlTemplate, num) {
  return String(urlTemplate).replace(/<num>/gi, num).replace(/\{num\}/gi, num);
}
function matchAutolinksInText(text, autolinks) {
  if (!text || !Array.isArray(autolinks) || autolinks.length === 0) return [];
  const found = [], seen = /* @__PURE__ */ new Set();
  for (const rule of autolinks) {
    const prefix = rule.key_prefix;
    if (!prefix) continue;
    const numClass = rule.is_alphanumeric !== !1 ? "(?:\\d+|[A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)*)" : "\\d+", re = new RegExp(
      `(^|[^A-Za-z0-9_])(${escapeRegExp(prefix)})(${numClass})`,
      "gi"
    );
    let m;
    for (; (m = re.exec(text)) !== null; ) {
      const key = `${m[2]}${m[3]}`, url = buildAutolinkUrl(rule.url_template, m[3]);
      !url || seen.has(url) || (seen.add(url), found.push({ key, url, prefix: m[2] }));
    }
  }
  return found;
}
function prMatchText(pr) {
  return pr ? [pr.title, pr.headRef, pr.baseRef, pr.body, pr.author].filter(Boolean).join(`
`) : "";
}
function attachMagicLinks(prs, autolinks) {
  return Array.isArray(prs) ? !Array.isArray(autolinks) || autolinks.length === 0 ? prs.map((pr) => ({ ...pr, magicLinks: pr.magicLinks || [] })) : prs.map((pr) => ({
    ...pr,
    magicLinks: matchAutolinksInText(prMatchText(pr), autolinks)
  })) : [];
}
async function fetchOpenPulls(owner, repo, fetchImpl, options = {}) {
  const {
    token = null,
    pagePrNumbers = [],
    includeAutolinks = !0
  } = options, ctx = normalizeApiCtx(options?.ctx), listed = await fetchOpenPullsPublic(owner, repo, fetchImpl, token, ctx), danglingNumbers = findDanglingPrNumbers(pagePrNumbers, listed);
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
      for (const pr of extras)
        byNumber.set(pr.number, pr);
      prs = [...byNumber.values()];
    }
  }
  if (!includeAutolinks)
    return attachMagicLinks(prs, []);
  const autolinks = await fetchRepoAutolinks(owner, repo, fetchImpl, token, ctx);
  return attachMagicLinks(prs, autolinks);
}
var REVIEW_THREAD_SHELL_FIELDS = `
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
  comments(first:1) {
    totalCount
    nodes {
      databaseId
      body
      path
      line
      createdAt
      author { login avatarUrl }
      # reviewId for first-paint review-group (cost stays 1 \u2014 measured on
      # callabo-server#2424 last:10/100 baseline vs +pullRequestReview).
      pullRequestReview { databaseId state }
    }
  }
`, REVIEW_THREAD_COMMENTS_FIELDS = `
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
      reactionGroups {
        content
        viewerHasReacted
        reactors {
          totalCount
        }
      }
    }
  }
`, REVIEW_THREADS_BY_IDS_NODE_SELECTION = `
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
    totalCount
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
      reactionGroups {
        content
        viewerHasReacted
        reactors {
          totalCount
        }
      }
    }
  }
`, REVIEW_THREADS_FIRST_QUERY = `
query ReviewThreadsFirstShell($owner:String!,$name:String!,$number:Int!,$n:Int!,$cursor:String){
  repository(owner:$owner,name:$name){
    pullRequest(number:$number){
      reviewThreads(first:$n, after:$cursor){
        totalCount
        pageInfo { hasNextPage hasPreviousPage startCursor endCursor }
        nodes { ${REVIEW_THREAD_SHELL_FIELDS} }
      }
    }
  }
}`, REVIEW_THREADS_LAST_QUERY = `
query ReviewThreadsLastShell($owner:String!,$name:String!,$number:Int!,$n:Int!,$cursor:String){
  repository(owner:$owner,name:$name){
    pullRequest(number:$number){
      reviewThreads(last:$n, before:$cursor){
        totalCount
        pageInfo { hasNextPage hasPreviousPage startCursor endCursor }
        nodes { ${REVIEW_THREAD_SHELL_FIELDS} }
      }
    }
  }
}`, REVIEW_THREADS_API_MAX = 100, REVIEW_THREADS_PAGE_SIZE = 100;
function mapReviewThreadNodes(allNodes) {
  try {
    const pure = typeof globalThis < "u" ? globalThis.PRModalReviewThreads : null;
    if (!(Array.isArray(allNodes) ? allNodes : []).some(
      (n) => (n?.comments?.nodes || []).some(
        (c) => c && (c.reactionGroups != null || c.diffHunk != null || c.pullRequestReview != null || c.replyTo != null)
      )
    ) && typeof pure?.mapGraphqlReviewThreadNodes == "function")
      return pure.mapGraphqlReviewThreadNodes(allNodes);
  } catch {
  }
  const pureRt = typeof globalThis < "u" ? globalThis.PRModalReviewThreads : null, threads = [], comments = [];
  for (const t of Array.isArray(allNodes) ? allNodes : []) {
    if (!t?.id) continue;
    const threadMeta = {
      threadNodeId: t.id,
      resolved: !!t.isResolved,
      isOutdated: !!t.isOutdated,
      path: t.path || "",
      diffSide: t.diffSide || "RIGHT",
      startDiffSide: t.startDiffSide || null,
      line: t.line ?? null,
      originalLine: t.originalLine ?? null,
      startLine: t.startLine ?? t.originalStartLine ?? null,
      subjectType: t.subjectType || null
    }, commentsConnPresent = t.comments != null && typeof t.comments == "object", commentsLoaded = commentsConnPresent ? typeof pureRt?.graphqlCommentsAreFullyLoaded == "function" ? !!pureRt.graphqlCommentsAreFullyLoaded(t.comments) : (() => {
      const nodes = t.comments?.nodes || [], total = t.comments?.totalCount;
      return nodes.length ? typeof total == "number" ? total <= nodes.length : !0 : total === 0;
    })() : !1, commentIds = [];
    if (commentsConnPresent)
      for (const node of t.comments?.nodes || []) {
        const mapped = mapGraphqlReviewCommentNode(node, threadMeta);
        mapped && (commentsLoaded || (mapped._commentsPreview = !0), comments.push(mapped), commentIds.push(mapped.id));
      }
    threads.push({
      threadNodeId: t.id,
      resolved: !!t.isResolved,
      outdated: !!t.isOutdated,
      path: t.path || "",
      line: t.line ?? t.originalLine ?? null,
      startLine: t.startLine ?? t.originalStartLine ?? null,
      side: t.diffSide || "RIGHT",
      commentIds,
      commentsLoaded,
      commentCount: typeof t.comments?.totalCount == "number" ? t.comments.totalCount : commentIds.length || null
    });
  }
  return { threads, comments };
}
function selectEagerCommentThreadIdsLocal(threads, opts = {}) {
  try {
    const pure = typeof globalThis < "u" ? globalThis.PRModalReviewThreads : null;
    if (typeof pure?.selectThreadIdsForEagerComments == "function")
      return pure.selectThreadIdsForEagerComments(threads, opts);
  } catch {
  }
  const list = Array.isArray(threads) ? threads : [], out = [];
  for (const t of list)
    !t?.threadNodeId || t.commentsLoaded === !0 || /^PRRT_/i.test(String(t.threadNodeId)) && (opts?.forceAll || !t.resolved) && out.push(String(t.threadNodeId));
  return out;
}
function mergeCommentsBulkIntoThreadsPage(shellPage, bulkPage) {
  try {
    const pure = typeof globalThis < "u" ? globalThis.PRModalReviewThreads : null;
    if (typeof pure?.mergeCommentsBulkIntoThreadsPage == "function")
      return pure.mergeCommentsBulkIntoThreadsPage(shellPage, bulkPage);
  } catch {
  }
  const shellThreads = Array.isArray(shellPage?.threads) ? shellPage.threads : [], bulkThreads = Array.isArray(bulkPage?.threads) ? bulkPage.threads : [], bulkComments = Array.isArray(bulkPage?.comments) ? bulkPage.comments : [], byId = new Map(
    bulkThreads.filter((t) => t?.threadNodeId).map((t) => [String(t.threadNodeId), t])
  ), threads = shellThreads.map((t) => {
    const id = t?.threadNodeId ? String(t.threadNodeId) : "", full = id ? byId.get(id) : null;
    if (!full)
      return { ...t, commentsLoaded: !!t.commentsLoaded };
    const fullObj = full && typeof full == "object" ? full : {};
    return {
      ...t,
      ...fullObj,
      commentsLoaded: !0,
      commentIds: Array.isArray(fullObj.commentIds) ? fullObj.commentIds : t.commentIds || []
    };
  }), loadedIds = new Set(
    threads.filter((t) => t.commentsLoaded).map((t) => String(t.threadNodeId))
  ), prevComments = Array.isArray(shellPage?.comments) ? shellPage.comments : [];
  let kept = [];
  try {
    const pure = typeof globalThis < "u" ? globalThis.PRModalReviewThreads : null;
    if (typeof pure?.retainShellCommentsAfterBulk == "function")
      kept = pure.retainShellCommentsAfterBulk(prevComments, loadedIds);
    else
      for (const c of prevComments) {
        if (!c?.threadNodeId) continue;
        const tid = String(c.threadNodeId);
        if (loadedIds.has(tid)) {
          if (c._commentsPending || c._commentsPreview) continue;
          kept.push(c);
          continue;
        }
        c._commentsPending && !String(c.body || "").trim() || kept.push(c);
      }
  } catch {
    kept = prevComments.slice();
  }
  const seen = new Set(kept.map((c) => String(c.id)));
  for (const c of bulkComments) {
    if (!c || c.id == null) continue;
    const k = String(c.id);
    seen.has(k) || (seen.add(k), kept.push(c));
  }
  let comments = kept;
  try {
    const pure = typeof globalThis < "u" ? globalThis.PRModalReviewThreads : null;
    if (typeof pure?.ensureShellPlaceholderComments == "function")
      comments = pure.ensureShellPlaceholderComments(threads, kept);
    else {
      for (const t of threads) {
        if (!t?.threadNodeId || t.commentsLoaded === !0) continue;
        const tid = String(t.threadNodeId);
        /^PRRT_/i.test(tid) && (kept.some((c) => c && String(c.threadNodeId) === tid) || kept.push({
          id: `shell:${tid}`,
          author: "",
          body: "",
          path: t.path || "",
          line: t.line ?? null,
          side: t.side || "RIGHT",
          threadNodeId: tid,
          resolved: !!t.resolved,
          outdated: !!t.outdated,
          pending: !1,
          _commentsPending: !0,
          commentsLoaded: !1
        }));
      }
      comments = kept;
    }
  } catch {
    comments = kept;
  }
  return {
    ...shellPage,
    threads,
    comments
  };
}
function chooseReviewThreadsTransportLocal(opts = {}) {
  try {
    const pure = typeof globalThis < "u" ? globalThis.PRModalReviewThreads : null;
    if (typeof pure?.chooseReviewThreadsTransport == "function")
      return pure.chooseReviewThreadsTransport(opts);
  } catch {
  }
  return opts?.preferRest === !0 ? "rest" : "graphql";
}
function buildRestReviewThreadsPageFromCommentsLocal(items, direction = "newest") {
  try {
    const pure = typeof globalThis < "u" ? globalThis.PRModalReviewThreads : null;
    if (typeof pure?.buildRestReviewThreadsPageFromComments == "function")
      return pure.buildRestReviewThreadsPageFromComments(items, direction);
  } catch {
  }
  const list = Array.isArray(items) ? items : [];
  if (!list.length)
    return {
      threads: [],
      comments: [],
      hasMore: !1,
      endCursor: null,
      startCursor: null,
      hasNextPage: !1,
      hasPreviousPage: !1,
      totalCount: 0,
      pageCount: 0,
      direction: direction || "newest",
      window: "newest",
      source: "rest"
    };
  const byId = /* @__PURE__ */ new Map();
  for (const c of list)
    c && c.id != null && byId.set(String(c.id), c);
  return {
    threads: list.filter((c) => {
      if (!c || c.id == null) return !1;
      const parent = c.inReplyToId ?? c.in_reply_to_id ?? null;
      return parent == null || !byId.has(String(parent));
    }).map((r) => {
      const replyIds = list.filter(
        (c) => c && String(c.inReplyToId ?? c.in_reply_to_id ?? "") === String(r.id)
      ).map((c) => c.id), threadNodeId = r.nodeId || r.threadNodeId || `rest-thread-${r.id}`, commentIds = [r.id, ...replyIds];
      for (const cid of commentIds) {
        const row = byId.get(String(cid));
        row && (row.threadNodeId = threadNodeId, row.loadWindow = "newest");
      }
      return {
        threadNodeId,
        resolved: !!(r.resolved ?? r.isResolved),
        outdated: !!r.outdated,
        path: r.path || "",
        line: r.line ?? r.originalLine ?? null,
        startLine: r.startLine ?? null,
        side: r.side || "RIGHT",
        commentIds,
        commentsLoaded: !0,
        loadWindow: "newest"
      };
    }),
    comments: list,
    totalCount: list.length,
    startCursor: null,
    endCursor: null,
    hasNextPage: !1,
    hasPreviousPage: !1,
    hasMore: !1,
    pageCount: 1,
    direction: direction || "newest",
    window: "newest",
    source: "rest"
  };
}
async function restReviewThreadsFallbackPage(owner, repo, pullNumber, direction, fetchImpl, token, ctx, opts = {}) {
  const empty = buildRestReviewThreadsPageFromCommentsLocal([], direction), perPage = Math.max(
    1,
    Math.min(
      REVIEW_THREADS_API_MAX,
      Number(opts.perPage) || REVIEW_THREADS_PAGE_SIZE
    )
  ), pageNum = Math.max(1, Number(opts.page) || 1), knownCount = opts.reviewCommentsCount != null && Number.isFinite(Number(opts.reviewCommentsCount)) ? Number(opts.reviewCommentsCount) : null;
  if (knownCount != null && knownCount <= 0)
    return {
      ...empty,
      totalCount: 0,
      source: "rest",
      reviewCommentsCount: 0
    };
  try {
    const restPage = await fetchPrCommentsPage(
      owner,
      repo,
      pullNumber,
      "review",
      { page: pageNum, perPage, preferNewest: !0 },
      fetchImpl,
      token,
      ctx
    ), items = Array.isArray(restPage?.items) ? restPage.items : [];
    if (!items.length)
      return {
        ...empty,
        totalCount: knownCount ?? 0,
        source: "rest",
        reviewCommentsCount: knownCount
      };
    const page = buildRestReviewThreadsPageFromCommentsLocal(items, direction), hasMoreComments = knownCount != null && pageNum * perPage < knownCount || knownCount == null && items.length >= perPage, threadTotal = hasMoreComments ? (
      // Unknown full thread total while more comment pages remain
      Math.max(page.threads.length, Number(page.totalCount) || 0)
    ) : page.threads.length;
    return {
      ...page,
      totalCount: threadTotal,
      hasMore: hasMoreComments,
      hasPreviousPage: hasMoreComments && (direction === "newest" || !direction),
      hasNextPage: hasMoreComments,
      pageCount: 1,
      restPage: pageNum,
      restPerPage: perPage,
      reviewCommentsCount: knownCount,
      source: "rest"
    };
  } catch (err) {
    if (err?.name === "AbortError" || /aborted|AbortError/i.test(String(err?.message || "")))
      throw err;
    return empty;
  }
}
async function fetchReviewThreadsPage(owner, repo, pullNumber, {
  direction = "newest",
  cursor = null,
  pageSize = REVIEW_THREADS_PAGE_SIZE,
  preferRest = null,
  forceGraphql = !1,
  forceFull = !1,
  reviewCommentsCount = null,
  restPage = 1,
  /** When true, bulk-fetch comments for every shell thread (rare). */
  forceAllComments = !1,
  /**
   * When true, return shell-only (no eager by-ids). Host stages progress as
   * threads → comments → reactions by calling by-ids separately.
   */
  skipEagerComments = !1
} = {}, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const empty = {
    threads: [],
    comments: [],
    hasMore: !1,
    endCursor: null,
    startCursor: null,
    hasNextPage: !1,
    hasPreviousPage: !1,
    totalCount: null,
    pageCount: 0,
    direction,
    source: null
  }, n = Number(pullNumber);
  if (!Number.isFinite(n)) return empty;
  const size = Math.max(
    1,
    Math.min(REVIEW_THREADS_API_MAX, Number(pageSize) || REVIEW_THREADS_PAGE_SIZE)
  ), dir = String(direction || "newest");
  if (chooseReviewThreadsTransportLocal({
    direction: dir,
    cursor,
    preferRest,
    forceGraphql,
    forceFull
  }) === "rest")
    return { ...await restReviewThreadsFallbackPage(
      owner,
      repo,
      n,
      dir,
      fetchImpl,
      token,
      ctx,
      {
        perPage: size,
        page: restPage,
        reviewCommentsCount
      }
    ), source: "rest" };
  if (!token) return { ...empty, source: null };
  const useLast = dir === "newest" || dir === "older", query = useLast ? REVIEW_THREADS_LAST_QUERY : REVIEW_THREADS_FIRST_QUERY;
  try {
    const conn = (await apiGraphql(
      query,
      {
        owner,
        name: repo,
        number: n,
        n: size,
        cursor: cursor || null
      },
      fetchImpl,
      token,
      ctx
    ))?.repository?.pullRequest?.reviewThreads, nodes = conn?.nodes || [], pageInfo = conn?.pageInfo || {}, mapped = mapReviewThreadNodes(nodes), windowTag = dir === "newest" || dir === "older" ? "newest" : "oldest";
    for (const t of mapped.threads)
      t.loadWindow = windowTag, t.commentsLoaded !== !0 && (t.commentsLoaded = !1);
    let page = {
      threads: mapped.threads,
      comments: mapped.comments,
      totalCount: typeof conn?.totalCount == "number" ? conn.totalCount : null,
      startCursor: pageInfo.startCursor || null,
      endCursor: pageInfo.endCursor || null,
      hasNextPage: !!pageInfo.hasNextPage,
      hasPreviousPage: !!pageInfo.hasPreviousPage,
      // Convenience for dual-window UI
      hasMore: useLast ? !!pageInfo.hasPreviousPage : !!pageInfo.hasNextPage,
      pageCount: 1,
      direction: dir,
      window: windowTag,
      source: "graphql",
      shellOnly: !0
    };
    if (skipEagerComments)
      page.shellOnly = !0, page.eagerCommentIds = [];
    else {
      const eagerIds = selectEagerCommentThreadIdsLocal(page.threads, {
        forceAll: !!forceAllComments
      });
      if (eagerIds.length)
        try {
          const bulk = await fetchReviewThreadsByIds(
            eagerIds,
            fetchImpl,
            token,
            ctx
          );
          page = mergeCommentsBulkIntoThreadsPage(page, bulk), page.shellOnly = !1, page.eagerCommentIds = eagerIds;
        } catch {
        }
    }
    try {
      const pure = typeof globalThis < "u" ? globalThis.PRModalReviewThreads : null;
      if (typeof pure?.ensureShellPlaceholderComments == "function")
        page = {
          ...page,
          comments: pure.ensureShellPlaceholderComments(
            page.threads,
            page.comments
          )
        };
      else {
        const covered = new Set(
          (page.comments || []).map((c) => c?.threadNodeId ? String(c.threadNodeId) : "").filter(Boolean)
        ), extra = [];
        for (const t of page.threads || []) {
          const tid = t?.threadNodeId ? String(t.threadNodeId) : "";
          !tid || !/^PRRT_/i.test(tid) || covered.has(tid) || t.commentsLoaded !== !0 && extra.push({
            id: `shell:${tid}`,
            author: "",
            body: "",
            path: t.path || "",
            line: t.line ?? null,
            side: t.side || "RIGHT",
            threadNodeId: tid,
            resolved: !!t.resolved,
            outdated: !!t.outdated,
            pending: !1,
            _commentsPending: !0,
            commentsLoaded: !1
          });
        }
        extra.length && (page = { ...page, comments: [...page.comments || [], ...extra] });
      }
    } catch {
    }
    return page;
  } catch (err) {
    throw err?.name === "AbortError" || /aborted|AbortError/i.test(String(err?.message || "")), err;
  }
}
function isGraphqlReviewThreadNodeIdLocal(id) {
  try {
    const pure = typeof globalThis < "u" ? globalThis.PRModalReviewThreads : null;
    if (typeof pure?.isGraphqlReviewThreadNodeId == "function")
      return !!pure.isGraphqlReviewThreadNodeId(id);
  } catch {
  }
  return /^PRRT_/i.test(String(id || "").trim());
}
function collectUnresolvedThreadNodeIds(detail) {
  const dropped = detail?._droppedThreadNodeIds instanceof Set ? detail._droppedThreadNodeIds : new Set(
    Array.isArray(detail?._droppedThreadNodeIds) ? detail._droppedThreadNodeIds.map(String) : []
  ), ids = /* @__PURE__ */ new Set();
  for (const t of Array.isArray(detail?.reviewThreads) ? detail.reviewThreads : []) {
    if (!t?.threadNodeId || t.resolved) continue;
    const id = String(t.threadNodeId);
    dropped.has(id) || isGraphqlReviewThreadNodeIdLocal(id) && ids.add(id);
  }
  const list = Array.isArray(detail?.reviewComments) ? detail.reviewComments : [], byId = /* @__PURE__ */ new Map();
  for (const c of list)
    c && c.id != null && byId.set(String(c.id), c);
  for (const c of list) {
    if (!c?.threadNodeId || c.resolved) continue;
    const id = String(c.threadNodeId);
    if (dropped.has(id) || !isGraphqlReviewThreadNodeIdLocal(id)) continue;
    const parentId = c.inReplyToId ?? c.in_reply_to_id ?? null;
    parentId != null && byId.has(String(parentId)) || ids.add(id);
  }
  return [...ids];
}
async function fetchReviewThreadsByIds(threadNodeIds, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const empty = {
    threads: [],
    comments: [],
    pageCount: 0,
    direction: "refresh",
    totalCount: null,
    hasPreviousPage: !1,
    hasNextPage: !1,
    requestedThreadIds: [],
    missingThreadIds: []
  };
  if (!token) return empty;
  const ids = [
    ...new Set(
      (Array.isArray(threadNodeIds) ? threadNodeIds : []).map((id) => String(id || "").trim()).filter(Boolean)
    )
  ];
  if (!ids.length) return empty;
  const query = `
query ReviewThreadsByIdsFullCostFlat($ids:[ID!]!){
  nodes(ids:$ids){
    ... on PullRequestReviewThread {
      ${REVIEW_THREADS_BY_IDS_NODE_SELECTION}
    }
  }
}`, byIdsQueryMeta = {
    qName: "ReviewThreadsByIdsFullCostFlat",
    hasFirst1: /comments\s*\(\s*first\s*:\s*1\s*\)/.test(query),
    hasFirst100: /comments\s*\(\s*first\s*:\s*100\s*\)/.test(query),
    hasReactorsFirst: /reactors\s*\(\s*first\s*:/.test(query)
  }, allThreads = [], allComments = [], foundIds = /* @__PURE__ */ new Set(), confirmedMissing = /* @__PURE__ */ new Set();
  let pages = 0;
  const confirmedMissingFromNodes = (chunkIds, rawNodes) => {
    try {
      const pure = typeof globalThis < "u" ? globalThis.PRModalReviewThreads : null;
      if (typeof pure?.confirmedMissingThreadIdsFromNodes == "function")
        return pure.confirmedMissingThreadIdsFromNodes(chunkIds, rawNodes);
    } catch {
    }
    if (!Array.isArray(rawNodes) || !chunkIds.length) return [];
    const missing = [], n = Math.min(chunkIds.length, rawNodes.length);
    for (let j = 0; j < n; j++)
      rawNodes[j] == null && missing.push(String(chunkIds[j]));
    return missing;
  };
  for (let i = 0; i < ids.length; i += REVIEW_THREADS_API_MAX) {
    const chunk = ids.slice(i, i + REVIEW_THREADS_API_MAX);
    try {
      const data = await apiGraphql(query, { ids: chunk }, fetchImpl, token, ctx), rawNodes = Array.isArray(data?.nodes) ? data.nodes : null;
      if (!rawNodes) {
        console.warn(
          "[pr-plus] fetchReviewThreadsByIds chunk: missing nodes[] \u2014 not marking missing"
        );
        continue;
      }
      for (const mid of confirmedMissingFromNodes(chunk, rawNodes))
        confirmedMissing.add(String(mid));
      const nodes = rawNodes.filter(Boolean), mapped = mapReviewThreadNodes(nodes);
      for (const t of mapped.threads)
        t.loadWindow = t.loadWindow || "refresh", t.threadNodeId && foundIds.add(String(t.threadNodeId));
      for (const n of nodes)
        n?.id && foundIds.add(String(n.id));
      allThreads.push(...mapped.threads), allComments.push(...mapped.comments), pages += 1;
    } catch (err) {
      console.warn(
        "[pr-plus] fetchReviewThreadsByIds chunk failed",
        err?.message || err
      );
    }
  }
  return {
    threads: allThreads,
    comments: allComments,
    pageCount: pages,
    direction: "refresh",
    totalCount: null,
    hasPreviousPage: !1,
    hasNextPage: !1,
    requestedThreadIds: ids,
    // Confirmed remote-null only — failed/unknown chunks stay out.
    missingThreadIds: [...confirmedMissing]
  };
}
function dropReviewThreadsFromDetail(detail, threadNodeIds) {
  if (!detail) return detail;
  const drop = new Set(
    [...threadNodeIds || []].map((id) => String(id || "").trim()).filter(Boolean)
  );
  if (!drop.size) return detail;
  const prevRc = Array.isArray(detail.reviewComments) ? detail.reviewComments : [], prevTh = Array.isArray(detail.reviewThreads) ? detail.reviewThreads : [], droppedCommentIds = [], reviewComments = prevRc.filter((c) => {
    if (!c) return !1;
    const tid = c.threadNodeId ? String(c.threadNodeId) : "";
    return tid && drop.has(tid) ? (c.id != null && droppedCommentIds.push(String(c.id)), !1) : !0;
  }), reviewThreads = prevTh.filter(
    (t) => !t?.threadNodeId || !drop.has(String(t.threadNodeId))
  ), deleted = new Set(
    [
      ...detail._deletedReviewCommentIds instanceof Set || Array.isArray(detail._deletedReviewCommentIds) ? detail._deletedReviewCommentIds : [],
      ...droppedCommentIds
    ].map(String)
  ), prevMeta = detail.reviewThreadsMeta || emptyReviewThreadsMeta(), filterIdList = (list) => (Array.isArray(list) ? list : []).map(String).filter((id) => id && !drop.has(id)), loadedThreadCount = reviewThreads.length, totalCount = Math.max(
    0,
    Number(prevMeta.totalCount) || loadedThreadCount
  ), nextTotal = Number.isFinite(Number(prevMeta.totalCount)) && Number(prevMeta.totalCount) >= drop.size ? Math.max(loadedThreadCount, Number(prevMeta.totalCount) - drop.size) : totalCount, hiddenCount = Math.max(0, nextTotal - loadedThreadCount), prevDroppedThreads = detail._droppedThreadNodeIds instanceof Set || Array.isArray(detail._droppedThreadNodeIds) ? detail._droppedThreadNodeIds : [], droppedThreads = new Set([...prevDroppedThreads, ...drop].map(String));
  return {
    ...detail,
    reviewComments,
    reviewThreads,
    reviewCommentsMeta: {
      ...detail.reviewCommentsMeta || {},
      loadedCount: reviewComments.length
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
      hasOlder: hiddenCount > 0 && !!prevMeta.hasOlder,
      hasNewerFromOldest: hiddenCount > 0 && !!prevMeta.hasNewerFromOldest
    },
    _deletedReviewCommentIds: deleted.size ? deleted : detail._deletedReviewCommentIds,
    // Never re-request these PRRT ids in collectUnresolvedThreadNodeIds
    _droppedThreadNodeIds: droppedThreads
  };
}
async function fetchPullReviewThreadsBundle(owner, repo, pullNumber, fetchImpl, token, opts = {}) {
  const ctx = normalizeApiCtx(opts?.ctx);
  if (!token)
    return {
      threads: [],
      comments: [],
      hasMore: !1,
      endCursor: null,
      startCursor: null,
      pageCount: 0,
      totalCount: 0,
      reviewThreadsMeta: emptyReviewThreadsMeta()
    };
  const lastPageSize = Math.min(
    REVIEW_THREADS_API_MAX,
    Number(opts.pageSize) || REVIEW_THREADS_PAGE_SIZE
  ), direction = String(opts.direction || "newest").toLowerCase() === "oldest" ? "oldest" : "newest", page = await fetchReviewThreadsPage(
    owner,
    repo,
    pullNumber,
    {
      direction,
      cursor: null,
      pageSize: lastPageSize,
      preferRest: !1,
      forceGraphql: !0,
      reviewCommentsCount: opts.reviewCommentsCount
    },
    fetchImpl,
    token,
    ctx
  ), totalCount = Number(page.totalCount) || page.threads.length, threads = [...page.threads || []], comments = [...page.comments || []], newestIds = threads.map((t) => t.threadNodeId).filter(Boolean), loaded = threads.length, hiddenCount = Math.max(0, totalCount - loaded), hasOlder = direction === "newest" ? !!page.hasPreviousPage : !!page.hasNextPage, meta = {
    totalCount,
    hiddenCount,
    loadedThreadCount: loaded,
    loadedCommentCount: comments.length,
    pagesLoaded: 1,
    newestStartCursor: page.startCursor || null,
    newestEndCursor: page.endCursor || null,
    hasOlder,
    // Dual-window retired
    oldestStartCursor: null,
    oldestEndCursor: null,
    hasNewerFromOldest: !1,
    newestThreadIds: newestIds,
    oldestThreadIds: [],
    hasMore: hiddenCount > 0 || hasOlder,
    endCursor: page.startCursor || null,
    direction,
    source: page.source || "graphql"
  };
  return {
    threads,
    comments,
    hasMore: meta.hasMore,
    endCursor: meta.endCursor,
    startCursor: page.startCursor || null,
    pageCount: meta.pagesLoaded,
    totalCount,
    reviewThreadsMeta: meta
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
    hasOlder: !1,
    oldestStartCursor: null,
    oldestEndCursor: null,
    hasNewerFromOldest: !1,
    newestThreadIds: [],
    oldestThreadIds: [],
    hasMore: !1,
    endCursor: null,
    direction: "newest"
  };
}
function mergeReviewThreadsPageIntoDetail(detail, page, direction = "older") {
  if (!detail) return detail;
  const dir = String(direction || page?.direction || "older"), prevMeta = detail.reviewThreadsMeta || emptyReviewThreadsMeta(), prevRc = Array.isArray(detail.reviewComments) ? detail.reviewComments : [], prevTh = Array.isArray(detail.reviewThreads) ? detail.reviewThreads : [], missingIds = (() => {
    try {
      const pure = typeof globalThis < "u" ? globalThis.PRModalReviewThreads : null;
      if (typeof pure?.resolveMissingThreadIdsForDrop == "function")
        return pure.resolveMissingThreadIdsForDrop(page);
    } catch {
    }
    return Array.isArray(page?.missingThreadIds) ? [
      ...new Set(
        page.missingThreadIds.map((id) => String(id || "").trim()).filter(Boolean)
      )
    ] : [];
  })();
  let baseRc = prevRc, reviewComments;
  if ((dir === "refresh" || dir === "ids") && (page?.threads || []).length) {
    const refreshed = new Set(
      (page.threads || []).map((t) => t?.threadNodeId ? String(t.threadNodeId) : "").filter(Boolean)
    );
    try {
      const pure = typeof globalThis < "u" ? globalThis.PRModalReviewThreads : null;
      typeof pure?.hydrateReviewCommentsInPlace == "function" && (reviewComments = pure.hydrateReviewCommentsInPlace(
        prevRc,
        page?.comments || [],
        refreshed
      ));
    } catch {
    }
    reviewComments || (baseRc = prevRc.filter(
      (c) => !c?.threadNodeId || !refreshed.has(String(c.threadNodeId))
    ), reviewComments = mergePendingReviewComments(baseRc, page?.comments || []));
  } else {
    const deferredShellIds = /* @__PURE__ */ new Set(), pageThreadIds = /* @__PURE__ */ new Set();
    if (page?.source === "graphql" && Array.isArray(page?.threads)) {
      for (const t of page.threads) {
        if (!t?.threadNodeId) continue;
        const id = String(t.threadNodeId);
        pageThreadIds.add(id), t.commentsLoaded === !1 && deferredShellIds.add(id);
      }
      pageThreadIds.size && (baseRc = baseRc.filter((c) => {
        if (!c) return !1;
        const tid = c.threadNodeId != null ? String(c.threadNodeId) : "";
        return !(tid.startsWith("rest-thread-") || pageThreadIds.has(tid) || deferredShellIds.has(tid));
      }));
    }
    reviewComments = mergePendingReviewComments(baseRc, page?.comments || []);
  }
  const resolvedByThread = /* @__PURE__ */ new Map();
  for (const t of page?.threads || [])
    t?.threadNodeId && resolvedByThread.set(String(t.threadNodeId), !!t.resolved);
  const stampedCommentsRaw = resolvedByThread.size === 0 ? reviewComments : reviewComments.map((c) => {
    if (!c?.threadNodeId) return c;
    const key = String(c.threadNodeId);
    return resolvedByThread.has(key) ? { ...c, resolved: resolvedByThread.get(key) } : c;
  }), realCommentThreadIds = /* @__PURE__ */ new Set();
  for (const c of stampedCommentsRaw)
    c && !c._commentsPending && c.threadNodeId && realCommentThreadIds.add(String(c.threadNodeId));
  let stampedComments = stampedCommentsRaw.filter((c) => c?._commentsPending ? !realCommentThreadIds.has(String(c.threadNodeId || "")) : !0);
  try {
    const pure = typeof globalThis < "u" ? globalThis.PRModalReviewThreads : null, shellThreads = Array.isArray(page?.threads) ? page.threads : [];
    if (page?.source === "graphql" && dir !== "ids" && dir !== "refresh" && typeof pure?.ensureShellPlaceholderComments == "function")
      stampedComments = pure.ensureShellPlaceholderComments(
        shellThreads,
        stampedComments
      );
    else if (page?.source === "graphql" && dir !== "ids" && dir !== "refresh") {
      const covered = new Set(
        stampedComments.map((c) => c?.threadNodeId ? String(c.threadNodeId) : "").filter(Boolean)
      );
      for (const t of shellThreads) {
        const tid = t?.threadNodeId ? String(t.threadNodeId) : "";
        !tid || !/^PRRT_/i.test(tid) || covered.has(tid) || t.commentsLoaded !== !0 && (stampedComments.push({
          id: `shell:${tid}`,
          author: "",
          body: "",
          path: t.path || "",
          line: t.line ?? null,
          side: t.side || "RIGHT",
          threadNodeId: tid,
          resolved: !!t.resolved,
          outdated: !!t.outdated,
          pending: !1,
          _commentsPending: !0,
          commentsLoaded: !1
        }), covered.add(tid));
      }
    }
  } catch {
  }
  const thById = new Map(
    prevTh.map((t) => [String(t.threadNodeId), t]).filter(([k]) => k && k !== "undefined")
  );
  for (const t of page?.threads || [])
    if (t?.threadNodeId) {
      const prevT = thById.get(String(t.threadNodeId)) || {}, mergedT = {
        ...prevT,
        ...t
      };
      page?.source === "graphql" && t.commentsLoaded === !1 && dir !== "ids" && dir !== "refresh" ? (mergedT.commentsLoaded = !1, mergedT.commentIds = Array.isArray(t.commentIds) ? t.commentIds : []) : prevT.commentsLoaded === !0 || t.commentsLoaded === !0 ? mergedT.commentsLoaded = !0 : (t.commentsLoaded === !1 || prevT.commentsLoaded === !1) && (mergedT.commentsLoaded = !!(Array.isArray(mergedT.commentIds) && mergedT.commentIds.length > 0)), thById.set(String(t.threadNodeId), mergedT);
    }
  const reviewThreads = [...thById.values()];
  let newestIds = new Set((prevMeta.newestThreadIds || []).map(String));
  const pageIds = (page?.threads || []).map((t) => t.threadNodeId).filter(Boolean).map(String);
  let newestStartCursor = prevMeta.newestStartCursor, newestEndCursor = prevMeta.newestEndCursor, hasOlder = prevMeta.hasOlder;
  if (!(dir === "refresh" || dir === "ids") && (dir === "newest" || dir === "older" || dir === "oldest" || dir === "newer")) {
    for (const id of pageIds) newestIds.add(id);
    page?.startCursor && (newestStartCursor = page.startCursor), page?.endCursor && (dir === "newest" || dir === "older") && (newestEndCursor = page.endCursor), dir === "newest" || dir === "older" ? hasOlder = !!page?.hasPreviousPage : hasOlder = !!page?.hasNextPage;
  }
  const isRest = page?.source === "rest", totalCount = isRest ? page?.hasMore ? Math.max(
    reviewThreads.length,
    typeof page?.totalCount == "number" ? page.totalCount : 0,
    Number(prevMeta.totalCount) || 0
  ) : reviewThreads.length : typeof page?.totalCount == "number" ? page.totalCount : Number(prevMeta.totalCount) || reviewThreads.length, loadedThreadCount = reviewThreads.length, hiddenCount = isRest ? page?.hasMore ? Math.max(1, totalCount - loadedThreadCount) : 0 : Math.max(0, totalCount - loadedThreadCount), restHasMore = isRest && !!page?.hasMore, meta = {
    ...prevMeta,
    totalCount,
    hiddenCount,
    loadedThreadCount,
    loadedCommentCount: stampedComments.length,
    pagesLoaded: dir === "refresh" || dir === "ids" ? Number(prevMeta.pagesLoaded) || 0 : (Number(prevMeta.pagesLoaded) || 0) + (page?.pageCount || 1),
    newestStartCursor,
    newestEndCursor,
    hasOlder: isRest ? restHasMore : hiddenCount > 0 && hasOlder,
    // Dual-window retired
    oldestStartCursor: null,
    oldestEndCursor: null,
    hasNewerFromOldest: !1,
    newestThreadIds: [...newestIds],
    oldestThreadIds: [],
    hasMore: isRest ? restHasMore : hiddenCount > 0,
    endCursor: newestStartCursor,
    // REST multi-page bookkeeping for load-all
    ...isRest ? {
      source: "rest",
      restPage: page?.restPage != null ? Number(page.restPage) : Number(prevMeta.restPage) || 1,
      restPerPage: page?.restPerPage != null ? Number(page.restPerPage) : Number(prevMeta.restPerPage) || null
    } : page?.source ? { source: page.source } : {}
  };
  let next = {
    ...detail,
    reviewComments: stampedComments,
    reviewThreads,
    reviewCommentsMeta: {
      ...detail.reviewCommentsMeta || {},
      loadedCount: stampedComments.length,
      hasMore: meta.hasMore
    },
    reviewThreadsMeta: meta
  };
  return (dir === "refresh" || dir === "ids") && missingIds.length && (next = dropReviewThreadsFromDetail(next, missingIds)), next;
}
async function fetchPullReviewThreads(owner, repo, pullNumber, fetchImpl, token) {
  try {
    return (await fetchPullReviewThreadsBundle(
      owner,
      repo,
      pullNumber,
      fetchImpl,
      token
    )).threads || [];
  } catch {
    return [];
  }
}
async function fetchPrDetail(owner, repo, pullNumber, fetchImpl, token = null, opts = {}) {
  const ctx = normalizeApiCtx(opts?.ctx), base = githubRestUrl(`/repos/${owner}/${repo}`, ctx), n = Number(pullNumber), threadsMaxPages = opts.skipReviewThreads ? 0 : Math.max(1, Math.min(20, Number(opts.threadsMaxPages) || 1)), timings = {}, tTotal0 = fetchNowMs(), PARALLEL_REST_KEYS = ["pull", "issue", "viewerLogin", "autolinks"], tParallel0 = fetchNowMs(), batchOpt = { batchStart: tParallel0 }, bust = () => `_prp=${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`, noCache = {
    cache: "no-store"
  };
  let [pr, issue, viewerLogin, autolinks] = await Promise.all([
    timedFetch(
      timings,
      "pull",
      // Bust intermediary caches so hard-reopen after modal meta writes sees
      // the same milestone/title as authenticated `gh api` (e2e MB3/MB7).
      apiJson(`${base}/pulls/${n}?${bust()}`, fetchImpl, token, noCache),
      null,
      batchOpt
    ),
    token ? timedFetch(
      timings,
      "issue",
      apiJson(`${base}/issues/${n}?${bust()}`, fetchImpl, token, noCache).catch(
        (err) => {
          if (err?.name === "AbortError" || /aborted|AbortError/i.test(String(err?.message || "")))
            throw err;
          return null;
        }
      ),
      null,
      batchOpt
    ) : Promise.resolve(null),
    timedFetch(
      timings,
      "viewerLogin",
      fetchViewerLogin(fetchImpl, token, ctx),
      null,
      batchOpt
    ),
    timedFetch(
      timings,
      "autolinks",
      fetchRepoAutolinks(owner, repo, fetchImpl, token, ctx),
      (r) => `(${Array.isArray(r) ? r.length : 0} links)`,
      batchOpt
    )
  ]);
  if (pr && issue && typeof issue == "object" && (issue.milestone && (pr = { ...pr, milestone: issue.milestone }), Array.isArray(issue.labels) && (!Array.isArray(pr.labels) || pr.labels.length === 0) && issue.labels.length > 0 && (pr = { ...pr, labels: issue.labels }), Array.isArray(issue.assignees) && (!Array.isArray(pr.assignees) || pr.assignees.length === 0) && issue.assignees.length > 0 && (pr = { ...pr, assignees: issue.assignees })), pr && !pr.milestone && token)
    try {
      const issueRetry = await timedFetch(
        timings,
        "issueMilestoneRetry",
        apiJson(`${base}/issues/${n}?${bust()}`, fetchImpl, token, noCache),
        null,
        batchOpt
      );
      if (issueRetry?.milestone)
        pr = { ...pr, milestone: issueRetry.milestone };
      else {
        const pullRetry = await timedFetch(
          timings,
          "pullMilestoneRetry",
          apiJson(`${base}/pulls/${n}?${bust()}`, fetchImpl, token, noCache),
          null,
          batchOpt
        );
        pullRetry?.milestone && (pr = { ...pr, milestone: pullRetry.milestone });
      }
    } catch (err) {
      if (err?.name === "AbortError" || /aborted|AbortError/i.test(String(err?.message || "")))
        throw err;
    }
  const parallelWall = fetchNowMs() - tParallel0;
  timings.coreParallelWall = Math.round(parallelWall), logParallelRestSummary(timings, PARALLEL_REST_KEYS, parallelWall), timings.files = 0, timings.issueComments = 0, timings.reviews = 0, timings.commits = 0, timings.commitStatus = 0, timings.checkRuns = 0, timings.sidebarMeta = 0, timings.gitattributes = 0;
  const files = [], commentsPage = {
    items: [],
    meta: {
      page: 1,
      perPage: COMMENT_PAGE_SIZE,
      hasMore: !1,
      nextPage: null,
      order: "from-end",
      loadedCount: 0
    }
  }, reviews = [];
  pr = await resolvePrMergeability(pr, base, n, fetchImpl, token, timings, {
    owner,
    repo,
    apiCtx: ctx
  });
  let repoMergeFlags = extractRepoMergeMethodFlags(pr?.base?.repo) || extractRepoMergeMethodFlags(pr?.head?.repo) || null, viewerCanMergeAsAdmin = extractViewerCanMergeAsAdmin(pr?.base?.repo) ?? extractViewerCanMergeAsAdmin(pr?.head?.repo) ?? null;
  if (!repoMergeFlags || viewerCanMergeAsAdmin == null)
    try {
      const repoJson = await timedFetch(
        timings,
        "repoMergeSettings",
        apiJson(base, fetchImpl, token),
        (r) => `(merge=${r?.allow_merge_commit} squash=${r?.allow_squash_merge} rebase=${r?.allow_rebase_merge} admin=${r?.permissions?.admin})`
      );
      repoMergeFlags || (repoMergeFlags = extractRepoMergeMethodFlags(repoJson)), viewerCanMergeAsAdmin == null && (viewerCanMergeAsAdmin = extractViewerCanMergeAsAdmin(repoJson));
    } catch (err) {
      if (err?.name === "AbortError" || /aborted|AbortError/i.test(String(err?.message || "")))
        throw err;
      timings.repoMergeSettings = timings.repoMergeSettings || 0, repoMergeFlags || (repoMergeFlags = null);
    }
  else
    timings.repoMergeSettings = 0;
  const subscription = await timedFetch(
    timings,
    "subscription",
    token ? fetchPullRequestSubscription(
      owner,
      repo,
      n,
      fetchImpl,
      token,
      pr?.node_id || null,
      ctx
    ) : Promise.resolve(null)
  ), comments = commentsPage?.items || [];
  let reviewThreadBundle = {
    threads: [],
    comments: [],
    hasMore: !1,
    endCursor: null,
    pageCount: 0
  };
  if (token && threadsMaxPages > 0 ? reviewThreadBundle = await timedFetch(
    timings,
    "reviewThreads",
    fetchPullReviewThreadsBundle(owner, repo, n, fetchImpl, token, {
      cursor: opts.threadsCursor || null,
      maxPages: threadsMaxPages,
      ctx
    }).catch((err) => {
      if (err?.name === "AbortError" || /aborted|AbortError/i.test(String(err?.message || "")))
        throw err;
      return reviewThreadBundle;
    }),
    (b) => `(${(b?.threads || []).length} threads, ${(b?.comments || []).length} comments)`
  ) : timings.reviewThreads = 0, token && threadsMaxPages > 0 && !(Array.isArray(reviewThreadBundle?.comments) && reviewThreadBundle.comments.length > 0))
    try {
      const restPage = await timedFetch(
        timings,
        "reviewThreadsRest",
        fetchPrCommentsPage(
          owner,
          repo,
          n,
          "review",
          { page: 1, perPage: 100, preferNewest: !0 },
          fetchImpl,
          token,
          ctx
        ).catch((err) => {
          if (err?.name === "AbortError" || /aborted|AbortError/i.test(String(err?.message || "")))
            throw err;
          return null;
        }),
        (p) => `(${(p?.items || []).length} rest review comments)`
      ), items = Array.isArray(restPage?.items) ? restPage.items : [];
      if (items.length) {
        const byId = /* @__PURE__ */ new Map();
        for (const c of items)
          c && c.id != null && byId.set(String(c.id), c);
        reviewThreadBundle = {
          threads: items.filter((c) => {
            if (!c || c.id == null) return !1;
            const parent = c.inReplyToId ?? c.in_reply_to_id ?? null;
            return parent == null || !byId.has(String(parent));
          }).map((r) => {
            const replyIds = items.filter(
              (c) => c && String(c.inReplyToId ?? c.in_reply_to_id ?? "") === String(r.id)
            ).map((c) => c.id), threadNodeId = r.nodeId || `rest-thread-${r.id}`, commentIds = [r.id, ...replyIds];
            for (const cid of commentIds) {
              const row = byId.get(String(cid));
              row && (row.threadNodeId = threadNodeId);
            }
            return {
              threadNodeId,
              resolved: !1,
              outdated: !!r.outdated,
              path: r.path || "",
              line: r.line ?? r.originalLine ?? null,
              startLine: r.startLine ?? null,
              side: r.side || "RIGHT",
              commentIds
            };
          }),
          comments: items,
          hasMore: !!(restPage?.meta?.hasMore ?? restPage?.hasMore),
          endCursor: null,
          pageCount: 1,
          totalCount: items.length
        };
      }
    } catch (err) {
      if (err?.name === "AbortError" || /aborted|AbortError/i.test(String(err?.message || "")))
        throw err;
    }
  const reviewThreads = reviewThreadBundle?.threads || [];
  let pendingBundle = { comments: [], review: null };
  token ? pendingBundle = await timedFetch(
    timings,
    "pendingReview",
    fetchViewerPendingReviewBundle(
      owner,
      repo,
      n,
      fetchImpl,
      token,
      {
        reviews: [],
        login: viewerLogin
      },
      ctx
    ).catch((err) => {
      if (err?.name === "AbortError" || /aborted|AbortError/i.test(String(err?.message || "")))
        throw err;
      return { comments: [], review: null };
    }),
    (b) => `(${(b?.comments || []).length} pending comments)`
  ) : timings.pendingReview = 0;
  const pendingReviewComments = pendingBundle.comments || [], reviewComments = mergePendingReviewComments(
    reviewThreadBundle?.comments || [],
    pendingReviewComments
  ), viewerPendingReview = pendingBundle.review || null, reviewCommentsMeta = {
    page: 1,
    perPage: (reviewThreadBundle?.comments || []).length || COMMENT_PAGE_SIZE,
    hasMore: !!reviewThreadBundle?.hasMore,
    nextPage: null,
    loadedCount: (reviewComments || []).length
  }, reviewThreadsMeta = reviewThreadBundle?.reviewThreadsMeta ? { ...reviewThreadBundle.reviewThreadsMeta } : {
    ...emptyReviewThreadsMeta(),
    hasMore: !!reviewThreadBundle?.hasMore,
    endCursor: reviewThreadBundle?.endCursor || null,
    loadedThreadCount: (reviewThreads || []).length,
    loadedCommentCount: (reviewThreadBundle?.comments || []).length,
    pagesLoaded: reviewThreadBundle?.pageCount || (threadsMaxPages > 0 ? 1 : 0),
    // @ts-expect-error classic fetch dynamic shapes
    totalCount: Number(reviewThreadBundle?.totalCount) || (reviewThreads || []).length,
    hiddenCount: Math.max(
      0,
      // @ts-expect-error classic fetch dynamic shapes
      (Number(reviewThreadBundle?.totalCount) || 0) - (reviewThreads || []).length
    )
  }, headSha = pr.head?.sha || "", checks = { state: "unknown", totalCount: 0, statuses: [], checkRuns: [] }, commits = [];
  let linkedIssues = [];
  const developmentIssues = [], projects = [];
  try {
    let editApi = typeof globalThis < "u" ? globalThis.PRModalPrEditApi : null;
    if (!editApi && typeof __require == "function")
      try {
        editApi = __require("./modal/pure/pr-edit-api.js");
      } catch {
        editApi = null;
      }
    editApi?.parseLinkedIssueNumbers && (linkedIssues = editApi.parseLinkedIssueNumbers(pr.body || ""));
  } catch {
    linkedIssues = [];
  }
  const gitattributesText = "", filesOut = [];
  timings.mapAnnotateFiles = 0;
  const subscribed = subscription && typeof subscription.subscribed == "boolean" ? !!subscription.subscribed : null, mergeStateStatus = subscription && subscription.mergeStateStatus ? String(subscription.mergeStateStatus) : null, magicLinks = matchAutolinksInText(
    prMatchText({
      title: pr.title,
      body: pr.body || "",
      headRef: pr.head?.ref || "",
      baseRef: pr.base?.ref || "",
      author: pr.user?.login || ""
    }),
    Array.isArray(autolinks) ? autolinks : []
  );
  if (timings.total = Math.round(fetchNowMs() - tTotal0), typeof console.table == "function")
    try {
      console.table(timings);
    } catch {
    }
  let bodyReactions = mapRestReactions(pr.reactions);
  if (pr.node_id && token)
    try {
      const enriched = (await fetchReactableReactionGroups(
        [pr.node_id],
        fetchImpl,
        token,
        ctx
      )).get(String(pr.node_id));
      enriched && enriched.length && (bodyReactions = enriched);
    } catch {
    }
  return {
    owner,
    repo,
    number: pr.number,
    nodeId: pr.node_id || null,
    title: pr.title,
    body: pr.body || "",
    bodyReactions,
    // Merged PRs are closed on GitHub; never leave state=open with merged flag.
    state: pr.merged || pr.merged_at ? pr.state === "open" ? "closed" : pr.state || "closed" : pr.state,
    draft: !!pr.draft,
    author: pr.user?.login || "",
    authorAvatarUrl: pr.user?.avatar_url || "",
    viewerLogin: viewerLogin || null,
    baseRef: pr.base?.ref || "",
    headRef: pr.head?.ref || "",
    baseSha: pr.base?.sha || "",
    /** Repo that owns the base ref (usually same as PR repo). */
    baseOwner: pr.base?.repo?.owner?.login || owner,
    baseRepo: pr.base?.repo?.name || repo,
    /** Head may be a fork — prefer head.repo when present. */
    headOwner: pr.head?.repo?.owner?.login || pr.head?.user?.login || owner,
    headRepo: pr.head?.repo?.name || repo,
    headSha,
    magicLinks,
    htmlUrl: pr.html_url,
    // merged_at alone is enough when `merged` is omitted on slim payloads.
    merged: !!pr.merged || !!pr.merged_at,
    mergedAt: pr.merged_at || null,
    mergeable: pr.mergeable,
    mergeableState: pr.mergeable_state || null,
    /** GraphQL mergeStateStatus when available (BEHIND / CLEAN / BLOCKED / …). */
    mergeStateStatus,
    /**
     * How many base commits the head is behind (0 = up to date).
     * Used to show "Update branch" only when GitHub can actually update.
     */
    behindBy: pr.behind_by != null && Number.isFinite(Number(pr.behind_by)) ? Number(pr.behind_by) : null,
    /** Paths that appear modified on both base tip and head (conflict candidates). */
    conflictFiles: Array.isArray(pr._conflictFiles) ? pr._conflictFiles : [],
    rebaseable: pr.rebaseable ?? null,
    /**
     * Repository Settings → Pull Requests merge methods.
     * null when unknown (token/public payload omitted flags).
     */
    allowMergeCommit: repoMergeFlags ? repoMergeFlags.allowMergeCommit : null,
    allowSquashMerge: repoMergeFlags ? repoMergeFlags.allowSquashMerge : null,
    allowRebaseMerge: repoMergeFlags ? repoMergeFlags.allowRebaseMerge : null,
    /**
     * True when REST repo.permissions.admin — enables GitHub-style bypass-rules
     * opt-in on policy-blocked PRs. false/null → no bypass checkbox.
     */
    viewerCanMergeAsAdmin: viewerCanMergeAsAdmin === !0 ? !0 : viewerCanMergeAsAdmin === !1 ? !1 : null,
    createdAt: pr.created_at,
    updatedAt: pr.updated_at,
    additions: pr.additions,
    deletions: pr.deletions,
    changedFiles: pr.changed_files,
    /** Total commits on the PR (REST field); may exceed first page of commits[]. */
    commitsCount: pr.commits != null ? Number(pr.commits) : null,
    labels: Array.isArray(pr.labels) ? pr.labels.map((l) => ({
      name: l.name || "",
      color: l.color || "",
      description: l.description || ""
    })) : [],
    assignees: Array.isArray(pr.assignees) ? pr.assignees.map((u) => u.login || u).filter(Boolean) : [],
    /** login → avatar_url for people chips when API provided them */
    avatarUrls: (() => {
      const map = {}, putUser = (u) => {
        const login = u?.login || (typeof u == "string" ? u : ""), url = u?.avatar_url || "";
        login && url && (map[String(login).toLowerCase()] = url);
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
      const map = {}, put = (u) => {
        const login = u?.login || (typeof u == "string" ? u : "");
        if (!login) return;
        const key = String(login).toLowerCase();
        (String(u?.type || "").toLowerCase() === "bot" || /\[bot\]$/i.test(String(login))) && (map[key] = !0);
      };
      for (const u of pr.assignees || []) put(u);
      for (const u of pr.requested_reviewers || []) put(u);
      for (const r of reviews || []) put(r?.user);
      for (const c of comments || []) put(c?.user);
      for (const c of reviewComments || []) put(c?.user);
      return map;
    })(),
    requestedReviewers: Array.isArray(pr.requested_reviewers) ? pr.requested_reviewers.map((u) => u.login || u).filter(Boolean) : [],
    requestedTeams: Array.isArray(pr.requested_teams) ? pr.requested_teams.map((t) => t.slug || t.name).filter(Boolean) : [],
    milestone: pr.milestone ? {
      number: pr.milestone.number,
      title: pr.milestone.title || "",
      state: pr.milestone.state || "",
      dueOn: pr.milestone.due_on || null
    } : null,
    linkedIssues,
    /** Issues linked for Development (closing refs / body #N). */
    developmentIssues,
    /** ProjectV2 boards this PR is on. */
    projects,
    subscribed,
    locked: !!pr.locked,
    gitattributesText,
    files: filesOut,
    comments: Array.isArray(comments) ? comments : [],
    commentsMeta: commentsPage?.meta || {
      page: 1,
      perPage: COMMENT_PAGE_SIZE,
      hasMore: !1,
      nextPage: null,
      loadedCount: Array.isArray(comments) ? comments.length : 0
    },
    // Populated by independent fetchPrReviews
    reviews: Array.isArray(reviews) ? reviews : [],
    // Official REST PR.review_comments count (for empty short-circuit / paging)
    reviewCommentsCount: pr.review_comments != null && Number.isFinite(Number(pr.review_comments)) ? Number(pr.review_comments) : null,
    // REST/GraphQL threads window — more via fetchReviewThreadsPage
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
    _fetchTimings: timings
  };
}
var TIMELINE_ITEMS_PAGE_SIZE = 100, TIMELINE_ITEMS_QUERY = `
query TimelineItemsPage(
  $owner: String!
  $name: String!
  $number: Int!
  $first: Int
  $last: Int
  $after: String
  $before: String
  $since: DateTime
) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      timelineItems(
        first: $first
        last: $last
        after: $after
        before: $before
        since: $since
      ) {
        totalCount
        filteredCount
        updatedAt
        pageInfo {
          hasNextPage
          hasPreviousPage
          startCursor
          endCursor
        }
        nodes {
          __typename
          ... on IssueComment {
            id
            databaseId
            createdAt
            body
            author { login avatarUrl }
            reactionGroups {
              content
              viewerHasReacted
              reactors { totalCount }
            }
          }
          ... on PullRequestReview {
            id
            databaseId
            state
            submittedAt
            body
            author { login avatarUrl }
            comments { totalCount }
          }
          ... on LabeledEvent {
            id
            createdAt
            label { name color description }
            actor { login avatarUrl }
          }
          ... on UnlabeledEvent {
            id
            createdAt
            label { name color description }
            actor { login avatarUrl }
          }
          ... on RenamedTitleEvent {
            id
            createdAt
            previousTitle
            currentTitle
            actor { login avatarUrl }
          }
          ... on AssignedEvent {
            id
            createdAt
            actor { login avatarUrl }
            assignee { ... on User { login } ... on Bot { login } }
          }
          ... on UnassignedEvent {
            id
            createdAt
            actor { login avatarUrl }
            assignee { ... on User { login } ... on Bot { login } }
          }
          ... on ReviewRequestedEvent {
            id
            createdAt
            actor { login avatarUrl }
            requestedReviewer {
              ... on User { login }
              ... on Team { name slug }
              ... on Bot { login }
            }
          }
          ... on ReviewRequestRemovedEvent {
            id
            createdAt
            actor { login avatarUrl }
            requestedReviewer {
              ... on User { login }
              ... on Team { name slug }
              ... on Bot { login }
            }
          }
          ... on MilestonedEvent {
            id
            createdAt
            milestoneTitle
            actor { login avatarUrl }
          }
          ... on DemilestonedEvent {
            id
            createdAt
            milestoneTitle
            actor { login avatarUrl }
          }
          ... on ReadyForReviewEvent {
            id
            createdAt
            actor { login avatarUrl }
          }
          ... on ConvertToDraftEvent {
            id
            createdAt
            actor { login avatarUrl }
          }
          ... on ClosedEvent {
            id
            createdAt
            actor { login avatarUrl }
          }
          ... on ReopenedEvent {
            id
            createdAt
            actor { login avatarUrl }
          }
          ... on MergedEvent {
            id
            createdAt
            actor { login avatarUrl }
            commit { oid }
          }
          ... on CrossReferencedEvent {
            id
            createdAt
            actor { login avatarUrl }
          }
          ... on ReferencedEvent {
            id
            createdAt
            actor { login avatarUrl }
          }
          ... on LockedEvent {
            id
            createdAt
            actor { login avatarUrl }
            lockReason
          }
          ... on UnlockedEvent {
            id
            createdAt
            actor { login avatarUrl }
          }
          ... on HeadRefForcePushedEvent {
            id
            createdAt
            actor { login avatarUrl }
          }
          ... on BaseRefChangedEvent {
            id
            createdAt
            actor { login avatarUrl }
          }
          ... on PullRequestCommit {
            id
            commit {
              oid
              abbreviatedOid
              messageHeadline
              committedDate
              author { user { login avatarUrl } name }
            }
          }
        }
      }
    }
  }
}`, SKIP_TYPENAMES = /* @__PURE__ */ new Set([
  "SubscribedEvent",
  "UnsubscribedEvent",
  "MentionedEvent",
  "CommentDeletedEvent"
]);
function actorLogin(node) {
  return node?.actor?.login || node?.author?.login || "";
}
function actorAvatar(node) {
  return node?.actor?.avatarUrl || node?.author?.avatarUrl || "";
}
function mapReactionGroups(groups) {
  return Array.isArray(groups) ? groups.map((g) => {
    const content = String(g?.content || ""), count = Number(g?.reactors?.totalCount) || 0;
    return !content || count <= 0 ? null : {
      content,
      count,
      viewerHasReacted: !!g?.viewerHasReacted
    };
  }).filter(Boolean) : [];
}
function mapGraphqlTimelineNode(node) {
  if (!node || typeof node != "object") return { kind: null, value: null };
  const tn = String(node.__typename || "");
  if (SKIP_TYPENAMES.has(tn)) return { kind: null, value: null };
  if (tn === "IssueComment") {
    const comment = mapIssueComment({
      id: node.databaseId,
      node_id: node.id,
      body: node.body || "",
      user: {
        login: node.author?.login || "",
        avatar_url: node.author?.avatarUrl || ""
      },
      created_at: node.createdAt,
      updated_at: node.createdAt
    }), reactions = mapReactionGroups(node.reactionGroups);
    return reactions.length && (comment.reactions = reactions), comment.nodeId = node.id || comment.nodeId, { kind: "comment", value: comment };
  }
  if (tn === "PullRequestReview")
    return {
      kind: "review",
      value: {
        id: node.databaseId,
        nodeId: node.id,
        author: node.author?.login || "",
        avatarUrl: node.author?.avatarUrl || "",
        state: node.state || "",
        body: node.body || "",
        submittedAt: node.submittedAt || null,
        commentCount: typeof node.comments?.totalCount == "number" ? node.comments.totalCount : null,
        isBot: /\[bot\]$/i.test(String(node.author?.login || ""))
      }
    };
  const base = {
    id: node.id || null,
    actor: actorLogin(node),
    avatarUrl: actorAvatar(node),
    at: node.createdAt || null,
    source: "graphql"
  };
  switch (tn) {
    case "LabeledEvent":
      return {
        kind: "event",
        value: {
          ...base,
          event: "labeled",
          label: node.label ? {
            name: String(node.label.name || ""),
            color: String(node.label.color || ""),
            description: String(node.label.description || "")
          } : null
        }
      };
    case "UnlabeledEvent":
      return {
        kind: "event",
        value: {
          ...base,
          event: "unlabeled",
          label: node.label ? {
            name: String(node.label.name || ""),
            color: String(node.label.color || ""),
            description: String(node.label.description || "")
          } : null
        }
      };
    case "RenamedTitleEvent":
      return {
        kind: "event",
        value: {
          ...base,
          event: "renamed",
          rename: {
            from: String(node.previousTitle || ""),
            to: String(node.currentTitle || "")
          }
        }
      };
    case "AssignedEvent":
      return {
        kind: "event",
        value: {
          ...base,
          event: "assigned",
          assignee: node.assignee?.login || null
        }
      };
    case "UnassignedEvent":
      return {
        kind: "event",
        value: {
          ...base,
          event: "unassigned",
          assignee: node.assignee?.login || null
        }
      };
    case "ReviewRequestedEvent":
      return {
        kind: "event",
        value: {
          ...base,
          event: "review_requested",
          requestedReviewer: node.requestedReviewer?.login || node.requestedReviewer?.slug || node.requestedReviewer?.name || null,
          requestedTeam: node.requestedReviewer?.slug || null
        }
      };
    case "ReviewRequestRemovedEvent":
      return {
        kind: "event",
        value: {
          ...base,
          event: "review_request_removed",
          requestedReviewer: node.requestedReviewer?.login || node.requestedReviewer?.slug || node.requestedReviewer?.name || null
        }
      };
    case "MilestonedEvent":
      return {
        kind: "event",
        value: {
          ...base,
          event: "milestoned",
          milestone: { title: String(node.milestoneTitle || ""), number: null }
        }
      };
    case "DemilestonedEvent":
      return {
        kind: "event",
        value: {
          ...base,
          event: "demilestoned",
          milestone: { title: String(node.milestoneTitle || ""), number: null }
        }
      };
    case "ReadyForReviewEvent":
      return { kind: "event", value: { ...base, event: "ready_for_review" } };
    case "ConvertToDraftEvent":
      return { kind: "event", value: { ...base, event: "convert_to_draft" } };
    case "ClosedEvent":
      return { kind: "event", value: { ...base, event: "closed" } };
    case "ReopenedEvent":
      return { kind: "event", value: { ...base, event: "reopened" } };
    case "MergedEvent":
      return {
        kind: "event",
        value: {
          ...base,
          event: "merged",
          commitId: node.commit?.oid || null
        }
      };
    case "CrossReferencedEvent":
      return { kind: "event", value: { ...base, event: "cross-referenced" } };
    case "ReferencedEvent":
      return { kind: "event", value: { ...base, event: "referenced" } };
    case "LockedEvent":
      return {
        kind: "event",
        value: {
          ...base,
          event: "locked",
          lockReason: node.lockReason || null
        }
      };
    case "UnlockedEvent":
      return { kind: "event", value: { ...base, event: "unlocked" } };
    case "HeadRefForcePushedEvent":
      return {
        kind: "event",
        value: { ...base, event: "head_ref_force_pushed" }
      };
    case "BaseRefChangedEvent":
      return {
        kind: "event",
        value: { ...base, event: "base_ref_changed" }
      };
    case "PullRequestCommit":
      return {
        kind: "event",
        value: {
          ...base,
          at: node.commit?.committedDate || base.at,
          actor: node.commit?.author?.user?.login || node.commit?.author?.name || base.actor,
          event: "committed",
          commitId: node.commit?.oid || null,
          commitMessage: node.commit?.messageHeadline || ""
        }
      };
    default:
      return { kind: null, value: null };
  }
}
function mapGraphqlTimelineNodes(nodes) {
  const comments = [], timelineEvents = [], reviews = [];
  for (const node of Array.isArray(nodes) ? nodes : []) {
    const { kind, value } = mapGraphqlTimelineNode(node);
    value && (kind === "comment" ? comments.push(value) : kind === "event" ? timelineEvents.push(value) : kind === "review" && reviews.push(value));
  }
  return { comments, timelineEvents, reviews };
}
async function fetchPrTimelineItemsPage(owner, repo, number, opts = {}, fetchImpl = null, token = null, ctx = null) {
  ctx = normalizeApiCtx(ctx || opts?.ctx);
  const o = String(owner || "").trim(), r = String(repo || "").trim(), n = Number(number), empty = {
    comments: [],
    timelineEvents: [],
    reviews: [],
    pageInfo: {
      hasNextPage: !1,
      hasPreviousPage: !1,
      startCursor: null,
      endCursor: null
    },
    totalCount: 0,
    filteredCount: 0,
    updatedAt: null,
    direction: "newest",
    hasMore: !1,
    source: "graphql"
  };
  if (!o || !r || !Number.isFinite(n) || !token) return empty;
  const pageSize = Math.min(
    TIMELINE_ITEMS_PAGE_SIZE,
    Math.max(1, Number(opts.pageSize) || TIMELINE_ITEMS_PAGE_SIZE)
  ), direction = String(opts.direction || "newest").toLowerCase() === "oldest" ? "oldest" : "newest", cursor = opts.cursor != null ? String(opts.cursor) : null, since = opts.since ? String(opts.since) : null, variables = {
    owner: o,
    name: r,
    number: n
  };
  since && (variables.since = String(since)), since && direction === "newest" ? (variables.first = pageSize, cursor && (variables.after = cursor)) : direction === "newest" ? (variables.last = pageSize, cursor && (variables.before = cursor)) : (variables.first = pageSize, cursor && (variables.after = cursor));
  try {
    const conn = (await apiGraphql(
      TIMELINE_ITEMS_QUERY,
      variables,
      fetchImpl || fetch,
      token,
      { ...ctx, qName: "TimelineItemsPage" }
    ))?.repository?.pullRequest?.timelineItems, nodes = Array.isArray(conn?.nodes) ? conn.nodes : [], mapped = mapGraphqlTimelineNodes(nodes), pageInfo = conn?.pageInfo || empty.pageInfo, hasMore = since ? !!pageInfo.hasNextPage : direction === "newest" ? !!pageInfo.hasPreviousPage : !!pageInfo.hasNextPage;
    return {
      ...mapped,
      pageInfo: {
        hasNextPage: !!pageInfo.hasNextPage,
        hasPreviousPage: !!pageInfo.hasPreviousPage,
        startCursor: pageInfo.startCursor || null,
        endCursor: pageInfo.endCursor || null
      },
      totalCount: typeof conn?.totalCount == "number" ? conn.totalCount : nodes.length,
      filteredCount: typeof conn?.filteredCount == "number" ? conn.filteredCount : nodes.length,
      updatedAt: conn?.updatedAt || null,
      direction,
      hasMore,
      source: "graphql",
      since: since || null
    };
  } catch (err) {
    if (err?.name === "AbortError" || /aborted|AbortError/i.test(String(err?.message || "")))
      throw err;
    return { ...empty, error: String(err?.message || err || "timeline failed") };
  }
}
async function fetchPrTimelineShell(owner, repo, number, opts = {}, fetchImpl = null, token = null, ctx = null) {
  return fetchPrTimelineItemsPage(
    owner,
    repo,
    number,
    {
      direction: opts.direction || "newest",
      pageSize: opts.pageSize || TIMELINE_ITEMS_PAGE_SIZE,
      since: opts.since || null,
      cursor: opts.cursor || null
    },
    fetchImpl,
    token,
    ctx
  );
}
var fetchApi = {
  normalizeApiCtx,
  mapApiPullRequest,
  buildApiHeaders,
  findDanglingPrNumbers,
  mapWithConcurrency,
  fetchOpenPullsPublic,
  fetchPullByNumber,
  fetchPrHeadProbe,
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
  fetchPrTimelineEvents,
  fetchPrTimelineItemsPage,
  fetchPrTimelineShell,
  mapGraphqlTimelineNode,
  mapGraphqlTimelineNodes,
  TIMELINE_ITEMS_PAGE_SIZE,
  fetchPrReviews,
  fetchPrChecks,
  fetchPrDevelopment,
  fetchPrSidebarMeta,
  fetchIssueOrPrSummaries,
  fetchReactableReactionGroups,
  fetchReactableReactors,
  fetchCompareFiles,
  mapAndAnnotateFiles,
  fetchPullReviewThreads,
  fetchPullReviewThreadsBundle,
  fetchReviewThreadsPage,
  chooseReviewThreadsTransportLocal,
  buildRestReviewThreadsPageFromCommentsLocal,
  fetchReviewThreadsByIds,
  collectUnresolvedThreadNodeIds,
  dropReviewThreadsFromDetail,
  mapGraphqlReviewCommentNode,
  mergeReviewThreadsPageIntoDetail,
  emptyReviewThreadsMeta,
  getGraphqlCostLog,
  clearGraphqlCostLog,
  summarizeGraphqlCostLog,
  injectRateLimitCostFieldLocal,
  labelGraphqlOperationLocal,
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
  toggleCommentReaction,
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
  deleteHeadBranch,
  fetchViewerViewedPaths,
  markFileAsViewed,
  unmarkFileAsViewed,
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
  apiGraphql
};
typeof globalThis < "u" && (globalThis.PRTreeFetch = fetchApi);
try {
  typeof module < "u" && module?.exports !== void 0 && (module.exports = fetchApi);
} catch {
};


/* ---- background.ts ---- */

var ENTERPRISE_CS_ID = "prp-enterprise-hosts";
var CONTENT_SCRIPT_JS = [
  "src/tree.js",
  "src/dom.js",
  "src/pr-list-focus.js",
  "src/pulls-palette.js",
  "src/github-endpoints.js",
  "src/content-bridge.js",
  "src/content-bootstrap.js",
  "src/onboarding.js",
  "src/content.js",
  "src/modal/pure/detail-idb-cache.js",
  "src/modal/pure/detail-cache.js",
  "src/modal/pure/detail-merge.js",
  "src/modal/pure/detail-store.js",
  "src/modal/pure/load-progress.js",
  "src/modal/pure/page-embed.js",
  "src/modal/pure/floating-scrollbar.js",
  "src/modal/pure/auto-refresh.js",
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
var enterpriseCsSyncChain = Promise.resolve();
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
var MSG = {
  /** Lightweight wake / health check (content scripts retry against this). */
  PING: "PR_TREE_PING",
  TOKEN_STATUS: "PR_TREE_TOKEN_STATUS",
  TOKEN_SET: "PR_TREE_TOKEN_SET",
  TOKEN_CLEAR: "PR_TREE_TOKEN_CLEAR",
  TOKEN_CHANGED: "PR_TREE_TOKEN_CHANGED",
  PREFS_GET: "PR_TREE_PREFS_GET",
  PREFS_SET: "PR_TREE_PREFS_SET",
  PREFS_CHANGED: "PR_TREE_PREFS_CHANGED",
  RATE_LIMIT_GET: "PR_TREE_RATE_LIMIT_GET",
  RATE_LIMIT_CHANGED: "PR_TREE_RATE_LIMIT_CHANGED",
  /** GraphQL per-query cost observation log (primary points). */
  GQL_COST_LOG_GET: "PR_TREE_GQL_COST_LOG_GET",
  GQL_COST_LOG_CLEAR: "PR_TREE_GQL_COST_LOG_CLEAR",
  ONBOARDING_GET: "PR_TREE_ONBOARDING_GET",
  ONBOARDING_SET: "PR_TREE_ONBOARDING_SET",
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
  TOGGLE_COMMENT_REACTION: "PR_TREE_TOGGLE_COMMENT_REACTION",
  FETCH_REACTABLE_REACTORS: "PR_TREE_FETCH_REACTABLE_REACTORS",
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
  FETCH_PR_TIMELINE_EVENTS: "PR_TREE_FETCH_PR_TIMELINE_EVENTS",
  FETCH_PR_TIMELINE_ITEMS: "PR_TREE_FETCH_PR_TIMELINE_ITEMS",
  FETCH_PR_HEAD_PROBE: "PR_TREE_FETCH_PR_HEAD_PROBE",
  FETCH_PR_REVIEWS: "PR_TREE_FETCH_PR_REVIEWS",
  FETCH_PR_CHECKS: "PR_TREE_FETCH_PR_CHECKS",
  FETCH_PR_DEVELOPMENT: "PR_TREE_FETCH_PR_DEVELOPMENT",
  FETCH_ALL_PR_FILES: "PR_TREE_FETCH_ALL_PR_FILES",
  APPLY_SUGGESTION: "PR_TREE_APPLY_SUGGESTION",
  GET_REPO_FILE_TEXT: "PR_TREE_GET_REPO_FILE_TEXT",
  MERGE_PULL: "PR_TREE_MERGE_PULL",
  UPDATE_BRANCH: "PR_TREE_UPDATE_BRANCH",
  DELETE_HEAD_BRANCH: "PR_TREE_DELETE_HEAD_BRANCH",
  FETCH_VIEWER_VIEWED_PATHS: "PR_TREE_FETCH_VIEWER_VIEWED_PATHS",
  MARK_FILE_VIEWED: "PR_TREE_MARK_FILE_VIEWED",
  UNMARK_FILE_VIEWED: "PR_TREE_UNMARK_FILE_VIEWED",
  SET_SUBSCRIPTION: "PR_TREE_SET_SUBSCRIPTION",
  DELETE_SUBSCRIPTION: "PR_TREE_DELETE_SUBSCRIPTION",
  SET_MILESTONE: "PR_TREE_SET_MILESTONE",
  SET_DRAFT_STAGE: "PR_TREE_SET_DRAFT_STAGE",
  UPLOAD_REPO_FILE: "PR_TREE_UPLOAD_REPO_FILE"
};
var MESSAGE_TIMEOUT_MS = 12e4;
async function rehydrateEnterpriseScripts() {
  try {
    const hosts = await registeredEnterpriseHosts();
    await syncEnterpriseContentScripts(hosts);
  } catch (err) {
    console.warn("[pr+] enterprise content scripts", err?.message || err);
  }
}
var INSTALL_PULLS_URL = "https://github.com/enif-lee/pr-plus/pulls";
try {
  chrome.runtime.onInstalled.addListener((details) => {
    void rehydrateEnterpriseScripts();
    if (details?.reason === "install") {
      try {
        chrome.tabs.create({ url: INSTALL_PULLS_URL });
      } catch (err) {
        console.warn("[pr+] open install pulls tab failed", err?.message || err);
      }
    }
  });
  chrome.runtime.onStartup.addListener(() => {
    void rehydrateEnterpriseScripts();
  });
} catch {
}
void rehydrateEnterpriseScripts();
function getRlMem() {
  const g = globalThis;
  if (!g.__prpRlMem) {
    g.__prpRlMem = {
      pluginEnabled: true,
      state: null,
      loaded: false,
      saveTimer: null
    };
  }
  return g.__prpRlMem;
}
var rlMem = new Proxy({}, {
  get(_t, prop) {
    return getRlMem()[prop];
  },
  set(_t, prop, value) {
    getRlMem()[prop] = value;
    return true;
  }
});
var activeFetchControllers = /* @__PURE__ */ new Map();
var preCancelledFetchIds = /* @__PURE__ */ new Set();
function makeAbortError() {
  const err = new Error("The operation was aborted.");
  err.name = "AbortError";
  return err;
}
function rawBrowserFetch() {
  return globalThis.fetch.bind(globalThis);
}
function rateLimitApi() {
  return globalThis.PRModalRateLimit || null;
}
async function ensureRateLimitMem() {
  if (rlMem.loaded) return rlMem;
  try {
    const prefs = await PRTreeStorage.getExtensionPrefs();
    rlMem.pluginEnabled = prefs?.pluginEnabled !== false;
  } catch {
    rlMem.pluginEnabled = true;
  }
  try {
    const st = await PRTreeStorage.getRateLimitState();
    const RL = rateLimitApi();
    rlMem.state = typeof RL?.clearExpiredRateDisables === "function" ? RL.clearExpiredRateDisables(st, Date.now()) : st;
  } catch {
    const RL = rateLimitApi();
    rlMem.state = typeof RL?.emptyRateLimitState === "function" ? RL.emptyRateLimitState() : {
      disabledUntil: { core: 0, graphql: 0, search: 0 },
      snapshots: { core: null, graphql: null, search: null }
    };
  }
  rlMem.loaded = true;
  return rlMem;
}
function schedulePersistRateLimitState() {
  if (rlMem.saveTimer) return;
  rlMem.saveTimer = setTimeout(() => {
    rlMem.saveTimer = null;
    const st = rlMem.state;
    if (!st) return;
    void PRTreeStorage.setRateLimitState(st).then(() => {
      try {
        const msg = {
          type: "PR_TREE_RATE_LIMIT_CHANGED",
          state: st,
          pluginEnabled: rlMem.pluginEnabled
        };
        chrome.runtime.sendMessage(msg, () => {
          void chrome.runtime.lastError;
        });
      } catch {
      }
    }).catch(() => {
    });
  }, 200);
}
function makeRateLimitError(resource, untilMs, reason) {
  const until = untilMs > 0 ? new Date(untilMs).toISOString() : "";
  const err = new Error(
    reason === "plugin-disabled" ? "pr+ is disabled in settings" : `GitHub ${resource} rate limit \u2014 retry after ${until || "reset"}`
  );
  err.name = "RateLimitError";
  err.status = 429;
  err.rateLimitResource = resource;
  err.rateLimitUntil = untilMs;
  err.rateLimitReason = reason;
  return err;
}
function assertGithubRequestAllowed(url) {
  const RL = rateLimitApi();
  const resource = typeof RL?.classifyGithubUrl === "function" ? RL.classifyGithubUrl(url) : "core";
  if (rlMem.pluginEnabled === false) {
    throw makeRateLimitError(resource, 0, "plugin-disabled");
  }
  if (typeof RL?.shouldAllowGithubRequest === "function") {
    const gate = RL.shouldAllowGithubRequest({
      pluginEnabled: rlMem.pluginEnabled,
      state: rlMem.state,
      resource,
      nowMs: Date.now()
    });
    if (!gate.allow) {
      throw makeRateLimitError(
        resource,
        gate.disabledUntilMs || 0,
        gate.reason || "rate-disabled"
      );
    }
  }
  return resource;
}
function noteGithubResponse(res, url, resourceHint) {
  const RL = rateLimitApi();
  if (!RL || !res) return;
  const resource = resourceHint || (typeof RL.classifyGithubUrl === "function" ? RL.classifyGithubUrl(url) : "core");
  const now = Date.now();
  try {
    let next = rlMem.state;
    if (res.status === 429) {
      if (typeof RL.withRateLimit429 === "function") {
        next = RL.withRateLimit429(next, resource, res.headers, now);
      }
    } else if (typeof RL.parseRateLimitHeaders === "function") {
      const snap = RL.parseRateLimitHeaders(res.headers, {
        fallbackResource: resource,
        nowMs: now
      });
      if (snap && typeof RL.withRateLimitSnapshot === "function") {
        next = RL.withRateLimitSnapshot(next, snap);
      }
    }
    if (typeof RL.clearExpiredRateDisables === "function") {
      next = RL.clearExpiredRateDisables(next, now);
    }
    rlMem.state = next;
    schedulePersistRateLimitState();
  } catch {
  }
}
function wrapFetchWithRateLimit(baseFetch) {
  return async (url, init = {}) => {
    try {
      await ensureRateLimitMem();
    } catch {
    }
    let resource = "core";
    try {
      resource = assertGithubRequestAllowed(url);
    } catch (err) {
      return Promise.reject(err);
    }
    const res = await baseFetch(url, init);
    try {
      noteGithubResponse(res, url, resource);
    } catch {
    }
    return res;
  };
}
function fetchImpl() {
  return wrapFetchWithRateLimit(rawBrowserFetch());
}
function wrapFetchWithSignal(baseFetch, signal) {
  return async (url, init = {}) => {
    if (signal.aborted) return Promise.reject(makeAbortError());
    let nextSignal = signal;
    if (init.signal && init.signal !== signal) {
      if (typeof AbortSignal !== "undefined" && typeof AbortSignal.any === "function") {
        nextSignal = AbortSignal.any([init.signal, signal]);
      }
    }
    return baseFetch(url, {
      ...init,
      signal: nextSignal
    });
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
function applyPrefsToRlMem(prefs) {
  rlMem.pluginEnabled = prefs?.pluginEnabled !== false;
  rlMem.loaded = true;
}
function applyRateLimitStateToRlMem(raw) {
  try {
    const RL = rateLimitApi();
    rlMem.state = typeof RL?.normalizeRateLimitState === "function" ? RL.normalizeRateLimitState(raw) : raw;
    rlMem.loaded = true;
  } catch {
  }
}
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
    applyPrefsToRlMem(prefs);
    broadcastPrefsChanged(prefs);
  }
  if (PRTreeStorage.RATE_LIMIT_KEY && changes[PRTreeStorage.RATE_LIMIT_KEY]) {
    try {
      const raw = changes[PRTreeStorage.RATE_LIMIT_KEY].newValue;
      applyRateLimitStateToRlMem(raw);
    } catch {
    }
  }
});
async function handleMessagePartA(message) {
  const apiCtx = apiCtxFromMessage(message || {});
  switch (message.type) {
    case MSG.PING: {
      return {
        ok: true,
        pong: true,
        hasFetch: typeof PRTreeFetch?.fetchPrDetail === "function",
        hasTimelineItems: typeof PRTreeFetch?.fetchPrTimelineItemsPage === "function",
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
      let rateLimit = null;
      try {
        await ensureRateLimitMem();
        rateLimit = rlMem.state;
      } catch {
        rateLimit = null;
      }
      return {
        ok: true,
        prefs,
        hostAccounts,
        endpoints,
        rateLimit,
        pluginEnabled: prefs?.pluginEnabled !== false
      };
    }
    case MSG.PREFS_SET: {
      const patch = message.prefs || message.patch || {};
      if (patch && typeof patch === "object" && "enterpriseWebHosts" in patch) {
        delete patch.enterpriseWebHosts;
      }
      if (patch && patch.pluginEnabled === true) {
        try {
          await ensureRateLimitMem();
          const RL = rateLimitApi();
          if (typeof RL?.clearExpiredRateDisables === "function") {
            rlMem.state = RL.clearExpiredRateDisables(rlMem.state, Date.now(), {
              clearAll: true
            });
            await PRTreeStorage.setRateLimitState(rlMem.state);
          }
        } catch {
        }
      }
      const prefs = await PRTreeStorage.setExtensionPrefs(patch);
      rlMem.pluginEnabled = prefs?.pluginEnabled !== false;
      rlMem.loaded = true;
      return { ok: true, prefs, rateLimit: rlMem.state };
    }
    case MSG.RATE_LIMIT_GET: {
      await ensureRateLimitMem();
      const RL = rateLimitApi();
      if (typeof RL?.clearExpiredRateDisables === "function") {
        rlMem.state = RL.clearExpiredRateDisables(rlMem.state, Date.now());
      }
      const gqlLog = typeof PRTreeFetch?.getGraphqlCostLog === "function" ? PRTreeFetch.getGraphqlCostLog() : [];
      const gqlSummary = typeof PRTreeFetch?.summarizeGraphqlCostLog === "function" ? PRTreeFetch.summarizeGraphqlCostLog() : { totalCalls: 0, totalCost: 0, unknownCostCalls: 0, byOp: [] };
      return {
        ok: true,
        state: rlMem.state,
        pluginEnabled: rlMem.pluginEnabled,
        gqlCostLog: gqlLog,
        gqlCostSummary: gqlSummary,
        gqlCostBuild: "gql-cost-v1"
      };
    }
    case MSG.GQL_COST_LOG_GET: {
      const log = typeof PRTreeFetch?.getGraphqlCostLog === "function" ? PRTreeFetch.getGraphqlCostLog() : [];
      const summary = typeof PRTreeFetch?.summarizeGraphqlCostLog === "function" ? PRTreeFetch.summarizeGraphqlCostLog() : { totalCalls: 0, totalCost: 0, unknownCostCalls: 0, byOp: [] };
      return { ok: true, log, summary, gqlCostBuild: "gql-cost-v1" };
    }
    case MSG.GQL_COST_LOG_CLEAR: {
      if (typeof PRTreeFetch?.clearGraphqlCostLog === "function") {
        PRTreeFetch.clearGraphqlCostLog();
      }
      return { ok: true };
    }
    case MSG.ONBOARDING_GET: {
      const completed = await PRTreeStorage.getOnboardingCompleted();
      return { ok: true, completed: Boolean(completed) };
    }
    case MSG.ONBOARDING_SET: {
      const completed = await PRTreeStorage.setOnboardingCompleted(
        message.completed !== false && message.completed !== 0
      );
      return { ok: true, completed: Boolean(completed) };
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
            pageSize: message.pageSize != null ? Number(message.pageSize) : void 0,
            preferRest: message.preferRest !== void 0 ? message.preferRest : null,
            forceGraphql: Boolean(message.forceGraphql),
            forceFull: Boolean(message.forceFull),
            skipEagerComments: Boolean(message.skipEagerComments),
            reviewCommentsCount: message.reviewCommentsCount != null ? Number(message.reviewCommentsCount) : null,
            restPage: message.restPage != null ? Number(message.restPage) : 1
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
            since: message.since || null,
            preferNewest: Boolean(message.preferNewest)
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
      if (!token) throw new Error("GitHub PAT required to resolve review threads");
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
    case MSG.TOGGLE_COMMENT_REACTION: {
      const token = await tokenForMessage(message);
      if (!token) throw new Error("GitHub PAT required to react on comments");
      if (typeof PRTreeFetch.toggleCommentReaction !== "function") {
        throw new Error("Reaction API unavailable");
      }
      const result = await PRTreeFetch.toggleCommentReaction(
        message.owner,
        message.repo,
        message.kind || "issue",
        message.opts || {},
        fetchImpl(),
        token,
        apiCtx
      );
      return { ok: true, result };
    }
    case MSG.FETCH_REACTABLE_REACTORS: {
      const token = await tokenForMessage(message);
      if (!token) throw new Error("GitHub PAT required to load reaction users");
      if (typeof PRTreeFetch.fetchReactableReactors !== "function") {
        throw new Error("Reaction reactors API unavailable");
      }
      const tracked = beginTrackedFetch(message.requestId);
      try {
        const groups = await PRTreeFetch.fetchReactableReactors(
          message.nodeId,
          tracked.fetch,
          token,
          apiCtx,
          { first: message.first != null ? Number(message.first) : 5 }
        );
        return { ok: true, groups };
      } catch (err) {
        if (isAbortError(err)) {
          return { ok: false, aborted: true, error: "aborted" };
        }
        throw err;
      } finally {
        endTrackedFetch(tracked.requestId);
      }
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
    default:
      return void 0;
  }
}
async function handleMessagePartB(message) {
  const apiCtx = apiCtxFromMessage(message || {});
  switch (message.type) {
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
      if (!token) throw new Error("GitHub PAT required to create labels");
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
      if (!token) throw new Error("GitHub PAT required to create milestones");
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
    case MSG.FETCH_PR_TIMELINE_EVENTS: {
      const tracked = beginTrackedFetch(message.requestId);
      try {
        const token = await tokenForMessage(message);
        const wantGraphqlPage = message.mode === "graphql" || message.source === "graphql" || message.graphql === true || message.pageSize != null || message.direction != null || // Explicit product path: always prefer GraphQL when pageSize/direction set
        message.type === MSG.FETCH_PR_TIMELINE_ITEMS || message.type === "PR_TREE_FETCH_PR_TIMELINE_ITEMS";
        const hasTimelineFn = typeof PRTreeFetch?.fetchPrTimelineItemsPage === "function";
        if (wantGraphqlPage && hasTimelineFn) {
          const page = await PRTreeFetch.fetchPrTimelineItemsPage(
            message.owner,
            message.repo,
            message.number,
            {
              direction: message.direction || "newest",
              cursor: message.cursor || null,
              since: message.since || null,
              pageSize: message.pageSize || 100
            },
            tracked.fetch,
            token,
            apiCtx
          );
          const p = page || {
            comments: [],
            timelineEvents: [],
            reviews: [],
            hasMore: false,
            source: "graphql",
            error: "empty-page"
          };
          return {
            ok: true,
            page: p,
            timelinePage: p,
            // Keep events alias for older callers
            events: Array.isArray(p?.timelineEvents) ? p.timelineEvents : []
          };
        }
        const events = typeof PRTreeFetch.fetchPrTimelineEvents === "function" ? await PRTreeFetch.fetchPrTimelineEvents(
          message.owner,
          message.repo,
          message.number,
          tracked.fetch,
          token,
          apiCtx
        ) : [];
        return {
          ok: true,
          events: Array.isArray(events) ? events : [],
          page: null,
          timelinePage: null,
          _diag: {
            wantGraphqlPage,
            hasTimelineFn,
            mode: message.mode || null,
            pageSize: message.pageSize ?? null,
            direction: message.direction || null
          }
        };
      } catch (err) {
        if (isAbortError(err)) return { ok: false, aborted: true, error: "aborted" };
        throw err;
      } finally {
        endTrackedFetch(tracked.requestId);
      }
    }
    // Dedicated type (also kept for forward-compat).
    case MSG.FETCH_PR_TIMELINE_ITEMS:
    case "PR_TREE_FETCH_PR_TIMELINE_ITEMS": {
      const tracked = beginTrackedFetch(message.requestId);
      try {
        const token = await tokenForMessage(message);
        if (!token) {
          return {
            ok: true,
            page: {
              comments: [],
              timelineEvents: [],
              reviews: [],
              hasMore: false,
              source: "graphql",
              error: "no-token"
            }
          };
        }
        if (typeof PRTreeFetch.fetchPrTimelineItemsPage !== "function") {
          return {
            ok: true,
            page: {
              comments: [],
              timelineEvents: [],
              reviews: [],
              hasMore: false,
              source: "graphql",
              error: "no-fetchPrTimelineItemsPage"
            }
          };
        }
        const page = await PRTreeFetch.fetchPrTimelineItemsPage(
          message.owner,
          message.repo,
          message.number,
          {
            direction: message.direction || "newest",
            cursor: message.cursor || null,
            since: message.since || null,
            pageSize: message.pageSize || 100
          },
          tracked.fetch,
          token,
          apiCtx
        );
        const p = page || {
          comments: [],
          timelineEvents: [],
          reviews: [],
          hasMore: false,
          source: "graphql",
          error: "empty-page"
        };
        return {
          ok: true,
          page: p,
          timelinePage: p
        };
      } catch (err) {
        if (isAbortError(err)) return { ok: false, aborted: true, error: "aborted" };
        throw err;
      } finally {
        endTrackedFetch(tracked.requestId);
      }
    }
    case MSG.FETCH_PR_HEAD_PROBE: {
      const tracked = beginTrackedFetch(message.requestId);
      try {
        const token = await tokenForMessage(message);
        const probe = typeof PRTreeFetch.fetchPrHeadProbe === "function" ? await PRTreeFetch.fetchPrHeadProbe(
          message.owner,
          message.repo,
          message.number,
          tracked.fetch,
          token,
          apiCtx
        ) : {
          headSha: "",
          baseSha: "",
          updatedAt: null,
          draft: false,
          state: "",
          number: Number(message.number) || 0
        };
        return { ok: true, probe: probe || null };
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
    case MSG.DELETE_HEAD_BRANCH: {
      const token = await tokenForMessage(message);
      if (!token) throw new Error("GitHub PAT required to delete branch");
      const result = await PRTreeFetch.deleteHeadBranch(
        message.owner,
        message.repo,
        message.branch,
        fetchImpl(),
        token,
        apiCtx
      );
      return { ok: true, result };
    }
    case MSG.FETCH_VIEWER_VIEWED_PATHS: {
      const token = await tokenForMessage(message);
      if (!token) {
        return {
          ok: true,
          result: { pullRequestId: null, viewedPaths: [], unauthorized: true }
        };
      }
      const result = await PRTreeFetch.fetchViewerViewedPaths(
        message.owner,
        message.repo,
        message.number,
        fetchImpl(),
        token,
        { maxPages: message.maxPages, ctx: apiCtx }
      );
      return { ok: true, result };
    }
    case MSG.MARK_FILE_VIEWED: {
      const token = await tokenForMessage(message);
      if (!token) throw new Error("GitHub PAT required to mark file viewed");
      const result = await PRTreeFetch.markFileAsViewed(
        message.pullRequestId,
        message.path,
        fetchImpl(),
        token,
        apiCtx
      );
      return { ok: true, result };
    }
    case MSG.UNMARK_FILE_VIEWED: {
      const token = await tokenForMessage(message);
      if (!token) throw new Error("GitHub PAT required to unmark file viewed");
      const result = await PRTreeFetch.unmarkFileAsViewed(
        message.pullRequestId,
        message.path,
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
      if (!token) throw new Error("GitHub PAT required to set milestone");
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
async function handleMessage(message) {
  const a = await handleMessagePartA(message);
  if (a !== void 0) return a;
  return handleMessagePartB(message);
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
try {
  /* deps inlined by scripts/build-sw.mjs */
} catch {
}
