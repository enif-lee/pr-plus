/**
 * Fetch open PR branch metadata via GitHub REST API.
 * List up to 100 open PRs, then fill page-visible dangling PRs via single-PR gets.
 */

function mapApiPullRequest(pr) {
  return {
    number: pr.number,
    title: pr.title,
    // Body required so attachMagicLinks/prMatchText can match description tokens
    body: pr.body || '',
    headRef: pr.head.ref,
    baseRef: pr.base.ref,
    author: pr.user?.login || '',
    draft: Boolean(pr.draft),
    htmlUrl: pr.html_url,
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
  const url = `https://api.github.com/repos/${owner}/${repo}/pulls?state=open&per_page=100`;
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
  const url = `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}`;
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
  const url = `https://api.github.com/repos/${owner}/${repo}/autolinks`;
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
    'https://api.github.com/graphql',
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

const REVIEW_THREADS_QUERY = `
query($owner:String!,$name:String!,$number:Int!){
  repository(owner:$owner,name:$name){
    pullRequest(number:$number){
      reviewThreads(first:100){
        nodes{
          id
          isResolved
          comments(first:100){
            nodes{ databaseId id }
          }
        }
      }
    }
  }
}`;

/**
 * Fetch PR review threads (GraphQL ids + isResolved) for resolve UI.
 * Returns [] on failure so REST detail still loads.
 */
async function fetchPullReviewThreads(owner, repo, pullNumber, fetchImpl, token) {
  try {
    const data = await apiGraphql(
      REVIEW_THREADS_QUERY,
      { owner, name: repo, number: Number(pullNumber) },
      fetchImpl,
      token
    );
    const nodes = data?.repository?.pullRequest?.reviewThreads?.nodes || [];
    let mapFn = null;
    try {
      let rt =
        typeof globalThis !== 'undefined' ? globalThis.PRModalReviewThreads : null;
      if (!rt && typeof require === 'function') {
        try {
          rt = require('./modal/pure/review-threads.js');
        } catch {
          rt = null;
        }
      }
      mapFn = rt?.mapGraphqlReviewThreads;
    } catch {
      mapFn = null;
    }
    if (mapFn) return mapFn(nodes);
    return (Array.isArray(nodes) ? nodes : [])
      .filter((t) => t && t.id)
      .map((t) => ({
        threadNodeId: t.id,
        resolved: Boolean(t.isResolved),
        commentIds: (t.comments?.nodes || [])
          .map((c) => c?.databaseId)
          .filter((id) => id != null),
      }));
  } catch {
    return [];
  }
}

/**
 * Full PR detail payload for the modal: header, body, files+patches,
 * issue comments, reviews, review comments, commits, checks.
 */
async function fetchPrDetail(owner, repo, pullNumber, fetchImpl, token = null) {
  const base = `https://api.github.com/repos/${owner}/${repo}`;
  const n = Number(pullNumber);

  const [pr, files, comments, reviews, commits, reviewComments, reviewThreads, viewerLogin, subscription, autolinks] =
    await Promise.all([
      apiJson(`${base}/pulls/${n}`, fetchImpl, token),
      apiJson(`${base}/pulls/${n}/files?per_page=100`, fetchImpl, token),
      apiJson(`${base}/issues/${n}/comments?per_page=100`, fetchImpl, token).catch(
        () => []
      ),
      apiJson(`${base}/pulls/${n}/reviews?per_page=100`, fetchImpl, token).catch(
        () => []
      ),
      apiJson(`${base}/pulls/${n}/commits?per_page=100`, fetchImpl, token).catch(
        () => []
      ),
      apiJson(`${base}/pulls/${n}/comments?per_page=100`, fetchImpl, token).catch(
        () => []
      ),
      // GraphQL: thread node ids + isResolved (REST comments never include these)
      fetchPullReviewThreads(owner, repo, n, fetchImpl, token),
      fetchViewerLogin(fetchImpl, token),
      // Notifications subscription (auth required; null when unavailable)
      token
        ? apiJson(`${base}/issues/${n}/subscription`, fetchImpl, token).catch(() => null)
        : Promise.resolve(null),
      // Repo autolinks for magic-link matching on title/body/branches
      fetchRepoAutolinks(owner, repo, fetchImpl, token),
    ]);

  const headSha = pr.head?.sha || '';
  let checks = { state: 'unknown', totalCount: 0, statuses: [] };
  if (headSha) {
    try {
      const status = await apiJson(
        `${base}/commits/${headSha}/status`,
        fetchImpl,
        token
      );
      checks = {
        state: status.state || 'unknown',
        totalCount: status.total_count || 0,
        statuses: (status.statuses || []).slice(0, 40).map((s) => ({
          context: s.context || '',
          state: s.state || '',
          description: s.description || '',
          targetUrl: s.target_url || '',
        })),
      };
    } catch {
      /* ignore */
    }
    try {
      const runs = await apiJson(
        `${base}/commits/${headSha}/check-runs?per_page=40`,
        fetchImpl,
        token
      );
      const list = runs.check_runs || [];
      if (list.length) {
        checks.checkRuns = list.map((r) => ({
          name: r.name || '',
          status: r.status || '',
          conclusion: r.conclusion || '',
          htmlUrl: r.html_url || '',
        }));
        if (checks.state === 'unknown') {
          const failed = list.some(
            (r) => r.conclusion === 'failure' || r.conclusion === 'timed_out'
          );
          const pending = list.some(
            (r) => r.status === 'queued' || r.status === 'in_progress'
          );
          checks.state = failed ? 'failure' : pending ? 'pending' : 'success';
        }
      }
    } catch {
      /* ignore */
    }
  }

  // Optional .gitattributes for linguist-generated / binary collapse defaults
  let gitattributesText = '';
  try {
    const ref = headSha || pr.head?.ref || 'HEAD';
    const attr = await apiJson(
      `${base}/contents/.gitattributes?ref=${encodeURIComponent(ref)}`,
      fetchImpl,
      token
    );
    if (attr?.content && attr.encoding === 'base64') {
      gitattributesText = decodeBase64Utf8(attr.content.replace(/\n/g, ''));
    } else if (typeof attr?.content === 'string') {
      gitattributesText = attr.content;
    }
  } catch {
    gitattributesText = '';
  }

  const mappedFiles = (Array.isArray(files) ? files : []).map((f) => ({
    filename: f.filename,
    status: f.status,
    additions: f.additions,
    deletions: f.deletions,
    changes: f.changes,
    patch: f.patch || '',
  }));

  // Prefer pure collapse annotator (SW loads modal/pure/collapse.js via importScripts;
  // Node tests require() it). Fallback only if the pure module is unavailable.
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
    filesOut = mappedFiles.map((f) => ({
      ...f,
      defaultCollapsed:
        !f.patch ||
        (f.changes || 0) >= 500 ||
        /package-lock\.json$|yarn\.lock$|\.min\.(js|css)$|\.bundle\.js$/i.test(
          f.filename || ''
        ),
    }));
  }

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
    viewerLogin: viewerLogin || null,
    baseRef: pr.base?.ref || '',
    headRef: pr.head?.ref || '',
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
    comments: (Array.isArray(comments) ? comments : []).map((c) => ({
      id: c.id,
      author: c.user?.login || '',
      body: c.body || '',
      createdAt: c.created_at,
    })),
    reviews: (Array.isArray(reviews) ? reviews : []).map((r) => ({
      id: r.id,
      author: r.user?.login || '',
      state: r.state || '',
      body: r.body || '',
      submittedAt: r.submitted_at,
    })),
    reviewComments: (() => {
      const mapped = (Array.isArray(reviewComments) ? reviewComments : []).map(
        (c) => ({
          id: c.id,
          author: c.user?.login || '',
          body: c.body || '',
          path: c.path || '',
          line: c.line ?? c.original_line ?? null,
          originalLine: c.original_line ?? null,
          startLine: c.start_line ?? null,
          side: c.side || 'RIGHT',
          startSide: c.start_side || null,
          diffHunk: c.diff_hunk || '',
          createdAt: c.created_at,
          inReplyToId: c.in_reply_to_id ?? null,
          nodeId: c.node_id || null,
          threadNodeId: null,
          resolved: false,
        })
      );
      // Merge GraphQL thread id + isResolved onto REST comments (real resolve path)
      let mergeFn = null;
      try {
        let rt =
          typeof globalThis !== 'undefined' ? globalThis.PRModalReviewThreads : null;
        if (!rt && typeof require === 'function') {
          try {
            rt = require('./modal/pure/review-threads.js');
          } catch {
            rt = null;
          }
        }
        mergeFn = rt?.mergeReviewThreadMeta;
      } catch {
        mergeFn = null;
      }
      if (mergeFn) return mergeFn(mapped, reviewThreads || []);
      return mapped;
    })(),
    reviewThreads: Array.isArray(reviewThreads) ? reviewThreads : [],
    commits: (Array.isArray(commits) ? commits : []).map((c) => ({
      sha: c.sha || '',
      message: c.commit?.message || '',
      author: c.commit?.author?.name || c.author?.login || '',
      date: c.commit?.author?.date || c.commit?.committer?.date || '',
    })),
    checks,
  };
}

