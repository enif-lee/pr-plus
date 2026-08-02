/**
 * Fetch feature unit: mappers
 */
export function mapApiPullRequest(pr: any) {
  const author = pr.user?.login || '';
  const authorAvatarUrl = pr.user?.avatar_url || '';
  const labels = Array.isArray(pr.labels)
    ? pr.labels.map((l) => ({
        name: l?.name || String(l || ''),
        color: l?.color || '',
        description: l?.description || '',
      })).filter((l) => l.name)
    : [];
  const assignees = Array.isArray(pr.assignees)
    ? pr.assignees.map((u) => u?.login || u).filter(Boolean)
    : [];
  const requestedReviewers = Array.isArray(pr.requested_reviewers)
    ? pr.requested_reviewers.map((u) => u?.login || u).filter(Boolean)
    : [];
  /** login → avatar_url for people chips */
  const avatarUrls = {};
  const putUser = (u) => {
    const login = u?.login || (typeof u === 'string' ? u : '');
    const url = u?.avatar_url || '';
    if (login && url) avatarUrls[String(login).toLowerCase()] = url;
  };
  putUser(pr.user);
  for (const u of pr.assignees || []) putUser(u);
  for (const u of pr.requested_reviewers || []) putUser(u);

  const milestone = pr.milestone
    ? {
        number: pr.milestone.number,
        title: pr.milestone.title || '',
        state: pr.milestone.state || '',
        dueOn: pr.milestone.due_on || null,
      }
    : null;

  return {
    number: pr.number,
    title: pr.title,
    // Body required so attachMagicLinks/prMatchText can match description tokens
    body: pr.body || '',
    headRef: pr.head?.ref || '',
    baseRef: pr.base?.ref || '',
    author,
    authorAvatarUrl,
    draft: Boolean(pr.draft),
    htmlUrl: pr.html_url,
    labels,
    assignees,
    requestedReviewers,
    milestone,
    avatarUrls,
    // Optional stats when present on full list items
    additions: pr.additions ?? null,
    deletions: pr.deletions ?? null,
    changedFiles: pr.changed_files ?? null,
    // Official PR review-comment count (not thread count). Used to skip GraphQL
    // escalate when 0 and to size REST windows.
    reviewCommentsCount:
      pr.review_comments != null && Number.isFinite(Number(pr.review_comments))
        ? Number(pr.review_comments)
        : null,
    nodeId: pr.node_id || null,
  };
}

export function mapPrCommitRow(c: any) {
  return {
    sha: c?.sha || '',
    message: c?.commit?.message || c?.message || '',
    author: c?.commit?.author?.name || c?.author?.login || c?.author || '',
    date: c?.commit?.author?.date || c?.commit?.committer?.date || c?.date || '',
  };
}

/**
 * First page of PR commits (oldest-first, per_page=100). Independent of fetchPrDetail.
 */
export function commentsPageHelpers() {
  try {
    let mod =
      typeof globalThis !== 'undefined' ? globalThis.PRModalCommentsPage : null;
    if (!mod && typeof require === 'function') {
      try {
        mod = require('./modal/pure/comments-page.js');
      } catch {
        mod = null;
      }
    }
    return mod;
  } catch {
    return null;
  }
}

export function mapRestReactions(raw: any) {
  // Inline REST summary → groups (keep fetch free of modal pure deps at runtime)
  const DEFS = [
    '+1',
    '-1',
    'laugh',
    'hooray',
    'confused',
    'heart',
    'rocket',
    'eyes',
  ];
  if (!raw || typeof raw !== 'object') return [];
  const out = [];
  for (const content of DEFS) {
    const count = Number(raw[content]) || 0;
    if (count <= 0) continue;
    out.push({ content, count, viewerHasReacted: false, users: [] });
  }
  return out;
}

export const GQL_REACTION_TO_REST = {
  THUMBS_UP: '+1',
  THUMBS_DOWN: '-1',
  LAUGH: 'laugh',
  HOORAY: 'hooray',
  CONFUSED: 'confused',
  HEART: 'heart',
  ROCKET: 'rocket',
  EYES: 'eyes',
  '+1': '+1',
  '-1': '-1',
  laugh: 'laugh',
  hooray: 'hooray',
  confused: 'confused',
  heart: 'heart',
  rocket: 'rocket',
  eyes: 'eyes',
};

