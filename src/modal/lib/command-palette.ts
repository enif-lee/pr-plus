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
import { canUpdateBranch } from './merge-box-status';

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
  {
    id: 'opt-edit-body',
    action: 'editBody',
    title: 'Edit PR description',
    key: 'e',
    code: 'KeyE',
    shift: false,
    labelMac: '⌥E',
    labelWin: 'Alt+E',
    section: 'PR',
  },
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
] as const;

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
    'edit-body': 'opt+e',
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
    // Diff view
    'diff-prev-file': 'opt+shift+[',
    'diff-next-file': 'opt+shift+]',
    'diff-page-up': 'opt+shift+arrowup',
    'diff-page-down': 'opt+shift+arrowdown',
    'diff-opt-arrow-up': 'opt+arrowup',
    'diff-opt-arrow-down': 'opt+arrowdown',
    'diff-toggle-viewed': 'opt+shift+r',
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
  return map[String(commandId || '')] || null;
}

/**
 * Diff-view-only palette commands (file nav, page scroll, selection, filters…).
 * Shown when layoutMode === 'diff'.
 */
export function buildDiffPaletteCommands(): any[] {
  return [
    {
      id: 'diff-prev-file',
      title: 'Previous file',
      section: 'Diff',
      keywords: ['file', 'prev', 'previous', 'nav', 'tree'],
      shortcut: optShortcutForCommandId('diff-prev-file') || 'opt+shift+[',
      action: 'navFilePrev',
    },
    {
      id: 'diff-next-file',
      title: 'Next file',
      section: 'Diff',
      keywords: ['file', 'next', 'nav', 'tree'],
      shortcut: optShortcutForCommandId('diff-next-file') || 'opt+shift+]',
      action: 'navFileNext',
    },
    {
      id: 'diff-page-up',
      title: 'Scroll Diff page up',
      section: 'Diff',
      keywords: ['scroll', 'page', 'up'],
      shortcut: optShortcutForCommandId('diff-page-up') || 'opt+shift+arrowup',
      action: 'scrollDiffPagePrev',
    },
    {
      id: 'diff-page-down',
      title: 'Scroll Diff page down',
      section: 'Diff',
      keywords: ['scroll', 'page', 'down'],
      shortcut: optShortcutForCommandId('diff-page-down') || 'opt+shift+arrowdown',
      action: 'scrollDiffPageNext',
    },
    {
      id: 'diff-opt-arrow-up',
      title: 'Jump selection up + scroll',
      section: 'Diff',
      keywords: ['selection', 'scroll', 'jump', 'opt', 'arrow', 'up'],
      shortcut: optShortcutForCommandId('diff-opt-arrow-up') || 'opt+arrowup',
      action: 'optArrowScrollSelectPrev',
    },
    {
      id: 'diff-opt-arrow-down',
      title: 'Jump selection down + scroll',
      section: 'Diff',
      keywords: ['selection', 'scroll', 'jump', 'opt', 'arrow', 'down'],
      shortcut: optShortcutForCommandId('diff-opt-arrow-down') || 'opt+arrowdown',
      action: 'optArrowScrollSelectNext',
    },
    {
      id: 'diff-toggle-viewed',
      title: 'Toggle file viewed / unread',
      section: 'Diff',
      keywords: ['viewed', 'read', 'unread', 'mark'],
      shortcut: optShortcutForCommandId('diff-toggle-viewed') || 'opt+shift+r',
      action: 'toggleViewedActiveFile',
    },
    {
      id: 'diff-step-prev',
      title: 'Previous review thread / find hit',
      section: 'Diff',
      keywords: ['thread', 'comment', 'prev', 'step', 'find'],
      shortcut: optShortcutForCommandId('diff-step-prev') || 'opt+k',
      action: 'stepNavPrev',
    },
    {
      id: 'diff-step-next',
      title: 'Next review thread / find hit',
      section: 'Diff',
      keywords: ['thread', 'comment', 'next', 'step', 'find'],
      shortcut: optShortcutForCommandId('diff-step-next') || 'opt+j',
      action: 'stepNavNext',
    },
    {
      id: 'diff-filter-unresolved',
      title: 'Filter: unresolved threads',
      section: 'Diff',
      keywords: ['filter', 'unresolved', 'review'],
      shortcut: optShortcutForCommandId('diff-filter-unresolved') || 'opt+u',
      action: 'toggleReviewFilterUnresolved',
    },
    {
      id: 'diff-filter-resolved',
      title: 'Filter: resolved threads',
      section: 'Diff',
      keywords: ['filter', 'resolved', 'review'],
      shortcut: optShortcutForCommandId('diff-filter-resolved') || 'opt+r',
      action: 'toggleReviewFilterResolved',
    },
    {
      id: 'diff-filter-pending',
      title: 'Filter: pending comments',
      section: 'Diff',
      keywords: ['filter', 'pending', 'review'],
      shortcut: optShortcutForCommandId('diff-filter-pending') || 'opt+p',
      action: 'toggleReviewFilterPending',
    },
    {
      id: 'diff-sel-up',
      title: 'Move line selection up',
      section: 'Diff',
      keywords: ['selection', 'cursor', 'line', 'up', 'arrow'],
      shortcut: optShortcutForCommandId('diff-sel-up') || 'arrowup',
      action: 'moveSelectionUp',
    },
    {
      id: 'diff-sel-down',
      title: 'Move line selection down',
      section: 'Diff',
      keywords: ['selection', 'cursor', 'line', 'down', 'arrow'],
      shortcut: optShortcutForCommandId('diff-sel-down') || 'arrowdown',
      action: 'moveSelectionDown',
    },
    {
      id: 'diff-sel-extend-up',
      title: 'Extend line selection up',
      section: 'Diff',
      keywords: ['selection', 'multi', 'extend', 'range', 'up'],
      shortcut: optShortcutForCommandId('diff-sel-extend-up') || 'shift+arrowup',
      action: 'extendSelectionUp',
    },
    {
      id: 'diff-sel-extend-down',
      title: 'Extend line selection down',
      section: 'Diff',
      keywords: ['selection', 'multi', 'extend', 'range', 'down'],
      shortcut:
        optShortcutForCommandId('diff-sel-extend-down') || 'shift+arrowdown',
      action: 'extendSelectionDown',
    },
    {
      id: 'diff-sel-comment',
      title: 'Comment on selection',
      section: 'Diff',
      keywords: ['selection', 'comment', 'review'],
      shortcut: optShortcutForCommandId('diff-sel-comment') || 'opt+c',
      action: 'openSelectionComment',
    },
    {
      id: 'diff-sel-copy-code',
      title: 'Copy selection code',
      section: 'Diff',
      keywords: ['selection', 'copy', 'code'],
      shortcut: optShortcutForCommandId('diff-sel-copy-code') || 'mod+c',
      action: 'copySelectionCode',
    },
    {
      id: 'diff-sel-copy-url',
      title: 'Copy selection URL',
      section: 'Diff',
      keywords: ['selection', 'copy', 'url', 'permalink'],
      shortcut: optShortcutForCommandId('diff-sel-copy-url') || 'mod+opt+c',
      action: 'copySelectionUrl',
    },
  ];
}

