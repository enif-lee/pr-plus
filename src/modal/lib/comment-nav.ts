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
 * Build path → index map from Diff file list order (top → bottom).
 * @param {Array<{ filename?: string, path?: string }>|string[]|null|undefined} filesOrPaths
 * @returns {Map<string, number>}
 */
export function buildPathOrderMap(filesOrPaths) {
  const map = new Map();
  if (!Array.isArray(filesOrPaths)) return map;
  let i = 0;
  for (const item of filesOrPaths) {
    const p =
      typeof item === 'string'
        ? item
        : item?.filename || item?.path || '';
    if (!p || map.has(p)) continue;
    map.set(p, i++);
  }
  return map;
}

/**
 * Sort comments for navigation: Diff file order (or path), then line, then id.
 * @param {InlineComment[]} comments
 * @param {Map<string, number>|Array<{filename?:string,path?:string}>|string[]|null} [pathOrder]
 * @returns {InlineComment[]}
 */
export function sortInlineComments(comments, pathOrder = null) {
  const list = Array.isArray(comments) ? comments.slice() : [];
  const order =
    pathOrder instanceof Map
      ? pathOrder
      : buildPathOrderMap(pathOrder);
  list.sort((a, b) => {
    const pa = a.path || '';
    const pb = b.path || '';
    if (pa !== pb) {
      if (order.size) {
        const ia = order.has(pa) ? order.get(pa) : Number.MAX_SAFE_INTEGER;
        const ib = order.has(pb) ? order.get(pb) : Number.MAX_SAFE_INTEGER;
        if (ia !== ib) return ia - ib;
      }
      return pa.localeCompare(pb);
    }
    const la = a.line == null ? Number.MAX_SAFE_INTEGER : Number(a.line);
    const lb = b.line == null ? Number.MAX_SAFE_INTEGER : Number(b.line);
    if (la !== lb) return la - lb;
    // LEFT (old) before RIGHT when same line number on different sides
    const sa = String(a.side || 'RIGHT').toUpperCase() === 'LEFT' ? 0 : 1;
    const sb = String(b.side || 'RIGHT').toUpperCase() === 'LEFT' ? 0 : 1;
    if (sa !== sb) return sa - sb;
    return String(a.id ?? '').localeCompare(String(b.id ?? ''));
  });
  return list;
}

/**
 * Thread roots only, sorted for Diff comment navigator.
 * @param {InlineComment[]} comments
 * @param {Map<string, number>|Array|null} [pathOrder]
 * @returns {InlineComment[]}
 */
export function sortThreadRootComments(comments, pathOrder = null) {
  return sortInlineComments(filterThreadRootComments(comments), pathOrder);
}

/**
 * After row mapping: order by visual Diff position (rowIndex top → bottom).
 * Unmapped comments fall back to path/line order.
 * @param {InlineComment[]} mapped
 * @param {Map<string, number>|Array|null} [pathOrder]
 */
export function sortMappedCommentsByDiffOrder(mapped, pathOrder = null) {
  const list = Array.isArray(mapped) ? mapped.slice() : [];
  const order =
    pathOrder instanceof Map
      ? pathOrder
      : buildPathOrderMap(pathOrder);
  list.sort((a, b) => {
    const ra = a?.rowIndex;
    const rb = b?.rowIndex;
    const aHas = typeof ra === 'number' && Number.isFinite(ra);
    const bHas = typeof rb === 'number' && Number.isFinite(rb);
    if (aHas && bHas && ra !== rb) return ra - rb;
    if (aHas && !bHas) return -1;
    if (bHas && !aHas) return 1;
    const pa = a?.path || '';
    const pb = b?.path || '';
    if (pa !== pb) {
      if (order.size) {
        const ia = order.has(pa) ? order.get(pa) : Number.MAX_SAFE_INTEGER;
        const ib = order.has(pb) ? order.get(pb) : Number.MAX_SAFE_INTEGER;
        if (ia !== ib) return ia - ib;
      }
      return pa.localeCompare(pb);
    }
    const la = a?.line == null ? Number.MAX_SAFE_INTEGER : Number(a.line);
    const lb = b?.line == null ? Number.MAX_SAFE_INTEGER : Number(b.line);
    if (la !== lb) return la - lb;
    return String(a?.id ?? '').localeCompare(String(b?.id ?? ''));
  });
  return list;
}

/**
 * True when a root comment (or any of its replies in `comments`) is pending.
 * @param {InlineComment} root
 * @param {InlineComment[]} comments
 */
function rootIsPending(root, comments) {
  if (!root) return false;
  if (root.pending) return true;
  const rootId = root.id != null ? String(root.id) : '';
  if (!rootId) return false;
  for (const c of Array.isArray(comments) ? comments : []) {
    if (!c || !c.pending) continue;
    const parentId = c.inReplyToId ?? c.in_reply_to_id ?? null;
    if (parentId != null && String(parentId) === rootId) return true;
  }
  return false;
}

