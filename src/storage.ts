/**
 * PAT storage helpers.
 *
 * Storage location: chrome.storage.local (extension-private, not page-accessible,
 * not synced to Google account).
 *
 * Keys:
 * - "githubToken"     — default PAT for github.com public cloud only
 * - "hostAccounts"    — up to 3 enterprise host↔PAT pairs
 * - "extensionPrefs"  — non-secret UI prefs (no tokens)
 *
 * Security notes:
 * - Prefer reading tokens only from the extension service worker / popup.
 * - Content scripts must not call getGithubToken() / getTokenForWebHost();
 *   use background messaging.
 * - UI only ever displays a mask, never the full secret after save.
 */

const TOKEN_KEY = 'githubToken';
/** Enterprise host↔PAT pairs (secrets). */
const HOST_ACCOUNTS_KEY = 'hostAccounts';
/** User prefs in chrome.storage.local (non-secret). */
const PREFS_KEY = 'extensionPrefs';
/**
 * One-shot first-run tour flag (separate from extensionPrefs so feature-flag
 * patches cannot drop or race the completion bit).
 */
const ONBOARDING_KEY = 'onboardingCompleted';

/**
 * Default extension preferences.
 * - fastReview: progressive dual-window load (core first, threads on demand)
 * - reverseComments: composer → merge box → conversation (latest-first timeline)
 * - autoOpenEmbed: on GitHub PR routes, open pr+ embed automatically (vs native + toggle)
 * - singleFileMode: Diff virtual list shows only the active file (nav still lists all)
 * - treeView: PR stack tree indent on /pulls list (toggle also in list header)
 * - onboardingCompleted: first-run pulls-page tour finished (or skipped)
 *
 * Enterprise hosts are NOT in prefs — they live in HOST_ACCOUNTS_KEY with paired PATs.
 * Legacy `enterpriseWebHosts` (hosts-only list) is dropped on normalize (re-register required).
 */
const DEFAULT_PREFS = {
  fastReview: true,
  reverseComments: true,
  autoOpenEmbed: true,
  singleFileMode: false,
  treeView: true,
  onboardingCompleted: false,
};

function getStorageArea(storageApi: any = (globalThis as any).chrome?.storage?.local) {
  return storageApi || null;
}

/**
 * Normalize prefs object; unknown keys dropped, missing keys filled from defaults.
 * @param {unknown} raw
 * @returns {{
 *   fastReview: boolean,
 *   reverseComments: boolean,
 *   autoOpenEmbed: boolean,
 *   singleFileMode: boolean,
 *   treeView: boolean,
 *   onboardingCompleted: boolean,
 * }}
 */
function normalizePrefs(raw: any) {
  const src = raw && typeof raw === 'object' ? raw : {};

  return {
    fastReview:
      typeof src.fastReview === 'boolean'
        ? src.fastReview
        : DEFAULT_PREFS.fastReview,
    reverseComments:
      typeof src.reverseComments === 'boolean'
        ? src.reverseComments
        : DEFAULT_PREFS.reverseComments,
    autoOpenEmbed:
      typeof src.autoOpenEmbed === 'boolean'
        ? src.autoOpenEmbed
        : DEFAULT_PREFS.autoOpenEmbed,
    singleFileMode:
      typeof src.singleFileMode === 'boolean'
        ? src.singleFileMode
        : DEFAULT_PREFS.singleFileMode,
    treeView:
      typeof src.treeView === 'boolean' ? src.treeView : DEFAULT_PREFS.treeView,
    onboardingCompleted:
      typeof src.onboardingCompleted === 'boolean'
        ? src.onboardingCompleted
        : DEFAULT_PREFS.onboardingCompleted,
  };
}

/**
 * @param {unknown} raw
 * @returns {{ host: string, token: string }[]}
 */
function normalizeHostAccounts(raw: any) {
  if (globalThis.PRGithubEndpoints?.normalizeHostAccounts) {
    return globalThis.PRGithubEndpoints.normalizeHostAccounts(raw);
  }
  // Fallback without endpoints module (tests may load storage alone).
  const list = Array.isArray(raw) ? raw : [];
  const out = [];
  const seen = new Set();
  for (const row of list) {
    if (!row || typeof row !== 'object') continue;
    let host = String(row.host || '')
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/\/.*$/, '')
      .replace(/:\d+$/, '');
    if (host.includes('@')) host = host.slice(host.lastIndexOf('@') + 1);
    const token = typeof row.token === 'string' ? row.token.trim() : '';
    if (!host || host === 'github.com' || host === 'www.github.com') continue;
    if (host.endsWith('.github.com')) continue;
    if (!token || seen.has(host)) continue;
    seen.add(host);
    out.push({ host, token });
    if (out.length >= 3) break;
  }
  return out;
}

