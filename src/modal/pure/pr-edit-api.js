/**
 * Pure request builders for PR metadata edits, comment edits, and suggestion apply.
 * Unit-tested without network; fetch layer uses the same shapes.
 */

function buildUpdatePullRequest(owner, repo, pullNumber, fields = {}) {
  const body = {};
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

function buildEditIssueComment(owner, repo, commentId, body) {
  return {
    method: 'PATCH',
    url: `https://api.github.com/repos/${owner}/${repo}/issues/comments/${commentId}`,
    body: { body: String(body || '') },
  };
}

function buildEditReviewComment(owner, repo, commentId, body) {
  return {
    method: 'PATCH',
    url: `https://api.github.com/repos/${owner}/${repo}/pulls/comments/${commentId}`,
    body: { body: String(body || '') },
  };
}

function buildRequestReviewers(owner, repo, pullNumber, { reviewers = [], teamReviewers = [] } = {}) {
  return {
    method: 'POST',
    url: `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}/requested_reviewers`,
    body: {
      reviewers: reviewers.slice(),
      team_reviewers: teamReviewers.slice(),
    },
  };
}

function buildRemoveReviewers(owner, repo, pullNumber, { reviewers = [], teamReviewers = [] } = {}) {
  return {
    method: 'DELETE',
    url: `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}/requested_reviewers`,
    body: {
      reviewers: reviewers.slice(),
      team_reviewers: teamReviewers.slice(),
    },
  };
}

function buildSetAssignees(owner, repo, issueNumber, assignees) {
  return {
    method: 'POST',
    url: `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/assignees`,
    body: { assignees: (assignees || []).slice() },
  };
}

function buildRemoveAssignees(owner, repo, issueNumber, assignees) {
  return {
    method: 'DELETE',
    url: `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/assignees`,
    body: { assignees: (assignees || []).slice() },
  };
}

function buildSetLabels(owner, repo, issueNumber, labels) {
  return {
    method: 'PUT',
    url: `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/labels`,
    body: { labels: (labels || []).slice() },
  };
}

/** Merge PR via REST. mergeMethod: merge | squash | rebase */
function buildMergePullRequest(owner, repo, pullNumber, { mergeMethod = 'merge', commitTitle, commitMessage } = {}) {
  const body = { merge_method: mergeMethod };
  if (commitTitle != null) body.commit_title = String(commitTitle);
  if (commitMessage != null) body.commit_message = String(commitMessage);
  return {
    method: 'PUT',
    url: `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}/merge`,
    body,
  };
}

/** Update PR head branch with latest base (update branch button). */
function buildUpdateBranch(owner, repo, pullNumber, { expectedHeadSha } = {}) {
  const body = {};
  if (expectedHeadSha) body.expected_head_sha = String(expectedHeadSha);
  return {
    method: 'PUT',
    url: `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}/update-branch`,
    body,
  };
}

/** Issue/PR subscription (notifications). */
function buildSetSubscription(owner, repo, issueNumber, { subscribed = true, ignored = false } = {}) {
  return {
    method: 'PUT',
    url: `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/subscription`,
    body: { subscribed: Boolean(subscribed), ignored: Boolean(ignored) },
  };
}

function buildDeleteSubscription(owner, repo, issueNumber) {
  return {
    method: 'DELETE',
    url: `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/subscription`,
    body: null,
  };
}

/** Set or clear milestone on the PR issue. */
function buildSetMilestone(owner, repo, issueNumber, milestoneNumber) {
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
function buildDraftStageGraphql(stage, pullRequestId) {
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
 * Extract linked issue numbers from PR body (closes/fixes/refs #N and bare #N).
 * @returns {number[]}
 */
function parseLinkedIssueNumbers(body) {
  const text = body == null ? '' : String(body);
  const nums = new Set();
  const re = /(?:(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+)?#(\d+)/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > 0) nums.add(n);
  }
  return [...nums].sort((a, b) => a - b);
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
function buildRerequestReviewerLogins(detail) {
  const d = detail || {};
  const pending = new Set(
    (d.requestedReviewers || [])
      .map((x) => String(x || '').trim())
      .filter(Boolean)
      .map((x) => x.toLowerCase())
  );
  const author = String(d.author || '')
    .trim()
    .toLowerCase();
  const out = [];
  const seen = new Set();

  function consider(login) {
    const raw = String(login || '').trim();
    if (!raw) return;
    const key = raw.toLowerCase();
    if (author && key === author) return;
    if (pending.has(key)) return; // already requested → would 422
    if (seen.has(key)) return;
    seen.add(key);
    out.push(raw);
  }

  for (const r of d.reviews || []) {
    consider(r?.author);
  }
  for (const login of d.extraLogins || []) {
    consider(login);
  }
  return out;
}

/**
 * Parse GitHub ```suggestion fences from a comment body.
 * @returns {Array<{ content: string, raw: string }>}
 */
function parseSuggestionFences(body) {
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
function applySuggestionToFileContent(fileContent, { startLine, endLine, suggestion }) {
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
function buildApplySuggestionCommitRequest(
  owner,
  repo,
  {
    path,
    branch,
    contentBase64,
    sha,
    message,
  }
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
function mapLeaveReviewAction(action) {
  const a = String(action || '').toLowerCase();
  if (a === 'approve') return { kind: 'review', event: 'APPROVE' };
  if (a === 'request_changes' || a === 'request-changes') {
    return { kind: 'review', event: 'REQUEST_CHANGES' };
  }
  return { kind: 'issue-comment', event: 'COMMENT' };
}

/**
 * Map GitHub REST review-comment payload → app shape (optimistic UI).
 * Used after postReviewComment / replyToReviewComment so diff virtual rows
 * and groupReviewThreads update before the next full refresh.
 * @param {object|null} raw REST response body
 * @param {object} [fallback] path/line/body when raw is partial
 */
function mapRestReviewComment(raw, fallback = {}) {
  if (!raw && !fallback.body && fallback.line == null) return null;
  const r = raw || {};
  return {
    id: r.id ?? fallback.id ?? null,
    author: r.user?.login || fallback.author || '',
    body: r.body || fallback.body || '',
    path: r.path || fallback.path || '',
    line: r.line ?? r.original_line ?? fallback.line ?? null,
    originalLine: r.original_line ?? null,
    startLine: r.start_line ?? fallback.startLine ?? null,
    side: r.side || fallback.side || 'RIGHT',
    startSide: r.start_side || null,
    diffHunk: r.diff_hunk || '',
    createdAt: r.created_at || fallback.createdAt || null,
    inReplyToId: r.in_reply_to_id ?? fallback.inReplyToId ?? null,
    nodeId: r.node_id || null,
    threadNodeId: fallback.threadNodeId || null,
    resolved: false,
  };
}

/**
 * Map GitHub REST issue comment payload → app shape.
 */
function mapRestIssueComment(raw, fallback = {}) {
  if (!raw && !fallback.body) return null;
  const r = raw || {};
  return {
    id: r.id ?? fallback.id ?? null,
    author: r.user?.login || fallback.author || '',
    body: r.body || fallback.body || '',
    createdAt: r.created_at || fallback.createdAt || null,
    htmlUrl: r.html_url || null,
  };
}

/**
 * Append an optimistic review comment into a detail-like snapshot.
 * @param {{ reviewComments?: Array }} detail
 * @param {object|null} comment mapped comment
 */
function appendOptimisticReviewComment(detail, comment) {
  const base = detail || {};
  if (!comment || comment.id == null) return base;
  const list = Array.isArray(base.reviewComments) ? base.reviewComments.slice() : [];
  if (list.some((c) => String(c.id) === String(comment.id))) {
    return { ...base, reviewComments: list };
  }
  list.push(comment);
  return { ...base, reviewComments: list };
}

const api = {
  buildUpdatePullRequest,
  buildEditIssueComment,
  buildEditReviewComment,
  buildRequestReviewers,
  buildRemoveReviewers,
  buildSetAssignees,
  buildRemoveAssignees,
  buildSetLabels,
  buildMergePullRequest,
  buildUpdateBranch,
  buildSetSubscription,
  buildDeleteSubscription,
  buildSetMilestone,
  buildDraftStageGraphql,
  parseLinkedIssueNumbers,
  buildRerequestReviewerLogins,
  parseSuggestionFences,
  applySuggestionToFileContent,
  buildApplySuggestionCommitRequest,
  mapLeaveReviewAction,
  mapRestReviewComment,
  mapRestIssueComment,
  appendOptimisticReviewComment,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}
if (typeof globalThis !== 'undefined') {
  globalThis.PRModalPrEditApi = api;
}
