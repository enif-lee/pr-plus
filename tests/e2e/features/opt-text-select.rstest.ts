/**
 * E2E group: opt-text-select
 * Run alone: rstest run -c rstest.e2e.config.ts opt-text-select
 */
import { registerE2eFeature } from '../lib/e2e-register';
import { getSteps } from './opt-text-select.mjs';

registerE2eFeature({
  title: 'e2e / opt-text-select',
  steps: getSteps(),
});
