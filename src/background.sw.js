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

/**
 * AUTO-GENERATED from src/modal/lib/collapse.ts
 * SOURCE OF TRUTH: src/modal/lib/collapse.ts
 * Do not edit this file — run: npm run build:pure
 */
(function (global) {
  var module = { exports: {} };
  var exports = module.exports;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var stdin_exports = {};
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
});
module.exports = __toCommonJS(stdin_exports);
const DEFAULT_LARGE_CHANGES = 5e3;
const DEFAULT_LARGE_PATCH_CHARS = 8e4;
const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|bmp|svg|ico|avif|jfif|pjpeg|pjp|tif{1,2})$/i;
function isImagePath(path) {
  const p = String(path || "").split("?")[0].split("#")[0];
  return IMAGE_EXT_RE.test(p);
}
function classifyDiffFile(file) {
  if (!file) {
    return { kind: "binary", openableAsText: false, renderImage: false };
  }
  const path = file.filename || file.path || "";
  const patch = typeof file.patch === "string" ? file.patch : "";
  const hasPatch = patch.length > 0;
  const media = String(file.mediaType || file.contentType || "").toLowerCase();
  const image = isImagePath(path) || media.startsWith("image/") && media !== "image/svg+xml-not";
  if (image) {
    return { kind: "image", openableAsText: false, renderImage: true };
  }
  if (hasPatch) {
    return { kind: "text", openableAsText: true, renderImage: false };
  }
  return { kind: "binary", openableAsText: false, renderImage: false };
}
function parseGitattributes(text) {
  const rules = [];
  if (!text || typeof text !== "string") return rules;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const parts = line.split(/\s+/);
    if (parts.length < 2) continue;
    const pattern = parts[0];
    const attrs = {};
    for (let i = 1; i < parts.length; i++) {
      const p = parts[i];
      if (p.startsWith("-")) {
        attrs[p.slice(1)] = false;
      } else if (p.includes("=")) {
        const [k, v] = p.split("=");
        attrs[k] = v;
      } else {
        attrs[p] = true;
      }
    }
    rules.push({ pattern, attrs });
  }
  return rules;
}
function matchAttrPattern(filePath, pattern) {
  if (!filePath || !pattern) return false;
  const path = filePath.replace(/^\/+/, "");
  if (pattern === path) return true;
  if (pattern.startsWith("**/")) {
    const rest = pattern.slice(3);
    return path === rest || path.endsWith(`/${rest}`) || path.endsWith(rest);
  }
  if (pattern.startsWith("*.")) {
    return path.endsWith(pattern.slice(1));
  }
  if (pattern.includes("*")) {
    const re = new RegExp(
      "^" + pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*/g, "\xA7\xA7").replace(/\*/g, "[^/]*").replace(/§§/g, ".*") + "$"
    );
    return re.test(path);
  }
  return path === pattern || path.endsWith(`/${pattern}`);
}
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
function isAttrEnabled(value) {
  if (value === true) return true;
  if (value === false || value == null) return false;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (v === "" || v === "false" || v === "0" || v === "no" || v === "unset") {
      return false;
    }
    return true;
  }
  return Boolean(value);
}
function shouldCollapseFile(file, opts = {}) {
  if (!file) return true;
  const path = file.filename || file.path || "";
  const patch = file.patch || "";
  const changes = file.changes ?? Number(file.additions || 0) + Number(file.deletions || 0);
  const largeChanges = opts.largeChanges ?? DEFAULT_LARGE_CHANGES;
  const largePatchChars = opts.largePatchChars ?? DEFAULT_LARGE_PATCH_CHARS;
  const rules = opts.rules || [];
  const classified = classifyDiffFile(file);
  const attrs = attributesForPath(path, rules);
  if (isAttrEnabled(file.linguistGenerated) || isAttrEnabled(attrs["linguist-generated"])) {
    return true;
  }
  if (isAttrEnabled(file.binary) || isAttrEnabled(attrs.binary)) {
    return true;
  }
  if (attrs.diff === false || String(attrs.diff || "").toLowerCase() === "false") {
    return true;
  }
  if (classified.kind === "binary") return true;
  if (changes >= largeChanges) return true;
  if (patch && patch.length >= largePatchChars) return true;
  if (classified.kind === "image") return false;
  if (!patch) return true;
  const lower = path.toLowerCase();
  if (lower.endsWith("package-lock.json") || lower.endsWith("yarn.lock") || lower.endsWith("pnpm-lock.yaml") || lower.endsWith(".min.js") || lower.endsWith(".min.css") || lower.endsWith(".map") || lower.includes("/dist/") || lower.endsWith(".bundle.js")) {
    return true;
  }
  return false;
}
function annotateFilesForCollapse(files, gitattributesText) {
  const rules = parseGitattributes(gitattributesText || "");
  return (Array.isArray(files) ? files : []).map((f) => {
    const path = f.filename || f.path || "";
    const attrs = attributesForPath(path, rules);
    const enriched = {
      ...f,
      linguistGenerated: isAttrEnabled(f.linguistGenerated) || isAttrEnabled(attrs["linguist-generated"]),
      binary: isAttrEnabled(f.binary) || isAttrEnabled(attrs.binary)
    };
    const classified = classifyDiffFile(enriched);
    const collapsed = shouldCollapseFile(enriched, { rules });
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
  if (!paths) return /* @__PURE__ */ new Set();
  if (paths instanceof Set) return paths;
  return new Set(Array.isArray(paths) ? paths : []);
}
function isPathCollapsed(path, collapsedPaths, defaultCollapsed = false, expandAll = false, viewedPaths = null) {
  if (expandAll || !path) return false;
  const set = toPathSet(collapsedPaths);
  if (set.has(path)) return true;
  if (set.size === 0) {
    if (defaultCollapsed === true) return true;
    if (toPathSet(viewedPaths).has(path)) return true;
  }
  return false;
}
function defaultCollapsedPathSet(files, viewedPaths = null) {
  const out = /* @__PURE__ */ new Set();
  for (const f of Array.isArray(files) ? files : []) {
    if (!f?.defaultCollapsed) continue;
    const p = f.filename || f.path;
    if (p) out.add(p);
  }
  for (const p of toPathSet(viewedPaths)) {
    if (p) out.add(p);
  }
  return out;
}
function materializeCollapsedPaths(collapsedPaths, files, viewedPaths = null) {
  if (collapsedPaths instanceof Set && collapsedPaths.size > 0) {
    return new Set(collapsedPaths);
  }
  if (Array.isArray(collapsedPaths) && collapsedPaths.length > 0) {
    return new Set(collapsedPaths);
  }
  return defaultCollapsedPathSet(files, viewedPaths);
}
const COLLAPSED_SET_EXPLICIT_EMPTY = "\0prp-collapsed-explicit";
function expandPathInCollapsedSet(collapsedPaths, path, files, viewedPaths = null) {
  const p = String(path || "").trim();
  const n = materializeCollapsedPaths(collapsedPaths, files, viewedPaths);
  if (p) n.delete(p);
  n.delete(COLLAPSED_SET_EXPLICIT_EMPTY);
  if (n.size === 0) {
    n.add(COLLAPSED_SET_EXPLICIT_EMPTY);
  }
  return n;
}
function togglePathInCollapsedSet(collapsedPaths, path, files, viewedPaths = null) {
  const p = String(path || "").trim();
  if (!p) {
    return materializeCollapsedPaths(collapsedPaths, files, viewedPaths);
  }
  const n = materializeCollapsedPaths(collapsedPaths, files, viewedPaths);
  if (n.has(p)) n.delete(p);
  else n.add(p);
  n.delete(COLLAPSED_SET_EXPLICIT_EMPTY);
  if (n.size === 0) {
    n.add(COLLAPSED_SET_EXPLICIT_EMPTY);
  }
  return n;
}
function setPathCollapsedInSet(collapsedPaths, path, wantCollapsed, files, viewedPaths = null) {
  const p = String(path || "").trim();
  if (!p) {
    return materializeCollapsedPaths(collapsedPaths, files, viewedPaths);
  }
  if (!wantCollapsed) {
    return expandPathInCollapsedSet(collapsedPaths, p, files, viewedPaths);
  }
  const n = materializeCollapsedPaths(collapsedPaths, files, viewedPaths);
  n.add(p);
  n.delete(COLLAPSED_SET_EXPLICIT_EMPTY);
  return n;
}
function shouldAutoExpandOnFileNav(prefs) {
  return prefs?.autoExpandOnFileNav === true;
}


  var api = module.exports && module.exports.__esModule
    ? (module.exports.default && typeof module.exports.default === 'object'
        ? Object.assign({}, module.exports, module.exports.default)
        : module.exports.default || module.exports)
    : module.exports;
  // Prefer named exports map over default-only
  if (api && typeof api === 'object' && api.__esModule) {
    var flat = {};
    for (var k in api) {
      if (k !== 'default' && k !== '__esModule' && Object.prototype.hasOwnProperty.call(api, k)) {
        flat[k] = api[k];
      }
    }
    if (api.default && typeof api.default === 'object') {
      for (var dk in api.default) {
        if (Object.prototype.hasOwnProperty.call(api.default, dk) && flat[dk] === undefined) {
          flat[dk] = api.default[dk];
        }
      }
    }
    if (Object.keys(flat).length) api = flat;
  }
  global.PRModalCollapse = api;

})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);


/* ---- modal/pure/comments-page.js ---- */

/**
 * AUTO-GENERATED from src/modal/lib/comments-page.ts
 * SOURCE OF TRUTH: src/modal/lib/comments-page.ts
 * Do not edit this file — run: npm run build:pure
 */
(function (global) {
  var module = { exports: {} };
  var exports = module.exports;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var stdin_exports = {};
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
});
module.exports = __toCommonJS(stdin_exports);
const DEFAULT_COMMENT_PAGE_SIZE = 50;
function parseLinkRelPage(linkHeader, rel) {
  const raw = String(linkHeader || "");
  if (!raw) return null;
  const re = new RegExp(`rel="?${rel}"?`, "i");
  const parts = raw.split(",");
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
  const o = encodeURIComponent(String(owner || ""));
  const r = encodeURIComponent(String(repo || ""));
  const n = Number(number);
  const perPage = clampPerPage(opts.perPage);
  const page = Math.max(1, Number(opts.page) || 1);
  const base = kind === "review" ? `https://api.github.com/repos/${o}/${r}/pulls/${n}/comments` : `https://api.github.com/repos/${o}/${r}/issues/${n}/comments`;
  const params = new URLSearchParams();
  params.set("per_page", String(perPage));
  params.set("page", String(page));
  if (opts.sort) params.set("sort", String(opts.sort));
  if (opts.direction) params.set("direction", String(opts.direction));
  if (opts.since) params.set("since", String(opts.since));
  return `${base}?${params.toString()}`;
}
function clampPerPage(n, max = 100) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return DEFAULT_COMMENT_PAGE_SIZE;
  return Math.min(max, Math.floor(v));
}
function mergeCommentsById(existing, incoming, excludeIds = null) {
  const ban = excludeIds instanceof Set ? excludeIds : excludeIds ? new Set(
    (Array.isArray(excludeIds) ? excludeIds : []).map((x) => String(x))
  ) : null;
  const map = /* @__PURE__ */ new Map();
  for (const c of Array.isArray(existing) ? existing : []) {
    if (!c || c.id == null) continue;
    const key = String(c.id);
    if (ban && ban.has(key)) continue;
    map.set(key, c);
  }
  for (const c of Array.isArray(incoming) ? incoming : []) {
    if (!c || c.id == null) continue;
    const key = String(c.id);
    if (ban && ban.has(key)) continue;
    map.set(key, c);
  }
  return [...map.values()].sort((a, b) => {
    const ta = String(a.createdAt || a.created_at || "");
    const tb = String(b.createdAt || b.created_at || "");
    if (ta !== tb) return ta.localeCompare(tb);
    return Number(a.id) - Number(b.id);
  });
}
function buildCommentsPageMeta(items, opts = {}) {
  const list = Array.isArray(items) ? items : [];
  const page = Math.max(1, Number(opts.page) || 1);
  const perPage = clampPerPage(opts.perPage);
  const order = opts.order === "from-end" ? "from-end" : opts.order || "asc";
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
  const nextPage = parseLinkNextPage(opts.linkHeader);
  const hasMore = nextPage != null || // If no Link header (mocks), treat full page as maybe-more
  opts.linkHeader == null && list.length >= perPage;
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
    loadedCount: list.length
  };
}
function advanceCommentsMeta(prevMeta, pageMeta, totalLoaded) {
  const prev = prevMeta || {};
  const page = pageMeta || {};
  return {
    page: page.page ?? prev.page ?? 1,
    perPage: page.perPage ?? prev.perPage ?? DEFAULT_COMMENT_PAGE_SIZE,
    hasMore: Boolean(page.hasMore),
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
  if (!a) return b || null;
  if (!b) return a;
  return a < b ? a : b;
}
function maxIso(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  return a > b ? a : b;
}
function sinceCursorFromMeta(meta) {
  if (meta?.newestCreatedAt) return meta.newestCreatedAt;
  return null;
}


  var api = module.exports && module.exports.__esModule
    ? (module.exports.default && typeof module.exports.default === 'object'
        ? Object.assign({}, module.exports, module.exports.default)
        : module.exports.default || module.exports)
    : module.exports;
  // Prefer named exports map over default-only
  if (api && typeof api === 'object' && api.__esModule) {
    var flat = {};
    for (var k in api) {
      if (k !== 'default' && k !== '__esModule' && Object.prototype.hasOwnProperty.call(api, k)) {
        flat[k] = api[k];
      }
    }
    if (api.default && typeof api.default === 'object') {
      for (var dk in api.default) {
        if (Object.prototype.hasOwnProperty.call(api.default, dk) && flat[dk] === undefined) {
          flat[dk] = api.default[dk];
        }
      }
    }
    if (Object.keys(flat).length) api = flat;
  }
  global.PRModalCommentsPage = api;

})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);


/* ---- modal/pure/review-threads.js ---- */

/**
 * AUTO-GENERATED from src/modal/lib/review-threads.ts
 * SOURCE OF TRUTH: src/modal/lib/review-threads.ts
 * Do not edit this file — run: npm run build:pure
 */
(function (global) {
  var module = { exports: {} };
  var exports = module.exports;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/modal/lib/review-threads.ts
var review_threads_exports = {};
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
});
module.exports = __toCommonJS(review_threads_exports);

// src/modal/lib/review-threads-group.ts
function groupReviewThreads(comments) {
  const list = Array.isArray(comments) ? comments : [];
  const byId = /* @__PURE__ */ new Map();
  for (const c of list) {
    if (c && c.id != null) byId.set(String(c.id), c);
  }
  const roots = [];
  const children = /* @__PURE__ */ new Map();
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
      resolved: Boolean(root.resolved ?? root.isResolved),
      outdated: Boolean(root.outdated),
      pending: Boolean(
        root.pending || replies.some((r) => r && r.pending)
      ),
      threadNodeId: root.threadNodeId || root.thread_id || root.pullRequestReviewThreadId || null,
      count: 1 + replies.length
    };
  });
}
function countReviewThreadsByPath(comments) {
  const threads = groupReviewThreads(comments);
  const map = /* @__PURE__ */ new Map();
  for (const t of threads) {
    const p = t.path || "";
    if (!p) continue;
    map.set(p, (map.get(p) || 0) + 1);
  }
  return map;
}
function countUnresolvedReviewThreadsByPath(comments) {
  const threads = groupReviewThreads(comments);
  const map = /* @__PURE__ */ new Map();
  for (const t of threads) {
    if (t.resolved) continue;
    const p = t.path || "";
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
  const map = /* @__PURE__ */ new Map();
  const threads = groupReviewThreads(comments);
  for (const t of threads) {
    if (!t.pending) continue;
    const p = t.path || "";
    if (!p) continue;
    map.set(p, (map.get(p) || 0) + 1);
  }
  for (const c of Array.isArray(comments) ? comments : []) {
    if (!c?.pending) continue;
    const p = c.path || "";
    if (!p || map.has(p)) continue;
    map.set(p, 1);
  }
  return map;
}
function countReviewThreadTotals(comments, opts = {}) {
  const pathSet = opts?.allowedPaths instanceof Set ? opts.allowedPaths : opts?.allowedPaths ? new Set(
    Array.isArray(opts.allowedPaths) ? opts.allowedPaths.map(String).filter(Boolean) : []
  ) : null;
  const excludeOutdated = Boolean(opts?.excludeOutdated);
  const threads = groupReviewThreads(comments);
  let total = 0;
  let unresolved = 0;
  let resolved = 0;
  let pendingThreads = 0;
  for (const t of threads) {
    const p = t.path || "";
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
  if (raw == null || raw === "") return null;
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
    return Math.floor(raw);
  }
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
    if (id != null) byId.set(id, c);
  }
  let cur = byId.get(start) || null;
  if (!cur) return start;
  const seen = /* @__PURE__ */ new Set();
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
function filterFilesByQuery(files, query) {
  const list = Array.isArray(files) ? files : [];
  const q = String(query || "").trim().toLowerCase();
  if (!q) return list.slice();
  return list.filter((f) => {
    const path = String(f.filename || f.path || "").toLowerCase();
    return path.includes(q);
  });
}
function toggleViewedPath(viewed, path) {
  const next = viewed instanceof Set ? new Set(viewed) : new Set(viewed || []);
  const p = String(path || "");
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

// src/modal/lib/review-threads-transport.ts
var REVIEW_THREADS_API_MAX = 100;
var REVIEW_THREADS_PAGE_SIZE = 100;
var REVIEW_THREADS_WARM_PROBE_SIZE = 100;
function hasUsableReviewThreadsCache(detail) {
  if (!detail || typeof detail !== "object") return false;
  if (detail._sketch) return false;
  const threads = Array.isArray(detail.reviewThreads) ? detail.reviewThreads : [];
  const comments = Array.isArray(detail.reviewComments) ? detail.reviewComments : [];
  const meta = detail.reviewThreadsMeta || {};
  const loadedMeta = Number(meta.loadedThreadCount);
  const withNode = threads.some((t) => t && t.threadNodeId) || comments.some((c) => c && c.threadNodeId);
  if (!withNode && !(loadedMeta > 0) && threads.length === 0 && comments.length === 0) {
    return false;
  }
  return withNode || loadedMeta > 0;
}
function pickNewestThreadsPageSize(opts = {}) {
  void opts;
  return REVIEW_THREADS_PAGE_SIZE;
}
function shouldTrustRestEmptyReviewThreads(opts = {}) {
  if (opts?.forceGraphql || opts?.forceFull) return false;
  const prCount = opts?.reviewCommentsCount;
  if (prCount != null && Number.isFinite(Number(prCount)) && Number(prCount) <= 0) {
    return true;
  }
  const restN = opts?.restCommentCount;
  if (restN != null && Number.isFinite(Number(restN)) && Number(restN) <= 0) {
    return true;
  }
  return false;
}
function chooseReviewThreadsTransport(opts = {}) {
  if (opts?.preferRest === true) return "rest";
  if (opts?.forceGraphql || opts?.forceFull) return "graphql";
  if (opts?.preferRest === false) return "graphql";
  return "graphql";
}
function isGraphqlReviewThreadNodeId(id) {
  return /^PRRT_/i.test(String(id || "").trim());
}
function threadNeedsEagerComments(thread, opts = {}) {
  if (!thread || !isGraphqlReviewThreadNodeId(thread.threadNodeId)) return false;
  if (opts?.forceAll) return true;
  const tid = String(thread.threadNodeId);
  const expanded = opts?.expandedThreadIds;
  if (expanded != null) {
    if (expanded instanceof Set) {
      if (expanded.has(tid)) return true;
    } else if (Array.isArray(expanded)) {
      if (expanded.some((id) => String(id) === tid)) return true;
    } else if (typeof expanded[Symbol.iterator] === "function") {
      for (const id of expanded) {
        if (String(id) === tid) return true;
      }
    }
  }
  return !Boolean(thread.resolved);
}
function selectThreadIdsForEagerComments(threads, opts = {}) {
  const list = Array.isArray(threads) ? threads : [];
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  for (const t of list) {
    if (!threadNeedsEagerComments(t, opts)) continue;
    const id = String(t.threadNodeId || "").trim();
    if (!id || seen.has(id)) continue;
    if (t.commentsLoaded === true) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}
function threadCommentsAreLoaded(thread, comments = null) {
  if (!thread) return false;
  if (thread.commentsLoaded === true) return true;
  if (thread.commentsLoaded === false) return false;
  if (Array.isArray(thread.commentIds) && thread.commentIds.length > 0) {
    if (!isGraphqlReviewThreadNodeId(thread.threadNodeId)) return true;
  }
  const tid = String(thread.threadNodeId || "");
  if (!tid || !Array.isArray(comments)) return false;
  let n = 0;
  for (const c of comments) {
    if (!c || String(c.threadNodeId || "") !== tid) continue;
    if (c._commentsPending) continue;
    n += 1;
  }
  return n > 0;
}
function selectThreadIdsMissingComments(threads, comments = null, opts = {}) {
  const list = Array.isArray(threads) ? threads : [];
  const only = opts?.onlyThreadIds ? new Set(
    [...opts.onlyThreadIds].map((id) => String(id || "").trim()).filter(Boolean)
  ) : null;
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  for (const t of list) {
    const id = String(t?.threadNodeId || "").trim();
    if (!isGraphqlReviewThreadNodeId(id)) continue;
    if (only && !only.has(id)) continue;
    if (only) {
      if (threadCommentsAreLoaded(t, comments)) continue;
    } else if (!threadNeedsEagerComments(t, opts)) {
      continue;
    } else if (threadCommentsAreLoaded(t, comments)) {
      continue;
    }
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}
function shouldSkipUnresolvedByIdsBulk(opts = {}) {
  if (opts?.forceFull || opts?.mode === "full-threads") return false;
  if (opts?.hostRestFallback) return true;
  const src = String(opts?.newestSource || "").toLowerCase();
  return src === "rest";
}
function remainingUnresolvedForByIdsBulk(unresolvedIds, updatedIdSet = null, knownMissing = null) {
  const updated = updatedIdSet instanceof Set ? updatedIdSet : new Set(
    [...updatedIdSet || []].map((id) => String(id || "")).filter(Boolean)
  );
  const missing = knownMissing instanceof Set ? knownMissing : new Set(
    [...knownMissing || []].map((id) => String(id || "")).filter(Boolean)
  );
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  for (const raw of unresolvedIds || []) {
    const id = String(raw || "").trim();
    if (!id || seen.has(id)) continue;
    if (!isGraphqlReviewThreadNodeId(id)) continue;
    if (updated.has(id) || missing.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}
function confirmedMissingThreadIdsFromNodes(chunkIds, rawNodes) {
  const ids = Array.isArray(chunkIds) ? chunkIds.map((id) => String(id)) : [];
  if (!Array.isArray(rawNodes) || !ids.length) return [];
  const missing = [];
  const n = Math.min(ids.length, rawNodes.length);
  for (let i = 0; i < n; i++) {
    if (rawNodes[i] == null) missing.push(ids[i]);
  }
  return missing;
}
function resolveMissingThreadIdsForDrop(page) {
  if (!page || typeof page !== "object") return [];
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
  const prevRc = Array.isArray(detail.reviewComments) ? detail.reviewComments : [];
  const prevTh = Array.isArray(detail.reviewThreads) ? detail.reviewThreads : [];
  return {
    ...detail,
    reviewComments: prevRc.filter((c) => {
      if (!c) return false;
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
  if (!missing.length) return detail;
  return dropReviewThreadsByNodeIds(detail, missing);
}
function buildRestReviewThreadsPageFromComments(items, direction = "newest") {
  const list = Array.isArray(items) ? items : [];
  const empty = {
    threads: [],
    comments: [],
    hasMore: false,
    endCursor: null,
    startCursor: null,
    hasNextPage: false,
    hasPreviousPage: false,
    totalCount: 0,
    pageCount: list.length ? 1 : 0,
    direction: direction || "newest",
    window: "newest",
    source: "rest"
  };
  if (!list.length) return empty;
  const byId = /* @__PURE__ */ new Map();
  for (const c of list) {
    if (c && c.id != null) byId.set(String(c.id), c);
  }
  const roots = list.filter((c) => {
    if (!c || c.id == null) return false;
    const parent = c.inReplyToId ?? c.in_reply_to_id ?? null;
    return parent == null || !byId.has(String(parent));
  });
  const threads = roots.map((r) => {
    const replyIds = list.filter(
      (c) => c && String(c.inReplyToId ?? c.in_reply_to_id ?? "") === String(r.id)
    ).map((c) => c.id);
    const threadNodeId = r.threadNodeId && /^PRRT_/i.test(String(r.threadNodeId)) ? String(r.threadNodeId) : `rest-thread-${r.id}`;
    const commentIds = [r.id, ...replyIds];
    for (const cid of commentIds) {
      const row = byId.get(String(cid));
      if (row) {
        row.threadNodeId = threadNodeId;
        row.loadWindow = "newest";
      }
    }
    return {
      threadNodeId,
      resolved: Boolean(r.resolved ?? r.isResolved),
      outdated: Boolean(r.outdated),
      path: r.path || "",
      line: r.line ?? r.originalLine ?? r.original_line ?? null,
      startLine: r.startLine ?? r.start_line ?? null,
      side: r.side || "RIGHT",
      commentIds,
      commentsLoaded: true,
      loadWindow: "newest"
    };
  });
  return {
    threads,
    comments: list,
    totalCount: list.length,
    startCursor: null,
    endCursor: null,
    hasNextPage: false,
    hasPreviousPage: false,
    hasMore: false,
    pageCount: 1,
    direction: direction || "newest",
    window: "newest",
    source: "rest"
  };
}
function countCommentsForThread(pageOrDetail, threadNodeId, thread = null) {
  const id = String(threadNodeId || "");
  if (!id) return 0;
  if (thread && Array.isArray(thread.commentIds) && thread.commentIds.length) {
    return thread.commentIds.length;
  }
  const comments = Array.isArray(pageOrDetail?.comments) ? pageOrDetail.comments : Array.isArray(pageOrDetail?.reviewComments) ? pageOrDetail.reviewComments : [];
  let n = 0;
  for (const c of comments) {
    if (c && c.threadNodeId != null && String(c.threadNodeId) === id) n += 1;
  }
  return n;
}
function newestThreadsPageMatchesCache(page, detail) {
  if (!page || !detail) {
    return { match: false, reason: "missing" };
  }
  if (!hasUsableReviewThreadsCache(detail)) {
    return { match: false, reason: "no-cache" };
  }
  const pageThreads = Array.isArray(page.threads) ? page.threads : [];
  const cachedThreads = Array.isArray(detail.reviewThreads) ? detail.reviewThreads : [];
  const byId = /* @__PURE__ */ new Map();
  for (const t of cachedThreads) {
    if (t?.threadNodeId) byId.set(String(t.threadNodeId), t);
  }
  if (byId.size === 0) {
    for (const c of Array.isArray(detail.reviewComments) ? detail.reviewComments : []) {
      if (!c?.threadNodeId) continue;
      const id = String(c.threadNodeId);
      if (!byId.has(id)) {
        byId.set(id, {
          threadNodeId: id,
          resolved: Boolean(c.resolved)
        });
      }
    }
  }
  const pageTotal = typeof page.totalCount === "number" && Number.isFinite(page.totalCount) ? page.totalCount : null;
  const cachedTotalRaw = detail.reviewThreadsMeta?.totalCount;
  const cachedTotal = typeof cachedTotalRaw === "number" && Number.isFinite(cachedTotalRaw) ? cachedTotalRaw : null;
  if (pageTotal != null && cachedTotal != null && pageTotal !== cachedTotal) {
    return { match: false, reason: "totalCount" };
  }
  const pageIds = [];
  for (const t of pageThreads) {
    if (!t?.threadNodeId) continue;
    const id = String(t.threadNodeId);
    pageIds.push(id);
    const cached = byId.get(id);
    if (!cached) {
      return { match: false, reason: "unknown-thread" };
    }
    if (Boolean(cached.resolved) !== Boolean(t.resolved)) {
      return { match: false, reason: "resolved" };
    }
    const pageN = countCommentsForThread(page, id, t);
    if (pageN > 0) {
      const cacheN = countCommentsForThread(detail, id, cached);
      if (cacheN > 0 && cacheN !== pageN) {
        return { match: false, reason: "comment-count" };
      }
      if (cacheN === 0 && pageN > 0 && byId.has(id) && Array.isArray(detail.reviewComments)) {
        if (detail.reviewComments.length > 0) {
          return { match: false, reason: "comment-count" };
        }
      }
    }
  }
  const prevNewest = Array.isArray(detail.reviewThreadsMeta?.newestThreadIds) ? detail.reviewThreadsMeta.newestThreadIds.map(String).filter(Boolean) : [];
  if (prevNewest.length > 0 && pageIds.length > 0) {
    for (let i = 0; i < pageIds.length; i++) {
      if (String(prevNewest[i] || "") !== pageIds[i]) {
        return { match: false, reason: "order" };
      }
    }
  }
  return { match: true, reason: "ok" };
}
function shouldEscalateNewestThreadsProbe(page, detail, pageSize) {
  const size = Math.max(0, Number(pageSize) || 0);
  if (size >= REVIEW_THREADS_API_MAX) return false;
  if (!hasUsableReviewThreadsCache(detail)) return true;
  return !newestThreadsPageMatchesCache(page, detail).match;
}

// src/modal/lib/review-threads-map.ts
function mergeReviewThreadMeta(comments, threads) {
  const list = Array.isArray(comments) ? comments : [];
  const byCommentId = /* @__PURE__ */ new Map();
  for (const t of Array.isArray(threads) ? threads : []) {
    if (!t || !t.threadNodeId) continue;
    const meta = {
      threadNodeId: String(t.threadNodeId),
      resolved: Boolean(t.resolved)
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
        resolved: Boolean(c.resolved)
      };
    }
    return {
      ...c,
      threadNodeId: meta.threadNodeId,
      resolved: meta.resolved
    };
  });
}
function mapGraphqlReviewThreads(nodes) {
  if (!Array.isArray(nodes)) return [];
  return nodes.filter((t) => t && t.id).map((t) => ({
    threadNodeId: t.id,
    resolved: Boolean(t.isResolved),
    commentIds: (t.comments?.nodes || []).map((c) => c?.databaseId).filter((id) => id != null)
  }));
}
function graphqlCommentsAreFullyLoaded(commentsConn) {
  if (!commentsConn || typeof commentsConn !== "object") return false;
  const nodes = Array.isArray(commentsConn.nodes) ? commentsConn.nodes : [];
  const totalRaw = commentsConn.totalCount;
  const total = typeof totalRaw === "number" && Number.isFinite(totalRaw) ? totalRaw : null;
  if (nodes.length === 0) return total === 0;
  if (total != null) return total <= nodes.length;
  return true;
}
function mapGraphqlReviewThreadNodes(allNodes) {
  const threads = [];
  const comments = [];
  for (const t of Array.isArray(allNodes) ? allNodes : []) {
    if (!t?.id) continue;
    const commentsConnPresent = t.comments != null && typeof t.comments === "object";
    const commentsLoaded = commentsConnPresent && graphqlCommentsAreFullyLoaded(t.comments);
    const commentIds = [];
    if (commentsConnPresent) {
      for (const node of t.comments?.nodes || []) {
        if (!node) continue;
        const dbId = node.databaseId ?? node.id;
        if (dbId == null) continue;
        const id = typeof dbId === "number" ? dbId : Number(dbId) || String(dbId);
        commentIds.push(id);
        const reviewState = String(
          node.pullRequestReview?.state || ""
        ).toUpperCase();
        const reviewDbId = node.pullRequestReview?.databaseId != null ? Number(node.pullRequestReview.databaseId) : null;
        const pending = reviewState === "PENDING";
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
          // GraphQL global id required for hide/unhide + minimizable enrich
          nodeId: node.id || null,
          threadNodeId: t.id,
          // Shell first:1 includes pullRequestReview so timeline can group
          // before by-ids hydrate (resolved threads skip eager bulk).
          reviewId: Number.isFinite(reviewDbId) ? reviewDbId : null,
          resolved: Boolean(t.isResolved),
          outdated: Boolean(node.outdated ?? t.isOutdated),
          pending,
          pendingReviewId: pending ? reviewDbId : null,
          // Hide/minimize — shell query selects these; do not drop on map
          isMinimized: node.isMinimized != null ? Boolean(node.isMinimized) : null,
          minimizedReason: node.minimizedReason ?? null,
          viewerCanMinimize: node.viewerCanMinimize != null ? Boolean(node.viewerCanMinimize) : null,
          // Preview-only root when shell first:1 and more replies remain
          _commentsPreview: commentsLoaded ? false : true
        });
      }
    }
    threads.push({
      threadNodeId: t.id,
      resolved: Boolean(t.isResolved),
      outdated: Boolean(t.isOutdated),
      path: t.path || "",
      line: t.line ?? t.originalLine ?? null,
      startLine: t.startLine ?? t.originalStartLine ?? null,
      side: t.diffSide || "RIGHT",
      commentIds,
      commentsLoaded,
      commentCount: typeof t.comments?.totalCount === "number" ? t.comments.totalCount : commentIds.length || null
    });
  }
  return { threads, comments };
}
function mergeCommentsBulkIntoThreadsPage(shellPage, bulkPage) {
  const shellThreads = Array.isArray(shellPage?.threads) ? shellPage.threads : [];
  const bulkThreads = Array.isArray(bulkPage?.threads) ? bulkPage.threads : [];
  const bulkComments = Array.isArray(bulkPage?.comments) ? bulkPage.comments : [];
  const byId = new Map(
    bulkThreads.filter((t) => t?.threadNodeId).map((t) => [String(t.threadNodeId), t])
  );
  const threads = shellThreads.map((t) => {
    const id = t?.threadNodeId ? String(t.threadNodeId) : "";
    const full = id ? byId.get(id) : null;
    if (!full) {
      return {
        ...t,
        commentsLoaded: t.commentsLoaded === true
      };
    }
    const fullObj = full && typeof full === "object" ? full : {};
    return {
      ...t,
      ...fullObj,
      commentsLoaded: true,
      commentIds: Array.isArray(fullObj.commentIds) ? fullObj.commentIds : t.commentIds || []
    };
  });
  const loadedIds = new Set(
    threads.filter((t) => t.commentsLoaded).map((t) => String(t.threadNodeId))
  );
  const prevComments = Array.isArray(shellPage?.comments) ? shellPage.comments : [];
  const kept = retainShellCommentsAfterBulk(prevComments, loadedIds);
  const seen = new Set(kept.map((c) => String(c.id)));
  for (const c of bulkComments) {
    if (!c || c.id == null) continue;
    const k = String(c.id);
    if (seen.has(k)) continue;
    seen.add(k);
    kept.push(c);
  }
  return {
    ...shellPage,
    threads,
    comments: ensureShellPlaceholderComments(threads, kept),
    shellOnly: false
  };
}
function retainShellCommentsAfterBulk(prevComments, loadedIds) {
  const loaded = loadedIds instanceof Set ? loadedIds : new Set(
    [...loadedIds || []].map((id) => String(id || "").trim()).filter(Boolean)
  );
  const kept = [];
  for (const c of Array.isArray(prevComments) ? prevComments : []) {
    if (!c?.threadNodeId) continue;
    const tid = String(c.threadNodeId);
    if (loaded.has(tid)) {
      if (c._commentsPending || c._commentsPreview) continue;
      kept.push(c);
      continue;
    }
    if (c._commentsPending && !String(c.body || "").trim()) continue;
    kept.push(c);
  }
  return kept;
}
function hydrateReviewCommentsInPlace(prevComments, bulkComments, loadedThreadIds) {
  const loaded = loadedThreadIds instanceof Set ? loadedThreadIds : new Set(
    [...loadedThreadIds || []].map((id) => String(id || "").trim()).filter(Boolean)
  );
  if (!loaded.size) {
    return Array.isArray(prevComments) ? prevComments.slice() : [];
  }
  const bulkByTid = /* @__PURE__ */ new Map();
  for (const c of Array.isArray(bulkComments) ? bulkComments : []) {
    if (!c || c.id == null) continue;
    const tid = String(c.threadNodeId || "").trim();
    if (!tid || !loaded.has(tid)) continue;
    if (!bulkByTid.has(tid)) bulkByTid.set(tid, []);
    const row = c._commentsPreview ? { ...c, _commentsPreview: false } : c;
    bulkByTid.get(tid).push(row);
  }
  const emitted = /* @__PURE__ */ new Set();
  const result = [];
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
  for (const [tid, bulk] of bulkByTid) {
    if (emitted.has(tid)) continue;
    for (const bc of bulk) result.push(bc);
  }
  return result;
}
function mergeThreadCommentsBulkIntoDetail(detail, bulkPage) {
  if (!detail || typeof detail !== "object") return detail;
  const prevTh = Array.isArray(detail.reviewThreads) ? detail.reviewThreads : [];
  const prevRc = Array.isArray(detail.reviewComments) ? detail.reviewComments : [];
  const bulkThreads = Array.isArray(bulkPage?.threads) ? bulkPage.threads : [];
  const bulkComments = Array.isArray(bulkPage?.comments) ? bulkPage.comments : [];
  const byId = new Map(
    bulkThreads.filter((t) => t?.threadNodeId).map((t) => [String(t.threadNodeId), t])
  );
  const reviewThreads = prevTh.map((t) => {
    const id = t?.threadNodeId ? String(t.threadNodeId) : "";
    const full = id ? byId.get(id) : null;
    if (!full) return t;
    const fullObj = full && typeof full === "object" ? full : {};
    return {
      ...t,
      ...fullObj,
      commentsLoaded: true,
      commentIds: Array.isArray(fullObj.commentIds) ? fullObj.commentIds : t.commentIds || []
    };
  });
  for (const t of bulkThreads) {
    const id = t?.threadNodeId ? String(t.threadNodeId) : "";
    if (!id || prevTh.some((p) => String(p?.threadNodeId) === id)) continue;
    reviewThreads.push({ ...t, commentsLoaded: true });
  }
  const loadedIds = new Set(
    bulkThreads.map((t) => String(t?.threadNodeId || "")).filter(Boolean)
  );
  const reviewComments = hydrateReviewCommentsInPlace(
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
    resolved: Boolean(thread.resolved),
    outdated: Boolean(thread.outdated),
    pending: false,
    _commentsPending: true,
    commentsLoaded: false
  };
}
function ensureShellPlaceholderComments(threads, comments = null) {
  const list = Array.isArray(comments) ? comments.slice() : [];
  const covered = /* @__PURE__ */ new Set();
  for (const c of list) {
    if (!c?.threadNodeId) continue;
    covered.add(String(c.threadNodeId));
  }
  for (const t of Array.isArray(threads) ? threads : []) {
    const tid = t?.threadNodeId ? String(t.threadNodeId) : "";
    if (!isGraphqlReviewThreadNodeId(tid)) continue;
    if (covered.has(tid)) continue;
    const ph = buildShellThreadPlaceholderComment(t);
    if (!ph) continue;
    list.push(ph);
    covered.add(tid);
  }
  return list;
}
function mergeReviewThreadGroupsWithShells(commentGroups, reviewThreads) {
  const groups = Array.isArray(commentGroups) ? commentGroups.slice() : [];
  const have = /* @__PURE__ */ new Set();
  for (const g of groups) {
    const tid = g?.threadNodeId || g?.root?.threadNodeId || null;
    if (tid) have.add(String(tid));
  }
  for (const t of Array.isArray(reviewThreads) ? reviewThreads : []) {
    const tid = t?.threadNodeId ? String(t.threadNodeId) : "";
    if (!tid || have.has(tid)) continue;
    if (threadCommentsAreLoaded(t, null) && (t.commentIds || []).length) {
      continue;
    }
    have.add(tid);
    groups.push({
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
        resolved: Boolean(t.resolved),
        outdated: Boolean(t.outdated),
        _commentsPending: true
      },
      replies: [],
      resolved: Boolean(t.resolved),
      outdated: Boolean(t.outdated),
      pending: false,
      threadNodeId: tid,
      count: 0,
      commentsPending: true,
      commentsLoaded: false
    });
  }
  return groups;
}

// src/modal/lib/review-threads-build.ts
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
  const parentId = normalizeReviewCommentId(commentId);
  const text = String(body || "").trim();
  return {
    method: "POST",
    url: `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}/comments/${parentId ?? commentId}/replies`,
    body: { body: text }
  };
}
function buildResolveThreadGraphql(threadNodeId, resolved = true) {
  const mutation = resolved ? `mutation($id:ID!){ resolveReviewThread(input:{threadId:$id}){ thread { id isResolved } } }` : `mutation($id:ID!){ unresolveReviewThread(input:{threadId:$id}){ thread { id isResolved } } }`;
  return {
    method: "POST",
    url: "https://api.github.com/graphql",
    body: {
      query: mutation,
      variables: { id: threadNodeId }
    }
  };
}


  var api = module.exports && module.exports.__esModule
    ? (module.exports.default && typeof module.exports.default === 'object'
        ? Object.assign({}, module.exports, module.exports.default)
        : module.exports.default || module.exports)
    : module.exports;
  // Prefer named exports map over default-only
  if (api && typeof api === 'object' && api.__esModule) {
    var flat = {};
    for (var k in api) {
      if (k !== 'default' && k !== '__esModule' && Object.prototype.hasOwnProperty.call(api, k)) {
        flat[k] = api[k];
      }
    }
    if (api.default && typeof api.default === 'object') {
      for (var dk in api.default) {
        if (Object.prototype.hasOwnProperty.call(api.default, dk) && flat[dk] === undefined) {
          flat[dk] = api.default[dk];
        }
      }
    }
    if (Object.keys(flat).length) api = flat;
  }
  global.PRModalReviewThreads = api;

})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);


