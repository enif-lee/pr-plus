/**
 * Builders fail closed: no raw-TS emit, no stale SW concat, packager allowlist.
 */
import { describe, expect, test } from '@rstest/core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  assembleTsParts,
  hasTypeAnnotationLeak,
} from '../scripts/assemble-ts-parts.mjs';
import { assertSwInputsFresh } from '../scripts/build-sw.mjs';
import {
  REQUIRED_ARTIFACTS,
  shouldCopyPackagedPath,
} from '../scripts/package-extension.mjs';

const root = path.join(__dirname, '..');

describe('assembleTsParts fail-closed', () => {
  test('hasTypeAnnotationLeak detects typed function params', () => {
    expect(hasTypeAnnotationLeak('function foo(x: any) { return x; }')).toBe(
      true
    );
    expect(hasTypeAnnotationLeak('function foo(x) { return x; }')).toBe(false);
  });

  test('transform failure does not write type-annotated source', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prp-assemble-'));
    const outFile = path.join(dir, 'out.js');
    fs.writeFileSync(
      path.join(dir, '01-bad.ts'),
      'export function boom(x: string): string {\n  return x.\n}\n'
    );
    await expect(
      assembleTsParts({
        partsDir: dir,
        outFile,
        partsOrder: ['01-bad.ts'],
        banner: '/* test */',
      })
    ).rejects.toThrow(/transform failed|assembleTsParts/i);
    if (fs.existsSync(outFile)) {
      const body = fs.readFileSync(outFile, 'utf8');
      expect(body).not.toMatch(/export function boom\(x: string\)/);
    }
  });
});

describe('build:sw stale inputs', () => {
  test('missing fetch-pulls.js is non-zero / throws', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prp-sw-'));
    expect(() => assertSwInputsFresh(dir)).toThrow(/fetch-pulls|build:sw/i);
  });

  test('newer fetch SoT than fetch-pulls.js throws', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prp-sw-stale-'));
    fs.mkdirSync(path.join(dir, 'src/fetch'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'src/modal/lib'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'src/modal/pure'), { recursive: true });
    const fetchJs = path.join(dir, 'src/fetch-pulls.js');
    fs.writeFileSync(fetchJs, '/* old */\n');
    fs.writeFileSync(path.join(dir, 'src/fetch/newer.ts'), 'export const x = 1;\n');
    const past = new Date(Date.now() - 120_000);
    fs.utimesSync(fetchJs, past, past);
    for (const [pureName, libName] of [
      ['collapse.js', 'collapse.ts'],
      ['comments-page.js', 'comments-page.ts'],
      ['review-threads.js', 'review-threads.ts'],
      ['pending-review.js', 'pending-review.ts'],
      ['pr-edit-api.js', 'pr-edit-api.ts'],
      ['checks.js', 'checks.ts'],
      ['rate-limit.js', 'rate-limit.ts'],
      ['graphql-cost-log.js', 'graphql-cost-log.ts'],
      ['conversation-timeline.js', 'conversation-timeline.ts'],
    ] as const) {
      fs.writeFileSync(path.join(dir, 'src/modal/pure', pureName), '/* pure */\n');
      fs.writeFileSync(path.join(dir, 'src/modal/lib', libName), 'export {}\n');
    }
    expect(() => assertSwInputsFresh(dir)).toThrow(/stale fetch-pulls/i);
  });
});

describe('packager allowlist', () => {
  test('required artifacts include the manifest service worker', () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(root, 'manifest.json'), 'utf8')
    );
    expect(REQUIRED_ARTIFACTS).toContain('src/background.sw.js');
    expect(REQUIRED_ARTIFACTS).toContain(manifest.background.service_worker);
    expect(REQUIRED_ARTIFACTS).not.toContain('src/background.bundle.js');
  });

  test('TypeScript and host/parts are not packaged', () => {
    expect(shouldCopyPackagedPath('src/fetch/fetch-api.ts')).toBe(false);
    expect(shouldCopyPackagedPath('src/modal/app/PrModalApp.impl.tsx')).toBe(
      false
    );
    expect(shouldCopyPackagedPath('src/host/parts/01-detail-embed.js')).toBe(
      false
    );
    expect(shouldCopyPackagedPath('src/host/modules/props-build.ts')).toBe(
      false
    );
    expect(shouldCopyPackagedPath('src/background.sw.js')).toBe(true);
    expect(shouldCopyPackagedPath('src/modal/pure/i18n.js')).toBe(true);
    expect(shouldCopyPackagedPath('PRIVACY.md')).toBe(true);
  });
});
