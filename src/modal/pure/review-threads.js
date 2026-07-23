/* sw-iife */
(function () {
  /**
   * Pure review-thread grouping, counts, resolve/reply request builders.
   */

  /**
   * Group review comments into threads by root (in_reply_to_id).
   * @param {Array} comments
   * @returns {Array<{ id, path, line, side, root, replies, resolved, threadNodeId }>}
   */
  function groupReviewThreads(comments) {
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
          root.pending || replies.some(function (r) { return r && r.pending; })
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
  function mergeReviewThreadMeta(comments, threads) {
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
  function mapGraphqlReviewThreads(nodes) {
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
  function countReviewThreadsByPath(comments) {
    const threads = groupReviewThreads(comments);
    const map = new Map();
    for (const t of threads) {
      const p = t.path || '';
      if (!p) continue;
      map.set(p, (map.get(p) || 0) + 1);
    }
    return map;
  }

  function countUnresolvedReviewThreadsByPath(comments) {
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

  function countPendingReviewThreadsByPath(comments) {
    const map = new Map();
    const threads = groupReviewThreads(comments);
    for (const t of threads) {
      if (!t.pending) continue;
      const p = t.path || '';
      if (!p) continue;
      map.set(p, (map.get(p) || 0) + 1);
    }
    for (const c of Array.isArray(comments) ? comments : []) {
      if (!c || !c.pending) continue;
      const p = c.path || '';
      if (!p || map.has(p)) continue;
      map.set(p, 1);
    }
    return map;
  }

  function countReviewThreadTotals(comments, opts) {
    const o = opts && typeof opts === 'object' ? opts : {};
    const pathSet =
      o.allowedPaths instanceof Set
        ? o.allowedPaths
        : o.allowedPaths
          ? new Set(
              Array.isArray(o.allowedPaths)
                ? o.allowedPaths.map(String).filter(Boolean)
                : []
            )
          : null;
    const excludeOutdated = Boolean(o.excludeOutdated);
    const threads = groupReviewThreads(comments);
    let total = 0;
    let unresolved = 0;
    let resolved = 0;
    let pendingThreads = 0;
    for (const t of threads) {
      const p = t.path || '';
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

  function normalizeReviewCommentId(raw) {
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
   */
  function resolveRootReviewCommentId(comments, commentId) {
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

  function buildReplyReviewThreadGraphql(threadNodeId, body) {
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
   * REST fallback reply (no pending review).
   * POST /pulls/{n}/comments/{id}/replies
   */
  function buildReplyReviewCommentRequest(owner, repo, pullNumber, commentId, body) {
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
  function buildResolveThreadGraphql(threadNodeId, resolved = true) {
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
  function filterFilesByQuery(files, query) {
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
  function toggleViewedPath(viewed, path) {
    const next = viewed instanceof Set ? new Set(viewed) : new Set(viewed || []);
    const p = String(path || '');
    if (!p) return next;
    if (next.has(p)) next.delete(p);
    else next.add(p);
    return next;
  }

  function isPathViewed(viewed, path) {
    if (!path) return false;
    if (viewed instanceof Set) return viewed.has(path);
    if (Array.isArray(viewed)) return viewed.includes(path);
    return false;
  }

  const api = {
    groupReviewThreads,
    mergeReviewThreadMeta,
    mapGraphqlReviewThreads,
    countReviewThreadsByPath,
    countUnresolvedReviewThreadsByPath,
    countPendingReviewThreadsByPath,
    countReviewThreadTotals,
    normalizeReviewCommentId,
    resolveRootReviewCommentId,
    buildReplyReviewThreadGraphql,
    buildReplyReviewCommentRequest,
    buildResolveThreadGraphql,
    filterFilesByQuery,
    toggleViewedPath,
    isPathViewed,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (typeof globalThis !== 'undefined') {
    globalThis.PRModalReviewThreads = api;
  }
})();
