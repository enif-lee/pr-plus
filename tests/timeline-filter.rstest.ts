/**
 * Timeline category tips — filter + prefs normalize + lazy-fetch helpers.
 * Drives shipped conversation-timeline pure exports.
 */
import { describe, expect, test } from '@rstest/core';
import {
  buildConversationTimeline,
  filterTimelineItemsByVisibility,
  normalizeTimelineVisibility,
  timelineItemCategory,
  toggleTimelineTip,
  isTimelineVisibilityAllOn,
  shouldFetchSystemTimelineEvents,
  needsLazyTimelineEventsFetch,
  planTimelineVisibilityChange,
  shouldAcceptTimelineVisibilityFromHost,
  mergeTimelineEventsById,
  DEFAULT_TIMELINE_VISIBILITY,
  TIMELINE_TIP_LABELS,
  TIMELINE_CATEGORY_IDS,
} from '../src/modal/lib/conversation-timeline.ts';
import { buildConversationVirtualRows } from '../src/modal/lib/conversation-virtual.ts';

function mixedDetail() {
  return {
    viewerLogin: 'alice',
    comments: [
      {
        id: 101,
        author: 'bob',
        body: 'issue comment',
        createdAt: '2026-01-02T10:00:00Z',
      },
    ],
    reviewComments: [
      {
        id: 201,
        author: 'carol',
        body: 'thread root',
        path: 'a.ts',
        line: 1,
        createdAt: '2026-01-02T11:00:00Z',
        threadNodeId: 'PRRT_A',
      },
    ],
    reviews: [],
    files: [],
    timelineEvents: [
      {
        id: 1,
        event: 'labeled',
        actor: 'alice',
        at: '2026-01-01T09:00:00Z',
        label: { name: 'bug', color: 'd73a4a' },
      },
      {
        id: 2,
        event: 'unlabeled',
        actor: 'alice',
        at: '2026-01-01T09:05:00Z',
        label: { name: 'wip', color: 'ccc' },
      },
      {
        id: 3,
        event: 'renamed',
        actor: 'alice',
        at: '2026-01-01T10:00:00Z',
        rename: { from: 'Old', to: 'New' },
      },
      {
        id: 4,
        event: 'milestoned',
        actor: 'alice',
        at: '2026-01-01T11:00:00Z',
        milestone: { title: 'v1', number: 1 },
      },
      {
        id: 5,
        event: 'demilestoned',
        actor: 'alice',
        at: '2026-01-01T11:30:00Z',
        milestone: { title: 'v1', number: 1 },
      },
      {
        id: 6,
        event: 'closed',
        actor: 'alice',
        at: '2026-01-01T12:00:00Z',
      },
      {
        id: 7,
        event: 'referenced',
        actor: 'alice',
        at: '2026-01-01T12:30:00Z',
        commitId: 'abc1234deadbeef',
      },
      {
        id: 8,
        event: 'cross-referenced',
        actor: 'bob',
        at: '2026-01-01T12:45:00Z',
      },
      {
        id: 9,
        event: 'assigned',
        actor: 'alice',
        at: '2026-01-01T13:00:00Z',
        assignee: 'carol',
      },
      {
        id: 10,
        event: 'unassigned',
        actor: 'alice',
        at: '2026-01-01T13:05:00Z',
        assignee: 'dave',
      },
      {
        id: 11,
        event: 'review_requested',
        actor: 'alice',
        at: '2026-01-01T13:10:00Z',
        requestedReviewer: 'erin',
      },
      {
        id: 12,
        event: 'review_request_removed',
        actor: 'alice',
        at: '2026-01-01T13:15:00Z',
        requestedReviewer: 'frank',
      },
    ],
  };
}