/**
 * @param {unknown} [storageApi]
 * @returns {Promise<{
 *   fastReview: boolean,
 *   reverseComments: boolean,
 *   autoOpenEmbed: boolean,
 *   singleFileMode: boolean,
 *   treeView: boolean,
 *   onboardingCompleted: boolean,
 * }>}
 */
function getExtensionPrefs(storageApi: any) {
  const area = getStorageArea(storageApi);
  if (!area) return Promise.resolve({ ...(DEFAULT_PREFS as any) });

  return new Promise((resolve) => {
    area.get([PREFS_KEY], (result) => {
      resolve(normalizePrefs(result?.[PREFS_KEY]));
    });
  });
}

/**
 * Merge patch into stored prefs and return the full next prefs.
 * @param {Partial<{
 *   fastReview: boolean,
 *   reverseComments: boolean,
 *   autoOpenEmbed: boolean,
 *   singleFileMode: boolean,
 *   treeView: boolean,
 *   onboardingCompleted: boolean,
 * }>} patch
 * @param {unknown} [storageApi]
 */
async function setExtensionPrefs(patch: any, storageApi: any) {
  const area = getStorageArea(storageApi);
  if (!area) return Promise.reject(new Error('chrome.storage unavailable'));

  const prev = await getExtensionPrefs(area);
  const next = normalizePrefs({
    ...(prev as any),
    ...(patch && typeof patch === 'object' ? patch : {}),
  });

  return new Promise((resolve, reject) => {
    area.set({ [PREFS_KEY]: next }, () => {
      const err = (globalThis as any).chrome?.runtime?.lastError;
      if (err) reject(err);
      else resolve(next);
    });
  });
}

/**
 * Watch prefs changes (local area only).
 * @param {(prefs: {
 *   fastReview: boolean,
 *   reverseComments: boolean,
 *   autoOpenEmbed: boolean,
 *   singleFileMode: boolean,
 *   treeView: boolean,
 *   onboardingCompleted: boolean,
 * }) => void} onChange
 * @param {unknown} [storageApi]
 */
function watchExtensionPrefs(onChange: any, storageApi: any = (globalThis as any).chrome?.storage) {
  if (!storageApi?.onChanged || typeof onChange !== 'function') return () => {};

  const listener = (changes, areaName) => {
    if (areaName !== 'local' || !changes[PREFS_KEY]) return;
    onChange(normalizePrefs(changes[PREFS_KEY].newValue));
  };

  storageApi.onChanged.addListener(listener);
  return () => storageApi.onChanged.removeListener(listener);
}

/**
 * Whether the first-run pulls onboarding tour has been finished or skipped.
 * @param {unknown} [storageApi]
 * @returns {Promise<boolean>}
 */
function getOnboardingCompleted(storageApi: any) {
  const area = getStorageArea(storageApi);
  if (!area) return Promise.resolve(false);
  return new Promise((resolve) => {
    area.get([ONBOARDING_KEY, PREFS_KEY], (result) => {
      // Dedicated key wins; fall back to legacy prefs field for older installs
      if (typeof result?.[ONBOARDING_KEY] === 'boolean') {
        resolve(Boolean(result[ONBOARDING_KEY]));
        return;
      }
      const prefs = normalizePrefs(result?.[PREFS_KEY]);
      resolve(Boolean(prefs.onboardingCompleted));
    });
  });
}

/**
 * Mark (or clear) the first-run tour as done.
 * @param {boolean} completed
 * @param {unknown} [storageApi]
 * @returns {Promise<boolean>}
 */
async function setOnboardingCompleted(completed: any, storageApi: any) {
  const area = getStorageArea(storageApi);
  if (!area) return Promise.reject(new Error('chrome.storage unavailable'));
  const value = Boolean(completed);
  // Dedicated key first (source of truth), then mirror into prefs
  await new Promise((resolve, reject) => {
    area.set({ [ONBOARDING_KEY]: value }, () => {
      const err = (globalThis as any).chrome?.runtime?.lastError;
      if (err) reject(err);
      else resolve(undefined);
    });
  });
  try {
    await setExtensionPrefs({ onboardingCompleted: value }, area);
  } catch {
    /* key already written */
  }
  return value;
}

/** Mask for UI — keep only last 4 chars (no usable prefix leak). */
function maskGithubToken(token: any) {
  if (!token || typeof token !== 'string') return '';
  const trimmed = token.trim();
  if (!trimmed) return '';
  if (trimmed.length <= 4) return '••••••••';
  return `${'•'.repeat(8)}${trimmed.slice(-4)}`;
}

/**
 * Looks like a GitHub PAT (classic ghp_/gho_/… or fine-grained github_pat_).
 * Rejects obvious garbage; does not guarantee validity.
 */
