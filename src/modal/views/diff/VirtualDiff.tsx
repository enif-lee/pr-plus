import React, {
  useLayoutEffect,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  useState,
  memo,
} from 'react';
import { flushSync } from 'react-dom';
import {
  ROW_HEIGHT,
  COMMENT_ROW_HEIGHT_COLLAPSED,
  averageRowHeight,
  rowHeightFor,
  rowOffsets,
  diffRowMeasureKey,
  highlightCode,
  escapeHtml,
  clearHighlightCodeCache,
} from '@common/utils';
import { useModalStore } from '../../store/modal-store';
import {
  ensureHljsLanguageForPath,
  onHljsLanguagesChanged,
  prefetchHljsLanguages,
} from '@lib/hljs-lazy';
import {
  adjustScrollTopForOffsetChange,
  calculateVisibleRange,
  virtualRangeCoversViewport,
} from '@lib/virtual-range';
import {
  isSelectableDiffRow,
  rowSelectionVisualKey,
  selectionActiveSide,
} from '@lib/line-selection';
import { isPathViewed } from '@lib/review-threads';
import { FILE_FOLD_SHORTCUT } from '@lib/shortcut-policy';
import {
  stickyFileHeaderForScroll,
  resolveStickyFileHeaderLayout,
  rowTopY,
} from '@lib/diff-rows';
import {
  markSearchInText,
  markSearchInHtml,
  resolveActiveMarkStart,
} from '@lib/search-index';
import {
  diffLineExpandKey,
  isDiffLineExpandable,
  expandedCodeLineHeight,
  toggleExpandKey,
  capExpandedLineHeight,
} from '@lib/line-expand';
import { IconDisclosure } from '@common/icons';
import { FloatingScrollbar } from '../../components/common/FloatingScrollbar';
import { ImageViewer } from '@common/ImageViewer';
import { MarkdownViewer } from '@common/MarkdownViewer';
import { InlineThread } from './InlineThread';
import { SelectionCommentBar } from './SelectionCommentBar';
import { HunkExpandControls } from './HunkExpandControls';
import './CodeCell.css';
import './DiffActiveRow.css';
import './DiffLayout.css';
import './DiffSearchMarks.css';
import './HunkExpandControls.css';
import './InlineReviewThreads.css';
import './LineCommentAffordance.css';
import './LineSelection.css';
import './MultiFileReviewGroup.css';
import './unified-line-numbers.css';

import {
  fileHeaderTone,
  FileHeaderRow,
  renderSearchableHtml,
  DiffCodeLineBody,
  DiffCodeLine,
  DiffVirtualRowShell,
} from './VirtualDiffRows';
// DiffVirtualRowShell exported from rows

/** Leaf chrome for inline-comment rows so ⌥J/K hops do not re-render the list. */
const DiffCommentRowFrame = memo(function DiffCommentRowFrame({
  commentId,
  className,
  searchHit,
  children,
  ...dom
}: {
  commentId: string | number | null | undefined;
  className: string;
  searchHit: boolean;
  children: React.ReactNode;
  [key: string]: unknown;
}) {
  const id = commentId != null ? String(commentId) : '';
  const threadSelected = useModalStore((s) => {
    if (!id) return false;
    const sel = s.lineSelection;
    if (
      !sel ||
      !(
        sel.kind === 'thread' ||
        sel.subjectType === 'thread' ||
        sel.kind === 'inline-comment'
      )
    ) {
      return false;
    }
    return sel.commentId != null && String(sel.commentId) === id;
  });
  const threadHit = useModalStore((s) => {
    if (!id || s.commentIndex < 0) return false;
    return (
      s.activeDiffCommentId != null && String(s.activeDiffCommentId) === id
    );
  });
  const hit = searchHit || threadHit;
  return (
    <div
      className={`${className}${
        threadSelected ? ' prp-vline--comment-selected' : ''
      }${hit ? ' prp-vline--hit' : ''}`}
      data-thread-selected={threadSelected ? '1' : undefined}
      data-search-current={hit ? '1' : undefined}
      {...dom}
    >
      {children}
    </div>
  );
});

