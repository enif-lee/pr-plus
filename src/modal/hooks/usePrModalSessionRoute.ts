// @ts-nocheck — Phase 9 extract
import React, { useCallback, useEffect, useMemo, useRef, useState, startTransition } from 'react';
/**
 * SOURCE OF TRUTH — PR modal shell composition root (Phase 7).
 * Complete TypeScript module: providers, layout, command wiring, page switch.
 * Domain mutations: src/modal/commands/*
 * Capture hotkeys: src/modal/hooks/usePrModalHotkeys.ts
 * Public entry: PrModalApp.tsx re-exports this shell.
 * PrModalApp.impl.tsx is a thin re-export for legacy path compatibility only.
 */
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
import { runPaletteCommand as runPaletteCommandImpl } from '../app/pr-modal-run-palette';
import { installPrModalMutations, installReviewActions, installSideActions } from '../commands';
import { useCommandContext } from '../hooks/useCommandContext';
import { usePrModalHotkeys } from '../hooks/usePrModalHotkeys';
import { DomainDetailProvider } from '../app/domain-detail-context';
import { createApplyDomainDetailToHost } from '../hooks/useDomainDetailHost';
import {
  mapRequestedReviewersFromApi,
  mapAssigneesFromApi,
  mapLabelsFromApi,
  mergeAvatarUrls,
} from '../app/pr-modal-mappers';
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

/** Survives React remount while the same PR stays open (route writes remount host). */
let restoredSessionPrKey: string | null = null;

