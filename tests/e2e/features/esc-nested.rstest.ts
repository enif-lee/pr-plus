/**
 * E2E: Nested Escape dismisses only the top layer (not PR shell)
 * rstest run -c rstest.e2e.config.ts esc-nested
 */
import { registerE2eFeature } from '../lib/e2e-register';
import { getSteps } from './esc-nested.mjs';

registerE2eFeature({
  title: 'e2e / esc-nested',
  steps: getSteps(),
  timeoutMs: 180_000,
});
