/**
 * E2E: comment body/link copy + GitHub official deep-link restore
 * rstest run -c rstest.e2e.config.ts comment-copy
 */
import { registerE2eFeature } from '../lib/e2e-register';
import { getSteps } from './comment-copy.mjs';

registerE2eFeature({
  title: 'e2e / comment-copy',
  steps: getSteps(),
  timeoutMs: 180_000,
});
