/**
 * Inline review comment ordering + next/prev navigation.
 */

/**
 * @typedef {{ id?: string|number, path: string, line: number|null, side?: string, body?: string, author?: string, rowIndex?: number }} InlineComment
 */

/**
 * Sort comments for navigation: path, then line, then id.
 * @param {InlineComment[]} comments
 * @returns {InlineComment[]}
 */
function sortInlineComments(comments) {
  const list = Array.isArray(comments) ? comments.slice() : [];
  list.sort((a, b) => {
    const pa = a.path || '';
    const pb = b.path || '';
    if (pa !== pb) return pa.localeCompare(pb);
    const la = a.line == null ? Number.MAX_SAFE_INTEGER : Number(a.line);
    const lb = b.line == null ? Number.MAX_SAFE_INTEGER : Number(b.line);
    if (la !== lb) return la - lb;
    return String(a.id ?? '').localeCompare(String(b.id ?? ''));
  });
  return list;
}

/**
 * Attach rowIndex by matching virtual rows (filePath + newLine).
 * @param {InlineComment[]} comments
 * @param {Array<{ kind: string, filePath?: string, newLine?: number|null, rowIndex: number }>} virtualRows
 */
function mapCommentsToRowIndices(comments, virtualRows) {
  const sorted = sortInlineComments(comments);
  if (!Array.isArray(virtualRows)) {
    return sorted.map((c) => ({ ...c, rowIndex: undefined }));
  }
  return sorted.map((c) => {
    const line = c.line == null ? null : Number(c.line);
    let rowIndex;
    for (const row of virtualRows) {
      if (row.kind === 'inline-comment' && String(row.commentId) === String(c.id)) {
        rowIndex = row.rowIndex;
        break;
      }
      if (
        row.kind === 'diff-line' &&
        row.filePath === c.path &&
        line != null &&
        row.newLine === line
      ) {
        rowIndex = row.rowIndex;
        // prefer the inline-comment row after this line if present later
      }
    }
    // Prefer dedicated comment row if exists after the line
    if (rowIndex != null) {
      for (const row of virtualRows) {
        if (
          row.kind === 'inline-comment' &&
          row.filePath === c.path &&
          row.newLine === line &&
          (c.id == null || String(row.commentId) === String(c.id))
        ) {
          rowIndex = row.rowIndex;
          break;
        }
      }
    }
    return { ...c, rowIndex };
  });
}

/**
 * Next/prev comment index with wrap.
 * @param {number} current
 * @param {number} total
 * @param {number} delta
 */
function nextCommentIndex(current, total, delta) {
  if (!total || total <= 0) return -1;
  if (current < 0) return delta >= 0 ? 0 : total - 1;
  return (current + delta + total) % total;
}

/**
 * @param {InlineComment[]} mappedComments comments with rowIndex
 * @param {number} commentIndex
 * @param {number} delta
 */
function resolveCommentNav(mappedComments, commentIndex, delta) {
  const list = Array.isArray(mappedComments) ? mappedComments : [];
  if (!list.length) {
    return { commentIndex: -1, active: null, shouldJump: false };
  }
  const next = nextCommentIndex(commentIndex, list.length, delta);
  const active = list[next] || null;
  return {
    commentIndex: next,
    active,
    shouldJump: Boolean(active && typeof active.rowIndex === 'number'),
  };
}

const api = {
  sortInlineComments,
  mapCommentsToRowIndices,
  nextCommentIndex,
  resolveCommentNav,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}
if (typeof globalThis !== 'undefined') {
  globalThis.PRModalCommentNav = api;
}
