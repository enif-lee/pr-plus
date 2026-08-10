/** @module modal/lib/line-selection */
/**
 * Pure helpers for GitHub-style single- and multi-line diff selection
 * and review-comment payload shaping.
 */

export function isSelectableDiffRow(row) {
  if (!row || row.kind !== 'diff-line') return false;
  const t = row.lineType;
  // 'change' = split-mode paired del|add on one visual row
  if (t !== 'add' && t !== 'del' && t !== 'change' && t !== 'context') return false;
  // Prefer RIGHT (new) line; allow LEFT-only deletes
  return row.newLine != null || row.oldLine != null;
}

/** File header row — single-line caret can land here (file-level comment target). */
export function isFileHeaderRow(row: any): boolean {
  if (!row || row.kind !== 'file-header') return false;
  return Boolean(String(row.filePath || row.path || '').trim());
}

/** Inline review-thread row on Diff (plain ↑/↓ stop; not multi-line). */
export function isInlineCommentRow(row: any): boolean {
  if (!row || row.kind !== 'inline-comment') return false;
  return row.commentId != null && String(row.commentId).trim() !== '';
}

/**
 * Rows that plain ↑/↓ may land on: body lines, file headers, review threads.
 * Multi-line extend (shift) stays on **diff lines only**.
 */
export function isSelectionNavRow(row: any): boolean {
  return (
    isSelectableDiffRow(row) || isFileHeaderRow(row) || isInlineCommentRow(row)
  );
}

export function isFileLevelSelection(selection: any): boolean {
  return Boolean(
    selection &&
      (selection.kind === 'file' || selection.subjectType === 'file')
  );
}

export function isThreadSelection(selection: any): boolean {
  return Boolean(
    selection &&
      (selection.kind === 'thread' ||
        selection.subjectType === 'thread' ||
        selection.kind === 'inline-comment')
  );
}

/**
 * True for code-body line selection (single or multi).
 * File-header and review-thread carets are **not** code selections — they must
 * not steal ←/→ / ⌥F from thread fold (Diff ↑↓ lands on threads as `kind:thread`).
 */
export function isCodeBodySelection(selection: any): boolean {
  return Boolean(
    selection &&
      !isFileLevelSelection(selection) &&
      !isThreadSelection(selection)
  );
}

/** True when caret is a single line (not multi, not file/thread structural). */
export function isSingleLineCaretSelection(selection: any): boolean {
  if (!selection || isFileLevelSelection(selection) || isThreadSelection(selection)) {
    return false;
  }
  // Multi-line range is row-span based (sticky side may park head on a row
  // without the preferred side — still multi when indices differ).
  const aIdx = Number(selection.anchorRowIndex);
  const hIdx = Number(selection.headRowIndex);
  if (Number.isFinite(aIdx) && Number.isFinite(hIdx) && aIdx !== hIdx) {
    return false;
  }
  const a = Number(selection.anchorLine);
  const h = Number(selection.headLine);
  if (!Number.isFinite(a) || !Number.isFinite(h) || a !== h) return false;
  const aSide = String(selection.anchorSide || 'RIGHT').toUpperCase();
  const hSide = String(selection.headSide || 'RIGHT').toUpperCase();
  return aSide === hSide;
}

/** Multi-line body selection (row span or line span); not file/thread. */
export function isMultiLineBodySelection(selection: any): boolean {
  if (
    !selection ||
    isFileLevelSelection(selection) ||
    isThreadSelection(selection)
  ) {
    return false;
  }
  return !isSingleLineCaretSelection(selection);
}

/**
 * Begin caret selection on a nav row.
 * - diff-line → normal line selection
 * - file-header → file-level selection (`kind: 'file'`) for ⌥C file comments
 * - inline-comment → thread selection (`kind: 'thread'`) for ↑↓ + ⌥C reply
 */
/**
 * @param arrayIndex Prefer virtualRows array index when known (must match
 *   list position used by resolveSelectionHeadIndex). Falls back to row.rowIndex.
 */
export function beginSelectionOnRow(
  row: any,
  preferredSide: 'LEFT' | 'RIGHT' | string = 'RIGHT',
  arrayIndex?: number | null
) {
  const idxFromArg = Number(arrayIndex);
  const idxFromRow = Number(row?.rowIndex);
  const resolvedIdx = Number.isFinite(idxFromArg)
    ? idxFromArg
    : Number.isFinite(idxFromRow)
      ? idxFromRow
      : null;
  if (isFileHeaderRow(row)) {
    const path = String(row.filePath || row.path || '').trim();
    if (!path) return null;
    return {
      kind: 'file' as const,
      subjectType: 'file' as const,
      filePath: path,
      anchorRowIndex: resolvedIdx,
      headRowIndex: resolvedIdx,
    };
  }
  if (isInlineCommentRow(row)) {
    const path = String(row.filePath || row.path || '').trim();
    const commentId = row.commentId;
    if (!path || commentId == null) return null;
    const side =
      String(row.side || 'RIGHT').toUpperCase() === 'LEFT' ? 'LEFT' : 'RIGHT';
    const line =
      row.newLine != null
        ? Number(row.newLine)
        : row.oldLine != null
          ? Number(row.oldLine)
          : null;
    return {
      kind: 'thread' as const,
      subjectType: 'thread' as const,
      filePath: path,
      commentId,
      anchorRowIndex: resolvedIdx,
      headRowIndex: resolvedIdx,
      headSide: side,
      anchorSide: side,
      headLine: line,
      anchorLine: line,
    };
  }
  return beginLineSelection(row, preferredSide, resolvedIdx);
}

export function lineForSide(row, preferredSide = 'RIGHT') {
  if (!row) return null;
  if (preferredSide === 'LEFT') {
    if (row.oldLine != null) return { line: Number(row.oldLine), side: 'LEFT' };
    if (row.newLine != null) return { line: Number(row.newLine), side: 'RIGHT' };
    return null;
  }
  if (row.newLine != null) return { line: Number(row.newLine), side: 'RIGHT' };
  if (row.oldLine != null) return { line: Number(row.oldLine), side: 'LEFT' };
  return null;
}

/**
 * Active selection side for split-view chrome (mark + action dock).
 * Sticky to head, then anchor; default RIGHT.
 */
export function selectionActiveSide(selection: any): 'LEFT' | 'RIGHT' {
  const s = String(
    selection?.headSide || selection?.anchorSide || 'RIGHT'
  )
    .trim()
    .toUpperCase();
  return s === 'LEFT' ? 'LEFT' : 'RIGHT';
}

/**
 * Line on a row for a preferred side only (no cross-side fallback).
 * Used when extending multi-line selection so LEFT drag does not flip to RIGHT.
 */
export function lineForSideStrict(
  row: any,
  preferredSide: 'LEFT' | 'RIGHT' | string = 'RIGHT'
): { line: number; side: 'LEFT' | 'RIGHT' } | null {
  if (!row) return null;
  const prefer =
    String(preferredSide || 'RIGHT').toUpperCase() === 'LEFT' ? 'LEFT' : 'RIGHT';
  if (prefer === 'LEFT') {
    if (row.oldLine == null) return null;
    return { line: Number(row.oldLine), side: 'LEFT' };
  }
  if (row.newLine == null) return null;
  return { line: Number(row.newLine), side: 'RIGHT' };
}

/**
 * Start a selection on a selectable diff row.
 * @param {object} row
 * @param {'LEFT'|'RIGHT'} [preferredSide='RIGHT'] split pane click prefers that side
 * @returns {object|null}
 */
export function beginLineSelection(
  row,
  preferredSide = 'RIGHT',
  arrayIndex?: number | null
) {
  if (!isSelectableDiffRow(row)) return null;
  const prefer =
    String(preferredSide || 'RIGHT').toUpperCase() === 'LEFT' ? 'LEFT' : 'RIGHT';
  const pos = lineForSide(row, prefer);
  if (!pos) return null;
  const idxFromArg = Number(arrayIndex);
  const idx = Number.isFinite(idxFromArg)
    ? idxFromArg
    : Number(row.rowIndex);
  return {
    filePath: row.filePath,
    anchorLine: pos.line,
    headLine: pos.line,
    anchorSide: pos.side,
    headSide: pos.side,
    anchorRowIndex: Number.isFinite(idx) ? idx : row.rowIndex,
    headRowIndex: Number.isFinite(idx) ? idx : row.rowIndex,
  };
}

/**
 * Parse Goto query: `path:line`, `path:line:line`, `line`, or `line:line`.
 * Bare line forms leave path null (caller uses current file).
 * Parses line numbers from the right so paths with colons stay intact.
 */
