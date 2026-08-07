/** SW unit: sw-enterprise.ts */
/* global PRTreeStorage, PRTreeFetch, PRModalCollapse, PRGithubEndpoints */

export const ENTERPRISE_CS_ID = 'prp-enterprise-hosts';
export const CONTENT_SCRIPT_JS = [
  'src/tree.js',
  'src/dom.js',
  'src/pr-list-focus.js',
  'src/pulls-palette.js',
  'src/github-endpoints.js',
  'src/content-bridge.js',
  'src/content-bootstrap.js',
  'src/onboarding.js',
  'src/content.js',
  'src/modal/pure/detail-idb-cache.js',
  'src/modal/pure/detail-cache.js',
  'src/modal/pure/detail-merge.js',
  'src/modal/pure/detail-store.js',
  'src/modal/pure/load-progress.js',
  'src/modal/pure/page-embed.js',
  'src/modal/pure/floating-scrollbar.js',
  'src/modal/pure/auto-refresh.js',
  'src/modal/dist/pr-modal.bundle.js',
  'src/pr-modal-host.js',
];

/**
 * Stateless API context from RPC message (webHost from content page).
 * No process-global mutation — pass returned ctx into every PRTreeFetch call.
 * @param {object|null|undefined} message
 */
export function apiCtxFromMessage(message: any) {
  const webHost = message?.webHost || message?.webOrigin || 'github.com';
  if (typeof PRGithubEndpoints?.resolveGithubEndpoints === 'function') {
    return PRGithubEndpoints.resolveGithubEndpoints({ webHost });
  }
  if (typeof PRGithubEndpoints?.normalizeApiCtx === 'function') {
    return PRGithubEndpoints.normalizeApiCtx({ webHost });
  }
  return {
    kind: 'dotcom',
    webHost: 'github.com',
    webOrigin: 'https://github.com',
    restBase: 'https://api.github.com',
    graphqlUrl: 'https://api.github.com/graphql',
  };
}

/**
 * PAT for this message's web host.
 * github.com → default token; registered enterprise → host pair; else null.
 */
export async function tokenForMessage(message: any) {
  const webHost = message?.webHost || message?.webOrigin || 'github.com';
  const sel = await PRTreeStorage.getTokenForWebHost(webHost);
  return sel.token;
}

/** Registered enterprise hostnames (no tokens) for tab query / content scripts. */
export async function registeredEnterpriseHosts() {
  return PRTreeStorage.getHostAccountHosts();
}

