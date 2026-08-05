/**
 * Pure helpers for Diff view commit / commit-range filtering.
 * Resolves GitHub compare base...head from PR commits (oldest-first).
 */

export type DiffCommitFilterMode = 'all' | 'single' | 'range';

export interface DiffCommitFilter {
  mode: DiffCommitFilterMode;
  /** Single commit sha, or range start (inclusive). */
  sha?: string;
  /** Range end sha (inclusive). Only for mode=range. */
  endSha?: string;
}

export interface CompareRange {
  base: string;
  head: string;
  label: string;
}

export interface CommitLike {
  sha?: string;
  message?: string;
  author?: string;
  date?: string;
  [k: string]: unknown;
}

export function normalizeDiffCommitFilter(raw: any): DiffCommitFilter {
  const mode = raw?.mode;
  if (mode === 'single' && raw?.sha) {
    return { mode: 'single', sha: String(raw.sha) };
  }
  if (mode === 'range' && raw?.sha && raw?.endSha) {
    return { mode: 'range', sha: String(raw.sha), endSha: String(raw.endSha) };
  }
  return { mode: 'all' };
}

export function isAllCommitsFilter(filter: DiffCommitFilter | null | undefined): boolean {
  return !filter || filter.mode === 'all' || !filter.sha;
}

export function shortSha(sha: string | null | undefined, len = 7): string {
  const s = String(sha || '').trim();
  if (!s) return '-------';
  return s.slice(0, Math.max(4, len));
}

export function commitOptionLabel(commit: CommitLike | null | undefined): string {
  if (!commit) return '';
  const sha = shortSha(commit.sha);
  const msg = String(commit.message || '')
    .trim()
    .split('\n')[0]
    .slice(0, 80);
  return msg ? `${sha} · ${msg}` : sha;
}

/**
 * Normalize PR commits list to oldest-first with non-empty shas.
 * GitHub /pulls/{n}/commits is already oldest-first.
 */
export function normalizePrCommits(commits: CommitLike[] | null | undefined): CommitLike[] {
  const list = Array.isArray(commits) ? commits : [];
  return list.filter((c) => c && String(c.sha || '').trim());
}

/**
 * Resolve compare base...head for a filter against PR commits.
 * @param commits oldest-first PR commits
 * @param baseRefOrSha PR base branch name or base sha (fallback when first commit has no parent in list)
 */
export function resolveCompareRange(
  commits: CommitLike[] | null | undefined,
  baseRefOrSha: string | null | undefined,
  filter: DiffCommitFilter | null | undefined
): CompareRange | null {
  const list = normalizePrCommits(commits);
  const f = normalizeDiffCommitFilter(filter);
  if (f.mode === 'all' || !list.length) return null;

  const baseFallback = String(baseRefOrSha || '').trim();
  const indexOf = (sha: string) => list.findIndex((c) => String(c.sha) === sha);

  if (f.mode === 'single') {
    const sha = String(f.sha || '');
    const i = indexOf(sha);
    if (i < 0) return null;
    const base = i === 0 ? baseFallback : String(list[i - 1].sha);
    const head = String(list[i].sha);
    if (!base || !head) return null;
    return {
      base,
      head,
      label: commitOptionLabel(list[i]),
    };
  }

  // range (inclusive)
  let i = indexOf(String(f.sha || ''));
  let j = indexOf(String(f.endSha || ''));
  if (i < 0 || j < 0) return null;
  if (i > j) {
    const t = i;
    i = j;
    j = t;
  }
  const base = i === 0 ? baseFallback : String(list[i - 1].sha);
  const head = String(list[j].sha);
  if (!base || !head) return null;
  const startLab = shortSha(list[i].sha);
  const endLab = shortSha(list[j].sha);
  return {
    base,
    head,
    label:
      i === j
        ? commitOptionLabel(list[i])
        : `${startLab}…${endLab} (${j - i + 1} commits)`,
  };
}

/** Cache key for compare file payloads. */
export function compareCacheKey(owner: string, repo: string, base: string, head: string): string {
  return `${String(owner || '').toLowerCase()}/${String(repo || '').toLowerCase()}@${base}...${head}`;
}

/** Max visible chars for commit option / trigger labels (ellipsis beyond). */
export const COMMIT_LABEL_MAX_LEN = 72;

/**
 * Truncate a label for the commit picker (keeps UI width bounded).
 */
export function truncateCommitLabel(label: string, maxLen = COMMIT_LABEL_MAX_LEN): string {
  const s = String(label || '').trim();
  if (!s) return '';
  if (s.length <= maxLen) return s;
  return `${s.slice(0, Math.max(1, maxLen - 1))}…`;
}

/**
 * Compact date for commit-picker secondary line (author · time).
 * Pure and locale-stable enough for unit tests (en-US short month).
 */
export function formatCommitOptionDate(iso: string | null | undefined): string {
  const raw = String(iso || '').trim();
  if (!raw) return '';
  try {
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return raw;
    return d.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return raw;
  }
}

/**
 * Secondary line under each commit option: "Author · Aug 5, 2026, 1:45 PM".
 * Omits missing parts; empty when neither author nor date is available.
 */