export function parseGotoQuery(raw: unknown): {
  path: string | null;
  startLine: number;
  endLine: number | null;
} | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;

  const parts = s.split(':');
  if (parts.length === 1) {
    if (/^\d+$/.test(parts[0])) {
      const startLine = Number(parts[0]);
      if (!Number.isFinite(startLine) || startLine < 1) return null;
      return { path: null, startLine, endLine: null };
    }
    // Bare path (Diff Goto file pick) — jump to file top (line 1)
    const pathOnly = parts[0].trim();
    if (!pathOnly) return null;
    return { path: pathOnly, startLine: 1, endLine: null };
  }

  const last = parts[parts.length - 1];
  if (!/^\d+$/.test(last)) return null;
  const lastN = Number(last);
  if (!Number.isFinite(lastN) || lastN < 1) return null;

  const secondLast = parts[parts.length - 2];
  if (/^\d+$/.test(secondLast)) {
    const secondN = Number(secondLast);
    if (!Number.isFinite(secondN) || secondN < 1) return null;
    if (parts.length === 2) {
      // line:line
      return {
        path: null,
        startLine: secondN,
        endLine: lastN !== secondN ? lastN : null,
      };
    }
    // path:line:line
    const path = parts.slice(0, -2).join(':').trim();
    if (!path) return null;
    return {
      path,
      startLine: secondN,
      endLine: lastN !== secondN ? lastN : null,
    };
  }

  // path:line
  const path = parts.slice(0, -1).join(':').trim();
  if (!path) return null;
  return { path, startLine: lastN, endLine: null };
}

/**
 * Find a selectable diff-line row for path + line (prefer RIGHT/newLine).
 */
export function findSelectableRowForLine(
  virtualRows: any[] | null | undefined,
  filePath: unknown,
  line: unknown,
  preferredSide = 'RIGHT'
) {
  const list = Array.isArray(virtualRows) ? virtualRows : [];
  const path = String(filePath || '').trim();
  const ln = Number(line);
  if (!path || !Number.isFinite(ln) || ln < 1) return null;
  const preferLeft = preferredSide === 'LEFT';
  let fallback = null;
  for (const row of list) {
    if (!row || row.filePath !== path || !isSelectableDiffRow(row)) continue;
    if (preferLeft) {
      if (row.oldLine != null && Number(row.oldLine) === ln) return row;
      if (row.newLine != null && Number(row.newLine) === ln) fallback = fallback || row;
    } else {
      if (row.newLine != null && Number(row.newLine) === ln) return row;
      if (row.oldLine != null && Number(row.oldLine) === ln) fallback = fallback || row;
    }
  }
  return fallback;
}

/**
 * Build selection from path + start/end lines using virtual rows.
 * Single line when endLine is null or equals startLine.
 */
export function selectionFromGoto(
  virtualRows: any[] | null | undefined,
  filePath: unknown,
  startLine: unknown,
  endLine: unknown = null
) {
  const startRow = findSelectableRowForLine(virtualRows, filePath, startLine, 'RIGHT');
  if (!startRow) return null;
  const endLn =
    endLine == null || endLine === '' ? null : Number(endLine);
  if (endLn == null || !Number.isFinite(endLn) || endLn === Number(startLine)) {
    return beginLineSelection(startRow);
  }
  const endRow = findSelectableRowForLine(virtualRows, filePath, endLn, 'RIGHT');
  if (!endRow) return beginLineSelection(startRow);
  const started = beginLineSelection(startRow);
  return extendLineSelection(started, endRow) || started;
}

/**
 * Whether a file is still collapsed in the virtual list (only header / collapsed flag).
 * Used by Goto to wait for expand before selecting lines.
 */
export function isFileCollapsedInVirtualRows(
  virtualRows: any[] | null | undefined,
  filePath: unknown
): boolean {
  const path = String(filePath || '').trim();
  if (!path) return false;
  const list = Array.isArray(virtualRows) ? virtualRows : [];
  const header = list.find(
    (r) =>
      r &&
      r.kind === 'file-header' &&
      (r.filePath === path || r.path === path)
  );
  if (header && header.collapsed) return true;
  // Collapsed files often omit body rows — only a single file-header for that path
  const pathRows = list.filter(
    (r) => r && (r.filePath === path || r.path === path)
  );
  if (
    pathRows.length === 1 &&
    pathRows[0].kind === 'file-header'
  ) {
    return true;
  }
  return false;
}

/**
 * Resolve a pending Goto against current virtual rows.
 * - ready: selection can be applied now
 * - waiting: file still collapsed / rows not rebuilt yet
 * - missing: expanded (or no collapse signal) but line not found
 */
export function resolvePendingGotoSelection(
  virtualRows: any[] | null | undefined,
  pending: {
    path?: unknown;
    startLine?: unknown;
    endLine?: unknown;
  } | null
):
  | { status: 'idle' }
  | { status: 'ready'; selection: any }
  | { status: 'waiting' }
  | { status: 'missing' } {
  if (!pending || !String(pending.path || '').trim()) return { status: 'idle' };
  const path = String(pending.path).trim();
  const sel = selectionFromGoto(
    virtualRows,
    path,
    pending.startLine,
    pending.endLine
  );
  if (sel) return { status: 'ready', selection: sel };
  if (isFileCollapsedInVirtualRows(virtualRows, path)) {
    return { status: 'waiting' };
  }
  return { status: 'missing' };
}

/**
 * Resolve Goto path against a file list (exact, then suffix match).
 * Empty path → activePath.
 */
export function resolveGotoPathAmongFiles(
  queryPath: unknown,
  activePath: unknown,
  files: any[] | null | undefined
): string | null {
  let path = String(queryPath || '').trim();
  if (!path) {
    path = String(activePath || '').trim();
    return path || null;
  }
  const list = Array.isArray(files) ? files : [];
  const exact = list.find((f) => {
    const p = String(f?.filename || f?.path || '').trim();
    return p === path;
  });
  if (exact) return String(exact.filename || exact.path || path).trim();
  const suffix = list.find((f) => {
    const p = String(f?.filename || f?.path || '');
    return p === path || p.endsWith('/' + path) || p.endsWith(path);
  });
  if (suffix) return String(suffix.filename || suffix.path || path).trim();
  // Allow navigating even if not in filtered list (path as typed)
  return path;
}

/**
 * First selectable **diff-line** for a file in virtual order (top of file body).
 * Does **not** include file-level review threads — use firstContentNavRowInFile
 * for ↑/↓ seed that matches scroll order under the header.
 */
export function firstSelectableRowInFile(
  virtualRows: any[] | null | undefined,
  filePath: string | null | undefined
) {
  const path = String(filePath || '').trim();
  if (!path) return null;
  const list = Array.isArray(virtualRows) ? virtualRows : [];
  for (let i = 0; i < list.length; i++) {
    const row = list[i];
    if (row && row.filePath === path && isSelectableDiffRow(row)) return row;
  }
  return null;
}

/** First selectable diff-line in the virtual list (any file). */
export function firstSelectableRowAnywhere(
  virtualRows: any[] | null | undefined
) {
  const list = Array.isArray(virtualRows) ? virtualRows : [];
  for (let i = 0; i < list.length; i++) {
    const row = list[i];
    if (row && isSelectableDiffRow(row)) return row;
  }
  return null;
}

/** Last selectable diff-line for a file (bottom of file body). */
export function lastSelectableRowInFile(
  virtualRows: any[] | null | undefined,
  filePath: string | null | undefined
) {
  const path = String(filePath || '').trim();
  if (!path) return null;
  const list = Array.isArray(virtualRows) ? virtualRows : [];
  for (let i = list.length - 1; i >= 0; i--) {
    const row = list[i];
    if (row && row.filePath === path && isSelectableDiffRow(row)) return row;
  }
  return null;
}

/**
 * First ↑/↓ **content** stop for a file in virtual list order (under header):
 * file-level review threads, then line threads / body lines as laid out.
 * Skips the file-header so the first Down lands on the first visible content
 * stop — not always the first diff line.
 */
export function firstContentNavRowInFile(
  virtualRows: any[] | null | undefined,
  filePath: string | null | undefined
) {
  const path = String(filePath || '').trim();
  if (!path) return null;
  const list = Array.isArray(virtualRows) ? virtualRows : [];
  for (let i = 0; i < list.length; i++) {
    const row = list[i];
    if (!row || row.filePath !== path) continue;
    if (isFileHeaderRow(row)) continue;
    if (isInlineCommentRow(row) || isSelectableDiffRow(row)) return row;
  }
  return null;
}

