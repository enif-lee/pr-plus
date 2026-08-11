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
  /** Bumps on each non-empty setActionMsg so identical toasts re-fire. */
  actionMsgSeq: number;
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
  /**
   * Conversation keyboard focus anchor (issue-comment:… / review-group:… /
   * review-comment:…). Visual ring only — set after scroll lands.
   * Stored so ⌥J/K does not re-render the whole conversation.
   */
  focusedConversationAnchor: string | null;
  /**
   * Pending ⌥J/K / seed target: scroller expands + scrolls first, then
   * promotes this into focusedConversationAnchor (ring).
   */
  pendingConversationNavAnchor: string | null;
  /**
   * Option-hold shortcut badges active. OptBtnHint subscribes; App toggles
   * overlay class via DOM so the conversation tree does not re-render.
   */
  optHintsActive: boolean;
  /**
   * Diff review-thread nav target (root comment id). Context tips only render
   * on the matching InlineThread — not every thread.
   */
  activeDiffCommentId: string | number | null;
  /**
   * Within the focused review thread: root or reply comment id for ↑/↓ unit
   * focus. Null = treat as root of the active thread.
   */
  focusedThreadUnitId: string | null;

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
  setFocusedConversationAnchor: (a: string | null) => void;
  /**
   * Scroll-then-focus: clear visual ring, queue pending anchor for scroller.
   * Pass null to clear both pending and focus.
   */
  requestConversationNav: (a: string | null) => void;
  setOptHintsActive: (v: boolean) => void;
  setActiveDiffCommentId: (id: string | number | null) => void;
  setFocusedThreadUnitId: (id: string | null) => void;
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
  actionMsgSeq: 0,
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
  focusedConversationAnchor: null,
  pendingConversationNavAnchor: null,
  optHintsActive: false,
  activeDiffCommentId: null,
  focusedThreadUnitId: null,

  setLayoutMode: (m) => set({ layoutMode: m }),
  toggleDiffLayout: () =>
    set((s) => ({
      layoutMode:
        s.layoutMode === LAYOUT_DIFF
          ? (LAYOUT_CENTERED as LayoutMode)
          : (LAYOUT_DIFF as LayoutMode),
      animClass: '',
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
  setActionMsg: (m) =>
    set((s) => {
      const msg = m == null ? '' : String(m);
      if (!msg) return { actionMsg: '' };
      return { actionMsg: msg, actionMsgSeq: (s.actionMsgSeq || 0) + 1 };
    }),
  setCollapsedFiles: (fn) =>
    set((s) => ({
      collapsedFiles: typeof fn === 'function' ? (fn as any)(s.collapsedFiles) : (fn as Set<string>),
    })),
  setExpandedDirs: (fn) =>
    set((s) => ({
      expandedDirs: typeof fn === 'function' ? (fn as any)(s.expandedDirs) : (fn as Set<string>),
    })),
  setCommentIndex: (i) => {
    set({ commentIndex: i, focusedThreadUnitId: null });
    // Keep DOM stamp in sync — stale data-prp-focused-thread-unit misleads e2e
    // and isMultiReplyThreadFocused DOM fallbacks after ⌥J/K root hops.
    try {
      if (typeof document !== 'undefined') {
        document.documentElement.removeAttribute(
          'data-prp-focused-thread-unit'
        );
      }
    } catch {
      /* ignore */
    }
  },
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
  setReplyDraft: (id, text) => {
    const k = String(id);
    const next = text == null ? '' : String(text);
    if (get().replyDrafts[k] === next) return;
    set((s) => ({ replyDrafts: { ...s.replyDrafts, [k]: next } }));
  },
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
  setFocusedConversationAnchor: (a) => {
    const next = a == null || a === '' ? null : String(a);
    const cur = get().focusedConversationAnchor;
    if (cur === next) return;
    set({ focusedConversationAnchor: next });
    // E2E / host observability: stamp active kb-focus target on <html>
    try {
      if (typeof document !== 'undefined') {
        if (next) {
          document.documentElement.setAttribute(
            'data-prp-focused-conv-anchor',
            next
          );
        } else {
          document.documentElement.removeAttribute(
            'data-prp-focused-conv-anchor'
          );
        }
      }
    } catch {
      /* ignore */
    }
  },
  requestConversationNav: (a) => {
    const next = a == null || a === '' ? null : String(a);
    if (!next) {
      set({
        focusedConversationAnchor: null,
        pendingConversationNavAnchor: null,
      });
      try {
        if (typeof document !== 'undefined') {
          document.documentElement.removeAttribute(
            'data-prp-focused-conv-anchor'
          );
          document.documentElement.removeAttribute(
            'data-prp-pending-conv-anchor'
          );
        }
      } catch {
        /* ignore */
      }
      return;
    }
    // Drop ring while scrolling; scroller promotes pending → focused.
    set({
      focusedConversationAnchor: null,
      pendingConversationNavAnchor: next,
    });
    try {
      if (typeof document !== 'undefined') {
        document.documentElement.removeAttribute(
          'data-prp-focused-conv-anchor'
        );
        document.documentElement.setAttribute(
          'data-prp-pending-conv-anchor',
          next
        );
      }
    } catch {
      /* ignore */
    }
  },
  setOptHintsActive: (v) => {
    const next = Boolean(v);
    if (get().optHintsActive === next) return;
    set({ optHintsActive: next });
  },
  setActiveDiffCommentId: (id) => {
    const next = id == null || id === '' ? null : id;
    const prev = get().activeDiffCommentId;
    if (prev === next) return;
    // New thread focus — unit resets to root; same-id no-op above.
    // String-equal still resets unit (root hop via string/number forms).
    const sameRoot =
      next != null && prev != null && String(prev) === String(next);
    if (sameRoot) {
      set({ activeDiffCommentId: next });
      return;
    }
    set({ activeDiffCommentId: next, focusedThreadUnitId: null });
    // Clear unit DOM stamp when hopping threads (setFocusedThreadUnitId no-op
    // path would leave a stale reply id after store unit reset).
    try {
      if (typeof document !== 'undefined') {
        document.documentElement.removeAttribute(
          'data-prp-focused-thread-unit'
        );
      }
    } catch {
      /* ignore */
    }
  },
  setFocusedThreadUnitId: (id) => {
    const next = id == null || id === '' ? null : String(id);
    if (get().focusedThreadUnitId === next) return;
    set({ focusedThreadUnitId: next });
    try {
      if (typeof document !== 'undefined') {
        if (next) {
          document.documentElement.setAttribute(
            'data-prp-focused-thread-unit',
            next
          );
        } else {
          document.documentElement.removeAttribute(
            'data-prp-focused-thread-unit'
          );
        }
      }
    } catch {
      /* ignore */
    }
  },
  hydrateLocalDetail: (detail) => {
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
      focusedConversationAnchor: null,
      pendingConversationNavAnchor: null,
      optHintsActive: false,
      activeDiffCommentId: null,
      focusedThreadUnitId: null,
      commentIndex: -1,
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
