/**
 * E2E group: conversation-nav
 * Run alone: npm run test:e2e -- conversation-nav
 *          or: rstest run -c rstest.e2e.config.ts conversation-nav
 */
import { registerE2eFeature } from '../lib/e2e-register';
import { getSteps } from './conversation-nav.mjs';

registerE2eFeature({
  title: "e2e / conversation-nav",
  steps: getSteps(),
});
