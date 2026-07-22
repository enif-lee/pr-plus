/**
 * Pure helpers for paginated / incremental GitHub comment fetches.
 * REST: page+per_page (Link rel=next) and since=ISO8601 incremental windows.
 */
(function () {

const DEFAULT_COMMENT_PAGE_SIZE = 50;

function parseLinkNextPage(linkHeader) {
  const raw = String(linkHeader || '');
  if (!raw) return null;
  const parts = raw.split(',');
  for (const part of parts) {
    if (!/rel="?next"?/i.test(part)) continue;
    const m = part.match(/[?&]page=(\d+)/i);
    if (m) {
      const n = Number(m[1]);
      return Number.isFinite(n) && n > 0 ? n : null;
    }
  }
  return null;
}

function linkHasMore(linkHeader) {
  return parseLinkNextPage(linkHeader) != null;
}

function clampPerPage(n, max = 100) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return DEFAULT_COMMENT_PAGE_SIZE;
  return Math.min(max, Math.floor(v));
}

function buildCommentsListUrl(kind, owner, repo, number, opts = {}) {
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
  if (opts.sort) params.set('sort', String(opts.sort));
  if (opts.direction) params.set('direction', String(opts.direction));
  if (opts.since) params.set('since', String(opts.since));
  return `${base}?${params.toString()}`;
}

function mergeCommentsById(existing, incoming) {
  const map = new Map();
  for (const c of Array.isArray(existing) ? existing : []) {
    if (c && c.id != null) map.set(String(c.id), c);
  }
  for (const c of Array.isArray(incoming) ? incoming : []) {
    if (c && c.id != null) map.set(String(c.id), c);
  }
  return [...map.values()].sort((a, b) => {
    const ta = String(a.createdAt || a.created_at || '');
    const tb = String(b.createdAt || b.created_at || '');
    if (ta !== tb) return ta.localeCompare(tb);
    return Number(a.id) - Number(b.id);
  });
}

function buildCommentsPageMeta(items, opts = {}) {
  const list = Array.isArray(items) ? items : [];
  const page = Math.max(1, Number(opts.page) || 1);
  const perPage = clampPerPage(opts.perPage);
  const nextPage = parseLinkNextPage(opts.linkHeader);
  const hasMore =
    nextPage != null || (opts.linkHeader == null && list.length >= perPage);
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
  return {
    page,
    perPage,
    hasMore: Boolean(hasMore),
    nextPage: nextPage ?? (hasMore ? page + 1 : null),
    since: opts.since || null,
    oldestCreatedAt: oldest,
    newestCreatedAt: newest,
    maxId,
    loadedCount: list.length,
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

function advanceCommentsMeta(prevMeta, pageMeta, totalLoaded) {
  const prev = prevMeta || {};
  const page = pageMeta || {};
  return {
    page: page.page ?? prev.page ?? 1,
    perPage: page.perPage ?? prev.perPage ?? DEFAULT_COMMENT_PAGE_SIZE,
    hasMore: Boolean(page.hasMore),
    nextPage: page.hasMore ? page.nextPage : null,
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

function sinceCursorFromMeta(meta) {
  if (meta?.newestCreatedAt) return meta.newestCreatedAt;
  return null;
}

const api = {
  DEFAULT_COMMENT_PAGE_SIZE,
  parseLinkNextPage,
  linkHasMore,
  buildCommentsListUrl,
  clampPerPage,
  mergeCommentsById,
  buildCommentsPageMeta,
  advanceCommentsMeta,
  sinceCursorFromMeta,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}
if (typeof globalThis !== 'undefined') {
  globalThis.PRModalCommentsPage = api;
}
})();
