/**
 * Fetch open PR branch metadata via GitHub REST API.
 * List up to 100 open PRs, then fill page-visible dangling PRs via single-PR gets.
 */


function githubRestUrl(path) {
  try {
    if (globalThis.PRGithubEndpoints && typeof globalThis.PRGithubEndpoints.githubRestUrl === 'function') {
      return globalThis.PRGithubEndpoints.githubRestUrl(path);
    }
  } catch (_) {}
  const p = String(path || '');
  return 'https://api.github.com' + (p.startsWith('/') ? p : '/' + p);
}
function githubGraphqlUrl() {
  try {
    if (globalThis.PRGithubEndpoints && typeof globalThis.PRGithubEndpoints.githubGraphqlUrl === 'function') {
      return globalThis.PRGithubEndpoints.githubGraphqlUrl();
    }
  } catch (_) {}
  return 'https://api.github.com/graphql';
}
/**
 * Map REST pull list/item payload → app list row.
 * Includes labels / assignees / milestone so progressive modal sketch can paint
 * sidebar meta without waiting for full fetchPrDetail.
 */
function mapApiPullRequest(pr) {
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
    nodeId: pr.node_id || null,
  };
}

function buildApiHeaders(token) {
  const headers = { Accept: 'application/vnd.github+json' };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

/** Page PR numbers missing from the list-API result set. */
function findDanglingPrNumbers(pagePrNumbers, prs) {
  if (!Array.isArray(pagePrNumbers) || pagePrNumbers.length === 0) {
    return [];
  }
  const have = new Set((prs || []).map((pr) => pr.number));
  const dangling = [];
  const seen = new Set();
  for (const raw of pagePrNumbers) {
    const num = Number(raw);
    if (!Number.isFinite(num) || seen.has(num) || have.has(num)) continue;
    seen.add(num);
    dangling.push(num);
  }
  return dangling;
}

async function mapWithConcurrency(items, limit, worker) {
  if (!items.length) return [];
  const results = new Array(items.length);
  let index = 0;

  async function run() {
    while (index < items.length) {
      const i = index++;
      results[i] = await worker(items[i], i);
    }
  }

  const runners = Array.from({ length: Math.min(limit, items.length) }, run);
  await Promise.all(runners);
  return results;
}

async function fetchOpenPullsPublic(owner, repo, fetchImpl, token = null) {
  const url = githubRestUrl(`/repos/${owner}/${repo}/pulls?state=open&per_page=100`);
  const res = await fetchImpl(url, {
    headers: buildApiHeaders(token),
  });
  if (!res.ok) {
    const err = new Error(`GitHub API ${res.status}: ${res.statusText}`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  return data.map(mapApiPullRequest);
}

async function fetchPullByNumber(owner, repo, pullNumber, fetchImpl, token = null) {
  const url = githubRestUrl(`/repos/${owner}/${repo}/pulls/${pullNumber}`);
  const res = await fetchImpl(url, {
    headers: buildApiHeaders(token),
  });
  if (!res.ok) {
    const err = new Error(`GitHub API ${res.status}: ${res.statusText} (PR #${pullNumber})`);
    err.status = res.status;
    err.pullNumber = pullNumber;
    throw err;
  }
  const data = await res.json();
  return mapApiPullRequest(data);
}

/**
 * Fetch dangling page PRs by number. Auth errors rethrow; other failures are skipped.
 */
async function fetchDanglingPulls(owner, repo, numbers, fetchImpl, token = null) {
  if (!numbers.length) return [];

  const settled = await mapWithConcurrency(numbers, 5, async (pullNumber) => {
    try {
      return await fetchPullByNumber(owner, repo, pullNumber, fetchImpl, token);
    } catch (err) {
      if (err.status === 401 || err.status === 403) {
        throw err;
      }
      console.warn(`[PR Tree] Skipping dangling PR #${pullNumber}:`, err.message || err);
      return null;
    }
  });

  return settled.filter(Boolean);
}

/**
 * Repo autolink rules (GitHub "magic" external references).
 * Requires admin on the token for the API; returns [] on 403/404.
 * @returns {Promise<Array<{key_prefix:string,url_template:string,is_alphanumeric:boolean}>>}
 */
async function fetchRepoAutolinks(owner, repo, fetchImpl, token = null) {
  const url = githubRestUrl(`/repos/${owner}/${repo}/autolinks`);
  try {
    const res = await fetchImpl(url, { headers: buildApiHeaders(token) });
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data
      .filter((a) => a && typeof a.key_prefix === 'string' && typeof a.url_template === 'string')
      .map((a) => ({
        key_prefix: a.key_prefix,
        url_template: a.url_template,
        is_alphanumeric: a.is_alphanumeric !== false,
      }));
  } catch {
    return [];
  }
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Build external magic-link URL from autolink rule + captured num.
 * Supports both `<num>` (GitHub) and `{num}` placeholders.
 */
function buildAutolinkUrl(urlTemplate, num) {
  return String(urlTemplate)
    .replace(/<num>/gi, num)
    .replace(/\{num\}/gi, num);
}

/**
 * Find autolink matches in free text (title, branch, body).
 * @returns {Array<{key:string,url:string,prefix:string}>}
 */
function matchAutolinksInText(text, autolinks) {
  if (!text || !Array.isArray(autolinks) || autolinks.length === 0) return [];

  const found = [];
  const seen = new Set();

  for (const rule of autolinks) {
    const prefix = rule.key_prefix;
    if (!prefix) continue;
    // Prefer pure digits after prefix (ENG-7 in feat/ENG-7-foo) before broader alnum ids.
    const numClass =
      rule.is_alphanumeric !== false
        ? '(?:\\d+|[A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)*)'
        : '\\d+';
    // Word-ish boundary before prefix so we don't match mid-token noise.
    const re = new RegExp(
      `(^|[^A-Za-z0-9_])(${escapeRegExp(prefix)})(${numClass})`,
      'gi'
    );
    let m;
    while ((m = re.exec(text)) !== null) {
      const key = `${m[2]}${m[3]}`;
      const url = buildAutolinkUrl(rule.url_template, m[3]);
      if (!url || seen.has(url)) continue;
      seen.add(url);
      found.push({ key, url, prefix: m[2] });
    }
  }

  return found;
}

/** Collect matchable text for a PR descriptor. */
function prMatchText(pr) {
  if (!pr) return '';
  return [pr.title, pr.headRef, pr.baseRef, pr.body, pr.author]
    .filter(Boolean)
    .join('\n');
}

/**
 * Attach `magicLinks` array onto each PR from repo autolink rules.
 */
function attachMagicLinks(prs, autolinks) {
  if (!Array.isArray(prs)) return [];
  if (!Array.isArray(autolinks) || autolinks.length === 0) {
    return prs.map((pr) => ({ ...pr, magicLinks: pr.magicLinks || [] }));
  }
  return prs.map((pr) => ({
    ...pr,
    magicLinks: matchAutolinksInText(prMatchText(pr), autolinks),
  }));
}

/**
 * @param {object} options
 * @param {string|null} [options.token]
 * @param {number[]} [options.pagePrNumbers] PR numbers visible on the pulls page
 * @param {boolean} [options.includeAutolinks=true]
 */
async function fetchOpenPulls(owner, repo, fetchImpl, options = {}) {
  const {
    token = null,
    pagePrNumbers = [],
    includeAutolinks = true,
  } = options;

  const listed = await fetchOpenPullsPublic(owner, repo, fetchImpl, token);
  const danglingNumbers = findDanglingPrNumbers(pagePrNumbers, listed);

  let prs = listed;
  if (danglingNumbers.length > 0) {
    const extras = await fetchDanglingPulls(
      owner,
      repo,
      danglingNumbers,
      fetchImpl,
      token
    );
    if (extras.length > 0) {
      const byNumber = new Map(listed.map((pr) => [pr.number, pr]));
      for (const pr of extras) {
        byNumber.set(pr.number, pr);
      }
      prs = [...byNumber.values()];
    }
  }

  if (!includeAutolinks) {
    return attachMagicLinks(prs, []);
  }

  const autolinks = await fetchRepoAutolinks(owner, repo, fetchImpl, token);
  return attachMagicLinks(prs, autolinks);
}

function decodeBase64Utf8(b64) {
  try {
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(b64, 'base64').toString('utf8');
    }
  } catch {
    /* fall through */
  }
  try {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    return '';
  }
}

async function apiJson(url, fetchImpl, token) {
  const res = await fetchImpl(url, { headers: buildApiHeaders(token) });
  if (!res.ok) {
    const err = new Error(`GitHub API ${res.status}: ${res.statusText}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

/**
 * JSON GET that also returns Link header for pagination.
 * @returns {Promise<{ data: any, link: string }>}
 */
async function apiJsonWithLink(url, fetchImpl, token) {
  const res = await fetchImpl(url, { headers: buildApiHeaders(token) });
  if (!res.ok) {
    const err = new Error(`GitHub API ${res.status}: ${res.statusText}`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  let link = '';
  try {
    if (typeof res.headers?.get === 'function') {
      link = res.headers.get('link') || res.headers.get('Link') || '';
    }
  } catch {
    link = '';
  }
  return { data, link };
}

/** Absolute URL for Link header rel=next (or null). */
function parseLinkNextUrl(linkHeader) {
  if (!linkHeader) return null;
  const parts = String(linkHeader).split(',');
  for (const p of parts) {
    const m = p.match(/<([^>]+)>\s*;\s*rel="?next"?/i);
    if (m) return m[1].trim();
  }
  return null;
}

/**
 * Walk REST list endpoints via Link rel=next until exhausted.
 * @param {string} firstUrl
 * @param {function} fetchImpl
 * @param {string|null} token
 * @param {{ maxPages?: number }} [opts]
 * @returns {Promise<Array>}
 */
async function fetchRestCollectionAll(firstUrl, fetchImpl, token, opts = {}) {
  const maxPages =
    Number.isFinite(opts.maxPages) && opts.maxPages > 0
      ? Math.floor(opts.maxPages)
      : 50;
  const all = [];
  let url = firstUrl;
  let pages = 0;
  while (url && pages < maxPages) {
    pages += 1;
    const { data, link } = await apiJsonWithLink(url, fetchImpl, token);
    if (!Array.isArray(data)) break;
    all.push(...data);
    if (data.length === 0) break;
    url = parseLinkNextUrl(link);
  }
  return all;
}

function mapPrCommitRow(c) {
  return {
    sha: c?.sha || '',
    message: c?.commit?.message || c?.message || '',
    author: c?.commit?.author?.name || c?.author?.login || c?.author || '',
    date: c?.commit?.author?.date || c?.commit?.committer?.date || c?.date || '',
  };
}

/**
 * All PR commits (paginated). GitHub returns oldest-first.
 */
async function fetchAllPrCommits(owner, repo, number, fetchImpl, token = null) {
  const o = String(owner || '').trim();
  const r = String(repo || '').trim();
  const n = Number(number);
  if (!o || !r || !Number.isFinite(n)) {
    throw new Error('owner, repo, and number are required for commits');
  }
  const first = githubRestUrl(
    `/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}/pulls/${n}/commits?per_page=100`
  );
  const raw = await fetchRestCollectionAll(first, fetchImpl, token);
  return raw.map(mapPrCommitRow).filter((c) => c.sha);
}

/**
 * All PR files (paginated) with collapse/annotation applied.
 */
async function fetchAllPrFiles(
  owner,
  repo,
  number,
  fetchImpl,
  token = null,
  options = {}
) {
  const o = String(owner || '').trim();
  const r = String(repo || '').trim();
  const n = Number(number);
  if (!o || !r || !Number.isFinite(n)) {
    throw new Error('owner, repo, and number are required for files');
  }
  const first = githubRestUrl(
    `/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}/pulls/${n}/files?per_page=100`
  );
  const raw = await fetchRestCollectionAll(first, fetchImpl, token);
  return mapAndAnnotateFiles(raw, options.gitattributesText || '');
}

const COMMENT_PAGE_SIZE = 50;

function commentsPageHelpers() {
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

function mapIssueComment(c) {
  return {
    id: c.id,
    author: c.user?.login || '',
    avatarUrl: c.user?.avatar_url || '',
    body: c.body || '',
    createdAt: c.created_at,
  };
}

function mapReviewComment(c, extra = {}) {
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
function mapGraphqlReviewCommentNode(node, threadMeta = {}) {
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
function mergePendingReviewComments(published, pendingList) {
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
function pickViewerPendingFromReviews(reviews, login) {
  const list = Array.isArray(reviews) ? reviews : [];
  const mine = list.filter((r) => {
    if (!r || String(r.state || '').toUpperCase() !== 'PENDING') return false;
    if (!login) return true;
    return (
      String(r.user?.login || '').toLowerCase() === String(login).toLowerCase()
    );
  });
  if (!mine.length) return null;
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
async function fetchViewerPendingReviewBundle(
  owner,
  repo,
  pullNumber,
  fetchImpl,
  token,
  preloaded = null
) {
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
      githubRestUrl(`/repos/${owner}/${repo}/pulls/${n}/reviews/${pending.id}/comments?per_page=100`),
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
async function fetchViewerPendingReviewComments(
  owner,
  repo,
  pullNumber,
  fetchImpl,
  token
) {
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
async function createPendingPullReview(
  owner,
  repo,
  pullNumber,
  { commitId } = {},
  fetchImpl,
  token
) {
  const body = {};
  if (commitId) body.commit_id = commitId;
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/pulls/${pullNumber}/reviews`),
    fetchImpl,
    token,
    { method: 'POST', body }
  );
}

/**
 * Submit an existing PENDING review.
 * POST /repos/{owner}/{repo}/pulls/{pull}/reviews/{review_id}/events
 */
async function submitPendingPullReview(
  owner,
  repo,
  pullNumber,
  reviewId,
  { event = 'COMMENT', body = '' } = {},
  fetchImpl,
  token
) {
  const id = Number(reviewId);
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error('Invalid pending review id');
  }
  const ev = String(event || 'COMMENT').toUpperCase();
  if (!['COMMENT', 'APPROVE', 'REQUEST_CHANGES'].includes(ev)) {
    throw new Error('Invalid review event');
  }
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/pulls/${pullNumber}/reviews/${id}/events`),
    fetchImpl,
    token,
    { method: 'POST', body: { event: ev, body: body || '' } }
  );
}

/**
 * Delete a PENDING review (discards all pending comments/replies on it).
 * DELETE /repos/{owner}/{repo}/pulls/{pull}/reviews/{review_id}
 */
async function deletePendingPullReview(
  owner,
  repo,
  pullNumber,
  reviewId,
  fetchImpl,
  token
) {
  const id = Number(reviewId);
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error('Invalid pending review id');
  }
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/pulls/${pullNumber}/reviews/${id}`),
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
async function fetchPrCommentsPage(
  owner,
  repo,
  pullNumber,
  kind,
  opts,
  fetchImpl,
  token
) {
  const helpers = commentsPageHelpers();
  const perPage =
    helpers?.clampPerPage?.(opts?.perPage) ||
    Math.min(100, Number(opts?.perPage) || COMMENT_PAGE_SIZE);
  let page = Math.max(1, Number(opts?.page) || 1);
  const since = opts?.since || null;
  // Prefer newest-first: review API supports direction=desc; issue comments
  // are ascending-only so we jump to Link rel=last on the first preferNewest fetch.
  const preferNewest = Boolean(opts?.preferNewest) && !since;
  const orderHint = opts?.order || null;

  async function fetchPage(pageNum, listOpts = {}) {
    const sort =
      listOpts.sort != null
        ? listOpts.sort
        : kind === 'review'
          ? 'created'
          : undefined;
    const direction =
      listOpts.direction != null
        ? listOpts.direction
        : kind === 'review'
          ? preferNewest || orderHint === 'desc'
            ? 'desc'
            : 'asc'
          : undefined;
    const url = helpers?.buildCommentsListUrl
      ? helpers.buildCommentsListUrl(kind, owner, repo, pullNumber, {
          page: pageNum,
          perPage,
          since,
          sort,
          direction,
        })
      : (() => {
          const base =
            kind === 'review'
              ? githubRestUrl(`/repos/${owner}/${repo}/pulls/${pullNumber}/comments`)
              : githubRestUrl(`/repos/${owner}/${repo}/issues/${pullNumber}/comments`);
          const q = new URLSearchParams({
            per_page: String(perPage),
            page: String(pageNum),
          });
          if (since) q.set('since', since);
          if (sort) q.set('sort', sort);
          if (direction) q.set('direction', direction);
          return `${base}?${q}`;
        })();
    const { data, link } = await apiJsonWithLink(url, fetchImpl, token);
    const raw = Array.isArray(data) ? data : [];
    const items =
      kind === 'review' ? raw.map(mapReviewComment) : raw.map(mapIssueComment);
    return { items, raw, link, pageNum };
  }

  // Issue comments: ascending only → first paint from last page (newest), then page-1…
  if (kind === 'issue' && preferNewest && page === 1 && !orderHint) {
    const probe = await fetchPage(1);
    const lastPage =
      (helpers?.parseLinkLastPage && helpers.parseLinkLastPage(probe.link)) ||
      null;
    if (lastPage != null && lastPage > 1) {
      const newest = await fetchPage(lastPage);
      const meta = helpers?.buildCommentsPageMeta
        ? helpers.buildCommentsPageMeta(newest.items, {
            page: lastPage,
            perPage,
            linkHeader: newest.link,
            since,
            order: 'from-end',
          })
        : {
            page: lastPage,
            perPage,
            hasMore: lastPage > 1,
            nextPage: lastPage > 1 ? lastPage - 1 : null,
            order: 'from-end',
            since,
            loadedCount: newest.items.length,
          };
      return { items: newest.items, meta, kind };
    }
    // Only one page — already the full set (oldest=newest window)
    const meta = helpers?.buildCommentsPageMeta
      ? helpers.buildCommentsPageMeta(probe.items, {
          page: 1,
          perPage,
          linkHeader: probe.link,
          since,
          order: 'from-end',
        })
      : {
          page: 1,
          perPage,
          hasMore: false,
          nextPage: null,
          order: 'from-end',
          since,
          loadedCount: probe.items.length,
        };
    return { items: probe.items, meta, kind };
  }

  // Continuing from-end (older pages) for issue comments
  if (kind === 'issue' && (orderHint === 'from-end' || opts?.order === 'from-end')) {
    const res = await fetchPage(page);
    const meta = helpers?.buildCommentsPageMeta
      ? helpers.buildCommentsPageMeta(res.items, {
          page,
          perPage,
          linkHeader: res.link,
          since,
          order: 'from-end',
        })
      : {
          page,
          perPage,
          hasMore: page > 1,
          nextPage: page > 1 ? page - 1 : null,
          order: 'from-end',
          since,
          loadedCount: res.items.length,
        };
    return { items: res.items, meta, kind };
  }

  // Review comments (and default issue): page 1 = newest when preferNewest
  const res = await fetchPage(page, {
    direction: kind === 'review' ? (preferNewest || orderHint === 'desc' ? 'desc' : 'asc') : undefined,
    sort: kind === 'review' ? 'created' : undefined,
  });
  const meta = helpers?.buildCommentsPageMeta
    ? helpers.buildCommentsPageMeta(res.items, {
        page,
        perPage,
        linkHeader: res.link,
        since,
        order: kind === 'review' && (preferNewest || orderHint === 'desc') ? 'desc' : 'asc',
      })
    : {
        page,
        perPage,
        hasMore: res.raw.length >= perPage,
        nextPage: res.raw.length >= perPage ? page + 1 : null,
        since,
        loadedCount: res.items.length,
      };
  return { items: res.items, meta, kind };
}

