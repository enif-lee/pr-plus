import {
  buildConversationTimeline,
} from './conversation-timeline-build';

/** Split from conversation-timeline.ts: conversation-timeline-filter */
/** @module modal/lib/conversation-timeline */
/**
 * Conversation timeline tip filters (client-only).
 * Four categories: events | participants | comments | review-threads.
 * Network pages stay unfiltered so cursors remain stable.
 */

export const TIMELINE_CATEGORY_IDS = [
  'events',
  'participants',
  'comments',
  'review-threads',
] as const;

export type TimelineCategoryId = (typeof TIMELINE_CATEGORY_IDS)[number];

/** Tip row order: All first, then categories. */
export const TIMELINE_TIP_IDS = ['all', ...TIMELINE_CATEGORY_IDS] as const;

export type TimelineTipId = (typeof TIMELINE_TIP_IDS)[number];

/** Human labels for tips (conversation row + plugin settings) — short chips. */
export const TIMELINE_TIP_LABELS: Record<TimelineTipId, string> = {
  all: 'All',
  events: 'events',
  participants: 'participants',
  comments: 'comments',
  'review-threads': 'threads',
};

/** Default: every category visible. */
export const DEFAULT_TIMELINE_VISIBILITY: Record<TimelineCategoryId, boolean> = {
  events: true,
  participants: true,
  comments: true,
  'review-threads': true,
};

/** Legacy tip keys (pre 4-category model). */
const LEGACY_EVENT_KEYS = [
  'labels',
  'title',
  'milestone',
  'referenced',
] as const;
const LEGACY_PARTICIPANT_KEYS = ['assignees', 'reviewers'] as const;

/**
 * Normalize prefs.timelineVisibility map. Missing keys default to visible.
 * Migrates legacy 7-key maps into the 4-category model.
 */
export function normalizeTimelineVisibility(
  raw: unknown
): Record<TimelineCategoryId, boolean> {
  const src =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const out = { ...DEFAULT_TIMELINE_VISIBILITY };

  // New keys take precedence when present.
  for (const id of TIMELINE_CATEGORY_IDS) {
    if (typeof src[id] === 'boolean') out[id] = src[id] as boolean;
  }

  // Legacy migration when new keys absent.
  const hasNewKey = TIMELINE_CATEGORY_IDS.some((id) => typeof src[id] === 'boolean');
  if (!hasNewKey) {
    const anyLegacy = [...LEGACY_EVENT_KEYS, ...LEGACY_PARTICIPANT_KEYS, 'comments'].some(
      (k) => typeof src[k] === 'boolean'
    );
    if (anyLegacy) {
      out.events = LEGACY_EVENT_KEYS.some((k) => src[k] !== false);
      out.participants = LEGACY_PARTICIPANT_KEYS.some((k) => src[k] !== false);
      if (typeof src.comments === 'boolean') out.comments = src.comments;
      // Review threads were folded into "comments" tip previously — keep on.
      out['review-threads'] = true;
    }
  }

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
 * - "all" → if every category is on, turn all off; otherwise turn all on
 * - category → flip that category
 */
export function toggleTimelineTip(
  vis: unknown,
  tipId: string
): Record<TimelineCategoryId, boolean> {
  const cur = normalizeTimelineVisibility(vis);
  const id = String(tipId || '').trim().toLowerCase();
  if (id === 'all') {
    if (isTimelineVisibilityAllOn(cur)) {
      const off = { ...cur };
      for (const key of TIMELINE_CATEGORY_IDS) off[key] = false;
      return off;
    }
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
 */
export function timelineItemCategory(item: any): TimelineCategoryId | null {
  if (!item || typeof item !== 'object') return null;
  const kind = String(item.kind || '');

  if (kind === 'issue-comment') return 'comments';
  if (kind === 'review-thread' || kind === 'review-comment') {
    return 'review-threads';
  }
  // Review body / multi-file group — comments tip (not file-thread fold).
  if (kind === 'review-group' || kind === 'review') return 'comments';

  // Explicit category from GraphQL mapper (preferred).
  const cat = String(item.category || '').trim().toLowerCase();
  if ((TIMELINE_CATEGORY_IDS as readonly string[]).includes(cat)) {
    return cat as TimelineCategoryId;
  }

  // timeline-event or raw REST event
  const event = String(item.event || '').trim().toLowerCase();
  if (
    event === 'assigned' ||
    event === 'unassigned' ||
    event === 'review_requested' ||
    event === 'review_request_removed'
  ) {
    return 'participants';
  }
  if (
    event === 'labeled' ||
    event === 'unlabeled' ||
    event === 'renamed' ||
    event === 'milestoned' ||
    event === 'demilestoned' ||
    event === 'referenced' ||
    event === 'cross-referenced' ||
    event === 'connected' ||
    event === 'disconnected' ||
    event === 'closed' ||
    event === 'reopened' ||
    event === 'merged' ||
    event === 'convert_to_draft' ||
    event === 'ready_for_review' ||
    event === 'head_ref_force_pushed' ||
    event === 'base_ref_changed' ||
    event === 'locked' ||
    event === 'unlocked' ||
    event === 'added_to_project' ||
    event === 'removed_from_project' ||
    event === 'moved_columns_in_project' ||
    event === 'project_v2_item_status_changed'
  ) {
    return 'events';
  }
  // timeline-event without recognized event still treated as events when kind set
  if (kind === 'timeline-event' || kind === 'system-event') return 'events';
  return null;
}

/**
 * Filter timeline items by visibility map. Items with no category always pass.
 * Client-only — never drives GraphQL itemTypes.
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
 * Whether system timeline *events* are visible (events or participants tip on).
 * Used only for lazy client display decisions — product GraphQL pages stay
 * unfiltered. Always true when either tip is on.
 */
export function shouldFetchSystemTimelineEvents(visibility: unknown): boolean {
  const vis = normalizeTimelineVisibility(visibility);
  return vis.events !== false || vis.participants !== false;
}

/**
 * Whether re-enabling tips requires a lazy events fetch.
 * With GraphQL-first unfiltered pages, usually false once any page landed.
 */
export function needsLazyTimelineEventsFetch(
  prevVisibility: unknown,
  nextVisibility: unknown,
  timelineEvents: any
): boolean {
  if (!shouldFetchSystemTimelineEvents(nextVisibility)) return false;
  if (shouldFetchSystemTimelineEvents(prevVisibility)) {
    const prev = normalizeTimelineVisibility(prevVisibility);
    const next = normalizeTimelineVisibility(nextVisibility);
    const newlyOn =
      (prev.events === false && next.events !== false) ||
      (prev.participants === false && next.participants !== false);
    if (!newlyOn) return false;
  }
  const te = Array.isArray(timelineEvents) ? timelineEvents : [];
  return te.length === 0;
}

/**
 * Host tip-toggle plan: capture prev before writing next, then decide lazy fetch.
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
 * Whether ConversationView should take host/storage timelineVisibility props
 * into local optimistic state.
 */
export function shouldAcceptTimelineVisibilityFromHost(opts: {
  incoming: unknown;
  lastEmitted: unknown;
  pendingEmit?: boolean;
  nowMs?: number;
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
    return { accept: false, clearPending: false };
  }
  return { accept: true, clearPending: true };
}

// Keep import used for side-effect type coupling in barrel consumers.
void buildConversationTimeline;
