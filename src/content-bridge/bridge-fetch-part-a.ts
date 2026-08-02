/** PRTreeFetch part A */
import {
  send,
  isAbortError,
  pageEndpointContext,
  whenAborted,
  cancelFetches,
  makeAbortError,
} from './bridge-channel';
import {
  findDanglingPrNumbers,
  emptyReviewThreadsMetaLocal,
  dropReviewThreadsFromDetailLocal,
  mergeReviewThreadsPageIntoDetailLocal,
  collectUnresolvedThreadNodeIdsLocal,
  isGraphqlReviewThreadNodeIdBridge,
} from './bridge-threads-local';

export const prTreeFetchPartA = {
  findDanglingPrNumbers,
  async fetchOpenPulls(owner, repo, _fetchImpl, options: any = {}) {
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
  async fetchPrDetail(owner, repo, number, opts: any = {}) {
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
  async fetchReviewThreadsPage(owner, repo, number, opts: any = {}) {
    const res = await send(
      {
        type: 'PR_TREE_FETCH_REVIEW_THREADS_PAGE',
        owner,
        repo,
        number,
        direction: opts.direction || 'newest',
        cursor: opts.cursor || null,
        pageSize: opts.pageSize,
        // GraphQL-first default (preferRest true only if caller opts in).
        preferRest: opts.preferRest === true ? true : opts.preferRest === false ? false : false,
        forceGraphql: Boolean(opts.forceGraphql),
        forceFull: Boolean(opts.forceFull),
        skipEagerComments: Boolean(opts.skipEagerComments),
        reviewCommentsCount:
          opts.reviewCommentsCount != null
            ? Number(opts.reviewCommentsCount)
            : null,
        restPage: opts.restPage != null ? Number(opts.restPage) : 1,
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
  async fetchReviewThreadsByIds(threadNodeIds, opts: any = {}) {
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
   * GraphQL primary-point cost observation log (from SW apiGraphql).
   * Also mirrors summary into sessionStorage for page-world e2e reads.
   */
  async getGraphqlCostLog() {
    try {
      let res = await send({ type: 'PR_TREE_GQL_COST_LOG_GET' });
      // Fallback: older SW without GQL_COST message — RATE_LIMIT_GET carries log
      if (!res?.ok && /unknown type/i.test(String(res?.error || ''))) {
        res = await send({ type: 'PR_TREE_RATE_LIMIT_GET' });
        if (res?.ok) {
          res = {
            ok: true,
            log: res.gqlCostLog || [],
            summary: res.gqlCostSummary || {
              totalCalls: 0,
              totalCost: 0,
              byOp: [],
            },
            gqlCostBuild: res.gqlCostBuild || null,
          };
        }
      }
      if (!res?.ok) {
        try {
          sessionStorage.setItem(
            'prp:gql-cost-err',
            String(res?.error || 'GQL_COST_LOG_GET not ok')
          );
        } catch {
          /* ignore */
        }
        return { log: [], summary: { totalCalls: 0, totalCost: 0, byOp: [] } };
      }
      const log = Array.isArray(res.log) ? res.log : [];
      const summary = res.summary || {
        totalCalls: 0,
        totalCost: 0,
        unknownCostCalls: 0,
        byOp: [],
      };
      try {
        sessionStorage.setItem('prp:gql-cost-log', JSON.stringify(log));
        sessionStorage.setItem('prp:gql-cost-summary', JSON.stringify(summary));
        sessionStorage.removeItem('prp:gql-cost-err');
      } catch {
        /* quota / private mode */
      }
      try {
        for (const id of ['prp-page-embed', 'prp-modal-host']) {
          const el = document.getElementById(id);
          if (!el) continue;
          el.setAttribute(
            'data-prp-gql-cost-summary',
            JSON.stringify({
              totalCalls: summary.totalCalls,
              totalCost: summary.totalCost,
              top: (summary.byOp || []).slice(0, 8),
            }).slice(0, 1800)
          );
        }
        document.documentElement?.setAttribute?.(
          'data-prp-gql-cost-ready',
          '1'
        );
      } catch {
        /* ignore */
      }
      return { log, summary };
    } catch (e: any) {
      try {
        sessionStorage.setItem(
          'prp:gql-cost-err',
          String(e?.message || e || 'getGraphqlCostLog failed').slice(0, 300)
        );
      } catch {
        /* ignore */
      }
      return { log: [], summary: { totalCalls: 0, totalCost: 0, byOp: [] } };
    }
  },
  async clearGraphqlCostLog() {
    try {
      const res = await send({ type: 'PR_TREE_GQL_COST_LOG_CLEAR' });
      try {
        sessionStorage.removeItem('prp:gql-cost-log');
        sessionStorage.removeItem('prp:gql-cost-summary');
        sessionStorage.removeItem('prp:gql-cost-err');
      } catch {
        /* ignore */
      }
      return Boolean(res?.ok);
    } catch {
      return false;
    }
  },
  /**
   * Lazy page of issue or review comments (offset page or since= window).
   * @param {{ kind?: 'issue'|'review', page?: number, perPage?: number, since?: string }} [opts]
   */
  async fetchPrCommentsPage(owner, repo, number, opts: any = {}) {
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
        preferNewest: Boolean(opts.preferNewest),
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
  async fetchCompareFiles(owner, repo, base, head, options: any = {}) {
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
  async submitPendingPullReview(owner, repo, number, reviewId, { event, body } = {} as any as any) {
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
      subjectType: payload.subjectType ?? payload.subject_type ?? 'line',
    });
    if (!res?.ok) {
      const err = new Error(res?.error || 'Failed to post review comment');
      err.status = res?.status;
      throw err;
    }
    return res.result;
  },
  async replyToReviewComment(owner, repo, number, commentId, body, opts: any = {}) {
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
  /**
   * Toggle a GitHub reaction on an issue or review comment.
   * @param {'issue'|'review'} kind
   * @param {{ content: string, viewerHasReacted?: boolean, nodeId?: string|null, commentId?: number|string }} opts
   */
  async toggleCommentReaction(owner, repo, kind, opts) {
    const res = await send({
      type: 'PR_TREE_TOGGLE_COMMENT_REACTION',
      owner,
      repo,
      kind,
      opts: opts || {},
    });
    if (!res?.ok) {
      const err = new Error(res?.error || 'Failed to update reaction');
      err.status = res?.status;
      throw err;
    }
    return res.result;
  },
  /**
   * Hover: load reactor logins for one Reactable (first-N at query level).
   * @returns {Promise<Array>} reaction groups with users
   */
  async fetchReactableReactors(nodeId, opts: any = {}) {
    const res = await send(
      {
        type: 'PR_TREE_FETCH_REACTABLE_REACTORS',
        nodeId,
        first: opts.first != null ? Number(opts.first) : 5,
      },
      { signal: opts.signal || null }
    );
    if (!res?.ok) {
      if (res?.aborted) throw makeAbortError();
      const err = new Error(res?.error || 'Failed to load reaction users');
      err.status = res?.status;
      throw err;
    }
    return Array.isArray(res.groups) ? res.groups : [];
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
};
