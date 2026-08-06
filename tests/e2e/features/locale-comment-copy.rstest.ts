/**
 * E2E: locale pref + comment body/link copy + deep-link restore
 * rstest run -c rstest.e2e.config.ts locale-comment-copy
 */
import { registerE2eFeature } from '../lib/e2e-register';
import { getSteps } from './locale-comment-copy.mjs';

registerE2eFeature({
  title: 'e2e / locale-comment-copy',
  steps: getSteps(),
  timeoutMs: 180_000,
});
