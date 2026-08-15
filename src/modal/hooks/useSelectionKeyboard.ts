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
/** selection keyboard */
export function useSelectionKeyboard(b: any) {
  const onSelectFile = (...args: any[]) => b.onSelectFile?.(...args);
  const setSelectionIslandPhase = b.setSelectionIslandPhase;
  const clearDiffThreadFocusIfNeeded = (...args: any[]) => b.clearDiffThreadFocusIfNeeded?.(...args);
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
  const applyThreadReplyStep = b.applyThreadReplyStep;
  const assigneeAddRef = b.assigneeAddRef;
  const autoExpandOnFileNav = b.autoExpandOnFileNav;
  const avgH = b.avgH;
  const baseBranchRef = b.baseBranchRef;
  const changeRegionIndexRef = b.changeRegionIndexRef;
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
  const scrollConversationPanel = b.scrollConversationPanel;
  const scrollConversationThreadUnitIntoView = b.scrollConversationThreadUnitIntoView;
  const scrollDiffCaretIntoView = b.scrollDiffCaretIntoView;
  const scrollDiffPage = b.scrollDiffPage;
  const scrollDiffThreadUnitIntoView = b.scrollDiffThreadUnitIntoView;
  const scrollFileNavRowIntoView = b.scrollFileNavRowIntoView;
  const scrollFocusedThreadUnitIntoView = b.scrollFocusedThreadUnitIntoView;
  const scrollMappedCommentIntoView = b.scrollMappedCommentIntoView;
  const scrollSelectionCaretAfterHop = b.scrollSelectionCaretAfterHop;
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
  const setSelectionIslandLeaving = b.setSelectionIslandLeaving;
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

  function clearSelectionActionsTimer() {
    if (selectionActionsTimerRef.current != null) {
      clearTimeout(selectionActionsTimerRef.current);
      selectionActionsTimerRef.current = null;
    }
  }

  /** Stamp documentElement so ShortcutHint / CSS can hide badges during jump. */
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

  /** Cancel queued Diff selection work; file jumps may also drop the cursor. */
  function clearLineSelectionForNav(preserveCursor = false) {
    clearSelectionActionsTimer();
    setSelectionNavBusy(false);
    if (selectionMoveRafRef.current) {
      selectionMoveRafRef.current.cancel();
      selectionMoveRafRef.current = null;
    }
    pendingSelectionMoveRef.current = null;
    if (optArrowRafRef.current) {
      optArrowRafRef.current.cancel();
      optArrowRafRef.current = null;
    }
    pendingOptArrowDirRef.current = 0;
    pendingCrossFileSeedRef.current = null;
    pendingGotoRef.current = null;
    pendingCommentJumpRef.current = null;
    lastExitedMultiReplyRef.current = null;
    selectingRef.current = false;
    setSelecting(false);
    if (!preserveCursor && useModalStore.getState().lineSelection) {
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
            // Explicit Opt latch (DOM attr) wins over a stuck jump-busy flag.
            selectionNavBusy: Boolean(selectionNavBusyRef.current) && !domOpt,
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
   * After select/move: hide actions dock + ShortcutHints immediately, then after
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
    // Jump in flight: suppress floatbar + all ShortcutHints until settle
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
      // Arm store + floatbar in one turn so ShortcutHints mount with the dock
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
    noteDiffNavActivity?.();
    if (b.selectionInteractedRef) b.selectionInteractedRef.current = true;
    // Shift-extend is a discrete caret change — flush immediately so
    // e2e / slow key-repeat cannot lose the range inside rAF coalesce.
    if (shift) {
      if (pendingSelectionMoveRef) {
        pendingSelectionMoveRef.current = { delta, shift: true };
      }
      try {
        flushSelectionKeyboardMove(delta, true);
      } finally {
        if (pendingSelectionMoveRef) pendingSelectionMoveRef.current = null;
      }
      return;
    }
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


  return {
    applySelectionKeyboardMove, clearLineSelectionForNav, clearSelectionActionsTimer, ensureFileExpandedForSelection, flushSelectionKeyboardMove, scheduleSelectionActionsReveal, scrollSelectionHeadDomOnly, setSelectionHoverReveal, setSelectionNavBusy, syncActiveFileFromSelection, syncSelectionActionReveal
  };
}