/** Last content nav stop for a file (threads + body lines, reverse order). */
export function lastContentNavRowInFile(
  virtualRows: any[] | null | undefined,
  filePath: string | null | undefined
) {
  const path = String(filePath || '').trim();
  if (!path) return null;
  const list = Array.isArray(virtualRows) ? virtualRows : [];
  for (let i = list.length - 1; i >= 0; i--) {
    const row = list[i];
    if (!row || row.filePath !== path) continue;
    if (isFileHeaderRow(row)) continue;
    if (isInlineCommentRow(row) || isSelectableDiffRow(row)) return row;
  }
  return null;
}

/**
 * First content nav stop anywhere in the list (any file), visual order.
 * Skips file headers; falls back to first header if the list is header-only.
 */
export function firstContentNavRowAnywhere(
  virtualRows: any[] | null | undefined
) {
  const list = Array.isArray(virtualRows) ? virtualRows : [];
  for (let i = 0; i < list.length; i++) {
    const row = list[i];
    if (!row) continue;
    if (isFileHeaderRow(row)) continue;
    if (isInlineCommentRow(row) || isSelectableDiffRow(row)) return row;
  }
  for (let i = 0; i < list.length; i++) {
    if (isFileHeaderRow(list[i])) return list[i];
  }
  return null;
}

/**
 * Whether keyboard nav must place a fresh caret before stepping.
 *
 * Important: do **not** reseed solely because `activeFilePath` lags the
 * selection path. Under key-hold, selection crosses files in the same rAF
 * batch while tree `activeFilePath` still points at the previous file; reseeding
 * to that file's first line makes the caret jump **up** (reported on large
 * Diffs like #14). Tree file clicks clear selection via onSelectFile, so they
 * still seed cleanly when selection is null.
 */
export function selectionNeedsSeed(
  selection: any,
  _activeFilePath: string
): boolean {
  if (!selection) return true;
  // Structural carets (file header / thread) with identity are valid stops
  if (isFileLevelSelection(selection) || isThreadSelection(selection)) {
    if (!String(selection.filePath || '').trim()) return true;
    if (isThreadSelection(selection) && selection.commentId == null) return true;
    return false;
  }
  // Line carets: path+line identity is enough even if headRowIndex is stale
  if (
    String(selection.filePath || '').trim() &&
    Number.isFinite(Number(selection.headLine))
  ) {
    return false;
  }
  // File-level-ish without headLine: path + row index is enough
  if (
    String(selection.filePath || '').trim() &&
    Number.isFinite(Number(selection.headRowIndex))
  ) {
    return false;
  }
  if (!Number.isFinite(Number(selection.headRowIndex))) return true;
  return true;
}

/** Find inline-comment row index by commentId. */
export function findRowIndexForCommentId(
  virtualRows: any[] | null | undefined,
  commentId: unknown
): number | null {
  if (commentId == null) return null;
  const want = String(commentId);
  const list = Array.isArray(virtualRows) ? virtualRows : [];
  for (let i = 0; i < list.length; i++) {
    const row = list[i];
    if (!isInlineCommentRow(row)) continue;
    if (String(row.commentId) !== want) continue;
    const idx = Number(row.rowIndex);
    return Number.isFinite(idx) ? idx : i;
  }
  return null;
}

/**
 * Resolve a stable head index for keyboard nav. Prefers live headRowIndex when
 * it still points at the same identity; otherwise rebinds by line / commentId /
 * header so comment-row renumbering cannot stall ↑↓.
 */
export function resolveSelectionHeadIndex(
  selection: any,
  list: any[]
): number {
  if (!selection || !Array.isArray(list) || !list.length) return -1;
  const path = String(selection.filePath || '').trim();
  const headIdx = Number(selection.headRowIndex);

  if (isThreadSelection(selection)) {
    const byId = findRowIndexForCommentId(list, selection.commentId);
    if (byId != null) return byId;
  }

  if (Number.isFinite(headIdx) && headIdx >= 0 && headIdx < list.length) {
    const row = list[headIdx];
    if (row && isSelectionNavRow(row)) {
      const rp = String(row.filePath || row.path || '');
      if (!path || rp === path) {
        if (isFileLevelSelection(selection) && isFileHeaderRow(row)) {
          return headIdx;
        }
        if (
          isThreadSelection(selection) &&
          isInlineCommentRow(row) &&
          String(row.commentId) === String(selection.commentId)
        ) {
          return headIdx;
        }
        if (
          !isFileLevelSelection(selection) &&
          !isThreadSelection(selection) &&
          isSelectableDiffRow(row)
        ) {
          // Sticky multi-select may park head on a row without preferred side
          // (del-only while selecting RIGHT, or add-only while selecting LEFT).
          // Trust live headRowIndex so Shift+↑/↓ can leave that block (mouse drag
          // already does via continuous headRowIndex updates).
          if (
            !Number.isFinite(Number(selection.headLine)) ||
            rowMatchesLineSide(
              row,
              selection.headLine,
              selection.headSide || selection.anchorSide
            ) ||
            isMultiLineBodySelection(selection)
          ) {
            return headIdx;
          }
        }
      }
    }
  }
  // Stale after comment insert / fold — rebind by line, then header pivot
  // (skip rebind for multi-line: head may intentionally not match preferred side)
  if (
    path &&
    !isFileLevelSelection(selection) &&
    !isThreadSelection(selection) &&
    !isMultiLineBodySelection(selection)
  ) {
    const byLine = findRowIndexForLineSide(
      list,
      path,
      selection.headLine,
      selection.headSide || selection.anchorSide
    );
    if (byLine != null) return byLine;
  }
  if (path && isFileLevelSelection(selection)) {
    const pivot = filePivotIndexInVirtualRows(list, path);
    if (pivot >= 0) return pivot;
  }
  if (path) {
    const pivot = filePivotIndexInVirtualRows(list, path);
    if (pivot >= 0) return pivot;
  }
  return Number.isFinite(headIdx) ? headIdx : -1;
}

/**
 * Find the N-th nav row in direction `d` from head (single pass).
 * - shift: stay in same file, **diff lines only** (no headers in multi-line)
 * - plain: file headers + diff lines; may cross files
 * @returns target row or null if none
 */
/**
 * Find the N-th nav row in direction `d` from head (single pass).
 * @returns {{ row: any, arrayIndex: number } | null}
 */
function findNavRowNSteps(
  selection: any,
  list: any[],
  d: number,
  steps: number,
  opts: { shift?: boolean } = {}
): { row: any; arrayIndex: number } | null {
  if (!selection) return null;
  // Multi-line extend never starts from file-header / thread carets
  if (
    opts.shift &&
    (isFileLevelSelection(selection) || isThreadSelection(selection))
  ) {
    return null;
  }
  const headIdx = resolveSelectionHeadIndex(selection, list);
  if (headIdx < 0) return null;
  const path = String(selection.filePath || '');
  const sameFileOnly = Boolean(opts.shift);
  const need = Math.max(1, Math.floor(steps) || 1);
  let found = 0;
  let last: any = null;
  let lastI = -1;
  let i = headIdx + d;
  while (i >= 0 && i < list.length && found < need) {
    const row = list[i];
    if (!row) {
      i += d;
      continue;
    }
    if (sameFileOnly) {
      if (row.filePath && row.filePath !== path) break;
      if (row.kind === 'file-header' && row.filePath && row.filePath !== path) {
        break;
      }
      // Shift / multi-line: body lines only (no headers, no threads)
      if (isSelectableDiffRow(row) && row.filePath === path) {
        found += 1;
        last = row;
        lastI = i;
      }
    } else if (isSelectionNavRow(row)) {
      found += 1;
      last = row;
      lastI = i;
    }
    i += d;
  }
  if (!last || lastI < 0) return null;
  return { row: last, arrayIndex: lastI };
}

/**
 * Virtual-list index of a path's structural pivot (file-header preferred).
 * Used when the body is collapsed so ↑↓ can hop to a neighbor file.
 */
export function filePivotIndexInVirtualRows(
  virtualRows: any[] | null | undefined,
  filePath: string | null | undefined
): number {
  const path = String(filePath || '').trim();
  if (!path) return -1;
  const list = Array.isArray(virtualRows) ? virtualRows : [];
  let headerIdx = -1;
  let anyIdx = -1;
  for (let i = 0; i < list.length; i++) {
    const row = list[i];
    if (!row) continue;
    const rp = String(row.filePath || row.path || '');
    if (rp !== path) continue;
    if (anyIdx < 0) anyIdx = i;
    if (row.kind === 'file-header') headerIdx = i;
  }
  return headerIdx >= 0 ? headerIdx : anyIdx;
}

/**
 * Nearest plain-nav stop in direction `delta` from a path's pivot.
 * Includes file headers (folded files) and body lines.
 */
