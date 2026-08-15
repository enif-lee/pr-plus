/**
 * Header layout modes.
 *
 * 1. **Review compact** — Diff view only: denser chrome so the viewport favors
 *    the file list + diff (review environment). Conversation always uses the
 *    standard 2-row header (no width-based densify).
 * 2. **Narrow panels** — keep the same structure and all action icons; the title
 *    shrinks (fluid font-size + ellipsis) via CSS on the panel container.
 *
 * Container is `.prp-modal` (`prp-panel`) so title `cqi` units track panel width.
 */

/** Diff layout id used by the modal (matches layout-mode.LAYOUT_DIFF). */
export const HEADER_LAYOUT_DIFF = 'diff';

/**
 * @deprecated Width-based dense chrome was removed. Kept as 0 so callers that
 * still pass widthPx never densify conversation by size.
 */
export const HEADER_DENSE_MAX_PX = 0;

/**
 * @deprecated Actions overflow (⋯ menu) was removed. Always show inline icons;
 * narrow layouts shrink the title instead.
 */
export const HEADER_COMPACT_MAX_PX = 0;

/**
 * @deprecated Always false — narrow panels no longer switch to dense chrome.
 */
export function headerDenseLayout(
  _widthPx?: unknown,
  _maxPx?: number
): boolean {
  return false;
}

/**
 * @deprecated Always false — actions stay inline at every width.
 */
export function headerActionsCompact(
  _widthPx?: unknown,
  _maxPx?: number
): boolean {
  return false;
}

/**
 * Review compact mode: Diff layout only (maximize review surface).
 * Conversation keeps the standard 2-row header at every width.
 *
 * @param {{ layoutMode?: string|null, widthPx?: unknown }} opts
 *   `widthPx` is ignored (kept for call-site compatibility).
 */
export function headerReviewCompact(opts: {
  layoutMode?: string | null;
  widthPx?: unknown;
} = {}): boolean {
  const mode = String(opts.layoutMode || '').toLowerCase();
  return mode === HEADER_LAYOUT_DIFF || mode === 'diff';
}
