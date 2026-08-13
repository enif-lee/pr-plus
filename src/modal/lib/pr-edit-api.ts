/** @module modal/lib/pr-edit-api */
/**
 * Pure request builders for PR metadata edits, comment edits, and suggestion apply.
 * Unit-tested without network; fetch layer uses the same shapes.
 */

export function buildUpdatePullRequest(owner: any, repo: any, pullNumber: any, fields: any = {
  // typed loosely for mutable REST payloads
}) {
  const body: any = {};
  if (fields.title != null) body.title = String(fields.title);
  if (fields.body != null) body.body = String(fields.body);
  if (fields.base != null) body.base = String(fields.base);
  if (fields.state != null) body.state = fields.state === 'closed' ? 'closed' : 'open';
  return {
    method: 'PATCH',
    url: `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}`,
    body,
  };
}

export function buildEditIssueComment(owner: any, repo: any, commentId: any, body: any) {
  return {
    method: 'PATCH',
    url: `https://api.github.com/repos/${owner}/${repo}/issues/comments/${commentId}`,
    body: { body: String(body || '') },
  };
}

export function buildEditReviewComment(owner: any, repo: any, commentId: any, body: any) {
  return {
    method: 'PATCH',
    url: `https://api.github.com/repos/${owner}/${repo}/pulls/comments/${commentId}`,
    body: { body: String(body || '') },
  };
}

export function buildRequestReviewers(owner: any, repo: any, pullNumber: any, { reviewers = [], teamReviewers = [] }: any = {}) {
  return {
    method: 'POST',
    url: `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}/requested_reviewers`,
    body: {
      reviewers: reviewers.slice(),
      team_reviewers: teamReviewers.slice(),
    },
  };
}

export function buildRemoveReviewers(owner: any, repo: any, pullNumber: any, { reviewers = [], teamReviewers = [] }: any = {}) {
  return {
    method: 'DELETE',
    url: `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}/requested_reviewers`,
    body: {
      reviewers: reviewers.slice(),
      team_reviewers: teamReviewers.slice(),
    },
  };
}

export function buildSetAssignees(owner: any, repo: any, issueNumber: any, assignees: any) {
  return {
    method: 'POST',
    url: `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/assignees`,
    body: { assignees: (assignees || []).slice() },
  };
}

export function buildRemoveAssignees(owner: any, repo: any, issueNumber: any, assignees: any) {
  return {
    method: 'DELETE',
    url: `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/assignees`,
    body: { assignees: (assignees || []).slice() },
  };
}

export function buildSetLabels(owner: any, repo: any, issueNumber: any, labels: any) {
  return {
    method: 'PUT',
    url: `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/labels`,
    body: { labels: (labels || []).slice() },
  };
}

/** Merge PR via REST. mergeMethod: merge | squash | rebase */
export function buildMergePullRequest(owner: any, repo: any, pullNumber: any, { mergeMethod = 'merge', commitTitle, commitMessage }: any = {}) {
  const body: any = { merge_method: mergeMethod };
  if (commitTitle != null) body.commit_title = String(commitTitle);
  if (commitMessage != null) body.commit_message = String(commitMessage);
  return {
    method: 'PUT',
    url: `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}/merge`,
    body,
  };
}

/** Update PR head branch with latest base (update branch button). */
export function buildUpdateBranch(owner: any, repo: any, pullNumber: any, { expectedHeadSha }: any = {}) {
  const body: any = {};
  if (expectedHeadSha) body.expected_head_sha = String(expectedHeadSha);
  return {
    method: 'PUT',
    url: `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}/update-branch`,
    body,
  };
}

/**
 * Issue/PR subscription via GraphQL updateSubscription
 * (REST /issues/{n}/subscription is 404 / removed for many tokens).
 */
export function buildSetSubscription(
  owner: any,
  repo: any,
  issueNumber: any,
  { subscribed = true, ignored = false, nodeId = null }: any = {}
) {
  const state = ignored ? 'IGNORED' : subscribed ? 'SUBSCRIBED' : 'UNSUBSCRIBED';
  return {
    method: 'POST',
    url: 'https://api.github.com/graphql',
    body: {
      query: `mutation($id:ID!,$state:SubscriptionState!){
  updateSubscription(input:{subscribableId:$id, state:$state}) {
    subscribable {
      ... on PullRequest { id viewerSubscription }
      ... on Issue { id viewerSubscription }
    }
  }
}`,
      variables: {
        id: String(nodeId || ''),
        state,
      },
    },
  };
}

