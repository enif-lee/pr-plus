import React, {
  useLayoutEffect,
  useMemo,
  useCallback,
  useRef,
  useState,
  memo,
} from 'react';
import {
  ROW_HEIGHT,
  COMMENT_ROW_HEIGHT_COLLAPSED,
  averageRowHeight,
  rowOffsets,
  highlightCode,
  escapeHtml,
  clearHighlightCodeCache,
} from '@common/utils';
import {
  ensureHljsLanguageForPath,
  onHljsLanguagesChanged,
  prefetchHljsLanguages,
} from '@lib/hljs-lazy';
import { calculateVisibleRange } from '@lib/virtual-range';
import {
  isRowInSelection,
  isSelectableDiffRow,
  selectionBlockRole,
} from '@lib/line-selection';
import { isPathViewed } from '@lib/review-threads';
import {
  markSearchInText,
  markSearchInHtml,
  resolveActiveMarkStart,
} from '@lib/search-index';
import { IconDisclosure } from '@common/icons';
import { InlineThread } from './InlineThread';

/**
 * Diff line HTML: optional syntax highlight, then inject search marks into the
 * rendered HTML so structure (and hljs spans) are preserved.
 */
function renderSearchableHtml(
  displayText: string,
  filePath: string | undefined,
  searchQuery: string,
  row: any,
  activeHit: any,
  occurrenceIndex: number,
  field: 'code' | 'left' | 'right' | 'text',
  useSyntax: boolean
) {
  const q = (searchQuery || '').trim();
  let html = useSyntax
    ? highlightCode(displayText, filePath)
    : escapeHtml(displayText ?? '');
  if (!q) return html;
  const currentStart = resolveActiveMarkStart(
    displayText ?? '',
    q,
    row,
    activeHit,
    occurrenceIndex,
    field
  );
  if (typeof markSearchInHtml === 'function') {
    return markSearchInHtml(html, q, {
      currentStart,
      occurrenceIndex: activeHit ? occurrenceIndex : null,
    });
  }
  return markSearchInText(displayText ?? '', q, { currentStart });
}

/** Compact expand controls for the right side of an @@ hunk row. */
function HunkExpandControls({
  gap,
  filePath,
  onExpandGap,
  expandBusyKey,
  placement,
}: {
  gap: any;
  filePath: string;
  onExpandGap: any;
  expandBusyKey: any;
  /** above = gap before this hunk; below = trailing after last hunk */
  placement: 'above' | 'below';
}) {
  if (!gap) return null;
  const count = Math.max(0, Number(gap.hiddenCount) || 0);
  if (!count) return null;
  const chunk = Math.max(1, Number(gap.expandChunk) || 20);
  const showSides = count > chunk;
  const sideN = Math.min(chunk, count);
  const busyPrefix = `${filePath}:${gap.gapStartNew}-${gap.gapEndNew}:`;
  const busy = Boolean(
    expandBusyKey && String(expandBusyKey).startsWith(busyPrefix)
  );
  const payload = { ...gap, filePath };
  const labelAll =
    busy
      ? '…'
      : count <= chunk
        ? `Expand ${count}`
        : `Expand all ${count}`;

  return (
    <div
      className={`prp-hunk-expand prp-hunk-expand--${placement}`}
      role="group"
      aria-label={
        placement === 'above'
          ? 'Expand omitted lines above this hunk'
          : 'Expand omitted lines below this hunk'
      }
      onMouseDown={(e) => e.stopPropagation()}
    >
      {showSides ? (
        <button
          type="button"
          className="prp-hunk-expand__btn"
          disabled={busy || !onExpandGap}
          title={
            placement === 'above'
              ? `Show next ${sideN} lines after previous section`
              : `Show next ${sideN} lines after this hunk`
          }
          onClick={() => onExpandGap?.(payload, 'down')}
        >
          ▼{sideN}
        </button>
      ) : null}
      <button
        type="button"
        className="prp-hunk-expand__btn prp-hunk-expand__btn--all"
        disabled={busy || !onExpandGap}
        title={
          count
            ? `Show all ${count} omitted lines`
            : 'Expand omitted lines'
        }
        onClick={() => onExpandGap?.(payload, 'all')}
      >
        {labelAll}
      </button>
      {showSides ? (
        <button
          type="button"
          className="prp-hunk-expand__btn"
          disabled={busy || !onExpandGap}
          title={
            placement === 'above'
              ? `Show previous ${sideN} lines before this hunk`
              : `Show previous ${sideN} lines from end of file`
          }
          onClick={() => onExpandGap?.(payload, 'up')}
        >
          ▲{sideN}
        </button>
      ) : null}
    </div>
  );
}

