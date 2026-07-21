/**
 * Short-lived PR detail cache (stale-while-revalidate friendly).
 * Pure: injectable clock for unit tests.
 */

/**
 * @param {{ ttlMs?: number, now?: () => number }} [options]
 */
function createDetailCache(options = {}) {
  const ttlMs = Number.isFinite(options.ttlMs) ? options.ttlMs : 60_000;
  const now = typeof options.now === 'function' ? options.now : () => Date.now();
  /** @type {Map<string, { value: unknown, expiresAt: number }>} */
  const store = new Map();

  function cacheKey(owner, repo, number) {
    return `${String(owner || '').toLowerCase()}/${String(repo || '').toLowerCase()}#${Number(number)}`;
  }

  /**
   * Fresh value only. Expired entries remain for peek()/SWR until overwritten
   * or invalidated (get does not purge them).
   */
  function get(key) {
    if (!key) return null;
    const entry = store.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= now()) return null;
    return entry.value;
  }

  /**
   * Return cached value even if expired (for SWR), and whether it is fresh.
   */
  function peek(key) {
    if (!key) return { value: null, fresh: false, stale: false };
    const entry = store.get(key);
    if (!entry) return { value: null, fresh: false, stale: false };
    const fresh = entry.expiresAt > now();
    if (!fresh) {
      return { value: entry.value, fresh: false, stale: true };
    }
    return { value: entry.value, fresh: true, stale: false };
  }

  function set(key, value, customTtlMs) {
    if (!key) return;
    const ttl = Number.isFinite(customTtlMs) ? customTtlMs : ttlMs;
    store.set(key, { value, expiresAt: now() + ttl });
  }

  function invalidate(key) {
    if (key) store.delete(key);
  }

  function clear() {
    store.clear();
  }

  function size() {
    return store.size;
  }

  return {
    ttlMs,
    cacheKey,
    get,
    peek,
    set,
    invalidate,
    clear,
    size,
  };
}

const api = {
  createDetailCache,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}
if (typeof globalThis !== 'undefined') {
  globalThis.PRModalDetailCache = api;
}
