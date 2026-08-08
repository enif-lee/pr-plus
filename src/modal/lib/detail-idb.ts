/**
 * IndexedDB persistence for PR detail snapshots (content-script / page origin).
 * Used as the durable layer under memory SWR cache.
 */

export type DetailIdbRow = {
  key: string;
  value: unknown;
  updatedAt: number;
  accessedAt: number;
};

export type DetailIdbOptions = {
  dbName?: string;
  storeName?: string;
  /** Soft cap on number of PR snapshots (LRU by accessedAt). Default 24. */
  maxEntries?: number;
  /** Drop entries older than this (ms). Default 7 days. */
  maxAgeMs?: number;
  /** Injectable for tests. */
  indexedDB?: IDBFactory | null;
  now?: () => number;
};

const DEFAULT_DB = 'pr-plus-detail-cache';
const DEFAULT_STORE = 'pr-details';
/** Bump to drop oversized v1 snapshots (full patches) that froze openModal. */
const DEFAULT_DB_VERSION = 2;
const DEFAULT_MAX_ENTRIES = 24;
const DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function openDb(
  factory: IDBFactory,
  dbName: string,
  storeName: string
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = factory.open(dbName, DEFAULT_DB_VERSION);
    req.onerror = () => reject(req.error || new Error('IDB open failed'));
    req.onupgradeneeded = () => {
      const db = req.result;
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

function idbReq<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IDB request failed'));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('IDB tx failed'));
    tx.onabort = () => reject(tx.error || new Error('IDB tx aborted'));
  });
}

/** Soft cap on total patch text stored in IDB (bytes, UTF-16 length proxy). */
export const MAX_FULL_CACHE_PATCH_CHARS = 3_500_000;

/**
 * True when a PR file entry is allowed to lack a textual patch body
 * (binary, rename/delete, or zero-line change). Slim cache rows use
 * `_patchOmitted` and must NOT count as complete Diff bodies.
 */
export function fileAllowsMissingPatch(file: any): boolean {
  if (!file || typeof file !== 'object') return false;
  if (file._patchOmitted) return false;
  const st = String(file.status || file.changeType || '').toLowerCase();
  const binary = Boolean(file.binary || file.isBinary);
  const noChange =
    Number(file.changes) === 0 ||
    (Number(file.additions || 0) === 0 && Number(file.deletions || 0) === 0);
  return (
    binary ||
    st === 'renamed' ||
    st === 'removed' ||
    st === 'deleted' ||
    noChange
  );
}

/**
 * True when `files` can paint Diff text (or are legitimately patchless).
 * False when empty, slim (`_patchOmitted`), or text changes lack patch bodies —
 * callers must re-fetch via ensureAllFiles / fetchPrFiles.
 *
 * Note: GitHub REST omits patch for oversized files without setting
 * `_patchOmitted`. That is *not* fixed by re-fetch — use
 * `filesListNeedsFullFetch` for re-fetch gates so Diff does not loop
 * "Loading all files…".
 */
export function filesListHasUsableDiffBodies(files: any): boolean {
  if (!Array.isArray(files) || files.length === 0) return false;
  let anyPatch = false;
  let missingRequired = false;
  for (const f of files) {
    if (!f || typeof f !== 'object') continue;
    if (f._patchOmitted) {
      missingRequired = true;
      continue;
    }
    const patch = typeof f.patch === 'string' ? f.patch : '';
    if (patch.length > 0) {
      anyPatch = true;
      continue;
    }
    if (!fileAllowsMissingPatch(f)) {
      missingRequired = true;
    }
  }
  if (missingRequired) return false;
  // All entries ok without patch (binaries only) OR at least one real patch.
  return anyPatch || true;
}

/**
 * True when Diff should call fetchAllPrFiles again.
 * - empty list
 * - incomplete vs `changedFiles` count
 * - slim IDB / meta rows (`_patchOmitted`)
 *
 * False after a full REST page even if some text files lack `patch`
 * (GitHub-omitted large diffs). Re-fetching never restores those bodies.
 */
export function filesListNeedsFullFetch(
  files: any,
  changedFiles?: number | null
): boolean {
  if (!Array.isArray(files) || files.length === 0) return true;
  for (const f of files) {
    if (f && typeof f === 'object' && f._patchOmitted) return true;
  }
  const total = Number(changedFiles);
  if (Number.isFinite(total) && total > files.length) return true;
  return false;
}

