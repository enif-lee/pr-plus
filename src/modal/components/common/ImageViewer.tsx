import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { FullscreenViewer } from './FullscreenViewer';
import {
  applyViewerKeyGesture,
  applyViewerWheelEvent,
  fitMermaidToStage,
  identityMermaidTransform,
  mapViewerKeyGesture,
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

/**
 * Fullscreen overlay for markdown / diff images (MermaidViewer-style, portaled).
 * Mid-gesture transform is DOM-only; React commits on idle/end.
 * Scroll pan · Opt± / Opt+scroll zoom · arrows pan · Esc closes viewer only.
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
  const wheelIdleTimerRef = useRef(0);
  const [panning, setPanning] = useState(false);

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

  useLayoutEffect(() => {
    paintTransform(xfRef.current);
  });

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
      commitTransform(next);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [commitTransform]);

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

    const scheduleWheelCommit = () => {
      if (wheelIdleTimerRef.current) {
        window.clearTimeout(wheelIdleTimerRef.current);
      }
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
      const next = alt
        ? applyViewerWheelEvent(
            xfRef.current,
            { deltaX: 0, deltaY: dy, altKey: true },
            pivot
          )
        : panMermaidTransform(xfRef.current, dx, dy);
      paintTransform(next);
      if (opts?.commit) setXf(next);
      else scheduleWheelCommit();
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
    }
    if (pointersRef.current.size === 1) {
      const [id, pt] = [...pointersRef.current.entries()][0];
      dragRef.current = { pointerId: id, lastX: pt.x, lastY: pt.y };
      setPanning(true);
    } else if (pointersRef.current.size === 0) {
      setXf(xfRef.current);
    }
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    } catch {
      /* ignore */
    }
  }, []);

  if (!src) return null;

  return (
    <FullscreenViewer
      layer="image"
      title={title}
      hint="Scroll pan · ⌥± / ⌥+scroll zoom · arrows pan · drag · Esc"
      onClose={onClose}
      closeLabel="Close image viewer"
      closeTitle="Close"
      stageRef={stageRef}
      panning={panning}
      stageProps={{
        onPointerDown,
        onPointerMove,
        onPointerUp: endPointer,
        onPointerCancel: endPointer,
      }}
      actions={
        <button
          type="button"
          className="prp-btn prp-btn--sm"
          onClick={fitToStage}
          title="Fit image to view"
        >
          Reset
        </button>
      }
    >
      <div
        ref={canvasRef}
        className="prp-overlay-viewer__canvas"
        style={{ transform: mermaidTransformStyle(xf) }}
      >
        <img
          ref={imgRef}
          className="prp-overlay-viewer__img"
          src={src}
          alt={alt || title}
          draggable={false}
          onLoad={fitToStage}
          referrerPolicy="no-referrer-when-downgrade"
        />
      </div>
    </FullscreenViewer>
  );
}

export default ImageViewer;
