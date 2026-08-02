/** Split from shortcut-policy.ts: shortcut-policy-constants */
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
export const TOGGLE_VIEWED_SHORTCUT = {
  key: 'r',
  code: 'KeyR',
  action: 'toggleViewedActiveFile' as const,
  chord: 'opt+shift+r',
  labelMac: '⌥⇧R',
  labelWin: 'Alt+Shift+R',
};

/**
 * Option+F on Diff — fold/expand the focused file (line-selection path,
 * else active tree file) when a review thread is not the active focus.
 *
 * Priority on Diff:
 *   1. Line selection active → file fold
 *   2. Review-thread focus (⌥J/K / commentIndex) → thread fold
 *   3. Otherwise → file fold
 *
 * Conversation review-thread focus still owns ⌥F via CONTEXT_THREAD_SHORTCUT.
 * Primary fold keys are ArrowLeft (collapse) / ArrowRight (expand); ⌥F remains
 * a toggle alias.
 */
export const FILE_FOLD_SHORTCUT = {
  key: 'f',
  code: 'KeyF',
  action: 'toggleActiveFileCollapse' as const,
  chord: 'opt+f',
  labelMac: '⌥F',
  labelWin: 'Alt+F',
} as const;

/**
 * ArrowLeft / ArrowRight — directed fold for Diff file or focused thread.
 * Collapse (←) / expand (→). Not active in editable fields.
 */
export const ARROW_FOLD_SHORTCUT = {
  collapse: {
    key: 'arrowleft',
    code: 'ArrowLeft',
    action: 'collapseFold' as const,
    chord: '←',
    labelMac: '←',
    labelWin: '←',
  },
  expand: {
    key: 'arrowright',
    code: 'ArrowRight',
    action: 'expandFold' as const,
    chord: '→',
    labelMac: '→',
    labelWin: '→',
  },
} as const;

/**
 * Resolve directed fold target for ArrowLeft/Right.
 * - Diff + thread focused (no **code-body** line selection) → thread
 * - Diff otherwise → file
 * - Conversation + context thread → thread
 *
 * `hasLineSelection` must mean code-body selection only. A Diff ↑↓ caret on a
 * review-thread (`kind: 'thread'`) is thread focus, not a line selection.
 * @returns action id or null
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
 * Composer-focused context chords — active while a markdown composer
 * textarea (comment / reply / thread / selection bar) is focused.
 *
 *   ⌥E emoji typeahead (`:`) · ⌥C / ⌘↵ submit · ⌥⌃R resolve (when form has it)
 *   ⌥I focus input · ⌥T review↔comment mode toggle (main conversation composer)
 */
export const COMPOSER_CONTEXT_SHORTCUT = {
  emoji: {
    key: 'e',
    code: 'KeyE',
    action: 'composerEmoji' as const,
    chord: 'opt+e',
    labelMac: '⌥E',
    labelWin: 'Alt+E',
  },
  submit: {
    key: 'c',
    code: 'KeyC',
    action: 'composerSubmit' as const,
    chord: 'opt+c',
    labelMac: '⌥C',
    labelWin: 'Alt+C',
  },
  /** ⌘Enter / Ctrl+Enter — same submit path as primary button */
  submitModEnter: {
    key: 'enter',
    code: 'Enter',
    action: 'composerSubmit' as const,
    chord: 'mod+enter',
    labelMac: '⌘↵',
    labelWin: 'Ctrl+Enter',
  },
  resolve: {
    key: 'r',
    code: 'KeyR',
    action: 'composerResolve' as const,
    chord: 'opt+ctrl+r',
    labelMac: '⌥⌃R',
    labelWin: 'Alt+Ctrl+R',
    ctrl: true,
  },
  focusInput: {
    key: 'i',
    code: 'KeyI',
    action: 'composerFocusInput' as const,
    chord: 'opt+i',
    labelMac: '⌥I',
    labelWin: 'Alt+I',
  },
  modeToggle: {
    key: 't',
    code: 'KeyT',
    action: 'composerModeToggle' as const,
    chord: 'opt+t',
    labelMac: '⌥T',
    labelWin: 'Alt+T',
  },
} as const;

/**
 * True when the keyboard target is inside a pr+ markdown composer.
 * @param {EventTarget|null|undefined} el
 */
export const GITHUB_COMMAND_PALETTE_SELECTOR =
  '#command-palette-pjax-container, dialog.js-command-palette-dialog, command-palette';

/**
 * How long after GH palette was last seen open we still treat Escape as
 * "owned by GH" (their capture listener often closes the dialog before ours).
 */
export const GITHUB_PALETTE_ESCAPE_GRACE_MS = 500;

/** Last time GH command palette was observed open (ms since epoch). */
