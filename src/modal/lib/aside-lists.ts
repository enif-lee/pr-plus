/** @module modal/lib/aside-lists */
/**
 * Pure helpers for conversation-aside Commits timeline and Files tree caps.
 */

/**
 * Cap commits for a compact timeline (sha + short message + author/time).
 * @param {Array<{ sha?: string, message?: string, author?: string, date?: string, committedAt?: string }>} commits
 * @param {number} [max=12]
 */
export function takeCommitsForTimeline(commits, max = 12) {
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
export function takeVisibleTreeNodes(visibleNodes, max = 20) {
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
