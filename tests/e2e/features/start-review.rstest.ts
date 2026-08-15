/**
 * E2E: Start review → Add comment → Comment hidden → Discard (no submit)
 * rstest run -c rstest.e2e.config.ts start-review
 */
import { registerE2eFeature } from '../lib/e2e-register';
import { getSteps } from './start-review.mjs';

registerE2eFeature({
  title: 'e2e / start-review',
  steps: getSteps(),
  timeoutMs: 180_000,
});
