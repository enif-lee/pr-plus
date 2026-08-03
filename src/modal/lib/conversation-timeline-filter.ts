import {
  buildConversationTimeline,
} from './conversation-timeline-build';

/** Split from conversation-timeline.ts: conversation-timeline-filter */
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
export const TIMELINE_CATEGORY_IDS = [
  'labels',
  'title',
  'milestone',
  'assignees',
  'reviewers',
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
  assignees: 'assignee',
  reviewers: 'reviewer',
  referenced: 'referenced',
  comments: 'comments',
};

/** Default: every category visible. */
export const DEFAULT_TIMELINE_VISIBILITY: Record<TimelineCategoryId, boolean> = {
  labels: true,
  title: true,
  milestone: true,
  assignees: true,
  reviewers: true,
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
  if (event === 'assigned' || event === 'unassigned') return 'assignees';
  if (
    event === 'review_requested' ||
    event === 'review_request_removed'
  ) {
    return 'reviewers';
  }
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
 * False only when all system tips are off (labels/title/milestone/assignees/
 * reviewers/referenced). Comments tip is independent — issue comments /
 * review threads use other endpoints.
 */
export function shouldFetchSystemTimelineEvents(visibility: unknown): boolean {
  const vis = normalizeTimelineVisibility(visibility);
  return (
    vis.labels !== false ||
    vis.title !== false ||
    vis.milestone !== false ||
    vis.assignees !== false ||
    vis.reviewers !== false ||
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

/**
 * Whether ConversationView should take host/storage `timelineVisibility` props
 * into local optimistic state.
 *
 * After a tip click we keep an optimistic lock until `ignoreHostUntilMs`.
 * Non-matching host/storage updates in that window are ignored so a lagging
 * prefs write (or watch echo of a prior map) cannot clobber the chip the user
 * just flipped — even after an intermediate host match cleared `pendingEmit`.
 */
export function shouldAcceptTimelineVisibilityFromHost(opts: {
  incoming: unknown;
  lastEmitted: unknown;
  /** @deprecated kept for call-site compat; lock is driven by ignoreHostUntilMs */
  pendingEmit?: boolean;
  /** Epoch ms — defaults to Date.now() when omitted. */
  nowMs?: number;
  /** Ignore non-matching host props until this epoch ms (optimistic lock TTL). */
  ignoreHostUntilMs?: number;
}): { accept: boolean; clearPending: boolean } {
  const incoming = normalizeTimelineVisibility(opts.incoming);
  const lastEmitted = normalizeTimelineVisibility(opts.lastEmitted);
  const incomingJson = JSON.stringify(incoming);
  const emittedJson = JSON.stringify(lastEmitted);
  if (incomingJson === emittedJson) {
    return { accept: true, clearPending: true };
  }
  const now = Number(opts.nowMs ?? Date.now());
  const until = Number(opts.ignoreHostUntilMs || 0);
  if (until > 0 && now < until) {
    // Still inside tip-click optimistic lock — drop lagging host maps.
    return { accept: false, clearPending: false };
  }
  // Lock idle or expired — accept external host truth (popup / other tab).
  return { accept: true, clearPending: true };
}
