/**
 * Modal UI state (Zustand).
 *
 * Host still owns fetch/detail via props; this store holds interactive UI
 * (layout, selection, pending review, pickers, composers) so deep trees
 * subscribe selectively and avoid prop-drilling + full-tree re-renders.
 */
import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import type {
  DiffMode,
  LayoutMode,
  LineSelection,
  PendingReviewBatch,
  PickerState,
  PrDetail,
} from '../types';
import { createEmptyPendingReview } from '../lib/pending-review';
import { LAYOUT_CENTERED, LAYOUT_DIFF } from '../lib/layout-mode';

export interface ModalUiState {
  layoutMode: LayoutMode;
  diffMode: DiffMode;
  scrollTop: number;
  viewportHeight: number;
  searchOpen: boolean;
  searchQuery: string;
  searchHits: Array<{ rowIndex: number; [k: string]: unknown }>;
  searchHitIndex: number;
  activeFilePath: string | null;
  animClass: string;
  commentText: string;
  actionBusy: boolean;
  actionMsg: string;
  collapsedFiles: Set<string>;
  expandedDirs: Set<string>;
  commentIndex: number;
  lineSelection: LineSelection | null;
  selecting: boolean;
  selectionDraft: string;
  showSelectionComposer: boolean;
  selectionIslandLeaving: boolean;
  fileQuery: string;
  viewedPaths: Set<string>;
  replyDrafts: Record<string, string>;
  pendingReview: PendingReviewBatch;
  timelinePage: number;
  editingBody: boolean;
  editingComment: { kind: string; id: number | string } | null;
  paletteOpen: boolean;
  paletteQuery: string;
  picker: PickerState | null;
  /** Optimistic overlay; null means use host detail prop */
  localDetail: PrDetail | null;

  setLayoutMode: (m: LayoutMode) => void;
  toggleDiffLayout: () => void;
  setDiffMode: (m: DiffMode) => void;
  setScrollTop: (n: number) => void;
  setViewportHeight: (n: number) => void;
  setSearchOpen: (v: boolean) => void;
  setSearchQuery: (q: string) => void;
  setSearchHits: (hits: ModalUiState['searchHits'], index?: number) => void;
  setSearchHitIndex: (i: number) => void;
  setActiveFilePath: (p: string | null) => void;
  setAnimClass: (c: string) => void;
  setCommentText: (t: string) => void;
  setActionBusy: (v: boolean) => void;
  setActionMsg: (m: string) => void;
  setCollapsedFiles: (fn: any) => void;
  setExpandedDirs: (fn: any) => void;
  setCommentIndex: (i: number) => void;
  setLineSelection: (s: any) => void;
  setSelecting: (v: boolean) => void;
  setSelectionDraft: (t: string) => void;
  setShowSelectionComposer: (v: boolean) => void;
  setSelectionIslandLeaving: (v: boolean) => void;
  setFileQuery: (q: string) => void;
  setViewedPaths: (fn: any) => void;
  setReplyDraft: (id: string | number, text: string) => void;
  setPendingReview: (b: PendingReviewBatch | ((prev: PendingReviewBatch) => PendingReviewBatch)) => void;
  setTimelinePage: (p: number) => void;
  setEditingBody: (v: boolean) => void;
  setEditingComment: (v: ModalUiState['editingComment']) => void;
  setPaletteOpen: (v: boolean) => void;
  setPaletteQuery: (q: string) => void;
  setPicker: (p: any) => void;
  setLocalDetail: (d: PrDetail | null | ((prev: PrDetail | null) => PrDetail | null)) => void;
  resetForClose: () => void;
  hydrateLocalDetail: (detail: PrDetail | null | undefined) => void;
}

const emptyPending = (): PendingReviewBatch =>
  typeof createEmptyPendingReview === 'function'
    ? (createEmptyPendingReview() as PendingReviewBatch)
    : { comments: [], body: '' };

