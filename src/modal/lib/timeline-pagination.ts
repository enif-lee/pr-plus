/**
 * Pure helpers for GraphQL-first conversation timeline pagination:
 * single-direction page meta, since/watermark merge, dirty-thread selection.
 *
 * TIMELINE_PAGE_SIZE = 100 matches GitHub GraphQL connection first/last max
 * (docs.github.com GraphQL rate/query limits). There is no published hard cap
 * on how many timelineItems an issue/PR may have; page size ≠ total length.
 * Activity feed 300/30d does not apply to issue timelineItems / issue events.
 *
 * @module modal/lib/timeline-pagination
 */

/** GitHub GraphQL connection max (first/last within 1–100). */
export const TIMELINE_PAGE_SIZE = 100;

/**
 * Empty single-cursor timeline page meta (no dual-window fields used productively).
 */
export function emptyTimelinePageMeta(overrides: any = {}) {
  return {
    pageSize: TIMELINE_PAGE_SIZE,
    direction: 'newest', // 'newest' | 'oldest'
    hasMore: false,
    hasPreviousPage: false,
    hasNextPage: false,
    startCursor: null as string | null,
    endCursor: null as string | null,
    /** ISO watermark for newest-only since incremental */
    watermark: null as string | null,
    loadedCount: 0,
    totalCount: null as number | null,
    complete: true,
    source: 'graphql',
    ...overrides,
  };
}

/**
 * Build single-direction meta from a GraphQL timelineItems pageInfo.
 * @param {'newest'|'oldest'} direction
 */
export function timelineMetaFromPageInfo(
  pageInfo: any,
  opts: {
    direction?: string;
    loadedCount?: number;
    totalCount?: number | null;
    watermark?: string | null;
    prev?: any;
  } = {}
) {
  const dir =
    String(opts.direction || opts.prev?.direction || 'newest').toLowerCase() ===
    'oldest'
      ? 'oldest'
      : 'newest';
  const hasPreviousPage = Boolean(pageInfo?.hasPreviousPage);
  const hasNextPage = Boolean(pageInfo?.hasNextPage);
  // Newest window: more older items when hasPreviousPage.
  // Oldest window: more newer items when hasNextPage.
  const hasMore = dir === 'newest' ? hasPreviousPage : hasNextPage;
  const loadedCount = Number(opts.loadedCount) || 0;
  const totalCount =
    opts.totalCount != null
      ? Number(opts.totalCount)
      : opts.prev?.totalCount != null
        ? Number(opts.prev.totalCount)
        : null;
  return emptyTimelinePageMeta({
    direction: dir,
    hasMore,
    hasPreviousPage,
    hasNextPage,
    startCursor: pageInfo?.startCursor || null,
    endCursor: pageInfo?.endCursor || null,
    watermark:
      opts.watermark != null
        ? opts.watermark
        : opts.prev?.watermark != null
          ? opts.prev.watermark
          : null,
    loadedCount,
    totalCount: Number.isFinite(totalCount as number) ? totalCount : null,
    complete: !hasMore,
    source: 'graphql',
  });
}

/**
 * Max ISO createdAt among items with an `at` / `createdAt` field.
 */
export function maxTimelineWatermark(items: any[]): string | null {
  let best: string | null = null;
  let bestMs = 0;
  for (const it of Array.isArray(items) ? items : []) {
    const raw = it?.at || it?.createdAt || it?.submittedAt || it?.created_at || '';
    const s = String(raw || '').trim();
    if (!s) continue;
    const ms = Date.parse(s);
    if (!Number.isFinite(ms)) continue;
    if (ms >= bestMs) {
      bestMs = ms;
      best = s;
    }
  }
  return best;
}

/**
 * Prefer non-null minimize fields when merging REST (no Minimizable) over
 * GraphQL IssueComment (has isMinimized / minimizedReason / viewerCanMinimize).
 */