function looksLikeGithubToken(token: any) {
  if (typeof token !== 'string') return false;
  const t = token.trim();
  // Classic PATs ~40+, fine-grained often 80–255; allow a wide band.
  if (t.length < 20 || t.length > 400) return false;
  if (/\s/.test(t)) return false;
  // ghp_/gho_/ghu_/ghs_/ghr_ classic; github_pat_ fine-grained
  return /^(gh[pours]_|github_pat_)[A-Za-z0-9_]+$/.test(t);
}

function getGithubToken(storageApi: any) {
  const area = getStorageArea(storageApi);
  if (!area) return Promise.resolve(null);

  return new Promise((resolve) => {
    area.get([TOKEN_KEY], (result) => {
      const token = result?.[TOKEN_KEY];
      resolve(typeof token === 'string' && token.trim() ? token.trim() : null);
    });
  });
}

async function getGithubTokenStatus(storageApi: any) {
  const token = await getGithubToken(storageApi);
  if (!token) {
    return { configured: false, mask: '' };
  }
  return { configured: true, mask: maskGithubToken(token) };
}

function setGithubToken(token: any, storageApi: any) {
  const area = getStorageArea(storageApi);
  if (!area) return Promise.reject(new Error('chrome.storage unavailable'));

  const value = typeof token === 'string' ? token.trim() : '';
  return new Promise((resolve, reject) => {
    if (!value) {
      area.remove([TOKEN_KEY], () => {
        const err = (globalThis as any).chrome?.runtime?.lastError;
        if (err) reject(err);
        else resolve(false);
      });
      return;
    }

    if (!looksLikeGithubToken(value)) {
      reject(
        new Error(
          'Invalid token format. Use a GitHub PAT (ghp_… / github_pat_…).'
        )
      );
      return;
    }

    area.set({ [TOKEN_KEY]: value }, () => {
      const err = (globalThis as any).chrome?.runtime?.lastError;
      if (err) reject(err);
      else resolve(true);
    });
  });
}

function watchGithubToken(onChange: any, storageApi: any = (globalThis as any).chrome?.storage) {
  if (!storageApi?.onChanged) return () => {};

  const listener = (changes, areaName) => {
    if (areaName !== 'local' || !changes[TOKEN_KEY]) return;
    const next = changes[TOKEN_KEY].newValue;
    // Callers must treat this as a signal only; avoid logging the value.
    onChange(typeof next === 'string' && next.trim() ? next.trim() : null);
  };

  storageApi.onChanged.addListener(listener);
  return () => storageApi.onChanged.removeListener(listener);
}

/**
 * @param {unknown} [storageApi]
 * @returns {Promise<{ host: string, token: string }[]>}
 */
function getHostAccounts(storageApi: any) {
  const area = getStorageArea(storageApi);
  if (!area) return Promise.resolve([]);

  return new Promise((resolve) => {
    area.get([HOST_ACCOUNTS_KEY], (result) => {
      resolve(normalizeHostAccounts(result?.[HOST_ACCOUNTS_KEY]));
    });
  });
}

/**
 * Hostnames only (for content-script registration / tab query). Never tokens.
 * @param {unknown} [storageApi]
 * @returns {Promise<string[]>}
 */
async function getHostAccountHosts(storageApi: any) {
  const accounts = await getHostAccounts(storageApi);
  if (globalThis.PRGithubEndpoints?.hostsFromAccounts) {
    return globalThis.PRGithubEndpoints.hostsFromAccounts(accounts);
  }
  // @ts-expect-error classic content-script dynamic shapes
  return accounts.map((a) => a.host);
}

/**
 * UI-safe list (host + mask only).
 * @param {unknown} [storageApi]
 * @returns {Promise<{ host: string, mask: string }[]>}
 */
async function getHostAccountsPublic(storageApi: any) {
  const accounts = await getHostAccounts(storageApi);
  // @ts-expect-error classic content-script dynamic shapes
  return accounts.map((a) => ({
    host: a.host,
    mask: maskGithubToken(a.token),
  }));
}

/**
 * Replace full hostAccounts list (already validated/normalized).
 * @param {unknown} accounts
 * @param {unknown} [storageApi]
 * @returns {Promise<{ host: string, token: string }[]>}
 */
async function setHostAccounts(accounts: any, storageApi: any) {
  const area = getStorageArea(storageApi);
  if (!area) return Promise.reject(new Error('chrome.storage unavailable'));

  const next = normalizeHostAccounts(accounts);
  return new Promise((resolve, reject) => {
    if (!next.length) {
      area.remove([HOST_ACCOUNTS_KEY], () => {
        const err = (globalThis as any).chrome?.runtime?.lastError;
        if (err) reject(err);
        else resolve([]);
      });
      return;
    }
    area.set({ [HOST_ACCOUNTS_KEY]: next }, () => {
      const err = (globalThis as any).chrome?.runtime?.lastError;
      if (err) reject(err);
      else resolve(next);
    });
  });
}

