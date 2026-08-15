#!/usr/bin/env node
/**
 * Feature groups only via rstest.
 *   node tests/e2e/features/run.mjs
 *   node tests/e2e/features/run.mjs selection
 *   node tests/e2e/features/run.mjs smoke diff-ui
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..'
);
const filters = process.argv.slice(2).filter((a) => a !== '--list');

if (process.argv.includes('--list')) {
  console.log(
    [
      'smoke',
      'conversation-nav',
      'diff-nav',
      'selection',
      'diff-ui',
      'merged-chrome',
    ].join('\n')
  );
  process.exit(0);
}

const r = spawnSync(
  'npx',
  [
    'rstest',
    'run',
    '-c',
    'rstest.e2e.config.ts',
    'tests/e2e/features',
    ...filters,
  ],
  {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  }
);
process.exit(r.status ?? 1);
