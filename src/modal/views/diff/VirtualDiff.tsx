import React, { useLayoutEffect, useMemo, memo, useState } from 'react';
import {
  ROW_HEIGHT,
  COMMENT_ROW_HEIGHT,
  averageRowHeight,
  rowOffsets,
  highlightCode,
  escapeHtml,
} from '@common/utils';
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

function VirtualDiffImpl(props: any) {
  const {
    virtualRows,
    scrollTop,
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
    collapsedThreads,
    onToggleThreadCollapse,
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

  const avgH = useMemo(() => averageRowHeight(virtualRows), [virtualRows]);
  const offsets = useMemo(() => rowOffsets(virtualRows), [virtualRows]);

  // Measure the flex-allocated list height so the bottom of the pane is scrollable
  useLayoutEffect(() => {
    const el = listRef?.current as HTMLElement | null;
    if (!el) return undefined;
    const apply = () => {
      const h = Math.floor(el.clientHeight || 0);
      if (h > 0) {
        setMeasuredH((prev) => (prev === h ? prev : h));
        if (typeof onViewportHeight === 'function') onViewportHeight(h);
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

  // After jump, ensure current mark is in view (virtual list may need a frame)
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

  const vp = Math.max(120, measuredH || Number(viewportHeight) || 520);
  const range = calculateVisibleRange({
    totalRows: virtualRows?.length || 0,
    rowHeight: avgH,
    viewportHeight: vp,
    scrollTop,
    overscan: 12,
    offsets,
  });

  const slice =
    range.end >= range.start ? virtualRows.slice(range.start, range.end + 1) : [];

  return (
    <div
      className="prp-vlist"
      ref={listRef}
      onScroll={(e) => onScroll(e.currentTarget.scrollTop)}
      onMouseUp={(e) => onSelectionEnd?.({ x: e.clientX, y: e.clientY })}
      onMouseLeave={(e) => {
        if (selecting) onSelectionEnd?.({ x: e.clientX, y: e.clientY });
      }}
    >
      <div className="prp-vlist__spacer" style={{ height: range.totalHeight }}>
        <div className="prp-vlist__window" style={{ transform: `translateY(${range.offsetY}px)` }}>
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
              const commentAnchor =
                row.commentId != null ? `review-comment:${row.commentId}` : null;
              return (
                <div
                  key={row.rowIndex}
                  className={`prp-vline prp-vline--comment${searchRowClass}`}
                  style={{ minHeight: COMMENT_ROW_HEIGHT }}
                  data-row-index={row.rowIndex}
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
                    collapsed={Boolean(collapsedThreads?.has?.(String(row.commentId)))}
                    onToggleCollapse={() => onToggleThreadCollapse?.(row.commentId)}
                    pendingCount={pendingCount}
                    searchQuery={qActive ? searchQuery : ''}
                    activeSearchHit={activeSearchHit}
                    searchHits={searchHits}
                    searchHitIndex={searchHitIndex}
                  />
                </div>
              );
            }
            if (row.kind === 'file-header') {
              const viewed = isPathViewed ? isPathViewed(viewedPaths, row.filePath) : false;
              const collapsed = Boolean(row.collapsed);
              const status = String(row.status || 'modified').toLowerCase();
              const adds = row.additions ?? 0;
              const dels = row.deletions ?? 0;
              const headerTone =
                status === 'added' || status === 'add'
                  ? 'add'
                  : status === 'removed' || status === 'deleted' || status === 'del'
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
                  className={`prp-vline prp-vline--header prp-vline--header-${headerTone}${searchRowClass}`}
                  style={{ height: ROW_HEIGHT }}
                  data-row-index={row.rowIndex}
                  data-file-status={status}
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
                  <button
                    type="button"
                    className="prp-file-header__collapse"
                    title={collapsed ? 'Expand file' : 'Collapse file'}
                    onClick={() => onToggleCollapse?.(row.filePath)}
                  >
                    {collapsed ? '▸' : '▾'}
                  </button>
                  <button
                    type="button"
                    className="prp-file-header-btn"
                    onClick={() => onToggleCollapse?.(row.filePath)}
                  >
                    <span className={`prp-file-header__status prp-file-header__status--${headerTone}`}>
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
                    <span className="prp-file-header__stats" aria-label={`+${adds} −${dels}`}>
                      <span className="prp-stat-add">+{adds}</span>
                      <span className="prp-stat-del">−{dels}</span>
                    </span>
                  </button>
                </div>
              );
            }
            const isCode =
              row.kind === 'diff-line' &&
              (row.lineType === 'add' || row.lineType === 'del' || row.lineType === 'context');
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

            return (
              <div
                key={row.rowIndex}
                className={`prp-vline prp-vline--${row.lineType || row.kind}${
                  isSplit ? ' prp-vline--split' : ''
                }${searchRowClass}${selected ? ' prp-vline--selected' : ''}${
                  selRole ? ` prp-vline--sel-${selRole}` : ''
                }${selectable ? ' prp-vline--selectable' : ''}`}
                style={{ height: ROW_HEIGHT }}
                data-row-index={row.rowIndex}
                data-file-path={row.filePath || ''}
                data-new-line={row.newLine ?? ''}
                data-sel-role={selRole || undefined}
                data-split={isSplit ? '1' : '0'}
                data-search-match={isSearchMatch ? '1' : undefined}
                data-search-current={isActiveHit ? '1' : undefined}
                title={
                  selectable ? 'Click = single line · Drag = multi-line comment' : undefined
                }
                onMouseDown={(e) => {
                  if (e.button !== 0 || !selectable) return;
                  e.preventDefault();
                  onSelectionStart?.(row, { x: e.clientX, y: e.clientY });
                }}
                onMouseEnter={() => {
                  if (selecting) onSelectionExtend?.(row);
                }}
              >
                <span className="prp-line-gutter" />
                {isSplit && isCode ? (
                  <div className="prp-split-cols">
                    <div className="prp-split-cols__left">
                      <span className="prp-split-cols__ln">{row.oldLine ?? ''}</span>
                      <code
                        className="hljs prp-code"
                        dangerouslySetInnerHTML={{
                          __html: renderSearchableHtml(
                            row.leftCode ?? '',
                            row.filePath,
                            isSearchMatch ? searchQuery : '',
                            row,
                            activeHitForMarks,
                            occ,
                            'left',
                            true
                          ),
                        }}
                      />
                    </div>
                    <div className="prp-split-cols__right">
                      <span className="prp-split-cols__ln">{row.newLine ?? ''}</span>
                      <code
                        className="hljs prp-code"
                        dangerouslySetInnerHTML={{
                          __html: renderSearchableHtml(
                            row.rightCode ?? '',
                            row.filePath,
                            isSearchMatch ? searchQuery : '',
                            row,
                            activeHitForMarks,
                            occ,
                            'right',
                            true
                          ),
                        }}
                      />
                    </div>
                  </div>
                ) : (
                  <code
                    className={isCode ? 'hljs prp-code' : 'prp-code'}
                    dangerouslySetInnerHTML={{
                      __html: isCode
                        ? renderSearchableHtml(
                            row.code ?? row.text,
                            row.filePath,
                            isSearchMatch ? searchQuery : '',
                            row,
                            activeHitForMarks,
                            occ,
                            'code',
                            true
                          )
                        : renderSearchableHtml(
                            row.text || '',
                            row.filePath,
                            isSearchMatch ? searchQuery : '',
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
          })}
        </div>
      </div>
    </div>
  );
}

export const VirtualDiff = memo(VirtualDiffImpl);
export default VirtualDiff;
