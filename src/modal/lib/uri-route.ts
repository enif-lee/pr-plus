/**
 * Pure deep-link helpers for PR modal page/number/position.
 * Query keys: prp_page, prp_number, prp_position (also accepted from hash).
 * Legacy pr+page / pr+number / pr+position (and spaced "pr page" form) still
 * parse and are stripped on write/clear so old links keep working once.
 * No chrome.* / auth dependencies — works in fixtures and content scripts.
 */

export const URI_PARAM_PAGE = 'prp_page';
export const URI_PARAM_NUMBER = 'prp_number';
export const URI_PARAM_POSITION = 'prp_position';

/** Older keys written before the prp_ rename (URLSearchParams turns + into space). */
export const URI_PARAM_PAGE_LEGACY = ['pr+page', 'pr page'] as const;
export const URI_PARAM_NUMBER_LEGACY = ['pr+number', 'pr number'] as const;
export const URI_PARAM_POSITION_LEGACY = ['pr+position', 'pr position'] as const;

export type RoutePage = 'conversation' | 'diff';

export type ModalRoute = {
  page?: RoutePage | null;
  number?: number | null;
  position?: string | null;
};

const PAGE_ALIASES: Record<string, RoutePage> = {
  conversation: 'conversation',
  centered: 'conversation',
  conv: 'conversation',
  description: 'conversation',
  diff: 'diff',
  files: 'diff',
  review: 'diff',
};

/**
 * Normalize page token to conversation | diff.
 */
export function normalizePage(value: unknown): RoutePage | null {
  if (value == null || value === '') return null;
  const key = String(value).trim().toLowerCase();
  return PAGE_ALIASES[key] || null;
}

/**
 * Build a stable position token for a focused review comment/thread.
 * Skips optimistic temp ids (tmp-, optimistic, non-numeric garbage).
 * Format: c:{id}  (comment / thread root id)
 */
export function buildPositionFromComment(comment: any): string | null {
  if (!comment || typeof comment !== 'object') return null;
  const id = comment.commentId ?? comment.id ?? null;
  if (id == null || id === '') return null;
  const s = String(id);
  if (/^tmp[-_]/i.test(s) || /optimistic/i.test(s)) return null;
  // Prefer real API ids (numeric) or GraphQL node-looking ids
  if (!/^\d+$/.test(s) && !/^[A-Za-z0-9_.=+-]{4,}$/.test(s)) return null;
  return `c:${s}`;
}

/**
 * @returns {{ kind: 'comment', id: string } | null}
 */
export function parsePosition(position: unknown): { kind: 'comment'; id: string } | null {
  if (position == null || position === '') return null;
  let raw = String(position).trim();
  // Allow accidental leading #
  if (raw.startsWith('#')) raw = raw.slice(1);
  if (raw.startsWith('c:') || raw.startsWith('C:')) {
    const id = raw.slice(2).trim();
    if (!id || /^tmp[-_]/i.test(id)) return null;
    return { kind: 'comment', id };
  }
  // Bare id
  if (/^\d+$/.test(raw) || /^[A-Za-z0-9_.=+-]{4,}$/.test(raw)) {
    if (/^tmp[-_]/i.test(raw)) return null;
    return { kind: 'comment', id: raw };
  }
  return null;
}

function readParamsFromSearch(search: string): URLSearchParams {
  const s = String(search || '');
  if (!s || s === '?') return new URLSearchParams();
  return new URLSearchParams(s.startsWith('?') ? s.slice(1) : s);
}

/**
 * Hash may be `#prp_page=diff&prp_number=1` or `#foo&prp_number=1` or legacy `#c:12`.
 */
function readParamsFromHash(hash: string): URLSearchParams {
  let h = String(hash || '');
  if (h.startsWith('#')) h = h.slice(1);
  if (!h) return new URLSearchParams();
  // If hash looks like a bare position (no =), treat as position only
  if (!h.includes('=') && !h.includes('&')) {
    const p = new URLSearchParams();
    if (h) p.set(URI_PARAM_POSITION, h);
    return p;
  }
  return new URLSearchParams(h);
}

/**
 * All key forms for a logical param: current prp_* plus legacy pr+* / "pr *".
 */
function keyVariants(
  key: string,
  legacy: readonly string[] = []
): string[] {
  const out = [key, ...legacy];
  // Also expand any remaining + → space for safety
  const expanded: string[] = [];
  for (const k of out) {
    expanded.push(k);
    const spaced = k.replace(/\+/g, ' ');
    if (spaced !== k) expanded.push(spaced);
  }
  return [...new Set(expanded)];
}

function paramGet(
  params: URLSearchParams,
  key: string,
  legacy: readonly string[] = []
): string | null {
  for (const k of keyVariants(key, legacy)) {
    if (params.has(k)) return params.get(k);
  }
  return null;
}

