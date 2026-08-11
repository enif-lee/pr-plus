/**
 * E2E group: layout-shortcut-isolation
 * Run alone: rstest run -c rstest.e2e.config.ts layout-shortcut-isolation
 */
import { registerE2eFeature } from '../lib/e2e-register';
import { getSteps } from './layout-shortcut-isolation.mjs';

registerE2eFeature({
  title: 'e2e / layout-shortcut-isolation',
  steps: getSteps(),
});
