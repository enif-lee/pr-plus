/**
 * E2E group: deeplink-layout-ownership
 * Run alone: rstest run -c rstest.e2e.config.ts deeplink-layout-ownership
 */
import { registerE2eFeature } from '../lib/e2e-register';
import { getSteps } from './deeplink-layout-ownership.mjs';

registerE2eFeature({
  title: 'e2e / deeplink-layout-ownership',
  steps: getSteps(),
});
