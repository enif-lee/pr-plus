/** @module modal/lib/conversation-virtual */
/**
 * Variable-height virtualization for the full conversation left panel:
 * description, composer, merge, timeline cards, gap, pagination.
 */

export type ConversationVirtualRow =
  | { type: 'description'; key: string }
  | { type: 'composer'; key: string }
  | { type: 'merge'; key: string }
  | {
      type: 'item';
      key: string;
      item: any;
      /** Prefix for React keys when dual-window oldest slice */
      keyPrefix?: string;
    }
  | {
      type: 'gap';
      key: string;
      hiddenCount: number;
    }
  | { type: 'pagination'; key: string }
  | { type: 'empty'; key: string };

/** Estimated px heights when not yet measured */
export const CONV_EST_GAP = 72;
export const CONV_EST_COLLAPSED_THREAD = 64;
export const CONV_EST_THREAD_BASE = 180;
export const CONV_EST_REPLY = 64;
export const CONV_EST_SNIPPET = 110;
export const CONV_EST_COMMENT = 120;
export const CONV_EST_DESCRIPTION = 220;
export const CONV_EST_COMPOSER = 168;
export const CONV_EST_MERGE = 132;
export const CONV_EST_PAGINATION = 48;
export const CONV_EST_EMPTY = 40;
/** Compact system event row (title rename, draft/ready, labels, …) */
export const CONV_EST_TIMELINE_EVENT = 36;
export const CONV_EST_MIN = 40;
export const CONV_EST_MAX = 2400;
/** Row bottom padding (= --prp-gap-stack) included in measured height */
export const CONV_ROW_GAP = 14;

/**
 * Build flat virtual rows for the entire left panel.
 *
 * Order (reverseComments=true): description → composer → merge → timeline → pagination
 * Order (reverseComments=false): description → timeline → pagination → merge → composer
 *
 * @param {{
 *   items?: any[],
 *   bottomItems?: any[],
 *   showThreadGap?: boolean,
 *   hiddenCount?: number,
 *   totalPages?: number,
 * }} paged
 * @param {{
 *   reverseComments?: boolean,
 *   hasMoreThreads?: boolean,
 *   canLoadMore?: boolean,
 *   metaHiddenCount?: number,
 *   showPagination?: boolean, // threads load-more chrome only (no client pages)
 *   descriptionBody?: string,
 * }} [opts]
 */
export function buildConversationVirtualRows(paged: any, opts: any = {}) {
  const reverse = Boolean(opts.reverseComments);
  const top = Array.isArray(paged?.items) ? paged.items : [];
  const bottom = Array.isArray(paged?.bottomItems) ? paged.bottomItems : [];
  const hidden = Number(paged?.hiddenCount ?? opts.metaHiddenCount) || 0;
  // Classic dual-window / single-window fold when threads remain
  const showGap = Boolean(
    paged?.showThreadGap ||
      (opts.hasMoreThreads && hidden > 0 && opts.canLoadMore !== false)
  );
  const hasTimeline = top.length > 0 || bottom.length > 0 || showGap;

  /** @type {ConversationVirtualRow[]} */
  const rows: ConversationVirtualRow[] = [];

  rows.push({ type: 'description', key: 'description' });

  if (reverse) {
    rows.push({ type: 'composer', key: 'composer' });
    rows.push({ type: 'merge', key: 'merge' });
  }

  if (!hasTimeline) {
    rows.push({ type: 'empty', key: 'empty' });
  } else {
    for (const item of top) {
      const id = item?.id ?? item?.key;
      rows.push({
        type: 'item',
        key: `item:${String(id)}`,
        item,
      });
    }
    // Always place Load more / Load all fold when remaining threads exist
    // (between newest and oldest windows, or after the single loaded window).
    if (showGap) {
      rows.push({
        type: 'gap',
        key: 'timeline-gap',
        hiddenCount: hidden,
      });
    }
    for (const item of bottom) {
      const id = item?.id ?? item?.key;
      rows.push({
        type: 'item',
        key: `old:${String(id)}`,
        item,
        keyPrefix: 'old-',
      });
    }
  }

  if (!reverse) {
    rows.push({ type: 'merge', key: 'merge' });
    rows.push({ type: 'composer', key: 'composer' });
  }

  return rows;
}

