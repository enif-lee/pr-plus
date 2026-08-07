/** @module modal/lib/shortcut-monitor */
/**
 * Pure helpers for the bottom-right shortcut monitor HUD:
 * - Format `[{shortcut} - {action title}]` for fired chords
 * - Opt-hold indicator label
 * - Dismiss timing / visibility
 *
 * Kept free of React so unit tests drive the real shipped logic.
 */

import {
  STEP_NAV_SHORTCUT,
  FILE_NAV_SHORTCUT,
  DIFF_PAGE_SCROLL_SHORTCUT,
  TOGGLE_VIEWED_SHORTCUT,
  FILE_FOLD_SHORTCUT,
  REVIEW_FILTER_SHORTCUT,
} from './shortcut-policy';
import { PR_MODAL_OPT_ACTIONS } from './command-palette';
import { formatMessage } from './i18n';

/** Auto-dismiss fired-action HUD after this idle (ms). Successive fires reset. */
export const SHORTCUT_MONITOR_DISMISS_MS = 1800;

/**
 * Bottom-center shortcut / action monitor size (extension prefs).
 * - none: hidden
 * - small: current default (1×)
 * - medium: 2×
 * - large: 3×
 */
export type ShortcutMonitorSize = 'none' | 'small' | 'medium' | 'large';

export const SHORTCUT_MONITOR_SIZE_OPTIONS: readonly ShortcutMonitorSize[] = [
  'none',
  'small',
  'medium',
  'large',
] as const;

/** Default when unset / unknown. */
export const DEFAULT_SHORTCUT_MONITOR_SIZE: ShortcutMonitorSize = 'small';

/**
 * Normalize a prefs value to a known size. Unknown → small.
 */
export function normalizeShortcutMonitorSize(
  raw: unknown
): ShortcutMonitorSize {
  const v = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (v === 'none' || v === 'off' || v === 'hidden' || v === '0') return 'none';
  if (v === 'medium' || v === 'md' || v === '2' || v === '2x') return 'medium';
  if (v === 'large' || v === 'lg' || v === '3' || v === '3x') return 'large';
  if (v === 'small' || v === 'sm' || v === '1' || v === '1x') return 'small';
  // boolean false from old experiments → none
  if (raw === false) return 'none';
  return DEFAULT_SHORTCUT_MONITOR_SIZE;
}

export function isShortcutMonitorEnabled(size: unknown): boolean {
  return normalizeShortcutMonitorSize(size) !== 'none';
}

export type ShortcutMonitorFire = {
  action: string;
  shortcut: string;
  title: string;
  /** Full HUD line: `[{shortcut} - {title}]` */
  text: string;
  /** epoch ms when fired */
  at: number;
};

export type ShortcutMonitorEntry = {
  title: string;
  labelMac: string;
  labelWin: string;
};

/**
 * Action id → human title + chord labels for the modal capture handler.
 * Opt-palette peers are merged from PR_MODAL_OPT_ACTIONS (first wins per action).
 */
