/**
 * Fetch feature unit: http
 */
export function normalizeApiCtx(ctx: any) {
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
      (globalThis as any).PRGithubEndpoints &&
      typeof (globalThis as any).PRGithubEndpoints.resolveGithubEndpoints === 'function'
    ) {
      return (globalThis as any).PRGithubEndpoints.resolveGithubEndpoints({ webHost });
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

export function githubRestUrl(path: any, ctx: any) {
  const c = normalizeApiCtx(ctx);
  try {
    if (
      (globalThis as any).PRGithubEndpoints &&
      typeof (globalThis as any).PRGithubEndpoints.githubRestUrl === 'function'
    ) {
      return (globalThis as any).PRGithubEndpoints.githubRestUrl(path, c);
    }
  } catch (_) {}
  const p = String(path || '');
  if (/^https?:\/\//i.test(p)) return p;
  const base = String(c.restBase || 'https://api.github.com').replace(/\/+$/, '');
  return base + (p.startsWith('/') ? p : '/' + p);
}
export function githubGraphqlUrl(ctx: any) {
  const c = normalizeApiCtx(ctx);
  try {
    if (
      (globalThis as any).PRGithubEndpoints &&
      typeof (globalThis as any).PRGithubEndpoints.githubGraphqlUrl === 'function'
    ) {
      return (globalThis as any).PRGithubEndpoints.githubGraphqlUrl(c);
    }
  } catch (_) {}
  return String(c.graphqlUrl || 'https://api.github.com/graphql');
}


/**
 * Map REST pull list/item payload → app list row.
 * Includes labels / assignees / milestone so progressive modal sketch can paint
 * sidebar meta without waiting for full fetchPrDetail.
 */
export function buildApiHeaders(token: any) {
  const headers: any = { Accept: 'application/vnd.github+json' };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

/** Page PR numbers missing from the list-API result set. */
export async function mapWithConcurrency(items: any, limit: any, worker: any) {
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

export function escapeRegExp(s: any) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Build external magic-link URL from autolink rule + captured num.
 * Supports both `<num>` (GitHub) and `{num}` placeholders.
 */
export function decodeBase64Utf8(b64: any) {
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

export async function apiJson(
  url: any,
  fetchImpl: any,
  token: any,
  opts: { headers?: Record<string, string>; cache?: RequestCache } = {}
) {
  const headers = {
    ...buildApiHeaders(token),
    ...(opts.headers && typeof opts.headers === 'object' ? opts.headers : {}),
  };
  const init: RequestInit = { headers };
  // Prefer no-store for identity meta (milestone/title) so hard reopen after a
  // modal write cannot paint a browser-cached pre-write pull/issue body.
  if (opts.cache) init.cache = opts.cache;
  const res = await fetchImpl(url, init);
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
export async function apiJsonWithLink(url: any, fetchImpl: any, token: any) {
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
export function parseLinkNextUrl(linkHeader: any) {
  if (!linkHeader) return null;
  const parts = String(linkHeader).split(',');
  for (const p of parts) {
    const m = p.match(/<([^>]+)>\s*;\s*rel="?next"?/i);
    if (m) return m[1].trim();
  }
  return null;
}

/** Page number from Link header rel (next|last|prev|first), or null. */
export function parseLinkRelPage(linkHeader: any, rel: string) {
  const raw = String(linkHeader || '');
  if (!raw || !rel) return null;
  const re = new RegExp(`rel="?${rel}"?`, 'i');
  const parts = raw.split(',');
  for (const part of parts) {
    if (!re.test(part)) continue;
    const m = part.match(/[?&]page=(\d+)/i);
    if (m) {
      const n = Number(m[1]);
      return Number.isFinite(n) && n > 0 ? n : null;
    }
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
export async function fetchRestCollectionAll(firstUrl: any, fetchImpl: any, token: any, opts: any = {}) {
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

export async function apiSend(url: any, fetchImpl: any, token: any, opts: any = {}) {
  const method = opts?.method || 'GET';
  const body = opts?.body;
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
          .map((e: any) => {
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
 * Pull request sidebar meta for conversation rail:
 * - ProjectV2 items (Projects section)
 * - Closing-linked issues (Development section)
 * Soft fields only — failures return empty arrays.
 *
 * @returns {Promise<{ projects: Array, developmentIssues: Array }>}
 */
export const GQL_COST_LOG_MAX = 400;
/** @type {Array<object>} */
export const gqlCostLogEntries: any[] = [];
export let gqlCostHeaderUsedPrev: number | null = null;

export function graphqlCostPure() {
  try {
    return typeof globalThis !== 'undefined'
      ? (globalThis as any).PRModalGraphqlCostLog || null
      : null;
  } catch {
    return null;
  }
}

export function injectRateLimitCostFieldLocal(query: any): string {
  const pure = graphqlCostPure();
  if (typeof pure?.injectRateLimitCostField === 'function') {
    return pure.injectRateLimitCostField(query);
  }
  const q = String(query || '');
  if (!q.trim() || /rateLimit\s*\{/.test(q)) return q;
  // Query-only field — mutations (resolveReviewThread, …) reject rateLimit
  if (/\bmutation\b/i.test(q)) return q;
  const trimmed = q.replace(/\s+$/, '');
  const lastBrace = trimmed.lastIndexOf('}');
  if (lastBrace < 0) return q;
  return (
    trimmed.slice(0, lastBrace) +
    '\n  rateLimit { cost remaining used limit resetAt }\n' +
    trimmed.slice(lastBrace)
  );
}

export function labelGraphqlOperationLocal(query: any, variables: any = null): string {
  const pure = graphqlCostPure();
  if (typeof pure?.labelGraphqlOperation === 'function') {
    return pure.labelGraphqlOperation(query, variables);
  }
  const q = String(query || '');
  const named = q.match(/\b(query|mutation)\s+([A-Za-z_][A-Za-z0-9_]*)/);
  if (named?.[2]) return named[2];
  if (/reviewThreads/.test(q)) return 'reviewThreads';
  return /\bmutation\b/.test(q) ? 'mutation' : 'query';
}

export function sanitizeGraphqlVariablesLocal(variables: any) {
  const pure = graphqlCostPure();
  if (typeof pure?.sanitizeGraphqlVariables === 'function') {
    return pure.sanitizeGraphqlVariables(variables);
  }
  return {};
}

export function summarizeGraphqlCostLogLocal(entries: any = gqlCostLogEntries) {
  const pure = graphqlCostPure();
  if (typeof pure?.summarizeGraphqlCostEntries === 'function') {
    return pure.summarizeGraphqlCostEntries(entries);
  }
  // Inline when pure IIFE not loaded in SW
  const list = Array.isArray(entries) ? entries : [];
  const map = new Map();
  let totalCost = 0;
  let unknownCostCalls = 0;
  for (const e of list) {
    const op = String(e?.op || 'unknown');
    const cost =
      e?.cost != null && Number.isFinite(Number(e.cost)) ? Number(e.cost) : null;
    const ms =
      e?.ms != null && Number.isFinite(Number(e.ms)) ? Number(e.ms) : 0;
    if (!map.has(op)) {
      map.set(op, {
        op,
        calls: 0,
        cost: 0,
        maxCost: 0,
        msSum: 0,
        knownCostCalls: 0,
      });
    }
    const row = map.get(op);
    row.calls += 1;
    row.msSum += ms;
    if (cost != null) {
      row.cost += cost;
      row.knownCostCalls += 1;
      row.maxCost = Math.max(row.maxCost, cost);
      totalCost += cost;
    } else {
      unknownCostCalls += 1;
    }
  }
  const byOp = [...map.values()]
    .map((r: any) => ({
      op: r.op,
      calls: r.calls,
      cost: r.cost,
      avgCost:
        r.knownCostCalls > 0
          ? Math.round((r.cost / r.knownCostCalls) * 100) / 100
          : 0,
      maxCost: r.maxCost,
      avgMs: r.calls > 0 ? Math.round(r.msSum / r.calls) : 0,
    }))
    .sort((a, b) => b.cost - a.cost || b.calls - a.calls);
  return {
    totalCalls: list.length,
    totalCost,
    unknownCostCalls,
    byOp,
  };
}

export function headerInt(headers: any, name: string): number | null {
  if (!headers || typeof headers.get !== 'function') return null;
  try {
    const v =
      headers.get(name) ??
      headers.get(name.toLowerCase()) ??
      headers.get(name.toUpperCase());
    if (v == null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export function recordGraphqlCostEntry(entry: any) {
  const row = {
    t: Date.now(),
    op: String(entry?.op || 'unknown'),
    cost: entry?.cost != null && Number.isFinite(Number(entry.cost))
      ? Number(entry.cost)
      : null,
    costSource: entry?.costSource || null,
    remaining:
      entry?.remaining != null && Number.isFinite(Number(entry.remaining))
        ? Number(entry.remaining)
        : null,
    used:
      entry?.used != null && Number.isFinite(Number(entry.used))
        ? Number(entry.used)
        : null,
    ms:
      entry?.ms != null && Number.isFinite(Number(entry.ms))
        ? Math.round(Number(entry.ms))
        : null,
    ok: entry?.ok !== false,
    err: entry?.err ? String(entry.err).slice(0, 160) : null,
    vars: entry?.vars && typeof entry.vars === 'object' ? entry.vars : {},
  };
  gqlCostLogEntries.push(row);
  while (gqlCostLogEntries.length > GQL_COST_LOG_MAX) gqlCostLogEntries.shift();
  const costStr = row.cost != null ? String(row.cost) : '?';
  const remStr = row.remaining != null ? String(row.remaining) : '?';
  console.log(
    `[pr-plus] gql cost=${costStr} remaining=${remStr} op=${row.op}` +
      (row.ms != null ? ` ${row.ms}ms` : '') +
      (row.costSource ? ` via=${row.costSource}` : '') +
      (row.ok ? '' : ` FAIL ${row.err || ''}`) +
      (row.vars && Object.keys(row.vars).length
        ? ` vars=${JSON.stringify(row.vars)}`
        : '')
  );
  return row;
}

export function getGraphqlCostLog() {
  return gqlCostLogEntries.slice();
}

export function clearGraphqlCostLog() {
  gqlCostLogEntries.length = 0;
  gqlCostHeaderUsedPrev = null;
}

export function summarizeGraphqlCostLog() {
  return summarizeGraphqlCostLogLocal(gqlCostLogEntries);
}

/**
 * GraphQL client: HTTP 200 can still carry body.errors — treat those as failures.
 * Injects rateLimit { cost } for per-query primary points; records to cost log.
 * @returns {Promise<object>} data field only (includes rateLimit when present)
 */
export async function apiGraphql(query: any, variables: any, fetchImpl: any, token: any, ctx: any = null) {
  ctx = normalizeApiCtx(ctx);
  const op = labelGraphqlOperationLocal(query, variables);
  const vars = sanitizeGraphqlVariablesLocal(variables);
  const q = injectRateLimitCostFieldLocal(query);
  const t0 =
    typeof performance !== 'undefined' && performance.now
      ? performance.now()
      : Date.now();
  const url = githubGraphqlUrl(ctx);
  const headers = buildApiHeaders(token);
  headers['Content-Type'] = 'application/json';
  let res: any;
  let json: any = null;
  try {
    res = await fetchImpl(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query: q, variables: variables || {} }),
    });
  } catch (err: any) {
    const ms =
      (typeof performance !== 'undefined' && performance.now
        ? performance.now()
        : Date.now()) - t0;
    recordGraphqlCostEntry({
      op,
      cost: null,
      ms,
      ok: false,
      err: err?.message || err,
      vars,
    });
    throw err;
  }
  const hdrRemaining = headerInt(res?.headers, 'x-ratelimit-remaining');
  const hdrUsed = headerInt(res?.headers, 'x-ratelimit-used');
  const hdrLimit = headerInt(res?.headers, 'x-ratelimit-limit');
  try {
    json = await res.json();
  } catch (err: any) {
    const ms =
      (typeof performance !== 'undefined' && performance.now
        ? performance.now()
        : Date.now()) - t0;
    recordGraphqlCostEntry({
      op,
      cost: null,
      remaining: hdrRemaining,
      used: hdrUsed,
      ms,
      ok: false,
      err: err?.message || 'invalid json',
      vars,
    });
    throw err;
  }
  const ms =
    (typeof performance !== 'undefined' && performance.now
      ? performance.now()
      : Date.now()) - t0;
  const bodyRl = json?.data?.rateLimit || null;
  let cost: number | null =
    bodyRl?.cost != null && Number.isFinite(Number(bodyRl.cost))
      ? Number(bodyRl.cost)
      : null;
  let costSource: string | null = cost != null ? 'body.rateLimit.cost' : null;
  // Fallback: header used delta (imprecise under concurrency)
  if (cost == null && hdrUsed != null && gqlCostHeaderUsedPrev != null) {
    const delta = hdrUsed - gqlCostHeaderUsedPrev;
    if (delta >= 0 && delta < 5000) {
      cost = delta;
      costSource = 'header.used-delta';
    }
  }
  if (hdrUsed != null) gqlCostHeaderUsedPrev = hdrUsed;
  const remaining =
    bodyRl?.remaining != null && Number.isFinite(Number(bodyRl.remaining))
      ? Number(bodyRl.remaining)
      : hdrRemaining;
  const used =
    bodyRl?.used != null && Number.isFinite(Number(bodyRl.used))
      ? Number(bodyRl.used)
      : hdrUsed;

  if (!res.ok) {
    recordGraphqlCostEntry({
      op,
      cost,
      costSource,
      remaining,
      used,
      ms,
      ok: false,
      err: `HTTP ${res.status}`,
      vars,
    });
    const err: any = new Error(
      `GitHub GraphQL HTTP ${res.status}: ${res.statusText || ''}`
    );
    err.status = res.status;
    throw err;
  }
  if (json?.errors?.length) {
    const msg = json.errors
      .map((e: any) => e?.message || String(e))
      .filter(Boolean)
      .join('; ');
    recordGraphqlCostEntry({
      op,
      cost,
      costSource,
      remaining,
      used,
      ms,
      ok: false,
      err: msg || 'graphql errors',
      vars,
    });
    const err: any = new Error(`GitHub GraphQL: ${msg || 'unknown error'}`);
    err.graphqlErrors = json.errors;
    err.status = 200;
    throw err;
  }
  recordGraphqlCostEntry({
    op,
    cost,
    costSource,
    remaining,
    used,
    limit: bodyRl?.limit != null ? Number(bodyRl.limit) : hdrLimit,
    ms,
    ok: true,
    vars,
  });
  return json?.data ?? null;
}

/**
 * Thread shell + root preview (`comments(first:1)`).
 * Root body is the thread "description" (GitHub has no separate field).
 * Measured cost stays 1 for last:100 + first:1; avoid comments(first:100) and
 * nested reactionGroups on the window (those dominate cost).
 */
export function fetchNowMs() {
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
export async function timedFetch(timings: any, name: any, promise: any, extra: any = undefined, opts: any = {}) {
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
export function logParallelRestSummary(timings: any, names: any, wallMs: any) {
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

/**
 * Sleep helper for mergeability re-fetch (GitHub starts compute on first GET).
 * @param {number} ms
 */
export function sleepMs(ms: any) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms || 0)));
}

/**
 * Dual-modified paths since merge-base (base tip ∩ head) ≈ conflict file list.
 * Uses current base-branch tip (not stale pr.base.sha) so behind PRs work.
 * Soft-fails to [] on any error.
 *
 * @returns {Promise<string[]>}
 */
