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
    .slice(0, 48);
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

/**
 * Build select options for the commit filter UI (newest-first for scanning).
 */
export function buildCommitFilterOptions(commits: CommitLike[] | null | undefined): Array<{
  sha: string;
  label: string;
  shortSha: string;
}> {
  const list = normalizePrCommits(commits);
  // newest first in the dropdown
  return [...list].reverse().map((c) => ({
    sha: String(c.sha),
    shortSha: shortSha(c.sha),
    label: commitOptionLabel(c),
  }));
}
