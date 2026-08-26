/**
 * E2E: only the initiating CTA shows a loading spinner
 * rstest run -c rstest.e2e.config.ts action-busy-loading
 */
import { registerE2eFeature } from '../lib/e2e-register';
import { getSteps } from './action-busy-loading.mjs';

registerE2eFeature({
  title: 'e2e / action-busy-loading',
  steps: getSteps(),
  timeoutMs: 180_000,
});
