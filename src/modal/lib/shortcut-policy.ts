/** @module modal/lib/shortcut-policy */
/**
 * Pure policy for PR modal global shortcuts.
 * Diff toggle, command palette, Find (⌘F), conversation comment focus,
 * Option+J/K step nav (find hits / review threads), and Esc navigation.
 */

/** Option/Alt + J/K — step prev/next (find hits or review threads). */
export const STEP_NAV_SHORTCUT = {
  /** Physical K → previous (↑) */
  prev: {
    key: 'k',
    code: 'KeyK',
    action: 'stepNavPrev' as const,
    /** Canonical token for formatShortcut */
    chord: 'opt+k',
    labelMac: '⌥K',
    labelWin: 'Alt+K',
  },
  /** Physical J → next (↓) */
  next: {
    key: 'j',
    code: 'KeyJ',
    action: 'stepNavNext' as const,
    chord: 'opt+j',
    labelMac: '⌥J',
    labelWin: 'Alt+J',
  },
};

/**
 * Normalize key for Option/Alt combos: browsers emit special glyphs
 * (e.g. ⌥J → "∆") so prefer KeyboardEvent.code KeyJ/KeyK when alt is held.
 */
export function normalizeShortcutKey(opts: {
  key?: string;
  code?: string;
  alt?: boolean;
} = {}): string {
  const alt = Boolean(opts.alt);
  const code = String(opts.code || '');
  if (alt) {
    if (code === 'KeyJ' || code === 'keyj') return 'j';
    if (code === 'KeyK' || code === 'keyk') return 'k';
  }
  return String(opts.key || '').toLowerCase();
}

/**
 * Display label for step-nav shortcuts (platform-aware).
 */
export function stepNavShortcutLabel(
  which: 'prev' | 'next',
  isMac = false
): string {
  const s = STEP_NAV_SHORTCUT[which];
  return isMac ? s.labelMac : s.labelWin;
}

/**
 * @param {{
 *   mod: boolean,
 *   shift: boolean,
 *   alt?: boolean,
 *   key: string,
 *   code?: string,
 *   editingBody?: boolean,
 *   editingComment?: boolean|object|null,
 *   paletteOpen?: boolean,
 *   editableTarget?: boolean,
 *   conversationCommentFocused?: boolean,
 *   searchOpen?: boolean,
 *   layoutMode?: string,
 * }} opts
 * @returns {string|null}
 */
export function resolveModalShortcutAction(opts: any = {}) {
  const mod = Boolean(opts.mod);
  const shift = Boolean(opts.shift);
  const alt = Boolean(opts.alt);
  const key = normalizeShortcutKey({
    key: opts.key,
    code: opts.code,
    alt,
  });
  const paletteOpen = Boolean(opts.paletteOpen);

  // Esc is handled in App with layout context (palette / search / edit / diff / close)
  if (key === 'escape') {
    if (paletteOpen) return 'closePalette';
    if (opts.editingBody || opts.editingComment) return 'cancelEdit';
    return 'escapeNav';
  }

  // Command palette owns the keyboard entirely
  if (paletteOpen) return null;

  // ⌥J / ⌥K (Alt+J/K): step prev/next for Find hits or review threads.
  // Allowed while Find input is focused (searchOpen); blocked for other editables.
  if (alt && !mod && !shift && (key === 'j' || key === 'k')) {
    if (opts.editableTarget && !opts.searchOpen) return null;
    // Only when Find is open or Diff surface (thread nav lives on Diff toolbar)
    const layout = String(opts.layoutMode || '');
    if (!opts.searchOpen && layout !== 'diff') return null;
    return key === 'k' ? STEP_NAV_SHORTCUT.prev.action : STEP_NAV_SHORTCUT.next.action;
  }

  // Do not steal keys while typing in inputs/textareas/contenteditable
  if (opts.editableTarget) return null;

  if (!mod) return null;

  // ⌘⇧F / Ctrl+Shift+F → fullscreen shell toggle
  if (shift && key === 'f') return 'toggleFullscreen';

  // ⌘⇧C / Ctrl+Shift+C → focus first conversation comment/review; re-press clears
  if (shift && key === 'c') {
    if (opts.conversationCommentFocused) return 'clearConversationCommentFocus';
    return 'focusConversationComment';
  }

  // ⌘⇧E / Ctrl+Shift+E → restore native GitHub UI (embed only; not a browser default)
  if (shift && key === 'e') {
    if (opts.presentation === 'embed' || opts.isEmbed) return 'restoreNativeView';
    return null;
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
 */
export function conversationCommentFocusAnchor(item: any): string | null {
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
 */
export function pickConversationCommentFocusTarget(
  items: any
): { id: string; kind: string; anchor: string } | null {
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