async function apiSend(url, fetchImpl, token, { method = 'GET', body } = {}) {
  const headers = buildApiHeaders(token);
  if (body != null) headers['Content-Type'] = 'application/json';
  const res = await fetchImpl(url, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const j = await res.json();
      if (j?.message) detail = j.message;
      // Surface field-level validation (common on 422 replies / review comments)
      if (Array.isArray(j?.errors) && j.errors.length) {
        const bits = j.errors
          .map((e) => {
            if (!e || typeof e !== 'object') return String(e);
            if (e.message) return e.message;
            const field = e.field || e.resource || '';
            const code = e.code || '';
            return [field, code].filter(Boolean).join(' ') || null;
          })
          .filter(Boolean);
        if (bits.length) detail = `${detail}: ${bits.join('; ')}`;
      }
    } catch {
      /* ignore */
    }
    const err = new Error(`GitHub API ${res.status}: ${detail}`);
    err.status = res.status;
    throw err;
  }
  if (res.status === 204) return null;
  return res.json();
}

/**
 * GraphQL client: HTTP 200 can still carry body.errors — treat those as failures.
 * @returns {Promise<object>} data field only
 */
async function apiGraphql(query, variables, fetchImpl, token) {
  const json = await apiSend(
    githubGraphqlUrl(),
    fetchImpl,
    token,
    { method: 'POST', body: { query, variables: variables || {} } }
  );
  if (json?.errors?.length) {
    const msg = json.errors
      .map((e) => e?.message || String(e))
      .filter(Boolean)
      .join('; ');
    const err = new Error(`GitHub GraphQL: ${msg || 'unknown error'}`);
    err.graphqlErrors = json.errors;
    err.status = 200;
    throw err;
  }
  return json?.data ?? null;
}

