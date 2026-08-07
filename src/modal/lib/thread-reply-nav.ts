/**
 * Pure helpers for in-thread root/reply focus (↑/↓ while a review thread is
 * keyboard-focused). Shared by Diff + Conversation InlineThread hosts.
 *
 * Diff plain ↑/↓ continuum: step units without wrap; at ends return exit so
 * callers hand off to line/thread selection. Entry seeds first unit on ↓,
 * last unit on ↑.
 */

export type ThreadFocusUnit = {
  id: string;
  role: 'root' | 'reply';
};

/** Result of one in-thread ↑/↓ step (no wrap). */
export type StepThreadFocusResult = {
  /** Next unit when staying inside the thread */
  unit: ThreadFocusUnit | null;
  /**
   * True when current is at the end in `delta` direction and navigation should
   * leave the thread (line / other thread selection).
   */
  exit: boolean;
};

/**
 * All comments that transitively reply under `rootId` (BFS by in_reply_to_id),
 * oldest → newest. Handles nested reply chains GitHub sometimes uses
 * (reply-to-reply) that one-level `groupReviewThreads` would drop.
 */
export function collectThreadReplyComments(
  rootId: unknown,
  allComments: any[] | null | undefined
): any[] {
  const root = rootId != null && String(rootId).trim() ? String(rootId) : '';
  if (!root) return [];
  const list = Array.isArray(allComments) ? allComments : [];
  if (!list.length) return [];
  /** parentId → children */
  const children = new Map<string, any[]>();
  for (const c of list) {
    if (!c || c.id == null) continue;
    if (String(c.id) === root) continue;
    const parent = c.inReplyToId ?? c.in_reply_to_id ?? null;
    if (parent == null) continue;
    const pk = String(parent);
    if (!children.has(pk)) children.set(pk, []);
    children.get(pk)!.push(c);
  }
  const out: any[] = [];
  const seen = new Set<string>([root]);
  const queue = [root];
  while (queue.length) {
    const id = queue.shift() as string;
    const kids = children.get(id) || [];
    // Stable display order among siblings
    kids.sort((a, b) =>
      String(a?.createdAt || a?.created_at || '').localeCompare(
        String(b?.createdAt || b?.created_at || '')
      )
    );
    for (const child of kids) {
      const cid = String(child.id);
      if (seen.has(cid)) continue;
      seen.add(cid);
      out.push(child);
      queue.push(cid);
    }
  }
  return out;
}

/**
 * Ordered units: root first, then replies oldest → newest (display order).
 */
export function listReviewThreadFocusUnits(
  rootId: unknown,
  replies: any[] | null | undefined
): ThreadFocusUnit[] {
  const root = rootId != null && String(rootId).trim() ? String(rootId) : '';
  if (!root) return [];
  const out: ThreadFocusUnit[] = [{ id: root, role: 'root' }];
  const list = Array.isArray(replies) ? replies : [];
  for (const r of list) {
    if (!r || r.id == null) continue;
    // Skip pending placeholders if marked
    if (r.pending && r.id === root) continue;
    const id = String(r.id);
    if (id === root) continue;
    out.push({ id, role: 'reply' });
  }
  return out;
}

/**
 * Direction-aware entry seed when landing on a multi-unit thread from
 * line/thread selection (↓ → first/root, ↑ → last reply).
 */
export function seedReviewThreadFocusUnit(
  units: ThreadFocusUnit[] | null | undefined,
  delta: number
): ThreadFocusUnit | null {
  const list = Array.isArray(units) ? units : [];
  if (!list.length) return null;
  if (list.length === 1) return list[0];
  return delta < 0 ? list[list.length - 1] : list[0];
}

/**
 * Step within a multi-unit thread. **Does not wrap.**
 * - Missing/unknown current → entry seed (down: first, up: last)
 * - At last unit + down → `{ unit: null, exit: true }`
 * - At first unit + up → `{ unit: null, exit: true }`
 * - 0–1 units → `{ unit: null, exit: false }` (no multi-unit nav)
 */
export function stepReviewThreadFocusUnit(
  units: ThreadFocusUnit[] | null | undefined,
  currentId: unknown,
  delta: number
): StepThreadFocusResult {
  const list = Array.isArray(units) ? units : [];
  if (list.length < 2) return { unit: null, exit: false };
  const d = delta < 0 ? -1 : 1;
  const cur = currentId != null ? String(currentId) : '';
  let idx = cur ? list.findIndex((u) => u.id === cur) : -1;
  if (idx < 0) {
    // Entry / reseed: direction preserved
    const seeded = seedReviewThreadFocusUnit(list, d);
    return { unit: seeded, exit: false };
  }
  const next = idx + d;
  if (next < 0 || next >= list.length) {
    return { unit: null, exit: true };
  }
  return { unit: list[next] || null, exit: false };
}

/**
 * True when a further step in `delta` would leave the multi-unit thread.
 */
export function wouldExitReviewThreadFocus(
  units: ThreadFocusUnit[] | null | undefined,
  currentId: unknown,
  delta: number
): boolean {
  return stepReviewThreadFocusUnit(units, currentId, delta).exit;
}

/**
 * OptBtnHint eligibility for a comment row inside a context-active thread.
 *
 * - Inactive thread → no hints
 * - When a unit is focused (`focusedUnitId`): only that unit's row
 * - When unit unset (thread focus without unit step): root row only
 *   (legacy root-only for single-comment / not-yet-stepped multi-reply)
 */
export function shouldShowThreadOptHints(opts: {
  contextActive?: boolean;
  isRoot?: boolean;
  replyCount?: number;
  /** Comment id of this action/reaction row */
  commentId?: string | number | null;
  /** Active unit within the thread (root or reply id) */
  focusedUnitId?: string | number | null;
} = {}): boolean {
  if (!opts.contextActive) return false;
  const unit =
    opts.focusedUnitId != null && String(opts.focusedUnitId).trim() !== ''
      ? String(opts.focusedUnitId)
      : '';
  if (unit) {
    if (opts.commentId == null || opts.commentId === '') return false;
    return String(opts.commentId) === unit;
  }
  // No unit focus: root-only (single-comment threads / pre-step multi)
  if (opts.isRoot === false) return false;
  return true;
}

/**
 * Pure finish-review Escape owner (layered).
 * - `blur-input`: comment field focused → blur only
 * - `close-form`: form open, no field focus → close finish-review
 * - `none`: finish-review not open (shell may handle Esc)
 */
export function resolveFinishReviewEscapeAction(opts: {
  finishReviewOpen?: boolean;
  finishInputFocused?: boolean;
} = {}): 'blur-input' | 'close-form' | 'none' {
  if (!opts.finishReviewOpen) return 'none';
  if (opts.finishInputFocused) return 'blur-input';
  return 'close-form';
}
