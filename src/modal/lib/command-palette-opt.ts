/** @module modal/lib/command-palette */
/**
 * Linear-style command palette registry + filter for the PR modal.
 * Commands are pure data; runners are injected by the App.
 *
 * Keyboard: most product chords are opt/⌥; Find stays mod/⌘F.
 *   mod+.        → opt+.
 *   mod+f        → mod+f (Find)
 *   mod+shift+X  → opt+shift+X
 */
import { allowedMergeMethods, canUpdateBranch } from './merge-box-status';


/**
 * @typedef {{
 *   id: string,
 *   title: string,
 *   section?: string,
 *   keywords?: string[],
 *   shortcut?: string,
 *   action: string,
 *   payload?: object,
 * }} PaletteCommand
 */

/**
 * PR detail actions on Option chords (former mod/⌘ → opt/⌥).
 * `shift: true`  → ⌥⇧letter
 * `shift: false` → ⌥letter (or ⌥.)
 *
 * Reserved plain Opt: j/k step-nav, 1–9 stack, [ ] adjacent.
 */
export const PR_MODAL_OPT_ACTIONS = [
  {
    id: 'opt-toggle-diff',
    action: 'toggleDiff',
    title: 'Toggle Diff / Conversation',
    key: '.',
    code: 'Period',
    shift: false,
    labelMac: '⌥.',
    labelWin: 'Alt+.',
    section: 'Navigate',
  },
  {
    id: 'opt-fullscreen',
    action: 'toggleFullscreen',
    title: 'Toggle fullscreen',
    key: 'f',
    code: 'KeyF',
    shift: true,
    labelMac: '⌥⇧F',
    labelWin: 'Alt+Shift+F',
    section: 'Navigate',
  },
  {
    id: 'opt-edit-title',
    action: 'editTitle',
    title: 'Edit PR title…',
    key: 't',
    code: 'KeyT',
    shift: true,
    labelMac: '⌥⇧T',
    labelWin: 'Alt+Shift+T',
    section: 'PR',
  },
  // Edit PR description: no plain ⌥E (reserved for comment reaction picker).
  // Reach via command palette / UI pencil.
  {
    id: 'opt-base',
    action: 'promptBase',
    title: 'Change base branch…',
    key: 'b',
    code: 'KeyB',
    shift: true,
    labelMac: '⌥⇧B',
    labelWin: 'Alt+Shift+B',
    section: 'PR',
  },
  {
    id: 'opt-labels',
    action: 'promptLabels',
    title: 'Set labels…',
    key: 'l',
    code: 'KeyL',
    shift: true,
    labelMac: '⌥⇧L',
    labelWin: 'Alt+Shift+L',
    section: 'PR',
  },
  {
    id: 'opt-milestone',
    action: 'promptMilestone',
    title: 'Set milestone…',
    key: 'p',
    code: 'KeyP',
    shift: true,
    labelMac: '⌥⇧P',
    labelWin: 'Alt+Shift+P',
    section: 'PR',
  },
  {
    id: 'opt-draft-stage',
    action: 'toggleDraftStage',
    title: 'Convert to draft / Ready for review',
    key: 'd',
    code: 'KeyD',
    shift: true,
    labelMac: '⌥⇧D',
    labelWin: 'Alt+Shift+D',
    section: 'PR',
  },
  {
    id: 'opt-merge',
    action: 'mergePr',
    title: 'Merge pull request…',
    key: 'm',
    code: 'KeyM',
    shift: true,
    labelMac: '⌥⇧M',
    labelWin: 'Alt+Shift+M',
    section: 'Merge',
    payload: { method: 'merge' },
  },
  {
    id: 'opt-update-branch',
    action: 'updateBranch',
    title: 'Update branch from base',
    key: 'u',
    code: 'KeyU',
    shift: true,
    labelMac: '⌥⇧U',
    labelWin: 'Alt+Shift+U',
    section: 'Merge',
  },
  {
    id: 'opt-reviewer',
    action: 'promptAddReviewer',
    title: 'Add reviewer…',
    key: 'r',
    code: 'KeyR',
    shift: true,
    labelMac: '⌥⇧R',
    labelWin: 'Alt+Shift+R',
    section: 'People',
  },
  {
    id: 'opt-assignee',
    action: 'promptAddAssignee',
    title: 'Add assignee…',
    key: 'a',
    code: 'KeyA',
    shift: true,
    labelMac: '⌥⇧A',
    labelWin: 'Alt+Shift+A',
    section: 'People',
  },
  {
    id: 'opt-review-comment',
    action: 'leaveReview',
    title: 'Submit review: Comment',
    key: 'Enter',
    code: 'Enter',
    shift: false,
    labelMac: '⌥↵',
    labelWin: 'Alt+Enter',
    section: 'Review',
    payload: { kind: 'comment' },
  },
  {
    id: 'opt-review-approve',
    action: 'leaveReview',
    title: 'Submit review: Approve',
    key: 'Enter',
    code: 'Enter',
    shift: true,
    labelMac: '⌥⇧↵',
    labelWin: 'Alt+Shift+Enter',
    section: 'Review',
    payload: { kind: 'approve' },
  },
  {
    id: 'opt-review-changes',
    action: 'leaveReview',
    title: 'Submit review: Request changes',
    key: 'x',
    code: 'KeyX',
    shift: true,
    labelMac: '⌥⇧X',
    labelWin: 'Alt+Shift+X',
    section: 'Review',
    payload: { kind: 'request_changes' },
  },
  {
    id: 'opt-apply-suggestion',
    action: 'applySuggestion',
    title: 'Apply focused suggestion',
    key: 's',
    code: 'KeyS',
    shift: true,
    labelMac: '⌥⇧S',
    labelWin: 'Alt+Shift+S',
    section: 'Review',
  },
  {
    id: 'opt-refresh',
    action: 'refreshDetail',
    title: 'Refresh PR detail',
    key: 'g',
    code: 'KeyG',
    shift: true,
    labelMac: '⌥⇧G',
    labelWin: 'Alt+Shift+G',
    section: 'Navigate',
  },
] as const;