/**
 * Filter thread **roots** for Diff review nav + inline placement.
 * - mode null: all roots
 * - 'unresolved': open submitted threads (not pending drafts)
 * - 'resolved': resolved roots
 * - 'pending': pending (unsubmitted) roots
 * - allowedPaths: when set, root.path must be in the set (file filters)
 *
 * @param {InlineComment[]} comments full list or roots
 * @param {null|'unresolved'|'resolved'|'pending'|'all'} [mode]
 * @param {Set<string>|string[]|null} [allowedPaths]
 * @returns {InlineComment[]}
 */
export function filterReviewRootsForNav(comments, mode = null, allowedPaths = null) {
  const list = Array.isArray(comments) ? comments : [];
  const roots = filterThreadRootComments(list);
  const pathSet =
    allowedPaths instanceof Set
      ? allowedPaths
      : allowedPaths
        ? new Set(Array.isArray(allowedPaths) ? allowedPaths : [])
        : null;
  const m = mode === 'all' ? null : mode;
  return roots.filter((c) => {
    if (!c) return false;
    const path = c.path || '';
    if (pathSet && !pathSet.has(path)) return false;
    const pending = rootIsPending(c, list);
    if (m === 'pending') return pending;
    if (m === 'unresolved') return !c.resolved && !pending;
    if (m === 'resolved') return Boolean(c.resolved);
    return true;
  });
}

/**
 * Keep roots that pass nav filters **and** their replies (for InlineThread).
 * @param {InlineComment[]} comments
 * @param {null|'unresolved'|'resolved'|'pending'|'all'} [mode]
 * @param {Set<string>|string[]|null} [allowedPaths]
 */
export function filterReviewCommentsForNav(comments, mode = null, allowedPaths = null) {
  const list = Array.isArray(comments) ? comments : [];
  const allowedRoots = filterReviewRootsForNav(list, mode, allowedPaths);
  const rootIds = new Set(
    allowedRoots.map((c) => (c && c.id != null ? String(c.id) : '')).filter(Boolean)
  );
  if (!rootIds.size) return [];
  const byId = new Map();
  for (const c of list) {
    if (c && c.id != null) byId.set(String(c.id), c);
  }
  return list.filter((c) => {
    if (!c || c.id == null) return false;
    if (rootIds.has(String(c.id))) return true;
    // Walk reply chain to a kept root
    let parentId = c.inReplyToId ?? c.in_reply_to_id ?? null;
    const seen = new Set();
    while (parentId != null && !seen.has(String(parentId))) {
      const key = String(parentId);
      if (rootIds.has(key)) return true;
      seen.add(key);
      const parent = byId.get(key);
      if (!parent) break;
      parentId = parent.inReplyToId ?? parent.in_reply_to_id ?? null;
    }
    return false;
  });
}

/**
 * One-pass indexes over virtual rows for comment → rowIndex lookup.
 * Avoids O(roots × rows) nested full scans in mapCommentsToRowIndices.
 *
 * @param {Array<{ kind: string, filePath?: string, newLine?: number|null, oldLine?: number|null, rowIndex?: number, commentId?: string|number }>} virtualRows
 */