/** Thread node fields shared by first/last pagination queries. */
const REVIEW_THREAD_NODE_FIELDS = `
  id
  isResolved
  isOutdated
  path
  line
  originalLine
  startLine
  originalStartLine
  diffSide
  startDiffSide
  subjectType
  comments(first:100){
    nodes{
      id
      databaseId
      body
      path
      line
      originalLine
      startLine
      originalStartLine
      outdated
      diffHunk
      createdAt
      author { login avatarUrl }
      replyTo { databaseId }
      pullRequestReview { databaseId state }
    }
  }
`;

/** Oldest → newer (forward). */
const REVIEW_THREADS_FIRST_QUERY = `
query($owner:String!,$name:String!,$number:Int!,$n:Int!,$cursor:String){
  repository(owner:$owner,name:$name){
    pullRequest(number:$number){
      reviewThreads(first:$n, after:$cursor){
        totalCount
        pageInfo { hasNextPage hasPreviousPage startCursor endCursor }
        nodes { ${REVIEW_THREAD_NODE_FIELDS} }
      }
    }
  }
}`;

/** Newest ← older (backward). */
const REVIEW_THREADS_LAST_QUERY = `
query($owner:String!,$name:String!,$number:Int!,$n:Int!,$cursor:String){
  repository(owner:$owner,name:$name){
    pullRequest(number:$number){
      reviewThreads(last:$n, before:$cursor){
        totalCount
        pageInfo { hasNextPage hasPreviousPage startCursor endCursor }
        nodes { ${REVIEW_THREAD_NODE_FIELDS} }
      }
    }
  }
}`;

/** GraphQL connection / nodes(ids) hard cap. */
const REVIEW_THREADS_API_MAX = 100;
/** Default page size for dual-window expand (Load more / Load all). Matches API max. */
const REVIEW_THREADS_PAGE_SIZE = REVIEW_THREADS_API_MAX;

/**
 * Map GraphQL reviewThreads.nodes → { threads, comments }.
 */
function mapReviewThreadNodes(allNodes) {
  const threads = [];
  const comments = [];
  for (const t of Array.isArray(allNodes) ? allNodes : []) {
    if (!t?.id) continue;
    const threadMeta = {
      threadNodeId: t.id,
      resolved: Boolean(t.isResolved),
      isOutdated: Boolean(t.isOutdated),
      path: t.path || '',
      diffSide: t.diffSide || 'RIGHT',
      startDiffSide: t.startDiffSide || null,
      line: t.line ?? null,
      originalLine: t.originalLine ?? null,
      startLine: t.startLine ?? t.originalStartLine ?? null,
      subjectType: t.subjectType || null,
    };
    const commentIds = [];
    for (const node of t.comments?.nodes || []) {
      const mapped = mapGraphqlReviewCommentNode(node, threadMeta);
      if (!mapped) continue;
      comments.push(mapped);
      commentIds.push(mapped.id);
    }
    threads.push({
      threadNodeId: t.id,
      resolved: Boolean(t.isResolved),
      outdated: Boolean(t.isOutdated),
      path: t.path || '',
      line: t.line ?? t.originalLine ?? null,
      startLine: t.startLine ?? t.originalStartLine ?? null,
      side: t.diffSide || 'RIGHT',
      commentIds,
    });
  }
  return { threads, comments };
}

/**
 * Single GraphQL page of review threads.
 * @param {'newest'|'older'|'oldest'|'newer'} direction
 *   - newest: last:N (connection end = most recent)
 *   - older:  last:N before startCursor (expand newest window into older)
 *   - oldest: first:N (connection start = earliest)
 *   - newer:  first:N after endCursor (expand oldest window into newer)
 */
async function fetchReviewThreadsPage(
  owner,
  repo,
  pullNumber,
  { direction = 'newest', cursor = null, pageSize = REVIEW_THREADS_PAGE_SIZE } = {},
  fetchImpl,
  token
) {
  const empty = {
    threads: [],
    comments: [],
    hasMore: false,
    endCursor: null,
    startCursor: null,
    hasNextPage: false,
    hasPreviousPage: false,
    totalCount: null,
    pageCount: 0,
    direction,
  };
  if (!token) return empty;
  const n = Number(pullNumber);
  if (!Number.isFinite(n)) return empty;
  const size = Math.max(
    1,
    Math.min(REVIEW_THREADS_API_MAX, Number(pageSize) || REVIEW_THREADS_PAGE_SIZE)
  );
  const dir = String(direction || 'newest');
  const useLast = dir === 'newest' || dir === 'older';
  const query = useLast ? REVIEW_THREADS_LAST_QUERY : REVIEW_THREADS_FIRST_QUERY;
  // newest: last:N, cursor=null
  // older:  last:N, before=cursor (start of current newest window)
  // oldest: first:N, cursor=null
  // newer:  first:N, after=cursor (end of current oldest window)
  const data = await apiGraphql(
    query,
    {
      owner,
      name: repo,
      number: n,
      n: size,
      cursor: cursor || null,
    },
    fetchImpl,
    token
  );
  const conn = data?.repository?.pullRequest?.reviewThreads;
  const nodes = conn?.nodes || [];
  const pageInfo = conn?.pageInfo || {};
  const mapped = mapReviewThreadNodes(nodes);
  // Tag threads with load window for UI gap split
  const windowTag =
    dir === 'newest' || dir === 'older' ? 'newest' : 'oldest';
  for (const t of mapped.threads) {
    t.loadWindow = windowTag;
  }
  return {
    threads: mapped.threads,
    comments: mapped.comments,
    totalCount:
      typeof conn?.totalCount === 'number' ? conn.totalCount : null,
    startCursor: pageInfo.startCursor || null,
    endCursor: pageInfo.endCursor || null,
    hasNextPage: Boolean(pageInfo.hasNextPage),
    hasPreviousPage: Boolean(pageInfo.hasPreviousPage),
    // Convenience for dual-window UI
    hasMore:
      useLast
        ? Boolean(pageInfo.hasPreviousPage)
        : Boolean(pageInfo.hasNextPage),
    pageCount: 1,
    direction: dir,
    window: windowTag,
  };
}

/**
 * Collect GraphQL thread node ids (PRRT_…) that are unresolved in a detail snapshot.
 * Used for cache revalidate bulk refresh.
 * @param {object|null} detail
 * @returns {string[]}
 */
function collectUnresolvedThreadNodeIds(detail) {
  const dropped =
    detail?._droppedThreadNodeIds instanceof Set
      ? detail._droppedThreadNodeIds
      : new Set(
          Array.isArray(detail?._droppedThreadNodeIds)
            ? detail._droppedThreadNodeIds.map(String)
            : []
        );
  const ids = new Set();
  for (const t of Array.isArray(detail?.reviewThreads) ? detail.reviewThreads : []) {
    if (!t?.threadNodeId || t.resolved) continue;
    const id = String(t.threadNodeId);
    if (dropped.has(id)) continue;
    ids.add(id);
  }
  const list = Array.isArray(detail?.reviewComments) ? detail.reviewComments : [];
  const byId = new Map();
  for (const c of list) {
    if (c && c.id != null) byId.set(String(c.id), c);
  }
  for (const c of list) {
    if (!c?.threadNodeId || c.resolved) continue;
    const id = String(c.threadNodeId);
    if (dropped.has(id)) continue;
    const parentId = c.inReplyToId ?? c.in_reply_to_id ?? null;
    // Prefer roots (or orphans) — replies inherit resolved from thread meta anyway
    if (parentId != null && byId.has(String(parentId))) continue;
    ids.add(id);
  }
  return [...ids];
}

/**
 * Fetch specific review threads by GraphQL global ids (PRRT_…).
 * Batches in chunks of REVIEW_THREADS_API_MAX (100).
 * @param {string[]} threadNodeIds
 * @param {typeof fetch} fetchImpl
 * @param {string} token
 */
