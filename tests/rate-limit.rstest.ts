/**
 * Rate-limit pure helpers: header parse, 429 disable, request gate.
 */
import { describe, expect, test } from '@rstest/core';
import {
  classifyGithubUrl,
  clearExpiredRateDisables,
  disableUntilMsFrom429,
  emptyRateLimitState,
  parseRateLimitHeaders,
  rateLimitBarPercent,
  shouldAllowGithubRequest,
  snapshotFromGraphqlRateLimit,
  withRateLimit429,
  withRateLimitSnapshot,
} from '../src/modal/lib/rate-limit';

function headers(map: Record<string, string>) {
  return {
    get(name: string) {
      const key = Object.keys(map).find(
        (k) => k.toLowerCase() === name.toLowerCase()
      );
      return key ? map[key] : null;
    },
  };
}

describe('classifyGithubUrl', () => {
  test('classifies core / graphql / search', () => {
    expect(classifyGithubUrl('https://api.github.com/repos/o/r/pulls/1')).toBe(
      'core'
    );
    expect(classifyGithubUrl('https://api.github.com/graphql')).toBe('graphql');
    expect(
      classifyGithubUrl('https://api.github.com/search/issues?q=foo')
    ).toBe('search');
  });
});

describe('parseRateLimitHeaders', () => {
  test('reads core headers + used derivation', () => {
    const snap = parseRateLimitHeaders(
      headers({
        'x-ratelimit-limit': '5000',
        'x-ratelimit-remaining': '4990',
        'x-ratelimit-reset': '1700000000',
        'x-ratelimit-resource': 'core',
      }),
      { nowMs: 1_700_000_000_000 }
    );
    expect(snap).toBeTruthy();
    expect(snap!.resource).toBe('core');
    expect(snap!.limit).toBe(5000);
    expect(snap!.remaining).toBe(4990);
    expect(snap!.used).toBe(10);
    expect(snap!.reset).toBe(1700000000);
  });

  test('returns null when no rate headers', () => {
    expect(parseRateLimitHeaders(headers({ 'content-type': 'json' }))).toBe(
      null
    );
  });
});

describe('429 disable + gate', () => {
  test('disableUntilMsFrom429 prefers x-ratelimit-reset', () => {
    const now = 1_700_000_000_000;
    const until = disableUntilMsFrom429(
      headers({ 'x-ratelimit-reset': '1700000060' }),
      now
    );
    expect(until).toBe(1_700_000_060_000);
  });

  test('disableUntilMsFrom429 uses retry-after seconds', () => {
    const now = 1_000_000;
    expect(disableUntilMsFrom429(headers({ 'retry-after': '30' }), now)).toBe(
      1_000_000 + 30_000
    );
  });

  test('withRateLimit429 sets disabledUntil and snapshot', () => {
    const now = 1_700_000_000_000;
    const next = withRateLimit429(
      emptyRateLimitState(),
      'core',
      headers({
        'x-ratelimit-limit': '5000',
        'x-ratelimit-remaining': '0',
        'x-ratelimit-reset': '1700000100',
        'x-ratelimit-resource': 'core',
      }),
      now
    );
    expect(next.disabledUntil.core).toBe(1_700_000_100_000);
    expect(next.snapshots.core?.remaining).toBe(0);
  });

  test('shouldAllowGithubRequest denies when plugin disabled', () => {
    const g = shouldAllowGithubRequest({
      pluginEnabled: false,
      state: emptyRateLimitState(),
      resource: 'core',
      nowMs: Date.now(),
    });
    expect(g.allow).toBe(false);
    expect(g.reason).toBe('plugin-disabled');
  });

  test('shouldAllowGithubRequest denies while disabledUntil in future', () => {
    const now = 1_000_000;
    const state = withRateLimit429(
      emptyRateLimitState(),
      'graphql',
      headers({ 'x-ratelimit-reset': '2000', 'x-ratelimit-remaining': '0' }),
      now
    );
    const g = shouldAllowGithubRequest({
      pluginEnabled: true,
      state,
      resource: 'graphql',
      nowMs: now + 1000,
    });
    expect(g.allow).toBe(false);
    expect(g.reason).toBe('rate-disabled');
  });

  test('shouldAllowGithubRequest allows after clearExpired', () => {
    const now = 1_000_000;
    let state = withRateLimit429(
      emptyRateLimitState(),
      'search',
      headers({ 'x-ratelimit-reset': '1001', 'retry-after': '1' }),
      now
    );
    state = clearExpiredRateDisables(state, now + 5_000);
    const g = shouldAllowGithubRequest({
      pluginEnabled: true,
      state,
      resource: 'search',
      nowMs: now + 5_000,
    });
    expect(g.allow).toBe(true);
  });

  test('remaining-zero blocks until reset even without disabledUntil', () => {
    const now = 1_000_000;
    const state = withRateLimitSnapshot(emptyRateLimitState(), {
      resource: 'core',
      limit: 5000,
      remaining: 0,
      used: 5000,
      reset: 2000,
      updatedAt: now,
    });
    const g = shouldAllowGithubRequest({
      pluginEnabled: true,
      state,
      resource: 'core',
      nowMs: now,
    });
    expect(g.allow).toBe(false);
    expect(g.reason).toBe('remaining-zero');
  });
});

describe('bar + graphql body', () => {
  test('rateLimitBarPercent from remaining/limit', () => {
    expect(
      rateLimitBarPercent({
        resource: 'core',
        limit: 100,
        remaining: 25,
        used: 75,
        reset: null,
        updatedAt: 1,
      })
    ).toBe(25);
  });

  test('snapshotFromGraphqlRateLimit', () => {
    const snap = snapshotFromGraphqlRateLimit(
      {
        limit: 5000,
        remaining: 4000,
        used: 1000,
        resetAt: '2020-01-01T00:00:00.000Z',
      },
      1
    );
    expect(snap?.resource).toBe('graphql');
    expect(snap?.remaining).toBe(4000);
    expect(snap?.reset).toBe(Math.floor(Date.parse('2020-01-01T00:00:00.000Z') / 1000));
  });
});
