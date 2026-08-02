import {
  DIFF_EXPAND_CHUNK,
  rowTopY,
} from './diff-rows-core';

/** Split from diff-rows.ts: diff-rows-expand */
/** @module modal/lib/diff-rows */
/**
 * Flatten PR files + patches into virtual table rows.
 * mode: 'unified' | 'split'
 * Supports default-collapsed files and inline review comments.
 */


/** Default chunk when expanding from one edge of a gap (GitHub uses 20). */
export function mergeLineRanges(ranges, start, end) {
  const s = Math.min(Number(start), Number(end));
  const e = Math.max(Number(start), Number(end));
  if (!Number.isFinite(s) || !Number.isFinite(e)) {
    return Array.isArray(ranges) ? ranges.slice() : [];
  }
  const list = [...(Array.isArray(ranges) ? ranges : []), { start: s, end: e }].sort(
    (a, b) => a.start - b.start
  );
  const out = [];
  for (const r of list) {
    if (!out.length || r.start > out[out.length - 1].end + 1) {
      out.push({ start: r.start, end: r.end });
    } else {
      out[out.length - 1].end = Math.max(out[out.length - 1].end, r.end);
    }
  }
  return out;
}

/**
 * Resolve which inclusive new-file lines to expand for a gap control click.
 *
 * Directions are relative to the **gap** (not the file):
 * - `down` / `fromStart` → next chunk from the front of the remaining gap
 *   (after the previous visible section)
 * - `up` / `fromEnd` → next chunk from the back of the remaining gap
 *   (before the following visible section)
 * - `all` → entire remaining gap
 *
 * @param {'all'|'down'|'up'|'fromStart'|'fromEnd'} direction
 * @param {{ gapStartNew: number, gapEndNew: number, expandChunk?: number }} gap
 */
export function resolveExpandRange(direction, gap) {
  const start = Number(gap?.gapStartNew);
  const end = Number(gap?.gapEndNew);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return null;
  }
  const chunk =
    Number.isFinite(gap?.expandChunk) && gap.expandChunk > 0
      ? Math.floor(gap.expandChunk)
      : DIFF_EXPAND_CHUNK;
  const dir = String(direction || 'all');
  // fromStart = front of gap (after previous hunk); fromEnd = back (before next)
  if (dir === 'down' || dir === 'fromStart') {
    return { start, end: Math.min(end, start + chunk - 1) };
  }
  if (dir === 'up' || dir === 'fromEnd') {
    return { start: Math.max(start, end - chunk + 1), end };
  }
  return { start, end };
}

/**
 * Expand control kinds for one gap chrome group (GitHub-style):
 *   ▼ (fromStart) | Expand all | ▲ (fromEnd)
 *
 * Expand all always covers the **entire remaining gap** (both ends).
 * Partial side buttons only appear when hiddenCount > expandChunk.
 *
 * `placement` is accepted for call-site compatibility; both edges of the same
 * gap share this composition when the UI mounts a full group once per gap.
 *
 * @param {'above'|'below'|string} [_placement]
 * @param {{ hiddenCount?: number, expandChunk?: number }|null|undefined} gap
 * @returns {Array<'fromStart'|'fromEnd'|'all'>}
 */
export function expandControlKinds(_placement, gap) {
  const count = Math.max(0, Number(gap?.hiddenCount) || 0);
  if (!count) return [];
  const chunk =
    Number.isFinite(gap?.expandChunk) && Number(gap.expandChunk) > 0
      ? Math.floor(Number(gap.expandChunk))
      : DIFF_EXPAND_CHUNK;
  const showPartial = count > chunk;
  // Sides = direction only; middle Expand all expands the whole remaining gap
  return showPartial ? ['fromStart', 'all', 'fromEnd'] : ['all'];
}

/**
 * Busy key keyed by **remaining gap identity**, not the expanded sub-range,
 * so partial fromStart/fromEnd still disable the matching edge controls.
 *
 * Format: `${filePath}:${gapStartNew}-${gapEndNew}:${direction}`
 *
 * @param {string} filePath
 * @param {{ gapStartNew?: number, gapEndNew?: number }|null|undefined} gap
 * @param {string} [direction]
 */
export function makeExpandBusyKey(filePath, gap, direction = 'all') {
  const path = String(filePath || '');
  const a = Number(gap?.gapStartNew);
  const b = Number(gap?.gapEndNew);
  if (!path || !Number.isFinite(a) || !Number.isFinite(b)) return '';
  const dir = direction == null || direction === '' ? 'all' : String(direction);
  return `${path}:${a}-${b}:${dir}`;
}

/** Gap-identity prefix shared by all directions for the same remaining gap. */
export function expandBusyPrefix(filePath, gap) {
  const path = String(filePath || '');
  const a = Number(gap?.gapStartNew);
  const b = Number(gap?.gapEndNew);
  if (!path || !Number.isFinite(a) || !Number.isFinite(b)) return '';
  return `${path}:${a}-${b}:`;
}

/**
 * @param {string|null|undefined} expandBusyKey
 * @param {string} filePath
 * @param {{ gapStartNew?: number, gapEndNew?: number }|null|undefined} gap
 */
export function expandBusyMatches(expandBusyKey, filePath, gap) {
  if (!expandBusyKey) return false;
  const prefix = expandBusyPrefix(filePath, gap);
  if (!prefix) return false;
  return String(expandBusyKey).startsWith(prefix);
}