/** session URI */
export function usePrModalSessionRoute(b: any) {
  const open = b.open;
  const initialRoute = b.initialRoute;
  const onRouteChange = b.onRouteChange;
  const onLoadMoreReviewThreads = b.onLoadMoreReviewThreads;
  const expandDiff = (...args: any[]) => b.expandDiff?.(...args);
  const mappedComments = Array.isArray(b.mappedComments)
    ? b.mappedComments
    : [];
  const jumpToReviewComment = (...args: any[]) => b.jumpToReviewComment?.(...args);
  const setRouteWriteReady = b.setRouteWriteReady;
  const setSelectionIslandPhase = b.setSelectionIslandPhase;
  const actionBusy = b.actionBusy;
  const actionMsg = b.actionMsg;
  const actionMsgSeq = b.actionMsgSeq;
  const actionsRef = b.actionsRef;
  const activeDiffScrollRoot = b.activeDiffScrollRoot;
  const activeFilePathForRows = b.activeFilePathForRows;
  const activeSearchHit = b.activeSearchHit;
  const activeSearchOccurrence = b.activeSearchOccurrence;
  const animClass = b.animClass;
  const annotatedFiles = b.annotatedFiles;
  const appLocale = b.appLocale;
  const applyActionRef = b.applyActionRef;
  const applyConversationCommentNav = b.applyConversationCommentNav;
  const applyDiffCommitFilter = b.applyDiffCommitFilter;
  const applyDiffPageScroll = b.applyDiffPageScroll;
  const applyDomainDetailToHost = b.applyDomainDetailToHost;
  const applyGotoQuery = b.applyGotoQuery;
  const applyHideWhitespace = b.applyHideWhitespace;
  const applyOptArrowScrollSelect = b.applyOptArrowScrollSelect;
  const applyReviewFilterToggle = b.applyReviewFilterToggle;
  const applySelectionKeyboardMove = b.applySelectionKeyboardMove;
  const applyThreadReplyStep = b.applyThreadReplyStep;
  const assigneeAddRef = b.assigneeAddRef;
  const autoExpandOnFileNav = b.autoExpandOnFileNav;
  const avgH = b.avgH;
  const baseBranchRef = b.baseBranchRef;
  const changeRegionIndexRef = b.changeRegionIndexRef;
  const clearLineSelectionForNav = b.clearLineSelectionForNav;
  const clearSelectionActionsTimer = b.clearSelectionActionsTimer;
  const closeConfirm = b.closeConfirm;
  const closeTimerRef = b.closeTimerRef;
  const closing = b.closing;
  const closingRef = b.closingRef;
  const collapseInitRef = b.collapseInitRef;
  const collapsedFiles = b.collapsedFiles;
  const commentBoxRef = b.commentBoxRef;
  const commentHeightOpts = b.commentHeightOpts;
  const commentIndex = b.commentIndex;
  const commentPrefetchGenRef = b.commentPrefetchGenRef;
  const commitDiffThreadCursor = b.commitDiffThreadCursor;
  const commitListLoading = b.commitListLoading;
  const commitsFlightRef = b.commitsFlightRef;
  const commitsFlightSeqRef = b.commitsFlightSeqRef;
  const commitsFullyLoadedRef = b.commitsFullyLoadedRef;
  const compareFetchGenRef = b.compareFetchGenRef;
  const compareFilesCacheRef = b.compareFilesCacheRef;
  const confirmState = b.confirmState;
  const conversationCommentFocusRef = b.conversationCommentFocusRef;
  const conversationCommentPageItems = b.conversationCommentPageItems;
  const conversationNavRafRef = b.conversationNavRafRef;
  const conversationScrollerEl = b.conversationScrollerEl;
  const deferredDiffReviewFilter = b.deferredDiffReviewFilter;
  const detail = b.detail;
  const detailRef = b.detailRef;
  const diffCommitError = b.diffCommitError;
  const diffCommitFilter = b.diffCommitFilter;
  const diffCommitLabel = b.diffCommitLabel;
  const diffCommitLoading = b.diffCommitLoading;
  const diffDisplayFiles = b.diffDisplayFiles;
  const diffExpandBusyKey = b.diffExpandBusyKey;
  const diffExpandedRanges = b.diffExpandedRanges;
  const diffFileLines = b.diffFileLines;
  const diffFilesOverride = b.diffFilesOverride;
  const diffFullLoadGenRef = b.diffFullLoadGenRef;
  const diffFullLoadKeyRef = b.diffFullLoadKeyRef;
  const diffMode = b.diffMode;
  const diffNavIdleTimerRef = b.diffNavIdleTimerRef;
  const diffReviewFilter = b.diffReviewFilter;
  const diffScrollerEl = b.diffScrollerEl;
  const diffStickyPadTop = b.diffStickyPadTop;
  const diffThreadCollapse = b.diffThreadCollapse;
  const displayFiles = b.displayFiles;
  const displayPathSet = b.displayPathSet;
  const editingBody = b.editingBody;
  const editingComment = b.editingComment;
  const editorSaveRef = b.editorSaveRef;
  const embedChrome = b.embedChrome;
  const ensureAllCommits = b.ensureAllCommits;
  const ensureAllFiles = b.ensureAllFiles;
  const ensureFileExpandedForSelection = b.ensureFileExpandedForSelection;
  const ensurePrTags = b.ensurePrTags;
  const expandFileForJump = b.expandFileForJump;
  const expandedDirs = b.expandedDirs;
  const fileCommentedOnly = b.fileCommentedOnly;
  const fileExtFilter = b.fileExtFilter;
  const fileListLoading = b.fileListLoading;
  const fileNav = b.fileNav;
  const fileNavDragRef = b.fileNavDragRef;
  const fileNavRafRef = b.fileNavRafRef;
  const fileQuery = b.fileQuery;
  const fileStarts = b.fileStarts;
  const fileTree = b.fileTree;
  const fileTreeExpandKeyRef = b.fileTreeExpandKeyRef;
  const fileUnreadOnly = b.fileUnreadOnly;
  const filesFlightRef = b.filesFlightRef;
  const filesFlightSeqRef = b.filesFlightSeqRef;
  const filesFullyLoadedRef = b.filesFullyLoadedRef;
  const findThreadArrayIndex = b.findThreadArrayIndex;
  const flushSelectionKeyboardMove = b.flushSelectionKeyboardMove;
  const getChangeRegionIndexForList = b.getChangeRegionIndexForList;
  const getDiffScrollMetrics = b.getDiffScrollMetrics;
  const ghCommitRouteAppliedRef = b.ghCommitRouteAppliedRef;
  const ghSelectionAppliedRef = b.ghSelectionAppliedRef;
  const handoffThreadExitToSelection = b.handoffThreadExitToSelection;
  const hideWhitespace = b.hideWhitespace;
  const hotkeyBag = b.hotkeyBag;
  const isDiffCommentCollapsed = b.isDiffCommentCollapsed;
  const isEmbed = b.isEmbed;
  const isMac = b.isMac;
  const isMultiReplyThreadFocused = b.isMultiReplyThreadFocused;
  const jumpToSearchHit = b.jumpToSearchHit;
  const labelAddRef = b.labelAddRef;
  const lastExitedMultiReplyRef = b.lastExitedMultiReplyRef;
  const layoutMode = b.layoutMode;
  const listRef = b.listRef;
  const liveDiffMetricsRef = b.liveDiffMetricsRef;
  const mentionCandidates = b.mentionCandidates;
  const milestoneAddRef = b.milestoneAddRef;
  const modalSize = b.modalSize;
  const mut = b.mut;
  const mutD = b.mutD;
  const nativeTextSelectDragRef = b.nativeTextSelectDragRef;
  const nativeTextSelectMouseUpRef = b.nativeTextSelectMouseUpRef;
  const navComment = b.navComment;
  const navCommentDeltaRef = b.navCommentDeltaRef;
  const navCommentRafRef = b.navCommentRafRef;
  const navConversationComment = b.navConversationComment;
  const navFile = b.navFile;
  const navFiles = b.navFiles;
  const navReviewComments = b.navReviewComments;
  const navSearch = b.navSearch;
  const noteDiffNavActivity = b.noteDiffNavActivity;
  const onSearchClose = b.onSearchClose;
  const onSearchLoadComments = b.onSearchLoadComments;
  const onSearchNext = b.onSearchNext;
  const onSearchPrev = b.onSearchPrev;
  const onSearchQueryCommit = b.onSearchQueryCommit;
  const onVirtualMetricsChange = b.onVirtualMetricsChange;
  const optArrowRafRef = b.optArrowRafRef;
  const optArrowScrollSelect = b.optArrowScrollSelect;
  const optHeldRef = b.optHeldRef;
  const optHintsSuppressedRef = b.optHintsSuppressedRef;
  const overlayRef = b.overlayRef;
  const pageScrollRafRef = b.pageScrollRafRef;
  const paletteHelpOpen = b.paletteHelpOpen;
  const paletteOpen = b.paletteOpen;
  const patchDiffReviewFilter = b.patchDiffReviewFilter;
  const pendingCommentJumpRef = b.pendingCommentJumpRef;
  const pendingConversationNavDeltaRef = b.pendingConversationNavDeltaRef;
  const pendingCrossFileSeedRef = b.pendingCrossFileSeedRef;
  const pendingFileNavDeltaRef = b.pendingFileNavDeltaRef;
  const pendingGotoRef = b.pendingGotoRef;
  const pendingOptArrowDirRef = b.pendingOptArrowDirRef;
  const pendingPageScrollDirRef = b.pendingPageScrollDirRef;
  const pendingReview = b.pendingReview;
  const pendingReviewNodeIdRef = b.pendingReviewNodeIdRef;
  const pendingSelectionMoveRef = b.pendingSelectionMoveRef;
  const pendingThreadCounts = b.pendingThreadCounts;
  const pendingThreadReplyDeltaRef = b.pendingThreadReplyDeltaRef;
  const picker = b.picker;
  const pickerAnchorRef = b.pickerAnchorRef;
  const pinThreadRowSelection = b.pinThreadRowSelection;
  const pointerStartRef = b.pointerStartRef;
  const positionAppliedRef = b.positionAppliedRef;
  const positionConvDeepLinkKeyRef = b.positionConvDeepLinkKeyRef;
  const positionExhaustedRef = b.positionExhaustedRef;
  const positionInFlightRef = b.positionInFlightRef;
  const positionLayoutDismissedRef = b.positionLayoutDismissedRef;
  const positionLoadMoreKickRef = b.positionLoadMoreKickRef;
  const positionVerifyTimerRef = b.positionVerifyTimerRef;
  const prIdentity = b.prIdentity;
  const prTags = b.prTags;
  const prTagsError = b.prTagsError;
  const prTagsLoading = b.prTagsLoading;
  const pullRequestGqlIdRef = b.pullRequestGqlIdRef;
  const readActiveFilePath = b.readActiveFilePath;
  const readFocusedThreadUnitStamp = b.readFocusedThreadUnitStamp;
  const readScrollTop = b.readScrollTop;
  const readViewportHeight = b.readViewportHeight;
  const repliesForRootCommentId = b.repliesForRootCommentId;
  const requestConfirm = b.requestConfirm;
  const resolveFocusedReviewThreadRootId = b.resolveFocusedReviewThreadRootId;
  const revealDiffDomFocus = b.revealDiffDomFocus;
  const reverseComments = b.reverseComments;
  const reviewAct = b.reviewAct;
  const reviewBag = b.reviewBag;
  const reviewFilterEvalOpts = b.reviewFilterEvalOpts;
  const reviewFilteredFiles = b.reviewFilteredFiles;
  const reviewScopedFiles = b.reviewScopedFiles;
  const reviewThreadTotals = b.reviewThreadTotals;
  const reviewerAddRef = b.reviewerAddRef;
  const routeRestoreKeyRef = b.routeRestoreKeyRef;
  const routeWriteReady = b.routeWriteReady;
  const rowOffsetList = b.rowOffsetList;
  const sampleDiffNav = b.sampleDiffNav;
  const scheduleDiffReviewFilter = b.scheduleDiffReviewFilter;
  const scheduleSelectionActionsReveal = b.scheduleSelectionActionsReveal;
  const scrollConversationPanel = b.scrollConversationPanel;
  const scrollConversationThreadUnitIntoView = b.scrollConversationThreadUnitIntoView;
  const scrollDiffCaretIntoView = b.scrollDiffCaretIntoView;
  const scrollDiffPage = b.scrollDiffPage;
  const scrollDiffThreadUnitIntoView = b.scrollDiffThreadUnitIntoView;
  const scrollFileNavRowIntoView = b.scrollFileNavRowIntoView;
  const scrollFocusedThreadUnitIntoView = b.scrollFocusedThreadUnitIntoView;
  const scrollMappedCommentIntoView = b.scrollMappedCommentIntoView;
  const scrollSelectionCaretAfterHop = b.scrollSelectionCaretAfterHop;
  const scrollSelectionHeadDomOnly = b.scrollSelectionHeadDomOnly;
  const scrollSelectionIntoView = b.scrollSelectionIntoView;
  const scrollTopRef = b.scrollTopRef;
  const searchBusy = b.searchBusy;
  const searchDocs = b.searchDocs;
  const searchGenRef = b.searchGenRef;
  const searchHasRun = b.searchHasRun;
  const searchHitIndex = b.searchHitIndex;
  const searchHits = b.searchHits;
  const searchInputRef = b.searchInputRef;
  const searchJumpRef = b.searchJumpRef;
  const searchMatchRows = b.searchMatchRows;
  const searchMode = b.searchMode;
  const searchOpen = b.searchOpen;
  const searchQuery = b.searchQuery;
  const selectingRef = b.selectingRef;
  const selectionInteractedRef = b.selectionInteractedRef;
  const selectionActionsTimerRef = b.selectionActionsTimerRef;
  const selectionHoverRevealRef = b.selectionHoverRevealRef;
  const selectionIslandLeaving = b.selectionIslandLeaving;
  const selectionIslandPhase = b.selectionIslandPhase;
  const selectionIslandPhaseRef = b.selectionIslandPhaseRef;
  const selectionMoveRafRef = b.selectionMoveRafRef;
  const selectionNavBusyRef = b.selectionNavBusyRef;
  const setActionBusy = b.setActionBusy;
  const setActionMsg = b.setActionMsg;
  const setActiveFileCollapse = b.setActiveFileCollapse;
  const setActiveFilePath = b.setActiveFilePath;
  const setActiveFilePathForNav = b.setActiveFilePathForNav;
  const setAnimClass = b.setAnimClass;
  const setCollapsedFiles = b.setCollapsedFiles;
  const setCommentIndex = b.setCommentIndex;
  const setCommentText = b.setCommentText;
  const setDiffMode = b.setDiffMode;
  const setEditingBody = b.setEditingBody;
  const setEditingComment = b.setEditingComment;
  const setExpandedDirs = b.setExpandedDirs;
  const setFileQuery = b.setFileQuery;
  const setLayoutMode = b.setLayoutMode;
  const setLineSelection = b.setLineSelection;
  const setPaletteOpen = b.setPaletteOpen;
  const setPaletteQuery = b.setPaletteQuery;
  const setPendingReview = b.setPendingReview;
  const setPicker = b.setPicker;
  const setReplyDrafts = b.setReplyDrafts;
  const setScrollTop = b.setScrollTop;
  const setSearchHitIndex = b.setSearchHitIndex;
  const setSearchHits = b.setSearchHits;
  const setSearchHitsStore = b.setSearchHitsStore;
  const setSearchOpen = b.setSearchOpen;
  const setSearchQuery = b.setSearchQuery;
  const setSelecting = b.setSelecting;
  const setSelectionDraft = b.setSelectionDraft;
  const setSelectionHoverReveal = b.setSelectionHoverReveal;
  const setSelectionIslandLeaving = b.setSelectionIslandLeaving;
  const setSelectionNavBusy = b.setSelectionNavBusy;
  const setShowSelectionComposer = b.setShowSelectionComposer;
  const setTimelinePage = b.setTimelinePage;
  const setViewedPaths = b.setViewedPaths;
  const setViewportHeight = b.setViewportHeight;
  const sheetWidth = b.sheetWidth;
  const shellFullscreen = b.shellFullscreen;
  const shellFullscreenHint = b.shellFullscreenHint;
  const shellMode = b.shellMode;
  const shellRef = b.shellRef;
  const shellResizeDragRef = b.shellResizeDragRef;
  const shellResizing = b.shellResizing;
  const shiftRangeRef = b.shiftRangeRef;
  const shortcutMod = b.shortcutMod;
  const shortcutMonitorEnabled = b.shortcutMonitorEnabled;
  const shortcutMonitorSize = b.shortcutMonitorSize;
  const showCloseChrome = b.showCloseChrome;
  const showFullscreenChrome = b.showFullscreenChrome;
  const showLoadComments = b.showLoadComments;
  const showRestoreNativeChrome = b.showRestoreNativeChrome;
  const showSelectionComposer = b.showSelectionComposer;
  const showShellToggleChrome = b.showShellToggleChrome;
  const sideAct = b.sideAct;
  const sideBag = b.sideBag;
  const singleFileMode = b.singleFileMode;
  const sourceFiles = b.sourceFiles;
  const stackPathSelections = b.stackPathSelections;
  const stepThreadReply = b.stepThreadReply;
  const syncActiveFileFromSelection = b.syncActiveFileFromSelection;
  const syncSelectionActionReveal = b.syncSelectionActionReveal;
  const tagsLoadGenRef = b.tagsLoadGenRef;
  const tagsLoadedForKeyRef = b.tagsLoadedForKeyRef;
  const theme = b.theme;
  const threadCounts = b.threadCounts;
  const threadReplyNavRafRef = b.threadReplyNavRafRef;
  const threads = b.threads;
  const threadsByCommentId = b.threadsByCommentId;
  const threadsMeta = b.threadsMeta;
  const timelinePage = b.timelinePage;
  const timelineVisibility = b.timelineVisibility;
  const titleEditSignal = b.titleEditSignal;
  const toggleActiveFileCollapse = b.toggleActiveFileCollapse;
  const toggleViewedActiveFile = b.toggleViewedActiveFile;
  const tryReenterExitedMultiReply = b.tryReenterExitedMultiReply;
  const uiLanguagePref = b.uiLanguagePref;
  const uiRef = b.uiRef;
  const unresolvedThreadCounts = b.unresolvedThreadCounts;
  const viewedPaths = b.viewedPaths;
  const viewportHeightRef = b.viewportHeightRef;
  const virtualRows = b.virtualRows;
  const virtualRowsRef = b.virtualRowsRef;
  const visibleConvThreadNodeIdsRef = b.visibleConvThreadNodeIdsRef;
  const walkReviewCommentToRootId = b.walkReviewCommentToRootId;

  useEffect(() => {
    if (!open || !detail?.owner || !detail?.repo || !detail?.number) return;
    const key = `${detail.owner}/${detail.repo}#${detail.number}`;
    if (
      routeRestoreKeyRef.current === key ||
      restoredSessionPrKey === key
    ) {
      return;
    }
    routeRestoreKeyRef.current = key;
    restoredSessionPrKey = key;
    if (selectionInteractedRef) selectionInteractedRef.current = false;
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
    const applyKey = `${detail.number}:${fileKey || filePathHint || ''}:${startLine ?? ''}:${initialRoute?.endLine ?? ''}`;
    // Pointer / Shift+↑ own the caret. Host echoes of our own #diff- writer
    // must not strip row indices or shrink a live multi-line / file caret.
    // Session restore may pre-fill lineSelection — that is NOT user-owned;
    // inbound #diff- still applies until the user clicks or moves.
    try {
      if (selectingRef?.current || pendingSelectionMoveRef?.current) {
        if (ghSelectionAppliedRef) ghSelectionAppliedRef.current = applyKey;
        return;
      }
      if (useModalStore.getState().selecting) {
        if (ghSelectionAppliedRef) ghSelectionAppliedRef.current = applyKey;
        return;
      }
      if (selectionInteractedRef?.current) {
        if (ghSelectionAppliedRef) ghSelectionAppliedRef.current = applyKey;
        return;
      }
    } catch {
      /* ignore */
    }
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
      let nextSel: any = {
        filePath: path,
        anchorLine: Math.floor(Number(startLine)),
        headLine: end,
        anchorSide: side,
        headSide: side,
      };
      try {
        const rows = virtualRowsRef?.current || virtualRows;
        if (typeof rebindSelectionRowIndices === 'function') {
          nextSel = rebindSelectionRowIndices(nextSel, rows) || nextSel;
        }
      } catch {
        /* keep line-only */
      }
      setLineSelection(nextSel);
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
    try {
      if (selectingRef?.current || pendingSelectionMoveRef?.current) return;
    } catch {
      /* ignore */
    }

    uriWasOpenRef.current = true;
    const page =
      layoutMode === LAYOUT_DIFF ? 'diff' : ('conversation' as const);
    let position: string | null = null;
    const liveCommentIndex = Number(useModalStore.getState().commentIndex);
    if (liveCommentIndex >= 0 && mappedComments[liveCommentIndex]) {
      position = buildPositionFromComment(mappedComments[liveCommentIndex]);
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
    ghSelectionAppliedRef.current = `${detail.number}:${
      fileKey || sel.filePath || ''
    }:${sel.startLine ?? ''}:${sel.endLine ?? ''}`;

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
            fileKey || sel.filePath || ''
          }:${sel.startLine ?? ''}:${sel.endLine ?? ''}`;
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
    restoredSessionPrKey = null;
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

  return {
    abandonConversationPositionDeepLink, uriWasOpenRef
  };
}
