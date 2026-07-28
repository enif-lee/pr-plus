/**
 * Diff layout workspace: file tree + resizer + DiffToolbar + VirtualDiff.
 * Feature-local composition under views/pr-modal (not mid-function parts).
 */
import React from 'react';
import { FolderFileTree } from '../diff/FolderFileTree';
import { VirtualDiff } from '../diff/VirtualDiff';
import { SelectionCommentBar } from '../diff/SelectionCommentBar';
import { DiffToolbar } from '../chrome/DiffToolbar';
import { DiffFloatingController } from '../diff/DiffFloatingController';
import {
  clampFileNavWidth,
  fileNavGridTemplate,
} from '../../lib/file-nav-layout';
import {
  useScrollMetricsGroup,
  useSelectionIslandGroup,
} from '../../store/data-groups';
import { useModalStore } from '../../store/modal-store';

export type DiffWorkspaceProps = {
  fileNav: { collapsed: boolean; width: number };
  displayFiles: any[];
  reviewScopedFiles: any[];
  fileTree: any;
  expandedDirs: any;
  onToggleDir: any;
  activeFilePath: string | null;
  onSelectFile: any;
  collapsedFiles: any;
  onToggleFileCollapse: any;
  fileQuery: string;
  setFileQuery: (q: string) => void;
  ensureAllFiles: () => void | Promise<void>;
  fileListLoading: boolean;
  fileExtFilter: Set<string>;
  setFileExtFilter: any;
  fileUnreadOnly: boolean;
  setFileUnreadOnly: any;
  threadCounts: any;
  viewedPaths: any;
  onToggleViewed: any;
  onToggleFileNavCollapse: () => void;
  activeFileNavIndex: any;
  navFile: (dir: number) => void;
  onFileNavResizeStart: (e: React.PointerEvent) => void;
  // toolbar + diff
  detail: any;
  virtualRows: any[];
  diffFilesOverride: any;
  diffReviewFilter: any;
  diffMode: string;
  setDiffMode: (m: string) => void;
  setScrollTop?: (n: number) => void;
  listRef: React.RefObject<HTMLElement | null>;
  hasAnyReviewThreads: (c: any) => boolean;
  totalPendingCount: number;
  reviewThreadTotals: { unresolved: number; resolved: number };
  setDiffReviewFilter: any;
  detailCommits: any[];
  diffCommitFilter: any;
  applyDiffCommitFilter: any;
  ensureAllCommits: () => void | Promise<void>;
  diffCommitLoading: boolean;
  commitListLoading: boolean;
  diffCommitError: any;
  diffCommitLabel: string;
  onFetchCompareFiles: any;
  mappedComments: any[];
  commentIndex: number;
  navComment: (dir: number) => void;
  pendingCount: number;
  onDiscardPending: any;
  onLeaveReviewAction: any;
  actionBusy: any;
  actionMsg: any;
  themeMode: string;
  onUploadFile: any;
  mentionCandidates: any[];
  openPulls: any[];
  searchOpen: boolean;
  layoutIsDiff: boolean;
  searchQuery: string;
  searchHits: any;
  searchHitIndex: number;
  searchInputRef: any;
  searchBusy: boolean;
  showLoadComments: boolean;
  onSearchLoadComments: any;
  loadStage: any;
  onSearchQueryCommit: any;
  onSearchClose: any;
  onSearchNext: any;
  onSearchPrev: any;
  scrollDiffPage: (dir: number) => void;
  applyGotoQuery: (q: string) => void;
  /** Optional overrides; default: leaf-subscribe useScrollMetricsGroup */
  scrollTop?: number;
  viewportHeight?: number;
  setViewportHeight?: (h: number) => void;
  hit: any;
  searchMatchRows: any;
  activeSearchHit: any;
  activeSearchOccurrence: any;
  onSelectionStart: any;
  onSelectionExtend: any;
  onSelectionEnd: any;
  onFileHeaderComment: any;
  onExpandDiffGap: any;
  diffExpandBusyKey: any;
  threadsByCommentId: any;
  onReplyToThread: any;
  onResolveThread: any;
  onDeleteReviewComment: any;
  onStartEditReviewComment: any;
  onSaveEditComment: any;
  setEditingComment: any;
  editingComment: any;
  editorSaveRef: any;
  onApplySuggestion: any;
  applyActionRef: any;
  isDiffCommentCollapsed: any;
  onToggleThreadCollapse: any;
  commentHeightOpts: any;
  showSelectionComposer: boolean;
  selectionIslandLeaving: boolean;
  /** Optional; default leaf-subscribe selection island group */
  selectionDraft?: any;
  setSelectionDraft?: any;
  onSubmitSelectionCommentImmediate: any;
  onSubmitSelectionCommentPending: any;
  dismissSelectionIsland: any;
  selectionIslandPhase: any;
  setSelectionIslandPhase: any;
  setActionMsg: (msg: string) => void;
};

