/** @module modal/lib/shortcut-policy */
/**
 * Pure policy for PR modal global shortcuts.
 * Product chords use Option (former mod/⌘ → opt/⌥) except Find:
 *   find ⌘F / Ctrl+F · open palette ⌥⇧K · fullscreen ⌥⇧F · diff toggle ⌥.
 * Option+J/K step nav, Option+Shift+[ / ] file nav, stack digits, [ ] adjacent, Esc.
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

/** Option+Shift + [ / ] — previous/next file on Diff (from current file). */
export const FILE_NAV_SHORTCUT = {
  prev: {
    key: '[',
    code: 'BracketLeft',
    action: 'navFilePrev' as const,
    chord: 'opt+shift+[',
    labelMac: '⌥⇧[',
    labelWin: 'Alt+Shift+[',
  },
  next: {
    key: ']',
    code: 'BracketRight',
    action: 'navFileNext' as const,
    chord: 'opt+shift+]',
    labelMac: '⌥⇧]',
    labelWin: 'Alt+Shift+]',
  },
};

/** Option+Shift + ArrowUp/Down — scroll Diff list by ~one viewport page. */
export const DIFF_PAGE_SCROLL_SHORTCUT = {
  prev: {
    key: 'arrowup',
    code: 'ArrowUp',
    action: 'scrollDiffPagePrev' as const,
    chord: 'opt+shift+arrowup',
    labelMac: '⌥⇧↑',
    labelWin: 'Alt+Shift+↑',
  },
  next: {
    key: 'arrowdown',
    code: 'ArrowDown',
    action: 'scrollDiffPageNext' as const,
    chord: 'opt+shift+arrowdown',
    labelMac: '⌥⇧↓',
    labelWin: 'Alt+Shift+↓',
  },
};

/** Option+Shift + R — toggle viewed/unread for the active Diff file. */
export const TOGGLE_VIEWED_SHORTCUT = {
  key: 'r',
  code: 'KeyR',
  action: 'toggleViewedActiveFile' as const,
  chord: 'opt+shift+r',
  labelMac: '⌥⇧R',
  labelWin: 'Alt+Shift+R',
};

/**
 * Option+U/R/P — toggle Diff review file filter (unresolved / resolved / pending).
 * Second press of the same chord clears the filter.
 */
export const REVIEW_FILTER_SHORTCUT = {
  unresolved: {
    key: 'u',
    code: 'KeyU',
    filter: 'unresolved' as const,
    action: 'toggleReviewFilterUnresolved' as const,
    chord: 'opt+u',
    labelMac: '⌥U',
    labelWin: 'Alt+U',
  },
  resolved: {
    key: 'r',
    code: 'KeyR',
    filter: 'resolved' as const,
    action: 'toggleReviewFilterResolved' as const,
    chord: 'opt+r',
    labelMac: '⌥R',
    labelWin: 'Alt+R',
  },
  pending: {
    key: 'p',
    code: 'KeyP',
    filter: 'pending' as const,
    action: 'toggleReviewFilterPending' as const,
    chord: 'opt+p',
    labelMac: '⌥P',
    labelWin: 'Alt+P',
  },
} as const;

/**
 * Toggle Diff review-filter: same target again → clear (null).
 * @returns next filter mode
 */
export function toggleReviewFilter(
  current: unknown,
  target: 'unresolved' | 'resolved' | 'pending' | string
): 'unresolved' | 'resolved' | 'pending' | null {
  const t = String(target || '').toLowerCase();
  if (t !== 'unresolved' && t !== 'resolved' && t !== 'pending') {
    return (current as any) ?? null;
  }
  const cur = current == null || current === '' ? null : String(current).toLowerCase();
  if (cur === t) return null;
  return t as 'unresolved' | 'resolved' | 'pending';
}

/**
 * Next scrollTop when paging the Diff scroller by roughly one viewport.
 * delta < 0 → previous page; delta > 0 → next page.
 */
export function nextScrollTopByPage(
  scrollTop: unknown,
  clientHeight: unknown,
  scrollHeight: unknown,
  delta: number
): number {
  const top = Math.max(0, Number(scrollTop) || 0);
  const vh = Math.max(0, Number(clientHeight) || 0);
  const sh = Math.max(0, Number(scrollHeight) || 0);
  if (vh <= 0) return top;
  // Leave a small overlap so context remains visible
  const step = Math.max(40, Math.floor(vh * 0.9));
  const d = delta < 0 ? -step : step;
  const max = Math.max(0, sh - vh);
  const next = top + d;
  return Math.min(max, Math.max(0, next));
}

