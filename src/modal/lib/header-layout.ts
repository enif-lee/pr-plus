/**
 * Header layout modes.
 *
 * 1. **Review compact** — forced single-line chrome in Diff view so the viewport
 *    favors the file list + diff (review environment).
 * 2. **Width dense** — same single-line layout when the panel is narrow
 *    (conversation or diff), via CSS @container.
 * 3. **Actions overflow** — inline icons → ⋯ menu when even narrower.
 *
 * CSS @container prp-header rules must stay in sync with HEADER_*_MAX_PX.
 */

/** Diff layout id used by the modal (matches layout-mode.LAYOUT_DIFF). */
export const HEADER_LAYOUT_DIFF = 'diff';

/**
 * Dense single-line header when panel is this wide or narrower.
 * CSS: @container prp-header (max-width: 960px)
 */
export const HEADER_DENSE_MAX_PX = 960;

/**
 * Actions overflow (inline icons → ⋯ menu).
 * CSS: @container prp-header (max-width: 760px)
 */
export const HEADER_COMPACT_MAX_PX = 760;

/**
 * Whether the panel is narrow enough for dense (single-line) chrome by width alone.
 */
export function headerDenseLayout(
  widthPx: unknown,
  maxPx: number = HEADER_DENSE_MAX_PX
): boolean {
  const w = Number(widthPx);
  if (!Number.isFinite(w) || w <= 0) return false;
  return w <= maxPx;
}

/**
 * Whether header actions should use the overflow menu for a measured panel width.
 */
export function headerActionsCompact(
  widthPx: unknown,
  maxPx: number = HEADER_COMPACT_MAX_PX
): boolean {
  const w = Number(widthPx);
  if (!Number.isFinite(w) || w <= 0) return false;
  return w <= maxPx;
}

/**
 * Review compact mode: branch + actions share the identity line.
 *
 * - Always on in Diff view (maximize review surface).
 * - Also on when panel width is ≤ HEADER_DENSE_MAX_PX (any layout).
 *
 * @param {{ layoutMode?: string|null, widthPx?: unknown }} opts
 */
export function headerReviewCompact(opts: {
  layoutMode?: string | null;
  widthPx?: unknown;
} = {}): boolean {
  const mode = String(opts.layoutMode || '').toLowerCase();
  if (mode === HEADER_LAYOUT_DIFF || mode === 'diff') return true;
  return headerDenseLayout(opts.widthPx);
}
