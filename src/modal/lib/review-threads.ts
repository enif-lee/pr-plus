/** @module modal/lib/review-threads */
/**
 * Pure review-thread grouping, counts, resolve/reply request builders.
 */

/**
 * Group review comments into threads by root (in_reply_to_id).
 * @param {Array} comments
 * @returns {Array<{ id, path, line, side, root, replies, resolved, threadNodeId }>}
 */
export function groupReviewThreads(comments) {
  const list = Array.isArray(comments) ? comments : [];
  const byId = new Map();
  for (const c of list) {
    if (c && c.id != null) byId.set(String(c.id), c);
  }
  const roots = [];
  const children = new Map();
  for (const c of list) {
    if (!c) continue;
    const parentId = c.inReplyToId ?? c.in_reply_to_id ?? null;
    if (parentId != null && byId.has(String(parentId))) {
      const key = String(parentId);
      if (!children.has(key)) children.set(key, []);
      children.get(key).push(c);
    } else {
      roots.push(c);
    }
  }
  return roots.map((root) => {
    const replies = (children.get(String(root.id)) || []).slice().sort((a, b) =>
      String(a.createdAt || a.created_at || '').localeCompare(
        String(b.createdAt || b.created_at || '')
      )
    );
    return {
      id: root.id,
      path: root.path || '',
      line: root.line ?? root.original_line ?? null,
      side: root.side || 'RIGHT',
      root,
      replies,
      resolved: Boolean(root.resolved ?? root.isResolved),
      outdated: Boolean(root.outdated),
      pending: Boolean(
        root.pending || replies.some((r) => r && r.pending)
      ),
      threadNodeId: root.threadNodeId || root.thread_id || root.pullRequestReviewThreadId || null,
      count: 1 + replies.length,
    };
  });
}

/**
 * Merge GraphQL review-thread metadata onto REST review comments.
 * GitHub REST list comments never includes thread GraphQL ids or isResolved;
 * threads come from repository.pullRequest.reviewThreads.
 *
 * @param {Array<{ id?: number|string }>} comments mapped REST comments
 * @param {Array<{ threadNodeId: string, resolved?: boolean, commentIds?: Array<number|string> }>} threads
 * @returns {Array}
 */
export function mergeReviewThreadMeta(comments, threads) {
  const list = Array.isArray(comments) ? comments : [];
  /** @type {Map<string, { threadNodeId: string, resolved: boolean }>} */
  const byCommentId = new Map();
  for (const t of Array.isArray(threads) ? threads : []) {
    if (!t || !t.threadNodeId) continue;
    const meta = {
      threadNodeId: String(t.threadNodeId),
      resolved: Boolean(t.resolved),
    };
    for (const id of t.commentIds || []) {
      if (id == null) continue;
      byCommentId.set(String(id), meta);
    }
  }
  return list.map((c) => {
    if (!c) return c;
    const meta = c.id != null ? byCommentId.get(String(c.id)) : null;
    if (!meta) {
      return {
        ...c,
        threadNodeId: c.threadNodeId || null,
        resolved: Boolean(c.resolved),
      };
    }
    return {
      ...c,
      threadNodeId: meta.threadNodeId,
      resolved: meta.resolved,
    };
  });
}

/**
 * Normalize GraphQL reviewThreads.nodes into merge-friendly rows.
 * @param {Array} nodes
 */
export function mapGraphqlReviewThreads(nodes) {
  if (!Array.isArray(nodes)) return [];
  return nodes
    .filter((t) => t && t.id)
    .map((t) => ({
      threadNodeId: t.id,
      resolved: Boolean(t.isResolved),
      commentIds: (t.comments?.nodes || [])
        .map((c) => c?.databaseId)
        .filter((id) => id != null),
    }));
}

/**
 * Count review threads (root comments) per file path.
 * @param {Array} comments
 * @returns {Map<string, number>}
 */
export function countReviewThreadsByPath(comments) {
  const threads = groupReviewThreads(comments);
  const map = new Map();
  for (const t of threads) {
    const p = t.path || '';
    if (!p) continue;
    map.set(p, (map.get(p) || 0) + 1);
  }
  return map;
}

/**
 * Count **unresolved** review threads per file path.
 * @param {Array} comments
 * @returns {Map<string, number>}
 */
export function countUnresolvedReviewThreadsByPath(comments) {
  const threads = groupReviewThreads(comments);
  const map = new Map();
  for (const t of threads) {
    if (t.resolved) continue;
    const p = t.path || '';
    if (!p) continue;
    map.set(p, (map.get(p) || 0) + 1);
  }
  return map;
}

/**
 * Count **pending review threads** (root units), not individual replies.
 * A thread counts once when its root or any reply is still PENDING.
 * @param {Array} comments
 * @returns {number}
 */
