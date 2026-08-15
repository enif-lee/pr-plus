/** Review threads: page fetch */
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
import { fetchReviewThreadsByIds } from './review-threads-bulk';

export async function restReviewThreadsFallbackPage(
  owner: any,
  repo: any,
  pullNumber: any,
  direction: any,
  fetchImpl: any,
  token: any,
  ctx: any,
  opts: any = {}
) {
  const empty = buildRestReviewThreadsPageFromCommentsLocal([], direction);
  const perPage = Math.max(
    1,
    Math.min(
      REVIEW_THREADS_API_MAX,
      Number(opts.perPage) || REVIEW_THREADS_PAGE_SIZE
    )
  );
  const pageNum = Math.max(1, Number(opts.page) || 1);
  const knownCount =
    opts.reviewCommentsCount != null &&
    Number.isFinite(Number(opts.reviewCommentsCount))
      ? Number(opts.reviewCommentsCount)
      : null;

  // PR.review_comments === 0 → trust empty (no list fetch, no GraphQL).
  if (knownCount != null && knownCount <= 0) {
    return {
      ...empty,
      totalCount: 0,
      source: 'rest',
      reviewCommentsCount: 0,
    };
  }

  try {
    const restPage = await fetchPrCommentsPage(
      owner,
      repo,
      pullNumber,
      'review',
      { page: pageNum, perPage, preferNewest: true },
      fetchImpl,
      token,
      ctx
    );
    const items = Array.isArray(restPage?.items) ? restPage.items : [];
    if (!items.length) {
      return {
        ...empty,
        totalCount: knownCount != null ? knownCount : 0,
        source: 'rest',
        reviewCommentsCount: knownCount,
      };
    }
    const page = buildRestReviewThreadsPageFromCommentsLocal(items, direction);
    // More REST comment pages when official count exceeds this window or full page
    const hasMoreComments =
      (knownCount != null && pageNum * perPage < knownCount) ||
      (knownCount == null && items.length >= perPage);
    // Thread totalCount must be thread-shaped — never PR.review_comments.
    // Using comment count as totalCount made merge invent hiddenCount (e.g. 7
    // threads / 14 comments → hasMore forever → Diff auto load-all flicker).
    const threadTotal = hasMoreComments
      ? // Unknown full thread total while more comment pages remain
        Math.max(page.threads.length, Number(page.totalCount) || 0)
      : page.threads.length;
    console.log(
      `[pr-plus] fetchReviewThreadsPage REST: ${page.threads.length} threads, ${items.length} comments` +
        ` page=${pageNum} perPage=${perPage}` +
        (knownCount != null ? ` pr.review_comments=${knownCount}` : '') +
        (hasMoreComments ? ' hasMoreComments' : '')
    );
    return {
      ...page,
      totalCount: threadTotal,
      hasMore: hasMoreComments,
      hasPreviousPage: hasMoreComments && (direction === 'newest' || !direction),
      hasNextPage: hasMoreComments,
      pageCount: 1,
      restPage: pageNum,
      restPerPage: perPage,
      reviewCommentsCount: knownCount,
      source: 'rest',
    };
  } catch (err) {
    if (
      err?.name === 'AbortError' ||
      /aborted|AbortError/i.test(String(err?.message || ''))
    ) {
      throw err;
    }
    console.log(
      `[pr-plus] fetchReviewThreadsPage REST soft-fail: ${
        err?.message || err
      }`
    );
    return empty;
  }
}

