/** @module modal/lib/detail-cache */
/**
 * PR detail cache — memory SWR + optional IndexedDB persistence (TanStack Query style).
 * 1) Serve cached snapshot immediately (memory, then IDB)
 * 2) Revalidate over the network and write through
 */

import {
  isDetailCompleteForFullCache,
  sanitizeDetailForCache as sanitizeForIdb,
} from './detail-idb';

/** Optional durable store (IndexedDB adapter). */
export type DetailIdbLike = {
  get: (key: string) => Promise<{ value?: unknown; updatedAt?: number } | null>;
  set: (key: string, value: unknown) => Promise<void>;
  delete: (key: string) => Promise<void>;
  clear: () => Promise<void>;
};

function stripEphemeral(detail: any) {
  if (!detail || typeof detail !== 'object') return detail;
  const { _fetchTimings: _t, _metaSeq: _m, _dropPending: _d, ...rest } = detail;
  return rest;
}

/**
 * @param {{ ttlMs?: number, now?: () => number }} [options]
 */
export function createDetailCache(options: any = {}) {
  const ttlMs = Number.isFinite(options.ttlMs) ? options.ttlMs : 60_000;
  const now = typeof options.now === 'function' ? options.now : () => Date.now();
  /** @type {Map<string, { value: unknown, expiresAt: number }>} */
  const store = new Map();

  function cacheKey(owner: any, repo: any, number: any) {
    return `${String(owner || '').toLowerCase()}/${String(repo || '').toLowerCase()}#${Number(number)}`;
  }

  /**
   * Fresh value only. Expired entries remain for peek()/SWR until overwritten
   * or invalidated (get does not purge them).
   */
  function get(key: any) {
    if (!key) return null;
    const entry = store.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= now()) return null;
    return entry.value;
  }

  /**
   * Return cached value even if expired (for SWR), and whether it is fresh.
   */
  function peek(key: any) {
    if (!key) return { value: null, fresh: false, stale: false, source: null as string | null };
    const entry = store.get(key);
    if (!entry) return { value: null, fresh: false, stale: false, source: null as string | null };
    const fresh = entry.expiresAt > now();
    if (!fresh) {
      return { value: entry.value, fresh: false, stale: true, source: 'memory' };
    }
    return { value: entry.value, fresh: true, stale: false, source: 'memory' };
  }

  function set(key: any, value: any, customTtlMs: any) {
    if (!key) return;
    const ttl = Number.isFinite(customTtlMs) ? customTtlMs : ttlMs;
    store.set(key, { value, expiresAt: now() + ttl });
  }

  function invalidate(key: any) {
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

export type DetailCache = ReturnType<typeof createDetailCache>;

/**
 * Memory cache + durable IndexedDB. `peek` is sync (memory only);
 * `peekAsync` hydrates from IDB when memory is empty (page reload SWR).
 *
 * options.idb — prebuilt store; options.createIdb — factory when idb omitted.
 */
export function createPersistedDetailCache(options: any = {}) {
  const ttlMs = Number.isFinite(options.ttlMs) ? options.ttlMs : 60_000;
  const now = typeof options.now === 'function' ? options.now : () => Date.now();
  const memory = createDetailCache({ ttlMs, now });

  let idb: DetailIdbLike | null = null;
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
  }

  /**
   * Memory first; if empty, load IDB and warm memory.
   * @returns {Promise<{ value: unknown, fresh: boolean, stale: boolean, source: string|null }>}
   */
  async function peekAsync(key: string) {
    const mem = memory.peek(key);
    if (mem.value != null) {
      return { ...mem, source: mem.source || 'memory' };
    }
    if (!idb || !key) {
      return { value: null, fresh: false, stale: false, source: null };
    }
    try {
      const row = await idb.get(key);
      if (!row || row.value == null) {
        return { value: null, fresh: false, stale: false, source: null };
      }
      // Hydrate memory so subsequent peeks are sync; treat as stale so UI revalidates
      const age = Math.max(0, now() - (row.updatedAt || 0));
      const fresh = age < ttlMs;
      // Keep a short memory TTL even when stale so we don't thrash IDB
      memory.set(key, row.value, fresh ? ttlMs - age : Math.min(ttlMs, 30_000));
      return {
        value: row.value,
        fresh,
        stale: !fresh,
        source: 'idb',
      };
    } catch {
      return { value: null, fresh: false, stale: false, source: null };
    }
  }

  function set(key: string, value: unknown, customTtlMs?: number) {
    if (!key) return;
    const live = stripEphemeral(value);
    memory.set(key, live, customTtlMs);
    if (idb) {
      // Full files/diff/commits when complete; slim otherwise (omit patches)
      const full = isDetailCompleteForFullCache(value);
      const durable = sanitizeForIdb(value, { full });
      void Promise.resolve()
        .then(() => idb!.set(key, durable))
        .catch(() => {
          /* IDB full / private mode — memory still works */
        });
    }
  }

  function invalidate(key: string) {
    memory.invalidate(key);
    if (idb && key) {
      void idb.delete(key).catch(() => {});
    }
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
    /** @internal */
    _idb: idb,
  };
}