export function countPendingReviewThreads(comments) {
  const threads = groupReviewThreads(comments);
  let n = 0;
  for (const t of threads) {
    if (t.pending) n += 1;
  }
  return n;
}

/**
 * Count **pending** (unsubmitted) review threads per file path.
 * A thread is pending when the root or any reply is still PENDING.
 * Also counts any comment with `pending: true` by path so optimistic /
 * reply-only drafts still drive the Diff file filter.
 * @param {Array} comments
 * @returns {Map<string, number>}
 */
export function countPendingReviewThreadsByPath(comments) {
  const map = new Map();
  const threads = groupReviewThreads(comments);
  for (const t of threads) {
    if (!t.pending) continue;
    const p = t.path || '';
    if (!p) continue;
    map.set(p, (map.get(p) || 0) + 1);
  }
  // Ensure every pending comment path is represented (root-less / optimistic)
  for (const c of Array.isArray(comments) ? comments : []) {
    if (!c?.pending) continue;
    const p = c.path || '';
    if (!p || map.has(p)) continue;
    map.set(p, 1);
  }
  return map;
}

/**
 * Aggregate thread totals for Diff review filter labels.
 * Aligns with Diff comment nav: thread **roots** only, optionally limited to
 * paths present in the current file list (so badge counts match 0/N nav).
 *
 * - unresolved: open submitted threads (excludes pending drafts)
 * - resolved: resolved threads
 * - pendingThreads: pending threads
 *
 * @param {Array} comments
 * @param {{
 *   allowedPaths?: Set<string>|string[]|null,
 *   excludeOutdated?: boolean,
 * }} [opts]
 * @returns {{ total: number, unresolved: number, resolved: number, pendingThreads: number }}
 */
export function countReviewThreadTotals(comments, opts: any = {}) {
  const pathSet =
    opts?.allowedPaths instanceof Set
      ? opts.allowedPaths
      : opts?.allowedPaths
        ? new Set(
            Array.isArray(opts.allowedPaths)
              ? opts.allowedPaths.map(String).filter(Boolean)
              : []
          )
        : null;
  const excludeOutdated = Boolean(opts?.excludeOutdated);
  const threads = groupReviewThreads(comments);
  let total = 0;
  let unresolved = 0;
  let resolved = 0;
  let pendingThreads = 0;
  for (const t of threads) {
    const p = t.path || '';
    // No path → not placeable on Diff; skip so counts match nav
    if (!p) continue;
    if (pathSet && !pathSet.has(p)) continue;
    if (excludeOutdated && t.outdated) continue;
    total += 1;
    if (t.pending) pendingThreads += 1;
    if (t.resolved) resolved += 1;
    else if (!t.pending) unresolved += 1;
  }
  return { total, unresolved, resolved, pendingThreads };
}

/**
 * Coerce a review-comment id to a positive integer (REST database id).
 * GraphQL node ids / non-numeric values → null.
 * @param {unknown} raw
 * @returns {number|null}
 */
export function normalizeReviewCommentId(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    return Math.floor(raw);
  }
  const s = String(raw).trim();
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Walk in_reply_to chain to the top-level review comment.
 * GitHub rejects replies-to-replies (422 Validation Failed).
 *
 * @param {Array<{ id?: number|string, inReplyToId?: number|string|null, in_reply_to_id?: number|string|null }>} comments
 * @param {unknown} commentId any id in the thread
 * @returns {number|null} root REST id
 */
export function resolveRootReviewCommentId(comments, commentId) {
  const start = normalizeReviewCommentId(commentId);
  if (start == null) return null;
  const byId = new Map();
  for (const c of Array.isArray(comments) ? comments : []) {
    if (!c || c.id == null) continue;
    const id = normalizeReviewCommentId(c.id);
    if (id != null) byId.set(id, c);
  }
  let cur = byId.get(start) || null;
  if (!cur) return start;
  const seen = new Set();
  while (cur) {
    const id = normalizeReviewCommentId(cur.id);
    if (id == null || seen.has(id)) break;
    seen.add(id);
    const parentRaw = cur.inReplyToId ?? cur.in_reply_to_id ?? null;
    const parentId = normalizeReviewCommentId(parentRaw);
    if (parentId == null || !byId.has(parentId)) return id;
    cur = byId.get(parentId);
  }
  return start;
}

/**
 * Shape GraphQL thread-reply mutation (preferred when pending review exists).
 * REST POST /comments and /replies 422 if the user already has a pending review.
 */
