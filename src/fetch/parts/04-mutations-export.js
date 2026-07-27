function mapGraphqlReviewCommentToRest(c, fallback = {}) {
  if (!c) return null;
  return {
    id: c.databaseId ?? fallback.id ?? null,
    node_id: c.id || null,
    body: c.body || fallback.body || '',
    path: c.path || fallback.path || '',
    line: c.line ?? fallback.line ?? null,
    original_line: c.originalLine ?? null,
    start_line: c.startLine ?? fallback.startLine ?? null,
    side: c.side || fallback.side || 'RIGHT',
    start_side: c.startSide || null,
    diff_hunk: c.diffHunk || '',
    created_at: c.createdAt || fallback.createdAt || null,
    in_reply_to_id:
      c.replyTo?.databaseId ??
      c.replyTo?.id ??
      fallback.inReplyToId ??
      fallback.in_reply_to_id ??
      null,
    user: {
      login: c.author?.login || fallback.author || '',
      avatar_url: c.author?.avatarUrl || fallback.avatarUrl || '',
    },
    pull_request_review_id: c.pullRequestReview?.databaseId ?? null,
  };
}

/**
 * GraphQL: addPullRequestReviewThreadReply — works with or without a pending
 * review (attaches to pending when one exists).
 */
async function replyViaThreadGraphql(threadNodeId, body, fetchImpl, token, fallback = {}, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const data = await apiGraphql(
    `mutation($id:ID!,$body:String!){
      addPullRequestReviewThreadReply(input:{pullRequestReviewThreadId:$id,body:$body}){
        comment {
          id
          databaseId
          body
          path
          diffHunk
          createdAt
          author { login avatarUrl }
          replyTo { databaseId }
          pullRequestReview { databaseId }
        }
      }
    }`,
    { id: String(threadNodeId), body: String(body) },
    fetchImpl,
    token,
    ctx
  );
  const c = data?.addPullRequestReviewThreadReply?.comment;
  if (!c) throw new Error('GraphQL thread reply returned no comment');
  return mapGraphqlReviewCommentToRest(c, fallback);
}

/**
 * GraphQL: addPullRequestReviewComment on an existing PENDING review.
 */
async function replyViaPendingReviewGraphql(
  pendingReviewNodeId,
  parentCommentNodeId,
  body,
  fetchImpl,
  token,
  fallback = {},
  ctx = null
) {
  ctx = normalizeApiCtx(ctx);
  const data = await apiGraphql(
    `mutation($review:ID!,$body:String!,$inReplyTo:ID!){
      addPullRequestReviewComment(input:{
        pullRequestReviewId:$review
        body:$body
        inReplyTo:$inReplyTo
      }){
        comment {
          id
          databaseId
          body
          path
          diffHunk
          createdAt
          author { login avatarUrl }
          replyTo { databaseId }
          pullRequestReview { databaseId }
        }
      }
    }`,
    {
      review: String(pendingReviewNodeId),
      body: String(body),
      inReplyTo: String(parentCommentNodeId),
    },
    fetchImpl,
    token
  );
  const c = data?.addPullRequestReviewComment?.comment;
  if (!c) throw new Error('GraphQL pending-review reply returned no comment');
  return mapGraphqlReviewCommentToRest(c, fallback);
}

/**
 * Resolve parent comment GraphQL node id (PRRC_…) for pending-review replies.
 * Published comments: GET /pulls/comments/{id}.
 * PENDING comments are omitted from that endpoint (404) — fall back to the
 * viewer's pending-review comment list (or a known node id from UI state).
 */
