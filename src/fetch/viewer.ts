/**
 * Fetch feature unit: viewer
 */
import {
  apiGraphql,
  apiJson,
  apiSend,
  buildApiHeaders,
  decodeBase64Utf8,
  githubRestUrl,
  normalizeApiCtx,
} from './http';
import {
  mapViewerSubscription,
} from './mappers';

export async function fetchViewerViewedPaths(
  owner,
  repo,
  pullNumber,
  fetchImpl,
  token,
  opts: any = {}
) {
  const apiCtx = normalizeApiCtx(opts?.ctx);
  // No token: do not pretend "zero viewed" — callers must check pullRequestId.
  if (!token) {
    return { pullRequestId: null, viewedPaths: [], unauthorized: true };
  }
  const maxPages = Math.max(1, Math.min(20, Number(opts.maxPages) || 5));
  const viewed: string[] = [];
  let cursor: string | null = null;
  let pullRequestId: string | null = null;
  for (let page = 0; page < maxPages; page++) {
    const data = await apiGraphql(
      `query ViewerViewedFiles($owner:String!,$repo:String!,$number:Int!,$cursor:String) {
  repository(owner:$owner, name:$repo) {
    pullRequest(number:$number) {
      id
      files(first:100, after:$cursor) {
        pageInfo { hasNextPage endCursor }
        nodes { path viewerViewedState }
      }
    }
  }
}`,
      {
        owner: String(owner || ''),
        repo: String(repo || ''),
        number: Number(pullNumber) || 0,
        cursor,
      },
      fetchImpl,
      token,
      apiCtx
    );
    const pr = data?.repository?.pullRequest;
    if (!pr) break;
    if (pr.id) pullRequestId = String(pr.id);
    const nodes = pr.files?.nodes || [];
    for (const n of nodes) {
      if (
        String(n?.viewerViewedState || '')
          .toUpperCase() === 'VIEWED' &&
        n?.path
      ) {
        viewed.push(String(n.path));
      }
    }
    if (!pr.files?.pageInfo?.hasNextPage) break;
    cursor = pr.files.pageInfo.endCursor || null;
    if (!cursor) break;
  }
  return { pullRequestId, viewedPaths: viewed };
}

export async function markFileAsViewed(
  pullRequestId,
  path,
  fetchImpl,
  token,
  ctx = null
) {
  ctx = normalizeApiCtx(ctx);
  const data = await apiGraphql(
    `mutation MarkFileAsViewed($input: MarkFileAsViewedInput!) {
  markFileAsViewed(input: $input) {
    pullRequest { id }
  }
}`,
    {
      input: {
        pullRequestId: String(pullRequestId || ''),
        path: String(path || ''),
      },
    },
    fetchImpl,
    token,
    ctx
  );
  return data;
}

export async function unmarkFileAsViewed(
  pullRequestId,
  path,
  fetchImpl,
  token,
  ctx = null
) {
  ctx = normalizeApiCtx(ctx);
  const data = await apiGraphql(
    `mutation UnmarkFileAsViewed($input: UnmarkFileAsViewedInput!) {
  unmarkFileAsViewed(input: $input) {
    pullRequest { id }
  }
}`,
    {
      input: {
        pullRequestId: String(pullRequestId || ''),
        path: String(path || ''),
      },
    },
    fetchImpl,
    token,
    ctx
  );
  return data;
}

/**
 * Resolve GraphQL node id for a pull request (PR_…).
 * Prefer REST `node_id` when available; otherwise look up via GraphQL.
 */
export async function resolvePullRequestNodeId(owner: any, repo: any, pullNumber: any, fetchImpl: any, token: any, nodeId: any = null, ctx: any = null) {
  ctx = normalizeApiCtx(ctx);
  if (nodeId) return String(nodeId);
  const n = Number(pullNumber);
  if (!token || !owner || !repo || !Number.isFinite(n) || n <= 0) return null;
  try {
    // Prefer REST node_id (cheap, same id GraphQL expects)
    const pr = await apiJson(
      githubRestUrl(`/repos/${owner}/${repo}/pulls/${n}`, ctx),
      fetchImpl,
      token
    );
    if (pr?.node_id) return String(pr.node_id);
  } catch {
    /* fall through */
  }
  try {
    const data = await apiGraphql(
      `query($owner:String!,$name:String!,$number:Int!){
  repository(owner:$owner, name:$name) {
    pullRequest(number:$number) { id }
  }
}`,
      { owner: String(owner), name: String(repo), number: n },
      fetchImpl,
      token,
      ctx
    );
    const id = data?.repository?.pullRequest?.id;
    return id ? String(id) : null;
  } catch {
    return null;
  }
}

