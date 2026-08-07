/**
 * E2E: Finish-review Esc layering + ⌥I + OptBtnHint hosts
 * rstest run -c rstest.e2e.config.ts finish-review
 */
import { registerE2eFeature } from '../lib/e2e-register';
import { getSteps } from './finish-review.mjs';

registerE2eFeature({
  title: 'e2e / finish-review',
  steps: getSteps(),
  timeoutMs: 180_000,
});
