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

/**
 * Optimistic system event after a confirmed meta write (labels / milestone / …).
 * Id is always `local:…` so it never collides with GitHub numeric event ids.
 */
export function makeLocalTimelineEvent(partial: {
  event: string;
  actor?: string;
  avatarUrl?: string;
  at?: string;
  label?: { name: string; color?: string; description?: string } | null;
  assignee?: string | null;
  requestedReviewer?: string | null;
  requestedTeam?: string | null;
  milestone?: { number?: number | null; title?: string } | null;
  rename?: { from: string; to: string } | null;
  commitId?: string | null;
} = { event: '' }) {
  const event = String(partial.event || '').trim();
  const stamp = partial.at || new Date().toISOString();
  const keyPart =
    partial.label?.name ||
    partial.assignee ||
    partial.requestedReviewer ||
    partial.requestedTeam ||
    partial.milestone?.title ||
    partial.milestone?.number ||
    partial.rename?.to ||
    event;
  const id = `local:${event}:${String(keyPart).toLowerCase()}:${stamp}:${Math.random().toString(36).slice(2, 7)}`;
  const label =
    partial.label && partial.label.name
      ? {
          name: String(partial.label.name),
          color: String(partial.label.color || ''),
          description: String(partial.label.description || ''),
        }
      : null;
  return {
    id,
    event,
    actor: partial.actor || '',
    avatarUrl: partial.avatarUrl || '',
    at: stamp,
    label,
    assignee: partial.assignee || null,
    requestedReviewer: partial.requestedReviewer || null,
    requestedTeam: partial.requestedTeam || null,
    milestone: partial.milestone || null,
    rename: partial.rename || null,
    commitId: partial.commitId || null,
    lockReason: null,
    dismissReason: null,
    reviewState: null,
    _local: true,
  };
}

/** Same narrative (event + primary subject) — used to drop local rows once server lands. */
export function timelineEventsNarrativelyEqual(a: any, b: any): boolean {
  if (!a || !b) return false;
  if (String(a.event || '') !== String(b.event || '')) return false;
  const al = String(a.label?.name || '').toLowerCase();
  const bl = String(b.label?.name || '').toLowerCase();
  if (al || bl) return al === bl && al !== '';
  const aa = String(a.assignee || '').toLowerCase();
  const ba = String(b.assignee || '').toLowerCase();
  if (aa || ba) return aa === ba && aa !== '';
  const ar = String(a.requestedReviewer || '').toLowerCase();
  const br = String(b.requestedReviewer || '').toLowerCase();
  if (ar || br) return ar === br && ar !== '';
  const at = String(a.requestedTeam || '').toLowerCase();
  const bt = String(b.requestedTeam || '').toLowerCase();
  if (at || bt) return at === bt && at !== '';
  const am = String(a.milestone?.title || a.milestone?.number || '').toLowerCase();
  const bm = String(b.milestone?.title || b.milestone?.number || '').toLowerCase();
  if (am || bm) return am === bm && am !== '';
  const af = String(a.rename?.from || '');
  const at2 = String(a.rename?.to || '');
  const bf = String(b.rename?.from || '');
  const bt2 = String(b.rename?.to || '');
  if (af || at2 || bf || bt2) return af === bf && at2 === bt2;
  // Same event type with no subject (closed/reopened/…) — treat as equal
  return true;
}

/**
 * True when a *server* event can stand in for a *local* optimistic row.
 * Server must not be older than the local write (minus small skew) — a labeled
 * event from a test run 30s ago must not swallow a brand-new local labeled row.
 */
export function serverEventCoversLocal(
  server: any,
  local: any,
  skewMs = 5_000,
  maxFutureMs = 180_000
): boolean {
  if (!timelineEventsNarrativelyEqual(server, local)) return false;
  const ts = Date.parse(String(server?.at || server?.createdAt || ''));
  const tl = Date.parse(String(local?.at || local?.createdAt || ''));
  if (!Number.isFinite(ts) || !Number.isFinite(tl)) return false;
  return ts >= tl - skewMs && ts <= tl + maxFutureMs;
}

