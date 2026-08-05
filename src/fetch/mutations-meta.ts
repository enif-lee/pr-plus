/** Mutations: PR meta/lifecycle */
import {
  apiGraphql,
  apiJson,
  apiSend,
  githubRestUrl,
  normalizeApiCtx,
} from './http';
import {
  createPendingPullReview,
  ensureViewerPendingReview,
  postReviewCommentViaPendingGraphql,
  replyViaPendingReviewGraphql,
  replyViaThreadGraphql,
  resolveParentCommentNodeId,
} from './pending-review';
import {
  postIssueComment,
  submitPullReview,
  postReviewComment,
  replyToReviewComment,
  resolveReviewThread,
  updatePullState,
  closePullRequest,
  reopenPullRequest,
  deleteReviewComment,
  deleteIssueComment,
} from './mutations-comments';

export async function updatePullRequest(owner: any, repo: any, pullNumber: any, fields: any, fetchImpl: any, token: any, ctx: any = null) {
  ctx = normalizeApiCtx(ctx);
  const body: any = {};
  if (fields?.title != null) body.title = String(fields.title);
  if (fields?.body != null) body.body = String(fields.body);
  if (fields?.base != null) body.base = String(fields.base);
  if (fields?.state != null) body.state = fields.state === 'closed' ? 'closed' : 'open';
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/pulls/${pullNumber}`, ctx),
    fetchImpl,
    token,
    { method: 'PATCH', body }
  );
}

export async function editIssueComment(owner: any, repo: any, commentId: any, body: any, fetchImpl: any, token: any, ctx: any = null) {
  ctx = normalizeApiCtx(ctx);
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/issues/comments/${commentId}`, ctx),
    fetchImpl,
    token,
    { method: 'PATCH', body: { body: String(body || '') } }
  );
}

export async function editReviewComment(owner: any, repo: any, commentId: any, body: any, fetchImpl: any, token: any, ctx: any = null) {
  ctx = normalizeApiCtx(ctx);
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/pulls/comments/${commentId}`, ctx),
    fetchImpl,
    token,
    { method: 'PATCH', body: { body: String(body || '') } }
  );
}

export async function requestReviewers(
  owner,
  repo,
  pullNumber,
  { reviewers = [], teamReviewers = [] },
  fetchImpl,
  token
, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/pulls/${pullNumber}/requested_reviewers`, ctx),
    fetchImpl,
    token,
    {
      method: 'POST',
      body: { reviewers, team_reviewers: teamReviewers },
    }
  );
}

export async function removeReviewers(
  owner,
  repo,
  pullNumber,
  { reviewers = [], teamReviewers = [] },
  fetchImpl,
  token
, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/pulls/${pullNumber}/requested_reviewers`, ctx),
    fetchImpl,
    token,
    {
      method: 'DELETE',
      body: { reviewers, team_reviewers: teamReviewers },
    }
  );
}

export async function addAssignees(owner: any, repo: any, issueNumber: any, assignees: any, fetchImpl: any, token: any, ctx: any = null) {
  ctx = normalizeApiCtx(ctx);
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/issues/${issueNumber}/assignees`, ctx),
    fetchImpl,
    token,
    { method: 'POST', body: { assignees: assignees || [] } }
  );
}

export async function removeAssignees(owner: any, repo: any, issueNumber: any, assignees: any, fetchImpl: any, token: any, ctx: any = null) {
  ctx = normalizeApiCtx(ctx);
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/issues/${issueNumber}/assignees`, ctx),
    fetchImpl,
    token,
    { method: 'DELETE', body: { assignees: assignees || [] } }
  );
}

export async function setIssueLabels(owner: any, repo: any, issueNumber: any, labels: any, fetchImpl: any, token: any, ctx: any = null) {
  ctx = normalizeApiCtx(ctx);
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/issues/${issueNumber}/labels`, ctx),
    fetchImpl,
    token,
    { method: 'PUT', body: { labels: labels || [] } }
  );
}

/**
 * List repository labels (name + color + description) for the label picker.
 * Paginates up to maxPages × 100.
 * @returns {Promise<Array<{ name: string, color: string, description: string }>>}
 */
