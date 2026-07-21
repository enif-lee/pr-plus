/**
 * Fetch open PR branch metadata via GitHub REST API.
 * List up to 100 open PRs, then fill page-visible dangling PRs via single-PR gets.
 */

function mapApiPullRequest(pr) {
  return {
    number: pr.number,
    title: pr.title,
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
 * Full PR detail payload for the modal: header, body, files+patches,
 * issue comments, reviews, review comments, commits, checks.
 */
async function fetchPrDetail(owner, repo, pullNumber, fetchImpl, token = null) {
  const base = `https://api.github.com/repos/${owner}/${repo}`;
  const n = Number(pullNumber);

  const [pr, files, comments, reviews, commits, reviewComments] = await Promise.all([
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

  // Prefer pure collapse annotator when available (tests / content); SW falls back.
  let filesOut = mappedFiles.map((f) => ({
    ...f,
    defaultCollapsed:
      !f.patch ||
      (f.changes || 0) >= 500 ||
      /package-lock\.json$|yarn\.lock$|\.min\.(js|css)$|\.bundle\.js$/i.test(
        f.filename || ''
      ),
  }));
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
    /* keep fallback filesOut */
  }

  return {
    owner,
    repo,
    number: pr.number,
    title: pr.title,
    body: pr.body || '',
    state: pr.state,
    draft: Boolean(pr.draft),
    author: pr.user?.login || '',
    baseRef: pr.base?.ref || '',
    headRef: pr.head?.ref || '',
    headSha,
    htmlUrl: pr.html_url,
    merged: Boolean(pr.merged),
    mergeable: pr.mergeable,
    createdAt: pr.created_at,
    updatedAt: pr.updated_at,
    additions: pr.additions,
    deletions: pr.deletions,
    changedFiles: pr.changed_files,
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
    reviewComments: (Array.isArray(reviewComments) ? reviewComments : []).map(
      (c) => ({
        id: c.id,
        author: c.user?.login || '',
        body: c.body || '',
        path: c.path || '',
        line: c.line ?? c.original_line ?? null,
        side: c.side || 'RIGHT',
        diffHunk: c.diff_hunk || '',
        createdAt: c.created_at,
      })
    ),
    commits: (Array.isArray(commits) ? commits : []).map((c) => ({
      sha: c.sha || '',
      message: c.commit?.message || '',
      author: c.commit?.author?.name || c.author?.login || '',
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
 */
async function submitPullReview(
  owner,
  repo,
  pullNumber,
  { event, body = '' },
  fetchImpl,
  token
) {
  return apiSend(
    `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}/reviews`,
    fetchImpl,
    token,
    { method: 'POST', body: { event, body } }
  );
}

/**
 * Line-level review comment on a PR file.
 * Prefer commit_id + path + line (side RIGHT) for multi-line API.
 */
async function postReviewComment(
  owner,
  repo,
  pullNumber,
  { body, path, line, side = 'RIGHT', commitId },
  fetchImpl,
  token
) {
  const payload = { body, path, line, side };
  if (commitId) payload.commit_id = commitId;
  return apiSend(
    `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}/comments`,
    fetchImpl,
    token,
    { method: 'POST', body: payload }
  );
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
  postIssueComment,
  submitPullReview,
  postReviewComment,
  apiJson,
  apiSend,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = fetchApi;
}
if (typeof globalThis !== 'undefined') {
  globalThis.PRTreeFetch = fetchApi;
}