export const SHORTCUT_MONITOR_CATALOG: Record<string, ShortcutMonitorEntry> = {
  openPalette: {
    title: 'Command palette',
    labelMac: '⌥⇧K',
    labelWin: 'Alt+Shift+K',
  },
  toggleDiff: {
    title: 'Toggle Diff / Conversation',
    labelMac: '⌥.',
    labelWin: 'Alt+.',
  },
  openSearch: {
    title: 'Find in PR',
    labelMac: '⌘F',
    labelWin: 'Ctrl+F',
  },
  toggleFullscreen: {
    title: 'Toggle fullscreen',
    labelMac: '⌥⇧F',
    labelWin: 'Alt+Shift+F',
  },
  refreshDetail: {
    title: 'Refresh PR detail',
    labelMac: '⌥⇧G',
    labelWin: 'Alt+Shift+G',
  },
  focusConversationComment: {
    title: 'Focus conversation comment',
    labelMac: '⌥⇧C',
    labelWin: 'Alt+Shift+C',
  },
  clearConversationCommentFocus: {
    title: 'Clear thread focus',
    labelMac: '⌥⇧C',
    labelWin: 'Alt+Shift+C',
  },
  restoreNativeView: {
    title: 'Show GitHub PR page',
    labelMac: 'Esc',
    labelWin: 'Esc',
  },
  stepNavPrev: {
    title: 'Previous step',
    labelMac: STEP_NAV_SHORTCUT.prev.labelMac,
    labelWin: STEP_NAV_SHORTCUT.prev.labelWin,
  },
  stepNavNext: {
    title: 'Next step',
    labelMac: STEP_NAV_SHORTCUT.next.labelMac,
    labelWin: STEP_NAV_SHORTCUT.next.labelWin,
  },
  navFilePrev: {
    title: 'Previous file',
    labelMac: FILE_NAV_SHORTCUT.prev.labelMac,
    labelWin: FILE_NAV_SHORTCUT.prev.labelWin,
  },
  navFileNext: {
    title: 'Next file',
    labelMac: FILE_NAV_SHORTCUT.next.labelMac,
    labelWin: FILE_NAV_SHORTCUT.next.labelWin,
  },
  scrollDiffPagePrev: {
    title: 'Scroll Diff page up',
    labelMac: DIFF_PAGE_SCROLL_SHORTCUT.prev.labelMac,
    labelWin: DIFF_PAGE_SCROLL_SHORTCUT.prev.labelWin,
  },
  scrollDiffPageNext: {
    title: 'Scroll Diff page down',
    labelMac: DIFF_PAGE_SCROLL_SHORTCUT.next.labelMac,
    labelWin: DIFF_PAGE_SCROLL_SHORTCUT.next.labelWin,
  },
  optArrowScrollSelectPrev: {
    title: 'Jump selection up + scroll',
    labelMac: '⌥↑',
    labelWin: 'Alt+↑',
  },
  optArrowScrollSelectNext: {
    title: 'Jump selection down + scroll',
    labelMac: '⌥↓',
    labelWin: 'Alt+↓',
  },
  toggleViewedActiveFile: {
    title: 'Toggle file viewed',
    labelMac: TOGGLE_VIEWED_SHORTCUT.labelMac,
    labelWin: TOGGLE_VIEWED_SHORTCUT.labelWin,
  },
  toggleActiveFileCollapse: {
    title: 'Fold / expand focused file',
    labelMac: FILE_FOLD_SHORTCUT.labelMac,
    labelWin: FILE_FOLD_SHORTCUT.labelWin,
  },
  toggleReviewFilterUnresolved: {
    title: 'Filter unresolved',
    labelMac: REVIEW_FILTER_SHORTCUT.unresolved.labelMac,
    labelWin: REVIEW_FILTER_SHORTCUT.unresolved.labelWin,
  },
  toggleReviewFilterResolved: {
    title: 'Filter resolved',
    labelMac: REVIEW_FILTER_SHORTCUT.resolved.labelMac,
    labelWin: REVIEW_FILTER_SHORTCUT.resolved.labelWin,
  },
  toggleReviewFilterPending: {
    title: 'Filter pending',
    labelMac: REVIEW_FILTER_SHORTCUT.pending.labelMac,
    labelWin: REVIEW_FILTER_SHORTCUT.pending.labelWin,
  },
  moveSelectionUp: {
    title: 'Move selection up',
    labelMac: '↑',
    labelWin: '↑',
  },
  moveSelectionDown: {
    title: 'Move selection down',
    labelMac: '↓',
    labelWin: '↓',
  },
  extendSelectionUp: {
    title: 'Extend selection up',
    labelMac: '⇧↑',
    labelWin: 'Shift+↑',
  },
  extendSelectionDown: {
    title: 'Extend selection down',
    labelMac: '⇧↓',
    labelWin: 'Shift+↓',
  },
  navAdjacentPrev: {
    title: 'Previous PR',
    labelMac: '⌥[',
    labelWin: 'Alt+[',
  },
  navAdjacentNext: {
    title: 'Next PR',
    labelMac: '⌥]',
    labelWin: 'Alt+]',
  },
  copySelectionCode: {
    title: 'Copy selection code',
    labelMac: '⌘C',
    labelWin: 'Ctrl+C',
  },
  copySelectionUrl: {
    title: 'Copy selection URL',
    labelMac: '⌘⌥C',
    labelWin: 'Ctrl+Alt+C',
  },
  openSelectionComment: {
    title: 'Comment on selection',
    labelMac: '⌥C',
    labelWin: 'Alt+C',
  },
  scrollConversationOptPrev: {
    title: 'Scroll conversation up',
    labelMac: '⌥↑',
    labelWin: 'Alt+↑',
  },
  scrollConversationOptNext: {
    title: 'Scroll conversation down',
    labelMac: '⌥↓',
    labelWin: 'Alt+↓',
  },
  scrollConversationPagePrev: {
    title: 'Conversation page up',
    labelMac: '⌥⇧↑',
    labelWin: 'Alt+Shift+↑',
  },
  scrollConversationPageNext: {
    title: 'Conversation page down',
    labelMac: '⌥⇧↓',
    labelWin: 'Alt+Shift+↓',
  },
  closePalette: {
    title: 'Close palette',
    labelMac: 'Esc',
    labelWin: 'Esc',
  },
  cancelEdit: {
    title: 'Cancel edit',
    labelMac: 'Esc',
    labelWin: 'Esc',
  },
  escapeNav: {
    title: 'Dismiss',
    labelMac: 'Esc',
    labelWin: 'Esc',
  },
  // Context-thread / fold (often fired on Diff + Conversation — missing → HUD showed "?")
  contextThreadFold: {
    title: 'Fold / expand thread',
    labelMac: '⌥F',
    labelWin: 'Alt+F',
  },
  contextThreadGotoDiff: {
    title: 'View in Diff',
    labelMac: '⌥D',
    labelWin: 'Alt+D',
  },
  contextThreadComment: {
    title: 'Comment on thread',
    labelMac: '⌥C',
    labelWin: 'Alt+C',
  },
  contextThreadResolve: {
    title: 'Resolve / unresolve',
    labelMac: '⌥⌃R',
    labelWin: 'Alt+Ctrl+R',
  },
  contextCommentCopyBody: {
    title: 'Copy comment',
    labelMac: '⌥Y',
    labelWin: 'Alt+Y',
  },
  contextCommentCopyLink: {
    title: 'Copy link',
    labelMac: '⌥L',
    labelWin: 'Alt+L',
  },
  contextCommentQuote: {
    title: 'Quote reply',
    labelMac: '⌥Q',
    labelWin: 'Alt+Q',
  },
  contextCommentHide: {
    title: 'Hide / unhide comment',
    labelMac: '⌥H',
    labelWin: 'Alt+H',
  },
  contextCommentEdit: {
    title: 'Edit comment',
    labelMac: '⌥W',
    labelWin: 'Alt+W',
  },
  contextCommentDelete: {
    title: 'Delete comment',
    labelMac: '⌥X',
    labelWin: 'Alt+X',
  },
  contextCommentReact: {
    title: 'Add reaction',
    labelMac: '⌥E',
    labelWin: 'Alt+E',
  },
  composerSubmit: {
    title: 'Submit composer',
    labelMac: '⌥C · ⌘↵',
    labelWin: 'Alt+C · Ctrl+Enter',
  },
  composerResolve: {
    title: 'Resolve conversation',
    labelMac: '⌥⌃R',
    labelWin: 'Alt+Ctrl+R',
  },
  composerFocusInput: {
    title: 'Focus composer input',
    labelMac: '⌥I',
    labelWin: 'Alt+I',
  },
  composerModeToggle: {
    title: 'Toggle comment / review mode',
    labelMac: '⌥T',
    labelWin: 'Alt+T',
  },
  contextThreadCollapse: {
    title: 'Collapse thread',
    labelMac: '←',
    labelWin: '←',
  },
  contextThreadExpand: {
    title: 'Expand thread',
    labelMac: '→',
    labelWin: '→',
  },
  collapseActiveFile: {
    title: 'Collapse file',
    labelMac: '←',
    labelWin: '←',
  },
  expandActiveFile: {
    title: 'Expand file',
    labelMac: '→',
    labelWin: '→',
  },
  collapseFold: {
    title: 'Collapse',
    labelMac: '←',
    labelWin: '←',
  },
  expandFold: {
    title: 'Expand',
    labelMac: '→',
    labelWin: '→',
  },
  toggleSidePanel: {
    title: 'Toggle side panel',
    labelMac: '⌥B',
    labelWin: 'Alt+B',
  },
  leaveReview: {
    title: 'Leave review',
    labelMac: '⌥↵',
    labelWin: 'Alt+Enter',
  },
};

