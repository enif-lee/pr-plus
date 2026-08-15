/**
 * GraphQL timeline redesign pure surface:
 * 4 tip categories, single-direction partition, since/watermark merge,
 * dirty-thread selection by comment count.
 */
import { describe, expect, test } from '@rstest/core';
import {
  TIMELINE_CATEGORY_IDS,
  TIMELINE_TIP_IDS,
  DEFAULT_TIMELINE_VISIBILITY,
  normalizeTimelineVisibility,
  timelineItemCategory,
  filterTimelineItemsByVisibility,
  shouldFetchSystemTimelineEvents,
  partitionTimelineWithThreadGap,
  mergeTimelineItemsById,
  maxTimelineWatermark,
  selectDirtyThreadIdsByCommentCount,
  isReviewThreadsLoadIncomplete,
  isTimelineLoadIncomplete,
  conversationLoadMoreState,
  partitionConversationLoadMore,
  singleCursorReviewThreadsMeta,
  emptyTimelinePageMeta,
  timelineMetaFromPageInfo,
  TIMELINE_PAGE_SIZE,
  buildConversationTimeline,
} from '../src/modal/lib/conversation-timeline.ts';
import {
  mapGraphqlTimelineNode,
  mapGraphqlTimelineNodes,
} from '../src/fetch/timeline-items.ts';

describe('4 tip categories', () => {
  test('category ids are exactly four + all tip', () => {
    expect([...TIMELINE_CATEGORY_IDS]).toEqual([
      'events',
      'participants',
      'comments',
      'review-threads',
    ]);
    expect([...TIMELINE_TIP_IDS]).toEqual([
      'all',
      'events',
      'participants',
      'comments',
      'review-threads',
    ]);
    expect(Object.keys(DEFAULT_TIMELINE_VISIBILITY).sort()).toEqual(
      [...TIMELINE_CATEGORY_IDS].sort()
    );
  });

  test('migrates legacy 7-key prefs into 4 categories', () => {
    const legacy = {
      labels: false,
      title: true,
      milestone: true,
      assignees: false,
      reviewers: true,
      referenced: false,
      comments: true,
    };
    const n = normalizeTimelineVisibility(legacy);
    expect(n.events).toBe(true); // title/milestone on
    expect(n.participants).toBe(true); // reviewers on
    expect(n.comments).toBe(true);
    expect(n['review-threads']).toBe(true);
  });

  test('timelineItemCategory maps kinds to 4 tips', () => {
    expect(timelineItemCategory({ kind: 'issue-comment' })).toBe('comments');
    expect(timelineItemCategory({ kind: 'review-thread' })).toBe(
      'review-threads'
    );
    expect(timelineItemCategory({ kind: 'review-group' })).toBe('comments');
    expect(
      timelineItemCategory({ kind: 'timeline-event', event: 'labeled' })
    ).toBe('events');
    expect(
      timelineItemCategory({ kind: 'timeline-event', event: 'assigned' })
    ).toBe('participants');
    expect(
      timelineItemCategory({ kind: 'timeline-event', event: 'review_requested' })
    ).toBe('participants');
  });

  test('filter is client-only (no server itemTypes dependency)', () => {
    const items = [
      { key: 'c1', kind: 'issue-comment', id: 1, at: '2026-01-02T00:00:00Z' },
      {
        key: 'e1',
        kind: 'timeline-event',
        event: 'labeled',
        at: '2026-01-01T00:00:00Z',
      },
      {
        key: 't1',
        kind: 'review-thread',
        id: 9,
        threadNodeId: 'PRRT_X',
        at: '2026-01-03T00:00:00Z',
      },
    ];
    const onlyComments = filterTimelineItemsByVisibility(items, {
      events: false,
      participants: false,
      comments: true,
      'review-threads': false,
    });
    expect(onlyComments.map((i) => i.key)).toEqual(['c1']);
    // Full unfiltered list always available for network — filter only shrinks display
    expect(items).toHaveLength(3);
  });

  test('shouldFetchSystemTimelineEvents follows events/participants tips', () => {
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
  });
});

