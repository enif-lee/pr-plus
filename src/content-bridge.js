/**
 * Content-script bridge: talks to the service worker for token-backed work.
 * The raw PAT never enters the content-script context.
 */

(function initPrTreeContentBridge() {
  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function isTransientChannelError(msg) {
    return /message channel closed|Receiving end does not exist|asynchronous response|Extension context invalidated/i.test(
      String(msg || '')
    );
  }

  /**
   * Prefer Promise-based chrome.runtime.sendMessage (MV3). Retry once when the
   * service worker was asleep or the port closed mid-flight.
   */
  async function send(message, { retries = 1 } = {}) {
    if (!globalThis.chrome?.runtime?.sendMessage) {
      throw new Error('chrome.runtime unavailable');
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
        if (attempt < retries && isTransientChannelError(msg)) {
          // Wake SW and retry (common after idle / extension reload)
          await sleep(120 + attempt * 180);
          continue;
        }
        if (/Receiving end does not exist|Extension context invalidated/i.test(msg)) {
          throw new Error(
            'Background worker offline. Open chrome://extensions, click Reload on pr+, then refresh this page.'
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
    async fetchPrDetail(owner, repo, number) {
      const res = await send({
        type: 'PR_TREE_FETCH_PR_DETAIL',
        owner,
        repo,
        number,
      });
      if (!res?.ok) {
        const err = new Error(res?.error || 'Failed to fetch PR detail');
        err.status = res?.status;
        throw err;
      }
      return res.detail;
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
      });
      if (!res?.ok) {
        const err = new Error(res?.error || 'Failed to post review comment');
        err.status = res?.status;
        throw err;
      }
      return res.result;
    },
    async replyToReviewComment(owner, repo, number, commentId, body) {
      const res = await send({
        type: 'PR_TREE_REPLY_REVIEW_COMMENT',
        owner,
        repo,
        number,
        commentId,
        body,
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
    async setIssueSubscription(owner, repo, number, { subscribed = true, ignored = false } = {}) {
      const res = await send({
        type: 'PR_TREE_SET_SUBSCRIPTION',
        owner,
        repo,
        number,
        subscribed,
        ignored,
      });
      if (!res?.ok) {
        const err = new Error(res?.error || 'Failed to update subscription');
        err.status = res?.status;
        throw err;
      }
      return res.result;
    },
    async deleteIssueSubscription(owner, repo, number) {
      const res = await send({
        type: 'PR_TREE_DELETE_SUBSCRIPTION',
        owner,
        repo,
        number,
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

  const PRTreeStorage = {
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
  };

  globalThis.PRTreeFetch = PRTreeFetch;
  globalThis.PRTreeStorage = PRTreeStorage;
})();
