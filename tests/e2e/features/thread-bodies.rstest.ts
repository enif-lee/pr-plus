/**
 * E2E: inline thread bodies after shell + first:1 / by-ids (no empty No content).
 *
 *   rstest run -c rstest.e2e.config.ts thread-bodies
 */
import { registerE2eFeature } from '../lib/e2e-register';
import { getSteps } from './thread-bodies.mjs';

registerE2eFeature({
  title: 'e2e / thread-bodies',
  steps: getSteps(),
  timeoutMs: 120_000,
});