function filePathOf(file: any): string {
  return String(file?.filename || file?.path || '').trim();
}

/**
 * Index of the active path in the visible file list (-1 if missing).
 */
export function activeFileNavIndex(
  files: any[] | null | undefined,
  activePath: unknown
): number {
  const list = Array.isArray(files) ? files : [];
  const path = String(activePath || '').trim();
  if (!list.length || !path) return -1;
  return list.findIndex((f) => filePathOf(f) === path);
}

/**
 * Adjacent file in the visible list, relative to the currently viewed file.
 * Wraps at ends. If active path is not in the list, next → first, prev → last.
 */
export function resolveAdjacentFileNav(
  files: any[] | null | undefined,
  activePath: unknown,
  delta: number
): { index: number; total: number; path: string | null } {
  const list = Array.isArray(files) ? files : [];
  const total = list.length;
  if (total <= 0) return { index: -1, total: 0, path: null };
  const d = delta < 0 ? -1 : 1;
  let idx = activeFileNavIndex(list, activePath);
  if (idx < 0) {
    // Not in list: next starts at first, prev starts at last
    idx = d > 0 ? -1 : 0;
  }
  const next = ((idx + d) % total + total) % total;
  const path = filePathOf(list[next]);
  return { index: next, total, path: path || null };
}

/** Selectors for GitHub's native ⌘K command palette. */
export const GITHUB_COMMAND_PALETTE_SELECTOR =
  '#command-palette-pjax-container, dialog.js-command-palette-dialog, command-palette';

/**
 * How long after GH palette was last seen open we still treat Escape as
 * "owned by GH" (their capture listener often closes the dialog before ours).
 */
export const GITHUB_PALETTE_ESCAPE_GRACE_MS = 500;

/** Last time GH command palette was observed open (ms since epoch). */
let _githubPaletteLastOpenAt = 0;

/**
 * Find GitHub's native command palette dialog (if present in the document).
 */
export function findGithubCommandPaletteDialog(
  doc: Document | null | undefined = typeof document !== 'undefined'
    ? document
    : null
): HTMLDialogElement | Element | null {
  if (!doc || typeof doc.getElementById !== 'function') return null;
  try {
    return (
      doc.getElementById('command-palette-pjax-container') ||
      (typeof doc.querySelector === 'function'
        ? doc.querySelector('dialog.js-command-palette-dialog')
        : null)
    );
  } catch {
    return null;
  }
}

/**
 * True when `el` is (or is inside) GitHub's command palette.
 */
export function isInsideGithubCommandPalette(
  el: EventTarget | Element | null | undefined
): boolean {
  if (!el || typeof (el as Element).closest !== 'function') return false;
  try {
    return Boolean(
      (el as Element).closest(GITHUB_COMMAND_PALETTE_SELECTOR)
    );
  } catch {
    return false;
  }
}

/**
 * GitHub's native command palette (⌘K / Ctrl+K) is actively open.
 *
 * Strict: only HTMLDialogElement.open. Do NOT treat stuck :modal, leftover
 * focus, or residual visibility as open — those freeze all pr+ shortcuts after
 * GH closes the palette. Escape race is handled by a short grace window instead.
 */
export function isGithubCommandPaletteOpen(
  doc: Document | null | undefined = typeof document !== 'undefined'
    ? document
    : null
): boolean {
  if (!doc || typeof doc.getElementById !== 'function') return false;
  try {
    const d = findGithubCommandPaletteDialog(doc);
    if (!d) return false;
    return Boolean((d as HTMLDialogElement).open);
  } catch {
    /* ignore */
  }
  return false;
}

/**
 * Record that GH palette is currently open (call on open detection / keydown / mutations).
 * @returns whether palette is open right now
 */
export function touchGithubCommandPaletteOpen(
  doc: Document | null | undefined = typeof document !== 'undefined'
    ? document
    : null,
  now: number = Date.now()
): boolean {
  const open = isGithubCommandPaletteOpen(doc);
  if (open) _githubPaletteLastOpenAt = now;
  return open;
}

/**
 * Whether pr+ should ignore Escape so GH's palette can close alone.
 * Covers the race where GH's capture handler already closed the dialog on this keydown.
 *
 * Only open + short grace after last *open* observation — never permanent
 * blocks from leftover focus / stuck :modal.
 */
