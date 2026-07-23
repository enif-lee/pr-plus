import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  memo,
} from 'react';
import { calculateVisibleRange, scrollTopForIndex } from '@lib/virtual-range';
import {
  buildConversationVirtualRows,
  conversationRowOffsets,
  conversationRowHeight,
  indexForConversationAnchor,
  type ConversationVirtualRow,
} from '@lib/conversation-virtual';
import { FloatingScrollbar } from '../../components/common/FloatingScrollbar';

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
  } = props;

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
  const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.target as HTMLDivElement;
    setScrollTop(el.scrollTop);
    el.classList.add('prp-is-scrolling');
    if (scrollHideTimer.current) clearTimeout(scrollHideTimer.current);
    scrollHideTimer.current = setTimeout(() => {
      el.classList.remove('prp-is-scrolling');
      scrollHideTimer.current = null;
    }, 700);
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
    <div
      className={`prp-scroll-float-host prp-edge-fade prp-conversation-virtual-host ${className}`.trim()}
    >
      <div
        className="prp-conversation-virtual prp-scroll-float"
        ref={scrollerRef}
        onScroll={onScroll}
        data-virtual-count={rows.length}
        data-virtual-start={Number.isFinite(start) ? start : 0}
        data-virtual-end={Number.isFinite(end) ? end : -1}
        data-virtual-panel="full"
      >
        <div
          className="prp-conversation-virtual__spacer"
          style={{ height: Math.max(range.totalHeight, 1), position: 'relative' }}
        >
          <div
            className="prp-conversation-virtual__window"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              transform: `translateY(${range.offsetY || 0}px)`,
              willChange: 'transform',
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
      const h = el.getBoundingClientRect().height;
      if (h > 0) onHeight(rowKey, h);
    };
    publish();
    if (typeof ResizeObserver !== 'function') return undefined;
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => ro.disconnect();
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
