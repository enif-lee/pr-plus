import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconX } from './icons';
import { resolveMermaidColorMode } from '../../lib/mermaid-lazy';
import { useModalStore } from '../../store/modal-store';
import {
  applyViewerWheelEvent,
  fitMermaidToStage,
  identityMermaidTransform,
  mermaidPointerDistance,
  mermaidPointerMidpoint,
  mermaidTransformStyle,
  panMermaidTransform,
  pinchMermaidTransform,
  type MermaidPoint,
  type MermaidViewTransform,
} from '../../lib/mermaid-viewer';

type Props = {
  src: string;
  alt?: string;
  title?: string;
  onClose: () => void;
};

function resolvePortalHost(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  const overlay = document.querySelector('.prp-overlay') as HTMLElement | null;
  return overlay || document.body;
}

/**
 * Fullscreen overlay for markdown / diff images (MermaidViewer-style).
 * Scroll pan · Opt+scroll zoom · drag pan · pinch zoom · Esc closes viewer only.
 */
export function ImageViewer({
  src,
  alt = '',
  title = 'Image',
  onClose,
}: Props) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const contentSizeRef = useRef({ w: 0, h: 0 });
  const xfRef = useRef<MermaidViewTransform>(identityMermaidTransform());
  const [xf, setXf] = useState<MermaidViewTransform>(() => identityMermaidTransform());
  const pointersRef = useRef<Map<number, MermaidPoint>>(new Map());
  const dragRef = useRef<{
    pointerId: number;
    lastX: number;
    lastY: number;
  } | null>(null);
  const pinchRef = useRef<{ dist: number; mid: MermaidPoint } | null>(null);
  const [panning, setPanning] = useState(false);
  const colorMode = resolveMermaidColorMode();
  const portalHost = useMemo(() => resolvePortalHost(), []);

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
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
    const img = imgRef.current;
    if (!stage || !img) return;
    const w = img.naturalWidth || img.clientWidth;
    const h = img.naturalHeight || img.clientHeight;
    if (!(w > 1) || !(h > 1)) return;
    contentSizeRef.current = { w, h };
    const next = fitMermaidToStage(stage.clientWidth, stage.clientHeight, w, h, 48);
    commitTransform(next);
  }, [commitTransform]);

  useLayoutEffect(() => {
    let cancelled = false;
    let tries = 0;
    const attempt = () => {
      if (cancelled) return;
      tries += 1;
      const img = imgRef.current;
      if (img && img.naturalWidth > 1 && img.naturalHeight > 1) {
        fitToStage();
        return;
      }
      if (tries < 24) requestAnimationFrame(attempt);
      else fitToStage();
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
        commitTransform(
          fitMermaidToStage(stage.clientWidth, stage.clientHeight, w, h, 48)
        );
      });
      ro.observe(stage);
    }
    return () => {
      cancelled = true;
      ro?.disconnect();
    };
  }, [src, fitToStage, commitTransform]);

  // Wheel: plain scroll pans; Opt+scroll zooms smoothly (rAF-coalesced).
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;
    let raf = 0;
    let pendingDx = 0;
    let pendingDy = 0;
    let pendingAlt = false;
    let pendingPivot: MermaidPoint | null = null;

    const flush = () => {
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
      const next = alt
        ? applyViewerWheelEvent(
            xfRef.current,
            { deltaX: 0, deltaY: dy, altKey: true },
            pivot
          )
        : panMermaidTransform(xfRef.current, dx, dy);
      paintTransform(next);
      setXf(next);
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
      pendingAlt = Boolean(e.altKey);
      if (e.altKey) {
        pendingDy += dy !== 0 ? dy : dx;
      } else {
        pendingDx += -dx;
        pendingDy += -dy;
      }
      // Synthetic/untrusted (e2e dispatchEvent): apply now — rAF may not tick
      // under headless automation between eval turns.
      if (!e.isTrusted) {
        if (raf) {
          cancelAnimationFrame(raf);
          raf = 0;
        }
        flush();
        return;
      }
      if (!raf) raf = requestAnimationFrame(flush);
    };
    stage.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      stage.removeEventListener('wheel', onWheel);
      if (raf) cancelAnimationFrame(raf);
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
    pinchRef.current = { dist, mid: stageLocal(midClient.x, midClient.y) };
  }, [stageLocal]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      e.preventDefault();
      e.stopPropagation();
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointersRef.current.size >= 2) {
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
        next = panMermaidTransform(next, mid.x - prev.mid.x, mid.y - prev.mid.y);
        pinchRef.current = { dist, mid };
        paintTransform(next);
        setXf(next);
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
      setXf(next);
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
    }
    if (pointersRef.current.size === 1) {
      const [id, pt] = [...pointersRef.current.entries()][0];
      dragRef.current = { pointerId: id, lastX: pt.x, lastY: pt.y };
      setPanning(true);
    }
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    } catch {
      /* ignore */
    }
  }, []);

  if (!portalHost || !src) return null;

  const node = (
    <div
      className="prp-image-viewer"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      data-color-mode={colorMode}
      data-prp-image-viewer="1"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div
        className="prp-image-viewer__backdrop"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        aria-hidden="true"
      />
      <div className="prp-image-viewer__chrome">
        <div className="prp-image-viewer__bar">
          <span className="prp-image-viewer__title">{title}</span>
          <span className="prp-image-viewer__hint prp-muted">
            Scroll pan · ⌥+scroll zoom · drag pan · Esc close
          </span>
          <div className="prp-image-viewer__actions">
            <button
              type="button"
              className="prp-btn prp-btn--sm"
              onClick={fitToStage}
              title="Fit image to view"
            >
              Reset
            </button>
            <button
              type="button"
              className="prp-icon-btn prp-image-viewer__close"
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              aria-label="Close image viewer"
              title="Close"
            >
              <IconX size={16} />
            </button>
          </div>
        </div>
        <div
          ref={stageRef}
          className={`prp-image-viewer__stage${
            panning ? ' prp-image-viewer__stage--panning' : ''
          }`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endPointer}
          onPointerCancel={endPointer}
        >
          <div
            ref={canvasRef}
            className="prp-image-viewer__canvas"
            style={{ transform: mermaidTransformStyle(xf) }}
          >
            <img
              ref={imgRef}
              className="prp-image-viewer__img"
              src={src}
              alt={alt || title}
              draggable={false}
              onLoad={fitToStage}
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(node, portalHost);
}

export default ImageViewer;
