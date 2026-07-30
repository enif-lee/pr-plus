import React, {
  useLayoutEffect,
  useEffect,
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
} from '@lib/virtual-range';
import {
  isSelectableDiffRow,
  rowSelectionVisualKey,
  selectionActiveSide,
} from '@lib/line-selection';
import { isPathViewed } from '@lib/review-threads';
import { OptBtnHint } from '@common/OptBtnHint';
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
} from '@lib/line-expand';
import { IconDisclosure } from '@common/icons';
import { FloatingScrollbar } from '../../components/common/FloatingScrollbar';
import { ImageViewer } from '@common/ImageViewer';
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

function fileHeaderTone(row: any) {
  const status = String(row?.status || 'modified').toLowerCase();
  const adds = row?.additions ?? 0;
  const dels = row?.deletions ?? 0;
  if (status === 'added' || status === 'add') return 'add';
  if (status === 'removed' || status === 'deleted' || status === 'del') return 'del';
  if (status === 'renamed') return 'rename';
  if (adds > 0 && dels === 0) return 'add';
  if (dels > 0 && adds === 0) return 'del';
  return 'mod';
}

/** Shared chrome for inline + sticky file headers (identical markup either way). */
function FileHeaderRow(props: {
  row: any;
  viewedPaths: any;
  onToggleViewed: any;
  onToggleCollapse: any;
  onFileComment: any;
  searchRowClass?: string;
  isSearchMatch?: boolean;
  isActiveHit?: boolean;
  activeHitForMarks?: any;
  occ?: number;
  searchQuery?: string;
  /** When true, omit rowIndex so virtual list hits don't collide; visuals identical. */
  sticky?: boolean;
  /** Active file from tree / prev-next — focus chrome on this header */
  focused?: boolean;
  /** File-level keyboard/pointer selection on this header */
  selected?: boolean;
  style?: React.CSSProperties;
  /** File-level selection composer docked under this header */
  selectionIsland?: React.ReactNode;
  /** Pointer-down on header (not collapse/viewed/comment) → file selection */
  onSelectionStart?: (
    row: any,
    point: { x: number; y: number },
    opts?: { shiftKey?: boolean; preferredSide?: string }
  ) => void;
}) {
  const {
    row,
    viewedPaths,
    onToggleViewed,
    onToggleCollapse,
    onFileComment,
    searchRowClass = '',
    isSearchMatch = false,
    isActiveHit = false,
    activeHitForMarks = null,
    occ = 0,
    searchQuery = '',
    sticky = false,
    focused = false,
    selected = false,
    style,
    selectionIsland = null,
    onSelectionStart,
  } = props;
  const viewed = isPathViewed ? isPathViewed(viewedPaths, row.filePath) : false;
  const collapsed = Boolean(row.collapsed);
  const openable = row.openable !== false;
  const status = String(row.status || 'modified').toLowerCase();
  const adds = row.additions ?? 0;
  const dels = row.deletions ?? 0;
  const headerTone = fileHeaderTone(row);
  const hasIsland = Boolean(selectionIsland);
  const foldKbd =
    typeof navigator !== 'undefined' &&
    /Mac|iPhone|iPad/.test(navigator.platform || '')
      ? FILE_FOLD_SHORTCUT.labelMac
      : FILE_FOLD_SHORTCUT.labelWin;

  const headerEl = (
    <div
      className={`prp-vline prp-vline--header prp-vline--header-${headerTone}${
        !openable ? ' prp-vline--header-binary' : ''
      }${focused ? ' prp-vline--header-focus' : ''}${
        selected ? ' prp-vline--header-selected' : ''
      }${searchRowClass}`}
      style={{ height: ROW_HEIGHT, ...style }}
      data-row-index={sticky ? undefined : row.rowIndex}
      data-file-path={row.filePath || ''}
      data-file-status={status}
      data-openable={openable ? '1' : '0'}
      data-file-kind={row.fileKind || undefined}
      data-sticky={sticky ? '1' : undefined}
      data-file-focus={focused ? '1' : undefined}
      data-file-selected={selected ? '1' : undefined}
      data-search-current={isActiveHit ? '1' : undefined}
      onMouseDown={(e) => {
        if (e.button !== 0 || typeof onSelectionStart !== 'function') return;
        // Leave collapse / viewed / dedicated Comment control alone
        const t = e.target as HTMLElement;
        if (
          t.closest?.(
            '.prp-file-header__collapse, .prp-file-header__viewed, .prp-file-header__comment, input, button.prp-file-header__comment'
          )
        ) {
          return;
        }
        // Path/stats button also toggles collapse on click — still allow select on mousedown
        e.preventDefault();
        onSelectionStart(row, { x: e.clientX, y: e.clientY }, {
          shiftKey: Boolean(e.shiftKey),
          preferredSide: 'RIGHT',
        });
      }}
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
          className={`prp-file-header__collapse${
            focused ? ' prp-opt-hint-host' : ''
          }`}
          title={
            focused
              ? collapsed
                ? `Expand file (${foldKbd})`
                : `Collapse file (${foldKbd})`
              : collapsed
                ? 'Expand file'
                : 'Collapse file'
          }
          aria-label={collapsed ? 'Expand file' : 'Collapse file'}
          aria-expanded={!collapsed}
          onClick={() => onToggleCollapse?.(row.filePath)}
        >
          {focused ? (
            <OptBtnHint label={foldKbd} preferredPlacement="bottom" />
          ) : null}
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
        onClick={(e) => {
          // Selection is on mousedown; chevron handles fold. Path click only
          // focuses/selects — avoid toggling collapse on every select.
          e.preventDefault();
        }}
        disabled={!openable}
        title={
          openable
            ? 'Select file (Comment / Copy code). Use chevron to fold.'
            : 'Binary file — cannot open in diff view'
        }
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
        {!openable ? (
          <span className="prp-file-header__binary-badge">binary</span>
        ) : null}
        <span className="prp-file-header__stats" aria-label={`+${adds} −${dels}`}>
          <span className="prp-stat-add">+{adds}</span>
          <span className="prp-stat-del">−{dels}</span>
        </span>
      </button>
      {typeof onFileComment === 'function' ? (
        <button
          type="button"
          className="prp-file-header__comment"
          title="Comment on entire file"
          onClick={(e) => {
            e.stopPropagation();
            onFileComment(row.filePath, row);
          }}
        >
          Comment
        </button>
      ) : null}
    </div>
  );

  if (!hasIsland) return headerEl;

  return (
    <div
      className="prp-sel-dock-host prp-sel-dock-host--header"
      style={{ height: ROW_HEIGHT }}
      data-row-index={sticky ? undefined : row.rowIndex}
      data-file-path={row.filePath || ''}
    >
      {headerEl}
      {selectionIsland}
    </div>
  );
}

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

