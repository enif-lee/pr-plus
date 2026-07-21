/** @module modal/lib/command-palette */
/**
 * Linear-style command palette registry + filter for the PR modal.
 * Commands are pure data; runners are injected by the App.
 */

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
 * Build default command list from PR detail snapshot.
 * @param {object} detail
 * @returns {PaletteCommand[]}
 */
export function buildPaletteCommands(detail: any) {
  const d = detail || {};
  const cmds: any[] = [
    {
      id: 'toggle-diff',
      title: 'Toggle Diff / Conversation',
      section: 'Navigate',
      keywords: ['diff', 'files', 'conversation'],
      shortcut: 'mod+.',
      action: 'toggleDiff',
    },
    {
      id: 'edit-title',
      title: 'Edit PR title…',
      section: 'PR',
      keywords: ['title', 'rename', 'edit'],
      shortcut: 'mod+shift+t',
      action: 'editTitle',
    },
    {
      id: 'edit-body',
      title: 'Edit PR description',
      section: 'PR',
      keywords: ['body', 'description', 'edit'],
      shortcut: 'mod+e',
      action: 'editBody',
    },
    {
      id: 'set-base',
      title: 'Change base branch…',
      section: 'PR',
      keywords: ['base', 'branch', 'target'],
      shortcut: 'mod+shift+b',
      action: 'promptBase',
    },
    {
      id: 'convert-draft',
      title: 'Convert to draft',
      section: 'PR',
      keywords: ['draft', 'wip'],
      action: 'convertDraft',
    },
    {
      id: 'ready-review',
      title: 'Mark ready for review',
      section: 'PR',
      keywords: ['ready', 'draft', 'review'],
      action: 'readyForReview',
    },
    {
      id: 'merge-pr',
      title: 'Merge pull request…',
      section: 'Merge',
      keywords: ['merge', 'ship', 'land'],
      shortcut: 'mod+shift+m',
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
    {
      id: 'update-branch',
      title: 'Update branch from base',
      section: 'Merge',
      keywords: ['update', 'branch', 'rebase', 'sync'],
      shortcut: 'mod+shift+u',
      action: 'updateBranch',
    },
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
      shortcut: 'mod+shift+r',
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
      shortcut: 'mod+shift+a',
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
      shortcut: 'mod+shift+l',
      action: 'promptLabels',
    },
    {
      id: 'review-comment',
      title: 'Submit review: Comment',
      section: 'Review',
      keywords: ['review', 'comment'],
      shortcut: 'mod+enter',
      action: 'leaveReview',
      payload: { kind: 'comment' },
    },
    {
      id: 'review-approve',
      title: 'Submit review: Approve',
      section: 'Review',
      keywords: ['review', 'approve', 'lgtm'],
      shortcut: 'mod+shift+enter',
      action: 'leaveReview',
      payload: { kind: 'approve' },
    },
    {
      id: 'review-changes',
      title: 'Submit review: Request changes',
      section: 'Review',
      keywords: ['review', 'request', 'changes'],
      shortcut: 'mod+shift+x',
      action: 'leaveReview',
      payload: { kind: 'request_changes' },
    },
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
      shortcut: 'c',
      action: 'focusComment',
    },
    {
      id: 'apply-suggestion',
      title: 'Apply focused suggestion',
      section: 'Review',
      keywords: ['suggestion', 'apply', 'patch'],
      shortcut: 'mod+shift+s',
      action: 'applySuggestion',
    },
  ];

  // Dynamic reviewer/assignee chips from detail
  for (const login of d.requestedReviewers || []) {
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

  return cmds;
}

/**
 * Filter commands by free-text query (title + keywords).
 * @param {PaletteCommand[]} commands
 * @param {string} query
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
 * Normalize mod shortcuts for display (⌘ on mac heuristic left to UI).
 */
export function formatShortcut(shortcut, isMac = false) {
  if (!shortcut) return '';
  return String(shortcut)
    .replace(/mod\+/gi, isMac ? '⌘' : 'Ctrl+')
    .replace(/shift\+/gi, isMac ? '⇧' : 'Shift+')
    .replace(/enter/gi, '↵');
}