export function buildDeleteSubscription(owner: any, repo: any, issueNumber: any, nodeId: any = null) {
  return buildSetSubscription(owner, repo, issueNumber, {
    subscribed: false,
    ignored: false,
    nodeId,
  });
}

/** Set or clear milestone on the PR issue. */
export function buildSetMilestone(owner: any, repo: any, issueNumber: any, milestoneNumber: any) {
  return {
    method: 'PATCH',
    url: `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`,
    body: { milestone: milestoneNumber == null ? null : Number(milestoneNumber) },
  };
}

/**
 * GraphQL mutation names for draft stage (need pullRequest node id).
 * @param {'draft'|'ready'} stage
 */
export function buildDraftStageGraphql(stage: any, pullRequestId: any) {
  const id = String(pullRequestId || '');
  if (stage === 'ready') {
    return {
      query: `mutation($id:ID!){markPullRequestReadyForReview(input:{pullRequestId:$id}){pullRequest{id isDraft}}}`,
      variables: { id },
    };
  }
  return {
    query: `mutation($id:ID!){convertPullRequestToDraft(input:{pullRequestId:$id}){pullRequest{id isDraft}}}`,
    variables: { id },
  };
}

/**
 * Read isDraft from markReady / convertToDraft GraphQL data payload.
 * @returns {boolean|null} null when the field is missing
 */
export function draftFromStageGraphqlData(data: any): boolean | null {
  if (!data || typeof data !== 'object') return null;
  const pr =
    data.markPullRequestReadyForReview?.pullRequest ||
    data.convertPullRequestToDraft?.pullRequest ||
    data.pullRequest ||
    null;
  if (!pr || typeof pr !== 'object') return null;
  if (typeof pr.isDraft === 'boolean') return pr.isDraft;
  if (typeof pr.draft === 'boolean') return pr.draft;
  return null;
}

/**
 * Extract linked issue numbers from PR body (closes/fixes/refs #N and bare #N).
 * @returns {number[]}
 */
export function parseLinkedIssueNumbers(body: any) {
  const text = body == null ? '' : String(body);
  const nums = new Set();
  const re = /(?:(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+)?#(\d+)/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > 0) nums.add(n);
  }
  return [...nums].sort((a: any, b: any) => Number(a) - Number(b));
}

/**
 * Logins to POST for "re-request review".
 * GitHub 422s if you re-POST reviewers who are already in requested_reviewers.
 * Target: past review authors (and optional extras) who are not currently pending
 * and are not the PR author.
 *
 * @param {{
 *   requestedReviewers?: string[],
 *   reviews?: Array<{ author?: string }>,
 *   author?: string,
 *   extraLogins?: string[],
 * }} detail
 * @returns {string[]}
 */
export function buildRerequestReviewerLogins(detail: any) {
  const d = detail || {};
  const pending = new Set(
    (d.requestedReviewers || [])
      .map((x: any) => String(x || '').trim())
      .filter(Boolean)
      .map((x: any) => x.toLowerCase())
  );
  const author = String(d.author || '')
    .trim()
    .toLowerCase();
  const out: any[] = [];
  const seen = new Set();

  function isBotLogin(login: any, review: any) {
    if (review?.isBot === true || String(review?.type || '').toLowerCase() === 'bot') {
      return true;
    }
    const key = String(login || '').toLowerCase();
    if (d.actorIsBot && typeof d.actorIsBot === 'object') {
      if (d.actorIsBot instanceof Map) {
        if (d.actorIsBot.get(key)) return true;
      } else if (d.actorIsBot[key]) return true;
    }
    return /\[bot\]$/i.test(String(login || ''));
  }

  function consider(login: any, review: any = null) {
    const raw = String(login || '').trim();
    if (!raw) return;
    const key = raw.toLowerCase();
    if (author && key === author) return;
    if (pending.has(key)) return; // already requested → would 422
    if (isBotLogin(raw, review)) return; // bots cannot be re-requested
    if (seen.has(key)) return;
    seen.add(key);
    out.push(raw);
  }

  for (const r of d.reviews || []) {
    consider(r?.author, r);
  }
  for (const login of d.extraLogins || []) {
    consider(login, null);
  }
  return out;
}

