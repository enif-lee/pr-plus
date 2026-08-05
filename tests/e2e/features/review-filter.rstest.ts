/**
 * E2E group: review-filter
 * Run alone: rstest run -c rstest.e2e.config.ts review-filter
 */
import { registerE2eFeature } from '../lib/e2e-register';
import { getSteps } from './review-filter.mjs';

registerE2eFeature({
  title: 'e2e / review-filter',
  steps: getSteps(),
});
