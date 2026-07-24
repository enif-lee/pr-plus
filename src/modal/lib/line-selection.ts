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
 * Always updates headRowIndex (visual range). Line/side track the row for the API.
 *
 * Prefer the anchor's side when both sides exist on the row; if the preferred side
 * is missing (e.g. drag from an add over a del), use the available side without
 * rewriting the anchor — highlighting uses rowIndex, not mixed line numbers.
 */
export function extendLineSelection(selection, row) {
  if (!selection || !isSelectableDiffRow(row)) return selection;
  if (row.filePath !== selection.filePath) return selection;
  const preferred = selection.anchorSide || 'RIGHT';
  const pos = lineForSide(row, preferred);
  if (!pos) return selection;
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
  const started = beginLineSelection(row);
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
 * Whether a virtual row is highlighted by the active selection.
 *
 * Prefer **rowIndex range** so interleaved add/del (LEFT vs RIGHT line numbers)
 * form one continuous visual block instead of jumping by mixed line coords.
 */
export function isRowInSelection(selection, row) {
  if (!selection || !row || row.filePath !== selection.filePath) return false;
  if (row.kind !== 'diff-line') return false;
  if (!isSelectableDiffRow(row)) return false;

  const a = Number(selection.anchorRowIndex);
  const h = Number(selection.headRowIndex);
  const ri = Number(row.rowIndex);
  if (Number.isFinite(a) && Number.isFinite(h) && Number.isFinite(ri)) {
    const lo = Math.min(a, h);
    const hi = Math.max(a, h);
    return ri >= lo && ri <= hi;
  }

  // Fallback: same-side line range (legacy / missing rowIndex)
  const norm = normalizeSelection(selection);
  if (!norm || norm.subjectType === 'file') return false;
  const line = row.newLine != null ? Number(row.newLine) : Number(row.oldLine);
  if (!Number.isFinite(line)) return false;
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
    } else if (/^[-+ ]/.test(code) && (row.lineType === 'add' || row.lineType === 'del' || row.lineType === 'context')) {
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