// Merge opt peers: action id → entry (first definition wins for shared actions)
for (const def of PR_MODAL_OPT_ACTIONS as readonly {
  action: string;
  title: string;
  labelMac: string;
  labelWin: string;
}[]) {
  const a = String(def.action || '');
  if (!a || SHORTCUT_MONITOR_CATALOG[a]) continue;
  SHORTCUT_MONITOR_CATALOG[a] = {
    title: def.title,
    labelMac: def.labelMac,
    labelWin: def.labelWin,
  };
}

/** camelCase action id → monitor_* catalog key */
function monitorTitleKeyForAction(actionId: string): string {
  const snake = String(actionId || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/-/g, '_')
    .toLowerCase();
  // Map catalog ids that differ slightly from key names
  const aliases: Record<string, string> = {
    toggle_review_filter_unresolved: 'monitor_filter_unresolved',
    toggle_review_filter_resolved: 'monitor_filter_resolved',
    toggle_review_filter_pending: 'monitor_filter_pending',
  };
  if (aliases[snake]) return aliases[snake];
  return `monitor_${snake}`;
}

function resolveMonitorLocale(
  locale?: string | null
): string {
  if (locale) return locale;
  try {
    if (typeof document !== 'undefined') {
      return (
        document.documentElement.getAttribute('data-prp-app-locale') ||
        document.documentElement.getAttribute('data-prp-ui-language') ||
        'en'
      );
    }
  } catch {
    /* ignore */
  }
  return 'en';
}

