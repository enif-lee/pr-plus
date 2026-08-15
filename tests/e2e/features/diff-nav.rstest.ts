/**
 * E2E group: diff-nav
 * Run alone: npm run test:e2e -- diff-nav
 *          or: rstest run -c rstest.e2e.config.ts diff-nav
 */
import { registerE2eFeature } from '../lib/e2e-register';
import { getSteps } from './diff-nav.mjs';

registerE2eFeature({
  title: "e2e / diff-nav",
  steps: getSteps(),
});
