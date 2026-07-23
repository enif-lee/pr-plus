/**
 * IndexedDB persistence for PR detail snapshots (content-script).
 */
(function () {
  const DEFAULT_DB = 'pr-plus-detail-cache';
  const DEFAULT_STORE = 'pr-details';
  /** Bump to drop oversized v1 snapshots (full patches) that froze openModal. */
  const DEFAULT_DB_VERSION = 2;
  const DEFAULT_MAX_ENTRIES = 24;
  const DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

  function openDb(factory, dbName, storeName) {
    return new Promise((resolve, reject) => {
      const req = factory.open(dbName, DEFAULT_DB_VERSION);
      req.onerror = () => reject(req.error || new Error('IDB open failed'));
      req.onupgradeneeded = () => {
        const db = req.result;
        // Recreate store on version bump so slim schema starts clean
        if (db.objectStoreNames.contains(storeName)) {
          db.deleteObjectStore(storeName);
        }
        const store = db.createObjectStore(storeName, { keyPath: 'key' });
        store.createIndex('accessedAt', 'accessedAt', { unique: false });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
      };
      req.onsuccess = () => resolve(req.result);
    });
  }

  function idbReq(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('IDB request failed'));
    });
  }

  function txDone(tx) {
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('IDB tx failed'));
      tx.onabort = () => reject(tx.error || new Error('IDB tx aborted'));
    });
  }

  function sanitizeDetailForCache(detail) {
    if (!detail || typeof detail !== 'object') return detail;
    const {
      _fetchTimings,
      _metaSeq,
      _dropPending,
      files,
      ...rest
    } = detail;

    const slimFiles = Array.isArray(files)
      ? files.map((f) => {
          if (!f || typeof f !== 'object') return f;
          const {
            patch,
            contents_url,
            raw_url,
            blob_url,
            ...meta
          } = f;
          return { ...meta, patch: '', _patchOmitted: true };
        })
      : files;

    return {
      ...rest,
      files: slimFiles,
      comments: Array.isArray(rest.comments) ? rest.comments : [],
      reviews: Array.isArray(rest.reviews) ? rest.reviews : [],
      reviewComments: Array.isArray(rest.reviewComments) ? rest.reviewComments : [],
      reviewThreads: Array.isArray(rest.reviewThreads) ? rest.reviewThreads : [],
      commits: Array.isArray(rest.commits) ? rest.commits : [],
    };
  }

  function normalizeDetailSnapshot(detail) {
    if (!detail || typeof detail !== 'object') return null;
    const n = Number(detail.number);
    if (!Number.isFinite(n) || n <= 0) return null;
    if (!detail.owner || !detail.repo) return null;
    return {
      ...detail,
      number: n,
      owner: String(detail.owner),
      repo: String(detail.repo),
      title: detail.title == null ? '' : String(detail.title),
      files: Array.isArray(detail.files) ? detail.files : [],
      comments: Array.isArray(detail.comments) ? detail.comments : [],
      reviews: Array.isArray(detail.reviews) ? detail.reviews : [],
      reviewComments: Array.isArray(detail.reviewComments)
        ? detail.reviewComments
        : [],
      reviewThreads: Array.isArray(detail.reviewThreads)
        ? detail.reviewThreads
        : [],
      commits: Array.isArray(detail.commits) ? detail.commits : [],
    };
  }

  function createDetailIdb(options = {}) {
    const dbName = options.dbName || DEFAULT_DB;
    const storeName = options.storeName || DEFAULT_STORE;
    const maxEntries =
      Number.isFinite(options.maxEntries) && options.maxEntries > 0
        ? Math.floor(options.maxEntries)
        : DEFAULT_MAX_ENTRIES;
    const maxAgeMs =
      Number.isFinite(options.maxAgeMs) && options.maxAgeMs > 0
        ? Math.floor(options.maxAgeMs)
        : DEFAULT_MAX_AGE_MS;
    const now = typeof options.now === 'function' ? options.now : () => Date.now();
    const factory =
      options.indexedDB !== undefined
        ? options.indexedDB
        : typeof indexedDB !== 'undefined'
          ? indexedDB
          : null;

    let dbPromise = null;

    function getDb() {
      if (!factory) return Promise.resolve(null);
      if (!dbPromise) {
        dbPromise = openDb(factory, dbName, storeName).catch((err) => {
          dbPromise = null;
          throw err;
        });
      }
      return dbPromise;
    }

    async function get(key) {
      if (!key) return null;
      const db = await getDb();
      if (!db) return null;
      const tx = db.transaction(storeName, 'readonly');
      const row = await idbReq(tx.objectStore(storeName).get(key));
      await txDone(tx).catch(() => {});
      if (!row || row.value == null) return null;
      if (row.updatedAt + maxAgeMs <= now()) {
        void del(key);
        return null;
      }
      void touch(key, row);
      return row;
    }

    async function touch(key, row) {
      try {
        const db = await getDb();
        if (!db) return;
        const next = { ...row, accessedAt: now() };
        const tx = db.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).put(next);
        await txDone(tx);
      } catch {
        /* ignore */
      }
    }

    async function set(key, value) {
      if (!key) return;
      const db = await getDb();
      if (!db) return;
      const t = now();
      const row = {
        key,
        value: sanitizeDetailForCache(value),
        updatedAt: t,
        accessedAt: t,
      };
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).put(row);
      await txDone(tx);
      await prune(db);
    }

    async function del(key) {
      if (!key) return;
      const db = await getDb();
      if (!db) return;
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).delete(key);
      await txDone(tx);
    }

    async function clear() {
      const db = await getDb();
      if (!db) return;
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).clear();
      await txDone(tx);
    }

    async function prune(db) {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const all = (await idbReq(store.getAll())) || [];
      const t = now();
      const keep = [];
      for (const row of all) {
        if (!row || row.updatedAt + maxAgeMs <= t) {
          store.delete(row.key);
        } else {
          keep.push(row);
        }
      }
      if (keep.length > maxEntries) {
        keep.sort((a, b) => (a.accessedAt || 0) - (b.accessedAt || 0));
        const drop = keep.length - maxEntries;
        for (let i = 0; i < drop; i++) store.delete(keep[i].key);
      }
      await txDone(tx).catch(() => {});
    }

    return {
      dbName,
      storeName,
      maxEntries,
      maxAgeMs,
      get,
      set,
      delete: del,
      clear,
    };
  }

  const api = { createDetailIdb, sanitizeDetailForCache, normalizeDetailSnapshot };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof globalThis !== 'undefined') globalThis.PRModalDetailIdb = api;
})();
