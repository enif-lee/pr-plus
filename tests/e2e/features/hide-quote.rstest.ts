/**
 * E2E: Quote reply + Hide/unhide comment
 * rstest run -c rstest.e2e.config.ts hide-quote
 */
import { registerE2eFeature } from '../lib/e2e-register';
import { getSteps } from './hide-quote.mjs';

registerE2eFeature({
  title: 'e2e / hide-quote',
  steps: getSteps(),
  timeoutMs: 180_000,
});