/** @deprecated use serverEventCoversLocal — kept for callers/tests */
export function timelineEventsCloseInTime(
  a: any,
  b: any,
  windowMs = 120_000
): boolean {
  const ta = Date.parse(String(a?.at || a?.createdAt || ''));
  const tb = Date.parse(String(b?.at || b?.createdAt || ''));
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return false;
  return Math.abs(ta - tb) <= windowMs;
}

/**
 * Union timeline events by id. Server (non-local) rows replace matching local
 * optimistics only when narrative matches **and** the server event is at least
 * as new as the local write (not a historical twin from a prior mutation).
 */
export function mergeTimelineEventsById(prev: any, next: any): any[] {
  const byId = new Map<string, any>();
  for (const e of Array.isArray(prev) ? prev : []) {
    if (e && e.id != null) byId.set(String(e.id), e);
  }
  for (const e of Array.isArray(next) ? next : []) {
    if (e && e.id != null) byId.set(String(e.id), e);
  }
  const all = [...byId.values()];
  const server = all.filter((e) => !String(e?.id ?? '').startsWith('local:'));
  const locals = all.filter((e) => String(e?.id ?? '').startsWith('local:'));
  const keptLocals = locals.filter(
    (local) => !server.some((s) => serverEventCoversLocal(s, local))
  );
  return [...server, ...keptLocals];
}

function labelNameKey(l: any): string {
  const name = typeof l === 'string' ? l : l?.name;
  return String(name || '')
    .trim()
    .toLowerCase();
}

function labelObj(l: any): { name: string; color: string; description?: string } | null {
  if (typeof l === 'string' && l.trim()) {
    return { name: l.trim(), color: '' };
  }
  if (l && typeof l === 'object' && l.name) {
    return {
      name: String(l.name),
      color: String(l.color || ''),
      description: String(l.description || ''),
    };
  }
  return null;
}

/** labeled / unlabeled events for set-labels write-through. */
export function labelChangeTimelineEvents(
  prevLabels: any,
  nextLabels: any,
  actor: { login?: string; avatarUrl?: string } = {}
): any[] {
  const prevMap = new Map<string, any>();
  for (const l of Array.isArray(prevLabels) ? prevLabels : []) {
    const k = labelNameKey(l);
    const obj = labelObj(l);
    if (k && obj) prevMap.set(k, obj);
  }
  const nextMap = new Map<string, any>();
  for (const l of Array.isArray(nextLabels) ? nextLabels : []) {
    const k = labelNameKey(l);
    const obj = labelObj(l);
    if (k && obj) nextMap.set(k, obj);
  }
  const out: any[] = [];
  const actorLogin = actor.login || '';
  const avatarUrl = actor.avatarUrl || '';
  for (const [k, lab] of nextMap) {
    if (!prevMap.has(k)) {
      out.push(
        makeLocalTimelineEvent({
          event: 'labeled',
          actor: actorLogin,
          avatarUrl,
          label: lab,
        })
      );
    }
  }
  for (const [k, lab] of prevMap) {
    if (!nextMap.has(k)) {
      out.push(
        makeLocalTimelineEvent({
          event: 'unlabeled',
          actor: actorLogin,
          avatarUrl,
          label: lab,
        })
      );
    }
  }
  return out;
}

function loginKey(x: any): string {
  return String(typeof x === 'string' ? x : x?.login || '')
    .trim()
    .toLowerCase();
}

