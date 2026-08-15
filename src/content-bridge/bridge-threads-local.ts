/** threads local */
export function findDanglingPrNumbers(pagePrNumbers: any, prs: any) {
  if (!Array.isArray(pagePrNumbers) || pagePrNumbers.length === 0) return [];
  const have = new Set((prs || []).map((pr: any) => pr.number));
  const dangling = [];
  const seen = new Set();
  for (const raw of pagePrNumbers) {
    const num = Number(raw);
    if (!Number.isFinite(num) || seen.has(num) || have.has(num)) continue;
    seen.add(num);
    dangling.push(num);
  }
  return dangling;
}

export function emptyReviewThreadsMetaLocal() {
  return {
    totalCount: 0,
    hiddenCount: 0,
    loadedThreadCount: 0,
    loadedCommentCount: 0,
    pagesLoaded: 0,
    newestStartCursor: null as any,
    newestEndCursor: null as any,
    hasOlder: false,
    oldestStartCursor: null as any,
    oldestEndCursor: null as any,
    hasNewerFromOldest: false,
    newestThreadIds: [] as any[],
    oldestThreadIds: [] as any[],
    hasMore: false,
    endCursor: null as any,
  };
}

/**
 * Drop remote-deleted PRRT threads (and comments) from a detail snapshot.
 * Mirrors fetch-pulls.dropReviewThreadsFromDetail.
 */
