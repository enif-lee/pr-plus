/**
 * E2E group: list-open-mode
 * Run alone: rstest run -c rstest.e2e.config.ts list-open-mode
 */
import { registerE2eFeature } from '../lib/e2e-register';
import { getSteps } from './list-open-mode.mjs';

registerE2eFeature({
  title: 'e2e / list-open-mode',
  steps: getSteps(),
});
