/**
 * Pure helpers for GitHub-style single- and multi-line diff selection
 * and review-comment payload shaping.
 */

function isSelectableDiffRow(row) {
  if (!row || row.kind !== 'diff-line') return false;
  const t = row.lineType;
  if (t !== 'add' && t !== 'del' && t !== 'context') return false;
  // Prefer RIGHT (new) line; allow LEFT-only deletes
  return row.newLine != null || row.oldLine != null;
}

function lineForSide(row, preferredSide = 'RIGHT') {
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
function beginLineSelection(row) {
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
 * Parse Goto query: path:line[:line] or bare line[:line].
 * Parses line numbers from the right so paths stay intact.
 */
function parseGotoQuery(raw) {
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
      return {
        path: null,
        startLine: secondN,
        endLine: lastN !== secondN ? lastN : null,
      };
    }
    const path = parts.slice(0, -2).join(':').trim();
    if (!path) return null;
    return {
      path,
      startLine: secondN,
      endLine: lastN !== secondN ? lastN : null,
    };
  }
  const path = parts.slice(0, -1).join(':').trim();
  if (!path) return null;
  return { path, startLine: lastN, endLine: null };
}

function findSelectableRowForLine(virtualRows, filePath, line, preferredSide = 'RIGHT') {
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

function selectionFromGoto(virtualRows, filePath, startLine, endLine = null) {
  const startRow = findSelectableRowForLine(virtualRows, filePath, startLine, 'RIGHT');
  if (!startRow) return null;
  const endLn = endLine == null || endLine === '' ? null : Number(endLine);
  if (endLn == null || !Number.isFinite(endLn) || endLn === Number(startLine)) {
    return beginLineSelection(startRow);
  }
  const endRow = findSelectableRowForLine(virtualRows, filePath, endLn, 'RIGHT');
  if (!endRow) return beginLineSelection(startRow);
  const started = beginLineSelection(startRow);
  return extendLineSelection(started, endRow) || started;
}

function isFileCollapsedInVirtualRows(virtualRows, filePath) {
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
  const pathRows = list.filter(
    (r) => r && (r.filePath === path || r.path === path)
  );
  if (pathRows.length === 1 && pathRows[0].kind === 'file-header') {
    return true;
  }
  return false;
}

function resolvePendingGotoSelection(virtualRows, pending) {
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

function resolveGotoPathAmongFiles(queryPath, activePath, files) {
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
  return path;
}

function firstSelectableRowInFile(virtualRows, filePath) {
  const path = String(filePath || '').trim();
  if (!path) return null;
  const list = Array.isArray(virtualRows) ? virtualRows : [];
  for (let i = 0; i < list.length; i++) {
    const row = list[i];
    if (row && row.filePath === path && isSelectableDiffRow(row)) return row;
  }
  return null;
}

function lastSelectableRowInFile(virtualRows, filePath) {
  const path = String(filePath || '').trim();
  if (!path) return null;
  const list = Array.isArray(virtualRows) ? virtualRows : [];
  for (let i = list.length - 1; i >= 0; i--) {
    const row = list[i];
    if (row && row.filePath === path && isSelectableDiffRow(row)) return row;
  }
  return null;
}

function selectionNeedsSeed(selection, activeFilePath) {
  if (!selection) return true;
  if (selection.kind === 'file' || selection.subjectType === 'file') return true;
  if (!Number.isFinite(Number(selection.headRowIndex))) return true;
  if (activeFilePath && String(selection.filePath || '') !== activeFilePath) {
    return true;
  }
  return false;
}

function findSelectableRowNSteps(selection, list, d, steps, opts) {
  if (!selection || selection.kind === 'file' || selection.subjectType === 'file') {
    return null;
  }
  const headIdx = Number(selection.headRowIndex);
  if (!Number.isFinite(headIdx)) return null;
  const path = String(selection.filePath || '');
  const sameFileOnly = Boolean(opts && opts.shift);
  const need = Math.max(1, Math.floor(steps) || 1);
  let found = 0;
  let last = null;
  let i = headIdx + d;
  while (i >= 0 && i < list.length && found < need) {
    const row = list[i];
    if (!row) {
      i += d;
      continue;
    }
    if (sameFileOnly) {
      if (row.filePath && row.filePath !== path) break;
      if (row.kind === 'file-header' && row.filePath && row.filePath !== path) break;
      if (isSelectableDiffRow(row) && row.filePath === path) {
        found += 1;
        last = row;
      }
    } else if (isSelectableDiffRow(row)) {
      found += 1;
      last = row;
    }
    i += d;
  }
  return last;
}

function moveLineSelection(selection, virtualRows, delta, opts = {}) {
  const list = Array.isArray(virtualRows) ? virtualRows : [];
  if (!list.length) return selection;

  const d = delta < 0 ? -1 : 1;
  let steps = Math.max(1, Math.abs(Number(delta)) || 1);
  if (steps > 48) steps = 48;
  const activePath = String(opts.activeFilePath || '').trim();
  let cur = selection;

  if (selectionNeedsSeed(cur, activePath)) {
    const seedPath = activePath || String(cur && cur.filePath ? cur.filePath : '').trim();
    if (!seedPath) return selection;
    const seedRow = firstSelectableRowInFile(list, seedPath);
    if (!seedRow) return selection;
    cur = beginLineSelection(seedRow) || selection;
    steps -= 1;
  }

  if (!cur || cur.kind === 'file' || cur.subjectType === 'file') {
    return cur;
  }
  if (steps <= 0) return cur;

  const target = findSelectableRowNSteps(cur, list, d, steps, opts);
  if (!target) return cur;
  if (Number(target.rowIndex) === Number(cur.headRowIndex)) return cur;
  if (opts.shift) return extendLineSelection(cur, target) || cur;
  return beginLineSelection(target) || cur;
}

function isSelectionAtFileEdge(selection, virtualRows, delta) {
  if (!selection || selection.kind === 'file' || selection.subjectType === 'file') {
    return false;
  }
  const list = Array.isArray(virtualRows) ? virtualRows : [];
  if (!list.length) return false;
  const path = String(selection.filePath || '');
  const headIdx = Number(selection.headRowIndex);
  if (!path || !Number.isFinite(headIdx)) return false;
  const d = delta < 0 ? -1 : 1;
  if (d > 0) {
    const last = lastSelectableRowInFile(list, path);
    return last != null && Number(last.rowIndex) === headIdx;
  }
  const first = firstSelectableRowInFile(list, path);
  return first != null && Number(first.rowIndex) === headIdx;
}

const SELECTION_ACTIONS_REVEAL_MS = 300;

/**
 * Extend selection to another row (same file only).
 * Always updates headRowIndex (visual range). Line/side track the row for the API.
 */
function extendLineSelection(selection, row) {
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
 * @returns {{ selection: object|null, mode: 'begin'|'extend'|'ignore', keepRange: boolean }}
 */
function applySelectionPointerDown(currentSelection, row, opts = {}) {
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
 * Order selection ends by visual rowIndex when available.
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
  const startLine = Math.min(selection.anchorLine, selection.headLine);
  const endLine = Math.max(selection.anchorLine, selection.headLine);
  return {
    startLine: startLine,
    endLine: endLine,
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

function normalizeSelection(selection) {
  if (!selection) return null;
  if (selection.kind === 'file' || selection.subjectType === 'file') {
    const filePath = selection.filePath || selection.path;
    if (!filePath) return null;
    return {
      filePath: filePath,
      startLine: null,
      endLine: null,
      startSide: 'RIGHT',
      endSide: 'RIGHT',
      multi: false,
      subjectType: 'file',
      anchorRowIndex: selection.anchorRowIndex != null ? selection.anchorRowIndex : null,
      headRowIndex: selection.headRowIndex != null ? selection.headRowIndex : null,
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
function selectionToCommentPayload(selection, opts = {}) {
  const norm = normalizeSelection(selection);
  if (!norm || !opts.body || !String(opts.body).trim()) return null;
  if (norm.subjectType === 'file') {
    const payload = {
      body: String(opts.body).trim(),
      path: norm.filePath,
      subject_type: 'file',
      subjectType: 'file',
    };
    if (opts.commitId) payload.commit_id = opts.commitId;
    return payload;
  }
  const payload = {
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
 * click → single line at anchor; drag | shift → keep multi-line range.
 * @param {object|null} selection
 * @param {'click'|'drag'|'shift'} mode
 */
function finalizeSelection(selection, mode) {
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
function selectionGestureMode(start, end, thresholdPx = 4) {
  if (!start || !end) return 'click';
  const dx = Math.abs(Number(end.x) - Number(start.x));
  const dy = Math.abs(Number(end.y) - Number(start.y));
  const t = Number.isFinite(thresholdPx) ? thresholdPx : 4;
  return dx > t || dy > t ? 'drag' : 'click';
}

/**
 * Whether a virtual row is highlighted by the active selection.
 * Prefer rowIndex range so interleaved add/del form one continuous block.
 */
function isRowInSelection(selection, row) {
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
/**
 * Stable string for a row's selection chrome (Zustand selector result).
 * @returns {''|'only'|'start'|'middle'|'end'}
 */
function rowSelectionVisualKey(selection, row) {
  if (!selection || !row) return '';
  if (selection.kind === 'file' || selection.subjectType === 'file') return '';
  if (row.filePath !== selection.filePath) return '';
  if (typeof isSelectableDiffRow === 'function' && !isSelectableDiffRow(row)) {
    return '';
  }
  const a = Number(selection.anchorRowIndex);
  const h = Number(selection.headRowIndex);
  const ri = Number(row.rowIndex);
  if (Number.isFinite(a) && Number.isFinite(h) && Number.isFinite(ri)) {
    const lo = Math.min(a, h);
    const hi = Math.max(a, h);
    if (ri < lo || ri > hi) return '';
    if (lo === hi) return 'only';
    if (ri === lo) return 'start';
    if (ri === hi) return 'end';
    return 'middle';
  }
  const role =
    typeof selectionBlockRole === 'function'
      ? selectionBlockRole(selection, row)
      : null;
  return role || '';
}

function selectionBlockRole(selection, row) {
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

function extractSelectedCodeText(virtualRows, selection) {
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
    if (row.raw && /^[-+]/.test(String(row.raw)) && code === String(row.raw)) {
      code = String(row.raw).slice(1);
    }
    lines.push(code);
  }
  return lines.join('\n');
}

function githubBlobLinePermalink(opts) {
  opts = opts || {};
  const owner = String(opts.owner || '').trim();
  const repo = String(opts.repo || '').trim();
  const path = String(opts.path || opts.filePath || '').replace(/^\/+/, '');
  const side = String(opts.side || opts.endSide || 'RIGHT').toUpperCase();
  const ref =
    side === 'LEFT'
      ? String(opts.baseSha || opts.baseRef || opts.ref || '').trim()
      : String(opts.headSha || opts.headRef || opts.ref || '').trim();
  if (!owner || !repo || !path || !ref) return '';
  const start = Number(opts.startLine != null ? opts.startLine : opts.line);
  const end = Number(
    opts.endLine != null ? opts.endLine : opts.startLine != null ? opts.startLine : opts.line
  );
  if (!Number.isFinite(start) || start < 1) return '';
  const origin = String(opts.webOrigin || 'https://github.com')
    .trim()
    .replace(/\/+$/, '');
  const encPath = path
    .split('/')
    .map(function (seg) {
      return encodeURIComponent(seg);
    })
    .join('/');
  const base =
    origin +
    '/' +
    encodeURIComponent(owner) +
    '/' +
    encodeURIComponent(repo) +
    '/blob/' +
    encodeURIComponent(ref) +
    '/' +
    encPath;
  if (Number.isFinite(end) && end > start) return base + '#L' + start + '-L' + end;
  return base + '#L' + start;
}

const api = {
  isSelectableDiffRow,
  lineForSide,
  beginLineSelection,
  extendLineSelection,
  parseGotoQuery,
  findSelectableRowForLine,
  selectionFromGoto,
  isFileCollapsedInVirtualRows,
  resolvePendingGotoSelection,
  resolveGotoPathAmongFiles,
  firstSelectableRowInFile,
  lastSelectableRowInFile,
  moveLineSelection,
  isSelectionAtFileEdge,
  SELECTION_ACTIONS_REVEAL_MS,
  applySelectionPointerDown,
  normalizeSelection,
  selectionToCommentPayload,
  finalizeSelection,
  selectionGestureMode,
  isRowInSelection,
  selectionBlockRole,
  rowSelectionVisualKey,
  extractSelectedCodeText,
  githubBlobLinePermalink,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}
if (typeof globalThis !== 'undefined') {
  globalThis.PRModalLineSelection = api;
}