/**
 * Estimate row height before ResizeObserver measurement.
 * @param {ConversationVirtualRow} row
 * @param {{
 *   isThreadCollapsed?: (item: any) => boolean,
 *   descriptionBody?: string,
 * }} [opts]
 */
export function estimateConversationRowHeight(row, opts: any = {}) {
  if (!row) return CONV_EST_COMMENT + CONV_ROW_GAP;

  if (row.type === 'description') {
    const body = String(opts.descriptionBody ?? '');
    const h =
      CONV_EST_DESCRIPTION + Math.min(800, Math.floor(body.length / 2.5));
    return clampEst(h) + CONV_ROW_GAP;
  }
  if (row.type === 'composer') return CONV_EST_COMPOSER + CONV_ROW_GAP;
  if (row.type === 'merge') return CONV_EST_MERGE + CONV_ROW_GAP;
  if (row.type === 'pagination') return CONV_EST_PAGINATION + CONV_ROW_GAP;
  if (row.type === 'empty') return CONV_EST_EMPTY + CONV_ROW_GAP;
  if (row.type === 'gap') return CONV_EST_GAP + CONV_ROW_GAP;

  const item = row.item;
  if (!item) return CONV_EST_COMMENT + CONV_ROW_GAP;
  const kind = item.kind || '';
  if (kind === 'review-group') {
    // Header + optional body + one compact file row per thread
    const threads = Array.isArray(item.threads) ? item.threads : [];
    let h = 56 + threads.length * 34;
    const bodyLen = String(item.body || '').length;
    if (bodyLen) h += Math.min(160, 40 + Math.floor(bodyLen / 4));
    // Default: pending closed, resolved closed, unresolved open
    const expandFn = opts.isGroupThreadExpanded;
    for (const t of threads) {
      const open =
        typeof expandFn === 'function'
          ? Boolean(expandFn(item, t))
          : t?.pending
            ? false
            : !t?.resolved;
      if (!open) continue;
      const replies = Array.isArray(t.replies) ? t.replies.length : 0;
      h += CONV_EST_THREAD_BASE + replies * CONV_EST_REPLY;
      if (t.snippet) h += CONV_EST_SNIPPET;
    }
    return clampEst(h) + CONV_ROW_GAP;
  }
  if (kind === 'review-thread' || kind === 'review-comment') {
    const collapsed =
      typeof opts.isThreadCollapsed === 'function'
        ? Boolean(opts.isThreadCollapsed(item))
        : Boolean(item.resolved);
    if (collapsed) return CONV_EST_COLLAPSED_THREAD + CONV_ROW_GAP;
    const replies = Array.isArray(item.replies) ? item.replies.length : 0;
    let h = CONV_EST_THREAD_BASE + replies * CONV_EST_REPLY;
    if (item.snippet) h += CONV_EST_SNIPPET;
    const bodyLen = String(item.body || '').length;
    h += Math.min(180, Math.floor(bodyLen / 4));
    h += 96;
    return clampEst(h) + CONV_ROW_GAP;
  }
  if (kind === 'timeline-event') {
    // Single-line system narrative; wrap rarely for long titles
    const parts = Array.isArray(item.parts) ? item.parts : [];
    const textLen = parts.reduce(
      (n: number, p: any) => n + String(p?.text || p?.name || p?.login || p?.title || '').length,
      0
    );
    const lines = textLen > 90 ? 2 : 1;
    return clampEst(CONV_EST_TIMELINE_EVENT * lines) + CONV_ROW_GAP;
  }
  const bodyLen = String(item.body || '').length;
  let h = CONV_EST_COMMENT + Math.min(200, Math.floor(bodyLen / 3));
  if (kind === 'review' && item.state) h += 12;
  return clampEst(h) + CONV_ROW_GAP;
}

function clampEst(h) {
  return Math.max(CONV_EST_MIN, Math.min(CONV_EST_MAX, Math.round(h)));
}

/**
 * Resolve height for a row: measured map wins, else estimate.
 */
