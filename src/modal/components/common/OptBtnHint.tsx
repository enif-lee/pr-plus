import React, { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  clampTipCoords,
  resolveTipPlacement,
  viewportBounds,
  type TipPlacement,
} from './TipPopover';
import { useModalStore } from '../../store/modal-store';

/**
 * Option-hold shortcut badge above a control.
 * Uses the same placement + flip + viewport clamp helpers as TipPopover so
 * overflow:hidden parents never clip and off-screen edges flip to the opposite side.
 * Place inside an element with class `prp-opt-hint-host`.
 *
 * `show` optional override (tests). Default: store `optHintsActive` so parents
 * need not re-render on Opt press — only this leaf subscribes.
 */
export function OptBtnHint({
  show: showProp,
  label,
  className = '',
  preferredPlacement = 'top',
}: {
  show?: boolean;
  label?: string | null;
  className?: string;
  preferredPlacement?: TipPlacement;
}) {
  const storeShow = useModalStore((s) => s.optHintsActive);
  const show = showProp !== undefined ? Boolean(showProp) : storeShow;
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

    /**
     * Measure against a box with real size. Zero-size hosts (absolute
     * width/height:0 tip slots) climb to a sized ancestor.
     */
    const measureHost = (): HTMLElement | null => {
      let el: HTMLElement | null = host;
      for (let i = 0; i < 4 && el; i++) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) return el;
        el = el.parentElement;
      }
      return host;
    };

    /** Hosts in keep-alive inactive panels still layout — never portal over them. */
    const hostIsLive = (box: HTMLElement) => {
      if (typeof box.checkVisibility === 'function') {
        try {
          if (
            !box.checkVisibility({
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
      const panel = box.closest?.('.prp-body-panel') as HTMLElement | null;
      if (panel && !panel.classList.contains('prp-body-panel--active')) {
        return false;
      }
      const cs = getComputedStyle(box);
      if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) {
        return false;
      }
      const r = box.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };

    const update = () => {
      const box = measureHost();
      if (!box || !hostIsLive(box)) {
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

      const next = resolveTipPlacement(box, tipBox, preferredPlacement);
      setPlacement((prev) => (prev === next ? prev : next));

      const hostRect = box.getBoundingClientRect();
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
