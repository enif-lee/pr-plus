/** @module modal/lib/pending-review */
/**
 * Pure pending (draft) review batch for multi-comment submit.
 * Comment path posts immediately; "start/add review" appends to batch.
 */

/**
 * @typedef {{
 *   id: string,
 *   path: string,
 *   line: number,
 *   side?: string,
 *   startLine?: number,
 *   startSide?: string,
 *   body: string,
 * }} PendingComment
 */

export function createEmptyPendingReview() {
  return { comments: [] as any[], body: '' };
}

/**
 * @param {{ comments?: PendingComment[], body?: string }|null} batch
 * @param {PendingComment} comment
 */
export function addPendingComment(batch: any, comment: any) {
  const base = batch && Array.isArray(batch.comments) ? batch : createEmptyPendingReview();
  const body = String(comment?.body || '').trim();
  if (!body || !comment?.path || comment.line == null) {
    return { batch: base, added: false };
  }
  const id =
    comment.id ||
    `pc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const next = {
    body: base.body || '',
    comments: [
      ...base.comments,
      {
        id,
        path: comment.path,
        line: Number(comment.line),
        side: comment.side || 'RIGHT',
        startLine:
          comment.startLine != null && Number(comment.startLine) !== Number(comment.line)
            ? Number(comment.startLine)
            : undefined,
        startSide: comment.startSide || comment.side || 'RIGHT',
        body,
      },
    ],
  };
  return { batch: next, added: true };
}

export function discardPendingReview() {
  return createEmptyPendingReview();
}

/** Product message when Start review / Add comment hits a locked PR (GitHub 422). */
export const LOCKED_PR_START_REVIEW_MSG =
  'This pull request is locked — Start review / comments are disabled on GitHub.';

/**
 * Map Start review / pending-attach errors to a user-visible action message.
 * Locked PRs must not look like a silent no-op.
 */
export function formatStartReviewError(err: any): string {
  const raw = err?.message || String(err || '');
  const locked =
    /locked/i.test(raw) ||
    (Number(err?.status) === 422 && /lock/i.test(raw));
  return locked ? LOCKED_PR_START_REVIEW_MSG : raw;
}

export function setPendingReviewBody(batch: any, body: any) {
  const base = batch && Array.isArray(batch.comments) ? batch : createEmptyPendingReview();
  return { ...base, body: String(body || '') };
}

export function pendingReviewCount(batch: any) {
  return Array.isArray(batch?.comments) ? batch.comments.length : 0;
}

/**
 * CTA label for pending batch: empty → "Start review", else "Add comment".
 * @param {{ comments?: unknown[] }|null} batch
 */
export function pendingReviewCtaLabel(batch: any) {
  return pendingReviewCount(batch) > 0 ? 'Add comment' : 'Start review';
}

/**
 * Inputs for GitHub "viewer has a PENDING review" detection.
 * Prefer object form so empty PENDING (id set, comment count 0) still gates.
 */
export type ViewerPendingGateInput =
  | boolean
  | number
  | null
  | undefined
  | {
      pendingCount?: number | null;
      /** App `hasServerPending` — id or any pending comments */
      hasServerPending?: boolean | null;
      /** `detail.viewerPendingReview.id` alone (count may be 0) */
      serverPendingReviewId?: string | number | null;
      hasPendingReplies?: boolean | null;
      rootPending?: boolean | null;
    };

/**
 * True when the viewer already has a PENDING pull-request review (server id
 * and/or pending comment rows). Empty PENDING (id only) counts.
 */
export function viewerHasPendingReview(input: ViewerPendingGateInput): boolean {
  if (input == null || input === false) return false;
  if (input === true) return true;
  if (typeof input === 'number') {
    return Number.isFinite(input) && input > 0;
  }
  if (typeof input === 'object') {
    if (input.hasServerPending) return true;
    const sid = input.serverPendingReviewId;
    if (sid != null && String(sid).trim() !== '' && String(sid) !== '0') {
      return true;
    }
    if (Number(input.pendingCount) > 0) return true;
    if (input.hasPendingReplies) return true;
    if (input.rootPending) return true;
    return false;
  }
  return Boolean(input);
}

/**
 * GitHub allows only one PENDING review per PR. While a viewer PENDING review
 * exists, single-shot publish ("Comment") is not available — only attach
 * ("Add comment" / Start review → Add comment).
 */
export function canPublishImmediateReviewComment(
  input: ViewerPendingGateInput
): boolean {
  return !viewerHasPendingReview(input);
}

/**
 * Pending-attach button label from whether a viewer PENDING review exists.
 */
export function pendingAttachCtaLabel(input: ViewerPendingGateInput): string {
  return viewerHasPendingReview(input) ? 'Add comment' : 'Start review';
}

/**
 * Shape GitHub create-review payload (with inline comments).
 * @param {{ comments?: PendingComment[], body?: string }} batch
 * @param {{ event: 'COMMENT'|'APPROVE'|'REQUEST_CHANGES', commitId?: string, body?: string }} opts
 */
export function buildPendingReviewSubmitPayload(batch: any, opts: any = {
  // typed loosely for mutable REST payloads
}) {
  const event = opts.event || 'COMMENT';
  if (!['COMMENT', 'APPROVE', 'REQUEST_CHANGES'].includes(event)) {
    return null;
  }
  const comments = (batch?.comments || []).map((c: any) => {
    const row: any = {
      path: c.path,
      body: c.body,
      line: Number(c.line),
      side: c.side || 'RIGHT',
    };
    if (c.startLine != null && Number(c.startLine) !== Number(c.line)) {
      row.start_line = Number(c.startLine);
      row.start_side = c.startSide || c.side || 'RIGHT';
    }
    return row;
  });
  const payload: any = {
    event,
    body: opts.body != null ? String(opts.body) : String(batch?.body || ''),
  };
  if (opts.commitId) payload.commit_id = opts.commitId;
  if (comments.length) payload.comments = comments;
  return payload;
}