export function githubTabUrlPatterns(enterpriseHosts: any) {
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
export let enterpriseCsSyncChain = Promise.resolve();

export async function syncEnterpriseContentScripts(enterpriseHosts: any) {
  const run = () => syncEnterpriseContentScriptsImpl(enterpriseHosts);
  // Always continue the chain even if a prior sync rejected
  const next = enterpriseCsSyncChain.then(run, run);
  enterpriseCsSyncChain = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

export async function syncEnterpriseContentScriptsImpl(enterpriseHosts: any) {
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

export async function requestEnterprisePermissions(enterpriseHosts: any) {
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
  const list = [...(origins as any)];
  if (!list.length) return { granted: true, origins: [] };
  return new Promise((resolve) => {
    chrome.permissions.request({ origins: list }, (granted) => {
      const err = chrome.runtime.lastError;
      if (err) resolve({ granted: false, error: err.message, origins: list });
      else resolve({ granted: Boolean(granted), origins: list });
    });
  });
}

export const MSG = {
  /** Lightweight wake / health check (content scripts retry against this). */
  PING: 'PR_TREE_PING',
  TOKEN_STATUS: 'PR_TREE_TOKEN_STATUS',
  TOKEN_SET: 'PR_TREE_TOKEN_SET',
  TOKEN_CLEAR: 'PR_TREE_TOKEN_CLEAR',
  TOKEN_CHANGED: 'PR_TREE_TOKEN_CHANGED',
  PREFS_GET: 'PR_TREE_PREFS_GET',
  PREFS_SET: 'PR_TREE_PREFS_SET',
  PREFS_CHANGED: 'PR_TREE_PREFS_CHANGED',
  RATE_LIMIT_GET: 'PR_TREE_RATE_LIMIT_GET',
  RATE_LIMIT_CHANGED: 'PR_TREE_RATE_LIMIT_CHANGED',
  /** GraphQL per-query cost observation log (primary points). */
  GQL_COST_LOG_GET: 'PR_TREE_GQL_COST_LOG_GET',
  GQL_COST_LOG_CLEAR: 'PR_TREE_GQL_COST_LOG_CLEAR',
  ONBOARDING_GET: 'PR_TREE_ONBOARDING_GET',
  ONBOARDING_SET: 'PR_TREE_ONBOARDING_SET',
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
  MINIMIZE_COMMENT: 'PR_TREE_MINIMIZE_COMMENT',
  UNMINIMIZE_COMMENT: 'PR_TREE_UNMINIMIZE_COMMENT',
  TOGGLE_COMMENT_REACTION: 'PR_TREE_TOGGLE_COMMENT_REACTION',
  FETCH_REACTABLE_REACTORS: 'PR_TREE_FETCH_REACTABLE_REACTORS',
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
  FETCH_PR_COMMITS: 'PR_TREE_FETCH_PR_COMMITS',
  FETCH_PR_FILES: 'PR_TREE_FETCH_PR_FILES',
  FETCH_PR_ISSUE_COMMENTS: 'PR_TREE_FETCH_PR_ISSUE_COMMENTS',
  FETCH_PR_TIMELINE_EVENTS: 'PR_TREE_FETCH_PR_TIMELINE_EVENTS',
  FETCH_PR_TIMELINE_ITEMS: 'PR_TREE_FETCH_PR_TIMELINE_ITEMS',
  FETCH_PR_HEAD_PROBE: 'PR_TREE_FETCH_PR_HEAD_PROBE',
  FETCH_PR_REVIEWS: 'PR_TREE_FETCH_PR_REVIEWS',
  FETCH_PR_CHECKS: 'PR_TREE_FETCH_PR_CHECKS',
  FETCH_PR_DEVELOPMENT: 'PR_TREE_FETCH_PR_DEVELOPMENT',
  FETCH_ALL_PR_FILES: 'PR_TREE_FETCH_ALL_PR_FILES',
  APPLY_SUGGESTION: 'PR_TREE_APPLY_SUGGESTION',
  GET_REPO_FILE_TEXT: 'PR_TREE_GET_REPO_FILE_TEXT',
  MERGE_PULL: 'PR_TREE_MERGE_PULL',
  UPDATE_BRANCH: 'PR_TREE_UPDATE_BRANCH',
  DELETE_HEAD_BRANCH: 'PR_TREE_DELETE_HEAD_BRANCH',
  FETCH_VIEWER_VIEWED_PATHS: 'PR_TREE_FETCH_VIEWER_VIEWED_PATHS',
  MARK_FILE_VIEWED: 'PR_TREE_MARK_FILE_VIEWED',
  UNMARK_FILE_VIEWED: 'PR_TREE_UNMARK_FILE_VIEWED',
  SET_SUBSCRIPTION: 'PR_TREE_SET_SUBSCRIPTION',
  DELETE_SUBSCRIPTION: 'PR_TREE_DELETE_SUBSCRIPTION',
  SET_MILESTONE: 'PR_TREE_SET_MILESTONE',
  SET_DRAFT_STAGE: 'PR_TREE_SET_DRAFT_STAGE',
  UPLOAD_REPO_FILE: 'PR_TREE_UPLOAD_REPO_FILE',
};

/** Max time for one SW message (GitHub multi-request detail can be slow). */
export const MESSAGE_TIMEOUT_MS = 120_000;

export async function rehydrateEnterpriseScripts() {
  try {
    const hosts = await registeredEnterpriseHosts();
    await syncEnterpriseContentScripts(hosts);
  } catch (err) {
    console.warn('[pr+] enterprise content scripts', err?.message || err);
  }
}

/** First-run destination after Chrome Web Store / sideload install (onboarding uses PR #1). */
export const INSTALL_PULLS_URL = 'https://github.com/enif-lee/pr-plus/pulls';

try {
  chrome.runtime.onInstalled.addListener((details) => {
    void rehydrateEnterpriseScripts();
    // Fresh install only — not update / chrome.runtime.reload()
    if (details?.reason === 'install') {
      try {
        chrome.tabs.create({ url: INSTALL_PULLS_URL });
      } catch (err) {
        console.warn('[pr+] open install pulls tab failed', err?.message || err);
      }
    }
  });
  chrome.runtime.onStartup.addListener(() => {
    void rehydrateEnterpriseScripts();
  });
} catch {
  /* ignore */
}

// Cold SW wake: re-register enterprise hosts from storage
void rehydrateEnterpriseScripts();

