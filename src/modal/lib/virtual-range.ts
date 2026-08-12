/** @module modal/lib/virtual-range */
/**
 * Pure virtualization window math.
 * Given total rows, row height, viewport height, and scrollTop, compute the
 * inclusive start/end indices plus overscan.
 */

export function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

/**
 * @param {object} opts
 * @param {number} opts.totalRows
 * @param {number} opts.rowHeight
 * @param {number} opts.viewportHeight
 * @param {number} opts.scrollTop
 * @param {number} [opts.overscan=5]
 * @returns {{ start: number, end: number, offsetY: number, totalHeight: number }}
 */
export function calculateVisibleRange(opts) {
  const totalRows = Math.max(0, Number(opts.totalRows) || 0);
  const rowHeight = Math.max(1, Number(opts.rowHeight) || 1);
  const viewportHeight = Math.max(0, Number(opts.viewportHeight) || 0);
  const scrollTop = Math.max(0, Number(opts.scrollTop) || 0);
  const overscanRaw = Number(opts.overscan);
  const overscan = Math.max(
    0,
    Number.isFinite(overscanRaw) ? overscanRaw : 5
  );
  const offsets = Array.isArray(opts.offsets) ? opts.offsets : null;

  // Variable-height path when prefix offsets provided (length totalRows+1)
  if (offsets && offsets.length === totalRows + 1 && totalRows > 0) {
    const totalHeight = Math.max(0, Number(offsets[totalRows]) || 0);
    let rawStart = 0;
    // First index whose bottom > scrollTop
    let lo = 0;
    let hi = totalRows - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (offsets[mid + 1] <= scrollTop) lo = mid + 1;
      else hi = mid - 1;
    }
    rawStart = clamp(lo, 0, totalRows - 1);
    const viewEnd = scrollTop + viewportHeight;
    let rawEnd = rawStart;
    // Advance while the next row still starts before the bottom of the viewport
    while (rawEnd < totalRows - 1 && offsets[rawEnd + 1] < viewEnd) {
      rawEnd += 1;
    }
    const start = clamp(rawStart - overscan, 0, totalRows - 1);
    const end = clamp(rawEnd + overscan, 0, totalRows - 1);
    const offsetY = offsets[start] || 0;
    return { start, end, offsetY, totalHeight };
  }

  const totalHeight = totalRows * rowHeight;
  if (totalRows === 0) {
    return { start: 0, end: -1, offsetY: 0, totalHeight: 0 };
  }

  const rawStart = Math.floor(scrollTop / rowHeight);
  const visibleCount = Math.ceil(viewportHeight / rowHeight) + 1;
  const start = clamp(rawStart - overscan, 0, totalRows - 1);
  const end = clamp(rawStart + visibleCount + overscan - 1, 0, totalRows - 1);
  const offsetY = start * rowHeight;

  return { start, end, offsetY, totalHeight };
}

/** Whether the rows already mounted by `range` fully cover the next viewport. */
export function virtualRangeCoversViewport(
  range,
  scrollTop,
  viewportHeight,
  opts = null
) {
  if (!range || range.end < range.start) return false;
  const top = Math.max(0, Number(scrollTop) || 0);
  const bottom = top + Math.max(0, Number(viewportHeight) || 0);
  const offsets = Array.isArray(opts?.offsets) ? opts.offsets : null;
  const rowHeight = Math.max(1, Number(opts?.rowHeight) || 1);
  const renderedTop = offsets?.[range.start] ?? range.start * rowHeight;
  const renderedBottom =
    offsets?.[range.end + 1] ?? (range.end + 1) * rowHeight;
  return top >= renderedTop && bottom <= renderedBottom;
}

/**
 * Whether an absolute row index is within the visible window (inclusive).
 */
export function isIndexVisible(index, range) {
  if (!range || range.end < range.start) return false;
  return index >= range.start && index <= range.end;
}

/**
 * Keep the same content under the viewport top when prefix offsets change
 * (measure feedback, expand/collapse). Finds the row at `scrollTop` in
 * `prevOffsets` and maps that in-row offset onto `nextOffsets`.
 *
 * @returns adjusted scrollTop (clamped to next content)
 */