export function dropReviewThreadsFromDetailLocal(detail: any, threadNodeIds: any) {
  if (!detail) return detail;
  const drop = new Set(
    [...(threadNodeIds || [])]
      .map((id) => String(id || '').trim())
      .filter(Boolean)
  );
  if (!drop.size) return detail;

  const prevRc = Array.isArray(detail.reviewComments) ? detail.reviewComments : [];
  const prevTh = Array.isArray(detail.reviewThreads) ? detail.reviewThreads : [];
  const droppedCommentIds: any[] = [];
  const reviewComments = prevRc.filter((c: any) => {
    if (!c) return false;
    const tid = (c as any).threadNodeId ? String((c as any).threadNodeId) : '';
    if (tid && drop.has(tid)) {
      if (c.id != null) droppedCommentIds.push(String(c.id));
      return false;
    }
    return true;
  });
  const reviewThreads = prevTh.filter(
    (t: any) => !t?.threadNodeId || !drop.has(String(t.threadNodeId))
  );

  const prevDeleted =
    detail._deletedReviewCommentIds instanceof Set
      ? detail._deletedReviewCommentIds
      : Array.isArray(detail._deletedReviewCommentIds)
        ? detail._deletedReviewCommentIds
        : [];
  const deleted = new Set([...prevDeleted, ...droppedCommentIds].map(String));

  const prevDroppedThreads =
    detail._droppedThreadNodeIds instanceof Set
      ? detail._droppedThreadNodeIds
      : Array.isArray(detail._droppedThreadNodeIds)
        ? detail._droppedThreadNodeIds
        : [];
  const droppedThreads = new Set([...prevDroppedThreads, ...drop].map(String));

  const prevMeta = detail.reviewThreadsMeta || emptyReviewThreadsMetaLocal();
  const filterIdList = (list: any) =>
    (Array.isArray(list) ? list : [])
      .map(String)
      .filter((id) => id && !drop.has(id));
  const loadedThreadCount = reviewThreads.length;
  const totalCount = Math.max(
    0,
    Number(prevMeta.totalCount) || loadedThreadCount
  );
  const nextTotal =
    Number.isFinite(Number(prevMeta.totalCount)) &&
    Number(prevMeta.totalCount) >= drop.size
      ? Math.max(loadedThreadCount, Number(prevMeta.totalCount) - drop.size)
      : totalCount;
  const hiddenCount = Math.max(0, nextTotal - loadedThreadCount);

  return {
    ...detail,
    reviewComments,
    reviewThreads,
    reviewCommentsMeta: {
      ...(detail.reviewCommentsMeta || ({} as any)),
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
    _droppedThreadNodeIds: droppedThreads,
  };
}

/**
 * Dual-window merge (mirrors fetch-pulls.mergeReviewThreadsPageIntoDetail).
 * Keeps newest/oldest id sets + cursors so middle Load more can expand either end.
 */
export function mergeReviewThreadsPageIntoDetailLocal(detail: any, page: any, direction = 'older') {
  if (!detail) return detail;
  const dir = String(direction || page?.direction || 'older');
  const prevMeta = detail.reviewThreadsMeta || emptyReviewThreadsMetaLocal();
  const prevRc = Array.isArray(detail.reviewComments) ? detail.reviewComments : [];
  const prevTh = Array.isArray(detail.reviewThreads) ? detail.reviewThreads : [];

  // Confirmed remote-null only — never requested − returned (by-id fail ≠ drop).
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
        page.missingThreadIds
          .map((id: any) => String(id || '').trim())
          .filter(Boolean)
      ),
    ];
  })();

  // GraphQL shell±bulk authority: drop REST synthetic + prev rows for page PRRTs
  // so deferred shells stay body-less until expand (mirrors fetch-api merge).
  const deferredShellIds = new Set();
  const pageThreadIds = new Set();
  if (
    page?.source === 'graphql' &&
    dir !== 'ids' &&
    dir !== 'refresh' &&
    Array.isArray(page?.threads)
  ) {
    for (const t of page.threads) {
      if (!t?.threadNodeId) continue;
      const id = String(t.threadNodeId);
      pageThreadIds.add(id);
      if (t.commentsLoaded === false) deferredShellIds.add(id);
    }
  }

  let baseRc = prevRc;
  if (pageThreadIds.size) {
    baseRc = prevRc.filter((c: any) => {
      if (!c) return false;
      const tid = (c as any).threadNodeId != null ? String((c as any).threadNodeId) : '';
      if (tid.startsWith('rest-thread-')) return false;
      if (pageThreadIds.has(tid)) return false;
      if (deferredShellIds.has(tid)) return false;
      return true;
    });
  }

  const byId = new Map(baseRc.map((c: any) => [String(c.id), c]));
  for (const c of page?.comments || []) {
    if (c?.id != null) {
      byId.set(String(c.id), { ...(byId.get(String(c.id)) || ({} as any)), ...c });
    }
  }
  const thById = new Map();
  for (const t of prevTh) {
    if (t?.threadNodeId) thById.set(String(t.threadNodeId), t);
  }
  for (const t of page?.threads || []) {
    if (t?.threadNodeId) {
      const prevT = thById.get(String(t.threadNodeId)) || ({} as any);
      const mergedT = { ...prevT, ...t };
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
      }
      thById.set(String(t.threadNodeId), mergedT);
    }
  }
  const reviewThreads = [...thById.values()];

  const newestIds = new Set((prevMeta.newestThreadIds || []).map(String));
  const oldestIds = new Set((prevMeta.oldestThreadIds || []).map(String));
  const pageIds = (page?.threads || [])
    .map((t: any) => t.threadNodeId)
    .filter(Boolean)
    .map(String);

  let newestStartCursor = prevMeta.newestStartCursor;
  let newestEndCursor = prevMeta.newestEndCursor;
  let hasOlder = prevMeta.hasOlder;
  let oldestStartCursor = prevMeta.oldestStartCursor;
  let oldestEndCursor = prevMeta.oldestEndCursor;
  let hasNewerFromOldest = prevMeta.hasNewerFromOldest;

  if (dir === 'refresh' || dir === 'ids') {
    // bulk revalidate — keep dual-window cursors / id sets
  } else if (dir === 'newest' || dir === 'older') {
    for (const id of pageIds) newestIds.add(id);
    if (page?.startCursor) newestStartCursor = page.startCursor;
    if (dir === 'newest' && page?.endCursor) newestEndCursor = page.endCursor;
    hasOlder = Boolean(page?.hasPreviousPage);
  } else {
    for (const id of pageIds) oldestIds.add(id);
    if (page?.endCursor) oldestEndCursor = page.endCursor;
    if (dir === 'oldest' && page?.startCursor) oldestStartCursor = page.startCursor;
    hasNewerFromOldest = Boolean(page?.hasNextPage);
  }

  const totalCount =
    typeof page?.totalCount === 'number'
      ? page.totalCount
      : Number(prevMeta.totalCount) || reviewThreads.length;
  const loadedThreadCount = reviewThreads.length;
  const hiddenCount = Math.max(0, totalCount - loadedThreadCount);
  for (const id of newestIds) oldestIds.delete(id);

  // Default: merge by comment id. ids/refresh: hydrate in place (stable order).
  let reviewComments = [...byId.values()];
  if ((dir === 'refresh' || dir === 'ids') && pageIds.length) {
    const refreshed = new Set(pageIds);
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
      } else {
        const kept = prevRc.filter(
          (c: any) =>
            !(c as any)?.threadNodeId ||
            !refreshed.has(String((c as any).threadNodeId))
        );
        const keptMap = new Map(kept.map((c: any) => [String(c.id), c]));
        for (const c of page?.comments || []) {
          if (c?.id != null) {
            keptMap.set(String(c.id), {
              ...(keptMap.get(String(c.id)) || ({} as any)),
              ...c,
            });
          }
        }
        reviewComments = [...keptMap.values()];
      }
    } catch {
      const kept = prevRc.filter(
        (c: any) =>
          !(c as any)?.threadNodeId ||
          !refreshed.has(String((c as any).threadNodeId))
      );
      reviewComments = [
        ...kept,
        ...((page?.comments || []) as any[]),
      ];
    }
  }
  // Drop shell placeholders once real comments exist
  const realCommentThreadIds = new Set();
  for (const c of reviewComments) {
    if (c && !(c as any)._commentsPending && (c as any).threadNodeId) {
      realCommentThreadIds.add(String((c as any).threadNodeId));
    }
  }
  reviewComments = reviewComments.filter((c) => {
    if (!(c as any)?._commentsPending) return true;
    return !realCommentThreadIds.has(String((c as any).threadNodeId || ''));
  });
  // Deferred GraphQL shells need placeholder rows or Diff/Conversation hide them.
  if (
    page?.source === 'graphql' &&
    dir !== 'ids' &&
    dir !== 'refresh' &&
    Array.isArray(page?.threads)
  ) {
    try {
      const pure =
        typeof globalThis !== 'undefined'
          ? (globalThis as any).PRModalReviewThreads
          : null;
      if (typeof pure?.ensureShellPlaceholderComments === 'function') {
        reviewComments = pure.ensureShellPlaceholderComments(
          page.threads,
          reviewComments
        );
      } else {
        const covered = new Set(
          reviewComments
            .map((c: any) => (c?.threadNodeId ? String(c.threadNodeId) : ''))
            .filter(Boolean)
        );
        for (const t of page.threads) {
          const tid = t?.threadNodeId ? String(t.threadNodeId) : '';
          if (!tid || !/^PRRT_/i.test(tid) || covered.has(tid)) continue;
          if (t.commentsLoaded === true) continue;
          reviewComments.push({
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
          } as any);
          covered.add(tid);
        }
      }
    } catch {
      /* keep reviewComments */
    }
  }
  const resolvedByThread = new Map();
  for (const t of page?.threads || []) {
    if (t?.threadNodeId) {
      resolvedByThread.set(String(t.threadNodeId), Boolean(t.resolved));
    }
  }
  if (resolvedByThread.size) {
    reviewComments = reviewComments.map((c) => {
      if (!(c as any)?.threadNodeId) return c;
      const k = String((c as any).threadNodeId);
      if (!resolvedByThread.has(k)) return c;
      return { ...(c as any), resolved: resolvedByThread.get(k) };
    });
  }

  const meta = {
    ...prevMeta,
    totalCount,
    hiddenCount,
    loadedThreadCount,
    loadedCommentCount: reviewComments.length,
    pagesLoaded:
      dir === 'refresh' || dir === 'ids'
        ? Number(prevMeta.pagesLoaded) || 0
        : (Number(prevMeta.pagesLoaded) || 0) + (page?.pageCount || 1),
    newestStartCursor,
    newestEndCursor,
    hasOlder: hiddenCount > 0 && hasOlder,
    oldestStartCursor,
    oldestEndCursor,
    hasNewerFromOldest: hiddenCount > 0 && hasNewerFromOldest,
    newestThreadIds: [...newestIds],
    oldestThreadIds: [...oldestIds],
    hasMore: hiddenCount > 0,
    endCursor: newestStartCursor,
  };

  let next = {
    ...detail,
    reviewComments,
    reviewThreads,
    reviewCommentsMeta: {
      ...(detail.reviewCommentsMeta || ({} as any)),
      loadedCount: reviewComments.length,
      hasMore: meta.hasMore,
    },
    reviewThreadsMeta: meta,
  };

  // Remote-deleted: strip so revalidate does not re-request forever
  if ((dir === 'refresh' || dir === 'ids') && missingIds.length) {
    next = dropReviewThreadsFromDetailLocal(next, missingIds);
  }
  return next;
}