/**
 * Whether PR modal Option peers may run while focus is in an editable.
 *
 * - Opt+Shift (⌥⇧L labels, ⌥⇧P milestone, …) → always allow: these chords
 *   never type characters and are shown on Opt-hold tips even in composers.
 * - Plain Opt (⌥., ⌥I, …) → block while typing so text entry and
 *   composer-local chords are not stolen. (⌥E = comment reaction when focused.)
 */
export function allowPrModalOptPeerWhileEditable(opts: {
  editableTarget?: boolean;
  shift?: boolean;
} = {}): boolean {
  if (!opts.editableTarget) return true;
  return Boolean(opts.shift);
}

/**
 * Resolve Option(+Shift) command for PR detail.
 * Modifier-only keydowns never match.
 */
export function resolvePrModalOptAction(opts: {
  alt?: boolean;
  shift?: boolean;
  mod?: boolean;
  key?: string;
  code?: string;
} = {}) {
  if (!opts.alt || opts.mod) return null;
  const code = String(opts.code || '');
  const shift = Boolean(opts.shift);

  if (
    /^(Shift|Alt|Meta|Control)(Left|Right)?$/i.test(code) ||
    /^(Shift|Alt|Meta|Control)$/i.test(String(opts.key || ''))
  ) {
    return null;
  }

  const pack = (def: (typeof PR_MODAL_OPT_ACTIONS)[number]) => ({
    id: def.id,
    action: def.action,
    title: def.title,
    payload: (def as any).payload || {},
    key: def.key,
    labelMac: def.labelMac,
    labelWin: def.labelWin,
    shift: Boolean(def.shift),
  });

  // Match by KeyboardEvent.code + required shift state
  for (const def of PR_MODAL_OPT_ACTIONS) {
    if (Boolean(def.shift) !== shift) continue;
    if (code === def.code || code.toLowerCase() === String(def.code).toLowerCase()) {
      return pack(def);
    }
    // NumpadEnter ≡ Enter
    if (
      def.code === 'Enter' &&
      (code === 'NumpadEnter' || code === 'Enter')
    ) {
      return pack(def);
    }
  }

  // Fallback when code missing: ASCII letter/digit/. only (glyphs need code)
  const rawKey = String(opts.key || '');
  let letter = '';
  if (rawKey === '.' || rawKey === 'Period') letter = '.';
  else if (rawKey === 'Enter') letter = 'Enter';
  else if (/^[a-zA-Z0-9]$/.test(rawKey)) letter = rawKey.toLowerCase();
  else {
    // code-based recovery if caller passed a macOS Option glyph as key
    // but forgot code — cannot map glyph alone
    return null;
  }

  for (const def of PR_MODAL_OPT_ACTIONS) {
    if (Boolean(def.shift) !== shift) continue;
    if (def.key === letter || def.key.toLowerCase() === letter) return pack(def);
  }
  return null;
}

