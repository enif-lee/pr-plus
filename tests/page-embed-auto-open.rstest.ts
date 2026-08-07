/**
 * Once-per-PR auto-open latch (location-driven embed open).
 * Imports shipped pure helpers from page-embed SoT.
 */
import { describe, expect, test } from '@rstest/core';
import {
  prEmbedAutoOpenKey,
  resolveEmbedAutoOpen,
} from '../src/modal/lib/page-embed';

describe('prEmbedAutoOpenKey', () => {
  test('normalizes owner/repo case and number', () => {
    expect(prEmbedAutoOpenKey('Enif-Lee', 'PR-Plus', 7)).toBe(
      'enif-lee/pr-plus#7'
    );
    expect(prEmbedAutoOpenKey('a', 'b', '13')).toBe('a/b#13');
  });

  test('null when invalid', () => {
    expect(prEmbedAutoOpenKey('', 'r', 1)).toBeNull();
    expect(prEmbedAutoOpenKey('o', '', 1)).toBeNull();
    expect(prEmbedAutoOpenKey('o', 'r', 0)).toBeNull();
    expect(prEmbedAutoOpenKey('o', 'r', NaN)).toBeNull();
  });
});

describe('resolveEmbedAutoOpen (once-per-PR latch)', () => {
  const prA = 'enif-lee/pr-plus#7';
  const prB = 'enif-lee/pr-plus#13';

  test('first entry with autoOpen on → may open and latch', () => {
    const d = resolveEmbedAutoOpen({
      prKey: prA,
      lastEvaluatedPrKey: null,
      autoOpenEmbed: true,
    });
    expect(d.shouldOpen).toBe(true);
    expect(d.nextEvaluatedKey).toBe(prA);
    expect(d.reason).toBe('first-entry');
  });

  test('second eval same PR (hash/tab only) → does not open again', () => {
    const d = resolveEmbedAutoOpen({
      prKey: prA,
      lastEvaluatedPrKey: prA,
      autoOpenEmbed: true,
    });
    expect(d.shouldOpen).toBe(false);
    expect(d.nextEvaluatedKey).toBe(prA);
    expect(d.reason).toBe('already-evaluated');
  });

  test('different PR key → open once for the new key', () => {
    const d = resolveEmbedAutoOpen({
      prKey: prB,
      lastEvaluatedPrKey: prA,
      autoOpenEmbed: true,
    });
    expect(d.shouldOpen).toBe(true);
    expect(d.nextEvaluatedKey).toBe(prB);
    expect(d.reason).toBe('first-entry');
  });

  test('autoOpenEmbed false → never open; still latches PR', () => {
    const d = resolveEmbedAutoOpen({
      prKey: prA,
      lastEvaluatedPrKey: null,
      autoOpenEmbed: false,
    });
    expect(d.shouldOpen).toBe(false);
    expect(d.nextEvaluatedKey).toBe(prA);
    expect(d.reason).toBe('auto-open-disabled');
  });

  test('force + autoOpen on → open even if already evaluated', () => {
    const d = resolveEmbedAutoOpen({
      prKey: prA,
      lastEvaluatedPrKey: prA,
      autoOpenEmbed: true,
      force: true,
    });
    expect(d.shouldOpen).toBe(true);
    expect(d.nextEvaluatedKey).toBe(prA);
    expect(d.reason).toBe('force');
  });

  test('force with autoOpen off → still closed', () => {
    // force only applies when pref is on (pref flip false→true)
    const d = resolveEmbedAutoOpen({
      prKey: prA,
      lastEvaluatedPrKey: prA,
      autoOpenEmbed: false,
      force: true,
    });
    expect(d.shouldOpen).toBe(false);
    expect(d.reason).toBe('auto-open-disabled');
  });

  test('leave PR page (null key) → clear latch', () => {
    const d = resolveEmbedAutoOpen({
      prKey: null,
      lastEvaluatedPrKey: prA,
      autoOpenEmbed: true,
    });
    expect(d.shouldOpen).toBe(false);
    expect(d.nextEvaluatedKey).toBeNull();
    expect(d.reason).toBe('not-pr-page');
  });

  test('simulate host session: open once, then hash change, then other PR', () => {
    let latch: string | null = null;
    const evalAt = (key: string | null, force = false) => {
      const d = resolveEmbedAutoOpen({
        prKey: key,
        lastEvaluatedPrKey: latch,
        autoOpenEmbed: true,
        force,
      });
      latch = d.nextEvaluatedKey;
      return d;
    };

    // First load conversation
    expect(evalAt(prA).shouldOpen).toBe(true);
    // Comment hash / files tab (same PR)
    expect(evalAt(prA).shouldOpen).toBe(false);
    expect(evalAt(prA).shouldOpen).toBe(false);
    // Soft-nav to another PR
    expect(evalAt(prB).shouldOpen).toBe(true);
    expect(evalAt(prB).shouldOpen).toBe(false);
    // Leave PR → /pulls
    expect(evalAt(null).shouldOpen).toBe(false);
    expect(latch).toBeNull();
    // Re-enter original PR after list
    expect(evalAt(prA).shouldOpen).toBe(true);
  });
});
