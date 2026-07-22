/**
 * Extension service worker — sole place that reads the PAT and calls GitHub API.
 * Content scripts never receive the raw token.
 *
 * Messaging: return a Promise from onMessage (Chrome 110+) so the channel stays
 * open until the handler settles. Avoid fire-and-forget async + sendResponse,
 * which races SW suspension and surfaces:
 *   "message channel closed before a response was received"
 */

/* global importScripts, PRTreeStorage, PRTreeFetch, PRModalCollapse */

// collapse pure helper must load before fetch-pulls so annotateFilesForCollapse
// is available when fetchPrDetail runs in the service worker.
// review-threads pure helpers needed so fetchPrDetail can merge GraphQL thread ids
importScripts(
  'modal/pure/collapse.js',
  'modal/pure/comments-page.js',
  'modal/pure/review-threads.js',
  'modal/pure/pending-review.js',
  'modal/pure/pr-edit-api.js',
  'storage.js',
  'fetch-pulls.js'
);

const MSG = {
  TOKEN_STATUS: 'PR_TREE_TOKEN_STATUS',
  TOKEN_SET: 'PR_TREE_TOKEN_SET',
  TOKEN_CLEAR: 'PR_TREE_TOKEN_CLEAR',
  TOKEN_CHANGED: 'PR_TREE_TOKEN_CHANGED',
  FETCH_OPEN_PULLS: 'PR_TREE_FETCH_OPEN_PULLS',
  FETCH_DANGLING: 'PR_TREE_FETCH_DANGLING',
  FETCH_PR_DETAIL: 'PR_TREE_FETCH_PR_DETAIL',
  FETCH_REVIEW_THREADS_PAGE: 'PR_TREE_FETCH_REVIEW_THREADS_PAGE',
  FETCH_COMMENTS_PAGE: 'PR_TREE_FETCH_COMMENTS_PAGE',
  FETCH_COMPARE_FILES: 'PR_TREE_FETCH_COMPARE_FILES',
  POST_ISSUE_COMMENT: 'PR_TREE_POST_ISSUE_COMMENT',
  SUBMIT_REVIEW: 'PR_TREE_SUBMIT_REVIEW',
  SUBMIT_PENDING_REVIEW: 'PR_TREE_SUBMIT_PENDING_REVIEW',
  DELETE_PENDING_REVIEW: 'PR_TREE_DELETE_PENDING_REVIEW',
  POST_REVIEW_COMMENT: 'PR_TREE_POST_REVIEW_COMMENT',
  REPLY_REVIEW_COMMENT: 'PR_TREE_REPLY_REVIEW_COMMENT',
  RESOLVE_REVIEW_THREAD: 'PR_TREE_RESOLVE_REVIEW_THREAD',
  UPDATE_PULL_STATE: 'PR_TREE_UPDATE_PULL_STATE',
  DELETE_REVIEW_COMMENT: 'PR_TREE_DELETE_REVIEW_COMMENT',
  DELETE_ISSUE_COMMENT: 'PR_TREE_DELETE_ISSUE_COMMENT',
  UPDATE_PULL: 'PR_TREE_UPDATE_PULL',
  EDIT_ISSUE_COMMENT: 'PR_TREE_EDIT_ISSUE_COMMENT',
  EDIT_REVIEW_COMMENT: 'PR_TREE_EDIT_REVIEW_COMMENT',
  REQUEST_REVIEWERS: 'PR_TREE_REQUEST_REVIEWERS',
  REMOVE_REVIEWERS: 'PR_TREE_REMOVE_REVIEWERS',
  ADD_ASSIGNEES: 'PR_TREE_ADD_ASSIGNEES',
  REMOVE_ASSIGNEES: 'PR_TREE_REMOVE_ASSIGNEES',
  SET_LABELS: 'PR_TREE_SET_LABELS',
  APPLY_SUGGESTION: 'PR_TREE_APPLY_SUGGESTION',
  MERGE_PULL: 'PR_TREE_MERGE_PULL',
  UPDATE_BRANCH: 'PR_TREE_UPDATE_BRANCH',
  SET_SUBSCRIPTION: 'PR_TREE_SET_SUBSCRIPTION',
  DELETE_SUBSCRIPTION: 'PR_TREE_DELETE_SUBSCRIPTION',
  SET_MILESTONE: 'PR_TREE_SET_MILESTONE',
  SET_DRAFT_STAGE: 'PR_TREE_SET_DRAFT_STAGE',
  UPLOAD_REPO_FILE: 'PR_TREE_UPLOAD_REPO_FILE',
};

/** Max time for one SW message (GitHub multi-request detail can be slow). */
const MESSAGE_TIMEOUT_MS = 120_000;