describe('timelineItemCategory + filterTimelineItemsByVisibility', () => {
  test('categorizes mixed built timeline into 4 tips', () => {
    const items = buildConversationTimeline(mixedDetail());
    const cats = items.map((i) => timelineItemCategory(i));
    expect(cats).toContain('events');
    expect(cats).toContain('participants');
    expect(cats).toContain('comments');
    // closed maps to events under 4-category model
    const closed = items.find((i) => i.event === 'closed');
    expect(timelineItemCategory(closed)).toBe('events');
  });

  test('short tip labels for 4 categories', () => {
    expect(TIMELINE_TIP_LABELS.events).toBe('events');
    expect(TIMELINE_TIP_LABELS.participants).toBe('participants');
    expect(TIMELINE_TIP_LABELS.comments).toBe('comments');
    expect(TIMELINE_TIP_LABELS['review-threads']).toBe('threads');
    expect([...TIMELINE_CATEGORY_IDS]).toEqual([
      'events',
      'participants',
      'comments',
      'review-threads',
    ]);
  });

  test('referenced / labeled map to events; assignees / reviewers to participants', () => {
    expect(
      timelineItemCategory({ kind: 'timeline-event', event: 'referenced' })
    ).toBe('events');
    expect(
      timelineItemCategory({
        kind: 'timeline-event',
        event: 'cross-referenced',
      })
    ).toBe('events');
    expect(
      timelineItemCategory({ kind: 'timeline-event', event: 'labeled' })
    ).toBe('events');
    expect(
      timelineItemCategory({ kind: 'timeline-event', event: 'assigned' })
    ).toBe('participants');
    expect(
      timelineItemCategory({
        kind: 'timeline-event',
        event: 'review_requested',
      })
    ).toBe('participants');
  });

  test('hiding each category removes only that kind', () => {
    const items = buildConversationTimeline(mixedDetail());
    const total = items.length;

    for (const cat of TIMELINE_CATEGORY_IDS) {
      const vis = { ...DEFAULT_TIMELINE_VISIBILITY, [cat]: false };
      const filtered = filterTimelineItemsByVisibility(items, vis);
      // review-threads may be empty in mixedDetail (no standalone threads after grouping)
      if (items.some((i) => timelineItemCategory(i) === cat)) {
        expect(filtered.length).toBeLessThan(total);
      }
      expect(filtered.every((i) => timelineItemCategory(i) !== cat)).toBe(true);
    }
  });

  test('all-on shows full set', () => {
    const items = buildConversationTimeline(mixedDetail());
    const filtered = filterTimelineItemsByVisibility(
      items,
      DEFAULT_TIMELINE_VISIBILITY
    );
    expect(filtered.map((i) => i.key)).toEqual(items.map((i) => i.key));
    expect(isTimelineVisibilityAllOn(DEFAULT_TIMELINE_VISIBILITY)).toBe(true);
  });

  test('toggle all turns every category on when any is off', () => {
    const on = toggleTimelineTip(
      {
        events: false,
        participants: false,
        comments: true,
        'review-threads': false,
      },
      'all'
    );
    expect(isTimelineVisibilityAllOn(on)).toBe(true);
    expect(on.events).toBe(true);
    expect(on.participants).toBe(true);
    expect(on['review-threads']).toBe(true);
  });

  test('toggle all turns every category off when all already on', () => {
    const off = toggleTimelineTip(DEFAULT_TIMELINE_VISIBILITY, 'all');
    expect(isTimelineVisibilityAllOn(off)).toBe(false);
    for (const id of TIMELINE_CATEGORY_IDS) {
      expect(off[id]).toBe(false);
    }
    // second click restores all
    const on = toggleTimelineTip(off, 'all');
    expect(isTimelineVisibilityAllOn(on)).toBe(true);
  });

  test('toggle category flips one key', () => {
    const next = toggleTimelineTip(DEFAULT_TIMELINE_VISIBILITY, 'events');
    expect(next.events).toBe(false);
    expect(next.comments).toBe(true);
    expect(isTimelineVisibilityAllOn(next)).toBe(false);
  });

  test('comments tip hide then re-enable restores comment items', () => {
    const items = buildConversationTimeline(mixedDetail());
    const hidden = toggleTimelineTip(DEFAULT_TIMELINE_VISIBILITY, 'comments');
    expect(hidden.comments).toBe(false);
    const afterHide = filterTimelineItemsByVisibility(items, hidden);
    expect(afterHide.some((i) => timelineItemCategory(i) === 'comments')).toBe(
      false
    );
    const shown = toggleTimelineTip(hidden, 'comments');
    expect(shown.comments).toBe(true);
    const afterShow = filterTimelineItemsByVisibility(items, shown);
    expect(afterShow.some((i) => timelineItemCategory(i) === 'comments')).toBe(
      true
    );
    expect(afterShow.length).toBe(items.length);
  });
});

