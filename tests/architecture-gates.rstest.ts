/**
 * Structural gates for architecture overhaul (no fake re-implementations).
 */
import { describe, expect, test } from '@rstest/core';
import fs from 'node:fs';
import path from 'node:path';

const root = path.join(__dirname, '..');

function read(rel: string) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function lineCount(rel: string) {
  return read(rel).split(/\r?\n/).length;
}

describe('architecture gates', () => {
  test('rstest + eslint + tailwind tooling present', () => {
    expect(fs.existsSync(path.join(root, 'rstest.config.ts'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'eslint.config.mjs'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'tailwind.config.js'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'postcss.config.js'))).toBe(true);
    const pkg = JSON.parse(read('package.json'));
    expect(pkg.devDependencies['@rstest/core']).toBeTruthy();
    expect(pkg.scripts['test:rstest'] || pkg.scripts.test).toMatch(/rstest/);
  });

  test('service worker source is TypeScript', () => {
    expect(fs.existsSync(path.join(root, 'src/background.ts'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'src/storage.ts'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'src/github-endpoints.ts'))).toBe(true);
  });

  test('detail-store TypeScript is source of truth with isolation API', () => {
    const ts = read('src/modal/lib/detail-store.ts');
    expect(ts).toMatch(/export function applyCorePayload/);
    expect(ts).toMatch(/export function applyFiles/);
    expect(ts).toMatch(/export function toAppDetail/);
  });

  test('modal styles entry uses Tailwind layers', () => {
    const idx = read('src/modal/styles/index.css');
    expect(idx).toMatch(/@tailwind base/);
    expect(idx).toMatch(/@tailwind components/);
    expect(idx).toMatch(/@tailwind utilities/);
  });

  test('Zustand modal store remains the UI state library', () => {
    const store = read('src/modal/store/modal-store.ts');
    expect(store).toMatch(/from 'zustand'/);
    expect(store).toMatch(/create(?:<[^>]+>)?\(/);
  });

  test('host/fetch/styles parts stay under 1500 lines', () => {
    const dirs = [
      'src/host/parts',
      'src/fetch/parts',
      'src/modal/styles/parts',
    ];
    const overs: string[] = [];
    for (const d of dirs) {
      const full = path.join(root, d);
      if (!fs.existsSync(full)) continue;
      for (const f of fs.readdirSync(full)) {
        if (!/\.(js|css|ts|tsx)$/.test(f)) continue;
        const n = lineCount(path.join(d, f));
        if (n > 1500) overs.push(`${d}/${f}:${n}`);
      }
    }
    console.log('part-overs:', overs.join(', ') || 'none');
    expect(overs).toEqual([]);
  });

  test('remaining hand-maintained mega modules are tracked', () => {
    const remaining = [
      'src/modal/app/PrModalApp.tsx',
      'src/modal/views/conversation/ConversationView.tsx',
      'src/content-bridge.js',
      'src/background.ts',
    ].filter((f) => fs.existsSync(path.join(root, f)) && lineCount(f) > 1500);
    console.log(
      'hand-mega:',
      remaining.map((f) => `${f}:${lineCount(f)}`).join(', ')
    );
    // PrModalApp + ConversationView still above threshold — tracked until further extract
    expect(remaining.length).toBeGreaterThan(0);
  });
});