export function conversationRowHeight(row, measured, opts: any = {}) {
  const key = row?.key;
  if (key != null && measured) {
    if (measured instanceof Map) {
      if (measured.has(key)) return Math.max(1, Number(measured.get(key)) || 1);
    } else if (Object.prototype.hasOwnProperty.call(measured, key)) {
      return Math.max(1, Number((measured as any)[key]) || 1);
    }
  }
  return estimateConversationRowHeight(row, opts);
}

/**
 * Prefix offsets [0, h0, h0+h1, …]; last = total height.
 */
export function conversationRowOffsets(rows, measured, opts: any = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const offsets = new Array(list.length + 1);
  offsets[0] = 0;
  for (let i = 0; i < list.length; i++) {
    offsets[i + 1] =
      offsets[i] + conversationRowHeight(list[i], measured, opts);
  }
  return offsets;
}

/** Feed rows that participate in the conversation vertical timeline rail. */
function isConversationFeedRow(row: any) {
  if (!row || row.type !== 'item' || !row.item) return false;
  const k = String(row.item.kind || '');
  return (
    k === 'timeline-event' ||
    k === 'issue-comment' ||
    k === 'review-thread' ||
    k === 'review-comment' ||
    k === 'review-group' ||
    k === 'review'
  );
}

/**
 * Y anchor for the rail on a feed row (avatar center), relative to spacer top.
 * System events: avatar is vertically centered on the compact row.
 * Cards/threads: avatar sits near the top of the card.
 */
function feedRowRailAnchorY(row: any, rowTop: number, rowH: number) {
  const kind = String(row?.item?.kind || '');
  if (kind === 'timeline-event') {
    return rowTop + rowH / 2;
  }
  // Card meta avatar ≈ 12–14px pad + ~16px radius; stay within content box
  const contentH = Math.max(rowH - CONV_ROW_GAP, 1);
  const avatarMid = 22;
  return rowTop + Math.min(avatarMid, contentH / 2);
}

/**
 * Continuous vertical-rail for conversation feed items (events / threads / comments).
 * One unbroken segment from the **center** of the first feed row to the **center**
 * of the last — so no stub line sticks out above the first item or below the last.
 * Drawn on the virtual spacer so it survives window virtualization.
 *
 * @returns {{ top: number, height: number }[]}
 */
export function timelineEventRailSegments(rows, measured, opts: any = {}) {
  const list = Array.isArray(rows) ? rows : [];
  let firstAnchor: number | null = null;
  let lastAnchor = 0;
  let y = 0;
  for (let i = 0; i < list.length; i++) {
    const row = list[i];
    const h = conversationRowHeight(row, measured, opts);
    if (isConversationFeedRow(row)) {
      const anchor = feedRowRailAnchorY(row, y, h);
      if (firstAnchor == null) firstAnchor = anchor;
      lastAnchor = anchor;
    }
    y += h;
  }
  if (firstAnchor == null) return [];
  const height = lastAnchor - firstAnchor;
  // Single feed item: no vertical bar (would only be a zero-length stub)
  if (height < 1) return [];
  return [{ top: firstAnchor, height }];
}

/**
 * Find row index for a search / deep-link anchor id.
 */
export function indexForConversationAnchor(rows, anchorId) {
  const a = String(anchorId || '');
  if (!a) return -1;
  const list = Array.isArray(rows) ? rows : [];
  for (let i = 0; i < list.length; i++) {
    const row = list[i];
    if (row.type === 'description' && (a === 'body' || a === 'description')) {
      return i;
    }
    if (row.type !== 'item') continue;
    const item = row.item;
    if (!item) continue;
    if (item.kind === 'issue-comment' && `issue-comment:${item.id}` === a) {
      return i;
    }
    if (item.kind === 'review' && `review:${item.id}` === a) return i;
    if (item.kind === 'review-group') {
      if (`review:${item.id}` === a || `review-group:${item.id}` === a) return i;
      for (const t of item.threads || []) {
        if (`review-comment:${t?.id}` === a) return i;
        const replies = t?.replies || [];
        if (replies.some((r: any) => `review-comment:${r?.id}` === a)) return i;
      }
    }
    if (item.kind === 'review-thread' || item.kind === 'review-comment') {
      if (`review-comment:${item.id}` === a) return i;
      const replies = item.replies || [];
      if (replies.some((r: any) => `review-comment:${r?.id}` === a)) {
        return i;
      }
    }
  }
  return -1;
}
