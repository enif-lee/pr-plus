/**
 * AUTO-GENERATED from src/github-endpoints.ts
 * SOURCE OF TRUTH: src/github-endpoints.ts — do not edit this .js
 * Rebuild: node scripts/build-content-ts.mjs
 */
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
})(typeof globalThis !== "undefined" ? globalThis : globalThis);
