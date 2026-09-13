/**
 * Mutation busy: one global lock (`actionBusy`) plus an optional key so
 * only the initiating button shows a spinner.
 *
 *   setActionBusy(true, ACTION_BUSY.comment)  → that CTA loads
 *   setActionBusy(true)                       → lock others, no spinner
 *   setActionBusy(false)                      → idle
 */
export const ACTION_BUSY = {
  comment: 'comment',
  reviewComment: 'review-comment',
  approve: 'approve',
  requestChanges: 'request-changes',
  discardPending: 'discard-pending',
  closePr: 'close-pr',
  reopenPr: 'reopen-pr',
  selectionComment: 'selection-comment',
  selectionPending: 'selection-pending',
  threadReply: 'thread-reply',
  threadPending: 'thread-pending',
  saveBody: 'save-body',
} as const;

export type ActionBusyKey = (typeof ACTION_BUSY)[keyof typeof ACTION_BUSY];

export function isActionLoading(
  busyKey: string | null | undefined,
  key: string
): boolean {
  return Boolean(busyKey) && busyKey === key;
}

export function leaveReviewBusyKey(
  kind: string | null | undefined
): ActionBusyKey {
  const k = String(kind || '');
  if (k === 'approve') return ACTION_BUSY.approve;
  if (k === 'request_changes') return ACTION_BUSY.requestChanges;
  if (k === 'comment') return ACTION_BUSY.reviewComment;
  return ACTION_BUSY.comment;
}