export function isGraphqlReviewThreadNodeIdBridge(id: any): boolean {
  try {
    const pure =
      typeof globalThis !== 'undefined'
        ? (globalThis as any).PRModalReviewThreads
        : null;
    if (typeof pure?.isGraphqlReviewThreadNodeId === 'function') {
      return Boolean(pure.isGraphqlReviewThreadNodeId(id));
    }
  } catch {
    /* fall through */
  }
  return /^PRRT_/i.test(String(id || '').trim());
}

export function collectUnresolvedThreadNodeIdsLocal(detail: any) {
  const dropped =
    detail?._droppedThreadNodeIds instanceof Set
      ? detail._droppedThreadNodeIds
      : new Set(
          Array.isArray(detail?._droppedThreadNodeIds)
            ? detail._droppedThreadNodeIds.map(String)
            : []
        );
  const ids = new Set();
  for (const t of Array.isArray(detail?.reviewThreads) ? detail.reviewThreads : []) {
    if (!t?.threadNodeId || t.resolved) continue;
    const id = String(t.threadNodeId);
    if (dropped.has(id)) continue;
    if (!isGraphqlReviewThreadNodeIdBridge(id)) continue;
    ids.add(id);
  }
  const list = Array.isArray(detail?.reviewComments) ? detail.reviewComments : [];
  const byId = new Map();
  for (const c of list) {
    if (c && c.id != null) byId.set(String(c.id), c);
  }
  for (const c of list) {
    if (!(c as any)?.threadNodeId || c.resolved) continue;
    const id = String((c as any).threadNodeId);
    if (dropped.has(id)) continue;
    if (!isGraphqlReviewThreadNodeIdBridge(id)) continue;
    const parentId = c.inReplyToId ?? c.in_reply_to_id ?? null;
    if (parentId != null && byId.has(String(parentId))) continue;
    ids.add(id);
  }
  return [...ids];
}

