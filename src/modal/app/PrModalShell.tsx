/**
 * SOURCE OF TRUTH — PR modal shell composition root (Phase 7).
 * Complete TypeScript module: providers, layout, command wiring, page switch.
 * Domain mutations: src/modal/commands/*
 * Capture hotkeys: src/modal/hooks/usePrModalHotkeys.ts
 * Public entry: PrModalApp.tsx re-exports this shell.
 * PrModalApp.impl.tsx is a thin re-export for legacy path compatibility only.
 */
import React, {
  useCallback,
  useDeferredValue,
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
import { DetailGnb } from '../views/chrome/DetailGnb';
import { StackStrip } from '../views/chrome/StackStrip';
import { SearchBar } from '../views/chrome/SearchBar';
import { CommandPalette } from '../views/chrome/CommandPalette';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { LoadingSkeleton } from '../views/chrome/LoadingSkeleton';
import {
  buildMergeConfirmRequest,
  confirmGateProceed,
} from '../lib/confirm-gate';
import { canUpdateBranch, coerceMergeMethod } from '../lib/merge-box-status';
import { useThreadCommentsAndGap } from '../hooks/useThreadCommentsAndGap';
import { useContextThreadActions } from '../hooks/useContextThreadActions';
import { useSelectionKeyboard } from '../hooks/useSelectionKeyboard';
import { useDiffConversationNav } from '../hooks/useDiffConversationNav';
import { useEnsureDiffLoads } from '../hooks/useEnsureDiffLoads';
import { usePrModalSessionRoute } from '../hooks/usePrModalSessionRoute';
import { ConversationView } from '../views/conversation/ConversationView';
import { DiffWorkspace } from '../views/pr-modal/DiffWorkspace';
import { ShellResizers } from '../views/pr-modal/ShellResizers';
import {
  LAYOUT_CENTERED,
  LAYOUT_DIFF,
  layoutClassName,
  isDiffUnavailable,
} from '../lib/layout-mode';
import {
  conversationDeepLinkApplyKey,
  decideConversationDeepLinkLayout,
  shouldAbandonConversationDeepLinkOnExpandDiff,
} from '../lib/deep-link-layout-intent';
import {
  compareCacheKey,
  isAllCommitsFilter,
  normalizeDiffCommitFilter,
  resolveCompareRange,
  type DiffCommitFilter as DiffCommitFilterState,
} from '../lib/diff-commit-filter';
import { filesListNeedsFullFetch } from '../lib/detail-idb';
import { useDetailUiStore } from '../store/detail-ui-store';
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
  beginDiffNavPerfSample,
  endDiffNavPerfSample,
  installDiffNavPerfGlobal,
  isDiffNavPerfEnabled,
} from '../lib/diff-nav-perf';
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
  togglePathInCollapsedSet,
  setPathCollapsedInSet,
  shouldAutoExpandOnFileNav,
} from '../lib/collapse';
import {
  countReviewThreadsByPath,
  countUnresolvedReviewThreadsByPath,
  countPendingReviewThreads,
  countPendingReviewThreadsByPath,
  countReviewThreadTotals,
  groupReviewThreads,
  mergeReviewThreadGroupsWithShells,
  threadCommentsAreLoaded,
  isGraphqlReviewThreadNodeId,
  toggleViewedPath,
  isPathViewed,
  resolveRootReviewCommentId,
  normalizeReviewCommentId,
} from '../lib/review-threads';
import {
  applyReactionToggle,
  dismissCommentReactionPicker,
  isCommentReactionPickerOpen,
} from '../lib/comment-reactions';
import {
  filterTagsByCommitShas,
  getRepoTagsCache,
  isRepoTagsCacheFresh,
  mergeNewestFirstTagPage,
  setRepoTagsCache,
  type RepoTag,
} from '../lib/tags-cache';
import { applyHideWhitespaceToFiles } from '../lib/hide-whitespace';
import {
  applyViewedToggle,
  shouldApplyServerViewedPaths,
} from '../lib/file-viewed';
import {
  shouldShowDeleteHeadBranch,
  resolveDeleteHeadBranchTarget,
  deleteHeadBranchButtonLabel,
  shouldAutoCloseOnTerminalTransition,
} from '../lib/delete-head-branch';
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
  filterFilesByExtensions,
  filterFilesUnreadOnly,
  filterFilesCommentedOnly,
  hasAnyReviewThreads,
} from '../lib/file-tree';
import {
  sortThreadRootComments,
  mapCommentsToRowIndices,
  resolveCommentNav,
  filterReviewRootsForNav,
  buildPathOrderMap,
} from '../lib/comment-nav';
import {
  createDefaultDiffReviewFilter,
  createUnrestrictedDiffReviewFilter,

  filterReviewCommentsForDiffNav,
  filterReviewRootsForDiffNav,
  normalizeDiffReviewFilter,
  toggleDiffReviewStatus,
  type DiffReviewFilterState,
  type DiffReviewStatus,
} from '../lib/diff-review-filter';
import {
  loadDiffGlobalPrefs,
  saveDiffGlobalPrefs,
  resolveDiffGlobalPrefsStorage,
} from '../lib/diff-global-prefs';
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
  applyProgrammaticDiffScroll,
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
  isThreadSelection,
  isCodeBodySelection,
  isInlineCommentRow,
  isFileHeaderRow,
  beginSelectionOnRow,
  selectionBlockRole,
  extractSelectedCodeText,
  githubBlobLinePermalink,
  parseGotoQuery,
  selectionFromGoto,
  moveLineSelection,
  coalesceSelectionMoveDelta,
  firstSelectableRowInFile,
  lastSelectableRowInFile,
  firstContentNavRowInFile,
  lastContentNavRowInFile,
  isSelectionAtFileEdge,
  rebindSelectionRowIndices,
  findRowIndexForCommentId,
  SELECTION_ACTIONS_REVEAL_MS,
  SELECTION_NAV_BUSY_ATTR,
  resolveSelectionIslandRevealPhase,
  shouldShowSelectionActionGroup,
  jumpSelectionToAdjacentChangeRegion,
  buildChangeRegionIndex,
  isChangeRegionIndexValid,
  type ChangeRegionIndex,
  browserSelectionCopyText,
  resolvePendingGotoSelection,
  resolveGotoPathAmongFiles,
} from '../lib/line-selection';
import { copyTextToClipboard } from '../lib/copy-to-clipboard';
import {
  discardPendingReview,
  formatStartReviewError,
} from '../lib/pending-review';
import {
  parseSuggestionFences, applySuggestionToFileContent, mapLeaveReviewAction,
  isViewerPrAuthor, canSubmitReviewVerdict, isReviewVerdictKind,
  buildRerequestReviewerLogins, mapRestReviewComment, mapRestIssueComment, appendOptimisticReviewComment, appendIssueCommentToDetail,
  stampThreadResolved,
  applyResolveStamps,
} from '../lib/pr-edit-api';
import { runPaletteCommand as runPaletteCommandImpl } from './pr-modal-run-palette';
import { installPrModalMutations, installReviewActions, installSideActions } from '../commands';
import { useCommandContext } from '../hooks/useCommandContext';
import { usePrModalHotkeys } from '../hooks/usePrModalHotkeys';
import { DomainDetailProvider } from './domain-detail-context';
import { createApplyDomainDetailToHost } from '../hooks/useDomainDetailHost';
import {
  mapRequestedReviewersFromApi,
  mapAssigneesFromApi,
  mapLabelsFromApi,
  mergeAvatarUrls,
} from './pr-modal-mappers';
import {
  buildPaletteCommands,
  filterPaletteCommands,
  resolveAdjacentPrNumber,
  stackDigitSlotNumber,
  resolvePrModalOptAction,
  allowPrModalOptPeerWhileEditable,
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
  resolveActiveFileForCollapse,
  isEditableKeyboardTarget,
  isComposerKeyboardTarget,
  findComposerShortcutSurface,
  resolveComposerContextShortcutAction,
} from '../lib/shortcut-policy';
import {
  isNestedEscapeLayerOpen,
  resolveModalEscapeOwner,
} from '../lib/escape-layer';
import {
  focusContextThreadReply,
  focusContextThreadReplyAfterPaint,
  isContextThreadReplyFocused,
  isContextThreadCommentActive,
  PRP_CONTEXT_THREAD_TAB_LEAVE,
  scrollChildToMaximizeInScroller,
  scrollChildToRevealInScroller,
} from '../lib/context-thread-dom';
import {
  listReviewThreadFocusUnits,
  stepReviewThreadFocusUnit,
  seedReviewThreadFocusUnit,
  collectThreadReplyComments,
} from '../lib/thread-reply-nav';
import { resolveDiffDisplayFiles } from '../lib/single-file-mode';
import {
  buildConversationTimeline,
  partitionTimelineWithThreadGap,
  mergeTimelineEventsById,
  labelChangeTimelineEvents,
  assigneeChangeTimelineEvents,
  reviewerChangeTimelineEvents,
  milestoneChangeTimelineEvents,
  makeLocalTimelineEvent,
} from '../lib/conversation-timeline';
import { resolveGithubTheme } from '../lib/theme';
import {
  normalizeUiLanguagePref,
  resolveEffectiveGithubLocale,
} from '../lib/locale-resolve';
import { LocaleProvider } from '../lib/locale-context';
import { formatMessage } from '../lib/i18n';
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
import {
  canRestoreSessionView,
  loadSessionView,
  saveSessionView,
} from '../lib/session-view';
import {
  stripPendingReviewFromDetail,
  removeReviewCommentFromDetail,
  removeIssueCommentFromDetail,
  buildAssetRepoPath,
} from '../lib/composer-attach';
import {
  normalizePage,
  buildPositionFromComment,
  findCommentIndexByPosition,
  parsePosition,
  parseGithubCommentHash,
  resolveConversationAnchorForCommentId,
  optimisticConversationAnchorForKind,
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
import '../views/chrome/ShellLayout.css';
import '../views/chrome/LoadingSkeleton.css';
import {
  ROW_HEIGHT,
  COMMENT_ROW_HEIGHT,
  averageRowHeight,
  rowHeightFor,
  rowOffsets,
} from '@common/utils';

type NavigationFrameHandle = { cancel: () => void };

/** Keep normal paints rAF-coalesced, with a bound for suspended Chromium rAF. */
function scheduleNavigationFrame(run: () => void): NavigationFrameHandle {
  let active = true;
  let raf = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const cancel = () => {
    if (!active) return;
    active = false;
    if (raf) cancelAnimationFrame(raf);
    if (timer != null) clearTimeout(timer);
  };
  const finish = () => {
    if (!active) return;
    cancel();
    run();
  };
  timer = setTimeout(finish, 32);
  if (typeof requestAnimationFrame === 'function') {
    raf = requestAnimationFrame(finish);
  }
  return { cancel };
}

export function PrModalApp({
  open,
  loading,
  loadStage = null,
  /** Independent side panels still loading without settled cache */
  sidePending = null,
  onLoadMoreReviewThreads = null,
  /** Lazy GraphQL comments for shell/resolved threads on expand */
  onLoadReviewThreadComments = null,
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
  /** Patch extensionPrefs.timelineVisibility from Conversation tips */
  onTimelineVisibilityChange = null,
  /** 'modal' overlay (default) | 'embed' in-page under GitHub header */
  presentation = 'modal',
  shellChrome = null,
  /** Embed: tear down replace mode and show original GH PR UI */
  onRestoreNative = null,
}: any) {
  const reverseComments = prefs?.reverseComments !== false;
  const timelineVisibility = prefs?.timelineVisibility ?? null;
  /**
   * Plugin language: `auto` follows GitHub page locale; concrete codes override.
   * Passed to chrome that uses pure catalogs (Diff settings labels, …).
   */
  const uiLanguagePref = normalizeUiLanguagePref(prefs?.uiLanguage);
  const appLocale = useMemo(
    () =>
      resolveEffectiveGithubLocale(
        typeof document !== 'undefined' ? document : null,
        uiLanguagePref
      ),
    [uiLanguagePref]
  );
  // Keep page attribute in sync even before LocaleProvider paint (watch path)
  useEffect(() => {
    try {
      document.documentElement.setAttribute('data-prp-app-locale', appLocale);
      document.documentElement.setAttribute(
        'data-prp-ui-language',
        uiLanguagePref
      );
    } catch {
      /* ignore */
    }
  }, [appLocale, uiLanguagePref]);
  /** Diff hunk list shows only the active file; file tree still lists all. */
  const singleFileMode = prefs?.singleFileMode === true;
  /**
   * When true, file tree / ⌥⇧[] nav auto-expands the target file.
   * Default false — stay collapsed until the user expands (⌥F / chevron).
   */
  const autoExpandOnFileNav = shouldAutoExpandOnFileNav(prefs);
  /** Bottom-center shortcut HUD size (none hides). */
  const shortcutMonitorSize = (() => {
    const raw = String(prefs?.shortcutMonitorSize || 'small')
      .trim()
      .toLowerCase();
    if (raw === 'none' || raw === 'off' || raw === 'hidden') return 'none';
    if (raw === 'medium' || raw === 'md' || raw === '2x') return 'medium';
    if (raw === 'large' || raw === 'lg' || raw === '3x') return 'large';
    return 'small';
  })();
  const shortcutMonitorEnabled = shortcutMonitorSize !== 'none';
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
  /** PRR_… from last Start review / pending attach — survives host detail merge wiping nodeId */
  const pendingReviewNodeIdRef = useRef<string | null>(null);
  // Host-data-first: UI reads host detailProp only (no localDetail domain SoT).
  const detail = detailProp;
  const detailRef = useRef(detailProp);
  detailRef.current = detailProp;
  // Live deps bag for extracted mutations — filled each render after helpers exist.

  const applyDomainDetailToHost = createApplyDomainDetailToHost({
    detailRef,
    getDetailProp: () => detailProp,
    onPatchDetail,
    onCacheFailMsg: (msg) => {
      try {
        setActionMsg(msg);
      } catch {
        /* ignore */
      }
    },
  });

  const { mutD, reviewBag, sideBag, mut, reviewAct, sideAct } = useCommandContext();
  const hotkeyBag = useRef<Record<string, any>>({}).current;

  const {
    timelineActorFromDetail,
    refreshTimelineEvents,
    commitMetaPatch,
    patchHostDetail,
    applyAddAssignees,
    openAssigneePicker,
    onRemoveAssignee,
    applySetLabels,
    openLabelPicker,
    onRemoveLabel,
    onSaveBody,
    onSaveEditComment,
    applyBaseChange,
    openBasePicker,
    applyAddReviewer,
    openReviewerPicker,
    onRemoveReviewer,
    onApplySuggestion,
    onStartEditReviewComment,
    onDiscardPendingReview,
    onReplyToThread,
    onResolveThread,
    onToggleViewed,
    onClosePr,
    onReopenPr,
    onEditTitle,
    onSetDraftStage,
    onMergePr,
    onUpdateBranch,
    onSubscribe,
    commitCommentListPatch,
    onDeleteReviewComment,
    onDeleteIssueComment,
    onHideComment,
    onUnhideComment,
  } = mut;

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
   * Opt-hold badges live in the store (ShortcutHint leaf-subscribes).
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
  /**
   * Pointer / keyboard established a live caret. Inbound #diff- echoes must
   * not replace that selection (row indices + multi-line range).
   */
  const selectionInteractedRef = useRef(false);

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
    // Re-seed review filter from product default but keep global hideOutdated.
    try {
      const g = loadDiffGlobalPrefs(resolveDiffGlobalPrefsStorage(window));
      setDiffReviewFilter(
        createDefaultDiffReviewFilter({ hideOutdated: g.hideOutdated })
      );
    } catch {
      setDiffReviewFilter(createDefaultDiffReviewFilter());
    }
    setFileExtFilter(new Set());
    setFileUnreadOnly(false);
    setFileCommentedOnly(false);
    // Zustand selection survives remount — clear so we never write another PR's #diff-
    // Use getState() so this effect can run before setLineSelection is declared below
    // (avoids TDZ: Cannot access 'setLineSelection' before initialization).
    useModalStore.getState().setLineSelection(null);
    ghSelectionAppliedRef.current = null;
    ghCommitRouteAppliedRef.current = null;
    selectionInteractedRef.current = false;
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
      // Accumulate pages in detailRef then one host write — avoid thrashing UI focus.
      let snap = detailRef.current || detailProp;
      if (!snap) return;
      while (!cancelled && gen === commentPrefetchGenRef.current && guard < 40) {
        guard += 1;
        snap = detailRef.current || snap;
        const meta = snap[metaKey] || {};
        if (!meta.hasMore || !meta.nextPage) break;
        try {
          const page = await api.fetchPrCommentsPage(snap.owner, snap.repo, snap.number, {
            kind,
            page: meta.nextPage,
            perPage: meta.perPage || DEFAULT_COMMENT_PAGE_SIZE,
            order: meta.order || undefined,
            preferNewest: false,
          });
          if (cancelled || gen !== commentPrefetchGenRef.current) return;
          const tomb =
            listKey === 'reviewComments'
              ? snap._deletedReviewCommentIds
              : snap._deletedIssueCommentIds;
          const merged = mergeCommentsById(
            snap[listKey] || [],
            page?.items || [],
            tomb
          );
          snap = {
            ...snap,
            [listKey]: merged,
            [metaKey]: advanceCommentsMeta(snap[metaKey], page?.meta, merged.length),
          };
          detailRef.current = snap;
          if (!page?.meta?.hasMore) break;
        } catch {
          break;
        }
      }
      if (snap && !cancelled && gen === commentPrefetchGenRef.current) {
        applyDomainDetailToHost(snap);
      }
    }

    // Defer so conversation paints first page immediately
    const t = window.setTimeout(() => {
      void (async () => {
        await loadKind('issue');
        await loadKind('review');
        if (cancelled || gen !== commentPrefetchGenRef.current) return;
        let snap = detailRef.current || detailProp;
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
            const tomb =
              listKey === 'reviewComments'
                ? snap._deletedReviewCommentIds
                : snap._deletedIssueCommentIds;
            const merged = mergeCommentsById(
              snap[listKey] || [],
              page.items,
              tomb
            );
            snap = {
              ...snap,
              [listKey]: merged,
              [metaKey]: {
                ...(snap[metaKey] || {}),
                newestCreatedAt:
                  page.meta?.newestCreatedAt || snap[metaKey]?.newestCreatedAt,
                maxId: page.meta?.maxId ?? snap[metaKey]?.maxId,
                loadedCount: merged.length,
              },
            };
            detailRef.current = snap;
          } catch {
            /* ignore incremental errors */
          }
        }
        if (snap && !cancelled && gen === commentPrefetchGenRef.current) {
          applyDomainDetailToHost(snap);
        }
      })();
    }, 400);

    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
    // Key only by open + PR identity. Do NOT depend on commentsMeta.hasMore —
    // host write-through after each prefetch would re-fire this effect and thrash.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- host-data-first: meta patches must not restart prefetch
  }, [open, prIdentity]);

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
  // searchQuery is ROOT_FORBIDDEN — leaves use useSearchGroup(); scan
  // watches the store via subscribe (useDiffConversationNav).
  const setSearchQuery = useModalStore((s) => s.setSearchQuery);
  const searchHits = useModalStore((s) => s.searchHits);
  const setSearchHitsStore = useModalStore((s) => s.setSearchHits);
  const setSearchHits = (hits: any, index?: number) => setSearchHitsStore(hits, index);
  const searchHitIndex = useModalStore((s) => s.searchHitIndex);
  const setSearchHitIndex = useModalStore((s) => s.setSearchHitIndex);
  // Multi-file Diff paints active chrome in leaf rows. Root only needs the
  // value when single-file mode changes the actual virtual-row source.
  const activeFilePathForRows = useModalStore((s) =>
    singleFileMode ? s.activeFilePath : null
  );
  const readActiveFilePath = () =>
    String(useModalStore.getState().activeFilePath || '').trim();
  const setActiveFilePath = useModalStore((s) => s.setActiveFilePath);
  const animClass = useModalStore((s) => s.animClass);
  const setAnimClass = useModalStore((s) => s.setAnimClass);
  // commentText: ConversationView leaf-subscribes; App reads getState on submit.
  const setCommentText = useModalStore((s) => s.setCommentText);
  const actionBusy = useModalStore((s) => s.actionBusy);
  const setActionBusy = useModalStore((s) => s.setActionBusy);
  const actionMsg = useModalStore.getState().actionMsg;
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
  // Keep phase ref in sync for Opt/hover reveal (declared below with other refs)
  const setShowSelectionComposer = useModalStore((s) => s.setShowSelectionComposer);
  const selectionIslandLeaving = useModalStore((s) => s.selectionIslandLeaving);
  const setSelectionIslandLeaving = useModalStore((s) => s.setSelectionIslandLeaving);
  // fileQuery is ROOT_FORBIDDEN — FolderFileTree / DiffWorkspace leaf-subscribe.
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
  // paletteQuery: CommandPalette leaf-subscribes (no App value-subscribe).
  const setPaletteQuery = useModalStore((s) => s.setPaletteQuery);
  const [paletteHelpOpen, setPaletteHelpOpen] = useState(false);
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
  /**
   * Diff toolbar multi-select review filter (status chips + settings).
   * Default: unresolved + pending. Empty statuses ≡ all.
   * Deferred copy drives virtualRows / mappedComments so chip --on paints
   * before the heavy list rebuild (toggle felt laggy until Diff took focus).
   */
  const [diffReviewFilter, setDiffReviewFilter] =
    useState<DiffReviewFilterState>(() => {
      try {
        if (typeof window === 'undefined') return createDefaultDiffReviewFilter();
        const g = loadDiffGlobalPrefs(resolveDiffGlobalPrefsStorage(window));
        return createDefaultDiffReviewFilter({ hideOutdated: g.hideOutdated });
      } catch {
        return createDefaultDiffReviewFilter();
      }
    });
  const deferredDiffReviewFilter = useDeferredValue(diffReviewFilter);
  /** Files-nav filters (shared with Diff review nav counts). */
  const [fileExtFilter, setFileExtFilter] = useState(() => new Set<string>());
  const [fileUnreadOnly, setFileUnreadOnly] = useState(false);
  /** File explorer: only paths with ≥1 review thread (any status). */
  const [fileCommentedOnly, setFileCommentedOnly] = useState(false);
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
  /** Same contract as file nav: keep the latest direction, paint one hop/rAF. */
  const pendingConversationNavDeltaRef = useRef(0);
  const conversationNavRafRef = useRef<NavigationFrameHandle | null>(null);
  /** In-thread root/reply hold: keep every visible step to one hop per frame. */
  const pendingThreadReplyDeltaRef = useRef(0);
  const threadReplyNavRafRef = useRef<NavigationFrameHandle | null>(null);
  // Drop keyboard focus and any queued paint when closing or switching PRs.
  useEffect(() => {
    if (conversationNavRafRef.current) {
      conversationNavRafRef.current.cancel();
      conversationNavRafRef.current = null;
    }
    if (threadReplyNavRafRef.current) {
      threadReplyNavRafRef.current.cancel();
      threadReplyNavRafRef.current = null;
    }
    pendingConversationNavDeltaRef.current = 0;
    pendingThreadReplyDeltaRef.current = 0;
    conversationCommentFocusRef.current = null;
    useModalStore.getState().requestConversationNav(null);
    return () => {
      if (conversationNavRafRef.current) {
        conversationNavRafRef.current.cancel();
        conversationNavRafRef.current = null;
      }
      if (threadReplyNavRafRef.current) {
        threadReplyNavRafRef.current.cancel();
        threadReplyNavRafRef.current = null;
      }
      pendingConversationNavDeltaRef.current = 0;
      pendingThreadReplyDeltaRef.current = 0;
    };
  }, [open, prIdentity]);
  const collapseInitRef = useRef<any>(null);
  const selectingRef = useRef<boolean>(false);
  const pointerStartRef = useRef<any>(null);
  /** Shift-click range: finalize as multi (do not collapse head to anchor). */
  const shiftRangeRef = useRef<boolean>(false);
  /**
   * Opt+drag native text-selection gesture is active — on mouseup, auto-copy
   * window.getSelection() and toast. Cleared after copy / cancel.
   */
  const nativeTextSelectDragRef = useRef(false);
  const nativeTextSelectMouseUpRef = useRef<((e: MouseEvent) => void) | null>(
    null
  );
  /**
   * Settle timer after select/move (no longer auto-shows the action group).
   */
  /**
   * True while selection ↑↓ / region hop is settling — hides ShortcutHints and
   * delays action-group floatbar until SELECTION_ACTIONS_REVEAL_MS after last move.
   */
  const selectionNavBusyRef = useRef(false);
  const selectionActionsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  /** Pointer over selected rows / dock — reveal action group without Opt. */
  const selectionHoverRevealRef = useRef(false);
  /** Latest island phase for Opt/hover sync (avoid stale closure). */
  const selectionIslandPhaseRef = useRef<'actions' | 'comment'>('actions');
  selectionIslandPhaseRef.current = selectionIslandPhase;
  /** Coalesce key-repeat line moves to one React update per animation frame. */
  const selectionMoveRafRef = useRef<NavigationFrameHandle | null>(null);
  const pendingSelectionMoveRef = useRef<{ delta: number; shift: boolean } | null>(
    null
  );
  /** Live virtual rows for keydown handoff (avoid stale closure on ↑/↓ exit). */
  const virtualRowsRef = useRef<any[]>([]);
  /**
   * Change-region index for ⌥↑/⌥↓. Rebuilt only when virtualRows ref/length
   * changes — never on every key-hold hop (listChangeRegions is O(n)).
   */
  const changeRegionIndexRef = useRef<{
    list: any[] | null;
    listLength: number;
    index: ChangeRegionIndex | null;
  }>({ list: null, listLength: -1, index: null });
  /** Coalesce ⌥↑/⌥↓ under key-repeat: one region hop per animation frame. */
  const pendingOptArrowDirRef = useRef(0);
  const optArrowRafRef = useRef<NavigationFrameHandle | null>(null);
  /**
   * After multi-reply continuum exits to a line, one reverse arrow re-enters
   * that thread with direction-aware unit seed (P3c). Cleared on other moves.
   */
  const lastExitedMultiReplyRef = useRef<{
    rootId: string;
    /** Array index of the line we exited onto (for reverse adjacency). */
    exitLineArrIdx: number;
    /** Direction used to exit (+1 down / -1 up). */
    exitDelta: number;
  } | null>(null);
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
  /** Position deep-link fully applied (scrolled/focused). */
  const positionAppliedRef = useRef<string | null>(null);
  /** In-flight deep-link verify loop key — avoid stacking timers. */
  const positionInFlightRef = useRef<string | null>(null);
  /**
   * Soft budget exhausted for applyKey@corpusSig — re-try only when the
   * progressive corpus grows (new comments / mapped threads).
   */
  const positionExhaustedRef = useRef<{
    key: string;
    corpus: string;
  } | null>(null);
  const positionVerifyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  /**
   * Active conversation deep-link applyKey (set while verify loop runs).
   * Used so expandDiff can abandon without also killing Diff deep-links
   * (jumpToReviewComment → expandDiff).
   */
  const positionConvDeepLinkKeyRef = useRef<string | null>(null);
  /**
   * User left Conversation (opened Diff) while a conversation deep-link was
   * pending or about to re-enter — never re-steal layout for this applyKey.
   */
  const positionLayoutDismissedRef = useRef<string | null>(null);
  /** Guard deep-link load-more kicks. */
  const positionLoadMoreKickRef = useRef(0);
  /** Skip writing URI until after initial restore settles. */
  const [routeWriteReady, setRouteWriteReady] = useState(false);
  const isMac =
    typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || '');
  const shortcutMod = isMac ? '⌘' : 'Ctrl+';

  // Always re-annotate with gitattributesText so SW fallback defaults cannot
  // skip linguist-generated / binary rules from the fetched attributes file.

  /** Hide whitespace-only noise in Diff — global preference (GitHub w=1 spirit). */
  const [hideWhitespace, setHideWhitespace] = useState(() => {
    try {
      if (typeof window === 'undefined') return false;
      return loadDiffGlobalPrefs(resolveDiffGlobalPrefsStorage(window))
        .hideWhitespace;
    } catch {
      return false;
    }
  });
  /** GraphQL pullRequest id for markFileAsViewed (may differ from REST nodeId). */
  const pullRequestGqlIdRef = useRef<string | null>(null);

  const sourceFiles = useMemo(() => {
    const raw = diffFilesOverride
      ? diffFilesOverride
      : detail?.files || [];
    return applyHideWhitespaceToFiles(raw, hideWhitespace);
  }, [detail?.files, diffFilesOverride, hideWhitespace]);

  const annotatedFiles = useMemo(() => {
    if (!sourceFiles?.length) return [];
    return annotateFilesForCollapse(sourceFiles, detail?.gitattributesText || '');
  }, [sourceFiles, detail?.gitattributesText]);

  /** True after we paged through every commit/file for this PR open. */
  const commitsFullyLoadedRef = useRef(false);
  const filesFullyLoadedRef = useRef(false);
  /** Flight token for ensureAllFiles (0 = idle). Prevents cross-PR stale writes. */
  const filesFlightRef = useRef(0);
  /** Flight token for ensureAllCommits (0 = idle). */
  const commitsFlightRef = useRef(0);
  const filesFlightSeqRef = useRef(0);
  const commitsFlightSeqRef = useRef(0);
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
    filesFlightRef.current = 0;
    commitsFlightRef.current = 0;
    setPrTags(null);
    setPrTagsError(null);
    // Re-apply global hideWhitespace (do not force false on PR switch).
    try {
      setHideWhitespace(
        loadDiffGlobalPrefs(resolveDiffGlobalPrefsStorage(window))
          .hideWhitespace
      );
    } catch {
      /* keep current */
    }
    pullRequestGqlIdRef.current = null;
  }, [prIdentity]);

  // Hydrate Mark file Viewed from GitHub (viewerViewedState) when token allows.
  useEffect(() => {
    if (!open || !detail?.owner || !detail?.repo || !detail?.number) return;
    const api = globalThis.PRTreeFetch;
    if (typeof api?.fetchViewerViewedPaths !== 'function') return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await api.fetchViewerViewedPaths(
          detail.owner,
          detail.repo,
          detail.number
        );
        if (cancelled) return;
        // No-token / unauthorized stub returns { pullRequestId: null, viewedPaths: [] }
        // — must not wipe sessionStorage hydrate of viewedPaths.
        if (!shouldApplyServerViewedPaths(res)) return;
        if (res?.pullRequestId) {
          pullRequestGqlIdRef.current = String(res.pullRequestId);
        }
        if (Array.isArray(res?.viewedPaths)) {
          setViewedPaths(new Set(res.viewedPaths.map(String).filter(Boolean)));
        }
      } catch {
        /* keep session/local viewed set */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, prIdentity, detail?.owner, detail?.repo, detail?.number]);

  const tagsLoadGenRef = useRef(0);
  const tagsLoadedForKeyRef = useRef('');

  const shellBag = useRef<any>({}).current;
  Object.assign(shellBag, {
    onLoadReviewThreadComments,
    onFetchAllPrCommits,
    onFetchAllPrFiles,
    onFetchCompareFiles,
    onPatchDetail,
    onLoadMoreReviewThreads,
    onReplyToThread,
    onResolveThread,
    setPrTags,
    setPrTagsError,
    setPrTagsLoading,
    setCommitListLoading,
    setDiffCommitError,
    setDiffCommitFilter,
    setDiffFilesOverride,
    setDiffCommitLabel,
    setDiffCommitLoading,
    setFileListLoading,
    applyDomainDetailToHost,
    detailProp,
    initialRoute,
    open,
    onClose,
    onRefresh,
    onRestoreNative,
    presentation,
    actionBusy,
    actionMsg,
    actionMsgSeq,
    actionsRef,
    activeFilePathForRows,
    animClass,
    annotatedFiles,
    appLocale,
    applyActionRef,
    assigneeAddRef,
    autoExpandOnFileNav,
    baseBranchRef,
    changeRegionIndexRef,
    closeConfirm,
    closeTimerRef,
    closing,
    closingRef,
    collapseInitRef,
    collapsedFiles,
    commentBoxRef,
    commentIndex,
    commentPrefetchGenRef,
    commitListLoading,
    commitsFlightRef,
    commitsFlightSeqRef,
    commitsFullyLoadedRef,
    compareFetchGenRef,
    compareFilesCacheRef,
    confirmState,
    conversationCommentFocusRef,
    conversationNavRafRef,
    deferredDiffReviewFilter,
    setDiffThreadCollapse,
    detail,
    detailRef,
    diffCommitError,
    diffCommitFilter,
    diffCommitLabel,
    diffCommitLoading,
    diffExpandBusyKey,
    diffExpandedRanges,
    diffFileLines,
    diffFilesOverride,
    diffMode,
    diffReviewFilter,
    diffThreadCollapse,
    editingBody,
    editingComment,
    editorSaveRef,
    embedChrome,
    expandedDirs,
    fileCommentedOnly,
    fileExtFilter,
    fileListLoading,
    fileNav,
    fileNavDragRef,
    fileUnreadOnly,
    filesFlightRef,
    filesFlightSeqRef,
    filesFullyLoadedRef,
    ghCommitRouteAppliedRef,
    ghSelectionAppliedRef,
    hideWhitespace,
    hotkeyBag,
    isEmbed,
    isMac,
    labelAddRef,
    lastExitedMultiReplyRef,
    layoutMode,
    listRef,
    milestoneAddRef,
    modalSize,
    mut,
    mutD,
    nativeTextSelectDragRef,
    nativeTextSelectMouseUpRef,
    optArrowRafRef,
    optHeldRef,
    optHintsSuppressedRef,
    overlayRef,
    paletteHelpOpen,
    paletteOpen,
    pendingConversationNavDeltaRef,
    pendingCrossFileSeedRef,
    pendingOptArrowDirRef,
    pendingReview,
    pendingReviewNodeIdRef,
    pendingSelectionMoveRef,
    pendingThreadReplyDeltaRef,
    picker,
    pickerAnchorRef,
    pointerStartRef,
    positionAppliedRef,
    positionConvDeepLinkKeyRef,
    positionExhaustedRef,
    positionInFlightRef,
    positionLayoutDismissedRef,
    positionLoadMoreKickRef,
    positionVerifyTimerRef,
    prIdentity,
    prTags,
    prTagsError,
    prTagsLoading,
    pullRequestGqlIdRef,
    readActiveFilePath,
    readScrollTop,
    readViewportHeight,
    requestConfirm,
    reverseComments,
    reviewAct,
    reviewBag,
    reviewerAddRef,
    routeRestoreKeyRef,
    routeWriteReady,
    scrollTopRef,
    searchHitIndex,
    searchHits,
    searchInputRef,
    searchOpen,
    selectingRef,
    selectionInteractedRef,
    selectionActionsTimerRef,
    selectionHoverRevealRef,
    selectionIslandLeaving,
    selectionIslandPhase,
    selectionIslandPhaseRef,
    selectionMoveRafRef,
    selectionNavBusyRef,
    setActionBusy,
    setActionMsg,
    setActiveFilePath,
    setAnimClass,
    setCollapsedFiles,
    setCommentIndex,
    setCommentText,
    setDiffMode,
    setDiffFileLines,
    setDiffExpandedRanges,
    setDiffExpandBusyKey,
    setDiffReviewFilter,
    setHideWhitespace,
    setRouteWriteReady,
    setSelectionIslandPhase,
    setEditingBody,
    setEditingComment,
    setExpandedDirs,
    setFileQuery,
    setLayoutMode,
    setLineSelection,
    setPaletteOpen,
    setPaletteQuery,
    setPendingReview,
    setPicker,
    setReplyDrafts,
    setScrollTop,
    setSearchHitIndex,
    setSearchHits,
    setSearchHitsStore,
    setSearchOpen,
    setSearchQuery,
    setSelecting,
    setSelectionDraft,
    setSelectionIslandLeaving,
    setShowSelectionComposer,
    setTimelinePage,
    setViewedPaths,
    setViewportHeight,
    sheetWidth,
    shellFullscreen,
    shellFullscreenHint,
    shellMode,
    shellRef,
    shellResizeDragRef,
    shellResizing,
    shiftRangeRef,
    shortcutMod,
    shortcutMonitorEnabled,
    shortcutMonitorSize,
    showCloseChrome,
    showFullscreenChrome,
    showRestoreNativeChrome,
    showSelectionComposer,
    showShellToggleChrome,
    sideAct,
    sideBag,
    singleFileMode,
    sourceFiles,
    stackPathSelections,
    tagsLoadGenRef,
    tagsLoadedForKeyRef,
    theme,
    threadReplyNavRafRef,
    timelinePage,
    timelineVisibility,
    titleEditSignal,
    uiLanguagePref,
    uiRef,
    viewedPaths,
    viewportHeightRef,
    virtualRowsRef,
    visibleConvThreadNodeIdsRef
  });


  /**
   * Load PR-related tags on first Tags section open (not on mount).
   * Uses repo-level newest-first cache so re-open / other PRs skip rewalk.
   */
  const _useEnsureDiffLoads = useEnsureDiffLoads(shellBag);
  const {
    applyDiffCommitFilter,
    ensureAllCommits,
    ensureAllFiles,
    ensurePrTags
  } = _useEnsureDiffLoads;
  Object.assign(shellBag, {
    applyDiffCommitFilter,
    ensureAllCommits,
    ensureAllFiles,
    ensurePrTags
  });
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
  /**
   * Same thread-level pending count as Diff toolbar (see pendingCount below).
   * Declared early so file/comment filters can exclude pending from empty/all
   * status evaluation when the chip is hidden (count === 0).
   */
  const reviewFilterEvalOpts = useMemo(() => {
    const list = detail?.reviewComments || [];
    let n = 0;
    if (typeof countPendingReviewThreads === 'function') {
      n = Number(countPendingReviewThreads(list)) || 0;
    } else {
      const byId = new Map(
        list
          .filter((c: any) => c?.id != null)
          .map((c: any) => [String(c.id), c])
      );
      n = list.filter((c: any) => {
        if (!c?.pending) return false;
        const parentId = c.inReplyToId ?? c.in_reply_to_id ?? null;
        if (parentId != null && byId.has(String(parentId))) return false;
        return true;
      }).length;
    }
    return { pendingCount: n };
  }, [detail?.reviewComments]);

  /**
   * Files after name/ext/unread/commented filters, then **DFS tree order**
   * (dirs-first + name sort — same as left file explorer).
   * Review-status multi-filter no longer scopes the file list (threads only).
   * Shared by Diff virtual list, file tree, prev/next file nav, and pathOrder.
   */
  const displayFiles = useMemo(() => {
    let list = Array.isArray(annotatedFiles) ? annotatedFiles : [];
    // Name query is applied in FolderFileTree (live fileQuery leaf subscribe).
    list = filterFilesByExtensions(list, fileExtFilter);
    list = filterFilesUnreadOnly(list, viewedPaths, fileUnreadOnly);
    if (typeof filterFilesCommentedOnly === 'function') {
      list = filterFilesCommentedOnly(list, threadCounts, fileCommentedOnly);
    }
    // One order for Diff + explorer + step-nav (not GitHub files[] API order)
    if (typeof filesInTreeOrder === 'function') {
      list = filesInTreeOrder(list);
    }
    return list;
  }, [
    annotatedFiles,
    fileExtFilter,
    viewedPaths,
    fileUnreadOnly,
    fileCommentedOnly,
    threadCounts,
  ]);

  /** Ext chips source: full annotated set (not narrowed by explorer filters). */
  const reviewScopedFiles = annotatedFiles;

  /**
   * Diff virtual list source. In single-file mode only the active (or first)
   * file is flattened to rows; the left tree still uses full displayFiles.
   * Order is already DFS via displayFiles.
   */
  const diffDisplayFiles = useMemo(
    () =>
      typeof resolveDiffDisplayFiles === 'function'
        ? resolveDiffDisplayFiles(
            displayFiles,
            activeFilePathForRows,
            singleFileMode
          )
        : displayFiles,
    [singleFileMode, displayFiles, activeFilePathForRows]
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
    // Deferred: chip selection uses urgent diffReviewFilter; list rebuild lags.
    const f = normalizeDiffReviewFilter(deferredDiffReviewFilter);
    return filterReviewCommentsForDiffNav(
      all,
      f,
      displayPathSet,
      reviewFilterEvalOpts
    );
  }, [
    detail?.reviewComments,
    deferredDiffReviewFilter,
    displayPathSet,
    reviewFilterEvalOpts,
  ]);

  const threads = useMemo(() => {
    const fromComments =
      typeof groupReviewThreads === 'function'
        ? groupReviewThreads(detail?.reviewComments || [])
        : [];
    // Shell GraphQL threads (resolved/collapsed, no bodies yet) still appear
    // so expand can trigger lazy comment load.
    if (typeof mergeReviewThreadGroupsWithShells === 'function') {
      return mergeReviewThreadGroupsWithShells(
        fromComments,
        detail?.reviewThreads || []
      );
    }
    return fromComments;
  }, [detail?.reviewComments, detail?.reviewThreads]);

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
  // Always-current rows for ↑/↓ thread exit handoff (keydown effect is long-lived)
  virtualRowsRef.current = Array.isArray(virtualRows) ? virtualRows : [];

  Object.assign(shellBag, {
    threadCounts,
    unresolvedThreadCounts,
    pendingThreadCounts,
    reviewFilterEvalOpts,
    displayFiles,
    reviewFilteredFiles,
    displayPathSet,
    threadsByCommentId,
    virtualRows,
    virtualRowsRef,
    fileStarts,
  });

  const _useThreadCommentsAndGap = useThreadCommentsAndGap(shellBag);
  const {
    collapseKeyForThread,
    ensureThreadCommentsLoaded,
    isDiffThreadCollapsed,
    onExpandDiffGap,
    onToggleThreadCollapse,
    resolveThreadNodeIdFromCommentId,
    lazyLoadingThreadIds,
  } = _useThreadCommentsAndGap;
  Object.assign(shellBag, {
    collapseKeyForThread,
    ensureThreadCommentsLoaded,
    isDiffThreadCollapsed,
    onExpandDiffGap,
    onToggleThreadCollapse,
    resolveThreadNodeIdFromCommentId
  });

  /**
   * Inline comments (and fold/expand) renumber virtual rowIndex. Selection stores
   * path+line identity — rebind indices so chrome / island dock stay on the
   * same lines instead of vanishing mid-scroll when comments are present.
   */
  useEffect(() => {
    if (typeof rebindSelectionRowIndices !== 'function') return;
    const sel = useModalStore.getState().lineSelection;
    if (!sel) return;
    const next = rebindSelectionRowIndices(sel, virtualRows);
    if (
      next &&
      next !== sel &&
      (Number(next.headRowIndex) !== Number(sel.headRowIndex) ||
        Number(next.anchorRowIndex) !== Number(sel.anchorRowIndex))
    ) {
      setLineSelection(next);
    }
  }, [virtualRows, setLineSelection]);

  const isDiffCommentCollapsed = useCallback(
    (rowOrId: any, resolvedHint?: boolean) => {
      if (rowOrId && typeof rowOrId === 'object' && rowOrId.kind === 'inline-comment') {
        const id = rowOrId.commentId;
        const thread = threadsByCommentId?.get?.(String(id));
        const resolved = Boolean(thread?.resolved ?? rowOrId.resolved);
        const tid =
          rowOrId.threadNodeId ||
          thread?.threadNodeId ||
          thread?.root?.threadNodeId ||
          null;
        return isDiffThreadCollapsed(id, resolved, tid);
      }
      return isDiffThreadCollapsed(rowOrId, Boolean(resolvedHint));
    },
    // lazyLoadingThreadIds is unrelated (loading spinner); do not list it here —
    // the state is declared later in this component and would TDZ-crash every render.
    [diffThreadCollapse, threadsByCommentId]
  );

  const commentHeightOpts = useMemo(
    () => ({
      isCollapsed: (row: any) => isDiffCommentCollapsed(row),
    }),
    [isDiffCommentCollapsed]
  );

  /**
   * Live Diff virtual metrics from VirtualDiff (measure map + expanded lines).
   * Preferred over estimate-only rowOffsetList so ⌥J/K / selection reveal match
   * the on-screen spacer geometry.
   */
  const liveDiffMetricsRef = useRef<{
    offsets: number[] | null;
    avgH: number;
  }>({ offsets: null, avgH: ROW_HEIGHT });

  Object.assign(shellBag, {
    setDiffFileLines,
    setDiffExpandedRanges,
    setDiffExpandBusyKey,
    setDiffReviewFilter,
    onLoadMoreReviewThreads,
    virtualRows,
    virtualRowsRef,
    fileStarts,
    liveDiffMetricsRef,
    commentHeightOpts,
    isDiffCommentCollapsed,
    displayFiles,
    displayPathSet,
    reviewFilterEvalOpts,
    threadsByCommentId,
    threadCounts,
    collapsedFiles,
    viewedPaths,
    detail,
    layoutMode,
    setLayoutMode,
    setLineSelection,
    setActionMsg,
    setScrollTop,
    setCommentIndex,
    commentIndex,
    mappedComments: shellBag.mappedComments,
    listRef,
    readActiveFilePath,
    setActiveFilePath,
    diffMode,
    setDiffMode,
    hideWhitespace,
    setHideWhitespace,
    diffReviewFilter,
    searchHits,
    searchHitIndex,
    searchOpen,
    setSearchOpen,
    setSearchQuery,
    setSearchHits,
    setSearchHitIndex,
    expandDiff: shellBag.expandDiff,
  });

  const _useDiffConversationNav = useDiffConversationNav(shellBag);
  const {
    activeSearchHit,
    activeSearchOccurrence,
    applyGotoQuery,
    applyHideWhitespace,
    applyReviewFilterToggle,
    avgH,
    conversationCommentPageItems,
    expandFileForJump,
    getDiffScrollMetrics,
    isMultiReplyThreadFocused,
    jumpToReviewComment,
    mappedComments,
    navComment,
    navConversationComment,
    navFile,
    navSearch,
    noteDiffNavActivity,
    onSearchClose,
    onSearchLoadComments,
    onSearchNext,
    onSearchPrev,
    onSearchQueryCommit,
    onVirtualMetricsChange,
    optArrowScrollSelect,
    patchDiffReviewFilter,
    pendingCommentJumpRef,
    pendingGotoRef,
    searchBusy,
    repliesForRootCommentId,
    rowOffsetList,
    scheduleDiffReviewFilter,
    scrollConversationPanel,
    scrollDiffPage,
    scrollDiffThreadUnitIntoView,
    scrollFocusedThreadUnitIntoView,
    scrollSelectionIntoView,
    searchMatchRows,
    setActiveFileCollapse,
    setActiveFilePathForNav,
    showLoadComments,
    stepThreadReply,
    toggleActiveFileCollapse,
    toggleViewedActiveFile,
    tryReenterExitedMultiReply
  } = _useDiffConversationNav;
  Object.assign(shellBag, {
    activeSearchHit,
    activeSearchOccurrence,
    applyGotoQuery,
    applyHideWhitespace,
    applyReviewFilterToggle,
    avgH,
    conversationCommentPageItems,
    expandFileForJump,
    getDiffScrollMetrics,
    isMultiReplyThreadFocused,
    jumpToReviewComment,
    mappedComments,
    navComment,
    navConversationComment,
    navFile,
    navSearch,
    noteDiffNavActivity,
    onSearchClose,
    onSearchLoadComments,
    onSearchNext,
    onSearchPrev,
    onSearchQueryCommit,
    onVirtualMetricsChange,
    optArrowScrollSelect,
    patchDiffReviewFilter,
    pendingCommentJumpRef,
    pendingGotoRef,
    searchBusy,
    repliesForRootCommentId,
    rowOffsetList,
    scheduleDiffReviewFilter,
    scrollConversationPanel,
    scrollDiffPage,
    scrollDiffThreadUnitIntoView,
    scrollFocusedThreadUnitIntoView,
    scrollSelectionIntoView,
    searchMatchRows,
    setActiveFileCollapse,
    setActiveFilePathForNav,
    showLoadComments,
    stepThreadReply,
    toggleActiveFileCollapse,
    toggleViewedActiveFile,
    tryReenterExitedMultiReply
  });
  const _useSelectionKeyboard = useSelectionKeyboard(shellBag);
  const {
    applySelectionKeyboardMove,
    clearLineSelectionForNav,
    clearSelectionActionsTimer,
    ensureFileExpandedForSelection,
    flushSelectionKeyboardMove,
    scheduleSelectionActionsReveal,
    scrollSelectionHeadDomOnly,
    setSelectionHoverReveal,
    setSelectionNavBusy,
    syncActiveFileFromSelection,
    syncSelectionActionReveal
  } = _useSelectionKeyboard;
  Object.assign(shellBag, {
    applySelectionKeyboardMove,
    clearLineSelectionForNav,
    clearSelectionActionsTimer,
    ensureFileExpandedForSelection,
    flushSelectionKeyboardMove,
    scheduleSelectionActionsReveal,
    scrollSelectionHeadDomOnly,
    setSelectionHoverReveal,
    setSelectionNavBusy,
    syncActiveFileFromSelection,
    syncSelectionActionReveal
  });
  const _usePrModalSessionRoute = usePrModalSessionRoute(shellBag);
  const { abandonConversationPositionDeepLink, uriWasOpenRef } = _usePrModalSessionRoute;
  Object.assign(shellBag, { abandonConversationPositionDeepLink });
  function expandDiff(after?: any) {
    // Empty-commit PRs (0 files) have no Diff surface — stay on Conversation.
    // Host-data-first: read host projection (detailProp/ref), not removed store.localDetail.
    const liveDetail = detailRef.current || detail || null;
    if (
      typeof isDiffUnavailable === 'function' &&
      isDiffUnavailable(liveDetail)
    ) {
      return;
    }
    abandonConversationPositionDeepLink();
    setAnimClass('');
    setLayoutMode(LAYOUT_DIFF);
    after?.();
  }

  function collapseDiff() {
    setAnimClass('');
    setLayoutMode(LAYOUT_CENTERED);
  }

  function onToggleDiff() {
    // Live store — avoid stale render-closure layoutMode under key-hold /
    // peer-opt → runPaletteCommand paths (monitor fired but layout stuck).
    const live =
      useModalStore.getState().layoutMode || layoutMode;
    if (live === LAYOUT_DIFF) {
      collapseDiff();
      return;
    }
    expandDiff();
  }
  Object.assign(shellBag, { expandDiff, collapseDiff, onToggleDiff });

  // If meta settles to 0 files while Diff is open (or deep-link forced Diff)
  // before meta), leave Diff — empty-commit PRs have no file surface.
  useEffect(() => {
    if (!open) return;
    const liveDetail = detailRef.current || detail || null;
    if (
      typeof isDiffUnavailable !== 'function' ||
      !isDiffUnavailable(liveDetail)
    ) {
      return;
    }
    if (useModalStore.getState().layoutMode === LAYOUT_DIFF) {
      setLayoutMode(LAYOUT_CENTERED);
    }
  }, [open, detail?.changedFiles, detail?.additions, detail?.deletions, detail?.files, setLayoutMode]);

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
   * After Close PR (open→closed, not merged), auto-close the shell so the user
   * returns to the pulls list. Merge stays open so optional Delete branch CTA
   * is usable. Does not close when opening an already-closed/merged PR.
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
    if (
      shouldAutoCloseOnTerminalTransition({
        wasTerminal: terminalCloseWasTerminalRef.current,
        isTerminal,
        merged: Boolean(detail.merged),
      })
    ) {
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
  // Install Diff nav perf DevTools API once (no-op when disabled).
  useEffect(() => {
    try {
      installDiffNavPerfGlobal();
    } catch {
      /* ignore */
    }
  }, []);
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
    foldCollapse?: () => boolean;
    foldExpand?: () => boolean;
    gotoDiff: () => boolean;
    comment: () => boolean;
    resolve: () => boolean;
  } | null>(null);
  Object.assign(shellBag, {
    contextThreadActionsRef,
    asideToggleRef,
    onToggleFileNavCollapse,
  });
  const _useContextThreadActions = useContextThreadActions(shellBag);
  const {
    ensureDiffContextThread,
    getActiveDiffContextThread,
    onRegisterContextThreadActions,
    runContextThreadAction,
    runDiffContextThreadAction,
    toggleSidePanel
  } = _useContextThreadActions;
  Object.assign(shellBag, {
    ensureDiffContextThread,
    getActiveDiffContextThread,
    onRegisterContextThreadActions,
    runContextThreadAction,
    runDiffContextThreadAction,
    toggleSidePanel
  });
  function onFileNavResizeStart(e: React.PointerEvent) {
    if (fileNav.collapsed) return;
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = clampFileNavWidth(fileNav.width);
    fileNavDragRef.current = { startX, startWidth };
    const target = e.currentTarget as HTMLElement;
    const layout = target.closest('.prp-diff-layout');
    layout?.classList.add('prp-diff-layout--resizing');
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
      layout?.classList.remove('prp-diff-layout--resizing');
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
    const p = String(path || '').trim();
    if (!p) return;
    const prevPath = readActiveFilePath();
    // Same-file re-select under key-hold: skip clear + rebuild + scroll pin.
    if (p === prevPath) {
      return;
    }
    setActiveFilePathForNav(p);
    // Drop prior-file line selection so the next Arrow seeds the first
    // selectable (displayed) line of this file.
    clearLineSelectionForNav();
    // Optional auto-expand (pref; default off). Explicit jumps still expand.
    // Use expandPathInCollapsedSet so emptying the set does not re-collapse
    // the path via isPathCollapsed's empty-set + viewedPaths branch.
    if (autoExpandOnFileNav) {
      setCollapsedFiles((prev: any) => {
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
    const idx = fileStarts.get(p);
    if (typeof idx === 'number') {
      // Pin each file header. VirtualDiff renders this hop from the synchronous
      // scroll event; the scrollTop store remains only an idle snapshot.
      const { avgH: h, rowOffsetList: offs } = getDiffScrollMetrics();
      const top = scrollTopForIndex(
        idx,
        h,
        viewportHeightRef.current,
        virtualRows.length,
        offs,
        { align: 'start' }
      );
      const el = listRef.current as HTMLElement | null;
      applyProgrammaticDiffScroll(el, top, {
        storeTop: useModalStore.getState().scrollTop,
        setStoreTop: setScrollTop,
        minDomDelta: 0.5,
        // Visible rows already commit above; skip only the redundant store mirror.
        minStoreDelta: Number.POSITIVE_INFINITY,
      });
    }
  }

  Object.assign(shellBag, { onSelectFile });
  function onToggleDir(path: any) {
    setExpandedDirs((prev: any) => {
      const n = new Set(prev);
      if (n.has(path)) n.delete(path);
      else n.add(path);
      return n;
    });
  }

  function onToggleFileCollapse(path: any) {
    // Materialize defaults first so toggling one path does not open every
    // other binary/huge/generated/viewed file that only collapsed via defaults.
    setCollapsedFiles((prev: any) =>
      typeof togglePathInCollapsedSet === 'function'
        ? togglePathInCollapsedSet(prev, path, annotatedFiles, viewedPaths)
        : (() => {
            const n = materializeCollapsedPaths(
              prev,
              annotatedFiles,
              viewedPaths
            );
            if (n.has(path)) n.delete(path);
            else n.add(path);
            return n;
          })()
    );
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

  function focusConversationCommentItem() {
    // Always land on conversation layout so the timeline is visible.
    // Scroll then focus via ConversationKbFocusScroller (leaf store sub).
    if (layoutMode === LAYOUT_DIFF) collapseDiff();
    const ordered = conversationCommentPageItems;
    const target =
      typeof pickConversationCommentFocusTarget === 'function'
        ? pickConversationCommentFocusTarget(ordered, { reverseComments })
        : null;
    if (!target) {
      conversationCommentFocusRef.current = null;
      useModalStore.getState().requestConversationNav(null);
      return;
    }
    conversationCommentFocusRef.current = target;
    useModalStore.getState().requestConversationNav(target.anchor);
  }

  /**
   * Clear keyboard/thread focus chrome (Conversation ring + Diff hit ring).
   * Diff ⌥J/K sets commentIndex which paints `.prp-vline--hit` until cleared.
   */
  function clearConversationCommentFocus() {
    conversationCommentFocusRef.current = null;
    useModalStore.getState().requestConversationNav(null);
    if (useModalStore.getState().commentIndex >= 0) setCommentIndex(-1);
    useModalStore.getState().setActiveDiffCommentId(null);
  }

  /** Drop Diff thread caret / hit ring when focus moves to code/file selection. */
  function clearDiffThreadFocusIfNeeded() {
    const st = useModalStore.getState();
    if (st.commentIndex >= 0) setCommentIndex(-1);
    if (st.activeDiffCommentId != null) st.setActiveDiffCommentId(null);
  }

  function dismissSelectionIsland(after?: any) {
    clearSelectionActionsTimer();
    setSelectionNavBusy(false);
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

  function collectPeopleLogins(exclude: any = []) {
    const excludeSet = new Set((exclude || []).map((x: any) => String(x || '').toLowerCase()));
    const names = new Set();
    const add = (login: any) => {
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

  // Multi-select: do not auto-clear status chips when counts hit zero
  // (user may keep unresolved+pending selected across refresh races).

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
    Object.assign(reviewBag, {
      detail,
      detailRef,
      setActionBusy,
      setActionMsg,
      setCommentText,
      focusCommentBox,
      commitCommentListPatch,
      applyDomainDetail: applyDomainDetailToHost,
      applyDomainDetailToHost,
      pendingReviewNodeIdRef,
      serverPendingReviewId,
      hasServerPending,
      serverPendingComments,
      stripPendingReviewFromDetail,
      discardPendingReview,
      setPendingReview,
      onRefresh,
      layoutMode,
      collapseDiff,
      conversationCommentFocusRef,
      isReviewVerdictKind,
      isViewerPrAuthor,
      mapLeaveReviewAction,
      LAYOUT_DIFF,
      optimisticConversationAnchorForKind,
    });
    return reviewAct.onLeaveReviewAction(kind, opts);
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

  /** Soft-refresh entry shared by header, palette, and ⌥⇧G peer. */
  function refreshDetail() {
    try {
      const n =
        Number(
          document.documentElement.getAttribute('data-prp-refresh-seq') || 0
        ) + 1;
      document.documentElement.setAttribute('data-prp-refresh-seq', String(n));
      document.documentElement.setAttribute(
        'data-prp-last-refresh-at',
        String(Date.now())
      );
      document.documentElement.setAttribute(
        'data-prp-last-refresh-mode',
        layoutMode === LAYOUT_DIFF ? 'full-threads' : 'visible-threads'
      );
    } catch {
      /* ignore */
    }
    if (typeof onRefresh !== 'function') return;
    return onRefresh({
      mode: layoutMode === LAYOUT_DIFF ? 'full-threads' : 'visible-threads',
      threadNodeIds:
        layoutMode === LAYOUT_DIFF
          ? undefined
          : visibleConvThreadNodeIdsRef.current.slice(),
    });
  }

  function runPaletteCommand(cmd: any) {
    runPaletteCommandImpl(
      {
        setPaletteHelpOpen,
        setPaletteOpen,
        setPaletteQuery,
        openStackOrListPr,
        navigateAdjacentPr,
        focusConversationCommentItem,
        clearConversationCommentFocus,
        applyReviewFilterToggle,
        applySelectionKeyboardMove,
        openSelectionComposer: () => {},
        copySelectionCode,
        copySelectionUrl,
        onToggleDiff,
        toggleSidePanel,
        setSearchOpen,
        setSearchQuery,
        setSearchHits,
        setSearchHitIndex,
        // Must be a real binding — bare `toggleFullscreen` was never declared and
        // threw ReferenceError for every palette/peer action (monitor fired, no UI).
        toggleFullscreen: () => {
          if (!isEmbed) {
            setShellFullscreen((prev) => toggleShellFullscreen(prev));
          }
        },
        startEditTitle: () => setTitleEditSignal((n) => n + 1),
        startEditBody: () => setEditingBody(true),
        openBasePicker,
        onSetDraftStage,
        onMergePr,
        onUpdateBranch,
        onSubscribe,
        // unsubscribe is onSubscribe(false) in the runner; no separate binding
        openMilestonePicker: () => openMilestonePicker?.(),
        clearMilestone: (): any => void applyMilestoneNumber(null),
        onSetMilestone,
        onRerequestReview,
        openReviewerPicker,
        openAssigneePicker,
        onRemoveReviewer,
        onRemoveAssignee,
        openLabelPicker,
        onRefresh: refreshDetail,
        onLeaveReviewAction,
        onClosePr,
        onReopenPr,
        applySetLabels,
        detail,
        layoutMode,
        LAYOUT_DIFF,
        applyActionRef,
        setActionMsg,
        focusCommentBox,
        collapseActiveFile: () => setActiveFileCollapse(true),
        expandActiveFile: () => setActiveFileCollapse(false),
        // Fold / context-thread cases use setActiveFileCollapse + runContextThreadAction
        stepNavPrev: () => {
          if (useModalStore.getState().searchOpen) navSearch(-1);
          else if (useModalStore.getState().layoutMode === LAYOUT_DIFF) {
            navComment(-1);
          } else navConversationComment(-1);
        },
        stepNavNext: () => {
          if (useModalStore.getState().searchOpen) navSearch(1);
          else if (useModalStore.getState().layoutMode === LAYOUT_DIFF) {
            navComment(1);
          } else navConversationComment(1);
        },
        scrollDiffPage,
        optArrowScrollSelect,
        toggleViewedActiveFile,
        toggleActiveFileCollapse,
        scrollConversationPanel,
        navConversationComment,
        navComment,
        navSearch,
        navFile,
        runContextThreadAction,
        searchOpen,
        searchInputRef,
        setTitleEditSignal,
        setEditingBody,
        setSelectionIslandPhase,
        setShowSelectionComposer,
        setPicker,
        closePicker,
        useModalStore,
        uiRef,
        onToggleShellFullscreen: () => {
          if (!isEmbed) {
            setShellFullscreen((prev) => toggleShellFullscreen(prev));
          }
        },
        moveSelectionUp: () => applySelectionKeyboardMove(-1, false),
        moveSelectionDown: () => applySelectionKeyboardMove(1, false),
        extendSelectionUp: () => applySelectionKeyboardMove(-1, true),
        extendSelectionDown: () => applySelectionKeyboardMove(1, true),
        setActiveFileCollapse,
        applyGotoQuery,
        onDiscardPendingReview,
        onReplyToThread,
        onResolveThread,
      },
      cmd
    );
  }

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
      locale: appLocale,
    });
  }, [detail, stackItems, openPulls, layoutMode, appLocale]);

  /** Async PR search boundary for palette `#…` mode (injectable fetch). */
  const searchPalettePrs = useCallback(
    async (term: string, signal?: AbortSignal | null) => {
      const owner = String(detail?.owner || '').trim();
      const repo = String(detail?.repo || '').trim();
      const api = globalThis.PRTreeFetch;
      if (!owner || !repo || typeof api?.fetchOpenPulls !== 'function') {
        return [];
      }
      const prs = await api.fetchOpenPulls(owner, repo, null, {
        signal: signal || null,
      });
      // Filter is applied by CommandPalette pure helpers; return full remote list
      return Array.isArray(prs) ? prs : [];
    },
    [detail?.owner, detail?.repo]
  );


  function onSelectionStart(row: any, point: any, opts: any = {}) {
    // Drop sticky focus on toolbar radios (Unified/Split) so subsequent
    // Arrow keys move the line selection, not the radiogroup.
    try {
      const ae =
        typeof document !== 'undefined'
          ? (document.activeElement as HTMLElement | null)
          : null;
      if (
        ae &&
        !isEditableKeyboardTarget(ae) &&
        typeof ae.blur === 'function' &&
        (ae.tagName === 'INPUT' || ae.tagName === 'BUTTON')
      ) {
        ae.blur();
      }
    } catch {
      /* ignore */
    }
    const shiftKey = Boolean(opts?.shiftKey);
    const preferredSide =
      String(opts?.preferredSide || 'RIGHT').toUpperCase() === 'LEFT'
        ? 'LEFT'
        : 'RIGHT';
    const prev = useModalStore.getState().lineSelection;
    let next = null;
    let keepRange = false;
    if (typeof applySelectionPointerDown === 'function') {
      const result = applySelectionPointerDown(prev, row, {
        shiftKey,
        preferredSide,
        altKey: Boolean(opts?.altKey),
        // Event/DOM latch only — a leftover optHeldRef must not turn header
        // or body clicks into native-text (P3b.2 leftover multi-line).
        optHeld: Boolean(opts?.optHeld),
        metaKey: Boolean(opts?.metaKey),
        ctrlKey: Boolean(opts?.ctrlKey),
      });
      // Opt+drag: native text selection — do not enter line-selection drag.
      if (result.mode === 'native-text' || result.mode === 'ignore') {
        shiftRangeRef.current = false;
        if (result.mode === 'native-text' || opts?.nativeTextSelect) {
          selectingRef.current = false;
          setSelecting(false);
          armNativeTextSelectCopy();
        }
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
        next = beginLineSelection(row, preferredSide);
        keepRange = false;
      }
    }
    if (!next) {
      shiftRangeRef.current = false;
      return;
    }
    shiftRangeRef.current = keepRange;
    selectingRef.current = true;
    selectionInteractedRef.current = true;
    pointerStartRef.current = point || null;
    setSelecting(true);
    setLineSelection(next);
    // Code/file pointer selection leaves Diff thread keyboard focus
    const isThreadSel =
      next.kind === 'thread' ||
      next.subjectType === 'thread' ||
      next.kind === 'inline-comment';
    if (!isThreadSel) {
      clearDiffThreadFocusIfNeeded();
    } else if (next.commentId != null && Array.isArray(mappedComments)) {
      const tIdx = mappedComments.findIndex(
        (c: any) => String(c?.id) === String(next.commentId)
      );
      if (tIdx >= 0 && tIdx !== commentIndex) setCommentIndex(tIdx);
    }
    // Hide island while dragging; reveal after pointer-up idle delay
    clearSelectionActionsTimer();
    setSelectionNavBusy(true);
    setShowSelectionComposer(false);
  }

  function onSelectionExtend(row: any) {
    if (!selectingRef.current || typeof extendLineSelection !== 'function') return;
    setLineSelection((prev: any) => extendLineSelection(prev, row) || prev);
  }

  function disarmNativeTextSelectCopy() {
    nativeTextSelectDragRef.current = false;
    const fn = nativeTextSelectMouseUpRef.current;
    nativeTextSelectMouseUpRef.current = null;
    if (fn && typeof window !== 'undefined') {
      try {
        window.removeEventListener('mouseup', fn, true);
      } catch {
        /* ignore */
      }
    }
  }

  /**
   * After Opt+drag text selection ends: copy selected text + toast.
   * Defer one task so the browser finishes the selection before getSelection().
   * Do not use rAF: hidden/headless tabs may suspend rendering indefinitely.
   * @param {string} [forcedText] optional override (e2e / custom event)
   */
  function finishNativeTextSelectCopy(forcedText?: string) {
    if (!nativeTextSelectDragRef.current && forcedText == null) return;
    disarmNativeTextSelectCopy();
    const run = async () => {
      try {
        let text = String(forcedText ?? '');
        if (!text) {
          const sel =
            typeof window !== 'undefined' &&
            typeof window.getSelection === 'function'
              ? window.getSelection()
              : null;
          text =
            typeof browserSelectionCopyText === 'function'
              ? browserSelectionCopyText(sel)
              : String(sel?.toString?.() || '').trim();
        }
        // Page-world e2e may stamp selected text (isolated worlds don't share
        // window.getSelection stubs).
        if (!text) {
          try {
            text = String(
              document.documentElement.getAttribute(
                'data-prp-native-select-text'
              ) || ''
            );
          } catch {
            /* ignore */
          }
        }
        text =
          typeof browserSelectionCopyText === 'function'
            ? browserSelectionCopyText({ toString: () => text })
            : text.trim()
              ? text
              : '';
        if (!text) return;
        const ok = await copyTextToClipboard(text);
        try {
          const root =
            typeof document !== 'undefined' ? document.documentElement : null;
          if (root) {
            root.setAttribute(
              'data-prp-last-copied-text',
              text.slice(0, 2000)
            );
            root.setAttribute('data-prp-last-copy-text-ok', ok ? '1' : '0');
            root.removeAttribute('data-prp-native-select-text');
          }
        } catch {
          /* ignore */
        }
        const msg = ok
          ? formatMessage('toast_text_copied', appLocale)
          : formatMessage('toast_copy_failed', appLocale);
        setActionMsg(msg);
      } catch {
        setActionMsg(formatMessage('toast_copy_failed', appLocale));
      }
    };
    if (typeof setTimeout === 'function') {
      setTimeout(() => void run(), 0);
    } else {
      void run();
    }
  }

  function armNativeTextSelectCopy() {
    if (nativeTextSelectDragRef.current && nativeTextSelectMouseUpRef.current) {
      // Already armed for this gesture
      return;
    }
    disarmNativeTextSelectCopy();
    nativeTextSelectDragRef.current = true;
    if (typeof window === 'undefined') return;
    const onUp = () => {
      finishNativeTextSelectCopy();
    };
    nativeTextSelectMouseUpRef.current = onUp;
    try {
      window.addEventListener('mouseup', onUp, true);
    } catch {
      /* ignore */
    }
  }

  // Opt+drag native text: arm auto-copy from React path and page CustomEvent
  // (e2e / capture bridges may not hit React onMouseDown reliably).
  useEffect(() => {
    if (!open || layoutMode !== LAYOUT_DIFF) return undefined;
    const onStart = () => {
      armNativeTextSelectCopy();
    };
    const onEnd = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      const forced =
        detail && typeof detail.text === 'string' ? detail.text : undefined;
      if (!nativeTextSelectDragRef.current) {
        // End without start (page-world only path) — still try copy if text given
        if (forced != null && String(forced).trim()) {
          nativeTextSelectDragRef.current = true;
          finishNativeTextSelectCopy(String(forced));
        }
        return;
      }
      finishNativeTextSelectCopy(forced);
    };
    const onDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      if (
        !e.altKey &&
        !(
          typeof document !== 'undefined' &&
          document.documentElement?.hasAttribute?.('data-prp-opt-held')
        )
      ) {
        return;
      }
      const t = e.target as HTMLElement | null;
      if (!t?.closest) return;
      if (
        !t.closest(
          '.prp-vline--selectable .prp-code, .prp-vline--selectable code.prp-code, .prp-vline--selectable'
        )
      ) {
        return;
      }
      if (t.closest('.prp-line-expand-btn, button, input, a, textarea')) return;
      armNativeTextSelectCopy();
    };
    try {
      document.addEventListener('prp-native-text-select-start', onStart as any);
      document.addEventListener('prp-native-text-select-end', onEnd as any);
      window.addEventListener('mousedown', onDown, true);
    } catch {
      /* ignore */
    }
    return () => {
      try {
        document.removeEventListener(
          'prp-native-text-select-start',
          onStart as any
        );
        document.removeEventListener(
          'prp-native-text-select-end',
          onEnd as any
        );
        window.removeEventListener('mousedown', onDown, true);
      } catch {
        /* ignore */
      }
      disarmNativeTextSelectCopy();
    };
  }, [open, layoutMode]);

  function onSelectionEnd(point: any, forcedMode: any) {
    // Opt+drag native text path never sets selectingRef — still finalize copy.
    if (nativeTextSelectDragRef.current) {
      finishNativeTextSelectCopy();
      return;
    }
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
    setLineSelection((prev: any) => {
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
  function onFileHeaderComment(filePath: string, headerRow?: any) {
    const path = String(filePath || '').trim();
    if (!path) return;
    // Dismiss line selection if any; open file-level composer
    setSelecting(false);
    selectingRef.current = false;
    setSelectionIslandLeaving(false);
    const idx = Number(headerRow?.rowIndex);
    const rowIndex = Number.isFinite(idx)
      ? idx
      : (() => {
          const list = Array.isArray(virtualRows) ? virtualRows : [];
          const h = list.find(
            (r: any) =>
              r?.kind === 'file-header' &&
              String(r.filePath || r.path || '') === path
          );
          const i = Number(h?.rowIndex);
          return Number.isFinite(i) ? i : null;
        })();
    setLineSelection({
      kind: 'file',
      subjectType: 'file',
      filePath: path,
      anchorRowIndex: rowIndex,
      headRowIndex: rowIndex,
    });
    setSelectionDraft('');
    setSelectionIslandPhase('comment');
    setShowSelectionComposer(true);
  }

  async function postSelectionLineComment(payload: any, { asPending = false } = {}) {
    Object.assign(reviewBag, {
      detail,
      detailRef,
      pendingReviewNodeIdRef,
      serverPendingReviewId,
      commitCommentListPatch,
    });
    return reviewAct.postSelectionLineComment(payload, { asPending });
  }

  function selectionActionMessage(payload: any, isPending: boolean) {
    return reviewAct.selectionActionMessage(payload, isPending);
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
      const { isPending } = await postSelectionLineComment(payload, {
        asPending: false,
      });
      setActionMsg(selectionActionMessage(payload, isPending));
      dismissSelectionIsland();
      // postSelectionLineComment already write-through host cache (pessimistic).
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
      // Host cache updated in postSelectionLineComment — no soft-refresh race.
    } catch (err: any) {
      // GitHub 422 on locked PRs (e.g. demo DEMO_PR) — clear product message, not silent no-op
      const format =
        typeof formatStartReviewError === 'function'
          ? formatStartReviewError
          : (e: any) => String(e?.message || e || '');
      setActionMsg(format(err));
    } finally {
      setActionBusy(false);
    }
  }


  /**
   * Thread reply — Diff-style dual actions:
   * - mode `comment`: publish immediately when possible
   * - mode `pending`: Start review / Add comment (PENDING review)
   */








  async function onDeleteHeadBranch() {
    Object.assign(sideBag, {
      detail,
      detailRef,
      setActionBusy,
      setActionMsg,
      applyDomainDetailToHost,
      requestConfirm,
    });
    return sideAct.onDeleteHeadBranch();
  }

  async function applyMilestoneNumber(
    milestone: number | null,
    opts: { titleHint?: string } = {}
  ) {
    Object.assign(sideBag, {
      detail,
      detailRef,
      setActionBusy,
      setActionMsg,
      commitMetaPatch,
      timelineActorFromDetail,
    });
    return sideAct.applyMilestoneNumber(milestone, opts);
  }

  async function openMilestonePicker() {
    Object.assign(sideBag, {
      detail,
      setActionBusy,
      setActionMsg,
      setPicker,
      closePicker,
      pickerAnchorRef,
      milestoneAddRef,
      buildMilestoneOptions,
      commitMetaPatch,
      timelineActorFromDetail,
      detailRef,
      applyMilestoneNumber: sideAct.applyMilestoneNumber,
    });
    return sideAct.openMilestonePicker();
  }

  async function onSetMilestone(clear = false) {
    Object.assign(sideBag, {
      detail,
      detailRef,
      setActionBusy,
      setActionMsg,
      commitMetaPatch,
      timelineActorFromDetail,
      requestConfirm,
      setPicker,
      closePicker,
      pickerAnchorRef,
      milestoneAddRef,
      buildMilestoneOptions,
    });
    return sideAct.onSetMilestone(clear);
  }

  async function onUploadFile(fileMeta: {
    file: File;
    name?: string;
    type?: string;
    size?: number;
  }): Promise<string> {
    Object.assign(sideBag, {
      detail,
      buildAssetRepoPath,
      videoAttachmentUploadFailed: formatMessage(
        'upload_video_failed',
        appLocale
      ),
    });
    return sideAct.onUploadFile(fileMeta);
  }

  async function applyRerequestReviewers(logins: string[]) {
    Object.assign(sideBag, {
      detail,
      setActionBusy,
      setActionMsg,
      commitMetaPatch,
      timelineActorFromDetail,
    });
    return sideAct.applyRerequestReviewers(logins);
  }

  function openRerequestReviewerPicker() {
    Object.assign(sideBag, {
      detail,
      setActionMsg,
      setPicker,
      closePicker,
      pickerAnchorRef,
      reviewerAddRef,
      collectPeopleLogins,
      buildPeopleOptions,
      buildRerequestReviewerLogins,
      commitMetaPatch,
      timelineActorFromDetail,
      setActionBusy,
    });
    return sideAct.openRerequestReviewerPicker();
  }

  async function onRerequestReview() {
    Object.assign(sideBag, {
      detail,
      setActionBusy,
      setActionMsg,
      commitMetaPatch,
      timelineActorFromDetail,
      requestConfirm,
      setPicker,
      closePicker,
      pickerAnchorRef,
      reviewerAddRef,
      collectPeopleLogins,
      buildPeopleOptions,
      buildRerequestReviewerLogins,
    });
    return sideAct.onRerequestReview();
  }

  async function onRerequestReviewer(login: any) {
    Object.assign(sideBag, {
      detail,
      setActionBusy,
      setActionMsg,
      commitMetaPatch,
      timelineActorFromDetail,
      isBotAccount,
      buildRerequestReviewerLogins,
    });
    return sideAct.onRerequestReviewer(login);
  }

  async function onLoadReactors(target: {
    kind: 'issue' | 'review' | 'pr';
    commentId: string | number;
    nodeId?: string | null;
    number?: number | null;
  }) {
    Object.assign(sideBag, {
      detail,
      applyDomainDetailToHost,
      patchHostDetail,
      commitCommentListPatch,
    });
    return sideAct.onLoadReactors(target);
  }

  async function onToggleReaction(
    target: {
      kind: 'issue' | 'review' | 'pr';
      commentId: string | number;
      nodeId?: string | null;
      number?: number | null;
    },
    content: string,
    currentlyReacted: boolean
  ) {
    Object.assign(sideBag, {
      detail,
      detailRef,
      setActionMsg,
      commitCommentListPatch,
    });
    return sideAct.onToggleReaction(target, content, currentlyReacted);
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
    hasLineSelection: isCodeBodySelection(
      useModalStore.getState().lineSelection
    ),
  };
  actionsRef.current = {
    onClose: requestClose,
    onToggleDiff,
    collapseDiff,
    closePicker,
    focusConversationCommentItem,
    clearConversationCommentFocus,
    runContextThreadAction,
    // Live refs so capture-phase keydown (deps only open/isEmbed) always hits
    // current continuum / re-entry latch logic.
    isMultiReplyThreadFocused,
    stepThreadReply,
    applySelectionKeyboardMove,
    tryReenterExitedMultiReply,
    // Tab-leave from focused thread composer (next/prev comment)
    stepContextThreadFromTab: (dir: number) => {
      const d = dir < 0 ? -1 : 1;
      const live =
        useModalStore.getState().layoutMode || layoutMode;
      if (live === LAYOUT_DIFF) navComment(d);
      else navConversationComment(d);
    },
    openSelectionComment: () => {
      setSelectionIslandPhase('comment');
      setShowSelectionComposer(true);
      // Keep island mounted while focus settles (comment phase policy).
      selectionIslandPhaseRef.current = 'comment';
      try {
        const liveSel = useModalStore.getState().lineSelection;
        if (liveSel) scrollSelectionIntoView(liveSel);
      } catch {
        /* ignore */
      }
      // ⌥C: land focus in the selection comment box (thread / finish parity).
      const focusSelectionComposer = () => {
        try {
          // Prefer active Diff panel so keep-alive Conversation cannot win.
          const activePanel = document.querySelector(
            '.prp-body-panel--active'
          ) as HTMLElement | null;
          const scope = activePanel || document;
          const root =
            (scope.querySelector(
              '[data-prp-composer-kind="selection"][data-prp-composer-root="1"]'
            ) as HTMLElement | null) ||
            (scope.querySelector(
              '.prp-selection-island--comment[data-prp-composer-root="1"]'
            ) as HTMLElement | null) ||
            (document.querySelector(
              '[data-prp-composer-kind="selection"][data-prp-composer-root="1"]'
            ) as HTMLElement | null);
          if (!root) return false;
          try {
            root.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
          } catch {
            /* ignore */
          }
          const mdc =
            (root.querySelector(
              '[data-prp-composer], .prp-mdc'
            ) as HTMLElement | null) || root;
          try {
            // Listeners live on the mdc root — dispatch there (not only parent).
            mdc.dispatchEvent(
              new CustomEvent('prp-composer-focus-input', {
                bubbles: true,
                cancelable: true,
              })
            );
          } catch {
            /* ignore */
          }
          let ta =
            (root.querySelector(
              'textarea.prp-mdc__ta, [data-prp-composer-input], textarea'
            ) as HTMLTextAreaElement | null) || null;
          if (!ta) {
            // forceOpen may still be mounting — open ghost if present
            const ghost = root.querySelector(
              'button.prp-mdc__ghost, .prp-mdc__ghost'
            ) as HTMLButtonElement | null;
            if (ghost && !ghost.disabled) {
              try {
                ghost.dispatchEvent(
                  new MouseEvent('mousedown', {
                    bubbles: true,
                    cancelable: true,
                  })
                );
                ghost.click();
              } catch {
                /* ignore */
              }
              ta =
                (root.querySelector(
                  'textarea.prp-mdc__ta, [data-prp-composer-input], textarea'
                ) as HTMLTextAreaElement | null) || null;
            }
          }
          if (!ta || ta.disabled) return false;
          try {
            // Click then focus — some Chromium paths ignore focus() until the
            // control has received a user-gesture-like activation.
            ta.click?.();
            ta.focus({ preventScroll: true });
          } catch {
            try {
              ta.focus();
            } catch {
              /* ignore */
            }
          }
          try {
            const len = String(ta.value || '').length;
            ta.setSelectionRange?.(len, len);
          } catch {
            /* ignore */
          }
          const ok =
            document.activeElement === ta ||
            root.contains(document.activeElement);
          if (!ok) {
            // Last resort: focus without preventScroll
            try {
              ta.focus();
            } catch {
              /* ignore */
            }
          }
          return (
            document.activeElement === ta ||
            root.contains(document.activeElement)
          );
        } catch {
          return false;
        }
      };
      // Island mounts after phase paint / virtual scroll — retry longer so
      // CDP/automation still lands focus before e2e probes (~500ms).
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (focusSelectionComposer()) return;
          const delays = [40, 80, 120, 200, 320, 480, 700];
          const runAt = (i: number) => {
            if (i >= delays.length) return;
            window.setTimeout(() => {
              if (focusSelectionComposer()) return;
              runAt(i + 1);
            }, delays[i]);
          };
          runAt(0);
        });
      });
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
    toggleActiveFileCollapse,
    setActiveFileCollapse,
    applyReviewFilterToggle,
    applyGotoQuery,
    toggleSidePanel,
    openStackOrListPr,
    navigateAdjacentPr,
    stackItems,
    openPulls,
    runPaletteCommand,
  };

  // Clear selection action delay / move rAF when modal closes

  Object.assign(hotkeyBag, {
    open,
    isEmbed,
    onRestoreNative,
    uiRef,
    actionsRef,
    paletteOpen,
    searchOpen,
    layoutMode,
    editingBody,
    editingComment,
    picker,
    confirmState,
    showSelectionComposer,
    selectionIslandPhase,
    conversationCommentFocusRef,
    LAYOUT_DIFF,
    commentIndex,
    mappedComments,
    requestClose,
    onToggleDiff,
    collapseDiff,
    closePicker,
    focusConversationCommentItem,
    clearConversationCommentFocus,
    runContextThreadAction,
    stepThreadReply,
    applySelectionKeyboardMove,
    tryReenterExitedMultiReply,
    navComment,
    navConversationComment,
    setSelectionIslandPhase,
    setShowSelectionComposer,
    selectionIslandPhaseRef,
    scrollSelectionIntoView,
    optHeldRef,
    optHintsSuppressedRef,
    clearSelectionActionsTimer,
    selectionMoveRafRef,
    pendingSelectionMoveRef,
    syncSelectionActionReveal,
    isMac,
    setPaletteOpen,
    setPaletteQuery,
    setSearchOpen,
    setEditingBody,
    setEditingComment,
    setShellFullscreen,
    toggleShellFullscreen,
    searchInputRef,
    runPaletteCommand,
    openStackOrListPr,
    navigateAdjacentPr,
    stackItems,
    openPulls,
    editorSaveRef,
    copySelectionCode,
    copySelectionUrl,
    dismissSelectionIsland,
    scrollConversationPanel,
    scrollDiffPage,
    navFile,
    navSearch,
    applyReviewFilterToggle,
    toggleViewedActiveFile,
    toggleActiveFileCollapse,
    setActiveFileCollapse,
    toggleSidePanel,
    optArrowScrollSelect,
    applyGotoQuery,
    isMultiReplyThreadFocused,
    isCommentReactionPickerOpen,
    dismissCommentReactionPicker,
    touchGithubCommandPaletteOpen,
    shortcutKeyFromEvent,
    normalizeShortcutKey,
    isCodeBodySelection,
    isThreadSelection,
    findGithubCommandPaletteDialog,
    publishShortcutMonitorFire,
    buildShortcutMonitorFire,
    buildShortcutMonitorFireFromParts,
    resolveModalShortcutAction,
    resolveModalEscapeOwner,
    resolveEmbedShortcutAction,
    resolveComposerContextShortcutAction,
    resolvePrModalOptAction,
    isEditableKeyboardTarget,
    isComposerKeyboardTarget,
    isGithubCommandPaletteOpen,
    shouldIgnoreModalEscapeForGithubPalette,
    allowPrModalOptPeerWhileEditable,
    findComposerShortcutSurface,
    isNestedEscapeLayerOpen,
    PRP_CONTEXT_THREAD_TAB_LEAVE,
    stackDigitSlotNumber,
  });
  usePrModalHotkeys(hotkeyBag);

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

  // Keep extracted mutation handlers on live render values (deps bag pattern).
  Object.assign(mutD, {
    detail,
    detailRef,
    applyDomainDetail: applyDomainDetailToHost,
    setActionBusy,
    setActionMsg,
    setEditingBody,
    setEditingComment,
    onPatchDetail,
    onRefresh,
    setPicker,
    closePicker,
    requestConfirm,
    openPulls,
    setReplyDrafts,
    setPendingReview,
    requestClose,
    pendingReviewNodeIdRef,
    serverPendingReviewId,
    baseBranchRef,
    pickerAnchorRef,
    reviewerAddRef,
    assigneeAddRef,
    labelAddRef,
    prIdentity,
    pullRequestGqlIdRef,
    viewedPaths,
    annotatedFiles,
    setCollapsedFiles,
    setViewedPaths,
    buildBranchOptions,
    buildPeopleOptions,
    collectPeopleLogins,
    isBotAccount,
    isPathViewed,
    applyViewedToggle,
    materializeCollapsedPaths,
    discardPendingReview,
    stripPendingReviewFromDetail,
    removeReviewCommentFromDetail,
    removeIssueCommentFromDetail,
  });

  return (
    <DomainDetailProvider detail={detail}>
    <LocaleProvider uiLanguage={prefs?.uiLanguage ?? uiLanguagePref}>
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
      data-prp-phase9="1"
      data-prp-app-locale={appLocale}
      data-prp-ui-language={uiLanguagePref}
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
          enabled={open && shortcutMonitorEnabled}
          size={shortcutMonitorSize}
          isMac={isMac}
          dismissMs={SHORTCUT_MONITOR_DISMISS_MS}
        />
        {isEmbed ? (
          <DetailGnb
            detail={detail}
            presentation="embed"
          />
        ) : null}
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
            typeof onRefresh === 'function' ? () => refreshDetail() : null
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
          onPathChange={(parentHeadRef: any, childNumber: any) => {
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
          query={
            searchOpen ? useModalStore.getState().searchQuery : ''
          }
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
            // Keep-alive mount: inert when Diff is active so sidebar meta cannot
            // receive focus/clicks even if a bug leaves pointer-events on.
            {...(layoutMode !== LAYOUT_CENTERED ? ({ inert: true } as any) : {})}
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
                            (p: any) => Number(p.number) === Number(detail.number)
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
            onHideComment={onHideComment}
            onUnhideComment={onUnhideComment}
            onToggleReaction={onToggleReaction}
            onLoadReactors={onLoadReactors}
            onDeleteReviewComment={onDeleteReviewComment}
            onEditIssueComment={(id: any, body: any) => onSaveEditComment('issue', id, body)}
            onEditReviewComment={(id: any, body: any) => onSaveEditComment('review', id, body)}
            editingBody={editingBody}
            onStartEditBody={() => setEditingBody(true)}
            onCancelEditBody={() => setEditingBody(false)}
            onSaveBody={onSaveBody}
            editingComment={editingComment}
            onStartEditComment={(kind: any, id: any) => setEditingComment({ kind, id })}
            onCancelEditComment={() => setEditingComment(null)}
            onSaveEditComment={onSaveEditComment}
            pendingCount={totalPendingCount}
            hasViewerPendingReview={hasServerPending}
            onLoadMoreReviewThreads={onLoadMoreReviewThreads}
            onEnsureThreadComments={ensureThreadCommentsLoaded}
            isThreadCommentsLoading={(id: any) => {
              const key = String(id || '');
              if (!key) return false;
              if (lazyLoadingThreadIds.has(key)) return true;
              if (isGraphqlReviewThreadNodeId(key)) {
                return lazyLoadingThreadIds.has(key);
              }
              if (
                key.startsWith('shell:') &&
                isGraphqlReviewThreadNodeId(key.slice(6))
              ) {
                return lazyLoadingThreadIds.has(key.slice(6));
              }
              const tid = resolveThreadNodeIdFromCommentId(key);
              return Boolean(tid && lazyLoadingThreadIds.has(tid));
            }}
            onJumpToReviewThread={jumpToReviewComment}
            onVisibleThreadNodeIds={(ids: string[]) => {
              visibleConvThreadNodeIdsRef.current = Array.isArray(ids)
                ? ids
                : [];
            }}
            reverseComments={reverseComments}
            timelineVisibility={timelineVisibility}
            onTimelineVisibilityChange={
              typeof onTimelineVisibilityChange === 'function'
                ? onTimelineVisibilityChange
                : null
            }
            reviewThreadsMeta={detail?.reviewThreadsMeta || null}
            timelineMeta={detail?.timelineMeta || null}
            searchQuery={undefined /* leaf useSearchGroup */}
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
            onRegisterApply={(fn: any) => {
              applyActionRef.current = fn;
            }}
            onRegisterEditorSave={(fn: any) => {
              editorSaveRef.current = fn;
            }}
            onSetMilestone={onSetMilestone}
            onOpenMilestonePicker={(): any => void openMilestonePicker()}
            onClearMilestone={(): any => void onSetMilestone(true)}
            onEnsureAllCommits={ensureAllCommits}
            onEnsureAllFiles={ensureAllFiles}
            onEnsurePrTags={ensurePrTags}
            commitsLoading={commitListLoading}
            filesLoading={fileListLoading}
            sidePending={sidePending}
            prTags={prTags}
            prTagsLoading={prTagsLoading}
            prTagsError={prTagsError}
            onRerequestReviewer={onRerequestReviewer}
            onMergePr={onMergePr}
            onUpdateBranch={onUpdateBranch}
            onDeleteHeadBranch={onDeleteHeadBranch}
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
            {...(layoutMode !== LAYOUT_DIFF ? ({ inert: true } as any) : {})}
          >
            <DiffWorkspace
              fileNav={fileNav}
              displayFiles={displayFiles}
              reviewScopedFiles={reviewScopedFiles}
              fileTree={fileTree}
              expandedDirs={expandedDirs}
              onToggleDir={onToggleDir}
              onSelectFile={onSelectFile}
              collapsedFiles={collapsedFiles}
              onToggleFileCollapse={onToggleFileCollapse}
              fileQuery={undefined /* leaf useFileNavGroup */}
              setFileQuery={setFileQuery}
              ensureAllFiles={ensureAllFiles}
              fileListLoading={fileListLoading}
              fileExtFilter={fileExtFilter}
              setFileExtFilter={setFileExtFilter}
              fileUnreadOnly={fileUnreadOnly}
              setFileUnreadOnly={setFileUnreadOnly}
              fileCommentedOnly={fileCommentedOnly}
              setFileCommentedOnly={setFileCommentedOnly}
              threadCounts={threadCounts}
              viewedPaths={viewedPaths}
              onToggleViewed={onToggleViewed}
              onToggleFileNavCollapse={onToggleFileNavCollapse}
              navFile={navFile}
              onFileNavResizeStart={onFileNavResizeStart}
              detail={detail}
              virtualRows={virtualRows}
              diffFilesOverride={diffFilesOverride}
              diffReviewFilter={diffReviewFilter}
              diffMode={diffMode}
              setDiffMode={setDiffMode as (m: string) => void}
              hideWhitespace={hideWhitespace}
              onHideWhitespace={applyHideWhitespace}
              locale={appLocale}
              setScrollTop={setScrollTop}
              listRef={listRef}
              hasAnyReviewThreads={hasAnyReviewThreads}
              totalPendingCount={totalPendingCount}
              reviewThreadTotals={reviewThreadTotals}
              setDiffReviewFilter={scheduleDiffReviewFilter}
              onToggleReviewStatus={(status: string) =>
                applyReviewFilterToggle(
                  status as DiffReviewStatus
                )
              }
              onPatchReviewFilter={patchDiffReviewFilter}
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
              hasViewerPendingReview={hasServerPending}
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
              searchQuery={undefined /* leaf useSearchGroup */}
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
              onSelectionHoverReveal={setSelectionHoverReveal}
              onFileHeaderComment={onFileHeaderComment}
              onExpandDiffGap={onExpandDiffGap}
              diffExpandBusyKey={diffExpandBusyKey}
              threadsByCommentId={threadsByCommentId}
              onReplyToThread={onReplyToThread}
              onResolveThread={onResolveThread}
              onToggleReaction={onToggleReaction}
              onLoadReactors={onLoadReactors}
              onDeleteReviewComment={onDeleteReviewComment}
              onHideComment={onHideComment}
              onUnhideComment={onUnhideComment}
              onStartEditReviewComment={onStartEditReviewComment}
              onSaveEditComment={onSaveEditComment}
              setEditingComment={setEditingComment}
              editingComment={editingComment}
              editorSaveRef={editorSaveRef}
              onApplySuggestion={onApplySuggestion}
              applyActionRef={applyActionRef}
              isDiffCommentCollapsed={isDiffCommentCollapsed}
              onToggleThreadCollapse={onToggleThreadCollapse}
              isThreadCommentsLoading={(id: any) => {
                const key = String(id || '');
                if (!key) return false;
                if (lazyLoadingThreadIds.has(key)) return true;
                // Resolve shell:… / comment id → PRRT
                if (isGraphqlReviewThreadNodeId(key)) {
                  return lazyLoadingThreadIds.has(key);
                }
                if (
                  key.startsWith('shell:') &&
                  isGraphqlReviewThreadNodeId(key.slice(6))
                ) {
                  return lazyLoadingThreadIds.has(key.slice(6));
                }
                const tid = resolveThreadNodeIdFromCommentId(key);
                return Boolean(tid && lazyLoadingThreadIds.has(tid));
              }}
              commentHeightOpts={commentHeightOpts}
              onVirtualMetricsChange={onVirtualMetricsChange}
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
          openPulls={Array.isArray(openPulls) ? openPulls : []}
          searchPrs={searchPalettePrs}
          helpOpen={paletteHelpOpen}
          onHelpOpenChange={setPaletteHelpOpen}
          detail={detail}
          layoutMode={layoutMode === LAYOUT_DIFF ? 'diff' : 'centered'}
          owner={detail?.owner || ''}
          repo={detail?.repo || ''}
          onRun={runPaletteCommand}
          onClose={() => {
            setPaletteOpen(false);
            setPaletteHelpOpen(false);
          }}
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
          onQuery={(q: any) => setPicker((prev: any) => (prev ? { ...prev, query: q } : prev))}
          onPick={(opt: any) => picker?.onPick?.(opt)}
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
    </LocaleProvider>
    </DomainDetailProvider>
  );
}


export default PrModalApp;
