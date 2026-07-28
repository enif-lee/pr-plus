/**
 * SOURCE OF TRUTH — PR modal composition root.
 * Complete TypeScript module (no mid-IIFE parts assembly).
 * Domain tsc typechecks this file. Size exception: undivided React root.
 */
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  memo,
  startTransition,
} from 'react';
import { createRoot } from 'react-dom/client';
import { Button } from '@common/Button';
import { ActionToast } from '@common/ActionToast';
import { ShortcutMonitor } from '@common/ShortcutMonitor';
import { SearchableSelect } from '@common/SearchableSelect';
import { Header } from '../views/chrome/Header';
import { StackStrip } from '../views/chrome/StackStrip';
import { SearchBar } from '../views/chrome/SearchBar';
import { CommandPalette } from '../views/chrome/CommandPalette';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { LoadingSkeleton } from '../views/chrome/LoadingSkeleton';
import {
  buildMergeConfirmRequest,
  confirmGateProceed,
} from '../lib/confirm-gate';
import { ConversationView } from '../views/conversation/ConversationView';
import { DiffWorkspace } from '../views/pr-modal/DiffWorkspace';
import { ShellResizers } from '../views/pr-modal/ShellResizers';
import { LAYOUT_CENTERED, LAYOUT_DIFF, layoutClassName } from '../lib/layout-mode';
import {
  compareCacheKey,
  isAllCommitsFilter,
  normalizeDiffCommitFilter,
  resolveCompareRange,
  type DiffCommitFilter as DiffCommitFilterState,
} from '../lib/diff-commit-filter';
import {
  SHELL_MODAL,
  SHELL_SHEET,
  loadShellPref,
  saveShellPref,
  resolveShellStorage,
  toggleShell,
  shellClassName,
  normalizeShell,
  type ShellMode,
} from '../lib/shell-preference';
import {
  isEmbedPresentation,
  presentationClassName,
  shouldShowEmbedChrome,
  resolveEmbedShortcutAction,
} from '../lib/page-embed';
import {
  SHEET_DEFAULT_WIDTH,
  MODAL_DEFAULT_WIDTH,
  MODAL_DEFAULT_HEIGHT,
  SHEET_MIN_WIDTH,
  SHELL_FULLSCREEN_EDGE_PX,
  sheetWidthHitsFullscreen,
  modalSizeHitsFullscreen,
  MODAL_MIN_WIDTH,
  MODAL_MAX_WIDTH,
  MODAL_MIN_HEIGHT,
  MODAL_MAX_HEIGHT,
  clampSheetWidth,
  clampModalSize,
  nextSheetWidthFromDrag,
  nextModalSizeFromDrag,
  loadSheetWidth,
  saveSheetWidth,
  loadModalSize,
  saveModalSize,
  resolveShellSizeStorage,
  toggleShellFullscreen,
  shellFullscreenClassName,
  type ModalShellSize,
} from '../lib/shell-size';
import {
  applyScrollLock,
  measureScrollbarWidth,
  restoreScrollLock,
  type ScrollLockSnapshot,
} from '../lib/scroll-lock';
import {
  FILE_NAV_DEFAULT_WIDTH,
  clampFileNavWidth,
  toggleFileNavCollapsed,
  nextFileNavWidthFromDrag,
  fileNavGridTemplate,
  loadFileNavPref,
  saveFileNavPref,
  resolveFileNavStorage,
  type FileNavPref,
} from '../lib/file-nav-layout';
import {
  annotateFilesForCollapse,
  materializeCollapsedPaths,
  expandPathInCollapsedSet,
  isPathCollapsed,
} from '../lib/collapse';
import {
  filterFilesByQuery,
  countReviewThreadsByPath,
  countUnresolvedReviewThreadsByPath,
  countPendingReviewThreads,
  countPendingReviewThreadsByPath,
  countReviewThreadTotals,
  groupReviewThreads,
  toggleViewedPath,
  isPathViewed,
  resolveRootReviewCommentId,
  normalizeReviewCommentId,
} from '../lib/review-threads';
import {
  flattenFilesToVirtualRows,
  fileStartIndexMap,
  mergeLineRanges,
  resolveExpandRange,
  makeExpandBusyKey,
} from '../lib/diff-rows';
import {
  buildNestedFileTree,
  filesInTreeOrder,
  flattenVisibleTree,
  collectDirPaths,
  filterFilesByReviewMode,
  filterFilesByExtensions,
  filterFilesUnreadOnly,
  hasAnyReviewThreads,
  type DiffReviewFilterMode,
} from '../lib/file-tree';
import {
  sortThreadRootComments,
  mapCommentsToRowIndices,
  resolveCommentNav,
  filterReviewCommentsForNav,
  filterReviewRootsForNav,
  buildPathOrderMap,
} from '../lib/comment-nav';
import {
  buildSearchIndex,
  resolveQuerySearchState,
  resolveQuerySearchStateAsync,
  resolveNavSearchState,
  resolveNavSearchStateForLayout,
  searchHitRowIndexSet,
  occurrenceIndexAmongRowHits,
  isNavigableSearchHit,
  isSearchHitVisibleInLayout,
  searchHitHasRowIndex,
} from '../lib/search-index';
import {
  calculateVisibleRange,
  scrollTopForIndex,
  scrollTopToRevealIndex,
} from '../lib/virtual-range';
import {
  beginLineSelection,
  extendLineSelection,
  applySelectionPointerDown,
  normalizeSelection,
  selectionToCommentPayload,
  finalizeSelection,
  selectionGestureMode,
  isRowInSelection,
  isSelectableDiffRow,
  selectionBlockRole,
  extractSelectedCodeText,
  githubBlobLinePermalink,
  parseGotoQuery,
  selectionFromGoto,
  moveLineSelection,
  firstSelectableRowInFile,
  lastSelectableRowInFile,
  isSelectionAtFileEdge,
  SELECTION_ACTIONS_REVEAL_MS,
  resolvePendingGotoSelection,
  resolveGotoPathAmongFiles,
} from '../lib/line-selection';
import { copyTextToClipboard } from '../lib/copy-to-clipboard';
import {
  discardPendingReview,
} from '../lib/pending-review';
import {
  parseSuggestionFences, applySuggestionToFileContent, mapLeaveReviewAction,
  isViewerPrAuthor, canSubmitReviewVerdict, isReviewVerdictKind,
  buildRerequestReviewerLogins, mapRestReviewComment, mapRestIssueComment, appendOptimisticReviewComment,
} from '../lib/pr-edit-api';
import {
  buildPaletteCommands,
  filterPaletteCommands,
  resolveAdjacentPrNumber,
  stackDigitSlotNumber,
  resolvePrModalOptAction,
} from '../lib/command-palette';
import {
  buildShortcutMonitorFire,
  buildShortcutMonitorFireFromParts,
  SHORTCUT_MONITOR_DISMISS_MS,
} from '../lib/shortcut-monitor';
import { publishShortcutMonitorFire } from '../lib/shortcut-monitor-bus';
import {
  resolveModalShortcutAction,
  pickConversationCommentFocusTarget,
  stepConversationCommentFocus,
  activeFileNavIndex,
  resolveAdjacentFileNav,
  isGithubCommandPaletteOpen,
  touchGithubCommandPaletteOpen,
  shouldIgnoreModalEscapeForGithubPalette,
  findGithubCommandPaletteDialog,
  nextScrollTopByPage,
  DIFF_OPT_ARROW_SHORTCUT,
  optArrowScrollDeltaPx,
  applyScrollerDelta,
  toggleReviewFilter,
  shortcutKeyFromEvent,
  normalizeShortcutKey,
} from '../lib/shortcut-policy';
import {
  focusContextThreadReplyAfterPaint,
  isContextThreadReplyFocused,
} from '../lib/context-thread-dom';
import { resolveDiffDisplayFiles } from '../lib/single-file-mode';
import {
  buildConversationTimeline,
  partitionTimelineWithThreadGap,
} from '../lib/conversation-timeline';
import { resolveGithubTheme } from '../lib/theme';
import { buildStackStrip, buildStackPathModel } from '../lib/ui-polish';
import {
  mergeCommentsById,
  advanceCommentsMeta,
  sinceCursorFromMeta,
  DEFAULT_COMMENT_PAGE_SIZE,
} from '../lib/comments-page';
import {
  filterSelectOptions,
  buildPeopleOptions,
  buildLabelOptions,
  buildMilestoneOptions,
  buildBranchOptions,
  buildUnifiedReviewerRows,
  isBotAccount,
} from '../lib/searchable-select';
import { loadSessionView, saveSessionView } from '../lib/session-view';
import {
  mergeDetailPreserveOptimistic,
  stripPendingReviewFromDetail,
  removeReviewCommentFromDetail,
  removeIssueCommentFromDetail,
  buildAssetRepoPath,
} from '../lib/composer-attach';
import {
  normalizePage,
  buildPositionFromComment,
  findCommentIndexByPosition,
  replaceLocationRoute,
  clearLocationRoute,
} from '../lib/uri-route';
import {
  replaceGithubPrLocation,
  githubCommitsFromFilter,
  githubSelectionFields,
  commitFilterFromGithubRoute,
  findFilePathByDiffKey,
  githubDiffFileKey,
} from '../lib/github-pr-route';
import { useModalStore } from '../store/modal-store';
import { OptHintsOverlayClass } from '../components/common/ConversationKbFocus';
import {
  ROW_HEIGHT,
  COMMENT_ROW_HEIGHT,
  averageRowHeight,
  rowHeightFor,
  rowOffsets,
} from '@common/utils';

