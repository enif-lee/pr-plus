/**
 * Estimate native pulls-list speech-bubble comment total from open PR detail.
 *
 * Must never under-count after progressive Conversation load-more/all:
 * timeline `hasMore:false` must not publish an incomplete/empty `comments[]`
 * length as the list badge (was wiping GH's count to 0).
 */

export function estimateListCommentCount(detail: any): number | null {
  if (!detail || typeof detail !== 'object') return null;

  // Explicit write-through fields (list sketch / prior resync)
  for (const key of [
    'listCommentCount',
    '_listCommentCount',
    'commentCount',
  ] as const) {
    if (!Object.prototype.hasOwnProperty.call(detail, key)) continue;
    const n = Number((detail as any)[key]);
    if (Number.isFinite(n) && n >= 0) return n;
  }

  const meta =
    detail.commentsMeta && typeof detail.commentsMeta === 'object'
      ? detail.commentsMeta
      : null;
  if (meta) {
    const total = Number(meta.totalCount);
    if (Number.isFinite(total) && total >= 0) return total;
  }

  if (!Array.isArray(detail.comments)) return null;

  // Incomplete pagination — leave native GH list number alone
  if (meta && (meta.hasMore === true || meta.complete === false)) {
    return null;
  }
  // REST multi-page: nextPage still set
  if (meta && meta.nextPage != null && Number(meta.nextPage) > 0) {
    return null;
  }
  // Timeline still loading older windows: commentsMeta.hasMore may have been
  // incorrectly cleared; still refuse under-count while timeline is incomplete.
  const tm =
    detail.timelineMeta && typeof detail.timelineMeta === 'object'
      ? detail.timelineMeta
      : null;
  if (tm && (tm.hasMore === true || tm.complete === false)) {
    return null;
  }

  const n = detail.comments.length;
  // Empty array is not proof of zero comments after progressive load
  // (timeline-only windows can leave comments[] empty while native shows N).
  // Never publish 0 — preserves the list badge unless an explicit total says 0.
  if (n <= 0) return null;
  return n;
}