export function formatCommitOptionSecondary(
  commit: CommitLike | null | undefined
): string {
  if (!commit) return '';
  const author = String(commit.author || '').trim();
  const when = formatCommitOptionDate(
    (commit.date as string) ||
      (commit.committedAt as string) ||
      (commit.authoredAt as string) ||
      ''
  );
  if (author && when) return `${author} · ${when}`;
  return author || when || '';
}

/**
 * Build select options for the commit filter UI (newest-first for scanning).
 */
export function buildCommitFilterOptions(commits: CommitLike[] | null | undefined): Array<{
  sha: string;
  label: string;
  shortSha: string;
  fullLabel: string;
  /** Small muted line under the primary label (author · time). */
  secondary: string;
}> {
  const list = normalizePrCommits(commits);
  // newest first in the dropdown
  return [...list].reverse().map((c) => {
    const fullLabel = commitOptionLabel(c);
    return {
      sha: String(c.sha),
      shortSha: shortSha(c.sha),
      fullLabel,
      label: truncateCommitLabel(fullLabel),
      secondary: formatCommitOptionSecondary(c),
    };
  });
}

/**
 * Map multi-checkbox selection (sha ids, ignoring "all") to a DiffCommitFilter.
 * - 0 selected → all commits
 * - 1 selected → single commit
 * - 2+ selected → inclusive range from oldest to newest among the selection
 *   (order independent; uses PR commit chronology).
 */
export function selectionToDiffCommitFilter(
  selectedIds: string[] | null | undefined,
  commits: CommitLike[] | null | undefined
): DiffCommitFilter {
  const ids = (Array.isArray(selectedIds) ? selectedIds : [])
    .map((x) => String(x || '').trim())
    .filter((x) => x && x !== 'all');
  if (!ids.length) return { mode: 'all' };

  const list = normalizePrCommits(commits);
  const indexOf = (sha: string) => list.findIndex((c) => String(c.sha) === sha);
  const ordered = ids
    .map((sha) => ({ sha, i: indexOf(sha) }))
    .filter((x) => x.i >= 0)
    .sort((a, b) => a.i - b.i);

  if (!ordered.length) return { mode: 'all' };
  if (ordered.length === 1) return { mode: 'single', sha: ordered[0].sha };
  return {
    mode: 'range',
    sha: ordered[0].sha,
    endSha: ordered[ordered.length - 1].sha,
  };
}

/** Inverse: selected sha ids for a filter (for multi-select initial state). */
export function diffCommitFilterToSelection(
  filter: DiffCommitFilter | null | undefined,
  commits: CommitLike[] | null | undefined
): string[] {
  const f = normalizeDiffCommitFilter(filter);
  if (f.mode === 'all' || !f.sha) return [];
  if (f.mode === 'single') return [String(f.sha)];
  // range: all commits from start..end inclusive (checkboxes show full span)
  const list = normalizePrCommits(commits);
  let i = list.findIndex((c) => String(c.sha) === String(f.sha));
  let j = list.findIndex((c) => String(c.sha) === String(f.endSha));
  if (i < 0 || j < 0) return [String(f.sha), String(f.endSha || f.sha)].filter(Boolean);
  if (i > j) {
    const t = i;
    i = j;
    j = t;
  }
  return list.slice(i, j + 1).map((c) => String(c.sha));
}

/**
 * Multi-checkbox toggle for commit / inclusive-range picking.
 *
 * Semantics (commits ordered oldest → newest via normalizePrCommits):
 * - empty → click A: select A alone
 * - single A → click A: clear
 * - single A → click B: select every commit between A and B (inclusive)
 * - range [lo…hi] → click lo: leave only hi (single)
 * - range [lo…hi] → click hi: leave only lo (single)
 * - range → click interior or outside: reset to that commit alone
 *
 * Used by Diff toolbar SearchableSelect (not plain multi add/remove).
 */
export function toggleCommitRangeSelection(
  prevSelected: string[] | null | undefined,
  clickedId: string | null | undefined,
  commits: CommitLike[] | null | undefined
): string[] {
  const list = normalizePrCommits(commits);
  const indexOf = (sha: string) =>
    list.findIndex((c) => String(c.sha) === String(sha));
  const click = String(clickedId || '').trim();
  if (!click || !list.length) {
    return Array.isArray(prevSelected) ? prevSelected.map(String) : [];
  }
  const clickI = indexOf(click);
  if (clickI < 0) {
    return Array.isArray(prevSelected) ? prevSelected.map(String) : [];
  }

  const prev = (Array.isArray(prevSelected) ? prevSelected : [])
    .map((x) => String(x || '').trim())
    .filter(Boolean);
  const prevIdx = [
    ...new Set(prev.map((sha) => indexOf(sha)).filter((i) => i >= 0)),
  ].sort((a, b) => a - b);

  if (!prevIdx.length) {
    return [click];
  }

  if (prevIdx.length === 1) {
    const only = prevIdx[0];
    if (only === clickI) return [];
    const lo = Math.min(only, clickI);
    const hi = Math.max(only, clickI);
    return list.slice(lo, hi + 1).map((c) => String(c.sha));
  }

  // Multi / range: endpoints = min & max of current selection
  const lo = prevIdx[0];
  const hi = prevIdx[prevIdx.length - 1];
  if (clickI === lo) {
    return [String(list[hi].sha)];
  }
  if (clickI === hi) {
    return [String(list[lo].sha)];
  }
  // Interior of span or outside: reset selection to the clicked commit
  return [click];
}
