/** @module modal/lib/line-selection-range */
/**
 * Multi-line extend, change-region hops, island dock geometry, pointer select.
 */
import {
  beginLineSelection,
  beginSelectionOnRow,
  extendLineSelection,
  isCodeBodySelection,
  isFileHeaderRow,
  isFileLevelSelection,
  isInlineCommentRow,
  isSelectableDiffRow,
  isSingleLineCaretSelection,
  isThreadSelection,
  lineForSideStrict,
  rowMatchesLineSide,
} from './line-selection-nav';

export const SELECTION_ACTIONS_REVEAL_MS = 450;

/**
 * documentElement attribute while keyboard/pointer selection nav is in flight
 * or within the settle window. OptBtnHint + CSS hide badges; floatbar stays down.
 */
export const SELECTION_NAV_BUSY_ATTR = 'data-prp-selection-nav';

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
 * Hide while actively dragging a selection **or** selection nav is busy
 * (↑↓ jump settle window — delayed floatbar).
 */
export function shouldShowSelectionActionGroup(opts: {
  hasLineOrFileSelection?: boolean;
  selecting?: boolean;
  optHeld?: boolean;
  hoverReveal?: boolean;
  /** Keyboard/region selection jump in flight or settling */
  selectionNavBusy?: boolean;
  /** 'comment' keeps island open without Opt/hover */
  phase?: 'actions' | 'comment' | string | null;
} = {}): boolean {
  if (!opts.hasLineOrFileSelection) return false;
  if (opts.selecting) return false;
  if (String(opts.phase || '') === 'comment') return true;
  // Jump settle: keep floatbar down even if Opt is held
  if (opts.selectionNavBusy) return false;
  return Boolean(opts.optHeld || opts.hoverReveal);
}

/** Estimated action floatbar height (segmented Comment / Copy / …). */
export const SELECTION_DOCK_ACTIONS_H_EST = 40;
/** Estimated comment island height floor. */
export const SELECTION_DOCK_COMMENT_H_EST = 160;
/**
 * OptBtnHint strip outside the bar (badge ~18 + gap ~8).
 * Always reserved for actions so Opt-hold does not clip after flip.
 */
export const SELECTION_DOCK_OPT_HINT_H_EST = 26;
export const SELECTION_DOCK_GAP_EST = 6;

/**
 * Vertical space required on the dock side (bar + optional Opt hint strip).
 * Actions always reserve the Opt hint strip (hints appear with Opt-hold).
 */
export function selectionDockSideNeed(opts: {
  dockHeight?: number;
  phase?: 'actions' | 'comment' | string | null;
  /** Default true for actions — include OptBtnHint strip in the need. */
  includeOptHints?: boolean;
  gap?: number;
} = {}): number {
  const phase = String(opts.phase || 'actions');
  const measured = Math.max(0, Number(opts.dockHeight) || 0);
  const base =
    phase === 'comment'
      ? Math.max(measured, SELECTION_DOCK_COMMENT_H_EST)
      : Math.max(measured, SELECTION_DOCK_ACTIONS_H_EST);
  const includeHints =
    opts.includeOptHints !== false && phase !== 'comment';
  const hint = includeHints ? SELECTION_DOCK_OPT_HINT_H_EST : 0;
  const gap = Number.isFinite(Number(opts.gap))
    ? Math.max(0, Number(opts.gap))
    : SELECTION_DOCK_GAP_EST;
  return base + hint + gap;
}

/**
 * OptBtnHint preferred placement relative to the floatbar:
 * - dock **above** selection → hints further up (`top`)
 * - dock **below** selection → hints further down (`bottom`)
 */
export function preferredOptHintPlacementForDock(
  dockPlace: 'above' | 'below' | string | null | undefined
): 'top' | 'bottom' {
  return String(dockPlace || '') === 'above' ? 'top' : 'bottom';
}

/**
 * Whether this painted row should host the selection floatbar.
 * Multi-line: dock follows the **head (caret)**, not always the range bottom —
 * room is judged from the cursor edge (fixes false “enough room below” when
 * the caret is at the top of a multi-line selection).
 */
export function isSelectionDockHostRow(selection: any, row: any): boolean {
  if (!selection || !row) return false;
  if (isFileLevelSelection(selection)) {
    if (!isFileHeaderRow(row)) return false;
    return (
      String(row.filePath || row.path || '') ===
      String(selection.filePath || '')
    );
  }
  if (isThreadSelection(selection)) {
    return (
      isInlineCommentRow(row) &&
      String(row.commentId) === String(selection.commentId)
    );
  }
  if (row.filePath !== selection.filePath) return false;
  if (!isSelectableDiffRow(row) && !isFileHeaderRow(row)) return false;

  const h = Number(selection.headRowIndex);
  const ri = Number(row.rowIndex);
  if (Number.isFinite(h) && Number.isFinite(ri)) {
    return h === ri;
  }
  // Fallback: single-line by line+side
  if (isSingleLineCaretSelection(selection)) {
    return rowMatchesLineSide(
      row,
      selection.headLine,
      selection.headSide || selection.anchorSide
    );
  }
  // Last resort: range end (max index)
  const a = Number(selection.anchorRowIndex);
  if (Number.isFinite(a) && Number.isFinite(ri)) {
    return ri === Math.max(a, h);
  }
  return false;
}

