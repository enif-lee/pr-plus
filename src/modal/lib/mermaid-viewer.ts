/**
 * Pure pan/zoom helpers for the Mermaid fullscreen diagram viewer.
 * Continuous wheel/trackpad zoom, pinch zoom, drag pan (no modifier keys).
 */

export const MERMAID_ZOOM_MIN = 0.2;
export const MERMAID_ZOOM_MAX = 8;
/** @deprecated discrete step kept for callers; wheel uses continuous sensitivity */
export const MERMAID_ZOOM_STEP = 1.12;
/** Wheel/trackpad zoom: scale *= exp(-deltaY * sensitivity). Higher = faster. */
export const MERMAID_WHEEL_ZOOM_SENSITIVITY = 0.00165;

export type MermaidViewTransform = {
  scale: number;
  tx: number;
  ty: number;
};

export type MermaidPoint = { x: number; y: number };

export function clampMermaidZoom(scale: unknown): number {
  const n = Number(scale);
  if (!Number.isFinite(n)) return 1;
  if (n < MERMAID_ZOOM_MIN) return MERMAID_ZOOM_MIN;
  if (n > MERMAID_ZOOM_MAX) return MERMAID_ZOOM_MAX;
  return n;
}

export function identityMermaidTransform(): MermaidViewTransform {
  return { scale: 1, tx: 0, ty: 0 };
}

/**
 * Fit content into the stage, centered, using as much of the viewport as
 * possible (vector scale — stays sharp). Caps at MERMAID_ZOOM_MAX.
 *
 * @param stageW stage client width
 * @param stageH stage client height
 * @param contentW SVG/content width at scale 1
 * @param contentH SVG/content height at scale 1
 * @param padding inset around content (default 48)
 */
export function fitMermaidToStage(
  stageW: unknown,
  stageH: unknown,
  contentW: unknown,
  contentH: unknown,
  padding: unknown = 48
): MermaidViewTransform {
  const sw = Number(stageW);
  const sh = Number(stageH);
  const cw = Number(contentW);
  const ch = Number(contentH);
  const pad = Number.isFinite(Number(padding)) ? Math.max(0, Number(padding)) : 48;
  if (!(sw > 0) || !(sh > 0) || !(cw > 0) || !(ch > 0)) {
    return identityMermaidTransform();
  }
  const availW = Math.max(1, sw - pad * 2);
  const availH = Math.max(1, sh - pad * 2);
  // Fill available stage (upscales small SVGs so they aren't corner-sized)
  const fill = Math.min(availW / cw, availH / ch) * 0.94;
  const scale = clampMermaidZoom(fill);
  const tx = (sw - cw * scale) / 2;
  const ty = (sh - ch * scale) / 2;
  return { scale, tx, ty };
}

/**
 * Multiply scale by factor, optionally keeping a stage-local pivot fixed.
 * factor > 1 zooms in; 0 < factor < 1 zooms out.
 */
export function scaleMermaidTransform(
  t: MermaidViewTransform,
  factor: unknown,
  pivot?: MermaidPoint | null
): MermaidViewTransform {
  const f = Number(factor);
  if (!Number.isFinite(f) || f <= 0) return { ...t };
  const nextScale = clampMermaidZoom(t.scale * f);
  if (nextScale === t.scale) return { ...t };
  const ratio = nextScale / t.scale;
  if (!pivot || !Number.isFinite(pivot.x) || !Number.isFinite(pivot.y)) {
    return { scale: nextScale, tx: t.tx, ty: t.ty };
  }
  return {
    scale: nextScale,
    tx: pivot.x - (pivot.x - t.tx) * ratio,
    ty: pivot.y - (pivot.y - t.ty) * ratio,
  };
}

/**
 * Continuous zoom from wheel/trackpad delta. Positive deltaY → zoom out.
 * Uses exponential scaling so small trackpad moves feel smooth (not stepped).
 * Optional pivot (client-relative to the stage) keeps that point fixed.
 */
export function zoomMermaidTransform(
  t: MermaidViewTransform,
  deltaY: unknown,
  pivot?: MermaidPoint | null,
  sensitivity: unknown = MERMAID_WHEEL_ZOOM_SENSITIVITY
): MermaidViewTransform {
  const dy = Number(deltaY);
  if (!Number.isFinite(dy) || dy === 0) return { ...t };
  const sens = Number(sensitivity);
  const s = Number.isFinite(sens) && sens > 0 ? sens : MERMAID_WHEEL_ZOOM_SENSITIVITY;
  // Clamp extreme deltas (mouse wheel notches can be large line units)
  const clamped = Math.max(-240, Math.min(240, dy));
  const factor = Math.exp(-clamped * s);
  return scaleMermaidTransform(t, factor, pivot);
}

/**
 * Two-finger pinch: scale by nextDist/prevDist around the pinch midpoint.
 */
export function pinchMermaidTransform(
  t: MermaidViewTransform,
  prevDist: unknown,
  nextDist: unknown,
  pivot?: MermaidPoint | null
): MermaidViewTransform {
  const prev = Number(prevDist);
  const next = Number(nextDist);
  if (!(prev > 0) || !(next > 0) || prev === next) return { ...t };
  return scaleMermaidTransform(t, next / prev, pivot);
}

