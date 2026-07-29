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

/** True when caret is a single line (not multi, not file/thread structural). */
export function isSingleLineCaretSelection(selection: any): boolean {
  if (!selection || isFileLevelSelection(selection) || isThreadSelection(selection)) {
    return false;
  }
  const a = Number(selection.anchorLine);
  const h = Number(selection.headLine);
  if (!Number.isFinite(a) || !Number.isFinite(h) || a !== h) return false;
  const aSide = String(selection.anchorSide || 'RIGHT').toUpperCase();
  const hSide = String(selection.headSide || 'RIGHT').toUpperCase();
  return aSide === hSide;
}

/**
 * Begin caret selection on a nav row.
 * - diff-line → normal line selection
 * - file-header → file-level selection (`kind: 'file'`) for ⌥C file comments
 * - inline-comment → thread selection (`kind: 'thread'`) for ↑↓ + ⌥C reply
 */
export function beginSelectionOnRow(row: any, preferredSide: 'LEFT' | 'RIGHT' | string = 'RIGHT') {
  if (isFileHeaderRow(row)) {
    const path = String(row.filePath || row.path || '').trim();
    if (!path) return null;
    const idx = Number(row.rowIndex);
    const rowIndex = Number.isFinite(idx) ? idx : null;
    return {
      kind: 'file' as const,
      subjectType: 'file' as const,
      filePath: path,
      anchorRowIndex: rowIndex,
      headRowIndex: rowIndex,
    };
  }
  if (isInlineCommentRow(row)) {
    const path = String(row.filePath || row.path || '').trim();
    const commentId = row.commentId;
    if (!path || commentId == null) return null;
    const idx = Number(row.rowIndex);
    const rowIndex = Number.isFinite(idx) ? idx : null;
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
      anchorRowIndex: rowIndex,
      headRowIndex: rowIndex,
      headSide: side,
      anchorSide: side,
      headLine: line,
      anchorLine: line,
    };
  }
  return beginLineSelection(row, preferredSide);
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
export function beginLineSelection(row, preferredSide = 'RIGHT') {
  if (!isSelectableDiffRow(row)) return null;
  const prefer =
    String(preferredSide || 'RIGHT').toUpperCase() === 'LEFT' ? 'LEFT' : 'RIGHT';
  const pos = lineForSide(row, prefer);
  if (!pos) return null;
  return {
    filePath: row.filePath,
    anchorLine: pos.line,
    headLine: pos.line,
    anchorSide: pos.side,
    headSide: pos.side,
    anchorRowIndex: row.rowIndex,
    headRowIndex: row.rowIndex,
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
    if (!/^\d+$/.test(parts[0])) return null;
    const startLine = Number(parts[0]);
    if (!Number.isFinite(startLine) || startLine < 1) return null;
    return { path: null, startLine, endLine: null };
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
 * First selectable diff-line for a file in virtual order (top of file body).
 * Used after file nav so ArrowUp/Down seed the first displayed line.
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

function selectionNeedsSeed(
  selection: any,
  activeFilePath: string
): boolean {
  if (!selection) return true;
  // Structural carets (file header / thread) with identity are valid stops
  if (isFileLevelSelection(selection) || isThreadSelection(selection)) {
    if (!String(selection.filePath || '').trim()) return true;
    if (isThreadSelection(selection) && selection.commentId == null) return true;
    if (
      activeFilePath &&
      String(selection.filePath || '') !== activeFilePath
    ) {
      return true;
    }
    return false;
  }
  // Line carets: path+line identity is enough even if headRowIndex is stale
  if (
    String(selection.filePath || '').trim() &&
    Number.isFinite(Number(selection.headLine))
  ) {
    if (
      activeFilePath &&
      String(selection.filePath || '') !== activeFilePath
    ) {
      return true;
    }
    return false;
  }
  if (!Number.isFinite(Number(selection.headRowIndex))) return true;
  if (activeFilePath && String(selection.filePath || '') !== activeFilePath) {
    return true;
  }
  return false;
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
          isSelectableDiffRow(row) &&
          (!Number.isFinite(Number(selection.headLine)) ||
            rowMatchesLineSide(
              row,
              selection.headLine,
              selection.headSide || selection.anchorSide
            ))
        ) {
          return headIdx;
        }
      }
    }
  }
  // Stale after comment insert / fold — rebind by line, then header pivot
  if (
    path &&
    !isFileLevelSelection(selection) &&
    !isThreadSelection(selection)
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
function findNavRowNSteps(
  selection: any,
  list: any[],
  d: number,
  steps: number,
  opts: { shift?: boolean } = {}
) {
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
      }
    } else if (isSelectionNavRow(row)) {
      found += 1;
      last = row;
    }
    i += d;
  }
  return last;
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
 * Move or extend an active line selection by nav rows.
 * - shift=false → single-line caret; visits **file headers** and body lines;
 *   continues into next/prev file at EOF/BOF
 * - shift=true → multi-line extend; body lines only; blocked at file boundary
 * - no selection / wrong file + activeFilePath → seed first body line (or header if folded)
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
    // Prefer body of active/selection file; folded → that file's header.
    let seedRow =
      seedPath && typeof firstSelectableRowInFile === 'function'
        ? firstSelectableRowInFile(list, seedPath)
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
        typeof firstSelectableRowAnywhere === 'function'
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
    cur = beginSelectionOnRow(seedRow) || selection;
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
      cur = beginSelectionOnRow(header) || cur;
      // Don't consume a step — user asked to leave the folded file
    }
  }

  const target = findNavRowNSteps(cur, list, d, steps, opts);
  if (!target) return cur;
  // Same stop (line / header / thread) — no-op
  const sameStop =
    Number(target.rowIndex) === Number(cur.headRowIndex) &&
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
    return extendLineSelection(cur, target) || cur;
  }
  return beginSelectionOnRow(target) || cur;
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
  const nextPath = String(next.filePath || next.path || '');
  return nextPath !== path;
}

/** Delay before selection action toggles appear (hides island during key-hold). */
export const SELECTION_ACTIONS_REVEAL_MS = 300;

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
 * Pointer-down decision for click vs Shift-click.
 * - Normal click → begin new single-line selection (new anchor)
 * - Shift-click with same-file anchor → extend head only (range)
 * - Shift-click with no prior selection or other file → begin new
 * - Non-selectable row → leave selection unchanged
 *
 * @param {object|null} currentSelection
 * @param {object} row
 * @param {{ shiftKey?: boolean }} [opts]
 * @returns {{
 *   selection: object|null,
 *   mode: 'begin'|'extend'|'ignore',
 *   keepRange: boolean,
 * }}
 */
export function applySelectionPointerDown(currentSelection, row, opts: any = {}) {
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
 * Extract plain code for the current selection from virtual diff rows.
 * Uses RIGHT (new) content when endSide is RIGHT, else LEFT (old).
 */
export function extractSelectedCodeText(virtualRows, selection) {
  const norm = normalizeSelection(selection);
  if (!norm) return '';
  const list = Array.isArray(virtualRows) ? virtualRows : [];
  const lines = [];
  const preferRight = (norm.endSide || 'RIGHT') === 'RIGHT';
  for (const row of list) {
    if (!isRowInSelection(selection, row)) continue;
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
      // only strip when it looks like a diff marker and lineType is known
      if (code.charAt(0) === '+' || code.charAt(0) === '-' || code.charAt(0) === ' ') {
        // Prefer row.code without marker when raw exists
        if (row.raw && String(row.raw).slice(1) === code.slice(1)) {
          code = code.slice(1);
        }
      }
    }
    lines.push(code);
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