export function adjustScrollTopForOffsetChange(
  scrollTop: unknown,
  prevOffsets: number[] | null | undefined,
  nextOffsets: number[] | null | undefined
): number {
  const top = Math.max(0, Number(scrollTop) || 0);
  const prev = Array.isArray(prevOffsets) ? prevOffsets : null;
  const next = Array.isArray(nextOffsets) ? nextOffsets : null;
  if (!prev || !next || prev.length < 2 || next.length < 2) return top;
  // Different row counts → best-effort ratio on total height
  if (prev.length !== next.length) {
    const prevTotal = Math.max(1, Number(prev[prev.length - 1]) || 1);
    const nextTotal = Math.max(0, Number(next[next.length - 1]) || 0);
    const nextMax = Math.max(0, nextTotal); // caller clamps to viewport
    return clamp((top / prevTotal) * nextTotal, 0, nextMax);
  }
  const totalRows = prev.length - 1;
  // First index whose bottom > scrollTop
  let lo = 0;
  let hi = totalRows - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if ((prev[mid + 1] || 0) <= top) lo = mid + 1;
    else hi = mid - 1;
  }
  const i = clamp(lo, 0, totalRows - 1);
  const prevY = Number(prev[i]) || 0;
  const nextY = Number(next[i]) || 0;
  const within = Math.max(0, top - prevY);
  const nextTotal = Math.max(0, Number(next[totalRows]) || 0);
  return clamp(nextY + within, 0, nextTotal);
}

/**
 * ScrollTop so that `index` is in the viewport.
 * - align: 'quarter' (default) — slightly below top (search jumps)
 * - align: 'start' — top of scrollport (+ optional pad; Conversation ⌥J/K)
 * - align: 'center' — vertical center of scrollport
 * - align: 'third' — ~1/3 from top (Diff ⌥J/K)
 *
 * @param {number} index
 * @param {number} rowHeight
 * @param {number} viewportHeight
 * @param {number} totalRows
 * @param {number[]|null|undefined} [offsets]
 * @param {{ align?: 'start'|'quarter'|'center'|'third', pad?: number }|null|undefined} [opts]
 */
export function scrollTopForIndex(
  index,
  rowHeight,
  viewportHeight,
  totalRows,
  offsets?,
  opts?: {
    align?: 'start' | 'quarter' | 'center' | 'third';
    pad?: number;
  } | null
) {
  const total = Math.max(0, totalRows);
  const i = clamp(Number(index) || 0, 0, Math.max(0, total - 1));
  const alignRaw = String(opts?.align || 'quarter');
  const align =
    alignRaw === 'start' ||
    alignRaw === 'center' ||
    alignRaw === 'third'
      ? alignRaw
      : 'quarter';
  const vh = Math.max(0, Number(viewportHeight) || 0);
  const explicitPad =
    opts?.pad != null && Number.isFinite(Number(opts.pad))
      ? Math.max(0, Number(opts.pad))
      : null;

  if (Array.isArray(offsets) && offsets.length === total + 1) {
    const totalHeight = offsets[total] || 0;
    const y = offsets[i] || 0;
    const h = Math.max(1, (offsets[i + 1] || y) - y);
    const maxScroll = Math.max(0, totalHeight - vh);
    if (align === 'center') {
      return clamp(y - vh / 2 + h / 2, 0, maxScroll);
    }
    if (align === 'third') {
      // Row top at ~1/3 of the viewport
      return clamp(y - vh / 3, 0, maxScroll);
    }
    const pad =
      explicitPad != null
        ? explicitPad
        : align === 'start'
          ? 0
          : Math.floor(vh / 4);
    return clamp(y - pad, 0, maxScroll);
  }
  const rh = Math.max(1, rowHeight);
  const maxScroll = Math.max(0, total * rh - vh);
  if (align === 'center') {
    return clamp(i * rh - vh / 2 + rh / 2, 0, maxScroll);
  }
  if (align === 'third') {
    return clamp(i * rh - vh / 3, 0, maxScroll);
  }
  const pad =
    explicitPad != null
      ? explicitPad
      : align === 'start'
        ? 0
        : Math.floor(vh / 4);
  return clamp(i * rh - pad, 0, maxScroll);
}

/**
 * Row top Y and height for a virtual index (fixed rowHeight or prefix offsets).
 */
export function rowBoundsForIndex(
  index,
  rowHeight,
  totalRows,
  offsets?: number[] | null
): { y: number; h: number; totalHeight: number } {
  const total = Math.max(0, Number(totalRows) || 0);
  const i = clamp(Number(index) || 0, 0, Math.max(0, total - 1));
  if (Array.isArray(offsets) && offsets.length === total + 1) {
    const y = Number(offsets[i]) || 0;
    const next = Number(offsets[i + 1]) || y;
    return {
      y,
      h: Math.max(1, next - y),
      totalHeight: Math.max(0, Number(offsets[total]) || 0),
    };
  }
  const rh = Math.max(1, Number(rowHeight) || 1);
  return {
    y: i * rh,
    h: rh,
    totalHeight: total * rh,
  };
}