export function shouldIgnoreModalEscapeForGithubPalette(
  doc: Document | null | undefined = typeof document !== 'undefined'
    ? document
    : null,
  opts: {
    target?: EventTarget | null;
    now?: number;
    graceMs?: number;
  } = {}
): boolean {
  const now = Number.isFinite(opts.now as number) ? (opts.now as number) : Date.now();
  const grace =
    Number.isFinite(opts.graceMs as number)
      ? Math.max(0, opts.graceMs as number)
      : GITHUB_PALETTE_ESCAPE_GRACE_MS;

  if (isGithubCommandPaletteOpen(doc)) {
    _githubPaletteLastOpenAt = now;
    return true;
  }

  // GH closed first on this same Escape (or just closed) — short grace only
  if (_githubPaletteLastOpenAt > 0 && now - _githubPaletteLastOpenAt <= grace) {
    return true;
  }

  return false;
}

/** Test helper — reset sticky watch timestamp. */
export function __resetGithubPaletteWatchForTests(): void {
  _githubPaletteLastOpenAt = 0;
}

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
    if (code === 'KeyR' || code === 'keyr') return 'r';
    if (code === 'KeyU' || code === 'keyu') return 'u';
    if (code === 'KeyP' || code === 'keyp') return 'p';
    if (code === 'BracketLeft') return '[';
    if (code === 'BracketRight') return ']';
    if (code === 'Period') return '.';
    if (code === 'Enter' || code === 'NumpadEnter') return 'enter';
    if (code === 'ArrowUp') return 'arrowup';
    if (code === 'ArrowDown') return 'arrowdown';
    const dm = code.match(/^Digit([1-9])$/i) || code.match(/^Numpad([1-9])$/i);
    if (dm) return dm[1];
  }
  if (code === 'Period') return '.';
  if (code === 'Enter' || code === 'NumpadEnter') return 'enter';
  if (code === 'ArrowUp') return 'arrowup';
  if (code === 'ArrowDown') return 'arrowdown';
  return String(opts.key || '').toLowerCase();
}

/**
 * Opt-hold badge slots for PR modal chrome (stack digits, adjacent, step-nav).
 * Pure mapping for UI + tests.
 *
 * @returns {Array<{ id: string, label: string, chord: string, target: string, digit?: number, number?: number|null }>}
 */
