/**
 * Conversation ⌥J/K focus order: body → comments → merge.
 */
import { describe, expect, test } from '@rstest/core';
import {
  listConversationCommentFocusTargets,
  pickConversationCommentFocusTarget,
  stepConversationCommentFocus,
} from '../src/modal/lib/shortcut-policy';

describe('listConversationCommentFocusTargets', () => {
  test('orders body, comments, merge as 1/2/3', () => {
    const items = [
      { id: 10, kind: 'issue-comment', body: 'hi' },
      { id: 11, kind: 'timeline-event', event: 'renamed' },
      {
        id: 20,
        kind: 'review-thread',
        path: 'a.ts',
        line: 1,
      },
    ];
    const t = listConversationCommentFocusTargets(items);
    expect(t[0]).toMatchObject({ kind: 'description', anchor: 'body' });
    expect(t[t.length - 1]).toMatchObject({ kind: 'merge', anchor: 'merge' });
    const mids = t.slice(1, -1).map((x) => x.kind);
    expect(mids).toContain('issue-comment');
    expect(mids).toContain('review-thread');
    expect(mids).not.toContain('timeline-event');
  });

  test('pick seeds on body; step wraps through merge', () => {
    const items = [{ id: 1, kind: 'issue-comment' }];
    const first = pickConversationCommentFocusTarget(items);
    expect(first?.anchor).toBe('body');
    const next = stepConversationCommentFocus(items, 'body', 1);
    expect(next?.kind).toBe('issue-comment');
    const afterComments = stepConversationCommentFocus(
      items,
      next?.anchor,
      1
    );
    expect(afterComments?.anchor).toBe('merge');
    const wrap = stepConversationCommentFocus(items, 'merge', 1);
    expect(wrap?.anchor).toBe('body');
  });
});
