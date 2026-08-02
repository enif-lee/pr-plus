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
 * Whether a GraphQL `comments` connection is a complete load for the thread.
 * Shell uses `comments(first:1){ totalCount nodes {…} }` as a root preview —
 * when totalCount > nodes.length, replies are still deferred (commentsLoaded:false).
 * Full by-id payloads omit totalCount or return all nodes → loaded.
 *
 * @param {any} commentsConn
 * @returns {boolean}
 */
export function graphqlCommentsAreFullyLoaded(commentsConn: any): boolean {
  if (!commentsConn || typeof commentsConn !== 'object') return false;
  const nodes = Array.isArray(commentsConn.nodes) ? commentsConn.nodes : [];
  const totalRaw = commentsConn.totalCount;
  const total =
    typeof totalRaw === 'number' && Number.isFinite(totalRaw) ? totalRaw : null;
  if (nodes.length === 0) return total === 0;
  if (total != null) return total <= nodes.length;
  // No totalCount → treat as full (by-ids / legacy fixtures).
  return true;
}

/**
 * Map GraphQL PullRequestReviewThread nodes → { threads, comments }.
 * Shell may include `comments(first:1)` root preview (description) without
 * marking the thread fully loaded when more comments exist.
 * Full by-id nodes include complete `comments` → commentsLoaded:true.
 *
 * @param {any[]} allNodes
 * @returns {{ threads: any[], comments: any[] }}
 */
export function mapGraphqlReviewThreadNodes(allNodes: any) {
  const threads = [];
  const comments = [];
  for (const t of Array.isArray(allNodes) ? allNodes : []) {
    if (!t?.id) continue;
    const commentsConnPresent =
      t.comments != null && typeof t.comments === 'object';
    const commentsLoaded =
      commentsConnPresent && graphqlCommentsAreFullyLoaded(t.comments);
    const commentIds = [];
    if (commentsConnPresent) {
      for (const node of t.comments?.nodes || []) {
        if (!node) continue;
        const dbId = node.databaseId ?? node.id;
        if (dbId == null) continue;
        const id =
          typeof dbId === 'number' ? dbId : Number(dbId) || String(dbId);
        commentIds.push(id);
        comments.push({
          id,
          body: node.body || '',
          path: node.path || t.path || '',
          line: node.line ?? t.line ?? null,
          side: t.diffSide || 'RIGHT',
          author: node.author?.login || '',
          avatarUrl: node.author?.avatarUrl || '',
          createdAt: node.createdAt || null,
          inReplyToId: node.replyTo?.databaseId ?? null,
          threadNodeId: t.id,
          resolved: Boolean(t.isResolved),
          outdated: Boolean(node.outdated ?? t.isOutdated),
          // Preview-only root when shell first:1 and more replies remain
          _commentsPreview: commentsLoaded ? false : true,
        });
      }
    }
    threads.push({
      threadNodeId: t.id,
      resolved: Boolean(t.isResolved),
      outdated: Boolean(t.isOutdated),
      path: t.path || '',
      line: t.line ?? t.originalLine ?? null,
      startLine: t.startLine ?? t.originalStartLine ?? null,
      side: t.diffSide || 'RIGHT',
      commentIds,
      commentsLoaded,
      commentCount:
        typeof t.comments?.totalCount === 'number'
          ? t.comments.totalCount
          : commentIds.length || null,
    });
  }
  return { threads, comments };
}

/**
 * Merge a by-ids full-comment page onto a shell threads page.
 * Unresolved threads get commentsLoaded:true; deferred shells stay false.
 *
 * @param {any} shellPage
 * @param {any} bulkPage
 * @returns {any}
 */
