/**
 * Thread reply ↑/↓ units + root-only Opt hints + ⌥I thread comment policy.
 */
import { describe, expect, test } from '@rstest/core';
import {
  listReviewThreadFocusUnits,
  stepReviewThreadFocusUnit,
  shouldShowThreadOptHints,
  collectThreadReplyComments,
} from '../src/modal/lib/thread-reply-nav';
import {
  CONTEXT_THREAD_SHORTCUT,
  COMPOSER_CONTEXT_SHORTCUT,
} from '../src/modal/lib/shortcut-policy-constants';
import { resolveModalShortcutAction } from '../src/modal/lib/shortcut-policy';

describe('collectThreadReplyComments (transitive)', () => {
  test('includes nested reply-to-reply chains under root', () => {
    const all = [
      { id: 1, body: 'root' },
      { id: 2, body: 'r1', in_reply_to_id: 1 },
      { id: 3, body: 'r2', in_reply_to_id: 2 },
      { id: 4, body: 'r3', inReplyToId: 1 },
      { id: 99, body: 'other', in_reply_to_id: 50 },
    ];
    const replies = collectThreadReplyComments(1, all);
    expect(replies.map((r) => r.id).sort()).toEqual([2, 3, 4]);
  });
});

describe('listReviewThreadFocusUnits / stepReviewThreadFocusUnit', () => {
  const replies = [{ id: 2 }, { id: 3 }, { id: '4' }];

  test('lists root then replies', () => {
    const u = listReviewThreadFocusUnits(1, replies);
    expect(u.map((x) => x.id)).toEqual(['1', '2', '3', '4']);
    expect(u[0].role).toBe('root');
    expect(u[1].role).toBe('reply');
  });

  test('step wraps within multi-unit thread', () => {
    const u = listReviewThreadFocusUnits(10, [{ id: 11 }, { id: 12 }]);
    expect(stepReviewThreadFocusUnit(u, 10, 1)?.id).toBe('11');
    expect(stepReviewThreadFocusUnit(u, 11, 1)?.id).toBe('12');
    expect(stepReviewThreadFocusUnit(u, 12, 1)?.id).toBe('10');
    expect(stepReviewThreadFocusUnit(u, 10, -1)?.id).toBe('12');
  });

  test('single-unit thread → no step', () => {
    const u = listReviewThreadFocusUnits(5, []);
    expect(u).toHaveLength(1);
    expect(stepReviewThreadFocusUnit(u, 5, 1)).toBe(null);
  });

  test('seed down skips to first reply when current missing', () => {
    const u = listReviewThreadFocusUnits(1, [{ id: 2 }]);
    // current unknown → down prefers first reply
    expect(stepReviewThreadFocusUnit(u, null, 1)?.id).toBe('2');
  });
});

describe('shouldShowThreadOptHints (root-only)', () => {
  test('inactive thread → no hints', () => {
    expect(shouldShowThreadOptHints({ contextActive: false, isRoot: true })).toBe(
      false
    );
  });
  test('active root → hints', () => {
    expect(shouldShowThreadOptHints({ contextActive: true, isRoot: true })).toBe(
      true
    );
  });
  test('active reply → no Opt badges', () => {
    expect(
      shouldShowThreadOptHints({ contextActive: true, isRoot: false })
    ).toBe(false);
  });
});