/**
 * Resolve Development main-link open mode for modal/sheet.
 * In-modal only when target is a PullRequest (or URL looks like /pull/N).
 *
 * @returns {{ mode: 'inModal'|'navigate'|'none', number: number|null, href: string }}
 */
export function resolveDevelopmentMainOpen(item: any, ctx: any = {}) {
  const num = Number(item?.number);
  const href = String(item?.url || item?.href || '').trim();
  const kind = String(item?.kind || '').toLowerCase();
  const owner = String(ctx?.owner || '').trim();
  const repo = String(ctx?.repo || '').trim();
  const fallbackHref =
    href ||
    (Number.isFinite(num) && num > 0 && owner && repo
      ? `https://github.com/${owner}/${repo}/issues/${num}`
      : '');

  if (!Number.isFinite(num) || num <= 0) {
    return { mode: 'none' as const, number: null, href: fallbackHref };
  }

  const urlIsPull = /\/pull\/\d+/i.test(href);
  const urlIsIssue = /\/issues\/\d+/i.test(href);
  const knownPulls = Array.isArray(ctx?.knownPullNumbers)
    ? ctx.knownPullNumbers.map(Number).filter((n: number) => Number.isFinite(n) && n > 0)
    : [];
  const knownAsPull = knownPulls.includes(num);
  const isPull =
    kind === 'pull' ||
    kind === 'pullrequest' ||
    urlIsPull ||
    knownAsPull ||
    (Boolean(ctx?.preferInModal) && !urlIsIssue && kind !== 'issue');

  if (isPull) {
    return {
      mode: 'inModal' as const,
      number: num,
      href:
        href ||
        (owner && repo
          ? `https://github.com/${owner}/${repo}/pull/${num}`
          : fallbackHref),
    };
  }
  return {
    mode: 'navigate' as const,
    number: num,
    href: fallbackHref,
  };
}

