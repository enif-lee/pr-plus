/**
 * E2E: Refresh PR detail (header, ⌥⇧G, palette)
 * rstest run -c rstest.e2e.config.ts refresh-action
 */
import { registerE2eFeature } from '../lib/e2e-register';
import { getSteps } from './refresh-action.mjs';

registerE2eFeature({
  title: 'e2e / refresh-action',
  steps: getSteps(),
  timeoutMs: 120_000,
});
