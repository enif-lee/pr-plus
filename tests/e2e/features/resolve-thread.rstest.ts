/**
 * E2E: Resolve conversation button (empty reply click + mutation).
 *
 *   rstest run -c rstest.e2e.config.ts resolve-thread
 */
import { registerE2eFeature } from '../lib/e2e-register';
import { getSteps } from './resolve-thread.mjs';

registerE2eFeature({
  title: 'e2e / resolve-thread',
  steps: getSteps(),
  timeoutMs: 120_000,
});
