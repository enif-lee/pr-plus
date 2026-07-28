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
