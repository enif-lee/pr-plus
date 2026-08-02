/** Review threads — pure map/merge helpers */
import {
  fetchPrCommentsPage,
} from './detail-sides-comments';
import {
  apiGraphql,
  normalizeApiCtx,
} from './http';
import {
  mapGraphqlReviewCommentNode,
} from './mappers';
import {
  mergePendingReviewComments,
} from './pending-review';

export const REVIEW_THREAD_SHELL_FIELDS = `
  id
  isResolved
  isOutdated
  path
  line
  originalLine
  startLine
  originalStartLine
  diffSide
  startDiffSide
  subjectType
  comments(first:1) {
    totalCount
    nodes {
      databaseId
      body
      path
      line
      createdAt
      author { login avatarUrl }
    }
  }
`;

/** Full thread + comments — used only for selective by-id bulk / lazy expand. */
export const REVIEW_THREAD_COMMENTS_FIELDS = `
  comments(first:100){
    nodes{
      id
      databaseId
      body
      path
      line
      originalLine
      startLine
      originalStartLine
      outdated
      diffHunk
      createdAt
      author { login avatarUrl }
      replyTo { databaseId }
      pullRequestReview { databaseId state }
      reactionGroups {
        content
        viewerHasReacted
        reactors {
          totalCount
        }
      }
    }
  }
`;

/**
 * Full by-ids document fragment: thread meta + full comments + reaction counts.
 * Intentionally does NOT embed REVIEW_THREAD_SHELL_FIELDS (which has
 * comments(first:1)) — that collides with comments(first:100) in GraphQL.
 * Kept as one string so SW runtime cannot mix shell+full selections.
 */
export const REVIEW_THREADS_BY_IDS_NODE_SELECTION = `
  id
  isResolved
  isOutdated
  path
  line
  originalLine
  startLine
  originalStartLine
  diffSide
  startDiffSide
  subjectType
  comments(first:100){
    totalCount
    nodes{
      id
      databaseId
      body
      path
      line
      originalLine
      startLine
      originalStartLine
      outdated
      diffHunk
      createdAt
      author { login avatarUrl }
      replyTo { databaseId }
      pullRequestReview { databaseId state }
      reactionGroups {
        content
        viewerHasReacted
        reactors {
          totalCount
        }
      }
    }
  }
`;

/** Oldest → newer (forward) — shell only. */
export const REVIEW_THREADS_FIRST_QUERY = `
query ReviewThreadsFirstShell($owner:String!,$name:String!,$number:Int!,$n:Int!,$cursor:String){
  repository(owner:$owner,name:$name){
    pullRequest(number:$number){
      reviewThreads(first:$n, after:$cursor){
        totalCount
        pageInfo { hasNextPage hasPreviousPage startCursor endCursor }
        nodes { ${REVIEW_THREAD_SHELL_FIELDS} }
      }
    }
  }
}`;

/** Newest ← older (backward) — shell only. */
export const REVIEW_THREADS_LAST_QUERY = `
query ReviewThreadsLastShell($owner:String!,$name:String!,$number:Int!,$n:Int!,$cursor:String){
  repository(owner:$owner,name:$name){
    pullRequest(number:$number){
      reviewThreads(last:$n, before:$cursor){
        totalCount
        pageInfo { hasNextPage hasPreviousPage startCursor endCursor }
        nodes { ${REVIEW_THREAD_SHELL_FIELDS} }
      }
    }
  }
}`;

/** GraphQL connection / nodes(ids) hard cap. */
/** GraphQL connection hard cap / by-id chunk size. */
export const REVIEW_THREADS_API_MAX = 100;
/** Default GraphQL shell window (matches pure REVIEW_THREADS_PAGE_SIZE). */
export const REVIEW_THREADS_PAGE_SIZE = 100;

/**
 * Map GraphQL reviewThreads.nodes → { threads, comments }.
 * Shell may include comments(first:1) root preview; full by-id has complete set.
 * Prefers pure `mapGraphqlReviewThreadNodes` when payload is shell/light;
 * full by-id (diffHunk / reactionGroups / etc.) uses mapGraphqlReviewCommentNode.
 */
