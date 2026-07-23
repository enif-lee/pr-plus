import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  FLOATING_SCROLLBAR_IDLE_MS,
  floatingScrollbarMetrics,
  scrollTopFromThumbDrag,
} from '../../lib/floating-scrollbar';

type Props = {
  /** Element that actually scrolls (overflow auto/scroll). */
  scrollerRef: React.RefObject<HTMLElement | null>;
  /** Recompute when virtual content height changes. */
  contentKey?: string | number;
  className?: string;
  /** Idle hide delay (ms). Default FLOATING_SCROLLBAR_IDLE_MS. */
  idleMs?: number;
};

/**
 * Overlay scrollbar that paints over content (no layout gutter).
 * Shows while scrolling/dragging; auto-hides after idleMs with no movement.
 * Pair with `.prp-scroll-float` which hides the native bar in all browsers.
 */
export function FloatingScrollbar({
  scrollerRef,
  contentKey,
  className = '',
  idleMs = FLOATING_SCROLLBAR_IDLE_MS,
}: Props) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [metrics, setMetrics] = useState(() => floatingScrollbarMetrics(0, 0, 0));
  const [active, setActive] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragging = useRef(false);
  const dragRef = useRef<{
    pointerId: number;
    startY: number;
    startScrollTop: number;
  } | null>(null);

  const clearHideTimer = useCallback(() => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  }, []);

  const scheduleHide = useCallback(() => {
    clearHideTimer();
    // Keep visible while the user is dragging the thumb
    if (dragging.current) return;
    hideTimer.current = setTimeout(() => {
      setActive(false);
      hideTimer.current = null;
    }, idleMs);
  }, [clearHideTimer, idleMs]);

  /** Show bar and restart idle timer (scroll / track click). */
  const markMoving = useCallback(() => {
    setActive(true);
    scheduleHide();
  }, [scheduleHide]);

  const recompute = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) {
      setMetrics(floatingScrollbarMetrics(0, 0, 0));
      return;
    }
    setMetrics(
      floatingScrollbarMetrics(el.scrollTop, el.clientHeight, el.scrollHeight)
    );
  }, [scrollerRef]);

  useLayoutEffect(() => {
    recompute();
  }, [recompute, contentKey]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return undefined;

    const onScroll = () => {
      recompute();
      markMoving();
    };
    el.addEventListener('scroll', onScroll, { passive: true });

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver === 'function') {
      // Size only — do not flash (virtual list remeasures constantly)
      ro = new ResizeObserver(() => recompute());
      ro.observe(el);
    }

    const mo =
      typeof MutationObserver === 'function'
        ? new MutationObserver(() => recompute())
        : null;
    mo?.observe(el, { childList: true, subtree: true, characterData: true });

    const raf = requestAnimationFrame(() => recompute());

    recompute();
    return () => {
      el.removeEventListener('scroll', onScroll);
      ro?.disconnect();
      mo?.disconnect();
      cancelAnimationFrame(raf);
      clearHideTimer();
    };
  }, [scrollerRef, recompute, markMoving, clearHideTimer, contentKey]);

  const onThumbPointerDown = (e: React.PointerEvent) => {
    const el = scrollerRef.current;
    if (!el || !metrics.needed) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    dragging.current = true;
    clearHideTimer();
    setActive(true);
    dragRef.current = {
      pointerId: e.pointerId,
      startY: e.clientY,
      startScrollTop: el.scrollTop,
    };
  };

  const onThumbPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    const el = scrollerRef.current;
    if (!drag || !el || drag.pointerId !== e.pointerId) return;
    const ch = el.clientHeight;
    const sh = el.scrollHeight;
    const maxScroll = sh - ch;
    if (maxScroll <= 0) return;
    const maxTop = Math.max(1, ch - metrics.thumbHeight);
    const dy = e.clientY - drag.startY;
    const next = drag.startScrollTop + (dy / maxTop) * maxScroll;
    el.scrollTop = Math.max(0, Math.min(maxScroll, next));
    // scroll handler also markMoving; keep active while drag continues
    setActive(true);
  };

  const onThumbPointerUp = (e: React.PointerEvent) => {
    if (dragRef.current?.pointerId !== e.pointerId) return;
    dragRef.current = null;
    dragging.current = false;
    // Idle clock starts when the thumb is released
    markMoving();
  };

  const onTrackPointerDown = (e: React.PointerEvent) => {
    const el = scrollerRef.current;
    const track = trackRef.current;
    if (!el || !track || !metrics.needed) return;
    if ((e.target as HTMLElement).closest('.prp-float-sb__thumb')) return;
    const rect = track.getBoundingClientRect();
    const y = e.clientY - rect.top;
    el.scrollTop = scrollTopFromThumbDrag(
      y,
      metrics.thumbHeight,
      el.clientHeight,
      el.scrollHeight
    );
    markMoving();
  };

  if (!metrics.needed) return null;

  return (
    <div
      ref={trackRef}
      className={`prp-float-sb${active ? ' prp-float-sb--active' : ''}${
        className ? ` ${className}` : ''
      }`}
      aria-hidden="true"
      onPointerDown={onTrackPointerDown}
    >
      <div
        className="prp-float-sb__thumb"
        style={{
          height: metrics.thumbHeight,
          transform: `translateY(${metrics.thumbTop}px)`,
        }}
        onPointerDown={onThumbPointerDown}
        onPointerMove={onThumbPointerMove}
        onPointerUp={onThumbPointerUp}
        onPointerCancel={onThumbPointerUp}
      />
    </div>
  );
}

export default FloatingScrollbar;