async function fetchReviewThreadsByIds(threadNodeIds, fetchImpl, token) {
  const empty = {
    threads: [],
    comments: [],
    pageCount: 0,
    direction: 'refresh',
    totalCount: null,
    hasPreviousPage: false,
    hasNextPage: false,
    requestedThreadIds: [],
    missingThreadIds: [],
  };
  if (!token) return empty;
  const ids = [
    ...new Set(
      (Array.isArray(threadNodeIds) ? threadNodeIds : [])
        .map((id) => String(id || '').trim())
        .filter(Boolean)
    ),
  ];
  if (!ids.length) return empty;

  const query = `
query($ids:[ID!]!){
  nodes(ids:$ids){
    ... on PullRequestReviewThread {
      ${REVIEW_THREAD_NODE_FIELDS}
    }
  }
}`;

  const allThreads = [];
  const allComments = [];
  const foundIds = new Set();
  let pages = 0;
  for (let i = 0; i < ids.length; i += REVIEW_THREADS_API_MAX) {
    const chunk = ids.slice(i, i + REVIEW_THREADS_API_MAX);
    try {
      const data = await apiGraphql(query, { ids: chunk }, fetchImpl, token);
      // nodes[] is parallel to requested ids; deleted/not-found → null
      const rawNodes = Array.isArray(data?.nodes) ? data.nodes : [];
      const nodes = rawNodes.filter(Boolean);
      const mapped = mapReviewThreadNodes(nodes);
      for (const t of mapped.threads) {
        t.loadWindow = t.loadWindow || 'refresh';
        if (t.threadNodeId) foundIds.add(String(t.threadNodeId));
      }
      // Also mark any non-null node id from raw (even if mapping skipped)
      for (const n of nodes) {
        if (n?.id) foundIds.add(String(n.id));
      }
      allThreads.push(...mapped.threads);
      allComments.push(...mapped.comments);
      pages += 1;
    } catch (err) {
      // One bad chunk must not block the rest — treat whole chunk as unknown
      // (not missing) so we don't mass-drop on transient GraphQL errors.
      console.warn(
        '[pr-plus] fetchReviewThreadsByIds chunk failed',
        err?.message || err
      );
    }
  }
  const missingThreadIds = ids.filter((id) => !foundIds.has(String(id)));
  return {
    threads: allThreads,
    comments: allComments,
    pageCount: pages,
    direction: 'refresh',
    totalCount: null,
    hasPreviousPage: false,
    hasNextPage: false,
    requestedThreadIds: ids,
    missingThreadIds,
  };
}

/**
 * Drop review threads (and their comments) that no longer exist remotely.
 * Records comment id tombstones so App mergeDetailPreserveOptimistic cannot
 * resurrect them across a racey host→local merge.
 *
 * @param {object|null} detail
 * @param {Iterable<string>|string[]|null|undefined} threadNodeIds
 * @returns {object|null}
 */
function dropReviewThreadsFromDetail(detail, threadNodeIds) {
  if (!detail) return detail;
  const drop = new Set(
    [...(threadNodeIds || [])]
      .map((id) => String(id || '').trim())
      .filter(Boolean)
  );
  if (!drop.size) return detail;

  const prevRc = Array.isArray(detail.reviewComments) ? detail.reviewComments : [];
  const prevTh = Array.isArray(detail.reviewThreads) ? detail.reviewThreads : [];
  const droppedCommentIds = [];
  const reviewComments = prevRc.filter((c) => {
    if (!c) return false;
    const tid = c.threadNodeId ? String(c.threadNodeId) : '';
    if (tid && drop.has(tid)) {
      if (c.id != null) droppedCommentIds.push(String(c.id));
      return false;
    }
    return true;
  });
  const reviewThreads = prevTh.filter(
    (t) => !t?.threadNodeId || !drop.has(String(t.threadNodeId))
  );

  const deleted = new Set(
    [
      ...(detail._deletedReviewCommentIds instanceof Set
        ? detail._deletedReviewCommentIds
        : Array.isArray(detail._deletedReviewCommentIds)
          ? detail._deletedReviewCommentIds
          : []),
      ...droppedCommentIds,
    ].map(String)
  );

  const prevMeta = detail.reviewThreadsMeta || emptyReviewThreadsMeta();
  const filterIdList = (list) =>
    (Array.isArray(list) ? list : [])
      .map(String)
      .filter((id) => id && !drop.has(id));
  const loadedThreadCount = reviewThreads.length;
  const totalCount = Math.max(
    0,
    Number(prevMeta.totalCount) || loadedThreadCount
  );
  // Prefer shrinking total when we know threads vanished (never inflate)
  const nextTotal =
    Number.isFinite(Number(prevMeta.totalCount)) &&
    Number(prevMeta.totalCount) >= drop.size
      ? Math.max(loadedThreadCount, Number(prevMeta.totalCount) - drop.size)
      : totalCount;
  const hiddenCount = Math.max(0, nextTotal - loadedThreadCount);

  const prevDroppedThreads =
    detail._droppedThreadNodeIds instanceof Set
      ? detail._droppedThreadNodeIds
      : Array.isArray(detail._droppedThreadNodeIds)
        ? detail._droppedThreadNodeIds
        : [];
  const droppedThreads = new Set([...prevDroppedThreads, ...drop].map(String));

  return {
    ...detail,
    reviewComments,
    reviewThreads,
    reviewCommentsMeta: {
      ...(detail.reviewCommentsMeta || {}),
      loadedCount: reviewComments.length,
    },
    reviewThreadsMeta: {
      ...prevMeta,
      totalCount: nextTotal,
      hiddenCount,
      loadedThreadCount,
      loadedCommentCount: reviewComments.length,
      newestThreadIds: filterIdList(prevMeta.newestThreadIds),
      oldestThreadIds: filterIdList(prevMeta.oldestThreadIds),
      hasMore: hiddenCount > 0,
      hasOlder: hiddenCount > 0 && Boolean(prevMeta.hasOlder),
      hasNewerFromOldest:
        hiddenCount > 0 && Boolean(prevMeta.hasNewerFromOldest),
    },
    _deletedReviewCommentIds: deleted.size ? deleted : detail._deletedReviewCommentIds,
    // Never re-request these PRRT ids in collectUnresolvedThreadNodeIds
    _droppedThreadNodeIds: droppedThreads,
  };
}

/**
 * Initial dual-window load: last:100 first, then start:20 only when total ≥ 100.
 * Small PRs (total < 100) load a single last window covering everything.
 */
async function fetchPullReviewThreadsBundle(
  owner,
  repo,
  pullNumber,
  fetchImpl,
  token,
  opts = {}
) {
  if (!token) {
    return {
      threads: [],
      comments: [],
      hasMore: false,
      endCursor: null,
      startCursor: null,
      pageCount: 0,
      totalCount: 0,
      reviewThreadsMeta: emptyReviewThreadsMeta(),
    };
  }
  const lastPageSize = Math.min(
    REVIEW_THREADS_API_MAX,
    Number(opts.pageSize) || REVIEW_THREADS_API_MAX
  );
  const startPageSize = Math.min(
    20,
    Number(opts.startPageSize) || 20
  );
  // Last (newest) first
  const newest = await fetchReviewThreadsPage(
    owner,
    repo,
    pullNumber,
    { direction: 'newest', cursor: null, pageSize: lastPageSize },
    fetchImpl,
    token
  );
  const totalCount = Number(newest.totalCount) || newest.threads.length;
  let oldest = null;
  // total < 100 → last page already covers all; skip start window
  if (totalCount >= REVIEW_THREADS_API_MAX && newest.hasPreviousPage) {
    try {
      oldest = await fetchReviewThreadsPage(
        owner,
        repo,
        pullNumber,
        {
          direction: 'oldest',
          cursor: null,
          pageSize: startPageSize,
        },
        fetchImpl,
        token
      );
    } catch {
      oldest = null;
    }
  }

  const threads = [...(newest.threads || [])];
  const comments = [...(newest.comments || [])];
  const newestIds = newest.threads.map((t) => t.threadNodeId).filter(Boolean);
  const oldestIds = [];
  if (oldest) {
    for (const t of oldest.threads || []) {
      if (!newestIds.includes(t.threadNodeId)) {
        threads.push(t);
        oldestIds.push(t.threadNodeId);
      }
    }
    for (const c of oldest.comments || []) {
      if (!comments.some((x) => String(x.id) === String(c.id))) comments.push(c);
    }
  }

  const loaded = threads.length;
  const hiddenCount = Math.max(0, totalCount - loaded);
  const meta = {
    totalCount,
    hiddenCount,
    loadedThreadCount: loaded,
    loadedCommentCount: comments.length,
    pagesLoaded: 1 + (oldest ? 1 : 0),
    // Newest window cursors (expand older with before: startCursor)
    newestStartCursor: newest.startCursor || null,
    newestEndCursor: newest.endCursor || null,
    hasOlder: Boolean(newest.hasPreviousPage),
    // Oldest window cursors (expand newer with after: endCursor)
    oldestStartCursor: oldest?.startCursor || null,
    oldestEndCursor: oldest?.endCursor || null,
    hasNewerFromOldest: Boolean(oldest?.hasNextPage),
    newestThreadIds: newestIds,
    oldestThreadIds: oldestIds,
    hasMore: hiddenCount > 0,
    endCursor: newest.startCursor || null, // legacy: load-more-older
  };

  return {
    threads,
    comments,
    hasMore: meta.hasMore,
    endCursor: meta.endCursor,
    startCursor: newest.startCursor || null,
    pageCount: meta.pagesLoaded,
    totalCount,
    reviewThreadsMeta: meta,
  };
}

function emptyReviewThreadsMeta() {
  return {
    totalCount: 0,
    hiddenCount: 0,
    loadedThreadCount: 0,
    loadedCommentCount: 0,
    pagesLoaded: 0,
    newestStartCursor: null,
    newestEndCursor: null,
    hasOlder: false,
    oldestStartCursor: null,
    oldestEndCursor: null,
    hasNewerFromOldest: false,
    newestThreadIds: [],
    oldestThreadIds: [],
    hasMore: false,
    endCursor: null,
  };
}

/**
 * Merge a dual-window page (or bulk refresh) into detail.reviewThreadsMeta + comments.
 * @param {'older'|'newer'|'newest'|'oldest'|'refresh'} direction
 *   - refresh: update thread/comment bodies only; keep dual-window cursors/id sets
 */
