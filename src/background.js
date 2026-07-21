/**
 * Extension service worker — sole place that reads the PAT and calls GitHub API.
 * Content scripts never receive the raw token.
 */

/* global importScripts, PRTreeStorage, PRTreeFetch, PRModalCollapse */

// collapse pure helper must load before fetch-pulls so annotateFilesForCollapse
// is available when fetchPrDetail runs in the service worker.
importScripts('modal/pure/collapse.js', 'storage.js', 'fetch-pulls.js');

const MSG = {
  TOKEN_STATUS: 'PR_TREE_TOKEN_STATUS',
  TOKEN_SET: 'PR_TREE_TOKEN_SET',
  TOKEN_CLEAR: 'PR_TREE_TOKEN_CLEAR',
  TOKEN_CHANGED: 'PR_TREE_TOKEN_CHANGED',
  FETCH_OPEN_PULLS: 'PR_TREE_FETCH_OPEN_PULLS',
  FETCH_DANGLING: 'PR_TREE_FETCH_DANGLING',
  FETCH_PR_DETAIL: 'PR_TREE_FETCH_PR_DETAIL',
  POST_ISSUE_COMMENT: 'PR_TREE_POST_ISSUE_COMMENT',
  SUBMIT_REVIEW: 'PR_TREE_SUBMIT_REVIEW',
  POST_REVIEW_COMMENT: 'PR_TREE_POST_REVIEW_COMMENT',
};

function broadcastTokenChanged() {
  // Notify extension pages / open content scripts without sending the secret.
  chrome.runtime.sendMessage({ type: MSG.TOKEN_CHANGED }).catch(() => {
    /* no receivers */
  });
  chrome.tabs.query({ url: ['https://github.com/*'] }, (tabs) => {
    for (const tab of tabs || []) {
      if (tab.id == null) continue;
      chrome.tabs.sendMessage(tab.id, { type: MSG.TOKEN_CHANGED }).catch(() => {
        /* tab may not have content script */
      });
    }
  });
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local' || !changes[PRTreeStorage.TOKEN_KEY]) return;
  broadcastTokenChanged();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message.type !== 'string') {
    sendResponse({ ok: false, error: 'invalid message' });
    return false;
  }

  (async () => {
    switch (message.type) {
      case MSG.TOKEN_STATUS: {
        const status = await PRTreeStorage.getGithubTokenStatus();
        sendResponse({ ok: true, ...status });
        return;
      }
      case MSG.TOKEN_SET: {
        await PRTreeStorage.setGithubToken(message.token || '');
        const status = await PRTreeStorage.getGithubTokenStatus();
        sendResponse({ ok: true, ...status });
        return;
      }
      case MSG.TOKEN_CLEAR: {
        await PRTreeStorage.setGithubToken('');
        sendResponse({ ok: true, configured: false, mask: '' });
        return;
      }
      case MSG.FETCH_OPEN_PULLS: {
        const token = await PRTreeStorage.getGithubToken();
        const prs = await PRTreeFetch.fetchOpenPulls(
          message.owner,
          message.repo,
          globalThis.fetch.bind(globalThis),
          {
            token,
            pagePrNumbers: Array.isArray(message.pagePrNumbers)
              ? message.pagePrNumbers
              : [],
          }
        );
        sendResponse({ ok: true, prs });
        return;
      }
      case MSG.FETCH_DANGLING: {
        const token = await PRTreeStorage.getGithubToken();
        const prs = await PRTreeFetch.fetchDanglingPulls(
          message.owner,
          message.repo,
          Array.isArray(message.numbers) ? message.numbers : [],
          globalThis.fetch.bind(globalThis),
          token
        );
        sendResponse({ ok: true, prs });
        return;
      }
      case MSG.FETCH_PR_DETAIL: {
        const token = await PRTreeStorage.getGithubToken();
        const detail = await PRTreeFetch.fetchPrDetail(
          message.owner,
          message.repo,
          message.number,
          globalThis.fetch.bind(globalThis),
          token
        );
        sendResponse({ ok: true, detail });
        return;
      }
      case MSG.POST_ISSUE_COMMENT: {
        const token = await PRTreeStorage.getGithubToken();
        if (!token) throw new Error('GitHub PAT required to post comments');
        const result = await PRTreeFetch.postIssueComment(
          message.owner,
          message.repo,
          message.number,
          message.body,
          globalThis.fetch.bind(globalThis),
          token
        );
        sendResponse({ ok: true, result });
        return;
      }
      case MSG.SUBMIT_REVIEW: {
        const token = await PRTreeStorage.getGithubToken();
        if (!token) throw new Error('GitHub PAT required to submit reviews');
        const result = await PRTreeFetch.submitPullReview(
          message.owner,
          message.repo,
          message.number,
          { event: message.event, body: message.body || '' },
          globalThis.fetch.bind(globalThis),
          token
        );
        sendResponse({ ok: true, result });
        return;
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
          },
          globalThis.fetch.bind(globalThis),
          token
        );
        sendResponse({ ok: true, result });
        return;
      }
      default:
        sendResponse({ ok: false, error: `unknown type: ${message.type}` });
    }
  })().catch((err) => {
    sendResponse({
      ok: false,
      error: err?.message || String(err),
      status: err?.status,
    });
  });

  return true; // async sendResponse
});
