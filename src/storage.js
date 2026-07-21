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

function getStorageArea(storageApi = globalThis.chrome?.storage?.local) {
  return storageApi || null;
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
  if (t.length < 20 || t.length > 300) return false;
  if (/\s/.test(t)) return false;
  return /^(gh[pours]|github_pat_)[A-Za-z0-9_]+$/.test(t);
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
  maskGithubToken,
  looksLikeGithubToken,
  getGithubToken,
  getGithubTokenStatus,
  setGithubToken,
  watchGithubToken,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = storageApi;
}
if (typeof globalThis !== 'undefined') {
  globalThis.PRTreeStorage = storageApi;
}
