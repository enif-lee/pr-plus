import {
  DIFF_OPT_ARROW_SHORTCUT,
  FILE_NAV_SHORTCUT,
  GITHUB_COMMAND_PALETTE_SELECTOR,
  GITHUB_PALETTE_ESCAPE_GRACE_MS,
  STEP_NAV_SHORTCUT,
  TOGGLE_SIDE_PANEL_SHORTCUT,
} from './shortcut-policy-constants';

/** Split from shortcut-policy.ts: shortcut-policy-keys */
/** @module modal/lib/shortcut-policy */
/**
 * Pure policy for PR modal global shortcuts.
 * Product chords use Option (former mod/⌘ → opt/⌥) except Find:
 *   find ⌘F / Ctrl+F · open palette ⌥⇧K · fullscreen ⌥⇧F · diff toggle ⌥.
 * Option+J/K step nav, Option+Shift+[ / ] file nav, stack digits, [ ] adjacent, Esc.
 */

/** Option/Alt + J/K — step prev/next (find hits or review threads). */
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
export function isComposerKeyboardTarget(
  el: EventTarget | null | undefined
): boolean {
  if (!el || typeof el !== 'object') return false;
  const node = el as HTMLElement;
  try {
    if (node.closest?.('[data-prp-composer], .prp-mdc')) return true;
    if (node.classList?.contains?.('prp-mdc__ta')) return true;
  } catch {
    /* ignore */
  }
  return false;
}

/**
 * Resolve Option / ⌘Enter chords when a comment/reply composer is focused.
 * Returns null when not composer-focused or chord does not apply.
 *
 * @param {{
 *   mod?: boolean,
 *   shift?: boolean,
 *   alt?: boolean,
 *   ctrl?: boolean,
 *   key?: string,
 *   code?: string,
 *   composerFocused?: boolean,
 *   canResolve?: boolean,
 *   canToggleMode?: boolean,
 * }} [opts]
 * @returns {string|null}
 */
export let _githubPaletteLastOpenAt = 0;

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
  if (/^[[\]. ,/\\;'`=-]$/.test(k)) return false;
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

/** INPUT types that accept typed text (block product arrow/selection keys). */
export const TEXT_INPUT_TYPES = new Set([
  '',
  'text',
  'search',
  'email',
  'password',
  'url',
  'tel',
  'number',
  'date',
  'datetime-local',
  'month',
  'week',
  'time',
]);

/**
 * Whether focus is in a **text-entry** control that should own keyboard input.
 *
 * Radio / checkbox / button inputs are **not** text entry — e.g. Diff toolbar
 * Unified/Split radios must not trap Arrow keys after toggle (native radio
 * group would otherwise steal line-selection arrows).
 */
export function isEditableKeyboardTarget(
  el: EventTarget | null | undefined
): boolean {
  if (!el || typeof el !== 'object') return false;
  const node = el as HTMLElement;
  if (node.isContentEditable) return true;
  const tag = String(node.tagName || '').toUpperCase();
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const type = String(
      (node as HTMLInputElement).type || 'text'
    ).toLowerCase();
    return TEXT_INPUT_TYPES.has(type);
  }
  // Nested: typing surface inside a host (composer, title field)
  if (node.closest?.('textarea, select, [contenteditable="true"]')) {
    return true;
  }
  const input = node.closest?.('input') as HTMLInputElement | null;
  if (input) {
    const type = String(input.type || 'text').toLowerCase();
    return TEXT_INPUT_TYPES.has(type);
  }
  return false;
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
 *   diffThreadFocused?: boolean,  // Diff review-thread focus (commentIndex / active id)
 *   hasLineSelection?: boolean,   // Diff **code-body** line selection only
 *                                 // (not thread/file caret — those keep thread fold)
 *   searchOpen?: boolean,
 *   layoutMode?: string,
 * }} opts
 * @returns {string|null}
 */
