/** Regression gate for Conversation ⌥J/K parity with Diff file key-hold. */
import { describe, expect, test } from '@rstest/core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');
const read = (rel: string) => readFileSync(resolve(root, rel), 'utf8');

describe('Conversation key-hold architecture', () => {
  test('paints one adjacent leaf focus per frame without rebuilding mounted rows', () => {
    const shell = read('src/modal/app/PrModalShell.tsx');
    const store = read('src/modal/store/modal-store.ts');
    const list = read(
      'src/modal/views/conversation/VirtualConversationList.tsx'
    );
    const focus = read('src/modal/components/common/ConversationKbFocus.tsx');

    expect(shell).toMatch(
      /pendingConversationNavDeltaRef\.current = delta < 0 \? -1 : 1;[\s\S]*requestAnimationFrame/
    );
    expect(shell).toMatch(/requestConversationNav\(next\.anchor, true\)/);
    expect(store).toMatch(/focusImmediately \? next : null/);
    expect(list).toMatch(/const VirtualConversationRow = memo/);
    expect(focus).toMatch(/useLayoutEffect\(\(\) => \{[\s\S]*onFocusThread\(id\)/);
  });
});
