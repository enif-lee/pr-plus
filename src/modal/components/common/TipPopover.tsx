import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type TipPlacement = 'top' | 'bottom' | 'left' | 'right';

type Coords = { top: number; left: number };

/**
 * Hover/focus tip popover.
 *
 * Portaled into `.prp-overlay` (or `document.body`) with `position: fixed` so
 * parent `overflow: hidden` never clips it. z-index sits above modal chrome.
 */
export function TipPopover({
  title,
  shortcut,
  preferredPlacement,
}: {
  title?: string | null;
  shortcut?: string | null;
  /**
   * Preferred side. When omitted, infers from host context:
   * compact aside → left, collapse chevron → bottom, else top.
   */
  preferredPlacement?: TipPlacement;
}) {
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const tipRef = useRef<HTMLSpanElement | null>(null);
  const preferredRef = useRef<TipPlacement>(preferredPlacement || 'top');
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<TipPlacement>(
    preferredPlacement || 'top'
  );
  const [coords, setCoords] = useState<Coords>({ top: 0, left: 0 });

  const tipLabel = title ? String(title).trim() : '';
  const tipKbd = shortcut ? String(shortcut).trim() : '';
  const hasContent = Boolean(tipLabel || tipKbd);

  const getHost = useCallback((): HTMLElement | null => {
    return (anchorRef.current?.parentElement as HTMLElement | null) || null;
  }, []);

  const remeasure = useCallback(() => {
    const host = getHost();
    const tip = tipRef.current;
    if (!host) return;

    const preferred =
      preferredPlacement ||
      inferPreferredPlacement(host) ||
      preferredRef.current ||
      'top';
    preferredRef.current = preferred;

    // Prefer measured tip size; fall back to estimate before first paint
    const tipBox = tip
      ? {
          offsetHeight: tip.offsetHeight,
          offsetWidth: tip.offsetWidth,
          getBoundingClientRect: () => tip.getBoundingClientRect(),
        }
      : { offsetHeight: 36, offsetWidth: 120 };

    const next = resolveTipPlacement(host, tipBox, preferred);
    setPlacement((prev) => (prev === next ? prev : next));

    const hostRect = host.getBoundingClientRect();
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
    setCoords({ top, left });
  }, [getHost, preferredPlacement]);

  useEffect(() => {
    if (!hasContent) return undefined;
    const host = getHost();
    if (!host) return undefined;

    if (!preferredPlacement) {
      preferredRef.current = inferPreferredPlacement(host);
      setPlacement(preferredRef.current);
    }

    const show = () => setOpen(true);
    const hide = () => setOpen(false);
    const onFocusOut = (e: FocusEvent) => {
      const next = e.relatedTarget as Node | null;
      if (next && host.contains(next)) return;
      hide();
    };

    host.addEventListener('mouseenter', show);
    host.addEventListener('mouseleave', hide);
    host.addEventListener('focusin', show);
    host.addEventListener('focusout', onFocusOut);
    return () => {
      host.removeEventListener('mouseenter', show);
      host.removeEventListener('mouseleave', hide);
      host.removeEventListener('focusin', show);
      host.removeEventListener('focusout', onFocusOut);
    };
  }, [getHost, hasContent, preferredPlacement]);

  useLayoutEffect(() => {
    if (!open || !hasContent) return undefined;
    remeasure();
    const id =
      typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame(() => remeasure())
        : 0;
    window.addEventListener('scroll', remeasure, true);
    window.addEventListener('resize', remeasure);
    return () => {
      if (id && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(id);
      }
      window.removeEventListener('scroll', remeasure, true);
      window.removeEventListener('resize', remeasure);
    };
  }, [open, hasContent, remeasure, tipLabel, tipKbd]);

  if (!hasContent) return null;

  const portalRoot =
    (typeof document !== 'undefined' &&
      (document.querySelector('.prp-overlay') as HTMLElement | null)) ||
    (typeof document !== 'undefined' ? document.body : null);

  const tipNode = (
    <span
      ref={tipRef}
      className={`prp-tip-pop prp-tip-pop--portal prp-tip-pop--${placement}${
        open ? ' prp-tip-pop--visible' : ''
      }`}
      data-placement={placement}
      data-open={open ? '1' : '0'}
      role="tooltip"
      style={{
        top: coords.top,
        left: coords.left,
      }}
    >
      {tipLabel ? <span className="prp-tip-pop__label">{tipLabel}</span> : null}
      {tipKbd ? <kbd className="prp-tip-pop__kbd">{tipKbd}</kbd> : null}
    </span>
  );

  return (
    <>
      {/* Zero-size marker so we can find the host (parent) element */}
      <span ref={anchorRef} className="prp-tip-anchor" aria-hidden="true" />
      {portalRoot ? createPortal(tipNode, portalRoot) : tipNode}
    </>
  );
}

