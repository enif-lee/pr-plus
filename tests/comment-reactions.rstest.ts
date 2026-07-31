/**
 * Comment reaction pure helpers + structural wiring.
 */
import { describe, expect, test } from '@rstest/core';
import {
  REACTION_DEFS,
  mapRestReactionsSummary,
  mapGraphqlReactionGroups,
  applyReactionToggle,
  activeReactionGroups,
  reactionContentToGql,
  gqlReactionToContent,
  patchCommentReactionsInList,
  formatReactionUsersTooltip,
} from '../src/modal/lib/comment-reactions';

describe('comment-reactions pure', () => {
  test('ships the official GitHub reaction set in order', () => {
    expect(REACTION_DEFS.map((d) => d.content)).toEqual([
      '+1',
      '-1',
      'laugh',
      'hooray',
      'confused',
      'heart',
      'rocket',
      'eyes',
    ]);
    expect(reactionContentToGql('+1')).toBe('THUMBS_UP');
    expect(gqlReactionToContent('HEART')).toBe('heart');
  });

  test('mapRestReactionsSummary drops zeros', () => {
    const groups = mapRestReactionsSummary({
      '+1': 2,
      heart: 0,
      eyes: 1,
      total_count: 3,
    });
    expect(groups).toEqual([
      { content: '+1', count: 2, viewerHasReacted: false, users: [] },
      { content: 'eyes', count: 1, viewerHasReacted: false, users: [] },
    ]);
  });

  test('mapGraphqlReactionGroups keeps viewerHasReacted', () => {
    const groups = mapGraphqlReactionGroups([
      {
        content: 'THUMBS_UP',
        viewerHasReacted: true,
        reactors: { totalCount: 3 },
      },
      {
        content: 'ROCKET',
        viewerHasReacted: false,
        reactors: { totalCount: 0 },
      },
      {
        content: 'HEART',
        viewerHasReacted: false,
        reactors: { totalCount: 1 },
      },
    ]);
    expect(groups).toEqual([
      { content: '+1', count: 3, viewerHasReacted: true, users: [] },
      { content: 'heart', count: 1, viewerHasReacted: false, users: [] },
    ]);
  });

  test('applyReactionToggle add and remove with users list', () => {
    let g = applyReactionToggle([], '+1', true, 'alice');
    expect(g).toEqual([
      {
        content: '+1',
        count: 1,
        viewerHasReacted: true,
        users: ['alice'],
      },
    ]);
    g = applyReactionToggle(g, 'heart', true, 'alice');
    expect(activeReactionGroups(g).map((x) => x.content)).toEqual([
      '+1',
      'heart',
    ]);
    // Toggle off own +1
    g = applyReactionToggle(g, '+1', false, 'alice');
    expect(g).toEqual([
      {
        content: 'heart',
        count: 1,
        viewerHasReacted: true,
        users: ['alice'],
      },
    ]);
  });

  test('formatReactionUsersTooltip distinguishes you vs others', () => {
    const tip = formatReactionUsersTooltip(
      {
        content: '+1',
        count: 3,
        viewerHasReacted: true,
        users: ['alice', 'bob'],
      },
      { viewerLogin: 'alice' }
    );
    expect(tip).toMatch(/you/);
    expect(tip).toMatch(/bob/);
    expect(tip).toMatch(/👍|Thumbs up|\+1/);
  });

  test('mapGraphqlReactionGroups carries reactor logins', () => {
    const groups = mapGraphqlReactionGroups([
      {
        content: 'THUMBS_UP',
        viewerHasReacted: true,
        reactors: {
          totalCount: 2,
          nodes: [{ login: 'alice' }, { login: 'bob' }],
        },
      },
    ]);
    expect(groups[0].viewerHasReacted).toBe(true);
    expect(groups[0].users).toEqual(['alice', 'bob']);
  });

  test('patchCommentReactionsInList updates only target id', () => {
    const list = [
      { id: 1, reactions: [] },
      { id: 2, reactions: [{ content: '+1', count: 1, viewerHasReacted: false }] },
    ];
    const next = patchCommentReactionsInList(list, 2, [
      { content: 'heart', count: 1, viewerHasReacted: true },
    ]);
    expect(next[0].reactions).toEqual([]);
    expect(next[1].reactions[0].content).toBe('heart');
  });
});

describe('structural: reactions wiring', () => {
  test('fetch maps reactions + toggleCommentReaction export', () => {
    const fs = require('node:fs') as typeof import('node:fs');
    const path = require('node:path') as typeof import('node:path');
    const root = path.resolve(__dirname, '..');
    const fetchSrc = fs.readFileSync(
      path.join(root, 'src/fetch/fetch-api.ts'),
      'utf8'
    );
    expect(fetchSrc).toMatch(/function mapRestReactions/);
    expect(fetchSrc).toMatch(/function mapGraphqlReactionGroups/);
    expect(fetchSrc).toMatch(/async function toggleCommentReaction/);
    expect(fetchSrc).toMatch(/reactionGroups/);
    expect(fetchSrc).toMatch(/toggleCommentReaction,/);

    const sw = fs.readFileSync(
      path.join(root, 'src/background/sw-api.ts'),
      'utf8'
    );
    expect(sw).toMatch(/TOGGLE_COMMENT_REACTION/);
    expect(sw).toMatch(/toggleCommentReaction/);

    const bridge = fs.readFileSync(
      path.join(root, 'src/content-bridge/bridge-api.ts'),
      'utf8'
    );
    expect(bridge).toMatch(/toggleCommentReaction/);
    expect(bridge).toMatch(/PR_TREE_TOGGLE_COMMENT_REACTION/);

    const ui = fs.readFileSync(
      path.join(root, 'src/modal/components/common/CommentReactions.tsx'),
      'utf8'
    );
    expect(ui).toMatch(/prp-reactions/);
    expect(ui).toMatch(/Add reaction/);
    expect(ui).toMatch(/REACTION_DEFS/);
    expect(ui).toMatch(/formatReactionUsersTooltip|is-reacted/);
    expect(ui).toMatch(/prp-reactions__picker--portal|createPortal/);

    const inline = fs.readFileSync(
      path.join(root, 'src/modal/views/diff/InlineThread.tsx'),
      'utf8'
    );
    expect(inline).toMatch(/CommentReactions/);
    expect(inline).toMatch(/onToggleReaction/);

    const desc = fs.readFileSync(
      path.join(root, 'src/modal/views/conversation/DescriptionCard.tsx'),
      'utf8'
    );
    expect(desc).toMatch(/CommentReactions/);
    expect(desc).toMatch(/bodyReactions|kind: 'pr'/);

    const mdv = fs.readFileSync(
      path.join(root, 'src/modal/components/common/MarkdownView.tsx'),
      'utf8'
    );
    expect(mdv).toMatch(/expandEmojiShortcodes/);

    const mdc = fs.readFileSync(
      path.join(root, 'src/modal/components/common/MarkdownComposer.tsx'),
      'utf8'
    );
    expect(mdc).toMatch(/prp-composer-menu--portal|createPortal/);
  });
});
