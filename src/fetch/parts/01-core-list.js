/**
 * Fetch open PR branch metadata via GitHub REST API.
 * List up to 100 open PRs, then fill page-visible dangling PRs via single-PR gets.
 */


/**
 * Stateless GitHub API context (REST/GraphQL bases).
 * Prefer explicit ctx from SW message resolve; never use a process-global mutable base.
 * @param {object|string|null|undefined} ctx endpoints object, webHost string, or null → github.com
 */
function normalizeApiCtx(ctx) {
  if (ctx && typeof ctx === 'object' && (ctx.restBase || ctx.graphqlUrl)) {
    return {
      kind: ctx.kind || 'custom',
      webHost: ctx.webHost || 'github.com',
      webOrigin: ctx.webOrigin || '',
      restBase: String(ctx.restBase || 'https://api.github.com').replace(/\/+$/, ''),
      graphqlUrl: String(
        ctx.graphqlUrl ||
          (String(ctx.restBase || '').includes('api.github.com')
            ? 'https://api.github.com/graphql'
            : '')
      ).replace(/\/+$/, '') || 'https://api.github.com/graphql',
    };
  }
  const webHost =
    typeof ctx === 'string'
      ? ctx
      : ctx && typeof ctx === 'object' && ctx.webHost
        ? ctx.webHost
        : 'github.com';
  try {
    if (
      globalThis.PRGithubEndpoints &&
      typeof globalThis.PRGithubEndpoints.resolveGithubEndpoints === 'function'
    ) {
      return globalThis.PRGithubEndpoints.resolveGithubEndpoints({ webHost });
    }
  } catch (_) {}
  return {
    kind: 'dotcom',
    webHost: 'github.com',
    webOrigin: 'https://github.com',
    restBase: 'https://api.github.com',
    graphqlUrl: 'https://api.github.com/graphql',
  };
}