export function mergeCommentsBulkIntoThreadsPage(shellPage: any, bulkPage: any) {
  const shellThreads = Array.isArray(shellPage?.threads) ? shellPage.threads : [];
  const bulkThreads = Array.isArray(bulkPage?.threads) ? bulkPage.threads : [];
  const bulkComments = Array.isArray(bulkPage?.comments) ? bulkPage.comments : [];
  const byId = new Map(
    bulkThreads
      .filter((t) => t?.threadNodeId)
      .map((t) => [String(t.threadNodeId), t])
  );
  const threads = shellThreads.map((t) => {
    const id = t?.threadNodeId ? String(t.threadNodeId) : '';
    const full = id ? byId.get(id) : null;
    if (!full) {
      return {
        ...t,
        commentsLoaded: t.commentsLoaded === true,
      };
    }
    return {
      ...t,
      ...full,
      commentsLoaded: true,
      commentIds: Array.isArray(full.commentIds)
        ? full.commentIds
        : t.commentIds || [],
    };
  });
  const loadedIds = new Set(
    threads.filter((t) => t.commentsLoaded).map((t) => String(t.threadNodeId))
  );
  const prevComments = Array.isArray(shellPage?.comments)
    ? shellPage.comments
    : [];
  // Keep deferred first:1 root bodies; drop only empty placeholders and
  // previews for threads that just received a full bulk.
  const kept = retainShellCommentsAfterBulk(prevComments, loadedIds);
  const seen = new Set(kept.map((c) => String(c.id)));
  for (const c of bulkComments) {
    if (!c || c.id == null) continue;
    const k = String(c.id);
    if (seen.has(k)) continue;
    seen.add(k);
    kept.push(c);
  }
  // Deferred shells still need a row if no preview body exists.
  return {
    ...shellPage,
    threads,
    comments: ensureShellPlaceholderComments(threads, kept),
    shellOnly: false,
  };
}

/**
 * After eager by-ids bulk, decide which shell-page comments to keep.
 * - Fully loaded thread ids: drop placeholders + first:1 previews (bulk wins).
 * - Deferred threads: keep root preview bodies (description); drop empty
 *   shell placeholders only.
 *
 * @param {any[]} prevComments
 * @param {Set<string>|Iterable<string>} loadedIds threads with commentsLoaded
 * @returns {any[]}
 */
export function retainShellCommentsAfterBulk(
  prevComments: any,
  loadedIds: any
): any[] {
  const loaded =
    loadedIds instanceof Set
      ? loadedIds
      : new Set(
          [...(loadedIds || [])].map((id) => String(id || '').trim()).filter(Boolean)
        );
  const kept = [];
  for (const c of Array.isArray(prevComments) ? prevComments : []) {
    if (!c?.threadNodeId) continue;
    const tid = String(c.threadNodeId);
    if (loaded.has(tid)) {
      if (c._commentsPending || c._commentsPreview) continue;
      kept.push(c);
      continue;
    }
    // Deferred: preserve description preview; drop empty shell-only rows.
    if (c._commentsPending && !String(c.body || '').trim()) continue;
    kept.push(c);
  }
  return kept;
}

/**
 * Replace comments for hydrated threads **in place** (stable sibling order).
 * Walking prevComments, the first time a loaded threadNodeId is seen, emit that
 * thread's bulk comments at that position; drop old placeholders/previews for it.
 * Bulk-only threads (not in prev) append at end.
 *
 * @param {any[]} prevComments
 * @param {any[]} bulkComments
 * @param {Iterable<string>|Set<string>} loadedThreadIds PRRT ids hydrated
 * @returns {any[]}
 */