/** Euclidean distance between two client points. */
export function mermaidPointerDistance(
  a: MermaidPoint | null | undefined,
  b: MermaidPoint | null | undefined
): number {
  if (!a || !b) return 0;
  const dx = Number(b.x) - Number(a.x);
  const dy = Number(b.y) - Number(a.y);
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return 0;
  return Math.hypot(dx, dy);
}

/** Midpoint between two client points. */
export function mermaidPointerMidpoint(
  a: MermaidPoint | null | undefined,
  b: MermaidPoint | null | undefined
): MermaidPoint | null {
  if (!a || !b) return null;
  const x = (Number(a.x) + Number(b.x)) / 2;
  const y = (Number(a.y) + Number(b.y)) / 2;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

export function panMermaidTransform(
  t: MermaidViewTransform,
  dx: unknown,
  dy: unknown
): MermaidViewTransform {
  const x = Number(dx);
  const y = Number(dy);
  return {
    scale: t.scale,
    tx: t.tx + (Number.isFinite(x) ? x : 0),
    ty: t.ty + (Number.isFinite(y) ? y : 0),
  };
}

export function mermaidTransformStyle(t: MermaidViewTransform): string {
  const s = clampMermaidZoom(t.scale);
  const tx = Number.isFinite(t.tx) ? t.tx : 0;
  const ty = Number.isFinite(t.ty) ? t.ty : 0;
  return `translate(${tx}px, ${ty}px) scale(${s})`;
}

/**
 * Measure SVG intrinsic size from markup / element without trusting
 * percentage width/height or post-transform client rects.
 */
export function measureMermaidSvgSize(
  svgEl: SVGSVGElement | null | undefined
): { w: number; h: number } {
  if (!svgEl) return { w: 0, h: 0 };

  // 1) viewBox — most reliable for Mermaid output
  const vbAttr = svgEl.getAttribute('viewBox') || svgEl.getAttribute('viewbox') || '';
  if (vbAttr.trim()) {
    const parts = vbAttr
      .trim()
      .split(/[\s,]+/)
      .map((x) => Number(x));
    if (parts.length >= 4 && parts[2] > 1 && parts[3] > 1) {
      return { w: parts[2], h: parts[3] };
    }
  }
  const vb = svgEl.viewBox?.baseVal;
  if (vb && vb.width > 1 && vb.height > 1) {
    return { w: vb.width, h: vb.height };
  }

  // 2) Numeric attributes only (reject "100%", "auto")
  const wAttr = String(svgEl.getAttribute('width') || '').trim();
  const hAttr = String(svgEl.getAttribute('height') || '').trim();
  const num = (s: string) => {
    if (/^[\d.]+$/.test(s)) return Number(s);
    if (/^[\d.]+px$/i.test(s)) return parseFloat(s);
    return NaN;
  };
  const aw = num(wAttr);
  const ah = num(hAttr);
  if (aw > 1 && ah > 1) return { w: aw, h: ah };

  // 3) getBBox in user units (not CSS-transformed)
  try {
    const b = svgEl.getBBox?.();
    if (b && b.width > 1 && b.height > 1) return { w: b.width, h: b.height };
  } catch {
    /* not rendered */
  }

  return { w: 0, h: 0 };
}

/**
 * Strip percentage / max-width constraints so the viewer can scale the SVG freely.
 * When Mermaid emits width="100%" + viewBox only, removing % leaves no intrinsic
 * size (browser collapses to ~a few dozen px). Re-apply numeric width/height from
 * viewBox so fit-to-stage scale matches layout pixels.
 */
export function prepareMermaidSvgForViewer(svgHtml: string): string {
  let s = String(svgHtml || '');
  if (!s) return s;
  // Remove width="100%" / height="100%" on root svg
  s = s.replace(/(<svg\b[^>]*?)\swidth="100%"/gi, '$1');
  s = s.replace(/(<svg\b[^>]*?)\sheight="100%"/gi, '$1');
  // Clean style max-width / max-height / width:100% on root svg
  s = s.replace(/(<svg\b[^>]*?)\sstyle="([^"]*)"/i, (_m, tag: string, style: string) => {
    const cleaned = String(style)
      .replace(/max-width\s*:\s*[^;]+;?/gi, '')
      .replace(/max-height\s*:\s*[^;]+;?/gi, '')
      .replace(/width\s*:\s*100%\s*;?/gi, '')
      .replace(/height\s*:\s*100%\s*;?/gi, '')
      .replace(/;;+/g, ';')
      .trim()
      .replace(/^;|;$/g, '');
    return cleaned ? `${tag} style="${cleaned}"` : tag;
  });

  // Ensure root svg has numeric width/height matching viewBox (user units).
  const open = s.match(/<svg\b[^>]*>/i);
  if (open) {
    const tag = open[0];
    const hasNumW = /\swidth="[\d.]+(px)?"/i.test(tag);
    const hasNumH = /\sheight="[\d.]+(px)?"/i.test(tag);
    if (!hasNumW || !hasNumH) {
      const vb =
        tag.match(/\sviewBox="([^"]+)"/i)?.[1] ||
        tag.match(/\sviewbox="([^"]+)"/i)?.[1] ||
        '';
      const parts = vb
        .trim()
        .split(/[\s,]+/)
        .map((x) => Number(x));
      if (parts.length >= 4 && parts[2] > 1 && parts[3] > 1) {
        const attrs =
          (!hasNumW ? ` width="${parts[2]}"` : '') +
          (!hasNumH ? ` height="${parts[3]}"` : '');
        const next = tag.replace(/<svg\b/i, `<svg${attrs}`);
        s = s.replace(tag, next);
      }
    }
  }
  return s;
}

