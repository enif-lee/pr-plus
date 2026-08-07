/**
 * Fetch feature unit: pending-review
 */
import {
  apiGraphql,
  apiJson,
  apiSend,
  githubRestUrl,
  normalizeApiCtx,
} from './http';
import {
  mapGraphqlReviewCommentToRest,
  mapReviewComment,
} from './mappers';
import { fetchViewerLogin } from './viewer';

export function mergePendingReviewComments(published: any, pendingList: any) {
  const list = Array.isArray(published) ? published.slice() : [];
  const seen = new Set(list.map((c) => (c && c.id != null ? String(c.id) : '')).filter(Boolean));
  for (const p of Array.isArray(pendingList) ? pendingList : []) {
    if (!p || p.id == null) continue;
    const key = String(p.id);
    if (seen.has(key)) {
      const idx = list.findIndex((c) => c && String(c.id) === key);
      if (idx < 0) continue;
      const host = list[idx];
      list[idx] = {
        ...p,
        ...host,
        pending: Boolean(host.pending || p.pending),
        pendingReviewId: host.pendingReviewId ?? p.pendingReviewId ?? null,
        threadNodeId: host.threadNodeId || p.threadNodeId || null,
        nodeId: host.nodeId || p.nodeId || null,
        outdated: Boolean(host.outdated || p.outdated),
        diffHunk: host.diffHunk || p.diffHunk || '',
        resolved: Boolean(host.resolved || p.resolved),
      };
      continue;
    }
    seen.add(key);
    list.push(p);
  }
  return list;
}

/**
 * Pick the viewer's latest PENDING review from a reviews list payload.
 * @param {Array} reviews
 * @param {string|null} login
 * @returns {{ id: number, node_id: string|null }|null}
 */
export function pickViewerPendingFromReviews(reviews: any, login: any) {
  const list = Array.isArray(reviews) ? reviews : [];
  const pending = list.filter(
    (r) => r && String(r.state || '').toUpperCase() === 'PENDING'
  );
  if (!pending.length) return null;
  let mine = pending;
  if (login) {
    const byLogin = pending.filter(
      (r) =>
        String(r.user?.login || r.author?.login || '').toLowerCase() ===
        String(login).toLowerCase()
    );
    // Prefer viewer match; if login filter empties the set, still take any
    // PENDING so Add comment can attach (avoids create → 422 one-pending).
    if (byLogin.length) mine = byLogin;
  }
  const r = mine[mine.length - 1];
  return {
    id: Number(r.id),
    node_id: r.node_id || null,
  };
}

/**
 * Comments on the viewer's PENDING review (includes replies not in the main list).
 * Pass `preloaded` reviews + login from fetchPrDetail to avoid a second
 * GET /reviews (rate-limit / race) that can miss PENDING on hard reload.
 * @returns {Promise<{ comments: Array, review: { id: number, nodeId: string|null, commentCount: number }|null }>}
 */
export async function fetchViewerPendingReviewBundle(owner: any, repo: any, pullNumber: any, fetchImpl: any, token: any, preloaded: any = null, ctx: any = null) {
  ctx = normalizeApiCtx(ctx);
  if (!token) return { comments: [], review: null };
  let pending = null;
  if (preloaded && (Array.isArray(preloaded.reviews) || preloaded.login != null)) {
    pending = pickViewerPendingFromReviews(
      preloaded.reviews,
      preloaded.login || null
    );
  }
  if (!pending?.id) {
    pending = await findViewerPendingReview(
      owner,
      repo,
      pullNumber,
      fetchImpl,
      token
    );
  }
  if (!pending?.id) return { comments: [], review: null };
  try {
    const n = Number(pullNumber);
    const raw = await apiJson(
      githubRestUrl(`/repos/${owner}/${repo}/pulls/${n}/reviews/${pending.id}/comments?per_page=100`, ctx),
      fetchImpl,
      token
    );
    const comments = (Array.isArray(raw) ? raw : []).map((c) =>
      mapReviewComment(c, { pending: true, pendingReviewId: pending.id })
    );
    return {
      comments,
      review: {
        id: pending.id,
        nodeId: pending.node_id || null,
        commentCount: comments.length,
      },
    };
  } catch {
    return {
      comments: [],
      review: {
        id: pending.id,
        nodeId: pending.node_id || null,
        commentCount: 0,
      },
    };
  }
}

