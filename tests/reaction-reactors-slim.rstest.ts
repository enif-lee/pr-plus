/**
 * Reaction mapping: hot path omits reactor users; count + viewerHasReacted remain.
 * Drives shipped mapGraphqlReactionGroups from comment-reactions.ts.
 */
import { describe, expect, test } from '@rstest/core';
import {
  mapGraphqlReactionGroups,
  REACTION_GROUPS_GQL,
  REACTION_REACTORS_FIRST,
} from '../src/modal/lib/comment-reactions';

describe('mapGraphqlReactionGroups (shipped)', () => {
  test('maps count + viewerHasReacted without reactor nodes', () => {
    const groups = mapGraphqlReactionGroups([
      {
        content: 'THUMBS_UP',
        viewerHasReacted: true,
        reactors: { totalCount: 12 },
      },
      {
        content: 'HEART',
        viewerHasReacted: false,
        reactors: { totalCount: 3, nodes: [] },
      },
    ]);
    expect(groups.length).toBe(2);
    const up = groups.find((g) => g.content === '+1');
    expect(up).toBeTruthy();
    expect(up!.count).toBe(12);
    expect(up!.viewerHasReacted).toBe(true);
    expect(up!.users || []).toEqual([]);
    const heart = groups.find((g) => g.content === 'heart');
    expect(heart!.count).toBe(3);
    expect(heart!.viewerHasReacted).toBe(false);
  });

  test('includes reactor logins when nodes present (hover path)', () => {
    const groups = mapGraphqlReactionGroups([
      {
        content: 'ROCKET',
        viewerHasReacted: false,
        reactors: {
          totalCount: 8,
          nodes: [
            { login: 'alice' },
            { login: 'bob' },
            { login: 'carol' },
            { login: 'dave' },
            { login: 'erin' },
          ],
        },
      },
    ]);
    const r = groups.find((g) => g.content === 'rocket');
    expect(r!.count).toBeGreaterThanOrEqual(5);
    expect(r!.users).toEqual(['alice', 'bob', 'carol', 'dave', 'erin']);
  });
});

describe('REACTION_GROUPS_GQL (shipped constant)', () => {
  test('hot path selection has no reactor login nodes', () => {
    expect(REACTION_GROUPS_GQL).toMatch(/viewerHasReacted/);
    expect(REACTION_GROUPS_GQL).toMatch(/totalCount/);
    expect(REACTION_GROUPS_GQL).not.toMatch(/nodes\s*\{/);
    expect(REACTION_REACTORS_FIRST).toBe(5);
  });
});
