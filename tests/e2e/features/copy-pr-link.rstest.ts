/**
 * E2E: copy PR GitHub page URL (header + palette)
 * rstest run -c rstest.e2e.config.ts copy-pr-link
 */
import { registerE2eFeature } from '../lib/e2e-register';
import { getSteps } from './copy-pr-link.mjs';

registerE2eFeature({
  title: 'e2e / copy-pr-link',
  steps: getSteps(),
  timeoutMs: 120_000,
});