export function mergeCommentMinimizeFields(prev: any, next: any): any {
  if (!prev) return next;
  if (!next) return prev;
  const pickMin = (a: any, b: any) => {
    // null/undefined = unknown (do not clobber the other side)
    if (a?.isMinimized != null) return Boolean(a.isMinimized);
    if (b?.isMinimized != null) return Boolean(b.isMinimized);
    return false;
  };
  // Prefer next for most fields; next only wins isMinimized when it is non-null
  const nextKnowsMin = next.isMinimized != null;
  const isMinimized = nextKnowsMin
    ? Boolean(next.isMinimized)
    : pickMin(prev, next);
  const minimizedReason = isMinimized
    ? nextKnowsMin
      ? next.minimizedReason ?? prev.minimizedReason ?? null
      : prev.minimizedReason ?? next.minimizedReason ?? null
    : null;
  const viewerCanMinimize =
    next.viewerCanMinimize != null
      ? Boolean(next.viewerCanMinimize)
      : prev.viewerCanMinimize != null
        ? Boolean(prev.viewerCanMinimize)
        : null;
  return {
    ...prev,
    ...next,
    isMinimized,
    minimizedReason,
    viewerCanMinimize,
    nodeId: next.nodeId || prev.nodeId || next.node_id || prev.node_id || null,
  };
}

/**
 * Merge incremental timeline page items into prior list by stable id/key.
 * Newer page wins on conflict. Returns sorted newest-first when sortNewest.
 * Minimize/hide fields: non-null wins so REST (unknown) never wipes GraphQL.
 */
export function mergeTimelineItemsById(
  prevItems: any[],
  nextItems: any[],
  opts: { sortNewest?: boolean } = {}
): any[] {
  const map = new Map<string, any>();
  const keyOf = (it: any, i: number) => {
    if (it?.key != null) return String(it.key);
    if (it?.id != null) return `${it.kind || 'item'}-${it.id}`;
    if (it?.nodeId != null) return String(it.nodeId);
    return `idx-${i}-${it?.at || ''}`;
  };
  let i = 0;
  for (const it of Array.isArray(prevItems) ? prevItems : []) {
    if (!it) continue;
    map.set(keyOf(it, i++), it);
  }
  for (const it of Array.isArray(nextItems) ? nextItems : []) {
    if (!it) continue;
    const k = keyOf(it, i++);
    const prev = map.get(k);
    map.set(k, prev ? mergeCommentMinimizeFields(prev, it) : it);
  }
  const out = [...map.values()];
  if (opts.sortNewest !== false) {
    out.sort((a, b) => {
      const ta = Date.parse(String(a?.at || a?.createdAt || '')) || 0;
      const tb = Date.parse(String(b?.at || b?.createdAt || '')) || 0;
      if (tb !== ta) return tb - ta;
      return String(b?.key || b?.id || '').localeCompare(
        String(a?.key || a?.id || '')
      );
    });
  }
  return out;
}

/**
 * Select thread node ids whose commentCount (or commentIds length) changed
 * vs a previous shell snapshot — dirty signal for by-ids full re-fetch.
 *
 * @param {any[]} prevThreads cached threads (with commentCount / commentIds)
 * @param {any[]} nextThreads freshly shelled threads
 * @returns {string[]} PRRT ids to re-fetch
 */
export function selectDirtyThreadIdsByCommentCount(
  prevThreads: any[],
  nextThreads: any[]
): string[] {
  const prevById = new Map<string, any>();
  for (const t of Array.isArray(prevThreads) ? prevThreads : []) {
    const id = t?.threadNodeId ? String(t.threadNodeId) : '';
    if (id) prevById.set(id, t);
  }
  const dirty: string[] = [];
  for (const t of Array.isArray(nextThreads) ? nextThreads : []) {
    const id = t?.threadNodeId ? String(t.threadNodeId) : '';
    if (!id || !/^PRRT_/i.test(id)) continue;
    const prev = prevById.get(id);
    if (!prev) {
      // New thread — need comments if not fully loaded
      if (t.commentsLoaded !== true) dirty.push(id);
      continue;
    }
    const prevCount =
      typeof prev.commentCount === 'number'
        ? prev.commentCount
        : Array.isArray(prev.commentIds)
          ? prev.commentIds.length
          : null;
    const nextCount =
      typeof t.commentCount === 'number'
        ? t.commentCount
        : Array.isArray(t.commentIds)
          ? t.commentIds.length
          : null;
    if (
      prevCount != null &&
      nextCount != null &&
      Number(prevCount) !== Number(nextCount)
    ) {
      dirty.push(id);
      continue;
    }
    if (Boolean(prev.resolved) !== Boolean(t.resolved)) {
      dirty.push(id);
      continue;
    }
    // Still deferred but was loaded before — re-check
    if (t.commentsLoaded !== true && prev.commentsLoaded === true) {
      dirty.push(id);
    }
  }
  return dirty;
}

/**
 * True when review-threads corpus is incomplete (hasMore / hidden).
 * Used by Diff cache-first completeness job.
 */
