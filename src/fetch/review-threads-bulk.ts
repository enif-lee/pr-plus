/** Review threads: by-ids bulk + detail merge */
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
import {
  mapReviewThreadNodes,
  selectEagerCommentThreadIdsLocal,
  mergeCommentsBulkIntoThreadsPage,
  chooseReviewThreadsTransportLocal,
  buildRestReviewThreadsPageFromCommentsLocal,
  REVIEW_THREAD_SHELL_FIELDS,
  REVIEW_THREAD_COMMENTS_FIELDS,
  REVIEW_THREADS_BY_IDS_NODE_SELECTION,
  REVIEW_THREADS_FIRST_QUERY,
  REVIEW_THREADS_LAST_QUERY,
  REVIEW_THREADS_API_MAX,
  REVIEW_THREADS_PAGE_SIZE,
} from './review-threads-map';
import {
  restReviewThreadsFallbackPage,
  fetchReviewThreadsPage,
  isGraphqlReviewThreadNodeIdLocal,
  collectUnresolvedThreadNodeIds,
} from './review-threads-page';

export async function fetchReviewThreadsByIds(threadNodeIds: any, fetchImpl: any, token: any, ctx: any = null) {
  ctx = normalizeApiCtx(ctx);
  const empty = {
    threads: [],
    comments: [],
    pageCount: 0,
    direction: 'refresh',
    totalCount: null,
    hasPreviousPage: false,
    hasNextPage: false,
    requestedThreadIds: [],
    missingThreadIds: [],
  };
  if (!token) return empty;
  const ids = [
    ...new Set(
      (Array.isArray(threadNodeIds) ? threadNodeIds : [])
        .map((id) => String(id || '').trim())
        .filter(Boolean)
    ),
  ];
  if (!ids.length) return empty;

  // Name includes CostFlat marker so e2e/cost logs prove the new SW is loaded
  // (not a stale worker still shipping shell+full comments field conflict).
  const query = `
query ReviewThreadsByIdsFullCostFlat($ids:[ID!]!){
  nodes(ids:$ids){
    ... on PullRequestReviewThread {
      ${REVIEW_THREADS_BY_IDS_NODE_SELECTION}
    }
  }
}`;
  const byIdsQueryMeta = {
    qName: 'ReviewThreadsByIdsFullCostFlat',
    hasFirst1: /comments\s*\(\s*first\s*:\s*1\s*\)/.test(query),
    hasFirst100: /comments\s*\(\s*first\s*:\s*100\s*\)/.test(query),
    hasReactorsFirst: /reactors\s*\(\s*first\s*:/.test(query),
  };
  try {
    (globalThis as any).__prpLastByIdsQueryMeta = byIdsQueryMeta;
  } catch {
    /* ignore */
  }

  const allThreads = [];
  const allComments = [];
  const foundIds = new Set();
  /** Only ids with a successful nodes[] slot that is null (remote-deleted). */
  const confirmedMissing = new Set();
  let pages = 0;

  const confirmedMissingFromNodes = (chunkIds: string[], rawNodes: any) => {
    try {
      const pure =
        typeof globalThis !== 'undefined'
          ? (globalThis as any).PRModalReviewThreads
          : null;
      if (typeof pure?.confirmedMissingThreadIdsFromNodes === 'function') {
        return pure.confirmedMissingThreadIdsFromNodes(chunkIds, rawNodes);
      }
    } catch {
      /* fall through */
    }
    if (!Array.isArray(rawNodes) || !chunkIds.length) return [];
    const missing = [];
    const n = Math.min(chunkIds.length, rawNodes.length);
    for (let j = 0; j < n; j++) {
      if (rawNodes[j] == null) missing.push(String(chunkIds[j]));
    }
    return missing;
  };

  for (let i = 0; i < ids.length; i += REVIEW_THREADS_API_MAX) {
    const chunk = ids.slice(i, i + REVIEW_THREADS_API_MAX);
    try {
      const data = await apiGraphql(query, { ids: chunk }, fetchImpl, token, ctx);
      // nodes[] is parallel to requested ids; deleted/not-found → null.
      // Length mismatch or non-array → treat as unknown (do NOT mass-drop).
      const rawNodes = Array.isArray(data?.nodes) ? data.nodes : null;
      if (!rawNodes) {
        console.warn(
          '[pr-plus] fetchReviewThreadsByIds chunk: missing nodes[] — not marking missing'
        );
        continue;
      }
      for (const mid of confirmedMissingFromNodes(chunk, rawNodes)) {
        confirmedMissing.add(String(mid));
      }
      const nodes = rawNodes.filter(Boolean);
      const mapped = mapReviewThreadNodes(nodes);
      for (const t of mapped.threads) {
        t.loadWindow = t.loadWindow || 'refresh';
        if (t.threadNodeId) foundIds.add(String(t.threadNodeId));
      }
      for (const n of nodes) {
        if (n?.id) foundIds.add(String(n.id));
      }
      allThreads.push(...mapped.threads);
      allComments.push(...mapped.comments);
      pages += 1;
    } catch (err) {
      // Transient GraphQL errors / rate-limit: leave ids unknown — never
      // put them in missingThreadIds (would wipe REST-painted threads on merge).
      console.warn(
        '[pr-plus] fetchReviewThreadsByIds chunk failed',
        err?.message || err
      );
    }
  }
  return {
    threads: allThreads,
    comments: allComments,
    pageCount: pages,
    direction: 'refresh',
    totalCount: null,
    hasPreviousPage: false,
    hasNextPage: false,
    requestedThreadIds: ids,
    // Confirmed remote-null only — failed/unknown chunks stay out.
    missingThreadIds: [...confirmedMissing],
  };
}

/**
 * Drop review threads (and their comments) that no longer exist remotely.
 * Records comment id tombstones so App mergeDetailPreserveOptimistic cannot
 * resurrect them across a racey host→local merge.
 *
 * @param {object|null} detail
 * @param {Iterable<string>|string[]|null|undefined} threadNodeIds
 * @returns {object|null}
 */
export function dropReviewThreadsFromDetail(detail: any, threadNodeIds: any) {
  if (!detail) return detail;
  const drop = new Set(
    [...(threadNodeIds || [])]
      .map((id) => String(id || '').trim())
      .filter(Boolean)
  );
  if (!drop.size) return detail;

  const prevRc = Array.isArray(detail.reviewComments) ? detail.reviewComments : [];
  const prevTh = Array.isArray(detail.reviewThreads) ? detail.reviewThreads : [];
  const droppedCommentIds = [];
  const reviewComments = prevRc.filter((c) => {
    if (!c) return false;
    const tid = c.threadNodeId ? String(c.threadNodeId) : '';
    if (tid && drop.has(tid)) {
      if (c.id != null) droppedCommentIds.push(String(c.id));
      return false;
    }
    return true;
  });
  const reviewThreads = prevTh.filter(
    (t) => !t?.threadNodeId || !drop.has(String(t.threadNodeId))
  );

  const deleted = new Set(
    [
      ...(detail._deletedReviewCommentIds instanceof Set
        ? detail._deletedReviewCommentIds
        : Array.isArray(detail._deletedReviewCommentIds)
          ? detail._deletedReviewCommentIds
          : []),
      ...droppedCommentIds,
    ].map(String)
  );

  const prevMeta = detail.reviewThreadsMeta || emptyReviewThreadsMeta();
  const filterIdList = (list) =>
    (Array.isArray(list) ? list : [])
      .map(String)
      .filter((id) => id && !drop.has(id));
  const loadedThreadCount = reviewThreads.length;
  const totalCount = Math.max(
    0,
    Number(prevMeta.totalCount) || loadedThreadCount
  );
  // Prefer shrinking total when we know threads vanished (never inflate)
  const nextTotal =
    Number.isFinite(Number(prevMeta.totalCount)) &&
    Number(prevMeta.totalCount) >= drop.size
      ? Math.max(loadedThreadCount, Number(prevMeta.totalCount) - drop.size)
      : totalCount;
  const hiddenCount = Math.max(0, nextTotal - loadedThreadCount);

  const prevDroppedThreads =
    detail._droppedThreadNodeIds instanceof Set
      ? detail._droppedThreadNodeIds
      : Array.isArray(detail._droppedThreadNodeIds)
        ? detail._droppedThreadNodeIds
        : [];
  const droppedThreads = new Set([...prevDroppedThreads, ...drop].map(String));

  return {
    ...detail,
    reviewComments,
    reviewThreads,
    reviewCommentsMeta: {
      ...(detail.reviewCommentsMeta || {}),
      loadedCount: reviewComments.length,
    },
    reviewThreadsMeta: {
      ...prevMeta,
      totalCount: nextTotal,
      hiddenCount,
      loadedThreadCount,
      loadedCommentCount: reviewComments.length,
      newestThreadIds: filterIdList(prevMeta.newestThreadIds),
      oldestThreadIds: filterIdList(prevMeta.oldestThreadIds),
      hasMore: hiddenCount > 0,
      hasOlder: hiddenCount > 0 && Boolean(prevMeta.hasOlder),
      hasNewerFromOldest:
        hiddenCount > 0 && Boolean(prevMeta.hasNewerFromOldest),
    },
    _deletedReviewCommentIds: deleted.size ? deleted : detail._deletedReviewCommentIds,
    // Never re-request these PRRT ids in collectUnresolvedThreadNodeIds
    _droppedThreadNodeIds: droppedThreads,
  };
}

/**
 * Initial dual-window load: newest window (page size 100), then oldest seed
 * only when total still has more (legacy GraphQL path).
 */
export async function fetchPullReviewThreadsBundle(
  owner,
  repo,
  pullNumber,
  fetchImpl,
  token,
  opts: any = {}
) {
  const ctx = normalizeApiCtx(opts?.ctx);
  if (!token) {
    return {
      threads: [],
      comments: [],
      hasMore: false,
      endCursor: null,
      startCursor: null,
      pageCount: 0,
      totalCount: 0,
      reviewThreadsMeta: emptyReviewThreadsMeta(),
    };
  }
  const lastPageSize = Math.min(
    REVIEW_THREADS_API_MAX,
    Number(opts.pageSize) || REVIEW_THREADS_PAGE_SIZE
  );
  const startPageSize = Math.min(
    20,
    Number(opts.startPageSize) || 20
  );
  // Last (newest) first — GraphQL shell + eager comments (PRRT always)
  const newest = await fetchReviewThreadsPage(
    owner,
    repo,
    pullNumber,
    {
      direction: 'newest',
      cursor: null,
      pageSize: lastPageSize,
      preferRest: false,
      forceGraphql: true,
      reviewCommentsCount: opts.reviewCommentsCount,
    },
    fetchImpl,
    token,
    ctx
  );
  const totalCount = Number(newest.totalCount) || newest.threads.length;
  let oldest = null;
  // total < 100 → last page already covers all; skip start window
  if (totalCount >= REVIEW_THREADS_API_MAX && newest.hasPreviousPage) {
    try {
      oldest = await fetchReviewThreadsPage(
        owner,
        repo,
        pullNumber,
        {
          direction: 'oldest',
          cursor: null,
          pageSize: startPageSize,
        },
        fetchImpl,
        token,
        ctx
      );
    } catch {
      oldest = null;
    }
  }

  const threads = [...(newest.threads || [])];
  const comments = [...(newest.comments || [])];
  const newestIds = newest.threads.map((t) => t.threadNodeId).filter(Boolean);
  const oldestIds = [];
  if (oldest) {
    for (const t of oldest.threads || []) {
      if (!newestIds.includes(t.threadNodeId)) {
        threads.push(t);
        oldestIds.push(t.threadNodeId);
      }
    }
    for (const c of oldest.comments || []) {
      if (!comments.some((x) => String(x.id) === String(c.id))) comments.push(c);
    }
  }

  const loaded = threads.length;
  const hiddenCount = Math.max(0, totalCount - loaded);
  const meta = {
    totalCount,
    hiddenCount,
    loadedThreadCount: loaded,
    loadedCommentCount: comments.length,
    pagesLoaded: 1 + (oldest ? 1 : 0),
    // Newest window cursors (expand older with before: startCursor)
    newestStartCursor: newest.startCursor || null,
    newestEndCursor: newest.endCursor || null,
    hasOlder: Boolean(newest.hasPreviousPage),
    // Oldest window cursors (expand newer with after: endCursor)
    oldestStartCursor: oldest?.startCursor || null,
    oldestEndCursor: oldest?.endCursor || null,
    hasNewerFromOldest: Boolean(oldest?.hasNextPage),
    newestThreadIds: newestIds,
    oldestThreadIds: oldestIds,
    hasMore: hiddenCount > 0,
    endCursor: newest.startCursor || null, // legacy: load-more-older
  };

  return {
    threads,
    comments,
    hasMore: meta.hasMore,
    endCursor: meta.endCursor,
    startCursor: newest.startCursor || null,
    pageCount: meta.pagesLoaded,
    totalCount,
    reviewThreadsMeta: meta,
  };
}

export function emptyReviewThreadsMeta() {
  return {
    totalCount: 0,
    hiddenCount: 0,
    loadedThreadCount: 0,
    loadedCommentCount: 0,
    pagesLoaded: 0,
    newestStartCursor: null,
    newestEndCursor: null,
    hasOlder: false,
    oldestStartCursor: null,
    oldestEndCursor: null,
    hasNewerFromOldest: false,
    newestThreadIds: [],
    oldestThreadIds: [],
    hasMore: false,
    endCursor: null,
  };
}

/**
 * Merge a dual-window page (or bulk refresh) into detail.reviewThreadsMeta + comments.
 * @param {'older'|'newer'|'newest'|'oldest'|'refresh'} direction
 *   - refresh: update thread/comment bodies only; keep dual-window cursors/id sets
 */
export function mergeReviewThreadsPageIntoDetail(detail: any, page: any, direction: any = 'older') {
  if (!detail) return detail;
  const dir = String(direction || page?.direction || 'older');
  const prevMeta = detail.reviewThreadsMeta || emptyReviewThreadsMeta();
  const prevRc = Array.isArray(detail.reviewComments) ? detail.reviewComments : [];
  const prevTh = Array.isArray(detail.reviewThreads) ? detail.reviewThreads : [];

  // Confirmed remote-null only (page.missingThreadIds). Never derive
  // requested − returned: by-id chunk fail leaves ids unknown and must not
  // mass-drop REST-painted threads via dropReviewThreadsFromDetail.
  const missingIds = (() => {
    try {
      const pure =
        typeof globalThis !== 'undefined'
          ? (globalThis as any).PRModalReviewThreads
          : null;
      if (typeof pure?.resolveMissingThreadIdsForDrop === 'function') {
        return pure.resolveMissingThreadIdsForDrop(page);
      }
    } catch {
      /* fall through */
    }
    if (!Array.isArray(page?.missingThreadIds)) return [];
    return [
      ...new Set(
        page.missingThreadIds.map((id: any) => String(id || '').trim()).filter(Boolean)
      ),
    ];
  })();

  // refresh/ids: hydrate comments in place (stable sibling order). Other dirs
  // still use filter+append via baseRc then mergePending.
  let baseRc = prevRc;
  let reviewComments;
  if ((dir === 'refresh' || dir === 'ids') && (page?.threads || []).length) {
    const refreshed = new Set(
      (page.threads || [])
        .map((t) => (t?.threadNodeId ? String(t.threadNodeId) : ''))
        .filter(Boolean)
    );
    try {
      const pure =
        typeof globalThis !== 'undefined'
          ? (globalThis as any).PRModalReviewThreads
          : null;
      if (typeof pure?.hydrateReviewCommentsInPlace === 'function') {
        reviewComments = pure.hydrateReviewCommentsInPlace(
          prevRc,
          page?.comments || [],
          refreshed
        );
      }
    } catch {
      /* fall through */
    }
    if (!reviewComments) {
      // Fallback: drop refreshed threads then append (may reorder)
      baseRc = prevRc.filter(
        (c) => !c?.threadNodeId || !refreshed.has(String(c.threadNodeId))
      );
      reviewComments = mergePendingReviewComments(baseRc, page?.comments || []);
    }
  } else {
    // GraphQL shell±bulk window is authority for listed PRRT threads:
    // drop prior REST synthetic comments (rest-thread-*) and any prev rows for
    // page thread ids so deferred shells stay body-less until expand, and eager
    // bulk replaces REST paint without duplicates.
    const deferredShellIds = new Set();
    const pageThreadIds = new Set();
    if (
      page?.source === 'graphql' &&
      Array.isArray(page?.threads)
    ) {
      for (const t of page.threads) {
        if (!t?.threadNodeId) continue;
        const id = String(t.threadNodeId);
        pageThreadIds.add(id);
        if (t.commentsLoaded === false) deferredShellIds.add(id);
      }
      if (pageThreadIds.size) {
        baseRc = baseRc.filter((c) => {
          if (!c) return false;
          const tid = c.threadNodeId != null ? String(c.threadNodeId) : '';
          if (tid.startsWith('rest-thread-')) return false;
          if (pageThreadIds.has(tid)) return false;
          if (deferredShellIds.has(tid)) return false;
          return true;
        });
      }
    }
    reviewComments = mergePendingReviewComments(baseRc, page?.comments || []);
  }
  // When GraphQL thread meta updates resolved, stamp onto all comments in those threads
  const resolvedByThread = new Map();
  for (const t of page?.threads || []) {
    if (t?.threadNodeId) {
      resolvedByThread.set(String(t.threadNodeId), Boolean(t.resolved));
    }
  }
  const stampedCommentsRaw =
    resolvedByThread.size === 0
      ? reviewComments
      : reviewComments.map((c) => {
          if (!c?.threadNodeId) return c;
          const key = String(c.threadNodeId);
          if (!resolvedByThread.has(key)) return c;
          return { ...c, resolved: resolvedByThread.get(key) };
        });
  // Drop shell placeholders once real comments exist for that thread
  const realCommentThreadIds = new Set();
  for (const c of stampedCommentsRaw) {
    if (c && !c._commentsPending && c.threadNodeId) {
      realCommentThreadIds.add(String(c.threadNodeId));
    }
  }
  let stampedComments = stampedCommentsRaw.filter((c) => {
    if (!c?._commentsPending) return true;
    return !realCommentThreadIds.has(String(c.threadNodeId || ''));
  });
  // After GraphQL shell merge, deferred threads may have zero comment rows.
  // Inject placeholders so resolved threads remain visible until expand.
  try {
    const pure =
      typeof globalThis !== 'undefined'
        ? (globalThis as any).PRModalReviewThreads
        : null;
    const shellThreads = Array.isArray(page?.threads) ? page.threads : [];
    if (
      page?.source === 'graphql' &&
      dir !== 'ids' &&
      dir !== 'refresh' &&
      typeof pure?.ensureShellPlaceholderComments === 'function'
    ) {
      stampedComments = pure.ensureShellPlaceholderComments(
        shellThreads,
        stampedComments
      );
    } else if (
      page?.source === 'graphql' &&
      dir !== 'ids' &&
      dir !== 'refresh'
    ) {
      const covered = new Set(
        stampedComments
          .map((c: any) => (c?.threadNodeId ? String(c.threadNodeId) : ''))
          .filter(Boolean)
      );
      for (const t of shellThreads) {
        const tid = t?.threadNodeId ? String(t.threadNodeId) : '';
        if (!tid || !/^PRRT_/i.test(tid) || covered.has(tid)) continue;
        if (t.commentsLoaded === true) continue;
        stampedComments.push({
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
        covered.add(tid);
      }
    }
  } catch {
    /* keep stampedComments */
  }

  const thById = new Map(
    prevTh.map((t) => [String(t.threadNodeId), t]).filter(([k]) => k && k !== 'undefined')
  );
  for (const t of page?.threads || []) {
    if (t?.threadNodeId) {
      const prevT = thById.get(String(t.threadNodeId)) || {};
      const mergedT = {
        // @ts-expect-error classic fetch dynamic shapes
        ...prevT,
        ...t,
      };
      // GraphQL shell defer: page.commentsLoaded false wins over prior REST paint
      if (
        page?.source === 'graphql' &&
        t.commentsLoaded === false &&
        dir !== 'ids' &&
        dir !== 'refresh'
      ) {
        mergedT.commentsLoaded = false;
        mergedT.commentIds = Array.isArray(t.commentIds) ? t.commentIds : [];
      } else if (prevT.commentsLoaded === true || t.commentsLoaded === true) {
        mergedT.commentsLoaded = true;
      } else if (t.commentsLoaded === false || prevT.commentsLoaded === false) {
        mergedT.commentsLoaded =
          Array.isArray(mergedT.commentIds) && mergedT.commentIds.length > 0
            ? true
            : false;
      }
      thById.set(String(t.threadNodeId), mergedT);
    }
  }
  const reviewThreads = [...thById.values()];

  let newestIds = new Set((prevMeta.newestThreadIds || []).map(String));
  let oldestIds = new Set((prevMeta.oldestThreadIds || []).map(String));
  const pageIds = (page?.threads || [])
    .map((t) => t.threadNodeId)
    .filter(Boolean)
    .map(String);

  let newestStartCursor = prevMeta.newestStartCursor;
  let newestEndCursor = prevMeta.newestEndCursor;
  let hasOlder = prevMeta.hasOlder;
  let oldestStartCursor = prevMeta.oldestStartCursor;
  let oldestEndCursor = prevMeta.oldestEndCursor;
  let hasNewerFromOldest = prevMeta.hasNewerFromOldest;

  if (dir === 'refresh' || dir === 'ids') {
    // Bulk / targeted revalidate — preserve dual-window pagination state
  } else if (dir === 'newest' || dir === 'older') {
    for (const id of pageIds) newestIds.add(id);
    // Expanding older moves the "start" of newest window further back
    if (page?.startCursor) newestStartCursor = page.startCursor;
    if (dir === 'newest' && page?.endCursor) newestEndCursor = page.endCursor;
    hasOlder = Boolean(page?.hasPreviousPage);
  } else {
    // oldest | newer — expand oldest window toward the middle
    for (const id of pageIds) oldestIds.add(id);
    if (page?.endCursor) oldestEndCursor = page.endCursor;
    if (dir === 'oldest' && page?.startCursor) oldestStartCursor = page.startCursor;
    hasNewerFromOldest = Boolean(page?.hasNextPage);
  }

  // Windows meet when no hidden left or cursors exhausted both ways
  const isRest = page?.source === 'rest';
  // REST pages: totalCount is thread-shaped (not PR.review_comments). Prefer
  // page.hasMore for dual-window flags — never invent hasMore from a
  // comment-count vs thread-count gap (Diff auto load-all flicker).
  const totalCount = isRest
    ? Boolean(page?.hasMore)
      ? Math.max(
          reviewThreads.length,
          typeof page?.totalCount === 'number'
            ? page.totalCount
            : 0,
          Number(prevMeta.totalCount) || 0
        )
      : reviewThreads.length
    : typeof page?.totalCount === 'number'
      ? page.totalCount
      : Number(prevMeta.totalCount) || reviewThreads.length;
  const loadedThreadCount = reviewThreads.length;
  const hiddenCount = isRest
    ? Boolean(page?.hasMore)
      ? Math.max(1, totalCount - loadedThreadCount)
      : 0
    : Math.max(0, totalCount - loadedThreadCount);

  // Drop ids from oldest that are now in newest (overlap)
  for (const id of newestIds) oldestIds.delete(id);

  const restHasMore = isRest && Boolean(page?.hasMore);
  const meta = {
    ...prevMeta,
    totalCount,
    hiddenCount,
    loadedThreadCount,
    loadedCommentCount: stampedComments.length,
    pagesLoaded:
      dir === 'refresh' || dir === 'ids'
        ? Number(prevMeta.pagesLoaded) || 0
        : (Number(prevMeta.pagesLoaded) || 0) + (page?.pageCount || 1),
    newestStartCursor,
    newestEndCursor,
    hasOlder: isRest
      ? restHasMore && (dir === 'newest' || dir === 'older' || !dir)
      : hiddenCount > 0 && hasOlder,
    oldestStartCursor,
    oldestEndCursor,
    hasNewerFromOldest: isRest
      ? restHasMore && (dir === 'oldest' || dir === 'newer')
      : hiddenCount > 0 && hasNewerFromOldest,
    newestThreadIds: [...newestIds],
    oldestThreadIds: [...oldestIds],
    hasMore: isRest ? restHasMore : hiddenCount > 0,
    endCursor: newestStartCursor,
    // REST multi-page bookkeeping for load-all
    ...(isRest
      ? {
          source: 'rest',
          restPage:
            page?.restPage != null
              ? Number(page.restPage)
              : Number(prevMeta.restPage) || 1,
          restPerPage:
            page?.restPerPage != null
              ? Number(page.restPerPage)
              : Number(prevMeta.restPerPage) || null,
        }
      : page?.source
        ? { source: page.source }
        : {}),
  };

  let next = {
    ...detail,
    reviewComments: stampedComments,
    reviewThreads,
    reviewCommentsMeta: {
      ...(detail.reviewCommentsMeta || {}),
      loadedCount: stampedComments.length,
      hasMore: meta.hasMore,
    },
    reviewThreadsMeta: meta,
  };

  // Remote-deleted threads: GraphQL nodes(ids:) returns null — strip local zombies
  // so revalidate does not keep re-requesting dead PRRT ids forever.
  if ((dir === 'refresh' || dir === 'ids') && missingIds.length) {
    next = dropReviewThreadsFromDetail(next, missingIds);
  }
  return next;
}

/**
 * Fetch PR review threads (ids + isResolved) for resolve UI / legacy callers.
 * Returns [] on failure so REST detail still loads.
 */

export async function fetchPullReviewThreads(owner: any, repo: any, pullNumber: any, fetchImpl: any, token: any) {
  try {
    const bundle = await fetchPullReviewThreadsBundle(
      owner,
      repo,
      pullNumber,
      fetchImpl,
      token
    );
    return bundle.threads || [];
  } catch {
    return [];
  }
}

/**
 * Full PR detail payload for the modal: header, body, files+patches,
 * issue comments, reviews, review comments, commits, checks.
 *
 * Partial by default: only the **first GraphQL page** of review threads
 * (see opts.threadsMaxPages / opts.skipReviewThreads). More pages load via
 * fetchReviewThreadsPage + mergeReviewThreadsPageIntoDetail.
 *
 * @param {{ skipReviewThreads?: boolean, threadsMaxPages?: number, threadsCursor?: string|null }} [opts]
 */
