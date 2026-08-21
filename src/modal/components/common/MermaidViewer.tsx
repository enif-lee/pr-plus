import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconX } from './icons';
import { resolveMermaidColorMode } from '../../lib/mermaid-lazy';
import { useModalStore } from '../../store/modal-store';
import { registerEscapeOverlay } from '../../lib/escape-layer';
import {
  applyViewerKeyGesture,
  applyViewerWheelEvent,
  fitMermaidToStage,
  identityMermaidTransform,
  mapViewerKeyGesture,
  measureMermaidSvgSize,
  mermaidPointerDistance,
  mermaidPointerMidpoint,
  mermaidTransformStyle,
  panMermaidTransform,
  pinchMermaidTransform,
  prepareMermaidSvgForViewer,
  type MermaidPoint,
  type MermaidViewTransform,
} from '../../lib/mermaid-viewer';

type Props = {
  svg: string;
  onClose: () => void;
  title?: string;
};

function resolvePortalHost(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  const overlay = document.querySelector('.prp-overlay') as HTMLElement | null;
  return overlay || document.body;
}

/**
 * Fullscreen overlay for a rendered Mermaid SVG (portaled into .prp-overlay).
 * - Opens centered + fit-to-stage (vector scale)
 * - Scroll pan · Opt+scroll / Opt± zoom · arrows pan 48px · drag/pinch
 * - Mid-gesture transform is DOM-only (`paintTransform`); React commits on idle/end
 * - Esc closes viewer only (not the PR modal)
 */