export function isReviewThreadsLoadIncomplete(meta: any): boolean {
  if (!meta || typeof meta !== 'object') return false;
  if (meta.hasMore) return true;
  if (meta.hasOlder) return true;
  // Dual-window legacy flags — treat as incomplete if still set
  if (meta.hasNewerFromOldest) return true;
  const hidden = Number(meta.hiddenCount) || 0;
  if (hidden > 0) return true;
  const total = Number(meta.totalCount);
  const loaded = Number(meta.loadedThreadCount);
  if (Number.isFinite(total) && Number.isFinite(loaded) && total > loaded) {
    return true;
  }
  return false;
}

/**
 * True when conversation timelineItems page window is incomplete.
 * (GraphQL comments + system events — not reviewThreads.)
 */
export function isTimelineLoadIncomplete(meta: any): boolean {
  if (!meta || typeof meta !== 'object') return false;
  if (meta.hasMore) return true;
  if (meta.complete === false) return true;
  // GraphQL pageInfo can lag (hasPreviousPage false) while totalCount is known.
  // Match isReviewThreadsLoadIncomplete: total > loaded ⇒ more to fetch.
  const total = Number(meta.totalCount);
  const loaded = Number(meta.loadedCount);
  if (Number.isFinite(total) && Number.isFinite(loaded) && total > loaded) {
    return true;
  }
  return false;
}

/**
 * Unified Conversation load-more state for threads + timelineItems.
 * Single UI handle consults this; Diff completeness uses threads only.
 */
export function conversationLoadMoreState(
  threadsMeta: any = null,
  timelineMeta: any = null
) {
  const threadsIncomplete = isReviewThreadsLoadIncomplete(threadsMeta);
  const timelineIncomplete = isTimelineLoadIncomplete(timelineMeta);
  const threadsHidden = Math.max(0, Number(threadsMeta?.hiddenCount) || 0);
  const timelineLoaded = Number(timelineMeta?.loadedCount) || 0;
  const timelineTotal =
    timelineMeta?.totalCount != null ? Number(timelineMeta.totalCount) : null;
  const timelineHidden =
    timelineTotal != null && Number.isFinite(timelineTotal)
      ? Math.max(0, timelineTotal - timelineLoaded)
      : timelineIncomplete
        ? 1
        : 0;
  return {
    threadsIncomplete,
    timelineIncomplete,
    anyIncomplete: threadsIncomplete || timelineIncomplete,
    /**
     * When Diff (or load-all threads) already completed reviewThreads but
     * timelineItems still has older pages, older threads may already paint
     * below the timeline window — prefer a mid-list gap at coverage floor.
     */
    preferMiddleGap: !threadsIncomplete && timelineIncomplete,
    hiddenCount: Math.max(threadsHidden, timelineHidden),
    coverageEndAt: timelineMeta?.coverageEndAt || timelineMeta?.oldestLoadedAt || null,
  };
}

