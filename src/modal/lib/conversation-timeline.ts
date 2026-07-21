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
        body: r.body || '',
        at: r.createdAt,
        canDelete: Boolean(
          detail.viewerLogin && r.author && r.author === detail.viewerLogin
        ),
      }));
    const snippet = snippetFn
      ? snippetFn(
          {
            path: c.path,
            line: c.line,
            startLine: c.startLine ?? c.start_line,
            side: c.side,
          },
          files
        )
      : null;
    items.push({
      key: `thread-${c.id || i}`,
      kind: 'review-thread',
      id: c.id,
      author: c.author,
      body: c.body || '',
      at: c.createdAt,
      path: c.path,
      line: c.line,
      startLine: c.startLine ?? c.start_line ?? null,
      side: c.side || 'RIGHT',
      resolved: Boolean(c.resolved),
      threadNodeId: c.threadNodeId || null,
      replies,
      snippet,
      canDelete: Boolean(
        detail.viewerLogin && c.author && c.author === detail.viewerLogin
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