function broadcastTokenChanged() {
  // Notify extension pages / open content scripts without sending the secret.
  // sendMessage may not return a Promise on all runtimes — never assume .catch.
  try {
    chrome.runtime.sendMessage({ type: MSG.TOKEN_CHANGED }, () => {
      void chrome.runtime.lastError; // no receivers is fine
    });
  } catch {
    /* ignore */
  }
  try {
    chrome.tabs.query({ url: ['https://github.com/*'] }, (tabs) => {
      for (const tab of tabs || []) {
        if (tab.id == null) continue;
        try {
          chrome.tabs.sendMessage(tab.id, { type: MSG.TOKEN_CHANGED }, () => {
            void chrome.runtime.lastError;
          });
        } catch {
          /* tab may not have content script */
        }
      }
    });
  } catch {
    /* ignore */
  }
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local' || !changes[PRTreeStorage.TOKEN_KEY]) return;
  broadcastTokenChanged();
});

function fetchImpl() {
  return globalThis.fetch.bind(globalThis);
}

/**
 * Periodic chrome API call keeps the MV3 service worker alive during long
 * GitHub fetches (otherwise SW can suspend mid-handler and close the channel).
 */
function withServiceWorkerKeepAlive(work) {
  let tick = 0;
  const id = setInterval(() => {
    tick += 1;
    try {
      chrome.runtime.getPlatformInfo(() => {
        void chrome.runtime.lastError;
      });
    } catch {
      /* ignore */
    }
    // Also touch storage lightly every other tick
    if (tick % 2 === 0) {
      try {
        chrome.storage.local.get('__prp_keepalive__', () => {
          void chrome.runtime.lastError;
        });
      } catch {
        /* ignore */
      }
    }
  }, 15_000);

  return Promise.resolve()
    .then(work)
    .finally(() => clearInterval(id));
}

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(
        `${label || 'Request'} timed out after ${Math.round(ms / 1000)}s`
      );
      err.status = 408;
      reject(err);
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function handleMessage(message) {
  switch (message.type) {
    case MSG.TOKEN_STATUS: {
      const status = await PRTreeStorage.getGithubTokenStatus();
      return { ok: true, ...status };
    }
    case MSG.TOKEN_SET: {
      await PRTreeStorage.setGithubToken(message.token || '');
      const status = await PRTreeStorage.getGithubTokenStatus();
      return { ok: true, ...status };
    }
    case MSG.TOKEN_CLEAR: {
      await PRTreeStorage.setGithubToken('');
      return { ok: true, configured: false, mask: '' };
    }
    case MSG.FETCH_OPEN_PULLS: {
      const token = await PRTreeStorage.getGithubToken();
      const prs = await PRTreeFetch.fetchOpenPulls(
        message.owner,
        message.repo,
        fetchImpl(),
        {
          token,
          pagePrNumbers: Array.isArray(message.pagePrNumbers)
            ? message.pagePrNumbers
            : [],
        }
      );
      return { ok: true, prs };
    }
    case MSG.FETCH_DANGLING: {
      const token = await PRTreeStorage.getGithubToken();
      const prs = await PRTreeFetch.fetchDanglingPulls(
        message.owner,
        message.repo,
        Array.isArray(message.numbers) ? message.numbers : [],
        fetchImpl(),
        token
      );
      return { ok: true, prs };
    }
    case MSG.FETCH_PR_DETAIL: {
      const token = await PRTreeStorage.getGithubToken();
      // Partial by default: core + first GraphQL threads page (not all pages)
      const detail = await PRTreeFetch.fetchPrDetail(
        message.owner,
        message.repo,
        message.number,
        fetchImpl(),
        token,
        {
          skipReviewThreads: Boolean(message.skipReviewThreads),
          threadsMaxPages: message.threadsMaxPages != null ? Number(message.threadsMaxPages) : 1,
        }
      );
      return { ok: true, detail };
    }
    case MSG.FETCH_REVIEW_THREADS_PAGE: {
      const token = await PRTreeStorage.getGithubToken();
      if (!token) {
        return {
          ok: true,
          page: {
            threads: [],
            comments: [],
            hasMore: false,
            endCursor: null,
            pageCount: 0,
          },
        };
      }
      const page = await PRTreeFetch.fetchReviewThreadsPage(
        message.owner,
        message.repo,
        message.number,
        {
          direction: message.direction || 'newest',
          cursor: message.cursor || null,
          pageSize: message.pageSize != null ? Number(message.pageSize) : undefined,
        },
        fetchImpl(),
        token
      );
      return { ok: true, page };
    }
    case MSG.FETCH_COMMENTS_PAGE: {
      const token = await PRTreeStorage.getGithubToken();
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
        fetchImpl(),
        token
      );
      return { ok: true, page };
    }
    case MSG.FETCH_COMPARE_FILES: {
      const token = await PRTreeStorage.getGithubToken();
      const result = await PRTreeFetch.fetchCompareFiles(
        message.owner,
        message.repo,
        message.base,
        message.head,
        fetchImpl(),
        token,
        { gitattributesText: message.gitattributesText || '' }
      );
      return { ok: true, result };
    }
    case MSG.POST_ISSUE_COMMENT: {
      const token = await PRTreeStorage.getGithubToken();
      if (!token) throw new Error('GitHub PAT required to post comments');
      const result = await PRTreeFetch.postIssueComment(
        message.owner,
        message.repo,
        message.number,
        message.body,
        fetchImpl(),
        token
      );
      return { ok: true, result };
    }
    case MSG.SUBMIT_REVIEW: {
      const token = await PRTreeStorage.getGithubToken();
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
        token
      );
      return { ok: true, result };
    }
    case MSG.SUBMIT_PENDING_REVIEW: {
      const token = await PRTreeStorage.getGithubToken();
      if (!token) throw new Error('GitHub PAT required to submit pending reviews');
      const result = await PRTreeFetch.submitPendingPullReview(
        message.owner,
        message.repo,
        message.number,
        message.reviewId,
        { event: message.event || 'COMMENT', body: message.body || '' },
        fetchImpl(),
        token
      );
      return { ok: true, result };
    }
    case MSG.DELETE_PENDING_REVIEW: {
      const token = await PRTreeStorage.getGithubToken();
      if (!token) throw new Error('GitHub PAT required to discard pending reviews');
      const result = await PRTreeFetch.deletePendingPullReview(
        message.owner,
        message.repo,
        message.number,
        message.reviewId,
        fetchImpl(),
        token
      );
      return { ok: true, result };
    }
    case MSG.POST_REVIEW_COMMENT: {
      const token = await PRTreeStorage.getGithubToken();
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
        },
        fetchImpl(),
        token
      );
      return { ok: true, result };
    }
    case MSG.REPLY_REVIEW_COMMENT: {
      const token = await PRTreeStorage.getGithubToken();
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
        }
      );
      return { ok: true, result };
    }
    case MSG.RESOLVE_REVIEW_THREAD: {
      const token = await PRTreeStorage.getGithubToken();
      if (!token) throw new Error('GitHub PAT required to resolve review threads');
      const result = await PRTreeFetch.resolveReviewThread(
        message.threadNodeId,
        message.resolved !== false,
        fetchImpl(),
        token
      );
      return { ok: true, result };
    }
    case MSG.UPDATE_PULL_STATE: {
      const token = await PRTreeStorage.getGithubToken();
      if (!token) throw new Error('GitHub PAT required to close or reopen pull requests');
      const result = await PRTreeFetch.updatePullState(
        message.owner,
        message.repo,
        message.number,
        message.state === 'closed' ? 'closed' : 'open',
        fetchImpl(),
        token
      );
      return { ok: true, result };
    }
    case MSG.DELETE_REVIEW_COMMENT: {
      const token = await PRTreeStorage.getGithubToken();
      if (!token) throw new Error('GitHub PAT required to delete review comments');
      const result = await PRTreeFetch.deleteReviewComment(
        message.owner,
        message.repo,
        message.commentId,
        fetchImpl(),
        token
      );
      return { ok: true, result };
    }
    case MSG.DELETE_ISSUE_COMMENT: {
      const token = await PRTreeStorage.getGithubToken();
      if (!token) throw new Error('GitHub PAT required to delete comments');
      const result = await PRTreeFetch.deleteIssueComment(
        message.owner,
        message.repo,
        message.commentId,
        fetchImpl(),
        token
      );
      return { ok: true, result };
    }
    case MSG.UPDATE_PULL: {
      const token = await PRTreeStorage.getGithubToken();
      if (!token) throw new Error('GitHub PAT required to update pull request');
      const result = await PRTreeFetch.updatePullRequest(
        message.owner,
        message.repo,
        message.number,
        message.fields || {},
        fetchImpl(),
        token
      );
      return { ok: true, result };
    }
    case MSG.EDIT_ISSUE_COMMENT: {
      const token = await PRTreeStorage.getGithubToken();
      if (!token) throw new Error('GitHub PAT required to edit comments');
      const result = await PRTreeFetch.editIssueComment(
        message.owner,
        message.repo,
        message.commentId,
        message.body,
        fetchImpl(),
        token
      );
      return { ok: true, result };
    }
    case MSG.EDIT_REVIEW_COMMENT: {
      const token = await PRTreeStorage.getGithubToken();
      if (!token) throw new Error('GitHub PAT required to edit review comments');
      const result = await PRTreeFetch.editReviewComment(
        message.owner,
        message.repo,
        message.commentId,
        message.body,
        fetchImpl(),
        token
      );
      return { ok: true, result };
    }
    case MSG.REQUEST_REVIEWERS: {
      const token = await PRTreeStorage.getGithubToken();
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
        token
      );
      return { ok: true, result };
    }
    case MSG.REMOVE_REVIEWERS: {
      const token = await PRTreeStorage.getGithubToken();
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
        token
      );
      return { ok: true, result };
    }
    case MSG.ADD_ASSIGNEES: {
      const token = await PRTreeStorage.getGithubToken();
      if (!token) throw new Error('GitHub PAT required to add assignees');
      const result = await PRTreeFetch.addAssignees(
        message.owner,
        message.repo,
        message.number,
        message.assignees || [],
        fetchImpl(),
        token
      );
      return { ok: true, result };
    }
    case MSG.REMOVE_ASSIGNEES: {
      const token = await PRTreeStorage.getGithubToken();
      if (!token) throw new Error('GitHub PAT required to remove assignees');
      const result = await PRTreeFetch.removeAssignees(
        message.owner,
        message.repo,
        message.number,
        message.assignees || [],
        fetchImpl(),
        token
      );
      return { ok: true, result };
    }
    case MSG.SET_LABELS: {
      const token = await PRTreeStorage.getGithubToken();
      if (!token) throw new Error('GitHub PAT required to set labels');
      const result = await PRTreeFetch.setIssueLabels(
        message.owner,
        message.repo,
        message.number,
        message.labels || [],
        fetchImpl(),
        token
      );
      return { ok: true, result };
    }
    case MSG.UPLOAD_REPO_FILE: {
      const token = await PRTreeStorage.getGithubToken();
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
        token
      );
      return { ok: true, result };
    }
    case MSG.APPLY_SUGGESTION: {
      const token = await PRTreeStorage.getGithubToken();
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
        token
      );
      return { ok: true, result };
    }
    case MSG.MERGE_PULL: {
      const token = await PRTreeStorage.getGithubToken();
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
        token
      );
      return { ok: true, result };
    }
    case MSG.UPDATE_BRANCH: {
      const token = await PRTreeStorage.getGithubToken();
      if (!token) throw new Error('GitHub PAT required to update branch');
      const result = await PRTreeFetch.updatePullBranch(
        message.owner,
        message.repo,
        message.number,
        { expectedHeadSha: message.expectedHeadSha },
        fetchImpl(),
        token
      );
      return { ok: true, result };
    }
    case MSG.SET_SUBSCRIPTION: {
      const token = await PRTreeStorage.getGithubToken();
      if (!token) throw new Error('GitHub PAT required for notifications');
      const result = await PRTreeFetch.setIssueSubscription(
        message.owner,
        message.repo,
        message.number,
        {
          subscribed: message.subscribed !== false,
          ignored: Boolean(message.ignored),
        },
        fetchImpl(),
        token
      );
      return { ok: true, result };
    }
    case MSG.DELETE_SUBSCRIPTION: {
      const token = await PRTreeStorage.getGithubToken();
      if (!token) throw new Error('GitHub PAT required for notifications');
      const result = await PRTreeFetch.deleteIssueSubscription(
        message.owner,
        message.repo,
        message.number,
        fetchImpl(),
        token
      );
      return { ok: true, result };
    }
    case MSG.SET_MILESTONE: {
      const token = await PRTreeStorage.getGithubToken();
      if (!token) throw new Error('GitHub PAT required to set milestone');
      const result = await PRTreeFetch.setIssueMilestone(
        message.owner,
        message.repo,
        message.number,
        message.milestone,
        fetchImpl(),
        token
      );
      return { ok: true, result };
    }
    case MSG.SET_DRAFT_STAGE: {
      const token = await PRTreeStorage.getGithubToken();
      if (!token) throw new Error('GitHub PAT required to change draft stage');
      const result = await PRTreeFetch.setPullRequestDraftStage(
        message.owner,
        message.repo,
        message.number,
        message.stage === 'ready' ? 'ready' : 'draft',
        fetchImpl(),
        token,
        message.nodeId || null
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

  // Return a Promise so Chrome keeps the message port open until settle
  // (preferred over return true + sendResponse, which races SW sleep).
  return withServiceWorkerKeepAlive(() =>
    withTimeout(
      handleMessage(message),
      MESSAGE_TIMEOUT_MS,
      message.type
    ).catch((err) => ({
      ok: false,
      error: err?.message || String(err),
      status: err?.status,
    }))
  );
});
