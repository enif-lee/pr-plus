/** Mutations: comments/reviews/resolve */
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

export async function postIssueComment(owner: any, repo: any, issueNumber: any, body: any, fetchImpl: any, token: any, ctx: any = null) {
  ctx = normalizeApiCtx(ctx);
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/issues/${issueNumber}/comments`, ctx),
    fetchImpl,
    token,
  // @ts-expect-error classic fetch dynamic shapes
    { method: 'POST', body: { body } }
  );
}

/**
 * @param {'APPROVE'|'REQUEST_CHANGES'|'COMMENT'} event
 * @param {Array} [comments] pending inline comments for bulk submit
 */
export async function submitPullReview(
  owner,
  repo,
  pullNumber,
  { event, body = '', commitId, comments },
  fetchImpl,
  token
, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const payload: any = { event, body: body || '' };
  if (commitId) payload.commit_id = commitId;
  if (Array.isArray(comments) && comments.length) {
    payload.comments = comments.map((c) => {
      const row = {
        path: c.path,
        body: c.body,
        line: c.line,
        side: c.side || 'RIGHT',
      };
      if (c.start_line != null || c.startLine != null) {
        const sl = c.start_line != null ? c.start_line : c.startLine;
        if (Number(sl) !== Number(c.line)) {
  // @ts-expect-error classic fetch dynamic shapes
          row.start_line = Number(sl);
  // @ts-expect-error classic fetch dynamic shapes
          row.start_side = c.start_side || c.startSide || c.side || 'RIGHT';
        }
      }
      return row;
    });
  }
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/pulls/${pullNumber}/reviews`, ctx),
    fetchImpl,
    token,
  // @ts-expect-error classic fetch dynamic shapes
    { method: 'POST', body: payload }
  );
}

/**
 * GraphQL: add a new review *thread* (line or file comment) onto an existing PENDING review.
 * REST POST /comments creates a second pending review → 422.
 */
