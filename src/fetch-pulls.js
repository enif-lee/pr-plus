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
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = fetchApi;
}
if (typeof globalThis !== 'undefined') {
  globalThis.PRTreeFetch = fetchApi;
}
