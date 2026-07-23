/**
 * Header action overflow: based on the modal/sheet (header) width, not the window.
 * CSS @container prp-header (max-width: HEADER_COMPACT_MAX_PX) must match this.
 */

/** Switch inline actions → ⋯ menu when the PR panel is at most this wide (px). */
export const HEADER_COMPACT_MAX_PX = 760;

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
