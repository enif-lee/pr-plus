import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  memo,
} from 'react';
import {
  calculateVisibleRange,
  scrollTopForIndex,
  scrollTopToMaximizeIndex,
} from '@lib/virtual-range';
import {
  buildConversationVirtualRows,
  conversationRowOffsets,
  conversationRowHeight,
  indexForConversationAnchor,
  timelineEventRailSegments,
  type ConversationVirtualRow,
} from '@lib/conversation-virtual';
import { FloatingScrollbar } from '../../components/common/FloatingScrollbar';
import { useModalStore } from '../../store/modal-store';
import {
  queryAnchorInScroller,
  scrollChildToMaximizeInScroller,
} from '@lib/context-thread-dom';
import { CONVERSATION_SCROLL_IDLE_MS } from '@lib/scroll-idle-render';
import { ConversationScrollIdleProvider } from './ConversationScrollIdleContext';

/**
 * Variable-height virtual list for the full conversation left panel
 * (description + composer/merge + timeline + pagination).
 */
function VirtualConversationListImpl(props: any) {
  const {
    paged,
    reviewThreadsMeta = null,
    canLoadMore = false,
    reverseComments = true,
    descriptionBody = '',
    isThreadCollapsed = null,
    /** (groupItem, thread) => boolean — expanded path rows inside review-group */
    isGroupThreadExpanded = null,
    /** (row) => ReactNode — all chrome + timeline rows */
    renderRow,
    overscan = 3,
    className = '',
    scrollToAnchor = null,
    /** Report review-thread node ids currently in the virtual viewport */
    onVisibleThreadNodeIds = null,
    /** Opaque key so tip-filter updates re-render memoized list */
    timelineVisibilityKey = null,
  } = props;
  void timelineVisibilityKey;

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(480);
  const [heightMap, setHeightMap] = useState(() => new Map<string, number>());

  const heightOpts = useMemo(
    () => ({
      isThreadCollapsed:
        typeof isThreadCollapsed === 'function' ? isThreadCollapsed : undefined,
      isGroupThreadExpanded:
        typeof isGroupThreadExpanded === 'function'
          ? isGroupThreadExpanded
          : undefined,
      descriptionBody: String(descriptionBody || ''),
    }),
    [isThreadCollapsed, isGroupThreadExpanded, descriptionBody]
  );

  const rows: ConversationVirtualRow[] = useMemo(
    () =>
      buildConversationVirtualRows(paged, {
        reverseComments: Boolean(reverseComments),
        hasMoreThreads: Boolean(reviewThreadsMeta?.hasMore),
        canLoadMore: Boolean(canLoadMore),
        metaHiddenCount: reviewThreadsMeta?.hiddenCount,
        descriptionBody,
      }),
    [paged, reverseComments, reviewThreadsMeta, canLoadMore, descriptionBody]
  );

  useEffect(() => {
    const live = new Set(rows.map((r) => r.key));
    setHeightMap((prev) => {
      let changed = false;
      const next = new Map<string, number>();
      for (const [k, v] of prev) {
        if (live.has(k)) next.set(k, v);
        else changed = true;
      }
      return changed || next.size !== prev.size ? next : prev;
    });
  }, [rows]);

  const offsets = useMemo(
    () => conversationRowOffsets(rows, heightMap, heightOpts),
    [rows, heightMap, heightOpts]
  );

  /** Continuous vertical rail for consecutive system-event runs (not per-row stubs). */
  const timelineRails = useMemo(
    () => timelineEventRailSegments(rows, heightMap, heightOpts),
    [rows, heightMap, heightOpts]
  );

  const range = useMemo(
    () =>
      calculateVisibleRange({
        totalRows: rows.length,
        rowHeight: 120,
        viewportHeight,
        scrollTop,
        overscan,
        offsets,
      }),
    [rows.length, viewportHeight, scrollTop, overscan, offsets]
  );

  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el) return undefined;
    const measure = () => {
      const h = el.clientHeight;
      if (h > 0) setViewportHeight(h);
    };
    measure();
    if (typeof ResizeObserver !== 'function') return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const scrollHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** React-facing twin of `prp-is-scrolling` — gates Mermaid/heavy body work. */
  const [isScrolling, setIsScrolling] = useState(false);
  const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.target as HTMLDivElement;
    setScrollTop(el.scrollTop);
    el.classList.add('prp-is-scrolling');
    setIsScrolling(true);
    if (scrollHideTimer.current) clearTimeout(scrollHideTimer.current);
    scrollHideTimer.current = setTimeout(() => {
      el.classList.remove('prp-is-scrolling');
      setIsScrolling(false);
      scrollHideTimer.current = null;
    }, CONVERSATION_SCROLL_IDLE_MS);
  }, []);

  const reportHeight = useCallback((key: string, height: number) => {
    if (!key || !(height > 0)) return;
    const rounded = Math.round(height);
    setHeightMap((prev) => {
      const old = prev.get(key);
      if (old != null && Math.abs(old - rounded) < 2) return prev;
      const next = new Map(prev);
      next.set(key, rounded);
      return next;
    });
  }, []);

  /** Search hit jump — set scrollTop by row index first so virtual window mounts. */
  useEffect(() => {
    if (!scrollToAnchor || !rows.length) return undefined;
    const idx = indexForConversationAnchor(rows, scrollToAnchor);
    if (idx < 0) return undefined;
    const el = scrollerRef.current;
    if (!el) return undefined;
    const top = scrollTopForIndex(
      idx,
      120,
      viewportHeight,
      rows.length,
      offsets
    );
    el.scrollTop = top;
    setScrollTop(top);
    const t = window.setTimeout(() => {
      try {
        const node = el.querySelector(
          `[data-search-anchor="${CSS.escape(String(scrollToAnchor))}"]`
        ) as HTMLElement | null;
        node?.scrollIntoView({ block: 'center', inline: 'nearest' });
        const mark = node?.querySelector(
          '.prp-search-mark--current'
        ) as HTMLElement | null;
        mark?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      } catch {
        /* ignore */
      }
    }, 48);
    return () => window.clearTimeout(t);
  }, [scrollToAnchor, rows, offsets, viewportHeight]);

  /**
   * ⌥J/K + deep-link scroll/focus.
   * - Depend only on pendingNavAnchor so heightMap/offset remeasure does not
   *   re-evaluate scroll mid-nav.
   * - Read rows/offsets from refs for latest layout without re-running.
   * - Deep-link / progressive load: row may appear seconds later — keep pending
   *   and retry until scroll succeeds (do not promote after a single miss).
   * - No scrollIntoView for the primary jump (fights index-based scrollTop).
   */
  const pendingNavAnchor = useModalStore((s) => s.pendingConversationNavAnchor);
  const navLayoutRef = useRef({
    rows,
    offsets,
    viewportHeight,
  });
  navLayoutRef.current = { rows, offsets, viewportHeight };

  useLayoutEffect(() => {
    const a = String(pendingNavAnchor || '').trim();
    if (!a) return undefined;

    let cancelled = false;
    let settleT = 0;
    let retryT = 0;
    let attempts = 0;
    /**
     * Progressive comment/thread pages + virtual height settle can lag well
     * past first paint. Keep retrying without a false promote (promote without
     * a mounted node left deep-links "focused" but never scrolled).
     */
    const MAX_ATTEMPTS = 120; // ~24s @ 200ms
    const RETRY_MS = 200;

    const nodeInView = (scroller: HTMLElement, node: HTMLElement) => {
      try {
        const s = scroller.getBoundingClientRect();
        const r = node.getBoundingClientRect();
        if (r.width < 1 && r.height < 1) return false;
        const visible =
          Math.min(r.bottom, s.bottom) - Math.max(r.top, s.top);
        return visible > Math.min(48, Math.max(20, r.height * 0.15));
      } catch {
        return false;
      }
    };

    const jumpToAnchor = () => {
      const { rows: r, offsets: off, viewportHeight: vh } = navLayoutRef.current;
      if (!r.length) return false;
      const idx = indexForConversationAnchor(r, a);
      const el = scrollerRef.current;
      if (idx < 0 || !el) return false;
      // 1) Virtual row jump — maximize visible fraction of the focused row
      //    (fits → whole card; tall → pin top under 24px pad).
      const top = scrollTopToMaximizeIndex(
        idx,
        el.scrollTop,
        120,
        vh,
        r.length,
        off,
        { padTop: 24, padBottom: 24 }
      );
      if (Math.abs((el.scrollTop || 0) - top) > 1) {
        el.scrollTop = top;
        setScrollTop(top);
      }
      // 2) Within-row refine: review-group threads share one row index —
      //    maximize the specific thread node (not only top-pin).
      const node = queryAnchorInScroller(el, a);
      if (node) {
        const applied = scrollChildToMaximizeInScroller(el, node, {
          padTop: 24,
          padBottom: 24,
        });
        if (Math.abs(applied) > 1) {
          setScrollTop(el.scrollTop);
        }
      }
      return true;
    };

    const promote = () => {
      if (cancelled) return;
      const st = useModalStore.getState();
      if (st.pendingConversationNavAnchor !== a) return;
      st.setFocusedConversationAnchor(a);
      useModalStore.setState({ pendingConversationNavAnchor: null });
      try {
        if (typeof document !== 'undefined') {
          document.documentElement.removeAttribute(
            'data-prp-pending-conv-anchor'
          );
        }
      } catch {
        /* ignore */
      }
    };

    const findAnchorNode = (): HTMLElement | null => {
      const el = scrollerRef.current;
      if (el) {
        const inScroller = queryAnchorInScroller(el, a);
        if (inScroller) return inScroller;
      }
      // Fallback: active conversation panel (virtual window may lag scroller
      // query when row just mounted after jump).
      try {
        if (typeof document === 'undefined') return null;
        const panel =
          (document.querySelector(
            '.prp-body-panel--active.prp-body-panel--conversation'
          ) as HTMLElement | null) ||
          (document.querySelector(
            '.prp-body-panel--conversation'
          ) as HTMLElement | null) ||
          (document.querySelector('.prp-overlay') as HTMLElement | null);
        if (!panel) return null;
        return queryAnchorInScroller(panel, a);
      } catch {
        return null;
      }
    };

    const finishAfterScroll = () => {
      if (cancelled) return;
      if (useModalStore.getState().pendingConversationNavAnchor !== a) return;
      // Settle pass after expand (ConversationKbFocusScroller) without
      // re-binding to offset changes (avoids shake on height measure).
      jumpToAnchor();
      settleT = window.setTimeout(() => {
        if (cancelled) return;
        if (useModalStore.getState().pendingConversationNavAnchor !== a) return;
        jumpToAnchor();
        // Promote once the anchor node is mounted. Prefer in-view settle first;
        // if still clipped, re-jump then promote when mounted (window vs
        // scroller metrics can disagree — e2e treats "mostly on screen" OK).
        const el = scrollerRef.current;
        const node = findAnchorNode();
        if (node && el && !nodeInView(el, node)) {
          jumpToAnchor();
        }
        if (node) {
          // Mounted → promote after one more layout settle (do not leave
          // pending forever when card is painted but scroller band is tight).
          settleT = window.setTimeout(() => {
            if (cancelled) return;
            if (useModalStore.getState().pendingConversationNavAnchor !== a) {
              return;
            }
            jumpToAnchor();
            const node2 = findAnchorNode();
            if (node2) {
              promote();
              // Ensure scroller still shows the card after ring paint
              try {
                const el2 = scrollerRef.current;
                if (el2 && !nodeInView(el2, node2)) jumpToAnchor();
              } catch {
                /* ignore */
              }
            } else if (attempts < MAX_ATTEMPTS) {
              scheduleRetry();
            }
          }, 48);
          return;
        }
        if (attempts >= MAX_ATTEMPTS) {
          // Last resort: if DOM has the anchor anywhere in the overlay, promote
          // so deep-link e2e is not stuck on pending forever (scroll best-effort).
          try {
            const any = findAnchorNode();
            if (any) {
              promote();
              return;
            }
          } catch {
            /* ignore */
          }
          return;
        }
        scheduleRetry();
      }, 72);
    };

    const scheduleRetry = () => {
      if (cancelled) return;
      if (attempts >= MAX_ATTEMPTS) {
        // Do not false-promote — App deep-link loop keeps pending / re-requests.
        return;
      }
      retryT = window.setTimeout(() => {
        if (cancelled) return;
        if (useModalStore.getState().pendingConversationNavAnchor !== a) return;
        attempts += 1;
        if (jumpToAnchor()) {
          finishAfterScroll();
        } else {
          scheduleRetry();
        }
      }, RETRY_MS);
    };

    // 1) Immediate scroll before paint
    attempts = 1;
    if (jumpToAnchor()) {
      finishAfterScroll();
    } else {
      // Row missing (virtual window / progressive feed) — keep pending, retry.
      scheduleRetry();
    }

    return () => {
      cancelled = true;
      window.clearTimeout(settleT);
      window.clearTimeout(retryT);
    };
  }, [pendingNavAnchor]);

  const start = range.start;
  const end = range.end;
  const visible: ConversationVirtualRow[] = [];
  for (let i = start; i <= end && i < rows.length; i++) {
    visible.push(rows[i]);
  }

  // Notify parent which review threads are on screen (for targeted refresh)
  useEffect(() => {
    if (typeof onVisibleThreadNodeIds !== 'function') return;
    const ids: string[] = [];
    const seen = new Set<string>();
    for (const row of visible) {
      if (row.type !== 'item' || !row.item) continue;
      const kind = String(row.item.kind || '');
      if (kind === 'review-group') {
        for (const t of row.item.threads || []) {
          const tid = t?.threadNodeId || t?.thread_node_id;
          if (!tid) continue;
          const key = String(tid);
          if (seen.has(key)) continue;
          seen.add(key);
          ids.push(key);
        }
        continue;
      }
      if (kind !== 'review-thread' && kind !== 'review-comment') continue;
      const tid = row.item.threadNodeId || row.item.thread_node_id;
      if (!tid) continue;
      const key = String(tid);
      if (seen.has(key)) continue;
      seen.add(key);
      ids.push(key);
    }
    onVisibleThreadNodeIds(ids);
  }, [start, end, rows, onVisibleThreadNodeIds]);

  return (
    <ConversationScrollIdleProvider isScrolling={isScrolling}>
      <div
        className={`prp-scroll-float-host prp-edge-fade prp-conversation-virtual-host ${className}`.trim()}
        data-prp-conv-scrolling={isScrolling ? '1' : '0'}
      >
        <div
          className={`prp-conversation-virtual prp-scroll-float${
            timelineRails.length ? ' prp-conversation-virtual--timeline-rail' : ''
          }`}
          ref={scrollerRef}
          onScroll={onScroll}
          data-virtual-count={rows.length}
          data-virtual-start={Number.isFinite(start) ? start : 0}
          data-virtual-end={Number.isFinite(end) ? end : -1}
          data-virtual-panel="full"
          data-prp-is-scrolling={isScrolling ? '1' : '0'}
        >
          <div
            className="prp-conversation-virtual__spacer"
            style={{ height: Math.max(range.totalHeight, 1), position: 'relative' }}
          >
            {/* Continuous timeline vertical rails — full event runs, not clipped by virtualization */}
            {timelineRails.map((seg, i) => (
              <div
                key={`tl-rail-${i}-${seg.top}`}
                className="prp-conversation-timeline-rail"
                style={{ top: seg.top, height: seg.height }}
                aria-hidden="true"
              />
            ))}
            <div
              className="prp-conversation-virtual__window"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                transform: `translateY(${range.offsetY || 0}px)`,
                willChange: 'transform',
                zIndex: 1,
              }}
            >
              {visible.map((row) => {
                const h = conversationRowHeight(row, heightMap, heightOpts);
                return (
                  <VirtualRowShell
                    key={row.key}
                    rowKey={row.key}
                    estimatedHeight={h}
                    onHeight={reportHeight}
                  >
                    {typeof renderRow === 'function' ? renderRow(row) : null}
                  </VirtualRowShell>
                );
              })}
            </div>
          </div>
        </div>
        <FloatingScrollbar
          scrollerRef={scrollerRef}
          contentKey={`${rows.length}:${range.totalHeight}`}
        />
      </div>
    </ConversationScrollIdleProvider>
  );
}

function VirtualRowShell({
  rowKey,
  estimatedHeight,
  onHeight,
  children,
}: {
  rowKey: string;
  estimatedHeight: number;
  onHeight: (key: string, h: number) => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const publish = () => {
      const rect = el.getBoundingClientRect().height || 0;
      const scroll = el.scrollHeight || 0;
      const offset = el.offsetHeight || 0;
      const h = Math.ceil(Math.max(rect, scroll, offset));
      if (h > 0) onHeight(rowKey, h);
    };
    publish();
    const t = window.setTimeout(publish, 48);
    if (typeof ResizeObserver !== 'function') {
      return () => clearTimeout(t);
    }
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => {
      clearTimeout(t);
      ro.disconnect();
    };
  }, [rowKey, onHeight, children]);

  return (
    <div
      ref={ref}
      className="prp-conversation-virtual__row"
      data-row-key={rowKey}
      data-est-h={estimatedHeight}
    >
      {children}
    </div>
  );
}

export const VirtualConversationList = memo(VirtualConversationListImpl);
export default VirtualConversationList;
