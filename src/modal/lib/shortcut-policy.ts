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

/**
 * Option + ArrowUp/Down (no Shift) — override browser default.
 * - Diff: jump selection by several lines (+ scroll via reveal)
 * - Conversation: scroll the timeline panel by a matching amount
 */
export const DIFF_OPT_ARROW_SHORTCUT = {
  /** How many selectable lines to move the caret per chord */
  selectionSteps: 8,
  /** Scroll multiplier of selectionSteps × rowHeight (1 = track caret) */
  scrollStepScale: 1,
  /** Approx row height used for conversation Opt-arrow scroll steps */
  conversationRowHeight: 48,
  prev: {
    key: 'arrowup',
    code: 'ArrowUp',
    action: 'optArrowScrollSelectPrev' as const,
    chord: 'opt+arrowup',
    labelMac: '⌥↑',
    labelWin: 'Alt+↑',
  },
  next: {
    key: 'arrowdown',
    code: 'ArrowDown',
    action: 'optArrowScrollSelectNext' as const,
    chord: 'opt+arrowdown',
    labelMac: '⌥↓',
    labelWin: 'Alt+↓',
  },
} as const;

/** Conversation Opt+Arrow / Opt+Shift+Arrow scroll actions. */
export const CONVERSATION_SCROLL_SHORTCUT = {
  optPrev: {
    action: 'scrollConversationOptPrev' as const,
    chord: 'opt+arrowup',
    labelMac: '⌥↑',
    labelWin: 'Alt+↑',
  },
  optNext: {
    action: 'scrollConversationOptNext' as const,
    chord: 'opt+arrowdown',
    labelMac: '⌥↓',
    labelWin: 'Alt+↓',
  },
  pagePrev: {
    action: 'scrollConversationPagePrev' as const,
    chord: 'opt+shift+arrowup',
    labelMac: '⌥⇧↑',
    labelWin: 'Alt+Shift+↑',
  },
  pageNext: {
    action: 'scrollConversationPageNext' as const,
    chord: 'opt+shift+arrowdown',
    labelMac: '⌥⇧↓',
    labelWin: 'Alt+Shift+↓',
  },
} as const;

/**
 * Scroll delta (px) for Opt+Arrow Diff jump.
 * @param dir -1 up / +1 down
 * @param rowHeight average row height
 * @param viewportHeight scroller clientHeight (for clamp of step size)
 */
export function optArrowScrollDeltaPx(
  dir: number,
  rowHeight: number,
  viewportHeight = 0
): number {
  const d = dir < 0 ? -1 : 1;
  const rh = Math.max(1, Number(rowHeight) || 22);
  const steps = Number(DIFF_OPT_ARROW_SHORTCUT.selectionSteps) || 8;
  const scale = Number(DIFF_OPT_ARROW_SHORTCUT.scrollStepScale) || 1;
  let dy = d * steps * rh * scale;
  // Cap so one press does not exceed ~half viewport
  const vp = Math.max(0, Number(viewportHeight) || 0);
  if (vp > 0) {
    const cap = Math.floor(vp * 0.5);
    if (Math.abs(dy) > cap) dy = d * cap;
  }
  return dy;
}

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
 * Option+B — toggle the layout side panel:
 * - Diff: files navigator (left)
 * - Conversation: metadata rail (right)
 * (⌥⇧B remains Change base branch.)
 */
export const TOGGLE_SIDE_PANEL_SHORTCUT = {
  key: 'b',
  code: 'KeyB',
  action: 'toggleSidePanel' as const,
  chord: 'opt+b',
  labelMac: '⌥B',
  labelWin: 'Alt+B',
} as const;

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
 * Context-thread shortcuts — active review thread / comment unit in either
 * Conversation (⌥J/K · ⌥⇧C focus) or Diff (⌥J/K thread nav / commentIndex).
 *
 *   ⌥F fold/expand · ⌥D reveal in Diff · ⌥C comment (1st focus, 2nd submit)
 *   ⌥⌃R resolve / unresolve
 */