async function resolveParentCommentNodeId(
  owner,
  repo,
  parentId,
  fetchImpl,
  token,
  knownNodeId,
  pullNumber = null
, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  if (knownNodeId) return String(knownNodeId);
  const id = Math.floor(Number(parentId));
  if (!Number.isFinite(id) || id <= 0) return null;
  try {
    const parent = await apiJson(
      githubRestUrl(`/repos/${owner}/${repo}/pulls/comments/${id}`, ctx),
      fetchImpl,
      token
    );
    if (parent?.node_id) return String(parent.node_id);
  } catch {
    /* pending comments 404 here — try pending review bundle below */
  }
  if (pullNumber == null || !token) return null;
  try {
    const { comments } = await fetchViewerPendingReviewBundle(
      owner,
      repo,
      pullNumber,
      fetchImpl,
      token
    );
    const hit = (comments || []).find(
      (c) => c && Number(c.id) === id && (c.nodeId || c.node_id)
    );
    if (hit) return String(hit.nodeId || hit.node_id);
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Reply to an existing pull request review comment.
 *
 * mode:
 * - `comment` (default): publish immediately when no pending review; if a
 *   PENDING review exists, GitHub only allows attaching to it (shown as pending).
 * - `pending` ("Start review" / "Add comment"): always attach to the viewer's
 *   PENDING review, creating one if needed.
 *
 * REST POST /comments and /replies 422 when a pending review already exists:
 * "user_id can only have one pending review per pull request".
 *
 * @param {object} [opts]
 * @param {'comment'|'pending'} [opts.mode]
 * @param {string} [opts.threadNodeId] GraphQL PRRT_… id
 * @param {string} [opts.parentNodeId] GraphQL PRRC_… id of parent comment
 * @param {string} [opts.commitId] head SHA when creating a new pending review
 */
async function replyToReviewComment(
  owner,
  repo,
  pullNumber,
  commentId,
  body,
  fetchImpl,
  token,
  opts = {}
) {
  const ctx = normalizeApiCtx(opts?.ctx);
  const text = String(body || '').trim();
  if (!text) throw new Error('Reply body is required');
  const parentId = Number(commentId);
  if (!Number.isFinite(parentId) || parentId <= 0) {
    throw new Error('Invalid review comment id for reply');
  }
  const n = Number(pullNumber);
  const mode = opts?.mode === 'pending' ? 'pending' : 'comment';
  const threadNodeId = opts?.threadNodeId || null;
  let parentNodeId = opts?.parentNodeId || null;
  const fallback = {
    body: text,
    inReplyToId: Math.floor(parentId),
    path: opts?.path || '',
    line: opts?.line ?? null,
    side: opts?.side || 'RIGHT',
  };

  /**
   * Attach reply onto viewer's PENDING review via GraphQL.
   * Prefer thread reply (PRRT_…) when available — works for pending threads and
   * does not need the parent PRRC_ id (which REST cannot resolve for PENDING
   * comments: GET /pulls/comments/{id} → 404).
   * Uses ensureViewerPendingReview (create + 422 recover + dead-node re-GET).
   */
  async function attachReplyToPending({ createIfMissing }) {
    const pending = await ensureViewerPendingReview(
      owner,
      repo,
      n,
      {
        commitId: opts?.commitId || null,
        createIfMissing: Boolean(createIfMissing),
      },
      fetchImpl,
      token
    );
    if (!pending?.node_id && !threadNodeId) return null;

    // 1) Thread reply — only needs pullRequestReviewThreadId
    if (threadNodeId) {
      try {
        const raw = await replyViaThreadGraphql(
          threadNodeId,
          text,
          fetchImpl,
          token,
          fallback
        );
        return {
          ...raw,
          pending: true,
          pendingReviewId: raw.pendingReviewId || pending?.id || null,
        };
      } catch {
        /* fall through to inReplyTo path */
      }
    }

    if (!pending?.node_id) return null;

    // 2) inReplyTo on the PENDING review — needs parent PRRC_ node id
    parentNodeId = await resolveParentCommentNodeId(
      owner,
      repo,
      parentId,
      fetchImpl,
      token,
      parentNodeId,
      n
    );
    if (!parentNodeId) {
      throw new Error(
        'Cannot reply while a pending review exists (missing parent comment node id).'
      );
    }
    try {
      const raw = await replyViaPendingReviewGraphql(
        pending.node_id,
        parentNodeId,
        text,
        fetchImpl,
        token,
        fallback
      );
      return { ...raw, pending: true, pendingReviewId: pending.id };
    } catch (err) {
      // Discarded/stale review node — create or re-find and retry once
      const msg = String(err?.message || err || '');
      if (
        !/Could not resolve to a node|global id|NOT_FOUND|Could not find/i.test(msg)
      ) {
        throw err;
      }
      let next = null;
      try {
        const created = await createPendingPullReview(
          owner,
          repo,
          n,
          { commitId: opts?.commitId || null },
          fetchImpl,
          token
        );
        next = {
          id: Number(created?.id),
          node_id: created?.node_id || null,
        };
      } catch (createErr) {
        if (
          createErr?.status === 422 ||
          /one pending review/i.test(String(createErr?.message || ''))
        ) {
          next = await ensureViewerPendingReview(
            owner,
            repo,
            n,
            { commitId: opts?.commitId || null, createIfMissing: false },
            fetchImpl,
            token
          );
        } else {
          throw createErr;
        }
      }
      if (!next?.node_id) throw err;
      const raw = await replyViaPendingReviewGraphql(
        next.node_id,
        parentNodeId,
        text,
        fetchImpl,
        token,
        fallback
      );
      return { ...raw, pending: true, pendingReviewId: next.id };
    }
  }

  // ── Start review / Add comment: always land on a PENDING review ──
  if (mode === 'pending') {
    const attached = await attachReplyToPending({ createIfMissing: true });
    if (attached) return attached;
    throw new Error(
      'Could not start or find a pending review for this reply. Try Discard any leftover pending review, then retry.'
    );
  }

  // ── Comment (immediate when possible) ──
  // If a PENDING review already exists, REST replies 422 — attach via GraphQL.
  const existingPending = await ensureViewerPendingReview(
    owner,
    repo,
    n,
    { createIfMissing: false },
    fetchImpl,
    token
  );
  if (existingPending?.node_id) {
    const attached = await attachReplyToPending({ createIfMissing: false });
    if (attached) return attached;
  }

  // Prefer GraphQL thread reply when we have the thread id (published path).
  if (threadNodeId) {
    try {
      const raw = await replyViaThreadGraphql(
        threadNodeId,
        text,
        fetchImpl,
        token,
        fallback
      );
      return { ...raw, pending: false };
    } catch {
      /* fall through to REST */
    }
  }

  // No pending review: REST dedicated replies endpoint (published immediately)
  try {
    return await apiSend(
      githubRestUrl(`/repos/${owner}/${repo}/pulls/${n}/comments/${Math.floor(parentId)}/replies`, ctx),
      fetchImpl,
      token,
      { method: 'POST', body: { body: text } }
    );
  } catch (err) {
    // Race: PENDING appeared between find and REST POST
    const msg = String(err?.message || err || '');
    if (
      err?.status === 422 ||
      /one pending review/i.test(msg) ||
      /Unprocessable Entity/i.test(msg)
    ) {
      const attached = await attachReplyToPending({ createIfMissing: false });
      if (attached) return attached;
    }
    throw err;
  }
}

/**
 * Resolve or unresolve a pull request review thread via GraphQL.
 * Uses apiGraphql so body.errors (HTTP 200) surface as thrown errors.
 * @param {string} threadNodeId GraphQL id (PRRT_…)
 * @param {boolean} [resolved=true]
 */
async function resolveReviewThread(threadNodeId, resolved, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  if (!threadNodeId) throw new Error('threadNodeId required to resolve review thread');
  const mutation = resolved
    ? `mutation($id:ID!){ resolveReviewThread(input:{threadId:$id}){ thread { id isResolved } } }`
    : `mutation($id:ID!){ unresolveReviewThread(input:{threadId:$id}){ thread { id isResolved } } }`;
  return apiGraphql(
    mutation,
    { id: threadNodeId },
    fetchImpl,
    token,
    ctx
  );
}

/**
 * Close or reopen a pull request.
 * @param {'open'|'closed'} state
 */
async function updatePullState(owner, repo, pullNumber, state, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const next = state === 'closed' ? 'closed' : 'open';
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/pulls/${pullNumber}`, ctx),
    fetchImpl,
    token,
    { method: 'PATCH', body: { state: next } }
  );
}

async function closePullRequest(owner, repo, pullNumber, fetchImpl, token) {
  return updatePullState(owner, repo, pullNumber, 'closed', fetchImpl, token);
}

async function reopenPullRequest(owner, repo, pullNumber, fetchImpl, token) {
  return updatePullState(owner, repo, pullNumber, 'open', fetchImpl, token);
}

/**
 * Delete a pull request review comment (own comments only on GitHub).
 * DELETE /repos/{owner}/{repo}/pulls/comments/{comment_id}
 */
async function deleteReviewComment(owner, repo, commentId, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/pulls/comments/${commentId}`, ctx),
    fetchImpl,
    token,
    { method: 'DELETE' }
  );
}

