/**
 * rstest — auto-refresh activity gate (modal + full-page embed).
 */
import { describe, expect, test } from '@rstest/core';
import {
  AUTO_REFRESH_IDLE_MS,
  canAutoRefresh,
  headProbeIndicatesStale,
  nextActionAt,
  prProbeIndicatesStale,
} from '../src/modal/lib/auto-refresh';

describe('canAutoRefresh', () => {
  const base = {
    hostEnabled: true,
    surfaceOpen: true,
    owner: 'o',
    repo: 'r',
    number: 1,
    visibilityState: 'visible',
    lastActionAt: 1_000_000,
    now: 1_000_000 + 60_000,
    loadBusy: false,
  };

  test('allows when visible, open, and recently active', () => {
    expect(canAutoRefresh(base)).toBe(true);
  });

  test('blocks when tab is hidden', () => {
    expect(canAutoRefresh({ ...base, visibilityState: 'hidden' })).toBe(false);
  });

  test('blocks when surface closed (modal and embed both use surfaceOpen)', () => {
    expect(canAutoRefresh({ ...base, surfaceOpen: false })).toBe(false);
  });

  test('blocks when idle longer than 10 minutes', () => {
    expect(
      canAutoRefresh({
        ...base,
        now: base.lastActionAt! + AUTO_REFRESH_IDLE_MS + 1,
      })
    ).toBe(false);
  });

  test('allows at exactly idle boundary', () => {
    expect(
      canAutoRefresh({
        ...base,
        now: base.lastActionAt! + AUTO_REFRESH_IDLE_MS,
      })
    ).toBe(true);
  });

  test('blocks while load/refresh busy', () => {
    expect(canAutoRefresh({ ...base, loadBusy: true })).toBe(false);
  });

  test('blocks without PR identity', () => {
    expect(canAutoRefresh({ ...base, owner: '' })).toBe(false);
    expect(canAutoRefresh({ ...base, number: 0 })).toBe(false);
  });

  test('blocks when host disabled', () => {
    expect(canAutoRefresh({ ...base, hostEnabled: false })).toBe(false);
  });
});

describe('nextActionAt', () => {
  test('force always advances', () => {
    expect(nextActionAt(100, 150, { force: true })).toBe(150);
  });

  test('throttles rapid bumps', () => {
    expect(nextActionAt(1000, 1500, { throttleMs: 1000 })).toBe(1000);
    expect(nextActionAt(1000, 2000, { throttleMs: 1000 })).toBe(2000);
  });
});

describe('headProbeIndicatesStale', () => {
  test('true when head sha differs', () => {
    expect(headProbeIndicatesStale('aaa', 'bbb')).toBe(true);
    expect(headProbeIndicatesStale('AAA', 'aaa')).toBe(false);
  });

  test('false when either side missing', () => {
    expect(headProbeIndicatesStale('', 'bbb')).toBe(false);
    expect(headProbeIndicatesStale('aaa', null)).toBe(false);
  });
});

describe('prProbeIndicatesStale', () => {
  test('draft flip without head change triggers revalidate', () => {
    expect(
      prProbeIndicatesStale(
        { headSha: 'abc', draft: true, state: 'open' },
        { headSha: 'abc', draft: false, state: 'open' }
      )
    ).toBe(true);
  });

  test('state closed without head change triggers revalidate', () => {
    expect(
      prProbeIndicatesStale(
        { headSha: 'abc', draft: false, state: 'open' },
        { headSha: 'abc', draft: false, state: 'closed' }
      )
    ).toBe(true);
  });
});