export const CONTEXT_THREAD_SHORTCUT = {
  fold: {
    key: 'f',
    code: 'KeyF',
    action: 'contextThreadFold' as const,
    chord: 'opt+f',
    labelMac: '⌥F',
    labelWin: 'Alt+F',
  },
  gotoDiff: {
    key: 'd',
    code: 'KeyD',
    action: 'contextThreadGotoDiff' as const,
    chord: 'opt+d',
    labelMac: '⌥D',
    labelWin: 'Alt+D',
  },
  comment: {
    key: 'c',
    code: 'KeyC',
    action: 'contextThreadComment' as const,
    chord: 'opt+c',
    labelMac: '⌥C',
    labelWin: 'Alt+C',
  },
  resolve: {
    key: 'r',
    code: 'KeyR',
    action: 'contextThreadResolve' as const,
    chord: 'opt+ctrl+r',
    labelMac: '⌥⌃R',
    labelWin: 'Alt+Ctrl+R',
    /** Requires Control (not ⌘) + Option */
    ctrl: true,
  },
} as const;

/** @deprecated use CONTEXT_THREAD_SHORTCUT */
export const FOCUSED_THREAD_SHORTCUT = CONTEXT_THREAD_SHORTCUT;

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
 * Map KeyboardEvent.code → canonical shortcut token.
 * Physical layout is stable across macOS Option glyphs (⌥C→ç, ⌥B→∫, ⌥J→∆).
 * @returns token or null when code is empty / unknown
 */
export function keyTokenFromCode(code: unknown): string | null {
  const c = String(code || '');
  if (!c) return null;
  const letter = c.match(/^Key([A-Z])$/i);
  if (letter) return letter[1].toLowerCase();
  const digit = c.match(/^Digit([0-9])$/i) || c.match(/^Numpad([0-9])$/i);
  if (digit) return digit[1];
  switch (c) {
    case 'BracketLeft':
      return '[';
    case 'BracketRight':
      return ']';
    case 'Period':
      return '.';
    case 'Comma':
      return ',';
    case 'Slash':
      return '/';
    case 'Backslash':
      return '\\';
    case 'Minus':
      return '-';
    case 'Equal':
      return '=';
    case 'Semicolon':
      return ';';
    case 'Quote':
      return "'";
    case 'Backquote':
      return '`';
    case 'Enter':
    case 'NumpadEnter':
      return 'enter';
    case 'Escape':
      return 'escape';
    case 'Space':
      return ' ';
    case 'Tab':
      return 'tab';
    case 'Backspace':
      return 'backspace';
    case 'Delete':
      return 'delete';
    case 'ArrowUp':
      return 'arrowup';
    case 'ArrowDown':
      return 'arrowdown';
    case 'ArrowLeft':
      return 'arrowleft';
    case 'ArrowRight':
      return 'arrowright';
    default:
      return null;
  }
}

/**
 * True when `key` is a non-ASCII glyph (macOS Option output) rather than a
 * plain letter/digit/symbol we match on.
 */
