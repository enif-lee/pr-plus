/**
 * Feature e2e modules (one file per product area).
 *
 * Prefer rstest:
 *   npm run test:e2e:features
 *   rstest run -c rstest.e2e.config.ts selection
 *
 * Legacy bag runner kept for ad-hoc scripts.
 */
export { runSmoke, getSteps as getSmokeSteps } from './smoke.mjs';
export {
  runConversationNav,
  getSteps as getConversationNavSteps,
} from './conversation-nav.mjs';
export { runDiffNav, getSteps as getDiffNavSteps } from './diff-nav.mjs';
export { runSelection, getSteps as getSelectionSteps } from './selection.mjs';
export { runDiffUi, getSteps as getDiffUiSteps } from './diff-ui.mjs';
export {
  runMergedChrome,
  getSteps as getMergedChromeSteps,
} from './merged-chrome.mjs';
export {
  runSessionDefects,
  getSteps as getSessionDefectsSteps,
} from './session-defects.mjs';
export {
  getSteps as getMetaBidirectionalSteps,
} from './meta-bidirectional.mjs';
export {
  runResolveThread,
  getSteps as getResolveThreadSteps,
} from './resolve-thread.mjs';
export {
  runThreadBodies,
  getSteps as getThreadBodiesSteps,
} from './thread-bodies.mjs';
export {
  runDetailCache,
  getSteps as getDetailCacheSteps,
} from './detail-cache.mjs';
export {
  getSteps as getTimelineLoadMoreSteps,
  buildTimelineLoadMoreSteps,
} from './timeline-load-more.mjs';
export {
  getSteps as getViewerGesturesSteps,
  runViewerGestures,
} from './viewer-gestures.mjs';
export {
  getSteps as getCopyPrLinkSteps,
  runCopyPrLink,
} from './copy-pr-link.mjs';
export {
  getSteps as getRefreshActionSteps,
  runRefreshAction,
} from './refresh-action.mjs';
export {
  getSteps as getReviewFilterSteps,
  runReviewFilter,
} from './review-filter.mjs';
export {
  getSteps as getUiLocaleSteps,
  runUiLocale,
} from './ui-locale.mjs';
export {
  getSteps as getCommentCopySteps,
  runCommentCopy,
} from './comment-copy.mjs';
export {
  getSteps as getHideQuoteSteps,
  runHideQuote,
} from './hide-quote.mjs';

import { createRunner } from '../lib/runner.mjs';
import { closeAll, ensureBrowser, log } from '../lib/harness.mjs';
import { getSteps as getSmokeSteps } from './smoke.mjs';
import { getSteps as getConversationNavSteps } from './conversation-nav.mjs';
import { getSteps as getDiffNavSteps } from './diff-nav.mjs';
import { getSteps as getSelectionSteps } from './selection.mjs';
import { getSteps as getDiffUiSteps } from './diff-ui.mjs';
import { getSteps as getMergedChromeSteps } from './merged-chrome.mjs';
import { getSteps as getSessionDefectsSteps } from './session-defects.mjs';
import { getSteps as getMetaBidirectionalSteps } from './meta-bidirectional.mjs';
import { getSteps as getResolveThreadSteps } from './resolve-thread.mjs';
import { getSteps as getThreadBodiesSteps } from './thread-bodies.mjs';
import { getSteps as getDetailCacheSteps } from './detail-cache.mjs';
import { getSteps as getTimelineLoadMoreSteps } from './timeline-load-more.mjs';
import { getSteps as getViewerGesturesSteps } from './viewer-gestures.mjs';
import { getSteps as getCopyPrLinkSteps } from './copy-pr-link.mjs';
import { getSteps as getRefreshActionSteps } from './refresh-action.mjs';
import { getSteps as getReviewFilterSteps } from './review-filter.mjs';
import { getSteps as getUiLocaleSteps } from './ui-locale.mjs';
import { getSteps as getCommentCopySteps } from './comment-copy.mjs';
import { getSteps as getHideQuoteSteps } from './hide-quote.mjs';
import { getSteps as getThreadOptReplySteps } from './thread-opt-reply.mjs';

/** Ordered feature suite (shared browser session for legacy runner). */
export const FEATURE_SUITE = [
  { id: 'smoke', getSteps: getSmokeSteps },
  { id: 'conversation-nav', getSteps: getConversationNavSteps },
  { id: 'diff-nav', getSteps: getDiffNavSteps },
  { id: 'selection', getSteps: getSelectionSteps },
  { id: 'diff-ui', getSteps: getDiffUiSteps },
  { id: 'merged-chrome', getSteps: getMergedChromeSteps },
  { id: 'session-defects', getSteps: getSessionDefectsSteps },
  { id: 'meta-bidirectional', getSteps: getMetaBidirectionalSteps },
  { id: 'resolve-thread', getSteps: getResolveThreadSteps },
  { id: 'thread-bodies', getSteps: getThreadBodiesSteps },
  { id: 'detail-cache', getSteps: getDetailCacheSteps },
  { id: 'timeline-load-more', getSteps: getTimelineLoadMoreSteps },
  { id: 'viewer-gestures', getSteps: getViewerGesturesSteps },
  { id: 'copy-pr-link', getSteps: getCopyPrLinkSteps },
  { id: 'refresh-action', getSteps: getRefreshActionSteps },
  { id: 'review-filter', getSteps: getReviewFilterSteps },
  { id: 'ui-locale', getSteps: getUiLocaleSteps },
  { id: 'comment-copy', getSteps: getCommentCopySteps },
  { id: 'hide-quote', getSteps: getHideQuoteSteps },
  { id: 'thread-opt-reply', getSteps: getThreadOptReplySteps },
];

/**
 * @param {{ features?: string[] }} [opts]
 */
export async function runAllFeatures(opts = {}) {
  const allow = opts.features?.length
    ? new Set(opts.features.map(String))
    : null;
  const { run, report, failures } = createRunner();
  log('=== feature suite start (legacy bag) ===');
  ensureBrowser();
  for (const item of FEATURE_SUITE) {
    if (allow && !allow.has(item.id)) {
      log(`  skip feature: ${item.id}`);
      continue;
    }
    log(`--- feature: ${item.id} ---`);
    for (const step of item.getSteps()) {
      await run(step.name, step.fn);
    }
  }
  log('=== feature suite done ===');
  closeAll();
  const r = report('feature-suite');
  return { ...r, failures };
}
