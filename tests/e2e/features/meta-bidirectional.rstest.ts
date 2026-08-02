/**
 * E2E group: bidirectional modal ↔ list/detail meta edits
 * (title, description, milestone, assignee, reviewer, emoji reaction).
 *
 * Run alone:
 *   npm run test:e2e:meta-bidirectional
 *   rstest run -c rstest.e2e.config.ts meta-bidirectional
 */
import { registerE2eFeature } from '../lib/e2e-register';
import { getSteps } from './meta-bidirectional.mjs';

registerE2eFeature({
  title: 'e2e / meta-bidirectional',
  steps: getSteps(),
  timeoutMs: 180_000,
});
