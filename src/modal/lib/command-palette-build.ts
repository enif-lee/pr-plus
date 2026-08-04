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

import {
  optShortcutForCommandId,
} from './command-palette-opt';


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
      id: 'diff-fold-file',
      title: 'Fold / expand focused file',
      section: 'Diff',
      keywords: ['fold', 'collapse', 'expand', 'file', 'hide'],
      shortcut: optShortcutForCommandId('diff-fold-file') || 'opt+f',
      action: 'toggleActiveFileCollapse',
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
  const mergeMethodsAllowed = new Set(allowedMergeMethods(d));
  const cmds: any[] = [
    {
      id: 'toggle-help',
      title: 'Open / close help',
      section: 'Navigate',
      keywords: ['help', 'aliases', 'actions', 'docs', 'hh', '?'],
      aliases: ['help', 'hh', '?'],
      action: 'toggleHelp',
    },
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
    // Conversation focus seed / clear (⌥⇧C) — Conversation primary; Diff also clears
    {
      id: 'focus-conversation-comment',
      title: isDiffLayout
        ? 'Focus / clear conversation comment focus'
        : 'Focus conversation comment',
      section: 'Conversation',
      keywords: ['focus', 'comment', 'seed', 'ring', 'conversation', 'clear'],
      shortcut:
        optShortcutForCommandId('focus-conversation-comment') || 'opt+shift+c',
      action: 'focusConversationComment',
      aliases: ['fc', 'focus'],
    },
    {
      id: 'clear-conversation-comment-focus',
      title: 'Clear conversation / thread focus',
      section: 'Conversation',
      keywords: ['clear', 'focus', 'comment', 'thread', 'ring'],
      shortcut:
        optShortcutForCommandId('clear-conversation-comment-focus') ||
        'opt+shift+c',
      action: 'clearConversationCommentFocus',
      aliases: ['cf', 'clear focus'],
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
    ...(mergeMethodsAllowed.has('merge')
      ? [
          {
            id: 'merge-pr',
            title: 'Merge pull request…',
            section: 'Merge',
            keywords: ['merge', 'ship', 'land'],
            shortcut: optShortcutForCommandId('merge-pr') || 'opt+shift+m',
            action: 'mergePr',
            payload: { method: 'merge' },
          },
        ]
      : []),
    ...(mergeMethodsAllowed.has('squash')
      ? [
          {
            id: 'squash-merge',
            title: 'Squash and merge…',
            section: 'Merge',
            keywords: ['squash', 'merge'],
            action: 'mergePr',
            payload: { method: 'squash' },
          },
        ]
      : []),
    ...(mergeMethodsAllowed.has('rebase')
      ? [
          {
            id: 'rebase-merge',
            title: 'Rebase and merge…',
            section: 'Merge',
            keywords: ['rebase', 'merge'],
            action: 'mergePr',
            payload: { method: 'rebase' },
          },
        ]
      : []),
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
      id: 'copy-pr-link',
      title: 'Copy link to PR on GitHub',
      section: 'Navigate',
      keywords: ['copy', 'link', 'url', 'share', 'github', 'clipboard', 'permalink'],
      action: 'copyPrGithubLink',
    },
    {
      id: 'refresh-pr',
      title: 'Refresh PR detail',
      section: 'Navigate',
      keywords: ['refresh', 'reload', 'sync', 'update', 'fetch'],
      shortcut: optShortcutForCommandId('refresh-pr') || 'opt+shift+g',
      action: 'refreshDetail',
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
    .replace(/ctrl\+/gi, isMac ? '⌃' : 'Ctrl+')
    .replace(/enter/gi, '↵')
    .replace(/arrowup/gi, '↑')
    .replace(/arrowdown/gi, '↓')
    .replace(/arrowleft/gi, '←')
    .replace(/arrowright/gi, '→');
}

/* -------------------------------------------------------------------------- */
/* PR search (`#…` / `#$…`) — pure helpers shared by modal + pulls palettes   */
/* -------------------------------------------------------------------------- */

/**
 * Detect PR-search mode from a palette query.
 * Accepted forms: `#123`, `#name`, `#$123`, `#$title words`.
 * The `$` after `#` is optional documentation sugar (not required).
 *
 * @returns {{ isPrSearch: boolean, term: string, raw: string }}
 */
