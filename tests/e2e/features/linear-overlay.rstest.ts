/**
 * E2E: Linear opener-embed via shipped window.PRPlus
 * Fixture: mornica / PR Plus / PRP-2 → enif-lee/pr-plus#19
 * rstest run -c rstest.e2e.config.ts linear-overlay
 * npm run test:e2e:linear
 */
import { registerE2eFeature } from '../lib/e2e-register';
import { getSteps } from './linear-overlay.mjs';

registerE2eFeature({
  title: 'e2e / linear-overlay',
  steps: getSteps(),
  timeoutMs: 180_000,
});
