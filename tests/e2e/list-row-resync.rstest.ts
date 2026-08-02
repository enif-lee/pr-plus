/**
 * E2E group: list-row resync (label write-through)
 * Run alone: npm run test:e2e -- list-row
 *         or: rstest run -c rstest.e2e.config.ts list-row
 */
import { registerE2eFeature } from './lib/e2e-register';
import { getSteps } from './list-row-resync.mjs';

registerE2eFeature({
  title: 'e2e / list-row-resync',
  steps: getSteps(),
  timeoutMs: 180_000,
});