export function isOptionGlyphKey(key: unknown): boolean {
  const k = String(key || '');
  if (!k) return false;
  // Single ASCII letter/digit/common symbol — not a glyph
  if (/^[a-zA-Z0-9]$/.test(k)) return false;
  if (/^[\[\].,\/\\;'`=\-]$/.test(k)) return false;
  // Escape/Enter/arrows reported as words
  if (
    /^(escape|enter|tab|backspace|delete|arrowup|arrowdown|arrowleft|arrowright| |space)$/i.test(
      k
    )
  ) {
    return false;
  }
  // Multi-char words like "Dead" or single non-ASCII (ç, ∫, ∆, ®, …)
  return true;
}

/**
 * Normalize a key for shortcut matching.
 *
 * **Always prefers KeyboardEvent.code** for known physical keys so Option
 * chords work on macOS (glyphs) and consistently on Windows/Linux.
 * Falls back to lowercased `key` when code is missing/unknown.
 *
 * `alt` is kept for call-site compatibility; code wins regardless of alt.
 */
export function normalizeShortcutKey(opts: {
  key?: string;
  code?: string;
  alt?: boolean;
} = {}): string {
  const fromCode = keyTokenFromCode(opts.code);
  if (fromCode != null) return fromCode;

  const raw = String(opts.key || '');
  // Some browsers omit code; if key is a glyph, we cannot recover the letter
  if (isOptionGlyphKey(raw)) {
    // Last resort: still return lowercased glyph (won't match product chords)
    return raw.toLowerCase();
  }
  if (raw === ' ') return ' ';
  return raw.toLowerCase();
}

/**
 * Canonical key token from a KeyboardEvent (or event-like object).
 */
export function shortcutKeyFromEvent(e: {
  key?: string;
  code?: string;
  altKey?: boolean;
} | null | undefined): string {
  if (!e) return '';
  return normalizeShortcutKey({
    key: e.key,
    code: e.code,
    alt: Boolean(e.altKey),
  });
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

  // Step-nav: Find hits, Diff review threads, or Conversation comments
  const layout = String(opts.layoutMode || '');
  if (
    opts.searchOpen ||
    layout === 'diff' ||
    layout === 'centered' ||
    layout === 'conversation'
  ) {
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

/** Display label for side-panel collapse toggle (⌥B / Alt+B). */
export function sidePanelShortcutLabel(isMac = false): string {
  return isMac
    ? TOGGLE_SIDE_PANEL_SHORTCUT.labelMac
    : TOGGLE_SIDE_PANEL_SHORTCUT.labelWin;
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
 *   contextThreadActive?: boolean,
 *   searchOpen?: boolean,
 *   layoutMode?: string,
 * }} opts
 * @returns {string|null}
 */
export function resolveModalShortcutAction(opts: any = {}) {
  const mod = Boolean(opts.mod);
  const shift = Boolean(opts.shift);
  const alt = Boolean(opts.alt);
  /** Physical Control — used with ⌥ for resolve (not ⌘/meta). */
  const ctrl = Boolean(opts.ctrl);
  const key = normalizeShortcutKey({
    key: opts.key,
    code: opts.code,
    alt,
  });
  const paletteOpen = Boolean(opts.paletteOpen);
  const layout = String(opts.layoutMode || '');
  /** Conversation focus ring and/or Diff active review-thread nav index. */
  const contextThreadActive = Boolean(
    opts.contextThreadActive ?? opts.conversationCommentFocused
  );

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

  /*
   * Context-thread shortcuts (Conversation focus or Diff comment nav):
   *   ⌥F fold · ⌥D Diff · ⌥C comment (1st focus input, 2nd submit)
   *   ⌥⌃R resolve / unresolve
   * ⌥C allowed while the reply composer is focused (second stage).
   */
  if (contextThreadActive && alt && !shift) {
    if (ctrl && !mod && key === 'r') {
      return CONTEXT_THREAD_SHORTCUT.resolve.action;
    }
    if (!ctrl && !mod) {
      if (key === 'f' && !opts.editableTarget) {
        return CONTEXT_THREAD_SHORTCUT.fold.action;
      }
      if (key === 'd' && !opts.editableTarget) {
        return CONTEXT_THREAD_SHORTCUT.gotoDiff.action;
      }
      if (key === 'c') {
        // First press focuses composer; second (while typing) submits.
        return CONTEXT_THREAD_SHORTCUT.comment.action;
      }
    }
  }

  // ⌥⇧[ / ⌥⇧] (Alt+Shift+[ / ]): previous/next file on Diff from current file
  if (alt && !mod && !ctrl && shift && (key === '[' || key === ']')) {
    if (opts.editableTarget) return null;
    if (String(opts.layoutMode || '') !== 'diff') return null;
    return key === '['
      ? FILE_NAV_SHORTCUT.prev.action
      : FILE_NAV_SHORTCUT.next.action;
  }

  // ⌥⇧↑ / ⌥⇧↓: page-scroll active panel (Diff list or Conversation timeline)
  if (
    alt &&
    !mod &&
    !ctrl &&
    shift &&
    (key === 'arrowup' || key === 'arrowdown')
  ) {
    if (opts.editableTarget) return null;
    if (layout === 'diff') {
      return key === 'arrowup'
        ? DIFF_PAGE_SCROLL_SHORTCUT.prev.action
        : DIFF_PAGE_SCROLL_SHORTCUT.next.action;
    }
    if (layout === 'centered' || layout === 'conversation') {
      return key === 'arrowup'
        ? CONVERSATION_SCROLL_SHORTCUT.pagePrev.action
        : CONVERSATION_SCROLL_SHORTCUT.pageNext.action;
    }
    return null;
  }

  // ⌥↑ / ⌥↓ (no Shift): Diff selection jump, or Conversation panel scroll
  if (
    alt &&
    !mod &&
    !ctrl &&
    !shift &&
    (key === 'arrowup' || key === 'arrowdown')
  ) {
    if (opts.editableTarget) return null;
    if (layout === 'diff') {
      return key === 'arrowup'
        ? DIFF_OPT_ARROW_SHORTCUT.prev.action
        : DIFF_OPT_ARROW_SHORTCUT.next.action;
    }
    if (layout === 'centered' || layout === 'conversation') {
      return key === 'arrowup'
        ? CONVERSATION_SCROLL_SHORTCUT.optPrev.action
        : CONVERSATION_SCROLL_SHORTCUT.optNext.action;
    }
    return null;
  }

  // ⌥⇧R: toggle viewed/unread for the active Diff file
  if (alt && !mod && !ctrl && shift && key === 'r') {
    if (opts.editableTarget) return null;
    if (layout !== 'diff') return null;
    return TOGGLE_VIEWED_SHORTCUT.action;
  }

  // ⌥J / ⌥K: step prev/next — Find hits, Diff review threads, or Conversation comments.
  // Allowed while Find input is focused (searchOpen); blocked for other editables.
  if (alt && !mod && !ctrl && !shift && (key === 'j' || key === 'k')) {
    if (opts.editableTarget && !opts.searchOpen) return null;
    if (
      !opts.searchOpen &&
      layout !== 'diff' &&
      layout !== 'centered' &&
      layout !== 'conversation'
    ) {
      return null;
    }
    return key === 'k' ? STEP_NAV_SHORTCUT.prev.action : STEP_NAV_SHORTCUT.next.action;
  }

  // ⌥U / ⌥R / ⌥P: toggle Diff review filters (unresolved / resolved / pending)
  // (⌥⌃R is resolve on a focused conversation thread — handled above)
  if (alt && !mod && !ctrl && !shift && (key === 'u' || key === 'r' || key === 'p')) {
    if (opts.editableTarget) return null;
    if (layout !== 'diff') return null;
    if (key === 'u') return REVIEW_FILTER_SHORTCUT.unresolved.action;
    if (key === 'r') return REVIEW_FILTER_SHORTCUT.resolved.action;
    return REVIEW_FILTER_SHORTCUT.pending.action;
  }

  // ⌥[ / ⌥] / ⌥1–9: stack path or list-adjacent PR navigation (modal/sheet)
  if (alt && !mod && !ctrl && !shift && !opts.editableTarget) {
    if (key === '[') return 'navAdjacentPrev';
    if (key === ']') return 'navAdjacentNext';
    if (/^[1-9]$/.test(key)) return `navStackDigit${key}`;
  }

  // Diff line-selection move (no Opt): plain arrows = single-line move;
  // Shift+arrows = extend range. Allowed without an active selection so that
  // after file nav the first arrow seeds the first displayed line of the file.
  if (
    !alt &&
    !mod &&
    (key === 'arrowup' || key === 'arrowdown') &&
    String(opts.layoutMode || '') === 'diff'
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
  if (mod && !alt && !shift && !ctrl && key === 'f') return 'openSearch';

  // Remaining product shortcuts are Option-only (Ctrl only used with ⌥ for resolve)
  if (!alt || mod) return null;
  if (ctrl) return null;

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

  // ⌥B → toggle Diff files nav / Conversation metadata rail
  if (key === 'b') return TOGGLE_SIDE_PANEL_SHORTCUT.action;

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

/**
 * Push a review-thread as one navigable unit (root only — not individual replies).
 */
function pushThreadFocusTarget(
  out: Array<{ id: string; kind: string; anchor: string }>,
  thread: any
) {
  if (!thread || thread.id == null) return;
  out.push({
    id: String(thread.id),
    kind: 'review-thread',
    anchor: `review-comment:${thread.id}`,
  });
}

/**
 * Ordered list of focusable conversation targets in **page visual order**.
 * Thread navigation is by **thread unit**, not per-reply:
 *   review-group → each included thread → …
 *   standalone review-thread (one stop)
 * Skips pending review-groups (composer-only).
 */
export function listConversationCommentFocusTargets(
  items: any
): Array<{ id: string; kind: string; anchor: string }> {
  const list = Array.isArray(items) ? items : [];
  const out: Array<{ id: string; kind: string; anchor: string }> = [];
  for (const item of list) {
    if (!item) continue;
    // Pending review-group lives in the composer, not the timeline
    if (item.kind === 'review-group' && item.pending) continue;

    if (item.kind === 'review-group') {
      // 1) group card first
      out.push({
        id: String(item.id),
        kind: 'review-group',
        anchor: `review-group:${item.id}`,
      });
      // 2) each included file thread as one step (path/line order from builder)
      for (const t of item.threads || []) {
        pushThreadFocusTarget(out, t);
      }
      continue;
    }

    if (item.kind === 'review-thread' || item.kind === 'review-comment') {
      pushThreadFocusTarget(out, item);
      continue;
    }

    const anchor = conversationCommentFocusAnchor(item);
    if (!anchor) continue;
    out.push({
      id: String(item.id),
      kind: String(item.kind || ''),
      anchor,
    });
  }
  return out;
}

/**
 * Step conversation comment focus by delta (wraps). When no current anchor,
 * first press lands on first (delta>0) or last (delta<0).
 */
export function stepConversationCommentFocus(
  items: any,
  currentAnchor: unknown,
  delta: number
): { id: string; kind: string; anchor: string } | null {
  const targets = listConversationCommentFocusTargets(items);
  if (!targets.length) return null;
  const d = delta < 0 ? -1 : 1;
  const cur = String(currentAnchor || '').trim();
  let idx = cur ? targets.findIndex((t) => t.anchor === cur) : -1;
  if (idx < 0) {
    // Seed: down → first, up → last
    return d > 0 ? targets[0] : targets[targets.length - 1];
  }
  const next = ((idx + d) % targets.length + targets.length) % targets.length;
  return targets[next];
}

/**
 * Apply a signed scroll delta to a scroller element (clamped).
 * Pure helper for conversation Opt-arrow / page scroll.
 */
export function applyScrollerDelta(
  el: { scrollTop?: number; clientHeight?: number; scrollHeight?: number } | null,
  deltaPx: number
): number {
  if (!el || typeof el.scrollTop !== 'number') return 0;
  const top = Math.max(0, Number(el.scrollTop) || 0);
  const vh = Math.max(0, Number(el.clientHeight) || 0);
  const sh = Math.max(0, Number(el.scrollHeight) || 0);
  const max = Math.max(0, sh - vh);
  const next = Math.min(max, Math.max(0, top + (Number(deltaPx) || 0)));
  el.scrollTop = next;
  return next;
}
