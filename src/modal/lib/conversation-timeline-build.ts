import {
  timelineEventToItem,
} from './conversation-timeline-events';
import { partitionConversationLoadMore } from './timeline-pagination';

/** Split from conversation-timeline.ts: conversation-timeline-build */
/** @module modal/lib/conversation-timeline */
/**
 * Build GitHub-like conversation timeline + pagination for review comments.
 * Multiple file threads from the same Pull Request Review are grouped under
 * a single review-group entry (GitHub conversation UI).
 *
 * Also merges REST issue system events (title rename, draft/ready, labels,
 * assignees, review requests, milestones, closed/reopened, …).
 */

/**
 * @typedef {{ type: 'text', text: string }
 *   | { type: 'strong', text: string }
 *   | { type: 'title', text: string }
 *   | { type: 'status', text: string, tone?: string }
 *   | { type: 'code', text: string }
 *   | { type: 'commit', text: string }
 *   | { type: 'branch', text: string }
 *   | { type: 'user', login: string }
 *   | { type: 'label', name: string, color?: string }
 *   | { type: 'milestone', title: string }
 * } TimelinePart
 */

/**
 * Build GitHub-style narrative parts for a system timeline event (after actor).
 * @param {object} ev normalized event from fetchPrTimelineEvents
 * @returns {TimelinePart[]|null} null when the event should not be shown
 */