export function extractReactorLogins(reactors: any) {
  const nodes = reactors?.nodes || [];
  const out = [];
  const seen = new Set();
  for (const n of Array.isArray(nodes) ? nodes : []) {
    const login = String(n?.login || '').trim();
    if (!login) continue;
    const key = login.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(login);
  }
  return out;
}

export function mapGraphqlReactionGroups(groups: any) {
  if (!Array.isArray(groups)) return [];
  const order = [
    '+1',
    '-1',
    'laugh',
    'hooray',
    'confused',
    'heart',
    'rocket',
    'eyes',
  ];
  const by = new Map();
  for (const g of groups) {
    if (!g) continue;
    const content =
      GQL_REACTION_TO_REST[String(g.content || '').toUpperCase()] ||
      GQL_REACTION_TO_REST[String(g.content || '')] ||
      null;
    if (!content) continue;
    const users = extractReactorLogins(g.reactors);
    const count = Number(
      g.reactors?.totalCount ?? g.users?.totalCount ?? users.length ?? 0
    );
    const viewerHasReacted = Boolean(g.viewerHasReacted);
    if (count <= 0 && !viewerHasReacted) continue;
    by.set(content, {
      content,
      count: Math.max(0, count, users.length),
      viewerHasReacted,
      users,
    });
  }
  return order.map((c) => by.get(c)).filter(Boolean);
}

/**
 * Batch-load reactionGroups for Reactable node IDs (issue comments, PR, …).
 * Default: count + viewerHasReacted only (no reactor login lists).
 * Pass `reactorsFirst` > 0 to include up to that many reactor logins per group.
 * @returns Map<nodeId, ReactionGroup[]>
 */
export function mapIssueComment(c: any) {
  return {
    id: c.id,
    author: c.user?.login || '',
    avatarUrl: c.user?.avatar_url || '',
    body: c.body || '',
    createdAt: c.created_at,
    nodeId: c.node_id || null,
    reactions: mapRestReactions(c.reactions),
  };
}

export function mapReviewComment(c, extra: any = {}) {
  const subjectTypeRaw = String(
    extra.subjectType || c.subject_type || c.subjectType || ''
  ).toLowerCase();
  const isFileSubject = subjectTypeRaw === 'file';
  // Pending-review comments often omit line and only have position/original_line
  // File-level comments intentionally have no line.
  const line = isFileSubject
    ? null
    : c.line ??
      c.original_line ??
      (c.position != null && Number.isFinite(Number(c.position))
        ? Number(c.position)
        : null);
  // REST has no outdated flag — infer when line is gone but original_line remains
  const outdated =
    extra.outdated != null
      ? Boolean(extra.outdated)
      : c.outdated != null
        ? Boolean(c.outdated)
        : !isFileSubject && c.line == null && c.original_line != null;
  // Prefer explicit subject_type; otherwise path-only (no line) → file
  const subjectType =
    isFileSubject ||
    (line == null && !c.original_line && c.path && subjectTypeRaw !== 'line')
      ? 'file'
      : 'line';
  return {
    id: c.id,
    author: c.user?.login || '',
    avatarUrl: c.user?.avatar_url || '',
    body: c.body || '',
    path: c.path || '',
    line: line != null ? Number(line) : null,
    originalLine: subjectType === 'file' ? null : c.original_line ?? null,
    startLine: subjectType === 'file' ? null : c.start_line ?? null,
    side: c.side || 'RIGHT',
    startSide: c.start_side || null,
    diffHunk: c.diff_hunk || c.diffHunk || '',
    createdAt: c.created_at,
    inReplyToId: c.in_reply_to_id ?? null,
    nodeId: c.node_id || null,
    reactions: mapRestReactions(c.reactions),
    threadNodeId: extra.threadNodeId ?? null,
    /** Pull request review id (groups file threads under one review event). */
    reviewId:
      c.pull_request_review_id != null
        ? Number(c.pull_request_review_id)
        : extra.reviewId != null
          ? Number(extra.reviewId)
          : null,
    resolved: Boolean(extra.resolved),
    outdated,
    /** True when part of a not-yet-submitted PENDING review (hidden from main list). */
    pending: Boolean(extra.pending || c.pending),
    pendingReviewId: extra.pendingReviewId ?? c.pendingReviewId ?? null,
    /** `file` | `line` — file-level comments have no line anchor. */
    subjectType,
  };
}