export function nearestSelectableFromPath(
  virtualRows: any[] | null | undefined,
  filePath: string | null | undefined,
  delta: number
) {
  const list = Array.isArray(virtualRows) ? virtualRows : [];
  if (!list.length) return null;
  const d = delta < 0 ? -1 : 1;
  let pivot = filePivotIndexInVirtualRows(list, filePath);
  if (pivot < 0) {
    // Path not in list — scan from list edge so a stuck selection can still leave.
    pivot = d > 0 ? -1 : list.length;
  }
  let i = pivot + d;
  while (i >= 0 && i < list.length) {
    const row = list[i];
    if (row && isSelectionNavRow(row)) return row;
    i += d;
  }
  return null;
}

/**
 * File-header row for a path, if present in the virtual list.
 */
export function fileHeaderRowInVirtualRows(
  virtualRows: any[] | null | undefined,
  filePath: string | null | undefined
) {
  const idx = filePivotIndexInVirtualRows(virtualRows, filePath);
  if (idx < 0) return null;
  const list = Array.isArray(virtualRows) ? virtualRows : [];
  const row = list[idx];
  return isFileHeaderRow(row) ? row : null;
}

/**
 * Coalesce rAF-batched selection keyboard deltas.
 *
 * Same-direction repeats sum (key-hold). **Opposite direction discards residual
 * stack and keeps only the latest intent** — otherwise holding ↓ then tapping ↑
 * still nets a positive delta and the caret keeps moving down (invert bug).
 *
 * @returns next pending `{ delta, shift }` (delta may be 0 if cancelled)
 */
export function coalesceSelectionMoveDelta(
  pending: { delta: number; shift: boolean } | null | undefined,
  nextDelta: number,
  nextShift: boolean
): { delta: number; shift: boolean } {
  const nd = Number(nextDelta) || 0;
  const ns = Boolean(nextShift);
  if (!pending || pending.shift !== ns) {
    return { delta: nd, shift: ns };
  }
  const pd = Number(pending.delta) || 0;
  // Direction change: drop residual opposite stack
  if (pd !== 0 && nd !== 0 && Math.sign(pd) !== Math.sign(nd)) {
    return { delta: nd, shift: ns };
  }
  return { delta: pd + nd, shift: ns };
}

/**
 * Move or extend an active line selection by nav rows.
 * - shift=false → single-line caret; visits **file headers**, review threads, body lines;
 *   continues into next/prev file at EOF/BOF
 * - shift=true → multi-line extend; body lines only; blocked at file boundary
 * - no selection → seed first **content** stop in scroll order (file-level review
 *   thread before first line when present; header only if file is empty/folded)
 * - folded file: only the header is selectable; ↑/↓ → prev last line / next header|line
 * - |delta| > 1: **one scan** to the N-th stop (key-hold / ⌥↑↓ coalesce)
 */
export function moveLineSelection(
  selection: any,
  virtualRows: any[] | null | undefined,
  delta: number,
  opts: { shift?: boolean; activeFilePath?: string | null } = {}
) {
  const list = Array.isArray(virtualRows) ? virtualRows : [];
  if (!list.length) return selection;

  const d = delta < 0 ? -1 : 1;
  let steps = Math.max(1, Math.abs(Number(delta)) || 1);
  // Cap extreme key-hold coalesces so a frame stays cheap
  if (steps > 48) steps = 48;
  const activePath = String(opts.activeFilePath || '').trim();
  let cur = selection;

  if (selectionNeedsSeed(cur, activePath)) {
    const seedPath = activePath || String(cur?.filePath || '').trim();
    // Scroll order under header: file-level threads → lines (not body-line only).
    let seedRow =
      seedPath && typeof firstContentNavRowInFile === 'function'
        ? firstContentNavRowInFile(list, seedPath)
        : null;
    if (!seedRow && seedPath) {
      seedRow = fileHeaderRowInVirtualRows(list, seedPath);
    }
    // Still nothing (path missing): nearest nav stop in move direction
    if (!seedRow && seedPath && !opts.shift) {
      seedRow = nearestSelectableFromPath(list, seedPath, d);
    }
    if (!seedRow) {
      seedRow =
        typeof firstContentNavRowAnywhere === 'function'
          ? firstContentNavRowAnywhere(list)
          : typeof firstSelectableRowAnywhere === 'function'
            ? firstSelectableRowAnywhere(list)
            : null;
    }
    // Ultimate fallback: first file header in the list
    if (!seedRow) {
      for (const row of list) {
        if (isFileHeaderRow(row)) {
          seedRow = row;
          break;
        }
      }
    }
    if (!seedRow) return selection;
    {
      const seedIdx = list.indexOf(seedRow);
      cur =
        beginSelectionOnRow(
          seedRow,
          'RIGHT',
          seedIdx >= 0 ? seedIdx : null
        ) || selection;
    }
    steps -= 1; // this keypress only placed the caret
  }

  if (!cur) return cur;
  if (steps <= 0) return cur;

  // Line selection on a folded/empty body: re-pin caret onto the file header
  // so subsequent steps leave via header navigation (not a stale head index).
  const curPath = String(cur.filePath || '').trim();
  if (
    !opts.shift &&
    curPath &&
    !isFileLevelSelection(cur) &&
    !isThreadSelection(cur) &&
    !firstSelectableRowInFile(list, curPath)
  ) {
    const header = fileHeaderRowInVirtualRows(list, curPath);
    if (header) {
      const hIdx = list.indexOf(header);
      cur =
        beginSelectionOnRow(header, 'RIGHT', hIdx >= 0 ? hIdx : null) || cur;
      // Don't consume a step — user asked to leave the folded file
    }
  }

  const found = findNavRowNSteps(cur, list, d, steps, opts);
  if (!found) return cur;
  const target = found.row;
  const arrIdx = found.arrayIndex;
  // Same stop (line / header / thread) — no-op (compare array index)
  const sameStop =
    Number(arrIdx) === Number(cur.headRowIndex) &&
    String(target.filePath || target.path || '') ===
      String(cur.filePath || '') &&
    (!isInlineCommentRow(target) ||
      String(target.commentId) === String(cur.commentId || ''));
  if (sameStop) return cur;

  if (opts.shift) {
    if (
      isFileLevelSelection(cur) ||
      isThreadSelection(cur) ||
      isFileHeaderRow(target) ||
      isInlineCommentRow(target)
    ) {
      return cur;
    }
    // extendLineSelection still uses row.rowIndex fields on the row object —
    // stamp array index so multi-line range stays array-based
    const stamped = { ...target, rowIndex: arrIdx };
    return extendLineSelection(cur, stamped) || cur;
  }
  return beginSelectionOnRow(target, 'RIGHT', arrIdx) || cur;
}

/**
 * Whether a keyboard move was stuck at a file edge (for single-file mode hop).
 * - ↓ edge: last body line, or file-header when the file has no body (folded)
 * - ↑ edge: file-header caret (first body line can still step up onto the header)
 */
export function isSelectionAtFileEdge(
  selection: any,
  virtualRows: any[] | null | undefined,
  delta: number
): boolean {
  if (!selection) return false;
  const list = Array.isArray(virtualRows) ? virtualRows : [];
  if (!list.length) return false;
  const path = String(selection.filePath || '');
  const headIdx = resolveSelectionHeadIndex(selection, list);
  if (!path || headIdx < 0) return false;
  const d = delta < 0 ? -1 : 1;
  // Next plain nav stop outside this path? if none in-file → edge
  const next = findNavRowNSteps(selection, list, d, 1, { shift: false });
  if (!next) return true;
  const nextPath = String(next.row.filePath || next.row.path || '');
  return nextPath !== path;
}

/**
 * Legacy idle delay (no longer auto-shows the action group).
 * Kept for tests / callers that still wait a settle frame after selection.
 */
export const SELECTION_ACTIONS_REVEAL_MS = 300;

/**
 * Which island phase a selection *supports* after settle (not whether to show).
 * - line + **file** header → `actions` (Comment / Copy code / Copy URL / Dismiss)
 * - thread caret → no line island (`hidden`)
 * Explicit open-comment paths (⌥C / onFileHeaderComment) set `comment` themselves.
 */
export function resolveSelectionIslandRevealPhase(
  selection: any
): 'actions' | 'hidden' {
  if (!selection) return 'hidden';
  if (isThreadSelection(selection)) return 'hidden';
  // File-level and line-level both support the action group
  return 'actions';
}

