/**
 * Pure helpers for full conversation left-panel virtualization.
 */
(function () {
  const CONV_EST_GAP = 72;
  const CONV_EST_COLLAPSED_THREAD = 64;
  const CONV_EST_THREAD_BASE = 180;
  const CONV_EST_REPLY = 64;
  const CONV_EST_SNIPPET = 110;
  const CONV_EST_COMMENT = 120;
  const CONV_EST_DESCRIPTION = 220;
  const CONV_EST_COMPOSER = 168;
  const CONV_EST_MERGE = 132;
  const CONV_EST_PAGINATION = 48;
  const CONV_EST_EMPTY = 40;
  const CONV_EST_MIN = 40;
  const CONV_EST_MAX = 2400;
  const CONV_ROW_GAP = 14;

  function clampEst(h) {
    return Math.max(CONV_EST_MIN, Math.min(CONV_EST_MAX, Math.round(h)));
  }

  function buildConversationVirtualRows(paged, opts) {
    opts = opts || {};
    const reverse = Boolean(opts.reverseComments);
    const top = Array.isArray(paged && paged.items) ? paged.items : [];
    const bottom = Array.isArray(paged && paged.bottomItems) ? paged.bottomItems : [];
    const hidden =
      Number(
        paged && paged.hiddenCount != null ? paged.hiddenCount : opts.metaHiddenCount
      ) || 0;
    const showGap = Boolean(
      (paged && paged.showThreadGap) ||
        (opts.hasMoreThreads && hidden > 0 && opts.canLoadMore !== false)
    );
    const hasTimeline = top.length > 0 || bottom.length > 0 || showGap;

    const rows = [];
    rows.push({ type: 'description', key: 'description' });
    if (reverse) {
      rows.push({ type: 'composer', key: 'composer' });
      rows.push({ type: 'merge', key: 'merge' });
    }
    if (!hasTimeline) {
      rows.push({ type: 'empty', key: 'empty' });
    } else {
      for (const item of top) {
        const id = item && (item.id != null ? item.id : item.key);
        rows.push({ type: 'item', key: 'item:' + String(id), item: item });
      }
      // Classic fold: "N hidden · Load more… · Load all"
      if (showGap) {
        rows.push({ type: 'gap', key: 'timeline-gap', hiddenCount: hidden });
      }
      for (const item of bottom) {
        const id = item && (item.id != null ? item.id : item.key);
        rows.push({
          type: 'item',
          key: 'old:' + String(id),
          item: item,
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

  function estimateConversationRowHeight(row, opts) {
    opts = opts || {};
    if (!row) return CONV_EST_COMMENT + CONV_ROW_GAP;
    if (row.type === 'description') {
      const body = String(opts.descriptionBody || '');
      return (
        clampEst(CONV_EST_DESCRIPTION + Math.min(800, Math.floor(body.length / 2.5))) +
        CONV_ROW_GAP
      );
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
      const threads = Array.isArray(item.threads) ? item.threads : [];
      let h = 56 + threads.length * 34;
      const bodyLen = String(item.body || '').length;
      if (bodyLen) h += Math.min(160, 40 + Math.floor(bodyLen / 4));
      // Default: pending closed, resolved closed, unresolved open
      const expandFn = opts.isGroupThreadExpanded;
      for (let i = 0; i < threads.length; i++) {
        const t = threads[i];
        const open =
          typeof expandFn === 'function'
            ? Boolean(expandFn(item, t))
            : t && t.pending
              ? false
              : !(t && t.resolved);
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
      h += Math.min(180, Math.floor(String(item.body || '').length / 4));
      h += 96;
      return clampEst(h) + CONV_ROW_GAP;
    }
    let h =
      CONV_EST_COMMENT + Math.min(200, Math.floor(String(item.body || '').length / 3));
    if (kind === 'review' && item.state) h += 12;
    return clampEst(h) + CONV_ROW_GAP;
  }

  function conversationRowHeight(row, measured, opts) {
    const key = row && row.key;
    if (key != null && measured) {
      if (measured instanceof Map) {
        if (measured.has(key)) return Math.max(1, Number(measured.get(key)) || 1);
      } else if (Object.prototype.hasOwnProperty.call(measured, key)) {
        return Math.max(1, Number(measured[key]) || 1);
      }
    }
    return estimateConversationRowHeight(row, opts);
  }

  function conversationRowOffsets(rows, measured, opts) {
    const list = Array.isArray(rows) ? rows : [];
    const offsets = new Array(list.length + 1);
    offsets[0] = 0;
    for (let i = 0; i < list.length; i++) {
      offsets[i + 1] = offsets[i] + conversationRowHeight(list[i], measured, opts);
    }
    return offsets;
  }

  function indexForConversationAnchor(rows, anchorId) {
    const a = String(anchorId || '');
    if (!a) return -1;
    const list = Array.isArray(rows) ? rows : [];
    for (let i = 0; i < list.length; i++) {
      const row = list[i];
      if (row.type === 'description' && (a === 'body' || a === 'description')) return i;
      if (!row || row.type !== 'item') continue;
      const item = row.item;
      if (!item) continue;
      if (item.kind === 'issue-comment' && 'issue-comment:' + item.id === a) return i;
      if (item.kind === 'review' && 'review:' + item.id === a) return i;
      if (item.kind === 'review-group') {
        if (
          'review:' + item.id === a ||
          'review-group:' + item.id === a
        ) {
          return i;
        }
        const gThreads = item.threads || [];
        for (let ti = 0; ti < gThreads.length; ti++) {
          const t = gThreads[ti];
          if ('review-comment:' + (t && t.id) === a) return i;
          const replies = (t && t.replies) || [];
          if (
            replies.some(function (r) {
              return 'review-comment:' + (r && r.id) === a;
            })
          ) {
            return i;
          }
        }
      }
      if (item.kind === 'review-thread' || item.kind === 'review-comment') {
        if ('review-comment:' + item.id === a) return i;
        const replies = item.replies || [];
        if (
          replies.some(function (r) {
            return 'review-comment:' + (r && r.id) === a;
          })
        ) {
          return i;
        }
      }
    }
    return -1;
  }

  const api = {
    CONV_EST_GAP,
    CONV_EST_COLLAPSED_THREAD,
    CONV_EST_THREAD_BASE,
    CONV_EST_DESCRIPTION,
    CONV_EST_COMPOSER,
    CONV_ROW_GAP,
    buildConversationVirtualRows,
    estimateConversationRowHeight,
    conversationRowHeight,
    conversationRowOffsets,
    indexForConversationAnchor,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (typeof globalThis !== 'undefined') {
    globalThis.PRModalConversationVirtual = api;
  }
})();
