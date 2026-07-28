/**
 * Zustand slice for progressive detail projection flags used by the modal UI.
 * Host still owns the authoritative PRModalDetailStore; this store mirrors
 * settled/pending flags so deep trees can subscribe without prop drilling.
 */
import { create } from 'zustand';

export type SideKey =
  | 'files'
  | 'commits'
  | 'comments'
  | 'reviews'
  | 'checks'
  | 'development';

export interface DetailUiState {
  sidePending: Record<SideKey, boolean>;
  sideSettled: Record<SideKey, boolean>;
  loadPercent: number | null;
  loadLabel: string | null;
  loadBusy: boolean;
  setSidePending: (key: SideKey, pending: boolean) => void;
  setSideSettled: (key: SideKey, settled: boolean) => void;
  setSideFlags: (
    pending: Partial<Record<SideKey, boolean>>,
    settled?: Partial<Record<SideKey, boolean>>
  ) => void;
  setLoadStage: (s: {
    percent?: number | null;
    label?: string | null;
    busy?: boolean;
  }) => void;
  clearLoadStage: () => void;
  resetDetailUi: () => void;
}

const emptyFlags = (): Record<SideKey, boolean> => ({
  files: false,
  commits: false,
  comments: false,
  reviews: false,
  checks: false,
  development: false,
});

export const useDetailUiStore = create<DetailUiState>((set) => ({
  sidePending: emptyFlags(),
  sideSettled: emptyFlags(),
  loadPercent: null,
  loadLabel: null,
  loadBusy: false,
  setSidePending: (key, pending) =>
    set((s) => ({
      sidePending: { ...s.sidePending, [key]: pending },
    })),
  setSideSettled: (key, settled) =>
    set((s) => ({
      sideSettled: { ...s.sideSettled, [key]: settled },
      sidePending: { ...s.sidePending, [key]: settled ? false : s.sidePending[key] },
    })),
  setSideFlags: (pending, settled) =>
    set((s) => ({
      sidePending: { ...s.sidePending, ...pending },
      sideSettled: settled
        ? { ...s.sideSettled, ...settled }
        : s.sideSettled,
    })),
  setLoadStage: ({ percent, label, busy }) =>
    set((s) => ({
      loadPercent: percent === undefined ? s.loadPercent : percent,
      loadLabel: label === undefined ? s.loadLabel : label,
      loadBusy: busy === undefined ? s.loadBusy : busy,
    })),
  clearLoadStage: () =>
    set({ loadPercent: null, loadLabel: null, loadBusy: false }),
  resetDetailUi: () =>
    set({
      sidePending: emptyFlags(),
      sideSettled: emptyFlags(),
      loadPercent: null,
      loadLabel: null,
      loadBusy: false,
    }),
}));
