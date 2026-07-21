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
  const overscan = Math.max(0, Number(opts.overscan) ?? 5);

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
 * ScrollTop needed so that `index` is near the top of the viewport (with padding).
 */
function scrollTopForIndex(index, rowHeight, viewportHeight, totalRows) {
  const rh = Math.max(1, rowHeight);
  const total = Math.max(0, totalRows);
  const i = clamp(Number(index) || 0, 0, Math.max(0, total - 1));
  const maxScroll = Math.max(0, total * rh - viewportHeight);
  return clamp(i * rh - Math.floor(viewportHeight / 4), 0, maxScroll);
}

const api = {
  clamp,
  calculateVisibleRange,
  isIndexVisible,
  scrollTopForIndex,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}
if (typeof globalThis !== 'undefined') {
  globalThis.PRModalVirtual = api;
}
