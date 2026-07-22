/** @module modal/lib/comment-nav */
/**
 * Inline review **thread** ordering + next/prev navigation.
 * Diff comment navigator jumps between thread roots only (replies excluded).
 */

/**
 * @typedef {{
 *   id?: string|number,
 *   path: string,
 *   line: number|null,
 *   side?: string,
 *   body?: string,
 *   author?: string,
 *   rowIndex?: number,
 *   inReplyToId?: string|number|null,
 *   in_reply_to_id?: string|number|null,
 * }} InlineComment
 */

/**
 * Keep only review-thread roots. A comment is a reply (excluded) when its
 * in_reply_to / inReplyToId points at another comment in the same list.
 * @param {InlineComment[]} comments
 * @returns {InlineComment[]}
 */
export function filterThreadRootComments(comments) {
  const list = Array.isArray(comments) ? comments : [];
  const byId = new Map();
  for (const c of list) {
    if (c && c.id != null) byId.set(String(c.id), c);
  }
  return list.filter((c) => {
    if (!c) return false;
    const parentId = c.inReplyToId ?? c.in_reply_to_id ?? null;
    if (parentId != null && byId.has(String(parentId))) return false;
    return true;
  });
}

/**
 * Sort comments for navigation: path, then line, then id.
 * @param {InlineComment[]} comments
 * @returns {InlineComment[]}
 */
export function sortInlineComments(comments) {
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
 * Thread roots only, sorted for Diff comment navigator.
 * @param {InlineComment[]} comments
 * @returns {InlineComment[]}
 */
export function sortThreadRootComments(comments) {
  return sortInlineComments(filterThreadRootComments(comments));
}

/**
 * Attach rowIndex by matching virtual rows (filePath + newLine).
 * Expects **thread roots** (use sortThreadRootComments / filterThreadRootComments).
 * @param {InlineComment[]} comments
 * @param {Array<{ kind: string, filePath?: string, newLine?: number|null, rowIndex: number }>} virtualRows
 */
export function mapCommentsToRowIndices(comments, virtualRows) {
  const sorted = sortInlineComments(comments);
  if (!Array.isArray(virtualRows)) {
    return sorted.map((c) => ({ ...c, rowIndex: undefined }));
  }
  return sorted.map((c) => {
    const line =
      c.line != null
        ? Number(c.line)
        : c.originalLine != null
          ? Number(c.originalLine)
          : null;
    const side = String(c.side || 'RIGHT').toUpperCase() === 'LEFT' ? 'LEFT' : 'RIGHT';
    let rowIndex;

    // 1) Exact inline-comment row for this comment id
    for (const row of virtualRows) {
      if (row.kind === 'inline-comment' && String(row.commentId) === String(c.id)) {
        rowIndex = row.rowIndex;
        break;
      }
    }

    // 2) Diff line on the correct side (LEFT → oldLine, RIGHT → newLine)
    if (rowIndex == null && line != null) {
      for (const row of virtualRows) {
        if (row.kind !== 'diff-line' || row.filePath !== c.path) continue;
        const rowLine = side === 'LEFT' ? row.oldLine : row.newLine;
        if (rowLine === line) {
          rowIndex = row.rowIndex;
          break;
        }
      }
      // Fallback: either side if primary side missed (outdated / split quirks)
      if (rowIndex == null) {
        for (const row of virtualRows) {
          if (row.kind !== 'diff-line' || row.filePath !== c.path) continue;
          if (row.newLine === line || row.oldLine === line) {
            rowIndex = row.rowIndex;
            break;
          }
        }
      }
    }

    // 3) Prefer dedicated comment row after the line (same path + line)
    if (rowIndex != null && line != null) {
      for (const row of virtualRows) {
        if (
          row.kind === 'inline-comment' &&
          row.filePath === c.path &&
          (row.newLine === line || row.oldLine === line) &&
          (c.id == null || String(row.commentId) === String(c.id))
        ) {
          rowIndex = row.rowIndex;
          break;
        }
      }
    }

    // 4) Collapsed file / no line row — jump to file header so nav still scrolls
    if (rowIndex == null && c.path) {
      for (const row of virtualRows) {
        if (row.kind === 'file-header' && row.filePath === c.path) {
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
export function nextCommentIndex(current, total, delta) {
  if (!total || total <= 0) return -1;
  if (current < 0) return delta >= 0 ? 0 : total - 1;
  return (current + delta + total) % total;
}

/**
 * @param {InlineComment[]} mappedComments comments with rowIndex
 * @param {number} commentIndex
 * @param {number} delta
 */
export function resolveCommentNav(mappedComments, commentIndex, delta) {
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