/**
 * Delete an issue comment on the PR conversation.
 * DELETE /repos/{owner}/{repo}/issues/comments/{comment_id}
 */
async function deleteIssueComment(owner, repo, commentId, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/issues/comments/${commentId}`, ctx),
    fetchImpl,
    token,
    { method: 'DELETE' }
  );
}

async function updatePullRequest(owner, repo, pullNumber, fields, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const body = {};
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

async function editIssueComment(owner, repo, commentId, body, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/issues/comments/${commentId}`, ctx),
    fetchImpl,
    token,
    { method: 'PATCH', body: { body: String(body || '') } }
  );
}

async function editReviewComment(owner, repo, commentId, body, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/pulls/comments/${commentId}`, ctx),
    fetchImpl,
    token,
    { method: 'PATCH', body: { body: String(body || '') } }
  );
}

async function requestReviewers(
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

async function removeReviewers(
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

async function addAssignees(owner, repo, issueNumber, assignees, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/issues/${issueNumber}/assignees`, ctx),
    fetchImpl,
    token,
    { method: 'POST', body: { assignees: assignees || [] } }
  );
}

async function removeAssignees(owner, repo, issueNumber, assignees, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/issues/${issueNumber}/assignees`, ctx),
    fetchImpl,
    token,
    { method: 'DELETE', body: { assignees: assignees || [] } }
  );
}

async function setIssueLabels(owner, repo, issueNumber, labels, fetchImpl, token, ctx = null) {
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
async function fetchRepoLabels(owner, repo, fetchImpl, token = null, opts = {}) {
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
function defaultNewLabelColor(name) {
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
async function createRepoLabel(
  owner,
  repo,
  { name, color, description } = {},
  fetchImpl,
  token
, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const rawName = String(name || '').trim();
  if (!rawName) throw new Error('Label name is required');
  const body = {
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
async function fetchRepoMilestones(owner, repo, fetchImpl, token = null, opts = {}) {
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
async function createRepoMilestone(
  owner,
  repo,
  { title, description, state } = {},
  fetchImpl,
  token
, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const rawTitle = String(title || '').trim();
  if (!rawTitle) throw new Error('Milestone title is required');
  const body = { title: rawTitle, state: state === 'closed' ? 'closed' : 'open' };
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
async function fetchRepoTags(owner, repo, fetchImpl, token = null, opts = {}) {
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
async function fetchTagsForCommits(
  owner,
  repo,
  shas,
  fetchImpl,
  token = null,
  opts = {}
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
async function mergePullRequest(
  owner,
  repo,
  pullNumber,
  { mergeMethod = 'merge', commitTitle, commitMessage } = {},
  fetchImpl,
  token
, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const body = { merge_method: mergeMethod };
  if (commitTitle != null) body.commit_title = String(commitTitle);
  if (commitMessage != null) body.commit_message = String(commitMessage);
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/pulls/${pullNumber}/merge`, ctx),
    fetchImpl,
    token,
    { method: 'PUT', body }
  );
}