export function buildCommentRowLookup(virtualRows: any) {
  /** @type {Map<string, number>} */
  const byCommentId = new Map();
  /** path\0LEFT|RIGHT\0line → first matching diff-line rowIndex */
  /** @type {Map<string, number>} */
  const byPathSideLine = new Map();
  /** path\0line → first diff-line with newLine or oldLine === line */
  /** @type {Map<string, number>} */
  const byPathEitherLine = new Map();
  /** path\0line\0commentId → inline-comment rowIndex (first in order) */
  /** @type {Map<string, number>} */
  const byPathLineCommentId = new Map();
  /** path\0line → first inline-comment on that path+line (id-agnostic) */
  /** @type {Map<string, number>} */
  const byPathLineAnyComment = new Map();
  /** path → file-header rowIndex */
  /** @type {Map<string, number>} */
  const fileHeaderByPath = new Map();

  const list = Array.isArray(virtualRows) ? virtualRows : [];
  for (const row of list) {
    if (!row || row.rowIndex == null) continue;
    const ri = Number(row.rowIndex);
    if (!Number.isFinite(ri)) continue;
    const path = row.filePath || '';
    const kind = row.kind;

    if (kind === 'file-header' && path && !fileHeaderByPath.has(path)) {
      fileHeaderByPath.set(path, ri);
    }

    if (kind === 'inline-comment') {
      if (row.commentId != null) {
        const idKey = String(row.commentId);
        if (!byCommentId.has(idKey)) byCommentId.set(idKey, ri);
      }
      const n = row.newLine != null ? Number(row.newLine) : null;
      const o = row.oldLine != null ? Number(row.oldLine) : null;
      const lines = new Set();
      if (n != null && Number.isFinite(n)) lines.add(n);
      if (o != null && Number.isFinite(o)) lines.add(o);
      for (const line of lines) {
        const pathLine = `${path}\0${line}`;
        if (!byPathLineAnyComment.has(pathLine)) {
          byPathLineAnyComment.set(pathLine, ri);
        }
        if (row.commentId != null) {
          const ck = `${path}\0${line}\0${String(row.commentId)}`;
          if (!byPathLineCommentId.has(ck)) byPathLineCommentId.set(ck, ri);
        }
      }
    }

    if (kind === 'diff-line' && path) {
      const n = row.newLine != null ? Number(row.newLine) : null;
      const o = row.oldLine != null ? Number(row.oldLine) : null;
      if (n != null && Number.isFinite(n)) {
        const rightKey = `${path}\0RIGHT\0${n}`;
        if (!byPathSideLine.has(rightKey)) byPathSideLine.set(rightKey, ri);
        const eitherKey = `${path}\0${n}`;
        if (!byPathEitherLine.has(eitherKey)) byPathEitherLine.set(eitherKey, ri);
      }
      if (o != null && Number.isFinite(o)) {
        const leftKey = `${path}\0LEFT\0${o}`;
        if (!byPathSideLine.has(leftKey)) byPathSideLine.set(leftKey, ri);
        const eitherKey = `${path}\0${o}`;
        if (!byPathEitherLine.has(eitherKey)) byPathEitherLine.set(eitherKey, ri);
      }
    }
  }

  return {
    byCommentId,
    byPathSideLine,
    byPathEitherLine,
    byPathLineCommentId,
    byPathLineAnyComment,
    fileHeaderByPath,
  };
}

/**
 * Attach rowIndex by matching virtual rows (filePath + newLine).
 * Expects **thread roots** (use sortThreadRootComments / filterThreadRootComments).
 * Result is ordered top → bottom in the Diff (by rowIndex, then file path order).
 *
 * Uses one-pass indexes (O(rows + roots)), not nested full scans per root.
 *
 * @param {InlineComment[]} comments
 * @param {Array<{ kind: string, filePath?: string, newLine?: number|null, rowIndex: number }>} virtualRows
 * @param {{ pathOrder?: Map<string, number>|Array|null }} [opts]
 */
export function mapCommentsToRowIndices(
  comments: any,
  virtualRows: any,
  opts: { pathOrder?: Map<string, number> | Array<unknown> | null } = {}
) {
  const pathOrder = opts?.pathOrder ?? null;
  const sorted = sortInlineComments(comments, pathOrder);
  if (!Array.isArray(virtualRows)) {
    return sortMappedCommentsByDiffOrder(
      sorted.map((c) => ({ ...c, rowIndex: undefined })),
      pathOrder
    );
  }
  const idx = buildCommentRowLookup(virtualRows);
  const mapped = sorted.map((c) => {
    const line =
      c.line != null
        ? Number(c.line)
        : c.originalLine != null
          ? Number(c.originalLine)
          : null;
    const side = String(c.side || 'RIGHT').toUpperCase() === 'LEFT' ? 'LEFT' : 'RIGHT';
    let rowIndex: number | undefined;

    // 1) Exact inline-comment row for this comment id
    if (c.id != null) {
      const hit = idx.byCommentId.get(String(c.id));
      if (hit != null) rowIndex = hit;
    }

    // 2) Diff line on the correct side (LEFT → oldLine, RIGHT → newLine)
    if (rowIndex == null && line != null && Number.isFinite(line)) {
      const path = c.path || '';
      const sideHit = idx.byPathSideLine.get(`${path}\0${side}\0${line}`);
      if (sideHit != null) rowIndex = sideHit;
      else {
        const either = idx.byPathEitherLine.get(`${path}\0${line}`);
        if (either != null) rowIndex = either;
      }
    }

    // 3) Prefer dedicated comment row after the line (same path + line)
    if (rowIndex != null && line != null && Number.isFinite(line)) {
      const path = c.path || '';
      if (c.id != null) {
        const ck = idx.byPathLineCommentId.get(
          `${path}\0${line}\0${String(c.id)}`
        );
        if (ck != null) rowIndex = ck;
      } else {
        const any = idx.byPathLineAnyComment.get(`${path}\0${line}`);
        if (any != null) rowIndex = any;
      }
    }

    // 4) Collapsed file / no line row — jump to file header so nav still scrolls
    if (rowIndex == null && c.path) {
      const header = idx.fileHeaderByPath.get(String(c.path));
      if (header != null) rowIndex = header;
    }

    return { ...c, rowIndex };
  });
  return sortMappedCommentsByDiffOrder(mapped, pathOrder);
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