export async function fetchRepoLabels(owner, repo, fetchImpl, token = null, opts: any = {}) {
  const ctx = normalizeApiCtx(opts?.ctx);
  const perPage = 100;
  const maxPages = Math.max(1, Math.min(10, Number(opts.maxPages) || 5));
  const out = [];
  for (let page = 1; page <= maxPages; page++) {
    const url = githubRestUrl(
      `/repos/${owner}/${repo}/labels?per_page=${perPage}&page=${page}`
    , ctx);
    const batch = await apiJson(url, fetchImpl, token);
    if (!Array.isArray(batch) || !batch.length) break;
    for (const l of batch) {
      const name = String(l?.name || '').trim();
      if (!name) continue;
      out.push({
        name,
        color: String(l?.color || '')
          .trim()
          .replace(/^#/, ''),
        description: String(l?.description || ''),
      });
    }
    if (batch.length < perPage) break;
  }
  return out;
}

/** Stable-ish default color for newly created labels (hex without #). */
export function defaultNewLabelColor(name: any) {
  const palette = [
    'd73a4a',
    '0075ca',
    'a2eeef',
    '7057ff',
    '008672',
    'e4e669',
    'd876e3',
    'fbca04',
    '0e8a16',
    '5319e7',
  ];
  const s = String(name || '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

/**
 * Create a repository label.
 * @returns {Promise<{ name: string, color: string, description: string }>}
 */
export async function createRepoLabel(
  owner,
  repo,
  { name, color, description }: { name?: string; color?: string; description?: string } = {},
  fetchImpl,
  token
, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const rawName = String(name || '').trim();
  if (!rawName) throw new Error('Label name is required');
  const body: any = {
    name: rawName,
    color: String(color || defaultNewLabelColor(rawName))
      .trim()
      .replace(/^#/, ''),
  };
  if (description != null) body.description = String(description);
  const result = await apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/labels`, ctx),
    fetchImpl,
    token,
    { method: 'POST', body }
  );
  return {
    name: String(result?.name || rawName),
    color: String(result?.color || body.color || '')
      .trim()
      .replace(/^#/, ''),
    description: String(result?.description || description || ''),
  };
}

/**
 * List repository milestones (open + closed, limited pages).
 * @returns {Promise<Array<{ number: number, title: string, state: string, description: string }>>}
 */
export async function fetchRepoMilestones(owner, repo, fetchImpl, token = null, opts: any = {}) {
  const ctx = normalizeApiCtx(opts?.ctx);
  const perPage = 100;
  const maxPages = Math.max(1, Math.min(10, Number(opts.maxPages) || 5));
  const state = opts.state || 'all';
  const out = [];
  for (let page = 1; page <= maxPages; page++) {
    const url = githubRestUrl(
      `/repos/${owner}/${repo}/milestones?state=${encodeURIComponent(state)}&per_page=${perPage}&page=${page}&sort=due_on&direction=desc`
    , ctx);
    const batch = await apiJson(url, fetchImpl, token);
    if (!Array.isArray(batch) || !batch.length) break;
    for (const m of batch) {
      const number = Number(m?.number);
      if (!Number.isFinite(number) || number <= 0) continue;
      out.push({
        number,
        title: String(m?.title || `Milestone ${number}`),
        state: String(m?.state || ''),
        description: String(m?.description || ''),
        dueOn: m?.due_on || null,
      });
    }
    if (batch.length < perPage) break;
  }
  return out;
}

/**
 * Create a repository milestone.
 * @returns {Promise<{ number: number, title: string, state: string, description: string }>}
 */
export async function createRepoMilestone(
  owner,
  repo,
  { title, description, state }: { title?: string; description?: string; state?: string } = {},
  fetchImpl,
  token
, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const rawTitle = String(title || '').trim();
  if (!rawTitle) throw new Error('Milestone title is required');
  const body: any = { title: rawTitle, state: state === 'closed' ? 'closed' : 'open' };
  if (description != null) body.description = String(description);
  const result = await apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/milestones`, ctx),
    fetchImpl,
    token,
    { method: 'POST', body }
  );
  return {
    number: Number(result?.number) || 0,
    title: String(result?.title || rawTitle),
    state: String(result?.state || body.state),
    description: String(result?.description || description || ''),
    dueOn: result?.due_on || null,
  };
}

/**
 * List repository tags (paginated). Used to surface tags related to a PR head/commits.
 * @returns {Promise<Array<{ name: string, sha: string, zipballUrl?: string, tarballUrl?: string }>>}
 */
export async function fetchRepoTags(owner, repo, fetchImpl, token = null, opts: any = {}) {
  const ctx = normalizeApiCtx(opts?.ctx);
  const perPage = 100;
  const maxPages = Math.max(1, Math.min(20, Number(opts.maxPages) || 10));
  const out = [];
  for (let page = 1; page <= maxPages; page++) {
    const url = githubRestUrl(
      `/repos/${owner}/${repo}/tags?per_page=${perPage}&page=${page}`
    , ctx);
    const batch = await apiJson(url, fetchImpl, token);
    if (!Array.isArray(batch) || !batch.length) break;
    for (const t of batch) {
      const name = String(t?.name || '').trim();
      const sha = String(t?.commit?.sha || t?.sha || '').trim();
      if (!name) continue;
      out.push({
        name,
        sha,
        zipballUrl: t?.zipball_url || '',
        tarballUrl: t?.tarball_url || '',
      });
    }
    if (batch.length < perPage) break;
  }
  return out;
}

/**
 * Tags whose commit sha is in `shaSet` (PR commits / head).
 * @param {string[]} shas
 * @returns {Promise<Array<{ name: string, sha: string }>>}
 */
export async function fetchTagsForCommits(
  owner,
  repo,
  shas,
  fetchImpl,
  token = null,
  opts: any = {}
) {
  const want = new Set(
    (shas || [])
      .map((s) => String(s || '').trim().toLowerCase())
      .filter(Boolean)
  );
  if (!want.size) return [];
  const tags = await fetchRepoTags(owner, repo, fetchImpl, token, opts);
  return tags.filter((t) => want.has(String(t.sha || '').toLowerCase()));
}

/**
 * Apply a GitHub suggestion: replace lines on head branch via Contents API.
 * @param {{ path: string, headRef: string, startLine: number, endLine: number, suggestion: string, message?: string }} opts
 */
export async function mergePullRequest(
  owner,
  repo,
  pullNumber,
  {
    mergeMethod = 'merge',
    commitTitle,
    commitMessage,
  }: { mergeMethod?: string; commitTitle?: string; commitMessage?: string } = {},
  fetchImpl,
  token
, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const body: any = { merge_method: mergeMethod };
  if (commitTitle != null) body.commit_title = String(commitTitle);
  if (commitMessage != null) body.commit_message = String(commitMessage);
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/pulls/${pullNumber}/merge`, ctx),
    fetchImpl,
    token,
    { method: 'PUT', body }
  );
}

export async function updatePullBranch(
  owner,
  repo,
  pullNumber,
  { expectedHeadSha }: { expectedHeadSha?: string } = {},
  fetchImpl,
  token
, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const body: any = {};
  if (expectedHeadSha) body.expected_head_sha = String(expectedHeadSha);
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/pulls/${pullNumber}/update-branch`, ctx),
    fetchImpl,
    token,
    { method: 'PUT', body }
  );
}

