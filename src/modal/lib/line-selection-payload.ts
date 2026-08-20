/** @module modal/lib/line-selection-payload */
/**
 * Review-comment payload, normalize, visual keys, selected code, blob permalink.
 */
import {
  isFileHeaderRow,
  isFileLevelSelection,
  isInlineCommentRow,
  isSelectableDiffRow,
  isSingleLineCaretSelection,
  isThreadSelection,
  lineForSide,
  lineForSideStrict,
  findRowIndexForCommentId,
  findRowIndexForLineSide,
  fileHeaderRowInVirtualRows,
  rowMatchesLineSide,
} from './line-selection-nav';
import { orderedSelectionEnds } from './line-selection-range';

export function normalizeSelection(selection: any) {
  if (!selection) return null;
  // File-level comment target (no line range)
  if (selection.kind === 'file' || selection.subjectType === 'file') {
    const filePath = selection.filePath || selection.path;
    if (!filePath) return null;
    return {
      filePath,
      startLine: null as number | null,
      endLine: null as number | null,
      startSide: 'RIGHT',
      endSide: 'RIGHT',
      multi: false,
      subjectType: 'file',
      anchorRowIndex: selection.anchorRowIndex ?? null,
      headRowIndex: selection.headRowIndex ?? null,
      startRowIndex: null as any,
      endRowIndex: null as any,
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
      startRowIndex: null as number | null,
      endRowIndex: null as number | null,
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
export function selectionToCommentPayload(selection: any, opts: any = {
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
export function finalizeSelection(selection: any, mode: any) {
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
export function selectionGestureMode(start: any, end: any, thresholdPx = 4) {
  if (!start || !end) return 'click';
  const dx = Math.abs(Number(end.x) - Number(start.x));
  const dy = Math.abs(Number(end.y) - Number(start.y));
  const t = Number.isFinite(thresholdPx) ? thresholdPx : 4;
  return dx > t || dy > t ? 'drag' : 'click';
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
export function isRowInSelection(selection: any, row: any) {
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
export function selectionBlockRole(selection: any, row: any) {
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
export function extractSelectedCodeText(virtualRows: any, selection: any) {
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