/**
 * Map GraphQL SubscriptionState → app shape.
 * @param {string|null|undefined} state SUBSCRIBED | UNSUBSCRIBED | IGNORED
 */
export async function setIssueSubscription(
  owner,
  repo,
  issueNumber,
  { subscribed = true, ignored = false, nodeId = null } = {},
  fetchImpl,
  token,
  ctx = null
) {
  ctx = normalizeApiCtx(ctx);
  if (!token) throw new Error('GitHub PAT required for notifications');
  const id = await resolvePullRequestNodeId(
    owner,
    repo,
    issueNumber,
    fetchImpl,
    token,
    nodeId,
    ctx
  );
  if (!id) {
    throw new Error(
      'Could not resolve pull request id for subscription. Refresh and try again.'
    );
  }
  const state = ignored ? 'IGNORED' : subscribed ? 'SUBSCRIBED' : 'UNSUBSCRIBED';
  const data = await apiGraphql(
    `mutation($id:ID!,$state:SubscriptionState!){
  updateSubscription(input:{subscribableId:$id, state:$state}) {
    subscribable {
      ... on PullRequest { id viewerSubscription }
      ... on Issue { id viewerSubscription }
    }
  }
}`,
    { id: String(id), state },
    fetchImpl,
    token
  );
  const vs = data?.updateSubscription?.subscribable?.viewerSubscription;
  return mapViewerSubscription(vs);
}

/** Unsubscribe from PR notifications (GraphQL state UNSUBSCRIBED). */
export async function deleteIssueSubscription(owner: any, repo: any, issueNumber: any, fetchImpl: any, token: any, nodeId: any = null) {
  return setIssueSubscription(
    owner,
    repo,
    issueNumber,
    { subscribed: false, ignored: false, nodeId },
    fetchImpl,
    token
  );
}

/**
 * Read viewer subscription for a PR (GraphQL). Returns null on failure.
 */
export async function fetchPullRequestSubscription(owner: any, repo: any, pullNumber: any, fetchImpl: any, token: any, nodeId: any = null, ctx: any = null) {
  ctx = normalizeApiCtx(ctx);
  if (!token) return null;
  try {
    const id = await resolvePullRequestNodeId(
      owner,
      repo,
      pullNumber,
      fetchImpl,
      token,
      nodeId,
      ctx
    );
    if (!id) return null;
    const data = await apiGraphql(
      `query($id:ID!){
  node(id:$id) {
    ... on PullRequest {
      viewerSubscription
      viewerCanSubscribe
      mergeStateStatus
    }
    ... on Issue { viewerSubscription viewerCanSubscribe }
  }
}`,
      { id: String(id) },
      fetchImpl,
      token,
      ctx
    );
    const node = data?.node || null;
    const vs = node?.viewerSubscription;
    if (!vs) {
      // Still surface mergeStateStatus when present
      if (node?.mergeStateStatus) {
        return {
          subscribed: null,
          mergeStateStatus: String(node.mergeStateStatus || '') || null,
        };
      }
      return null;
    }
    const mapped = mapViewerSubscription(vs);
    if (node?.mergeStateStatus) {
      return {
        ...mapped,
        mergeStateStatus: String(node.mergeStateStatus || '') || null,
      };
    }
    return mapped;
  } catch {
    return null;
  }
}

