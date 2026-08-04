/** PRTreeFetch part B */
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

export const prTreeFetchPartB = {
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
  /**
   * List repo labels (name/color/description) for the set-labels picker.
   * @param {string} owner
   * @param {string} repo
   * @param {{ maxPages?: number, signal?: AbortSignal }} [opts]
   */
  async fetchRepoLabels(owner, repo, opts: any = {}) {
    const res = await send(
      {
        type: 'PR_TREE_FETCH_REPO_LABELS',
        owner,
        repo,
        maxPages: opts.maxPages,
      },
      { signal: opts.signal || null }
    );
    if (!res?.ok) {
      if (res?.aborted) throw makeAbortError();
      const err = new Error(res?.error || 'Failed to fetch repo labels');
      err.status = res?.status;
      throw err;
    }
    return Array.isArray(res.labels) ? res.labels : [];
  },
  async createRepoLabel(owner, repo, { name, color, description } = {} as any as any) {
    const res = await send({
      type: 'PR_TREE_CREATE_REPO_LABEL',
      owner,
      repo,
      name,
      color,
      description,
    });
    if (!res?.ok) {
      const err = new Error(res?.error || 'Failed to create label');
      err.status = res?.status;
      throw err;
    }
    return res.result;
  },
  async fetchRepoMilestones(owner, repo, opts: any = {}) {
    const res = await send(
      {
        type: 'PR_TREE_FETCH_REPO_MILESTONES',
        owner,
        repo,
        maxPages: opts.maxPages,
        state: opts.state || 'all',
      },
      { signal: opts.signal || null }
    );
    if (!res?.ok) {
      if (res?.aborted) throw makeAbortError();
      const err = new Error(res?.error || 'Failed to fetch milestones');
      err.status = res?.status;
      throw err;
    }
    return Array.isArray(res.milestones) ? res.milestones : [];
  },
  async createRepoMilestone(owner, repo, { title, description, state } = {} as any as any) {
    const res = await send({
      type: 'PR_TREE_CREATE_REPO_MILESTONE',
      owner,
      repo,
      title,
      description,
      state,
    });
    if (!res?.ok) {
      const err = new Error(res?.error || 'Failed to create milestone');
      err.status = res?.status;
      throw err;
    }
    return res.result;
  },
  async fetchRepoTags(owner, repo, opts: any = {}) {
    const res = await send(
      {
        type: 'PR_TREE_FETCH_REPO_TAGS',
        owner,
        repo,
        maxPages: opts.maxPages,
      },
      { signal: opts.signal || null }
    );
    if (!res?.ok) {
      if (res?.aborted) throw makeAbortError();
      const err = new Error(res?.error || 'Failed to fetch tags');
      err.status = res?.status;
      throw err;
    }
    return Array.isArray(res.tags) ? res.tags : [];
  },
  async fetchTagsForCommits(owner, repo, shas, opts: any = {}) {
    const want = new Set(
      (Array.isArray(shas) ? shas : [])
        .map((s) => String(s || '').trim().toLowerCase())
        .filter(Boolean)
    );
    const res = await send(
      {
        type: 'PR_TREE_FETCH_TAGS_FOR_COMMITS',
        owner,
        repo,
        shas: Array.isArray(shas) ? shas : [],
        maxPages: opts.maxPages,
      },
      { signal: opts.signal || null }
    );
    if (res?.ok) {
      return Array.isArray(res.tags) ? res.tags : [];
    }
    if (res?.aborted) throw makeAbortError();
    // Stale SW after upgrade may not know FETCH_TAGS_FOR_COMMITS yet —
    // fall back to listing tags + client filter when possible.
    if (
      res?.error &&
      /unknown type:\s*PR_TREE_FETCH_TAGS_FOR_COMMITS/i.test(String(res.error))
    ) {
      try {
        const all = await this.fetchRepoTags(owner, repo, opts);
        if (!want.size) return Array.isArray(all) ? all : [];
        return (Array.isArray(all) ? all : []).filter((t) =>
          want.has(String(t?.sha || '').toLowerCase())
        );
      } catch {
        /* fall through */
      }
    }
    const err = new Error(res?.error || 'Failed to fetch tags for commits');
    err.status = res?.status;
    throw err;
  },
  async fetchAllPrCommits(owner, repo, number, opts: any = {}) {
    const res = await send(
      {
        type: 'PR_TREE_FETCH_ALL_PR_COMMITS',
        owner,
        repo,
        number,
      },
      { signal: opts.signal || null }
    );
    if (!res?.ok) {
      if (res?.aborted) throw makeAbortError();
      const err = new Error(res?.error || 'Failed to fetch all commits');
      err.status = res?.status;
      throw err;
    }
    return Array.isArray(res.commits) ? res.commits : [];
  },
  /** First page of PR commits — independent of fetchPrDetail. */
  async fetchPrCommits(owner, repo, number, opts: any = {}) {
    const res = await send(
      {
        type: 'PR_TREE_FETCH_PR_COMMITS',
        owner,
        repo,
        number,
      },
      { signal: opts.signal || null }
    );
    if (!res?.ok) {
      if (res?.aborted) throw makeAbortError();
      const err = new Error(res?.error || 'Failed to fetch commits');
      err.status = res?.status;
      throw err;
    }
    return Array.isArray(res.commits) ? res.commits : [];
  },
  /** First page of PR files + optional gitattributes annotate. */
  async fetchPrFiles(owner, repo, number, opts: any = {}) {
    const res = await send(
      {
        type: 'PR_TREE_FETCH_PR_FILES',
        owner,
        repo,
        number,
        headSha: opts.headSha || null,
        gitattributesText: opts.gitattributesText || '',
      },
      { signal: opts.signal || null }
    );
    if (!res?.ok) {
      if (res?.aborted) throw makeAbortError();
      const err = new Error(res?.error || 'Failed to fetch files');
      err.status = res?.status;
      throw err;
    }
    return {
      files: Array.isArray(res.files) ? res.files : [],
      gitattributesText:
        typeof res.gitattributesText === 'string' ? res.gitattributesText : '',
    };
  },
  /** Newest-first issue comments window. */
  async fetchPrIssueComments(owner, repo, number, opts: any = {}) {
    const res = await send(
      {
        type: 'PR_TREE_FETCH_PR_ISSUE_COMMENTS',
        owner,
        repo,
        number,
      },
      { signal: opts.signal || null }
    );
    if (!res?.ok) {
      if (res?.aborted) throw makeAbortError();
      const err = new Error(res?.error || 'Failed to fetch issue comments');
      err.status = res?.status;
      throw err;
    }
    return (
      res.page || {
        items: [],
        meta: {
          page: 1,
          perPage: 50,
          hasMore: false,
          nextPage: null,
          loadedCount: 0,
        },
      }
    );
  },
  /**
   * Lightweight head SHA probe for auto-refresh staleness checks.
   * @returns {Promise<{ headSha: string, baseSha: string, updatedAt: string|null, draft: boolean, state: string, number: number }>}
   */
  async fetchPrHeadProbe(owner, repo, number, opts: any = {}) {
    const res = await send(
      {
        type: 'PR_TREE_FETCH_PR_HEAD_PROBE',
        owner,
        repo,
        number,
      },
      { signal: opts.signal || null }
    );
    if (!res?.ok) {
      if (res?.aborted) throw makeAbortError();
      const err = new Error(res?.error || 'Failed to probe PR head');
      err.status = res?.status;
      throw err;
    }
    return (
      res.probe || {
        headSha: '',
        baseSha: '',
        updatedAt: null,
        draft: false,
        state: '',
        number: Number(number) || 0,
      }
    );
  },
  /**
   * PR conversation system events (title rename, draft/ready, labels, …).
   * REST fallback; prefer fetchPrTimelineItemsPage for GraphQL-first path.
   * @returns {Promise<Array>}
   */
  async fetchPrTimelineEvents(owner, repo, number, opts: any = {}) {
    const res = await send(
      {
        type: 'PR_TREE_FETCH_PR_TIMELINE_EVENTS',
        owner,
        repo,
        number,
      },
      { signal: opts.signal || null }
    );
    if (!res?.ok) {
      if (res?.aborted) throw makeAbortError();
      // Soft-fail: conversation still works without system events
      return [];
    }
    return Array.isArray(res.events) ? res.events : [];
  },
  /**
   * GraphQL-first conversation timeline page (timelineItems, unfiltered).
   * Returns { comments, timelineEvents, reviews, pageInfo, hasMore, ... }.
   */
  async fetchPrTimelineItemsPage(owner, repo, number, opts: any = {}) {
    // Prefer TIMELINE_EVENTS + graphql mode (long-stable SW route). Also try
    // dedicated TIMELINE_ITEMS type. Never treat REST {events} as a GraphQL page.
    const payload = {
      owner,
      repo,
      number,
      direction: opts.direction || 'newest',
      cursor: opts.cursor || null,
      since: opts.since || null,
      pageSize: opts.pageSize || 100,
      mode: 'graphql',
      source: 'graphql',
      graphql: true,
    };
    const attempts = [
      { type: 'PR_TREE_FETCH_PR_TIMELINE_EVENTS', ...payload },
      { type: 'PR_TREE_FETCH_PR_TIMELINE_ITEMS', ...payload },
    ];
    let lastRes = null;
    for (const msg of attempts) {
      const res = await send(msg, { signal: opts.signal || null });
      lastRes = res;
      if (!res?.ok) {
        if (res?.aborted) throw makeAbortError();
        // try next type
        continue;
      }
      const page = res.page || res.timelinePage || null;
      if (page && typeof page === 'object' && !page.error) {
        return page;
      }
      // Soft-fail GraphQL page with error still usable if it has nodes
      if (
        page &&
        typeof page === 'object' &&
        ((Array.isArray(page.timelineEvents) && page.timelineEvents.length) ||
          (Array.isArray(page.comments) && page.comments.length) ||
          page.hasMore === true)
      ) {
        return page;
      }
    }
    try {
      sessionStorage.setItem(
        'prp:diag:timeline-bridge-res',
        JSON.stringify({
          ok: lastRes?.ok,
          keys: lastRes ? Object.keys(lastRes) : [],
          err: lastRes?.error || null,
          eventsLen: Array.isArray(lastRes?.events)
            ? lastRes.events.length
            : null,
          at: Date.now(),
        })
      );
    } catch {
      /* ignore */
    }
    if (lastRes && !lastRes.ok) {
      if (lastRes.aborted) throw makeAbortError();
      const err = new Error(lastRes.error || 'Failed to fetch timeline items');
      // @ts-expect-error status on Error
      err.status = lastRes.status;
      throw err;
    }
    return {
      comments: [],
      timelineEvents: [],
      reviews: [],
      pageInfo: {
        hasNextPage: false,
        hasPreviousPage: false,
        startCursor: null,
        endCursor: null,
      },
      hasMore: false,
      totalCount: null,
      source: 'graphql',
      error: 'missing-graphql-page',
    };
  },
  async fetchPrTimelineShell(owner, repo, number, opts: any = {}) {
    return this.fetchPrTimelineItemsPage(owner, repo, number, opts);
  },
  /** Submitted PR reviews list. */
  async fetchPrReviews(owner, repo, number, opts: any = {}) {
    const res = await send(
      {
        type: 'PR_TREE_FETCH_PR_REVIEWS',
        owner,
        repo,
        number,
      },
      { signal: opts.signal || null }
    );
    if (!res?.ok) {
      if (res?.aborted) throw makeAbortError();
      const err = new Error(res?.error || 'Failed to fetch reviews');
      err.status = res?.status;
      throw err;
    }
    return Array.isArray(res.reviews) ? res.reviews : [];
  },
  /** Commit status + check runs for head SHA. */
  async fetchPrChecks(owner, repo, headSha, opts: any = {}) {
    const res = await send(
      {
        type: 'PR_TREE_FETCH_PR_CHECKS',
        owner,
        repo,
        headSha,
      },
      { signal: opts.signal || null }
    );
    if (!res?.ok) {
      if (res?.aborted) throw makeAbortError();
      const err = new Error(res?.error || 'Failed to fetch checks');
      err.status = res?.status;
      throw err;
    }
    return res.checks || { state: 'unknown', totalCount: 0, statuses: [], checkRuns: [] };
  },
  /** Development + Projects for conversation aside. */
  async fetchPrDevelopment(owner, repo, number, opts: any = {}) {
    const res = await send(
      {
        type: 'PR_TREE_FETCH_PR_DEVELOPMENT',
        owner,
        repo,
        number,
        body: opts.body || '',
      },
      { signal: opts.signal || null }
    );
    if (!res?.ok) {
      if (res?.aborted) throw makeAbortError();
      const err = new Error(res?.error || 'Failed to fetch development meta');
      err.status = res?.status;
      throw err;
    }
    return (
      res.development || {
        linkedIssues: [],
        developmentIssues: [],
        projects: [],
      }
    );
  },
  async fetchAllPrFiles(owner, repo, number, options: any = {}) {
    const res = await send(
      {
        type: 'PR_TREE_FETCH_ALL_PR_FILES',
        owner,
        repo,
        number,
        gitattributesText: options.gitattributesText || '',
      },
      { signal: options.signal || null }
    );
    if (!res?.ok) {
      if (res?.aborted) throw makeAbortError();
      const err = new Error(res?.error || 'Failed to fetch all files');
      err.status = res?.status;
      throw err;
    }
    return Array.isArray(res.files) ? res.files : [];
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
  async getRepoFileText(owner, repo, { path, ref, headRef, headSha } = {} as any as any) {
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
  async mergePullRequest(owner, repo, number, opts: any = {}) {
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
  async deleteHeadBranch(owner, repo, branch) {
    const res = await send({
      type: 'PR_TREE_DELETE_HEAD_BRANCH',
      owner,
      repo,
      branch,
    });
    if (!res?.ok) {
      const err = new Error(res?.error || 'Failed to delete branch');
      err.status = res?.status;
      throw err;
    }
    return res.result;
  },
  async fetchViewerViewedPaths(owner, repo, number, opts: any = {}) {
    const res = await send({
      type: 'PR_TREE_FETCH_VIEWER_VIEWED_PATHS',
      owner,
      repo,
      number,
      maxPages: opts.maxPages,
    });
    if (!res?.ok) {
      const err = new Error(res?.error || 'Failed to fetch viewed files');
      err.status = res?.status;
      throw err;
    }
    return res.result || { pullRequestId: null, viewedPaths: [] };
  },
  async markFileAsViewed(pullRequestId, path) {
    const res = await send({
      type: 'PR_TREE_MARK_FILE_VIEWED',
      pullRequestId,
      path,
    });
    if (!res?.ok) {
      const err = new Error(res?.error || 'Failed to mark file viewed');
      err.status = res?.status;
      throw err;
    }
    return res.result;
  },
  async unmarkFileAsViewed(pullRequestId, path) {
    const res = await send({
      type: 'PR_TREE_UNMARK_FILE_VIEWED',
      pullRequestId,
      path,
    });
    if (!res?.ok) {
      const err = new Error(res?.error || 'Failed to unmark file viewed');
      err.status = res?.status;
      throw err;
    }
    return res.result;
  },
  async setIssueSubscription(
    owner,
    repo,
    number,
    { subscribed = true, ignored = false, nodeId = null } = {} as any
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

