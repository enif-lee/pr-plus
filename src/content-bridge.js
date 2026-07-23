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
  async function send(message, { retries = 4 } = {}) {
    if (!globalThis.chrome?.runtime?.sendMessage) {
      throw new Error('chrome.runtime unavailable');
    }
    // After chrome://extensions Reload, old content scripts lose chrome.runtime.id
    if (!isExtensionContextAlive()) {
      throw new Error(RELOAD_REFRESH_MSG);
    }

    let lastErr;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        // No callback → Chrome returns a Promise and keeps the channel open
        // for the full SW handler lifetime.
        const response = await chrome.runtime.sendMessage(message);
        return response;
      } catch (e) {
        const msg = e?.message || String(e);
        lastErr = new Error(msg);
        if (isContextInvalidated(msg) || !isExtensionContextAlive()) {
          throw new Error(RELOAD_REFRESH_MSG);
        }
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
        if (/Receiving end does not exist|Could not establish connection/i.test(msg)) {
          throw new Error(
            'Background worker offline. Open chrome://extensions → pr+ → Reload, then refresh this page (⌘R).'
          );
        }
        throw lastErr;
      }
    }
    throw lastErr || new Error('Failed to message background worker');
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
      const res = await send({
        type: 'PR_TREE_FETCH_OPEN_PULLS',
        owner,
        repo,
        pagePrNumbers: options.pagePrNumbers || [],
      });
      if (!res?.ok) {
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
      const res = await send({
        type: 'PR_TREE_FETCH_PR_DETAIL',
        owner,
        repo,
        number,
        skipReviewThreads: Boolean(opts.skipReviewThreads),
        threadsMaxPages: opts.threadsMaxPages,
      });
      const roundTrip = Math.round(
        (typeof performance !== 'undefined' && performance.now
          ? performance.now()
          : Date.now()) - t0
      );
      if (!res?.ok) {
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
      const res = await send({
        type: 'PR_TREE_FETCH_REVIEW_THREADS_PAGE',
        owner,
        repo,
        number,
        direction: opts.direction || 'newest',
        cursor: opts.cursor || null,
        pageSize: opts.pageSize,
      });
      if (!res?.ok) {
        const err = new Error(res?.error || 'Failed to fetch review threads page');
        err.status = res?.status;
        throw err;
      }
      return res.page;
    },
    /**
     * Bulk-fetch review threads by GraphQL PRRT_… ids (chunks of 100).
     * @param {string[]} threadNodeIds
     */
    async fetchReviewThreadsByIds(threadNodeIds) {
      const res = await send({
        type: 'PR_TREE_FETCH_REVIEW_THREADS_BY_IDS',
        threadNodeIds: Array.isArray(threadNodeIds) ? threadNodeIds : [],
      });
      if (!res?.ok) {
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
      const res = await send({
        type: 'PR_TREE_FETCH_COMMENTS_PAGE',
        owner,
        repo,
        number,
        kind: opts.kind === 'review' ? 'review' : 'issue',
        page: opts.page,
        perPage: opts.perPage,
        since: opts.since || null,
      });
      if (!res?.ok) {
        const err = new Error(res?.error || 'Failed to fetch comments page');
        err.status = res?.status;
        throw err;
      }
      return res.page;
    },
    async fetchCompareFiles(owner, repo, base, head, options = {}) {
      const res = await send({
        type: 'PR_TREE_FETCH_COMPARE_FILES',
        owner,
        repo,
        base,
        head,
        gitattributesText: options.gitattributesText || '',
      });
      if (!res?.ok) {
        const err = new Error(res?.error || 'Failed to fetch compare files');
        err.status = res?.status;
        throw err;
      }
      return res.result;
    },

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
        repo,
        number,
        reviewId,
        event,
        body,
      });
      if (!res?.ok) {
        const err = new Error(res?.error || 'Failed to submit pending review');
        err.status = res?.status;
        throw err;
      }
      return res.result;
    },
    async deletePendingPullReview(owner, repo, number, reviewId) {
      const res = await send({
        type: 'PR_TREE_DELETE_PENDING_REVIEW',
        owner,
        repo,
        number,
        reviewId,
      });
      if (!res?.ok) {
        const err = new Error(res?.error || 'Failed to discard pending review');
        err.status = res?.status;
        throw err;
      }
      return res.result;
    },
    async postReviewComment(owner, repo, number, payload) {
      const res = await send({
        type: 'PR_TREE_POST_REVIEW_COMMENT',
        owner,
        repo,
        number,
        body: payload.body,
        path: payload.path,
        line: payload.line,
        side: payload.side,
        commitId: payload.commitId,
        startLine: payload.startLine ?? payload.start_line,
        startSide: payload.startSide ?? payload.start_side,
        asPending: Boolean(payload.asPending),
      });
      if (!res?.ok) {
        const err = new Error(res?.error || 'Failed to post review comment');
        err.status = res?.status;
        throw err;
      }
      return res.result;
    },
    async replyToReviewComment(owner, repo, number, commentId, body, opts = {}) {
      const res = await send({
        type: 'PR_TREE_REPLY_REVIEW_COMMENT',
        owner,
        repo,
        number,
        commentId,
        body,
        mode: opts?.mode || 'comment',
        threadNodeId: opts?.threadNodeId || null,
        parentNodeId: opts?.parentNodeId || null,
        path: opts?.path || null,
        line: opts?.line ?? null,
        side: opts?.side || null,
        commitId: opts?.commitId || null,
      });
      if (!res?.ok) {
        const err = new Error(res?.error || 'Failed to reply to review comment');
        err.status = res?.status;
        throw err;
      }
      return res.result;
    },
    async resolveReviewThread(threadNodeId, resolved = true) {
      const res = await send({
        type: 'PR_TREE_RESOLVE_REVIEW_THREAD',
        threadNodeId,
        resolved,
      });
      if (!res?.ok) {
        const err = new Error(res?.error || 'Failed to resolve review thread');
        err.status = res?.status;
        throw err;
      }
      return res.result;
    },
    async updatePullState(owner, repo, number, state) {
      const res = await send({
        type: 'PR_TREE_UPDATE_PULL_STATE',
        owner,
        repo,
        number,
        state,
      });
      if (!res?.ok) {
        const err = new Error(res?.error || 'Failed to update pull request state');
        err.status = res?.status;
        throw err;
      }
      return res.result;
    },
    async closePullRequest(owner, repo, number) {
      return PRTreeFetch.updatePullState(owner, repo, number, 'closed');
    },
    async reopenPullRequest(owner, repo, number) {
      return PRTreeFetch.updatePullState(owner, repo, number, 'open');
    },
    async deleteReviewComment(owner, repo, commentId) {
      const res = await send({
        type: 'PR_TREE_DELETE_REVIEW_COMMENT',
        owner,
        repo,
        commentId,
      });
      if (!res?.ok) {
        const err = new Error(res?.error || 'Failed to delete review comment');
        err.status = res?.status;
        throw err;
      }
      return res.result;
    },
    async deleteIssueComment(owner, repo, commentId) {
      const res = await send({
        type: 'PR_TREE_DELETE_ISSUE_COMMENT',
        owner,
        repo,
        commentId,
      });
      if (!res?.ok) {
        const err = new Error(res?.error || 'Failed to delete comment');
        err.status = res?.status;
        throw err;
      }
      return res.result;
    },
    async updatePullRequest(owner, repo, number, fields) {
      const res = await send({
        type: 'PR_TREE_UPDATE_PULL',
        owner,
        repo,
        number,
        fields,
      });
      if (!res?.ok) {
        const err = new Error(res?.error || 'Failed to update pull request');
        err.status = res?.status;
        throw err;
      }
      return res.result;
    },
    async editIssueComment(owner, repo, commentId, body) {
      const res = await send({
        type: 'PR_TREE_EDIT_ISSUE_COMMENT',
        owner,
        repo,
        commentId,
        body,
      });
      if (!res?.ok) {
        const err = new Error(res?.error || 'Failed to edit comment');
        err.status = res?.status;
        throw err;
      }
      return res.result;
    },
    async editReviewComment(owner, repo, commentId, body) {
      const res = await send({
        type: 'PR_TREE_EDIT_REVIEW_COMMENT',
        owner,
        repo,
        commentId,
        body,
      });
      if (!res?.ok) {
        const err = new Error(res?.error || 'Failed to edit review comment');
        err.status = res?.status;
        throw err;
      }
      return res.result;
    },
    async requestReviewers(owner, repo, number, reviewers, teamReviewers = []) {
      const res = await send({
        type: 'PR_TREE_REQUEST_REVIEWERS',
        owner,
        repo,
        number,
        reviewers,
        teamReviewers,
      });
      if (!res?.ok) {
        const err = new Error(res?.error || 'Failed to request reviewers');
        err.status = res?.status;
        throw err;
      }
      return res.result;
    },
    async removeReviewers(owner, repo, number, reviewers, teamReviewers = []) {
      const res = await send({
        type: 'PR_TREE_REMOVE_REVIEWERS',
        owner,
        repo,
        number,
        reviewers,
        teamReviewers,
      });
      if (!res?.ok) {
        const err = new Error(res?.error || 'Failed to remove reviewers');
        err.status = res?.status;
        throw err;
      }
      return res.result;
    },
    async addAssignees(owner, repo, number, assignees) {
      const res = await send({
        type: 'PR_TREE_ADD_ASSIGNEES',
        owner,
        repo,
        number,
        assignees,
      });
      if (!res?.ok) {
        const err = new Error(res?.error || 'Failed to add assignees');
        err.status = res?.status;
        throw err;
      }
      return res.result;
    },
    async removeAssignees(owner, repo, number, assignees) {
      const res = await send({
        type: 'PR_TREE_REMOVE_ASSIGNEES',
        owner,
        repo,
        number,
        assignees,
      });
      if (!res?.ok) {
        const err = new Error(res?.error || 'Failed to remove assignees');
        err.status = res?.status;
        throw err;
      }
      return res.result;
    },
    async setIssueLabels(owner, repo, number, labels) {
      const res = await send({
        type: 'PR_TREE_SET_LABELS',
        owner,
        repo,
        number,
        labels,
      });
      if (!res?.ok) {
        const err = new Error(res?.error || 'Failed to set labels');
        err.status = res?.status;
        throw err;
      }
      return res.result;
    },
    async applyReviewSuggestion(owner, repo, payload) {
      const res = await send({
        type: 'PR_TREE_APPLY_SUGGESTION',
        owner,
        repo,
        ...payload,
      });
      if (!res?.ok) {
        const err = new Error(res?.error || 'Failed to apply suggestion');
        err.status = res?.status;
        throw err;
      }
      return res.result;
    },
    async getRepoFileText(owner, repo, { path, ref, headRef, headSha } = {}) {
      const res = await send({
        type: 'PR_TREE_GET_REPO_FILE_TEXT',
        owner,
        repo,
        path,
        ref: ref || headRef || headSha,
      });
      if (!res?.ok) {
        const err = new Error(res?.error || 'Failed to fetch file text');
        err.status = res?.status;
        throw err;
      }
      return res.result;
    },
    async mergePullRequest(owner, repo, number, opts = {}) {
      const res = await send({
        type: 'PR_TREE_MERGE_PULL',
        owner,
        repo,
        number,
        mergeMethod: opts.mergeMethod || 'merge',
        commitTitle: opts.commitTitle,
        commitMessage: opts.commitMessage,
      });
      if (!res?.ok) {
        const err = new Error(res?.error || 'Failed to merge pull request');
        err.status = res?.status;
        throw err;
      }
      return res.result;
    },
    async updatePullBranch(owner, repo, number, expectedHeadSha) {
      const res = await send({
        type: 'PR_TREE_UPDATE_BRANCH',
        owner,
        repo,
        number,
        expectedHeadSha,
      });
      if (!res?.ok) {
        const err = new Error(res?.error || 'Failed to update branch');
        err.status = res?.status;
        throw err;
      }
      return res.result;
    },
    async setIssueSubscription(
      owner,
      repo,
      number,
      { subscribed = true, ignored = false, nodeId = null } = {}
    ) {
      const res = await send({
        type: 'PR_TREE_SET_SUBSCRIPTION',
        owner,
        repo,
        number,
        subscribed,
        ignored,
        nodeId,
      });
      if (!res?.ok) {
        const err = new Error(res?.error || 'Failed to update subscription');
        err.status = res?.status;
        throw err;
      }
      return res.result;
    },
    async deleteIssueSubscription(owner, repo, number, nodeId = null) {
      const res = await send({
        type: 'PR_TREE_DELETE_SUBSCRIPTION',
        owner,
        repo,
        number,
        nodeId,
      });
      if (!res?.ok) {
        const err = new Error(res?.error || 'Failed to unsubscribe');
        err.status = res?.status;
        throw err;
      }
      return res.result;
    },
    async setIssueMilestone(owner, repo, number, milestone) {
      const res = await send({
        type: 'PR_TREE_SET_MILESTONE',
        owner,
        repo,
        number,
        milestone,
      });
      if (!res?.ok) {
        const err = new Error(res?.error || 'Failed to set milestone');
        err.status = res?.status;
        throw err;
      }
      return res.result;
    },
    async setPullRequestDraftStage(owner, repo, number, stage, nodeId) {
      const res = await send({
        type: 'PR_TREE_SET_DRAFT_STAGE',
        owner,
        repo,
        number,
        stage,
        nodeId,
      });
      if (!res?.ok) {
        const err = new Error(res?.error || 'Failed to change draft stage');
        err.status = res?.status;
        throw err;
      }
      return res.result;
    },
  };

  const DEFAULT_PREFS = {
    fastReview: true,
    reverseComments: true,
  };

  function normalizePrefsLocal(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    return {
      fastReview:
        typeof src.fastReview === 'boolean'
          ? src.fastReview
          : DEFAULT_PREFS.fastReview,
      reverseComments:
        typeof src.reverseComments === 'boolean'
          ? src.reverseComments
          : DEFAULT_PREFS.reverseComments,
    };
  }

  const PRTreeStorage = {
    DEFAULT_PREFS,
    normalizePrefs: normalizePrefsLocal,
    /** Intentionally unavailable in content scripts. */
    getGithubToken() {
      return Promise.reject(
        new Error('PAT is not accessible from content scripts')
      );
    },
    async getGithubTokenStatus() {
      const res = await send({ type: 'PR_TREE_TOKEN_STATUS' });
      if (!res?.ok) {
        return { configured: false, mask: '' };
      }
      return { configured: Boolean(res.configured), mask: res.mask || '' };
    },
    setGithubToken() {
      return Promise.reject(
        new Error('Set PAT from the extension popup only')
      );
    },
    /**
     * Signal-only watch: callback receives null (never the secret).
     * Re-fetch via background when this fires.
     */
    watchGithubToken(onChange) {
      if (!globalThis.chrome?.runtime?.onMessage) return () => {};
      const listener = (message) => {
        if (message?.type === 'PR_TREE_TOKEN_CHANGED') {
          onChange(null);
        }
        // Never claim async response — broadcasts have no reply
        return false;
      };
      chrome.runtime.onMessage.addListener(listener);
      return () => chrome.runtime.onMessage.removeListener(listener);
    },
    async getExtensionPrefs() {
      try {
        const res = await send({ type: 'PR_TREE_PREFS_GET' });
        if (res?.ok && res.prefs) return normalizePrefsLocal(res.prefs);
      } catch {
        /* fall through */
      }
      return { ...DEFAULT_PREFS };
    },
    async setExtensionPrefs(patch) {
      const res = await send({
        type: 'PR_TREE_PREFS_SET',
        prefs: patch || {},
      });
      if (!res?.ok) {
        throw new Error(res?.error || 'Failed to save prefs');
      }
      return normalizePrefsLocal(res.prefs);
    },
    watchExtensionPrefs(onChange) {
      if (!globalThis.chrome?.runtime?.onMessage || typeof onChange !== 'function') {
        return () => {};
      }
      const listener = (message) => {
        if (message?.type === 'PR_TREE_PREFS_CHANGED') {
          onChange(normalizePrefsLocal(message.prefs));
        }
        return false;
      };
      chrome.runtime.onMessage.addListener(listener);
      return () => chrome.runtime.onMessage.removeListener(listener);
    },
  };

  globalThis.PRTreeFetch = PRTreeFetch;
  globalThis.PRTreeStorage = PRTreeStorage;
  globalThis.PRTreeBridge = {
    isExtensionContextAlive,
    isContextInvalidated,
    isTransientChannelError,
    RELOAD_REFRESH_MSG,
  };
})();
