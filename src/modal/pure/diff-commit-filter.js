/**
 * Pure helpers for Diff view commit / commit-range filtering.
 */

function normalizeDiffCommitFilter(raw) {
  const mode = raw?.mode;
  if (mode === 'single' && raw?.sha) {
    return { mode: 'single', sha: String(raw.sha) };
  }
  if (mode === 'range' && raw?.sha && raw?.endSha) {
    return { mode: 'range', sha: String(raw.sha), endSha: String(raw.endSha) };
  }
  return { mode: 'all' };
}

function isAllCommitsFilter(filter) {
  return !filter || filter.mode === 'all' || !filter.sha;
}

function shortSha(sha, len) {
  const s = String(sha || '').trim();
  if (!s) return '-------';
  const n = Number.isFinite(len) && len > 0 ? Math.floor(len) : 7;
  return s.slice(0, Math.max(4, n));
}

function commitOptionLabel(commit) {
  if (!commit) return '';
  const sha = shortSha(commit.sha);
  const msg = String(commit.message || '')
    .trim()
    .split('\n')[0]
    .slice(0, 48);
  return msg ? `${sha} · ${msg}` : sha;
}

function normalizePrCommits(commits) {
  const list = Array.isArray(commits) ? commits : [];
  return list.filter((c) => c && String(c.sha || '').trim());
}

function resolveCompareRange(commits, baseRefOrSha, filter) {
  const list = normalizePrCommits(commits);
  const f = normalizeDiffCommitFilter(filter);
  if (f.mode === 'all' || !list.length) return null;

  const baseFallback = String(baseRefOrSha || '').trim();
  const indexOf = (sha) => list.findIndex((c) => String(c.sha) === sha);

  if (f.mode === 'single') {
    const sha = String(f.sha || '');
    const i = indexOf(sha);
    if (i < 0) return null;
    const base = i === 0 ? baseFallback : String(list[i - 1].sha);
    const head = String(list[i].sha);
    if (!base || !head) return null;
    return { base, head, label: commitOptionLabel(list[i]) };
  }

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
        : `${startLab}\u2026${endLab} (${j - i + 1} commits)`,
  };
}

function compareCacheKey(owner, repo, base, head) {
  return `${String(owner || '').toLowerCase()}/${String(repo || '').toLowerCase()}@${base}...${head}`;
}

function buildCommitFilterOptions(commits) {
  const list = normalizePrCommits(commits);
  return [...list].reverse().map((c) => ({
    sha: String(c.sha),
    shortSha: shortSha(c.sha),
    label: commitOptionLabel(c),
  }));
}

const api = {
  normalizeDiffCommitFilter,
  isAllCommitsFilter,
  shortSha,
  commitOptionLabel,
  normalizePrCommits,
  resolveCompareRange,
  compareCacheKey,
  buildCommitFilterOptions,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}
if (typeof globalThis !== 'undefined') {
  globalThis.PRModalDiffCommitFilter = api;
}