function mergeReviewThreadsPageIntoDetail(detail, page, direction = 'older') {
  if (!detail) return detail;
  const dir = String(direction || page?.direction || 'older');
  const prevMeta = detail.reviewThreadsMeta || emptyReviewThreadsMeta();
  const prevRc = Array.isArray(detail.reviewComments) ? detail.reviewComments : [];
  const prevTh = Array.isArray(detail.reviewThreads) ? detail.reviewThreads : [];

  // Explicit missing list from nodes(ids:) bulk fetch (remote-deleted threads)
  const explicitMissing = Array.isArray(page?.missingThreadIds)
    ? page.missingThreadIds.map(String).filter(Boolean)
    : [];
  // Or derive: requested − returned
  const requested = Array.isArray(page?.requestedThreadIds)
    ? page.requestedThreadIds.map(String).filter(Boolean)
    : [];
  const returnedIds = new Set(
    (page?.threads || [])
      .map((t) => (t?.threadNodeId ? String(t.threadNodeId) : ''))
      .filter(Boolean)
  );
  const derivedMissing =
    requested.length > 0
      ? requested.filter((id) => !returnedIds.has(id))
      : [];
  const missingIds = [
    ...new Set([...explicitMissing, ...derivedMissing]),
  ];

  // refresh/ids: replace comments for updated threads so new replies land and deleted ones drop
  let baseRc = prevRc;
  if ((dir === 'refresh' || dir === 'ids') && (page?.threads || []).length) {
    const refreshed = new Set(
      (page.threads || [])
        .map((t) => (t?.threadNodeId ? String(t.threadNodeId) : ''))
        .filter(Boolean)
    );
    if (refreshed.size) {
      baseRc = prevRc.filter(
        (c) => !c?.threadNodeId || !refreshed.has(String(c.threadNodeId))
      );
    }
  }
  const reviewComments = mergePendingReviewComments(baseRc, page?.comments || []);
  // When GraphQL thread meta updates resolved, stamp onto all comments in those threads
  const resolvedByThread = new Map();
  for (const t of page?.threads || []) {
    if (t?.threadNodeId) {
      resolvedByThread.set(String(t.threadNodeId), Boolean(t.resolved));
    }
  }
  const stampedComments =
    resolvedByThread.size === 0
      ? reviewComments
      : reviewComments.map((c) => {
          if (!c?.threadNodeId) return c;
          const key = String(c.threadNodeId);
          if (!resolvedByThread.has(key)) return c;
          return { ...c, resolved: resolvedByThread.get(key) };
        });

  const thById = new Map(
    prevTh.map((t) => [String(t.threadNodeId), t]).filter(([k]) => k && k !== 'undefined')
  );
  for (const t of page?.threads || []) {
    if (t?.threadNodeId) {
      thById.set(String(t.threadNodeId), {
        ...(thById.get(String(t.threadNodeId)) || {}),
        ...t,
      });
    }
  }
  const reviewThreads = [...thById.values()];

  let newestIds = new Set((prevMeta.newestThreadIds || []).map(String));
  let oldestIds = new Set((prevMeta.oldestThreadIds || []).map(String));
  const pageIds = (page?.threads || [])
    .map((t) => t.threadNodeId)
    .filter(Boolean)
    .map(String);

  let newestStartCursor = prevMeta.newestStartCursor;
  let newestEndCursor = prevMeta.newestEndCursor;
  let hasOlder = prevMeta.hasOlder;
  let oldestStartCursor = prevMeta.oldestStartCursor;
  let oldestEndCursor = prevMeta.oldestEndCursor;
  let hasNewerFromOldest = prevMeta.hasNewerFromOldest;

  if (dir === 'refresh' || dir === 'ids') {
    // Bulk / targeted revalidate — preserve dual-window pagination state
  } else if (dir === 'newest' || dir === 'older') {
    for (const id of pageIds) newestIds.add(id);
    // Expanding older moves the "start" of newest window further back
    if (page?.startCursor) newestStartCursor = page.startCursor;
    if (dir === 'newest' && page?.endCursor) newestEndCursor = page.endCursor;
    hasOlder = Boolean(page?.hasPreviousPage);
  } else {
    // oldest | newer — expand oldest window toward the middle
    for (const id of pageIds) oldestIds.add(id);
    if (page?.endCursor) oldestEndCursor = page.endCursor;
    if (dir === 'oldest' && page?.startCursor) oldestStartCursor = page.startCursor;
    hasNewerFromOldest = Boolean(page?.hasNextPage);
  }

  // Windows meet when no hidden left or cursors exhausted both ways
  const totalCount =
    typeof page?.totalCount === 'number'
      ? page.totalCount
      : Number(prevMeta.totalCount) || reviewThreads.length;
  const loadedThreadCount = reviewThreads.length;
  const hiddenCount = Math.max(0, totalCount - loadedThreadCount);

  // Drop ids from oldest that are now in newest (overlap)
  for (const id of newestIds) oldestIds.delete(id);

  const meta = {
    ...prevMeta,
    totalCount,
    hiddenCount,
    loadedThreadCount,
    loadedCommentCount: stampedComments.length,
    pagesLoaded:
      dir === 'refresh' || dir === 'ids'
        ? Number(prevMeta.pagesLoaded) || 0
        : (Number(prevMeta.pagesLoaded) || 0) + (page?.pageCount || 1),
    newestStartCursor,
    newestEndCursor,
    hasOlder: hiddenCount > 0 && hasOlder,
    oldestStartCursor,
    oldestEndCursor,
    hasNewerFromOldest: hiddenCount > 0 && hasNewerFromOldest,
    newestThreadIds: [...newestIds],
    oldestThreadIds: [...oldestIds],
    hasMore: hiddenCount > 0,
    endCursor: newestStartCursor,
  };

  let next = {
    ...detail,
    reviewComments: stampedComments,
    reviewThreads,
    reviewCommentsMeta: {
      ...(detail.reviewCommentsMeta || {}),
      loadedCount: stampedComments.length,
      hasMore: meta.hasMore,
    },
    reviewThreadsMeta: meta,
  };

  // Remote-deleted threads: GraphQL nodes(ids:) returns null — strip local zombies
  // so revalidate does not keep re-requesting dead PRRT ids forever.
  if ((dir === 'refresh' || dir === 'ids') && missingIds.length) {
    next = dropReviewThreadsFromDetail(next, missingIds);
  }
  return next;
}

/**
 * Fetch PR review threads (ids + isResolved) for resolve UI / legacy callers.
 * Returns [] on failure so REST detail still loads.
 */
async function fetchPullReviewThreads(owner, repo, pullNumber, fetchImpl, token) {
  try {
    const bundle = await fetchPullReviewThreadsBundle(
      owner,
      repo,
      pullNumber,
      fetchImpl,
      token
    );
    return bundle.threads || [];
  } catch {
    return [];
  }
}

/**
 * Full PR detail payload for the modal: header, body, files+patches,
 * issue comments, reviews, review comments, commits, checks.
 *
 * Partial by default: only the **first GraphQL page** of review threads
 * (see opts.threadsMaxPages / opts.skipReviewThreads). More pages load via
 * fetchReviewThreadsPage + mergeReviewThreadsPageIntoDetail.
 *
 * @param {{ skipReviewThreads?: boolean, threadsMaxPages?: number, threadsCursor?: string|null }} [opts]
 */
function fetchNowMs() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

/**
 * Time an async fetch and record ms into `timings[name]`.
 * Always logs to console for SW / page debugging.
 *
 * When `opts.batchStart` is set (ms from fetchNowMs), also records
 * `timings[name_start]` = offset from batch start (for parallel REST fan-out).
 *
 * @template T
 * @param {Record<string, number|string>} timings
 * @param {string} name
 * @param {Promise<T>} promise
 * @param {(result: T) => string} [extra]
 * @param {{ batchStart?: number }} [opts]
 * @returns {Promise<T>}
 */
async function timedFetch(timings, name, promise, extra, opts = {}) {
  const t0 = fetchNowMs();
  const batchStart =
    opts && Number.isFinite(opts.batchStart) ? Number(opts.batchStart) : null;
  if (batchStart != null) {
    timings[`${name}_start`] = Math.round(t0 - batchStart);
  }
  try {
    const result = await promise;
    const ms = Math.round(fetchNowMs() - t0);
    timings[name] = ms;
    let suffix = '';
    try {
      if (typeof extra === 'function') suffix = extra(result) || '';
    } catch {
      /* ignore extra formatting errors */
    }
    const startLabel =
      batchStart != null && timings[`${name}_start`] != null
        ? ` t+${timings[`${name}_start`]}ms`
        : '';
    console.log(
      `[pr-plus] fetchPrDetail ${name}: ${ms}ms${startLabel}${
        suffix ? ` ${suffix}` : ''
      }`
    );
    return result;
  } catch (err) {
    const ms = Math.round(fetchNowMs() - t0);
    timings[name] = ms;
    const msg = err?.message || String(err);
    timings[`${name}_error`] = msg;
    const startLabel =
      batchStart != null && timings[`${name}_start`] != null
        ? ` t+${timings[`${name}_start`]}ms`
        : '';
    console.log(
      `[pr-plus] fetchPrDetail ${name}: ${ms}ms${startLabel} ERROR ${msg}`
    );
    throw err;
  }
}

/**
 * Pretty-print parallel REST timings after Promise.all settles.
 * @param {Record<string, number|string>} timings
 * @param {string[]} names keys that participated in the batch
 * @param {number} wallMs wall-clock for Promise.all
 */
function logParallelRestSummary(timings, names, wallMs) {
  const rows = (Array.isArray(names) ? names : [])
    .map((name) => {
      const ms = Number(timings[name]);
      const start = Number(timings[`${name}_start`]);
      const err = timings[`${name}_error`];
      return {
        name,
        ms: Number.isFinite(ms) ? ms : null,
        start: Number.isFinite(start) ? start : null,
        error: err ? String(err) : null,
      };
    })
    .filter((r) => r.ms != null);
  rows.sort((a, b) => (b.ms || 0) - (a.ms || 0));
  const slowest = rows[0];
  const sum = rows.reduce((s, r) => s + (r.ms || 0), 0);
  const lines = rows.map((r) => {
    const bar =
      wallMs > 0 && r.ms != null
        ? '█'.repeat(Math.max(1, Math.round((r.ms / wallMs) * 20)))
        : '';
    const start = r.start != null ? `+${r.start}ms`.padStart(7) : '   n/a';
    const dur = r.ms != null ? `${r.ms}ms`.padStart(6) : '   n/a';
    const err = r.error ? ` ERR:${r.error.slice(0, 40)}` : '';
    return `  ${r.name.padEnd(16)} start${start}  dur${dur}  ${bar}${err}`;
  });
  console.log(
    `[pr-plus] fetchPrDetail parallel REST summary\n` +
      `  wall=${Math.round(wallMs)}ms  sum=${sum}ms  ` +
      `slowest=${slowest ? `${slowest.name}@${slowest.ms}ms` : 'n/a'}\n` +
      (lines.length ? lines.join('\n') : '  (no rows)')
  );
  timings.coreParallel = {
    wallMs: Math.round(wallMs),
    sumMs: sum,
    slowest: slowest ? { name: slowest.name, ms: slowest.ms } : null,
    byName: Object.fromEntries(rows.map((r) => [r.name, r.ms])),
  };
}

