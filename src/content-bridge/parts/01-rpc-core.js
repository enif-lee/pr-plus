/**
 * Content-script bridge: talks to the service worker for token-backed work.
 * The raw PAT never enters the content-script context.
 */

(function initPrTreeContentBridge() {
  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function isTransientChannelError(msg) {
    return /message channel closed|Receiving end does not exist|asynchronous response|Could not establish connection|Extension context invalidated/i.test(
      String(msg || '')
    );
  }

  function isContextInvalidated(msg) {
    return /Extension context invalidated/i.test(String(msg || ''));
  }

  /** True when this content script can no longer talk to the extension (reload/update). */
  function isExtensionContextAlive() {
    try {
      return Boolean(globalThis.chrome?.runtime?.id);
    } catch {
      return false;
    }
  }

  const RELOAD_REFRESH_MSG =
    'Extension was reloaded. Refresh this GitHub tab (⌘R / Ctrl+R) to reconnect pr+.';

  /**
   * Prefer Promise-based chrome.runtime.sendMessage (MV3).
   * Retries with backoff while the service worker wakes from idle.
   * After extension reload, only a full page refresh can re-bind content scripts.
   */
  /** Page origin context for GitHub Enterprise endpoint resolution. */
  function pageEndpointContext() {
    try {
      const host = String(globalThis.location?.hostname || '').toLowerCase();
      const origin = String(globalThis.location?.origin || '');
      return { webHost: host, webOrigin: origin };
    } catch {
      return { webHost: '', webOrigin: '' };
    }
  }

  function makeAbortError() {
    const err = new Error('The operation was aborted.');
    err.name = 'AbortError';
    return err;
  }

  function isAbortError(err) {
    return (
      err?.name === 'AbortError' ||
      /aborted|AbortError/i.test(String(err?.message || err || ''))
    );
  }

  let requestSeq = 0;
  function nextRequestId() {
    requestSeq += 1;
    return `prp-req-${Date.now().toString(36)}-${requestSeq}`;
  }

  /**
   * Ask the service worker to abort GitHub fetches for the given ids.
   * Fire-and-forget; safe if SW is already gone.
   * @param {string[]|string|null} requestIds
   * @param {{ cancelAll?: boolean }} [opts] cancelAll aborts every active SW GitHub fetch
   */
  function cancelFetches(requestIds, opts = {}) {
    const ids = Array.isArray(requestIds)
      ? requestIds.map(String).filter(Boolean)
      : requestIds != null
        ? [String(requestIds)]
        : [];
    const cancelAll = Boolean(opts?.cancelAll);
    if ((!ids.length && !cancelAll) || !isExtensionContextAlive()) {
      return Promise.resolve({ ok: false });
    }
    return chrome.runtime
      .sendMessage({
        type: 'PR_TREE_CANCEL_FETCH',
        requestIds: ids,
        ...(cancelAll ? { cancelAll: true } : null),
      })
      .catch(() => ({ ok: false }));
  }

  /** Reject when AbortSignal fires (unblocks await sendMessage on sheet close). */
  function whenAborted(signal) {
    return new Promise((_, reject) => {
      if (!signal) return;
      if (signal.aborted) {
        reject(makeAbortError());
        return;
      }
      signal.addEventListener(
        'abort',
        () => {
          reject(makeAbortError());
        },
        { once: true }
      );
    });
  }

  async function send(message, { retries = 4, signal = null } = {}) {
    if (!globalThis.chrome?.runtime?.sendMessage) {
      throw new Error('chrome.runtime unavailable');
    }
    // After chrome://extensions Reload, old content scripts lose chrome.runtime.id
    if (!isExtensionContextAlive()) {
      throw new Error(RELOAD_REFRESH_MSG);
    }
    if (signal?.aborted) throw makeAbortError();

    const page = pageEndpointContext();
    const requestId =
      (message && message.requestId) ||
      (signal ? nextRequestId() : null);
    const payload =
      message && typeof message === 'object'
        ? {
            ...message,
            ...(requestId ? { requestId } : null),
            webHost: message.webHost || page.webHost,
            webOrigin: message.webOrigin || page.webOrigin,
          }
        : message;

    // Track ids so host can bulk-cancel without relying only on signal listeners
    if (requestId && signal) {
      try {
        if (!signal.__prpRequestIds) signal.__prpRequestIds = new Set();
        signal.__prpRequestIds.add(requestId);
      } catch {
        /* ignore */
      }
    }

    const onAbort = () => {
      if (requestId) void cancelFetches([requestId]);
    };
    if (signal) {
      signal.addEventListener('abort', onAbort, { once: true });
    }

    const msgType = String(payload?.type || message?.type || '');
    const logFetch =
      /FETCH|DETAIL|THREADS|COMMITS|CHECKS|DEVELOPMENT|COMMENTS|REVIEWS|FILES|COMPARE/i.test(
        msgType
      ) && !/PING|CANCEL/i.test(msgType);
    const tBridge0 =
      typeof performance !== 'undefined' && performance.now
        ? performance.now()
        : Date.now();
    if (logFetch) {
      console.log(
        `[pr-plus][bridge] start ${msgType}` +
          (payload?.owner && payload?.repo
            ? ` ${payload.owner}/${payload.repo}`
            : '') +
          (payload?.number != null ? `#${payload.number}` : '') +
          (payload?.headSha
            ? ` sha=${String(payload.headSha).slice(0, 7)}`
            : '')
      );
    }

    let lastErr;
    try {
      for (let attempt = 0; attempt <= retries; attempt++) {
        if (signal?.aborted) throw makeAbortError();
        try {
          // Race: sheet close must not wait for SW to finish the full fetch.
          // CANCEL_FETCH runs immediately in SW (outside exclusive queue) and
          // aborts the underlying GitHub HTTP; race unblocks the content side.
          const sendP = chrome.runtime.sendMessage(payload);
          const response = signal
            ? await Promise.race([sendP, whenAborted(signal)])
            : await sendP;
          if (signal?.aborted) throw makeAbortError();
          if (response?.aborted) throw makeAbortError();
          if (logFetch) {
            const ms = Math.round(
              ((typeof performance !== 'undefined' && performance.now
                ? performance.now()
                : Date.now()) -
                tBridge0)
            );
            const ok = response?.ok !== false;
            console.log(
              `[pr-plus][bridge] end ${msgType} ${ms}ms${ok ? ' ok' : ' fail'}` +
                (response?.error ? ` err=${String(response.error).slice(0, 80)}` : '')
            );
          }
          return response;
        } catch (e) {
          if (isAbortError(e)) throw e;
          const msg = e?.message || String(e);
          lastErr = new Error(msg);
          if (isContextInvalidated(msg) || !isExtensionContextAlive()) {
            throw new Error(RELOAD_REFRESH_MSG);
          }
          // Do not retry after abort / sheet close
          if (signal?.aborted) throw makeAbortError();
          if (attempt < retries && isTransientChannelError(msg)) {
            // Wake SW: light PING then retry (idle SW common after minutes unused)
            try {
              await chrome.runtime.sendMessage({ type: 'PR_TREE_PING' });
            } catch {
              /* ignore — next attempt is the real message */
            }
            await sleep(80 + attempt * 160);
            continue;
          }
          if (logFetch) {
            const ms = Math.round(
              ((typeof performance !== 'undefined' && performance.now
                ? performance.now()
                : Date.now()) -
                tBridge0)
            );
            console.log(
              `[pr-plus][bridge] end ${msgType} ${ms}ms fail err=${String(msg).slice(0, 100)}`
            );
          }
          if (/Receiving end does not exist|Could not establish connection/i.test(msg)) {
            throw new Error(
              'Background worker offline. Open chrome://extensions → pr+ → Reload, then refresh this page (⌘R).'
            );
          }
          throw lastErr;
        }
      }
      throw lastErr || new Error('Failed to message background worker');
    } finally {
      if (signal) {
        try {
          signal.removeEventListener('abort', onAbort);
        } catch {
          /* ignore */
        }
      }
    }
  }

  /** Pure helper (no network / no token). */
  function findDanglingPrNumbers(pagePrNumbers, prs) {
    if (!Array.isArray(pagePrNumbers) || pagePrNumbers.length === 0) return [];
    const have = new Set((prs || []).map((pr) => pr.number));
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

  function emptyReviewThreadsMetaLocal() {
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
   * Drop remote-deleted PRRT threads (and comments) from a detail snapshot.
   * Mirrors fetch-pulls.dropReviewThreadsFromDetail.
   */
  function dropReviewThreadsFromDetailLocal(detail, threadNodeIds) {
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
    const filterIdList = (list) =>
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
      _droppedThreadNodeIds: droppedThreads,
    };
  }

  /**
   * Dual-window merge (mirrors fetch-pulls.mergeReviewThreadsPageIntoDetail).
   * Keeps newest/oldest id sets + cursors so middle Load more can expand either end.
   */
  function mergeReviewThreadsPageIntoDetailLocal(detail, page, direction = 'older') {
    if (!detail) return detail;
    const dir = String(direction || page?.direction || 'older');
    const prevMeta = detail.reviewThreadsMeta || emptyReviewThreadsMetaLocal();
    const prevRc = Array.isArray(detail.reviewComments) ? detail.reviewComments : [];
    const prevTh = Array.isArray(detail.reviewThreads) ? detail.reviewThreads : [];

    // Remote-deleted threads from nodes(ids:) bulk fetch
    const explicitMissing = Array.isArray(page?.missingThreadIds)
      ? page.missingThreadIds.map(String).filter(Boolean)
      : [];
    const requested = Array.isArray(page?.requestedThreadIds)
      ? page.requestedThreadIds.map(String).filter(Boolean)
      : [];
    const returnedIds = new Set(
      (page?.threads || [])
        .map((t) => (t?.threadNodeId ? String(t.threadNodeId) : ''))
        .filter(Boolean)
    );
    const derivedMissing =
      requested.length > 0
        ? requested.filter((id) => !returnedIds.has(id))
        : [];
    const missingIds = [...new Set([...explicitMissing, ...derivedMissing])];

    const byId = new Map(prevRc.map((c) => [String(c.id), c]));
    for (const c of page?.comments || []) {
      if (c?.id != null) {
        byId.set(String(c.id), { ...(byId.get(String(c.id)) || {}), ...c });
      }
    }
    const thById = new Map();
    for (const t of prevTh) {
      if (t?.threadNodeId) thById.set(String(t.threadNodeId), t);
    }
    for (const t of page?.threads || []) {
      if (t?.threadNodeId) {
        thById.set(String(t.threadNodeId), {
          ...(thById.get(String(t.threadNodeId)) || {}),
          ...t,
        });
      }
    }
    const reviewThreads = [...thById.values()];

    const newestIds = new Set((prevMeta.newestThreadIds || []).map(String));
    const oldestIds = new Set((prevMeta.oldestThreadIds || []).map(String));
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

    // Default: merge by comment id. refresh: replace comments for updated threads.
    let reviewComments = [...byId.values()];
    if ((dir === 'refresh' || dir === 'ids') && pageIds.length) {
      const refreshed = new Set(pageIds);
      const kept = prevRc.filter(
        (c) => !c?.threadNodeId || !refreshed.has(String(c.threadNodeId))
      );
      const keptMap = new Map(kept.map((c) => [String(c.id), c]));
      for (const c of page?.comments || []) {
        if (c?.id != null) keptMap.set(String(c.id), { ...(keptMap.get(String(c.id)) || {}), ...c });
      }
      reviewComments = [...keptMap.values()];
    }
    const resolvedByThread = new Map();
    for (const t of page?.threads || []) {
      if (t?.threadNodeId) {
        resolvedByThread.set(String(t.threadNodeId), Boolean(t.resolved));
      }
    }
    if (resolvedByThread.size) {
      reviewComments = reviewComments.map((c) => {
        if (!c?.threadNodeId) return c;
        const k = String(c.threadNodeId);
        if (!resolvedByThread.has(k)) return c;
        return { ...c, resolved: resolvedByThread.get(k) };
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
        ...(detail.reviewCommentsMeta || {}),
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

  function collectUnresolvedThreadNodeIdsLocal(detail) {
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
      const parentId = c.inReplyToId ?? c.in_reply_to_id ?? null;
      if (parentId != null && byId.has(String(parentId))) continue;
      ids.add(id);
    }
    return [...ids];
  }

  const PRTreeFetch = {
    findDanglingPrNumbers,
    async fetchOpenPulls(owner, repo, _fetchImpl, options = {}) {
      const res = await send(
        {
          type: 'PR_TREE_FETCH_OPEN_PULLS',
          owner,
          repo,
          pagePrNumbers: options.pagePrNumbers || [],
        },
        { signal: options.signal || null }
      );
      if (!res?.ok) {
        if (res?.aborted) throw makeAbortError();
        const err = new Error(res?.error || 'Failed to fetch pull requests');
        err.status = res?.status;
        throw err;
      }
      return res.prs || [];
    },
    async fetchDanglingPulls(owner, repo, numbers) {
      const res = await send({
        type: 'PR_TREE_FETCH_DANGLING',
        owner,
        repo,
        numbers: numbers || [],
      });
      if (!res?.ok) {
        const err = new Error(res?.error || 'Failed to fetch dangling PRs');
        err.status = res?.status;
        throw err;
      }
      return res.prs || [];
    },
    /**
     * @param {{ skipReviewThreads?: boolean, threadsMaxPages?: number }} [opts]
     */
    async fetchPrDetail(owner, repo, number, opts = {}) {
      const t0 =
        typeof performance !== 'undefined' && performance.now
          ? performance.now()
          : Date.now();
      const res = await send(
        {
          type: 'PR_TREE_FETCH_PR_DETAIL',
          owner,
          repo,
          number,
          skipReviewThreads: Boolean(opts.skipReviewThreads),
          threadsMaxPages: opts.threadsMaxPages,
        },
        { signal: opts.signal || null }
      );
      const roundTrip = Math.round(
        (typeof performance !== 'undefined' && performance.now
          ? performance.now()
          : Date.now()) - t0
      );
      if (!res?.ok) {
        if (res?.aborted) throw makeAbortError();
        console.log(
          `[pr-plus] fetchPrDetail page round-trip ${owner}/${repo}#${number}: ${roundTrip}ms ERROR`,
          res?.error
        );
        const err = new Error(res?.error || 'Failed to fetch PR detail');
        err.status = res?.status;
        throw err;
      }
      const timings = res.detail?._fetchTimings || res.timings || null;
      console.log(
        `[pr-plus] fetchPrDetail page round-trip ${owner}/${repo}#${number}: ${roundTrip}ms` +
          ` skipReviewThreads=${Boolean(opts.skipReviewThreads)} ` +
          (timings ? JSON.stringify(timings) : '(no per-request timings)')
      );
      return res.detail;
    },
    /**
     * Lazy GraphQL page of review threads (+ comments with diffHunk).
     * Dual-window directions:
     *   newest | older  → last:N (before cursor for older)
     *   oldest | newer  → first:N (after cursor for newer)
     * @param {{ direction?: string, cursor?: string|null, pageSize?: number }} [opts]
     */
    async fetchReviewThreadsPage(owner, repo, number, opts = {}) {
      const res = await send(
        {
          type: 'PR_TREE_FETCH_REVIEW_THREADS_PAGE',
          owner,
          repo,
          number,
          direction: opts.direction || 'newest',
          cursor: opts.cursor || null,
          pageSize: opts.pageSize,
        },
        { signal: opts.signal || null }
      );
      if (!res?.ok) {
        if (res?.aborted) throw makeAbortError();
        const err = new Error(res?.error || 'Failed to fetch review threads page');
        err.status = res?.status;
        throw err;
      }
      return res.page;
    },
    /**
     * Bulk-fetch review threads by GraphQL PRRT_… ids (chunks of 100).
     * @param {string[]} threadNodeIds
     * @param {{ signal?: AbortSignal }} [opts]
     */
    async fetchReviewThreadsByIds(threadNodeIds, opts = {}) {
      const res = await send(
        {
          type: 'PR_TREE_FETCH_REVIEW_THREADS_BY_IDS',
          threadNodeIds: Array.isArray(threadNodeIds) ? threadNodeIds : [],
        },
        { signal: opts.signal || null }
      );
      if (!res?.ok) {
        if (res?.aborted) throw makeAbortError();
        const err = new Error(res?.error || 'Failed to fetch review threads by ids');
        err.status = res?.status;
        throw err;
      }
      return res.page;
    },
    collectUnresolvedThreadNodeIds(detail) {
      return collectUnresolvedThreadNodeIdsLocal(detail);
    },
    /**
     * Pure merge of a dual-window review-threads page into detail (no network).
     * @param {object} detail
     * @param {object} page
     * @param {string} [direction]
     */
    mergeReviewThreadsPageIntoDetail(detail, page, direction) {
      return mergeReviewThreadsPageIntoDetailLocal(detail, page, direction);
    },
    /**
     * Lazy page of issue or review comments (offset page or since= window).
     * @param {{ kind?: 'issue'|'review', page?: number, perPage?: number, since?: string }} [opts]
     */
    async fetchPrCommentsPage(owner, repo, number, opts = {}) {
      const res = await send(
        {
          type: 'PR_TREE_FETCH_COMMENTS_PAGE',
          owner,
          repo,
          number,
          kind: opts.kind === 'review' ? 'review' : 'issue',
          page: opts.page,
          perPage: opts.perPage,
          since: opts.since || null,
        },
        { signal: opts.signal || null }
      );
      if (!res?.ok) {
        if (res?.aborted) throw makeAbortError();
        const err = new Error(res?.error || 'Failed to fetch comments page');
        err.status = res?.status;
        throw err;
      }
      return res.page;
    },
    async fetchCompareFiles(owner, repo, base, head, options = {}) {
      const res = await send(
        {
          type: 'PR_TREE_FETCH_COMPARE_FILES',
          owner,
          repo,
          base,
          head,
          gitattributesText: options.gitattributesText || '',
        },
        { signal: options.signal || null }
      );
      if (!res?.ok) {
        if (res?.aborted) throw makeAbortError();
        const err = new Error(res?.error || 'Failed to fetch compare files');
        err.status = res?.status;
        throw err;
      }
      return res.result;
    },
    /** Abort SW-tracked GitHub fetches (sheet closed / superseded open). */
    cancelFetches,

    async uploadRepoFile(owner, repo, { path, contentBase64, message, branch }) {
      const res = await send({
        type: 'PR_TREE_UPLOAD_REPO_FILE',
        owner,
        repo,
        path,
        contentBase64,
        message,
        branch,
      });
      if (!res?.ok) {
        const err = new Error(res?.error || 'Failed to upload file');
        err.status = res?.status;
        throw err;
      }
      return res.result;
    },
    async postIssueComment(owner, repo, number, body) {
      const res = await send({
        type: 'PR_TREE_POST_ISSUE_COMMENT',
        owner,
        repo,
        number,
        body,
      });
      if (!res?.ok) {
        const err = new Error(res?.error || 'Failed to post comment');
        err.status = res?.status;
        throw err;
      }
      return res.result;
    },
    async submitPullReview(owner, repo, number, { event, body, commitId, comments }) {
      const res = await send({
        type: 'PR_TREE_SUBMIT_REVIEW',
        owner,
        repo,
        number,
        event,
        body,
        commitId,
        comments,
      });
      if (!res?.ok) {
        const err = new Error(res?.error || 'Failed to submit review');
        err.status = res?.status;
        throw err;
      }
      return res.result;
    },
    async submitPendingPullReview(owner, repo, number, reviewId, { event, body } = {}) {
      const res = await send({
        type: 'PR_TREE_SUBMIT_PENDING_REVIEW',
        owner,
