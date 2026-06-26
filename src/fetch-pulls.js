/**
 * Fetch open PR branch metadata: public REST API, same-origin fallback for private repos.
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

function parseBranchFromRefChannel(html, channelKey) {
  const re = new RegExp(`"${channelKey}":"([^"]+)"`);
  const match = html.match(re);
  if (!match) return null;

  const payload = match[1].split('--')[0];
  try {
    const json = JSON.parse(atob(payload));
    if (!json.c || typeof json.c !== 'string') return null;
    const parts = json.c.split(':');
    if (parts[2] !== 'branch') return null;
    return parts.slice(3).join(':') || null;
  } catch {
    return null;
  }
}

function parsePrPageHtml(html, stub) {
  const headRef = parseBranchFromRefChannel(html, 'headRefChannel');
  const baseRef = parseBranchFromRefChannel(html, 'baseRefChannel');
  if (!headRef || !baseRef) {
    throw new Error(`Missing branch refs for PR #${stub.number}`);
  }

  const titleMatch = html.match(/"title":"((?:\\.|[^"\\])*)"/);
  const title = titleMatch
    ? titleMatch[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\')
    : stub.title;

  const draft = html.includes('"isDraft":true') || stub.draft;

  return {
    number: stub.number,
    title,
    headRef,
    baseRef,
    author: stub.author,
    draft,
    htmlUrl: stub.htmlUrl || `#${stub.number}`,
  };
}

function scrapePrListFromDom(doc, findOriginalPrRows) {
  const rows = findOriginalPrRows(doc);
  const prs = [];

  for (const row of rows) {
    const link = row.querySelector(
      'a.js-navigation-open, a[id$="_link"], h3 a[href*="/pull/"]'
    );
    const href = link?.href || '';
    const number = Number.parseInt(
      (href.match(/\/pull\/(\d+)/) || row.id?.match(/(\d+)/) || [])[1],
      10
    );
    if (!Number.isFinite(number)) continue;

    const authorLink = row.querySelector(
      '.opened-by a[href*="author"], [data-hovercard-type="user"]'
    );
    const draft = Boolean(
      row.querySelector('.octicon-git-pull-request-draft') ||
        row.textContent?.includes('Draft')
    );

    prs.push({
      number,
      title: link?.textContent?.trim() || `PR #${number}`,
      author: authorLink?.textContent?.trim() || '',
      draft,
      htmlUrl: href || undefined,
    });
  }

  return prs;
}

async function fetchPrPageBranchData(owner, repo, stub, fetchImpl, origin) {
  const base = origin || `https://github.com/${owner}/${repo}`;
  const url = `${base}/pull/${stub.number}`;
  const res = await fetchImpl(url, { credentials: 'include' });
  if (!res.ok) {
    throw new Error(`PR #${stub.number} page ${res.status}`);
  }
  const html = await res.text();
  return parsePrPageHtml(html, stub);
}

async function mapWithConcurrency(items, limit, worker) {
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

async function fetchOpenPullsViaSameOrigin(owner, repo, doc, fetchImpl, findOriginalPrRows) {
  const stubs = scrapePrListFromDom(doc, findOriginalPrRows);
  if (stubs.length === 0) {
    throw new Error('No PR rows found on page');
  }

  const origin = `https://github.com/${owner}/${repo}`;
  return mapWithConcurrency(stubs, 5, (stub) =>
    fetchPrPageBranchData(owner, repo, stub, fetchImpl, origin)
  );
}

function buildApiHeaders(token) {
  const headers = { Accept: 'application/vnd.github+json' };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
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

async function fetchOpenPulls(owner, repo, fetchImpl, options = {}) {
  const { document, findOriginalPrRows, token = null } = options;

  try {
    return await fetchOpenPullsPublic(owner, repo, fetchImpl, token);
  } catch (err) {
    if (token && (err.status === 401 || err.status === 403)) {
      const authErr = new Error(
        'GitHub API auth failed. Check your token in extension settings.'
      );
      authErr.status = err.status;
      throw authErr;
    }

    const needsFallback =
      err.status === 404 ||
      err.status === 403 ||
      err.status === 401;

    if (!needsFallback || !document || !findOriginalPrRows) {
      throw err;
    }

    return fetchOpenPullsViaSameOrigin(
      owner,
      repo,
      document,
      fetchImpl,
      findOriginalPrRows
    );
  }
}

const fetchApi = {
  mapApiPullRequest,
  parseBranchFromRefChannel,
  parsePrPageHtml,
  scrapePrListFromDom,
  fetchPrPageBranchData,
  buildApiHeaders,
  fetchOpenPullsViaSameOrigin,
  fetchOpenPullsPublic,
  fetchOpenPulls,
  mapWithConcurrency,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = fetchApi;
}
if (typeof globalThis !== 'undefined') {
  globalThis.PRTreeFetch = fetchApi;
}