/* ---- modal/pure/pending-review.js ---- */

/**
 * AUTO-GENERATED from src/modal/lib/pending-review.ts
 * SOURCE OF TRUTH: src/modal/lib/pending-review.ts
 * Do not edit this file — run: npm run build:pure
 */
(function (global) {
  var module = { exports: {} };
  var exports = module.exports;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var stdin_exports = {};
__export(stdin_exports, {
  LOCKED_PR_START_REVIEW_MSG: () => LOCKED_PR_START_REVIEW_MSG,
  addPendingComment: () => addPendingComment,
  buildPendingReviewSubmitPayload: () => buildPendingReviewSubmitPayload,
  canPublishImmediateReviewComment: () => canPublishImmediateReviewComment,
  createEmptyPendingReview: () => createEmptyPendingReview,
  discardPendingReview: () => discardPendingReview,
  formatStartReviewError: () => formatStartReviewError,
  pendingAttachCtaLabel: () => pendingAttachCtaLabel,
  pendingReviewCount: () => pendingReviewCount,
  pendingReviewCtaLabel: () => pendingReviewCtaLabel,
  setPendingReviewBody: () => setPendingReviewBody,
  viewerHasPendingReview: () => viewerHasPendingReview
});
module.exports = __toCommonJS(stdin_exports);
function createEmptyPendingReview() {
  return { comments: [], body: "" };
}
function addPendingComment(batch, comment) {
  const base = batch && Array.isArray(batch.comments) ? batch : createEmptyPendingReview();
  const body = String(comment?.body || "").trim();
  if (!body || !comment?.path || comment.line == null) {
    return { batch: base, added: false };
  }
  const id = comment.id || `pc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const next = {
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
  };
  return { batch: next, added: true };
}
function discardPendingReview() {
  return createEmptyPendingReview();
}
const LOCKED_PR_START_REVIEW_MSG = "This pull request is locked \u2014 Start review / comments are disabled on GitHub.";
function formatStartReviewError(err) {
  const raw = err?.message || String(err || "");
  const locked = /locked/i.test(raw) || Number(err?.status) === 422 && /lock/i.test(raw);
  return locked ? LOCKED_PR_START_REVIEW_MSG : raw;
}
function setPendingReviewBody(batch, body) {
  const base = batch && Array.isArray(batch.comments) ? batch : createEmptyPendingReview();
  return { ...base, body: String(body || "") };
}
function pendingReviewCount(batch) {
  return Array.isArray(batch?.comments) ? batch.comments.length : 0;
}
function pendingReviewCtaLabel(batch) {
  return pendingReviewCount(batch) > 0 ? "Add comment" : "Start review";
}
function viewerHasPendingReview(input) {
  if (input == null || input === false) return false;
  if (input === true) return true;
  if (typeof input === "number") {
    return Number.isFinite(input) && input > 0;
  }
  if (typeof input === "object") {
    if (input.hasServerPending) return true;
    const sid = input.serverPendingReviewId;
    if (sid != null && String(sid).trim() !== "" && String(sid) !== "0") {
      return true;
    }
    if (Number(input.pendingCount) > 0) return true;
    if (input.hasPendingReplies) return true;
    if (input.rootPending) return true;
    return false;
  }
  return Boolean(input);
}
function canPublishImmediateReviewComment(input) {
  return !viewerHasPendingReview(input);
}
function pendingAttachCtaLabel(input) {
  return viewerHasPendingReview(input) ? "Add comment" : "Start review";
}
function buildPendingReviewSubmitPayload(batch, opts = {
  // typed loosely for mutable REST payloads
}) {
  const event = opts.event || "COMMENT";
  if (!["COMMENT", "APPROVE", "REQUEST_CHANGES"].includes(event)) {
    return null;
  }
  const comments = (batch?.comments || []).map((c) => {
    const row = {
      path: c.path,
      body: c.body,
      line: Number(c.line),
      side: c.side || "RIGHT"
    };
    if (c.startLine != null && Number(c.startLine) !== Number(c.line)) {
      row.start_line = Number(c.startLine);
      row.start_side = c.startSide || c.side || "RIGHT";
    }
    return row;
  });
  const payload = {
    event,
    body: opts.body != null ? String(opts.body) : String(batch?.body || "")
  };
  if (opts.commitId) payload.commit_id = opts.commitId;
  if (comments.length) payload.comments = comments;
  return payload;
}


  var api = module.exports && module.exports.__esModule
    ? (module.exports.default && typeof module.exports.default === 'object'
        ? Object.assign({}, module.exports, module.exports.default)
        : module.exports.default || module.exports)
    : module.exports;
  // Prefer named exports map over default-only
  if (api && typeof api === 'object' && api.__esModule) {
    var flat = {};
    for (var k in api) {
      if (k !== 'default' && k !== '__esModule' && Object.prototype.hasOwnProperty.call(api, k)) {
        flat[k] = api[k];
      }
    }
    if (api.default && typeof api.default === 'object') {
      for (var dk in api.default) {
        if (Object.prototype.hasOwnProperty.call(api.default, dk) && flat[dk] === undefined) {
          flat[dk] = api.default[dk];
        }
      }
    }
    if (Object.keys(flat).length) api = flat;
  }
  global.PRModalPendingReview = api;

})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);


/* ---- modal/pure/pr-edit-api.js ---- */

/**
 * AUTO-GENERATED from src/modal/lib/pr-edit-api.ts
 * SOURCE OF TRUTH: src/modal/lib/pr-edit-api.ts
 * Do not edit this file — run: npm run build:pure
 */
(function (global) {
  var module = { exports: {} };
  var exports = module.exports;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var stdin_exports = {};
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
});
module.exports = __toCommonJS(stdin_exports);
function buildUpdatePullRequest(owner, repo, pullNumber, fields = {
  // typed loosely for mutable REST payloads
}) {
  const body = {};
  if (fields.title != null) body.title = String(fields.title);
  if (fields.body != null) body.body = String(fields.body);
  if (fields.base != null) body.base = String(fields.base);
  if (fields.state != null) body.state = fields.state === "closed" ? "closed" : "open";
  return {
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
  if (commitTitle != null) body.commit_title = String(commitTitle);
  if (commitMessage != null) body.commit_message = String(commitMessage);
  return {
    method: "PUT",
    url: `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}/merge`,
    body
  };
}
function buildUpdateBranch(owner, repo, pullNumber, { expectedHeadSha } = {}) {
  const body = {};
  if (expectedHeadSha) body.expected_head_sha = String(expectedHeadSha);
  return {
    method: "PUT",
    url: `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}/update-branch`,
    body
  };
}
function buildSetSubscription(owner, repo, issueNumber, { subscribed = true, ignored = false, nodeId = null } = {}) {
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
    subscribed: false,
    ignored: false,
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
  if (stage === "ready") {
    return {
      query: `mutation($id:ID!){markPullRequestReadyForReview(input:{pullRequestId:$id}){pullRequest{id isDraft}}}`,
      variables: { id }
    };
  }
  return {
    query: `mutation($id:ID!){convertPullRequestToDraft(input:{pullRequestId:$id}){pullRequest{id isDraft}}}`,
    variables: { id }
  };
}
function draftFromStageGraphqlData(data) {
  if (!data || typeof data !== "object") return null;
  const pr = data.markPullRequestReadyForReview?.pullRequest || data.convertPullRequestToDraft?.pullRequest || data.pullRequest || null;
  if (!pr || typeof pr !== "object") return null;
  if (typeof pr.isDraft === "boolean") return pr.isDraft;
  if (typeof pr.draft === "boolean") return pr.draft;
  return null;
}
function parseLinkedIssueNumbers(body) {
  const text = body == null ? "" : String(body);
  const nums = /* @__PURE__ */ new Set();
  const re = /(?:(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+)?#(\d+)/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > 0) nums.add(n);
  }
  return [...nums].sort((a, b) => Number(a) - Number(b));
}
function buildRerequestReviewerLogins(detail) {
  const d = detail || {};
  const pending = new Set(
    (d.requestedReviewers || []).map((x) => String(x || "").trim()).filter(Boolean).map((x) => x.toLowerCase())
  );
  const author = String(d.author || "").trim().toLowerCase();
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  function isBotLogin(login, review) {
    if (review?.isBot === true || String(review?.type || "").toLowerCase() === "bot") {
      return true;
    }
    const key = String(login || "").toLowerCase();
    if (d.actorIsBot && typeof d.actorIsBot === "object") {
      if (d.actorIsBot instanceof Map) {
        if (d.actorIsBot.get(key)) return true;
      } else if (d.actorIsBot[key]) return true;
    }
    return /\[bot\]$/i.test(String(login || ""));
  }
  function consider(login, review = null) {
    const raw = String(login || "").trim();
    if (!raw) return;
    const key = raw.toLowerCase();
    if (author && key === author) return;
    if (pending.has(key)) return;
    if (isBotLogin(raw, review)) return;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(raw);
  }
  for (const r of d.reviews || []) {
    consider(r?.author, r);
  }
  for (const login of d.extraLogins || []) {
    consider(login, null);
  }
  return out;
}
function parseSuggestionFences(body) {
  const text = body == null ? "" : String(body);
  const out = [];
  const re = /```suggestion[^\n]*\r?\n([\s\S]*?)```/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    out.push({ content: m[1].replace(/\n$/, ""), raw: m[0] });
  }
  return out;
}
function applySuggestionToFileContent(fileContent, { startLine, endLine, suggestion }) {
  const lines = String(fileContent ?? "").split("\n");
  const endsWithNl = String(fileContent ?? "").endsWith("\n");
  if (endsWithNl && lines[lines.length - 1] === "") lines.pop();
  const start = Math.max(1, Number(startLine) || 1);
  const end = Math.max(start, Number(endLine) || start);
  const sugLines = String(suggestion ?? "").split("\n");
  if (sugLines.length && sugLines[sugLines.length - 1] === "" && suggestion.endsWith("\n")) {
    sugLines.pop();
  }
  const before = lines.slice(0, start - 1);
  const after = lines.slice(end);
  const next = [...before, ...sugLines, ...after];
  let out = next.join("\n");
  if (endsWithNl || out.length) out = out.endsWith("\n") ? out : `${out}
`;
  return out;
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
  if (a === "approve") return { kind: "review", event: "APPROVE" };
  if (a === "request_changes" || a === "request-changes") {
    return { kind: "review", event: "REQUEST_CHANGES" };
  }
  return { kind: "issue-comment", event: "COMMENT" };
}
function normalizeGithubLogin(login) {
  return String(login || "").trim().replace(/^@/, "").toLowerCase();
}
function isViewerPrAuthor(detail) {
  const author = normalizeGithubLogin(detail?.author);
  const viewer = normalizeGithubLogin(detail?.viewerLogin);
  return Boolean(author && viewer && author === viewer);
}
function canSubmitReviewVerdict(detail) {
  return !isViewerPrAuthor(detail);
}
function isReviewVerdictKind(kind) {
  const k = String(kind || "").toLowerCase();
  return k === "approve" || k === "request_changes" || k === "request-changes";
}
function mapRestReviewComment(raw, fallback = {}) {
  if (!raw && !String(fallback.body || "").trim()) return null;
  const r = raw || {};
  const subjectRaw = String(
    r.subject_type || r.subjectType || fallback.subjectType || fallback.subject_type || ""
  ).toLowerCase();
  const isFile = subjectRaw === "file" || fallback.subjectType === "file" && subjectRaw !== "line";
  const lineRaw = isFile ? null : r.line ?? r.original_line ?? (r.position != null && Number.isFinite(Number(r.position)) ? Number(r.position) : null) ?? fallback.line ?? null;
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
    resolved: Boolean(r.resolved ?? fallback.resolved),
    pending: Boolean(r.pending ?? fallback.pending),
    pendingReviewId: r.pendingReviewId ?? fallback.pendingReviewId ?? null,
    outdated: Boolean(r.outdated ?? fallback.outdated),
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
  if (list.some((c) => String(c.id) === String(comment.id))) {
    return { ...base, reviewComments: list };
  }
  list.push(comment);
  return { ...base, reviewComments: list };
}
function appendIssueCommentToDetail(detail, comment) {
  const base = detail || {};
  if (!comment || comment.id == null) return base;
  const list = Array.isArray(base.comments) ? base.comments.slice() : [];
  if (list.some((c) => String(c.id) === String(comment.id))) {
    return { ...base, comments: list };
  }
  list.push(comment);
  return { ...base, comments: list };
}
function stampThreadResolved(detail, threadNodeId, resolved) {
  if (!detail) return detail;
  const tid = threadNodeId != null ? String(threadNodeId).trim() : "";
  if (!tid) return detail;
  const nextResolved = Boolean(resolved);
  const stampC = (c) => c && String(c.threadNodeId || "") === tid ? { ...c, resolved: nextResolved } : c;
  const prevStamps = detail._resolveStamps && typeof detail._resolveStamps === "object" ? detail._resolveStamps : {};
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
  const map = stamps && typeof stamps === "object" && !Array.isArray(stamps) ? stamps : detail._resolveStamps && typeof detail._resolveStamps === "object" ? detail._resolveStamps : null;
  if (!map || !Object.keys(map).length) {
    return detail._resolveStamps ? { ...detail, _resolveStamps: void 0 } : detail;
  }
  const remaining = { ...map };
  const inComments = Array.isArray(detail.reviewComments) ? detail.reviewComments : [];
  const inThreads = Array.isArray(detail.reviewThreads) ? detail.reviewThreads : [];
  for (const tid of Object.keys(remaining)) {
    const want = Boolean(remaining[tid]);
    const relatedC = inComments.filter(
      (c) => c && String(c.threadNodeId || "") === tid
    );
    const relatedT = inThreads.filter(
      (t) => t && String(t.threadNodeId || "") === tid
    );
    if (relatedC.length === 0 && relatedT.length === 0) continue;
    const allAgree = (relatedC.length === 0 || relatedC.every((c) => Boolean(c.resolved) === want)) && (relatedT.length === 0 || relatedT.every((t) => Boolean(t.resolved) === want));
    if (allAgree) delete remaining[tid];
  }
  const stampC = (c) => {
    if (!c) return c;
    const tid = String(c.threadNodeId || "");
    if (!tid || !Object.prototype.hasOwnProperty.call(map, tid)) return c;
    const want = Boolean(map[tid]);
    if (Boolean(c.resolved) === want) return c;
    return { ...c, resolved: want };
  };
  return {
    ...detail,
    reviewComments: inComments.map(stampC),
    reviewThreads: inThreads.map(stampC),
    _resolveStamps: Object.keys(remaining).length > 0 ? remaining : void 0
  };
}


  var api = module.exports && module.exports.__esModule
    ? (module.exports.default && typeof module.exports.default === 'object'
        ? Object.assign({}, module.exports, module.exports.default)
        : module.exports.default || module.exports)
    : module.exports;
  // Prefer named exports map over default-only
  if (api && typeof api === 'object' && api.__esModule) {
    var flat = {};
    for (var k in api) {
      if (k !== 'default' && k !== '__esModule' && Object.prototype.hasOwnProperty.call(api, k)) {
        flat[k] = api[k];
      }
    }
    if (api.default && typeof api.default === 'object') {
      for (var dk in api.default) {
        if (Object.prototype.hasOwnProperty.call(api.default, dk) && flat[dk] === undefined) {
          flat[dk] = api.default[dk];
        }
      }
    }
    if (Object.keys(flat).length) api = flat;
  }
  global.PRModalPrEditApi = api;

})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);


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
   * True when a Check Run is actively working (spinner), not merely expected.
   * queued / waiting / in_progress → working; plain "pending" status → expected.
   */
  function statusIsInProgress(item) {
    const status = String(item?.status || '').toLowerCase();
    return (
      status === 'in_progress' ||
      status === 'queued' ||
      status === 'waiting'
    );
  }

  /**
   * GitHub merge-box bucket for one check item.
   * - pending: expected / waiting for report (static yellow circle)
   * - in_progress: actively running / queued (spinning indicator)
   * @returns {'failure'|'pending'|'in_progress'|'skipped'|'success'}
   */
  function classifyCheckOutcome(item) {
    if (!item || typeof item !== 'object') return 'pending';
    // Commit status contexts (no check-run `status`/`conclusion`)
    if (
      item.kind === 'status' ||
      (item.state != null && item.status == null && item.conclusion == null)
    ) {
      const st = String(item.state || '').toLowerCase();
      if (st === 'failure' || st === 'error') return 'failure';
      if (st === 'success') return 'success';
      // Commit-status "pending" = expected (not a live runner)
      return 'pending';
    }
    const conclusion = String(item.conclusion || '').toLowerCase();
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
    // Still running — spinner
    if (statusIsInProgress(item)) return 'in_progress';
    // Expected / requested / action_required / empty conclusion
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
   * In-progress rows always use wall-clock elapsed from startedAt → nowMs
   * (not completedAt/updatedAt, which often equals startedAt and freezes at `<1s`).
   * @param {{ outcome: string, description?: string, startedAt?: string, completedAt?: string, updatedAt?: string, status?: string }} item
   * @param {number} [nowMs]
   */
  function formatCheckSummary(item, nowMs) {
    if (!item) return '';
    const desc = String(item.description || '').trim();
    const start = parseTime(item.startedAt);
    const outcome = item.outcome || classifyCheckOutcome(item);
    const live =
      outcome === 'in_progress' || statusIsInProgress(item);
    const now = Number.isFinite(nowMs) ? nowMs : Date.now();
    let duration = '';
    if (live && start) {
      duration = formatDurationMs(Math.max(0, now - start));
    } else {
      const end = parseTime(item.completedAt) || parseTime(item.updatedAt);
      if (start && end && end >= start) {
        duration = formatDurationMs(end - start);
      } else if (start && !end) {
        duration = formatDurationMs(Math.max(0, now - start));
      }
    }

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
    // Working (spinner)
    if (live) {
      return duration ? `In progress — ${duration}` : desc || 'In progress';
    }
    // Expected (static yellow)
    return desc || 'Expected — Waiting for status to be reported';
  }

  /**
   * True when merge-box check UI should refresh elapsed every ~1s.
   * (Any in-progress / queued run or status with a start time.)
   * @param {object|null|undefined} checks
   */
  function checksNeedElapsedTick(checks) {
    const n = normalizeChecks(checks);
    for (const r of n.checkRuns || []) {
      if (classifyCheckOutcome(r) !== 'in_progress') continue;
      if (parseTime(r.startedAt || r.started_at)) return true;
    }
    for (const s of n.statuses || []) {
      const o = classifyCheckOutcome({ kind: 'status', state: s.state });
      if (o !== 'in_progress') continue;
      if (parseTime(s.createdAt || s.created_at || s.startedAt || s.started_at)) {
        return true;
      }
    }
    return false;
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
        status: r.status || '',
        conclusion: r.conclusion || '',
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
      in_progress: [],
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
    // GitHub order: failing → in progress → expected → skipped → successful
    pushGroup('failure', 'failure', 'failing check', 'failing checks', buckets.failure);
    pushGroup(
      'in_progress',
      'in_progress',
      'in progress check',
      'in progress checks',
      buckets.in_progress
    );
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
   * @returns {{ total: number, success: number, failure: number, pending: number, inProgress: number, skipped: number, state: string }}
   */
  function summarizeCheckCounts(checks) {
    const n = normalizeChecks(checks);
    let success = 0;
    let failure = 0;
    let pending = 0;
    let inProgress = 0;
    let skipped = 0;
    for (const s of n.statuses || []) {
      const o = classifyCheckOutcome({ kind: 'status', state: s?.state });
      if (o === 'failure') failure += 1;
      else if (o === 'success') success += 1;
      else if (o === 'skipped') skipped += 1;
      else if (o === 'in_progress') inProgress += 1;
      else pending += 1;
    }
    for (const r of n.checkRuns || []) {
      const o = classifyCheckOutcome(r);
      if (o === 'failure') failure += 1;
      else if (o === 'success') success += 1;
      else if (o === 'skipped') skipped += 1;
      else if (o === 'in_progress') inProgress += 1;
      else pending += 1;
    }
    const total = success + failure + pending + inProgress + skipped;
    return {
      total,
      success,
      failure,
      pending,
      inProgress,
      skipped,
      state: n.state || 'unknown',
    };
  }

  /**
   * Human popover / aria copy for check counts.
   * @param {{ total?: number, success?: number, failure?: number, pending?: number, inProgress?: number, skipped?: number, state?: string }|null|undefined} summary
   */
  function formatChecksCountLabel(summary) {
    const s = summary && typeof summary === 'object' ? summary : {};
    const total = Number(s.total) || 0;
    const success = Number(s.success) || 0;
    const failure = Number(s.failure) || 0;
    const pending = Number(s.pending) || 0;
    const inProgress = Number(s.inProgress) || 0;
    const skipped = Number(s.skipped) || 0;
    if (!total) {
      // Empty payload — GitHub may still report combined state "pending"
      return 'No checks';
    }
    const parts = [
      `${total} check${total === 1 ? '' : 's'}`,
      `${success} succeeded`,
      `${failure} failed`,
    ];
    if (inProgress > 0) parts.push(`${inProgress} in progress`);
    if (pending > 0) parts.push(`${pending} expected`);
    if (skipped > 0) parts.push(`${skipped} skipped`);
    return parts.join(' · ');
  }

  /**
   * Names of individual checks bucketed by outcome (for stacked-icon tips).
   * @returns {{ failure: string[], pending: string[], in_progress: string[], success: string[], skipped: string[], state: string }}
   */
  function listCheckNamesByOutcome(checks) {
    const n = normalizeChecks(checks);
    /** @type {{ failure: string[], pending: string[], in_progress: string[], success: string[], skipped: string[] }} */
    const groups = {
      failure: [],
      pending: [],
      in_progress: [],
      success: [],
      skipped: [],
    };
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
      in_progress: groups.in_progress,
      success: groups.success,
      skipped: groups.skipped,
      state: n.state || 'unknown',
    };
  }

  /**
   * Popover text for one outcome group (e.g. failed checks).
   * @param {'failure'|'pending'|'in_progress'|'success'|'skipped'} outcome
   * @param {string[]} names
   */
  /**
   * @param {'failure'|'pending'|'in_progress'|'success'|'skipped'} outcome
   * @param {string[]} names
   * @param {string} [locale] optional app locale for headings
   */
  function formatCheckGroupTip(outcome, names, locale) {
    const list = Array.isArray(names) ? names.filter(Boolean) : [];
    const n = list.length;
    const pure = typeof globalThis !== 'undefined' ? globalThis.PRModalI18n : null;
    const t = (key, subs) => {
      if (pure && typeof pure.formatMessage === 'function' && locale) {
        const m = pure.formatMessage(key, locale, subs);
        if (m && m !== key) return m;
      }
      return '';
    };
    const headings = {
      failure:
        n === 1
          ? t('check_tip_failed_one') || '1 failed'
          : t('check_tip_failed_n', { count: n }) || `${n} failed`,
      in_progress:
        n === 1
          ? t('check_tip_in_progress_one') || '1 in progress'
          : t('check_tip_in_progress_n', { count: n }) || `${n} in progress`,
      pending:
        n === 1
          ? t('check_tip_expected_one') || '1 expected'
          : t('check_tip_expected_n', { count: n }) || `${n} expected`,
      success:
        n === 1
          ? t('check_tip_succeeded_one') || '1 succeeded'
          : t('check_tip_succeeded_n', { count: n }) || `${n} succeeded`,
      skipped:
        n === 1
          ? t('check_tip_skipped_one') || '1 skipped'
          : t('check_tip_skipped_n', { count: n }) || `${n} skipped`,
    };
    const head =
      headings[outcome] ||
      t('check_tip_checks_n', { count: n }) ||
      `${n} checks`;
    if (!n) return head;
    // Cap long lists so tips stay readable
    const max = 12;
    const shown = list.slice(0, max);
    const more = n - shown.length;
    const body = shown.map((name) => `· ${name}`).join('\n');
    const moreLine =
      t('check_tip_more', { count: more }) || `· +${more} more`;
    return more > 0 ? `${head}\n${body}\n${moreLine}` : `${head}\n${body}`;
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
    checksNeedElapsedTick,
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


/* ---- modal/pure/rate-limit.js ---- */

/**
 * AUTO-GENERATED from src/modal/lib/rate-limit.ts
 * SOURCE OF TRUTH: src/modal/lib/rate-limit.ts
 * Do not edit this file — run: npm run build:pure
 */
(function (global) {
  var module = { exports: {} };
  var exports = module.exports;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var stdin_exports = {};
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
});
module.exports = __toCommonJS(stdin_exports);
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
  if (!raw || typeof raw !== "object") return base;
  const src = raw;
  const du = src.disabledUntil && typeof src.disabledUntil === "object" ? src.disabledUntil : {};
  const snaps = src.snapshots && typeof src.snapshots === "object" ? src.snapshots : {};
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
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
}
function toNullableInt(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.floor(n);
}
function normalizeSnapshot(raw, fallbackResource) {
  if (!raw || typeof raw !== "object") return null;
  const s = raw;
  const resource = normalizeResource(s.resource) || fallbackResource;
  return {
    resource,
    limit: toNullableInt(s.limit),
    remaining: toNullableInt(s.remaining),
    used: toNullableInt(s.used),
    reset: toNullableInt(s.reset),
    updatedAt: toNonNegMs(s.updatedAt) || Date.now()
  };
}
function normalizeResource(raw) {
  const v = String(raw || "").trim().toLowerCase();
  if (v === "core" || v === "rest") return "core";
  if (v === "graphql" || v === "graph_ql") return "graphql";
  if (v === "search") return "search";
  return null;
}
function classifyGithubUrl(url) {
  const u = String(url || "");
  try {
    const path = u.includes("://") ? new URL(u).pathname : u.split("?")[0] || "";
    const p = path.toLowerCase();
    if (p.includes("/graphql") || p.endsWith("graphql")) return "graphql";
    if (p.includes("/search/") || p.endsWith("/search") || p.includes("/search?")) {
      return "search";
    }
  } catch {
    if (/graphql/i.test(u)) return "graphql";
    if (/\/search(\/|\?|$)/i.test(u)) return "search";
  }
  return "core";
}
function headersToLowerMap(headers) {
  const out = {};
  if (!headers) return out;
  if (typeof headers.forEach === "function") {
    try {
      headers.forEach((value, key) => {
        if (key != null && value != null && value !== "") {
          out[String(key).toLowerCase()] = String(value);
        }
      });
      return out;
    } catch {
    }
  }
  if (typeof headers.entries === "function") {
    try {
      for (const [key, value] of headers.entries()) {
        if (key != null && value != null && value !== "") {
          out[String(key).toLowerCase()] = String(value);
        }
      }
      return out;
    } catch {
    }
  }
  if (typeof headers.get === "function") {
    for (const name of [
      "x-ratelimit-limit",
      "x-ratelimit-remaining",
      "x-ratelimit-used",
      "x-ratelimit-reset",
      "x-ratelimit-resource",
      "retry-after"
    ]) {
      try {
        const v = headers.get(name) ?? headers.get(name.toUpperCase());
        if (v != null && v !== "") out[name] = String(v);
      } catch {
      }
    }
    return out;
  }
  const o = headers;
  for (const k of Object.keys(o)) {
    const v = o[k];
    if (v != null && v !== "") out[k.toLowerCase()] = String(v);
  }
  return out;
}
function headerGet(headers, name) {
  if (!headers) return null;
  const lower = name.toLowerCase();
  const map = headersToLowerMap(headers);
  if (Object.keys(map).length) {
    const v = map[lower];
    return v != null && v !== "" ? v : null;
  }
  if (typeof headers.get === "function") {
    try {
      const v = headers.get(name) ?? headers.get(lower) ?? headers.get(name.toUpperCase());
      return v != null && v !== "" ? String(v) : null;
    } catch {
      return null;
    }
  }
  return null;
}
function parseRateLimitHeaders(headers, opts = {}) {
  if (!headers) return null;
  const limit = toNullableInt(headerGet(headers, "x-ratelimit-limit"));
  const remaining = toNullableInt(headerGet(headers, "x-ratelimit-remaining"));
  const used = toNullableInt(headerGet(headers, "x-ratelimit-used"));
  const reset = toNullableInt(headerGet(headers, "x-ratelimit-reset"));
  if (limit == null && remaining == null && reset == null && used == null) {
    return null;
  }
  const fromHeader = normalizeResource(
    headerGet(headers, "x-ratelimit-resource")
  );
  const resource = fromHeader || opts.fallbackResource || "core";
  const nowMs = Number.isFinite(opts.nowMs) ? Number(opts.nowMs) : Date.now();
  let usedVal = used;
  if (usedVal == null && limit != null && remaining != null) {
    usedVal = Math.max(0, limit - remaining);
  }
  return {
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
  if (resetSec != null && resetSec > 0) {
    return Math.max(nowMs, resetSec * 1e3);
  }
  const retry = headerGet(headers, "retry-after");
  if (retry) {
    const asNum = Number(retry);
    if (Number.isFinite(asNum) && asNum >= 0) {
      return nowMs + Math.floor(asNum) * 1e3;
    }
    const asDate = Date.parse(retry);
    if (Number.isFinite(asDate)) return Math.max(nowMs, asDate);
  }
  return nowMs + 6e4;
}
function shouldAllowGithubRequest(opts) {
  const now = Number.isFinite(opts.nowMs) ? Number(opts.nowMs) : Date.now();
  if (opts.pluginEnabled === false) {
    return { allow: false, reason: "plugin-disabled", disabledUntilMs: 0 };
  }
  const state = normalizeRateLimitState(opts.state);
  const resource = opts.resource || "core";
  const until = Number(state.disabledUntil[resource]) || 0;
  if (until > now) {
    return {
      allow: false,
      reason: "rate-disabled",
      disabledUntilMs: until
    };
  }
  const snap = state.snapshots[resource];
  if (snap && snap.remaining === 0 && snap.reset != null && snap.reset * 1e3 > now) {
    return {
      allow: false,
      reason: "remaining-zero",
      disabledUntilMs: snap.reset * 1e3
    };
  }
  return { allow: true, reason: "ok", disabledUntilMs: 0 };
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
  if (!block || typeof block !== "object") return null;
  const b = block;
  const limit = toNullableInt(b.limit);
  const remaining = toNullableInt(b.remaining);
  const used = toNullableInt(b.used);
  const reset = toNullableInt(b.reset);
  if (limit == null && remaining == null && reset == null && used == null) {
    return null;
  }
  let usedVal = used;
  if (usedVal == null && limit != null && remaining != null) {
    usedVal = Math.max(0, limit - remaining);
  }
  return {
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
  if (!json || typeof json !== "object") return state;
  const root = json;
  const resources = root.resources && typeof root.resources === "object" ? root.resources : root;
  for (const r of RATE_LIMIT_RESOURCES) {
    const block = resources?.[r] ?? (r === "core" ? root.rate : null);
    const snap = snapshotFromResourceBlock(r, block, nowMs);
    if (snap) state = withRateLimitSnapshot(state, snap);
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
  state = {
    ...state,
    disabledUntil: {
      ...state.disabledUntil,
      [resource]: Math.max(state.disabledUntil[resource] || 0, until)
    }
  };
  return state;
}
function clearExpiredRateDisables(prev, nowMs = Date.now(), opts = {}) {
  const state = normalizeRateLimitState(prev);
  if (opts.clearAll) {
    return {
      ...state,
      disabledUntil: { core: 0, graphql: 0, search: 0 }
    };
  }
  if (opts.forceResource) {
    return {
      ...state,
      disabledUntil: {
        ...state.disabledUntil,
        [opts.forceResource]: 0
      }
    };
  }
  const next = { ...state.disabledUntil };
  for (const r of RATE_LIMIT_RESOURCES) {
    if (next[r] > 0 && next[r] <= nowMs) next[r] = 0;
  }
  return { ...state, disabledUntil: next };
}
function rateLimitBarPercent(snapshot) {
  if (!snapshot) return 0;
  const limit = Number(snapshot.limit);
  if (!Number.isFinite(limit) || limit <= 0) return 0;
  const remaining = Number(snapshot.remaining);
  if (!Number.isFinite(remaining)) {
    const used = Number(snapshot.used);
    if (Number.isFinite(used)) {
      return Math.max(0, Math.min(100, Math.round((limit - used) / limit * 100)));
    }
    return 0;
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
  if (!rateLimit || typeof rateLimit !== "object") return null;
  const r = rateLimit;
  const limit = toNullableInt(r.limit);
  const remaining = toNullableInt(r.remaining);
  const used = toNullableInt(r.used);
  let reset = null;
  if (r.resetAt) {
    const t = Date.parse(String(r.resetAt));
    if (Number.isFinite(t)) reset = Math.floor(t / 1e3);
  } else if (r.reset != null) {
    reset = toNullableInt(r.reset);
  }
  if (limit == null && remaining == null && reset == null) return null;
  let usedVal = used;
  if (usedVal == null && limit != null && remaining != null) {
    usedVal = Math.max(0, limit - remaining);
  }
  return {
    resource: "graphql",
    limit,
    remaining,
    used: usedVal,
    reset,
    updatedAt: nowMs
  };
}


  var api = module.exports && module.exports.__esModule
    ? (module.exports.default && typeof module.exports.default === 'object'
        ? Object.assign({}, module.exports, module.exports.default)
        : module.exports.default || module.exports)
    : module.exports;
  // Prefer named exports map over default-only
  if (api && typeof api === 'object' && api.__esModule) {
    var flat = {};
    for (var k in api) {
      if (k !== 'default' && k !== '__esModule' && Object.prototype.hasOwnProperty.call(api, k)) {
        flat[k] = api[k];
      }
    }
    if (api.default && typeof api.default === 'object') {
      for (var dk in api.default) {
        if (Object.prototype.hasOwnProperty.call(api.default, dk) && flat[dk] === undefined) {
          flat[dk] = api.default[dk];
        }
      }
    }
    if (Object.keys(flat).length) api = flat;
  }
  global.PRModalRateLimit = api;

})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);


/* ---- modal/pure/graphql-cost-log.js ---- */

/**
 * AUTO-GENERATED from src/modal/lib/graphql-cost-log.ts
 * SOURCE OF TRUTH: src/modal/lib/graphql-cost-log.ts
 * Do not edit this file — run: npm run build:pure
 */
(function (global) {
  var module = { exports: {} };
  var exports = module.exports;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var stdin_exports = {};
__export(stdin_exports, {
  injectRateLimitCostField: () => injectRateLimitCostField,
  labelGraphqlOperation: () => labelGraphqlOperation,
  sanitizeGraphqlVariables: () => sanitizeGraphqlVariables,
  summarizeGraphqlCostEntries: () => summarizeGraphqlCostEntries
});
module.exports = __toCommonJS(stdin_exports);
function injectRateLimitCostField(query) {
  const q = String(query || "");
  if (!q.trim()) return q;
  if (/rateLimit\s*\{/.test(q)) return q;
  if (/\bmutation\b/i.test(q)) return q;
  const trimmed = q.replace(/\s+$/, "");
  const lastBrace = trimmed.lastIndexOf("}");
  if (lastBrace < 0) return q;
  return trimmed.slice(0, lastBrace) + "\n  rateLimit { cost remaining used limit resetAt }\n" + trimmed.slice(lastBrace);
}
function labelGraphqlOperation(query, variables = null) {
  const q = String(query || "");
  if (/ReviewThreadsLastShell/.test(q)) return "reviewThreads.last.shell";
  if (/ReviewThreadsFirstShell/.test(q)) return "reviewThreads.first.shell";
  if (/ReviewThreadsByIdsFull/.test(q)) return "reviewThreads.byIds";
  if (/TimelineItemsPage/.test(q) || /timelineItems\s*\(/.test(q)) {
    return "timelineItems.page";
  }
  if (/reviewThreads\s*\(/.test(q) && /last\s*:/.test(q)) {
    if (/comments\s*\(\s*first\s*:\s*100/.test(q)) return "reviewThreads.last";
    return "reviewThreads.last.shell";
  }
  if (/reviewThreads\s*\(/.test(q) && /first\s*:/.test(q)) {
    if (/comments\s*\(\s*first\s*:\s*100/.test(q)) return "reviewThreads.first";
    return "reviewThreads.first.shell";
  }
  if (/PullRequestReviewThread/.test(q) && /nodes\s*\(\s*ids/.test(q)) {
    return "reviewThreads.byIds";
  }
  const named = q.match(/\b(query|mutation)\s+([A-Za-z_][A-Za-z0-9_]*)/);
  if (named?.[2]) return named[2];
  if (/viewerViewedState|ViewerViewedFiles/.test(q)) return "viewerViewedFiles";
  if (/projectItems|closingIssuesReferences|sidebar/i.test(q)) return "sidebarMeta";
  if (/viewerSubscription|mergeStateStatus|updateSubscription/.test(q)) {
    return /updateSubscription/.test(q) ? "subscription.update" : "subscription.read";
  }
  if (/markFileAsViewed/.test(q)) return "markFileAsViewed";
  if (/unmarkFileAsViewed/.test(q)) return "unmarkFileAsViewed";
  if (/addPullRequestReviewThread/.test(q)) return "addReviewThread";
  if (/resolveReviewThread|unresolveReviewThread/.test(q)) return "resolveThread";
  if (/reactionGroups|Reactable/.test(q) && /nodes\s*\(\s*ids/.test(q)) {
    return "reactableReactions";
  }
  if (/addReaction|removeReaction/.test(q)) return "reaction.mutate";
  if (/issueOrPullRequest/.test(q)) return "issueOrPrSummaries";
  const root = q.match(
    /\b(?:query|mutation)\b[^{]*\{\s*([A-Za-z_][A-Za-z0-9_]*)/
  );
  if (root?.[1] && root[1] !== "rateLimit") return root[1];
  const kind = /\bmutation\b/.test(q) ? "mutation" : "query";
  return kind;
}
function sanitizeGraphqlVariables(variables) {
  if (!variables || typeof variables !== "object") return {};
  const out = {};
  for (const k of [
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
    if (variables[k] === void 0) continue;
    if (k === "ids" && Array.isArray(variables[k])) {
      out.idsCount = variables[k].length;
      out.idsSample = variables[k].slice(0, 3).map(String);
      continue;
    }
    const v = variables[k];
    if (v == null || typeof v === "number" || typeof v === "boolean") {
      out[k] = v;
    } else {
      out[k] = String(v).slice(0, 48);
    }
  }
  return out;
}
function summarizeGraphqlCostEntries(entries) {
  const list = Array.isArray(entries) ? entries : [];
  const map = /* @__PURE__ */ new Map();
  let totalCost = 0;
  let unknownCostCalls = 0;
  for (const e of list) {
    const op = String(e?.op || "unknown");
    const cost = e?.cost != null && Number.isFinite(Number(e.cost)) ? Number(e.cost) : null;
    const ms = e?.ms != null && Number.isFinite(Number(e.ms)) ? Number(e.ms) : 0;
    if (!map.has(op)) {
      map.set(op, {
        op,
        calls: 0,
        cost: 0,
        maxCost: 0,
        msSum: 0,
        knownCostCalls: 0
      });
    }
    const row = map.get(op);
    row.calls += 1;
    row.msSum += ms;
    if (cost != null) {
      row.cost += cost;
      row.knownCostCalls += 1;
      row.maxCost = Math.max(row.maxCost, cost);
      totalCost += cost;
    } else {
      unknownCostCalls += 1;
    }
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


  var api = module.exports && module.exports.__esModule
    ? (module.exports.default && typeof module.exports.default === 'object'
        ? Object.assign({}, module.exports, module.exports.default)
        : module.exports.default || module.exports)
    : module.exports;
  // Prefer named exports map over default-only
  if (api && typeof api === 'object' && api.__esModule) {
    var flat = {};
    for (var k in api) {
      if (k !== 'default' && k !== '__esModule' && Object.prototype.hasOwnProperty.call(api, k)) {
        flat[k] = api[k];
      }
    }
    if (api.default && typeof api.default === 'object') {
      for (var dk in api.default) {
        if (Object.prototype.hasOwnProperty.call(api.default, dk) && flat[dk] === undefined) {
          flat[dk] = api.default[dk];
        }
      }
    }
    if (Object.keys(flat).length) api = flat;
  }
  global.PRModalGraphqlCostLog = api;

})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);


/* ---- modal/pure/conversation-timeline.js ---- */

/**
 * AUTO-GENERATED from src/modal/lib/conversation-timeline.ts
 * SOURCE OF TRUTH: src/modal/lib/conversation-timeline.ts
 * Do not edit this file — run: npm run build:pure
 */
(function (global) {
  var module = { exports: {} };
  var exports = module.exports;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/modal/lib/conversation-timeline.ts
var conversation_timeline_exports = {};
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
  mergeCommentMinimizeFields: () => mergeCommentMinimizeFields,
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
});
module.exports = __toCommonJS(conversation_timeline_exports);

// src/modal/lib/conversation-timeline-events.ts
function describeTimelineEvent(ev) {
  if (!ev || typeof ev !== "object") return null;
  const event = String(ev.event || "").trim();
  if (!event) return null;
  const t = (text) => ({ type: "text", text: String(text) });
  const strong = (text) => ({ type: "strong", text: String(text) });
  const title = (text) => ({ type: "title", text: String(text) });
  const status = (text, tone) => ({
    type: "status",
    text: String(text),
    tone: tone ? String(tone) : void 0
  });
  const commit = (text) => ({ type: "commit", text: String(text) });
  const user = (login) => ({ type: "user", login: String(login || "") });
  const label = (name, color) => ({
    type: "label",
    name: String(name || ""),
    color: color ? String(color) : void 0
  });
  const milestone = (titleText) => ({
    type: "milestone",
    title: String(titleText || "")
  });
  const shortSha = (sha) => {
    const s = String(sha || "");
    return s.length > 7 ? s.slice(0, 7) : s;
  };
  switch (event) {
    case "renamed": {
      const from = ev.rename?.from || "";
      const to = ev.rename?.to || "";
      if (!from && !to) return [t("changed the title")];
      return [
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
      if (ev.requestedTeam) {
        return [t("requested a review from team "), strong(ev.requestedTeam)];
      }
      return ev.requestedReviewer ? [t("requested a review from "), user(ev.requestedReviewer)] : [t("requested a review")];
    case "review_request_removed":
      if (ev.requestedTeam) {
        return [
          t("removed "),
          strong(ev.requestedTeam),
          t(" from requested reviewers")
        ];
      }
      return ev.requestedReviewer ? [
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
    canDelete: false
  };
}
function makeLocalTimelineEvent(partial = { event: "" }) {
  const event = String(partial.event || "").trim();
  const stamp = partial.at || (/* @__PURE__ */ new Date()).toISOString();
  const keyPart = partial.label?.name || partial.assignee || partial.requestedReviewer || partial.requestedTeam || partial.milestone?.title || partial.milestone?.number || partial.rename?.to || event;
  const id = `local:${event}:${String(keyPart).toLowerCase()}:${stamp}:${Math.random().toString(36).slice(2, 7)}`;
  const label = partial.label && partial.label.name ? {
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
    _local: true
  };
}
function timelineEventsNarrativelyEqual(a, b) {
  if (!a || !b) return false;
  if (String(a.event || "") !== String(b.event || "")) return false;
  const al = String(a.label?.name || "").toLowerCase();
  const bl = String(b.label?.name || "").toLowerCase();
  if (al || bl) return al === bl && al !== "";
  const aa = String(a.assignee || "").toLowerCase();
  const ba = String(b.assignee || "").toLowerCase();
  if (aa || ba) return aa === ba && aa !== "";
  const ar = String(a.requestedReviewer || "").toLowerCase();
  const br = String(b.requestedReviewer || "").toLowerCase();
  if (ar || br) return ar === br && ar !== "";
  const at = String(a.requestedTeam || "").toLowerCase();
  const bt = String(b.requestedTeam || "").toLowerCase();
  if (at || bt) return at === bt && at !== "";
  const am = String(a.milestone?.title || a.milestone?.number || "").toLowerCase();
  const bm = String(b.milestone?.title || b.milestone?.number || "").toLowerCase();
  if (am || bm) return am === bm && am !== "";
  const af = String(a.rename?.from || "");
  const at2 = String(a.rename?.to || "");
  const bf = String(b.rename?.from || "");
  const bt2 = String(b.rename?.to || "");
  if (af || at2 || bf || bt2) return af === bf && at2 === bt2;
  return true;
}
function serverEventCoversLocal(server, local, skewMs = 5e3, maxFutureMs = 18e4) {
  if (!timelineEventsNarrativelyEqual(server, local)) return false;
  const ts = Date.parse(String(server?.at || server?.createdAt || ""));
  const tl = Date.parse(String(local?.at || local?.createdAt || ""));
  if (!Number.isFinite(ts) || !Number.isFinite(tl)) return false;
  return ts >= tl - skewMs && ts <= tl + maxFutureMs;
}
function timelineEventsCloseInTime(a, b, windowMs = 12e4) {
  const ta = Date.parse(String(a?.at || a?.createdAt || ""));
  const tb = Date.parse(String(b?.at || b?.createdAt || ""));
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return false;
  return Math.abs(ta - tb) <= windowMs;
}
function mergeTimelineEventsById(prev, next) {
  const byId = /* @__PURE__ */ new Map();
  for (const e of Array.isArray(prev) ? prev : []) {
    if (e && e.id != null) byId.set(String(e.id), e);
  }
  for (const e of Array.isArray(next) ? next : []) {
    if (e && e.id != null) byId.set(String(e.id), e);
  }
  const all = [...byId.values()];
  const server = all.filter((e) => !String(e?.id ?? "").startsWith("local:"));
  const locals = all.filter((e) => String(e?.id ?? "").startsWith("local:"));
  const keptLocals = locals.filter(
    (local) => !server.some((s) => serverEventCoversLocal(s, local))
  );
  return [...server, ...keptLocals];
}
function labelNameKey(l) {
  const name = typeof l === "string" ? l : l?.name;
  return String(name || "").trim().toLowerCase();
}
function labelObj(l) {
  if (typeof l === "string" && l.trim()) {
    return { name: l.trim(), color: "" };
  }
  if (l && typeof l === "object" && l.name) {
    return {
      name: String(l.name),
      color: String(l.color || ""),
      description: String(l.description || "")
    };
  }
  return null;
}
function labelChangeTimelineEvents(prevLabels, nextLabels, actor = {}) {
  const prevMap = /* @__PURE__ */ new Map();
  for (const l of Array.isArray(prevLabels) ? prevLabels : []) {
    const k = labelNameKey(l);
    const obj = labelObj(l);
    if (k && obj) prevMap.set(k, obj);
  }
  const nextMap = /* @__PURE__ */ new Map();
  for (const l of Array.isArray(nextLabels) ? nextLabels : []) {
    const k = labelNameKey(l);
    const obj = labelObj(l);
    if (k && obj) nextMap.set(k, obj);
  }
  const out = [];
  const actorLogin = actor.login || "";
  const avatarUrl = actor.avatarUrl || "";
  for (const [k, lab] of nextMap) {
    if (!prevMap.has(k)) {
      out.push(
        makeLocalTimelineEvent({
          event: "labeled",
          actor: actorLogin,
          avatarUrl,
          label: lab
        })
      );
    }
  }
  for (const [k, lab] of prevMap) {
    if (!nextMap.has(k)) {
      out.push(
        makeLocalTimelineEvent({
          event: "unlabeled",
          actor: actorLogin,
          avatarUrl,
          label: lab
        })
      );
    }
  }
  return out;
}
function loginKey(x) {
  return String(typeof x === "string" ? x : x?.login || "").trim().toLowerCase();
}
function assigneeChangeTimelineEvents(prevAssignees, nextAssignees, actor = {}) {
  const prev = new Set(
    (Array.isArray(prevAssignees) ? prevAssignees : []).map(loginKey).filter(Boolean)
  );
  const nextList = Array.isArray(nextAssignees) ? nextAssignees : [];
  const next = new Set(nextList.map(loginKey).filter(Boolean));
  const out = [];
  const actorLogin = actor.login || "";
  const avatarUrl = actor.avatarUrl || "";
  for (const a of nextList) {
    const k = loginKey(a);
    if (!k || prev.has(k)) continue;
    out.push(
      makeLocalTimelineEvent({
        event: "assigned",
        actor: actorLogin,
        avatarUrl,
        assignee: typeof a === "string" ? a : a?.login || k
      })
    );
  }
  for (const a of Array.isArray(prevAssignees) ? prevAssignees : []) {
    const k = loginKey(a);
    if (!k || next.has(k)) continue;
    out.push(
      makeLocalTimelineEvent({
        event: "unassigned",
        actor: actorLogin,
        avatarUrl,
        assignee: typeof a === "string" ? a : a?.login || k
      })
    );
  }
  return out;
}
function reviewerChangeTimelineEvents(prevReviewers, nextReviewers, actor = {}) {
  const prev = new Set(
    (Array.isArray(prevReviewers) ? prevReviewers : []).map(loginKey).filter(Boolean)
  );
  const nextList = Array.isArray(nextReviewers) ? nextReviewers : [];
  const next = new Set(nextList.map(loginKey).filter(Boolean));
  const out = [];
  const actorLogin = actor.login || "";
  const avatarUrl = actor.avatarUrl || "";
  for (const r of nextList) {
    const k = loginKey(r);
    if (!k || prev.has(k)) continue;
    out.push(
      makeLocalTimelineEvent({
        event: "review_requested",
        actor: actorLogin,
        avatarUrl,
        requestedReviewer: typeof r === "string" ? r : r?.login || k
      })
    );
  }
  for (const r of Array.isArray(prevReviewers) ? prevReviewers : []) {
    const k = loginKey(r);
    if (!k || next.has(k)) continue;
    out.push(
      makeLocalTimelineEvent({
        event: "review_request_removed",
        actor: actorLogin,
        avatarUrl,
        requestedReviewer: typeof r === "string" ? r : r?.login || k
      })
    );
  }
  return out;
}
function milestoneChangeTimelineEvents(prevMilestone, nextMilestone, actor = {}) {
  const prevTitle = prevMilestone?.title ? String(prevMilestone.title) : prevMilestone?.number != null ? String(prevMilestone.number) : "";
  const nextTitle = nextMilestone?.title ? String(nextMilestone.title) : nextMilestone?.number != null ? String(nextMilestone.number) : "";
  const prevKey = prevMilestone ? `${prevMilestone.number ?? ""}:${prevTitle}`.toLowerCase() : "";
  const nextKey = nextMilestone ? `${nextMilestone.number ?? ""}:${nextTitle}`.toLowerCase() : "";
  if (prevKey === nextKey) return [];
  const out = [];
  const actorLogin = actor.login || "";
  const avatarUrl = actor.avatarUrl || "";
  if (prevMilestone && prevKey) {
    out.push(
      makeLocalTimelineEvent({
        event: "demilestoned",
        actor: actorLogin,
        avatarUrl,
        milestone: {
          number: prevMilestone.number != null ? Number(prevMilestone.number) : null,
          title: prevTitle
        }
      })
    );
  }
  if (nextMilestone && nextKey) {
    out.push(
      makeLocalTimelineEvent({
        event: "milestoned",
        actor: actorLogin,
        avatarUrl,
        milestone: {
          number: nextMilestone.number != null ? Number(nextMilestone.number) : null,
          title: nextTitle
        }
      })
    );
  }
  return out;
}

// src/modal/lib/timeline-pagination.ts
var TIMELINE_PAGE_SIZE = 100;
function emptyTimelinePageMeta(overrides = {}) {
  return {
    pageSize: TIMELINE_PAGE_SIZE,
    direction: "newest",
    // 'newest' | 'oldest'
    hasMore: false,
    hasPreviousPage: false,
    hasNextPage: false,
    startCursor: null,
    endCursor: null,
    /** ISO watermark for newest-only since incremental */
    watermark: null,
    loadedCount: 0,
    totalCount: null,
    complete: true,
    source: "graphql",
    ...overrides
  };
}
function timelineMetaFromPageInfo(pageInfo, opts = {}) {
  const dir = String(opts.direction || opts.prev?.direction || "newest").toLowerCase() === "oldest" ? "oldest" : "newest";
  const hasPreviousPage = Boolean(pageInfo?.hasPreviousPage);
  const hasNextPage = Boolean(pageInfo?.hasNextPage);
  const hasMore = dir === "newest" ? hasPreviousPage : hasNextPage;
  const loadedCount = Number(opts.loadedCount) || 0;
  const totalCount = opts.totalCount != null ? Number(opts.totalCount) : opts.prev?.totalCount != null ? Number(opts.prev.totalCount) : null;
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
  let best = null;
  let bestMs = 0;
  for (const it of Array.isArray(items) ? items : []) {
    const raw = it?.at || it?.createdAt || it?.submittedAt || it?.created_at || "";
    const s = String(raw || "").trim();
    if (!s) continue;
    const ms = Date.parse(s);
    if (!Number.isFinite(ms)) continue;
    if (ms >= bestMs) {
      bestMs = ms;
      best = s;
    }
  }
  return best;
}
function mergeCommentMinimizeFields(prev, next) {
  if (!prev) return next;
  if (!next) return prev;
  const pickMin = (a, b) => {
    if (a?.isMinimized != null) return Boolean(a.isMinimized);
    if (b?.isMinimized != null) return Boolean(b.isMinimized);
    return false;
  };
  const nextKnowsMin = next.isMinimized != null;
  const isMinimized = nextKnowsMin ? Boolean(next.isMinimized) : pickMin(prev, next);
  const minimizedReason = isMinimized ? nextKnowsMin ? next.minimizedReason ?? prev.minimizedReason ?? null : prev.minimizedReason ?? next.minimizedReason ?? null : null;
  const viewerCanMinimize = next.viewerCanMinimize != null ? Boolean(next.viewerCanMinimize) : prev.viewerCanMinimize != null ? Boolean(prev.viewerCanMinimize) : null;
  return {
    ...prev,
    ...next,
    isMinimized,
    minimizedReason,
    viewerCanMinimize,
    nodeId: next.nodeId || prev.nodeId || next.node_id || prev.node_id || null
  };
}
function mergeTimelineItemsById(prevItems, nextItems, opts = {}) {
  const map = /* @__PURE__ */ new Map();
  const keyOf = (it, i2) => {
    if (it?.key != null) return String(it.key);
    if (it?.id != null) return `${it.kind || "item"}-${it.id}`;
    if (it?.nodeId != null) return String(it.nodeId);
    return `idx-${i2}-${it?.at || ""}`;
  };
  let i = 0;
  for (const it of Array.isArray(prevItems) ? prevItems : []) {
    if (!it) continue;
    map.set(keyOf(it, i++), it);
  }
  for (const it of Array.isArray(nextItems) ? nextItems : []) {
    if (!it) continue;
    const k = keyOf(it, i++);
    const prev = map.get(k);
    map.set(k, prev ? mergeCommentMinimizeFields(prev, it) : it);
  }
  const out = [...map.values()];
  if (opts.sortNewest !== false) {
    out.sort((a, b) => {
      const ta = Date.parse(String(a?.at || a?.createdAt || "")) || 0;
      const tb = Date.parse(String(b?.at || b?.createdAt || "")) || 0;
      if (tb !== ta) return tb - ta;
      return String(b?.key || b?.id || "").localeCompare(
        String(a?.key || a?.id || "")
      );
    });
  }
  return out;
}
function selectDirtyThreadIdsByCommentCount(prevThreads, nextThreads) {
  const prevById = /* @__PURE__ */ new Map();
  for (const t of Array.isArray(prevThreads) ? prevThreads : []) {
    const id = t?.threadNodeId ? String(t.threadNodeId) : "";
    if (id) prevById.set(id, t);
  }
  const dirty = [];
  for (const t of Array.isArray(nextThreads) ? nextThreads : []) {
    const id = t?.threadNodeId ? String(t.threadNodeId) : "";
    if (!id || !/^PRRT_/i.test(id)) continue;
    const prev = prevById.get(id);
    if (!prev) {
      if (t.commentsLoaded !== true) dirty.push(id);
      continue;
    }
    const prevCount = typeof prev.commentCount === "number" ? prev.commentCount : Array.isArray(prev.commentIds) ? prev.commentIds.length : null;
    const nextCount = typeof t.commentCount === "number" ? t.commentCount : Array.isArray(t.commentIds) ? t.commentIds.length : null;
    if (prevCount != null && nextCount != null && Number(prevCount) !== Number(nextCount)) {
      dirty.push(id);
      continue;
    }
    if (Boolean(prev.resolved) !== Boolean(t.resolved)) {
      dirty.push(id);
      continue;
    }
    if (t.commentsLoaded !== true && prev.commentsLoaded === true) {
      dirty.push(id);
    }
  }
  return dirty;
}
function isReviewThreadsLoadIncomplete(meta) {
  if (!meta || typeof meta !== "object") return false;
  if (meta.hasMore) return true;
  if (meta.hasOlder) return true;
  if (meta.hasNewerFromOldest) return true;
  const hidden = Number(meta.hiddenCount) || 0;
  if (hidden > 0) return true;
  const total = Number(meta.totalCount);
  const loaded = Number(meta.loadedThreadCount);
  if (Number.isFinite(total) && Number.isFinite(loaded) && total > loaded) {
    return true;
  }
  return false;
}
function isTimelineLoadIncomplete(meta) {
  if (!meta || typeof meta !== "object") return false;
  if (meta.hasMore) return true;
  if (meta.complete === false) return true;
  return false;
}
function conversationLoadMoreState(threadsMeta = null, timelineMeta = null) {
  const threadsIncomplete = isReviewThreadsLoadIncomplete(threadsMeta);
  const timelineIncomplete = isTimelineLoadIncomplete(timelineMeta);
  const threadsHidden = Math.max(0, Number(threadsMeta?.hiddenCount) || 0);
  const timelineLoaded = Number(timelineMeta?.loadedCount) || 0;
  const timelineTotal = timelineMeta?.totalCount != null ? Number(timelineMeta.totalCount) : null;
  const timelineHidden = timelineTotal != null && Number.isFinite(timelineTotal) ? Math.max(0, timelineTotal - timelineLoaded) : timelineIncomplete ? 1 : 0;
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
  const raw = it?.at || it?.createdAt || it?.submittedAt || it?.created_at || "";
  const s = String(raw || "").trim();
  if (!s) return null;
  const ms = Date.parse(s);
  return Number.isFinite(ms) ? ms : null;
}
function timelineCoverageEndAtFromItems(items) {
  let best = null;
  let bestMs = Infinity;
  for (const it of Array.isArray(items) ? items : []) {
    if (!it) continue;
    const kind = String(it.kind || it.type || "").toLowerCase();
    if (kind === "review-thread" || kind === "review-group" || kind === "review" || kind === "pending-review") {
      continue;
    }
    const ms = itemTimestampMs(it);
    if (ms == null) continue;
    if (ms < bestMs) {
      bestMs = ms;
      best = String(it.at || it.createdAt || it.submittedAt || "").trim() || null;
    }
  }
  return best;
}
function minTimelineCoverageEndAt(comments, events) {
  let best = null;
  let bestMs = Infinity;
  for (const it of [
    ...Array.isArray(comments) ? comments : [],
    ...Array.isArray(events) ? events : []
  ]) {
    const raw = it?.createdAt || it?.at || it?.created_at || "";
    const s = String(raw || "").trim();
    if (!s) continue;
    const ms = Date.parse(s);
    if (!Number.isFinite(ms) || ms >= bestMs) continue;
    bestMs = ms;
    best = s;
  }
  return best;
}
function partitionConversationLoadMore(items, threadsMeta = null, timelineMeta = null) {
  const list = Array.isArray(items) ? items : [];
  const st = conversationLoadMoreState(threadsMeta, timelineMeta);
  if (!st.anyIncomplete) {
    return {
      top: list,
      bottom: [],
      hiddenCount: 0,
      showGap: false,
      gapPlacement: "none",
      loadState: st
    };
  }
  if (st.preferMiddleGap) {
    const floorRaw = st.coverageEndAt;
    const floorMs = floorRaw ? Date.parse(String(floorRaw)) : NaN;
    if (Number.isFinite(floorMs)) {
      const top = [];
      const bottom = [];
      for (const it of list) {
        const ms = itemTimestampMs(it);
        if (ms == null || ms >= floorMs) top.push(it);
        else bottom.push(it);
      }
      if (bottom.length > 0 && top.length > 0) {
        return {
          top,
          bottom,
          hiddenCount: st.hiddenCount,
          showGap: true,
          gapPlacement: "middle",
          loadState: st
        };
      }
    }
  }
  return {
    top: list,
    bottom: [],
    hiddenCount: st.hiddenCount,
    showGap: true,
    gapPlacement: "end",
    loadState: st
  };
}
function singleCursorReviewThreadsMeta(page, prev = null) {
  const threads = Array.isArray(page?.threads) ? page.threads : [];
  const totalCount = typeof page?.totalCount === "number" ? page.totalCount : Number(prev?.totalCount) || threads.length;
  const loadedThreadCount = threads.length;
  const hiddenCount = Math.max(0, totalCount - loadedThreadCount);
  const dir = String(page?.direction || page?.window || "newest").toLowerCase() === "oldest" ? "oldest" : "newest";
  const hasOlder = dir === "newest" ? Boolean(page?.hasPreviousPage) && hiddenCount > 0 : false;
  const hasNewer = dir === "oldest" ? Boolean(page?.hasNextPage) && hiddenCount > 0 : false;
  return {
    totalCount,
    hiddenCount,
    loadedThreadCount,
    loadedCommentCount: Array.isArray(page?.comments) ? page.comments.length : 0,
    pagesLoaded: 1,
    newestStartCursor: page?.startCursor || null,
    newestEndCursor: page?.endCursor || null,
    hasOlder: hasOlder || dir === "newest" && Boolean(page?.hasPreviousPage),
    oldestStartCursor: null,
    oldestEndCursor: null,
    /** Dual-window retired — always false in product path */
    hasNewerFromOldest: false,
    newestThreadIds: threads.map((t) => t.threadNodeId).filter(Boolean),
    oldestThreadIds: [],
    hasMore: hiddenCount > 0 || hasOlder || hasNewer,
    endCursor: page?.startCursor || null,
    direction: dir,
    source: page?.source || "graphql"
  };
}

// src/modal/lib/conversation-timeline-build.ts
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
    pending: Boolean(r.pending),
    nodeId: r.nodeId || r.node_id || null,
    reactions: Array.isArray(r.reactions) ? r.reactions : [],
    isMinimized: Boolean(r.isMinimized ?? r.is_minimized ?? false),
    minimizedReason: r.minimizedReason ?? r.minimized_reason ?? null,
    viewerCanMinimize: r.viewerCanMinimize != null ? Boolean(r.viewerCanMinimize) : r.viewer_can_minimize != null ? Boolean(r.viewer_can_minimize) : null,
    canDelete: Boolean(
      viewerLogin && r.author && r.author === viewerLogin && !r.pending
    )
  }));
  const snippet = snippetFn ? snippetFn(
    {
      path: c.path,
      line: c.line,
      originalLine: c.originalLine ?? c.original_line,
      startLine: c.startLine ?? c.start_line,
      side: c.side,
      diffHunk: c.diffHunk || c.diff_hunk || ""
    },
    files
  ) : null;
  const displayLine = c.line != null ? Number(c.line) : c.originalLine != null ? Number(c.originalLine) : c.original_line != null ? Number(c.original_line) : null;
  const reviewId = c.reviewId != null ? Number(c.reviewId) : c.pendingReviewId != null ? Number(c.pendingReviewId) : c.pull_request_review_id != null ? Number(c.pull_request_review_id) : null;
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
    resolved: Boolean(c.resolved),
    outdated: Boolean(c.outdated),
    threadNodeId: c.threadNodeId || null,
    nodeId: c.nodeId || c.node_id || null,
    reactions: Array.isArray(c.reactions) ? c.reactions : [],
    isMinimized: Boolean(c.isMinimized ?? c.is_minimized ?? false),
    minimizedReason: c.minimizedReason ?? c.minimized_reason ?? null,
    viewerCanMinimize: c.viewerCanMinimize != null ? Boolean(c.viewerCanMinimize) : c.viewer_can_minimize != null ? Boolean(c.viewer_can_minimize) : null,
    reviewId: Number.isFinite(reviewId) ? reviewId : null,
    pending: Boolean(c.pending),
    replies,
    snippet,
    canDelete: Boolean(
      viewerLogin && c.author && c.author === viewerLogin && !c.pending
    )
  };
}
function timelineItemTimeMs(item) {
  if (!item || typeof item !== "object") return 0;
  const raw = item.at || item.createdAt || item.submittedAt || item.created_at || "";
  const t = Date.parse(String(raw));
  return Number.isFinite(t) ? t : 0;
}
function compareTimelineItemsNewestFirst(a, b) {
  const d = timelineItemTimeMs(b) - timelineItemTimeMs(a);
  if (d !== 0) return d;
  return String(b?.key || b?.id || "").localeCompare(
    String(a?.key || a?.id || "")
  );
}
function buildConversationTimeline(detail, opts = {}) {
  if (!detail) return [];
  const items = [];
  const snippetFn = typeof opts.snippetForComment === "function" ? opts.snippetForComment : typeof globalThis !== "undefined" && globalThis.PRModalDiffSnippet?.snippetForComment ? globalThis.PRModalDiffSnippet.snippetForComment : null;
  const files = detail.files || [];
  const viewerLogin = detail.viewerLogin;
  const reviewById = /* @__PURE__ */ new Map();
  for (const r of detail.reviews || []) {
    if (r && r.id != null) reviewById.set(String(r.id), r);
  }
  const vpr = detail.viewerPendingReview;
  if (vpr?.id != null && !reviewById.has(String(vpr.id))) {
    reviewById.set(String(vpr.id), {
      id: vpr.id,
      author: vpr.author || detail.viewerLogin || "",
      avatarUrl: vpr.avatarUrl || vpr.avatar_url || null,
      state: "PENDING",
      body: vpr.body || "",
      submittedAt: vpr.submittedAt || vpr.createdAt || null,
      isBot: false
    });
  }
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
      isMinimized: Boolean(c.isMinimized ?? c.is_minimized ?? false),
      minimizedReason: c.minimizedReason ?? c.minimized_reason ?? null,
      viewerCanMinimize: c.viewerCanMinimize != null ? Boolean(c.viewerCanMinimize) : c.viewer_can_minimize != null ? Boolean(c.viewer_can_minimize) : null,
      canDelete: Boolean(
        viewerLogin && c.author && c.author === viewerLogin
      )
    });
  });
  const allRc = Array.isArray(detail.reviewComments) ? detail.reviewComments : [];
  const byId = /* @__PURE__ */ new Map();
  for (const c of allRc) {
    if (c && c.id != null) byId.set(String(c.id), c);
  }
  const children = /* @__PURE__ */ new Map();
  const roots = [];
  for (const c of allRc) {
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
  const threadsByReviewId = /* @__PURE__ */ new Map();
  const orphanThreads = [];
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
    if (groupKey != null) {
      if (!threadsByReviewId.has(groupKey)) threadsByReviewId.set(groupKey, []);
      threadsByReviewId.get(groupKey).push(thread);
    } else {
      orphanThreads.push(thread);
    }
  });
  const usedReviewIds = /* @__PURE__ */ new Set();
  for (const [rid, threads] of threadsByReviewId) {
    const review = reviewById.get(rid);
    const reviewBody = String(review?.body || "").trim();
    const anyPending = threads.some((t) => t.pending) || String(review?.state || "").toUpperCase() === "PENDING" || rid === "viewer-pending" || viewerPendingId != null && rid === viewerPendingId;
    const state = anyPending ? "PENDING" : String(review?.state || "COMMENTED").toUpperCase();
    const shouldGroup = threads.length >= 1;
    threads.sort((a, b) => {
      const pa = a.path || "";
      const pb = b.path || "";
      if (pa !== pb) return pa.localeCompare(pb);
      return (Number(a.line) || 0) - (Number(b.line) || 0);
    });
    if (shouldGroup) {
      usedReviewIds.add(rid);
      const latestThreadAt = threads.reduce(
        (max, t) => String(t.at || "") > max ? String(t.at || "") : max,
        ""
      );
      const at = review?.submittedAt || latestThreadAt || threads[0]?.at || null;
      const author = review?.author || threads[0]?.author || (anyPending ? viewerLogin : "") || "";
      items.push({
        key: `rev-group-${rid}`,
        kind: "review-group",
        id: Number(rid) || rid,
        author,
        avatarUrl: review?.avatarUrl || review?.avatar_url || threads[0]?.avatarUrl || null,
        state,
        body: reviewBody,
        at,
        isBot: Boolean(review?.isBot) || /\[bot\]$/i.test(author) || String(review?.type || "").toLowerCase() === "bot",
        pending: anyPending,
        threads,
        threadCount: threads.length,
        resolvedCount: threads.filter((t) => t.resolved).length,
        canDelete: false
      });
    } else {
      for (const t of threads) orphanThreads.push(t);
    }
  }
  (detail.reviews || []).forEach((r, i) => {
    if (r?.id != null && usedReviewIds.has(String(r.id))) return;
    if (!r.body && (!r.state || r.state === "COMMENTED" || r.state === "PENDING")) {
      return;
    }
    items.push({
      key: `rev-${r.id || i}`,
      kind: "review",
      id: r.id,
      author: r.author,
      avatarUrl: r.avatarUrl || r.avatar_url || null,
      state: r.state,
      body: r.body || "",
      at: r.submittedAt,
      isBot: Boolean(r.isBot) || /\[bot\]$/i.test(String(r.author || "")) || String(r.type || "").toLowerCase() === "bot",
      canDelete: false
    });
  });
  for (const t of orphanThreads) {
    items.push(t);
  }
  const events = Array.isArray(detail.timelineEvents) ? detail.timelineEvents : [];
  events.forEach((ev, i) => {
    const item = timelineEventToItem(ev, i);
    if (item) items.push(item);
  });
  items.sort(compareTimelineItemsNewestFirst);
  return items;
}
function pageTimelineItems(items, opts = {}) {
  const list = Array.isArray(items) ? items : [];
  const pageSize = Number.isFinite(opts.pageSize) && opts.pageSize > 0 ? Math.floor(opts.pageSize) : 20;
  const page = Number.isFinite(opts.page) && opts.page > 0 ? Math.floor(opts.page) : 1;
  const total = list.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const slice = list.slice(start, start + pageSize);
  const hasNewer = safePage > 1;
  const hasOlder = safePage < totalPages;
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

// src/modal/lib/conversation-timeline-filter.ts
var TIMELINE_CATEGORY_IDS = [
  "events",
  "participants",
  "comments",
  "review-threads"
];
var TIMELINE_TIP_IDS = ["all", ...TIMELINE_CATEGORY_IDS];
var TIMELINE_TIP_LABELS = {
  all: "All",
  events: "events",
  participants: "participants",
  comments: "comments",
  "review-threads": "threads"
};
var DEFAULT_TIMELINE_VISIBILITY = {
  events: true,
  participants: true,
  comments: true,
  "review-threads": true
};
var LEGACY_EVENT_KEYS = [
  "labels",
  "title",
  "milestone",
  "referenced"
];
var LEGACY_PARTICIPANT_KEYS = ["assignees", "reviewers"];
function normalizeTimelineVisibility(raw) {
  const src = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const out = { ...DEFAULT_TIMELINE_VISIBILITY };
  for (const id of TIMELINE_CATEGORY_IDS) {
    if (typeof src[id] === "boolean") out[id] = src[id];
  }
  const hasNewKey = TIMELINE_CATEGORY_IDS.some((id) => typeof src[id] === "boolean");
  if (!hasNewKey) {
    const anyLegacy = [...LEGACY_EVENT_KEYS, ...LEGACY_PARTICIPANT_KEYS, "comments"].some(
      (k) => typeof src[k] === "boolean"
    );
    if (anyLegacy) {
      out.events = LEGACY_EVENT_KEYS.some((k) => src[k] !== false);
      out.participants = LEGACY_PARTICIPANT_KEYS.some((k) => src[k] !== false);
      if (typeof src.comments === "boolean") out.comments = src.comments;
      out["review-threads"] = true;
    }
  }
  if (src.all === true) {
    for (const id of TIMELINE_CATEGORY_IDS) out[id] = true;
  }
  return out;
}
function isTimelineVisibilityAllOn(vis) {
  const v = normalizeTimelineVisibility(vis);
  return TIMELINE_CATEGORY_IDS.every((id) => v[id] !== false);
}
function toggleTimelineTip(vis, tipId) {
  const cur = normalizeTimelineVisibility(vis);
  const id = String(tipId || "").trim().toLowerCase();
  if (id === "all") {
    if (isTimelineVisibilityAllOn(cur)) {
      const off = { ...cur };
      for (const key of TIMELINE_CATEGORY_IDS) off[key] = false;
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
  if (!item || typeof item !== "object") return null;
  const kind = String(item.kind || "");
  if (kind === "issue-comment") return "comments";
  if (kind === "review-thread" || kind === "review-comment") {
    return "review-threads";
  }
  if (kind === "review-group" || kind === "review") return "comments";
  const cat = String(item.category || "").trim().toLowerCase();
  if (TIMELINE_CATEGORY_IDS.includes(cat)) {
    return cat;
  }
  const event = String(item.event || "").trim().toLowerCase();
  if (event === "assigned" || event === "unassigned" || event === "review_requested" || event === "review_request_removed") {
    return "participants";
  }
  if (event === "labeled" || event === "unlabeled" || event === "renamed" || event === "milestoned" || event === "demilestoned" || event === "referenced" || event === "cross-referenced" || event === "connected" || event === "disconnected" || event === "closed" || event === "reopened" || event === "merged" || event === "convert_to_draft" || event === "ready_for_review" || event === "head_ref_force_pushed" || event === "base_ref_changed" || event === "locked" || event === "unlocked" || event === "added_to_project" || event === "removed_from_project" || event === "moved_columns_in_project" || event === "project_v2_item_status_changed") {
    return "events";
  }
  if (kind === "timeline-event" || kind === "system-event") return "events";
  return null;
}
function filterTimelineItemsByVisibility(items, visibility) {
  const list = Array.isArray(items) ? items : [];
  const vis = normalizeTimelineVisibility(visibility);
  return list.filter((item) => {
    const cat = timelineItemCategory(item);
    if (!cat) return true;
    return vis[cat] !== false;
  });
}
function shouldFetchSystemTimelineEvents(visibility) {
  const vis = normalizeTimelineVisibility(visibility);
  return vis.events !== false || vis.participants !== false;
}
function needsLazyTimelineEventsFetch(prevVisibility, nextVisibility, timelineEvents) {
  if (!shouldFetchSystemTimelineEvents(nextVisibility)) return false;
  if (shouldFetchSystemTimelineEvents(prevVisibility)) {
    const prev = normalizeTimelineVisibility(prevVisibility);
    const next = normalizeTimelineVisibility(nextVisibility);
    const newlyOn = prev.events === false && next.events !== false || prev.participants === false && next.participants !== false;
    if (!newlyOn) return false;
  }
  const te = Array.isArray(timelineEvents) ? timelineEvents : [];
  return te.length === 0;
}
function planTimelineVisibilityChange(prevVisibility, nextVisibility, timelineEvents = null) {
  const prev = normalizeTimelineVisibility(prevVisibility);
  const next = normalizeTimelineVisibility(nextVisibility);
  return {
    prevVisibility: prev,
    nextVisibility: next,
    shouldLazyFetch: needsLazyTimelineEventsFetch(prev, next, timelineEvents)
  };
}
function shouldAcceptTimelineVisibilityFromHost(opts) {
  const incoming = normalizeTimelineVisibility(opts.incoming);
  const lastEmitted = normalizeTimelineVisibility(opts.lastEmitted);
  const incomingJson = JSON.stringify(incoming);
  const emittedJson = JSON.stringify(lastEmitted);
  if (incomingJson === emittedJson) {
    return { accept: true, clearPending: true };
  }
  const now = Number(opts.nowMs ?? Date.now());
  const until = Number(opts.ignoreHostUntilMs || 0);
  if (until > 0 && now < until) {
    return { accept: false, clearPending: false };
  }
  return { accept: true, clearPending: true };
}


  var api = module.exports && module.exports.__esModule
    ? (module.exports.default && typeof module.exports.default === 'object'
        ? Object.assign({}, module.exports, module.exports.default)
        : module.exports.default || module.exports)
    : module.exports;
  // Prefer named exports map over default-only
  if (api && typeof api === 'object' && api.__esModule) {
    var flat = {};
    for (var k in api) {
      if (k !== 'default' && k !== '__esModule' && Object.prototype.hasOwnProperty.call(api, k)) {
        flat[k] = api[k];
      }
    }
    if (api.default && typeof api.default === 'object') {
      for (var dk in api.default) {
        if (Object.prototype.hasOwnProperty.call(api.default, dk) && flat[dk] === undefined) {
          flat[dk] = api.default[dk];
        }
      }
    }
    if (Object.keys(flat).length) api = flat;
  }
  global.PRModalConversationTimeline = api;

})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);


/* ---- storage.ts ---- */

;(function(){
const TOKEN_KEY = "githubToken";
const HOST_ACCOUNTS_KEY = "hostAccounts";
const PREFS_KEY = "extensionPrefs";
const ONBOARDING_KEY = "onboardingCompleted";
const DEFAULT_PREFS = {
  reverseComments: true,
  autoOpenEmbed: true,
  singleFileMode: false,
  treeView: true,
  /**
   * Master switch: when false, pr+ host/network features stay off.
   * Rate-limit auto-disable also flips this off until reset (user may re-enable).
   */
  pluginEnabled: true,
  /**
   * Bottom-center shortcut / action monitor size:
   * none | small (1× default) | medium (2×) | large (3×)
   */
  shortcutMonitorSize: "small",
  /**
   * Diff file nav (tree click / ⌥⇧[ ]): auto-expand the target file.
   * Off by default — collapsed files stay collapsed until the user expands.
   */
  autoExpandOnFileNav: false,
  onboardingCompleted: false,
  /**
   * UI language for pr+ chrome strings.
   * - `auto` (default): follow GitHub page `html[lang]` / locale signals
   * - `en` | `ko` | `ja` | `zh_CN`: force catalog (overrides page detect)
   */
  uiLanguage: "auto",
  /**
   * Conversation timeline category visibility (plugin-global).
   * events | participants | comments | review-threads
   * — each true = tip on / rows shown. Synced with conversation tip row + popup.
   * Legacy 7-key maps are migrated in normalizeTimelineVisibility.
   */
  timelineVisibility: {
    events: true,
    participants: true,
    comments: true,
    "review-threads": true
  }
};
const RATE_LIMIT_KEY = "rateLimitState";
function normalizeShortcutMonitorSizePref(raw) {
  const v = String(raw ?? "").trim().toLowerCase();
  if (v === "none" || v === "off" || v === "hidden" || v === "0") return "none";
  if (v === "medium" || v === "md" || v === "2" || v === "2x") return "medium";
  if (v === "large" || v === "lg" || v === "3" || v === "3x") return "large";
  if (v === "small" || v === "sm" || v === "1" || v === "1x") return "small";
  if (raw === false) return "none";
  return DEFAULT_PREFS.shortcutMonitorSize;
}
function normalizeUiLanguagePref(raw) {
  if (raw == null) return DEFAULT_PREFS.uiLanguage;
  const v = String(raw).trim();
  if (!v) return DEFAULT_PREFS.uiLanguage;
  const lower = v.toLowerCase().replace(/_/g, "-");
  if (lower === "auto" || lower === "detect" || lower === "default" || lower === "system" || lower === "github") {
    return "auto";
  }
  if (v === "zh_CN" || lower === "zh-cn" || lower === "zh_cn" || lower === "zh") {
    return "zh_CN";
  }
  if (lower === "en" || lower.startsWith("en-")) return "en";
  if (lower === "ko" || lower.startsWith("ko-")) return "ko";
  if (lower === "ja" || lower.startsWith("ja-")) return "ja";
  return DEFAULT_PREFS.uiLanguage;
}
function getStorageArea(storageApi2 = globalThis.chrome?.storage?.local) {
  return storageApi2 || null;
}
function normalizeTimelineVisibilityPref(raw) {
  try {
    const pure = globalThis.PRModalConversationTimeline;
    if (typeof pure?.normalizeTimelineVisibility === "function") {
      return pure.normalizeTimelineVisibility(raw);
    }
  } catch {
  }
  const src = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const base = {
    events: true,
    participants: true,
    comments: true,
    "review-threads": true
  };
  for (const id of Object.keys(base)) {
    if (typeof src[id] === "boolean") base[id] = src[id];
  }
  const hasNew = Object.keys(base).some((k) => typeof src[k] === "boolean");
  if (!hasNew) {
    const legacyEvent = ["labels", "title", "milestone", "referenced"];
    const legacyPart = ["assignees", "reviewers"];
    if ([...legacyEvent, ...legacyPart, "comments"].some((k) => typeof src[k] === "boolean")) {
      base.events = legacyEvent.some((k) => src[k] !== false);
      base.participants = legacyPart.some((k) => src[k] !== false);
      if (typeof src.comments === "boolean") base.comments = src.comments;
      base["review-threads"] = true;
    }
  }
  if (src.all === true) {
    for (const id of Object.keys(base)) base[id] = true;
  }
  return base;
}
function normalizePrefs(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  return {
    reverseComments: typeof src.reverseComments === "boolean" ? src.reverseComments : DEFAULT_PREFS.reverseComments,
    autoOpenEmbed: typeof src.autoOpenEmbed === "boolean" ? src.autoOpenEmbed : DEFAULT_PREFS.autoOpenEmbed,
    singleFileMode: typeof src.singleFileMode === "boolean" ? src.singleFileMode : DEFAULT_PREFS.singleFileMode,
    treeView: typeof src.treeView === "boolean" ? src.treeView : DEFAULT_PREFS.treeView,
    pluginEnabled: typeof src.pluginEnabled === "boolean" ? src.pluginEnabled : DEFAULT_PREFS.pluginEnabled,
    shortcutMonitorSize: normalizeShortcutMonitorSizePref(
      src.shortcutMonitorSize
    ),
    autoExpandOnFileNav: typeof src.autoExpandOnFileNav === "boolean" ? src.autoExpandOnFileNav : DEFAULT_PREFS.autoExpandOnFileNav,
    onboardingCompleted: typeof src.onboardingCompleted === "boolean" ? src.onboardingCompleted : DEFAULT_PREFS.onboardingCompleted,
    uiLanguage: normalizeUiLanguagePref(src.uiLanguage),
    timelineVisibility: normalizeTimelineVisibilityPref(
      src.timelineVisibility ?? DEFAULT_PREFS.timelineVisibility
    )
  };
}
function emptyRateLimitStateLocal() {
  const RL = globalThis.PRModalRateLimit;
  if (typeof RL?.emptyRateLimitState === "function") {
    return RL.emptyRateLimitState();
  }
  return {
    disabledUntil: { core: 0, graphql: 0, search: 0 },
    snapshots: { core: null, graphql: null, search: null }
  };
}
function normalizeRateLimitStateLocal(raw) {
  const RL = globalThis.PRModalRateLimit;
  if (typeof RL?.normalizeRateLimitState === "function") {
    return RL.normalizeRateLimitState(raw);
  }
  return emptyRateLimitStateLocal();
}
function getRateLimitState(storageApi2) {
  const area = getStorageArea(storageApi2);
  if (!area) return Promise.resolve(emptyRateLimitStateLocal());
  return new Promise((resolve) => {
    area.get([RATE_LIMIT_KEY], (result) => {
      resolve(normalizeRateLimitStateLocal(result?.[RATE_LIMIT_KEY]));
    });
  });
}
async function setRateLimitState(next, storageApi2) {
  const area = getStorageArea(storageApi2);
  if (!area) return Promise.reject(new Error("chrome.storage unavailable"));
  const normalized = normalizeRateLimitStateLocal(next);
  return new Promise((resolve, reject) => {
    area.set({ [RATE_LIMIT_KEY]: normalized }, () => {
      const err = globalThis.chrome?.runtime?.lastError;
      if (err) reject(err);
      else resolve(normalized);
    });
  });
}
async function patchRateLimitState(patch, storageApi2) {
  const prev = await getRateLimitState(storageApi2);
  const next = normalizeRateLimitStateLocal({
    ...prev,
    ...patch && typeof patch === "object" ? patch : {},
    disabledUntil: {
      ...prev.disabledUntil,
      ...patch?.disabledUntil && typeof patch.disabledUntil === "object" ? patch.disabledUntil : {}
    },
    snapshots: {
      ...prev.snapshots,
      ...patch?.snapshots && typeof patch.snapshots === "object" ? patch.snapshots : {}
    }
  });
  return setRateLimitState(next, storageApi2);
}
function watchRateLimitState(onChange, storageApi2 = globalThis.chrome?.storage) {
  if (!storageApi2?.onChanged || typeof onChange !== "function") return () => {
  };
  const listener = (changes, areaName) => {
    if (areaName !== "local" || !changes[RATE_LIMIT_KEY]) return;
    onChange(normalizeRateLimitStateLocal(changes[RATE_LIMIT_KEY].newValue));
  };
  storageApi2.onChanged.addListener(listener);
  return () => storageApi2.onChanged.removeListener(listener);
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
  const patchObj = patch && typeof patch === "object" ? patch : {};
  const next = normalizePrefs({
    ...prev,
    ...patchObj
  });
  if (Object.prototype.hasOwnProperty.call(patchObj, "uiLanguage")) {
    next.uiLanguage = normalizeUiLanguagePref(patchObj.uiLanguage);
  }
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
function getOnboardingCompleted(storageApi2) {
  const area = getStorageArea(storageApi2);
  if (!area) return Promise.resolve(false);
  return new Promise((resolve) => {
    area.get([ONBOARDING_KEY, PREFS_KEY], (result) => {
      if (typeof result?.[ONBOARDING_KEY] === "boolean") {
        resolve(Boolean(result[ONBOARDING_KEY]));
        return;
      }
      const prefs = normalizePrefs(result?.[PREFS_KEY]);
      resolve(Boolean(prefs.onboardingCompleted));
    });
  });
}
async function setOnboardingCompleted(completed, storageApi2) {
  const area = getStorageArea(storageApi2);
  if (!area) return Promise.reject(new Error("chrome.storage unavailable"));
  const value = Boolean(completed);
  await new Promise((resolve, reject) => {
    area.set({ [ONBOARDING_KEY]: value }, () => {
      const err = globalThis.chrome?.runtime?.lastError;
      if (err) reject(err);
      else resolve(void 0);
    });
  });
  try {
    await setExtensionPrefs({ onboardingCompleted: value }, area);
  } catch {
  }
  return value;
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
    } else if (
      // @ts-expect-error classic content-script dynamic shapes
      !existing.some((a) => a.host === h) && // @ts-expect-error classic content-script dynamic shapes
      existing.length >= 3
    ) {
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
  ONBOARDING_KEY,
  RATE_LIMIT_KEY,
  DEFAULT_PREFS,
  normalizePrefs,
  normalizeUiLanguagePref,
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
if (typeof module !== "undefined" && module.exports) {
  module.exports = storageApi;
}
if (typeof globalThis !== "undefined") {
  globalThis.PRTreeStorage = storageApi;
}
})();


/* ---- fetch-pulls.js ---- */

/**
 * AUTO-GENERATED from src/fetch/* (entry: fetch-api.ts)
 * SOURCE OF TRUTH: src/fetch/ — npm run build:fetch
 */
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});

// src/fetch/http.ts
function normalizeApiCtx(ctx) {
  if (ctx && typeof ctx === "object" && (ctx.restBase || ctx.graphqlUrl)) {
    return {
      kind: ctx.kind || "custom",
      webHost: ctx.webHost || "github.com",
      webOrigin: ctx.webOrigin || "",
      restBase: String(ctx.restBase || "https://api.github.com").replace(/\/+$/, ""),
      graphqlUrl: String(
        ctx.graphqlUrl || (String(ctx.restBase || "").includes("api.github.com") ? "https://api.github.com/graphql" : "")
      ).replace(/\/+$/, "") || "https://api.github.com/graphql"
    };
  }
  const webHost = typeof ctx === "string" ? ctx : ctx && typeof ctx === "object" && ctx.webHost ? ctx.webHost : "github.com";
  try {
    if (globalThis.PRGithubEndpoints && typeof globalThis.PRGithubEndpoints.resolveGithubEndpoints === "function") {
      return globalThis.PRGithubEndpoints.resolveGithubEndpoints({ webHost });
    }
  } catch (_) {
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
    if (globalThis.PRGithubEndpoints && typeof globalThis.PRGithubEndpoints.githubRestUrl === "function") {
      return globalThis.PRGithubEndpoints.githubRestUrl(path, c);
    }
  } catch (_) {
  }
  const p = String(path || "");
  if (/^https?:\/\//i.test(p)) return p;
  const base = String(c.restBase || "https://api.github.com").replace(/\/+$/, "");
  return base + (p.startsWith("/") ? p : "/" + p);
}
function githubGraphqlUrl(ctx) {
  const c = normalizeApiCtx(ctx);
  try {
    if (globalThis.PRGithubEndpoints && typeof globalThis.PRGithubEndpoints.githubGraphqlUrl === "function") {
      return globalThis.PRGithubEndpoints.githubGraphqlUrl(c);
    }
  } catch (_) {
  }
  return String(c.graphqlUrl || "https://api.github.com/graphql");
}
function buildApiHeaders(token) {
  const headers = { Accept: "application/vnd.github+json" };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
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
function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function decodeBase64Utf8(b64) {
  try {
    if (typeof Buffer !== "undefined") {
      return Buffer.from(b64, "base64").toString("utf8");
    }
  } catch {
  }
  try {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder("utf-8").decode(bytes);
  } catch {
    return "";
  }
}
async function apiJson(url, fetchImpl, token, opts = {}) {
  const headers = {
    ...buildApiHeaders(token),
    ...opts.headers && typeof opts.headers === "object" ? opts.headers : {}
  };
  const init = { headers };
  if (opts.cache) init.cache = opts.cache;
  const res = await fetchImpl(url, init);
  if (!res.ok) {
    const err = new Error(`GitHub API ${res.status}: ${res.statusText}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}