/** Normalize Git head SHA for equality checks (trim + lower). */
export function normalizeHeadSha(sha: any): string {
  return String(sha || '').trim().toLowerCase();
}

/**
 * True when both values are non-empty and equal after normalize.
 * Empty/missing SHAs never match (forces fetch rather than false reuse).
 */
export function sameHeadSha(a: any, b: any): boolean {
  const sa = normalizeHeadSha(a);
  const sb = normalizeHeadSha(b);
  return Boolean(sa && sb && sa === sb);
}

export type FilesCommitsDiffReuseDecision = {
  /** Cache and live/network share a non-empty head SHA (or provisional same). */
  sameHead: boolean;
  /** Reuse cached files[] including usable diff bodies — skip full files fetch. */
  reuseFiles: boolean;
  /** Reuse cached commits[] — skip commits list fetch. */
  reuseCommits: boolean;
  /** Stable reason code for logs / e2e (e.g. reuse, head-mismatch, cache-slim). */
  reason: string;
};

/**
 * Decide whether cached files / commits / diff bodies may be reused without
 * re-fetch when the live/network core head SHA matches the cache.
 *
 * @param cacheDetail cached or current detail snapshot
 * @param networkOrLive freshly loaded core (or seed with headSha); when null,
 *   cache is evaluated against its own headSha (provisional side-fetch kick)
 */
export function mayReuseFilesCommitsDiff(
  cacheDetail: any,
  networkOrLive: any = null
): FilesCommitsDiffReuseDecision {
  const cache =
    cacheDetail && typeof cacheDetail === 'object' ? cacheDetail : null;
  if (!cache) {
    return {
      sameHead: false,
      reuseFiles: false,
      reuseCommits: false,
      reason: 'no-cache',
    };
  }
  const live =
    networkOrLive && typeof networkOrLive === 'object'
      ? networkOrLive
      : cache;
  const cacheSha = normalizeHeadSha(cache.headSha);
  const liveSha = normalizeHeadSha(live.headSha);

  if (liveSha && cacheSha && liveSha !== cacheSha) {
    return {
      sameHead: false,
      reuseFiles: false,
      reuseCommits: false,
      reason: 'head-mismatch',
    };
  }
  if (!cacheSha && !liveSha) {
    return {
      sameHead: false,
      reuseFiles: false,
      reuseCommits: false,
      reason: 'missing-head-sha',
    };
  }
  // Provisional: cache has sha and live is empty (core still in flight) OR equal
  const sameHead = Boolean(
    cacheSha && (!liveSha || liveSha === cacheSha)
  );
  if (!sameHead) {
    return {
      sameHead: false,
      reuseFiles: false,
      reuseCommits: false,
      reason: 'cache-missing-sha',
    };
  }

  const files = Array.isArray(cache.files) ? cache.files : [];
  const commits = Array.isArray(cache.commits) ? cache.commits : [];
  const filesUsable =
    files.length > 0 &&
    filesListHasUsableDiffBodies(files) &&
    !files.some((f: any) => f && f._patchOmitted) &&
    !filesListNeedsFullFetch(files, cache.changedFiles ?? live.changedFiles);

  const reuseFiles = filesUsable;
  const reuseCommits = commits.length > 0;

  let reason = 'reuse';
  if (!reuseFiles && !reuseCommits) reason = 'cache-slim-or-empty';
  else if (!reuseFiles) reason = 'reuse-commits-only';
  else if (!reuseCommits) reason = 'reuse-files-only';

  return { sameHead, reuseFiles, reuseCommits, reason };
}

/**
 * True when detail has finished loading files (with patches), commits, and is
 * safe to promote into a durable full snapshot (not a progressive partial).
 */
export function isDetailCompleteForFullCache(detail: any): boolean {
  if (!detail || typeof detail !== 'object') return false;
  if (detail._sketch) return false;
  if (detail._cacheFull === true) return true;

  const files = Array.isArray(detail.files) ? detail.files : [];
  if (!files.length) return false;
  // Slim snapshots mark omitted patches — never treat as full
  if (files.some((f: any) => f && f._patchOmitted)) return false;
  if (!filesListHasUsableDiffBodies(files)) return false;

  const commits = Array.isArray(detail.commits) ? detail.commits : [];
  if (!commits.length) return false;

  let patchChars = 0;
  for (const f of files) {
    if (!f || typeof f !== 'object') continue;
    const patch = typeof f.patch === 'string' ? f.patch : '';
    if (patch.length) patchChars += patch.length;
  }
  if (patchChars > MAX_FULL_CACHE_PATCH_CHARS) return false;
  return true;
}