/**
 * @returns {Promise<Array>}
 */

export async function fetchViewerPendingReviewComments(owner: any, repo: any, pullNumber: any, fetchImpl: any, token: any) {
  const { comments } = await fetchViewerPendingReviewBundle(
    owner,
    repo,
    pullNumber,
    fetchImpl,
    token
  );
  return comments;
}

/**
 * Create an empty PENDING review (no event). Required before attaching
 * "Start review" replies when none exists yet.
 */
export async function createPendingPullReview(
  owner,
  repo,
  pullNumber,
  opts: { commitId?: string } = {},
  fetchImpl,
  token
, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  // Omit `event` → PENDING. Prefer commit_id so later GraphQL threads bind
  // to the same head (Start review + subsequent Add comment).
  // Do not send empty body: some API versions treat body+no-event oddly.
  const body: any = {};
  if (opts?.commitId) body.commit_id = String(opts.commitId);
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/pulls/${pullNumber}/reviews`, ctx),
    fetchImpl,
    token,
    { method: 'POST', body: Object.keys(body).length ? body : {} }
  );
}

/**
 * Submit an existing PENDING review.
 * POST /repos/{owner}/{repo}/pulls/{pull}/reviews/{review_id}/events
 */
export async function submitPendingPullReview(
  owner,
  repo,
  pullNumber,
  reviewId,
  { event = 'COMMENT', body = '' } = {},
  fetchImpl,
  token
, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const id = Number(reviewId);
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error('Invalid pending review id');
  }
  const ev = String(event || 'COMMENT').toUpperCase();
  if (!['COMMENT', 'APPROVE', 'REQUEST_CHANGES'].includes(ev)) {
    throw new Error('Invalid review event');
  }
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/pulls/${pullNumber}/reviews/${id}/events`, ctx),
    fetchImpl,
    token,
    { method: 'POST', body: { event: ev, body: body || '' } }
  );
}

/**
 * Delete a PENDING review (discards all pending comments/replies on it).
 * DELETE /repos/{owner}/{repo}/pulls/{pull}/reviews/{review_id}
 */
