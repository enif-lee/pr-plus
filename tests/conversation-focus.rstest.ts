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
  resolveArrowFoldAction,
  resolveModalShortcutAction,
} from '../src/modal/lib/shortcut-policy';
import { buildConversationVirtualRows } from '../src/modal/lib/conversation-virtual';
import {
  scrollTopToMaximizeRect,
  scrollTopToMaximizeIndex,
} from '../src/modal/lib/virtual-range';

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

/**
 * Focusable stop kinds/anchors derived from the same virtual-row builder the UI
 * uses — ground truth for reverseComments panel order.
 */
function expectedFocusKindsFromVirtualRows(
  items: any[],
  reverseComments: boolean
): string[] {
  const rows = buildConversationVirtualRows(
    { items, bottomItems: [], showThreadGap: false, hiddenCount: 0 },
    { reverseComments }
  );
  const kinds: string[] = [];
  for (const row of rows) {
    if (row.type === 'description') kinds.push('description');
    else if (row.type === 'composer') kinds.push('composer');
    else if (row.type === 'merge') kinds.push('merge');
    else if (row.type === 'item' && row.item) {
      const k = String(row.item.kind || '');
      if (k === 'timeline-event') continue;
      if (k === 'review-thread' || k === 'review-comment') {
        kinds.push('review-thread');
      } else if (k === 'issue-comment') kinds.push('issue-comment');
      else if (k === 'review-group') {
        kinds.push('review-group');
        for (const t of row.item.threads || []) {
          if (t?.id != null) kinds.push('review-thread');
        }
      } else if (k === 'review') kinds.push('review');
    }
  }
  return kinds;
}

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

  test('step kinds match buildConversationVirtualRows order (reverse on/off)', () => {
    for (const reverse of [true, false]) {
      const expected = expectedFocusKindsFromVirtualRows(FIXTURE_ITEMS, reverse);
      const targets = listConversationCommentFocusTargets(FIXTURE_ITEMS, {
        reverseComments: reverse,
      });
      expect(targets.map((t) => t.kind)).toEqual(expected);

      // Full step cycle never reorders relative to virtual rows
      let cur: string | null = null;
      const walked: string[] = [];
      for (let i = 0; i < targets.length; i++) {
        const next = stepConversationCommentFocus(
          FIXTURE_ITEMS,
          cur,
          1,
          { reverseComments: reverse }
        );
        expect(next).toBeTruthy();
        walked.push(next!.kind);
        cur = next!.anchor;
      }
      expect(walked).toEqual(expected);
    }
  });

  test('review-group expands to group + thread stops in timeline order', () => {
    const items = [
      {
        id: 99,
        kind: 'review-group',
        threads: [
          { id: 1, path: 'a.ts', line: 1 },
          { id: 2, path: 'b.ts', line: 2 },
        ],
      },
    ];
    const reverse = true;
    const expected = expectedFocusKindsFromVirtualRows(items, reverse);
    const targets = listConversationCommentFocusTargets(items, {
      reverseComments: reverse,
    });
    expect(targets.map((t) => t.kind)).toEqual(expected);
    expect(targets.map((t) => t.anchor)).toEqual([
      'body',
      'composer',
      'merge',
      'review-group:99',
      'review-comment:1',
      'review-comment:2',
    ]);
  });
});