/** assigned / unassigned for assignee meta writes. */
export function assigneeChangeTimelineEvents(
  prevAssignees: any,
  nextAssignees: any,
  actor: { login?: string; avatarUrl?: string } = {}
): any[] {
  const prev = new Set(
    (Array.isArray(prevAssignees) ? prevAssignees : [])
      .map(loginKey)
      .filter(Boolean)
  );
  const nextList = Array.isArray(nextAssignees) ? nextAssignees : [];
  const next = new Set(nextList.map(loginKey).filter(Boolean));
  const out: any[] = [];
  const actorLogin = actor.login || '';
  const avatarUrl = actor.avatarUrl || '';
  for (const a of nextList) {
    const k = loginKey(a);
    if (!k || prev.has(k)) continue;
    out.push(
      makeLocalTimelineEvent({
        event: 'assigned',
        actor: actorLogin,
        avatarUrl,
        assignee: typeof a === 'string' ? a : a?.login || k,
      })
    );
  }
  for (const a of Array.isArray(prevAssignees) ? prevAssignees : []) {
    const k = loginKey(a);
    if (!k || next.has(k)) continue;
    out.push(
      makeLocalTimelineEvent({
        event: 'unassigned',
        actor: actorLogin,
        avatarUrl,
        assignee: typeof a === 'string' ? a : a?.login || k,
      })
    );
  }
  return out;
}

/** review_requested / review_request_removed for reviewer meta writes. */
export function reviewerChangeTimelineEvents(
  prevReviewers: any,
  nextReviewers: any,
  actor: { login?: string; avatarUrl?: string } = {}
): any[] {
  const prev = new Set(
    (Array.isArray(prevReviewers) ? prevReviewers : [])
      .map(loginKey)
      .filter(Boolean)
  );
  const nextList = Array.isArray(nextReviewers) ? nextReviewers : [];
  const next = new Set(nextList.map(loginKey).filter(Boolean));
  const out: any[] = [];
  const actorLogin = actor.login || '';
  const avatarUrl = actor.avatarUrl || '';
  for (const r of nextList) {
    const k = loginKey(r);
    if (!k || prev.has(k)) continue;
    out.push(
      makeLocalTimelineEvent({
        event: 'review_requested',
        actor: actorLogin,
        avatarUrl,
        requestedReviewer: typeof r === 'string' ? r : r?.login || k,
      })
    );
  }
  for (const r of Array.isArray(prevReviewers) ? prevReviewers : []) {
    const k = loginKey(r);
    if (!k || next.has(k)) continue;
    out.push(
      makeLocalTimelineEvent({
        event: 'review_request_removed',
        actor: actorLogin,
        avatarUrl,
        requestedReviewer: typeof r === 'string' ? r : r?.login || k,
      })
    );
  }
  return out;
}

