/**
 * Conversation timeline category tips e2e
 */
import { registerE2eFeature } from '../lib/e2e-register';
import { buildTimelineTipsSteps } from './timeline-tips.mjs';

registerE2eFeature({
  title: 'e2e / timeline-tips',
  steps: buildTimelineTipsSteps(),
  timeoutMs: 120_000,
});