export const useModalStore = create<ModalUiState>((set, get) => ({
  layoutMode: LAYOUT_CENTERED as LayoutMode,
  diffMode: 'unified',
  scrollTop: 0,
  viewportHeight: 520,
  searchOpen: false,
  searchQuery: '',
  searchHits: [],
  searchHitIndex: -1,
  activeFilePath: null,
  animClass: '',
  commentText: '',
  actionBusy: false,
  actionMsg: '',
  collapsedFiles: new Set(),
  expandedDirs: new Set(),
  commentIndex: -1,
  lineSelection: null,
  selecting: false,
  selectionDraft: '',
  showSelectionComposer: false,
  selectionIslandLeaving: false,
  fileQuery: '',
  viewedPaths: new Set(),
  replyDrafts: {},
  pendingReview: emptyPending(),
  timelinePage: 1,
  editingBody: false,
  editingComment: null,
  paletteOpen: false,
  paletteQuery: '',
  picker: null,
  localDetail: null,

  setLayoutMode: (m) => set({ layoutMode: m }),
  toggleDiffLayout: () =>
    set((s) => ({
      layoutMode: s.layoutMode === LAYOUT_DIFF ? (LAYOUT_CENTERED as LayoutMode) : (LAYOUT_DIFF as LayoutMode),
      animClass: s.layoutMode === LAYOUT_DIFF ? 'prp-anim-collapse' : 'prp-anim-expand',
    })),
  setDiffMode: (m) => set({ diffMode: m, scrollTop: 0 }),
  setScrollTop: (n) => set({ scrollTop: n }),
  setViewportHeight: (n) => set({ viewportHeight: n }),
  setSearchOpen: (v) => set({ searchOpen: v }),
  setSearchQuery: (q) => set({ searchQuery: q }),
  setSearchHits: (hits, index) =>
    set({
      searchHits: hits,
      searchHitIndex: index !== undefined ? index : hits.length ? 0 : -1,
    }),
  setSearchHitIndex: (i) => set({ searchHitIndex: i }),
  setActiveFilePath: (p) => set({ activeFilePath: p }),
  setAnimClass: (c) => set({ animClass: c }),
  setCommentText: (t) => set({ commentText: t }),
  setActionBusy: (v) => set({ actionBusy: v }),
  setActionMsg: (m) => set({ actionMsg: m }),
  setCollapsedFiles: (fn) =>
    set((s) => ({
      collapsedFiles: typeof fn === 'function' ? (fn as any)(s.collapsedFiles) : (fn as Set<string>),
    })),
  setExpandedDirs: (fn) =>
    set((s) => ({
      expandedDirs: typeof fn === 'function' ? (fn as any)(s.expandedDirs) : (fn as Set<string>),
    })),
  setCommentIndex: (i) => set({ commentIndex: i }),
  setLineSelection: (s) =>
    set((prev) => ({
      lineSelection: typeof s === 'function' ? s(prev.lineSelection) : s,
    })),
  setSelecting: (v) => set({ selecting: v }),
  setSelectionDraft: (t) => set({ selectionDraft: t }),
  setShowSelectionComposer: (v) => set({ showSelectionComposer: v }),
  setSelectionIslandLeaving: (v) => set({ selectionIslandLeaving: v }),
  setFileQuery: (q) => set({ fileQuery: q }),
  setViewedPaths: (fn) =>
    set((s) => ({
      viewedPaths: typeof fn === 'function' ? (fn as any)(s.viewedPaths) : (fn as Set<string>),
    })),
  setReplyDraft: (id, text) =>
    set((s) => ({ replyDrafts: { ...s.replyDrafts, [String(id)]: text } })),
  setPendingReview: (b) =>
    set((s) => ({
      pendingReview: typeof b === 'function' ? b(s.pendingReview) : b,
    })),
  setTimelinePage: (p) => set({ timelinePage: p }),
  setEditingBody: (v) => set({ editingBody: v }),
  setEditingComment: (v) => set({ editingComment: v }),
  setPaletteOpen: (v) => set({ paletteOpen: v }),
  setPaletteQuery: (q) => set({ paletteQuery: q }),
  setPicker: (p) =>
    set((s) => ({ picker: typeof p === 'function' ? p(s.picker) : p })),
  setLocalDetail: (d) =>
    set((s) => ({
      localDetail: typeof d === 'function' ? d(s.localDetail) : d,
    })),
  hydrateLocalDetail: (detail) => {
    if (detail) set({ localDetail: detail });
  },
  resetForClose: () =>
    set({
      layoutMode: LAYOUT_CENTERED as LayoutMode,
      searchOpen: false,
      paletteOpen: false,
      picker: null,
      lineSelection: null,
      showSelectionComposer: false,
      editingBody: false,
      editingComment: null,
      commentText: '',
      actionMsg: '',
      pendingReview: emptyPending(),
    }),
}));

/** Selective subscription helper — re-export shallow for call sites */
export { useShallow };

export function useLayoutMode() {
  return useModalStore((s) => s.layoutMode);
}

export function useActionBusy() {
  return useModalStore((s) => s.actionBusy);
}
