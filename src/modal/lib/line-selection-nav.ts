/** @module modal/lib/line-selection-nav */
/**
 * Predicates, caret begin, Goto parse, virtual-row find, and single-step move.
 * SOURCE OF TRUTH with line-selection-range / line-selection-payload.
 */
export function isSelectableDiffRow(row: any) {
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

export function lineForSide(row: any, preferredSide = 'RIGHT') {
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
 * Extend selection to another row (same file only).
 * Always updates headRowIndex (visual range). Line/side stay on the anchor side
 * in split view so RIGHT selection never flips the mark/dock to LEFT mid-drag.
 * When the preferred side is missing on a row (pure del while selecting RIGHT),
 * still extend the row range but keep headSide sticky.
 */
export function extendLineSelection(selection: any, row: any) {
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