/**
 * Opt-hold slots for UI hints (button popovers).
 */
export function buildPrModalOptHoldSlots(opts: { isMac?: boolean } = {}) {
  const isMac = opts.isMac !== false;
  return PR_MODAL_OPT_ACTIONS.map((d) => ({
    id: d.id,
    title: d.title,
    label: isMac ? d.labelMac : d.labelWin,
    key: d.key,
    action: d.action,
    payload: (d as any).payload || {},
    section: d.section,
    shift: Boolean(d.shift),
  }));
}

/** Palette command id → opt chord string (former mod → opt). */
export function optShortcutForCommandId(commandId: string): string | null {
  const map: Record<string, string> = {
    'toggle-diff': 'opt+.',
    'find-in-pr': 'mod+f',
    'toggle-fullscreen': 'opt+shift+f',
    'edit-title': 'opt+shift+t',
    // edit-body: no opt chord (⌥E = comment reaction)
    'set-base': 'opt+shift+b',
    'set-labels': 'opt+shift+l',
    'set-milestone': 'opt+shift+p',
    'convert-draft': 'opt+shift+d',
    'ready-review': 'opt+shift+d',
    'merge-pr': 'opt+shift+m',
    'update-branch': 'opt+shift+u',
    'add-reviewer': 'opt+shift+r',
    'set-assignee': 'opt+shift+a',
    'review-comment': 'opt+enter',
    'review-approve': 'opt+shift+enter',
    'review-changes': 'opt+shift+x',
    'apply-suggestion': 'opt+shift+s',
    // Refresh PR detail (⌥⇧G — free peer; not used by nav/merge/labels)
    'refresh-pr': 'opt+shift+g',
    // Conversation focus seed / clear (⌥⇧C)
    'focus-conversation-comment': 'opt+shift+c',
    'clear-conversation-comment-focus': 'opt+shift+c',
    // Diff view
    'diff-prev-file': 'opt+shift+[',
    'diff-next-file': 'opt+shift+]',
    'diff-page-up': 'opt+shift+arrowup',
    'diff-page-down': 'opt+shift+arrowdown',
    'diff-opt-arrow-up': 'opt+arrowup',
    'diff-opt-arrow-down': 'opt+arrowdown',
    'diff-toggle-viewed': 'opt+shift+r',
    'diff-fold-file': 'opt+f',
    'diff-step-prev': 'opt+k',
    'diff-step-next': 'opt+j',
    'diff-filter-unresolved': 'opt+u',
    'diff-filter-resolved': 'opt+r',
    'diff-filter-pending': 'opt+p',
    'diff-sel-up': 'arrowup',
    'diff-sel-down': 'arrowdown',
    'diff-sel-extend-up': 'shift+arrowup',
    'diff-sel-extend-down': 'shift+arrowdown',
    'diff-sel-comment': 'opt+c',
    'diff-sel-copy-code': 'mod+c',
    'diff-sel-copy-url': 'mod+opt+c',
    'nav-adjacent-prev': 'opt+[',
    'nav-adjacent-next': 'opt+]',
    'toggle-side-panel': 'opt+b',
    'conv-comment-prev': 'opt+k',
    'conv-comment-next': 'opt+j',
    'conv-scroll-up': 'opt+arrowup',
    'conv-scroll-down': 'opt+arrowdown',
    'conv-page-up': 'opt+shift+arrowup',
    'conv-page-down': 'opt+shift+arrowdown',
  };
  const v = map[String(commandId || '')];
  return v || null;
}

/**
 * Diff-view-only palette commands (file nav, page scroll, selection, filters…).
 * Shown when layoutMode === 'diff'.
 */