async function postIssueComment(owner, repo, issueNumber, body, fetchImpl, token) {
  return apiSend(
    `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/comments`,
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
    `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}/reviews`,
    fetchImpl,
    token,
    { method: 'POST', body: payload }
  );
}

/**
 * Line-level review comment on a PR file.
 * Prefer commit_id + path + line (side RIGHT). Multi-line uses start_line/start_side.
 */
async function postReviewComment(
  owner,
  repo,
  pullNumber,
  { body, path, line, side = 'RIGHT', commitId, startLine, startSide },
  fetchImpl,
  token
) {
  const payload = { body, path, line, side };
  if (commitId) payload.commit_id = commitId;
  if (startLine != null && Number(startLine) !== Number(line)) {
    payload.start_line = Number(startLine);
    payload.start_side = startSide || side || 'RIGHT';
  }
  return apiSend(
    `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}/comments`,
    fetchImpl,
    token,
    { method: 'POST', body: payload }
  );
}

/**
 * Reply to an existing pull request review comment.
 * POST /repos/{owner}/{repo}/pulls/{pull}/comments/{comment_id}/replies
 */
async function replyToReviewComment(
  owner,
  repo,
  pullNumber,
  commentId,
  body,
  fetchImpl,
  token
) {
  return apiSend(
    `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}/comments/${commentId}/replies`,
    fetchImpl,
    token,
    { method: 'POST', body: { body: String(body || '').trim() } }
  );
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
    `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}`,
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
    `https://api.github.com/repos/${owner}/${repo}/pulls/comments/${commentId}`,
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
    `https://api.github.com/repos/${owner}/${repo}/issues/comments/${commentId}`,
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
    `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}`,
    fetchImpl,
    token,
    { method: 'PATCH', body }
  );
}