describe('shouldAcceptTimelineVisibilityFromHost', () => {
  test('accepts host when lock idle (no until)', () => {
    expect(
      shouldAcceptTimelineVisibilityFromHost({
        incoming: { comments: false },
        lastEmitted: DEFAULT_TIMELINE_VISIBILITY,
        nowMs: 1_000,
        ignoreHostUntilMs: 0,
      })
    ).toEqual({ accept: true, clearPending: true });
  });

  test('rejects lagging hide inside optimistic lock even after pending cleared', () => {
    const reEnabled = toggleTimelineTip(
      { ...DEFAULT_TIMELINE_VISIBILITY, comments: false },
      'comments'
    );
    expect(reEnabled.comments).toBe(true);
    // Storage still delivering the previous hide write inside TTL window
    expect(
      shouldAcceptTimelineVisibilityFromHost({
        incoming: { ...DEFAULT_TIMELINE_VISIBILITY, comments: false },
        lastEmitted: reEnabled,
        pendingEmit: false,
        nowMs: 1_000,
        ignoreHostUntilMs: 3_000,
      })
    ).toEqual({ accept: false, clearPending: false });
  });

  test('accepts host when it matches last emit (clears pending)', () => {
    const reEnabled = { ...DEFAULT_TIMELINE_VISIBILITY, comments: true };
    expect(
      shouldAcceptTimelineVisibilityFromHost({
        incoming: reEnabled,
        lastEmitted: reEnabled,
        nowMs: 1_000,
        ignoreHostUntilMs: 3_000,
      })
    ).toEqual({ accept: true, clearPending: true });
  });

  test('TTL expiry allows external host after abandoned optimistic lock', () => {
    expect(
      shouldAcceptTimelineVisibilityFromHost({
        incoming: { ...DEFAULT_TIMELINE_VISIBILITY, comments: false },
        lastEmitted: DEFAULT_TIMELINE_VISIBILITY,
        pendingEmit: true,
        nowMs: 5_000,
        ignoreHostUntilMs: 2_000,
      })
    ).toEqual({ accept: true, clearPending: true });
  });
});

describe('tips placement between merge and timeline', () => {
  test('reverseComments: merge then tips then items', () => {
    const rows = buildConversationVirtualRows(
      {
        items: [{ id: 'e1', kind: 'timeline-event', event: 'labeled' }],
        bottomItems: [],
        hiddenCount: 0,
      },
      { reverseComments: true }
    );
    const types = rows.map((r) => r.type);
    const mergeI = types.indexOf('merge');
    const tipsI = types.indexOf('timeline-tips');
    const itemI = types.indexOf('item');
    expect(mergeI).toBeGreaterThanOrEqual(0);
    expect(tipsI).toBe(mergeI + 1);
    expect(itemI).toBeGreaterThan(tipsI);
  });

  test('classic order: items then tips then merge', () => {
    const rows = buildConversationVirtualRows(
      {
        items: [{ id: 'e1', kind: 'timeline-event', event: 'labeled' }],
        bottomItems: [],
        hiddenCount: 0,
      },
      { reverseComments: false }
    );
    const types = rows.map((r) => r.type);
    const itemI = types.indexOf('item');
    const tipsI = types.indexOf('timeline-tips');
    const mergeI = types.indexOf('merge');
    expect(itemI).toBeGreaterThanOrEqual(0);
    expect(tipsI).toBeGreaterThan(itemI);
    expect(mergeI).toBe(tipsI + 1);
  });
});