/**
 * Add or update one host↔PAT pair (max 3).
 * @param {unknown} host
 * @param {unknown} token
 * @param {unknown} [storageApi]
 * @returns {Promise<{ ok: true, accounts: {host:string,token:string}[] } | { ok: false, error: string, accounts: {host:string,token:string}[] }>}
 */
async function registerHostAccount(host: any, token: any, storageApi: any) {
  const existing = await getHostAccounts(storageApi);
  const t = typeof token === 'string' ? token.trim() : '';
  if (t && !looksLikeGithubToken(t)) {
    return {
      ok: false,
      error: 'Invalid token format. Use a GitHub PAT (ghp_… / github_pat_…).',
      accounts: existing,
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
    // Minimal fallback
    const h = String(host || '')
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/\/.*$/, '');
    if (!h || h === 'github.com') {
      result = {
        ok: false,
        error: 'Host is required',
        accounts: existing,
      };
    } else if (!t) {
      result = {
        ok: false,
        error: 'PAT is required for each enterprise host',
        accounts: existing,
      };
    } else if (
  // @ts-expect-error classic content-script dynamic shapes
      !existing.some((a) => a.host === h) &&
  // @ts-expect-error classic content-script dynamic shapes
      existing.length >= 3
    ) {
      result = {
        ok: false,
        error: 'At most 3 enterprise hosts',
        accounts: existing,
      };
    } else {
  // @ts-expect-error classic content-script dynamic shapes
      const idx = existing.findIndex((a) => a.host === h);
      const next =
        idx >= 0
  // @ts-expect-error classic content-script dynamic shapes
          ? existing.map((a, i) => (i === idx ? { host: h, token: t } : a))
          : [...(existing as any), { host: h, token: t }];
      result = { ok: true, accounts: next };
    }
  }
  if (!result.ok) return result;
  const saved = await setHostAccounts(result.accounts, storageApi);
  return { ok: true, accounts: saved };
}

/**
 * @param {unknown} host
 * @param {unknown} [storageApi]
 */
async function unregisterHostAccount(host: any, storageApi: any) {
  const existing = await getHostAccounts(storageApi);
  let next;
  if (globalThis.PRGithubEndpoints?.unregisterHostAccount) {
    next = globalThis.PRGithubEndpoints.unregisterHostAccount(
      existing,
      host
    ).accounts;
  } else {
    const h = String(host || '')
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/\/.*$/, '');
  // @ts-expect-error classic content-script dynamic shapes
    next = existing.filter((a) => a.host !== h);
  }
  const saved = await setHostAccounts(next, storageApi);
  return { ok: true, accounts: saved };
}

/**
 * Resolve which PAT to use for API traffic for this web host.
 * - github.com → default githubToken only
 * - registered enterprise host → that pair's token
 * - unregistered non-github.com (incl. *.ghe.com) → null
 *
 * @param {unknown} webHost
 * @param {unknown} [storageApi]
 * @returns {Promise<{ token: string|null, source: 'default'|'host'|null, host: string }>}
 */
async function getTokenForWebHost(webHost: any, storageApi: any) {
  const [defaultToken, hostAccounts] = await Promise.all([
    getGithubToken(storageApi),
    getHostAccounts(storageApi),
  ]);
  if (globalThis.PRGithubEndpoints?.selectTokenForWebHost) {
    return globalThis.PRGithubEndpoints.selectTokenForWebHost(webHost, {
      defaultToken,
      hostAccounts,
    });
  }
  // Fallback mirror of pure selection rules
  let host = String(webHost || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/:\d+$/, '');
  if (!host) host = 'github.com';
  if (host === 'www.github.com') host = 'github.com';
  if (host === 'github.com' || host.endsWith('.github.com')) {
    return {
      token: defaultToken,
      source: defaultToken ? 'default' : null,
      host: host === 'github.com' || host === 'www.github.com' ? 'github.com' : host,
    };
  }
  // @ts-expect-error classic content-script dynamic shapes
  const pair = hostAccounts.find((a) => a.host === host);
  if (pair) return { token: pair.token, source: 'host', host };
  return { token: null, source: null, host };
}

const storageApi = {
  TOKEN_KEY,
  HOST_ACCOUNTS_KEY,
  PREFS_KEY,
  ONBOARDING_KEY,
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
  getOnboardingCompleted,
  setOnboardingCompleted,
  getHostAccounts,
  getHostAccountHosts,
  getHostAccountsPublic,
  setHostAccounts,
  registerHostAccount,
  unregisterHostAccount,
  getTokenForWebHost,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = storageApi;
}
if (typeof globalThis !== 'undefined') {
  globalThis.PRTreeStorage = storageApi;
}
