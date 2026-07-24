/**
 * Pure helpers: Create-and-apply eligibility for label/milestone pickers,
 * tag∩commit intersection, and aside search / full-load decisions.
 */

/** True when free-text create should be offered (no filter matches + non-empty query). */
export function shouldOfferCreateAndApply(
  filteredCount: unknown,
  query: unknown
): boolean {
  const n = Number(filteredCount);
  const q = String(query || '').trim();
  return Boolean(q) && Number.isFinite(n) && n === 0;
}

/**
 * Footer label for multi-select: Create and apply when empty filter + query,
 * else the default apply label.
 */
export function resolveCreateAndApplyConfirmLabel(
  filteredCount: unknown,
  query: unknown,
  defaultLabel = 'Apply'
): string {
  return shouldOfferCreateAndApply(filteredCount, query)
    ? 'Create and apply'
    : String(defaultLabel || 'Apply');
}

/**
 * Ids to apply after multi confirm when Create and apply is active:
 * existing selection ∪ free-text query name.
 */
export function mergeCreateAndApplyLabelIds(
  selectedIds: unknown,
  query: unknown,
  createMode: boolean
): string[] {
  const selected = Array.isArray(selectedIds)
    ? selectedIds.map((x) => String(x || '').trim()).filter(Boolean)
    : [];
  if (!createMode) return selected;
  const name = String(query || '').trim();
  if (!name) return selected;
  const lower = name.toLowerCase();
  if (selected.some((s) => s.toLowerCase() === lower)) return selected;
  return [...selected, name];
}

/**
 * Tags whose commit SHA is in the PR commit set (prefix match ok for short SHAs).
 * @param {Array<{ name?: string, sha?: string }>} tags
 * @param {Array<{ sha?: string }|string>} commits
 */
export function tagsIntersectingCommits(tags: unknown, commits: unknown) {
  const commitShas = new Set<string>();
  for (const c of Array.isArray(commits) ? commits : []) {
    const sha =
      typeof c === 'string'
        ? c.trim().toLowerCase()
        : String((c as any)?.sha || '')
            .trim()
            .toLowerCase();
    if (sha) commitShas.add(sha);
  }
  const out: Array<{ name: string; sha: string }> = [];
  const seen = new Set<string>();
  for (const t of Array.isArray(tags) ? tags : []) {
    const name = String((t as any)?.name || '').trim();
    const sha = String((t as any)?.sha || '')
      .trim()
      .toLowerCase();
    if (!name || !sha || seen.has(name.toLowerCase())) continue;
    let hit = commitShas.has(sha);
    if (!hit) {
      for (const cs of commitShas) {
        if (cs.startsWith(sha) || sha.startsWith(cs)) {
          hit = true;
          break;
        }
      }
    }
    if (!hit) continue;
    seen.add(name.toLowerCase());
    out.push({ name, sha: String((t as any)?.sha || sha) });
  }
  return out;
}

/** Case-insensitive substring match on commit message / sha / author. */
export function filterCommitsByQuery(commits: unknown, query: unknown) {
  const list = Array.isArray(commits) ? commits : [];
  const q = String(query || '')
    .trim()
    .toLowerCase();
  if (!q) return list.slice();
  return list.filter((c) => {
    const msg = String((c as any)?.message || '').toLowerCase();
    const sha = String((c as any)?.sha || '').toLowerCase();
    const author = String((c as any)?.author || '').toLowerCase();
    return msg.includes(q) || sha.includes(q) || author.includes(q);
  });
}

/** Case-insensitive match on file path / filename. */
export function filterFilesByQuery(files: unknown, query: unknown) {
  const list = Array.isArray(files) ? files : [];
  const q = String(query || '')
    .trim()
    .toLowerCase();
  if (!q) return list.slice();
  return list.filter((f) => {
    const path = String(
      (f as any)?.filename || (f as any)?.path || (f as any)?.name || ''
    ).toLowerCase();
    return path.includes(q);
  });
}

/**
 * Whether to fully load remaining pages before filtering.
 * True when user searched or asked for load-more and corpus is not yet full.
 */
export function needsFullCorpusLoad(opts: {
  query?: unknown;
  loadMore?: boolean;
  fullyLoaded?: boolean;
} = {}): boolean {
  if (opts.fullyLoaded) return false;
  const q = String(opts.query || '').trim();
  return Boolean(opts.loadMore) || Boolean(q);
}