describe('unified conversation load-more partition', () => {
  test('threads incomplete → end gap (no middle split)', () => {
    const items = [
      {
        key: 't-new',
        kind: 'review-thread',
        threadNodeId: 'PRRT_NEW',
        at: '2026-02-01T00:00:00Z',
      },
      {
        key: 't-old',
        kind: 'review-thread',
        threadNodeId: 'PRRT_OLD',
        at: '2026-01-01T00:00:00Z',
      },
    ];
    const part = partitionTimelineWithThreadGap(
      items,
      {
        hasMore: true,
        hiddenCount: 50,
        oldestThreadIds: ['PRRT_OLD'],
      },
      { hasMore: true, coverageEndAt: '2026-01-15T00:00:00Z' }
    );
    expect(part.showGap).toBe(true);
    expect(part.gapPlacement).toBe('end');
    expect(part.bottom).toEqual([]);
    expect(part.top).toHaveLength(2);
  });

  test('threads complete + timeline incomplete → middle gap at coverage floor', () => {
    const items = [
      {
        key: 'c-new',
        kind: 'issue-comment',
        id: 1,
        at: '2026-03-01T00:00:00Z',
      },
      {
        key: 't-mid',
        kind: 'review-thread',
        threadNodeId: 'PRRT_MID',
        at: '2026-02-01T00:00:00Z',
      },
      {
        key: 't-old',
        kind: 'review-thread',
        threadNodeId: 'PRRT_OLD',
        at: '2026-01-01T00:00:00Z',
      },
    ];
    const part = partitionTimelineWithThreadGap(
      items,
      { hasMore: false, hiddenCount: 0, loadedThreadCount: 2, totalCount: 2 },
      {
        hasMore: true,
        complete: false,
        coverageEndAt: '2026-02-01T00:00:00Z',
        loadedCount: 1,
        totalCount: 200,
      }
    );
    expect(part.showGap).toBe(true);
    expect(part.gapPlacement).toBe('middle');
    expect(part.top.map((x: any) => x.key)).toEqual(['c-new', 't-mid']);
    expect(part.bottom.map((x: any) => x.key)).toEqual(['t-old']);
  });

  test('singleCursorReviewThreadsMeta has no dual-window flags', () => {
    const meta = singleCursorReviewThreadsMeta({
      threads: [
        { threadNodeId: 'PRRT_A' },
        { threadNodeId: 'PRRT_B' },
      ],
      comments: [{ id: 1 }],
      totalCount: 150,
      hasPreviousPage: true,
      startCursor: 'cur-start',
      endCursor: 'cur-end',
      direction: 'newest',
      source: 'graphql',
    });
    expect(meta.hasMore).toBe(true);
    expect(meta.hasOlder).toBe(true);
    expect(meta.hasNewerFromOldest).toBe(false);
    expect(meta.oldestThreadIds).toEqual([]);
    expect(meta.newestThreadIds).toEqual(['PRRT_A', 'PRRT_B']);
    expect(TIMELINE_PAGE_SIZE).toBe(100);
  });

  test('timelineMetaFromPageInfo newest uses hasPreviousPage', () => {
    const m = timelineMetaFromPageInfo(
      {
        hasPreviousPage: true,
        hasNextPage: false,
        startCursor: 's',
        endCursor: 'e',
      },
      { direction: 'newest', loadedCount: 100, totalCount: 500 }
    );
    expect(m.hasMore).toBe(true);
    expect(m.complete).toBe(false);
    expect(emptyTimelinePageMeta().pageSize).toBe(100);
  });
});

