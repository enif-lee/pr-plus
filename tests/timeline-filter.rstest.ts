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
  test('categorizes mixed built timeline', () => {
    const items = buildConversationTimeline(mixedDetail());
    const cats = items.map((i) => timelineItemCategory(i));
    expect(cats).toContain('labels');
    expect(cats).toContain('title');
    expect(cats).toContain('milestone');
    expect(cats).toContain('assignees');
    expect(cats).toContain('reviewers');
    expect(cats).toContain('comments');
    expect(cats).toContain('referenced');
    // closed has no tip category — always shown
    const closed = items.find((i) => i.event === 'closed');
    expect(timelineItemCategory(closed)).toBe(null);
  });

  test('short tip labels include assignee/reviewer', () => {
    expect(TIMELINE_TIP_LABELS.labels).toBe('label');
    expect(TIMELINE_TIP_LABELS.title).toBe('title');
    expect(TIMELINE_TIP_LABELS.milestone).toBe('milestone');
    expect(TIMELINE_TIP_LABELS.assignees).toBe('assignee');
    expect(TIMELINE_TIP_LABELS.reviewers).toBe('reviewer');
    expect(TIMELINE_TIP_LABELS.referenced).toBe('referenced');
    expect(TIMELINE_TIP_LABELS.comments).toBe('comments');
    expect(TIMELINE_CATEGORY_IDS).toContain('referenced');
    expect(TIMELINE_CATEGORY_IDS).toContain('assignees');
    expect(TIMELINE_CATEGORY_IDS).toContain('reviewers');
  });

  test('referenced / cross-referenced map to referenced category', () => {
    expect(
      timelineItemCategory({ kind: 'timeline-event', event: 'referenced' })
    ).toBe('referenced');
    expect(
      timelineItemCategory({
        kind: 'timeline-event',
        event: 'cross-referenced',
      })
    ).toBe('referenced');
    expect(
      timelineItemCategory({ kind: 'timeline-event', event: 'connected' })
    ).toBe('referenced');
  });

  test('assigned / review_requested map to assignees / reviewers', () => {
    expect(
      timelineItemCategory({ kind: 'timeline-event', event: 'assigned' })
    ).toBe('assignees');
    expect(
      timelineItemCategory({ kind: 'timeline-event', event: 'unassigned' })
    ).toBe('assignees');
    expect(
      timelineItemCategory({
        kind: 'timeline-event',
        event: 'review_requested',
      })
    ).toBe('reviewers');
    expect(
      timelineItemCategory({
        kind: 'timeline-event',
        event: 'review_request_removed',
      })
    ).toBe('reviewers');
  });

  test('hiding each category removes only that kind', () => {
    const items = buildConversationTimeline(mixedDetail());
    const total = items.length;

    for (const cat of [
      'labels',
      'title',
      'milestone',
      'assignees',
      'reviewers',
      'referenced',
      'comments',
    ] as const) {
      const vis = { ...DEFAULT_TIMELINE_VISIBILITY, [cat]: false };
      const filtered = filterTimelineItemsByVisibility(items, vis);
      expect(filtered.length).toBeLessThan(total);
      expect(filtered.every((i) => timelineItemCategory(i) !== cat)).toBe(true);
      // Other tip categories still present when they exist in fixture
      if (cat !== 'labels') {
        expect(filtered.some((i) => timelineItemCategory(i) === 'labels')).toBe(
          true
        );
      }
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

  test('toggle all restores every category', () => {
    const off = toggleTimelineTip(
      {
        labels: false,
        title: false,
        milestone: true,
        assignees: false,
        reviewers: false,
        referenced: false,
        comments: true,
      },
      'all'
    );
    expect(isTimelineVisibilityAllOn(off)).toBe(true);
    expect(off.labels).toBe(true);
    expect(off.title).toBe(true);
    expect(off.assignees).toBe(true);
    expect(off.reviewers).toBe(true);
    expect(off.referenced).toBe(true);
  });

  test('toggle category flips one key', () => {
    const next = toggleTimelineTip(DEFAULT_TIMELINE_VISIBILITY, 'labels');
    expect(next.labels).toBe(false);
    expect(next.title).toBe(true);
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
  test('shouldFetchSystemTimelineEvents false only when all system tips off', () => {
    expect(
      shouldFetchSystemTimelineEvents({
        labels: false,
        title: false,
        milestone: false,
        assignees: false,
        reviewers: false,
        referenced: false,
        comments: true,
      })
    ).toBe(false);
    expect(
      shouldFetchSystemTimelineEvents({
        labels: false,
        title: false,
        milestone: false,
        assignees: false,
        reviewers: false,
        referenced: true,
        comments: false,
      })
    ).toBe(true);
    expect(
      shouldFetchSystemTimelineEvents({
        labels: true,
        title: false,
        milestone: false,
        comments: false,
      })
    ).toBe(true);
    // assignees alone still requires system events fetch
    expect(
      shouldFetchSystemTimelineEvents({
        labels: false,
        title: false,
        milestone: false,
        assignees: true,
        reviewers: false,
        referenced: false,
        comments: false,
      })
    ).toBe(true);
  });

  test('needsLazyTimelineEventsFetch when tip re-enabled and events empty', () => {
    const prev = {
      labels: false,
      title: false,
      milestone: false,
      assignees: false,
      reviewers: false,
      referenced: false,
      comments: true,
    };
    const next = { ...prev, labels: true };
    expect(needsLazyTimelineEventsFetch(prev, next, [])).toBe(true);
    expect(
      needsLazyTimelineEventsFetch(prev, next, [
        { id: 1, event: 'labeled', at: '2026-01-01' },
      ])
    ).toBe(false);
  });

  test('planTimelineVisibilityChange captures prev before write (shipped host order)', () => {
    // System tips all off → partial-fetch skip left events empty
    let prefsVis = {
      labels: false,
      title: false,
      milestone: false,
      comments: true,
    };
    const timelineEvents: any[] = [];
    // User re-enables labels via tip toggle
    const nextRaw = toggleTimelineTip(prefsVis, 'labels');
    expect(nextRaw.labels).toBe(true);

    // Correct host order: plan with prev BEFORE optimistic prefs write
    const plan = planTimelineVisibilityChange(
      prefsVis,
      nextRaw,
      timelineEvents
    );
    expect(plan.shouldLazyFetch).toBe(true);
    expect(plan.prevVisibility.labels).toBe(false);
    expect(plan.nextVisibility.labels).toBe(true);

    // Bug class: if host wrote prefs first, watch path sees prev===next
    prefsVis = plan.nextVisibility;
    const clobbered = needsLazyTimelineEventsFetch(
      prefsVis,
      plan.nextVisibility,
      timelineEvents
    );
    expect(clobbered).toBe(false);

    // Simulated host after plan: fetch must run when shouldLazyFetch
    let fetchInvoked = false;
    if (plan.shouldLazyFetch) {
      fetchInvoked = true;
    }
    expect(fetchInvoked).toBe(true);
  });

  test('host tip path: optimistic write + fetch uses plan prev (integration-style)', async () => {
    // Mirrors onTimelineVisibilityChange: prev capture → plan → write → maybe fetch
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
        labels: false,
        title: false,
        milestone: false,
        comments: true,
      },
    };
    let detail = { timelineEvents: [] as any[], owner: 'o', repo: 'r', number: 7 };

    // --- shipped order (planTimelineVisibilityChange) ---
    const prevVis = prefs.timelineVisibility;
    const nextVis = toggleTimelineTip(prevVis, 'labels');
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
    // Prior empty → merged rows present; re-enable did not wipe (no prior rows)
    expect(prefs.timelineVisibility.labels).toBe(true);
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
    expect(TIMELINE_TIP_LABELS.labels).toBe('label');
    expect(TIMELINE_TIP_LABELS.comments).toBe('comments');
    expect(TIMELINE_TIP_LABELS.referenced).toBe('referenced');
  });
});
