/**
 * E2E group: perf (key-hold budgets)
 * Run alone: npm run test:e2e:perf
 *         or: rstest run -c rstest.e2e.config.ts perf
 */
import { registerE2eFeature } from './lib/e2e-register';
import { getSteps } from './perf-shortcut-loop.mjs';

registerE2eFeature({
  title: 'e2e / perf',
  steps: getSteps(),
  timeoutMs: 180_000,
});
