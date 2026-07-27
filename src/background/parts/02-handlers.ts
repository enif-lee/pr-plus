        endTrackedFetch(tracked.requestId);
      }
    }
    case MSG.FETCH_REVIEW_THREADS_BY_IDS: {
      const tracked = beginTrackedFetch(message.requestId);
      try {
        const token = await tokenForMessage(message);
        if (!token) {
          return {
            ok: true,
            page: { threads: [], comments: [], pageCount: 0, direction: 'refresh' },
          };
        }
        const page = await PRTreeFetch.fetchReviewThreadsByIds(message.threadNodeIds || message.ids || [], tracked.fetch, token, apiCtx);
        return { ok: true, page };
      } catch (err) {
        if (isAbortError(err)) return { ok: false, aborted: true, error: 'aborted' };
        throw err;
      } finally {
        endTrackedFetch(tracked.requestId);
      }
    }
    case MSG.FETCH_COMMENTS_PAGE: {
      const tracked = beginTrackedFetch(message.requestId);
      try {
        const token = await tokenForMessage(message);
        const page = await PRTreeFetch.fetchPrCommentsPage(
          message.owner,
          message.repo,
          message.number,
          message.kind === 'review' ? 'review' : 'issue',
          {
            page: message.page,
            perPage: message.perPage,
            since: message.since || null,
          },
          tracked.fetch,
          token,
          apiCtx
        );
        return { ok: true, page };
      } catch (err) {
        if (isAbortError(err)) return { ok: false, aborted: true, error: 'aborted' };
        throw err;
      } finally {
        endTrackedFetch(tracked.requestId);
      }
    }
    case MSG.FETCH_COMPARE_FILES: {
      const tracked = beginTrackedFetch(message.requestId);
      try {
        const token = await tokenForMessage(message);
        const result = await PRTreeFetch.fetchCompareFiles(
          message.owner,
          message.repo,
          message.base,
          message.head,
          tracked.fetch,
          token,
          { gitattributesText: message.gitattributesText || '', ctx: apiCtx }
        );
        return { ok: true, result };
      } catch (err) {
        if (isAbortError(err)) return { ok: false, aborted: true, error: 'aborted' };
        throw err;
      } finally {
        endTrackedFetch(tracked.requestId);
      }
    }
    case MSG.POST_ISSUE_COMMENT: {
      const token = await tokenForMessage(message);
      if (!token) throw new Error('GitHub PAT required to post comments');
      const result = await PRTreeFetch.postIssueComment(
        message.owner,
        message.repo,
        message.number,
        message.body,
        fetchImpl(),
        token, apiCtx);
      return { ok: true, result };
    }
    case MSG.SUBMIT_REVIEW: {
      const token = await tokenForMessage(message);
      if (!token) throw new Error('GitHub PAT required to submit reviews');
      const result = await PRTreeFetch.submitPullReview(
        message.owner,
        message.repo,
        message.number,
        {
          event: message.event,
          body: message.body || '',
          commitId: message.commitId,
          comments: Array.isArray(message.comments) ? message.comments : undefined,
        },
        fetchImpl(),
        token, apiCtx);
      return { ok: true, result };
    }
    case MSG.SUBMIT_PENDING_REVIEW: {
      const token = await tokenForMessage(message);
      if (!token) throw new Error('GitHub PAT required to submit pending reviews');
      const result = await PRTreeFetch.submitPendingPullReview(
        message.owner,
        message.repo,
        message.number,
        message.reviewId,
        { event: message.event || 'COMMENT', body: message.body || '' },
        fetchImpl(),
        token, apiCtx);
      return { ok: true, result };
    }
    case MSG.DELETE_PENDING_REVIEW: {
      const token = await tokenForMessage(message);
      if (!token) throw new Error('GitHub PAT required to discard pending reviews');
      const result = await PRTreeFetch.deletePendingPullReview(
        message.owner,
        message.repo,
        message.number,
        message.reviewId,
        fetchImpl(),
        token, apiCtx);
      return { ok: true, result };
    }
    case MSG.POST_REVIEW_COMMENT: {
      const token = await tokenForMessage(message);
      if (!token) throw new Error('GitHub PAT required to post review comments');
      const result = await PRTreeFetch.postReviewComment(
        message.owner,
        message.repo,
        message.number,
        {
          body: message.body,
          path: message.path,
          line: message.line,
          side: message.side || 'RIGHT',
          commitId: message.commitId,
          startLine: message.startLine,
          startSide: message.startSide,
          asPending: Boolean(message.asPending),
          subjectType: message.subjectType || message.subject_type || 'line',
        },
        fetchImpl(),
        token, apiCtx);
      return { ok: true, result };
    }
    case MSG.REPLY_REVIEW_COMMENT: {
      const token = await tokenForMessage(message);
      if (!token) throw new Error('GitHub PAT required to reply to review comments');
      const result = await PRTreeFetch.replyToReviewComment(
        message.owner,
        message.repo,
        message.number,
        message.commentId,
        message.body,
        fetchImpl(),
        token,
        {
          mode: message.mode || 'comment',
          threadNodeId: message.threadNodeId || null,
          parentNodeId: message.parentNodeId || null,
          path: message.path || null,
          line: message.line ?? null,
          side: message.side || null,
          commitId: message.commitId || null,
        },
        apiCtx
      );
      return { ok: true, result };
    }
    case MSG.RESOLVE_REVIEW_THREAD: {
      const token = await tokenForMessage(message);
      if (!token, apiCtx) throw new Error('GitHub PAT required to resolve review threads');
      const result = await PRTreeFetch.resolveReviewThread(
        message.threadNodeId,
        message.resolved !== false,
        fetchImpl(),
        token, apiCtx);
      return { ok: true, result };
    }
    case MSG.UPDATE_PULL_STATE: {
      const token = await tokenForMessage(message);
      if (!token) throw new Error('GitHub PAT required to close or reopen pull requests');
      const result = await PRTreeFetch.updatePullState(
        message.owner,
        message.repo,
        message.number,
        message.state === 'closed' ? 'closed' : 'open',
        fetchImpl(),
        token, apiCtx);
      return { ok: true, result };
    }
    case MSG.DELETE_REVIEW_COMMENT: {
      const token = await tokenForMessage(message);
      if (!token) throw new Error('GitHub PAT required to delete review comments');
      const result = await PRTreeFetch.deleteReviewComment(
        message.owner,
        message.repo,
        message.commentId,
        fetchImpl(),
        token, apiCtx);
      return { ok: true, result };
    }
    case MSG.DELETE_ISSUE_COMMENT: {
      const token = await tokenForMessage(message);
      if (!token) throw new Error('GitHub PAT required to delete comments');
      const result = await PRTreeFetch.deleteIssueComment(
        message.owner,
        message.repo,
        message.commentId,
        fetchImpl(),
        token, apiCtx);
      return { ok: true, result };
    }
    case MSG.UPDATE_PULL: {
      const token = await tokenForMessage(message);
      if (!token) throw new Error('GitHub PAT required to update pull request');
      const result = await PRTreeFetch.updatePullRequest(
        message.owner,
        message.repo,
        message.number,
        message.fields || {},
        fetchImpl(),
        token, apiCtx);
      return { ok: true, result };
    }
    case MSG.EDIT_ISSUE_COMMENT: {
      const token = await tokenForMessage(message);
      if (!token) throw new Error('GitHub PAT required to edit comments');
      const result = await PRTreeFetch.editIssueComment(
        message.owner,
        message.repo,
        message.commentId,
        message.body,
        fetchImpl(),
        token, apiCtx);
      return { ok: true, result };
    }
    case MSG.EDIT_REVIEW_COMMENT: {
      const token = await tokenForMessage(message);
      if (!token) throw new Error('GitHub PAT required to edit review comments');
      const result = await PRTreeFetch.editReviewComment(
        message.owner,
        message.repo,
        message.commentId,
        message.body,
        fetchImpl(),
        token, apiCtx);
      return { ok: true, result };
    }
    case MSG.REQUEST_REVIEWERS: {
      const token = await tokenForMessage(message);
      if (!token) throw new Error('GitHub PAT required to request reviewers');
      const result = await PRTreeFetch.requestReviewers(
        message.owner,
        message.repo,
        message.number,
        {
          reviewers: message.reviewers || [],
          teamReviewers: message.teamReviewers || [],
        },
        fetchImpl(),
        token, apiCtx);
      return { ok: true, result };
    }
    case MSG.REMOVE_REVIEWERS: {
      const token = await tokenForMessage(message);
      if (!token) throw new Error('GitHub PAT required to remove reviewers');
      const result = await PRTreeFetch.removeReviewers(
        message.owner,
        message.repo,
        message.number,
        {
          reviewers: message.reviewers || [],
          teamReviewers: message.teamReviewers || [],
        },
        fetchImpl(),
        token, apiCtx);
      return { ok: true, result };
    }
    case MSG.ADD_ASSIGNEES: {
      const token = await tokenForMessage(message);
      if (!token) throw new Error('GitHub PAT required to add assignees');
      const result = await PRTreeFetch.addAssignees(
        message.owner,
        message.repo,
        message.number,
        message.assignees || [],
        fetchImpl(),
        token, apiCtx);
      return { ok: true, result };
    }
    case MSG.REMOVE_ASSIGNEES: {
      const token = await tokenForMessage(message);
      if (!token) throw new Error('GitHub PAT required to remove assignees');
      const result = await PRTreeFetch.removeAssignees(
        message.owner,
        message.repo,
        message.number,
        message.assignees || [],
        fetchImpl(),
        token, apiCtx);
      return { ok: true, result };
    }
    case MSG.SET_LABELS: {
      const token = await tokenForMessage(message);
      if (!token) throw new Error('GitHub PAT required to set labels');
      const result = await PRTreeFetch.setIssueLabels(
        message.owner,
        message.repo,
        message.number,
        message.labels || [],
        fetchImpl(),
        token, apiCtx);
      return { ok: true, result };
    }
    case MSG.FETCH_REPO_LABELS: {
      const tracked = beginTrackedFetch(message.requestId);
      try {
        const token = await tokenForMessage(message);
        const labels = await PRTreeFetch.fetchRepoLabels(
          message.owner,
          message.repo,
          tracked.fetch,
          token,
          {
            maxPages:
              message.maxPages != null ? Number(message.maxPages) : undefined,
            ctx: apiCtx,
          }
        );
        return { ok: true, labels };
      } catch (err) {
        if (isAbortError(err)) return { ok: false, aborted: true, error: 'aborted' };
        throw err;
      } finally {
        endTrackedFetch(tracked.requestId);
      }
    }
    case MSG.CREATE_REPO_LABEL: {
      const token = await tokenForMessage(message);
      if (!token, apiCtx) throw new Error('GitHub PAT required to create labels');
      const result = await PRTreeFetch.createRepoLabel(
        message.owner,
        message.repo,
        {
          name: message.name,
          color: message.color,
          description: message.description,
        },
        fetchImpl(),
        token, apiCtx);
      return { ok: true, result };
    }
    case MSG.FETCH_REPO_MILESTONES: {
      const tracked = beginTrackedFetch(message.requestId);
      try {
        const token = await tokenForMessage(message);
        const milestones = await PRTreeFetch.fetchRepoMilestones(
          message.owner,
          message.repo,
          tracked.fetch,
          token,
          {
            maxPages:
              message.maxPages != null ? Number(message.maxPages) : undefined,
            state: message.state || 'all',
            ctx: apiCtx,
          }
        );
        return { ok: true, milestones };
      } catch (err) {
        if (isAbortError(err)) return { ok: false, aborted: true, error: 'aborted' };
        throw err;
      } finally {
        endTrackedFetch(tracked.requestId);
      }
    }
    case MSG.CREATE_REPO_MILESTONE: {
      const token = await tokenForMessage(message);
      if (!token, apiCtx) throw new Error('GitHub PAT required to create milestones');
      const result = await PRTreeFetch.createRepoMilestone(
        message.owner,
        message.repo,
        {
          title: message.title,
          description: message.description,
          state: message.state,
        },
        fetchImpl(),
        token, apiCtx);
      return { ok: true, result };
    }
    case MSG.FETCH_REPO_TAGS: {
      const tracked = beginTrackedFetch(message.requestId);
      try {
        const token = await tokenForMessage(message);
        const tags = await PRTreeFetch.fetchRepoTags(
          message.owner,
          message.repo,
          tracked.fetch,
          token,
          {
            maxPages:
              message.maxPages != null ? Number(message.maxPages) : undefined,
            ctx: apiCtx,
          }
        );
        return { ok: true, tags };
      } catch (err) {
        if (isAbortError(err)) return { ok: false, aborted: true, error: 'aborted' };
        throw err;
      } finally {
        endTrackedFetch(tracked.requestId);
      }
    }
    case MSG.FETCH_TAGS_FOR_COMMITS: {
      const tracked = beginTrackedFetch(message.requestId);
      try {
        const token = await tokenForMessage(message);
        const tags = await PRTreeFetch.fetchTagsForCommits(
          message.owner,
          message.repo,
          message.shas || [],
          tracked.fetch,
          token,
          {
            maxPages:
              message.maxPages != null ? Number(message.maxPages) : undefined,
            ctx: apiCtx,
          }
        );
        return { ok: true, tags };
      } catch (err) {
        if (isAbortError(err)) return { ok: false, aborted: true, error: 'aborted' };
        throw err;
      } finally {
        endTrackedFetch(tracked.requestId);
      }
    }
    case MSG.FETCH_ALL_PR_COMMITS: {
      const tracked = beginTrackedFetch(message.requestId);
      try {
        const token = await tokenForMessage(message);
        const commits = await PRTreeFetch.fetchAllPrCommits(
          message.owner,
          message.repo,
          message.number,
          tracked.fetch, token, apiCtx);
        return { ok: true, commits };
      } catch (err) {
        if (isAbortError(err)) return { ok: false, aborted: true, error: 'aborted' };
        throw err;
      } finally {
        endTrackedFetch(tracked.requestId);
      }
    }
    case MSG.FETCH_PR_COMMITS: {
      const tracked = beginTrackedFetch(message.requestId);
      try {
        const token = await tokenForMessage(message);
        const commits = await PRTreeFetch.fetchPrCommits(
          message.owner,
          message.repo,
          message.number,
          tracked.fetch, token, apiCtx);
        return { ok: true, commits };
      } catch (err) {
        if (isAbortError(err)) return { ok: false, aborted: true, error: 'aborted' };
        throw err;
      } finally {
        endTrackedFetch(tracked.requestId);
      }
    }
    case MSG.FETCH_PR_FILES: {
      const tracked = beginTrackedFetch(message.requestId);
      try {
        const token = await tokenForMessage(message);
        const pack = await PRTreeFetch.fetchPrFiles(
          message.owner,
          message.repo,
          message.number,
          tracked.fetch,
          token,
          {
            headSha: message.headSha || null,
            gitattributesText: message.gitattributesText || '', ctx: apiCtx }
        );
        return {
          ok: true,
          files: Array.isArray(pack?.files) ? pack.files : [],
          gitattributesText:
            typeof pack?.gitattributesText === 'string'
              ? pack.gitattributesText
              : '',
        };
      } catch (err) {
        if (isAbortError(err)) return { ok: false, aborted: true, error: 'aborted' };
        throw err;
      } finally {
        endTrackedFetch(tracked.requestId);
      }
    }
    case MSG.FETCH_PR_ISSUE_COMMENTS: {
      const tracked = beginTrackedFetch(message.requestId);
      try {
        const token = await tokenForMessage(message);
        const page = await PRTreeFetch.fetchPrIssueComments(
          message.owner,
          message.repo,
          message.number,
          tracked.fetch, token, apiCtx);
        return { ok: true, page };
      } catch (err) {
        if (isAbortError(err)) return { ok: false, aborted: true, error: 'aborted' };
        throw err;
      } finally {
        endTrackedFetch(tracked.requestId);
      }
    }
    case MSG.FETCH_PR_REVIEWS: {
      const tracked = beginTrackedFetch(message.requestId);
      try {
        const token = await tokenForMessage(message);
        const reviews = await PRTreeFetch.fetchPrReviews(
          message.owner,
          message.repo,
          message.number,
          tracked.fetch, token, apiCtx);
        return { ok: true, reviews: Array.isArray(reviews) ? reviews : [] };
      } catch (err) {
        if (isAbortError(err)) return { ok: false, aborted: true, error: 'aborted' };
        throw err;
      } finally {
        endTrackedFetch(tracked.requestId);
      }
    }
    case MSG.FETCH_PR_CHECKS: {
      const tracked = beginTrackedFetch(message.requestId);
      try {
        const token = await tokenForMessage(message);
        const checks = await PRTreeFetch.fetchPrChecks(
          message.owner,
          message.repo,
          message.headSha,
          tracked.fetch,
          token,
          apiCtx
        );
        return { ok: true, checks };
      } catch (err) {
        if (isAbortError(err)) return { ok: false, aborted: true, error: 'aborted' };
        throw err;
      } finally {
        endTrackedFetch(tracked.requestId);
      }
    }
    case MSG.FETCH_PR_DEVELOPMENT: {
      const tracked = beginTrackedFetch(message.requestId);
      try {
        const token = await tokenForMessage(message);
        const development = await PRTreeFetch.fetchPrDevelopment(
          message.owner,
          message.repo,
          message.number,
          tracked.fetch,
          token,
          { body: message.body || '', ctx: apiCtx }
        );
        return { ok: true, development };
      } catch (err) {
        if (isAbortError(err)) return { ok: false, aborted: true, error: 'aborted' };
        throw err;
      } finally {
        endTrackedFetch(tracked.requestId);
      }
    }
    case MSG.FETCH_ALL_PR_FILES: {
      const tracked = beginTrackedFetch(message.requestId);
      try {
        const token = await tokenForMessage(message);
        const files = await PRTreeFetch.fetchAllPrFiles(
          message.owner,
          message.repo,
          message.number,
          tracked.fetch,
          token,
          { gitattributesText: message.gitattributesText || '', ctx: apiCtx }
        );
        return { ok: true, files };
      } catch (err) {
        if (isAbortError(err)) return { ok: false, aborted: true, error: 'aborted' };
        throw err;
      } finally {
        endTrackedFetch(tracked.requestId);
      }
    }
    case MSG.UPLOAD_REPO_FILE: {
      const token = await tokenForMessage(message);
      if (!token) throw new Error('GitHub PAT required to upload files');
      const result = await PRTreeFetch.uploadRepoFile(
        message.owner,
        message.repo,
        {
          path: message.path,
          contentBase64: message.contentBase64,
          message: message.message,
          branch: message.branch,
        },
        fetchImpl(),
        token, apiCtx);
      return { ok: true, result };
    }
    case MSG.APPLY_SUGGESTION: {
      const token = await tokenForMessage(message);
      if (!token) throw new Error('GitHub PAT required to apply suggestions');
      const result = await PRTreeFetch.applyReviewSuggestion(
        message.owner,
        message.repo,
        {
          path: message.path,
          headRef: message.headRef,
          startLine: message.startLine,
          endLine: message.endLine,
          suggestion: message.suggestion,
          message: message.commitMessage,
        },
        fetchImpl(),
        token, apiCtx);
      return { ok: true, result };
    }
    case MSG.GET_REPO_FILE_TEXT: {
      const token = await tokenForMessage(message);
      if (!token) throw new Error('GitHub PAT required to read files');
      const result = await PRTreeFetch.getRepoFileText(
        message.owner,
        message.repo,
        {
          path: message.path,
          ref: message.ref || message.headRef || message.headSha,
        },
        fetchImpl(),
        token, apiCtx);
      return { ok: true, result };
    }
    case MSG.MERGE_PULL: {
      const token = await tokenForMessage(message);
      if (!token) throw new Error('GitHub PAT required to merge');
      const result = await PRTreeFetch.mergePullRequest(
        message.owner,
        message.repo,
        message.number,
        {
          mergeMethod: message.mergeMethod || 'merge',
          commitTitle: message.commitTitle,
          commitMessage: message.commitMessage,
        },
        fetchImpl(),
        token, apiCtx);
      return { ok: true, result };
    }
    case MSG.UPDATE_BRANCH: {
      const token = await tokenForMessage(message);
      if (!token) throw new Error('GitHub PAT required to update branch');
      const result = await PRTreeFetch.updatePullBranch(
        message.owner,
        message.repo,
        message.number,
        { expectedHeadSha: message.expectedHeadSha },
        fetchImpl(),
        token, apiCtx);
      return { ok: true, result };
    }
    case MSG.SET_SUBSCRIPTION: {
      const token = await tokenForMessage(message);
      if (!token) throw new Error('GitHub PAT required for notifications');
      const result = await PRTreeFetch.setIssueSubscription(
        message.owner,
        message.repo,
        message.number,
        {
          subscribed: message.subscribed !== false,
          ignored: Boolean(message.ignored),
          nodeId: message.nodeId || null,
        },
        fetchImpl(),
        token, apiCtx);
      return { ok: true, result };
    }
    case MSG.DELETE_SUBSCRIPTION: {
      const token = await tokenForMessage(message);
      if (!token) throw new Error('GitHub PAT required for notifications');
      const result = await PRTreeFetch.deleteIssueSubscription(
        message.owner,
        message.repo,
        message.number,
        fetchImpl(),
        token,
        message.nodeId || null
      );
      return { ok: true, result };
    }
    case MSG.SET_MILESTONE: {
      const token = await tokenForMessage(message);
      if (!token, apiCtx) throw new Error('GitHub PAT required to set milestone');
      const result = await PRTreeFetch.setIssueMilestone(
        message.owner,
        message.repo,
        message.number,
        message.milestone,
        fetchImpl(),
        token, apiCtx);
      return { ok: true, result };
    }
    case MSG.SET_DRAFT_STAGE: {
      const token = await tokenForMessage(message);
      if (!token) throw new Error('GitHub PAT required to change draft stage');
      const result = await PRTreeFetch.setPullRequestDraftStage(
        message.owner,
        message.repo,
        message.number,
        message.stage === 'ready' ? 'ready' : 'draft',
        fetchImpl(),
        token,
        message.nodeId || null,
        apiCtx
      );
      return { ok: true, result };
    }
    default:
      return { ok: false, error: `unknown type: ${message.type}` };
  }
}