/**
 * Stack path digit slot (1–9) → PR number, or null.
 */
export function stackDigitSlotNumber(digit: any, stackItems: any): number | null {
  const d = Number(digit);
  if (!Number.isFinite(d) || d < 1 || d > 9) return null;
  const list = Array.isArray(stackItems) ? stackItems : [];
  const item = list[d - 1];
  const n = Number(item?.number);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Previous/next PR: prefer stack path when stacked (≥2), else open pulls list order.
 * @param {'prev'|'next'} direction
 */
export function resolveAdjacentPrNumber(opts: {
  direction?: string;
  currentNumber?: number;
  stackItems?: any[];
  openPulls?: any[];
} = {}): number | null {
  const dir = String(opts.direction || '').toLowerCase() === 'prev' ? -1 : 1;
  const current = Number(opts.currentNumber);
  if (!Number.isFinite(current) || current <= 0) return null;

  const stack = (Array.isArray(opts.stackItems) ? opts.stackItems : [])
    .map((x) => Number(x?.number))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (stack.length >= 2) {
    const idx = stack.indexOf(current);
    if (idx < 0) return null;
    const next = stack[idx + dir];
    return next != null && Number.isFinite(next) ? next : null;
  }

  const pulls = (Array.isArray(opts.openPulls) ? opts.openPulls : [])
    .map((x) => Number(x?.number ?? x))
    .filter((n) => Number.isFinite(n) && n > 0);
  const seen = new Set<number>();
  const list: number[] = [];
  for (const n of pulls) {
    if (seen.has(n)) continue;
    seen.add(n);
    list.push(n);
  }
  if (list.length < 2) return null;
  const idx = list.indexOf(current);
  if (idx < 0) return null;
  const next = list[idx + dir];
  return next != null && Number.isFinite(next) ? next : null;
}

/**
 * Build default command list from PR detail snapshot.
 * @param {object} detail
 * @param {{
 *   stackItems?: any[],
 *   openPulls?: any[],
 *   layoutMode?: string,
 *   canSubmitReviewVerdict?: boolean,
 * }} [opts]
 * @returns {PaletteCommand[]}
 */
export function buildPaletteCommands(detail: any, opts: any = {}) {
  const d = detail || {};
  const stackItems = Array.isArray(opts.stackItems) ? opts.stackItems : [];
  const openPulls = Array.isArray(opts.openPulls) ? opts.openPulls : [];
  const stacked = stackItems.length >= 2;
  const layoutMode = String(opts.layoutMode || opts.page || '').toLowerCase();
  const isDiffLayout = layoutMode === 'diff';
  // Prefer explicit opt; else compare author/viewer (GitHub blocks self-review verdicts)
  const allowReviewVerdict =
    opts.canSubmitReviewVerdict != null
      ? Boolean(opts.canSubmitReviewVerdict)
      : (() => {
          const a = String(d.author || '')
            .trim()
            .replace(/^@/, '')
            .toLowerCase();
          const v = String(d.viewerLogin || '')
            .trim()
            .replace(/^@/, '')
            .toLowerCase();
          return !(a && v && a === v);
        })();
  const updateBranchPossible = canUpdateBranch(d);
  const cmds: any[] = [
    {
      id: 'toggle-diff',
      title: 'Toggle Diff / Conversation',
      section: 'Navigate',
      keywords: ['diff', 'files', 'conversation'],
      shortcut: optShortcutForCommandId('toggle-diff') || 'opt+.',
      action: 'toggleDiff',
    },
    {
      id: 'toggle-side-panel',
      title: isDiffLayout
        ? 'Toggle files panel'
        : 'Toggle metadata panel',
      section: 'Navigate',
      keywords: [
        'panel',
        'sidebar',
        'collapse',
        'files',
        'metadata',
        'aside',
        'rail',
        'hide',
      ],
      shortcut: optShortcutForCommandId('toggle-side-panel') || 'opt+b',
      action: 'toggleSidePanel',
    },
    // Context-thread actions (active review unit on Conversation or Diff)
    {
      id: 'context-thread-fold',
      title: 'Fold / expand focused thread',
      section: 'Review',
      keywords: ['fold', 'collapse', 'expand', 'thread', 'context'],
      shortcut: 'opt+f',
      action: 'contextThreadFold',
    },
    {
      id: 'context-thread-diff',
      title: isDiffLayout
        ? 'Reveal focused thread in Diff'
        : 'Go to Diff for focused thread',
      section: 'Review',
      keywords: ['diff', 'jump', 'file', 'thread', 'context'],
      shortcut: 'opt+d',
      action: 'contextThreadGotoDiff',
    },
    {
      id: 'context-thread-comment',
      title: 'Comment on focused thread (focus / submit)',
      section: 'Review',
      keywords: ['comment', 'reply', 'submit', 'thread', 'context'],
      shortcut: 'opt+c',
      action: 'contextThreadComment',
    },
    {
      id: 'context-thread-resolve',
      title: 'Resolve / unresolve focused thread',
      section: 'Review',
      keywords: ['resolve', 'unresolve', 'thread', 'context'],
      shortcut: 'opt+ctrl+r',
      action: 'contextThreadResolve',
    },
    ...(!isDiffLayout
      ? [
          {
            id: 'conv-comment-prev',
            title: 'Previous conversation comment',
            section: 'Conversation',
            keywords: ['comment', 'prev', 'previous', 'thread', 'timeline'],
            shortcut: optShortcutForCommandId('conv-comment-prev') || 'opt+k',
            action: 'stepNavPrev',
          },
          {
            id: 'conv-comment-next',
            title: 'Next conversation comment',
            section: 'Conversation',
            keywords: ['comment', 'next', 'thread', 'timeline'],
            shortcut: optShortcutForCommandId('conv-comment-next') || 'opt+j',
            action: 'stepNavNext',
          },
          {
            id: 'conv-scroll-up',
            title: 'Scroll conversation up',
            section: 'Conversation',
            keywords: ['scroll', 'up', 'timeline'],
            shortcut: optShortcutForCommandId('conv-scroll-up') || 'opt+arrowup',
            action: 'scrollConversationOptPrev',
          },
          {
            id: 'conv-scroll-down',
            title: 'Scroll conversation down',
            section: 'Conversation',
            keywords: ['scroll', 'down', 'timeline'],
            shortcut:
              optShortcutForCommandId('conv-scroll-down') || 'opt+arrowdown',
            action: 'scrollConversationOptNext',
          },
          {
            id: 'conv-page-up',
            title: 'Scroll conversation page up',
            section: 'Conversation',
            keywords: ['scroll', 'page', 'up'],
            shortcut: optShortcutForCommandId('conv-page-up') || 'opt+shift+arrowup',
            action: 'scrollConversationPagePrev',
          },
          {
            id: 'conv-page-down',
            title: 'Scroll conversation page down',
            section: 'Conversation',
            keywords: ['scroll', 'page', 'down'],
            shortcut:
              optShortcutForCommandId('conv-page-down') || 'opt+shift+arrowdown',
            action: 'scrollConversationPageNext',
          },
        ]
      : []),
    {
      id: 'find-in-pr',
      title: 'Find in PR…',
      section: 'Navigate',
      keywords: ['search', 'find', 'filter', 'query'],
      shortcut: optShortcutForCommandId('find-in-pr') || 'mod+f',
      action: 'openSearch',
    },
    {
      id: 'toggle-fullscreen',
      title: 'Toggle fullscreen',
      section: 'Navigate',
      keywords: ['fullscreen', 'maximize', 'expand', 'shell'],
      shortcut: optShortcutForCommandId('toggle-fullscreen') || 'opt+shift+f',
      action: 'toggleFullscreen',
    },
    {
      id: 'edit-title',
      title: 'Edit PR title…',
      section: 'PR',
      keywords: ['title', 'rename', 'edit'],
      shortcut: optShortcutForCommandId('edit-title') || 'opt+shift+t',
      action: 'editTitle',
    },
    {
      id: 'edit-body',
      title: 'Edit PR description',
      section: 'PR',
      keywords: ['body', 'description', 'edit'],
      shortcut: optShortcutForCommandId('edit-body') || 'opt+e',
      action: 'editBody',
    },
    {
      id: 'set-base',
      title: 'Change base branch…',
      section: 'PR',
      keywords: ['base', 'branch', 'target'],
      shortcut: optShortcutForCommandId('set-base') || 'opt+shift+b',
      action: 'promptBase',
    },
    {
      id: 'convert-draft',
      title: 'Convert to draft',
      section: 'PR',
      keywords: ['draft', 'wip'],
      shortcut: optShortcutForCommandId('convert-draft') || 'opt+shift+d',
      action: 'convertDraft',
    },
    {
      id: 'ready-review',
      title: 'Mark ready for review',
      section: 'PR',
      keywords: ['ready', 'draft', 'review'],
      shortcut: optShortcutForCommandId('ready-review') || 'opt+shift+d',
      action: 'readyForReview',
    },
    {
      id: 'merge-pr',
      title: 'Merge pull request…',
      section: 'Merge',
      keywords: ['merge', 'ship', 'land'],
      shortcut: optShortcutForCommandId('merge-pr') || 'opt+shift+m',
      action: 'mergePr',
      payload: { method: 'merge' },
    },
    {
      id: 'squash-merge',
      title: 'Squash and merge…',
      section: 'Merge',
      keywords: ['squash', 'merge'],
      action: 'mergePr',
      payload: { method: 'squash' },
    },
    {
      id: 'rebase-merge',
      title: 'Rebase and merge…',
      section: 'Merge',
      keywords: ['rebase', 'merge'],
      action: 'mergePr',
      payload: { method: 'rebase' },
    },
    ...(updateBranchPossible
      ? [
          {
            id: 'update-branch',
            title: 'Update branch from base',
            section: 'Merge',
            keywords: ['update', 'branch', 'rebase', 'sync'],
            shortcut: optShortcutForCommandId('update-branch') || 'opt+shift+u',
            action: 'updateBranch',
          },
        ]
      : []),
    {
      id: 'subscribe',
      title: 'Subscribe to notifications',
      section: 'PR',
      keywords: ['subscribe', 'watch', 'notifications'],
      action: 'subscribe',
    },
    {
      id: 'unsubscribe',
      title: 'Unsubscribe from notifications',
      section: 'PR',
      keywords: ['unsubscribe', 'mute', 'notifications'],
      action: 'unsubscribe',
    },
    {
      id: 'set-milestone',
      title: 'Set milestone…',
      section: 'PR',
      keywords: ['milestone', 'release'],
      shortcut: optShortcutForCommandId('set-milestone') || 'opt+shift+p',
      action: 'promptMilestone',
    },
    {
      id: 'clear-milestone',
      title: 'Clear milestone',
      section: 'PR',
      keywords: ['milestone', 'clear'],
      action: 'clearMilestone',
    },
    {
      id: 'rerequest-review',
      title: 'Re-request review from all…',
      section: 'People',
      keywords: ['rerequest', 'review', 'again'],
      action: 'rerequestReview',
    },
    {
      id: 'add-reviewer',
      title: 'Add reviewer…',
      section: 'People',
      keywords: ['reviewer', 'review'],
      shortcut: optShortcutForCommandId('add-reviewer') || 'opt+shift+r',
      action: 'promptAddReviewer',
    },
    {
      id: 'remove-reviewer',
      title: 'Remove reviewer…',
      section: 'People',
      keywords: ['reviewer', 'remove'],
      action: 'promptRemoveReviewer',
    },
    {
      id: 'set-assignee',
      title: 'Add assignee…',
      section: 'People',
      keywords: ['assignee', 'assign'],
      shortcut: optShortcutForCommandId('set-assignee') || 'opt+shift+a',
      action: 'promptAddAssignee',
    },
    {
      id: 'remove-assignee',
      title: 'Remove assignee…',
      section: 'People',
      keywords: ['assignee', 'unassign'],
      action: 'promptRemoveAssignee',
    },
    {
      id: 'set-labels',
      title: 'Set labels…',
      section: 'PR',
      keywords: ['label', 'labels', 'tag'],
      shortcut: optShortcutForCommandId('set-labels') || 'opt+shift+l',
      action: 'promptLabels',
    },
    {
      id: 'review-comment',
      title: 'Submit review: Comment',
      section: 'Review',
      keywords: ['review', 'comment'],
      shortcut: optShortcutForCommandId('review-comment') || 'opt+enter',
      action: 'leaveReview',
      payload: { kind: 'comment' },
    },
    ...(allowReviewVerdict
      ? [
          {
            id: 'review-approve',
            title: 'Submit review: Approve',
            section: 'Review',
            keywords: ['review', 'approve', 'lgtm'],
            shortcut: optShortcutForCommandId('review-approve') || 'opt+shift+enter',
            action: 'leaveReview',
            payload: { kind: 'approve' },
          },
          {
            id: 'review-changes',
            title: 'Submit review: Request changes',
            section: 'Review',
            keywords: ['review', 'request', 'changes'],
            shortcut: optShortcutForCommandId('review-changes') || 'opt+shift+x',
            action: 'leaveReview',
            payload: { kind: 'request_changes' },
          },
        ]
      : []),
    {
      id: 'close-pr',
      title: 'Close pull request',
      section: 'PR',
      keywords: ['close'],
      action: 'closePr',
    },
    {
      id: 'reopen-pr',
      title: 'Reopen pull request',
      section: 'PR',
      keywords: ['reopen', 'open'],
      action: 'reopenPr',
    },
    {
      id: 'open-github',
      title: 'Open on GitHub',
      section: 'Navigate',
      keywords: ['github', 'browser'],
      action: 'openGithub',
    },
    {
      id: 'focus-comment',
      title: 'Focus comment box',
      section: 'Navigate',
      keywords: ['comment', 'write'],
      action: 'focusComment',
    },
    {
      id: 'apply-suggestion',
      title: 'Apply focused suggestion',
      section: 'Review',
      keywords: ['suggestion', 'apply', 'patch'],
      shortcut: optShortcutForCommandId('apply-suggestion') || 'opt+shift+s',
      action: 'applySuggestion',
    },
  ];

  const isBotLogin = (login: string) => {
    const key = String(login || '').toLowerCase();
    if (d.actorIsBot && typeof d.actorIsBot === 'object') {
      if (d.actorIsBot[key]) return true;
    }
    return /\[bot\]$/i.test(String(login || ''));
  };
  for (const login of d.requestedReviewers || []) {
    if (isBotLogin(login)) continue;
    cmds.push({
      id: `rm-rev-${login}`,
      title: `Remove reviewer ${login}`,
      section: 'People',
      keywords: ['remove', 'reviewer', login],
      action: 'removeReviewer',
      payload: { login },
    });
  }
  for (const login of d.assignees || []) {
    if (isBotLogin(login)) continue;
    cmds.push({
      id: `rm-asg-${login}`,
      title: `Unassign ${login}`,
      section: 'People',
      keywords: ['remove', 'assignee', login],
      action: 'removeAssignee',
      payload: { login },
    });
  }
  for (const l of d.labels || []) {
    const name = l.name || l;
    cmds.push({
      id: `label-${name}`,
      title: `Label: ${name}`,
      section: 'Labels',
      keywords: ['label', name],
      action: 'toggleLabel',
      payload: { name },
    });
  }

  if (d.baseRef) {
    cmds.push({
      id: 'base-current',
      title: `Current base: ${d.baseRef}`,
      section: 'PR',
      keywords: ['base', d.baseRef],
      action: 'noop',
    });
  }

  const slotCount = Math.min(stackItems.length, 9);
  for (let i = 0; i < slotCount; i++) {
    const it = stackItems[i] || {};
    const num = Number(it.number);
    if (!Number.isFinite(num) || num <= 0) continue;
    const title = String(it.title || '').trim();
    cmds.push({
      id: `stack-slot-${i + 1}`,
      title: title ? `Stack #${num}: ${title}` : `Open stack PR #${num}`,
      section: 'Stack',
      keywords: ['stack', 'opt', String(i + 1), `#${num}`, 'path'],
      shortcut: `opt+${i + 1}`,
      description: it.current ? 'Current in stack' : 'Jump to stacked PR',
      action: 'openStackPr',
      payload: { number: num, digit: i + 1 },
    });
  }

  cmds.push({
    id: 'nav-adjacent-prev',
    title: stacked ? 'Previous stack PR' : 'Previous pull request',
    section: 'Navigate',
    keywords: ['prev', 'previous', 'stack', 'list', 'back', '['],
    shortcut: optShortcutForCommandId('nav-adjacent-prev') || 'opt+[',
    description: stacked
      ? 'Move up the stack path'
      : 'Open previous PR in the pulls list',
    action: 'navAdjacentPrev',
  });
  cmds.push({
    id: 'nav-adjacent-next',
    title: stacked ? 'Next stack PR' : 'Next pull request',
    section: 'Navigate',
    keywords: ['next', 'stack', 'list', 'forward', ']'],
    shortcut: optShortcutForCommandId('nav-adjacent-next') || 'opt+]',
    description: stacked
      ? 'Move down the stack path'
      : 'Open next PR in the pulls list',
    action: 'navAdjacentNext',
  });

  // Diff layout: file nav, page scroll, selection, filters, viewed toggle
  if (isDiffLayout) {
    for (const c of buildDiffPaletteCommands()) cmds.push(c);
  }

  return cmds;
}

/**
 * Filter commands by free-text query (title + keywords).
 */
export function filterPaletteCommands(commands: any, query: any) {
  const list = Array.isArray(commands) ? commands : [];
  const q = String(query || '')
    .trim()
    .toLowerCase();
  if (!q) return list.slice(0, 50);
  return list
    .filter((c) => {
      const hay = [c.title, c.section, ...(c.keywords || []), c.id]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q) || q.split(/\s+/).every((w) => hay.includes(w));
    })
    .slice(0, 50);
}

/**
 * Normalize shortcuts for display.
 */
export function formatShortcut(shortcut, isMac = false) {
  if (!shortcut) return '';
  return String(shortcut)
    .replace(/mod\+/gi, isMac ? '⌘' : 'Ctrl+')
    .replace(/shift\+/gi, isMac ? '⇧' : 'Shift+')
    .replace(/opt\+|alt\+/gi, isMac ? '⌥' : 'Alt+')
    .replace(/enter/gi, '↵');
}
