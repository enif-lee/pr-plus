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
export function describeTimelineEvent(ev) {
  if (!ev || typeof ev !== 'object') return null;
  const event = String(ev.event || '').trim();
  if (!event) return null;

  const t = (text) => ({ type: 'text', text: String(text) });
  const strong = (text) => ({ type: 'strong', text: String(text) });
  const title = (text) => ({ type: 'title', text: String(text) });
  const status = (text, tone) => ({
    type: 'status',
    text: String(text),
    tone: tone ? String(tone) : undefined,
  });
  const commit = (text) => ({ type: 'commit', text: String(text) });
  const user = (login) => ({ type: 'user', login: String(login || '') });
  const label = (name, color) => ({
    type: 'label',
    name: String(name || ''),
    color: color ? String(color) : undefined,
  });
  const milestone = (titleText) => ({
    type: 'milestone',
    title: String(titleText || ''),
  });

  const shortSha = (sha) => {
    const s = String(sha || '');
    return s.length > 7 ? s.slice(0, 7) : s;
  };

  switch (event) {
    case 'renamed': {
      const from = ev.rename?.from || '';
      const to = ev.rename?.to || '';
      if (!from && !to) return [t('changed the title')];
      return [
        t('changed the title from '),
        title(from || '…'),
        t(' to '),
        title(to || '…'),
      ];
    }
    case 'convert_to_draft':
      return [
        t('marked this pull request as '),
        status('draft', 'draft'),
      ];
    case 'ready_for_review':
      return [
        t('marked this pull request as '),
        status('ready for review', 'ready'),
      ];
    case 'closed':
      return [status('closed', 'closed'), t(' this')];
    case 'reopened':
      return [status('reopened', 'reopened'), t(' this')];
    case 'merged':
      return ev.commitId
        ? [status('merged', 'merged'), t(' commit '), commit(shortSha(ev.commitId))]
        : [status('merged', 'merged'), t(' this pull request')];
    case 'labeled':
      return ev.label?.name
        ? [t('added the '), label(ev.label.name, ev.label.color), t(' label')]
        : [t('added a label')];
    case 'unlabeled':
      return ev.label?.name
        ? [
            t('removed the '),
            label(ev.label.name, ev.label.color),
            t(' label'),
          ]
        : [t('removed a label')];
    case 'assigned':
      return ev.assignee
        ? [t('assigned '), user(ev.assignee)]
        : [t('assigned someone')];
    case 'unassigned':
      return ev.assignee
        ? [t('unassigned '), user(ev.assignee)]
        : [t('unassigned someone')];
    case 'review_requested':
      if (ev.requestedTeam) {
        return [t('requested a review from team '), strong(ev.requestedTeam)];
      }
      return ev.requestedReviewer
        ? [t('requested a review from '), user(ev.requestedReviewer)]
        : [t('requested a review')];
    case 'review_request_removed':
      if (ev.requestedTeam) {
        return [
          t('removed '),
          strong(ev.requestedTeam),
          t(' from requested reviewers'),
        ];
      }
      return ev.requestedReviewer
        ? [
            t('removed '),
            user(ev.requestedReviewer),
            t(' from requested reviewers'),
          ]
        : [t('removed a review request')];
    case 'review_dismissed':
      return ev.dismissReason
        ? [t('dismissed a review: '), strong(ev.dismissReason)]
        : [t('dismissed a review')];
    case 'milestoned':
      return ev.milestone?.title
        ? [
            t('added this to the '),
            milestone(ev.milestone.title),
            t(' milestone'),
          ]
        : [t('added this to a milestone')];
    case 'demilestoned':
      return ev.milestone?.title
        ? [
            t('removed this from the '),
            milestone(ev.milestone.title),
            t(' milestone'),
          ]
        : [t('removed this from a milestone')];
    case 'locked':
      return ev.lockReason
        ? [
            t('locked as '),
            status(ev.lockReason, 'locked'),
            t(' and limited conversation to collaborators'),
          ]
        : [t('locked and limited conversation to collaborators')];
    case 'unlocked':
      return [t('unlocked this conversation')];
    case 'head_ref_deleted':
      return [t('deleted the head branch')];
    case 'head_ref_restored':
      return [t('restored the head branch')];
    case 'base_ref_changed':
      return [t('changed the base branch')];
    case 'automatic_base_change_succeeded':
      return [t('changed the base branch automatically')];
    case 'automatic_base_change_failed':
      return [t('failed to change the base branch automatically')];
    case 'connected':
      return [t('connected a referenced issue')];
    case 'disconnected':
      return [t('disconnected a referenced issue')];
    case 'referenced':
      return ev.commitId
        ? [
            t('referenced this pull request from commit '),
            commit(shortSha(ev.commitId)),
          ]
        : [t('referenced this pull request')];
    case 'cross-referenced':
      return [t('mentioned this pull request')];
    case 'transferred':
      return [t('transferred this pull request')];
    case 'pinned':
      return [t('pinned this')];
    case 'unpinned':
      return [t('unpinned this')];
    case 'marked_as_duplicate':
      return [t('marked this as a duplicate')];
    case 'unmarked_as_duplicate':
      return [t('unmarked this as a duplicate')];
    case 'converted_to_discussion':
      return [t('converted this pull request to a discussion')];
    case 'added_to_project':
    case 'added_to_project_v2':
      return [t('added this to a project')];
    case 'removed_from_project':
    case 'removed_from_project_v2':
      return [t('removed this from a project')];
    case 'moved_columns_in_project':
    case 'moved_columns_in_project_v2':
      return [t('moved this in a project')];
    case 'auto_merge_enabled':
      return [t('enabled '), status('auto-merge', 'ready')];
    case 'auto_merge_disabled':
      return [t('disabled '), status('auto-merge', 'draft')];
    case 'added_to_merge_queue':
      return [t('added this to the '), status('merge queue', 'ready')];
    case 'removed_from_merge_queue':
      return [t('removed this from the '), status('merge queue', 'draft')];
    case 'deployed':
      return [t('deployed this')];
    case 'deployment_environment_changed':
      return [t('changed the deployment environment')];
    case 'user_blocked':
      return [t('blocked a user')];
    default:
      // Unknown event type — still surface a readable fallback
      return [t(event.replace(/_/g, ' '))];
  }
}