describe('since/watermark + dirty threads', () => {
  test('maxTimelineWatermark picks latest ISO', () => {
    const w = maxTimelineWatermark([
      { at: '2026-01-01T00:00:00Z' },
      { createdAt: '2026-03-01T12:00:00Z' },
      { at: '2026-02-01T00:00:00Z' },
    ]);
    expect(w).toBe('2026-03-01T12:00:00Z');
  });

  test('mergeTimelineItemsById unions by id/key', () => {
    const prev = [
      { key: 'c-1', id: 1, kind: 'issue-comment', at: '2026-01-01T00:00:00Z' },
    ];
    const next = [
      {
        key: 'c-2',
        id: 2,
        kind: 'issue-comment',
        at: '2026-02-01T00:00:00Z',
      },
      {
        key: 'c-1',
        id: 1,
        kind: 'issue-comment',
        at: '2026-01-01T00:00:00Z',
        body: 'updated',
      },
    ];
    const m = mergeTimelineItemsById(prev, next);
    expect(m).toHaveLength(2);
    expect(m[0].id).toBe(2); // newest first
    expect(m.find((x) => x.id === 1)?.body).toBe('updated');
  });

  test('selectDirtyThreadIdsByCommentCount detects count/resolve changes', () => {
    const prev = [
      { threadNodeId: 'PRRT_A', commentCount: 1, resolved: false },
      { threadNodeId: 'PRRT_B', commentCount: 3, resolved: true },
      { threadNodeId: 'PRRT_C', commentCount: 2, commentsLoaded: true },
    ];
    const next = [
      { threadNodeId: 'PRRT_A', commentCount: 4, resolved: false }, // dirty count
      { threadNodeId: 'PRRT_B', commentCount: 3, resolved: false }, // dirty resolve
      { threadNodeId: 'PRRT_C', commentCount: 2, commentsLoaded: true }, // clean
      { threadNodeId: 'PRRT_D', commentCount: 1, commentsLoaded: false }, // new
    ];
    const dirty = selectDirtyThreadIdsByCommentCount(prev, next);
    expect(dirty.sort()).toEqual(['PRRT_A', 'PRRT_B', 'PRRT_D'].sort());
  });

  test('isReviewThreadsLoadIncomplete', () => {
    expect(isReviewThreadsLoadIncomplete({ hasMore: true })).toBe(true);
    expect(isReviewThreadsLoadIncomplete({ hasOlder: true })).toBe(true);
    expect(
      isReviewThreadsLoadIncomplete({
        hasMore: false,
        hasOlder: false,
        hiddenCount: 0,
        totalCount: 5,
        loadedThreadCount: 5,
      })
    ).toBe(false);
  });

  test('isTimelineLoadIncomplete + conversationLoadMoreState', () => {
    expect(isTimelineLoadIncomplete({ hasMore: true })).toBe(true);
    expect(isTimelineLoadIncomplete({ complete: false })).toBe(true);
    expect(isTimelineLoadIncomplete({ hasMore: false, complete: true })).toBe(
      false
    );
    // Explicit completion wins: totalCount includes mapped-out timeline nodes.
    expect(
      isTimelineLoadIncomplete({
        hasMore: false,
        complete: true,
        totalCount: 256,
        loadedCount: 99,
      })
    ).toBe(false);
    // Count fallback remains for legacy metadata with no completion bit.
    expect(
      isTimelineLoadIncomplete({
        hasMore: false,
        totalCount: 256,
        loadedCount: 99,
      })
    ).toBe(true);
    expect(
      isTimelineLoadIncomplete({
        hasMore: false,
        complete: true,
        totalCount: 50,
        loadedCount: 50,
      })
    ).toBe(false);
    const st = conversationLoadMoreState(
      { hasMore: false, hiddenCount: 0 },
      { hasMore: true, coverageEndAt: '2026-01-01T00:00:00Z' }
    );
    expect(st.preferMiddleGap).toBe(true);
    expect(st.anyIncomplete).toBe(true);
    // Exhausted connection must not retain a count-only Load all gap.
    const lag = conversationLoadMoreState(
      { hasMore: false, hiddenCount: 0 },
      { hasMore: false, complete: true, totalCount: 256, loadedCount: 99 }
    );
    expect(lag.anyIncomplete).toBe(false);
    expect(lag.timelineIncomplete).toBe(false);
    expect(
      partitionConversationLoadMore(
        [{ kind: 'issue-comment', id: 1, at: '2026-06-01T00:00:00Z' }],
        { hasMore: false },
        { hasMore: false, complete: true, totalCount: 256, loadedCount: 99 }
      ).showGap
    ).toBe(false);
    expect(
      partitionConversationLoadMore([], { hasMore: false }, { hasMore: false })
        .showGap
    ).toBe(false);
  });

  test('store-projected timelineMeta after threads apply drives middle gap', () => {
    // Real path: applyComments → applyThreadsFromMergedDetail → toAppDetail
    // (same as host applySide comments then applyThreadsToStore publish)
    const {
      fromAppDetail,
      toAppDetail,
      applyComments,
      applyThreadsFromMergedDetail,
    } = require('../src/modal/lib/detail-store.ts');
    const store = fromAppDetail({ owner: 'o', repo: 'r', number: 7, title: 'T' });
    applyComments(
      store,
      [{ id: 1, body: 'c', createdAt: '2026-03-01T00:00:00Z' }],
      {
        settled: true,
        trustEmpty: true,
        timelineMeta: {
          hasMore: true,
          complete: false,
          coverageEndAt: '2026-02-01T00:00:00Z',
          startCursor: 's',
          loadedCount: 1,
          totalCount: 500,
        },
      }
    );
    applyThreadsFromMergedDetail(store, {
      reviewThreads: [
        { threadNodeId: 'PRRT_A', at: '2026-03-01T00:00:00Z' },
        { threadNodeId: 'PRRT_B', at: '2026-01-01T00:00:00Z' },
      ],
      reviewComments: [],
      reviewThreadsMeta: {
        hasMore: false,
        hiddenCount: 0,
        loadedThreadCount: 2,
        totalCount: 2,
      },
    });
    const flat = toAppDetail(store);
    expect(flat.timelineMeta?.hasMore).toBe(true);
    expect(flat.reviewThreadsMeta?.hasMore).toBe(false);

    const items = [
      {
        key: 'c-new',
        kind: 'issue-comment',
        id: 1,
        at: '2026-03-01T00:00:00Z',
      },
      {
        key: 't-mid',
        kind: 'review-thread',
        threadNodeId: 'PRRT_A',
        at: '2026-02-01T00:00:00Z',
      },
      {
        key: 't-old',
        kind: 'review-thread',
        threadNodeId: 'PRRT_B',
        at: '2026-01-01T00:00:00Z',
      },
    ];
    const part = partitionConversationLoadMore(
      items,
      flat.reviewThreadsMeta,
      flat.timelineMeta
    );
    expect(part.gapPlacement).toBe('middle');
    expect(part.bottom.map((x: any) => x.key)).toEqual(['t-old']);
    const st = conversationLoadMoreState(
      flat.reviewThreadsMeta,
      flat.timelineMeta
    );
    expect(st.preferMiddleGap).toBe(true);
  });
});