export function mapReviewThreadNodes(allNodes: any) {
  try {
    const pure =
      typeof globalThis !== 'undefined'
        ? (globalThis as any).PRModalReviewThreads
        : null;
    const list = Array.isArray(allNodes) ? allNodes : [];
    const hasFullCommentShape = list.some((n) =>
      (n?.comments?.nodes || []).some(
        (c: any) =>
          c &&
          (c.reactionGroups != null ||
            c.diffHunk != null ||
            c.pullRequestReview != null ||
            c.replyTo != null)
      )
    );
    // Shell / preview-only: pure mapper (totalCount-aware commentsLoaded).
    if (
      !hasFullCommentShape &&
      typeof pure?.mapGraphqlReviewThreadNodes === 'function'
    ) {
      return pure.mapGraphqlReviewThreadNodes(allNodes);
    }
  } catch {
    /* fall through */
  }
  const pureRt =
    typeof globalThis !== 'undefined'
      ? (globalThis as any).PRModalReviewThreads
      : null;
  const threads = [];
  const comments = [];
  for (const t of Array.isArray(allNodes) ? allNodes : []) {
    if (!t?.id) continue;
    const threadMeta = {
      threadNodeId: t.id,
      resolved: Boolean(t.isResolved),
      isOutdated: Boolean(t.isOutdated),
      path: t.path || '',
      diffSide: t.diffSide || 'RIGHT',
      startDiffSide: t.startDiffSide || null,
      line: t.line ?? null,
      originalLine: t.originalLine ?? null,
      startLine: t.startLine ?? t.originalStartLine ?? null,
      subjectType: t.subjectType || null,
    };
    const commentsConnPresent =
      t.comments != null && typeof t.comments === 'object';
    const commentsLoaded = commentsConnPresent
      ? typeof pureRt?.graphqlCommentsAreFullyLoaded === 'function'
        ? Boolean(pureRt.graphqlCommentsAreFullyLoaded(t.comments))
        : (() => {
            const nodes = t.comments?.nodes || [];
            const total = t.comments?.totalCount;
            if (!nodes.length) return total === 0;
            if (typeof total === 'number') return total <= nodes.length;
            return true;
          })()
      : false;
    const commentIds = [];
    if (commentsConnPresent) {
      for (const node of t.comments?.nodes || []) {
        const mapped = mapGraphqlReviewCommentNode(node, threadMeta);
        if (!mapped) continue;
        if (!commentsLoaded) {
          (mapped as any)._commentsPreview = true;
        }
        comments.push(mapped);
        commentIds.push(mapped.id);
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
 * Pure selection of eager comment thread ids (mirrors PRModalReviewThreads).
 */
export function selectEagerCommentThreadIdsLocal(threads: any, opts: any = {}) {
  try {
    const pure =
      typeof globalThis !== 'undefined'
        ? (globalThis as any).PRModalReviewThreads
        : null;
    if (typeof pure?.selectThreadIdsForEagerComments === 'function') {
      return pure.selectThreadIdsForEagerComments(threads, opts);
    }
  } catch {
    /* fall through */
  }
  const list = Array.isArray(threads) ? threads : [];
  const out = [];
  for (const t of list) {
    if (!t?.threadNodeId || t.commentsLoaded === true) continue;
    if (!/^PRRT_/i.test(String(t.threadNodeId))) continue;
    if (opts?.forceAll || !Boolean(t.resolved)) out.push(String(t.threadNodeId));
  }
  return out;
}

/**
 * Merge a by-ids full-comment page onto a shell page (same window).
 */
export function mergeCommentsBulkIntoThreadsPage(shellPage: any, bulkPage: any) {
  try {
    const pure =
      typeof globalThis !== 'undefined'
        ? (globalThis as any).PRModalReviewThreads
        : null;
    if (typeof pure?.mergeCommentsBulkIntoThreadsPage === 'function') {
      return pure.mergeCommentsBulkIntoThreadsPage(shellPage, bulkPage);
    }
  } catch {
    /* fall through */
  }
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
      return { ...t, commentsLoaded: Boolean(t.commentsLoaded) };
    }
    return {
      ...t,
      ...full,
      commentsLoaded: true,
      commentIds: Array.isArray(full.commentIds) ? full.commentIds : t.commentIds || [],
    };
  });
  // Drop shell placeholders/previews for loaded ids; keep deferred first:1 bodies.
  const loadedIds = new Set(
    threads.filter((t) => t.commentsLoaded).map((t) => String(t.threadNodeId))
  );
  const prevComments = Array.isArray(shellPage?.comments) ? shellPage.comments : [];
  let kept = [];
  try {
    const pure =
      typeof globalThis !== 'undefined'
        ? (globalThis as any).PRModalReviewThreads
        : null;
    if (typeof pure?.retainShellCommentsAfterBulk === 'function') {
      kept = pure.retainShellCommentsAfterBulk(prevComments, loadedIds);
    } else {
      for (const c of prevComments) {
        if (!c?.threadNodeId) continue;
        const tid = String(c.threadNodeId);
        if (loadedIds.has(tid)) {
          if (c._commentsPending || c._commentsPreview) continue;
          kept.push(c);
          continue;
        }
        if (c._commentsPending && !String(c.body || '').trim()) continue;
        kept.push(c);
      }
    }
  } catch {
    kept = prevComments.slice();
  }
  const seen = new Set(kept.map((c) => String(c.id)));
  for (const c of bulkComments) {
    if (!c || c.id == null) continue;
    const k = String(c.id);
    if (seen.has(k)) continue;
    seen.add(k);
    kept.push(c);
  }
  // Keep deferred shells visible (resolved) via pure placeholder helper.
  let comments = kept;
  try {
    const pure =
      typeof globalThis !== 'undefined'
        ? (globalThis as any).PRModalReviewThreads
        : null;
    if (typeof pure?.ensureShellPlaceholderComments === 'function') {
      comments = pure.ensureShellPlaceholderComments(threads, kept);
    } else {
      for (const t of threads) {
        if (!t?.threadNodeId || t.commentsLoaded === true) continue;
        const tid = String(t.threadNodeId);
        if (!/^PRRT_/i.test(tid)) continue;
        if (kept.some((c) => c && String(c.threadNodeId) === tid)) continue;
        kept.push({
          id: `shell:${tid}`,
          author: '',
          body: '',
          path: t.path || '',
          line: t.line ?? null,
          side: t.side || 'RIGHT',
          threadNodeId: tid,
          resolved: Boolean(t.resolved),
          outdated: Boolean(t.outdated),
          pending: false,
          _commentsPending: true,
          commentsLoaded: false,
        });
      }
      comments = kept;
    }
  } catch {
    comments = kept;
  }
  return {
    ...shellPage,
    threads,
    comments,
  };
}

/**
 * Single GraphQL page of review threads.
 * @param {'newest'|'older'|'oldest'|'newer'} direction
 *   - newest: last:N (connection end = most recent)
 *   - older:  last:N before startCursor (expand newest window into older)
 *   - oldest: first:N (connection start = earliest)
 *   - newer:  first:N after endCursor (expand oldest window into newer)
 */
/**
 * Build a threads page shape from REST pull review comments.
 * Used when GraphQL reviewThreads is rate-limited / unavailable. Diff UI groups
 * from comments; synthetic threads keep meta counters non-zero.
 */
/**
 * Choose REST vs GraphQL for a threads page (mirrors pure helper when loaded).
 * Kept inline so SW fetch-api does not depend on pure IIFE load order.
 */
export function chooseReviewThreadsTransportLocal(opts: any = {}) {
  try {
    const pure =
      typeof globalThis !== 'undefined'
        ? (globalThis as any).PRModalReviewThreads
        : null;
    if (typeof pure?.chooseReviewThreadsTransport === 'function') {
      return pure.chooseReviewThreadsTransport(opts);
    }
  } catch {
    /* fall through */
  }
  // GraphQL-first (shell + PRRT). REST only when preferRest === true.
  if (opts?.preferRest === true) return 'rest';
  return 'graphql';
}

export function buildRestReviewThreadsPageFromCommentsLocal(
  items: any[],
  direction = 'newest'
) {
  try {
    const pure =
      typeof globalThis !== 'undefined'
        ? (globalThis as any).PRModalReviewThreads
        : null;
    if (typeof pure?.buildRestReviewThreadsPageFromComments === 'function') {
      return pure.buildRestReviewThreadsPageFromComments(items, direction);
    }
  } catch {
    /* fall through */
  }
  // Minimal inline copy when pure helper unavailable (tests / partial SW)
  const list = Array.isArray(items) ? items : [];
  if (!list.length) {
    return {
      threads: [],
      comments: [],
      hasMore: false,
      endCursor: null,
      startCursor: null,
      hasNextPage: false,
      hasPreviousPage: false,
      totalCount: 0,
      pageCount: 0,
      direction: direction || 'newest',
      window: 'newest',
      source: 'rest',
    };
  }
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
          c && String(c.inReplyToId ?? c.in_reply_to_id ?? '') === String(r.id)
      )
      .map((c) => c.id);
    const threadNodeId = r.nodeId || r.threadNodeId || `rest-thread-${r.id}`;
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
      line: r.line ?? r.originalLine ?? null,
      startLine: r.startLine ?? null,
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
    source: 'rest',
  };
}

