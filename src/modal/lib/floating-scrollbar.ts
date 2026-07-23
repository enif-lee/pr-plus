/**
 * Pure metrics for an overlay (floating) scrollbar thumb.
 * Native scrollbars are hidden; this paints a bar over content without layout width.
 */

export type FloatingScrollbarMetrics = {
  /** Whether content overflows enough to show a bar */
  needed: boolean;
  /** Thumb height in px */
  thumbHeight: number;
  /** Thumb offset from top of track in px */
  thumbTop: number;
  /** Track / viewport height */
  trackHeight: number;
};

const MIN_THUMB = 28;

/** Hide overlay thumb after this many ms without scroll/drag movement. */
export const FLOATING_SCROLLBAR_IDLE_MS = 1000;

/**
 * @param scrollTop
 * @param clientHeight viewport height
 * @param scrollHeight full content height
 */
export function floatingScrollbarMetrics(
  scrollTop: unknown,
  clientHeight: unknown,
  scrollHeight: unknown
): FloatingScrollbarMetrics {
  const st = Number(scrollTop) || 0;
  const ch = Number(clientHeight) || 0;
  const sh = Number(scrollHeight) || 0;
  if (!(ch > 0) || !(sh > ch + 1)) {
    return { needed: false, thumbHeight: 0, thumbTop: 0, trackHeight: Math.max(0, ch) };
  }
  const thumbHeight = Math.max(MIN_THUMB, Math.round((ch / sh) * ch));
  const maxScroll = sh - ch;
  const maxTop = ch - thumbHeight;
  const thumbTop =
    maxScroll <= 0 ? 0 : Math.round((Math.min(st, maxScroll) / maxScroll) * maxTop);
  return {
    needed: true,
    thumbHeight,
    thumbTop: Math.max(0, Math.min(maxTop, thumbTop)),
    trackHeight: ch,
  };
}

/**
 * Map a pointer Y (relative to track top) to scrollTop for drag.
 */
export function scrollTopFromThumbDrag(
  pointerYInTrack: unknown,
  thumbHeight: unknown,
  clientHeight: unknown,
  scrollHeight: unknown
): number {
  const y = Number(pointerYInTrack);
  const th = Number(thumbHeight);
  const ch = Number(clientHeight);
  const sh = Number(scrollHeight);
  if (!Number.isFinite(y) || !(ch > 0) || !(sh > ch)) return 0;
  const maxTop = Math.max(1, ch - Math.max(MIN_THUMB, th || MIN_THUMB));
  const maxScroll = sh - ch;
  const top = Math.max(0, Math.min(maxTop, y - (th || MIN_THUMB) / 2));
  return Math.round((top / maxTop) * maxScroll);
}