async function updatePullBranch(
  owner,
  repo,
  pullNumber,
  { expectedHeadSha } = {},
  fetchImpl,
  token
, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const body = {};
  if (expectedHeadSha) body.expected_head_sha = String(expectedHeadSha);
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/pulls/${pullNumber}/update-branch`, ctx),
    fetchImpl,
    token,
    { method: 'PUT', body }
  );
}

/**
 * Resolve GraphQL node id for a pull request (PR_…).
 * Prefer REST `node_id` when available; otherwise look up via GraphQL.
 */
async function resolvePullRequestNodeId(
  owner,
  repo,
  pullNumber,
  fetchImpl,
  token,
  nodeId = null
, ctx = null) {
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
function mapViewerSubscription(state) {
  const s = String(state || '').toUpperCase();
  if (s === 'SUBSCRIBED') return { subscribed: true, ignored: false, viewerSubscription: s };
  if (s === 'IGNORED') return { subscribed: false, ignored: true, viewerSubscription: s };
  if (s === 'UNSUBSCRIBED') {
    return { subscribed: false, ignored: false, viewerSubscription: s };
  }
  return { subscribed: null, ignored: false, viewerSubscription: s || null };
}

/**
 * Issue/PR thread subscription via GraphQL updateSubscription.
 * REST `/issues/{n}/subscription` is gone / 404 for many tokens — use GraphQL.
 *
 * @param {object} [opts]
 * @param {boolean} [opts.subscribed=true]
 * @param {boolean} [opts.ignored=false]
 * @param {string|null} [opts.nodeId] PR GraphQL id (detail.nodeId)
 */
async function setIssueSubscription(
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
async function deleteIssueSubscription(
  owner,
  repo,
  issueNumber,
  fetchImpl,
  token,
  nodeId = null
) {
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
async function fetchPullRequestSubscription(
  owner,
  repo,
  pullNumber,
  fetchImpl,
  token,
  nodeId = null,
  ctx = null
) {
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
    ... on PullRequest { viewerSubscription viewerCanSubscribe }
    ... on Issue { viewerSubscription viewerCanSubscribe }
  }
}`,
      { id: String(id) },
      fetchImpl,
      token,
      ctx
    );
    const vs = data?.node?.viewerSubscription;
    if (!vs) return null;
    return mapViewerSubscription(vs);
  } catch {
    return null;
  }
}