/**
 * Whether the selection **action group** (or comment island) should be mounted.
 *
 * Product: selection alone does **not** show the dock. Reveal only when:
 * - Opt is held, or
 * - pointer is over the selection / dock (hover), or
 * - user is already in **comment** phase (keep until dismiss/submit).
 * Hide while actively dragging a selection.
 */
export function shouldShowSelectionActionGroup(opts: {
  hasLineOrFileSelection?: boolean;
  selecting?: boolean;
  optHeld?: boolean;
  hoverReveal?: boolean;
  /** 'comment' keeps island open without Opt/hover */
  phase?: 'actions' | 'comment' | string | null;
} = {}): boolean {
  if (!opts.hasLineOrFileSelection) return false;
  if (opts.selecting) return false;
  if (String(opts.phase || '') === 'comment') return true;
  return Boolean(opts.optHeld || opts.hoverReveal);
}

/**
 * Prefer docking the selection UI **below** the host row; flip **above** when
 * the scroller/viewport has too little room under the selection (comment form
 * was fully clipped at the bottom of Diff).
 *
 * Pure geometry — used by SelectionCommentBar layout effect.
 */
export function resolveSelectionDockVerticalPlacement(opts: {
  /** Host row bottom (viewport coords) */
  hostBottom?: number;
  /** Host row top */
  hostTop?: number;
  /** Measured dock height (comment island ~160–220; actions ~40) */
  dockHeight?: number;
  /** Clip rect top (scroller or viewport) */
  clipTop?: number;
  /** Clip rect bottom */
  clipBottom?: number;
  gap?: number;
  /**
   * Minimum free space below to keep below placement. Defaults to dockHeight
   * (or 120 when unmeasured).
   */
  minBelow?: number;
} = {}): 'below' | 'above' {
  const gap = Number.isFinite(Number(opts.gap)) ? Math.max(0, Number(opts.gap)) : 8;
  const hostBottom = Number(opts.hostBottom);
  const hostTop = Number(opts.hostTop);
  const clipTop = Number(opts.clipTop);
  const clipBottom = Number(opts.clipBottom);
  if (
    !Number.isFinite(hostBottom) ||
    !Number.isFinite(hostTop) ||
    !Number.isFinite(clipTop) ||
    !Number.isFinite(clipBottom)
  ) {
    return 'below';
  }
  const dockH = Math.max(0, Number(opts.dockHeight) || 0);
  const need = Math.max(
    dockH > 0 ? dockH : 0,
    Number.isFinite(Number(opts.minBelow)) ? Number(opts.minBelow) : dockH > 0 ? dockH : 120
  );
  const spaceBelow = clipBottom - hostBottom - gap;
  const spaceAbove = hostTop - clipTop - gap;
  if (spaceBelow >= need) return 'below';
  // Prefer the side with more room when below is tight
  if (spaceAbove > spaceBelow && spaceAbove >= 48) return 'above';
  if (spaceBelow < 48 && spaceAbove >= spaceBelow) return 'above';
  return 'below';
}

/**
 * Changed body line (add/del/change) — not context.
 * Contiguous runs form "change regions" for ⌥↑/⌥↓ navigation.
 */
export function isChangedDiffLineRow(row: any): boolean {
  if (!isSelectableDiffRow(row)) return false;
  const t = String(row.lineType || '');
  return t === 'add' || t === 'del' || t === 'change';
}

/**
 * List of change regions in virtual-row order.
 * A region is a maximal contiguous run of changed lines (array index ±1).
 * Context / hunk headers / file headers / comments break the run.
 *
 * Prefer {@link buildChangeRegionIndex} + hop APIs under key-hold: this is O(n)
 * and must not run on every ⌥↑/⌥↓ event for large Diff lists.
 */
export function listChangeRegions(list: any[]): Array<{
  startIndex: number;
  endIndex: number;
  firstRow: any;
}> {
  const index = buildChangeRegionIndex(list);
  const rows = Array.isArray(list) ? list : [];
  const out: Array<{ startIndex: number; endIndex: number; firstRow: any }> =
    [];
  for (let i = 0; i < index.starts.length; i++) {
    const startIndex = index.starts[i];
    out.push({
      startIndex,
      endIndex: index.ends[i],
      firstRow: rows[startIndex],
    });
  }
  return out;
}

/**
 * Compact in-memory index of change-region starts/ends for O(log R) hops.
 * Built once per virtual-row generation; hop must not re-scan all rows.
 */
export type ChangeRegionIndex = {
  /** Array index of first changed line in each region (sorted ascending). */
  starts: number[];
  /** Array index of last changed line in each region. */
  ends: number[];
  /** `list.length` when built — invalidates when rows are replaced/resized. */
  listLength: number;
  /** Region count. */
  regionCount: number;
};

/**
 * Single O(n) pass over virtual rows → region start/end arrays.
 * @param {any[]} list
 * @returns {ChangeRegionIndex}
 */
export function buildChangeRegionIndex(list: any[]): ChangeRegionIndex {
  const rows = Array.isArray(list) ? list : [];
  const starts: number[] = [];
  const ends: number[] = [];
  let start = -1;
  let end = -1;
  for (let i = 0; i < rows.length; i++) {
    if (!isChangedDiffLineRow(rows[i])) {
      if (start >= 0) {
        starts.push(start);
        ends.push(end);
        start = -1;
        end = -1;
      }
      continue;
    }
    if (start < 0) {
      start = i;
      end = i;
    } else if (i === end + 1) {
      end = i;
    } else {
      starts.push(start);
      ends.push(end);
      start = i;
      end = i;
    }
  }
  if (start >= 0) {
    starts.push(start);
    ends.push(end);
  }
  return {
    starts,
    ends,
    listLength: rows.length,
    regionCount: starts.length,
  };
}

/**
 * True when `index` was built for this `list` (same length + same starts valid).
 * Ref identity is checked by the shell; this is a cheap content gate.
 */
export function isChangeRegionIndexValid(
  index: ChangeRegionIndex | null | undefined,
  list: any[]
): boolean {
  if (!index || !Array.isArray(index.starts) || !Array.isArray(index.ends)) {
    return false;
  }
  const n = Array.isArray(list) ? list.length : 0;
  if (index.listLength !== n) return false;
  if (index.starts.length !== index.ends.length) return false;
  if (index.regionCount !== index.starts.length) return false;
  return true;
}

/**
 * Binary search: region index containing `headIdx`, or -1 if none.
 * @param {ChangeRegionIndex} index
 * @param {number} headIdx
 * @returns {number}
 */
export function findChangeRegionIndexContaining(
  index: ChangeRegionIndex,
  headIdx: number
): number {
  const starts = index.starts;
  const ends = index.ends;
  let lo = 0;
  let hi = starts.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (headIdx < starts[mid]) hi = mid - 1;
    else if (headIdx > ends[mid]) lo = mid + 1;
    else return mid;
  }
  return -1;
}

/**
 * Resolve region array index for hop (same semantics as legacy linear scan).
 * @param {ChangeRegionIndex} index
 * @param {number} headIdx
 * @param {1|-1} d
 * @returns {number} ri (may be -1 at edges before clamp)
 */
export function resolveChangeRegionHopBase(
  index: ChangeRegionIndex,
  headIdx: number,
  d: 1 | -1
): number {
  let ri = findChangeRegionIndexContaining(index, headIdx);
  if (ri >= 0) return ri;
  const starts = index.starts;
  const ends = index.ends;
  const n = starts.length;
  if (!n) return -1;
  if (d > 0) {
    // First region with start > headIdx → base is i-1; past last → null signal
    let lo = 0;
    let hi = n;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (starts[mid] <= headIdx) lo = mid + 1;
      else hi = mid;
    }
    // lo = first index with start > headIdx (or n)
    if (lo < n) return lo - 1;
    if (ends[n - 1] < headIdx) return Number.NaN; // past end → no next
    return -1;
  }
  // d < 0: last region with end < headIdx → base is i+1
  let lo = 0;
  let hi = n - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (ends[mid] < headIdx) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (found >= 0) return found + 1;
  if (starts[0] > headIdx) return Number.NaN; // before first → no prev
  return -1;
}

/**
 * ⌥↑ / ⌥↓: move caret to the first line of the next/prev change region.
 * Returns a **single-line** selection (never multi-line whole hunk).
 *
 * Pass a prebuilt {@link ChangeRegionIndex} (from {@link buildChangeRegionIndex})
 * so key-hold does not O(n)-scan virtualRows on every event. When `regionIndex`
 * is missing/stale, rebuilds once for this call.
 *
 * @param delta >0 next, <0 previous
 * @param preferredSide LEFT | RIGHT
 * @param regionIndex optional prebuilt index for this list
 * @returns new selection or null if no region / no move possible
 */