export async function deletePendingPullReview(owner: any, repo: any, pullNumber: any, reviewId: any, fetchImpl: any, token: any, ctx: any = null) {
  ctx = normalizeApiCtx(ctx);
  const id = Number(reviewId);
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error('Invalid pending review id');
  }
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/pulls/${pullNumber}/reviews/${id}`, ctx),
    fetchImpl,
    token,
    { method: 'DELETE' }
  );
}

/**
 * Paginated issue or pull review comments.
 * Supports page/per_page offset and since= (ISO8601) incremental windows.
 *
 * @param {'issue'|'review'} kind
 * @param {{ page?: number, perPage?: number, since?: string|null }} [opts]
 */
export async function postReviewCommentViaPendingGraphql(
  pendingReviewNodeId,
  { body, path, line, side = 'RIGHT', startLine, startSide, subjectType = 'line' },
  fetchImpl,
  token,
  ctx = null
) {
  ctx = normalizeApiCtx(ctx);
  const isFile = String(subjectType || '').toLowerCase() === 'file';
  const hasRange =
    !isFile &&
    startLine != null &&
    Number.isFinite(Number(startLine)) &&
    Number(startLine) !== Number(line);
  const variables: any = {
    review: String(pendingReviewNodeId),
    body: String(body || '').trim(),
    path: String(path || ''),
  };
  let query;
  if (isFile) {
    query = `mutation($review:ID!,$body:String!,$path:String!){
      addPullRequestReviewThread(input:{
        pullRequestReviewId:$review
        body:$body
        path:$path
        subjectType:FILE
      }){
        thread {
          id
          comments(first:1){
            nodes{
              id
              databaseId
              body
              path
              createdAt
              author { login avatarUrl }
              pullRequestReview { databaseId }
            }
          }
        }
      }
    }`;
  } else if (hasRange) {
    variables.line = Number(line);
    variables.side =
      String(side || 'RIGHT').toUpperCase() === 'LEFT' ? 'LEFT' : 'RIGHT';
    variables.startLine = Number(startLine);
    variables.startSide =
      String(startSide || side || 'RIGHT').toUpperCase() === 'LEFT' ? 'LEFT' : 'RIGHT';
    query = `mutation($review:ID!,$body:String!,$path:String!,$line:Int!,$side:DiffSide!,$startLine:Int!,$startSide:DiffSide!){
      addPullRequestReviewThread(input:{
        pullRequestReviewId:$review
        body:$body
        path:$path
        line:$line
        side:$side
        startLine:$startLine
        startSide:$startSide
      }){
        thread {
          id
          comments(first:1){
            nodes{
              id
              databaseId
              body
              path
              createdAt
              author { login avatarUrl }
              pullRequestReview { databaseId }
            }
          }
        }
      }
    }`;
  } else {
    variables.line = Number(line);
    variables.side =
      String(side || 'RIGHT').toUpperCase() === 'LEFT' ? 'LEFT' : 'RIGHT';
    query = `mutation($review:ID!,$body:String!,$path:String!,$line:Int!,$side:DiffSide!){
      addPullRequestReviewThread(input:{
        pullRequestReviewId:$review
        body:$body
        path:$path
        line:$line
        side:$side
      }){
        thread {
          id
          comments(first:1){
            nodes{
              id
              databaseId
              body
              path
              createdAt
              author { login avatarUrl }
              pullRequestReview { databaseId }
            }
          }
        }
      }
    }`;
  }
  const data = await apiGraphql(query, variables, fetchImpl, token, ctx);
  const thread = data?.addPullRequestReviewThread?.thread;
  const node = thread?.comments?.nodes?.[0];
  if (!node) {
    throw new Error(
      isFile
        ? `Could not add pending file comment on ${path}.`
        : `Could not add pending comment on ${path}:${line} (${side || 'RIGHT'}). ` +
            `The line may be outside the diff or on the wrong side.`
    );
  }
  const threadNodeId = thread?.id || null;
  const rest = mapGraphqlReviewCommentToRest(node, {
    body,
    path,
    line: isFile ? null : line,
    startLine: hasRange ? Number(startLine) : null,
    side,
    inReplyToId: null,
  });
  return {
    ...rest,
    // GraphQL/REST often omit line on pending comments — keep selection line for UI
    line: isFile ? null : rest.line ?? Number(line),
    path: rest.path || path,
    side: side || 'RIGHT',
    start_line: hasRange ? Number(startLine) : null,
    start_side: hasRange ? startSide || side || 'RIGHT' : null,
    subject_type: isFile ? 'file' : 'line',
    pending: true,
    pendingReviewId: node.pullRequestReview?.databaseId ?? null,
    /** PRR_… used for attach — store on viewerPendingReview for next Add comment */
    pendingReviewNodeId: String(pendingReviewNodeId || ''),
    threadNodeId,
  };
}

/**
 * GraphQL: resolve the viewer's PENDING review global id (PRR_…).
 * Used when REST list/GET omits node_id or hydrate fails — required so
 * second "Add comment" can attach via addPullRequestReviewThread instead of
 * REST POST /comments (422: one pending review per PR).
 *
 * @returns {Promise<{ id: number, node_id: string }|null>}
 */
export async function resolveViewerPendingReviewViaGraphql(
  owner,
  repo,
  pullNumber,
  fetchImpl,
  token,
  ctx = null,
  opts: { login?: string | null; preferDatabaseId?: number | null } = {}
) {
  ctx = normalizeApiCtx(ctx);
  if (!token) return null;
  const n = Number(pullNumber);
  if (!Number.isFinite(n) || n <= 0) return null;
  try {
    // Fetch recent reviews and filter PENDING client-side. Some GH/GHE
    // surfaces omit states:[PENDING] results or lag; client filter is safer
    // for Add comment attach after Start review.
    // Prefer **last** 50 so a fresh PENDING (usually newest) is not pushed
    // out of the window by older reviews on busy PRs.
    const data = await apiGraphql(
      `query($owner:String!,$name:String!,$number:Int!){
        repository(owner:$owner,name:$name){
          pullRequest(number:$number){
            reviews(last:50){
              nodes{
                id
                databaseId
                state
                author { login }
              }
            }
          }
        }
      }`,
      {
        owner: String(owner || ''),
        name: String(repo || ''),
        number: n,
      },
      fetchImpl,
      token,
      ctx
    );
    const nodes = (data?.repository?.pullRequest?.reviews?.nodes || []).filter(
      (r: any) => r && r.id && String(r.state || '').toUpperCase() === 'PENDING'
    );
    if (!Array.isArray(nodes) || !nodes.length) return null;
    const login = opts.login != null ? String(opts.login).toLowerCase() : '';
    const preferId =
      opts.preferDatabaseId != null && Number.isFinite(Number(opts.preferDatabaseId))
        ? Number(opts.preferDatabaseId)
        : null;
    let mine = nodes.filter((r) => r && r.id);
    if (login) {
      const byLogin = mine.filter(
        (r) =>
          String(r.author?.login || '').toLowerCase() === login
      );
      if (byLogin.length) mine = byLogin;
    }
    if (preferId != null) {
      const hit = mine.find((r) => Number(r.databaseId) === preferId);
      if (hit?.id) {
        return { id: Number(hit.databaseId) || preferId, node_id: String(hit.id) };
      }
    }
    const last = mine[mine.length - 1];
    if (!last?.id) return null;
    const id = Number(last.databaseId);
    if (!Number.isFinite(id) || id <= 0) return null;
    return { id, node_id: String(last.id) };
  } catch {
    return null;
  }
}

/**
 * Resolve the viewer's PENDING review, creating one if needed (asPending).
 * Recovers from 422 "one pending review" by re-fetching the existing review.
 * Always re-GETs the review so discarded/stale list entries (with a dead
 * node_id) are not returned after Discard.
 * Falls back to GraphQL when REST omits node_id (second Add comment attach).
 */
export async function ensureViewerPendingReview(
  owner,
  repo,
  pullNumber,
  { commitId = null, createIfMissing = false } = {},
  fetchImpl,
  token
, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  /** Re-fetch review; return null if missing or no longer PENDING. */
  const hydrateNodeId = async (pending) => {
    if (!pending?.id) return null;
    try {
      const full = await apiJson(
        githubRestUrl(`/repos/${owner}/${repo}/pulls/${pullNumber}/reviews/${pending.id}`, ctx),
        fetchImpl,
        token
      );
      if (!full || String(full.state || '').toUpperCase() !== 'PENDING') {
        // GET lag / wrong row — keep list node_id so Add can still GraphQL-attach
        // instead of create → 422 "one pending review".
        if (pending?.node_id) {
          return { id: Number(pending.id), node_id: pending.node_id };
        }
        return null;
      }
      return {
        id: Number(pending.id),
        node_id: full.node_id || pending.node_id || null,
      };
    } catch (err) {
      // 404 after discard — list can briefly still show the dead PENDING row.
      // If list still carries a GraphQL node_id, keep it (GET can lag).
      if (err?.status === 404) {
        if (pending?.node_id) {
          return { id: Number(pending.id), node_id: pending.node_id };
        }
        return null;
      }
      // Keep list node_id when re-GET fails (403/429/network). Dropping it
      // forces create → 422 "one pending review" on the next Add comment.
      if (pending?.node_id) {
        return { id: Number(pending.id), node_id: pending.node_id };
      }
      // Preserve id so GraphQL resolve can still supply node_id
      if (pending?.id) {
        return { id: Number(pending.id), node_id: null };
      }
      return null;
    }
  };

  /**
   * @param pending
   * @param {{ forceDiscover?: boolean }} [opts]
   *   forceDiscover: always try GraphQL PENDING list (422 recover / attach).
   *   Without force, skip GraphQL when createIfMissing and REST found nothing
   *   (first Start review should create via REST, not double-scan).
   */
  const withGraphqlNode = async (
    pending,
    opts: { forceDiscover?: boolean } = {}
  ) => {
    if (pending?.node_id) return pending;
    const force = Boolean(opts.forceDiscover);
    if (!pending?.id && createIfMissing && !force) return pending;
    const login = await fetchViewerLogin(fetchImpl, token).catch(() => null);
    const viaGql = await resolveViewerPendingReviewViaGraphql(
      owner,
      repo,
      pullNumber,
      fetchImpl,
      token,
      ctx,
      {
        login,
        preferDatabaseId: pending?.id ?? null,
      }
    );
    if (viaGql?.node_id) return viaGql;
    return pending;
  };

  let pending = await findViewerPendingReview(
    owner,
    repo,
    pullNumber,
    fetchImpl,
    token,
    ctx
  );
  pending = await hydrateNodeId(pending);
  pending = await withGraphqlNode(pending);
  if (pending?.node_id) return pending;
  if (!createIfMissing) {
    // Attach path: always try GraphQL discovery before giving up
    pending = await withGraphqlNode(pending, { forceDiscover: true });
    return pending;
  }

  try {
    const created = await createPendingPullReview(
      owner,
      repo,
      pullNumber,
      { commitId },
      fetchImpl,
      token,
      ctx
    );
    const createdRow = {
      id: Number(created?.id),
      node_id: created?.node_id || null,
    };
    if (createdRow.node_id) return createdRow;
    // Create response omitted node_id — hydrate / GraphQL
    pending = await hydrateNodeId(createdRow);
    pending = await withGraphqlNode(pending || createdRow, {
      forceDiscover: true,
    });
    return pending;
  } catch (err) {
    // Already have a PENDING review (race or find missed it) — attach to it
    const msg = String(err?.message || err || '');
    if (
      err?.status === 422 ||
      /one pending review/i.test(msg) ||
      /Unprocessable Entity/i.test(msg)
    ) {
      // REST list / GraphQL can lag after another create; retry with backoff.
      for (let attempt = 0; attempt < 5; attempt++) {
        if (attempt > 0) {
          await new Promise((r) => setTimeout(r, 250 * attempt));
        }
        pending = await findViewerPendingReview(
          owner,
          repo,
          pullNumber,
          fetchImpl,
          token,
          ctx
        );
        pending = await hydrateNodeId(pending);
        pending = await withGraphqlNode(pending, { forceDiscover: true });
        if (pending?.node_id) return pending;
      }
    }
    throw err;
  }
}

/**
 * Review comment on a PR file (line-level or file-level).
 * Prefer commit_id + path + line (side RIGHT). Multi-line uses start_line/start_side.
 * File-level: subject_type: 'file' (line omitted).
 *
 * Unified pending model (single GitHub PENDING review):
 * - asPending: true → create PENDING review if needed, always attach via GraphQL
 * - existing PENDING (any path) → GraphQL attach (REST would 422)
 * - else → REST published single comment
 *
 * @param {object} fields
 * @param {boolean} [fields.asPending] Start review / Add comment — always pending
 * @param {'line'|'file'} [fields.subjectType]
 */
export async function findViewerPendingReview(owner: any, repo: any, pullNumber: any, fetchImpl: any, token: any, ctx: any = null) {
  ctx = normalizeApiCtx(ctx);
  if (!token) return null;
  const n = Number(pullNumber);
  if (!Number.isFinite(n)) return null;
  try {
    const [reviews, login] = await Promise.all([
      apiJson(
        githubRestUrl(`/repos/${owner}/${repo}/pulls/${n}/reviews?per_page=100`, ctx),
        fetchImpl,
        token
      ).catch(() => []),
      fetchViewerLogin(fetchImpl, token).catch(() => null),
    ]);
    return pickViewerPendingFromReviews(reviews, login);
  } catch {
    return null;
  }
}

/**
 * Map GraphQL review-comment payload → REST-like shape (mapRestReviewComment).
 */

export async function replyViaThreadGraphql(threadNodeId, body, fetchImpl, token, fallback: any = {}, ctx = null) {
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
export async function replyViaPendingReviewGraphql(
  pendingReviewNodeId,
  parentCommentNodeId,
  body,
  fetchImpl,
  token,
  fallback: any = {},
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
export async function resolveParentCommentNodeId(owner: any, repo: any, parentId: any, fetchImpl: any, token: any, knownNodeId: any, pullNumber: any = null, ctx: any = null) {
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
      (c: any) => c && Number(c.id) === id && (c.nodeId || c.node_id)
    );
    if (hit) return String((hit as any).nodeId || (hit as any).node_id);
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
