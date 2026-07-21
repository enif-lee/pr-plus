/**
 * Extension service worker — sole place that reads the PAT and calls GitHub API.
 * Content scripts never receive the raw token.
 */

/* global importScripts, PRTreeStorage, PRTreeFetch */

importScripts('storage.js', 'fetch-pulls.js');

const MSG = {
  TOKEN_STATUS: 'PR_TREE_TOKEN_STATUS',
  TOKEN_SET: 'PR_TREE_TOKEN_SET',
  TOKEN_CLEAR: 'PR_TREE_TOKEN_CLEAR',
  TOKEN_CHANGED: 'PR_TREE_TOKEN_CHANGED',
  FETCH_OPEN_PULLS: 'PR_TREE_FETCH_OPEN_PULLS',
  FETCH_DANGLING: 'PR_TREE_FETCH_DANGLING',
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
