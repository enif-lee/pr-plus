/**
 * E2E group: viewer-gestures (Mermaid/Image fullscreen)
 * Run alone: rstest run -c rstest.e2e.config.ts viewer-gestures
 */
import { registerE2eFeature } from '../lib/e2e-register';
import { getSteps } from './viewer-gestures.mjs';

registerE2eFeature({
  title: 'e2e / viewer-gestures',
  steps: getSteps(),
  timeoutMs: 150_000,
});