/**
 * Parse GitHub ```suggestion fences from a comment body.
 * @returns {Array<{ content: string, raw: string }>}
 */
export function parseSuggestionFences(body: any) {
  const text = body == null ? '' : String(body);
  const out = [];
  const re = /```suggestion[^\n]*\r?\n([\s\S]*?)```/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    out.push({ content: m[1].replace(/\n$/, ''), raw: m[0] });
  }
  return out;
}

/**
 * Apply suggestion lines into full file content (1-based inclusive line range on RIGHT side of the new file).
 * Replaces lines [startLine, endLine] with suggestion lines (may change line count).
 * @param {string} fileContent
 * @param {{ startLine: number, endLine: number, suggestion: string }} range
 */
export function applySuggestionToFileContent(fileContent: any, { startLine, endLine, suggestion }: any) {
  const lines = String(fileContent ?? '').split('\n');
  // Preserve trailing newline semantics: split keeps last empty if file ends with \n
  const endsWithNl = String(fileContent ?? '').endsWith('\n');
  if (endsWithNl && lines[lines.length - 1] === '') lines.pop();

  const start = Math.max(1, Number(startLine) || 1);
  const end = Math.max(start, Number(endLine) || start);
  const sugLines = String(suggestion ?? '').split('\n');
  // Drop final empty from suggestion if it was trailing newline only
  if (sugLines.length && sugLines[sugLines.length - 1] === '' && suggestion.endsWith('\n')) {
    sugLines.pop();
  }

  const before = lines.slice(0, start - 1);
  const after = lines.slice(end);
  const next = [...before, ...sugLines, ...after];
  let out = next.join('\n');
  if (endsWithNl || out.length) out = out.endsWith('\n') ? out : `${out}\n`;
  return out;
}

/**
 * Contents API PUT shape for committing applied suggestion on head branch.
 */
export function buildApplySuggestionCommitRequest(
  owner: any,
  repo: any,
  { path, branch, contentBase64, sha, message }: any
) {
  return {
    method: 'PUT',
    url: `https://api.github.com/repos/${owner}/${repo}/contents/${path
      .split('/')
      .map(encodeURIComponent)
      .join('/')}`,
    body: {
      message: message || `Apply suggestion to ${path}`,
      content: contentBase64,
      branch,
      sha,
    },
  };
}

/**
 * Map unified leave-review form button → GitHub review event or issue comment.
 * @param {'comment'|'approve'|'request_changes'} action
 */
export function mapLeaveReviewAction(action: any) {
  const a = String(action || '').toLowerCase();
  if (a === 'approve') return { kind: 'review', event: 'APPROVE' };
  if (a === 'request_changes' || a === 'request-changes') {
    return { kind: 'review', event: 'REQUEST_CHANGES' };
  }
  return { kind: 'issue-comment', event: 'COMMENT' };
}

/** Normalize GitHub login for equality (case-insensitive). */
export function normalizeGithubLogin(login: unknown): string {
  return String(login || '')
    .trim()
    .replace(/^@/, '')
    .toLowerCase();
}

/**
 * True when the signed-in viewer is the PR author.
 * GitHub rejects APPROVE / REQUEST_CHANGES on your own PR (HTTP 422).
 */
export function isViewerPrAuthor(
  detail: { author?: unknown; viewerLogin?: unknown } | null | undefined
): boolean {
  const author = normalizeGithubLogin(detail?.author);
  const viewer = normalizeGithubLogin(detail?.viewerLogin);
  return Boolean(author && viewer && author === viewer);
}

/**
 * Approve / Request changes are only valid when the viewer is not the author.
 * Submit-as-comment remains allowed on own PRs.
 */
export function canSubmitReviewVerdict(
  detail: { author?: unknown; viewerLogin?: unknown } | null | undefined
): boolean {
  return !isViewerPrAuthor(detail);
}

/** True for leave-review kinds that require a non-author reviewer. */
export function isReviewVerdictKind(kind: unknown): boolean {
  const k = String(kind || '').toLowerCase();
  return k === 'approve' || k === 'request_changes' || k === 'request-changes';
}