export async function fetchReviewThreadsPage(
  owner: any,
  repo: any,
  pullNumber: any,
  {
    direction = 'newest',
    cursor = null,
    pageSize = REVIEW_THREADS_PAGE_SIZE,
    preferRest = null,
    forceGraphql = false,
    forceFull = false,
    reviewCommentsCount = null,
    restPage = 1,
    /** When true, bulk-fetch comments for every shell thread (rare). */
    forceAllComments = false,
    /**
     * When true, return shell-only (no eager by-ids). Host stages progress as
     * threads → comments → reactions by calling by-ids separately.
     */
    skipEagerComments = false,
  }: any = {},
  fetchImpl: any,
  token: any,
  ctx: any = null
) {
  ctx = normalizeApiCtx(ctx);
  const empty = {
    threads: [] as any[],
    comments: [] as any[],
    hasMore: false,
    endCursor: null as any,
    startCursor: null as any,
    hasNextPage: false,
    hasPreviousPage: false,
    totalCount: null as any,
    pageCount: 0,
    direction,
    source: null as any,
  };
  const n = Number(pullNumber);
  if (!Number.isFinite(n)) return empty;
  const size = Math.max(
    1,
    Math.min(REVIEW_THREADS_API_MAX, Number(pageSize) || REVIEW_THREADS_PAGE_SIZE)
  );
  const dir = String(direction || 'newest');
  const transport = chooseReviewThreadsTransportLocal({
    direction: dir,
    cursor,
    preferRest,
    forceGraphql,
    forceFull,
  });

  // GraphQL-first: shell window (PRRT_…) + selective comments bulk.
  // REST only when transport === 'rest' (explicit preferRest: true).
  const useRest = transport === 'rest';

  if (useRest) {
    const rest = await restReviewThreadsFallbackPage(
      owner,
      repo,
      n,
      dir,
      fetchImpl,
      token,
      ctx,
      {
        perPage: size,
        page: restPage,
        reviewCommentsCount,
      }
    );
    return { ...rest, source: 'rest' };
  }

  // GraphQL shell (no nested comments(first:100)) then eager by-ids comments.
  if (!token) return { ...empty, source: null };

  const useLast = dir === 'newest' || dir === 'older';
  const query = useLast ? REVIEW_THREADS_LAST_QUERY : REVIEW_THREADS_FIRST_QUERY;
  // newest: last:N, cursor=null
  // older:  last:N, before=cursor (start of current newest window)
  // oldest: first:N, cursor=null
  // newer:  first:N, after=cursor (end of current oldest window)
  try {
    const data = await apiGraphql(
      query,
      {
        owner,
        name: repo,
        number: n,
        n: size,
        cursor: cursor || null,
      },
      fetchImpl,
      token,
      ctx
    );
    const conn = data?.repository?.pullRequest?.reviewThreads;
    const nodes = conn?.nodes || [];
    const pageInfo = conn?.pageInfo || {};
    const mapped = mapReviewThreadNodes(nodes);
    // Tag threads with load window for UI gap split
    const windowTag =
      dir === 'newest' || dir === 'older' ? 'newest' : 'oldest';
    for (const t of mapped.threads) {
      t.loadWindow = windowTag;
      // Shell may embed comments(first:1) preview; only full loads set true.
      if (t.commentsLoaded !== true) t.commentsLoaded = false;
    }
    // Empty GraphQL window is authoritative (no REST fallback).

    let page = {
      threads: mapped.threads,
      comments: mapped.comments,
      totalCount:
        typeof conn?.totalCount === 'number' ? conn.totalCount : null,
      startCursor: pageInfo.startCursor || null,
      endCursor: pageInfo.endCursor || null,
      hasNextPage: Boolean(pageInfo.hasNextPage),
      hasPreviousPage: Boolean(pageInfo.hasPreviousPage),
      // Convenience for dual-window UI
      hasMore:
        useLast
          ? Boolean(pageInfo.hasPreviousPage)
          : Boolean(pageInfo.hasNextPage),
      pageCount: 1,
      direction: dir,
      window: windowTag,
      source: 'graphql',
      shellOnly: true,
    };

    // Selective comments bulk: unresolved (default expanded) only.
    // forceFull still defers resolved until expand — plan: no free first:100
    // on every node. forceAllComments opts reserved for future.
    // skipEagerComments: host owns by-ids so open progress can mark
    // threads → comments → reactions as separate bar steps.
    if (skipEagerComments) {
      (page as any).shellOnly = true;
      (page as any).eagerCommentIds = [];
      console.log(
        `[pr-plus] fetchReviewThreadsPage GraphQL shell-only: ${page.threads.length} threads (eager deferred to host)`
      );
    } else {
      const eagerIds = selectEagerCommentThreadIdsLocal(page.threads, {
        forceAll: Boolean(forceAllComments),
      });
      if (eagerIds.length) {
        try {
          const bulk = await fetchReviewThreadsByIds(
            eagerIds,
            fetchImpl,
            token,
            ctx
          );
          page = mergeCommentsBulkIntoThreadsPage(page, bulk) as any;
          (page as any).shellOnly = false;
          (page as any).eagerCommentIds = eagerIds;
          console.log(
            `[pr-plus] fetchReviewThreadsPage GraphQL shell+comments: ` +
              `${page.threads.length} threads, eagerComments=${eagerIds.length}, ` +
              `comments=${page.comments.length}`
          );
        } catch (bulkErr) {
          console.log(
            `[pr-plus] fetchReviewThreadsPage eager comments soft-fail: ${
              bulkErr?.message || bulkErr
            }`
          );
        }
      } else {
        console.log(
          `[pr-plus] fetchReviewThreadsPage GraphQL shell: ${page.threads.length} threads (no eager comments)`
        );
      }
    }
    // Always attach shell placeholders for deferred threads (resolved, etc.)
    // so Diff/Conversation rows exist before lazy expand.
    try {
      const pure =
        typeof globalThis !== 'undefined'
          ? (globalThis as any).PRModalReviewThreads
          : null;
      if (typeof pure?.ensureShellPlaceholderComments === 'function') {
        page = {
          ...page,
          comments: pure.ensureShellPlaceholderComments(
            page.threads,
            page.comments
          ),
        };
      } else {
        const covered = new Set(
          (page.comments || [])
            .map((c: any) => (c?.threadNodeId ? String(c.threadNodeId) : ''))
            .filter(Boolean)
        );
        const extra = [];
        for (const t of page.threads || []) {
          const tid = t?.threadNodeId ? String(t.threadNodeId) : '';
          if (!tid || !/^PRRT_/i.test(tid) || covered.has(tid)) continue;
          if (t.commentsLoaded === true) continue;
          extra.push({
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
        if (extra.length) {
          page = { ...page, comments: [...(page.comments || []), ...extra] };
        }
      }
    } catch {
      /* keep page as-is */
    }
    return page;
  } catch (err) {
    if (
      err?.name === 'AbortError' ||
      /aborted|AbortError/i.test(String(err?.message || ''))
    ) {
      throw err;
    }
    // No REST fallback — surface GraphQL failures to the caller.
    throw err;
  }
}

/**
 * Collect GraphQL thread node ids (PRRT_…) that are unresolved in a detail snapshot.
 * Used for cache revalidate bulk refresh.
 * @param {object|null} detail
 * @returns {string[]}
 */
export function isGraphqlReviewThreadNodeIdLocal(id: any): boolean {
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

export function collectUnresolvedThreadNodeIds(detail: any) {
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
    // GraphQL by-id bulk only understands PRRT_… — never rest-thread-* / PRRC_
    if (!isGraphqlReviewThreadNodeIdLocal(id)) continue;
    ids.add(id);
  }
  const list = Array.isArray(detail?.reviewComments) ? detail.reviewComments : [];
  const byId = new Map();
  for (const c of list) {
    if (c && c.id != null) byId.set(String(c.id), c);
  }
  for (const c of list) {
    if (!c?.threadNodeId || c.resolved) continue;
    const id = String(c.threadNodeId);
    if (dropped.has(id)) continue;
    if (!isGraphqlReviewThreadNodeIdLocal(id)) continue;
    const parentId = c.inReplyToId ?? c.in_reply_to_id ?? null;
    // Prefer roots (or orphans) — replies inherit resolved from thread meta anyway
    if (parentId != null && byId.has(String(parentId))) continue;
    ids.add(id);
  }
  return [...ids];
}

/**
 * Fetch specific review threads by GraphQL global ids (PRRT_…).
 * Batches in chunks of REVIEW_THREADS_API_MAX (100).
 * @param {string[]} threadNodeIds
 * @param {typeof fetch} fetchImpl
 * @param {string} token
 */