export type SanitizeDetailOptions = {
  /**
   * true → keep file patches + commits (full cache)
   * false → always slim (omit patches)
   * omit → auto: full when complete, else slim
   */
  full?: boolean;
};

/**
 * Strip ephemeral fields for durable cache.
 * Full mode keeps patches+commits when load is complete (and under size cap).
 * Slim mode keeps file metadata only so Diff can revalidate patches.
 */
export function sanitizeDetailForCache(detail: any, opts: SanitizeDetailOptions = {}) {
  if (!detail || typeof detail !== 'object') return detail;
  // Host-data-first: do not durable-cache _dropPending (it hid live GitHub
  // PENDING after Discard). Ephemeral _fetchTimings/_metaSeq stay stripped.
  const {
    _fetchTimings: _t,
    _metaSeq: _m,
    _dropPending: _dropIgnored,
    files,
    ...rest
  } = detail;

  const wantFull =
    opts.full === true
      ? true
      : opts.full === false
        ? false
        : isDetailCompleteForFullCache(detail);

  const nextFiles = Array.isArray(files)
    ? files.map((f: any) => {
        if (!f || typeof f !== 'object') return f;
        const {
          contents_url: _cu,
          raw_url: _ru,
          blob_url: _bu,
          ...meta
        } = f;
        if (wantFull) {
          const { _patchOmitted: _po, ...keep } = meta as any;
          return {
            ...keep,
            patch: typeof f.patch === 'string' ? f.patch : f.patch || '',
          };
        }
        const { patch: _p, ...slimMeta } = meta as any;
        return { ...slimMeta, patch: '', _patchOmitted: true };
      })
    : files;

  // Never durable-cache orphan/demoted pending rows after Discard (vpr cleared).
  // Demoted (pending:false + body) rehydrate on reopen as non-pending "ghost reviews".
  const vprId = rest.viewerPendingReview?.id;
  const hasVpr =
    vprId != null && String(vprId).trim() !== '' && String(vprId) !== '0';
  let reviewComments = Array.isArray(rest.reviewComments)
    ? rest.reviewComments
    : [];
  let viewerPendingReview = rest.viewerPendingReview ?? null;
  const deleted = new Set<string>();
  const delSrc = rest._deletedReviewCommentIds;
  if (delSrc instanceof Set) {
    for (const id of delSrc) deleted.add(String(id));
  } else if (Array.isArray(delSrc)) {
    for (const id of delSrc) if (id != null) deleted.add(String(id));
  }
  const bodyTombs = new Set<string>(
    Array.isArray(rest._deletedReviewBodies)
      ? rest._deletedReviewBodies.map((b: any) => String(b || '').trim()).filter(Boolean)
      : []
  );
  if (!hasVpr) {
    viewerPendingReview = null;
    const nextRc: any[] = [];
    for (const c of reviewComments) {
      if (!c || c.id == null) continue;
      const id = String(c.id);
      if (deleted.has(id)) continue;
      const body = String(c.body || '').trim();
      if (body && bodyTombs.has(body)) {
        deleted.add(id);
        continue;
      }
      // Explicit pending rows
      if (c.pending) {
        deleted.add(id);
        if (body) bodyTombs.add(body);
        continue;
      }
      // Demoted orphans still carrying pendingReviewId
      if (
        c.pendingReviewId != null &&
        String(c.pendingReviewId).trim() !== '' &&
        String(c.pendingReviewId) !== '0'
      ) {
        deleted.add(id);
        if (body) bodyTombs.add(body);
        continue;
      }
      nextRc.push(c);
    }
    reviewComments = nextRc;
  } else if (deleted.size || bodyTombs.size) {
    // With live VPR, never tombstone pending rows out of the cache snapshot.
    reviewComments = reviewComments.filter((c: any) => {
      if (!c || c.id == null) return false;
      if (c.pending) return true;
      if (deleted.has(String(c.id))) return false;
      const body = String(c.body || '').trim();
      if (body && bodyTombs.has(body)) return false;
      return true;
    });
  }

  return {
    ...rest,
    files: nextFiles,
    comments: Array.isArray(rest.comments) ? rest.comments : [],
    reviews: Array.isArray(rest.reviews) ? rest.reviews : [],
    reviewComments,
    reviewThreads: Array.isArray(rest.reviewThreads) ? rest.reviewThreads : [],
    commits: Array.isArray(rest.commits) ? rest.commits : [],
    viewerPendingReview,
    // Keep id/body tombs for demoted ghosts only — not _dropPending latch.
    _deletedReviewCommentIds: deleted.size ? [...deleted] : rest._deletedReviewCommentIds,
    _deletedReviewBodies: bodyTombs.size ? [...bodyTombs] : rest._deletedReviewBodies,
    _cacheFull: wantFull ? true : undefined,
  };
}

