import { defineConfig } from '@rstest/core';
import path from 'node:path';

/**
 * Rstest (Rspack-powered) for pure domain logic + architecture gates.
 * Prefer importing shipped TypeScript modules under src/modal/lib.
 */
export default defineConfig({
  testEnvironment: 'node',
  include: [
    'tests/**/*.rstest.ts',
    'tests/**/*.rstest.tsx',
    'src/**/*.{test,spec}.{ts,tsx}',
  ],
  exclude: [
    '**/node_modules/**',
    '**/dist/**',
    'src/modal/dist/**',
    // Agent-browser e2e lives under tests/e2e and uses rstest.e2e.config.ts
    // (npm run test:e2e). Never part of unit / npm test / npm run check.
    'tests/e2e/**',
    '**/*.e2e.rstest.ts',
  ],
  // Match modal path aliases used by the app
  resolve: {
    alias: {
      '@modal': path.resolve(__dirname, 'src/modal'),
      '@lib': path.resolve(__dirname, 'src/modal/lib'),
      '@common': path.resolve(__dirname, 'src/modal/components/common'),
    },
  },
  source: {
    // Allow requiring .ts pure modules from tests
    include: [/src\//, /tests\//],
  },
});
