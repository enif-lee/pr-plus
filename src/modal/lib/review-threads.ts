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
 * Shape POST reply to a review comment.
 * POST /repos/{owner}/{repo}/pulls/{pull}/comments/{id}/replies
 */
export function buildReplyReviewCommentRequest(owner, repo, pullNumber, commentId, body) {
  return {
    method: 'POST',
    url: `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}/comments/${commentId}/replies`,
    body: { body: String(body || '').trim() },
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