/**
 * Map a normalized issue event into a timeline item (or null if skipped).
 * @param {object} ev
 * @param {number} [i]
 */
export function timelineEventToItem(ev, i = 0) {
  if (!ev) return null;
  const parts = describeTimelineEvent(ev);
  if (!parts || !parts.length) return null;
  const id = ev.id != null ? ev.id : i;
  return {
    key: `evt-${id}`,
    kind: 'timeline-event',
    id,
    event: String(ev.event || ''),
    author: ev.actor || '',
    avatarUrl: ev.avatarUrl || ev.avatar_url || null,
    at: ev.at || ev.createdAt || null,
    parts,
    canDelete: false,
  };
}

function buildThreadEntry(c, children, snippetFn, files, viewerLogin, i) {
  const replies = (children.get(String(c.id)) || [])
    .slice()
    .sort((a, b) =>
      String(a.createdAt || '').localeCompare(String(b.createdAt || ''))
    )
    .map((r) => ({
      id: r.id,
      author: r.author,
      avatarUrl: r.avatarUrl || null,
      body: r.body || '',
      at: r.createdAt,
      createdAt: r.createdAt,
      pending: Boolean(r.pending),
      nodeId: r.nodeId || r.node_id || null,
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
      threads.some((t) => t.pending) ||
      String(review?.state || '').toUpperCase() === 'PENDING' ||
      rid === 'viewer-pending' ||
      (viewerPendingId != null && rid === viewerPendingId);
    const state = anyPending
      ? 'PENDING'
      : String(review?.state || 'COMMENTED').toUpperCase();
    // Group multi-file / body / non-comment reviews; always embed PENDING as a group
    const shouldGroup =
      anyPending ||
      threads.length >= 2 ||
      (threads.length >= 1 && Boolean(reviewBody)) ||
      (threads.length >= 1 &&
        state &&
        state !== 'COMMENTED' &&
        state !== 'PENDING');

    threads.sort((a, b) => {
      const pa = a.path || '';
      const pb = b.path || '';
      if (pa !== pb) return pa.localeCompare(pb);
      return (Number(a.line) || 0) - (Number(b.line) || 0);
    });

    if (shouldGroup) {
      usedReviewIds.add(rid);
      const latestThreadAt = threads.reduce(
        (max, t) => (String(t.at || '') > max ? String(t.at || '') : max),
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
        resolvedCount: threads.filter((t) => t.resolved).length,
        canDelete: false,
      });
    } else {
      for (const t of threads) orphanThreads.push(t);
    }
  }

  // Standalone review events (no grouped threads, or body-only approvals)
  (detail.reviews || []).forEach((r, i) => {
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
  events.forEach((ev, i) => {
    const item = timelineEventToItem(ev, i);
    if (item) items.push(item);
  });

  // Newest first (comments, threads, and system events interleaved by time)
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
 * Split newest-first timeline into dual windows + middle gap.
 * @param {Array} items
 * @param {object|null} meta
 */
export function partitionTimelineWithThreadGap(items, meta: any = null) {
  const list = Array.isArray(items) ? items : [];
  const hiddenCount = Math.max(0, Number(meta?.hiddenCount) || 0);
  const oldestIds = new Set(
    (meta?.oldestThreadIds || []).map(String).filter(Boolean)
  );
  const wantsGap = Boolean(meta?.hasMore) && hiddenCount > 0;

  if (!wantsGap || oldestIds.size === 0) {
    return {
      top: list,
      bottom: [],
      hiddenCount,
      showGap: wantsGap,
    };
  }

  function inOldestWindow(item: any) {
    if (!item) return false;
    if (item.kind === 'review-group') {
      return (item.threads || []).some(
        (t: any) =>
          t?.threadNodeId != null && oldestIds.has(String(t.threadNodeId))
      );
    }
    const tid =
      item.threadNodeId != null
        ? String(item.threadNodeId)
        : item.thread_node_id != null
          ? String(item.thread_node_id)
          : null;
    return (
      (item.kind === 'review-thread' || item.kind === 'review-comment') &&
      tid &&
      oldestIds.has(tid)
    );
  }

  const top = [];
  const bottom = [];
  for (const item of list) {
    if (inOldestWindow(item)) bottom.push(item);
    else top.push(item);
  }

  if (bottom.length === 0) {
    return {
      top: list,
      bottom: [],
      hiddenCount,
      showGap: wantsGap,
    };
  }

  return {
    top,
    bottom,
    hiddenCount,
    showGap: true,
  };
}
