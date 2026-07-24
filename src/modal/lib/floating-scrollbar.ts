/**
 * Pure metrics for an overlay (floating) scrollbar thumb.
 * Native scrollbars are hidden; this paints a bar over content without layout width.
 * Same math for vertical (scrollTop/height) and horizontal (scrollLeft/width).
 */

export type FloatingScrollbarMetrics = {
  /** Whether content overflows enough to show a bar */
  needed: boolean;
  /** Thumb length along the scroll axis (height vertical, width horizontal) */
  thumbSize: number;
  /** Thumb offset along the track (top vertical, left horizontal) */
  thumbOffset: number;
  /** Track / viewport size on the scroll axis */
  trackSize: number;
  /** @deprecated use thumbSize — kept for callers/tests */
  thumbHeight: number;
  /** @deprecated use thumbOffset */
  thumbTop: number;
  /** @deprecated use trackSize */
  trackHeight: number;
};

const MIN_THUMB = 28;

/** Hide overlay thumb after this many ms without scroll/drag movement. */
export const FLOATING_SCROLLBAR_IDLE_MS = 1000;

/**
 * @param scrollPos scrollTop or scrollLeft
 * @param clientSize viewport height or width
 * @param scrollSize full content height or width
 */
export function floatingScrollbarMetrics(
  scrollPos: unknown,
  clientSize: unknown,
  scrollSize: unknown
): FloatingScrollbarMetrics {
  const st = Number(scrollPos) || 0;
  const ch = Number(clientSize) || 0;
  const sh = Number(scrollSize) || 0;
  if (!(ch > 0) || !(sh > ch + 1)) {
    const empty = {
      needed: false,
      thumbSize: 0,
      thumbOffset: 0,
      trackSize: Math.max(0, ch),
      thumbHeight: 0,
      thumbTop: 0,
      trackHeight: Math.max(0, ch),
    };
    return empty;
  }
  const thumbSize = Math.max(MIN_THUMB, Math.round((ch / sh) * ch));
  const maxScroll = sh - ch;
  const maxOffset = ch - thumbSize;
  const thumbOffset =
    maxScroll <= 0
      ? 0
      : Math.round((Math.min(st, maxScroll) / maxScroll) * maxOffset);
  const clamped = Math.max(0, Math.min(maxOffset, thumbOffset));
  return {
    needed: true,
    thumbSize,
    thumbOffset: clamped,
    trackSize: ch,
    thumbHeight: thumbSize,
    thumbTop: clamped,
    trackHeight: ch,
  };
}

/**
 * Map a pointer position (relative to track start) to scroll position for drag/click.
 * Works for both axes.
 */
export function scrollTopFromThumbDrag(
  pointerInTrack: unknown,
  thumbSize: unknown,
  clientSize: unknown,
  scrollSize: unknown
): number {
  const y = Number(pointerInTrack);
  const th = Number(thumbSize);
  const ch = Number(clientSize);
  const sh = Number(scrollSize);
  if (!Number.isFinite(y) || !(ch > 0) || !(sh > ch)) return 0;
  const maxTop = Math.max(1, ch - Math.max(MIN_THUMB, th || MIN_THUMB));
  const maxScroll = sh - ch;
  const top = Math.max(0, Math.min(maxTop, y - (th || MIN_THUMB) / 2));
  return Math.round((top / maxTop) * maxScroll);
}

/** Alias for horizontal clarity */
export const scrollPosFromThumbDrag = scrollTopFromThumbDrag;