/** milestoned / demilestoned for milestone meta writes. */
export function milestoneChangeTimelineEvents(
  prevMilestone: any,
  nextMilestone: any,
  actor: { login?: string; avatarUrl?: string } = {}
): any[] {
  const prevTitle = prevMilestone?.title
    ? String(prevMilestone.title)
    : prevMilestone?.number != null
      ? String(prevMilestone.number)
      : '';
  const nextTitle = nextMilestone?.title
    ? String(nextMilestone.title)
    : nextMilestone?.number != null
      ? String(nextMilestone.number)
      : '';
  const prevKey = prevMilestone
    ? `${prevMilestone.number ?? ''}:${prevTitle}`.toLowerCase()
    : '';
  const nextKey = nextMilestone
    ? `${nextMilestone.number ?? ''}:${nextTitle}`.toLowerCase()
    : '';
  if (prevKey === nextKey) return [];
  const out: any[] = [];
  const actorLogin = actor.login || '';
  const avatarUrl = actor.avatarUrl || '';
  if (prevMilestone && prevKey) {
    out.push(
      makeLocalTimelineEvent({
        event: 'demilestoned',
        actor: actorLogin,
        avatarUrl,
        milestone: {
          number:
            prevMilestone.number != null ? Number(prevMilestone.number) : null,
          title: prevTitle,
        },
      })
    );
  }
  if (nextMilestone && nextKey) {
    out.push(
      makeLocalTimelineEvent({
        event: 'milestoned',
        actor: actorLogin,
        avatarUrl,
        milestone: {
          number:
            nextMilestone.number != null ? Number(nextMilestone.number) : null,
          title: nextTitle,
        },
      })
    );
  }
  return out;
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
      reactions: Array.isArray(r.reactions) ? r.reactions : [],
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
      nodeId: c.nodeId || c.node_id || null,
      reactions: Array.isArray(c.reactions) ? c.reactions : [],
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

// ---------------------------------------------------------------------------
// Timeline category tips (global filter prefs)
// ---------------------------------------------------------------------------

/** Selectable tip categories (not including synthetic "all"). */
export const TIMELINE_CATEGORY_IDS = [
  'labels',
  'title',
  'milestone',
  'referenced',
  'comments',
] as const;

export type TimelineCategoryId = (typeof TIMELINE_CATEGORY_IDS)[number];

/** Tip row order: All first, then categories. */
export const TIMELINE_TIP_IDS = ['all', ...TIMELINE_CATEGORY_IDS] as const;

export type TimelineTipId = (typeof TIMELINE_TIP_IDS)[number];

/** Human labels for tips (conversation row + plugin settings) — short chips. */
export const TIMELINE_TIP_LABELS: Record<TimelineTipId, string> = {
  all: 'All',
  labels: 'label',
  title: 'title',
  milestone: 'milestone',
  referenced: 'referenced',
  comments: 'comments',
};

/** Default: every category visible. */
export const DEFAULT_TIMELINE_VISIBILITY: Record<TimelineCategoryId, boolean> = {
  labels: true,
  title: true,
  milestone: true,
  referenced: true,
  comments: true,
};

/**
 * Normalize prefs.timelineVisibility map. Missing keys default to visible.
 * @param {unknown} raw
 * @returns {Record<TimelineCategoryId, boolean>}
 */
export function normalizeTimelineVisibility(
  raw: unknown
): Record<TimelineCategoryId, boolean> {
  const src =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const out = { ...DEFAULT_TIMELINE_VISIBILITY };
  for (const id of TIMELINE_CATEGORY_IDS) {
    if (typeof src[id] === 'boolean') out[id] = src[id] as boolean;
  }
  // Explicit "all: true" forces every category on
  if (src.all === true) {
    for (const id of TIMELINE_CATEGORY_IDS) out[id] = true;
  }
  return out;
}

/** True when every category tip is on (All chip selected state). */
export function isTimelineVisibilityAllOn(
  vis: Record<string, boolean> | null | undefined
): boolean {
  const v = normalizeTimelineVisibility(vis);
  return TIMELINE_CATEGORY_IDS.every((id) => v[id] !== false);
}

/**
 * Toggle a tip and return the next visibility map.
 * - "all" → all categories true
 * - category → flip that category
 */
export function toggleTimelineTip(
  vis: unknown,
  tipId: string
): Record<TimelineCategoryId, boolean> {
  const cur = normalizeTimelineVisibility(vis);
  const id = String(tipId || '').trim().toLowerCase();
  if (id === 'all') {
    return { ...DEFAULT_TIMELINE_VISIBILITY };
  }
  if ((TIMELINE_CATEGORY_IDS as readonly string[]).includes(id)) {
    const key = id as TimelineCategoryId;
    return { ...cur, [key]: !cur[key] };
  }
  return cur;
}

/**
 * Map a built timeline item (or raw issue event) to a tip category, or null
 * when the row is always shown (description chrome, other system events).
 *
 * @param {object} item timeline item from buildConversationTimeline or raw event
 * @returns {TimelineCategoryId|null}
 */
export function timelineItemCategory(item: any): TimelineCategoryId | null {
  if (!item || typeof item !== 'object') return null;
  const kind = String(item.kind || '');
  if (
    kind === 'issue-comment' ||
    kind === 'review-thread' ||
    kind === 'review-comment' ||
    kind === 'review-group' ||
    kind === 'review'
  ) {
    return 'comments';
  }
  // timeline-event or raw REST event
  const event = String(item.event || '').trim().toLowerCase();
  if (event === 'labeled' || event === 'unlabeled') return 'labels';
  if (event === 'renamed') return 'title';
  if (event === 'milestoned' || event === 'demilestoned') return 'milestone';
  // "referenced this pull request from commit" + related cross-repo mentions
  if (
    event === 'referenced' ||
    event === 'cross-referenced' ||
    event === 'connected' ||
    event === 'disconnected'
  ) {
    return 'referenced';
  }
  return null;
}

/**
 * Filter timeline items by visibility map. Items with no category (other
 * system events) always pass through.
 *
 * @param {any[]} items
 * @param {unknown} visibility
 * @returns {any[]}
 */
export function filterTimelineItemsByVisibility(
  items: any,
  visibility: unknown
): any[] {
  const list = Array.isArray(items) ? items : [];
  const vis = normalizeTimelineVisibility(visibility);
  return list.filter((item) => {
    const cat = timelineItemCategory(item);
    if (!cat) return true;
    return vis[cat] !== false;
  });
}

/**
 * Whether REST issue **system** timeline events should be fetched.
 * False only when labels + title + milestone + referenced are all off
 * (comments tip is independent — issue comments / review threads use other
 * endpoints).
 */
export function shouldFetchSystemTimelineEvents(visibility: unknown): boolean {
  const vis = normalizeTimelineVisibility(visibility);
  return (
    vis.labels !== false ||
    vis.title !== false ||
    vis.milestone !== false ||
    vis.referenced !== false
  );
}

/**
 * Whether re-enabling tips requires a lazy events fetch (system tips newly on
 * and no usable events payload yet).
 */
export function needsLazyTimelineEventsFetch(
  prevVisibility: unknown,
  nextVisibility: unknown,
  timelineEvents: any
): boolean {
  if (!shouldFetchSystemTimelineEvents(nextVisibility)) return false;
  if (shouldFetchSystemTimelineEvents(prevVisibility)) {
    // Already wanted system events — only refetch if we never got any and
    // a tip that was off is now on (partial skip may have left empty).
    const prev = normalizeTimelineVisibility(prevVisibility);
    const next = normalizeTimelineVisibility(nextVisibility);
    const newlyOn = TIMELINE_CATEGORY_IDS.some(
      (id) => id !== 'comments' && prev[id] === false && next[id] !== false
    );
    if (!newlyOn) return false;
  }
  const te = Array.isArray(timelineEvents) ? timelineEvents : [];
  // Empty or missing — need fetch. If we already have events, filter-only.
  return te.length === 0;
}

/**
 * Host tip-toggle plan: **capture prev before writing next**, then decide lazy
 * REST events fetch. Callers must not read prev from prefs after optimistic write
 * (that clobbers prev===next and skips fetch).
 *
 * @param {unknown} prevVisibility current prefs.timelineVisibility
 * @param {unknown} nextVisibility tip-toggle result
 * @param {any} timelineEvents current detail.timelineEvents
 * @returns {{ nextVisibility: Record<TimelineCategoryId, boolean>, shouldLazyFetch: boolean, prevVisibility: Record<TimelineCategoryId, boolean> }}
 */
export function planTimelineVisibilityChange(
  prevVisibility: unknown,
  nextVisibility: unknown,
  timelineEvents: any = null
): {
  prevVisibility: Record<TimelineCategoryId, boolean>;
  nextVisibility: Record<TimelineCategoryId, boolean>;
  shouldLazyFetch: boolean;
} {
  const prev = normalizeTimelineVisibility(prevVisibility);
  const next = normalizeTimelineVisibility(nextVisibility);
  return {
    prevVisibility: prev,
    nextVisibility: next,
    shouldLazyFetch: needsLazyTimelineEventsFetch(prev, next, timelineEvents),
  };
}
