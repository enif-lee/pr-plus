/**
 * AUTO-GENERATED from src/fetch/fetch-api.ts
 * SOURCE OF TRUTH: src/fetch/fetch-api.ts — npm run build:fetch
 */
function normalizeApiCtx(ctx) {
  if (ctx && typeof ctx === "object" && (ctx.restBase || ctx.graphqlUrl)) {
    return {
      kind: ctx.kind || "custom",
      webHost: ctx.webHost || "github.com",
      webOrigin: ctx.webOrigin || "",
      restBase: String(ctx.restBase || "https://api.github.com").replace(/\/+$/, ""),
      graphqlUrl: String(
        ctx.graphqlUrl || (String(ctx.restBase || "").includes("api.github.com") ? "https://api.github.com/graphql" : "")
      ).replace(/\/+$/, "") || "https://api.github.com/graphql"
    };
  }
  const webHost = typeof ctx === "string" ? ctx : ctx && typeof ctx === "object" && ctx.webHost ? ctx.webHost : "github.com";
  try {
    if (globalThis.PRGithubEndpoints && typeof globalThis.PRGithubEndpoints.resolveGithubEndpoints === "function") {
      return globalThis.PRGithubEndpoints.resolveGithubEndpoints({ webHost });
    }
  } catch (_) {
  }
  return {
    kind: "dotcom",
    webHost: "github.com",
    webOrigin: "https://github.com",
    restBase: "https://api.github.com",
    graphqlUrl: "https://api.github.com/graphql"
  };
}
function githubRestUrl(path, ctx) {
  const c = normalizeApiCtx(ctx);
  try {
    if (globalThis.PRGithubEndpoints && typeof globalThis.PRGithubEndpoints.githubRestUrl === "function") {
      return globalThis.PRGithubEndpoints.githubRestUrl(path, c);
    }
  } catch (_) {
  }
  const p = String(path || "");
  if (/^https?:\/\//i.test(p)) return p;
  const base = String(c.restBase || "https://api.github.com").replace(/\/+$/, "");
  return base + (p.startsWith("/") ? p : "/" + p);
}
function githubGraphqlUrl(ctx) {
  const c = normalizeApiCtx(ctx);
  try {
    if (globalThis.PRGithubEndpoints && typeof globalThis.PRGithubEndpoints.githubGraphqlUrl === "function") {
      return globalThis.PRGithubEndpoints.githubGraphqlUrl(c);
    }
  } catch (_) {
  }
  return String(c.graphqlUrl || "https://api.github.com/graphql");
}
function mapApiPullRequest(pr) {
  const author = pr.user?.login || "";
  const authorAvatarUrl = pr.user?.avatar_url || "";
  const labels = Array.isArray(pr.labels) ? pr.labels.map((l) => ({
    name: l?.name || String(l || ""),
    color: l?.color || "",
    description: l?.description || ""
  })).filter((l) => l.name) : [];
  const assignees = Array.isArray(pr.assignees) ? pr.assignees.map((u) => u?.login || u).filter(Boolean) : [];
  const requestedReviewers = Array.isArray(pr.requested_reviewers) ? pr.requested_reviewers.map((u) => u?.login || u).filter(Boolean) : [];
  const avatarUrls = {};
  const putUser = (u) => {
    const login = u?.login || (typeof u === "string" ? u : "");
    const url = u?.avatar_url || "";
    if (login && url) avatarUrls[String(login).toLowerCase()] = url;
  };
  putUser(pr.user);
  for (const u of pr.assignees || []) putUser(u);
  for (const u of pr.requested_reviewers || []) putUser(u);
  const milestone = pr.milestone ? {
    number: pr.milestone.number,
    title: pr.milestone.title || "",
    state: pr.milestone.state || "",
    dueOn: pr.milestone.due_on || null
  } : null;
  return {
    number: pr.number,
    title: pr.title,
    // Body required so attachMagicLinks/prMatchText can match description tokens
    body: pr.body || "",
    headRef: pr.head?.ref || "",
    baseRef: pr.base?.ref || "",
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
    nodeId: pr.node_id || null
  };
}
function buildApiHeaders(token) {
  const headers = { Accept: "application/vnd.github+json" };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}
function findDanglingPrNumbers(pagePrNumbers, prs) {
  if (!Array.isArray(pagePrNumbers) || pagePrNumbers.length === 0) {
    return [];
  }
  const have = new Set((prs || []).map((pr) => pr.number));
  const dangling = [];
  const seen = /* @__PURE__ */ new Set();
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
    headers: buildApiHeaders(token)
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
    headers: buildApiHeaders(token)
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
async function fetchRepoAutolinks(owner, repo, fetchImpl, token = null, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const url = githubRestUrl(`/repos/${owner}/${repo}/autolinks`, ctx);
  try {
    const res = await fetchImpl(url, { headers: buildApiHeaders(token) });
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data.filter((a) => a && typeof a.key_prefix === "string" && typeof a.url_template === "string").map((a) => ({
      key_prefix: a.key_prefix,
      url_template: a.url_template,
      is_alphanumeric: a.is_alphanumeric !== false
    }));
  } catch {
    return [];
  }
}
function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function buildAutolinkUrl(urlTemplate, num) {
  return String(urlTemplate).replace(/<num>/gi, num).replace(/\{num\}/gi, num);
}
function matchAutolinksInText(text, autolinks) {
  if (!text || !Array.isArray(autolinks) || autolinks.length === 0) return [];
  const found = [];
  const seen = /* @__PURE__ */ new Set();
  for (const rule of autolinks) {
    const prefix = rule.key_prefix;
    if (!prefix) continue;
    const numClass = rule.is_alphanumeric !== false ? "(?:\\d+|[A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)*)" : "\\d+";
    const re = new RegExp(
      `(^|[^A-Za-z0-9_])(${escapeRegExp(prefix)})(${numClass})`,
      "gi"
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
function prMatchText(pr) {
  if (!pr) return "";
  return [pr.title, pr.headRef, pr.baseRef, pr.body, pr.author].filter(Boolean).join("\n");
}
function attachMagicLinks(prs, autolinks) {
  if (!Array.isArray(prs)) return [];
  if (!Array.isArray(autolinks) || autolinks.length === 0) {
    return prs.map((pr) => ({ ...pr, magicLinks: pr.magicLinks || [] }));
  }
  return prs.map((pr) => ({
    ...pr,
    magicLinks: matchAutolinksInText(prMatchText(pr), autolinks)
  }));
}
async function fetchOpenPulls(owner, repo, fetchImpl, options = {}) {
  const {
    token = null,
    pagePrNumbers = [],
    includeAutolinks = true
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
    if (typeof Buffer !== "undefined") {
      return Buffer.from(b64, "base64").toString("utf8");
    }
  } catch {
  }
  try {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder("utf-8").decode(bytes);
  } catch {
    return "";
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
async function apiJsonWithLink(url, fetchImpl, token) {
  const res = await fetchImpl(url, { headers: buildApiHeaders(token) });
  if (!res.ok) {
    const err = new Error(`GitHub API ${res.status}: ${res.statusText}`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  let link = "";
  try {
    if (typeof res.headers?.get === "function") {
      link = res.headers.get("link") || res.headers.get("Link") || "";
    }
  } catch {
    link = "";
  }
  return { data, link };
}
function parseLinkNextUrl(linkHeader) {
  if (!linkHeader) return null;
  const parts = String(linkHeader).split(",");
  for (const p of parts) {
    const m = p.match(/<([^>]+)>\s*;\s*rel="?next"?/i);
    if (m) return m[1].trim();
  }
  return null;
}
async function fetchRestCollectionAll(firstUrl, fetchImpl, token, opts = {}) {
  const maxPages = Number.isFinite(opts.maxPages) && opts.maxPages > 0 ? Math.floor(opts.maxPages) : 50;
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
    sha: c?.sha || "",
    message: c?.commit?.message || c?.message || "",
    author: c?.commit?.author?.name || c?.author?.login || c?.author || "",
    date: c?.commit?.author?.date || c?.commit?.committer?.date || c?.date || ""
  };
}
async function fetchPrCommits(owner, repo, number, fetchImpl, token = null, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const o = String(owner || "").trim();
  const r = String(repo || "").trim();
  const n = Number(number);
  if (!o || !r || !Number.isFinite(n)) {
    throw new Error("owner, repo, and number are required for commits");
  }
  const url = githubRestUrl(
    `/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}/pulls/${n}/commits?per_page=100`,
    ctx
  );
  try {
    const data = await apiJson(url, fetchImpl, token);
    return (Array.isArray(data) ? data : []).map(mapPrCommitRow).filter((c) => c.sha);
  } catch (err) {
    if (err?.name === "AbortError" || /aborted|AbortError/i.test(String(err?.message || ""))) {
      throw err;
    }
    return [];
  }
}
async function fetchAllPrCommits(owner, repo, number, fetchImpl, token = null, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const o = String(owner || "").trim();
  const r = String(repo || "").trim();
  const n = Number(number);
  if (!o || !r || !Number.isFinite(n)) {
    throw new Error("owner, repo, and number are required for commits");
  }
  const first = githubRestUrl(
    `/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}/pulls/${n}/commits?per_page=100`,
    ctx
  );
  const raw = await fetchRestCollectionAll(first, fetchImpl, token);
  return raw.map(mapPrCommitRow).filter((c) => c.sha);
}
async function fetchPrChecks(owner, repo, headSha, fetchImpl, token = null, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const o = String(owner || "").trim();
  const r = String(repo || "").trim();
  const sha = String(headSha || "").trim();
  const empty = { state: "unknown", totalCount: 0, statuses: [], checkRuns: [] };
  if (!o || !r || !sha) return empty;
  const base = githubRestUrl(`/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}`, ctx);
  let checks = { ...empty };
  try {
    const status = await apiJson(`${base}/commits/${encodeURIComponent(sha)}/status`, fetchImpl, token);
    const statusList = Array.isArray(status?.statuses) ? status.statuses : [];
    const emptyCombined = !statusList.length && !(Number(status?.total_count) > 0);
    checks = {
      state: emptyCombined ? "unknown" : status.state || "unknown",
      totalCount: emptyCombined ? 0 : status.total_count || statusList.length,
      statuses: statusList.map((s) => ({
        context: s.context || "",
        state: s.state || "",
        description: s.description || "",
        targetUrl: s.target_url || "",
        createdAt: s.created_at || "",
        updatedAt: s.updated_at || ""
      })),
      checkRuns: []
    };
  } catch (err) {
    if (err?.name === "AbortError" || /aborted|AbortError/i.test(String(err?.message || ""))) {
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
      checks.checkRuns = list.map((r2) => ({
        id: r2.id,
        name: r2.name || "",
        status: r2.status || "",
        conclusion: r2.conclusion || "",
        htmlUrl: r2.html_url || "",
        startedAt: r2.started_at || "",
        completedAt: r2.completed_at || "",
        appSlug: r2.app?.slug || "",
        appName: r2.app?.name || ""
      }));
    }
  } catch (err) {
    if (err?.name === "AbortError" || /aborted|AbortError/i.test(String(err?.message || ""))) {
      throw err;
    }
  }
  const normalize = typeof globalThis !== "undefined" && globalThis.PRModalChecks?.normalizeChecks || null;
  if (typeof normalize === "function") {
    return normalize(checks);
  }
  const byCtx = /* @__PURE__ */ new Map();
  for (const s of checks.statuses || []) {
    const k = String(s.context || "").toLowerCase();
    if (!k) continue;
    const prev = byCtx.get(k);
    const t = Date.parse(s.updatedAt || s.createdAt || "") || 0;
    const pt = prev ? Date.parse(prev.updatedAt || prev.createdAt || "") || 0 : -1;
    if (!prev || t >= pt) byCtx.set(k, s);
  }
  const byName = /* @__PURE__ */ new Map();
  for (const r2 of checks.checkRuns || []) {
    const k = String(r2.name || "").toLowerCase();
    if (!k) continue;
    const prev = byName.get(k);
    const t = Date.parse(r2.completedAt || r2.startedAt || "") || Number(r2.id) || 0;
    const pt = prev ? Date.parse(prev.completedAt || prev.startedAt || "") || Number(prev.id) || 0 : -1;
    if (!prev || t >= pt) byName.set(k, r2);
  }
  checks.statuses = [...byCtx.values()];
  checks.checkRuns = [...byName.values()];
  checks.totalCount = checks.statuses.length + checks.checkRuns.length;
  return checks;
}
async function fetchPrDevelopment(owner, repo, number, fetchImpl, token = null, opts = {}) {
  const ctx = normalizeApiCtx(opts?.ctx);
  const o = String(owner || "").trim();
  const r = String(repo || "").trim();
  const n = Number(number);
  const body = String(opts.body || "");
  let linkedIssues = [];
  try {
    let editApi = typeof globalThis !== "undefined" ? globalThis.PRModalPrEditApi : null;
    if (!editApi && typeof require === "function") {
      try {
        editApi = require("./modal/pure/pr-edit-api.js");
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
    if (side && typeof side === "object") {
      if (Array.isArray(side.developmentIssues) && side.developmentIssues.length) {
        developmentIssues = side.developmentIssues.map((item) => ({
          number: Number(item?.number),
          title: String(item?.title || "").trim(),
          url: String(item?.url || "").trim(),
          state: String(item?.state || "").trim().toLowerCase(),
          source: item?.source || "closing",
          kind: item?.kind || ""
        }));
        const fromGql = developmentIssues.map((x) => Number(x?.number)).filter((x) => Number.isFinite(x) && x > 0);
        if (fromGql.length) {
          const set = /* @__PURE__ */ new Set([...linkedIssues, ...fromGql]);
          linkedIssues = [...set].sort((a, b) => a - b);
        }
      }
      if (Array.isArray(side.projects)) projects = side.projects;
    }
  } catch (err) {
    if (err?.name === "AbortError" || /aborted|AbortError/i.test(String(err?.message || ""))) {
      throw err;
    }
  }
  {
    const byNum = /* @__PURE__ */ new Map();
    for (const item of developmentIssues) {
      const num = Number(item?.number);
      if (!Number.isFinite(num) || num <= 0) continue;
      byNum.set(num, {
        number: num,
        title: String(item?.title || "").trim(),
        url: String(item?.url || "").trim(),
        state: String(item?.state || "").trim().toLowerCase(),
        source: item?.source || "closing",
        kind: item?.kind || ""
      });
    }
    for (const raw of linkedIssues) {
      const num = Number(raw);
      if (!Number.isFinite(num) || num <= 0 || byNum.has(num)) continue;
      byNum.set(num, {
        number: num,
        title: "",
        url: `https://github.com/${o}/${r}/issues/${num}`,
        state: "",
        source: "body",
        kind: ""
      });
    }
    developmentIssues = [...byNum.values()].sort((a, b) => a.number - b.number);
  }
  const needTitles = developmentIssues.filter((x) => !String(x?.title || "").trim()).map((x) => x.number);
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
            kind: s.kind || item.kind || ""
          };
        });
      }
    } catch (err) {
      if (err?.name === "AbortError" || /aborted|AbortError/i.test(String(err?.message || ""))) {
        throw err;
      }
    }
  }
  return {
    linkedIssues,
    developmentIssues,
    projects
  };
}
async function fetchAllPrFiles(owner, repo, number, fetchImpl, token = null, options = {}) {
  const ctx = normalizeApiCtx(options?.ctx);
  const o = String(owner || "").trim();
  const r = String(repo || "").trim();
  const n = Number(number);
  if (!o || !r || !Number.isFinite(n)) {
    throw new Error("owner, repo, and number are required for files");
  }
  const first = githubRestUrl(
    `/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}/pulls/${n}/files?per_page=100`,
    ctx
  );
  const raw = await fetchRestCollectionAll(first, fetchImpl, token);
  return mapAndAnnotateFiles(raw, options.gitattributesText || "");
}
async function fetchPrFiles(owner, repo, number, fetchImpl, token = null, options = {}) {
  const ctx = normalizeApiCtx(options?.ctx);
  const o = String(owner || "").trim();
  const r = String(repo || "").trim();
  const n = Number(number);
  if (!o || !r || !Number.isFinite(n)) {
    throw new Error("owner, repo, and number are required for files");
  }
  const base = githubRestUrl(
    `/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}`,
    ctx
  );
  let raw = [];
  try {
    const data = await apiJson(
      `${base}/pulls/${n}/files?per_page=100`,
      fetchImpl,
      token
    );
    raw = Array.isArray(data) ? data : [];
  } catch (err) {
    if (err?.name === "AbortError" || /aborted|AbortError/i.test(String(err?.message || ""))) {
      throw err;
    }
    raw = [];
  }
  let gitattributesText = String(options.gitattributesText || "");
  if (!gitattributesText) {
    try {
      const ref = String(options.headSha || options.ref || "").trim() || "HEAD";
      const attr = await apiJson(
        `${base}/contents/.gitattributes?ref=${encodeURIComponent(ref)}`,
        fetchImpl,
        token
      );
      if (attr?.content && attr.encoding === "base64") {
        gitattributesText = decodeBase64Utf8(
          String(attr.content).replace(/\n/g, "")
        );
      } else if (typeof attr?.content === "string") {
        gitattributesText = attr.content;
      }
    } catch (err) {
      if (err?.name === "AbortError" || /aborted|AbortError/i.test(String(err?.message || ""))) {
        throw err;
      }
      gitattributesText = "";
    }
  }
  return {
    files: mapAndAnnotateFiles(raw, gitattributesText),
    gitattributesText
  };
}
async function fetchPrIssueComments(owner, repo, number, fetchImpl, token = null, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const o = String(owner || "").trim();
  const r = String(repo || "").trim();
  const n = Number(number);
  const empty = {
    items: [],
    meta: {
      page: 1,
      perPage: COMMENT_PAGE_SIZE,
      hasMore: false,
      nextPage: null,
      order: "from-end",
      loadedCount: 0
    }
  };
  if (!o || !r || !Number.isFinite(n)) return empty;
  try {
    return await fetchPrCommentsPage(
      o,
      r,
      n,
      "issue",
      { page: 1, perPage: COMMENT_PAGE_SIZE, preferNewest: true },
      fetchImpl,
      token,
      ctx
    );
  } catch (err) {
    if (err?.name === "AbortError" || /aborted|AbortError/i.test(String(err?.message || ""))) {
      throw err;
    }
    return empty;
  }
}
async function fetchPrReviews(owner, repo, number, fetchImpl, token = null, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const o = String(owner || "").trim();
  const r = String(repo || "").trim();
  const n = Number(number);
  if (!o || !r || !Number.isFinite(n)) return [];
  try {
    const data = await apiJson(
      githubRestUrl(
        `/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}/pulls/${n}/reviews?per_page=100`,
        ctx
      ),
      fetchImpl,
      token
    );
    return (Array.isArray(data) ? data : []).map((rev) => ({
      id: rev.id,
      author: rev.user?.login || "",
      avatarUrl: rev.user?.avatar_url || "",
      type: rev.user?.type || "",
      isBot: String(rev.user?.type || "").toLowerCase() === "bot" || /\[bot\]$/i.test(String(rev.user?.login || "")),
      state: rev.state || "",
      body: rev.body || "",
      submittedAt: rev.submitted_at
    }));
  } catch (err) {
    if (err?.name === "AbortError" || /aborted|AbortError/i.test(String(err?.message || ""))) {
      throw err;
    }
    return [];
  }
}
const COMMENT_PAGE_SIZE = 50;
function commentsPageHelpers() {
  try {
    let mod = typeof globalThis !== "undefined" ? globalThis.PRModalCommentsPage : null;
    if (!mod && typeof require === "function") {
      try {
        mod = require("./modal/pure/comments-page.js");
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
    author: c.user?.login || "",
    avatarUrl: c.user?.avatar_url || "",
    body: c.body || "",
    createdAt: c.created_at
  };
}
function mapReviewComment(c, extra = {}) {
  const subjectTypeRaw = String(
    extra.subjectType || c.subject_type || c.subjectType || ""
  ).toLowerCase();
  const isFileSubject = subjectTypeRaw === "file";
  const line = isFileSubject ? null : c.line ?? c.original_line ?? (c.position != null && Number.isFinite(Number(c.position)) ? Number(c.position) : null);
  const outdated = extra.outdated != null ? Boolean(extra.outdated) : c.outdated != null ? Boolean(c.outdated) : !isFileSubject && c.line == null && c.original_line != null;
  const subjectType = isFileSubject || line == null && !c.original_line && c.path && subjectTypeRaw !== "line" ? "file" : "line";
  return {
    id: c.id,
    author: c.user?.login || "",
    avatarUrl: c.user?.avatar_url || "",
    body: c.body || "",
    path: c.path || "",
    line: line != null ? Number(line) : null,
    originalLine: subjectType === "file" ? null : c.original_line ?? null,
    startLine: subjectType === "file" ? null : c.start_line ?? null,
    side: c.side || "RIGHT",
    startSide: c.start_side || null,
    diffHunk: c.diff_hunk || c.diffHunk || "",
    createdAt: c.created_at,
    inReplyToId: c.in_reply_to_id ?? null,
    nodeId: c.node_id || null,
    threadNodeId: extra.threadNodeId ?? null,
    /** Pull request review id (groups file threads under one review event). */
    reviewId: c.pull_request_review_id != null ? Number(c.pull_request_review_id) : extra.reviewId != null ? Number(extra.reviewId) : null,
    resolved: Boolean(extra.resolved),
    outdated,
    /** True when part of a not-yet-submitted PENDING review (hidden from main list). */
    pending: Boolean(extra.pending || c.pending),
    pendingReviewId: extra.pendingReviewId ?? c.pendingReviewId ?? null,
    /** `file` | `line` — file-level comments have no line anchor. */
    subjectType
  };
}
function mapGraphqlReviewCommentNode(node, threadMeta = {}) {
  if (!node) return null;
  const id = node.databaseId ?? null;
  if (id == null) return null;
  const reviewState = String(node.pullRequestReview?.state || "").toUpperCase();
  const pending = reviewState === "PENDING";
  const reviewDbId = node.pullRequestReview?.databaseId != null ? Number(node.pullRequestReview.databaseId) : null;
  const subjectTypeRaw = String(
    threadMeta.subjectType || node.subjectType || ""
  ).toUpperCase();
  const isFile = subjectTypeRaw === "FILE";
  const line = isFile ? null : node.line != null ? Number(node.line) : node.originalLine != null ? Number(node.originalLine) : null;
  const sideRaw = threadMeta.diffSide || threadMeta.side || "RIGHT";
  const side = String(sideRaw).toUpperCase() === "LEFT" ? "LEFT" : "RIGHT";
  return {
    id: Number(id),
    author: node.author?.login || "",
    avatarUrl: node.author?.avatarUrl || "",
    body: node.body || "",
    path: node.path || threadMeta.path || "",
    line,
    originalLine: isFile ? null : node.originalLine ?? null,
    startLine: isFile ? null : node.startLine ?? node.originalStartLine ?? null,
    side,
    startSide: threadMeta.startDiffSide || null,
    diffHunk: node.diffHunk || "",
    createdAt: node.createdAt || null,
    inReplyToId: node.replyTo?.databaseId ?? null,
    nodeId: node.id || null,
    threadNodeId: threadMeta.threadNodeId || null,
    reviewId: reviewDbId,
    resolved: Boolean(threadMeta.resolved),
    outdated: Boolean(node.outdated ?? threadMeta.isOutdated),
    pending,
    pendingReviewId: pending ? reviewDbId : null,
    subjectType: isFile ? "file" : "line"
  };
}
function mergePendingReviewComments(published, pendingList) {
  const list = Array.isArray(published) ? published.slice() : [];
  const seen = new Set(list.map((c) => c && c.id != null ? String(c.id) : "").filter(Boolean));
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
        diffHunk: host.diffHunk || p.diffHunk || "",
        resolved: Boolean(host.resolved || p.resolved)
      };
      continue;
    }
    seen.add(key);
    list.push(p);
  }
  return list;
}
function pickViewerPendingFromReviews(reviews, login) {
  const list = Array.isArray(reviews) ? reviews : [];
  const mine = list.filter((r2) => {
    if (!r2 || String(r2.state || "").toUpperCase() !== "PENDING") return false;
    if (!login) return true;
    return String(r2.user?.login || "").toLowerCase() === String(login).toLowerCase();
  });
  if (!mine.length) return null;
  const r = mine[mine.length - 1];
  return {
    id: Number(r.id),
    node_id: r.node_id || null
  };
}
async function fetchViewerPendingReviewBundle(owner, repo, pullNumber, fetchImpl, token, preloaded = null, ctx = null) {
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
    const comments = (Array.isArray(raw) ? raw : []).map(
      (c) => mapReviewComment(c, { pending: true, pendingReviewId: pending.id })
    );
    return {
      comments,
      review: {
        id: pending.id,
        nodeId: pending.node_id || null,
        commentCount: comments.length
      }
    };
  } catch {
    return {
      comments: [],
      review: {
        id: pending.id,
        nodeId: pending.node_id || null,
        commentCount: 0
      }
    };
  }
}
async function fetchViewerPendingReviewComments(owner, repo, pullNumber, fetchImpl, token) {
  const { comments } = await fetchViewerPendingReviewBundle(
    owner,
    repo,
    pullNumber,
    fetchImpl,
    token
  );
  return comments;
}
async function createPendingPullReview(owner, repo, pullNumber, { commitId } = {}, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const body = {};
  if (commitId) body.commit_id = commitId;
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/pulls/${pullNumber}/reviews`, ctx),
    fetchImpl,
    token,
    { method: "POST", body }
  );
}
async function submitPendingPullReview(owner, repo, pullNumber, reviewId, { event = "COMMENT", body = "" } = {}, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const id = Number(reviewId);
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error("Invalid pending review id");
  }
  const ev = String(event || "COMMENT").toUpperCase();
  if (!["COMMENT", "APPROVE", "REQUEST_CHANGES"].includes(ev)) {
    throw new Error("Invalid review event");
  }
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/pulls/${pullNumber}/reviews/${id}/events`, ctx),
    fetchImpl,
    token,
    { method: "POST", body: { event: ev, body: body || "" } }
  );
}
async function deletePendingPullReview(owner, repo, pullNumber, reviewId, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const id = Number(reviewId);
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error("Invalid pending review id");
  }
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/pulls/${pullNumber}/reviews/${id}`, ctx),
    fetchImpl,
    token,
    { method: "DELETE" }
  );
}
async function fetchPrCommentsPage(owner, repo, pullNumber, kind, opts, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const helpers = commentsPageHelpers();
  const perPage = helpers?.clampPerPage?.(opts?.perPage) || Math.min(100, Number(opts?.perPage) || COMMENT_PAGE_SIZE);
  let page = Math.max(1, Number(opts?.page) || 1);
  const since = opts?.since || null;
  const preferNewest = Boolean(opts?.preferNewest) && !since;
  const orderHint = opts?.order || null;
  async function fetchPage(pageNum, listOpts = {}, ctx2 = null) {
    ctx2 = normalizeApiCtx(ctx2);
    const sort = listOpts.sort != null ? listOpts.sort : kind === "review" ? "created" : void 0;
    const direction = listOpts.direction != null ? listOpts.direction : kind === "review" ? preferNewest || orderHint === "desc" ? "desc" : "asc" : void 0;
    const url = helpers?.buildCommentsListUrl ? helpers.buildCommentsListUrl(kind, owner, repo, pullNumber, {
      page: pageNum,
      perPage,
      since,
      sort,
      direction
    }) : (() => {
      const base = kind === "review" ? githubRestUrl(`/repos/${owner}/${repo}/pulls/${pullNumber}/comments`, ctx2) : githubRestUrl(`/repos/${owner}/${repo}/issues/${pullNumber}/comments`, ctx2);
      const q = new URLSearchParams({
        per_page: String(perPage),
        page: String(pageNum)
      });
      if (since) q.set("since", since);
      if (sort) q.set("sort", sort);
      if (direction) q.set("direction", direction);
      return `${base}?${q}`;
    })();
    const { data, link } = await apiJsonWithLink(url, fetchImpl, token);
    const raw = Array.isArray(data) ? data : [];
    const items = kind === "review" ? raw.map(mapReviewComment) : raw.map(mapIssueComment);
    return { items, raw, link, pageNum };
  }
  if (kind === "issue" && preferNewest && page === 1 && !orderHint) {
    const probe = await fetchPage(1);
    const lastPage = helpers?.parseLinkLastPage && helpers.parseLinkLastPage(probe.link) || null;
    if (lastPage != null && lastPage > 1) {
      const newest = await fetchPage(lastPage);
      const meta3 = helpers?.buildCommentsPageMeta ? helpers.buildCommentsPageMeta(newest.items, {
        page: lastPage,
        perPage,
        linkHeader: newest.link,
        since,
        order: "from-end"
      }) : {
        page: lastPage,
        perPage,
        hasMore: lastPage > 1,
        nextPage: lastPage > 1 ? lastPage - 1 : null,
        order: "from-end",
        since,
        loadedCount: newest.items.length
      };
      return { items: newest.items, meta: meta3, kind };
    }
    const meta2 = helpers?.buildCommentsPageMeta ? helpers.buildCommentsPageMeta(probe.items, {
      page: 1,
      perPage,
      linkHeader: probe.link,
      since,
      order: "from-end"
    }) : {
      page: 1,
      perPage,
      hasMore: false,
      nextPage: null,
      order: "from-end",
      since,
      loadedCount: probe.items.length
    };
    return { items: probe.items, meta: meta2, kind };
  }
  if (kind === "issue" && (orderHint === "from-end" || opts?.order === "from-end")) {
    const res2 = await fetchPage(page);
    const meta2 = helpers?.buildCommentsPageMeta ? helpers.buildCommentsPageMeta(res2.items, {
      page,
      perPage,
      linkHeader: res2.link,
      since,
      order: "from-end"
    }) : {
      page,
      perPage,
      hasMore: page > 1,
      nextPage: page > 1 ? page - 1 : null,
      order: "from-end",
      since,
      loadedCount: res2.items.length
    };
    return { items: res2.items, meta: meta2, kind };
  }
  const res = await fetchPage(page, {
    direction: kind === "review" ? preferNewest || orderHint === "desc" ? "desc" : "asc" : void 0,
    sort: kind === "review" ? "created" : void 0
  });
  const meta = helpers?.buildCommentsPageMeta ? helpers.buildCommentsPageMeta(res.items, {
    page,
    perPage,
    linkHeader: res.link,
    since,
    order: kind === "review" && (preferNewest || orderHint === "desc") ? "desc" : "asc"
  }) : {
    page,
    perPage,
    hasMore: res.raw.length >= perPage,
    nextPage: res.raw.length >= perPage ? page + 1 : null,
    since,
    loadedCount: res.items.length
  };
  return { items: res.items, meta, kind };
}
async function apiSend(url, fetchImpl, token, { method = "GET", body } = {}) {
  const headers = buildApiHeaders(token);
  if (body != null) headers["Content-Type"] = "application/json";
  const res = await fetchImpl(url, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : void 0
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const j = await res.json();
      if (j?.message) detail = j.message;
      if (Array.isArray(j?.errors) && j.errors.length) {
        const bits = j.errors.map((e) => {
          if (!e || typeof e !== "object") return String(e);
          if (e.message) return e.message;
          const field = e.field || e.resource || "";
          const code = e.code || "";
          return [field, code].filter(Boolean).join(" ") || null;
        }).filter(Boolean);
        if (bits.length) detail = `${detail}: ${bits.join("; ")}`;
      }
    } catch {
    }
    const err = new Error(`GitHub API ${res.status}: ${detail}`);
    err.status = res.status;
    throw err;
  }
  if (res.status === 204) return null;
  return res.json();
}
async function fetchPrSidebarMeta(owner, repo, number, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const o = String(owner || "").trim();
  const r = String(repo || "").trim();
  const n = Number(number);
  if (!o || !r || !Number.isFinite(n) || n <= 0 || !token) {
    return { projects: [], developmentIssues: [] };
  }
  const query = `
    query($owner:String!,$repo:String!,$number:Int!) {
      repository(owner:$owner, name:$repo) {
        pullRequest(number:$number) {
          projectItems(first: 20) {
            nodes {
              id
              project {
                title
                number
                url
              }
            }
          }
          closingIssuesReferences(first: 20) {
            nodes {
              number
              title
              url
              state
            }
          }
        }
      }
    }
  `;
  try {
    const data = await apiGraphql(
      query,
      { owner: o, repo: r, number: n },
      fetchImpl,
      token,
      ctx
    );
    const prNode = data?.repository?.pullRequest || null;
    const projects = [];
    for (const node of prNode?.projectItems?.nodes || []) {
      const p = node?.project;
      if (!p) continue;
      const title = String(p.title || "").trim();
      if (!title) continue;
      projects.push({
        id: String(node.id || `${p.number}:${title}`),
        title,
        number: p.number != null ? Number(p.number) : null,
        url: String(p.url || "").trim()
      });
    }
    const developmentIssues = [];
    for (const node of prNode?.closingIssuesReferences?.nodes || []) {
      const num = Number(node?.number);
      if (!Number.isFinite(num) || num <= 0) continue;
      developmentIssues.push({
        number: num,
        title: String(node?.title || "").trim(),
        url: String(node?.url || "").trim(),
        state: String(node?.state || "").trim().toLowerCase()
      });
    }
    return { projects, developmentIssues };
  } catch (err) {
    if (err?.name === "AbortError" || /aborted|AbortError/i.test(String(err?.message || ""))) {
      throw err;
    }
    return { projects: [], developmentIssues: [] };
  }
}
async function fetchIssueOrPrSummaries(owner, repo, numbers, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const o = String(owner || "").trim();
  const r = String(repo || "").trim();
  const nums = [
    ...new Set(
      (Array.isArray(numbers) ? numbers : []).map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0)
    )
  ].slice(0, 30);
  const out = /* @__PURE__ */ new Map();
  if (!o || !r || !nums.length || !token) return out;
  const fields = nums.map(
    (n, i) => `
      n${i}: issueOrPullRequest(number: ${n}) {
        __typename
        ... on Issue { number title url state }
        ... on PullRequest { number title url state }
      }`
  ).join("\n");
  const query = `
    query($owner:String!,$repo:String!) {
      repository(owner:$owner, name:$repo) {
        ${fields}
      }
    }
  `;
  try {
    const data = await apiGraphql(
      query,
      { owner: o, repo: r },
      fetchImpl,
      token,
      ctx
    );
    const repoNode = data?.repository || {};
    for (let i = 0; i < nums.length; i++) {
      const node = repoNode[`n${i}`];
      if (!node || node.number == null) continue;
      const num = Number(node.number);
      if (!Number.isFinite(num) || num <= 0) continue;
      out.set(num, {
        number: num,
        title: String(node.title || "").trim(),
        url: String(node.url || "").trim(),
        state: String(node.state || "").trim().toLowerCase(),
        kind: node.__typename === "PullRequest" ? "pull" : "issue"
      });
    }
  } catch (err) {
    if (err?.name === "AbortError" || /aborted|AbortError/i.test(String(err?.message || ""))) {
      throw err;
    }
  }
  return out;
}
async function apiGraphql(query, variables, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const json = await apiSend(
    githubGraphqlUrl(ctx),
    fetchImpl,
    token,
    { method: "POST", body: { query, variables: variables || {} } }
  );
  if (json?.errors?.length) {
    const msg = json.errors.map((e) => e?.message || String(e)).filter(Boolean).join("; ");
    const err = new Error(`GitHub GraphQL: ${msg || "unknown error"}`);
    err.graphqlErrors = json.errors;
    err.status = 200;
    throw err;
  }
  return json?.data ?? null;
}
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
const REVIEW_THREADS_API_MAX = 100;
const REVIEW_THREADS_PAGE_SIZE = REVIEW_THREADS_API_MAX;
function mapReviewThreadNodes(allNodes) {
  const threads = [];
  const comments = [];
  for (const t of Array.isArray(allNodes) ? allNodes : []) {
    if (!t?.id) continue;
    const threadMeta = {
      threadNodeId: t.id,
      resolved: Boolean(t.isResolved),
      isOutdated: Boolean(t.isOutdated),
      path: t.path || "",
      diffSide: t.diffSide || "RIGHT",
      startDiffSide: t.startDiffSide || null,
      line: t.line ?? null,
      originalLine: t.originalLine ?? null,
      startLine: t.startLine ?? t.originalStartLine ?? null,
      subjectType: t.subjectType || null
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
      path: t.path || "",
      line: t.line ?? t.originalLine ?? null,
      startLine: t.startLine ?? t.originalStartLine ?? null,
      side: t.diffSide || "RIGHT",
      commentIds
    });
  }
  return { threads, comments };
}
async function fetchReviewThreadsPage(owner, repo, pullNumber, { direction = "newest", cursor = null, pageSize = REVIEW_THREADS_PAGE_SIZE } = {}, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
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
    direction
  };
  if (!token) return empty;
  const n = Number(pullNumber);
  if (!Number.isFinite(n)) return empty;
  const size = Math.max(
    1,
    Math.min(REVIEW_THREADS_API_MAX, Number(pageSize) || REVIEW_THREADS_PAGE_SIZE)
  );
  const dir = String(direction || "newest");
  const useLast = dir === "newest" || dir === "older";
  const query = useLast ? REVIEW_THREADS_LAST_QUERY : REVIEW_THREADS_FIRST_QUERY;
  const data = await apiGraphql(
    query,
    {
      owner,
      name: repo,
      number: n,
      n: size,
      cursor: cursor || null
    },
    fetchImpl,
    token,
    ctx
  );
  const conn = data?.repository?.pullRequest?.reviewThreads;
  const nodes = conn?.nodes || [];
  const pageInfo = conn?.pageInfo || {};
  const mapped = mapReviewThreadNodes(nodes);
  const windowTag = dir === "newest" || dir === "older" ? "newest" : "oldest";
  for (const t of mapped.threads) {
    t.loadWindow = windowTag;
  }
  return {
    threads: mapped.threads,
    comments: mapped.comments,
    totalCount: typeof conn?.totalCount === "number" ? conn.totalCount : null,
    startCursor: pageInfo.startCursor || null,
    endCursor: pageInfo.endCursor || null,
    hasNextPage: Boolean(pageInfo.hasNextPage),
    hasPreviousPage: Boolean(pageInfo.hasPreviousPage),
    // Convenience for dual-window UI
    hasMore: useLast ? Boolean(pageInfo.hasPreviousPage) : Boolean(pageInfo.hasNextPage),
    pageCount: 1,
    direction: dir,
    window: windowTag
  };
}
function collectUnresolvedThreadNodeIds(detail) {
  const dropped = detail?._droppedThreadNodeIds instanceof Set ? detail._droppedThreadNodeIds : new Set(
    Array.isArray(detail?._droppedThreadNodeIds) ? detail._droppedThreadNodeIds.map(String) : []
  );
  const ids = /* @__PURE__ */ new Set();
  for (const t of Array.isArray(detail?.reviewThreads) ? detail.reviewThreads : []) {
    if (!t?.threadNodeId || t.resolved) continue;
    const id = String(t.threadNodeId);
    if (dropped.has(id)) continue;
    ids.add(id);
  }
  const list = Array.isArray(detail?.reviewComments) ? detail.reviewComments : [];
  const byId = /* @__PURE__ */ new Map();
  for (const c of list) {
    if (c && c.id != null) byId.set(String(c.id), c);
  }
  for (const c of list) {
    if (!c?.threadNodeId || c.resolved) continue;
    const id = String(c.threadNodeId);
    if (dropped.has(id)) continue;
    const parentId = c.inReplyToId ?? c.in_reply_to_id ?? null;
    if (parentId != null && byId.has(String(parentId))) continue;
    ids.add(id);
  }
  return [...ids];
}
async function fetchReviewThreadsByIds(threadNodeIds, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const empty = {
    threads: [],
    comments: [],
    pageCount: 0,
    direction: "refresh",
    totalCount: null,
    hasPreviousPage: false,
    hasNextPage: false,
    requestedThreadIds: [],
    missingThreadIds: []
  };
  if (!token) return empty;
  const ids = [
    ...new Set(
      (Array.isArray(threadNodeIds) ? threadNodeIds : []).map((id) => String(id || "").trim()).filter(Boolean)
    )
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
  const foundIds = /* @__PURE__ */ new Set();
  let pages = 0;
  for (let i = 0; i < ids.length; i += REVIEW_THREADS_API_MAX) {
    const chunk = ids.slice(i, i + REVIEW_THREADS_API_MAX);
    try {
      const data = await apiGraphql(query, { ids: chunk }, fetchImpl, token, ctx);
      const rawNodes = Array.isArray(data?.nodes) ? data.nodes : [];
      const nodes = rawNodes.filter(Boolean);
      const mapped = mapReviewThreadNodes(nodes);
      for (const t of mapped.threads) {
        t.loadWindow = t.loadWindow || "refresh";
        if (t.threadNodeId) foundIds.add(String(t.threadNodeId));
      }
      for (const n of nodes) {
        if (n?.id) foundIds.add(String(n.id));
      }
      allThreads.push(...mapped.threads);
      allComments.push(...mapped.comments);
      pages += 1;
    } catch (err) {
      console.warn(
        "[pr-plus] fetchReviewThreadsByIds chunk failed",
        err?.message || err
      );
    }
  }
  const missingThreadIds = ids.filter((id) => !foundIds.has(String(id)));
  return {
    threads: allThreads,
    comments: allComments,
    pageCount: pages,
    direction: "refresh",
    totalCount: null,
    hasPreviousPage: false,
    hasNextPage: false,
    requestedThreadIds: ids,
    missingThreadIds
  };
}
function dropReviewThreadsFromDetail(detail, threadNodeIds) {
  if (!detail) return detail;
  const drop = new Set(
    [...threadNodeIds || []].map((id) => String(id || "").trim()).filter(Boolean)
  );
  if (!drop.size) return detail;
  const prevRc = Array.isArray(detail.reviewComments) ? detail.reviewComments : [];
  const prevTh = Array.isArray(detail.reviewThreads) ? detail.reviewThreads : [];
  const droppedCommentIds = [];
  const reviewComments = prevRc.filter((c) => {
    if (!c) return false;
    const tid = c.threadNodeId ? String(c.threadNodeId) : "";
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
      ...detail._deletedReviewCommentIds instanceof Set ? detail._deletedReviewCommentIds : Array.isArray(detail._deletedReviewCommentIds) ? detail._deletedReviewCommentIds : [],
      ...droppedCommentIds
    ].map(String)
  );
  const prevMeta = detail.reviewThreadsMeta || emptyReviewThreadsMeta();
  const filterIdList = (list) => (Array.isArray(list) ? list : []).map(String).filter((id) => id && !drop.has(id));
  const loadedThreadCount = reviewThreads.length;
  const totalCount = Math.max(
    0,
    Number(prevMeta.totalCount) || loadedThreadCount
  );
  const nextTotal = Number.isFinite(Number(prevMeta.totalCount)) && Number(prevMeta.totalCount) >= drop.size ? Math.max(loadedThreadCount, Number(prevMeta.totalCount) - drop.size) : totalCount;
  const hiddenCount = Math.max(0, nextTotal - loadedThreadCount);
  const prevDroppedThreads = detail._droppedThreadNodeIds instanceof Set ? detail._droppedThreadNodeIds : Array.isArray(detail._droppedThreadNodeIds) ? detail._droppedThreadNodeIds : [];
  const droppedThreads = new Set([...prevDroppedThreads, ...drop].map(String));
  return {
    ...detail,
    reviewComments,
    reviewThreads,
    reviewCommentsMeta: {
      ...detail.reviewCommentsMeta || {},
      loadedCount: reviewComments.length
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
      hasNewerFromOldest: hiddenCount > 0 && Boolean(prevMeta.hasNewerFromOldest)
    },
    _deletedReviewCommentIds: deleted.size ? deleted : detail._deletedReviewCommentIds,
    // Never re-request these PRRT ids in collectUnresolvedThreadNodeIds
    _droppedThreadNodeIds: droppedThreads
  };
}
async function fetchPullReviewThreadsBundle(owner, repo, pullNumber, fetchImpl, token, opts = {}) {
  const ctx = normalizeApiCtx(opts?.ctx);
  if (!token) {
    return {
      threads: [],
      comments: [],
      hasMore: false,
      endCursor: null,
      startCursor: null,
      pageCount: 0,
      totalCount: 0,
      reviewThreadsMeta: emptyReviewThreadsMeta()
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
  const newest = await fetchReviewThreadsPage(
    owner,
    repo,
    pullNumber,
    { direction: "newest", cursor: null, pageSize: lastPageSize },
    fetchImpl,
    token,
    ctx
  );
  const totalCount = Number(newest.totalCount) || newest.threads.length;
  let oldest = null;
  if (totalCount >= REVIEW_THREADS_API_MAX && newest.hasPreviousPage) {
    try {
      oldest = await fetchReviewThreadsPage(
        owner,
        repo,
        pullNumber,
        {
          direction: "oldest",
          cursor: null,
          pageSize: startPageSize
        },
        fetchImpl,
        token,
        ctx
      );
    } catch {
      oldest = null;
    }
  }
  const threads = [...newest.threads || []];
  const comments = [...newest.comments || []];
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
    endCursor: newest.startCursor || null
    // legacy: load-more-older
  };
  return {
    threads,
    comments,
    hasMore: meta.hasMore,
    endCursor: meta.endCursor,
    startCursor: newest.startCursor || null,
    pageCount: meta.pagesLoaded,
    totalCount,
    reviewThreadsMeta: meta
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
    endCursor: null
  };
}
function mergeReviewThreadsPageIntoDetail(detail, page, direction = "older") {
  if (!detail) return detail;
  const dir = String(direction || page?.direction || "older");
  const prevMeta = detail.reviewThreadsMeta || emptyReviewThreadsMeta();
  const prevRc = Array.isArray(detail.reviewComments) ? detail.reviewComments : [];
  const prevTh = Array.isArray(detail.reviewThreads) ? detail.reviewThreads : [];
  const explicitMissing = Array.isArray(page?.missingThreadIds) ? page.missingThreadIds.map(String).filter(Boolean) : [];
  const requested = Array.isArray(page?.requestedThreadIds) ? page.requestedThreadIds.map(String).filter(Boolean) : [];
  const returnedIds = new Set(
    (page?.threads || []).map((t) => t?.threadNodeId ? String(t.threadNodeId) : "").filter(Boolean)
  );
  const derivedMissing = requested.length > 0 ? requested.filter((id) => !returnedIds.has(id)) : [];
  const missingIds = [
    .../* @__PURE__ */ new Set([...explicitMissing, ...derivedMissing])
  ];
  let baseRc = prevRc;
  if ((dir === "refresh" || dir === "ids") && (page?.threads || []).length) {
    const refreshed = new Set(
      (page.threads || []).map((t) => t?.threadNodeId ? String(t.threadNodeId) : "").filter(Boolean)
    );
    if (refreshed.size) {
      baseRc = prevRc.filter(
        (c) => !c?.threadNodeId || !refreshed.has(String(c.threadNodeId))
      );
    }
  }
  const reviewComments = mergePendingReviewComments(baseRc, page?.comments || []);
  const resolvedByThread = /* @__PURE__ */ new Map();
  for (const t of page?.threads || []) {
    if (t?.threadNodeId) {
      resolvedByThread.set(String(t.threadNodeId), Boolean(t.resolved));
    }
  }
  const stampedComments = resolvedByThread.size === 0 ? reviewComments : reviewComments.map((c) => {
    if (!c?.threadNodeId) return c;
    const key = String(c.threadNodeId);
    if (!resolvedByThread.has(key)) return c;
    return { ...c, resolved: resolvedByThread.get(key) };
  });
  const thById = new Map(
    prevTh.map((t) => [String(t.threadNodeId), t]).filter(([k]) => k && k !== "undefined")
  );
  for (const t of page?.threads || []) {
    if (t?.threadNodeId) {
      thById.set(String(t.threadNodeId), {
        ...thById.get(String(t.threadNodeId)) || {},
        ...t
      });
    }
  }
  const reviewThreads = [...thById.values()];
  let newestIds = new Set((prevMeta.newestThreadIds || []).map(String));
  let oldestIds = new Set((prevMeta.oldestThreadIds || []).map(String));
  const pageIds = (page?.threads || []).map((t) => t.threadNodeId).filter(Boolean).map(String);
  let newestStartCursor = prevMeta.newestStartCursor;
  let newestEndCursor = prevMeta.newestEndCursor;
  let hasOlder = prevMeta.hasOlder;
  let oldestStartCursor = prevMeta.oldestStartCursor;
  let oldestEndCursor = prevMeta.oldestEndCursor;
  let hasNewerFromOldest = prevMeta.hasNewerFromOldest;
  if (dir === "refresh" || dir === "ids") {
  } else if (dir === "newest" || dir === "older") {
    for (const id of pageIds) newestIds.add(id);
    if (page?.startCursor) newestStartCursor = page.startCursor;
    if (dir === "newest" && page?.endCursor) newestEndCursor = page.endCursor;
    hasOlder = Boolean(page?.hasPreviousPage);
  } else {
    for (const id of pageIds) oldestIds.add(id);
    if (page?.endCursor) oldestEndCursor = page.endCursor;
    if (dir === "oldest" && page?.startCursor) oldestStartCursor = page.startCursor;
    hasNewerFromOldest = Boolean(page?.hasNextPage);
  }
  const totalCount = typeof page?.totalCount === "number" ? page.totalCount : Number(prevMeta.totalCount) || reviewThreads.length;
  const loadedThreadCount = reviewThreads.length;
  const hiddenCount = Math.max(0, totalCount - loadedThreadCount);
  for (const id of newestIds) oldestIds.delete(id);
  const meta = {
    ...prevMeta,
    totalCount,
    hiddenCount,
    loadedThreadCount,
    loadedCommentCount: stampedComments.length,
    pagesLoaded: dir === "refresh" || dir === "ids" ? Number(prevMeta.pagesLoaded) || 0 : (Number(prevMeta.pagesLoaded) || 0) + (page?.pageCount || 1),
    newestStartCursor,
    newestEndCursor,
    hasOlder: hiddenCount > 0 && hasOlder,
    oldestStartCursor,
    oldestEndCursor,
    hasNewerFromOldest: hiddenCount > 0 && hasNewerFromOldest,
    newestThreadIds: [...newestIds],
    oldestThreadIds: [...oldestIds],
    hasMore: hiddenCount > 0,
    endCursor: newestStartCursor
  };
  let next = {
    ...detail,
    reviewComments: stampedComments,
    reviewThreads,
    reviewCommentsMeta: {
      ...detail.reviewCommentsMeta || {},
      loadedCount: stampedComments.length,
      hasMore: meta.hasMore
    },
    reviewThreadsMeta: meta
  };
  if ((dir === "refresh" || dir === "ids") && missingIds.length) {
    next = dropReviewThreadsFromDetail(next, missingIds);
  }
  return next;
}
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
function fetchNowMs() {
  return typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
}
async function timedFetch(timings, name, promise, extra = void 0, opts = {}) {
  const t0 = fetchNowMs();
  const batchStart = opts && Number.isFinite(opts.batchStart) ? Number(opts.batchStart) : null;
  if (batchStart != null) {
    timings[`${name}_start`] = Math.round(t0 - batchStart);
  }
  try {
    const result = await promise;
    const ms = Math.round(fetchNowMs() - t0);
    timings[name] = ms;
    let suffix = "";
    try {
      if (typeof extra === "function") suffix = extra(result) || "";
    } catch {
    }
    const startLabel = batchStart != null && timings[`${name}_start`] != null ? ` t+${timings[`${name}_start`]}ms` : "";
    console.log(
      `[pr-plus] fetchPrDetail ${name}: ${ms}ms${startLabel}${suffix ? ` ${suffix}` : ""}`
    );
    return result;
  } catch (err) {
    const ms = Math.round(fetchNowMs() - t0);
    timings[name] = ms;
    const msg = err?.message || String(err);
    timings[`${name}_error`] = msg;
    const startLabel = batchStart != null && timings[`${name}_start`] != null ? ` t+${timings[`${name}_start`]}ms` : "";
    console.log(
      `[pr-plus] fetchPrDetail ${name}: ${ms}ms${startLabel} ERROR ${msg}`
    );
    throw err;
  }
}
function logParallelRestSummary(timings, names, wallMs) {
  const rows = (Array.isArray(names) ? names : []).map((name) => {
    const ms = Number(timings[name]);
    const start = Number(timings[`${name}_start`]);
    const err = timings[`${name}_error`];
    return {
      name,
      ms: Number.isFinite(ms) ? ms : null,
      start: Number.isFinite(start) ? start : null,
      error: err ? String(err) : null
    };
  }).filter((r) => r.ms != null);
  rows.sort((a, b) => (b.ms || 0) - (a.ms || 0));
  const slowest = rows[0];
  const sum = rows.reduce((s, r) => s + (r.ms || 0), 0);
  const lines = rows.map((r) => {
    const bar = wallMs > 0 && r.ms != null ? "\u2588".repeat(Math.max(1, Math.round(r.ms / wallMs * 20))) : "";
    const start = r.start != null ? `+${r.start}ms`.padStart(7) : "   n/a";
    const dur = r.ms != null ? `${r.ms}ms`.padStart(6) : "   n/a";
    const err = r.error ? ` ERR:${r.error.slice(0, 40)}` : "";
    return `  ${r.name.padEnd(16)} start${start}  dur${dur}  ${bar}${err}`;
  });
  console.log(
    `[pr-plus] fetchPrDetail parallel REST summary
  wall=${Math.round(wallMs)}ms  sum=${sum}ms  slowest=${slowest ? `${slowest.name}@${slowest.ms}ms` : "n/a"}
