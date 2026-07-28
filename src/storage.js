/**
 * AUTO-GENERATED from src/storage.ts
 * SOURCE OF TRUTH: src/storage.ts — do not edit this .js
 * Rebuild: node scripts/build-content-ts.mjs
 */
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
