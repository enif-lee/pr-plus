/**
 * Wiring: shipped pure + host gate location auto-open with once-per-PR latch.
 * Reads generated artifacts (not re-implemented policy).
 */
import { describe, expect, test } from '@rstest/core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  prEmbedAutoOpenKey,
  resolveEmbedAutoOpen,
} from '../src/modal/lib/page-embed';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('embed auto-open once wiring (shipped)', () => {
  test('pure page-embed.js exports resolveEmbedAutoOpen + prEmbedAutoOpenKey', () => {
    const pure = fs.readFileSync(
      path.join(root, 'src/modal/pure/page-embed.js'),
      'utf8'
    );
    expect(pure).toMatch(/function prEmbedAutoOpenKey|prEmbedAutoOpenKey\s*=/);
    expect(pure).toMatch(/function resolveEmbedAutoOpen|resolveEmbedAutoOpen\s*=/);
    expect(pure).toMatch(/already-evaluated/);
    expect(pure).toMatch(/first-entry/);
  });

  test('pr-modal-host.js latches autoOpenEvaluatedPrKey and force on pref flip', () => {
    const host = fs.readFileSync(
      path.join(root, 'src/pr-modal-host.js'),
      'utf8'
    );
    expect(host).toMatch(/autoOpenEvaluatedPrKey/);
    expect(host).toMatch(/resolveEmbedAutoOpen/);
    expect(host).toMatch(/prEmbedAutoOpenKey/);
    // Pref false→true must force open past the latch
    expect(host).toMatch(/tryEmbedFromLocation\(\s*\{\s*force:\s*true\s*\}\s*\)/);
    // Leaving PR clears latch
    expect(host).toMatch(/autoOpenEvaluatedPrKey\s*=\s*null/);
  });

  test('shipped pure decision matches lib import for same-PR re-eval', () => {
    // Drive real pure API shape the host uses via PRModalPageEmbed
    const key = prEmbedAutoOpenKey('enif-lee', 'pr-plus', 7);
    expect(key).toBe('enif-lee/pr-plus#7');
    const first = resolveEmbedAutoOpen({
      prKey: key,
      lastEvaluatedPrKey: null,
      autoOpenEmbed: true,
    });
    const second = resolveEmbedAutoOpen({
      prKey: key,
      lastEvaluatedPrKey: first.nextEvaluatedKey,
      autoOpenEmbed: true,
    });
    expect(first.shouldOpen).toBe(true);
    expect(second.shouldOpen).toBe(false);
    expect(second.reason).toBe('already-evaluated');
  });
});
