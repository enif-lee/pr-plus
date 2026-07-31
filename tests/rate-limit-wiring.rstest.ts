/**
 * Structural wiring: popup toggle/bars, SW rate-limit messages, fetch gate.
 */
import { describe, expect, test } from '@rstest/core';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

describe('rate-limit wiring', () => {
  test('storage has pluginEnabled + rateLimitState APIs', () => {
    const st = read('src/storage.ts');
    expect(st).toMatch(/pluginEnabled:\s*true/);
    expect(st).toMatch(/RATE_LIMIT_KEY/);
    expect(st).toMatch(/function getRateLimitState/);
    expect(st).toMatch(/function setRateLimitState/);
  });

  test('SW observes responses and short-circuits when blocked', () => {
    const sw = read('src/background/sw-api.ts');
    expect(sw).toMatch(/assertGithubRequestAllowed/);
    expect(sw).toMatch(/noteGithubResponse/);
    expect(sw).toMatch(/wrapFetchWithRateLimit/);
    expect(sw).toMatch(/RATE_LIMIT_GET/);
    expect(sw).toMatch(/RATE_LIMIT_CHANGED/);
    expect(sw).toMatch(/status === 429/);
    expect(sw).toMatch(/pluginEnabled:\s*false/);
  });

  test('fetchImpl is always rate-limit wrapped (no bare globalThis.fetch for GitHub)', () => {
    const sw = read('src/background/sw-api.ts');
    // fetchImpl must return wrapFetchWithRateLimit(...)
    expect(sw).toMatch(
      /function fetchImpl\(\)\s*\{\s*return wrapFetchWithRateLimit\(rawBrowserFetch\(\)\)/
    );
    // Innermost raw fetch only via rawBrowserFetch helper
    expect(sw).toMatch(/function rawBrowserFetch\(\)/);
    // Must not re-export raw globalThis.fetch as fetchImpl body alone
    expect(sw).not.toMatch(
      /function fetchImpl\(\)\s*\{\s*return globalThis\.fetch\.bind\(globalThis\)/
    );
    // Mutation / GQL handlers still call fetchImpl() — which is now gated
    expect(sw).toMatch(/MARK_FILE_VIEWED/);
    expect(sw).toMatch(/POST_ISSUE_COMMENT/);
    expect(sw).toMatch(/fetchImpl\(\)/);
  });

  test('shipped background.bundle.js uses wrapFetchWithRateLimit for fetchImpl', () => {
    const bundle = read('src/background.bundle.js');
    expect(bundle).toMatch(/wrapFetchWithRateLimit/);
    expect(bundle).toMatch(/function fetchImpl\(\)/);
    // Bundle must not define fetchImpl as bare bind of globalThis.fetch
    expect(bundle).not.toMatch(
      /function fetchImpl\(\)\s*\{\s*return globalThis\.fetch\.bind\(globalThis\)/
    );
    expect(bundle).toMatch(/assertGithubRequestAllowed/);
    expect(bundle).toMatch(/PR_TREE_RATE_LIMIT_GET/);
  });

  test('popup has enable toggle + core/graphql/search bars', () => {
    const html = read('src/popup.html');
    expect(html).toMatch(/pref-plugin-enabled/);
    expect(html).toMatch(/data-rl="core"/);
    expect(html).toMatch(/data-rl="graphql"/);
    expect(html).toMatch(/data-rl="search"/);
    expect(html).toMatch(/rate-limit-bars/);
    const ts = read('src/popup.ts');
    expect(ts).toMatch(/renderRateLimitState/);
    expect(ts).toMatch(/pluginEnabled/);
    expect(ts).toMatch(/PR_TREE_RATE_LIMIT_GET/);
  });

  test('content respects pluginEnabled', () => {
    const c = read('src/content.ts');
    expect(c).toMatch(/pluginAllowed/);
    expect(c).toMatch(/pluginEnabled/);
    expect(c).toMatch(/PR_TREE_RATE_LIMIT_CHANGED|PR_TREE_PREFS_CHANGED/);
  });

  test('pure rate-limit module is built', () => {
    const pure = read('scripts/build-pure.mjs');
    expect(pure).toMatch(/'rate-limit'/);
    const sw = read('scripts/build-sw.mjs');
    expect(sw).toMatch(/rate-limit\.js/);
  });
});
