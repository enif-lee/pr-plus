/** @module modal/lib/conversation-timeline */
/**
 * Build GitHub-like conversation timeline + pagination for review comments.
 * Review threads are individual timeline entries with nested replies + optional code snippet.
 */

/**
 * @param {object} detail
 * @param {{ snippetForComment?: Function }} [opts]
 * @returns {Array}
 */
export function buildConversationTimeline(detail, opts: any = {}) {
  if (!detail) return [];
  const items = [];
  const snippetFn =
    typeof opts.snippetForComment === 'function'
      ? opts.snippetForComment
      : typeof globalThis !== 'undefined' &&
          globalThis.PRModalDiffSnippet?.snippetForComment
        ? globalThis.PRModalDiffSnippet.snippetForComment
        : null;
  const files = detail.files || [];

  (detail.reviews || []).forEach((r, i) => {
    if (!r.body && (!r.state || r.state === 'COMMENTED' || r.state === 'PENDING')) return;
    items.push({
      key: `rev-${r.id || i}`,
      kind: 'review',
      id: r.id,
      author: r.author,
      avatarUrl: r.avatarUrl || r.avatar_url || null,
      state: r.state,
      body: r.body || '',
      at: r.submittedAt,
      canDelete: false,
    });
  });

  (detail.comments || []).forEach((c, i) => {
    items.push({
      key: `c-${c.id || i}`,
      kind: 'issue-comment',
      id: c.id,
      author: c.author,
      avatarUrl: c.avatarUrl || c.avatar_url || null,
      body: c.body || '',
      at: c.createdAt,
      canDelete: Boolean(
        detail.viewerLogin && c.author && c.author === detail.viewerLogin
      ),
    });
  });

  // Full review threads (root + replies) as nested timeline entries
  const allRc = Array.isArray(detail.reviewComments) ? detail.reviewComments : [];
  const byId = new Map();
  for (const c of allRc) {
    if (c && c.id != null) byId.set(String(c.id), c);
  }
  const children = new Map();
  const roots = [];
  for (const c of allRc) {
    if (!c) continue;
    const parentId = c.inReplyToId ?? c.in_reply_to_id ?? null;
    if (parentId != null && byId.has(String(parentId))) {
      const key = String(parentId);
      if (!children.has(key)) children.set(key, []);
      children.get(key).push(c);
    } else {
      roots.push(c);
    }
  }

  roots.forEach((c, i) => {
    const replies = (children.get(String(c.id)) || [])
      .slice()
      .sort((a, b) =>
        String(a.createdAt || '').localeCompare(String(b.createdAt || ''))
      )
      .map((r) => ({
        id: r.id,
        author: r.author,
        avatarUrl: r.avatarUrl || r.avatar_url || null,
        body: r.body || '',
        at: r.createdAt,
        pending: Boolean(r.pending),
        nodeId: r.nodeId || r.node_id || null,
        canDelete: Boolean(
          detail.viewerLogin &&
            r.author &&
            r.author === detail.viewerLogin &&
            !r.pending
        ),
      }));
    const snippet = snippetFn
      ? snippetFn(
          {
            path: c.path,
            line: c.line,
            originalLine: c.originalLine ?? c.original_line,
            startLine: c.startLine ?? c.start_line,
            side: c.side,
            diffHunk: c.diffHunk || c.diff_hunk || '',
          },
          files
        )
      : null;
    const displayLine =
      c.line != null
        ? Number(c.line)
        : c.originalLine != null
          ? Number(c.originalLine)
          : c.original_line != null
            ? Number(c.original_line)
            : null;
    items.push({
      key: `thread-${c.id || i}`,
      kind: 'review-thread',
      id: c.id,
      author: c.author,
      avatarUrl: c.avatarUrl || c.avatar_url || null,
      body: c.body || '',
      at: c.createdAt,
      path: c.path,
      line: displayLine,
      startLine: c.startLine ?? c.start_line ?? null,
      side: c.side || 'RIGHT',
      resolved: Boolean(c.resolved),
      outdated: Boolean(c.outdated),
      threadNodeId: c.threadNodeId || null,
      // PRRC_… needed for pending-review GraphQL replies (REST GET 404s on PENDING)
      nodeId: c.nodeId || c.node_id || null,
      pending: Boolean(c.pending),
      replies,
      snippet,
      canDelete: Boolean(
        detail.viewerLogin &&
          c.author &&
          c.author === detail.viewerLogin &&
          !c.pending
      ),
    });
  });

  // Newest first so page 1 is latest activity; Older → higher pages, Newer → lower pages
  items.sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
  return items;
}

/**
 * Paginate a newest-first timeline.
 * @param {Array} items
 * @param {{ page?: number, pageSize?: number }} opts
 */
export function pageTimelineItems(items, opts: any = {}) {
  const list = Array.isArray(items) ? items : [];
  const pageSize =
    Number.isFinite(opts.pageSize) && opts.pageSize > 0 ? Math.floor(opts.pageSize) : 20;
  const page = Number.isFinite(opts.page) && opts.page > 0 ? Math.floor(opts.page) : 1;
  const total = list.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const slice = list.slice(start, start + pageSize);
  const hasNewer = safePage > 1;
  const hasOlder = safePage < totalPages;
  return {
    items: slice,
    page: safePage,
    pageSize,
    total,
    totalPages,
    hasMore: hasOlder,
    hasPrev: hasNewer,
    hasNewer,
    hasOlder,
  };
}

/**
 * Split a newest-first timeline into dual windows with a middle gap, matching
 * GitHub's "N hidden items / Load more…" fold when review threads are partial.
 *
 * @param {Array} items
 * @param {{ oldestThreadIds?: string[], newestThreadIds?: string[], hiddenCount?: number, hasMore?: boolean }|null} meta
 * @returns {{ top: Array, bottom: Array, hiddenCount: number, showGap: boolean }}
 */
export function partitionTimelineWithThreadGap(items, meta: any = null) {
  const list = Array.isArray(items) ? items : [];
  const hiddenCount = Math.max(0, Number(meta?.hiddenCount) || 0);
  const oldestIds = new Set(
    (meta?.oldestThreadIds || []).map(String).filter(Boolean)
  );
  const showGap = Boolean(meta?.hasMore) && hiddenCount > 0;

  if (!showGap || oldestIds.size === 0) {
    // Single window (or no dual seed yet): gap sits after all loaded items
    return {
      top: list,
      bottom: [],
      hiddenCount,
      showGap,
    };
  }

  const top = [];
  const bottom = [];
  for (const item of list) {
    const tid =
      item?.threadNodeId != null
        ? String(item.threadNodeId)
        : item?.kind === 'review-thread' && item?.id != null
          ? null
          : null;
    if (
      (item?.kind === 'review-thread' || item?.kind === 'review-comment') &&
      tid &&
      oldestIds.has(tid)
    ) {
      bottom.push(item);
    } else {
      top.push(item);
    }
  }

  // Preserve newest-first inside each window (items already sorted)
  return {
    top,
    bottom,
    hiddenCount,
    showGap: showGap && bottom.length > 0,
  };
}
