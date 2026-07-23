/** @module modal/lib/line-selection */
/**
 * Pure helpers for GitHub-style single- and multi-line diff selection
 * and review-comment payload shaping.
 */

export function isSelectableDiffRow(row) {
  if (!row || row.kind !== 'diff-line') return false;
  const t = row.lineType;
  if (t !== 'add' && t !== 'del' && t !== 'context') return false;
  // Prefer RIGHT (new) line; allow LEFT-only deletes
  return row.newLine != null || row.oldLine != null;
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
 * Start a selection on a selectable diff row.
 * @returns {object|null}
 */
export function beginLineSelection(row) {
  if (!isSelectableDiffRow(row)) return null;
  const pos = lineForSide(row, 'RIGHT');
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
 * Extend selection to another row (same file only).
 */
export function extendLineSelection(selection, row) {
  if (!selection || !isSelectableDiffRow(row)) return selection;
  if (row.filePath !== selection.filePath) return selection;
  const pos = lineForSide(row, selection.anchorSide || 'RIGHT');
  if (!pos) return selection;
  return {
    ...selection,
    headLine: pos.line,
    headSide: pos.side,
    headRowIndex: row.rowIndex,
  };
}

export function normalizeSelection(selection) {
  if (!selection) return null;
  const startLine = Math.min(selection.anchorLine, selection.headLine);
  const endLine = Math.max(selection.anchorLine, selection.headLine);
  const startSide =
    selection.anchorLine <= selection.headLine
      ? selection.anchorSide
      : selection.headSide;
  const endSide =
    selection.anchorLine <= selection.headLine
      ? selection.headSide
      : selection.anchorSide;
  return {
    filePath: selection.filePath,
    startLine,
    endLine,
    startSide: startSide || 'RIGHT',
    endSide: endSide || 'RIGHT',
    multi: startLine !== endLine,
    anchorRowIndex: selection.anchorRowIndex,
    headRowIndex: selection.headRowIndex,
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
 * drag (head moved) → keep multi-line range.
 * @param {object|null} selection
 * @param {'click'|'drag'} mode
 */
export function finalizeSelection(selection, mode) {
  if (!selection) return null;
  if (mode === 'drag') {
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
 * Whether a virtual row is highlighted by the active selection.
 */
export function isRowInSelection(selection, row) {
  if (!selection || !row || row.filePath !== selection.filePath) return false;
  if (row.kind !== 'diff-line') return false;
  const norm = normalizeSelection(selection);
  if (!norm) return false;
  const line = row.newLine != null ? Number(row.newLine) : Number(row.oldLine);
  if (!Number.isFinite(line)) return false;
  // Only highlight rows on the same primary side as the selection end
  if (norm.endSide === 'RIGHT' && row.newLine == null) return false;
  if (norm.endSide === 'LEFT' && row.oldLine == null) return false;
  return line >= norm.startLine && line <= norm.endLine;
}

/**
 * Position of a selected row inside a multi-line selection block for CSS edges.
 * @returns {null|'only'|'start'|'middle'|'end'}
 */
export function selectionBlockRole(selection, row) {
  if (!isRowInSelection(selection, row)) return null;
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
