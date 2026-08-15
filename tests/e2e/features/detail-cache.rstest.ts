/**
 * PR detail cache reuse e2e
 */
import { registerE2eFeature } from '../lib/e2e-register';
import { getSteps } from './detail-cache.mjs';

registerE2eFeature({
  title: 'e2e / detail-cache',
  steps: getSteps(),
  timeoutMs: 120_000,
});
