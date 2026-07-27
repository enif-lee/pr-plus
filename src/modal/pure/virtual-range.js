/**
 * Pure virtualization window math.
 * Given total rows, row height, viewport height, and scrollTop, compute the
 * inclusive start/end indices plus overscan.
 */

function clamp(n, min, max) {
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
function calculateVisibleRange(opts) {
  const totalRows = Math.max(0, Number(opts.totalRows) || 0);
  const rowHeight = Math.max(1, Number(opts.rowHeight) || 1);
  const viewportHeight = Math.max(0, Number(opts.viewportHeight) || 0);
  const scrollTop = Math.max(0, Number(opts.scrollTop) || 0);
  const overscan = Math.max(
    0,
    Number(opts.overscan != null ? opts.overscan : 5) || 0
  );

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
function isIndexVisible(index, range) {
  if (!range || range.end < range.start) return false;
  return index >= range.start && index <= range.end;
}

/**
 * ScrollTop so that `index` is in the viewport.
 * opts.align: 'start' | 'quarter' (default quarter).
 */
function scrollTopForIndex(index, rowHeight, viewportHeight, totalRows, opts) {
  const rh = Math.max(1, rowHeight);
  const total = Math.max(0, totalRows);
  const i = clamp(Number(index) || 0, 0, Math.max(0, total - 1));
  const maxScroll = Math.max(0, total * rh - viewportHeight);
  const align =
    opts && typeof opts === 'object' && opts.align === 'start'
      ? 'start'
      : 'quarter';
  const pad =
    align === 'start' ? 0 : Math.floor(Math.max(0, Number(viewportHeight) || 0) / 4);
  return clamp(i * rh - pad, 0, maxScroll);
}

function rowBoundsForIndex(index, rowHeight, totalRows, offsets) {
  const total = Math.max(0, Number(totalRows) || 0);
  const i = clamp(Number(index) || 0, 0, Math.max(0, total - 1));
  if (Array.isArray(offsets) && offsets.length === total + 1) {
    const y = Number(offsets[i]) || 0;
    const next = Number(offsets[i + 1]) || y;
    return {
      y: y,
      h: Math.max(1, next - y),
      totalHeight: Math.max(0, Number(offsets[total]) || 0),
    };
  }
  const rh = Math.max(1, Number(rowHeight) || 1);
  return { y: i * rh, h: rh, totalHeight: total * rh };
}

/** Minimal scroll so index is visible; keep current if already in view. */
function scrollTopToRevealIndex(
  index,
  currentScrollTop,
  rowHeight,
  viewportHeight,
  totalRows,
  offsets,
  opts
) {
  const vp = Math.max(0, Number(viewportHeight) || 0);
  if (vp <= 0) return Math.max(0, Number(currentScrollTop) || 0);
  const bounds = rowBoundsForIndex(index, rowHeight, totalRows, offsets);
  const maxScroll = Math.max(0, bounds.totalHeight - vp);
  const cur = clamp(Number(currentScrollTop) || 0, 0, maxScroll);
  const padBoth = Math.max(0, Number(opts && opts.pad) || 0);
  const padTop = Math.max(
    0,
    opts && opts.padTop != null ? Number(opts.padTop) : padBoth
  );
  const padBottom = Math.max(
    0,
    opts && opts.padBottom != null ? Number(opts.padBottom) : padBoth
  );
  const maxInset = Math.max(0, Math.floor(vp / 2) - 1);
  const topInset = Math.min(padTop, maxInset);
  const bottomInset = Math.min(padBottom, maxInset);
  const viewTop = cur + topInset;
  const viewBottom = cur + vp - bottomInset;
  const rowBottom = bounds.y + bounds.h;
  if (bounds.y >= viewTop && rowBottom <= viewBottom) return cur;
  if (bounds.y < viewTop) return clamp(bounds.y - topInset, 0, maxScroll);
  return clamp(rowBottom - vp + bottomInset, 0, maxScroll);
}

const api = {
  clamp,
  calculateVisibleRange,
  isIndexVisible,
  scrollTopForIndex,
  rowBoundsForIndex,
  scrollTopToRevealIndex,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}
if (typeof globalThis !== 'undefined') {
  globalThis.PRModalVirtual = api;
}
