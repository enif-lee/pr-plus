#!/usr/bin/env node
/**
 * Run all local e2e scenarios (features + perf).
 * Excluded from `npm test` — use `npm run test:e2e`.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const scenarios = [
  'tests/e2e/feature-scenario.mjs',
  'tests/e2e/perf-shortcut-loop.mjs',
];

let failed = 0;
for (const rel of scenarios) {
  console.log(`\n######## ${rel} ########\n`);
  const r = spawnSync(process.execPath, [path.join(root, rel)], {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  });
  if (r.status !== 0) failed += 1;
}

if (failed) {
  console.error(`\ne2e: ${failed}/${scenarios.length} scenario(s) failed`);
  process.exit(1);
}
console.log(`\ne2e: ${scenarios.length} scenario(s) passed`);
