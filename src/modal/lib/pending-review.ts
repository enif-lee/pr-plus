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
  return { comments: [], body: '' };
}

/**
 * @param {{ comments?: PendingComment[], body?: string }|null} batch
 * @param {PendingComment} comment
 */
export function addPendingComment(batch, comment) {
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

export function setPendingReviewBody(batch, body) {
  const base = batch && Array.isArray(batch.comments) ? batch : createEmptyPendingReview();
  return { ...base, body: String(body || '') };
}

export function pendingReviewCount(batch) {
  return Array.isArray(batch?.comments) ? batch.comments.length : 0;
}

/**
 * CTA label for pending batch: empty → "Start review", else "Add comment".
 * @param {{ comments?: unknown[] }|null} batch
 */
export function pendingReviewCtaLabel(batch) {
  return pendingReviewCount(batch) > 0 ? 'Add comment' : 'Start review';
}

/**
 * Shape GitHub create-review payload (with inline comments).
 * @param {{ comments?: PendingComment[], body?: string }} batch
 * @param {{ event: 'COMMENT'|'APPROVE'|'REQUEST_CHANGES', commitId?: string, body?: string }} opts
 */
export function buildPendingReviewSubmitPayload(batch, opts: any = {
  // typed loosely for mutable REST payloads
}) {
  const event = opts.event || 'COMMENT';
  if (!['COMMENT', 'APPROVE', 'REQUEST_CHANGES'].includes(event)) {
    return null;
  }
  const comments = (batch?.comments || []).map((c) => {
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
