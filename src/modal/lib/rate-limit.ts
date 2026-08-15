/**
 * GitHub API rate-limit parse / gate helpers (pure, no DOM).
 * Resources: core (REST), graphql, search.
 */

export type RateResource = 'core' | 'graphql' | 'search';

export type RateLimitSnapshot = {
  resource: RateResource;
  limit: number | null;
  remaining: number | null;
  used: number | null;
  /** Unix epoch **seconds** (GitHub header form). */
  reset: number | null;
  /** Wall-clock ms when this snapshot was recorded. */
  updatedAt: number;
};

export type RateLimitDisabledUntil = {
  core: number;
  graphql: number;
  search: number;
};

export type RateLimitState = {
  disabledUntil: RateLimitDisabledUntil;
  snapshots: {
    core: RateLimitSnapshot | null;
    graphql: RateLimitSnapshot | null;
    search: RateLimitSnapshot | null;
  };
};

export const RATE_LIMIT_RESOURCES: readonly RateResource[] = [
  'core',
  'graphql',
  'search',
] as const;

export function emptyRateLimitState(): RateLimitState {
  return {
    disabledUntil: { core: 0, graphql: 0, search: 0 },
    snapshots: { core: null, graphql: null, search: null },
  };
}

export function normalizeRateLimitState(raw: unknown): RateLimitState {
  const base = emptyRateLimitState();
  if (!raw || typeof raw !== 'object') return base;
  const src = raw as any;
  const du = src.disabledUntil && typeof src.disabledUntil === 'object'
    ? src.disabledUntil
    : {};
  const snaps =
    src.snapshots && typeof src.snapshots === 'object' ? src.snapshots : {};
  return {
    disabledUntil: {
      core: toNonNegMs(du.core),
      graphql: toNonNegMs(du.graphql),
      search: toNonNegMs(du.search),
    },
    snapshots: {
      core: normalizeSnapshot(snaps.core, 'core'),
      graphql: normalizeSnapshot(snaps.graphql, 'graphql'),
      search: normalizeSnapshot(snaps.search, 'search'),
    },
  };
}

function toNonNegMs(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
}

function toNullableInt(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.floor(n);
}

function normalizeSnapshot(
  raw: unknown,
  fallbackResource: RateResource
): RateLimitSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as any;
  const resource = normalizeResource(s.resource) || fallbackResource;
  return {
    resource,
    limit: toNullableInt(s.limit),
    remaining: toNullableInt(s.remaining),
    used: toNullableInt(s.used),
    reset: toNullableInt(s.reset),
    updatedAt: toNonNegMs(s.updatedAt) || Date.now(),
  };
}

export function normalizeResource(raw: unknown): RateResource | null {
  const v = String(raw || '')
    .trim()
    .toLowerCase();
  if (v === 'core' || v === 'rest') return 'core';
  if (v === 'graphql' || v === 'graph_ql') return 'graphql';
  if (v === 'search') return 'search';
  return null;
}

/**
 * Classify a GitHub API URL into rate-limit resource.
 * - /search/* → search
 * - /graphql → graphql
 * - otherwise → core
 */
export function classifyGithubUrl(url: unknown): RateResource {
  const u = String(url || '');
  try {
    const path = u.includes('://')
      ? new URL(u).pathname
      : u.split('?')[0] || '';
    const p = path.toLowerCase();
    if (p.includes('/graphql') || p.endsWith('graphql')) return 'graphql';
    if (p.includes('/search/') || p.endsWith('/search') || p.includes('/search?')) {
      return 'search';
    }
  } catch {
    if (/graphql/i.test(u)) return 'graphql';
    if (/\/search(\/|\?|$)/i.test(u)) return 'search';
  }
  return 'core';
}

type HeaderSource =
  | { get?: (k: string) => string | null; forEach?: (cb: (v: string, k: string) => void) => void }
  | Record<string, string | null | undefined>
  | null
  | undefined;

/**
 * Normalize any Headers-like source into a lower-cased key map.
 * Prefer forEach (covers Headers) — some SW/polyfill shapes are flaky with .get alone.
 */
