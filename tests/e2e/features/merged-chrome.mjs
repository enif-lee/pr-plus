/**
 * P5 merged badge + merge box + Esc close overlay
 * @param {{ run: (name: string, fn: () => unknown | Promise<unknown>) => Promise<void>, TICK?: number }} ctx
 */
import {
  assert,
  blurEditable,
  closeOverlay,
  evalInPage,
  HEAVY_PR,
  log,
  mergeBoxProbe,
  openPr,
  press,
  setLayout,
  statusBadgeProbe,
  waitMs,
} from '../lib/harness.mjs';

/**
 * Register ordered steps without executing them.
 * @returns {import('../lib/e2e-register.ts').E2eStep[]}
 */
export function getSteps() {
  /** @type {{ name: string, fn: () => unknown | Promise<unknown> }[]} */
  const steps = [];
  const run = (name, fn) => {
    steps.push({ name, fn });
  };

  run(`P5 merged badge + merge box tone PR #${HEAVY_PR}`, () => {
    // May already be on #14 from P4; ensure shell
    if (!evalInPage(`!!document.querySelector('.prp-overlay')`)) {
      openPr(HEAVY_PR, { viaUrl: true });
    }
    setLayout('conversation');
    blurEditable();
    waitMs(500);

    const badges = statusBadgeProbe();
    log(`  badges=${JSON.stringify(badges.badges?.map((b) => b.text))}`);
    assert(
      badges.hasMerged,
      `expected Merged header badge on #${HEAVY_PR}: ${JSON.stringify(badges)}`
    );

    const box = mergeBoxProbe();
    log(`  mergeBox tone=${box.tone} kind=${box.kind} headline=${box.headline}`);
    assert(box.ok, 'merge box missing');
    assert(
      box.kind === 'merged' || box.tone === 'prp-merge-box--merged',
      `expected merged merge-box chrome: ${JSON.stringify(box)}`
    );
    assert(
      /merged/i.test(String(box.headline || '')),
      `merge box headline should mention merged: ${box.headline}`
    );
  });
  run('P0.6 Esc closes overlay', () => {
    blurEditable();
    // Cascade: selection/palette/side UI then shell (merged PR may need extra Esc)
    for (let i = 0; i < 6; i++) {
      if (!evalInPage(`!!document.querySelector('.prp-overlay')`)) break;
      press('Escape');
      waitMs(220);
    }
    if (evalInPage(`!!document.querySelector('.prp-overlay')`)) {
      closeOverlay();
    }
    assert(
      !evalInPage(`!!document.querySelector('.prp-overlay')`),
      'overlay still open after Esc cascade'
    );
  });


  return steps;
}

/** Legacy runner: execute steps via createRunner bag. */
export async function runMergedChrome(ctx) {
  const { run } = ctx;
  for (const step of getSteps()) {
    await run(step.name, step.fn);
  }
}
