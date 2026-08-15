/**
 * rstest globalTeardown — drop shared browser after all e2e files finish.
 * Also drains any leftover tracked e2e comments (safety net if a feature
 * aborted before its hygiene step).
 */
import {
  cleanupTrackedComments,
  sweepE2eCommentMarks,
} from './comment-cleanup.mjs';
import { dumpGraphqlCostLog } from './harness.mjs';
import { teardownSharedSession } from './session.mjs';

export default async function globalTeardown() {
  try {
    dumpGraphqlCostLog({ label: 'globalTeardown' });
  } catch (e) {
    console.log(
      `[e2e teardown] gql-cost dump soft-fail: ${String(e?.message || e).slice(0, 200)}`
    );
  }
  try {
    cleanupTrackedComments({
      failClosed: false,
      log: (m) => console.log(`[e2e teardown]${m}`),
    });
  } catch (e) {
    console.log(
      `[e2e teardown] tracked cleanup soft-fail: ${String(e?.message || e).slice(0, 200)}`
    );
  }
  try {
    const sweep = sweepE2eCommentMarks({
      log: (m) => console.log(`[e2e teardown]${m}`),
    });
    if (sweep.deleted || sweep.issueHits || sweep.reviewHits) {
      console.log(
        `[e2e teardown] sweep e2e-comment marks: deleted=${sweep.deleted} issueHits=${sweep.issueHits} reviewHits=${sweep.reviewHits}`
      );
    }
  } catch (e) {
    console.log(
      `[e2e teardown] mark sweep soft-fail: ${String(e?.message || e).slice(0, 200)}`
    );
  }
  teardownSharedSession();
}