/** Inline conversation mermaid box max height (matches CSS). */
export const MERMAID_INLINE_MAX_HEIGHT_PX = 720;
/** Horizontal/vertical padding inside `.prp-mermaid` (12px × 2). */
export const MERMAID_INLINE_PAD_PX = 24;

/**
 * Scale an inline Mermaid SVG so it fits within max height (and optional max
 * width) **without nested scroll**. Preserves viewBox for sharpness; rewrites
 * numeric width/height attrs to the fitted size. Never upscales above 1.
 *
 * Conversation list remains the only scroller — the box is max-height capped
 * and the diagram is shrunk to fit inside.
 */
export function fitMermaidSvgInline(
  svgHtml: string,
  opts: { maxHeight?: number; maxWidth?: number | null } = {}
): string {
  let s = String(svgHtml || '');
  if (!s) return s;
  const maxH = Math.max(
    48,
    Number(opts.maxHeight) > 0
      ? Number(opts.maxHeight)
      : MERMAID_INLINE_MAX_HEIGHT_PX
  );
  // Content area inside padding
  const contentMaxH = Math.max(32, maxH - MERMAID_INLINE_PAD_PX);
  const maxW =
    opts.maxWidth != null && Number(opts.maxWidth) > 0
      ? Number(opts.maxWidth)
      : null;

  const open = s.match(/<svg\b[^>]*>/i);
  if (!open) return s;
  const tag = open[0];

  const vb =
    tag.match(/\sviewBox="([^"]+)"/i)?.[1] ||
    tag.match(/\sviewbox="([^"]+)"/i)?.[1] ||
    '';
  const vbParts = vb
    .trim()
    .split(/[\s,]+/)
    .map((x) => Number(x));
  let iw = 0;
  let ih = 0;
  if (vbParts.length >= 4 && vbParts[2] > 1 && vbParts[3] > 1) {
    iw = vbParts[2];
    ih = vbParts[3];
  } else {
    const num = (attr: string) => {
      const m = tag.match(new RegExp(`\\s${attr}="([\\d.]+)(px)?"`, 'i'));
      return m ? Number(m[1]) : NaN;
    };
    iw = num('width');
    ih = num('height');
  }
  if (!(iw > 1) || !(ih > 1)) return s;

  let scale = Math.min(1, contentMaxH / ih);
  if (maxW != null) scale = Math.min(scale, maxW / iw);
  if (!(scale > 0) || !Number.isFinite(scale)) scale = 1;

  const outW = Math.max(1, Math.round(iw * scale * 1000) / 1000);
  const outH = Math.max(1, Math.round(ih * scale * 1000) / 1000);

  let next = tag;
  // Ensure viewBox exists so vector scale stays sharp when attrs shrink
  if (!/\sviewBox=/i.test(next) && !/\sviewbox=/i.test(next)) {
    next = next.replace(/<svg\b/i, `<svg viewBox="0 0 ${iw} ${ih}"`);
  }
  if (/\swidth="/i.test(next)) {
    next = next.replace(/\swidth="[^"]*"/i, ` width="${outW}"`);
  } else {
    next = next.replace(/<svg\b/i, `<svg width="${outW}"`);
  }
  if (/\sheight="/i.test(next)) {
    next = next.replace(/\sheight="[^"]*"/i, ` height="${outH}"`);
  } else {
    next = next.replace(/<svg\b/i, `<svg height="${outH}"`);
  }
  // Strip style width/height that would fight the fitted attrs
  next = next.replace(/\sstyle="([^"]*)"/i, (_m, style: string) => {
    const cleaned = String(style)
      .replace(/max-width\s*:\s*[^;]+;?/gi, '')
      .replace(/max-height\s*:\s*[^;]+;?/gi, '')
      .replace(/width\s*:\s*[^;]+;?/gi, '')
      .replace(/height\s*:\s*[^;]+;?/gi, '')
      .replace(/;;+/g, ';')
      .trim()
      .replace(/^;|;$/g, '');
    return cleaned ? ` style="${cleaned}"` : '';
  });
  next = next.replace(
    /<svg\b/i,
    `<svg data-prp-mermaid-fit="1" data-prp-mermaid-scale="${scale.toFixed(4)}"`
  );

  return s.replace(tag, next);
}
