/** @module modal/lib/shortcut-policy */
/**
 * Pure policy for PR modal global shortcuts.
 * Diff toggle, command palette, Find (⌘F), and Esc-related navigation.
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
export function resolveModalShortcutAction(opts: any = {}) {
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

  // ⌘F / Ctrl+F → in-modal search (PR body / comments / diff rows)
  if (key === 'f') return 'openSearch';

  return null;
}