/**
 * Minimal scrollTop so `index` is fully visible — **does not re-center**.
 * If the row is already inside the viewport (with optional edge insets), returns
 * currentScrollTop unchanged. Used for line-selection arrow moves so the Diff
 * window does not jump up and reveal the previous file after file-nav pin.
 *
 * opts.padTop should cover the sticky file-header overlay (usually ROW_HEIGHT)
 * so ArrowUp does not leave the caret under the fixed header.
 *
 * @returns {number} next scrollTop
 */
export function scrollTopToRevealIndex(
  index,
  currentScrollTop,
  rowHeight,
  viewportHeight,
  totalRows,
  offsets?: number[] | null,
  opts?: {
    pad?: number;
    padTop?: number;
    padBottom?: number;
  } | null
): number {
  const vp = Math.max(0, Number(viewportHeight) || 0);
  if (vp <= 0) return Math.max(0, Number(currentScrollTop) || 0);
  const { y, h, totalHeight } = rowBoundsForIndex(
    index,
    rowHeight,
    totalRows,
    offsets
  );
  const maxScroll = Math.max(0, totalHeight - vp);
  const cur = clamp(Number(currentScrollTop) || 0, 0, maxScroll);
  const padBoth = Math.max(0, Number(opts?.pad) || 0);
  const padTop = Math.max(
    0,
    opts?.padTop != null ? Number(opts.padTop) : padBoth
  );
  const padBottom = Math.max(
    0,
    opts?.padBottom != null ? Number(opts.padBottom) : padBoth
  );
  // Keep insets from swallowing the whole viewport
  const maxInset = Math.max(0, Math.floor(vp / 2) - 1);
  const topInset = Math.min(padTop, maxInset);
  const bottomInset = Math.min(padBottom, maxInset);
  const viewTop = cur + topInset;
  const viewBottom = cur + vp - bottomInset;
  const rowBottom = y + h;
  // Fully visible (below sticky inset, above bottom) → keep scroll
  if (y >= viewTop && rowBottom <= viewBottom) {
    return cur;
  }
  // Above / under sticky → pin row just below top inset
  if (y < viewTop) {
    return clamp(y - topInset, 0, maxScroll);
  }
  // Below viewport → pin row bottom to viewport bottom (- bottom inset)
  return clamp(rowBottom - vp + bottomInset, 0, maxScroll);
}

/**
 * ScrollTop that **maximizes** how much of `[elementY, elementY+elementH)` is
 * visible in the viewport. Used for Conversation ⌥J/K thread focus:
 * - Already fully visible → keep currentScrollTop
 * - Fits in viewport (with pads) → minimal scroll so the whole rect is in view
 * - Taller than viewport → pin top (padTop) so the largest possible slice from
 *   the focused root is shown (never leave the root above the viewport)
 *
 * Pure: no DOM. Content coords match virtual-row offsets.
 *
 * @returns {number} next scrollTop
 */
export function scrollTopToMaximizeRect(
  currentScrollTop: unknown,
  viewportHeight: unknown,
  contentHeight: unknown,
  elementY: unknown,
  elementH: unknown,
  opts?: {
    pad?: number;
    padTop?: number;
    padBottom?: number;
  } | null
): number {
  const vp = Math.max(0, Number(viewportHeight) || 0);
  const totalH = Math.max(0, Number(contentHeight) || 0);
  const y = Math.max(0, Number(elementY) || 0);
  const h = Math.max(1, Number(elementH) || 1);
  const maxScroll = Math.max(0, totalH - vp);
  const cur = clamp(Number(currentScrollTop) || 0, 0, maxScroll);
  if (vp <= 0) return cur;

  const padBoth = Math.max(0, Number(opts?.pad) || 0);
  const padTop = Math.max(
    0,
    opts?.padTop != null ? Number(opts.padTop) : padBoth
  );
  const padBottom = Math.max(
    0,
    opts?.padBottom != null ? Number(opts.padBottom) : padBoth
  );
  const maxInset = Math.max(0, Math.floor(vp / 2) - 1);
  const topInset = Math.min(padTop, maxInset);
  const bottomInset = Math.min(padBottom, maxInset);
  const avail = Math.max(1, vp - topInset - bottomInset);
  const rowBottom = y + h;

  // Tall element: pin top under top inset → max visible fraction from root
  if (h > avail) {
    return clamp(y - topInset, 0, maxScroll);
  }

  // Fits: already fully visible → keep
  const viewTop = cur + topInset;
  const viewBottom = cur + vp - bottomInset;
  if (y >= viewTop && rowBottom <= viewBottom) {
    return cur;
  }
  // Above / under sticky → bring top to topInset
  if (y < viewTop) {
    return clamp(y - topInset, 0, maxScroll);
  }
  // Below / partially clipped at bottom → pin bottom to view bottom
  return clamp(rowBottom - vp + bottomInset, 0, maxScroll);
}

