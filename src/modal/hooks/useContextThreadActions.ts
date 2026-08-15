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
/** context thread */
export function useContextThreadActions(b: any) {
  const onReplyToThread = b.onReplyToThread;
  const onResolveThread = b.onResolveThread;
  const onToggleThreadCollapse = (...args: any[]) => b.onToggleThreadCollapse?.(...args);
  const isDiffThreadCollapsed = (...args: any[]) => b.isDiffThreadCollapsed?.(...args);
  const abandonConversationPositionDeepLink = b.abandonConversationPositionDeepLink;
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
  const asideToggleRef = b.asideToggleRef;
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
  const collapseDiff = b.collapseDiff;
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
  const contextThreadActionsRef = b.contextThreadActionsRef || { current: null };
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
  const enterAnimTokenRef = b.enterAnimTokenRef;
  const expandDiff = b.expandDiff;
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
  const jumpToReviewComment = b.jumpToReviewComment;
  const jumpToSearchHit = b.jumpToSearchHit;
  const labelAddRef = b.labelAddRef;
  const lastExitedMultiReplyRef = b.lastExitedMultiReplyRef;
  const layoutMode = b.layoutMode;
  const listRef = b.listRef;
  const liveDiffMetricsRef = b.liveDiffMetricsRef;
  const mappedComments = b.mappedComments;
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
  const onRegisterAsideToggle = b.onRegisterAsideToggle;
  const onSearchClose = b.onSearchClose;
  const onSearchLoadComments = b.onSearchLoadComments;
  const onSearchNext = b.onSearchNext;
  const onSearchPrev = b.onSearchPrev;
  const onSearchQueryCommit = b.onSearchQueryCommit;
  const onToggleDiff = b.onToggleDiff;
  const onToggleFileNavCollapse = (...args: any[]) =>
    b.onToggleFileNavCollapse?.(...args);
  const onToggleShell = b.onToggleShell;
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
  const persistFileNav = b.persistFileNav;
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
  const requestClose = b.requestClose;
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
  const terminalClosePrKeyRef = b.terminalClosePrKeyRef;
  const terminalCloseWasTerminalRef = b.terminalCloseWasTerminalRef;
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
  const uriWasOpenRef = b.uriWasOpenRef;
  const viewedPaths = b.viewedPaths;
  const viewportHeightRef = b.viewportHeightRef;
  const virtualRows = b.virtualRows;
  const virtualRowsRef = b.virtualRowsRef;
  const visibleConvThreadNodeIdsRef = b.visibleConvThreadNodeIdsRef;
  const walkReviewCommentToRootId = b.walkReviewCommentToRootId;

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


  return {
    ensureDiffContextThread, getActiveDiffContextThread, onRegisterContextThreadActions, runContextThreadAction, runDiffContextThreadAction, toggleSidePanel
  };
}