function VirtualDiffImpl(props: any) {
  const {
    virtualRows,
    /** Optional controlled seed / external jump target (DOM is source of truth). */
    scrollTop: scrollTopProp,
    viewportHeight,
    onScroll,
    onViewportHeight,
    highlightRowIndex,
    listRef,
    /** Optional prop override (tests); live Diff uses modal store */
    selection: selectionProp = undefined,
    selecting: selectingProp = undefined,
    onSelectionStart,
    onSelectionExtend,
    onSelectionEnd,
    /** Pointer over selection / dock → reveal action group (no Opt). */
    onSelectionHoverReveal = null,
    onToggleCollapse,
    /** Expand omitted context between hunks (controls sit on @@ rows) */
    onExpandGap = null,
    expandBusyKey = null,
    viewedPaths,
    onToggleViewed,
    threadsByCommentId,
    onReply,
    onResolve,
    onDeleteReviewComment,
    onHideComment = null,
    onUnhideComment = null,
    onEditReviewComment,
    onSaveEditReviewComment,
    onCancelEditReviewComment,
    editingCommentId,
    onRegisterEditorSave,
    onApplySuggestion,
    onRegisterApply,
    onToggleReaction = null,
    onLoadReactors = null,
    actionBusy,
    viewerLogin,
    prOpen,
    linkCtx,
    onUploadFile,
    mentionCandidates = [],
    /** (row|commentId, resolved?) => boolean — resolved defaults collapsed */
    isThreadCollapsed = null,
    onToggleThreadCollapse,
    /** (threadNodeId|commentId) => boolean — lazy comments in flight */
    isThreadCommentsLoading = null,
    /** Passed to rowOffsets / averageRowHeight for collapse-aware virtual heights */
    commentHeightOpts = null,
    /**
     * Live variable-height metrics for App nav (⌥J/K, selection reveal).
     * Called when offsets / avgH change after measure or expand.
     */
    onVirtualMetricsChange = null,
    pendingCount = 0,
    hasViewerPendingReview = false,
    searchQuery = '',
    searchMatchRows = null,
    activeSearchHit = null,
    activeSearchOccurrence = 0,
    searchHits = null,
    searchHitIndex = -1,
    /** Open file-level comment composer for path */
    onFileComment = null,
    /**
     * When set, selection actions / composer mount under the selection-end
     * row (or file header) so they scroll/unmount with the virtual list.
     */
    selectionIsland = null,
  } = props;

  // Do NOT subscribe to full lineSelection here — that re-renders every visible
  // row on key-hold. DiffCodeLine leaf-subscribes for its own visual key.
  // Only file-target path needs list-level re-render (header island dock).
  const storeFileSelectionPath = useModalStore((s) => {
    const sel = s.lineSelection;
    if (sel && (sel.kind === 'file' || sel.subjectType === 'file')) {
      return String(sel.filePath || '');
    }
    return '';
  });
  const storeSelecting = useModalStore((s) => s.selecting);
  const selecting =
    selectingProp !== undefined ? selectingProp : storeSelecting;
  // Tests pass selection prop; live path uses leaf store in DiffCodeLine.
  const selectionOverride =
    selectionProp !== undefined ? selectionProp : undefined;
  const fileSelectionPath =
    selectionOverride !== undefined
      ? selectionOverride &&
        (selectionOverride.kind === 'file' ||
          selectionOverride.subjectType === 'file')
        ? String(selectionOverride.filePath || '')
        : ''
      : storeFileSelectionPath;
  const isFileSelection = Boolean(fileSelectionPath);

  // Stable handler identities → DiffCodeLine memo works across selection moves
  const onSelectionStartRef = useRef(onSelectionStart);
  const onSelectionExtendRef = useRef(onSelectionExtend);
  const onExpandGapRef = useRef(onExpandGap);
  onSelectionStartRef.current = onSelectionStart;
  onSelectionExtendRef.current = onSelectionExtend;
  onExpandGapRef.current = onExpandGap;
  const stableSelectionStart = useCallback((row: any, point: any, opts?: any) => {
    onSelectionStartRef.current?.(row, point, opts);
  }, []);
  const stableSelectionExtend = useCallback((row: any) => {
    onSelectionExtendRef.current?.(row);
  }, []);
  const stableExpandGap = useCallback((...args: any[]) => {
    return onExpandGapRef.current?.(...args);
  }, []);

  const showSelectionIsland = Boolean(selectionIsland);

  const hoverRevealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setHoverReveal = useCallback(
    (on: boolean) => {
      if (typeof onSelectionHoverReveal !== 'function') return;
      if (hoverRevealTimerRef.current != null) {
        clearTimeout(hoverRevealTimerRef.current);
        hoverRevealTimerRef.current = null;
      }
      if (on) {
        onSelectionHoverReveal(true);
        return;
      }
      // Short delay so pointer can move from selected line → dock without flicker
      hoverRevealTimerRef.current = setTimeout(() => {
        hoverRevealTimerRef.current = null;
        onSelectionHoverReveal(false);
      }, 120);
    },
    [onSelectionHoverReveal]
  );
  useEffect(
    () => () => {
      if (hoverRevealTimerRef.current != null) {
        clearTimeout(hoverRevealTimerRef.current);
      }
    },
    []
  );

  function isSelectionHoverTarget(el: EventTarget | null): boolean {
    const node = el as Element | null;
    if (!node || typeof node.closest !== 'function') return false;
    return Boolean(
      node.closest(
        '.prp-vline--selected, .prp-vline--header-selected, [data-file-selected="1"], .prp-selection-dock, .prp-selection-group, .prp-selection-island, [data-prp-selection-hover="1"]'
      )
    );
  }

  const matchRowSet = useMemo(() => {
    if (searchMatchRows instanceof Set) return searchMatchRows;
    if (Array.isArray(searchMatchRows)) return new Set(searchMatchRows.map(Number));
    return null;
  }, [searchMatchRows]);

  const qActive = Boolean((searchQuery || '').trim());
  const occ = Number(activeSearchOccurrence) || 0;

  const [measuredH, setMeasuredH] = useState(() =>
    Math.max(120, Number(viewportHeight) || 520)
  );

  /** Expanded long code lines (keys only; heights live in measuredHeights). */
  const [expandedLineKeys, setExpandedLineKeys] = useState(() => new Set<string>());
  /**
   * Measured px for variable rows:
   * comments (`c:id`), images (`img:path`), expanded lines (`path#ri`).
   */
  const [measuredHeights, setMeasuredHeights] = useState(
    () => new Map<string, number>()
  );

  const heightOpts = useMemo(() => {
    const base: any =
      commentHeightOpts ||
      (typeof isThreadCollapsed === 'function'
        ? { isCollapsed: (row: any) => Boolean(isThreadCollapsed(row)) }
        : {});
    return {
      ...base,
      expandedKeys: expandedLineKeys,
      measuredHeights,
      expandedCodeLineHeight,
    };
  }, [
    commentHeightOpts,
    isThreadCollapsed,
    expandedLineKeys,
    measuredHeights,
  ]);

  const avgH = useMemo(
    () => averageRowHeight(virtualRows, heightOpts),
    [virtualRows, heightOpts]
  );
  const offsets = useMemo(
    () => rowOffsets(virtualRows, heightOpts),
    [virtualRows, heightOpts]
  );

  const reportMeasuredHeight = useCallback((key: string, height: number) => {
    const h = Math.ceil(Number(height) || 0);
    if (!key || h < 1) return;
    setMeasuredHeights((prev) => {
      const cur = prev.get(key);
      // Ignore sub-pixel / tiny churn
      if (cur != null && Math.abs(cur - h) < 2) return prev;
      const next = new Map(prev);
      next.set(key, h);
      return next;
    });
  }, []);

  // Drop measure keys that no longer exist in the row list / expanded set
  useEffect(() => {
    if (!Array.isArray(virtualRows)) return;
    const live = new Set<string>();
    for (const row of virtualRows) {
      const k = diffRowMeasureKey(row, { expandedKeys: expandedLineKeys });
      if (k) live.add(k);
    }
    // Expanded keys stay live even if row momentarily unmounted off-window
    for (const k of expandedLineKeys) live.add(k);
    setMeasuredHeights((prev) => {
      let changed = false;
      const next = new Map<string, number>();
      for (const [k, v] of prev) {
        if (live.has(k)) next.set(k, v);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [virtualRows, expandedLineKeys]);

  const toggleLineExpand = useCallback((row: any) => {
    const key = diffLineExpandKey(row);
    if (!key) return;
    setExpandedLineKeys((prev) => {
      const next = toggleExpandKey(prev, key);
      // E2e/debug: surface last expand key so harness can observe state without fiber.
      try {
        const host =
          typeof document !== 'undefined'
            ? document.getElementById('prp-page-embed') ||
              document.querySelector('.prp-modal')
            : null;
        host?.setAttribute?.(
          'data-prp-line-expand',
          JSON.stringify({
            key,
            size: next.size,
            has: next.has(key),
            path: row?.filePath || row?.path || null,
            oldLine: row?.oldLine ?? null,
            newLine: row?.newLine ?? null,
            lineType: row?.lineType || null,
          })
        );
      } catch {
        /* ignore */
      }
      if (!next.has(key)) {
        // Collapsed — drop measured height
        setMeasuredHeights((m) => {
          if (!m.has(key)) return m;
          const copy = new Map(m);
          copy.delete(key);
          return copy;
        });
      }
      return next;
    });
  }, []);

  const measureLineHeight = useCallback(
    (key: string, height: number) => {
      if (!key) return;
      const h = capExpandedLineHeight(height);
      reportMeasuredHeight(key, h);
    },
    [reportMeasuredHeight]
  );

  // Push live offsets to App so nav uses the same geometry as the list
  const onMetricsRef = useRef(onVirtualMetricsChange);
  onMetricsRef.current = onVirtualMetricsChange;
  useEffect(() => {
    const cb = onMetricsRef.current;
    if (typeof cb !== 'function') return;
    cb({
      offsets,
      avgH,
      totalHeight: offsets.length ? offsets[offsets.length - 1] : 0,
      measuredHeights,
      expandedKeys: expandedLineKeys,
    });
  }, [offsets, avgH, measuredHeights, expandedLineKeys]);

  const viewportCap =
    typeof window !== 'undefined' && window.innerHeight > 0
      ? window.innerHeight
      : Number.POSITIVE_INFINITY;
  const vp = Math.max(
    120,
    Math.min(measuredH || Number(viewportHeight) || 520, viewportCap)
  );
  const totalRows = virtualRows?.length || 0;
  const initialTop = Math.max(0, Number(scrollTopProp) || 0);

  /**
   * Visible window only — NOT scrollTop. Native overflow moves pixels between
   * row boundaries; React re-renders solely when start/end/offsetY change.
   */
  /** Extra rows above/below viewport — larger overscan cuts blank bands on jump. */
  const DIFF_OVERSCAN = 20;
  // Variable rows start with estimated heights. Keep enough real rows mounted
  // while those estimates settle so wheel/touchpad input cannot expose spacer.
  const DIFF_SCROLL_OVERSCAN = 32;
  const [range, setRange] = useState(() =>
    calculateVisibleRange({
      totalRows: Array.isArray(virtualRows) ? virtualRows.length : 0,
      rowHeight: ROW_HEIGHT,
      viewportHeight: vp,
      scrollTop: initialTop,
      overscan: DIFF_OVERSCAN,
    })
  );
  /**
   * Sticky file header: React state only when path/show changes.
   * translateY is applied via DOM for per-frame push without re-rendering the list.
   */
  const [stickyMeta, setStickyMeta] = useState<{
    row: any;
    show: boolean;
  } | null>(null);
  const stickyMetaRef = useRef<{ path: string; show: boolean }>({
    path: '',
    show: false,
  });
  const stickyElRef = useRef<HTMLDivElement | null>(null);
  /** Match sticky width to scroller clientWidth (excludes scrollbar). */
  const [stickyWidth, setStickyWidth] = useState<number | null>(null);

  /**
   * Bumped when a lazy hljs grammar finishes loading so visible lines re-highlight.
   * Included in DiffLineRow keys via render path (parent re-render is enough).
   */
  const [hljsEpoch, setHljsEpoch] = useState(0);
  const [mdViewer, setMdViewer] = useState<{
    path: string;
    status: string;
  } | null>(null);
  const [imageViewer, setImageViewer] = useState<{
    src: string;
    alt: string;
  } | null>(null);
  const onPreviewMarkdown = useCallback((row: any) => {
    const p = String(row?.filePath || '');
    if (!p) return;
    setMdViewer({ path: p, status: String(row?.status || 'modified') });
  }, []);
  useLayoutEffect(() => {
    return onHljsLanguagesChanged(() => {
      clearHighlightCodeCache();
      setHljsEpoch((n) => n + 1);
    });
  }, []);

  // Prefetch grammars for every path in the current diff (deduped inside helper).
  useLayoutEffect(() => {
    if (!Array.isArray(virtualRows) || !virtualRows.length) return;
    const paths: string[] = [];
    for (const row of virtualRows) {
      if (row?.kind === 'file-header' || row?.kind === 'diff-line') {
        const p = row.filePath || row.path;
        if (p) paths.push(String(p));
      }
    }
    if (paths.length) prefetchHljsLanguages(paths, { fromPath: true });
  }, [virtualRows]);

  const scrollRafRef = useRef(0);
  const pendingScrollRef = useRef(initialTop);
  const rangeRef = useRef(range);
  const lastReportedScrollRef = useRef(initialTop);
  const metricsRef = useRef({
    totalRows,
    avgH,
    vp,
    offsets,
    onScroll,
    virtualRows,
  });
  metricsRef.current = {
    totalRows,
    avgH,
    vp,
    offsets,
    onScroll,
    virtualRows,
  };

  const applyScrollTop = useCallback((scrollTop: number, overscan = DIFF_OVERSCAN) => {
    const m = metricsRef.current;
    const top = Math.max(0, scrollTop);
    const next = calculateVisibleRange({
      totalRows: m.totalRows,
      rowHeight: m.avgH,
      viewportHeight: m.vp,
      scrollTop: top,
      overscan,
      offsets: m.offsets,
    });
    pendingScrollRef.current = top;
    // Sticky header: seamless handoff + push-by-next (DOM transform, path via React)
    if (typeof resolveStickyFileHeaderLayout === 'function') {
      const layout = resolveStickyFileHeaderLayout(
        m.virtualRows,
        m.offsets,
        top,
        ROW_HEIGHT
      );
      const header = layout?.header || null;
      const show = Boolean(layout?.show && header);
      const path = header?.filePath ? String(header.filePath) : '';
      const ty = show ? Number(layout?.translateY) || 0 : 0;
      const prevSticky = stickyMetaRef.current;
      if (path !== prevSticky.path || show !== prevSticky.show) {
        stickyMetaRef.current = { path, show };
        setStickyMeta(show && header ? { row: header, show: true } : null);
      } else if (show && header && stickyMetaRef.current.path === path) {
        setStickyMeta((cur) =>
          cur?.row === header ? cur : { row: header, show: true }
        );
      }
      // Per-frame push without list re-render (avoids jump / jank)
      const el = stickyElRef.current;
      if (el) {
        el.style.transform = `translate3d(0, ${ty}px, 0)`;
        el.style.visibility = show ? 'visible' : 'hidden';
        el.style.pointerEvents = show ? 'auto' : 'none';
      }
    } else if (typeof stickyFileHeaderForScroll === 'function') {
      // Fallback if layout helper missing
      const header = stickyFileHeaderForScroll(
        m.virtualRows,
        m.offsets,
        top,
        ROW_HEIGHT
      );
      const hy = header
        ? rowTopY(
            m.offsets,
            header.rowIndex != null ? Number(header.rowIndex) : 0,
            ROW_HEIGHT
          )
        : 0;
      const show = Boolean(header && top >= hy);
      const path = header?.filePath ? String(header.filePath) : '';
      const prevSticky = stickyMetaRef.current;
      if (path !== prevSticky.path || show !== prevSticky.show) {
        stickyMetaRef.current = { path, show };
        setStickyMeta(show && header ? { row: header, show: true } : null);
      }
    }
    const prev = rangeRef.current;
    if (
      prev.start === next.start &&
      prev.end === next.end &&
      prev.offsetY === next.offsetY &&
      prev.totalHeight === next.totalHeight
    ) {
      return false;
    }
    rangeRef.current = next;
    setRange(next);
    return true;
  }, []);

  /** Prefetch hljs grammars + warm line cache for rows about to enter the viewport. */
  const warmHighlightAhead = useCallback((end: number) => {
    const rows = metricsRef.current.virtualRows;
    if (!Array.isArray(rows)) return;
    const from = Math.max(0, end + 1);
    const to = Math.min(rows.length - 1, end + 48);
    if (from > to) return;
    const run = () => {
      for (let i = from; i <= to; i++) {
        const row = rows[i];
        if (!row || row.kind !== 'diff-line') continue;
        const lt = row.lineType;
        if (lt !== 'add' && lt !== 'del' && lt !== 'change' && lt !== 'context')
          continue;
        void ensureHljsLanguageForPath(row.filePath);
        if (row.split) {
          highlightCode(row.leftCode ?? '', row.filePath);
          highlightCode(row.rightCode ?? '', row.filePath);
        } else {
          highlightCode(row.code ?? row.text ?? '', row.filePath);
        }
      }
    };
    const ric = (globalThis as any).requestIdleCallback;
    if (typeof ric === 'function') ric(() => run(), { timeout: 250 });
    else setTimeout(run, 0);
  }, []);

  const flushPendingScroll = useCallback((overscan = DIFF_OVERSCAN) => {
    scrollRafRef.current = 0;
    const top = pendingScrollRef.current;
    const changed = applyScrollTop(top, overscan);
    if (!changed) return;
    warmHighlightAhead(rangeRef.current.end);
    const onScrollCb = metricsRef.current.onScroll;
    if (typeof onScrollCb === 'function' && top !== lastReportedScrollRef.current) {
      lastReportedScrollRef.current = top;
      onScrollCb(top);
    }
  }, [applyScrollTop, warmHighlightAhead]);

  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const top = e.currentTarget.scrollTop;
      pendingScrollRef.current = top;
      // applyProgrammaticDiffScroll dispatches an untrusted scroll event after
      // its DOM write. Commit the new virtual window before this frame paints.
      if (e.nativeEvent.isTrusted === false) {
        if (scrollRafRef.current && typeof cancelAnimationFrame === 'function') {
          cancelAnimationFrame(scrollRafRef.current);
        }
        flushPendingScroll(DIFF_SCROLL_OVERSCAN);
        return;
      }

      /**
       * Decision: visible intermediate Diff frames are a product contract.
       * Do not optimize key, wheel, or touchpad input by omitting those paints.
       * Trusted scroll stays rAF-coalesced while overscan covers the viewport;
       * if fast input outruns that window, commit a new range before paint so
       * the scroller never exposes its empty background.
       */
      const m = metricsRef.current;
      if (
        !virtualRangeCoversViewport(rangeRef.current, top, m.vp, {
          offsets: m.offsets,
          rowHeight: m.avgH,
        })
      ) {
        if (scrollRafRef.current && typeof cancelAnimationFrame === 'function') {
          cancelAnimationFrame(scrollRafRef.current);
        }
        // React classifies wheel/touchpad scroll as continuous input and may
        // defer setRange past paint. An overscan escape must bypass rAF now.
        flushSync(() => flushPendingScroll(DIFF_SCROLL_OVERSCAN));
        return;
      }
      if (scrollRafRef.current) return;
      if (typeof requestAnimationFrame === 'function') {
        // Coalesce high-rate input to one update per frame, then land that
        // larger measured-height-safe window before the browser paints it.
        scrollRafRef.current = requestAnimationFrame(() =>
          flushSync(() => flushPendingScroll(DIFF_SCROLL_OVERSCAN))
        );
      } else {
        flushSync(() => flushPendingScroll(DIFF_SCROLL_OVERSCAN));
      }
    },
    [flushPendingScroll]
  );

  /** Detect App programmatic jumps (⌥J/K thread nav) vs user wheel. */
  const prevScrollTopPropRef = useRef(scrollTopProp);
  /** Hold last programmatic target so row rebuild after expand reuses it once. */
  const programmaticTopRef = useRef<number | null>(null);
  /** Previous prefix offsets — re-anchor scroll when measure changes heights. */
  const prevOffsetsRef = useRef<number[] | null>(null);

  // Rows / viewport / external jump → recompute window (no-op if unchanged)
  useLayoutEffect(() => {
    const el = listRef?.current as HTMLElement | null;
    const propTop =
      scrollTopProp != null && Number.isFinite(Number(scrollTopProp))
        ? Math.max(0, Number(scrollTopProp))
        : null;
    const propChanged = scrollTopProp !== prevScrollTopPropRef.current;
    prevScrollTopPropRef.current = scrollTopProp;

    // Programmatic jump from App: force DOM scrollTop then recompute window.
    // Larger overscan on jumps pre-renders neighbors → fewer blank bands.
    if (propChanged && propTop != null) {
      programmaticTopRef.current = propTop;
      if (el) el.scrollTop = propTop;
      pendingScrollRef.current = propTop;
      prevOffsetsRef.current = offsets;
      applyScrollTop(propTop, DIFF_SCROLL_OVERSCAN);
      return;
    }

    // After file expand rebuilds rows, re-apply held jump once if DOM reset.
    if (
      programmaticTopRef.current != null &&
      el &&
      Math.abs(el.scrollTop - programmaticTopRef.current) > 4
    ) {
      const held = programmaticTopRef.current;
      el.scrollTop = held;
      pendingScrollRef.current = held;
      prevOffsetsRef.current = offsets;
      applyScrollTop(held, DIFF_SCROLL_OVERSCAN);
      return;
    }

    let top =
      el && typeof el.scrollTop === 'number'
        ? el.scrollTop
        : propTop != null
          ? propTop
          : pendingScrollRef.current;

    // Measure / expand changed row heights — keep the same content under the
    // viewport top so the list does not jump under the cursor.
    const prevOff = prevOffsetsRef.current;
    if (
      prevOff &&
      offsets &&
      prevOff !== offsets &&
      (prevOff.length !== offsets.length ||
        prevOff[prevOff.length - 1] !== offsets[offsets.length - 1])
    ) {
      const adjusted = adjustScrollTopForOffsetChange(top, prevOff, offsets);
      const maxScroll = Math.max(
        0,
        (offsets[offsets.length - 1] || 0) - (el?.clientHeight || vp || 0)
      );
      const clamped = Math.min(maxScroll, Math.max(0, adjusted));
      if (el && Math.abs(clamped - top) > 0.5) {
        el.scrollTop = clamped;
      }
      top = clamped;
      pendingScrollRef.current = clamped;
    }
    prevOffsetsRef.current = offsets;
    // Keep the scroll-safe window after variable-row measurements settle;
    // shrinking back to base overscan here reintroduced a one-frame gap.
    applyScrollTop(top, DIFF_SCROLL_OVERSCAN);
  }, [virtualRows, offsets, vp, scrollTopProp, listRef, applyScrollTop]);

  // Clear held jump after user scrolls (wheel)
  useEffect(() => {
    const el = listRef?.current as HTMLElement | null;
    if (!el) return undefined;
    const onUserScroll = () => {
      // Only clear if movement is not our programmatic write
      const held = programmaticTopRef.current;
      if (held != null && Math.abs(el.scrollTop - held) > 8) {
        programmaticTopRef.current = null;
      }
    };
    el.addEventListener('scroll', onUserScroll, { passive: true });
    return () => el.removeEventListener('scroll', onUserScroll);
  }, [listRef]);

  useLayoutEffect(() => {
    return () => {
      if (scrollRafRef.current && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = 0;
      }
    };
  }, []);

  // Local height measure; throttle parent notify (App re-render is costly)
  useLayoutEffect(() => {
    const el = listRef?.current as HTMLElement | null;
    if (!el) return undefined;
    let lastReported = 0;
    const apply = () => {
      const h = Math.min(
        Math.floor(el.clientHeight || 0),
        typeof window !== 'undefined' && window.innerHeight > 0
          ? window.innerHeight
          : Number.POSITIVE_INFINITY
      );
      if (h <= 0) return;
      setMeasuredH((prev) => (prev === h ? prev : h));
      if (typeof onViewportHeight === 'function' && Math.abs(h - lastReported) >= 4) {
        lastReported = h;
        onViewportHeight(h);
      }
    };
    apply();
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => apply());
      ro.observe(el);
    }
    window.addEventListener('resize', apply);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', apply);
    };
  }, [listRef, onViewportHeight, virtualRows?.length]);

  // Search hit only: fine-tune current mark into view.
  // Thread nav (⌥J/K) already set scrollTop via App — do not scrollIntoView
  // again or the list shakes as two scroll targets fight.
  useLayoutEffect(() => {
    if (!activeSearchHit) return;
    if (highlightRowIndex == null || !listRef?.current) return;
    const root = listRef.current as HTMLElement;
    const rowEl = root.querySelector?.(
      `[data-row-index="${highlightRowIndex}"]`
    ) as HTMLElement | null;
    if (!rowEl) return;
    const mark = rowEl.querySelector?.(
      '.prp-search-mark--current'
    ) as HTMLElement | null;
    const target = mark || rowEl;
    try {
      target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    } catch {
      /* ignore */
    }
  }, [highlightRowIndex, activeSearchHit, activeSearchOccurrence, listRef]);

  const slice =
    range.end >= range.start && Array.isArray(virtualRows)
      ? virtualRows.slice(range.start, range.end + 1)
      : [];

  // Keep sticky header row fields in sync when virtualRows rebuild (collapse/viewed)
  useLayoutEffect(() => {
    const path = stickyMetaRef.current.path;
    const show = stickyMetaRef.current.show;
    if (!show || !path || !Array.isArray(virtualRows)) return;
    const row = virtualRows.find(
      (r: any) => r?.kind === 'file-header' && r.filePath === path
    );
    if (row) setStickyMeta({ row, show: true });
  }, [virtualRows]);

  // After sticky mounts/changes, sync transform from current scroll (ref not ready mid-RAF)
  useLayoutEffect(() => {
    if (!stickyMeta?.row || typeof resolveStickyFileHeaderLayout !== 'function') {
      return;
    }
    const layout = resolveStickyFileHeaderLayout(
      virtualRows,
      offsets,
      pendingScrollRef.current,
      ROW_HEIGHT
    );
    const el = stickyElRef.current;
    if (!el || !layout) return;
    const show = Boolean(layout.show);
    el.style.transform = `translate3d(0, ${Number(layout.translateY) || 0}px, 0)`;
    el.style.visibility = show ? 'visible' : 'hidden';
    el.style.pointerEvents = show ? 'auto' : 'none';
  }, [stickyMeta?.row, stickyMeta?.show, virtualRows, offsets]);

  // Sticky width = scroller clientWidth so it matches in-list rows (not scrollbar track)
  useLayoutEffect(() => {
    const el = listRef?.current as HTMLElement | null;
    if (!el) return undefined;
    const measure = () => {
      const w = Math.floor(el.clientWidth || 0);
      if (w > 0) setStickyWidth((prev) => (prev === w ? prev : w));
    };
    measure();
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => measure());
      ro.observe(el);
    }
    window.addEventListener('resize', measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [listRef, virtualRows?.length, measuredH]);

  return (
    <div className="prp-vlist-host">
      {/*
        Sticky is a SIBLING of the scrollport (not inside overflow/contain).
        Absolute top of host pins it; width matches vlist.clientWidth for parity.
      */}
      {/*
        Keep mounted while we have a sticky path so transform updates don't remount.
        visibility/transform driven from scroll RAF for smooth push (no layout jump).
      */}
      {stickyMeta?.row ? (
        <div
          ref={stickyElRef}
          className="prp-file-header-sticky"
          role="presentation"
          style={{
            width:
              stickyWidth != null && stickyWidth > 0 ? stickyWidth : undefined,
            visibility: stickyMeta.show ? 'visible' : 'hidden',
            pointerEvents: stickyMeta.show ? 'auto' : 'none',
          }}
        >
          <FileHeaderRow
            row={stickyMeta.row}
            viewedPaths={viewedPaths}
            onToggleViewed={onToggleViewed}
            onToggleCollapse={onToggleCollapse}
            onFileComment={onFileComment}
            onPreviewMarkdown={onPreviewMarkdown}
            onSelectionStart={stableSelectionStart}
            sticky
            selected={
              isFileSelection &&
              fileSelectionPath === String(stickyMeta.row?.filePath || '')
            }
            selectionIsland={
              showSelectionIsland &&
              isFileSelection &&
              fileSelectionPath === String(stickyMeta.row?.filePath || '')
                ? selectionIsland
                : null
            }
          />
        </div>
      ) : null}
      <div
        className="prp-vlist prp-scroll-float"
        ref={listRef}
        onScroll={handleScroll}
        onMouseUp={(e) => onSelectionEnd?.({ x: e.clientX, y: e.clientY })}
        onMouseLeave={(e) => {
          if (selecting) onSelectionEnd?.({ x: e.clientX, y: e.clientY });
          setHoverReveal(false);
        }}
        onMouseOver={(e) => {
          if (isSelectionHoverTarget(e.target)) setHoverReveal(true);
        }}
        onMouseOut={(e) => {
          // Leaving selection/dock into non-selection chrome → clear (delayed)
          if (isSelectionHoverTarget(e.target) && !isSelectionHoverTarget(e.relatedTarget)) {
            setHoverReveal(false);
          }
        }}
      >
      <div className="prp-vlist__spacer" style={{ height: range.totalHeight }}>
        <div
          className="prp-vlist__window"
          style={{ transform: `translate3d(0, ${range.offsetY}px, 0)` }}
        >
          {slice.map((row: any) => {
            const isSearchMatch =
              qActive && matchRowSet && matchRowSet.has(Number(row.rowIndex));
            const isActiveHit =
              highlightRowIndex != null &&
              Number(highlightRowIndex) === Number(row.rowIndex);
            const searchRowClass = `${isSearchMatch ? ' prp-vline--search-match' : ''}${
              isActiveHit ? ' prp-vline--hit' : ''
            }`;
            const activeHitForMarks = isActiveHit ? activeSearchHit : null;
            const measureKey = diffRowMeasureKey(row, {
              expandedKeys: expandedLineKeys,
            });
            const estH = rowHeightFor(row, heightOpts);

            if (row.kind === 'inline-comment') {
              const thread = threadsByCommentId?.get?.(String(row.commentId));
              // Prefer live thread over row snapshot (resolve write-through).
              const resolved = Boolean(
                thread != null
                  ? thread.resolved || thread.root?.resolved
                  : row?.resolved
              );
              const pending = Boolean(
                row?.pending || thread?.pending || thread?.root?.pending
              );
              const collapsed =
                typeof isThreadCollapsed === 'function'
                  ? Boolean(isThreadCollapsed(row))
                  : false;
              const commentAnchor =
                row.commentId != null ? `review-comment:${row.commentId}` : null;
              const minH = collapsed ? COMMENT_ROW_HEIGHT_COLLAPSED : undefined;
              const commentSide =
                String(row.side || thread?.root?.side || 'RIGHT').toUpperCase() ===
                'LEFT'
                  ? 'LEFT'
                  : 'RIGHT';
              // Split line threads dock under the matching pane; file-level stays full width
              const isSplitComment = Boolean(row.split);
              const threadEl = (
                <InlineThread
                  row={row}
                  thread={thread}
                  onReply={onReply}
                  onResolve={onResolve}
                  onDelete={onDeleteReviewComment}
                  onHide={onHideComment}
                  onUnhide={onUnhideComment}
                  onEdit={onEditReviewComment}
                  onSaveEdit={onSaveEditReviewComment}
                  onCancelEdit={onCancelEditReviewComment}
                  editingCommentId={editingCommentId}
                  onRegisterEditorSave={onRegisterEditorSave}
                  onApplySuggestion={onApplySuggestion}
                  onRegisterApply={onRegisterApply}
                  onToggleReaction={onToggleReaction}
                  onLoadReactors={onLoadReactors}
                  actionBusy={actionBusy}
                  viewerLogin={viewerLogin}
                  prOpen={prOpen}
                  linkCtx={linkCtx}
                  mentionCandidates={mentionCandidates}
                  onUploadFile={onUploadFile}
                  collapsed={collapsed}
                  onToggleCollapse={() =>
                    onToggleThreadCollapse?.(
                      row.commentId,
                      resolved,
                      row.threadNodeId || thread?.threadNodeId || null
                    )
                  }
                  commentsLoading={Boolean(
                    typeof isThreadCommentsLoading === 'function' &&
                      isThreadCommentsLoading(
                        row.threadNodeId ||
                          thread?.threadNodeId ||
                          row.commentId
                      )
                  )}
                  pendingCount={pendingCount}
                  hasViewerPendingReview={hasViewerPendingReview}
                  showHunk={false}
                  searchQuery={qActive ? searchQuery : ''}
                  activeSearchHit={activeSearchHit}
                  searchHits={searchHits}
                  searchHitIndex={searchHitIndex}
                />
              );
              const commentInner = (
                <DiffCommentRowFrame
                  commentId={row.commentId}
                  className={`prp-vline prp-vline--comment${
                    isSplitComment ? ' prp-vline--comment-split' : ''
                  }${collapsed ? ' prp-vline--comment-collapsed' : ''}${
                    pending ? ' prp-vline--comment-pending' : ''
                  }${isSearchMatch ? ' prp-vline--search-match' : ''}`}
                  searchHit={Boolean(isActiveHit)}
                  style={minH != null ? { minHeight: minH } : undefined}
                  data-row-index={row.rowIndex}
                  data-collapsed={collapsed ? '1' : '0'}
                  data-pending={pending ? '1' : undefined}
                  data-side={commentSide}
                  data-split={isSplitComment ? '1' : '0'}
                  data-search-anchor={commentAnchor || undefined}
                  data-thread-focus-anchor={commentAnchor || undefined}
                >
                  {isSplitComment ? (
                    <>
                      <span className="prp-line-gutter" aria-hidden="true" />
                      <div className="prp-split-cols prp-split-cols--comment">
                        <div
                          className="prp-split-cols__left prp-split-cols__comment-pane"
                          data-side="LEFT"
                        >
                          {commentSide === 'LEFT' ? threadEl : null}
                        </div>
                        <div
                          className="prp-split-cols__right prp-split-cols__comment-pane"
                          data-side="RIGHT"
                        >
                          {commentSide === 'RIGHT' ? threadEl : null}
                        </div>
                      </div>
                    </>
                  ) : (
                    threadEl
                  )}
                </DiffCommentRowFrame>
              );
              return (
                <DiffVirtualRowShell
                  key={row.rowIndex}
                  measureKey={measureKey}
                  estimatedHeight={estH}
                  onHeight={reportMeasuredHeight}
                >
                  {commentInner}
                </DiffVirtualRowShell>
              );
            }
            if (row.kind === 'file-header') {
              // Prefer sticky dock when that file is sticky (avoid double form)
              const stickyOwnsFile =
                stickyMeta?.show &&
                String(stickyMeta.row?.filePath || '') ===
                  String(row.filePath || '');
              const headerSelected =
                isFileSelection &&
                fileSelectionPath === String(row.filePath || '');
              const dockFile =
                showSelectionIsland &&
                headerSelected &&
                !stickyOwnsFile;
              return (
                <FileHeaderRow
                  key={row.rowIndex}
                  row={row}
                  viewedPaths={viewedPaths}
                  onToggleViewed={onToggleViewed}
                  onToggleCollapse={onToggleCollapse}
                  onFileComment={onFileComment}
                  onPreviewMarkdown={onPreviewMarkdown}
                  onSelectionStart={stableSelectionStart}
                  searchRowClass={searchRowClass}
                  isSearchMatch={Boolean(isSearchMatch)}
                  isActiveHit={Boolean(isActiveHit)}
                  activeHitForMarks={activeHitForMarks}
                  occ={occ}
                  searchQuery={qActive ? searchQuery : ''}
                  selected={headerSelected}
                  selectionIsland={dockFile ? selectionIsland : null}
                />
              );
            }

            if (row.kind === 'diff-image') {
              const status = String(row.status || 'modified').toLowerCase();
              const showBase = Boolean(row.baseUrl);
              const showHead =
                Boolean(row.headUrl) &&
                status !== 'removed' &&
                status !== 'deleted';
              return (
                <DiffVirtualRowShell
                  key={row.rowIndex}
                  measureKey={measureKey}
                  estimatedHeight={estH}
                  onHeight={reportMeasuredHeight}
                >
                  <div
                    className={`prp-vline prp-vline--image${searchRowClass}`}
                    data-row-index={row.rowIndex}
                    data-search-current={isActiveHit ? '1' : undefined}
                  >
                    <div className="prp-diff-image">
                      {showBase ? (
                        <figure className="prp-diff-image__pane prp-diff-image__pane--base">
                          <figcaption className="prp-diff-image__label">
                            {status === 'removed' || status === 'deleted'
                              ? 'Removed'
                              : 'Before'}
                          </figcaption>
                          <img
                            className="prp-diff-image__img"
                            src={row.baseUrl}
                            alt={`${row.filePath || 'image'} (before)`}
                            loading="lazy"
                            referrerPolicy="no-referrer-when-downgrade"
                            title="Click to expand"
                            onClick={() =>
                              setImageViewer({
                                src: String(row.baseUrl),
                                alt: `${row.filePath || 'image'} (before)`,
                              })
                            }
                            onError={(e) => {
                              (
                                e.currentTarget as HTMLImageElement
                              ).style.display = 'none';
                            }}
                          />
                        </figure>
                      ) : null}
                      {showHead ? (
                        <figure className="prp-diff-image__pane prp-diff-image__pane--head">
                          <figcaption className="prp-diff-image__label">
                            {status === 'added' || status === 'add'
                              ? 'Added'
                              : 'After'}
                          </figcaption>
                          <img
                            className="prp-diff-image__img"
                            src={row.headUrl}
                            alt={`${row.filePath || 'image'} (after)`}
                            loading="lazy"
                            referrerPolicy="no-referrer-when-downgrade"
                            title="Click to expand"
                            onClick={() =>
                              setImageViewer({
                                src: String(row.headUrl),
                                alt: `${row.filePath || 'image'} (after)`,
                              })
                            }
                            onError={(e) => {
                              (
                                e.currentTarget as HTMLImageElement
                              ).style.display = 'none';
                            }}
                          />
                        </figure>
                      ) : null}
                      {!showBase && !showHead ? (
                        <p className="prp-diff-image__empty">
                          Image preview unavailable
                        </p>
                      ) : null}
                    </div>
                  </div>
                </DiffVirtualRowShell>
              );
            }

            if (row.kind === 'diff-meta') {
              return (
                <div
                  key={row.rowIndex}
                  className={`prp-vline prp-vline--meta${searchRowClass}`}
                  style={{ height: ROW_HEIGHT }}
                  data-row-index={row.rowIndex}
                  data-search-current={isActiveHit ? '1' : undefined}
                >
                  <span className="prp-diff-meta-text">
                    {row.text || 'Binary file — not shown'}
                  </span>
                </div>
              );
            }

            const expandKey = diffLineExpandKey(row);
            const lineExpanded = Boolean(
              expandKey && expandedLineKeys.has(expandKey)
            );
            const lineExpandable =
              lineExpanded || isDiffLineExpandable(row);
            const codeRowH = rowHeightFor(row, heightOpts);
            const codeLine = (
              <DiffCodeLine
                row={row}
                searchRowClass={searchRowClass}
                isSearchMatch={Boolean(isSearchMatch)}
                isActiveHit={Boolean(isActiveHit)}
                activeHitForMarks={activeHitForMarks}
                occ={occ}
                searchQuery={qActive ? searchQuery : ''}
                selectionOverride={selectionOverride}
                selecting={Boolean(selecting)}
                onSelectionStart={stableSelectionStart}
                onSelectionExtend={stableSelectionExtend}
                onExpandGap={stableExpandGap}
                expandBusyKey={expandBusyKey}
                useSyntax
                hljsEpoch={hljsEpoch}
                selectionIsland={
                  showSelectionIsland && !isFileSelection
                    ? selectionIsland
                    : null
                }
                rowHeight={codeRowH}
                lineExpanded={lineExpanded}
                lineExpandable={lineExpandable}
                onToggleLineExpand={
                  lineExpandable
                    ? () => toggleLineExpand(row)
                    : undefined
                }
                onMeasureLineHeight={
                  lineExpanded && expandKey
                    ? (px: number) => measureLineHeight(expandKey, px)
                    : undefined
                }
              />
            );
            // Expanded long lines also report via DiffCodeLine RO; shell is
            // belt-and-suspenders so offsets track even if paint order differs.
            if (lineExpanded && measureKey) {
              return (
                <DiffVirtualRowShell
                  key={row.rowIndex}
                  measureKey={measureKey}
                  estimatedHeight={codeRowH}
                  onHeight={reportMeasuredHeight}
                >
                  {codeLine}
                </DiffVirtualRowShell>
              );
            }
            return (
              <React.Fragment key={row.rowIndex}>{codeLine}</React.Fragment>
            );
          })}
        </div>
      </div>
      </div>
      <FloatingScrollbar
        scrollerRef={listRef}
        contentKey={`${totalRows}:${range.totalHeight}:${Math.round(vp)}`}
      />
      {imageViewer ? (
        <ImageViewer
          src={imageViewer.src}
          alt={imageViewer.alt}
          title={imageViewer.alt || 'Image'}
          onClose={() => setImageViewer(null)}
        />
      ) : null}
      {mdViewer ? (
        <MarkdownViewer
          path={mdViewer.path}
          status={mdViewer.status}
          onClose={() => setMdViewer(null)}
        />
      ) : null}
    </div>
  );
}

/**
 * Measure host for variable-height Diff rows (threads, images, expanded lines).
 * Feeds measuredHeights → rowOffsets so spacer/totalHeight matches real DOM.
 */

export const VirtualDiff = memo(VirtualDiffImpl);
export default VirtualDiff;
