/** Split from conversation-timeline.ts: conversation-timeline-events */
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
    case 'committed':
      return ev.commitId
        ? [t('added commit '), commit(shortSha(ev.commitId))]
        : [t('added a commit')];
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
    case 'head_ref_force_pushed':
      return [t('force-pushed the head branch')];
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

export function labelNameKey(l: any): string {
  const name = typeof l === 'string' ? l : l?.name;
  return String(name || '')
    .trim()
    .toLowerCase();
}

export function labelObj(l: any): { name: string; color: string; description?: string } | null {
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

export function loginKey(x: any): string {
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