export function buildReplyReviewThreadGraphql(threadNodeId, body) {
  return {
    method: 'POST',
    url: 'https://api.github.com/graphql',
    body: {
      query: `mutation($id:ID!,$body:String!){
  addPullRequestReviewThreadReply(input:{pullRequestReviewThreadId:$id,body:$body}){
    comment { databaseId body }
  }
}`,
      variables: {
        id: String(threadNodeId || ''),
        body: String(body || '').trim(),
      },
    },
  };
}

/**
 * Shape REST fallback reply (no pending review only).
 * POST /repos/{owner}/{repo}/pulls/{pull}/comments/{id}/replies
 */
export function buildReplyReviewCommentRequest(owner, repo, pullNumber, commentId, body) {
  const parentId = normalizeReviewCommentId(commentId);
  const text = String(body || '').trim();
  return {
    method: 'POST',
    url: `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}/comments/${parentId ?? commentId}/replies`,
    body: { body: text },
  };
}

/**
 * GraphQL resolve / unresolve review thread.
 * @param {string} threadNodeId GraphQL node id (PRRT_…)
 * @param {boolean} resolved
 */
export function buildResolveThreadGraphql(threadNodeId, resolved = true) {
  const mutation = resolved
    ? `mutation($id:ID!){ resolveReviewThread(input:{threadId:$id}){ thread { id isResolved } } }`
    : `mutation($id:ID!){ unresolveReviewThread(input:{threadId:$id}){ thread { id isResolved } } }`;
  return {
    method: 'POST',
    url: 'https://api.github.com/graphql',
    body: {
      query: mutation,
      variables: { id: threadNodeId },
    },
  };
}

/**
 * Filter files by path query (case-insensitive substring).
 */
export function filterFilesByQuery(files, query) {
  const list = Array.isArray(files) ? files : [];
  const q = String(query || '')
    .trim()
    .toLowerCase();
  if (!q) return list.slice();
  return list.filter((f) => {
    const path = String(f.filename || f.path || '').toLowerCase();
    return path.includes(q);
  });
}

/**
 * Toggle path in a viewed set (immutable).
 * @param {Set<string>|string[]} viewed
 * @param {string} path
 * @returns {Set<string>}
 */
export function toggleViewedPath(viewed, path) {
  const next = viewed instanceof Set ? new Set(viewed) : new Set(viewed || []);
  const p = String(path || '');
  if (!p) return next;
  if (next.has(p)) next.delete(p);
  else next.add(p);
  return next;
}

export function isPathViewed(viewed, path) {
  if (!path) return false;
  if (viewed instanceof Set) return viewed.has(path);
  if (Array.isArray(viewed)) return viewed.includes(path);
  return false;
}

/** GraphQL reviewThreads connection max page size. */
export const REVIEW_THREADS_API_MAX = 100;

/**
 * Warm-cache revalidate probe size for `last:N` newest window.
 * Small enough to cut nested comments/diffHunk cost; large enough to
 * detect new head threads without always escalating.
 */
export const REVIEW_THREADS_WARM_PROBE_SIZE = 10;

/**
 * True when detail already holds durable review-thread data worth probing
 * instead of cold last:100.
 * @param {any} detail
 * @returns {boolean}
 */
export function hasUsableReviewThreadsCache(detail) {
  if (!detail || typeof detail !== 'object') return false;
  if (detail._sketch) return false;
  const threads = Array.isArray(detail.reviewThreads) ? detail.reviewThreads : [];
  const comments = Array.isArray(detail.reviewComments)
    ? detail.reviewComments
    : [];
  const meta = detail.reviewThreadsMeta || {};
  const loadedMeta = Number(meta.loadedThreadCount);
  const withNode =
    threads.some((t) => t && t.threadNodeId) ||
    comments.some((c) => c && c.threadNodeId);
  if (!withNode && !(loadedMeta > 0) && threads.length === 0 && comments.length === 0) {
    return false;
  }
  // Need at least one PRRT id (or loaded meta) to compare against probe.
  return withNode || loadedMeta > 0;
}

/**
 * Pick GraphQL pageSize for newest reviewThreads fetch.
 * @param {{ warmCache?: boolean, forceFull?: boolean }} [opts]
 * @returns {number}
 */
export function pickNewestThreadsPageSize(opts: any = {}) {
  if (opts?.forceFull) return REVIEW_THREADS_API_MAX;
  if (opts?.warmCache) return REVIEW_THREADS_WARM_PROBE_SIZE;
  return REVIEW_THREADS_API_MAX;
}

/**
 * Count comments belonging to a thread in a page or detail.
 * @param {any} pageOrDetail
 * @param {string} threadNodeId
 * @param {any} [thread] optional thread row with commentIds
 */
