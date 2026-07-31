/**
 * Reaction mapping: hot path omits reactor users; count + viewerHasReacted remain.
 * Drives shipped mapGraphqlReactionGroups from comment-reactions.ts.
 */
import { describe, expect, test } from '@rstest/core';
import fs from 'node:fs';
import path from 'node:path';
import {
  mapGraphqlReactionGroups,
  REACTION_GROUPS_GQL,
  REACTION_REACTORS_FIRST,
} from '../src/modal/lib/comment-reactions';

const root = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

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

describe('reaction GQL hot path (structural)', () => {
  test('REACTION_GROUPS_GQL has no reactor login nodes', () => {
    expect(REACTION_GROUPS_GQL).toMatch(/viewerHasReacted/);
    expect(REACTION_GROUPS_GQL).toMatch(/totalCount/);
    expect(REACTION_GROUPS_GQL).not.toMatch(/nodes\s*\{/);
    expect(REACTION_REACTORS_FIRST).toBe(5);
  });

  test('fetch-api review threads reaction fragment omits reactor nodes', () => {
    const fetch = read('src/fetch/fetch-api.ts');
    // REVIEW_THREAD_NODE_FIELDS reactionGroups block
    expect(fetch).toMatch(
      /reactionGroups\s*\{\s*content\s*viewerHasReacted\s*reactors\(first:1\)\s*\{\s*totalCount\s*\}/
    );
    // must not request reactors(first:20) with nodes on hot path
    expect(fetch).not.toMatch(/reactors\(first:20\)\s*\{\s*totalCount\s*nodes/);
  });

  test('fetchReactableReactors exists for hover first-N', () => {
    const fetch = read('src/fetch/fetch-api.ts');
    expect(fetch).toMatch(/async function fetchReactableReactors/);
    expect(fetch).toMatch(/fetchReactableReactors,/);
    const bridge = read('src/content-bridge/bridge-api.ts');
    expect(bridge).toMatch(/fetchReactableReactors/);
    expect(bridge).toMatch(/PR_TREE_FETCH_REACTABLE_REACTORS/);
  });
});

describe('shipped SW bundle (background.bundle.js)', () => {
  test('hot path has no reactors(first:20) with nodes; hover MSG present', () => {
    const bundle = read('src/background.bundle.js');
    expect(bundle).not.toMatch(/reactors\(first:20\)/);
    expect(bundle).toMatch(/reactors\(first:1\)\s*\{\s*totalCount\s*\}/);
    expect(bundle).toMatch(/PR_TREE_FETCH_REACTABLE_REACTORS/);
    expect(bundle).toMatch(/fetchReactableReactors/);
  });
});