async function fetchPrDetail(
  owner,
  repo,
  pullNumber,
  fetchImpl,
  token = null,
  opts = {}
) {
  const base = githubRestUrl(`/repos/${owner}/${repo}`);
  const n = Number(pullNumber);
  const skipReviewThreads = Boolean(opts.skipReviewThreads);
  const threadsMaxPages = skipReviewThreads
    ? 0
    : Math.max(1, Math.min(20, Number(opts.threadsMaxPages) || 1));
  /** @type {Record<string, number|string>} */
  const timings = {};
  const tTotal0 = fetchNowMs();
  console.log(
    `[pr-plus] fetchPrDetail start ${owner}/${repo}#${n}` +
      ` skipReviewThreads=${skipReviewThreads} threadsMaxPages=${threadsMaxPages}`
  );

  // Core PR payload (no full thread dump) — parallel REST + light helpers
  const PARALLEL_REST_KEYS = [
    'pull',
    'files',
    'issueComments',
    'reviews',
    'commits',
    'viewerLogin',
    'autolinks',
  ];
  const tParallel0 = fetchNowMs();
  const batchOpt = { batchStart: tParallel0 };
  const [pr, files, commentsPage, reviews, commits, viewerLogin, autolinks] =
    await Promise.all([
      timedFetch(
        timings,
        'pull',
        apiJson(`${base}/pulls/${n}`, fetchImpl, token),
        null,
        batchOpt
      ),
      timedFetch(
        timings,
        'files',
        apiJson(`${base}/pulls/${n}/files?per_page=100`, fetchImpl, token),
        (r) => `(${Array.isArray(r) ? r.length : 0} files)`,
        batchOpt
      ),
      timedFetch(
        timings,
        'issueComments',
        fetchPrCommentsPage(
          owner,
          repo,
          n,
          'issue',
          { page: 1, perPage: COMMENT_PAGE_SIZE, preferNewest: true },
          fetchImpl,
          token
        ).catch(() => ({
          items: [],
          meta: {
            page: 1,
            perPage: COMMENT_PAGE_SIZE,
            hasMore: false,
            nextPage: null,
            order: 'from-end',
            loadedCount: 0,
          },
        })),
        (r) => `(${(r?.items || []).length} comments, newest-first)`,
        batchOpt
      ),
      timedFetch(
        timings,
        'reviews',
        apiJson(`${base}/pulls/${n}/reviews?per_page=100`, fetchImpl, token).catch(
          () => []
        ),
        (r) => `(${Array.isArray(r) ? r.length : 0} reviews)`,
        batchOpt
      ),
      timedFetch(
        timings,
        'commits',
        apiJson(`${base}/pulls/${n}/commits?per_page=100`, fetchImpl, token).catch(
          () => []
        ),
        (r) => `(${Array.isArray(r) ? r.length : 0} commits)`,
        batchOpt
      ),
      timedFetch(
        timings,
        'viewerLogin',
        fetchViewerLogin(fetchImpl, token),
        null,
        batchOpt
      ),
      timedFetch(
        timings,
        'autolinks',
        fetchRepoAutolinks(owner, repo, fetchImpl, token),
        (r) => `(${Array.isArray(r) ? r.length : 0} links)`,
        batchOpt
      ),
    ]);
  const parallelWall = fetchNowMs() - tParallel0;
  timings.coreParallelWall = Math.round(parallelWall);
  logParallelRestSummary(timings, PARALLEL_REST_KEYS, parallelWall);

  // GraphQL viewerSubscription (REST issues/.../subscription is 404 / dead)
  const subscription = await timedFetch(
    timings,
    'subscription',
    token
      ? fetchPullRequestSubscription(
          owner,
          repo,
          n,
          fetchImpl,
          token,
          pr?.node_id || null
        )
      : Promise.resolve(null)
  );
  const comments = commentsPage?.items || [];

  // First page (or zero) of review threads — not the full 500+ dump
  let reviewThreadBundle = {
    threads: [],
    comments: [],
    hasMore: false,
    endCursor: null,
    pageCount: 0,
  };
  if (token && threadsMaxPages > 0) {
    reviewThreadBundle = await timedFetch(
      timings,
      'reviewThreads',
      fetchPullReviewThreadsBundle(owner, repo, n, fetchImpl, token, {
        cursor: opts.threadsCursor || null,
        maxPages: threadsMaxPages,
      }).catch(() => reviewThreadBundle),
      (b) =>
        `(${(b?.threads || []).length} threads, ${(b?.comments || []).length} comments)`
    );
  } else {
    timings.reviewThreads = 0;
    console.log(
      `[pr-plus] fetchPrDetail reviewThreads: skipped (token=${Boolean(
        token
      )} maxPages=${threadsMaxPages})`
    );
  }

  const reviewThreads = reviewThreadBundle?.threads || [];
  // PENDING-only REST rows when GraphQL misses them
  let pendingBundle = { comments: [], review: null };
  if (token) {
    pendingBundle = await timedFetch(
      timings,
      'pendingReview',
      fetchViewerPendingReviewBundle(owner, repo, n, fetchImpl, token, {
        reviews,
        login: viewerLogin,
      }).catch(() => ({ comments: [], review: null })),
      (b) => `(${(b?.comments || []).length} pending comments)`
    );
  } else {
    timings.pendingReview = 0;
    console.log('[pr-plus] fetchPrDetail pendingReview: skipped (no token)');
  }
  const pendingReviewComments = pendingBundle.comments || [];
  const reviewComments = mergePendingReviewComments(
    reviewThreadBundle?.comments || [],
    pendingReviewComments
  );
  const viewerPendingReview = pendingBundle.review || null;
  const reviewCommentsMeta = {
    page: 1,
    perPage: (reviewThreadBundle?.comments || []).length || COMMENT_PAGE_SIZE,
    hasMore: Boolean(reviewThreadBundle?.hasMore),
    nextPage: null,
    loadedCount: (reviewComments || []).length,
  };
  const reviewThreadsMeta = reviewThreadBundle?.reviewThreadsMeta
    ? { ...reviewThreadBundle.reviewThreadsMeta }
    : {
        ...emptyReviewThreadsMeta(),
        hasMore: Boolean(reviewThreadBundle?.hasMore),
        endCursor: reviewThreadBundle?.endCursor || null,
        loadedThreadCount: (reviewThreads || []).length,
        loadedCommentCount: (reviewThreadBundle?.comments || []).length,
        pagesLoaded: reviewThreadBundle?.pageCount || (threadsMaxPages > 0 ? 1 : 0),
        totalCount: Number(reviewThreadBundle?.totalCount) || (reviewThreads || []).length,
        hiddenCount: Math.max(
          0,
          (Number(reviewThreadBundle?.totalCount) || 0) - (reviewThreads || []).length
        ),
      };

  const headSha = pr.head?.sha || '';
  let checks = { state: 'unknown', totalCount: 0, statuses: [], checkRuns: [] };
  if (headSha) {
    try {
      const status = await timedFetch(
        timings,
        'commitStatus',
        apiJson(`${base}/commits/${headSha}/status`, fetchImpl, token),
        (s) => `(state=${s?.state || '?'}, ${s?.total_count || 0} statuses)`
      );
      checks = {
        state: status.state || 'unknown',
        totalCount: status.total_count || 0,
        statuses: (status.statuses || []).map((s) => ({
          context: s.context || '',
          state: s.state || '',
          description: s.description || '',
          targetUrl: s.target_url || '',
          createdAt: s.created_at || '',
          updatedAt: s.updated_at || '',
        })),
        checkRuns: [],
      };
    } catch {
      /* timedFetch already logged */
    }
    try {
      // filter=latest: most recent check runs per suite (still de-dupe by name below)
      const runs = await timedFetch(
        timings,
        'checkRuns',
        apiJson(
          `${base}/commits/${headSha}/check-runs?per_page=100&filter=latest`,
          fetchImpl,
          token
        ),
        (r) => `(${(r?.check_runs || []).length} runs)`
      );
      const list = runs.check_runs || [];
      if (list.length) {
        checks.checkRuns = list.map((r) => ({
          id: r.id,
          name: r.name || '',
          status: r.status || '',
          conclusion: r.conclusion || '',
          htmlUrl: r.html_url || '',
          startedAt: r.started_at || '',
          completedAt: r.completed_at || '',
          appSlug: r.app?.slug || '',
          appName: r.app?.name || '',
        }));
      }
    } catch {
      /* timedFetch already logged */
    }
    // Keep only the latest status per context / check run per name (GitHub UI shape)
    const normalize =
      (typeof globalThis !== 'undefined' &&
        globalThis.PRModalChecks?.normalizeChecks) ||
      null;
    if (typeof normalize === 'function') {
      checks = normalize(checks);
    } else {
      // Fallback if pure helper not loaded (e.g. incomplete SW bundle)
      const byCtx = new Map();
      for (const s of checks.statuses || []) {
        const k = String(s.context || '').toLowerCase();
        if (!k) continue;
        const prev = byCtx.get(k);
        const t = Date.parse(s.updatedAt || s.createdAt || '') || 0;
        const pt = prev ? Date.parse(prev.updatedAt || prev.createdAt || '') || 0 : -1;
        if (!prev || t >= pt) byCtx.set(k, s);
      }
      const byName = new Map();
      for (const r of checks.checkRuns || []) {
        const k = String(r.name || '').toLowerCase();
        if (!k) continue;
        const prev = byName.get(k);
        const t = Date.parse(r.completedAt || r.startedAt || '') || Number(r.id) || 0;
        const pt = prev
          ? Date.parse(prev.completedAt || prev.startedAt || '') || Number(prev.id) || 0
          : -1;
        if (!prev || t >= pt) byName.set(k, r);
      }
      checks.statuses = [...byCtx.values()];
      checks.checkRuns = [...byName.values()];
      checks.totalCount = checks.statuses.length + checks.checkRuns.length;
    }
  } else {
    timings.commitStatus = 0;
    timings.checkRuns = 0;
    console.log('[pr-plus] fetchPrDetail checks: skipped (no headSha)');
  }

  // Optional .gitattributes for linguist-generated / binary collapse defaults
  let gitattributesText = '';
  try {
    const ref = headSha || pr.head?.ref || 'HEAD';
    const attr = await timedFetch(
      timings,
      'gitattributes',
      apiJson(
        `${base}/contents/.gitattributes?ref=${encodeURIComponent(ref)}`,
        fetchImpl,
        token
      ),
      (a) => (a?.content ? '(found)' : '(empty)')
    );
    if (attr?.content && attr.encoding === 'base64') {
      gitattributesText = decodeBase64Utf8(attr.content.replace(/\n/g, ''));
    } else if (typeof attr?.content === 'string') {
      gitattributesText = attr.content;
    }
  } catch {
    gitattributesText = '';
    if (timings.gitattributes == null) {
      timings.gitattributes = 0;
      console.log('[pr-plus] fetchPrDetail gitattributes: missing/skipped');
    }
  }

  const tMap0 = fetchNowMs();
  const filesOut = mapAndAnnotateFiles(files, gitattributesText);
  timings.mapAnnotateFiles = Math.round(fetchNowMs() - tMap0);
  console.log(
    `[pr-plus] fetchPrDetail mapAnnotateFiles: ${timings.mapAnnotateFiles}ms`
  );

  // Linked issue numbers from body (closing keywords / #N) — display only unless set via body edit
  let linkedIssues = [];
  try {
    let editApi =
      typeof globalThis !== 'undefined' ? globalThis.PRModalPrEditApi : null;
    if (!editApi && typeof require === 'function') {
      try {
        editApi = require('./modal/pure/pr-edit-api.js');
      } catch {
        editApi = null;
      }
    }
    if (editApi?.parseLinkedIssueNumbers) {
      linkedIssues = editApi.parseLinkedIssueNumbers(pr.body || '');
    }
  } catch {
    linkedIssues = [];
  }

  const subscribed =
    subscription && typeof subscription.subscribed === 'boolean'
      ? Boolean(subscription.subscribed)
      : null;
  // subscription.viewerSubscription kept for debugging / future UI (IGNORED)

  // Magic links from title/body/branch (body-only tokens e.g. ENG-99 must match)
  const magicLinks = matchAutolinksInText(
    prMatchText({
      title: pr.title,
      body: pr.body || '',
      headRef: pr.head?.ref || '',
      baseRef: pr.base?.ref || '',
      author: pr.user?.login || '',
    }),
    Array.isArray(autolinks) ? autolinks : []
  );

  timings.total = Math.round(fetchNowMs() - tTotal0);
  console.log(
    `[pr-plus] fetchPrDetail total: ${timings.total}ms`,
    JSON.stringify(timings)
  );
  if (typeof console.table === 'function') {
    try {
      console.table(timings);
    } catch {
      /* ignore */
    }
  }

  return {
    owner,
    repo,
    number: pr.number,
    nodeId: pr.node_id || null,
    title: pr.title,
    body: pr.body || '',
    state: pr.state,
    draft: Boolean(pr.draft),
    author: pr.user?.login || '',
    authorAvatarUrl: pr.user?.avatar_url || '',
    viewerLogin: viewerLogin || null,
    baseRef: pr.base?.ref || '',
    headRef: pr.head?.ref || '',
    baseSha: pr.base?.sha || '',
    /** Repo that owns the base ref (usually same as PR repo). */
    baseOwner: pr.base?.repo?.owner?.login || owner,
    baseRepo: pr.base?.repo?.name || repo,
    /** Head may be a fork — prefer head.repo when present. */
    headOwner: pr.head?.repo?.owner?.login || pr.head?.user?.login || owner,
    headRepo: pr.head?.repo?.name || repo,
    headSha,
    magicLinks,
    htmlUrl: pr.html_url,
    merged: Boolean(pr.merged),
    mergeable: pr.mergeable,
    mergeableState: pr.mergeable_state || null,
    rebaseable: pr.rebaseable ?? null,
    createdAt: pr.created_at,
    updatedAt: pr.updated_at,
    additions: pr.additions,
    deletions: pr.deletions,
    changedFiles: pr.changed_files,
    labels: Array.isArray(pr.labels)
      ? pr.labels.map((l) => ({
          name: l.name || '',
          color: l.color || '',
          description: l.description || '',
        }))
      : [],
    assignees: Array.isArray(pr.assignees)
      ? pr.assignees.map((u) => u.login || u).filter(Boolean)
      : [],
    /** login → avatar_url for people chips when API provided them */
    avatarUrls: (() => {
      const map = {};
      const putUser = (u) => {
        const login = u?.login || (typeof u === 'string' ? u : '');
        const url = u?.avatar_url || '';
        if (login && url) map[String(login).toLowerCase()] = url;
      };
      putUser(pr.user);
      for (const u of pr.assignees || []) putUser(u);
      for (const u of pr.requested_reviewers || []) putUser(u);
      for (const c of comments || []) putUser(c?.user);
      for (const r of reviews || []) putUser(r?.user);
      for (const c of reviewComments || []) putUser(c?.user);
      return map;
    })(),
    /**
     * login (lower) → true when GitHub user.type is Bot (or [bot] login).
     * Used to hide re-request / remove for bot reviewers & assignees.
     */
    actorIsBot: (() => {
      const map = {};
      const put = (u) => {
        const login = u?.login || (typeof u === 'string' ? u : '');
        if (!login) return;
        const key = String(login).toLowerCase();
        const type = String(u?.type || '').toLowerCase();
        if (type === 'bot' || /\[bot\]$/i.test(String(login))) map[key] = true;
      };
      for (const u of pr.assignees || []) put(u);
      for (const u of pr.requested_reviewers || []) put(u);
      for (const r of reviews || []) put(r?.user);
      for (const c of comments || []) put(c?.user);
      for (const c of reviewComments || []) put(c?.user);
      return map;
    })(),
    requestedReviewers: Array.isArray(pr.requested_reviewers)
      ? pr.requested_reviewers.map((u) => u.login || u).filter(Boolean)
      : [],
    requestedTeams: Array.isArray(pr.requested_teams)
      ? pr.requested_teams.map((t) => t.slug || t.name).filter(Boolean)
      : [],
    milestone: pr.milestone
      ? {
          number: pr.milestone.number,
          title: pr.milestone.title || '',
          state: pr.milestone.state || '',
          dueOn: pr.milestone.due_on || null,
        }
      : null,
    linkedIssues,
    subscribed,
    locked: Boolean(pr.locked),
    gitattributesText,
    files: filesOut,
    comments: Array.isArray(comments) ? comments : [],
    commentsMeta: commentsPage?.meta || {
      page: 1,
      perPage: COMMENT_PAGE_SIZE,
      hasMore: false,
      nextPage: null,
      loadedCount: Array.isArray(comments) ? comments.length : 0,
    },
    reviews: (Array.isArray(reviews) ? reviews : []).map((r) => ({
      id: r.id,
      author: r.user?.login || '',
      avatarUrl: r.user?.avatar_url || '',
      type: r.user?.type || '',
      isBot:
        String(r.user?.type || '').toLowerCase() === 'bot' ||
        /\[bot\]$/i.test(String(r.user?.login || '')),
      state: r.state || '',
      body: r.body || '',
      submittedAt: r.submitted_at,
    })),
    // GraphQL first page (or empty if skipReviewThreads) — more via fetchReviewThreadsPage
    reviewComments: Array.isArray(reviewComments) ? reviewComments : [],
    reviewCommentsMeta,
    reviewThreads: Array.isArray(reviewThreads) ? reviewThreads : [],
    reviewThreadsMeta,
    /**
     * Viewer's unsubmitted PENDING review (if any), including replies that only
     * appear via GET /reviews/{id}/comments.
     */
    viewerPendingReview,
    commits: (Array.isArray(commits) ? commits : []).map((c) => ({
      sha: c.sha || '',
      message: c.commit?.message || '',
      author: c.commit?.author?.name || c.author?.login || '',
      date: c.commit?.author?.date || c.commit?.committer?.date || '',
    })),
    checks,
    /** Debug: per-request ms from this fetchPrDetail call */
    _fetchTimings: timings,
  };
}