export async function uploadRepoFile(
  owner,
  repo,
  { path, contentBase64, message, branch },
  fetchImpl,
  token
, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  if (!path || !contentBase64) throw new Error('path and contentBase64 required');
  const encPath = String(path)
    .split('/')
    .map(encodeURIComponent)
    .join('/');
  // Try GET existing sha (overwrite path)
  let sha;
  try {
    const meta = await apiJson(
      githubRestUrl(
        `/repos/${owner}/${repo}/contents/${encPath}${
          branch ? `?ref=${encodeURIComponent(branch)}` : ''
        }`
      , ctx),
      fetchImpl,
      token
    );
    sha = meta?.sha;
  } catch {
    sha = undefined;
  }
  const body: any = {
    message: message || `Upload ${path}`,
    content: String(contentBase64).replace(/\s+/g, ''),
  };
  if (branch) body.branch = branch;
  if (sha) body.sha = sha;
  const result = await apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/contents/${encPath}`, ctx),
    fetchImpl,
    token,
  // @ts-expect-error classic fetch dynamic shapes
    { method: 'PUT', body }
  );
  const content = result?.content || result;
  return {
    downloadUrl: content?.download_url || content?.html_url || '',
    htmlUrl: content?.html_url || content?.download_url || '',
    path: content?.path || path,
    sha: content?.sha || '',
  };
}

/**
 * Fetch a file's text content at a ref (branch or SHA).
 * @returns {{ path: string, ref: string, text: string, sha: string, size: number }}
 */
export async function getRepoFileText(owner, repo, { path, ref }, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  if (!path) throw new Error('path required');
  const rev = ref || 'HEAD';
  const encPath = String(path)
    .split('/')
    .map(encodeURIComponent)
    .join('/');
  const meta = await apiJson(
    githubRestUrl(`/repos/${owner}/${repo}/contents/${encPath}?ref=${encodeURIComponent(rev)}`, ctx),
    fetchImpl,
    token
  );
  if (meta?.type && meta.type !== 'file') {
    throw new Error(`Not a file: ${path}`);
  }
  // Large files may omit content and only provide download_url
  let raw = '';
  if (meta?.content && meta?.encoding === 'base64') {
    raw = decodeBase64Utf8(String(meta.content).replace(/\n/g, ''));
  } else if (meta?.download_url) {
    const res = await fetchImpl(meta.download_url, {
      headers: buildApiHeaders(token),
    });
    if (!res.ok) {
      const err = new Error(`GitHub download ${res.status}: ${res.statusText}`);
      err.status = res.status;
      throw err;
    }
    raw = await res.text();
  } else if (meta?.content) {
    raw = decodeBase64Utf8(String(meta.content).replace(/\n/g, ''));
  }
  return {
    path: meta?.path || path,
    ref: rev,
    text: raw,
    sha: meta?.sha || '',
    size: Number(meta?.size) || raw.length,
  };
}

export async function applyReviewSuggestion(
  owner,
  repo,
  { path, headRef, startLine, endLine, suggestion, message },
  fetchImpl,
  token
, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const ref = headRef || 'HEAD';
  const file = await getRepoFileText(
    owner,
    repo,
    { path, ref },
    fetchImpl,
    token
  );
  const raw = file.text || '';
  let applyFn = null;
  try {
    let mod =
      typeof globalThis !== 'undefined' ? globalThis.PRModalPrEditApi : null;
    if (!mod && typeof require === 'function') {
      try {
        mod = require('./modal/pure/pr-edit-api.js');
      } catch {
        mod = null;
      }
    }
    applyFn = mod?.applySuggestionToFileContent;
  } catch {
    applyFn = null;
  }
  if (!applyFn) throw new Error('applySuggestionToFileContent unavailable');
  const next = applyFn(raw, {
    startLine,
    endLine,
    suggestion,
  });
  // base64 encode
  let contentB64;
  if (typeof Buffer !== 'undefined') {
    contentB64 = Buffer.from(next, 'utf8').toString('base64');
  } else {
    contentB64 = btoa(unescape(encodeURIComponent(next)));
  }
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/contents/${path
      .split('/')
      .map(encodeURIComponent)
      .join('/')}`, ctx),
    fetchImpl,
    token,
    {
      method: 'PUT',
  // @ts-expect-error classic fetch dynamic shapes
      body: {
        message: message || `Apply suggestion to ${path}`,
        content: contentB64,
        branch: ref,
        sha: file.sha,
      },
    }
  );
}

/**
 * Current authenticated user (for "delete own" gating).
 */
export async function fetchViewerLogin(fetchImpl: any, token: any, ctx: any = null) {
  ctx = normalizeApiCtx(ctx);
  if (!token) return null;
  try {
    const me = await apiJson(githubRestUrl('/user', ctx), fetchImpl, token);
    return me?.login || null;
  } catch {
    return null;
  }
}

/**
 * Map GitHub file list (+ optional gitattributes) to modal file rows with collapse hints.
 * @param {Array} files raw API file objects
 * @param {string} [gitattributesText]
 */
