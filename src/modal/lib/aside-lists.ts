/** @module modal/lib/aside-lists */
/**
 * Pure helpers for conversation-aside Commits timeline and Files tree caps.
 */

/**
 * Cap commits for a compact timeline (sha + short message + author/time).
 * @param {Array<{ sha?: string, message?: string, author?: string, date?: string, committedAt?: string }>} commits
 * @param {number} [max=12]
 */
export function takeCommitsForTimeline(commits: any, max = 12) {
  // Newest-first for display (GitHub PR commits payload is oldest-first).
  const list = Array.isArray(commits) ? [...commits].reverse() : [];
  const limit = Number.isFinite(max) && max > 0 ? Math.floor(max) : 12;
  const items = list.slice(0, limit).map((c, i) => {
    const fullMsg = String(c.message || '').trim();
    const firstLine = fullMsg.split('\n')[0] || '(no message)';
    const shortMessage =
      firstLine.length > 72 ? `${firstLine.slice(0, 69)}…` : firstLine;
    const sha = String(c.sha || '');
    return {
      key: sha || `commit-${i}`,
      sha,
      shortSha: sha ? sha.slice(0, 7) : '-------',
      message: shortMessage,
      fullMessage: fullMsg,
      author: c.author || '',
      at: c.date || c.committedAt || c.authoredAt || '',
    };
  });
  return {
    items,
    total: list.length,
    truncated: Math.max(0, list.length - items.length),
  };
}

/**
 * Cap a flattened visible tree node list so the aside stays short.
 * @param {Array} visibleNodes from flattenVisibleTree
 * @param {number} [max=20]
 */
export function takeVisibleTreeNodes(visibleNodes: any, max = 20) {
  const list = Array.isArray(visibleNodes) ? visibleNodes : [];
  const limit = Number.isFinite(max) && max > 0 ? Math.floor(max) : 20;
  if (list.length <= limit) {
    return { nodes: list, total: list.length, truncated: 0 };
  }
  return {
    nodes: list.slice(0, limit),
    total: list.length,
    truncated: list.length - limit,
  };
}

/**
 * Filter PR commits by free-text query (message, sha, author).
 */
export function filterCommitsByQuery(commits: any, query: any) {
  const list = Array.isArray(commits) ? commits : [];
  const q = String(query || '')
    .trim()
    .toLowerCase();
  if (!q) return list;
  const words = q.split(/\s+/).filter(Boolean);
  return list.filter((c) => {
    const hay = [c?.sha, c?.message, c?.author, c?.date]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

/**
 * Filter PR files by free-text query (path / status).
 */
export function filterFilesByQuery(files: any, query: any) {
  const list = Array.isArray(files) ? files : [];
  const q = String(query || '')
    .trim()
    .toLowerCase();
  if (!q) return list;
  const words = q.split(/\s+/).filter(Boolean);
  return list.filter((f) => {
    const path = f?.filename || f?.path || f?.previous_filename || '';
    const hay = [path, f?.status, f?.previous_filename]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

/**
 * True when the detail may still have more commits than the loaded array
 * (first page is 100; PR payload may include commits count).
 */
export function mayHaveMoreCommits(detail: any) {
  const loaded = Array.isArray(detail?.commits) ? detail.commits.length : 0;
  const total = Number(detail?.commitsCount);
  if (Number.isFinite(total) && total > loaded) return true;
  return loaded >= 100;
}

/**
 * True when more files may exist than the loaded array (changedFiles / page size).
 */
export function mayHaveMoreFiles(detail: any) {
  const loaded = Array.isArray(detail?.files) ? detail.files.length : 0;
  const total = Number(detail?.changedFiles);
  if (Number.isFinite(total) && total > loaded) return true;
  return loaded >= 100;
}

/**
 * Filter git tags related to a PR by query (name / sha).
 */
export function filterTagsByQuery(tags: any, query: any) {
  const list = Array.isArray(tags) ? tags : [];
  const q = String(query || '')
    .trim()
    .toLowerCase();
  if (!q) return list;
  const words = q.split(/\s+/).filter(Boolean);
  return list.filter((t) => {
    const hay = [t?.name, t?.sha, t?.message]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}
