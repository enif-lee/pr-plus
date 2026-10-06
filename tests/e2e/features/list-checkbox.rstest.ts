/**
 * E2E group: list-checkbox
 * Run alone: rstest run -c rstest.e2e.config.ts list-checkbox
 */
import { registerE2eFeature } from '../lib/e2e-register';
import { getSteps } from './list-checkbox.mjs';

registerE2eFeature({
  title: 'e2e / list-checkbox',
  steps: getSteps(),
});
