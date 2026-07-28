/**
 * rstest — conversation timeline system events (title, draft/ready, labels, …).
 */
import { describe, expect, test } from '@rstest/core';
import {
  buildConversationTimeline,
  describeTimelineEvent,
  timelineEventToItem,
} from '../src/modal/lib/conversation-timeline';
import { timelineEventRailSegments } from '../src/modal/lib/conversation-virtual';

describe('describeTimelineEvent', () => {
  test('renamed shows from → to with title tokens', () => {
    const parts = describeTimelineEvent({
      event: 'renamed',
      rename: { from: 'Old title', to: 'New title' },
    });
    expect(parts).toEqual([
      { type: 'text', text: 'changed the title from ' },
      { type: 'title', text: 'Old title' },
      { type: 'text', text: ' to ' },
      { type: 'title', text: 'New title' },
    ]);
  });

  test('draft / ready for review use status tones', () => {
    expect(describeTimelineEvent({ event: 'convert_to_draft' })).toEqual([
      { type: 'text', text: 'marked this pull request as ' },
      { type: 'status', text: 'draft', tone: 'draft' },
    ]);
    expect(describeTimelineEvent({ event: 'ready_for_review' })).toEqual([
      { type: 'text', text: 'marked this pull request as ' },
      { type: 'status', text: 'ready for review', tone: 'ready' },
    ]);
  });

  test('label / assignee / review request', () => {
    expect(
      describeTimelineEvent({
        event: 'labeled',
        label: { name: 'bug', color: 'd73a4a' },
      })
    ).toEqual([
      { type: 'text', text: 'added the ' },
      { type: 'label', name: 'bug', color: 'd73a4a' },
      { type: 'text', text: ' label' },
    ]);
    expect(
      describeTimelineEvent({ event: 'assigned', assignee: 'alice' })
    ).toEqual([
      { type: 'text', text: 'assigned ' },
      { type: 'user', login: 'alice' },
    ]);
    expect(
      describeTimelineEvent({
        event: 'review_requested',
        requestedReviewer: 'bob',
      })
    ).toEqual([
      { type: 'text', text: 'requested a review from ' },
      { type: 'user', login: 'bob' },
    ]);
  });

  test('closed / reopened / milestoned / commit colors', () => {
    expect(describeTimelineEvent({ event: 'closed' })).toEqual([
      { type: 'status', text: 'closed', tone: 'closed' },
      { type: 'text', text: ' this' },
    ]);
    expect(describeTimelineEvent({ event: 'reopened' })).toEqual([
      { type: 'status', text: 'reopened', tone: 'reopened' },
      { type: 'text', text: ' this' },
    ]);
    expect(
      describeTimelineEvent({
        event: 'milestoned',
        milestone: { title: 'v1.0', number: 1 },
      })
    ).toEqual([
      { type: 'text', text: 'added this to the ' },
      { type: 'milestone', title: 'v1.0' },
      { type: 'text', text: ' milestone' },
    ]);
    expect(
      describeTimelineEvent({
        event: 'merged',
        commitId: 'abcdef0123456789',
      })
    ).toEqual([
      { type: 'status', text: 'merged', tone: 'merged' },
      { type: 'text', text: ' commit ' },
      { type: 'commit', text: 'abcdef0' },
    ]);
  });
});

describe('timelineEventToItem + buildConversationTimeline', () => {
  test('maps event to timeline-event item', () => {
    const item = timelineEventToItem({
      id: 42,
      event: 'convert_to_draft',
      actor: 'enif-lee',
      avatarUrl: 'https://example.com/a.png',
      at: '2026-07-28T11:24:38Z',
    });
    expect(item).toMatchObject({
      kind: 'timeline-event',
      id: 42,
      event: 'convert_to_draft',
      author: 'enif-lee',
      at: '2026-07-28T11:24:38Z',
    });
    expect(item?.parts?.some((p: any) => p.text === 'draft')).toBe(true);
  });

  test('merges system events with comments chronologically (newest first)', () => {
    const items = buildConversationTimeline({
      comments: [
        {
          id: 1,
          author: 'alice',
          body: 'hello',
          createdAt: '2026-07-28T12:00:00Z',
        },
      ],
      reviews: [],
      reviewComments: [],
      timelineEvents: [
        {
          id: 10,
          event: 'renamed',
          actor: 'enif-lee',
          at: '2026-07-28T11:00:00Z',
          rename: { from: 'A', to: 'B' },
        },
        {
          id: 11,
          event: 'ready_for_review',
          actor: 'enif-lee',
          at: '2026-07-28T13:00:00Z',
        },
        {
          id: 12,
          event: 'convert_to_draft',
          actor: 'enif-lee',
          at: '2026-07-28T12:30:00Z',
        },
      ],
    });

    expect(items.map((i) => i.kind)).toEqual([
      'timeline-event', // ready 13:00
      'timeline-event', // draft 12:30
      'issue-comment', // 12:00
      'timeline-event', // rename 11:00
    ]);
    expect(items[0].event).toBe('ready_for_review');
    expect(items[1].event).toBe('convert_to_draft');
    expect(items[3].event).toBe('renamed');
  });

  test('empty detail returns empty timeline', () => {
    expect(buildConversationTimeline(null)).toEqual([]);
    expect(buildConversationTimeline({})).toEqual([]);
  });
});

describe('timelineEventRailSegments', () => {
  test('rail runs center of first feed item → center of last (no end stubs)', () => {
    const rows = [
      { type: 'description', key: 'description' },
      {
        type: 'item',
        key: 'item:1',
        item: { kind: 'timeline-event', id: 1 },
      },
      {
        type: 'item',
        key: 'item:2',
        item: { kind: 'timeline-event', id: 2 },
      },
      {
        type: 'item',
        key: 'item:3',
        item: { kind: 'issue-comment', id: 3 },
      },
      {
        type: 'item',
        key: 'item:4',
        item: { kind: 'timeline-event', id: 4 },
      },
    ];
    // Fixed heights so the math is deterministic
    const measured = new Map([
      ['description', 100],
      ['item:1', 40],
      ['item:2', 40],
      ['item:3', 80],
      ['item:4', 40],
    ]);
    const segs = timelineEventRailSegments(rows, measured);
    // First event center: 100 + 20 = 120
    // Last event center: 100+40+40+80 + 20 = 280
    // Height: 160 — no line above first or below last
    expect(segs).toHaveLength(1);
    expect(segs[0]).toEqual({ top: 120, height: 160 });
  });

  test('single feed item has no rail bar', () => {
    const rows = [
      { type: 'description', key: 'description' },
      {
        type: 'item',
        key: 'item:1',
        item: { kind: 'issue-comment', id: 1 },
      },
    ];
    const measured = new Map([
      ['description', 100],
      ['item:1', 80],
    ]);
    expect(timelineEventRailSegments(rows, measured)).toEqual([]);
  });

  test('no rail when there are no feed items', () => {
    const rows = [{ type: 'description', key: 'description' }];
    const measured = new Map([['description', 100]]);
    expect(timelineEventRailSegments(rows, measured)).toEqual([]);
  });
});
