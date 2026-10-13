/**
 * Unsent text inside the PR shell. Close and in-shell PR switches confirm
 * when this is non-empty. Search, file filter, and palette query are not input.
 */

export type UnsavedModalSnapshot = {
  commentText?: unknown;
  selectionDraft?: unknown;
  replyDrafts?: Record<string, unknown> | null;
  pendingBody?: unknown;
  finishReviewBody?: unknown;
  bodyEditing?: boolean;
  /** Null when the description editor is not mounted. */
  bodyDraft?: unknown;
  bodySaved?: unknown;
  commentEditing?: boolean;
  commentEditDraft?: unknown;
  /** Null when the original comment body could not be found. */
  commentEditSaved?: unknown;
  titleEditing?: boolean;
  titleDraft?: unknown;
  titleSaved?: unknown;
  /**
   * True when any mounted editor's own draft differs from its own saved
   * text. Conversation and Diff can each mount a BodyEditor for the same
   * comment; compare every node, not the first match.
   */
  editorDirty?: boolean;
};

function norm(value: unknown): string {
  return String(value ?? '')
    .replace(/\r\n/g, '\n')
    .trim();
}

export function hasUnsavedModalInput(
  snap: UnsavedModalSnapshot | null | undefined
): boolean {
  if (!snap) return false;
  if (norm(snap.commentText)) return true;
  if (norm(snap.selectionDraft)) return true;
  if (snap.replyDrafts) {
    for (const value of Object.values(snap.replyDrafts)) {
      if (norm(value)) return true;
    }
  }
  if (norm(snap.pendingBody)) return true;
  if (norm(snap.finishReviewBody)) return true;
  if (snap.editorDirty) return true;
  if (
    snap.bodyEditing &&
    snap.bodyDraft != null &&
    norm(snap.bodyDraft) !== norm(snap.bodySaved)
  ) {
    return true;
  }
  if (snap.commentEditing && snap.commentEditDraft != null) {
    if (snap.commentEditSaved == null) {
      if (norm(snap.commentEditDraft)) return true;
    } else if (norm(snap.commentEditDraft) !== norm(snap.commentEditSaved)) {
      return true;
    }
  }
  if (
    snap.titleEditing &&
    norm(snap.titleDraft) !== norm(snap.titleSaved)
  ) {
    return true;
  }
  return false;
}

/** First comment/review body whose id matches. Null when the id is absent. */
export function findCommentBody(detail: any, id: unknown): string | null {
  if (id == null || !detail || typeof detail !== 'object') return null;
  const want = String(id);
  const seen = new Set<any>();
  const queue: any[] = [
    detail.comments,
    detail.reviewComments,
    detail.review_comments,
    detail.reviewThreads,
    detail.review_threads,
  ];
  let scanned = 0;
  while (queue.length && scanned < 4000) {
    const node = queue.shift();
    if (node == null) continue;
    if (Array.isArray(node)) {
      for (const child of node) queue.push(child);
      continue;
    }
    if (typeof node !== 'object' || seen.has(node)) continue;
    seen.add(node);
    scanned += 1;
    if (String(node.id) === want && typeof node.body === 'string') {
      return node.body;
    }
    if (Array.isArray(node.comments)) queue.push(node.comments);
    if (Array.isArray(node.nodes)) queue.push(node.nodes);
    if (Array.isArray(node.replies)) queue.push(node.replies);
  }
  return null;
}

function readMountedDraft(doc: any, selector: string): string | null {
  const el = doc?.querySelector?.(selector);
  if (!el) return null;
  if (typeof el.getAttribute === 'function') {
    const attr = el.getAttribute('data-prp-unsaved-draft');
    if (attr != null) return String(attr);
  }
  const ta = el.querySelector?.('[data-prp-composer-input], textarea');
  if (ta && ta.value != null) return String(ta.value);
  return null;
}

/** Any editor whose draft differs from the saved text stamped on that node. */
export function mountedEditorsDirty(doc: any): boolean {
  const nodes = doc?.querySelectorAll?.('[data-prp-unsaved-draft]');
  if (!nodes) return false;
  for (const el of nodes) {
    if (typeof el?.getAttribute !== 'function') continue;
    const draft = el.getAttribute('data-prp-unsaved-draft');
    if (draft == null) continue;
    const saved = el.getAttribute('data-prp-unsaved-saved');
    if (saved == null) {
      if (norm(draft)) return true;
      continue;
    }
    if (norm(draft) !== norm(saved)) return true;
  }
  return false;
}

export function snapshotUnsavedModalInput(args: {
  state?: any;
  detail?: any;
  doc?: any;
}): UnsavedModalSnapshot {
  const state = args?.state || {};
  const detail = args?.detail || {};
  const doc = args?.doc;
  const titleEl = doc?.querySelector?.('.prp-header__title-input');
  return {
    commentText: state.commentText,
    selectionDraft: state.selectionDraft,
    replyDrafts: state.replyDrafts || null,
    pendingBody: state.pendingReview?.body,
    finishReviewBody: readMountedDraft(doc, '[data-prp-finish-review="1"]'),
    editorDirty: mountedEditorsDirty(doc),
    titleEditing: Boolean(titleEl),
    titleDraft: titleEl ? String(titleEl.value ?? '') : null,
    titleSaved: detail?.title,
  };
}