export function MermaidViewer({ svg, onClose, title = 'Diagram' }: Props) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const contentSizeRef = useRef({ w: 0, h: 0 });
  /** Live transform — written during gestures without waiting on React. */
  const xfRef = useRef<MermaidViewTransform>(identityMermaidTransform());
  const [xf, setXf] = useState<MermaidViewTransform>(() => identityMermaidTransform());
  const pointersRef = useRef<Map<number, MermaidPoint>>(new Map());
  const dragRef = useRef<{
    pointerId: number;
    lastX: number;
    lastY: number;
  } | null>(null);
  const pinchRef = useRef<{
    dist: number;
    mid: MermaidPoint;
  } | null>(null);
  const wheelIdleTimerRef = useRef(0);
  const [panning, setPanning] = useState(false);
  const colorMode = resolveMermaidColorMode();
  const portalHost = useMemo(() => resolvePortalHost(), []);
  const viewerSvg = useMemo(() => prepareMermaidSvgForViewer(svg), [svg]);

  const paintTransform = useCallback((next: MermaidViewTransform) => {
    xfRef.current = next;
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.style.transform = mermaidTransformStyle(next);
    }
  }, []);

  const commitTransform = useCallback(
    (next: MermaidViewTransform) => {
      paintTransform(next);
      setXf(next);
    },
    [paintTransform]
  );

  // After any React paint (e.g. setPanning), re-apply live ref transform so
  // style={{ transform: xf }} cannot clobber mid-gesture DOM paints.
  useLayoutEffect(() => {
    paintTransform(xfRef.current);
  });

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    return registerEscapeOverlay(() => onCloseRef.current());
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const gesture = mapViewerKeyGesture({
        key: e.key,
        code: e.code,
        altKey: e.altKey,
        metaKey: e.metaKey,
        ctrlKey: e.ctrlKey,
        shiftKey: e.shiftKey,
      });
      if (!gesture) return;
      if (gesture.kind === 'close') {
        // Overlay stack pops Esc; this listener only owns pan/zoom.
        return;
      }
      // Stage-center pivot for keyboard zoom
      const stage = stageRef.current;
      let pivot: MermaidPoint | null = null;
      if (gesture.kind === 'zoom' && stage) {
        pivot = {
          x: stage.clientWidth / 2,
          y: stage.clientHeight / 2,
        };
      }
      const next = applyViewerKeyGesture(xfRef.current, gesture, pivot);
      if (!next) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      // Discrete keys: commit React (not continuous rAF shutter risk)
      commitTransform(next);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose, commitTransform]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Hide Opt-hold tips that were already painted under the veil
    try {
      useModalStore.getState().setOptHintsActive(false);
    } catch {
      /* ignore */
    }
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const fitToStage = useCallback(() => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    if (!stage || !canvas) return;
    const svgEl = canvas.querySelector('svg') as SVGSVGElement | null;
    let { w, h } = measureMermaidSvgSize(svgEl);
    // Fallback: content box without CSS transform (read layout size at scale 1)
    if (!(w > 1) || !(h > 1)) {
      const prev = canvas.style.transform;
      canvas.style.transform = 'none';
      const r = svgEl?.getBoundingClientRect();
      canvas.style.transform = prev;
      if (r && r.width > 1 && r.height > 1) {
        w = r.width;
        h = r.height;
      }
    }
    if (!(w > 1) || !(h > 1)) return;
    contentSizeRef.current = { w, h };
    const next = fitMermaidToStage(stage.clientWidth, stage.clientHeight, w, h, 64);
    commitTransform(next);
  }, [commitTransform]);

  useLayoutEffect(() => {
    let cancelled = false;
    let tries = 0;
    const attempt = () => {
      if (cancelled) return;
      tries += 1;
      const canvas = canvasRef.current;
      const svgEl = canvas?.querySelector('svg') as SVGSVGElement | null;
      const size = measureMermaidSvgSize(svgEl);
      if (size.w > 1 && size.h > 1) {
        fitToStage();
        return;
      }
      if (tries < 12) {
        requestAnimationFrame(attempt);
      } else {
        fitToStage();
      }
    };
    requestAnimationFrame(attempt);

    const stage = stageRef.current;
    let ro: ResizeObserver | null = null;
    if (stage && typeof ResizeObserver === 'function') {
      ro = new ResizeObserver(() => {
        const { w, h } = contentSizeRef.current;
        if (!(w > 1) || !(h > 1)) {
          fitToStage();
          return;
        }
        const next = fitMermaidToStage(
          stage.clientWidth,
          stage.clientHeight,
          w,
          h,
          64
        );
        commitTransform(next);
      });
      ro.observe(stage);
    }
    return () => {
      cancelled = true;
      ro?.disconnect();
    };
  }, [viewerSvg, fitToStage, commitTransform]);

  // Wheel: plain scroll pans; Opt+scroll zooms smoothly (rAF-coalesced).
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;
    let raf = 0;
    let pendingDx = 0;
    let pendingDy = 0;
    let pendingAlt = false;
    let pendingPivot: MermaidPoint | null = null;

    const scheduleWheelCommit = () => {
      if (wheelIdleTimerRef.current) {
        window.clearTimeout(wheelIdleTimerRef.current);
      }
      // Commit React after wheel stream idles (DOM already painted).
      wheelIdleTimerRef.current = window.setTimeout(() => {
        wheelIdleTimerRef.current = 0;
        setXf(xfRef.current);
      }, 120);
    };

    const flush = (opts?: { commit?: boolean }) => {
      raf = 0;
      const dx = pendingDx;
      const dy = pendingDy;
      const alt = pendingAlt;
      const pivot = pendingPivot;
      pendingDx = 0;
      pendingDy = 0;
      pendingAlt = false;
      pendingPivot = null;
      if (dx === 0 && dy === 0) return;
      // Accumulator already inverted for pan; zoom stores raw deltaY
      const next = alt
        ? applyViewerWheelEvent(
            xfRef.current,
            { deltaX: 0, deltaY: dy, altKey: true },
            pivot
          )
        : panMermaidTransform(xfRef.current, dx, dy);
      // Mid-gesture: DOM paint only (avoid React re-render of large SVG)
      paintTransform(next);
      if (opts?.commit) {
        setXf(next);
      } else {
        scheduleWheelCommit();
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      let dx = e.deltaX;
      let dy = e.deltaY;
      if (e.deltaMode === 1) {
        dx *= 16;
        dy *= 16;
      } else if (e.deltaMode === 2) {
        dx *= 320;
        dy *= 320;
      }
      const rect = stage.getBoundingClientRect();
      pendingPivot = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      // Last event in the rAF window decides pan vs Opt-zoom
      pendingAlt = Boolean(e.altKey);
      if (e.altKey) {
        // Continuous zoom: accumulate raw wheel (smooth exp scale)
        pendingDy += dy !== 0 ? dy : dx;
      } else {
        // Browser-like pan (scroll down → content up)
        pendingDx += -dx;
        pendingDy += -dy;
      }
      // Synthetic/untrusted (e2e dispatchEvent): apply + commit now — rAF may
      // not tick under headless automation between eval turns.
      if (!e.isTrusted) {
        if (raf) {
          cancelAnimationFrame(raf);
          raf = 0;
        }
        flush({ commit: true });
        return;
      }
      if (!raf) raf = requestAnimationFrame(() => flush());
    };
    stage.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      stage.removeEventListener('wheel', onWheel);
      if (raf) cancelAnimationFrame(raf);
      if (wheelIdleTimerRef.current) {
        window.clearTimeout(wheelIdleTimerRef.current);
        wheelIdleTimerRef.current = 0;
      }
    };
  }, [paintTransform]);

  const stageLocal = useCallback((clientX: number, clientY: number): MermaidPoint => {
    const stage = stageRef.current;
    if (!stage) return { x: clientX, y: clientY };
    const rect = stage.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }, []);

  const syncPinchFromPointers = useCallback(() => {
    const pts = [...pointersRef.current.values()];
    if (pts.length < 2) {
      pinchRef.current = null;
      return;
    }
    const [a, b] = pts;
    const dist = mermaidPointerDistance(a, b);
    const midClient = mermaidPointerMidpoint(a, b);
    if (!(dist > 0) || !midClient) {
      pinchRef.current = null;
      return;
    }
    pinchRef.current = {
      dist,
      mid: stageLocal(midClient.x, midClient.y),
    };
  }, [stageLocal]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      e.preventDefault();
      e.stopPropagation();
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pointersRef.current.size >= 2) {
        // Enter pinch: cancel single-finger pan
        dragRef.current = null;
        setPanning(false);
        syncPinchFromPointers();
        return;
      }

      dragRef.current = {
        pointerId: e.pointerId,
        lastX: e.clientX,
        lastY: e.clientY,
      };
      setPanning(true);
    },
    [syncPinchFromPointers]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!pointersRef.current.has(e.pointerId)) return;
      e.preventDefault();
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      // Two-finger pinch zoom (+ pan to follow midpoint)
      if (pointersRef.current.size >= 2) {
        const pts = [...pointersRef.current.values()];
        const dist = mermaidPointerDistance(pts[0], pts[1]);
        const midClient = mermaidPointerMidpoint(pts[0], pts[1]);
        if (!(dist > 0) || !midClient) return;
        const mid = stageLocal(midClient.x, midClient.y);
        const prev = pinchRef.current;
        if (!prev || !(prev.dist > 0)) {
          pinchRef.current = { dist, mid };
          return;
        }
        let next = pinchMermaidTransform(xfRef.current, prev.dist, dist, mid);
        // Follow pinch centroid drift as pan
        next = panMermaidTransform(next, mid.x - prev.mid.x, mid.y - prev.mid.y);
        pinchRef.current = { dist, mid };
        // Mid-gesture: DOM only
        paintTransform(next);
        return;
      }

      const drag = dragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      const dx = e.clientX - drag.lastX;
      const dy = e.clientY - drag.lastY;
      drag.lastX = e.clientX;
      drag.lastY = e.clientY;
      const next = panMermaidTransform(xfRef.current, dx, dy);
      paintTransform(next);
    },
    [paintTransform, stageLocal]
  );

  const endPointer = useCallback((e: React.PointerEvent) => {
    pointersRef.current.delete(e.pointerId);
    if (dragRef.current?.pointerId === e.pointerId) {
      dragRef.current = null;
      setPanning(false);
    }
    if (pointersRef.current.size < 2) {
      pinchRef.current = null;
    } else {
      // Re-seed pinch with remaining pair
      const pts = [...pointersRef.current.values()];
      if (pts.length >= 2) {
        const dist = mermaidPointerDistance(pts[0], pts[1]);
        const midClient = mermaidPointerMidpoint(pts[0], pts[1]);
        if (dist > 0 && midClient) {
          const stage = stageRef.current;
          const rect = stage?.getBoundingClientRect();
          pinchRef.current = {
            dist,
            mid: rect
              ? { x: midClient.x - rect.left, y: midClient.y - rect.top }
              : midClient,
          };
        }
      }
    }
    // Resume single-finger pan if one pointer remains
    if (pointersRef.current.size === 1) {
      const [id, pt] = [...pointersRef.current.entries()][0];
      dragRef.current = { pointerId: id, lastX: pt.x, lastY: pt.y };
      setPanning(true);
    } else if (pointersRef.current.size === 0) {
      // Gesture ended — commit live transform into React once
      setXf(xfRef.current);
    }
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    } catch {
      /* ignore */
    }
  }, []);

  const resetView = useCallback(() => {
    fitToStage();
  }, [fitToStage]);

  const node = (
    <div
      className="prp-mermaid-viewer"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      data-color-mode={colorMode}
      data-prp-mermaid-viewer="1"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div
        className="prp-mermaid-viewer__backdrop"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        aria-hidden="true"
      />
      <div className="prp-mermaid-viewer__chrome">
        <div className="prp-mermaid-viewer__bar">
          <span className="prp-mermaid-viewer__title">{title}</span>
          <span className="prp-mermaid-viewer__hint prp-muted">
            Scroll pan · ⌥± / ⌥+scroll zoom · arrows pan · drag · Esc
          </span>
          <div className="prp-mermaid-viewer__actions">
            <button
              type="button"
              className="prp-btn prp-btn--sm"
              onClick={resetView}
              title="Fit diagram to view"
            >
              Reset
            </button>
            <button
              type="button"
              className="prp-icon-btn prp-mermaid-viewer__close"
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              aria-label="Close diagram viewer"
              title="Close"
            >
              <IconX size={16} />
            </button>
          </div>
        </div>
        <div
          ref={stageRef}
          className={`prp-mermaid-viewer__stage${
            panning ? ' prp-mermaid-viewer__stage--panning' : ''
          }`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endPointer}
          onPointerCancel={endPointer}
        >
          <div
            ref={canvasRef}
            className="prp-mermaid-viewer__canvas"
            style={{ transform: mermaidTransformStyle(xf) }}
            dangerouslySetInnerHTML={{ __html: viewerSvg }}
          />
        </div>
      </div>
    </div>
  );

  if (!portalHost) return null;
  return createPortal(node, portalHost);
}

export default MermaidViewer;