export function headersToLowerMap(headers: HeaderSource): Record<string, string> {
  const out: Record<string, string> = {};
  if (!headers) return out;
  if (typeof (headers as any).forEach === 'function') {
    try {
      (headers as any).forEach((value: string, key: string) => {
        if (key != null && value != null && value !== '') {
          out[String(key).toLowerCase()] = String(value);
        }
      });
      return out;
    } catch {
      /* fall through */
    }
  }
  if (typeof (headers as any).entries === 'function') {
    try {
      for (const [key, value] of (headers as any).entries()) {
        if (key != null && value != null && value !== '') {
          out[String(key).toLowerCase()] = String(value);
        }
      }
      return out;
    } catch {
      /* fall through */
    }
  }
  if (typeof (headers as any).get === 'function') {
    // Probe known rate-limit names when only .get works
    for (const name of [
      'x-ratelimit-limit',
      'x-ratelimit-remaining',
      'x-ratelimit-used',
      'x-ratelimit-reset',
      'x-ratelimit-resource',
      'retry-after',
    ]) {
      try {
        const v =
          (headers as any).get(name) ??
          (headers as any).get(name.toUpperCase());
        if (v != null && v !== '') out[name] = String(v);
      } catch {
        /* ignore */
      }
    }
    return out;
  }
  const o = headers as Record<string, string | null | undefined>;
  for (const k of Object.keys(o)) {
    const v = o[k];
    if (v != null && v !== '') out[k.toLowerCase()] = String(v);
  }
  return out;
}

