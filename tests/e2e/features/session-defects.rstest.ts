/**
 * E2E group: session defect paths (files loading loop, key-hold, labels→timeline,
 * lazy aside idle loading).
 *
 * Run alone:
 *   npm run test:e2e:session-defects
 *   rstest run -c rstest.e2e.config.ts session-defects
 */
import { registerE2eFeature } from '../lib/e2e-register';
import { getSteps } from './session-defects.mjs';

registerE2eFeature({
  title: 'e2e / session-defects',
  steps: getSteps(),
  timeoutMs: 180_000,
});