` + (lines.length ? lines.join("\n") : "  (no rows)")
  );
  timings.coreParallel = {
    wallMs: Math.round(wallMs),
    sumMs: sum,
    slowest: slowest ? { name: slowest.name, ms: slowest.ms } : null,
    byName: Object.fromEntries(rows.map((r) => [r.name, r.ms]))
  };
}
function sleepMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms || 0)));
}
async function fetchConflictFilePaths(owner, repo, baseRef, headSha, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const o = String(owner || "").trim();
  const r = String(repo || "").trim();
  const ref = String(baseRef || "").trim();
  const head = String(headSha || "").trim();
  if (!o || !r || !ref || !head) return [];
  try {
    const baseUrl = githubRestUrl(`/repos/${o}/${r}`, ctx);
    const refJson = await apiJson(
      `${baseUrl}/git/ref/heads/${encodeURIComponent(ref)}`,
      fetchImpl,
      token
    );
    const baseTip = String(refJson?.object?.sha || "").trim();
    if (!baseTip) return [];
    const headVsBase = await apiJson(
      `${baseUrl}/compare/${encodeURIComponent(baseTip)}...${encodeURIComponent(head)}`,
      fetchImpl,
      token
    );
    const mergeBase = String(headVsBase?.merge_base_commit?.sha || "").trim();
    if (!mergeBase) return [];
    const [baseSide, headSide] = await Promise.all([
      apiJson(
        `${baseUrl}/compare/${encodeURIComponent(mergeBase)}...${encodeURIComponent(baseTip)}?per_page=100`,
        fetchImpl,
        token
      ),
      apiJson(
        `${baseUrl}/compare/${encodeURIComponent(mergeBase)}...${encodeURIComponent(head)}?per_page=100`,
        fetchImpl,
        token
      )
    ]);
    const onBase = new Set(
      (Array.isArray(baseSide?.files) ? baseSide.files : []).map((f) => String(f?.filename || f?.previous_filename || "").trim()).filter(Boolean)
    );
    const conflicts = [];
    for (const f of Array.isArray(headSide?.files) ? headSide.files : []) {
      const path = String(f?.filename || "").trim();
      if (path && onBase.has(path)) conflicts.push(path);
    }
    return conflicts;
  } catch (err) {
    if (err?.name === "AbortError" || /aborted|AbortError/i.test(String(err?.message || ""))) {
      throw err;
    }
    console.log(
      `[pr-plus] fetchConflictFilePaths: soft-fail ${err?.message || err}`
    );
    return [];
  }
}
async function resolvePrMergeability(pr, base, pullNumber, fetchImpl, token, timings, meta = {}) {
  if (!pr || typeof pr !== "object") return pr;
  let out = pr;
  const apiCtx = normalizeApiCtx(meta?.apiCtx || meta?.ctx);
  const needsCompute = out.mergeable == null || out.mergeable === void 0 || !String(out.mergeable_state || "").trim() || String(out.mergeable_state || "").toLowerCase() === "unknown";
  if (needsCompute) {
    try {
      await sleepMs(350);
      const again = await timedFetch(
        timings,
        "pullMergeable",
        apiJson(`${base}/pulls/${pullNumber}`, fetchImpl, token),
        (p) => `(mergeable=${p?.mergeable} state=${p?.mergeable_state || "?"})`
      );
      if (again && typeof again === "object") {
        out = {
          ...out,
          mergeable: again.mergeable,
          mergeable_state: again.mergeable_state,
          rebaseable: again.rebaseable != null ? again.rebaseable : out.rebaseable,
          merge_commit_sha: again.merge_commit_sha || out.merge_commit_sha
        };
      }
    } catch (err) {
      if (err?.name === "AbortError" || /aborted|AbortError/i.test(String(err?.message || ""))) {
        throw err;
      }
      console.log(
        `[pr-plus] resolvePrMergeability re-fetch: soft-fail ${err?.message || err}`
      );
    }
  }
  const state = String(out.mergeable_state || "").toLowerCase();
  const isDirty = state === "dirty" || out.mergeable === false && state !== "blocked" && state !== "clean";
  if (isDirty) {
    const baseOwner = out.base?.repo?.owner?.login || String(meta.owner || "").trim() || null;
    const baseRepo = out.base?.repo?.name || String(meta.repo || "").trim() || null;
    const conflictFiles = await timedFetch(
      timings,
      "conflictFiles",
      fetchConflictFilePaths(
        baseOwner,
        baseRepo,
        out.base?.ref || "",
        out.head?.sha || "",
        fetchImpl,
        token,
        apiCtx
      ).catch(() => []),
      (list) => `(${Array.isArray(list) ? list.length : 0} paths)`
    );
    out = {
      ...out,
      _conflictFiles: Array.isArray(conflictFiles) ? conflictFiles : []
    };
  } else {
    out = { ...out, _conflictFiles: [] };
  }
  return out;
}
async function fetchPrDetail(owner, repo, pullNumber, fetchImpl, token = null, opts = {}) {
  const ctx = normalizeApiCtx(opts?.ctx);
  const base = githubRestUrl(`/repos/${owner}/${repo}`, ctx);
  const n = Number(pullNumber);
  const skipReviewThreads = Boolean(opts.skipReviewThreads);
  const threadsMaxPages = skipReviewThreads ? 0 : Math.max(1, Math.min(20, Number(opts.threadsMaxPages) || 1));
  const timings = {};
  const tTotal0 = fetchNowMs();
  console.log(
    `[pr-plus] fetchPrDetail start ${owner}/${repo}#${n} skipReviewThreads=${skipReviewThreads} threadsMaxPages=${threadsMaxPages}`
  );
  const PARALLEL_REST_KEYS = ["pull", "viewerLogin", "autolinks"];
  const tParallel0 = fetchNowMs();
  const batchOpt = { batchStart: tParallel0 };
  let [pr, viewerLogin, autolinks] = await Promise.all([
    timedFetch(
      timings,
      "pull",
      apiJson(`${base}/pulls/${n}`, fetchImpl, token),
      null,
      batchOpt
    ),
    timedFetch(
      timings,
      "viewerLogin",
      fetchViewerLogin(fetchImpl, token, ctx),
      null,
      batchOpt
    ),
    timedFetch(
      timings,
      "autolinks",
      fetchRepoAutolinks(owner, repo, fetchImpl, token, ctx),
      (r) => `(${Array.isArray(r) ? r.length : 0} links)`,
      batchOpt
    )
  ]);
  const parallelWall = fetchNowMs() - tParallel0;
  timings.coreParallelWall = Math.round(parallelWall);
  logParallelRestSummary(timings, PARALLEL_REST_KEYS, parallelWall);
  timings.files = 0;
  timings.issueComments = 0;
  timings.reviews = 0;
  timings.commits = 0;
  timings.commitStatus = 0;
  timings.checkRuns = 0;
  timings.sidebarMeta = 0;
  timings.gitattributes = 0;
  console.log(
    "[pr-plus] fetchPrDetail files/comments/reviews/commits/checks/development: deferred (independent fetches)"
  );
  const files = [];
  const commentsPage = {
    items: [],
    meta: {
      page: 1,
      perPage: COMMENT_PAGE_SIZE,
      hasMore: false,
      nextPage: null,
      order: "from-end",
      loadedCount: 0
    }
  };
  const reviews = [];
  pr = await resolvePrMergeability(pr, base, n, fetchImpl, token, timings, {
    owner,
    repo,
    apiCtx: ctx
  });
  const subscription = await timedFetch(
    timings,
    "subscription",
    token ? fetchPullRequestSubscription(
      owner,
      repo,
      n,
      fetchImpl,
      token,
      pr?.node_id || null,
      ctx
    ) : Promise.resolve(null)
  );
  const comments = commentsPage?.items || [];
  let reviewThreadBundle = {
    threads: [],
    comments: [],
    hasMore: false,
    endCursor: null,
    pageCount: 0
  };
  if (token && threadsMaxPages > 0) {
    reviewThreadBundle = await timedFetch(
      timings,
      "reviewThreads",
      fetchPullReviewThreadsBundle(owner, repo, n, fetchImpl, token, {
        cursor: opts.threadsCursor || null,
        maxPages: threadsMaxPages,
        ctx
      }).catch((err) => {
        if (err?.name === "AbortError" || /aborted|AbortError/i.test(String(err?.message || ""))) {
          throw err;
        }
        return reviewThreadBundle;
      }),
      (b) => `(${(b?.threads || []).length} threads, ${(b?.comments || []).length} comments)`
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
  let pendingBundle = { comments: [], review: null };
  if (token) {
    pendingBundle = await timedFetch(
      timings,
      "pendingReview",
      fetchViewerPendingReviewBundle(
        owner,
        repo,
        n,
        fetchImpl,
        token,
        {
          reviews: [],
          login: viewerLogin
        },
        ctx
      ).catch((err) => {
        if (err?.name === "AbortError" || /aborted|AbortError/i.test(String(err?.message || ""))) {
          throw err;
        }
        return { comments: [], review: null };
      }),
      (b) => `(${(b?.comments || []).length} pending comments)`
    );
  } else {
    timings.pendingReview = 0;
    console.log("[pr-plus] fetchPrDetail pendingReview: skipped (no token)");
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
    loadedCount: (reviewComments || []).length
  };
  const reviewThreadsMeta = reviewThreadBundle?.reviewThreadsMeta ? { ...reviewThreadBundle.reviewThreadsMeta } : {
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
    )
  };
  const headSha = pr.head?.sha || "";
  const checks = { state: "unknown", totalCount: 0, statuses: [], checkRuns: [] };
  const commits = [];
  let linkedIssues = [];
  const developmentIssues = [];
  const projects = [];
  try {
    let editApi = typeof globalThis !== "undefined" ? globalThis.PRModalPrEditApi : null;
    if (!editApi && typeof require === "function") {
      try {
        editApi = require("./modal/pure/pr-edit-api.js");
      } catch {
        editApi = null;
      }
    }
    if (editApi?.parseLinkedIssueNumbers) {
      linkedIssues = editApi.parseLinkedIssueNumbers(pr.body || "");
    }
  } catch {
    linkedIssues = [];
  }
  const gitattributesText = "";
  const filesOut = [];
  timings.mapAnnotateFiles = 0;
  const subscribed = subscription && typeof subscription.subscribed === "boolean" ? Boolean(subscription.subscribed) : null;
  const magicLinks = matchAutolinksInText(
    prMatchText({
      title: pr.title,
      body: pr.body || "",
      headRef: pr.head?.ref || "",
      baseRef: pr.base?.ref || "",
      author: pr.user?.login || ""
    }),
    Array.isArray(autolinks) ? autolinks : []
  );
  timings.total = Math.round(fetchNowMs() - tTotal0);
  console.log(
    `[pr-plus] fetchPrDetail total: ${timings.total}ms`,
    JSON.stringify(timings)
  );
  if (typeof console.table === "function") {
    try {
      console.table(timings);
    } catch {
    }
  }
  return {
    owner,
    repo,
    number: pr.number,
    nodeId: pr.node_id || null,
    title: pr.title,
    body: pr.body || "",
    state: pr.state,
    draft: Boolean(pr.draft),
    author: pr.user?.login || "",
    authorAvatarUrl: pr.user?.avatar_url || "",
    viewerLogin: viewerLogin || null,
    baseRef: pr.base?.ref || "",
    headRef: pr.head?.ref || "",
    baseSha: pr.base?.sha || "",
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
    /** Paths that appear modified on both base tip and head (conflict candidates). */
    conflictFiles: Array.isArray(pr._conflictFiles) ? pr._conflictFiles : [],
    rebaseable: pr.rebaseable ?? null,
    createdAt: pr.created_at,
    updatedAt: pr.updated_at,
    additions: pr.additions,
    deletions: pr.deletions,
    changedFiles: pr.changed_files,
    /** Total commits on the PR (REST field); may exceed first page of commits[]. */
    commitsCount: pr.commits != null ? Number(pr.commits) : null,
    labels: Array.isArray(pr.labels) ? pr.labels.map((l) => ({
      name: l.name || "",
      color: l.color || "",
      description: l.description || ""
    })) : [],
    assignees: Array.isArray(pr.assignees) ? pr.assignees.map((u) => u.login || u).filter(Boolean) : [],
    /** login → avatar_url for people chips when API provided them */
    avatarUrls: (() => {
      const map = {};
      const putUser = (u) => {
        const login = u?.login || (typeof u === "string" ? u : "");
        const url = u?.avatar_url || "";
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
        const login = u?.login || (typeof u === "string" ? u : "");
        if (!login) return;
        const key = String(login).toLowerCase();
        const type = String(u?.type || "").toLowerCase();
        if (type === "bot" || /\[bot\]$/i.test(String(login))) map[key] = true;
      };
      for (const u of pr.assignees || []) put(u);
      for (const u of pr.requested_reviewers || []) put(u);
      for (const r of reviews || []) put(r?.user);
      for (const c of comments || []) put(c?.user);
      for (const c of reviewComments || []) put(c?.user);
      return map;
    })(),
    requestedReviewers: Array.isArray(pr.requested_reviewers) ? pr.requested_reviewers.map((u) => u.login || u).filter(Boolean) : [],
    requestedTeams: Array.isArray(pr.requested_teams) ? pr.requested_teams.map((t) => t.slug || t.name).filter(Boolean) : [],
    milestone: pr.milestone ? {
      number: pr.milestone.number,
      title: pr.milestone.title || "",
      state: pr.milestone.state || "",
      dueOn: pr.milestone.due_on || null
    } : null,
    linkedIssues,
    /** Issues linked for Development (closing refs / body #N). */
    developmentIssues,
    /** ProjectV2 boards this PR is on. */
    projects,
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
      loadedCount: Array.isArray(comments) ? comments.length : 0
    },
    // Populated by independent fetchPrReviews
    reviews: Array.isArray(reviews) ? reviews : [],
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
    // Populated by independent side fetches (host)
    commits: Array.isArray(commits) ? commits : [],
    checks,
    /** Debug: per-request ms from this fetchPrDetail call */
    _fetchTimings: timings
  };
}
async function postIssueComment(owner, repo, issueNumber, body, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/issues/${issueNumber}/comments`, ctx),
    fetchImpl,
    token,
    { method: "POST", body: { body } }
  );
}
async function submitPullReview(owner, repo, pullNumber, { event, body = "", commitId, comments }, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const payload = { event, body: body || "" };
  if (commitId) payload.commit_id = commitId;
  if (Array.isArray(comments) && comments.length) {
    payload.comments = comments.map((c) => {
      const row = {
        path: c.path,
        body: c.body,
        line: c.line,
        side: c.side || "RIGHT"
      };
      if (c.start_line != null || c.startLine != null) {
        const sl = c.start_line != null ? c.start_line : c.startLine;
        if (Number(sl) !== Number(c.line)) {
          row.start_line = Number(sl);
          row.start_side = c.start_side || c.startSide || c.side || "RIGHT";
        }
      }
      return row;
    });
  }
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/pulls/${pullNumber}/reviews`, ctx),
    fetchImpl,
    token,
    { method: "POST", body: payload }
  );
}
async function postReviewCommentViaPendingGraphql(pendingReviewNodeId, { body, path, line, side = "RIGHT", startLine, startSide, subjectType = "line" }, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const isFile = String(subjectType || "").toLowerCase() === "file";
  const hasRange = !isFile && startLine != null && Number.isFinite(Number(startLine)) && Number(startLine) !== Number(line);
  const variables = {
    review: String(pendingReviewNodeId),
    body: String(body || "").trim(),
    path: String(path || "")
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
    variables.side = String(side || "RIGHT").toUpperCase() === "LEFT" ? "LEFT" : "RIGHT";
    variables.startLine = Number(startLine);
    variables.startSide = String(startSide || side || "RIGHT").toUpperCase() === "LEFT" ? "LEFT" : "RIGHT";
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
    variables.side = String(side || "RIGHT").toUpperCase() === "LEFT" ? "LEFT" : "RIGHT";
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
  const data = await apiGraphql(query, variables, fetchImpl, token, ctx);
  const thread = data?.addPullRequestReviewThread?.thread;
  const node = thread?.comments?.nodes?.[0];
  if (!node) {
    throw new Error(
      isFile ? `Could not add pending file comment on ${path}.` : `Could not add pending comment on ${path}:${line} (${side || "RIGHT"}). The line may be outside the diff or on the wrong side.`
    );
  }
  const threadNodeId = thread?.id || null;
  const rest = mapGraphqlReviewCommentToRest(node, {
    body,
    path,
    line: isFile ? null : line,
    startLine: hasRange ? Number(startLine) : null,
    side,
    inReplyToId: null
  });
  return {
    ...rest,
    // GraphQL/REST often omit line on pending comments — keep selection line for UI
    line: isFile ? null : rest.line ?? Number(line),
    path: rest.path || path,
    side: side || "RIGHT",
    start_line: hasRange ? Number(startLine) : null,
    start_side: hasRange ? startSide || side || "RIGHT" : null,
    subject_type: isFile ? "file" : "line",
    pending: true,
    pendingReviewId: node.pullRequestReview?.databaseId ?? null,
    threadNodeId
  };
}
async function ensureViewerPendingReview(owner, repo, pullNumber, { commitId = null, createIfMissing = false } = {}, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const hydrateNodeId = async (pending2) => {
    if (!pending2?.id) return null;
    try {
      const full = await apiJson(
        githubRestUrl(`/repos/${owner}/${repo}/pulls/${pullNumber}/reviews/${pending2.id}`, ctx),
        fetchImpl,
        token
      );
      if (!full || String(full.state || "").toUpperCase() !== "PENDING") {
        return null;
      }
      return {
        id: Number(pending2.id),
        node_id: full.node_id || pending2.node_id || null
      };
    } catch (err) {
      if (err?.status === 404) return null;
      if (err?.status >= 400 && err?.status < 500) return null;
      return pending2?.node_id ? { id: Number(pending2.id), node_id: pending2.node_id } : null;
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
      node_id: created?.node_id || null
    };
  } catch (err) {
    const msg = String(err?.message || err || "");
    if (err?.status === 422 || /one pending review/i.test(msg) || /Unprocessable Entity/i.test(msg)) {
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
async function postReviewComment(owner, repo, pullNumber, {
  body,
  path,
  line,
  side = "RIGHT",
  commitId,
  startLine,
  startSide,
  asPending = false,
  subjectType = "line"
}, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const text = String(body || "").trim();
  if (!text) throw new Error("Comment body is required");
  if (!path) throw new Error("path is required");
  const isFile = String(subjectType || "").toLowerCase() === "file";
  if (!isFile && line == null) throw new Error("path and line are required");
  let pending = await ensureViewerPendingReview(
    owner,
    repo,
    pullNumber,
    {
      commitId: commitId || null,
      // Create only when caller wants pending; also create path recovers on 422
      createIfMissing: Boolean(asPending)
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
    subjectType: isFile ? "file" : "line"
  };
  if (pending?.node_id) {
    try {
      const raw = await postReviewCommentViaPendingGraphql(
        pending.node_id,
        gqlFields,
        fetchImpl,
        token,
        ctx
      );
      return {
        ...raw,
        pending: true,
        pendingReviewId: raw.pendingReviewId || pending.id || null
      };
    } catch (err) {
      const msg = String(err?.message || err || "");
      if (asPending && /Could not resolve to a node|global id|NOT_FOUND|Could not find/i.test(msg)) {
        try {
          const created = await createPendingPullReview(
            owner,
            repo,
            pullNumber,
            { commitId: commitId || null },
            fetchImpl,
            token,
            ctx
          );
          pending = {
            id: Number(created?.id),
            node_id: created?.node_id || null
          };
        } catch (createErr) {
          if (createErr?.status === 422 || /one pending review/i.test(String(createErr?.message || ""))) {
            pending = await ensureViewerPendingReview(
              owner,
              repo,
              pullNumber,
              { commitId: commitId || null, createIfMissing: false },
              fetchImpl,
              token,
              ctx
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
            token,
            ctx
          );
          return {
            ...raw,
            pending: true,
            pendingReviewId: raw.pendingReviewId || pending.id || null
          };
        }
      }
      throw err;
    }
  }
  if (asPending) {
    throw new Error(
      "Could not start or find a pending review. Try Discard any leftover pending review, then retry."
    );
  }
  const payload = isFile ? { body: text, path, subject_type: "file" } : { body: text, path, line, side };
  if (commitId) payload.commit_id = commitId;
  if (!isFile && startLine != null && Number(startLine) !== Number(line)) {
    payload.start_line = Number(startLine);
    payload.start_side = startSide || side || "RIGHT";
  }
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/pulls/${pullNumber}/comments`, ctx),
    fetchImpl,
    token,
    { method: "POST", body: payload }
  );
}
async function findViewerPendingReview(owner, repo, pullNumber, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  if (!token) return null;
  const n = Number(pullNumber);
  if (!Number.isFinite(n)) return null;
  try {
    const [reviews, login] = await Promise.all([
      apiJson(
        githubRestUrl(`/repos/${owner}/${repo}/pulls/${n}/reviews?per_page=100`, ctx),
        fetchImpl,
        token
      ).catch(() => []),
      fetchViewerLogin(fetchImpl, token).catch(() => null)
    ]);
    return pickViewerPendingFromReviews(reviews, login);
  } catch {
    return null;
  }
}
function mapGraphqlReviewCommentToRest(c, fallback = {}) {
  if (!c) return null;
  return {
    id: c.databaseId ?? fallback.id ?? null,
    node_id: c.id || null,
    body: c.body || fallback.body || "",
    path: c.path || fallback.path || "",
    line: c.line ?? fallback.line ?? null,
    original_line: c.originalLine ?? null,
    start_line: c.startLine ?? fallback.startLine ?? null,
    side: c.side || fallback.side || "RIGHT",
    start_side: c.startSide || null,
    diff_hunk: c.diffHunk || "",
    created_at: c.createdAt || fallback.createdAt || null,
    in_reply_to_id: c.replyTo?.databaseId ?? c.replyTo?.id ?? fallback.inReplyToId ?? fallback.in_reply_to_id ?? null,
    user: {
      login: c.author?.login || fallback.author || "",
      avatar_url: c.author?.avatarUrl || fallback.avatarUrl || ""
    },
    pull_request_review_id: c.pullRequestReview?.databaseId ?? null
  };
}
async function replyViaThreadGraphql(threadNodeId, body, fetchImpl, token, fallback = {}, ctx = null) {
  ctx = normalizeApiCtx(ctx);
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
    token,
    ctx
  );
  const c = data?.addPullRequestReviewThreadReply?.comment;
  if (!c) throw new Error("GraphQL thread reply returned no comment");
  return mapGraphqlReviewCommentToRest(c, fallback);
}
async function replyViaPendingReviewGraphql(pendingReviewNodeId, parentCommentNodeId, body, fetchImpl, token, fallback = {}, ctx = null) {
  ctx = normalizeApiCtx(ctx);
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
      inReplyTo: String(parentCommentNodeId)
    },
    fetchImpl,
    token
  );
  const c = data?.addPullRequestReviewComment?.comment;
  if (!c) throw new Error("GraphQL pending-review reply returned no comment");
  return mapGraphqlReviewCommentToRest(c, fallback);
}
async function resolveParentCommentNodeId(owner, repo, parentId, fetchImpl, token, knownNodeId, pullNumber = null, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  if (knownNodeId) return String(knownNodeId);
  const id = Math.floor(Number(parentId));
  if (!Number.isFinite(id) || id <= 0) return null;
  try {
    const parent = await apiJson(
      githubRestUrl(`/repos/${owner}/${repo}/pulls/comments/${id}`, ctx),
      fetchImpl,
      token
    );
    if (parent?.node_id) return String(parent.node_id);
  } catch {
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
  }
  return null;
}
async function replyToReviewComment(owner, repo, pullNumber, commentId, body, fetchImpl, token, opts = {}) {
  const ctx = normalizeApiCtx(opts?.ctx);
  const text = String(body || "").trim();
  if (!text) throw new Error("Reply body is required");
  const parentId = Number(commentId);
  if (!Number.isFinite(parentId) || parentId <= 0) {
    throw new Error("Invalid review comment id for reply");
  }
  const n = Number(pullNumber);
  const mode = opts?.mode === "pending" ? "pending" : "comment";
  const threadNodeId = opts?.threadNodeId || null;
  let parentNodeId = opts?.parentNodeId || null;
  const fallback = {
    body: text,
    inReplyToId: Math.floor(parentId),
    path: opts?.path || "",
    line: opts?.line ?? null,
    side: opts?.side || "RIGHT"
  };
  async function attachReplyToPending({ createIfMissing }) {
    const pending = await ensureViewerPendingReview(
      owner,
      repo,
      n,
      {
        commitId: opts?.commitId || null,
        createIfMissing: Boolean(createIfMissing)
      },
      fetchImpl,
      token
    );
    if (!pending?.node_id && !threadNodeId) return null;
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
          pendingReviewId: raw.pendingReviewId || pending?.id || null
        };
      } catch {
      }
    }
    if (!pending?.node_id) return null;
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
        "Cannot reply while a pending review exists (missing parent comment node id)."
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
      const msg = String(err?.message || err || "");
      if (!/Could not resolve to a node|global id|NOT_FOUND|Could not find/i.test(msg)) {
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
          node_id: created?.node_id || null
        };
      } catch (createErr) {
        if (createErr?.status === 422 || /one pending review/i.test(String(createErr?.message || ""))) {
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
  if (mode === "pending") {
    const attached = await attachReplyToPending({ createIfMissing: true });
    if (attached) return attached;
    throw new Error(
      "Could not start or find a pending review for this reply. Try Discard any leftover pending review, then retry."
    );
  }
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
    }
  }
  try {
    return await apiSend(
      githubRestUrl(`/repos/${owner}/${repo}/pulls/${n}/comments/${Math.floor(parentId)}/replies`, ctx),
      fetchImpl,
      token,
      { method: "POST", body: { body: text } }
    );
  } catch (err) {
    const msg = String(err?.message || err || "");
    if (err?.status === 422 || /one pending review/i.test(msg) || /Unprocessable Entity/i.test(msg)) {
      const attached = await attachReplyToPending({ createIfMissing: false });
      if (attached) return attached;
    }
    throw err;
  }
}
async function resolveReviewThread(threadNodeId, resolved, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  if (!threadNodeId) throw new Error("threadNodeId required to resolve review thread");
  const mutation = resolved ? `mutation($id:ID!){ resolveReviewThread(input:{threadId:$id}){ thread { id isResolved } } }` : `mutation($id:ID!){ unresolveReviewThread(input:{threadId:$id}){ thread { id isResolved } } }`;
  return apiGraphql(
    mutation,
    { id: threadNodeId },
    fetchImpl,
    token,
    ctx
  );
}
async function updatePullState(owner, repo, pullNumber, state, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const next = state === "closed" ? "closed" : "open";
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/pulls/${pullNumber}`, ctx),
    fetchImpl,
    token,
    { method: "PATCH", body: { state: next } }
  );
}
async function closePullRequest(owner, repo, pullNumber, fetchImpl, token) {
  return updatePullState(owner, repo, pullNumber, "closed", fetchImpl, token);
}
async function reopenPullRequest(owner, repo, pullNumber, fetchImpl, token) {
  return updatePullState(owner, repo, pullNumber, "open", fetchImpl, token);
}
async function deleteReviewComment(owner, repo, commentId, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/pulls/comments/${commentId}`, ctx),
    fetchImpl,
    token,
    { method: "DELETE" }
  );
}
async function deleteIssueComment(owner, repo, commentId, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/issues/comments/${commentId}`, ctx),
    fetchImpl,
    token,
    { method: "DELETE" }
  );
}
async function updatePullRequest(owner, repo, pullNumber, fields, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const body = {};
  if (fields?.title != null) body.title = String(fields.title);
  if (fields?.body != null) body.body = String(fields.body);
  if (fields?.base != null) body.base = String(fields.base);
  if (fields?.state != null) body.state = fields.state === "closed" ? "closed" : "open";
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/pulls/${pullNumber}`, ctx),
    fetchImpl,
    token,
    { method: "PATCH", body }
  );
}
async function editIssueComment(owner, repo, commentId, body, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/issues/comments/${commentId}`, ctx),
    fetchImpl,
    token,
    { method: "PATCH", body: { body: String(body || "") } }
  );
}
async function editReviewComment(owner, repo, commentId, body, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/pulls/comments/${commentId}`, ctx),
    fetchImpl,
    token,
    { method: "PATCH", body: { body: String(body || "") } }
  );
}
async function requestReviewers(owner, repo, pullNumber, { reviewers = [], teamReviewers = [] }, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/pulls/${pullNumber}/requested_reviewers`, ctx),
    fetchImpl,
    token,
    {
      method: "POST",
      body: { reviewers, team_reviewers: teamReviewers }
    }
  );
}
async function removeReviewers(owner, repo, pullNumber, { reviewers = [], teamReviewers = [] }, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/pulls/${pullNumber}/requested_reviewers`, ctx),
    fetchImpl,
    token,
    {
      method: "DELETE",
      body: { reviewers, team_reviewers: teamReviewers }
    }
  );
}
async function addAssignees(owner, repo, issueNumber, assignees, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/issues/${issueNumber}/assignees`, ctx),
    fetchImpl,
    token,
    { method: "POST", body: { assignees: assignees || [] } }
  );
}
async function removeAssignees(owner, repo, issueNumber, assignees, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/issues/${issueNumber}/assignees`, ctx),
    fetchImpl,
    token,
    { method: "DELETE", body: { assignees: assignees || [] } }
  );
}
async function setIssueLabels(owner, repo, issueNumber, labels, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/issues/${issueNumber}/labels`, ctx),
    fetchImpl,
    token,
    { method: "PUT", body: { labels: labels || [] } }
  );
}
async function fetchRepoLabels(owner, repo, fetchImpl, token = null, opts = {}) {
  const ctx = normalizeApiCtx(opts?.ctx);
  const perPage = 100;
  const maxPages = Math.max(1, Math.min(10, Number(opts.maxPages) || 5));
  const out = [];
  for (let page = 1; page <= maxPages; page++) {
    const url = githubRestUrl(
      `/repos/${owner}/${repo}/labels?per_page=${perPage}&page=${page}`,
      ctx
    );
    const batch = await apiJson(url, fetchImpl, token);
    if (!Array.isArray(batch) || !batch.length) break;
    for (const l of batch) {
      const name = String(l?.name || "").trim();
      if (!name) continue;
      out.push({
        name,
        color: String(l?.color || "").trim().replace(/^#/, ""),
        description: String(l?.description || "")
      });
    }
    if (batch.length < perPage) break;
  }
  return out;
}
function defaultNewLabelColor(name) {
  const palette = [
    "d73a4a",
    "0075ca",
    "a2eeef",
    "7057ff",
    "008672",
    "e4e669",
    "d876e3",
    "fbca04",
    "0e8a16",
    "5319e7"
  ];
  const s = String(name || "");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = h * 31 + s.charCodeAt(i) >>> 0;
  return palette[h % palette.length];
}
async function createRepoLabel(owner, repo, { name, color, description } = {}, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const rawName = String(name || "").trim();
  if (!rawName) throw new Error("Label name is required");
  const body = {
    name: rawName,
    color: String(color || defaultNewLabelColor(rawName)).trim().replace(/^#/, "")
  };
  if (description != null) body.description = String(description);
  const result = await apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/labels`, ctx),
    fetchImpl,
    token,
    { method: "POST", body }
  );
  return {
    name: String(result?.name || rawName),
    color: String(result?.color || body.color || "").trim().replace(/^#/, ""),
    description: String(result?.description || description || "")
  };
}
async function fetchRepoMilestones(owner, repo, fetchImpl, token = null, opts = {}) {
  const ctx = normalizeApiCtx(opts?.ctx);
  const perPage = 100;
  const maxPages = Math.max(1, Math.min(10, Number(opts.maxPages) || 5));
  const state = opts.state || "all";
  const out = [];
  for (let page = 1; page <= maxPages; page++) {
    const url = githubRestUrl(
      `/repos/${owner}/${repo}/milestones?state=${encodeURIComponent(state)}&per_page=${perPage}&page=${page}&sort=due_on&direction=desc`,
      ctx
    );
    const batch = await apiJson(url, fetchImpl, token);
    if (!Array.isArray(batch) || !batch.length) break;
    for (const m of batch) {
      const number = Number(m?.number);
      if (!Number.isFinite(number) || number <= 0) continue;
      out.push({
        number,
        title: String(m?.title || `Milestone ${number}`),
        state: String(m?.state || ""),
        description: String(m?.description || ""),
        dueOn: m?.due_on || null
      });
    }
    if (batch.length < perPage) break;
  }
  return out;
}
async function createRepoMilestone(owner, repo, { title, description, state } = {}, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const rawTitle = String(title || "").trim();
  if (!rawTitle) throw new Error("Milestone title is required");
  const body = { title: rawTitle, state: state === "closed" ? "closed" : "open" };
  if (description != null) body.description = String(description);
  const result = await apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/milestones`, ctx),
    fetchImpl,
    token,
    { method: "POST", body }
  );
  return {
    number: Number(result?.number) || 0,
    title: String(result?.title || rawTitle),
    state: String(result?.state || body.state),
    description: String(result?.description || description || ""),
    dueOn: result?.due_on || null
  };
}
async function fetchRepoTags(owner, repo, fetchImpl, token = null, opts = {}) {
  const ctx = normalizeApiCtx(opts?.ctx);
  const perPage = 100;
  const maxPages = Math.max(1, Math.min(20, Number(opts.maxPages) || 10));
  const out = [];
  for (let page = 1; page <= maxPages; page++) {
    const url = githubRestUrl(
      `/repos/${owner}/${repo}/tags?per_page=${perPage}&page=${page}`,
      ctx
    );
    const batch = await apiJson(url, fetchImpl, token);
    if (!Array.isArray(batch) || !batch.length) break;
    for (const t of batch) {
      const name = String(t?.name || "").trim();
      const sha = String(t?.commit?.sha || t?.sha || "").trim();
      if (!name) continue;
      out.push({
        name,
        sha,
        zipballUrl: t?.zipball_url || "",
        tarballUrl: t?.tarball_url || ""
      });
    }
    if (batch.length < perPage) break;
  }
  return out;
}
async function fetchTagsForCommits(owner, repo, shas, fetchImpl, token = null, opts = {}) {
  const want = new Set(
    (shas || []).map((s) => String(s || "").trim().toLowerCase()).filter(Boolean)
  );
  if (!want.size) return [];
  const tags = await fetchRepoTags(owner, repo, fetchImpl, token, opts);
  return tags.filter((t) => want.has(String(t.sha || "").toLowerCase()));
}
async function mergePullRequest(owner, repo, pullNumber, { mergeMethod = "merge", commitTitle, commitMessage } = {}, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const body = { merge_method: mergeMethod };
  if (commitTitle != null) body.commit_title = String(commitTitle);
  if (commitMessage != null) body.commit_message = String(commitMessage);
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/pulls/${pullNumber}/merge`, ctx),
    fetchImpl,
    token,
    { method: "PUT", body }
  );
}
async function updatePullBranch(owner, repo, pullNumber, { expectedHeadSha } = {}, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const body = {};
  if (expectedHeadSha) body.expected_head_sha = String(expectedHeadSha);
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/pulls/${pullNumber}/update-branch`, ctx),
    fetchImpl,
    token,
    { method: "PUT", body }
  );
}
async function resolvePullRequestNodeId(owner, repo, pullNumber, fetchImpl, token, nodeId = null, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  if (nodeId) return String(nodeId);
  const n = Number(pullNumber);
  if (!token || !owner || !repo || !Number.isFinite(n) || n <= 0) return null;
  try {
    const pr = await apiJson(
      githubRestUrl(`/repos/${owner}/${repo}/pulls/${n}`, ctx),
      fetchImpl,
      token
    );
    if (pr?.node_id) return String(pr.node_id);
  } catch {
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
      token,
      ctx
    );
    const id = data?.repository?.pullRequest?.id;
    return id ? String(id) : null;
  } catch {
    return null;
  }
}
function mapViewerSubscription(state) {
  const s = String(state || "").toUpperCase();
  if (s === "SUBSCRIBED") return { subscribed: true, ignored: false, viewerSubscription: s };
  if (s === "IGNORED") return { subscribed: false, ignored: true, viewerSubscription: s };
  if (s === "UNSUBSCRIBED") {
    return { subscribed: false, ignored: false, viewerSubscription: s };
  }
  return { subscribed: null, ignored: false, viewerSubscription: s || null };
}
async function setIssueSubscription(owner, repo, issueNumber, { subscribed = true, ignored = false, nodeId = null } = {}, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  if (!token) throw new Error("GitHub PAT required for notifications");
  const id = await resolvePullRequestNodeId(
    owner,
    repo,
    issueNumber,
    fetchImpl,
    token,
    nodeId,
    ctx
  );
  if (!id) {
    throw new Error(
      "Could not resolve pull request id for subscription. Refresh and try again."
    );
  }
  const state = ignored ? "IGNORED" : subscribed ? "SUBSCRIBED" : "UNSUBSCRIBED";
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
async function deleteIssueSubscription(owner, repo, issueNumber, fetchImpl, token, nodeId = null) {
  return setIssueSubscription(
    owner,
    repo,
    issueNumber,
    { subscribed: false, ignored: false, nodeId },
    fetchImpl,
    token
  );
}
async function fetchPullRequestSubscription(owner, repo, pullNumber, fetchImpl, token, nodeId = null, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  if (!token) return null;
  try {
    const id = await resolvePullRequestNodeId(
      owner,
      repo,
      pullNumber,
      fetchImpl,
      token,
      nodeId,
      ctx
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
      token,
      ctx
    );
    const vs = data?.node?.viewerSubscription;
    if (!vs) return null;
    return mapViewerSubscription(vs);
  } catch {
    return null;
  }
}
async function setIssueMilestone(owner, repo, issueNumber, milestoneNumber, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/issues/${issueNumber}`, ctx),
    fetchImpl,
    token,
    {
      method: "PATCH",
      body: { milestone: milestoneNumber == null ? null : Number(milestoneNumber) }
    }
  );
}
async function setPullRequestDraftStage(owner, repo, pullNumber, stage, fetchImpl, token, nodeId = null, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  let id = nodeId;
  if (!id) {
    const pr = await apiJson(
      githubRestUrl(`/repos/${owner}/${repo}/pulls/${pullNumber}`, ctx),
      fetchImpl,
      token
    );
    id = pr?.node_id;
  }
  if (!id) throw new Error("PR node_id unavailable for draft stage change");
  let buildFn = null;
  try {
    let mod = typeof globalThis !== "undefined" ? globalThis.PRModalPrEditApi : null;
    if (!mod && typeof require === "function") {
      try {
        mod = require("./modal/pure/pr-edit-api.js");
      } catch {
        mod = null;
      }
    }
    buildFn = mod?.buildDraftStageGraphql;
  } catch {
    buildFn = null;
  }
  const gql = buildFn ? buildFn(stage === "ready" ? "ready" : "draft", id) : stage === "ready" ? {
    query: `mutation($id:ID!){markPullRequestReadyForReview(input:{pullRequestId:$id}){pullRequest{id isDraft}}}`,
    variables: { id }
  } : {
    query: `mutation($id:ID!){convertPullRequestToDraft(input:{pullRequestId:$id}){pullRequest{id isDraft}}}`,
    variables: { id }
  };
  const data = await apiGraphql(gql.query, gql.variables, fetchImpl, token, ctx);
  let parseFn = null;
  try {
    let mod = typeof globalThis !== "undefined" ? globalThis.PRModalPrEditApi : null;
    if (!mod && typeof require === "function") {
      try {
        mod = require("./modal/pure/pr-edit-api.js");
      } catch {
        mod = null;
      }
    }
    parseFn = mod?.draftFromStageGraphqlData;
  } catch {
    parseFn = null;
  }
  let draft = null;
  if (typeof parseFn === "function") {
    draft = parseFn(data);
  } else if (data && typeof data === "object") {
    const pr = data.markPullRequestReadyForReview?.pullRequest || data.convertPullRequestToDraft?.pullRequest || null;
    if (pr && typeof pr.isDraft === "boolean") draft = pr.isDraft;
  }
  if (typeof draft !== "boolean") {
    draft = stage !== "ready";
  }
  return { draft: Boolean(draft), data };
}
async function uploadRepoFile(owner, repo, { path, contentBase64, message, branch }, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  if (!path || !contentBase64) throw new Error("path and contentBase64 required");
  const encPath = String(path).split("/").map(encodeURIComponent).join("/");
  let sha;
  try {
    const meta = await apiJson(
      githubRestUrl(
        `/repos/${owner}/${repo}/contents/${encPath}${branch ? `?ref=${encodeURIComponent(branch)}` : ""}`,
        ctx
      ),
      fetchImpl,
      token
    );
    sha = meta?.sha;
  } catch {
    sha = void 0;
  }
  const body = {
    message: message || `Upload ${path}`,
    content: String(contentBase64).replace(/\s+/g, "")
  };
  if (branch) body.branch = branch;
  if (sha) body.sha = sha;
  const result = await apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/contents/${encPath}`, ctx),
    fetchImpl,
    token,
    { method: "PUT", body }
  );
  const content = result?.content || result;
  return {
    downloadUrl: content?.download_url || content?.html_url || "",
    htmlUrl: content?.html_url || content?.download_url || "",
    path: content?.path || path,
    sha: content?.sha || ""
  };
}
async function getRepoFileText(owner, repo, { path, ref }, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  if (!path) throw new Error("path required");
  const rev = ref || "HEAD";
  const encPath = String(path).split("/").map(encodeURIComponent).join("/");
  const meta = await apiJson(
    githubRestUrl(`/repos/${owner}/${repo}/contents/${encPath}?ref=${encodeURIComponent(rev)}`, ctx),
    fetchImpl,
    token
  );
  if (meta?.type && meta.type !== "file") {
    throw new Error(`Not a file: ${path}`);
  }
  let raw = "";
  if (meta?.content && meta?.encoding === "base64") {
    raw = decodeBase64Utf8(String(meta.content).replace(/\n/g, ""));
  } else if (meta?.download_url) {
    const res = await fetchImpl(meta.download_url, {
      headers: buildApiHeaders(token)
    });
    if (!res.ok) {
      const err = new Error(`GitHub download ${res.status}: ${res.statusText}`);
      err.status = res.status;
      throw err;
    }
    raw = await res.text();
  } else if (meta?.content) {
    raw = decodeBase64Utf8(String(meta.content).replace(/\n/g, ""));
  }
  return {
    path: meta?.path || path,
    ref: rev,
    text: raw,
    sha: meta?.sha || "",
    size: Number(meta?.size) || raw.length
  };
}
async function applyReviewSuggestion(owner, repo, { path, headRef, startLine, endLine, suggestion, message }, fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  const ref = headRef || "HEAD";
  const file = await getRepoFileText(
    owner,
    repo,
    { path, ref },
    fetchImpl,
    token
  );
  const raw = file.text || "";
  let applyFn = null;
  try {
    let mod = typeof globalThis !== "undefined" ? globalThis.PRModalPrEditApi : null;
    if (!mod && typeof require === "function") {
      try {
        mod = require("./modal/pure/pr-edit-api.js");
      } catch {
        mod = null;
      }
    }
    applyFn = mod?.applySuggestionToFileContent;
  } catch {
    applyFn = null;
  }
  if (!applyFn) throw new Error("applySuggestionToFileContent unavailable");
  const next = applyFn(raw, {
    startLine,
    endLine,
    suggestion
  });
  let contentB64;
  if (typeof Buffer !== "undefined") {
    contentB64 = Buffer.from(next, "utf8").toString("base64");
  } else {
    contentB64 = btoa(unescape(encodeURIComponent(next)));
  }
  return apiSend(
    githubRestUrl(`/repos/${owner}/${repo}/contents/${path.split("/").map(encodeURIComponent).join("/")}`, ctx),
    fetchImpl,
    token,
    {
      method: "PUT",
      body: {
        message: message || `Apply suggestion to ${path}`,
        content: contentB64,
        branch: ref,
        sha: file.sha
      }
    }
  );
}
async function fetchViewerLogin(fetchImpl, token, ctx = null) {
  ctx = normalizeApiCtx(ctx);
  if (!token) return null;
  try {
    const me = await apiJson(githubRestUrl("/user", ctx), fetchImpl, token);
    return me?.login || null;
  } catch {
    return null;
  }
}
function mapAndAnnotateFiles(files, gitattributesText = "") {
  const mappedFiles = (Array.isArray(files) ? files : []).map((f) => ({
    filename: f.filename,
    status: f.status,
    additions: f.additions,
    deletions: f.deletions,
    changes: f.changes,
    patch: f.patch || "",
    // Preserve media URLs for image preview / binary classification
    raw_url: f.raw_url || f.rawUrl || "",
    blob_url: f.blob_url || f.blobUrl || "",
    contents_url: f.contents_url || f.contentsUrl || "",
    sha: f.sha || "",
    previous_filename: f.previous_filename || f.previousFilename || ""
  }));
  let filesOut;
  try {
    let collapse = typeof globalThis !== "undefined" ? globalThis.PRModalCollapse : null;
    if (!collapse && typeof require === "function") {
      try {
        collapse = require("./modal/pure/collapse.js");
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
    const LARGE = 5e3;
    filesOut = mappedFiles.map((f) => {
      const path = f.filename || "";
      const isImage = /\.(png|jpe?g|gif|webp|bmp|svg|ico|avif)$/i.test(path);
      const hasPatch = Boolean(f.patch);
      const kind = isImage ? "image" : hasPatch ? "text" : "binary";
      return {
        ...f,
        fileKind: kind,
        openableAsText: kind === "text",
        renderImage: kind === "image",
        defaultCollapsed: kind === "binary" || (f.changes || 0) >= LARGE || /package-lock\.json$|yarn\.lock$|\.min\.(js|css)$|\.bundle\.js$/i.test(
          path
        )
      };
    });
  }
  return filesOut;
}
async function fetchCompareFiles(owner, repo, base, head, fetchImpl, token = null, options = {}) {
  const ctx = normalizeApiCtx(options?.ctx);
  const o = String(owner || "").trim();
  const r = String(repo || "").trim();
  const b = String(base || "").trim();
  const h = String(head || "").trim();
  if (!o || !r || !b || !h) {
    throw new Error("owner, repo, base, and head are required for compare");
  }
  const gitattributesText = String(options.gitattributesText || "");
  const url = githubRestUrl(`/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}/compare/${encodeURIComponent(b)}...${encodeURIComponent(h)}`, ctx);
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
    truncated: Boolean(data?.files && data.files.length >= 300)
  };
}
const fetchApi = {
  normalizeApiCtx,
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
  fetchPrCommits,
  fetchAllPrCommits,
  fetchAllPrFiles,
  fetchPrFiles,
  fetchPrIssueComments,
  fetchPrReviews,
  fetchPrChecks,
  fetchPrDevelopment,
  fetchPrSidebarMeta,
  fetchIssueOrPrSummaries,
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
  fetchRepoLabels,
  createRepoLabel,
  fetchRepoMilestones,
  createRepoMilestone,
  fetchRepoTags,
  fetchTagsForCommits,
  defaultNewLabelColor,
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
  apiGraphql
};
if (typeof module !== "undefined" && module.exports) {
  module.exports = fetchApi;
}
if (typeof globalThis !== "undefined") {
  globalThis.PRTreeFetch = fetchApi;
}

