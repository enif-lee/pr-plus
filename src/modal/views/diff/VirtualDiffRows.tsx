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
import {
  FILE_FOLD_SHORTCUT,
  TOGGLE_VIEWED_SHORTCUT,
} from '@lib/shortcut-policy';
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

/** Extracted VirtualDiff row/line primitives */
export function fileHeaderTone(row: any) {
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

/**
 * OptBtnHint label for the file-header viewed/read checkbox.
 * Only when the file header is focused (same gate as fold chevron).
 * Labels from TOGGLE_VIEWED_SHORTCUT (⌥⇧R / Alt+Shift+R).
 */
export function fileHeaderViewedOptHintLabel(
  focused: boolean,
  isMac: boolean = true
): string | null {
  if (!focused) return null;
  return isMac
    ? TOGGLE_VIEWED_SHORTCUT.labelMac
    : TOGGLE_VIEWED_SHORTCUT.labelWin;
}

/** Shared chrome for inline + sticky file headers (identical markup either way). */
export function FileHeaderRow(props: {
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
  const isMac =
    typeof navigator !== 'undefined' &&
    /Mac|iPhone|iPad/.test(navigator.platform || '');
  const foldKbd = isMac
    ? FILE_FOLD_SHORTCUT.labelMac
    : FILE_FOLD_SHORTCUT.labelWin;
  const viewedKbd = fileHeaderViewedOptHintLabel(focused, isMac);

  const headerEl = (
    <div
      className={`prp-vline prp-vline--header prp-vline--header-${headerTone}${
        !openable ? ' prp-vline--header-binary' : ''
      }${focused ? ' prp-vline--header-focus' : ''}${
        selected
          ? ' prp-vline--header-selected prp-vline--selected prp-vline--sel-only'
          : ''
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
      <label
        className={`prp-file-header__viewed${
          viewedKbd ? ' prp-opt-hint-host' : ''
        }`}
        title={
          viewedKbd
            ? viewed
              ? `Mark as unread (${viewedKbd})`
              : `Mark as viewed (${viewedKbd})`
            : 'Mark as viewed'
        }
        data-prp-file-viewed-hint={viewedKbd ? '1' : undefined}
      >
        {viewedKbd ? (
          <OptBtnHint label={viewedKbd} preferredPlacement="bottom" />
        ) : null}
        <input
          type="checkbox"
          checked={viewed}
          onChange={() => onToggleViewed?.(row.filePath)}
          onClick={(e) => e.stopPropagation()}
          aria-label={viewed ? 'Mark as unread' : 'Mark as viewed'}
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
export function renderSearchableHtml(
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
export const DiffCodeLineBody = memo(function DiffCodeLineBody({
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
export const DiffCodeLine = memo(function DiffCodeLine({
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

export function DiffVirtualRowShell({
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
      // Prefer content size (scrollHeight) over clipped client box — overflow:hidden
      // ancestors can make getBoundingClientRect under-report after body hydrate.
      const rect = el.getBoundingClientRect().height || 0;
      const scroll = el.scrollHeight || 0;
      const offset = el.offsetHeight || 0;
      const h = Math.ceil(Math.max(rect, scroll, offset));
      if (h > 0) onHeight(measureKey, h);
    };
    publish();
    // Second tick after markdown/layout (images, fonts) settles
    const t = window.setTimeout(publish, 48);
    if (typeof ResizeObserver !== 'function') {
      return () => clearTimeout(t);
    }
    const ro = new ResizeObserver(() => publish());
    ro.observe(el);
    return () => {
      clearTimeout(t);
      ro.disconnect();
    };
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

