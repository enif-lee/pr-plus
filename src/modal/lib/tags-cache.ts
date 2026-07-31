/**
 * In-memory repo tags cache (newest-first GitHub list).
 * Avoids re-walking pages already covered after the first full/partial fill.
 */

export type RepoTag = {
  name: string;
  sha: string;
  zipballUrl?: string;
  tarballUrl?: string;
};

export type RepoTagsCacheEntry = {
  /** Tags in GitHub list order (newest first). */
  tags: RepoTag[];
  /** How many list pages were loaded into `tags` (per_page typically 100). */
  pagesLoaded: number;
  /** True when last page was short / empty (no further pages). */
  complete: boolean;
  /** Epoch ms of last successful network fill. */
  fetchedAt: number;
};

const DEFAULT_TTL_MS = 30 * 60 * 1000;

/** Module-level cache survives PR switches within the same extension page. */
const repoTagsCache = new Map<string, RepoTagsCacheEntry>();

export function repoTagsCacheKey(owner: unknown, repo: unknown): string {
  return `${String(owner || '')
    .trim()
    .toLowerCase()}/${String(repo || '')
    .trim()
    .toLowerCase()}`;
}

export function getRepoTagsCache(
  owner: unknown,
  repo: unknown
): RepoTagsCacheEntry | null {
  const key = repoTagsCacheKey(owner, repo);
  if (!key || key === '/') return null;
  return repoTagsCache.get(key) || null;
}

export function setRepoTagsCache(
  owner: unknown,
  repo: unknown,
  entry: RepoTagsCacheEntry
): void {
  const key = repoTagsCacheKey(owner, repo);
  if (!key || key === '/') return;
  repoTagsCache.set(key, entry);
}

export function clearRepoTagsCache(
  owner?: unknown,
  repo?: unknown
): void {
  if (owner == null && repo == null) {
    repoTagsCache.clear();
    return;
  }
  const key = repoTagsCacheKey(owner, repo);
  repoTagsCache.delete(key);
}

/**
 * Whether a cache entry is still usable (TTL + has tags or known complete empty).
 */
export function isRepoTagsCacheFresh(
  entry: RepoTagsCacheEntry | null | undefined,
  now = Date.now(),
  ttlMs = DEFAULT_TTL_MS
): boolean {
  if (!entry || !Number.isFinite(entry.fetchedAt)) return false;
  const ttl = Number.isFinite(ttlMs) && ttlMs > 0 ? ttlMs : DEFAULT_TTL_MS;
  return now - entry.fetchedAt <= ttl;
}

/**
 * Merge a newest-first page-1 batch into an existing cache.
 * If the first tag of the new page is already at the head (or within) the
 * cache, no deeper pages need re-walking — only prepend genuinely new tags.
 *
 * @returns next entry + whether additional pages beyond page1 are still needed
 *   to reach `complete` (false when page1 is short or fully overlaps known list)
 */
export function mergeNewestFirstTagPage(
  prev: RepoTagsCacheEntry | null | undefined,
  pageTags: RepoTag[],
  opts: { pageSize?: number; pageIndex?: number; now?: number } = {}
): { entry: RepoTagsCacheEntry; needMorePages: boolean } {
  const pageSize =
    Number.isFinite(opts.pageSize as number) && Number(opts.pageSize) > 0
      ? Math.floor(Number(opts.pageSize))
      : 100;
  const pageIndex =
    Number.isFinite(opts.pageIndex as number) && Number(opts.pageIndex) > 0
      ? Math.floor(Number(opts.pageIndex))
      : 1;
  const now = Number.isFinite(opts.now as number)
    ? Number(opts.now)
    : Date.now();
  const page = normalizeTagList(pageTags);

  if (!prev || !prev.tags.length) {
    const complete = page.length < pageSize;
    return {
      entry: {
        tags: page,
        pagesLoaded: pageIndex,
        complete,
        fetchedAt: now,
      },
      needMorePages: !complete,
    };
  }

  // Build name→index for previous (newest-first)
  const prevByName = new Map(
    prev.tags.map((t, i) => [String(t.name).toLowerCase(), i] as const)
  );
  const newOnly: RepoTag[] = [];
  let overlapAt = -1;
  for (const t of page) {
    const idx = prevByName.get(String(t.name).toLowerCase());
    if (idx != null) {
      overlapAt = idx;
      break;
    }
    newOnly.push(t);
  }

  if (overlapAt === 0 && newOnly.length === 0) {
    // Page1 identical head — cache still covers known offsets; skip rewalk
    return {
      entry: {
        ...prev,
        fetchedAt: now,
      },
      needMorePages: false,
    };
  }

  if (overlapAt >= 0) {
    // Prepend only tags newer than the overlap point
    const merged = [...newOnly, ...prev.tags];
    return {
      entry: {
        tags: dedupeTagsByName(merged),
        pagesLoaded: Math.max(prev.pagesLoaded, pageIndex),
        complete: prev.complete || page.length < pageSize,
        fetchedAt: now,
      },
      // Overlap means older pages are already in prev — no full rewalk
      needMorePages: false,
    };
  }

  // No overlap: page1 is entirely new or different — replace if page1 cold,
  // or prepend and continue paging if we still need the rest of the list.
  if (pageIndex === 1) {
    const complete = page.length < pageSize;
    // If we had a previous incomplete list with no overlap, prefer the new
    // page1 as truth (force refresh semantics).
    return {
      entry: {
        tags: page,
        pagesLoaded: 1,
        complete,
        fetchedAt: now,
      },
      needMorePages: !complete,
    };
  }

  // Later page without name overlap: append
  const merged = dedupeTagsByName([...prev.tags, ...page]);
  const complete = page.length < pageSize;
  return {
    entry: {
      tags: merged,
      pagesLoaded: Math.max(prev.pagesLoaded, pageIndex),
      complete: prev.complete || complete,
      fetchedAt: now,
    },
    needMorePages: !complete,
  };
}

/**
 * Filter tags whose commit sha is in the given set (PR head + commits).
 */
export function filterTagsByCommitShas(
  tags: RepoTag[] | null | undefined,
  shas: Array<string | null | undefined> | null | undefined
): RepoTag[] {
  const want = new Set(
    (Array.isArray(shas) ? shas : [])
      .map((s) => String(s || '').trim().toLowerCase())
      .filter(Boolean)
  );
  if (!want.size) return [];
  return (Array.isArray(tags) ? tags : []).filter((t) =>
    want.has(String(t?.sha || '').toLowerCase())
  );
}

function normalizeTagList(raw: unknown): RepoTag[] {
  if (!Array.isArray(raw)) return [];
  const out: RepoTag[] = [];
  for (const t of raw) {
    if (!t || typeof t !== 'object') continue;
    const name = String((t as any).name || '').trim();
    const sha = String((t as any).sha || (t as any).commit?.sha || '').trim();
    if (!name) continue;
    out.push({
      name,
      sha,
      zipballUrl: String((t as any).zipballUrl || (t as any).zipball_url || ''),
      tarballUrl: String((t as any).tarballUrl || (t as any).tarball_url || ''),
    });
  }
  return out;
}

function dedupeTagsByName(tags: RepoTag[]): RepoTag[] {
  const seen = new Set<string>();
  const out: RepoTag[] = [];
  for (const t of tags) {
    const k = String(t.name || '').toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

/** Test-only: expose size for assertions. */
export function __repoTagsCacheSizeForTests(): number {
  return repoTagsCache.size;
}