/** Ensure host/App never receive corrupt shapes from IDB. */
export function normalizeDetailSnapshot(detail: any) {
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
    reviewThreads: Array.isArray(detail.reviewThreads) ? detail.reviewThreads : [],
    commits: Array.isArray(detail.commits) ? detail.commits : [],
  };
}

/**
 * Create an IndexedDB-backed key/value store for PR detail JSON.
 */
export function createDetailIdb(options: DetailIdbOptions = {}) {
  const dbName = options.dbName || DEFAULT_DB;
  const storeName = options.storeName || DEFAULT_STORE;
  const maxEntries =
    Number.isFinite(options.maxEntries) && (options.maxEntries as number) > 0
      ? Math.floor(options.maxEntries as number)
      : DEFAULT_MAX_ENTRIES;
  const maxAgeMs =
    Number.isFinite(options.maxAgeMs) && (options.maxAgeMs as number) > 0
      ? Math.floor(options.maxAgeMs as number)
      : DEFAULT_MAX_AGE_MS;
  const now = typeof options.now === 'function' ? options.now : () => Date.now();
  const factory =
    options.indexedDB !== undefined
      ? options.indexedDB
      : typeof indexedDB !== 'undefined'
        ? indexedDB
        : null;

  let dbPromise: Promise<IDBDatabase> | null = null;

  function getDb(): Promise<IDBDatabase | null> {
    if (!factory) return Promise.resolve(null);
    if (!dbPromise) {
      dbPromise = openDb(factory, dbName, storeName).catch((err) => {
        dbPromise = null;
        throw err;
      });
    }
    return dbPromise;
  }

  async function get(key: string): Promise<DetailIdbRow | null> {
    if (!key) return null;
    const db = await getDb();
    if (!db) return null;
    const tx = db.transaction(storeName, 'readonly');
    const row = (await idbReq(
      tx.objectStore(storeName).get(key)
    )) as DetailIdbRow | undefined;
    await txDone(tx).catch(() => {});
    if (!row || row.value == null) return null;
    if (row.updatedAt + maxAgeMs <= now()) {
      // Hard-expired — drop async
      void del(key);
      return null;
    }
    // Touch accessedAt (best-effort)
    void touch(key, row);
    return row;
  }

  async function touch(key: string, row: DetailIdbRow) {
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

  async function set(key: string, value: unknown): Promise<void> {
    if (!key) return;
    const db = await getDb();
    if (!db) return;
    const t = now();
    const row: DetailIdbRow = {
      key,
      // set() receives already-sanitized value from createPersistedDetailCache,
      // or raw detail — auto full/slim via completeness check.
      value: sanitizeDetailForCache(value),
      updatedAt: t,
      accessedAt: t,
    };
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(row);
    await txDone(tx);
    await prune(db);
  }

  async function del(key: string): Promise<void> {
    if (!key) return;
    const db = await getDb();
    if (!db) return;
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).delete(key);
    await txDone(tx);
  }

  async function clear(): Promise<void> {
    const db = await getDb();
    if (!db) return;
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).clear();
    await txDone(tx);
  }

  async function prune(db: IDBDatabase): Promise<void> {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const all = (await idbReq(store.getAll())) as DetailIdbRow[];
    const t = now();
    const keep: DetailIdbRow[] = [];
    for (const row of all || []) {
      if (!row || row.updatedAt + maxAgeMs <= t) {
        store.delete(row.key);
      } else {
        keep.push(row);
      }
    }
    if (keep.length > maxEntries) {
      keep.sort((a, b) => (a.accessedAt || 0) - (b.accessedAt || 0));
      const drop = keep.length - maxEntries;
      for (let i = 0; i < drop; i++) {
        store.delete(keep[i].key);
      }
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
    /** Test helper: force open */
    _getDb: getDb,
  };
}

export type DetailIdb = ReturnType<typeof createDetailIdb>;