export function jumpSelectionToAdjacentChangeRegion(
  selection: any,
  list: any[],
  delta: number,
  preferredSide?: string,
  regionIndex?: ChangeRegionIndex | null
): any | null {
  const rows = Array.isArray(list) ? list : [];
  const index =
    regionIndex && isChangeRegionIndexValid(regionIndex, rows)
      ? regionIndex
      : buildChangeRegionIndex(rows);
  if (!index.regionCount) return null;
  const d: 1 | -1 = delta < 0 ? -1 : 1;
  const prefer =
    String(
      preferredSide ||
        selection?.headSide ||
        selection?.anchorSide ||
        'RIGHT'
    ).toUpperCase() === 'LEFT'
      ? 'LEFT'
      : 'RIGHT';

  const headIdx = Number(selection?.headRowIndex);
  const hasHead = Number.isFinite(headIdx) && headIdx >= 0;
  if (
    !selection ||
    isFileLevelSelection(selection) ||
    isThreadSelection(selection) ||
    !hasHead
  ) {
    const si = d > 0 ? 0 : index.regionCount - 1;
    const startIndex = index.starts[si];
    return beginLineSelection(rows[startIndex], prefer, startIndex);
  }

  const base = resolveChangeRegionHopBase(index, headIdx, d);
  if (Number.isNaN(base)) return null;

  let ri = base;
  const target = ri + d;
  if (target < 0 || target >= index.regionCount) {
    // Edge: stay on first line of current region as single caret (no wrap)
    if (ri >= 0 && ri < index.regionCount) {
      const startIndex = index.starts[ri];
      return beginLineSelection(rows[startIndex], prefer, startIndex);
    }
    return null;
  }
  const startIndex = index.starts[target];
  return beginLineSelection(rows[startIndex], prefer, startIndex);
}

/**
 * Extend selection to another row (same file only).
 * Always updates headRowIndex (visual range). Line/side stay on the anchor side
 * in split view so RIGHT selection never flips the mark/dock to LEFT mid-drag.
 * When the preferred side is missing on a row (pure del while selecting RIGHT),
 * still extend the row range but keep headSide sticky.
 */
export function extendLineSelection(selection, row) {
  if (!selection || !isSelectableDiffRow(row)) return selection;
  if (row.filePath !== selection.filePath) return selection;
  const preferred =
    String(selection.anchorSide || 'RIGHT').toUpperCase() === 'LEFT'
      ? 'LEFT'
      : 'RIGHT';
  const pos = lineForSideStrict(row, preferred);
  if (!pos) {
    return {
      ...selection,
      headRowIndex: row.rowIndex,
      headSide: preferred,
    };
  }
  return {
    ...selection,
    headLine: pos.line,
    headSide: pos.side,
    headRowIndex: row.rowIndex,
  };
}

/**
 * Text from a browser Selection-like object (window.getSelection()).
 * Empty / whitespace-only → '' (callers skip auto-copy).
 *
 * @param {{ toString?: () => string } | null | undefined} sel
 * @returns {string}
 */
export function browserSelectionCopyText(
  sel?: { toString?: () => string } | null
): string {
  try {
    const raw = String(sel?.toString?.() ?? '');
    // Keep internal whitespace; only reject pure empty/whitespace selections.
    return raw.trim() ? raw : '';
  } catch {
    return '';
  }
}

/**
 * Opt/Alt held at Diff drag start → native browser text selection (copy partial
 * code). Default (no Opt) → product line-selection mode.
 *
 * Does not treat meta/ctrl as Opt. Shift alone stays line-selection (multi-line).
 *
 * @param {{
 *   altKey?: boolean,
 *   optHeld?: boolean,
 *   metaKey?: boolean,
 *   ctrlKey?: boolean,
 * }} [opts]
 * @returns {boolean}
 */
export function shouldUseNativeTextSelectOnDrag(opts: {
  altKey?: boolean;
  optHeld?: boolean;
  metaKey?: boolean;
  ctrlKey?: boolean;
} = {}): boolean {
  if (opts.metaKey || opts.ctrlKey) return false;
  return Boolean(opts.altKey || opts.optHeld);
}

/**
 * Read Opt-held latch from the event and/or document attribute used by
 * OptBtnHint / e2e (`data-prp-opt-held` / class `prp-opt-held`).
 *
 * @param {{ altKey?: boolean } | null | undefined} eventLike
 * @param {Document | null | undefined} [doc]
 * @returns {boolean}
 */
export function isOptHeldForPointerDrag(
  eventLike?: { altKey?: boolean } | null,
  doc?: Document | null
): boolean {
  if (eventLike?.altKey) return true;
  try {
    const root =
      doc?.documentElement ||
      (typeof document !== 'undefined' ? document.documentElement : null);
    if (!root) return false;
    if (root.getAttribute?.('data-prp-opt-held') === '1') return true;
    if (root.hasAttribute?.('data-prp-opt-held')) return true;
    if (root.classList?.contains?.('prp-opt-held')) return true;
    const body = doc?.body || (typeof document !== 'undefined' ? document.body : null);
    if (body?.classList?.contains?.('prp-opt-held')) return true;
  } catch {
    /* ignore */
  }
  return false;
}

/**
 * Pointer-down decision for click vs Shift-click.
 * - Normal click → begin new single-line selection (new anchor)
 * - Shift-click with same-file anchor → extend head only (range)
 * - Shift-click with no prior selection or other file → begin new
 * - Non-selectable row → leave selection unchanged
 * - Opt/Alt held → mode 'native-text' (caller skips line-selection drag)
 *
 * @param {object|null} currentSelection
 * @param {object} row
 * @param {{ shiftKey?: boolean, altKey?: boolean, optHeld?: boolean, metaKey?: boolean, ctrlKey?: boolean, preferredSide?: string }} [opts]
 * @returns {{
 *   selection: object|null,
 *   mode: 'begin'|'extend'|'ignore'|'native-text',
 *   keepRange: boolean,
 * }}
 */
export function applySelectionPointerDown(currentSelection, row, opts: any = {}) {
  if (
    shouldUseNativeTextSelectOnDrag({
      altKey: opts?.altKey,
      optHeld: opts?.optHeld,
      metaKey: opts?.metaKey,
      ctrlKey: opts?.ctrlKey,
    })
  ) {
    return {
      selection: currentSelection || null,
      mode: 'native-text',
      keepRange: false,
    };
  }
  const shiftKey = Boolean(opts?.shiftKey);
  const preferredSide =
    String(opts?.preferredSide || 'RIGHT').toUpperCase() === 'LEFT'
      ? 'LEFT'
      : 'RIGHT';
  // File header click → file-level caret (not multi-line extend)
  if (isFileHeaderRow(row)) {
    const started = beginSelectionOnRow(row, preferredSide);
    return {
      selection: started,
      mode: 'begin',
      keepRange: false,
    };
  }
  if (!isSelectableDiffRow(row)) {
    return {
      selection: currentSelection || null,
      mode: 'ignore',
      keepRange: false,
    };
  }
  if (
    shiftKey &&
    currentSelection &&
    !isFileLevelSelection(currentSelection) &&
    currentSelection.filePath &&
    row.filePath === currentSelection.filePath
  ) {
    const extended = extendLineSelection(currentSelection, row);
    return {
      selection: extended || currentSelection,
      mode: 'extend',
      // Finalize as multi-line (do not collapse head back to anchor)
      keepRange: true,
    };
  }
  const started = beginSelectionOnRow(row, preferredSide);
  return {
    selection: started,
    mode: 'begin',
    keepRange: false,
  };
}

/**
 * Order selection ends by visual rowIndex when available (stable for interleaved
 * add/del). Falls back to line number order only when row indices are missing.
 */
function orderedSelectionEnds(selection) {
  const aIdx = Number(selection.anchorRowIndex);
  const hIdx = Number(selection.headRowIndex);
  const hasRows = Number.isFinite(aIdx) && Number.isFinite(hIdx);
  if (hasRows) {
    const anchorFirst = aIdx <= hIdx;
    return {
      startLine: anchorFirst ? selection.anchorLine : selection.headLine,
      endLine: anchorFirst ? selection.headLine : selection.anchorLine,
      startSide: (anchorFirst ? selection.anchorSide : selection.headSide) || 'RIGHT',
      endSide: (anchorFirst ? selection.headSide : selection.anchorSide) || 'RIGHT',
      startRowIndex: anchorFirst ? aIdx : hIdx,
      endRowIndex: anchorFirst ? hIdx : aIdx,
      multi: aIdx !== hIdx,
    };
  }
  // Line-number fallback (same side only is meaningful)
  const startLine = Math.min(selection.anchorLine, selection.headLine);
  const endLine = Math.max(selection.anchorLine, selection.headLine);
  return {
    startLine,
    endLine,
    startSide:
      (selection.anchorLine <= selection.headLine
        ? selection.anchorSide
        : selection.headSide) || 'RIGHT',
    endSide:
      (selection.anchorLine <= selection.headLine
        ? selection.headSide
        : selection.anchorSide) || 'RIGHT',
    startRowIndex: null,
    endRowIndex: null,
    multi: startLine !== endLine,
  };
}