/**
 * Map GitHub REST review-comment payload → app shape (optimistic UI).
 * Used after postReviewComment / replyToReviewComment so diff virtual rows
 * and groupReviewThreads update before the next full refresh.
 * @param {object|null} raw REST response body
 * @param {object} [fallback] path/line/body when raw is partial
 */
export function mapRestReviewComment(raw: any, fallback: any = {}) {
  if (!raw && !String(fallback.body || '').trim()) return null;
  const r = raw || {};
  const subjectRaw = String(
    r.subject_type || r.subjectType || fallback.subjectType || fallback.subject_type || ''
  ).toLowerCase();
  const isFile =
    subjectRaw === 'file' ||
    (fallback.subjectType === 'file' && subjectRaw !== 'line');
  // PENDING comments often omit line and only have position / original_line
  const lineRaw = isFile
    ? null
    : r.line ??
      r.original_line ??
      (r.position != null && Number.isFinite(Number(r.position))
        ? Number(r.position)
        : null) ??
      fallback.line ??
      null;
  return {
    id: r.id ?? fallback.id ?? null,
    author: r.user?.login || fallback.author || '',
    avatarUrl: r.user?.avatar_url || fallback.avatarUrl || '',
    body: r.body || fallback.body || '',
    path: r.path || fallback.path || '',
    line: lineRaw != null ? Number(lineRaw) : null,
    originalLine: isFile ? null : r.original_line ?? null,
    startLine: isFile ? null : r.start_line ?? fallback.startLine ?? null,
    side: r.side || fallback.side || 'RIGHT',
    startSide: r.start_side || null,
    diffHunk: r.diffHunk || r.diff_hunk || fallback.diffHunk || '',
    createdAt: r.created_at || fallback.createdAt || null,
    inReplyToId: r.in_reply_to_id ?? fallback.inReplyToId ?? null,
    nodeId: r.node_id || null,
    threadNodeId: r.threadNodeId || fallback.threadNodeId || null,
    reviewId:
      r.pull_request_review_id != null
        ? Number(r.pull_request_review_id)
        : fallback.reviewId != null
          ? Number(fallback.reviewId)
          : null,
    resolved: Boolean(r.resolved ?? fallback.resolved),
    pending: Boolean(r.pending ?? fallback.pending),
    pendingReviewId: r.pendingReviewId ?? fallback.pendingReviewId ?? null,
    outdated: Boolean(r.outdated ?? fallback.outdated),
    subjectType: isFile ? 'file' : 'line',
  };
}

/**
 * Map GitHub REST issue comment payload → app shape.
 */
export function mapRestIssueComment(raw: any, fallback: any = {}) {
  if (!raw && !fallback.body) return null;
  const r = raw || {};
  return {
    id: r.id ?? fallback.id ?? null,
    author: r.user?.login || fallback.author || '',
    avatarUrl: r.user?.avatar_url || fallback.avatarUrl || '',
    body: r.body || fallback.body || '',
    createdAt: r.created_at || fallback.createdAt || null,
    htmlUrl: r.html_url || null,
    nodeId: r.node_id || fallback.nodeId || null,
    reactions: Array.isArray(fallback.reactions) ? fallback.reactions : [],
  };
}

/**
 * Append a server-confirmed review comment into a detail-like snapshot.
 * Name kept for call-site compatibility (was optimistic; now used after API success).
 * @param {{ reviewComments?: Array }} detail
 * @param {object|null} comment mapped comment
 */
export function appendOptimisticReviewComment(detail: any, comment: any) {
  const base = detail || {};
  if (!comment || comment.id == null) return base;
  const list = Array.isArray(base.reviewComments) ? base.reviewComments.slice() : [];
  if (list.some((c: any) => String(c.id) === String(comment.id))) {
    return { ...base, reviewComments: list };
  }
  list.push(comment);
  return { ...base, reviewComments: list };
}

/**
 * Append a server-confirmed issue (conversation) comment after POST succeeds.
 */