/** Delete current + legacy key forms (and any multi-value leftovers). */
function paramDeleteAll(
  params: URLSearchParams,
  key: string,
  legacy: readonly string[] = []
): void {
  for (const k of keyVariants(key, legacy)) {
    while (params.has(k)) params.delete(k);
  }
}

function stripAllRouteKeys(params: URLSearchParams): void {
  paramDeleteAll(params, URI_PARAM_PAGE, URI_PARAM_PAGE_LEGACY);
  paramDeleteAll(params, URI_PARAM_NUMBER, URI_PARAM_NUMBER_LEGACY);
  paramDeleteAll(params, URI_PARAM_POSITION, URI_PARAM_POSITION_LEGACY);
}

function routeFromParams(params: URLSearchParams): ModalRoute {
  const page = normalizePage(
    paramGet(params, URI_PARAM_PAGE, URI_PARAM_PAGE_LEGACY)
  );
  const numRaw = paramGet(params, URI_PARAM_NUMBER, URI_PARAM_NUMBER_LEGACY);
  let number: number | null = null;
  if (numRaw != null && numRaw !== '') {
    const n = Number(numRaw);
    if (Number.isFinite(n) && n > 0) number = Math.floor(n);
  }
  const positionRaw = paramGet(
    params,
    URI_PARAM_POSITION,
    URI_PARAM_POSITION_LEGACY
  );
  const position =
    positionRaw != null && String(positionRaw).trim()
      ? String(positionRaw).trim()
      : null;
  return { page, number, position };
}

/**
 * Merge two routes: fields present (non-null) on primary win; fill gaps from secondary.
 */
export function mergeRoutes(primary: ModalRoute | null | undefined, secondary: ModalRoute | null | undefined): ModalRoute {
  const a = primary || {};
  const b = secondary || {};
  return {
    page: a.page != null ? a.page : b.page ?? null,
    number: a.number != null ? a.number : b.number ?? null,
    position: a.position != null && a.position !== '' ? a.position : b.position ?? null,
  };
}

export function parseRouteFromSearch(search: string): ModalRoute {
  return routeFromParams(readParamsFromSearch(search));
}

export function parseRouteFromHash(hash: string): ModalRoute {
  return routeFromParams(readParamsFromHash(hash));
}

/**
 * Primary: query string; hash fills missing fields (or full route if query empty).
 */
export function parseLocationRoute(location: { search?: string; hash?: string } | null | undefined): ModalRoute {
  if (!location) return { page: null, number: null, position: null };
  const fromSearch = parseRouteFromSearch(location.search || '');
  const fromHash = parseRouteFromHash(location.hash || '');
  return mergeRoutes(fromSearch, fromHash);
}

/**
 * Write route into an existing search string without clobbering unrelated params.
 * Omits keys when values are null/empty. Returns search **without** leading `?` when empty,
 * otherwise with leading `?`.
 */