export function hydrateReviewCommentsInPlace(
  prevComments: any,
  bulkComments: any,
  loadedThreadIds: any
): any[] {
  const loaded =
    loadedThreadIds instanceof Set
      ? loadedThreadIds
      : new Set(
          [...(loadedThreadIds || [])]
            .map((id) => String(id || '').trim())
            .filter(Boolean)
        );
  if (!loaded.size) {
    return Array.isArray(prevComments) ? prevComments.slice() : [];
  }
  /** @type {Map<string, any[]>} */
  const bulkByTid = new Map();
  for (const c of Array.isArray(bulkComments) ? bulkComments : []) {
    if (!c || c.id == null) continue;
    const tid = String(c.threadNodeId || '').trim();
    if (!tid || !loaded.has(tid)) continue;
    if (!bulkByTid.has(tid)) bulkByTid.set(tid, []);
    const row = c._commentsPreview ? { ...c, _commentsPreview: false } : c;
    bulkByTid.get(tid).push(row);
  }
  const emitted = new Set();
  const result = [];
  for (const c of Array.isArray(prevComments) ? prevComments : []) {
    if (!c) continue;
    const tid = c.threadNodeId != null ? String(c.threadNodeId) : '';
    if (tid && loaded.has(tid)) {
      if (!emitted.has(tid)) {
        emitted.add(tid);
        const bulk = bulkByTid.get(tid) || [];
        for (const bc of bulk) result.push(bc);
      }
      continue;
    }
    result.push(c);
  }
  // Bulk-only threads never present in prev (should be rare on expand)
  for (const [tid, bulk] of bulkByTid) {
    if (emitted.has(tid)) continue;
    for (const bc of bulk) result.push(bc);
  }
  return result;
}

/**
 * Apply an ids/refresh comments bulk onto detail-like shape (pure).
 * Models host merge direction `ids` for lazy expand: marks commentsLoaded,
 * merges comments **in place** (preserves sibling thread order), drops shell
 * placeholders for loaded threads.
 *
 * @param {any} detail
 * @param {any} bulkPage from by-ids full fetch
 * @returns {any}
 */