/** `[{shortcut} - {title}]` — criterion 1 format. Never surface bare `?`. */
export function formatShortcutMonitorText(
  shortcut: string,
  title: string,
  locale?: string | null
): string {
  const s = String(shortcut || '').trim();
  const fallback = formatMessage(
    'monitor_action',
    resolveMonitorLocale(locale)
  );
  const t = String(title || '').trim() || fallback || 'Action';
  if (!s || s === '?') return `[${t}]`;
  return `[${s} - ${t}]`;
}

export function formatOptHeldLabel(
  isMac = true,
  locale?: string | null
): string {
  const loc = resolveMonitorLocale(locale);
  return isMac
    ? formatMessage('monitor_opt_held', loc)
    : formatMessage('monitor_alt_held', loc);
}

/**
 * Resolve display shortcut + title for a modal action id.
 * navStackDigitN → "Stack slot N".
 * Titles resolve via pure catalogs when locale is set / stamped.
 */
export function describeShortcutAction(
  action: string,
  isMac = true,
  locale?: string | null
): { shortcut: string; title: string } {
  const loc = resolveMonitorLocale(locale);
  const id = String(action || '').trim();
  if (!id) {
    return {
      shortcut: '',
      title: formatMessage('monitor_action', loc) || 'Action',
    };
  }

  const stack = id.match(/^navStackDigit([1-9])$/);
  if (stack) {
    const n = stack[1];
    return {
      shortcut: isMac ? `⌥${n}` : `Alt+${n}`,
      title: formatMessage('monitor_stack_slot', loc, { n }) ||
        `Open stack PR slot ${n}`,
    };
  }

  const entry = SHORTCUT_MONITOR_CATALOG[id];
  if (entry) {
    const key = monitorTitleKeyForAction(id);
    const localized = formatMessage(key, loc);
    const title =
      localized && localized !== key ? localized : entry.title;
    return {
      shortcut: isMac ? entry.labelMac : entry.labelWin,
      title,
    };
  }

  // Fallback: humanized action name only (no "?" keycap)
  const title = id
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase());
  return { shortcut: '', title };
}

