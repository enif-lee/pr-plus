import React, { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  clampTipCoords,
  resolveTipPlacement,
  viewportBounds,
  type TipPlacement,
} from './TipPopover';

/**
 * Option-hold shortcut badge above a control.
 * Uses the same placement + flip + viewport clamp helpers as TipPopover so
 * overflow:hidden parents never clip and off-screen edges flip to the opposite side.
 * Place inside an element with class `prp-opt-hint-host`.
 */
export function OptBtnHint({
  show,
  label,
  className = '',
  preferredPlacement = 'top',
}: {
  show?: boolean;
  label?: string | null;
  className?: string;
  preferredPlacement?: TipPlacement;
}) {
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const tipRef = useRef<HTMLSpanElement | null>(null);
  const [placement, setPlacement] = useState<TipPlacement>(preferredPlacement);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(
    null
  );
  const text = String(label || '').trim();

  useLayoutEffect(() => {
    if (!show || !text) {
      setCoords(null);
      return undefined;
    }
    const anchor = anchorRef.current;
    const host = (anchor?.closest('.prp-opt-hint-host') ||
      anchor?.parentElement) as HTMLElement | null;
    if (!host) {
      setCoords(null);
      return undefined;
    }

    /** Hosts in keep-alive inactive panels still layout — never portal over them. */
    const hostIsLive = () => {
      if (typeof host.checkVisibility === 'function') {
        try {
          if (
            !host.checkVisibility({
              checkOpacity: true,
              checkVisibilityCSS: true,
            } as any)
          ) {
            return false;
          }
        } catch {
          /* older engines */
        }
      }
      const panel = host.closest?.('.prp-body-panel') as HTMLElement | null;
      if (panel && !panel.classList.contains('prp-body-panel--active')) {
        return false;
      }
      const cs = getComputedStyle(host);
      if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) {
        return false;
      }
      const r = host.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };

    const update = () => {
      if (!hostIsLive()) {
        setCoords(null);
        return;
      }
      const tip = tipRef.current;
      const tipBox = tip
        ? {
            offsetHeight: tip.offsetHeight,
            offsetWidth: tip.offsetWidth,
            getBoundingClientRect: () => tip.getBoundingClientRect(),
          }
        : { offsetHeight: 20, offsetWidth: 48 };

      const next = resolveTipPlacement(host, tipBox, preferredPlacement);
      setPlacement((prev) => (prev === next ? prev : next));

      const hostRect = host.getBoundingClientRect();
      const tipW = Math.max(
        Number(tipBox.offsetWidth) || 0,
        tipBox.getBoundingClientRect?.()?.width || 0,
        40
      );
      const tipH = Math.max(
        Number(tipBox.offsetHeight) || 0,
        tipBox.getBoundingClientRect?.()?.height || 0,
        18
      );
      const gap = 8;
      const cx = hostRect.left + hostRect.width / 2;
      const cy = hostRect.top + hostRect.height / 2;
      let top = 0;
      let left = 0;
      if (next === 'top') {
        top = hostRect.top - gap;
        left = cx;
      } else if (next === 'bottom') {
        top = hostRect.bottom + gap;
        left = cx;
      } else if (next === 'left') {
        top = cy;
        left = hostRect.left - gap;
      } else {
        top = cy;
        left = hostRect.right + gap;
      }
      setCoords(
        clampTipCoords(next, { top, left }, tipW, tipH, viewportBounds())
      );
    };

    update();
    // Second pass after portal paints real tip size
    const raf = requestAnimationFrame(update);
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(update);
      ro.observe(host);
    }
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [show, text, preferredPlacement]);

  return (
    <>
      <span
        ref={anchorRef}
        className="prp-opt-btn-hint-anchor"
        aria-hidden="true"
      />
      {show && text && coords && typeof document !== 'undefined'
        ? createPortal(
            <kbd
              ref={tipRef}
              className={`prp-opt-btn-hint prp-opt-btn-hint--fixed prp-opt-btn-hint--${placement} ${className}`.trim()}
              style={{ top: coords.top, left: coords.left }}
              data-placement={placement}
              aria-hidden="true"
            >
              {text}
            </kbd>,
            document.body
          )
        : null}
    </>
  );
}
