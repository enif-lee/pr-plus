/**
 * E2E group: selection
 * Run alone: npm run test:e2e -- selection
 *          or: rstest run -c rstest.e2e.config.ts selection
 */
import { registerE2eFeature } from '../lib/e2e-register';
import { getSteps } from './selection.mjs';

registerE2eFeature({
  title: "e2e / selection",
  steps: getSteps(),
});
