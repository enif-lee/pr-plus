/**
 * Nested Escape ownership — pure helpers.
 *
 * App keydown is capture on `window` and runs *before* many nested
 * document-level listeners. Nested UIs must either register on window with
 * stopImmediatePropagation *before* App, or App must gate shell close on a
 * stable open marker. Prefer both: nested closes itself; App never closes
 * the PR shell while a nested layer is open.
 */

export type EscapeLayerAction =
  | 'dismiss-nested'
  | 'blur-input'
  | 'close-shell';

/**
 * Stop the key event so later same-target listeners (and bubble) do not also
 * close the PR shell. Use from nested Escape handlers (window/document capture).
 */
export function claimNestedEscape(e: {
  preventDefault?: () => void;
  stopPropagation?: () => void;
  stopImmediatePropagation?: () => void;
}): void {
  try {
    e.preventDefault?.();
  } catch {
    /* ignore */
  }
  try {
    e.stopPropagation?.();
  } catch {
    /* ignore */
  }
  try {
    e.stopImmediatePropagation?.();
  } catch {
    /* ignore */
  }
}

/**
 * Pure ordering: who owns Escape given open flags (no DOM).
 * First match wins. Shell close is only when nothing nested claims Esc.
 */
export function resolveModalEscapeOwner(flags: {
  finishReviewOpen?: boolean;
  confirmOpen?: boolean;
  paletteOpen?: boolean;
  pickerOpen?: boolean;
  searchOpen?: boolean;
  selectionComposerOpen?: boolean;
  editingBodyOrComment?: boolean;
  reactionPickerOpen?: boolean;
  viewerOpen?: boolean;
  titleEditFocused?: boolean;
  /** Diff settings, SearchableSelect, header overflow, etc. */
  nestedLayerOpen?: boolean;
  editableFocused?: boolean;
} = {}): EscapeLayerAction {
  if (flags.finishReviewOpen) return 'dismiss-nested';
  if (flags.confirmOpen) return 'dismiss-nested';
  if (flags.viewerOpen) return 'dismiss-nested';
  if (flags.reactionPickerOpen) return 'dismiss-nested';
  if (flags.titleEditFocused) return 'dismiss-nested';
  if (flags.pickerOpen) return 'dismiss-nested';
  if (flags.paletteOpen) return 'dismiss-nested';
  if (flags.searchOpen) return 'dismiss-nested';
  if (flags.selectionComposerOpen) return 'dismiss-nested';
  if (flags.editingBodyOrComment) return 'dismiss-nested';
  if (flags.nestedLayerOpen) return 'dismiss-nested';
  if (flags.editableFocused) return 'blur-input';
  return 'close-shell';
}

/**
 * CSS selector for open nested dismiss layers (portaled menus / pickers).
 * Keep in sync with components that claim Escape locally.
 */
export const NESTED_ESCAPE_LAYER_SELECTOR = [
  '[data-prp-review-filter-menu="1"]',
  '.prp-diff-review-settings--portal',
  '.prp-sselect-panel',
  '[data-prp-nested-layer="1"]',
  '[data-prp-header-overflow="1"]',
  '[data-prp-finish-review="1"]',
  '[data-prp-reaction-picker="1"]',
  '[data-prp-mermaid-viewer="1"]',
  '[data-prp-image-viewer="1"]',
  '[data-prp-md-viewer="1"]',
].join(', ');

/**
 * True when a nested dismissable layer is open in `root` (default document).
 * Used by App Escape so window-capture shell close does not race document menus.
 */
export function isNestedEscapeLayerOpen(
  root: ParentNode | null | undefined = typeof document !== 'undefined'
    ? document
    : null
): boolean {
  if (!root || typeof (root as ParentNode).querySelector !== 'function') {
    return false;
  }
  try {
    return Boolean(root.querySelector(NESTED_ESCAPE_LAYER_SELECTOR));
  } catch {
    return false;
  }
}