export function mergeThreadCommentsBulkIntoDetail(detail: any, bulkPage: any) {
  if (!detail || typeof detail !== 'object') return detail;
  const prevTh = Array.isArray(detail.reviewThreads) ? detail.reviewThreads : [];
  const prevRc = Array.isArray(detail.reviewComments)
    ? detail.reviewComments
    : [];
  const bulkThreads = Array.isArray(bulkPage?.threads) ? bulkPage.threads : [];
  const bulkComments = Array.isArray(bulkPage?.comments) ? bulkPage.comments : [];
  const byId = new Map(
    bulkThreads
      .filter((t) => t?.threadNodeId)
      .map((t) => [String(t.threadNodeId), t])
  );
  // Preserve reviewThreads array order from prev
  const reviewThreads = prevTh.map((t) => {
    const id = t?.threadNodeId ? String(t.threadNodeId) : '';
    const full = id ? byId.get(id) : null;
    if (!full) return t;
    return {
      ...t,
      ...full,
      commentsLoaded: true,
      commentIds: Array.isArray(full.commentIds)
        ? full.commentIds
        : t.commentIds || [],
    };
  });
  // Also append bulk-only threads
  for (const t of bulkThreads) {
    const id = t?.threadNodeId ? String(t.threadNodeId) : '';
    if (!id || prevTh.some((p) => String(p?.threadNodeId) === id)) continue;
    reviewThreads.push({ ...t, commentsLoaded: true });
  }
  const loadedIds = new Set(
    bulkThreads.map((t) => String(t?.threadNodeId || '')).filter(Boolean)
  );
  const reviewComments = hydrateReviewCommentsInPlace(
    prevRc,
    bulkComments,
    loadedIds
  );
  return {
    ...detail,
    reviewThreads,
    reviewComments,
  };
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

/**
 * Hard cap for GraphQL connection `first`/`last` (GitHub max 100).
 * Used for by-id chunking only — normal pages use REVIEW_THREADS_PAGE_SIZE.
 */
export const REVIEW_THREADS_API_MAX = 100;

/**
 * Default GraphQL shell / REST window size.
 * Shell queries (no nested comments) measure rateLimit.cost=1 for last:15 and
 * last:100 on GitHub; prefer 100 so one window covers typical PRs with PRRT ids.
 */
export const REVIEW_THREADS_PAGE_SIZE = 100;

/**
 * Warm-cache revalidate probe size (≤ PAGE_SIZE).
 * Same as PAGE_SIZE — shell cost is flat at 1 for this shape.
 */
export const REVIEW_THREADS_WARM_PROBE_SIZE = 100;

/**
 * True when detail already holds durable review-thread data worth probing
 * instead of a cold full window.
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
 * Pick pageSize for newest reviewThreads / REST comments window.
 * Always PAGE_SIZE (100) — shell cost is flat; one window covers typical PRs.
 * @param {{ warmCache?: boolean, forceFull?: boolean }} [opts]
 * @returns {number}
 */
export function pickNewestThreadsPageSize(opts: any = {}) {
  void opts;
  return REVIEW_THREADS_PAGE_SIZE;
}

/**
 * Whether REST empty (or PR.review_comments === 0) should skip GraphQL escalate.
 * Trust REST: no free last:100 when there are no review comments.
 *
 * @param {{
 *   reviewCommentsCount?: number | null,
 *   restCommentCount?: number | null,
 *   forceGraphql?: boolean,
 *   forceFull?: boolean,
 * }} [opts]
 * @returns {boolean} true → do not GraphQL escalate
 */
export function shouldTrustRestEmptyReviewThreads(opts: any = {}) {
  if (opts?.forceGraphql || opts?.forceFull) return false;
  const prCount = opts?.reviewCommentsCount;
  if (prCount != null && Number.isFinite(Number(prCount)) && Number(prCount) <= 0) {
    return true;
  }
  const restN = opts?.restCommentCount;
  if (restN != null && Number.isFinite(Number(restN)) && Number(restN) <= 0) {
    // Empty list page with known zero or unknown PR count → trust empty
    return true;
  }
  return false;
}

/**
 * Choose transport for a review-threads page fetch.
 *
 * **GraphQL-first** (shell window + PRRT_… ids). Cheap shell queries made
 * REST-first obsolete; always manage native thread node ids for resolve /
 * by-id comments. REST only when explicitly requested (`preferRest === true`).
 *
 * @param {{
 *   direction?: string,
 *   cursor?: string | null,
 *   preferRest?: boolean | null,
 *   forceGraphql?: boolean,
 *   forceFull?: boolean,
 * }} [opts]
 * @returns {'rest' | 'graphql'}
 */
export function chooseReviewThreadsTransport(opts: any = {}) {
  // Explicit REST opt-in only (legacy / tests). Default is GraphQL.
  if (opts?.preferRest === true) return 'rest';
  if (opts?.forceGraphql || opts?.forceFull) return 'graphql';
  if (opts?.preferRest === false) return 'graphql';
  // newest/oldest/older/newer/cursor → GraphQL shell (PRRT always)
  return 'graphql';
}

/**
 * True for native GraphQL PullRequestReviewThread global ids (PRRT_…).
 * Synthetic REST ids (`rest-thread-*`) and comment node ids (PRRC_…) are false.
 */
export function isGraphqlReviewThreadNodeId(id: any): boolean {
  return /^PRRT_/i.test(String(id || '').trim());
}

/**
 * Whether a thread should load full comment bodies eagerly (GraphQL bulk).
 * Default UI: unresolved threads start expanded → need bodies now.
 * Resolved (default collapsed) → defer until expand.
 *
 * @param {{
 *   threadNodeId?: string,
 *   resolved?: boolean,
 *   commentsLoaded?: boolean,
 * }} thread
 * @param {{
 *   forceAll?: boolean,
 *   expandedThreadIds?: Iterable<string> | Set<string> | string[] | null,
 * }} [opts]
 * @returns {boolean}
 */
export function threadNeedsEagerComments(thread: any, opts: any = {}): boolean {
  if (!thread || !isGraphqlReviewThreadNodeId(thread.threadNodeId)) return false;
  if (opts?.forceAll) return true;
  const tid = String(thread.threadNodeId);
  const expanded = opts?.expandedThreadIds;
  if (expanded != null) {
    if (expanded instanceof Set) {
      if (expanded.has(tid)) return true;
    } else if (Array.isArray(expanded)) {
      if (expanded.some((id) => String(id) === tid)) return true;
    } else if (typeof (expanded as any)[Symbol.iterator] === 'function') {
      for (const id of expanded as Iterable<string>) {
        if (String(id) === tid) return true;
      }
    }
  }
  // Unresolved → default expanded in Conversation/Diff
  return !Boolean(thread.resolved);
}

/**
 * Select PRRT ids that should receive full comments after a shell window.
 * @param {any[]} threads
 * @param {{ forceAll?: boolean, expandedThreadIds?: any }} [opts]
 * @returns {string[]}
 */
export function selectThreadIdsForEagerComments(
  threads: any,
  opts: any = {}
): string[] {
  const list = Array.isArray(threads) ? threads : [];
  const out = [];
  const seen = new Set();
  for (const t of list) {
    if (!threadNeedsEagerComments(t, opts)) continue;
    const id = String(t.threadNodeId || '').trim();
    if (!id || seen.has(id)) continue;
    // Skip if already marked loaded
    if (t.commentsLoaded === true) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * True when full comment bodies for this thread are already present.
 * REST threads and by-id full fetches set commentsLoaded; legacy rows with
 * non-empty commentIds count as loaded.
 *
 * @param {any} thread
 * @param {any[]|null} [comments] detail.reviewComments / page.comments
 * @returns {boolean}
 */
export function threadCommentsAreLoaded(thread: any, comments: any = null): boolean {
  if (!thread) return false;
  if (thread.commentsLoaded === true) return true;
  if (thread.commentsLoaded === false) return false;
  if (Array.isArray(thread.commentIds) && thread.commentIds.length > 0) {
    // Legacy / REST: commentIds present without explicit flag
    if (!isGraphqlReviewThreadNodeId(thread.threadNodeId)) return true;
  }
  const tid = String(thread.threadNodeId || '');
  if (!tid || !Array.isArray(comments)) return false;
  let n = 0;
  for (const c of comments) {
    if (!c || String(c.threadNodeId || '') !== tid) continue;
    if (c._commentsPending) continue;
    n += 1;
  }
  return n > 0;
}

/**
 * PRRT ids that still need a comments bulk (eager set or explicit ids).
 *
 * @param {any[]} threads
 * @param {any[]|null} [comments]
 * @param {{
 *   forceAll?: boolean,
 *   expandedThreadIds?: any,
 *   onlyThreadIds?: Iterable<string> | string[] | null,
 * }} [opts]
 * @returns {string[]}
 */
export function selectThreadIdsMissingComments(
  threads: any,
  comments: any = null,
  opts: any = {}
): string[] {
  const list = Array.isArray(threads) ? threads : [];
  const only = opts?.onlyThreadIds
    ? new Set(
        [...opts.onlyThreadIds].map((id) => String(id || '').trim()).filter(Boolean)
      )
    : null;
  const out = [];
  const seen = new Set();
  for (const t of list) {
    const id = String(t?.threadNodeId || '').trim();
    if (!isGraphqlReviewThreadNodeId(id)) continue;
    if (only && !only.has(id)) continue;
    if (only) {
      // explicit expand / by-id request: load if missing
      if (threadCommentsAreLoaded(t, comments)) continue;
    } else if (!threadNeedsEagerComments(t, opts)) {
      continue;
    } else if (threadCommentsAreLoaded(t, comments)) {
      continue;
    }
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * Placeholder comment so Diff/Conversation can show a collapsed shell thread
 * before full comments arrive. Stripped when real comments merge in.
 *
 * @param {any} thread
 * @returns {object|null}
 */
export function buildShellThreadPlaceholderComment(thread: any) {
  if (!thread || !isGraphqlReviewThreadNodeId(thread.threadNodeId)) return null;
  const tid = String(thread.threadNodeId);
  return {
    id: `shell:${tid}`,
    author: '',
    avatarUrl: '',
    body: '',
    path: thread.path || '',
    line: thread.line ?? null,
    startLine: thread.startLine ?? null,
    side: thread.side || 'RIGHT',
    threadNodeId: tid,
    resolved: Boolean(thread.resolved),
    outdated: Boolean(thread.outdated),
    pending: false,
    _commentsPending: true,
    commentsLoaded: false,
  };
}

/**
 * Ensure every deferred GraphQL shell thread has a placeholder row in comments.
 * Without this, Diff (rows from reviewComments) and Conversation (timeline from
 * reviewComments) hide resolved threads after shell-only fetch.
 *
 * @param {any[]} threads
 * @param {any[]|null|undefined} comments
 * @returns {any[]}
 */
export function ensureShellPlaceholderComments(
  threads: any,
  comments: any = null
): any[] {
  const list = Array.isArray(comments) ? comments.slice() : [];
  const covered = new Set();
  for (const c of list) {
    if (!c?.threadNodeId) continue;
    covered.add(String(c.threadNodeId));
  }
  for (const t of Array.isArray(threads) ? threads : []) {
    const tid = t?.threadNodeId ? String(t.threadNodeId) : '';
    if (!isGraphqlReviewThreadNodeId(tid)) continue;
    if (covered.has(tid)) continue;
    const ph = buildShellThreadPlaceholderComment(t);
    if (!ph) continue;
    list.push(ph);
    covered.add(tid);
  }
  return list;
}

/**
 * Merge comment-based groups with shell-only reviewThreads (no bodies yet).
 * @param {any[]} commentGroups from groupReviewThreads
 * @param {any[]} reviewThreads detail.reviewThreads
 * @returns {any[]}
 */
export function mergeReviewThreadGroupsWithShells(
  commentGroups: any,
  reviewThreads: any
): any[] {
  const groups = Array.isArray(commentGroups) ? commentGroups.slice() : [];
  const have = new Set();
  for (const g of groups) {
    const tid = g?.threadNodeId || g?.root?.threadNodeId || null;
    if (tid) have.add(String(tid));
    // also map by root id
  }
  for (const t of Array.isArray(reviewThreads) ? reviewThreads : []) {
    const tid = t?.threadNodeId ? String(t.threadNodeId) : '';
    if (!tid || have.has(tid)) continue;
    if (threadCommentsAreLoaded(t, null) && (t.commentIds || []).length) {
      continue;
    }
    // Shell-only: inject group for collapsed header / expand target
    have.add(tid);
    groups.push({
      id: `shell:${tid}`,
      path: t.path || '',
      line: t.line ?? null,
      side: t.side || 'RIGHT',
      root: {
        id: `shell:${tid}`,
        body: '',
        path: t.path || '',
        line: t.line ?? null,
        side: t.side || 'RIGHT',
        threadNodeId: tid,
        resolved: Boolean(t.resolved),
        outdated: Boolean(t.outdated),
        _commentsPending: true,
      },
      replies: [],
      resolved: Boolean(t.resolved),
      outdated: Boolean(t.outdated),
      pending: false,
      threadNodeId: tid,
      count: 0,
      commentsPending: true,
      commentsLoaded: false,
    });
  }
  return groups;
}

/**
 * Whether to skip GraphQL nodes(ids:) unresolved bulk after newest page.
 * GraphQL-first opens already return PRRT_ + eager comments for unresolved;
 * skip only when explicitly told (legacy host REST paint). Default: do not skip.
 *
 * @param {{
 *   newestSource?: string | null,
 *   hostRestFallback?: boolean,
 *   forceFull?: boolean,
 *   mode?: string | null,
 * }} [opts]
 * @returns {boolean} true → skip by-id bulk
 */
export function shouldSkipUnresolvedByIdsBulk(opts: any = {}): boolean {
  if (opts?.forceFull || opts?.mode === 'full-threads') return false;
  // Legacy: host painted REST synthetic threads only
  if (opts?.hostRestFallback) return true;
  const src = String(opts?.newestSource || '').toLowerCase();
  // GraphQL newest already has PRRT — still allow by-id for missing unresolved
  // outside the window; do not skip solely because source is graphql.
  return src === 'rest';
}

/**
 * Filter unresolved ids for GraphQL by-id bulk: only PRRT_, not already in the
 * newest page set, not known remote-missing this open.
 *
 * @param {Iterable<string>|string[]|null|undefined} unresolvedIds
 * @param {Iterable<string>|Set<string>|null|undefined} updatedIdSet
 * @param {Iterable<string>|Set<string>|null|undefined} knownMissing
 * @returns {string[]}
 */
export function remainingUnresolvedForByIdsBulk(
  unresolvedIds: any,
  updatedIdSet: any = null,
  knownMissing: any = null
): string[] {
  const updated =
    updatedIdSet instanceof Set
      ? updatedIdSet
      : new Set(
          [...(updatedIdSet || [])].map((id) => String(id || '')).filter(Boolean)
        );
  const missing =
    knownMissing instanceof Set
      ? knownMissing
      : new Set(
          [...(knownMissing || [])].map((id) => String(id || '')).filter(Boolean)
        );
  const out = [];
  const seen = new Set();
  for (const raw of unresolvedIds || []) {
    const id = String(raw || '').trim();
    if (!id || seen.has(id)) continue;
    if (!isGraphqlReviewThreadNodeId(id)) continue;
    if (updated.has(id) || missing.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * From a successful GraphQL `nodes(ids:)` response, which requested ids are
 * confirmed remote-missing (null slot)? Length mismatch → no confirmed missing
 * for unmatched indices (unknown — do not drop).
 *
 * @param {string[]} chunkIds
 * @param {any[]|null|undefined} rawNodes
 * @returns {string[]}
 */
export function confirmedMissingThreadIdsFromNodes(
  chunkIds: any,
  rawNodes: any
): string[] {
  const ids = Array.isArray(chunkIds) ? chunkIds.map((id) => String(id)) : [];
  if (!Array.isArray(rawNodes) || !ids.length) return [];
  const missing = [];
  const n = Math.min(ids.length, rawNodes.length);
  for (let i = 0; i < n; i++) {
    if (rawNodes[i] == null) missing.push(ids[i]);
  }
  return missing;
}

/**
 * Thread ids safe to drop after a by-id / refresh merge.
 *
 * **Only** `page.missingThreadIds` (confirmed remote-null from a successful
 * GraphQL nodes[] response). Never derive `requestedThreadIds − returned`
 * — failed/unknown by-id chunks leave ids out of missingThreadIds and must
 * not wipe REST-painted comments.
 *
 * @param {object|null|undefined} page
 * @returns {string[]}
 */
export function resolveMissingThreadIdsForDrop(page: any): string[] {
  if (!page || typeof page !== 'object') return [];
  if (!Array.isArray(page.missingThreadIds)) return [];
  return [
    ...new Set(
      page.missingThreadIds
        .map((id: any) => String(id || '').trim())
        .filter(Boolean)
    ),
  ];
}

/**
 * Pure drop of review threads + comments by threadNodeId (merge refresh path).
 * Does not invent missing ids — caller must pass resolveMissingThreadIdsForDrop.
 *
 * @param {object|null} detail
 * @param {Iterable<string>|string[]|null|undefined} threadNodeIds
 * @returns {object|null}
 */
export function dropReviewThreadsByNodeIds(detail: any, threadNodeIds: any) {
  if (!detail) return detail;
  const drop = new Set(
    [...(threadNodeIds || [])]
      .map((id) => String(id || '').trim())
      .filter(Boolean)
  );
  if (!drop.size) return detail;
  const prevRc = Array.isArray(detail.reviewComments)
    ? detail.reviewComments
    : [];
  const prevTh = Array.isArray(detail.reviewThreads)
    ? detail.reviewThreads
    : [];
  return {
    ...detail,
    reviewComments: prevRc.filter((c) => {
      if (!c) return false;
      const tid = c.threadNodeId ? String(c.threadNodeId) : '';
      return !(tid && drop.has(tid));
    }),
    reviewThreads: prevTh.filter(
      (t) => !t?.threadNodeId || !drop.has(String(t.threadNodeId))
    ),
  };
}

/**
 * Merge refresh/ids page drop gate: apply only confirmed missingThreadIds.
 * Models mergeReviewThreadsPageIntoDetail drop step for unit tests.
 *
 * @param {object|null} detail
 * @param {object|null|undefined} page by-id bulk page shape
 * @returns {object|null}
 */
export function applyByIdsRefreshDrop(detail: any, page: any) {
  const missing = resolveMissingThreadIdsForDrop(page);
  if (!missing.length) return detail;
  return dropReviewThreadsByNodeIds(detail, missing);
}

/**
 * Pure REST → threads page shape (Diff/conversation group from comments).
 * Synthetic threadNodeId is `rest-thread-{rootId}` unless REST row already
 * carries a GraphQL node id.
 *
 * @param {any[]} items mapped REST review comments
 * @param {string} [direction]
 * @returns {object}
 */
export function buildRestReviewThreadsPageFromComments(
  items: any[],
  direction = 'newest'
) {
  const list = Array.isArray(items) ? items : [];
  const empty = {
    threads: [],
    comments: [],
    hasMore: false,
    endCursor: null,
    startCursor: null,
    hasNextPage: false,
    hasPreviousPage: false,
    totalCount: 0,
    pageCount: list.length ? 1 : 0,
    direction: direction || 'newest',
    window: 'newest',
    source: 'rest' as const,
  };
  if (!list.length) return empty;
  const byId = new Map();
  for (const c of list) {
    if (c && c.id != null) byId.set(String(c.id), c);
  }
  const roots = list.filter((c) => {
    if (!c || c.id == null) return false;
    const parent = c.inReplyToId ?? c.in_reply_to_id ?? null;
    return parent == null || !byId.has(String(parent));
  });
  const threads = roots.map((r) => {
    const replyIds = list
      .filter(
        (c) =>
          c &&
          String(c.inReplyToId ?? c.in_reply_to_id ?? '') === String(r.id)
      )
      .map((c) => c.id);
    // Always synthetic REST id — never promote comment PRRC_ to "thread" id
    // (warm revalidate must not treat REST paint as GraphQL PRRT coverage).
    const threadNodeId =
      r.threadNodeId && /^PRRT_/i.test(String(r.threadNodeId))
        ? String(r.threadNodeId)
        : `rest-thread-${r.id}`;
    const commentIds = [r.id, ...replyIds];
    for (const cid of commentIds) {
      const row = byId.get(String(cid));
      if (row) {
        row.threadNodeId = threadNodeId;
        row.loadWindow = 'newest';
      }
    }
    return {
      threadNodeId,
      resolved: Boolean(r.resolved ?? r.isResolved),
      outdated: Boolean(r.outdated),
      path: r.path || '',
      line: r.line ?? r.originalLine ?? r.original_line ?? null,
      startLine: r.startLine ?? r.start_line ?? null,
      side: r.side || 'RIGHT',
      commentIds,
      commentsLoaded: true,
      loadWindow: 'newest',
    };
  });
  return {
    threads,
    comments: list,
    totalCount: list.length,
    startCursor: null,
    endCursor: null,
    hasNextPage: false,
    hasPreviousPage: false,
    hasMore: false,
    pageCount: 1,
    direction: direction || 'newest',
    window: 'newest',
    source: 'rest' as const,
  };
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