/**
 * Head’s role inside a multi-line block (for outward dock preference).
 * - start: caret on top edge of the block → prefer dock **above**
 * - end: caret on bottom edge → prefer dock **below**
 * - only: single-line caret
 */
export function selectionHeadBlockRole(
  selection: any
): 'start' | 'end' | 'only' | null {
  if (!selection) return null;
  if (
    isFileLevelSelection(selection) ||
    isThreadSelection(selection) ||
    isSingleLineCaretSelection(selection)
  ) {
    return 'only';
  }
  const a = Number(selection.anchorRowIndex);
  const h = Number(selection.headRowIndex);
  if (!Number.isFinite(a) || !Number.isFinite(h)) return 'only';
  if (a === h) return 'only';
  const lo = Math.min(a, h);
  const hi = Math.max(a, h);
  if (h === lo) return 'start';
  if (h === hi) return 'end';
  return 'only';
}

/**
 * Prefer docking the selection UI **below** the host (caret) row; flip
 * **above** when below is tight. Multi-line head-at-start prefers **above**
 * (outward from the block) so we do not treat “space under the caret into the
 * selected body” as free room for the floatbar.
 *
 * `need` includes the OptBtnHint strip for actions (see selectionDockSideNeed).
 *
 * Pure geometry — used by SelectionCommentBar layout effect.
 */
export function resolveSelectionDockVerticalPlacement(opts: {
  /** Dock host (caret) row bottom (viewport coords) */
  hostBottom?: number;
  /** Dock host (caret) row top */
  hostTop?: number;
  /**
   * Full multi-line selection extent (optional). When provided, “below” room
   * uses max(hostBottom, selectionBottom) so a head-at-top multi-line near the
   * scroller bottom is not judged as having free space under the caret alone.
   */
  selectionTop?: number;
  selectionBottom?: number;
  /** Measured dock height (comment island ~160–220; actions ~40) */
  dockHeight?: number;
  /** Clip rect top (scroller or viewport) */
  clipTop?: number;
  /** Clip rect bottom */
  clipBottom?: number;
  gap?: number;
  /**
   * Minimum free space required on a side. Defaults to selectionDockSideNeed.
   */
  minBelow?: number;
  phase?: 'actions' | 'comment' | string | null;
  /** Reserve Opt hint strip (default true for actions). */
  includeOptHints?: boolean;
  /**
   * Head role in multi-line block — `start` prefers above when that side fits.
   */
  headBlockRole?: 'start' | 'end' | 'only' | null;
} = {}): 'below' | 'above' {
  const gap = Number.isFinite(Number(opts.gap))
    ? Math.max(0, Number(opts.gap))
    : SELECTION_DOCK_GAP_EST;
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

  const selBottom = Number(opts.selectionBottom);
  const selTop = Number(opts.selectionTop);
  // Outward edges of the multi-line block (fallback: caret host)
  const blockBottom =
    Number.isFinite(selBottom) ? Math.max(hostBottom, selBottom) : hostBottom;
  const blockTop =
    Number.isFinite(selTop) ? Math.min(hostTop, selTop) : hostTop;

  const need = Math.max(
    selectionDockSideNeed({
      dockHeight: opts.dockHeight,
      phase: opts.phase,
      includeOptHints: opts.includeOptHints,
      gap: 0,
    }),
    Number.isFinite(Number(opts.minBelow)) ? Number(opts.minBelow) : 0
  );

  // Room outside the full selection block (not “into” multi-line body)
  const spaceBelow = clipBottom - blockBottom - gap;
  const spaceAbove = blockTop - clipTop - gap;
  const role = opts.headBlockRole || null;

  // Prefer outward from multi-line body when that side fits (incl. Opt hints)
  if (role === 'start' && spaceAbove >= need) return 'above';
  if (role === 'end' && spaceBelow >= need) return 'below';
  if ((role === 'only' || !role) && spaceBelow >= need) return 'below';

  if (spaceBelow >= need) return 'below';
  if (spaceAbove >= need) return 'above';
  // Neither side fully fits — pick the larger free side
  if (spaceAbove > spaceBelow && spaceAbove >= 24) return 'above';
  if (spaceBelow < 24 && spaceAbove >= spaceBelow) return 'above';
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
export function applySelectionPointerDown(currentSelection: any, row: any, opts: any = {}) {
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
export function orderedSelectionEnds(selection: any) {
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
