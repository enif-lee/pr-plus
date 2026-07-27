/**
 * PR detail cache — memory SWR + optional IndexedDB (TanStack Query style).
 */
(function () {
  function createDetailCache(options = {}) {
    const ttlMs = Number.isFinite(options.ttlMs) ? options.ttlMs : 60_000;
    const now = typeof options.now === 'function' ? options.now : () => Date.now();
    const store = new Map();

    function cacheKey(owner, repo, number) {
      return `${String(owner || '').toLowerCase()}/${String(repo || '').toLowerCase()}#${Number(number)}`;
    }

    function get(key) {
      if (!key) return null;
      const entry = store.get(key);
      if (!entry) return null;
      if (entry.expiresAt <= now()) return null;
      return entry.value;
    }

    function peek(key) {
      if (!key) return { value: null, fresh: false, stale: false, source: null };
      const entry = store.get(key);
      if (!entry) return { value: null, fresh: false, stale: false, source: null };
      const fresh = entry.expiresAt > now();
      return {
        value: entry.value,
        fresh,
        stale: !fresh,
        source: 'memory',
      };
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

    return { ttlMs, cacheKey, get, peek, set, invalidate, clear, size };
  }

  function stripEphemeral(detail) {
    if (!detail || typeof detail !== 'object') return detail;
    const { _fetchTimings, _metaSeq, _dropPending, ...rest } = detail;
    return rest;
  }

  function sanitizeDetailForCache(detail, opts) {
    if (globalThis.PRModalDetailIdb?.sanitizeDetailForCache) {
      return globalThis.PRModalDetailIdb.sanitizeDetailForCache(detail, opts);
    }
    return stripEphemeral(detail);
  }

  function isDetailCompleteForFullCache(detail) {
    if (globalThis.PRModalDetailIdb?.isDetailCompleteForFullCache) {
      return globalThis.PRModalDetailIdb.isDetailCompleteForFullCache(detail);
    }
    return false;
  }

  function normalizeDetailSnapshot(detail) {
    if (globalThis.PRModalDetailIdb?.normalizeDetailSnapshot) {
      return globalThis.PRModalDetailIdb.normalizeDetailSnapshot(detail);
    }
    if (!detail || typeof detail !== 'object') return null;
    const n = Number(detail.number);
    if (!Number.isFinite(n) || n <= 0) return null;
    if (!detail.owner || !detail.repo) return null;
    return detail;
  }

  /**
   * Memory + IDB write-through. peekAsync hydrates after page reload.
   */
  function createPersistedDetailCache(options = {}) {
    const ttlMs = Number.isFinite(options.ttlMs) ? options.ttlMs : 60_000;
    const now = typeof options.now === 'function' ? options.now : () => Date.now();
    const memory = createDetailCache({ ttlMs, now });

    let idb = null;
    if (options.idb === null) {
      idb = null;
    } else if (options.idb) {
      idb = options.idb;
    } else if (typeof options.createIdb === 'function') {
      try {
        idb = options.createIdb() || null;
      } catch {
        idb = null;
      }
    } else if (globalThis.PRModalDetailIdb?.createDetailIdb) {
      try {
        idb = globalThis.PRModalDetailIdb.createDetailIdb({
          maxEntries: options.maxEntries,
          maxAgeMs: options.maxAgeMs,
          indexedDB: options.indexedDB,
          now,
        });
      } catch {
        idb = null;
      }
    }

    async function peekAsync(key) {
      const mem = memory.peek(key);
      if (mem.value != null) {
        const v = normalizeDetailSnapshot(mem.value) || mem.value;
        return { ...mem, value: v, source: mem.source || 'memory' };
      }
      if (!idb || !key) {
        return { value: null, fresh: false, stale: false, source: null };
      }
      try {
        const row = await idb.get(key);
        if (!row || row.value == null) {
          return { value: null, fresh: false, stale: false, source: null };
        }
        const value = normalizeDetailSnapshot(row.value);
        if (!value) {
          return { value: null, fresh: false, stale: false, source: null };
        }
        const age = Math.max(0, now() - (row.updatedAt || 0));
        const fresh = age < ttlMs;
        // Keep a short memory TTL even when stale so we don't thrash IDB
        memory.set(key, value, fresh ? Math.max(1, ttlMs - age) : Math.min(ttlMs, 30_000));
        return {
          value,
          fresh,
          stale: !fresh,
          source: 'idb',
        };
      } catch {
        return { value: null, fresh: false, stale: false, source: null };
      }
    }

    function set(key, value, customTtlMs) {
      if (!key) return;
      // Memory: full snapshot (patches kept) for instant same-session reopen
      const live = stripEphemeral(value);
      memory.set(key, live, customTtlMs);
      if (idb) {
        // IDB: full files/diff/commits when complete; otherwise slim (no patches)
        const full = isDetailCompleteForFullCache(value);
        const durable = sanitizeDetailForCache(value, { full });
        void Promise.resolve()
          .then(() => idb.set(key, durable))
          .catch(() => {});
      }
    }

    function invalidate(key) {
      memory.invalidate(key);
      if (idb && key) void idb.delete(key).catch(() => {});
    }

    async function clear() {
      memory.clear();
      if (idb) {
        try {
          await idb.clear();
        } catch {
          /* ignore */
        }
      }
    }

    return {
      ttlMs,
      cacheKey: memory.cacheKey,
      get: memory.get,
      peek: memory.peek,
      peekAsync,
      set,
      invalidate,
      clear,
      size: memory.size,
    };
  }

  const api = {
    createDetailCache,
    createPersistedDetailCache,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof globalThis !== 'undefined') globalThis.PRModalDetailCache = api;
})();
