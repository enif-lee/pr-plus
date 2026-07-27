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

  test('all maintainable source parts stay under 1500 lines', () => {
    const dirs = [
      'src/host/parts',
      'src/fetch/parts',
      'src/modal/styles/parts',
      'src/modal/app/pr-modal/parts',
      'src/modal/views/conversation/parts',
      'src/content-bridge/parts',
      'src/background/parts',
    ];
    const overs: string[] = [];
    const all: string[] = [];
    for (const d of dirs) {
      const full = path.join(root, d);
      if (!fs.existsSync(full)) continue;
      for (const f of fs.readdirSync(full)) {
        if (!/\.(js|css|ts|tsx)$/.test(f)) continue;
        const rel = path.join(d, f);
        const n = lineCount(rel);
        all.push(`${rel}:${n}`);
        if (n > 1500) overs.push(`${rel}:${n}`);
      }
    }
    console.log('parts:', all.length, 'overs:', overs.join(', ') || 'none');
    expect(all.length).toBeGreaterThan(20);
    expect(overs).toEqual([]);
  });

  test('PrModalApp entry is thin; impl generated from parts', () => {
    const entry = read('src/modal/app/PrModalApp.tsx');
    expect(entry.split(/\n/).length).toBeLessThan(40);
    expect(entry).toMatch(/PrModalApp.generated|pr-modal\/parts/);
    expect(fs.existsSync(path.join(root, 'src/modal/app/PrModalApp.generated.tsx'))).toBe(true);
  });

  test('ConversationView maintainable parts under 1500 lines', () => {
    const dir = path.join(root, 'src/modal/views/conversation/parts');
    expect(fs.existsSync(dir)).toBe(true);
    for (const f of fs.readdirSync(dir)) {
      if (!/\.(tsx|ts)$/.test(f)) continue;
      expect(lineCount(path.join('src/modal/views/conversation/parts', f))).toBeLessThanOrEqual(1500);
    }
    expect(read('src/modal/views/conversation/ConversationView.tsx').slice(0, 300)).toMatch(/AUTO-ASSEMBLED|parts/);
  });

  test('generated/assembled runtime artifacts are marked', () => {
    const assembled = [
      'src/modal/app/PrModalApp.generated.tsx',
      'src/pr-modal-host.js',
      'src/fetch-pulls.js',
      'src/content-bridge.js',
      'src/background.ts',
    ];
    for (const f of assembled) {
      if (!fs.existsSync(path.join(root, f))) continue;
      const head = read(f).slice(0, 500);
      expect(head).toMatch(/AUTO-ASSEMBLED|AUTO-GENERATED|@ts-nocheck|parts/);
    }
    // Thin entry points stay small
    expect(lineCount('src/modal/app/PrModalApp.tsx')).toBeLessThan(30);
  });
});