type DiffCodeLineProps = {
  row: any;
  searchRowClass: string;
  isSearchMatch: boolean;
  isActiveHit: boolean;
  activeHitForMarks: any;
  occ: number;
  searchQuery: string;
  selection: any;
  selecting: boolean;
  onSelectionStart: any;
  onSelectionExtend: any;
  onExpandGap: any;
  expandBusyKey: any;
  /** false while user is actively scrolling — plain escapeHtml (cheap) */
  useSyntax: boolean;
  /** Bumps when a lazy language grammar loads so memoized rows re-highlight */
  hljsEpoch: number;
};

/**
 * Memoized code/hunk row: when the virtual window slides, overlapping lines keep
 * the same props and skip re-render (highlight HTML stays cached too).
 */
const DiffCodeLine = memo(function DiffCodeLine({
  row,
  searchRowClass,
  isSearchMatch,
  isActiveHit,
  activeHitForMarks,
  occ,
  searchQuery,
  selection,
  selecting,
  onSelectionStart,
  onSelectionExtend,
  onExpandGap,
  expandBusyKey,
  useSyntax,
  hljsEpoch: _hljsEpoch,
}: DiffCodeLineProps) {
  const isCode =
    row.kind === 'diff-line' &&
    (row.lineType === 'add' || row.lineType === 'del' || row.lineType === 'context');
  const isHunk = row.kind === 'diff-line' && row.lineType === 'hunk';
  const expandAbove = isHunk ? row.expandAbove : null;
  const expandBelow = isHunk ? row.expandBelow : null;
  const hasHunkExpand = Boolean(expandAbove || expandBelow);
  if (isHunk && row.hidden && !hasHunkExpand) {
    return null;
  }
  const selected =
    selection && typeof isRowInSelection === 'function'
      ? isRowInSelection(selection, row)
      : false;
  const selRole =
    selected && typeof selectionBlockRole === 'function'
      ? selectionBlockRole(selection, row)
      : null;
  const selectable =
    typeof isSelectableDiffRow === 'function' ? isSelectableDiffRow(row) : false;
  const isSplit = Boolean(row.split);
  const hideHunkText = Boolean(isHunk && row.hidden);
  const qForRow = isSearchMatch ? searchQuery : '';

  return (
    <div
      className={`prp-vline prp-vline--${row.lineType || row.kind}${
        isSplit ? ' prp-vline--split' : ''
      }${isHunk ? ' prp-vline--hunk' : ''}${
        hasHunkExpand ? ' prp-vline--hunk-expandable' : ''
      }${hideHunkText ? ' prp-vline--hunk-hidden-text' : ''}${searchRowClass}${
        selected ? ' prp-vline--selected' : ''
      }${selRole ? ` prp-vline--sel-${selRole}` : ''}${
        selectable ? ' prp-vline--selectable' : ''
      }`}
      style={{ height: ROW_HEIGHT }}
      data-row-index={row.rowIndex}
      data-file-path={row.filePath || ''}
      data-new-line={row.newLine ?? ''}
      data-sel-role={selRole || undefined}
      data-split={isSplit ? '1' : '0'}
      data-search-match={isSearchMatch ? '1' : undefined}
      data-search-current={isActiveHit ? '1' : undefined}
      data-hunk-hidden={hideHunkText ? '1' : undefined}
      title={
        selectable
          ? 'Click = single line · Shift+click or drag = multi-line comment'
          : undefined
      }
      onMouseDown={(e) => {
        if (e.button !== 0 || !selectable) return;
        e.preventDefault();
        onSelectionStart?.(row, { x: e.clientX, y: e.clientY }, {
          shiftKey: Boolean(e.shiftKey),
        });
      }}
      onMouseEnter={() => {
        if (selecting) onSelectionExtend?.(row);
      }}
    >
      <span className="prp-line-gutter" />
      {isHunk ? (
        <>
          {!hideHunkText ? (
            <code
              className="prp-code prp-hunk-text"
              dangerouslySetInnerHTML={{
                __html: renderSearchableHtml(
                  row.text || row.raw || row.code || '',
                  row.filePath,
                  qForRow,
                  row,
                  activeHitForMarks,
                  occ,
                  'text',
                  false
                ),
              }}
            />
          ) : (
            <span className="prp-hunk-text prp-hunk-text--empty" />
          )}
          {expandAbove || expandBelow ? (
            <div className="prp-hunk-expand-rail">
              {expandAbove ? (
                <HunkExpandControls
                  gap={expandAbove}
                  filePath={row.filePath || ''}
                  onExpandGap={onExpandGap}
                  expandBusyKey={expandBusyKey}
                  placement="above"
                />
              ) : null}
              {expandBelow ? (
                <HunkExpandControls
                  gap={expandBelow}
                  filePath={row.filePath || ''}
                  onExpandGap={onExpandGap}
                  expandBusyKey={expandBusyKey}
                  placement="below"
                />
              ) : null}
            </div>
          ) : (
            <span className="prp-hunk-expand-rail" aria-hidden="true" />
          )}
        </>
      ) : isSplit && isCode ? (
        <div className="prp-split-cols">
          <div className="prp-split-cols__left">
            <span className="prp-split-cols__ln">{row.oldLine ?? ''}</span>
            <code
              className={useSyntax ? 'hljs prp-code' : 'prp-code'}
              dangerouslySetInnerHTML={{
                __html: renderSearchableHtml(
                  row.leftCode ?? '',
                  row.filePath,
                  qForRow,
                  row,
                  activeHitForMarks,
                  occ,
                  'left',
                  useSyntax
                ),
              }}
            />
          </div>
          <div className="prp-split-cols__right">
            <span className="prp-split-cols__ln">{row.newLine ?? ''}</span>
            <code
              className={useSyntax ? 'hljs prp-code' : 'prp-code'}
              dangerouslySetInnerHTML={{
                __html: renderSearchableHtml(
                  row.rightCode ?? '',
                  row.filePath,
                  qForRow,
                  row,
                  activeHitForMarks,
                  occ,
                  'right',
                  useSyntax
                ),
              }}
            />
          </div>
        </div>
      ) : (
        <code
          className={isCode && useSyntax ? 'hljs prp-code' : 'prp-code'}
          dangerouslySetInnerHTML={{
            __html: isCode
              ? renderSearchableHtml(
                  row.code ?? row.text,
                  row.filePath,
                  qForRow,
                  row,
                  activeHitForMarks,
                  occ,
                  'code',
                  useSyntax
                )
              : renderSearchableHtml(
                  row.text || '',
                  row.filePath,
                  qForRow,
                  row,
                  activeHitForMarks,
                  occ,
                  'text',
                  false
                ),
          }}
        />
      )}
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
    selection,
    selecting,
    onSelectionStart,
    onSelectionExtend,
    onSelectionEnd,
    onToggleCollapse,
    /** Expand omitted context between hunks (controls sit on @@ rows) */
    onExpandGap = null,
    expandBusyKey = null,
    viewedPaths,
    onToggleViewed,
    threadsByCommentId,
    replyDrafts,
    onReplyDraft,
    onReply,
    onResolve,
    onDeleteReviewComment,
    onEditReviewComment,
    onSaveEditReviewComment,
    onCancelEditReviewComment,
    editingCommentId,
    onRegisterEditorSave,
    onApplySuggestion,
    onRegisterApply,
    actionBusy,
    viewerLogin,
    prOpen,
    linkCtx,
    onUploadFile,
    /** (row|commentId, resolved?) => boolean — resolved defaults collapsed */
    isThreadCollapsed = null,
    onToggleThreadCollapse,
    /** Passed to rowOffsets / averageRowHeight for collapse-aware virtual heights */
    commentHeightOpts = null,
    pendingCount = 0,
    searchQuery = '',
    searchMatchRows = null,
    activeSearchHit = null,
    activeSearchOccurrence = 0,
    searchHits = null,
    searchHitIndex = -1,
  } = props;

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

  const heightOpts = useMemo(() => {
    if (commentHeightOpts) return commentHeightOpts;
    if (typeof isThreadCollapsed === 'function') {
      return { isCollapsed: (row: any) => Boolean(isThreadCollapsed(row)) };
    }
    return null;
  }, [commentHeightOpts, isThreadCollapsed]);

  const avgH = useMemo(
    () => averageRowHeight(virtualRows, heightOpts),
    [virtualRows, heightOpts]
  );
  const offsets = useMemo(
    () => rowOffsets(virtualRows, heightOpts),
    [virtualRows, heightOpts]
  );

  const vp = Math.max(120, measuredH || Number(viewportHeight) || 520);
  const totalRows = virtualRows?.length || 0;
  const initialTop = Math.max(0, Number(scrollTopProp) || 0);

  /**
   * Visible window only — NOT scrollTop. Native overflow moves pixels between
   * row boundaries; React re-renders solely when start/end/offsetY change.
   */
  const [range, setRange] = useState(() =>
    calculateVisibleRange({
      totalRows: Array.isArray(virtualRows) ? virtualRows.length : 0,
      rowHeight: ROW_HEIGHT,
      viewportHeight: Math.max(120, Number(viewportHeight) || 520),
      scrollTop: initialTop,
      overscan: 8,
    })
  );

  /**
   * Bumped when a lazy hljs grammar finishes loading so visible lines re-highlight.
   * Included in DiffLineRow keys via render path (parent re-render is enough).
   */
  const [hljsEpoch, setHljsEpoch] = useState(0);
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

  const applyScrollTop = useCallback((scrollTop: number, overscan = 8) => {
    const m = metricsRef.current;
    const next = calculateVisibleRange({
      totalRows: m.totalRows,
      rowHeight: m.avgH,
      viewportHeight: m.vp,
      scrollTop: Math.max(0, scrollTop),
      overscan,
      offsets: m.offsets,
    });
    pendingScrollRef.current = scrollTop;
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
        if (lt !== 'add' && lt !== 'del' && lt !== 'context') continue;
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

  const flushPendingScroll = useCallback(() => {
    scrollRafRef.current = 0;
    const top = pendingScrollRef.current;
    const changed = applyScrollTop(top);
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
      pendingScrollRef.current = e.currentTarget.scrollTop;
      if (scrollRafRef.current) return;
      if (typeof requestAnimationFrame === 'function') {
        scrollRafRef.current = requestAnimationFrame(flushPendingScroll);
      } else {
        flushPendingScroll();
      }
    },
    [flushPendingScroll]
  );

  // Rows / viewport / external jump → recompute window (no-op if unchanged)
  useLayoutEffect(() => {
    const el = listRef?.current as HTMLElement | null;
    const top =
      el && typeof el.scrollTop === 'number'
        ? el.scrollTop
        : scrollTopProp != null && Number.isFinite(Number(scrollTopProp))
          ? Math.max(0, Number(scrollTopProp))
          : pendingScrollRef.current;
    applyScrollTop(top);
  }, [virtualRows, offsets, vp, scrollTopProp, listRef, applyScrollTop]);

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
      const h = Math.floor(el.clientHeight || 0);
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

  // After jump, ensure current mark is in view
  useLayoutEffect(() => {
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

  return (
    <div
      className="prp-vlist"
      ref={listRef}
      onScroll={handleScroll}
      onMouseUp={(e) => onSelectionEnd?.({ x: e.clientX, y: e.clientY })}
      onMouseLeave={(e) => {
        if (selecting) onSelectionEnd?.({ x: e.clientX, y: e.clientY });
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

            if (row.kind === 'inline-comment') {
              const thread = threadsByCommentId?.get?.(String(row.commentId));
              const resolved = Boolean(thread?.resolved || row?.resolved);
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
              return (
                <div
                  key={row.rowIndex}
                  className={`prp-vline prp-vline--comment${
                    collapsed ? ' prp-vline--comment-collapsed' : ''
                  }${pending ? ' prp-vline--comment-pending' : ''}${searchRowClass}`}
                  style={minH != null ? { minHeight: minH } : undefined}
                  data-row-index={row.rowIndex}
                  data-collapsed={collapsed ? '1' : '0'}
                  data-pending={pending ? '1' : undefined}
                  data-search-current={isActiveHit ? '1' : undefined}
                  data-search-anchor={commentAnchor || undefined}
                >
                  <InlineThread
                    row={row}
                    thread={thread}
                    replyText={replyDrafts?.[String(row.commentId)] || ''}
                    onReplyText={(t: string) => onReplyDraft?.(row.commentId, t)}
                    onReply={onReply}
                    onResolve={onResolve}
                    onDelete={onDeleteReviewComment}
                    onEdit={onEditReviewComment}
                    onSaveEdit={onSaveEditReviewComment}
                    onCancelEdit={onCancelEditReviewComment}
                    editingCommentId={editingCommentId}
                    onRegisterEditorSave={onRegisterEditorSave}
                    onApplySuggestion={onApplySuggestion}
                    onRegisterApply={onRegisterApply}
                    actionBusy={actionBusy}
                    viewerLogin={viewerLogin}
                    prOpen={prOpen}
                    linkCtx={linkCtx}
                    onUploadFile={onUploadFile}
                    collapsed={collapsed}
                    onToggleCollapse={() =>
                      onToggleThreadCollapse?.(row.commentId, resolved)
                    }
                    pendingCount={pendingCount}
                    showHunk={false}
                    searchQuery={qActive ? searchQuery : ''}
                    activeSearchHit={activeSearchHit}
                    searchHits={searchHits}
                    searchHitIndex={searchHitIndex}
                  />
                </div>
              );
            }
            if (row.kind === 'file-header') {
              const viewed = isPathViewed
                ? isPathViewed(viewedPaths, row.filePath)
                : false;
              const collapsed = Boolean(row.collapsed);
              const openable = row.openable !== false;
              const status = String(row.status || 'modified').toLowerCase();
              const adds = row.additions ?? 0;
              const dels = row.deletions ?? 0;
              const headerTone =
                status === 'added' || status === 'add'
                  ? 'add'
                  : status === 'removed' ||
                      status === 'deleted' ||
                      status === 'del'
                    ? 'del'
                    : status === 'renamed'
                      ? 'rename'
                      : adds > 0 && dels === 0
                        ? 'add'
                        : dels > 0 && adds === 0
                          ? 'del'
                          : 'mod';
              return (
                <div
                  key={row.rowIndex}
                  className={`prp-vline prp-vline--header prp-vline--header-${headerTone}${
                    !openable ? ' prp-vline--header-binary' : ''
                  }${searchRowClass}`}
                  style={{ height: ROW_HEIGHT }}
                  data-row-index={row.rowIndex}
                  data-file-status={status}
                  data-openable={openable ? '1' : '0'}
                  data-file-kind={row.fileKind || undefined}
                  data-search-current={isActiveHit ? '1' : undefined}
                >
                  <label className="prp-file-header__viewed" title="Mark as viewed">
                    <input
                      type="checkbox"
                      checked={viewed}
                      onChange={() => onToggleViewed?.(row.filePath)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </label>
                  {openable ? (
                    <button
                      type="button"
                      className="prp-file-header__collapse"
                      title={collapsed ? 'Expand file' : 'Collapse file'}
                      onClick={() => onToggleCollapse?.(row.filePath)}
                    >
                      <IconDisclosure open={!collapsed} size={12} />
                    </button>
                  ) : (
                    <span
                      className="prp-file-header__collapse prp-file-header__collapse--locked"
                      title="Binary file — cannot open as text"
                      aria-hidden="true"
                    >
                      <IconDisclosure open={false} size={12} />
                    </span>
                  )}
                  <button
                    type="button"
                    className="prp-file-header-btn"
                    onClick={() => {
                      if (openable) onToggleCollapse?.(row.filePath);
                    }}
                    disabled={!openable}
                    title={
                      openable
                        ? undefined
                        : 'Binary file — cannot open in diff view'
                    }
                  >
                    <span
                      className={`prp-file-header__status prp-file-header__status--${headerTone}`}
                    >
                      {status}
                    </span>
                    <code
                      className="prp-file-header__path"
                      dangerouslySetInnerHTML={{
                        __html: isSearchMatch
                          ? markSearchInText(row.filePath || '', searchQuery, {
                              currentStart: isActiveHit
                                ? resolveActiveMarkStart(
                                    row.filePath || '',
                                    searchQuery,
                                    row,
                                    activeHitForMarks,
                                    occ,
                                    'text'
                                  )
                                : null,
                            })
                          : escapeHtml(row.filePath || ''),
                      }}
                    />
                    {!openable ? (
                      <span className="prp-file-header__binary-badge">binary</span>
                    ) : null}
                    <span
                      className="prp-file-header__stats"
                      aria-label={`+${adds} −${dels}`}
                    >
                      <span className="prp-stat-add">+{adds}</span>
                      <span className="prp-stat-del">−{dels}</span>
                    </span>
                  </button>
                </div>
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
                <div
                  key={row.rowIndex}
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
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).style.display =
                              'none';
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
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).style.display =
                              'none';
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

            return (
              <DiffCodeLine
                key={row.rowIndex}
                row={row}
                searchRowClass={searchRowClass}
                isSearchMatch={Boolean(isSearchMatch)}
                isActiveHit={Boolean(isActiveHit)}
                activeHitForMarks={activeHitForMarks}
                occ={occ}
                searchQuery={qActive ? searchQuery : ''}
                selection={selection}
                selecting={selecting}
                onSelectionStart={onSelectionStart}
                onSelectionExtend={onSelectionExtend}
                onExpandGap={onExpandGap}
                expandBusyKey={expandBusyKey}
                useSyntax
                hljsEpoch={hljsEpoch}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

export const VirtualDiff = memo(VirtualDiffImpl);
export default VirtualDiff;
