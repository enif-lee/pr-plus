/**
 * Pure helpers for in-thread root/reply focus (↑/↓ while a review thread is
 * keyboard-focused). Shared by Diff + Conversation InlineThread hosts.
 */

export type ThreadFocusUnit = {
  id: string;
  role: 'root' | 'reply';
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
 * Step within a multi-unit thread. Wraps. Returns null when no multi-unit
 * navigation is possible (0–1 units).
 */
export function stepReviewThreadFocusUnit(
  units: ThreadFocusUnit[] | null | undefined,
  currentId: unknown,
  delta: number
): ThreadFocusUnit | null {
  const list = Array.isArray(units) ? units : [];
  if (list.length < 2) return null;
  const d = delta < 0 ? -1 : 1;
  const cur = currentId != null ? String(currentId) : '';
  let idx = cur ? list.findIndex((u) => u.id === cur) : -1;
  if (idx < 0) {
    // Seed: down → first reply (skip root if already on thread), up → last
    return d > 0 ? list[1] || list[0] : list[list.length - 1];
  }
  const next = (idx + d + list.length) % list.length;
  return list[next] || null;
}

/**
 * OptBtnHint / digit chrome only on the root action row of a multi-reply
 * thread. Single-comment threads keep root hints.
 */
export function shouldShowThreadOptHints(opts: {
  contextActive?: boolean;
  isRoot?: boolean;
  replyCount?: number;
} = {}): boolean {
  if (!opts.contextActive) return false;
  if (opts.isRoot === false) return false;
  return true;
}
