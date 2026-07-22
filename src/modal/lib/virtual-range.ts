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
  const overscan = Math.max(0, Number(opts.overscan) ?? 5);
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
 * ScrollTop needed so that `index` is near the top of the viewport (with padding).
 */
export function scrollTopForIndex(index, rowHeight, viewportHeight, totalRows, offsets?) {
  const total = Math.max(0, totalRows);
  const i = clamp(Number(index) || 0, 0, Math.max(0, total - 1));
  if (Array.isArray(offsets) && offsets.length === total + 1) {
    const totalHeight = offsets[total] || 0;
    const y = offsets[i] || 0;
    const maxScroll = Math.max(0, totalHeight - viewportHeight);
    return clamp(y - Math.floor(viewportHeight / 4), 0, maxScroll);
  }
  const rh = Math.max(1, rowHeight);
  const maxScroll = Math.max(0, total * rh - viewportHeight);
  return clamp(i * rh - Math.floor(viewportHeight / 4), 0, maxScroll);
}
