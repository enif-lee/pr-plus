#!/usr/bin/env node
/**
 * Legacy entry — prefer `npm run test:e2e` (rstest).
 * Spawns rstest with the e2e config so old scripts keep working.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const r = spawnSync(
  'npx',
  ['rstest', 'run', '-c', 'rstest.e2e.config.ts', ...args],
  {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  }
);
process.exit(r.status ?? 1);
