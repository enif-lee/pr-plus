/**
 * E2E: Linear opener-embed via shipped window.PRPlus
 * rstest run -c rstest.e2e.config.ts linear-overlay
 */
import { registerE2eFeature } from '../lib/e2e-register';
import { getSteps } from './linear-overlay.mjs';

registerE2eFeature({
  title: 'e2e / linear-overlay',
  steps: getSteps(),
  timeoutMs: 180_000,
});