export function PrModalApp({
  open,
  loading,
  loadStage = null,
  /** Independent side panels still loading without settled cache */
  sidePending = null,
  onLoadMoreReviewThreads = null,
  error,
  detail: detailProp,
  openPulls,
  onClose,
  onRefresh,
  onPatchDetail = null,
  onOpenStackPr,
  onFetchCompareFiles = null,
  onFetchAllPrCommits = null,
  onFetchAllPrFiles = null,
  initialRoute = null,
  onRouteChange = null,
  prefs = null,
  /** 'modal' overlay (default) | 'embed' in-page under GitHub header */
  presentation = 'modal',
  shellChrome = null,
  /** Embed: tear down replace mode and show original GH PR UI */
  onRestoreNative = null,
}: any) {
  const reverseComments = prefs?.reverseComments !== false;
  /** Diff hunk list shows only the active file; file tree still lists all. */
  const singleFileMode = prefs?.singleFileMode === true;
  const isEmbed = isEmbedPresentation(presentation);
  const embedChrome = shellChrome && typeof shellChrome === 'object' ? shellChrome : null;
  const showCloseChrome =
    !isEmbed &&
    (embedChrome?.showClose !== false) &&
    typeof onClose === 'function' &&
    shouldShowEmbedChrome(presentation, 'close');
  const showShellToggleChrome =
    !isEmbed && shouldShowEmbedChrome(presentation, 'shellToggle');
  const showFullscreenChrome =
    !isEmbed && shouldShowEmbedChrome(presentation, 'fullscreen');
  const showRestoreNativeChrome =
    isEmbed &&
    shouldShowEmbedChrome(presentation, 'restoreNative') &&
    typeof onRestoreNative === 'function';
  const [localDetail, setLocalDetail] = useState(detailProp);
  /**
   * After discard/submit, host refresh can race and re-merge stale pending rows
   * (mergeDetailPreserveOptimistic keeps local pending while prev still holds
   * viewerPendingReview). While this ref is set, always strip pending from the
   * merged snapshot. Clear the flag only once the host also has no PENDING.
   */
  const forceDropPendingRef = useRef(false);
  // Merge host detail onto optimistic local state so reply/comment flash-revert is avoided
  useEffect(() => {
    if (!detailProp) return;
    setLocalDetail((prev) => {
      let merged =
        typeof mergeDetailPreserveOptimistic === 'function'
          ? mergeDetailPreserveOptimistic(prev, detailProp)
          : detailProp;
      const hostHasPending =
        Boolean(detailProp.viewerPendingReview?.id) ||
        (Array.isArray(detailProp.reviewComments) &&
          detailProp.reviewComments.some((c: any) => c?.pending));
      if (forceDropPendingRef.current) {
        // Always strip — do not wait for host to clear first. Waiting left the
        // toolbar stuck on "N pending" after Discard when the host snapshot was
        // empty but local raceKeep still held viewerPendingReview + rows.
        merged =
          typeof stripPendingReviewFromDetail === 'function'
            ? stripPendingReviewFromDetail(merged)
            : {
                ...merged,
                viewerPendingReview: null,
                reviewComments: (merged.reviewComments || []).filter(
                  (c: any) => c && !c.pending
                ),
              };
        if (!hostHasPending) {
          forceDropPendingRef.current = false;
        }
      }
      return merged;
    });
  }, [detailProp]);
  // Prefer optimistic local copy for all rendering / virtual rows / threads
  const detail = localDetail || detailProp;
  const detailRef = useRef(detail);
  detailRef.current = detail;

  /** Diff files scoped to a commit or commit range (null = full PR files). */
  const [diffCommitFilter, setDiffCommitFilter] = useState<DiffCommitFilterState>({
    mode: 'all',
  });
  const [diffFilesOverride, setDiffFilesOverride] = useState<any[] | null>(null);
  const [diffCommitLoading, setDiffCommitLoading] = useState(false);
  const [diffCommitError, setDiffCommitError] = useState<string | null>(null);
  const [diffCommitLabel, setDiffCommitLabel] = useState<string | null>(null);
  const compareFilesCacheRef = useRef(new Map<string, any[]>());
  const compareFetchGenRef = useRef(0);

  // Reset commit filter when switching PRs
  const prIdentity = detail
    ? `${detail.owner}/${detail.repo}#${detail.number}`
    : '';
  const [stackPathSelections, setStackPathSelections] = useState<Record<string, number>>(
    {}
  );
  /**
   * Opt-hold badges live in the store (OptBtnHint leaf-subscribes).
   * Refs track physical hold/suppress without re-rendering App/Conversation.
   */
  const optHeldRef = useRef(false);
  const optHintsSuppressedRef = useRef(false);
  /** In-app confirm dialog (replaces window.confirm). */
  const [confirmState, setConfirmState] = useState<null | {
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    tone?: 'danger' | 'warn' | 'default';
    resolve: (ok: boolean) => void;
  }>(null);

  const requestConfirm = useCallback(
    (opts: {
      title: string;
      message: string;
      confirmLabel?: string;
      cancelLabel?: string;
      tone?: 'danger' | 'warn' | 'default';
    }) =>
      new Promise<boolean>((resolve) => {
        setConfirmState({
          title: opts.title,
          message: opts.message,
          confirmLabel: opts.confirmLabel || 'Confirm',
          cancelLabel: opts.cancelLabel || 'Cancel',
          tone: opts.tone || 'default',
          resolve,
        });
      }),
    []
  );

  const closeConfirm = useCallback((ok: boolean) => {
    setConfirmState((prev) => {
      if (prev?.resolve) prev.resolve(ok);
      return null;
    });
  }, []);
  const commentPrefetchGenRef = useRef(0);
  /** Dedup GH commit-filter restore from inbound /changes/{sha}|{a}..{b}. */
  const ghCommitRouteAppliedRef = useRef<string | null>(null);
  /** Dedup GH #diff- selection restore / clear. */
  const ghSelectionAppliedRef = useRef<string | null>(null);

  useEffect(() => {
    setDiffCommitFilter({ mode: 'all' });
    setDiffFilesOverride(null);
    setDiffCommitError(null);
    setDiffCommitLabel(null);
    setDiffCommitLoading(false);
    compareFilesCacheRef.current = new Map();
    compareFetchGenRef.current += 1;
    setStackPathSelections({});
    commentPrefetchGenRef.current += 1;
    setDiffThreadCollapse(new Map());
    setDiffReviewFilter(null);
    setFileExtFilter(new Set());
    setFileUnreadOnly(false);
    // Zustand selection survives remount — clear so we never write another PR's #diff-
    // Use getState() so this effect can run before setLineSelection is declared below
    // (avoids TDZ: Cannot access 'setLineSelection' before initialization).
    useModalStore.getState().setLineSelection(null);
    ghSelectionAppliedRef.current = null;
    ghCommitRouteAppliedRef.current = null;
  }, [prIdentity]);

  // Lazy-load remaining comment / review-comment pages (offset) then since-refresh.
  useEffect(() => {
    if (!open || !detail?.owner || !detail?.repo || !detail?.number) return undefined;
    const api = globalThis.PRTreeFetch;
    if (!api?.fetchPrCommentsPage) return undefined;
    const gen = ++commentPrefetchGenRef.current;
    let cancelled = false;

    async function loadKind(kind: 'issue' | 'review') {
      const metaKey = kind === 'issue' ? 'commentsMeta' : 'reviewCommentsMeta';
      const listKey = kind === 'issue' ? 'comments' : 'reviewComments';
      let guard = 0;
      while (!cancelled && gen === commentPrefetchGenRef.current && guard < 40) {
        guard += 1;
        const snap = localDetail || detailProp;
        if (!snap) break;
        const meta = snap[metaKey] || {};
        if (!meta.hasMore || !meta.nextPage) break;
        try {
          const page = await api.fetchPrCommentsPage(snap.owner, snap.repo, snap.number, {
            kind,
            page: meta.nextPage,
            perPage: meta.perPage || DEFAULT_COMMENT_PAGE_SIZE,
            // Continue newest→older walks (issue from-end / review desc)
            order: meta.order || undefined,
            preferNewest: false,
          });
          if (cancelled || gen !== commentPrefetchGenRef.current) return;
          setLocalDetail((prev) => {
            if (!prev || Number(prev.number) !== Number(snap.number)) return prev;
            const tomb =
              listKey === 'reviewComments'
                ? prev._deletedReviewCommentIds
                : prev._deletedIssueCommentIds;
            const merged = mergeCommentsById(
              prev[listKey] || [],
              page?.items || [],
              tomb
            );
            return {
              ...prev,
              [listKey]: merged,
              [metaKey]: advanceCommentsMeta(prev[metaKey], page?.meta, merged.length),
            };
          });
          if (!page?.meta?.hasMore) break;
        } catch {
          break;
        }
      }
    }

    // Defer so conversation paints first page immediately
    const t = window.setTimeout(() => {
      void (async () => {
        await loadKind('issue');
        await loadKind('review');
        // Incremental since-pass: pick up comments created after first page window
        if (cancelled || gen !== commentPrefetchGenRef.current) return;
        const snap = localDetail || detailProp;
        if (!snap || !api.fetchPrCommentsPage) return;
        for (const kind of ['issue', 'review'] as const) {
          const metaKey = kind === 'issue' ? 'commentsMeta' : 'reviewCommentsMeta';
          const listKey = kind === 'issue' ? 'comments' : 'reviewComments';
          const since = sinceCursorFromMeta(snap[metaKey]);
          if (!since) continue;
          try {
            const page = await api.fetchPrCommentsPage(snap.owner, snap.repo, snap.number, {
              kind,
              page: 1,
              perPage: DEFAULT_COMMENT_PAGE_SIZE,
              since,
            });
            if (cancelled || gen !== commentPrefetchGenRef.current) return;
            if (!page?.items?.length) continue;
            setLocalDetail((prev) => {
              if (!prev || Number(prev.number) !== Number(snap.number)) return prev;
              const tomb =
                listKey === 'reviewComments'
                  ? prev._deletedReviewCommentIds
                  : prev._deletedIssueCommentIds;
              const merged = mergeCommentsById(
                prev[listKey] || [],
                page.items,
                tomb
              );
              return {
                ...prev,
                [listKey]: merged,
                [metaKey]: {
                  ...(prev[metaKey] || {}),
                  newestCreatedAt:
                    page.meta?.newestCreatedAt || prev[metaKey]?.newestCreatedAt,
                  maxId: page.meta?.maxId ?? prev[metaKey]?.maxId,
                  loadedCount: merged.length,
                },
              };
            });
          } catch {
            /* ignore incremental errors */
          }
        }
      })();
    }, 400);

    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- prefetch keyed by PR identity + open
  }, [open, prIdentity, detailProp?.commentsMeta?.hasMore, detailProp?.reviewCommentsMeta?.hasMore]);

  // --- Zustand-owned interactive UI (selective subscriptions) ---
  const layoutMode = useModalStore((s) => s.layoutMode);
  const setLayoutMode = useModalStore((s) => s.setLayoutMode);
  const diffMode = useModalStore((s) => s.diffMode);
  const setDiffMode = useModalStore((s) => s.setDiffMode);
  const readViewportHeight = () =>
    Number(useModalStore.getState().viewportHeight) || 520;
  const readScrollTop = () => Number(useModalStore.getState().scrollTop) || 0;
  // scrollTop / viewportHeight: DiffWorkspace leaf-subscribes (useScrollMetricsGroup).
  // App only writes via setters / getState() so high-freq scroll jumps do not re-render root.
  const setScrollTop = useModalStore((s) => s.setScrollTop);
  const setViewportHeight = useModalStore((s) => s.setViewportHeight);

  /** Mirror high-freq scroll metrics without re-rendering the composition root. */
  const viewportHeightRef = useRef(520);
  const scrollTopRef = useRef(0);
  useEffect(() => {
    viewportHeightRef.current = Number(useModalStore.getState().viewportHeight) || 520;
    scrollTopRef.current = Number(useModalStore.getState().scrollTop) || 0;
    return useModalStore.subscribe((s) => {
      viewportHeightRef.current = Number(s.viewportHeight) || 520;
      scrollTopRef.current = Number(s.scrollTop) || 0;
    });
  }, []);

  const searchOpen = useModalStore((s) => s.searchOpen);
  const setSearchOpen = useModalStore((s) => s.setSearchOpen);
  const searchQuery = useModalStore((s) => s.searchQuery);
  const setSearchQuery = useModalStore((s) => s.setSearchQuery);
  const searchHits = useModalStore((s) => s.searchHits);
  const setSearchHitsStore = useModalStore((s) => s.setSearchHits);
  const setSearchHits = (hits: any, index?: number) => setSearchHitsStore(hits, index);
  const searchHitIndex = useModalStore((s) => s.searchHitIndex);
  const setSearchHitIndex = useModalStore((s) => s.setSearchHitIndex);
  const activeFilePath = useModalStore((s) => s.activeFilePath);
  const setActiveFilePath = useModalStore((s) => s.setActiveFilePath);
  const animClass = useModalStore((s) => s.animClass);
  const setAnimClass = useModalStore((s) => s.setAnimClass);
  // commentText: ConversationView leaf-subscribes; App reads getState on submit.
  const setCommentText = useModalStore((s) => s.setCommentText);
  const actionBusy = useModalStore((s) => s.actionBusy);
  const setActionBusy = useModalStore((s) => s.setActionBusy);
  const actionMsg = useModalStore((s) => s.actionMsg);
  const actionMsgSeq = useModalStore((s) => s.actionMsgSeq);
  const setActionMsg = useModalStore((s) => s.setActionMsg);
  const collapsedFiles = useModalStore((s) => s.collapsedFiles);
  const setCollapsedFiles = useModalStore((s) => s.setCollapsedFiles);
  const expandedDirs = useModalStore((s) => s.expandedDirs);
  const setExpandedDirs = useModalStore((s) => s.setExpandedDirs);
  const commentIndex = useModalStore((s) => s.commentIndex);
  const setCommentIndex = useModalStore((s) => s.setCommentIndex);
  // Do NOT subscribe to lineSelection/selecting for render — key-hold would
  // re-render the whole modal. VirtualDiff + SelectionCommentBar read the store.
  const setLineSelection = useModalStore((s) => s.setLineSelection);
  const setSelecting = useModalStore((s) => s.setSelecting);
  // selectionDraft: DiffWorkspace leaf-subscribes (selection island typing).
  const setSelectionDraft = useModalStore((s) => s.setSelectionDraft);
  const showSelectionComposer = useModalStore((s) => s.showSelectionComposer);
  /** Selection island: action chips first, then comment composer. */
  const [selectionIslandPhase, setSelectionIslandPhase] = useState<
    'actions' | 'comment'
  >('actions');
  const setShowSelectionComposer = useModalStore((s) => s.setShowSelectionComposer);
  const selectionIslandLeaving = useModalStore((s) => s.selectionIslandLeaving);
  const setSelectionIslandLeaving = useModalStore((s) => s.setSelectionIslandLeaving);
  const fileQuery = useModalStore((s) => s.fileQuery);
  const setFileQuery = useModalStore((s) => s.setFileQuery);
  const viewedPaths = useModalStore((s) => s.viewedPaths);
  const setViewedPaths = useModalStore((s) => s.setViewedPaths);
  // Do NOT subscribe to replyDrafts for render — each keystroke would re-render
  // the whole modal. InlineThread leaf-subscribes to its own draft id.
  const setReplyDrafts = (fn: any) => {
    // bridge object-style updates used by existing call sites
    if (typeof fn === 'function') {
      const prev = useModalStore.getState().replyDrafts;
      const next = fn(prev) || {};
      if (next && typeof next === 'object') {
        useModalStore.setState({ replyDrafts: { ...next } });
      }
    }
  };
  const pendingReview = useModalStore((s) => s.pendingReview);
  const setPendingReview = useModalStore((s) => s.setPendingReview);
  const timelinePage = useModalStore((s) => s.timelinePage);
  const setTimelinePage = useModalStore((s) => s.setTimelinePage);
  const editingBody = useModalStore((s) => s.editingBody);
  const setEditingBody = useModalStore((s) => s.setEditingBody);
  const editingComment = useModalStore((s) => s.editingComment);
  const setEditingComment = useModalStore((s) => s.setEditingComment);
  const paletteOpen = useModalStore((s) => s.paletteOpen);
  const setPaletteOpen = useModalStore((s) => s.setPaletteOpen);
  // paletteQuery: CommandPalette leaf-subscribes.
  const setPaletteQuery = useModalStore((s) => s.setPaletteQuery);
  const picker = useModalStore((s) => s.picker);
  const setPicker = useModalStore((s) => s.setPicker);
  const [theme, setTheme] = useState(() =>
    resolveGithubTheme(typeof document !== 'undefined' ? document : null, typeof window !== 'undefined' ? window : null)
  );
  /**
   * Diff inline-thread collapse overrides (commentId → collapsed).
   * Default: resolved threads start collapsed; open threads start expanded.
   */
  const [diffThreadCollapse, setDiffThreadCollapse] = useState(
    () => new Map<string, boolean>()
  );
  /**
   * Diff “expand gap” (context between hunks): path → head file lines,
   * path → merged 1-based new-line ranges already expanded.
   */
  const [diffFileLines, setDiffFileLines] = useState(
    () => new Map<string, string[]>()
  );
  const [diffExpandedRanges, setDiffExpandedRanges] = useState(
    () => new Map<string, Array<{ start: number; end: number }>>()
  );
  const [diffExpandBusyKey, setDiffExpandBusyKey] = useState<string | null>(null);
  /** Diff toolbar: Unresolved | Resolved | off (null). Filters files + review nav. */
  const [diffReviewFilter, setDiffReviewFilter] = useState<DiffReviewFilterMode>(null);
  /** Files-nav filters (shared with Diff review nav counts). */
  const [fileExtFilter, setFileExtFilter] = useState(() => new Set<string>());
  const [fileUnreadOnly, setFileUnreadOnly] = useState(false);
  /** Outer shell: modal (default) vs side sheet — persisted preference. */
  const [shellMode, setShellMode] = useState<ShellMode>(() => {
    try {
      if (typeof window === 'undefined') return SHELL_MODAL;
      return loadShellPref(resolveShellStorage(window));
    } catch {
      return SHELL_MODAL;
    }
  });
  /** Side-sheet width (px) — persisted, viewport-clamped on apply. */
  const [sheetWidth, setSheetWidth] = useState<number>(() => {
    try {
      if (typeof window === 'undefined') return SHEET_DEFAULT_WIDTH;
      return loadSheetWidth(resolveShellSizeStorage(window), {
        viewportWidth: window.innerWidth,
      });
    } catch {
      return SHEET_DEFAULT_WIDTH;
    }
  });
  /** Centered modal width/height (px) — persisted. */
  const [modalSize, setModalSize] = useState<ModalShellSize>(() => {
    try {
      if (typeof window === 'undefined') {
        return { width: MODAL_DEFAULT_WIDTH, height: MODAL_DEFAULT_HEIGHT };
      }
      return loadModalSize(resolveShellSizeStorage(window), {
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      });
    } catch {
      return { width: MODAL_DEFAULT_WIDTH, height: MODAL_DEFAULT_HEIGHT };
    }
  });
  /** Fullscreen shell — session-only; does not wipe stored sizes. */
  const [shellFullscreen, setShellFullscreen] = useState(false);
  /** Blue dimmer while resizing into the ~50px fullscreen snap zone (not yet committed). */
  const [shellFullscreenHint, setShellFullscreenHint] = useState(false);
  /** True while the user is dragging a shell resizer (disables size CSS transition). */
  const [shellResizing, setShellResizing] = useState(false);
  const shellResizeDragRef = useRef<
    | { kind: 'sheet'; startX: number; startWidth: number }
    | { kind: 'modal'; startX: number; startY: number; start: ModalShellSize }
    | null
  >(null);
  /** Diff files navigator: collapsed + width (persisted). */
  const [fileNav, setFileNav] = useState<FileNavPref>(() => {
    try {
      if (typeof window === 'undefined') {
        return { collapsed: false, width: FILE_NAV_DEFAULT_WIDTH };
      }
      // loadFileNavPref restores width; always opens expanded by default.
      return loadFileNavPref(resolveFileNavStorage(window));
    } catch {
      return { collapsed: false, width: FILE_NAV_DEFAULT_WIDTH };
    }
  });
  const fileNavDragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  /** True while playing close exit animation before host onClose. */
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  /** Bump to open inline title editor from command palette. */
  const [titleEditSignal, setTitleEditSignal] = useState(0);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef = useRef<any>(null);
  /** Conversation viewport: GraphQL PRRT_… ids currently on screen */
  const visibleConvThreadNodeIdsRef = useRef<string[]>([]);
  const searchInputRef = useRef<any>(null);
  const shellRef = useRef<any>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const commentBoxRef = useRef<any>(null);
  /**
   * Conversation keyboard focus — store only (leaf cards subscribe).
   * Ref mirrors last target for step nav without App re-render.
   */
  const conversationCommentFocusRef = useRef<{
    id: string;
    kind: string;
    anchor: string;
  } | null>(null);
  // Drop keyboard focus when switching PRs
  useEffect(() => {
    conversationCommentFocusRef.current = null;
    useModalStore.getState().requestConversationNav(null);
  }, [prIdentity]);
  const collapseInitRef = useRef<any>(null);
  const selectingRef = useRef<boolean>(false);
  const pointerStartRef = useRef<any>(null);
  /** Shift-click range: finalize as multi (do not collapse head to anchor). */
  const shiftRangeRef = useRef<boolean>(false);
  /**
   * Delay selection action toggles after line select/move so key-hold does not
   * remount the island (TipPopover layout) every keydown.
   */
  const selectionActionsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  /** Coalesce key-repeat line moves to one React update per animation frame. */
  const selectionMoveRafRef = useRef(0);
  const pendingSelectionMoveRef = useRef<{ delta: number; shift: boolean } | null>(
    null
  );
  /**
   * Single-file mode: hop to adjacent file at EOF/BOF, then seed first/last
   * selectable line once virtualRows rebuild for that path.
   */
  const pendingCrossFileSeedRef = useRef<{
    path: string;
    edge: 'first' | 'last';
  } | null>(null);
  /** Latest UI flags for capture-phase keydown (avoid stale closures). */
  const uiRef = useRef<any>({});
  /** Latest action handlers for capture-phase keydown. */
  const actionsRef = useRef<any>({});
  /** Last registered Apply-suggestion callback (hover/focus on suggestion block). */
  const applyActionRef = useRef<any>(null);
  /** Active BodyEditor save (draft) while editing body/comment. */
  const editorSaveRef = useRef<any>(null);
  /** Anchors for searchable select popovers (above trigger). */
  const baseBranchRef = useRef<HTMLElement | null>(null);
  const reviewerAddRef = useRef<HTMLElement | null>(null);
  const assigneeAddRef = useRef<HTMLElement | null>(null);
  const labelAddRef = useRef<HTMLElement | null>(null);
  const milestoneAddRef = useRef<HTMLElement | null>(null);
  const pickerAnchorRef = useRef<HTMLElement | null>(null);
  /** Apply session/URI page+position once per PR open. */
  const routeRestoreKeyRef = useRef<string | null>(null);
  const positionAppliedRef = useRef<string | null>(null);
  /** Skip writing URI until after initial restore settles. */
  const [routeWriteReady, setRouteWriteReady] = useState(false);
  const isMac =
    typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || '');
  const shortcutMod = isMac ? '⌘' : 'Ctrl+';

  // Always re-annotate with gitattributesText so SW fallback defaults cannot
  // skip linguist-generated / binary rules from the fetched attributes file.

  const sourceFiles = useMemo(() => {
    if (diffFilesOverride) return diffFilesOverride;
    return detail?.files || [];
  }, [detail?.files, diffFilesOverride]);

  const annotatedFiles = useMemo(() => {
    if (!sourceFiles?.length) return [];
    return annotateFilesForCollapse(sourceFiles, detail?.gitattributesText || '');
  }, [sourceFiles, detail?.gitattributesText]);

  /** True after we paged through every commit/file for this PR open. */
  const commitsFullyLoadedRef = useRef(false);
  const filesFullyLoadedRef = useRef(false);
  const [commitListLoading, setCommitListLoading] = useState(false);
  const [fileListLoading, setFileListLoading] = useState(false);
  const [prTags, setPrTags] = useState<Array<{ name: string; sha: string }> | null>(
    null
  );
  const [prTagsLoading, setPrTagsLoading] = useState(false);
  const [prTagsError, setPrTagsError] = useState<string | null>(null);

  useEffect(() => {
    commitsFullyLoadedRef.current = false;
    filesFullyLoadedRef.current = false;
    setPrTags(null);
    setPrTagsError(null);
  }, [prIdentity]);

  // Tags that point at commits in this PR (or head sha).
  useEffect(() => {
    if (!detail?.owner || !detail?.repo) return;
    const api = globalThis.PRTreeFetch;
    let cancelled = false;
    const shas = [
      detail.headSha,
      ...((detail.commits || []).map((c: any) => c?.sha).filter(Boolean) as string[]),
    ];
    const uniq = [...new Set(shas.map((s) => String(s).trim()).filter(Boolean))];
    if (!uniq.length) {
      setPrTags([]);
      setPrTagsError(null);
      return;
    }
    setPrTagsLoading(true);
    setPrTagsError(null);
    void (async () => {
      try {
        let tags: any[] = [];
        if (typeof api?.fetchTagsForCommits === 'function') {
          tags = await api.fetchTagsForCommits(detail.owner, detail.repo, uniq);
        } else if (typeof api?.fetchRepoTags === 'function') {
          // Stale SW without FETCH_TAGS_FOR_COMMITS — filter client-side.
          const all = await api.fetchRepoTags(detail.owner, detail.repo);
          const want = new Set(uniq.map((s) => String(s).toLowerCase()));
          tags = (Array.isArray(all) ? all : []).filter((t: any) =>
            want.has(String(t?.sha || '').toLowerCase())
          );
        }
        if (cancelled) return;
        setPrTags(Array.isArray(tags) ? tags : []);
        setPrTagsError(null);
      } catch (err: any) {
        if (cancelled) return;
        const msg = err?.message || String(err);
        // Stale service worker after upgrade: don't surface as a hard error.
        if (/unknown type:\s*PR_TREE_FETCH_TAGS/i.test(msg)) {
          setPrTags([]);
          setPrTagsError(null);
          try {
            console.warn(
              '[pr+] Tags require reloading the extension (chrome://extensions → pr+ → Reload).',
              msg
            );
          } catch {
            /* ignore */
          }
        } else {
          setPrTagsError(msg);
          setPrTags([]);
        }
      } finally {
        if (!cancelled) setPrTagsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    detail?.owner,
    detail?.repo,
    detail?.headSha,
    // Re-run when commit list identity changes (page load / ensureAll).
    detail?.commits?.length,
    prIdentity,
  ]);

  const ensureAllCommits = useCallback(async () => {
    if (!detail || typeof onFetchAllPrCommits !== 'function') return;
    if (commitsFullyLoadedRef.current) return;
    setCommitListLoading(true);
    try {
      const all = await onFetchAllPrCommits();
      if (!Array.isArray(all)) return;
      commitsFullyLoadedRef.current = true;
      setLocalDetail((prev: any) =>
        prev ? { ...prev, commits: all } : prev
      );
      try {
        onPatchDetail?.({ commits: all });
      } catch {
        /* ignore */
      }
    } catch (err: any) {
      setDiffCommitError(err?.message || String(err));
    } finally {
      setCommitListLoading(false);
    }
  }, [detail, onFetchAllPrCommits, onPatchDetail]);

  const ensureAllFiles = useCallback(async () => {
    if (!detail || typeof onFetchAllPrFiles !== 'function') return;
    if (filesFullyLoadedRef.current) return;
    // Don't clobber a commit-range override with full PR files mid-filter.
    if (diffFilesOverride) {
      filesFullyLoadedRef.current = true;
      return;
    }
    setFileListLoading(true);
    try {
      const all = await onFetchAllPrFiles({
        gitattributesText: detail.gitattributesText || '',
      });
      if (!Array.isArray(all) || !all.length) {
        filesFullyLoadedRef.current = true;
        return;
      }
      filesFullyLoadedRef.current = true;
      setLocalDetail((prev: any) => (prev ? { ...prev, files: all } : prev));
      try {
        onPatchDetail?.({ files: all, changedFiles: all.length });
      } catch {
        /* ignore */
      }
    } catch {
      /* soft-fail: keep partial file list */
    } finally {
      setFileListLoading(false);
    }
  }, [detail, onFetchAllPrFiles, onPatchDetail, diffFilesOverride]);

  const applyDiffCommitFilter = useCallback(
    async (nextRaw: DiffCommitFilterState) => {
      const next = normalizeDiffCommitFilter(nextRaw);
      setDiffCommitFilter(next);
      setDiffCommitError(null);
      setScrollTop(0);
      if (listRef.current) listRef.current.scrollTop = 0;

      if (isAllCommitsFilter(next) || !detail) {
        setDiffFilesOverride(null);
        setDiffCommitLabel(null);
        setDiffCommitLoading(false);
        return;
      }

      const baseRefOrSha = detail.baseSha || detail.baseRef || '';
      const range = resolveCompareRange(detail.commits || [], baseRefOrSha, next);
      if (!range) {
        setDiffFilesOverride(null);
        setDiffCommitLabel(null);
        setDiffCommitError('Could not resolve commit range');
        return;
      }
      setDiffCommitLabel(range.label);

      if (typeof onFetchCompareFiles !== 'function') {
        setDiffCommitError('Compare fetch is unavailable');
        return;
      }

      const cacheKey = compareCacheKey(detail.owner, detail.repo, range.base, range.head);
      const cached = compareFilesCacheRef.current.get(cacheKey);
      if (cached) {
        setDiffFilesOverride(cached);
        setDiffCommitLoading(false);
        return;
      }

      const gen = ++compareFetchGenRef.current;
      setDiffCommitLoading(true);
      try {
        const result = await onFetchCompareFiles(range.base, range.head, {
          gitattributesText: detail.gitattributesText || '',
        });
        if (gen !== compareFetchGenRef.current) return;
        const files = Array.isArray(result?.files) ? result.files : [];
        compareFilesCacheRef.current.set(cacheKey, files);
        setDiffFilesOverride(files);
        setDiffCommitError(null);
      } catch (err: any) {
        if (gen !== compareFetchGenRef.current) return;
        setDiffCommitError(err?.message || String(err));
        setDiffFilesOverride(null);
      } finally {
        if (gen === compareFetchGenRef.current) setDiffCommitLoading(false);
      }
    },
    [detail, onFetchCompareFiles, setScrollTop]
  );

  const threadCounts = useMemo(() => {
    if (typeof countReviewThreadsByPath === 'function') {
      return countReviewThreadsByPath(detail?.reviewComments || []);
    }
    return new Map();
  }, [detail?.reviewComments]);

  const unresolvedThreadCounts = useMemo(() => {
    if (typeof countUnresolvedReviewThreadsByPath === 'function') {
      return countUnresolvedReviewThreadsByPath(detail?.reviewComments || []);
    }
    return new Map();
  }, [detail?.reviewComments]);

  const pendingThreadCounts = useMemo(() => {
    if (typeof countPendingReviewThreadsByPath === 'function') {
      return countPendingReviewThreadsByPath(detail?.reviewComments || []);
    }
    return new Map();
  }, [detail?.reviewComments]);

  /**
   * Filter-toggle badges — same universe as Diff comment nav (0/N):
   * thread roots on paths in the current file list. Prefer counting the same
   * roots filterReviewRootsForNav uses so pending/path rules match nav.
   */
  const reviewThreadTotals = useMemo(() => {
    const pathSet = new Set<string>();
    for (const f of annotatedFiles || []) {
      const p = f?.filename || f?.path;
      if (p) pathSet.add(String(p));
    }
    const all = detail?.reviewComments || [];
    // Same root selection as comment nav with no resolution filter
    if (typeof filterReviewRootsForNav === 'function') {
      const roots = filterReviewRootsForNav(all, null, pathSet);
      let unresolved = 0;
      let resolved = 0;
      let pendingThreads = 0;
      for (const c of roots) {
        if (!c) continue;
        const pending = Boolean(c.pending);
        // Match filterReviewRootsForNav pending-mode (replies may mark pending)
        // via a second pass: roots already include reply-pending via rootIsPending
        // only when mode is pending/unresolved. For null mode all roots return.
        // Re-check pending like unresolved mode would: use pending flag on root
        // and any pending reply in the full list.
        let isPending = pending;
        if (!isPending && c.id != null) {
          const rid = String(c.id);
          for (const r of all) {
            if (!r?.pending) continue;
            const parent = r.inReplyToId ?? r.in_reply_to_id ?? null;
            if (parent != null && String(parent) === rid) {
              isPending = true;
              break;
            }
          }
        }
        if (isPending) pendingThreads += 1;
        if (c.resolved) resolved += 1;
        else if (!isPending) unresolved += 1;
      }
      return {
        total: roots.length,
        unresolved,
        resolved,
        pendingThreads,
      };
    }
    if (typeof countReviewThreadTotals === 'function') {
      return countReviewThreadTotals(all, { allowedPaths: pathSet });
    }
    return { total: 0, unresolved: 0, resolved: 0, pendingThreads: 0 };
  }, [detail?.reviewComments, annotatedFiles]);

  /**
   * Resolve-status (Unresolved/Resolved/Pending) filter only.
   * Extension chips are derived from this list so selecting one ext does not
   * hide other ext chips / drop multi-select — only review mode reshapes them.
   */
  const reviewScopedFiles = useMemo(
    () =>
      filterFilesByReviewMode(
        annotatedFiles,
        threadCounts,
        unresolvedThreadCounts,
        diffReviewFilter,
        pendingThreadCounts
      ),
    [
      annotatedFiles,
      threadCounts,
      unresolvedThreadCounts,
      pendingThreadCounts,
      diffReviewFilter,
    ]
  );

  /**
   * Files after resolve-status + name/ext/unread filters, then **DFS tree
   * order** (dirs-first + name sort — same as left file explorer).
   * Shared by Diff virtual list, file tree, prev/next file nav, and pathOrder.
   */
  const displayFiles = useMemo(() => {
    let list = reviewScopedFiles;
    if (typeof filterFilesByQuery === 'function') {
      list = filterFilesByQuery(list, fileQuery);
    }
    list = filterFilesByExtensions(list, fileExtFilter);
    list = filterFilesUnreadOnly(list, viewedPaths, fileUnreadOnly);
    // One order for Diff + explorer + step-nav (not GitHub files[] API order)
    if (typeof filesInTreeOrder === 'function') {
      list = filesInTreeOrder(list);
    }
    return list;
  }, [
    reviewScopedFiles,
    fileQuery,
    fileExtFilter,
    viewedPaths,
    fileUnreadOnly,
  ]);

  /**
   * Diff virtual list source. In single-file mode only the active (or first)
   * file is flattened to rows; the left tree still uses full displayFiles.
   * Order is already DFS via displayFiles.
   */
  const diffDisplayFiles = useMemo(
    () =>
      typeof resolveDiffDisplayFiles === 'function'
        ? resolveDiffDisplayFiles(displayFiles, activeFilePath, singleFileMode)
        : displayFiles,
    [singleFileMode, displayFiles, activeFilePath]
  );

  /** @deprecated alias — keep names used below / tests */
  const reviewFilteredFiles = displayFiles;
  const navFiles = displayFiles;

  const displayPathSet = useMemo(() => {
    const s = new Set<string>();
    for (const f of displayFiles) {
      const p = f?.filename || f?.path;
      if (p) s.add(p);
    }
    return s;
  }, [displayFiles]);

  /**
   * Review comments limited by thread resolution + current file set.
   * When no review filter is active, keep every comment on visible files
   * (including pending) so Diff inline cards always render.
   */
  const navReviewComments = useMemo(() => {
    const all = detail?.reviewComments || [];
    if (!diffReviewFilter && displayPathSet.size === annotatedFiles.length) {
      // Fast path: no review mode and no file filters that shrink the set
      const unfiltered =
        !String(fileQuery || '').trim() &&
        fileExtFilter.size === 0 &&
        !fileUnreadOnly;
      if (unfiltered) return all;
    }
    // Path-only filter when review mode is off — never drop pending by mode
    if (!diffReviewFilter) {
      if (!displayPathSet.size) return all;
      return all.filter((c: any) => {
        if (!c) return false;
        const path = c.path || '';
        return !path || displayPathSet.has(path);
      });
    }
    return typeof filterReviewCommentsForNav === 'function'
      ? filterReviewCommentsForNav(all, diffReviewFilter, displayPathSet)
      : all;
  }, [
    detail?.reviewComments,
    diffReviewFilter,
    displayPathSet,
    annotatedFiles.length,
    fileQuery,
    fileExtFilter,
    fileUnreadOnly,
  ]);

  const threads = useMemo(() => {
    if (typeof groupReviewThreads === 'function') {
      return groupReviewThreads(detail?.reviewComments || []);
    }
    return [];
  }, [detail?.reviewComments]);

  const threadsByCommentId = useMemo(() => {
    const map = new Map();
    for (const t of threads) {
      map.set(String(t.id), t);
    }
    return map;
  }, [threads]);

  const mentionCandidates = useMemo(() => {
    const names = new Set();
    const add = (v: unknown) => {
      const s = typeof v === 'string' ? v : (v as any)?.login || (v as any)?.name || '';
      if (s) names.add(String(s).replace(/^@/, ''));
    };
    if (detail?.author) add(detail.author);
    if (detail?.viewerLogin) add(detail.viewerLogin);
    for (const r of detail?.reviews || []) add(r.author);
    for (const c of detail?.comments || []) add(c.author);
    for (const c of detail?.reviewComments || []) add(c.author);
    for (const a of detail?.assignees || []) add(a);
    for (const r of detail?.requestedReviewers || []) add(r);
    return [...names];
  }, [detail]);

  const fileTree = useMemo(() => {
    if (typeof buildNestedFileTree === 'function') return buildNestedFileTree(navFiles);
    return [];
  }, [navFiles]);

  // Expand every folder when a PR's file list first becomes available.
  // expandedDirs starts empty in the store, so without this only top-level names show.
  const fileTreeExpandKeyRef = useRef<string>('');
  useEffect(() => {
    if (!prIdentity || !annotatedFiles?.length) return;
    if (fileTreeExpandKeyRef.current === prIdentity) return;
    if (typeof buildNestedFileTree !== 'function' || typeof collectDirPaths !== 'function') {
      return;
    }
    const fullTree = buildNestedFileTree(annotatedFiles);
    const dirs = collectDirPaths(fullTree);
    fileTreeExpandKeyRef.current = prIdentity;
    setExpandedDirs(dirs);
  }, [prIdentity, annotatedFiles, setExpandedDirs]);

  const virtualRows = useMemo(
    () =>
      flattenFilesToVirtualRows(diffDisplayFiles, diffMode, {
        collapsedPaths: collapsedFiles,
        viewedPaths,
        reviewComments: navReviewComments,
        expandedRanges: diffExpandedRanges,
        fileLineTexts: diffFileLines,
        // Image preview URLs for binary-less image files (added/replaced)
        owner: detail?.owner,
        repo: detail?.repo,
        baseSha: detail?.baseSha,
        headSha: detail?.headSha,
        baseRef: detail?.baseRef,
        headRef: detail?.headRef,
        webOrigin:
          typeof location !== 'undefined' ? location.origin : 'https://github.com',
      }),
    [
      diffDisplayFiles,
      diffMode,
      collapsedFiles,
      viewedPaths,
      navReviewComments,
      diffExpandedRanges,
      diffFileLines,
      detail?.owner,
      detail?.repo,
      detail?.baseSha,
      detail?.headSha,
      detail?.baseRef,
      detail?.headRef,
    ]
  );

  const fileStarts = useMemo(() => fileStartIndexMap(virtualRows), [virtualRows]);

  const isDiffCommentCollapsed = useCallback(
    (rowOrId: any, resolvedHint?: boolean) => {
      if (rowOrId && typeof rowOrId === 'object' && rowOrId.kind === 'inline-comment') {
        const id = rowOrId.commentId;
        const thread = threadsByCommentId?.get?.(String(id));
        const resolved = Boolean(thread?.resolved ?? rowOrId.resolved);
        return isDiffThreadCollapsed(id, resolved);
      }
      return isDiffThreadCollapsed(rowOrId, Boolean(resolvedHint));
    },
    [diffThreadCollapse, threadsByCommentId]
  );

  const commentHeightOpts = useMemo(
    () => ({
      isCollapsed: (row: any) => isDiffCommentCollapsed(row),
    }),
    [isDiffCommentCollapsed]
  );

  const avgH = useMemo(
    () => averageRowHeight(virtualRows, commentHeightOpts),
    [virtualRows, commentHeightOpts]
  );
  const rowOffsetList = useMemo(
    () =>
      typeof rowOffsets === 'function' ? rowOffsets(virtualRows, commentHeightOpts) : null,
    [virtualRows, commentHeightOpts]
  );

  // Diff comment navigator: filtered roots, top → bottom (file list + row order).
  const mappedComments = useMemo(() => {
    if (typeof mapCommentsToRowIndices !== 'function') return [];
    const pathOrder =
      typeof buildPathOrderMap === 'function'
        ? buildPathOrderMap(displayFiles)
        : null;
    const roots =
      typeof filterReviewRootsForNav === 'function'
        ? sortThreadRootComments(
            filterReviewRootsForNav(
              detail?.reviewComments || [],
              diffReviewFilter,
              displayPathSet
            ),
            pathOrder
          )
        : typeof sortThreadRootComments === 'function'
          ? sortThreadRootComments(navReviewComments, pathOrder)
          : navReviewComments;
    return mapCommentsToRowIndices(roots, virtualRows, { pathOrder });
  }, [
    detail?.reviewComments,
    virtualRows,
    diffReviewFilter,
    displayPathSet,
    displayFiles,
    navReviewComments,
  ]);

  // Keep commentIndex inside the filtered list when filters change
  useEffect(() => {
    if (commentIndex < 0) return;
    if (!mappedComments.length) {
      setCommentIndex(-1);
      return;
    }
    if (commentIndex >= mappedComments.length) {
      setCommentIndex(mappedComments.length - 1);
    }
  }, [mappedComments, commentIndex, setCommentIndex]);

  // Sync Diff context-thread id for tips / shortcuts (leaf-subscribe in InlineThread)
  useEffect(() => {
    if (layoutMode !== LAYOUT_DIFF || commentIndex < 0) {
      useModalStore.getState().setActiveDiffCommentId(null);
      return;
    }
    const id = mappedComments[commentIndex]?.id;
    useModalStore
      .getState()
      .setActiveDiffCommentId(id != null ? id : null);
  }, [layoutMode, commentIndex, mappedComments]);

  // Search is view-scoped: Conversation corpus vs Diff virtual rows only.
  // Never mix the two so Find does not surface off-screen content.
  const searchMode =
    layoutMode === LAYOUT_DIFF ? 'diff' : 'conversation';

  // Build index only while find is open — not on every keystroke.
  const searchDocs = useMemo(() => {
    if (!searchOpen) return [];
    if (typeof buildSearchIndex === 'function') {
      return buildSearchIndex(detail, virtualRows, { mode: searchMode });
    }
    return Array.isArray(virtualRows) ? virtualRows : [];
  }, [detail, virtualRows, searchOpen, searchMode]);

  const searchGenRef = useRef(0);
  const [searchBusy, setSearchBusy] = useState(false);
  /** After first non-empty search in this open session — gates Load Comments. */
  const [searchHasRun, setSearchHasRun] = useState(false);

  // New PR / close find → allow Load Comments to reappear after next search
  useEffect(() => {
    setSearchHasRun(false);
  }, [prIdentity]);

  // Fresh PR → drop expanded hunk context cache
  useEffect(() => {
    setDiffFileLines(new Map());
    setDiffExpandedRanges(new Map());
    setDiffExpandBusyKey(null);
  }, [prIdentity]);
  // Jump geometry via ref so resize/scroll does not re-trigger search.
  const searchJumpRef = useRef({
    avgH,
    viewportHeight: viewportHeightRef.current,
    rowCount: virtualRows.length,
    rowOffsetList,
  });
  searchJumpRef.current = {
    avgH,
    viewportHeight: viewportHeightRef.current,
    rowCount: virtualRows.length,
    rowOffsetList,
  };

  const jumpToSearchHit = useCallback(
    (hit: any) => {
      if (!hit) return;

      /**
       * Prefer Diff row targets first. Review-comment docs often carry BOTH
       * anchorId and rowIndex — old code checked anchorId first and forced
       * Conversation, so Search prev/next "jumped back" into Conversation.
       */
      if (searchHitHasRowIndex(hit)) {
        if (layoutMode !== LAYOUT_DIFF) {
          setLayoutMode(LAYOUT_DIFF);
        }
        const j = searchJumpRef.current;
        const top = scrollTopForIndex(
          hit.rowIndex,
          j.avgH,
          j.viewportHeight,
          j.rowCount,
          j.rowOffsetList
        );
        setScrollTop(top);
        const applyDomScroll = () => {
          const list = listRef.current as HTMLElement | null;
          if (list) list.scrollTop = top;
          const rowEl = list?.querySelector?.(
            `[data-row-index="${hit.rowIndex}"]`
          ) as HTMLElement | null;
          if (rowEl) {
            try {
              const mark = rowEl.querySelector(
                '.prp-search-mark--current'
              ) as HTMLElement | null;
              (mark || rowEl).scrollIntoView({
                block: 'center',
                inline: 'nearest',
              });
            } catch {
              /* ignore */
            }
          }
        };
        applyDomScroll();
        requestAnimationFrame(() => {
          applyDomScroll();
          requestAnimationFrame(applyDomScroll);
        });
        return;
      }

      // Conversation-only anchors (body / issue comments / review events)
      if (hit.anchorId) {
        // Never yank Diff → Conversation during search navigation.
        // navSearch skips these while layout is Diff; if we still land here,
        // no-op rather than flipping the shell.
        if (layoutMode === LAYOUT_DIFF) {
          return;
        }
        const apply = () => {
          try {
            const el = document.querySelector(
              `[data-search-anchor="${CSS.escape(String(hit.anchorId))}"]`
            ) as HTMLElement | null;
            if (!el) return;
            el.scrollIntoView({ block: 'center', inline: 'nearest' });
            const mark = el.querySelector(
              '.prp-search-mark--current'
            ) as HTMLElement | null;
            mark?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
          } catch {
            /* ignore */
          }
        };
        apply();
        requestAnimationFrame(() => {
          apply();
          requestAnimationFrame(apply);
        });
      }
    },
    [layoutMode, setLayoutMode, setScrollTop]
  );

  /**
   * SearchBar already debounces typing → setSearchQuery.
   * This effect only runs on committed query / corpus change: chunked async scan.
   */
  useEffect(() => {
    const q = (searchQuery || '').trim();
    if (!q) {
      searchGenRef.current += 1;
      setSearchBusy(false);
      startTransition(() => {
        setSearchHitsStore([], -1);
      });
      return undefined;
    }

    const gen = ++searchGenRef.current;
    setSearchBusy(true);

    let cancelled = false;
    void (async () => {
      const isCancelled = () => cancelled || gen !== searchGenRef.current;
      try {
        let st: any = null;
        // Use searchDocs snapshot only — do not depend on `detail` object identity
        // (host re-renders with new detail refs during thread load and would restart search forever).
        const sortOpts = {
          isCancelled,
          // Match sort order to the active view corpus
          mode: searchMode === 'diff' ? 'diff' : 'conversation',
          detail: detailRef.current,
        };
        if (typeof resolveQuerySearchStateAsync === 'function') {
          st = await resolveQuerySearchStateAsync(searchDocs, q, sortOpts);
        } else if (typeof resolveQuerySearchState === 'function') {
          await new Promise((r) => setTimeout(r, 0));
          if (isCancelled()) return;
          st = resolveQuerySearchState(searchDocs, q, sortOpts);
        } else {
          st = { hits: [], hitIndex: -1, shouldJump: false, activeHit: null };
        }
        if (isCancelled() || st?.cancelled) return;

        if (isCancelled()) return;
        setSearchBusy(false);
        setSearchHasRun(true);
        const hits = st.hits || [];
        const hitIndex =
          st.hitIndex != null && st.hitIndex >= 0
            ? st.hitIndex
            : hits.length
              ? 0
              : -1;
        const activeHit = hits[hitIndex] || st.activeHit || null;
        setSearchHitsStore(hits, hitIndex);
        // Conversation stays on conversation; only jump to diff rows when already in Diff
        // or when the active hit is a pure diff-row hit without conversation anchor.
        // Only auto-jump when the hit is visible in the *current* layout.
        // Avoid Diff → Conversation on first body/anchor match.
        if (
          st.shouldJump &&
          activeHit &&
          isNavigableSearchHit(activeHit) &&
          (typeof isSearchHitVisibleInLayout !== 'function' ||
            isSearchHitVisibleInLayout(activeHit, layoutMode))
        ) {
          queueMicrotask(() => {
            if (isCancelled()) return;
            jumpToSearchHit(activeHit);
          });
        }
      } catch {
        if (!isCancelled()) {
          setSearchBusy(false);
          startTransition(() => setSearchHitsStore([], -1));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    searchQuery,
    searchDocs,
    setSearchHitsStore,
    jumpToSearchHit,
    searchMode,
    layoutMode,
  ]);

  // Diff enter → drain all remaining review threads once (idempotent if complete)
  const diffFullLoadGenRef = useRef(0);
  const diffFullLoadKeyRef = useRef('');
  useEffect(() => {
    if (layoutMode !== LAYOUT_DIFF) return undefined;
    if (!detail?.owner || !detail?.repo || !detail?.number) return undefined;
    if (typeof onLoadMoreReviewThreads !== 'function') return undefined;
    const meta = detail.reviewThreadsMeta || {};
    if (!meta.hasMore) return undefined;
    const key = `${detail.owner}/${detail.repo}#${detail.number}`;
    // Avoid re-entry for same PR while a load is in flight / already kicked off
    if (diffFullLoadKeyRef.current === key && diffFullLoadGenRef.current > 0) {
      return undefined;
    }
    diffFullLoadKeyRef.current = key;
    const gen = ++diffFullLoadGenRef.current;
    void (async () => {
      try {
        await onLoadMoreReviewThreads('all');
      } catch {
        /* host stage surfaces errors */
      } finally {
        if (gen === diffFullLoadGenRef.current) {
          // allow retry if still hasMore after failure
          if (detail?.reviewThreadsMeta?.hasMore) {
            diffFullLoadKeyRef.current = '';
          }
        }
      }
    })();
    return undefined;
  }, [
    layoutMode,
    detail?.owner,
    detail?.repo,
    detail?.number,
    detail?.reviewThreadsMeta?.hasMore,
    onLoadMoreReviewThreads,
  ]);

  // Reset full-load gate when switching PRs
  useEffect(() => {
    diffFullLoadKeyRef.current = '';
    diffFullLoadGenRef.current = 0;
  }, [prIdentity]);

  const navSearch = useCallback(
    (delta: number) => {
      if (!searchHits.length) return;
      // Layout-aware next/prev: skip conversation-only hits while in Diff so
      // "previous" never flips the shell to Conversation mid-nav.
      const st =
        typeof resolveNavSearchStateForLayout === 'function'
          ? resolveNavSearchStateForLayout(
              searchHits,
              searchHitIndex,
              delta,
              layoutMode
            )
          : typeof resolveNavSearchState === 'function'
            ? resolveNavSearchState(searchHits, searchHitIndex, delta)
            : null;
      if (!st) return;
      if (
        st.activeHit &&
        typeof isSearchHitVisibleInLayout === 'function' &&
        !isSearchHitVisibleInLayout(st.activeHit, layoutMode)
      ) {
        return;
      }
      setSearchHitIndex(st.hitIndex);
      if (st.shouldJump && st.activeHit) {
        jumpToSearchHit(st.activeHit);
      }
    },
    [
      searchHits,
      searchHitIndex,
      setSearchHitIndex,
      jumpToSearchHit,
      layoutMode,
    ]
  );

  const onSearchQueryCommit = useCallback(
    (q: string) => {
      // Low-priority store update — never block the input frame.
      startTransition(() => {
        setSearchQuery(q);
      });
    },
    [setSearchQuery]
  );

  const onSearchClose = useCallback(() => {
    setSearchOpen(false);
    setSearchHasRun(false);
  }, [setSearchOpen]);

  const onSearchNext = useCallback(() => navSearch(1), [navSearch]);
  const onSearchPrev = useCallback(() => navSearch(-1), [navSearch]);

  const threadsMeta = detail?.reviewThreadsMeta || null;
  const showLoadComments =
    searchHasRun &&
    searchOpen &&
    Boolean(threadsMeta?.hasMore) &&
    typeof onLoadMoreReviewThreads === 'function';

  const onSearchLoadComments = useCallback(async () => {
    if (typeof onLoadMoreReviewThreads !== 'function') return;
    try {
      // 'all' drains dual-window cursors until every review thread is loaded
      await onLoadMoreReviewThreads('all');
      // detail update rebuilds searchDocs → effect re-runs with same query
    } catch {
      /* host surfaces stage errors */
    }
  }, [onLoadMoreReviewThreads]);

  const searchMatchRows = useMemo(
    () => searchHitRowIndexSet(searchHits),
    [searchHits]
  );
  const activeSearchHit =
    searchHitIndex >= 0 && searchHits[searchHitIndex]
      ? searchHits[searchHitIndex]
      : null;
  const activeSearchOccurrence = useMemo(
    () => occurrenceIndexAmongRowHits(searchHits, searchHitIndex),
    [searchHits, searchHitIndex]
  );

  /**
   * After expand / filter clear, remappedComments gains a real rowIndex — finish scroll.
   * Stores comment id (+ optional path) while virtual rows rebuild.
   */
  const pendingCommentJumpRef = useRef<{
    commentId: string | number;
    path?: string;
  } | null>(null);

  const expandFileForJump = useCallback(
    (path: string) => {
      if (!path) return;
      setActiveFilePath(path);
      setCollapsedFiles((prev) => {
        const file = annotatedFiles.find(
          (f: any) => (f.filename || f.path) === path
        );
        if (
          !isPathCollapsed(
            path,
            prev,
            Boolean(file?.defaultCollapsed),
            false,
            viewedPaths
          )
        ) {
          return prev;
        }
        const n = materializeCollapsedPaths(prev, annotatedFiles, viewedPaths);
        n.delete(path);
        return n;
      });
    },
    [annotatedFiles, setActiveFilePath, setCollapsedFiles, viewedPaths]
  );

  const scrollMappedCommentIntoView = useCallback(
    (active: { rowIndex?: number | null } | null | undefined) => {
      if (active?.rowIndex == null) return false;
      // ⌥J/K thread nav on Diff: pin active comment near 1/3 viewport height
      const top = scrollTopForIndex(
        active.rowIndex,
        avgH,
        viewportHeightRef.current,
        virtualRows.length,
        rowOffsetList,
        { align: 'third' }
      );
      // Single write path: DOM + store. VirtualDiff applies prop change once.
      // Extra rAF/scrollIntoView stacks cause visible shake on ⌥J/K.
      const el = listRef.current;
      if (el && Math.abs((el.scrollTop || 0) - top) > 1) {
        el.scrollTop = top;
      }
      const prevTop = Number(useModalStore.getState().scrollTop) || 0;
      if (Math.abs(prevTop - top) > 1) {
        setScrollTop(top);
      }
      return true;
    },
    [avgH, /* vh-ref */, virtualRows.length, rowOffsetList, setScrollTop]
  );

  /** Open Diff, expand file, scroll to thread root (or queue until rows re-map). */
  const jumpToReviewComment = useCallback(
    (target: {
      id?: string | number | null;
      path?: string | null;
      line?: number | null;
      side?: string | null;
    }) => {
      if (layoutMode !== LAYOUT_DIFF) setLayoutMode(LAYOUT_DIFF);

      // Clear thread filter if it hides the target file
      const path = target.path ? String(target.path) : '';
      if (
        path &&
        diffReviewFilter &&
        !reviewFilteredFiles.some(
          (f: any) => (f.filename || f.path) === path
        )
      ) {
        setDiffReviewFilter(null);
      }

      if (path) expandFileForJump(path);

      const id = target.id;
      let idx = -1;
      if (id != null) {
        idx = mappedComments.findIndex((c) => String(c.id) === String(id));
      }
      if (idx < 0 && path) {
        const line =
          target.line != null && Number.isFinite(Number(target.line))
            ? Number(target.line)
            : null;
        const side =
          String(target.side || 'RIGHT').toUpperCase() === 'LEFT'
            ? 'LEFT'
            : 'RIGHT';
        idx = mappedComments.findIndex((c) => {
          if (c.path !== path) return false;
          if (line == null) return true;
          const cl =
            c.line != null
              ? Number(c.line)
              : c.originalLine != null
                ? Number(c.originalLine)
                : null;
          if (cl !== line) return false;
          const cs =
            String(c.side || 'RIGHT').toUpperCase() === 'LEFT' ? 'LEFT' : 'RIGHT';
          return cs === side;
        });
      }

      if (idx < 0) {
        // Still open Diff at file; comment may load later via Load more
        if (path) {
          expandFileForJump(path);
          const fileIdx = fileStarts.get(path);
          if (typeof fileIdx === 'number') {
            scrollMappedCommentIntoView({ rowIndex: fileIdx });
          }
        }
        return;
      }

      setCommentIndex(idx);
      const active = mappedComments[idx];
      useModalStore
        .getState()
        .setActiveDiffCommentId(active?.id ?? id ?? null);
      // Prefer exact inline row; if only header (collapsed) or missing, re-try after expand
      const onlyHeader =
        active?.rowIndex != null &&
        virtualRows[active.rowIndex]?.kind === 'file-header' &&
        virtualRows[active.rowIndex]?.collapsed;
      if (active?.rowIndex != null && !onlyHeader) {
        pendingCommentJumpRef.current = null;
        scrollMappedCommentIntoView(active);
      } else {
        pendingCommentJumpRef.current = {
          commentId: active?.id ?? id ?? idx,
          path: path || active?.path,
        };
        // Header fallback while waiting for expand remount
        scrollMappedCommentIntoView(active);
      }
    },
    [
      layoutMode,
      setLayoutMode,
      diffReviewFilter,
      reviewFilteredFiles,
      expandFileForJump,
      mappedComments,
      virtualRows,
      setCommentIndex,
      scrollMappedCommentIntoView,
      fileStarts,
    ]
  );

  // Finish jump after collapse expand / filter clear rebuilds virtual rows
  useEffect(() => {
    const pending = pendingCommentJumpRef.current;
    if (!pending || !mappedComments.length) return;
    const idx = mappedComments.findIndex(
      (c) => String(c.id) === String(pending.commentId)
    );
    if (idx < 0) return;
    const active = mappedComments[idx];
    if (active?.rowIndex == null) return;
    const row = virtualRows[active.rowIndex];
    // Wait until we have more than a collapsed header when possible
    if (row?.kind === 'file-header' && row.collapsed) return;
    pendingCommentJumpRef.current = null;
    setCommentIndex(idx);
    scrollMappedCommentIntoView(active);
  }, [
    mappedComments,
    virtualRows,
    setCommentIndex,
    scrollMappedCommentIntoView,
  ]);

  /** Pending Goto after expand: path + lines until virtualRows rebuild. */
  const pendingGotoRef = useRef<{
    path: string;
    startLine: number;
    endLine: number | null;
  } | null>(null);

  function scrollSelectionIntoView(sel: any) {
    const headIdx = Number(sel?.headRowIndex);
    if (!Number.isFinite(headIdx) || headIdx < 0) return;
    const top = scrollTopForIndex(
      headIdx,
      avgH,
      viewportHeightRef.current,
      virtualRows.length,
      rowOffsetList
    );
    setScrollTop(top);
    if (listRef.current) listRef.current.scrollTop = top;
  }

  // Single-file mode: seed first/last line after cross-file hop rebuilds rows
  useEffect(() => {
    const pending = pendingCrossFileSeedRef.current;
    if (!pending) return;
    const path = String(pending.path || '').trim();
    if (!path) {
      pendingCrossFileSeedRef.current = null;
      return;
    }
    const row =
      pending.edge === 'last'
        ? typeof lastSelectableRowInFile === 'function'
          ? lastSelectableRowInFile(virtualRows, path)
          : null
        : typeof firstSelectableRowInFile === 'function'
          ? firstSelectableRowInFile(virtualRows, path)
          : null;
    if (!row) {
      // Still collapsed / not in rows yet — keep waiting
      return;
    }
    pendingCrossFileSeedRef.current = null;
    const sel =
      typeof beginLineSelection === 'function' ? beginLineSelection(row) : null;
    if (sel) {
      setLineSelection(sel);
      setSelectionIslandLeaving(false);
      scheduleSelectionActionsReveal();
      queueMicrotask(() => {
        try {
          scrollSelectionHeadDomOnly(sel);
        } catch {
          /* ignore */
        }
      });
    }
  }, [virtualRows, singleFileMode]);

  // Finish Goto once expand rebuilds selectable rows for the target file
  useEffect(() => {
    const pending = pendingGotoRef.current;
    if (!pending) return;
    const result =
      typeof resolvePendingGotoSelection === 'function'
        ? resolvePendingGotoSelection(virtualRows, pending)
        : { status: 'idle' as const };
    if (result.status === 'waiting' || result.status === 'idle') return;
    pendingGotoRef.current = null;
    if (result.status === 'ready' && result.selection) {
      setLineSelection(result.selection);
      scrollSelectionIntoView(result.selection);
      setActionMsg('');
      return;
    }
    if (result.status === 'missing') {
      setActionMsg(
        `No selectable line ${pending.startLine} in ${pending.path}.`
      );
    }
  }, [
    virtualRows,
    avgH,
    viewportHeightRef.current,
    rowOffsetList,
    setLineSelection,
    setScrollTop,
    setActionMsg,
  ]);

  function navComment(delta: number) {
    if (!mappedComments.length) return;
    if (typeof resolveCommentNav === 'function') {
      const st = resolveCommentNav(mappedComments, commentIndex, delta);
      const active = st.active;
      if (active) {
        jumpToReviewComment({
          id: active.id,
          path: active.path,
          line: active.line ?? active.originalLine ?? null,
          side: active.side,
        });
      } else {
        setCommentIndex(st.commentIndex);
      }
    } else {
      const next =
        (commentIndex + delta + mappedComments.length) % mappedComments.length;
      const active = mappedComments[next];
      if (active) {
        jumpToReviewComment({
          id: active.id,
          path: active.path,
          line: active.line ?? active.originalLine ?? null,
          side: active.side,
        });
      } else {
        setCommentIndex(next);
      }
    }
  }

  /** Scroll left file-nav so the active file row is visible when off-screen. */
  function scrollFileNavRowIntoView(path: string) {
    const p = String(path || '').trim();
    if (!p) return;
    requestAnimationFrame(() => {
      try {
        const root =
          typeof document !== 'undefined'
            ? document.querySelector('.prp-filetree')
            : null;
        if (!root) return;
        const esc =
          typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
            ? CSS.escape(p)
            : p.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        const row =
          (root.querySelector(
            `.prp-filetree__item--active[data-file-path="${esc}"]`
          ) as HTMLElement | null) ||
          (root.querySelector(
            `[data-file-path="${esc}"]`
          ) as HTMLElement | null);
        row?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
      } catch {
        /* ignore */
      }
    });
  }

  /** Diff file step — same DFS order as explorer + Diff list (displayFiles). */
  function navFile(delta: number) {
    if (typeof resolveAdjacentFileNav !== 'function') return;
    const st = resolveAdjacentFileNav(displayFiles, activeFilePath, delta);
    if (st.path) onSelectFile(st.path);
  }

  /** Scroll Diff virtual list by ~one viewport page. */
  function scrollDiffPage(delta: number) {
    const el = listRef.current as HTMLElement | null;
    if (!el) return;
    const next =
      typeof nextScrollTopByPage === 'function'
        ? nextScrollTopByPage(
            el.scrollTop,
            el.clientHeight,
            el.scrollHeight,
            delta
          )
        : Math.max(
            0,
            Math.min(
              el.scrollHeight - el.clientHeight,
              el.scrollTop + (delta < 0 ? -1 : 1) * el.clientHeight * 0.9
            )
          );
    el.scrollTop = next;
    setScrollTop(next);
  }

  /**
   * ⌥↑ / ⌥↓ on Diff: override browser default — multi-step selection jump.
   * Scroll is handled once by selection reveal (no second scroll path — that
   * double-setState was a key-hold lag source).
   */
  function optArrowScrollSelect(delta: number) {
    if (layoutMode !== LAYOUT_DIFF) return;
    const dir = delta < 0 ? -1 : 1;
    const steps =
      (typeof DIFF_OPT_ARROW_SHORTCUT !== 'undefined' &&
        Number(DIFF_OPT_ARROW_SHORTCUT.selectionSteps)) ||
      8;
    applySelectionKeyboardMove(dir * steps, false);
  }

  /** Conversation timeline scroller (virtual list). */
  function conversationScrollerEl(): HTMLElement | null {
    try {
      if (typeof document === 'undefined') return null;
      return document.querySelector(
        '.prp-conversation-virtual.prp-scroll-float'
      ) as HTMLElement | null;
    } catch {
      return null;
    }
  }

  /**
   * ⌥↑ / ⌥↓ on Conversation: scroll the timeline panel (not selection).
   * ⌥⇧↑ / ⌥⇧↓: ~one viewport page.
   */
  function scrollConversationPanel(delta: number, page = false) {
    if (layoutMode === LAYOUT_DIFF) return;
    const el = conversationScrollerEl();
    if (!el) return;
    if (page) {
      const next =
        typeof nextScrollTopByPage === 'function'
          ? nextScrollTopByPage(
              el.scrollTop,
              el.clientHeight,
              el.scrollHeight,
              delta
            )
          : Math.max(
              0,
              Math.min(
                el.scrollHeight - el.clientHeight,
                el.scrollTop + (delta < 0 ? -1 : 1) * el.clientHeight * 0.9
              )
            );
      el.scrollTop = next;
      return;
    }
    const dir = delta < 0 ? -1 : 1;
    const rh =
      (typeof DIFF_OPT_ARROW_SHORTCUT !== 'undefined' &&
        Number((DIFF_OPT_ARROW_SHORTCUT as any).conversationRowHeight)) ||
      48;
    const dy =
      typeof optArrowScrollDeltaPx === 'function'
        ? optArrowScrollDeltaPx(dir, rh, el.clientHeight)
        : dir * rh * 8;
    if (typeof applyScrollerDelta === 'function') {
      applyScrollerDelta(el, dy);
    } else {
      el.scrollTop = Math.max(
        0,
        Math.min(el.scrollHeight - el.clientHeight, el.scrollTop + dy)
      );
    }
  }

  /**
   * Timeline items in **page visual order** (same as VirtualConversationList):
   * newest window (top) → oldest window (bottom). reverseComments only moves
   * composer/merge, not item order — do not reverse the list here.
   */
  function conversationCommentPageOrder() {
    const items =
      typeof buildConversationTimeline === 'function' && detail
        ? buildConversationTimeline(detail)
        : [];
    const timeline = (Array.isArray(items) ? items : []).filter(
      (i: any) => !(i && i.kind === 'review-group' && i.pending)
    );
    if (typeof partitionTimelineWithThreadGap === 'function') {
      const gap = partitionTimelineWithThreadGap(
        timeline,
        detail?.reviewThreadsMeta || null
      );
      if (gap?.showGap && Array.isArray(gap.bottom) && gap.bottom.length > 0) {
        return [...(gap.top || []), ...gap.bottom];
      }
    }
    return timeline;
  }

  /**
   * ⌥J / ⌥K on Conversation: step next/prev in page order (wraps).
   * Seeds on first press; focuses conversation layout if needed.
   */
  function navConversationComment(delta: number) {
    if (layoutMode === LAYOUT_DIFF) collapseDiff();
    const ordered = conversationCommentPageOrder();
    const cur =
      conversationCommentFocusRef.current?.anchor ||
      useModalStore.getState().focusedConversationAnchor ||
      null;
    const next =
      typeof stepConversationCommentFocus === 'function'
        ? stepConversationCommentFocus(ordered, cur, delta)
        : typeof pickConversationCommentFocusTarget === 'function'
          ? pickConversationCommentFocusTarget(ordered)
          : null;
    if (!next) {
      conversationCommentFocusRef.current = null;
      useModalStore.getState().requestConversationNav(null);
      return;
    }
    conversationCommentFocusRef.current = next;
    // Scroll first; leaf scroller promotes focus ring after scroll.
    useModalStore.getState().requestConversationNav(next.anchor);
  }

  function toggleViewedActiveFile() {
    const path = String(activeFilePath || '').trim();
    if (!path) return;
    onToggleViewed(path);
  }

  /** Apply Diff review-filter toggle (⌥U/R/P). */
  function applyReviewFilterToggle(
    target: 'unresolved' | 'resolved' | 'pending'
  ) {
    setDiffReviewFilter((prev) =>
      typeof toggleReviewFilter === 'function'
        ? toggleReviewFilter(prev, target)
        : prev === target
          ? null
          : target
    );
  }

  /**
   * Goto path:line[:line] or bare line[:line] — select file + line range.
   * Expands collapsed files first; if rows are not ready, queues pendingGotoRef
   * and re-applies after virtualRows rebuild (same pattern as comment jump).
   * @returns false when parse/apply failed (keep Goto open)
   */
  function applyGotoQuery(query: string): boolean {
    if (typeof parseGotoQuery !== 'function') return false;
    const parsed = parseGotoQuery(query);
    if (!parsed) {
      setActionMsg('Invalid Goto query. Use path:line[:line] or line[:line].');
      return false;
    }
    const path =
      typeof resolveGotoPathAmongFiles === 'function'
        ? resolveGotoPathAmongFiles(
            parsed.path,
            activeFilePath,
            displayFiles
          )
        : String(parsed.path || activeFilePath || '').trim() || null;
    if (!path) {
      setActionMsg('No file for Goto — open a file or include a path.');
      return false;
    }
    // Force-expand collapsed/viewed/default-collapsed so selectable rows rebuild
    setCollapsedFiles((prev) =>
      typeof expandPathInCollapsedSet === 'function'
        ? expandPathInCollapsedSet(prev, path, annotatedFiles, viewedPaths)
        : (() => {
            const n = materializeCollapsedPaths(
              prev,
              annotatedFiles,
              viewedPaths
            );
            n.delete(path);
            return n;
          })()
    );
    // Expand + activate file (may rebuild virtualRows async)
    onSelectFile(path);

    const pending = {
      path,
      startLine: parsed.startLine,
      endLine: parsed.endLine,
    };
    const result =
      typeof resolvePendingGotoSelection === 'function'
        ? resolvePendingGotoSelection(virtualRows, pending)
        : { status: 'missing' as const };

    if (result.status === 'ready' && result.selection) {
      pendingGotoRef.current = null;
      setLineSelection(result.selection);
      scrollSelectionIntoView(result.selection);
      setActionMsg('');
      return true;
    }

    if (result.status === 'waiting') {
      // File still collapsed / body not in virtualRows yet — re-apply after expand
      pendingGotoRef.current = pending;
      setActionMsg('');
      return true;
    }

    // Expanded but no selectable line, or unknown — still queue once so a
    // concurrent expand that lands next frame can succeed; effect fails cleanly.
    pendingGotoRef.current = pending;
    setActionMsg('');
    // Microtask: if rows already final and still missing, effect runs on next paint
    queueMicrotask(() => {
      try {
        const p = pendingGotoRef.current;
        if (!p || p.path !== path) return;
        const again =
          typeof resolvePendingGotoSelection === 'function'
            ? resolvePendingGotoSelection(
                // use latest store-driven rows from this render; effect handles later
                virtualRows,
                p
              )
            : { status: 'missing' as const };
        if (again.status === 'ready' && again.selection) {
          pendingGotoRef.current = null;
          setLineSelection(again.selection);
          scrollSelectionIntoView(again.selection);
        } else if (again.status === 'missing') {
          pendingGotoRef.current = null;
          setActionMsg(`No selectable line ${p.startLine} in ${p.path}.`);
        }
      } catch {
        /* ignore */
      }
    });
    return true;
  }

  function clearSelectionActionsTimer() {
    if (selectionActionsTimerRef.current != null) {
      clearTimeout(selectionActionsTimerRef.current);
      selectionActionsTimerRef.current = null;
    }
  }

  /**
   * Hide action toggles immediately; re-show after idle so key-hold stays light.
   * File-target composer stays immediate (caller sets show + phase).
   */
  function scheduleSelectionActionsReveal() {
    clearSelectionActionsTimer();
    if (useModalStore.getState().showSelectionComposer) {
      setShowSelectionComposer(false);
    }
    const delay =
      typeof SELECTION_ACTIONS_REVEAL_MS === 'number'
        ? SELECTION_ACTIONS_REVEAL_MS
        : 300;
    selectionActionsTimerRef.current = setTimeout(() => {
      selectionActionsTimerRef.current = null;
      const st = useModalStore.getState();
      if (!st.lineSelection || st.selecting) return;
      // File-level composer is shown explicitly; do not override phase here
      if (
        st.lineSelection.kind === 'file' ||
        st.lineSelection.subjectType === 'file'
      ) {
        return;
      }
      setSelectionIslandLeaving(false);
      setSelectionIslandPhase('actions');
      setShowSelectionComposer(true);
    }, delay);
  }

  /**
   * Keep selection head visible with **minimal** scroll — do not re-center.
   * Forcing scrollTopForIndex (quarter align) on every arrow key jumps the Diff
   * upward after file-nav pin and suddenly reveals the previous file.
   */
  function scrollSelectionHeadDomOnly(sel: any) {
    const headIdx = Number(sel?.headRowIndex);
    if (!Number.isFinite(headIdx) || headIdx < 0) return;
    try {
      const el = listRef.current as HTMLElement | null;
      const cur =
        el && typeof el.scrollTop === 'number'
          ? el.scrollTop
          : Number(useModalStore.getState().scrollTop) || 0;
      const vp =
        el && el.clientHeight > 0
          ? el.clientHeight
          : viewportHeightRef.current;
      // Sticky file header overlays the top of the Diff list (~ROW_HEIGHT).
      // Without padTop, ArrowUp pins the caret under that fixed bar.
      const stickyTop =
        typeof ROW_HEIGHT === 'number' && ROW_HEIGHT > 0 ? ROW_HEIGHT : avgH;
      const top =
        typeof scrollTopToRevealIndex === 'function'
          ? scrollTopToRevealIndex(
              headIdx,
              cur,
              avgH,
              vp,
              virtualRows.length,
              rowOffsetList,
              { padTop: stickyTop + 2, padBottom: 2 }
            )
          : cur;
      if (Math.abs(top - cur) < 0.5) return;
      if (el) el.scrollTop = top;
      // Only sync store on real jumps so App does not re-render every key
      const prev = Number(useModalStore.getState().scrollTop) || 0;
      if (Math.abs(prev - top) >= Math.max(24, avgH * 2)) {
        setScrollTop(top);
      }
    } catch {
      /* ignore */
    }
  }

  /** Expand a path if collapsed so selectable lines exist after cross-file hop. */
  function ensureFileExpandedForSelection(path: string) {
    const p = String(path || '').trim();
    if (!p) return;
    setCollapsedFiles((prev) => {
      const file = annotatedFiles.find(
        (f: any) => (f.filename || f.path) === p
      );
      if (
        !isPathCollapsed(
          p,
          prev,
          Boolean(file?.defaultCollapsed),
          false,
          viewedPaths
        )
      ) {
        return prev;
      }
      if (typeof expandPathInCollapsedSet === 'function') {
        return expandPathInCollapsedSet(
          prev,
          p,
          annotatedFiles,
          viewedPaths
        );
      }
      const n = materializeCollapsedPaths(prev, annotatedFiles, viewedPaths);
      n.delete(p);
      return n;
    });
  }

  /**
   * Sync tree active path when caret crosses files (do NOT call onSelectFile —
   * that clears selection and re-pins scroll to file start).
   */
  function syncActiveFileFromSelection(sel: any) {
    const path = String(sel?.filePath || '').trim();
    if (!path) return;
    const cur = String(useModalStore.getState().activeFilePath || '').trim();
    if (path === cur) return;
    setActiveFilePath(path);
    ensureFileExpandedForSelection(path);
    scrollFileNavRowIntoView(path);
  }

  function flushSelectionKeyboardMove(delta: number, shift: boolean) {
    if (typeof moveLineSelection !== 'function') return;
    const st = useModalStore.getState();
    const activePath = String(st.activeFilePath || '').trim();
    const prevSel = st.lineSelection;
    const nextSel =
      moveLineSelection(prevSel, virtualRows, delta, {
        shift,
        activeFilePath: activePath,
      }) || prevSel;

    // No-op: skip React / scroll work under key-hold against an edge
    const unchanged =
      nextSel === prevSel ||
      (prevSel &&
        nextSel &&
        Number(nextSel.headRowIndex) === Number(prevSel.headRowIndex) &&
        Number(nextSel.anchorRowIndex) === Number(prevSel.anchorRowIndex) &&
        String(nextSel.filePath || '') === String(prevSel.filePath || ''));

    // Single-file mode hop at EOF/BOF (not multi-line extend)
    if (
      unchanged &&
      !shift &&
      singleFileMode &&
      typeof resolveAdjacentFileNav === 'function'
    ) {
      const atEdge =
        typeof isSelectionAtFileEdge === 'function'
          ? isSelectionAtFileEdge(prevSel || nextSel, virtualRows, delta)
          : true;
      if (atEdge) {
        const d = delta < 0 ? -1 : 1;
        const adj = resolveAdjacentFileNav(displayFiles, activePath, d);
        if (adj.path && adj.path !== activePath) {
          pendingCrossFileSeedRef.current = {
            path: adj.path,
            edge: d > 0 ? 'first' : 'last',
          };
          setActiveFilePath(adj.path);
          ensureFileExpandedForSelection(adj.path);
          scrollFileNavRowIntoView(adj.path);
          setLineSelection(null);
          scheduleSelectionActionsReveal();
          return;
        }
      }
    }

    if (unchanged) {
      // Still keep actions hidden while holding against edge
      scheduleSelectionActionsReveal();
      return;
    }

    setLineSelection(nextSel);
    // Avoid setSelectionIslandLeaving every frame if already false
    if (useModalStore.getState().selectionIslandLeaving) {
      setSelectionIslandLeaving(false);
    }
    scheduleSelectionActionsReveal();
    // DOM scroll + light path sync after paint (not another React commit)
    queueMicrotask(() => {
      try {
        const sel = useModalStore.getState().lineSelection || nextSel;
        const prevPath = String(activePath || '');
        const nextPath = String(sel?.filePath || '');
        if (nextPath && nextPath !== prevPath) {
          syncActiveFileFromSelection(sel);
        }
        scrollSelectionHeadDomOnly(sel);
      } catch {
        /* ignore */
      }
    });
  }

  /**
   * Keyboard line move — rAF-coalesced under key-repeat so held arrows do not
   * thrash React with one update per OS keydown.
   */
  function applySelectionKeyboardMove(delta: number, shift: boolean) {
    const pending = pendingSelectionMoveRef.current;
    if (pending && pending.shift === Boolean(shift)) {
      pending.delta += delta;
    } else {
      pendingSelectionMoveRef.current = {
        delta,
        shift: Boolean(shift),
      };
    }
    if (selectionMoveRafRef.current) return;
    selectionMoveRafRef.current = requestAnimationFrame(() => {
      selectionMoveRafRef.current = 0;
      const p = pendingSelectionMoveRef.current;
      pendingSelectionMoveRef.current = null;
      if (!p || !p.delta) return;
      flushSelectionKeyboardMove(p.delta, p.shift);
    });
  }

  // Initialize / restore view state once per PR number (sessionStorage + initialRoute)
  useEffect(() => {
    if (!open || !detail?.owner || !detail?.repo || !detail?.number) return;
    const key = `${detail.owner}/${detail.repo}#${detail.number}`;
    if (routeRestoreKeyRef.current === key) return;
    routeRestoreKeyRef.current = key;
    positionAppliedRef.current = null;
    setRouteWriteReady(false);
    // Zustand survives host unmount — never carry focused comment into a new PR URI
    setCommentIndex(-1);

    let stored: any = null;
    try {
      if (typeof sessionStorage !== 'undefined') {
        stored = loadSessionView(sessionStorage, detail.owner, detail.repo, detail.number);
      }
    } catch {
      stored = null;
    }

    // Host/stack nav page wins so Diff↔Conversation is preserved when switching
    // stacked PRs (do not clobber with the target PR's stored session layout).
    const routePage = normalizePage(initialRoute?.page);
    if (routePage) {
      setLayoutMode(routePage === 'diff' ? LAYOUT_DIFF : LAYOUT_CENTERED);
    }

    // Commit filter restore runs via applyDiffCommitFilter effect below
    // (needs detail.commits for compare range). Do not half-set state here.

    if (stored) {
      if (
        !routePage &&
        (stored.layoutMode === 'diff' || stored.layoutMode === 'centered')
      ) {
        setLayoutMode(
          stored.layoutMode === 'diff' ? LAYOUT_DIFF : LAYOUT_CENTERED
        );
      }
      if (stored.diffMode === 'split' || stored.diffMode === 'unified') {
        setDiffMode(stored.diffMode);
      }
      if (Array.isArray(stored.collapsedFiles)) {
        setCollapsedFiles(new Set(stored.collapsedFiles));
      }
      if (Array.isArray(stored.viewedPaths)) {
        setViewedPaths(new Set(stored.viewedPaths));
      }
      if (stored.activeFilePath) setActiveFilePath(stored.activeFilePath);
    }

    // Allow URI writes after restore paints
    requestAnimationFrame(() => {
      setRouteWriteReady(true);
    });
  }, [
    open,
    detail?.owner,
    detail?.repo,
    detail?.number,
    initialRoute?.page,
    setLayoutMode,
    setDiffMode,
    setCollapsedFiles,
    setViewedPaths,
    setActiveFilePath,
    setCommentIndex,
  ]);

  // Inbound /changes/{sha}|{a}..{b} → full applyDiffCommitFilter (compare files + label)
  useEffect(() => {
    if (!open || !detail?.number) return;
    const filter = commitFilterFromGithubRoute(initialRoute || null);
    const key = `${detail.number}:${filter.mode}:${filter.sha || ''}:${filter.endSha || ''}`;
    if (ghCommitRouteAppliedRef.current === key) return;
    // Single/range need commits list to resolve compare base...head
    if (
      filter.mode !== 'all' &&
      (!Array.isArray(detail.commits) || detail.commits.length === 0)
    ) {
      return;
    }
    ghCommitRouteAppliedRef.current = key;
    void applyDiffCommitFilter(filter);
  }, [
    open,
    detail?.number,
    detail?.commits,
    initialRoute?.commitSha,
    initialRoute?.commitEndSha,
    applyDiffCommitFilter,
  ]);

  // Restore #diff-{key}R… line selection once files are available.
  // When inbound URL has no #diff-, clear zustand selection so URI write
  // does not re-emit a stale hash after soft-nav remount.
  useEffect(() => {
    if (!open || !detail?.number) return;
    const fileKey = initialRoute?.fileKey || null;
    const filePathHint = initialRoute?.filePath || null;
    const startLine = initialRoute?.startLine ?? null;
    const applyKey = `${detail.number}:${fileKey || ''}:${filePathHint || ''}:${startLine}:${initialRoute?.endLine ?? ''}`;
    if (ghSelectionAppliedRef.current === applyKey) return;

    if (!fileKey && !filePathHint) {
      ghSelectionAppliedRef.current = applyKey;
      setLineSelection(null);
      return;
    }

    const files =
      (Array.isArray(diffFilesOverride) && diffFilesOverride) ||
      (Array.isArray(detail.files) && detail.files) ||
      [];
    if (!files.length && !filePathHint) return;

    const path =
      (filePathHint && String(filePathHint)) ||
      findFilePathByDiffKey(files, fileKey) ||
      null;
    if (!path) return;

    ghSelectionAppliedRef.current = applyKey;
    setActiveFilePath(path);
    if (layoutMode !== LAYOUT_DIFF) setLayoutMode(LAYOUT_DIFF);

    if (startLine != null && Number(startLine) >= 1) {
      const end =
        initialRoute?.endLine != null &&
        Number(initialRoute.endLine) >= Number(startLine)
          ? Math.floor(Number(initialRoute.endLine))
          : Math.floor(Number(startLine));
      const side =
        String(initialRoute?.side || 'RIGHT').toUpperCase() === 'LEFT'
          ? 'LEFT'
          : 'RIGHT';
      setLineSelection({
        filePath: path,
        anchorLine: Math.floor(Number(startLine)),
        headLine: end,
        anchorSide: side,
        headSide: side,
      });
    } else {
      // File-level #diff-{key} without lines — clear line range selection
      setLineSelection(null);
    }
  }, [
    open,
    detail?.number,
    detail?.files,
    diffFilesOverride,
    initialRoute?.fileKey,
    initialRoute?.filePath,
    initialRoute?.startLine,
    initialRoute?.endLine,
    initialRoute?.side,
    layoutMode,
    setActiveFilePath,
    setLayoutMode,
    setLineSelection,
  ]);

  // Focus review comment/thread from URI/session position once comments map
  useEffect(() => {
    if (!open || !detail?.number) return;
    const pos = initialRoute?.position || null;
    if (!pos) return;
    const applyKey = `${detail.number}:${pos}`;
    if (positionAppliedRef.current === applyKey) return;
    if (!mappedComments.length) return;
    const idx = findCommentIndexByPosition(mappedComments, pos);
    if (idx < 0) return;
    positionAppliedRef.current = applyKey;
    // Position implies diff context
    if (layoutMode !== LAYOUT_DIFF) setLayoutMode(LAYOUT_DIFF);
    setCommentIndex(idx);
    const row = mappedComments[idx];
    if (row?.rowIndex != null) {
      const top = scrollTopForIndex(
        row.rowIndex,
        avgH,
        viewportHeightRef.current,
        virtualRows.length,
        rowOffsetList
      );
      setScrollTop(top);
      requestAnimationFrame(() => {
        if (listRef.current) listRef.current.scrollTop = top;
      });
    }
  }, [
    open,
    detail?.number,
    initialRoute?.position,
    mappedComments,
    layoutMode,
    avgH,
    viewportHeightRef.current,
    virtualRows.length,
    setLayoutMode,
    setCommentIndex,
    setScrollTop,
  ]);

  // Persist session view (layout/collapse) for refresh
  useEffect(() => {
    if (!open || !detail?.owner || !detail?.repo || !detail?.number) return;
    if (!routeWriteReady) return;
    try {
      if (typeof sessionStorage === 'undefined') return;
      saveSessionView(sessionStorage, detail.owner, detail.repo, detail.number, {
        layoutMode,
        diffMode,
        collapsedFiles,
        viewedPaths,
        activeFilePath,
      });
    } catch {
      /* ignore */
    }
  }, [
    open,
    detail?.owner,
    detail?.repo,
    detail?.number,
    layoutMode,
    diffMode,
    collapsedFiles,
    viewedPaths,
    activeFilePath,
    routeWriteReady,
  ]);

  // Sync URI + host session open snap.
  // Embed: GitHub /pull/N/changes[/{sha}|/{a}..{b}]#diff-…R…
  // List modal: legacy prp_* query params.
  // On close (open true → false), strip prp_* only for modal presentation.
  const uriWasOpenRef = useRef(false);
  useEffect(() => {
    if (!open || !detail?.number) {
      if (uriWasOpenRef.current) {
        uriWasOpenRef.current = false;
        if (!isEmbed) {
          try {
            if (typeof history !== 'undefined' && typeof location !== 'undefined') {
              clearLocationRoute(history, location);
            }
          } catch {
            /* ignore */
          }
        }
      }
      return;
    }
    if (!routeWriteReady) return;

    uriWasOpenRef.current = true;
    const page =
      layoutMode === LAYOUT_DIFF ? 'diff' : ('conversation' as const);
    let position: string | null = null;
    if (commentIndex >= 0 && mappedComments[commentIndex]) {
      position = buildPositionFromComment(mappedComments[commentIndex]);
    }

    const commits = githubCommitsFromFilter(diffCommitFilter);
    const sel =
      page === 'diff'
        ? githubSelectionFields(useModalStore.getState().lineSelection)
        : {
            filePath: null,
            startLine: null,
            endLine: null,
            side: null as 'LEFT' | 'RIGHT' | null,
          };
    const fileKey =
      page === 'diff' && sel.filePath ? githubDiffFileKey(sel.filePath) : null;

    const routePayload = {
      page,
      position,
      number: detail.number,
      commitSha: page === 'diff' ? commits.commitSha : null,
      commitEndSha: page === 'diff' ? commits.commitEndSha : null,
      filePath: sel.filePath,
      fileKey,
      startLine: sel.startLine,
      endLine: sel.endLine,
      side: sel.side,
    };

    // Fixture / non-extension: write location directly (no chrome.*)
    try {
      if (typeof history !== 'undefined' && typeof location !== 'undefined') {
        if (isEmbed && detail.owner && detail.repo) {
          replaceGithubPrLocation(history, location, {
            owner: detail.owner,
            repo: detail.repo,
            number: detail.number,
            page,
            commitSha: routePayload.commitSha,
            commitEndSha: routePayload.commitEndSha,
            filePath: routePayload.filePath,
            fileKey: routePayload.fileKey,
            startLine: routePayload.startLine,
            endLine: routePayload.endLine,
            side: routePayload.side,
          });
        } else {
          replaceLocationRoute(history, location, {
            page,
            number: detail.number,
            position,
          });
        }
      }
    } catch {
      /* ignore */
    }

    if (typeof onRouteChange === 'function') {
      onRouteChange(routePayload);
    }
  }, [
    open,
    detail?.number,
    detail?.owner,
    detail?.repo,
    layoutMode,
    commentIndex,
    mappedComments,
    onRouteChange,
    routeWriteReady,
    isEmbed,
    diffCommitFilter,
  ]);

  // Debounced URI/hash update when selection moves (no App re-render per caret)
  useEffect(() => {
    if (!open || !routeWriteReady || !detail?.number) return undefined;
    let timer = 0;
    const unsub = useModalStore.subscribe((state, prev) => {
      if (state.lineSelection === prev.lineSelection) return;
      if (state.layoutMode !== LAYOUT_DIFF) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        try {
          const sel = githubSelectionFields(
            useModalStore.getState().lineSelection
          );
          const commits = githubCommitsFromFilter(diffCommitFilter);
          const fileKey = sel.filePath
            ? githubDiffFileKey(sel.filePath)
            : null;
          if (typeof onRouteChange === 'function') {
            onRouteChange({
              page: 'diff',
              position: null,
              number: detail.number,
              commitSha: commits.commitSha,
              commitEndSha: commits.commitEndSha,
              filePath: sel.filePath,
              fileKey,
              startLine: sel.startLine,
              endLine: sel.endLine,
              side: sel.side,
            });
          }
        } catch {
          /* ignore */
        }
      }, 280);
    });
    return () => {
      unsub();
      window.clearTimeout(timer);
    };
  }, [open, routeWriteReady, detail?.number, onRouteChange, diffCommitFilter]);

  // Reset route restore markers when modal closes
  useEffect(() => {
    if (open) return undefined;
    routeRestoreKeyRef.current = null;
    positionAppliedRef.current = null;
    setRouteWriteReady(false);
    return undefined;
  }, [open]);

  /** Instant layout swap — keep-alive panels, no fade/scale on Diff ↔ Conversation. */
  function expandDiff(after?: any) {
    setAnimClass('');
    setLayoutMode(LAYOUT_DIFF);
    after?.();
  }

  function collapseDiff() {
    setAnimClass('');
    setLayoutMode(LAYOUT_CENTERED);
  }

  function onToggleDiff() {
    if (layoutMode === LAYOUT_DIFF) collapseDiff();
    else expandDiff();
  }

  /** Play exit animation, then notify host to unmount (modal + side sheet). */
  const requestClose = useCallback(() => {
    // Embed has no exit chrome — ignore close (Escape stays no-op for shell).
    if (isEmbed) return;
    if (closingRef.current || !open) return;
    closingRef.current = true;
    setClosing(true);
    // Drop deep-link params as soon as close starts (don't wait for anim end)
    try {
      if (typeof history !== 'undefined' && typeof location !== 'undefined') {
        clearLocationRoute(history, location);
      }
    } catch {
      /* ignore */
    }
    uriWasOpenRef.current = false;
    // Docked sheet slides out; fullscreen Diff / modal scale-fades out
    const sheetSlide =
      shellMode === SHELL_SHEET && layoutMode !== LAYOUT_DIFF;
    const duration = sheetSlide ? 240 : 280;
    setAnimClass(
      sheetSlide
        ? 'prp-modal--sheet-out'
        : 'prp-modal--animating prp-modal--anim-out'
    );
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      closingRef.current = false;
      setClosing(false);
      setAnimClass('');
      onClose?.();
    }, duration);
  }, [open, onClose, shellMode, layoutMode, setAnimClass, isEmbed]);

  /**
   * After close or merge (or soft-revalidate that flips state), auto-close the
   * centered modal or side sheet so the user returns to the pulls list.
   * Does not close when opening an already-closed/merged PR.
   */
  const terminalClosePrKeyRef = useRef('');
  const terminalCloseWasTerminalRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (!open) {
      terminalClosePrKeyRef.current = '';
      terminalCloseWasTerminalRef.current = null;
      return;
    }
    if (!detail) return;
    const key = `${detail.owner || ''}/${detail.repo || ''}#${detail.number}`;
    const isTerminal =
      Boolean(detail.merged) ||
      String(detail.state || '').toLowerCase() === 'closed';
    if (terminalClosePrKeyRef.current !== key) {
      terminalClosePrKeyRef.current = key;
      terminalCloseWasTerminalRef.current = isTerminal;
      return;
    }
    if (isTerminal && terminalCloseWasTerminalRef.current === false) {
      terminalCloseWasTerminalRef.current = true;
      requestClose();
      return;
    }
    terminalCloseWasTerminalRef.current = isTerminal;
  }, [open, detail, requestClose]);

  /**
   * One-shot enter animation when the shell opens.
   * Depends only on `open` (not loading/loadStage/detail) so progressive host
   * re-renders during fetch must not re-fire sheet/modal enter motion.
   */
  const enterAnimTokenRef = useRef(0);
  useEffect(() => {
    if (!open) {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      closingRef.current = false;
      setClosing(false);
      enterAnimTokenRef.current += 1;
      return;
    }
    if (isEmbed) {
      // Embed has no enter chrome animation
      if (!closingRef.current) setAnimClass('');
      return;
    }
    if (closingRef.current) return;

    const token = ++enterAnimTokenRef.current;
    // Capture shell at open — preference is already hydrated via useState init
    const sheetSlide =
      shellMode === SHELL_SHEET && layoutMode !== LAYOUT_DIFF;
    const enterClass = sheetSlide
      ? 'prp-modal--sheet-in'
      : 'prp-modal--animating prp-modal--anim-in';
    const duration = sheetSlide ? 250 : 290;
    setAnimClass(enterClass);
    const t = window.setTimeout(() => {
      if (enterAnimTokenRef.current !== token) return;
      if (!closingRef.current) setAnimClass('');
    }, duration);
    return () => {
      window.clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open-only; avoid load re-entry
  }, [open, isEmbed, setAnimClass]);

  // Lock document scroll while overlay is open so only the panel scrolls
  // (side sheet otherwise leaves a global scrollbar + nested scroll).
  // Embed fills GH main — leave document scroll alone.
  useEffect(() => {
    if (!open || isEmbed || typeof document === 'undefined') return undefined;
    const sbw =
      typeof window !== 'undefined' ? measureScrollbarWidth(window) : 0;
    const snap: ScrollLockSnapshot | null = applyScrollLock(document, {
      scrollbarWidth: sbw,
    });
    return () => {
      restoreScrollLock(document, snap);
    };
  }, [open, isEmbed]);

  function onToggleShell() {
    setShellMode((prev) => {
      const next = toggleShell(prev);
      try {
        if (typeof window !== 'undefined') {
          saveShellPref(resolveShellStorage(window), next);
        }
      } catch {
        /* ignore quota / private mode */
      }
      return next;
    });
  }

  function persistFileNav(next: FileNavPref) {
    try {
      if (typeof window !== 'undefined') {
        saveFileNavPref(resolveFileNavStorage(window), next);
      }
    } catch {
      /* ignore */
    }
  }

  function onToggleFileNavCollapse() {
    setFileNav((prev) => {
      const nextCollapsed = toggleFileNavCollapsed(prev.collapsed);
      // Expanding the files panel: load remaining file pages for search.
      if (prev.collapsed && !nextCollapsed) {
        void ensureAllFiles();
      }
      const next = {
        ...prev,
        collapsed: nextCollapsed,
        width: clampFileNavWidth(prev.width),
      };
      persistFileNav(next);
      return next;
    });
  }

  /** Conversation metadata-rail toggle (registered by ConversationView). */
  const asideToggleRef = useRef<(() => void) | null>(null);
  const onRegisterAsideToggle = useCallback((fn: (() => void) | null) => {
    asideToggleRef.current = typeof fn === 'function' ? fn : null;
  }, []);

  /**
   * Context-thread actions from ConversationView (fold/goto/comment/resolve).
   * Diff path is handled in App via commentIndex + mappedComments.
   */
  const contextThreadActionsRef = useRef<{
    fold: () => boolean;
    gotoDiff: () => boolean;
    comment: () => boolean;
    resolve: () => boolean;
  } | null>(null);
  const onRegisterContextThreadActions = useCallback(
    (
      api: {
        fold: () => boolean;
        gotoDiff: () => boolean;
        comment: () => boolean;
        resolve: () => boolean;
      } | null
    ) => {
      contextThreadActionsRef.current =
        api && typeof api.fold === 'function' ? api : null;
    },
    []
  );

  /**
   * ⌥B — Diff: files navigator; Conversation: metadata rail.
   */
  function toggleSidePanel() {
    if (layoutMode === LAYOUT_DIFF) {
      onToggleFileNavCollapse();
      return;
    }
    try {
      asideToggleRef.current?.();
    } catch {
      /* ignore */
    }
  }

  /** Active Diff review-thread unit (⌥J/K nav index) — always read live store. */
  function getActiveDiffContextThread(): any | null {
    const st = useModalStore.getState();
    if (st.layoutMode !== LAYOUT_DIFF) return null;
    const list = mappedComments;
    if (!list.length) return null;
    let idx = Number(st.commentIndex);
    if (!(idx >= 0 && idx < list.length) && st.activeDiffCommentId != null) {
      idx = list.findIndex(
        (c: any) => String(c?.id) === String(st.activeDiffCommentId)
      );
    }
    if (!(idx >= 0 && idx < list.length)) return null;
    return list[idx] || null;
  }

  /**
   * Ensure Diff has a context thread before fold/comment/resolve.
   * Seeds index 0 when user has not yet pressed ⌥J/K.
   */
  function ensureDiffContextThread(): any | null {
    let c = getActiveDiffContextThread();
    if (c) return c;
    const st = useModalStore.getState();
    if (st.layoutMode !== LAYOUT_DIFF || !mappedComments.length) return null;
    const first = mappedComments[0];
    if (!first || first.id == null) return null;
    setCommentIndex(0);
    useModalStore.getState().setActiveDiffCommentId(first.id);
    return first;
  }

  function runDiffContextThreadAction(
    kind: 'fold' | 'gotoDiff' | 'comment' | 'resolve'
  ): boolean {
    const c = ensureDiffContextThread();
    if (!c || c.id == null) return false;
    const id = c.id;
    const anchor = `review-comment:${id}`;
    const thread = threadsByCommentId?.get?.(String(id)) || null;
    const resolved = Boolean(thread?.resolved ?? c.resolved);
    const pending = Boolean(
      c.pending || thread?.pending || thread?.root?.pending
    );
    const threadNodeId =
      thread?.threadNodeId ||
      c.threadNodeId ||
      thread?.root?.threadNodeId ||
      null;

    if (kind === 'fold') {
      onToggleThreadCollapse(id, resolved);
      return true;
    }
    if (kind === 'gotoDiff') {
      // Already on Diff — re-reveal the active thread (scroll + expand file).
      jumpToReviewComment({
        id,
        path: c.path || thread?.root?.path || thread?.path,
        line: c.line ?? c.originalLine ?? thread?.root?.line ?? null,
        side: c.side || thread?.root?.side || 'RIGHT',
      });
      return true;
    }
    if (kind === 'comment') {
      if (isContextThreadReplyFocused(anchor)) {
        const drafts = useModalStore.getState().replyDrafts || {};
        const body = String(
          drafts[String(id)] ||
            (id != null ? drafts[String(Number(id))] : '') ||
            ''
        ).trim();
        if (!body) return false;
        void onReplyToThread(
          {
            id,
            path: c.path || thread?.root?.path,
            line: c.line ?? thread?.root?.line ?? null,
            side: c.side || thread?.root?.side || 'RIGHT',
            threadNodeId,
            root: thread?.root || c,
          },
          { mode: 'comment' }
        );
        return true;
      }
      // Ensure thread row is mounted/visible, expand, then focus reply.
      jumpToReviewComment({
        id,
        path: c.path || thread?.root?.path || thread?.path,
        line: c.line ?? c.originalLine ?? thread?.root?.line ?? null,
        side: c.side || thread?.root?.side || 'RIGHT',
      });
      if (isDiffThreadCollapsed(id, resolved)) {
        onToggleThreadCollapse(id, resolved);
      }
      focusContextThreadReplyAfterPaint(anchor);
      return true;
    }
    if (kind === 'resolve') {
      if (!threadNodeId || pending) return false;
      void onResolveThread(threadNodeId, !resolved);
      return true;
    }
    return false;
  }

  function runContextThreadAction(
    kind: 'fold' | 'gotoDiff' | 'comment' | 'resolve'
  ): boolean {
    // Prefer live store layout — keep-alive Conversation stays mounted on Diff.
    const liveLayout = useModalStore.getState().layoutMode;
    if (liveLayout === LAYOUT_DIFF) {
      return runDiffContextThreadAction(kind);
    }
    try {
      return Boolean(contextThreadActionsRef.current?.[kind]?.());
    } catch {
      return false;
    }
  }

  function onFileNavResizeStart(e: React.PointerEvent) {
    if (fileNav.collapsed) return;
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = clampFileNavWidth(fileNav.width);
    fileNavDragRef.current = { startX, startWidth };
    const target = e.currentTarget as HTMLElement;
    try {
      target.setPointerCapture?.(e.pointerId);
    } catch {
      /* ignore */
    }

    const onMove = (ev: PointerEvent) => {
      const drag = fileNavDragRef.current;
      if (!drag) return;
      const nextW = nextFileNavWidthFromDrag(drag.startWidth, ev.clientX - drag.startX);
      setFileNav((prev) => ({ ...prev, width: nextW, collapsed: false }));
    };
    const onUp = (ev: PointerEvent) => {
      fileNavDragRef.current = null;
      try {
        target.releasePointerCapture?.(ev.pointerId);
      } catch {
        /* ignore */
      }
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      setFileNav((prev) => {
        const next = { ...prev, width: clampFileNavWidth(prev.width) };
        persistFileNav(next);
        return next;
      });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }

  function viewportSize() {
    if (typeof window === 'undefined') {
      return { viewportWidth: undefined as number | undefined, viewportHeight: undefined as number | undefined };
    }
    return { viewportWidth: window.innerWidth, viewportHeight: window.innerHeight };
  }

  function persistSheetWidth(w: number) {
    try {
      if (typeof window !== 'undefined') {
        saveSheetWidth(resolveShellSizeStorage(window), w);
      }
    } catch {
      /* ignore */
    }
  }

  function persistModalSize(size: ModalShellSize) {
    try {
      if (typeof window !== 'undefined') {
        saveModalSize(resolveShellSizeStorage(window), size);
      }
    } catch {
      /* ignore */
    }
  }

  function onToggleShellFullscreen() {
    setShellFullscreen((prev) => toggleShellFullscreen(prev));
  }

  function onSheetResizeStart(e: React.PointerEvent) {
    if (shellMode !== SHELL_SHEET) return;
    if (layoutMode === LAYOUT_DIFF) return;
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const { viewportWidth } = viewportSize();
    // Fullscreen → windowed: start at full viewport width so the left edge
    // tracks the handle immediately (natural shrink from full-bleed).
    const fromFs = Boolean(shellFullscreen);
    const startWidth = clampSheetWidth(
      fromFs ? viewportWidth : sheetWidth,
      { viewportWidth }
    );
    if (fromFs) {
      setShellFullscreen(false);
      setSheetWidth(startWidth);
      setShellFullscreenHint(true);
    }
    // Persistable width to keep if we re-enter fullscreen on release
    const widthBeforeGesture = clampSheetWidth(sheetWidth, { viewportWidth });
    shellResizeDragRef.current = { kind: 'sheet', startX, startWidth };
    setShellResizing(true);
    const target = e.currentTarget as HTMLElement;
    try {
      target.setPointerCapture?.(e.pointerId);
    } catch {
      /* ignore */
    }
    const endDrag = (ev?: PointerEvent) => {
      shellResizeDragRef.current = null;
      setShellResizing(false);
      setShellFullscreenHint(false);
      if (ev) {
        try {
          target.releasePointerCapture?.(ev.pointerId);
        } catch {
          /* ignore */
        }
      }
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    const onMove = (ev: PointerEvent) => {
      const drag = shellResizeDragRef.current;
      if (!drag || drag.kind !== 'sheet') return;
      const vw = typeof window !== 'undefined' ? window.innerWidth : viewportWidth;
      // During drag only resize — fullscreen waits until pointerup (handle release).
      const nextW = nextSheetWidthFromDrag(drag.startWidth, drag.startX, ev.clientX, {
        viewportWidth: vw,
      });
      setSheetWidth(nextW);
      setShellFullscreenHint(
        typeof sheetWidthHitsFullscreen === 'function' &&
          sheetWidthHitsFullscreen(nextW, vw, SHELL_FULLSCREEN_EDGE_PX)
      );
    };
    const onUp = (ev: PointerEvent) => {
      endDrag(ev);
      setSheetWidth((prev) => {
        const vw = typeof window !== 'undefined' ? window.innerWidth : undefined;
        const next = clampSheetWidth(prev, { viewportWidth: vw });
        // Promote to fullscreen only when the handle is released in the snap zone.
        // Keep a usable windowed width for the next exit (pre-gesture, not full vw).
        if (
          typeof sheetWidthHitsFullscreen === 'function' &&
          sheetWidthHitsFullscreen(next, vw, SHELL_FULLSCREEN_EDGE_PX)
        ) {
          setShellFullscreen(true);
          const keep = fromFs ? widthBeforeGesture : startWidth;
          persistSheetWidth(keep);
          return keep;
        }
        persistSheetWidth(next);
        return next;
      });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }

  function onModalResizeStart(e: React.PointerEvent) {
    if (shellMode !== SHELL_MODAL) return;
    if (layoutMode === LAYOUT_DIFF) return;
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const { viewportWidth, viewportHeight } = viewportSize();
    // Fullscreen → windowed: start at full viewport so SE corner tracks the handle.
    const fromFs = Boolean(shellFullscreen);
    const start = clampModalSize(
      fromFs
        ? { width: viewportWidth, height: viewportHeight }
        : modalSize,
      { viewportWidth, viewportHeight }
    );
    const sizeBeforeGesture = clampModalSize(modalSize, {
      viewportWidth,
      viewportHeight,
    });
    if (fromFs) {
      setShellFullscreen(false);
      setModalSize(start);
      setShellFullscreenHint(true);
    }
    shellResizeDragRef.current = { kind: 'modal', startX, startY, start };
    setShellResizing(true);
    if (!fromFs) setShellFullscreenHint(false);
    const target = e.currentTarget as HTMLElement;
    try {
      target.setPointerCapture?.(e.pointerId);
    } catch {
      /* ignore */
    }
    const endDrag = (ev?: PointerEvent) => {
      shellResizeDragRef.current = null;
      setShellResizing(false);
      setShellFullscreenHint(false);
      if (ev) {
        try {
          target.releasePointerCapture?.(ev.pointerId);
        } catch {
          /* ignore */
        }
      }
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    const onMove = (ev: PointerEvent) => {
      const drag = shellResizeDragRef.current;
      if (!drag || drag.kind !== 'modal') return;
      const vw = typeof window !== 'undefined' ? window.innerWidth : viewportWidth;
      const vh = typeof window !== 'undefined' ? window.innerHeight : viewportHeightRef.current;
      const next = nextModalSizeFromDrag(
        drag.start,
        ev.clientX - drag.startX,
        ev.clientY - drag.startY,
        {
          viewportWidth: vw,
          viewportHeight: vh,
        }
      );
      setModalSize(next);
      setShellFullscreenHint(
        typeof modalSizeHitsFullscreen === 'function' &&
          modalSizeHitsFullscreen(next, vw, vh, SHELL_FULLSCREEN_EDGE_PX)
      );
    };
    const onUp = (ev: PointerEvent) => {
      endDrag(ev);
      setModalSize((prev) => {
        const vw = typeof window !== 'undefined' ? window.innerWidth : undefined;
        const vh = typeof window !== 'undefined' ? window.innerHeight : undefined;
        const next = clampModalSize(prev, {
          viewportWidth: vw,
          viewportHeight: vh,
        });
        // Release in snap zone → fullscreen; keep a windowed size for next exit.
        if (
          typeof modalSizeHitsFullscreen === 'function' &&
          modalSizeHitsFullscreen(next, vw, vh, SHELL_FULLSCREEN_EDGE_PX)
        ) {
          setShellFullscreen(true);
          const keep = fromFs ? sizeBeforeGesture : start;
          persistModalSize(keep);
          return keep;
        }
        persistModalSize(next);
        return next;
      });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }

  // Re-apply saved shell + sizes + file nav when modal opens (next PR / reopen)
  useEffect(() => {
    if (!open) return;
    try {
      if (typeof window === 'undefined') return;
      const stored = loadShellPref(resolveShellStorage(window));
      setShellMode(normalizeShell(stored));
      setFileNav(loadFileNavPref(resolveFileNavStorage(window)));
      const sizeStore = resolveShellSizeStorage(window);
      setSheetWidth(
        loadSheetWidth(sizeStore, { viewportWidth: window.innerWidth })
      );
      setModalSize(
        loadModalSize(sizeStore, {
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
        })
      );
      // Fullscreen is session-only; reset on each open for a predictable shell.
      setShellFullscreen(false);
      setShellFullscreenHint(false);
    } catch {
      /* ignore */
    }
  }, [open]);

  function onSelectFile(path: any) {
    setActiveFilePath(path);
    // Drop prior-file line selection so the next Arrow seeds the first
    // selectable (displayed) line of this file.
    clearSelectionActionsTimer();
    if (selectionMoveRafRef.current) {
      cancelAnimationFrame(selectionMoveRafRef.current);
      selectionMoveRafRef.current = 0;
    }
    pendingSelectionMoveRef.current = null;
    selectingRef.current = false;
    setSelecting(false);
    setLineSelection(null);
    setShowSelectionComposer(false);
    setSelectionIslandLeaving(false);
    setSelectionIslandPhase('actions');
    // Auto-expand collapsed file when selected from tree (including defaults/viewed).
    // Use expandPathInCollapsedSet so emptying the set does not re-collapse
    // the path via isPathCollapsed's empty-set + viewedPaths branch.
    setCollapsedFiles((prev) => {
      const file = annotatedFiles.find(
        (f: any) => (f.filename || f.path) === path
      );
      if (
        !isPathCollapsed(
          path,
          prev,
          Boolean(file?.defaultCollapsed),
          false,
          viewedPaths
        )
      ) {
        return prev;
      }
      if (typeof expandPathInCollapsedSet === 'function') {
        return expandPathInCollapsedSet(
          prev,
          path,
          annotatedFiles,
          viewedPaths
        );
      }
      const n = materializeCollapsedPaths(prev, annotatedFiles, viewedPaths);
      n.delete(path);
      return n;
    });
    const idx = fileStarts.get(path);
    if (typeof idx === 'number') {
      // Pin file header to the first line of the Diff scrollport
      const top = scrollTopForIndex(
        idx,
        avgH,
        viewportHeightRef.current,
        virtualRows.length,
        rowOffsetList,
        { align: 'start' }
      );
      setScrollTop(top);
      if (listRef.current) listRef.current.scrollTop = top;
    }
    // Keep left nav focus visible when stepping to an off-screen file
    scrollFileNavRowIntoView(String(path || ''));
  }

  function onToggleDir(path: any) {
    setExpandedDirs((prev) => {
      const n = new Set(prev);
      if (n.has(path)) n.delete(path);
      else n.add(path);
      return n;
    });
  }

  function onToggleFileCollapse(path: any) {
    // Materialize defaults first so toggling one path does not open every
    // other binary/huge/generated/viewed file that only collapsed via defaults.
    setCollapsedFiles((prev) => {
      const n = materializeCollapsedPaths(prev, annotatedFiles, viewedPaths);
      if (n.has(path)) n.delete(path);
      else n.add(path);
      return n;
    });
  }

  function focusCommentBox() {
    try {
      const el = commentBoxRef.current;
      const editor =
        el?.querySelector?.('.prp-wysi__editor') ||
        el?.querySelector?.('.prp-wysi__ghost') ||
        el?.querySelector?.('textarea');
      if (editor) {
        editor.focus?.();
        editor.click?.();
        return;
      }
      el?.scrollIntoView?.({ block: 'nearest' });
    } catch {
      /* ignore */
    }
  }

  function isEditableKeyboardTarget(el: EventTarget | null) {
    if (!el || typeof el !== 'object') return false;
    const node = el as HTMLElement;
    const tag = String(node.tagName || '').toUpperCase();
    if (tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT') return true;
    if (node.isContentEditable) return true;
    return Boolean(node.closest?.('textarea, input, select, [contenteditable="true"]'));
  }

  function focusConversationCommentItem() {
    // Always land on conversation layout so the timeline is visible.
    // Scroll then focus via ConversationKbFocusScroller (leaf store sub).
    if (layoutMode === LAYOUT_DIFF) collapseDiff();
    const ordered = conversationCommentPageOrder();
    const target =
      typeof pickConversationCommentFocusTarget === 'function'
        ? pickConversationCommentFocusTarget(ordered)
        : null;
    if (!target) {
      conversationCommentFocusRef.current = null;
      useModalStore.getState().requestConversationNav(null);
      return;
    }
    conversationCommentFocusRef.current = target;
    useModalStore.getState().requestConversationNav(target.anchor);
  }

  function clearConversationCommentFocus() {
    conversationCommentFocusRef.current = null;
    useModalStore.getState().requestConversationNav(null);
  }

  function dismissSelectionIsland(after?: any) {
    clearSelectionActionsTimer();
    setSelectionIslandLeaving(true);
    setTimeout(() => {
      setShowSelectionComposer(false);
      setLineSelection(null);
      setSelectionDraft('');
      setSelectionIslandPhase('actions');
      setSelectionIslandLeaving(false);
      after?.();
    }, 200);
  }

  async function copySelectionCode() {
    const sel = useModalStore.getState().lineSelection;
    if (!sel) return false;
    const text =
      typeof extractSelectedCodeText === 'function'
        ? extractSelectedCodeText(virtualRows, sel)
        : '';
    if (!text) {
      setActionMsg('No code in selection');
      return false;
    }
    const ok = await copyTextToClipboard(text);
    setActionMsg(ok ? 'Code copied' : 'Copy failed');
    return ok;
  }

  async function copySelectionUrl() {
    const sel = useModalStore.getState().lineSelection;
    if (!sel || !detail) return false;
    const norm =
      typeof normalizeSelection === 'function' ? normalizeSelection(sel) : null;
    if (!norm) return false;
    const url =
      typeof githubBlobLinePermalink === 'function'
        ? githubBlobLinePermalink({
            owner: detail.owner,
            repo: detail.repo,
            path: norm.filePath,
            startLine: norm.startLine,
            endLine: norm.endLine,
            side: norm.endSide,
            headSha: detail.headSha,
            headRef: detail.headRef,
            baseSha: detail.baseSha,
            baseRef: detail.baseRef,
          })
        : '';
    if (!url) {
      setActionMsg('Could not build URL');
      return false;
    }
    const ok = await copyTextToClipboard(url);
    setActionMsg(ok ? 'URL copied' : 'Copy failed');
    return ok;
  }

  function closePicker() {
    setPicker(null);
    pickerAnchorRef.current = null;
  }

  function collectPeopleLogins(exclude = []) {
    const excludeSet = new Set((exclude || []).map((x) => String(x || '').toLowerCase()));
    const names = new Set();
    const add = (login) => {
      const raw = String(login || '').trim();
      if (!raw || excludeSet.has(raw.toLowerCase())) return;
      names.add(raw);
    };
    if (detail?.author) add(detail.author);
    for (const r of detail?.requestedReviewers || []) add(r);
    for (const a of detail?.assignees || []) add(a);
    for (const r of detail?.reviews || []) if (r?.author) add(r.author);
    for (const c of detail?.comments || []) if (c?.author) add(c.author);
    for (const c of detail?.reviewComments || []) if (c?.author) add(c.author);
    for (const p of openPulls || []) if (p?.author) add(p.author);
    return [...names];
  }



  /**
   * Unified pending model: only GitHub PENDING review (no separate local batch).
   * Count is **thread** units (roots), not individual pending replies.
   */
  const serverPendingComments = useMemo(() => {
    const list = detail?.reviewComments || [];
    return list.filter((c: any) => c && c.pending);
  }, [detail?.reviewComments]);
  const pendingCount = useMemo(() => {
    if (typeof countPendingReviewThreads === 'function') {
      return countPendingReviewThreads(detail?.reviewComments || []);
    }
    // Fallback: roots only (no parent in the set)
    const list = detail?.reviewComments || [];
    const byId = new Map(
      list.filter((c: any) => c?.id != null).map((c: any) => [String(c.id), c])
    );
    return list.filter((c: any) => {
      if (!c?.pending) return false;
      const parentId = c.inReplyToId ?? c.in_reply_to_id ?? null;
      if (parentId != null && byId.has(String(parentId))) return false;
      return true;
    }).length;
  }, [detail?.reviewComments]);
  const serverPendingReviewId =
    detail?.viewerPendingReview?.id ||
    serverPendingComments.find((c: any) => c.pendingReviewId)?.pendingReviewId ||
    null;
  const hasServerPending = Boolean(serverPendingReviewId) || pendingCount > 0;
  /** Thread-level pending count (same as pendingCount; kept for Diff toolbar props). */
  const totalPendingCount = pendingCount;

  // Clear review filter when the active mode has nothing left.
  // Use path counts + comment count so a brief host refresh race (pending
  // rows stripped then restored) does not wipe the Pending toggle mid-click.
  useEffect(() => {
    if (!diffReviewFilter) return;
    if (diffReviewFilter === 'pending') {
      const hasPendingPaths = hasAnyReviewThreads(pendingThreadCounts);
      if (totalPendingCount === 0 && !hasPendingPaths) {
        setDiffReviewFilter(null);
      }
      return;
    }
    if (!hasAnyReviewThreads(threadCounts) && totalPendingCount === 0) {
      setDiffReviewFilter(null);
    }
  }, [threadCounts, pendingThreadCounts, diffReviewFilter, totalPendingCount]);

  /**
   * Leave a review (Diff Finish modal / Conversation Review tab / shortcuts).
   * @param kind 'comment' | 'approve' | 'request_changes' | 'issue-comment'
   * @param opts.body optional body override (Finish modal); else Conversation commentText
   * @returns true when the action succeeded
   */
  async function onLeaveReviewAction(
    kind: any,
    opts?: { body?: string } | null
  ): Promise<boolean> {
    if (!detail) return false;
    // Always bind fetch bridge first — never reference bare `api`
    const fetchApi = globalThis.PRTreeFetch;
    if (!fetchApi) {
      setActionMsg(
        'Extension bridge unavailable (PRTreeFetch). Refresh this GitHub tab after reloading pr+.'
      );
      return false;
    }
    // Own PR: GitHub 422s APPROVE / REQUEST_CHANGES — hide + hard-block
    if (
      typeof isReviewVerdictKind === 'function' &&
      isReviewVerdictKind(kind) &&
      typeof isViewerPrAuthor === 'function' &&
      isViewerPrAuthor(detail)
    ) {
      setActionMsg('Cannot approve or request changes on your own pull request.');
      return false;
    }
    const body =
      opts && opts.body != null
        ? String(opts.body).trim()
        : String(useModalStore.getState().commentText || '').trim();
    // Explicit issue-comment (Conversation "Comment" tab) — never submit PENDING
    const forceIssueComment =
      kind === 'issue-comment' || kind === 'post-comment' || kind === 'comment-only';

    const mapped =
      typeof mapLeaveReviewAction === 'function'
        ? mapLeaveReviewAction(kind)
        : kind === 'approve'
          ? { kind: 'review', event: 'APPROVE' }
          : kind === 'request_changes'
            ? { kind: 'review', event: 'REQUEST_CHANGES' }
            : { kind: 'issue-comment', event: 'COMMENT' };

    // Plain conversation comment — only when explicitly forced (Comment tab).
    // Diff "Submit review" / Review-tab Comment always use the PR review path
    // (submitPendingPullReview or one-shot submitPullReview), even with 0 pending.
    if (forceIssueComment) {
      if (!body) {
        setActionMsg('Write a comment first.');
        focusCommentBox();
        return false;
      }
      setActionBusy(true);
      setActionMsg('');
      try {
        if (!fetchApi.postIssueComment) throw new Error('Comment API unavailable');
        const raw = await fetchApi.postIssueComment(
          detail.owner,
          detail.repo,
          detail.number,
          body
        );
        const optimistic = mapRestIssueComment(raw, {
          body,
          author: detail.viewerLogin || '',
        });
        if (optimistic) {
          setLocalDetail((prev) =>
            prev
              ? {
                  ...prev,
                  comments: [...(prev.comments || []), optimistic],
                }
              : prev
          );
        }
        setCommentText('');
        setActionMsg('Comment posted.');
        await onRefresh?.();
        return true;
      } catch (err: any) {
        setActionMsg(err?.message || String(err));
        return false;
      } finally {
        setActionBusy(false);
      }
    }

    // Review path: submit existing PENDING review, or create one-shot review.
    // Empty body + no pending items → nothing to submit (Comment / Approve / RC).
    const event =
      mapped.kind === 'issue-comment' ? 'COMMENT' : mapped.event || 'COMMENT';
    if (!body && !hasServerPending) {
      setActionMsg(
        'Write a comment or add pending review comments before submitting.'
      );
      focusCommentBox();
      return false;
    }

    // Resolve PENDING review id (viewerPendingReview or any pending comment)
    const pendingReviewId =
      serverPendingReviewId ||
      detail?.viewerPendingReview?.id ||
      serverPendingComments.find((c: any) => c?.pendingReviewId != null)
        ?.pendingReviewId ||
      null;

    setActionBusy(true);
    setActionMsg('');
    try {
      if (hasServerPending || pendingReviewId) {
        if (!pendingReviewId) {
          throw new Error(
            'Pending review comments exist but no review id is available. Refresh and try again.'
          );
        }
        if (!fetchApi.submitPendingPullReview) {
          throw new Error('Submit pending review API unavailable');
        }
        await fetchApi.submitPendingPullReview(
          detail.owner,
          detail.repo,
          detail.number,
          pendingReviewId,
          { event, body }
        );
      } else if (fetchApi.submitPullReview) {
        // No PENDING review: one-shot Approve / Request changes / Comment review
        await fetchApi.submitPullReview(detail.owner, detail.repo, detail.number, {
          event,
          body,
          commitId: detail.headSha,
          comments: [],
        });
      } else {
        throw new Error('Review API unavailable');
      }
      if (!(opts && opts.body != null)) {
        setCommentText('');
      }
      // Clear any legacy local batch if present
      setPendingReview(
        typeof discardPendingReview === 'function'
          ? discardPendingReview()
          : { comments: [], body: '' }
      );
      forceDropPendingRef.current = true;
      setLocalDetail((prev) =>
        typeof stripPendingReviewFromDetail === 'function'
          ? stripPendingReviewFromDetail(prev)
          : prev
            ? { ...prev, viewerPendingReview: null }
            : prev
      );
      setActionMsg(
        event === 'APPROVE'
          ? 'Approved.'
          : event === 'REQUEST_CHANGES'
            ? 'Requested changes.'
            : hasServerPending || pendingReviewId
              ? 'Pending review submitted.'
              : 'Review submitted.'
      );
      await onRefresh?.();
      return true;
    } catch (err: any) {
      setActionMsg(err?.message || String(err));
      return false;
    } finally {
      setActionBusy(false);
    }
  }

  async function onSaveBody(body: any) {
    if (!detail) return;
    setActionBusy(true);
    setActionMsg('');
    try {
      const api = globalThis.PRTreeFetch;
      if (!api?.updatePullRequest) throw new Error('Update PR API unavailable');
      await api.updatePullRequest(detail.owner, detail.repo, detail.number, { body });
      setEditingBody(false);
      setActionMsg('Description updated.');
      await onRefresh?.();
    } catch (err) {
      setActionMsg(err?.message || String(err));
    } finally {
      setActionBusy(false);
    }
  }

  async function onSaveEditComment(kind, id, body) {
    if (!detail || id == null) return;
    setActionBusy(true);
    setActionMsg('');
    try {
      const api = globalThis.PRTreeFetch;
      if (kind === 'issue') {
        if (!api?.editIssueComment) throw new Error('Edit comment API unavailable');
        await api.editIssueComment(detail.owner, detail.repo, id, body);
      } else {
        if (!api?.editReviewComment) throw new Error('Edit review comment API unavailable');
        await api.editReviewComment(detail.owner, detail.repo, id, body);
      }
      setEditingComment(null);
      setActionMsg('Comment updated.');
      await onRefresh?.();
    } catch (err) {
      setActionMsg(err?.message || String(err));
    } finally {
      setActionBusy(false);
    }
  }

  async function applyBaseChange(base: any) {
    if (!detail) return;
    const next = String(base || '').trim();
    if (!next || next === detail.baseRef) return;
    setActionBusy(true);
    setActionMsg('');
    try {
      const api = globalThis.PRTreeFetch;
      if (!api?.updatePullRequest) throw new Error('Update PR API unavailable');
      await api.updatePullRequest(detail.owner, detail.repo, detail.number, { base: next });
      setLocalDetail((prev) => (prev ? { ...prev, baseRef: next } : prev));
      setActionMsg(`Base branch changed to ${next}.`);
      await onRefresh?.();
    } catch (err) {
      setActionMsg(err?.message || String(err));
    } finally {
      setActionBusy(false);
    }
  }

  function openBasePicker() {
    if (!detail) return;
    const options =
      typeof buildBranchOptions === 'function'
        ? buildBranchOptions(openPulls, {
            baseRef: detail.baseRef,
            headRef: detail.headRef,
          })
        : [];
    pickerAnchorRef.current = baseBranchRef.current;
    setPicker({
      type: 'base',
      title: 'Change base branch',
      options,
      // Empty query so full branch list is visible; free-text still allowed.
      query: '',
      allowFreeText: true,
      placeholder: detail.baseRef ? `Current: ${detail.baseRef}` : 'Filter or type a branch…',
      onPick: (opt) => {
        closePicker();
        void applyBaseChange(opt?.id || opt?.label);
      },
    });
  }

  async function applyAddReviewer(login: any) {
    if (!detail || !login) return;
    const name = String(login).trim();
    if (!name) return;
    setActionBusy(true);
    setActionMsg('');
    try {
      const api = globalThis.PRTreeFetch;
      if (!api?.requestReviewers) throw new Error('Request reviewers API unavailable');
      const result = await api.requestReviewers(
        detail.owner,
        detail.repo,
        detail.number,
        [name]
      );
      // Prefer API payload when present; otherwise optimistic merge.
      const fromApi = mapRequestedReviewersFromApi(result, []);
      const existing = Array.isArray(detail.requestedReviewers)
        ? detail.requestedReviewers.slice()
        : [];
      const merged = [...existing];
      if (!merged.some((x) => String(x).toLowerCase() === name.toLowerCase())) {
        merged.push(name);
      }
      const requestedReviewers = fromApi.length ? fromApi : merged;
      commitMetaPatch({
        requestedReviewers,
        avatarUrls: mergeAvatarUrls(detail, result, requestedReviewers),
      });
      setActionMsg(`Requested review from ${name}.`);
    } catch (err) {
      setActionMsg(err?.message || String(err));
    } finally {
      setActionBusy(false);
    }
  }

  function openReviewerPicker() {
    if (!detail) return;
    const exclude = detail.requestedReviewers || [];
    const logins = collectPeopleLogins(exclude);
    const options =
      typeof buildPeopleOptions === 'function'
        ? buildPeopleOptions(logins, {}, detail.avatarUrls || {})
        : logins.map((id) => ({
            id,
            label: id,
            meta: { login: id, kind: 'user', avatarUrl: detail.avatarUrls?.[String(id).toLowerCase()] || '' },
          }));
    pickerAnchorRef.current = reviewerAddRef.current;
    setPicker({
      type: 'reviewer',
      title: 'Add reviewer',
      options,
      query: '',
      allowFreeText: true,
      onPick: (opt) => {
        closePicker();
        void applyAddReviewer(opt?.id || opt?.label);
      },
    });
  }

  async function onRemoveReviewer(login: any) {
    if (!detail || !login) return;
    if (
      typeof isBotAccount === 'function'
        ? isBotAccount(login, detail)
        : /\[bot\]$/i.test(String(login || ''))
    ) {
      setActionMsg(`Cannot remove bot reviewer ${login}.`);
      return;
    }
    if (
      !confirmGateProceed(
        await requestConfirm({
          title: 'Remove reviewer?',
          message: `Remove reviewer ${login}?`,
          confirmLabel: 'Remove',
          tone: 'danger',
        })
      )
    ) {
      return;
    }
    setActionBusy(true);
    setActionMsg('');
    try {
      const api = globalThis.PRTreeFetch;
      if (!api?.removeReviewers) throw new Error('Remove reviewers API unavailable');
      const result = await api.removeReviewers(
        detail.owner,
        detail.repo,
        detail.number,
        [login]
      );
      const fromApi = mapRequestedReviewersFromApi(result, []);
      const requestedReviewers = fromApi.length
        ? fromApi
        : (detail.requestedReviewers || []).filter(
            (x) => String(x).toLowerCase() !== String(login).toLowerCase()
          );
      commitMetaPatch({ requestedReviewers });
      setActionMsg(`Removed reviewer ${login}.`);
    } catch (err) {
      setActionMsg(err?.message || String(err));
    } finally {
      setActionBusy(false);
    }
  }

  function mapRequestedReviewersFromApi(result: any, fallback: string[] = []) {
    // POST/DELETE requested_reviewers → { users: User[], teams: Team[] }
    const users = Array.isArray(result?.users)
      ? result.users
      : Array.isArray(result?.requested_reviewers)
        ? result.requested_reviewers
        : Array.isArray(result)
          ? result
          : null;
    if (!users) return fallback;
    return users
      .map((u: any) => (typeof u === 'string' ? u : u?.login || ''))
      .map((s: string) => String(s).trim())
      .filter(Boolean);
  }

  function mapAssigneesFromApi(result: any, fallback: string[] = []) {
    if (Array.isArray(result?.assignees)) {
      return result.assignees
        .map((u: any) => (typeof u === 'string' ? u : u?.login || ''))
        .map((s: string) => String(s).trim())
        .filter(Boolean);
    }
    if (Array.isArray(result) && result.every((x) => typeof x === 'string' || x?.login)) {
      return result
        .map((u: any) => (typeof u === 'string' ? u : u?.login || ''))
        .map((s: string) => String(s).trim())
        .filter(Boolean);
    }
    return fallback;
  }

  function mapLabelsFromApi(result: any, fallback: any[] = []) {
    // PUT labels returns Label[] directly
    const list = Array.isArray(result)
      ? result
      : Array.isArray(result?.labels)
        ? result.labels
        : null;
    if (!list) return fallback;
    return list
      .map((l: any) => {
        if (typeof l === 'string') return { name: l, color: '' };
        const name = String(l?.name || '').trim();
        if (!name) return null;
        return {
          name,
          color: l.color || '',
          description: l.description || '',
        };
      })
      .filter(Boolean);
  }

  function mergeAvatarUrls(prev: any, result: any, logins: string[] = []) {
    const map = {
      ...(prev?.avatarUrls && typeof prev.avatarUrls === 'object' ? prev.avatarUrls : {}),
    };
    for (const u of result?.assignees || []) {
      const login = u?.login || '';
      if (login && u?.avatar_url) map[String(login).toLowerCase()] = u.avatar_url;
    }
    for (const u of result?.users || []) {
      const login = u?.login || '';
      if (login && u?.avatar_url) map[String(login).toLowerCase()] = u.avatar_url;
    }
    for (const login of logins) {
      const key = String(login).toLowerCase();
      if (!map[key] && prev?.avatarUrls?.[key]) map[key] = prev.avatarUrls[key];
    }
    return map;
  }

  /**
   * After a successful meta write (labels / assignees / reviewers / milestone),
   * update local + host cache only — never re-fetch full PR detail.
   */
  function commitMetaPatch(patch: Record<string, unknown>) {
    const base = detail;
    if (!base) return;
    const next = {
      ...base,
      ...patch,
      avatarUrls: {
        ...(base.avatarUrls && typeof base.avatarUrls === 'object' ? base.avatarUrls : {}),
        ...(patch.avatarUrls && typeof patch.avatarUrls === 'object'
          ? (patch.avatarUrls as Record<string, string>)
          : {}),
      },
      // Local-only lock so in-session host re-renders cannot clobber the write.
      // Never persist _metaSeq to host/cache — that blocked empty API results on reopen.
      _metaSeq: (Number(base._metaSeq) || 0) + 1,
    };
    setLocalDetail(next);
    try {
      const { _metaSeq: _drop, ...forHost } = next as any;
      onPatchDetail?.({
        ...forHost,
        assignees: next.assignees,
        labels: next.labels,
        requestedReviewers: next.requestedReviewers,
        milestone: next.milestone,
        avatarUrls: next.avatarUrls,
      });
    } catch {
      /* host optional */
    }
  }

  async function applyAddAssignees(logins: any) {
    if (!detail) return;
    const names = (Array.isArray(logins) ? logins : [logins])
      .map((s) => String(s || '').trim())
      .filter(Boolean);
    if (!names.length) return;
    setActionBusy(true);
    setActionMsg('');
    try {
      const api = globalThis.PRTreeFetch;
      if (!api?.addAssignees) throw new Error('Add assignees API unavailable');
      const result = await api.addAssignees(
        detail.owner,
        detail.repo,
        detail.number,
        names
      );
      const fromApi = mapAssigneesFromApi(result, []);
      const existing = Array.isArray(detail.assignees) ? detail.assignees.slice() : [];
      const merged = [...existing];
      for (const name of names) {
        if (!merged.some((x) => String(x).toLowerCase() === name.toLowerCase())) {
          merged.push(name);
        }
      }
      // Prefer API assignees when present; otherwise merge into existing.
      // Empty API list after a successful add is treated as lag — keep merged.
      const assignees = fromApi.length ? fromApi : merged;
      const avatarUrls = mergeAvatarUrls(detail, result, assignees);
      // Trust write response + host cache patch only — full soft-refresh races
      // with in-flight detail fetches and was resurrecting stale labels/assignees.
      commitMetaPatch({ assignees, avatarUrls });
      setActionMsg(
        names.length === 1 ? `Assigned ${names[0]}.` : `Assigned ${names.length} people.`
      );
    } catch (err) {
      setActionMsg(err?.message || String(err));
    } finally {
      setActionBusy(false);
    }
  }

  function openAssigneePicker() {
    if (!detail) return;
    const exclude = detail.assignees || [];
    const logins = collectPeopleLogins(exclude);
    const options =
      typeof buildPeopleOptions === 'function'
        ? buildPeopleOptions(logins, {}, detail.avatarUrls || {})
        : logins.map((id) => ({
            id,
            label: id,
            meta: {
              login: id,
              kind: 'user',
              avatarUrl: detail.avatarUrls?.[String(id).toLowerCase()] || '',
            },
          }));
    pickerAnchorRef.current = assigneeAddRef.current;
    setPicker({
      type: 'assignee',
      title: 'Add assignees',
      options,
      query: '',
      allowFreeText: true,
      multi: true,
      confirmLabel: 'Add assignees',
      onConfirm: (ids: string[]) => {
        closePicker();
        void applyAddAssignees(ids);
      },
      // single-click fallback
      onPick: (opt) => {
        closePicker();
        void applyAddAssignees([opt?.id || opt?.label || opt?.meta?.login]);
      },
    });
  }

  async function onRemoveAssignee(login: any) {
    if (!detail || !login) return;
    if (
      !confirmGateProceed(
        await requestConfirm({
          title: 'Unassign?',
          message: `Unassign ${login}?`,
          confirmLabel: 'Unassign',
          tone: 'danger',
        })
      )
    ) {
      return;
    }
    setActionBusy(true);
    setActionMsg('');
    try {
      const api = globalThis.PRTreeFetch;
      if (!api?.removeAssignees) throw new Error('Remove assignees API unavailable');
      const result = await api.removeAssignees(detail.owner, detail.repo, detail.number, [
        login,
      ]);
      const assignees = Array.isArray(result?.assignees)
        ? result.assignees
            .map((u: any) => (typeof u === 'string' ? u : u?.login || ''))
            .map((s: string) => String(s).trim())
            .filter(Boolean)
        : (detail.assignees || []).filter(
            (x) => String(x).toLowerCase() !== String(login).toLowerCase()
          );
      commitMetaPatch({
        assignees,
        avatarUrls: mergeAvatarUrls(detail, result, assignees),
      });
      setActionMsg(`Unassigned ${login}.`);
    } catch (err) {
      setActionMsg(err?.message || String(err));
    } finally {
      setActionBusy(false);
    }
  }

  async function applySetLabels(labels: any) {
    if (!detail) return;
    const next = (labels || []).map((s) => String(s).trim()).filter(Boolean);
    setActionBusy(true);
    setActionMsg('');
    try {
      const api = globalThis.PRTreeFetch;
      if (!api?.setIssueLabels) throw new Error('Set labels API unavailable');
      const result = await api.setIssueLabels(
        detail.owner,
        detail.repo,
        detail.number,
        next
      );
      let labelsOut;
      if (Array.isArray(result)) {
        // PUT /labels returns Label[] (may be empty — clearing is intentional)
        labelsOut = mapLabelsFromApi(result, []);
      } else {
        const fromApi = mapLabelsFromApi(result, []);
        labelsOut =
          fromApi.length > 0 || next.length === 0
            ? fromApi
            : next.map((name) => {
                const existing = (detail.labels || []).find(
                  (l) => String(l.name || l).toLowerCase() === name.toLowerCase()
                );
                return existing && typeof existing === 'object'
                  ? existing
                  : { name, color: '' };
              });
      }
      // No full soft-refresh: in-flight fetchPrDetail responses were overwriting
      // this patch with pre-write assignees/labels a few seconds later.
      commitMetaPatch({ labels: labelsOut });
      setActionMsg(
        next.length === 0
          ? 'Labels cleared.'
          : next.length === 1
            ? `Label “${next[0]}” set.`
            : `Labels updated (${next.length}).`
      );
    } catch (err) {
      setActionMsg(err?.message || String(err));
    } finally {
      setActionBusy(false);
    }
  }

  async function openLabelPicker() {
    if (!detail) return;
    const currentNames = (detail.labels || []).map((l) =>
      String(l.name || l).trim()
    );
    const common = [
      'bug',
      'enhancement',
      'documentation',
      'good first issue',
      'help wanted',
      'question',
      'wontfix',
      'duplicate',
      'invalid',
    ];

    // Prefer repo label catalog (real colors). Fall back to PR labels + defaults.
    let repoLabels: Array<{ name?: string; color?: string; description?: string }> =
      [];
    try {
      const api = globalThis.PRTreeFetch;
      if (typeof api?.fetchRepoLabels === 'function') {
        repoLabels = (await api.fetchRepoLabels(detail.owner, detail.repo)) || [];
      }
    } catch {
      /* offline / no token — still open with PR labels + default colors */
    }

    const pool = [
      ...repoLabels,
      ...(detail.labels || []),
      ...common.map((n) => ({ name: n })),
    ];
    const options =
      typeof buildLabelOptions === 'function'
        ? buildLabelOptions(pool)
        : [...new Set([...currentNames, ...common])].map((id) => ({
            id,
            label: id,
            meta: { kind: 'label', name: id },
          }));
    // de-dupe options by id (buildLabelOptions already does; keep belt)
    const seen = new Set();
    const uniqueOpts: any[] = [];
    for (const o of options) {
      const id = String(o.id || o.label || '').toLowerCase();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      uniqueOpts.push(o);
    }
    pickerAnchorRef.current = labelAddRef.current;

    async function createAndSelectLabel(name: string) {
      const raw = String(name || '').trim();
      if (!raw) return '';
      setPicker((prev: any) => (prev ? { ...prev, createBusy: true } : prev));
      try {
        const api = globalThis.PRTreeFetch;
        let created: any = { name: raw, color: '' };
        if (typeof api?.createRepoLabel === 'function') {
          created = await api.createRepoLabel(detail.owner, detail.repo, {
            name: raw,
          });
        }
        const nextOpt =
          typeof buildLabelOptions === 'function'
            ? buildLabelOptions([created])[0]
            : {
                id: created.name || raw,
                label: created.name || raw,
                meta: {
                  kind: 'label',
                  name: created.name || raw,
                  color: created.color || '',
                },
              };
        setPicker((prev: any) => {
          if (!prev) return prev;
          const opts = Array.isArray(prev.options) ? prev.options.slice() : [];
          const key = String(nextOpt.id || '').toLowerCase();
          if (!opts.some((o: any) => String(o.id || '').toLowerCase() === key)) {
            opts.unshift(nextOpt);
          }
          return {
            ...prev,
            options: opts,
            query: '',
            createBusy: false,
          };
        });
        setActionMsg(`Created label “${nextOpt.id || raw}”.`);
        return String(nextOpt.id || raw);
      } catch (err: any) {
        setPicker((prev: any) => (prev ? { ...prev, createBusy: false } : prev));
        setActionMsg(err?.message || String(err));
        throw err;
      }
    }

    setPicker({
      type: 'label',
      title: 'Set labels',
      options: uniqueOpts,
      query: '',
      allowFreeText: true,
      allowCreate: true,
      createBusy: false,
      multi: true,
      initialSelectedIds: currentNames,
      confirmLabel: 'Apply labels',
      onCreate: (name: string) => {
        void createAndSelectLabel(name);
      },
      onConfirm: (ids: string[]) => {
        closePicker();
        void applySetLabels(ids);
      },
      onPick: (opt) => {
        // single fallback: add one
        closePicker();
        const name = String(opt?.id || opt?.label || '').trim();
        if (!name) return;
        const names = currentNames.slice();
        if (!names.some((n) => String(n).toLowerCase() === name.toLowerCase())) {
          names.push(name);
        }
        void applySetLabels(names);
      },
    });
  }

  function onRemoveLabel(name: any) {
    if (!detail || !name) return;
    const names = (detail.labels || [])
      .map((l) => l.name || l)
      .filter((n) => String(n).toLowerCase() !== String(name).toLowerCase());
    void applySetLabels(names);
  }

  async function onApplySuggestion(payload: any) {
    if (!detail || !payload?.path || payload.endLine == null) return;
    if (
      !confirmGateProceed(
        await requestConfirm({
          title: 'Apply suggestion?',
          message: `Apply suggestion to ${payload.path}:${payload.startLine || payload.endLine}–${payload.endLine} on ${detail.headRef}?`,
          confirmLabel: 'Apply',
          tone: 'warn',
        })
      )
    ) {
      return;
    }
    setActionBusy(true);
    setActionMsg('');
    try {
      const api = globalThis.PRTreeFetch;
      if (!api?.applyReviewSuggestion) throw new Error('Apply suggestion API unavailable');
      await api.applyReviewSuggestion(detail.owner, detail.repo, {
        path: payload.path,
        headRef: detail.headRef,
        startLine: payload.startLine || payload.endLine,
        endLine: payload.endLine,
        suggestion: payload.suggestion,
        commitMessage: `Apply suggestion to ${payload.path}`,
      });
      setActionMsg(`Suggestion applied to ${payload.path}.`);
      await onRefresh?.();
    } catch (err) {
      setActionMsg(err?.message || String(err));
    } finally {
      setActionBusy(false);
    }
  }

  function onStartEditReviewComment(id, _body) {
    // Opens inline BodyEditor (conversation timeline or Diff InlineThread)
    setEditingComment({ kind: 'review', id });
  }

  const stackPath = useMemo(() => {
    if (!detail?.number) return { items: [], branches: [] };
    const list = Array.isArray(openPulls) ? openPulls : [];
    const merged = list.some((p) => Number(p.number) === Number(detail.number))
      ? list
      : [
          ...list,
          {
            number: detail.number,
            title: detail.title,
            headRef: detail.headRef,
            baseRef: detail.baseRef,
            htmlUrl: detail.htmlUrl,
            draft: detail.draft,
          },
        ];
    if (typeof buildStackPathModel === 'function') {
      return buildStackPathModel(merged, detail.number, stackPathSelections);
    }
    if (typeof buildStackStrip === 'function') {
      return {
        items: buildStackStrip(merged, detail.number, stackPathSelections),
        branches: [],
      };
    }
    return { items: [], branches: [] };
  }, [openPulls, detail, stackPathSelections]);
  const stackItems = stackPath.items;

  const openStackOrListPr = useCallback(
    (n: number) => {
      const num = Number(n);
      if (!Number.isFinite(num) || num <= 0) return;
      // Reset path selections so the opened PR becomes the focused stack current
      setStackPathSelections({});
      const page = layoutMode === LAYOUT_DIFF ? 'diff' : 'conversation';
      if (typeof onOpenStackPr === 'function') {
        onOpenStackPr(num, { page });
      }
    },
    [layoutMode, onOpenStackPr]
  );

  const navigateAdjacentPr = useCallback(
    (direction: 'prev' | 'next') => {
      if (typeof resolveAdjacentPrNumber !== 'function') return;
      const next = resolveAdjacentPrNumber({
        direction,
        currentNumber: detail?.number,
        stackItems,
        openPulls: Array.isArray(openPulls) ? openPulls : [],
      });
      if (next != null) openStackOrListPr(next);
    },
    [detail?.number, stackItems, openPulls, openStackOrListPr]
  );

  const paletteCommands = useMemo(() => {
    if (typeof buildPaletteCommands !== 'function') return [];
    const canVerdict =
      typeof canSubmitReviewVerdict === 'function'
        ? canSubmitReviewVerdict(detail)
        : true;
    return buildPaletteCommands(detail || {}, {
      stackItems,
      openPulls: Array.isArray(openPulls) ? openPulls : [],
      canSubmitReviewVerdict: canVerdict,
      // Diff-only commands (file nav, selection, filters, viewed…)
      layoutMode: layoutMode === LAYOUT_DIFF ? 'diff' : 'centered',
    });
  }, [detail, stackItems, openPulls, layoutMode]);

  function runPaletteCommand(cmd: any) {
    if (!cmd) return;
    setPaletteOpen(false);
    setPaletteQuery('');
    const action = cmd.action;
    const p = cmd.payload || {};
    switch (action) {
      case 'openStackPr': {
        const n = Number(p.number);
        if (Number.isFinite(n) && n > 0) openStackOrListPr(n);
        break;
      }
      case 'navAdjacentPrev':
        navigateAdjacentPr('prev');
        break;
      case 'navAdjacentNext':
        navigateAdjacentPr('next');
        break;
      // Diff view actions (also reachable via keyboard; palette when layout=diff)
      case 'navFilePrev':
        navFile(-1);
        break;
      case 'navFileNext':
        navFile(1);
        break;
      case 'scrollDiffPagePrev':
        scrollDiffPage(-1);
        break;
      case 'scrollDiffPageNext':
        scrollDiffPage(1);
        break;
      case 'optArrowScrollSelectPrev':
        optArrowScrollSelect(-1);
        break;
      case 'optArrowScrollSelectNext':
        optArrowScrollSelect(1);
        break;
      case 'toggleViewedActiveFile':
        toggleViewedActiveFile();
        break;
      case 'stepNavPrev':
        if (searchOpen) navSearch(-1);
        else if (layoutMode === LAYOUT_DIFF) navComment(-1);
        else navConversationComment(-1);
        break;
      case 'stepNavNext':
        if (searchOpen) navSearch(1);
        else if (layoutMode === LAYOUT_DIFF) navComment(1);
        else navConversationComment(1);
        break;
      case 'scrollConversationOptPrev':
        scrollConversationPanel(-1, false);
        break;
      case 'scrollConversationOptNext':
        scrollConversationPanel(1, false);
        break;
      case 'scrollConversationPagePrev':
        scrollConversationPanel(-1, true);
        break;
      case 'scrollConversationPageNext':
        scrollConversationPanel(1, true);
        break;
      case 'contextThreadFold':
      case 'focusedThreadFold':
        runContextThreadAction('fold');
        break;
      case 'contextThreadGotoDiff':
      case 'focusedThreadGotoDiff':
        runContextThreadAction('gotoDiff');
        break;
      case 'contextThreadComment':
      case 'focusedThreadComment':
        runContextThreadAction('comment');
        break;
      case 'contextThreadResolve':
      case 'focusedThreadResolve':
        runContextThreadAction('resolve');
        break;
      case 'toggleReviewFilterUnresolved':
        applyReviewFilterToggle('unresolved');
        break;
      case 'toggleReviewFilterResolved':
        applyReviewFilterToggle('resolved');
        break;
      case 'toggleReviewFilterPending':
        applyReviewFilterToggle('pending');
        break;
      case 'moveSelectionUp':
        applySelectionKeyboardMove(-1, false);
        break;
      case 'moveSelectionDown':
        applySelectionKeyboardMove(1, false);
        break;
      case 'extendSelectionUp':
        applySelectionKeyboardMove(-1, true);
        break;
      case 'extendSelectionDown':
        applySelectionKeyboardMove(1, true);
        break;
      case 'openSelectionComment':
        setSelectionIslandPhase('comment');
        setShowSelectionComposer(true);
        break;
      case 'copySelectionCode':
        void copySelectionCode();
        break;
      case 'copySelectionUrl':
        void copySelectionUrl();
        break;
      case 'toggleDiff':
        onToggleDiff();
        break;
      case 'toggleSidePanel':
        toggleSidePanel();
        break;
      case 'openSearch':
        setSearchOpen(true);
        queueMicrotask(() => {
          try {
            searchInputRef.current?.focus?.();
            searchInputRef.current?.select?.();
          } catch {
            /* ignore */
          }
        });
        break;
      case 'toggleFullscreen':
        onToggleShellFullscreen();
        break;
      case 'editTitle':
        setTitleEditSignal((n) => n + 1);
        break;
      case 'editBody':
        setEditingBody(true);
        break;
      case 'promptBase':
        openBasePicker();
        break;
      case 'convertDraft':
        void onSetDraftStage('draft');
        break;
      case 'readyForReview':
        void onSetDraftStage('ready');
        break;
      case 'toggleDraftStage':
        // ⌥⇧D: draft → ready, open PR → convert to draft
        void onSetDraftStage(detail?.draft ? 'ready' : 'draft');
        break;
      case 'mergePr':
        void onMergePr(p.method || 'merge');
        break;
      case 'updateBranch':
        void onUpdateBranch();
        break;
      case 'subscribe':
        void onSubscribe(true);
        break;
      case 'unsubscribe':
        void onSubscribe(false);
        break;
      case 'promptMilestone':
        void onSetMilestone(false);
        break;
      case 'clearMilestone':
        void onSetMilestone(true);
        break;
      case 'rerequestReview':
        void onRerequestReview();
        break;
      case 'promptAddReviewer':
        openReviewerPicker();
        break;
      case 'promptRemoveReviewer': {
        if (p.login) {
          void onRemoveReviewer(p.login);
          break;
        }
        const opts = (detail?.requestedReviewers || []).map((id) => ({ id, label: id }));
        if (!opts.length) {
          setActionMsg('No requested reviewers to remove.');
          break;
        }
        setPicker({
          type: 'reviewer',
          title: 'Remove reviewer',
          options: opts,
          query: '',
          allowFreeText: true,
          onPick: (opt) => {
            closePicker();
            if (opt?.id) void onRemoveReviewer(opt.id);
          },
        });
        break;
      }
      case 'removeReviewer':
        if (p.login) void onRemoveReviewer(p.login);
        break;
      case 'promptAddAssignee':
        openAssigneePicker();
        break;
      case 'promptRemoveAssignee': {
        if (p.login) {
          void onRemoveAssignee(p.login);
          break;
        }
        const opts = (detail?.assignees || []).map((id) => ({ id, label: id }));
        if (!opts.length) {
          setActionMsg('No assignees to remove.');
          break;
        }
        setPicker({
          type: 'assignee',
          title: 'Unassign',
          options: opts,
          query: '',
          allowFreeText: true,
          onPick: (opt) => {
            closePicker();
            if (opt?.id) void onRemoveAssignee(opt.id);
          },
        });
        break;
      }
      case 'removeAssignee':
        if (p.login) void onRemoveAssignee(p.login);
        break;
      case 'promptLabels':
        openLabelPicker();
        break;
      case 'leaveReview': {
        const kind = p.kind || 'comment';
        if (
          typeof isReviewVerdictKind === 'function' &&
          isReviewVerdictKind(kind) &&
          typeof isViewerPrAuthor === 'function' &&
          isViewerPrAuthor(detail)
        ) {
          setActionMsg('Cannot approve or request changes on your own pull request.');
          break;
        }
        // Finish modal already open → its capture-phase Opt chords own submit.
        // Do not fall through to one-shot submitPullReview (that skipped the modal).
        if (
          typeof document !== 'undefined' &&
          document.querySelector('[data-prp-finish-review="1"]')
        ) {
          break;
        }
        // Diff: always open Finish-your-review (never direct-submit from shortcut).
        // Read live store + DOM — render-closure layoutMode can lag behind uiRef.
        const liveLayout =
          useModalStore.getState().layoutMode ||
          uiRef.current?.layoutMode ||
          layoutMode;
        const diffActive =
          liveLayout === LAYOUT_DIFF ||
          (typeof document !== 'undefined' &&
            Boolean(
              document.querySelector(
                '.prp-body-panel--diff.prp-body-panel--active, .prp-modal--diff'
              )
            ));
        if (diffActive) {
          try {
            window.dispatchEvent(
              new CustomEvent('prp-open-finish-review', {
                detail: { kind },
              })
            );
          } catch {
            /* open failed — do not silent-submit */
            setActionMsg('Could not open Finish your review.');
          }
          break;
        }
        // Conversation Review tab / palette while not on Diff
        void onLeaveReviewAction(kind);
        break;
      }
      case 'closePr':
        void onClosePr();
        break;
      case 'reopenPr':
        void onReopenPr();
        break;
      case 'openGithub':
        if (detail?.htmlUrl) window.open(detail.htmlUrl, '_blank', 'noopener,noreferrer');
        break;
      case 'focusComment':
        focusCommentBox();
        break;
      case 'applySuggestion': {
        const fn = applyActionRef.current;
        if (typeof fn === 'function') fn();
        else setActionMsg('Hover a suggestion block first, then apply.');
        break;
      }
      case 'toggleLabel': {
        if (!p.name || !detail) break;
        const names = (detail.labels || []).map((l) => l.name || l);
        const next = names.includes(p.name)
          ? names.filter((n) => n !== p.name)
          : [...names, p.name];
        void (async () => {
          setActionBusy(true);
          try {
            const api = globalThis.PRTreeFetch;
            await api.setIssueLabels(detail.owner, detail.repo, detail.number, next);
            setActionMsg('Labels updated.');
            await onRefresh?.();
          } catch (err) {
            setActionMsg(err?.message || String(err));
          } finally {
            setActionBusy(false);
          }
        })();
        break;
      }
      case 'noop':
      default:
        break;
    }
  }

  function onSelectionStart(row, point, opts: any = {}) {
    const shiftKey = Boolean(opts?.shiftKey);
    const prev = useModalStore.getState().lineSelection;
    let next = null;
    let keepRange = false;
    if (typeof applySelectionPointerDown === 'function') {
      const result = applySelectionPointerDown(prev, row, { shiftKey });
      if (result.mode === 'ignore') {
        shiftRangeRef.current = false;
        return;
      }
      next = result.selection;
      keepRange = Boolean(result.keepRange);
    } else if (typeof beginLineSelection === 'function') {
      if (
        shiftKey &&
        prev &&
        row?.filePath === prev.filePath &&
        typeof extendLineSelection === 'function'
      ) {
        next = extendLineSelection(prev, row) || prev;
        keepRange = true;
      } else {
        next = beginLineSelection(row);
        keepRange = false;
      }
    }
    if (!next) {
      shiftRangeRef.current = false;
      return;
    }
    shiftRangeRef.current = keepRange;
    selectingRef.current = true;
    pointerStartRef.current = point || null;
    setSelecting(true);
    setLineSelection(next);
    // Hide island while dragging; reveal after pointer-up idle delay
    clearSelectionActionsTimer();
    setShowSelectionComposer(false);
  }

  function onSelectionExtend(row: any) {
    if (!selectingRef.current || typeof extendLineSelection !== 'function') return;
    setLineSelection((prev) => extendLineSelection(prev, row) || prev);
  }

  function onSelectionEnd(point, forcedMode) {
    if (!selectingRef.current && forcedMode !== 'click') return;
    selectingRef.current = false;
    setSelecting(false);
    const keepShiftRange = shiftRangeRef.current;
    shiftRangeRef.current = false;
    const mode =
      keepShiftRange
        ? 'shift'
        : forcedMode ||
          (typeof selectionGestureMode === 'function'
            ? selectionGestureMode(
                pointerStartRef.current,
                point || pointerStartRef.current
              )
            : 'click');
    setLineSelection((prev) => {
      if (!prev) return prev;
      if (typeof finalizeSelection === 'function') return finalizeSelection(prev, mode);
      return prev;
    });
    pointerStartRef.current = null;
    setSelectionIslandLeaving(false);
    setSelectionIslandPhase('actions');
    // Delay action toggles so rapid re-clicks / key chords stay cheap
    scheduleSelectionActionsReveal();
  }

  /**
   * Post a selection line comment.
   * @param asPending Start review / Add comment — always GitHub PENDING review
   */
  function onFileHeaderComment(filePath: string) {
    const path = String(filePath || '').trim();
    if (!path) return;
    // Dismiss line selection if any; open file-level composer
    setSelecting(false);
    selectingRef.current = false;
    setSelectionIslandLeaving(false);
    setLineSelection({ kind: 'file', filePath: path, subjectType: 'file' });
    setSelectionDraft('');
    setSelectionIslandPhase('comment');
    setShowSelectionComposer(true);
  }

  async function postSelectionLineComment(payload: any, { asPending = false } = {}) {
    const api = globalThis.PRTreeFetch;
    if (!api?.postReviewComment) throw new Error('Line comment API unavailable');
    // New pending activity cancels a prior discard force-drop so host PENDING
    // from this post is not immediately stripped on the next refresh merge.
    if (asPending) forceDropPendingRef.current = false;
    const isFile = payload.subject_type === 'file' || payload.subjectType === 'file';
    const raw = await api.postReviewComment(detail.owner, detail.repo, detail.number, {
      body: payload.body,
      path: payload.path,
      line: isFile ? null : payload.line,
      side: payload.side,
      commitId: payload.commit_id || detail.headSha,
      startLine: isFile ? null : payload.start_line,
      startSide: isFile ? null : payload.start_side,
      asPending: Boolean(asPending),
      subjectType: isFile ? 'file' : 'line',
    });
    const isPending = Boolean(raw?.pending || asPending || serverPendingReviewId);
    if (isPending) forceDropPendingRef.current = false;
    const optimistic = mapRestReviewComment(raw, {
      body: payload.body,
      path: payload.path,
      line: isFile ? null : payload.line,
      startLine: isFile ? null : payload.start_line,
      side: payload.side,
      author: detail.viewerLogin || '',
      pending: isPending,
      pendingReviewId: raw?.pendingReviewId || serverPendingReviewId || null,
      threadNodeId: raw?.threadNodeId || null,
      subjectType: isFile ? 'file' : 'line',
    });
    if (optimistic) {
      setLocalDetail((prev) => {
        const withComment =
          typeof appendOptimisticReviewComment === 'function'
            ? appendOptimisticReviewComment(prev, { ...optimistic, pending: isPending })
            : prev
              ? {
                  ...prev,
                  reviewComments: [
                    ...(prev.reviewComments || []),
                    { ...optimistic, pending: isPending },
                  ],
                }
              : prev;
        if (!withComment) return withComment;
        // New activity cancels discard-strip so merge won't drop this row
        if (!isPending) {
          return withComment._dropPending
            ? { ...withComment, _dropPending: undefined }
            : withComment;
        }
        // Seed viewerPendingReview so toolbar Submit appears immediately
        const reviewId = optimistic.pendingReviewId || raw?.pendingReviewId || null;
        const pendingRows = (withComment.reviewComments || []).filter(
          (c: any) => c?.pending
        );
        return {
          ...withComment,
          _dropPending: undefined,
          viewerPendingReview: withComment.viewerPendingReview ||
            (reviewId
              ? {
                  id: reviewId,
                  nodeId: null,
                  commentCount: pendingRows.length,
                }
              : null),
        };
      });
    }
    return { raw, isPending };
  }

  function selectionActionMessage(payload: any, isPending: boolean) {
    if (payload.subject_type === 'file' || payload.subjectType === 'file') {
      return isPending
        ? `Added file comment to pending review on ${payload.path}.`
        : `File comment posted on ${payload.path}.`;
    }
    if (isPending) {
      return payload.start_line != null
        ? `Added to pending review on ${payload.path}:${payload.start_line}–${payload.line}.`
        : `Added to pending review on ${payload.path}:${payload.line}.`;
    }
    return payload.start_line != null
      ? `Comment posted on ${payload.path}:${payload.start_line}–${payload.line}.`
      : `Comment posted on ${payload.path}:${payload.line}.`;
  }

  async function onSubmitSelectionCommentImmediate() {
    const lineSelection = useModalStore.getState().lineSelection;
    if (!detail || !lineSelection || typeof selectionToCommentPayload !== 'function') return;
    const payload: any = selectionToCommentPayload(lineSelection, {
      body: useModalStore.getState().selectionDraft,
      commitId: detail.headSha,
    });
    if (!payload) return;
    setActionBusy(true);
    setActionMsg('');
    try {
      // If a PENDING review already exists, GitHub forces attach — shown as pending
      const { isPending } = await postSelectionLineComment(payload, { asPending: false });
      setActionMsg(selectionActionMessage(payload, isPending));
      dismissSelectionIsland();
      await onRefresh?.();
    } catch (err) {
      setActionMsg(err?.message || String(err));
    } finally {
      setActionBusy(false);
    }
  }

  async function onSubmitSelectionCommentPending() {
    const lineSelection = useModalStore.getState().lineSelection;
    if (!detail || !lineSelection || typeof selectionToCommentPayload !== 'function') return;
    const payload: any = selectionToCommentPayload(lineSelection, {
      body: useModalStore.getState().selectionDraft,
      commitId: detail.headSha,
    });
    if (!payload) return;
    setActionBusy(true);
    setActionMsg('');
    try {
      // Unified: always create/attach GitHub PENDING review (no local-only batch)
      await postSelectionLineComment(payload, { asPending: true });
      if (payload.subject_type === 'file' || payload.subjectType === 'file') {
        setActionMsg(
          hasServerPending
            ? `Added file comment to pending review on ${payload.path}.`
            : `Started pending review with file comment on ${payload.path}.`
        );
      } else {
        setActionMsg(
          hasServerPending
            ? `Added to pending review on ${payload.path}:${payload.line}.`
            : `Started pending review on ${payload.path}:${payload.line}.`
        );
      }
      dismissSelectionIsland();
      await onRefresh?.();
    } catch (err: any) {
      setActionMsg(err?.message || String(err));
    } finally {
      setActionBusy(false);
    }
  }

  async function onDiscardPendingReview() {
    setActionBusy(true);
    setActionMsg('');
    try {
      const api = globalThis.PRTreeFetch;
      const reviewId = serverPendingReviewId;
      if (reviewId && api?.deletePendingPullReview && detail) {
        await api.deletePendingPullReview(
          detail.owner,
          detail.repo,
          detail.number,
          reviewId
        );
      }
      // Clear local draft batch
      setPendingReview(
        typeof discardPendingReview === 'function'
          ? discardPendingReview()
          : { comments: [], body: '' }
      );
      // Force-drop pending across the post-discard refresh race.
      forceDropPendingRef.current = true;
      setLocalDetail((prev) =>
        typeof stripPendingReviewFromDetail === 'function'
          ? stripPendingReviewFromDetail(prev)
          : prev
            ? {
                ...prev,
                viewerPendingReview: null,
                reviewComments: (prev.reviewComments || []).filter(
                  (c: any) => c && !c.pending
                ),
              }
            : prev
      );
      setActionMsg('Pending review discarded.');
      await onRefresh?.();
    } catch (err: any) {
      setActionMsg(err?.message || String(err));
    } finally {
      setActionBusy(false);
    }
  }

  /**
   * Thread reply — Diff-style dual actions:
   * - mode `comment`: publish immediately when possible
   * - mode `pending`: Start review / Add comment (PENDING review)
   */
  async function onReplyToThread(thread: any, opts: any = {}) {
    const mode = opts?.mode === 'pending' ? 'pending' : 'comment';
    // Draft keys use the inline row / timeline id (usually the root comment id).
    const draftKey =
      thread?.id ??
      thread?.root?.id ??
      thread?.commentId ??
      thread?.root?.commentId;
    const drafts = useModalStore.getState().replyDrafts || {};
    const body = (
      drafts[String(draftKey)] ||
      (draftKey != null ? drafts[String(Number(draftKey))] : '') ||
      ''
    ).trim();
    if (!detail || draftKey == null || !body) return;

    // GitHub only accepts replies to **top-level** review comments.
    const rootId =
      typeof resolveRootReviewCommentId === 'function'
        ? resolveRootReviewCommentId(detail.reviewComments || [], draftKey)
        : Number(draftKey);
    const parentId =
      typeof normalizeReviewCommentId === 'function'
        ? normalizeReviewCommentId(rootId ?? draftKey)
        : Number(rootId ?? draftKey);
    if (parentId == null || !Number.isFinite(Number(parentId))) {
      setActionMsg('Cannot reply: invalid review comment id.');
      return;
    }

    setActionBusy(true);
    setActionMsg('');
    try {
      const api = globalThis.PRTreeFetch;
      if (!api?.replyToReviewComment) throw new Error('Reply API unavailable');
      // Pending reply cancels a prior discard force-drop
      if (mode === 'pending') forceDropPendingRef.current = false;
      const threadNodeId =
        thread?.threadNodeId || thread?.root?.threadNodeId || null;
      const parentNodeId =
        thread?.root?.nodeId ||
        thread?.root?.node_id ||
        thread?.nodeId ||
        null;
      const raw = await api.replyToReviewComment(
        detail.owner,
        detail.repo,
        detail.number,
        parentId,
        body,
        {
          mode,
          threadNodeId,
          parentNodeId,
          path: thread?.root?.path || thread?.path || '',
          line: thread?.root?.line ?? thread?.line ?? null,
          side: thread?.root?.side || thread?.side || 'RIGHT',
          commitId: detail.headSha || null,
        }
      );
      const isPending = Boolean(raw?.pending || mode === 'pending');
      if (isPending) forceDropPendingRef.current = false;
      const optimistic = mapRestReviewComment(raw, {
        body,
        author: detail.viewerLogin || '',
        path: thread?.root?.path || thread?.path || '',
        line: thread?.root?.line ?? thread?.line ?? null,
        side: thread?.root?.side || 'RIGHT',
        inReplyToId: parentId,
        threadNodeId,
        pending: isPending,
        pendingReviewId: raw?.pendingReviewId ?? serverPendingReviewId ?? null,
      });
      if (optimistic) {
        setLocalDetail((prev) => {
          const withReply =
            typeof appendOptimisticReviewComment === 'function'
              ? appendOptimisticReviewComment(prev, {
                  ...optimistic,
                  pending: isPending,
                })
              : prev
                ? {
                    ...prev,
                    reviewComments: [
                      ...(prev.reviewComments || []),
                      { ...optimistic, pending: isPending },
                    ],
                  }
                : prev;
          if (!withReply || !isPending) return withReply;
          const reviewId =
            optimistic.pendingReviewId || raw?.pendingReviewId || serverPendingReviewId;
          return {
            ...withReply,
            _dropPending: undefined,
            viewerPendingReview:
              withReply.viewerPendingReview ||
              (reviewId
                ? {
                    id: reviewId,
                    nodeId: null,
                    commentCount: (withReply.reviewComments || []).filter(
                      (c: any) => c?.pending
                    ).length,
                  }
                : null),
          };
        });
      }
      setReplyDrafts((prev: any) => ({ ...prev, [String(draftKey)]: '' }));
      setActionMsg(
        isPending
          ? mode === 'pending'
            ? 'Reply added to pending review.'
            : 'Reply attached to your pending review.'
          : 'Reply posted.'
      );
      await onRefresh?.();
    } catch (err) {
      setActionMsg(err?.message || String(err));
    } finally {
      setActionBusy(false);
    }
  }

  async function onResolveThread(threadNodeId, resolved) {
    if (!threadNodeId) {
      setActionMsg('Resolve requires a review thread id from GitHub.');
      return;
    }
    // Pending (unsubmitted) review threads cannot be resolved on GitHub
    const pendingOnThread = (detail?.reviewComments || []).some(
      (c: any) =>
        c?.pending && c.threadNodeId && String(c.threadNodeId) === String(threadNodeId)
    );
    if (pendingOnThread) {
      setActionMsg(
        'Cannot resolve a pending review thread. Submit or discard the pending review first.'
      );
      return;
    }
    setActionBusy(true);
    setActionMsg('');
    try {
      const api = globalThis.PRTreeFetch;
      if (!api?.resolveReviewThread) throw new Error('Resolve API unavailable');
      await api.resolveReviewThread(threadNodeId, resolved);
      setActionMsg(resolved ? 'Thread resolved.' : 'Thread unresolved.');
      await onRefresh?.();
    } catch (err) {
      setActionMsg(err?.message || String(err));
    } finally {
      setActionBusy(false);
    }
  }

  function onToggleViewed(path: any) {
    if (!path) return;
    const markingViewed = !isPathViewed(viewedPaths, path);
    setViewedPaths((prev) =>
      typeof toggleViewedPath === 'function' ? toggleViewedPath(prev, path) : prev
    );
    // Viewed → collapse; uncheck → expand so the file can be re-read.
    setCollapsedFiles((prev) => {
      const n = materializeCollapsedPaths(prev, annotatedFiles, viewedPaths);
      if (markingViewed) n.add(path);
      else n.delete(path);
      return n;
    });
  }

  async function onClosePr() {
    if (!detail) return;
    if (
      !confirmGateProceed(
        await requestConfirm({
          title: 'Close pull request?',
          message: `Close pull request #${detail.number}?`,
          confirmLabel: 'Close PR',
          tone: 'danger',
        })
      )
    ) {
      return;
    }
    setActionBusy(true);
    setActionMsg('');
    try {
      const api = globalThis.PRTreeFetch;
      if (!api?.closePullRequest && !api?.updatePullState) {
        throw new Error('Close PR API unavailable');
      }
      if (api.closePullRequest) {
        await api.closePullRequest(detail.owner, detail.repo, detail.number);
      } else {
        await api.updatePullState(detail.owner, detail.repo, detail.number, 'closed');
      }
      setActionMsg('Pull request closed.');
      // Mark closed locally so UI + auto-close effect agree before host refresh.
      setLocalDetail((d) =>
        d
          ? {
              ...d,
              state: 'closed',
              mergeable: false,
            }
          : d
      );
      // Return to the pulls list (centered modal and side sheet).
      requestClose();
      try {
        await onRefresh?.();
      } catch {
        /* list refresh is best-effort after close */
      }
    } catch (err) {
      setActionMsg(err?.message || String(err));
    } finally {
      setActionBusy(false);
    }
  }

  async function onReopenPr() {
    if (!detail) return;
    setActionBusy(true);
    setActionMsg('');
    try {
      const api = globalThis.PRTreeFetch;
      if (!api?.reopenPullRequest && !api?.updatePullState) {
        throw new Error('Reopen PR API unavailable');
      }
      if (api.reopenPullRequest) {
        await api.reopenPullRequest(detail.owner, detail.repo, detail.number);
      } else {
        await api.updatePullState(detail.owner, detail.repo, detail.number, 'open');
      }
      setActionMsg('Pull request reopened.');
      await onRefresh?.();
    } catch (err) {
      setActionMsg(err?.message || String(err));
    } finally {
      setActionBusy(false);
    }
  }

  async function onEditTitle(nextTitle: string) {
    if (!detail) return;
    const title = String(nextTitle ?? '').trim();
    if (!title || title === String(detail.title || '').trim()) return;
    setActionBusy(true);
    setActionMsg('');
    // Optimistic title so header updates immediately
    setLocalDetail((prev) => (prev ? { ...prev, title } : prev));
    try {
      const api = globalThis.PRTreeFetch;
      if (!api?.updatePullRequest) throw new Error('Update PR API unavailable');
      await api.updatePullRequest(detail.owner, detail.repo, detail.number, { title });
      setActionMsg('Title updated.');
      await onRefresh?.();
    } catch (err) {
      setActionMsg(err?.message || String(err));
      // Revert optimistic title on failure
      setLocalDetail((prev) =>
        prev ? { ...prev, title: detail.title } : prev
      );
    } finally {
      setActionBusy(false);
    }
  }

  async function onSetDraftStage(stage: any) {
    if (!detail) return;
    const wantReady = stage === 'ready';
    const nextDraft = !wantReady;
    const prevDraft = Boolean(detail.draft);
    const label = wantReady ? 'Mark ready for review' : 'Convert to draft';
    if (
      !confirmGateProceed(
        await requestConfirm({
          title: `${label}?`,
          message: `${label} for #${detail.number}?`,
          confirmLabel: label,
          tone: 'default',
        })
      )
    ) {
      return;
    }
    // Optimistic + host cache so merge box / header flip immediately and a
    // remount does not resurrect the pre-write draft flag from SWR/IDB.
    const applyDraft = (draft: boolean) => {
      setLocalDetail((prev) => (prev ? { ...prev, draft: Boolean(draft) } : prev));
      try {
        onPatchDetail?.({ draft: Boolean(draft) });
      } catch {
        /* host optional */
      }
    };
    applyDraft(nextDraft);
    setActionBusy(true);
    setActionMsg('');
    try {
      const api = globalThis.PRTreeFetch;
      if (!api?.setPullRequestDraftStage) throw new Error('Draft stage API unavailable');
      const result = await api.setPullRequestDraftStage(
        detail.owner,
        detail.repo,
        detail.number,
        wantReady ? 'ready' : 'draft',
        detail.nodeId
      );
      const confirmed =
        result && typeof result.draft === 'boolean'
          ? result.draft
          : nextDraft;
      applyDraft(confirmed);
      setActionMsg(
        confirmed
          ? 'Converted to draft.'
          : 'Marked ready for review.'
      );
      try {
        await onRefresh?.();
      } catch {
        /* best-effort — draft already patched */
      }
      // Re-assert after refresh: REST/cache can briefly lag GraphQL and
      // clobber optimistic draft via mergeDetailPreserveOptimistic.
      applyDraft(confirmed);
    } catch (err) {
      applyDraft(prevDraft);
      setActionMsg(err?.message || String(err));
    } finally {
      setActionBusy(false);
    }
  }

  async function onMergePr(method = 'merge') {
    if (!detail) return;
    if (detail.merged) {
      setActionMsg('Already merged.');
      return;
    }
    if (detail.draft) {
      setActionMsg('Cannot merge a draft PR. Mark ready for review first.');
      return;
    }
    const m = ['merge', 'squash', 'rebase'].includes(method) ? method : 'merge';
    const mergeReq =
      typeof buildMergeConfirmRequest === 'function'
        ? buildMergeConfirmRequest(m, detail.number)
        : {
            title: 'Merge?',
            message: `Merge PR #${detail.number}?`,
            confirmLabel: 'Merge',
            tone: 'danger' as const,
          };
    if (!confirmGateProceed(await requestConfirm(mergeReq))) {
      return;
    }
    setActionBusy(true);
    setActionMsg('');
    try {
      const api = globalThis.PRTreeFetch;
      if (!api?.mergePullRequest) throw new Error('Merge API unavailable');
      await api.mergePullRequest(detail.owner, detail.repo, detail.number, {
        mergeMethod: m,
        commitTitle: detail.title,
      });
      setActionMsg(`Merged (${m}).`);
      // Mark merged locally so UI + auto-close effect agree before host refresh.
      setLocalDetail((d) =>
        d
          ? {
              ...d,
              merged: true,
              state: 'closed',
              mergeable: false,
            }
          : d
      );
      // Return to the pulls list (works for centered modal and side sheet).
      requestClose();
      try {
        await onRefresh?.();
      } catch {
        /* list refresh is best-effort after close */
      }
    } catch (err) {
      setActionMsg(err?.message || String(err));
    } finally {
      setActionBusy(false);
    }
  }

  async function onUpdateBranch() {
    if (!detail) return;
    if (
      !confirmGateProceed(
        await requestConfirm({
          title: 'Update branch?',
          message: `Update branch ${detail.headRef} with latest ${detail.baseRef}?`,
          confirmLabel: 'Update branch',
          tone: 'warn',
        })
      )
    ) {
      return;
    }
    setActionBusy(true);
    setActionMsg('');
    try {
      const api = globalThis.PRTreeFetch;
      if (!api?.updatePullBranch) throw new Error('Update branch API unavailable');
      await api.updatePullBranch(
        detail.owner,
        detail.repo,
        detail.number,
        detail.headSha
      );
      setActionMsg('Branch updated from base.');
      await onRefresh?.();
    } catch (err) {
      setActionMsg(err?.message || String(err));
    } finally {
      setActionBusy(false);
    }
  }

  async function onSubscribe(want: any) {
    if (!detail) return;
    const nextSubscribed = Boolean(want);
    const prevSubscribed = detail.subscribed;
    // Optimistic UI — swap icon immediately; revert on failure
    setLocalDetail((prev) =>
      prev ? { ...prev, subscribed: nextSubscribed } : prev
    );
    try {
      onPatchDetail?.({ subscribed: nextSubscribed });
    } catch {
      /* host optional */
    }
    setActionBusy(true);
    setActionMsg('');
    try {
      const api = globalThis.PRTreeFetch;
      const nodeId = detail.nodeId || null;
      if (nextSubscribed) {
        if (!api?.setIssueSubscription) throw new Error('Subscribe API unavailable');
        const result = await api.setIssueSubscription(
          detail.owner,
          detail.repo,
          detail.number,
          { subscribed: true, ignored: false, nodeId }
        );
        if (result && typeof result.subscribed === 'boolean') {
          setLocalDetail((prev) =>
            prev ? { ...prev, subscribed: result.subscribed } : prev
          );
        }
      } else {
        if (!api?.deleteIssueSubscription && !api?.setIssueSubscription) {
          throw new Error('Unsubscribe API unavailable');
        }
        let result = null;
        if (api.deleteIssueSubscription) {
          result = await api.deleteIssueSubscription(
            detail.owner,
            detail.repo,
            detail.number,
            nodeId
          );
        } else {
          result = await api.setIssueSubscription(
            detail.owner,
            detail.repo,
            detail.number,
            { subscribed: false, ignored: false, nodeId }
          );
        }
        if (result && typeof result.subscribed === 'boolean') {
          setLocalDetail((prev) =>
            prev ? { ...prev, subscribed: result.subscribed } : prev
          );
        }
      }
      // Icon state is enough feedback — no success toast
      setActionMsg('');
      // Keep optimistic value — skip full refresh (stale subscription can clobber UI)
    } catch (err) {
      setLocalDetail((prev) =>
        prev
          ? {
              ...prev,
              subscribed:
                typeof prevSubscribed === 'boolean' ? prevSubscribed : !nextSubscribed,
            }
          : prev
      );
      try {
        onPatchDetail?.({
          subscribed:
            typeof prevSubscribed === 'boolean' ? prevSubscribed : !nextSubscribed,
        });
      } catch {
        /* ignore */
      }
      setActionMsg(err?.message || String(err));
    } finally {
      setActionBusy(false);
    }
  }

  async function applyMilestoneNumber(milestone: number | null) {
    if (!detail) return;
    setActionBusy(true);
    setActionMsg('');
    try {
      const api = globalThis.PRTreeFetch;
      if (!api?.setIssueMilestone) throw new Error('Milestone API unavailable');
      const result = await api.setIssueMilestone(
        detail.owner,
        detail.repo,
        detail.number,
        milestone
      );
      // PATCH /issues returns the issue (with milestone object) when successful.
      let nextMilestone: any = null;
      if (milestone == null) {
        nextMilestone = null;
      } else if (result?.milestone && typeof result.milestone === 'object') {
        nextMilestone = {
          number: Number(result.milestone.number) || milestone,
          title: result.milestone.title || `Milestone ${milestone}`,
        };
      } else {
        nextMilestone = {
          number: milestone,
          title: detail.milestone?.title || `Milestone ${milestone}`,
        };
      }
      commitMetaPatch({ milestone: nextMilestone });
      setActionMsg(milestone == null ? 'Milestone cleared.' : `Milestone set to #${milestone}.`);
    } catch (err) {
      setActionMsg(err?.message || String(err));
    } finally {
      setActionBusy(false);
    }
  }

  async function openMilestonePicker() {
    if (!detail) return;
    const current = detail.milestone;

    let repoMilestones: Array<{
      number?: number;
      title?: string;
      state?: string;
      description?: string;
    }> = [];
    try {
      const api = globalThis.PRTreeFetch;
      if (typeof api?.fetchRepoMilestones === 'function') {
        repoMilestones =
          (await api.fetchRepoMilestones(detail.owner, detail.repo)) || [];
      }
    } catch {
      /* offline / no token — still open with current milestone */
    }

    const pool = [
      ...(repoMilestones || []),
      current
        ? {
            number: current.number,
            title: current.title || `Milestone ${current.number}`,
            state: current.state || '',
          }
        : null,
    ].filter(Boolean);
    const options =
      typeof buildMilestoneOptions === 'function'
        ? buildMilestoneOptions(pool)
        : pool.map((m: any) => ({
            id: String(m.number),
            label: `${m.title || 'Milestone'} (#${m.number})`,
            meta: {
              kind: 'milestone',
              number: m.number,
              title: m.title,
            },
          }));

    pickerAnchorRef.current = milestoneAddRef.current;

    async function createAndSetMilestone(title: string) {
      const raw = String(title || '').trim();
      if (!raw) return;
      setPicker((prev: any) => (prev ? { ...prev, createBusy: true } : prev));
      try {
        const api = globalThis.PRTreeFetch;
        if (typeof api?.createRepoMilestone !== 'function') {
          throw new Error('Create milestone API unavailable');
        }
        const created = await api.createRepoMilestone(detail.owner, detail.repo, {
          title: raw,
        });
        const n = Number(created?.number);
        if (!Number.isFinite(n) || n <= 0) {
          throw new Error('Milestone created but number missing');
        }
        closePicker();
        await applyMilestoneNumber(n);
        setActionMsg(`Created milestone “${created.title || raw}” (#${n}).`);
      } catch (err: any) {
        setPicker((prev: any) => (prev ? { ...prev, createBusy: false } : prev));
        setActionMsg(err?.message || String(err));
      }
    }

    setPicker({
      type: 'milestone',
      title: 'Set milestone',
      options,
      query: '',
      allowFreeText: true,
      allowCreate: true,
      createBusy: false,
      placeholder: 'Filter milestones or type a new title…',
      onCreate: (name: string) => {
        void createAndSetMilestone(name);
      },
      onPick: (opt) => {
        closePicker();
        // Prefer meta.number; fall back to parsing id
        const fromMeta = Number(opt?.meta?.number);
        if (Number.isFinite(fromMeta) && fromMeta > 0) {
          void applyMilestoneNumber(fromMeta);
          return;
        }
        const raw = String(opt?.id || opt?.label || '').replace(/[^\d]/g, '');
        const n = Number(raw);
        if (!Number.isFinite(n) || n <= 0) {
          setActionMsg('Invalid milestone.');
          return;
        }
        void applyMilestoneNumber(n);
      },
    });
  }

  async function onSetMilestone(clear = false) {
    if (!detail) return;
    if (clear) {
      if (
        !confirmGateProceed(
          await requestConfirm({
            title: 'Clear milestone?',
            message: 'Remove the milestone from this pull request?',
            confirmLabel: 'Clear',
            tone: 'warn',
          })
        )
      ) {
        return;
      }
      await applyMilestoneNumber(null);
      return;
    }
    void openMilestonePicker();
  }

  /**
   * Expand omitted context between diff hunks (GitHub-style middle expand).
   * Fetches head file text once per path, then merges the requested line range.
   * @param {'all'|'up'|'down'} direction
   */
  async function onExpandDiffGap(
    row: any,
    direction: 'all' | 'up' | 'down' | 'fromStart' | 'fromEnd' = 'all'
  ) {
    if (!detail || !row?.filePath) return;
    // fromStart/fromEnd = front/back of the remaining gap; up/down kept as aliases
    const range = resolveExpandRange(direction, row);
    if (!range) return;
    const path = String(row.filePath);
    // Busy key uses **gap identity** (gapStart/End), not the expanded sub-range,
    // so partial fromStart/fromEnd still disable matching edge controls.
    const busyKey =
      typeof makeExpandBusyKey === 'function'
        ? makeExpandBusyKey(path, row, direction)
        : `${path}:${row.gapStartNew}-${row.gapEndNew}:${direction}`;
    setDiffExpandBusyKey(busyKey);
    try {
      let lines = diffFileLines.get(path);
      if (!lines) {
        const api = globalThis.PRTreeFetch;
        if (!api?.getRepoFileText) {
          throw new Error('File read API unavailable');
        }
        const res = await api.getRepoFileText(detail.owner, detail.repo, {
          path,
          ref: detail.headSha || detail.headRef,
        });
        lines = String(res?.text ?? '').split('\n');
        // split keeps a trailing empty entry when file ends with \n — matches editors
        setDiffFileLines((prev) => {
          const next = new Map(prev);
          next.set(path, lines as string[]);
          return next;
        });
      }
      setDiffExpandedRanges((prev) => {
        const next = new Map(prev);
        next.set(path, mergeLineRanges(prev.get(path) || [], range.start, range.end));
        return next;
      });
    } catch (e: any) {
      setActionMsg(e?.message || 'Failed to expand diff context');
    } finally {
      setDiffExpandBusyKey((k) => (k === busyKey ? null : k));
    }
  }

  function isDiffThreadCollapsed(commentId: any, resolved: boolean) {
    const key = String(commentId ?? '');
    if (diffThreadCollapse.has(key)) return Boolean(diffThreadCollapse.get(key));
    return Boolean(resolved);
  }

  function onToggleThreadCollapse(commentId: any, resolved?: boolean) {
    const key = String(commentId ?? '');
    if (!key) return;
    setDiffThreadCollapse((prev) => {
      const currently = prev.has(key)
        ? Boolean(prev.get(key))
        : Boolean(resolved);
      const next = new Map(prev);
      next.set(key, !currently);
      return next;
    });
  }

  /**
   * Upload attachment via Contents API (GitHub-style markdown insert after upload).
   * Returns public download URL for markdown image/link.
   */
  async function onUploadFile(fileMeta: {
    file: File;
    name?: string;
    type?: string;
    size?: number;
  }): Promise<string> {
    if (!detail) throw new Error('No PR open');
    const api = globalThis.PRTreeFetch;
    if (!api?.uploadRepoFile) {
      throw new Error('File upload requires PAT with repo contents write access');
    }
    const file = fileMeta.file;
    const name = fileMeta.name || file.name || 'file.bin';
    const path =
      typeof buildAssetRepoPath === 'function'
        ? buildAssetRepoPath(name)
        : `.pr-plus-assets/${Date.now().toString(36)}-${name}`;
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    const contentBase64 = btoa(binary);
    const branch = detail.headRef || undefined;
    const result = await api.uploadRepoFile(detail.owner, detail.repo, {
      path,
      contentBase64,
      message: `pr+ attach ${name}`,
      branch,
    });
    const url = result?.downloadUrl || result?.htmlUrl || '';
    if (!url) throw new Error('Upload succeeded but no URL returned');
    return url;
  }

  async function applyRerequestReviewers(logins: string[]) {
    if (!detail || !logins?.length) return;
    setActionBusy(true);
    setActionMsg('');
    try {
      const api = globalThis.PRTreeFetch;
      if (!api?.requestReviewers) throw new Error('Request reviewers API unavailable');
      const result = await api.requestReviewers(
        detail.owner,
        detail.repo,
        detail.number,
        logins
      );
      const fromApi = mapRequestedReviewersFromApi(result, []);
      const existing = Array.isArray(detail.requestedReviewers)
        ? detail.requestedReviewers.slice()
        : [];
      const merged = [...existing];
      for (const name of logins) {
        if (!merged.some((x) => String(x).toLowerCase() === String(name).toLowerCase())) {
          merged.push(name);
        }
      }
      const requestedReviewers = fromApi.length ? fromApi : merged;
      commitMetaPatch({
        requestedReviewers,
        avatarUrls: mergeAvatarUrls(detail, result, requestedReviewers),
      });
      setActionMsg(`Re-requested review from ${logins.join(', ')}.`);
    } catch (err) {
      setActionMsg(err?.message || String(err));
    } finally {
      setActionBusy(false);
    }
  }

  function openRerequestReviewerPicker() {
    if (!detail) return;
    const exclude = detail.requestedReviewers || [];
    const logins = collectPeopleLogins(exclude);
    const options =
      typeof buildPeopleOptions === 'function'
        ? buildPeopleOptions(logins, {}, detail.avatarUrls || {})
        : logins.map((id) => ({
            id,
            label: id,
            meta: {
              login: id,
              kind: 'user',
              avatarUrl: detail.avatarUrls?.[String(id).toLowerCase()] || '',
            },
          }));
    pickerAnchorRef.current = reviewerAddRef.current;
    setPicker({
      type: 'reviewer',
      title: 'Re-request review (username)',
      options,
      query: '',
      allowFreeText: true,
      placeholder: 'Filter or type a username…',
      onPick: (opt) => {
        closePicker();
        const login = String(opt?.id || opt?.label || '').trim();
        if (!login) return;
        const filtered =
          typeof buildRerequestReviewerLogins === 'function'
            ? buildRerequestReviewerLogins({
                requestedReviewers: detail.requestedReviewers,
                reviews: detail.reviews,
                author: detail.author,
                extraLogins: [login],
              })
            : [login];
        if (!filtered.length) {
          setActionMsg('That user is already a pending requested reviewer.');
          return;
        }
        void applyRerequestReviewers(filtered);
      },
    });
  }

  async function onRerequestReview() {
    if (!detail) return;
    // Only past reviewers not already in requested_reviewers (pending POST → 422).
    const logins =
      typeof buildRerequestReviewerLogins === 'function'
        ? buildRerequestReviewerLogins({
            requestedReviewers: detail.requestedReviewers,
            reviews: detail.reviews,
            author: detail.author,
          })
        : [];
    if (!logins.length) {
      // No completed reviewers — pick a username via SearchableSelect
      openRerequestReviewerPicker();
      return;
    }
    if (
      !confirmGateProceed(
        await requestConfirm({
          title: 'Re-request review?',
          message: `Re-request review from: ${logins.join(', ')}?`,
          confirmLabel: 'Re-request',
          tone: 'default',
        })
      )
    ) {
      return;
    }
    await applyRerequestReviewers(logins);
  }

  /** Per-row re-request from the Reviewers widget (single login). */
  async function onRerequestReviewer(login: any) {
    if (!detail) return;
    const name = String(login || '').trim();
    if (!name) return;
    // GitHub Apps / bots cannot be re-requested via REST request_reviewers
    if (
      typeof isBotAccount === 'function'
        ? isBotAccount(name, detail)
        : /\[bot\]$/i.test(name)
    ) {
      setActionMsg(`Cannot re-request review from bot ${name}.`);
      return;
    }
    const alreadyPending = (detail.requestedReviewers || []).some(
      (r: any) => String(r || '').toLowerCase() === name.toLowerCase()
    );
    if (alreadyPending) {
      setActionMsg(`${name} is already a requested reviewer.`);
      return;
    }
    await applyRerequestReviewers([name]);
  }

  /**
   * Apply local detail mutation + host cache patch (no full soft-refresh).
   * Strips local-only tombstone/meta fields that must not poison IDB permanently
   * beyond this session — but keeps comments/threads lists on the host.
   */
  function commitCommentListPatch(next: any) {
    if (!next) return;
    setLocalDetail(next);
    try {
      const {
        _metaSeq: _m,
        _dropPending: _d,
        _deletedReviewCommentIds: _dr,
        _deletedIssueCommentIds: _di,
        ...forHost
      } = next;
      onPatchDetail?.({
        ...forHost,
        reviewComments: next.reviewComments,
        comments: next.comments,
        reviewThreads: next.reviewThreads,
        viewerPendingReview: next.viewerPendingReview ?? null,
      });
    } catch {
      /* host optional */
    }
  }

  async function onDeleteReviewComment(commentId: any) {
    if (!detail || commentId == null) return;
    if (
      !confirmGateProceed(
        await requestConfirm({
          title: 'Delete review comment?',
          message: 'Delete this review comment? This cannot be undone.',
          confirmLabel: 'Delete',
          tone: 'danger',
        })
      )
    ) {
      return;
    }
    setActionBusy(true);
    setActionMsg('');
    // Drop from local + host immediately so revalidate bulk-fetch and merge
    // cannot target / resurrect the deleted id.
    const stripped =
      typeof removeReviewCommentFromDetail === 'function'
        ? removeReviewCommentFromDetail(detail, commentId)
        : {
            ...detail,
            reviewComments: (detail.reviewComments || []).filter(
              (c: any) => c && String(c.id) !== String(commentId)
            ),
          };
    commitCommentListPatch(stripped);
    try {
      const api = globalThis.PRTreeFetch;
      if (!api?.deleteReviewComment) throw new Error('Delete review comment API unavailable');
      await api.deleteReviewComment(detail.owner, detail.repo, commentId);
      setActionMsg('Review comment deleted.');
      // No full onRefresh — soft revalidate was re-fetching deleted PRRT ids and failing.
    } catch (err) {
      setActionMsg(err?.message || String(err));
      // Restore truth from host only on failure
      try {
        await onRefresh?.();
      } catch {
        /* ignore secondary errors */
      }
    } finally {
      setActionBusy(false);
    }
  }

  async function onDeleteIssueComment(commentId: any) {
    if (!detail || commentId == null) return;
    if (
      !confirmGateProceed(
        await requestConfirm({
          title: 'Delete comment?',
          message: 'Delete this comment? This cannot be undone.',
          confirmLabel: 'Delete',
          tone: 'danger',
        })
      )
    ) {
      return;
    }
    setActionBusy(true);
    setActionMsg('');
    const stripped =
      typeof removeIssueCommentFromDetail === 'function'
        ? removeIssueCommentFromDetail(detail, commentId)
        : {
            ...detail,
            comments: (detail.comments || []).filter(
              (c: any) => c && String(c.id) !== String(commentId)
            ),
          };
    commitCommentListPatch(stripped);
    try {
      const api = globalThis.PRTreeFetch;
      if (!api?.deleteIssueComment) throw new Error('Delete comment API unavailable');
      await api.deleteIssueComment(detail.owner, detail.repo, commentId);
      setActionMsg('Comment deleted.');
    } catch (err) {
      setActionMsg(err?.message || String(err));
      try {
        await onRefresh?.();
      } catch {
        /* ignore */
      }
    } finally {
      setActionBusy(false);
    }
  }


  // Keep capture-phase keyboard handler on latest handlers/state (no stale closures).
  uiRef.current = {
    paletteOpen,
    searchOpen,
    layoutMode,
    editingBody,
    editingComment,
    pickerOpen: Boolean(picker),
    confirmOpen: Boolean(confirmState),
    showSelectionComposer,
    selectionIslandPhase,
    conversationCommentFocused: Boolean(
      conversationCommentFocusRef.current ||
        useModalStore.getState().focusedConversationAnchor ||
        useModalStore.getState().pendingConversationNavAnchor
    ),
    contextThreadActive: Boolean(
      layoutMode === LAYOUT_DIFF
        ? commentIndex >= 0 && mappedComments[commentIndex]
        : conversationCommentFocusRef.current ||
            useModalStore.getState().focusedConversationAnchor ||
            useModalStore.getState().pendingConversationNavAnchor
    ),
    hasLineSelection: Boolean(useModalStore.getState().lineSelection),
  };
  actionsRef.current = {
    onClose: requestClose,
    onToggleDiff,
    collapseDiff,
    closePicker,
    focusConversationCommentItem,
    clearConversationCommentFocus,
    runContextThreadAction,
    openSelectionComment: () => {
      setSelectionIslandPhase('comment');
      setShowSelectionComposer(true);
    },
    openSelectionActions: () => {
      setSelectionIslandPhase('actions');
      setShowSelectionComposer(true);
    },
    copySelectionCode,
    copySelectionUrl,
    navSearch,
    navComment,
    navConversationComment,
    navFile,
    scrollDiffPage,
    optArrowScrollSelect,
    scrollConversationPanel,
    toggleViewedActiveFile,
    applyReviewFilterToggle,
    applyGotoQuery,
    applySelectionKeyboardMove,
    toggleSidePanel,
    openStackOrListPr,
    navigateAdjacentPr,
    stackItems,
    openPulls,
    runPaletteCommand,
  };

  // Clear selection action delay / move rAF when modal closes
  useEffect(() => {
    if (open) return undefined;
    clearSelectionActionsTimer();
    if (selectionMoveRafRef.current) {
      cancelAnimationFrame(selectionMoveRafRef.current);
      selectionMoveRafRef.current = 0;
    }
    pendingSelectionMoveRef.current = null;
    try {
      publishShortcutMonitorFire(null);
    } catch {
      /* ignore */
    }
    return undefined;
  }, [open]);

  /** Report a fired product shortcut to the isolated monitor HUD (no App setState). */
  function reportShortcutMonitor(fire: any) {
    if (!fire || !fire.text) return;
    try {
      publishShortcutMonitorFire({ ...fire, at: fire.at || Date.now() });
    } catch {
      /* ignore */
    }
  }

  function reportShortcutAction(action: string) {
    if (!action || typeof buildShortcutMonitorFire !== 'function') return;
    reportShortcutMonitor(buildShortcutMonitorFire(action, isMac));
  }

  /**
   * Opt-hold → store only (no App setState). Leaf OptBtnHint + overlay class bridge
   * re-render; ConversationView tree stays memoized.
   */
  function syncOptHintsActive() {
    const ui = uiRef.current || {};
    const active =
      Boolean(optHeldRef.current) &&
      !optHintsSuppressedRef.current &&
      !ui.paletteOpen &&
      !ui.confirmOpen;
    useModalStore.getState().setOptHintsActive(active);
  }

  useEffect(() => {
    if (!open) {
      optHeldRef.current = false;
      optHintsSuppressedRef.current = false;
      useModalStore.getState().setOptHintsActive(false);
      return undefined;
    }
    let lastHeld = false;
    const sync = (e: KeyboardEvent) => {
      const held = Boolean(e.altKey);
      if (held === lastHeld) {
        if (!held) {
          optHintsSuppressedRef.current = false;
          syncOptHintsActive();
        }
        return;
      }
      lastHeld = held;
      optHeldRef.current = held;
      if (!held) optHintsSuppressedRef.current = false;
      syncOptHintsActive();
    };
    const clear = () => {
      if (!lastHeld) return;
      lastHeld = false;
      optHeldRef.current = false;
      optHintsSuppressedRef.current = false;
      useModalStore.getState().setOptHintsActive(false);
    };
    window.addEventListener('keydown', sync, true);
    window.addEventListener('keyup', sync, true);
    window.addEventListener('blur', clear);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) clear();
    });
    return () => {
      window.removeEventListener('keydown', sync, true);
      window.removeEventListener('keyup', sync, true);
      window.removeEventListener('blur', clear);
    };
  }, [open]);

  // Palette / confirm open while Opt held — hide badges without App optHeld state
  useEffect(() => {
    syncOptHintsActive();
  }, [paletteOpen, confirmState, open]);

  // Watch GH ⌘K palette open state so Escape race (GH closes first) still skips pr+ close
  useEffect(() => {
    if (!open) return undefined;
    const doc = typeof document !== 'undefined' ? document : null;
    if (!doc) return undefined;

    const touch = () => {
      try {
        if (typeof touchGithubCommandPaletteOpen === 'function') {
          touchGithubCommandPaletteOpen(doc);
        } else {
          globalThis.PRListFocus?.touchGithubCommandPaletteOpen?.(doc);
        }
      } catch {
        /* ignore */
      }
    };
    touch();

    const mo = new MutationObserver(() => touch());
    try {
      const dlg = typeof findGithubCommandPaletteDialog === 'function'
        ? findGithubCommandPaletteDialog(doc)
        : doc.getElementById('command-palette-pjax-container');
      if (dlg) {
        mo.observe(dlg, {
          attributes: true,
          attributeFilter: ['open', 'class', 'style', 'hidden', 'aria-hidden'],
        });
      }
      // Palette host may mount after open — watch body for dialog insert
      if (doc.body) {
        mo.observe(doc.body, { childList: true, subtree: true });
      }
    } catch {
      /* ignore */
    }

    // After ⌘K / Ctrl+K GH opens palette asynchronously
    const onMaybeOpen = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && String(e.key || '').toLowerCase() === 'k') {
        queueMicrotask(touch);
        requestAnimationFrame(touch);
        setTimeout(touch, 50);
        setTimeout(touch, 200);
      }
    };
    window.addEventListener('keydown', onMaybeOpen, true);

    return () => {
      mo.disconnect();
      window.removeEventListener('keydown', onMaybeOpen, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      const mod = e.metaKey || e.ctrlKey;
      const alt = Boolean(e.altKey);
      // Physical-key token — never use raw e.key for product chords (macOS ⌥ glyphs)
      const key =
        typeof shortcutKeyFromEvent === 'function'
          ? shortcutKeyFromEvent(e)
          : typeof normalizeShortcutKey === 'function'
            ? normalizeShortcutKey({
                key: e.key,
                code: e.code,
                alt,
              })
            : String(e.key || '').toLowerCase();
      const ui = uiRef.current || {};
      const act = actionsRef.current || {};
      const doc = typeof document !== 'undefined' ? document : null;

      // Keep sticky "was open" timestamp current while typing in GH palette
      let ghOpenNow = false;
      try {
        ghOpenNow =
          typeof touchGithubCommandPaletteOpen === 'function'
            ? touchGithubCommandPaletteOpen(doc)
            : Boolean(
                globalThis.PRListFocus?.touchGithubCommandPaletteOpen?.(doc) ||
                  globalThis.PRListFocus?.isGithubCommandPaletteOpen?.(doc) ||
                  (typeof isGithubCommandPaletteOpen === 'function' &&
                    isGithubCommandPaletteOpen(doc))
              );
      } catch {
        try {
          ghOpenNow =
            typeof isGithubCommandPaletteOpen === 'function' &&
            isGithubCommandPaletteOpen(doc);
        } catch {
          ghOpenNow = false;
        }
      }

      // While GH palette is open: never steal chords (let GH handle).
      // On Escape after GH already closed the dialog on this same keydown:
      // short grace suppresses pr+ shell close only — then shortcuts resume.
      if (ghOpenNow) {
        return;
      }
      if (e.key === 'Escape') {
        const ignoreEsc =
          typeof shouldIgnoreModalEscapeForGithubPalette === 'function'
            ? shouldIgnoreModalEscapeForGithubPalette(doc, { target: e.target })
            : Boolean(
                globalThis.PRListFocus?.shouldIgnoreModalEscapeForGithubPalette?.(
                  doc,
                  { target: e.target }
                )
              );
        if (ignoreEsc) {
          // GH may leave <dialog> stuck in the CSS top layer after close
          try {
            globalThis.PRListFocus?.recoverGithubCommandPaletteTopLayer?.(doc);
          } catch {
            /* ignore */
          }
          return;
        }
      }

      // Diff selection shortcuts (only when not typing in an editable field).
      // `key` is already code-normalized (⌥C → "c" even when e.key is "ç").
      const ae = typeof document !== 'undefined' ? document.activeElement : null;
      const typing =
        ae &&
        (ae === document.body
          ? false
          : (ae as HTMLElement).isContentEditable ||
            /^(INPUT|TEXTAREA|SELECT)$/i.test((ae as HTMLElement).tagName || ''));
      // Live store — App may not re-render on every selection change
      const hasSel = Boolean(useModalStore.getState().lineSelection);
      if (
        !typing &&
        ui.layoutMode === LAYOUT_DIFF &&
        ui.showSelectionComposer &&
        hasSel &&
        key === 'c'
      ) {
        // ⌥C → Comment · ⌘C → Copy code · ⌘⌥C → Copy URL
        if (mod && alt) {
          e.preventDefault();
          e.stopPropagation();
          reportShortcutAction('copySelectionUrl');
          void act.copySelectionUrl?.();
          return;
        }
        if (mod && !alt) {
          e.preventDefault();
          e.stopPropagation();
          reportShortcutAction('copySelectionCode');
          void act.copySelectionCode?.();
          return;
        }
        if (!mod && alt && !e.shiftKey) {
          e.preventDefault();
          e.stopPropagation();
          reportShortcutAction('openSelectionComment');
          act.openSelectionComment?.();
          return;
        }
      }

      // Escape: dismiss nested UI first, otherwise close the whole modal
      // (including from Diff — do not shrink back to conversation).
      if (e.key === 'Escape') {
        // Confirm owns Escape (cancel) — do not close the PR shell
        if (ui.confirmOpen) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        // Mermaid / image fullscreen viewers own Escape — close viewer only, keep modal
        if (
          typeof document !== 'undefined' &&
          (document.querySelector('[data-prp-mermaid-viewer="1"]') ||
            document.querySelector('[data-prp-image-viewer="1"]'))
        ) {
          return;
        }
        // Inline title editor owns Escape (cancel) while focused
        const ae = typeof document !== 'undefined' ? document.activeElement : null;
        if (
          ae &&
          (ae as HTMLElement).classList?.contains('prp-header__title-input')
        ) {
          return;
        }
        if (ui.pickerOpen) {
          e.preventDefault();
          e.stopPropagation();
          act.closePicker?.();
          return;
        }
        if (ui.paletteOpen) {
          e.preventDefault();
          e.stopPropagation();
          setPaletteOpen(false);
          return;
        }
        if (ui.searchOpen) {
          e.preventDefault();
          setSearchOpen(false);
          return;
        }
        if (ui.showSelectionComposer) {
          e.preventDefault();
          // Comment phase → back to action chips; actions → dismiss island
          if (ui.selectionIslandPhase === 'comment') {
            act.openSelectionActions?.();
          } else {
            dismissSelectionIsland();
          }
          return;
        }
        if (ui.editingBody || ui.editingComment) {
          e.preventDefault();
          setEditingBody(false);
          setEditingComment(null);
          editorSaveRef.current = null;
          return;
        }
        // Reply / other inputs: Esc blurs only — never close sheet or Diff.
        {
          const focusEl =
            (typeof document !== 'undefined'
              ? (document.activeElement as HTMLElement | null)
              : null) || (e.target as HTMLElement | null);
          if (isEditableKeyboardTarget(focusEl) || isEditableKeyboardTarget(e.target)) {
            e.preventDefault();
            e.stopPropagation();
            try {
              focusEl?.blur?.();
            } catch {
              /* ignore */
            }
            return;
          }
        }
        e.preventDefault();
        act.onClose?.();
        return;
      }

      const editable = isEditableKeyboardTarget(e.target);
      // Option product chords: allow Control+Option (⌥⌃R) but not ⌘+Option.
      // `alt` already from e.altKey above (physical-key normalize).
      const ctrlKey = Boolean(e.ctrlKey);
      const altOnly = alt && !e.metaKey && !ctrlKey;
      const shift = Boolean(e.shiftKey);

      // Option / Option+Shift command actions (former mod → opt; no mod back-compat)
      if (
        altOnly &&
        !editable &&
        !ui.paletteOpen &&
        typeof resolvePrModalOptAction === 'function'
      ) {
        const peer = resolvePrModalOptAction({
          alt: true,
          shift,
          mod: false,
          key,
          code: e.code,
        });
        // Diff owns ⌥⇧R for viewed-toggle — do not steal for Add reviewer
        const skipPeerForDiffViewed =
          ui.layoutMode === LAYOUT_DIFF &&
          shift &&
          key === 'r' &&
          (peer?.action === 'promptAddReviewer' ||
            peer?.id === 'opt-reviewer' ||
  // @ts-expect-error modal dynamic action/picker shapes
            peer?.id === 'add-reviewer');
        if (peer?.action && !skipPeerForDiffViewed) {
          e.preventDefault();
          e.stopPropagation();
          optHintsSuppressedRef.current = true;
          syncOptHintsActive();
          // Shortcut monitor: opt peer already has title + chord labels
          if (typeof buildShortcutMonitorFireFromParts === 'function') {
            const chord = isMac
  // @ts-expect-error modal dynamic action/picker shapes
              ? peer.labelMac || peer.label
  // @ts-expect-error modal dynamic action/picker shapes
              : peer.labelWin || peer.labelMac || peer.label;
            reportShortcutMonitor(
              buildShortcutMonitorFireFromParts(
                String(chord || '?'),
                String(peer.title || peer.action),
                String(peer.action || '')
              )
            );
          } else {
            reportShortcutAction(String(peer.action));
          }
  // @ts-expect-error modal dynamic action/picker shapes
          if (peer.action === 'openPalette') {
            setPaletteOpen(true);
            setPaletteQuery('');
            return;
          }
          // Diff leave-review chords: open Finish modal only (never one-shot submit).
          // Finish modal (when open) owns the same chords for actual submit.
          if (peer.action === 'leaveReview') {
            const finishOpen = Boolean(
              typeof document !== 'undefined' &&
                document.querySelector('[data-prp-finish-review="1"]')
            );
            if (finishOpen) {
              // Modal capture/bubble handler performs submit with modal body
              return;
            }
            const liveLayout =
              useModalStore.getState().layoutMode || ui.layoutMode;
            const onDiff =
              liveLayout === LAYOUT_DIFF ||
              (typeof document !== 'undefined' &&
                Boolean(document.querySelector('.prp-modal--diff')));
            if (onDiff) {
              try {
                window.dispatchEvent(
                  new CustomEvent('prp-open-finish-review', {
                    detail: { kind: peer.payload?.kind || 'comment' },
                  })
                );
              } catch {
                /* ignore */
              }
              return;
            }
          }
          // Route through palette runner (merge confirm, etc.)
          act.runPaletteCommand?.({
            action: peer.action,
            payload: peer.payload || {},
            id: peer.id,
            title: peer.title,
          });
          return;
        }
      }

      // Live context — App often does not re-render on ⌥J/K focus (store leaf only),
      // so uiRef.contextThreadActive can stay stale false and block ⌥C/F/D/⌃R.
      const storeUi = useModalStore.getState();
      const liveConvFocus = Boolean(
        conversationCommentFocusRef.current ||
          storeUi.focusedConversationAnchor ||
          storeUi.pendingConversationNavAnchor
      );
      const onDiff =
        ui.layoutMode === LAYOUT_DIFF || storeUi.layoutMode === LAYOUT_DIFF;
      // Diff always exposes context chords; handlers seed commentIndex 0 if needed
      // and no-op when there are no review threads.
      // Conversation keep-alive focus must not win on Diff (hidden panel).
      const liveContextThread = onDiff ? true : liveConvFocus;

      let action =
        typeof resolveModalShortcutAction === 'function'
          ? resolveModalShortcutAction({
              // When Option is held, do not treat Ctrl/⌘ as "mod" — Ctrl pairs with ⌥ for resolve.
              mod: mod && !alt,
              shift,
              alt: alt && !e.metaKey,
              /** Physical Control (⌥⌃R resolve) — not ⌘/meta */
              ctrl: ctrlKey,
              key,
              code: e.code,
              editingBody: ui.editingBody,
              editingComment: ui.editingComment,
              paletteOpen: ui.paletteOpen,
              githubPaletteOpen: false, // already bailed above when open
              editableTarget: editable,
              searchOpen: Boolean(ui.searchOpen),
              hasLineSelection: Boolean(ui.hasLineSelection),
              layoutMode: ui.layoutMode,
              conversationCommentFocused: liveConvFocus,
              contextThreadActive: liveContextThread,
              presentation: isEmbed ? 'embed' : 'modal',
              isEmbed,
            })
          : null;

      // Embed restore (also via pure page-embed helper)
      if (
        !action &&
        isEmbed &&
        typeof resolveEmbedShortcutAction === 'function'
      ) {
        action = resolveEmbedShortcutAction({
          mod: mod && !e.altKey,
          alt: altOnly,
          shift,
          key,
          code: e.code,
          presentation: 'embed',
          editableTarget: editable,
        });
      }

      if (!action) return;

      e.preventDefault();
      e.stopPropagation();
      // Opt-hold tips vanish immediately after a chord fires (until Opt release)
      if (e.altKey) {
        optHintsSuppressedRef.current = true;
        syncOptHintsActive();
      }
      // Bottom-right monitor — only real fires (resolved + about to run)
      reportShortcutAction(String(action));

      switch (action) {
        case 'openPalette':
          setPaletteOpen(true);
          setPaletteQuery('');
          break;
        case 'toggleDiff':
          act.onToggleDiff?.();
          break;
        case 'toggleSidePanel':
          act.toggleSidePanel?.();
          break;
        case 'openSearch':
          setSearchOpen(true);
          // Focus after SearchBar mounts
          queueMicrotask(() => {
            try {
              searchInputRef.current?.focus?.();
              searchInputRef.current?.select?.();
            } catch {
              /* ignore */
            }
          });
          break;
        case 'toggleFullscreen':
          if (!isEmbed) {
            setShellFullscreen((prev) => toggleShellFullscreen(prev));
          }
          break;
        case 'focusConversationComment':
          act.focusConversationCommentItem?.();
          break;
        case 'clearConversationCommentFocus':
          act.clearConversationCommentFocus?.();
          break;
        case 'contextThreadFold':
        case 'focusedThreadFold':
          act.runContextThreadAction?.('fold');
          break;
        case 'contextThreadGotoDiff':
        case 'focusedThreadGotoDiff':
          act.runContextThreadAction?.('gotoDiff');
          break;
        case 'contextThreadComment':
        case 'focusedThreadComment':
          act.runContextThreadAction?.('comment');
          break;
        case 'contextThreadResolve':
        case 'focusedThreadResolve':
          act.runContextThreadAction?.('resolve');
          break;
        case 'restoreNativeView':
          if (isEmbed && typeof onRestoreNative === 'function') {
            onRestoreNative();
          }
          break;
        case 'stepNavPrev':
          // Find → Diff threads → Conversation comments (⌥K)
          if (ui.searchOpen) {
            act.navSearch?.(-1);
          } else if (ui.layoutMode === LAYOUT_DIFF) {
            act.navComment?.(-1);
          } else {
            act.navConversationComment?.(-1);
          }
          break;
        case 'stepNavNext':
          // Find → Diff threads → Conversation comments (⌥J)
          if (ui.searchOpen) {
            act.navSearch?.(1);
          } else if (ui.layoutMode === LAYOUT_DIFF) {
            act.navComment?.(1);
          } else {
            act.navConversationComment?.(1);
          }
          break;
        case 'navFilePrev':
          if (ui.layoutMode === LAYOUT_DIFF) act.navFile?.(-1);
          break;
        case 'navFileNext':
          if (ui.layoutMode === LAYOUT_DIFF) act.navFile?.(1);
          break;
        case 'scrollDiffPagePrev':
          if (ui.layoutMode === LAYOUT_DIFF) act.scrollDiffPage?.(-1);
          break;
        case 'scrollDiffPageNext':
          if (ui.layoutMode === LAYOUT_DIFF) act.scrollDiffPage?.(1);
          break;
        case 'optArrowScrollSelectPrev':
          if (ui.layoutMode === LAYOUT_DIFF) act.optArrowScrollSelect?.(-1);
          break;
        case 'optArrowScrollSelectNext':
          if (ui.layoutMode === LAYOUT_DIFF) act.optArrowScrollSelect?.(1);
          break;
        case 'scrollConversationOptPrev':
          if (ui.layoutMode !== LAYOUT_DIFF) {
            act.scrollConversationPanel?.(-1, false);
          }
          break;
        case 'scrollConversationOptNext':
          if (ui.layoutMode !== LAYOUT_DIFF) {
            act.scrollConversationPanel?.(1, false);
          }
          break;
        case 'scrollConversationPagePrev':
          if (ui.layoutMode !== LAYOUT_DIFF) {
            act.scrollConversationPanel?.(-1, true);
          }
          break;
        case 'scrollConversationPageNext':
          if (ui.layoutMode !== LAYOUT_DIFF) {
            act.scrollConversationPanel?.(1, true);
          }
          break;
        case 'toggleViewedActiveFile':
          if (ui.layoutMode === LAYOUT_DIFF) act.toggleViewedActiveFile?.();
          break;
        case 'toggleReviewFilterUnresolved':
          if (ui.layoutMode === LAYOUT_DIFF) {
            act.applyReviewFilterToggle?.('unresolved');
          }
          break;
        case 'toggleReviewFilterResolved':
          if (ui.layoutMode === LAYOUT_DIFF) {
            act.applyReviewFilterToggle?.('resolved');
          }
          break;
        case 'toggleReviewFilterPending':
          if (ui.layoutMode === LAYOUT_DIFF) {
            act.applyReviewFilterToggle?.('pending');
          }
          break;
        case 'moveSelectionUp':
          if (ui.layoutMode === LAYOUT_DIFF) {
            act.applySelectionKeyboardMove?.(-1, false);
          }
          break;
        case 'moveSelectionDown':
          if (ui.layoutMode === LAYOUT_DIFF) {
            act.applySelectionKeyboardMove?.(1, false);
          }
          break;
        case 'extendSelectionUp':
          if (ui.layoutMode === LAYOUT_DIFF) {
            act.applySelectionKeyboardMove?.(-1, true);
          }
          break;
        case 'extendSelectionDown':
          if (ui.layoutMode === LAYOUT_DIFF) {
            act.applySelectionKeyboardMove?.(1, true);
          }
          break;
        case 'navAdjacentPrev':
          act.navigateAdjacentPr?.('prev');
          break;
        case 'navAdjacentNext':
          act.navigateAdjacentPr?.('next');
          break;
        default: {
          // navStackDigit1 … navStackDigit9
          const m = String(action || '').match(/^navStackDigit([1-9])$/);
          if (m) {
            const digit = Number(m[1]);
            const items = act.stackItems || [];
            const num =
              typeof stackDigitSlotNumber === 'function'
                ? stackDigitSlotNumber(digit, items)
                : Number(items[digit - 1]?.number);
            if (num != null && Number.isFinite(num) && num > 0) {
              act.openStackOrListPr?.(num);
            }
          }
          break;
        }
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, isEmbed, onRestoreNative]);

  // Independent section loading: initial (no detail yet) vs soft revalidate (detail present)
  // Progressive load status is shown only in the header stats badge (no top bar).
  const isInitialLoad = Boolean(loading && !detailProp);

  if (!open) return null;

  const hit = activeSearchHit;
  const fsCls = isEmbed ? '' : shellFullscreenClassName(shellFullscreen);
  const presentCls = presentationClassName(presentation);
  const cls =
    `${layoutClassName(layoutMode)} ${
      isEmbed ? 'prp-shell--embed' : shellClassName(shellMode)
    } ${fsCls}${
      !isEmbed && shellResizing ? ' prp-modal--resizing' : ''
    }${
      !isEmbed && shellFullscreenHint ? ' prp-shell--fs-hint' : ''
    } ${animClass} ${theme.className}`.trim();
  const { viewportWidth: vwNow, viewportHeight: vhNow } = viewportSize();
  const appliedSheetWidth = clampSheetWidth(sheetWidth, { viewportWidth: vwNow });
  const appliedModalSize = clampModalSize(modalSize, {
    viewportWidth: vwNow,
    viewportHeight: vhNow,
  });
  // Keep handles in fullscreen so users can drag back to a windowed shell.
  // Embed fills GH main — no resize chrome.
  const showSheetResizer =
    !isEmbed && shellMode === SHELL_SHEET && layoutMode !== LAYOUT_DIFF;
  const showModalResizer =
    !isEmbed && shellMode === SHELL_MODAL && layoutMode !== LAYOUT_DIFF;
  const shellSizeStyle: React.CSSProperties = isEmbed
    ? ({
        ['--prp-shell-w' as any]: '100%',
        ['--prp-shell-h' as any]: '100%',
      } as React.CSSProperties)
    : shellFullscreen
      ? ({
          ['--prp-shell-w' as any]: '100vw',
          ['--prp-shell-h' as any]: '100vh',
        } as React.CSSProperties)
      : shellMode === SHELL_SHEET
        ? ({
            ['--prp-shell-w' as any]: `${appliedSheetWidth}px`,
            ['--prp-shell-h' as any]: '100vh',
          } as React.CSSProperties)
        : ({
            ['--prp-shell-w' as any]: `${appliedModalSize.width}px`,
            ['--prp-shell-h' as any]: `${appliedModalSize.height}px`,
          } as React.CSSProperties);

  return (
    <div
      ref={overlayRef}
      className={`prp-overlay ${
        isEmbed ? 'prp-shell--embed' : shellClassName(shellMode)
      } ${fsCls}${
        !isEmbed && shellFullscreenHint ? ' prp-shell--fs-hint' : ''
      } ${theme.className}${closing ? ' prp-overlay--leaving' : ''} ${presentCls}`.trim()}
      tabIndex={-1}
      data-color-mode={theme.mode}
      data-presentation={isEmbed ? 'embed' : 'modal'}
      data-shell={shellMode}
      data-fullscreen={shellFullscreen ? '1' : '0'}
      data-fs-hint={shellFullscreenHint ? '1' : '0'}
      data-layout={layoutMode === LAYOUT_DIFF ? 'diff' : 'conversation'}
      data-leaving={closing ? '1' : '0'}
    >
      <OptHintsOverlayClass targetRef={overlayRef} />
      {!isEmbed ? (
        <div className="prp-backdrop" onClick={requestClose} />
      ) : null}
      <div
        className={cls}
        ref={shellRef}
        role={isEmbed ? 'region' : 'dialog'}
        aria-modal={isEmbed ? undefined : 'true'}
        aria-label={detail ? `Pull request #${detail.number}` : 'Pull request'}
        data-color-mode={theme.mode}
        data-shell={isEmbed ? 'embed' : shellMode}
        data-presentation={isEmbed ? 'embed' : 'modal'}
        data-fullscreen={isEmbed ? '0' : shellFullscreen ? '1' : '0'}
        data-sheet-width={appliedSheetWidth}
        data-modal-width={appliedModalSize.width}
        data-modal-height={appliedModalSize.height}
        style={shellSizeStyle}
      >
        <ShellResizers
          showSheetResizer={showSheetResizer}
          showModalResizer={showModalResizer}
          appliedSheetWidth={appliedSheetWidth}
          appliedModalSize={appliedModalSize}
          vwNow={vwNow}
          vhNow={vhNow}
          onSheetResizeStart={onSheetResizeStart}
          onModalResizeStart={onModalResizeStart}
        />
        <ActionToast
          key={actionMsgSeq || 0}
          message={actionMsg}
          onDismiss={() => {
            // Clear store after exit animation so the same message can re-fire
            if (useModalStore.getState().actionMsg) setActionMsg('');
          }}
        />
        <ShortcutMonitor
          enabled={open}
          isMac={isMac}
          dismissMs={SHORTCUT_MONITOR_DISMISS_MS}
        />
        <Header
          detail={detail}
          onClose={showCloseChrome ? requestClose : undefined}
          onToggleDiff={onToggleDiff}
          layoutMode={layoutMode}
          actionBusy={actionBusy}
          onClosePr={onClosePr}
          onReopenPr={onReopenPr}
          onEditTitle={onEditTitle}
          titleEditSignal={titleEditSignal}
          onChangeBase={openBasePicker}
          baseBranchRef={baseBranchRef}
          sectionLoading={isInitialLoad}
          shortcutMod={shortcutMod}
          shellMode={shellMode}
          onToggleShell={showShellToggleChrome ? onToggleShell : undefined}
          shellFullscreen={shellFullscreen}
          onToggleFullscreen={
            showFullscreenChrome ? onToggleShellFullscreen : undefined
          }
          presentation={isEmbed ? 'embed' : 'modal'}
          onRestoreNative={
            showRestoreNativeChrome ? () => onRestoreNative?.() : undefined
          }
          onSubscribe={onSubscribe}
          loadStage={loadStage}
          onActionMsg={setActionMsg}
          onRefresh={
            typeof onRefresh === 'function'
              ? () =>
                  onRefresh({
                    mode:
                      layoutMode === LAYOUT_DIFF
                        ? 'full-threads'
                        : 'visible-threads',
                    threadNodeIds:
                      layoutMode === LAYOUT_DIFF
                        ? undefined
                        : visibleConvThreadNodeIdsRef.current.slice(),
                  })
              : null
          }
        />
        <StackStrip
          items={stackItems}
          branches={stackPath.branches}
          resetKey={prIdentity}
          currentNumber={detail?.number ?? null}
          onOpenPr={(n: number) => {
            // Preserve current Diff / Conversation when hopping stacked PRs
            openStackOrListPr(n);
          }}
          onPathChange={(parentHeadRef, childNumber) => {
            setStackPathSelections((prev) => ({
              ...prev,
              [parentHeadRef]: Number(childNumber),
            }));
          }}
        />
        {/* Conversation: full-width find bar under header.
            Diff: search is inlined in DiffToolbar (replaces review filters). */}
        <SearchBar
          open={searchOpen && layoutMode !== LAYOUT_DIFF}
          query={searchQuery}
          hits={searchHits}
          hitIndex={searchHitIndex}
          inputRef={searchInputRef}
          searching={searchBusy}
          showLoadComments={showLoadComments}
          onLoadComments={onSearchLoadComments}
          loadCommentsBusy={Boolean(loadStage?.busy && loadStage?.phase === 'threads')}
          onChange={onSearchQueryCommit}
          onClose={onSearchClose}
          onNext={onSearchNext}
          onPrev={onSearchPrev}
        />
        {error ? <div className="prp-status prp-status--error">{error}</div> : null}
        {/*
          Keep-alive panels: Conversation (and Diff once detail exists) stay mounted
          so layout toggles are hide/show + opacity fade — not remount.
        */}
        <div className="prp-body-panels">
        {(detail || isInitialLoad) ? (
          <div
            className={`prp-body-panel prp-body-panel--conversation${
              layoutMode === LAYOUT_CENTERED ? ' prp-body-panel--active' : ''
            }`}
            data-active={layoutMode === LAYOUT_CENTERED ? '1' : '0'}
            aria-hidden={layoutMode !== LAYOUT_CENTERED}
          >
          <ConversationView
            presentation={isEmbed ? 'embed' : 'modal'}
            detail={
              detail
                ? {
                    ...detail,
                    files: annotatedFiles,
                    magicLinks:
                      detail.magicLinks?.length
                        ? detail.magicLinks
                        : (openPulls || []).find(
                            (p) => Number(p.number) === Number(detail.number)
                          )?.magicLinks || [],
                  }
                : null
            }
            onRegisterAsideToggle={onRegisterAsideToggle}
            onRegisterContextThreadActions={onRegisterContextThreadActions}
            mentionCandidates={mentionCandidates}
            commentText={undefined /* leaf store */}
            setCommentText={setCommentText}
            actionBusy={actionBusy}
            actionMsg={actionMsg}
            onLeaveReviewAction={onLeaveReviewAction}
            onDiscardPending={onDiscardPendingReview}
            sectionLoading={isInitialLoad}
            onDeleteIssueComment={onDeleteIssueComment}
            onDeleteReviewComment={onDeleteReviewComment}
            onEditIssueComment={(id, body) => onSaveEditComment('issue', id, body)}
            onEditReviewComment={(id, body) => onSaveEditComment('review', id, body)}
            editingBody={editingBody}
            onStartEditBody={() => setEditingBody(true)}
            onCancelEditBody={() => setEditingBody(false)}
            onSaveBody={onSaveBody}
            editingComment={editingComment}
            onStartEditComment={(kind, id) => setEditingComment({ kind, id })}
            onCancelEditComment={() => setEditingComment(null)}
            onSaveEditComment={onSaveEditComment}
            pendingCount={totalPendingCount}
            onLoadMoreReviewThreads={onLoadMoreReviewThreads}
            onJumpToReviewThread={jumpToReviewComment}
            onVisibleThreadNodeIds={(ids: string[]) => {
              visibleConvThreadNodeIdsRef.current = Array.isArray(ids)
                ? ids
                : [];
            }}
            reverseComments={reverseComments}
            reviewThreadsMeta={detail?.reviewThreadsMeta || null}
            searchQuery={(searchQuery || '').trim()}
            searchHits={searchHits}
            searchHitIndex={searchHitIndex}
            activeSearchHit={activeSearchHit}
            onAddReviewer={openReviewerPicker}
            onRemoveReviewer={onRemoveReviewer}
            onAddAssignee={openAssigneePicker}
            onRemoveAssignee={onRemoveAssignee}
            onAddLabel={openLabelPicker}
            onRemoveLabel={onRemoveLabel}
            onApplySuggestion={onApplySuggestion}
            onRegisterApply={(fn) => {
              applyActionRef.current = fn;
            }}
            onRegisterEditorSave={(fn) => {
              editorSaveRef.current = fn;
            }}
            onSetMilestone={onSetMilestone}
            onOpenMilestonePicker={() => void openMilestonePicker()}
            onClearMilestone={() => void onSetMilestone(true)}
            onEnsureAllCommits={ensureAllCommits}
            onEnsureAllFiles={ensureAllFiles}
            commitsLoading={commitListLoading}
            filesLoading={fileListLoading}
            sidePending={sidePending}
            prTags={prTags}
            prTagsLoading={prTagsLoading}
            prTagsError={prTagsError}
            onRerequestReviewer={onRerequestReviewer}
            onMergePr={onMergePr}
            onUpdateBranch={onUpdateBranch}
            onSetDraftStage={onSetDraftStage}
            onClosePr={onClosePr}
            onReopenPr={onReopenPr}
            commentBoxRef={commentBoxRef}
            onUploadFile={onUploadFile}
            reviewerAddRef={reviewerAddRef}
            assigneeAddRef={assigneeAddRef}
            labelAddRef={labelAddRef}
            milestoneAddRef={milestoneAddRef}
            onReplyToThread={onReplyToThread}
            onResolveThread={onResolveThread}
            onOpenLinkedPr={(n: number) => openStackOrListPr(n)}
            knownPullNumbers={(Array.isArray(openPulls) ? openPulls : [])
              .map((p: any) => Number(p?.number))
              .filter((n: number) => Number.isFinite(n) && n > 0)}
            /* Keep-alive conversation panel is still mounted in Diff — never
               portal Opt hints for a hidden panel (would paint over Diff). */
          />
          </div>
        ) : null}
        {detail ? (
          <div
            className={`prp-body-panel prp-body-panel--diff${
              layoutMode === LAYOUT_DIFF ? ' prp-body-panel--active' : ''
            }`}
            data-active={layoutMode === LAYOUT_DIFF ? '1' : '0'}
            aria-hidden={layoutMode !== LAYOUT_DIFF}
          >
            <DiffWorkspace
              fileNav={fileNav}
              displayFiles={displayFiles}
              reviewScopedFiles={reviewScopedFiles}
              fileTree={fileTree}
              expandedDirs={expandedDirs}
              onToggleDir={onToggleDir}
              activeFilePath={activeFilePath}
              onSelectFile={onSelectFile}
              collapsedFiles={collapsedFiles}
              onToggleFileCollapse={onToggleFileCollapse}
              fileQuery={fileQuery}
              setFileQuery={setFileQuery}
              ensureAllFiles={ensureAllFiles}
              fileListLoading={fileListLoading}
              fileExtFilter={fileExtFilter}
              setFileExtFilter={setFileExtFilter}
              fileUnreadOnly={fileUnreadOnly}
              setFileUnreadOnly={setFileUnreadOnly}
              threadCounts={threadCounts}
              viewedPaths={viewedPaths}
              onToggleViewed={onToggleViewed}
              onToggleFileNavCollapse={onToggleFileNavCollapse}
              activeFileNavIndex={activeFileNavIndex}
              navFile={navFile}
              onFileNavResizeStart={onFileNavResizeStart}
              detail={detail}
              virtualRows={virtualRows}
              diffFilesOverride={diffFilesOverride}
              diffReviewFilter={diffReviewFilter}
              diffMode={diffMode}
              setDiffMode={setDiffMode}
              setScrollTop={setScrollTop}
              listRef={listRef}
              hasAnyReviewThreads={hasAnyReviewThreads}
              totalPendingCount={totalPendingCount}
              reviewThreadTotals={reviewThreadTotals}
              setDiffReviewFilter={setDiffReviewFilter}
              detailCommits={detail.commits || []}
              diffCommitFilter={diffCommitFilter}
              applyDiffCommitFilter={applyDiffCommitFilter}
              ensureAllCommits={ensureAllCommits}
              diffCommitLoading={diffCommitLoading}
              commitListLoading={commitListLoading}
              diffCommitError={diffCommitError}
              diffCommitLabel={diffCommitLabel}
              onFetchCompareFiles={onFetchCompareFiles}
              mappedComments={mappedComments}
              commentIndex={commentIndex}
              navComment={navComment}
              pendingCount={pendingCount}
              onDiscardPending={onDiscardPendingReview}
              onLeaveReviewAction={onLeaveReviewAction}
              actionBusy={actionBusy}
              actionMsg={actionMsg}
              themeMode={theme.mode}
              onUploadFile={onUploadFile}
              mentionCandidates={mentionCandidates}
              openPulls={openPulls || []}
              searchOpen={searchOpen}
              layoutIsDiff={layoutMode === LAYOUT_DIFF}
              searchQuery={searchQuery}
              searchHits={searchHits}
              searchHitIndex={searchHitIndex}
              searchInputRef={searchInputRef}
              searchBusy={searchBusy}
              showLoadComments={showLoadComments}
              onSearchLoadComments={onSearchLoadComments}
              loadStage={loadStage}
              onSearchQueryCommit={onSearchQueryCommit}
              onSearchClose={onSearchClose}
              onSearchNext={onSearchNext}
              onSearchPrev={onSearchPrev}
              scrollDiffPage={scrollDiffPage}
              applyGotoQuery={applyGotoQuery}
              scrollTop={undefined /* leaf store */}
              viewportHeight={undefined /* leaf store */}
              setViewportHeight={setViewportHeight}
              hit={hit}
              searchMatchRows={searchMatchRows}
              activeSearchHit={activeSearchHit}
              activeSearchOccurrence={activeSearchOccurrence}
              onSelectionStart={onSelectionStart}
              onSelectionExtend={onSelectionExtend}
              onSelectionEnd={onSelectionEnd}
              onFileHeaderComment={onFileHeaderComment}
              onExpandDiffGap={onExpandDiffGap}
              diffExpandBusyKey={diffExpandBusyKey}
              threadsByCommentId={threadsByCommentId}
              onReplyToThread={onReplyToThread}
              onResolveThread={onResolveThread}
              onDeleteReviewComment={onDeleteReviewComment}
              onStartEditReviewComment={onStartEditReviewComment}
              onSaveEditComment={onSaveEditComment}
              setEditingComment={setEditingComment}
              editingComment={editingComment}
              editorSaveRef={editorSaveRef}
              onApplySuggestion={onApplySuggestion}
              applyActionRef={applyActionRef}
              isDiffCommentCollapsed={isDiffCommentCollapsed}
              onToggleThreadCollapse={onToggleThreadCollapse}
              commentHeightOpts={commentHeightOpts}
              showSelectionComposer={showSelectionComposer}
              selectionIslandLeaving={selectionIslandLeaving}
              selectionDraft={undefined /* leaf store */}
              setSelectionDraft={setSelectionDraft}
              onSubmitSelectionCommentImmediate={onSubmitSelectionCommentImmediate}
              onSubmitSelectionCommentPending={onSubmitSelectionCommentPending}
              dismissSelectionIsland={dismissSelectionIsland}
              selectionIslandPhase={selectionIslandPhase}
              setSelectionIslandPhase={setSelectionIslandPhase}
              setActionMsg={setActionMsg}
            />
          </div>
        ) : null}
        {isInitialLoad && layoutMode === LAYOUT_DIFF && !detail ? (
          <div
            className="prp-body-panel prp-body-panel--diff prp-body-panel--active"
            data-active="1"
          >
            <LoadingSkeleton variant="diff" />
          </div>
        ) : null}
        </div>
        <CommandPalette
          open={paletteOpen}
          query={undefined /* leaf store */}
          onQuery={setPaletteQuery}
          commands={paletteCommands}
          onRun={runPaletteCommand}
          onClose={() => setPaletteOpen(false)}
        />
        <ConfirmDialog
          open={Boolean(confirmState)}
          title={confirmState?.title}
          message={confirmState?.message}
          confirmLabel={confirmState?.confirmLabel}
          cancelLabel={confirmState?.cancelLabel}
          tone={confirmState?.tone}
          colorMode={theme.mode}
          onConfirm={() => closeConfirm(true)}
          onCancel={() => closeConfirm(false)}
        />
        <SearchableSelect
          open={!!picker}
          title={picker?.title}
          options={picker?.options || []}
          query={picker?.query || ''}
          onQuery={(q) => setPicker((prev) => (prev ? { ...prev, query: q } : prev))}
          onPick={(opt) => picker?.onPick?.(opt)}
          onClose={closePicker}
          allowFreeText={picker?.allowFreeText !== false}
  // @ts-expect-error modal dynamic action/picker shapes
          allowCreate={Boolean(picker?.allowCreate)}
          onCreate={
  // @ts-expect-error modal dynamic action/picker shapes
            picker?.onCreate
  // @ts-expect-error modal dynamic action/picker shapes
              ? (name: string) => picker.onCreate(name)
              : null
          }
  // @ts-expect-error modal dynamic action/picker shapes
          createBusy={Boolean(picker?.createBusy)}
  // @ts-expect-error modal dynamic action/picker shapes
          multi={Boolean(picker?.multi)}
  // @ts-expect-error modal dynamic action/picker shapes
          initialSelectedIds={picker?.initialSelectedIds || null}
          onConfirm={
  // @ts-expect-error modal dynamic action/picker shapes
            picker?.onConfirm
  // @ts-expect-error modal dynamic action/picker shapes
              ? (ids: string[]) => picker.onConfirm(ids)
              : null
          }
  // @ts-expect-error modal dynamic action/picker shapes
          confirmLabel={picker?.confirmLabel || 'Apply'}
          anchorRef={pickerAnchorRef}
          placement="bottom"
          placeholder={
            picker?.placeholder ||
            (picker?.type === 'base'
              ? 'Filter or type a branch…'
              : picker?.type === 'label'
                ? 'Filter or type labels…'
                : picker?.type === 'milestone'
                  ? 'Filter milestones or type a new title…'
                  : picker?.type === 'assignee'
                    ? 'Filter or type usernames…'
                    : 'Filter or type a username…')
          }
        />
      </div>
    </div>
  );
}


export default PrModalApp;