type DiffCodeLineProps = {
  row: any;
  searchRowClass: string;
  isSearchMatch: boolean;
  isActiveHit: boolean;
  activeHitForMarks: any;
  occ: number;
  searchQuery: string;
  /**
   * Test/override path only. Live Diff leaves this undefined so each row
   * subscribes to the store — VirtualDiff does not re-render on caret moves.
   */
  selectionOverride?: any;
  selecting: boolean;
  onSelectionStart: any;
  onSelectionExtend: any;
  onExpandGap: any;
  expandBusyKey: any;
  /** false while user is actively scrolling — plain escapeHtml (cheap) */
  useSyntax: boolean;
  /** Bumps when a lazy language grammar loads so memoized rows re-highlight */
  hljsEpoch: number;
  /** Selection action/composer docked under selection end row */
  selectionIsland?: React.ReactNode;
  /** Virtual row height (ROW_HEIGHT or expanded multi-line height). */
  rowHeight?: number;
  lineExpanded?: boolean;
  lineExpandable?: boolean;
  onToggleLineExpand?: () => void;
  onMeasureLineHeight?: (height: number) => void;
};

type DiffCodeLineBodyProps = {
  row: any;
  isCode: boolean;
  isHunk: boolean;
  isSplit: boolean;
  hideHunkText: boolean;
  expandAbove: any;
  expandBelow: any;
  qForRow: string;
  activeHitForMarks: any;
  occ: number;
  useSyntax: boolean;
  onExpandGap: any;
  expandBusyKey: any;
};

/**
 * Syntax / hunk content — intentionally ignores selection flags so key-hold
 * class updates on the shell do not re-highlight every edge row.
 */
