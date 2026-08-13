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
/** nav+search+goto */
export function useDiffConversationNav(b: any) {
  const onLoadMoreReviewThreads = b.onLoadMoreReviewThreads;
  const detailProp = b.detailProp;
  const expandDiff = (...args: any[]) => b.expandDiff?.(...args);
  const collapseDiff = (...args: any[]) => b.collapseDiff?.(...args);
  const setDiffFileLines = b.setDiffFileLines;
  const setDiffExpandedRanges = b.setDiffExpandedRanges;
  const setDiffExpandBusyKey = b.setDiffExpandBusyKey;
  const setHideWhitespace = b.setHideWhitespace;
  const setDiffReviewFilter = b.setDiffReviewFilter;
  const onSelectFile = (...args: any[]) => b.onSelectFile?.(...args);
  const onToggleFileCollapse = b.onToggleFileCollapse;
  const onToggleViewed = b.onToggleViewed;
  const clearLineSelectionForNav = (...args: any[]) => b.clearLineSelectionForNav?.(...args);
  const ensureFileExpandedForSelection = (...args: any[]) => b.ensureFileExpandedForSelection?.(...args);
  const flushSelectionKeyboardMove = (...args: any[]) => b.flushSelectionKeyboardMove?.(...args);
  const scheduleSelectionActionsReveal = (...args: any[]) => b.scheduleSelectionActionsReveal?.(...args);
  const scrollSelectionHeadDomOnly = (...args: any[]) => b.scrollSelectionHeadDomOnly?.(...args);
  const clearDiffThreadFocusIfNeeded = (...args: any[]) => b.clearDiffThreadFocusIfNeeded?.(...args);
  const actionBusy = b.actionBusy;
  const actionMsg = b.actionMsg;
  const actionMsgSeq = b.actionMsgSeq;
  const actionsRef = b.actionsRef;
  const activeFilePathForRows = b.activeFilePathForRows;
  const animClass = b.animClass;
  const annotatedFiles = b.annotatedFiles;
  const appLocale = b.appLocale;
  const applyActionRef = b.applyActionRef;
  const applyDiffCommitFilter = b.applyDiffCommitFilter;
  const applyDomainDetailToHost = b.applyDomainDetailToHost;
  const assigneeAddRef = b.assigneeAddRef;
  const autoExpandOnFileNav = b.autoExpandOnFileNav;
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
  const commitListLoading = b.commitListLoading;
  const commitsFlightRef = b.commitsFlightRef;
  const commitsFlightSeqRef = b.commitsFlightSeqRef;
  const commitsFullyLoadedRef = b.commitsFullyLoadedRef;
  const compareFetchGenRef = b.compareFetchGenRef;
  const compareFilesCacheRef = b.compareFilesCacheRef;
  const confirmState = b.confirmState;
  const conversationCommentFocusRef = b.conversationCommentFocusRef;
  const conversationNavRafRef = b.conversationNavRafRef;
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
  const diffMode = b.diffMode;
  const diffReviewFilter = b.diffReviewFilter;
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
  const expandedDirs = b.expandedDirs;
  const fileCommentedOnly = b.fileCommentedOnly;
  const fileExtFilter = b.fileExtFilter;
  const fileListLoading = b.fileListLoading;
  const fileNav = b.fileNav;
  const fileNavDragRef = b.fileNavDragRef;
  const fileQuery = b.fileQuery;
  const fileStarts = b.fileStarts;
  const fileTree = b.fileTree;
  const fileTreeExpandKeyRef = b.fileTreeExpandKeyRef;
  const fileUnreadOnly = b.fileUnreadOnly;
  const filesFlightRef = b.filesFlightRef;
  const filesFlightSeqRef = b.filesFlightSeqRef;
  const filesFullyLoadedRef = b.filesFullyLoadedRef;
  const ghCommitRouteAppliedRef = b.ghCommitRouteAppliedRef;
  const ghSelectionAppliedRef = b.ghSelectionAppliedRef;
  const hideWhitespace = b.hideWhitespace;
  const hotkeyBag = b.hotkeyBag;
  const isDiffCommentCollapsed = b.isDiffCommentCollapsed;
  const isEmbed = b.isEmbed;
  const isMac = b.isMac;
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
  const navFiles = b.navFiles;
  const navReviewComments = b.navReviewComments;
  const optArrowRafRef = b.optArrowRafRef;
  const optHeldRef = b.optHeldRef;
  const optHintsSuppressedRef = b.optHintsSuppressedRef;
  const overlayRef = b.overlayRef;
  const paletteHelpOpen = b.paletteHelpOpen;
  const paletteOpen = b.paletteOpen;
  const pendingConversationNavDeltaRef = b.pendingConversationNavDeltaRef;
  const pendingCrossFileSeedRef = b.pendingCrossFileSeedRef;
  const pendingOptArrowDirRef = b.pendingOptArrowDirRef;
  const pendingReview = b.pendingReview;
  const pendingReviewNodeIdRef = b.pendingReviewNodeIdRef;
  const pendingSelectionMoveRef = b.pendingSelectionMoveRef;
  const pendingThreadCounts = b.pendingThreadCounts;
  const pendingThreadReplyDeltaRef = b.pendingThreadReplyDeltaRef;
  const picker = b.picker;
  const pickerAnchorRef = b.pickerAnchorRef;
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
  const readScrollTop = b.readScrollTop;
  const readViewportHeight = b.readViewportHeight;
  const requestConfirm = b.requestConfirm;
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
  const scrollTopRef = b.scrollTopRef;
  const searchHitIndex = b.searchHitIndex;
  const searchHits = b.searchHits;
  const searchInputRef = b.searchInputRef;
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
  const setActiveFilePath = b.setActiveFilePath;
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
  const showRestoreNativeChrome = b.showRestoreNativeChrome;
  const showSelectionComposer = b.showSelectionComposer;
  const showShellToggleChrome = b.showShellToggleChrome;
  const sideAct = b.sideAct;
  const sideBag = b.sideBag;
  const singleFileMode = b.singleFileMode;
  const sourceFiles = b.sourceFiles;
  const stackPathSelections = b.stackPathSelections;
  const tagsLoadGenRef = b.tagsLoadGenRef;
  const tagsLoadedForKeyRef = b.tagsLoadedForKeyRef;
  const theme = b.theme;
  const threadCounts = b.threadCounts;
  const threadReplyNavRafRef = b.threadReplyNavRafRef;
  const threads = b.threads;
  const threadsByCommentId = b.threadsByCommentId;
  const timelinePage = b.timelinePage;
  const timelineVisibility = b.timelineVisibility;
  const titleEditSignal = b.titleEditSignal;
  const uiLanguagePref = b.uiLanguagePref;
  const uiRef = b.uiRef;
  const unresolvedThreadCounts = b.unresolvedThreadCounts;
  const viewedPaths = b.viewedPaths;
  const viewportHeightRef = b.viewportHeightRef;
  const virtualRows = b.virtualRows;
  const virtualRowsRef = b.virtualRowsRef;
  const visibleConvThreadNodeIdsRef = b.visibleConvThreadNodeIdsRef;

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
      setCollapsedFiles((prev: any) => {
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
      // A thread jump moves the same Diff cursor used by ArrowUp/Down. Cancel
      // stale scheduled selection work, but keep the old caret painted until
      // commitDiffThreadCursor atomically replaces it with the target thread.
      clearLineSelectionForNav(true);

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

      const active = mappedComments[idx];
      commitDiffThreadCursor(active?.id ?? id, idx);
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
    commitDiffThreadCursor(active?.id ?? pending.commentId, idx);
    scrollMappedCommentIntoView(active);
  }, [
    mappedComments,
    virtualRows,
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

  /** Make a review-thread jump the authoritative Diff cursor for ArrowUp/Down. */
  function commitDiffThreadCursor(
    rootId: string | number | null | undefined,
    nextCommentIndex: number
  ): number {
    const id = rootId == null ? '' : String(rootId);
    const list = Array.isArray(virtualRowsRef.current)
      ? virtualRowsRef.current
      : [];
    const arrIdx = id ? findThreadArrayIndex(id) : -1;
    const pinned =
      arrIdx >= 0 && typeof beginSelectionOnRow === 'function'
        ? beginSelectionOnRow(list[arrIdx], 'RIGHT', arrIdx)
        : null;

    // One store commit keeps thread chrome, comment index, and the Arrow caret
    // on one cursor; separate setters let an Arrow frame observe the old row.
    useModalStore.setState({
      commentIndex: nextCommentIndex,
      activeDiffCommentId: rootId ?? null,
      focusedThreadUnitId: null,
      lineSelection: pinned,
    });
    try {
      document.documentElement.removeAttribute('data-prp-focused-thread-unit');
    } catch {
      /* ignore */
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
    setCollapsedFiles((prev: any) =>
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
    setCollapsedFiles((prev: any) =>
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

  return {
    activeSearchHit, activeSearchOccurrence, applyGotoQuery, applyHideWhitespace, applyReviewFilterToggle, avgH, conversationCommentPageItems, expandFileForJump, getDiffScrollMetrics, isMultiReplyThreadFocused, jumpToReviewComment, mappedComments, navComment, navConversationComment, navFile, navSearch, noteDiffNavActivity, onSearchClose, onSearchLoadComments, onSearchNext, onSearchPrev, onSearchQueryCommit, onVirtualMetricsChange, optArrowScrollSelect, patchDiffReviewFilter, pendingCommentJumpRef, pendingGotoRef, searchBusy, repliesForRootCommentId, rowOffsetList, scheduleDiffReviewFilter, scrollConversationPanel, scrollDiffPage, scrollDiffThreadUnitIntoView, scrollFocusedThreadUnitIntoView, scrollSelectionIntoView, searchMatchRows, setActiveFileCollapse, setActiveFilePathForNav, showLoadComments, stepThreadReply, toggleActiveFileCollapse, toggleViewedActiveFile, tryReenterExitedMultiReply
  };
}
