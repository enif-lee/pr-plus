/**
 * SOURCE OF TRUTH — PR modal composition root.
 * Complete TypeScript module (no mid-IIFE parts assembly).
 * Domain tsc typechecks this file. Size exception: undivided React root.
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
import { flushSync } from 'react-dom';
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
import { LAYOUT_CENTERED, LAYOUT_DIFF, layoutClassName } from '../lib/layout-mode';
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
import { applyReactionToggle } from '../lib/comment-reactions';
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
  selectionBlockRole,
  extractSelectedCodeText,
  githubBlobLinePermalink,
  parseGotoQuery,
  selectionFromGoto,
  moveLineSelection,
  coalesceSelectionMoveDelta,
  firstSelectableRowInFile,
  lastSelectableRowInFile,
  isSelectionAtFileEdge,
  rebindSelectionRowIndices,
  SELECTION_ACTIONS_REVEAL_MS,
  resolveSelectionIslandRevealPhase,
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
  buildRerequestReviewerLogins, mapRestReviewComment, mapRestIssueComment, appendOptimisticReviewComment, appendIssueCommentToDetail,
  stampThreadResolved,
  applyResolveStamps,
} from '../lib/pr-edit-api';
import { runPaletteCommand as runPaletteCommandImpl } from './pr-modal-run-palette';
import { installPrModalMutations } from './pr-modal-mutations';
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
  resolveActiveFileForCollapse,
  isEditableKeyboardTarget,
  isComposerKeyboardTarget,
  findComposerShortcutSurface,
  resolveComposerContextShortcutAction,
} from '../lib/shortcut-policy';
import {
  focusContextThreadReplyAfterPaint,
  isContextThreadReplyFocused,
  PRP_CONTEXT_THREAD_TAB_LEAVE,
  scrollChildToMaximizeInScroller,
} from '../lib/context-thread-dom';
import {
  listReviewThreadFocusUnits,
  stepReviewThreadFocusUnit,
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
  const [localDetail, setLocalDetail] = useState(detailProp);
  /**
   * After discard/submit, host refresh can race and re-merge stale pending rows
   * (mergeDetailPreserveOptimistic keeps local pending while prev still holds
   * viewerPendingReview). While this ref is set, always strip pending from the
   * merged snapshot. Clear the flag only once the host also has no PENDING.
   */
  const forceDropPendingRef = useRef(false);
  // Merge host detail onto optimistic local state so reply/comment flash-revert is avoided.
  // When host closes the sheet (detailProp null), drop localDetail so a reopen cannot
  // keep a stale _metaSeq title/body/milestone over network core (reverse e2e / GH edits).
  useEffect(() => {
    if (!detailProp) {
      setLocalDetail(null);
      return;
    }
    setLocalDetail((prev) => {
      // Switching PRs: never merge optimistic meta across issues
      if (
        prev &&
        (String(prev.owner || '') !== String(detailProp.owner || '') ||
          String(prev.repo || '') !== String(detailProp.repo || '') ||
          Number(prev.number) !== Number(detailProp.number))
      ) {
        return detailProp;
      }
      let merged =
        typeof mergeDetailPreserveOptimistic === 'function'
          ? mergeDetailPreserveOptimistic(prev, detailProp)
          : detailProp;
      // External reverse edits (gh / native): when host brings a different
      // title/body and we are not holding a local meta write (_metaSeq), adopt
      // host identity fields so hard-reopen after reverse e2e cannot stick on
      // the pre-reverse modal title.
      if (merged && detailProp && !(Number(prev?._metaSeq) > 0)) {
        const hostTitle = String(detailProp.title || '').trim();
        const localTitle = String(merged.title || '').trim();
        if (hostTitle && hostTitle !== localTitle) {
          merged = { ...merged, title: detailProp.title };
        }
        if (
          detailProp.body != null &&
          String(detailProp.body) !== String(merged.body || '')
        ) {
          merged = { ...merged, body: detailProp.body };
        }
        if (
          detailProp.milestone != null &&
          (merged.milestone == null ||
            Number(merged.milestone?.number) !==
              Number(detailProp.milestone?.number))
        ) {
          merged = { ...merged, milestone: detailProp.milestone };
        }
      }
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
  // Live deps bag for extracted mutations — filled each render after helpers exist.
  const mutD = useRef<Record<string, any>>({}).current;
  const mut = useMemo(() => installPrModalMutations(mutD), []);
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
      setLocalDetail((prev: any) =>
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
      setLocalDetail((prev: any) =>
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
      if (layoutMode !== LAYOUT_DIFF) setLayoutMode(LAYOUT_DIFF);
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
    // Thread focus owns the surface — release any line selection.
    clearLineSelectionForNav();
    // Reset in-thread unit when hopping threads
    try {
      useModalStore.getState().setFocusedThreadUnitId(null);
    } catch {
      /* ignore */
    }
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

  /** Collect reply rows for a root review-comment id from groups + flat list. */
  function repliesForRootCommentId(rootId: string): any[] {
    if (!rootId) return [];
    const rid = String(rootId);
    const thread = threadsByCommentId?.get?.(rid) || null;
    if (Array.isArray(thread?.replies) && thread.replies.length) {
      return thread.replies;
    }
    if (Array.isArray(thread?.root?.replies) && thread.root.replies.length) {
      return thread.root.replies;
    }
    // Transitive flat walk (nested in_reply_to chains + shell lag)
    const all = detail?.reviewComments || detail?.review_comments || [];
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
        ) as HTMLElement | null);
      if (!active) return [];
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

  /**
   * ↑/↓ within a multi-reply review thread (root + replies). Returns true when
   * handled so callers can skip file/line selection.
   */
  function stepThreadReply(delta: number): boolean {
    const st = useModalStore.getState();
    const liveLayout = st.layoutMode;
    // Diff: activeDiffCommentId / commentIndex root
    let rootId: string | null = null;
    if (liveLayout === LAYOUT_DIFF) {
      const c =
        commentIndex >= 0 && mappedComments[commentIndex]
          ? mappedComments[commentIndex]
          : st.activeDiffCommentId != null
            ? mappedComments.find(
                (m: any) =>
                  m && String(m.id) === String(st.activeDiffCommentId)
              )
            : null;
      if (!c) return false;
      rootId = c.id != null ? String(c.id) : null;
    } else {
      // Conversation: focused review-comment anchor
      const a = String(
        st.focusedConversationAnchor || st.pendingConversationNavAnchor || ''
      ).trim();
      if (!a.startsWith('review-comment:')) return false;
      rootId = a.slice('review-comment:'.length);
    }
    if (!rootId) return false;
    const replies = repliesForRootCommentId(rootId);
    const units = listReviewThreadFocusUnits(rootId, replies);
    if (units.length < 2) return false;
    const cur =
      st.focusedThreadUnitId != null
        ? String(st.focusedThreadUnitId)
        : rootId;
    const next = stepReviewThreadFocusUnit(units, cur, delta);
    if (!next) return false;
    // Keep Diff thread root selected while stepping units. setActiveDiffCommentId
    // clears focusedThreadUnitId — set root first, then the unit.
    if (liveLayout === LAYOUT_DIFF && st.activeDiffCommentId == null) {
      st.setActiveDiffCommentId(rootId);
    }
    st.setFocusedThreadUnitId(next.id);
    // Scroll unit into view (thread list or virtual scroller)
    try {
      requestAnimationFrame(() => {
        try {
          const host =
            (typeof document !== 'undefined' &&
              (document.querySelector(
                `[data-prp-thread-unit-id="${CSS.escape(next.id)}"]`
              ) as HTMLElement | null)) ||
            null;
          if (!host) return;
          const scroller =
            (host.closest(
              '.prp-vlist, .prp-conversation-virtual, .prp-diff-scroll, .prp-scroll'
            ) as HTMLElement | null) || null;
          if (scroller) {
            scrollChildToMaximizeInScroller(scroller, host, {
              padTop: 24,
              padBottom: 24,
            });
          } else {
            host.scrollIntoView({ block: 'nearest', inline: 'nearest' });
          }
        } catch {
          /* ignore */
        }
      });
    } catch {
      /* ignore */
    }
    return true;
  }

  /** True when focused Diff/Conversation thread has ≥1 reply (↑/↓ unit nav). */
  function isMultiReplyThreadFocused(): boolean {
    const st = useModalStore.getState();
    let rootId: string | null = null;
    if (st.layoutMode === LAYOUT_DIFF) {
      const c =
        commentIndex >= 0 && mappedComments[commentIndex]
          ? mappedComments[commentIndex]
          : st.activeDiffCommentId != null
            ? mappedComments.find(
                (m: any) =>
                  m && String(m.id) === String(st.activeDiffCommentId)
              )
            : null;
      if (!c?.id) {
        // Fallback: any context-active multi-reply card in DOM
        try {
          if (typeof document !== 'undefined') {
            const active = document.querySelector(
              '.prp-inline-thread--context-active, .prp-inline-thread[data-context-active="1"]'
            );
            if (
              active?.querySelector(
                '[data-prp-thread-unit="reply"][data-prp-thread-unit-id]'
              )
            ) {
              return true;
            }
          }
        } catch {
          /* ignore */
        }
        return false;
      }
      rootId = String(c.id);
    } else {
      const a = String(
        st.focusedConversationAnchor || st.pendingConversationNavAnchor || ''
      ).trim();
      if (!a.startsWith('review-comment:')) return false;
      rootId = a.slice('review-comment:'.length);
    }
    if (!rootId) return false;
    if (repliesForRootCommentId(rootId).length > 0) return true;
    // Last resort: painted reply units on the focused thread card
    try {
      if (typeof document === 'undefined') return false;
      const active = document.querySelector(
        `.prp-inline-thread--context-active[data-search-anchor="review-comment:${CSS.escape(rootId)}"], .prp-inline-thread[data-context-active="1"][data-search-anchor="review-comment:${CSS.escape(rootId)}"]`
      );
      return Boolean(
        active?.querySelector(
          '[data-prp-thread-unit="reply"][data-prp-thread-unit-id]'
        )
      );
    } catch {
      return false;
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

  /**
   * rAF-coalesce file/page nav under key-repeat (selection already does this).
   * Soft thrift: one file hop per frame. Held ⌥⇧] used to collapse N OS keydowns
   * into a multi-file jump (felt sparse when React work delayed rAF); now only the
   * latest direction is kept so intermediate files still appear under key-hold.
   */
  const pendingFileNavDeltaRef = useRef(0);
  const fileNavRafRef = useRef(0);
  /** Coalesce page-scroll under key-hold: one hop per frame when rAF runs. */
  const pendingPageScrollDirRef = useRef(0);
  const pageScrollRafRef = useRef(0);

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
    const d = delta < 0 ? -1 : 1;
    // One hop per frame (like page scroll dir): do not multi-jump on key-hold.
    pendingFileNavDeltaRef.current = d;
    if (fileNavRafRef.current) return;
    fileNavRafRef.current = requestAnimationFrame(() => {
      fileNavRafRef.current = 0;
      const steps = pendingFileNavDeltaRef.current;
      pendingFileNavDeltaRef.current = 0;
      if (!steps) return;
      const st = resolveAdjacentFileNav(displayFiles, activeFilePath, steps);
      if (st.path) onSelectFile(st.path);
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
    const dir = delta < 0 ? -1 : 1;
    pendingPageScrollDirRef.current = dir;
    // Always move now so unfocused/headless sessions still page.
    applyDiffPageScroll(dir);
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
   * ⌥J / ⌥K on Conversation: step next/prev in visual UI order (wraps).
   * Order follows reverseComments (merge before vs after timeline).
   * Seeds on first press; focuses conversation layout if needed.
   */
  function navConversationComment(delta: number) {
    if (layoutMode === LAYOUT_DIFF) collapseDiff();
    const ordered = conversationCommentPageOrder();
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
    const cur =
      storeCur ||
      conversationCommentFocusRef.current?.anchor ||
      null;
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
    // Scroll first; leaf scroller promotes focus ring after scroll.
    useModalStore.getState().requestConversationNav(next.anchor);
  }

  function toggleViewedActiveFile() {
    const path = String(activeFilePath || '').trim();
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
      activeFilePath,
    });
    if (!path) return;
    onToggleFileCollapse(path);
  }

  /** Directed file fold: wantCollapsed true = collapse, false = expand. */
  function setActiveFileCollapse(wantCollapsed: boolean) {
    const path = resolveActiveFileForCollapse({
      lineSelection: useModalStore.getState().lineSelection,
      activeFilePath,
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
   * Drop Diff line selection + island chrome.
   * Used when navigating threads or files so selection does not linger
   * across focus contexts (⌥J/K threads, ⌥⇧[] files, tree click).
   */
  function clearLineSelectionForNav() {
    clearSelectionActionsTimer();
    if (selectionMoveRafRef.current) {
      cancelAnimationFrame(selectionMoveRafRef.current);
      selectionMoveRafRef.current = 0;
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
      // Pure reveal policy: file + line → actions; thread → hide island
      const phase =
        typeof resolveSelectionIslandRevealPhase === 'function'
          ? resolveSelectionIslandRevealPhase(st.lineSelection)
          : st.lineSelection.kind === 'thread' ||
              st.lineSelection.subjectType === 'thread' ||
              st.lineSelection.kind === 'inline-comment'
            ? 'hidden'
            : 'actions';
      if (phase === 'hidden') {
        setShowSelectionComposer(false);
        return;
      }
      setSelectionIslandLeaving(false);
      setSelectionIslandPhase(phase);
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
      const { avgH: h, rowOffsetList: offs } = getDiffScrollMetrics();
      // Sticky file header overlays the top of the Diff list (~ROW_HEIGHT).
      // Without padTop, ArrowUp pins the caret under that fixed bar.
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
              { padTop: stickyTop + 2, padBottom: 2 }
            )
          : cur;
      applyProgrammaticDiffScroll(el, top, {
        storeTop: useModalStore.getState().scrollTop,
        setStoreTop: setScrollTop,
        minDomDelta: 0.5,
        minStoreDelta: Math.max(24, h * 2),
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
    // Prefer selection.filePath for seed context so lagging tree activeFile
    // cannot reseed to the previous file top under key-hold (jump-up).
    const pathHint = String(prevSel?.filePath || activePath || '').trim();
    const nextSel =
      moveLineSelection(prevSel, virtualRows, delta, {
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
    // Sync tree path **synchronously** when caret crosses files so the next
    // key-repeat frame does not reseed using a stale activeFilePath (jump-up).
    // Microtask-only sync was one frame too late under OS key-hold.
    if (nextPath && nextPath !== activePath) {
      setActiveFilePath(nextPath);
      if (crossedFile) {
        ensureFileExpandedForSelection(nextPath);
        scrollFileNavRowIntoView(nextPath);
      }
    }
    // Avoid setSelectionIslandLeaving every frame if already false
    if (useModalStore.getState().selectionIslandLeaving) {
      setSelectionIslandLeaving(false);
    }
    // Thread caret: align Diff comment-nav index so ⌥C opens that reply.
    // Line/file selection leaves thread focus — drop hit ring (`.prp-vline--hit`).
    if (
      nextSel &&
      (nextSel.kind === 'thread' ||
        nextSel.subjectType === 'thread' ||
        nextSel.kind === 'inline-comment') &&
      nextSel.commentId != null &&
      Array.isArray(mappedComments)
    ) {
      const tIdx = mappedComments.findIndex(
        (c: any) => String(c?.id) === String(nextSel.commentId)
      );
      if (tIdx >= 0 && tIdx !== commentIndex) setCommentIndex(tIdx);
    } else {
      clearDiffThreadFocusIfNeeded();
    }
    scheduleSelectionActionsReveal();
    // DOM scroll after paint only (path already synced above)
    queueMicrotask(() => {
      try {
        const sel = useModalStore.getState().lineSelection || nextSel;
        scrollSelectionHeadDomOnly(sel);
      } catch {
        /* ignore */
      }
    });
  }

  /**
   * Keyboard line move — rAF-coalesced under key-repeat so held arrows do not
   * thrash React with one update per OS keydown.
   * Opposite-direction keys discard residual stack (see coalesceSelectionMoveDelta)
   * so ↑ after a burst of ↓ is not net-positive.
   */
  function applySelectionKeyboardMove(delta: number, shift: boolean) {
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
    selectionMoveRafRef.current = requestAnimationFrame(() => {
      selectionMoveRafRef.current = 0;
      const p = pendingSelectionMoveRef.current;
      pendingSelectionMoveRef.current = null;
      if (!p || !p.delta) return;
      flushSelectionKeyboardMove(p.delta, p.shift);
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
      setLayoutMode(routePage === 'diff' ? LAYOUT_DIFF : LAYOUT_CENTERED);
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
        setLayoutMode(
          stored.layoutMode === 'diff' ? LAYOUT_DIFF : LAYOUT_CENTERED
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
      clearVerifyTimer();
    };

    const markSoftExhausted = () => {
      positionInFlightRef.current = null;
      positionExhaustedRef.current = { key: applyKey, corpus: corpusSig };
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
     */
    const startConversationDeepLink = (anchor: string) => {
      clearVerifyTimer();
      positionInFlightRef.current = applyKey;
      positionExhaustedRef.current = null;
      // Always leave Diff so VirtualConversationList can mount and scroll.
      if (layoutMode === LAYOUT_DIFF) setLayoutMode(LAYOUT_CENTERED);
      try {
        useModalStore.getState().requestConversationNav(anchor);
      } catch {
        /* ignore */
      }
      let ticks = 0;
      const MAX_TICKS = 100; // ~20s @ 200ms
      const tick = () => {
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
    layoutMode,
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
    positionInFlightRef.current = null;
    positionExhaustedRef.current = null;
    positionLoadMoreKickRef.current = 0;
    if (positionVerifyTimerRef.current) {
      clearTimeout(positionVerifyTimerRef.current);
      positionVerifyTimerRef.current = null;
    }
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
    // Live store — avoid stale render-closure layoutMode under key-hold /
    // peer-opt → runPaletteCommand paths (monitor fired but layout stuck).
    const live =
      useModalStore.getState().layoutMode || layoutMode;
    if (live === LAYOUT_DIFF) collapseDiff();
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
    setActiveFilePath(path);
    // Drop prior-file line selection so the next Arrow seeds the first
    // selectable (displayed) line of this file.
    clearLineSelectionForNav();
    // Optional auto-expand (pref; default off). Explicit jumps still expand.
    // Use expandPathInCollapsedSet so emptying the set does not re-collapse
    // the path via isPathCollapsed's empty-set + viewedPaths branch.
    if (autoExpandOnFileNav) {
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
    }
    const idx = fileStarts.get(path);
    if (typeof idx === 'number') {
      // Pin file header to the first line of the Diff scrollport — DOM first.
      // Store sync thrifted so we don't stack an extra DiffWorkspace paint on
      // top of activeFilePath (already batched in this handler).
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
        // File pin often needs store for post-expand rebuild hold — allow
        // modest thrift still (skip no-op / sub-pixel).
        minStoreDelta: 1,
      });
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
    const ordered = conversationCommentPageOrder();
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
        // Pessimistic: wait for GitHub, then write-through host+cache (no pre-paint).
        const raw = await fetchApi.postIssueComment(
          detail.owner,
          detail.repo,
          detail.number,
          body
        );
        const mapped = mapRestIssueComment(raw, {
          body,
          author: detail.viewerLogin || '',
        });
        if (mapped) {
          const next =
            typeof appendIssueCommentToDetail === 'function'
              ? appendIssueCommentToDetail(detail, mapped)
              : {
                  ...detail,
                  comments: [...(detail.comments || []), mapped],
                };
          commitCommentListPatch(next);
        }
        setCommentText('');
        setActionMsg('Comment posted.');
        // Host cache already has the comment; skip soft-refresh race that could
        // repaint an empty/stale comments side-fetch over the confirmed write.
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
      });
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
    // Pessimistic: only after API success, write server-mapped row to host cache.
    const mapped = mapRestReviewComment(raw, {
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
    if (mapped) {
      const base = detail || {};
      const withComment =
        typeof appendOptimisticReviewComment === 'function'
          ? appendOptimisticReviewComment(base, {
              ...mapped,
              pending: isPending,
            })
          : {
              ...base,
              reviewComments: [
                ...(base.reviewComments || []),
                { ...mapped, pending: isPending },
              ],
            };
      let next = withComment;
      if (isPending) {
        const reviewId =
          mapped.pendingReviewId || raw?.pendingReviewId || null;
        const pendingRows = (withComment.reviewComments || []).filter(
          (c: any) => c?.pending
        );
        next = {
          ...withComment,
          _dropPending: undefined,
          viewerPendingReview:
            withComment.viewerPendingReview ||
            (reviewId
              ? {
                  id: reviewId,
                  nodeId: null,
                  commentCount: pendingRows.length,
                }
              : null),
        };
      } else if (withComment._dropPending) {
        next = { ...withComment, _dropPending: undefined };
      }
      commitCommentListPatch(next);
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








  async function onDeleteHeadBranch() {
    if (!detail || !shouldShowDeleteHeadBranch(detail)) return;
    const target = resolveDeleteHeadBranchTarget(detail);
    if (!target) return;
    if (
      !confirmGateProceed(
        await requestConfirm({
          title: 'Delete branch?',
          message: `Delete head branch “${target.branch}” from ${target.owner}/${target.repo}? This cannot be undone from pr+.`,
          confirmLabel: 'Delete branch',
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
      if (!api?.deleteHeadBranch) throw new Error('Delete branch API unavailable');
      await api.deleteHeadBranch(target.owner, target.repo, target.branch);
      setLocalDetail((d) =>
        d ? { ...d, headBranchDeleted: true, headRefDeleted: true } : d
      );
      setActionMsg(`Deleted branch ${target.branch}.`);
    } catch (err) {
      setActionMsg(err?.message || String(err));
    } finally {
      setActionBusy(false);
    }
  }



  async function applyMilestoneNumber(
    milestone: number | null,
    opts: { titleHint?: string } = {}
  ) {
    const base = detailRef.current || detail;
    if (!base) return;
    setActionBusy(true);
    setActionMsg('');
    const titleHint = String(opts.titleHint || '').trim();
    try {
      const api = globalThis.PRTreeFetch;
      if (!api?.setIssueMilestone) throw new Error('Milestone API unavailable');
      const result = await api.setIssueMilestone(
        base.owner,
        base.repo,
        base.number,
        milestone
      );
      // PATCH /issues returns the issue (with milestone object) when successful.
      let nextMilestone: any = null;
      if (milestone == null) {
        nextMilestone = null;
      } else if (result?.milestone && typeof result.milestone === 'object') {
        nextMilestone = {
          number: Number(result.milestone.number) || milestone,
          title:
            result.milestone.title ||
            titleHint ||
            `Milestone ${milestone}`,
        };
      } else {
        nextMilestone = {
          number: milestone,
          title: titleHint || `Milestone ${milestone}`,
        };
      }
      // If API omitted title, try repo milestones catalog for the e2e-visible name.
      if (
        nextMilestone &&
        (!nextMilestone.title ||
          /^Milestone\s+\d+$/i.test(String(nextMilestone.title))) &&
        typeof api?.fetchRepoMilestones === 'function'
      ) {
        try {
          const catalog = await api.fetchRepoMilestones(base.owner, base.repo);
          const hit = (Array.isArray(catalog) ? catalog : []).find(
            (m: any) => Number(m?.number) === Number(nextMilestone.number)
          );
          if (hit?.title) nextMilestone = { ...nextMilestone, title: hit.title };
        } catch {
          /* keep fallback title */
        }
      }
      const prevMs = base.milestone ?? null;
      commitMetaPatch(
        { milestone: nextMilestone },
        {
          localTimelineEvents: milestoneChangeTimelineEvents(
            prevMs,
            nextMilestone,
            timelineActorFromDetail(base)
          ),
        }
      );
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
        // Prefer meta.number; fall back to parsing id. Pass title hint so aside
        // paints the human name even when PATCH body omits milestone.title.
        const titleHint = String(opt?.meta?.title || opt?.label || '')
          .replace(/\s*\(#\d+\)\s*$/, '')
          .trim();
        const fromMeta = Number(opt?.meta?.number);
        const n =
          Number.isFinite(fromMeta) && fromMeta > 0
            ? fromMeta
            : Number(String(opt?.id || opt?.label || '').replace(/[^\d]/g, ''));
        if (!Number.isFinite(n) || n <= 0) {
          setActionMsg('Invalid milestone.');
          return;
        }
        void applyMilestoneNumber(n, { titleHint });
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
      const snap = localDetail || detailProp;
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
              setLocalDetail((prev: any) => {
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
          const base = localDetail || detailProp;
          if (!base) return null;
          const merged = api.mergeReviewThreadsPageIntoDetail(base, bulk, 'ids');
          const stamped =
            typeof applyResolveStamps === 'function'
              ? applyResolveStamps(merged, base._resolveStamps)
              : merged;
          setLocalDetail(stamped);
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
    [localDetail, detailProp, onLoadReviewThreadComments]
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
      commitMetaPatch(
        {
          requestedReviewers,
          avatarUrls: mergeAvatarUrls(detail, result, requestedReviewers),
        },
        {
          localTimelineEvents: reviewerChangeTimelineEvents(
            detail.requestedReviewers,
            requestedReviewers,
            timelineActorFromDetail(detail)
          ),
        }
      );
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
   * Apply local detail mutation + **narrow** host cache patch (no full soft-refresh).
   * Only comment/thread/pending/reaction slices — never title/body/files/draft.
   * Body reactions use flushSync so is-reacted pills paint before a racey host
   * re-render can merge a pre-patch snapshot.
   */



  /**
   * Hover: fill reactor logins (first-N at GraphQL) for tooltips.
   * Hot-path timeline loads omit reactor nodes to cut payload.
   */
  async function onLoadReactors(target: {
    kind: 'issue' | 'review' | 'pr';
    commentId: string | number;
    nodeId?: string | null;
    number?: number | null;
  }) {
    if (!detail) return;
    const api = globalThis.PRTreeFetch;
    if (typeof api?.fetchReactableReactors !== 'function') return;
    let nodeId = target?.nodeId ? String(target.nodeId) : '';
    if (!nodeId && target?.kind === 'pr' && detail.nodeId) {
      nodeId = String(detail.nodeId);
    }
    if (!nodeId) return;
    try {
      const groups = await api.fetchReactableReactors(nodeId, { first: 5 });
      if (!Array.isArray(groups) || !groups.length) return;
      const kindRaw = String(target?.kind || '').toLowerCase();
      if (kindRaw === 'pr') {
        const next = { ...detail, bodyReactions: groups };
        setLocalDetail(next);
        void patchHostDetail({ bodyReactions: groups });
        return;
      }
      if (kindRaw === 'review') {
        const list = Array.isArray(detail.reviewComments)
          ? detail.reviewComments
          : [];
        const id = String(target.commentId);
        const nextList = list.map((c: any) =>
          c && String(c.id) === id ? { ...c, reactions: groups } : c
        );
        const next = { ...detail, reviewComments: nextList };
        commitCommentListPatch(next);
        return;
      }
      // issue
      const list = Array.isArray(detail.comments) ? detail.comments : [];
      const id = String(target.commentId);
      const nextList = list.map((c: any) =>
        c && String(c.id) === id ? { ...c, reactions: groups } : c
      );
      const next = { ...detail, comments: nextList };
      commitCommentListPatch(next);
    } catch {
      /* soft — tooltip stays without names */
    }
  }

  /**
   * Toggle emoji reaction on issue/review comment or PR body (GitHub official set).
   * Optimistic local patch; reverts on API failure.
   * Clicking an already-reacted pill removes the viewer's reaction.
   */
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
    if (!detail || !content) return;
    const kindRaw = String(target?.kind || '').toLowerCase();
    const kind =
      kindRaw === 'review' ? 'review' : kindRaw === 'pr' ? 'pr' : 'issue';
    const viewerLogin = detail.viewerLogin || null;

    // PR description body
    if (kind === 'pr') {
      const live = detailRef.current || detail;
      const prevReactions = Array.isArray(live.bodyReactions)
        ? live.bodyReactions
        : [];
      const nextReactions = applyReactionToggle(
        prevReactions,
        content,
        !currentlyReacted,
        viewerLogin
      );
      const patched = { ...live, bodyReactions: nextReactions };
      commitCommentListPatch(patched);
      try {
        const api = globalThis.PRTreeFetch;
        if (!api?.toggleCommentReaction) {
          throw new Error('Reaction API unavailable');
        }
        // Prefer REST issue-number path for PR body: GraphQL subjectId is often
        // a PullRequest node which some tokens reject; REST /issues/{n}/reactions
        // is the durable path (matches GitHub description reactions).
        await api.toggleCommentReaction(live.owner, live.repo, 'pr', {
          content,
          viewerHasReacted: currentlyReacted,
          // Force REST unless we know the node is an Issue id (I_…)
          nodeId: (() => {
            const id = String(target.nodeId || live.nodeId || '').trim();
            if (id.startsWith('I_') || id.includes('Issue')) return id;
            return null;
          })(),
          number: target.number ?? live.number,
          commentId: target.commentId ?? live.number,
        });
      } catch (err: any) {
        commitCommentListPatch({
          ...(detailRef.current || live),
          bodyReactions: prevReactions,
        });
        setActionMsg(err?.message || String(err) || 'Reaction failed');
      }
      return;
    }

    if (target?.commentId == null) return;
    const listKey = kind === 'review' ? 'reviewComments' : 'comments';
    const list = Array.isArray(detail[listKey]) ? detail[listKey] : [];
    const comment = list.find(
      (c: any) => c && String(c.id) === String(target.commentId)
    );
    if (!comment) return;
    const prevReactions = Array.isArray(comment.reactions)
      ? comment.reactions
      : [];
    const nextReactions = applyReactionToggle(
      prevReactions,
      content,
      !currentlyReacted,
      viewerLogin
    );

    const patchedList = list.map((c: any) =>
      c && String(c.id) === String(target.commentId)
        ? { ...c, reactions: nextReactions }
        : c
    );
    commitCommentListPatch({
      ...detail,
      [listKey]: patchedList,
    });

    try {
      const api = globalThis.PRTreeFetch;
      if (!api?.toggleCommentReaction) {
        throw new Error('Reaction API unavailable');
      }
      await api.toggleCommentReaction(detail.owner, detail.repo, kind, {
        content,
        viewerHasReacted: currentlyReacted,
        nodeId: target.nodeId || comment.nodeId || null,
        commentId: target.commentId,
      });
    } catch (err: any) {
      commitCommentListPatch({
        ...detail,
        [listKey]: list,
      });
      setActionMsg(err?.message || String(err) || 'Reaction failed');
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
    // E2E / host observability: last resolved product action
    try {
      if (typeof document !== 'undefined' && action) {
        document.documentElement.setAttribute(
          'data-prp-last-shortcut-action',
          String(action)
        );
      }
    } catch {
      /* ignore */
    }
    if (!action || typeof buildShortcutMonitorFire !== 'function') return;
    reportShortcutMonitor(buildShortcutMonitorFire(action, isMac));
  }

  /**
   * Opt-hold → store only (no App setState). Leaf OptBtnHint + overlay class bridge
   * re-render; ConversationView tree stays memoized.
   * Fullscreen Mermaid/Image viewers own the stage — never paint tips underneath.
   */
  function syncOptHintsActive() {
    const ui = uiRef.current || {};
    let viewerOpen = false;
    try {
      viewerOpen = Boolean(
        typeof document !== 'undefined' &&
          (document.querySelector('[data-prp-mermaid-viewer="1"]') ||
            document.querySelector('[data-prp-image-viewer="1"]'))
      );
    } catch {
      viewerOpen = false;
    }
    const active =
      Boolean(optHeldRef.current) &&
      !optHintsSuppressedRef.current &&
      !ui.paletteOpen &&
      !ui.confirmOpen &&
      !viewerOpen;
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
    /**
     * Automation / mid-hold sampling bridge. Synthetic KeyboardEvents from the
     * page world sometimes fail to latch altKey for content-script listeners;
     * e2e holdChord dispatches this while Alt is held so OptBtnHint portals paint.
     * detail.active: boolean
     */
    const onForce = (e: Event) => {
      try {
        const active = Boolean((e as CustomEvent)?.detail?.active);
        lastHeld = active;
        optHeldRef.current = active;
        if (!active) optHintsSuppressedRef.current = false;
        syncOptHintsActive();
      } catch {
        /* ignore */
      }
    };
    const clear = () => {
      if (!lastHeld) return;
      lastHeld = false;
      optHeldRef.current = false;
      optHintsSuppressedRef.current = false;
      useModalStore.getState().setOptHintsActive(false);
    };
    window.addEventListener('prp-set-opt-hints', onForce as any, true);
    window.addEventListener('keydown', sync, true);
    window.addEventListener('keyup', sync, true);
    window.addEventListener('blur', clear);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) clear();
    });
    return () => {
      window.removeEventListener('prp-set-opt-hints', onForce as any, true);
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

  /**
   * Tab past last / before first stop in a focused thread composer → step
   * next/prev review comment (same as ⌥J / ⌥K).
   */
  useEffect(() => {
    if (!open) return undefined;
    const onLeave = (ev: Event) => {
      const ce = ev as CustomEvent;
      const dir = Number(ce?.detail?.dir) || 1;
      try {
        actionsRef.current?.stepContextThreadFromTab?.(dir);
      } catch {
        /* ignore */
      }
    };
    window.addEventListener(
      PRP_CONTEXT_THREAD_TAB_LEAVE,
      onLeave as EventListener
    );
    return () =>
      window.removeEventListener(
        PRP_CONTEXT_THREAD_TAB_LEAVE,
        onLeave as EventListener
      );
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
      const aeForComposer =
        (typeof document !== 'undefined'
          ? (document.activeElement as HTMLElement | null)
          : null) || (e.target as HTMLElement | null);
      // Prefer live store layout so Diff keep-alive does not claim Conversation
      // footer (would steal ⌥I from review-thread focus).
      const liveLayoutForComposer =
        useModalStore.getState().layoutMode || ui.layoutMode;
      // Footer tips stay visible without focus on Conversation only.
      const composerSurface =
        typeof findComposerShortcutSurface === 'function'
          ? findComposerShortcutSurface({
              activeElement: aeForComposer,
              eventTarget: e.target,
              layoutMode: liveLayoutForComposer,
            })
          : {
              active: isComposerKeyboardTarget(aeForComposer),
              root: null as HTMLElement | null,
              mdc: null as HTMLElement | null,
            };
      const composerFocused = Boolean(composerSurface.active);
      // Option product chords: allow Control+Option (⌥⌃R) but not ⌘+Option.
      // `alt` already from e.altKey above (physical-key normalize).
      const ctrlKey = Boolean(e.ctrlKey);
      const altOnly = alt && !e.metaKey && !ctrlKey;
      const shift = Boolean(e.shiftKey);
      // Capabilities for composer-context chords (DOM on focused / default form)
      let canResolveComposer = false;
      let canToggleModeComposer = false;
      if (composerFocused && typeof document !== 'undefined') {
        try {
          const root =
            composerSurface.root ||
            (aeForComposer?.closest?.(
              '[data-prp-composer-root]'
            ) as HTMLElement | null);
          canResolveComposer = Boolean(
            root?.hasAttribute?.('data-prp-can-resolve') ||
              root?.querySelector?.('[data-prp-composer-resolve]')
          );
          canToggleModeComposer = Boolean(
            root?.hasAttribute?.('data-prp-can-toggle-mode') ||
              root?.querySelector?.('[data-prp-composer-mode-tabs]') ||
              document.querySelector?.(
                '.prp-card--composer [data-prp-composer-mode-tabs]'
              )
          );
        } catch {
          /* ignore */
        }
      }

      // Composer-context chords win over product peers when a surface is
      // active (focused mdc OR Conversation footer). Exception: ⌥I while a
      // review thread is keyboard-focused (not typing) → contextThreadComment.
      if (
        composerFocused &&
        !ui.paletteOpen &&
        typeof resolveComposerContextShortcutAction === 'function'
      ) {
        const composerAct = resolveComposerContextShortcutAction({
          mod: composerFocused ? mod : mod && !alt,
          shift,
          alt: alt && !e.metaKey,
          ctrl: ctrlKey,
          key,
          code: e.code,
          composerFocused: true,
          canResolve: canResolveComposer,
          canToggleMode: canToggleModeComposer,
        });
        let takeComposerEarly = Boolean(composerAct);
        if (
          takeComposerEarly &&
          composerAct === 'composerFocusInput' &&
          !(
            typeof isComposerKeyboardTarget === 'function' &&
            isComposerKeyboardTarget(aeForComposer)
          )
        ) {
          try {
            const stc = useModalStore.getState();
            const onDiffThread =
              stc.layoutMode === LAYOUT_DIFF &&
              (Number(stc.commentIndex) >= 0 ||
                stc.activeDiffCommentId != null);
            const convA = String(
              stc.focusedConversationAnchor ||
                stc.pendingConversationNavAnchor ||
                ''
            ).trim();
            const onConvThread = convA.startsWith('review-comment:');
            if (onDiffThread || onConvThread) {
              takeComposerEarly = false;
            }
          } catch {
            /* ignore */
          }
        }
        if (takeComposerEarly && composerAct) {
          e.preventDefault();
          e.stopPropagation();
          if (e.altKey) {
            optHintsSuppressedRef.current = true;
            syncOptHintsActive();
          }
          reportShortcutAction(String(composerAct));
          const mdc =
            composerSurface.mdc ||
            (aeForComposer?.closest?.(
              '[data-prp-composer], .prp-mdc'
            ) as HTMLElement | null);
          const root =
            composerSurface.root ||
            (aeForComposer?.closest?.(
              '[data-prp-composer-root]'
            ) as HTMLElement | null);
          switch (composerAct) {
            case 'composerSubmit': {
              try {
                if (mdc) {
                  mdc.dispatchEvent(
                    new CustomEvent('prp-composer-submit', {
                      bubbles: true,
                      cancelable: true,
                    })
                  );
                  break;
                }
                const btn = root?.querySelector?.(
                  '[data-prp-composer-submit]:not([disabled])'
                ) as HTMLButtonElement | null;
                btn?.click?.();
              } catch {
                /* ignore */
              }
              break;
            }
            case 'composerFocusInput': {
              try {
                mdc?.dispatchEvent(
                  new CustomEvent('prp-composer-focus-input', {
                    bubbles: true,
                    cancelable: true,
                  })
                );
                const ta =
                  mdc?.querySelector?.('[data-prp-composer-input]') ||
                  root?.querySelector?.('[data-prp-composer-input]');
                (ta as HTMLTextAreaElement | null)?.focus?.();
              } catch {
                /* ignore */
              }
              break;
            }
            case 'composerResolve': {
              try {
                const btn = root?.querySelector?.(
                  '[data-prp-composer-resolve]:not([disabled])'
                ) as HTMLButtonElement | null;
                if (btn) {
                  btn.click();
                  break;
                }
              } catch {
                /* ignore */
              }
              act.runContextThreadAction?.('resolve');
              break;
            }
            case 'composerModeToggle': {
              try {
                const host =
                  root?.closest?.('.prp-card--composer') ||
                  document.querySelector?.('.prp-card--composer');
                const cTab = host?.querySelector?.(
                  '[data-prp-composer-mode="comment"]'
                ) as HTMLButtonElement | null;
                const rTab = host?.querySelector?.(
                  '[data-prp-composer-mode="review"]'
                ) as HTMLButtonElement | null;
                if (cTab && rTab) {
                  const commentOn =
                    cTab.getAttribute('aria-selected') === 'true';
                  (commentOn ? rTab : cTab).click();
                }
              } catch {
                /* ignore */
              }
              break;
            }
            default:
              break;
          }
          return;
        }
      }

      // Option / Option+Shift command actions (former mod → opt; no mod back-compat)
      // Opt+Shift peers (⌥⇧L labels, ⌥⇧P milestone, …) fire even while typing.
      // Plain Opt stays blocked while typing so text entry is not stolen.
      if (
        altOnly &&
        !ui.paletteOpen &&
        typeof resolvePrModalOptAction === 'function' &&
        (typeof allowPrModalOptPeerWhileEditable !== 'function' ||
          allowPrModalOptPeerWhileEditable({
            editableTarget: editable,
            shift,
          }))
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
          // Leave the typing surface so pickers can take focus
          if (editable) {
            try {
              (document.activeElement as HTMLElement | null)?.blur?.();
            } catch {
              /* ignore */
            }
          }
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
                String(chord || ''),
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
          // High-traffic nav peers: call act handlers directly. Avoids
          // runPaletteCommand ReferenceErrors / missing deps killing the chord
          // after the monitor already reported a successful fire.
          const peerAct = String(peer.action || '');
          if (peerAct === 'toggleDiff') {
            act.onToggleDiff?.();
            return;
          }
          if (peerAct === 'toggleSidePanel') {
            act.toggleSidePanel?.();
            return;
          }
          if (peerAct === 'toggleFullscreen') {
            if (!isEmbed) {
              setShellFullscreen((prev) => toggleShellFullscreen(prev));
            }
            return;
          }
          // Route through palette runner (merge confirm, pickers, etc.)
          try {
            act.runPaletteCommand?.({
              action: peer.action,
              payload: peer.payload || {},
              id: peer.id,
              title: peer.title,
            });
          } catch (err) {
            try {
              console.warn(
                '[pr-plus] runPaletteCommand failed:',
                peerAct,
                err?.message || err
              );
            } catch {
              /* ignore */
            }
          }
          return;
        }
      }

      // Live context — App often does not re-render on ⌥J/K focus (store leaf only),
      // so uiRef.contextThreadActive can stay stale false and block ⌥C/F/D/⌃R.
      const storeUi = useModalStore.getState();
      const liveConvAnchor = String(
        conversationCommentFocusRef.current?.anchor ||
          storeUi.focusedConversationAnchor ||
          storeUi.pendingConversationNavAnchor ||
          ''
      ).trim();
      const liveConvFocus = Boolean(liveConvAnchor);
      const onDiff =
        ui.layoutMode === LAYOUT_DIFF || storeUi.layoutMode === LAYOUT_DIFF;
      // Diff: ⌥C/D/⌃R stay available (handlers seed commentIndex 0 if needed).
      // Conversation keep-alive focus must not win on Diff (hidden panel).
      const liveContextThread = onDiff ? true : liveConvFocus;
      const liveSel = storeUi.lineSelection;
      // Real Diff thread focus: ⌥J/K comment nav, active id, or ↑↓ caret on a thread.
      const liveDiffThreadFocused =
        onDiff &&
        (Number(storeUi.commentIndex) >= 0 ||
          storeUi.activeDiffCommentId != null ||
          isThreadSelection(liveSel));
      // Conversation ←/→ only fold when a review-thread stop is focused.
      const liveFocusedReviewThread = onDiff
        ? liveDiffThreadFocused
        : liveConvAnchor.startsWith('review-comment:');
      // Code-body selection only — thread/file carets must not force file fold
      // (otherwise ← / ⌥F close the file while a thread is focused via ↑↓).
      const liveLineSelection = isCodeBodySelection(liveSel);

      let action =
        typeof resolveModalShortcutAction === 'function'
          ? resolveModalShortcutAction({
              // When Option is held, do not treat Ctrl/⌘ as "mod" — Ctrl pairs with ⌥ for resolve.
              // For ⌘Enter submit while composer-focused, keep real mod.
              mod: composerFocused ? mod : mod && !alt,
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
              composerFocused,
              canResolve: canResolveComposer,
              canToggleMode: canToggleModeComposer,
              searchOpen: Boolean(ui.searchOpen),
              hasLineSelection: liveLineSelection,
              diffThreadFocused: liveDiffThreadFocused,
              focusedReviewThread: liveFocusedReviewThread,
              layoutMode: ui.layoutMode,
              conversationCommentFocused: liveConvFocus,
              contextThreadActive: liveContextThread,
              multiReplyThreadFocused:
                liveContextThread && isMultiReplyThreadFocused(),
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

      // Prefer live store for layout-gated chords (uiRef can lag under hold)
      const liveLayoutMode =
        useModalStore.getState().layoutMode || ui.layoutMode;

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
        case 'stepThreadReplyPrev':
          stepThreadReply(-1);
          break;
        case 'stepThreadReplyNext':
          stepThreadReply(1);
          break;
        case 'contextThreadResolve':
        case 'focusedThreadResolve':
          act.runContextThreadAction?.('resolve');
          break;
        case 'contextCommentCopyBody':
        case 'contextCommentCopyLink':
        case 'contextCommentQuote':
        case 'contextCommentHide':
        case 'contextCommentEdit':
        case 'contextCommentDelete':
        case 'contextCommentReact': {
          try {
            const selMap: Record<string, string[]> = {
              contextCommentCopyBody: ['[data-prp-copy-comment="1"]'],
              contextCommentCopyLink: ['[data-prp-copy-comment-link="1"]'],
              contextCommentQuote: ['[data-prp-quote-reply="1"]'],
              contextCommentHide: [
                '[data-prp-hide-comment="1"]',
                '[data-prp-unhide-comment="1"]',
              ],
              contextCommentEdit: [
                '[data-prp-edit-comment="1"]',
                'button[aria-label*="Edit" i]',
              ],
              contextCommentDelete: [
                '[data-prp-delete-comment="1"]',
                'button[aria-label*="Delete" i]',
              ],
              contextCommentReact: [
                '[data-prp-reaction-add="1"]',
                '.prp-reactions__add',
              ],
            };
            const sels = selMap[String(action)] || [];
            const host =
              (document.querySelector(
                '.prp-card--kb-focus, .prp-conversation-kb-focus, .prp-review-group__row--kb-focus, .prp-inline-thread[data-context-active="1"], .prp-vline--comment-selected .prp-inline-thread, .prp-inline-thread--context-active'
              ) as HTMLElement | null) ||
              (document.querySelector(
                '.prp-overlay [data-search-anchor].prp-card--kb-focus, .prp-overlay .prp-card--kb-focus'
              ) as HTMLElement | null) ||
              null;
            const root = host || document.querySelector('.prp-overlay');
            let btn: HTMLElement | null = null;
            for (const s of sels) {
              btn = (root?.querySelector?.(s) ||
                document.querySelector(`.prp-overlay ${s}`)) as HTMLElement | null;
              if (btn && !(btn as HTMLButtonElement).disabled) break;
              btn = null;
            }
            if (btn) {
              btn.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
              btn.click();
              // ⌥E: after picker mounts, focus first emoji so Tab/arrows start there
              if (String(action) === 'contextCommentReact') {
                const focusFirstEmoji = () => {
                  const emoji = document.querySelector(
                    '.prp-reactions__picker [data-prp-reaction-emoji="1"], .prp-reactions__picker-btn'
                  ) as HTMLButtonElement | null;
                  if (!emoji) return false;
                  try {
                    emoji.focus({ preventScroll: true });
                  } catch {
                    emoji.focus?.();
                  }
                  return document.activeElement === emoji;
                };
                requestAnimationFrame(() => {
                  if (focusFirstEmoji()) return;
                  requestAnimationFrame(() => {
                    if (focusFirstEmoji()) return;
                    window.setTimeout(focusFirstEmoji, 40);
                  });
                });
              }
            }
          } catch {
            /* ignore */
          }
          break;
        }
        case 'composerSubmit': {
          // Prefer custom event on focused MarkdownComposer; fallback click submit btn
          try {
            const ae = document.activeElement as HTMLElement | null;
            const mdc = ae?.closest?.('[data-prp-composer]') as HTMLElement | null;
            if (mdc) {
              mdc.dispatchEvent(
                new CustomEvent('prp-composer-submit', {
                  bubbles: true,
                  cancelable: true,
                })
              );
              break;
            }
            const root = ae?.closest?.('[data-prp-composer-root]');
            const btn = root?.querySelector?.(
              '[data-prp-composer-submit]:not([disabled])'
            ) as HTMLButtonElement | null;
            btn?.click?.();
          } catch {
            /* ignore */
          }
          break;
        }
        case 'composerFocusInput': {
          try {
            const ae = document.activeElement as HTMLElement | null;
            const mdc = ae?.closest?.('[data-prp-composer]') as HTMLElement | null;
            mdc?.dispatchEvent(
              new CustomEvent('prp-composer-focus-input', {
                bubbles: true,
                cancelable: true,
              })
            );
            const ta =
              mdc?.querySelector?.('[data-prp-composer-input]') ||
              ae?.closest?.('[data-prp-composer-root]')?.querySelector?.(
                '[data-prp-composer-input]'
              );
            (ta as HTMLTextAreaElement | null)?.focus?.();
          } catch {
            /* ignore */
          }
          break;
        }
        case 'composerResolve': {
          // Prefer form resolve button; else context-thread resolve API
          try {
            const ae = document.activeElement as HTMLElement | null;
            const root = ae?.closest?.('[data-prp-composer-root]');
            const btn = root?.querySelector?.(
              '[data-prp-composer-resolve]:not([disabled])'
            ) as HTMLButtonElement | null;
            if (btn) {
              btn.click();
              break;
            }
          } catch {
            /* ignore */
          }
          act.runContextThreadAction?.('resolve');
          break;
        }
        case 'composerModeToggle': {
          try {
            const ae = document.activeElement as HTMLElement | null;
            const root = ae?.closest?.('[data-prp-composer-root]');
            const commentTab = root
              ?.closest?.('.prp-card--composer')
              ?.querySelector?.(
                '[data-prp-composer-mode="comment"]'
              ) as HTMLButtonElement | null;
            const reviewTab = root
              ?.closest?.('.prp-card--composer')
              ?.querySelector?.(
                '[data-prp-composer-mode="review"]'
              ) as HTMLButtonElement | null;
            // Prefer tabs from title region (sibling structure)
            const host =
              root?.closest?.('.prp-card--composer') ||
              document.querySelector?.('.prp-card--composer');
            const cTab =
              commentTab ||
              (host?.querySelector?.(
                '[data-prp-composer-mode="comment"]'
              ) as HTMLButtonElement | null);
            const rTab =
              reviewTab ||
              (host?.querySelector?.(
                '[data-prp-composer-mode="review"]'
              ) as HTMLButtonElement | null);
            if (cTab && rTab) {
              const commentOn =
                cTab.getAttribute('aria-selected') === 'true';
              (commentOn ? rTab : cTab).click();
            }
          } catch {
            /* ignore */
          }
          break;
        }
        case 'restoreNativeView':
          if (isEmbed && typeof onRestoreNative === 'function') {
            onRestoreNative();
          }
          break;
        case 'stepNavPrev':
          // Find → Diff threads → Conversation comments (⌥K)
          if (ui.searchOpen) {
            act.navSearch?.(-1);
          } else if (liveLayoutMode === LAYOUT_DIFF) {
            act.navComment?.(-1);
          } else {
            act.navConversationComment?.(-1);
          }
          break;
        case 'stepNavNext':
          // Find → Diff threads → Conversation comments (⌥J)
          if (ui.searchOpen) {
            act.navSearch?.(1);
          } else if (liveLayoutMode === LAYOUT_DIFF) {
            act.navComment?.(1);
          } else {
            act.navConversationComment?.(1);
          }
          break;
        case 'navFilePrev':
          if (liveLayoutMode === LAYOUT_DIFF) act.navFile?.(-1);
          break;
        case 'navFileNext':
          if (liveLayoutMode === LAYOUT_DIFF) act.navFile?.(1);
          break;
        case 'scrollDiffPagePrev':
          if (
            ui.layoutMode === LAYOUT_DIFF ||
            useModalStore.getState().layoutMode === LAYOUT_DIFF
          ) {
            act.scrollDiffPage?.(-1);
          }
          break;
        case 'scrollDiffPageNext':
          if (
            ui.layoutMode === LAYOUT_DIFF ||
            useModalStore.getState().layoutMode === LAYOUT_DIFF
          ) {
            act.scrollDiffPage?.(1);
          }
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
        case 'toggleActiveFileCollapse':
          if (ui.layoutMode === LAYOUT_DIFF) act.toggleActiveFileCollapse?.();
          break;
        case 'collapseActiveFile':
          if (ui.layoutMode === LAYOUT_DIFF) act.setActiveFileCollapse?.(true);
          break;
        case 'expandActiveFile':
          if (ui.layoutMode === LAYOUT_DIFF) act.setActiveFileCollapse?.(false);
          break;
        case 'contextThreadCollapse':
          act.runContextThreadAction?.('foldCollapse');
          break;
        case 'contextThreadExpand':
          act.runContextThreadAction?.('foldExpand');
          break;
        case 'collapseFold':
          if (ui.layoutMode === LAYOUT_DIFF) act.setActiveFileCollapse?.(true);
          else act.runContextThreadAction?.('foldCollapse');
          break;
        case 'expandFold':
          if (ui.layoutMode === LAYOUT_DIFF) act.setActiveFileCollapse?.(false);
          else act.runContextThreadAction?.('foldExpand');
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

  // Keep extracted mutation handlers on live render values (deps bag pattern).
  Object.assign(mutD, {
    detail,
    detailRef,
    setLocalDetail,
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
    forceDropPendingRef,
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
              fileCommentedOnly={fileCommentedOnly}
              setFileCommentedOnly={setFileCommentedOnly}
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
  );
}


export default PrModalApp;