export function serializeRouteToSearch(route: ModalRoute | null | undefined, existingSearch = ''): string {
  const params = readParamsFromSearch(existingSearch);
  // Clear prp_* and legacy pr+* / "pr *" so leftovers never duplicate
  stripAllRouteKeys(params);
  if (route) {
    const page = normalizePage(route.page);
    if (page) params.set(URI_PARAM_PAGE, page);
    const n = Number(route.number);
    if (Number.isFinite(n) && n > 0) params.set(URI_PARAM_NUMBER, String(Math.floor(n)));
    const pos = route.position != null ? String(route.position).trim() : '';
    if (pos) params.set(URI_PARAM_POSITION, pos);
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function clearRouteFromSearch(existingSearch = ''): string {
  return serializeRouteToSearch(null, existingSearch);
}

/**
 * Strip prp_* / legacy pr+* keys from hash when they were used; leave unrelated fragments.
 */
export function clearRouteFromHash(existingHash = ''): string {
  let h = String(existingHash || '');
  if (h.startsWith('#')) h = h.slice(1);
  if (!h) return '';
  if (!h.includes('=')) {
    // bare position token
    if (parsePosition(h) || h.startsWith('c:')) return '';
    return existingHash.startsWith('#') || h ? `#${h}` : '';
  }
  const params = new URLSearchParams(h);
  stripAllRouteKeys(params);
  const qs = params.toString();
  return qs ? `#${qs}` : '';
}

/**
 * Build pathname+search+hash URL with route applied (or cleared).
 * @param {{ pathname?: string, search?: string, hash?: string } | string} loc
 */
export function buildUrlWithRoute(
  loc: { pathname?: string; search?: string; hash?: string } | string,
  route: ModalRoute | null,
  opts: { clear?: boolean } = {}
): string {
  let pathname = '/';
  let search = '';
  let hash = '';
  if (typeof loc === 'string') {
    try {
      const u = new URL(loc, 'https://example.invalid');
      pathname = u.pathname;
      search = u.search;
      hash = u.hash;
    } catch {
      pathname = String(loc || '/');
    }
  } else if (loc && typeof loc === 'object') {
    pathname = loc.pathname || '/';
    search = loc.search || '';
    hash = loc.hash || '';
  }
  const nextSearch = opts.clear
    ? clearRouteFromSearch(search)
    : serializeRouteToSearch(route, search);
  // Keep hash non-route fragments; clear our keys from hash so we don't duplicate
  const nextHash = clearRouteFromHash(hash);
  return `${pathname}${nextSearch}${nextHash}`;
}

/**
 * history.replaceState without navigation. Returns true if applied.
 * Safe when history/location missing (SSR / tests).
 */
export function replaceLocationRoute(
  historyApi: { replaceState?: Function; state?: unknown } | null | undefined,
  locationApi: { pathname?: string; search?: string; hash?: string; href?: string } | null | undefined,
  route: ModalRoute | null,
  opts: { clear?: boolean } = {}
): boolean {
  if (!historyApi || typeof historyApi.replaceState !== 'function') return false;
  if (!locationApi) return false;
  try {
    const next = buildUrlWithRoute(
      {
        pathname: locationApi.pathname || '/',
        search: locationApi.search || '',
        hash: locationApi.hash || '',
      },
      route,
      opts
    );
    // Avoid no-op churn
    const cur = `${locationApi.pathname || '/'}${locationApi.search || ''}${locationApi.hash || ''}`;
    if (cur === next) return true;
    historyApi.replaceState.call(historyApi, historyApi.state ?? null, '', next);
    return true;
  } catch {
    return false;
  }
}

export function clearLocationRoute(
  historyApi: { replaceState?: Function; state?: unknown } | null | undefined,
  locationApi: { pathname?: string; search?: string; hash?: string } | null | undefined
): boolean {
  return replaceLocationRoute(historyApi, locationApi, null, { clear: true });
}

export type SessionOpenSnap = {
  owner: string;
  repo: string;
  number: number;
  page?: RoutePage | null;
  position?: string | null;
} | null;

export type SessionViewSnap = {
  layoutMode?: string | null;
} | null;

/**
 * URI-first restore on /pulls.
 *
 * Only reopen a modal when the location names a PR (`prp_number` / legacy).
 * SessionStorage may fill page/position **for the same PR** when URI omits them,
 * but never reopens a PR by session alone (plain `/owner/repo/pulls` stays closed).
 *
 * Owner/repo for URI restore come from pathOwner/pathRepo (pulls list path).
 */
export function resolveRestore(input: {
  sessionOpen?: SessionOpenSnap;
  sessionView?: SessionViewSnap;
  uri?: ModalRoute | null;
  pathOwner?: string | null;
  pathRepo?: string | null;
}): {
  open: { owner: string; repo: string; number: number } | null;
  page: RoutePage | null;
  position: string | null;
  source: 'session' | 'uri' | 'none';
} {
  const uri = input.uri || { page: null, number: null, position: null };
  const sessionOpen = input.sessionOpen || null;
  const sessionView = input.sessionView || null;

  const n = uri.number != null ? Number(uri.number) : NaN;
  const owner = String(input.pathOwner || '').trim();
  const repo = String(input.pathRepo || '').trim();

  // No PR id in URI → do not reopen from last session snap
  if (!owner || !repo || !Number.isFinite(n) || n <= 0) {
    return { open: null, page: null, position: null, source: 'none' };
  }

  const number = Math.floor(n);
  let page = normalizePage(uri.page);
  let position =
    uri.position != null && String(uri.position).trim()
      ? String(uri.position).trim()
      : null;

  // Same PR in session: fill missing page/position only
  const sameSession =
    sessionOpen &&
    sessionOpen.number > 0 &&
    String(sessionOpen.owner || '').toLowerCase() === owner.toLowerCase() &&
    String(sessionOpen.repo || '').toLowerCase() === repo.toLowerCase() &&
    Number(sessionOpen.number) === number;

  if (sameSession) {
    if (!page) {
      page =
        normalizePage(sessionOpen.page) ||
        (sessionView?.layoutMode === 'diff'
          ? 'diff'
          : sessionView?.layoutMode === 'centered'
            ? 'conversation'
            : null);
    }
    if (!position && sessionOpen.position) {
      position = String(sessionOpen.position).trim() || null;
    }
  }

  return {
    open: { owner, repo, number },
    page: page || null,
    position,
    source: 'uri',
  };
}

/**
 * Find comment index in mapped comment list for a position token.
 */
export function findCommentIndexByPosition(
  mappedComments: any[] | null | undefined,
  position: string | null | undefined
): number {
  const parsed = parsePosition(position);
  if (!parsed || !Array.isArray(mappedComments) || !mappedComments.length) return -1;
  const id = parsed.id;
  return mappedComments.findIndex((c) => {
    if (!c) return false;
    const cid = c.commentId ?? c.id;
    return cid != null && String(cid) === id;
  });
}