const DiffCodeLineBody = memo(function DiffCodeLineBody({
  row,
  isCode,
  isHunk,
  isSplit,
  hideHunkText,
  expandAbove,
  expandBelow,
  qForRow,
  activeHitForMarks,
  occ,
  useSyntax,
  onExpandGap,
  expandBusyKey,
}: DiffCodeLineBodyProps) {
  if (isHunk) {
    return (
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
    );
  }
  if (isSplit && isCode) {
    // Per-side tone: del on left / add on right (paired change rows use both)
    const leftTone =
      row.leftType === 'del' || (row.lineType === 'del' && row.leftCode)
        ? 'del'
        : '';
    const rightTone =
      row.rightType === 'add' || (row.lineType === 'add' && row.rightCode)
        ? 'add'
        : '';
    return (
      <div className="prp-split-cols">
        <div
          className={`prp-split-cols__left${leftTone ? ` prp-split-cols__left--${leftTone}` : ''}`}
          data-side-type={leftTone || undefined}
        >
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
        <div
          className={`prp-split-cols__right${rightTone ? ` prp-split-cols__right--${rightTone}` : ''}`}
          data-side-type={rightTone || undefined}
        >
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
    );
  }
  // Unified: dual line-number gutter (old | new) + code — empty side blank for pure add/del
  if (isCode) {
    const oldLn =
      row.oldLine != null && Number.isFinite(Number(row.oldLine))
        ? String(row.oldLine)
        : '';
    const newLn =
      row.newLine != null && Number.isFinite(Number(row.newLine))
        ? String(row.newLine)
        : '';
    return (
      <>
        <span className="prp-unified-lns" aria-hidden="true">
          <span className="prp-unified-ln prp-unified-ln--old">{oldLn}</span>
          <span className="prp-unified-ln prp-unified-ln--new">{newLn}</span>
        </span>
        <code
          className={useSyntax ? 'hljs prp-code' : 'prp-code'}
          dangerouslySetInnerHTML={{
            __html: renderSearchableHtml(
              row.code ?? row.text,
              row.filePath,
              qForRow,
              row,
              activeHitForMarks,
              occ,
              'code',
              useSyntax
            ),
          }}
        />
      </>
    );
  }
  return (
    <code
      className="prp-code"
      dangerouslySetInnerHTML={{
        __html: renderSearchableHtml(
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
  );
});

/**
 * Shell re-renders on this row's visual key only (store leaf subscription).
 * Body is memoized so selection class toggles never re-run hljs.
 */
const DiffCodeLine = memo(function DiffCodeLine({
  row,
  searchRowClass,
  isSearchMatch,
  isActiveHit,
  activeHitForMarks,
  occ,
  searchQuery,
  selectionOverride,
  selecting: _selecting,
  onSelectionStart,
  onSelectionExtend,
  onExpandGap,
  expandBusyKey,
  useSyntax,
  hljsEpoch: _hljsEpoch,
  selectionIsland = null,
  rowHeight = ROW_HEIGHT,
  lineExpanded = false,
  lineExpandable = false,
  onToggleLineExpand,
  onMeasureLineHeight,
}: DiffCodeLineProps) {
  const isCode =
    row.kind === 'diff-line' &&
    (row.lineType === 'add' ||
      row.lineType === 'del' ||
      row.lineType === 'change' ||
      row.lineType === 'context');
  const isHunk = row.kind === 'diff-line' && row.lineType === 'hunk';
  const expandAbove = isHunk ? row.expandAbove : null;
  const expandBelow = isHunk ? row.expandBelow : null;
  const hasHunkExpand = Boolean(expandAbove || expandBelow);
  if (isHunk && row.hidden && !hasHunkExpand) {
    return null;
  }
  const selectable =
    typeof isSelectableDiffRow === 'function' ? isSelectableDiffRow(row) : false;
  const isSplit = Boolean(row.split);
  const hideHunkText = Boolean(isHunk && row.hidden);
  const qForRow = isSearchMatch ? searchQuery : '';

  // Leaf store subscription: only this row re-renders when its key changes.
  // Middles stay "middle" under multi extend → no re-render. Override for tests.
  // Pack visual role + dock side into one primitive so Object.is stays stable.
  const storeLeafPacked = useModalStore((s) => {
    if (selectionOverride !== undefined) return '\x1eRIGHT';
    const visualKey =
      typeof rowSelectionVisualKey === 'function'
        ? rowSelectionVisualKey(s.lineSelection, row)
        : '';
    const side =
      typeof selectionActiveSide === 'function'
        ? selectionActiveSide(s.lineSelection)
        : String(
            s.lineSelection?.headSide ||
              s.lineSelection?.anchorSide ||
              'RIGHT'
          ).toUpperCase() === 'LEFT'
          ? 'LEFT'
          : 'RIGHT';
    return `${visualKey}\x1e${side}`;
  });
  const storeSep = storeLeafPacked.lastIndexOf('\x1e');
  const storeVisualKey =
    storeSep >= 0 ? storeLeafPacked.slice(0, storeSep) : storeLeafPacked;
  const storeDockSide: 'LEFT' | 'RIGHT' =
    storeSep >= 0 && storeLeafPacked.slice(storeSep + 1) === 'LEFT'
      ? 'LEFT'
      : 'RIGHT';
  const visualKey =
    selectionOverride !== undefined
      ? typeof rowSelectionVisualKey === 'function'
        ? rowSelectionVisualKey(selectionOverride, row)
        : ''
      : storeVisualKey;
  const selected = visualKey !== '';
  const selRole = visualKey || null;
  // Single-line selection is role "only"; multi ends with "end"
  const dockHere = Boolean(
    selectionIsland && (selRole === 'end' || selRole === 'only')
  );
  const dockSide: 'LEFT' | 'RIGHT' =
    selectionOverride !== undefined
      ? typeof selectionActiveSide === 'function'
        ? selectionActiveSide(selectionOverride)
        : String(
            (selectionOverride as any)?.headSide ||
              (selectionOverride as any)?.anchorSide ||
              'RIGHT'
          ).toUpperCase() === 'LEFT'
          ? 'LEFT'
          : 'RIGHT'
      : storeDockSide;
  // Split: paint selection mark only on the active pane (LEFT|RIGHT)
  const selSideClass =
    selected && isSplit
      ? dockSide === 'LEFT'
        ? ' prp-vline--sel-side-left'
        : ' prp-vline--sel-side-right'
      : '';

  const h = Math.max(ROW_HEIGHT, Number(rowHeight) || ROW_HEIGHT);
  const lineRef = useRef<HTMLDivElement | null>(null);

  // After expand, measure content and feed virtualizer offsets.
  useLayoutEffect(() => {
    if (!lineExpanded || typeof onMeasureLineHeight !== 'function') return;
    const el = lineRef.current;
    if (!el) return;
    const measure = () => {
      // Prefer content box (code) so padding is included via offsetHeight of row
      const next = Math.ceil(el.scrollHeight || el.offsetHeight || h);
      if (next > 0) onMeasureLineHeight(next);
    };
    measure();
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => measure());
      ro.observe(el);
    }
    return () => {
      ro?.disconnect();
    };
  }, [lineExpanded, onMeasureLineHeight, row.text, row.code, h]);

  // Line chrome only — dock mounts on a host *outside* .prp-vline because
  // .prp-vline uses contain:paint which clips absolute children to ROW_HEIGHT.
  const lineEl = (
    <div
      ref={lineRef}
      className={`prp-vline prp-vline--${row.lineType || row.kind}${
        isSplit ? ' prp-vline--split' : ''
      }${isHunk ? ' prp-vline--hunk' : ''}${
        hasHunkExpand ? ' prp-vline--hunk-expandable' : ''
      }${hideHunkText ? ' prp-vline--hunk-hidden-text' : ''}${searchRowClass}${
        selected ? ' prp-vline--selected' : ''
      }${selRole ? ` prp-vline--sel-${selRole}` : ''}${selSideClass}${
        selectable ? ' prp-vline--selectable' : ''
      }${lineExpanded ? ' prp-vline--line-expanded' : ''}${
        lineExpandable ? ' prp-vline--line-expandable' : ''
      }`}
      style={{ height: h, minHeight: h }}
      data-row-index={row.rowIndex}
      data-file-path={row.filePath || ''}
      data-old-line={row.oldLine ?? ''}
      data-new-line={row.newLine ?? ''}
      data-sel-role={selRole || undefined}
      data-sel-side={selected && isSplit ? dockSide : undefined}
      data-split={isSplit ? '1' : '0'}
      data-search-match={isSearchMatch ? '1' : undefined}
      data-search-current={isActiveHit ? '1' : undefined}
      data-hunk-hidden={hideHunkText ? '1' : undefined}
      data-line-expanded={lineExpanded ? '1' : undefined}
      title={
        selectable
          ? 'Click = single line · Shift+click or drag = multi-line comment'
          : undefined
      }
      onMouseDown={(e) => {
        if (e.button !== 0 || !selectable) return;
        // Don't start line selection when clicking the expand control
        if ((e.target as HTMLElement)?.closest?.('.prp-line-expand-btn')) {
          return;
        }
        e.preventDefault();
        // Split: pick LEFT/RIGHT from click X so comments land on that pane
        let preferredSide: 'LEFT' | 'RIGHT' = 'RIGHT';
        if (isSplit) {
          const cols = (e.currentTarget as HTMLElement).querySelector(
            '.prp-split-cols'
          );
          if (cols) {
            const rect = cols.getBoundingClientRect();
            const mid = rect.left + rect.width / 2;
            preferredSide = e.clientX < mid ? 'LEFT' : 'RIGHT';
          } else if (row.oldLine != null && row.newLine == null) {
            preferredSide = 'LEFT';
          }
        } else if (row.oldLine != null && row.newLine == null) {
          preferredSide = 'LEFT';
        }
        onSelectionStart?.(row, { x: e.clientX, y: e.clientY }, {
          shiftKey: Boolean(e.shiftKey),
          preferredSide,
        });
      }}
      // Extend multi-line while primary button is held. Do not gate on the
      // `selecting` React prop — it is false until the next render after
      // mousedown; parent onSelectionExtend already no-ops via selectingRef.
      // Prefer mousemove (bubbles) over mouseenter: React maps enter via
      // mouseover, so synthetic mouseenter from e2e never extends.
      onMouseMove={(e) => {
        if (e.buttons !== 1) return;
        onSelectionExtend?.(row);
      }}
      onMouseEnter={() => {
        onSelectionExtend?.(row);
      }}
      onDoubleClick={(e) => {
        if (!lineExpandable || !onToggleLineExpand) return;
        if ((e.target as HTMLElement)?.closest?.('button,a,input,textarea')) {
          return;
        }
        e.preventDefault();
        onToggleLineExpand();
      }}
    >
      <span className="prp-line-gutter">
        {lineExpandable && typeof onToggleLineExpand === 'function' ? (
          <button
            type="button"
            className="prp-line-expand-btn"
            aria-expanded={lineExpanded}
            aria-label={lineExpanded ? 'Collapse long line' : 'Expand long line'}
            title={
              lineExpanded
                ? 'Collapse line'
                : 'Expand long line (or double-click)'
            }
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggleLineExpand();
            }}
            onMouseDown={(e) => {
              // Prevent selection drag start
              e.stopPropagation();
            }}
          >
            <IconDisclosure open={lineExpanded} size={12} />
          </button>
        ) : null}
      </span>
      <DiffCodeLineBody
        row={row}
        isCode={isCode}
        isHunk={isHunk}
        isSplit={isSplit}
        hideHunkText={hideHunkText}
        expandAbove={expandAbove}
        expandBelow={expandBelow}
        qForRow={qForRow}
        activeHitForMarks={activeHitForMarks}
        occ={occ}
        useSyntax={useSyntax}
        onExpandGap={onExpandGap}
        expandBusyKey={expandBusyKey}
      />
    </div>
  );

  if (!dockHere) return lineEl;

  // Split selection dock: pin under the LEFT or RIGHT pane of the code row
  const splitDockClass =
    isSplit && dockSide === 'LEFT'
      ? ' prp-sel-dock-host--split-left'
      : isSplit
        ? ' prp-sel-dock-host--split-right'
        : '';

  return (
    <div
      className={`prp-sel-dock-host${splitDockClass}`}
      style={{ minHeight: h }}
      data-row-index={row.rowIndex}
      data-dock-side={isSplit ? dockSide : undefined}
    >
      {lineEl}
      {selectionIsland}
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
    mentionCandidates = [],
    /** (row|commentId, resolved?) => boolean — resolved defaults collapsed */
    isThreadCollapsed = null,
    onToggleThreadCollapse,
    /** Passed to rowOffsets / averageRowHeight for collapse-aware virtual heights */
    commentHeightOpts = null,
    /**
     * Live variable-height metrics for App nav (⌥J/K, selection reveal).
     * Called when offsets / avgH change after measure or expand.
     */
    onVirtualMetricsChange = null,
    pendingCount = 0,
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
    /** Path of the active file (tree / prev-next) — focus ring on its header */
    activeFilePath = null,
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
  const storeThreadSelectionId = useModalStore((s) => {
    const sel = s.lineSelection;
    if (
      sel &&
      (sel.kind === 'thread' ||
        sel.subjectType === 'thread' ||
        sel.kind === 'inline-comment')
    ) {
      return sel.commentId != null ? String(sel.commentId) : '';
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
  const threadSelectionId =
    selectionOverride !== undefined
      ? selectionOverride &&
        (selectionOverride.kind === 'thread' ||
          selectionOverride.subjectType === 'thread' ||
          selectionOverride.kind === 'inline-comment') &&
        selectionOverride.commentId != null
        ? String(selectionOverride.commentId)
        : ''
      : storeThreadSelectionId;

  const activePathNorm = String(activeFilePath || '').trim();

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
      const h = Math.ceil(Number(height) || 0);
      if (h < ROW_HEIGHT) return;
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
  const [imageViewer, setImageViewer] = useState<{
    src: string;
    alt: string;
  } | null>(null);
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
    if (propChanged && propTop != null) {
      programmaticTopRef.current = propTop;
      if (el) el.scrollTop = propTop;
      pendingScrollRef.current = propTop;
      prevOffsetsRef.current = offsets;
      applyScrollTop(propTop);
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
      applyScrollTop(held);
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
    applyScrollTop(top);
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
            onSelectionStart={stableSelectionStart}
            sticky
            focused={
              Boolean(activePathNorm) &&
              String(stickyMeta.row?.filePath || '') === activePathNorm
            }
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
              const commentSide =
                String(row.side || thread?.root?.side || 'RIGHT').toUpperCase() ===
                'LEFT'
                  ? 'LEFT'
                  : 'RIGHT';
              // Split line threads dock under the matching pane; file-level stays full width
              const isSplitComment = Boolean(row.split);
              const threadSelected =
                Boolean(threadSelectionId) &&
                String(row.commentId) === threadSelectionId;
              const threadEl = (
                <InlineThread
                  row={row}
                  thread={thread}
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
                  mentionCandidates={mentionCandidates}
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
              );
              const commentInner = (
                <div
                  className={`prp-vline prp-vline--comment${
                    isSplitComment ? ' prp-vline--comment-split' : ''
                  }${collapsed ? ' prp-vline--comment-collapsed' : ''}${
                    pending ? ' prp-vline--comment-pending' : ''
                  }${threadSelected ? ' prp-vline--comment-selected' : ''}${searchRowClass}`}
                  style={minH != null ? { minHeight: minH } : undefined}
                  data-row-index={row.rowIndex}
                  data-collapsed={collapsed ? '1' : '0'}
                  data-pending={pending ? '1' : undefined}
                  data-side={commentSide}
                  data-split={isSplitComment ? '1' : '0'}
                  data-thread-selected={threadSelected ? '1' : undefined}
                  data-search-current={isActiveHit ? '1' : undefined}
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
                </div>
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
                  onSelectionStart={stableSelectionStart}
                  searchRowClass={searchRowClass}
                  isSearchMatch={Boolean(isSearchMatch)}
                  isActiveHit={Boolean(isActiveHit)}
                  activeHitForMarks={activeHitForMarks}
                  occ={occ}
                  searchQuery={qActive ? searchQuery : ''}
                  focused={
                    Boolean(activePathNorm) &&
                    String(row.filePath || '') === activePathNorm
                  }
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
    </div>
  );
}

/**
 * Measure host for variable-height Diff rows (threads, images, expanded lines).
 * Feeds measuredHeights → rowOffsets so spacer/totalHeight matches real DOM.
 */
function DiffVirtualRowShell({
  measureKey,
  estimatedHeight,
  onHeight,
  children,
}: {
  measureKey: string | null;
  estimatedHeight: number;
  onHeight: (key: string, h: number) => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (!measureKey) return undefined;
    const el = ref.current;
    if (!el) return undefined;
    const publish = () => {
      const h = Math.ceil(el.getBoundingClientRect().height || el.offsetHeight || 0);
      if (h > 0) onHeight(measureKey, h);
    };
    publish();
    if (typeof ResizeObserver !== 'function') return undefined;
    const ro = new ResizeObserver(() => publish());
    ro.observe(el);
    return () => ro.disconnect();
  }, [measureKey, onHeight, children]);

  return (
    <div
      ref={ref}
      className="prp-vlist__row-shell"
      data-measure-key={measureKey || undefined}
      data-est-h={estimatedHeight}
    >
      {children}
    </div>
  );
}

export const VirtualDiff = memo(VirtualDiffImpl);
export default VirtualDiff;
