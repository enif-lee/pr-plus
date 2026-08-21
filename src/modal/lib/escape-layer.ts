/**
 * Nested Escape ownership — pure helpers.
 *
 * App keydown is capture on `window` and runs *before* many nested
 * document-level listeners. Nested UIs must either register on window with
 * stopImmediatePropagation *before* App, or App must gate shell close on a
 * stable open marker. Prefer both: nested closes itself; App never closes
 * the PR shell while a nested layer is open.
 *
 * Fullscreen overlays (markdown / mermaid / image) share one LIFO stack so
 * Esc pops only the top viewer. Independent window-capture handlers would
 * all see the same key (or the first would stopImmediate and close the
 * wrong layer).
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

type EscapeOverlayLayer = { close: () => void };

const escapeOverlayStack: EscapeOverlayLayer[] = [];
let overlayEscapeListening = false;

function onOverlayEscapeKey(e: KeyboardEvent) {
  if (e.key !== 'Escape' && e.code !== 'Escape') return;
  if (!escapeOverlayStack.length) return;
  claimNestedEscape(e);
  popEscapeOverlay();
}

function ensureOverlayEscapeListen() {
  if (overlayEscapeListening) return;
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
    return;
  }
  window.addEventListener('keydown', onOverlayEscapeKey, true);
  overlayEscapeListening = true;
}

function maybeUnlistenOverlayEscape() {
  if (!overlayEscapeListening || escapeOverlayStack.length) return;
  if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
    window.removeEventListener('keydown', onOverlayEscapeKey, true);
  }
  overlayEscapeListening = false;
}

/**
 * Push a fullscreen overlay onto the Esc stack. Returns unregister.
 * Esc pops the last registered layer only (image over markdown, etc.).
 * Pass a stable `() => closeRef.current()` so re-renders do not reorder.
 */
export function registerEscapeOverlay(close: () => void): () => void {
  const layer: EscapeOverlayLayer = { close };
  escapeOverlayStack.push(layer);
  ensureOverlayEscapeListen();
  return () => {
    const i = escapeOverlayStack.lastIndexOf(layer);
    if (i >= 0) escapeOverlayStack.splice(i, 1);
    maybeUnlistenOverlayEscape();
  };
}

export function isEscapeOverlayOpen(): boolean {
  return escapeOverlayStack.length > 0;
}

export function escapeOverlayCount(): number {
  return escapeOverlayStack.length;
}

/** Close the top overlay. Used by the window listener and tests. */
export function popEscapeOverlay(): boolean {
  const top = escapeOverlayStack.pop();
  if (!top) {
    maybeUnlistenOverlayEscape();
    return false;
  }
  try {
    top.close();
  } catch {
    /* ignore */
  }
  maybeUnlistenOverlayEscape();
  return true;
}

/** Test helper — clear stack without calling close. */
export function resetEscapeOverlayStack(): void {
  escapeOverlayStack.length = 0;
  maybeUnlistenOverlayEscape();
}