chrome.runtime.onMessage.addListener((message, _sender) => {
  // Fire-and-forget broadcasts: content scripts listen; no reply expected.
  if (message?.type === MSG.TOKEN_CHANGED) {
    return false;
  }

  if (!message || typeof message.type !== 'string') {
    return Promise.resolve({ ok: false, error: 'invalid message' });
  }

  /**
   * CANCEL_FETCH / PING: no long GitHub work — skip keep-alive timeout wrapper
   * so cancel is never delayed behind unrelated timers.
   */
  if (
    message.type === MSG.CANCEL_FETCH ||
    message.type === MSG.PING
  ) {
    return Promise.resolve()
      .then(() => handleMessage(message))
      .catch((err) => ({
        ok: false,
        error: err?.message || String(err),
        status: err?.status,
      }));
  }

  // Stateless concurrent handlers: each message carries webHost → apiCtx,
  // propagated into fetch-pulls (no exclusive global queue).
  return withServiceWorkerKeepAlive(() =>
    withTimeout(
      handleMessage(message),
      MESSAGE_TIMEOUT_MS,
      message.type
    ).catch((err) => ({
      ok: false,
      error: err?.message || String(err),
      status: err?.status,
      aborted: isAbortError(err) || undefined,
    }))
  );
});

async function rehydrateEnterpriseScripts() {
  try {
    const hosts = await registeredEnterpriseHosts();
    await syncEnterpriseContentScripts(hosts);
  } catch (err) {
    console.warn('[pr+] enterprise content scripts', err?.message || err);
  }
}

try {
  chrome.runtime.onInstalled.addListener(() => {
    void rehydrateEnterpriseScripts();
  });
  chrome.runtime.onStartup.addListener(() => {
    void rehydrateEnterpriseScripts();
  });
} catch {
  /* ignore */
}

// Cold SW wake: re-register enterprise hosts from storage
void rehydrateEnterpriseScripts();

