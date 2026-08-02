/**
 * Fetch feature unit: pulls
 */
import {
  buildApiHeaders,
  escapeRegExp,
  githubRestUrl,
  mapWithConcurrency,
  normalizeApiCtx,
} from './http';
import {
  mapApiPullRequest,
} from './mappers';

export function findDanglingPrNumbers(pagePrNumbers: any, prs: any) {
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

export async function fetchOpenPullsPublic(owner: any, repo: any, fetchImpl: any, token: any = null, ctx: any = null) {
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

/**
 * Lightweight PR probe for auto-refresh (head SHA / draft / state).
 * Prefer over fetchPrDetail when only staleness is needed.
 * @returns {Promise<{ headSha: string, baseSha: string, updatedAt: string|null, draft: boolean, state: string, number: number }>}
 */
export async function fetchPrHeadProbe(owner: any, repo: any, number: any, fetchImpl: any, token: any = null, ctx: any = null) {
  ctx = normalizeApiCtx(ctx);
  const o = String(owner || '').trim();
  const r = String(repo || '').trim();
  const n = Number(number);
  const empty = {
    headSha: '',
    baseSha: '',
    updatedAt: null,
    draft: false,
    state: '',
    number: Number.isFinite(n) ? n : 0,
  };
  if (!o || !r || !Number.isFinite(n) || n <= 0) return empty;
  try {
    const url = githubRestUrl(
      `/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}/pulls/${n}`,
      ctx
    );
    const res = await fetchImpl(url, { headers: buildApiHeaders(token) });
    if (!res.ok) {
      const err = new Error(`GitHub API ${res.status}: ${res.statusText}`);
      err.status = res.status;
      throw err;
    }
    const data = await res.json();
    return {
      headSha: String(data?.head?.sha || ''),
      baseSha: String(data?.base?.sha || ''),
      updatedAt: data?.updated_at || null,
      draft: Boolean(data?.draft),
      state: String(data?.state || ''),
      number: Number(data?.number) || n,
    };
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

export async function fetchPullByNumber(owner: any, repo: any, pullNumber: any, fetchImpl: any, token: any = null, ctx: any = null) {
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
export async function fetchDanglingPulls(owner: any, repo: any, numbers: any, fetchImpl: any, token: any = null, ctx: any = null) {
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
export async function fetchRepoAutolinks(owner: any, repo: any, fetchImpl: any, token: any = null, ctx: any = null) {
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

export function buildAutolinkUrl(urlTemplate: any, num: any) {
  return String(urlTemplate)
    .replace(/<num>/gi, num)
    .replace(/\{num\}/gi, num);
}

/**
 * Find autolink matches in free text (title, branch, body).
 * @returns {Array<{key:string,url:string,prefix:string}>}
 */
export function matchAutolinksInText(text: any, autolinks: any) {
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
export function prMatchText(pr: any) {
  if (!pr) return '';
  return [pr.title, pr.headRef, pr.baseRef, pr.body, pr.author]
    .filter(Boolean)
    .join('\n');
}

/**
 * Attach `magicLinks` array onto each PR from repo autolink rules.
 */
export function attachMagicLinks(prs: any, autolinks: any) {
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
export async function fetchOpenPulls(owner, repo, fetchImpl, options: any = {}) {
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