async function postIssueComment(owner, repo, issueNumber, body, fetchImpl, token) {
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/issues/${issueNumber}/comments`),
    fetchImpl,
    token,
    { method: 'POST', body: { body } }
  );
}

/**
 * @param {'APPROVE'|'REQUEST_CHANGES'|'COMMENT'} event
 * @param {Array} [comments] pending inline comments for bulk submit
 */
async function submitPullReview(
  owner,
  repo,
  pullNumber,
  { event, body = '', commitId, comments },
  fetchImpl,
  token
) {
  const payload = { event, body: body || '' };
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
          row.start_line = Number(sl);
          row.start_side = c.start_side || c.startSide || c.side || 'RIGHT';
        }
      }
      return row;
    });
  }
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/pulls/${pullNumber}/reviews`),
    fetchImpl,
    token,
    { method: 'POST', body: payload }
  );
}

/**
 * GraphQL: add a new review *thread* (line or file comment) onto an existing PENDING review.
 * REST POST /comments creates a second pending review → 422.
 */
async function postReviewCommentViaPendingGraphql(
  pendingReviewNodeId,
  { body, path, line, side = 'RIGHT', startLine, startSide, subjectType = 'line' },
  fetchImpl,
  token
) {
  const isFile = String(subjectType || '').toLowerCase() === 'file';
  const hasRange =
    !isFile &&
    startLine != null &&
    Number.isFinite(Number(startLine)) &&
    Number(startLine) !== Number(line);
  const variables = {
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
  const data = await apiGraphql(query, variables, fetchImpl, token);
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
    threadNodeId,
  };
}