function githubRestUrl(path, ctx) {
  const c = normalizeApiCtx(ctx);
  try {
    if (
      globalThis.PRGithubEndpoints &&
      typeof globalThis.PRGithubEndpoints.githubRestUrl === 'function'
    ) {
      return globalThis.PRGithubEndpoints.githubRestUrl(path, c);
    }
  } catch (_) {}
  const p = String(path || '');
  if (/^https?:\/\//i.test(p)) return p;
  const base = String(c.restBase || 'https://api.github.com').replace(/\/+$/, '');
  return base + (p.startsWith('/') ? p : '/' + p);
}
function githubGraphqlUrl(ctx) {
  const c = normalizeApiCtx(ctx);
  try {
    if (
      globalThis.PRGithubEndpoints &&
      typeof globalThis.PRGithubEndpoints.githubGraphqlUrl === 'function'
    ) {
      return globalThis.PRGithubEndpoints.githubGraphqlUrl(c);
    }
  } catch (_) {}
  return String(c.graphqlUrl || 'https://api.github.com/graphql');
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

async function fetchOpenPullsPublic(owner, repo, fetchImpl, token = null, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const url = githubRestUrl(`/repos/${owner}/${repo}/pulls?state=open&per_page=100`, ctx);
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

async function fetchPullByNumber(owner, repo, pullNumber, fetchImpl, token = null, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const url = githubRestUrl(`/repos/${owner}/${repo}/pulls/${pullNumber}`, ctx);
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
async function fetchDanglingPulls(owner, repo, numbers, fetchImpl, token = null, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  if (!numbers.length) return [];

  const settled = await mapWithConcurrency(numbers, 5, async (pullNumber) => {
    try {
      return await fetchPullByNumber(owner, repo, pullNumber, fetchImpl, token, ctx);
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
async function fetchRepoAutolinks(owner, repo, fetchImpl, token = null, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const url = githubRestUrl(`/repos/${owner}/${repo}/autolinks`, ctx);
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
  const ctx = normalizeApiCtx(options?.ctx);

  const listed = await fetchOpenPullsPublic(owner, repo, fetchImpl, token, ctx);
  const danglingNumbers = findDanglingPrNumbers(pagePrNumbers, listed);

  let prs = listed;
  if (danglingNumbers.length > 0) {
    const extras = await fetchDanglingPulls(
      owner,
      repo,
      danglingNumbers,
      fetchImpl,
      token,
      ctx
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

  const autolinks = await fetchRepoAutolinks(owner, repo, fetchImpl, token, ctx);
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
 * First page of PR commits (oldest-first, per_page=100). Independent of fetchPrDetail.
 */
async function fetchPrCommits(owner, repo, number, fetchImpl, token = null, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const o = String(owner || '').trim();
  const r = String(repo || '').trim();
  const n = Number(number);
  if (!o || !r || !Number.isFinite(n)) {
    throw new Error('owner, repo, and number are required for commits');
  }
  const url = githubRestUrl(
    `/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}/pulls/${n}/commits?per_page=100`
  , ctx);
  try {
    const data = await apiJson(url, fetchImpl, token);
    return (Array.isArray(data) ? data : []).map(mapPrCommitRow).filter((c) => c.sha);
  } catch (err) {
    if (
      err?.name === 'AbortError' ||
      /aborted|AbortError/i.test(String(err?.message || ''))
    ) {
      throw err;
    }
    return [];
  }
}

/**
 * All PR commits (paginated). GitHub returns oldest-first.
 */
async function fetchAllPrCommits(owner, repo, number, fetchImpl, token = null, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const o = String(owner || '').trim();
  const r = String(repo || '').trim();
  const n = Number(number);
  if (!o || !r || !Number.isFinite(n)) {
    throw new Error('owner, repo, and number are required for commits');
  }
  const first = githubRestUrl(
    `/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}/pulls/${n}/commits?per_page=100`
  , ctx);
  const raw = await fetchRestCollectionAll(first, fetchImpl, token);
  return raw.map(mapPrCommitRow).filter((c) => c.sha);
}

/**
 * Commit status contexts + check runs for a head SHA. Independent of fetchPrDetail.
 * @returns {Promise<{ state: string, totalCount: number, statuses: Array, checkRuns: Array }>}
 */
async function fetchPrChecks(owner, repo, headSha, fetchImpl, token = null, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const o = String(owner || '').trim();
  const r = String(repo || '').trim();
  const sha = String(headSha || '').trim();
  const empty = { state: 'unknown', totalCount: 0, statuses: [], checkRuns: [] };
  if (!o || !r || !sha) return empty;
  const base = githubRestUrl(`/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}`, ctx);
  let checks = { ...empty };
  try {
    const status = await apiJson(`${base}/commits/${encodeURIComponent(sha)}/status`, fetchImpl, token);
    const statusList = Array.isArray(status?.statuses) ? status.statuses : [];
    const emptyCombined =
      !statusList.length && !(Number(status?.total_count) > 0);
    checks = {
      state: emptyCombined ? 'unknown' : status.state || 'unknown',
      totalCount: emptyCombined ? 0 : status.total_count || statusList.length,
      statuses: statusList.map((s) => ({
        context: s.context || '',
        state: s.state || '',
        description: s.description || '',
        targetUrl: s.target_url || '',
        createdAt: s.created_at || '',
        updatedAt: s.updated_at || '',
      })),
      checkRuns: [],
    };
  } catch (err) {
    if (
      err?.name === 'AbortError' ||
      /aborted|AbortError/i.test(String(err?.message || ''))
    ) {
      throw err;
    }
  }
  try {
    const runs = await apiJson(
      `${base}/commits/${encodeURIComponent(sha)}/check-runs?per_page=100&filter=latest`,
      fetchImpl,
      token
    );
    const list = runs?.check_runs || [];
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
  } catch (err) {
    if (
      err?.name === 'AbortError' ||
      /aborted|AbortError/i.test(String(err?.message || ''))
    ) {
      throw err;
    }
  }
  const normalize =
    (typeof globalThis !== 'undefined' &&
      globalThis.PRModalChecks?.normalizeChecks) ||
    null;
  if (typeof normalize === 'function') {
    return normalize(checks);
  }
  // Fallback de-dupe
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
  return checks;
}

/**
 * Development (linked issues) + Projects for conversation aside.
 * Independent of fetchPrDetail. Soft-fails to empty arrays.
 * @param {{ body?: string }} [opts] PR body for #N body links
 */
async function fetchPrDevelopment(
  owner,
  repo,
  number,
  fetchImpl,
  token = null,
  opts = {}
) {
  const ctx = normalizeApiCtx(opts?.ctx);
  const o = String(owner || '').trim();
  const r = String(repo || '').trim();
  const n = Number(number);
  const body = String(opts.body || '');
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
      linkedIssues = editApi.parseLinkedIssueNumbers(body);
    }
  } catch {
    linkedIssues = [];
  }

  let developmentIssues = [];
  let projects = [];
  try {
    const side = await fetchPrSidebarMeta(o, r, n, fetchImpl, token, ctx);
    if (side && typeof side === 'object') {
      if (Array.isArray(side.developmentIssues) && side.developmentIssues.length) {
        developmentIssues = side.developmentIssues.map((item) => ({
          number: Number(item?.number),
          title: String(item?.title || '').trim(),
          url: String(item?.url || '').trim(),
          state: String(item?.state || '').trim().toLowerCase(),
          source: item?.source || 'closing',
          kind: item?.kind || '',
        }));
        const fromGql = developmentIssues
          .map((x) => Number(x?.number))
          .filter((x) => Number.isFinite(x) && x > 0);
        if (fromGql.length) {
          const set = new Set([...linkedIssues, ...fromGql]);
          linkedIssues = [...set].sort((a, b) => a - b);
        }
      }
      if (Array.isArray(side.projects)) projects = side.projects;
    }
  } catch (err) {
    if (
      err?.name === 'AbortError' ||
      /aborted|AbortError/i.test(String(err?.message || ''))
    ) {
      throw err;
    }
  }

  // Union closing-linked + body #N
  {
    const byNum = new Map();
    for (const item of developmentIssues) {
      const num = Number(item?.number);
      if (!Number.isFinite(num) || num <= 0) continue;
      byNum.set(num, {
        number: num,
        title: String(item?.title || '').trim(),
        url: String(item?.url || '').trim(),
        state: String(item?.state || '').trim().toLowerCase(),
        source: item?.source || 'closing',
        kind: item?.kind || '',
      });
    }
    for (const raw of linkedIssues) {
      const num = Number(raw);
      if (!Number.isFinite(num) || num <= 0 || byNum.has(num)) continue;
      byNum.set(num, {
        number: num,
        title: '',
        url: `https://github.com/${o}/${r}/issues/${num}`,
        state: '',
        source: 'body',
        kind: '',
      });
    }
    developmentIssues = [...byNum.values()].sort((a, b) => a.number - b.number);
  }

  const needTitles = developmentIssues
    .filter((x) => !String(x?.title || '').trim())
    .map((x) => x.number);
  if (needTitles.length && token) {
    try {
      const summaries = await fetchIssueOrPrSummaries(
        o,
        r,
        needTitles,
        fetchImpl,
        token
      );
      if (summaries && summaries.size) {
        developmentIssues = developmentIssues.map((item) => {
          const s = summaries.get(item.number);
          if (!s) return item;
          return {
            ...item,
            title: item.title || s.title,
            url: s.url || item.url,
            state: item.state || s.state,
            kind: s.kind || item.kind || '',
          };
        });
      }
    } catch (err) {
      if (
        err?.name === 'AbortError' ||
        /aborted|AbortError/i.test(String(err?.message || ''))
      ) {
        throw err;
      }
    }
  }

  return {
    linkedIssues,
    developmentIssues,
    projects,
  };
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
  const ctx = normalizeApiCtx(options?.ctx);
  const o = String(owner || '').trim();
  const r = String(repo || '').trim();
  const n = Number(number);
  if (!o || !r || !Number.isFinite(n)) {
    throw new Error('owner, repo, and number are required for files');
  }
  const first = githubRestUrl(
    `/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}/pulls/${n}/files?per_page=100`
  , ctx);
  const raw = await fetchRestCollectionAll(first, fetchImpl, token);
  return mapAndAnnotateFiles(raw, options.gitattributesText || '');
}

/**
 * First page of PR files (per_page=100) + optional .gitattributes annotate.
 * Independent of fetchPrDetail — progressive open paints core without waiting.
 * @returns {Promise<{ files: Array, gitattributesText: string }>}
 */
async function fetchPrFiles(
  owner,
  repo,
  number,
  fetchImpl,
  token = null,
  options = {}
) {
  const ctx = normalizeApiCtx(options?.ctx);
  const o = String(owner || '').trim();
  const r = String(repo || '').trim();
  const n = Number(number);
  if (!o || !r || !Number.isFinite(n)) {
    throw new Error('owner, repo, and number are required for files');
  }
  const base = githubRestUrl(
    `/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}`
  , ctx);
  let raw = [];
  try {
    const data = await apiJson(
      `${base}/pulls/${n}/files?per_page=100`,
      fetchImpl,
      token
    );
    raw = Array.isArray(data) ? data : [];
  } catch (err) {
    if (
      err?.name === 'AbortError' ||
      /aborted|AbortError/i.test(String(err?.message || ''))
    ) {
      throw err;
    }
    raw = [];
  }

  let gitattributesText = String(options.gitattributesText || '');
  if (!gitattributesText) {
    try {
      const ref =
        String(options.headSha || options.ref || '').trim() || 'HEAD';
      const attr = await apiJson(
        `${base}/contents/.gitattributes?ref=${encodeURIComponent(ref)}`,
        fetchImpl,
        token
      );
      if (attr?.content && attr.encoding === 'base64') {
        gitattributesText = decodeBase64Utf8(
          String(attr.content).replace(/\n/g, '')
        );
      } else if (typeof attr?.content === 'string') {
        gitattributesText = attr.content;
      }
    } catch (err) {
      if (
        err?.name === 'AbortError' ||
        /aborted|AbortError/i.test(String(err?.message || ''))
      ) {
        throw err;
      }
      gitattributesText = '';
    }
  }

  return {
    files: mapAndAnnotateFiles(raw, gitattributesText),
    gitattributesText,
  };
}

/**
 * Newest-first first window of issue comments (conversation). Independent of core.
 * @returns {Promise<{ items: Array, meta: object }>}
 */
async function fetchPrIssueComments(
  owner,
  repo,
  number,
  fetchImpl,
  token = null,
  ctx = null
) {
  ctx = normalizeApiCtx(ctx);
  const o = String(owner || '').trim();
  const r = String(repo || '').trim();
  const n = Number(number);
  const empty = {
    items: [],
    meta: {
      page: 1,
      perPage: COMMENT_PAGE_SIZE,
      hasMore: false,
      nextPage: null,
      order: 'from-end',
      loadedCount: 0,
    },
  };
  if (!o || !r || !Number.isFinite(n)) return empty;
  try {
    return await fetchPrCommentsPage(
      o,
      r,
      n,
      'issue',
      { page: 1, perPage: COMMENT_PAGE_SIZE, preferNewest: true },
      fetchImpl,
      token,
      ctx
    );
  } catch (err) {
    if (
      err?.name === 'AbortError' ||
      /aborted|AbortError/i.test(String(err?.message || ''))
    ) {
      throw err;
    }
    return empty;
  }
}

/**
 * Submitted PR reviews list. Independent of fetchPrDetail.
 * @returns {Promise<Array>}
 */
async function fetchPrReviews(owner, repo, number, fetchImpl, token = null, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const o = String(owner || '').trim();
  const r = String(repo || '').trim();
  const n = Number(number);
  if (!o || !r || !Number.isFinite(n)) return [];
  try {
    const data = await apiJson(
      githubRestUrl(
        `/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}/pulls/${n}/reviews?per_page=100`
      , ctx),
      fetchImpl,
      token
    );
    return (Array.isArray(data) ? data : []).map((rev) => ({
      id: rev.id,
      author: rev.user?.login || '',
      avatarUrl: rev.user?.avatar_url || '',
      type: rev.user?.type || '',
      isBot:
        String(rev.user?.type || '').toLowerCase() === 'bot' ||
        /\[bot\]$/i.test(String(rev.user?.login || '')),
      state: rev.state || '',
      body: rev.body || '',
      submittedAt: rev.submitted_at,
    }));
  } catch (err) {
    if (
      err?.name === 'AbortError' ||
      /aborted|AbortError/i.test(String(err?.message || ''))
    ) {
      throw err;
    }
    return [];
  }
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
, ctx = null) {
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
