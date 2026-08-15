/**
 * Empty-commit PR (0 changed files): Diff must not open via header or ⌥.
 * Control: normal PR still reaches Diff.
 */
import {
  DEMO_PR,
  EMPTY_DIFF_PR,
  assert,
  evalInPage,
  holdChord,
  layout,
  log,
  modalProbe,
  openPr,
  press,
  setLayout,
  waitDetailReady,
  waitMs,
} from '../lib/harness.mjs';

export { EMPTY_DIFF_PR };

function layoutToggleProbe() {
  return evalInPage(`
    (() => {
      const btn = document.querySelector(
        '.prp-header__icon-btn--layout, button[data-prp-diff-unavailable]'
      );
      if (!btn) return { ok: false, reason: 'no-toggle' };
      return {
        ok: true,
        disabled: !!(btn.disabled || btn.getAttribute('aria-disabled') === 'true'),
        unavailable: btn.getAttribute('data-prp-diff-unavailable') === '1',
        dataLayout: btn.getAttribute('data-layout') || null,
        aria: btn.getAttribute('aria-label') || '',
      };
    })()
  `);
}

/**
 * @returns {import('../lib/e2e-register.ts').E2eStep[]}
 */
export function getSteps() {
  /** @type {{ name: string, fn: () => unknown | Promise<unknown> }[]} */
  const steps = [];
  const run = (name, fn) => {
    steps.push({ name, fn });
  };

  run(`ED.1 open empty PR #${EMPTY_DIFF_PR}`, () => {
    openPr(EMPTY_DIFF_PR);
    waitDetailReady(`ED.1 empty PR #${EMPTY_DIFF_PR}`);
    waitMs(400);
    const p = modalProbe();
    assert(p.overlay, 'overlay missing');
    assert(
      p.layout === 'conversation' || layout() === 'conversation',
      `expected conversation on empty PR, layout=${p.layout || layout()}`
    );
  });

  run('ED.2 header Diff toggle disabled / unavailable', () => {
    // Wait for meta (changedFiles: 0) to paint on header control
    let probe = layoutToggleProbe();
    for (let i = 0; i < 40 && !(probe?.unavailable || probe?.disabled); i++) {
      waitMs(150);
      probe = layoutToggleProbe();
    }
    log(`  layout toggle: ${JSON.stringify(probe)}`);
    assert(probe?.ok, `layout toggle missing: ${JSON.stringify(probe)}`);
    assert(
      probe.unavailable || probe.disabled,
      `expected Diff unavailable on empty PR: ${JSON.stringify(probe)}`
    );
    assert(
      probe.disabled,
      `Diff toggle must be disabled: ${JSON.stringify(probe)}`
    );
  });

  run('ED.3 header click and force-toggle stay Conversation', () => {
    // Do not use setLayout('diff') — it asserts success; we expect no-op.
    evalInPage(`
      (() => {
        const btn = document.querySelector('.prp-header__icon-btn--layout');
        if (btn) {
          btn.disabled = false; // even if re-enabled, product must no-op
          btn.click();
        }
        return true;
      })()
    `);
    waitMs(250);
    assert(
      layout() === 'conversation',
      `click toggle must not enter Diff, got ${layout()}`
    );
    // Direct store poke path is not e2e; product entry is onToggleDiff / expandDiff.
    press('Alt+.');
    waitMs(250);
    assert(
      layout() === 'conversation',
      `⌥. after click must still be conversation, got ${layout()}`
    );
  });

  run('ED.4 ⌥. does not enter Diff', () => {
    // Blur composer so global Opt+. can fire
    evalInPage(`
      (() => {
        const ae = document.activeElement;
        if (ae && ae !== document.body) ae.blur?.();
        document.body?.focus?.();
        return true;
      })()
    `);
    waitMs(100);
    holdChord('Alt+.', { holdMs: 200, repeatMs: 80 });
    waitMs(250);
    press('Alt+.');
    waitMs(250);
    assert(
      layout() === 'conversation',
      `⌥. must not open Diff on empty PR, got ${layout()}`
    );
  });

  run(`ED.5 control PR #${DEMO_PR} still opens Diff`, () => {
    openPr(DEMO_PR);
    waitDetailReady(`ED.5 control PR #${DEMO_PR}`);
    waitMs(300);
    setLayout('diff');
    assert(layout() === 'diff', `control PR must enter Diff, got ${layout()}`);
    const probe = layoutToggleProbe();
    log(`  control toggle: ${JSON.stringify(probe)}`);
    assert(
      !probe?.unavailable,
      `control PR must not stamp diff-unavailable: ${JSON.stringify(probe)}`
    );
    assert(
      !probe?.disabled,
      `control PR Diff toggle must be enabled: ${JSON.stringify(probe)}`
    );
  });

  return steps;
}

export async function runEmptyDiff(ctx) {
  const { run } = ctx;
  for (const step of getSteps()) {
    await run(step.name, step.fn);
  }
}