function headerGet(headers: HeaderSource, name: string): string | null {
  if (!headers) return null;
  const lower = name.toLowerCase();
  // Prefer map path (forEach/entries) for reliability
  const map = headersToLowerMap(headers);
  if (Object.keys(map).length) {
    const v = map[lower];
    return v != null && v !== '' ? v : null;
  }
  if (typeof (headers as any).get === 'function') {
    try {
      // Use nullish coalescing — remaining "0" must not fall through
      const v =
        (headers as any).get(name) ??
        (headers as any).get(lower) ??
        (headers as any).get(name.toUpperCase());
      return v != null && v !== '' ? String(v) : null;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Parse GitHub rate-limit headers into a snapshot.
 * Prefers x-ratelimit-resource when present; else `fallbackResource`.
 */
export function parseRateLimitHeaders(
  headers: HeaderSource,
  opts: { fallbackResource?: RateResource; nowMs?: number } = {}
): RateLimitSnapshot | null {
  if (!headers) return null;
  const limit = toNullableInt(headerGet(headers, 'x-ratelimit-limit'));
  const remaining = toNullableInt(headerGet(headers, 'x-ratelimit-remaining'));
  const used = toNullableInt(headerGet(headers, 'x-ratelimit-used'));
  const reset = toNullableInt(headerGet(headers, 'x-ratelimit-reset'));
  // No useful rate-limit headers
  if (limit == null && remaining == null && reset == null && used == null) {
    return null;
  }
  const fromHeader = normalizeResource(
    headerGet(headers, 'x-ratelimit-resource')
  );
  const resource =
    fromHeader || opts.fallbackResource || ('core' as RateResource);
  const nowMs = Number.isFinite(opts.nowMs as number)
    ? Number(opts.nowMs)
    : Date.now();
  let usedVal = used;
  if (usedVal == null && limit != null && remaining != null) {
    usedVal = Math.max(0, limit - remaining);
  }
  return {
    resource,
    limit,
    remaining,
    used: usedVal,
    reset,
    updatedAt: nowMs,
  };
}

/**
 * Disable-until wall time (ms) from 429 response headers.
 * Prefers x-ratelimit-reset (unix s); falls back to retry-after (seconds).
 */
export function disableUntilMsFrom429(
  headers: HeaderSource,
  nowMs = Date.now()
): number {
  const resetSec = toNullableInt(headerGet(headers, 'x-ratelimit-reset'));
  if (resetSec != null && resetSec > 0) {
    return Math.max(nowMs, resetSec * 1000);
  }
  const retry = headerGet(headers, 'retry-after');
  if (retry) {
    const asNum = Number(retry);
    if (Number.isFinite(asNum) && asNum >= 0) {
      return nowMs + Math.floor(asNum) * 1000;
    }
    const asDate = Date.parse(retry);
    if (Number.isFinite(asDate)) return Math.max(nowMs, asDate);
  }
  // Fallback: 60s cool-down if no headers
  return nowMs + 60_000;
}

/**
 * Whether a request for `resource` should proceed.
 * - pluginEnabled false → deny all
 * - disabledUntil[resource] > now → deny
 * - remaining === 0 and reset in future → deny (soft preemptive)
 */
export function shouldAllowGithubRequest(opts: {
  pluginEnabled?: boolean;
  state?: RateLimitState | null;
  resource: RateResource;
  nowMs?: number;
}): { allow: boolean; reason: string; disabledUntilMs: number } {
  const now = Number.isFinite(opts.nowMs as number)
    ? Number(opts.nowMs)
    : Date.now();
  if (opts.pluginEnabled === false) {
    return { allow: false, reason: 'plugin-disabled', disabledUntilMs: 0 };
  }
  const state = normalizeRateLimitState(opts.state);
  const resource = opts.resource || 'core';
  const until = Number(state.disabledUntil[resource]) || 0;
  if (until > now) {
    return {
      allow: false,
      reason: 'rate-disabled',
      disabledUntilMs: until,
    };
  }
  const snap = state.snapshots[resource];
  if (
    snap &&
    snap.remaining === 0 &&
    snap.reset != null &&
    snap.reset * 1000 > now
  ) {
    return {
      allow: false,
      reason: 'remaining-zero',
      disabledUntilMs: snap.reset * 1000,
    };
  }
  return { allow: true, reason: 'ok', disabledUntilMs: 0 };
}

/** Merge a header snapshot into state (does not set disabledUntil). */
export function withRateLimitSnapshot(
  prev: RateLimitState | null | undefined,
  snapshot: RateLimitSnapshot | null
): RateLimitState {
  const state = normalizeRateLimitState(prev);
  if (!snapshot) return state;
  const resource = snapshot.resource;
  return {
    ...state,
    snapshots: {
      ...state.snapshots,
      [resource]: snapshot,
    },
  };
}

/**
 * Parse one resource block from GET /rate_limit (or GraphQL rateLimit).
 * reset is unix seconds.
 */
export function snapshotFromResourceBlock(
  resource: RateResource,
  block: unknown,
  nowMs = Date.now()
): RateLimitSnapshot | null {
  if (!block || typeof block !== 'object') return null;
  const b = block as any;
  const limit = toNullableInt(b.limit);
  const remaining = toNullableInt(b.remaining);
  const used = toNullableInt(b.used);
  const reset = toNullableInt(b.reset);
  if (limit == null && remaining == null && reset == null && used == null) {
    return null;
  }
  let usedVal = used;
  if (usedVal == null && limit != null && remaining != null) {
    usedVal = Math.max(0, limit - remaining);
  }
  return {
    resource,
    limit,
    remaining,
    used: usedVal,
    reset,
    updatedAt: nowMs,
  };
}

/**
 * Apply GitHub GET /rate_limit JSON body into state (all resources).
 * https://docs.github.com/en/rest/rate-limit/rate-limit
 */
export function withRateLimitEndpointPayload(
  prev: RateLimitState | null | undefined,
  json: unknown,
  nowMs = Date.now()
): RateLimitState {
  let state = normalizeRateLimitState(prev);
  if (!json || typeof json !== 'object') return state;
  const root = json as any;
  const resources =
    root.resources && typeof root.resources === 'object'
      ? root.resources
      : root;
  for (const r of RATE_LIMIT_RESOURCES) {
    const block = resources?.[r] ?? (r === 'core' ? root.rate : null);
    const snap = snapshotFromResourceBlock(r, block, nowMs);
    if (snap) state = withRateLimitSnapshot(state, snap);
  }
  return state;
}

/** True when at least one resource has a usable snapshot. */
export function hasAnyRateLimitSnapshot(
  state: RateLimitState | null | undefined
): boolean {
  const s = normalizeRateLimitState(state);
  return RATE_LIMIT_RESOURCES.some((r) => {
    const snap = s.snapshots[r];
    return (
      snap != null &&
      (snap.limit != null || snap.remaining != null || snap.reset != null)
    );
  });
}

/** Apply 429: snapshot + disable resource until reset. */
export function withRateLimit429(
  prev: RateLimitState | null | undefined,
  resource: RateResource,
  headers: HeaderSource,
  nowMs = Date.now()
): RateLimitState {
  const snap =
    parseRateLimitHeaders(headers, {
      fallbackResource: resource,
      nowMs,
    }) || null;
  let state = withRateLimitSnapshot(prev, snap);
  const until = disableUntilMsFrom429(headers, nowMs);
  state = {
    ...state,
    disabledUntil: {
      ...state.disabledUntil,
      [resource]: Math.max(state.disabledUntil[resource] || 0, until),
    },
  };
  return state;
}

/**
 * Clear expired disabledUntil clocks. Optional: force-clear one resource.
 */
export function clearExpiredRateDisables(
  prev: RateLimitState | null | undefined,
  nowMs = Date.now(),
  opts: { forceResource?: RateResource | null; clearAll?: boolean } = {}
): RateLimitState {
  const state = normalizeRateLimitState(prev);
  if (opts.clearAll) {
    return {
      ...state,
      disabledUntil: { core: 0, graphql: 0, search: 0 },
    };
  }
  if (opts.forceResource) {
    return {
      ...state,
      disabledUntil: {
        ...state.disabledUntil,
        [opts.forceResource]: 0,
      },
    };
  }
  const next = { ...state.disabledUntil };
  for (const r of RATE_LIMIT_RESOURCES) {
    if (next[r] > 0 && next[r] <= nowMs) next[r] = 0;
  }
  return { ...state, disabledUntil: next };
}

/** 0–100 for bar UI from remaining/limit. */
export function rateLimitBarPercent(
  snapshot: RateLimitSnapshot | null | undefined
): number {
  if (!snapshot) return 0;
  const limit = Number(snapshot.limit);
  if (!Number.isFinite(limit) || limit <= 0) return 0;
  const remaining = Number(snapshot.remaining);
  if (!Number.isFinite(remaining)) {
    const used = Number(snapshot.used);
    if (Number.isFinite(used)) {
      return Math.max(0, Math.min(100, Math.round(((limit - used) / limit) * 100)));
    }
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round((remaining / limit) * 100)));
}

export function formatRateLimitReset(
  snapshot: RateLimitSnapshot | null | undefined,
  nowMs = Date.now()
): string {
  if (!snapshot?.reset) return '—';
  const ms = snapshot.reset * 1000;
  if (ms <= nowMs) return 'now';
  try {
    return new Date(ms).toLocaleTimeString();
  } catch {
    return String(snapshot.reset);
  }
}

/**
 * GraphQL body may include rateLimit { limit remaining used resetAt }.
 * resetAt is ISO; convert to unix seconds.
 */
export function snapshotFromGraphqlRateLimit(
  rateLimit: unknown,
  nowMs = Date.now()
): RateLimitSnapshot | null {
  if (!rateLimit || typeof rateLimit !== 'object') return null;
  const r = rateLimit as any;
  const limit = toNullableInt(r.limit);
  const remaining = toNullableInt(r.remaining);
  const used = toNullableInt(r.used);
  let reset: number | null = null;
  if (r.resetAt) {
    const t = Date.parse(String(r.resetAt));
    if (Number.isFinite(t)) reset = Math.floor(t / 1000);
  } else if (r.reset != null) {
    reset = toNullableInt(r.reset);
  }
  if (limit == null && remaining == null && reset == null) return null;
  let usedVal = used;
  if (usedVal == null && limit != null && remaining != null) {
    usedVal = Math.max(0, limit - remaining);
  }
  return {
    resource: 'graphql',
    limit,
    remaining,
    used: usedVal,
    reset,
    updatedAt: nowMs,
  };
}