export async function postReviewComment(
  owner,
  repo,
  pullNumber,
  {
    body,
    path,
    line,
    side = 'RIGHT',
    commitId,
    startLine,
    startSide,
    asPending = false,
    subjectType = 'line',
  },
  fetchImpl,
  token
, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const text = String(body || '').trim();
  if (!text) throw new Error('Comment body is required');
  if (!path) throw new Error('path is required');
  const isFile = String(subjectType || '').toLowerCase() === 'file';
  if (!isFile && line == null) throw new Error('path and line are required');

  // Unified PENDING: attach to existing, or create (asPending). Recover from 422.
  let pending = await ensureViewerPendingReview(
    owner,
    repo,
    pullNumber,
    {
      commitId: commitId || null,
      // Create only when caller wants pending; also create path recovers on 422
      createIfMissing: Boolean(asPending),
    },
    fetchImpl,
    token
  );

  const gqlFields = {
    body: text,
    path,
    line: isFile ? null : line,
    side,
    startLine: isFile ? null : startLine,
    startSide: isFile ? null : startSide,
    subjectType: isFile ? 'file' : 'line',
  };

  // Existing PENDING (or just created) → always GraphQL attach (REST 422s)
  if (pending?.node_id) {
    try {
      const raw = await postReviewCommentViaPendingGraphql(
        pending.node_id,
        gqlFields,
        fetchImpl,
        token,
        ctx
      );
      return {
        ...raw,
        pending: true,
        pendingReviewId: raw.pendingReviewId || pending.id || null,
      };
    } catch (err) {
      // Discarded review can linger in the list with a dead GraphQL node id.
      const msg = String(err?.message || err || '');
      if (
        asPending &&
        /Could not resolve to a node|global id|NOT_FOUND|Could not find/i.test(msg)
      ) {
        // Force a fresh PENDING review and retry once
        try {
          const created = await createPendingPullReview(
            owner,
            repo,
            pullNumber,
            { commitId: commitId || null },
            fetchImpl,
            token,
            ctx
          );
          pending = {
            id: Number(created?.id),
            node_id: created?.node_id || null,
          };
        } catch (createErr) {
          if (
            createErr?.status === 422 ||
            /one pending review/i.test(String(createErr?.message || ''))
          ) {
            pending = await ensureViewerPendingReview(
              owner,
              repo,
              pullNumber,
              { commitId: commitId || null, createIfMissing: false },
              fetchImpl,
              token,
              ctx
            );
          } else {
            throw createErr;
          }
        }
        if (pending?.node_id) {
          const raw = await postReviewCommentViaPendingGraphql(
            pending.node_id,
            gqlFields,
            fetchImpl,
            token,
            ctx
          );
          return {
            ...raw,
            pending: true,
            pendingReviewId: raw.pendingReviewId || pending.id || null,
          };
        }
      }
      throw err;
    }
  }

  // asPending but still no node_id — cannot attach
  if (asPending) {
    throw new Error(
      'Could not start or find a pending review. Try Discard any leftover pending review, then retry.'
    );
  }

  // Published single comment (no PENDING review)
  const payload = isFile
    ? { body: text, path, subject_type: 'file' }
    : { body: text, path, line, side };
  // @ts-expect-error classic fetch dynamic shapes
  if (commitId) payload.commit_id = commitId;
  if (!isFile && startLine != null && Number(startLine) !== Number(line)) {
  // @ts-expect-error classic fetch dynamic shapes
    payload.start_line = Number(startLine);
  // @ts-expect-error classic fetch dynamic shapes
    payload.start_side = startSide || side || 'RIGHT';
  }
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/pulls/${pullNumber}/comments`, ctx),
    fetchImpl,
    token,
  // @ts-expect-error classic fetch dynamic shapes
    { method: 'POST', body: payload }
  );
}

/**
 * Viewer's PENDING review on a PR (at most one). Used because REST
 * POST /comments and /replies 422 with:
 * "user_id can only have one pending review per pull request".
 * @returns {Promise<{ id: number, node_id: string|null }|null>}
 */
export async function replyToReviewComment(
  owner,
  repo,
  pullNumber,
  commentId,
  body,
  fetchImpl,
  token,
  opts: any = {}
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
  // @ts-expect-error classic fetch dynamic shapes
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
  // @ts-expect-error classic fetch dynamic shapes
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
export async function resolveReviewThread(threadNodeId: any, resolved: any, fetchImpl: any, token: any, ctx: any = null) {
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
export async function updatePullState(owner: any, repo: any, pullNumber: any, state: any, fetchImpl: any, token: any, ctx: any = null) {
  ctx = normalizeApiCtx(ctx);
  const next = state === 'closed' ? 'closed' : 'open';
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/pulls/${pullNumber}`, ctx),
    fetchImpl,
    token,
  // @ts-expect-error classic fetch dynamic shapes
    { method: 'PATCH', body: { state: next } }
  );
}

export async function closePullRequest(owner: any, repo: any, pullNumber: any, fetchImpl: any, token: any) {
  return updatePullState(owner, repo, pullNumber, 'closed', fetchImpl, token);
}

export async function reopenPullRequest(owner: any, repo: any, pullNumber: any, fetchImpl: any, token: any) {
  return updatePullState(owner, repo, pullNumber, 'open', fetchImpl, token);
}

/**
 * Delete a pull request review comment (own comments only on GitHub).
 * DELETE /repos/{owner}/{repo}/pulls/comments/{comment_id}
 */
export async function deleteReviewComment(owner: any, repo: any, commentId: any, fetchImpl: any, token: any, ctx: any = null) {
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
export async function deleteIssueComment(owner: any, repo: any, commentId: any, fetchImpl: any, token: any, ctx: any = null) {
  ctx = normalizeApiCtx(ctx);
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/issues/comments/${commentId}`, ctx),
    fetchImpl,
    token,
    { method: 'DELETE' }
  );
}

