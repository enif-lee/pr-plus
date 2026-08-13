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
/** threads+gap */
export function useThreadCommentsAndGap(b: any) {
  const detailProp = b.detailProp;
  const onLoadReviewThreadComments = b.onLoadReviewThreadComments;
  const setDiffFileLines = b.setDiffFileLines;
  const setDiffExpandedRanges = b.setDiffExpandedRanges;
  const setDiffExpandBusyKey = b.setDiffExpandBusyKey;
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
  const applyMilestoneNumber = b.applyMilestoneNumber;
  const applyOptArrowScrollSelect = b.applyOptArrowScrollSelect;
  const applyRerequestReviewers = b.applyRerequestReviewers;
  const applyReviewFilterToggle = b.applyReviewFilterToggle;
  const applySelectionKeyboardMove = b.applySelectionKeyboardMove;
  const applyThreadReplyStep = b.applyThreadReplyStep;
  const armNativeTextSelectCopy = b.armNativeTextSelectCopy;
  const asideToggleRef = b.asideToggleRef;
  const assigneeAddRef = b.assigneeAddRef;
  const autoExpandOnFileNav = b.autoExpandOnFileNav;
  const avgH = b.avgH;
  const baseBranchRef = b.baseBranchRef;
  const changeRegionIndexRef = b.changeRegionIndexRef;
  const clearConversationCommentFocus = b.clearConversationCommentFocus;
  const clearDiffThreadFocusIfNeeded = b.clearDiffThreadFocusIfNeeded;
  const clearLineSelectionForNav = b.clearLineSelectionForNav;
  const clearSelectionActionsTimer = b.clearSelectionActionsTimer;
  const closeConfirm = b.closeConfirm;
  const closePicker = b.closePicker;
  const closeTimerRef = b.closeTimerRef;
  const closing = b.closing;
  const closingRef = b.closingRef;
  const collapseDiff = b.collapseDiff;
  const collapseInitRef = b.collapseInitRef;
  const collapsedFiles = b.collapsedFiles;
  const collectPeopleLogins = b.collectPeopleLogins;
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
  const contextThreadActionsRef = b.contextThreadActionsRef;
  const conversationCommentFocusRef = b.conversationCommentFocusRef;
  const conversationCommentPageItems = b.conversationCommentPageItems;
  const conversationNavRafRef = b.conversationNavRafRef;
  const conversationScrollerEl = b.conversationScrollerEl;
  const copySelectionCode = b.copySelectionCode;
  const copySelectionUrl = b.copySelectionUrl;
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
  const setDiffThreadCollapse = b.setDiffThreadCollapse;
  const disarmNativeTextSelectCopy = b.disarmNativeTextSelectCopy;
  const dismissSelectionIsland = b.dismissSelectionIsland;
  const displayFiles = b.displayFiles;
  const displayPathSet = b.displayPathSet;
  const editingBody = b.editingBody;
  const editingComment = b.editingComment;
  const editorSaveRef = b.editorSaveRef;
  const embedChrome = b.embedChrome;
  const ensureAllCommits = b.ensureAllCommits;
  const ensureAllFiles = b.ensureAllFiles;
  const ensureDiffContextThread = b.ensureDiffContextThread;
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
  const finishNativeTextSelectCopy = b.finishNativeTextSelectCopy;
  const flushSelectionKeyboardMove = b.flushSelectionKeyboardMove;
  const focusCommentBox = b.focusCommentBox;
  const focusConversationCommentItem = b.focusConversationCommentItem;
  const getActiveDiffContextThread = b.getActiveDiffContextThread;
  const getChangeRegionIndexForList = b.getChangeRegionIndexForList;
  const getDiffScrollMetrics = b.getDiffScrollMetrics;
  const ghCommitRouteAppliedRef = b.ghCommitRouteAppliedRef;
  const ghSelectionAppliedRef = b.ghSelectionAppliedRef;
  const handoffThreadExitToSelection = b.handoffThreadExitToSelection;
  const hasServerPending = b.hasServerPending;
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
  const navigateAdjacentPr = b.navigateAdjacentPr;
  const noteDiffNavActivity = b.noteDiffNavActivity;
  const onDeleteHeadBranch = b.onDeleteHeadBranch;
  const onFileHeaderComment = b.onFileHeaderComment;
  const onFileNavResizeStart = b.onFileNavResizeStart;
  const onLeaveReviewAction = b.onLeaveReviewAction;
  const onLoadReactors = b.onLoadReactors;
  const onModalResizeStart = b.onModalResizeStart;
  const onRegisterAsideToggle = b.onRegisterAsideToggle;
  const onRegisterContextThreadActions = b.onRegisterContextThreadActions;
  const onRerequestReview = b.onRerequestReview;
  const onRerequestReviewer = b.onRerequestReviewer;
  const onSearchClose = b.onSearchClose;
  const onSearchLoadComments = b.onSearchLoadComments;
  const onSearchNext = b.onSearchNext;
  const onSearchPrev = b.onSearchPrev;
  const onSearchQueryCommit = b.onSearchQueryCommit;
  const onSelectFile = b.onSelectFile;
  const onSelectionEnd = b.onSelectionEnd;
  const onSelectionExtend = b.onSelectionExtend;
  const onSelectionStart = b.onSelectionStart;
  const onSetMilestone = b.onSetMilestone;
  const onSheetResizeStart = b.onSheetResizeStart;
  const onSubmitSelectionCommentImmediate = b.onSubmitSelectionCommentImmediate;
  const onSubmitSelectionCommentPending = b.onSubmitSelectionCommentPending;
  const onToggleDiff = b.onToggleDiff;
  const onToggleDir = b.onToggleDir;
  const onToggleFileCollapse = b.onToggleFileCollapse;
  const onToggleFileNavCollapse = b.onToggleFileNavCollapse;
  const onToggleReaction = b.onToggleReaction;
  const onToggleShell = b.onToggleShell;
  const onToggleShellFullscreen = b.onToggleShellFullscreen;
  const onUploadFile = b.onUploadFile;
  const onVirtualMetricsChange = b.onVirtualMetricsChange;
  const openMilestonePicker = b.openMilestonePicker;
  const openRerequestReviewerPicker = b.openRerequestReviewerPicker;
  const openStackOrListPr = b.openStackOrListPr;
  const optArrowRafRef = b.optArrowRafRef;
  const optArrowScrollSelect = b.optArrowScrollSelect;
  const optHeldRef = b.optHeldRef;
  const optHintsSuppressedRef = b.optHintsSuppressedRef;
  const overlayRef = b.overlayRef;
  const pageScrollRafRef = b.pageScrollRafRef;
  const paletteCommands = b.paletteCommands;
  const paletteHelpOpen = b.paletteHelpOpen;
  const paletteOpen = b.paletteOpen;
  const patchDiffReviewFilter = b.patchDiffReviewFilter;
  const pendingCommentJumpRef = b.pendingCommentJumpRef;
  const pendingConversationNavDeltaRef = b.pendingConversationNavDeltaRef;
  const pendingCount = b.pendingCount;
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
  const persistModalSize = b.persistModalSize;
  const persistSheetWidth = b.persistSheetWidth;
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
  const postSelectionLineComment = b.postSelectionLineComment;
  const prIdentity = b.prIdentity;
  const prTags = b.prTags;
  const prTagsError = b.prTagsError;
  const prTagsLoading = b.prTagsLoading;
  const pullRequestGqlIdRef = b.pullRequestGqlIdRef;
  const readActiveFilePath = b.readActiveFilePath;
  const readFocusedThreadUnitStamp = b.readFocusedThreadUnitStamp;
  const readScrollTop = b.readScrollTop;
  const readViewportHeight = b.readViewportHeight;
  const refreshDetail = b.refreshDetail;
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
  const runContextThreadAction = b.runContextThreadAction;
  const runDiffContextThreadAction = b.runDiffContextThreadAction;
  const runPaletteCommand = b.runPaletteCommand;
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
  const searchPalettePrs = b.searchPalettePrs;
  const searchQuery = b.searchQuery;
  const selectingRef = b.selectingRef;
  const selectionActionMessage = b.selectionActionMessage;
  const selectionActionsTimerRef = b.selectionActionsTimerRef;
  const selectionHoverRevealRef = b.selectionHoverRevealRef;
  const selectionIslandLeaving = b.selectionIslandLeaving;
  const selectionIslandPhase = b.selectionIslandPhase;
  const selectionIslandPhaseRef = b.selectionIslandPhaseRef;
  const selectionMoveRafRef = b.selectionMoveRafRef;
  const selectionNavBusyRef = b.selectionNavBusyRef;
  const serverPendingComments = b.serverPendingComments;
  const serverPendingReviewId = b.serverPendingReviewId;
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
  const stackItems = b.stackItems;
  const stackPath = b.stackPath;
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
  const toggleSidePanel = b.toggleSidePanel;
  const toggleViewedActiveFile = b.toggleViewedActiveFile;
  const totalPendingCount = b.totalPendingCount;
  const tryReenterExitedMultiReply = b.tryReenterExitedMultiReply;
  const uiLanguagePref = b.uiLanguagePref;
  const uiRef = b.uiRef;
  const unresolvedThreadCounts = b.unresolvedThreadCounts;
  const uriWasOpenRef = b.uriWasOpenRef;
  const viewedPaths = b.viewedPaths;
  const viewportHeightRef = b.viewportHeightRef;
  const viewportSize = b.viewportSize;
  const virtualRows = b.virtualRows;
  const virtualRowsRef = b.virtualRowsRef;
  const visibleConvThreadNodeIdsRef = b.visibleConvThreadNodeIdsRef;
  const walkReviewCommentToRootId = b.walkReviewCommentToRootId;

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
      const legacy = String(commentId ?? '');
      if (legacy && legacy !== key) next.set(legacy, nextCollapsed);
      return next;
    });
    if (!nextCollapsed && tid) {
      void ensureThreadCommentsLoaded(tid);
    }
  }

  return {
    collapseKeyForThread, ensureThreadCommentsLoaded, isDiffThreadCollapsed, onExpandDiffGap, onToggleThreadCollapse, resolveThreadNodeIdFromCommentId, lazyLoadingThreadIds
  };
}