describe('product wiring (shipped paths, not dual-window)', () => {
  test('open-modal cold path does not dual-seed oldest window', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const root = path.join(__dirname, '..');
    const open = fs.readFileSync(
      path.join(root, 'src/host/modules/open-modal-run.ts'),
      'utf8'
    );
    expect(open).toMatch(/single-direction newest shell only/);
    expect(open).toMatch(/skipped dual-seed/);
    // Must not fetch oldest seed on cold open
    expect(open).not.toMatch(
      /direction:\s*['"]oldest['"][\s\S]{0,80}skipEagerComments:\s*true/
    );
    // Dirty-by-count product path
    expect(open).toMatch(/selectDirtyThreadIdsByCommentCount/);
    expect(open).toMatch(/threads\.dirty-by-count/);
  });

  test('props-build full-threads drains threads-only (not full timelineItems)', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const root = path.join(__dirname, '..');
    const src = fs.readFileSync(
      path.join(root, 'src/host/modules/props-build.ts'),
      'utf8'
    );
    expect(src).toMatch(/no dual-window oldest seed/);
    expect(src).toMatch(/onLoadMoreReviewThreads\(['"]threads-all['"]\)/);
    // Unified handle pages timelineItems too
    expect(src).toMatch(/loadOneTimelinePage/);
    expect(src).toMatch(/fetchPrTimelineItemsPage/);
  });

  test('graphql cost log labels TimelineItemsPage', () => {
    const {
      labelGraphqlOperation,
    } = require('../src/modal/lib/graphql-cost-log') as typeof import('../src/modal/lib/graphql-cost-log');
    expect(
      labelGraphqlOperation('query TimelineItemsPage($owner:String!) { x }')
    ).toBe('timelineItems.page');
    expect(
      labelGraphqlOperation('query { repository { pullRequest { timelineItems(last:100) { nodes { id } } } } }')
    ).toBe('timelineItems.page');
  });
});

describe('GraphQL timeline node mapper (shipped fetch)', () => {
  test('maps IssueComment and LabeledEvent', () => {
    const c = mapGraphqlTimelineNode({
      __typename: 'IssueComment',
      id: 'IC_kw',
      databaseId: 42,
      createdAt: '2026-01-01T00:00:00Z',
      body: 'hello',
      author: { login: 'alice', avatarUrl: 'https://x' },
      reactionGroups: [],
    });
    expect(c.kind).toBe('comment');
    expect(c.value?.id).toBe(42);
    expect(c.value?.author).toBe('alice');

    const e = mapGraphqlTimelineNode({
      __typename: 'LabeledEvent',
      id: 'LE_1',
      createdAt: '2026-01-01T01:00:00Z',
      label: { name: 'bug', color: 'd73a4a' },
      actor: { login: 'bob' },
    });
    expect(e.kind).toBe('event');
    expect(e.value?.event).toBe('labeled');
    expect(e.value?.label?.name).toBe('bug');
  });

  test('skips noise subscribed/mentioned', () => {
    expect(
      mapGraphqlTimelineNode({ __typename: 'SubscribedEvent' }).kind
    ).toBe(null);
    expect(mapGraphqlTimelineNode({ __typename: 'MentionedEvent' }).kind).toBe(
      null
    );
  });

  test('buildConversationTimeline includes events + comments under filter', () => {
    const detail = {
      viewerLogin: 'alice',
      comments: [
        {
          id: 1,
          author: 'bob',
          body: 'hi',
          createdAt: '2026-01-02T00:00:00Z',
        },
      ],
      reviewComments: [],
      reviews: [],
      timelineEvents: [
        {
          id: 'e1',
          event: 'labeled',
          actor: 'alice',
          at: '2026-01-01T00:00:00Z',
          label: { name: 'bug', color: 'f00' },
        },
      ],
    };
    const items = buildConversationTimeline(detail);
    const filtered = filterTimelineItemsByVisibility(items, {
      events: true,
      participants: false,
      comments: true,
      'review-threads': true,
    });
    expect(filtered.some((i) => i.kind === 'issue-comment')).toBe(true);
    expect(filtered.some((i) => i.event === 'labeled' || i.kind === 'timeline-event')).toBe(
      true
    );
  });
});
