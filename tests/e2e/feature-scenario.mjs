#!/usr/bin/env node
/**
 * Legacy monolith entry → rstest feature suite.
 * Prefer: npm run test:e2e:features
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const filter = (process.env.PRP_E2E_FEATURES || '')
  .split(/[,\s]+/)
  .map((s) => s.trim())
  .filter(Boolean);

const r = spawnSync(
  'npx',
  [
    'rstest',
    'run',
    '-c',
    'rstest.e2e.config.ts',
    'tests/e2e/features',
    ...filter,
  ],
  { cwd: root, stdio: 'inherit', env: process.env }
);
process.exit(r.status ?? 1);
