/**
 * Pure policy for PR modal global shortcuts.
 * Only Diff toggle, command palette, and Esc-related navigation remain active.
 */

/**
 * @param {{
 *   mod: boolean,
 *   shift: boolean,
 *   key: string,
 *   editingBody?: boolean,
 *   editingComment?: boolean|object|null,
 *   paletteOpen?: boolean,
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

  if (!mod || shift) return null;

  // ⌘K / Ctrl+K → command palette (also suppresses GH palette)
  if (key === 'k') return 'openPalette';

  // ⌘. / Ctrl+. → toggle Diff ↔ Conversation
  if (key === '.' || key === 'period') return 'toggleDiff';

  // Find (⌘F) and all other chords intentionally disabled — only Diff / palette / Esc
  return null;
}

const api = { resolveModalShortcutAction };

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}
if (typeof globalThis !== 'undefined') {
  globalThis.PRModalShortcutPolicy = api;
}