/** True when TipPopover would render something. */
export function hasTipContent(title?: string | null, shortcut?: string | null) {
  return Boolean(
    (title && String(title).trim()) || (shortcut && String(shortcut).trim())
  );
}

/** Context-based preferred side when prop is omitted. */
export function inferPreferredPlacement(host: HTMLElement | null): TipPlacement {
  if (!host || typeof host.closest !== 'function') return 'top';
  if (host.closest('.prp-aside-compact')) return 'left';
  if (host.closest('.prp-aside-collapse-btn')) return 'bottom';
  // Floating selection group often sits near bottom of viewport
  if (host.closest('.prp-selection-group')) return 'top';
  return 'top';
}

/**
 * Pick a placement that fits inside the modal (or viewport) bounds.
 * Pure helper — exported for unit tests.
 */
export function resolveTipPlacement(
  host: {
    getBoundingClientRect: () =>
      | DOMRect
      | { top: number; left: number; right: number; bottom: number; width: number; height: number };
  },
  tip: {
    offsetHeight?: number;
    offsetWidth?: number;
    getBoundingClientRect?: () =>
      | DOMRect
      | { width: number; height: number };
  },
  preferred: TipPlacement = 'top',
  opts: {
    gap?: number;
    bounds?: { top: number; left: number; right: number; bottom: number };
    viewport?: { width: number; height: number };
  } = {}
): TipPlacement {
  const gap = Number.isFinite(opts.gap) ? Number(opts.gap) : 8;
  const hostRect = host.getBoundingClientRect();
  const tipH = Math.max(
    Number(tip.offsetHeight) || 0,
    tip.getBoundingClientRect?.()?.height || 0,
    28
  );
  const tipW = Math.max(
    Number(tip.offsetWidth) || 0,
    tip.getBoundingClientRect?.()?.width || 0,
    80
  );

  const vw =
    opts.viewport?.width ??
    (typeof window !== 'undefined' ? window.innerWidth : 1200);
  const vh =
    opts.viewport?.height ??
    (typeof window !== 'undefined' ? window.innerHeight : 800);

  let bounds = opts.bounds;
  if (!bounds && typeof document !== 'undefined') {
    const hostEl = host as HTMLElement;
    const root =
      typeof hostEl.closest === 'function'
        ? (hostEl.closest(
            '.prp-modal, .prp-shell, [role="dialog"], .prp-overlay'
          ) as HTMLElement | null)
        : null;
    if (root) {
      const r = root.getBoundingClientRect();
      bounds = { top: r.top, left: r.left, right: r.right, bottom: r.bottom };
    }
  }
  if (!bounds) {
    bounds = { top: 0, left: 0, right: vw, bottom: vh };
  }

  const space = {
    top: hostRect.top - bounds.top,
    bottom: bounds.bottom - hostRect.bottom,
    left: hostRect.left - bounds.left,
    right: bounds.right - hostRect.right,
  };

  const needV = tipH + gap;
  const needH = tipW + gap;

  const axisVertical = preferred === 'top' || preferred === 'bottom';
  if (axisVertical) {
    const primary = preferred;
    const fallback: TipPlacement = preferred === 'top' ? 'bottom' : 'top';
    if (space[primary] >= needV) return primary;
    if (space[fallback] >= needV) return fallback;
    return space.bottom >= space.top ? 'bottom' : 'top';
  }

  const primary = preferred;
  const fallback: TipPlacement = preferred === 'left' ? 'right' : 'left';
  if (space[primary] >= needH) return primary;
  if (space[fallback] >= needH) return fallback;
  return space.right >= space.left ? 'right' : 'left';
}
