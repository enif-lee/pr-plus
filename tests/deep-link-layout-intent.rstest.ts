/**
 * Unit tests for conversation deep-link layout ownership (consumable intent).
 * Imports the shipped pure helper — not a re-implementation.
 */
import { describe, expect, test } from '@rstest/core';
import {
  conversationDeepLinkApplyKey,
  decideConversationDeepLinkLayout,
  shouldAbandonConversationDeepLinkOnExpandDiff,
} from '../src/modal/lib/deep-link-layout-intent';
import fs from 'node:fs';
import path from 'node:path';

const KEY = '19:c:3746944073';

describe('decideConversationDeepLinkLayout', () => {
  test('noop when already applied or dismissed', () => {
    expect(
      decideConversationDeepLinkLayout({
        applyKey: KEY,
        liveLayout: 'centered',
        appliedKey: KEY,
      })
    ).toBe('noop');
    expect(
      decideConversationDeepLinkLayout({
        applyKey: KEY,
        liveLayout: 'diff',
        dismissedKey: KEY,
      })
    ).toBe('noop');
  });

  test('proceed on conversation layout (first or re-entry)', () => {
    expect(
      decideConversationDeepLinkLayout({
        applyKey: KEY,
        liveLayout: 'centered',
      })
    ).toBe('proceed');
    expect(
      decideConversationDeepLinkLayout({
        applyKey: KEY,
        liveLayout: 'centered',
        inFlightKey: KEY,
      })
    ).toBe('proceed');
  });

  test('first attempt while Diff is open leaves Diff once', () => {
    expect(
      decideConversationDeepLinkLayout({
        applyKey: KEY,
        liveLayout: 'diff',
      })
    ).toBe('force_leave_diff');
  });

  test('re-entry while Diff is open abandons (user layout wins)', () => {
    expect(
      decideConversationDeepLinkLayout({
        applyKey: KEY,
        liveLayout: 'diff',
        inFlightKey: KEY,
      })
    ).toBe('abandon');
    expect(
      decideConversationDeepLinkLayout({
        applyKey: KEY,
        liveLayout: 'diff',
        exhaustedKey: KEY,
      })
    ).toBe('abandon');
    expect(
      decideConversationDeepLinkLayout({
        applyKey: KEY,
        liveLayout: 'diff',
        convDeepLinkKey: KEY,
      })
    ).toBe('abandon');
  });
});

describe('shouldAbandonConversationDeepLinkOnExpandDiff', () => {
  test('abandons active conversation deep-link key', () => {
    expect(
      shouldAbandonConversationDeepLinkOnExpandDiff({
        convDeepLinkKey: KEY,
        routePage: 'conversation',
        position: 'c:1',
      })
    ).toBe(true);
  });

  test('abandons inbound conversation+position even before effect arms', () => {
    expect(
      shouldAbandonConversationDeepLinkOnExpandDiff({
        convDeepLinkKey: null,
        routePage: 'conversation',
        position: 'c:3746944073',
      })
    ).toBe(true);
  });

  test('does not abandon Diff-path deep-links (page=diff, no conv key)', () => {
    expect(
      shouldAbandonConversationDeepLinkOnExpandDiff({
        convDeepLinkKey: null,
        routePage: 'diff',
        position: 'c:99',
      })
    ).toBe(false);
    expect(
      shouldAbandonConversationDeepLinkOnExpandDiff({
        convDeepLinkKey: null,
        routePage: null,
        position: 'c:99',
      })
    ).toBe(false);
  });
});

describe('conversationDeepLinkApplyKey', () => {
  test('builds number:position key', () => {
    expect(conversationDeepLinkApplyKey(19, 'c:1')).toBe('19:c:1');
    expect(conversationDeepLinkApplyKey(null, 'c:1')).toBe(null);
    expect(conversationDeepLinkApplyKey(19, null)).toBe(null);
  });
});

describe('shell wires pure ownership into expandDiff + deep-link', () => {
  const app = fs.readFileSync(
    path.join(__dirname, '..', 'src/modal/app/PrModalShell.tsx'),
    'utf8'
  );

  test('imports and uses decideConversationDeepLinkLayout', () => {
    expect(app).toMatch(/decideConversationDeepLinkLayout/);
    expect(app).toMatch(/shouldAbandonConversationDeepLinkOnExpandDiff/);
    expect(app).toMatch(/from ['"]\.\.\/lib\/deep-link-layout-intent['"]/);
  });

  test('expandDiff abandons conversation deep-link; layoutMode not a restore restart dep', () => {
    const expandIdx = app.indexOf('function expandDiff');
    expect(expandIdx).toBeGreaterThan(0);
    const expandBlock = app.slice(expandIdx, expandIdx + 700);
    expect(expandBlock).toMatch(/abandonConversationPositionDeepLink\(\)/);

    // Position deep-link effect must not re-subscribe layoutMode as restart signal
    expect(app).toMatch(
      /Intentionally omit layoutMode:[\s\S]*?virtualRows\.length/
    );
  });
});
