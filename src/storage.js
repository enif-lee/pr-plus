const TOKEN_KEY = 'githubToken';

function getStorageArea(storageApi = globalThis.chrome?.storage?.local) {
  return storageApi || null;
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
    onChange(typeof next === 'string' && next.trim() ? next.trim() : null);
  };

  storageApi.onChanged.addListener(listener);
  return () => storageApi.onChanged.removeListener(listener);
}

const storageApi = {
  TOKEN_KEY,
  getGithubToken,
  setGithubToken,
  watchGithubToken,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = storageApi;
}
if (typeof globalThis !== 'undefined') {
  globalThis.PRTreeStorage = storageApi;
}