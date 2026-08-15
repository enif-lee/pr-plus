/**
 * Register agent-browser e2e step lists as rstest suites.
 * Uses a shared browser session for the whole run (see session.mjs + globalSetup).
 */
import { afterAll, beforeAll, describe, test } from '@rstest/core';
import {
  clearGraphqlCostLog,
  dumpGraphqlCostLog,
  log,
} from './harness.mjs';
import { ensureSharedSession } from './session.mjs';

export type E2eStep = {
  name: string;
  fn: () => unknown | Promise<unknown>;
};

export type RegisterFeatureOptions = {
  /** describe title, e.g. `e2e / smoke` */
  title: string;
  /** steps executed in order (shared browser session) */
  steps: E2eStep[];
  /** per-test timeout ms (default 120s) */
  timeoutMs?: number;
  /**
   * Soft-reset shared browser before this suite (clear IDB/session, single tab).
   * Default true. Set false only when chaining into an existing page state.
   */
  resetSession?: boolean;
};

/**
 * Expand ordered e2e steps into a serial rstest describe block.
 * Does not relaunch Chrome per suite — reuses the shared session.
 */
export function registerE2eFeature(opts: RegisterFeatureOptions) {
  const {
    title,
    steps,
    timeoutMs = 120_000,
    resetSession = true,
  } = opts;

  describe(title, () => {
    beforeAll(() => {
      log(`=== ${title} start ===`);
      if (resetSession) {
        ensureSharedSession(title);
      }
      // Fresh GraphQL cost window per suite (observe which ops dominate)
      try {
        clearGraphqlCostLog();
      } catch {
        /* ignore */
      }
    });
    afterAll(() => {
      try {
        dumpGraphqlCostLog({ label: `${title} end` });
      } catch (e) {
        log(
          `  gql-cost dump soft-fail: ${String((e as Error)?.message || e).slice(0, 120)}`
        );
      }
    });
    // No afterAll closeAll — globalTeardown owns browser lifetime.

    for (const step of steps) {
      test(
        step.name,
        async () => {
          await step.fn();
        },
        timeoutMs
      );
    }
  });
}
