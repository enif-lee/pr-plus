/**
 * Modal UI data groups — selective subscription helpers.
 *
 * Goal: updating one group re-renders only consumers of that group.
 * Composition root (PrModalApp) must not subscribe to high-frequency
 * fields (scroll metrics, draft text, palette query); leaves do.
 *
 * Groups:
 *   shell     — layoutMode, diffMode, animClass
 *   scroll    — scrollTop, viewportHeight (Diff list only)
 *   search    — searchOpen/query/hits/index
 *   selection — lineSelection island drafts/phases
 *   drafts    — commentText, replyDrafts, selectionDraft
 *   chrome    — palette, picker, action toast, editing flags
 *   files     — activeFilePath, collapsed/expanded, fileQuery, viewed
 *   review    — pendingReview, commentIndex, activeDiffCommentId
 *   focus     — conversation focus/pending nav, optHintsActive
 */
import { useModalStore, useShallow } from './modal-store';
import type { ModalUiState } from './modal-store';

/** Stable action refs — never cause re-render when identity-stable. */
export function useModalActions() {
  return useModalStore(
    useShallow((s) => ({
      setLayoutMode: s.setLayoutMode,
      toggleDiffLayout: s.toggleDiffLayout,
      setDiffMode: s.setDiffMode,
      setScrollTop: s.setScrollTop,
      setViewportHeight: s.setViewportHeight,
      setSearchOpen: s.setSearchOpen,
      setSearchQuery: s.setSearchQuery,
      setSearchHits: s.setSearchHits,
      setSearchHitIndex: s.setSearchHitIndex,
      setActiveFilePath: s.setActiveFilePath,
      setAnimClass: s.setAnimClass,
      setCommentText: s.setCommentText,
      setActionBusy: s.setActionBusy,
      setActionMsg: s.setActionMsg,
      setCollapsedFiles: s.setCollapsedFiles,
      setExpandedDirs: s.setExpandedDirs,
      setCommentIndex: s.setCommentIndex,
      setLineSelection: s.setLineSelection,
      setSelecting: s.setSelecting,
      setSelectionDraft: s.setSelectionDraft,
      setShowSelectionComposer: s.setShowSelectionComposer,
      setSelectionIslandLeaving: s.setSelectionIslandLeaving,
      setFileQuery: s.setFileQuery,
      setViewedPaths: s.setViewedPaths,
      setReplyDraft: s.setReplyDraft,
      setPendingReview: s.setPendingReview,
      setTimelinePage: s.setTimelinePage,
      setEditingBody: s.setEditingBody,
      setEditingComment: s.setEditingComment,
      setPaletteOpen: s.setPaletteOpen,
      setPaletteQuery: s.setPaletteQuery,
      setPicker: s.setPicker,
      setFocusedConversationAnchor: s.setFocusedConversationAnchor,
      requestConversationNav: s.requestConversationNav,
      setOptHintsActive: s.setOptHintsActive,
      setActiveDiffCommentId: s.setActiveDiffCommentId,
      resetForClose: s.resetForClose,
      hydrateLocalDetail: s.hydrateLocalDetail,
    }))
  );
}

export function useShellLayoutGroup() {
  return useModalStore(
    useShallow((s) => ({
      layoutMode: s.layoutMode,
      diffMode: s.diffMode,
      animClass: s.animClass,
    }))
  );
}

/** Diff scroller metrics — only DiffWorkspace / VirtualDiff should subscribe. */
export function useScrollMetricsGroup() {
  return useModalStore(
    useShallow((s) => ({
      scrollTop: s.scrollTop,
      viewportHeight: s.viewportHeight,
    }))
  );
}

/** Imperative read (callbacks) — does not subscribe. */
export function getScrollMetrics() {
  const s = useModalStore.getState();
  return { scrollTop: s.scrollTop, viewportHeight: s.viewportHeight };
}

export function useSearchGroup() {
  return useModalStore(
    useShallow((s) => ({
      searchOpen: s.searchOpen,
      searchQuery: s.searchQuery,
      searchHits: s.searchHits,
      searchHitIndex: s.searchHitIndex,
    }))
  );
}

export function useSelectionIslandGroup() {
  return useModalStore(
    useShallow((s) => ({
      selectionDraft: s.selectionDraft,
      showSelectionComposer: s.showSelectionComposer,
      selectionIslandLeaving: s.selectionIslandLeaving,
      lineSelection: s.lineSelection,
      selecting: s.selecting,
    }))
  );
}

export function useFileNavGroup() {
  return useModalStore(
    useShallow((s) => ({
      activeFilePath: s.activeFilePath,
      fileQuery: s.fileQuery,
      collapsedFiles: s.collapsedFiles,
      expandedDirs: s.expandedDirs,
      viewedPaths: s.viewedPaths,
    }))
  );
}

export function useChromeOverlayGroup() {
  return useModalStore(
    useShallow((s) => ({
      paletteOpen: s.paletteOpen,
      paletteQuery: s.paletteQuery,
      picker: s.picker,
      actionBusy: s.actionBusy,
      actionMsg: s.actionMsg,
      actionMsgSeq: s.actionMsgSeq,
      editingBody: s.editingBody,
      editingComment: s.editingComment,
    }))
  );
}

export function usePendingReviewGroup() {
  return useModalStore(
    useShallow((s) => ({
      pendingReview: s.pendingReview,
      commentIndex: s.commentIndex,
      activeDiffCommentId: s.activeDiffCommentId,
    }))
  );
}

/** Fields that must NOT be subscribed at composition root for high-frequency updates. */
export const ROOT_FORBIDDEN_HIGH_FREQ_FIELDS: (keyof ModalUiState)[] = [
  'scrollTop',
  'selectionDraft',
  'replyDrafts',
  'paletteQuery',
  'commentText',
  'searchQuery',
  'fileQuery',
  'actionMsg',
];
