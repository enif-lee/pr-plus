/**
 * E2E group: empty-diff
 * Run alone: rstest run -c rstest.e2e.config.ts empty-diff
 */
import { registerE2eFeature } from '../lib/e2e-register';
import { getSteps } from './empty-diff.mjs';

registerE2eFeature({
  title: 'e2e / empty-diff',
  steps: getSteps(),
});