/** Parse ISO → ms; null if missing/invalid. */
export function itemTimestampMs(it: any): number | null {
  const raw = it?.at || it?.createdAt || it?.submittedAt || it?.created_at || '';
  const s = String(raw || '').trim();
  if (!s) return null;
  const ms = Date.parse(s);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Oldest timestamp among timeline-native rows (issue comments + system events).
 * Used as coverage floor for mid-gap placement after threads full-load.
 */
export function timelineCoverageEndAtFromItems(items: any[]): string | null {
  let best: string | null = null;
  let bestMs = Infinity;
  for (const it of Array.isArray(items) ? items : []) {
    if (!it) continue;
    const kind = String(it.kind || it.type || '').toLowerCase();
    // Review threads / groups are NOT timelineItems coverage — they can
    // extend older after Diff full-load while comments/events stay partial.
    if (
      kind === 'review-thread' ||
      kind === 'review-group' ||
      kind === 'review' ||
      kind === 'pending-review'
    ) {
      continue;
    }
    const ms = itemTimestampMs(it);
    if (ms == null) continue;
    if (ms < bestMs) {
      bestMs = ms;
      best = String(it.at || it.createdAt || it.submittedAt || '').trim() || null;
    }
  }
  return best;
}

/**
 * Min ISO among raw comment/event arrays (for host timelineMeta.coverageEndAt).
 */
export function minTimelineCoverageEndAt(
  comments: any[],
  events: any[]
): string | null {
  let best: string | null = null;
  let bestMs = Infinity;
  for (const it of [
    ...(Array.isArray(comments) ? comments : []),
    ...(Array.isArray(events) ? events : []),
  ]) {
    const raw = it?.createdAt || it?.at || it?.created_at || '';
    const s = String(raw || '').trim();
    if (!s) continue;
    const ms = Date.parse(s);
    if (!Number.isFinite(ms) || ms >= bestMs) continue;
    bestMs = ms;
    best = s;
  }
  return best;
}

/**
 * Partition timeline for Load more chrome.
 *
 * Placement policy:
 * - No incomplete sources → no gap.
 * - Threads still incomplete → **end** gap (both sources expand the same
 *   newest-window older edge; mid-split would reintroduce dual-window confusion).
 * - Threads complete + timeline incomplete → **middle** gap at
 *   timeline coverage floor so older full-loaded threads sit below the fold
 *   (user suggestion: Diff auto load-all makes end-of-list gap ambiguous).
 * - Timeline incomplete alone with no floor → end gap fallback.
 *
 * @param {Array} items sorted conversation timeline items
 * @param {object|null} threadsMeta reviewThreadsMeta
 * @param {object|null} timelineMeta detail.timelineMeta
 */
export function partitionConversationLoadMore(
  items: any[],
  threadsMeta: any = null,
  timelineMeta: any = null
) {
  const list = Array.isArray(items) ? items : [];
  const st = conversationLoadMoreState(threadsMeta, timelineMeta);
  if (!st.anyIncomplete) {
    return {
      top: list,
      bottom: [],
      hiddenCount: 0,
      showGap: false,
      gapPlacement: 'none' as const,
      loadState: st,
    };
  }

  if (st.preferMiddleGap) {
    const floorRaw = st.coverageEndAt;
    const floorMs = floorRaw ? Date.parse(String(floorRaw)) : NaN;
    if (Number.isFinite(floorMs)) {
      const top: any[] = [];
      const bottom: any[] = [];
      for (const it of list) {
        const ms = itemTimestampMs(it);
        // Newest-first: keep items at/after coverage floor on top; older below.
        if (ms == null || ms >= floorMs) top.push(it);
        else bottom.push(it);
      }
      if (bottom.length > 0 && top.length > 0) {
        return {
          top,
          bottom,
          hiddenCount: st.hiddenCount,
          showGap: true,
          gapPlacement: 'middle' as const,
          loadState: st,
        };
      }
    }
  }

  // Default: single window, gap after all loaded items.
  return {
    top: list,
    bottom: [],
    hiddenCount: st.hiddenCount,
    showGap: true,
    gapPlacement: 'end' as const,
    loadState: st,
  };
}

/**
 * Single-cursor reviewThreadsMeta from a newest (or oldest) page only —
 * no dual-window oldest seed.
 */
export function singleCursorReviewThreadsMeta(page: any, prev: any = null) {
  const threads = Array.isArray(page?.threads) ? page.threads : [];
  const totalCount =
    typeof page?.totalCount === 'number'
      ? page.totalCount
      : Number(prev?.totalCount) || threads.length;
  const loadedThreadCount = threads.length;
  const hiddenCount = Math.max(0, totalCount - loadedThreadCount);
  const dir =
    String(page?.direction || page?.window || 'newest').toLowerCase() ===
    'oldest'
      ? 'oldest'
      : 'newest';
  const hasOlder =
    dir === 'newest'
      ? Boolean(page?.hasPreviousPage) && hiddenCount > 0
      : false;
  const hasNewer =
    dir === 'oldest' ? Boolean(page?.hasNextPage) && hiddenCount > 0 : false;
  return {
    totalCount,
    hiddenCount,
    loadedThreadCount,
    loadedCommentCount: Array.isArray(page?.comments) ? page.comments.length : 0,
    pagesLoaded: 1,
    newestStartCursor: page?.startCursor || null,
    newestEndCursor: page?.endCursor || null,
    hasOlder: hasOlder || (dir === 'newest' && Boolean(page?.hasPreviousPage)),
    oldestStartCursor: null,
    oldestEndCursor: null,
    /** Dual-window retired — always false in product path */
    hasNewerFromOldest: false,
    newestThreadIds: threads.map((t: any) => t.threadNodeId).filter(Boolean),
    oldestThreadIds: [],
    hasMore: hiddenCount > 0 || hasOlder || hasNewer,
    endCursor: page?.startCursor || null,
    direction: dir,
    source: page?.source || 'graphql',
  };
}
