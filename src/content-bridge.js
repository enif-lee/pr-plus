/**
 * Content-script bridge: talks to the service worker for token-backed work.
 * The raw PAT never enters the content-script context.
 */

(function initPrTreeContentBridge() {
  function send(message) {
    return new Promise((resolve, reject) => {
      if (!globalThis.chrome?.runtime?.sendMessage) {
        reject(new Error('chrome.runtime unavailable'));
        return;
      }
      chrome.runtime.sendMessage(message, (response) => {
        const err = chrome.runtime.lastError;
        if (err) {
          reject(new Error(err.message || String(err)));
          return;
        }
        resolve(response);
      });
    });
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
    async submitPullReview(owner, repo, number, { event, body }) {
      const res = await send({
        type: 'PR_TREE_SUBMIT_REVIEW',
        owner,
        repo,
        number,
        event,
        body,
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
        ...payload,
      });
      if (!res?.ok) {
        const err = new Error(res?.error || 'Failed to post review comment');
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
      };
      chrome.runtime.onMessage.addListener(listener);
      return () => chrome.runtime.onMessage.removeListener(listener);
    },
  };

  globalThis.PRTreeFetch = PRTreeFetch;
  globalThis.PRTreeStorage = PRTreeStorage;
})();