export function appendIssueCommentToDetail(detail: any, comment: any) {
  const base = detail || {};
  if (!comment || comment.id == null) return base;
  const list = Array.isArray(base.comments) ? base.comments.slice() : [];
  if (list.some((c: any) => String(c.id) === String(comment.id))) {
    return { ...base, comments: list };
  }
  list.push(comment);
  return { ...base, comments: list };
}

/**
 * Stamp `resolved` on matching reviewComments + reviewThreads after resolve/unresolve.
 * Used for optimistic paint and host write-through without a full PR soft-refresh.
 * Also records `_resolveStamps[tid]` so mergeDetailPreserveOptimistic can hold the
 * write against a lagging host/by-ids snapshot until host catches up.
 * @param {object|null|undefined} detail
 * @param {string} threadNodeId GraphQL PRRT_… id
 * @param {boolean} resolved
 * @returns {object|null|undefined}
 */
export function stampThreadResolved(detail: any, threadNodeId: any, resolved: any) {
  if (!detail) return detail;
  const tid = threadNodeId != null ? String(threadNodeId).trim() : '';
  if (!tid) return detail;
  const nextResolved = Boolean(resolved);
  const stampC = (c: any) =>
    c && String(c.threadNodeId || '') === tid
      ? { ...c, resolved: nextResolved }
      : c;
  const prevStamps =
    detail._resolveStamps && typeof detail._resolveStamps === 'object'
      ? detail._resolveStamps
      : {};
  return {
    ...detail,
    reviewComments: Array.isArray(detail.reviewComments)
      ? detail.reviewComments.map(stampC)
      : detail.reviewComments,
    reviewThreads: Array.isArray(detail.reviewThreads)
      ? detail.reviewThreads.map((t: any) =>
          t && String(t.threadNodeId || '') === tid
            ? { ...t, resolved: nextResolved }
            : t
        )
      : detail.reviewThreads,
    _resolveStamps: { ...prevStamps, [tid]: nextResolved },
  };
}

/**
 * Re-apply `_resolveStamps` onto reviewComments / reviewThreads and drop stamps
 * that the host snapshot already matches (write-through convergence).
 * @param {object|null|undefined} detail
 * @param {Record<string, boolean>|null|undefined} stamps
 * @returns {object|null|undefined}
 */
export function applyResolveStamps(detail: any, stamps: any) {
  if (!detail) return detail;
  const map =
    stamps && typeof stamps === 'object' && !Array.isArray(stamps)
      ? stamps
      : detail._resolveStamps && typeof detail._resolveStamps === 'object'
        ? detail._resolveStamps
        : null;
  if (!map || !Object.keys(map).length) {
    return detail._resolveStamps
      ? { ...detail, _resolveStamps: undefined }
      : detail;
  }
  const remaining: Record<string, boolean> = { ...map };
  const inComments = Array.isArray(detail.reviewComments)
    ? detail.reviewComments
    : [];
  const inThreads = Array.isArray(detail.reviewThreads)
    ? detail.reviewThreads
    : [];
  // Drop stamps only when input already agrees (host caught up) — not after
  // we force-apply, which would always clear.
  for (const tid of Object.keys(remaining)) {
    const want = Boolean(remaining[tid]);
    const relatedC = inComments.filter(
      (c: any) => c && String(c.threadNodeId || '') === tid
    );
    const relatedT = inThreads.filter(
      (t: any) => t && String(t.threadNodeId || '') === tid
    );
    if (relatedC.length === 0 && relatedT.length === 0) continue;
    const allAgree =
      (relatedC.length === 0 ||
        relatedC.every((c: any) => Boolean(c.resolved) === want)) &&
      (relatedT.length === 0 ||
        relatedT.every((t: any) => Boolean(t.resolved) === want));
    if (allAgree) delete remaining[tid];
  }
  const stampC = (c: any) => {
    if (!c) return c;
    const tid = String(c.threadNodeId || '');
    if (!tid || !Object.prototype.hasOwnProperty.call(map, tid)) return c;
    const want = Boolean(map[tid]);
    if (Boolean(c.resolved) === want) return c;
    return { ...c, resolved: want };
  };
  return {
    ...detail,
    reviewComments: inComments.map(stampC),
    reviewThreads: inThreads.map(stampC),
    _resolveStamps:
      Object.keys(remaining).length > 0 ? remaining : undefined,
  };
}
