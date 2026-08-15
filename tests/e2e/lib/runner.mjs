/**
 * Shared e2e feature runner (step bag + failures).
 * Feature modules export `runX(ctx)` and receive `{ run, TICK }`.
 */
import { log, step } from './harness.mjs';

export const TICK = 220;

/**
 * @returns {{
 *   failures: Array<{ name: string, err: Error }>,
 *   run: (name: string, fn: () => unknown | Promise<unknown>) => Promise<void>,
 *   report: (label?: string) => { ok: boolean, failures: typeof failures },
 * }}
 */
export function createRunner() {
  /** @type {Array<{ name: string, err: Error }>} */
  const failures = [];

  /**
   * @param {string} name
   * @param {() => unknown | Promise<unknown>} fn
   */
  const run = async (name, fn) => {
    try {
      await step(name, fn);
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      failures.push({ name, err });
      log(`FAIL: ${name}: ${err.message || err}`);
    }
  };

  /**
   * @param {string} [label]
   */
  const report = (label = 'features') => {
    if (failures.length) {
      console.error(`\n${failures.length} step(s) failed (${label}):`);
      for (const f of failures) {
        console.error(`  - ${f.name}: ${f.err.message || f.err}`);
      }
      return { ok: false, failures };
    }
    console.log(`\n${label}: ALL PASSED`);
    return { ok: true, failures };
  };

  return { failures, run, report };
}