async function apiJsonWithLink(url, fetchImpl, token) {
  const res = await fetchImpl(url, { headers: buildApiHeaders(token) });
  if (!res.ok) {
    const err = new Error(`GitHub API ${res.status}: ${res.statusText}`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  let link = "";
  try {
    if (typeof res.headers?.get === "function") {
      link = res.headers.get("link") || res.headers.get("Link") || "";
    }
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
  const re = new RegExp(`rel="?${rel}"?`, "i");
  const parts = raw.split(",");
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
  const maxPages = Number.isFinite(opts.maxPages) && opts.maxPages > 0 ? Math.floor(opts.maxPages) : 50;
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
async function apiSend(url, fetchImpl, token, opts = {}) {
  const method = opts?.method || "GET";
  const body = opts?.body;
  const headers = buildApiHeaders(token);
  if (body != null) headers["Content-Type"] = "application/json";
  const res = await fetchImpl(url, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : void 0
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const j = await res.json();
      if (j?.message) detail = j.message;
      if (Array.isArray(j?.errors) && j.errors.length) {
        const bits = j.errors.map((e) => {
          if (!e || typeof e !== "object") return String(e);
          if (e.message) return e.message;
          const field = e.field || e.resource || "";
          const code = e.code || "";
          return [field, code].filter(Boolean).join(" ") || null;
        }).filter(Boolean);
        if (bits.length) detail = `${detail}: ${bits.join("; ")}`;
      }
    } catch {
    }
    const err = new Error(`GitHub API ${res.status}: ${detail}`);
    err.status = res.status;
    throw err;
  }
  if (res.status === 204) return null;
  return res.json();
}
var GQL_COST_LOG_MAX = 400;
var gqlCostLogEntries = [];
var gqlCostHeaderUsedPrev = null;
function graphqlCostPure() {
  try {
    return typeof globalThis !== "undefined" ? globalThis.PRModalGraphqlCostLog || null : null;
  } catch {
    return null;
  }
}
function injectRateLimitCostFieldLocal(query) {
  const pure = graphqlCostPure();
  if (typeof pure?.injectRateLimitCostField === "function") {
    return pure.injectRateLimitCostField(query);
  }
  const q = String(query || "");
  if (!q.trim() || /rateLimit\s*\{/.test(q)) return q;
  if (/\bmutation\b/i.test(q)) return q;
  const trimmed = q.replace(/\s+$/, "");
  const lastBrace = trimmed.lastIndexOf("}");
  if (lastBrace < 0) return q;
  return trimmed.slice(0, lastBrace) + "\n  rateLimit { cost remaining used limit resetAt }\n" + trimmed.slice(lastBrace);
}
function labelGraphqlOperationLocal(query, variables = null) {
  const pure = graphqlCostPure();
  if (typeof pure?.labelGraphqlOperation === "function") {
    return pure.labelGraphqlOperation(query, variables);
  }
  const q = String(query || "");
  const named = q.match(/\b(query|mutation)\s+([A-Za-z_][A-Za-z0-9_]*)/);
  if (named?.[2]) return named[2];
  if (/reviewThreads/.test(q)) return "reviewThreads";
  return /\bmutation\b/.test(q) ? "mutation" : "query";
}
function sanitizeGraphqlVariablesLocal(variables) {
  const pure = graphqlCostPure();
  if (typeof pure?.sanitizeGraphqlVariables === "function") {
    return pure.sanitizeGraphqlVariables(variables);
  }
  return {};
}
function summarizeGraphqlCostLogLocal(entries = gqlCostLogEntries) {
  const pure = graphqlCostPure();
  if (typeof pure?.summarizeGraphqlCostEntries === "function") {
    return pure.summarizeGraphqlCostEntries(entries);
  }
  const list = Array.isArray(entries) ? entries : [];
  const map = /* @__PURE__ */ new Map();
  let totalCost = 0;
  let unknownCostCalls = 0;
  for (const e of list) {
    const op = String(e?.op || "unknown");
    const cost = e?.cost != null && Number.isFinite(Number(e.cost)) ? Number(e.cost) : null;
    const ms = e?.ms != null && Number.isFinite(Number(e.ms)) ? Number(e.ms) : 0;
    if (!map.has(op)) {
      map.set(op, {
        op,
        calls: 0,
        cost: 0,
        maxCost: 0,
        msSum: 0,
        knownCostCalls: 0
      });
    }
    const row = map.get(op);
    row.calls += 1;
    row.msSum += ms;
    if (cost != null) {
      row.cost += cost;
      row.knownCostCalls += 1;
      row.maxCost = Math.max(row.maxCost, cost);
      totalCost += cost;
    } else {
      unknownCostCalls += 1;
    }
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
  if (!headers || typeof headers.get !== "function") return null;
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
    ok: entry?.ok !== false,
    err: entry?.err ? String(entry.err).slice(0, 160) : null,
    vars: entry?.vars && typeof entry.vars === "object" ? entry.vars : {}
  };
  gqlCostLogEntries.push(row);
  while (gqlCostLogEntries.length > GQL_COST_LOG_MAX) gqlCostLogEntries.shift();
  const costStr = row.cost != null ? String(row.cost) : "?";
  const remStr = row.remaining != null ? String(row.remaining) : "?";
  console.log(
    `[pr-plus] gql cost=${costStr} remaining=${remStr} op=${row.op}` + (row.ms != null ? ` ${row.ms}ms` : "") + (row.costSource ? ` via=${row.costSource}` : "") + (row.ok ? "" : ` FAIL ${row.err || ""}`) + (row.vars && Object.keys(row.vars).length ? ` vars=${JSON.stringify(row.vars)}` : "")
  );
  return row;
}
function getGraphqlCostLog() {
  return gqlCostLogEntries.slice();
}
function clearGraphqlCostLog() {
  gqlCostLogEntries.length = 0;
  gqlCostHeaderUsedPrev = null;
}
function summarizeGraphqlCostLog() {
  return summarizeGraphqlCostLogLocal(gqlCostLogEntries);
}
async function apiGraphql(query, variables, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const op = labelGraphqlOperationLocal(query, variables);
  const vars = sanitizeGraphqlVariablesLocal(variables);
  const q = injectRateLimitCostFieldLocal(query);
  const t0 = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
  const url = githubGraphqlUrl(ctx);
  const headers = buildApiHeaders(token);
  headers["Content-Type"] = "application/json";
  let res;
  let json = null;
  try {
    res = await fetchImpl(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ query: q, variables: variables || {} })
    });
  } catch (err) {
    const ms2 = (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now()) - t0;
    recordGraphqlCostEntry({
      op,
      cost: null,
      ms: ms2,
      ok: false,
      err: err?.message || err,
      vars
    });
    throw err;
  }
  const hdrRemaining = headerInt(res?.headers, "x-ratelimit-remaining");
  const hdrUsed = headerInt(res?.headers, "x-ratelimit-used");
  const hdrLimit = headerInt(res?.headers, "x-ratelimit-limit");
  try {
    json = await res.json();
  } catch (err) {
    const ms2 = (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now()) - t0;
    recordGraphqlCostEntry({
      op,
      cost: null,
      remaining: hdrRemaining,
      used: hdrUsed,
      ms: ms2,
      ok: false,
      err: err?.message || "invalid json",
      vars
    });
    throw err;
  }
  const ms = (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now()) - t0;
  const bodyRl = json?.data?.rateLimit || null;
  let cost = bodyRl?.cost != null && Number.isFinite(Number(bodyRl.cost)) ? Number(bodyRl.cost) : null;
  let costSource = cost != null ? "body.rateLimit.cost" : null;
  if (cost == null && hdrUsed != null && gqlCostHeaderUsedPrev != null) {
    const delta = hdrUsed - gqlCostHeaderUsedPrev;
    if (delta >= 0 && delta < 5e3) {
      cost = delta;
      costSource = "header.used-delta";
    }
  }
  if (hdrUsed != null) gqlCostHeaderUsedPrev = hdrUsed;
  const remaining = bodyRl?.remaining != null && Number.isFinite(Number(bodyRl.remaining)) ? Number(bodyRl.remaining) : hdrRemaining;
  const used = bodyRl?.used != null && Number.isFinite(Number(bodyRl.used)) ? Number(bodyRl.used) : hdrUsed;
  if (!res.ok) {
    recordGraphqlCostEntry({
      op,
      cost,
      costSource,
      remaining,
      used,
      ms,
      ok: false,
      err: `HTTP ${res.status}`,
      vars
    });
    const err = new Error(
      `GitHub GraphQL HTTP ${res.status}: ${res.statusText || ""}`
    );
    err.status = res.status;
    throw err;
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
      ok: false,
      err: msg || "graphql errors",
      vars
    });
    const err = new Error(`GitHub GraphQL: ${msg || "unknown error"}`);
    err.graphqlErrors = json.errors;
    err.status = 200;
    throw err;
  }
  recordGraphqlCostEntry({
    op,
    cost,
    costSource,
    remaining,
    used,
    limit: bodyRl?.limit != null ? Number(bodyRl.limit) : hdrLimit,
    ms,
    ok: true,
    vars
  });
  return json?.data ?? null;
}
function fetchNowMs() {
  return typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
}
async function timedFetch(timings, name, promise, extra = void 0, opts = {}) {
  const t0 = fetchNowMs();
  const batchStart = opts && Number.isFinite(opts.batchStart) ? Number(opts.batchStart) : null;
  if (batchStart != null) {
    timings[`${name}_start`] = Math.round(t0 - batchStart);
  }
  try {
    const result = await promise;
    const ms = Math.round(fetchNowMs() - t0);
    timings[name] = ms;
    let suffix = "";
    try {
      if (typeof extra === "function") suffix = extra(result) || "";
    } catch {
    }
    const startLabel = batchStart != null && timings[`${name}_start`] != null ? ` t+${timings[`${name}_start`]}ms` : "";
    console.log(
      `[pr-plus] fetchPrDetail ${name}: ${ms}ms${startLabel}${suffix ? ` ${suffix}` : ""}`
    );
    return result;
  } catch (err) {
    const ms = Math.round(fetchNowMs() - t0);
    timings[name] = ms;
    const msg = err?.message || String(err);
    timings[`${name}_error`] = msg;
    const startLabel = batchStart != null && timings[`${name}_start`] != null ? ` t+${timings[`${name}_start`]}ms` : "";
    console.log(
      `[pr-plus] fetchPrDetail ${name}: ${ms}ms${startLabel} ERROR ${msg}`
    );
    throw err;
  }
}
function logParallelRestSummary(timings, names, wallMs) {
  const rows = (Array.isArray(names) ? names : []).map((name) => {
    const ms = Number(timings[name]);
    const start = Number(timings[`${name}_start`]);
    const err = timings[`${name}_error`];
    return {
      name,
      ms: Number.isFinite(ms) ? ms : null,
      start: Number.isFinite(start) ? start : null,
      error: err ? String(err) : null
    };
  }).filter((r) => r.ms != null);
  rows.sort((a, b) => (b.ms || 0) - (a.ms || 0));
  const slowest = rows[0];
  const sum = rows.reduce((s, r) => s + (r.ms || 0), 0);
  const lines = rows.map((r) => {
    const bar = wallMs > 0 && r.ms != null ? "\u2588".repeat(Math.max(1, Math.round(r.ms / wallMs * 20))) : "";
    const start = r.start != null ? `+${r.start}ms`.padStart(7) : "   n/a";
    const dur = r.ms != null ? `${r.ms}ms`.padStart(6) : "   n/a";
    const err = r.error ? ` ERR:${r.error.slice(0, 40)}` : "";
    return `  ${r.name.padEnd(16)} start${start}  dur${dur}  ${bar}${err}`;
  });
  console.log(
    `[pr-plus] fetchPrDetail parallel REST summary
  wall=${Math.round(wallMs)}ms  sum=${sum}ms  slowest=${slowest ? `${slowest.name}@${slowest.ms}ms` : "n/a"}
` + (lines.length ? lines.join("\n") : "  (no rows)")
  );
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

// src/fetch/mappers.ts
function mapApiPullRequest(pr) {
  const author = pr.user?.login || "";
  const authorAvatarUrl = pr.user?.avatar_url || "";
  const labels = Array.isArray(pr.labels) ? pr.labels.map((l) => ({
    name: l?.name || String(l || ""),
    color: l?.color || "",
    description: l?.description || ""
  })).filter((l) => l.name) : [];
  const assignees = Array.isArray(pr.assignees) ? pr.assignees.map((u) => u?.login || u).filter(Boolean) : [];
  const requestedReviewers = Array.isArray(pr.requested_reviewers) ? pr.requested_reviewers.map((u) => u?.login || u).filter(Boolean) : [];
  const avatarUrls = {};
  const putUser = (u) => {
    const login = u?.login || (typeof u === "string" ? u : "");
    const url = u?.avatar_url || "";
    if (login && url) avatarUrls[String(login).toLowerCase()] = url;
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
    let mod = typeof globalThis !== "undefined" ? globalThis.PRModalCommentsPage : null;
    if (!mod && typeof __require === "function") {
      try {
        mod = __require("./modal/pure/comments-page.js");
      } catch {
        mod = null;
      }
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
  if (!raw || typeof raw !== "object") return [];
  const out = [];
  for (const content of DEFS) {
    const count = Number(raw[content]) || 0;
    if (count <= 0) continue;
    out.push({ content, count, viewerHasReacted: false, users: [] });
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
  const nodes = reactors?.nodes || [];
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  for (const n of Array.isArray(nodes) ? nodes : []) {
    const login = String(n?.login || "").trim();
    if (!login) continue;
    const key = login.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(login);
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
  ];
  const by = /* @__PURE__ */ new Map();
  for (const g of groups) {
    if (!g) continue;
    const content = GQL_REACTION_TO_REST[String(g.content || "").toUpperCase()] || GQL_REACTION_TO_REST[String(g.content || "")] || null;
    if (!content) continue;
    const users = extractReactorLogins(g.reactors);
    const count = Number(
      g.reactors?.totalCount ?? g.users?.totalCount ?? users.length ?? 0
    );
    const viewerHasReacted = Boolean(g.viewerHasReacted);
    if (count <= 0 && !viewerHasReacted) continue;
    by.set(content, {
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
    reactions: mapRestReactions(c.reactions),
    // null = unknown (REST omits Minimizable) — must not clobber GraphQL true on merge
    isMinimized: c.isMinimized != null || c.is_minimized != null ? Boolean(c.isMinimized ?? c.is_minimized) : null,
    minimizedReason: c.minimizedReason ?? c.minimized_reason ?? null,
    viewerCanMinimize: c.viewerCanMinimize != null ? Boolean(c.viewerCanMinimize) : c.viewer_can_minimize != null ? Boolean(c.viewer_can_minimize) : null
  };
}
function mapReviewComment(c, extra = {}) {
  const subjectTypeRaw = String(
    extra.subjectType || c.subject_type || c.subjectType || ""
  ).toLowerCase();
  const isFileSubject = subjectTypeRaw === "file";
  const line = isFileSubject ? null : c.line ?? c.original_line ?? (c.position != null && Number.isFinite(Number(c.position)) ? Number(c.position) : null);
  const outdated = extra.outdated != null ? Boolean(extra.outdated) : c.outdated != null ? Boolean(c.outdated) : !isFileSubject && c.line == null && c.original_line != null;
  const subjectType = isFileSubject || line == null && !c.original_line && c.path && subjectTypeRaw !== "line" ? "file" : "line";
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
    // null = unknown (REST omits Minimizable) — must not clobber GraphQL true
    isMinimized: extra.isMinimized != null || c.isMinimized != null || c.is_minimized != null ? Boolean(
      extra.isMinimized ?? c.isMinimized ?? c.is_minimized
    ) : null,
    minimizedReason: extra.minimizedReason ?? c.minimizedReason ?? c.minimized_reason ?? null,
    viewerCanMinimize: extra.viewerCanMinimize != null ? Boolean(extra.viewerCanMinimize) : c.viewerCanMinimize != null ? Boolean(c.viewerCanMinimize) : null,
    threadNodeId: extra.threadNodeId ?? null,
    /** Pull request review id (groups file threads under one review event). */
    reviewId: c.pull_request_review_id != null ? Number(c.pull_request_review_id) : extra.reviewId != null ? Number(extra.reviewId) : null,
    resolved: Boolean(extra.resolved),
    outdated,
    /** True when part of a not-yet-submitted PENDING review (hidden from main list). */
    pending: Boolean(extra.pending || c.pending),
    pendingReviewId: extra.pendingReviewId ?? c.pendingReviewId ?? null,
    /** `file` | `line` — file-level comments have no line anchor. */
    subjectType
  };
}
function mapGraphqlReviewCommentNode(node, threadMeta = {}) {
  if (!node) return null;
  const id = node.databaseId ?? null;
  if (id == null) return null;
  const reviewState = String(node.pullRequestReview?.state || "").toUpperCase();
  const pending = reviewState === "PENDING";
  const reviewDbId = node.pullRequestReview?.databaseId != null ? Number(node.pullRequestReview.databaseId) : null;
  const subjectTypeRaw = String(
    threadMeta.subjectType || node.subjectType || ""
  ).toUpperCase();
  const isFile = subjectTypeRaw === "FILE";
  const line = isFile ? null : node.line != null ? Number(node.line) : node.originalLine != null ? Number(node.originalLine) : null;
  const sideRaw = threadMeta.diffSide || threadMeta.side || "RIGHT";
  const side = String(sideRaw).toUpperCase() === "LEFT" ? "LEFT" : "RIGHT";
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
    isMinimized: Boolean(node.isMinimized ?? false),
    minimizedReason: node.minimizedReason ?? null,
    viewerCanMinimize: node.viewerCanMinimize != null ? Boolean(node.viewerCanMinimize) : null,
    threadNodeId: threadMeta.threadNodeId || null,
    reviewId: reviewDbId,
    resolved: Boolean(threadMeta.resolved),
    outdated: Boolean(node.outdated ?? threadMeta.isOutdated),
    pending,
    pendingReviewId: pending ? reviewDbId : null,
    subjectType: isFile ? "file" : "line"
  };
}
function extractRepoMergeMethodFlags(repo) {
  if (!repo || typeof repo !== "object") return null;
  const has = Object.prototype.hasOwnProperty.call(repo, "allow_merge_commit") || Object.prototype.hasOwnProperty.call(repo, "allow_squash_merge") || Object.prototype.hasOwnProperty.call(repo, "allow_rebase_merge");
  if (!has) return null;
  const flag = (v) => v === true || v === false ? v : null;
  return {
    allowMergeCommit: flag(repo.allow_merge_commit),
    allowSquashMerge: flag(repo.allow_squash_merge),
    allowRebaseMerge: flag(repo.allow_rebase_merge)
  };
}
function extractViewerCanMergeAsAdmin(repo) {
  if (!repo || typeof repo !== "object") return null;
  const p = repo.permissions;
  if (!p || typeof p !== "object") return null;
  if (p.admin === true) return true;
  if (p.admin === false) return false;
  return null;
}
function mapGraphqlReviewCommentToRest(c, fallback = {}) {
  if (!c) return null;
  return {
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
  };
}
function mapViewerSubscription(state) {
  const s = String(state || "").toUpperCase();
  if (s === "SUBSCRIBED") return { subscribed: true, ignored: false, viewerSubscription: s };
  if (s === "IGNORED") return { subscribed: false, ignored: true, viewerSubscription: s };
  if (s === "UNSUBSCRIBED") {
    return { subscribed: false, ignored: false, viewerSubscription: s };
  }
  return { subscribed: null, ignored: false, viewerSubscription: s || null };
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
    let collapse = typeof globalThis !== "undefined" ? globalThis.PRModalCollapse : null;
    if (!collapse && typeof __require === "function") {
      try {
        collapse = __require("./modal/pure/collapse.js");
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
    const LARGE = 5e3;
    filesOut = mappedFiles.map((f) => {
      const path = f.filename || "";
      const isImage = /\.(png|jpe?g|gif|webp|bmp|svg|ico|avif)$/i.test(path);
      const hasPatch = Boolean(f.patch);
      const kind = isImage ? "image" : hasPatch ? "text" : "binary";
      return {
        ...f,
        fileKind: kind,
        openableAsText: kind === "text",
        renderImage: kind === "image",
        defaultCollapsed: kind === "binary" || (f.changes || 0) >= LARGE || /package-lock\.json$|yarn\.lock$|\.min\.(js|css)$|\.bundle\.js$/i.test(
          path
        )
      };
    });
  }
  return filesOut;
}

// src/fetch/misc.ts
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

// src/fetch/viewer.ts
async function fetchViewerViewedPaths(owner, repo, pullNumber, fetchImpl, token, opts = {}) {
  const apiCtx = normalizeApiCtx(opts?.ctx);
  if (!token) {
    return { pullRequestId: null, viewedPaths: [], unauthorized: true };
  }
  const maxPages = Math.max(1, Math.min(20, Number(opts.maxPages) || 5));
  const viewed = [];
  let cursor = null;
  let pullRequestId = null;
  for (let page = 0; page < maxPages; page++) {
    const data = await apiGraphql(
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
    );
    const pr = data?.repository?.pullRequest;
    if (!pr) break;
    if (pr.id) pullRequestId = String(pr.id);
    const nodes = pr.files?.nodes || [];
    for (const n of nodes) {
      if (String(n?.viewerViewedState || "").toUpperCase() === "VIEWED" && n?.path) {
        viewed.push(String(n.path));
      }
    }
    if (!pr.files?.pageInfo?.hasNextPage) break;
    cursor = pr.files.pageInfo.endCursor || null;
    if (!cursor) break;
  }
  return { pullRequestId, viewedPaths: viewed };
}
async function markFileAsViewed(pullRequestId, path, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const data = await apiGraphql(
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
  return data;
}
async function unmarkFileAsViewed(pullRequestId, path, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const data = await apiGraphql(
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
  return data;
}
async function resolvePullRequestNodeId(owner, repo, pullNumber, fetchImpl, token, nodeId = null, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  if (nodeId) return String(nodeId);
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
async function setIssueSubscription(owner, repo, issueNumber, { subscribed = true, ignored = false, nodeId = null } = {}, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  if (!token) throw new Error("GitHub PAT required for notifications");
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
      "Could not resolve pull request id for subscription. Refresh and try again."
    );
  }
  const state = ignored ? "IGNORED" : subscribed ? "SUBSCRIBED" : "UNSUBSCRIBED";
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
async function deleteIssueSubscription(owner, repo, issueNumber, fetchImpl, token, nodeId = null) {
  return setIssueSubscription(
    owner,
    repo,
    issueNumber,
    { subscribed: false, ignored: false, nodeId },
    fetchImpl,
    token
  );
}
async function fetchPullRequestSubscription(owner, repo, pullNumber, fetchImpl, token, nodeId = null, ctx = null) {
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
    );
    const node = data?.node || null;
    const vs = node?.viewerSubscription;
    if (!vs) {
      if (node?.mergeStateStatus) {
        return {
          subscribed: null,
          mergeStateStatus: String(node.mergeStateStatus || "") || null
        };
      }
      return null;
    }
    const mapped = mapViewerSubscription(vs);
    if (node?.mergeStateStatus) {
      return {
        ...mapped,
        mergeStateStatus: String(node.mergeStateStatus || "") || null
      };
    }
    return mapped;
  } catch {
    return null;
  }
}
async function uploadRepoFile(owner, repo, { path, contentBase64, message, branch }, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  if (!path || !contentBase64) throw new Error("path and contentBase64 required");
  const encPath = String(path).split("/").map(encodeURIComponent).join("/");
  let sha;
  try {
    const meta = await apiJson(
      githubRestUrl(
        `/repos/${owner}/${repo}/contents/${encPath}${branch ? `?ref=${encodeURIComponent(branch)}` : ""}`,
        ctx
      ),
      fetchImpl,
      token
    );
    sha = meta?.sha;
  } catch {
    sha = void 0;
  }
  const body = {
    message: message || `Upload ${path}`,
    content: String(contentBase64).replace(/\s+/g, "")
  };
  if (branch) body.branch = branch;
  if (sha) body.sha = sha;
  const result = await apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/contents/${encPath}`, ctx),
    fetchImpl,
    token,
    { method: "PUT", body }
  );
  const content = result?.content || result;
  return {
    downloadUrl: content?.download_url || content?.html_url || "",
    htmlUrl: content?.html_url || content?.download_url || "",
    path: content?.path || path,
    sha: content?.sha || ""
  };
}
async function getRepoFileText(owner, repo, { path, ref }, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  if (!path) throw new Error("path required");
  const rev = ref || "HEAD";
  const encPath = String(path).split("/").map(encodeURIComponent).join("/");
  const meta = await apiJson(
    githubRestUrl(`/repos/${owner}/${repo}/contents/${encPath}?ref=${encodeURIComponent(rev)}`, ctx),
    fetchImpl,
    token
  );
  if (meta?.type && meta.type !== "file") {
    throw new Error(`Not a file: ${path}`);
  }
  let raw = "";
  if (meta?.content && meta?.encoding === "base64") {
    raw = decodeBase64Utf8(String(meta.content).replace(/\n/g, ""));
  } else if (meta?.download_url) {
    const res = await fetchImpl(meta.download_url, {
      headers: buildApiHeaders(token)
    });
    if (!res.ok) {
      const err = new Error(`GitHub download ${res.status}: ${res.statusText}`);
      err.status = res.status;
      throw err;
    }
    raw = await res.text();
  } else if (meta?.content) {
    raw = decodeBase64Utf8(String(meta.content).replace(/\n/g, ""));
  }
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
  const ref = headRef || "HEAD";
  const file = await getRepoFileText(
    owner,
    repo,
    { path, ref },
    fetchImpl,
    token
  );
  const raw = file.text || "";
  let applyFn = null;
  try {
    let mod = typeof globalThis !== "undefined" ? globalThis.PRModalPrEditApi : null;
    if (!mod && typeof __require === "function") {
      try {
        mod = __require("./modal/pure/pr-edit-api.js");
      } catch {
        mod = null;
      }
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
  if (typeof Buffer !== "undefined") {
    contentB64 = Buffer.from(next, "utf8").toString("base64");
  } else {
    contentB64 = btoa(unescape(encodeURIComponent(next)));
  }
  return apiSend(
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
  ctx = normalizeApiCtx(ctx);
  if (!token) return null;
  try {
    const me = await apiJson(githubRestUrl("/user", ctx), fetchImpl, token);
    return me?.login || null;
  } catch {
    return null;
  }
}

// src/fetch/reactions.ts
async function fetchReactableReactionGroups(nodeIds, fetchImpl, token, ctx = null, opts = null) {
  ctx = normalizeApiCtx(ctx);
  const ids = [
    ...new Set(
      (Array.isArray(nodeIds) ? nodeIds : []).map((id) => String(id || "").trim()).filter(Boolean)
    )
  ].slice(0, 100);
  const out = /* @__PURE__ */ new Map();
  if (!ids.length || !token) return out;
  const reactorsFirst = Math.max(
    0,
    Math.min(20, Number(opts?.reactorsFirst) || 0)
  );
  const reactorsSel = reactorsFirst > 0 ? `reactors(first:${reactorsFirst}){
            totalCount
            nodes{
              ... on User { login }
              ... on Bot { login }
            }
          }` : `reactors { totalCount }`;
  const query = `query($ids:[ID!]!){
    nodes(ids:$ids){
      ... on Reactable {
        id
        reactionGroups {
          content
          viewerHasReacted
          ${reactorsSel}
        }
      }
    }
  }`;
  try {
    const data = await apiGraphql(query, { ids }, fetchImpl, token, ctx);
    for (const node of data?.nodes || []) {
      if (!node?.id) continue;
      out.set(String(node.id), mapGraphqlReactionGroups(node.reactionGroups));
    }
  } catch {
  }
  return out;
}
async function fetchMinimizableStates(nodeIds, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const ids = [
    ...new Set(
      (Array.isArray(nodeIds) ? nodeIds : []).map((id) => String(id || "").trim()).filter(Boolean)
    )
  ].slice(0, 100);
  const out = /* @__PURE__ */ new Map();
  if (!ids.length || !token) return out;
  const query = `query($ids:[ID!]!){
    nodes(ids:$ids){
      ... on IssueComment {
        id
        isMinimized
        minimizedReason
        viewerCanMinimize
      }
      ... on PullRequestReviewComment {
        id
        isMinimized
        minimizedReason
        viewerCanMinimize
      }
    }
  }`;
  try {
    const data = await apiGraphql(query, { ids }, fetchImpl, token, ctx);
    for (const node of data?.nodes || []) {
      if (!node?.id) continue;
      out.set(String(node.id), {
        isMinimized: Boolean(node.isMinimized),
        minimizedReason: node.minimizedReason ?? null,
        viewerCanMinimize: node.viewerCanMinimize != null ? Boolean(node.viewerCanMinimize) : null
      });
    }
  } catch {
  }
  return out;
}
function applyMinimizableStates(items, byId) {
  if (!byId?.size || !Array.isArray(items)) return items;
  for (const c of items) {
    const id = c?.nodeId || c?.node_id || c?.id;
    if (id == null) continue;
    const m = byId.get(String(id));
    if (!m) continue;
    c.isMinimized = Boolean(m.isMinimized);
    c.minimizedReason = m.minimizedReason ?? null;
    if (m.viewerCanMinimize != null) {
      c.viewerCanMinimize = Boolean(m.viewerCanMinimize);
    }
  }
  return items;
}
async function fetchReactableReactors(nodeId, fetchImpl, token, ctx = null, opts = null) {
  ctx = normalizeApiCtx(ctx);
  const id = String(nodeId || "").trim();
  if (!id || !token) return [];
  const first = Math.max(1, Math.min(10, Number(opts?.first) || 5));
  const map = await fetchReactableReactionGroups(
    [id],
    fetchImpl,
    token,
    ctx,
    { reactorsFirst: first }
  );
  return map.get(id) || [];
}
function isReactableGraphqlId(id) {
  const s = String(id || "").trim();
  if (!s || /^\d+$/.test(s)) return false;
  if (/^shell:/i.test(s) || /^rest-thread-/i.test(s)) return false;
  if (/^PRRT_/i.test(s) || /PullRequestReviewThread/i.test(s)) return false;
  if (/^(PRRC_|IC_|I_|PR_)/i.test(s)) return true;
  if (/^[A-Za-z0-9_=-]{12,}$/.test(s) && /_/.test(s)) return true;
  return false;
}
function isGraphqlNotFoundError(err) {
  const msg = String(err?.message || err || "");
  return /Could not resolve|NOT_FOUND|does not exist|invalid.*id/i.test(msg);
}
function restReactionCommentId(id) {
  if (id == null || id === "") return null;
  const s = String(id).trim();
  if (!s) return null;
  if (/^\d+$/.test(s)) return s;
  if (isReactableGraphqlId(s)) return null;
  return s;
}
async function toggleCommentReaction(owner, repo, kind, opts, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const content = String(opts?.content || "").trim();
  const gqlContent = REST_TO_GQL_REACTION[content];
  if (!gqlContent) {
    throw new Error(`Unsupported reaction: ${content || "(empty)"}`);
  }
  const rawNodeId = String(opts?.nodeId || "").trim();
  const nodeId = isReactableGraphqlId(rawNodeId) ? rawNodeId : "";
  const currently = Boolean(opts?.viewerHasReacted);
  const nextReacted = !currently;
  const kRaw = String(kind || "issue").toLowerCase();
  const k = kRaw === "review" ? "review" : kRaw === "pr" ? "pr" : "issue";
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
      await apiGraphql(
        mutation,
        { id: nodeId, content: gqlContent },
        fetchImpl,
        token,
        ctx
      );
      return { content, reacted: nextReacted, via: "graphql" };
    } catch (err) {
      const restId = k === "pr" ? restReactionCommentId(opts?.number ?? opts?.commentId) : restReactionCommentId(opts?.commentId);
      if (isGraphqlNotFoundError(err) && restId != null) {
      } else {
        const msg = String(err?.message || err || "GraphQL reaction failed");
        const e = new Error(
          `${msg} | rxv4 via=graphql nodeId=${nodeId} kind=${k}`
        );
        e.status = err?.status ?? 200;
        e.via = "graphql";
        e.nodeId = nodeId;
        e.graphqlErrors = err?.graphqlErrors;
        throw e;
      }
    }
  }
  let basePath = "";
  let deletePath = (reactionId) => "";
  let restSubject = null;
  if (k === "review") {
    const commentId = restReactionCommentId(opts?.commentId);
    restSubject = commentId;
    if (commentId == null) {
      throw new Error(
        "Reaction toggle needs a GraphQL comment nodeId (PRRC_\u2026) or numeric comment id"
      );
    }
    basePath = `/repos/${owner}/${repo}/pulls/comments/${commentId}/reactions`;
    deletePath = (rid) => `/repos/${owner}/${repo}/pulls/comments/${commentId}/reactions/${rid}`;
  } else if (k === "pr") {
    const num = restReactionCommentId(opts?.number ?? opts?.commentId);
    restSubject = num;
    if (num == null) {
      throw new Error("Reaction toggle needs PR GraphQL nodeId or PR number");
    }
    basePath = `/repos/${owner}/${repo}/issues/${num}/reactions`;
    deletePath = (rid) => `/repos/${owner}/${repo}/issues/${num}/reactions/${rid}`;
  } else {
    const commentId = restReactionCommentId(opts?.commentId);
    restSubject = commentId;
    if (commentId == null) {
      throw new Error(
        "Reaction toggle needs a GraphQL comment nodeId (IC_\u2026) or numeric comment id"
      );
    }
    basePath = `/repos/${owner}/${repo}/issues/comments/${commentId}/reactions`;
    deletePath = (rid) => `/repos/${owner}/${repo}/issues/comments/${commentId}/reactions/${rid}`;
  }
  if (nextReacted) {
    try {
      await apiSend(
        githubRestUrl(basePath, ctx),
        fetchImpl,
        token,
        { method: "POST", body: { content } }
      );
      return { content, reacted: true, via: "rest" };
    } catch (err) {
      const restMsg = String(err?.message || err || "REST reaction failed");
      const e = new Error(
        `${restMsg} | rxv4 via=rest subject=${restSubject} path=${basePath}`
      );
      e.status = err?.status ?? 403;
      e.via = "rest";
      e.restPath = basePath;
      throw e;
    }
  }
  const listed = await apiJson(
    githubRestUrl(
      `${basePath}?content=${encodeURIComponent(content)}&per_page=100`,
      ctx
    ),
    fetchImpl,
    token
  );
  const rows = Array.isArray(listed) ? listed : [];
  let target = rows[0] || null;
  try {
    const me = await fetchViewerLogin(fetchImpl, token, ctx);
    const login = String(me || "").toLowerCase();
    if (login) {
      const mine = rows.find(
        (r) => String(r?.user?.login || "").toLowerCase() === login
      );
      if (mine) target = mine;
    }
  } catch {
  }
  if (!target?.id) {
    return { content, reacted: false, via: "rest" };
  }
  await apiSend(
    githubRestUrl(deletePath(target.id), ctx),
    fetchImpl,
    token,
    { method: "DELETE" }
  );
  return { content, reacted: false, via: "rest" };
}

// src/fetch/detail-sides-comments.ts
async function fetchPrIssueComments(owner, repo, number, fetchImpl, token = null, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const o = String(owner || "").trim();
  const r = String(repo || "").trim();
  const n = Number(number);
  const empty = {
    items: [],
    meta: {
      page: 1,
      perPage: COMMENT_PAGE_SIZE,
      hasMore: false,
      nextPage: null,
      order: "from-end",
      loadedCount: 0
    }
  };
  if (!o || !r || !Number.isFinite(n)) return empty;
  return await fetchPrCommentsPage(
    o,
    r,
    n,
    "issue",
    { page: 1, perPage: COMMENT_PAGE_SIZE, preferNewest: true },
    fetchImpl,
    token,
    ctx
  );
}
async function fetchPrTimelineEvents(owner, repo, number, fetchImpl, token = null, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const o = String(owner || "").trim();
  const r = String(repo || "").trim();
  const n = Number(number);
  if (!o || !r || !Number.isFinite(n)) return [];
  const SKIP = /* @__PURE__ */ new Set([
    "subscribed",
    "unsubscribed",
    "mentioned",
    "comment_deleted"
  ]);
  function mapEvent(raw) {
    if (!raw || typeof raw !== "object") return null;
    const event = String(raw.event || "").trim();
    if (!event || SKIP.has(event)) return null;
    const actor = raw.actor || raw.user || null;
    const login = actor?.login || "";
    const label = raw.label ? {
      name: String(raw.label.name || ""),
      color: String(raw.label.color || ""),
      description: String(raw.label.description || "")
    } : null;
    const assigneeLogin = typeof raw.assignee === "string" ? raw.assignee : raw.assignee?.login || null;
    const requestedReviewer = raw.requested_reviewer?.login || (typeof raw.requested_reviewer === "string" ? raw.requested_reviewer : null);
    const requestedTeam = raw.requested_team?.slug || raw.requested_team?.name || (typeof raw.requested_team === "string" ? raw.requested_team : null);
    const milestone = raw.milestone ? {
      number: raw.milestone.number != null ? Number(raw.milestone.number) : null,
      title: String(raw.milestone.title || "")
    } : null;
    const rename = raw.rename && typeof raw.rename === "object" ? {
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
    const perPage = 100;
    const maxPages = 25;
    const pageUrl = (page) => githubRestUrl(
      `/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}/issues/${n}/events?per_page=${perPage}&page=${page}`,
      ctx
    );
    const first = await apiJsonWithLink(pageUrl(1), fetchImpl, token);
    const firstBatch = Array.isArray(first.data) ? first.data : [];
    const lastPage = parseLinkRelPage(first.link, "last") || (firstBatch.length < perPage ? 1 : null);
    if (lastPage == null) {
      for (const raw of firstBatch) {
        const mapped = mapEvent(raw);
        if (mapped) out.push(mapped);
      }
      let page = 2;
      let link = first.link;
      while (page <= maxPages) {
        const next = parseLinkNextUrl(link);
        if (!next) break;
        const { data, link: nextLink } = await apiJsonWithLink(
          pageUrl(page),
          fetchImpl,
          token
        );
        link = nextLink;
        const batch = Array.isArray(data) ? data : [];
        for (const raw of batch) {
          const mapped = mapEvent(raw);
          if (mapped) out.push(mapped);
        }
        if (batch.length < perPage) break;
        page += 1;
      }
      return out;
    }
    const endPage = Math.max(1, Number(lastPage) || 1);
    const startPage = Math.max(1, endPage - maxPages + 1);
    const cachedPage1 = startPage === 1 ? firstBatch : null;
    for (let page = startPage; page <= endPage; page++) {
      let batch;
      if (page === 1 && cachedPage1) {
        batch = cachedPage1;
      } else {
        const { data } = await apiJsonWithLink(pageUrl(page), fetchImpl, token);
        batch = Array.isArray(data) ? data : [];
      }
      for (const raw of batch) {
        const mapped = mapEvent(raw);
        if (mapped) out.push(mapped);
      }
    }
    return out;
  } catch (err) {
    if (err?.name === "AbortError" || /aborted|AbortError/i.test(String(err?.message || ""))) {
      throw err;
    }
    return [];
  }
}
async function fetchPrReviews(owner, repo, number, fetchImpl, token = null, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const o = String(owner || "").trim();
  const r = String(repo || "").trim();
  const n = Number(number);
  if (!o || !r || !Number.isFinite(n)) return [];
  try {
    const firstUrl = githubRestUrl(
      `/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}/pulls/${n}/reviews?per_page=100`,
      ctx
    );
    const data = await fetchRestCollectionAll(firstUrl, fetchImpl, token, {
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
    if (err?.name === "AbortError" || /aborted|AbortError/i.test(String(err?.message || ""))) {
      throw err;
    }
    return [];
  }
}
var COMMENT_PAGE_SIZE = 50;
async function fetchPrCommentsPage(owner, repo, pullNumber, kind, opts, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const helpers = commentsPageHelpers();
  const perPage = helpers?.clampPerPage?.(opts?.perPage) || Math.min(100, Number(opts?.perPage) || COMMENT_PAGE_SIZE);
  let page = Math.max(1, Number(opts?.page) || 1);
  const since = opts?.since || null;
  const preferNewest = Boolean(opts?.preferNewest) && !since;
  const orderHint = opts?.order || null;
  async function fetchPage(pageNum, listOpts = {}, ctx2 = null) {
    ctx2 = normalizeApiCtx(ctx2);
    const sort = listOpts?.sort != null ? listOpts.sort : kind === "review" ? "created" : void 0;
    const direction = listOpts?.direction != null ? listOpts.direction : kind === "review" ? preferNewest || orderHint === "desc" ? "desc" : "asc" : void 0;
    const url = helpers?.buildCommentsListUrl ? helpers.buildCommentsListUrl(kind, owner, repo, pullNumber, {
      page: pageNum,
      perPage,
      since,
      sort,
      direction
    }) : (() => {
      const base = kind === "review" ? githubRestUrl(`/repos/${owner}/${repo}/pulls/${pullNumber}/comments`, ctx2) : githubRestUrl(`/repos/${owner}/${repo}/issues/${pullNumber}/comments`, ctx2);
      const q = new URLSearchParams({
        per_page: String(perPage),
        page: String(pageNum)
      });
      if (since) q.set("since", since);
      if (sort) q.set("sort", sort);
      if (direction) q.set("direction", direction);
      return `${base}?${q}`;
    })();
    const { data, link } = await apiJsonWithLink(url, fetchImpl, token);
    const raw = Array.isArray(data) ? data : [];
    const items = kind === "review" ? raw.map(mapReviewComment) : raw.map(mapIssueComment);
    if (token && items.length) {
      const ids = items.map((c) => c?.nodeId).filter(Boolean);
      if (ids.length) {
        try {
          const reactionsP = kind === "issue" ? fetchReactableReactionGroups(ids, fetchImpl, token, ctx2) : Promise.resolve(null);
          const [byId, minById] = await Promise.all([
            reactionsP,
            fetchMinimizableStates(ids, fetchImpl, token, ctx2)
          ]);
          if (byId) {
            for (const c of items) {
              if (!c?.nodeId) continue;
              const groups = byId.get(String(c.nodeId));
              if (groups && groups.length) c.reactions = groups;
            }
          }
          applyMinimizableStates(items, minById);
        } catch (err) {
          if (err?.name === "AbortError" || /aborted|AbortError/i.test(String(err?.message || ""))) {
            throw err;
          }
        }
      }
    }
    return { items, raw, link, pageNum };
  }
  if (kind === "issue" && preferNewest && page === 1 && !orderHint) {
    const probe = await fetchPage(1);
    const lastPage = helpers?.parseLinkLastPage && helpers.parseLinkLastPage(probe.link) || null;
    if (lastPage != null && lastPage > 1) {
      const newest = await fetchPage(lastPage);
      const meta3 = helpers?.buildCommentsPageMeta ? helpers.buildCommentsPageMeta(newest.items, {
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
      hasMore: false,
      nextPage: null,
      order: "from-end",
      since,
      loadedCount: probe.items.length
    };
    return { items: probe.items, meta: meta2, kind };
  }
  if (kind === "issue" && (orderHint === "from-end" || opts?.order === "from-end")) {
    const res2 = await fetchPage(page);
    const meta2 = helpers?.buildCommentsPageMeta ? helpers.buildCommentsPageMeta(res2.items, {
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
  });
  const meta = helpers?.buildCommentsPageMeta ? helpers.buildCommentsPageMeta(res.items, {
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
  const o = String(owner || "").trim();
  const r = String(repo || "").trim();
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
      const title = String(p.title || "").trim();
      if (!title) continue;
      projects.push({
        id: String(node.id || `${p.number}:${title}`),
        title,
        number: p.number != null ? Number(p.number) : null,
        url: String(p.url || "").trim()
      });
    }
    const developmentIssues = [];
    for (const node of prNode?.closingIssuesReferences?.nodes || []) {
      const num = Number(node?.number);
      if (!Number.isFinite(num) || num <= 0) continue;
      developmentIssues.push({
        number: num,
        title: String(node?.title || "").trim(),
        url: String(node?.url || "").trim(),
        state: String(node?.state || "").trim().toLowerCase()
      });
    }
    return { projects, developmentIssues };
  } catch (err) {
    if (err?.name === "AbortError" || /aborted|AbortError/i.test(String(err?.message || ""))) {
      throw err;
    }
    return { projects: [], developmentIssues: [] };
  }
}
async function fetchIssueOrPrSummaries(owner, repo, numbers, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const o = String(owner || "").trim();
  const r = String(repo || "").trim();
  const nums = [
    ...new Set(
      (Array.isArray(numbers) ? numbers : []).map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0)
    )
  ].slice(0, 30);
  const out = /* @__PURE__ */ new Map();
  if (!o || !r || !nums.length || !token) return out;
  const fields = nums.map(
    (n, i) => `
      n${i}: issueOrPullRequest(number: ${n}) {
        __typename
        ... on Issue { number title url state }
        ... on PullRequest { number title url state }
      }`
  ).join("\n");
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
        title: String(node.title || "").trim(),
        url: String(node.url || "").trim(),
        state: String(node.state || "").trim().toLowerCase(),
        kind: node.__typename === "PullRequest" ? "pull" : "issue"
      });
    }
  } catch (err) {
    if (err?.name === "AbortError" || /aborted|AbortError/i.test(String(err?.message || ""))) {
      throw err;
    }
  }
  return out;
}
async function fetchConflictFilePaths(owner, repo, baseRef, headSha, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const o = String(owner || "").trim();
  const r = String(repo || "").trim();
  const ref = String(baseRef || "").trim();
  const head = String(headSha || "").trim();
  if (!o || !r || !ref || !head) return [];
  try {
    const baseUrl = githubRestUrl(`/repos/${o}/${r}`, ctx);
    const refJson = await apiJson(
      `${baseUrl}/git/ref/heads/${encodeURIComponent(ref)}`,
      fetchImpl,
      token
    );
    const baseTip = String(refJson?.object?.sha || "").trim();
    if (!baseTip) return [];
    const headVsBase = await apiJson(
      `${baseUrl}/compare/${encodeURIComponent(baseTip)}...${encodeURIComponent(head)}`,
      fetchImpl,
      token
    );
    const mergeBase = String(headVsBase?.merge_base_commit?.sha || "").trim();
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
    ]);
    const onBase = new Set(
      (Array.isArray(baseSide?.files) ? baseSide.files : []).map((f) => String(f?.filename || f?.previous_filename || "").trim()).filter(Boolean)
    );
    const conflicts = [];
    for (const f of Array.isArray(headSide?.files) ? headSide.files : []) {
      const path = String(f?.filename || "").trim();
      if (path && onBase.has(path)) conflicts.push(path);
    }
    return conflicts;
  } catch (err) {
    if (err?.name === "AbortError" || /aborted|AbortError/i.test(String(err?.message || ""))) {
      throw err;
    }
    console.log(
      `[pr-plus] fetchConflictFilePaths: soft-fail ${err?.message || err}`
    );
    return [];
  }
}
async function resolvePrMergeability(pr, base, pullNumber, fetchImpl, token, timings, meta = {}) {
  if (!pr || typeof pr !== "object") return pr;
  let out = pr;
  const apiCtx = normalizeApiCtx(meta?.apiCtx || meta?.ctx);
  const needsCompute = out.mergeable == null || out.mergeable === void 0 || !String(out.mergeable_state || "").trim() || String(out.mergeable_state || "").toLowerCase() === "unknown";
  if (needsCompute) {
    try {
      await sleepMs(350);
      const again = await timedFetch(
        timings,
        "pullMergeable",
        apiJson(`${base}/pulls/${pullNumber}`, fetchImpl, token),
        (p) => `(mergeable=${p?.mergeable} state=${p?.mergeable_state || "?"})`
      );
      if (again && typeof again === "object") {
        out = {
          ...out,
          mergeable: again.mergeable,
          mergeable_state: again.mergeable_state,
          rebaseable: again.rebaseable != null ? again.rebaseable : out.rebaseable,
          merge_commit_sha: again.merge_commit_sha || out.merge_commit_sha
        };
      }
    } catch (err) {
      if (err?.name === "AbortError" || /aborted|AbortError/i.test(String(err?.message || ""))) {
        throw err;
      }
      console.log(
        `[pr-plus] resolvePrMergeability re-fetch: soft-fail ${err?.message || err}`
      );
    }
  }
  const state = String(out.mergeable_state || "").toLowerCase();
  try {
    if (state === "behind") {
      out = { ...out, behind_by: Math.max(1, Number(out.behind_by) || 1) };
    } else if (state === "clean" || state === "unstable" || state === "has_hooks") {
      out = { ...out, behind_by: 0 };
    } else {
      const baseOwner = out.base?.repo?.owner?.login || String(meta.owner || "").trim() || "";
      const baseRepo = out.base?.repo?.name || String(meta.repo || "").trim() || "";
      const baseRef = String(out.base?.ref || "").trim();
      const headSha = String(out.head?.sha || "").trim();
      if (baseOwner && baseRepo && baseRef && headSha) {
        const cmpUrl = githubRestUrl(
          `/repos/${encodeURIComponent(baseOwner)}/${encodeURIComponent(baseRepo)}/compare/${encodeURIComponent(baseRef)}...${encodeURIComponent(headSha)}`,
          apiCtx
        );
        const cmp = await timedFetch(
          timings,
          "branchBehind",
          apiJson(cmpUrl, fetchImpl, token),
          (c) => `(behind=${c?.behind_by ?? "?"} status=${c?.status || "?"})`
        );
        if (cmp && typeof cmp === "object" && cmp.behind_by != null) {
          out = { ...out, behind_by: Number(cmp.behind_by) || 0 };
        }
      }
    }
  } catch (err) {
    if (err?.name === "AbortError" || /aborted|AbortError/i.test(String(err?.message || ""))) {
      throw err;
    }
    console.log(
      `[pr-plus] resolvePrMergeability behind_by: soft-fail ${err?.message || err}`
    );
  }
  const isDirty = state === "dirty" || out.mergeable === false && state !== "blocked" && state !== "clean";
  if (isDirty) {
    const baseOwner = out.base?.repo?.owner?.login || String(meta.owner || "").trim() || null;
    const baseRepo = out.base?.repo?.name || String(meta.repo || "").trim() || null;
    const conflictFiles = await timedFetch(
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
  } else {
    out = { ...out, _conflictFiles: [] };
  }
  return out;
}
async function fetchCompareFiles(owner, repo, base, head, fetchImpl, token = null, options = {}) {
  const ctx = normalizeApiCtx(options?.ctx);
  const o = String(owner || "").trim();
  const r = String(repo || "").trim();
  const b = String(base || "").trim();
  const h = String(head || "").trim();
  if (!o || !r || !b || !h) {
    throw new Error("owner, repo, base, and head are required for compare");
  }
  const gitattributesText = String(options.gitattributesText || "");
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
    truncated: Boolean(data?.files && data.files.length >= 300)
  };
}

// src/fetch/detail-sides-files.ts
async function fetchPrCommits(owner, repo, number, fetchImpl, token = null, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const o = String(owner || "").trim();
  const r = String(repo || "").trim();
  const n = Number(number);
  if (!o || !r || !Number.isFinite(n)) {
    throw new Error("owner, repo, and number are required for commits");
  }
  const url = githubRestUrl(
    `/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}/pulls/${n}/commits?per_page=100`,
    ctx
  );
  try {
    const data = await apiJson(url, fetchImpl, token);
    return (Array.isArray(data) ? data : []).map(mapPrCommitRow).filter((c) => c.sha);
  } catch (err) {
    if (err?.name === "AbortError" || /aborted|AbortError/i.test(String(err?.message || ""))) {
      throw err;
    }
    return [];
  }
}
async function fetchAllPrCommits(owner, repo, number, fetchImpl, token = null, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const o = String(owner || "").trim();
  const r = String(repo || "").trim();
  const n = Number(number);
  if (!o || !r || !Number.isFinite(n)) {
    throw new Error("owner, repo, and number are required for commits");
  }
  const first = githubRestUrl(
    `/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}/pulls/${n}/commits?per_page=100`,
    ctx
  );
  const raw = await fetchRestCollectionAll(first, fetchImpl, token);
  return raw.map(mapPrCommitRow).filter((c) => c.sha);
}
async function fetchPrChecks(owner, repo, headSha, fetchImpl, token = null, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const o = String(owner || "").trim();
  const r = String(repo || "").trim();
  const sha = String(headSha || "").trim();
  const empty = { state: "unknown", totalCount: 0, statuses: [], checkRuns: [] };
  if (!o || !r || !sha) return empty;
  const base = githubRestUrl(`/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}`, ctx);
  let checks = { ...empty };
  try {
    const status = await apiJson(`${base}/commits/${encodeURIComponent(sha)}/status`, fetchImpl, token);
    const statusList = Array.isArray(status?.statuses) ? status.statuses : [];
    const emptyCombined = !statusList.length && !(Number(status?.total_count) > 0);
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
    if (err?.name === "AbortError" || /aborted|AbortError/i.test(String(err?.message || ""))) {
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
      checks.checkRuns = list.map((r2) => ({
        id: r2.id,
        name: r2.name || "",
        status: r2.status || "",
        conclusion: r2.conclusion || "",
        htmlUrl: r2.html_url || "",
        startedAt: r2.started_at || "",
        completedAt: r2.completed_at || "",
        appSlug: r2.app?.slug || "",
        appName: r2.app?.name || ""
      }));
    }
  } catch (err) {
    if (err?.name === "AbortError" || /aborted|AbortError/i.test(String(err?.message || ""))) {
      throw err;
    }
  }
  const normalize = typeof globalThis !== "undefined" && globalThis.PRModalChecks?.normalizeChecks || null;
  if (typeof normalize === "function") {
    return normalize(checks);
  }
  const byCtx = /* @__PURE__ */ new Map();
  for (const s of checks.statuses || []) {
    const k = String(s.context || "").toLowerCase();
    if (!k) continue;
    const prev = byCtx.get(k);
    const t = Date.parse(s.updatedAt || s.createdAt || "") || 0;
    const pt = prev ? Date.parse(prev.updatedAt || prev.createdAt || "") || 0 : -1;
    if (!prev || t >= pt) byCtx.set(k, s);
  }
  const byName = /* @__PURE__ */ new Map();
  for (const r2 of checks.checkRuns || []) {
    const k = String(r2.name || "").toLowerCase();
    if (!k) continue;
    const prev = byName.get(k);
    const t = Date.parse(r2.completedAt || r2.startedAt || "") || Number(r2.id) || 0;
    const pt = prev ? Date.parse(prev.completedAt || prev.startedAt || "") || Number(prev.id) || 0 : -1;
    if (!prev || t >= pt) byName.set(k, r2);
  }
  checks.statuses = [...byCtx.values()];
  checks.checkRuns = [...byName.values()];
  checks.totalCount = checks.statuses.length + checks.checkRuns.length;
  return checks;
}
async function fetchPrDevelopment(owner, repo, number, fetchImpl, token = null, opts = {}) {
  const ctx = normalizeApiCtx(opts?.ctx);
  const o = String(owner || "").trim();
  const r = String(repo || "").trim();
  const n = Number(number);
  const body = String(opts.body || "");
  let linkedIssues = [];
  try {
    let editApi = typeof globalThis !== "undefined" ? globalThis.PRModalPrEditApi : null;
    if (!editApi && typeof __require === "function") {
      try {
        editApi = __require("./modal/pure/pr-edit-api.js");
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
    if (side && typeof side === "object") {
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
        if (fromGql.length) {
          const set = /* @__PURE__ */ new Set([...linkedIssues, ...fromGql]);
          linkedIssues = [...set].sort((a, b) => a - b);
        }
      }
      if (Array.isArray(side.projects)) projects = side.projects;
    }
  } catch (err) {
    if (err?.name === "AbortError" || /aborted|AbortError/i.test(String(err?.message || ""))) {
      throw err;
    }
  }
  {
    const byNum = /* @__PURE__ */ new Map();
    for (const item of developmentIssues) {
      const num = Number(item?.number);
      if (!Number.isFinite(num) || num <= 0) continue;
      byNum.set(num, {
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
      if (!Number.isFinite(num) || num <= 0 || byNum.has(num)) continue;
      byNum.set(num, {
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
            kind: s.kind || item.kind || ""
          };
        });
      }
    } catch (err) {
      if (err?.name === "AbortError" || /aborted|AbortError/i.test(String(err?.message || ""))) {
        throw err;
      }
    }
  }
  return {
    linkedIssues,
    developmentIssues,
    projects
  };
}
async function fetchAllPrFiles(owner, repo, number, fetchImpl, token = null, options = {}) {
  const ctx = normalizeApiCtx(options?.ctx);
  const o = String(owner || "").trim();
  const r = String(repo || "").trim();
  const n = Number(number);
  if (!o || !r || !Number.isFinite(n)) {
    throw new Error("owner, repo, and number are required for files");
  }
  const first = githubRestUrl(
    `/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}/pulls/${n}/files?per_page=100`,
    ctx
  );
  const raw = await fetchRestCollectionAll(first, fetchImpl, token);
  return mapAndAnnotateFiles(raw, options.gitattributesText || "");
}
async function fetchPrFiles(owner, repo, number, fetchImpl, token = null, options = {}) {
  const ctx = normalizeApiCtx(options?.ctx);
  const o = String(owner || "").trim();
  const r = String(repo || "").trim();
  const n = Number(number);
  if (!o || !r || !Number.isFinite(n)) {
    throw new Error("owner, repo, and number are required for files");
  }
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
    if (err?.name === "AbortError" || /aborted|AbortError/i.test(String(err?.message || ""))) {
      throw err;
    }
    raw = [];
  }
  let gitattributesText = String(options.gitattributesText || "");
  if (!gitattributesText) {
    try {
      const ref = String(options.headSha || options.ref || "").trim() || "HEAD";
      const attr = await apiJson(
        `${base}/contents/.gitattributes?ref=${encodeURIComponent(ref)}`,
        fetchImpl,
        token
      );
      if (attr?.content && attr.encoding === "base64") {
        gitattributesText = decodeBase64Utf8(
          String(attr.content).replace(/\n/g, "")
        );
      } else if (typeof attr?.content === "string") {
        gitattributesText = attr.content;
      }
    } catch (err) {
      if (err?.name === "AbortError" || /aborted|AbortError/i.test(String(err?.message || ""))) {
        throw err;
      }
      gitattributesText = "";
    }
  }
  return {
    files: mapAndAnnotateFiles(raw, gitattributesText),
    gitattributesText
  };
}

// src/fetch/pending-review.ts
function mergePendingReviewComments(published, pendingList) {
  const list = Array.isArray(published) ? published.slice() : [];
  const seen = new Set(list.map((c) => c && c.id != null ? String(c.id) : "").filter(Boolean));
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
        diffHunk: host.diffHunk || p.diffHunk || "",
        resolved: Boolean(host.resolved || p.resolved)
      };
      continue;
    }
    seen.add(key);
    list.push(p);
  }
  return list;
}
function pickViewerPendingFromReviews(reviews, login) {
  const list = Array.isArray(reviews) ? reviews : [];
  const pending = list.filter(
    (r2) => r2 && String(r2.state || "").toUpperCase() === "PENDING"
  );
  if (!pending.length) return null;
  let mine = pending;
  if (login) {
    const byLogin = pending.filter(
      (r2) => String(r2.user?.login || r2.author?.login || "").toLowerCase() === String(login).toLowerCase()
    );
    if (byLogin.length) mine = byLogin;
  }
  const r = mine[mine.length - 1];
  return {
    id: Number(r.id),
    node_id: r.node_id || null
  };
}
async function fetchViewerPendingReviewBundle(owner, repo, pullNumber, fetchImpl, token, preloaded = null, ctx = null) {
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
    const comments = (Array.isArray(raw) ? raw : []).map(
      (c) => mapReviewComment(c, { pending: true, pendingReviewId: pending.id })
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
  if (opts?.commitId) body.commit_id = String(opts.commitId);
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/pulls/${pullNumber}/reviews`, ctx),
    fetchImpl,
    token,
    { method: "POST", body: Object.keys(body).length ? body : {} }
  );
}
async function submitPendingPullReview(owner, repo, pullNumber, reviewId, { event = "COMMENT", body = "" } = {}, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const id = Number(reviewId);
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error("Invalid pending review id");
  }
  const ev = String(event || "COMMENT").toUpperCase();
  if (!["COMMENT", "APPROVE", "REQUEST_CHANGES"].includes(ev)) {
    throw new Error("Invalid review event");
  }
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
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error("Invalid pending review id");
  }
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/pulls/${pullNumber}/reviews/${id}`, ctx),
    fetchImpl,
    token,
    { method: "DELETE" }
  );
}
async function postReviewCommentViaPendingGraphql(pendingReviewNodeId, { body, path, line, side = "RIGHT", startLine, startSide, subjectType = "line" }, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const isFile = String(subjectType || "").toLowerCase() === "file";
  const hasRange = !isFile && startLine != null && Number.isFinite(Number(startLine)) && Number(startLine) !== Number(line);
  const variables = {
    review: String(pendingReviewNodeId),
    body: String(body || "").trim(),
    path: String(path || "")
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
    variables.side = String(side || "RIGHT").toUpperCase() === "LEFT" ? "LEFT" : "RIGHT";
    variables.startLine = Number(startLine);
    variables.startSide = String(startSide || side || "RIGHT").toUpperCase() === "LEFT" ? "LEFT" : "RIGHT";
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
    variables.side = String(side || "RIGHT").toUpperCase() === "LEFT" ? "LEFT" : "RIGHT";
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
      isFile ? `Could not add pending file comment on ${path}.` : `Could not add pending comment on ${path}:${line} (${side || "RIGHT"}). The line may be outside the diff or on the wrong side.`
    );
  }
  const threadNodeId = thread?.id || null;
  const rest = mapGraphqlReviewCommentToRest(node, {
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
    pending: true,
    pendingReviewId: node.pullRequestReview?.databaseId ?? null,
    /** PRR_… used for attach — store on viewerPendingReview for next Add comment */
    pendingReviewNodeId: String(pendingReviewNodeId || ""),
    threadNodeId
  };
}
async function resolveViewerPendingReviewViaGraphql(owner, repo, pullNumber, fetchImpl, token, ctx = null, opts = {}) {
  ctx = normalizeApiCtx(ctx);
  if (!token) return null;
  const n = Number(pullNumber);
  if (!Number.isFinite(n) || n <= 0) return null;
  try {
    const data = await apiGraphql(
      `query($owner:String!,$name:String!,$number:Int!){
        repository(owner:$owner,name:$name){
          pullRequest(number:$number){
            reviews(last:50){
              nodes{
                id
                databaseId
                state
                author { login }
              }
            }
          }
        }
      }`,
      {
        owner: String(owner || ""),
        name: String(repo || ""),
        number: n
      },
      fetchImpl,
      token,
      ctx
    );
    const nodes = (data?.repository?.pullRequest?.reviews?.nodes || []).filter(
      (r) => r && r.id && String(r.state || "").toUpperCase() === "PENDING"
    );
    if (!Array.isArray(nodes) || !nodes.length) return null;
    const login = opts.login != null ? String(opts.login).toLowerCase() : "";
    const preferId = opts.preferDatabaseId != null && Number.isFinite(Number(opts.preferDatabaseId)) ? Number(opts.preferDatabaseId) : null;
    let mine = nodes.filter((r) => r && r.id);
    if (login) {
      const byLogin = mine.filter(
        (r) => String(r.author?.login || "").toLowerCase() === login
      );
      if (byLogin.length) mine = byLogin;
    }
    if (preferId != null) {
      const hit = mine.find((r) => Number(r.databaseId) === preferId);
      if (hit?.id) {
        return { id: Number(hit.databaseId) || preferId, node_id: String(hit.id) };
      }
    }
    const last = mine[mine.length - 1];
    if (!last?.id) return null;
    const id = Number(last.databaseId);
    if (!Number.isFinite(id) || id <= 0) return null;
    return { id, node_id: String(last.id) };
  } catch {
    return null;
  }
}
async function ensureViewerPendingReview(owner, repo, pullNumber, { commitId = null, createIfMissing = false } = {}, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const hydrateNodeId = async (pending2) => {
    if (!pending2?.id) return null;
    try {
      const full = await apiJson(
        githubRestUrl(`/repos/${owner}/${repo}/pulls/${pullNumber}/reviews/${pending2.id}`, ctx),
        fetchImpl,
        token
      );
      if (!full || String(full.state || "").toUpperCase() !== "PENDING") {
        if (pending2?.node_id) {
          return { id: Number(pending2.id), node_id: pending2.node_id };
        }
        return null;
      }
      return {
        id: Number(pending2.id),
        node_id: full.node_id || pending2.node_id || null
      };
    } catch (err) {
      if (err?.status === 404) {
        if (pending2?.node_id) {
          return { id: Number(pending2.id), node_id: pending2.node_id };
        }
        return null;
      }
      if (pending2?.node_id) {
        return { id: Number(pending2.id), node_id: pending2.node_id };
      }
      if (pending2?.id) {
        return { id: Number(pending2.id), node_id: null };
      }
      return null;
    }
  };
  const withGraphqlNode = async (pending2, opts = {}) => {
    if (pending2?.node_id) return pending2;
    const force = Boolean(opts.forceDiscover);
    if (!pending2?.id && createIfMissing && !force) return pending2;
    const login = await fetchViewerLogin(fetchImpl, token).catch(() => null);
    const viaGql = await resolveViewerPendingReviewViaGraphql(
      owner,
      repo,
      pullNumber,
      fetchImpl,
      token,
      ctx,
      {
        login,
        preferDatabaseId: pending2?.id ?? null
      }
    );
    if (viaGql?.node_id) return viaGql;
    return pending2;
  };
  let pending = await findViewerPendingReview(
    owner,
    repo,
    pullNumber,
    fetchImpl,
    token,
    ctx
  );
  pending = await hydrateNodeId(pending);
  pending = await withGraphqlNode(pending);
  if (pending?.node_id) return pending;
  if (!createIfMissing) {
    pending = await withGraphqlNode(pending, { forceDiscover: true });
    return pending;
  }
  try {
    const created = await createPendingPullReview(
      owner,
      repo,
      pullNumber,
      { commitId },
      fetchImpl,
      token,
      ctx
    );
    const createdRow = {
      id: Number(created?.id),
      node_id: created?.node_id || null
    };
    if (createdRow.node_id) return createdRow;
    pending = await hydrateNodeId(createdRow);
    pending = await withGraphqlNode(pending || createdRow, {
      forceDiscover: true
    });
    return pending;
  } catch (err) {
    const msg = String(err?.message || err || "");
    if (err?.status === 422 || /one pending review/i.test(msg) || /Unprocessable Entity/i.test(msg)) {
      for (let attempt = 0; attempt < 5; attempt++) {
        if (attempt > 0) {
          await new Promise((r) => setTimeout(r, 250 * attempt));
        }
        pending = await findViewerPendingReview(
          owner,
          repo,
          pullNumber,
          fetchImpl,
          token,
          ctx
        );
        pending = await hydrateNodeId(pending);
        pending = await withGraphqlNode(pending, { forceDiscover: true });
        if (pending?.node_id) return pending;
      }
    }
    throw err;
  }
}
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
      fetchViewerLogin(fetchImpl, token).catch(() => null)
    ]);
    return pickViewerPendingFromReviews(reviews, login);
  } catch {
    return null;
  }
}
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
  if (!c) throw new Error("GraphQL thread reply returned no comment");
  return mapGraphqlReviewCommentToRest(c, fallback);
}
async function replyViaPendingReviewGraphql(pendingReviewNodeId, parentCommentNodeId, body, fetchImpl, token, fallback = {}, ctx = null) {
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
      inReplyTo: String(parentCommentNodeId)
    },
    fetchImpl,
    token
  );
  const c = data?.addPullRequestReviewComment?.comment;
  if (!c) throw new Error("GraphQL pending-review reply returned no comment");
  return mapGraphqlReviewCommentToRest(c, fallback);
}
async function resolveParentCommentNodeId(owner, repo, parentId, fetchImpl, token, knownNodeId, pullNumber = null, ctx = null) {
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
  }
  return null;
}

// src/fetch/mutations-comments.ts
async function postIssueComment(owner, repo, issueNumber, body, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/issues/${issueNumber}/comments`, ctx),
    fetchImpl,
    token,
    { method: "POST", body: { body } }
  );
}
async function submitPullReview(owner, repo, pullNumber, { event, body = "", commitId, comments }, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const payload = { event, body: body || "" };
  if (commitId) payload.commit_id = commitId;
  if (Array.isArray(comments) && comments.length) {
    payload.comments = comments.map((c) => {
      const row = {
        path: c.path,
        body: c.body,
        line: c.line,
        side: c.side || "RIGHT"
      };
      if (c.start_line != null || c.startLine != null) {
        const sl = c.start_line != null ? c.start_line : c.startLine;
        if (Number(sl) !== Number(c.line)) {
          row.start_line = Number(sl);
          row.start_side = c.start_side || c.startSide || c.side || "RIGHT";
        }
      }
      return row;
    });
  }
  return apiSend(
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
  commitId = null,
  startLine = null,
  startSide = null,
  asPending = false,
  subjectType = "line",
  /** Optional PRR_… from prior Start review (viewerPendingReview.nodeId) */
  pendingReviewNodeId = null,
  pendingReviewId = null
}, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const text = String(body || "").trim();
  if (!text) throw new Error("Comment body is required");
  if (!path) throw new Error("path is required");
  const isFile = String(subjectType || "").toLowerCase() === "file";
  if (!isFile && line == null) throw new Error("path and line are required");
  const knownNode = String(pendingReviewNodeId || "").trim();
  if (knownNode && (asPending || knownNode)) {
    try {
      const raw = await postReviewCommentViaPendingGraphql(
        knownNode,
        {
          body: text,
          path,
          line: isFile ? null : line,
          side,
          startLine: isFile ? null : startLine,
          startSide: isFile ? null : startSide,
          subjectType: isFile ? "file" : "line"
        },
        fetchImpl,
        token,
        ctx
      );
      return {
        ...raw,
        pending: true,
        pendingReviewId: raw.pendingReviewId || pendingReviewId || null,
        pendingReviewNodeId: knownNode
      };
    } catch (knownErr) {
      const km = String(knownErr?.message || knownErr || "");
      if (!/Could not resolve to a node|global id|NOT_FOUND|Could not find/i.test(
        km
      )) {
        throw knownErr;
      }
    }
  }
  let pending = await ensureViewerPendingReview(
    owner,
    repo,
    pullNumber,
    { commitId: commitId || null, createIfMissing: false },
    fetchImpl,
    token,
    ctx
  );
  if (!pending?.node_id && asPending) {
    try {
      pending = await ensureViewerPendingReview(
        owner,
        repo,
        pullNumber,
        { commitId: commitId || null, createIfMissing: true },
        fetchImpl,
        token,
        ctx
      );
    } catch (ensureErr) {
      const em = String(ensureErr?.message || ensureErr || "");
      if (ensureErr?.status === 422 || /one pending review/i.test(em) || /Unprocessable Entity/i.test(em)) {
        for (let i = 0; i < 6 && !pending?.node_id; i++) {
          if (i > 0) {
            await new Promise((r) => setTimeout(r, 300 * i));
          }
          pending = await ensureViewerPendingReview(
            owner,
            repo,
            pullNumber,
            { commitId: commitId || null, createIfMissing: false },
            fetchImpl,
            token,
            ctx
          );
        }
        if (!pending?.node_id) {
          pending = null;
        }
      } else {
        throw ensureErr;
      }
    }
  }
  const gqlFields = {
    body: text,
    path,
    line: isFile ? null : line,
    side,
    startLine: isFile ? null : startLine,
    startSide: isFile ? null : startSide,
    subjectType: isFile ? "file" : "line"
  };
  async function attachViaGraphql(pendingRow) {
    if (!pendingRow?.node_id) return null;
    const nodeId = String(pendingRow.node_id);
    const raw = await postReviewCommentViaPendingGraphql(
      nodeId,
      gqlFields,
      fetchImpl,
      token,
      ctx
    );
    return {
      ...raw,
      pending: true,
      pendingReviewId: raw.pendingReviewId || pendingRow.id || null,
      // Always echo PRR_… so App can latch for the next Add comment
      pendingReviewNodeId: String(raw.pendingReviewNodeId || nodeId || "").trim() || nodeId
    };
  }
  async function recoverAttachFromExistingPending() {
    let row = await ensureViewerPendingReview(
      owner,
      repo,
      pullNumber,
      { commitId: commitId || null, createIfMissing: false },
      fetchImpl,
      token,
      ctx
    );
    if (!row?.node_id && pendingReviewId) {
      row = await ensureViewerPendingReview(
        owner,
        repo,
        pullNumber,
        { commitId: commitId || null, createIfMissing: false },
        fetchImpl,
        token,
        ctx
      );
    }
    if (row?.node_id) {
      try {
        return await attachViaGraphql(row);
      } catch {
      }
    }
    return null;
  }
  if (pending?.node_id) {
    try {
      const attached = await attachViaGraphql(pending);
      if (attached) return attached;
    } catch (err) {
      const msg = String(err?.message || err || "");
      const reResolve = asPending && (/Could not resolve to a node|global id|NOT_FOUND|Could not find/i.test(
        msg
      ) || /one pending review/i.test(msg) || err?.status === 422);
      if (reResolve) {
        const recovered = await recoverAttachFromExistingPending();
        if (recovered) return recovered;
        pending = await ensureViewerPendingReview(
          owner,
          repo,
          pullNumber,
          { commitId: commitId || null, createIfMissing: false },
          fetchImpl,
          token,
          ctx
        );
        if (!pending?.node_id) {
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
            if (createErr?.status === 422 || /one pending review/i.test(String(createErr?.message || ""))) {
              const recovered2 = await recoverAttachFromExistingPending();
              if (recovered2) return recovered2;
            } else {
              throw createErr;
            }
          }
          const retry2 = await attachViaGraphql(pending);
          if (retry2) return retry2;
        }
      }
      throw err;
    }
  }
  if (asPending) {
    const lastTry = await recoverAttachFromExistingPending();
    if (lastTry) return lastTry;
    try {
      pending = await ensureViewerPendingReview(
        owner,
        repo,
        pullNumber,
        { commitId: commitId || null, createIfMissing: true },
        fetchImpl,
        token,
        ctx
      );
      const afterCreate = await attachViaGraphql(pending);
      if (afterCreate) return afterCreate;
    } catch (createLast) {
      if (createLast?.status === 422 || /one pending review/i.test(String(createLast?.message || ""))) {
        const recovered = await recoverAttachFromExistingPending();
        if (recovered) return recovered;
      }
      throw createLast;
    }
    throw new Error(
      "Could not start or find a pending review. Try Discard any leftover pending review, then retry."
    );
  }
  const payload = isFile ? { body: text, path, subject_type: "file" } : { body: text, path, line, side };
  if (commitId) payload.commit_id = commitId;
  if (!isFile && startLine != null && Number(startLine) !== Number(line)) {
    payload.start_line = Number(startLine);
    payload.start_side = startSide || side || "RIGHT";
  }
  try {
    return await apiSend(
      githubRestUrl(`/repos/${owner}/${repo}/pulls/${pullNumber}/comments`, ctx),
      fetchImpl,
      token,
      { method: "POST", body: payload }
    );
  } catch (err) {
    const msg = String(err?.message || err || "");
    if (err?.status === 422 || /one pending review/i.test(msg) || /Unprocessable Entity/i.test(msg)) {
      pending = await ensureViewerPendingReview(
        owner,
        repo,
        pullNumber,
        { commitId: commitId || null, createIfMissing: false },
        fetchImpl,
        token,
        ctx
      );
      const recovered = await attachViaGraphql(pending);
      if (recovered) return recovered;
    }
    throw err;
  }
}
async function replyToReviewComment(owner, repo, pullNumber, commentId, body, fetchImpl, token, opts = {}) {
  const ctx = normalizeApiCtx(opts?.ctx);
  const text = String(body || "").trim();
  if (!text) throw new Error("Reply body is required");
  const parentId = Number(commentId);
  if (!Number.isFinite(parentId) || parentId <= 0) {
    throw new Error("Invalid review comment id for reply");
  }
  const n = Number(pullNumber);
  const mode = opts?.mode === "pending" ? "pending" : "comment";
  const threadNodeId = opts?.threadNodeId || null;
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
        createIfMissing: Boolean(createIfMissing)
      },
      fetchImpl,
      token
    );
    if (!pending?.node_id && !threadNodeId) return null;
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
          pendingReviewId: raw.pendingReviewId || pending?.id || null
        };
      } catch {
      }
    }
    if (!pending?.node_id) return null;
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
        "Cannot reply while a pending review exists (missing parent comment node id)."
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
      const msg = String(err?.message || err || "");
      if (!/Could not resolve to a node|global id|NOT_FOUND|Could not find/i.test(msg)) {
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
          node_id: created?.node_id || null
        };
      } catch (createErr) {
        if (createErr?.status === 422 || /one pending review/i.test(String(createErr?.message || ""))) {
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
  if (mode === "pending") {
    const attached = await attachReplyToPending({ createIfMissing: true });
    if (attached) return attached;
    throw new Error(
      "Could not start or find a pending review for this reply. Try Discard any leftover pending review, then retry."
    );
  }
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
    }
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
      const attached = await attachReplyToPending({ createIfMissing: false });
      if (attached) return attached;
    }
    throw err;
  }
}
async function resolveReviewThread(threadNodeId, resolved, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  if (!threadNodeId) throw new Error("threadNodeId required to resolve review thread");
  const mutation = resolved ? `mutation($id:ID!){ resolveReviewThread(input:{threadId:$id}){ thread { id isResolved } } }` : `mutation($id:ID!){ unresolveReviewThread(input:{threadId:$id}){ thread { id isResolved } } }`;
  return apiGraphql(
    mutation,
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
  ctx = normalizeApiCtx(ctx);
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/pulls/comments/${commentId}`, ctx),
    fetchImpl,
    token,
    { method: "DELETE" }
  );
}
async function deleteIssueComment(owner, repo, commentId, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/issues/comments/${commentId}`, ctx),
    fetchImpl,
    token,
    { method: "DELETE" }
  );
}
var MINIMIZE_CLASSIFIERS = [
  "SPAM",
  "ABUSE",
  "OFF_TOPIC",
  "OUTDATED",
  "DUPLICATE",
  "RESOLVED"
];
async function minimizeComment(subjectNodeId, classifier = "OFF_TOPIC", fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const id = String(subjectNodeId || "").trim();
  if (!id) throw new Error("subjectNodeId required to minimize comment");
  let c = String(classifier || "OFF_TOPIC").trim().toUpperCase().replace(/[-\s]+/g, "_");
  if (!MINIMIZE_CLASSIFIERS.includes(c)) {
    c = "OFF_TOPIC";
  }
  const mutation = `mutation($input: MinimizeCommentInput!) {
    minimizeComment(input: $input) {
      minimizedComment {
        ... on Minimizable {
          isMinimized
          minimizedReason
          viewerCanMinimize
        }
      }
    }
  }`;
  return apiGraphql(
    mutation,
    { input: { subjectId: id, classifier: c } },
    fetchImpl,
    token,
    ctx
  );
}
async function unminimizeComment(subjectNodeId, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const id = String(subjectNodeId || "").trim();
  if (!id) throw new Error("subjectNodeId required to unminimize comment");
  const mutation = `mutation($input: UnminimizeCommentInput!) {
    unminimizeComment(input: $input) {
      unminimizedComment {
        ... on Minimizable {
          isMinimized
          minimizedReason
          viewerCanMinimize
        }
      }
    }
  }`;
  return apiGraphql(
    mutation,
    { input: { subjectId: id } },
    fetchImpl,
    token,
    ctx
  );
}

