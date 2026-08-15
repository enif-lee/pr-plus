/**
 * E2e harness soft-reset + poll budget gates (no browser).
 * Proves shipped helpers: single-nav soft-reset plan, tighter wait defaults.
 */
import { describe, expect, test } from '@rstest/core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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

const root = resolve(__dirname, '..');
const read = (rel: string) => readFileSync(resolve(root, rel), 'utf8');

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

describe('soft-reset / waitNetwork speed contracts (source)', () => {
  test('softResetBrowser prefers in-place clear; open only off-origin or IDB fail', () => {
    const session = read('tests/e2e/lib/session.mjs');
    expect(session).toMatch(/softResetNeedsGithubOpen\(host\)/);
    // Must not force-navigate every PR page; recover open only after IDB fail.
    expect(session).toMatch(/IDB clear failed in-place/);
    expect(session).not.toMatch(/onPullPage/);
    expect(session).toMatch(/clearPrPlusIdb\(\)/);
  });

  test('waitNetwork short-circuits when document already complete', () => {
    const ab = read('tests/e2e/lib/ab.mjs');
    expect(ab).toMatch(/document\.readyState/);
    expect(ab).toMatch(/ready === 'complete'/);
    // CLI load wait budget must stay short (not 12–20s burn after load).
    expect(ab).toMatch(/timeoutMs:\s*5_000/);
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
