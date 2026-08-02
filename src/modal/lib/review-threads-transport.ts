/** Split from review-threads.ts: review-threads-transport */
/** @module modal/lib/review-threads */
/**
 * Pure review-thread grouping, counts, resolve/reply request builders.
 */

/**
 * Group review comments into threads by root (in_reply_to_id).
 * @param {Array} comments
 * @returns {Array<{ id, path, line, side, root, replies, resolved, threadNodeId }>}
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
export function countCommentsForThread(pageOrDetail, threadNodeId, thread = null) {
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