export function DiffWorkspace(p: DiffWorkspaceProps) {
  // Leaf data groups — typing / scroll metrics re-render this shell only, not PrModalApp.
  const scrollMetrics = useScrollMetricsGroup();
  const selectionIsland = useSelectionIslandGroup();
  const setScrollTopStore = useModalStore((s) => s.setScrollTop);
  const setViewportHeightStore = useModalStore((s) => s.setViewportHeight);
  const setSelectionDraftStore = useModalStore((s) => s.setSelectionDraft);

  const {
    fileNav,
    displayFiles,
    reviewScopedFiles,
    fileTree,
    expandedDirs,
    onToggleDir,
    activeFilePath,
    onSelectFile,
    collapsedFiles,
    onToggleFileCollapse,
    fileQuery,
    setFileQuery,
    ensureAllFiles,
    fileListLoading,
    fileExtFilter,
    setFileExtFilter,
    fileUnreadOnly,
    setFileUnreadOnly,
    threadCounts,
    viewedPaths,
    onToggleViewed,
    onToggleFileNavCollapse,
    activeFileNavIndex,
    navFile,
    onFileNavResizeStart,
    detail,
    virtualRows,
    diffFilesOverride,
    diffReviewFilter,
    diffMode,
    setDiffMode,
    setScrollTop: setScrollTopProp,
    listRef,
    hasAnyReviewThreads,
    totalPendingCount,
    reviewThreadTotals,
    setDiffReviewFilter,
    detailCommits,
    diffCommitFilter,
    applyDiffCommitFilter,
    ensureAllCommits,
    diffCommitLoading,
    commitListLoading,
    diffCommitError,
    diffCommitLabel,
    onFetchCompareFiles,
    mappedComments,
    commentIndex,
    navComment,
    pendingCount,
    onDiscardPending,
    onLeaveReviewAction,
    actionBusy,
    actionMsg,
    themeMode,
    onUploadFile,
    mentionCandidates,
    openPulls,
    searchOpen,
    layoutIsDiff,
    searchQuery,
    searchHits,
    searchHitIndex,
    searchInputRef,
    searchBusy,
    showLoadComments,
    onSearchLoadComments,
    loadStage,
    onSearchQueryCommit,
    onSearchClose,
    onSearchNext,
    onSearchPrev,
    scrollDiffPage,
    applyGotoQuery,
    scrollTop: scrollTopProp,
    viewportHeight: viewportHeightProp,
    setViewportHeight: setViewportHeightProp,
    hit,
    searchMatchRows,
    activeSearchHit,
    activeSearchOccurrence,
    onSelectionStart,
    onSelectionExtend,
    onSelectionEnd,
    onFileHeaderComment,
    onExpandDiffGap,
    diffExpandBusyKey,
    threadsByCommentId,
    onReplyToThread,
    onResolveThread,
    onDeleteReviewComment,
    onStartEditReviewComment,
    onSaveEditComment,
    setEditingComment,
    editingComment,
    editorSaveRef,
    onApplySuggestion,
    applyActionRef,
    isDiffCommentCollapsed,
    onToggleThreadCollapse,
    commentHeightOpts,
    showSelectionComposer,
    selectionIslandLeaving,
    selectionDraft: selectionDraftProp,
    setSelectionDraft: setSelectionDraftProp,
    onSubmitSelectionCommentImmediate,
    onSubmitSelectionCommentPending,
    dismissSelectionIsland,
    selectionIslandPhase,
    setSelectionIslandPhase,
    setActionMsg,
  } = p;

  const scrollTop =
    scrollTopProp != null && Number.isFinite(Number(scrollTopProp))
      ? Number(scrollTopProp)
      : scrollMetrics.scrollTop;
  const viewportHeight =
    viewportHeightProp != null && Number.isFinite(Number(viewportHeightProp))
      ? Number(viewportHeightProp)
      : scrollMetrics.viewportHeight;
  const setScrollTop = setScrollTopProp || setScrollTopStore;
  const setViewportHeight = setViewportHeightProp || setViewportHeightStore;
  const selectionDraft =
    selectionDraftProp !== undefined
      ? selectionDraftProp
      : selectionIsland.selectionDraft;
  const setSelectionDraft = setSelectionDraftProp || setSelectionDraftStore;

  const magicLinks =
    detail.magicLinks?.length
      ? detail.magicLinks
      : (openPulls || []).find(
          (x) => Number(x.number) === Number(detail.number)
        )?.magicLinks || [];

  return (
    <div
      className={`prp-diff-layout flex min-h-0 flex-1${
        fileNav.collapsed ? ' prp-diff-layout--nav-collapsed' : ''
      }`}
      style={
        {
          gridTemplateColumns: fileNavGridTemplate(fileNav),
          ['--prp-file-nav-width' as any]: fileNav.collapsed
            ? '0px'
            : `${clampFileNavWidth(fileNav.width)}px`,
          ['--prp-file-nav-resizer' as any]: fileNav.collapsed ? '0px' : '4px',
        } as React.CSSProperties
      }
      data-file-nav-collapsed={fileNav.collapsed ? '1' : '0'}
      data-file-nav-width={clampFileNavWidth(fileNav.width)}
    >
      <FolderFileTree
        files={displayFiles}
        extSourceFiles={reviewScopedFiles}
        tree={fileTree}
        expandedDirs={expandedDirs}
        onToggleDir={onToggleDir}
        activePath={activeFilePath}
        onSelect={onSelectFile}
        collapsedFiles={collapsedFiles}
        onToggleFileCollapse={onToggleFileCollapse}
        fileQuery={fileQuery}
        onFileQuery={setFileQuery}
        onSearchFocus={() => {
          void ensureAllFiles();
        }}
        filesLoading={fileListLoading}
        selectedExts={fileExtFilter}
        onSelectedExts={setFileExtFilter}
        unreadOnly={fileUnreadOnly}
        onUnreadOnly={setFileUnreadOnly}
        threadCounts={threadCounts}
        viewedPaths={viewedPaths}
        onToggleViewed={onToggleViewed}
        navCollapsed={fileNav.collapsed}
        onToggleNavCollapse={onToggleFileNavCollapse}
        fileIndex={
          typeof activeFileNavIndex === 'function'
            ? activeFileNavIndex(displayFiles, activeFilePath)
            : -1
        }
        fileTotal={displayFiles.length}
        onPrevFile={() => navFile(-1)}
        onNextFile={() => navFile(1)}
      />
      <div
        className="prp-file-nav-resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize files navigator"
        aria-valuenow={clampFileNavWidth(fileNav.width)}
        aria-valuemin={160}
        aria-valuemax={520}
        data-collapsed={fileNav.collapsed ? '1' : '0'}
        onPointerDown={onFileNavResizeStart}
        title="Drag to resize files navigator"
      />
      <div className="prp-diff-pane flex min-w-0 flex-1 flex-col">
        <DiffToolbar
          detail={detail}
          fileNavCollapsed={fileNav.collapsed}
          onToggleFileNav={onToggleFileNavCollapse}
          annotatedFileCount={displayFiles.length}
          rowCount={virtualRows.length}
          filtered={
            Boolean(diffFilesOverride) ||
            Boolean(diffReviewFilter) ||
            Boolean(String(fileQuery || '').trim()) ||
            fileExtFilter.size > 0 ||
            fileUnreadOnly
          }
          diffMode={diffMode}
          reviewFilter={diffReviewFilter}
          onReviewFilter={setDiffReviewFilter}
          showReviewFilter={
            hasAnyReviewThreads(threadCounts) || totalPendingCount > 0
          }
          unresolvedCount={reviewThreadTotals.unresolved}
          resolvedCount={reviewThreadTotals.resolved}
          onDiffMode={(mode: string) => {
            setDiffMode(mode);
            setScrollTop(0);
            if (listRef.current) listRef.current.scrollTop = 0;
          }}
          commits={detailCommits}
          commitFilter={diffCommitFilter}
          onCommitFilter={applyDiffCommitFilter}
          onOpenCommitPicker={() => {
            void ensureAllCommits();
          }}
          commitLoading={diffCommitLoading || commitListLoading}
          commitError={diffCommitError}
          commitLabel={diffCommitLabel}
          commitDisabled={!onFetchCompareFiles}
          comments={mappedComments}
          commentIndex={commentIndex}
          onPrevComment={() => navComment(-1)}
          onNextComment={() => navComment(1)}
          pendingBatch={null}
          pendingServerCount={pendingCount}
          totalPendingCount={totalPendingCount}
          onDiscardPending={onDiscardPending}
          onLeaveReviewAction={onLeaveReviewAction}
          actionBusy={actionBusy}
          actionMsg={actionMsg}
          colorMode={themeMode}
          onUploadFile={onUploadFile}
          mentionCandidates={mentionCandidates}
          linkCtx={{
            owner: detail.owner,
            repo: detail.repo,
            magicLinks,
          }}
          searchOpen={searchOpen && layoutIsDiff}
          searchQuery={searchQuery}
          searchHits={searchHits}
          searchHitIndex={searchHitIndex}
          searchInputRef={searchInputRef}
          searchBusy={searchBusy}
          showSearchLoadComments={showLoadComments}
          onSearchLoadComments={onSearchLoadComments}
          searchLoadCommentsBusy={Boolean(
            loadStage?.busy && loadStage?.phase === 'threads'
          )}
          onSearchChange={onSearchQueryCommit}
          onSearchClose={onSearchClose}
          onSearchNext={onSearchNext}
          onSearchPrev={onSearchPrev}
        />
        <DiffFloatingController
          onPrevFile={() => navFile(-1)}
          onNextFile={() => navFile(1)}
          onPrevPage={() => scrollDiffPage(-1)}
          onNextPage={() => scrollDiffPage(1)}
          onGoto={(q: string) => applyGotoQuery(q)}
          isMac={
            typeof navigator !== 'undefined' &&
            /Mac|iPhone|iPad/.test(navigator.platform || '')
          }
        />
        <VirtualDiff
          virtualRows={virtualRows}
          scrollTop={scrollTop}
          viewportHeight={viewportHeight}
          onViewportHeight={(h: number) => {
            if (h > 0 && Math.abs(h - viewportHeight) >= 4) {
              setViewportHeight(h);
            }
          }}
          listRef={listRef}
          activeFilePath={activeFilePath}
          highlightRowIndex={
            hit?.rowIndex ??
            (commentIndex >= 0 ? mappedComments[commentIndex]?.rowIndex : undefined)
          }
          searchQuery={(searchQuery || '').trim()}
          searchMatchRows={searchMatchRows}
          activeSearchHit={hit}
          activeSearchOccurrence={activeSearchOccurrence}
          searchHits={searchHits}
          searchHitIndex={searchHitIndex}
          onScroll={undefined}
          onSelectionStart={onSelectionStart}
          onSelectionExtend={onSelectionExtend}
          onSelectionEnd={onSelectionEnd}
          onFileComment={onFileHeaderComment}
          onToggleCollapse={onToggleFileCollapse}
          onExpandGap={onExpandDiffGap}
          expandBusyKey={diffExpandBusyKey}
          viewedPaths={viewedPaths}
          onToggleViewed={onToggleViewed}
          threadsByCommentId={threadsByCommentId}
          onReply={onReplyToThread}
          pendingCount={totalPendingCount}
          onResolve={onResolveThread}
          onDeleteReviewComment={onDeleteReviewComment}
          onEditReviewComment={onStartEditReviewComment}
          onSaveEditReviewComment={(id, body) =>
            onSaveEditComment('review', id, body)
          }
          onCancelEditReviewComment={() => setEditingComment(null)}
          editingCommentId={
            editingComment?.kind === 'review' ? editingComment.id : null
          }
          onRegisterEditorSave={(fn) => {
            editorSaveRef.current = fn;
          }}
          onApplySuggestion={onApplySuggestion}
          onRegisterApply={(fn) => {
            applyActionRef.current = fn;
          }}
          actionBusy={actionBusy}
          viewerLogin={detail.viewerLogin}
          prOpen={detail.state === 'open'}
          linkCtx={{
            owner: detail.owner,
            repo: detail.repo,
            magicLinks,
          }}
          onUploadFile={onUploadFile}
          mentionCandidates={mentionCandidates}
          isThreadCollapsed={isDiffCommentCollapsed}
          onToggleThreadCollapse={onToggleThreadCollapse}
          commentHeightOpts={commentHeightOpts}
          selectionIsland={
            showSelectionComposer || selectionIslandLeaving ? (
              <SelectionCommentBar
                draft={selectionDraft}
                onDraft={setSelectionDraft}
                onSubmitImmediate={onSubmitSelectionCommentImmediate}
                onSubmitPending={onSubmitSelectionCommentPending}
                onCancel={() => dismissSelectionIsland()}
                actionBusy={actionBusy}
                leaving={selectionIslandLeaving}
                pendingCount={totalPendingCount}
                onUploadFile={onUploadFile}
                mentionCandidates={mentionCandidates}
                virtualRows={virtualRows}
                detail={detail}
                phase={selectionIslandPhase}
                onPhaseChange={setSelectionIslandPhase}
                onCopyFeedback={(msg: string) =>
                  setActionMsg(String(msg || ''))
                }
                linkCtx={{
                  owner: detail.owner,
                  repo: detail.repo,
                  magicLinks: detail.magicLinks || [],
                }}
              />
            ) : null
          }
        />
      </div>
    </div>
  );
}
