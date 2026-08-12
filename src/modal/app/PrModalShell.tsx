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
  filterFilesByQuery,
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
  const searchQuery = useModalStore((s) => s.searchQuery);
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
  // Keep phase ref in sync for Opt/hover reveal (declared below with other refs)
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
   * True while selection ↑↓ / region hop is settling — hides OptBtnHints and
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

  /**
   * Load PR-related tags on first Tags section open (not on mount).
   * Uses repo-level newest-first cache so re-open / other PRs skip rewalk.
   */
  const ensurePrTags = useCallback(async () => {
    if (!detail?.owner || !detail?.repo) return;
    const api = globalThis.PRTreeFetch;
    const shas = [
      detail.headSha,
      ...((detail.commits || []).map((c: any) => c?.sha).filter(Boolean) as string[]),
    ];
    const uniq = [
      ...new Set(shas.map((s) => String(s).trim()).filter(Boolean)),
    ];
    const cacheKey = `${String(detail.owner).toLowerCase()}/${String(
      detail.repo
    ).toLowerCase()}#${detail.number || ''}:${detail.headSha || ''}:${uniq.length}`;
    if (tagsLoadedForKeyRef.current === cacheKey && Array.isArray(prTags)) {
      return;
    }

    const applyFiltered = (all: RepoTag[]) => {
      const filtered = filterTagsByCommitShas(all, uniq);
      setPrTags(filtered);
      setPrTagsError(null);
      tagsLoadedForKeyRef.current = cacheKey;
    };

    // Fresh repo cache → filter client-side only
    const cached = getRepoTagsCache(detail.owner, detail.repo);
    if (isRepoTagsCacheFresh(cached) && cached) {
      applyFiltered(cached.tags);
      return;
    }

    if (typeof api?.fetchRepoTags !== 'function' && typeof api?.fetchTagsForCommits !== 'function') {
      setPrTags([]);
      return;
    }

    const gen = ++tagsLoadGenRef.current;
    setPrTagsLoading(true);
    setPrTagsError(null);
    try {
      // Prefer full repo list into cache (newest-first pages); then filter.
      if (typeof api.fetchRepoTags === 'function') {
        let entry = cached;
        let page = 1;
        const pageSize = 100;
        let needMore = true;
        let guard = 0;
        while (needMore && guard < 10) {
          guard += 1;
          // fetchRepoTags loads up to maxPages in one call — use maxPages:1
          // per iteration only if API supports; otherwise one multi-page call.
          if (page === 1 && !entry) {
            const all = await api.fetchRepoTags(detail.owner, detail.repo, {
              maxPages: 10,
            });
            if (gen !== tagsLoadGenRef.current) return;
            const list = (Array.isArray(all) ? all : []).map((t: any) => ({
              name: String(t?.name || ''),
              sha: String(t?.sha || t?.commit?.sha || ''),
              zipballUrl: t?.zipballUrl || t?.zipball_url || '',
              tarballUrl: t?.tarballUrl || t?.tarball_url || '',
            }));
            const merged = mergeNewestFirstTagPage(null, list, {
              pageSize,
              pageIndex: 1,
            });
            // fetchRepoTags already walked pages — mark complete
            entry = {
              ...merged.entry,
              pagesLoaded: Math.max(
                1,
                Math.ceil(list.length / pageSize) || 1
              ),
              complete: true,
            };
            setRepoTagsCache(detail.owner, detail.repo, entry);
            needMore = false;
          } else {
            needMore = false;
          }
        }
        if (gen !== tagsLoadGenRef.current) return;
        applyFiltered(entry?.tags || []);
      } else if (typeof api.fetchTagsForCommits === 'function') {
        const tags = await api.fetchTagsForCommits(
          detail.owner,
          detail.repo,
          uniq
        );
        if (gen !== tagsLoadGenRef.current) return;
        setPrTags(Array.isArray(tags) ? tags : []);
        setPrTagsError(null);
        tagsLoadedForKeyRef.current = cacheKey;
      }
    } catch (err: any) {
      if (gen !== tagsLoadGenRef.current) return;
      const msg = err?.message || String(err);
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
      if (gen === tagsLoadGenRef.current) setPrTagsLoading(false);
    }
  }, [detail?.owner, detail?.repo, detail?.number, detail?.headSha, detail?.commits]);

  useEffect(() => {
    tagsLoadedForKeyRef.current = '';
    tagsLoadGenRef.current += 1;
  }, [prIdentity]);

  const ensureAllCommits = useCallback(async () => {
    if (!detail || typeof onFetchAllPrCommits !== 'function') return;
    if (commitsFullyLoadedRef.current || commitsFlightRef.current) return;
    // Have a complete list already — nothing to fetch.
    if (Array.isArray(detail.commits) && detail.commits.length > 0) {
      const total = Number(detail.commitsCount);
      if (!Number.isFinite(total) || total <= detail.commits.length) {
        commitsFullyLoadedRef.current = true;
        return;
      }
      // Partial list (mayHaveMore) — fall through to full fetch.
    }
    const identity = prIdentity;
    const flight = ++commitsFlightSeqRef.current;
    commitsFlightRef.current = flight;
    setCommitListLoading(true);
    try {
      const all = await onFetchAllPrCommits();
      if (prIdentity !== identity || commitsFlightRef.current !== flight) {
        return; // stale flight
      }
      if (!Array.isArray(all)) return;
      // Empty success is authoritative settled empty (count 0 when no rows).
      const coreTotal = Number(detail.commitsCount);
      if (
        all.length === 0 &&
        Number.isFinite(coreTotal) &&
        coreTotal > 0
      ) {
        // Inconsistency — keep prior, do not claim settled empty
        return;
      }
      commitsFullyLoadedRef.current = true;
      const count = all.length;
      applyDomainDetailToHost((prev: any) =>
        prev
          ? {
              ...prev,
              commits: all,
              commitsCount: count,
              _sideSettled: { ...(prev._sideSettled || {}), commits: true },
            }
          : prev
      );
      void patchHostDetail({ commits: all, commitsCount: count });
    } catch (err: any) {
      if (prIdentity === identity && commitsFlightRef.current === flight) {
        setDiffCommitError(err?.message || String(err));
      }
    } finally {
      if (commitsFlightRef.current === flight) {
        commitsFlightRef.current = 0;
      }
      setCommitListLoading(false);
    }
  }, [detail, onFetchAllPrCommits, onPatchDetail, prIdentity]);

  const ensureAllFiles = useCallback(async () => {
    if (!detail || typeof onFetchAllPrFiles !== 'function') return;
    if (filesFlightRef.current) return;
    // Don't clobber a commit-range override with full PR files mid-filter.
    if (diffFilesOverride) {
      filesFullyLoadedRef.current = true;
      return;
    }
    // Re-fetch only for empty / incomplete count / slim IDB (`_patchOmitted`).
    // Do NOT treat GitHub-omitted large-file patches as incomplete — re-fetch
    // never restores them and caused infinite "Loading all files…" on big PRs.
    const needsFetch = filesListNeedsFullFetch(
      detail.files,
      detail.changedFiles
    );
    if (!needsFetch) {
      filesFullyLoadedRef.current = true;
      return;
    }
    // Slim wipe or incomplete list — clear latch and fetch.
    filesFullyLoadedRef.current = false;
    const identity = prIdentity;
    const flight = ++filesFlightSeqRef.current;
    filesFlightRef.current = flight;
    setFileListLoading(true);
    // Header progress pill (detail-ui-store) — open host bar does not track
    // Diff-entry full file fetch; surface busy label + soft percent here.
    const ui = useDetailUiStore.getState();
    const expected = Number(detail.changedFiles);
    const startLabel =
      Number.isFinite(expected) && expected > 0
        ? formatMessage('progress_loading_files_n', appLocale, {
            loaded: 0,
            total: Math.min(Math.floor(expected), 999),
          })
        : formatMessage('progress_loading_all_files', appLocale);
    ui.setLoadStage({ busy: true, label: startLabel, percent: 18 });
    // Soft mid progress while REST pages walk (no per-page callbacks yet).
    const midTimer =
      typeof window !== 'undefined'
        ? window.setTimeout(() => {
            if (filesFlightRef.current !== flight) return;
            useDetailUiStore.getState().setLoadStage({
              busy: true,
              label:
                Number.isFinite(expected) && expected > 0
                  ? formatMessage('progress_loading_files', appLocale)
                  : formatMessage('progress_loading_all_files', appLocale),
              percent: 58,
            });
          }, 400)
        : null;
    try {
      const all = await onFetchAllPrFiles({
        gitattributesText: detail.gitattributesText || '',
      });
      if (prIdentity !== identity || filesFlightRef.current !== flight) {
        return; // stale flight
      }
      if (!Array.isArray(all)) return;
      const coreTotal = Number(detail.changedFiles);
      if (
        all.length === 0 &&
        Number.isFinite(coreTotal) &&
        coreTotal > 0
      ) {
        // Inconsistency — keep prior, do not claim settled empty
        return;
      }
      // Full REST page is authoritative even if some patches are omitted by GitHub.
      filesFullyLoadedRef.current = true;
      const count = all.length;
      applyDomainDetailToHost((prev: any) =>
        prev
          ? {
              ...prev,
              files: all,
              changedFiles: count,
              _sideSettled: { ...(prev._sideSettled || {}), files: true },
            }
          : prev
      );
      void patchHostDetail({
        files: all,
        changedFiles: count,
        ...(detail.gitattributesText
          ? { gitattributesText: detail.gitattributesText }
          : null),
      });
      useDetailUiStore.getState().setLoadStage({
        busy: true,
        label:
          count > 0
            ? formatMessage('progress_loading_files_n', appLocale, {
                loaded: Math.min(count, 999),
                total: Math.min(count, 999),
              })
            : formatMessage('progress_files_ready', appLocale),
        percent: 96,
      });
    } catch {
      /* soft-fail: keep partial file list; do not invent settled empty */
    } finally {
      if (midTimer != null) {
        try {
          window.clearTimeout(midTimer);
        } catch {
          /* ignore */
        }
      }
      const stillMine = filesFlightRef.current === flight;
      if (stillMine) {
        filesFlightRef.current = 0;
      }
      setFileListLoading(false);
      // Only settle the header bar when this flight still owns the slot
      // (a newer ensureAllFiles would have a higher flight id).
      if (stillMine) {
        useDetailUiStore.getState().setLoadStage({
          busy: false,
          label: null,
          percent: 100,
        });
        if (typeof window !== 'undefined') {
          const settledFlight = flight;
          window.setTimeout(() => {
            // Newer flight in progress — leave its stage alone.
            if (filesFlightRef.current !== 0) return;
            if (filesFlightSeqRef.current !== settledFlight) return;
            useDetailUiStore.getState().clearLoadStage();
          }, 280);
        } else {
          useDetailUiStore.getState().clearLoadStage();
        }
      }
    }
  }, [
    detail,
    onFetchAllPrFiles,
    onPatchDetail,
    diffFilesOverride,
    prIdentity,
    appLocale,
  ]);

  // Diff: re-fetch when empty, incomplete count, or slim IDB — not when GitHub
  // already omitted some large-file patches after a full page.
  useEffect(() => {
    if (layoutMode !== LAYOUT_DIFF) return;
    if (diffFilesOverride) return;
    if (!filesListNeedsFullFetch(detail?.files, detail?.changedFiles)) return;
    void ensureAllFiles();
  }, [layoutMode, detail?.files, detail?.changedFiles, diffFilesOverride, ensureAllFiles]);

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
    if (typeof filterFilesByQuery === 'function') {
      list = filterFilesByQuery(list, fileQuery);
    }
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
    fileQuery,
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

  const onVirtualMetricsChange = useCallback(
    (m: {
      offsets?: number[] | null;
      avgH?: number;
      totalHeight?: number;
    }) => {
      if (Array.isArray(m?.offsets)) {
        liveDiffMetricsRef.current.offsets = m.offsets;
      }
      if (Number.isFinite(Number(m?.avgH)) && Number(m.avgH) > 0) {
        liveDiffMetricsRef.current.avgH = Number(m.avgH);
      }
    },
    []
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

  /** Prefer live VirtualDiff offsets when available. */
  function getDiffScrollMetrics(): {
    avgH: number;
    rowOffsetList: number[] | null;
  } {
    const live = liveDiffMetricsRef.current;
    return {
      avgH:
        live.avgH > 0 && Number.isFinite(live.avgH) ? live.avgH : avgH,
      rowOffsetList: Array.isArray(live.offsets) ? live.offsets : rowOffsetList,
    };
  }

  // Diff comment navigator: filtered roots, top → bottom (file list + row order).
  const mappedComments = useMemo(() => {
    if (typeof mapCommentsToRowIndices !== 'function') return [];
    const pathOrder =
      typeof buildPathOrderMap === 'function'
        ? buildPathOrderMap(displayFiles)
        : null;
    const roots = sortThreadRootComments(
      filterReviewRootsForDiffNav(
        detail?.reviewComments || [],
        deferredDiffReviewFilter,
        displayPathSet,
        reviewFilterEvalOpts
      ),
      pathOrder
    );
    return mapCommentsToRowIndices(roots, virtualRows, { pathOrder });
  }, [
    detail?.reviewComments,
    virtualRows,
    deferredDiffReviewFilter,
    displayPathSet,
    displayFiles,
    navReviewComments,
    reviewFilterEvalOpts,
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
    const live = useModalStore.getState();
    const activeId = live.activeDiffCommentId;
    if (activeId != null && activeId !== '') {
      const stableIdx = mappedComments.findIndex(
        (c: any) => String(c?.id) === String(activeId)
      );
      // Progressive shell/by-ids patches can insert or reorder comments. Keep
      // the user's focused thread by stable id instead of silently assigning
      // the new row at the old numeric index.
      if (stableIdx >= 0 && stableIdx !== commentIndex) {
        setCommentIndex(stableIdx);
        return;
      }
    }
    const id = mappedComments[commentIndex]?.id;
    live.setActiveDiffCommentId(id != null ? id : null);
  }, [layoutMode, commentIndex, mappedComments, setCommentIndex]);

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
  // Prefer live VirtualDiff metrics when the list has measured variable rows.
  const searchJumpRef = useRef({
    avgH,
    viewportHeight: viewportHeightRef.current,
    rowCount: virtualRows.length,
    rowOffsetList,
  });
  {
    const live = getDiffScrollMetrics();
    searchJumpRef.current = {
      avgH: live.avgH,
      viewportHeight: viewportHeightRef.current,
      rowCount: virtualRows.length,
      rowOffsetList: live.rowOffsetList,
    };
  }

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
          expandDiff();
          if (useModalStore.getState().layoutMode !== LAYOUT_DIFF) return;
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

  // Diff enter → cache-first paint already shows loaded threads; complete
  // remaining single-cursor pagination in background (idempotent if complete).
  const diffFullLoadGenRef = useRef(0);
  const diffFullLoadKeyRef = useRef('');
  useEffect(() => {
    if (layoutMode !== LAYOUT_DIFF) return undefined;
    if (!detail?.owner || !detail?.repo || !detail?.number) return undefined;
    if (typeof onLoadMoreReviewThreads !== 'function') return undefined;
    const meta = detail.reviewThreadsMeta || {};
    if (!meta.hasMore) return undefined;
    // Single-cursor / REST multi-page: drain when hasOlder or REST pages remain.
    // Stuck hasMore without a cursor must not re-enter forever.
    let canDrain = Boolean(meta.hasOlder);
    if (!canDrain && meta.source === 'rest' && Number(meta.restPage) >= 1) {
      canDrain = true;
    }
    if (
      !canDrain &&
      (meta.newestStartCursor || meta.endCursor) &&
      meta.hasMore
    ) {
      canDrain = true;
    }
    if (!canDrain) return undefined;
    const key = `${detail.owner}/${detail.repo}#${detail.number}`;
    // Avoid re-entry for same PR while a load is in flight / already kicked off
    if (diffFullLoadKeyRef.current === key && diffFullLoadGenRef.current > 0) {
      return undefined;
    }
    diffFullLoadKeyRef.current = key;
    const gen = ++diffFullLoadGenRef.current;
    void (async () => {
      try {
        // Threads only — Diff completeness must not drain full timelineItems.
        await onLoadMoreReviewThreads('threads-all');
      } catch {
        /* host stage surfaces errors */
      } finally {
        if (gen === diffFullLoadGenRef.current) {
          // Keep key set after attempt — only re-open when PR identity resets.
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
    detail?.reviewThreadsMeta?.hasOlder,
    detail?.reviewThreadsMeta?.source,
    detail?.reviewThreadsMeta?.restPage,
    detail?.reviewThreadsMeta?.newestStartCursor,
    detail?.reviewThreadsMeta?.endCursor,
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
      // Search needs full review-thread corpus; not full timelineItems history.
      await onLoadMoreReviewThreads('threads-all');
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
      const { avgH: h, rowOffsetList: offs } = getDiffScrollMetrics();
      // ⌥J/K thread nav on Diff: pin active comment near 1/3 viewport height
      const top = scrollTopForIndex(
        active.rowIndex,
        h,
        viewportHeightRef.current,
        virtualRows.length,
        offs,
        { align: 'third' }
      );
      // DOM-first thrift (same class as selection): avoid setScrollTop every hop
      // so DiffWorkspace leaf does not re-render on ⌥J/K key-repeat.
      const el = listRef.current as HTMLElement | null;
      applyProgrammaticDiffScroll(el, top, {
        storeTop: useModalStore.getState().scrollTop,
        setStoreTop: setScrollTop,
        minDomDelta: 1,
        // Sync store only on real jumps (rebuild hold); native scroll event
        // still range-gates VirtualDiff between store updates.
        minStoreDelta: Math.max(48, h * 3),
      });
      return true;
    },
    [/* vh-ref */ virtualRows.length, setScrollTop]
  );

  /** Open Diff, expand file, scroll to thread root (or queue until rows re-map). */
  const jumpToReviewComment = useCallback(
    (target: {
      id?: string | number | null;
      path?: string | null;
      line?: number | null;
      side?: string | null;
    }) => {
      if (layoutMode !== LAYOUT_DIFF) {
        expandDiff();
        if (useModalStore.getState().layoutMode !== LAYOUT_DIFF) return;
      }
      // Thread jump is a focus change — clear any line selection island.
      clearLineSelectionForNav();

      // Clear thread filter if it hides the target file
      const path = target.path ? String(target.path) : '';
      if (
        path &&
        !reviewFilteredFiles.some(
          (f: any) => (f.filename || f.path) === path
        )
      ) {
        // Widen to unrestricted (empty statuses ≡ all) — not product default
        // unresolved+pending, which would still hide resolved-only paths.
        // Low-priority: same lane as filter toggles (optimistic UI not needed for jump).
        startTransition(() => {
          setDiffReviewFilter(createUnrestrictedDiffReviewFilter());
        });
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
    const { avgH: h, rowOffsetList: offs } = getDiffScrollMetrics();
    const top = scrollTopForIndex(
      headIdx,
      h,
      viewportHeightRef.current,
      virtualRows.length,
      offs
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
    // Match ↑/↓ continuum: file-level review threads before first body line
    const row =
      pending.edge === 'last'
        ? typeof lastContentNavRowInFile === 'function'
          ? lastContentNavRowInFile(virtualRows, path)
          : typeof lastSelectableRowInFile === 'function'
            ? lastSelectableRowInFile(virtualRows, path)
            : null
        : typeof firstContentNavRowInFile === 'function'
          ? firstContentNavRowInFile(virtualRows, path)
          : typeof firstSelectableRowInFile === 'function'
            ? firstSelectableRowInFile(virtualRows, path)
            : null;
    if (!row) {
      // Still collapsed / not in rows yet — keep waiting
      return;
    }
    pendingCrossFileSeedRef.current = null;
    const arrIdx = Array.isArray(virtualRows) ? virtualRows.indexOf(row) : -1;
    const sel =
      typeof beginSelectionOnRow === 'function'
        ? beginSelectionOnRow(row, 'RIGHT', arrIdx >= 0 ? arrIdx : null)
        : typeof beginLineSelection === 'function'
          ? beginLineSelection(row)
          : null;
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

  /**
   * Coalesce ⌥J/K key-repeat to one step per animation frame so hold does not
   * stack N shell re-renders / jumps (shuttering).
   */
  const navCommentRafRef = useRef(0);
  const navCommentDeltaRef = useRef(0);

  function navComment(delta: number) {
    if (!mappedComments.length) return;
    // Latest direction wins while a frame is pending (hold-repeat).
    navCommentDeltaRef.current = delta < 0 ? -1 : 1;
    if (navCommentRafRef.current) return;
    const run = () => {
      navCommentRafRef.current = 0;
      const step = navCommentDeltaRef.current;
      navCommentDeltaRef.current = 0;
      if (!step) return;
      const list = mappedComments;
      if (!list.length) return;
      // Thread focus owns the surface — release any line selection.
      clearLineSelectionForNav();
      try {
        useModalStore.getState().setFocusedThreadUnitId(null);
      } catch {
        /* ignore */
      }
      // Live index from store (avoid stale closure on rAF).
      const liveIdx = Number(useModalStore.getState().commentIndex);
      if (typeof resolveCommentNav === 'function') {
        const st = resolveCommentNav(list, liveIdx, step);
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
          ((liveIdx < 0 ? 0 : liveIdx) + step + list.length) % list.length;
        const active = list[next];
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
    };
    if (typeof requestAnimationFrame === 'function') {
      navCommentRafRef.current = requestAnimationFrame(run);
    } else {
      run();
    }
  }

  /**
   * Focused multi-reply thread root id from **live** store + DOM.
   * Must not use keydown-effect closed-over `mappedComments` / `commentIndex`
   * (effect deps are only open/isEmbed — stale empty after detail loads).
   */
  /**
   * Walk reviewComments inReplyTo chain to the thread root id.
   * activeDiffCommentId / unit stamps may point at a reply (TOR continuum).
   */
  function walkReviewCommentToRootId(commentId: string): string | null {
    const start = String(commentId || '').trim();
    if (!start) return null;
    try {
      const liveDetail = detailRef.current;
      const all = Array.isArray(liveDetail?.reviewComments)
        ? liveDetail.reviewComments
        : [];
      if (!all.length) return start;
      const byId = new Map<string, any>();
      for (const c of all) {
        if (c && c.id != null) byId.set(String(c.id), c);
      }
      let cur = start;
      const seen = new Set<string>();
      while (cur && !seen.has(cur)) {
        seen.add(cur);
        const row = byId.get(cur);
        if (!row) return cur;
        const parent =
          row.inReplyToId != null
            ? String(row.inReplyToId)
            : row.in_reply_to_id != null
              ? String(row.in_reply_to_id)
              : '';
        if (!parent || parent === '0' || parent === cur) return cur;
        cur = parent;
      }
      return cur || start;
    } catch {
      return start;
    }
  }

  function readFocusedThreadUnitStamp(
    st: ReturnType<typeof useModalStore.getState> = useModalStore.getState()
  ): string {
    const fromStore =
      st.focusedThreadUnitId != null
        ? String(st.focusedThreadUnitId).trim()
        : '';
    if (fromStore) return fromStore;
    // DOM attr is written by setFocusedThreadUnitId; prefer store, fall back
    // when a concurrent store hop left the stamp briefly (TOR.3 seed).
    try {
      if (typeof document === 'undefined') return '';
      return (
        document.documentElement.getAttribute(
          'data-prp-focused-thread-unit'
        ) || ''
      ).trim();
    } catch {
      return '';
    }
  }

  function resolveFocusedReviewThreadRootId(
    st: ReturnType<typeof useModalStore.getState> = useModalStore.getState()
  ): string | null {
    if (st.layoutMode === LAYOUT_DIFF) {
      if (st.activeDiffCommentId != null && st.activeDiffCommentId !== '') {
        const activeId = String(st.activeDiffCommentId);
        // InlineThread is mounted from the root virtual row, so its anchor is
        // authoritative. Prefer it when it agrees with activeDiffCommentId;
        // progressive reviewComments can temporarily expose a misleading
        // inReplyTo chain for the same id and route plain arrows as line nav.
        try {
          if (typeof document !== 'undefined') {
            const active = document.querySelector(
              '.prp-inline-thread--context-active, .prp-inline-thread[data-context-active="1"]'
            ) as HTMLElement | null;
            const anchor = String(
              active?.getAttribute('data-search-anchor') || ''
            ).trim();
            if (
              anchor.startsWith('review-comment:') &&
              anchor.slice('review-comment:'.length) === activeId
            ) {
              return activeId;
            }
          }
        } catch {
          /* fall through to detail chain */
        }
        return walkReviewCommentToRootId(activeId);
      }
    } else {
      const a = String(
        st.focusedConversationAnchor || st.pendingConversationNavAnchor || ''
      ).trim();
      if (a.startsWith('review-comment:')) {
        return walkReviewCommentToRootId(a.slice('review-comment:'.length));
      }
    }
    // DOM: context-active thread card (works when store lags paint / Diff caret).
    // Prefer anchor root over unit-walk — reviewComments may lag by-ids load
    // so walking a reply stamp returns the reply itself as "root" (TOR.3).
    try {
      if (typeof document === 'undefined') return null;
      const active = document.querySelector(
        '.prp-inline-thread--context-active, .prp-inline-thread[data-context-active="1"]'
      ) as HTMLElement | null;
      const anchor = String(active?.getAttribute('data-search-anchor') || '').trim();
      if (anchor.startsWith('review-comment:')) {
        return anchor.slice('review-comment:'.length);
      }
    } catch {
      /* ignore */
    }
    // Unit focus stamp (root or reply) — keep ↑/↓ multi-reply routing when
    // activeDiffCommentId / context-active DOM cleared but unit stamp remains
    // (TOR.3: stamp reply id after continuum seed without Diff root id).
    const unit = readFocusedThreadUnitStamp(st);
    if (unit) {
      return walkReviewCommentToRootId(unit);
    }
    return null;
  }

  /** Collect reply rows for a root review-comment id from live detail + DOM. */
  function repliesForRootCommentId(rootId: string): any[] {
    if (!rootId) return [];
    const rid = String(rootId);
    // O(1) hot path: precomputed map (never regroup full comments on every ↑↓ hop)
    try {
      const th = threadsByCommentId?.get?.(rid);
      if (th) {
        if (Array.isArray(th.replies) && th.replies.length) return th.replies;
        if (Array.isArray(th.root?.replies) && th.root.replies.length) {
          return th.root.replies;
        }
        // Known thread with no replies — stop; do not regroup
        return [];
      }
    } catch {
      /* fall through */
    }
    // Live detail (detailRef) — not closed-over `detail`
    const liveDetail = detailRef.current;
    const all =
      liveDetail?.reviewComments || liveDetail?.review_comments || [];
    // Rare cold path only (map miss): regroup once
    if (typeof groupReviewThreads === 'function' && Array.isArray(all) && all.length) {
      try {
        const groups = groupReviewThreads(all);
        const thread = (groups || []).find(
          (t: any) => t && String(t.id) === rid
        );
        if (Array.isArray(thread?.replies) && thread.replies.length) {
          return thread.replies;
        }
        if (Array.isArray(thread?.root?.replies) && thread.root.replies.length) {
          return thread.root.replies;
        }
      } catch {
        /* fall through */
      }
    }
    // Transitive flat walk (nested in_reply_to chains + shell lag)
    if (typeof collectThreadReplyComments === 'function') {
      const nested = collectThreadReplyComments(rid, all);
      if (nested.length) return nested;
    } else {
      const direct = (Array.isArray(all) ? all : []).filter((c: any) => {
        if (!c || c.id == null) return false;
        const parent = c.inReplyToId ?? c.in_reply_to_id ?? null;
        return parent != null && String(parent) === rid;
      });
      if (direct.length) return direct;
    }
    // DOM fallback: InlineThread already painted reply units (lazy/by-ids body
    // may be in the virtual row while App's reviewComments map is still roots).
    try {
      if (typeof document === 'undefined') return [];
      const active =
        (document.querySelector(
          `.prp-inline-thread--context-active[data-search-anchor="review-comment:${CSS.escape(rid)}"]`
        ) as HTMLElement | null) ||
        (document.querySelector(
          `.prp-inline-thread[data-context-active="1"][data-search-anchor="review-comment:${CSS.escape(rid)}"]`
        ) as HTMLElement | null) ||
        (document.querySelector(
          `.prp-inline-thread--context-active, .prp-inline-thread[data-context-active="1"]`
        ) as HTMLElement | null);
      if (!active) return [];
      // If we landed on a different card, only accept when its root matches rid
      const cardRoot = String(active.getAttribute('data-search-anchor') || '')
        .replace(/^review-comment:/, '')
        .trim();
      if (cardRoot && cardRoot !== rid) return [];
      const ids = [
        ...active.querySelectorAll(
          '[data-prp-thread-unit="reply"][data-prp-thread-unit-id]'
        ),
      ]
        .map((el) => el.getAttribute('data-prp-thread-unit-id'))
        .filter((id): id is string => Boolean(id && id !== rid));
      return ids.map((id) => ({ id }));
    } catch {
      return [];
    }
  }

  /** Sticky Diff file-header overlay height for caret pad. */
  function diffStickyPadTop(): number {
    return typeof ROW_HEIGHT === 'number' && ROW_HEIGHT > 0
      ? ROW_HEIGHT + 4
      : 28;
  }

  /**
   * Active Diff list root — never query keep-alive Conversation (duplicate
   * thread units off-screen would steal scroll targets).
   */
  function activeDiffScrollRoot(): HTMLElement | null {
    if (typeof document === 'undefined') return null;
    try {
      return (
        (listRef.current as HTMLElement | null) ||
        (document.querySelector(
          '.prp-body-panel--active .prp-vlist, .prp-body-panel--diff.prp-body-panel--active .prp-vlist, .prp-diff .prp-vlist, .prp-vlist'
        ) as HTMLElement | null)
      );
    } catch {
      return null;
    }
  }

  /**
   * Minimal DOM scroll for a focus host inside the Diff vlist.
   * Uses reveal (not whole-thread maximize). Store scrollTop is thrifted
   * (1.9.6-style) so key-hold does not re-render DiffWorkspace every hop.
   */
  function revealDiffDomFocus(
    host: HTMLElement | null | undefined
  ): boolean {
    if (!host || typeof document === 'undefined') return false;
    try {
      const scroller =
        activeDiffScrollRoot() ||
        (host.closest(
          '.prp-vlist, .prp-conversation-virtual, .prp-diff-scroll, .prp-scroll'
        ) as HTMLElement | null);
      if (!scroller) {
        host.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        return true;
      }
      // Reject hosts outside the Diff scroller (Conversation keep-alive clones)
      if (!scroller.contains(host)) return false;
      const stickyPad = diffStickyPadTop();
      // Only sticky-header inset — floatbar flips above when bottom is tight
      // (resolveSelectionDockVerticalPlacement); do not reserve ~3 empty lines.
      const padBottom = 8;
      if (typeof scrollChildToRevealInScroller === 'function') {
        // A visible focused comment must not move. Only reveal a clipped unit;
        // scrolling the whole thread makes arrow entry jump despite no need.
        scrollChildToRevealInScroller(scroller, host, {
          padTop: stickyPad,
          padBottom,
          minVisiblePx: 14,
        });
      } else if (typeof scrollChildToMaximizeInScroller === 'function') {
        scrollChildToMaximizeInScroller(scroller, host, {
          padTop: stickyPad,
          padBottom,
        });
      } else {
        host.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
      // Thrift store sync — tiny DOM deltas must not thrash React under key-hold
      if (typeof applyProgrammaticDiffScroll === 'function') {
        let h = 20;
        try {
          h = getDiffScrollMetrics().avgH || 20;
        } catch {
          /* ignore */
        }
        applyProgrammaticDiffScroll(scroller, scroller.scrollTop, {
          storeTop: useModalStore.getState().scrollTop,
          setStoreTop: setScrollTop,
          minDomDelta: 0.5,
          minStoreDelta: Math.max(24, h * 2),
        });
      } else {
        try {
          setScrollTop(scroller.scrollTop);
        } catch {
          /* ignore */
        }
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Scroll the focused root/reply **unit** into view (DOM node in Diff only).
   * If the unit is not mounted yet (virtual window), scroll the selection head
   * first so the thread row mounts, then reveal the unit.
   */
  function scrollFocusedThreadUnitIntoView(
    unitId: unknown,
    opts: { attempts?: number; sel?: any } = {}
  ): boolean {
    const id = unitId != null ? String(unitId).trim() : '';
    if (!id || typeof document === 'undefined') return false;
    const maxAttempts = Math.max(1, Number(opts.attempts) || 10);
    let left = maxAttempts;
    let didHead = false;
    const findHost = (): HTMLElement | null => {
      try {
        const scope = activeDiffScrollRoot() || document;
        return (
          (scope.querySelector(
            `[data-prp-thread-unit-id="${CSS.escape(id)}"]`
          ) as HTMLElement | null) ||
          (scope.querySelector(
            `.prp-review-thread__item--unit-focus[data-prp-thread-unit-id="${CSS.escape(id)}"]`
          ) as HTMLElement | null) ||
          // Collapsed single threads do not mount their root unit yet. Their
          // shell is still the real visible target; use row offsets only when
          // neither the unit nor this root anchor is mounted.
          (scope.querySelector(
            `.prp-inline-thread[data-search-anchor="review-comment:${CSS.escape(id)}"]`
          ) as HTMLElement | null)
        );
      } catch {
        return null;
      }
    };
    const tryScroll = (): boolean => {
      const host = findHost();
      if (host) return revealDiffDomFocus(host);
      // Not in virtual window — nudge list via selection head once
      if (!didHead && opts.sel) {
        didHead = true;
        try {
          scrollSelectionHeadDomOnly(opts.sel);
        } catch {
          /* ignore */
        }
      }
      return false;
    };
    if (tryScroll()) return true;
    const tick = () => {
      left -= 1;
      if (tryScroll() || left <= 0) return;
      requestAnimationFrame(() => {
        window.setTimeout(tick, 32);
      });
    };
    requestAnimationFrame(() => {
      window.setTimeout(tick, 32);
    });
    return false;
  }

  /** Conversation units are already mounted; reveal once without Diff retries. */
  function scrollConversationThreadUnitIntoView(unitId: unknown): boolean {
    const id = unitId != null ? String(unitId).trim() : '';
    if (!id || typeof document === 'undefined') return false;
    try {
      const panel = document.querySelector(
        '.prp-body-panel--conversation.prp-body-panel--active'
      ) as HTMLElement | null;
      const host = panel?.querySelector(
        `[data-prp-thread-unit-id="${CSS.escape(id)}"]`
      ) as HTMLElement | null;
      if (!host) return false;
      const scroller = host.closest(
        '.prp-conversation-virtual'
      ) as HTMLElement | null;
      if (scroller && typeof scrollChildToRevealInScroller === 'function') {
        scrollChildToRevealInScroller(scroller, host, {
          padTop: 24,
          padBottom: 24,
          minVisiblePx: 14,
        });
      } else {
        host.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Multi-reply thread unit only: wait for paint then DOM-measure reveal.
   * Tall unit rows lag virtual offsets — line hops must NOT use this path.
   */
  function scrollDiffThreadUnitIntoView(sel: any) {
    if (typeof document === 'undefined') return;
    const unitId = useModalStore.getState().focusedThreadUnitId;
    if (!unitId) {
      scrollSelectionHeadDomOnly(sel);
      return;
    }
    const run = () => {
      try {
        scrollFocusedThreadUnitIntoView(unitId, {
          attempts: 6,
          sel,
        });
      } catch {
        try {
          scrollSelectionHeadDomOnly(sel);
        } catch {
          /* ignore */
        }
      }
    };
    // One rAF is enough for leaf paint of unit-focus; avoid double-rAF chain
    // that made every hop wait 2–3 frames under key-hold.
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(run);
    } else {
      run();
    }
  }

  /**
   * After ↑/↓ / ⌥↑↓ selection hop: thrifted virtual-index scroll (1.9.6 path)
   * for line/file caret; DOM unit reveal only when multi-reply unit is focused.
   * Line hops scroll **synchronously** (before React paint) so hold keeps up.
   */
  function scrollSelectionCaretAfterHop(sel: any) {
    try {
      const st = useModalStore.getState();
      const unitId = st.focusedThreadUnitId;
      const isThread =
        sel &&
        (sel.kind === 'thread' ||
          sel.subjectType === 'thread' ||
          sel.kind === 'inline-comment');
      if (unitId && isThread) {
        scrollDiffThreadUnitIntoView(sel);
        return;
      }
      // Sync index scroll — do not wait for paint / microtask
      scrollSelectionHeadDomOnly(sel);
    } catch {
      try {
        scrollSelectionHeadDomOnly(sel);
      } catch {
        /* ignore */
      }
    }
  }

  /**
   * @deprecated Prefer scrollSelectionCaretAfterHop. Kept for call sites that
   * still need unit-aware reveal; delegates to the thrifted hop path.
   */
  function scrollDiffCaretIntoView(sel: any) {
    scrollSelectionCaretAfterHop(sel);
  }

  /**
   * Array index of Diff inline-comment row for `rootId` (never row.rowIndex alone).
   */
  function findThreadArrayIndex(rootId: string): number {
    const list = Array.isArray(virtualRowsRef.current)
      ? virtualRowsRef.current
      : [];
    const want = String(rootId);
    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      if (!r) continue;
      const isThreadRow =
        typeof isInlineCommentRow === 'function'
          ? isInlineCommentRow(r)
          : r.kind === 'inline-comment' || r.kind === 'thread';
      if (!isThreadRow) continue;
      if (String(r.commentId) === want) return i;
    }
    return -1;
  }

  /** Pin Diff lineSelection caret on the thread virtual row (array index). */
  function pinThreadRowSelection(rootId: string): number {
    const list = Array.isArray(virtualRowsRef.current)
      ? virtualRowsRef.current
      : [];
    const arrIdx = findThreadArrayIndex(rootId);
    if (arrIdx < 0 || typeof beginSelectionOnRow !== 'function') return arrIdx;
    const pinned = beginSelectionOnRow(list[arrIdx], 'RIGHT', arrIdx);
    if (pinned) {
      try {
        useModalStore.getState().setLineSelection(pinned);
      } catch {
        /* ignore */
      }
    }
    return arrIdx;
  }

  /**
   * After leaving the last/first unit of a multi-reply thread, pin selection on
   * that thread row then one pure moveLineSelection step so reverse ↑ re-enters
   * the same stop (continuum covered by line-selection unit tests).
   */
  function handoffThreadExitToSelection(rootId: string, delta: number): boolean {
    const st = useModalStore.getState();
    st.setFocusedThreadUnitId(null);
    const list = Array.isArray(virtualRowsRef.current)
      ? virtualRowsRef.current
      : [];
    const arrIdx = pinThreadRowSelection(rootId);
    try {
      st.setActiveDiffCommentId(null);
    } catch {
      /* ignore */
    }
    const d = delta < 0 ? -1 : 1;
    const cur = useModalStore.getState().lineSelection;
    if (
      arrIdx >= 0 &&
      cur &&
      typeof moveLineSelection === 'function' &&
      list.length
    ) {
      const path = String(cur.filePath || list[arrIdx]?.filePath || '').trim();
      const next = moveLineSelection(cur, list, d, {
        shift: false,
        activeFilePath: path || null,
      });
      if (next && next !== cur) {
        st.setLineSelection(next);
        // Remember exit so reverse arrow re-enters multi-reply (even when
        // virtual rowIndex vs array index drift skips the thread stop).
        const exitHead = Number(next.headRowIndex);
        lastExitedMultiReplyRef.current = {
          rootId: String(rootId),
          exitLineArrIdx: Number.isFinite(exitHead) ? exitHead : arrIdx + d,
          exitDelta: d,
        };
        try {
          scrollSelectionCaretAfterHop(next);
        } catch {
          /* ignore */
        }
        return true;
      }
    }
    flushSelectionKeyboardMove(d, false);
    // Latch AFTER flush so flush does not treat this as "continue exit dir"
    // and drop re-entry (P3c reverse ↑).
    const after = useModalStore.getState().lineSelection;
    lastExitedMultiReplyRef.current = {
      rootId: String(rootId),
      exitLineArrIdx: Number.isFinite(Number(after?.headRowIndex))
        ? Number(after.headRowIndex)
        : arrIdx >= 0
          ? arrIdx + d
          : -1,
      exitDelta: d,
    };
    return true;
  }

  /**
   * Reverse of multi-reply exit: one opposite arrow re-enters that thread with
   * seedReviewThreadFocusUnit (↑ after exit-down → last reply). Consumes latch.
   */
  function tryReenterExitedMultiReply(delta: number): boolean {
    // Hot path: most ↑↓ have no latch — return before any work
    const latch = lastExitedMultiReplyRef.current;
    if (!latch?.rootId) return false;
    const d = delta < 0 ? -1 : 1;
    // Only reverse of the exit direction
    if (d === latch.exitDelta) return false;
    const st = useModalStore.getState();
    // Consume latch once reverse is requested (even if pin misses — jump below)
    lastExitedMultiReplyRef.current = null;
    if (isThreadSelection(st.lineSelection)) return false;

    const rootId = String(latch.rootId);
    const list = Array.isArray(virtualRowsRef.current)
      ? virtualRowsRef.current
      : [];
    const arrIdx = findThreadArrayIndex(rootId);
    const pinned =
      arrIdx >= 0 && typeof beginSelectionOnRow === 'function'
        ? beginSelectionOnRow(list[arrIdx], 'RIGHT', arrIdx)
        : null;
    if (!pinned) return false;

    const replies = repliesForRootCommentId(rootId);
    const units = listReviewThreadFocusUnits(rootId, replies);
    const seed =
      units.length >= 2 && typeof seedReviewThreadFocusUnit === 'function'
        ? seedReviewThreadFocusUnit(units, d)
        : null;
    const unitId = seed?.id ? String(seed.id) : null;
    const nextCommentIndex = Array.isArray(mappedComments)
      ? mappedComments.findIndex((c: any) => String(c?.id) === rootId)
      : -1;

    // The latch only exists after leaving this mounted thread. Do not call
    // jumpToReviewComment here: its root-first focus and scroll fight re-entry.
    useModalStore.setState({
      lineSelection: pinned,
      activeDiffCommentId: rootId,
      focusedThreadUnitId: unitId,
      ...(nextCommentIndex >= 0 ? { commentIndex: nextCommentIndex } : {}),
    });
    try {
      if (unitId) {
        document.documentElement.setAttribute(
          'data-prp-focused-thread-unit',
          unitId
        );
      } else {
        document.documentElement.removeAttribute('data-prp-focused-thread-unit');
      }
    } catch {
      /* ignore */
    }
    try {
      requestAnimationFrame(() => {
        scrollFocusedThreadUnitIntoView(unitId || rootId, {
          attempts: 12,
          sel: useModalStore.getState().lineSelection,
        });
      });
    } catch {
      /* ignore */
    }
    return true;
  }

  /**
   * ↑/↓ within a multi-reply review thread (root + replies). Returns true when
   * handled (in-thread step **or** exit handoff to line/thread selection).
   * No wrap at ends — one more step leaves the thread in the continuum.
   */
  function applyThreadReplyStep(delta: number): boolean {
    const st = useModalStore.getState();
    const liveLayout = st.layoutMode;
    const rootId = resolveFocusedReviewThreadRootId(st);
    if (!rootId) return false;
    const replies = repliesForRootCommentId(rootId);
    const units = listReviewThreadFocusUnits(rootId, replies);
    if (units.length < 2) return false;
    const cur =
      st.focusedThreadUnitId != null
        ? String(st.focusedThreadUnitId)
        : rootId;
    const stepped = stepReviewThreadFocusUnit(units, cur, delta);
    if (stepped.exit) {
      if (liveLayout === LAYOUT_DIFF) {
        return handoffThreadExitToSelection(rootId, delta);
      }
      // Conversation owns only this thread: keep the first/last unit focused.
      // Clearing it re-seeds the root on the next held keydown and wraps.
      return true;
    }
    const next = stepped.unit;
    if (!next) return false;
    // Keep Diff thread root selected while stepping units. setActiveDiffCommentId
    // clears focusedThreadUnitId — set root first, then the unit.
    if (liveLayout === LAYOUT_DIFF && st.activeDiffCommentId == null) {
      st.setActiveDiffCommentId(rootId);
    } else if (
      liveLayout === LAYOUT_DIFF &&
      st.activeDiffCommentId != null &&
      String(st.activeDiffCommentId) !== rootId
    ) {
      // Align root if store pointed elsewhere (e.g. reply id)
      st.setActiveDiffCommentId(rootId);
    }
    // Pin thread row selection so exit handoff leaves from the correct stop
    // (array index), not a stale/top-of-file line caret.
    if (liveLayout === LAYOUT_DIFF) {
      pinThreadRowSelection(rootId);
    }
    st.setFocusedThreadUnitId(next.id);
    if (liveLayout === LAYOUT_DIFF) {
      // Diff can need a virtual-row mount; keep its bounded retry path.
      requestAnimationFrame(() => {
        scrollFocusedThreadUnitIntoView(next.id, {
          attempts: 12,
          sel: useModalStore.getState().lineSelection,
        });
      });
    } else {
      // Conversation replies are mounted in the focused thread. Never run the
      // Diff retry loop against its hidden keep-alive list on every repeat.
      scrollConversationThreadUnitIntoView(next.id);
    }
    return true;
  }

  function stepThreadReply(delta: number): boolean {
    pendingThreadReplyDeltaRef.current = delta < 0 ? -1 : 1;
    if (threadReplyNavRafRef.current) return true;
    threadReplyNavRafRef.current = scheduleNavigationFrame(() => {
      threadReplyNavRafRef.current = null;
      const queued = pendingThreadReplyDeltaRef.current;
      pendingThreadReplyDeltaRef.current = 0;
      if (queued) applyThreadReplyStep(queued);
    });
    return true;
  }

  /** True when focused Diff/Conversation thread has ≥1 reply (↑/↓ unit nav). */
  function isMultiReplyThreadFocused(): boolean {
    const st = useModalStore.getState();
    // Require a real root id. DOM-only multi-reply (stale context-active after
    // continuum exit) must not claim ↑/↓ — that no-ops stepThreadReply and
    // blocks line/thread re-entry (P3c e2e).
    const rootId = resolveFocusedReviewThreadRootId(st);
    if (!rootId) return false;
    const unit = readFocusedThreadUnitStamp(st);
    const contextActive = isContextThreadCommentActive(rootId, st);
    // Unit stamp on a reply (≠ root) ⇒ multi-reply mode even if reply rows lag
    // in detail.reviewComments (TOR.3 seed leaves stamp on reply id).
    if (unit && unit !== String(rootId)) return true;
    // Context-active multi-reply + any unit/active/selection focus latch.
    // reviewComments lag used to make repliesForRoot empty while the thread
    // is clearly multi-reply in the Diff DOM (TOR.3).
    try {
      if (typeof document !== 'undefined') {
        const active = document.querySelector(
          `.prp-inline-thread--context-active[data-search-anchor="review-comment:${CSS.escape(rootId)}"], .prp-inline-thread[data-context-active="1"][data-search-anchor="review-comment:${CSS.escape(rootId)}"], .prp-inline-thread--threaded[data-search-anchor="review-comment:${CSS.escape(rootId)}"]`
        );
        const multiDom = Boolean(
          active &&
            (active.querySelector(
              '[data-prp-thread-unit="reply"][data-prp-thread-unit-id]'
            ) ||
              active.getAttribute('data-prp-multi-reply') === '1' ||
              active.classList.contains('prp-inline-thread--threaded'))
        );
        if (multiDom) {
          if (unit || contextActive) return true;
          if (st.activeDiffCommentId != null) {
            const activeId = String(st.activeDiffCommentId);
            if (activeId === String(rootId)) return true;
            const activeRoot = walkReviewCommentToRootId(activeId);
            if (activeRoot && String(activeRoot) === String(rootId)) {
              return true;
            }
          }
          const sel = st.lineSelection;
          if (isThreadSelection(sel) && sel?.commentId != null) {
            const selRoot = walkReviewCommentToRootId(String(sel.commentId));
            if (selRoot && String(selRoot) === String(rootId)) return true;
          }
          // Do not claim multi-reply from multi DOM alone (P3c continuum exit
          // can leave context-active). Require layout focus, unit, or Diff caret.
        }
      }
    } catch {
      /* fall through to data replies */
    }
    const replies = repliesForRootCommentId(rootId);
    if (replies.length > 0) {
      // Any unit stamp under this root (root or reply)
      if (unit || contextActive) return true;
      // Active Diff comment nav on this root (⌥J/K or continuum seed)
      if (st.activeDiffCommentId != null) {
        const activeRoot = walkReviewCommentToRootId(
          String(st.activeDiffCommentId)
        );
        if (activeRoot && String(activeRoot) === String(rootId)) return true;
      }
      // Line selection parked on this thread row
      const sel = st.lineSelection;
      if (isThreadSelection(sel) && sel?.commentId != null) {
        const selRoot = walkReviewCommentToRootId(String(sel.commentId));
        if (selRoot && String(selRoot) === String(rootId)) return true;
      }
    }
    return false;
  }

  /** Scroll left file-nav so the active file row is visible when off-screen. */
  function scrollFileNavRowIntoView(path: string) {
    const p = String(path || '').trim();
    if (!p) return;
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
      const row = root.querySelector(
        `[data-file-path="${esc}"]`
      ) as HTMLElement | null;
      const scroller = root.querySelector(
        '.prp-filetree__list'
      ) as HTMLElement | null;
      if (!row || !scroller) return;
      // offsetTop is relative to the row's offsetParent (often the <li>, so 0).
      // Rect deltas keep the write local without scrolling document ancestors.
      const rowRect = row.getBoundingClientRect();
      const viewRect = scroller.getBoundingClientRect();
      if (rowRect.top < viewRect.top) {
        scroller.scrollTop += rowRect.top - viewRect.top;
      } else if (rowRect.bottom > viewRect.bottom) {
        scroller.scrollTop += rowRect.bottom - viewRect.bottom;
      }
    } catch {
      /* ignore */
    }
  }

  /**
   * Decision: every adjacent file reached during key-hold must be visible.
   * Do not defer activeFilePath to the end of the hold; tree/header leaves
   * subscribe directly, so exact intermediate chrome does not re-render root.
   */
  function setActiveFilePathForNav(path: string) {
    const p = String(path || '').trim();
    if (!p) return;
    scrollFileNavRowIntoView(p);
    if (p !== String(useModalStore.getState().activeFilePath || '').trim()) {
      setActiveFilePath(p);
    }
  }

  /**
   * Keep file navigation on the next paint boundary. Each rAF advances one
   * adjacent file, so key-repeat never skips an intermediate rendered state.
   */
  const pendingFileNavDeltaRef = useRef(0);
  const fileNavRafRef = useRef(0);
  /** Coalesce page-scroll under key-hold: one hop per frame when rAF runs. */
  const pendingPageScrollDirRef = useRef(0);
  const pageScrollRafRef = useRef(0);
  const diffNavIdleTimerRef = useRef(0);

  /**
   * Cross-layer input-pressure signal. Host progressive paints and URI writes
   * wait until the held navigation burst settles instead of competing for the
   * same main-thread frames.
   */
  function noteDiffNavActivity() {
    try {
      document.documentElement.setAttribute('data-prp-diff-nav-active', '1');
      // File-nav uses Alt, but mounting/moving body-portaled hint bubbles on
      // every active row would force full-document layout during the hold.
      useModalStore.getState().setOptHintsActive(false);
      window.clearTimeout(diffNavIdleTimerRef.current);
      diffNavIdleTimerRef.current = window.setTimeout(() => {
        diffNavIdleTimerRef.current = 0;
        document.documentElement.removeAttribute('data-prp-diff-nav-active');
        const el = diffScrollerEl();
        if (el) setScrollTop(el.scrollTop);
        window.dispatchEvent(new CustomEvent('prp-sync-opt-hints'));
      }, 140);
    } catch {
      /* ignore */
    }
  }

  function sampleDiffNav<T>(
    operation: 'selection' | 'region' | 'file' | 'page',
    delta: number,
    run: () => T
  ): T {
    const perfStart = isDiffNavPerfEnabled()
      ? beginDiffNavPerfSample()
      : null;
    try {
      return run();
    } finally {
      if (perfStart) {
        endDiffNavPerfSample(perfStart, {
          presentation: isEmbed ? 'embed' : 'modal',
          operation,
          delta,
        });
      }
    }
  }

  useEffect(() => {
    return () => {
      window.clearTimeout(diffNavIdleTimerRef.current);
      diffNavIdleTimerRef.current = 0;
      if (fileNavRafRef.current) {
        cancelAnimationFrame(fileNavRafRef.current);
        fileNavRafRef.current = 0;
      }
      pendingFileNavDeltaRef.current = 0;
      try {
        document.documentElement.removeAttribute('data-prp-diff-nav-active');
      } catch {
        /* ignore */
      }
    };
  }, [open]);

  /** Live Diff scroller — prefer connected listRef, else DOM query. */
  function diffScrollerEl(): HTMLElement | null {
    const refEl = listRef.current as HTMLElement | null;
    if (refEl && refEl.isConnected) return refEl;
    try {
      if (typeof document === 'undefined') return null;
      return document.querySelector('.prp-vlist') as HTMLElement | null;
    } catch {
      return null;
    }
  }

  /** Apply one Diff page hop immediately (DOM-only; no store mirror). */
  function applyDiffPageScroll(dir: number) {
    const d = dir < 0 ? -1 : 1;
    const el = diffScrollerEl();
    if (!el) return;
    const next =
      typeof nextScrollTopByPage === 'function'
        ? nextScrollTopByPage(
            el.scrollTop,
            el.clientHeight,
            el.scrollHeight,
            d
          )
        : Math.max(
            0,
            Math.min(
              el.scrollHeight - el.clientHeight,
              el.scrollTop + d * el.clientHeight * 0.9
            )
          );
    // DOM-first; minStoreDelta = Infinity → never setScrollTop for page hops
    applyProgrammaticDiffScroll(el, next, {
      storeTop: useModalStore.getState().scrollTop,
      setStoreTop: setScrollTop,
      minDomDelta: 0.5,
      minStoreDelta: Number.POSITIVE_INFINITY,
    });
  }

  /** Diff file step — same DFS order as explorer + Diff list (displayFiles). */
  function navFile(delta: number) {
    if (typeof resolveAdjacentFileNav !== 'function') return;
    noteDiffNavActivity();
    const d = delta < 0 ? -1 : 1;
    pendingFileNavDeltaRef.current = d;
    if (fileNavRafRef.current) return;
    fileNavRafRef.current = requestAnimationFrame(() => {
      fileNavRafRef.current = 0;
      const queued = pendingFileNavDeltaRef.current;
      pendingFileNavDeltaRef.current = 0;
      if (!queued) return;
      const st = resolveAdjacentFileNav(
        displayFiles,
        readActiveFilePath(),
        queued
      );
      if (st.path) {
        sampleDiffNav('file', queued, () => onSelectFile(st.path));
      }
    });
  }

  /**
   * Scroll Diff virtual list by ~one viewport page.
   * DOM-only under key-hold: VirtualDiff range-gates via native scroll event.
   * Never mirrors store per hop (was re-rendering whole DiffWorkspace).
   *
   * Apply synchronously first (conversation page scroll does the same).
   * Background/headless Chrome freezes rAF — pure rAF page hops left scrollTop
   * stuck at 0 while the shortcut monitor still reported the action.
   * rAF coalesce still drops multi-fires in the same frame when rAF runs.
   */
  function scrollDiffPage(delta: number) {
    noteDiffNavActivity();
    const dir = delta < 0 ? -1 : 1;
    pendingPageScrollDirRef.current = dir;
    // Always move now so unfocused/headless sessions still page.
    sampleDiffNav('page', dir, () => applyDiffPageScroll(dir));
    // Coalesce further OS key-repeat in this frame (no-op if rAF is frozen).
    if (pageScrollRafRef.current) return;
    if (typeof requestAnimationFrame !== 'function') {
      pendingPageScrollDirRef.current = 0;
      return;
    }
    pageScrollRafRef.current = requestAnimationFrame(() => {
      pageScrollRafRef.current = 0;
      // Direction already applied synchronously; clear pending only.
      pendingPageScrollDirRef.current = 0;
    });
  }

  /**
   * Cached change-region index for the current virtual row list.
   * Rebuild only when list identity or length changes (not per hop).
   */
  function getChangeRegionIndexForList(list: any[]): ChangeRegionIndex | null {
    if (!Array.isArray(list) || !list.length) {
      changeRegionIndexRef.current = {
        list: null,
        listLength: 0,
        index: null,
      };
      return null;
    }
    const cached = changeRegionIndexRef.current;
    if (
      cached.list === list &&
      cached.listLength === list.length &&
      cached.index &&
      isChangeRegionIndexValid(cached.index, list)
    ) {
      return cached.index;
    }
    if (typeof buildChangeRegionIndex !== 'function') return null;
    const index = buildChangeRegionIndex(list);
    changeRegionIndexRef.current = {
      list,
      listLength: list.length,
      index,
    };
    return index;
  }

  /**
   * Apply one ⌥↑/⌥↓ change-region hop (uses cached region index).
   */
  function applyOptArrowScrollSelect(dir: number) {
    if (layoutMode !== LAYOUT_DIFF) return;
    const d = dir < 0 ? -1 : 1;
    const list =
      (Array.isArray(virtualRowsRef.current) && virtualRowsRef.current.length
        ? virtualRowsRef.current
        : Array.isArray(virtualRows)
          ? virtualRows
          : []) || [];
    const regionIndex = getChangeRegionIndexForList(list);
    const st = useModalStore.getState();
    const next =
      typeof jumpSelectionToAdjacentChangeRegion === 'function'
        ? jumpSelectionToAdjacentChangeRegion(
            st.lineSelection,
            list,
            d,
            undefined,
            regionIndex
          )
        : null;
    if (!next) return;
    // Collapse multi-line → single caret on the target first line
    setLineSelection(next);
    try {
      clearDiffThreadFocusIfNeeded();
    } catch {
      /* ignore */
    }
    const path = String(next.filePath || '').trim();
    if (path) {
      try {
        ensureFileExpandedForSelection(path);
        if (path !== readActiveFilePath()) {
          setActiveFilePathForNav(path);
        }
      } catch {
        /* ignore */
      }
    }
    scheduleSelectionActionsReveal();
    try {
      // Region hop is always a single line caret — thrifted index scroll
      scrollSelectionCaretAfterHop(next);
    } catch {
      /* ignore */
    }
  }

  /**
   * ⌥↑ / ⌥↓ on Diff: jump to first line of next/prev **change region**
   * (contiguous add/del/change run). Single-line selection only — never
   * multi-select a whole huge hunk. Scroll via caret reveal.
   *
   * Key-hold: rAF-coalesce like navFile (one hop per frame). Region list is
   * indexed once per virtualRows generation — not O(n) re-scanned per event.
   */
  function optArrowScrollSelect(delta: number) {
    if (layoutMode !== LAYOUT_DIFF) return;
    noteDiffNavActivity();
    const dir = delta < 0 ? -1 : 1;
    // Latest direction wins under hold (same thrift as navFile).
    pendingOptArrowDirRef.current = dir;
    if (optArrowRafRef.current) return;
    optArrowRafRef.current = scheduleNavigationFrame(() => {
      optArrowRafRef.current = null;
      const d = pendingOptArrowDirRef.current;
      pendingOptArrowDirRef.current = 0;
      if (!d) return;
      sampleDiffNav('region', d, () => applyOptArrowScrollSelect(d));
    });
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
  const conversationCommentPageItems = useMemo(() => {
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
  }, [detail]);

  /**
   * ⌥J / ⌥K on Conversation: step next/prev in visual UI order (wraps).
   * Order follows reverseComments (merge before vs after timeline).
   * Seeds on first press; focuses conversation layout if needed.
   */
  function applyConversationCommentNav(delta: number) {
    const ordered = conversationCommentPageItems;
    const focusOpts = { reverseComments };
    const st = useModalStore.getState();
    // Prefer live store ring/pending. A leftover ref after virtual unmount or
    // incomplete clear would make ⌥J step mid-list instead of re-seeding
    // description (e2e P1.2b: first stop must be description).
    const storeCur =
      st.focusedConversationAnchor ||
      st.pendingConversationNavAnchor ||
      null;
    if (!storeCur && conversationCommentFocusRef.current) {
      conversationCommentFocusRef.current = null;
    }
    // Re-seed only when store claims focus but neither DOM stamp nor local ref
    // agree (stale after e2e clear / progressive unmount). Do not clear when
    // stamp briefly lags a successful requestConversationNav (mid ⌥J walk).
    let cur =
      storeCur ||
      conversationCommentFocusRef.current?.anchor ||
      null;
    if (storeCur && typeof document !== 'undefined') {
      let stamp = '';
      try {
        stamp =
          document.documentElement.getAttribute(
            'data-prp-focused-conv-anchor'
          ) ||
          document.documentElement.getAttribute(
            'data-prp-pending-conv-anchor'
          ) ||
          '';
      } catch {
        stamp = '';
      }
      const refA = conversationCommentFocusRef.current?.anchor || null;
      if (!stamp && !refA) {
        cur = null;
        try {
          st.setFocusedConversationAnchor?.(null);
          st.requestConversationNav?.(null);
        } catch {
          /* ignore */
        }
      }
    }
    const next =
      typeof stepConversationCommentFocus === 'function'
        ? stepConversationCommentFocus(ordered, cur, delta, focusOpts)
        : typeof pickConversationCommentFocusTarget === 'function'
          ? pickConversationCommentFocusTarget(ordered, focusOpts)
          : null;
    if (!next) {
      conversationCommentFocusRef.current = null;
      useModalStore.getState().requestConversationNav(null);
      return;
    }
    conversationCommentFocusRef.current = next;
    // Commit the ring with the pending scroll. Mounted leaf cards update without
    // re-rendering ConversationView; an off-window row mounts in this paint.
    useModalStore.getState().requestConversationNav(next.anchor, true);
  }

  function navConversationComment(delta: number) {
    if (layoutMode === LAYOUT_DIFF) collapseDiff();
    pendingConversationNavDeltaRef.current = delta < 0 ? -1 : 1;
    if (conversationNavRafRef.current) return;
    conversationNavRafRef.current = scheduleNavigationFrame(() => {
      conversationNavRafRef.current = null;
      const queued = pendingConversationNavDeltaRef.current;
      pendingConversationNavDeltaRef.current = 0;
      if (queued) applyConversationCommentNav(queued);
    });
  }

  function toggleViewedActiveFile() {
    const path = readActiveFilePath();
    if (!path) return;
    onToggleViewed(path);
  }

  /**
   * Fold / expand the focused Diff file (line selection path, else active tree file).
   * Keyboard: ⌥F toggle; ← collapse / → expand when layout is Diff.
   */
  function toggleActiveFileCollapse() {
    const path = resolveActiveFileForCollapse({
      lineSelection: useModalStore.getState().lineSelection,
      activeFilePath: readActiveFilePath(),
    });
    if (!path) return;
    onToggleFileCollapse(path);
  }

  /** Directed file fold: wantCollapsed true = collapse, false = expand. */
  function setActiveFileCollapse(wantCollapsed: boolean) {
    const path = resolveActiveFileForCollapse({
      lineSelection: useModalStore.getState().lineSelection,
      activeFilePath: readActiveFilePath(),
    });
    if (!path) return;
    setCollapsedFiles((prev) =>
      typeof setPathCollapsedInSet === 'function'
        ? setPathCollapsedInSet(
            prev,
            path,
            wantCollapsed,
            annotatedFiles,
            viewedPaths
          )
        : wantCollapsed
          ? (() => {
              const n = new Set(prev);
              n.add(path);
              return n;
            })()
          : typeof expandPathInCollapsedSet === 'function'
            ? expandPathInCollapsedSet(
                prev,
                path,
                annotatedFiles,
                viewedPaths
              )
            : (() => {
                const n = new Set(prev);
                n.delete(path);
                return n;
              })()
    );
  }

  /**
   * Low-priority filter write so toolbar optimistic paint stays on the urgent
   * lane; deferred consumers (virtualRows / mappedComments) follow after.
   */
  function scheduleDiffReviewFilter(
    next:
      | DiffReviewFilterState
      | ((prev: DiffReviewFilterState) => DiffReviewFilterState)
  ) {
    startTransition(() => {
      setDiffReviewFilter(next);
    });
  }

  /** Apply Diff review-filter status toggle (⌥U/R/P) — multi-select. */
  function applyReviewFilterToggle(
    target: 'unresolved' | 'resolved' | 'pending'
  ) {
    scheduleDiffReviewFilter((prev) =>
      typeof toggleReviewFilter === 'function'
        ? normalizeDiffReviewFilter(toggleReviewFilter(prev, target))
        : toggleDiffReviewStatus(prev, target)
    );
  }

  function patchDiffReviewFilter(partial: Partial<DiffReviewFilterState>) {
    scheduleDiffReviewFilter((prev) => {
      const base = normalizeDiffReviewFilter(prev);
      const next = normalizeDiffReviewFilter({ ...base, ...partial });
      if (
        partial &&
        Object.prototype.hasOwnProperty.call(partial, 'hideOutdated')
      ) {
        try {
          saveDiffGlobalPrefs(resolveDiffGlobalPrefsStorage(window), {
            hideOutdated: next.hideOutdated,
          });
        } catch {
          /* ignore */
        }
      }
      return next;
    });
  }

  /** Persist hide-whitespace globally and update local state. */
  function applyHideWhitespace(next: boolean) {
    const v = Boolean(next);
    setHideWhitespace(v);
    try {
      saveDiffGlobalPrefs(resolveDiffGlobalPrefsStorage(window), {
        hideWhitespace: v,
      });
    } catch {
      /* ignore */
    }
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
    const activePath = readActiveFilePath();
    const path =
      typeof resolveGotoPathAmongFiles === 'function'
        ? resolveGotoPathAmongFiles(
            parsed.path,
            activePath,
            displayFiles
          )
        : String(parsed.path || activePath || '').trim() || null;
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

  /** Stamp documentElement so OptBtnHint / CSS can hide badges during jump. */
  function setSelectionNavBusy(busy: boolean) {
    const next = Boolean(busy);
    selectionNavBusyRef.current = next;
    try {
      const root =
        typeof document !== 'undefined' ? document.documentElement : null;
      if (!root) return;
      if (next) root.setAttribute(SELECTION_NAV_BUSY_ATTR, '1');
      else root.removeAttribute(SELECTION_NAV_BUSY_ATTR);
    } catch {
      /* ignore */
    }
  }

  /**
   * Drop Diff line selection + island chrome.
   * Used when navigating threads or files so selection does not linger
   * across focus contexts (⌥J/K threads, ⌥⇧[] files, tree click).
   */
  function clearLineSelectionForNav() {
    clearSelectionActionsTimer();
    setSelectionNavBusy(false);
    if (selectionMoveRafRef.current) {
      selectionMoveRafRef.current.cancel();
      selectionMoveRafRef.current = null;
    }
    pendingSelectionMoveRef.current = null;
    selectingRef.current = false;
    setSelecting(false);
    if (useModalStore.getState().lineSelection) {
      setLineSelection(null);
    }
    setShowSelectionComposer(false);
    setSelectionIslandLeaving(false);
    setSelectionIslandPhase('actions');
  }

  /**
   * Mount/unmount the selection action group from pure policy:
   * selection alone never shows — need Opt-hold, hover, or comment phase.
   */
  function syncSelectionActionReveal() {
    const st = useModalStore.getState();
    const sel = st.lineSelection;
    const phase = selectionIslandPhaseRef.current;
    const thread =
      !sel ||
      (typeof isThreadSelection === 'function'
        ? isThreadSelection(sel)
        : sel.kind === 'thread' ||
          sel.subjectType === 'thread' ||
          sel.kind === 'inline-comment');
    const hasLineOrFile = Boolean(sel && !thread);
    let domOpt = false;
    try {
      const root = typeof document !== 'undefined' ? document.documentElement : null;
      domOpt = Boolean(
        root?.hasAttribute?.('data-prp-opt-held') ||
          root?.classList?.contains?.('prp-opt-held')
      );
    } catch {
      domOpt = false;
    }
    const optHeld = Boolean(
      optHeldRef.current || st.optHintsActive || domOpt
    );
    const show =
      typeof shouldShowSelectionActionGroup === 'function'
        ? shouldShowSelectionActionGroup({
            hasLineOrFileSelection: hasLineOrFile,
            selecting: Boolean(st.selecting || selectingRef.current),
            optHeld,
            hoverReveal: Boolean(selectionHoverRevealRef.current),
            selectionNavBusy: Boolean(selectionNavBusyRef.current),
            phase,
          })
        : phase === 'comment' ||
          (!selectionNavBusyRef.current &&
            (optHeld || selectionHoverRevealRef.current));

    if (show) {
      setSelectionIslandLeaving(false);
      // Ensure actions phase when revealing via Opt/hover (comment stays)
      if (phase !== 'comment') {
        const nextPhase =
          typeof resolveSelectionIslandRevealPhase === 'function'
            ? resolveSelectionIslandRevealPhase(sel)
            : 'actions';
        if (nextPhase === 'hidden') {
          if (st.showSelectionComposer) setShowSelectionComposer(false);
          return;
        }
        if (selectionIslandPhaseRef.current !== 'actions') {
          selectionIslandPhaseRef.current = 'actions';
          setSelectionIslandPhase('actions');
        }
      }
      if (!st.showSelectionComposer) setShowSelectionComposer(true);
      return;
    }
    // Hide action dock; never tear down an open comment island here
    if (phase === 'comment') return;
    if (st.showSelectionComposer) setShowSelectionComposer(false);
  }

  /**
   * After select/move: hide actions dock + OptBtnHints immediately, then after
   * SELECTION_ACTIONS_REVEAL_MS settle re-sync (Opt-hold / hover may show dock).
   * Comment phase stays open. Jump-hold resets the timer on every move.
   */
  function scheduleSelectionActionsReveal() {
    clearSelectionActionsTimer();
    const phase = selectionIslandPhaseRef.current;
    if (phase === 'comment' && useModalStore.getState().lineSelection) {
      // Keep comment island; do not auto-flip to actions
      setSelectionNavBusy(false);
      if (!useModalStore.getState().showSelectionComposer) {
        setShowSelectionComposer(true);
      }
      return;
    }
    // Jump in flight: suppress floatbar + all OptBtnHints until settle
    setSelectionNavBusy(true);
    if (useModalStore.getState().showSelectionComposer) {
      setShowSelectionComposer(false);
    }
    const delay =
      typeof SELECTION_ACTIONS_REVEAL_MS === 'number' &&
      SELECTION_ACTIONS_REVEAL_MS > 0
        ? SELECTION_ACTIONS_REVEAL_MS
        : 450;
    selectionActionsTimerRef.current = setTimeout(() => {
      selectionActionsTimerRef.current = null;
      setSelectionNavBusy(false);
      // Arm store + floatbar in one turn so OptBtnHints mount with the dock
      // (same Opt-hold gesture after selection settle).
      try {
        const optDown =
          Boolean(optHeldRef.current) ||
          (typeof document !== 'undefined' &&
            Boolean(
              document.documentElement?.hasAttribute?.('data-prp-opt-held')
            ));
        if (optDown && !optHintsSuppressedRef.current) {
          useModalStore.getState().setOptHintsActive(true);
        }
      } catch {
        /* ignore */
      }
      try {
        syncSelectionActionReveal();
      } catch {
        /* ignore */
      }
    }, delay);
  }

  function setSelectionHoverReveal(next: boolean) {
    const v = Boolean(next);
    if (selectionHoverRevealRef.current === v) return;
    selectionHoverRevealRef.current = v;
    syncSelectionActionReveal();
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
      const { avgH: h, rowOffsetList: offs } = getDiffScrollMetrics();
      // Sticky file header overlays the top of the Diff list (~ROW_HEIGHT).
      // Without padTop, ArrowUp pins the caret under that fixed bar.
      // padBottom stays minimal: action floatbar flips **above** the selection
      // when the scroller bottom is tight (SelectionCommentBar +
      // resolveSelectionDockVerticalPlacement) — no need to reserve ~3 lines.
      const stickyTop =
        typeof ROW_HEIGHT === 'number' && ROW_HEIGHT > 0 ? ROW_HEIGHT : h;
      const top =
        typeof scrollTopToRevealIndex === 'function'
          ? scrollTopToRevealIndex(
              headIdx,
              cur,
              h,
              vp,
              virtualRows.length,
              offs,
              { padTop: stickyTop + 2, padBottom: 8 }
            )
          : cur;
      applyProgrammaticDiffScroll(el, top, {
        storeTop: useModalStore.getState().scrollTop,
        setStoreTop: setScrollTop,
        minDomDelta: 0.5,
        // Key navigation owns the DOM; sync one store snapshot on idle.
        minStoreDelta: Number.POSITIVE_INFINITY,
      });
    } catch {
      /* ignore */
    }
  }

  /** Expand a path if collapsed so selectable lines exist after cross-file hop. */
  function ensureFileExpandedForSelection(path: string) {
    const p = String(path || '').trim();
    if (!p) return;
    // Respect pref: do not force-open on selection hop unless auto-expand is on
    // (explicit jump/goto still uses expandFileForJump).
    if (!autoExpandOnFileNav) return;
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
    const cur = readActiveFilePath();
    if (path === cur) return;
    setActiveFilePathForNav(path);
    ensureFileExpandedForSelection(path);
  }

  function flushSelectionKeyboardMove(delta: number, shift: boolean) {
    if (typeof moveLineSelection !== 'function') return;
    // Multi-reply continuum reverse: re-enter exited thread before line walk
    if (!shift && tryReenterExitedMultiReply(delta)) {
      scheduleSelectionActionsReveal();
      return;
    }
    // Continued in the same direction as exit → abandon reverse re-entry.
    // (Do not clear on opposite-direction failure here — tryReenter already
    // clears; and handoff may call flush after setting the latch.)
    const latch = lastExitedMultiReplyRef.current;
    if (latch) {
      const d = delta < 0 ? -1 : 1;
      if (d === latch.exitDelta) {
        lastExitedMultiReplyRef.current = null;
      }
    }
    const st = useModalStore.getState();
    const activePath = readActiveFilePath();
    const prevSel = st.lineSelection;
    // Prefer selection.filePath for seed context so lagging tree activeFile
    // cannot reseed to the previous file top under key-hold (jump-up).
    const pathHint = String(prevSel?.filePath || activePath || '').trim();
    const rowsLive = virtualRowsRef.current?.length
      ? virtualRowsRef.current
      : virtualRows;
    const nextSel =
      moveLineSelection(prevSel, rowsLive, delta, {
        shift,
        activeFilePath: pathHint,
      }) || prevSel;

    const nextPath = String(nextSel?.filePath || '').trim();
    const crossedFile =
      Boolean(nextPath) && nextPath !== String(prevSel?.filePath || '').trim();

    // No-op: skip React / scroll work under key-hold against an edge
    const unchanged =
      nextSel === prevSel ||
      (prevSel &&
        nextSel &&
        Number(nextSel.headRowIndex) === Number(prevSel.headRowIndex) &&
        Number(nextSel.anchorRowIndex) === Number(prevSel.anchorRowIndex) &&
        String(nextSel.filePath || '') === String(prevSel.filePath || '') &&
        String(nextSel.kind || '') === String(prevSel.kind || '') &&
        String(nextSel.commentId ?? '') === String(prevSel.commentId ?? '') &&
        Number(nextSel.headLine) === Number(prevSel.headLine));

    // Single-file mode hop at EOF/BOF (not multi-line extend).
    // Never clear selection when there is no adjacent file to hop to.
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
        const adj = resolveAdjacentFileNav(
          displayFiles,
          pathHint || activePath,
          d
        );
        if (adj.path && adj.path !== (pathHint || activePath)) {
          pendingCrossFileSeedRef.current = {
            path: adj.path,
            edge: d > 0 ? 'first' : 'last',
          };
          setActiveFilePathForNav(adj.path);
          ensureFileExpandedForSelection(adj.path);
          // Clear only as we hop — keep caret painted when hop is a no-op.
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

    // Resolve thread entry before the first store paint so reverse entry never
    // flashes the root comment before its directional reply.
    const isThreadNext =
      nextSel &&
      (nextSel.kind === 'thread' ||
        nextSel.subjectType === 'thread' ||
        nextSel.kind === 'inline-comment') &&
      nextSel.commentId != null;

    let seededThreadEntry: {
      rootId: string;
      unitId: string;
      commentIndex: number;
    } | null = null;
    if (isThreadNext && !shift) {
      const rootId = String(nextSel.commentId);
      try {
        const replies = repliesForRootCommentId(rootId);
        const units = listReviewThreadFocusUnits(rootId, replies);
        const seed =
          units.length >= 2 &&
          typeof seedReviewThreadFocusUnit === 'function'
            ? seedReviewThreadFocusUnit(units, delta)
            : null;
        if (seed?.id) {
          seededThreadEntry = {
            rootId,
            unitId: String(seed.id),
            commentIndex: Array.isArray(mappedComments)
              ? mappedComments.findIndex((c: any) => String(c?.id) === rootId)
              : -1,
          };
        }
      } catch {
        /* fall through to root-only thread entry */
      }
    }

    if (seededThreadEntry) {
      const { rootId, unitId, commentIndex: nextCommentIndex } =
        seededThreadEntry;
      // Keep thread entry atomic. setCommentIndex clears unit focus, so four
      // separate updates would visibly paint root before the directional reply.
      useModalStore.setState({
        lineSelection: nextSel,
        activeDiffCommentId: rootId,
        focusedThreadUnitId: unitId,
        ...(nextCommentIndex >= 0 ? { commentIndex: nextCommentIndex } : {}),
      });
      try {
        document.documentElement.setAttribute(
          'data-prp-focused-thread-unit',
          unitId
        );
      } catch {
        /* ignore */
      }
    } else {
      setLineSelection(nextSel);
    }
    // Sync the navigation path before the next repeat; leaf subscribers update
    // the tree/header chrome without re-rendering the composition root.
    if (nextPath && nextPath !== activePath) {
      setActiveFilePathForNav(nextPath);
      if (crossedFile) {
        ensureFileExpandedForSelection(nextPath);
      }
    }
    if (useModalStore.getState().selectionIslandLeaving) {
      setSelectionIslandLeaving(false);
    }

    if (isThreadNext) {
      const rootId = String(nextSel.commentId);
      if (!seededThreadEntry && Array.isArray(mappedComments)) {
        const tIdx = mappedComments.findIndex(
          (c: any) => String(c?.id) === rootId
        );
        if (tIdx >= 0 && tIdx !== commentIndex) setCommentIndex(tIdx);
      }
      if (!shift) {
        try {
          const live = useModalStore.getState();
          if (seededThreadEntry) {
            scrollDiffThreadUnitIntoView(live.lineSelection || nextSel);
          } else {
            live.setActiveDiffCommentId(rootId);
            // Single-comment threads still expose the root unit DOM. Reveal it
            // directly so a visible comment is a no-op; index scroll is only
            // the not-yet-mounted fallback inside this helper.
            scrollFocusedThreadUnitIntoView(rootId, {
              attempts: 6,
              sel: live.lineSelection || nextSel,
            });
          }
        } catch {
          scrollSelectionHeadDomOnly(nextSel);
        }
      } else {
        useModalStore.getState().setActiveDiffCommentId(rootId);
        scrollSelectionHeadDomOnly(nextSel);
      }
    } else {
      clearDiffThreadFocusIfNeeded();
      try {
        scrollSelectionHeadDomOnly(nextSel);
      } catch {
        /* ignore */
      }
    }
    scheduleSelectionActionsReveal();
  }

  /**
   * Keyboard line move — rAF-coalesced under key-repeat so held arrows do not
   * thrash React with one update per OS keydown.
   * Opposite-direction keys discard residual stack (see coalesceSelectionMoveDelta)
   * so ↑ after a burst of ↓ is not net-positive.
   */
  function applySelectionKeyboardMove(delta: number, shift: boolean) {
    noteDiffNavActivity();
    const pending = pendingSelectionMoveRef.current;
    const next =
      typeof coalesceSelectionMoveDelta === 'function'
        ? coalesceSelectionMoveDelta(pending, delta, Boolean(shift))
        : pending && pending.shift === Boolean(shift)
          ? // Fallback without pure helper: still cancel opposite residual
            pending.delta !== 0 &&
            delta !== 0 &&
            Math.sign(pending.delta) !== Math.sign(delta)
            ? { delta, shift: Boolean(shift) }
            : { delta: pending.delta + delta, shift: Boolean(shift) }
          : { delta, shift: Boolean(shift) };
    pendingSelectionMoveRef.current = next;
    if (selectionMoveRafRef.current) return;
    selectionMoveRafRef.current = scheduleNavigationFrame(() => {
      selectionMoveRafRef.current = null;
      const p = pendingSelectionMoveRef.current;
      pendingSelectionMoveRef.current = null;
      if (!p || !p.delta) return;
      // Opt-in: window.__PRP_DIFF_NAV_PERF__.enable() or localStorage prp:diff-nav-perf=1
      const perfStart = isDiffNavPerfEnabled()
        ? beginDiffNavPerfSample()
        : null;
      try {
        flushSelectionKeyboardMove(p.delta, p.shift);
      } finally {
        if (perfStart) {
          endDiffNavPerfSample(perfStart, {
            presentation: isEmbed ? 'embed' : 'modal',
            operation: 'selection',
            delta: p.delta,
          });
        }
      }
    });
  }

  // Initialize / restore view state once per PR number (sessionStorage + initialRoute).
  // Session UI (file/line selection, comment forms) restores only when PR + page match.
  useEffect(() => {
    if (!open || !detail?.owner || !detail?.repo || !detail?.number) return;
    const key = `${detail.owner}/${detail.repo}#${detail.number}`;
    if (routeRestoreKeyRef.current === key) return;
    routeRestoreKeyRef.current = key;
    positionAppliedRef.current = null;
    positionInFlightRef.current = null;
    positionExhaustedRef.current = null;
    positionConvDeepLinkKeyRef.current = null;
    positionLayoutDismissedRef.current = null;
    positionLoadMoreKickRef.current = 0;
    if (positionVerifyTimerRef.current) {
      clearTimeout(positionVerifyTimerRef.current);
      positionVerifyTimerRef.current = null;
    }
    setRouteWriteReady(false);
    // Zustand survives host unmount — never carry focused comment into a new PR URI
    setCommentIndex(-1);
    setLineSelection(null);
    setSelectionDraft('');
    setShowSelectionComposer(false);
    setSelectionIslandPhase('actions');

    let stored: any = null;
    try {
      if (typeof sessionStorage !== 'undefined') {
        stored = loadSessionView(
          sessionStorage,
          detail.owner,
          detail.repo,
          detail.number
        );
      }
    } catch {
      stored = null;
    }

    // Host/stack nav page wins so Diff↔Conversation is preserved when switching
    // stacked PRs (do not clobber with the target PR's stored session layout).
    const routePage = normalizePage(initialRoute?.page);
    if (routePage) {
      const wantDiff = routePage === 'diff';
      const emptyDiff =
        typeof isDiffUnavailable === 'function' &&
        isDiffUnavailable(detail);
      setLayoutMode(
        wantDiff && !emptyDiff ? LAYOUT_DIFF : LAYOUT_CENTERED
      );
    }

    // Effective page for session gate (URI page, else stored page)
    const effectivePage =
      routePage ||
      (stored?.page === 'diff' || stored?.layoutMode === 'diff'
        ? 'diff'
        : stored?.page === 'conversation' || stored?.layoutMode === 'centered'
          ? 'conversation'
          : null);

    const allowSessionUi =
      typeof canRestoreSessionView === 'function'
        ? canRestoreSessionView(stored, {
            owner: detail.owner,
            repo: detail.repo,
            number: detail.number,
            page: effectivePage,
          })
        : Boolean(stored);

    // Commit filter restore runs via applyDiffCommitFilter effect below
    // (needs detail.commits for compare range). Do not half-set state here.

    if (stored && allowSessionUi) {
      if (
        !routePage &&
        (stored.layoutMode === 'diff' || stored.layoutMode === 'centered')
      ) {
        const emptyDiff =
          typeof isDiffUnavailable === 'function' &&
          isDiffUnavailable(detail);
        setLayoutMode(
          stored.layoutMode === 'diff' && !emptyDiff
            ? LAYOUT_DIFF
            : LAYOUT_CENTERED
        );
      }
      if (stored.diffMode === 'split' || stored.diffMode === 'unified') {
        setDiffMode(stored.diffMode);
      }
      // hideWhitespace is global (diff-global-prefs); do not restore per-PR session over it.
      if (Array.isArray(stored.collapsedFiles)) {
        setCollapsedFiles(new Set(stored.collapsedFiles));
      }
      if (Array.isArray(stored.viewedPaths)) {
        setViewedPaths(new Set(stored.viewedPaths));
      }
      if (stored.activeFilePath) setActiveFilePath(stored.activeFilePath);
      // File / line selection + comment forms (only same PR + page)
      if (stored.lineSelection && typeof stored.lineSelection === 'object') {
        setLineSelection(stored.lineSelection);
      }
      if (typeof stored.selectionDraft === 'string' && stored.selectionDraft) {
        setSelectionDraft(stored.selectionDraft);
      }
      if (stored.showSelectionComposer) {
        setShowSelectionComposer(true);
        setSelectionIslandPhase(
          stored.selectionIslandPhase === 'comment' ? 'comment' : 'actions'
        );
      }
      if (typeof stored.commentText === 'string' && stored.commentText) {
        setCommentText(stored.commentText);
      }
      if (
        Number.isFinite(Number(stored.scrollTop)) &&
        Number(stored.scrollTop) > 0
      ) {
        setScrollTop(Math.floor(Number(stored.scrollTop)));
      }
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
    setLineSelection,
    setSelectionDraft,
    setShowSelectionComposer,
    setCommentText,
    setScrollTop,
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
  // When inbound URL has no #diff-, leave session-restored selection alone
  // (do not wipe file/line selection from matching PR+page session snap).
  useEffect(() => {
    if (!open || !detail?.number) return;
    const fileKey = initialRoute?.fileKey || null;
    const filePathHint = initialRoute?.filePath || null;
    const startLine = initialRoute?.startLine ?? null;
    const applyKey = `${detail.number}:${fileKey || ''}:${filePathHint || ''}:${startLine}:${initialRoute?.endLine ?? ''}`;
    if (ghSelectionAppliedRef.current === applyKey) return;

    if (!fileKey && !filePathHint) {
      ghSelectionAppliedRef.current = applyKey;
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
    if (layoutMode !== LAYOUT_DIFF) {
      expandDiff();
      if (useModalStore.getState().layoutMode !== LAYOUT_DIFF) return;
    }

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

  // Focus comment/thread from URI/session position (Conversation or Diff).
  // Progressive load: do not mark applied until scroll/focus succeeds.
  // Comment may appear after timeline/thread pages settle or off-window.
  useEffect(() => {
    if (!open || !detail?.number) return;
    // Prefer host initialRoute; also re-read location.hash so soft-nav / race
    // where routePosition lagged still restores #issuecomment- / #discussion_r-.
    let pos = initialRoute?.position || null;
    let routePage = normalizePage(initialRoute?.page);
    let hashKind: string | null = null;
    try {
      if (typeof location !== 'undefined') {
        const gh = parseGithubCommentHash(location.hash || '');
        if (gh) {
          if (!pos) pos = gh.position;
          if (!routePage) routePage = normalizePage(gh.page);
          hashKind = gh.kind || null;
        }
      }
    } catch {
      /* ignore */
    }
    if (!pos) return;
    const applyKey = `${detail.number}:${pos}`;
    if (positionAppliedRef.current === applyKey) return;
    const parsed = parsePosition(pos);
    if (!parsed) return;

    const corpusSig = [
      Array.isArray(detail.comments) ? detail.comments.length : 0,
      Array.isArray(detail.reviewComments)
        ? detail.reviewComments.length
        : Array.isArray(detail.review_comments)
          ? detail.review_comments.length
          : 0,
      Array.isArray(detail.reviewThreads)
        ? detail.reviewThreads.length
        : Array.isArray(detail.review_threads)
          ? detail.review_threads.length
          : 0,
      mappedComments.length,
      detail?.timelineMeta?.loadedCount ?? '',
      detail?.commentsMeta?.loadedCount ?? '',
      detail?.reviewThreadsMeta?.loadedCount ??
        detail?.reviewThreadsMeta?.loadedThreadCount ??
        '',
    ].join('|');
    const exhausted = positionExhaustedRef.current;
    if (
      exhausted &&
      exhausted.key === applyKey &&
      exhausted.corpus === corpusSig
    ) {
      // Same incomplete corpus as last soft-budget — wait for more data.
      return;
    }

    const clearVerifyTimer = () => {
      if (positionVerifyTimerRef.current) {
        clearTimeout(positionVerifyTimerRef.current);
        positionVerifyTimerRef.current = null;
      }
    };

    const markApplied = () => {
      positionAppliedRef.current = applyKey;
      positionInFlightRef.current = null;
      positionExhaustedRef.current = null;
      if (positionConvDeepLinkKeyRef.current === applyKey) {
        positionConvDeepLinkKeyRef.current = null;
      }
      clearVerifyTimer();
    };

    const markSoftExhausted = () => {
      positionInFlightRef.current = null;
      positionExhaustedRef.current = { key: applyKey, corpus: corpusSig };
      if (positionConvDeepLinkKeyRef.current === applyKey) {
        positionConvDeepLinkKeyRef.current = null;
      }
      clearVerifyTimer();
    };

    const kickLoadMoreIfNeeded = () => {
      if (typeof onLoadMoreReviewThreads !== 'function') return;
      const now = Date.now();
      // Throttle kicks — load-more is expensive.
      if (now - positionLoadMoreKickRef.current < 900) return;
      const tl = detail?.timelineMeta || {};
      const cm = detail?.commentsMeta || {};
      const tm = detail?.reviewThreadsMeta || {};
      const need =
        Boolean(tl.hasMore) ||
        tl.complete === false ||
        Boolean(cm.hasMore) ||
        Boolean(tm.hasMore) ||
        Boolean(tm.hasOlder);
      if (!need) return;
      positionLoadMoreKickRef.current = now;
      void onLoadMoreReviewThreads('all').catch(() => {
        /* host surfaces stage errors */
      });
    };

    /**
     * Keep re-requesting conversation nav until focused.
     * Virtual list may miss the first paint when the row is off-window / not
     * yet in the progressive feed — also kick timeline/thread pagination.
     *
     * Always (re)starts the verify loop: React effect cleanup clears the prior
     * timer on dependency change, so an in-flight early-return would stall.
     *
     * Layout: leave Diff only on the first attempt for this applyKey. If the
     * user opens Diff while we are mid-verify (or after soft-exhaust), do not
     * yank layout back — that was blocking Conversation → Diff toggles when
     * prp_position deep-links stayed pending on large progressive timelines.
     */
    const startConversationDeepLink = (anchor: string) => {
      // Pure ownership contract — consumable intent, not durable layout veto.
      // Live layout from store (render-closure layoutMode lags under toggle).
      const decision = decideConversationDeepLinkLayout({
        applyKey,
        liveLayout: useModalStore.getState().layoutMode,
        appliedKey: positionAppliedRef.current,
        dismissedKey: positionLayoutDismissedRef.current,
        inFlightKey: positionInFlightRef.current,
        convDeepLinkKey: positionConvDeepLinkKeyRef.current,
        exhaustedKey: positionExhaustedRef.current?.key ?? null,
        layoutDiff: LAYOUT_DIFF,
      });
      if (decision === 'noop') return;
      if (decision === 'abandon') {
        positionLayoutDismissedRef.current = applyKey;
        markApplied();
        return;
      }
      clearVerifyTimer();
      positionInFlightRef.current = applyKey;
      positionConvDeepLinkKeyRef.current = applyKey;
      positionExhaustedRef.current = null;
      if (decision === 'force_leave_diff') {
        setLayoutMode(LAYOUT_CENTERED);
      }
      try {
        useModalStore.getState().requestConversationNav(anchor);
      } catch {
        /* ignore */
      }
      let ticks = 0;
      const MAX_TICKS = 100; // ~20s @ 200ms
      const tick = () => {
        // User opened Diff mid-loop — stop fighting layout / conversation focus.
        if (positionLayoutDismissedRef.current === applyKey) {
          markApplied();
          return;
        }
        if (useModalStore.getState().layoutMode === LAYOUT_DIFF) {
          positionLayoutDismissedRef.current = applyKey;
          markApplied();
          return;
        }
        ticks += 1;
        try {
          const st = useModalStore.getState();
          if (st.focusedConversationAnchor === anchor) {
            // Confirm the node is in the active conversation scroller viewport
            // when possible; stamp alone can race height settle.
            try {
              const scroller = document.querySelector(
                '.prp-body-panel--active .prp-conversation-virtual'
              ) as HTMLElement | null;
              const node = scroller
                ? (scroller.querySelector(
                    `[data-search-anchor="${CSS.escape(anchor)}"]`
                  ) as HTMLElement | null)
                : null;
              if (node && scroller) {
                const s = scroller.getBoundingClientRect();
                const r = node.getBoundingClientRect();
                const visible =
                  Math.min(r.bottom, s.bottom) - Math.max(r.top, s.top);
                const ok =
                  visible > Math.min(48, Math.max(20, r.height * 0.15));
                if (ok) {
                  markApplied();
                  return;
                }
                // Focused but not in view — re-request nav to re-scroll.
                st.requestConversationNav(anchor);
              } else {
                markApplied();
                return;
              }
            } catch {
              markApplied();
              return;
            }
          } else if (st.pendingConversationNavAnchor !== anchor) {
            // Pending cleared without focus (lost) or never set — re-request
            st.requestConversationNav(anchor);
          }
          // Still waiting: ensure older pages load when target is off first window.
          if (ticks === 1 || ticks % 5 === 0) {
            kickLoadMoreIfNeeded();
          }
        } catch {
          /* ignore */
        }
        if (ticks >= MAX_TICKS) {
          // Soft exhaust — re-enter when corpus grows (more pages arrive).
          markSoftExhausted();
          return;
        }
        positionVerifyTimerRef.current = setTimeout(tick, 200);
      };
      positionVerifyTimerRef.current = setTimeout(tick, 80);
    };

    // Conversation deep-link: scroll/focus timeline or thread card
    if (routePage === 'conversation') {
      if (positionLayoutDismissedRef.current === applyKey) {
        positionAppliedRef.current = applyKey;
        return;
      }
      let anchor = resolveConversationAnchorForCommentId(detail, parsed.id);
      if (!anchor && parsed.id) {
        anchor = optimisticConversationAnchorForKind(parsed.id, hashKind);
      }
      if (!anchor) return;
      // Start immediately even before first feed paint so pending is live when
      // VirtualConversationList mounts (and layout switches off Diff).
      startConversationDeepLink(anchor);
      return () => clearVerifyTimer();
    }

    // Diff (default when page omitted or page=diff): mapped review comment roots.
    // Copy-link uses the exact comment id (root or reply). mappedComments is
    // roots-only — resolve reply → root so c:{replyId} still scrolls the thread.
    if (!mappedComments.length) {
      // Kick thread drain so Diff corpus can appear; conversation fallback later.
      kickLoadMoreIfNeeded();
      return;
    }
    let rootId: string | number | null = parsed.id;
    if (typeof resolveRootReviewCommentId === 'function') {
      const resolved = resolveRootReviewCommentId(
        detail?.reviewComments || detail?.review_comments || [],
        parsed.id
      );
      if (resolved != null && String(resolved) !== '') {
        rootId = resolved;
      }
    }
    const diffPos = `c:${rootId}`;
    const idx = findCommentIndexByPosition(mappedComments, diffPos);
    if (idx < 0) {
      // Not in Diff map yet — load more threads; fall back to conversation when
      // the comment exists there (issue comment or timeline review card).
      kickLoadMoreIfNeeded();
      const anchor = resolveConversationAnchorForCommentId(detail, parsed.id);
      if (anchor) {
        // Prefer conversation when hash page was unspecified OR when Diff cannot
        // host the target (issue comments; filtered/outdated threads).
        if (routePage == null || anchor.startsWith('issue-comment:')) {
          startConversationDeepLink(anchor);
          return () => clearVerifyTimer();
        }
      }
      // Thread not in mapped list yet (shell/by-ids still loading) — retry later
      return;
    }

    // Use the full Diff jump path (expand file, clear filters, pending re-scroll)
    // rather than a single raw scrollTop which fails for collapsed / off-window rows.
    // Always restart verify loop (effect cleanup clears prior timers).
    clearVerifyTimer();
    positionInFlightRef.current = applyKey;
    positionExhaustedRef.current = null;
    try {
      const row = mappedComments[idx];
      jumpToReviewComment({
        id: row?.id ?? rootId,
        path: row?.path || row?.filePath || null,
        line: row?.line ?? row?.originalLine ?? null,
        side: row?.side || null,
      });
    } catch {
      /* ignore */
    }

    let ticks = 0;
    const MAX_TICKS = 60; // ~12s
    const tick = () => {
      ticks += 1;
      try {
        // Re-resolve index in case mappedComments rebuilt
        let liveIdx = idx;
        const live = findCommentIndexByPosition(mappedComments, diffPos);
        if (live >= 0) liveIdx = live;
        const liveRow = mappedComments[liveIdx] || mappedComments[idx];
        if (liveRow) {
          jumpToReviewComment({
            id: liveRow?.id ?? rootId,
            path: liveRow?.path || liveRow?.filePath || null,
            line: liveRow?.line ?? liveRow?.originalLine ?? null,
            side: liveRow?.side || null,
          });
        }
        // Success when the inline thread is mounted in the Diff scroller and
        // intersects the viewport.
        const list = listRef.current as HTMLElement | null;
        const idStr = String(liveRow?.id ?? rootId ?? '');
        const thr =
          list?.querySelector?.(
            `.prp-inline-thread[data-search-anchor="review-comment:${CSS.escape(idStr)}"]`
          ) ||
          list?.querySelector?.(
            `[data-prp-comment-id="${CSS.escape(idStr)}"]`
          );
        if (thr && list) {
          const s = list.getBoundingClientRect();
          const r = (thr as HTMLElement).getBoundingClientRect();
          const visible =
            Math.min(r.bottom, s.bottom) - Math.max(r.top, s.top);
          if (visible > Math.min(40, Math.max(16, r.height * 0.12))) {
            markApplied();
            return;
          }
        }
        if (ticks % 5 === 0) kickLoadMoreIfNeeded();
      } catch {
        /* ignore */
      }
      if (ticks >= MAX_TICKS) {
        markSoftExhausted();
        return;
      }
      positionVerifyTimerRef.current = setTimeout(tick, 200);
    };
    positionVerifyTimerRef.current = setTimeout(tick, 120);
    return () => clearVerifyTimer();
  }, [
    open,
    detail,
    detail?.number,
    detail?.comments,
    detail?.reviewThreads,
    detail?.review_threads,
    detail?.reviewComments,
    detail?.review_comments,
    detail?.timelineMeta,
    detail?.commentsMeta,
    detail?.reviewThreadsMeta,
    initialRoute?.position,
    initialRoute?.page,
    mappedComments,
    // Intentionally omit layoutMode: Conversation deep-link re-entry used to
    // re-force LAYOUT_CENTERED whenever the user opened Diff. Live layout is
    // read from the store inside startConversationDeepLink / expandDiff.
    virtualRows.length,
    setLayoutMode,
    jumpToReviewComment,
    onLoadMoreReviewThreads,
  ]);

  // Persist page UI for refresh: PR identity + page + file/line selection + forms.
  // High-freq fields (drafts, selection) read via getState + store subscribe (debounced).
  useEffect(() => {
    if (!open || !detail?.owner || !detail?.repo || !detail?.number) return;
    if (!routeWriteReady) return;
    if (typeof sessionStorage === 'undefined') return undefined;

    let timer = 0;
    const flush = () => {
      try {
        const st = useModalStore.getState();
        const page = layoutMode === LAYOUT_DIFF ? 'diff' : 'conversation';
        saveSessionView(
          sessionStorage,
          detail.owner,
          detail.repo,
          detail.number,
          {
            owner: detail.owner,
            repo: detail.repo,
            number: detail.number,
            page,
            layoutMode,
            diffMode,
            hideWhitespace,
            collapsedFiles: st.collapsedFiles,
            viewedPaths: st.viewedPaths,
            activeFilePath: st.activeFilePath,
            lineSelection: st.lineSelection,
            selectionDraft: st.selectionDraft,
            showSelectionComposer: st.showSelectionComposer,
            selectionIslandPhase,
            commentText: st.commentText,
            scrollTop: st.scrollTop,
          }
        );
      } catch {
        /* ignore */
      }
    };
    flush();
    const unsub = useModalStore.subscribe(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(flush, 200);
    });
    return () => {
      window.clearTimeout(timer);
      unsub();
      flush();
    };
  }, [
    open,
    detail?.owner,
    detail?.repo,
    detail?.number,
    layoutMode,
    diffMode,
    hideWhitespace,
    selectionIslandPhase,
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
    } else {
      // Keep deep-link / keyboard-focus position in the URL. Writing null here
      // used to race with open(prp_position=…) and strip the share query before
      // the conversation scroller could promote pending → focused.
      try {
        const st = useModalStore.getState();
        const anchor = String(
          st.focusedConversationAnchor ||
            st.pendingConversationNavAnchor ||
            ''
        ).trim();
        const m = anchor.match(/^(?:issue|review)-comment:(.+)$/i);
        if (m?.[1]) {
          position = `c:${m[1]}`;
        } else if (
          initialRoute?.position != null &&
          String(initialRoute.position).trim()
        ) {
          position = String(initialRoute.position).trim();
        }
      } catch {
        /* ignore */
      }
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
    // Outbound route updates are echoed back by the host as initialRoute.
    // Stamp the exact inbound dedupe key before writing so an older single-line
    // echo cannot overwrite a newer multi-line selection during key-repeat.
    ghSelectionAppliedRef.current = `${detail.number}:${fileKey || ''}:${
      sel.filePath || ''
    }:${sel.startLine ?? null}:${sel.endLine ?? ''}`;

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
            // Re-emit #issuecomment- / #discussion_r so deep-link survives rewrites
            position: routePayload.position,
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
    initialRoute?.position,
  ]);

  // Debounced URI/hash update when selection moves (no App re-render per caret)
  useEffect(() => {
    if (!open || !routeWriteReady || !detail?.number) return undefined;
    let timer = 0;
    const unsub = useModalStore.subscribe((state, prev) => {
      if (state.lineSelection === prev.lineSelection) return;
      if (state.layoutMode !== LAYOUT_DIFF) return;
      window.clearTimeout(timer);
      const flushRoute = () => {
        // Long frames can create >280ms gaps inside a held burst. Do not turn
        // those gaps into history/style work; wait for the shared idle stamp.
        if (
          document.documentElement.hasAttribute('data-prp-diff-nav-active')
        ) {
          timer = window.setTimeout(flushRoute, 80);
          return;
        }
        try {
          const sel = githubSelectionFields(
            useModalStore.getState().lineSelection
          );
          const commits = githubCommitsFromFilter(diffCommitFilter);
          const fileKey = sel.filePath
            ? githubDiffFileKey(sel.filePath)
            : null;
          ghSelectionAppliedRef.current = `${detail.number}:${
            fileKey || ''
          }:${sel.filePath || ''}:${sel.startLine ?? null}:${
            sel.endLine ?? ''
          }`;
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
      };
      timer = window.setTimeout(flushRoute, 280);
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
    positionInFlightRef.current = null;
    positionExhaustedRef.current = null;
    positionConvDeepLinkKeyRef.current = null;
    positionLayoutDismissedRef.current = null;
    positionLoadMoreKickRef.current = 0;
    if (positionVerifyTimerRef.current) {
      clearTimeout(positionVerifyTimerRef.current);
      positionVerifyTimerRef.current = null;
    }
    setRouteWriteReady(false);
    return undefined;
  }, [open]);

  /**
   * Stop conversation deep-link verify / re-entry from reclaiming Conversation
   * after the user opens Diff (toggle, search jump, file deep-link).
   * Diff-position deep-links call expandDiff via jumpToReviewComment while
   * positionConvDeepLinkKeyRef is null — those are left alone.
   */
  function abandonConversationPositionDeepLink() {
    try {
      const page = normalizePage(initialRoute?.page);
      const pos = initialRoute?.position ?? null;
      const num = detailRef.current?.number ?? detail?.number;
      const routeKey = conversationDeepLinkApplyKey(num, pos);
      if (
        !shouldAbandonConversationDeepLinkOnExpandDiff({
          convDeepLinkKey: positionConvDeepLinkKeyRef.current,
          routePage: page,
          position: pos,
        })
      ) {
        return;
      }
      const key = positionConvDeepLinkKeyRef.current || routeKey;
      if (!key) return;
      positionLayoutDismissedRef.current = key;
      positionAppliedRef.current = key;
      positionInFlightRef.current = null;
      positionConvDeepLinkKeyRef.current = null;
      if (positionVerifyTimerRef.current) {
        clearTimeout(positionVerifyTimerRef.current);
        positionVerifyTimerRef.current = null;
      }
    } catch {
      /* ignore */
    }
  }

  /** Instant layout swap — keep-alive panels, no fade/scale on Diff ↔ Conversation. */
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

  // If meta settles to 0 files while Diff is open (or deep-link forced Diff
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
  const onRegisterContextThreadActions = useCallback(
    (
      api: {
        fold: () => boolean;
        foldCollapse?: () => boolean;
        foldExpand?: () => boolean;
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
    kind:
      | 'fold'
      | 'foldCollapse'
      | 'foldExpand'
      | 'gotoDiff'
      | 'comment'
      | 'resolve'
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
    if (kind === 'foldCollapse' || kind === 'foldExpand') {
      const wantCollapsed = kind === 'foldCollapse';
      const currently = isDiffThreadCollapsed(id, resolved);
      if (currently !== wantCollapsed) {
        onToggleThreadCollapse(id, resolved);
      }
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
      // Expand if collapsed before focus (composer unmounts when collapsed).
      if (isDiffThreadCollapsed(id, resolved)) {
        onToggleThreadCollapse(id, resolved);
      }
      // Jump only when the thread is not already the active Diff context —
      // jumpToReviewComment can virtualize/remount and race ghost→textarea open.
      const stLive = useModalStore.getState();
      const alreadyActive =
        stLive.activeDiffCommentId != null &&
        String(stLive.activeDiffCommentId) === String(id);
      let mounted = false;
      try {
        mounted = Boolean(
          typeof document !== 'undefined' &&
            document.querySelector(
              `.prp-body-panel--active .prp-inline-thread--context-active, .prp-body-panel--active [data-search-anchor="review-comment:${String(id)}"]`
            )
        );
      } catch {
        mounted = false;
      }
      if (!alreadyActive || !mounted) {
        jumpToReviewComment({
          id,
          path: c.path || thread?.root?.path || thread?.path,
          line: c.line ?? c.originalLine ?? thread?.root?.line ?? null,
          side: c.side || thread?.root?.side || 'RIGHT',
        });
      }
      focusContextThreadReplyAfterPaint(anchor);
      // Immediate best-effort focus (AfterPaint retries if ghost still mounting)
      try {
        focusContextThreadReply(anchor);
      } catch {
        /* ignore */
      }
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
    kind:
      | 'fold'
      | 'foldCollapse'
      | 'foldExpand'
      | 'gotoDiff'
      | 'comment'
      | 'resolve'
  ): boolean {
    // Prefer live store layout — keep-alive Conversation stays mounted on Diff.
    const liveLayout = useModalStore.getState().layoutMode;
    if (liveLayout === LAYOUT_DIFF) {
      return runDiffContextThreadAction(kind);
    }
    try {
      if (kind === 'foldCollapse') {
        const api = contextThreadActionsRef.current;
        if (typeof api?.foldCollapse === 'function') {
          return Boolean(api.foldCollapse());
        }
        // Fallback: toggle only if currently expanded (legacy API)
        return Boolean(api?.fold?.());
      }
      if (kind === 'foldExpand') {
        const api = contextThreadActionsRef.current;
        if (typeof api?.foldExpand === 'function') {
          return Boolean(api.foldExpand());
        }
        return Boolean(api?.fold?.());
      }
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
    setCollapsedFiles((prev) =>
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
    if (commentIndex >= 0) setCommentIndex(-1);
    useModalStore.getState().setActiveDiffCommentId(null);
  }

  /** Drop Diff thread caret / hit ring when focus moves to code/file selection. */
  function clearDiffThreadFocusIfNeeded() {
    if (commentIndex >= 0) setCommentIndex(-1);
    const st = useModalStore.getState();
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
        clearMilestone: () => void applyMilestoneNumber(null),
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


  function onSelectionStart(row, point, opts: any = {}) {
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
        optHeld: Boolean(opts?.optHeld || optHeldRef.current),
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
    setLineSelection((prev) => extendLineSelection(prev, row) || prev);
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

  function onSelectionEnd(point, forcedMode) {
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
    Object.assign(sideBag, { detail, buildAssetRepoPath });
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

  /**
   * Collapse map key: prefer stable PRRT threadNodeId so shell:… → numeric id
   * hydrate does not lose expand state or re-default to resolved-collapsed.
   */
  function collapseKeyForThread(
    commentId: any,
    threadNodeId: any = null
  ): string {
    const tid = threadNodeId != null ? String(threadNodeId) : '';
    if (tid && isGraphqlReviewThreadNodeId(tid)) return tid;
    const fromComment = resolveThreadNodeIdFromCommentId(commentId);
    if (fromComment) return fromComment;
    return String(commentId ?? '');
  }

  function isDiffThreadCollapsed(
    commentId: any,
    resolved: boolean,
    threadNodeId: any = null
  ) {
    const key = collapseKeyForThread(commentId, threadNodeId);
    if (key && diffThreadCollapse.has(key)) {
      return Boolean(diffThreadCollapse.get(key));
    }
    // Legacy keys (shell:… / numeric) during transition
    const legacy = String(commentId ?? '');
    if (legacy && diffThreadCollapse.has(legacy)) {
      return Boolean(diffThreadCollapse.get(legacy));
    }
    return Boolean(resolved);
  }

  /** In-flight lazy comment loads (PRRT id → promise). */
  const lazyThreadCommentsInflight = useRef(new Map());
  /** PRRT ids currently loading full comments (header spinner). */
  const [lazyLoadingThreadIds, setLazyLoadingThreadIds] = useState(
    () => new Set<string>()
  );

  /**
   * Ensure full comments for a GraphQL shell thread (expand path).
   * No-op when comments already loaded or REST synthetic ids.
   */
  const ensureThreadCommentsLoaded = useCallback(
    async (threadNodeId: any) => {
      const tid = String(threadNodeId || '').trim();
      if (!tid || !isGraphqlReviewThreadNodeId(tid)) return null;
      const snap = detailRef.current || detailProp;
      const th = (Array.isArray(snap?.reviewThreads) ? snap.reviewThreads : []).find(
        (t: any) => t && String(t.threadNodeId) === tid
      );
      if (
        typeof threadCommentsAreLoaded === 'function' &&
        threadCommentsAreLoaded(th || { threadNodeId: tid }, snap?.reviewComments)
      ) {
        return snap;
      }
      const inflight = lazyThreadCommentsInflight.current;
      if (inflight.has(tid)) return inflight.get(tid);

      setLazyLoadingThreadIds((prev) => {
        if (prev.has(tid)) return prev;
        const next = new Set(prev);
        next.add(tid);
        return next;
      });

      const run = (async () => {
        try {
          if (typeof onLoadReviewThreadComments === 'function') {
            const next = await onLoadReviewThreadComments(tid);
            if (next && typeof next === 'object') {
              applyDomainDetailToHost((prev: any) => {
                if (!prev || Number(prev.number) !== Number(next.number)) {
                  return next;
                }
                const folded = {
                  ...prev,
                  reviewThreads: next.reviewThreads ?? prev.reviewThreads,
                  reviewComments: next.reviewComments ?? prev.reviewComments,
                  reviewThreadsMeta:
                    next.reviewThreadsMeta ?? prev.reviewThreadsMeta,
                  reviewCommentsMeta:
                    next.reviewCommentsMeta ?? prev.reviewCommentsMeta,
                };
                // Re-apply resolve/unresolve write-through stamps — lazy by-ids
                // must not resurrect pre-mutation isResolved after local stamp.
                return typeof applyResolveStamps === 'function'
                  ? applyResolveStamps(folded, prev._resolveStamps)
                  : folded;
              });
            }
            return next;
          }
          // Fallback: bridge fetch + local merge when host prop missing
          const api = globalThis.PRTreeFetch;
          if (!api?.fetchReviewThreadsByIds || !api?.mergeReviewThreadsPageIntoDetail) {
            return null;
          }
          const bulk = await api.fetchReviewThreadsByIds([tid]);
          const base = detailRef.current || detailProp;
          if (!base) return null;
          const merged = api.mergeReviewThreadsPageIntoDetail(base, bulk, 'ids');
          const stamped =
            typeof applyResolveStamps === 'function'
              ? applyResolveStamps(merged, base._resolveStamps)
              : merged;
          applyDomainDetailToHost(stamped);
          return stamped;
        } catch {
          return null;
        } finally {
          inflight.delete(tid);
          setLazyLoadingThreadIds((prev) => {
            if (!prev.has(tid)) return prev;
            const next = new Set(prev);
            next.delete(tid);
            return next;
          });
        }
      })();
      inflight.set(tid, run);
      return run;
    },
    [detailProp, onLoadReviewThreadComments]
  );

  function resolveThreadNodeIdFromCommentId(commentId: any): string | null {
    const key = String(commentId ?? '');
    if (!key) return null;
    if (isGraphqlReviewThreadNodeId(key)) return key;
    const th = threadsByCommentId.get(key);
    if (th?.threadNodeId && isGraphqlReviewThreadNodeId(th.threadNodeId)) {
      return String(th.threadNodeId);
    }
    const c = (detail?.reviewComments || []).find(
      (x: any) => x && String(x.id) === key
    );
    if (c?.threadNodeId && isGraphqlReviewThreadNodeId(c.threadNodeId)) {
      return String(c.threadNodeId);
    }
    // shell:PRRT_… id
    if (key.startsWith('shell:') && isGraphqlReviewThreadNodeId(key.slice(6))) {
      return key.slice(6);
    }
    return null;
  }

  function onToggleThreadCollapse(
    commentId: any,
    resolved?: boolean,
    threadNodeId: any = null
  ) {
    const tid =
      (threadNodeId && isGraphqlReviewThreadNodeId(threadNodeId)
        ? String(threadNodeId)
        : null) || resolveThreadNodeIdFromCommentId(commentId);
    const key = collapseKeyForThread(commentId, tid);
    if (!key) return;
    const currently = isDiffThreadCollapsed(commentId, Boolean(resolved), tid);
    const nextCollapsed = !currently;
    setDiffThreadCollapse((prev) => {
      const next = new Map(prev);
      next.set(key, nextCollapsed);
      // Keep legacy comment-id key in sync during shell→numeric hydrate
      const legacy = String(commentId ?? '');
      if (legacy && legacy !== key) next.set(legacy, nextCollapsed);
      return next;
    });
    // Expanding → lazy-load comments for shell/resolved GraphQL threads
    if (!nextCollapsed && tid) {
      void ensureThreadCommentsLoaded(tid);
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
            onHideComment={onHideComment}
            onUnhideComment={onUnhideComment}
            onToggleReaction={onToggleReaction}
            onLoadReactors={onLoadReactors}
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
              fileQuery={fileQuery}
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
              setDiffMode={setDiffMode}
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
    </LocaleProvider>
    </DomainDetailProvider>
  );
}


export default PrModalApp;
