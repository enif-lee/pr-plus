/** @module modal/lib/comments-page */
/**
 * Pure helpers for paginated / incremental GitHub comment fetches.
 *
 * REST supports:
 * - page + per_page (Link: rel="next")
 * - since=ISO8601 for incremental “updated after” windows
 * Merge is id-based so cache + offset pages compose safely.
 */

export const DEFAULT_COMMENT_PAGE_SIZE = 50;

/**
 * Parse GitHub Link header for the next page number.
 * @param {string|null|undefined} linkHeader
 * @returns {number|null}
 */
function parseLinkRelPage(linkHeader, rel) {
  const raw = String(linkHeader || '');
  if (!raw) return null;
  const re = new RegExp(`rel="?${rel}"?`, 'i');
  // <https://api.github.com/...?page=2>; rel="next"
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

export function parseLinkNextPage(linkHeader) {
  return parseLinkRelPage(linkHeader, 'next');
}

/**
 * Last page number from GitHub Link header (rel="last").
 * Used to fetch newest issue comments first (API is ascending-only).
 */
export function parseLinkLastPage(linkHeader) {
  return parseLinkRelPage(linkHeader, 'last');
}

/**
 * Whether Link header indicates more pages.
 */
export function linkHasMore(linkHeader) {
  return parseLinkNextPage(linkHeader) != null;
}

/**
 * Build list URL for issue or pull review comments.
 * @param {'issue'|'review'} kind
 * @param {string} owner
 * @param {string} repo
 * @param {number|string} number
 * @param {{ page?: number, perPage?: number, since?: string|null, sort?: string, direction?: string }} [opts]
 */
export function buildCommentsListUrl(kind, owner, repo, number, opts: any = {}) {
  const o = encodeURIComponent(String(owner || ''));
  const r = encodeURIComponent(String(repo || ''));
  const n = Number(number);
  const perPage = clampPerPage(opts.perPage);
  const page = Math.max(1, Number(opts.page) || 1);
  const base =
    kind === 'review'
      ? `https://api.github.com/repos/${o}/${r}/pulls/${n}/comments`
      : `https://api.github.com/repos/${o}/${r}/issues/${n}/comments`;
  const params = new URLSearchParams();
  params.set('per_page', String(perPage));
  params.set('page', String(page));
  // Ascending created so page 1 is oldest… but GitHub default is ascending by id.
  // Prefer created asc for stable offset paging; since uses updated filter.
  if (opts.sort) params.set('sort', String(opts.sort));
  if (opts.direction) params.set('direction', String(opts.direction));
  if (opts.since) params.set('since', String(opts.since));
  return `${base}?${params.toString()}`;
}

export function clampPerPage(n, max = 100) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return DEFAULT_COMMENT_PAGE_SIZE;
  return Math.min(max, Math.floor(v));
}

/**
 * Merge two comment arrays by id (incoming overwrites). Stable sort by createdAt then id.
 * @param {Array} existing
 * @param {Array} incoming
 */
/**
 * @param {Array} existing
 * @param {Array} incoming
 * @param {Set<string>|string[]|null|undefined} [excludeIds] tombstoned (deleted) ids
 */
export function mergeCommentsById(existing, incoming, excludeIds = null) {
  const ban =
    excludeIds instanceof Set
      ? excludeIds
      : excludeIds
        ? new Set(
            (Array.isArray(excludeIds) ? excludeIds : []).map((x) => String(x))
          )
        : null;
  const map = new Map();
  for (const c of Array.isArray(existing) ? existing : []) {
    if (!c || c.id == null) continue;
    const key = String(c.id);
    if (ban && ban.has(key)) continue;
    map.set(key, c);
  }
  for (const c of Array.isArray(incoming) ? incoming : []) {
    if (!c || c.id == null) continue;
    const key = String(c.id);
    if (ban && ban.has(key)) continue;
    map.set(key, c);
  }
  return [...map.values()].sort((a, b) => {
    const ta = String(a.createdAt || a.created_at || '');
    const tb = String(b.createdAt || b.created_at || '');
    if (ta !== tb) return ta.localeCompare(tb);
    return Number(a.id) - Number(b.id);
  });
}

/**
 * Build pagination meta after a page fetch.
 * @param {Array} items mapped comments for this page
 * @param {{ page?: number, perPage?: number, linkHeader?: string, since?: string|null }} opts
 */
export function buildCommentsPageMeta(items, opts: any = {}) {
  const list = Array.isArray(items) ? items : [];
  const page = Math.max(1, Number(opts.page) || 1);
  const perPage = clampPerPage(opts.perPage);
  /** 'from-end': issue comments loaded newest-first by walking pages downward */
  const order = opts.order === 'from-end' ? 'from-end' : opts.order || 'asc';

  let oldest = null;
  let newest = null;
  let maxId = null;
  for (const c of list) {
    const at = c?.createdAt || c?.created_at || null;
    if (at) {
      if (!oldest || at < oldest) oldest = at;
      if (!newest || at > newest) newest = at;
    }
    if (c?.id != null) {
      const id = Number(c.id);
      if (Number.isFinite(id) && (maxId == null || id > maxId)) maxId = id;
    }
  }

  if (order === 'from-end') {
    // Page N was the last (newest) page; older content is on page N-1, N-2, …
    const hasMore = page > 1;
    return {
      page,
      perPage,
      hasMore,
      nextPage: hasMore ? page - 1 : null,
      order: 'from-end',
      since: opts.since || null,
      oldestCreatedAt: oldest,
      newestCreatedAt: newest,
      maxId,
      loadedCount: list.length,
    };
  }

  const nextPage = parseLinkNextPage(opts.linkHeader);
  const hasMore =
    nextPage != null ||
    // If no Link header (mocks), treat full page as maybe-more
    (opts.linkHeader == null && list.length >= perPage);
  return {
    page,
    perPage,
    hasMore: Boolean(hasMore),
    nextPage: nextPage ?? (hasMore ? page + 1 : null),
    order,
    since: opts.since || null,
    oldestCreatedAt: oldest,
    newestCreatedAt: newest,
    maxId,
    loadedCount: list.length,
  };
}

/**
 * Merge page meta after appending a page into an accumulated list.
 */
export function advanceCommentsMeta(prevMeta, pageMeta, totalLoaded) {
  const prev = prevMeta || {};
  const page = pageMeta || {};
  return {
    page: page.page ?? prev.page ?? 1,
    perPage: page.perPage ?? prev.perPage ?? DEFAULT_COMMENT_PAGE_SIZE,
    hasMore: Boolean(page.hasMore),
    nextPage: page.hasMore ? page.nextPage : null,
    order: page.order || prev.order || 'asc',
    since: prev.since || null,
    oldestCreatedAt: minIso(prev.oldestCreatedAt, page.oldestCreatedAt),
    newestCreatedAt: maxIso(prev.newestCreatedAt, page.newestCreatedAt),
    maxId:
      page.maxId != null && (prev.maxId == null || page.maxId > prev.maxId)
        ? page.maxId
        : prev.maxId ?? page.maxId ?? null,
    loadedCount: Number.isFinite(totalLoaded) ? totalLoaded : page.loadedCount || 0,
  };
}

function minIso(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  return a < b ? a : b;
}
function maxIso(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  return a > b ? a : b;
}

/**
 * Cursor for since-based incremental refresh (use newest createdAt, or now).
 */
export function sinceCursorFromMeta(meta) {
  if (meta?.newestCreatedAt) return meta.newestCreatedAt;
  return null;
}
