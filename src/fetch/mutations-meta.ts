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

/**
 * Resolve PRRC_… global id for a pull review comment database id.
 * PENDING comments often lack nodeId in the App detail row; GraphQL can
 * still find them under the viewer's PENDING review comments.
 */
async function resolveReviewCommentNodeId(
  owner: any,
  repo: any,
  commentId: any,
  fetchImpl: any,
  token: any,
  ctx: any
): Promise<string | null> {
  const idNum = Number(commentId);
  if (!Number.isFinite(idNum) || idNum <= 0) return null;
  // 1) REST GET — works for published; often 404 for PENDING
  try {
    const raw = await apiJson(
      githubRestUrl(`/repos/${owner}/${repo}/pulls/comments/${idNum}`, ctx),
      fetchImpl,
      token
    );
    if (raw?.node_id && /^PRRC_/i.test(String(raw.node_id))) {
      return String(raw.node_id);
    }
  } catch {
    /* pending → 404 */
  }
  // 2) GraphQL: scan PENDING review comments (last 5 reviews × 50 comments)
  try {
    const data = await apiGraphql(
      `query ResolveReviewCommentNode($owner:String!,$name:String!,$number:Int!) {
        repository(owner:$owner, name:$name) {
          pullRequest(number:$number) {
            reviews(last:10, states:[PENDING]) {
              nodes {
                comments(last:50) {
                  nodes { id databaseId }
                }
              }
            }
          }
        }
      }`,
      {
        owner: String(owner || ''),
        name: String(repo || ''),
        number: Number(ctx?.pullNumber) || 0,
      },
      fetchImpl,
      token,
      ctx
    );
    // number may be 0 if ctx lacks it — also try without states filter below
    const nodes =
      data?.repository?.pullRequest?.reviews?.nodes || [];
    for (const rev of nodes) {
      for (const c of rev?.comments?.nodes || []) {
        if (Number(c?.databaseId) === idNum && c?.id) return String(c.id);
      }
    }
  } catch {
    /* ignore */
  }
  // 3) REST list pending review comments for each PENDING review
  try {
    const reviews = await apiJson(
      githubRestUrl(`/repos/${owner}/${repo}/pulls/comments?per_page=100`, ctx),
      fetchImpl,
      token
    );
    // Note: published list may omit PENDING — use reviews/{id}/comments
  } catch {
    /* ignore */
  }
  try {
    const revs = await apiJson(
      githubRestUrl(
        `/repos/${owner}/${repo}/pulls/${Number(ctx?.pullNumber) || 0}/reviews?per_page=100`,
        ctx
      ),
      fetchImpl,
      token
    );
    const pending = (Array.isArray(revs) ? revs : []).filter(
      (r: any) => String(r?.state || '').toUpperCase() === 'PENDING'
    );
    for (const r of pending) {
      try {
        const comments = await apiJson(
          githubRestUrl(
            `/repos/${owner}/${repo}/pulls/${Number(ctx?.pullNumber) || 0}/reviews/${r.id}/comments?per_page=100`,
            ctx
          ),
          fetchImpl,
          token
        );
        const hit = (Array.isArray(comments) ? comments : []).find(
          (c: any) => Number(c?.id) === idNum
        );
        if (hit?.node_id && /^PRRC_/i.test(String(hit.node_id))) {
          return String(hit.node_id);
        }
      } catch {
        /* continue */
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Edit a pull-request review comment.
 *
 * Published comments: REST PATCH works.
 * PENDING review comments: REST returns 404 — use GraphQL
 * `updatePullRequestReviewComment` with PRRC_ node id.
 *
 * @param opts.nodeId optional PRRC_… (preferred for pending)
 * @param opts.pullNumber optional PR number (helps nodeId resolve)
 */
export async function editReviewComment(
  owner: any,
  repo: any,
  commentId: any,
  body: any,
  fetchImpl: any,
  token: any,
  ctx: any = null,
  opts: { nodeId?: string | null; pullNumber?: number | null } | null = null
) {
  ctx = normalizeApiCtx(ctx);
  const nextBody = String(body || '');
  const nodeIdRaw =
    opts?.nodeId != null && String(opts.nodeId).trim()
      ? String(opts.nodeId).trim()
      : '';
  const preferGraphql = /^PRRC_/i.test(nodeIdRaw);
  // Attach pullNumber into ctx for resolve helpers
  if (opts?.pullNumber != null && Number.isFinite(Number(opts.pullNumber))) {
    ctx = { ...ctx, pullNumber: Number(opts.pullNumber) };
  }

  async function viaGraphql(nodeId: string) {
    const data = await apiGraphql(
      `mutation UpdatePullRequestReviewComment($id: ID!, $body: String!) {
        updatePullRequestReviewComment(
          input: { pullRequestReviewCommentId: $id, body: $body }
        ) {
          pullRequestReviewComment {
            databaseId
            body
            id
          }
        }
      }`,
      { id: nodeId, body: nextBody },
      fetchImpl,
      token,
      ctx
    );
    const node =
      data?.updatePullRequestReviewComment?.pullRequestReviewComment || null;
    if (!node) {
      throw new Error('GraphQL updatePullRequestReviewComment returned empty');
    }
    return {
      id: node.databaseId ?? commentId,
      body: node.body ?? nextBody,
      node_id: node.id || nodeId,
      nodeId: node.id || nodeId,
    };
  }

  if (preferGraphql) {
    return viaGraphql(nodeIdRaw);
  }

  try {
    return await apiSend(
      githubRestUrl(`/repos/${owner}/${repo}/pulls/comments/${commentId}`, ctx),
      fetchImpl,
      token,
      { method: 'PATCH', body: { body: nextBody } }
    );
  } catch (err: any) {
    const status = Number(err?.status || err?.statusCode || 0);
    const msg = String(err?.message || err || '');
    const is404 =
      status === 404 || /\b404\b/.test(msg) || /not\s*found/i.test(msg);
    if (!is404) throw err;
    // PENDING comments 404 on REST — resolve PRRC_ and mutate via GraphQL
    let nodeId = nodeIdRaw;
    if (!/^PRRC_/i.test(nodeId)) {
      nodeId =
        (await resolveReviewCommentNodeId(
          owner,
          repo,
          commentId,
          fetchImpl,
          token,
          ctx
        )) || '';
    }
    if (!/^PRRC_/i.test(nodeId)) {
      throw new Error(
        `GitHub API 404 editing review comment ${commentId} (pending comments need GraphQL). ` +
          `Could not resolve PRRC_ node id — refresh and retry.`
      );
    }
    return viaGraphql(nodeId);
  }
}

export async function requestReviewers(
  owner: any,
  repo: any,
  pullNumber: any,
  { reviewers = [], teamReviewers = [] }: any,
  fetchImpl: any,
  token: any
, ctx: any = null) {
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
  owner: any,
  repo: any,
  pullNumber: any,
  { reviewers = [], teamReviewers = [] }: any,
  fetchImpl: any,
  token: any
, ctx: any = null) {
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
export async function fetchRepoLabels(owner: any, repo: any, fetchImpl: any, token: any = null, opts: any = {}) {
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
  owner: any,
  repo: any,
  { name, color, description }: { name?: string; color?: string; description?: string } = {},
  fetchImpl: any,
  token: any
, ctx: any = null) {
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
export async function fetchRepoMilestones(owner: any, repo: any, fetchImpl: any, token: any = null, opts: any = {}) {
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
  owner: any,
  repo: any,
  { title, description, state }: { title?: string; description?: string; state?: string } = {},
  fetchImpl: any,
  token: any
, ctx: any = null) {
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
export async function fetchRepoTags(owner: any, repo: any, fetchImpl: any, token: any = null, opts: any = {}) {
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
  owner: any,
  repo: any,
  shas: any,
  fetchImpl: any,
  token: any = null,
  opts: any = {}
) {
  const want = new Set(
    (shas || [])
      .map((s: any) => String(s || '').trim().toLowerCase())
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
  owner: any,
  repo: any,
  pullNumber: any,
  {
    mergeMethod = 'merge',
    commitTitle,
    commitMessage,
  }: { mergeMethod?: string; commitTitle?: string; commitMessage?: string } = {},
  fetchImpl: any,
  token: any
, ctx: any = null) {
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
  owner: any,
  repo: any,
  pullNumber: any,
  { expectedHeadSha }: { expectedHeadSha?: string } = {},
  fetchImpl: any,
  token: any
, ctx: any = null) {
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
  owner: any,
  repo: any,
  branch: any,
  fetchImpl: any,
  token: any,
  ctx: any = null
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
      typeof globalThis !== 'undefined' ? (globalThis as any).PRModalPrEditApi : null;
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
      typeof globalThis !== 'undefined' ? (globalThis as any).PRModalPrEditApi : null;
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
