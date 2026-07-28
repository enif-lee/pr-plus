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

/**
 * Whether an absolute row index is within the visible window (inclusive).
 */
export function isIndexVisible(index, range) {
  if (!range || range.end < range.start) return false;
  return index >= range.start && index <= range.end;
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
