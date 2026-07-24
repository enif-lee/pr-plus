import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  FLOATING_SCROLLBAR_IDLE_MS,
  floatingScrollbarMetrics,
  scrollTopFromThumbDrag,
} from '../../lib/floating-scrollbar';

type Props = {
  /** Element that actually scrolls (overflow auto/scroll). */
  scrollerRef: React.RefObject<HTMLElement | null>;
  /** Recompute when virtual content size changes. */
  contentKey?: string | number;
  className?: string;
  /** Idle hide delay (ms). Default FLOATING_SCROLLBAR_IDLE_MS. */
  idleMs?: number;
  /** Vertical (default) or horizontal overlay thumb. */
  orientation?: 'vertical' | 'horizontal';
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
  orientation = 'vertical',
}: Props) {
  const horizontal = orientation === 'horizontal';
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [metrics, setMetrics] = useState(() => floatingScrollbarMetrics(0, 0, 0));
  const [active, setActive] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragging = useRef(false);
  const dragRef = useRef<{
    pointerId: number;
    startPos: number;
    startScroll: number;
  } | null>(null);

  const clearHideTimer = useCallback(() => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  }, []);

  const scheduleHide = useCallback(() => {
    clearHideTimer();
    if (dragging.current) return;
    hideTimer.current = setTimeout(() => {
      setActive(false);
      hideTimer.current = null;
    }, idleMs);
  }, [clearHideTimer, idleMs]);

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
    if (horizontal) {
      setMetrics(
        floatingScrollbarMetrics(el.scrollLeft, el.clientWidth, el.scrollWidth)
      );
    } else {
      setMetrics(
        floatingScrollbarMetrics(el.scrollTop, el.clientHeight, el.scrollHeight)
      );
    }
  }, [scrollerRef, horizontal]);

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
  }, [scrollerRef, recompute, markMoving, clearHideTimer, contentKey, horizontal]);

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
      startPos: horizontal ? e.clientX : e.clientY,
      startScroll: horizontal ? el.scrollLeft : el.scrollTop,
    };
  };

  const onThumbPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    const el = scrollerRef.current;
    if (!drag || !el || drag.pointerId !== e.pointerId) return;
    const client = horizontal ? el.clientWidth : el.clientHeight;
    const scroll = horizontal ? el.scrollWidth : el.scrollHeight;
    const maxScroll = scroll - client;
    if (maxScroll <= 0) return;
    const maxOffset = Math.max(1, client - metrics.thumbSize);
    const d = (horizontal ? e.clientX : e.clientY) - drag.startPos;
    const next = drag.startScroll + (d / maxOffset) * maxScroll;
    const clamped = Math.max(0, Math.min(maxScroll, next));
    if (horizontal) el.scrollLeft = clamped;
    else el.scrollTop = clamped;
    setActive(true);
  };

  const onThumbPointerUp = (e: React.PointerEvent) => {
    if (dragRef.current?.pointerId !== e.pointerId) return;
    dragRef.current = null;
    dragging.current = false;
    markMoving();
  };

  const onTrackPointerDown = (e: React.PointerEvent) => {
    const el = scrollerRef.current;
    const track = trackRef.current;
    if (!el || !track || !metrics.needed) return;
    if ((e.target as HTMLElement).closest('.prp-float-sb__thumb')) return;
    const rect = track.getBoundingClientRect();
    const pos = horizontal ? e.clientX - rect.left : e.clientY - rect.top;
    const next = scrollTopFromThumbDrag(
      pos,
      metrics.thumbSize,
      horizontal ? el.clientWidth : el.clientHeight,
      horizontal ? el.scrollWidth : el.scrollHeight
    );
    if (horizontal) el.scrollLeft = next;
    else el.scrollTop = next;
    markMoving();
  };

  if (!metrics.needed) return null;

  return (
    <div
      ref={trackRef}
      className={`prp-float-sb${horizontal ? ' prp-float-sb--horizontal' : ''}${
        active ? ' prp-float-sb--active' : ''
      }${className ? ` ${className}` : ''}`}
      aria-hidden="true"
      onPointerDown={onTrackPointerDown}
    >
      <div
        className="prp-float-sb__thumb"
        style={
          horizontal
            ? {
                width: metrics.thumbSize,
                height: '100%',
                transform: `translateX(${metrics.thumbOffset}px)`,
              }
            : {
                height: metrics.thumbSize,
                transform: `translateY(${metrics.thumbOffset}px)`,
              }
        }
        onPointerDown={onThumbPointerDown}
        onPointerMove={onThumbPointerMove}
        onPointerUp={onThumbPointerUp}
        onPointerCancel={onThumbPointerUp}
      />
    </div>
  );
}

export default FloatingScrollbar;
