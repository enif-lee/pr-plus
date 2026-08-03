/**
 * Fetch feature-unit composition: entry re-exports domain modules and
 * fetchApi surface matches production attach keys.
 */
import { describe, expect, test } from '@rstest/core';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const root = resolve(__dirname, '..');
const fetchDir = resolve(root, 'src/fetch');

describe('fetch composition layout', () => {
  test('feature units exist and each is under 1000 lines', () => {
    const files = readdirSync(fetchDir).filter(
      (f) => f.endsWith('.ts') && f !== 'fetch-shims.d.ts'
    );
    expect(files).toContain('fetch-api.ts');
    expect(files).toContain('http.ts');
    expect(files).toContain('pulls.ts');
    expect(files).toContain('pr-detail.ts');
    expect(files.length).toBeGreaterThan(8);
    for (const f of files) {
      if (f === 'fetch-api.ts') continue; // composition entry may list re-exports
      const n = readFileSync(resolve(fetchDir, f), 'utf8').split(/\n/).length;
      expect(n, `${f} should be under 1000 lines`).toBeLessThan(1000);
    }
  });

  test('fetch-api entry re-exports feature units', () => {
    const entry = readFileSync(resolve(fetchDir, 'fetch-api.ts'), 'utf8');
    expect(entry).toMatch(/export \* from '\.\/http'/);
    expect(entry).toMatch(/export \* from '\.\/pulls'/);
    expect(entry).toMatch(/export const fetchApi/);
    expect(entry).toMatch(/PRTreeFetch/);
  });

  test('built fetch-pulls.js attaches full PRTreeFetch surface', () => {
    const built = resolve(root, 'src/fetch-pulls.js');
    expect(existsSync(built)).toBe(true);
    const code = readFileSync(built, 'utf8');
    const sandbox: any = {
      globalThis: {},
      module: { exports: {} },
      console,
      setTimeout,
      clearTimeout,
      fetch: async () => ({ ok: true, json: async () => ({}) }),
      performance: { now: () => 0 },
    };
    sandbox.globalThis = sandbox;
    vm.runInNewContext(code, sandbox, { filename: 'fetch-pulls.js' });
    const api = sandbox.globalThis.PRTreeFetch || sandbox.module.exports;
    for (const k of [
      'fetchPrDetail',
      'fetchOpenPulls',
      'resolveReviewThread',
      'setIssueLabels',
      'replyToReviewComment',
      'fetchReviewThreadsPage',
      'apiGraphql',
      'getGraphqlCostLog',
    ]) {
      expect(typeof api[k], k).toBe('function');
    }
    expect(Object.keys(api).length).toBeGreaterThanOrEqual(90);
  });

  test('pr-detail.ts imports normalizeApiCtx (no free ReferenceError in SW)', () => {
    const src = readFileSync(resolve(fetchDir, 'pr-detail.ts'), 'utf8');
    expect(src).toMatch(
      /import\s*\{[\s\S]*\bnormalizeApiCtx\b[\s\S]*\}\s*from\s*['"]\.\/http['"]/
    );
    expect(src).toMatch(
      /import\s*\{[\s\S]*\bgithubRestUrl\b[\s\S]*\}\s*from\s*['"]\.\/http['"]/
    );
    // Built bundle must define normalizeApiCtx before fetchPrDetail uses it
    const built = readFileSync(resolve(root, 'src/fetch-pulls.js'), 'utf8');
    const def = built.indexOf('function normalizeApiCtx');
    const use = built.indexOf('async function fetchPrDetail');
    expect(def).toBeGreaterThanOrEqual(0);
    expect(use).toBeGreaterThan(def);
  });
});