async function editIssueComment(owner, repo, commentId, body, fetchImpl, token) {
  return apiSend(
    `https://api.github.com/repos/${owner}/${repo}/issues/comments/${commentId}`,
    fetchImpl,
    token,
    { method: 'PATCH', body: { body: String(body || '') } }
  );
}

async function editReviewComment(owner, repo, commentId, body, fetchImpl, token) {
  return apiSend(
    `https://api.github.com/repos/${owner}/${repo}/pulls/comments/${commentId}`,
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
    `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}/requested_reviewers`,
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
    `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}/requested_reviewers`,
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
    `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/assignees`,
    fetchImpl,
    token,
    { method: 'POST', body: { assignees: assignees || [] } }
  );
}

async function removeAssignees(owner, repo, issueNumber, assignees, fetchImpl, token) {
  return apiSend(
    `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/assignees`,
    fetchImpl,
    token,
    { method: 'DELETE', body: { assignees: assignees || [] } }
  );
}

async function setIssueLabels(owner, repo, issueNumber, labels, fetchImpl, token) {
  return apiSend(
    `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/labels`,
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
    `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}/merge`,
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
    `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}/update-branch`,
    fetchImpl,
    token,
    { method: 'PUT', body }
  );
}

async function setIssueSubscription(
  owner,
  repo,
  issueNumber,
  { subscribed = true, ignored = false } = {},
  fetchImpl,
  token
) {
  return apiSend(
    `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/subscription`,
    fetchImpl,
    token,
    { method: 'PUT', body: { subscribed: Boolean(subscribed), ignored: Boolean(ignored) } }
  );
}

async function deleteIssueSubscription(owner, repo, issueNumber, fetchImpl, token) {
  return apiSend(
    `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/subscription`,
    fetchImpl,
    token,
    { method: 'DELETE' }
  );
}

async function setIssueMilestone(owner, repo, issueNumber, milestoneNumber, fetchImpl, token) {
  return apiSend(
    `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`,
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
      `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}`,
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
      `https://api.github.com/repos/${owner}/${repo}/contents/${encPath}${
        branch ? `?ref=${encodeURIComponent(branch)}` : ''
      }`,
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
    `https://api.github.com/repos/${owner}/${repo}/contents/${encPath}`,
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

async function applyReviewSuggestion(
  owner,
  repo,
  { path, headRef, startLine, endLine, suggestion, message },
  fetchImpl,
  token
) {
  const ref = headRef || 'HEAD';
  const meta = await apiJson(
    `https://api.github.com/repos/${owner}/${repo}/contents/${path
      .split('/')
      .map(encodeURIComponent)
      .join('/')}?ref=${encodeURIComponent(ref)}`,
    fetchImpl,
    token
  );
  const raw = meta?.content
    ? decodeBase64Utf8(String(meta.content).replace(/\n/g, ''))
    : '';
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
    `https://api.github.com/repos/${owner}/${repo}/contents/${path
      .split('/')
      .map(encodeURIComponent)
      .join('/')}`,
    fetchImpl,
    token,
    {
      method: 'PUT',
      body: {
        message: message || `Apply suggestion to ${path}`,
        content: contentB64,
        branch: ref,
        sha: meta.sha,
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
    const me = await apiJson('https://api.github.com/user', fetchImpl, token);
    return me?.login || null;
  } catch {
    return null;
  }
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
  fetchPullReviewThreads,
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
  setIssueMilestone,
  setPullRequestDraftStage,
  applyReviewSuggestion,
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
