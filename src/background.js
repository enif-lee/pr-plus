/**
 * Extension service worker — sole place that reads the PAT and calls GitHub API.
 * Content scripts never receive the raw token.
 *
 * Messaging: return a Promise from onMessage (Chrome 110+) so the channel stays
 * open until the handler settles. Avoid fire-and-forget async + sendResponse,
 * which races SW suspension and surfaces:
 *   "message channel closed before a response was received"
 */

/* global importScripts, PRTreeStorage, PRTreeFetch, PRModalCollapse, PRGithubEndpoints */

// collapse pure helper must load before fetch-pulls so annotateFilesForCollapse
// is available when fetchPrDetail runs in the service worker.
// review-threads pure helpers needed so fetchPrDetail can merge GraphQL thread ids
importScripts(
  'github-endpoints.js',
  'modal/pure/collapse.js',
  'modal/pure/comments-page.js',
  'modal/pure/review-threads.js',
  'modal/pure/pending-review.js',
  'modal/pure/pr-edit-api.js',
  'modal/pure/checks.js',
  'storage.js',
  'fetch-pulls.js'
);

const ENTERPRISE_CS_ID = 'prp-enterprise-hosts';
const CONTENT_SCRIPT_JS = [
  'src/tree.js',
  'src/dom.js',
  'src/pr-list-focus.js',
  'src/pulls-palette.js',
  'src/github-endpoints.js',
  'src/content-bridge.js',
  'src/content-bootstrap.js',
  'src/content.js',
  'src/modal/pure/detail-idb-cache.js',
  'src/modal/pure/detail-cache.js',
  'src/modal/dist/pr-modal.bundle.js',
  'src/pr-modal-host.js',
];

/**
 * Serialize GitHub API work: REST/GraphQL base is process-global
 * (__PRP_GITHUB_API__). Without a queue, concurrent handlers (github.com tab +
 * enterprise tab) can clobber each other mid-request.
 */
const runWithGithubApiExclusive =
  typeof PRGithubEndpoints.createGithubApiExclusiveRunner === 'function'
    ? PRGithubEndpoints.createGithubApiExclusiveRunner()
    : (fn) => Promise.resolve().then(fn);

/**
 * Resolve REST/GraphQL bases for this message from the page web host.
 * Must only run inside runWithGithubApiExclusive for API-backed handlers.
 */
async function applyApiContextFromMessage(message) {
  const endpoints = PRGithubEndpoints.resolveGithubEndpoints({
    webHost: message?.webHost || message?.webOrigin || 'github.com',
  });
  PRGithubEndpoints.setGithubApiContext(endpoints);
  return endpoints;
}

/**
 * PAT for this message's web host.
 * github.com → default token; registered enterprise → host pair; else null.
 */
async function tokenForMessage(message) {
  const webHost = message?.webHost || message?.webOrigin || 'github.com';
  const sel = await PRTreeStorage.getTokenForWebHost(webHost);
  return sel.token;
}

/** Registered enterprise hostnames (no tokens) for tab query / content scripts. */
async function registeredEnterpriseHosts() {
  return PRTreeStorage.getHostAccountHosts();
}

function githubTabUrlPatterns(enterpriseHosts) {
  const patterns = ['https://github.com/*', 'https://*.github.com/*'];
  const hosts = PRGithubEndpoints.normalizeEnterpriseWebHosts(enterpriseHosts);
  for (const h of hosts) {
    patterns.push(`https://${h}/*`);
  }
  return patterns;
}

/**
 * Serialize enterprise content-script sync.
 * HOST_ACCOUNT_ADD and storage.onChanged both call this; parallel
 * registerContentScripts races cause:
 *   "Duplicate script ID 'prp-enterprise-hosts'"
 */
let enterpriseCsSyncChain = Promise.resolve();