describe('CONTEXT_THREAD_SHORTCUT comment is ⌥I', () => {
  test('constants', () => {
    expect(CONTEXT_THREAD_SHORTCUT.comment.key).toBe('i');
    expect(CONTEXT_THREAD_SHORTCUT.comment.code).toBe('KeyI');
    expect(CONTEXT_THREAD_SHORTCUT.comment.labelMac).toBe('⌥I');
    expect(CONTEXT_THREAD_SHORTCUT.comment.chord).toBe('opt+i');
    // Composer submit stays ⌥C
    expect(COMPOSER_CONTEXT_SHORTCUT.submit.key).toBe('c');
    expect(COMPOSER_CONTEXT_SHORTCUT.submit.labelMac).toBe('⌥C');
  });

  test('resolveModalShortcutAction: thread focus ⌥I → contextThreadComment', () => {
    const act = resolveModalShortcutAction({
      alt: true,
      shift: false,
      mod: false,
      ctrl: false,
      key: 'i',
      code: 'KeyI',
      layoutMode: 'diff',
      contextThreadActive: true,
      diffThreadFocused: true,
      editableTarget: false,
      composerFocused: false,
    });
    expect(act).toBe('contextThreadComment');
  });

  test('resolveModalShortcutAction: thread focus ⌥C without composer → not comment', () => {
    const act = resolveModalShortcutAction({
      alt: true,
      shift: false,
      mod: false,
      ctrl: false,
      key: 'c',
      code: 'KeyC',
      layoutMode: 'diff',
      contextThreadActive: true,
      diffThreadFocused: true,
      editableTarget: false,
      composerFocused: false,
    });
    // ⌥C is no longer thread-comment; may be null or another peer
    expect(act).not.toBe('contextThreadComment');
  });

  test('↑/↓ with multiReplyThreadFocused → stepThreadReply*', () => {
    const up = resolveModalShortcutAction({
      alt: false,
      shift: false,
      mod: false,
      key: 'ArrowUp',
      code: 'ArrowUp',
      layoutMode: 'diff',
      multiReplyThreadFocused: true,
      editableTarget: false,
      contextThreadActive: true,
      diffThreadFocused: true,
    });
    const down = resolveModalShortcutAction({
      alt: false,
      shift: false,
      mod: false,
      key: 'ArrowDown',
      code: 'ArrowDown',
      layoutMode: 'diff',
      multiReplyThreadFocused: true,
      editableTarget: false,
      contextThreadActive: true,
      diffThreadFocused: true,
    });
    expect(up).toBe('stepThreadReplyPrev');
    expect(down).toBe('stepThreadReplyNext');
  });

  test('↑/↓ without multi-reply → Diff line selection (not reply step)', () => {
    const up = resolveModalShortcutAction({
      alt: false,
      shift: false,
      mod: false,
      key: 'ArrowUp',
      code: 'ArrowUp',
      layoutMode: 'diff',
      multiReplyThreadFocused: false,
      editableTarget: false,
      contextThreadActive: true,
      diffThreadFocused: true,
    });
    expect(up).toBe('moveSelectionUp');
  });
});

describe('monitor / palette labels match ⌥I for contextThreadComment', () => {
  test('buildShortcutMonitorFire uses ⌥I', () => {
    const mon =
      require('../src/modal/lib/shortcut-monitor') as typeof import('../src/modal/lib/shortcut-monitor');
    const fire = mon.buildShortcutMonitorFire('contextThreadComment', true);
    expect(fire.shortcut).toMatch(/⌥I|Alt\+I/i);
    expect(fire.shortcut).not.toMatch(/⌥C|Alt\+C/);
  });

  test('static palette/help/monitor source uses opt+i / ⌥I', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const root = path.join(__dirname, '..');
    const build = fs.readFileSync(
      path.join(root, 'src/modal/lib/command-palette-build.ts'),
      'utf8'
    );
    const help = fs.readFileSync(
      path.join(root, 'src/modal/lib/command-palette-help.ts'),
      'utf8'
    );
    const mon = fs.readFileSync(
      path.join(root, 'src/modal/lib/shortcut-monitor.ts'),
      'utf8'
    );
    expect(build).toMatch(
      /context-thread-comment[\s\S]{0,200}shortcut:\s*'opt\+i'/
    );
    expect(help).toMatch(
      /context-thread-comment[\s\S]{0,120}shortcut:\s*'opt\+i'/
    );
    expect(mon).toMatch(
      /contextThreadComment:\s*\{[\s\S]*?labelMac:\s*'⌥I'/
    );
    // No stale opt+c for the same action id in palette build
    expect(build).not.toMatch(
      /context-thread-comment[\s\S]{0,80}shortcut:\s*'opt\+c'/
    );
  });
});
