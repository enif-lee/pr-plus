/**
 * E2E group: diff-ui
 * Run alone: npm run test:e2e -- diff-ui
 *          or: rstest run -c rstest.e2e.config.ts diff-ui
 */
import { registerE2eFeature } from '../lib/e2e-register';
import { getSteps } from './diff-ui.mjs';

registerE2eFeature({
  title: "e2e / diff-ui",
  steps: getSteps(),
});