describe('scrollTopToMaximizeRect (thread focus visibility)', () => {
  test('keeps scroll when already fully visible', () => {
    // element y=100 h=80 in viewport 0..400
    expect(scrollTopToMaximizeRect(0, 400, 2000, 100, 80, { pad: 0 })).toBe(0);
  });

  test('pulls up when bottom is clipped (fits in viewport)', () => {
    // viewport 400; element at y=350 h=100 → bottom at 450, needs scroll 50
    const next = scrollTopToMaximizeRect(0, 400, 2000, 350, 100, {
      padTop: 0,
      padBottom: 0,
    });
    expect(next).toBe(50);
    // fully visible after
    expect(350 >= next && 450 <= next + 400).toBe(true);
  });

  test('bottom-of-content thread still maximizes under maxScroll', () => {
    // content 500, vh 400 → maxScroll 100; element at y=380 h=100
    const next = scrollTopToMaximizeRect(0, 400, 500, 380, 100, {
      padTop: 24,
      padBottom: 24,
    });
    expect(next).toBe(100); // clamped to maxScroll
  });

  test('tall thread pins top under pad (max visible fraction from root)', () => {
    // h=800 > avail; y=200; padTop 24 → scrollTop = 200-24 = 176
    const next = scrollTopToMaximizeRect(0, 400, 3000, 200, 800, {
      padTop: 24,
      padBottom: 24,
    });
    expect(next).toBe(176);
  });

  test('scrollTopToMaximizeIndex matches offsets for bottom row', () => {
    // 5 rows of 100px; vh 250; focus last row (index 4 at y=400)
    const offsets = [0, 100, 200, 300, 400, 500];
    const next = scrollTopToMaximizeIndex(4, 0, 100, 250, 5, offsets, {
      padTop: 0,
      padBottom: 0,
    });
    // row y=400 h=100; pin bottom → 400+100-250 = 250; maxScroll=250
    expect(next).toBe(250);
  });
});

describe('ArrowLeft/Right focused thread fold', () => {
  test('Conversation + thread focus: ← collapse, → expand', () => {
    expect(
      resolveArrowFoldAction({
        key: 'arrowleft',
        layoutMode: 'centered',
        contextThreadActive: true,
        focusedReviewThread: true,
      })
    ).toBe('contextThreadCollapse');
    expect(
      resolveArrowFoldAction({
        key: 'arrowright',
        layoutMode: 'conversation',
        contextThreadActive: true,
        focusedReviewThread: true,
      })
    ).toBe('contextThreadExpand');
  });

  test('Conversation non-thread focus does not fold', () => {
    expect(
      resolveArrowFoldAction({
        key: 'arrowleft',
        layoutMode: 'centered',
        contextThreadActive: true,
        focusedReviewThread: false,
      })
    ).toBe(null);
  });

  test('Diff thread focus folds thread; line selection prefers file', () => {
    expect(
      resolveModalShortcutAction({
        key: 'ArrowLeft',
        code: 'ArrowLeft',
        layoutMode: 'diff',
        contextThreadActive: true,
        diffThreadFocused: true,
        hasLineSelection: false,
      })
    ).toBe('contextThreadCollapse');
    expect(
      resolveModalShortcutAction({
        key: 'ArrowRight',
        code: 'ArrowRight',
        layoutMode: 'diff',
        contextThreadActive: true,
        diffThreadFocused: true,
        hasLineSelection: true,
      })
    ).toBe('expandActiveFile');
  });

  test('editable target blocks thread fold', () => {
    expect(
      resolveModalShortcutAction({
        key: 'ArrowLeft',
        code: 'ArrowLeft',
        layoutMode: 'centered',
        contextThreadActive: true,
        focusedReviewThread: true,
        editableTarget: true,
      })
    ).toBe(null);
  });
});

describe('⌥⇧C clear thread focus', () => {
  test('clears when Conversation comment focused', () => {
    expect(
      resolveModalShortcutAction({
        key: 'c',
        code: 'KeyC',
        alt: true,
        shift: true,
        layoutMode: 'centered',
        conversationCommentFocused: true,
      })
    ).toBe('clearConversationCommentFocus');
  });

  test('clears when Diff thread focused (hit ring / commentIndex)', () => {
    expect(
      resolveModalShortcutAction({
        key: 'c',
        code: 'KeyC',
        alt: true,
        shift: true,
        layoutMode: 'diff',
        conversationCommentFocused: false,
        diffThreadFocused: true,
        contextThreadActive: true,
      })
    ).toBe('clearConversationCommentFocus');
  });

  test('seeds focus when nothing focused', () => {
    expect(
      resolveModalShortcutAction({
        key: 'c',
        code: 'KeyC',
        alt: true,
        shift: true,
        layoutMode: 'centered',
        conversationCommentFocused: false,
        diffThreadFocused: false,
      })
    ).toBe('focusConversationComment');
  });
});