export function buildModalOptHoldSlots(opts: {
  stackItems?: any[];
  isMac?: boolean;
  searchOpen?: boolean;
  layoutMode?: string;
} = {}) {
  const stack = Array.isArray(opts.stackItems) ? opts.stackItems : [];
  const isMac = opts.isMac !== false;
  const slots: any[] = [];

  for (let i = 0; i < Math.min(stack.length, 9); i++) {
    const it = stack[i] || {};
    const num = Number(it.number);
    if (!Number.isFinite(num) || num <= 0) continue;
    slots.push({
      id: `stack-digit-${i + 1}`,
      label: isMac ? `⌥${i + 1}` : `Alt+${i + 1}`,
      chord: `opt+${i + 1}`,
      target: 'stack',
      digit: i + 1,
      number: num,
    });
  }

  // Option+[ / ] remain keybindings only — not Opt-hold badge chrome.

  // Step-nav only meaningful when Find open or Diff layout
  const layout = String(opts.layoutMode || '');
  if (opts.searchOpen || layout === 'diff') {
    slots.push({
      id: 'step-prev',
      label: isMac ? STEP_NAV_SHORTCUT.prev.labelMac : STEP_NAV_SHORTCUT.prev.labelWin,
      chord: STEP_NAV_SHORTCUT.prev.chord,
      target: 'step-prev',
    });
    slots.push({
      id: 'step-next',
      label: isMac ? STEP_NAV_SHORTCUT.next.labelMac : STEP_NAV_SHORTCUT.next.labelWin,
      chord: STEP_NAV_SHORTCUT.next.chord,
      target: 'step-next',
    });
  }

  return slots;
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

/** Display label for Diff file step-nav (⌥⇧[ / ]). */
export function fileNavShortcutLabel(
  which: 'prev' | 'next',
  isMac = false
): string {
  const s = FILE_NAV_SHORTCUT[which];
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

  // GitHub ⌘K palette owns Escape / keyboard — never close pr+ shell
  if (opts.githubPaletteOpen) return null;

  // Esc is handled in App with layout context (palette / search / edit / diff / close)
  if (key === 'escape') {
    if (paletteOpen) return 'closePalette';
    if (opts.editingBody || opts.editingComment) return 'cancelEdit';
    return 'escapeNav';
  }

  // Command palette owns the keyboard entirely
  if (paletteOpen) return null;

  // ⌥⇧[ / ⌥⇧] (Alt+Shift+[ / ]): previous/next file on Diff from current file
  if (alt && !mod && shift && (key === '[' || key === ']')) {
    if (opts.editableTarget) return null;
    if (String(opts.layoutMode || '') !== 'diff') return null;
    return key === '['
      ? FILE_NAV_SHORTCUT.prev.action
      : FILE_NAV_SHORTCUT.next.action;
  }

  // ⌥⇧↑ / ⌥⇧↓: scroll Diff by roughly one viewport page
  if (
    alt &&
    !mod &&
    shift &&
    (key === 'arrowup' || key === 'arrowdown')
  ) {
    if (opts.editableTarget) return null;
    if (String(opts.layoutMode || '') !== 'diff') return null;
    return key === 'arrowup'
      ? DIFF_PAGE_SCROLL_SHORTCUT.prev.action
      : DIFF_PAGE_SCROLL_SHORTCUT.next.action;
  }

  // ⌥⇧R: toggle viewed/unread for the active Diff file
  if (alt && !mod && shift && key === 'r') {
    if (opts.editableTarget) return null;
    if (String(opts.layoutMode || '') !== 'diff') return null;
    return TOGGLE_VIEWED_SHORTCUT.action;
  }

  // ⌥J / ⌥K (Alt+J/K): step prev/next for Find hits or review threads.
  // Allowed while Find input is focused (searchOpen); blocked for other editables.
  if (alt && !mod && !shift && (key === 'j' || key === 'k')) {
    if (opts.editableTarget && !opts.searchOpen) return null;
    // Only when Find is open or Diff surface (thread nav lives on Diff toolbar)
    const layout = String(opts.layoutMode || '');
    if (!opts.searchOpen && layout !== 'diff') return null;
    return key === 'k' ? STEP_NAV_SHORTCUT.prev.action : STEP_NAV_SHORTCUT.next.action;
  }

  // ⌥U / ⌥R / ⌥P: toggle Diff review filters (unresolved / resolved / pending)
  if (alt && !mod && !shift && (key === 'u' || key === 'r' || key === 'p')) {
    if (opts.editableTarget) return null;
    if (String(opts.layoutMode || '') !== 'diff') return null;
    if (key === 'u') return REVIEW_FILTER_SHORTCUT.unresolved.action;
    if (key === 'r') return REVIEW_FILTER_SHORTCUT.resolved.action;
    return REVIEW_FILTER_SHORTCUT.pending.action;
  }

  // ⌥[ / ⌥] / ⌥1–9: stack path or list-adjacent PR navigation (modal/sheet)
  if (alt && !mod && !shift && !opts.editableTarget) {
    if (key === '[') return 'navAdjacentPrev';
    if (key === ']') return 'navAdjacentNext';
    if (/^[1-9]$/.test(key)) return `navStackDigit${key}`;
  }

  // Diff line-selection move (no Opt): plain arrows = single-line move;
  // Shift+arrows = extend range. Only when a selection is already active.
  if (
    !alt &&
    !mod &&
    (key === 'arrowup' || key === 'arrowdown') &&
    String(opts.layoutMode || '') === 'diff' &&
    opts.hasLineSelection
  ) {
    if (opts.editableTarget) return null;
    if (shift) {
      return key === 'arrowup'
        ? 'extendSelectionUp'
        : 'extendSelectionDown';
    }
    return key === 'arrowup' ? 'moveSelectionUp' : 'moveSelectionDown';
  }

  // Do not steal keys while typing in inputs/textareas/contenteditable
  if (opts.editableTarget) return null;

  // ⌘F / Ctrl+F → Find in PR (exception to opt-only product chords)
  if (mod && !alt && !shift && key === 'f') return 'openSearch';

  // Remaining product shortcuts are Option-only (no other ⌘/Ctrl chords)
  if (!alt || mod) return null;

  // ⌥⇧K → pr+ command palette (same as pulls page)
  if (shift && key === 'k') return 'openPalette';

  // ⌥⇧F → fullscreen shell toggle
  if (shift && key === 'f') return 'toggleFullscreen';

  // ⌥⇧C → focus first conversation comment/review
  if (shift && key === 'c') {
    if (opts.conversationCommentFocused) return 'clearConversationCommentFocus';
    return 'focusConversationComment';
  }

  // ⌥⇧E → restore native GitHub UI (embed only)
  if (shift && key === 'e') {
    if (opts.presentation === 'embed' || opts.isEmbed) return 'restoreNativeView';
    return null;
  }

  // Remaining shift chords (R / arrows handled earlier for Diff)
  if (shift) return null;

  // ⌥. → toggle Diff ↔ Conversation
  if (key === '.' || key === 'period') return 'toggleDiff';

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