describe('partial fetch + lazy merge helpers', () => {
  test('shouldFetchSystemTimelineEvents false only when events+participants off', () => {
    expect(
      shouldFetchSystemTimelineEvents({
        events: false,
        participants: false,
        comments: true,
        'review-threads': true,
      })
    ).toBe(false);
    expect(
      shouldFetchSystemTimelineEvents({
        events: true,
        participants: false,
        comments: false,
        'review-threads': false,
      })
    ).toBe(true);
    expect(
      shouldFetchSystemTimelineEvents({
        events: false,
        participants: true,
        comments: false,
        'review-threads': false,
      })
    ).toBe(true);
  });

  test('needsLazyTimelineEventsFetch when tip re-enabled and events empty', () => {
    const prev = {
      events: false,
      participants: false,
      comments: true,
      'review-threads': true,
    };
    const next = { ...prev, events: true };
    expect(needsLazyTimelineEventsFetch(prev, next, [])).toBe(true);
    expect(
      needsLazyTimelineEventsFetch(prev, next, [
        { id: 1, event: 'labeled', at: '2026-01-01' },
      ])
    ).toBe(false);
  });

  test('planTimelineVisibilityChange captures prev before write (shipped host order)', () => {
    let prefsVis = {
      events: false,
      participants: false,
      comments: true,
      'review-threads': true,
    };
    const timelineEvents: any[] = [];
    const nextRaw = toggleTimelineTip(prefsVis, 'events');
    expect(nextRaw.events).toBe(true);

    const plan = planTimelineVisibilityChange(
      prefsVis,
      nextRaw,
      timelineEvents
    );
    expect(plan.shouldLazyFetch).toBe(true);
    expect(plan.prevVisibility.events).toBe(false);
    expect(plan.nextVisibility.events).toBe(true);

    prefsVis = plan.nextVisibility;
    const clobbered = needsLazyTimelineEventsFetch(
      prefsVis,
      plan.nextVisibility,
      timelineEvents
    );
    expect(clobbered).toBe(false);

    let fetchInvoked = false;
    if (plan.shouldLazyFetch) {
      fetchInvoked = true;
    }
    expect(fetchInvoked).toBe(true);
  });

  test('host tip path: optimistic write + fetch uses plan prev (integration-style)', async () => {
    const fetchCalls: any[] = [];
    const fetchPrTimelineEvents = async (...args: any[]) => {
      fetchCalls.push(args);
      return [
        {
          id: 42,
          event: 'labeled',
          actor: 'alice',
          at: '2026-06-01T00:00:00Z',
          label: { name: 'bug', color: 'd73a4a' },
        },
      ];
    };

    let prefs = {
      timelineVisibility: {
        events: false,
        participants: false,
        comments: true,
        'review-threads': true,
      },
    };
    let detail = { timelineEvents: [] as any[], owner: 'o', repo: 'r', number: 7 };

    const prevVis = prefs.timelineVisibility;
    const nextVis = toggleTimelineTip(prevVis, 'events');
    const plan = planTimelineVisibilityChange(
      prevVis,
      nextVis,
      detail.timelineEvents
    );
    prefs = { ...prefs, timelineVisibility: plan.nextVisibility };
    if (plan.shouldLazyFetch) {
      const events = await fetchPrTimelineEvents('o', 'r', 7, {});
      detail = {
        ...detail,
        timelineEvents: mergeTimelineEventsById(
          detail.timelineEvents,
          events
        ),
      };
    }

    expect(fetchCalls.length).toBe(1);
    expect(detail.timelineEvents.some((e) => e.id === 42)).toBe(true);
    expect(prefs.timelineVisibility.events).toBe(true);
  });

  test('mergeTimelineEventsById keeps prior rows when new events arrive', () => {
    const prev = [
      { id: 'local:x', event: 'labeled', label: { name: 'bug' }, at: '2026-01-02' },
    ];
    const next = [
      { id: 9, event: 'renamed', rename: { from: 'a', to: 'b' }, at: '2026-01-03' },
    ];
    const merged = mergeTimelineEventsById(prev, next);
    expect(merged.some((e) => String(e.id) === '9')).toBe(true);
    expect(merged.some((e) => String(e.id).startsWith('local:'))).toBe(true);
  });
});

describe('timeline tip labels (shipped constants)', () => {
  test('labels match product copy', () => {
    expect(TIMELINE_TIP_LABELS.events).toBe('events');
    expect(TIMELINE_TIP_LABELS.comments).toBe('comments');
    expect(TIMELINE_TIP_LABELS.participants).toBe('participants');
    expect(TIMELINE_TIP_LABELS['review-threads']).toBe('threads');
  });
});