export function buildThreadEntry(c: any, children: any, snippetFn: any, files: any, viewerLogin: any, i: any) {
  const replies = (children.get(String(c.id)) || [])
    .slice()
    .sort((a: any, b: any) =>
      String(a.createdAt || '').localeCompare(String(b.createdAt || ''))
    )
    .map((r: any) => ({
      id: r.id,
      author: r.author,
      avatarUrl: r.avatarUrl || null,
      body: r.body || '',
      at: r.createdAt,
      createdAt: r.createdAt,
      pending: Boolean(r.pending),
      nodeId: r.nodeId || r.node_id || null,
      reactions: Array.isArray(r.reactions) ? r.reactions : [],
      isMinimized: Boolean(r.isMinimized ?? r.is_minimized ?? false),
      minimizedReason: r.minimizedReason ?? r.minimized_reason ?? null,
      viewerCanMinimize:
        r.viewerCanMinimize != null
          ? Boolean(r.viewerCanMinimize)
          : r.viewer_can_minimize != null
            ? Boolean(r.viewer_can_minimize)
            : null,
      canDelete: Boolean(
        viewerLogin && r.author && r.author === viewerLogin && !r.pending
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
  const reviewId =
    c.reviewId != null
      ? Number(c.reviewId)
      : c.pendingReviewId != null
        ? Number(c.pendingReviewId)
        : c.pull_request_review_id != null
          ? Number(c.pull_request_review_id)
          : null;
  return {
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
    nodeId: c.nodeId || c.node_id || null,
    reactions: Array.isArray(c.reactions) ? c.reactions : [],
    isMinimized: Boolean(c.isMinimized ?? c.is_minimized ?? false),
    minimizedReason: c.minimizedReason ?? c.minimized_reason ?? null,
    viewerCanMinimize:
      c.viewerCanMinimize != null
        ? Boolean(c.viewerCanMinimize)
        : c.viewer_can_minimize != null
          ? Boolean(c.viewer_can_minimize)
          : null,
    reviewId: Number.isFinite(reviewId) ? reviewId : null,
    pending: Boolean(c.pending),
    replies,
    snippet,
    canDelete: Boolean(
      viewerLogin && c.author && c.author === viewerLogin && !c.pending
    ),
  };
}

/**
 * Numeric epoch ms for a timeline item timestamp (0 if missing/invalid).
 * Prefer this over string localeCompare so ISO variants sort correctly.
 */
export function timelineItemTimeMs(item: any): number {
  if (!item || typeof item !== 'object') return 0;
  const raw =
    item.at ||
    item.createdAt ||
    item.submittedAt ||
    item.created_at ||
    '';
  const t = Date.parse(String(raw));
  return Number.isFinite(t) ? t : 0;
}

/** Newest-first compare; stable secondary by key/id. */
export function compareTimelineItemsNewestFirst(a: any, b: any): number {
  const d = timelineItemTimeMs(b) - timelineItemTimeMs(a);
  if (d !== 0) return d;
  return String(b?.key || b?.id || '').localeCompare(
    String(a?.key || a?.id || '')
  );
}

/**
 * @param {object} detail
 * @param {{ snippetForComment?: Function }} [opts]
 * @returns {Array}
 */
export function buildConversationTimeline(detail: any, opts: any = {}) {
  if (!detail) return [];
  const items = [];
  const snippetFn =
    typeof opts.snippetForComment === 'function'
      ? opts.snippetForComment
      : typeof globalThis !== 'undefined' &&
          (globalThis as any).PRModalDiffSnippet?.snippetForComment
        ? (globalThis as any).PRModalDiffSnippet.snippetForComment
        : null;
  const files = detail.files || [];
  const viewerLogin = detail.viewerLogin;

  // Index submitted reviews for group headers (+ viewer's PENDING review)
  const reviewById = new Map();
  for (const r of detail.reviews || []) {
    if (r && r.id != null) reviewById.set(String(r.id), r);
  }
  const vpr = detail.viewerPendingReview;
  if (vpr?.id != null && !reviewById.has(String(vpr.id))) {
    reviewById.set(String(vpr.id), {
      id: vpr.id,
      author: vpr.author || detail.viewerLogin || '',
      avatarUrl: vpr.avatarUrl || vpr.avatar_url || null,
      state: 'PENDING',
      body: vpr.body || '',
      submittedAt: vpr.submittedAt || vpr.createdAt || null,
      isBot: false,
    });
  }
  const viewerPendingId =
    vpr?.id != null
      ? String(vpr.id)
      : null;

  // Issue comments stay flat
  (detail.comments || []).forEach((c: any, i: any) => {
    items.push({
      key: `c-${c.id || i}`,
      kind: 'issue-comment',
      id: c.id,
      author: c.author,
      avatarUrl: c.avatarUrl || c.avatar_url || null,
      body: c.body || '',
      at: c.createdAt,
      nodeId: c.nodeId || c.node_id || null,
      reactions: Array.isArray(c.reactions) ? c.reactions : [],
      isMinimized: Boolean(c.isMinimized ?? c.is_minimized ?? false),
      minimizedReason: c.minimizedReason ?? c.minimized_reason ?? null,
      viewerCanMinimize:
        c.viewerCanMinimize != null
          ? Boolean(c.viewerCanMinimize)
          : c.viewer_can_minimize != null
            ? Boolean(c.viewer_can_minimize)
            : null,
      canDelete: Boolean(
        viewerLogin && c.author && c.author === viewerLogin
      ),
    });
  });

  // Build root threads + replies
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

  const threadsByReviewId = new Map();
  const orphanThreads = [];
  roots.forEach((c, i) => {
    const thread = buildThreadEntry(
      c,
      children,
      snippetFn,
      files,
      viewerLogin,
      i
    );
    // Pending comments without reviewId → viewer's pending review bucket
    let groupKey =
      thread.reviewId != null
        ? String(thread.reviewId)
        : thread.pending && viewerPendingId
          ? viewerPendingId
          : thread.pending
            ? 'viewer-pending'
            : null;
    if (groupKey != null) {
      if (!threadsByReviewId.has(groupKey)) threadsByReviewId.set(groupKey, []);
      threadsByReviewId.get(groupKey).push(thread);
    } else {
      orphanThreads.push(thread);
    }
  });

  const usedReviewIds = new Set();

  for (const [rid, threads] of threadsByReviewId) {
    const review = reviewById.get(rid);
    const reviewBody = String(review?.body || '').trim();
    const anyPending =
      threads.some((t: any) => t.pending) ||
      String(review?.state || '').toUpperCase() === 'PENDING' ||
      rid === 'viewer-pending' ||
      (viewerPendingId != null && rid === viewerPendingId);
    const state = anyPending
      ? 'PENDING'
      : String(review?.state || 'COMMENTED').toUpperCase();
    // Always group when threads share a reviewId / pending bucket — including
    // single-thread COMMENTED with empty body and any resolve state. Standalone
    // review-thread cards are only for true orphans (no reviewId/pending key).
    const shouldGroup = threads.length >= 1;

    threads.sort((a: any, b: any) => {
      const pa = a.path || '';
      const pb = b.path || '';
      if (pa !== pb) return pa.localeCompare(pb);
      return (Number(a.line) || 0) - (Number(b.line) || 0);
    });

    if (shouldGroup) {
      usedReviewIds.add(rid);
      const latestThreadAt = threads.reduce(
        (max: any, t: any) => (String(t.at || '') > max ? String(t.at || '') : max),
        ''
      );
      const at =
        review?.submittedAt || latestThreadAt || threads[0]?.at || null;
      const author =
        review?.author ||
        threads[0]?.author ||
        (anyPending ? viewerLogin : '') ||
        '';
      items.push({
        key: `rev-group-${rid}`,
        kind: 'review-group',
        id: Number(rid) || rid,
        author,
        avatarUrl:
          review?.avatarUrl ||
          review?.avatar_url ||
          threads[0]?.avatarUrl ||
          null,
        state,
        body: reviewBody,
        at,
        isBot:
          Boolean(review?.isBot) ||
          /\[bot\]$/i.test(author) ||
          String(review?.type || '').toLowerCase() === 'bot',
        pending: anyPending,
        threads,
        threadCount: threads.length,
        resolvedCount: threads.filter((t: any) => t.resolved).length,
        canDelete: false,
      });
    } else {
      for (const t of threads) orphanThreads.push(t);
    }
  }

  // Standalone review events (no grouped threads, or body-only approvals)
  (detail.reviews || []).forEach((r: any, i: any) => {
    if (r?.id != null && usedReviewIds.has(String(r.id))) return;
    if (!r.body && (!r.state || r.state === 'COMMENTED' || r.state === 'PENDING')) {
      return;
    }
    items.push({
      key: `rev-${r.id || i}`,
      kind: 'review',
      id: r.id,
      author: r.author,
      avatarUrl: r.avatarUrl || r.avatar_url || null,
      state: r.state,
      body: r.body || '',
      at: r.submittedAt,
      isBot:
        Boolean(r.isBot) ||
        /\[bot\]$/i.test(String(r.author || '')) ||
        String(r.type || '').toLowerCase() === 'bot',
      canDelete: false,
    });
  });

  for (const t of orphanThreads) {
    items.push(t);
  }

  // System / status events (title, draft, labels, assignees, …)
  const events = Array.isArray(detail.timelineEvents)
    ? detail.timelineEvents
    : [];
  events.forEach((ev: any, i: any) => {
    const item = timelineEventToItem(ev, i);
    if (item) items.push(item);
  });

  // Newest first (comments, threads, and system events interleaved by time)
  items.sort(compareTimelineItemsNewestFirst);
  return items;
}

/**
 * Paginate a newest-first timeline.
 * @param {Array} items
 * @param {{ page?: number, pageSize?: number }} opts
 */
export function pageTimelineItems(items: any, opts: any = {}) {
  const list = Array.isArray(items) ? items : [];
  const pageSize =
    Number.isFinite(opts.pageSize) && opts.pageSize > 0
      ? Math.floor(opts.pageSize)
      : 20;
  const page =
    Number.isFinite(opts.page) && opts.page > 0 ? Math.floor(opts.page) : 1;
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
 * Conversation Load more fold (threads + timelineItems).
 * Placement: end while threads incomplete; middle at timeline coverage floor
 * when threads are complete but timelineItems still has older pages (e.g. after
 * Diff auto load-all of review threads).
 *
 * @param {Array} items
 * @param {object|null} threadsMeta reviewThreadsMeta
 * @param {object|null} timelineMeta detail.timelineMeta
 */
export function partitionTimelineWithThreadGap(
  items: any,
  threadsMeta: any = null,
  timelineMeta: any = null
) {
  return partitionConversationLoadMore(items, threadsMeta, timelineMeta);
}

// ---------------------------------------------------------------------------
// Timeline category tips (global filter prefs)
// ---------------------------------------------------------------------------

/** Selectable tip categories (not including synthetic "all"). */