async function setIssueMilestone(owner, repo, issueNumber, milestoneNumber, fetchImpl, token, ctx = null) {
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
async function setPullRequestDraftStage(
  owner,
  repo,
  pullNumber,
  stage,
  fetchImpl,
  token,
  nodeId = null
, ctx = null) {
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
async function uploadRepoFile(
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
  const body = {
    message: message || `Upload ${path}`,
    content: String(contentBase64).replace(/\s+/g, ''),
  };
  if (branch) body.branch = branch;
  if (sha) body.sha = sha;
  const result = await apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/contents/${encPath}`, ctx),
    fetchImpl,
    token,
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
async function getRepoFileText(owner, repo, { path, ref }, fetchImpl, token, ctx = null) {
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

async function applyReviewSuggestion(
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
async function fetchViewerLogin(fetchImpl, token, ctx = null) {
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
function mapAndAnnotateFiles(files, gitattributesText = '') {
  const mappedFiles = (Array.isArray(files) ? files : []).map((f) => ({
    filename: f.filename,
    status: f.status,
    additions: f.additions,
    deletions: f.deletions,
    changes: f.changes,
    patch: f.patch || '',
    // Preserve media URLs for image preview / binary classification
    raw_url: f.raw_url || f.rawUrl || '',
    blob_url: f.blob_url || f.blobUrl || '',
    contents_url: f.contents_url || f.contentsUrl || '',
    sha: f.sha || '',
    previous_filename: f.previous_filename || f.previousFilename || '',
  }));

  let filesOut;
  try {
    let collapse = typeof globalThis !== 'undefined' ? globalThis.PRModalCollapse : null;
    if (!collapse && typeof require === 'function') {
      try {
        collapse = require('./modal/pure/collapse.js');
      } catch {
        collapse = null;
      }
    }
    if (collapse?.annotateFilesForCollapse) {
      filesOut = collapse.annotateFilesForCollapse(mappedFiles, gitattributesText);
    }
  } catch {
    filesOut = null;
  }
  if (!filesOut) {
    const LARGE = 5000;
    filesOut = mappedFiles.map((f) => {
      const path = f.filename || '';
      const isImage =
        /\.(png|jpe?g|gif|webp|bmp|svg|ico|avif)$/i.test(path);
      const hasPatch = Boolean(f.patch);
      const kind = isImage ? 'image' : hasPatch ? 'text' : 'binary';
      return {
        ...f,
        fileKind: kind,
        openableAsText: kind === 'text',
        renderImage: kind === 'image',
        defaultCollapsed:
          kind === 'binary' ||
          (f.changes || 0) >= LARGE ||
          /package-lock\.json$|yarn\.lock$|\.min\.(js|css)$|\.bundle\.js$/i.test(
            path
          ),
      };
    });
  }
  return filesOut;
}

/**
 * Files+patches for a commit or commit range via GitHub compare API.
 * Use base...head (triple-dot) for merge-base style PR commit diffs.
 * @returns {Promise<{ files: Array, base: string, head: string, status?: string, aheadBy?: number, behindBy?: number, totalCommits?: number }>}
 */
async function fetchCompareFiles(owner, repo, base, head, fetchImpl, token = null, options = {}) {
  const ctx = normalizeApiCtx(options?.ctx);
  const o = String(owner || '').trim();
  const r = String(repo || '').trim();
  const b = String(base || '').trim();
  const h = String(head || '').trim();
  if (!o || !r || !b || !h) {
    throw new Error('owner, repo, base, and head are required for compare');
  }
  const gitattributesText = String(options.gitattributesText || '');
  const url = githubRestUrl(`/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}/compare/${encodeURIComponent(b)}...${encodeURIComponent(h)}`, ctx);
  const data = await apiJson(url, fetchImpl, token);
  const files = mapAndAnnotateFiles(data?.files || [], gitattributesText);
  return {
    files,
    base: b,
    head: h,
    status: data?.status || null,
    aheadBy: data?.ahead_by ?? null,
    behindBy: data?.behind_by ?? null,
    totalCommits: data?.total_commits ?? (Array.isArray(data?.commits) ? data.commits.length : null),
    truncated: Boolean(data?.files && data.files.length >= 300),
  };
}

const fetchApi = {
  normalizeApiCtx,
  mapApiPullRequest,
  buildApiHeaders,
  findDanglingPrNumbers,
  mapWithConcurrency,
  fetchOpenPullsPublic,
  fetchPullByNumber,
  fetchDanglingPulls,
  fetchRepoAutolinks,
  buildAutolinkUrl,
  matchAutolinksInText,
  prMatchText,
  attachMagicLinks,
  fetchOpenPulls,
  fetchPrDetail,
  fetchPrCommentsPage,
  fetchPrCommits,
  fetchAllPrCommits,
  fetchAllPrFiles,
  fetchPrFiles,
  fetchPrIssueComments,
  fetchPrReviews,
  fetchPrChecks,
  fetchPrDevelopment,
  fetchPrSidebarMeta,
  fetchIssueOrPrSummaries,
  fetchCompareFiles,
  mapAndAnnotateFiles,
  fetchPullReviewThreads,
  fetchPullReviewThreadsBundle,
  fetchReviewThreadsPage,
  fetchReviewThreadsByIds,
  collectUnresolvedThreadNodeIds,
  dropReviewThreadsFromDetail,
  mapGraphqlReviewCommentNode,
  mergeReviewThreadsPageIntoDetail,
  emptyReviewThreadsMeta,
  REVIEW_THREADS_API_MAX,
  REVIEW_THREADS_PAGE_SIZE,
  postIssueComment,
  submitPullReview,
  postReviewComment,
  replyToReviewComment,
  findViewerPendingReview,
  ensureViewerPendingReview,
  pickViewerPendingFromReviews,
  fetchViewerPendingReviewComments,
  fetchViewerPendingReviewBundle,
  createPendingPullReview,
  submitPendingPullReview,
  deletePendingPullReview,
  mergePendingReviewComments,
  resolveReviewThread,
  updatePullState,
  closePullRequest,
  reopenPullRequest,
  deleteReviewComment,
  deleteIssueComment,
  updatePullRequest,
  editIssueComment,
  editReviewComment,
  requestReviewers,
  removeReviewers,
  addAssignees,
  removeAssignees,
  setIssueLabels,
  fetchRepoLabels,
  createRepoLabel,
  fetchRepoMilestones,
  createRepoMilestone,
  fetchRepoTags,
  fetchTagsForCommits,
  defaultNewLabelColor,
  mergePullRequest,
  updatePullBranch,
  setIssueSubscription,
  deleteIssueSubscription,
  fetchPullRequestSubscription,
  resolvePullRequestNodeId,
  setIssueMilestone,
  setPullRequestDraftStage,
  applyReviewSuggestion,
  getRepoFileText,
  uploadRepoFile,
  fetchViewerLogin,
  apiJson,
  apiSend,
  apiGraphql,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = fetchApi;
}
if (typeof globalThis !== 'undefined') {
  globalThis.PRTreeFetch = fetchApi;
}