/**
 * Delete a branch ref: DELETE /repos/{o}/{r}/git/refs/heads/{branch}
 * Used post-merge optional "Delete branch".
 */
export async function deleteHeadBranch(
  owner,
  repo,
  branch,
  fetchImpl,
  token,
  ctx = null
) {
  ctx = normalizeApiCtx(ctx);
  const b = String(branch || '')
    .trim()
    .replace(/^refs\/heads\//, '');
  if (!b) throw new Error('Branch name required');
  const branchPath = b
    .split('/')
    .filter(Boolean)
    .map((seg) => encodeURIComponent(seg))
    .join('/');
  return apiSend(
    githubRestUrl(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/refs/heads/${branchPath}`,
      ctx
    ),
    fetchImpl,
    token,
    { method: 'DELETE' }
  );
}

/**
 * Paths the viewer has marked Viewed on this PR (GraphQL viewerViewedState).
 * Pages up to maxPages (default 5 → 500 files).
 * @returns {{ pullRequestId: string|null, viewedPaths: string[] }}
 */
export async function setIssueMilestone(owner: any, repo: any, issueNumber: any, milestoneNumber: any, fetchImpl: any, token: any, ctx: any = null) {
  ctx = normalizeApiCtx(ctx);
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/issues/${issueNumber}`, ctx),
    fetchImpl,
    token,
    {
      method: 'PATCH',
      body: { milestone: milestoneNumber == null ? null : Number(milestoneNumber) },
    }
  );
}

/**
 * Convert PR to draft or mark ready for review (GraphQL; needs PR node_id).
 * @param {'draft'|'ready'} stage
 */
export async function setPullRequestDraftStage(owner: any, repo: any, pullNumber: any, stage: any, fetchImpl: any, token: any, nodeId: any = null, ctx: any = null) {
  ctx = normalizeApiCtx(ctx);
  let id = nodeId;
  if (!id) {
    const pr = await apiJson(
      githubRestUrl(`/repos/${owner}/${repo}/pulls/${pullNumber}`, ctx),
      fetchImpl,
      token
    );
    id = pr?.node_id;
  }
  if (!id) throw new Error('PR node_id unavailable for draft stage change');
  let buildFn = null;
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
    buildFn = mod?.buildDraftStageGraphql;
  } catch {
    buildFn = null;
  }
  const gql = buildFn
    ? buildFn(stage === 'ready' ? 'ready' : 'draft', id)
    : stage === 'ready'
      ? {
          query: `mutation($id:ID!){markPullRequestReadyForReview(input:{pullRequestId:$id}){pullRequest{id isDraft}}}`,
          variables: { id },
        }
      : {
          query: `mutation($id:ID!){convertPullRequestToDraft(input:{pullRequestId:$id}){pullRequest{id isDraft}}}`,
          variables: { id },
        };
  const data = await apiGraphql(gql.query, gql.variables, fetchImpl, token, ctx);
  let parseFn = null;
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
    parseFn = mod?.draftFromStageGraphqlData;
  } catch {
    parseFn = null;
  }
  let draft = null;
  if (typeof parseFn === 'function') {
    draft = parseFn(data);
  } else if (data && typeof data === 'object') {
    const pr =
      data.markPullRequestReadyForReview?.pullRequest ||
      data.convertPullRequestToDraft?.pullRequest ||
      null;
    if (pr && typeof pr.isDraft === 'boolean') draft = pr.isDraft;
  }
  // Fall back to the requested stage so callers always get a boolean draft flag
  if (typeof draft !== 'boolean') {
    draft = stage !== 'ready';
  }
  return { draft: Boolean(draft), data };
}


/**
 * Upload a binary/text file via Contents API (creates or overwrites path on branch).
 * Used for comment attachments when PAT has repo contents write access.
 * @returns {{ downloadUrl: string, htmlUrl: string, path: string, sha: string }}
 */