// src/fetch/mutations-meta.ts
async function updatePullRequest(owner, repo, pullNumber, fields, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const body = {};
  if (fields?.title != null) body.title = String(fields.title);
  if (fields?.body != null) body.body = String(fields.body);
  if (fields?.base != null) body.base = String(fields.base);
  if (fields?.state != null) body.state = fields.state === "closed" ? "closed" : "open";
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/pulls/${pullNumber}`, ctx),
    fetchImpl,
    token,
    { method: "PATCH", body }
  );
}
async function editIssueComment(owner, repo, commentId, body, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/issues/comments/${commentId}`, ctx),
    fetchImpl,
    token,
    { method: "PATCH", body: { body: String(body || "") } }
  );
}
async function editReviewComment(owner, repo, commentId, body, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/pulls/comments/${commentId}`, ctx),
    fetchImpl,
    token,
    { method: "PATCH", body: { body: String(body || "") } }
  );
}
async function requestReviewers(owner, repo, pullNumber, { reviewers = [], teamReviewers = [] }, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  return apiSend(
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
  ctx = normalizeApiCtx(ctx);
  return apiSend(
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
  ctx = normalizeApiCtx(ctx);
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/issues/${issueNumber}/assignees`, ctx),
    fetchImpl,
    token,
    { method: "POST", body: { assignees: assignees || [] } }
  );
}
async function removeAssignees(owner, repo, issueNumber, assignees, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/issues/${issueNumber}/assignees`, ctx),
    fetchImpl,
    token,
    { method: "DELETE", body: { assignees: assignees || [] } }
  );
}
async function setIssueLabels(owner, repo, issueNumber, labels, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/issues/${issueNumber}/labels`, ctx),
    fetchImpl,
    token,
    { method: "PUT", body: { labels: labels || [] } }
  );
}
async function fetchRepoLabels(owner, repo, fetchImpl, token = null, opts = {}) {
  const ctx = normalizeApiCtx(opts?.ctx);
  const perPage = 100;
  const maxPages = Math.max(1, Math.min(10, Number(opts.maxPages) || 5));
  const out = [];
  for (let page = 1; page <= maxPages; page++) {
    const url = githubRestUrl(
      `/repos/${owner}/${repo}/labels?per_page=${perPage}&page=${page}`,
      ctx
    );
    const batch = await apiJson(url, fetchImpl, token);
    if (!Array.isArray(batch) || !batch.length) break;
    for (const l of batch) {
      const name = String(l?.name || "").trim();
      if (!name) continue;
      out.push({
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
  ];
  const s = String(name || "");
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
  if (description != null) body.description = String(description);
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
  const ctx = normalizeApiCtx(opts?.ctx);
  const perPage = 100;
  const maxPages = Math.max(1, Math.min(10, Number(opts.maxPages) || 5));
  const state = opts.state || "all";
  const out = [];
  for (let page = 1; page <= maxPages; page++) {
    const url = githubRestUrl(
      `/repos/${owner}/${repo}/milestones?state=${encodeURIComponent(state)}&per_page=${perPage}&page=${page}&sort=due_on&direction=desc`,
      ctx
    );
    const batch = await apiJson(url, fetchImpl, token);
    if (!Array.isArray(batch) || !batch.length) break;
    for (const m of batch) {
      const number = Number(m?.number);
      if (!Number.isFinite(number) || number <= 0) continue;
      out.push({
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
  if (description != null) body.description = String(description);
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
  const ctx = normalizeApiCtx(opts?.ctx);
  const perPage = 100;
  const maxPages = Math.max(1, Math.min(20, Number(opts.maxPages) || 10));
  const out = [];
  for (let page = 1; page <= maxPages; page++) {
    const url = githubRestUrl(
      `/repos/${owner}/${repo}/tags?per_page=${perPage}&page=${page}`,
      ctx
    );
    const batch = await apiJson(url, fetchImpl, token);
    if (!Array.isArray(batch) || !batch.length) break;
    for (const t of batch) {
      const name = String(t?.name || "").trim();
      const sha = String(t?.commit?.sha || t?.sha || "").trim();
      if (!name) continue;
      out.push({
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
  if (!want.size) return [];
  const tags = await fetchRepoTags(owner, repo, fetchImpl, token, opts);
  return tags.filter((t) => want.has(String(t.sha || "").toLowerCase()));
}
async function mergePullRequest(owner, repo, pullNumber, {
  mergeMethod = "merge",
  commitTitle,
  commitMessage
} = {}, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const body = { merge_method: mergeMethod };
  if (commitTitle != null) body.commit_title = String(commitTitle);
  if (commitMessage != null) body.commit_message = String(commitMessage);
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/pulls/${pullNumber}/merge`, ctx),
    fetchImpl,
    token,
    { method: "PUT", body }
  );
}
async function updatePullBranch(owner, repo, pullNumber, { expectedHeadSha } = {}, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const body = {};
  if (expectedHeadSha) body.expected_head_sha = String(expectedHeadSha);
  return apiSend(
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
  ctx = normalizeApiCtx(ctx);
  return apiSend(
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
  if (!id) {
    const pr = await apiJson(
      githubRestUrl(`/repos/${owner}/${repo}/pulls/${pullNumber}`, ctx),
      fetchImpl,
      token
    );
    id = pr?.node_id;
  }
  if (!id) throw new Error("PR node_id unavailable for draft stage change");
  let buildFn = null;
  try {
    let mod = typeof globalThis !== "undefined" ? globalThis.PRModalPrEditApi : null;
    if (!mod && typeof __require === "function") {
      try {
        mod = __require("./modal/pure/pr-edit-api.js");
      } catch {
        mod = null;
      }
    }
    buildFn = mod?.buildDraftStageGraphql;
  } catch {
    buildFn = null;
  }
  const gql = buildFn ? buildFn(stage === "ready" ? "ready" : "draft", id) : stage === "ready" ? {
    query: `mutation($id:ID!){markPullRequestReadyForReview(input:{pullRequestId:$id}){pullRequest{id isDraft}}}`,
    variables: { id }
  } : {
    query: `mutation($id:ID!){convertPullRequestToDraft(input:{pullRequestId:$id}){pullRequest{id isDraft}}}`,
    variables: { id }
  };
  const data = await apiGraphql(gql.query, gql.variables, fetchImpl, token, ctx);
  let parseFn = null;
  try {
    let mod = typeof globalThis !== "undefined" ? globalThis.PRModalPrEditApi : null;
    if (!mod && typeof __require === "function") {
      try {
        mod = __require("./modal/pure/pr-edit-api.js");
      } catch {
        mod = null;
      }
    }
    parseFn = mod?.draftFromStageGraphqlData;
  } catch {
    parseFn = null;
  }
  let draft = null;
  if (typeof parseFn === "function") {
    draft = parseFn(data);
  } else if (data && typeof data === "object") {
    const pr = data.markPullRequestReadyForReview?.pullRequest || data.convertPullRequestToDraft?.pullRequest || null;
    if (pr && typeof pr.isDraft === "boolean") draft = pr.isDraft;
  }
  if (typeof draft !== "boolean") {
    draft = stage !== "ready";
  }
  return { draft: Boolean(draft), data };
}

// src/fetch/pulls.ts
function findDanglingPrNumbers(pagePrNumbers, prs) {
  if (!Array.isArray(pagePrNumbers) || pagePrNumbers.length === 0) {
    return [];
  }
  const have = new Set((prs || []).map((pr) => pr.number));
  const dangling = [];
  const seen = /* @__PURE__ */ new Set();
  for (const raw of pagePrNumbers) {
    const num = Number(raw);
    if (!Number.isFinite(num) || seen.has(num) || have.has(num)) continue;
    seen.add(num);
    dangling.push(num);
  }
  return dangling;
}
async function fetchOpenPullsPublic(owner, repo, fetchImpl, token = null, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const url = githubRestUrl(`/repos/${owner}/${repo}/pulls?state=open&per_page=100`, ctx);
  const res = await fetchImpl(url, {
    headers: buildApiHeaders(token)
  });
  if (!res.ok) {
    const err = new Error(`GitHub API ${res.status}: ${res.statusText}`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  return data.map(mapApiPullRequest);
}
async function fetchPrHeadProbe(owner, repo, number, fetchImpl, token = null, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const o = String(owner || "").trim();
  const r = String(repo || "").trim();
  const n = Number(number);
  const empty = {
    headSha: "",
    baseSha: "",
    updatedAt: null,
    draft: false,
    state: "",
    number: Number.isFinite(n) ? n : 0
  };
  if (!o || !r || !Number.isFinite(n) || n <= 0) return empty;
  try {
    const url = githubRestUrl(
      `/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}/pulls/${n}`,
      ctx
    );
    const res = await fetchImpl(url, { headers: buildApiHeaders(token) });
    if (!res.ok) {
      const err = new Error(`GitHub API ${res.status}: ${res.statusText}`);
      err.status = res.status;
      throw err;
    }
    const data = await res.json();
    return {
      headSha: String(data?.head?.sha || ""),
      baseSha: String(data?.base?.sha || ""),
      updatedAt: data?.updated_at || null,
      draft: Boolean(data?.draft),
      state: String(data?.state || ""),
      number: Number(data?.number) || n
    };
  } catch (err) {
    if (err?.name === "AbortError" || /aborted|AbortError/i.test(String(err?.message || ""))) {
      throw err;
    }
    return empty;
  }
}
async function fetchPullByNumber(owner, repo, pullNumber, fetchImpl, token = null, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const url = githubRestUrl(`/repos/${owner}/${repo}/pulls/${pullNumber}`, ctx);
  const res = await fetchImpl(url, {
    headers: buildApiHeaders(token)
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
async function fetchRepoAutolinks(owner, repo, fetchImpl, token = null, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const url = githubRestUrl(`/repos/${owner}/${repo}/autolinks`, ctx);
  try {
    const res = await fetchImpl(url, { headers: buildApiHeaders(token) });
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data.filter((a) => a && typeof a.key_prefix === "string" && typeof a.url_template === "string").map((a) => ({
      key_prefix: a.key_prefix,
      url_template: a.url_template,
      is_alphanumeric: a.is_alphanumeric !== false
    }));
  } catch {
    return [];
  }
}
function buildAutolinkUrl(urlTemplate, num) {
  return String(urlTemplate).replace(/<num>/gi, num).replace(/\{num\}/gi, num);
}
function matchAutolinksInText(text, autolinks) {
  if (!text || !Array.isArray(autolinks) || autolinks.length === 0) return [];
  const found = [];
  const seen = /* @__PURE__ */ new Set();
  for (const rule of autolinks) {
    const prefix = rule.key_prefix;
    if (!prefix) continue;
    const numClass = rule.is_alphanumeric !== false ? "(?:\\d+|[A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)*)" : "\\d+";
    const re = new RegExp(
      `(^|[^A-Za-z0-9_])(${escapeRegExp(prefix)})(${numClass})`,
      "gi"
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
function prMatchText(pr) {
  if (!pr) return "";
  return [pr.title, pr.headRef, pr.baseRef, pr.body, pr.author].filter(Boolean).join("\n");
}
function attachMagicLinks(prs, autolinks) {
  if (!Array.isArray(prs)) return [];
  if (!Array.isArray(autolinks) || autolinks.length === 0) {
    return prs.map((pr) => ({ ...pr, magicLinks: pr.magicLinks || [] }));
  }
  return prs.map((pr) => ({
    ...pr,
    magicLinks: matchAutolinksInText(prMatchText(pr), autolinks)
  }));
}
async function fetchOpenPulls(owner, repo, fetchImpl, options = {}) {
  const {
    token = null,
    pagePrNumbers = [],
    includeAutolinks = true
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

// src/fetch/review-threads-map.ts
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
      id
      databaseId
      body
      path
      line
      createdAt
      author { login avatarUrl }
      isMinimized
      minimizedReason
      viewerCanMinimize
      # reviewId for first-paint review-group (cost stays 1 \u2014 measured on
      # callabo-server#2424 last:10/100 baseline vs +pullRequestReview).
      pullRequestReview { databaseId state }
    }
  }
`;
var REVIEW_THREAD_COMMENTS_FIELDS = `
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
      isMinimized
      minimizedReason
      viewerCanMinimize
      reactionGroups {
        content
        viewerHasReacted
        reactors {
          totalCount
        }
      }
    }
  }
`;
var REVIEW_THREADS_BY_IDS_NODE_SELECTION = `
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
      isMinimized
      minimizedReason
      viewerCanMinimize
      reactionGroups {
        content
        viewerHasReacted
        reactors {
          totalCount
        }
      }
    }
  }
`;
var REVIEW_THREADS_FIRST_QUERY = `
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
}`;
var REVIEW_THREADS_LAST_QUERY = `
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
}`;
var REVIEW_THREADS_API_MAX = 100;
var REVIEW_THREADS_PAGE_SIZE = 100;
function mapReviewThreadNodes(allNodes) {
  try {
    const pure = typeof globalThis !== "undefined" ? globalThis.PRModalReviewThreads : null;
    const list = Array.isArray(allNodes) ? allNodes : [];
    const hasFullCommentShape = list.some(
      (n) => (n?.comments?.nodes || []).some(
        (c) => c && (c.reactionGroups != null || c.diffHunk != null || c.pullRequestReview != null || c.replyTo != null)
      )
    );
    if (!hasFullCommentShape && typeof pure?.mapGraphqlReviewThreadNodes === "function") {
      return pure.mapGraphqlReviewThreadNodes(allNodes);
    }
  } catch {
  }
  const pureRt = typeof globalThis !== "undefined" ? globalThis.PRModalReviewThreads : null;
  const threads = [];
  const comments = [];
  for (const t of Array.isArray(allNodes) ? allNodes : []) {
    if (!t?.id) continue;
    const threadMeta = {
      threadNodeId: t.id,
      resolved: Boolean(t.isResolved),
      isOutdated: Boolean(t.isOutdated),
      path: t.path || "",
      diffSide: t.diffSide || "RIGHT",
      startDiffSide: t.startDiffSide || null,
      line: t.line ?? null,
      originalLine: t.originalLine ?? null,
      startLine: t.startLine ?? t.originalStartLine ?? null,
      subjectType: t.subjectType || null
    };
    const commentsConnPresent = t.comments != null && typeof t.comments === "object";
    const commentsLoaded = commentsConnPresent ? typeof pureRt?.graphqlCommentsAreFullyLoaded === "function" ? Boolean(pureRt.graphqlCommentsAreFullyLoaded(t.comments)) : (() => {
      const nodes = t.comments?.nodes || [];
      const total = t.comments?.totalCount;
      if (!nodes.length) return total === 0;
      if (typeof total === "number") return total <= nodes.length;
      return true;
    })() : false;
    const commentIds = [];
    if (commentsConnPresent) {
      for (const node of t.comments?.nodes || []) {
        const mapped = mapGraphqlReviewCommentNode(node, threadMeta);
        if (!mapped) continue;
        if (!commentsLoaded) {
          mapped._commentsPreview = true;
        }
        comments.push(mapped);
        commentIds.push(mapped.id);
      }
    }
    threads.push({
      threadNodeId: t.id,
      resolved: Boolean(t.isResolved),
      outdated: Boolean(t.isOutdated),
      path: t.path || "",
      line: t.line ?? t.originalLine ?? null,
      startLine: t.startLine ?? t.originalStartLine ?? null,
      side: t.diffSide || "RIGHT",
      commentIds,
      commentsLoaded,
      commentCount: typeof t.comments?.totalCount === "number" ? t.comments.totalCount : commentIds.length || null
    });
  }
  return { threads, comments };
}
function selectEagerCommentThreadIdsLocal(threads, opts = {}) {
  try {
    const pure = typeof globalThis !== "undefined" ? globalThis.PRModalReviewThreads : null;
    if (typeof pure?.selectThreadIdsForEagerComments === "function") {
      return pure.selectThreadIdsForEagerComments(threads, opts);
    }
  } catch {
  }
  const list = Array.isArray(threads) ? threads : [];
  const out = [];
  for (const t of list) {
    if (!t?.threadNodeId || t.commentsLoaded === true) continue;
    if (!/^PRRT_/i.test(String(t.threadNodeId))) continue;
    if (opts?.forceAll || !Boolean(t.resolved)) out.push(String(t.threadNodeId));
  }
  return out;
}
function mergeCommentsBulkIntoThreadsPage(shellPage, bulkPage) {
  try {
    const pure = typeof globalThis !== "undefined" ? globalThis.PRModalReviewThreads : null;
    if (typeof pure?.mergeCommentsBulkIntoThreadsPage === "function") {
      return pure.mergeCommentsBulkIntoThreadsPage(shellPage, bulkPage);
    }
  } catch {
  }
  const shellThreads = Array.isArray(shellPage?.threads) ? shellPage.threads : [];
  const bulkThreads = Array.isArray(bulkPage?.threads) ? bulkPage.threads : [];
  const bulkComments = Array.isArray(bulkPage?.comments) ? bulkPage.comments : [];
  const byId = new Map(
    bulkThreads.filter((t) => t?.threadNodeId).map((t) => [String(t.threadNodeId), t])
  );
  const threads = shellThreads.map((t) => {
    const id = t?.threadNodeId ? String(t.threadNodeId) : "";
    const full = id ? byId.get(id) : null;
    if (!full) {
      return { ...t, commentsLoaded: Boolean(t.commentsLoaded) };
    }
    const fullObj = full && typeof full === "object" ? full : {};
    return {
      ...t,
      ...fullObj,
      commentsLoaded: true,
      commentIds: Array.isArray(fullObj.commentIds) ? fullObj.commentIds : t.commentIds || []
    };
  });
  const loadedIds = new Set(
    threads.filter((t) => t.commentsLoaded).map((t) => String(t.threadNodeId))
  );
  const prevComments = Array.isArray(shellPage?.comments) ? shellPage.comments : [];
  let kept = [];
  try {
    const pure = typeof globalThis !== "undefined" ? globalThis.PRModalReviewThreads : null;
    if (typeof pure?.retainShellCommentsAfterBulk === "function") {
      kept = pure.retainShellCommentsAfterBulk(prevComments, loadedIds);
    } else {
      for (const c of prevComments) {
        if (!c?.threadNodeId) continue;
        const tid = String(c.threadNodeId);
        if (loadedIds.has(tid)) {
          if (c._commentsPending || c._commentsPreview) continue;
          kept.push(c);
          continue;
        }
        if (c._commentsPending && !String(c.body || "").trim()) continue;
        kept.push(c);
      }
    }
  } catch {
    kept = prevComments.slice();
  }
  const seen = new Set(kept.map((c) => String(c.id)));
  for (const c of bulkComments) {
    if (!c || c.id == null) continue;
    const k = String(c.id);
    if (seen.has(k)) continue;
    seen.add(k);
    kept.push(c);
  }
  let comments = kept;
  try {
    const pure = typeof globalThis !== "undefined" ? globalThis.PRModalReviewThreads : null;
    if (typeof pure?.ensureShellPlaceholderComments === "function") {
      comments = pure.ensureShellPlaceholderComments(threads, kept);
    } else {
      for (const t of threads) {
        if (!t?.threadNodeId || t.commentsLoaded === true) continue;
        const tid = String(t.threadNodeId);
        if (!/^PRRT_/i.test(tid)) continue;
        if (kept.some((c) => c && String(c.threadNodeId) === tid)) continue;
        kept.push({
          id: `shell:${tid}`,
          author: "",
          body: "",
          path: t.path || "",
          line: t.line ?? null,
          side: t.side || "RIGHT",
          threadNodeId: tid,
          resolved: Boolean(t.resolved),
          outdated: Boolean(t.outdated),
          pending: false,
          _commentsPending: true,
          commentsLoaded: false
        });
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
    const pure = typeof globalThis !== "undefined" ? globalThis.PRModalReviewThreads : null;
    if (typeof pure?.chooseReviewThreadsTransport === "function") {
      return pure.chooseReviewThreadsTransport(opts);
    }
  } catch {
  }
  if (opts?.preferRest === true) return "rest";
  return "graphql";
}
function buildRestReviewThreadsPageFromCommentsLocal(items, direction = "newest") {
  try {
    const pure = typeof globalThis !== "undefined" ? globalThis.PRModalReviewThreads : null;
    if (typeof pure?.buildRestReviewThreadsPageFromComments === "function") {
      return pure.buildRestReviewThreadsPageFromComments(items, direction);
    }
  } catch {
  }
  const list = Array.isArray(items) ? items : [];
  if (!list.length) {
    return {
      threads: [],
      comments: [],
      hasMore: false,
      endCursor: null,
      startCursor: null,
      hasNextPage: false,
      hasPreviousPage: false,
      totalCount: 0,
      pageCount: 0,
      direction: direction || "newest",
      window: "newest",
      source: "rest"
    };
  }
  const byId = /* @__PURE__ */ new Map();
  for (const c of list) {
    if (c && c.id != null) byId.set(String(c.id), c);
  }
  const roots = list.filter((c) => {
    if (!c || c.id == null) return false;
    const parent = c.inReplyToId ?? c.in_reply_to_id ?? null;
    return parent == null || !byId.has(String(parent));
  });
  const threads = roots.map((r) => {
    const replyIds = list.filter(
      (c) => c && String(c.inReplyToId ?? c.in_reply_to_id ?? "") === String(r.id)
    ).map((c) => c.id);
    const threadNodeId = r.nodeId || r.threadNodeId || `rest-thread-${r.id}`;
    const commentIds = [r.id, ...replyIds];
    for (const cid of commentIds) {
      const row = byId.get(String(cid));
      if (row) {
        row.threadNodeId = threadNodeId;
        row.loadWindow = "newest";
      }
    }
    return {
      threadNodeId,
      resolved: Boolean(r.resolved ?? r.isResolved),
      outdated: Boolean(r.outdated),
      path: r.path || "",
      line: r.line ?? r.originalLine ?? null,
      startLine: r.startLine ?? null,
      side: r.side || "RIGHT",
      commentIds,
      commentsLoaded: true,
      loadWindow: "newest"
    };
  });
  return {
    threads,
    comments: list,
    totalCount: list.length,
    startCursor: null,
    endCursor: null,
    hasNextPage: false,
    hasPreviousPage: false,
    hasMore: false,
    pageCount: 1,
    direction: direction || "newest",
    window: "newest",
    source: "rest"
  };
}

// src/fetch/review-threads-page.ts
async function restReviewThreadsFallbackPage(owner, repo, pullNumber, direction, fetchImpl, token, ctx, opts = {}) {
  const empty = buildRestReviewThreadsPageFromCommentsLocal([], direction);
  const perPage = Math.max(
    1,
    Math.min(
      REVIEW_THREADS_API_MAX,
      Number(opts.perPage) || REVIEW_THREADS_PAGE_SIZE
    )
  );
  const pageNum = Math.max(1, Number(opts.page) || 1);
  const knownCount = opts.reviewCommentsCount != null && Number.isFinite(Number(opts.reviewCommentsCount)) ? Number(opts.reviewCommentsCount) : null;
  if (knownCount != null && knownCount <= 0) {
    return {
      ...empty,
      totalCount: 0,
      source: "rest",
      reviewCommentsCount: 0
    };
  }
  try {
    const restPage = await fetchPrCommentsPage(
      owner,
      repo,
      pullNumber,
      "review",
      { page: pageNum, perPage, preferNewest: true },
      fetchImpl,
      token,
      ctx
    );
    const items = Array.isArray(restPage?.items) ? restPage.items : [];
    if (!items.length) {
      return {
        ...empty,
        totalCount: knownCount != null ? knownCount : 0,
        source: "rest",
        reviewCommentsCount: knownCount
      };
    }
    const page = buildRestReviewThreadsPageFromCommentsLocal(items, direction);
    const hasMoreComments = knownCount != null && pageNum * perPage < knownCount || knownCount == null && items.length >= perPage;
    const threadTotal = hasMoreComments ? (
      // Unknown full thread total while more comment pages remain
      Math.max(page.threads.length, Number(page.totalCount) || 0)
    ) : page.threads.length;
    console.log(
      `[pr-plus] fetchReviewThreadsPage REST: ${page.threads.length} threads, ${items.length} comments page=${pageNum} perPage=${perPage}` + (knownCount != null ? ` pr.review_comments=${knownCount}` : "") + (hasMoreComments ? " hasMoreComments" : "")
    );
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
    if (err?.name === "AbortError" || /aborted|AbortError/i.test(String(err?.message || ""))) {
      throw err;
    }
    console.log(
      `[pr-plus] fetchReviewThreadsPage REST soft-fail: ${err?.message || err}`
    );
    return empty;
  }
}
async function fetchReviewThreadsPage(owner, repo, pullNumber, {
  direction = "newest",
  cursor = null,
  pageSize = REVIEW_THREADS_PAGE_SIZE,
  preferRest = null,
  forceGraphql = false,
  forceFull = false,
  reviewCommentsCount = null,
  restPage = 1,
  /** When true, bulk-fetch comments for every shell thread (rare). */
  forceAllComments = false,
  /**
   * When true, return shell-only (no eager by-ids). Host stages progress as
   * threads → comments → reactions by calling by-ids separately.
   */
  skipEagerComments = false
} = {}, fetchImpl, token, ctx = null) {
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
    source: null
  };
  const n = Number(pullNumber);
  if (!Number.isFinite(n)) return empty;
  const size = Math.max(
    1,
    Math.min(REVIEW_THREADS_API_MAX, Number(pageSize) || REVIEW_THREADS_PAGE_SIZE)
  );
  const dir = String(direction || "newest");
  const transport = chooseReviewThreadsTransportLocal({
    direction: dir,
    cursor,
    preferRest,
    forceGraphql,
    forceFull
  });
  const useRest = transport === "rest";
  if (useRest) {
    const rest = await restReviewThreadsFallbackPage(
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
    );
    return { ...rest, source: "rest" };
  }
  if (!token) return { ...empty, source: null };
  const useLast = dir === "newest" || dir === "older";
  const query = useLast ? REVIEW_THREADS_LAST_QUERY : REVIEW_THREADS_FIRST_QUERY;
  try {
    const data = await apiGraphql(
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
    );
    const conn = data?.repository?.pullRequest?.reviewThreads;
    const nodes = conn?.nodes || [];
    const pageInfo = conn?.pageInfo || {};
    const mapped = mapReviewThreadNodes(nodes);
    const windowTag = dir === "newest" || dir === "older" ? "newest" : "oldest";
    for (const t of mapped.threads) {
      t.loadWindow = windowTag;
      if (t.commentsLoaded !== true) t.commentsLoaded = false;
    }
    let page = {
      threads: mapped.threads,
      comments: mapped.comments,
      totalCount: typeof conn?.totalCount === "number" ? conn.totalCount : null,
      startCursor: pageInfo.startCursor || null,
      endCursor: pageInfo.endCursor || null,
      hasNextPage: Boolean(pageInfo.hasNextPage),
      hasPreviousPage: Boolean(pageInfo.hasPreviousPage),
      // Convenience for dual-window UI
      hasMore: useLast ? Boolean(pageInfo.hasPreviousPage) : Boolean(pageInfo.hasNextPage),
      pageCount: 1,
      direction: dir,
      window: windowTag,
      source: "graphql",
      shellOnly: true
    };
    if (skipEagerComments) {
      page.shellOnly = true;
      page.eagerCommentIds = [];
      console.log(
        `[pr-plus] fetchReviewThreadsPage GraphQL shell-only: ${page.threads.length} threads (eager deferred to host)`
      );
    } else {
      const eagerIds = selectEagerCommentThreadIdsLocal(page.threads, {
        forceAll: Boolean(forceAllComments)
      });
      if (eagerIds.length) {
        try {
          const bulk = await fetchReviewThreadsByIds(
            eagerIds,
            fetchImpl,
            token,
            ctx
          );
          page = mergeCommentsBulkIntoThreadsPage(page, bulk);
          page.shellOnly = false;
          page.eagerCommentIds = eagerIds;
          console.log(
            `[pr-plus] fetchReviewThreadsPage GraphQL shell+comments: ${page.threads.length} threads, eagerComments=${eagerIds.length}, comments=${page.comments.length}`
          );
        } catch (bulkErr) {
          console.log(
            `[pr-plus] fetchReviewThreadsPage eager comments soft-fail: ${bulkErr?.message || bulkErr}`
          );
        }
      } else {
        console.log(
          `[pr-plus] fetchReviewThreadsPage GraphQL shell: ${page.threads.length} threads (no eager comments)`
        );
      }
    }
    try {
      const pure = typeof globalThis !== "undefined" ? globalThis.PRModalReviewThreads : null;
      if (typeof pure?.ensureShellPlaceholderComments === "function") {
        page = {
          ...page,
          comments: pure.ensureShellPlaceholderComments(
            page.threads,
            page.comments
          )
        };
      } else {
        const covered = new Set(
          (page.comments || []).map((c) => c?.threadNodeId ? String(c.threadNodeId) : "").filter(Boolean)
        );
        const extra = [];
        for (const t of page.threads || []) {
          const tid = t?.threadNodeId ? String(t.threadNodeId) : "";
          if (!tid || !/^PRRT_/i.test(tid) || covered.has(tid)) continue;
          if (t.commentsLoaded === true) continue;
          extra.push({
            id: `shell:${tid}`,
            author: "",
            body: "",
            path: t.path || "",
            line: t.line ?? null,
            side: t.side || "RIGHT",
            threadNodeId: tid,
            resolved: Boolean(t.resolved),
            outdated: Boolean(t.outdated),
            pending: false,
            _commentsPending: true,
            commentsLoaded: false
          });
        }
        if (extra.length) {
          page = { ...page, comments: [...page.comments || [], ...extra] };
        }
      }
    } catch {
    }
    return page;
  } catch (err) {
    if (err?.name === "AbortError" || /aborted|AbortError/i.test(String(err?.message || ""))) {
      throw err;
    }
    throw err;
  }
}
function isGraphqlReviewThreadNodeIdLocal(id) {
  try {
    const pure = typeof globalThis !== "undefined" ? globalThis.PRModalReviewThreads : null;
    if (typeof pure?.isGraphqlReviewThreadNodeId === "function") {
      return Boolean(pure.isGraphqlReviewThreadNodeId(id));
    }
  } catch {
  }
  return /^PRRT_/i.test(String(id || "").trim());
}
function collectUnresolvedThreadNodeIds(detail) {
  const dropped = detail?._droppedThreadNodeIds instanceof Set ? detail._droppedThreadNodeIds : new Set(
    Array.isArray(detail?._droppedThreadNodeIds) ? detail._droppedThreadNodeIds.map(String) : []
  );
  const ids = /* @__PURE__ */ new Set();
  for (const t of Array.isArray(detail?.reviewThreads) ? detail.reviewThreads : []) {
    if (!t?.threadNodeId || t.resolved) continue;
    const id = String(t.threadNodeId);
    if (dropped.has(id)) continue;
    if (!isGraphqlReviewThreadNodeIdLocal(id)) continue;
    ids.add(id);
  }
  const list = Array.isArray(detail?.reviewComments) ? detail.reviewComments : [];
  const byId = /* @__PURE__ */ new Map();
  for (const c of list) {
    if (c && c.id != null) byId.set(String(c.id), c);
  }
  for (const c of list) {
    if (!c?.threadNodeId || c.resolved) continue;
    const id = String(c.threadNodeId);
    if (dropped.has(id)) continue;
    if (!isGraphqlReviewThreadNodeIdLocal(id)) continue;
    const parentId = c.inReplyToId ?? c.in_reply_to_id ?? null;
    if (parentId != null && byId.has(String(parentId))) continue;
    ids.add(id);
  }
  return [...ids];
}

// src/fetch/review-threads-bulk.ts
function isUnverifiedLocalOnlyReviewCommentLocal(c) {
  if (!c || c.id == null) return false;
  if (c.pending) return false;
  if (c._commentsPending || c.commentsLoaded === false) return false;
  if (String(c.id).startsWith("shell:")) return false;
  const body = String(c.body ?? c.bodyText ?? c.bodyHTML ?? "").trim();
  if (body) return false;
  const author = String(
    c.author || c.user?.login || c.user?.name || ""
  ).trim();
  if (author && author.toLowerCase() !== "user") return false;
  return true;
}
async function fetchReviewThreadsByIds(threadNodeIds, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const empty = {
    threads: [],
    comments: [],
    pageCount: 0,
    direction: "refresh",
    totalCount: null,
    hasPreviousPage: false,
    hasNextPage: false,
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
}`;
  const byIdsQueryMeta = {
    qName: "ReviewThreadsByIdsFullCostFlat",
    hasFirst1: /comments\s*\(\s*first\s*:\s*1\s*\)/.test(query),
    hasFirst100: /comments\s*\(\s*first\s*:\s*100\s*\)/.test(query),
    hasReactorsFirst: /reactors\s*\(\s*first\s*:/.test(query)
  };
  try {
    globalThis.__prpLastByIdsQueryMeta = byIdsQueryMeta;
  } catch {
  }
  const allThreads = [];
  const allComments = [];
  const foundIds = /* @__PURE__ */ new Set();
  const confirmedMissing = /* @__PURE__ */ new Set();
  let pages = 0;
  const confirmedMissingFromNodes = (chunkIds, rawNodes) => {
    try {
      const pure = typeof globalThis !== "undefined" ? globalThis.PRModalReviewThreads : null;
      if (typeof pure?.confirmedMissingThreadIdsFromNodes === "function") {
        return pure.confirmedMissingThreadIdsFromNodes(chunkIds, rawNodes);
      }
    } catch {
    }
    if (!Array.isArray(rawNodes) || !chunkIds.length) return [];
    const missing = [];
    const n = Math.min(chunkIds.length, rawNodes.length);
    for (let j = 0; j < n; j++) {
      if (rawNodes[j] == null) missing.push(String(chunkIds[j]));
    }
    return missing;
  };
  for (let i = 0; i < ids.length; i += REVIEW_THREADS_API_MAX) {
    const chunk = ids.slice(i, i + REVIEW_THREADS_API_MAX);
    try {
      const data = await apiGraphql(query, { ids: chunk }, fetchImpl, token, ctx);
      const rawNodes = Array.isArray(data?.nodes) ? data.nodes : null;
      if (!rawNodes) {
        console.warn(
          "[pr-plus] fetchReviewThreadsByIds chunk: missing nodes[] \u2014 not marking missing"
        );
        continue;
      }
      for (const mid of confirmedMissingFromNodes(chunk, rawNodes)) {
        confirmedMissing.add(String(mid));
      }
      const nodes = rawNodes.filter(Boolean);
      const mapped = mapReviewThreadNodes(nodes);
      for (const t of mapped.threads) {
        t.loadWindow = t.loadWindow || "refresh";
        if (t.threadNodeId) foundIds.add(String(t.threadNodeId));
      }
      for (const n of nodes) {
        if (n?.id) foundIds.add(String(n.id));
      }
      allThreads.push(...mapped.threads);
      allComments.push(...mapped.comments);
      pages += 1;
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
    hasPreviousPage: false,
    hasNextPage: false,
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
  const prevRc = Array.isArray(detail.reviewComments) ? detail.reviewComments : [];
  const prevTh = Array.isArray(detail.reviewThreads) ? detail.reviewThreads : [];
  const droppedCommentIds = [];
  const reviewComments = prevRc.filter((c) => {
    if (!c) return false;
    const tid = c.threadNodeId ? String(c.threadNodeId) : "";
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
      ...detail._deletedReviewCommentIds instanceof Set ? detail._deletedReviewCommentIds : Array.isArray(detail._deletedReviewCommentIds) ? detail._deletedReviewCommentIds : [],
      ...droppedCommentIds
    ].map(String)
  );
  const prevMeta = detail.reviewThreadsMeta || emptyReviewThreadsMeta();
  const filterIdList = (list) => (Array.isArray(list) ? list : []).map(String).filter((id) => id && !drop.has(id));
  const loadedThreadCount = reviewThreads.length;
  const totalCount = Math.max(
    0,
    Number(prevMeta.totalCount) || loadedThreadCount
  );
  const nextTotal = Number.isFinite(Number(prevMeta.totalCount)) && Number(prevMeta.totalCount) >= drop.size ? Math.max(loadedThreadCount, Number(prevMeta.totalCount) - drop.size) : totalCount;
  const hiddenCount = Math.max(0, nextTotal - loadedThreadCount);
  const prevDroppedThreads = detail._droppedThreadNodeIds instanceof Set ? detail._droppedThreadNodeIds : Array.isArray(detail._droppedThreadNodeIds) ? detail._droppedThreadNodeIds : [];
  const droppedThreads = new Set([...prevDroppedThreads, ...drop].map(String));
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
      hasOlder: hiddenCount > 0 && Boolean(prevMeta.hasOlder),
      hasNewerFromOldest: hiddenCount > 0 && Boolean(prevMeta.hasNewerFromOldest)
    },
    _deletedReviewCommentIds: deleted.size ? deleted : detail._deletedReviewCommentIds,
    // Never re-request these PRRT ids in collectUnresolvedThreadNodeIds
    _droppedThreadNodeIds: droppedThreads
  };
}
async function fetchPullReviewThreadsBundle(owner, repo, pullNumber, fetchImpl, token, opts = {}) {
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
      reviewThreadsMeta: emptyReviewThreadsMeta()
    };
  }
  const lastPageSize = Math.min(
    REVIEW_THREADS_API_MAX,
    Number(opts.pageSize) || REVIEW_THREADS_PAGE_SIZE
  );
  const direction = String(opts.direction || "newest").toLowerCase() === "oldest" ? "oldest" : "newest";
  const page = await fetchReviewThreadsPage(
    owner,
    repo,
    pullNumber,
    {
      direction,
      cursor: null,
      pageSize: lastPageSize,
      preferRest: false,
      forceGraphql: true,
      reviewCommentsCount: opts.reviewCommentsCount
    },
    fetchImpl,
    token,
    ctx
  );
  const totalCount = Number(page.totalCount) || page.threads.length;
  const threads = [...page.threads || []];
  const comments = [...page.comments || []];
  const newestIds = threads.map((t) => t.threadNodeId).filter(Boolean);
  const loaded = threads.length;
  const hiddenCount = Math.max(0, totalCount - loaded);
  const hasOlder = direction === "newest" ? Boolean(page.hasPreviousPage) : Boolean(page.hasNextPage);
  const meta = {
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
    hasNewerFromOldest: false,
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
    hasOlder: false,
    oldestStartCursor: null,
    oldestEndCursor: null,
    hasNewerFromOldest: false,
    newestThreadIds: [],
    oldestThreadIds: [],
    hasMore: false,
    endCursor: null,
    direction: "newest"
  };
}
function mergeReviewThreadsPageIntoDetail(detail, page, direction = "older") {
  if (!detail) return detail;
  const dir = String(direction || page?.direction || "older");
  const prevMeta = detail.reviewThreadsMeta || emptyReviewThreadsMeta();
  const prevRc = Array.isArray(detail.reviewComments) ? detail.reviewComments : [];
  const prevTh = Array.isArray(detail.reviewThreads) ? detail.reviewThreads : [];
  const missingIds = (() => {
    try {
      const pure = typeof globalThis !== "undefined" ? globalThis.PRModalReviewThreads : null;
      if (typeof pure?.resolveMissingThreadIdsForDrop === "function") {
        return pure.resolveMissingThreadIdsForDrop(page);
      }
    } catch {
    }
    if (!Array.isArray(page?.missingThreadIds)) return [];
    return [
      ...new Set(
        page.missingThreadIds.map((id) => String(id || "").trim()).filter(Boolean)
      )
    ];
  })();
  let baseRc = prevRc;
  let reviewComments;
  if ((dir === "refresh" || dir === "ids") && (page?.threads || []).length) {
    const refreshed = new Set(
      (page.threads || []).map((t) => t?.threadNodeId ? String(t.threadNodeId) : "").filter(Boolean)
    );
    try {
      const pure = typeof globalThis !== "undefined" ? globalThis.PRModalReviewThreads : null;
      if (typeof pure?.hydrateReviewCommentsInPlace === "function") {
        reviewComments = pure.hydrateReviewCommentsInPlace(
          prevRc,
          page?.comments || [],
          refreshed
        );
      }
    } catch {
    }
    if (!reviewComments) {
      baseRc = prevRc.filter(
        (c) => !c?.threadNodeId || !refreshed.has(String(c.threadNodeId))
      );
      reviewComments = mergePendingReviewComments(baseRc, page?.comments || []);
    }
  } else {
    const deferredShellIds = /* @__PURE__ */ new Set();
    const pageThreadIds = /* @__PURE__ */ new Set();
    if (page?.source === "graphql" && Array.isArray(page?.threads)) {
      for (const t of page.threads) {
        if (!t?.threadNodeId) continue;
        const id = String(t.threadNodeId);
        pageThreadIds.add(id);
        if (t.commentsLoaded === false) deferredShellIds.add(id);
      }
      if (pageThreadIds.size) {
        baseRc = baseRc.filter((c) => {
          if (!c) return false;
          const tid = c.threadNodeId != null ? String(c.threadNodeId) : "";
          if (tid.startsWith("rest-thread-")) return false;
          if (pageThreadIds.has(tid)) return false;
          if (deferredShellIds.has(tid)) return false;
          if (isUnverifiedLocalOnlyReviewCommentLocal(c)) return false;
          return true;
        });
      } else {
        baseRc = baseRc.filter(
          (c) => c && !isUnverifiedLocalOnlyReviewCommentLocal(c)
        );
      }
    }
    reviewComments = mergePendingReviewComments(baseRc, page?.comments || []);
    reviewComments = (Array.isArray(reviewComments) ? reviewComments : []).filter(
      (c) => c && !isUnverifiedLocalOnlyReviewCommentLocal(c)
    );
  }
  const resolvedByThread = /* @__PURE__ */ new Map();
  for (const t of page?.threads || []) {
    if (t?.threadNodeId) {
      resolvedByThread.set(String(t.threadNodeId), Boolean(t.resolved));
    }
  }
  const stampedCommentsRaw = resolvedByThread.size === 0 ? reviewComments : reviewComments.map((c) => {
    if (!c?.threadNodeId) return c;
    const key = String(c.threadNodeId);
    if (!resolvedByThread.has(key)) return c;
    return { ...c, resolved: resolvedByThread.get(key) };
  });
  const realCommentThreadIds = /* @__PURE__ */ new Set();
  for (const c of stampedCommentsRaw) {
    if (c && !c._commentsPending && c.threadNodeId) {
      realCommentThreadIds.add(String(c.threadNodeId));
    }
  }
  let stampedComments = stampedCommentsRaw.filter((c) => {
    if (!c) return false;
    if (isUnverifiedLocalOnlyReviewCommentLocal(c)) return false;
    if (!c?._commentsPending) return true;
    return !realCommentThreadIds.has(String(c.threadNodeId || ""));
  });
  try {
    const pure = typeof globalThis !== "undefined" ? globalThis.PRModalReviewThreads : null;
    const shellThreads = Array.isArray(page?.threads) ? page.threads : [];
    if (page?.source === "graphql" && dir !== "ids" && dir !== "refresh" && typeof pure?.ensureShellPlaceholderComments === "function") {
      stampedComments = pure.ensureShellPlaceholderComments(
        shellThreads,
        stampedComments
      );
    } else if (page?.source === "graphql" && dir !== "ids" && dir !== "refresh") {
      const covered = new Set(
        stampedComments.map((c) => c?.threadNodeId ? String(c.threadNodeId) : "").filter(Boolean)
      );
      for (const t of shellThreads) {
        const tid = t?.threadNodeId ? String(t.threadNodeId) : "";
        if (!tid || !/^PRRT_/i.test(tid) || covered.has(tid)) continue;
        if (t.commentsLoaded === true) continue;
        stampedComments.push({
          id: `shell:${tid}`,
          author: "",
          body: "",
          path: t.path || "",
          line: t.line ?? null,
          side: t.side || "RIGHT",
          threadNodeId: tid,
          resolved: Boolean(t.resolved),
          outdated: Boolean(t.outdated),
          pending: false,
          _commentsPending: true,
          commentsLoaded: false
        });
        covered.add(tid);
      }
    }
  } catch {
  }
  const thById = new Map(
    prevTh.map((t) => [String(t.threadNodeId), t]).filter(([k]) => k && k !== "undefined")
  );
  for (const t of page?.threads || []) {
    if (t?.threadNodeId) {
      const prevT = thById.get(String(t.threadNodeId)) || {};
      const mergedT = {
        ...prevT,
        ...t
      };
      if (page?.source === "graphql" && t.commentsLoaded === false && dir !== "ids" && dir !== "refresh") {
        mergedT.commentsLoaded = false;
        mergedT.commentIds = Array.isArray(t.commentIds) ? t.commentIds : [];
      } else if (prevT.commentsLoaded === true || t.commentsLoaded === true) {
        mergedT.commentsLoaded = true;
      } else if (t.commentsLoaded === false || prevT.commentsLoaded === false) {
        mergedT.commentsLoaded = Array.isArray(mergedT.commentIds) && mergedT.commentIds.length > 0 ? true : false;
      }
      thById.set(String(t.threadNodeId), mergedT);
    }
  }
  const reviewThreads = [...thById.values()];
  let newestIds = new Set((prevMeta.newestThreadIds || []).map(String));
  const pageIds = (page?.threads || []).map((t) => t.threadNodeId).filter(Boolean).map(String);
  let newestStartCursor = prevMeta.newestStartCursor;
  let newestEndCursor = prevMeta.newestEndCursor;
  let hasOlder = prevMeta.hasOlder;
  if (dir === "refresh" || dir === "ids") {
  } else if (dir === "newest" || dir === "older" || dir === "oldest" || dir === "newer") {
    for (const id of pageIds) newestIds.add(id);
    if (page?.startCursor) newestStartCursor = page.startCursor;
    if (page?.endCursor && (dir === "newest" || dir === "older")) {
      newestEndCursor = page.endCursor;
    }
    if (dir === "newest" || dir === "older") {
      hasOlder = Boolean(page?.hasPreviousPage);
    } else {
      hasOlder = Boolean(page?.hasNextPage);
    }
  }
  const isRest = page?.source === "rest";
  const totalCount = isRest ? Boolean(page?.hasMore) ? Math.max(
    reviewThreads.length,
    typeof page?.totalCount === "number" ? page.totalCount : 0,
    Number(prevMeta.totalCount) || 0
  ) : reviewThreads.length : typeof page?.totalCount === "number" ? page.totalCount : Number(prevMeta.totalCount) || reviewThreads.length;
  const loadedThreadCount = reviewThreads.length;
  const hiddenCount = isRest ? Boolean(page?.hasMore) ? Math.max(1, totalCount - loadedThreadCount) : 0 : Math.max(0, totalCount - loadedThreadCount);
  const restHasMore = isRest && Boolean(page?.hasMore);
  const meta = {
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
    hasNewerFromOldest: false,
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
  if ((dir === "refresh" || dir === "ids") && missingIds.length) {
    next = dropReviewThreadsFromDetail(next, missingIds);
  }
  return next;
}
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

// src/fetch/pr-detail.ts
async function fetchPrDetail(owner, repo, pullNumber, fetchImpl, token = null, opts = {}) {
  const ctx = normalizeApiCtx(opts?.ctx);
  const base = githubRestUrl(`/repos/${owner}/${repo}`, ctx);
  const n = Number(pullNumber);
  const skipReviewThreads = Boolean(opts.skipReviewThreads);
  const threadsMaxPages = skipReviewThreads ? 0 : Math.max(1, Math.min(20, Number(opts.threadsMaxPages) || 1));
  const timings = {};
  const tTotal0 = fetchNowMs();
  console.log(
    `[pr-plus] fetchPrDetail start ${owner}/${repo}#${n} skipReviewThreads=${skipReviewThreads} threadsMaxPages=${threadsMaxPages}`
  );
  const PARALLEL_REST_KEYS = ["pull", "issue", "viewerLogin", "autolinks"];
  const tParallel0 = fetchNowMs();
  const batchOpt = { batchStart: tParallel0 };
  const bust = () => `_prp=${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const noCache = {
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
          if (err?.name === "AbortError" || /aborted|AbortError/i.test(String(err?.message || ""))) {
            throw err;
          }
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
  if (pr && issue && typeof issue === "object") {
    if (issue.milestone) {
      pr = { ...pr, milestone: issue.milestone };
    }
    if (Array.isArray(issue.labels) && (!Array.isArray(pr.labels) || pr.labels.length === 0) && issue.labels.length > 0) {
      pr = { ...pr, labels: issue.labels };
    }
    if (Array.isArray(issue.assignees) && (!Array.isArray(pr.assignees) || pr.assignees.length === 0) && issue.assignees.length > 0) {
      pr = { ...pr, assignees: issue.assignees };
    }
  }
  if (pr && !pr.milestone && token) {
    try {
      const issueRetry = await timedFetch(
        timings,
        "issueMilestoneRetry",
        apiJson(`${base}/issues/${n}?${bust()}`, fetchImpl, token, noCache),
        null,
        batchOpt
      );
      if (issueRetry?.milestone) {
        pr = { ...pr, milestone: issueRetry.milestone };
        console.log(
          `[pr-plus] fetchPrDetail issue milestone retry: #${issueRetry.milestone.number || "?"} ${issueRetry.milestone.title || ""}`
        );
      } else {
        const pullRetry = await timedFetch(
          timings,
          "pullMilestoneRetry",
          apiJson(`${base}/pulls/${n}?${bust()}`, fetchImpl, token, noCache),
          null,
          batchOpt
        );
        if (pullRetry?.milestone) {
          pr = { ...pr, milestone: pullRetry.milestone };
          console.log(
            `[pr-plus] fetchPrDetail pull milestone retry: #${pullRetry.milestone.number || "?"} ${pullRetry.milestone.title || ""}`
          );
        }
      }
    } catch (err) {
      if (err?.name === "AbortError" || /aborted|AbortError/i.test(String(err?.message || ""))) {
        throw err;
      }
    }
  }
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
    "[pr-plus] fetchPrDetail files/comments/reviews/commits/checks/development: deferred (independent fetches)"
  );
  const files = [];
  const commentsPage = {
    items: [],
    meta: {
      page: 1,
      perPage: COMMENT_PAGE_SIZE,
      hasMore: false,
      nextPage: null,
      order: "from-end",
      loadedCount: 0
    }
  };
  const reviews = [];
  pr = await resolvePrMergeability(pr, base, n, fetchImpl, token, timings, {
    owner,
    repo,
    apiCtx: ctx
  });
  let repoMergeFlags = extractRepoMergeMethodFlags(pr?.base?.repo) || extractRepoMergeMethodFlags(pr?.head?.repo) || null;
  let viewerCanMergeAsAdmin = extractViewerCanMergeAsAdmin(pr?.base?.repo) ?? extractViewerCanMergeAsAdmin(pr?.head?.repo) ?? null;
  if (!repoMergeFlags || viewerCanMergeAsAdmin == null) {
    try {
      const repoJson = await timedFetch(
        timings,
        "repoMergeSettings",
        apiJson(base, fetchImpl, token),
        (r) => `(merge=${r?.allow_merge_commit} squash=${r?.allow_squash_merge} rebase=${r?.allow_rebase_merge} admin=${r?.permissions?.admin})`
      );
      if (!repoMergeFlags) {
        repoMergeFlags = extractRepoMergeMethodFlags(repoJson);
      }
      if (viewerCanMergeAsAdmin == null) {
        viewerCanMergeAsAdmin = extractViewerCanMergeAsAdmin(repoJson);
      }
    } catch (err) {
      if (err?.name === "AbortError" || /aborted|AbortError/i.test(String(err?.message || ""))) {
        throw err;
      }
      timings.repoMergeSettings = timings.repoMergeSettings || 0;
      console.log(
        `[pr-plus] fetchPrDetail repoMergeSettings: soft-fail ${err?.message || err}`
      );
      if (!repoMergeFlags) repoMergeFlags = null;
    }
  } else {
    timings.repoMergeSettings = 0;
  }
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
  );
  const comments = commentsPage?.items || [];
  let reviewThreadBundle = {
    threads: [],
    comments: [],
    hasMore: false,
    endCursor: null,
    pageCount: 0
  };
  if (token && threadsMaxPages > 0) {
    reviewThreadBundle = await timedFetch(
      timings,
      "reviewThreads",
      fetchPullReviewThreadsBundle(owner, repo, n, fetchImpl, token, {
        cursor: opts.threadsCursor || null,
        maxPages: threadsMaxPages,
        ctx
      }).catch((err) => {
        if (err?.name === "AbortError" || /aborted|AbortError/i.test(String(err?.message || ""))) {
          throw err;
        }
        return reviewThreadBundle;
      }),
      (b) => `(${(b?.threads || []).length} threads, ${(b?.comments || []).length} comments)`
    );
  } else {
    timings.reviewThreads = 0;
    console.log(
      `[pr-plus] fetchPrDetail reviewThreads: skipped (token=${Boolean(
        token
      )} maxPages=${threadsMaxPages})`
    );
  }
  if (token && threadsMaxPages > 0 && !(Array.isArray(reviewThreadBundle?.comments) && reviewThreadBundle.comments.length > 0)) {
    try {
      const restPage = await timedFetch(
        timings,
        "reviewThreadsRest",
        fetchPrCommentsPage(
          owner,
          repo,
          n,
          "review",
          { page: 1, perPage: 100, preferNewest: true },
          fetchImpl,
          token,
          ctx
        ).catch((err) => {
          if (err?.name === "AbortError" || /aborted|AbortError/i.test(String(err?.message || ""))) {
            throw err;
          }
          return null;
        }),
        (p) => `(${(p?.items || []).length} rest review comments)`
      );
      const items = Array.isArray(restPage?.items) ? restPage.items : [];
      if (items.length) {
        const byId = /* @__PURE__ */ new Map();
        for (const c of items) {
          if (c && c.id != null) byId.set(String(c.id), c);
        }
        const roots = items.filter((c) => {
          if (!c || c.id == null) return false;
          const parent = c.inReplyToId ?? c.in_reply_to_id ?? null;
          return parent == null || !byId.has(String(parent));
        });
        const threads = roots.map((r) => {
          const replyIds = items.filter(
            (c) => c && String(c.inReplyToId ?? c.in_reply_to_id ?? "") === String(r.id)
          ).map((c) => c.id);
          const threadNodeId = r.nodeId || `rest-thread-${r.id}`;
          const commentIds = [r.id, ...replyIds];
          for (const cid of commentIds) {
            const row = byId.get(String(cid));
            if (row) row.threadNodeId = threadNodeId;
          }
          return {
            threadNodeId,
            resolved: false,
            outdated: Boolean(r.outdated),
            path: r.path || "",
            line: r.line ?? r.originalLine ?? null,
            startLine: r.startLine ?? null,
            side: r.side || "RIGHT",
            commentIds
          };
        });
        reviewThreadBundle = {
          threads,
          comments: items,
          hasMore: Boolean(restPage?.meta?.hasMore ?? restPage?.hasMore),
          endCursor: null,
          pageCount: 1,
          totalCount: items.length
        };
        console.log(
          `[pr-plus] fetchPrDetail reviewThreads: REST fallback ${threads.length} threads, ${items.length} comments`
        );
      }
    } catch (err) {
      if (err?.name === "AbortError" || /aborted|AbortError/i.test(String(err?.message || ""))) {
        throw err;
      }
      console.log(
        `[pr-plus] fetchPrDetail reviewThreads REST fallback soft-fail: ${err?.message || err}`
      );
    }
  }
  const reviewThreads = reviewThreadBundle?.threads || [];
  let pendingBundle = { comments: [], review: null };
  if (token) {
    pendingBundle = await timedFetch(
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
        if (err?.name === "AbortError" || /aborted|AbortError/i.test(String(err?.message || ""))) {
          throw err;
        }
        return { comments: [], review: null };
      }),
      (b) => `(${(b?.comments || []).length} pending comments)`
    );
  } else {
    timings.pendingReview = 0;
    console.log("[pr-plus] fetchPrDetail pendingReview: skipped (no token)");
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
    loadedCount: (reviewComments || []).length
  };
  const reviewThreadsMeta = reviewThreadBundle?.reviewThreadsMeta ? { ...reviewThreadBundle.reviewThreadsMeta } : {
    ...emptyReviewThreadsMeta(),
    hasMore: Boolean(reviewThreadBundle?.hasMore),
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
  };
  const headSha = pr.head?.sha || "";
  const checks = { state: "unknown", totalCount: 0, statuses: [], checkRuns: [] };
  const commits = [];
  let linkedIssues = [];
  const developmentIssues = [];
  const projects = [];
  try {
    let editApi = typeof globalThis !== "undefined" ? globalThis.PRModalPrEditApi : null;
    if (!editApi && typeof __require === "function") {
      try {
        editApi = __require("./modal/pure/pr-edit-api.js");
      } catch {
        editApi = null;
      }
    }
    if (editApi?.parseLinkedIssueNumbers) {
      linkedIssues = editApi.parseLinkedIssueNumbers(pr.body || "");
    }
  } catch {
    linkedIssues = [];
  }
  const gitattributesText = "";
  const filesOut = [];
  timings.mapAnnotateFiles = 0;
  const subscribed = subscription && typeof subscription.subscribed === "boolean" ? Boolean(subscription.subscribed) : null;
  const mergeStateStatus = subscription && subscription.mergeStateStatus ? String(subscription.mergeStateStatus) : null;
  const magicLinks = matchAutolinksInText(
    prMatchText({
      title: pr.title,
      body: pr.body || "",
      headRef: pr.head?.ref || "",
      baseRef: pr.base?.ref || "",
      author: pr.user?.login || ""
    }),
    Array.isArray(autolinks) ? autolinks : []
  );
  timings.total = Math.round(fetchNowMs() - tTotal0);
  console.log(
    // @ts-expect-error classic fetch dynamic shapes
    `[pr-plus] fetchPrDetail total: ${timings.total}ms`,
    JSON.stringify(timings)
  );
  if (typeof console.table === "function") {
    try {
      console.table(timings);
    } catch {
    }
  }
  let bodyReactions = mapRestReactions(pr.reactions);
  if (pr.node_id && token) {
    try {
      const byId = await fetchReactableReactionGroups(
        [pr.node_id],
        fetchImpl,
        token,
        ctx
      );
      const enriched = byId.get(String(pr.node_id));
      if (enriched && enriched.length) bodyReactions = enriched;
    } catch {
    }
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
    state: Boolean(pr.merged) || Boolean(pr.merged_at) ? pr.state === "open" ? "closed" : pr.state || "closed" : pr.state,
    draft: Boolean(pr.draft),
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
    merged: Boolean(pr.merged) || Boolean(pr.merged_at),
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
    viewerCanMergeAsAdmin: viewerCanMergeAsAdmin === true ? true : viewerCanMergeAsAdmin === false ? false : null,
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
      const map = {};
      const putUser = (u) => {
        const login = u?.login || (typeof u === "string" ? u : "");
        const url = u?.avatar_url || "";
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
        const login = u?.login || (typeof u === "string" ? u : "");
        if (!login) return;
        const key = String(login).toLowerCase();
        const type = String(u?.type || "").toLowerCase();
        if (type === "bot" || /\[bot\]$/i.test(String(login))) map[key] = true;
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
    locked: Boolean(pr.locked),
    gitattributesText,
    files: filesOut,
    comments: Array.isArray(comments) ? comments : [],
    commentsMeta: commentsPage?.meta || {
      page: 1,
      perPage: COMMENT_PAGE_SIZE,
      hasMore: false,
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

// src/fetch/timeline-items.ts
var TIMELINE_ITEMS_PAGE_SIZE = 100;
var TIMELINE_ITEMS_QUERY = `
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
            isMinimized
            minimizedReason
            viewerCanMinimize
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
}`;
var SKIP_TYPENAMES = /* @__PURE__ */ new Set([
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
  if (!Array.isArray(groups)) return [];
  return groups.map((g) => {
    const content = String(g?.content || "");
    const count = Number(g?.reactors?.totalCount) || 0;
    if (!content || count <= 0) return null;
    return {
      content,
      count,
      viewerHasReacted: Boolean(g?.viewerHasReacted)
    };
  }).filter(Boolean);
}
function mapGraphqlTimelineNode(node) {
  if (!node || typeof node !== "object") return { kind: null, value: null };
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
      updated_at: node.createdAt,
      isMinimized: node.isMinimized,
      minimizedReason: node.minimizedReason,
      viewerCanMinimize: node.viewerCanMinimize
    });
    const reactions = mapReactionGroups(node.reactionGroups);
    if (reactions.length) comment.reactions = reactions;
    comment.nodeId = node.id || comment.nodeId;
    return { kind: "comment", value: comment };
  }
  if (tn === "PullRequestReview") {
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
        commentCount: typeof node.comments?.totalCount === "number" ? node.comments.totalCount : null,
        isBot: /\[bot\]$/i.test(String(node.author?.login || ""))
      }
    };
  }
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
  const comments = [];
  const timelineEvents = [];
  const reviews = [];
  for (const node of Array.isArray(nodes) ? nodes : []) {
    const { kind, value } = mapGraphqlTimelineNode(node);
    if (!value) continue;
    if (kind === "comment") comments.push(value);
    else if (kind === "event") timelineEvents.push(value);
    else if (kind === "review") reviews.push(value);
  }
  return { comments, timelineEvents, reviews };
}
async function fetchPrTimelineItemsPage(owner, repo, number, opts = {}, fetchImpl = null, token = null, ctx = null) {
  ctx = normalizeApiCtx(ctx || opts?.ctx);
  const o = String(owner || "").trim();
  const r = String(repo || "").trim();
  const n = Number(number);
  const empty = {
    comments: [],
    timelineEvents: [],
    reviews: [],
    pageInfo: {
      hasNextPage: false,
      hasPreviousPage: false,
      startCursor: null,
      endCursor: null
    },
    totalCount: 0,
    filteredCount: 0,
    updatedAt: null,
    direction: "newest",
    hasMore: false,
    source: "graphql"
  };
  if (!o || !r || !Number.isFinite(n) || !token) return empty;
  const pageSize = Math.min(
    TIMELINE_ITEMS_PAGE_SIZE,
    Math.max(1, Number(opts.pageSize) || TIMELINE_ITEMS_PAGE_SIZE)
  );
  const direction = String(opts.direction || "newest").toLowerCase() === "oldest" ? "oldest" : "newest";
  const cursor = opts.cursor != null ? String(opts.cursor) : null;
  const since = opts.since ? String(opts.since) : null;
  const variables = {
    owner: o,
    name: r,
    number: n
  };
  if (since) variables.since = String(since);
  if (since && direction === "newest") {
    variables.first = pageSize;
    if (cursor) variables.after = cursor;
  } else if (direction === "newest") {
    variables.last = pageSize;
    if (cursor) variables.before = cursor;
  } else {
    variables.first = pageSize;
    if (cursor) variables.after = cursor;
  }
  try {
    const data = await apiGraphql(
      TIMELINE_ITEMS_QUERY,
      variables,
      fetchImpl || fetch,
      token,
      { ...ctx, qName: "TimelineItemsPage" }
    );
    const conn = data?.repository?.pullRequest?.timelineItems;
    const nodes = Array.isArray(conn?.nodes) ? conn.nodes : [];
    const mapped = mapGraphqlTimelineNodes(nodes);
    const pageInfo = conn?.pageInfo || empty.pageInfo;
    const hasMore = since ? Boolean(pageInfo.hasNextPage) : direction === "newest" ? Boolean(pageInfo.hasPreviousPage) : Boolean(pageInfo.hasNextPage);
    return {
      ...mapped,
      pageInfo: {
        hasNextPage: Boolean(pageInfo.hasNextPage),
        hasPreviousPage: Boolean(pageInfo.hasPreviousPage),
        startCursor: pageInfo.startCursor || null,
        endCursor: pageInfo.endCursor || null
      },
      totalCount: typeof conn?.totalCount === "number" ? conn.totalCount : nodes.length,
      filteredCount: typeof conn?.filteredCount === "number" ? conn.filteredCount : nodes.length,
      updatedAt: conn?.updatedAt || null,
      direction,
      hasMore,
      source: "graphql",
      since: since || null
    };
  } catch (err) {
    if (err?.name === "AbortError" || /aborted|AbortError/i.test(String(err?.message || ""))) {
      throw err;
    }
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

// src/fetch/fetch-api.ts
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
  fetchMinimizableStates,
  applyMinimizableStates,
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
  resolveViewerPendingReviewViaGraphql,
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
  minimizeComment,
  unminimizeComment,
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
if (typeof globalThis !== "undefined") {
  globalThis.PRTreeFetch = fetchApi;
}
try {
  if (typeof module !== "undefined" && module?.exports !== void 0) module.exports = fetchApi;
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
  MINIMIZE_COMMENT: "PR_TREE_MINIMIZE_COMMENT",
  UNMINIMIZE_COMMENT: "PR_TREE_UNMINIMIZE_COMMENT",
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
        hasMinimize: typeof PRTreeFetch?.minimizeComment === "function",
        hasUnminimize: typeof PRTreeFetch?.unminimizeComment === "function",
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
          subjectType: message.subjectType || message.subject_type || "line",
          pendingReviewNodeId: message.pendingReviewNodeId || null,
          pendingReviewId: message.pendingReviewId || null
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
    case MSG.MINIMIZE_COMMENT: {
      const token = await tokenForMessage(message);
      if (!token) throw new Error("GitHub PAT required to hide comments");
      if (typeof PRTreeFetch.minimizeComment !== "function") {
        throw new Error("Hide comment API unavailable");
      }
      const result = await PRTreeFetch.minimizeComment(
        message.subjectNodeId || message.nodeId,
        message.classifier || message.reason || "OFF_TOPIC",
        fetchImpl(),
        token,
        apiCtx
      );
      return { ok: true, result };
    }
    case MSG.UNMINIMIZE_COMMENT: {
      const token = await tokenForMessage(message);
      if (!token) throw new Error("GitHub PAT required to unhide comments");
      if (typeof PRTreeFetch.unminimizeComment !== "function") {
        throw new Error("Unhide comment API unavailable");
      }
      const result = await PRTreeFetch.unminimizeComment(
        message.subjectNodeId || message.nodeId,
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