function countCommentsForThread(pageOrDetail, threadNodeId, thread = null) {
  const id = String(threadNodeId || '');
  if (!id) return 0;
  if (thread && Array.isArray(thread.commentIds) && thread.commentIds.length) {
    return thread.commentIds.length;
  }
  const comments = Array.isArray(pageOrDetail?.comments)
    ? pageOrDetail.comments
    : Array.isArray(pageOrDetail?.reviewComments)
      ? pageOrDetail.reviewComments
      : [];
  let n = 0;
  for (const c of comments) {
    if (c && c.threadNodeId != null && String(c.threadNodeId) === id) n += 1;
  }
  return n;
}

/**
 * Whether a small newest probe page is consistent with cached threads —
 * safe to skip escalating to last:100.
 *
 * Outside-probe resolve drift is handled separately by unresolved byIds bulk.
 *
 * @param {any} page fetchReviewThreadsPage result
 * @param {any} detail cached detail
 * @returns {{ match: boolean, reason: string }}
 */
export function newestThreadsPageMatchesCache(page, detail) {
  if (!page || !detail) {
    return { match: false, reason: 'missing' };
  }
  if (!hasUsableReviewThreadsCache(detail)) {
    return { match: false, reason: 'no-cache' };
  }

  const pageThreads = Array.isArray(page.threads) ? page.threads : [];
  const cachedThreads = Array.isArray(detail.reviewThreads)
    ? detail.reviewThreads
    : [];
  const byId = new Map();
  for (const t of cachedThreads) {
    if (t?.threadNodeId) byId.set(String(t.threadNodeId), t);
  }
  // Fallback: build synthetic rows from comments if reviewThreads empty
  if (byId.size === 0) {
    for (const c of Array.isArray(detail.reviewComments) ? detail.reviewComments : []) {
      if (!c?.threadNodeId) continue;
      const id = String(c.threadNodeId);
      if (!byId.has(id)) {
        byId.set(id, {
          threadNodeId: id,
          resolved: Boolean(c.resolved),
        });
      }
    }
  }

  const pageTotal =
    typeof page.totalCount === 'number' && Number.isFinite(page.totalCount)
      ? page.totalCount
      : null;
  const cachedTotalRaw = detail.reviewThreadsMeta?.totalCount;
  const cachedTotal =
    typeof cachedTotalRaw === 'number' && Number.isFinite(cachedTotalRaw)
      ? cachedTotalRaw
      : null;
  if (pageTotal != null && cachedTotal != null && pageTotal !== cachedTotal) {
    return { match: false, reason: 'totalCount' };
  }

  const pageIds = [];
  for (const t of pageThreads) {
    if (!t?.threadNodeId) continue;
    const id = String(t.threadNodeId);
    pageIds.push(id);
    const cached = byId.get(id);
    if (!cached) {
      return { match: false, reason: 'unknown-thread' };
    }
    if (Boolean(cached.resolved) !== Boolean(t.resolved)) {
      return { match: false, reason: 'resolved' };
    }
    const pageN = countCommentsForThread(page, id, t);
    if (pageN > 0) {
      const cacheN = countCommentsForThread(detail, id, cached);
      // Cache may lag body-only edits with same count; count mismatch ⇒ new/deleted reply
      if (cacheN > 0 && cacheN !== pageN) {
        return { match: false, reason: 'comment-count' };
      }
      // Cache missing comments for a known thread id (incomplete local) → escalate
      if (cacheN === 0 && pageN > 0 && byId.has(id) && Array.isArray(detail.reviewComments)) {
        // If we have no comments at all in detail, don't force escalate (sketchy cache)
        if (detail.reviewComments.length > 0) {
          return { match: false, reason: 'comment-count' };
        }
      }
    }
  }

  const prevNewest = Array.isArray(detail.reviewThreadsMeta?.newestThreadIds)
    ? detail.reviewThreadsMeta.newestThreadIds.map(String).filter(Boolean)
    : [];
  if (prevNewest.length > 0 && pageIds.length > 0) {
    for (let i = 0; i < pageIds.length; i++) {
      if (String(prevNewest[i] || '') !== pageIds[i]) {
        return { match: false, reason: 'order' };
      }
    }
  }

  return { match: true, reason: 'ok' };
}

/**
 * After a warm probe, should we re-fetch last:API_MAX?
 * @param {any} page
 * @param {any} detail
 * @param {number} pageSize size used for the probe
 * @returns {boolean}
 */
export function shouldEscalateNewestThreadsProbe(page, detail, pageSize) {
  const size = Math.max(0, Number(pageSize) || 0);
  if (size >= REVIEW_THREADS_API_MAX) return false;
  if (!hasUsableReviewThreadsCache(detail)) return true;
  return !newestThreadsPageMatchesCache(page, detail).match;
}
