/**
 * E2e harness soft-reset + poll budget gates (no browser).
 * Proves shipped helpers: single-nav soft-reset plan, tighter wait defaults.
 */
import { describe, expect, test } from '@rstest/core';
import { softResetNeedsGithubOpen } from '../tests/e2e/lib/session.mjs';
import {
  WAIT_FOR_DEFAULT_INTERVAL_MS,
  WAIT_FOR_DEFAULT_TIMEOUT_MS,
  sleepSync,
} from '../tests/e2e/lib/ab.mjs';
import {
  DETAIL_READY_INTERVAL_MS,
  DETAIL_READY_TIMEOUT_MS,
} from '../tests/e2e/lib/harness.mjs';

describe('softResetNeedsGithubOpen (shipped pure)', () => {
  test('github.com host does not need open', () => {
    expect(softResetNeedsGithubOpen('github.com')).toBe(false);
    expect(softResetNeedsGithubOpen('gist.github.com')).toBe(false);
  });

  test('empty / other origins need open', () => {
    expect(softResetNeedsGithubOpen('')).toBe(true);
    expect(softResetNeedsGithubOpen(null)).toBe(true);
    expect(softResetNeedsGithubOpen('example.com')).toBe(true);
    expect(softResetNeedsGithubOpen('about:blank')).toBe(true);
  });
});

describe('wait poll budgets (shipped)', () => {
  test('waitFor default interval is tight (≤120ms)', () => {
    expect(WAIT_FOR_DEFAULT_INTERVAL_MS).toBeLessThanOrEqual(120);
    expect(WAIT_FOR_DEFAULT_INTERVAL_MS).toBeGreaterThanOrEqual(50);
  });

  test('detail/shell ready interval tight; timeout still allows cold GH', () => {
    expect(DETAIL_READY_INTERVAL_MS).toBeLessThanOrEqual(120);
    expect(DETAIL_READY_TIMEOUT_MS).toBeGreaterThanOrEqual(20_000);
    expect(DETAIL_READY_TIMEOUT_MS).toBeLessThanOrEqual(45_000);
    expect(WAIT_FOR_DEFAULT_TIMEOUT_MS).toBeGreaterThanOrEqual(15_000);
  });

  test('sleepSync is real local sleep (not no-op)', () => {
    const t0 = Date.now();
    sleepSync(40);
    const dt = Date.now() - t0;
    expect(dt).toBeGreaterThanOrEqual(30);
    expect(dt).toBeLessThan(200);
  });
});
