/**
 * E2E group: merged-chrome
 * Run alone: npm run test:e2e -- merged-chrome
 *          or: rstest run -c rstest.e2e.config.ts merged-chrome
 */
import { registerE2eFeature } from '../lib/e2e-register';
import { getSteps } from './merged-chrome.mjs';

registerE2eFeature({
  title: "e2e / merged-chrome",
  steps: getSteps(),
});
