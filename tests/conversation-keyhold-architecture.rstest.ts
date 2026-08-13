/** Regression gate for Conversation ⌥J/K parity with Diff file key-hold. */
import { describe, expect, test } from '@rstest/core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');
const read = (rel: string) => readFileSync(resolve(root, rel), 'utf8');
const readShell = () =>
  [
    'src/modal/app/PrModalShell.tsx',
    'src/modal/hooks/useDiffConversationNav.ts',
  ]
    .map((rel) => read(rel))
    .join('\n');

describe('Conversation key-hold architecture', () => {
  test('paints one adjacent leaf focus per frame without rebuilding mounted rows', () => {
    const shell = readShell();
    const store = read('src/modal/store/modal-store.ts');
    const list = read(
      'src/modal/views/conversation/VirtualConversationList.tsx'
    );
    const focus = read('src/modal/components/common/ConversationKbFocus.tsx');

    expect(shell).toMatch(
      /pendingConversationNavDeltaRef\.current = delta < 0 \? -1 : 1;[\s\S]*scheduleNavigationFrame/
    );
    expect(shell).toMatch(/requestConversationNav\(next\.anchor, true\)/);
    expect(store).toMatch(/focusImmediately \? next : null/);
    expect(list).toMatch(/const VirtualConversationRow = memo/);
    expect(focus).toMatch(/useLayoutEffect\(\(\) => \{[\s\S]*onFocusThread\(id\)/);
  });

  test('paints held in-thread reply steps per frame and clamps Conversation ends', () => {
    const shell = readShell();

    expect(shell).toMatch(
      /pendingThreadReplyDeltaRef\.current = delta < 0 \? -1 : 1;[\s\S]*scheduleNavigationFrame/
    );
    expect(shell).toMatch(
      /function scheduleNavigationFrame[\s\S]*setTimeout\(finish, 32\)[\s\S]*requestAnimationFrame\(finish\)/
    );
    expect(shell).toMatch(
      /if \(stepped\.exit\) \{[\s\S]*liveLayout === LAYOUT_DIFF[\s\S]*handoffThreadExitToSelection[\s\S]*return true;/
    );
    expect(shell).toMatch(
      /scrollConversationThreadUnitIntoView\(next\.id\)/
    );
  });
});