/**
 * Resolve the viewer's PENDING review, creating one if needed (asPending).
 * Recovers from 422 "one pending review" by re-fetching the existing review.
 * Always re-GETs the review so discarded/stale list entries (with a dead
 * node_id) are not returned after Discard.
 */
async function ensureViewerPendingReview(
  owner,
  repo,
  pullNumber,
  { commitId = null, createIfMissing = false } = {},
  fetchImpl,
  token
) {
  /** Re-fetch review; return null if missing or no longer PENDING. */
  const hydrateNodeId = async (pending) => {
    if (!pending?.id) return null;
    try {
      const full = await apiJson(
        githubRestUrl(`/repos/${owner}/${repo}/pulls/${pullNumber}/reviews/${pending.id}`),
        fetchImpl,
        token
      );
      if (!full || String(full.state || '').toUpperCase() !== 'PENDING') {
        return null;
      }
      return {
        id: Number(pending.id),
        node_id: full.node_id || pending.node_id || null,
      };
    } catch (err) {
      // 404 after discard — list can briefly still show the dead PENDING row
      if (err?.status === 404) return null;
      // Keep list node_id only when re-GET is unavailable (network); prefer null
      // over a known-dead id when status is 4xx.
      if (err?.status >= 400 && err?.status < 500) return null;
      return pending?.node_id
        ? { id: Number(pending.id), node_id: pending.node_id }
        : null;
    }
  };

  let pending = await findViewerPendingReview(
    owner,
    repo,
    pullNumber,
    fetchImpl,
    token
  );
  pending = await hydrateNodeId(pending);
  if (pending?.node_id) return pending;
  if (!createIfMissing) return pending;

  try {
    const created = await createPendingPullReview(
      owner,
      repo,
      pullNumber,
      { commitId },
      fetchImpl,
      token
    );
    return {
      id: Number(created?.id),
      node_id: created?.node_id || null,
    };
  } catch (err) {
    // Already have a PENDING review (race or find missed it) — attach to it
    const msg = String(err?.message || err || '');
    if (
      err?.status === 422 ||
      /one pending review/i.test(msg) ||
      /Unprocessable Entity/i.test(msg)
    ) {
      pending = await findViewerPendingReview(
        owner,
        repo,
        pullNumber,
        fetchImpl,
        token
      );
      pending = await hydrateNodeId(pending);
      if (pending?.node_id) return pending;
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
async function postReviewComment(
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
) {
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
        token
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
            token
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
              token
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
            token
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
  if (commitId) payload.commit_id = commitId;
  if (!isFile && startLine != null && Number(startLine) !== Number(line)) {
    payload.start_line = Number(startLine);
    payload.start_side = startSide || side || 'RIGHT';
  }
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/pulls/${pullNumber}/comments`),
    fetchImpl,
    token,
    { method: 'POST', body: payload }
  );
}

/**
 * Viewer's PENDING review on a PR (at most one). Used because REST
 * POST /comments and /replies 422 with:
 * "user_id can only have one pending review per pull request".
 * @returns {Promise<{ id: number, node_id: string|null }|null>}
 */
async function findViewerPendingReview(owner, repo, pullNumber, fetchImpl, token) {
  if (!token) return null;
  const n = Number(pullNumber);
  if (!Number.isFinite(n)) return null;
  try {
    const [reviews, login] = await Promise.all([
      apiJson(
        githubRestUrl(`/repos/${owner}/${repo}/pulls/${n}/reviews?per_page=100`),
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
async function replyViaThreadGraphql(threadNodeId, body, fetchImpl, token, fallback = {}) {
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
    token
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
  fallback = {}
) {
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
) {
  if (knownNodeId) return String(knownNodeId);
  const id = Math.floor(Number(parentId));
  if (!Number.isFinite(id) || id <= 0) return null;
  try {
    const parent = await apiJson(
      githubRestUrl(`/repos/${owner}/${repo}/pulls/comments/${id}`),
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
      githubRestUrl(`/repos/${owner}/${repo}/pulls/${n}/comments/${Math.floor(parentId)}/replies`),
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
async function resolveReviewThread(threadNodeId, resolved, fetchImpl, token) {
  if (!threadNodeId) throw new Error('threadNodeId required to resolve review thread');
  const mutation = resolved
    ? `mutation($id:ID!){ resolveReviewThread(input:{threadId:$id}){ thread { id isResolved } } }`
    : `mutation($id:ID!){ unresolveReviewThread(input:{threadId:$id}){ thread { id isResolved } } }`;
  return apiGraphql(
    mutation,
    { id: threadNodeId },
    fetchImpl,
    token
  );
}

/**
 * Close or reopen a pull request.
 * @param {'open'|'closed'} state
 */
async function updatePullState(owner, repo, pullNumber, state, fetchImpl, token) {
  const next = state === 'closed' ? 'closed' : 'open';
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/pulls/${pullNumber}`),
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
async function deleteReviewComment(owner, repo, commentId, fetchImpl, token) {
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/pulls/comments/${commentId}`),
    fetchImpl,
    token,
    { method: 'DELETE' }
  );
}

/**
 * Delete an issue comment on the PR conversation.
 * DELETE /repos/{owner}/{repo}/issues/comments/{comment_id}
 */
async function deleteIssueComment(owner, repo, commentId, fetchImpl, token) {
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/issues/comments/${commentId}`),
    fetchImpl,
    token,
    { method: 'DELETE' }
  );
}

async function updatePullRequest(owner, repo, pullNumber, fields, fetchImpl, token) {
  const body = {};
  if (fields?.title != null) body.title = String(fields.title);
  if (fields?.body != null) body.body = String(fields.body);
  if (fields?.base != null) body.base = String(fields.base);
  if (fields?.state != null) body.state = fields.state === 'closed' ? 'closed' : 'open';
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/pulls/${pullNumber}`),
    fetchImpl,
    token,
    { method: 'PATCH', body }
  );
}

async function editIssueComment(owner, repo, commentId, body, fetchImpl, token) {
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/issues/comments/${commentId}`),
    fetchImpl,
    token,
    { method: 'PATCH', body: { body: String(body || '') } }
  );
}

async function editReviewComment(owner, repo, commentId, body, fetchImpl, token) {
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/pulls/comments/${commentId}`),
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
) {
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/pulls/${pullNumber}/requested_reviewers`),
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
) {
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/pulls/${pullNumber}/requested_reviewers`),
    fetchImpl,
    token,
    {
      method: 'DELETE',
      body: { reviewers, team_reviewers: teamReviewers },
    }
  );
}

async function addAssignees(owner, repo, issueNumber, assignees, fetchImpl, token) {
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/issues/${issueNumber}/assignees`),
    fetchImpl,
    token,
    { method: 'POST', body: { assignees: assignees || [] } }
  );
}

async function removeAssignees(owner, repo, issueNumber, assignees, fetchImpl, token) {
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/issues/${issueNumber}/assignees`),
    fetchImpl,
    token,
    { method: 'DELETE', body: { assignees: assignees || [] } }
  );
}

async function setIssueLabels(owner, repo, issueNumber, labels, fetchImpl, token) {
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/issues/${issueNumber}/labels`),
    fetchImpl,
    token,
    { method: 'PUT', body: { labels: labels || [] } }
  );
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
) {
  const body = { merge_method: mergeMethod };
  if (commitTitle != null) body.commit_title = String(commitTitle);
  if (commitMessage != null) body.commit_message = String(commitMessage);
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/pulls/${pullNumber}/merge`),
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
) {
  const body = {};
  if (expectedHeadSha) body.expected_head_sha = String(expectedHeadSha);
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/pulls/${pullNumber}/update-branch`),
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
) {
  if (nodeId) return String(nodeId);
  const n = Number(pullNumber);
  if (!token || !owner || !repo || !Number.isFinite(n) || n <= 0) return null;
  try {
    // Prefer REST node_id (cheap, same id GraphQL expects)
    const pr = await apiJson(
      githubRestUrl(`/repos/${owner}/${repo}/pulls/${n}`),
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
      token
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
  token
) {
  if (!token) throw new Error('GitHub PAT required for notifications');
  const id = await resolvePullRequestNodeId(
    owner,
    repo,
    issueNumber,
    fetchImpl,
    token,
    nodeId
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
  nodeId = null
) {
  if (!token) return null;
  try {
    const id = await resolvePullRequestNodeId(
      owner,
      repo,
      pullNumber,
      fetchImpl,
      token,
      nodeId
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
      token
    );
    const vs = data?.node?.viewerSubscription;
    if (!vs) return null;
    return mapViewerSubscription(vs);
  } catch {
    return null;
  }
}

async function setIssueMilestone(owner, repo, issueNumber, milestoneNumber, fetchImpl, token) {
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/issues/${issueNumber}`),
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
) {
  let id = nodeId;
  if (!id) {
    const pr = await apiJson(
      githubRestUrl(`/repos/${owner}/${repo}/pulls/${pullNumber}`),
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
  return apiGraphql(gql.query, gql.variables, fetchImpl, token);
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
) {
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
      ),
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
    githubRestUrl(`/repos/${owner}/${repo}/contents/${encPath}`),
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
async function getRepoFileText(owner, repo, { path, ref }, fetchImpl, token) {
  if (!path) throw new Error('path required');
  const rev = ref || 'HEAD';
  const encPath = String(path)
    .split('/')
    .map(encodeURIComponent)
    .join('/');
  const meta = await apiJson(
    githubRestUrl(`/repos/${owner}/${repo}/contents/${encPath}?ref=${encodeURIComponent(rev)}`),
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
) {
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
      .join('/')}`),
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
async function fetchViewerLogin(fetchImpl, token) {
  if (!token) return null;
  try {
    const me = await apiJson(githubRestUrl('/user'), fetchImpl, token);
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
  const o = String(owner || '').trim();
  const r = String(repo || '').trim();
  const b = String(base || '').trim();
  const h = String(head || '').trim();
  if (!o || !r || !b || !h) {
    throw new Error('owner, repo, base, and head are required for compare');
  }
  const gitattributesText = String(options.gitattributesText || '');
  const url = githubRestUrl(`/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}/compare/${encodeURIComponent(b)}...${encodeURIComponent(h)}`);
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
  fetchAllPrCommits,
  fetchAllPrFiles,
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
