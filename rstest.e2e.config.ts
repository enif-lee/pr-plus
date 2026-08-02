import { defineConfig } from '@rstest/core';
import path from 'node:path';

/**
 * Agent-browser e2e suite (serial, long timeouts, shared browser session).
 *
 * NOT used by `npm test` / `npm run test:unit` (see rstest.config.ts exclude).
 * Run via: npm run test:e2e
 * Filters:  rstest run -c rstest.e2e.config.ts smoke
 *           rstest run -c rstest.e2e.config.ts selection
 *
 * Browser: globalSetup launches once; each suite soft-resets (tab + caches);
 * globalSetup return value tears down the session.
 */
export default defineConfig({
  testEnvironment: 'node',
  include: ['tests/e2e/**/*.rstest.ts'],
  exclude: ['**/node_modules/**', '**/dist/**'],
  pool: {
    type: 'forks',
    maxWorkers: 1,
  },
  maxConcurrency: 1,
  isolate: false,
  globalSetup: ['./tests/e2e/lib/global-setup.mjs'],
  testTimeout: 180_000,
  hookTimeout: 120_000,
  slowTestThreshold: 15_000,
  passWithNoTests: false,
  resolve: {
    alias: {
      '@modal': path.resolve(__dirname, 'src/modal'),
      '@lib': path.resolve(__dirname, 'src/modal/lib'),
      '@common': path.resolve(__dirname, 'src/modal/components/common'),
      '@e2e': path.resolve(__dirname, 'tests/e2e'),
    },
  },
  source: {
    include: [/src\//, /tests\//],
  },
});
