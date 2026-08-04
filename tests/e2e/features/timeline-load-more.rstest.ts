/**
 * E2E: Conversation timeline pagination (Load more / Load all fold).
 */
import { registerE2eFeature } from '../lib/e2e-register';
import { buildTimelineLoadMoreSteps } from './timeline-load-more.mjs';

registerE2eFeature({
  title: 'e2e / timeline-load-more',
  steps: buildTimelineLoadMoreSteps(),
  timeoutMs: 150_000,
});