async function syncEnterpriseContentScripts(enterpriseHosts) {
  const run = () => syncEnterpriseContentScriptsImpl(enterpriseHosts);
  // Always continue the chain even if a prior sync rejected
  const next = enterpriseCsSyncChain.then(run, run);
  enterpriseCsSyncChain = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

async function syncEnterpriseContentScriptsImpl(enterpriseHosts) {
  if (!chrome.scripting?.registerContentScripts) {
    return { registered: false };
  }
  const matches =
    PRGithubEndpoints.contentScriptMatchesForHosts(enterpriseHosts);

  // Drop existing registration if present (id may already be live).
  try {
    if (typeof chrome.scripting.getRegisteredContentScripts === 'function') {
      const existing = await chrome.scripting.getRegisteredContentScripts({
        ids: [ENTERPRISE_CS_ID],
      });
      if (Array.isArray(existing) && existing.length > 0) {
        await chrome.scripting.unregisterContentScripts({
          ids: [ENTERPRISE_CS_ID],
        });
      }
    } else {
      await chrome.scripting.unregisterContentScripts({
        ids: [ENTERPRISE_CS_ID],
      });
    }
  } catch {
    /* not registered yet — fine */
  }

  if (!matches.length) return { registered: false, matches: [] };

  const script = {
    id: ENTERPRISE_CS_ID,
    matches,
    js: CONTENT_SCRIPT_JS,
    css: ['src/styles.css'],
    runAt: 'document_idle',
    persistAcrossSessions: true,
  };

  // Prefer update when available (avoids delete/create race with other callers).
  if (typeof chrome.scripting.updateContentScripts === 'function') {
    try {
      await chrome.scripting.updateContentScripts([script]);
      return { registered: true, matches, updated: true };
    } catch {
      /* not registered — fall through to register */
    }
  }

  try {
    await chrome.scripting.registerContentScripts([script]);
  } catch (err) {
    // Last resort: if race left a registration, unregister + retry once.
    const msg = String(err?.message || err || '');
    if (/duplicate script id/i.test(msg)) {
      try {
        await chrome.scripting.unregisterContentScripts({
          ids: [ENTERPRISE_CS_ID],
        });
      } catch {
        /* ignore */
      }
      await chrome.scripting.registerContentScripts([script]);
    } else {
      throw err;
    }
  }
  return { registered: true, matches };
}

async function requestEnterprisePermissions(enterpriseHosts) {
  if (!chrome.permissions?.request) {
    return { granted: false, error: 'permissions API unavailable' };
  }
  const origins = new Set();
  for (const h of PRGithubEndpoints.normalizeEnterpriseWebHosts(enterpriseHosts)) {
    origins.add(`https://${h}/*`);
    // GHE Cloud API lives on api.{webHost}
    if (h.endsWith('.ghe.com') && !h.startsWith('api.')) {
      origins.add(`https://api.${h}/*`);
    }
  }
  const list = [...origins];
  if (!list.length) return { granted: true, origins: [] };
  return new Promise((resolve) => {
    chrome.permissions.request({ origins: list }, (granted) => {
      const err = chrome.runtime.lastError;
      if (err) resolve({ granted: false, error: err.message, origins: list });
      else resolve({ granted: Boolean(granted), origins: list });
    });
  });
}

const MSG = {
  /** Lightweight wake / health check (content scripts retry against this). */
  PING: 'PR_TREE_PING',
  TOKEN_STATUS: 'PR_TREE_TOKEN_STATUS',
  TOKEN_SET: 'PR_TREE_TOKEN_SET',
  TOKEN_CLEAR: 'PR_TREE_TOKEN_CLEAR',
  TOKEN_CHANGED: 'PR_TREE_TOKEN_CHANGED',
  PREFS_GET: 'PR_TREE_PREFS_GET',
  PREFS_SET: 'PR_TREE_PREFS_SET',
  PREFS_CHANGED: 'PR_TREE_PREFS_CHANGED',
  HOST_ACCOUNTS_LIST: 'PR_TREE_HOST_ACCOUNTS_LIST',
  HOST_ACCOUNT_ADD: 'PR_TREE_HOST_ACCOUNT_ADD',
  HOST_ACCOUNT_REMOVE: 'PR_TREE_HOST_ACCOUNT_REMOVE',
  HOST_ACCOUNTS_CHANGED: 'PR_TREE_HOST_ACCOUNTS_CHANGED',
  /** Clear PR detail memory + IndexedDB cache on open github.com tabs. */
  CLEAR_DETAIL_CACHE: 'PR_TREE_CLEAR_DETAIL_CACHE',
  /** Abort in-flight GitHub fetches by requestId (sheet closed / superseded open). */
  CANCEL_FETCH: 'PR_TREE_CANCEL_FETCH',
  FETCH_OPEN_PULLS: 'PR_TREE_FETCH_OPEN_PULLS',
  FETCH_DANGLING: 'PR_TREE_FETCH_DANGLING',
  FETCH_PR_DETAIL: 'PR_TREE_FETCH_PR_DETAIL',
  FETCH_REVIEW_THREADS_PAGE: 'PR_TREE_FETCH_REVIEW_THREADS_PAGE',
  FETCH_REVIEW_THREADS_BY_IDS: 'PR_TREE_FETCH_REVIEW_THREADS_BY_IDS',
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
  FETCH_REPO_LABELS: 'PR_TREE_FETCH_REPO_LABELS',
  CREATE_REPO_LABEL: 'PR_TREE_CREATE_REPO_LABEL',
  FETCH_REPO_MILESTONES: 'PR_TREE_FETCH_REPO_MILESTONES',
  CREATE_REPO_MILESTONE: 'PR_TREE_CREATE_REPO_MILESTONE',
  FETCH_REPO_TAGS: 'PR_TREE_FETCH_REPO_TAGS',
  FETCH_TAGS_FOR_COMMITS: 'PR_TREE_FETCH_TAGS_FOR_COMMITS',
  FETCH_ALL_PR_COMMITS: 'PR_TREE_FETCH_ALL_PR_COMMITS',
  FETCH_ALL_PR_FILES: 'PR_TREE_FETCH_ALL_PR_FILES',
  APPLY_SUGGESTION: 'PR_TREE_APPLY_SUGGESTION',
  GET_REPO_FILE_TEXT: 'PR_TREE_GET_REPO_FILE_TEXT',
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

function broadcastToGithubTabs(message) {
  // Notify extension pages / open content scripts without sending secrets.
  // sendMessage may not return a Promise on all runtimes — never assume .catch.
  try {
    chrome.runtime.sendMessage(message, () => {
      void chrome.runtime.lastError; // no receivers is fine
    });
  } catch {
    /* ignore */
  }
  try {
    registeredEnterpriseHosts().then((hosts) => {
      const url = githubTabUrlPatterns(hosts);
      chrome.tabs.query({ url }, (tabs) => {
        for (const tab of tabs || []) {
          if (tab.id == null) continue;
          try {
            chrome.tabs.sendMessage(tab.id, message, () => {
              void chrome.runtime.lastError;
            });
          } catch {
            /* tab may not have content script */
          }
        }
      });
    });
  } catch {
    /* ignore */
  }
}

function broadcastTokenChanged() {
  broadcastToGithubTabs({ type: MSG.TOKEN_CHANGED });
}

function broadcastPrefsChanged(prefs) {
  broadcastToGithubTabs({ type: MSG.PREFS_CHANGED, prefs });
}

/**
 * Ask every open github.com tab to wipe PR detail memory + IndexedDB.
 * Content scripts own the page-origin IDB (`pr-plus-detail-cache`).
 * @returns {Promise<{ tabs: number, cleared: number, failed: number }>}
 */
function clearDetailCacheOnGithubTabs() {
  return new Promise((resolve) => {
    try {
      registeredEnterpriseHosts().then((hosts) => {
        const url = githubTabUrlPatterns(hosts);
        chrome.tabs.query({ url }, (tabs) => {
          void chrome.runtime.lastError;
          const list = Array.isArray(tabs) ? tabs : [];
          if (!list.length) {
            resolve({ tabs: 0, cleared: 0, failed: 0 });
            return;
          }
          let pending = 0;
          let cleared = 0;
          let failed = 0;
          const done = () => {
            if (pending > 0) return;
            resolve({ tabs: list.length, cleared, failed });
          };
          for (const tab of list) {
            if (tab?.id == null) continue;
            pending += 1;
            try {
              chrome.tabs.sendMessage(
                tab.id,
                { type: MSG.CLEAR_DETAIL_CACHE },
                (res) => {
                  const err = chrome.runtime.lastError;
                  if (err || !res?.ok) failed += 1;
                  else cleared += 1;
                  pending -= 1;
                  done();
                }
              );
            } catch {
              failed += 1;
              pending -= 1;
            }
          }
          if (pending === 0) done();
        });
      });
    } catch {
      resolve({ tabs: 0, cleared: 0, failed: 0 });
    }
  });
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;
  if (changes[PRTreeStorage.TOKEN_KEY]) {
    broadcastTokenChanged();
  }
  if (changes[PRTreeStorage.HOST_ACCOUNTS_KEY]) {
    broadcastToGithubTabs({ type: MSG.HOST_ACCOUNTS_CHANGED });
    broadcastTokenChanged();
    void registeredEnterpriseHosts().then((hosts) =>
      syncEnterpriseContentScripts(hosts)
    );
  }
  if (changes[PRTreeStorage.PREFS_KEY]) {
    const prefs = PRTreeStorage.normalizePrefs(
      changes[PRTreeStorage.PREFS_KEY].newValue
    );
    broadcastPrefsChanged(prefs);
  }
});

function fetchImpl() {
  return globalThis.fetch.bind(globalThis);
}

/**
 * In-flight GitHub fetches keyed by content-script requestId.
 * Abort when the modal/sheet closes so network work stops immediately.
 * @type {Map<string, AbortController>}
 */
const activeFetchControllers = new Map();
/**
 * requestIds cancelled before beginTrackedFetch ran (still queued behind
 * exclusive API lock). beginTrackedFetch honors these and starts aborted.
 * @type {Set<string>}
 */
const preCancelledFetchIds = new Set();

function makeAbortError() {
  const err = new Error('The operation was aborted.');
  err.name = 'AbortError';
  return err;
}

function wrapFetchWithSignal(baseFetch, signal) {
  return (url, init = {}) => {
    if (signal.aborted) return Promise.reject(makeAbortError());
    let nextSignal = signal;
    if (init.signal && init.signal !== signal) {
      if (
        typeof AbortSignal !== 'undefined' &&
        typeof AbortSignal.any === 'function'
      ) {
        nextSignal = AbortSignal.any([init.signal, signal]);
      }
    }
    return baseFetch(url, { ...init, signal: nextSignal });
  };
}

function beginTrackedFetch(requestId) {
  // Always track: missing requestId still gets a synthetic id so cancelAll
  // can abort mid-flight work (list fetches, older call sites, etc.).
  const id =
    requestId != null && String(requestId)
      ? String(requestId)
      : `auto-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

  // Cancel arrived before this handler acquired the exclusive lock
  if (preCancelledFetchIds.has(id)) {
    preCancelledFetchIds.delete(id);
    const controller = new AbortController();
    try {
      controller.abort();
    } catch {
      /* ignore */
    }
    return {
      requestId: id,
      controller,
      fetch: wrapFetchWithSignal(fetchImpl(), controller.signal),
    };
  }

  // Supersede any prior controller for the same id
  const prev = activeFetchControllers.get(id);
  if (prev) {
    try {
      prev.abort();
    } catch {
      /* ignore */
    }
  }
  const controller = new AbortController();
  activeFetchControllers.set(id, controller);
  return {
    requestId: id,
    controller,
    fetch: wrapFetchWithSignal(fetchImpl(), controller.signal),
  };
}

function endTrackedFetch(requestId) {
  const id = requestId != null ? String(requestId) : '';
  if (!id) return;
  activeFetchControllers.delete(id);
  preCancelledFetchIds.delete(id);
}

function cancelTrackedFetch(requestId) {
  const id = requestId != null ? String(requestId) : '';
  if (!id) return false;
  // Mark pre-cancelled so a still-queued FETCH_* starts aborted
  preCancelledFetchIds.add(id);
  try {
    setTimeout(() => preCancelledFetchIds.delete(id), 60_000);
  } catch {
    /* ignore */
  }
  const ac = activeFetchControllers.get(id);
  if (ac) {
    try {
      ac.abort();
    } catch {
      /* ignore */
    }
    activeFetchControllers.delete(id);
  }
  return true;
}

function cancelTrackedFetches(requestIds) {
  const ids = Array.isArray(requestIds) ? requestIds : [];
  let n = 0;
  for (const id of ids) {
    if (cancelTrackedFetch(id)) n += 1;
  }
  return n;
}

/** Abort every in-flight tracked GitHub fetch (sheet close belt-and-suspenders). */
function cancelAllTrackedFetches() {
  const ids = [...activeFetchControllers.keys()];
  let n = 0;
  for (const id of ids) {
    if (cancelTrackedFetch(id)) n += 1;
  }
  return n;
}

function isAbortError(err) {
  return (
    err?.name === 'AbortError' ||
    /aborted|AbortError/i.test(String(err?.message || err || ''))
  );
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
  // Bind REST/GraphQL bases for every API-backed message (incl. popup without webHost).
  if (
    message?.type &&
    message.type !== MSG.PING &&
    message.type !== MSG.TOKEN_STATUS &&
    message.type !== MSG.TOKEN_SET &&
    message.type !== MSG.TOKEN_CLEAR
  ) {
    try {
      await applyApiContextFromMessage(message || {});
    } catch {
      /* keep previous / default context */
    }
  }

  switch (message.type) {
    case MSG.PING: {
      return {
        ok: true,
        pong: true,
        hasFetch: typeof PRTreeFetch?.fetchPrDetail === 'function',
        hasStorage: typeof PRTreeStorage?.getGithubTokenStatus === 'function',
        hasEndpoints: typeof PRGithubEndpoints?.resolveGithubEndpoints === 'function',
      };
    }
    case MSG.TOKEN_STATUS: {
      // Host-scoped: enterprise pages report configured when that host has a PAT.
      // Popup (no webHost / github.com) reports the default github.com PAT only.
      const webHost = message.webHost || message.webOrigin || 'github.com';
      const sel = await PRTreeStorage.getTokenForWebHost(webHost);
      if (!sel.token) {
        return {
          ok: true,
          configured: false,
          mask: '',
          source: null,
          host: sel.host,
        };
      }
      return {
        ok: true,
        configured: true,
        mask: PRTreeStorage.maskGithubToken(sel.token),
        source: sel.source,
        host: sel.host,
      };
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
    case MSG.PREFS_GET: {
      const prefs = await PRTreeStorage.getExtensionPrefs();
      const hostAccounts = await PRTreeStorage.getHostAccountsPublic();
      let endpoints = null;
      try {
        endpoints = PRGithubEndpoints.resolveGithubEndpoints({
          webHost: message.webHost || 'github.com',
        });
      } catch {
        endpoints = null;
      }
      return { ok: true, prefs, hostAccounts, endpoints };
    }
    case MSG.PREFS_SET: {
      const patch = message.prefs || message.patch || {};
      // Drop legacy host-list-only field; host+PAT pairs use HOST_ACCOUNT_* messages.
      if (patch && typeof patch === 'object' && 'enterpriseWebHosts' in patch) {
        delete patch.enterpriseWebHosts;
      }
      const prefs = await PRTreeStorage.setExtensionPrefs(patch);
      return { ok: true, prefs };
    }
    case MSG.HOST_ACCOUNTS_LIST: {
      const accounts = await PRTreeStorage.getHostAccountsPublic();
      return {
        ok: true,
        accounts,
        max: PRGithubEndpoints.MAX_HOST_ACCOUNTS || 3,
      };
    }
    case MSG.HOST_ACCOUNT_ADD: {
      const result = await PRTreeStorage.registerHostAccount(
        message.host,
        message.token
      );
      if (!result.ok) {
        return {
          ok: false,
          error: result.error,
          accounts: (result.accounts || []).map((a) => ({
            host: a.host,
            mask: PRTreeStorage.maskGithubToken(a.token),
          })),
        };
      }
      const hosts = result.accounts.map((a) => a.host);
      const permission = await requestEnterprisePermissions(hosts);
      const contentScripts = await syncEnterpriseContentScripts(hosts);
      return {
        ok: true,
        accounts: result.accounts.map((a) => ({
          host: a.host,
          mask: PRTreeStorage.maskGithubToken(a.token),
        })),
        permission,
        contentScripts,
        max: PRGithubEndpoints.MAX_HOST_ACCOUNTS || 3,
      };
    }
    case MSG.HOST_ACCOUNT_REMOVE: {
      const result = await PRTreeStorage.unregisterHostAccount(message.host);
      const hosts = result.accounts.map((a) => a.host);
      const contentScripts = await syncEnterpriseContentScripts(hosts);
      return {
        ok: true,
        accounts: result.accounts.map((a) => ({
          host: a.host,
          mask: PRTreeStorage.maskGithubToken(a.token),
        })),
        contentScripts,
        max: PRGithubEndpoints.MAX_HOST_ACCOUNTS || 3,
      };
    }
    case MSG.CLEAR_DETAIL_CACHE: {
      const result = await clearDetailCacheOnGithubTabs();
      return { ok: true, ...result };
    }
    case MSG.FETCH_OPEN_PULLS: {
      const tracked = beginTrackedFetch(message.requestId);
      try {
        const token = await tokenForMessage(message);
        const prs = await PRTreeFetch.fetchOpenPulls(
          message.owner,
          message.repo,
          tracked.fetch,
          {
            token,
            pagePrNumbers: Array.isArray(message.pagePrNumbers)
              ? message.pagePrNumbers
              : [],
          }
        );
        return { ok: true, prs };
      } catch (err) {
        if (isAbortError(err)) return { ok: false, aborted: true, error: 'aborted' };
        throw err;
      } finally {
        endTrackedFetch(tracked.requestId);
      }
    }
    case MSG.FETCH_DANGLING: {
      const tracked = beginTrackedFetch(message.requestId);
      try {
        const token = await tokenForMessage(message);
        const prs = await PRTreeFetch.fetchDanglingPulls(
          message.owner,
          message.repo,
          Array.isArray(message.numbers) ? message.numbers : [],
          tracked.fetch,
          token
        );
        return { ok: true, prs };
      } catch (err) {
        if (isAbortError(err)) return { ok: false, aborted: true, error: 'aborted' };
        throw err;
      } finally {
        endTrackedFetch(tracked.requestId);
      }
    }
    case MSG.CANCEL_FETCH: {
      const ids = Array.isArray(message.requestIds)
        ? message.requestIds
        : message.requestId != null
          ? [message.requestId]
          : [];
      // cancelAll: kill whatever is mid-GitHub-fetch even if requestId tracking missed
      const cancelled =
        (message.cancelAll ? cancelAllTrackedFetches() : 0) +
        cancelTrackedFetches(ids);
      return { ok: true, cancelled };
    }
    case MSG.FETCH_PR_DETAIL: {
      const tracked = beginTrackedFetch(message.requestId);
      try {
        const token = await tokenForMessage(message);
        // Partial by default: core + first GraphQL threads page (not all pages)
        const detail = await PRTreeFetch.fetchPrDetail(
          message.owner,
          message.repo,
          message.number,
          tracked.fetch,
          token,
          {
            skipReviewThreads: Boolean(message.skipReviewThreads),
            threadsMaxPages:
              message.threadsMaxPages != null ? Number(message.threadsMaxPages) : 1,
          }
        );
        return { ok: true, detail };
      } catch (err) {
        if (isAbortError(err)) return { ok: false, aborted: true, error: 'aborted' };
        throw err;
      } finally {
        endTrackedFetch(tracked.requestId);
      }
    }
    case MSG.FETCH_REVIEW_THREADS_PAGE: {
      const tracked = beginTrackedFetch(message.requestId);
      try {
        const token = await tokenForMessage(message);
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
          tracked.fetch,
          token
        );
        return { ok: true, page };
      } catch (err) {
        if (isAbortError(err)) return { ok: false, aborted: true, error: 'aborted' };
        throw err;
      } finally {
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
        const page = await PRTreeFetch.fetchReviewThreadsByIds(
          message.threadNodeIds || message.ids || [],
          tracked.fetch,
          token
        );
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
          token
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
          { gitattributesText: message.gitattributesText || '' }
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
        token
      );
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
        token
      );
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
        token
      );
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
        token
      );
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
        token
      );
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
        }
      );
      return { ok: true, result };
    }
    case MSG.RESOLVE_REVIEW_THREAD: {
      const token = await tokenForMessage(message);
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
      const token = await tokenForMessage(message);
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
      const token = await tokenForMessage(message);
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
      const token = await tokenForMessage(message);
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
      const token = await tokenForMessage(message);
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
      const token = await tokenForMessage(message);
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
      const token = await tokenForMessage(message);
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
        token
      );
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
        token
      );
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
        token
      );
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
        token
      );
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
        token
      );
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
      if (!token) throw new Error('GitHub PAT required to create labels');
      const result = await PRTreeFetch.createRepoLabel(
        message.owner,
        message.repo,
        {
          name: message.name,
          color: message.color,
          description: message.description,
        },
        fetchImpl(),
        token
      );
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
      if (!token) throw new Error('GitHub PAT required to create milestones');
      const result = await PRTreeFetch.createRepoMilestone(
        message.owner,
        message.repo,
        {
          title: message.title,
          description: message.description,
          state: message.state,
        },
        fetchImpl(),
        token
      );
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
          tracked.fetch,
          token
        );
        return { ok: true, commits };
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
          { gitattributesText: message.gitattributesText || '' }
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
        token
      );
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
        token
      );
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
        token
      );
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
        token
      );
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
        token
      );
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
        token
      );
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
      const token = await tokenForMessage(message);
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

  /**
   * CANCEL_FETCH (and PING) must NOT wait on the exclusive GitHub API queue.
   * Otherwise cancel is serialized behind the in-flight fetch it should abort.
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

  // Return a Promise so Chrome keeps the message port open until settle
  // (preferred over return true + sendResponse, which races SW sleep).
  // Exclusive queue: API base is global; one host's handler must not interleave
  // with another's setGithubApiContext / githubRestUrl calls.
  return withServiceWorkerKeepAlive(() =>
    withTimeout(
      runWithGithubApiExclusive(() => handleMessage(message)),
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
