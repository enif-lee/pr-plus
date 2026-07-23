/**
 * PAT storage helpers.
 *
 * Storage location: chrome.storage.local (extension-private, not page-accessible,
 * not synced to Google account). Key: "githubToken".
 *
 * Security notes:
 * - Prefer reading the token only from the extension service worker / popup.
 * - Content scripts must not call getGithubToken(); use background messaging.
 * - UI only ever displays a mask, never the full secret after save.
 */

const TOKEN_KEY = 'githubToken';
/** User prefs in chrome.storage.local (non-secret). */
const PREFS_KEY = 'extensionPrefs';

/**
 * Default extension preferences.
 * - fastReview: progressive dual-window load (core first, threads on demand)
 * - reverseComments: composer → merge box → conversation (latest-first timeline)
 */
const DEFAULT_PREFS = {
  fastReview: true,
  reverseComments: true,
};

function getStorageArea(storageApi = globalThis.chrome?.storage?.local) {
  return storageApi || null;
}

/**
 * Normalize prefs object; unknown keys dropped, missing keys filled from defaults.
 * @param {unknown} raw
 * @returns {{ fastReview: boolean, reverseComments: boolean }}
 */
function normalizePrefs(raw) {
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
  };
}

/**
 * @param {unknown} [storageApi]
 * @returns {Promise<{ fastReview: boolean, reverseComments: boolean }>}
 */
function getExtensionPrefs(storageApi) {
  const area = getStorageArea(storageApi);
  if (!area) return Promise.resolve({ ...DEFAULT_PREFS });

  return new Promise((resolve) => {
    area.get([PREFS_KEY], (result) => {
      resolve(normalizePrefs(result?.[PREFS_KEY]));
    });
  });
}

/**
 * Merge patch into stored prefs and return the full next prefs.
 * @param {Partial<{ fastReview: boolean, reverseComments: boolean }>} patch
 * @param {unknown} [storageApi]
 */
async function setExtensionPrefs(patch, storageApi) {
  const area = getStorageArea(storageApi);
  if (!area) return Promise.reject(new Error('chrome.storage unavailable'));

  const prev = await getExtensionPrefs(area);
  const next = normalizePrefs({
    ...prev,
    ...(patch && typeof patch === 'object' ? patch : {}),
  });

  return new Promise((resolve, reject) => {
    area.set({ [PREFS_KEY]: next }, () => {
      const err = globalThis.chrome?.runtime?.lastError;
      if (err) reject(err);
      else resolve(next);
    });
  });
}

/**
 * Watch prefs changes (local area only).
 * @param {(prefs: { fastReview: boolean, reverseComments: boolean }) => void} onChange
 * @param {unknown} [storageApi]
 */
function watchExtensionPrefs(onChange, storageApi = globalThis.chrome?.storage) {
  if (!storageApi?.onChanged || typeof onChange !== 'function') return () => {};

  const listener = (changes, areaName) => {
    if (areaName !== 'local' || !changes[PREFS_KEY]) return;
    onChange(normalizePrefs(changes[PREFS_KEY].newValue));
  };

  storageApi.onChanged.addListener(listener);
  return () => storageApi.onChanged.removeListener(listener);
}

/** Mask for UI — keep only last 4 chars (no usable prefix leak). */
function maskGithubToken(token) {
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
function looksLikeGithubToken(token) {
  if (typeof token !== 'string') return false;
  const t = token.trim();
  // Classic PATs ~40+, fine-grained often 80–255; allow a wide band.
  if (t.length < 20 || t.length > 400) return false;
  if (/\s/.test(t)) return false;
  // ghp_/gho_/ghu_/ghs_/ghr_ classic; github_pat_ fine-grained
  return /^(gh[pours]_|github_pat_)[A-Za-z0-9_]+$/.test(t);
}

function getGithubToken(storageApi) {
  const area = getStorageArea(storageApi);
  if (!area) return Promise.resolve(null);

  return new Promise((resolve) => {
    area.get([TOKEN_KEY], (result) => {
      const token = result?.[TOKEN_KEY];
      resolve(typeof token === 'string' && token.trim() ? token.trim() : null);
    });
  });
}

async function getGithubTokenStatus(storageApi) {
  const token = await getGithubToken(storageApi);
  if (!token) {
    return { configured: false, mask: '' };
  }
  return { configured: true, mask: maskGithubToken(token) };
}

function setGithubToken(token, storageApi) {
  const area = getStorageArea(storageApi);
  if (!area) return Promise.reject(new Error('chrome.storage unavailable'));

  const value = typeof token === 'string' ? token.trim() : '';
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
          'Invalid token format. Use a GitHub PAT (ghp_… / github_pat_…).'
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

function watchGithubToken(onChange, storageApi = globalThis.chrome?.storage) {
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

const storageApi = {
  TOKEN_KEY,
  PREFS_KEY,
  DEFAULT_PREFS,
  normalizePrefs,
  maskGithubToken,
  looksLikeGithubToken,
  getGithubToken,
  getGithubTokenStatus,
  setGithubToken,
  watchGithubToken,
  getExtensionPrefs,
  setExtensionPrefs,
  watchExtensionPrefs,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = storageApi;
}
if (typeof globalThis !== 'undefined') {
  globalThis.PRTreeStorage = storageApi;
}