export function normalizeSelection(selection) {
  if (!selection) return null;
  // File-level comment target (no line range)
  if (selection.kind === 'file' || selection.subjectType === 'file') {
    const filePath = selection.filePath || selection.path;
    if (!filePath) return null;
    return {
      filePath,
      startLine: null,
      endLine: null,
      startSide: 'RIGHT',
      endSide: 'RIGHT',
      multi: false,
      subjectType: 'file',
      anchorRowIndex: selection.anchorRowIndex ?? null,
      headRowIndex: selection.headRowIndex ?? null,
      startRowIndex: null,
      endRowIndex: null,
    };
  }
  // Thread caret — not a line-range comment payload
  if (isThreadSelection(selection)) {
    const filePath = selection.filePath || selection.path;
    if (!filePath || selection.commentId == null) return null;
    return {
      filePath,
      startLine: selection.headLine ?? selection.anchorLine ?? null,
      endLine: selection.headLine ?? selection.anchorLine ?? null,
      startSide: selection.headSide || 'RIGHT',
      endSide: selection.headSide || 'RIGHT',
      multi: false,
      subjectType: 'thread',
      commentId: selection.commentId,
      anchorRowIndex: selection.anchorRowIndex ?? null,
      headRowIndex: selection.headRowIndex ?? null,
      startRowIndex: null,
      endRowIndex: null,
    };
  }
  const ends = orderedSelectionEnds(selection);
  return {
    filePath: selection.filePath,
    startLine: ends.startLine,
    endLine: ends.endLine,
    startSide: ends.startSide,
    endSide: ends.endSide,
    multi: ends.multi,
    subjectType: 'line',
    anchorRowIndex: selection.anchorRowIndex,
    headRowIndex: selection.headRowIndex,
    startRowIndex: ends.startRowIndex,
    endRowIndex: ends.endRowIndex,
  };
}

/**
 * Build GitHub multi-line review comment payload.
 * @param {object} selection begin/extend result
 * @param {{ body: string, commitId?: string }} opts
 */
export function selectionToCommentPayload(selection, opts: any = {
  // typed loosely for mutable REST payloads
}) {
  const norm = normalizeSelection(selection);
  if (!norm || !opts.body || !String(opts.body).trim()) return null;
  // Thread caret is not a new line-range comment target
  if (norm.subjectType === 'thread') return null;
  if (norm.subjectType === 'file') {
    const payload: any = {
      body: String(opts.body).trim(),
      path: norm.filePath,
      subject_type: 'file',
      subjectType: 'file',
    };
    if (opts.commitId) payload.commit_id = opts.commitId;
    return payload;
  }
  const payload: any = {
    body: String(opts.body).trim(),
    path: norm.filePath,
    line: norm.endLine,
    side: norm.endSide || 'RIGHT',
  };
  if (opts.commitId) payload.commit_id = opts.commitId;
  if (norm.multi) {
    payload.start_line = norm.startLine;
    payload.start_side = norm.startSide || 'RIGHT';
  }
  return payload;
}

/**
 * Finalize selection after pointer up.
 * click (no drag / no multi) → force single line at anchor.
 * drag | shift (head moved / Shift-click range) → keep multi-line range.
 * @param {object|null} selection
 * @param {'click'|'drag'|'shift'} mode
 */
export function finalizeSelection(selection, mode) {
  if (!selection) return null;
  // Structural carets have no line range to collapse
  if (isFileLevelSelection(selection) || isThreadSelection(selection)) {
    return { ...selection };
  }
  if (mode === 'drag' || mode === 'shift') {
    return { ...selection };
  }
  // click = single line at anchor
  return {
    ...selection,
    headLine: selection.anchorLine,
    headSide: selection.anchorSide,
    headRowIndex: selection.anchorRowIndex,
  };
}

/**
 * Detect click vs drag from pointer movement.
 * @param {{ x: number, y: number }|null} start
 * @param {{ x: number, y: number }|null} end
 * @param {number} [thresholdPx=4]
 * @returns {'click'|'drag'}
 */
export function selectionGestureMode(start, end, thresholdPx = 4) {
  if (!start || !end) return 'click';
  const dx = Math.abs(Number(end.x) - Number(start.x));
  const dy = Math.abs(Number(end.y) - Number(start.y));
  const t = Number.isFinite(thresholdPx) ? thresholdPx : 4;
  return dx > t || dy > t ? 'drag' : 'click';
}

/**
 * True when a selectable row carries `line` on `side` (strict, no cross-pane).
 */
export function rowMatchesLineSide(
  row: any,
  line: unknown,
  side: unknown
): boolean {
  if (!isSelectableDiffRow(row)) return false;
  const want = Number(line);
  if (!Number.isFinite(want)) return false;
  const prefer =
    String(side || 'RIGHT').toUpperCase() === 'LEFT' ? 'LEFT' : 'RIGHT';
  const pos = lineForSideStrict(row, prefer);
  return Boolean(pos && pos.line === want);
}

/**
 * Locate a selectable row's rowIndex for path+line+side (first match).
 * Used to rebind selection after inline comments shift virtual indices.
 */
export function findRowIndexForLineSide(
  virtualRows: any[] | null | undefined,
  filePath: unknown,
  line: unknown,
  side: unknown
): number | null {
  const path = String(filePath || '').trim();
  if (!path) return null;
  const list = Array.isArray(virtualRows) ? virtualRows : [];
  for (const row of list) {
    if (!row || String(row.filePath || '') !== path) continue;
    if (!rowMatchesLineSide(row, line, side)) continue;
    const idx = Number(row.rowIndex);
    if (Number.isFinite(idx)) return idx;
  }
  return null;
}

/**
 * Rebind anchor/head rowIndex onto the current virtual list by path+line+side.
 * Inline review comments insert/remove rows and renumber rowIndex — without this
 * the selection chrome vanishes while the store still holds a stale index.
 * Returns the same object when nothing changed (Object.is-stable for React).
 */
export function rebindSelectionRowIndices(
  selection: any,
  virtualRows: any[] | null | undefined
) {
  if (!selection) return selection;
  const list = Array.isArray(virtualRows) ? virtualRows : [];
  if (!list.length) return selection;

  if (isFileLevelSelection(selection)) {
    const header = fileHeaderRowInVirtualRows(list, selection.filePath);
    if (!header) return selection;
    const idx = Number(header.rowIndex);
    if (!Number.isFinite(idx)) return selection;
    if (
      Number(selection.headRowIndex) === idx &&
      Number(selection.anchorRowIndex) === idx
    ) {
      return selection;
    }
    return {
      ...selection,
      anchorRowIndex: idx,
      headRowIndex: idx,
    };
  }

  if (isThreadSelection(selection)) {
    const idx = findRowIndexForCommentId(list, selection.commentId);
    if (idx == null) return selection;
    if (
      Number(selection.headRowIndex) === idx &&
      Number(selection.anchorRowIndex) === idx
    ) {
      return selection;
    }
    return {
      ...selection,
      anchorRowIndex: idx,
      headRowIndex: idx,
    };
  }

  const path = String(selection.filePath || '').trim();
  if (!path) return selection;

  const aLine = selection.anchorLine;
  const hLine = selection.headLine;
  const aSide = selection.anchorSide || 'RIGHT';
  const hSide = selection.headSide || 'RIGHT';

  let aIdx = findRowIndexForLineSide(list, path, aLine, aSide);
  let hIdx = findRowIndexForLineSide(list, path, hLine, hSide);

  // Partial miss (row temporarily off-list) — keep prior indices
  if (aIdx == null && hIdx == null) return selection;
  if (aIdx == null) aIdx = hIdx;
  if (hIdx == null) hIdx = aIdx;

  if (
    Number(selection.anchorRowIndex) === aIdx &&
    Number(selection.headRowIndex) === hIdx
  ) {
    return selection;
  }
  return {
    ...selection,
    anchorRowIndex: aIdx,
    headRowIndex: hIdx,
  };
}

/**
 * Whether a virtual row is highlighted by the active selection.
 *
 * **Single-line caret: line+side identity first** (survives comment-row renumber).
 * Multi-line: rowIndex range after rebind; line range as fallback.
 */