export function stickyFileHeaderForScroll(
  virtualRows,
  offsets,
  scrollTop,
  rowHeight = 22
) {
  if (!Array.isArray(virtualRows) || !virtualRows.length) return null;
  const top = Math.max(0, Number(scrollTop) || 0);
  // Prefer the file of the row under the sticky edge (scrollTop), then map to header.
  // More reliable than scanning headers when intermediate row kinds vary.
  let probeIdx = 0;
  if (Array.isArray(offsets) && offsets.length === virtualRows.length + 1) {
    let lo = 0;
    let hi = virtualRows.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (Number(offsets[mid + 1]) <= top) lo = mid + 1;
      else hi = mid - 1;
    }
    probeIdx = Math.max(0, Math.min(virtualRows.length - 1, lo));
  } else {
    probeIdx = Math.max(
      0,
      Math.min(
        virtualRows.length - 1,
        Math.floor(top / Math.max(1, Number(rowHeight) || 22))
      )
    );
  }
  const probe = virtualRows[probeIdx];
  const path = probe?.filePath || probe?.path || null;
  if (path) {
    // Walk backward to the file-header for this path
    for (let i = probeIdx; i >= 0; i--) {
      const row = virtualRows[i];
      if (row?.kind === 'file-header' && (row.filePath || row.path) === path) {
        return row;
      }
    }
  }
  // Fallback: last header whose top is at/above scrollTop
  let best = null;
  for (let i = 0; i < virtualRows.length; i++) {
    const row = virtualRows[i];
    if (!row || row.kind !== 'file-header') continue;
    const y = rowTopY(offsets, i, rowHeight);
    if (y <= top + 0.5) best = row;
    else break;
  }
  return best;
}

/**
 * Whether the sticky clone should be painted (natural header at/above scrollport top).
 * @param {object|null} header file-header row
 * @param {number[]|null} offsets
 * @param {number} scrollTop
 * @param {number} [rowHeight=22]
 */
export function shouldShowStickyFileHeader(
  header,
  offsets,
  scrollTop,
  rowHeight = 22,
  virtualRows = null
) {
  const layout = resolveStickyFileHeaderLayout(
    virtualRows,
    offsets,
    scrollTop,
    rowHeight,
    header
  );
  return Boolean(layout?.show);
}

/**
 * Array index of a file-header row in virtualRows (prefer identity, then path).
 * Prefer this over row.rowIndex — those can skip when intermediate rows are omitted.
 */
export function fileHeaderArrayIndex(virtualRows, header) {
  if (!header || !Array.isArray(virtualRows)) return -1;
  const byRef = virtualRows.indexOf(header);
  if (byRef >= 0) return byRef;
  const path = header.filePath || header.path;
  if (!path) return -1;
  return virtualRows.findIndex(
    (r) => r?.kind === 'file-header' && (r.filePath || r.path) === path
  );
}

/**
 * Sticky layout for smooth handoff with the natural file-header row.
 *
 * - Hidden while natural header is still fully below the top (use the real row).
 * - Appears at translateY=0 once natural header scrolls past the top (no jump).
 * - Pushed upward by the next file-header as it approaches (GitHub-style).
 *
 * Offsets are always keyed by **array index**, never row.rowIndex (can desync).
 *
 * @param {Array|null} virtualRows used to find the next file-header
 * @param {number[]|null} offsets
 * @param {number} scrollTop
 * @param {number} [rowHeight=22]
 * @param {object|null} [header] precomputed sticky header (optional)
 * @returns {{
 *   header: object,
 *   show: boolean,
 *   translateY: number,
 *   headerY: number,
 *   nextHeaderY: number|null,
 * }|null}
 */
export function resolveStickyFileHeaderLayout(
  virtualRows,
  offsets,
  scrollTop,
  rowHeight = 22,
  header = null
) {
  const top = Math.max(0, Number(scrollTop) || 0);
  const list = Array.isArray(virtualRows) ? virtualRows : null;
  const h =
    header ||
    (list ? stickyFileHeaderForScroll(list, offsets, top, rowHeight) : null);
  if (!h) return null;

  const idx = fileHeaderArrayIndex(list, h);
  const headerY = idx >= 0 ? rowTopY(offsets, idx, rowHeight) : 0;
  const headerH = Number(rowHeight) || 22;

  // Natural header still at/below the top edge → use the real row only.
  // (Strict `>` avoids a permanent sticky clone when the first file is at rest.)
  if (top <= headerY) {
    return {
      header: h,
      show: false,
      translateY: 0,
      headerY,
      nextHeaderY: null,
    };
  }

  // Next file-header after this one (for push-up)
  let nextHeaderY = null;
  if (list && idx >= 0) {
    for (let i = idx + 1; i < list.length; i++) {
      const row = list[i];
      if (row?.kind === 'file-header') {
        nextHeaderY = rowTopY(offsets, i, rowHeight);
        break;
      }
    }
  }

  // Stick at 0; next header pushes this one up as it approaches
  let translateY = 0;
  if (nextHeaderY != null && Number.isFinite(nextHeaderY)) {
    translateY = Math.min(0, nextHeaderY - top - headerH);
  }

  return {
    header: h,
    show: true,
    translateY,
    headerY,
    nextHeaderY,
  };
}