export function buildShortcutMonitorFire(
  action: string,
  isMac = true,
  at = Date.now(),
  locale?: string | null
): ShortcutMonitorFire {
  const loc = resolveMonitorLocale(locale);
  const { shortcut, title } = describeShortcutAction(action, isMac, loc);
  return {
    action: String(action || ''),
    shortcut,
    title,
    text: formatShortcutMonitorText(shortcut, title, loc),
    at: Number(at) || Date.now(),
  };
}

/** When the handler already has title + chord (opt peer). */
export function buildShortcutMonitorFireFromParts(
  shortcut: string,
  title: string,
  action = '',
  at = Date.now(),
  locale?: string | null
): ShortcutMonitorFire {
  const loc = resolveMonitorLocale(locale);
  let s = String(shortcut || '').trim();
  let t = String(title || '').trim();
  // Prefer catalog chord + localized title when action is known
  if (action) {
    const desc = describeShortcutAction(action, true, loc);
    if ((!s || s === '?') && desc.shortcut) s = desc.shortcut;
    // Prefer localized catalog title over English peer title
    if (desc.title) t = desc.title;
  }
  if (!t) t = formatMessage('monitor_action', loc) || 'Action';
  if (s === '?') s = '';
  return {
    action: String(action || ''),
    shortcut: s,
    title: t,
    text: formatShortcutMonitorText(s, t, loc),
    at: Number(at) || Date.now(),
  };
}

export function isShortcutMonitorFireActive(
  fire: ShortcutMonitorFire | null | undefined,
  now = Date.now(),
  dismissMs = SHORTCUT_MONITOR_DISMISS_MS
): boolean {
  if (!fire || !fire.text) return false;
  const age = (Number(now) || 0) - (Number(fire.at) || 0);
  return age >= 0 && age < dismissMs;
}

/**
 * Opt-alone hold for the monitor: Alt/Option down, no Shift / ⌘ / Ctrl.
 * Chord combos (⌥⇧, ⌥⌘, …) must not show “⌥ held”.
 */
export function isOptAloneHeld(mods: {
  alt?: boolean;
  shift?: boolean;
  mod?: boolean;
  meta?: boolean;
  ctrl?: boolean;
} = {}): boolean {
  if (!mods.alt) return false;
  if (mods.shift) return false;
  if (mods.mod || mods.meta || mods.ctrl) return false;
  return true;
}

/**
 * Single floating HUD content (never stacked lines).
 * Priority: active fire text > Opt-alone held label > hidden.
 */
export function resolveShortcutMonitorView(
  fire: ShortcutMonitorFire | null | undefined,
  optAloneHeld: boolean,
  opts: { isMac?: boolean; now?: number; dismissMs?: number } = {}
): {
  visible: boolean;
  mode: 'fire' | 'held' | 'hidden';
  text: string;
  /** @deprecated use mode/text — kept for older call sites */
  showFire: boolean;
  showHeld: boolean;
  fireText: string;
  heldText: string;
} {
  const isMac = opts.isMac !== false;
  const now = opts.now != null ? Number(opts.now) : Date.now();
  const dismissMs =
    opts.dismissMs != null ? Number(opts.dismissMs) : SHORTCUT_MONITOR_DISMISS_MS;
  const fireActive = isShortcutMonitorFireActive(fire, now, dismissMs);
  const heldLabel = formatOptHeldLabel(isMac);

  if (fireActive && fire?.text) {
    return {
      visible: true,
      mode: 'fire',
      text: fire.text,
      showFire: true,
      showHeld: false,
      fireText: fire.text,
      heldText: '',
    };
  }
  if (optAloneHeld) {
    return {
      visible: true,
      mode: 'held',
      text: heldLabel,
      showFire: false,
      showHeld: true,
      fireText: '',
      heldText: heldLabel,
    };
  }
  return {
    visible: false,
    mode: 'hidden',
    text: '',
    showFire: false,
    showHeld: false,
    fireText: '',
    heldText: '',
  };
}
