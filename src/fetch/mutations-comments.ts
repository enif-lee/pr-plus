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
    { method: 'POST', body: { body } }
  );
}

/**
 * @param {'APPROVE'|'REQUEST_CHANGES'|'COMMENT'} event
 * @param {Array} [comments] pending inline comments for bulk submit
 */
export async function submitPullReview(
  owner: any,
  repo: any,
  pullNumber: any,
  { event, body = '', commitId, comments }: any,
  fetchImpl: any,
  token: any
, ctx: any = null) {
  ctx = normalizeApiCtx(ctx);
  const payload: any = { event, body: body || '' };
  if (commitId) payload.commit_id = commitId;
  if (Array.isArray(comments) && comments.length) {
    payload.comments = comments.map((c) => {
      const row: any = {
        path: c.path,
        body: c.body,
        line: c.line,
        side: c.side || 'RIGHT',
      };
      if (c.start_line != null || c.startLine != null) {
        const sl = c.start_line != null ? c.start_line : c.startLine;
        if (Number(sl) !== Number(c.line)) {
          row.start_line = Number(sl);
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
    { method: 'POST', body: payload }
  );
}

/**
 * GraphQL: add a new review *thread* (line or file comment) onto an existing PENDING review.
 * REST POST /comments creates a second pending review → 422.
 */
export async function postReviewComment(
  owner: any,
  repo: any,
  pullNumber: any,
  {
    body,
    path,
    line,
    side = 'RIGHT',
    commitId = null,
    startLine = null,
    startSide = null,
    asPending = false,
    subjectType = 'line',
    /** Optional PRR_… from prior Start review (viewerPendingReview.nodeId) */
    pendingReviewNodeId = null,
    pendingReviewId = null,
  }: any,
  fetchImpl: any,
  token: any
, ctx: any = null) {
  ctx = normalizeApiCtx(ctx);
  const text = String(body || '').trim();
  if (!text) throw new Error('Comment body is required');
  if (!path) throw new Error('path is required');
  const isFile = String(subjectType || '').toLowerCase() === 'file';
  if (!isFile && line == null) throw new Error('path and line are required');

  // Fast path: client already knows the PENDING review GraphQL id (Add comment
  // after Start review). Avoid create → 422 when list/find lags.
  const knownNode = String(pendingReviewNodeId || '').trim();
  if (knownNode && (asPending || knownNode)) {
    try {
      const raw = await postReviewCommentViaPendingGraphql(
        knownNode,
        {
          body: text,
          path,
          line: isFile ? null : line,
          side,
          startLine: isFile ? null : startLine,
          startSide: isFile ? null : startSide,
          subjectType: isFile ? 'file' : 'line',
        },
        fetchImpl,
        token,
        ctx
      );
      return {
        ...raw,
        pending: true,
        pendingReviewId:
          raw.pendingReviewId || pendingReviewId || null,
        pendingReviewNodeId: knownNode,
      };
    } catch (knownErr) {
      // Fall through to ensure/find if node is stale
      const km = String(knownErr?.message || knownErr || '');
      if (
        !/Could not resolve to a node|global id|NOT_FOUND|Could not find/i.test(
          km
        )
      ) {
        // Line/side errors should surface; one-pending is not expected here
        throw knownErr;
      }
    }
  }

  // Unified PENDING: prefer **attach** before **create**.
  // Add comment must not POST /reviews when a PENDING already exists (422
  // "one pending review"). Start review (no pending yet) falls through to create.
  let pending = await ensureViewerPendingReview(
    owner,
    repo,
    pullNumber,
    { commitId: commitId || null, createIfMissing: false },
    fetchImpl,
    token,
    ctx
  );
  if (!pending?.node_id && asPending) {
    try {
      pending = await ensureViewerPendingReview(
        owner,
        repo,
        pullNumber,
        { commitId: commitId || null, createIfMissing: true },
        fetchImpl,
        token,
        ctx
      );
    } catch (ensureErr: any) {
      // create raced into 422 — resolve existing PENDING for GraphQL attach
      const em = String(ensureErr?.message || ensureErr || '');
      if (
        ensureErr?.status === 422 ||
        /one pending review/i.test(em) ||
        /Unprocessable Entity/i.test(em)
      ) {
        // Retries: REST list / GraphQL can lag right after create elsewhere
        for (let i = 0; i < 6 && !pending?.node_id; i++) {
          if (i > 0) {
            await new Promise((r) => setTimeout(r, 300 * i));
          }
          pending = await ensureViewerPendingReview(
            owner,
            repo,
            pullNumber,
            { commitId: commitId || null, createIfMissing: false },
            fetchImpl,
            token,
            ctx
          );
        }
        // Do not rethrow 422 — attach path below will try again / last-resort
        // recover. Rethrowing here is what surfaces the toast on Add comment.
        if (!pending?.node_id) {
          pending = null;
        }
      } else {
        throw ensureErr;
      }
    }
  }

  const gqlFields = {
    body: text,
    path,
    line: isFile ? null : line,
    side,
    startLine: isFile ? null : startLine,
    startSide: isFile ? null : startSide,
    subjectType: isFile ? 'file' : 'line',
  };

  async function attachViaGraphql(pendingRow: any) {
    if (!pendingRow?.node_id) return null;
    const nodeId = String(pendingRow.node_id);
    const raw = await postReviewCommentViaPendingGraphql(
      nodeId,
      gqlFields,
      fetchImpl,
      token,
      ctx
    );
    return {
      ...raw,
      pending: true,
      pendingReviewId: raw.pendingReviewId || pendingRow.id || null,
      // Always echo PRR_… so App can latch for the next Add comment
      pendingReviewNodeId:
        String(raw.pendingReviewNodeId || nodeId || '').trim() || nodeId,
    };
  }

  /** Re-find PENDING + attach; never creates. Used after 422 / dead node. */
  async function recoverAttachFromExistingPending() {
    let row = await ensureViewerPendingReview(
      owner,
      repo,
      pullNumber,
      { commitId: commitId || null, createIfMissing: false },
      fetchImpl,
      token,
      ctx
    );
    // Prefer known REST id when ensure omitted node_id
    if (!row?.node_id && pendingReviewId) {
      row = await ensureViewerPendingReview(
        owner,
        repo,
        pullNumber,
        { commitId: commitId || null, createIfMissing: false },
        fetchImpl,
        token,
        ctx
      );
    }
    if (row?.node_id) {
      try {
        return await attachViaGraphql(row);
      } catch {
        /* continue */
      }
    }
    return null;
  }

  // Existing PENDING (or just created) → always GraphQL attach (REST 422s)
  if (pending?.node_id) {
    try {
      const attached = await attachViaGraphql(pending);
      if (attached) return attached;
    } catch (err) {
      // Discarded review can linger in the list with a dead GraphQL node id.
      // Also re-resolve when GraphQL fails after ensure missed a live PENDING
      // (Add comment 422 "one pending review" recovery path).
      const msg = String(err?.message || err || '');
      const reResolve =
        asPending &&
        (/Could not resolve to a node|global id|NOT_FOUND|Could not find/i.test(
          msg
        ) ||
          /one pending review/i.test(msg) ||
          err?.status === 422);
      if (reResolve) {
        const recovered = await recoverAttachFromExistingPending();
        if (recovered) return recovered;
        // Dead node: try create only if re-resolve found nothing
        pending = await ensureViewerPendingReview(
          owner,
          repo,
          pullNumber,
          { commitId: commitId || null, createIfMissing: false },
          fetchImpl,
          token,
          ctx
        );
        if (!pending?.node_id) {
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
              const recovered2 = await recoverAttachFromExistingPending();
              if (recovered2) return recovered2;
            } else {
              throw createErr;
            }
          }
          const retry2 = await attachViaGraphql(pending);
          if (retry2) return retry2;
        }
      }
      throw err;
    }
  }

  // asPending but still no node_id — last GraphQL discovery before fail
  if (asPending) {
    const lastTry = await recoverAttachFromExistingPending();
    if (lastTry) return lastTry;
    // One more create-if-missing only when truly nothing found
    try {
      pending = await ensureViewerPendingReview(
        owner,
        repo,
        pullNumber,
        { commitId: commitId || null, createIfMissing: true },
        fetchImpl,
        token,
        ctx
      );
      const afterCreate = await attachViaGraphql(pending);
      if (afterCreate) return afterCreate;
    } catch (createLast: any) {
      if (
        createLast?.status === 422 ||
        /one pending review/i.test(String(createLast?.message || ''))
      ) {
        const recovered = await recoverAttachFromExistingPending();
        if (recovered) return recovered;
      }
      throw createLast;
    }
    throw new Error(
      'Could not start or find a pending review. Try Discard any leftover pending review, then retry.'
    );
  }

  // Published single comment (no PENDING review)
  const payload: any = isFile
    ? { body: text, path, subject_type: 'file' }
    : { body: text, path, line, side };
  if (commitId) payload.commit_id = commitId;
  if (!isFile && startLine != null && Number(startLine) !== Number(line)) {
    payload.start_line = Number(startLine);
    payload.start_side = startSide || side || 'RIGHT';
  }
  try {
    return await apiSend(
      githubRestUrl(`/repos/${owner}/${repo}/pulls/${pullNumber}/comments`, ctx),
      fetchImpl,
      token,
      { method: 'POST', body: payload }
    );
  } catch (err) {
    // Race / missed PENDING: REST 422 "one pending review" → GraphQL attach
    const msg = String(err?.message || err || '');
    if (
      err?.status === 422 ||
      /one pending review/i.test(msg) ||
      /Unprocessable Entity/i.test(msg)
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
      const recovered = await attachViaGraphql(pending);
      if (recovered) return recovered;
    }
    throw err;
  }
}

/**
 * Viewer's PENDING review on a PR (at most one). Used because REST
 * POST /comments and /replies 422 with:
 * "user_id can only have one pending review per pull request".
 * @returns {Promise<{ id: number, node_id: string|null }|null>}
 */
export async function replyToReviewComment(
  owner: any,
  repo: any,
  pullNumber: any,
  commentId: any,
  body: any,
  fetchImpl: any,
  token: any,
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
  async function attachReplyToPending({ createIfMissing }: any) {
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
          pendingReviewId: (raw as any).pendingReviewId || pending?.id || null,
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

/**
 * GitHub ReportedContentClassifiers for minimizeComment.
 * @see https://docs.github.com/en/graphql/reference/enums#reportedcontentclassifiers
 */
export const MINIMIZE_CLASSIFIERS = [
  'SPAM',
  'ABUSE',
  'OFF_TOPIC',
  'OUTDATED',
  'DUPLICATE',
  'RESOLVED',
] as const;

/**
 * Hide (minimize) a comment/thread subject via GraphQL.
 * subjectNodeId must be a GraphQL global id (IC_… / PRRC_… / etc.).
 * @param {string} subjectNodeId
 * @param {string} [classifier='OFF_TOPIC']
 */
export async function minimizeComment(
  subjectNodeId: any,
  classifier: any = 'OFF_TOPIC',
  fetchImpl: any,
  token: any,
  ctx: any = null
) {
  ctx = normalizeApiCtx(ctx);
  const id = String(subjectNodeId || '').trim();
  if (!id) throw new Error('subjectNodeId required to minimize comment');
  let c = String(classifier || 'OFF_TOPIC')
    .trim()
    .toUpperCase()
    .replace(/[-\s]+/g, '_');
  if (!(MINIMIZE_CLASSIFIERS as readonly string[]).includes(c)) {
    c = 'OFF_TOPIC';
  }
  const mutation = `mutation($input: MinimizeCommentInput!) {
    minimizeComment(input: $input) {
      minimizedComment {
        ... on Minimizable {
          isMinimized
          minimizedReason
          viewerCanMinimize
        }
      }
    }
  }`;
  return apiGraphql(
    mutation,
    { input: { subjectId: id, classifier: c } },
    fetchImpl,
    token,
    ctx
  );
}

/**
 * Unhide (unminimize) a comment via GraphQL.
 * @param {string} subjectNodeId GraphQL global id
 */
export async function unminimizeComment(
  subjectNodeId: any,
  fetchImpl: any,
  token: any,
  ctx: any = null
) {
  ctx = normalizeApiCtx(ctx);
  const id = String(subjectNodeId || '').trim();
  if (!id) throw new Error('subjectNodeId required to unminimize comment');
  const mutation = `mutation($input: UnminimizeCommentInput!) {
    unminimizeComment(input: $input) {
      unminimizedComment {
        ... on Minimizable {
          isMinimized
          minimizedReason
          viewerCanMinimize
        }
      }
    }
  }`;
  return apiGraphql(
    mutation,
    { input: { subjectId: id } },
    fetchImpl,
    token,
    ctx
  );
}

