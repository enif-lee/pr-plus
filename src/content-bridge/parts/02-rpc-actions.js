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
    /**
     * List repo labels (name/color/description) for the set-labels picker.
     * @param {string} owner
     * @param {string} repo
     * @param {{ maxPages?: number, signal?: AbortSignal }} [opts]
     */
    async fetchRepoLabels(owner, repo, opts = {}) {
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
    async createRepoLabel(owner, repo, { name, color, description } = {}) {
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
    async fetchRepoMilestones(owner, repo, opts = {}) {
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
    async createRepoMilestone(owner, repo, { title, description, state } = {}) {
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
    async fetchRepoTags(owner, repo, opts = {}) {
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
    async fetchTagsForCommits(owner, repo, shas, opts = {}) {
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
    async fetchAllPrCommits(owner, repo, number, opts = {}) {
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
    async fetchPrCommits(owner, repo, number, opts = {}) {
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
    async fetchPrFiles(owner, repo, number, opts = {}) {
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
    async fetchPrIssueComments(owner, repo, number, opts = {}) {
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
    /** Submitted PR reviews list. */
    async fetchPrReviews(owner, repo, number, opts = {}) {
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
    async fetchPrChecks(owner, repo, headSha, opts = {}) {
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
    async fetchPrDevelopment(owner, repo, number, opts = {}) {
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
    async fetchAllPrFiles(owner, repo, number, options = {}) {
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
    autoOpenEmbed: true,
    singleFileMode: false,
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
      autoOpenEmbed:
        typeof src.autoOpenEmbed === 'boolean'
          ? src.autoOpenEmbed
          : DEFAULT_PREFS.autoOpenEmbed,
      singleFileMode:
        typeof src.singleFileMode === 'boolean'
          ? src.singleFileMode
          : DEFAULT_PREFS.singleFileMode,
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