/**
 * Maximize visibility of virtual row `index` (uses offsets when available).
 * Thin wrapper around {@link scrollTopToMaximizeRect} + {@link rowBoundsForIndex}.
 */
export function scrollTopToMaximizeIndex(
  index: unknown,
  currentScrollTop: unknown,
  rowHeight: unknown,
  viewportHeight: unknown,
  totalRows: unknown,
  offsets?: number[] | null,
  opts?: {
    pad?: number;
    padTop?: number;
    padBottom?: number;
  } | null
): number {
  const { y, h, totalHeight } = rowBoundsForIndex(
    index,
    rowHeight,
    totalRows,
    offsets
  );
  return scrollTopToMaximizeRect(
    currentScrollTop,
    viewportHeight,
    totalHeight,
    y,
    h,
    opts
  );
}

/**
 * Plan a programmatic Diff-list scroll (file / page / comment / selection).
 * DOM writes are preferred for every meaningful hop; store sync is thrifted so
 * leaf DiffWorkspace does not re-render on every key-repeat frame.
 *
 * @param currentDomTop scroller.scrollTop
 * @param currentStoreTop modal-store scrollTop (may be stale)
 * @param nextTop desired scrollTop
 * @param opts.minDomDelta min |Δ| to write DOM (default 0.5)
 * @param opts.minStoreDelta min |Δ| vs store to call setScrollTop (default 24).
 *   Pass Infinity / a huge value to never sync store (page scroll under hold).
 */
export function planProgrammaticScroll(
  currentDomTop: unknown,
  currentStoreTop: unknown,
  nextTop: unknown,
  opts?: { minDomDelta?: number; minStoreDelta?: number } | null
): { top: number; applyDom: boolean; applyStore: boolean } {
  const top = Math.max(0, Number(nextTop) || 0);
  const dom = Math.max(0, Number(currentDomTop) || 0);
  const store = Math.max(0, Number(currentStoreTop) || 0);
  const minDomRaw = Number(opts?.minDomDelta);
  const minDom = Number.isFinite(minDomRaw) ? Math.max(0, minDomRaw) : 0.5;
  // Allow POSITIVE_INFINITY so page-scroll can skip store entirely
  // (Number.isFinite(Infinity) is false — do not coerce to default 24).
  const minStoreRaw =
    opts?.minStoreDelta === undefined || opts?.minStoreDelta === null
      ? 24
      : Number(opts.minStoreDelta);
  const minStore = Number.isNaN(minStoreRaw) ? 24 : minStoreRaw;
  return {
    top,
    applyDom: Math.abs(top - dom) >= minDom,
    // finiteΔ >= Infinity is always false → never applyStore for page hops
    applyStore: Math.abs(top - store) >= minStore,
  };
}

/**
 * DOM-first programmatic scroll. Optionally sync store only when
 * `planProgrammaticScroll` says so (selection-class thrift).
 *
 * @returns what was applied
 */
export function applyProgrammaticDiffScroll(
  el: { scrollTop: number } | null | undefined,
  nextTop: number,
  opts?: {
    storeTop?: number;
    setStoreTop?: ((n: number) => void) | null;
    minDomDelta?: number;
    minStoreDelta?: number;
  } | null
): { appliedDom: boolean; appliedStore: boolean; top: number } {
  const curDom =
    el && typeof el.scrollTop === 'number' ? el.scrollTop : 0;
  const storeTop =
    opts?.storeTop != null && Number.isFinite(Number(opts.storeTop))
      ? Number(opts.storeTop)
      : curDom;
  const plan = planProgrammaticScroll(curDom, storeTop, nextTop, {
    minDomDelta: opts?.minDomDelta,
    minStoreDelta: opts?.minStoreDelta,
  });
  let appliedDom = false;
  let appliedStore = false;
  if (plan.applyDom && el) {
    el.scrollTop = plan.top;
    appliedDom = true;
    // Synchronously notify listeners that wait on scrollTop (VirtualDiff range)
    // so the next paint already has the expanded window — reduces blank bands.
    try {
      if (typeof (el as any).dispatchEvent === 'function') {
        (el as any).dispatchEvent(
          new Event('scroll', { bubbles: false, cancelable: false })
        );
      }
    } catch {
      /* non-DOM / jsdom */
    }
  }
  if (
    plan.applyStore &&
    typeof opts?.setStoreTop === 'function'
  ) {
    opts.setStoreTop(plan.top);
    appliedStore = true;
  }
  return { appliedDom, appliedStore, top: plan.top };
}
