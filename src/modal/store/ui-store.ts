/**
 * UiStore — UI-only Zustand store (Phase 6).
 * Domain fields (PrDetail / domain mirror) are forbidden; re-exports modal-store.
 */
export {
  useModalStore,
  useModalStore as useUiStore,
  useShallow,
} from './modal-store';
export type { ModalUiState as UiStoreState } from './modal-store';
