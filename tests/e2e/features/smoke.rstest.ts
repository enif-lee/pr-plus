/**
 * E2E group: smoke
 * Run alone: npm run test:e2e -- smoke
 *          or: rstest run -c rstest.e2e.config.ts smoke
 */
import { registerE2eFeature } from '../lib/e2e-register';
import { getSteps } from './smoke.mjs';

registerE2eFeature({
  title: "e2e / smoke",
  steps: getSteps(),
});