export function isRowInSelection(selection, row) {
  if (!selection || !row) return false;
  const selPath = String(selection.filePath || '').trim();
  const rowPath = String(row.filePath || row.path || '').trim();
  if (!selPath || selPath !== rowPath) return false;

  if (isFileLevelSelection(selection)) {
    return isFileHeaderRow(row);
  }
  if (isThreadSelection(selection)) {
    return (
      isInlineCommentRow(row) &&
      String(row.commentId) === String(selection.commentId)
    );
  }

  if (row.kind !== 'diff-line' || !isSelectableDiffRow(row)) return false;

  // Single-line: identity by line+side only (ignore possibly-stale rowIndex)
  if (isSingleLineCaretSelection(selection)) {
    return rowMatchesLineSide(
      row,
      selection.headLine,
      selection.headSide || selection.anchorSide
    );
  }

  const a = Number(selection.anchorRowIndex);
  const h = Number(selection.headRowIndex);
  const ri = Number(row.rowIndex);
  if (Number.isFinite(a) && Number.isFinite(h) && Number.isFinite(ri)) {
    const lo = Math.min(a, h);
    const hi = Math.max(a, h);
    if (ri >= lo && ri <= hi) return true;
  }

  // Fallback: same-side line range
  const norm = normalizeSelection(selection);
  if (!norm || norm.subjectType === 'file' || norm.subjectType === 'thread') {
    return false;
  }
  const prefer =
    String(norm.endSide || 'RIGHT').toUpperCase() === 'LEFT' ? 'LEFT' : 'RIGHT';
  const pos = lineForSideStrict(row, prefer);
  if (!pos) return false;
  const start = Number(norm.startLine);
  const end = Number(norm.endLine);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
  const loL = Math.min(start, end);
  const hiL = Math.max(start, end);
  return pos.line >= loL && pos.line <= hiL;
}

/**
 * Position of a selected row inside a multi-line selection block for CSS edges.
 * @returns {null|'only'|'start'|'middle'|'end'}
 */
export function selectionBlockRole(selection, row) {
  if (!isRowInSelection(selection, row)) return null;
  const a = Number(selection.anchorRowIndex);
  const h = Number(selection.headRowIndex);
  const ri = Number(row.rowIndex);
  if (Number.isFinite(a) && Number.isFinite(h) && Number.isFinite(ri)) {
    const lo = Math.min(a, h);
    const hi = Math.max(a, h);
    if (lo === hi) return 'only';
    if (ri === lo) return 'start';
    if (ri === hi) return 'end';
    if (ri > lo && ri < hi) return 'middle';
    return 'only';
  }
  const norm = normalizeSelection(selection);
  if (!norm) return null;
  const line = row.newLine != null ? Number(row.newLine) : Number(row.oldLine);
  if (!Number.isFinite(line)) return null;
  if (!norm.multi || norm.startLine === norm.endLine) return 'only';
  if (line === norm.startLine) return 'start';
  if (line === norm.endLine) return 'end';
  if (line > norm.startLine && line < norm.endLine) return 'middle';
  return 'only';
}

/**
 * Stable string for a row's selection chrome — used as a Zustand selector result
 * so only edge rows re-render when multi-line range moves under key-hold.
 * @returns {''|'only'|'start'|'middle'|'end'}
 */
export function rowSelectionVisualKey(selection: any, row: any): string {
  if (!selection || !row) return '';
  // File-level: header gets 'only'
  if (isFileLevelSelection(selection)) {
    if (!isFileHeaderRow(row)) return '';
    if (
      String(row.filePath || row.path || '') !==
      String(selection.filePath || '')
    ) {
      return '';
    }
    return 'only';
  }
  // Thread caret: matching inline-comment row
  if (isThreadSelection(selection)) {
    if (
      !isInlineCommentRow(row) ||
      String(row.commentId) !== String(selection.commentId)
    ) {
      return '';
    }
    return 'only';
  }
  if (row.filePath !== selection.filePath) return '';
  if (typeof isSelectableDiffRow === 'function' && !isSelectableDiffRow(row)) {
    return '';
  }

  // Single-line: line+side only — survives comment-row renumber / mid-scroll rebuild
  if (isSingleLineCaretSelection(selection)) {
    return rowMatchesLineSide(
      row,
      selection.headLine,
      selection.headSide || selection.anchorSide
    )
      ? 'only'
      : '';
  }

  const a = Number(selection.anchorRowIndex);
  const h = Number(selection.headRowIndex);
  const ri = Number(row.rowIndex);
  if (Number.isFinite(a) && Number.isFinite(h) && Number.isFinite(ri)) {
    const lo = Math.min(a, h);
    const hi = Math.max(a, h);
    if (ri >= lo && ri <= hi) {
      if (lo === hi) return 'only';
      if (ri === lo) return 'start';
      if (ri === hi) return 'end';
      return 'middle';
    }
  }
  const role =
    typeof selectionBlockRole === 'function'
      ? selectionBlockRole(selection, row)
      : null;
  return role || '';
}

/**
 * Code text for one selectable diff row (prefer RIGHT/LEFT per flag).
 */
function codeTextFromDiffRow(row: any, preferRight: boolean): string {
  if (!row) return '';
  let code = '';
  if (preferRight) {
    code =
      row.rightCode != null
        ? String(row.rightCode)
        : row.code != null
          ? String(row.code)
          : String(row.text || '').replace(/^[-+ ]/, '');
  } else {
    code =
      row.leftCode != null
        ? String(row.leftCode)
        : row.code != null
          ? String(row.code)
          : String(row.text || '').replace(/^[-+ ]/, '');
  }
  // Strip unified-diff prefix if still present
  if (row.raw && /^[-+]/.test(String(row.raw)) && code === String(row.raw)) {
    code = String(row.raw).slice(1);
  } else if (
    /^[-+ ]/.test(code) &&
    (row.lineType === 'add' ||
      row.lineType === 'del' ||
      row.lineType === 'change' ||
      row.lineType === 'context')
  ) {
    if (
      code.charAt(0) === '+' ||
      code.charAt(0) === '-' ||
      code.charAt(0) === ' '
    ) {
      if (row.raw && String(row.raw).slice(1) === code.slice(1)) {
        code = code.slice(1);
      }
    }
  }
  return code;
}

/**
 * Extract plain code for the current selection from virtual diff rows.
 * - Line range: selected rows only
 * - File selection: **entire file** body (all selectable lines for that path)
 * Uses RIGHT (new) content when endSide is RIGHT, else LEFT (old).
 */
export function extractSelectedCodeText(virtualRows, selection) {
  const norm = normalizeSelection(selection);
  if (!norm) return '';
  const list = Array.isArray(virtualRows) ? virtualRows : [];
  const lines: string[] = [];
  const preferRight = (norm.endSide || 'RIGHT') === 'RIGHT';
  const fileLevel = norm.subjectType === 'file';
  const filePath = String(norm.filePath || selection?.filePath || '').trim();

  for (const row of list) {
    if (fileLevel) {
      if (!filePath || String(row.filePath || row.path || '') !== filePath) {
        continue;
      }
      if (!isSelectableDiffRow(row)) continue;
    } else if (!isRowInSelection(selection, row)) {
      continue;
    }
    lines.push(codeTextFromDiffRow(row, preferRight));
  }
  return lines.join('\n');
}

/**
 * GitHub blob permalink with optional line range.
 * RIGHT → head ref/sha; LEFT → base ref/sha.
 * @returns {string} empty when insufficient context
 */
export function githubBlobLinePermalink(opts: any = {}) {
  const owner = String(opts.owner || '').trim();
  const repo = String(opts.repo || '').trim();
  const path = String(opts.path || opts.filePath || '').replace(/^\/+/, '');
  const side = String(opts.side || opts.endSide || 'RIGHT').toUpperCase();
  const ref =
    side === 'LEFT'
      ? String(opts.baseSha || opts.baseRef || opts.ref || '').trim()
      : String(opts.headSha || opts.headRef || opts.ref || '').trim();
  if (!owner || !repo || !path || !ref) return '';
  const start = Number(opts.startLine ?? opts.line);
  const end = Number(opts.endLine ?? opts.startLine ?? opts.line);
  if (!Number.isFinite(start) || start < 1) return '';
  const origin = String(opts.webOrigin || 'https://github.com')
    .trim()
    .replace(/\/+$/, '');
  const encPath = path
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
  const base = `${origin}/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/blob/${encodeURIComponent(ref)}/${encPath}`;
  if (Number.isFinite(end) && end > start) return `${base}#L${start}-L${end}`;
  return `${base}#L${start}`;
}
