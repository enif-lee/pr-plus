/** Detail sides: commits/files/checks/dev */
import {
  apiGraphql,
  apiJson,
  apiJsonWithLink,
  decodeBase64Utf8,
  fetchRestCollectionAll,
  githubRestUrl,
  normalizeApiCtx,
  parseLinkNextUrl,
  parseLinkRelPage,
  sleepMs,
  timedFetch,
} from './http';
import {
  commentsPageHelpers,
  mapAndAnnotateFiles,
  mapIssueComment,
  mapPrCommitRow,
  mapReviewComment,
} from './mappers';
import {
  fetchIssueOrPrSummaries,
  fetchPrSidebarMeta,
} from './detail-sides-comments';

export async function fetchPrCommits(owner: any, repo: any, number: any, fetchImpl: any, token: any = null, ctx: any = null) {
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
export async function fetchAllPrCommits(owner: any, repo: any, number: any, fetchImpl: any, token: any = null, ctx: any = null) {
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
export async function fetchPrChecks(owner: any, repo: any, headSha: any, fetchImpl: any, token: any = null, ctx: any = null) {
  ctx = normalizeApiCtx(ctx);
  const o = String(owner || '').trim();
  const r = String(repo || '').trim();
  const sha = String(headSha || '').trim();
  const empty = { state: 'unknown', totalCount: 0, statuses: [] as any[], checkRuns: [] as any[] };
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
      statuses: statusList.map((s: any) => ({
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
      checks.checkRuns = list.map((r: any) => ({
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
      (globalThis as any).PRModalChecks?.normalizeChecks) ||
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
export async function fetchPrDevelopment(
  owner: any,
  repo: any,
  number: any,
  fetchImpl: any,
  token: any = null,
  opts: any = {}
) {
  const ctx = normalizeApiCtx(opts?.ctx);
  const o = String(owner || '').trim();
  const r = String(repo || '').trim();
  const n = Number(number);
  const body = String(opts.body || '');
  let linkedIssues = [];
  try {
    let editApi =
      typeof globalThis !== 'undefined' ? (globalThis as any).PRModalPrEditApi : null;
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

  let developmentIssues: any[] = [];
  let projects: any[] = [];
  try {
    const side = await fetchPrSidebarMeta(o, r, n, fetchImpl, token, ctx);
    if (side && typeof side === 'object') {
      if (Array.isArray(side.developmentIssues) && side.developmentIssues.length) {
        developmentIssues = side.developmentIssues.map((item: any) => ({
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

  return { linkedIssues, developmentIssues, projects };
}

/**
 * All PR files (paginated) with collapse/annotation applied.
 */
export async function fetchAllPrFiles(
  owner: any,
  repo: any,
  number: any,
  fetchImpl: any,
  token: any = null,
  options: any = {}
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
export async function fetchPrFiles(
  owner: any,
  repo: any,
  number: any,
  fetchImpl: any,
  token: any = null,
  options: any = {}
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
