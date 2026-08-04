import {
  groupReviewThreads,
} from './review-threads-group';
import {
  isGraphqlReviewThreadNodeId,
  threadCommentsAreLoaded,
} from './review-threads-transport';

/** Split from review-threads.ts: review-threads-map */
/** @module modal/lib/review-threads */
/**
 * Pure review-thread grouping, counts, resolve/reply request builders.
 */

/**
 * Group review comments into threads by root (in_reply_to_id).
 * @param {Array} comments
 * @returns {Array<{ id, path, line, side, root, replies, resolved, threadNodeId }>}
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
        const reviewState = String(
          node.pullRequestReview?.state || ''
        ).toUpperCase();
        const reviewDbId =
          node.pullRequestReview?.databaseId != null
            ? Number(node.pullRequestReview.databaseId)
            : null;
        const pending = reviewState === 'PENDING';
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
          // Shell first:1 includes pullRequestReview so timeline can group
          // before by-ids hydrate (resolved threads skip eager bulk).
          reviewId: Number.isFinite(reviewDbId) ? reviewDbId : null,
          resolved: Boolean(t.isResolved),
          outdated: Boolean(node.outdated ?? t.isOutdated),
          pending,
          pendingReviewId: pending ? reviewDbId : null,
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
