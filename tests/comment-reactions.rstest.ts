/**
 * Comment reaction pure helpers.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from '@rstest/core';
import { JSDOM } from 'jsdom';
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
  isCommentReactionPickerOpen,
  dismissCommentReactionPicker,
  placeReactionPicker,
  isReactionPickerAnchorLive,
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

describe('placeReactionPicker', () => {
  const picker = { width: 280, height: 44 };
  const viewport = { width: 1000, height: 800 };

  test('places above the button when there is room (explicit top, no translate)', () => {
    // Button near bottom of viewport
    const button = {
      top: 600,
      bottom: 626,
      left: 100,
      right: 126,
      width: 26,
      height: 26,
    };
    const pos = placeReactionPicker({ button, picker, viewport });
    expect(pos.placement).toBe('above');
    // top of menu = button.top - gap - pickerH
    expect(pos.top).toBe(600 - 8 - 44);
    // Centered on button mid (113) − half picker (140) = -27 → clamped to margin 8
    expect(pos.left).toBe(8);
  });

  test('places below when near the top of the viewport', () => {
    const button = {
      top: 20,
      bottom: 46,
      left: 200,
      right: 226,
      width: 26,
      height: 26,
    };
    const pos = placeReactionPicker({ button, picker, viewport });
    expect(pos.placement).toBe('below');
    expect(pos.top).toBe(46 + 8);
    // mid 213 − 140 = 73
    expect(pos.left).toBe(213 - 140);
  });

  test('clamps horizontal position into the viewport', () => {
    const button = {
      top: 400,
      bottom: 426,
      left: 900,
      width: 26,
      height: 26,
    };
    const pos = placeReactionPicker({ button, picker, viewport });
    // left + 280 must stay within 1000 - 8
    expect(pos.left + 280).toBeLessThanOrEqual(1000 - 8);
    expect(pos.left).toBeGreaterThanOrEqual(8);
  });

  test('menu box sits flush above button (bottom of menu ≈ button.top - gap)', () => {
    const button = {
      top: 500,
      bottom: 526,
      left: 40,
      right: 66,
      width: 26,
      height: 26,
    };
    const pos = placeReactionPicker({ button, picker, viewport });
    expect(pos.placement).toBe('above');
    expect(pos.top + picker.height).toBe(button.top - 8);
  });

  test('centers horizontally on the add-reaction control', () => {
    const button = {
      top: 300,
      bottom: 326,
      left: 400,
      right: 426,
      width: 26,
      height: 26,
    };
    const pos = placeReactionPicker({ button, picker, viewport });
    const mid = 413;
    expect(pos.left).toBe(mid - picker.width / 2);
  });
});

describe('isReactionPickerAnchorLive', () => {
  test('rejects zero-size and inactive keep-alive panel hosts', () => {
    const dom = new JSDOM(
      `<!doctype html><html><body>
        <div class="prp-body-panel">
          <button class="prp-reactions__add" style="width:26px;height:26px">☺</button>
        </div>
        <div class="prp-body-panel prp-body-panel--active">
          <button class="prp-reactions__add live" style="width:26px;height:26px">☺</button>
        </div>
      </body></html>`,
      { pretendToBeVisual: true }
    );
    const doc = dom.window.document;
    // jsdom getBoundingClientRect is often 0 — stub sizes
    const inactive = doc.querySelector(
      '.prp-body-panel:not(.prp-body-panel--active) .prp-reactions__add'
    ) as HTMLElement;
    const live = doc.querySelector(
      '.prp-body-panel--active .prp-reactions__add'
    ) as HTMLElement;
    for (const el of [inactive, live]) {
      el.getBoundingClientRect = () =>
        ({
          x: 10,
          y: 10,
          top: 10,
          left: 10,
          bottom: 36,
          right: 36,
          width: 26,
          height: 26,
          toJSON() {
            return {};
          },
        }) as DOMRect;
    }
    expect(isReactionPickerAnchorLive(inactive, { width: 800, height: 600 })).toBe(
      false
    );
    expect(isReactionPickerAnchorLive(live, { width: 800, height: 600 })).toBe(
      true
    );

    const tiny = doc.createElement('button');
    tiny.getBoundingClientRect = () =>
      ({
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        bottom: 0,
        right: 0,
        width: 0,
        height: 0,
        toJSON() {
          return {};
        },
      }) as DOMRect;
    expect(isReactionPickerAnchorLive(tiny, { width: 800, height: 600 })).toBe(
      false
    );
  });
});

describe('isCommentReactionPickerOpen / dismissCommentReactionPicker', () => {
  test('detects open picker by data attr or expanded add button', () => {
    const dom = new JSDOM(
      `<!doctype html><html><body>
        <button class="prp-reactions__add" aria-expanded="false">☺</button>
      </body></html>`
    );
    const doc = dom.window.document;
    expect(isCommentReactionPickerOpen(doc)).toBe(false);

    const add = doc.querySelector('.prp-reactions__add') as HTMLButtonElement;
    add.setAttribute('aria-expanded', 'true');
    expect(isCommentReactionPickerOpen(doc)).toBe(true);

    add.setAttribute('aria-expanded', 'false');
    const menu = doc.createElement('div');
    menu.setAttribute('data-prp-reaction-picker', '1');
    menu.className = 'prp-reactions__picker';
    doc.body.appendChild(menu);
    expect(isCommentReactionPickerOpen(doc)).toBe(true);
  });

  test('dismiss clicks expanded add control', () => {
    const dom = new JSDOM(
      `<!doctype html><html><body>
        <button class="prp-reactions__add" aria-expanded="true">☺</button>
      </body></html>`
    );
    const doc = dom.window.document;
    const add = doc.querySelector('.prp-reactions__add') as HTMLButtonElement;
    let clicks = 0;
    add.addEventListener('click', () => {
      clicks += 1;
      add.setAttribute('aria-expanded', 'false');
    });
    expect(dismissCommentReactionPicker(doc)).toBe(true);
    expect(clicks).toBe(1);
    expect(isCommentReactionPickerOpen(doc)).toBe(false);
  });

  test('modal Escape path dismisses reaction picker before shell close', () => {
    const root = path.resolve(__dirname, '..');
    // Capture keydown lives in usePrModalHotkeys (Phase 7 extract from shell).
    const hotkeys = fs.readFileSync(
      path.join(root, 'src/modal/hooks/usePrModalHotkeys.ts'),
      'utf8'
    );
    expect(hotkeys).toMatch(/isCommentReactionPickerOpen/);
    expect(hotkeys).toMatch(/dismissCommentReactionPicker/);
    // Escape branch: resolve owner then dismiss reaction before shell close
    expect(hotkeys).toMatch(
      /isCommentReactionPickerOpen[\s\S]{0,2500}dismissCommentReactionPicker/
    );
    expect(hotkeys).toMatch(/reactionPickerOpen:\s*Boolean\(reactionOpen\)/);
    expect(hotkeys).toMatch(/if \(reactionOpen\)/);
    const shell = fs.readFileSync(
      path.join(root, 'src/modal/app/PrModalShell.tsx'),
      'utf8'
    );
    expect(shell).toMatch(/isCommentReactionPickerOpen/);
    expect(shell).toMatch(/dismissCommentReactionPicker/);
    const reactionsUi = fs.readFileSync(
      path.join(root, 'src/modal/components/common/CommentReactions.tsx'),
      'utf8'
    );
    expect(reactionsUi).toMatch(/data-prp-reaction-picker=["']1["']/);
    // Portal uses explicit top/left from placeReactionPicker (no translateY)
    expect(reactionsUi).toMatch(/placeReactionPicker/);
    expect(reactionsUi).toMatch(/isReactionPickerAnchorLive/);
    expect(reactionsUi).not.toMatch(/translateY\(-100%\)/);
    const portalCss = fs.readFileSync(
      path.join(root, 'src/modal/components/common/CommentReactions.css'),
      'utf8'
    );
    expect(portalCss).toMatch(/\.prp-reactions__picker--portal/);
    expect(portalCss).toMatch(/position:\s*fixed/);
  });
});
