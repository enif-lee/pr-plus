/**
 * Conversation ⌥J/K focus order matches visual UI under reverseComments.
 * reverse off: description → comments/reviews → merge → composer
 * reverse on:  description → composer → merge → comments/reviews
 */
import { describe, expect, test } from '@rstest/core';
import {
  listConversationCommentFocusTargets,
  pickConversationCommentFocusTarget,
  stepConversationCommentFocus,
} from '../src/modal/lib/shortcut-policy';

const FIXTURE_ITEMS = [
  { id: 10, kind: 'issue-comment', body: 'hi' },
  { id: 11, kind: 'timeline-event', event: 'renamed' },
  {
    id: 20,
    kind: 'review-thread',
    path: 'a.ts',
    line: 1,
  },
];

describe('listConversationCommentFocusTargets', () => {
  test('reverseComments=false: description → comments → merge → composer', () => {
    const t = listConversationCommentFocusTargets(FIXTURE_ITEMS, {
      reverseComments: false,
    });
    expect(t.map((x) => x.kind)).toEqual([
      'description',
      'issue-comment',
      'review-thread',
      'merge',
      'composer',
    ]);
    expect(t.map((x) => x.anchor)).toEqual([
      'body',
      'issue-comment:10',
      'review-comment:20',
      'merge',
      'composer',
    ]);
    expect(t.some((x) => x.kind === 'timeline-event')).toBe(false);
  });

  test('reverseComments=true: description → composer → merge → comments', () => {
    const t = listConversationCommentFocusTargets(FIXTURE_ITEMS, {
      reverseComments: true,
    });
    expect(t.map((x) => x.kind)).toEqual([
      'description',
      'composer',
      'merge',
      'issue-comment',
      'review-thread',
    ]);
    expect(t[0]).toMatchObject({ kind: 'description', anchor: 'body' });
    expect(t[1]).toMatchObject({ kind: 'composer', anchor: 'composer' });
    expect(t[2]).toMatchObject({ kind: 'merge', anchor: 'merge' });
    expect(t.some((x) => x.kind === 'timeline-event')).toBe(false);
  });

  test('default opts (no reverseComments) keeps comments before merge, composer last', () => {
    // Boolean(undefined) → false: matches buildConversationVirtualRows default
    const t = listConversationCommentFocusTargets(FIXTURE_ITEMS);
    expect(t[0].kind).toBe('description');
    expect(t[t.length - 1].kind).toBe('composer');
    expect(t[t.length - 2].kind).toBe('merge');
    expect(t.slice(1, -2).map((x) => x.kind)).toEqual([
      'issue-comment',
      'review-thread',
    ]);
  });
});

describe('stepConversationCommentFocus / pick', () => {
  test('pick seeds on body for both modes', () => {
    const items = [{ id: 1, kind: 'issue-comment' }];
    expect(pickConversationCommentFocusTarget(items)?.anchor).toBe('body');
    expect(
      pickConversationCommentFocusTarget(items, { reverseComments: true })
        ?.anchor
    ).toBe('body');
  });

  test('reverse off: step wraps body → comment → merge → composer → body', () => {
    const items = [{ id: 1, kind: 'issue-comment' }];
    const opts = { reverseComments: false };
    const first = pickConversationCommentFocusTarget(items, opts);
    expect(first?.anchor).toBe('body');
    const next = stepConversationCommentFocus(items, 'body', 1, opts);
    expect(next?.kind).toBe('issue-comment');
    const afterComments = stepConversationCommentFocus(
      items,
      next?.anchor,
      1,
      opts
    );
    expect(afterComments?.anchor).toBe('merge');
    const afterMerge = stepConversationCommentFocus(items, 'merge', 1, opts);
    expect(afterMerge?.anchor).toBe('composer');
    const wrap = stepConversationCommentFocus(items, 'composer', 1, opts);
    expect(wrap?.anchor).toBe('body');
  });

  test('reverse on: step wraps body → composer → merge → comment → body', () => {
    const items = [{ id: 1, kind: 'issue-comment' }];
    const opts = { reverseComments: true };
    const next = stepConversationCommentFocus(items, 'body', 1, opts);
    expect(next?.anchor).toBe('composer');
    const afterComposer = stepConversationCommentFocus(
      items,
      'composer',
      1,
      opts
    );
    expect(afterComposer?.anchor).toBe('merge');
    const afterMerge = stepConversationCommentFocus(items, 'merge', 1, opts);
    expect(afterMerge?.kind).toBe('issue-comment');
    expect(afterMerge?.anchor).toBe('issue-comment:1');
    const wrap = stepConversationCommentFocus(
      items,
      afterMerge?.anchor,
      1,
      opts
    );
    expect(wrap?.anchor).toBe('body');
  });

  test('seed: delta>0 → first, delta<0 → last (reverse on last is comment)', () => {
    const items = [{ id: 1, kind: 'issue-comment' }];
    const opts = { reverseComments: true };
    const down = stepConversationCommentFocus(items, null, 1, opts);
    expect(down?.anchor).toBe('body');
    const up = stepConversationCommentFocus(items, null, -1, opts);
    expect(up?.kind).toBe('issue-comment');
  });

  test('seed: delta<0 last is composer when reverse off', () => {
    const items = [{ id: 1, kind: 'issue-comment' }];
    const opts = { reverseComments: false };
    const up = stepConversationCommentFocus(items, null, -1, opts);
    expect(up?.anchor).toBe('composer');
  });
});
