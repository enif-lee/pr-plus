/**
 * E2E: Diff review-thread Opt root-only, ↑/↓ replies, ⌥I comment
 * rstest run -c rstest.e2e.config.ts thread-opt-reply
 */
import { registerE2eFeature } from '../lib/e2e-register';
import { getSteps } from './thread-opt-reply.mjs';

registerE2eFeature({
  title: 'e2e / thread-opt-reply',
  steps: getSteps(),
  timeoutMs: 180_000,
});