/**
 * Map a GraphQL PullRequestReviewComment node (+ parent thread meta) → app shape.
 */
export function mapGraphqlReviewCommentNode(node, threadMeta: any = {}) {
  if (!node) return null;
  const id = node.databaseId ?? null;
  if (id == null) return null;
  const reviewState = String(node.pullRequestReview?.state || '').toUpperCase();
  const pending = reviewState === 'PENDING';
  const reviewDbId =
    node.pullRequestReview?.databaseId != null
      ? Number(node.pullRequestReview.databaseId)
      : null;
  const subjectTypeRaw = String(
    threadMeta.subjectType || node.subjectType || ''
  ).toUpperCase();
  const isFile = subjectTypeRaw === 'FILE';
  const line = isFile
    ? null
    : node.line != null
      ? Number(node.line)
      : node.originalLine != null
        ? Number(node.originalLine)
        : null;
  const sideRaw = threadMeta.diffSide || threadMeta.side || 'RIGHT';
  const side = String(sideRaw).toUpperCase() === 'LEFT' ? 'LEFT' : 'RIGHT';
  return {
    id: Number(id),
    author: node.author?.login || '',
    avatarUrl: node.author?.avatarUrl || '',
    body: node.body || '',
    path: node.path || threadMeta.path || '',
    line,
    originalLine: isFile ? null : node.originalLine ?? null,
    startLine: isFile ? null : node.startLine ?? node.originalStartLine ?? null,
    side,
    startSide: threadMeta.startDiffSide || null,
    diffHunk: node.diffHunk || '',
    createdAt: node.createdAt || null,
    inReplyToId: node.replyTo?.databaseId ?? null,
    nodeId: node.id || null,
    reactions: mapGraphqlReactionGroups(node.reactionGroups),
    threadNodeId: threadMeta.threadNodeId || null,
    reviewId: reviewDbId,
    resolved: Boolean(threadMeta.resolved),
    outdated: Boolean(node.outdated ?? threadMeta.isOutdated),
    pending,
    pendingReviewId: pending ? reviewDbId : null,
    subjectType: isFile ? 'file' : 'line',
  };
}

/**
 * Merge published / GraphQL review comments with PENDING-only rows.
 * GraphQL rows win for threadNodeId / outdated / diffHunk; pending flag merges in.
 */
export function extractRepoMergeMethodFlags(repo: any) {
  if (!repo || typeof repo !== 'object') return null;
  const has =
    Object.prototype.hasOwnProperty.call(repo, 'allow_merge_commit') ||
    Object.prototype.hasOwnProperty.call(repo, 'allow_squash_merge') ||
    Object.prototype.hasOwnProperty.call(repo, 'allow_rebase_merge');
  if (!has) return null;
  const flag = (v: unknown): boolean | null =>
    v === true || v === false ? v : null;
  return {
    allowMergeCommit: flag(repo.allow_merge_commit),
    allowSquashMerge: flag(repo.allow_squash_merge),
    allowRebaseMerge: flag(repo.allow_rebase_merge),
  };
}

/**
 * Viewer may admin-bypass branch protection / rules (GitHub "bypass rules" merge).
 * REST nested `pull.base.repo` usually omits `permissions`; GET /repos includes them.
 * @returns {boolean|null} true/false when known, null when payload has no permissions
 */
export function extractViewerCanMergeAsAdmin(repo: any): boolean | null {
  if (!repo || typeof repo !== 'object') return null;
  const p = repo.permissions;
  if (!p || typeof p !== 'object') return null;
  if (p.admin === true) return true;
  if (p.admin === false) return false;
  return null;
}

/**
 * Ensure mergeable/mergeable_state are computed; when dirty, attach conflict paths.
 * @returns {Promise<object>} pr with optional `_conflictFiles`
 */
export function mapGraphqlReviewCommentToRest(c, fallback: any = {}) {
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
export function mapViewerSubscription(state: any) {
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
export function mapAndAnnotateFiles(files: any, gitattributesText: any = '') {
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
