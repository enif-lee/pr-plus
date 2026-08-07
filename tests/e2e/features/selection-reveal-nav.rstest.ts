/**
 * E2E: selection action-group reveal, ⌥C comment block, ⌥↑/↓ change jump
 * rstest run -c rstest.e2e.config.ts selection-reveal-nav
 */
import { registerE2eFeature } from '../lib/e2e-register';
import { getSteps } from './selection-reveal-nav.mjs';

registerE2eFeature({
  title: 'e2e / selection-reveal-nav',
  steps: getSteps(),
  timeoutMs: 180_000,
});
