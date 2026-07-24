(function(){
/**
 * Pure policy for PR modal global shortcuts.
 * Diff toggle, command palette, Find (⌘F), conversation comment focus, and Esc navigation.
 */

/**
 * @param {{
 *   mod: boolean,
 *   shift: boolean,
 *   key: string,
 *   editingBody?: boolean,
 *   editingComment?: boolean|object|null,
 *   paletteOpen?: boolean,
 *   editableTarget?: boolean,
 *   conversationCommentFocused?: boolean,
 * }} opts
 * @returns {string|null}
 */
function resolveModalShortcutAction(opts = {}) {
  const mod = Boolean(opts.mod);
  const shift = Boolean(opts.shift);
  const key = String(opts.key || '').toLowerCase();
  const paletteOpen = Boolean(opts.paletteOpen);

  // Esc is handled in App with layout context (palette / search / edit / diff / close)
  if (key === 'escape') {
    if (paletteOpen) return 'closePalette';
    if (opts.editingBody || opts.editingComment) return 'cancelEdit';
    return 'escapeNav';
  }

  // Do not steal keys while typing in inputs/textareas/contenteditable,
  // or while the command palette owns the keyboard.
  if (opts.editableTarget || paletteOpen) return null;

  if (!mod) return null;

  // ⌘⇧F / Ctrl+Shift+F → fullscreen shell toggle
  if (shift && key === 'f') return 'toggleFullscreen';

  // ⌘⇧C / Ctrl+Shift+C → focus first conversation comment/review; re-press clears
  if (shift && key === 'c') {
    if (opts.conversationCommentFocused) return 'clearConversationCommentFocus';
    return 'focusConversationComment';
  }

  if (shift) return null;

  // ⌘K / Ctrl+K → command palette (also suppresses GH palette)
  if (key === 'k') return 'openPalette';

  // ⌘. / Ctrl+. → toggle Diff ↔ Conversation
  if (key === '.' || key === 'period') return 'toggleDiff';

  // ⌘F / Ctrl+F → in-modal search (Find)
  if (key === 'f') return 'openSearch';

  return null;
}

/**
 * Stable search-anchor for a conversation timeline comment/review row.
 * @param {{ kind?: string, id?: string|number }|null|undefined} item
 * @returns {string|null}
 */
function conversationCommentFocusAnchor(item) {
  if (!item || item.id == null) return null;
  const kind = String(item.kind || '');
  const id = String(item.id);
  if (kind === 'issue-comment') return `issue-comment:${id}`;
  if (kind === 'review') return `review:${id}`;
  if (kind === 'review-group') return `review-group:${id}`;
  if (kind === 'review-thread' || kind === 'review-comment') {
    return `review-comment:${id}`;
  }
  return null;
}

/**
 * Pick the first focusable PR comment/review timeline entry (display order).
 * @param {Array} items
 * @returns {{ id: string, kind: string, anchor: string }|null}
 */
function pickConversationCommentFocusTarget(items) {
  const list = Array.isArray(items) ? items : [];
  for (const item of list) {
    if (!item || item.pending) continue;
    const anchor = conversationCommentFocusAnchor(item);
    if (!anchor) continue;
    return {
      id: String(item.id),
      kind: String(item.kind || ''),
      anchor,
    };
  }
  return null;
}

const api = {
  resolveModalShortcutAction,
  conversationCommentFocusAnchor,
  pickConversationCommentFocusTarget,
};
if (typeof module !== "undefined" && module.exports) module.exports = api;
if (typeof globalThis !== "undefined") globalThis.PRModalShortcutPolicy = api;
})();
