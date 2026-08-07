/**
 * E2E: UI language preference (ko/en)
 * rstest run -c rstest.e2e.config.ts ui-locale
 */
import { registerE2eFeature } from '../lib/e2e-register';
import { getSteps } from './ui-locale.mjs';

registerE2eFeature({
  title: 'e2e / ui-locale',
  steps: getSteps(),
  timeoutMs: 120_000,
});
