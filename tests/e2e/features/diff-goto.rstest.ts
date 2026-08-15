/**
 * E2E group: diff-goto
 * Run alone: rstest run -c rstest.e2e.config.ts diff-goto
 */
import { registerE2eFeature } from '../lib/e2e-register';
import { getSteps } from './diff-goto.mjs';

registerE2eFeature({
  title: 'e2e / diff-goto',
  steps: getSteps(),
});
